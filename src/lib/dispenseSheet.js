// dispenseSheet.js — อ่านชีท "เบิก " จาก .xlsm → แถว dispense_logs
//
// pure module: ไม่ import supabase (รัน golden test ใน node ได้ — npm run test:dispensesheet)
//
// ⚠️ 3 เรื่องเฉพาะของชีทนี้:
//   1. **ชื่อชีทมีเว้นวรรคต่อท้าย** — `'เบิก '` ไม่ใช่ `'เบิก'` เรียกผิดตัวเดียวก็หาไม่เจอ
//   2. **หัวตารางอยู่แถวที่ 6** (index 5) — แถว 1–3 เป็นบล็อกจดลอย (ชื่อยา + ตาราง Lot/Exp เล็กๆ)
//      ถ้าใช้แถวแรกเป็นหัวตาราง จะได้ key เพี้ยนทั้งไฟล์
//   3. วันที่เป็น Excel serial ต้องอ่านค่าดิบ ห้ามใช้ค่าที่แสดง (รูปแบบปนกัน US/ไทย)

export const DISPENSE_SHEET_NAME = 'เบิก '

const txt = (v) => String(v ?? '').trim()

/** ค่าที่ถือว่า "ไม่มีค่า" — ตรงกับ getVal ใน DispenseLogApp */
export function cleanVal(v) {
  const s = txt(v)
  if (!s) return null
  const lower = s.toLowerCase()
  if (lower === '(blank)' || lower === 'blank' || s === '-') return null
  return s
}

/** หาแถวหัวตาราง — ต้องเจอทั้ง "วันที่เบิก" และ "ปริมาณ (ออก)" ถึงจะแน่ใจว่าใช่แถวหัวจริง
 *  (บล็อกจดด้านบนมีคำว่า "Lot Number"/"Exp" ด้วย ถ้าเช็คคำเดียวจะจับผิดแถว) */
export function findHeaderRow(grid) {
  return (grid || []).findIndex(row => {
    if (!Array.isArray(row)) return false
    const cells = row.map(txt)
    return cells.includes('วันที่เบิก') && cells.some(c => c.replace(/\s/g, '') === 'ปริมาณ(ออก)')
  })
}

/** map หัวตาราง → index */
export function mapDispenseColumns(header) {
  const h = (header || []).map(txt)
  const find = (test) => h.findIndex(test)
  return {
    dispense_date: find(s => s === 'วันที่เบิก'),
    main_log: find(s => s.toLowerCase() === 'mainlog'),
    detail_log: find(s => s.toLowerCase() === 'detailedlog'),
    drug_code: find(s => s === 'รหัส' || s.includes('รหัสยา')),
    drug_type: find(s => s === 'ชนิด'),
    drug_name: find(s => s.includes('รายการยา') || s.includes('ชื่อยา')),
    drug_unit: find(s => s === 'หน่วย'),
    price_per_unit: find(s => s.includes('ราคา/หน่วย')),
    lot: find(s => s.toLowerCase().includes('lot')),
    exp: find(s => s.toLowerCase() === 'exp'),
    item_type: find(s => s.includes('ชนิดรายการ')),
    qty_before: find(s => s.includes('คงเหลือก่อนเบิก')),
    qty_out: find(s => s.replace(/\s/g, '') === 'ปริมาณ(ออก)'),
    qty_after: find(s => s.includes('คงเหลือหลังจ่าย')),
    department: find(s => s.includes('หน่วยงานที่เบิก')),
    note: find(s => s === 'หมายเหตุ'),
    near_exp_date: find(s => s.includes('วันที่ใกล้exp') || s.includes('วันที่ใกล้ exp')),
  }
}

/** Excel serial → ISO (YYYY-MM-DD) — UTC ล้วนกัน timezone เลื่อนวัน
 *  แปลง พ.ศ. → ค.ศ. เฉพาะช่วง 2500–2600 (คนพิมพ์ปี พ.ศ. ลงช่องวันที่) */
