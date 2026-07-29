import { memo } from 'react'
import type { SceneObject } from '@/models/object'
import type { Unit } from '@/models/project'
import { orderedObjectIds } from '@/geometry/zorder'
import { useInteractionStore } from '@/state/interaction-store'
import { formatLength } from '@/utils/units'
import { previewedRect } from './scene-helpers'

type ObjectNodeProps = {
  object: SceneObject
  unit: Unit
  selectable: boolean
}

const ObjectNode = memo(function ObjectNode({ object, unit, selectable }: ObjectNodeProps) {
  const preview = useInteractionStore((s) => s.preview[object.id])
  const rect = previewedRect(object, preview)

  const shared = {
    fill: object.fillColor,
    // Only the fill is translucent: the border stays crisp so an object's
    // outline is readable however light its fill is.
    fillOpacity: object.fillOpacity,
    stroke: object.borderColor,
    strokeWidth: 1,
    vectorEffect: 'non-scaling-stroke' as const,
    'data-object-id': object.id,
    'data-testid': `object-${object.name}`,
    className: `canvas__object${selectable && !object.locked ? ' is-selectable' : ''}${
      object.locked ? ' is-locked' : ''
    }`,
    role: 'img',
    'aria-label': `${object.name}, ${object.shape === 'rectangle' ? 'rektangel' : 'oval'}${
      object.locked ? ', låst' : ''
    }, x ${formatLength(rect.x, unit)}, y ${formatLength(rect.y, unit)}, bredde ${formatLength(
      rect.width,
      unit,
    )}, høyde ${formatLength(rect.height, unit)}`,
  }

  if (object.shape === 'ellipse') {
    return (
      <ellipse
        {...shared}
        cx={rect.x + rect.width / 2}
        cy={rect.y + rect.height / 2}
        rx={rect.width / 2}
        ry={rect.height / 2}
      />
    )
  }
  return <rect {...shared} x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
})

type Props = {
  objects: Record<string, SceneObject>
  unit: Unit
}

export const ObjectsLayer = memo(function ObjectsLayer({ objects, unit }: Props) {
  const order = orderedObjectIds(objects)
  return (
    <g data-testid="objects-layer">
      {order.map((id) => {
        const object = objects[id]
        if (!object) return null
        return <ObjectNode key={id} object={object} unit={unit} selectable />
      })}
    </g>
  )
})
