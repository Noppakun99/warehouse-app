/**
 * loanImport.test.js — golden test สำหรับ src/lib/loanImport.js
 * รัน: node src/lib/loanImport.test.js  (npm run test:loanimport)
 * ครอบ: derive ทิศทางจากชื่อ รพ. · แปลงวันที่/ตัวเลข/ขีด · key ตรงกับ unique index · diff 5 กอง
 */

import {
  parseSlashDate, isHomeHospital, loanKey, mapLoanCsvRow, parseLoanCsv, diffLoanImport,
} from './loanImport.js'

let pass = 0, fail = 0
function check(label, cond) {
  if (cond) { pass++; console.log(`✅ ${label}`) }
  else { fail++; console.log(`❌ ${label}`) }
}

// ============================================================
// 1. parseSlashDate — ไฟล์เป็น ค.ศ. แต่รับ พ.ศ. ได้ด้วย
// ============================================================
console.log('=== parseSlashDate ===\n')
check('14/02/2025 → 2025-02-14', parseSlashDate('14/02/2025') === '2025-02-14')
check('เลขวัน/เดือนหลักเดียว → เติม 0', parseSlashDate('5/1/2026') === '2026-01-05')
check('ปี พ.ศ. → ลบ 543', parseSlashDate('19/08/2569') === '2026-08-19')
check('ขีด → null', parseSlashDate('-') === null)
check('ว่าง → null', parseSlashDate('') === null)
check('ข้อความอื่น → null (ให้ mapLoanCsvRow ตีเป็นแถวเสีย)', parseSlashDate('19 ส.ค. 69') === null)
check('เดือน 13 → null', parseSlashDate('01/13/2026') === null)

// ============================================================
// 2. isHomeHospital — ไฟล์เขียนย่อ โค้ดเขียนเต็ม ต้อง match ทั้งคู่
// ============================================================
console.log('\n=== isHomeHospital ===\n')
check('รพ.ประชาธิปัตย์ → true', isHomeHospital('รพ.ประชาธิปัตย์') === true)
check('โรงพยาบาลประชาธิปัตย์ → true', isHomeHospital('โรงพยาบาลประชาธิปัตย์') === true)
check('รพ.ปทุมธานี → false', isHomeHospital('รพ.ปทุมธานี') === false)
check('null → false', isHomeHospital(null) === false)

// ============================================================
// 3. loanKey — ต้องตรงกับ unique index drug_loan_dedupe_key
// ============================================================
console.log('\n=== loanKey ===\n')
const base = { direction: 'borrow', counterparty: 'รพ.ปทุมธานี', drug_code: '1000157', lot: 'T670339', loan_date: '2025-12-23', qty: 10 }
check('key ครบ 6 ส่วน', loanKey(base) === 'borrow|รพ.ปทุมธานี|1000157|T670339|2025-12-23|10')
check('drug_code null → ช่องว่าง (COALESCE(drug_code,""))', loanKey({ ...base, drug_code: null }).split('|')[2] === '')
check('lot null → "-" (COALESCE(lot,"-"))', loanKey({ ...base, lot: null }).split('|')[3] === '-')
check('loan_date null → 1900-01-01', loanKey({ ...base, loan_date: null }).split('|')[4] === '1900-01-01')
check('qty null → 0', loanKey({ ...base, qty: null }).split('|')[5] === '0')
check('qty "10" กับ 10 ได้ key เดียวกัน (ไฟล์เป็น string, DB เป็น numeric)', loanKey({ ...base, qty: '10' }) === loanKey(base))

// ============================================================
// 4. mapLoanCsvRow — ทิศทาง + การแปลงค่า
// ============================================================
console.log('\n=== mapLoanCsvRow ===\n')
const csvRow = {
  'ลำดับ': '23', 'รพ.ที่ขอยืม': 'รพ.ประชาธิปัตย์', 'เลขที่ใบยืม': 'ที่ปท0033.3/1986',
  'รพ.ที่ให้ยืม': 'รพ.ปทุมธานี', 'รหัสยา': '1000157', 'รูปแบบ': 'Tablet', 'ชื่อยา': 'Isoniazid 100mg',
  'Lot': 'T670339', 'Exp': '25 กุมภาพันธ์ 2027', 'จำนวน': '10', 'หน่วยนับ': '500เม็ด',
  'ราคาต่อหน่วย': '160.50', 'ราคารวมภาษี': '1,605.00', 'วันที่ให้ยืม': '23/12/2025',
  'บริษัทที่ให้ยืม': 'องค์การเภสัชกรรม', 'วันที่รับคืนยา': '', 'เลขที่ใบคืน': '', 'บริษัทที่รับคืน': '',
}
const m1 = mapLoanCsvRow(csvRow, 24)
check('รพ.เรา = ผู้ขอยืม → borrow', m1.row.direction === 'borrow')
check('คู่สัญญา = อีกฝั่ง', m1.row.counterparty === 'รพ.ปทุมธานี')
check('ราคารวมมี comma → ตัวเลข', m1.row.total_price === 1605)
check('exp เก็บข้อความไทยตามไฟล์', m1.row.exp === '25 กุมภาพันธ์ 2027')
check('ยังไม่คืน → return_date null', m1.row.return_date === null)
check('ช่องว่าง → null ไม่ใช่ ""', m1.row.return_doc === null)

