// locationMove.test.js — Golden tests สำหรับ src/lib/locationMove.js
// รัน: node src/lib/locationMove.test.js  (npm run test:locationmove)
// ครอบ: splitLoc/joinLoc · MainLog (ชั้น/โซนพิเศษ) · groupPiles (Manidipine แยกกอง) · overlay · planMove (ต่อใบ/ย้ายกลับ) · reconcile

import { splitLoc, joinLoc, buildMainLogMap, deriveMainLog, groupPiles, overlayMoves, planMove, reconcileMoves } from './locationMove.js'

let pass = 0, fail = 0
const fails = []
function assertEq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`)
}
function section(name) { console.log(`\n=== ${name} ===`) }

const inv = [
  { code: '1450009', name: 'Hydralazine 20mg', lot: 'P04077', location: 'C-2-3', main_log: 'C', qty: '4' },
  { code: '1450009', name: 'Hydralazine 20mg', lot: 'P04092', location: 'C-2-3', main_log: 'C', qty: '4' },
  { code: '1590035', name: 'Manidipine  20mg', lot: '260873', location: 'E-1-1 ,E-1-2 ,E-1-3', main_log: 'E', qty: '240' },
  { code: '1590035', name: 'Manidipine  20mg', lot: '260873', location: 'ห้องประชุมเล็กชั้น4', main_log: 'ห้องประชุมเล็กชั้น4', qty: '300' },
  { code: 'S010', name: 'ขวด', lot: '-', location: 'คลังถุงขวดตลับ', main_log: 'คลังถุง/ขวด/ตลับ', qty: '10' },
  { code: 'S011', name: 'ตลับ', lot: '-', location: 'คลังถุงขวดตลับ', main_log: 'คลังถุง/ขวด/ตลับ', qty: '3' },
  { code: 'X1', name: 'x', lot: 'L1', location: 'คลังถุงขวดตลับ', main_log: 'อื่น', qty: '1' },
]
const map = buildMainLogMap(inv)

section('splitLoc / joinLoc')
assertEq(splitLoc('E-8-4 ,E-8-5'), ['E-8-4', 'E-8-5'], 'คั่น comma + trim')
assertEq(splitLoc('C-5-4 , C-5-5 ,C-5-4'), ['C-5-4', 'C-5-5'], 'ตัดซ้ำ คงลำดับ')
assertEq(splitLoc(' - '), [], "'-' = ไม่มีที่เก็บ")
assertEq(joinLoc(['C-2-3', 'D-4-4']), 'C-2-3 ,D-4-4', 'รูปแบบเดียวกับ Excel')

section('MainLog')
assertEq(deriveMainLog(['D-4-4'], map), 'D', 'ชั้นวาง → ตัวอักษรนำ')
assertEq(deriveMainLog(['E-10', 'ห้องประชุมเล็กชั้น4'], map), 'E', 'หลายชั้น → ชั้นแรก')
assertEq(deriveMainLog(['คลังถุงขวดตลับ'], map), 'คลังถุง/ขวด/ตลับ', 'โซนพิเศษ → ค่าที่พบมากสุด')
assertEq(deriveMainLog(['ห้องประชุมเล็กชั้น4'], map), 'ห้องประชุมเล็กชั้น4', 'โซนพิเศษ map ได้')
assertEq(deriveMainLog(['ตู้ใหม่'], map), 'ตู้ใหม่', 'โซนไม่เคยมี → ใช้ชื่อตัวเอง')
assertEq(deriveMainLog([], map), null, 'ว่าง → null')

section('groupPiles')
const mani = groupPiles(inv.filter(r => r.code === '1590035'))
assertEq(mani.length, 2, 'Manidipine lot เดียว 2 ที่เก็บ = 2 กอง')
assertEq(mani.map(p => p.qty), [240, 300], 'ยอดแยกตามกอง')
const dup = groupPiles([{ code: 'A', lot: 'L', location: 'E-1-4 ,E-1-5', qty: '2' }, { code: 'A', lot: 'L', location: 'E-1-5,E-1-4', qty: '3' }])
assertEq([dup.length, dup[0].qty, dup[0].rowCount], [1, 5, 2], 'ลำดับชั้นต่าง = กองเดียว รวมแถว')

section('planMove')
const hyd = groupPiles(inv.filter(r => r.code === '1450009'))[0]
const p1 = planMove(hyd, ['D-4-4'], [], map)
assertEq(p1.insert, { code: '1450009', name: 'Hydralazine 20mg', lot: 'P04077', from_location: 'C-2-3', from_main_log: 'C', to_location: 'D-4-4', to_main_log: 'D' }, 'ย้ายปกติ')
assertEq(planMove(hyd, [], [], map).error, 'ต้องมีที่เก็บอย่างน้อย 1 ชั้น', 'ห้ามว่าง')
assertEq(planMove(hyd, [' C-2-3 '], [], map).error, 'ที่เก็บใหม่เหมือนที่เดิม', 'ไม่เปลี่ยน = error')
const pend = [{ id: 7, status: 'pending', code: '1450009', lot: 'P04077', from_location: 'C-2-3', from_main_log: 'C', to_location: 'D-4-4', to_main_log: 'D' }]
const shown = { ...hyd, location: 'D-4-4', main_log: 'D' }
const p2 = planMove(shown, ['D-4-5'], pend, map)
assertEq([p2.supersedeIds, p2.insert.from_location, p2.insert.to_location], [[7], 'C-2-3', 'D-4-5'], 'ย้ายต่อ = ใบใหม่ from ค่าใน Excel')
const p3 = planMove(shown, ['C-2-3'], pend, map)
assertEq([p3.supersedeIds, p3.insert, p3.error], [[7], null, null], 'ย้ายกลับที่เดิม = ยกเลิกใบเดิมอย่างเดียว')
const p4 = planMove(hyd, ['C-2-3', 'D-4-4'], [], map)
assertEq([p4.insert.to_location, p4.insert.to_main_log], ['C-2-3 ,D-4-4', 'C'], 'เจอบางส่วนอีกชั้น')
const maniCh4 = mani[1]
assertEq(planMove(maniCh4, ['E-10'], [], map).insert.from_location, 'ห้องประชุมเล็กชั้น4', 'ย้ายเฉพาะกองชั้น 4')

section('overlayMoves')
const ov = overlayMoves(inv, pend)
assertEq([ov[0].location, ov[0].main_log, ov[0].pending_move?.id], ['D-4-4', 'D', 7], 'แถวที่มีใบ → ที่ใหม่')
assertEq([ov[1].location, ov[1].pending_move], ['C-2-3', undefined], 'lot อื่นไม่โดน')
const maniMove = [{ id: 9, status: 'pending', code: '1590035', lot: '260873', from_location: 'ห้องประชุมเล็กชั้น4', to_location: 'E-10', to_main_log: 'E' }]
const ov2 = overlayMoves(inv, maniMove)
assertEq([ov2[2].location, ov2[3].location], ['E-1-1 ,E-1-2 ,E-1-3', 'E-10'], 'Manidipine ย้ายกองเดียว อีกกองคงเดิม')
assertEq(overlayMoves(inv, [{ ...pend[0], status: 'applied' }])[0].location, 'C-2-3', 'ใบที่ไม่ pending ไม่ overlay')

section('reconcileMoves')
const r1 = reconcileMoves(pend, inv)
assertEq([r1.pending.length, r1.applied.length, r1.conflict.length], [1, 0, 0], 'Excel ยังไม่แก้ = pending')
const afterExcel = inv.map(r => r.lot === 'P04077' ? { ...r, location: 'D-4-4', main_log: 'D' } : r)
assertEq(reconcileMoves(pend, afterExcel).applied.map(m => m.id), [7], 'Excel ตรงใบ = applied')
const otherEdit = inv.map(r => r.lot === 'P04077' ? { ...r, location: 'D-4-5' } : r)
assertEq(reconcileMoves(pend, otherEdit).conflict.map(m => m.note), ['Excel ที่เก็บเป็น D-4-5'], 'Excel เป็นค่าอื่น = conflict')
assertEq(reconcileMoves(pend, inv.filter(r => r.lot !== 'P04077')).conflict.map(m => m.note), ['lot หายจากไฟล์ Master'], 'lot หาย = conflict')
const partial = [{ ...pend[0], to_location: 'C-2-3 ,D-4-4' }]
assertEq(reconcileMoves(partial, inv).pending.length, 1, 'ย้ายบางส่วน: Excel ยังเป็นชั้นเดียว = pending')
const maniDone = inv.map((r, i) => i === 3 ? { ...r, location: 'E-10' } : r)
assertEq(reconcileMoves(maniMove, maniDone).applied.length, 1, 'Manidipine กองชั้น4 ลงแล้ว (อีกกองไม่เกี่ยว)')

console.log(`\nผ่าน ${pass} / ${pass + fail}`)
if (fail) { console.log(fails.join('\n')); process.exit(1) }
