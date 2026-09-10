import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'

test.beforeEach(async ({ page }) => {
  // Exercise the local analysis path without model calls or external font requests.
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/astra/status') return route.fulfill({ json: { available: false, provider: 'none', model: null } })
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return route.abort()
    return route.continue()
  })
  await page.goto('/')
})

function metric(page: Page, label: string) {
  return page.getByRole('article').filter({ has: page.getByText(label, { exact: true }) }).locator('.astra-metric__value')
}

async function screenshot(page: Page, name: string) {
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: `artifacts/${name}.png`, fullPage: true, animations: 'disabled' })
}

test('sample day shows measured metrics and an answer with supporting signals', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Heartbeat' })).toBeVisible()
  await expect(page.getByText('Synthetic data · no wearable needed')).toBeVisible()
  await expect(metric(page, 'FOCUS TIME')).toHaveText('4h 48m')
  await expect(metric(page, 'AVERAGE HEART RATE')).toHaveText('72bpm')
  await expect(metric(page, 'CONTEXT SWITCHES')).toHaveText('9')
  await expect(metric(page, 'WITH AI AGENTS')).toHaveText('2h 50m')
  await screenshot(page, 'observatory-desktop')

  await page.getByRole('button', { name: 'When was I most focused?', exact: true }).click()
  const answer = page.locator('.astra-answer')
  await expect(answer.getByRole('heading', { name: 'When was I most focused?' })).toBeVisible()
  await expect(answer).toContainText('Codex held one continuous app context for 90 minutes.')
  await expect(answer).toContainText('SUPPORTING SIGNALS')
  await expect(answer).toContainText('App continuity does not prove uninterrupted attention.')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('replay slider and moment controls update the displayed time', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Day replay', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Day replay' })).toBeVisible()
  const slider = page.getByRole('slider', { name: 'Explore time' })
  await expect(slider).toHaveAttribute('aria-valuetext', /^09:00, Chrome,/)
  await slider.focus()
  await slider.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuetext', /^09:02, Chrome,/)
  await slider.press('ArrowLeft')
  await expect(slider).toHaveAttribute('aria-valuetext', /^09:00, Chrome,/)
  await slider.press('End')
  await expect(slider).toHaveAttribute('aria-valuetext', /^16:58, Chrome,/)
  await expect(page.locator('.astra-signal-card .astra-small-tag')).toHaveText('16:58')
  await page.getByRole('button', { name: 'Previous moment', exact: true }).click()
  await expect(slider).toHaveAttribute('aria-valuetext', /^16:56, Chrome,/)
  await page.getByRole('button', { name: 'Reset replay', exact: true }).click()
  await expect(slider).toHaveAttribute('aria-valuetext', /^09:00, Chrome,/)
})

test('changing to context overload updates the metrics', async ({ page }) => {
  await expect(metric(page, 'CONTEXT SWITCHES')).toHaveText('9')
  await page.getByRole('combobox', { name: 'Choose a sample day' }).selectOption('overloaded')
  await expect(metric(page, 'FOCUS TIME')).toHaveText('30m')
  await expect(metric(page, 'AVERAGE HEART RATE')).toHaveText('89bpm')
  await expect(metric(page, 'CONTEXT SWITCHES')).toHaveText('107')
  await expect(metric(page, 'WITH AI AGENTS')).toHaveText('4h 40m')
  await expect(page.getByText('Synthetic data · no wearable needed')).toBeVisible()
})

test('memory search, keyboard selection, and open moment preserve the context', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Memory map', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Memory map' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Search memory map' }).fill('codex')
  await expect(page.getByRole('status')).toContainText('4 connections highlighted')
  const codex = page.getByRole('button', { name: /^Codex, Application,/ })
  await codex.focus()
  await codex.press('Enter')
  await expect(codex).toHaveAttribute('aria-pressed', 'true')
  const inspector = page.getByRole('complementary', { name: 'Selected memory details' })
  await expect(inspector.getByRole('heading', { name: 'Codex', exact: true })).toBeVisible()
  await expect(inspector).toContainText('2h 50m')
  await expect(inspector.getByRole('heading', { name: /Connected by shared time/ })).toBeVisible()
  await screenshot(page, 'observatory-memory')
  await inspector.getByRole('button', { name: 'Open moment', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Day replay' })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Explore time' })).toHaveAttribute('aria-valuetext', /^09:24, Codex,/)
})

test('mobile navigation remains named and each view fits a 390px screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  for (const name of ['Observatory', 'Day replay', 'Memory map', 'Pattern lab']) {
    const button = navigation.getByRole('button', { name, exact: true })
    await expect(button).toBeVisible()
    await button.click()
    await expect(button).toHaveAttribute('aria-current', 'page')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: `${name} should not overflow horizontally` }).toBeLessThanOrEqual(1)
  }
  await navigation.getByRole('button', { name: 'Observatory', exact: true }).click()
  await screenshot(page, 'observatory-mobile')
})

test('export downloads JSON that identifies its synthetic source', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export day', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('heartbeat-balanced.json')
  const path = await download.path()
  expect(path).not.toBeNull()
  const payload = JSON.parse(await readFile(path!, 'utf8'))
  expect(payload).toMatchObject({ product: 'Heartbeat Observatory', source: 'Synthetic sample day', scenario: 'balanced', metrics: { focusMinutes: 288, switchCount: 9, agentMinutes: 170 } })
  expect(payload.chapters.length).toBeGreaterThan(0)
  expect(payload.findings.length).toBeGreaterThan(0)
  expect(payload).not.toHaveProperty('timeline')
  expect(payload).not.toHaveProperty('captures')
  await expect(page.getByRole('button', { name: 'Exported', exact: true })).toBeVisible()
})
