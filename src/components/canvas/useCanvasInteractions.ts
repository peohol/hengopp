import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { HengoppProject, MeasurementSide } from '@/models/project'
import { screenToModel, type Point } from '@/geometry/coordinates'
import {
  anchorPoint,
  normaliseRect,
  rectContainsRect,
  type Rect,
} from '@/geometry/bounds'
import {
  entitiesAtLevel,
  entitiesBounds,
  entityBounds,
  entityTopZ,
  objectIdsOfEntities,
  selectableEntityFor,
  translateEntity,
} from '@/geometry/groups'
import {
  buildSnapTargetsForDocument,
  computeSnap,
  rectSnapCandidates,
  resizeSnapCandidates,
  snappingEnabled,
  SNAP_ACTIVATE_PX,
  SNAP_RELEASE_PX,
  SNAP_TIE_PX,
  type SnapCandidate,
  type SnapTargets,
} from '@/geometry/snapping'
import {
  mapRectBetweenBounds,
  movesBottom,
  movesLeft,
  movesRight,
  movesTop,
  resizeRect,
  type HandleId,
} from '@/geometry/resizing'
import { scaleEntities, togglePinnedMeasurement } from '@/state/doc-actions'
import { useProjectStore } from '@/state/project-store'
import { useInteractionStore, type PreviewGeometry } from '@/state/interaction-store'
import { useViewportStore } from '@/state/viewport-store'
import { useUiStore } from '@/state/ui-store'
import { roundMm, roundToStep } from '@/utils/units'

/** Movement below this many screen pixels counts as a tap, not a drag. */
export const DRAG_THRESHOLD_PX = 4
const DOUBLE_TAP_MS = 500
const DOUBLE_TAP_PX = 24

type SessionKind = 'move' | 'resize' | 'marquee' | 'pan'

type Session = {
  kind: SessionKind
  pointerId: number
  startClient: Point
  startModel: Point
  lastClient: Point
  entityIds: string[]
  objectIds: string[]
  startRects: Record<string, Rect>
  startBounds: Rect
  anchor: Point | null
  handle?: HandleId
  targets: SnapTargets
  prevXKey?: string
  prevYKey?: string
  moved: boolean
  shiftKey: boolean
  altKey: boolean
  raf: number | null
}

type PointerState = { x: number; y: number }

export type CanvasHandlers = {
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerCancel: (e: React.PointerEvent<SVGSVGElement>) => void
  onWheel: (e: React.WheelEvent<SVGSVGElement>) => void
  onContextMenu: (e: React.MouseEvent<SVGSVGElement>) => void
}

function objectIdFromEvent(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  const el = target.closest('[data-object-id]')
  return el?.getAttribute('data-object-id') ?? null
}

/**
 * Topmost object under a screen point. Overlay elements (measurement lines)
 * sit above the objects, so the event target alone is not enough.
 */
function objectIdAtPoint(clientX: number, clientY: number): string | null {
  if (typeof document === 'undefined') return null
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const id = el.getAttribute?.('data-object-id')
    if (id) return id
  }
  return null
}

function handleFromEvent(target: EventTarget | null): HandleId | null {
  if (!(target instanceof Element)) return null
  const el = target.closest('[data-handle]')
  return (el?.getAttribute('data-handle') as HandleId | null) ?? null
}

