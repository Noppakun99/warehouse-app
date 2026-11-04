import { test, expect } from '@playwright/test'
import { login } from './helpers/auth.js'
import { STAFF_CREDS } from './fixtures.js'

// หน้านโยบายคืนบริษัท (docs/features/swap-return.md) — อ่านอย่างเดียว ไม่มีปุ่มเขียนข้อมูล
// ค้นด้วยตัวสะกดผิด "แอตแลนติก" เจตนา — ในระบบสะกด "แอตแลนติค"
const STAFF = STAFF_CREDS
const COMPANY = 'บริษัท แอตแลนติค ฟาร์มาซูติคอล จำกัด'

async function openFromMenu(page) {
  await login(page, ...STAFF)
  const menuBtn = page.getByRole('button', { name: 'เปิดเมนู' })
  if (await menuBtn.isVisible().catch(() => false)) await menuBtn.click()
  await page.getByRole('button', { name: 'นโยบายคืนบริษัท', exact: true }).first().click()
  await expect(page.getByLabel('ค้นหาบริษัท')).toBeVisible({ timeout: 20_000 })
}

async function pickCompany(page) {
  await page.getByLabel('ค้นหาบริษัท').fill('แอตแลนติก')
  await page.getByRole('button', { name: new RegExp(COMPANY.replace(/[()]/g, '\\$&')) }).click()
  await expect(page.getByRole('heading', { name: COMPANY })).toBeVisible()
}

test('staff เปิดจากเมนู ค้นด้วยตัวสะกดใกล้เคียง → เห็น lot คงเหลือของบริษัท', async ({ page }) => {
  await openFromMenu(page)
  await pickCompany(page)
  await expect(page.getByText(/\d+ lot คงเหลือ/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Phytonadione/ }).first()).toBeVisible()
})

test('กดแถวยาเปิดบัตรยา · กดย้อนกลับปิดบัตร แล้วยังอยู่บริษัทเดิม', async ({ page }) => {
  await openFromMenu(page)
  await pickCompany(page)
  await page.getByRole('button', { name: /Phytonadione/ }).first().click()
  await expect(page.getByText('นโยบายคืนบริษัท', { exact: false }).last()).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: COMPANY })).toBeVisible()
  await expect(page.getByLabel('ค้นหาบริษัท')).toBeVisible()
})

test('ค้นจากช่องค้นหารวม (Ctrl+K) → เปิดหน้าบริษัทนั้น', async ({ page }) => {
  await login(page, ...STAFF)
  await page.keyboard.press('Control+k')
  await page.getByLabel('ค้นหายาหรือเมนู').fill('แอตแลนติก')
  await page.getByRole('button', { name: new RegExp('แอตแลนติค') }).first().click()
  await expect(page.getByRole('heading', { name: COMPANY })).toBeVisible({ timeout: 20_000 })
})

test('ผู้เบิกไม่เห็นเมนูและค้นบริษัทไม่เจอ', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('button', { name: 'นโยบายคืนบริษัท', exact: true })).toHaveCount(0)
  await page.keyboard.press('Control+k')
  await page.getByLabel('ค้นหายาหรือเมนู').fill('แอตแลนติก')
  await expect(page.getByText('ไม่พบยาที่ตรงกับ').or(page.getByText('ยา', { exact: true })).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('ดูนโยบายคืน + lot คงเหลือ')).toHaveCount(0)
})

test('จอ 375px ไม่ล้นแนวนอน', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 700 } })
  const page = await ctx.newPage()
  await openFromMenu(page)
  await pickCompany(page)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await ctx.close()
})
