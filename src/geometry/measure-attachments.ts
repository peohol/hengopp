import type { Draft } from 'immer'
import type { HengoppProject } from '@/models/project'
import type { MeasureAttachment, MeasureLine } from '@/models/measure'
import type { SnapGuide } from './snapping'
import { roundMm } from '@/utils/units'
import type { SceneObject } from '@/models/object'

/** Describe a snapped point in object-relative coordinates so it survives resize. */
export function attachmentFromSnap(
  point: { x: number; y: number },
  guides: { x?: SnapGuide; y?: SnapGuide },
  doc: HengoppProject,
): MeasureAttachment | undefined {
  const objectIdFor = (guide?: SnapGuide) =>
    guide?.source === 'object' && guide.refId && doc.objects[guide.refId] ? guide.refId : undefined
  const xObjectId = objectIdFor(guides.x)
  const yObjectId = objectIdFor(guides.y)
  if (!xObjectId && !yObjectId) return undefined

  // A snap to one object's edge attaches the whole point to that object. At a
  // cross-object intersection, however, each coordinate follows its own target.
  const xTargetId = xObjectId ?? yObjectId
  const yTargetId = yObjectId ?? xObjectId
  const xObject = doc.objects[xTargetId!]
  const yObject = doc.objects[yTargetId!]
  return {
    x: { objectId: xTargetId!, ratio: (point.x - xObject.xMm) / xObject.widthMm },
    y: { objectId: yTargetId!, ratio: (point.y - yObject.yMm) / yObject.heightMm },
  }
}

function resolveAxis(
  axis: 'x' | 'y',
  attachment: MeasureAttachment,
  objects: Record<string, ObjectGeometry | undefined>,
): number | undefined {
  const target = attachment[axis]
  if (!target) return undefined
  const object = objects[target.objectId]
  if (!object) return undefined
  return roundMm(
    axis === 'x'
      ? object.xMm + object.widthMm * target.ratio
      : object.yMm + object.heightMm * target.ratio,
  )
}

/** Re-resolve all attached endpoints after any document mutation. */
export function syncMeasureAttachments(draft: Draft<HengoppProject>): void {
  for (const line of draft.measureLines) {
    for (const end of ['start', 'end'] as const) {
      const key = `${end}Attachment` as const
      const attachment = line[key]
      if (!attachment) continue
      const x = resolveAxis('x', attachment, draft.objects)
      const y = resolveAxis('y', attachment, draft.objects)
      if (attachment.x && x === undefined) delete attachment.x
      if (attachment.y && y === undefined) delete attachment.y
      if (!attachment.x && !attachment.y) delete line[key]
      if (end === 'start') {
        if (x !== undefined) line.x1Mm = x
        if (y !== undefined) line.y1Mm = y
      } else {
        if (x !== undefined) line.x2Mm = x
        if (y !== undefined) line.y2Mm = y
      }
    }
  }
}

type ObjectGeometry = Pick<SceneObject, 'xMm' | 'yMm' | 'widthMm' | 'heightMm'>

/** Resolve attachments against live preview rectangles without changing the document. */
export function previewAttachedMeasureLine(
  line: MeasureLine,
  objects: Record<string, SceneObject>,
  preview: Record<string, ObjectGeometry>,
): MeasureLine {
  let resolved = line
  const geometry = Object.fromEntries(
    Object.entries(objects).map(([id, object]) => [id, preview[id] ?? object]),
  )
  for (const end of ['start', 'end'] as const) {
    const attachment = line[`${end}Attachment`]
    if (!attachment) continue
    const x = resolveAxis('x', attachment, geometry)
    const y = resolveAxis('y', attachment, geometry)
    resolved = end === 'start'
      ? { ...resolved, ...(x === undefined ? {} : { x1Mm: x }), ...(y === undefined ? {} : { y1Mm: y }) }
      : { ...resolved, ...(x === undefined ? {} : { x2Mm: x }), ...(y === undefined ? {} : { y2Mm: y }) }
  }
  return resolved
}
