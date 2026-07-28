import type { SceneObject } from '@/models/object'

export type ZOrderOp = 'forward' | 'backward' | 'front' | 'back'

/** Object ids ordered back-to-front. */
export function orderedObjectIds(objects: Record<string, SceneObject>): string[] {
  return Object.values(objects)
    .sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id))
    .map((o) => o.id)
}

/**
 * Reorder a selection as one contiguous block while preserving the internal
 * order of the selected objects. Returns the new back-to-front order.
 */
export function computeReorder(
  order: string[],
  selectedIds: string[],
  op: ZOrderOp,
): string[] {
  const selectedSet = new Set(selectedIds)
  const selected = order.filter((id) => selectedSet.has(id))
  const others = order.filter((id) => !selectedSet.has(id))
  if (selected.length === 0 || others.length === 0) return order

  const indices = order.map((id, i) => (selectedSet.has(id) ? i : -1)).filter((i) => i >= 0)
  const topIdx = indices[indices.length - 1]
  const bottomIdx = indices[0]
  const unselectedBelow = (idx: number) => order.slice(0, idx).filter((id) => !selectedSet.has(id)).length

  let k: number
  switch (op) {
    case 'front':
      k = others.length
      break
    case 'back':
      k = 0
      break
    case 'forward':
      k = Math.min(others.length, unselectedBelow(topIdx) + 1)
      break
    case 'backward':
      k = Math.max(0, unselectedBelow(bottomIdx) - 1)
      break
  }

  return [...others.slice(0, k), ...selected, ...others.slice(k)]
}

/** Write normalised, gap-free zIndex values (0..n-1) onto a mutable draft. */
export function applyOrder(objects: Record<string, SceneObject>, order: string[]): void {
  order.forEach((id, index) => {
    const obj = objects[id]
    if (obj) obj.zIndex = index
  })
}

export function nextZIndex(objects: Record<string, SceneObject>): number {
  const values = Object.values(objects).map((o) => o.zIndex)
  return values.length === 0 ? 0 : Math.max(...values) + 1
}
