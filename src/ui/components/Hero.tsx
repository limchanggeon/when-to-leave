import type { ReactNode } from 'react'
import type { I18nShape } from '../../i18n'

/**
 * 안내판.
 *
 * 이 앱이 답해야 하는 질문은 "몇 시에 나가야 하는가" 하나뿐이라,
 * 판에는 늘 그 답이 걸린다. 아직 물어보지 않았으면 불이 꺼진 자릿수가
 * 걸려 있다 — 대합실 전광판이 다음 차가 정해지기 전에 보여주는 그 모습이라,
 * 설명 문장 없이도 이 자리가 무엇을 위한 자리인지 알 수 있다.
 * 답이 나오면 같은 자리에 같은 크기로 불이 들어온다.
 *
 * 어두운 곳은 화면에서 이 판 하나뿐이다. 예전에는 판 위에 흰 카드를 얹어
 * 검색을 담았는데, 그러면 판이 반으로 잘리고 어느 SaaS 홈이나 같은 모양이 된다.
 * 지금은 검색도 판에 새긴 한 줄이다 — 답과 질의가 같은 판을 쓴다.
 */
export function Hero({
  t,
  headline,
  children,
  aside,
  pending = false,
}: {
  t: I18nShape
  /** 결과가 있으면 그 답. 없으면 빈 칸이 대신 걸린다. */
  headline?: ReactNode
  children: ReactNode
  /** 판 아래에 붙는 것 — 예시와 설명. 답이 걸리면 사라진다. */
  aside?: ReactNode
  /** 계산 중. 꺼진 자릿수를 깜빡여 판이 무언가 하고 있음을 보인다. */
  pending?: boolean
}) {
  return (
    <header
      className={`board ${headline ? 'board--answered' : ''} ${pending ? 'board--pending' : ''}`}
    >
      <div className="board__inner">
        <div className="board__slot">
          {/* 열 머리말 — 괘선 왼쪽에 무슨 시각인지, 오른쪽에 지금 상태.
              이게 없으면 `--:--` 가 출발인지 도착인지 알 수 없다. */}
          <p className="board__head">
            <span>{t.board.slotLabel}</span>
            <span className="board__rule" aria-hidden="true" />
            {!headline && <span className="board__note">{t.board.waiting}</span>}
          </p>

          {headline ?? (
            <p className="board__blank">
              {/* 꺼져 있는 자릿수. LED 안내판은 불이 안 들어온 획도 희미하게
                  비치는데, 그 모습이 그대로 "여기 시각이 들어온다" 는 뜻이다.
                  `--:--` 로 뒀더니 하이픈이 굵은 얼룩으로 뭉쳐 시각으로 안 읽혔다. */}
              <span className="board__blanktime num" aria-hidden="true">
                88:88
              </span>
            </p>
          )}
        </div>

        {/* 답과 질의를 가르는 괘선. 여기 머리말을 하나 더 붙이면 판에 이름표가
            둘이 되는데, 아래는 탭이 이미 무엇을 고르는 자리인지 말하고 있다. */}
        <div className="board__query">{children}</div>
      </div>

      {aside && !headline && <div className="board__aside">{aside}</div>}
    </header>
  )
}
