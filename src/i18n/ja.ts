import type { I18nShape } from './ko'

/** 뼈대만. M2a(일본어 UI)에서 채운다 — 설계 문서 "언어" 섹션 참조. */
export const ja: I18nShape = {
  app: {
    title: 'いつ出れば間に合うか',
    tagline: '目的地を伝えると、出発時刻を計算します',
  },
  search: {
    placeholder: '例: 新宿から東京駅まで11時までに',
    submit: '計算する',
    modeArriveBy: '到着時刻を合わせる',
    modeDepartNow: '今すぐ出発したら？',
  },
  result: {
    departAt: (t) => `${t} に出発してください`,
    arriveAt: (t) => `${t} 到着`,
    leaveIn: (m) => `${m} 後に出発`,
    leaveNow: '今すぐ出発',
    overdue: (m) => `${m} 過ぎています`,
    countdownLabel: '出発まで',
    totalDuration: (m) => `合計 ${m}`,
    alreadyLate: '間に合いません — 次の便で再計算しました',
    renegotiated: (t) => `${t} には間に合いません。今すぐ出発すると これが最速です。`,
    buffer: (m) => `余裕時間 ${m}分 込み`,
  },
  clock: {
    tomorrow: '明日',
    dayAfter: '明後日',
    nDays: (n) => `${n}日後`,
  },
  alternatives: {
    title: '代替案',
    subtitle: 'チケットがない・より良い経路がある場合',
    arriveAt: (t) => `${t} 到着`,
    departAt: (t) => `${t} 出発`,
    earlier: (m) => `${m} 早い`,
    later: (m) => `${m} 遅い`,
    same: '同じ時刻',
  },
  empty: {
    title: 'どちらへ行きますか？',
    body: '目的地と到着時刻を伝えると、出発時刻を計算します。',
    examples: 'こう聞いてください',
  },
  leg: {
    walk: '徒歩',
    taxi: 'タクシー',
    subway: '地下鉄',
    bus: 'バス',
    train: '列車',
    flight: '飛行機',
    wait: (m) => `待ち時間 ${m}分`,
  },
  confidence: {
    live: 'リアルタイム',
    scheduled: '計画時刻表',
    estimated: '推定',
  },
  warning: {
    'seat-unknown': 'この便は空席照会ができません',
    'seat-sold-out': '満席 — 代替案をご確認ください',
    'scheduled-only': '計画時刻表に基づいています。実際と異なる場合があります',
    'already-late': '目標時刻までの余裕がありません',
    'no-solution': '条件に合う経路が見つかりませんでした',
  },
  fallback: {
    label: 'チケットがない場合',
    'fallback.station': '別の駅から乗る',
    'fallback.bus': '高速バスに変更',
  } as Record<string, string>,
  dataGap: {
    title: 'データを取得できませんでした',
    'not-implemented': (a) => `${a} アダプターは未接続です`,
    'no-credentials': (a) => `${a} の API キーが設定されていません`,
    'no-data': (a) => `${a} から空の結果が返りました`,
    network: (a) => `${a} に接続できませんでした`,
    'upstream-error': (a) => `${a} がエラーを返しました`,
    retry: '再試行',
  },
  mockBanner: '現在表示中の時刻表はモックデータです。実際の値ではありません。',
}
