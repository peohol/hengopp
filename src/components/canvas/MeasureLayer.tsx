import type { MeasureLine } from '@/models/measure'
import type { Unit } from '@/models/project'
import { measureMetrics } from '@/geometry/measure-lines'
import { useInteractionStore, type MeasureDraft } from '@/state/interaction-store'
import { formatLength } from '@/utils/units'

const MEASURE_COLOR = '#0f7b6c'
export const MEASURE_HIT_PX = 12
export const MEASURE_HIT_TOUCH_PX = 24
/** Hit radius of an endpoint handle. Comfortably bigger than the dot it draws. */
export const MEASURE_END_HIT_PX = 11
export const MEASURE_END_HIT_TOUCH_PX = 20

type Props = {
  lines: MeasureLine[]
  draft: MeasureDraft | null
  unit: Unit
  sx: (mm: number) => number
  sy: (mm: number) => number
  /**
   * Measuring lines take pointer input with the *select* tool, not the measure
   * tool: the measure tool only draws new lines.
   */
  interactive: boolean
  coarsePointer: boolean
}

/**
 * Free measuring lines.
 *
 * Labels appear on hover and stay put once the line is pinned by a click. A
 * level line reports its horizontal length, a plumb line its vertical length,
 * and a diagonal reports its own length plus the x and y components of the
 * vector, drawn as dashed legs with their own labels.
 *
 * Each end is a handle that can be dragged to a new position, with the same
 * snapping the line was drawn with. Holding Ctrl/Cmd arms deletion: a cross
 * appears at the middle of the hovered line, and a click removes it.
 */
export function MeasureLayer({ lines, draft, unit, sx, sy, interactive, coarsePointer }: Props) {
  const hoverId = useInteractionStore((s) => s.hoverMeasureId)
  const deleteArmed = useInteractionStore((s) => s.deleteArmed)
  const editingId = useInteractionStore((s) => s.measureDraft?.editingId ?? null)
  const hit = coarsePointer ? MEASURE_HIT_TOUCH_PX : MEASURE_HIT_PX
  const endHit = coarsePointer ? MEASURE_END_HIT_TOUCH_PX : MEASURE_END_HIT_PX

  return (
    <g data-testid="measure-lines">
      {lines.map((line) => {
        // While an end of this line is being dragged, the draft stands in for it.
        if (editingId === line.id) return null
        const hovered = interactive && hoverId === line.id
        const armed = hovered && deleteArmed
        return (
          <MeasureNode
            key={line.id}
            line={line}
            unit={unit}
            sx={sx}
            sy={sy}
            // While deletion is armed the cross replaces the labels: the only
            // thing worth saying at that moment is what the click will do.
            showLabels={(line.pinned || hovered) && !armed}
            interactive={interactive}
            showDelete={armed}
            hitPx={hit}
            endHitPx={endHit}
          />
        )
      })}
      {draft ? (
        <MeasureNode
          line={{ id: 'draft', x1Mm: draft.x1Mm, y1Mm: draft.y1Mm, x2Mm: draft.x2Mm, y2Mm: draft.y2Mm, pinned: false }}
          unit={unit}
          sx={sx}
          sy={sy}
          showLabels
          interactive={false}
          hitPx={hit}
          endHitPx={endHit}
          isDraft
        />
      ) : null}
    </g>
  )
}

type NodeProps = {
  line: MeasureLine
  unit: Unit
  sx: (mm: number) => number
  sy: (mm: number) => number
  showLabels: boolean
  interactive: boolean
  showDelete?: boolean
  hitPx: number
  endHitPx: number
  isDraft?: boolean
}

