// Golden tests — src/lib/masterSheet.js (อ่านชีท "Master" → inventory)
// รัน: npm run test:mastersheet
// เคสจากไฟล์จริง (สำรวจ 2026-09-21): 1,092 แถว · 120 ที่เก็บ · 450 รหัสยา

import {
  mapMasterColumns, normalizeLot, normalizeCode, toThaiDate,
  rowToInventoryItem, parseMasterGrid,
} from './masterSheet.js'

let pass = 0, fail = 0
const eq = (got, want, label) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++ } else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`) }
}
const section = (t) => console.log(`\n=== ${t} ===`)

// serial → DD/MM/YYYY (ตัวเดียวกับที่ CLI ส่งเข้ามา)
const s2t = (n) => {
  if (typeof n !== 'number' || n < 1 || n > 300000) return null
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000)
  let y = d.getUTCFullYear()
  if (y >= 2500 && y <= 2600) y -= 543
  if (y < 1990 || y > 2100) return null
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${y}`
}

section('normalizeLot — ⚠️ ห้ามแปลง scientific notation (เหตุการณ์ 2026-07-29)')
eq(normalizeLot('26E266'), '26E266', 'lot มี E ต้องไม่กลายเป็นเลข 269 หลัก')
eq(normalizeLot('26E222'), '26E222', 'lot มี E อีกตัว (เจอจริง 7 ตัวในไฟล์)')
eq(normalizeLot('26D172'), '26D172', 'lot มี D')
eq(normalizeLot(260873), '260873', 'lot ตัวเลขล้วน')
eq(normalizeLot('AB10012'), 'AB10012', 'lot ตัวอักษรนำ')
eq(normalizeLot(''), '-', 'ว่าง → ขีด')
eq(normalizeLot(null), '-', 'null → ขีด')
eq(normalizeLot('  L001  '), 'L001', 'trim')

section('normalizeCode')
eq(normalizeCode(1590035), '1590035', 'number → string')
eq(normalizeCode('1590035'), '1590035', 'string เดิม')
eq(normalizeCode('0159003'), '0159003', 'เลข 0 นำหน้าต้องไม่หาย')
eq(normalizeCode('1590035.0'), '1590035', 'ตัด .0 ที่ Excel ติดมา')
eq(normalizeCode(''), '-', 'ว่าง → ขีด')

section('toThaiDate')
eq(toThaiDate(47333, s2t), '03/08/2029', 'serial → DD/MM/YYYY (47333 = ค่าจริงแถว 760)')
eq(toThaiDate('03/08/2029', s2t), '03/08/2029', 'ข้อความอยู่แล้ว')
eq(toThaiDate('3/8/2029', s2t), '03/08/2029', 'เติมศูนย์นำหน้า')
eq(toThaiDate('03/08/2572', s2t), '03/08/2029', 'พ.ศ. → ค.ศ.')
eq(toThaiDate('-', s2t), '-', 'ขีด')
eq(toThaiDate('', s2t), '-', 'ว่าง')

section('mapMasterColumns — ⚠️ คอลัมน์ "คงเหลือ" มีหลายตัวชื่อคล้ายกัน')
const H = ['ผลการพิจารณา', 'ส่งบัญชี', 'สถานะตรวจรับ', 'MainLog', 'DetailedLog', 'รหัสHosxp',
  'ชนิด', 'รายการยา', 'หน่วย', 'ราคา/หน่วย', 'Lot Number', 'Exp', 'ชนิดรายการ',
  'คงเหลือ  ส.ค. 69 (จำนวน)', 'วันที่รับเข้า', 'ปริมาณ (เข้า)', 'บริษัท', 'เลขที่บิลซื้อ',
  'ปริมาณรับเข้า - คงเหลือ =คงเหลือจริง', 'ปริมาณ (ออก)', 'คงเหลือหลังจ่าย', 'x', 'y', 'Safety Stock',
  'มูลค่าคงเหลือ(บาท) ก.ย. 69']
