import { useEffect, useRef, useState } from 'react'
import { fitViewport } from '@/geometry/coordinates'
import { selectableEntityFor } from '@/geometry/groups'
import { useProjectStore } from '@/state/project-store'
import { useInteractionStore } from '@/state/interaction-store'
import { useViewportStore } from '@/state/viewport-store'
import { SurfaceLayer } from './SurfaceLayer'
import { ObjectsLayer } from './ObjectsLayer'
import { OverlayLayer } from './OverlayLayer'
import { CanvasRulers, RULER_SIZE, RULER_SIZE_COARSE } from './Rulers'
import { useCanvasInteractions } from './useCanvasInteractions'

/** Touch devices need fatter hit areas, and have no hover to lean on. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true,
  )
  useEffect(() => {
    const query = window.matchMedia?.('(pointer: coarse)')
    if (!query) return
    const apply = () => setCoarse(query.matches)
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])
  return coarse
}

/**
 * The canvas and its four rulers. Every ruler shares a grid track with the
 * canvas, so screen coordinates line up across them without any extra maths.
 */
export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const didFitRef = useRef(false)
  const coarsePointer = useCoarsePointer()

  const doc = useProjectStore((s) => s.doc)
  const viewport = useViewportStore((s) => s.viewport)
  const mode = useInteractionStore((s) => s.mode)
  const tool = useInteractionStore((s) => s.tool)
  const spacePanArmed = useInteractionStore((s) => s.spacePanArmed)

  const handlers = useCanvasInteractions(svgRef)

  // Track the view size and keep the 100 % reference scale in sync.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const apply = () => {
      const rect = el.getBoundingClientRect()
      const store = useViewportStore.getState()
      store.setViewSize(rect.width, rect.height)
      if (!didFitRef.current && rect.width > 0 && rect.height > 0) {
        didFitRef.current = true
        store.fitToSurface(doc.surface.widthMm, doc.surface.heightMm)
      } else {
        const base = fitViewport(doc.surface.widthMm, doc.surface.heightMm, rect.width, rect.height)
        useViewportStore.setState({ baseScale: base.scale })
      }
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [doc.surface.widthMm, doc.surface.heightMm])

  const className = [
    'canvas',
    mode === 'pan' ? 'is-panning' : '',
    spacePanArmed && mode !== 'pan' ? 'is-pan-ready' : '',
    tool === 'measure' ? 'is-measuring' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const rulerSize = coarsePointer ? RULER_SIZE_COARSE : RULER_SIZE

  return (
    <div
      className="canvas-frame"
      data-testid="canvas-frame"
      // One source of truth for the ruler thickness: the grid tracks and the
      // ruler drawings both read it from here.
      style={{ ['--ruler' as string]: `${rulerSize}px` }}
    >
      <CanvasRulers sizePx={rulerSize} />
      <div className="workspace" ref={containerRef} data-testid="workspace">
        <svg
          ref={svgRef}
          className={className}
          role="application"
          aria-label="Arbeidsflate. Bruk piltaster for å flytte valgte objekter."
          data-testid="canvas"
          {...handlers}
          onPointerOver={(e) => {
            const target = e.target as Element
            const objectId = target.closest?.('[data-object-id]')?.getAttribute('data-object-id') ?? null
            const store = useInteractionStore.getState()
            store.setHover(objectId ? selectableEntityFor(doc, objectId, store.activeGroupId) : null)
            store.setHoverGuide(target.closest?.('[data-guide-id]')?.getAttribute('data-guide-id') ?? null)
            store.setHoverMeasure(
              target.closest?.('[data-measure-id]')?.getAttribute('data-measure-id') ?? null,
            )
          }}
          onPointerOut={(e) => {
            if (e.relatedTarget) return
            const store = useInteractionStore.getState()
            store.setHover(null)
            store.setHoverGuide(null)
            store.setHoverMeasure(null)
          }}
        >
          <g
            transform={`translate(${viewport.offsetX} ${viewport.offsetY}) scale(${viewport.scale})`}
            data-testid="model-layer"
          >
            <SurfaceLayer surface={doc.surface} grid={doc.surfaceGrid} />
            <ObjectsLayer objects={doc.objects} unit={doc.displayUnit} />
          </g>
          <OverlayLayer doc={doc} viewport={viewport} coarsePointer={coarsePointer} />
        </svg>
      </div>
    </div>
  )
}
