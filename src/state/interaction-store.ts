import { create } from 'zustand'
import type { Rect } from '@/geometry/bounds'
import type { SnapGuide } from '@/geometry/snapping'

/** Transient geometry used while dragging/resizing. Never written to history. */
export type PreviewGeometry = { xMm: number; yMm: number; widthMm: number; heightMm: number }

export type InteractionMode = 'idle' | 'drag' | 'resize' | 'marquee' | 'pan'

export type InteractionStore = {
  /** Entity ids (objects or groups) selected at the active group level. */
  selection: string[]
  /** Last selected entity — the reference for alignment. */
  keyId: string | null
  /** Group the user is currently editing inside of (null = root). */
  activeGroupId: string | null
  hoverId: string | null
  /** Touch-friendly multi-select toggle. */
  multiSelectMode: boolean

  mode: InteractionMode
  preview: Record<string, PreviewGeometry>
  guides: { x?: SnapGuide; y?: SnapGuide }
  marquee: Rect | null
  marqueeHits: string[]
  /** True while snapping is suspended (Alt held). */
  snapSuspended: boolean
  spacePanArmed: boolean

  setSelection: (ids: string[], keyId?: string | null) => void
  toggleSelection: (id: string) => void
  addToSelection: (ids: string[], keyId?: string | null) => void
  clearSelection: () => void
  setActiveGroup: (id: string | null) => void
  setHover: (id: string | null) => void
  setMultiSelectMode: (on: boolean) => void

  setMode: (mode: InteractionMode) => void
  setPreview: (preview: Record<string, PreviewGeometry>) => void
  clearPreview: () => void
  setGuides: (guides: { x?: SnapGuide; y?: SnapGuide }) => void
  setMarquee: (rect: Rect | null, hits?: string[]) => void
  setSnapSuspended: (on: boolean) => void
  setSpacePanArmed: (on: boolean) => void
  endInteraction: () => void
}

export const useInteractionStore = create<InteractionStore>((set, get) => ({
  selection: [],
  keyId: null,
  activeGroupId: null,
  hoverId: null,
  multiSelectMode: false,

  mode: 'idle',
  preview: {},
  guides: {},
  marquee: null,
  marqueeHits: [],
  snapSuspended: false,
  spacePanArmed: false,

  setSelection: (ids, keyId) =>
    set({ selection: ids, keyId: keyId !== undefined ? keyId : (ids[ids.length - 1] ?? null) }),

  toggleSelection: (id) => {
    const { selection } = get()
    if (selection.includes(id)) {
      const next = selection.filter((s) => s !== id)
      set({ selection: next, keyId: next[next.length - 1] ?? null })
    } else {
      set({ selection: [...selection, id], keyId: id })
    }
  },

  addToSelection: (ids, keyId) => {
    const { selection } = get()
    const next = [...selection]
    for (const id of ids) if (!next.includes(id)) next.push(id)
    set({ selection: next, keyId: keyId !== undefined ? keyId : (next[next.length - 1] ?? null) })
  },

  clearSelection: () => set({ selection: [], keyId: null }),

  setActiveGroup: (id) => set({ activeGroupId: id, selection: [], keyId: null }),

  setHover: (id) => {
    if (get().hoverId !== id) set({ hoverId: id })
  },

  setMultiSelectMode: (on) => set({ multiSelectMode: on }),

  setMode: (mode) => set({ mode }),
  setPreview: (preview) => set({ preview }),
  clearPreview: () => set({ preview: {} }),
  setGuides: (guides) => set({ guides }),
  setMarquee: (rect, hits = []) => set({ marquee: rect, marqueeHits: hits }),
  setSnapSuspended: (on) => set({ snapSuspended: on }),
  setSpacePanArmed: (on) => set({ spacePanArmed: on }),

  endInteraction: () => set({ mode: 'idle', preview: {}, guides: {}, marquee: null, marqueeHits: [] }),
}))

export const selectPreviewFor = (id: string) => (s: InteractionStore) => s.preview[id]
