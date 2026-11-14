// purchaseReportSheet.js — อ่าน "รายงานแจ้งการสั่งซื้อยา" (รายงานการซื้อยา_69.xlsx) → แถว purchase_request
// + คำนวณสถานะสด (รอของกี่วัน / มาส่งแล้ว) จาก receive_logs
//
// pure module: ไม่ import supabase (golden test: npm run test:purchase)
// ADR-0030: Excel เป็นตัวจริง — นำเข้าแบบแทนทั้งชุด เก็บเฉพาะ วันที่แจ้ง + สถานะ + เหตุผล + หมายเหตุ
//           ไม่ลอกคอลัมน์ตัวเลข (คงเหลือ/ROP/จำนวนแนะนำ) เพราะเป็น snapshot ที่ขัดกับ ReorderApp/บัตรยา
//
// โครงไฟล์ (สำรวจ 14/11/2569):
//   ชีท "รายงานซื้อยา" = รายการที่แจ้งแล้วรอของ — หัวตารางแถว 4 · A ☐/☑ · B วันที่แจ้งสั่ง · E รหัสHosxp
//                         G รายการยา · H หน่วย · R เหตุผลที่แจ้ง · X หมายเหตุ
//   ชีท "Sheet1"       = ประวัติที่ย้ายออกแล้ว — ไม่มีหัวตาราง · ข้อมูลเริ่มคอลัมน์ B (เลื่อนจากชีทหลัก 1 คอลัมน์)
//                         ☑ = มาส่งแล้ว · ☐ = ยกเลิก (ย้ายออกโดยไม่ได้ของ)

export const MAIN_SHEET = 'รายงานซื้อยา'
export const HISTORY_SHEET = 'Sheet1'

export const PR_STATUS = { WAITING: 'รอ', ARRIVED: 'มาส่งแล้ว', CANCELLED: 'ยกเลิก' }

const CHECKED = '☑'
const UNCHECKED = '☐'

// ตำแหน่งคอลัมน์นับจากช่องติ๊ก (ชีทหลัก: ช่องติ๊ก = A) — ใช้ร่วมทั้ง 2 ชีท
const OFFSET = { date: 1, code: 4, type: 5, name: 6, unit: 7, reason: 17, note: 23 }
// หัวคอลัมน์ที่ต้องเจอในชีทหลัก — ถ้าไฟล์ถูกแทรก/ย้ายคอลัมน์ ให้หยุดแทนที่จะอ่านผิดช่องเงียบๆ
const EXPECT_HEADER = { date: 'วันที่แจ้งสั่ง', code: 'รหัส', name: 'รายการยา', unit: 'หน่วย', reason: 'เหตุผล', note: 'หมายเหตุ' }

const txt = (v) => String(v ?? '').trim()

/** Excel serial หรือ "DD/MM/YYYY" (พ.ศ./ค.ศ.) → "YYYY-MM-DD" | null */
export function toIsoDate(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 1 && v < 300000) {
    // Math.floor — เศษคือเวลา (ดู excelSerial.js)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000)
    let y = d.getUTCFullYear()
    if (y >= 2500 && y <= 2600) y -= 543
    if (y < 1990 || y > 2100) return null
    return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(txt(v))
  if (!m) return null
  let y = +m[3]
  if (y < 100) y += 2500            // "12/11/69" = พ.ศ. 2569
  if (y >= 2500) y -= 543
  if (y < 1990 || y > 2100) return null
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** หาแถวหัวตารางของชีทหลัก (แถวที่มีทั้ง "วันที่แจ้งสั่ง" และ "รหัส…") → index | -1 */
export function findHeaderRow(grid) {
  return (grid || []).findIndex(row => Array.isArray(row)
    && row.some(c => txt(c) === EXPECT_HEADER.date)
    && row.some(c => txt(c).startsWith(EXPECT_HEADER.code)))
}

/** คอลัมน์ช่องติ๊ก = คอลัมน์ที่มี ☑/☐ มากที่สุด (Sheet1 เริ่มคอลัมน์ B ไม่ใช่ A) */
export function findCheckColumn(grid) {
  const count = {}
  for (const row of grid || []) {
    if (!Array.isArray(row)) continue
    row.forEach((c, i) => { const s = txt(c); if (s === CHECKED || s === UNCHECKED) count[i] = (count[i] || 0) + 1 })
  }
  const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0]
  return best ? +best[0] : -1
}

/** ตรวจหัวชีทหลักว่าคอลัมน์ยังอยู่ที่เดิม → รายการคอลัมน์ที่ไม่ตรง ([] = ผ่าน) */
export function checkHeader(headerRow, base) {
  const bad = []
  for (const [k, want] of Object.entries(EXPECT_HEADER)) {
    const got = txt(headerRow?.[base + OFFSET[k]])
    if (!got.startsWith(want)) bad.push(`${k}: คาด "${want}" เจอ "${got}"`)
  }
  return bad
}

