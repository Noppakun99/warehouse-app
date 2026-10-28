import { test, expect } from '@playwright/test'
import { login } from './helpers/auth.js'

// ใบแจ้งย้ายที่เก็บ (docs/features/location-move.md) — ⚠️ อ่านอย่างเดียว ห้ามกด "ย้าย" ในกล่องยืนยัน
// (เขียน location_move ระบบจริง → skill ลง Excel จริงตอนเปิด session ถัดไป)
// ยาตัวอย่าง: Hydralazine 20mg inj 1450009 — 2 lot (P04077/P04092) ที่เก็บเดียวกัน D-4-4 (ย้ายจริง 27/10/2569)

async function openMapSearch(page, user, pass, term) {
  await login(page, user, pass)
  const menuBtn = page.getByRole('button', { name: 'เปิดเมนู' })
  if (await menuBtn.isVisible().catch(() => false)) await menuBtn.click()
  await page.getByRole('button', { name: 'แผนผังคลังยา' }).first().click()
  await expect(page.getByText(/กดช่องเพื่อดูยาในช่อง/)).toBeVisible({ timeout: 20_000 })
  await page.getByPlaceholder('ค้นหาชื่อยา, รหัส, ตำแหน่ง, Lot, บิล...').fill(term)
}

test('staff เห็นปุ่มย้ายที่เก็บ → ติ๊กเฉพาะ lot ที่กด + เลือกทั้งชั้นได้ + ปุ่มบันทึกตามชุดชั้น', async ({ page }) => {
  await openMapSearch(page, 'Kao_9', '96409999', 'P04092')
  const card = page.locator('div', { hasText: 'Hydralazine 20mg' }).filter({ has: page.getByRole('button', { name: 'ย้ายที่เก็บ' }) }).last()
  await card.getByRole('button', { name: 'ย้ายที่เก็บ' }).click()

  const modal = page.locator('div', { hasText: 'Lot ที่จะย้าย' }).filter({ has: page.getByRole('button', { name: 'บันทึกการย้าย' }) }).last()
  await expect(modal.getByText(/^Lot P040(77|92) · D-4-4$/)).toBeVisible()      // หัวโมดอลบอก lot ที่กด
  await expect(modal.getByText('Lot P04077', { exact: true })).toBeVisible()
  await expect(modal.getByText('Lot P04092', { exact: true })).toBeVisible()
  await expect(modal.getByText('lot ที่เลือก')).toHaveCount(1)
  const boxes = modal.getByRole('checkbox')
  await expect(boxes).toHaveCount(2)
  await expect(boxes.nth(0)).toBeChecked()                    // lot ที่กดอยู่บนสุด ติ๊กให้
  await expect(boxes.nth(1)).not.toBeChecked()                // lot อื่นในชั้นเดียวกันไม่ติ๊ก
  await modal.getByRole('button', { name: 'เลือกทุก lot ในชั้น D-4-4' }).click()
  await expect(boxes.nth(1)).toBeChecked()
  await expect(modal.getByRole('button', { name: 'เลือกทุก lot ในชั้น D-4-4' })).toHaveCount(0)

  await modal.getByPlaceholder('พิมพ์หรือเลือกชั้น เช่น D-4-4').fill('D-4')   // ชั้นแนะนำเป็นปุ่มใต้ช่อง (ไม่ใช่ datalist)
  await expect(modal.getByRole('button', { name: /^เพิ่มชั้น D-4-/ }).first()).toBeVisible()
  await modal.getByPlaceholder('พิมพ์หรือเลือกชั้น เช่น D-4-4').fill('')

  const saveBtn = modal.getByRole('button', { name: 'บันทึกการย้าย' })
  await expect(saveBtn).toBeDisabled()                       // ชุดชั้นยังเท่าเดิม
  await modal.getByRole('button', { name: 'เอา D-4-4 ออก' }).click()
  await expect(modal.getByText('ต้องมีที่เก็บอย่างน้อย 1 ชั้น')).toBeVisible()
  await expect(saveBtn).toBeDisabled()
  await modal.getByPlaceholder('พิมพ์หรือเลือกชั้น เช่น D-4-4').fill('ZZ-9-9')
  await modal.getByRole('button', { name: 'เพิ่มชั้น' }).click()
  await expect(modal.getByText(/ชั้นนี้ยังไม่มีในแผนผัง: ZZ-9-9/)).toBeVisible()
  await expect(saveBtn).toBeEnabled()

  await saveBtn.click()
  await expect(page.getByText('ยืนยันย้ายที่เก็บ')).toBeVisible()
  await page.getByRole('button', { name: 'ยกเลิก' }).last().click()   // ห้ามกด "ย้าย"
  await expect(page.getByText('ยืนยันย้ายที่เก็บ')).toHaveCount(0)
  await expect(modal).toBeVisible()                           // คลิกในกล่องยืนยันไม่ทะลุไปปิดโมดอล
})

test('ผู้เบิก (requester) ไม่เห็นปุ่มย้ายที่เก็บ', async ({ page }) => {
  await openMapSearch(page, 'test', '111111', 'P04092')
  await expect(page.getByText('Hydralazine 20mg').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'ย้ายที่เก็บ' })).toHaveCount(0)
})
