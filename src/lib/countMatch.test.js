// countMatch.test.js — Golden tests สำหรับ src/lib/countMatch.js
// รัน: node src/lib/countMatch.test.js  (npm run test:countmatch)
// กฎ: ต้องผ่าน 100% ก่อน commit
// ครอบ: normSet/setEq (ลำดับ/ช่องว่าง/subset) + dimStatus (3 สถานะต่อมิติ) + computeCountMatch + diffLabel

/* eslint-disable no-undef */
import { normSet, setEq, dimStatus, computeCountMatch, diffLabel, missingDims } from './countMatch.js'

let pass = 0, fail = 0
const fails = []

function assertEq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`)
}
function section(name) { console.log(`\n=== ${name} ===`) }

// ────────────────────────────────────────────────────────────────────
// Test 1 — normSet / setEq: ลำดับ + ช่องว่างไม่มีผล, subset = ไม่เท่า
// ────────────────────────────────────────────────────────────────────
section('Test 1: normSet / setEq')
{
  // เคสจริง 16/07/2569: Naproxen F690301 กรอกสลับลำดับ → ต้องตรง
  assertEq(setEq('C-3-5 , C-3-1', 'C-3-1 ,C-3-5'), true, 'สลับลำดับ + ช่องว่างต่าง → ตรง')
  assertEq(setEq('E-8-4 ,E-8-5', 'E-8-4, E-8-5'), true, 'รูปแบบ comma ต่าง → ตรง')
  assertEq(setEq('E-1-4', 'E-1-4'), true, 'ค่าเดี่ยวเท่ากัน → ตรง')
  assertEq(setEq('E-1-4', 'E-1-4 ,E-1-5'), false, 'เจอแค่บางชั้น (subset) → ไม่ตรง')
  assertEq(setEq('E-1-5', 'E-1-4'), false, 'คนละชั้น → ไม่ตรง')
  assertEq(normSet(' - '), '', '"-" = ไม่มีค่า')
  assertEq(normSet(null), '', 'null = ไม่มีค่า')
  assertEq(setEq('2027-01-01 , 2027-06-01', '2027-06-01 ,2027-01-01'), true, 'exp หลายค่า สลับลำดับ → ตรง')
}

// ────────────────────────────────────────────────────────────────────
// Test 2 — dimStatus: ช่องว่าง = unchecked ไม่ใช่ ok
// ────────────────────────────────────────────────────────────────────
section('Test 2: dimStatus — 3 สถานะต่อมิติ')
{
  const sys = { system_qty: 20, system_exp: '25/12/2028', system_location: 'C-3-1 ,C-3-5' }

  const d1 = dimStatus({ ...sys, counted_qty: '20', counted_exp: '', counted_location: '' })
  assertEq(d1.qty, 'ok', 'จำนวนตรง → ok')
  assertEq(d1.exp, 'unchecked', 'exp ว่าง → unchecked (ไม่ใช่ ok)')
  assertEq(d1.loc, 'unchecked', 'ที่เก็บว่าง → unchecked')
  assertEq(d1.checked, 1, 'ตรวจ 1/3 มิติ')
  assertEq(d1.anyDiff, false, 'ไม่มีมิติ diff')

  const d2 = dimStatus({ ...sys, counted_qty: '', counted_exp: '', counted_location: '' })
  assertEq(d2.qty, 'unchecked', 'จำนวนว่าง → unchecked')
  assertEq(d2.checked, 0, 'ไม่ได้ตรวจสักมิติ')

  const d3 = dimStatus({ ...sys, counted_qty: '18', counted_exp: '25/12/2028', counted_location: 'C-3-5 , C-3-1' })
  assertEq(d3.qty, 'diff', 'นับได้ 18 ≠ 20 → diff')
  assertEq(d3.exp, 'ok', 'exp ตรง → ok')
  assertEq(d3.loc, 'ok', 'ที่เก็บสลับลำดับ → ok (set equality)')
  assertEq(d3.checked, 3, 'ตรวจครบ 3 มิติ')
  assertEq(d3.anyDiff, true, 'มีมิติ diff')

  const d4 = dimStatus({ ...sys, counted_qty: '20', counted_exp: '', counted_location: 'C-3-1' })
  assertEq(d4.loc, 'diff', 'เจอแค่ชั้นเดียวจาก 2 ชั้น → diff (สัญญาณจริง)')

  // system_exp = '-' (ไม่มีข้อมูล) + กรอกค่าจริง → diff
  const d5 = dimStatus({ system_qty: 5, system_exp: '-', system_location: '-', counted_qty: '5', counted_exp: '3/12/2028', counted_location: '' })
  assertEq(d5.exp, 'diff', 'ระบบไม่มี exp แต่กรอกจริง → diff')

  // ── มิติ lot (เพิ่ม 2026-09-20): lot บนกล่องจริง vs lot ที่ระบบบันทึก ──
  const sysLot = { ...sys, lot: '26E266' }

  const l1 = dimStatus({ ...sysLot, counted_qty: '20', counted_lot: '' })
  assertEq(l1.lot, 'unchecked', 'lot ว่าง → unchecked (ไม่ใช่ ok)')
  assertEq(l1.anyDiff, false, 'lot ไม่ได้ตรวจ ไม่ทำให้ anyDiff')

  const l2 = dimStatus({ ...sysLot, counted_qty: '20', counted_lot: '26E266' })
  assertEq(l2.lot, 'ok', 'lot ตรง → ok')
  assertEq(l2.checked, 2, 'นับ lot เป็นมิติที่ตรวจด้วย')

  const l3 = dimStatus({ ...sysLot, counted_qty: '20', counted_lot: '26D172' })
  assertEq(l3.lot, 'diff', 'lot บนกล่องคนละตัว → diff')
  assertEq(l3.anyDiff, true, 'lot ไม่ตรง → anyDiff')

  const l4 = dimStatus({ ...sysLot, counted_qty: '20', counted_lot: ' 26e266 ' })
  assertEq(l4.lot, 'ok', 'lot ต่างแค่ช่องว่าง/ตัวพิมพ์ → ok')

  // lot เป็นรหัส ไม่ใช่ค่าหลายส่วนคั่น comma — ห้ามใช้ set equality เหมือนที่เก็บ/exp
  const l5 = dimStatus({ ...sys, lot: 'A,B', counted_qty: '20', counted_lot: 'B,A' })
  assertEq(l5.lot, 'diff', 'lot สลับลำดับรอบ comma = คนละ lot (ไม่ใช่ set)')
}

// ────────────────────────────────────────────────────────────────────
// Test 3 — computeCountMatch: นิยาม match เดิม (มิติไม่ตรวจไม่ทำให้ fail)
// ────────────────────────────────────────────────────────────────────
section('Test 3: computeCountMatch')
{
  const sys = { system_qty: '10', system_exp: '29/11/2028', system_location: 'E-11' }

  const m1 = computeCountMatch({ ...sys, counted_qty: '10', counted_exp: '', counted_location: '' })
  assertEq(m1, { counted_qty: 10, diff_qty: 0, match: true }, 'จำนวนตรง มิติอื่นไม่ตรวจ → match')

  const m2 = computeCountMatch({ ...sys, counted_qty: '', counted_exp: '', counted_location: '' })
  assertEq(m2, { counted_qty: null, diff_qty: 0, match: false }, 'ไม่กรอกจำนวน → ไม่ match')

  const m3 = computeCountMatch({ ...sys, counted_qty: '8', counted_exp: '29/11/2028', counted_location: 'E-11' })
  assertEq(m3, { counted_qty: 8, diff_qty: 2, match: false }, 'ขาด 2 → diff_qty=2 (ระบบ−นับได้), ไม่ match')

  const m4 = computeCountMatch({ ...sys, counted_qty: '10', counted_exp: '29/11/2028', counted_location: 'E-12' })
  assertEq(m4.match, false, 'จำนวนตรงแต่ที่เก็บผิด → ไม่ match')

  // qty เก็บเป็น TEXT ใน DB — parseFloat ก่อนเทียบ
  const m5 = computeCountMatch({ system_qty: '2.5', system_exp: '-', system_location: '-', counted_qty: '2.5', counted_exp: '', counted_location: '' })
  assertEq(m5.match, true, 'ทศนิยมตรง → match')
}

// ────────────────────────────────────────────────────────────────────
// Test 4 — diffLabel: ขาด/เกิน อ่านแล้วไม่ตีความกลับด้าน
// ────────────────────────────────────────────────────────────────────
section('Test 4: diffLabel')
{
  assertEq(diffLabel(10, 8), 'ขาด 2', 'นับได้น้อยกว่าระบบ → ขาด')
  assertEq(diffLabel(10, 12), 'เกิน 2', 'นับได้มากกว่าระบบ → เกิน')
  assertEq(diffLabel(10, 10), 'ตรง', 'เท่ากัน → ตรง')
  assertEq(diffLabel(10, null), '-', 'ยังไม่นับ → -')
  assertEq(diffLabel(10, ''), '-', 'ช่องว่าง → -')
  assertEq(diffLabel('2.5', '2'), 'ขาด 0.5', 'ทศนิยม → ขาด 0.5')
}

// ────────────────────────────────────────────────────────────────────
// Test 5 — missingDims: ต้องตรวจครบก่อนบันทึก แต่ไม่บังคับมิติที่ระบบไม่มีข้อมูล
// ────────────────────────────────────────────────────────────────────
section('Test 5: missingDims')
{
  const sys = { system_qty: '10', system_exp: '29/11/2028', system_location: 'E-1-4', lot: 'A123' }
  const full = { ...sys, counted_qty: '10', counted_exp: '29/11/2028', counted_location: 'E-1-4', counted_lot: 'A123' }
  assertEq(missingDims(full), [], 'ครบ 4 มิติ → ไม่ขาด')
  assertEq(missingDims({ ...full, counted_lot: '' }), ['lot'], 'ไม่ได้กรอก lot → ขาด lot')
  assertEq(missingDims({ ...sys, counted_qty: '' }), ['จำนวน', 'ที่เก็บ', 'exp', 'lot'], 'ยังไม่กรอกอะไร → ขาดครบ')
  // ไม่ตรง ≠ ขาด — กรอกแล้วแต่ต่างจากระบบ ถือว่าตรวจแล้ว (บันทึกได้ ไปตามส่วนต่างต่อ)
  assertEq(missingDims({ ...full, counted_qty: '8', counted_lot: 'B999' }), [], 'กรอกครบแต่ไม่ตรง → ไม่ขาด')
  // เวชภัณฑ์ lot '-' + ไม่มี exp: ปุ่มตรงตามระบบเติม '' ให้ → ต้องผ่าน ไม่งั้นบันทึกไม่ได้ตลอดกาล
  const supply = { system_qty: '5', system_exp: '-', system_location: 'C-2-1', lot: '-' }
  assertEq(missingDims({ ...supply, counted_qty: '5', counted_exp: '', counted_location: 'C-2-1', counted_lot: '' }), [], 'ระบบไม่มี exp/lot → ไม่บังคับ')
  assertEq(missingDims({ ...supply, counted_qty: '5', counted_location: '' }), ['ที่เก็บ'], 'ระบบมีที่เก็บ → ยังบังคับ')
  assertEq(missingDims({ system_qty: '1', system_exp: '', system_location: '', lot: '', counted_qty: '1' }), [], 'ของไม่มีในระบบ (ค่าว่างหมด) → บังคับแค่จำนวน')
  assertEq(missingDims({ ...sys, counted_qty: 0, counted_exp: '29/11/2028', counted_location: 'E-1-4', counted_lot: 'A123' }), [], 'นับได้ 0 = ตรวจแล้ว ไม่ใช่ขาด')
}

// ────────────────────────────────────────────────────────────────────
console.log(`\nผ่าน ${pass} / ${pass + fail}`)
if (fail) { console.log(fails.join('\n')); process.exit(1) }
