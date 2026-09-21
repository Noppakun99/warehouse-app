// receiveSheet.js — อ่านชีท "รับยา" จาก .xlsm → แถวพร้อม insert ลง receive_logs
//
// pure module: ไม่ import supabase / ไม่แตะ DB (รัน golden test ใน node ได้ — npm run test:receivesheet)
// ตัว xlsx ถูกส่งเข้ามาเป็น argument (dependency injection) เพื่อให้ test ป้อน worksheet ปลอมได้
//
// ⚠️ กฎเหล็กของไฟล์นี้: **ต้องอ่านค่าดิบ (raw) เท่านั้น ห้ามใช้ raw:false**
//   คอลัมน์วันที่ในชีทเก็บเป็น Excel serial (ตัวเลข) แต่ "รูปแบบที่แสดง" ปนกัน 2 แบบ:
//     serial 46226 แสดงเป็น "7/23/26"  (M/D/YY แบบอเมริกา)
//     serial 46281 แสดงเป็น "16/9/2026" (D/M/YYYY แบบไทย)
//   ถ้าอ่านด้วย raw:false จะได้ข้อความตามรูปแบบที่แสดง แล้ว parse เป็น DD/MM ทั้งหมด
//   → "7/23/26" กลายเป็น 7 มี.ค. แทนที่จะเป็น 23 ก.ค. (ตรวจไฟล์จริง 2026-09-21: เพี้ยน 2,671/2,852 แถว)
//   serial ดิบไม่ขึ้นกับรูปแบบที่แสดง จึงเป็นค่าเดียวที่เชื่อถือได้

export const RECEIVE_SHEET_NAME = 'รับยา'

// คอลัมน์ในชีท "รับยา" — ยึดตามลำดับจริงของไฟล์ (A=0)
// ไม่ match ด้วยชื่อหัวตาราง เพราะชื่อยาวและมีวงเล็บ/ช่องว่างที่แก้ไขได้ง่ายในชีท
// แต่ validateHeader() ด้านล่างเช็คว่าหัวตารางยังตรงกับที่คาด ถ้าคลังสลับคอลัมน์จะ error ทันที
export const COL = {
  order_date: 0, drug_code: 1, drug_type: 2, drug_name: 3, purchase_type: 4,
  lot: 5, exp: 6, bill_number: 7, po_number: 8, qty_received: 9, drug_unit: 10,
  price_per_unit: 11, total_price_vat: 12, total_price_formula: 13, receive_date: 14,
  receive_status: 15, inspect_date: 16, supplier_current: 17, supplier_prev: 18,
  swap_condition: 19, swap_note: 20, swap_items: 21, leadtime: 22, supplier_changed: 23,
  swap_automatch: 27, swap_return_pct: 28,
}

// หัวตารางที่ต้องเจอ (ตรวจ 8 คอลัมน์หลักพอ — ถ้าตรงหมดแปลว่าไฟล์ยังโครงเดิม)
const HEADER_CHECK = [
  [COL.drug_code, 'รหัส'], [COL.drug_name, 'รายการยา'], [COL.lot, 'Lot'],
  [COL.exp, 'Exp'], [COL.bill_number, 'เลขที่บิลซื้อ'], [COL.qty_received, 'จำนวนที่รับ'],
  [COL.receive_date, 'วันที่รับ'], [COL.supplier_current, 'บริษัท'],
]

const norm = (v) => String(v ?? '').trim()

/** ค่าที่ถือว่า "ไม่มีค่า" — ตรงกับ getVal ใน ReceiveLogApp (แอปทำแบบนี้ตอน import CSV) */
export function cleanVal(v) {
  const s = norm(v)
  if (!s) return null
  const lower = s.toLowerCase()
  if (lower === '(blank)' || lower === 'blank' || s === '-') return null
  return s
}

/** Excel serial → ISO (YYYY-MM-DD). serial คือจำนวนวันนับจาก 1899-12-30
 *  ใช้ UTC ล้วนกัน timezone เลื่อนวัน (ไทย UTC+7 ถ้าใช้ local จะเพี้ยนได้ 1 วัน)
 *
 *  ⚠️ serial ที่ได้ปี > 2500 = คนพิมพ์ปี พ.ศ. ลงช่องวันที่ แล้ว Excel เก็บเป็นวันที่ไกลโพ้น
 *     (เจอจริง 3 แถว: serial 244980 = 23/09/2570 ซึ่งคนหมายถึง 23/09/2027)
 *     ต้องลบ 543 เหมือนที่ textToIso ทำ ไม่งั้นค่าที่กรอกถูกต้องจะถูกทิ้งเป็น '-' */
