/**
 * ledgerSeed.test.js — golden test สำหรับ src/lib/ledgerSeed.js
 * รัน: node src/ledgerSeed.test.js  (npm run test:ledgerseed)
 * ครอบ: RFC-4180 parse + map master row + filter summary + tie-out — ADR-0007 ข้อ 5
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseCsv, mapMasterRow, seedFromMasterCsv, assertMasterStructure, dedupeCostLayers } from './lib/ledgerSeed.js'

let pass = 0, fail = 0
function check(label, cond) {
  if (cond) { pass++; console.log(`✅ ${label}`) }
  else { fail++; console.log(`❌ ${label}`) }
}

// ============================================================
// 1. parseCsv — RFC-4180 (comma ในค่า + quoted)
// ============================================================
console.log('=== parseCsv (RFC-4180) ===\n')

const csv1 = 'a,b,c\n1,"hello, world",3\n4,5,6'
const g1 = parseCsv(csv1)
check('3 แถว (header + 2 data)', g1.length === 3)
check('quoted comma ไม่แตก field: "hello, world"', g1[1][1] === 'hello, world')
check('แถวปกติ 3 cols', g1[2].length === 3)

const csv2 = '﻿x,y\n"a""b",2' // BOM + escaped quote
const g2 = parseCsv(csv2)
check('strip BOM: header[0]==="x"', g2[0][0] === 'x')
check('escaped quote: a"b', g2[1][0] === 'a"b')

// ============================================================
// 2. mapMasterRow — map + filter summary
// ============================================================
console.log('\n=== mapMasterRow ===\n')

// แถว summary (รหัสยาว่าง) → null
const summaryCells = Array(45).fill('')
summaryCells[27] = '3,723,914.26'
check('แถวรหัสว่าง → null (ตัดทิ้ง)', mapMasterRow(summaryCells, '2026-06') === null)

// แถวจริง
const cells = Array(45).fill('')
cells[5] = '1000028'; cells[6] = 'Tablet'; cells[7] = 'Amoxicillin trihydrate 250mg'
cells[8] = 'เม็ด'; cells[9] = '485.0000'; cells[10] = 'N670219'; cells[12] = 'ยกยอด'
cells[16] = 'บริษัท ก'; cells[20] = '1'; cells[25] = '0.00'; cells[26] = '0.00'
cells[27] = '485.00'; cells[28] = '485.00'
const m = mapMasterRow(cells, '2026-06')
check('drug_code map', m.drug_code === '1000028')
check('closing_value strip + parse: 485', m.closing_value === 485)
check('carry_in_value: 485', m.carry_in_value === 485)
check('closing_qty = col20: 1', m.closing_qty === 1)
check('movement = 0 (opening/in/out)', m.opening_qty === 0 && m.in_qty === 0 && m.out_qty === 0)
check('med_category ยา (Tablet)', m.med_category === 'เวชภัณฑ์ยา')
check('price round4', m.price_per_unit === 485)
check('period set', m.period === '2026-06')
check('status open', m.status === 'open')

// มิใช่ยา
const cellsND = [...cells]; cellsND[6] = 'เวชภัณฑ์มิใช่ยา'
check('med_category มิใช่ยา', mapMasterRow(cellsND, '2026-06').med_category === 'เวชภัณฑ์มิใช่ยา')

// thousands separator + ช่องว่าง
const cellsBig = [...cells]; cellsBig[27] = ' 2,564.79 '
check('thousands separator + trim: 2564.79', mapMasterRow(cellsBig, '2026-06').closing_value === 2564.79)

// item_type ว่าง → ยกยอด
const cellsEmpty = [...cells]; cellsEmpty[12] = '-'
check('item_type "-" → ยกยอด', mapMasterRow(cellsEmpty, '2026-06').item_type === 'ยกยอด')

// ============================================================
// 2b. dedupeCostLayers — รวมแถว cost-layer key ซ้ำ
// ============================================================
console.log('\n=== dedupeCostLayers ===\n')

const mkRow = (o) => ({
  period: '2026-07', drug_code: '1', lot: 'A', item_type: 'ยกยอด', price_per_unit: 150,
  opening_qty: 0, in_qty: 0, out_qty: 0, adjust_qty: 0,
  carry_in_value: 0, in_value: 0, out_value: 0, adjust_value: 0,
  closing_qty: 0, closing_value: 0, ...o,
})
// 2 แถว key เดียวกัน (period+code+lot+type+price) → รวมเป็น 1
const dd = dedupeCostLayers([
  mkRow({ carry_in_value: 750, out_value: 750, closing_value: 0, opening_qty: 5, out_qty: 5, closing_qty: 0 }),
  mkRow({ carry_in_value: 3000, out_value: 750, closing_value: 2250, opening_qty: 20, out_qty: 5, closing_qty: 15 }),
])
check('รวม 2 แถว key เดียว → 1 แถว', dd.rows.length === 1)
check('merged = 1', dd.merged === 1)
check('carry_in รวม: 3750', dd.rows[0].carry_in_value === 3750)
check('out_value รวม: 1500', dd.rows[0].out_value === 1500)
check('closing_value = สมการ (3750+0−1500): 2250', dd.rows[0].closing_value === 2250)
check('opening_qty รวม: 25', dd.rows[0].opening_qty === 25)
check('closing_qty = สมการ (25+0−10): 15', dd.rows[0].closing_qty === 15)
// key ต่างราคา → ไม่รวม (คนละ cost layer — ADR-0007)
const dd2 = dedupeCostLayers([mkRow({ price_per_unit: 150 }), mkRow({ price_per_unit: 200 })])
check('ราคาต่าง → ไม่รวม (2 cost layer)', dd2.rows.length === 2 && dd2.merged === 0)

// ============================================================
// 3. seedFromMasterCsv — ไฟล์จริง (ก.ค.69)
// ============================================================
console.log('\n=== seedFromMasterCsv (master CSV จริง) ===\n')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const csvPath = path.join(__dirname, '..', 'csvfile', 'ยอดคลังยา_master_69.csv')
if (fs.existsSync(csvPath)) {
  const text = fs.readFileSync(csvPath, 'utf8')
  const { rows, skipped, merged, tieOut } = seedFromMasterCsv(text, '2026-07')
  // งวด ก.ค.69 (ไฟล์อัปเดต 2026-07-10): 1015 data rows − 7 summary (รหัสยาว่าง) = 1008 mapped
  //   − 1 merged (cost-layer key ซ้ำ: 1690006/QU5001A/ยกยอด/150) = 1014 ledger rows
  // (แถว 'แก้ไขระบบ' code='-' legit ถูก seed — จะถูกลบตอนขึ้นเดือนใหม่ ตาม context [88]/[100])
  check('seed 1014 ledger rows (1015 − 7 summary − 1 merged)', rows.length === 1014)
  check('skipped 7 summary rows', skipped === 7)
  check('merged 1 cost-layer ซ้ำ (dedup กันชน unique index)', merged === 1)
  // tie-out reference = แถว summary ที่ Excel คำนวณเอง (idx27 = มูลค่าคงคลัง ก.ค.) — ไม่ circular:
  //   row "เวชภัณฑ์มิใช่ยา" idx27 = 205,381.42 → ตรงเป๊ะกับ seed = หลักฐาน mapping ถูก
  //   Excel แยก 3 หมวด: ยา 3,757,421.07 / มิใช่ยา 205,381.42 / สมุนไพร_สสจ 47,009;
  //   seed มี 2 หมวด — สมุนไพร + แถวหมวดพิเศษถูกรวมเป็น drug = 3,802,580.07
  check('tie-out มิใช่ยา = 205,381.42 (ตรง summary Excel)', Math.abs(tieOut.nonDrug - 205381.42) < 0.01)
  check('tie-out ยา = 3,802,580.07', Math.abs(tieOut.drug - 3802580.07) < 0.01)
  check('tie-out รวม = 4,007,961.49', Math.abs(tieOut.total - 4007961.49) < 0.01)
  check('ทุกแถวมี drug_code (รวม "-" ของแถวแก้ไขระบบ)', rows.every(r => !!r.drug_code))
  check('ทุกแถว period = 2026-07', rows.every(r => r.period === '2026-07'))
  // dedup: ไม่มี cost-layer key ซ้ำเหลือ (กันชน uq_stock_ledger_row ตอน insert)
  const keys = new Set(rows.map(r => `${r.period}|${r.drug_code}|${r.lot}|${r.item_type}|${r.price_per_unit}`))
  check('ไม่มี cost-layer key ซ้ำ (unique keys === rows)', keys.size === rows.length)
} else {
  console.log('⚠️  ข้าม test ไฟล์จริง — ไม่พบ ' + csvPath)
}

// ============================================================
// 4. assertMasterStructure — structure guard (2026-07-05)
// ============================================================
console.log('\n=== assertMasterStructure (guard) ===\n')

// header ถูกต้อง → ไม่ throw
const goodHeader = Array(45).fill('')
goodHeader[5] = 'รหัสHosxp'; goodHeader[7] = 'รายการยา'; goodHeader[10] = 'Lot Number'
goodHeader[12] = 'ชนิดรายการ'; goodHeader[20] = 'คงเหลือหลังจ่าย'
let threwGood = false
try { assertMasterStructure(goodHeader) } catch { threwGood = true }
check('header ตรงตำแหน่ง → ไม่ throw', threwGood === false)

// คอลัมน์สลับ (รหัสหายจาก idx5) → throw
const badHeader = [...goodHeader]; badHeader[5] = 'คอลัมน์อื่น'
let threwBad = false
try { assertMasterStructure(badHeader) } catch { threwBad = true }
check('คอลัมน์รหัสเลื่อน → throw (กัน seed เพี้ยนเงียบ)', threwBad === true)

// ============================================================
console.log(`\nผล: ${pass} ผ่าน, ${fail} ไม่ผ่าน`)
if (fail > 0) process.exit(1)
