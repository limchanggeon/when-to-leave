#!/usr/bin/env python3
"""
GTFS データリポジトリ(gtfs-data.jp) 전체 피드 일괄 다운로드 + 정류장별 운행 편수 집계

사용법
    pip install requests pandas geopandas pyogrio
    python gtfs_stop_frequency.py                     # 전체 피드
    python gtfs_stop_frequency.py --pref 13 14        # 특정 도도부현만 (JIS 코드)
    python gtfs_stop_frequency.py --limit 20          # 테스트용 20개만
    python gtfs_stop_frequency.py --base-date 2026-10-01

출력 (out 폴더)
    stop_frequency.csv / .gpkg : 정류장(표주)별 평일·토요일·일요일 운행 편수
    feed_summary.csv           : 피드별 집계 기준일, 정류장·편수 합계
    errors.csv                 : 처리 실패 피드와 사유

집계 방식
    - 피드마다 유효기간 안에서 기준일 이후 첫 수요일/토요일/일요일을 대표일로 선택
    - calendar.txt(요일 플래그) + calendar_dates.txt(추가=1, 삭제=2)로 그날 운행 service_id 결정
    - 편수 = 해당 정류장에서 '승차 가능한 출발' 수
      (각 trip의 마지막 정류장, pickup_type=1(승차 불가)은 제외)
"""
import argparse, io, os, sys, zipfile, datetime as dt
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd
import requests

API = "https://api.gtfs-data.jp/v2/files"
DAYS = {"weekday": 2, "saturday": 5, "sunday": 6}   # 대표일: 수(2)·토(5)·일(6)
WEEKDAY_COL = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


# ---------- 다운로드 ----------
def list_feeds():
    r = requests.get(API, timeout=60)
    r.raise_for_status()
    return r.json()["body"]


def download(feed, cache_dir):
    path = os.path.join(cache_dir, f"{feed['organization_id']}__{feed['feed_id']}__{feed['file_uid']}.zip")
    if os.path.exists(path) and zipfile.is_zipfile(path):
        return path
    r = requests.get(feed["file_url"], timeout=180)   # S3로 302 리다이렉트 → requests가 자동 추적
    r.raise_for_status()
    with open(path + ".part", "wb") as f:
        f.write(r.content)
    os.replace(path + ".part", path)
    return path


# ---------- GTFS 읽기 ----------
def read_txt(zf, name):
    base = name.rsplit(".", 1)[0]
    cands = [n for n in zf.namelist() if n.split("/")[-1] == name] or \
            [n for n in zf.namelist() if n.split("/")[-1] == base + ".csv"]   # 확장자를 .csv로 올린 피드 대응
    if not cands:
        return None
    raw = zf.read(cands[0])
    for enc in ("utf-8-sig", "cp932"):
        try:
            return pd.read_csv(io.BytesIO(raw), dtype=str, encoding=enc, keep_default_na=False)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"{name}: 인코딩 판별 실패")


def to_date(s):
    return dt.datetime.strptime(str(s).strip(), "%Y%m%d").date()


def active_services(cal, cal_dates, day):
    services = set()
    if cal is not None and len(cal):
        c = cal.copy()
        c.columns = c.columns.str.strip()
        ok = (c["start_date"].map(to_date) <= day) & (c["end_date"].map(to_date) >= day) \
             & (c[WEEKDAY_COL[day.weekday()]].str.strip() == "1")
        services |= set(c.loc[ok, "service_id"])
    if cal_dates is not None and len(cal_dates):
        d = cal_dates[cal_dates["date"].str.strip() == day.strftime("%Y%m%d")]
        services |= set(d.loc[d["exception_type"].str.strip() == "1", "service_id"])
        services -= set(d.loc[d["exception_type"].str.strip() == "2", "service_id"])
    return services


def pick_day(start, end, target_wd):
    d = start
    for _ in range(14):
        if d > end:
            return None
        if d.weekday() == target_wd:
            return d
        d += dt.timedelta(days=1)
    return None


