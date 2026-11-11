import { test, expect } from '@playwright/test'
import { login } from './helpers/auth.js'
import { STAFF_CREDS } from './fixtures.js'

// หน้านโยบายคืนบริษัท (docs/features/swap-return.md) — อ่านอย่างเดียว ไม่มีปุ่มเขียนข้อมูล
// ค้นด้วยตัวสะกดผิด "แอตแลนติก" เจตนา — ในระบบสะกด "แอตแลนติค"
const STAFF = STAFF_CREDS
test.describe.configure({ timeout: 60_000 })
const COMPANY = 'บริษัท แอตแลนติค ฟาร์มาซูติคอล จำกัด'

async function openFromMenu(page) {
  await login(page, ...STAFF)
  const menuBtn = page.getByRole('button', { name: 'เปิดเมนู' })
  if (await menuBtn.isVisible().catch(() => false)) await menuBtn.click()
  await page.getByRole('button', { name: 'นโยบายคืนบริษัท', exact: true }).first().click()
  // เปิดมาเป็นโหมด "รายการยา" (10/11/2569 — ค้นได้ 3 โหมด)
  await expect(page.getByLabel('ค้นหารายการยา')).toBeVisible({ timeout: 20_000 })
  // รอข้อมูลก่อนค้น — โหลดเดี่ยว ~3–7 วิ (ดึง receive_logs ทีละหน้า) แต่รันขนาน 8 เทสยิงพร้อมกันเกิน 30 วิได้
  // (flaky เดิม: ค้นตอนยัง "กำลังโหลดข้อมูล…" แล้วหาผลไม่เจอ — ตรวจ 11/11/2569)
  await expect(page.getByText('กำลังโหลดข้อมูล…')).toHaveCount(0, { timeout: 45_000 })
}

async function pickCompany(page) {
  await page.getByRole('button', { name: 'บริษัท', exact: true }).click()
  await page.getByLabel('ค้นหาบริษัท').fill('แอตแลนติก')
  await page.getByRole('button', { name: new RegExp(COMPANY.replace(/[()]/g, '\\$&')) }).click()
  await expect(page.getByRole('heading', { name: COMPANY })).toBeVisible()
}

// หลายกลุ่มนโยบายเปิดมาย่อหมด (11/11/2569) — กางก่อนหาแถวยา · กลุ่มเดียวกางอยู่แล้ว ไม่มีปุ่ม
async function expandAll(page) {
  const btn = page.getByRole('button', { name: 'กางทั้งหมด', exact: true })
  if (await btn.isVisible().catch(() => false)) await btn.click()
}

test('staff เปิดจากเมนู ค้นด้วยตัวสะกดใกล้เคียง → เห็น lot คงเหลือของบริษัท', async ({ page }) => {
  await openFromMenu(page)
  await pickCompany(page)
  await expect(page.getByText(/\d+ lot คงเหลือ/)).toBeVisible()
  await expandAll(page)
  await expect(page.getByRole('button', { name: /Phytonadione/ }).first()).toBeVisible()
})

// ภิญโญ = 6 กลุ่มนโยบาย (ตรวจ 11/11/2569) · แอตแลนติคมีกลุ่มเดียว ใช้เทสนี้ไม่ได้
test('หน้าบริษัทหลายกลุ่มนโยบาย: เปิดมาย่อ · กดหัวข้อกางเฉพาะกลุ่มนั้น', async ({ page }) => {
  await openFromMenu(page)
  await page.getByRole('button', { name: 'บริษัท', exact: true }).click()
  await page.getByLabel('ค้นหาบริษัท').fill('ภิญโญ')
  await page.getByRole('button', { name: /ภิญโญฟาร์มาซี/ }).first().click()
  await expect(page.getByRole('heading', { name: /ภิญโญฟาร์มาซี/ })).toBeVisible()
  const heads = page.locator('section > button[aria-expanded]')
  expect(await heads.count()).toBeGreaterThan(1)
  await expect(page.locator('section > button[aria-expanded="true"]')).toHaveCount(0)
  await heads.first().click()
  await expect(heads.first()).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('section > button[aria-expanded="true"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'กางทั้งหมด', exact: true }).click()
  await expect(page.locator('section > button[aria-expanded="false"]')).toHaveCount(0)
})

test('กดแถวยาเปิดบัตรยา · กดย้อนกลับปิดบัตร แล้วยังอยู่บริษัทเดิม', async ({ page }) => {
  await openFromMenu(page)
  await pickCompany(page)
  await expandAll(page)
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

async function pickDrug(page) {
  await page.getByLabel('ค้นหารายการยา').fill('gemotran')
  await page.getByRole('button', { name: /TranexamicAcid 250mg\/5ml/ }).first().click()
  await expect(page.getByText(/เคยซื้อจาก \d+ บริษัท/)).toBeVisible()
}

test('โหมดรายการยา: ชื่อการค้า → เห็นบริษัทที่เคยซื้อ + นโยบาย + ทำต่อ', async ({ page }) => {
  await openFromMenu(page)
  await pickDrug(page)
  await expect(page.getByText(/นโยบายคืนของยานี้ · /)).toBeVisible()
  await expect(page.getByText(/^ทำต่อ: /).first()).toBeVisible()
})

test('โหมด Lot: ค้นเลข lot เจอทั้งในคลังและจากบิล', async ({ page }) => {
  await openFromMenu(page)
  await page.getByRole('button', { name: 'Lot', exact: true }).click()
  await page.getByLabel('ค้นหาLot').fill('161025')
  await expect(page.getByText(/พบ \d+ lot/)).toBeVisible()
})

test('จอ 375px ไม่ล้นแนวนอน', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 700 } })
  const page = await ctx.newPage()
  await openFromMenu(page)
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  await pickDrug(page)
  expect(await overflow()).toBeLessThanOrEqual(0)
  await pickCompany(page)
  expect(await overflow()).toBeLessThanOrEqual(0)
  await ctx.close()
})
