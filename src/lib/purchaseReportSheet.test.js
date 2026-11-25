// Golden tests — src/lib/purchaseReportSheet.js (รายงานแจ้งการสั่งซื้อยา → purchase_request)
// รัน: npm run test:purchase
// ไฟล์จริง 14/11/2569: ชีทหลัก 128 แถว (รอทั้งหมด) · ประวัติแจ้งซื้อ 581 แถว (☑ 551 · ☐ 30) — ตรวจด้วย CLI dry-run

import {
  toIsoDate, findHeaderRow, findCheckColumn, checkHeader, parseSheetGrid, summarize, qtyValueMismatch,
  requestState, pendingRequestFor, purchaseDatesByCode, summarizePurchaseStatus, PR_STATUS, MAIN_SHEET, HISTORY_SHEET,
} from './purchaseReportSheet.js'

let pass = 0, fail = 0
const eq = (got, want, label) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++ } else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`) }
}
const section = (t) => console.log(`\n=== ${t} ===`)

// หัวชีทหลักตามไฟล์จริง (A..X)
const HEAD = ['ยามมาส่งแล้ว', 'วันที่แจ้งสั่ง', 'วันที่ล่าสุดที่ยาส่ง', 'ระยะเวลา', 'รหัสHosxp', 'ชนิด', 'รายการยา', 'หน่วย',
  'ราคา/หน่วย (ล่าสุด)', 'บริษัท', 'Lead Time', 'Safety Stock', 'Max/เดือน (3 ด.ล่าสุด)', 'Avg/เดือน (3 ด.ล่าสุด)', 'Avg/วัน', 'คงเหลือ', 'ROP', 'เหตุผลที่แจ้ง',
  'คงอยู่ได้อีก', 'ยอดเบิกรวม', 'ยอดเบิก 3 เดือน', 'จำนวนแนะนำสั่งซื้อ (หน่วย)', 'มูลค่าสั่ง', 'หมายเหตุ']
// qty = V จำนวนแนะนำ · rate = N Avg/เดือน · price/value = I/W (ตรวจ qty × price = value)
const dataRow = (mark, serial, code, name, unit, reason = '', note = '', { qty = '', rate = '', price = '', value = '' } = {}) => {
  const r = Array(24).fill('')
  r[0] = mark; r[1] = serial; r[4] = code; r[5] = 'Tablet'; r[6] = name; r[7] = unit; r[17] = reason; r[23] = note
  r[8] = price; r[13] = rate; r[21] = qty; r[22] = value
  return r
}

section('toIsoDate')
eq(toIsoDate(45989), '2025-11-28', 'serial → ISO')
eq(toIsoDate(46338.6), '2026-11-12', 'serial มีเศษเวลา → วันเดิม (floor)')
eq(toIsoDate('12/11/69'), '2026-11-12', 'DD/MM/ปี พ.ศ. 2 หลัก')
eq(toIsoDate('5/1/2569'), '2026-01-05', 'พ.ศ. 4 หลัก')
eq(toIsoDate('5/1/2026'), '2026-01-05', 'ค.ศ. 4 หลัก')
eq(toIsoDate(''), null, 'ว่าง → null')
eq(toIsoDate('-'), null, 'ขีด → null')
eq(toIsoDate(3), null, 'serial เล็กผิดปกติ (ปี 1900) → null')

section('findHeaderRow / findCheckColumn / checkHeader')
const main = [['รายงานแจ้งการสั่งซื้อยา UPDATE: …'], [], [], HEAD,
  dataRow('☐', 45989, 1000258, 'Pyrazinamide 500mg', '500เม็ด', 'หมดสต็อค', '', { qty: 6, rate: 2.33, price: 450, value: 2700 }),
  dataRow('☑', 46206, 1000296, 'Tetracaine 0.5%', 'ขวด', 'สั่งเพิ่ม', 'ใกล้หมดอายุ', { qty: 0, rate: '-' }),
  Array(24).fill(''),
  dataRow('☐', 46338, 'S004', 'ถุงซิบใส', 'กิโลกรัม'),
]
eq(findHeaderRow(main), 3, 'หัวตารางแถวที่ 4 (index 3)')
eq(findHeaderRow([['a'], ['b']]), -1, 'ไม่มีหัว → -1')
eq(checkHeader(HEAD, 0), [], 'หัวคอลัมน์อยู่ที่เดิม')
const moved = [...HEAD]; moved.splice(5, 0, 'คอลัมน์แทรก')
eq(checkHeader(moved, 0).length > 0, true, 'มีคนแทรกคอลัมน์ → ไม่ผ่าน')
// ประวัติแจ้งซื้อ: ไม่มีหัว ข้อมูลเริ่มคอลัมน์ B (grid บังคับเริ่มคอลัมน์ A → index 1)
const shift = (r) => ['', ...r]
const hist = [[], [],
  shift(dataRow('☑', 46185, 1460192, 'Regular Insulin', 'vial')),
  shift(dataRow('☐', 46190, 1520048, 'VitaminB6 50mg', '1000เม็ด')),
  shift(dataRow('☑', 46331, 1460055, 'Amiodarone', 'amp', 'สั่งเพิ่ม', 'แจ้งซ้ำ: ของมาแล้ว 27/10/69', { qty: 40, rate: 12, price: 35, value: 1400 })),
]
eq(findCheckColumn(hist), 1, 'ประวัติแจ้งซื้อ ช่องติ๊กอยู่คอลัมน์ B')
eq(findCheckColumn(main), 0, 'ชีทหลักช่องติ๊กอยู่คอลัมน์ A')
eq(findCheckColumn([['x']]), -1, 'ไม่มีช่องติ๊ก → -1')

section('parseSheetGrid — ชีทหลัก')
{
  const { rows, skipped } = parseSheetGrid(main, MAIN_SHEET)
  eq(rows.length, 3, 'ข้ามแถวว่าง ได้ 3 แถว')
  eq(skipped.length, 0, 'ไม่มีแถวเสีย')
  eq(rows[0], { code: '1000258', name: 'Pyrazinamide 500mg', unit: '500เม็ด', drug_type: 'Tablet', notified_on: '2025-11-28',
    status: PR_STATUS.WAITING, reason: 'หมดสต็อค', note: null, qty_requested: 6, rate_per_month: 2.33, source_sheet: MAIN_SHEET, source_row: 5 },
    'แถวแรกครบทุกช่อง + เลขแถวจริง 5')
  eq([rows[1].qty_requested, rows[1].rate_per_month], [0, null], 'จำนวน 0 คงเป็น 0 · เรทเป็นขีด → null')
  eq([rows[2].qty_requested, rows[2].rate_per_month], [null, null], 'ช่องว่าง → null')
  eq(rows[1].status, PR_STATUS.ARRIVED, '☑ ในชีทหลัก = มาส่งแล้ว (ยังไม่ย้ายไป ประวัติแจ้งซื้อ)')
  eq(rows[2].code, 'S004', 'รหัสเวชภัณฑ์ตัวอักษร')
  eq(rows[2].source_row, 8, 'เลขแถวนับแถวว่างด้วย')
}
{
  const bad = [...main.slice(0, 4), dataRow('☐', '', 1000258, 'X', 'เม็ด'), dataRow('☐', 45989, '', 'Y', 'เม็ด')]
  const { rows, skipped } = parseSheetGrid(bad, MAIN_SHEET)
  eq(rows.length, 0, 'แถววันที่ว่าง/ไม่มีรหัส ไม่นำเข้า')
  eq(skipped.map(s => s.skip), ['อ่านวันที่แจ้งไม่ได้', 'ไม่มีรหัส'], 'รายงานเหตุผลที่ข้าม')
}
{
  let msg = ''
  try { parseSheetGrid([['ไม่มีหัว']], MAIN_SHEET) } catch (e) { msg = e.message }
  eq(msg.includes('ไม่พบแถวหัวตาราง'), true, 'ไม่เจอหัว → throw')
  msg = ''
  try { parseSheetGrid([[], [], [], moved], MAIN_SHEET) } catch (e) { msg = e.message }
  eq(msg.includes('คอลัมน์ไม่อยู่ที่เดิม'), true, 'คอลัมน์ถูกแทรก → throw ไม่อ่านผิดช่องเงียบ')
}

section('parseSheetGrid — ประวัติแจ้งซื้อ')
{
  const { rows } = parseSheetGrid(hist, HISTORY_SHEET)
  eq(rows.map(r => r.status), [PR_STATUS.ARRIVED, PR_STATUS.CANCELLED, PR_STATUS.ARRIVED], '☑ = มาส่งแล้ว · ☐ = ยกเลิก')
  eq(rows.map(r => r.source_row), [3, 4, 5], 'เลขแถวจริงเริ่มแถว 3')
  eq(rows[2].note, 'แจ้งซ้ำ: ของมาแล้ว 27/10/69', 'หมายเหตุอ่านจากคอลัมน์ Y (เลื่อน 1 คอลัมน์)')
  eq(rows[0].notified_on, '2026-06-12', 'วันที่แจ้งจากคอลัมน์ C')
  eq([rows[2].qty_requested, rows[2].rate_per_month], [40, 12], 'จำนวน/เรทเลื่อน 1 คอลัมน์ (W/O)')
  const s = summarize([...parseSheetGrid(main, MAIN_SHEET).rows, ...rows])
  eq([s.total, s.main, s.mainWaiting, s.history, s.historyArrived, s.historyCancelled], [6, 3, 2, 3, 2, 1], 'สรุปจำนวนแยกชีท/สถานะ')
}

section('qtyValueMismatch — จับคอลัมน์เลื่อนในประวัติแจ้งซื้อ')
{
  const ok = dataRow('☐', 1, 'X', 'x', 'u', '', '', { qty: 40, price: 35, value: 1400 })
  eq(qtyValueMismatch(ok, 0), false, '40 × 35 = 1400 → ตรง')
  eq(qtyValueMismatch(dataRow('☐', 1, 'X', 'x', 'u', '', '', { qty: 40, price: 35, value: 1401 }), 0), false, 'ต่างไม่เกิน 1 บาท → ถือว่าตรง')
  eq(qtyValueMismatch(dataRow('☐', 1, 'X', 'x', 'u', '', '', { qty: 12, price: 35, value: 1400 }), 0), true, 'จำนวนผิดช่อง → ไม่ตรง')
  eq(qtyValueMismatch(dataRow('☐', 1, 'X', 'x', 'u', '', '', { qty: 40, price: 35 }), 0), false, 'ไม่มีมูลค่า (แถวเก่า) → ไม่ตรวจ')
  eq(qtyValueMismatch(shift(ok), 1), false, 'ประวัติแจ้งซื้อเลื่อน 1 คอลัมน์ base=1 → ตรง')
  const bad = [...main.slice(0, 4), dataRow('☐', 45989, 1, 'X', 'u', '', '', { qty: 12, price: 35, value: 1400 })]
  eq(parseSheetGrid(bad, MAIN_SHEET).mismatch, [{ sheet: MAIN_SHEET, rowNumber: 5, code: '1' }], 'parseSheetGrid คืนแถวที่ไม่ตรง')
}

section('purchaseDatesByCode')
{
  const m = purchaseDatesByCode([
    { drug_code: '1', receive_date: '2026-11-10', purchase_type: 'การซื้อ' },
    { drug_code: '1', receive_date: '2026-10-01', purchase_type: 'การซื้อ' },
    { drug_code: '1', receive_date: '2026-10-05', purchase_type: 'การยืม' },
    { drug_code: '2', receive_date: null, purchase_type: 'การซื้อ' },
  ])
  eq(m, { 1: ['2026-10-01', '2026-11-10'] }, 'เฉพาะการซื้อ · เรียงเก่า→ใหม่ · ข้ามวันว่าง')
}

section('requestState — สถานะสด')
const TODAY = '2026-11-14'
const req = (o) => ({ code: '1', notified_on: '2026-11-01', status: PR_STATUS.WAITING, ...o })
eq(requestState(req(), [], TODAY), { state: 'waiting', arrivedOn: null, waitDays: 13, leadDays: null }, 'ยังไม่มีบิล → รอ 13 วัน')
eq(requestState(req(), ['2026-10-20'], TODAY).state, 'waiting', 'บิลก่อนวันแจ้งไม่นับ (แจ้งซ้ำหลังของมา)')
eq(requestState(req(), ['2026-10-20', '2026-11-01', '2026-11-09'], TODAY),
  { state: 'arrived', arrivedOn: '2026-11-01', waitDays: null, leadDays: 0 }, 'บิลวันเดียวกับวันแจ้ง = มาแล้ว · ใช้บิลแรกหลังแจ้ง')
eq(requestState(req(), ['2026-11-09'], TODAY).leadDays, 8, 'ระยะรอ = วันรับ − วันแจ้ง')
eq(requestState(req({ status: PR_STATUS.ARRIVED }), [], TODAY), { state: 'arrived', arrivedOn: null, waitDays: null, leadDays: null }, 'Excel ติ๊กมาแล้วแต่ไม่เจอบิล → มาแล้ว ไม่มีวันที่')
eq(requestState(req({ status: PR_STATUS.CANCELLED }), ['2026-11-09'], TODAY).state, 'cancelled', 'ยกเลิกชนะบิล')
eq(requestState(req({ notified_on: '2026-11-20' }), [], TODAY).waitDays, 0, 'วันที่แจ้งอนาคต → 0 ไม่ติดลบ')

section('pendingRequestFor — ป้ายบนบัตรยา')
{
  const list = [req({ notified_on: '2026-11-05' }), req({ notified_on: '2026-10-01' }), req({ notified_on: '2026-09-01', status: PR_STATUS.CANCELLED })]
  const p = pendingRequestFor(list, ['2026-10-10'], TODAY)
  eq([p.notified_on, p.waitDays, p.count], ['2026-11-05', 9, 1], 'ใบ ต.ค. ได้ของแล้ว · ใบยกเลิกไม่นับ → เหลือใบ 05/11 รอ 9 วัน')
  const q = pendingRequestFor(list, [], TODAY)
  eq([q.notified_on, q.count], ['2026-10-01', 2], 'รอ 2 ใบ → แสดงใบเก่าสุด (รอนานสุด) + จำนวน')
  eq(pendingRequestFor([], [], TODAY), null, 'ไม่มีคำขอ → null')
  eq(pendingRequestFor(list, ['2026-11-06'], TODAY), null, 'ของมาหลังใบล่าสุด → ไม่มีป้าย')
}

section('summarizePurchaseStatus — Dashboard')
{
  const reqs = [
    req({ id: 1, code: 'A', notified_on: '2026-10-01' }),
    req({ id: 2, code: 'A', notified_on: '2026-11-05' }),
    req({ id: 3, code: 'B', notified_on: '2026-11-10' }),
    req({ id: 4, code: 'C', notified_on: '2026-10-20' }),                              // Excel รอ แต่บิลเข้าแล้ว
    req({ id: 5, code: 'D', notified_on: '2026-09-01', status: PR_STATUS.ARRIVED }),  // ประวัติแจ้งซื้อ ติ๊กแล้ว
    req({ id: 6, code: 'E', notified_on: '2026-09-01', status: PR_STATUS.CANCELLED }),
  ]
  const s = summarizePurchaseStatus(reqs, { C: ['2026-11-01'], D: ['2026-09-10'] }, TODAY)
  eq(s.waiting.map(r => [r.code, r.waitDays, r.count]), [['A', 44, 2], ['B', 4, 1]], 'รอของ 1 แถวต่อรหัส (ใบเก่าสุด + จำนวนใบ) เรียงรอนานสุดก่อน')
  eq(Object.keys(s.pendingByCode).sort(), ['A', 'B'], 'pendingByCode = รหัสเดียวกับ waiting')
  eq(s.pendingByCode.A === s.waiting[0], true, 'ป้ายกับรายการเป็นแถวเดียวกัน (Rule #6)')
  eq(s.notMoved.map(r => [r.id, r.arrivedOn]), [[4, '2026-11-01']], 'Excel ยังรอแต่บิลเข้าแล้ว = ใบ C เท่านั้น (D ติ๊กแล้ว · E ยกเลิก)')
  eq(summarizePurchaseStatus([], {}, TODAY), { waiting: [], pendingByCode: {}, notMoved: [] }, 'ไม่มีข้อมูล → ว่าง')
}

console.log(`\n${fail ? '✗' : '✓'} ${fail ? `ล้ม ${fail} / ` : 'ผ่านทั้งหมด '}${pass + fail} assertions`)
if (fail) process.exit(1)
