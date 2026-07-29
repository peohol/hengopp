import { memo, useMemo } from 'react'
import type { HengoppProject, MeasurementSide } from '@/models/project'
import type { Viewport } from '@/geometry/coordinates'
import { type Rect } from '@/geometry/bounds'
import { anchorPoint } from '@/geometry/bounds'
import { entitiesAtLevel, isEntityLocked, objectIdsOfEntities } from '@/geometry/groups'
import { HANDLES, HANDLE_CURSOR, HANDLE_LABEL, handlePoint } from '@/geometry/resizing'
import { measurementLine, MEASUREMENT_SIDE_LABEL } from '@/geometry/measurements'
import { layoutLabels } from '@/geometry/label-layout'
import type { SnapGuide } from '@/geometry/snapping'
import { useInteractionStore, type PreviewGeometry } from '@/state/interaction-store'
import { useProjectStore } from '@/state/project-store'
import { togglePinnedMeasurement } from '@/state/doc-actions'
import { deriveBorderColor, labelBackgroundColor } from '@/utils/colors'
import { formatLength } from '@/utils/units'
import { GuidesLayer } from './GuidesLayer'
import { MeasureLayer } from './MeasureLayer'
import { isOutsideSurface, previewedEntityBounds, previewedRect, previewedSelectionBounds } from './scene-helpers'

const ACCENT = '#2f6fd0'
const HANDLE_SIZE = 9
const HANDLE_HIT = 26

type Props = {
  doc: HengoppProject
  viewport: Viewport
  /** True on touch devices, where hit areas need to be fatter. */
  coarsePointer: boolean
}

/**
 * Everything drawn in screen space: selection frames, handles, anchors,
 * snap guides, measurements and the marquee. Rendering here keeps every UI
 * element at a constant pixel size regardless of zoom.
 */
