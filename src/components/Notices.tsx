import { useUiStore } from '@/state/ui-store'

export function Notices() {
  const notices = useUiStore((s) => s.notices)
  const dismiss = useUiStore((s) => s.dismissNotice)
  if (notices.length === 0) return null

  return (
    <div className="notices" role="status" aria-live="polite" data-testid="notices">
      {notices.map((notice) => (
        <div key={notice.id} className={`notice notice--${notice.kind}`} data-testid="notice">
          <span>{notice.message}</span>
          <span className="notice__spacer" />
          {notice.actionLabel && notice.onAction ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                notice.onAction?.()
                dismiss(notice.id)
              }}
            >
              {notice.actionLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--ghost"
            aria-label="Lukk melding"
            data-testid="notice-dismiss"
            onClick={() => dismiss(notice.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
