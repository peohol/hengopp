import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore, __resetProjectStore } from '@/state/project-store'
import { useInteractionStore } from '@/state/interaction-store'
import { useViewportStore } from '@/state/viewport-store'
import { HISTORY_LIMIT } from '@/state/persistence'
import { translateEntity } from '@/geometry/groups'
import { makeObject, makeProject } from './helpers'

const store = () => useProjectStore.getState()

beforeEach(() => {
  __resetProjectStore(
    makeProject([
      makeObject({ id: 'a', xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 }),
      makeObject({ id: 'b', xMm: 300, yMm: 0, widthMm: 100, heightMm: 100 }),
    ]),
  )
  useInteractionStore.setState({ selection: [], keyId: null, activeGroupId: null, preview: {} })
})

describe('transactions', () => {
  it('turns one drag into exactly one history action', () => {
    store().beginTransaction()
    store().updateTransient((draft) => translateEntity(draft, 'a', 25, 10))
    store().commitTransaction()

    expect(store().past).toHaveLength(1)
    expect(store().doc.objects.a.xMm).toBe(25)
  })

  it('still produces one action after 100 pointermove updates', () => {
    store().beginTransaction()
    for (let i = 1; i <= 100; i += 1) {
      store().updateTransient((draft) => {
        draft.objects.a.xMm = i
        draft.objects.a.yMm = i * 2
      })
    }
    store().commitTransaction()

    expect(store().past).toHaveLength(1)
    expect(store().doc.objects.a.xMm).toBe(100)
    store().undo()
    expect(store().doc.objects.a.xMm).toBe(0)
  })

  it('creates no action when a drag is cancelled', () => {
    store().beginTransaction()
    for (let i = 0; i < 20; i += 1) {
      store().updateTransient((draft) => void (draft.objects.a.xMm = i))
    }
    store().cancelTransaction()

    expect(store().past).toHaveLength(0)
    expect(store().doc.objects.a.xMm).toBe(0)
  })

  it('creates no action when nothing actually changed', () => {
    store().beginTransaction()
    store().updateTransient((draft) => void (draft.objects.a.xMm = 0))
    expect(store().commitTransaction()).toBe(false)
    expect(store().past).toHaveLength(0)

    expect(store().commit((draft) => void (draft.objects.a.xMm = 0))).toBe(false)
    expect(store().past).toHaveLength(0)
  })
})

describe('undo and redo', () => {
  it('undoes and redoes a committed action', () => {
    store().commit((draft) => void (draft.objects.a.xMm = 50))
    expect(store().doc.objects.a.xMm).toBe(50)

    store().undo()
    expect(store().doc.objects.a.xMm).toBe(0)
    expect(store().future).toHaveLength(1)

    store().redo()
    expect(store().doc.objects.a.xMm).toBe(50)
    expect(store().future).toHaveLength(0)
  })

  it('clears the redo stack on a new action after undo', () => {
    store().commit((draft) => void (draft.objects.a.xMm = 10))
    store().commit((draft) => void (draft.objects.a.xMm = 20))
    store().undo()
    expect(store().future).toHaveLength(1)

    store().commit((draft) => void (draft.objects.a.yMm = 99))
    expect(store().future).toHaveLength(0)
  })

  it('keeps at most ten previous actions', () => {
    for (let i = 1; i <= 25; i += 1) {
      store().commit((draft) => void (draft.objects.a.xMm = i))
    }
    expect(HISTORY_LIMIT).toBe(10)
    expect(store().past).toHaveLength(10)

    // The ten most recent actions are all undoable.
    for (let i = 0; i < 10; i += 1) store().undo()
    expect(store().doc.objects.a.xMm).toBe(15)
    expect(store().undo()).toBe(false)
  })

  it('does nothing when there is nothing to undo or redo', () => {
    expect(store().undo()).toBe(false)
    expect(store().redo()).toBe(false)
  })
})

describe('what is not history', () => {
  it('ignores selection, hover and group level', () => {
    const before = store().past.length
    useInteractionStore.getState().setSelection(['a'], 'a')
    useInteractionStore.getState().setHover('b')
    useInteractionStore.getState().setActiveGroup(null)
    expect(store().past).toHaveLength(before)
  })

  it('ignores zoom and panning', () => {
    const before = store().past.length
    useViewportStore.getState().zoomBy(2)
    useViewportStore.getState().pan(40, 40)
    expect(store().past).toHaveLength(before)
    expect(store().doc.objects.a.xMm).toBe(0)
  })

  it('ignores transient drag previews', () => {
    const before = store().past.length
    useInteractionStore.getState().setPreview({ a: { xMm: 999, yMm: 999, widthMm: 100, heightMm: 100 } })
    expect(store().past).toHaveLength(before)
    expect(store().doc.objects.a.xMm).toBe(0)
    useInteractionStore.getState().clearPreview()
  })

  it('does not treat settings and display unit as document history', () => {
    const before = store().past.length
    store().patch((draft) => void (draft.displayUnit = 'mm'))
    store().patch((draft) => void (draft.settings.snapToGrid = false))
    expect(store().past).toHaveLength(before)
    expect(store().doc.displayUnit).toBe('mm')
  })

  it('does not change geometry when the display unit changes', () => {
    const before = JSON.stringify(store().doc.objects)
    store().patch((draft) => void (draft.displayUnit = 'mm'))
    expect(JSON.stringify(store().doc.objects)).toBe(before)
  })

  it('keeps patched settings across undo and redo', () => {
    store().commit((draft) => void (draft.objects.a.xMm = 40))
    // Change non-history state after the action.
    store().patch((draft) => {
      draft.displayUnit = 'mm'
      draft.settings.snapToGrid = false
      draft.settings.movementStepMm = 25
    })

    store().undo()
    expect(store().doc.objects.a.xMm).toBe(0)
    expect(store().doc.displayUnit).toBe('mm')
    expect(store().doc.settings.snapToGrid).toBe(false)
    expect(store().doc.settings.movementStepMm).toBe(25)

    store().redo()
    expect(store().doc.objects.a.xMm).toBe(40)
    expect(store().doc.displayUnit).toBe('mm')
    expect(store().doc.settings.snapToGrid).toBe(false)
  })

  it('keeps patched settings across several undo steps', () => {
    for (let i = 1; i <= 4; i += 1) store().commit((draft) => void (draft.objects.a.xMm = i * 10))
    store().patch((draft) => void (draft.displayUnit = 'mm'))
    for (let i = 0; i < 4; i += 1) {
      store().undo()
      expect(store().doc.displayUnit).toBe('mm')
    }
  })

  it('applies a patch made during an open transaction to the base snapshot too', () => {
    store().beginTransaction()
    store().updateTransient((draft) => void (draft.objects.a.xMm = 15))
    store().patch((draft) => void (draft.displayUnit = 'mm'))
    store().commitTransaction()

    store().undo()
    expect(store().doc.objects.a.xMm).toBe(0)
    expect(store().doc.displayUnit).toBe('mm')
  })
})
