import { memo, useMemo } from 'react'
import type { HengoppProject, MeasurementSide } from '@/models/project'
import type { Viewport } from '@/geometry/coordinates'
import { type Rect } from '@/geometry/bounds'
import { anchorPoint } from '@/geometry/bounds'
import { entitiesAtLevel } from '@/geometry/groups'
import { HANDLES, HANDLE_CURSOR, HANDLE_LABEL, handlePoint } from '@/geometry/resizing'
import { measurementLine, MEASUREMENT_SIDE_LABEL } from '@/geometry/measurements'
import type { SnapGuide } from '@/geometry/snapping'
import { useInteractionStore, type PreviewGeometry } from '@/state/interaction-store'
import { useProjectStore } from '@/state/project-store'
import { togglePinnedMeasurement } from '@/state/doc-actions'
import { formatLength } from '@/utils/units'
import { isOutsideSurface, previewedEntityBounds, previewedRect, previewedSelectionBounds } from './scene-helpers'

const ACCENT = '#2f6fd0'
const HANDLE_SIZE = 9
const HANDLE_HIT = 26

type Props = {
  doc: HengoppProject
  viewport: Viewport
}

/**
 * Everything drawn in screen space: selection frames, handles, anchors,
 * snap guides, measurements and the marquee. Rendering here keeps every UI
 * element at a constant pixel size regardless of zoom.
 */
