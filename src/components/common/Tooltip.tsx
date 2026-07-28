import { useCallback, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type TooltipProps = {
  /** Text shown on hover and keyboard focus. */
  label: ReactNode
  children: ReactElement
}

/**
 * Lightweight tooltip. Shown on mouse hover and on keyboard focus (focus-visible
 * only, so it does not linger after a click or tap).
 */
export function Tooltip({ label, children }: TooltipProps) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const id = useId()

  const show = useCallback(() => {
    const el = wrapperRef.current?.firstElementChild ?? wrapperRef.current
    if (el) setRect(el.getBoundingClientRect())
  }, [])
  const hide = useCallback(() => setRect(null), [])

  return (
    <>
      <span
        ref={wrapperRef}
        style={{ display: 'inline-flex' }}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') show()
        }}
        onPointerLeave={hide}
        onPointerDown={hide}
        onClick={hide}
        onFocusCapture={(e) => {
          // Only for keyboard focus — a click should not leave a tooltip behind.
          if (e.target instanceof HTMLElement && e.target.matches(':focus-visible')) show()
        }}
        onBlurCapture={hide}
      >
        {children}
      </span>
      {rect && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="tooltip"
              id={id}
              role="tooltip"
              style={{
                left: Math.max(6, Math.min(window.innerWidth - 266, rect.left)),
                top: rect.bottom + 6,
              }}
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
