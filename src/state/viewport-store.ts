import { create } from 'zustand'
import {
  clampZoom,
  fitViewport,
  panBy,
  zoomAround,
  type Point,
  type Viewport,
} from '@/geometry/coordinates'

export type ViewportStore = {
  viewport: Viewport
  /** Scale at which the surface exactly fits the view — the 100 % reference. */
  baseScale: number
  viewWidth: number
  viewHeight: number

  setViewSize: (width: number, height: number) => void
  setViewport: (viewport: Viewport) => void
  zoomAt: (point: Point, factor: number) => void
  zoomBy: (factor: number) => void
  setZoomPercent: (percent: number) => void
  pan: (dxPx: number, dyPx: number) => void
  fitToSurface: (widthMm: number, heightMm: number) => void
}

const INITIAL: Viewport = { scale: 0.2, offsetX: 0, offsetY: 0 }

export const useViewportStore = create<ViewportStore>((set, get) => ({
  viewport: INITIAL,
  baseScale: INITIAL.scale,
  viewWidth: 800,
  viewHeight: 600,

  setViewSize: (width, height) => set({ viewWidth: width, viewHeight: height }),

  setViewport: (viewport) => set({ viewport }),

  zoomAt: (point, factor) => {
    const { viewport, baseScale } = get()
    const next = clampZoom(viewport.scale * factor, baseScale)
    if (next === viewport.scale) return
    set({ viewport: zoomAround(viewport, point, next) })
  },

  zoomBy: (factor) => {
    const { viewWidth, viewHeight } = get()
    get().zoomAt({ x: viewWidth / 2, y: viewHeight / 2 }, factor)
  },

  setZoomPercent: (percent) => {
    const { viewport, baseScale, viewWidth, viewHeight } = get()
    const target = clampZoom((percent / 100) * baseScale, baseScale)
    if (target === viewport.scale) return
    set({ viewport: zoomAround(viewport, { x: viewWidth / 2, y: viewHeight / 2 }, target) })
  },

  pan: (dxPx, dyPx) => set({ viewport: panBy(get().viewport, dxPx, dyPx) }),

  fitToSurface: (widthMm, heightMm) => {
    const { viewWidth, viewHeight } = get()
    const viewport = fitViewport(widthMm, heightMm, viewWidth, viewHeight)
    set({ viewport, baseScale: viewport.scale })
  },
}))
