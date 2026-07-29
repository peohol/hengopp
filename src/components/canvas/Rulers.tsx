import { memo, useRef } from 'react'
import type { GuideAxis } from '@/models/guide'
import type { Unit } from '@/models/project'
import type { Viewport } from '@/geometry/coordinates'
import { clampGuidePos, resolveGuideDrag, surfaceExtentFor } from '@/geometry/guides'
import { rulerScale } from '@/geometry/ruler'
import {
  buildSnapTargetsForDocument,
  snapAxis,
  snappingEnabled,
  SNAP_ACTIVATE_PX,
  SNAP_RELEASE_PX,
  SNAP_TIE_PX,
} from '@/geometry/snapping'
import { addGuide, setRulerOrigin } from '@/state/doc-actions'
import { useProjectStore } from '@/state/project-store'
import { useInteractionStore } from '@/state/interaction-store'
import { useViewportStore } from '@/state/viewport-store'
import { formatNumber, roundMm } from '@/utils/units'

/** A drag inside a ruler is only an origin drag once it clears this. */
const ORIGIN_DRAG_PX = 4

/**
 * Where a click in the ruler puts the new guide: the same step quantisation and
 * snapping a drag would give it, so a guide is usable the moment it exists.
 */
function placeGuide(axis: GuideAxis, rawMm: number, altKey: boolean): number {
  const doc = useProjectStore.getState().doc
  const { scale } = useViewportStore.getState().viewport
  return resolveGuideDrag({
    axis,
    posMm: rawMm,
    sizeMm: surfaceExtentFor(doc.surface, axis),
    stepMm: doc.settings.movementStepMm,
    targets: buildSnapTargetsForDocument(doc, []),
    snappingOn: snappingEnabled(doc.settings, altKey),
    activateMm: SNAP_ACTIVATE_PX / scale,
    releaseMm: SNAP_RELEASE_PX / scale,
    tieMm: SNAP_TIE_PX / scale,
  }).posMm
}

/**
 * Where a dragged zero point lands: on any snap target along the axis — surface
 * edges and centre, object edges, centres and anchors, guides, measuring-line
 * ends and the grid. It is never clamped, so the zero point can sit outside the
 * surface.
 */
function placeOrigin(axis: GuideAxis, rawMm: number, altKey: boolean): number {
  const doc = useProjectStore.getState().doc
  const { scale } = useViewportStore.getState().viewport
  if (!snappingEnabled(doc.settings, altKey)) return roundMm(rawMm)
  const targets = buildSnapTargetsForDocument(doc, [])
  const snap = snapAxis([{ pos: rawMm, kind: 'edge-start' }], axis === 'x' ? targets.x : targets.y, {
    activateMm: SNAP_ACTIVATE_PX / scale,
    releaseMm: SNAP_RELEASE_PX / scale,
    tieMm: SNAP_TIE_PX / scale,
  })
  return roundMm(snap ? rawMm + snap.delta : rawMm)
}

export type RulerSide = 'top' | 'bottom' | 'left' | 'right'

/**
 * Ruler thickness in pixels. The canvas frame publishes it as the `--ruler`
 * custom property, so the grid tracks and the drawing always agree. Touch
 * devices get the thinner one: the screen is small and the ruler is easy to
 * hit along a whole edge anyway.
 */
export const RULER_SIZE = 26
export const RULER_SIZE_COARSE = 20

const MAJOR_TICK = 11
const MINOR_TICK = 5

/** The axis a ruler measures: the horizontal rulers read x, the vertical ones y. */
export function rulerAxis(side: RulerSide): GuideAxis {
  return side === 'top' || side === 'bottom' ? 'x' : 'y'
}

type Props = {
  side: RulerSide
  /** Length of the ruler along its own axis, in pixels. */
  lengthPx: number
  /** Thickness of the ruler, in pixels. */
  sizePx: number
  viewport: Viewport
  unit: Unit
  /** Surface extent along the ruler's axis, in millimetres. */
  surfaceMm: number
  /** Model position this ruler reads as zero. */
  originMm: number
}

/**
 * A ruler along one edge of the canvas.
 *
 * The ruler shares its grid track with the canvas, so a pixel offset inside the
 * ruler is the same pixel offset inside the canvas: model → screen is the plain
 * viewport transform, with no extra bookkeeping.
 *
 * Hovering previews a guide line across the canvas, clicking creates it, and
 * dragging moves the ruler's zero point instead. Press-and-release versus
 * press-and-move is the same distinction the canvas already makes between a tap
 * and a drag. On touch there is no hover, so the tap does both at once — the
 * preview simply never gets a chance to appear.
 */