export function serialToIso(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1 || n > 300000) return null
  // Math.floor ไม่ใช่ round — serial ที่มีเศษคือ "เวลา" ของวันนั้น (46202.58 = 29 มิ.ย. 13:54)
  // round จะปัดเศษ >= 0.5 ขึ้นเป็นวันถัดไป (ชีทเบิกมี 1,316 แถวที่เพี้ยนแบบนี้ — เจอ 2026-09-21)
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000)
  if (isNaN(d)) return null
  let y = d.getUTCFullYear()
  if (y >= 2500 && y <= 2600) y -= 543
  if (y < 1990 || y > 2100) return null
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** ข้อความวันที่ → ISO (DD/MM/YYYY, D/M/YYYY, พ.ศ.) */
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
  if (y > 2500) y -= 543
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > 2200) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (isNaN(dt) || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function cellToIso(v) {
  return typeof v === 'number' ? serialToIso(v) : textToIso(v)
}

/** ISO → DD/MM/YYYY (รูปแบบที่ dispense_logs.exp เก็บ — เป็น TEXT) */
export function isoToThai(iso) {
  if (!iso) return null
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = cleanVal(v)
  if (s == null) return null
  const n = parseFloat(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** รหัสยา — ตัด .0 ที่ Excel ติดมา แต่คง 0 นำหน้า */
export function normalizeCode(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return String(Math.round(v))
  const s = cleanVal(v)
  return s == null ? null : s.replace(/\.0$/, '')
}

/** lot — เก็บตามที่พิมพ์มาเสมอ (ห้ามแปลง scientific notation — เหตุการณ์ 2026-07-29) */
export function normalizeLot(v) {
  if (v == null || v === '') return '-'
  if (typeof v === 'number') return String(v)
  return txt(v) || '-'
}

/** 1 แถว → แถว dispense_logs | null ถ้าข้าม (ไม่มีทั้งชื่อยาและรหัสยา) */
export function rowToDispenseLog(row, C, today) {
  const at = (k) => (C[k] >= 0 ? row[C[k]] : undefined)
  const drugName = cleanVal(at('drug_name'))
  const drugCode = normalizeCode(at('drug_code'))
  if (!drugName && (!drugCode || drugCode === '-')) return null
  return {
    dispense_date: cellToIso(at('dispense_date')) || today,
    main_log: cleanVal(at('main_log')) || '-',
    detail_log: cleanVal(at('detail_log')) || '-',
    department: cleanVal(at('department')) || '-',
    note: cleanVal(at('note')),
    drug_code: drugCode,
    drug_name: drugName || '-',
    drug_type: cleanVal(at('drug_type')) || '-',
    item_type: cleanVal(at('item_type')),
    drug_unit: cleanVal(at('drug_unit')) || '-',
    price_per_unit: num(at('price_per_unit')),
    lot: normalizeLot(at('lot')),
    exp: isoToThai(cellToIso(at('exp'))) || '-',
    near_exp_date: cellToIso(at('near_exp_date')),
    qty_before: num(at('qty_before')),
    qty_out: num(at('qty_out')) ?? 0,
    qty_after: num(at('qty_after')),
    source: 'csv',
  }
}

/** เหตุผลที่แถวน่าสงสัย — ไม่บล็อกการนำเข้า แต่ต้องรายงาน */
export function rowWarnings(r, sheetRow) {
  const issues = []
  if (!r.drug_name || r.drug_name === '-') issues.push('ไม่มีชื่อยา')
  if (!r.drug_code || r.drug_code === '-') issues.push('ไม่มีรหัสยา')
  if ((!r.lot || r.lot === '-') && r.drug_type !== 'เวชภัณฑ์มิใช่ยา') issues.push('ไม่มี Lot')
  if (!r.dispense_date) issues.push('อ่านวันที่เบิกไม่ได้')
  if (!r.department || r.department === '-') issues.push('ไม่มีหน่วยงาน')
  return issues.length ? { row: sheetRow, name: r.drug_name || '-', code: r.drug_code || '-', issues } : null
}

/** ทั้งชีท → { rows, warnings, skipped, total, headerRow } */
export function parseDispenseGrid(grid, today = new Date().toISOString().slice(0, 10)) {
  const headerRow = findHeaderRow(grid)
  if (headerRow < 0) throw new Error('ไม่พบหัวตาราง (ต้องมีคอลัมน์ "วันที่เบิก" และ "ปริมาณ (ออก)")')
  const C = mapDispenseColumns(grid[headerRow])
  if (C.drug_name < 0 && C.drug_code < 0) throw new Error('ไม่พบคอลัมน์ชื่อยา/รหัสยา')
  if (C.qty_out < 0) throw new Error('ไม่พบคอลัมน์ปริมาณ (ออก)')

  const rows = []
  const warnings = []
  let skipped = 0
  for (let i = headerRow + 1; i < grid.length; i++) {
    const raw = grid[i]
    if (!raw || !raw.some(c => txt(c) !== '')) { skipped++; continue }
    const obj = rowToDispenseLog(raw, C, today)
    if (!obj) { skipped++; continue }
    rows.push(obj)
    const w = rowWarnings(obj, i + 1)
    if (w) warnings.push(w)
  }
  return { rows, warnings, skipped, total: grid.length - headerRow - 1, headerRow, columns: C }
}

export function readDispenseWorkbook(XLSX, filePath, sheetName = DISPENSE_SHEET_NAME) {
  const wb = XLSX.readFile(filePath, { sheets: [sheetName], cellDates: false })
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`ไม่พบชีท "${sheetName}" ในไฟล์ (ชื่อชีทมีเว้นวรรคต่อท้าย)`)
  // raw:true — วันที่เป็น serial ต้องอ่านค่าดิบ (ดูหัวไฟล์ ข้อ 3)
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true })
  return parseDispenseGrid(grid)
}
