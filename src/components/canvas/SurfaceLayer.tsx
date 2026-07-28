import { memo } from 'react'
import type { GridDefinition } from '@/models/grid'
import type { SurfaceDefinition } from '@/models/project'
import { interiorGridLines } from '@/geometry/grid'
import { contrastLineColor } from '@/utils/colors'

type Props = {
  surface: SurfaceDefinition
  grid: GridDefinition
}

/**
 * The surface and its grid. Grid lines are dashed, semi-transparent and always
 * one screen pixel wide; the black/white choice comes from the computed
 * contrast against the surface colour.
 */
export const SurfaceLayer = memo(function SurfaceLayer({ surface, grid }: Props) {
  const lines = interiorGridLines(grid, surface.widthMm, surface.heightMm)
  const lineColor = contrastLineColor(surface.color)

  return (
    <g>
      <rect
        x={0}
        y={0}
        width={surface.widthMm}
        height={surface.heightMm}
        fill={surface.color}
        stroke="#14161a"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        data-testid="surface"
      />
      {grid.enabled ? (
        <g
          stroke={lineColor}
          strokeOpacity={0.42}
          strokeWidth={1}
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          data-testid="surface-grid"
        >
          {lines.vertical.map((x) => (
            <line
              key={`v${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={surface.heightMm}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {lines.horizontal.map((y) => (
            <line
              key={`h${y}`}
              x1={0}
              y1={y}
              x2={surface.widthMm}
              y2={y}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      ) : null}
    </g>
  )
})
