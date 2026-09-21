// Golden tests — src/lib/reorderSheet.js (อ่านชีท "วิเคราะห์สั่งซื้อ")
// รัน: npm run test:reordersheet
// เคสจากไฟล์จริง (สำรวจ 2026-09-21): 452 รายการ · หัวตารางแถวที่ 3 · emoji นำหน้าสถานะ

import {
  findHeaderRow, normalizeRisk, normalizeExclude, rowToReorderConfig, parseReorderRows, STATUS,
} from './reorderSheet.js'

let pass = 0, fail = 0
const eq = (got, want, label) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++ } else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`) }
}
const section = (t) => console.log(`\n=== ${t} ===`)

section('findHeaderRow — ไฟล์มีแถว title นำหน้า')
eq(findHeaderRow([['วิเคราะห์การสั่งซื้อยา'], ['โหมด Rolling'], ['รหัส', 'ชนิด']]), 2, 'หัวตารางอยู่แถวที่ 3 (index 2)')
eq(findHeaderRow([['รหัส', 'ชนิด']]), 0, 'หัวตารางแถวแรก')
eq(findHeaderRow([['code', 'name']]), 0, 'ภาษาอังกฤษก็ได้')
eq(findHeaderRow([['a'], ['b']]), -1, 'ไม่เจอ → -1')
eq(findHeaderRow([]), -1, 'ว่าง → -1')

section('normalizeRisk — VEN → risk_group')
eq(normalizeRisk('V'), 'Critical', 'V = Critical')
eq(normalizeRisk('E'), 'Essential', 'E = Essential')
eq(normalizeRisk('N'), 'Normal', 'N = Normal')
eq(normalizeRisk('v'), 'Critical', 'ตัวพิมพ์เล็ก')
eq(normalizeRisk('Essential'), 'Essential', 'ค่าเต็มก็รับ')
eq(normalizeRisk(''), null, 'ว่าง → null (ไม่ใช่ Normal — ADR-0002)')
eq(normalizeRisk('   '), null, 'ช่องว่าง → null')
eq(normalizeRisk('XYZ'), null, 'ค่าที่ไม่รู้จัก → null')
eq(normalizeRisk(null), null, 'null')

section('normalizeExclude — คอลัมน์มี emoji นำหน้า')
eq(normalizeExclude('✂️ ตัดออก'), STATUS.EXCLUDED, 'emoji + ตัดออก')
eq(normalizeExclude('📋 สั่งเมื่อขอ'), STATUS.ON_DEMAND, 'emoji + สั่งเมื่อขอ')
eq(normalizeExclude('ตัดออก'), STATUS.EXCLUDED, 'ไม่มี emoji')
eq(normalizeExclude('ตัดออกจากบัญชี'), STATUS.EXCLUDED, 'ข้อความยาวกว่า (includes ไม่ใช่ ===)')
eq(normalizeExclude(''), null, 'ว่าง → null')
eq(normalizeExclude('-'), null, 'ขีด → null')
eq(normalizeExclude('อย่างอื่น'), null, 'ข้อความอื่น → null')

section('rowToReorderConfig')
const r = rowToReorderConfig({
  'รหัส': '1501106', 'รายการยา': 'Losartan 50mg', 'บริษัทล่าสุด': 'องค์การเภสัชกรรม',
  'กลุ่ม VEN': 'E', 'ตัดออกจากบัญชี ,สั่งเมื่อขอ': '✂️ ตัดออก',
})
eq(r.code, '1501106', 'รหัส')
eq(r.name, 'Losartan 50mg', 'ชื่อยา')
eq(r.supplier, 'องค์การเภสัชกรรม', 'บริษัท')
eq(r.risk_group, 'Essential', 'VEN')
eq(r.exclude_status, STATUS.EXCLUDED, 'สถานะตัดออก')
eq(r.lead_time_days, 15, 'LT default 15')
eq(r.pack_size, 1, 'pack default 1')
eq(rowToReorderConfig({ 'รายการยา': 'ไม่มีรหัส' }), null, 'ไม่มีรหัส → null')
eq(rowToReorderConfig({ 'รหัส': '  ' }), null, 'รหัสว่าง → null')
eq(rowToReorderConfig({ 'code': 'X1' }).code, 'X1', 'คีย์ภาษาอังกฤษ')

section('parseReorderRows')
const out = parseReorderRows([
  { 'รหัส': 'A', 'กลุ่ม VEN': 'V' },
  { 'รหัส': 'B', 'กลุ่ม VEN': 'E', 'ตัดออกจากบัญชี ,สั่งเมื่อขอ': '✂️ ตัดออก' },
  { 'รหัส': 'C', 'กลุ่ม VEN': '' },
  { 'รายการยา': 'แถวผลรวม' },
])
eq(out.rows.length, 3, 'ได้ 3 แถว')
eq(out.skipped, 1, 'ข้าม 1 แถว (ไม่มีรหัส)')
eq(out.stats.byRisk.Critical, 1, 'นับ Critical')
eq(out.stats.noRisk, 1, 'นับที่ไม่ระบุ VEN')
eq(out.stats.excluded, 1, 'นับตัดออก')

let threw = null
try { parseReorderRows([{ 'ชื่อ': 'x' }]) } catch (e) { threw = e.message }
eq(threw?.includes('ไม่พบรายการ'), true, 'ไม่มีแถวที่มีรหัสเลย → throw')

console.log(`\nผ่าน ${pass} / ${pass + fail}`)
if (fail > 0) throw new Error(`golden test ไม่ผ่าน ${fail} ข้อ`)
