// workQueue.test.js — Golden tests สำหรับ src/lib/workQueue.js
// รัน: node src/lib/workQueue.test.js  (npm run test:workqueue)
// กฎ: ต้องผ่าน 100% ก่อน commit
// ครอบ: เกณฑ์แต่ละรายการในคิว / ซ่อนรายการ 0 / ลำดับความเร่ง / rows = ชุดที่นับ (Rule #6) /
//       คืนบริษัท: สถานะจัดการแล้ว + คาดว่าจะหมดเอง / admin-only / รอบเบิก-รับ + วันหยุด

import { buildWorkQueue, isSwapRed, describeNextCycle, thaiDayShort } from './workQueue.js'
import { resolveCycles } from '../../supabase/functions/_shared/announceSchedule.js'

let pass = 0, fail = 0
const fails = []

function assertEq(actual, expected, label) {
  const ok = actual === expected
  if (ok) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`)
}
function assertDeep(actual, expected, label) {
  assertEq(JSON.stringify(actual), JSON.stringify(expected), label)
}
function section(name) { console.log(`\n=== ${name} ===`) }
const keys = (items) => items.map(i => i.key)
const byKey = (items, k) => items.find(i => i.key === k)

// ────────────────────────────────────────────────────────────────────
section('คิวว่าง — ไม่มีรายการ 0')
{
  assertDeep(buildWorkQueue({}), [], 'ไม่มีข้อมูล = คิวว่าง')
  const q = buildWorkQueue({ expiring: [{ daysLeft: 200 }], lowStock: [{ qty: 5, safety_stock: 10 }], pendingReceive: [{ waitDays: 3 }] })
  assertDeep(q, [], 'ทุกอย่างไม่ถึงเกณฑ์ → ไม่แสดงสักรายการ')
}

section('เกณฑ์แต่ละรายการ + rows คือชุดที่นับ')
{
  const expiring = [
    { code: 'A', lot: '1', daysLeft: -3 },
    { code: 'B', lot: '2', daysLeft: 0 },
    { code: 'C', lot: '3', daysLeft: 90 },
    { code: 'D', lot: '4', daysLeft: 91 },
  ]
  const q = buildWorkQueue({ expiring })
  assertEq(byKey(q, 'expired').count, 1, 'หมดอายุค้างชั้น = daysLeft < 0')
  assertEq(byKey(q, 'expired').rows[0].code, 'A', 'rows ของ expired = แถวที่นับ')
  assertEq(byKey(q, 'nearExpiry').count, 2, 'ใกล้หมดอายุ = 0..90 วัน (รวมวันนี้ ไม่รวม 91)')
  assertDeep(byKey(q, 'nearExpiry').rows.map(r => r.code), ['B', 'C'], 'rows ใกล้หมด = B, C')

  const lowStock = [
    { code: 'X', qty: 0, safety_stock: 10 },
    { code: 'Y', qty: -2, safety_stock: 5 },
    { code: 'Z', qty: 3, safety_stock: 10 },
    { code: 'W', qty: 0, safety_stock: 0 },
  ]
  const q2 = buildWorkQueue({ lowStock })
  assertEq(byKey(q2, 'outOfStock').count, 2, 'หมดสต็อก = qty ≤ 0 และ SS > 0 (ไม่นับ qty>0 / SS=0)')

  const pendingReceive = [{ waitDays: 14 }, { waitDays: 15 }, { waitDays: null }, { waitDays: 40 }]
  assertEq(byKey(buildWorkQueue({ pendingReceive }), 'pendingReceive').count, 2, 'รอตรวจรับ > 14 วัน (14 ไม่นับ, ไม่รู้วันรับไม่นับ)')

  const loans = [
    { overdueDays: 91, return_date: null }, { overdueDays: 90, return_date: null },
    { overdueDays: 200, return_date: '2026-09-01' }, { overdueDays: null, return_date: null },
  ]
  assertEq(byKey(buildWorkQueue({ loans }), 'loanOverdue').count, 1, 'ยืมค้าง > 90 วัน และยังไม่คืน')
}

section('ยาต้องคืนบริษัท — สถานะจัดการแล้ว / คาดว่าจะหมดเอง / สีแดง')
{
  const swapDue = [
    { code: 'S1', lot: 'a', daysToDeadline: 45, actionStatus: 'pending', willDeplete: false },
    { code: 'S2', lot: 'b', daysToDeadline: 20, actionStatus: 'notified', willDeplete: false },
    { code: 'S3', lot: 'c', daysToDeadline: 10, actionStatus: 'sent', willDeplete: false },
    { code: 'S4', lot: 'd', daysToDeadline: 5, actionStatus: null, willDeplete: true },
    { code: 'S5', lot: 'e', daysToDeadline: -30, actionStatus: 'no_return', willDeplete: false },
  ]
  const it = byKey(buildWorkQueue({ swapDue }), 'swap')
  assertEq(it.count, 3, 'นับเฉพาะที่ยังค้าง (pending/notified/ไม่มีสถานะ) — sent/no_return ไม่นับ')
  assertEq(it.severity, 'red', 'มี lot ยังค้าง ไม่หมดเอง และ ≤30 วัน → แดง')
  assertEq(isSwapRed(swapDue[3]), false, 'คาดว่าจะหมดเอง ไม่นับเป็นแดง')
  assertEq(isSwapRed({ daysToDeadline: -5, actionStatus: 'pending' }), true, 'เลยเส้นตายแล้วยังค้าง = แดง')
  const amber = byKey(buildWorkQueue({ swapDue: [swapDue[0]] }), 'swap')
  assertEq(amber.severity, 'amber', 'มีแต่ lot > 30 วัน → ส้ม')
  assertEq(it.note, 'ใกล้เส้นตาย ≤30 วัน 1 lot', 'แดงที่ยังไม่เลยเส้นตาย')
  const mixed = byKey(buildWorkQueue({ swapDue: [
    { daysToDeadline: -648, actionStatus: 'pending' }, { daysToDeadline: -1, actionStatus: 'pending' },
    { daysToDeadline: 0, actionStatus: 'pending' }, { daysToDeadline: 45, actionStatus: 'pending' },
  ] }), 'swap')
  assertEq(mixed.note, 'เลยเส้นตายแล้ว 2 lot · ใกล้เส้นตาย ≤30 วัน 1 lot', 'แยกเลยเส้นตาย (<0) กับใกล้เส้นตาย (0–30) — วันนี้ = 0 ยังทัน')
  const onlyOverdue = byKey(buildWorkQueue({ swapDue: [{ daysToDeadline: -3, actionStatus: 'pending' }] }), 'swap')
  assertEq(onlyOverdue.note, 'เลยเส้นตายแล้ว 1 lot', 'มีแต่เลยเส้นตาย ไม่ต่อท้ายส่วนว่าง')
}

section('ลำดับความเร่ง + admin-only + รอบนับประจำปี')
{
  const all = {
    expiring: [{ daysLeft: -1 }, { daysLeft: 10 }],
    lowStock: [{ qty: 0, safety_stock: 3 }],
    pendingReceive: [{ waitDays: 30 }],
    swapDue: [{ daysToDeadline: 50, actionStatus: 'pending' }],
    loans: [{ overdueDays: 120, return_date: null }],
    annual: { session: { id: 28 }, items: [{ counted_qty: 1 }, { counted_qty: 0 }, { counted_qty: null }] },
    quota: [{ id: 1 }],
  }
  assertDeep(keys(buildWorkQueue({ ...all, role: 'admin' })),
    ['expired', 'swap', 'outOfStock', 'pendingReceive', 'nearExpiry', 'loanOverdue', 'annualCount', 'lineQuota'],
    'ลำดับ: หมดอายุ → คืนบริษัท → หมดสต็อก → รอตรวจรับ → ใกล้หมด → ยืมค้าง → นับประจำปี → โควตา LINE')
  assertEq(byKey(buildWorkQueue({ ...all, role: 'staff' }), 'lineQuota'), undefined, 'โควตา LINE เฉพาะ admin')
  const ac = byKey(buildWorkQueue(all), 'annualCount')
  assertEq(ac.count, 1, 'รอบนับ: count = บรรทัดที่ยังไม่นับ (counted_qty 0 ถือว่านับแล้ว)')
  assertDeep(ac.progress, { counted: 2, total: 3 }, 'progress นับแล้ว/ทั้งหมด')
  const done = buildWorkQueue({ annual: { session: { id: 1 }, items: [{ counted_qty: 5 }] } })
  assertEq(byKey(done, 'annualCount'), undefined, 'นับครบแล้วแต่รอบยังเปิด → ไม่ขึ้นคิว (count 0)')
}

section('รอบเบิก-รับถัดไป (announceSchedule ตัวเดียวกับบอท LINE)')
{
  assertEq(thaiDayShort('2026-10-12'), 'จ. 12 ต.ค.', 'thaiDayShort')
  const holidays = new Map([['2026-10-13', 'วันคล้ายวันสวรรคต ร.9'], ['2026-10-23', 'วันปิยมหาราช']])
  const sat = describeNextCycle('2026-10-10', resolveCycles('2026-10-10', holidays), holidays)
  assertEq(sat.requisition, 'จ. 12 ต.ค.', 'เสาร์ 10/10 → รอบถัดไปเบิกจันทร์ 12')
  assertEq(sat.pickup, 'พ. 14 ต.ค.', 'รับยาเลื่อนไปพุธ 14 เพราะ 13 หยุด')
  assertEq(sat.shiftNote, 'รับยาเลื่อนจาก อ. 13 ต.ค. (วันคล้ายวันสวรรคต ร.9)', 'บอกเหตุที่เลื่อน')
  const wed = describeNextCycle('2026-10-14', resolveCycles('2026-10-14', holidays), holidays)
  assertEq(wed.requisition, 'พ. 14 ต.ค.', 'วันเบิกคือวันนี้ ยังนับเป็นรอบถัดไป')
  assertEq(wed.shiftNote, '', 'รอบปกติไม่มีหมายเหตุ')
  const normal = describeNextCycle('2026-11-03', resolveCycles('2026-11-03', new Map()), new Map())
  assertEq(normal.requisition, 'พ. 4 พ.ย.', 'อังคาร → รอบถัดไปพุธ')
  assertEq(normal.pickup, 'พฤ. 5 พ.ย.', 'รับวันพฤหัส')
  assertEq(describeNextCycle('2026-10-10', [], new Map()), null, 'ไม่มีรอบ → null')
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
