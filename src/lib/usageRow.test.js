// usageRow.test.js — Golden tests สำหรับ supabase/functions/_shared/usageRow.js (test อยู่ src/lib/ แบบ announceSchedule)
// รัน: node src/lib/usageRow.test.js  (npm run test:usagerow)
// กฎ: ต้องผ่าน 100% ก่อน commit
// ครอบ: 4 แบบที่ชีทวิเคราะห์สั่งซื้อตัด / แถวที่ต้องนับ / ช่องว่าง-ช่องว่างหัวท้าย / localYmd ข้ามเที่ยงคืน

import { isUsageRow, localYmd } from '../../supabase/functions/_shared/usageRow.js'

let pass = 0, fail = 0
const fails = []

function assertEq(actual, expected, label) {
  const ok = actual === expected
  if (ok) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`)
}
function section(name) { console.log(`\n=== ${name} ===`) }

// ────────────────────────────────────────────────────────────────────
section('ตัด 4 แบบเหมือนสูตร E4 ของชีทวิเคราะห์สั่งซื้อ')
{
  assertEq(isUsageRow({ item_type: 'บันทึกเท่านั้น', department: 'ห้องยาG' }), false, 'ชนิดรายการ บันทึกเท่านั้น')
  assertEq(isUsageRow({ item_type: 'ยาโครงการ', department: 'ห้องยาG' }), false, 'ชนิดรายการ ยาโครงการ')
  assertEq(isUsageRow({ item_type: 'ซื้อยา', department: 'คืนยา' }), false, 'หน่วยงาน คืนยา')
  assertEq(isUsageRow({ item_type: 'ยกยอด', department: 'เบิกเพื่อแลกเปลี่ยนคืนยา' }), false, 'หน่วยงาน เบิกเพื่อแลกเปลี่ยนคืนยา')
}

section('แถวที่ต้องนับเป็นการใช้')
{
  assertEq(isUsageRow({ item_type: 'ซื้อยา', department: 'ห้องยาG' }), true, 'ซื้อยา → หน่วยงานจริง')
  assertEq(isUsageRow({ item_type: 'ยกยอด(2)', department: 'IPD' }), true, 'ยกยอด(2)')
  assertEq(isUsageRow({ item_type: 'แก้ไขระบบ', department: 'ER' }), true, 'แก้ไขระบบ นับ (Excel ไม่ตัด)')
  assertEq(isUsageRow({ item_type: 'ซื้อยา', department: 'เบิกเพิ่มจากความผิดพลาด' }), true, 'เบิกเพิ่มจากความผิดพลาด นับ (ของออกจริง)')
  assertEq(isUsageRow({ item_type: 'คืนยา', department: 'ห้องยา1' }), true, 'ชนิดรายการ คืนยา ไม่ใช่หน่วยงาน คืนยา → นับ')
  assertEq(isUsageRow({ item_type: 'ยาโครงการ(2)', department: 'ห้องยาG' }), true, 'ชื่อคล้ายแต่ไม่ตรงเป๊ะ → นับ (Excel เทียบ <> ตรงตัว)')
}

section('ค่าว่าง / ช่องว่างหัวท้าย')
{
  assertEq(isUsageRow({}), true, 'ไม่มีทั้ง 2 ช่อง → นับ')
  assertEq(isUsageRow({ item_type: null, department: null }), true, 'null → นับ')
  assertEq(isUsageRow(null), true, 'row null → นับ (ไม่ throw)')
  assertEq(isUsageRow({ item_type: ' บันทึกเท่านั้น ', department: 'IPD' }), false, 'trim ชนิดรายการก่อนเทียบ')
  assertEq(isUsageRow({ item_type: 'ซื้อยา', department: 'คืนยา ' }), false, 'trim หน่วยงานก่อนเทียบ')
}

section('localYmd — วันที่ตามเวลาเครื่อง ไม่เลื่อนข้าม UTC')
{
  assertEq(localYmd(new Date(2026, 8, 30)), '2026-09-30', 'เที่ยงคืนวันสิ้นเดือน (toISOString บน UTC+7 จะได้ 29)')
  assertEq(localYmd(new Date(2026, 3, 1)), '2026-04-01', 'วันที่ 1 ต้นหน้าต่าง (toISOString บน UTC+7 จะได้ 31/03)')
  assertEq(localYmd(new Date(2026, 9, 10, 3, 15)), '2026-10-10', 'ตี 3')
  assertEq(localYmd(new Date(2026, 9, 10, 23, 59)), '2026-10-10', '23:59')
  assertEq(localYmd(new Date(2026, 9, 0)), '2026-09-30', 'new Date(y, m, 0) = วันสุดท้ายเดือนก่อน')
  assertEq(localYmd(new Date(2028, 1, 29)), '2028-02-29', 'ปีอธิกสุรทิน')
}

// ────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
if (fail === 0) {
  console.log(`✓ ผ่านทั้งหมด ${pass} assertions`)
} else {
  console.log(`✗ FAIL ${fail} / ${pass + fail} assertions:\n`)
  console.log(fails.join('\n\n'))
  process.exit(1)
}
