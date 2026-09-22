// ตรวจนับประจำปี — ค้นชื่อยา + กรอกนับแยกรายชั้น (lot ที่แบ่งเก็บหลายที่)
//
// ⚠️ ทดสอบกับ "รอบที่เปิดอยู่จริง" ใน DB — ถ้าไม่มีรอบ draft ค้าง test จะ skip
//    (ไม่สร้างรอบใหม่เอง: รอบประจำปี = 629 บรรทัด + ปิดรอบไม่ได้ย้อนกลับ)
// ⚠️ ทุก test เป็น read-only — กรอกค่าในช่องแล้วดูผลรวม แต่ **ไม่กดบันทึก**
//    (อย่าเขียนทับผลนับจริงของคลัง)
import { test, expect } from '@playwright/test'
import { login } from './helpers/auth.js'

const USER = 'Kao_9'
const PASS = '96409999'
const SPLIT_DRUG = 'Manidipine'   // lot 260873 แบ่งเก็บ 2 ที่ (E-1-x + ห้องประชุมเล็กชั้น4)

async function openAnnual(page) {
  await login(page, USER, PASS)
  const menuBtn = page.getByRole('button', { name: /เมนู|menu/i }).first()
  if (await menuBtn.isVisible().catch(() => false)) await menuBtn.click()
  await page.getByRole('button', { name: 'ตรวจนับคงคลัง' }).click()
  await page.getByRole('button', { name: 'ประจำปี' }).click()
  // รอโหลดรอบเสร็จ
  await expect(page.getByText(/รอบประจำปี|เริ่มรอบ/).first()).toBeVisible({ timeout: 20_000 })
}

/** มีรอบ draft ค้างอยู่ไหม — ไม่มีก็ทดสอบ UI นับไม่ได้ */
async function hasOpenRound(page) {
  return page.getByText(/\d+\s*\/\s*\d+ lot/).first().isVisible().catch(() => false)
}

/** เลือกตัวกรองสถานะนับ = "ทั้งหมด" — default คือ "ยังไม่นับ" ซึ่งซ่อน lot ที่นับไปแล้ว
 *  (ยาที่ใช้ทดสอบถูกนับไปแล้วในรอบจริง ไม่สลับก่อนจะเจอ "นับครบแล้วในตัวกรองนี้") */
async function showAllLots(page) {
  const sel = page.locator('select[title="กรองตามสถานะการนับ"]')
  if (await sel.isVisible().catch(() => false)) await sel.selectOption('all')
}

test('ค้นชื่อยาในรอบนับ — พิมพ์แล้วคิวแคบลงเหลือยาที่ค้น', async ({ page }) => {
  await openAnnual(page)
  test.skip(!(await hasOpenRound(page)), 'ไม่มีรอบประจำปีที่เปิดอยู่')

  await showAllLots(page)
  const search = page.getByPlaceholder('ค้นชื่อยา / รหัส / lot')
  await expect(search).toBeVisible()

  await search.fill(SPLIT_DRUG)
  // การ์ดที่แสดงต้องเป็นยาที่ค้น
  await expect(page.getByText(new RegExp(SPLIT_DRUG, 'i')).first()).toBeVisible({ timeout: 10_000 })
})

test('ค้นด้วย lot ก็เจอ (ไม่ใช่แค่ชื่อยา)', async ({ page }) => {
  await openAnnual(page)
  test.skip(!(await hasOpenRound(page)), 'ไม่มีรอบประจำปีที่เปิดอยู่')

  await showAllLots(page)
  const search = page.getByPlaceholder('ค้นชื่อยา / รหัส / lot')
  await search.fill('260873')
  await expect(page.getByText(/Manidipine/i).first()).toBeVisible({ timeout: 10_000 })
})

test('lot แบ่งเก็บหลายที่ → มีกล่อง "กรอกแยกที่เก็บ" + รวมยอดให้ถูก', async ({ page }) => {
  await openAnnual(page)
  test.skip(!(await hasOpenRound(page)), 'ไม่มีรอบประจำปีที่เปิดอยู่')

  await showAllLots(page)
  await page.getByPlaceholder('ค้นชื่อยา / รหัส / lot').fill('260873')

  // กล่องส้มต้องขึ้น (lot นี้แบ่งเก็บ 2 ที่)
  const splitBox = page.getByText(/lot นี้แบ่งเก็บ \d+ ที่/)
  await expect(splitBox).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'กรอกแยกที่เก็บ' }).click()

  // กรอกยอดรายชั้น — 2 ช่อง placeholder "นับได้"
  const cells = page.getByPlaceholder('นับได้')
  await expect(cells).toHaveCount(2)
  await cells.nth(0).fill('550')
  await cells.nth(1).fill('750')

  // ผลรวมต้องเป็น 1300 (550+750)
  await expect(page.getByText(/รวม\s*1300/)).toBeVisible()
})

test('กด "ใช้ยอดรวมนี้" → ยอดลงช่องนับได้จริง + เขียนหมายเหตุแยกชั้น', async ({ page }) => {
  await openAnnual(page)
  test.skip(!(await hasOpenRound(page)), 'ไม่มีรอบประจำปีที่เปิดอยู่')

  await showAllLots(page)
  await page.getByPlaceholder('ค้นชื่อยา / รหัส / lot').fill('260873')
  await expect(page.getByText(/lot นี้แบ่งเก็บ/)).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'กรอกแยกที่เก็บ' }).click()

  const cells = page.getByPlaceholder('นับได้')
  await cells.nth(0).fill('550')
  await cells.nth(1).fill('750')
  await page.getByRole('button', { name: 'ใช้ยอดรวมนี้' }).click()

  // ยอดรวมลงช่องหลัก
  await expect(page.getByPlaceholder('จำนวน')).toHaveValue('1300')
  // หมายเหตุมีป้าย "แยกชั้น:" พร้อมยอดรายชั้น
  const note = page.getByPlaceholder(/หมายเหตุ/).first()
  await expect(note).toHaveValue(/แยกชั้น:.*550.*750/)
  // กล่องพับกลับหลังกด
  await expect(page.getByRole('button', { name: 'กรอกแยกที่เก็บ' })).toBeVisible()
})

