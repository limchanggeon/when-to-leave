import type { SavedPlace } from '../../auth/me'
import type { I18nShape } from '../../i18n'

/**
 * 저장한 장소로 바로 경로를 짜는 줄.
 *
 * 예전에는 이 자리에 네비줄이 있었는데, 링크 세 개가 목적지 두 곳을
 * 가리키고 "어떻게 동작하나" 까지 있어서 사실상 채우기였다.
 * 매일 쓰는 도구의 맨 윗줄은 한 번 눌러 답이 나오는 자리여야 한다.
 *
 * 저장한 곳이 없으면 줄 자체를 만들지 않는다 — 빈 껍데기를 남기지 않는다.
 */
export function QuickRoutes({
  places,
  t,
  onPick,
  ready,
}: {
  places: SavedPlace[]
  t: I18nShape
  onPick: (place: SavedPlace) => void
  /** 출발지가 정해졌는지. 아니면 눌러도 서버가 거절한다. */
  ready: boolean
}) {
  if (places.length === 0) return null

  return (
    <div className="quickrow">
      <div className="quickrow__inner">
        <span className="quickrow__label">{t.quickRoutes.label}</span>
        {places.map((place) => (
          <button
            key={place.id}
            type="button"
            className="quickrow__item"
            onClick={() => onPick(place)}
            title={ready ? place.name : t.quickRoutes.needOrigin}
            disabled={!ready}
          >
            {t.quickRoutes.toPlace(place.label)}
          </button>
        ))}
        {!ready && <span className="quickrow__note">{t.quickRoutes.needOrigin}</span>}
      </div>
    </div>
  )
}
