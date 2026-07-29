import { expect, test, type Page } from '@playwright/test'
import {
  clickModel,
  clickRuler,
  completeSetup,
  createObject,
  disableSnapping,
  dragModel,
  getDoc,
  gotoApp,
  historyLength,
  objectByName,
  selection,
  toScreen,
  waitForSave,
} from './helpers'

/** Centre point of an object in model coordinates. */
async function centerOf(page: Page, name: string) {
  const o = await objectByName(page, name)
  return { x: o.xMm + o.widthMm / 2, y: o.yMm + o.heightMm / 2 }
}

async function dragHandle(page: Page, handle: string, dxPx: number, dyPx: number) {
  const box = await page.getByTestId(`handle-${handle}`).boundingBox()
  if (!box) throw new Error(`Handle ${handle} not found`)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 6, cy + 6, { steps: 2 })
  await page.mouse.move(cx + dxPx, cy + dyPx, { steps: 12 })
  await page.mouse.up()
}

test.describe('Hengopp', () => {
  test('1–2: create the surface and an object', async ({ page }) => {
    const errors = await gotoApp(page)
    await completeSetup(page, 300, 200)

    let doc = await getDoc(page)
    expect(doc.surface.widthMm).toBe(3000)
    expect(doc.surface.heightMm).toBe(2000)

    await createObject(page, { name: 'Bilde', widthCm: 60, heightCm: 40 })
    doc = await getDoc(page)
    const objects = Object.values(doc.objects)
    expect(objects).toHaveLength(1)
    expect(objects[0].name).toBe('Bilde')
    // New objects are placed in the middle of the surface.
    expect(objects[0].xMm).toBeCloseTo(1200, 3)
    expect(objects[0].yMm).toBeCloseTo(800, 3)
    expect(objects[0].widthMm).toBe(600)
    expect(objects[0].heightMm).toBe(400)
    // Creating the object is exactly one history action.
    expect(await historyLength(page)).toBe(1)
    expect(errors).toEqual([])
  })

  test('3: move an object with the mouse, arrow keys and inputs', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await createObject(page, { name: 'Bilde', widthCm: 60, heightCm: 40 })
    await disableSnapping(page)

    const before = await objectByName(page, 'Bilde')
    const center = await centerOf(page, 'Bilde')
    const historyBefore = await historyLength(page)

    await dragModel(page, center, { x: center.x + 400, y: center.y + 200 })

    const after = await objectByName(page, 'Bilde')
    expect(after.xMm - before.xMm).toBeGreaterThan(380)
    expect(after.xMm - before.xMm).toBeLessThan(420)
    expect(after.yMm - before.yMm).toBeGreaterThan(180)
    expect(after.yMm - before.yMm).toBeLessThan(220)
    // One completed drag is exactly one history action.
    expect(await historyLength(page)).toBe(historyBefore + 1)

    // Arrow key moves by the movement step (10 mm default).
    await page.getByTestId('canvas').click({ position: { x: 5, y: 5 } })
    await clickModel(page, await centerOf(page, 'Bilde'))
    const beforeKey = await objectByName(page, 'Bilde')
    await page.keyboard.press('ArrowRight')
    let now = await objectByName(page, 'Bilde')
    expect(now.xMm).toBeCloseTo(beforeKey.xMm + 10, 3)

    await page.keyboard.press('Shift+ArrowLeft')
    now = await objectByName(page, 'Bilde')
    expect(now.xMm).toBeCloseTo(beforeKey.xMm - 90, 3)

    // Editing the X input commits one history action.
    const historyBeforeInput = await historyLength(page)
    await page.getByTestId('prop-x').fill('50')
    await page.getByTestId('prop-x').press('Enter')
    now = await objectByName(page, 'Bilde')
    expect(now.xMm).toBe(500)
    expect(await historyLength(page)).toBe(historyBeforeInput + 1)
  })

  test('4: resize with a corner handle', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await createObject(page, { name: 'Bilde', widthCm: 60, heightCm: 40 })
    await disableSnapping(page)
    await clickModel(page, await centerOf(page, 'Bilde'))
    expect(await selection(page)).toHaveLength(1)

    const before = await objectByName(page, 'Bilde')
    const historyBefore = await historyLength(page)
    await dragHandle(page, 'se', 60, 40)
    const after = await objectByName(page, 'Bilde')

    expect(after.widthMm).toBeGreaterThan(before.widthMm)
    expect(after.heightMm).toBeGreaterThan(before.heightMm)
    // The opposite corner stayed put.
    expect(after.xMm).toBeCloseTo(before.xMm, 3)
    expect(after.yMm).toBeCloseTo(before.yMm, 3)
    expect(await historyLength(page)).toBe(historyBefore + 1)

    // Width can also be set from the toolbar.
    await page.getByTestId('prop-width').fill('80')
    await page.getByTestId('prop-width').press('Enter')
    expect((await objectByName(page, 'Bilde')).widthMm).toBe(800)
  })

  test('5: undo and redo', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await createObject(page, { name: 'Bilde', widthCm: 60, heightCm: 40 })
    await disableSnapping(page)
    const original = await objectByName(page, 'Bilde')

    await clickModel(page, await centerOf(page, 'Bilde'))
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    expect((await objectByName(page, 'Bilde')).xMm).toBeCloseTo(original.xMm + 20, 3)

    await page.getByTestId('undo').click()
    expect((await objectByName(page, 'Bilde')).xMm).toBeCloseTo(original.xMm + 10, 3)
    await page.getByTestId('undo').click()
    expect((await objectByName(page, 'Bilde')).xMm).toBeCloseTo(original.xMm, 3)

    await page.getByTestId('redo').click()
    expect((await objectByName(page, 'Bilde')).xMm).toBeCloseTo(original.xMm + 10, 3)

    // Undoing the creation removes the object again.
    await page.getByTestId('undo').click()
    await page.getByTestId('undo').click()
    expect(Object.keys((await getDoc(page)).objects)).toHaveLength(0)
    await page.getByTestId('redo').click()
    expect(Object.keys((await getDoc(page)).objects)).toHaveLength(1)
  })

  test('6–8: multi-select and align', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await createObject(page, { name: 'A', widthCm: 40, heightCm: 40 })
    await disableSnapping(page)
    // Move A out of the way so the next object does not land on top of it.
    await clickModel(page, await centerOf(page, 'A'))
    await page.getByTestId('prop-x').fill('20')
    await page.getByTestId('prop-x').press('Enter')
    await page.getByTestId('prop-y').fill('20')
    await page.getByTestId('prop-y').press('Enter')

    await createObject(page, { name: 'B', widthCm: 30, heightCm: 60 })
    const b = await objectByName(page, 'B')
    expect(b.name).toBe('B')

    // Ctrl-click adds to the selection; the last click becomes the key object.
    await clickModel(page, await centerOf(page, 'B'))
    await clickModel(page, await centerOf(page, 'A'), { modifiers: ['Control'] })
    expect(await selection(page)).toHaveLength(2)
    const keyId = await page.evaluate(() => window.__hengopp!.interaction.getState().keyId)
    const aObject = await objectByName(page, 'A')
    expect(keyId).toBe(aObject.id)

    const historyBefore = await historyLength(page)
    const bBefore = await objectByName(page, 'B')
    await page.getByTestId('align-popover').click()
    await page.getByTestId('align-reference-key').click()

    await page.getByTestId('align-left').click()
    const bAfterX = await objectByName(page, 'B')
    expect(bAfterX.xMm).toBeCloseTo(aObject.xMm, 3)
    // Horizontal alignment must leave every y-position untouched.
    expect(bAfterX.yMm).toBeCloseTo(bBefore.yMm, 3)

    await page.getByTestId('align-top').click()
    const a2 = await objectByName(page, 'A')
    const b2 = await objectByName(page, 'B')
    // The key object never moved; B aligned to it on both axes.
    expect(a2.xMm).toBeCloseTo(aObject.xMm, 3)
    expect(a2.yMm).toBeCloseTo(aObject.yMm, 3)
    expect(b2.xMm).toBeCloseTo(a2.xMm, 3)
    expect(b2.yMm).toBeCloseTo(a2.yMm, 3)
    expect(await historyLength(page)).toBe(historyBefore + 2)
  })

  test('8b: aligning against the surface centres a single object', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await disableSnapping(page)
    await createObject(page, { name: 'A', widthCm: 40, heightCm: 40 })
    await clickModel(page, await centerOf(page, 'A'))

    const doc = await getDoc(page)
    await page.getByTestId('align-popover').click()
    await page.getByTestId('align-center-x').click()
    await page.getByTestId('align-bottom').click()

    const a = await objectByName(page, 'A')
    expect(a.xMm + a.widthMm / 2).toBeCloseTo(doc.surface.widthMm / 2, 3)
    expect(a.yMm + a.heightMm).toBeCloseTo(doc.surface.heightMm, 3)
  })

  test('9: distribute three objects', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await disableSnapping(page)

    for (const [name, x] of [
      ['A', 0],
      ['B', 300],
      ['C', 2000],
    ] as const) {
      await createObject(page, { name, widthCm: 20, heightCm: 20 })
      await clickModel(page, await centerOf(page, name))
      await page.getByTestId('prop-x').fill(String(x / 10))
      await page.getByTestId('prop-x').press('Enter')
      await page.getByTestId('prop-y').fill('50')
      await page.getByTestId('prop-y').press('Enter')
    }

    await page.keyboard.press('Control+a')
    expect(await selection(page)).toHaveLength(3)

    const historyBefore = await historyLength(page)
    await page.getByTestId('distribute-popover').click()
    await page.getByTestId('distribute-horizontal').click()

    const a = await objectByName(page, 'A')
    const b = await objectByName(page, 'B')
    const c = await objectByName(page, 'C')
    const gap1 = b.xMm - (a.xMm + a.widthMm)
    const gap2 = c.xMm - (b.xMm + b.widthMm)
    expect(Math.abs(gap1 - gap2)).toBeLessThan(0.5)
    // The outermost objects stayed put.
    expect(a.xMm).toBeCloseTo(0, 3)
    expect(c.xMm).toBeCloseTo(2000, 3)
    expect(await historyLength(page)).toBe(historyBefore + 1)
  })

  test('10: group and ungroup', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await disableSnapping(page)
    await createObject(page, { name: 'A', widthCm: 30, heightCm: 30 })
    await clickModel(page, await centerOf(page, 'A'))
    await page.getByTestId('prop-x').fill('20')
    await page.getByTestId('prop-x').press('Enter')
    await createObject(page, { name: 'B', widthCm: 30, heightCm: 30 })

    await page.keyboard.press('Control+a')
    await page.getByTestId('group').click()

    let doc = await getDoc(page)
    expect(Object.keys(doc.groups)).toHaveLength(1)
    const groupId = Object.keys(doc.groups)[0]
    expect(await selection(page)).toEqual([groupId])

    // Moving the group moves both children by the same delta.
    const beforeA = doc.objects[Object.values(doc.objects).find((o) => o.name === 'A')!.id]
    await page.keyboard.press('ArrowRight')
    doc = await getDoc(page)
    const afterA = Object.values(doc.objects).find((o) => o.name === 'A')!
    expect(afterA.xMm).toBeCloseTo(beforeA.xMm + 10, 3)

    // Ungrouping keeps absolute positions.
    await page.getByTestId('ungroup').click()
    doc = await getDoc(page)
    expect(Object.keys(doc.groups)).toHaveLength(0)
    expect(Object.values(doc.objects).find((o) => o.name === 'A')!.xMm).toBeCloseTo(afterA.xMm, 3)
  })

  test('11: pin a measurement line', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await createObject(page, { name: 'Bilde', widthCm: 60, heightCm: 40 })
    await clickModel(page, await centerOf(page, 'Bilde'))

    // Four temporary measurements are shown for a single selection.
    await expect(page.getByTestId('measurement-left')).toBeVisible()
    await expect(page.getByTestId('measurement-right')).toBeVisible()
    await expect(page.getByTestId('measurement-top')).toBeVisible()
    await expect(page.getByTestId('measurement-bottom')).toBeVisible()

    const historyBefore = await historyLength(page)
    await page.getByTestId('measurement-hit-left').click({ force: true })

    let doc = await getDoc(page)
    expect(doc.pinnedMeasurements).toHaveLength(1)
    expect(doc.pinnedMeasurements[0].side).toBe('left')
    expect(await historyLength(page)).toBe(historyBefore + 1)
    await expect(page.getByTestId('measurement-left-pinned')).toBeVisible()

    // It survives deselection.
    await page.getByTestId('canvas').click({ position: { x: 5, y: 5 } })
    await expect(page.getByTestId('measurement-left-pinned')).toBeVisible()
    await expect(page.getByTestId('measurement-right')).toBeHidden()

    // Clicking again releases it, and that is undoable.
    await page.getByTestId('measurement-hit-left').click({ force: true })
    doc = await getDoc(page)
    expect(doc.pinnedMeasurements).toHaveLength(0)
    await page.getByTestId('undo').click()
    expect((await getDoc(page)).pinnedMeasurements).toHaveLength(1)
  })

  test('11b: labels sit on their line, carry the object colour and step aside', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await createObject(page, { name: 'Bilde', widthCm: 60, heightCm: 40 })
    await clickModel(page, await centerOf(page, 'Bilde'))

    // The label is the pointed banner drawn straight on its own line.
    const label = page.getByTestId('measurement-label-left')
    await expect(label).toHaveJSProperty('tagName', 'path')
    const line = await page.locator('[data-testid="measurement-left"] line').nth(1).boundingBox()
    const labelBox = await label.boundingBox()
    const labelCy = labelBox!.y + labelBox!.height / 2
    expect(Math.abs(labelCy - (line!.y + line!.height / 2))).toBeLessThan(2)

    // Its background is a lighter version of the object's own fill.
    const fill = await label.getAttribute('fill')
    const objectFill = await page.locator('[data-object-id]').first().getAttribute('fill')
    expect(fill).not.toBe(objectFill)
    const luminance = (hex: string) => {
      const v = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255
      const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
      return 0.2126 * lin(v(1)) + 0.7152 * lin(v(3)) + 0.0722 * lin(v(5))
    }
    expect(luminance(fill!)).toBeGreaterThan(luminance(objectFill!))

    // Two left measurements that want the exact same spot must not stack.
    await createObject(page, { name: 'Speil', widthCm: 30, heightCm: 30 })
    for (const [field, value] of [
      ['prop-x', '120'],
      ['prop-y', '85'],
    ] as const) {
      await page.getByTestId(field).fill(value)
      await page.getByTestId(field).press('Enter')
    }
    // Both objects now share a vertical centre, so both left measurements run
    // along the same line and prefer the very same midpoint. Pinning them
    // through the document keeps the setup independent of overlapping hit areas.
    await page.evaluate(() => {
      window.__hengopp!.project.getState().commit((draft) => {
        for (const object of Object.values(draft.objects)) {
          draft.pinnedMeasurements.push({ id: `m-${object.id}`, objectId: object.id, side: 'left' })
        }
      })
    })
    await page.getByTestId('canvas').click({ position: { x: 5, y: 5 } })

    const boxes = await page.getByTestId('measurement-label-left').all()
    expect(boxes).toHaveLength(2)
    const [a, b] = await Promise.all(boxes.map((l) => l.boundingBox()))
    const overlapX = Math.min(a!.x + a!.width, b!.x + b!.width) - Math.max(a!.x, b!.x)
    const overlapY = Math.min(a!.y + a!.height, b!.y + b!.height) - Math.max(a!.y, b!.y)
    expect(overlapX <= 0 || overlapY <= 0).toBe(true)
  })

  test('11c: the anchor snaps to each axis on its own', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await createObject(page, { name: 'Bilde', widthCm: 60, heightCm: 40 })
    await page.getByTestId('edit-object').click()

    // A 3 × 3 grid: neither centre line coincides with a grid line.
    await page.getByTestId('object-grid-preset-custom').click()
    for (const [field, value] of [
      ['object-grid-cols', '3'],
      ['object-grid-rows', '3'],
    ] as const) {
      await page.getByTestId(field).fill(value)
      await page.getByTestId(field).press('Enter')
    }

    const rect = (await page.locator('[data-testid="object-preview"] rect').boundingBox())!
    const dragTo = async (u: number, v: number) => {
      await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5)
      await page.mouse.down()
      await page.mouse.move(rect.x + rect.width * u, rect.y + rect.height * v, { steps: 6 })
      await page.mouse.up()
    }
    const anchor = async () => {
      await page.getByTestId('object-save').click()
      const doc = await getDoc(page)
      const object = Object.values(doc.objects).find((o) => o.name === 'Bilde')!
      await page.getByTestId('edit-object').click()
      return (object as unknown as { anchor: { u: number; v: number } }).anchor
    }

    // A vertical grid line with a freely placed y: one axis snapped, one not.
    await dragTo(1 / 3 + 0.004, 0.43)
    let a = await anchor()
    expect(a.u).toBeCloseTo(1 / 3, 3)
    expect(Math.abs(a.v - 0.5)).toBeGreaterThan(0.02)

    // The object's own centre, which no grid line passes through.
    await dragTo(0.5 + 0.004, 0.5 - 0.004)
    a = await anchor()
    expect(a.u).toBeCloseTo(0.5, 3)
    expect(a.v).toBeCloseTo(0.5, 3)

    // A grid line crossing the bounding box edge.
    await dragTo(2 / 3 - 0.004, 0.012)
    a = await anchor()
    expect(a.u).toBeCloseTo(2 / 3, 3)
    expect(a.v).toBeCloseTo(0, 3)

    // The centre line crossing the bottom edge.
    await dragTo(0.5 - 0.004, 0.99)
    a = await anchor()
    expect(a.u).toBeCloseTo(0.5, 3)
    expect(a.v).toBeCloseTo(1, 3)
  })

  test('13: zoom and pan never change model values or the toolbar', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await createObject(page, { name: 'Bilde', widthCm: 60, heightCm: 40 })
    const before = await objectByName(page, 'Bilde')
    const toolbarBox = await page.getByTestId('toolbar').boundingBox()
    const historyBefore = await historyLength(page)

    const canvas = await page.getByTestId('canvas').boundingBox()
    await page.mouse.move(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2)
    await page.mouse.wheel(0, -600)
    await page.waitForTimeout(60)
    await page.mouse.wheel(0, 300)
    await page.getByTestId('zoom-in').click()
    await page.getByTestId('zoom-out').click()

    // Space + drag pans.
    await page.keyboard.down('Space')
    await page.mouse.move(canvas!.x + 400, canvas!.y + 400)
    await page.mouse.down()
    await page.mouse.move(canvas!.x + 520, canvas!.y + 460, { steps: 8 })
    await page.mouse.up()
    await page.keyboard.up('Space')

    const after = await objectByName(page, 'Bilde')
    expect(after.xMm).toBe(before.xMm)
    expect(after.yMm).toBe(before.yMm)
    expect(after.widthMm).toBe(before.widthMm)
    // Nothing of this is a document action.
    expect(await historyLength(page)).toBe(historyBefore)
    // The toolbar is unaffected by canvas zoom.
    expect(await page.getByTestId('toolbar').boundingBox()).toEqual(toolbarBox)

    await page.getByTestId('zoom-fit').click()
    await expect(page.getByTestId('zoom-percent')).toHaveValue('100')
  })

  test('13b: a trackpad pinch zooms the canvas, never the browser', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await page.getByTestId('zoom-fit').click()

    const canvas = (await page.getByTestId('canvas').boundingBox())!
    const scaleBefore = await page.evaluate(() => window.__hengopp!.viewport.getState().viewport.scale)

    // A trackpad pinch reaches the page as Ctrl + wheel; the browser's own zoom
    // is switched off, so the canvas takes it.
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -120)
    await page.keyboard.up('Control')
    await page.waitForTimeout(60)

    const scaleAfter = await page.evaluate(() => window.__hengopp!.viewport.getState().viewport.scale)
    expect(scaleAfter).toBeGreaterThan(scaleBefore)
    // A wheel notch held with Ctrl reports the same delta as a hard pinch; one
    // notch must stay one step rather than jumping several zoom levels.
    expect(scaleAfter / scaleBefore).toBeLessThan(1.3)

    // Ctrl + wheel over the toolbar is swallowed, so the page never scales.
    const prevented = await page.evaluate(() => {
      const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -120 })
      document.querySelector('[data-testid="toolbar"]')!.dispatchEvent(wheel)
      return wheel.defaultPrevented
    })
    expect(prevented).toBe(true)
  })

  test('14: marquee selects the objects fully inside the rectangle', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await disableSnapping(page)
    await createObject(page, { name: 'A', widthCm: 30, heightCm: 30 })
    await page.getByTestId('prop-x').fill('10')
    await page.getByTestId('prop-x').press('Enter')
    await page.getByTestId('prop-y').fill('10')
    await page.getByTestId('prop-y').press('Enter')
    await createObject(page, { name: 'B', widthCm: 30, heightCm: 30 })
    await page.getByTestId('prop-x').fill('200')
    await page.getByTestId('prop-x').press('Enter')
    await page.getByTestId('prop-y').fill('120')
    await page.getByTestId('prop-y').press('Enter')

    // A rectangle that fully contains A but only clips B.
    await dragModel(page, { x: 50, y: 50 }, { x: 1500, y: 1500 })
    const ids = await selection(page)
    const a = await objectByName(page, 'A')
    expect(ids).toEqual([a.id])
  })

  test('15: snapping aligns edges and shows a guide at any zoom level', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await createObject(page, { name: 'A', widthCm: 40, heightCm: 40 })
    await page.getByTestId('prop-x').fill('50')
    await page.getByTestId('prop-x').press('Enter')
    await page.getByTestId('prop-y').fill('30')
    await page.getByTestId('prop-y').press('Enter')
    await createObject(page, { name: 'B', widthCm: 20, heightCm: 20 })

    for (const zoom of [100, 220]) {
      await page.getByTestId('zoom-percent').fill(String(zoom))
      await page.getByTestId('zoom-percent').press('Enter')

      const a = await objectByName(page, 'A')
      const b = await objectByName(page, 'B')
      const from = { x: b.xMm + b.widthMm / 2, y: b.yMm + b.heightMm / 2 }
      // Aim 4 mm to the right of A's left edge — inside the snap threshold.
      const to = { x: a.xMm + 4 + b.widthMm / 2, y: b.yMm + b.heightMm / 2 }

      const start = await toScreen(page, from.x, from.y)
      const end = await toScreen(page, to.x, to.y)
      await page.mouse.move(start.x, start.y)
      await page.mouse.down()
      await page.mouse.move(start.x + 8, start.y, { steps: 3 })
      await page.mouse.move(end.x, end.y, { steps: 10 })
      // A vertical guide has a zero-width box, so assert on presence.
      await expect(page.locator('[data-testid="snap-guide-x"]')).toHaveCount(1)
      await page.mouse.up()

      const snapped = await objectByName(page, 'B')
      expect(snapped.xMm).toBeCloseTo(a.xMm, 3)
    }
  })

  test('16: layer order can be changed', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await createObject(page, { name: 'Bak', widthCm: 60, heightCm: 60 })
    await createObject(page, { name: 'Fram', widthCm: 30, heightCm: 30 })

    let doc = await getDoc(page)
    const bak = Object.values(doc.objects).find((o) => o.name === 'Bak')!
    const fram = Object.values(doc.objects).find((o) => o.name === 'Fram')!
    expect(fram.zIndex).toBeGreaterThan(bak.zIndex)

    const historyBefore = await historyLength(page)
    await page.getByTestId('z-backward').click()
    doc = await getDoc(page)
    expect(doc.objects[fram.id].zIndex).toBeLessThan(doc.objects[bak.id].zIndex)
    expect(await historyLength(page)).toBe(historyBefore + 1)

    await page.getByTestId('z-front').click()
    doc = await getDoc(page)
    expect(doc.objects[fram.id].zIndex).toBeGreaterThan(doc.objects[bak.id].zIndex)
  })

  test('17: the surface grid can be configured and transposed', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)

    await page.getByTestId('grid-popover').click()
    await page.getByTestId('surface-grid-enabled').check()
    await page.getByTestId('surface-grid-preset-5x4').click()
    // 5 × 4 cells over the surface → 4 vertical and 3 horizontal interior lines.
    await expect(page.locator('[data-testid="surface-grid"] line')).toHaveCount(7)

    await page.getByTestId('surface-grid-transpose').click()
    let doc = await getDoc(page)
    expect((doc as unknown as { surfaceGrid: { cols: number; rows: number } }).surfaceGrid).toMatchObject({
      cols: 4,
      rows: 5,
    })

    // Decimal counts expose the phase alignment controls.
    await page.getByTestId('surface-grid-cols').fill('3,5')
    await page.getByTestId('surface-grid-cols').press('Enter')
    await expect(page.getByTestId('surface-grid-halign')).toBeVisible()
    await page.getByTestId('surface-grid-halign-center').click()
    doc = await getDoc(page)
    expect((doc as unknown as { surfaceGrid: { cols: number; hAlign: string } }).surfaceGrid).toMatchObject({
      cols: 3.5,
      hAlign: 'center',
    })

    // The golden section hides the cell controls.
    await page.getByTestId('surface-grid-preset-golden').click()
    await expect(page.getByTestId('surface-grid-cols')).toBeHidden()
    await expect(page.locator('[data-testid="surface-grid"] line')).toHaveCount(4)
  })

  test('18: export and import JSON', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page, 250, 180)
    await createObject(page, { name: 'Bilde', widthCm: 60, heightCm: 40 })

    await page.getByTestId('project-menu').click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('export-project').click()
    const download = await downloadPromise
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const json = Buffer.concat(chunks).toString('utf8')
    expect(JSON.parse(json).objects).toBeTruthy()

    // Wipe the project, then import the file back.
    await page.getByTestId('reset-project').click()
    await page.getByTestId('confirm-ok').click()
    expect(Object.keys((await getDoc(page)).objects)).toHaveLength(0)

    await page.getByTestId('project-menu').click()
    await page.getByTestId('import-file').setInputFiles({
      name: 'hengopp.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json, 'utf8'),
    })
    await page.getByTestId('confirm-ok').click()

    const doc = await getDoc(page)
    expect(Object.values(doc.objects).map((o) => o.name)).toEqual(['Bilde'])
    expect(doc.surface.widthMm).toBe(2500)

    // An invalid file is rejected without touching the project.
    await page.getByTestId('project-menu').click()
    await page.getByTestId('import-file').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"nope": true}', 'utf8'),
    })
    await expect(page.getByTestId('notice').filter({ hasText: /import mislyktes/i })).toHaveCount(1)
    expect(Object.keys((await getDoc(page)).objects)).toHaveLength(1)
  })

  test('19: Escape during a drag restores the start position and writes no history', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await createObject(page, { name: 'Bilde', widthCm: 60, heightCm: 40 })
    await disableSnapping(page)

    const before = await objectByName(page, 'Bilde')
    const historyBefore = await historyLength(page)
    const center = { x: before.xMm + before.widthMm / 2, y: before.yMm + before.heightMm / 2 }
    const start = await toScreen(page, center.x, center.y)
    const end = await toScreen(page, center.x + 500, center.y + 300)

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 8, start.y + 8, { steps: 2 })
    await page.mouse.move(end.x, end.y, { steps: 10 })
    await page.keyboard.press('Escape')
    await page.mouse.up()

    const after = await objectByName(page, 'Bilde')
    expect(after.xMm).toBe(before.xMm)
    expect(after.yMm).toBe(before.yMm)
    expect(await historyLength(page)).toBe(historyBefore)
  })

  test('20: entering and leaving a group level', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page)
    await disableSnapping(page)
    await createObject(page, { name: 'A', widthCm: 30, heightCm: 30 })
    await page.getByTestId('prop-x').fill('20')
    await page.getByTestId('prop-x').press('Enter')
    await createObject(page, { name: 'B', widthCm: 30, heightCm: 30 })
    await page.getByTestId('prop-x').fill('150')
    await page.getByTestId('prop-x').press('Enter')

    await page.keyboard.press('Control+a')
    await page.keyboard.press('Control+g')
    const doc = await getDoc(page)
    const groupId = Object.keys(doc.groups)[0]
    expect(groupId).toBeTruthy()
    await expect(page.getByTestId('breadcrumb')).toBeHidden()

    // Double-click enters the group; a single click then selects a child.
    const a = await objectByName(page, 'A')
    const point = { x: a.xMm + a.widthMm / 2, y: a.yMm + a.heightMm / 2 }
    await clickModel(page, point)
    await clickModel(page, point)
    await expect(page.getByTestId('breadcrumb')).toBeVisible()
    expect(
      await page.evaluate(() => window.__hengopp!.interaction.getState().activeGroupId),
    ).toBe(groupId)
    expect(await selection(page)).toEqual([a.id])

    // Escape leaves the level again and reselects the group.
    await page.keyboard.press('Escape')
    expect(
      await page.evaluate(() => window.__hengopp!.interaction.getState().activeGroupId),
    ).toBeNull()
    expect(await selection(page)).toEqual([groupId])
  })

  test('21: new objects are 80 % opaque and the value is editable', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page, 300, 200)

    await page.getByTestId('new-object').click()
    await expect(page.getByTestId('object-opacity')).toHaveValue('80')
    await page.getByTestId('object-name').fill('Bilde')
    await page.getByTestId('object-save').click()

    let doc = await getDoc(page)
    expect(Object.values(doc.objects)[0].fillOpacity).toBeCloseTo(0.8, 5)
    // The fill really is translucent on the canvas; the border is not.
    await expect(page.getByTestId('object-Bilde')).toHaveAttribute('fill-opacity', '0.8')

    await page.getByTestId('edit-object').click()
    await page.getByTestId('object-opacity-value').fill('45')
    await page.getByTestId('object-save').click()
    doc = await getDoc(page)
    expect(Object.values(doc.objects)[0].fillOpacity).toBeCloseTo(0.45, 5)
  })

  test('22: a new project shows a 2 × 2 surface grid', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page, 300, 200)

    const doc = await getDoc(page)
    expect(doc.surfaceGrid).toMatchObject({ enabled: true, cols: 2, rows: 2 })
    // One interior line per axis.
    await expect(page.locator('[data-testid="surface-grid"] line')).toHaveCount(2)
  })

  test('23: a locked object can be focused and edited, but never moved', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page, 300, 200)
    await createObject(page, { name: 'Fast', widthCm: 60, heightCm: 40 })
    await createObject(page, { name: 'Løs', widthCm: 40, heightCm: 40 })
    await page.getByTestId('prop-x').fill('10')
    await page.getByTestId('prop-x').press('Enter')

    const fast = await objectByName(page, 'Fast')
    await clickModel(page, { x: fast.xMm + fast.widthMm / 2, y: fast.yMm + fast.heightMm / 2 })
    await page.getByTestId('lock-toggle').click()
    expect((await objectByName(page, 'Fast')).locked).toBe(true)

    // No resize handles while the selection is locked.
    await expect(page.getByTestId('handles')).toBeHidden()

    // Dragging it does nothing, and writes no history.
    const before = await historyLength(page)
    await dragModel(
      page,
      { x: fast.xMm + 20, y: fast.yMm + 20 },
      { x: fast.xMm + 400, y: fast.yMm + 300 },
    )
    const afterDrag = await objectByName(page, 'Fast')
    expect(afterDrag.xMm).toBe(fast.xMm)
    expect(afterDrag.yMm).toBe(fast.yMm)
    expect(await historyLength(page)).toBe(before)

    // Arrow keys leave it alone too.
    await page.keyboard.press('ArrowRight')
    expect((await objectByName(page, 'Fast')).xMm).toBe(fast.xMm)

    // A direct click still focuses it; a marquee never picks it up.
    expect(await selection(page)).toEqual([fast.id])
    await dragModel(page, { x: 5, y: 5 }, { x: 2990, y: 1990 })
    expect(await selection(page)).not.toContain(fast.id)
    expect(await selection(page)).toContain((await objectByName(page, 'Løs')).id)

    // Ctrl-clicking it never adds it to a multi-selection.
    const selectionBefore = await selection(page)
    await clickModel(
      page,
      { x: fast.xMm + fast.widthMm / 2, y: fast.yMm + fast.heightMm / 2 },
      { modifiers: ['Control'] },
    )
    expect(await selection(page)).toEqual(selectionBefore)

    // Hovering shows the padlock; clicking it unlocks the object again.
    await clickModel(page, { x: fast.xMm + fast.widthMm / 2, y: fast.yMm + fast.heightMm / 2 })
    const centre = await toScreen(page, fast.xMm + fast.widthMm / 2, fast.yMm + fast.heightMm / 2)
    await page.mouse.move(centre.x - 200, centre.y - 120)
    await page.mouse.move(centre.x, centre.y, { steps: 8 })
    await expect(page.getByTestId('lock-badge')).toBeVisible()
    await page.mouse.click(centre.x, centre.y)
    expect((await objectByName(page, 'Fast')).locked).toBe(false)
  })

  test('24: guides are created from the rulers, snap, lock and take an exact position', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page, 300, 200)

    // A click in the top ruler makes a vertical guide, the left ruler a
    // horizontal one.
    await clickRuler(page, 'top', 1200)
    await clickRuler(page, 'left', 700)
    let doc = await getDoc(page)
    expect(doc.guides.map((g) => g.axis).sort()).toEqual(['x', 'y'])
    const vertical = doc.guides.find((g) => g.axis === 'x')!
    expect(vertical.posMm).toBe(1200)

    // Objects snap to a guide.
    await createObject(page, { name: 'Bilde', widthCm: 40, heightCm: 40 })
    const before = await objectByName(page, 'Bilde')
    await dragModel(
      page,
      { x: before.xMm + before.widthMm / 2, y: before.yMm + before.heightMm / 2 },
      { x: 1206, y: before.yMm + before.heightMm / 2 },
    )
    expect((await objectByName(page, 'Bilde')).xMm + 200).toBe(1200)

    // A single click locks the guide in place; a drag then leaves it alone.
    let p = await toScreen(page, vertical.posMm, 1800)
    await page.mouse.click(p.x, p.y)
    await expect
      .poll(async () => (await getDoc(page)).guides.find((g) => g.axis === 'x')!.locked)
      .toBe(true)
    await page.waitForTimeout(600)
    await dragModel(page, { x: vertical.posMm, y: 1800 }, { x: vertical.posMm + 400, y: 1800 })
    expect((await getDoc(page)).guides.find((g) => g.axis === 'x')!.posMm).toBe(1200)

    // Clicking again unlocks it.
    await page.waitForTimeout(600)
    await page.mouse.click(p.x, p.y)
    await expect
      .poll(async () => (await getDoc(page)).guides.find((g) => g.axis === 'x')!.locked)
      .toBe(false)

    // Double clicking opens the exact-position popover, measured from either
    // edge, and never changes the lock state on its way in.
    await page.waitForTimeout(600)
    p = await toScreen(page, 1200, 1800)
    await page.mouse.dblclick(p.x, p.y)
    await expect(page.getByTestId('guide-popover')).toBeVisible()
    expect((await getDoc(page)).guides.find((g) => g.axis === 'x')!.locked).toBe(false)
    await page.getByTestId('guide-origin-end').click()
    await page.getByTestId('guide-position').fill('50')
    await page.getByTestId('guide-position').press('Enter')
    expect((await getDoc(page)).guides.find((g) => g.axis === 'x')!.posMm).toBe(2500)

    await page.getByTestId('guide-remove').click()
    doc = await getDoc(page)
    expect(doc.guides.filter((g) => g.axis === 'x')).toHaveLength(0)
  })

  test('25: the measure tool draws lines that snap and report their length', async ({ page }) => {
    const errors = await gotoApp(page)
    await completeSetup(page, 300, 200)
    await createObject(page, { name: 'Bilde', widthCm: 60, heightCm: 40 })
    const bilde = await objectByName(page, 'Bilde')

    // The keyboard shortcut switches tool; the canvas stops selecting objects.
    await page.keyboard.press('m')
    await expect(page.getByTestId('measure-tool')).toHaveAttribute('aria-pressed', 'true')

    // A drag near the object's top edge snaps both endpoints to it.
    await dragModel(page, { x: bilde.xMm - 300, y: bilde.yMm + 4 }, { x: bilde.xMm - 3, y: bilde.yMm + 4 })
    let doc = await getDoc(page)
    expect(doc.measureLines).toHaveLength(1)
    expect(doc.measureLines[0].y1Mm).toBe(bilde.yMm)
    expect(doc.measureLines[0].x2Mm).toBe(bilde.xMm)
    // Level, so it is measured horizontally only.
    expect(doc.measureLines[0].y2Mm).toBe(bilde.yMm)

    // Labels appear on hover and disappear again.
    const mid = await toScreen(page, (doc.measureLines[0].x1Mm + bilde.xMm) / 2, bilde.yMm)
    await page.mouse.move(mid.x, mid.y - 200, { steps: 6 })
    await expect(page.getByTestId('measure-label')).toBeHidden()
    await page.mouse.move(mid.x, mid.y, { steps: 6 })
    await expect(page.getByTestId('measure-label')).toBeVisible()
    await expect(page.getByTestId('measure-components')).toBeHidden()

    // Clicking pins them, so they survive the pointer leaving.
    await page.mouse.click(mid.x, mid.y)
    await expect.poll(async () => (await getDoc(page)).measureLines[0].pinned).toBe(true)
    await page.mouse.move(mid.x, mid.y - 200)
    await expect(page.getByTestId('measure-label')).toBeVisible()

    // A diagonal shows its two vector components as well.
    await dragModel(page, { x: 400, y: 1600 }, { x: 1400, y: 1900 }, { modifiers: ['Alt'] })
    doc = await getDoc(page)
    expect(doc.measureLines).toHaveLength(2)
    const diagonal = doc.measureLines[1]
    const dmid = await toScreen(
      page,
      (diagonal.x1Mm + diagonal.x2Mm) / 2,
      (diagonal.y1Mm + diagonal.y2Mm) / 2,
    )
    await page.mouse.move(dmid.x, dmid.y - 80)
    await page.mouse.move(dmid.x, dmid.y, { steps: 6 })
    await expect(page.getByTestId('measure-components')).toBeVisible()
    await expect(page.getByTestId('measure-label-x')).toBeVisible()
    await expect(page.getByTestId('measure-label-y')).toBeVisible()

    // Escape returns to selecting, and objects respond again.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('measure-tool')).toHaveAttribute('aria-pressed', 'false')
    await clickModel(page, { x: bilde.xMm + bilde.widthMm / 2, y: bilde.yMm + bilde.heightMm / 2 })
    expect(await selection(page)).toEqual([bilde.id])
    expect(errors).toEqual([])
  })

  test('12: the project survives a reload', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page, 250, 180)
    await createObject(page, { name: 'Bilde', widthCm: 60, heightCm: 40 })
    await createObject(page, { name: 'Speil', widthCm: 30, heightCm: 30, shape: 'ellipse' })
    await waitForSave(page)

    const before = await getDoc(page)
    await page.reload()
    await expect(page.getByTestId('canvas')).toBeVisible()
    // No setup dialog on a returning visit.
    await expect(page.getByTestId('setup-dialog')).toBeHidden()

    const after = await getDoc(page)
    expect(after.surface).toEqual(before.surface)
    expect(Object.values(after.objects).map((o) => o.name).sort()).toEqual(['Bilde', 'Speil'])
    expect(Object.values(after.objects).find((o) => o.name === 'Bilde')!.xMm).toBe(
      Object.values(before.objects).find((o) => o.name === 'Bilde')!.xMm,
    )
  })
})
