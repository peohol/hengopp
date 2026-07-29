import { ancestorChain } from '@/geometry/groups'
import { entitiesBounds } from '@/geometry/groups'
import { useProjectStore } from '@/state/project-store'
import { useInteractionStore } from '@/state/interaction-store'
import { useViewportStore } from '@/state/viewport-store'
import { zoomPercent } from '@/geometry/coordinates'
import { rulerIntervalLabel } from './Rulers'
import { formatLength, UNIT_LABEL } from '@/utils/units'

/** Breadcrumb showing which group level the user is editing inside of. */
export function GroupBreadcrumb() {
  const doc = useProjectStore((s) => s.doc)
  const activeGroupId = useInteractionStore((s) => s.activeGroupId)
  const setActiveGroup = useInteractionStore((s) => s.setActiveGroup)
  if (!activeGroupId) return null

  const chain = [...ancestorChain(doc, activeGroupId)].reverse()
  const path = [...chain, activeGroupId]

  return (
    <nav className="breadcrumb" aria-label="Gruppenivå" data-testid="breadcrumb">
      <button type="button" onClick={() => setActiveGroup(null)}>
        Flate
      </button>
      {path.map((id, index) => (
        <span key={id} style={{ display: 'contents' }}>
          <span className="breadcrumb__sep" aria-hidden="true">
            ›
          </span>
          <button
            type="button"
            aria-current={index === path.length - 1 ? 'true' : undefined}
            onClick={() => setActiveGroup(id)}
          >
            {doc.groups[id]?.name ?? 'Gruppe'}
          </button>
        </span>
      ))}
      <span className="breadcrumb__sep">·</span>
      <span className="hint">Escape går ett nivå ut</span>
    </nav>
  )
}

/** Non-intrusive status line: zoom, selection and snapping state. */
export function CanvasStatus() {
  const doc = useProjectStore((s) => s.doc)
  const selection = useInteractionStore((s) => s.selection)
  const snapSuspended = useInteractionStore((s) => s.snapSuspended)
  const tool = useInteractionStore((s) => s.tool)
  const viewport = useViewportStore((s) => s.viewport)
  const baseScale = useViewportStore((s) => s.baseScale)
  const bounds = entitiesBounds(doc, selection)

  return (
    <div className="status" data-testid="status">
      <span>{Math.round(zoomPercent(viewport, baseScale))} %</span>
      <span aria-hidden="true">·</span>
      <span data-testid="ruler-interval">
        Linjal {rulerIntervalLabel(viewport, doc.displayUnit)} {UNIT_LABEL[doc.displayUnit]}
      </span>
      <span aria-hidden="true">·</span>
      {tool === 'measure' ? (
        <>
          <span data-testid="status-tool">Målelinjer (M)</span>
          <span aria-hidden="true">·</span>
        </>
      ) : null}
      <span>
        {selection.length === 0
          ? 'Ingen valgt'
          : selection.length === 1
            ? `1 valgt${bounds ? ` · ${formatLength(bounds.width, doc.displayUnit)} × ${formatLength(bounds.height, doc.displayUnit)}` : ''}`
            : `${selection.length} valgte`}
      </span>
      {snapSuspended ? (
        <>
          <span aria-hidden="true">·</span>
          <span>Snapping av (Alt)</span>
        </>
      ) : null}
    </div>
  )
}
