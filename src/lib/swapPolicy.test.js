// swapPolicy.test.js — Golden tests สำหรับ src/lib/swapPolicy.js
// รัน: node src/lib/swapPolicy.test.js
// กฎ: ต้องผ่าน 100% ก่อน commit
// ครอบ: parseReturnPolicy (เดือน/ปี/ไม่รับ/ต่างรายการ) + computeReturnStatus (ok/due/overdue/no_policy)
// fixture ข้อความ = ค่าจริงจาก receive_logs.drug_swap_policy

/* eslint-disable no-undef */
import { parseReturnPolicy, computeReturnStatus, RETURN_ALERT_BUFFER_DAYS } from './swapPolicy.js'

let pass = 0, fail = 0
const fails = []

function assertEq(actual, expected, label) {
  const ok = actual === expected
  if (ok) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`)
}
function section(name) { console.log(`\n=== ${name} ===`) }

const P = (t) => parseReturnPolicy(t)

// ────────────────────────────────────────────────────────────────────
// Test 1 — parseReturnPolicy: ดึงเดือนจากข้อความจริง
// ────────────────────────────────────────────────────────────────────
section('Test 1: parseReturnPolicy — ดึงเดือน')
{
  assertEq(P('เงื่อนไขเดียวกันทุกรายการ | แลกเปลี่ยนภายใน6เดือน').months, 6, '6เดือน (ไม่เว้นวรรค)')
  assertEq(P('อายุยาจะต้องไม่ต่ำกว่า 6 เดือน').months, 6, '6 เดือน (เว้นวรรค)')
  assertEq(P('รับเปลี่ยนยาก่อนหมดอายุ 6 เดือน').months, 6, 'ก่อนหมดอายุ 6 เดือน')
  assertEq(P('อายุไม่น้อยกว่า 6 เดือนก่อนวันหมดอายุ').months, 6, 'ไม่น้อยกว่า 6 เดือนก่อนหมดอายุ')
  assertEq(P('รับแลกยาเปลี่ยนคืนทุกกรณี(อายุยาไม่เกิน6เดือน)').months, 6, 'อายุยาไม่เกิน6เดือน')
  assertEq(P('โดยขอรับคืน ในกรณีที่ยานั้นสิ้นอายุไปแล้วภายใน 3 เดือน').months, 3, '3 เดือน')
  assertEq(P('แจ้งก่อน1ปี ได้เต็มจำนวน แจ้งก่อน6เดือน ได้ 50%ค่ะ').months, 6, 'ปี+เดือนปน → เลือกน้อยสุด (6)')
  assertEq(P('แจ้งก่อน 1 ปี ได้เต็มจำนวน').months, 12, '1 ปี → 12 เดือน')
  assertEq(P('1.ต้องแจ้งคืนยาก่อนหมดอายุ60วัน 2.ถ้าจะมีการแลกเปลี่ยน...').months, 2, '60วัน → 2 เดือน (ceil 60/30)')
  assertEq(P('ต้องแจ้งก่อน 45 วัน').months, 2, '45 วัน → 2 เดือน (ceil)')
  // วันที่ในข้อความต้องไม่ถูกจับเป็นระยะเวลา (bug: "17/11/2568" เคยกลายเป็นเดือน)
  assertEq(P('หนังสือจากภิญโญ รับเปลี่ยนตามจำนวนจริง วันที่ 17/11/2568 | ตามเอกสาร ด้านหลัง').months, null, 'มีแต่วันที่ → ไม่มีเดือน (null)')
  assertEq(P('แลกคืนภายใน 6 เดือน (ยืนยัน 01/12/2568)').months, 6, 'มีทั้งเดือนจริง + วันที่ → ได้ 6 (ไม่ใช่ 1/12)')
  assertEq(P('รับคืนก่อนหมดอายุ 3 เดือน ตั้งแต่ 1/1/2025').months, 3, 'วันที่ ค.ศ. 4 หลัก ไม่รบกวน → 3')
}

// ────────────────────────────────────────────────────────────────────
// Test 2 — parseReturnPolicy: canReturn = true เมื่อมีเดือน
// ────────────────────────────────────────────────────────────────────
section('Test 2: parseReturnPolicy — canReturn')
{
  assertEq(P('แลกเปลี่ยนภายใน6เดือน').canReturn, true, 'มีเดือน → คืนได้')
  // มีเดือน แม้มีคำ "ไม่รับ" ในเงื่อนไขยกเว้น → conservative: คืนได้ (เตือนเกินดีกว่าพลาด)
  assertEq(P('บ.ไม่รับแลกเปลี่ยนยาคืนยา ยกเว้นในกรณีที่ บ.ส่งยาอายุสั้นต่ำกว่า 1 ปี บ.ยินดีรับแลกเปลี่ยนยา').canReturn, true,
    'มี "1 ปี" ในข้อยกเว้น → ยัง canReturn=true')
  assertEq(P('เงื่อนไขเดียวกันทุกรายการ | ทางบริษัทไม่มีนโยบายแลกเปลี่ยนยา').canReturn, false, 'ไม่มีนโยบาย → คืนไม่ได้')
  assertEq(P('ไม่รับเปลี่ยนคืน ตามบิล').canReturn, false, 'ไม่รับเปลี่ยนคืน → false')
  assertEq(P('ตามเอกสาร ด้านหลัง').canReturn, null, 'ไม่มีตัวเลข/ไม่มีคำปฏิเสธ → null')
  assertEq(P('').canReturn, null, 'ว่าง → null')
  assertEq(P('-').canReturn, null, '"-" → null')
}

// ────────────────────────────────────────────────────────────────────
// Test 3 — parseReturnPolicy: differsByItem flag
// ────────────────────────────────────────────────────────────────────
section('Test 3: parseReturnPolicy — differsByItem')
{
  assertEq(P('เงื่อนไขแตกต่างกัน แล้วแต่รายการ | ตามเอกสาร ด้านหลัง').differsByItem, true, 'flag ต่างรายการ = true')
  assertEq(P('เงื่อนไขเดียวกันทุกรายการ | แลกเปลี่ยนภายใน6เดือน').differsByItem, false, 'เงื่อนไขเดียวกัน = false')
  // ต่างรายการ + มีเดือนในข้อความ → ยังดึงเดือนได้ แต่ UI จะใช้ differsByItem ตัดสินว่าเชื่อได้ไหม
  const d = P('เงื่อนไขแตกต่างกัน แล้วแต่รายการ | ORS สินค้าคืนหรือเปลี่ยนก่อนวันหมดอายุอายุมากกว่า 6 เดือน')
  assertEq(d.differsByItem, true, 'ต่างรายการ + มีเดือน → differsByItem ยัง true')
  assertEq(d.months, 6, 'ต่างรายการ + มีเดือน → ยังดึงเดือนได้')
}

// ────────────────────────────────────────────────────────────────────
// Test 4 — computeReturnStatus: ok / due / overdue / no_policy
// ────────────────────────────────────────────────────────────────────
section('Test 4: computeReturnStatus')
{
  const today = new Date(2026, 5, 11) // 11 มิ.ย. 2026
  // exp 1 ม.ค. 2027, คืนก่อน 6 เดือน → deadline 1 ก.ค. 2026 → เหลือ 20 วัน (< buffer 60) = due
  {
    const r = computeReturnStatus({ exp: new Date(2027, 0, 1), months: 6, today })
    assertEq(r.status, 'due', 'เหลือ 20 วัน → due (เด้ง popup)')
    assertEq(r.daysToDeadline, 20, 'daysToDeadline = 20')
  }
  // exp 1 ม.ค. 2028, คืนก่อน 6 เดือน → deadline 1 ก.ค. 2027 → เหลือ ~385 วัน = ok
  {
    const r = computeReturnStatus({ exp: new Date(2028, 0, 1), months: 6, today })
    assertEq(r.status, 'ok', 'เหลือเป็นปี → ok (ยังไม่เตือน)')
  }
  // exp 1 ก.ค. 2026, คืนก่อน 6 เดือน → deadline 1 ม.ค. 2026 → พ้นมาแล้ว = overdue
  {
    const r = computeReturnStatus({ exp: new Date(2026, 6, 1), months: 6, today })
    assertEq(r.status, 'overdue', 'พ้น deadline → overdue')
    assertEq(r.daysToDeadline <= 0, true, 'daysToDeadline ≤ 0')
  }
  // months = null → no_policy
  {
    const r = computeReturnStatus({ exp: new Date(2027, 0, 1), months: null, today })
    assertEq(r.status, 'no_policy', 'ไม่มีเดือน → no_policy (ไม่เด้ง)')
    assertEq(r.deadline, null, 'deadline = null')
  }
  // ขอบ buffer พอดี: เหลือ 60 วันพอดี → ยัง due (<=)
  {
    const r = computeReturnStatus({ exp: new Date(2027, 1, 10), months: 6, today }) // deadline 10 ส.ค. 2026 = +60 วัน
    assertEq(r.daysToDeadline, 60, 'deadline = วันนี้ + 60 พอดี')
    assertEq(r.status, 'due', 'เหลือ = buffer พอดี → due (ขอบ inclusive)')
  }
  // clamp วันสิ้นเดือน (แก้บั๊ก spillover 2026-07-18): 31/7 − 3 เดือน = 30/4 ไม่ใช่ 1/5
  {
    const r = computeReturnStatus({ exp: new Date(2026, 6, 31), months: 3, today: new Date(2026, 6, 18) })
    assertEq(r.deadline.getDate(), 30, 'exp 31/7 − 3 ด. → วันที่ 30 (clamp สิ้นเดือน)')
    assertEq(r.deadline.getMonth(), 3, 'exp 31/7 − 3 ด. → เม.ย. (ไม่ spillover เป็น พ.ค.)')
  }
  // วันที่มีจริงในเดือนเป้าหมาย → ไม่ clamp
  {
    const r = computeReturnStatus({ exp: new Date(2026, 7, 31), months: 3, today: new Date(2026, 6, 18) })
    assertEq(r.deadline.getDate(), 31, 'exp 31/8 − 3 ด. → 31/5 (มีจริง ไม่ clamp)')
    assertEq(r.deadline.getMonth(), 4, 'exp 31/8 − 3 ด. → พ.ค.')
  }
  // ก.พ. ปีไม่ leap: 29/3/2026 − 1 เดือน = 28/2
  {
    const r = computeReturnStatus({ exp: new Date(2026, 2, 29), months: 1, today: new Date(2026, 0, 1) })
    assertEq(r.deadline.getDate(), 28, 'exp 29/3/2026 − 1 ด. → 28/2 (ก.พ. ไม่ leap)')
  }
}

// ────────────────────────────────────────────────────────────────────
// Test 5 — buffer const sanity
// ────────────────────────────────────────────────────────────────────
section('Test 5: buffer const')
{
  assertEq(RETURN_ALERT_BUFFER_DAYS, 60, 'buffer default = 60 วัน')
}

// ── สรุป ──
console.log(`\n${'─'.repeat(50)}`)
if (fail === 0) {
  console.log(`✓ ผ่านทั้งหมด ${pass} assertions`)
  process.exit(0)
} else {
  console.log(`✗ ผ่าน ${pass} / ล้มเหลว ${fail}`)
  console.log(fails.join('\n'))
  process.exit(1)
}
