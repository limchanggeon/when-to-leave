/**
 * 계산 중 자리를 지키는 뼈대.
 *
 * 버튼만 "계산 중…" 으로 바뀌면 화면이 멈춘 것처럼 보인다.
 * 결과가 들어올 모양을 미리 보여주면 기다리는 느낌이 덜하고,
 * 결과가 나타날 때 화면이 덜 튄다.
 */
export function ResultSkeleton() {
  return (
    <div className="skeleton" aria-hidden="true">
      <div className="skeleton__verdict">
        <div className="sk sk--title" />
        <div className="sk sk--line" />
      </div>
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