/** 1 แถว grid → แถว purchase_request | { skip: เหตุผล } */
export function rowToRequest(row, { base, sheet, rowNumber }) {
  const at = (k) => row?.[base + OFFSET[k]]
  const code = txt(at('code'))
  const mark = txt(row?.[base])
  if (!code && !mark) return null                       // แถวว่าง
  if (!code) return { skip: 'ไม่มีรหัส', sheet, rowNumber }
  const notified_on = toIsoDate(at('date'))
  if (!notified_on) return { skip: 'อ่านวันที่แจ้งไม่ได้', sheet, rowNumber, code }
  let status
  if (sheet === HISTORY_SHEET) status = mark === CHECKED ? PR_STATUS.ARRIVED : PR_STATUS.CANCELLED
  else status = mark === CHECKED ? PR_STATUS.ARRIVED : PR_STATUS.WAITING
  return {
    code,
    name: txt(at('name')) || null,
    unit: txt(at('unit')) || null,
    drug_type: txt(at('type')) || null,
    notified_on,
    status,
    reason: txt(at('reason')) || null,
    note: txt(at('note')) || null,
    source_sheet: sheet,
    source_row: rowNumber,
  }
}

/** grid ของ 1 ชีท → { rows, skipped } · rowOffset = เลขแถวจริงของ grid[0] − 1 */
export function parseSheetGrid(grid, sheet, rowOffset = 0) {
  let start = 0
  let base
  if (sheet === MAIN_SHEET) {
    const h = findHeaderRow(grid)
    if (h < 0) throw new Error(`ชีท ${sheet}: ไม่พบแถวหัวตาราง ("${EXPECT_HEADER.date}" + "รหัสHosxp")`)
    base = grid[h].findIndex(c => txt(c).startsWith('ยามมาส่ง') || txt(c).startsWith('ยามาส่ง'))
    if (base < 0) base = grid[h].findIndex(c => txt(c) === EXPECT_HEADER.date) - OFFSET.date
    const bad = checkHeader(grid[h], base)
    if (bad.length) throw new Error(`ชีท ${sheet}: คอลัมน์ไม่อยู่ที่เดิม — ${bad.join(' · ')}`)
    start = h + 1
  } else {
    base = findCheckColumn(grid)
    if (base < 0) throw new Error(`ชีท ${sheet}: ไม่พบคอลัมน์ช่องติ๊ก ☑/☐`)
  }
  const rows = [], skipped = []
  for (let i = start; i < (grid || []).length; i++) {
    const r = rowToRequest(grid[i], { base, sheet, rowNumber: i + 1 + rowOffset })
    if (!r) continue
    if (r.skip) skipped.push(r); else rows.push(r)
  }
  return { rows, skipped }
}

/** สถิติให้ CLI/ด่านตรวจ */
export function summarize(rows) {
  const by = (sheet, status) => rows.filter(r => r.source_sheet === sheet && (!status || r.status === status)).length
  return {
    total: rows.length,
    main: by(MAIN_SHEET), mainWaiting: by(MAIN_SHEET, PR_STATUS.WAITING), mainArrived: by(MAIN_SHEET, PR_STATUS.ARRIVED),
    history: by(HISTORY_SHEET), historyArrived: by(HISTORY_SHEET, PR_STATUS.ARRIVED), historyCancelled: by(HISTORY_SHEET, PR_STATUS.CANCELLED),
    codes: new Set(rows.map(r => r.code)).size,
  }
}

/** อ่านไฟล์ทั้งเล่ม (XLSX ส่งเข้ามา — module นี้ไม่ import เอง ให้ใช้ได้ทั้ง node และเบราว์เซอร์) */
export function readPurchaseReportWorkbook(XLSX, file) {
  const wb = XLSX.readFile(file, { sheets: [MAIN_SHEET, HISTORY_SHEET] })
  const out = { rows: [], skipped: [] }
  for (const sheet of [MAIN_SHEET, HISTORY_SHEET]) {
    const ws = wb.Sheets[sheet]
    if (!ws) throw new Error(`ไม่พบชีท "${sheet}"`)
    // บังคับเริ่มคอลัมน์ A + แถว 1 — Sheet1 มี !ref เริ่ม B3 ถ้าปล่อยตาม !ref เลขแถว/คอลัมน์จะเลื่อน
    const ref = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')
    ref.s.c = 0; ref.s.r = 0
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true, range: ref })
    const r = parseSheetGrid(grid, sheet, 0)
    out.rows.push(...r.rows); out.skipped.push(...r.skipped)
  }
  if (!out.rows.length) throw new Error('ไม่พบรายการแจ้งซื้อในไฟล์')
  return { ...out, stats: summarize(out.rows) }
}

