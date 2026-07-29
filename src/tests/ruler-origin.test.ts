import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { resetRulerOrigin, setRulerOrigin } from '@/state/doc-actions'
import { makeObject, makeProject } from './helpers'

describe('the ruler zero point', () => {
  it('starts at the surface origin', () => {
    expect(makeProject().rulerOrigin).toEqual({ xMm: 0, yMm: 0 })
  })

  it('moves one axis at a time', () => {
    const project = makeProject()
    const movedX = produce(project, (draft) => setRulerOrigin(draft, { xMm: 250 }))
    expect(movedX.rulerOrigin).toEqual({ xMm: 250, yMm: 0 })
    const both = produce(movedX, (draft) => setRulerOrigin(draft, { yMm: -120 }))
    expect(both.rulerOrigin).toEqual({ xMm: 250, yMm: -120 })
  })

  it('may sit outside the surface', () => {
    const project = makeProject()
    // Measuring from a point off the wall — a door frame, a floor line — is a
    // normal thing to want, so the origin is never clamped.
    const outside = produce(project, (draft) =>
      setRulerOrigin(draft, { xMm: -500, yMm: project.surface.heightMm + 900 }),
    )
    expect(outside.rulerOrigin).toEqual({ xMm: -500, yMm: project.surface.heightMm + 900 })
  })

  it('goes back to the surface origin on reset', () => {
    const moved = produce(makeProject(), (draft) => setRulerOrigin(draft, { xMm: 250, yMm: 300 }))
    expect(produce(moved, (draft) => resetRulerOrigin(draft)).rulerOrigin).toEqual({ xMm: 0, yMm: 0 })
  })

  it('never touches the geometry', () => {
    const project = makeProject([makeObject({ id: 'a', xMm: 100, yMm: 200 })])
    const moved = produce(project, (draft) => setRulerOrigin(draft, { xMm: 250, yMm: 300 }))
    // The rulers read differently; the model does not change at all.
    expect(moved.objects.a).toEqual(project.objects.a)
    expect(moved.surface).toEqual(project.surface)
  })
})
