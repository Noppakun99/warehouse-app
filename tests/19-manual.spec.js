import { test, expect } from '@playwright/test'
import { login } from './helpers/auth.js'
import { STAFF_CREDS } from './fixtures.js'

// หน้า "คู่มือและตารางงาน" (ManualApp.jsx) — อ่านอย่างเดียว ไม่กดเพิ่ม/แก้/ลบตาราง
// หัวข้อคู่มือกรองตาม role: ผู้เบิกไม่เห็นกลุ่มงานคลัง/คนทำแทน · staff เห็นคู่มือคนทำแทนช่วงลา
test.describe.configure({ timeout: 60_000 })

async function openManual(page, creds) {
  await login(page, ...(creds || []))
  const menuBtn = page.getByRole('button', { name: 'เปิดเมนู' })
  if (await menuBtn.isVisible().catch(() => false)) await menuBtn.click()
  await page.getByRole('button', { name: 'คู่มือและตารางงาน', exact: true }).locator('visible=true').first().click()
  await expect(page.getByRole('heading', { name: 'คู่มือและตารางงาน' })).toBeVisible({ timeout: 20_000 })
}

test('ผู้เบิก: เห็นเฉพาะหัวข้อของตัวเอง · กางกลุ่มได้ · ค้นหาได้', async ({ page }) => {
  await openManual(page)
  await expect(page.getByRole('button', { name: /หน่วยงานผู้เบิก — เบิก รับ คืนยา/ })).toBeVisible()
  await expect(page.getByText('คู่มือคนทำแทนช่วงลา')).toHaveCount(0)
  await expect(page.getByText('งานคลังประจำวัน')).toHaveCount(0)

  const group = page.getByRole('button', { name: /เริ่มต้นใช้งาน/ })
  await expect(group).toHaveAttribute('aria-expanded', 'false')
  await group.click()
  await expect(group).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('heading', { name: 'ค้นหายา และดูบัตรยา' })).toBeVisible()

  await page.getByLabel('ค้นหาในคู่มือ').fill('เลข PO')
  await expect(page.getByRole('heading', { name: 'ค้นหายา และดูบัตรยา' })).toBeVisible()
  await page.getByLabel('ค้นหาในคู่มือ').fill('ไม่มีคำนี้แน่นอน-zzz')
  await expect(page.getByText(/ไม่พบหัวข้อที่ตรงกับ/)).toBeVisible()
})

// STAFF_CREDS = Kao_9 (admin — fixtures.js) → เห็นปุ่มเพิ่มแถว (ไม่กด) · ผู้เบิกไม่เห็น
test('admin: เห็นคู่มือคนทำแทนช่วงลา · แถบตารางการทำงานมีปุ่มเพิ่มแถว', async ({ page }) => {
  await openManual(page, STAFF_CREDS)
  await expect(page.getByRole('button', { name: /คู่มือคนทำแทนช่วงลา/ })).toBeVisible()
  await page.getByRole('tab', { name: 'ตารางการทำงาน' }).click()
  await expect(page.getByText('ยังไม่มีตารางการทำงาน').or(page.getByText('จันทร์').first())).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'เพิ่มแถว' })).toBeVisible()
})

test('ผู้เบิก: แถบตารางการทำงานดูได้ ไม่มีปุ่มแก้', async ({ page }) => {
  await openManual(page)
  await page.getByRole('tab', { name: 'ตารางการทำงาน' }).click()
  await expect(page.getByText('ยังไม่มีตารางการทำงาน').or(page.getByText('จันทร์').first())).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'เพิ่มแถว' })).toHaveCount(0)
})

test('จอ 375px ไม่ล้นแนวนอน', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await openManual(page, STAFF_CREDS)
  await page.getByRole('button', { name: 'กางทั้งหมด' }).click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.getByRole('tab', { name: 'ตารางการทำงาน' }).click()
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow2).toBeLessThanOrEqual(1)
})
