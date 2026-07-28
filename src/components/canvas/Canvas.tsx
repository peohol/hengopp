import { useEffect, useRef } from 'react'
import { fitViewport } from '@/geometry/coordinates'
import { selectableEntityFor } from '@/geometry/groups'
import { useProjectStore } from '@/state/project-store'
import { useInteractionStore } from '@/state/interaction-store'
import { useViewportStore } from '@/state/viewport-store'
import { SurfaceLayer } from './SurfaceLayer'
import { ObjectsLayer } from './ObjectsLayer'
import { OverlayLayer } from './OverlayLayer'
import { useCanvasInteractions } from './useCanvasInteractions'

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const didFitRef = useRef(false)

  const doc = useProjectStore((s) => s.doc)
  const viewport = useViewportStore((s) => s.viewport)
  const mode = useInteractionStore((s) => s.mode)
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
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="workspace" ref={containerRef} data-testid="workspace">
      <svg
        ref={svgRef}
        className={className}
        role="application"
        aria-label="Arbeidsflate. Bruk piltaster for å flytte valgte objekter."
        data-testid="canvas"
        {...handlers}
        onPointerOver={(e) => {
          const el = (e.target as Element).closest?.('[data-object-id]')
          const objectId = el?.getAttribute('data-object-id') ?? null
          const { activeGroupId, setHover } = useInteractionStore.getState()
          setHover(objectId ? selectableEntityFor(doc, objectId, activeGroupId) : null)
        }}
        onPointerOut={(e) => {
          if (!e.relatedTarget) useInteractionStore.getState().setHover(null)
        }}
      >
        <g
          transform={`translate(${viewport.offsetX} ${viewport.offsetY}) scale(${viewport.scale})`}
          data-testid="model-layer"
        >
          <SurfaceLayer surface={doc.surface} grid={doc.surfaceGrid} />
          <ObjectsLayer objects={doc.objects} unit={doc.displayUnit} />
        </g>
        <OverlayLayer doc={doc} viewport={viewport} />
      </svg>
    </div>
  )
}
