import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import type { HengoppProject } from '@/models/project'
import { HISTORY_LIMIT, loadProject, saveProject } from './persistence'
import { syncMeasureAttachments } from '@/geometry/measure-attachments'

export type DocRecipe = (draft: Draft<HengoppProject>) => void

export type ProjectStore = {
  doc: HengoppProject
  past: HengoppProject[]
  future: HengoppProject[]
  /** Snapshot taken at beginTransaction(), used for commit/cancel. */
  txnBase: HengoppProject | null
  /** Non-blocking notice about storage problems or recovery. */
  storageNotice: string | null

  /** Apply a document change as exactly one history action. */
  commit: (recipe: DocRecipe) => boolean
  /**
   * Apply a change that is not part of the document history (settings, display
   * unit). The recipe is applied to the history snapshots as well, so undo and
   * redo never revert it.
   */
  patch: (recipe: DocRecipe) => void

  beginTransaction: () => void
  updateTransient: (recipe: DocRecipe) => void
  commitTransaction: () => boolean
  cancelTransaction: () => void

  undo: () => boolean
  redo: () => boolean

  /** Replace the whole document (import, reset) as one history action. */
  replaceDocument: (next: HengoppProject) => void

  setStorageNotice: (notice: string | null) => void
}

const signature = (doc: HengoppProject) => JSON.stringify(doc)

const applyRecipe = (doc: HengoppProject, recipe: DocRecipe) =>
  produce(doc, (draft) => {
    recipe(draft)
    syncMeasureAttachments(draft)
  })

export function docsEqual(a: HengoppProject, b: HengoppProject): boolean {
  return a === b || signature(a) === signature(b)
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(get: () => ProjectStore, set: (partial: Partial<ProjectStore>) => void): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    const { doc, past, future } = get()
    const result = saveProject(doc, { past, future })
    if (!result.ok) set({ storageNotice: result.error })
  }, 120)
}

/** Flush any pending autosave immediately (used on unload and in tests). */
export function flushSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const { doc, past, future } = useProjectStore.getState()
  saveProject(doc, { past, future })
}

const initial = loadProject()

export const useProjectStore = create<ProjectStore>((set, get) => ({
  doc: initial.project,
  past: initial.history.past,
  future: initial.history.future,
  txnBase: null,
  storageNotice: initial.notice,

  commit: (recipe) => {
    const state = get()
    const next = applyRecipe(state.doc, recipe)
    if (docsEqual(state.doc, next)) return false
    set({
      doc: next,
      past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
      future: [],
      txnBase: null,
    })
    scheduleSave(get, set)
    return true
  },

  patch: (recipe) => {
    const state = get()
    const next = applyRecipe(state.doc, recipe)
    if (docsEqual(state.doc, next)) return
    // A patch is not part of the document history, so it must apply to every
    // point in it too. Otherwise undoing an unrelated action would silently
    // revert the display unit or a setting along with it.
    set({
      doc: next,
      past: state.past.map((entry) => applyRecipe(entry, recipe)),
      future: state.future.map((entry) => applyRecipe(entry, recipe)),
      txnBase: state.txnBase ? applyRecipe(state.txnBase, recipe) : null,
    })
    scheduleSave(get, set)
  },

  beginTransaction: () => {
    const state = get()
    if (state.txnBase) return
    set({ txnBase: state.doc })
  },

  updateTransient: (recipe) => {
    const state = get()
    if (!state.txnBase) return
    const next = applyRecipe(state.doc, recipe)
    if (docsEqual(state.doc, next)) return
    set({ doc: next })
  },

  commitTransaction: () => {
    const state = get()
    const base = state.txnBase
    if (!base) return false
    if (docsEqual(base, state.doc)) {
      set({ txnBase: null })
      return false
    }
    set({
      past: [...state.past, base].slice(-HISTORY_LIMIT),
      future: [],
      txnBase: null,
    })
    scheduleSave(get, set)
    return true
  },

  cancelTransaction: () => {
    const state = get()
    if (!state.txnBase) return
    set({ doc: state.txnBase, txnBase: null })
  },

  undo: () => {
    const state = get()
    if (state.past.length === 0) return false
    const previous = state.past[state.past.length - 1]
    set({
      doc: previous,
      past: state.past.slice(0, -1),
      future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
      txnBase: null,
    })
    scheduleSave(get, set)
    return true
  },

  redo: () => {
    const state = get()
    if (state.future.length === 0) return false
    const next = state.future[0]
    set({
      doc: next,
      past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
      future: state.future.slice(1),
      txnBase: null,
    })
    scheduleSave(get, set)
    return true
  },

  replaceDocument: (next) => {
    const state = get()
    if (docsEqual(state.doc, next)) return
    set({
      doc: next,
      past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
      future: [],
      txnBase: null,
    })
    scheduleSave(get, set)
  },

  setStorageNotice: (notice) => set({ storageNotice: notice }),
}))

/** Test helper: reset the store to a known document. */
export function __resetProjectStore(doc: HengoppProject): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  useProjectStore.setState({ doc, past: [], future: [], txnBase: null, storageNotice: null })
}

export const selectDoc = (s: ProjectStore) => s.doc
export const selectCanUndo = (s: ProjectStore) => s.past.length > 0
export const selectCanRedo = (s: ProjectStore) => s.future.length > 0
