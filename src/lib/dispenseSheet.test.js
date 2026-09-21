// Golden tests — src/lib/dispenseSheet.js (อ่านชีท "เบิก " → dispense_logs)
// รัน: npm run test:dispensesheet
// เคสจากไฟล์จริง (สำรวจ 2026-09-21): 8,058 แถว · หัวตารางแถวที่ 6 · ชื่อชีทมีเว้นวรรคท้าย

import {
  findHeaderRow, mapDispenseColumns, serialToIso, textToIso, cellToIso, isoToThai,
  num, normalizeCode, normalizeLot, rowToDispenseLog, rowWarnings, parseDispenseGrid,
  DISPENSE_SHEET_NAME,
} from './dispenseSheet.js'

let pass = 0, fail = 0
const eq = (got, want, label) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++ } else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`) }
}
const section = (t) => console.log(`\n=== ${t} ===`)

section('ชื่อชีท')
eq(DISPENSE_SHEET_NAME, 'เบิก ', 'มีเว้นวรรคต่อท้าย — เรียกผิดตัวเดียวก็หาไม่เจอ')

section('serialToIso — ⚠️ serial ที่มีเศษคือ "เวลา" ไม่ใช่วันถัดไป')
// บั๊กจริงที่เจอ 2026-09-21: Math.round ทำให้ 1,316 แถวเลื่อนไป +1 วัน
eq(serialToIso(46202.5796875), '2026-06-29', 'serial 46202.58 = 29 มิ.ย. 13:54 ไม่ใช่ 30 มิ.ย.')
eq(serialToIso(46202), '2026-06-29', 'serial เต็มวันเดียวกัน')
eq(serialToIso(45936), '2025-10-06', 'serial เต็มวัน')
eq(serialToIso(46281.99), '2026-09-16', 'เศษเกือบเต็มวัน ก็ยังเป็นวันเดิม')
eq(serialToIso(0), null, '0 ไม่ใช่วันที่')
eq(serialToIso(999999), null, 'เกินช่วง')
eq(serialToIso('45936'), null, 'string ไม่รับ')
eq(serialToIso(244980), '2027-09-23', 'ปี พ.ศ. 2570 → 2027')
eq(serialToIso(80110), null, 'ปี 2119 = ข้อมูลเสีย → null')

section('textToIso')
eq(textToIso('06/10/2025'), '2025-10-06', 'DD/MM/YYYY')
eq(textToIso('6/10/2025'), '2025-10-06', 'หลักเดียว')
eq(textToIso('06/10/2568'), '2025-10-06', 'พ.ศ.')
eq(textToIso('-'), null, 'ขีด')
eq(textToIso(''), null, 'ว่าง')
eq(textToIso('31/02/2026'), null, '31 ก.พ. ไม่มีจริง')

section('cellToIso / isoToThai')
eq(cellToIso(45936), '2025-10-06', 'number → serial')
eq(cellToIso('06/10/2025'), '2025-10-06', 'string → text')
eq(isoToThai('2025-10-06'), '06/10/2025', 'ISO → DD/MM/YYYY')
eq(isoToThai(null), null, 'null')

section('num / normalizeCode / normalizeLot')
eq(num(140), 140, 'number')
eq(num('1,605'), 1605, 'คอมมา')
eq(num('-'), null, 'ขีด')
eq(num(''), null, 'ว่าง')
eq(normalizeCode(1500009), '1500009', 'number → string')
eq(normalizeCode('S001'), 'S001', 'รหัสตัวอักษร')
eq(normalizeCode('0150110'), '0150110', 'เลข 0 นำหน้าไม่หาย')
eq(normalizeLot('26E266'), '26E266', '⚠️ lot มี E ห้ามแปลงเป็นเลขวิทยาศาสตร์')
eq(normalizeLot(2506284), '2506284', 'lot ตัวเลข')
eq(normalizeLot(''), '-', 'ว่าง → ขีด')

section('findHeaderRow — ⚠️ หัวตารางอยู่แถวที่ 6 (แถว 1–3 เป็นบล็อกจดลอย)')
const blockRow1 = ['', '', '', '', '', '', '', '', '', '', 'Bisoprolol 2.5mg']
const blockRow2 = ['', '', '', '', '', '', '', '', '', '', 'Lot Number', 'Exp', 'ชนิดรายการ', 'คงเหลือ']
const H = ['', 'วันที่เบิก', 'MainLog', 'DetailedLog', 'รหัส', 'ชนิด', 'รายการยา', 'หน่วย', 'ราคา/หน่วย',
  'Lot Number', 'Exp', 'ชนิดรายการ', 'คงเหลือก่อนเบิก', 'ปริมาณ (ออก)', 'คงเหลือหลังจ่าย',
  'หน่วยงานที่เบิก', 'หมายเหตุ', 'วันที่ใกล้exp']
eq(findHeaderRow([blockRow1, blockRow2, [], [], [], H]), 5, 'ข้ามบล็อกจดด้านบน เจอแถวที่ 6')
eq(findHeaderRow([blockRow2]), -1, 'บล็อกจดมี "Lot Number" แต่ไม่ใช่หัวตาราง → ไม่จับผิด')
eq(findHeaderRow([H]), 0, 'หัวตารางแถวแรกก็ได้')
eq(findHeaderRow([]), -1, 'ว่าง')

section('mapDispenseColumns')
const C = mapDispenseColumns(H)
eq(C.dispense_date, 1, 'วันที่เบิก')
eq(C.drug_code, 4, 'รหัส')
eq(C.qty_out, 13, 'ปริมาณ (ออก)')
eq(C.department, 15, 'หน่วยงานที่เบิก')
eq(C.lot, 9, 'Lot Number')
eq(C.qty_before, 12, 'คงเหลือก่อนเบิก')
eq(C.qty_after, 14, 'คงเหลือหลังจ่าย')

section('rowToDispenseLog — แถวจริงจากชีท')
const row = ['', 45929, 'คลังน้ำเกลือ', 'คลังน้ำเกลือ', 1500009, 'Saline',
  'SodiumChlorideIrrigate 1000ml', 'bott', 24, 2506284, 47655, 'ยกยอด', 20, 10, 10,
  'ห้องยาG', 'นำเข้าจาก ต.ค.68 (unpivot)']
const r = rowToDispenseLog(row, C, '2026-01-01')
eq(r.dispense_date, '2025-09-29', 'วันที่เบิกจาก serial')
eq(r.drug_code, '1500009', 'รหัสยา')
eq(r.drug_name, 'SodiumChlorideIrrigate 1000ml', 'ชื่อยา')
eq(r.lot, '2506284', 'lot')
eq(r.qty_out, 10, 'ปริมาณออก')
eq(r.qty_before, 20, 'คงเหลือก่อน')
eq(r.qty_after, 10, 'คงเหลือหลัง')
eq(r.department, 'ห้องยาG', 'หน่วยงาน')
eq(r.price_per_unit, 24, 'ราคา/หน่วย')
eq(r.source, 'csv', 'source')
eq(Object.keys(r).length, 18, 'ครบ 18 ฟิลด์')

const noDate = [...row]; noDate[1] = ''
eq(rowToDispenseLog(noDate, C, '2026-01-01').dispense_date, '2026-01-01', 'ไม่มีวันที่ → ใช้วันนี้ (ตรงกับแอป)')
const empty = []; empty[13] = 5
eq(rowToDispenseLog(empty, C, '2026-01-01'), null, 'ไม่มีทั้งชื่อและรหัส → ข้าม')

section('rowWarnings')
eq(rowWarnings(r, 7), null, 'แถวสมบูรณ์ → ไม่เตือน')
eq(rowWarnings({ ...r, lot: '-' }, 7).issues, ['ไม่มี Lot'], 'ไม่มี lot → เตือน')
eq(rowWarnings({ ...r, lot: '-', drug_type: 'เวชภัณฑ์มิใช่ยา' }, 7), null, 'เวชภัณฑ์ไม่มี lot = ปกติ')
eq(rowWarnings({ ...r, department: '-' }, 7).issues, ['ไม่มีหน่วยงาน'], 'ไม่มีหน่วยงาน → เตือน')

section('parseDispenseGrid')
const grid = [blockRow1, blockRow2, [], [], [], H, row, [], [...row]]
const out = parseDispenseGrid(grid, '2026-01-01')
eq(out.headerRow, 5, 'เจอหัวตารางแถวที่ 6')
eq(out.rows.length, 2, 'ได้ 2 แถว')
eq(out.skipped, 1, 'ข้ามแถวว่าง')
eq(out.warnings.length, 0, 'ไม่มีคำเตือน')

let threw = null
try { parseDispenseGrid([blockRow1, blockRow2], '2026-01-01') } catch (e) { threw = e.message }
eq(threw?.includes('ไม่พบหัวตาราง'), true, 'ไม่มีหัวตาราง → throw')

console.log(`\nผ่าน ${pass} / ${pass + fail}`)
if (fail > 0) throw new Error(`golden test ไม่ผ่าน ${fail} ข้อ`)
