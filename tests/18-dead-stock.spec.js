import { test, expect } from '@playwright/test'
import { login } from './helpers/auth.js'
import { STAFF_CREDS } from './fixtures.js'

// หน้ายาไม่เคลื่อนไหว (docs/features/dead-stock.md) — อ่านอย่างเดียว ไม่มีปุ่มเขียนข้อมูล
// ไม่ fix จำนวนรายการ (เปลี่ยนทุกเดือน) — ตรวจว่าตัวเลขบนการ์ด = จำนวนบนแท็บ = จำนวนแถวที่แสดง (Rule #6)
test.describe.configure({ timeout: 90_000 })

async function openFromMenu(page) {
  await login(page, ...STAFF_CREDS)
  const menuBtn = page.getByRole('button', { name: 'เปิดเมนู' })
  if (await menuBtn.isVisible().catch(() => false)) await menuBtn.click()
  await page.getByRole('button', { name: 'ยาไม่เคลื่อนไหว', exact: true }).locator('visible=true').first().click()
  await expect(page.getByRole('group', { name: 'ช่วงเวลาที่ไม่มีเบิก' })).toBeVisible({ timeout: 60_000 })
}

const countOf = async (locator) => Number((await locator.innerText()).match(/\((\d+)\)/)?.[1])

test('staff เปิดจากเมนู: การ์ด แท็บ และรายการนับตรงกัน · กางดูราย lot ได้', async ({ page }) => {
  await openFromMenu(page)
  const reportTab = page.getByRole('button', { name: /^ไม่มีเบิก ≥6 เดือน/ })
  const watchTab = page.getByRole('button', { name: /^เฝ้าดู/ })
  const nReport = await countOf(reportTab)
  const nWatch = await countOf(watchTab)
  expect(await countOf(page.getByRole('button', { name: /^ทั้งหมด/ }))).toBe(nReport + nWatch)

  await expect(page.getByText(`แสดง ${nReport} รายการ`, { exact: false })).toBeVisible()
  await expect(page.locator('button[aria-controls^="dead-"]')).toHaveCount(nReport)

  await watchTab.click()
  await expect(page.locator('button[aria-controls^="dead-"]')).toHaveCount(nWatch)

  if (nWatch > 0) {
    const row = page.locator('button[aria-controls^="dead-"]').first()
    await row.click()
    await expect(row).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('หน่วยงานที่เคยเบิกใช้')).toBeVisible()
    await expect(page.getByText(/^\d+ lot$/).first()).toBeVisible()
  }
})

test('ค้นไม่เจอ → ข้อความว่าง ไม่ใช่จอเปล่า', async ({ page }) => {
  await openFromMenu(page)
  await page.getByPlaceholder('ค้นชื่อยาหรือรหัส').fill('ไม่มียานี้แน่นอน-zzz')
  await expect(page.getByText('ไม่มีรายการที่ตรงกับคำค้น')).toBeVisible()
})