# ---------- 피드 1개 처리 ----------
def process(feed, zpath, base_date):
    with zipfile.ZipFile(zpath) as zf:
        stops = read_txt(zf, "stops.txt")
        trips = read_txt(zf, "trips.txt")
        st = read_txt(zf, "stop_times.txt")
        cal = read_txt(zf, "calendar.txt")
        cal_dates = read_txt(zf, "calendar_dates.txt")
    if stops is None or trips is None or st is None:
        raise ValueError("stops/trips/stop_times 누락")
    if "stop_id" not in st.columns:
        raise ValueError("GTFS-Flex(구역형 디맨드 교통) — 정류장 단위 시각표 없음, 집계 제외")

    # 승차 가능한 출발만: 마지막 정류장·pickup_type=1 제외
    st["stop_sequence"] = pd.to_numeric(st["stop_sequence"], errors="coerce")
    last_seq = st.groupby("trip_id")["stop_sequence"].transform("max")
    board = st[st["stop_sequence"] < last_seq]
    if "pickup_type" in board.columns:
        board = board[board["pickup_type"].str.strip() != "1"]
    board = board.merge(trips[["trip_id", "service_id", "route_id"]], on="trip_id", how="left")

    start = max(to_date(feed["file_from_date"].replace("-", "")), base_date)
    end = to_date(feed["file_to_date"].replace("-", ""))

    out = stops[["stop_id", "stop_name", "stop_lat", "stop_lon"]
                + [c for c in ("parent_station", "location_type") if c in stops.columns]].copy()
    if "location_type" in out.columns:           # 승강장(0/공백)만 남기고 역(1) 등은 제외
        out = out[out["location_type"].str.strip().isin(["", "0"])]
    days_used = {}
    for label, wd in DAYS.items():
        day = pick_day(start, end, wd)
        days_used[label] = day.isoformat() if day else ""
        if day is None:
            out[f"trips_{label}"] = pd.NA
            continue
        svc = active_services(cal, cal_dates, day)
        cnt = board[board["service_id"].isin(svc)].groupby("stop_id").size()
        out[f"trips_{label}"] = out["stop_id"].map(cnt).fillna(0).astype(int)
    n_routes = board.groupby("stop_id")["route_id"].nunique()
    out["n_routes"] = out["stop_id"].map(n_routes).fillna(0).astype(int)

    for k in ("organization_id", "organization_name", "feed_id", "feed_name", "feed_pref_id",
              "feed_license_id", "file_uid"):
        out[k] = feed[k]
    out["stop_lat"] = pd.to_numeric(out["stop_lat"], errors="coerce")
    out["stop_lon"] = pd.to_numeric(out["stop_lon"], errors="coerce")

    summary = {k: feed[k] for k in ("organization_id", "feed_id", "feed_name", "feed_pref_id",
                                    "file_from_date", "file_to_date")}
    summary.update({f"date_{k}": v for k, v in days_used.items()})
    summary["n_stops"] = len(out)
    for label in DAYS:
        summary[f"sum_trips_{label}"] = pd.to_numeric(out[f"trips_{label}"], errors="coerce").sum()
    return out, summary


# ---------- main ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="gtfs_jp")
    ap.add_argument("--pref", nargs="*", type=int, help="도도부현 코드 (예: 13 14)")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--base-date", default=dt.date.today().isoformat(),
                    help="이 날짜 이후의 대표일로 집계 (YYYY-MM-DD)")
    ap.add_argument("--no-gpkg", action="store_true")
    a = ap.parse_args()

    base_date = dt.date.fromisoformat(a.base_date)
    cache = os.path.join(a.out, "feeds")
    os.makedirs(cache, exist_ok=True)

    feeds = list_feeds()
    if a.pref:
        feeds = [f for f in feeds if f["feed_pref_id"] in a.pref]
    if a.limit:
        feeds = feeds[: a.limit]
    print(f"피드 {len(feeds)}개 처리 시작")

    paths, errors = {}, []
    with ThreadPoolExecutor(a.workers) as ex:
        futs = {ex.submit(download, f, cache): f for f in feeds}
        for i, fu in enumerate(as_completed(futs), 1):
            f = futs[fu]
            try:
                paths[f["file_uid"]] = fu.result()
            except Exception as e:
                errors.append({"feed": f"{f['organization_id']}/{f['feed_id']}", "stage": "download", "error": str(e)})
            if i % 50 == 0 or i == len(feeds):
                print(f"  다운로드 {i}/{len(feeds)}")

    results, summaries = [], []
    for i, f in enumerate(feeds, 1):
        if f["file_uid"] not in paths:
            continue
        try:
            df, s = process(f, paths[f["file_uid"]], base_date)
            results.append(df); summaries.append(s)
        except Exception as e:
            errors.append({"feed": f"{f['organization_id']}/{f['feed_id']}", "stage": "parse", "error": repr(e)})
        if i % 50 == 0 or i == len(feeds):
            print(f"  집계 {i}/{len(feeds)}")

    res = pd.concat(results, ignore_index=True)
    res.to_csv(os.path.join(a.out, "stop_frequency.csv"), index=False, encoding="utf-8-sig")
    pd.DataFrame(summaries).to_csv(os.path.join(a.out, "feed_summary.csv"), index=False, encoding="utf-8-sig")
    pd.DataFrame(errors, columns=["feed", "stage", "error"]).to_csv(
        os.path.join(a.out, "errors.csv"), index=False, encoding="utf-8-sig")

    if not a.no_gpkg:
        import geopandas as gpd
        g = res.dropna(subset=["stop_lat", "stop_lon"])
        gdf = gpd.GeoDataFrame(g, geometry=gpd.points_from_xy(g["stop_lon"], g["stop_lat"]), crs="EPSG:4326")
        gdf.to_file(os.path.join(a.out, "stop_frequency.gpkg"), driver="GPKG")

    print(f"완료: 정류장 {len(res):,}개 / 성공 피드 {len(summaries)} / 실패 {len(errors)} → {a.out}/")


if __name__ == "__main__":
    main()