export const Ruler = memo(function Ruler({
  side,
  lengthPx,
  sizePx,
  viewport,
  unit,
  surfaceMm,
  originMm,
}: Props) {
  const axis = rulerAxis(side)
  const horizontal = axis === 'x'
  const offset = horizontal ? viewport.offsetX : viewport.offsetY
  const toScreen = (mm: number) => mm * viewport.scale + offset
  const toModel = (px: number) => (px - offset) / viewport.scale
  /** Live origin drag, kept out of the document until the pointer is released. */
  const dragRef = useRef<{ pointerId: number; startPx: number; moved: boolean; posMm: number } | null>(null)

  const previewPos = useInteractionStore((s) =>
    s.guidePreview && s.guidePreview.axis === axis ? s.guidePreview.posMm : null,
  )
  const originDrag = useInteractionStore((s) =>
    s.originDrag && s.originDrag.axis === axis ? s.originDrag.posMm : null,
  )
  // The labels follow the drag live, so the numbers you are aiming for are the
  // numbers you see before letting go.
  const shownOrigin = originDrag ?? originMm

  const { ticks } = rulerScale({
    fromMm: toModel(0),
    toMm: toModel(lengthPx),
    scale: viewport.scale,
    unit,
    originMm: shownOrigin,
  })

  // Ticks grow inwards, towards the canvas.
  const inward = side === 'top' || side === 'left' ? 1 : -1
  const base = side === 'top' || side === 'left' ? sizePx : 0

  /** Pointer position along the ruler's own axis, in local pixels. */
  const pointerAlong = (clientX: number, clientY: number, element: Element) => {
    const rect = element.getBoundingClientRect()
    return horizontal ? clientX - rect.left : clientY - rect.top
  }

  const previewFrom = (clientX: number, clientY: number, element: Element) =>
    clampGuidePos(toModel(pointerAlong(clientX, clientY, element)), surfaceMm)

  const surfaceStart = toScreen(0)
  const surfaceEnd = toScreen(surfaceMm)

  const width = horizontal ? lengthPx : sizePx
  const height = horizontal ? sizePx : lengthPx

  return (
    <div className={`ruler ruler--${side}`} data-testid={`ruler-${side}`}>
      <svg
        width={width}
        height={height}
        className="ruler__svg"
        role="presentation"
        onPointerMove={(e) => {
          const drag = dragRef.current
          if (drag && drag.pointerId === e.pointerId) {
            const alongPx = pointerAlong(e.clientX, e.clientY, e.currentTarget)
            if (!drag.moved && Math.abs(alongPx - drag.startPx) < ORIGIN_DRAG_PX) return
            drag.moved = true
            drag.posMm = placeOrigin(axis, toModel(alongPx), e.altKey)
            useInteractionStore.getState().setOriginDrag({ axis, posMm: drag.posMm })
            return
          }
          if (e.pointerType === 'touch') return
          const posMm = placeGuide(axis, previewFrom(e.clientX, e.clientY, e.currentTarget), e.altKey)
          useInteractionStore.getState().setGuidePreview({ axis, posMm })
        }}
        onPointerLeave={() => useInteractionStore.getState().setGuidePreview(null)}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.pointerType === 'mouse') return
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          dragRef.current = {
            pointerId: e.pointerId,
            startPx: pointerAlong(e.clientX, e.clientY, e.currentTarget),
            moved: false,
            posMm: originMm,
          }
          useInteractionStore.getState().setGuidePreview(null)
        }}
        onPointerUp={(e) => {
          const drag = dragRef.current
          dragRef.current = null
          useInteractionStore.getState().setOriginDrag(null)
          try {
            e.currentTarget.releasePointerCapture(e.pointerId)
          } catch {
            /* pointer already released */
          }
          if (!drag || drag.pointerId !== e.pointerId) return

          // A drag moved the zero point; a press that never moved is a click,
          // which still creates a guide.
          if (drag.moved) {
            const posMm = drag.posMm
            useProjectStore
              .getState()
              .commit((draft) => setRulerOrigin(draft, axis === 'x' ? { xMm: posMm } : { yMm: posMm }))
            return
          }
          const posMm = placeGuide(axis, previewFrom(e.clientX, e.clientY, e.currentTarget), e.altKey)
          let createdId: string | null = null
          useProjectStore.getState().commit((draft) => {
            createdId = addGuide(draft, axis, posMm)
          })
          if (createdId) useInteractionStore.getState().setActiveGuide(createdId)
        }}
        onPointerCancel={() => {
          dragRef.current = null
          useInteractionStore.getState().setOriginDrag(null)
        }}
      >
        {/* The stretch of ruler that covers the surface itself. */}
        <rect
          x={horizontal ? surfaceStart : 0}
          y={horizontal ? 0 : surfaceStart}
          width={horizontal ? Math.max(0, surfaceEnd - surfaceStart) : sizePx}
          height={horizontal ? sizePx : Math.max(0, surfaceEnd - surfaceStart)}
          className="ruler__surface"
        />

        <g className="ruler__ticks">
          {ticks.map((tick) => {
            const p = toScreen(tick.posMm)
            if (p < -2 || p > (horizontal ? width : height) + 2) return null
            const length = tick.major ? MAJOR_TICK : MINOR_TICK
            const from = base
            const to = base - inward * length
            return (
              <line
                key={`${tick.posMm}-${tick.major ? 'M' : 'm'}`}
                x1={horizontal ? p : from}
                y1={horizontal ? from : p}
                x2={horizontal ? p : to}
                y2={horizontal ? to : p}
                className={tick.major ? 'ruler__tick ruler__tick--major' : 'ruler__tick'}
              />
            )
          })}
        </g>

        <g className="ruler__labels">
          {ticks.map((tick) => {
            if (!tick.major) return null
            const p = toScreen(tick.posMm)
            if (p < 10 || p > (horizontal ? width : height) - 4) return null
            if (horizontal) {
              return (
                <text key={`l${tick.posMm}`} x={p + 3} y={side === 'top' ? 11 : sizePx - 13} dy="0.32em">
                  {tick.label}
                </text>
              )
            }
            // Vertical rulers read bottom-to-top so the digits stay upright at a
            // quarter turn, which is how every drawing program does it.
            const x = side === 'left' ? 11 : sizePx - 11
            return (
              <text key={`l${tick.posMm}`} transform={`translate(${x} ${p + 3}) rotate(-90)`} dy="0.32em">
                {tick.label}
              </text>
            )
          })}
        </g>

        {/* The zero point, and where a drag is about to put it. */}
        <OriginMark
          p={toScreen(shownOrigin)}
          horizontal={horizontal}
          sizePx={sizePx}
          atStartEdge={side === 'top' || side === 'left'}
          dragging={originDrag !== null}
          testId={`ruler-origin-${side}`}
        />

        {/* Where a click would place a guide. */}
        {previewPos !== null ? (
          <g className="ruler__preview" data-testid={`ruler-preview-${side}`}>
            <line
              x1={horizontal ? toScreen(previewPos) : 0}
              y1={horizontal ? 0 : toScreen(previewPos)}
              x2={horizontal ? toScreen(previewPos) : sizePx}
              y2={horizontal ? sizePx : toScreen(previewPos)}
            />
          </g>
        ) : null}
      </svg>
      <span className="visually-hidden">
        {`Linjal ${side === 'top' ? 'over' : side === 'bottom' ? 'under' : side === 'left' ? 'til venstre for' : 'til høyre for'} lerretet. Klikk for å legge til en skillelinje, eller dra for å flytte nullpunktet.`}
      </span>
    </div>
  )
})

