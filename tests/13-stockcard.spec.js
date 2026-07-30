import { test, expect } from '@playwright/test'
import { login } from './helpers/auth.js'

const USER = 'Kao_9'
const PASS = '96409999'
const DRUG = 'Acetaminophen 500mg ,Para'   // มีทั้ง drift + แถวกรอกผิด (lot 194634)

async function openStockcard(page) {
  await login(page, USER, PASS)
  // เปิดเมนู (mobile drawer / desktop sidebar) แล้วไป Stockcard
  const menuBtn = page.getByRole('button', { name: /เมนู|menu/i }).first()
  if (await menuBtn.isVisible().catch(() => false)) await menuBtn.click()
  await page.getByRole('button', { name: 'Stockcard' }).click()
  await expect(page.getByText('ประวัติทุก lot ทุกเดือน')).toBeVisible()
}

async function selectDrug(page, name = DRUG) {
  const input = page.getByPlaceholder('พิมพ์ชื่อยาเพื่อดูประวัติทุก lot...')
  await input.fill('Acetaminophen 500')
  await page.getByText(name, { exact: true }).first().click()
  await expect(page.getByText('รหัส:')).toBeVisible({ timeout: 15_000 })
}

test('เปิดหน้า Stockcard + เลือกยา → เห็นตาราง', async ({ page }) => {
  await openStockcard(page)
  await selectDrug(page)
  await expect(page.getByRole('table')).toBeVisible()
  // ใช้ columnheader — ข้อความเดียวกันโผล่ในการ์ด mobile ด้วย (strict mode)
  await expect(page.getByRole('columnheader', { name: 'คงเหลือ Lot' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'ยอดที่บันทึกไว้' })).toBeVisible()
})

test('กด X ล้างชื่อยา → ตารางหายไป', async ({ page }) => {
  await openStockcard(page)
  await selectDrug(page)
  await expect(page.getByRole('table')).toBeVisible()

  // ปุ่ม X ใน DrugSearchBar
  await page.locator('button:near(input[placeholder*="พิมพ์ชื่อยา"])').first().click()
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByText('เลือกยาเพื่อดูประวัติการเคลื่อนไหว')).toBeVisible()
})

test('badge "แถวกรอกผิด" กดแล้วเลื่อนไปหาแถว + ไฮไลต์', async ({ page }) => {
  await openStockcard(page)
  await selectDrug(page)

  const badge = page.getByRole('button', { name: /แถวกรอกผิด/ })
  await expect(badge).toBeVisible()
  await badge.click()

  // ต้องมีแถวที่ถูกไฮไลต์ (ring-amber)
  await expect(page.locator('tr.ring-2').first()).toBeVisible({ timeout: 3000 })
})

test('badge "ยอดไม่ตรงบันทึก" กดแล้วไฮไลต์แถว drift', async ({ page }) => {
  await openStockcard(page)
  await selectDrug(page)

  const badge = page.getByRole('button', { name: /ยอดไม่ตรงบันทึก/ })
  await expect(badge).toBeVisible()
  await badge.click()
  await expect(page.locator('tr.ring-2').first()).toBeVisible({ timeout: 3000 })
})

test('ไอคอนเตือน กดแล้วเปิดโมดอลอธิบาย', async ({ page }) => {
  await openStockcard(page)
  await selectDrug(page)

  await page.getByRole('button', { name: 'ดูรายละเอียดยอดไม่ตรง' }).first().click()
  await expect(page.getByText('ยอดไม่ตรงกับที่บันทึก')).toBeVisible()
  await expect(page.getByText('แถวนี้ตามที่บันทึกไว้ (จาก Excel)')).toBeVisible()
  // ตารางในโมดอลต้องมี 3 บรรทัด ก่อนเบิก/เบิกออก/หลังเบิก
  await expect(page.getByRole('cell', { name: /คงเหลือก่อนเบิก/ })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'เบิกออก' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'คงเหลือหลังเบิก' })).toBeVisible()
  // ปิดได้
  await page.getByRole('button', { name: 'ปิด' }).click()
  await expect(page.getByText('ยอดไม่ตรงกับที่บันทึก')).toHaveCount(0)
})

test('ปุ่มตรวจหายาที่ยอดไม่ตรง → คลิกยาแล้วเปิดการ์ดของยานั้น', async ({ page }) => {
  await openStockcard(page)

  await page.getByRole('button', { name: /ตรวจหายาที่ยอดไม่ตรง/ }).click()
  await expect(page.getByText(/ต้องตรวจ \d+ รายการ|ไม่พบยาที่ต้องตรวจ/)).toBeVisible({ timeout: 60_000 })

  const items = page.locator('button:has(span:text-matches("กรอกผิด|ยอดไม่ตรง"))')
  expect(await items.count()).toBeGreaterThan(0)

  await items.first().click()
  await expect(page.getByText('รหัส:')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByText(/ต้องตรวจ \d+ รายการ/)).toHaveCount(0)   // ลิสต์ปิดแล้ว
})

test('Export Excel ดาวน์โหลดได้ + พิมพ์เปิดใบพร้อมข้อมูล', async ({ page, context }) => {
  await openStockcard(page)
  await selectDrug(page)

  const dl = page.waitForEvent('download', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Excel' }).click()
  const file = await dl
  expect(file.suggestedFilename()).toMatch(/^stockcard_1000227_\d{4}-\d{2}-\d{2}\.xlsx$/)

  const popupP = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null)
  await page.getByRole('button', { name: 'พิมพ์' }).click()
  const popup = await popupP
  expect(popup).not.toBeNull()
  await popup.waitForLoadState('domcontentloaded')
  expect(await popup.locator('table tbody tr').count()).toBeGreaterThan(0)
  await popup.close()
})

test('ตัวกรอง: Lot dropdown พิมพ์ค้นได้ + ช่วงวันที่', async ({ page }) => {
  await openStockcard(page)
  await selectDrug(page)

  await page.getByRole('button', { name: /ตัวกรอง/ }).click()

  // Lot: พิมพ์ค้น
  const lotBox = page.locator('input[placeholder="ทุก lot"]')
  await lotBox.click()
  await lotBox.fill('194584')
  await page.getByText('194584', { exact: true }).first().click()

  // ต้องเหลือเฉพาะ lot นั้น
  const lots = await page.locator('tbody tr td:nth-child(2)').allTextContents()
  expect(lots.every(l => l.trim() === '194584')).toBeTruthy()

  // ช่วงวันที่ต้องมีอยู่
  await expect(page.getByText('ตั้งแต่วันที่')).toBeVisible()
  await expect(page.getByText('ถึงวันที่')).toBeVisible()
})
