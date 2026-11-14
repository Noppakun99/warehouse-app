import { test, expect } from '@playwright/test'
import { login } from './helpers/auth.js'

// อ่านอย่างเดียว — ไม่มีปุ่มไหนในหน้านี้เขียน DB
// หน้าออกแบบใหม่ 14/11/2569 (docs/features/stock-card.md): รายการ lot ซ้าย + ตาราง 6 คอลัมน์ · มือถือ 2 ชั้น
const USER = 'Kao_9'
const PASS = '96409999'
const DRUG = 'Acetaminophen 500mg ,Para'   // 16 lot · มียอดไม่ตรง + ข้อมูลก่อนเริ่มใช้ระบบ (ไม่มีแถวกรอกผิดแล้ว — เทสกรอกผิดหายาจากปุ่มสแกน)

async function openStockcard(page) {
  await login(page, USER, PASS)
  const hamburger = page.getByRole('button', { name: 'เปิดเมนู' })
  if (await hamburger.isVisible().catch(() => false)) await hamburger.click()
  await page.getByRole('button', { name: /Stockcard/ }).first().click()
  await expect(page.getByText('ประวัติทุก lot ทุกเดือน')).toBeVisible()
}

async function selectDrug(page, name = DRUG) {
  const input = page.getByPlaceholder('พิมพ์ชื่อยาเพื่อดูประวัติทุก lot...')
  await input.fill('Acetaminophen 500')
  await page.getByText(name, { exact: true }).first().click()
  await expect(page.getByText('รหัส:')).toBeVisible({ timeout: 15_000 })
}

const lotList = (page) => page.getByRole('navigation', { name: 'รายการ lot' })

