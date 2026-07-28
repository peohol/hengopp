/**
 * Manual visual check: drives the running preview build through the main flows,
 * writes screenshots and reports any console error or unhandled exception.
 *
 *   npx vite build && npx vite preview --port 4173 --host 127.0.0.1
 *   npm run visual-check
 *
 * Env: BASE_URL (default http://127.0.0.1:4173), OUT (screenshot dir),
 *      CHROMIUM_PATH (preinstalled browser).
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = process.env.OUT || 'screenshots'
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
)
const errors = []

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

// --- Desktop ---------------------------------------------------------------
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))

await page.goto(BASE_URL)
await page.waitForSelector('[data-testid="canvas"]')
await shot(page, '01-setup')

await page.getByTestId('setup-width').fill('300')
await page.getByTestId('setup-height').fill('200')
await page.getByTestId('setup-save').click()

// grid on
await page.getByTestId('grid-popover').click()
await page.getByTestId('surface-grid-enabled').check()
await page.getByTestId('surface-grid-preset-3x2').click()
await shot(page, '02-grid-popover')
await page.keyboard.press('Escape')

// create two objects
for (const [name, w, h, shape] of [['Bilde', 60, 40, 'rectangle'], ['Speil', 40, 40, 'ellipse']]) {
  await page.getByTestId('new-object').click()
  await page.getByTestId('object-name').fill(name)
  if (shape === 'ellipse') await page.getByTestId('object-shape-ellipse').click()
  await page.getByTestId('object-width').fill(String(w))
  await page.getByTestId('object-width').press('Enter')
  await page.getByTestId('object-height').fill(String(h))
  await page.getByTestId('object-height').press('Enter')
  if (name === 'Speil') await shot(page, '03-object-dialog')
  await page.getByTestId('object-save').click()
}

// move the second one
await page.getByTestId('prop-x').fill('30')
await page.getByTestId('prop-x').press('Enter')
await page.getByTestId('prop-y').fill('30')
await page.getByTestId('prop-y').press('Enter')
await shot(page, '04-canvas-selected')

// drag near an alignment to show a snap guide
const vp = () => page.evaluate(() => {
  const v = window.__hengopp.viewport.getState().viewport
  const r = document.querySelector('[data-testid="canvas"]').getBoundingClientRect()
  return { ...v, left: r.left, top: r.top }
})
const v = await vp()
const toScreen = (x, y) => ({ x: v.left + x * v.scale + v.offsetX, y: v.top + y * v.scale + v.offsetY })
const doc = await page.evaluate(() => window.__hengopp.project.getState().doc)
const speil = Object.values(doc.objects).find((o) => o.name === 'Speil')
const bilde = Object.values(doc.objects).find((o) => o.name === 'Bilde')
const from = toScreen(speil.xMm + speil.widthMm / 2, speil.yMm + speil.heightMm / 2)
const to = toScreen(bilde.xMm + bilde.widthMm / 2, speil.yMm + speil.heightMm / 2)
await page.mouse.move(from.x, from.y)
await page.mouse.down()
await page.mouse.move(from.x + 8, from.y, { steps: 3 })
await page.mouse.move(to.x + 1, to.y, { steps: 15 })
await page.waitForTimeout(120)
await shot(page, '05-snap-guide')
await page.mouse.up()

// multi-select and align popover
await page.keyboard.press('Control+a')
await page.getByTestId('align-popover').click()
await shot(page, '06-align-popover')
await page.keyboard.press('Escape')
await page.getByTestId('distribute-popover').click()
await shot(page, '07-distribute-popover')
await page.keyboard.press('Escape')

await page.getByTestId('help').click()
await shot(page, '08-help')
await page.keyboard.press('Escape')

// --- Narrow / touch-like viewport -----------------------------------------
const ctx2 = await browser.newContext({
  viewport: { width: 390, height: 780 },
  hasTouch: true,
})
const page2 = await ctx2.newPage()
page2.on('console', (m) => m.type() === 'error' && errors.push('narrow console: ' + m.text()))
page2.on('pageerror', (e) => errors.push('narrow pageerror: ' + String(e)))
await page2.goto(BASE_URL)
await page2.waitForSelector('[data-testid="canvas"]')
await shot(page2, '09-narrow-setup')
await page2.getByTestId('setup-save').click()
await page2.getByTestId('new-object').click()
await page2.getByTestId('object-name').fill('Ramme')
await shot(page2, '10-narrow-dialog')
await page2.getByTestId('object-save').click()
await shot(page2, '11-narrow-canvas')

console.log(JSON.stringify({ screenshots: OUT, errors }, null, 2))
await browser.close()
if (errors.length > 0) process.exitCode = 1
