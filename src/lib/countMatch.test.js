// countMatch.test.js — Golden tests สำหรับ src/lib/countMatch.js
// รัน: node src/lib/countMatch.test.js  (npm run test:countmatch)
// กฎ: ต้องผ่าน 100% ก่อน commit
// ครอบ: normSet/setEq (ลำดับ/ช่องว่าง/subset) + dimStatus (3 สถานะต่อมิติ) + computeCountMatch + diffLabel

/* eslint-disable no-undef */
import { normSet, setEq, dimStatus, computeCountMatch, diffLabel } from './countMatch.js'

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
console.log(`\nผ่าน ${pass} / ${pass + fail}`)
if (fail) { console.log(fails.join('\n')); process.exit(1) }