/**
 * The zero mark: a flag pointing into the canvas. It reads as a origin rather
 * than as another tick, which matters because the tick right next to it is
 * labelled "0" too.
 */
function OriginMark({
  p,
  horizontal,
  sizePx,
  atStartEdge,
  dragging,
  testId,
}: {
  p: number
  horizontal: boolean
  sizePx: number
  atStartEdge: boolean
  dragging: boolean
  testId: string
}) {
  const w = 5
  // The flag hangs off the edge the ticks grow from, pointing at the canvas.
  const tip = atStartEdge ? sizePx : 0
  const back = atStartEdge ? sizePx - 9 : 9
  const path = horizontal
    ? `M${p} ${tip}L${p - w} ${back}L${p + w} ${back}Z`
    : `M${tip} ${p}L${back} ${p - w}L${back} ${p + w}Z`
  return (
    <g className={`ruler__origin${dragging ? ' is-dragging' : ''}`} data-testid={testId} pointerEvents="none">
      <path d={path} />
      <line
        x1={horizontal ? p : 0}
        y1={horizontal ? 0 : p}
        x2={horizontal ? p : sizePx}
        y2={horizontal ? sizePx : p}
      />
    </g>
  )
}

/** All four rulers, wired to the viewport and the current surface. */
export function CanvasRulers({ sizePx }: { sizePx: number }) {
  const doc = useProjectStore((s) => s.doc)
  const viewport = useViewportStore((s) => s.viewport)
  const viewWidth = useViewportStore((s) => s.viewWidth)
  const viewHeight = useViewportStore((s) => s.viewHeight)

  const shared = { viewport, unit: doc.displayUnit, sizePx }
  const h = { lengthPx: viewWidth, surfaceMm: doc.surface.widthMm, originMm: doc.rulerOrigin.xMm }
  const v = { lengthPx: viewHeight, surfaceMm: doc.surface.heightMm, originMm: doc.rulerOrigin.yMm }
  return (
    <>
      <Ruler side="top" {...h} {...shared} />
      <Ruler side="bottom" {...h} {...shared} />
      <Ruler side="left" {...v} {...shared} />
      <Ruler side="right" {...v} {...shared} />
    </>
  )
}

/** Zoom-independent read-out of the current tick interval, for the status line. */
export function rulerIntervalLabel(viewport: Viewport, unit: Unit): string {
  const { stepMm } = rulerScale({ fromMm: 0, toMm: 1000, scale: viewport.scale, unit })
  return stepMm > 0 ? formatNumber(stepMm, unit) : ''
}