test.describe('จอคอม', () => {
  test('เลือกยา → เลือก lot ให้เอง + ตาราง 6 คอลัมน์', async ({ page }) => {
    await openStockcard(page)
    await selectDrug(page)
    await expect(lotList(page)).toBeVisible()
    // lot ที่ระบบเลือกให้ = ปุ่มแรกในรายการ (มีป้ายเตือนขึ้นก่อน) และกดค้างอยู่
    await expect(lotList(page).locator('button').first()).toHaveAttribute('aria-pressed', 'true')
    for (const h of ['วันที่', 'รายการ', 'รับเข้า', 'เบิกออก', 'คงเหลือ', 'หมายเหตุ']) {
      await expect(page.getByRole('columnheader', { name: h, exact: true })).toBeVisible()
    }
    // คำเก่าต้องไม่โผล่ (CONTEXT §การ์ดคลัง lot)
    await expect(page.getByText('ยอดที่บันทึกไว้')).toHaveCount(0)
    await expect(page.getByText('unpivot')).toHaveCount(0)
  })

  test('กด X ล้างชื่อยา → ตารางหายไป', async ({ page }) => {
    await openStockcard(page)
    await selectDrug(page)
    await expect(page.getByRole('table')).toBeVisible()
    await page.locator('button:near(input[placeholder*="พิมพ์ชื่อยา"])').first().click()
    await expect(page.getByRole('table')).toHaveCount(0)
    await expect(page.getByText('เลือกยาเพื่อดูประวัติการเคลื่อนไหว')).toBeVisible()
  })

  test('เลือก lot อื่น / ดูทุก lot เรียงตามวัน', async ({ page }) => {
    await openStockcard(page)
    await selectDrug(page)
    const lot = lotList(page).getByRole('button', { name: /194584/ })
    await lot.click()
    await expect(lot).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Exp', { exact: false }).first()).toBeVisible()

    await lotList(page).getByRole('button', { name: 'ดูทุก lot เรียงตามวัน' }).click()
    await expect(page.getByText('คอลัมน์คงเหลือเป็นยอดของ lot ในแถวนั้น')).toBeVisible()
    // โหมดทุก lot มี chip lot ในคอลัมน์รายการ
    await expect(page.locator('[data-scrollbox] tbody tr[tabindex] td:nth-child(2) .font-mono').first()).toBeVisible()
  })

  // ยาที่ยอดไม่ตรงจริงเปลี่ยนตามข้อมูล (14/11/2569 แก้ตรรกะแล้ว Acetaminophen 500 ไม่มียอดไม่ตรงจริงแล้ว
  // — เป็นการเบิกก่อนเริ่มระบบ) → หายาจากปุ่มสแกน แล้วเปิดดูทุก lot
  async function openDriftDrug(page) {
    test.setTimeout(120_000)
    await openStockcard(page)
    await page.getByRole('button', { name: /ตรวจหายาที่ยอดไม่ตรง/ }).click()
    await expect(page.getByText(/ต้องตรวจ \d+ รายการ|ไม่พบยาที่ต้องตรวจ/)).toBeVisible({ timeout: 60_000 })
    const withDrift = page.locator('button:has(span:text-matches("^ยอดไม่ตรง \\\\d+$"))')
    expect(await withDrift.count()).toBeGreaterThan(0)
    await withDrift.first().click()
    await expect(page.getByText('รหัส:')).toBeVisible({ timeout: 20_000 })
    const all = lotList(page).getByRole('button', { name: 'ดูทุก lot เรียงตามวัน' })
    if (await all.count()) await all.click()
  }

  test('บรรทัดสรุป "ยอดไม่ตรง N จุด" กดแล้วเลื่อนไปไฮไลต์แถว', async ({ page }) => {
    await openDriftDrug(page)
    await page.getByRole('button', { name: /^ยอดไม่ตรง \d+ จุด$/ }).click()
    await expect(page.locator('tr.ring-2').first()).toBeVisible({ timeout: 3000 })
  })

  test('lot ไม่ตรง Master → แถวปรับยอดท้าย lot + ป้าย + บรรทัดสรุปในหัว', async ({ page }) => {
    await openDriftDrug(page)
    await expect(page.getByText(/^ปรับยอดให้ตรง Master \d+ lot$/)).toBeVisible()
    const adj = lotList(page).locator('button:has(span:text-is("ปรับตาม Master"))').first()
    await adj.click()
    await expect(page.getByText(/^ปรับยอดให้ตรง Master [+−][\d,.]+: ไล่จากประวัติได้ .+ · Master มี /)).toBeVisible()
    await expect(page.getByText('ปรับยอดให้ตรง Master', { exact: true }).first()).toBeVisible()
  })

  test('บรรทัดอธิบายใต้แถว → ดูรายละเอียด เปิดโมดอล', async ({ page }) => {
    await openDriftDrug(page)
    await expect(page.getByText(/^ยอดไม่ตรง: ชีทเบิกบันทึกว่าก่อนเบิกเหลือ/).first()).toBeVisible()
    await page.getByRole('button', { name: 'ดูรายละเอียด', exact: true }).first().click()
    await expect(page.getByText('แถวนี้ตามชีทเบิก')).toBeVisible()
    await expect(page.getByRole('cell', { name: /คงเหลือก่อนเบิก/ }).first()).toBeVisible()
    await expect(page.getByRole('cell', { name: /^เบิกออก/ }).first()).toBeVisible()   // แถวไม่หักยอดมีคำต่อท้าย
    await expect(page.getByRole('cell', { name: 'คงเหลือหลังเบิก', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'ปิด', exact: true }).click()
    await expect(page.getByText('แถวนี้ตามชีทเบิก')).toHaveCount(0)
  })

  test('กดแถว → กางดูมูลค่า', async ({ page }) => {
    await openStockcard(page)
    await selectDrug(page)
    const row = page.locator('[data-scrollbox] tbody tr[tabindex]').first()
    await row.click()
    await expect(row).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('[data-scrollbox] dt', { hasText: 'มูลค่า' })).toBeVisible()
  })

  test('ปุ่มตรวจหายาที่ยอดไม่ตรง → ยากรอกผิด → ทุก lot → กดแถวกรอกผิดแล้วไฮไลต์', async ({ page }) => {
    test.setTimeout(120_000)
    await openStockcard(page)
    await page.getByRole('button', { name: /ตรวจหายาที่ยอดไม่ตรง/ }).click()
    await expect(page.getByText(/ต้องตรวจ \d+ รายการ|ไม่พบยาที่ต้องตรวจ/)).toBeVisible({ timeout: 60_000 })

    const withRowErr = page.locator('button:has(span:text-matches("^กรอกผิด \\\\d+$"))')
    expect(await withRowErr.count()).toBeGreaterThan(0)
    await withRowErr.first().click()
    await expect(page.getByText('รหัส:')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/ต้องตรวจ \d+ รายการ/)).toHaveCount(0)   // ลิสต์ปิดแล้ว

    const all = lotList(page).getByRole('button', { name: 'ดูทุก lot เรียงตามวัน' })
    if (await all.count()) await all.click()
    await page.getByRole('button', { name: /^แถวกรอกผิด \d+ แถว$/ }).click()
    await expect(page.locator('tr.ring-2').first()).toBeVisible({ timeout: 3000 })
  })

  test('ปุ่มของรอคืนจากบริษัท → เห็นของลอย + คลิกเปิดการ์ดยานั้น', async ({ page }) => {
    await openStockcard(page)
    await page.getByRole('button', { name: /ของรอคืนจากบริษัท/ }).click()
    await expect(page.getByText(/รอของคืนจากบริษัท \d+ รายการ|ไม่มีของค้างรอคืน/)).toBeVisible({ timeout: 60_000 })
    const items = page.locator('button:has(span:text-matches("ค้าง \\\\d+ วัน"))')
    if (await items.count() > 0) {
      await items.first().click()
      await expect(page.getByText('รหัส:')).toBeVisible({ timeout: 20_000 })
      await expect(lotList(page)).toBeVisible()
    }
  })

  test('Excel ชื่อไฟล์บอก lot + ใบพิมพ์แถวเท่าจอ', async ({ page, context }) => {
    await openStockcard(page)
    await selectDrug(page)
    const shown = await page.locator('[data-scrollbox] tbody tr[tabindex]').count()

    const dl = page.waitForEvent('download', { timeout: 15_000 })
    // exact: ปุ่ม "นำเข้าจาก Excel" บน top bar (staff) ชื่อมีคำว่า Excel ด้วย
    await page.getByRole('button', { name: 'Excel', exact: true }).click()
    expect((await dl).suggestedFilename()).toMatch(/^stockcard_1000227_lot-.+_\d{4}-\d{2}-\d{2}\.xlsx$/)

    const popupP = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null)
    await page.getByRole('button', { name: 'พิมพ์', exact: true }).click()
    const popup = await popupP
    expect(popup).not.toBeNull()
    await popup.waitForLoadState('domcontentloaded')
    await expect(popup.locator('section')).toHaveCount(1)
    // แถวข้อมูล (ไม่นับบรรทัดอธิบาย tr.iss) = จำนวนแถวบนจอ (Rule #6)
    expect(await popup.locator('tbody tr:not(.iss)').count()).toBe(shown)
    await popup.close()
  })

  test('ช่วงวันที่กรองแถว', async ({ page }) => {
    await openStockcard(page)
    await selectDrug(page)
    await lotList(page).getByRole('button', { name: 'ดูทุก lot เรียงตามวัน' }).click()
    const rows = page.locator('[data-scrollbox] tbody tr[tabindex]')
    const before = await rows.count()
    await page.locator('input[type="date"]').first().fill('2026-10-01')   // พ.ศ. 2569
    await expect(page.getByText(/^\d+ \/ \d+ รายการ$/)).toBeVisible()
    expect(await rows.count()).toBeLessThan(before)
  })
})