function MeasureNode({
  line,
  unit,
  sx,
  sy,
  showLabels,
  interactive,
  showDelete,
  hitPx,
  endHitPx,
  isDraft,
}: NodeProps) {
  const m = measureMetrics(line)
  const x1 = sx(line.x1Mm)
  const y1 = sy(line.y1Mm)
  const x2 = sx(line.x2Mm)
  const y2 = sy(line.y2Mm)
  const cornerX = sx(m.cornerX)
  const cornerY = sy(m.cornerY)
  const diagonal = m.orientation === 'diagonal'
  const lengthMm =
    m.orientation === 'horizontal' ? m.widthMm : m.orientation === 'vertical' ? m.heightMm : m.lengthMm

  return (
    <g
      data-measure-id={isDraft ? undefined : line.id}
      data-testid={isDraft ? 'measure-draft' : `measure-line${line.pinned ? '-pinned' : ''}`}
      className="measure"
      pointerEvents={interactive ? undefined : 'none'}
    >
      {interactive ? (
        <>
          <title>
            {`Målelinje, ${formatLength(lengthMm, unit)}${
              diagonal ? ` (${formatLength(m.widthMm, unit)} × ${formatLength(m.heightMm, unit)})` : ''
            }. Klikk for å feste målene, dra i endene for å endre den, Ctrl-klikk for å slette.`}
          </title>
          {/* The body of the line: pinning and Ctrl-deletion live here. */}
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="transparent"
            strokeWidth={hitPx}
            style={{ cursor: 'pointer' }}
            data-testid={`measure-hit-${line.id}`}
          />
        </>
      ) : null}

      {/* Vector components, only meaningful for a diagonal. */}
      {diagonal && showLabels ? (
        <g pointerEvents="none" data-testid="measure-components">
          <line
            x1={x1}
            y1={y1}
            x2={cornerX}
            y2={cornerY}
            stroke={MEASURE_COLOR}
            strokeWidth={1}
            strokeDasharray="5 4"
            opacity={0.85}
          />
          <line
            x1={cornerX}
            y1={cornerY}
            x2={x2}
            y2={y2}
            stroke={MEASURE_COLOR}
            strokeWidth={1}
            strokeDasharray="5 4"
            opacity={0.85}
          />
        </g>
      ) : null}

      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={MEASURE_COLOR}
        strokeWidth={line.pinned ? 1.75 : 1.25}
        strokeDasharray={isDraft ? '6 4' : undefined}
        pointerEvents="none"
      />

      {/* The ends are handles: drag one to move it, with snapping. */}
      <EndHandle
        x={x1}
        y={y1}
        lineId={line.id}
        end="start"
        interactive={interactive && !isDraft}
        hitPx={endHitPx}
      />
      <EndHandle
        x={x2}
        y={y2}
        lineId={line.id}
        end="end"
        interactive={interactive && !isDraft}
        hitPx={endHitPx}
      />

      {showLabels ? (
        <g pointerEvents="none">
          <Chip
            x={(x1 + x2) / 2}
            y={(y1 + y2) / 2}
            text={formatLength(lengthMm, unit)}
            strong
            testId="measure-label"
          />
          {diagonal ? (
            <>
              <Chip
                x={(x1 + cornerX) / 2}
                y={cornerY}
                text={formatLength(m.widthMm, unit)}
                testId="measure-label-x"
              />
              <Chip
                x={cornerX}
                y={(cornerY + y2) / 2}
                text={formatLength(m.heightMm, unit)}
                testId="measure-label-y"
              />
            </>
          ) : null}
        </g>
      ) : null}

      {/* Ctrl held over the line: a click will delete it. */}
      {showDelete && !isDraft ? (
        <g pointerEvents="none" data-testid="measure-delete">
          <circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={11} fill="#ffffff" stroke="#b3261e" strokeWidth={1.25} />
          <path
            d={`M${(x1 + x2) / 2 - 4} ${(y1 + y2) / 2 - 4}l8 8M${(x1 + x2) / 2 + 4} ${(y1 + y2) / 2 - 4}l-8 8`}
            stroke="#b3261e"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </g>
      ) : null}
    </g>
  )
}

/** Endpoint dot, and — with the select tool — the handle that moves it. */
function EndHandle({
  x,
  y,
  lineId,
  end,
  interactive,
  hitPx,
}: {
  x: number
  y: number
  lineId: string
  end: 'start' | 'end'
  interactive: boolean
  hitPx: number
}) {
  return (
    <g>
      {interactive ? (
        <circle
          cx={x}
          cy={y}
          r={hitPx}
          fill="transparent"
          data-measure-end={end}
          data-measure-end-id={lineId}
          data-testid={`measure-end-${end}`}
          style={{ cursor: 'grab' }}
        >
          <title>Dra for å flytte enden av målelinjen</title>
        </circle>
      ) : null}
      <circle
        cx={x}
        cy={y}
        r={interactive ? 3.5 : 2.5}
        fill={interactive ? '#ffffff' : MEASURE_COLOR}
        stroke={MEASURE_COLOR}
        strokeWidth={interactive ? 1.5 : 1}
        pointerEvents="none"
      />
    </g>
  )
}

function Chip({
  x,
  y,
  text,
  strong,
  testId,
}: {
  x: number
  y: number
  text: string
  strong?: boolean
  testId: string
}) {
  const width = Math.max(30, text.length * 6.4 + 12)
  const height = 17
  return (
    <g data-testid={testId}>
      <rect
        x={x - width / 2}
        y={y - height / 2}
        width={width}
        height={height}
        rx={4}
        fill="#ffffff"
        stroke={MEASURE_COLOR}
        strokeWidth={strong ? 1.25 : 1}
        opacity={0.97}
      />
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        fontSize={11}
        fontFamily="inherit"
        fontWeight={strong ? 600 : 400}
        fill="#14161a"
      >
        {text}
      </text>
    </g>
  )
}