const m2 = mapLoanCsvRow({ ...csvRow, 'รพ.ที่ขอยืม': 'รพ.คลองหลวง', 'รพ.ที่ให้ยืม': 'รพ.ประชาธิปัตย์' }, 25)
check('รพ.เรา = ผู้ให้ยืม → lend', m2.row.direction === 'lend')
check('คู่สัญญาสลับข้างถูก', m2.row.counterparty === 'รพ.คลองหลวง')

const m3 = mapLoanCsvRow({ ...csvRow, 'รหัสยา': '-', 'Lot': '-' }, 26)
check('รหัสยา "-" → null', m3.row.drug_code === null)
check('lot "-" → "-" (ไม่ใช่ null — DB default และ key ใช้ค่านี้)', m3.row.lot === '-')

check('ไม่มีชื่อ รพ.เราสักฝั่ง → error ไม่เดาทิศทาง',
  !!mapLoanCsvRow({ ...csvRow, 'รพ.ที่ขอยืม': 'รพ.ก', 'รพ.ที่ให้ยืม': 'รพ.ข' }, 27).error)
check('ไม่มีชื่อยา → error', !!mapLoanCsvRow({ ...csvRow, 'ชื่อยา': '' }, 28).error)
check('วันที่ให้ยืมอ่านไม่ออก → error (ไม่เงียบๆ ใส่ null)',
  !!mapLoanCsvRow({ ...csvRow, 'วันที่ให้ยืม': '23 ธ.ค. 68' }, 29).error)

// ============================================================
// 5. parseLoanCsv — ทั้งไฟล์ + หัวคอลัมน์ไม่ครบ
// ============================================================
console.log('\n=== parseLoanCsv ===\n')
const CSV = '\uFEFF' + `ลำดับ,รพ.ที่ขอยืม,เลขที่ใบยืม,รพ.ที่ให้ยืม,รหัสยา,รูปแบบ,ชื่อยา,Lot,Exp,จำนวน,หน่วยนับ,ราคาต่อหน่วย,ราคารวมภาษี,วันที่ให้ยืม,บริษัทที่ให้ยืม,วันที่รับคืนยา,เลขที่ใบคืน,บริษัทที่รับคืน
1,รพ.คลองหลวง,ปท./373,รพ.ประชาธิปัตย์,1590002,Tablet,Tenofovir 25mg,W680028,25 กุมภาพันธ์ 2027,10,30เม็ด,160.50,"1,605.00",14/02/2025,องค์การเภสัชกรรม,19/05/2025,ปท./1158,องค์การเภสัชกรรม
2,รพ.ประชาธิปัตย์,รูปถ่าย,รพ.ลำลูกกา,1500013,Tablet,Amoxicillin 1gm,-,-,12,100เม็ด,342.40,"4,108.80",30/01/2025,ดีทแฮล์ม,18/02/2025,รูปถ่าย,ดีทแฮล์ม
3,รพ.ก,ใบยืม,รพ.ข,1000001,Tablet,ยาที่ไม่เกี่ยวกับเรา,X1,-,1,เม็ด,1,1,01/01/2026,บ.,,,`
const parsed = parseLoanCsv(CSV)
check('อ่านได้ 2 แถวดี', parsed.rows.length === 2)
check('แถวที่ไม่มี รพ.เรา → เข้ากอง errors', parsed.errors.length === 1 && parsed.errors[0].lineNo === 4)
check('BOM ไม่ทำให้หัวคอลัมน์แรกเพี้ยน', parsed.rows[0].direction === 'lend')
check('ราคารวมในเครื่องหมายคำพูด (มี comma) อ่านถูก', parsed.rows[0].total_price === 1605)
check('หัวคอลัมน์ไม่ครบ → บอกว่าขาดอะไร', /ขาด/.test(parseLoanCsv('a,b,c\n1,2,3').errors[0].reason))
check('ไฟล์ว่าง → error ไม่ throw', parseLoanCsv('').errors.length === 1)