test.describe('มือถือ 375px', () => {
  test.use({ viewport: { width: 375, height: 800 } })

  test('ชั้นรายการ lot → แตะ lot → แถว 2 บรรทัด + sheet + ตัวกรอง + ย้อนกลับ ไม่ล้นจอ', async ({ page }) => {
    await openStockcard(page)
    await selectDrug(page)
    // ชั้น 1: ไม่เลือก lot ให้ — เห็นรายการ lot ไม่เห็นตาราง
    await expect(lotList(page)).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
    await expect(lotList(page).locator('button[aria-pressed="true"]')).toHaveCount(0)

    await lotList(page).locator('button').first().click()
    await expect(lotList(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^รายการ lot \(\d+\)$/ })).toBeVisible()

    // แตะแถว → bottom sheet
    await page.getByRole('button', { name: /^\d{2}\/\d{2}\/\d{4} (รับจาก|เบิก)/ }).first().click()
    const sheet = page.getByRole('dialog', { name: 'รายละเอียดแถว' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText('มูลค่า', { exact: true })).toBeVisible()
    await sheet.getByRole('button', { name: 'ปิด', exact: true }).click()
    await expect(sheet).toHaveCount(0)

    // ตัวกรองวันที่อยู่ใน FilterSheet
    await page.getByRole('button', { name: 'ตัวกรอง' }).click()
    await expect(page.getByRole('dialog', { name: 'ตัวกรอง' }).getByText('ตั้งแต่วันที่')).toBeVisible()
    await page.getByRole('button', { name: 'ปิดตัวกรอง' }).click()

    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    expect(sw).toBeLessThanOrEqual(cw)

    await page.getByRole('button', { name: /^รายการ lot \(\d+\)$/ }).click()
    await expect(lotList(page)).toBeVisible()
  })
})
