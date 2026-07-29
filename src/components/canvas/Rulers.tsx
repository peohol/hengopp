import { memo } from 'react'
import type { GuideAxis } from '@/models/guide'
import type { Unit } from '@/models/project'
import type { Viewport } from '@/geometry/coordinates'
import { clampGuidePos, resolveGuideDrag, surfaceExtentFor } from '@/geometry/guides'
import { rulerScale } from '@/geometry/ruler'
import {
  buildSnapTargetsForDocument,
  snappingEnabled,
  SNAP_ACTIVATE_PX,
  SNAP_RELEASE_PX,
  SNAP_TIE_PX,
} from '@/geometry/snapping'
import { addGuide } from '@/state/doc-actions'
import { useProjectStore } from '@/state/project-store'
import { useInteractionStore } from '@/state/interaction-store'
import { useViewportStore } from '@/state/viewport-store'
import { formatNumber } from '@/utils/units'

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
}

/**
 * A ruler along one edge of the canvas.
 *
 * The ruler shares its grid track with the canvas, so a pixel offset inside the
 * ruler is the same pixel offset inside the canvas: model → screen is the plain
 * viewport transform, with no extra bookkeeping.
 *
 * Hovering previews a guide line across the canvas, clicking creates it. On
 * touch there is no hover, so the tap does both at once — the preview simply
 * never gets a chance to appear.
 */
export const Ruler = memo(function Ruler({ side, lengthPx, sizePx, viewport, unit, surfaceMm }: Props) {
  const axis = rulerAxis(side)
  const horizontal = axis === 'x'
  const offset = horizontal ? viewport.offsetX : viewport.offsetY
  const toScreen = (mm: number) => mm * viewport.scale + offset
  const toModel = (px: number) => (px - offset) / viewport.scale

  const { ticks } = rulerScale({
    fromMm: toModel(0),
    toMm: toModel(lengthPx),
    scale: viewport.scale,
    unit,
  })

  // Ticks grow inwards, towards the canvas.
  const inward = side === 'top' || side === 'left' ? 1 : -1
  const base = side === 'top' || side === 'left' ? sizePx : 0

  const previewFrom = (clientX: number, clientY: number, element: Element) => {
    const rect = element.getBoundingClientRect()
    const along = horizontal ? clientX - rect.left : clientY - rect.top
    return clampGuidePos(toModel(along), surfaceMm)
  }

  const surfaceStart = toScreen(0)
  const surfaceEnd = toScreen(surfaceMm)
  const previewPos = useInteractionStore((s) =>
    s.guidePreview && s.guidePreview.axis === axis ? s.guidePreview.posMm : null,
  )

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
          if (e.pointerType === 'touch') return
          const posMm = placeGuide(axis, previewFrom(e.clientX, e.clientY, e.currentTarget), e.altKey)
          useInteractionStore.getState().setGuidePreview({ axis, posMm })
        }}
        onPointerLeave={() => useInteractionStore.getState().setGuidePreview(null)}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.pointerType === 'mouse') return
          e.preventDefault()
          const posMm = placeGuide(axis, previewFrom(e.clientX, e.clientY, e.currentTarget), e.altKey)
          let createdId: string | null = null
          useProjectStore.getState().commit((draft) => {
            createdId = addGuide(draft, axis, posMm)
          })
          const interaction = useInteractionStore.getState()
          interaction.setGuidePreview(null)
          if (createdId) interaction.setActiveGuide(createdId)
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
        {`Linjal ${side === 'top' ? 'over' : side === 'bottom' ? 'under' : side === 'left' ? 'til venstre for' : 'til høyre for'} lerretet. Klikk for å legge til en skillelinje.`}
      </span>
    </div>
  )
})

/** All four rulers, wired to the viewport and the current surface. */
export function CanvasRulers({ sizePx }: { sizePx: number }) {
  const doc = useProjectStore((s) => s.doc)
  const viewport = useViewportStore((s) => s.viewport)
  const viewWidth = useViewportStore((s) => s.viewWidth)
  const viewHeight = useViewportStore((s) => s.viewHeight)

  const shared = { viewport, unit: doc.displayUnit, sizePx }
  return (
    <>
      <Ruler side="top" lengthPx={viewWidth} surfaceMm={doc.surface.widthMm} {...shared} />
      <Ruler side="bottom" lengthPx={viewWidth} surfaceMm={doc.surface.widthMm} {...shared} />
      <Ruler side="left" lengthPx={viewHeight} surfaceMm={doc.surface.heightMm} {...shared} />
      <Ruler side="right" lengthPx={viewHeight} surfaceMm={doc.surface.heightMm} {...shared} />
    </>
  )
}

/** Zoom-independent read-out of the current tick interval, for the status line. */
export function rulerIntervalLabel(viewport: Viewport, unit: Unit): string {
  const { stepMm } = rulerScale({ fromMm: 0, toMm: 1000, scale: viewport.scale, unit })
  return stepMm > 0 ? formatNumber(stepMm, unit) : ''
}
