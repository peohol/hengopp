import { Modal } from '@/components/common/Modal'
import { useUiStore } from '@/state/ui-store'

export function ConfirmDialog() {
  const confirm = useUiStore((s) => s.confirm)
  const close = useUiStore((s) => s.closeConfirm)
  if (!confirm) return null

  return (
    <Modal
      title={confirm.title}
      narrow
      onClose={close}
      testId="confirm-dialog"
      footer={
        <>
          <button type="button" className="btn" data-testid="confirm-cancel" onClick={close}>
            Avbryt
          </button>
          <button
            type="button"
            className={`btn ${confirm.danger ? 'btn--danger' : 'btn--primary'}`}
            data-testid="confirm-ok"
            onClick={() => {
              confirm.onConfirm()
              close()
            }}
          >
            {confirm.confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, lineHeight: 1.5 }}>{confirm.message}</p>
    </Modal>
  )
}