export function useCanvasInteractions(svgRef: RefObject<SVGSVGElement>): CanvasHandlers {
  const sessionRef = useRef<Session | null>(null)
  const pointersRef = useRef<Map<number, PointerState>>(new Map())
  const pinchRef = useRef<{ distance: number; center: Point } | null>(null)
  const lastTapRef = useRef<{ time: number; x: number; y: number; objectId: string | null } | null>(null)
  /** Object whose editor opens if the current press ends without movement. */
  const pendingEditRef = useRef<string | null>(null)

  const toLocal = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current?.getBoundingClientRect()
      return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }
    },
    [svgRef],
  )

  const toModel = useCallback(
    (clientX: number, clientY: number): Point => {
      const local = toLocal(clientX, clientY)
      return screenToModel(local, useViewportStore.getState().viewport)
    },
    [toLocal],
  )

  const cancelSession = useCallback(() => {
    const session = sessionRef.current
    if (session?.raf) cancelAnimationFrame(session.raf)
    sessionRef.current = null
    pendingEditRef.current = null
    lastTapRef.current = null
    useInteractionStore.getState().endInteraction()
  }, [])

  // Escape aborts an ongoing drag/resize and restores the start geometry.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (!sessionRef.current) return
      e.preventDefault()
      e.stopPropagation()
      cancelSession()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [cancelSession])

  const buildTargetsFor = useCallback(
    (doc: HengoppProject, movingObjectIds: string[]): SnapTargets =>
      buildSnapTargetsForDocument(doc, movingObjectIds),
    [],
  )

  const startMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>, entityIds: string[]) => {
      const doc = useProjectStore.getState().doc
      const bounds = entitiesBounds(doc, entityIds)
      if (!bounds) return
      const objectIds = objectIdsOfEntities(doc, entityIds)
      const startRects: Record<string, Rect> = {}
      for (const id of objectIds) {
        const o = doc.objects[id]
        if (o) startRects[id] = { x: o.xMm, y: o.yMm, width: o.widthMm, height: o.heightMm }
      }
      const keyId = useInteractionStore.getState().keyId
      const anchorSource =
        entityIds.length === 1 && doc.objects[entityIds[0]]
          ? doc.objects[entityIds[0]]
          : keyId && doc.objects[keyId]
            ? doc.objects[keyId]
            : null

      sessionRef.current = {
        kind: 'move',
        pointerId: e.pointerId,
        startClient: { x: e.clientX, y: e.clientY },
        startModel: toModel(e.clientX, e.clientY),
        lastClient: { x: e.clientX, y: e.clientY },
        entityIds,
        objectIds,
        startRects,
        startBounds: bounds,
        anchor: anchorSource ? anchorPoint(anchorSource) : null,
        targets: buildTargetsFor(doc, objectIds),
        moved: false,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        raf: null,
      }
      useInteractionStore.getState().setMode('drag')
    },
    [buildTargetsFor, toModel],
  )

  const startResize = useCallback(
    (e: React.PointerEvent<SVGSVGElement>, handle: HandleId) => {
      const doc = useProjectStore.getState().doc
      const { selection } = useInteractionStore.getState()
      const bounds = entitiesBounds(doc, selection)
      if (!bounds) return
      const objectIds = objectIdsOfEntities(doc, selection)
      const startRects: Record<string, Rect> = {}
      for (const id of objectIds) {
        const o = doc.objects[id]
        if (o) startRects[id] = { x: o.xMm, y: o.yMm, width: o.widthMm, height: o.heightMm }
      }
      sessionRef.current = {
        kind: 'resize',
        pointerId: e.pointerId,
        startClient: { x: e.clientX, y: e.clientY },
        startModel: toModel(e.clientX, e.clientY),
        lastClient: { x: e.clientX, y: e.clientY },
        entityIds: selection,
        objectIds,
        startRects,
        startBounds: bounds,
        anchor: null,
        handle,
        targets: buildTargetsFor(doc, objectIds),
        moved: false,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        raf: null,
      }
      useInteractionStore.getState().setMode('resize')
    },
    [buildTargetsFor, toModel],
  )

  const computeFrame = useCallback(() => {
    const session = sessionRef.current
    if (!session) return null
    const doc = useProjectStore.getState().doc
    const viewport = useViewportStore.getState().viewport
    const model = toModel(session.lastClient.x, session.lastClient.y)
    const activate = SNAP_ACTIVATE_PX / viewport.scale
    const release = SNAP_RELEASE_PX / viewport.scale
    const tie = SNAP_TIE_PX / viewport.scale
    const guideMargin = 16 / viewport.scale
    const snappingOn = snappingEnabled(doc.settings, session.altKey)

    if (session.kind === 'move') {
      let dx = model.x - session.startModel.x
      let dy = model.y - session.startModel.y
      if (session.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0
        else dx = 0
      }
      if (doc.settings.quantiseDrag) {
        dx = roundToStep(dx, doc.settings.movementStepMm)
        dy = roundToStep(dy, doc.settings.movementStepMm)
      }

      const moved: Rect = {
        x: roundMm(session.startBounds.x + dx),
        y: roundMm(session.startBounds.y + dy),
        width: session.startBounds.width,
        height: session.startBounds.height,
      }
      const movedAnchor = session.anchor
        ? { x: roundMm(session.anchor.x + dx), y: roundMm(session.anchor.y + dy) }
        : null

      let guides: { x?: ReturnType<typeof computeSnap>['xGuide']; y?: ReturnType<typeof computeSnap>['yGuide'] } = {}
      if (snappingOn) {
        const cands = rectSnapCandidates(moved, movedAnchor)
        const snap = computeSnap({
          xCandidates: cands.x,
          yCandidates: cands.y,
          targets: session.targets,
          movingXExtent: [moved.x, moved.x + moved.width],
          movingYExtent: [moved.y, moved.y + moved.height],
          activateMm: activate,
          releaseMm: release,
          tieMm: tie,
          previousXKey: session.prevXKey,
          previousYKey: session.prevYKey,
          guideMarginMm: guideMargin,
        })
        dx = roundMm(dx + snap.deltaXMm)
        dy = roundMm(dy + snap.deltaYMm)
        session.prevXKey = snap.xKey
        session.prevYKey = snap.yKey
        guides = { x: snap.xGuide, y: snap.yGuide }
      } else {
        session.prevXKey = undefined
        session.prevYKey = undefined
      }

      const preview: Record<string, PreviewGeometry> = {}
      for (const id of session.objectIds) {
        const start = session.startRects[id]
        if (!start) continue
        preview[id] = {
          xMm: roundMm(start.x + dx),
          yMm: roundMm(start.y + dy),
          widthMm: start.width,
          heightMm: start.height,
        }
      }
      return { preview, guides, dx, dy, bounds: null as Rect | null }
    }

    if (session.kind === 'resize' && session.handle) {
      const handle = session.handle
      const keepRatio = session.shiftKey
      const fromCenter = session.altKey
      let dx = model.x - session.startModel.x
      let dy = model.y - session.startModel.y

      let bounds = resizeRect(session.startBounds, handle, dx, dy, { keepRatio, fromCenter })
      let guides: { x?: ReturnType<typeof computeSnap>['xGuide']; y?: ReturnType<typeof computeSnap>['yGuide'] } = {}

      // Alt scales from the centre and, per spec, also suspends snapping.
      if (snappingOn && !fromCenter) {
        const flags = {
          left: movesLeft(handle),
          right: movesRight(handle),
          top: movesTop(handle),
          bottom: movesBottom(handle),
        }
        const cands = resizeSnapCandidates(bounds, flags)
        const snap = computeSnap({
          xCandidates: cands.x as SnapCandidate[],
          yCandidates: cands.y as SnapCandidate[],
          targets: session.targets,
          movingXExtent: [bounds.x, bounds.x + bounds.width],
          movingYExtent: [bounds.y, bounds.y + bounds.height],
          activateMm: activate,
          releaseMm: release,
          tieMm: tie,
          previousXKey: session.prevXKey,
          previousYKey: session.prevYKey,
          guideMarginMm: guideMargin,
        })
        if (snap.deltaXMm !== 0 || snap.deltaYMm !== 0) {
          dx += snap.deltaXMm
          dy += snap.deltaYMm
          bounds = resizeRect(session.startBounds, handle, dx, dy, { keepRatio, fromCenter })
        }
        session.prevXKey = snap.xKey
        session.prevYKey = snap.yKey
        guides = { x: snap.xGuide, y: snap.yGuide }
      } else {
        session.prevXKey = undefined
        session.prevYKey = undefined
      }

      const preview: Record<string, PreviewGeometry> = {}
      for (const id of session.objectIds) {
        const start = session.startRects[id]
        if (!start) continue
        const mapped = mapRectBetweenBounds(start, session.startBounds, bounds)
        preview[id] = {
          xMm: mapped.x,
          yMm: mapped.y,
          widthMm: mapped.width,
          heightMm: mapped.height,
        }
      }
      return { preview, guides, dx: 0, dy: 0, bounds }
    }

    return null
  }, [toModel])

  const scheduleFrame = useCallback(() => {
    const session = sessionRef.current
    if (!session || session.raf !== null) return
    session.raf = requestAnimationFrame(() => {
      session.raf = null
      const frame = computeFrame()
      if (!frame) return
      const store = useInteractionStore.getState()
      store.setPreview(frame.preview)
      store.setGuides(frame.guides)
    })
  }, [computeFrame])

  /** Double click / double tap: enter a group, or open the object editor. */
  const openEditor = useCallback((objectId: string) => {
    const doc = useProjectStore.getState().doc
    const { activeGroupId, setActiveGroup, setSelection } = useInteractionStore.getState()
    const entityId = selectableEntityFor(doc, objectId, activeGroupId)
    if (entityId && doc.groups[entityId]) {
      setActiveGroup(entityId)
      const inner = selectableEntityFor(doc, objectId, entityId)
      if (inner) setSelection([inner], inner)
      return
    }
    const targetId = entityId ?? objectId
    if (doc.objects[targetId]) {
      setSelection([targetId], targetId)
      useUiStore.getState().openObjectDialog({ mode: 'edit', objectId: targetId })
    }
  }, [])

  const finishSession = useCallback(() => {
    const session = sessionRef.current
    if (!session) return
    if (session.raf) cancelAnimationFrame(session.raf)
    sessionRef.current = null

    const interaction = useInteractionStore.getState()

    if (!session.moved) {
      interaction.endInteraction()
      // A second press that ended without movement is a double click / tap.
      const pending = pendingEditRef.current
      pendingEditRef.current = null
      if (pending) openEditor(pending)
      return
    }
    pendingEditRef.current = null

    if (session.kind === 'move') {
      const frame = (() => {
        sessionRef.current = session
        const f = computeFrame()
        sessionRef.current = null
        return f
      })()
      if (frame && (frame.dx !== 0 || frame.dy !== 0)) {
        useProjectStore.getState().commit((draft) => {
          for (const id of session.entityIds) translateEntity(draft, id, frame.dx, frame.dy)
        })
      }
    } else if (session.kind === 'resize') {
      const frame = (() => {
        sessionRef.current = session
        const f = computeFrame()
        sessionRef.current = null
        return f
      })()
      if (frame?.bounds) {
        const finalBounds = frame.bounds
        useProjectStore.getState().commit((draft) => {
          scaleEntities(draft, session.entityIds, session.startBounds, finalBounds)
        })
      }
    } else if (session.kind === 'marquee') {
      const hits = interaction.marqueeHits
      const doc = useProjectStore.getState().doc
      const keyId =
        hits.length > 0
          ? hits.reduce((best, id) => (entityTopZ(doc, id) > entityTopZ(doc, best) ? id : best), hits[0])
          : null
      interaction.setSelection(hits, keyId)
    }

    interaction.endInteraction()
  }, [computeFrame, openEditor])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current
      if (!svg) return
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      // Two fingers → pinch zoom / two-finger pan.
      if (pointersRef.current.size === 2) {
        cancelSession()
        const [a, b] = [...pointersRef.current.values()]
        pinchRef.current = {
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        }
        useInteractionStore.getState().setMode('pan')
        return
      }
      if (pointersRef.current.size > 2) return

      const interaction = useInteractionStore.getState()
      const doc = useProjectStore.getState().doc

      // Panning: space + drag, or middle mouse button.
      if (interaction.spacePanArmed || e.button === 1) {
        e.preventDefault()
        svg.setPointerCapture(e.pointerId)
        sessionRef.current = {
          kind: 'pan',
          pointerId: e.pointerId,
          startClient: { x: e.clientX, y: e.clientY },
          startModel: { x: 0, y: 0 },
          lastClient: { x: e.clientX, y: e.clientY },
          entityIds: [],
          objectIds: [],
          startRects: {},
          startBounds: { x: 0, y: 0, width: 0, height: 0 },
          anchor: null,
          targets: { x: [], y: [] },
          moved: false,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          raf: null,
        }
        interaction.setMode('pan')
        return
      }

      if (e.button !== 0 && e.pointerType === 'mouse') return

      const handle = handleFromEvent(e.target)
      if (handle && interaction.selection.length > 0) {
        e.preventDefault()
        svg.setPointerCapture(e.pointerId)
        startResize(e, handle)
        return
      }

      // Measurement lines: toggle the pin, but never steal a press meant for an
      // object underneath. The label always wins; the long dashed line only wins
      // where there is no object.
      const measurement =
        e.target instanceof Element ? e.target.closest<SVGGElement>('[data-measurement-side]') : null
      if (measurement) {
        const stack = document.elementsFromPoint(e.clientX, e.clientY)
        const onLabel = stack.some((el) => el.closest?.('[data-measurement-label]'))
        const overObject = stack.some((el) => el.hasAttribute('data-object-id'))
        if (onLabel || !overObject) {
          e.preventDefault()
          const entityId = measurement.getAttribute('data-measurement-entity')
          const side = measurement.getAttribute('data-measurement-side') as MeasurementSide | null
          if (entityId && side) {
            useProjectStore.getState().commit((draft) => togglePinnedMeasurement(draft, entityId, side))
          }
          return
        }
      }

      const objectId = objectIdFromEvent(e.target) ?? objectIdAtPoint(e.clientX, e.clientY)

      // Double click / double tap. The editor opens only once the second press
      // ends without movement, so "tap to select, then press and drag" keeps
      // working inside the double-tap window.
      const now = Date.now()
      const last = lastTapRef.current
      const isDouble =
        !!last &&
        now - last.time < DOUBLE_TAP_MS &&
        Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_TAP_PX &&
        last.objectId === objectId &&
        // In multi-select mode a second tap means "toggle", not "edit".
        !interaction.multiSelectMode
      lastTapRef.current = { time: now, x: e.clientX, y: e.clientY, objectId }
      pendingEditRef.current = isDouble && objectId ? objectId : null
      if (isDouble) lastTapRef.current = null

      if (objectId) {
        e.preventDefault()
        let entityId = selectableEntityFor(doc, objectId, interaction.activeGroupId)
        if (!entityId) {
          // Clicked outside the active group: step back out to the root level.
          interaction.setActiveGroup(null)
          entityId = selectableEntityFor(doc, objectId, null)
        }
        if (!entityId) return

        const additive = e.metaKey || e.ctrlKey || interaction.multiSelectMode
        let nextSelection: string[]
        if (additive) {
          interaction.toggleSelection(entityId)
          nextSelection = useInteractionStore.getState().selection
        } else if (interaction.selection.includes(entityId)) {
          nextSelection = interaction.selection
          interaction.setSelection(nextSelection, entityId)
        } else {
          nextSelection = [entityId]
          interaction.setSelection(nextSelection, entityId)
        }

        if (nextSelection.length > 0 && nextSelection.includes(entityId)) {
          svg.setPointerCapture(e.pointerId)
          startMove(e, nextSelection)
        }
        return
      }

      // Empty area → marquee selection (and clear on tap).
      e.preventDefault()
      svg.setPointerCapture(e.pointerId)
      const startModel = toModel(e.clientX, e.clientY)
      sessionRef.current = {
        kind: 'marquee',
        pointerId: e.pointerId,
        startClient: { x: e.clientX, y: e.clientY },
        startModel,
        lastClient: { x: e.clientX, y: e.clientY },
        entityIds: [],
        objectIds: [],
        startRects: {},
        startBounds: { x: 0, y: 0, width: 0, height: 0 },
        anchor: null,
        targets: { x: [], y: [] },
        moved: false,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        raf: null,
      }
      interaction.setMode('marquee')
      if (!(e.metaKey || e.ctrlKey || interaction.multiSelectMode)) interaction.clearSelection()
    },
    [cancelSession, startMove, startResize, svgRef, toModel],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      }

      // Pinch zoom / two finger pan.
      if (pointersRef.current.size === 2 && pinchRef.current) {
        const [a, b] = [...pointersRef.current.values()]
        const distance = Math.hypot(a.x - b.x, a.y - b.y)
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const prev = pinchRef.current
        // Zoom around the *previous* midpoint, then translate to the new one.
        // Zooming around the new midpoint would double-count the translation.
        if (prev.distance > 0 && distance > 0) {
          useViewportStore.getState().zoomAt(toLocal(prev.center.x, prev.center.y), distance / prev.distance)
        }
        useViewportStore.getState().pan(center.x - prev.center.x, center.y - prev.center.y)
        pinchRef.current = { distance, center }
        return
      }

      const session = sessionRef.current
      if (!session || session.pointerId !== e.pointerId) return

      const dxPx = e.clientX - session.startClient.x
      const dyPx = e.clientY - session.startClient.y
      if (!session.moved && Math.hypot(dxPx, dyPx) < DRAG_THRESHOLD_PX) return
      // The gesture turned into a drag, so it is no longer a double click/tap.
      session.moved = true
      pendingEditRef.current = null
      session.shiftKey = e.shiftKey
      session.altKey = e.altKey

      if (session.altKey !== useInteractionStore.getState().snapSuspended) {
        useInteractionStore.getState().setSnapSuspended(session.altKey)
      }

      if (session.kind === 'pan') {
        const dx = e.clientX - session.lastClient.x
        const dy = e.clientY - session.lastClient.y
        session.lastClient = { x: e.clientX, y: e.clientY }
        useViewportStore.getState().pan(dx, dy)
        return
      }

      session.lastClient = { x: e.clientX, y: e.clientY }

      if (session.kind === 'marquee') {
        const current = toModel(e.clientX, e.clientY)
        const rect = normaliseRect(session.startModel, current)
        const doc = useProjectStore.getState().doc
        const { activeGroupId } = useInteractionStore.getState()
        const hits = entitiesAtLevel(doc, activeGroupId).filter((id) => {
          const bounds = entityBounds(doc, id)
          return bounds ? rectContainsRect(rect, bounds) : false
        })
        useInteractionStore.getState().setMarquee(rect, hits)
        return
      }

      scheduleFrame()
    },
    [scheduleFrame, toLocal, toModel],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      pointersRef.current.delete(e.pointerId)
      if (pointersRef.current.size < 2) pinchRef.current = null
      if (pointersRef.current.size === 0) useInteractionStore.getState().setSnapSuspended(false)

      const session = sessionRef.current
      if (!session || session.pointerId !== e.pointerId) {
        // No session means the press was handled elsewhere (a measurement, a
        // second finger); never let a pending double tap survive it.
        pendingEditRef.current = null
        if (pointersRef.current.size === 0) useInteractionStore.getState().setMode('idle')
        return
      }
      try {
        svgRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        /* pointer already released */
      }
      session.lastClient = { x: e.clientX, y: e.clientY }
      session.shiftKey = e.shiftKey
      session.altKey = e.altKey
      finishSession()
    },
    [finishSession, svgRef],
  )

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      pointersRef.current.delete(e.pointerId)
      pinchRef.current = null
      cancelSession()
    },
    [cancelSession],
  )

  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      // Ctrl/Cmd + wheel belongs to the browser's own zoom.
      if (e.ctrlKey || e.metaKey) return
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016))
      useViewportStore.getState().zoomAt(toLocal(e.clientX, e.clientY), factor)
    },
    [toLocal],
  )

  const onContextMenu = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Middle/right drag panning should not open the browser menu on the canvas.
    e.preventDefault()
  }, [])

  // The React onWheel handler is passive in some browsers; register natively.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return
      e.preventDefault()
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [svgRef])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onWheel, onContextMenu }
}
