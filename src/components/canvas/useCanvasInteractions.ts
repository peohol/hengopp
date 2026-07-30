import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { GuideAxis } from '@/models/guide'
import type { HengoppProject, MeasurementSide } from '@/models/project'
import type { MeasureAttachment } from '@/models/measure'
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
  isEntityLocked,
  objectIdsOfEntities,
  selectableEntityFor,
  translateEntity,
} from '@/geometry/groups'
import { resolveGuideDrag, surfaceExtentFor } from '@/geometry/guides'
import { isDrawnMeasure } from '@/geometry/measure-lines'
import { attachmentFromSnap } from '@/geometry/measure-attachments'
import {
  buildSnapTargetsForDocument,
  computeSnap,
  rectSnapCandidates,
  resizeSnapCandidates,
  snapPoint,
  snappingEnabled,
  SNAP_ACTIVATE_PX,
  SNAP_RELEASE_PX,
  SNAP_TIE_PX,
  type SnapCandidate,
  type SnapGuide,
  type SnapTargets,
} from '@/geometry/snapping'
import {
  mapRectBetweenBounds,
  movesBottom,
  movesLeft,
  movesRight,
  movesTop,
  ratioDriverForDrag,
  resizeRect,
  type HandleId,
} from '@/geometry/resizing'
import {
  addMeasureLine,
  moveGuide,
  scaleEntities,
  setMeasureEndpoint,
  toggleGuideLock,
  toggleMeasurePinned,
  togglePinnedMeasurement,
  updateObject,
  type MeasureEnd,
} from '@/state/doc-actions'
import { deleteMeasureLine } from '@/state/commands'
import { useProjectStore } from '@/state/project-store'
import { useInteractionStore, type PreviewGeometry } from '@/state/interaction-store'
import { useViewportStore } from '@/state/viewport-store'
import { useUiStore } from '@/state/ui-store'
import { roundMm, roundToStep } from '@/utils/units'

/** Movement below this many screen pixels counts as a tap, not a drag. */
export const DRAG_THRESHOLD_PX = 4
const DOUBLE_TAP_MS = 500
const DOUBLE_TAP_PX = 24
/** Largest pinch delta taken at face value; ~1.22 × zoom for a single event. */
const PINCH_DELTA_CAP = 20
/** Shorter than this on screen and a measure drag is discarded as a stray tap. */
const MIN_MEASURE_PX = 6

type SessionKind = 'move' | 'resize' | 'marquee' | 'pan' | 'guide' | 'measure'

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
  metaKey: boolean
  raf: number | null
  /** Guide sessions: which guide is being dragged and along which axis. */
  guideId?: string
  guideAxis?: GuideAxis
  guidePos?: number
  /** Measure sessions: the snapped start point of the line being drawn. */
  measureStart?: Point
  measureEnd?: Point
  /** The end that stays put — set when an existing line's end is dragged. */
  measureAnchor?: Point
  /** Existing measuring line the press landed on, if any. */
  measureId?: string
  /** Which end of an existing line is being dragged. */
  measureEndKind?: MeasureEnd
  measureStartAttachment?: MeasureAttachment
  measureEndAttachment?: MeasureAttachment
  /** Objects the current snap is locked onto, for the handle hint. */
  snapObjectIds?: string[]
}

