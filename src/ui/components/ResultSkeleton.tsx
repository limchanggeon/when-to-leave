/**
 * 계산 중 자리를 지키는 뼈대.
 *
 * 결과가 들어올 모양을 미리 보여주면 기다리는 느낌이 덜하고,
 * 결과가 나타날 때 화면이 덜 튄다.
 *
 * 답의 자리는 여기 두지 않는다 — 판이 이미 들고 있고, 거기서 꺼진 자릿수가
 * 깜빡이고 있다. 가짜 답 상자를 하나 더 두면 답이 어디 걸리는지 흐려진다.
 */
export function ResultSkeleton() {
  return (
    <div className="skeleton" aria-hidden="true">
      <div className="skeleton__columns">
        <div className="skeleton__main">
          {[0, 1, 2, 3].map((i) => (
            <div className="skeleton__row" key={i}>
              <div className="sk sk--clock" />
              <div className="sk sk--dot" />
              <div className="skeleton__rowbody">
                <div className="sk sk--line" style={{ width: '45%' }} />
                <div className="sk sk--line" style={{ width: '30%' }} />
              </div>
            </div>
          ))}
        </div>
        <div className="skeleton__side">
          <div className="sk sk--map" />
        </div>
      </div>
    </div>
  )
}
