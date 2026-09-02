// นำเข้า CSV ยืม-คืนยาระหว่างโรงพยาบาล (ไฟล์ `ยืมยา-คืนยา.csv` ที่คลังทำใน Excel)
// pure module — ห้าม import supabase (ต้องรันใน node ได้ ดู CLAUDE.md §Commands)
//
// ทิศทางไม่ได้อยู่ในไฟล์ตรงๆ — ต้อง derive จาก "รพ.ที่ขอยืม" vs "รพ.ที่ให้ยืม":
//   รพ.เรา = ผู้ขอยืม → borrow (เรายืมเขา) · รพ.เรา = ผู้ให้ยืม → lend (เราให้เขายืม)
//   ไม่มีชื่อ รพ.เราสักฝั่ง = แถวเสีย (ไม่เดา — ผิดทิศทางแล้วยอดค้างคืนสลับข้าง)
import { parseCsv } from './ledgerSeed.js'

// เทียบแบบ "มีคำนี้อยู่ในชื่อ" เพราะไฟล์เขียน `รพ.ประชาธิปัตย์` แต่ constant ในโค้ดพิมพ์เต็ม `โรงพยาบาลประชาธิปัตย์`
export const HOME_HOSPITAL_HINT = 'ประชาธิปัตย์'

export const LOAN_CSV_HEADERS = {
  seq: 'ลำดับ', borrower: 'รพ.ที่ขอยืม', loanDoc: 'เลขที่ใบยืม', lender: 'รพ.ที่ให้ยืม',
  code: 'รหัสยา', form: 'รูปแบบ', name: 'ชื่อยา', lot: 'Lot', exp: 'Exp',
  qty: 'จำนวน', unit: 'หน่วยนับ', price: 'ราคาต่อหน่วย', total: 'ราคารวมภาษี',
  loanDate: 'วันที่ให้ยืม', loanCompany: 'บริษัทที่ให้ยืม',
  returnDate: 'วันที่รับคืนยา', returnDoc: 'เลขที่ใบคืน', returnCompany: 'บริษัทที่รับคืน',
}

// คอลัมน์ที่ import ทับของเดิมได้ — ไม่รวม key (direction/counterparty/drug_code/lot/loan_date/qty
// เปลี่ยนค่า = คนละรายการ ไม่ใช่การแก้) และไม่รวม `note` ที่เป็นของฝั่งแอปล้วน ไฟล์ไม่มีคอลัมน์นี้
export const LOAN_IMPORT_FIELDS = [
  'drug_name', 'dosage_form', 'exp', 'unit', 'price_per_unit', 'total_price',
  'loan_doc', 'loan_company', 'return_date', 'return_doc', 'return_company',
]

