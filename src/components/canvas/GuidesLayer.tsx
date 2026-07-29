import type { GuideLine } from '@/models/guide'
import type { SurfaceDefinition } from '@/models/project'
import { useInteractionStore } from '@/state/interaction-store'

/** Hit width in screen pixels. Coarse pointers get a fatter band. */
export const GUIDE_HIT_PX = 13
export const GUIDE_HIT_TOUCH_PX = 26

const GUIDE_COLOR = '#7b4fd6'
/** Resting opacity. Hovering, dragging or locking takes it to full. */
const GUIDE_OPACITY = 0.55

type Props = {
  guides: GuideLine[]
  surface: SurfaceDefinition
  sx: (mm: number) => number
  sy: (mm: number) => number
  coarsePointer: boolean
  /** False while another tool owns the canvas: guides light up, but do not move. */
  draggable: boolean
}

/**
 * User guide lines, drawn in screen space so they stay one pixel wide at any
 * zoom. They are dotted, where the surface grid is dashed, so the two never
 * read as the same thing.
 *
 * Each guide carries a grip near the start of the line. On a mouse the grip is
 * a convenience; on touch, where nothing can be hovered, it is the affordance
 * that says "this can be dragged".
 */
export function GuidesLayer({ guides, surface, sx, sy, coarsePointer, draggable }: Props) {
  const hoverGuideId = useInteractionStore((s) => s.hoverGuideId)
  const activeGuideId = useInteractionStore((s) => s.activeGuideId)
  const guideDrag = useInteractionStore((s) => s.guideDrag)
  const preview = useInteractionStore((s) => s.guidePreview)

  const hit = coarsePointer ? GUIDE_HIT_TOUCH_PX : GUIDE_HIT_PX
  const x0 = sx(0)
  const x1 = sx(surface.widthMm)
  const y0 = sy(0)
  const y1 = sy(surface.heightMm)

  return (
    <g data-testid="guides">
      {guides.map((guide) => {
        const posMm = guideDrag?.id === guide.id ? guideDrag.posMm : guide.posMm
        const vertical = guide.axis === 'x'
        const p = vertical ? sx(posMm) : sy(posMm)
        const lit = hoverGuideId === guide.id || activeGuideId === guide.id || guide.locked
        const dragging = guideDrag?.id === guide.id
        const gripAt = vertical ? y0 + 18 : x0 + 18

        return (
          <g
            key={guide.id}
            data-guide-id={guide.id}
            data-testid={`guide-${guide.axis}${guide.locked ? '-locked' : ''}`}
            className={`guide${guide.locked ? ' is-locked' : ''}`}
            style={{
              cursor: !draggable
                ? 'inherit'
                : guide.locked
                  ? 'pointer'
                  : vertical
                    ? 'ew-resize'
                    : 'ns-resize',
            }}
            opacity={lit || dragging ? 1 : GUIDE_OPACITY}
          >
            <title>
              {`${vertical ? 'Loddrett' : 'Vannrett'} skillelinje${guide.locked ? ' (låst)' : ''}. Dra for å flytte, klikk for å låse, dobbeltklikk for nøyaktig posisjon.`}
            </title>
            <line
              x1={vertical ? p : x0}
              y1={vertical ? y0 : p}
              x2={vertical ? p : x1}
              y2={vertical ? y1 : p}
              stroke="transparent"
              strokeWidth={hit}
              data-testid={`guide-hit-${guide.id}`}
            />
            <line
              x1={vertical ? p : x0}
              y1={vertical ? y0 : p}
              x2={vertical ? p : x1}
              y2={vertical ? y1 : p}
              stroke={GUIDE_COLOR}
              strokeWidth={1}
              strokeDasharray="1 4"
              strokeLinecap="round"
              pointerEvents="none"
            />
            <GuideGrip
              cx={vertical ? p : gripAt}
              cy={vertical ? gripAt : p}
              vertical={vertical}
              locked={guide.locked}
            />
          </g>
        )
      })}

      {/* Where a click on the hovered ruler would put a new guide. */}
      {preview ? (
        <line
          x1={preview.axis === 'x' ? sx(preview.posMm) : x0}
          y1={preview.axis === 'x' ? y0 : sy(preview.posMm)}
          x2={preview.axis === 'x' ? sx(preview.posMm) : x1}
          y2={preview.axis === 'x' ? y1 : sy(preview.posMm)}
          stroke={GUIDE_COLOR}
          strokeWidth={1}
          strokeDasharray="1 4"
          strokeLinecap="round"
          opacity={0.75}
          pointerEvents="none"
          data-testid="guide-preview"
        />
      ) : null}
    </g>
  )
}

/**
 * Grip badge: a short bar across the guide, with a padlock notch once the guide
 * is locked so the state is readable without relying on opacity alone.
 */
function GuideGrip({
  cx,
  cy,
  vertical,
  locked,
}: {
  cx: number
  cy: number
  vertical: boolean
  locked: boolean
}) {
  const w = vertical ? 11 : 20
  const h = vertical ? 20 : 11
  return (
    <g pointerEvents="none">
      <rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={3}
        fill={GUIDE_COLOR}
        stroke="#ffffff"
        strokeWidth={1}
      />
      {locked ? (
        <path
          d={`M${cx - 2.5} ${cy + 0.5}h5v3h-5zM${cx - 1.5} ${cy + 0.5}v-1.6a1.5 1.5 0 0 1 3 0v1.6`}
          fill="none"
          stroke="#ffffff"
          strokeWidth={1}
          strokeLinejoin="round"
        />
      ) : (
        <path
          d={
            vertical
              ? `M${cx - 2} ${cy - 4}v8M${cx + 2} ${cy - 4}v8`
              : `M${cx - 4} ${cy - 2}h8M${cx - 4} ${cy + 2}h8`
          }
          stroke="#ffffff"
          strokeWidth={1}
          strokeLinecap="round"
        />
      )}
    </g>
  )
}