/** A blank session, so each start site only fills in what it actually uses. */
function baseSession(kind: SessionKind, e: React.PointerEvent, startModel: Point): Session {
  return {
    kind,
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
    metaKey: e.metaKey || e.ctrlKey,
    raf: null,
  }
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

function attributeFromEvent(target: EventTarget | null, attribute: string): string | null {
  if (!(target instanceof Element)) return null
  return target.closest(`[${attribute}]`)?.getAttribute(attribute) ?? null
}

export function useCanvasInteractions(svgRef: RefObject<SVGSVGElement>): CanvasHandlers {
  const sessionRef = useRef<Session | null>(null)
  const pointersRef = useRef<Map<number, PointerState>>(new Map())
  const pinchRef = useRef<{ distance: number; center: Point } | null>(null)
  const lastTapRef = useRef<{ time: number; x: number; y: number; objectId: string | null } | null>(null)
  /** Object whose editor opens if the current press ends without movement. */
  const pendingEditRef = useRef<string | null>(null)
  /** Guide whose exact-position popover opens on a double click / tap. */
  const pendingGuideDialogRef = useRef<string | null>(null)
  const lastGuideTapRef = useRef<{ time: number; guideId: string } | null>(null)

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
    pendingGuideDialogRef.current = null
    lastTapRef.current = null
    lastGuideTapRef.current = null
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
        metaKey: e.metaKey || e.ctrlKey,
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
      // A resize maps the whole bounding box, so a single locked member would
      // be dragged along by it. The handles are already withdrawn in that case;
      // this is the guarantee behind them.
      if (selection.some((id) => isEntityLocked(doc, id))) return
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
        metaKey: e.metaKey || e.ctrlKey,
        raf: null,
      }
      useInteractionStore.getState().setMode('resize')
    },
    [buildTargetsFor, toModel],
  )

  /** Drag a guide line. Locked guides only ever get the click, never the drag. */
  const startGuideDrag = useCallback(
    (e: React.PointerEvent<SVGSVGElement>, guideId: string) => {
      const doc = useProjectStore.getState().doc
      const guide = doc.guides.find((g) => g.id === guideId)
      if (!guide) return
      const session = baseSession('guide', e, toModel(e.clientX, e.clientY))
      session.guideId = guideId
      session.guideAxis = guide.axis
      session.guidePos = guide.posMm
      // A guide never snaps to itself, and a locked one is not going anywhere,
      // so the targets are only worth building for a real drag.
      session.targets = guide.locked ? { x: [], y: [] } : buildSnapTargetsForDocument(doc, [], { excludeGuideId: guideId })
      sessionRef.current = session

      const interaction = useInteractionStore.getState()
      interaction.setActiveGuide(guideId)
      interaction.setMode('guide')

      const now = Date.now()
      const last = lastGuideTapRef.current
      const isDouble = !!last && now - last.time < DOUBLE_TAP_MS && last.guideId === guideId
      pendingGuideDialogRef.current = isDouble ? guideId : null
      lastGuideTapRef.current = isDouble ? null : { time: now, guideId }
    },
    [toModel],
  )

  /**
   * Start a measuring gesture: drawing a new line from the pressed point, or —
   * when `editing` is given — dragging one end of an existing line.
   */
  const startMeasure = useCallback(
    (
      e: React.PointerEvent<SVGSVGElement>,
      measureId: string | null,
      editing?: { lineId: string; end: MeasureEnd },
    ) => {
      const doc = useProjectStore.getState().doc
      const viewport = useViewportStore.getState().viewport
      const model = toModel(e.clientX, e.clientY)
      // A line never snaps to itself while one of its own ends is being moved.
      const targets = buildSnapTargetsForDocument(doc, [], { excludeMeasureId: editing?.lineId })
      let startAttachment: MeasureAttachment | undefined
      const start = snappingEnabled(doc.settings, e.altKey)
        ? (() => {
            const snapped = snapPoint({
              point: model,
              targets,
              activateMm: SNAP_ACTIVATE_PX / viewport.scale,
              releaseMm: SNAP_RELEASE_PX / viewport.scale,
              tieMm: SNAP_TIE_PX / viewport.scale,
            })
            const point = { x: snapped.x, y: snapped.y }
            startAttachment = attachmentFromSnap(point, { x: snapped.xGuide, y: snapped.yGuide }, doc)
            return point
          })()
        : model

      const session = baseSession('measure', e, model)
      session.targets = targets
      session.measureId = measureId ?? undefined

      if (editing) {
        const line = doc.measureLines.find((l) => l.id === editing.lineId)
        if (!line) return
        const fixed =
          editing.end === 'start' ? { x: line.x2Mm, y: line.y2Mm } : { x: line.x1Mm, y: line.y1Mm }
        session.measureId = editing.lineId
        session.measureEndKind = editing.end
        session.measureAnchor = fixed
        // The dragged end starts where it already is, so a press that never
        // moves leaves the line exactly as it was.
        session.measureStart = editing.end === 'start' ? { x: line.x1Mm, y: line.y1Mm } : fixed
        session.measureEnd = editing.end === 'start' ? { x: line.x1Mm, y: line.y1Mm } : { x: line.x2Mm, y: line.y2Mm }
      } else {
        session.measureStart = start
        session.measureEnd = start
        session.measureStartAttachment = startAttachment
      }

      sessionRef.current = session
      useInteractionStore.getState().setMode('measure')
    },
    [toModel],
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

    if (session.kind === 'guide' && session.guideAxis && session.guideId) {
      const axis = session.guideAxis
      const raw = axis === 'x' ? model.x : model.y
      const result = resolveGuideDrag({
        axis,
        posMm: raw,
        sizeMm: surfaceExtentFor(doc.surface, axis),
        stepMm: doc.settings.movementStepMm,
        targets: session.targets,
        snappingOn,
        activateMm: activate,
        releaseMm: release,
        tieMm: tie,
        previousKey: axis === 'x' ? session.prevXKey : session.prevYKey,
      })
      if (axis === 'x') session.prevXKey = result.key
      else session.prevYKey = result.key
      session.guidePos = result.posMm
      return {
        preview: {} as Record<string, PreviewGeometry>,
        guides: axis === 'x' ? { x: result.guide } : { y: result.guide },
        dx: 0,
        dy: 0,
        bounds: null as Rect | null,
      }
    }

    if (session.kind === 'measure' && session.measureStart) {
      // The anchor is the end that stays put: the start point while drawing,
      // the opposite end while dragging an existing one.
      const anchorPt = session.measureAnchor ?? session.measureStart
      let point = model
      if (session.shiftKey) {
        // Shift constrains a measurement to the dominant axis, exactly as it
        // constrains a drag.
        const dx = Math.abs(model.x - anchorPt.x)
        const dy = Math.abs(model.y - anchorPt.y)
        point = dx >= dy ? { x: model.x, y: anchorPt.y } : { x: anchorPt.x, y: model.y }
      }
      let guides: { x?: SnapGuide; y?: SnapGuide } = {}
      if (snappingOn) {
        const snapped = snapPoint({
          point,
          targets: session.targets,
          activateMm: activate,
          releaseMm: release,
          tieMm: tie,
          previousXKey: session.prevXKey,
          previousYKey: session.prevYKey,
          guideMarginMm: guideMargin,
        })
        session.prevXKey = snapped.xKey
        session.prevYKey = snapped.yKey
        point = { x: snapped.x, y: snapped.y }
        guides = { x: snapped.xGuide, y: snapped.yGuide }
        session.measureEndAttachment = attachmentFromSnap(point, guides, doc)
      } else {
        session.prevXKey = undefined
        session.prevYKey = undefined
        session.measureEndAttachment = undefined
      }
      session.measureEnd = point
      // Showing the handles and anchor of whichever object the point is locked
      // onto makes the rest of that object's snap points visible too.
      session.snapObjectIds = [guides.x, guides.y]
        .filter((g): g is SnapGuide => !!g && g.source === 'object' && !!g.refId)
        .map((g) => g.refId as string)
        .filter((id, index, all) => all.indexOf(id) === index)
      return {
        preview: {} as Record<string, PreviewGeometry>,
        guides,
        dx: 0,
        dy: 0,
        bounds: null as Rect | null,
      }
    }

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
      // With the ratio locked, the dimension the pointer has travelled furthest
      // along is the one that changes in whole steps; the other is derived from
      // it, so it can land anywhere the ratio demands.
      const ratioDriver = ratioDriverForDrag(dx, dy)
      if (doc.settings.quantiseDrag) {
        // The step governs the change in *size*. Scaling from the centre moves
        // both edges at once, so half a step per edge keeps the size on the step.
        const edges = fromCenter ? 2 : 1
        dx = roundToStep(dx * edges, doc.settings.movementStepMm) / edges
        dy = roundToStep(dy * edges, doc.settings.movementStepMm) / edges
      }

      let bounds = resizeRect(session.startBounds, handle, dx, dy, { keepRatio, fromCenter, ratioDriver })
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
          // Snapping wins over the step, exactly as it does when moving.
          dx += snap.deltaXMm
          dy += snap.deltaYMm
          bounds = resizeRect(session.startBounds, handle, dx, dy, { keepRatio, fromCenter, ratioDriver })
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
      if (session.kind === 'guide' && session.guideId && session.guidePos !== undefined) {
        store.setGuideDrag({ id: session.guideId, posMm: session.guidePos })
      } else if (session.kind === 'measure' && session.measureStart && session.measureEnd) {
        const anchorPt = session.measureAnchor ?? session.measureStart
        // Dragging the start end means the moving point is the *first* one.
        const movingIsStart = session.measureEndKind === 'start'
        store.setMeasureDraft({
          x1Mm: movingIsStart ? session.measureEnd.x : anchorPt.x,
          y1Mm: movingIsStart ? session.measureEnd.y : anchorPt.y,
          x2Mm: movingIsStart ? anchorPt.x : session.measureEnd.x,
          y2Mm: movingIsStart ? anchorPt.y : session.measureEnd.y,
          editingId: session.measureEndKind ? session.measureId : undefined,
        })
        store.setSnapObjectIds(session.snapObjectIds ?? [])
      }
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
      // A press on a guide or a measuring line that never moved is a click:
      // it toggles the lock, or the pinned labels.
      if (session.kind === 'guide' && session.guideId) {
        const guideId = session.guideId
        if (pendingGuideDialogRef.current === guideId) {
          pendingGuideDialogRef.current = null
          // The first click of the pair already toggled the lock. Put it back:
          // opening the exact-position popover must not change the lock state.
          useProjectStore.getState().commit((draft) => toggleGuideLock(draft, guideId))
          useUiStore.getState().openGuideDialog({
            guideId,
            anchor: { x: session.lastClient.x, y: session.lastClient.y },
          })
        } else {
          useProjectStore.getState().commit((draft) => toggleGuideLock(draft, guideId))
        }
        return
      }
      if (session.kind === 'measure' && session.measureId) {
        const measureId = session.measureId
        // Ctrl/Cmd held: the cross shown at the middle of the line means the
        // click removes it. Otherwise a click pins the labels.
        if (session.metaKey) deleteMeasureLine(measureId)
        else if (!session.measureEndKind) {
          useProjectStore.getState().commit((draft) => toggleMeasurePinned(draft, measureId))
        }
        return
      }
      // A second press that ended without movement is a double click / tap.
      const pending = pendingEditRef.current
      pendingEditRef.current = null
      if (pending) openEditor(pending)
      return
    }
    pendingEditRef.current = null
    pendingGuideDialogRef.current = null

    // The last frame may still be queued, so recompute from the final pointer
    // position before committing anything.
    const finalFrame = () => {
      sessionRef.current = session
      const f = computeFrame()
      sessionRef.current = null
      return f
    }

    if (session.kind === 'guide' && session.guideId) {
      finalFrame()
      const guideId = session.guideId
      const guidePos = session.guidePos
      if (guidePos !== undefined) {
        useProjectStore.getState().commit((draft) => moveGuide(draft, guideId, guidePos))
      }
      interaction.endInteraction()
      return
    }

    if (session.kind === 'measure') {
      finalFrame()
      const end = session.measureEnd
      const viewport = useViewportStore.getState().viewport

      // Dragging an existing end just moves that end.
      if (session.measureEndKind && session.measureId && end) {
        const { measureId, measureEndKind } = session
        useProjectStore
          .getState()
          .commit((draft) =>
            setMeasureEndpoint(draft, measureId, measureEndKind, end, session.measureEndAttachment),
          )
        interaction.endInteraction()
        return
      }

      const start = session.measureStart
      if (start && end) {
        const line = {
          x1Mm: start.x,
          y1Mm: start.y,
          x2Mm: end.x,
          y2Mm: end.y,
          pinned: false,
          startAttachment: session.measureStartAttachment,
          endAttachment: session.measureEndAttachment,
        }
        // A flick that never became a real line leaves nothing behind.
        if (isDrawnMeasure({ id: 'draft', ...line }, MIN_MEASURE_PX / viewport.scale)) {
          useProjectStore.getState().commit((draft) => void addMeasureLine(draft, line))
          // The line is drawn; the pointer goes back to being a pointer, which
          // is the mode the new line can actually be worked with in.
          interaction.setTool('select')
        }
      }
      interaction.endInteraction()
      return
    }

    if (session.kind === 'move') {
      const frame = finalFrame()
      if (frame && (frame.dx !== 0 || frame.dy !== 0)) {
        useProjectStore.getState().commit((draft) => {
          for (const id of session.entityIds) translateEntity(draft, id, frame.dx, frame.dy)
        })
      }
    } else if (session.kind === 'resize') {
      const frame = finalFrame()
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
        sessionRef.current = baseSession('pan', e, { x: 0, y: 0 })
        interaction.setMode('pan')
        return
      }

      if (e.button !== 0 && e.pointerType === 'mouse') return

      // The lock badge is the way out of a lock, so it wins every press.
      const lockToggle = attributeFromEvent(e.target, 'data-lock-toggle')
      if (lockToggle) {
        e.preventDefault()
        useProjectStore.getState().commit((draft) => updateObject(draft, lockToggle, { locked: false }))
        return
      }

      // The measure tool owns every press on the canvas — including one that
      // lands on a guide, which is exactly where a measurement often starts. It
      // only ever draws: existing lines are worked with using the select tool.
      if (interaction.tool === 'measure') {
        e.preventDefault()
        svg.setPointerCapture(e.pointerId)
        startMeasure(e, null)
        return
      }

      // An endpoint wins even when it coincides exactly with a selected
      // object's resize handle. SVG hit testing normally only reports the
      // topmost handle, so inspect the complete stack at the pointer. Moving
      // the endpoint away detaches it and exposes the resize handle again.
      const stackedMeasureEnd = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find((el) => el.hasAttribute('data-measure-end-id'))
      const measureEndTarget = stackedMeasureEnd ?? e.target
      const measureEndId = attributeFromEvent(measureEndTarget, 'data-measure-end-id')
      const measureEnd = attributeFromEvent(measureEndTarget, 'data-measure-end') as MeasureEnd | null
      if (measureEndId && measureEnd) {
        e.preventDefault()
        svg.setPointerCapture(e.pointerId)
        startMeasure(e, measureEndId, { lineId: measureEndId, end: measureEnd })
        return
      }

      // The body of a measuring line: pin its labels, or delete it with Ctrl.
      // It gives way to an object underneath, so it never blocks a selection.
      const measureId = attributeFromEvent(e.target, 'data-measure-id')
      if (measureId) {
        const overObject = document
          .elementsFromPoint(e.clientX, e.clientY)
          .some((el) => el.hasAttribute('data-object-id'))
        if (!overObject || e.metaKey || e.ctrlKey) {
          e.preventDefault()
          svg.setPointerCapture(e.pointerId)
          const session = baseSession('measure', e, toModel(e.clientX, e.clientY))
          session.measureId = measureId
          sessionRef.current = session
          return
        }
      }

      // Guide lines: drag to move, click to lock, double click for the exact
      // position. A locked guide can still be clicked — that is how it unlocks.
      const guideId = attributeFromEvent(e.target, 'data-guide-id')
      if (guideId) {
        e.preventDefault()
        svg.setPointerCapture(e.pointerId)
        startGuideDrag(e, guideId)
        return
      }

      const handle = handleFromEvent(e.target)
      if (handle && interaction.selection.length > 0) {
        e.preventDefault()
        svg.setPointerCapture(e.pointerId)
        startResize(e, handle)
        return
      }

      // Measurement lines: toggle the pin, but never steal a press meant for an
      // object underneath. A pinned label still wins, since it is a deliberate
      // artifact that must stay reachable; a temporary one gives way, so a
      // transient label drifting across an object never blocks selecting it.
      const measurement =
        e.target instanceof Element ? e.target.closest<SVGGElement>('[data-measurement-side]') : null
      if (measurement) {
        const stack = document.elementsFromPoint(e.clientX, e.clientY)
        const onPinnedLabel = stack.some(
          (el) => el.closest?.('[data-measurement-label]')?.getAttribute('data-measurement-label') === 'pinned',
        )
        const overObject = stack.some((el) => el.hasAttribute('data-object-id'))
        if (onPinnedLabel || !overObject) {
          e.preventDefault()
          const entityId = measurement.getAttribute('data-measurement-entity')
          const side = measurement.getAttribute('data-measurement-side') as MeasurementSide | null
          // Toggling a distance is one of the things a lock freezes.
          if (entityId && side && !isEntityLocked(doc, entityId)) {
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

        const locked = isEntityLocked(doc, entityId)
        const additive = e.metaKey || e.ctrlKey || interaction.multiSelectMode

        // A locked entity is focusable by a direct click, but never joins a
        // multi-selection: it could not travel with the others anyway.
        if (locked) {
          if (additive) return
          interaction.setSelection([entityId], entityId)
          return
        }

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

        // Locked entities that were already selected stay behind.
        const movable = nextSelection.filter((id) => !isEntityLocked(doc, id))
        if (movable.includes(entityId)) {
          svg.setPointerCapture(e.pointerId)
          startMove(e, movable)
        }
        return
      }

      // Empty area → marquee selection (and clear on tap).
      e.preventDefault()
      svg.setPointerCapture(e.pointerId)
      sessionRef.current = baseSession('marquee', e, toModel(e.clientX, e.clientY))
      interaction.setMode('marquee')
      if (!(e.metaKey || e.ctrlKey || interaction.multiSelectMode)) interaction.clearSelection()
    },
    [cancelSession, startGuideDrag, startMeasure, startMove, startResize, svgRef, toModel],
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
      pendingGuideDialogRef.current = null
      lastGuideTapRef.current = null
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
        // Locked entities are skipped: a marquee is a bulk gesture, and the
        // whole point of the lock is to keep them out of bulk operations.
        const hits = entitiesAtLevel(doc, activeGroupId).filter((id) => {
          if (isEntityLocked(doc, id)) return false
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
      e.preventDefault()
      // A trackpad pinch arrives as Ctrl/Cmd + wheel with much smaller deltas
      // than a wheel notch, so it needs a bigger step per unit. The browser's
      // own zoom is switched off app-wide, so this drives the canvas zoom.
      const pinch = (e.ctrlKey || e.metaKey) && e.deltaMode === 0
      // A real wheel notch held with Ctrl reports ~100–120 px, which the pinch
      // step would turn into a 3× jump. Capping the delta at what a pinch
      // itself produces keeps one notch at roughly one zoom step.
      const delta = pinch ? Math.max(-PINCH_DELTA_CAP, Math.min(PINCH_DELTA_CAP, e.deltaY)) : e.deltaY
      const perUnit = pinch ? 0.01 : e.deltaMode === 1 ? 0.05 : 0.0016
      const factor = Math.exp(-delta * perUnit)
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
      e.preventDefault()
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [svgRef])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onWheel, onContextMenu }
}