export const OverlayLayer = memo(function OverlayLayer({ doc, viewport }: Props) {
  const selection = useInteractionStore((s) => s.selection)
  const keyId = useInteractionStore((s) => s.keyId)
  const hoverId = useInteractionStore((s) => s.hoverId)
  const activeGroupId = useInteractionStore((s) => s.activeGroupId)
  const preview = useInteractionStore((s) => s.preview)
  const guides = useInteractionStore((s) => s.guides)
  const marquee = useInteractionStore((s) => s.marquee)
  const marqueeHits = useInteractionStore((s) => s.marqueeHits)
  const mode = useInteractionStore((s) => s.mode)

  const sx = (mm: number) => mm * viewport.scale + viewport.offsetX
  const sy = (mm: number) => mm * viewport.scale + viewport.offsetY
  const toScreenRect = (r: Rect) => ({
    x: sx(r.x),
    y: sy(r.y),
    width: r.width * viewport.scale,
    height: r.height * viewport.scale,
  })

  const selectionBounds = useMemo(
    () => previewedSelectionBounds(doc, preview, selection),
    [doc, preview, selection],
  )

  const outside = useMemo(() => {
    const out: { id: string; rect: Rect }[] = []
    for (const obj of Object.values(doc.objects)) {
      const rect = previewedRect(obj, preview[obj.id])
      if (isOutsideSurface(rect, doc.surface.widthMm, doc.surface.heightMm)) out.push({ id: obj.id, rect })
    }
    return out
  }, [doc.objects, doc.surface.heightMm, doc.surface.widthMm, preview])

  const levelIds = useMemo(() => entitiesAtLevel(doc, activeGroupId), [doc, activeGroupId])

  const showTemporaryMeasurements = selection.length === 1 && mode === 'idle'

  const togglePin = (entityId: string, side: MeasurementSide) => {
    useProjectStore.getState().commit((draft) => togglePinnedMeasurement(draft, entityId, side))
  }

  return (
    <g data-testid="overlay">
      {/* Objects that fall outside the surface. */}
      {outside.map(({ id, rect }) => {
        const r = toScreenRect(rect)
        return (
          <rect
            key={`out-${id}`}
            x={r.x - 2}
            y={r.y - 2}
            width={r.width + 4}
            height={r.height + 4}
            fill="none"
            stroke="#b3261e"
            strokeWidth={1}
            strokeDasharray="4 3"
            pointerEvents="none"
            data-testid="outside-marker"
          />
        )
      })}

      {/* Hover feedback for entities on the active level. */}
      {hoverId && levelIds.includes(hoverId) && !selection.includes(hoverId)
        ? (() => {
            const bounds = previewedEntityBounds(doc, preview, hoverId)
            if (!bounds) return null
            const r = toScreenRect(bounds)
            return (
              <rect
                x={r.x}
                y={r.y}
                width={r.width}
                height={r.height}
                fill="none"
                stroke={ACCENT}
                strokeOpacity={0.5}
                strokeWidth={1}
                pointerEvents="none"
              />
            )
          })()
        : null}

      {/* Marquee preview. */}
      {marqueeHits.map((id) => {
        const bounds = previewedEntityBounds(doc, preview, id)
        if (!bounds) return null
        const r = toScreenRect(bounds)
        return (
          <rect
            key={`mq-${id}`}
            x={r.x}
            y={r.y}
            width={r.width}
            height={r.height}
            fill={ACCENT}
            fillOpacity={0.1}
            stroke={ACCENT}
            strokeWidth={1}
            strokeDasharray="3 2"
            pointerEvents="none"
          />
        )
      })}

      {/* Selection frames. The key entity gets a heavier frame. */}
      {selection.map((id) => {
        const bounds = previewedEntityBounds(doc, preview, id)
        if (!bounds) return null
        const r = toScreenRect(bounds)
        const isKey = id === keyId && selection.length > 1
        const isGroup = !!doc.groups[id]
        return (
          <g key={`sel-${id}`} pointerEvents="none">
            <rect
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.75}
              strokeWidth={isKey ? 4 : 3}
            />
            <rect
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
              fill="none"
              stroke={ACCENT}
              strokeWidth={isKey ? 2 : 1}
              strokeDasharray={isGroup ? '6 3' : undefined}
              data-testid={isKey ? 'key-selection' : 'selection-frame'}
            />
            {isKey ? (
              <>
                {[
                  [r.x, r.y],
                  [r.x + r.width, r.y],
                  [r.x, r.y + r.height],
                  [r.x + r.width, r.y + r.height],
                ].map(([cx, cy], i) => (
                  <rect
                    key={i}
                    x={cx - 3}
                    y={cy - 3}
                    width={6}
                    height={6}
                    fill={ACCENT}
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                ))}
              </>
            ) : null}
          </g>
        )
      })}

      {/* Anchor indicators for the selected objects. */}
      {selection.map((id) => {
        const obj = doc.objects[id]
        if (!obj) return null
        const rect = previewedRect(obj, preview[id])
        const a = anchorPoint({ ...obj, xMm: rect.x, yMm: rect.y, widthMm: rect.width, heightMm: rect.height })
        const px = sx(a.x)
        const py = sy(a.y)
        return (
          <g key={`anchor-${id}`} pointerEvents="none" data-testid="anchor-indicator">
            <circle cx={px} cy={py} r={6} fill="#f4dc9a" fillOpacity={0.9} stroke="#14161a" strokeWidth={1} />
            <path
              d={`M${px - 9} ${py}H${px - 3}M${px + 3} ${py}H${px + 9}M${px} ${py - 9}V${py - 3}M${px} ${py + 3}V${py + 9}`}
              stroke="#14161a"
              strokeWidth={1}
            />
          </g>
        )
      })}

      {/* Measurements to the surface edges (below the handles, which must win). */}
      <MeasurementLayer
        doc={doc}
        preview={preview}
        sx={sx}
        sy={sy}
        selection={selection}
        showTemporary={showTemporaryMeasurements}
        onToggle={togglePin}
      />

      {/* Resize handles for the whole selection. */}
      {selectionBounds && selection.length > 0 && mode !== 'marquee' ? (
        <g data-testid="handles">
          {HANDLES.map((handle) => {
            const p = handlePoint(selectionBounds, handle)
            const px = sx(p.x)
            const py = sy(p.y)
            return (
              <g key={handle}>
                <rect
                  x={px - HANDLE_HIT / 2}
                  y={py - HANDLE_HIT / 2}
                  width={HANDLE_HIT}
                  height={HANDLE_HIT}
                  fill="transparent"
                  data-handle={handle}
                  data-testid={`handle-${handle}`}
                  style={{ cursor: HANDLE_CURSOR[handle] }}
                >
                  <title>{`Endre størrelse fra ${HANDLE_LABEL[handle]}`}</title>
                </rect>
                <rect
                  x={px - HANDLE_SIZE / 2}
                  y={py - HANDLE_SIZE / 2}
                  width={HANDLE_SIZE}
                  height={HANDLE_SIZE}
                  fill="#ffffff"
                  stroke={ACCENT}
                  strokeWidth={1}
                  pointerEvents="none"
                />
              </g>
            )
          })}
        </g>
      ) : null}

      {/* Snap guides. */}
      {guides.x ? <Guide guide={guides.x} sx={sx} sy={sy} /> : null}
      {guides.y ? <Guide guide={guides.y} sx={sx} sy={sy} /> : null}

      {/* Marquee rectangle. */}
      {marquee ? (
        <rect
          {...toScreenRect(marquee)}
          fill={ACCENT}
          fillOpacity={0.08}
          stroke={ACCENT}
          strokeWidth={1}
          strokeDasharray="4 3"
          pointerEvents="none"
          data-testid="marquee"
        />
      ) : null}
    </g>
  )
})

