import { expect, test, type Page } from '@playwright/test'
import { completeSetup, createObject, disableSnapping, getDoc, gotoApp, objectByName, selection, toScreen } from './helpers'

async function tapModel(page: Page, xMm: number, yMm: number) {
  const p = await toScreen(page, xMm, yMm)
  await page.touchscreen.tap(p.x, p.y)
}

async function centerOf(page: Page, name: string) {
  const o = await objectByName(page, name)
  return { x: o.xMm + o.widthMm / 2, y: o.yMm + o.heightMm / 2 }
}

test.describe('Narrow, touch-capable viewport', () => {
  test('sets up a surface and creates an object', async ({ page }) => {
    const errors = await gotoApp(page)

    // The setup modal fits inside the narrow viewport.
    const viewportWidth = page.viewportSize()!.width
    const setupBox = await page.getByTestId('setup-dialog').boundingBox()
    expect(setupBox!.width).toBeLessThanOrEqual(viewportWidth)
    expect(setupBox!.x).toBeGreaterThanOrEqual(0)

    await completeSetup(page, 300, 200)

    await page.getByTestId('new-object').click()
    const dialogBox = await page.getByTestId('object-dialog').boundingBox()
    expect(dialogBox!.width).toBeLessThanOrEqual(viewportWidth)
    await page.getByTestId('object-name').fill('Bilde')
    await page.getByTestId('object-save').click()

    const doc = await getDoc(page)
    expect(Object.values(doc.objects)).toHaveLength(1)

    // The page itself never scrolls sideways; only the toolbar does.
    const bodyOverflow = await page.evaluate(
      () => document.body.scrollWidth - document.documentElement.clientWidth,
    )
    expect(bodyOverflow).toBeLessThanOrEqual(0)
    const toolbarScrollable = await page.evaluate(() => {
      const el = document.querySelector('.toolbar')!
      return { scroll: el.scrollWidth, client: el.clientWidth }
    })
    expect(toolbarScrollable.client).toBeLessThanOrEqual(viewportWidth)
    expect(errors).toEqual([])
  })

  test('selects and moves an object by touch', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page, 300, 200)
    await createObject(page, { name: 'Bilde', widthCm: 60, heightCm: 40 })
    await disableSnapping(page)

    const center = await centerOf(page, 'Bilde')
    await tapModel(page, center.x, center.y)
    expect(await selection(page)).toHaveLength(1)

    const before = await objectByName(page, 'Bilde')
    const from = await toScreen(page, center.x, center.y)
    const to = await toScreen(page, center.x + 300, center.y)
    // Immediately after the tap — inside the double-tap window — a press that
    // moves must drag rather than open the editor.
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 8, from.y, { steps: 2 })
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()

    const after = await objectByName(page, 'Bilde')
    expect(after.xMm - before.xMm).toBeGreaterThan(250)
  })

  test('multi-select mode lets tapping add and remove objects', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page, 300, 200)
    await createObject(page, { name: 'A', widthCm: 40, heightCm: 40 })
    await page.getByTestId('prop-x').fill('10')
    await page.getByTestId('prop-x').press('Enter')
    await createObject(page, { name: 'B', widthCm: 40, heightCm: 40 })
    await page.getByTestId('prop-x').fill('200')
    await page.getByTestId('prop-x').press('Enter')

    // Start from an empty selection.
    await page.getByTestId('canvas').click({ position: { x: 5, y: 5 } })
    expect(await selection(page)).toHaveLength(0)

    await page.getByTestId('multi-select').click()
    await expect(page.getByTestId('multi-select')).toHaveAttribute('aria-pressed', 'true')

    const a = await centerOf(page, 'A')
    const b = await centerOf(page, 'B')
    await tapModel(page, a.x, a.y)
    await tapModel(page, b.x, b.y)
    expect(await selection(page)).toHaveLength(2)

    // Tapping an already selected object removes it again. In multi-select mode
    // a quick second tap toggles; it never opens the editor.
    await tapModel(page, b.x, b.y)
    expect(await selection(page)).toHaveLength(1)
    await expect(page.getByTestId('object-dialog')).toBeHidden()

    // Group actions are available from the menu, not only via modifier keys.
    await tapModel(page, b.x, b.y)
    await expect(page.getByTestId('group')).toBeEnabled()
    await page.getByTestId('group').click()
    expect(Object.keys((await getDoc(page)).groups)).toHaveLength(1)
  })

  test('double tap opens the edit dialog', async ({ page }) => {
    await gotoApp(page)
    await completeSetup(page, 300, 200)
    await createObject(page, { name: 'Bilde', widthCm: 60, heightCm: 40 })
    const center = await centerOf(page, 'Bilde')
    const p = await toScreen(page, center.x, center.y)

    await page.touchscreen.tap(p.x, p.y)
    await page.touchscreen.tap(p.x, p.y)
    await expect(page.getByTestId('object-dialog')).toBeVisible()
    await expect(page.getByTestId('object-name')).toHaveValue('Bilde')
  })
})