test('กดแก้ซ้ำ → หมายเหตุแยกชั้นมีชุดเดียว ไม่ซ้อน 2 ชุด', async ({ page }) => {
  await openAnnual(page)
  test.skip(!(await hasOpenRound(page)), 'ไม่มีรอบประจำปีที่เปิดอยู่')

  await showAllLots(page)
  await page.getByPlaceholder('ค้นชื่อยา / รหัส / lot').fill('260873')
  await expect(page.getByText(/lot นี้แบ่งเก็บ/)).toBeVisible({ timeout: 10_000 })

  // รอบแรก 550/750
  await page.getByRole('button', { name: 'กรอกแยกที่เก็บ' }).click()
  let cells = page.getByPlaceholder('นับได้')
  await cells.nth(0).fill('550')
  await cells.nth(1).fill('750')
  await page.getByRole('button', { name: 'ใช้ยอดรวมนี้' }).click()

  // รอบสอง แก้เป็น 500/800
  await page.getByRole('button', { name: 'กรอกแยกที่เก็บ' }).click()
  cells = page.getByPlaceholder('นับได้')
  await cells.nth(0).fill('500')
  await cells.nth(1).fill('800')
  await page.getByRole('button', { name: 'ใช้ยอดรวมนี้' }).click()

  await expect(page.getByPlaceholder('จำนวน')).toHaveValue('1300')
  const noteVal = await page.getByPlaceholder(/หมายเหตุ/).first().inputValue()
  // ต้องมีป้าย "แยกชั้น:" ชุดเดียว และเป็นยอดล่าสุด (500/800)
  expect((noteVal.match(/แยกชั้น:/g) || []).length).toBe(1)
  expect(noteVal).toContain('500')
  expect(noteVal).toContain('800')
})

// ── regression: Finding 1 จาก /scrutinize ──────────────────────────────────
// ปุ่ม "ตรงตามระบบ" เดิมไม่ส่ง item_note → saveLine ทำ {...cur,...fields}
// จึงใช้ cur.item_note (ค่าจาก DB) ทับของที่เพิ่งพิมพ์ = หมายเหตุหายเงียบ
// ⚠️ test นี้ **ไม่กดปุ่มบันทึก** — ตรวจแค่ว่าค่าใน draft ยังอยู่ก่อนกด
//    (กดจริงจะเขียนทับผลนับของคลัง) การกดจริงตรวจด้วย unit-level ใน db แทน
test('พิมพ์หมายเหตุแล้วกรอกแยกชั้น → ค่าไม่หายก่อนบันทึก', async ({ page }) => {
  await openAnnual(page)
  test.skip(!(await hasOpenRound(page)), 'ไม่มีรอบประจำปีที่เปิดอยู่')

  await showAllLots(page)
  await page.getByPlaceholder('ค้นชื่อยา / รหัส / lot').fill('260873')
  await expect(page.getByText(/lot นี้แบ่งเก็บ/)).toBeVisible({ timeout: 10_000 })

  // คนพิมพ์ข้อสังเกตเองก่อน
  const note = page.getByPlaceholder(/หมายเหตุ/).first()
  await note.fill('ของอยู่หลังตู้')

  // แล้วค่อยกรอกแยกชั้น
  await page.getByRole('button', { name: 'กรอกแยกที่เก็บ' }).click()
  const cells = page.getByPlaceholder('นับได้')
  await cells.nth(0).fill('550')
  await cells.nth(1).fill('750')
  await page.getByRole('button', { name: 'ใช้ยอดรวมนี้' }).click()

  // ข้อสังเกตของคนต้องยังอยู่ + มีชุดแยกชั้นต่อท้าย
  const val = await note.inputValue()
  expect(val).toContain('ของอยู่หลังตู้')
  expect(val).toContain('แยกชั้น:')
  // ปุ่ม "ตรงตามระบบ" ต้องมีอยู่ (เส้นทางที่เคยทำหมายเหตุหาย)
  await expect(page.getByRole('button', { name: /ตรงตามระบบ/ })).toBeVisible()
})

test('dropdown สถานะนับ — เลือก "นับแล้ว" ได้ ไม่ใช่แค่ toggle 2 สถานะ', async ({ page }) => {
  await openAnnual(page)
  test.skip(!(await hasOpenRound(page)), 'ไม่มีรอบประจำปีที่เปิดอยู่')

  const sel = page.locator('select[title="กรองตามสถานะการนับ"]')
  await expect(sel).toBeVisible()
  // ต้องมีครบ 3 ตัวเลือก พร้อมจำนวนในวงเล็บ
  await expect(sel.locator('option')).toHaveCount(3)
  await expect(sel.locator('option').nth(0)).toHaveText(/ยังไม่นับ \(\d+\)/)
  await expect(sel.locator('option').nth(1)).toHaveText(/นับแล้ว \(\d+\)/)
  await expect(sel.locator('option').nth(2)).toHaveText(/ทั้งหมด \(\d+\)/)

  // เลือก "นับแล้ว" → คิวต้องเป็นรายการที่นับไปแล้ว (มีค่าในช่องจำนวน)
  await sel.selectOption('counted')
  await expect(sel).toHaveValue('counted')
  const qty = page.getByPlaceholder('จำนวน').first()
  await expect(qty).not.toHaveValue('')
})
