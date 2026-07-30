import type { Draft } from 'immer'
import type { HengoppProject } from '@/models/project'
import type { MeasureAttachment } from '@/models/measure'
import type { SnapGuide } from './snapping'
import { roundMm } from '@/utils/units'
import type { SceneObject } from '@/models/object'
import type { MeasureLine } from '@/models/measure'

/** Describe a snapped point in object-relative coordinates so it survives resize. */
export function attachmentFromSnap(
  point: { x: number; y: number },
  guides: { x?: SnapGuide; y?: SnapGuide },
  doc: HengoppProject,
): MeasureAttachment | undefined {
  const objectId = [guides.x, guides.y].find(
    (guide) => guide?.source === 'object' && guide.refId && doc.objects[guide.refId],
  )?.refId
  if (!objectId) return undefined
  const object = doc.objects[objectId]
  return {
    objectId,
    xRatio: (point.x - object.xMm) / object.widthMm,
    yRatio: (point.y - object.yMm) / object.heightMm,
  }
}

/** Re-resolve all attached endpoints after any document mutation. */
export function syncMeasureAttachments(draft: Draft<HengoppProject>): void {
  for (const line of draft.measureLines) {
    for (const end of ['start', 'end'] as const) {
      const key = `${end}Attachment` as const
      const attachment = line[key]
      if (!attachment) continue
      const object = draft.objects[attachment.objectId]
      if (!object) {
        delete line[key]
        continue
      }
      const x = roundMm(object.xMm + object.widthMm * attachment.xRatio)
      const y = roundMm(object.yMm + object.heightMm * attachment.yRatio)
      if (end === 'start') {
        line.x1Mm = x
        line.y1Mm = y
      } else {
        line.x2Mm = x
        line.y2Mm = y
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
  for (const end of ['start', 'end'] as const) {
    const attachment = line[`${end}Attachment`]
    if (!attachment) continue
    const stored = objects[attachment.objectId]
    if (!stored) continue
    const object = preview[attachment.objectId] ?? stored
    const x = roundMm(object.xMm + object.widthMm * attachment.xRatio)
    const y = roundMm(object.yMm + object.heightMm * attachment.yRatio)
    resolved = end === 'start'
      ? { ...resolved, x1Mm: x, y1Mm: y }
      : { ...resolved, x2Mm: x, y2Mm: y }
  }
  return resolved
}