export const OverlayLayer = memo(function OverlayLayer({ doc, viewport, coarsePointer }: Props) {
  const selection = useInteractionStore((s) => s.selection)
  const keyId = useInteractionStore((s) => s.keyId)
  const hoverId = useInteractionStore((s) => s.hoverId)
  const activeGroupId = useInteractionStore((s) => s.activeGroupId)
  const preview = useInteractionStore((s) => s.preview)
  const guides = useInteractionStore((s) => s.guides)
  const marquee = useInteractionStore((s) => s.marquee)
  const marqueeHits = useInteractionStore((s) => s.marqueeHits)
  const mode = useInteractionStore((s) => s.mode)
  const tool = useInteractionStore((s) => s.tool)
  const measureDraft = useInteractionStore((s) => s.measureDraft)
  const snapObjectIds = useInteractionStore((s) => s.snapObjectIds)

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

  // One locked member is enough to withdraw the handles: a resize maps the
  // whole bounding box, so there is no way to scale the rest without dragging
  // the locked object along.
  const selectionHasLocked = selection.some((id) => isEntityLocked(doc, id))
  // Distances are part of what a lock freezes on the canvas, so a locked
  // selection shows no temporary measurements to toggle.
  const showTemporaryMeasurements =
    selection.length === 1 && mode === 'idle' && tool === 'select' && !selectionHasLocked

  // Lock badges sit on the objects of whichever entity is hovered, so a locked
  // object inside a group is reachable without entering the group first. The
  // measure tool owns every press on the canvas, so the badge stands down.
  const lockedHovered = useMemo(() => {
    if (!hoverId || mode !== 'idle' || tool !== 'select') return []
    return objectIdsOfEntities(doc, [hoverId])
      .map((id) => doc.objects[id])
      .filter((o) => o?.locked)
      .map((o) => ({ id: o.id, rect: previewedRect(o, preview[o.id]) }))
  }, [doc, hoverId, mode, preview, tool])

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

      {/* User guide lines. They sit above the distance lines: a guide is a
          deliberate, persistent artifact and must stay grabbable where a
          transient measurement happens to cross it. */}
      <GuidesLayer
        guides={doc.guides}
        surface={doc.surface}
        sx={sx}
        sy={sy}
        coarsePointer={coarsePointer}
        draggable={tool === 'select'}
      />

      {/* Free measuring lines. */}
      <MeasureLayer
        lines={doc.measureLines}
        draft={measureDraft}
        unit={doc.displayUnit}
        sx={sx}
        sy={sy}
        interactive={tool === 'select'}
        coarsePointer={coarsePointer}
      />

      {/* Objects an active snap is locked onto: their handles and anchor are
          shown so the other places the point could land are visible too. */}
      {snapObjectIds.map((id) => {
        const obj = doc.objects[id]
        if (!obj) return null
        const rect = previewedRect(obj, preview[id])
        const a = anchorPoint({ ...obj, xMm: rect.x, yMm: rect.y, widthMm: rect.width, heightMm: rect.height })
        return (
          <g key={`snaphint-${id}`} pointerEvents="none" data-testid="snap-hint">
            {HANDLES.map((handle) => {
              const p = handlePoint(rect, handle)
              return (
                <rect
                  key={handle}
                  x={sx(p.x) - 3}
                  y={sy(p.y) - 3}
                  width={6}
                  height={6}
                  fill="#ffffff"
                  stroke={ACCENT}
                  strokeWidth={1}
                />
              )
            })}
            <circle
              cx={sx(a.x)}
              cy={sy(a.y)}
              r={5}
              fill="#f4dc9a"
              fillOpacity={0.9}
              stroke="#14161a"
              strokeWidth={1}
            />
          </g>
        )
      })}

      {/* Lock badges on the hovered entity's locked objects. */}
      {lockedHovered.map(({ id, rect }) => {
        const r = toScreenRect(rect)
        return <LockBadge key={`lock-${id}`} objectId={id} cx={r.x + r.width / 2} cy={r.y + r.height / 2} />
      })}

      {/* Resize handles for the whole selection. A locked selection has none. */}
      {selectionBounds && selection.length > 0 && mode !== 'marquee' && !selectionHasLocked && tool === 'select' ? (
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

/**
 * Padlock shown at the centre of a locked object while its entity is hovered.
 * It rests at 75 % opacity and goes fully opaque under the pointer, where it
 * also takes a finger cursor: clicking it unlocks the object again.
 */
function LockBadge({ objectId, cx, cy }: { objectId: string; cx: number; cy: number }) {
  return (
    <g
      className="lock-badge"
      data-lock-toggle={objectId}
      // The badge belongs to its object: without this it would count as
      // "not the object" on pointerover and hover itself away again.
      data-object-id={objectId}
      data-testid="lock-badge"
      role="button"
      aria-label="Lås opp objektet"
    >
      <circle cx={cx} cy={cy} r={14} fill="#ffffff" stroke="#14161a" strokeWidth={1} />
      <path
        d={`M${cx - 5.5} ${cy - 1}h11v8h-11z`}
        fill="#f4dc9a"
        stroke="#14161a"
        strokeWidth={1.2}
        strokeLinejoin="round"
        pointerEvents="none"
      />
      <path
        d={`M${cx - 3.2} ${cy - 1}v-3a3.2 3.2 0 0 1 6.4 0v3`}
        fill="none"
        stroke="#14161a"
        strokeWidth={1.2}
        strokeLinecap="round"
        pointerEvents="none"
      />
    </g>
  )
}

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

/** Height of the text band inside a label, and the length of its pointed tips. */
const LABEL_BAND = 17
const LABEL_TIP = 12
/** How far the long edges bow outwards, giving the label its lens shape. */
const LABEL_BULGE = 1.6

/**
 * Ribbon with a pointed tip at each end, aligned with the measurement line so
 * the line visually runs into and out of the label. The waist pinches in at the
 * tips and the long edges bow out, which makes it obvious at a glance which
 * line a label belongs to when several of them share the same area.
 */
export function bannerPath(
  cx: number,
  cy: number,
  width: number,
  height: number,
  axis: 'x' | 'y',
  tip = LABEL_TIP,
  bulge = LABEL_BULGE,
): string {
  // Leaving the tip along the line (k1) and arriving at the flat edge almost
  // straight on (k2) is what produces the concave notch at each end.
  const k1 = tip * 0.72
  const k2 = tip * 0.22
  if (axis === 'x') {
    const x0 = cx - width / 2
    const x1 = cx + width / 2
    const xa = x0 + tip
    const xb = x1 - tip
    const yt = cy - height / 2
    const yb = cy + height / 2
    return [
      `M${x0} ${cy}`,
      `C${x0 + k1} ${cy} ${xa - k2} ${yt} ${xa} ${yt}`,
      `Q${cx} ${yt - bulge * 2} ${xb} ${yt}`,
      `C${xb + k2} ${yt} ${x1 - k1} ${cy} ${x1} ${cy}`,
      `C${x1 - k1} ${cy} ${xb + k2} ${yb} ${xb} ${yb}`,
      `Q${cx} ${yb + bulge * 2} ${xa} ${yb}`,
      `C${xa - k2} ${yb} ${x0 + k1} ${cy} ${x0} ${cy}`,
      'Z',
    ].join(' ')
  }
  const y0 = cy - height / 2
  const y1 = cy + height / 2
  const ya = y0 + tip
  const yb = y1 - tip
  const xl = cx - width / 2
  const xr = cx + width / 2
  return [
    `M${cx} ${y0}`,
    `C${cx} ${y0 + k1} ${xl} ${ya - k2} ${xl} ${ya}`,
    `Q${xl - bulge * 2} ${cy} ${xl} ${yb}`,
    `C${xl} ${yb + k2} ${cx} ${y1 - k1} ${cx} ${y1}`,
    `C${cx} ${y1 - k1} ${xr} ${yb + k2} ${xr} ${yb}`,
    `Q${xr + bulge * 2} ${cy} ${xr} ${ya}`,
    `C${xr} ${ya - k2} ${cx} ${y0 + k1} ${cx} ${y0}`,
    'Z',
  ].join(' ')
}

function MeasurementLayer({ doc, preview, sx, sy, selection, showTemporary, onToggle }: MeasurementLayerProps) {
  const items: { key: string; entityId: string; side: MeasurementSide; pinned: boolean }[] = []

  // Pinned measurements are placed first, so they keep the position the user
  // chose them for; temporary ones give way around them.
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

  const drawn = items.flatMap((item) => {
    const bounds = previewedEntityBounds(doc, preview, item.entityId)
    if (!bounds) return []
    const locked = isEntityLocked(doc, item.entityId)
    const line = measurementLine(bounds, doc.surface, item.side)
    const x1 = sx(line.x1)
    const y1 = sy(line.y1)
    const x2 = sx(line.x2)
    const y2 = sy(line.y2)
    const label = formatLength(Math.max(0, line.distanceMm), doc.displayUnit)
    const textW = Math.max(24, label.length * 6.3)
    const horizontal = item.side === 'left' || item.side === 'right'
    const width = horizontal ? textW + 2 * LABEL_TIP + 12 : textW + 16
    const height = horizontal ? LABEL_BAND : LABEL_BAND + 2 * LABEL_TIP
    const along = horizontal ? Math.abs(x2 - x1) : Math.abs(y2 - y1)
    const extent = horizontal ? width : height
    const obj = doc.objects[item.entityId]

    return [
      {
        item,
        label,
        locked,
        x1,
        y1,
        x2,
        y2,
        horizontal,
        slot: {
          id: item.key,
          cx: (x1 + x2) / 2,
          cy: (y1 + y2) / 2,
          width,
          height,
          axis: (horizontal ? 'x' : 'y') as 'x' | 'y',
          travel: Math.max(0, (along - extent) / 2 - 3),
        },
        fill: obj ? labelBackgroundColor(obj.fillColor) : '#f3f3f1',
        stroke: obj ? deriveBorderColor(obj.fillColor) : '#5b6068',
      },
    ]
  })

  const placements = layoutLabels(drawn.map((d) => d.slot))
  const byId = new Map(placements.map((p) => [p.id, p]))

  return (
    <g data-testid="measurements">
      {drawn.map((d) => {
        const { item, label, locked, x1, y1, x2, y2, horizontal, slot } = d
        const place = byId.get(slot.id) ?? { cx: slot.cx, cy: slot.cy }

        return (
          <g
            key={item.key}
            data-interactive={locked ? undefined : 'measurement'}
            data-measurement-side={item.side}
            data-measurement-entity={item.entityId}
            data-measurement-locked={locked ? '1' : undefined}
            data-testid={`measurement-${item.side}${item.pinned ? '-pinned' : ''}`}
            style={{ cursor: locked ? 'default' : 'pointer' }}
            role={locked ? undefined : 'button'}
            tabIndex={locked ? undefined : 0}
            aria-label={
              locked
                ? `Måling til ${MEASUREMENT_SIDE_LABEL[item.side]}, ${label}. Objektet er låst.`
                : `${item.pinned ? 'Løsne' : 'Fest'} måling til ${MEASUREMENT_SIDE_LABEL[item.side]}, ${label}`
            }
            onKeyDown={(e) => {
              if (locked) return
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
            {/* A pinned label wins a click even on top of an object — it is a
                deliberate artifact the user must be able to reach again. */}
            <g data-measurement-label={item.pinned ? 'pinned' : 'temporary'}>
              <path
                d={bannerPath(place.cx, place.cy, slot.width, slot.height, slot.axis)}
                fill={d.fill}
                stroke={d.stroke}
                strokeWidth={1}
                strokeLinejoin="round"
                data-testid={`measurement-label-${item.side}`}
              />
              <text
                x={place.cx}
                y={place.cy + 4}
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
