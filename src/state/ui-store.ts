import { create } from 'zustand'
import { createId } from '@/utils/ids'

export type NoticeKind = 'info' | 'warning' | 'error'

export type Notice = {
  id: string
  kind: NoticeKind
  message: string
  /** Optional action rendered inside the notice. */
  actionLabel?: string
  onAction?: () => void
}

export type ObjectDialogState =
  | { mode: 'create' }
  | { mode: 'edit'; objectId: string }
  | null

export type ConfirmState = {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
} | null

export type UiStore = {
  objectDialog: ObjectDialogState
  setupDialogOpen: boolean
  helpOpen: boolean
  confirm: ConfirmState
  notices: Notice[]

  openObjectDialog: (state: NonNullable<ObjectDialogState>) => void
  closeObjectDialog: () => void
  setSetupDialogOpen: (open: boolean) => void
  setHelpOpen: (open: boolean) => void
  askConfirm: (state: NonNullable<ConfirmState>) => void
  closeConfirm: () => void
  notify: (kind: NoticeKind, message: string, extra?: Pick<Notice, 'actionLabel' | 'onAction'>) => string
  dismissNotice: (id: string) => void
}

export const useUiStore = create<UiStore>((set, get) => ({
  objectDialog: null,
  setupDialogOpen: false,
  helpOpen: false,
  confirm: null,
  notices: [],

  openObjectDialog: (state) => set({ objectDialog: state }),
  closeObjectDialog: () => set({ objectDialog: null }),
  setSetupDialogOpen: (open) => set({ setupDialogOpen: open }),
  setHelpOpen: (open) => set({ helpOpen: open }),
  askConfirm: (state) => set({ confirm: state }),
  closeConfirm: () => set({ confirm: null }),

  notify: (kind, message, extra) => {
    const id = createId('ntc')
    // Never stack duplicates of the same message.
    const existing = get().notices.find((n) => n.message === message)
    if (existing) return existing.id
    set({ notices: [...get().notices, { id, kind, message, ...extra }] })
    return id
  },

  dismissNotice: (id) => set({ notices: get().notices.filter((n) => n.id !== id) }),
}))