const txt = (v) => String(v ?? '').trim()
// `-` ในไฟล์ = ไม่มีค่า (lot/รหัสยา/exp ใช้ขีดแทนช่องว่าง) → null ให้ตรงกับที่ seed ไว้ใน DB
const dashNull = (v) => { const s = txt(v); return (!s || s === '-') ? null : s }
const num = (v) => {
  const s = txt(v).replace(/,/g, '')            // "1,605.00" → 1605
  if (!s || s === '-') return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

// วันที่ในไฟล์เป็น DD/MM/YYYY ค.ศ. — เผื่อ พ.ศ. ไว้ด้วย (ถ้าปี ≥ 2400 ถือว่าเป็น พ.ศ.)
export function parseSlashDate(v) {
  const s = txt(v)
  if (!s || s === '-') return null
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = Number(m[1]), mo = Number(m[2])
  let y = Number(m[3])
  if (y >= 2400) y -= 543
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function isHomeHospital(name) {
  return txt(name).includes(HOME_HOSPITAL_HINT)
}

// key จับคู่แถว CSV ↔ แถวใน DB — ต้องตรงกับ unique index `drug_loan_dedupe_key`
// ใน drug_loan_migration.sql เป๊ะๆ ไม่งั้น import สร้างแถวที่ DB ปฏิเสธ (duplicate key)
export function loanKey(r) {
  return [
    r.direction,
    txt(r.counterparty),
    r.drug_code ?? '',
    r.lot ?? '-',
    r.loan_date ?? '1900-01-01',
    Number(r.qty ?? 0),
  ].join('|')
}

// แปลง 1 แถว CSV (object ที่ key เป็นชื่อหัวคอลัมน์) → แถว drug_loan
// คืน { row } หรือ { error } — ไม่ throw เพื่อให้ preview โชว์ได้ว่าแถวไหนเสียเพราะอะไร
export function mapLoanCsvRow(o, lineNo) {
  const H = LOAN_CSV_HEADERS
  const borrower = txt(o[H.borrower])
  const lender = txt(o[H.lender])
  const name = txt(o[H.name])
  if (!name) return { error: { lineNo, reason: 'ไม่มีชื่อยา' } }

  let direction, counterparty
  if (isHomeHospital(borrower)) { direction = 'borrow'; counterparty = lender }
  else if (isHomeHospital(lender)) { direction = 'lend'; counterparty = borrower }
  else return { error: { lineNo, reason: `ไม่มีชื่อ รพ.เราทั้งสองฝั่ง (${borrower || '-'} / ${lender || '-'})`, drug_name: name } }

  if (!counterparty) return { error: { lineNo, reason: 'ไม่มีชื่อคู่สัญญาอีกฝั่ง', drug_name: name } }

  const loanDateRaw = txt(o[H.loanDate])
  if (loanDateRaw && loanDateRaw !== '-' && !parseSlashDate(loanDateRaw)) {
    return { error: { lineNo, reason: `วันที่ให้ยืมอ่านไม่ออก "${loanDateRaw}" (ต้องเป็น วว/ดด/ปปปป)`, drug_name: name } }
  }
  const returnDateRaw = txt(o[H.returnDate])
  if (returnDateRaw && returnDateRaw !== '-' && !parseSlashDate(returnDateRaw)) {
    return { error: { lineNo, reason: `วันที่รับคืนอ่านไม่ออก "${returnDateRaw}" (ต้องเป็น วว/ดด/ปปปป)`, drug_name: name } }
  }

  return {
    row: {
      direction,
      counterparty,
      drug_code: dashNull(o[H.code]),
      drug_name: name,
      dosage_form: dashNull(o[H.form]),
      lot: dashNull(o[H.lot]) || '-',          // DB default '-' (ห้ามเป็น null ไม่งั้น key ไม่ตรง index)
      exp: dashNull(o[H.exp]),
      qty: num(o[H.qty]),
      unit: dashNull(o[H.unit]),
      price_per_unit: num(o[H.price]),
      total_price: num(o[H.total]),
      loan_date: parseSlashDate(o[H.loanDate]),
      loan_doc: dashNull(o[H.loanDoc]),
      loan_company: dashNull(o[H.loanCompany]),
      return_date: parseSlashDate(o[H.returnDate]),
      return_doc: dashNull(o[H.returnDoc]),
      return_company: dashNull(o[H.returnCompany]),
      _line: lineNo,
      _seq: txt(o[H.seq]),
    },
  }
}

// อ่านไฟล์ทั้งก้อน → { rows, errors }
export function parseLoanCsv(text) {
  const cells = parseCsv(String(text || '')).filter(r => r.some(c => txt(c) !== ''))
  if (cells.length === 0) return { rows: [], errors: [{ lineNo: 0, reason: 'ไฟล์ว่าง' }] }

  const header = cells[0].map(txt)
  const missing = [LOAN_CSV_HEADERS.borrower, LOAN_CSV_HEADERS.lender, LOAN_CSV_HEADERS.name, LOAN_CSV_HEADERS.loanDate]
    .filter(h => !header.includes(h))
  if (missing.length) {
    return { rows: [], errors: [{ lineNo: 1, reason: `หัวคอลัมน์ไม่ครบ: ขาด ${missing.join(', ')}` }] }
  }

  const rows = [], errors = []
  for (let i = 1; i < cells.length; i++) {
    const o = {}
    header.forEach((h, j) => { o[h] = cells[i][j] })
    const res = mapLoanCsvRow(o, i + 1)
    if (res.error) errors.push(res.error)
    else rows.push(res.row)
  }
  return { rows, errors }
}

const sameVal = (a, b) => {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b)
  return txt(a) === txt(b)
}

// เทียบไฟล์กับของในระบบ → แผนการ import (ยังไม่แตะ DB)
//   inserts   = มีในไฟล์ ไม่มีในระบบ
//   updates   = key ตรงกัน แต่มีช่องที่ค่าต่าง (เก็บ changed ไว้โชว์ว่าอะไรเปลี่ยน)
//   unchanged = ตรงกันทุกช่อง
//   missing   = มีในระบบ แต่ไม่มีในไฟล์
//   duplicates = แถวในไฟล์ที่ key ซ้ำกันเอง (แถวหลังถูกข้าม — DB มี unique index รับไม่ได้อยู่แล้ว)
export function diffLoanImport(csvRows, dbRows) {
  const dbByKey = new Map()
  for (const r of dbRows || []) dbByKey.set(loanKey(r), r)

  const inserts = [], updates = [], unchanged = [], duplicates = []
  const seen = new Set()

  for (const row of csvRows || []) {
    const key = loanKey(row)
    if (seen.has(key)) { duplicates.push(row); continue }
    seen.add(key)

    const before = dbByKey.get(key)
    if (!before) { inserts.push(row); continue }

    const changed = LOAN_IMPORT_FIELDS.filter(f => !sameVal(row[f], before[f]))
    if (changed.length === 0) unchanged.push(row)
    else {
      const fields = {}
      for (const f of changed) fields[f] = row[f]
      updates.push({ id: before.id, before, row, fields, changed })
    }
  }

  const missing = (dbRows || []).filter(r => !seen.has(loanKey(r)))
  return { inserts, updates, unchanged, missing, duplicates }
}
