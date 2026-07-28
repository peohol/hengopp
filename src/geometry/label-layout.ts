import type { Rect } from './bounds'

/**
 * A measurement label may slide along its own line without losing meaning — it
 * stays on the line it belongs to. That single degree of freedom is what the
 * layout uses to keep labels from stacking on top of each other.
 */
export type LabelSlot = {
  id: string
  /** Preferred centre, in screen pixels. */
  cx: number
  cy: number
  width: number
  height: number
  /** The axis the label may slide along — the direction of its line. */
  axis: 'x' | 'y'
  /** How far it may slide from the preferred centre, in pixels, each way. */
  travel: number
}

export type LabelPlacement = {
  id: string
  cx: number
  cy: number
  /** Signed distance from the preferred centre, for tests and debugging. */
  offset: number
}

const DEFAULT_STEP = 7

/** Offsets to try, nearest to the preferred centre first. */
export function candidateOffsets(travel: number, step = DEFAULT_STEP): number[] {
  const out = [0]
  if (!Number.isFinite(travel) || travel <= 0 || step <= 0) return out
  for (let d = step; d < travel; d += step) out.push(d, -d)
  out.push(travel, -travel)
  return out
}

function rectAt(slot: LabelSlot, offset: number): Rect {
  const cx = slot.axis === 'x' ? slot.cx + offset : slot.cx
  const cy = slot.axis === 'y' ? slot.cy + offset : slot.cy
  return { x: cx - slot.width / 2, y: cy - slot.height / 2, width: slot.width, height: slot.height }
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/**
 * Place labels one at a time, each as close to its preferred position as
 * possible. The first offset that clears every label placed so far wins; if
 * none does, the least overlapping one is used. Earlier slots therefore have
 * priority, so callers should pass the labels that matter most first.
 */
export function layoutLabels(slots: LabelSlot[], step = DEFAULT_STEP): LabelPlacement[] {
  const placed: Rect[] = []
  const out: LabelPlacement[] = []

  for (const slot of slots) {
    let bestOffset = 0
    let bestOverlap = Infinity
    for (const offset of candidateOffsets(slot.travel, step)) {
      const rect = rectAt(slot, offset)
      let overlap = 0
      for (const other of placed) overlap += overlapArea(rect, other)
      if (overlap < bestOverlap) {
        bestOverlap = overlap
        bestOffset = offset
      }
      if (overlap === 0) break
    }
    const rect = rectAt(slot, bestOffset)
    placed.push(rect)
    out.push({
      id: slot.id,
      cx: rect.x + rect.width / 2,
      cy: rect.y + rect.height / 2,
      offset: bestOffset,
    })
  }

  return out
}
