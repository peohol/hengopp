import type { HengoppProject } from '@/models/project'
import type { SceneObject } from '@/models/object'
import { type Rect, unionRects, right, bottom } from '@/geometry/bounds'
import { objectIdsOfEntities } from '@/geometry/groups'
import type { PreviewGeometry } from '@/state/interaction-store'

/** Object geometry with any active drag/resize preview applied. */
export function previewedRect(obj: SceneObject, preview?: PreviewGeometry): Rect {
  if (preview) {
    return { x: preview.xMm, y: preview.yMm, width: preview.widthMm, height: preview.heightMm }
  }
  return { x: obj.xMm, y: obj.yMm, width: obj.widthMm, height: obj.heightMm }
}

export function previewedObject(obj: SceneObject, preview?: PreviewGeometry): SceneObject {
  if (!preview) return obj
  return {
    ...obj,
    xMm: preview.xMm,
    yMm: preview.yMm,
    widthMm: preview.widthMm,
    heightMm: preview.heightMm,
  }
}

/** Bounding box of an entity, honouring the transient preview. */
export function previewedEntityBounds(
  doc: HengoppProject,
  preview: Record<string, PreviewGeometry>,
  entityId: string,
): Rect | null {
  const ids = objectIdsOfEntities(doc, [entityId])
  const rects = ids
    .map((id) => {
      const obj = doc.objects[id]
      return obj ? previewedRect(obj, preview[id]) : null
    })
    .filter((r): r is Rect => r !== null)
  return unionRects(rects)
}

export function previewedSelectionBounds(
  doc: HengoppProject,
  preview: Record<string, PreviewGeometry>,
  entityIds: string[],
): Rect | null {
  const rects = entityIds
    .map((id) => previewedEntityBounds(doc, preview, id))
    .filter((r): r is Rect => r !== null)
  return unionRects(rects)
}

/** True when any part of the rect falls outside the surface. */
export function isOutsideSurface(rect: Rect, widthMm: number, heightMm: number): boolean {
  return rect.x < -1e-6 || rect.y < -1e-6 || right(rect) > widthMm + 1e-6 || bottom(rect) > heightMm + 1e-6
}