export function serialToIso(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  if (n < 1 || n > 300000) return null            // นอกช่วงวันที่ที่เป็นไปได้
  // Math.floor ไม่ใช่ round — serial ที่มีเศษคือ "เวลา" ของวันนั้น (46202.58 = 29 มิ.ย. 13:54)
  // round จะปัดเศษ >= 0.5 ขึ้นเป็นวันถัดไป (ชีทเบิกมี 1,316 แถวที่เพี้ยนแบบนี้ — เจอ 2026-09-21)
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000)
  if (isNaN(d)) return null
  let y = d.getUTCFullYear()
  if (y >= 2500 && y <= 2600) y -= 543            // พ.ศ. → ค.ศ. (เฉพาะช่วงที่เป็น พ.ศ. ได้จริง)
  // ปีนอกช่วงนี้ = ข้อมูลเสีย ไม่ใช่ พ.ศ. (เช่น serial 80110 = ปี 2119 ลบ 543 ได้ 1576 ไร้สาระ)
  // ยาหมดอายุไกลสุดที่เป็นไปได้ราว 10 ปี — เผื่อถึง 2100 ก็เกินพอ
  if (y < 1990 || y > 2100) return null
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** ข้อความวันที่ → ISO — รองรับ DD/MM/YYYY, D/M/YYYY, ขีดคั่น, และ พ.ศ. (>2500 ลบ 543)
 *  ตรงกับ parseDate ใน ReceiveLogApp เพื่อให้ผลเท่ากับตอน import CSV เป๊ะ
 *  คืน null เมื่อ parse ไม่ได้ (เช่น "648/2569" ที่เป็นเลข PO หลุดมา, "14/1/22029" ปีพิมพ์เกิน) */
export function textToIso(raw) {
  const s0 = cleanVal(raw)
  if (!s0 || s0 === '0') return null
  const s = s0.split(/[\sT]/)[0]
  if (/^\d{5}$/.test(s)) return serialToIso(parseInt(s, 10))
  const sep = s.includes('/') ? '/' : s.includes('-') ? '-' : null
  if (!sep) return null
  const p = s.split(sep).map(x => x.trim())
  if (p.length !== 3) return null
  const [a, b, c] = p.map(Number)
  if ([a, b, c].some(n => !Number.isFinite(n))) return null
  let d, m, y
  if (p[0].length === 4) { y = a; m = b; d = c } else { d = a; m = b; y = c }
  if (y > 2500) y -= 543                            // พ.ศ. → ค.ศ.
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > 2200) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (isNaN(dt) || dt.getUTCDate() !== d) return null   // กัน 31/02 ที่ JS จะ roll over ให้
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** เซลล์ "% คืนโดยประมาณ" → ข้อความอย่างที่คนเห็น
 *  ปกติคลังพิมพ์เป็นข้อความ ("100%", "25-100%", "ตามจำนวนจริง") แต่ถ้าเซลล์ถูกจัดรูปแบบ
 *  เป็นเปอร์เซ็นต์ Excel จะเก็บเป็นตัวเลข (100% = 1) ซึ่งอ่านดิบแล้วได้ "1" ผิดความหมาย
 *  → ใช้ค่าที่ "แสดง" (w) เมื่อเซลล์เป็นตัวเลข เพราะคอลัมน์นี้เป็น enum ไม่ใช่ตัวเลขคำนวณ
 *  @param cell เซลล์ดิบ (ต้องส่งทั้ง object ไม่ใช่ค่า .v) */
export function percentCellToText(cell) {
  if (cell == null) return null
  if (typeof cell === 'object' && cell.t === 'n') {
    if (cell.w) return cleanVal(cell.w)                       // "100%" ตามที่แสดง
    return cleanVal(`${Math.round(cell.v * 100)}%`)           // ไม่มี w → เดาจากค่า
  }
  const v = typeof cell === 'object' ? cell.v : cell
  return cleanVal(v)
}

/** เซลล์วันที่ → ISO — เลือกทางตามชนิดค่าจริง (number = serial, string = ข้อความ) */
export function cellToIso(v) {
  if (typeof v === 'number') return serialToIso(v)
  return textToIso(v)
}

