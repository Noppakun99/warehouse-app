// reservationCheck.test.js — Golden tests สำหรับ src/lib/reservationCheck.js (ADR-0028)
// รัน: node src/lib/reservationCheck.test.js  (npm run test:reservecheck)
// กฎ: ต้องผ่าน 100% ก่อน commit
// ครอบ: ไม่ชน / ชน 1 รหัส / ยอดเท่ากันพอดี / รหัสไม่มีใน inventory / ยอดเบิกได้ของใบตัวเอง /
//       รหัสที่จำนวนเพิ่มในใบแก้ไข / จำลองทุกลำดับการทำงานของ 2 ใบพร้อมกัน → ต้องไม่จองเกินเลย

import { findOverReserved, availableForOwn, increasedCodes } from './reservationCheck.js'

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

section('findOverReserved')
{
  assertDeep(findOverReserved({ invBase: { A: 100 }, reserved: { A: 60 }, codes: ['A'] }), [], 'จอง 60 จาก 100 → ไม่ชน')
  assertDeep(findOverReserved({ invBase: { A: 100 }, reserved: { A: 100 }, codes: ['A'] }), [], 'จองเท่าคงเหลือพอดี → ไม่ชน')
  assertDeep(findOverReserved({ invBase: { A: 100, B: 50 }, reserved: { A: 120, B: 50 }, codes: ['A', 'B'] }),
    [{ code: 'A', inv: 100, reserved: 120, over: 20 }], 'ชน 1 รหัส (A เกิน 20) B พอดีไม่ชน')
  assertDeep(findOverReserved({ invBase: {}, reserved: { X: 5 }, codes: ['X'] }),
    [{ code: 'X', inv: 0, reserved: 5, over: 5 }], 'รหัสไม่มีใน inventory = คงเหลือ 0 → ชน')
  assertDeep(findOverReserved({ invBase: { A: 10 }, reserved: { A: 99 }, codes: [] }), [], 'ไม่ส่งรหัสมาตรวจ → ไม่ตรวจรหัสอื่น')
  assertDeep(findOverReserved({ invBase: { A: 10 }, reserved: { A: 11 }, codes: ['A', 'A'] }).length, 1, 'รหัสซ้ำในรายการตรวจ → รายงานครั้งเดียว')
  assertDeep(findOverReserved({ invBase: { A: 3000 }, reserved: { A: 3001 }, codes: ['A'] })[0].over, 1,
    'หน่วยย่อยสุด (1000เม็ด × 3 กล่อง = 3000) จองเกิน 1 เม็ด → ชน')
}

section('availableForOwn')
{
  assertEq(availableForOwn({ inv: 100, reserved: 130, own: 60 }), 30, 'คงเหลือ 100 ใบอื่นจอง 70 → ใบนี้เบิกได้ 30')
  assertEq(availableForOwn({ inv: 100, reserved: 200, own: 50 }), 0, 'ใบอื่นจองเกินคงเหลือแล้ว → 0 ไม่ติดลบ')
  assertEq(availableForOwn({ inv: 100, reserved: 60, own: 60 }), 100, 'ไม่มีใบอื่น → เบิกได้ทั้งหมด')
}

section('increasedCodes (ใบแก้ไข)')
{
  const before = [{ code: 'A', qty: 10 }, { code: 'B', qty: 5 }, { code: 'C', qty: 7 }]
  const after = [{ code: 'A', qty: 12 }, { code: 'B', qty: 3 }, { code: 'C', qty: 7 }]
  assertDeep(increasedCodes(before, after), ['A'], 'เฉพาะ A ที่เพิ่ม · B ลด · C เท่าเดิม')
  assertDeep(increasedCodes([{ code: 'A', qty: 5 }, { code: 'A', qty: 5 }], [{ code: 'A', qty: 4 }, { code: 'A', qty: 7 }]), ['A'],
    'รหัสซ้ำ 2 บรรทัด รวมต่อรหัส 10 → 11 = เพิ่ม')
  assertDeep(increasedCodes([{ code: ' a ', qty: 1 }], [{ code: 'A', qty: 2 }], (c) => c.trim().toUpperCase()), ['A'], 'ใช้ keyOf แปลงรหัสก่อนเทียบ')
}

// จำลองการทำงานพร้อมกัน: ใบ A และ B ต่างทำ 3 ขั้น pre(ตรวจก่อน) → ins(บันทึก) → post(ตรวจซ้ำ + ถอนถ้าชน)
// ไล่ทุกลำดับที่สลับกันได้ (20 แบบ) ทั้งกรณีของพอ/ไม่พอ → สถานะสุดท้ายต้องไม่มีวันจองเกินคงเหลือ
section('จำลอง 2 ใบพร้อมกัน — ทุกลำดับ')
{
  function interleavings(a, b) {
    if (!a.length) return [b]
    if (!b.length) return [a]
    return [
      ...interleavings(a.slice(1), b).map(r => [a[0], ...r]),
      ...interleavings(a, b.slice(1)).map(r => [b[0], ...r]),
    ]
  }
  function run(order, inv, qty, { verify = true } = {}) {
    const placed = {}            // ใบที่อยู่ใน DB: actor → qty
    const state = { A: 'start', B: 'start' }
    const total = () => Object.values(placed).reduce((s, q) => s + q, 0)
    for (const [actor, step] of order) {
      if (state[actor] === 'rejected') continue
      if (step === 'pre') {
        if (qty[actor] > inv - total()) state[actor] = 'rejected'
      } else if (step === 'ins') {
        placed[actor] = qty[actor]
      } else if (step === 'post' && verify) {
        const over = findOverReserved({ invBase: { X: inv }, reserved: { X: total() }, codes: ['X'] })
        if (over.length) { delete placed[actor]; state[actor] = 'withdrawn' }
      }
    }
    return { total: total(), placed }
  }
  const steps = (actor) => ['pre', 'ins', 'post'].map(s => [actor, s])
  const orders = interleavings(steps('A'), steps('B'))
  assertEq(orders.length, 20, 'ลำดับสลับกันได้ 20 แบบ')

  let overBooked = 0, bothPlacedWhenEnough = 0
  for (const o of orders) {
    if (run(o, 100, { A: 60, B: 60 }).total > 100) overBooked++
    if (Object.keys(run(o, 200, { A: 60, B: 60 }).placed).length === 2) bothPlacedWhenEnough++
  }
  assertEq(overBooked, 0, 'ของไม่พอ (100, ขอ 60+60) → ไม่มีลำดับไหนจองเกิน')
  assertEq(bothPlacedWhenEnough, 20, 'ของพอ (200) → ทั้งสองใบผ่านทุกลำดับ (ไม่ถอนเกินจำเป็น)')

  // mutation: ปิดขั้นตรวจซ้ำ → ต้องมีลำดับที่จองเกิน (ยืนยันว่าเทสจับช่องโหว่เดิมได้)
  const overNoVerify = orders.filter(o => run(o, 100, { A: 60, B: 60 }, { verify: false }).total > 100).length
  assertEq(overNoVerify > 0, true, 'ไม่มีตรวจซ้ำ → มีลำดับที่จองเกิน (ช่องโหว่เดิม)')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) { console.log(fails.join('\n')); process.exit(1) }
