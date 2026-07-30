// swapPolicy.test.js — Golden tests สำหรับ src/lib/swapPolicy.js
// รัน: node src/lib/swapPolicy.test.js
// กฎ: ต้องผ่าน 100% ก่อน commit
// ครอบ: parseReturnPolicy (เดือน/ปี/ไม่รับ/ต่างรายการ) + computeReturnStatus (ok/due/overdue/no_policy)
// fixture ข้อความ = ค่าจริงจาก receive_logs.drug_swap_policy

/* eslint-disable no-undef */
import { parseReturnPolicy, computeReturnStatus, parseReturnPolicyV2, computeReturnStatusV2, RETURN_ALERT_BUFFER_DAYS } from './swapPolicy.js'

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

// ════════════════════════════════════════════════════════════════════
// เฟส 2 (ADR-0014) — parseReturnPolicyV2 + computeReturnStatusV2
// fixture = 25 แบบจริงจากคอลัมน์ Auto-Match (col 28) ของ Excel แม่
// ════════════════════════════════════════════════════════════════════
const V = (t) => parseReturnPolicyV2(t)

section('Test 6: V2 shape — จัดหมวด 25 แบบจริง')
{
  // หมวด 1 — หลัง exp
  assertEq(V('เปลี่ยนคืนได้หลังจากหมดอายุไปแล้ว').shape, 'after_exp', 'หลัง exp ไม่จำกัด')
  assertEq(V('รับคืนกรณียาสิ้นอายุ (หมดอายุ) ไปแล้วภายใน 3 เดือน').shape, 'after_exp', 'หลัง exp 3 เดือน')
  assertEq(V('รับคืนกรณียาสิ้นอายุ (หมดอายุ) ไปแล้วภายใน 3 เดือน').afterExpMonths, 3, 'afterExpMonths=3')
  assertEq(V('รับเปลี่ยนเมื่อหมดอายุ ตามจำนวนจริง (รายการยาที่ระบุไว้ตามหนังสือ)').shape, 'after_exp', 'เมื่อหมดอายุ ตามจำนวนจริง')

  // หมวด 2 — ก่อน exp
  assertEq(V('รับเปลี่ยนยาก่อนหมดอายุ 6 เดือน').shape, 'before_exp', 'ก่อน exp 6 เดือน')
  assertEq(V('รับเปลี่ยนยาก่อนหมดอายุ 6 เดือน').beforeExpMonths, 6, 'beforeExpMonths=6')
  assertEq(V('แลกเปลี่ยนได้ก่อนหมดอายุ 3 เดือน').beforeExpMonths, 3, 'ก่อน exp 3 เดือน')
  assertEq(V('อายุยาจะต้องไม่ต่ำกว่า 6 เดือน').shape, 'before_exp', 'ไม่ต่ำกว่า 6 เดือน = ก่อน exp')
  assertEq(V('อายุไม่น้อยกว่า 6 เดือนก่อนวันหมดอายุ').beforeExpMonths, 6, 'ไม่น้อยกว่า 6 เดือนก่อนหมดอายุ')
  assertEq(V('1.แจ้งคืนยาก่อนหมดอายุ 60 วัน').beforeExpMonths, 2, '60 วัน → 2 เดือน')

  // หมวด 3 — tier % อายุเหลือ
  {
    const p = V('อายุ > 2 ปี → คืน 100%\nอายุ 6 เดือน - 2 ปี → คืน 50%\nอายุ < 6 เดือน → คืน 25%')
    assertEq(p.shape, 'age_tier', 'tier 3 ชั้น = age_tier')
    assertEq(p.tiers.length, 3, 'มี 3 tier')
    assertEq(p.tiers[0].percent, 100, 'tier บนสุด 100%')
    assertEq(p.tiers[0].ageMonthsMin, 24, 'tier 100% min = 24 เดือน (>2ปี)')
    assertEq(p.tiers[2].percent, 25, 'tier ล่าง 25%')
  }
  {
    const p = V('อายุ > 6 เดือน → คืน 100%\nอายุ < 6 เดือน → คืน 50%\nไม่เต็มขวด/กล่อง → ไม่รับเปลี่ยน')
    assertEq(p.shape, 'age_tier', '2 tier + เงื่อนไขเต็มขวด')
    assertEq(p.tiers.length, 2, 'จับ 2 tier (บรรทัดไม่รับไม่มี %)')
  }
  {
    const p = V('แจ้งก่อนหมดอายุ 1 ปี → เปลี่ยนเต็มจำนวน\nแจ้งก่อนหมดอายุ 6 เดือน → เปลี่ยนได้ 50%')
    assertEq(p.tiers.length, 2, 'tier แจ้งก่อน 2 ชั้น')
    assertEq(p.tiers[0].percent, 100, '"เต็มจำนวน" → 100%')
    assertEq(p.tiers.find(t => t.percent === 50) != null, true, 'มี tier 50%')
  }

  // หมวด 4 — threshold อายุตอนรับ (Diltiazem)
  {
    const p = V('ไม่รับแลกเปลี่ยนคืน ยกเว้น บ.ส่งยาอายุสั้นต่ำกว่า 1 ปี ยินดีรับแลกเปลี่ยน')
    assertEq(p.shape, 'receive_threshold', 'ยกเว้นอายุสั้น = receive_threshold')
    assertEq(p.receiveThresholdMonths, 12, 'threshold = 12 เดือน')
  }
  assertEq(V('ไม่รับแลกเปลี่ยนคืน ยกเว้นล็อตอายุสั้นกว่า 1 ปี พิจารณาเป็นล็อตๆ ไป').shape, 'receive_threshold', 'ล็อตอายุสั้น = receive_threshold')

  // หมวด 5 — binary
  assertEq(V('ไม่รับแลกเปลี่ยนคืน').shape, 'binary', 'ไม่รับคืน = binary')
  assertEq(V('ไม่รับแลกเปลี่ยนคืน').canReturn, false, 'binary canReturn=false')
  assertEq(V('ยาขายขาด ไม่รับเปลี่ยน ไม่รับคืน').shape, 'binary', 'ขายขาด = binary')
  assertEq(V('ไม่มีนโยบายแลกเปลี่ยนยา').shape, 'binary', 'ไม่มีนโยบาย = binary')

  // หมวด 6 — กำกวม
  assertEq(V('ไม่ระบุเงื่อนไขชัดเจน (เงื่อนไขแตกต่างกันแล้วแต่รายการ)').shape, 'ambiguous', 'ไม่ระบุชัดเจน = ambiguous')
  assertEq(V('ไม่ระบุเงื่อนไขชัดเจน (เงื่อนไขแตกต่างกันแล้วแต่รายการ)').needsReview, true, 'ambiguous needsReview=true')
  assertEq(V('').shape, 'ambiguous', 'ว่าง = ambiguous')
  assertEq(V('-').needsReview, true, '"-" needsReview=true')

  // หมวด 1 พิเศษ — "อายุยาไม่เกิน 6 เดือน" (รับแลกทุกกรณี) → หลัง/ระหว่าง ไม่ใช่ก่อน
  // "รับแลกยาเปลี่ยนคืนทุกกรณี (อายุยาไม่เกิน 6 เดือน)" — คืนได้ ไม่ควร binary/ambiguous
  assertEq(V('รับแลกยาเปลี่ยนคืนทุกกรณี (อายุยาไม่เกิน 6 เดือน)').canReturn !== false, true, 'รับทุกกรณี ≠ ไม่รับคืน')

  // BLOCKER 1 (scrutinize) — "คืนภายใน/หลัง N" = window ก่อน exp ไม่ใช่ age_tier (66 บิล)
  {
    const p = V('คืนภายใน 6 เดือน → 100%\nคืนหลัง 6 เดือน → 50%\nไม่รับเปลี่ยนครั้งที่ 2\nแจ้งเปลี่ยนวันที่หมดอายุ เต็มจำนวนเท่านั้น')
    assertEq(p.shape, 'before_exp', 'คืนภายใน N = before_exp (ไม่ใช่ age_tier)')
    assertEq(p.beforeExpMonths, 6, 'window = 6 เดือน (คืนภายใน 6)')
  }
  // "หมดอายุ" มีคำ "อายุ" ปน — ต้องไม่ false-trigger age_tier gate
  assertEq(V('รับเปลี่ยนเมื่อหมดอายุ ตามจำนวนจริง (รายการยาที่ระบุไว้ตามหนังสือ)').shape, 'after_exp', '"หมดอายุ" ไม่เข้า age_tier')
}