/** ISO → DD/MM/YYYY (รูปแบบที่ `receive_logs.exp` เก็บ — เป็น TEXT ไม่ใช่ date) */
export function isoToThai(iso) {
  if (!iso) return null
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

/** ตัวเลขที่อาจมีคอมมา → number | null */
export function num(v) {
  const s = cleanVal(v)
  if (s == null) return null
  const n = parseFloat(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** รหัสยา — ตัด .0 ที่ Excel ติดมาเมื่อเก็บเป็นตัวเลข แต่ **ห้ามแตะรูปแบบอื่น**
 *  (รหัสบางตัวมี 0 นำหน้าซึ่งต้องเก็บตามที่พิมพ์มา) */
export function normalizeCode(v) {
  const s = cleanVal(v)
  if (s == null) return null
  return typeof v === 'number' ? String(Math.round(v)) : s.replace(/\.0$/, '')
}

/** lot — เก็บตามที่พิมพ์มาเสมอ
 *  ⚠️ ห้ามแปลง scientific notation: lot จริงมีรูปแบบ `26E266` ซึ่ง regex ของเลขวิทยาศาสตร์
 *     มองว่าเป็น 26×10²⁶⁶ แล้วขยายเป็นเลข 269 หลัก → lot หายถาวร (เหตุการณ์ 2026-07-29)
 *     ตัวเลขล้วน (เช่น 24082001) ให้คงค่าเดิม ไม่ใส่คอมมา ไม่ปัด */
export function normalizeLot(v) {
  if (v == null || v === '') return '-'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v)
  const s = norm(v)
  return s === '' ? '-' : s
}

/** ตรวจว่าหัวตารางยังตรงกับที่โค้ดคาด — คลังสลับ/แทรกคอลัมน์แล้วต้อง error ไม่ใช่อ่านผิดเงียบๆ */
export function validateHeader(headerRow) {
  const problems = []
  for (const [idx, expect] of HEADER_CHECK) {
    const got = norm(headerRow?.[idx])
    if (!got.includes(expect)) problems.push(`คอลัมน์ ${idx + 1} ควรเป็น "${expect}" แต่เจอ "${got || '(ว่าง)'}"`)
  }
  return problems
}

/** 1 แถวในชีท → 1 แถวของ receive_logs (33 ฟิลด์ เท่ากับที่ ReceiveLogApp สร้างตอน import CSV)
 *  คืน null เมื่อเป็นแถวที่ต้องข้าม (ไม่มีทั้งชื่อยาและรหัสยา = footer/ผลรวม/แถวว่าง) */
export function rowToReceiveLog(row, fmtRow = null) {
  const at = (k) => row[COL[k]]
  // ค่าที่ "แสดง" ของช่องนั้น (ถ้ามี) — ใช้เฉพาะคอลัมน์ที่เป็น enum ไม่ใช่ตัวเลขคำนวณ
  const shown = (k) => (fmtRow ? cleanVal(fmtRow[COL[k]]) : null)
  const drugName = cleanVal(at('drug_name'))
  const drugCode = normalizeCode(at('drug_code'))
  if (!drugName && (!drugCode || drugCode === '-')) return null

  // นโยบายคืนยา = รวม 4 คอลัมน์คั่น " | " — ตรงกับ ReceiveLogApp
  // (เคยใช้แค่ 2 คอลัมน์ แล้วนโยบายหาย 746 บิล — แก้ 2026-07-05)
  const swap = [at('swap_condition'), at('swap_note'), at('swap_items'), at('swap_automatch')]
    .map(cleanVal).filter(Boolean).join(' | ') || null

  return {
    order_date: cellToIso(at('order_date')),
    receive_date: cellToIso(at('receive_date')),
    inspect_date: cellToIso(at('inspect_date')),
    leadtime: cleanVal(at('leadtime')),
    inspect_lag: null,                                  // ไม่มีคอลัมน์นี้ในชีท
    bill_number: cleanVal(at('bill_number')) || '-',
    po_number: cleanVal(at('po_number')) || '-',
    purchase_type: cleanVal(at('purchase_type')) || '-',
    receive_status: cleanVal(at('receive_status')) || '-',
    main_log: null,                                     // ชีทรับยาไม่มีที่เก็บ (อยู่ในไฟล์ master)
    detail_log: null,
    drug_code: drugCode,
    drug_name: drugName || '-',
    drug_type: cleanVal(at('drug_type')) || '-',
    item_type: null,
    drug_unit: cleanVal(at('drug_unit')),
    supplier_current: cleanVal(at('supplier_current')) || '-',
    supplier_prev: cleanVal(at('supplier_prev')) || '-',
    supplier_changed: cleanVal(at('supplier_changed')) || '-',
    lot: normalizeLot(at('lot')),
    exp: isoToThai(cellToIso(at('exp'))) || '-',        // exp เก็บเป็น DD/MM/YYYY (TEXT)
    note: null,                                         // ชีทไม่มีคอลัมน์หมายเหตุรับยา
    exp_note: null,
    qty_received: num(at('qty_received')),
    unit_per_bill: '-',
    price_per_unit: num(at('price_per_unit')),
    total_price_vat: num(at('total_price_vat')),
    total_price_formula: cleanVal(at('total_price_formula')),
    safety_stock: null,
    sum_of_lead_time: null,
    drug_swap_policy: swap,
    swap_tier_detail: cleanVal(at('swap_automatch')),
    // เซลล์อาจถูกจัดรูปแบบเป็นเปอร์เซ็นต์ (100% เก็บเป็นเลข 1) → ใช้ค่าที่แสดงก่อน
    swap_return_pct: shown('swap_return_pct') ?? cleanVal(at('swap_return_pct')),
    swap_condition_am: null,                            // ไม่มีในชีทนี้ (มาจากไฟล์ master)
  }
}

/** เหตุผลที่แถวน่าสงสัย — ไม่บล็อกการนำเข้า แต่ต้องรายงานให้คนดู
 *  (เวชภัณฑ์มิใช่ยาไม่มี lot ตามธรรมชาติ ไม่ใช่ความผิดพลาด) */
export function rowWarnings(rowObj, sheetRow) {
  const issues = []
  if (!rowObj.drug_name || rowObj.drug_name === '-') issues.push('ไม่มีชื่อยา')
  if (!rowObj.drug_code || rowObj.drug_code === '-') issues.push('ไม่มีรหัสยา')
  if ((!rowObj.lot || rowObj.lot === '-') && rowObj.drug_type !== 'เวชภัณฑ์มิใช่ยา') issues.push('ไม่มี Lot')
  if (!rowObj.bill_number || rowObj.bill_number === '-') issues.push('ไม่มีเลขที่บิล')
  if (!rowObj.receive_date) issues.push('อ่านวันที่รับไม่ได้')
  if (!rowObj.exp || rowObj.exp === '-') issues.push('อ่าน Exp ไม่ได้')
  return issues.length ? { row: sheetRow, name: rowObj.drug_name || '-', code: rowObj.drug_code || '-', issues } : null
}

/** อ่านทั้งชีท → { rows, warnings, skipped, total }
 *  @param grid แถวดิบจาก sheet_to_json({header:1, raw:true}) — **ต้องเป็น raw** (ดูหัวไฟล์)
 */
export function parseReceiveGrid(grid, fmtGrid = null) {
  if (!Array.isArray(grid) || grid.length < 2) throw new Error('ชีทไม่มีข้อมูล')
  const headerProblems = validateHeader(grid[0])
  if (headerProblems.length) {
    throw new Error('หัวตารางไม่ตรงกับที่คาด — คอลัมน์อาจถูกสลับ/แทรก:\n  ' + headerProblems.join('\n  '))
  }
  const rows = []
  const warnings = []
  let skipped = 0
  for (let i = 1; i < grid.length; i++) {
    const raw = grid[i]
    if (!raw || !raw.some(c => norm(c) !== '')) { skipped++; continue }
    const obj = rowToReceiveLog(raw, fmtGrid ? fmtGrid[i] : null)
    if (!obj) { skipped++; continue }
    rows.push(obj)
    const w = rowWarnings(obj, i + 1)     // i+1 = เลขแถวในชีท (1-based รวมหัวตาราง)
    if (w) warnings.push(w)
  }
  return { rows, warnings, skipped, total: grid.length - 1 }
}

/** อ่านไฟล์ .xlsm → ผลเดียวกับ parseReceiveGrid
 *  @param XLSX  โมดูล xlsx (ส่งเข้ามาเพื่อให้ pure module นี้ไม่ผูกกับ import ตรง)
 */
export function readReceiveWorkbook(XLSX, filePath, sheetName = RECEIVE_SHEET_NAME) {
  const wb = XLSX.readFile(filePath, { sheets: [sheetName], cellDates: false })
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`ไม่พบชีท "${sheetName}" ในไฟล์`)
  // raw:true = ค่าดิบ (serial เป็นตัวเลข) — ห้ามเปลี่ยนเป็น false เด็ดขาด ดูเหตุผลหัวไฟล์
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true })
  // grid ข้อความตามที่ Excel แสดง — ใช้เฉพาะคอลัมน์ enum (เช่น % คืน) ที่อ่านค่าดิบแล้วผิดความหมาย
  // **ห้ามใช้กับคอลัมน์วันที่** (รูปแบบที่แสดงปนกัน US/ไทย ดูเหตุผลหัวไฟล์)
  const fmtGrid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: true })
  return parseReceiveGrid(grid, fmtGrid)
}