// ============================================================
// 6. diffLoanImport — 5 กอง
// ============================================================
console.log('\n=== diffLoanImport ===\n')
const db = [
  // ตรงกับ CSV แถว 1 ทุกช่อง
  { id: 1, direction: 'lend', counterparty: 'รพ.คลองหลวง', drug_code: '1590002', drug_name: 'Tenofovir 25mg',
    dosage_form: 'Tablet', lot: 'W680028', exp: '25 กุมภาพันธ์ 2027', qty: 10, unit: '30เม็ด',
    price_per_unit: 160.5, total_price: 1605, loan_date: '2025-02-14', loan_doc: 'ปท./373',
    loan_company: 'องค์การเภสัชกรรม', return_date: '2025-05-19', return_doc: 'ปท./1158', return_company: 'องค์การเภสัชกรรม' },
  // แถวเดียวกับ CSV แถว 2 แต่ในระบบยังไม่ได้ลงวันคืน
  { id: 2, direction: 'borrow', counterparty: 'รพ.ลำลูกกา', drug_code: '1500013', drug_name: 'Amoxicillin 1gm',
    dosage_form: 'Tablet', lot: '-', exp: null, qty: 12, unit: '100เม็ด',
    price_per_unit: 342.4, total_price: 4108.8, loan_date: '2025-01-30', loan_doc: 'รูปถ่าย',
    loan_company: 'ดีทแฮล์ม', return_date: null, return_doc: null, return_company: null, note: 'พิมพ์ในแอป' },
  // มีในระบบ ไม่มีในไฟล์
  { id: 3, direction: 'borrow', counterparty: 'รพ.ธัญบุรี', drug_code: '1470508', drug_name: 'Zidovudine syrup',
    lot: '-', qty: 1, loan_date: '2025-06-02', return_date: '2025-06-27' },
]
const d = diffLoanImport(parsed.rows, db)
check('unchanged 1 แถว (ค่าตรงกันหมด)', d.unchanged.length === 1)
check('updates 1 แถว', d.updates.length === 1)
check('update ชี้ id ถูก', d.updates[0].id === 2)
check('เปลี่ยนเฉพาะช่องที่ต่างจริง (วันคืน + เลขที่ใบคืน + บริษัทที่รับคืน)',
  d.updates[0].changed.join(',') === 'return_date,return_doc,return_company')
check('fields ที่จะเขียนมีแค่ช่องที่เปลี่ยน — ไม่ทับ note ที่พิมพ์ในแอป',
  Object.keys(d.updates[0].fields).length === 3 && !('note' in d.updates[0].fields))
check('missing = แถวในระบบที่ไม่มีในไฟล์', d.missing.length === 1 && d.missing[0].id === 3)
check('inserts = 0 (ไฟล์ตัวอย่างไม่มีของใหม่)', d.inserts.length === 0)

// numeric vs string: DB numeric 160.5 กับไฟล์ "160.50" ต้องไม่นับว่าเปลี่ยน
const dNum = diffLoanImport([{ ...parsed.rows[0], price_per_unit: 160.5 }], [db[0]])
check('160.50 vs 160.5 → ไม่ใช่การเปลี่ยนแปลง', dNum.unchanged.length === 1 && dNum.updates.length === 0)

// แถวใหม่ล้วน
const dNew = diffLoanImport(parsed.rows, [])
check('DB ว่าง → ทุกแถวเป็น insert', dNew.inserts.length === 2 && dNew.missing.length === 0)

// key ซ้ำในไฟล์เอง (DB มี unique index — ปล่อยไปจะ insert ไม่ผ่านทั้งชุด)
const dDup = diffLoanImport([parsed.rows[0], { ...parsed.rows[0] }], [])
check('key ซ้ำในไฟล์ → เข้ากอง duplicates ไม่ยัด insert ซ้ำ', dDup.inserts.length === 1 && dDup.duplicates.length === 1)

check('input null → ไม่ throw', diffLoanImport(null, null).inserts.length === 0)

// ============================================================
console.log(`\n${'='.repeat(40)}`)
console.log(`ผ่าน ${pass} / ล้มเหลว ${fail}`)
// throw แทน process.exit → node จบด้วย exit code ≠ 0 เหมือนกัน แต่ไม่ต้องใช้ global process (eslint browser env)
if (fail > 0) throw new Error(`golden test ไม่ผ่าน ${fail} ข้อ`)