section('Test 7: V2 computeReturnStatusV2')
{
  const today = new Date(2026, 5, 11) // 11 มิ.ย. 2026

  // Diltiazem: threshold 12 เดือน, รับ 16/7/2025, exp 16/1/2027 → อายุตอนรับ ~18 เดือน ≥ 12 → ไม่รับคืน
  {
    const p = V('ไม่รับแลกเปลี่ยนคืน ยกเว้น บ.ส่งยาอายุสั้นต่ำกว่า 1 ปี ยินดีรับแลกเปลี่ยน')
    const r = computeReturnStatusV2({ policy: p, exp: new Date(2027, 0, 16), receiveDate: new Date(2025, 6, 16), today })
    assertEq(r.status, 'no_return', 'Diltiazem อายุตอนรับ ≥1ปี → no_return')
    assertEq(r.percent, 0, 'no_return percent=0')
  }
  // receive_threshold ผ่าน: รับตอนอายุเหลือ 8 เดือน < 12 → คืนได้
  {
    const p = V('ไม่รับแลกเปลี่ยนคืน ยกเว้น บ.ส่งยาอายุสั้นต่ำกว่า 1 ปี ยินดีรับแลกเปลี่ยน')
    const r = computeReturnStatusV2({ policy: p, exp: new Date(2027, 0, 16), receiveDate: new Date(2026, 5, 16), today })
    assertEq(r.status !== 'no_return', true, 'อายุตอนรับ 7 เดือน <1ปี → รับคืนได้')
    assertEq(r.percent, 100, 'ผ่านเงื่อนไข → 100%')
  }
  // after_exp 3 เดือน: exp 1/5/2026 → deadline 1/8/2026 → เหลือ ~51 วัน = due
  {
    const p = V('รับคืนกรณียาสิ้นอายุ (หมดอายุ) ไปแล้วภายใน 3 เดือน')
    const r = computeReturnStatusV2({ policy: p, exp: new Date(2026, 4, 1), today })
    assertEq(r.deadline.getMonth(), 7, 'after_exp deadline = ส.ค. (exp พ.ค. + 3)')
    assertEq(r.status, 'due', 'เหลือ ~51 วัน → due')
  }
  // binary → no_return
  {
    const r = computeReturnStatusV2({ policy: V('ไม่รับแลกเปลี่ยนคืน'), exp: new Date(2027, 0, 1), today })
    assertEq(r.status, 'no_return', 'binary → no_return')
  }
  // ambiguous → review
  {
    const r = computeReturnStatusV2({ policy: V('ไม่ระบุเงื่อนไขชัดเจน'), exp: new Date(2027, 0, 1), today })
    assertEq(r.status, 'review', 'ambiguous → review (ไม่เดา)')
    assertEq(r.needsReview, true, 'review needsReview=true')
  }
  // age_tier: exp 1/1/2028, today 11/6/2026 → อายุเหลือ ~18.7 เดือน → tier "6ด-2ปี" = 50%
  {
    const p = V('อายุ > 2 ปี → คืน 100%\nอายุ 6 เดือน - 2 ปี → คืน 50%\nอายุ < 6 เดือน → คืน 25%')
    const r = computeReturnStatusV2({ policy: p, exp: new Date(2028, 0, 1), today })
    assertEq(r.percent, 50, 'อายุเหลือ ~18.7 เดือน → 50%')
  }
  // age_tier: อายุเหลือ > 2 ปี → 100%
  {
    const p = V('อายุ > 2 ปี → คืน 100%\nอายุ 6 เดือน - 2 ปี → คืน 50%\nอายุ < 6 เดือน → คืน 25%')
    const r = computeReturnStatusV2({ policy: p, exp: new Date(2029, 0, 1), today })
    assertEq(r.percent, 100, 'อายุเหลือ ~30 เดือน → 100%')
  }
  // NIT 4 (scrutinize): age_tier ยาหมดอายุแล้ว → overdue ไม่รับคืน (ไม่ใช่ 25% + note แปลก)
  {
    const p = V('อายุ > 2 ปี → คืน 100%\nอายุ 6 เดือน - 2 ปี → คืน 50%\nอายุ < 6 เดือน → คืน 25%')
    const r = computeReturnStatusV2({ policy: p, exp: new Date(2026, 0, 1), today }) // หมดอายุแล้ว 5 เดือน
    assertEq(r.status, 'overdue', 'ยาหมดอายุ age_tier → overdue')
    assertEq(r.percent, null, 'หมดอายุ → percent null (ไม่ใช่ 25%)')
  }
  // MAJOR 3 (scrutinize): receive_threshold 1 ปีพอดี (365 วัน) — รับตอน exp−12เดือนพอดี = ขอบ
  {
    const p = V('ไม่รับแลกเปลี่ยนคืน ยกเว้น บ.ส่งยาอายุสั้นต่ำกว่า 1 ปี ยินดีรับแลกเปลี่ยน')
    // รับ 1 วันหลัง (exp−12เดือน) = อายุตอนรับ < 1 ปี → ควรผ่าน (รับคืนได้)
    const r = computeReturnStatusV2({ policy: p, exp: new Date(2027, 0, 1), receiveDate: new Date(2026, 0, 2), today })
    assertEq(r.status !== 'no_return', true, 'รับหลัง exp−12ด. 1 วัน (อายุ <1ปี) → รับคืนได้')
  }
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
