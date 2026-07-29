import { create } from 'zustand'
import type { GuideAxis } from '@/models/guide'
import type { Rect } from '@/geometry/bounds'
import type { SnapGuide } from '@/geometry/snapping'

/** Transient geometry used while dragging/resizing. Never written to history. */
export type PreviewGeometry = { xMm: number; yMm: number; widthMm: number; heightMm: number }

export type InteractionMode = 'idle' | 'drag' | 'resize' | 'marquee' | 'pan' | 'guide' | 'measure'

/** Which tool the canvas is in. `measure` draws measuring lines instead. */
export type ToolId = 'select' | 'measure'

/** Guide line previewed under the pointer while a ruler is hovered. */
export type GuidePreview = { axis: GuideAxis; posMm: number }

/**
 * Endpoints of the measuring line currently being drawn — or, when `editingId`
 * is set, the live shape of an existing line whose end is being dragged. The
 * real line is hidden while its draft stands in for it.
 */
export type MeasureDraft = {
  x1Mm: number
  y1Mm: number
  x2Mm: number
  y2Mm: number
  editingId?: string
}

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

  tool: ToolId
  mode: InteractionMode
  preview: Record<string, PreviewGeometry>
  guides: { x?: SnapGuide; y?: SnapGuide }
  marquee: Rect | null
  marqueeHits: string[]
  /** True while snapping is suspended (Alt held). */
  snapSuspended: boolean
  spacePanArmed: boolean

  /** Guide line previewed while a ruler is hovered, before the click. */
  guidePreview: GuidePreview | null
  hoverGuideId: string | null
  /** Guide last touched. Gives touch users the highlight hovering would. */
  activeGuideId: string | null
  /** Live position of the guide being dragged. */
  guideDrag: { id: string; posMm: number } | null

  hoverMeasureId: string | null
  measureDraft: MeasureDraft | null
  /** Live position of the ruler zero point being dragged. */
  originDrag: { axis: GuideAxis; posMm: number } | null
  /**
   * Objects an active snap is currently locked onto. Their handles and anchor
   * are drawn so the user can see what else the point could snap to.
   */
  snapObjectIds: string[]
  /** True while Ctrl/Cmd is held: arms deletion of a hovered measuring line. */
  deleteArmed: boolean

  setSelection: (ids: string[], keyId?: string | null) => void
  toggleSelection: (id: string) => void
  addToSelection: (ids: string[], keyId?: string | null) => void
  clearSelection: () => void
  setActiveGroup: (id: string | null) => void
  setHover: (id: string | null) => void
  setMultiSelectMode: (on: boolean) => void

  setTool: (tool: ToolId) => void
  setMode: (mode: InteractionMode) => void
  setPreview: (preview: Record<string, PreviewGeometry>) => void
  clearPreview: () => void
  setGuides: (guides: { x?: SnapGuide; y?: SnapGuide }) => void
  setMarquee: (rect: Rect | null, hits?: string[]) => void
  setSnapSuspended: (on: boolean) => void
  setSpacePanArmed: (on: boolean) => void

  setGuidePreview: (preview: GuidePreview | null) => void
  setHoverGuide: (id: string | null) => void
  setActiveGuide: (id: string | null) => void
  setGuideDrag: (drag: { id: string; posMm: number } | null) => void
  setHoverMeasure: (id: string | null) => void
  setMeasureDraft: (draft: MeasureDraft | null) => void
  setOriginDrag: (drag: { axis: GuideAxis; posMm: number } | null) => void
  setSnapObjectIds: (ids: string[]) => void
  setDeleteArmed: (on: boolean) => void

  endInteraction: () => void
}

export const useInteractionStore = create<InteractionStore>((set, get) => ({
  selection: [],
  keyId: null,
  activeGroupId: null,
  hoverId: null,
  multiSelectMode: false,

  tool: 'select',
  mode: 'idle',
  preview: {},
  guides: {},
  marquee: null,
  marqueeHits: [],
  snapSuspended: false,
  spacePanArmed: false,

  guidePreview: null,
  hoverGuideId: null,
  activeGuideId: null,
  guideDrag: null,

  hoverMeasureId: null,
  measureDraft: null,
  originDrag: null,
  snapObjectIds: [],
  deleteArmed: false,

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

  // Switching tools drops the other tool's transient affordances, so nothing
  // from the previous mode lingers over the new one.
  setTool: (tool) => {
    if (get().tool === tool) return
    set({ tool, hoverMeasureId: null, measureDraft: null, guidePreview: null })
  },

  setMode: (mode) => set({ mode }),
  setPreview: (preview) => set({ preview }),
  clearPreview: () => set({ preview: {} }),
  setGuides: (guides) => set({ guides }),
  setMarquee: (rect, hits = []) => set({ marquee: rect, marqueeHits: hits }),
  setSnapSuspended: (on) => set({ snapSuspended: on }),
  setSpacePanArmed: (on) => set({ spacePanArmed: on }),

  setGuidePreview: (preview) => {
    const current = get().guidePreview
    if (current === preview) return
    if (current && preview && current.axis === preview.axis && current.posMm === preview.posMm) return
    set({ guidePreview: preview })
  },
  setHoverGuide: (id) => {
    if (get().hoverGuideId !== id) set({ hoverGuideId: id })
  },
  setActiveGuide: (id) => set({ activeGuideId: id }),
  setGuideDrag: (drag) => set({ guideDrag: drag }),
  setHoverMeasure: (id) => {
    if (get().hoverMeasureId !== id) set({ hoverMeasureId: id })
  },
  setMeasureDraft: (draft) => set({ measureDraft: draft }),
  setOriginDrag: (drag) => set({ originDrag: drag }),
  setSnapObjectIds: (ids) => {
    const current = get().snapObjectIds
    if (current.length === ids.length && current.every((id, i) => id === ids[i])) return
    set({ snapObjectIds: ids })
  },
  setDeleteArmed: (on) => {
    if (get().deleteArmed !== on) set({ deleteArmed: on })
  },

  endInteraction: () =>
    set({
      mode: 'idle',
      preview: {},
      guides: {},
      marquee: null,
      marqueeHits: [],
      guideDrag: null,
      measureDraft: null,
      originDrag: null,
      snapObjectIds: [],
    }),
}))

export const selectPreviewFor = (id: string) => (s: InteractionStore) => s.preview[id]
