import { expect, type Page } from '@playwright/test'

export type DocSnapshot = {
  objects: Record<
    string,
    { id: string; name: string; xMm: number; yMm: number; widthMm: number; heightMm: number; parentGroupId: string | null; zIndex: number }
  >
  groups: Record<string, { id: string; name: string; childObjectIds: string[]; childGroupIds: string[] }>
  pinnedMeasurements: { id: string; objectId: string; side: string }[]
  surface: { widthMm: number; heightMm: number; color: string }
  displayUnit: string
}

export async function gotoApp(page: Page): Promise<string[]> {
  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(String(err)))
  await page.goto('/')
  await expect(page.getByTestId('canvas')).toBeVisible()
  return consoleErrors
}

/** Complete the first-run surface setup with a known surface size. */
export async function completeSetup(page: Page, widthCm = 300, heightCm = 200): Promise<void> {
  const dialog = page.getByTestId('setup-dialog')
  await expect(dialog).toBeVisible()
  await page.getByTestId('setup-width').fill(String(widthCm))
  await page.getByTestId('setup-height').fill(String(heightCm))
  await page.getByTestId('setup-save').click()
  await expect(dialog).toBeHidden()
}

export async function getDoc(page: Page): Promise<DocSnapshot> {
  return page.evaluate(() => window.__hengopp!.project.getState().doc as unknown as DocSnapshot)
}

export async function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => window.__hengopp!.project.getState().past.length)
}

export async function selection(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__hengopp!.interaction.getState().selection)
}

export async function objectByName(page: Page, name: string) {
  const doc = await getDoc(page)
  const object = Object.values(doc.objects).find((o) => o.name === name)
  if (!object) throw new Error(`No object named ${name}`)
  return object
}

/** Convert model millimetres to viewport pixels inside the browser. */
export async function toScreen(page: Page, xMm: number, yMm: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([mx, my]) => {
      const vp = window.__hengopp!.viewport.getState().viewport
      const svg = document.querySelector('[data-testid="canvas"]') as SVGSVGElement
      const rect = svg.getBoundingClientRect()
      return {
        x: rect.left + mx * vp.scale + vp.offsetX,
        y: rect.top + my * vp.scale + vp.offsetY,
      }
    },
    [xMm, yMm],
  )
}

export async function createObject(
  page: Page,
  options: { name: string; widthCm?: number; heightCm?: number; shape?: 'rectangle' | 'ellipse' },
): Promise<void> {
  await page.getByTestId('new-object').click()
  const dialog = page.getByTestId('object-dialog')
  await expect(dialog).toBeVisible()
  await page.getByTestId('object-name').fill(options.name)
  if (options.shape === 'ellipse') await page.getByTestId('object-shape-ellipse').click()
  if (options.widthCm !== undefined) {
    await page.getByTestId('object-width').fill(String(options.widthCm))
    await page.getByTestId('object-width').press('Enter')
  }
  if (options.heightCm !== undefined) {
    await page.getByTestId('object-height').fill(String(options.heightCm))
    await page.getByTestId('object-height').press('Enter')
  }
  await page.getByTestId('object-save').click()
  await expect(dialog).toBeHidden()
}

/** Drag from one model point to another using real pointer events. */
export async function dragModel(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { modifiers?: ('Alt' | 'Shift' | 'Control' | 'Meta')[]; steps?: number } = {},
): Promise<void> {
  const start = await toScreen(page, from.x, from.y)
  const end = await toScreen(page, to.x, to.y)
  for (const key of options.modifiers ?? []) await page.keyboard.down(key)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 6, start.y + 6, { steps: 2 })
  await page.mouse.move(end.x, end.y, { steps: options.steps ?? 12 })
  await page.mouse.up()
  for (const key of options.modifiers ?? []) await page.keyboard.up(key)
}

export async function clickModel(
  page: Page,
  point: { x: number; y: number },
  options: { modifiers?: ('Alt' | 'Shift' | 'Control' | 'Meta')[] } = {},
): Promise<void> {
  const p = await toScreen(page, point.x, point.y)
  // page.mouse.click() has no modifiers option — hold them on the keyboard.
  for (const key of options.modifiers ?? []) await page.keyboard.down(key)
  await page.mouse.click(p.x, p.y)
  for (const key of options.modifiers ?? []) await page.keyboard.up(key)
}

/** Wait for the debounced autosave to reach localStorage. */
export async function waitForSave(page: Page): Promise<void> {
  await page.waitForTimeout(350)
}

/** Turn snapping off so drag assertions are exact. */
export async function disableSnapping(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__hengopp!.project.getState().patch((draft) => {
      draft.settings.snapToGrid = false
      draft.settings.snapToObjects = false
    })
  })
}
