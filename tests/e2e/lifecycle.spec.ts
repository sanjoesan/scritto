import { test, expect } from '@playwright/test'

test.describe('Datenschutz & Lifecycle', () => {
  test('shows the privacy modal and banner on load', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/wichtiger hinweis zum datenschutz/i)).toBeVisible()
    await expect(page.getByRole('status')).toContainText(/nichts wird gespeichert/i)
  })

  test('lets the user acknowledge the modal and see the format picker', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /verstanden/i }).click()
    await expect(page.getByText(/wichtiger hinweis zum datenschutz/i)).not.toBeVisible()
    await expect(page.getByRole('heading', { name: /salamanido/i })).toBeVisible()
    await expect(page.getByText(/bald verfügbar/i).first()).toBeVisible()
  })

  test('never persists anything to localStorage, sessionStorage or IndexedDB', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /verstanden/i }).click()

    const storageState = await page.evaluate(async () => {
      const dbNames = 'databases' in indexedDB ? await indexedDB.databases() : []
      return {
        localStorageLength: window.localStorage.length,
        sessionStorageLength: window.sessionStorage.length,
        indexedDbCount: dbNames.length,
      }
    })

    expect(storageState.localStorageLength).toBe(0)
    expect(storageState.sessionStorageLength).toBe(0)
    expect(storageState.indexedDbCount).toBe(0)
  })

  test('shows the privacy modal again after a reload (nothing survives a reload)', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /verstanden/i }).click()
    await expect(page.getByText(/wichtiger hinweis zum datenschutz/i)).not.toBeVisible()

    await page.reload()

    await expect(page.getByText(/wichtiger hinweis zum datenschutz/i)).toBeVisible()
  })
})

test.describe('Responsive Layout', () => {
  test('format picker is usable without horizontal scrolling', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /verstanden/i }).click()

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasHorizontalScroll).toBe(false)
  })
})