// ── สถานะสด ─────────────────────────────────────────────────

const isPurchase = (r) => txt(r?.purchase_type) === 'การซื้อ'
const daysBetween = (fromIso, toIso) => Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000)
export const todayIso = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** วันที่รับของซื้อต่อรหัส (เรียงเก่า→ใหม่) จากแถว receive_logs { drug_code, receive_date, purchase_type } */
export function purchaseDatesByCode(receiveRows = []) {
  const m = {}
  for (const r of receiveRows) {
    if (!isPurchase(r)) continue
    const code = txt(r.drug_code), d = txt(r.receive_date).slice(0, 10)
    if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
    ;(m[code] ||= []).push(d)
  }
  for (const k of Object.keys(m)) m[k].sort()
  return m
}

/** สถานะสดของ 1 คำขอ
 *  - ยกเลิก (Excel) → cancelled
 *  - มีบิลซื้อวันรับ ≥ วันที่แจ้ง → arrived (แม้ Excel ยังไม่ติ๊ก) · arrivedOn = บิลแรกหลังแจ้ง
 *  - Excel ติ๊กมาส่งแล้วแต่ไม่เจอบิล → arrived (arrivedOn null)
 *  - นอกนั้น → waiting · waitDays = วันนี้ − วันที่แจ้ง
 *  แจ้งซ้ำหลังของมาแล้ว (แถว "แจ้งซ้ำ: ของมาแล้ว …") = บิลก่อนวันแจ้งไม่นับ → ยังรออยู่ */
export function requestState(req, purchaseDates = [], today = todayIso()) {
  if (req.status === PR_STATUS.CANCELLED) return { state: 'cancelled', arrivedOn: null, waitDays: null, leadDays: null }
  const arrivedOn = purchaseDates.find(d => d >= req.notified_on) || null
  if (arrivedOn) return { state: 'arrived', arrivedOn, waitDays: null, leadDays: daysBetween(req.notified_on, arrivedOn) }
  if (req.status === PR_STATUS.ARRIVED) return { state: 'arrived', arrivedOn: null, waitDays: null, leadDays: null }
  return { state: 'waiting', arrivedOn: null, waitDays: Math.max(0, daysBetween(req.notified_on, today)), leadDays: null }
}

/** ป้ายบนบัตรยา/ตารางวิเคราะห์ — คำขอที่ยังรออยู่ของรหัสนี้ (เก่าสุด = รอนานสุด) | null */
export function pendingRequestFor(requests = [], purchaseDates = [], today = todayIso()) {
  const waiting = requests
    .map(r => ({ ...r, ...requestState(r, purchaseDates, today) }))
    .filter(r => r.state === 'waiting')
    .sort((a, b) => a.notified_on.localeCompare(b.notified_on))
  if (!waiting.length) return null
  return { ...waiting[0], count: waiting.length }
}

/** สรุปให้ Dashboard (คิวงาน · การ์ดภาพรวม · ป้าย Top 5) — นับแบบเดียวกับแท็บ "แจ้งซื้อแล้ว (รอ N)" ใน ReorderApp
 *  - waiting       = 1 แถวต่อรหัสที่ยังรอของ (pendingRequestFor — ใบเก่าสุด + count) เรียงรอนานสุดก่อน
 *  - pendingByCode = { รหัส: แถวเดียวกับใน waiting }
 *  - notMoved      = ใบที่ Excel ยังเป็น "รอ" แต่มีบิลซื้อเข้าแล้ว (= แถบแจ้งเตือนในแท็บ — ต้องไปติ๊ก/ย้ายในไฟล์)
 *                    เรียงตามวันที่บิลเข้า ใหม่สุดก่อน */
export function summarizePurchaseStatus(requests = [], purchaseDates = {}, today = todayIso()) {
  const byCode = {}
  for (const r of requests) (byCode[txt(r.code)] ||= []).push(r)
  const pendingByCode = {}
  const notMoved = []
  for (const [code, list] of Object.entries(byCode)) {
    const dates = purchaseDates[code] || []
    const p = pendingRequestFor(list, dates, today)
    if (p) pendingByCode[code] = p
    for (const r of list) {
      if (r.status !== PR_STATUS.WAITING) continue
      const s = requestState(r, dates, today)
      if (s.state === 'arrived') notMoved.push({ ...r, ...s })
    }
  }
  const waiting = Object.values(pendingByCode).sort((a, b) => b.waitDays - a.waitDays || txt(a.code).localeCompare(txt(b.code)))
  notMoved.sort((a, b) => txt(b.arrivedOn).localeCompare(txt(a.arrivedOn)) || txt(a.code).localeCompare(txt(b.code)))
  return { waiting, pendingByCode, notMoved }
}
