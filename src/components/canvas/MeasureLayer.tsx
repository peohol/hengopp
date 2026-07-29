import type { MeasureLine } from '@/models/measure'
import type { Unit } from '@/models/project'
import { measureMetrics } from '@/geometry/measure-lines'
import { useInteractionStore, type MeasureDraft } from '@/state/interaction-store'
import { formatLength } from '@/utils/units'

const MEASURE_COLOR = '#0f7b6c'
export const MEASURE_HIT_PX = 12
export const MEASURE_HIT_TOUCH_PX = 24

type Props = {
  lines: MeasureLine[]
  draft: MeasureDraft | null
  unit: Unit
  sx: (mm: number) => number
  sy: (mm: number) => number
  /** Measuring lines only take pointer input while their tool is active. */
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
 */
export function MeasureLayer({ lines, draft, unit, sx, sy, interactive, coarsePointer }: Props) {
  const hoverId = useInteractionStore((s) => s.hoverMeasureId)
  const hit = coarsePointer ? MEASURE_HIT_TOUCH_PX : MEASURE_HIT_PX

  return (
    <g data-testid="measure-lines">
      {lines.map((line) => (
        <MeasureNode
          key={line.id}
          line={line}
          unit={unit}
          sx={sx}
          sy={sy}
          showLabels={line.pinned || (interactive && hoverId === line.id)}
          interactive={interactive}
          showDelete={interactive && (hoverId === line.id || line.pinned)}
          hitPx={hit}
        />
      ))}
      {draft ? (
        <MeasureNode
          line={{ id: 'draft', ...draft, pinned: false }}
          unit={unit}
          sx={sx}
          sy={sy}
          showLabels
          interactive={false}
          hitPx={hit}
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
      style={interactive ? { cursor: 'pointer' } : undefined}
    >
      {interactive ? (
        <>
          <title>
            {`Målelinje, ${formatLength(lengthMm, unit)}${
              diagonal ? ` (${formatLength(m.widthMm, unit)} × ${formatLength(m.heightMm, unit)})` : ''
            }. Klikk for å feste målene.`}
          </title>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={hitPx} />
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
      <EndCap x={x1} y={y1} />
      <EndCap x={x2} y={y2} />

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

      {showDelete && !isDraft ? (
        <g
          data-measure-delete={line.id}
          data-testid="measure-delete"
          style={{ cursor: 'pointer' }}
          role="button"
          aria-label="Slett målelinje"
        >
          <circle cx={x1} cy={y1} r={9} fill="#ffffff" stroke={MEASURE_COLOR} strokeWidth={1} />
          <path
            d={`M${x1 - 3.2} ${y1 - 3.2}l6.4 6.4M${x1 + 3.2} ${y1 - 3.2}l-6.4 6.4`}
            stroke={MEASURE_COLOR}
            strokeWidth={1.4}
            strokeLinecap="round"
            pointerEvents="none"
          />
        </g>
      ) : null}
    </g>
  )
}

/** Short cross bar marking an endpoint, so a measurement reads as measured. */
function EndCap({ x, y }: { x: number; y: number }) {
  return (
    <g pointerEvents="none">
      <circle cx={x} cy={y} r={2.5} fill={MEASURE_COLOR} stroke="#ffffff" strokeWidth={1} />
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