const C = mapMasterColumns(H)
eq(C.location, 4, 'ที่เก็บ = DetailedLog')
eq(C.qty, 20, 'qty = "คงเหลือหลังจ่าย" ไม่ใช่ "คงเหลือ ส.ค." (index 13) หรือ "มูลค่าคงเหลือ" (24)')
eq(C.qtyReceived, 15, 'ปริมาณ (เข้า)')
eq(C.code, 5, 'รหัสHosxp')
eq(C.lot, 10, 'Lot Number')
eq(C.safetyStock, 23, 'Safety Stock')
eq(C.unit, 8, 'หน่วย (ไม่ใช่ หน่วยย่อย/หน่วยงาน)')

// ถ้าไม่มี "คงเหลือหลังจ่าย" ต้อง fallback ไป "คงเหลือจริง" ก่อน generic
const C2 = mapMasterColumns(['DetailedLog', 'รายการยา', 'มูลค่าคงเหลือ', 'คงเหลือจริง'])
eq(C2.qty, 3, 'fallback → คงเหลือจริง ไม่ใช่ มูลค่าคงเหลือ')
const C3 = mapMasterColumns(['DetailedLog', 'รายการยา', 'มูลค่าคงเหลือ', 'คงเหลือ พ.ค.'])
eq(C3.qty, 3, 'generic แต่ต้องข้าม "มูลค่าคงเหลือ"')

section('rowToInventoryItem')
const row = []
row[4] = 'E-1-1 ,E-1-2 ,E-1-3'; row[3] = 'E'; row[5] = 1590035; row[6] = 'Tablet'
row[7] = 'Manidipine  20mg'; row[8] = '100เม็ด'; row[10] = '260873'; row[11] = 47333
row[12] = 'ซื้อยา'; row[15] = 550; row[17] = 'ML26090225'; row[20] = 550; row[23] = 1743
row[2] = 'ตรวจรับแล้ว'; row[0] = 'คงไว้'
const r = rowToInventoryItem(row, C, s2t)
eq(r.location, 'E-1-1 ,E-1-2 ,E-1-3', 'ที่เก็บ')
eq(r.item.code, '1590035', 'รหัส')
eq(r.item.lot, '260873', 'lot')
eq(r.item.exp, '03/08/2029', 'exp จาก serial')
eq(r.item.qty, '550', 'qty จาก "คงเหลือหลังจ่าย"')
eq(r.item.safetyStock, 1743, 'safety stock')
eq(r.item.receiveStatus, 'ตรวจรับแล้ว|คงไว้', 'รวมสถานะ + ผลการพิจารณา ด้วย |')
eq(r.item.mainLog, 'E', 'MainLog')

const noLoc = [...row]; noLoc[4] = ''
eq(rowToInventoryItem(noLoc, C, s2t), null, 'ไม่มีที่เก็บ → ข้าม')
const noName = [...row]; noName[7] = ''; noName[5] = ''
eq(rowToInventoryItem(noName, C, s2t), null, 'ไม่มีทั้งชื่อและรหัส → ข้าม (แถวผลรวม)')

section('parseMasterGrid')
const out = parseMasterGrid([H, row, [], [...row]], s2t)
eq(out.rows, 2, 'ได้ 2 แถว')
eq(out.skipped, 1, 'ข้ามแถวว่าง')
eq(out.locations, 1, '1 ที่เก็บ (2 แถวอยู่ที่เดียวกัน)')
eq(out.inventory['E-1-1 ,E-1-2 ,E-1-3'].length, 2, 'รวมอยู่ใน array เดียวกัน')

let threw = null
try { parseMasterGrid([['a', 'b'], ['1', '2']], s2t) } catch (e) { threw = e.message }
eq(threw?.includes('ไม่พบคอลัมน์ที่เก็บ'), true, 'ไม่มี DetailedLog → throw')
try { parseMasterGrid([H], s2t) } catch (e) { threw = e.message }
eq(threw?.includes('ไม่มีข้อมูล'), true, 'มีแต่หัวตาราง → throw')

console.log(`\nผ่าน ${pass} / ${pass + fail}`)
if (fail > 0) throw new Error(`golden test ไม่ผ่าน ${fail} ข้อ`)