function Guide({
  guide,
  sx,
  sy,
}: {
  guide: SnapGuide
  sx: (mm: number) => number
  sy: (mm: number) => number
}) {
  const isX = guide.axis === 'x'
  const x1 = isX ? sx(guide.pos) : sx(guide.from)
  const x2 = isX ? sx(guide.pos) : sx(guide.to)
  const y1 = isX ? sy(guide.from) : sy(guide.pos)
  const y2 = isX ? sy(guide.to) : sy(guide.pos)
  return (
    <g pointerEvents="none" data-testid={`snap-guide-${guide.axis}`}>
      {/* Discreet light underlay so the black guide stays visible on dark fills. */}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff" strokeOpacity={0.85} strokeWidth={3} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000000" strokeWidth={1} />
    </g>
  )
}

type MeasurementLayerProps = {
  doc: HengoppProject
  preview: Record<string, PreviewGeometry>
  sx: (mm: number) => number
  sy: (mm: number) => number
  selection: string[]
  showTemporary: boolean
  onToggle: (entityId: string, side: MeasurementSide) => void
}

function MeasurementLayer({ doc, preview, sx, sy, selection, showTemporary, onToggle }: MeasurementLayerProps) {
  const items: { key: string; entityId: string; side: MeasurementSide; pinned: boolean }[] = []

  for (const pin of doc.pinnedMeasurements) {
    items.push({ key: `pin-${pin.id}`, entityId: pin.objectId, side: pin.side, pinned: true })
  }
  if (showTemporary) {
    const entityId = selection[0]
    for (const side of ['left', 'right', 'top', 'bottom'] as MeasurementSide[]) {
      const alreadyPinned = doc.pinnedMeasurements.some((m) => m.objectId === entityId && m.side === side)
      if (!alreadyPinned) items.push({ key: `tmp-${entityId}-${side}`, entityId, side, pinned: false })
    }
  }

  return (
    <g data-testid="measurements">
      {items.map((item) => {
        const bounds = previewedEntityBounds(doc, preview, item.entityId)
        if (!bounds) return null
        const line = measurementLine(bounds, doc.surface, item.side)
        const x1 = sx(line.x1)
        const y1 = sy(line.y1)
        const x2 = sx(line.x2)
        const y2 = sy(line.y2)
        const label = formatLength(Math.max(0, line.distanceMm), doc.displayUnit)
        const labelW = Math.max(30, label.length * 6.4 + 10)
        const labelH = 16
        // Keep the label readable even when the distance is tiny.
        const midX = (x1 + x2) / 2
        const midY = (y1 + y2) / 2
        const horizontal = item.side === 'left' || item.side === 'right'
        const lx = horizontal ? midX - labelW / 2 : midX + 8
        const ly = horizontal ? midY - labelH - 4 : midY - labelH / 2

        return (
          <g
            key={item.key}
            data-interactive="measurement"
            data-measurement-side={item.side}
            data-measurement-entity={item.entityId}
            data-testid={`measurement-${item.side}${item.pinned ? '-pinned' : ''}`}
            style={{ cursor: 'pointer' }}
            role="button"
            tabIndex={0}
            aria-label={`${item.pinned ? 'Løsne' : 'Fest'} måling til ${MEASUREMENT_SIDE_LABEL[item.side]}, ${label}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onToggle(item.entityId, item.side)
              }
            }}
          >
            {/* Hit area, inset so it never covers the object's resize handles. */}
            <line
              x1={horizontal ? x1 + Math.sign(x2 - x1) * 14 : x1}
              y1={horizontal ? y1 : y1 + Math.sign(y2 - y1) * 14}
              x2={x2}
              y2={y2}
              stroke="transparent"
              strokeWidth={14}
              strokeLinecap="butt"
              data-testid={`measurement-hit-${item.side}`}
            />
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#000000"
              strokeWidth={1}
              strokeDasharray={item.pinned ? undefined : '4 3'}
              opacity={item.pinned ? 1 : 0.8}
            />
            <line
              x1={horizontal ? x1 : x1 - 4}
              y1={horizontal ? y1 - 4 : y1}
              x2={horizontal ? x1 : x1 + 4}
              y2={horizontal ? y1 + 4 : y1}
              stroke="#000000"
              strokeWidth={1}
            />
            <line
              x1={horizontal ? x2 : x2 - 4}
              y1={horizontal ? y2 - 4 : y2}
              x2={horizontal ? x2 : x2 + 4}
              y2={horizontal ? y2 + 4 : y2}
              stroke="#000000"
              strokeWidth={1}
            />
            {/* The label always wins a click, even on top of an object. */}
            <g data-measurement-label="1">
              <rect
                x={lx}
                y={ly}
                width={labelW}
                height={labelH}
                fill="#ffffff"
                stroke="#000000"
                strokeWidth={1}
                rx={2}
                data-testid={`measurement-label-${item.side}`}
              />
              <text
                x={lx + labelW / 2}
                y={ly + labelH / 2 + 4}
                textAnchor="middle"
                fontSize={11}
                fontFamily="inherit"
                fill="#14161a"
              >
                {label}
              </text>
            </g>
          </g>
        )
      })}
    </g>
  )
}
