import { right, bottom } from './bounds'
import { type SceneGraph, entityBounds, entityAnchorPoint } from './groups'
import { roundMm } from '@/utils/units'

export type AlignH = 'left' | 'anchor' | 'right'
export type AlignV = 'top' | 'anchor' | 'bottom'

export const ALIGN_H: AlignH[] = ['left', 'anchor', 'right']
export const ALIGN_V: AlignV[] = ['top', 'anchor', 'bottom']

export const ALIGN_LABELS: Record<`${AlignV}-${AlignH}`, string> = {
  'top-left': 'Venstre kant og øvre kant',
  'top-anchor': 'Anker-x og øvre kant',
  'top-right': 'Høyre kant og øvre kant',
  'anchor-left': 'Venstre kant og anker-y',
  'anchor-anchor': 'Ankerpunkt mot ankerpunkt',
  'anchor-right': 'Høyre kant og anker-y',
  'bottom-left': 'Venstre kant og nedre kant',
  'bottom-anchor': 'Anker-x og nedre kant',
  'bottom-right': 'Høyre kant og nedre kant',
}

export type AlignDelta = { id: string; dx: number; dy: number }

/**
 * Align every selected entity to the key entity. The key entity never moves,
 * which keeps the result predictable (no drifting towards an average).
 */
export function computeAlignment(
  graph: SceneGraph,
  entityIds: string[],
  keyId: string,
  h: AlignH,
  v: AlignV,
): AlignDelta[] {
  const keyBounds = entityBounds(graph, keyId)
  const keyAnchor = entityAnchorPoint(graph, keyId)
  if (!keyBounds || !keyAnchor) return []

  const out: AlignDelta[] = []
  for (const id of entityIds) {
    if (id === keyId) continue
    const bounds = entityBounds(graph, id)
    const anchor = entityAnchorPoint(graph, id)
    if (!bounds || !anchor) continue

    let dx = 0
    let dy = 0
    if (h === 'left') dx = keyBounds.x - bounds.x
    else if (h === 'right') dx = right(keyBounds) - right(bounds)
    else dx = keyAnchor.x - anchor.x

    if (v === 'top') dy = keyBounds.y - bounds.y
    else if (v === 'bottom') dy = bottom(keyBounds) - bottom(bounds)
    else dy = keyAnchor.y - anchor.y

    dx = roundMm(dx)
    dy = roundMm(dy)
    if (dx !== 0 || dy !== 0) out.push({ id, dx, dy })
  }
  return out
}
