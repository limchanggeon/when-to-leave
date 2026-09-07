import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { I18nShape } from '../../i18n'

/**
 * 무료 조회를 다 쓴 사람에게 로그인을 권하는 창.
 *
 * **조회를 돌린 뒤에 가리지 않는다.** 결과를 계산해 놓고 덮으면 볼 수 없는
 * 답을 만드느라 카카오·TAGO 를 부르는 셈이고, 사람은 기다린 끝에 담을
 * 만난다. 누르는 즉시 여기로 온다.
 *
 * 닫을 수 있게 둔다. 못 닫는 창은 뒤로 가기를 누르게 만들 뿐이고,
 * 다시 조회하면 어차피 또 만난다.
 */
export function SignUpWall({
  open,
  onClose,
  t,
}: {
  open: boolean
  onClose: () => void
  t: I18nShape
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const w = t.wall

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog className="wall" ref={ref} onClose={onClose} aria-labelledby="wall-title">
      <div className="wall__body">
        <h2 className="wall__title" id="wall-title">
          {w.title}
        </h2>
        <p className="wall__lead">{w.lead}</p>

        <ul className="wall__perks">
          {w.perks.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>

        <div className="wall__acts">
          <Link className="wall__go" to="/login">
            {w.login}
          </Link>
          <button type="button" className="wall__later" onClick={onClose}>
            {w.later}
          </button>
        </div>
      </div>
    </dialog>
  )
}
