// reservation.test.js — Golden tests สำหรับ src/lib/reservation.js (CONTEXT §ตัดยอดชั่วคราว)
// รัน: node src/lib/reservation.test.js  (npm run test:reservation)
// กฎ: ต้องผ่าน 100% ก่อน commit
// ครอบ: กฎเลิกหัก 2 เคสที่ grill เจอ / สถานะ / จำนวนที่หักต่อสถานะ / รวมต่อรหัส+lot / หักราย lot ทั้ง 2 โหมด

import { isReservationActive, itemHolds, summarizeHolds, applyHolds } from './reservation.js'

let pass = 0, fail = 0
const fails = []

function assertEq(actual, expected, label) {
  if (actual === expected) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`)
}
function assertDeep(actual, expected, label) {
  assertEq(JSON.stringify(actual), JSON.stringify(expected), label)
}
function section(name) { console.log(`\n=== ${name} ===`) }

const T_DISPENSE = '2026-11-12T02:00:00Z'
const T_SHEET    = '2026-11-12T03:00:00Z'
const T_IMPORT_BEFORE = '2026-11-12T02:30:00Z'   // นำเข้าเพื่อลงบิล ก่อนลงชีทใบนี้
const T_IMPORT_AFTER  = '2026-11-12T04:00:00Z'

section('isReservationActive — กฎเลิกหัก')
{
  assertEq(isReservationActive({ status: 'dispensed', sheetEnteredAt: null }, T_IMPORT_AFTER), true,
    'ใบจ่ายก่อนลงชีท + มีนำเข้าหลังจ่าย (ลงบิล) → ยังหัก (กฎเดิมเลิกหักผิด)')
  assertEq(isReservationActive({ status: 'approved', sheetEnteredAt: T_SHEET }, T_IMPORT_AFTER), false,
    'ใบลงชีทก่อนจัด + นำเข้าหลังลงชีท → เลิกหัก แม้ยังไม่จัด (กฎเดิมหักซ้ำ)')
  assertEq(isReservationActive({ status: 'dispensed', sheetEnteredAt: T_SHEET }, T_IMPORT_BEFORE), true,
    'ลงชีทแล้วแต่การนำเข้าล่าสุดเกิดก่อนลงชีท → ยังหัก')
  assertEq(isReservationActive({ status: 'dispensed', sheetEnteredAt: T_SHEET }, T_SHEET), true,
    'นำเข้าเวลาเดียวกับลงชีทพอดี → ยังหัก (ต้องหลังเท่านั้น)')
  assertEq(isReservationActive({ status: 'pending', sheetEnteredAt: null }, null), true, 'ไม่เคยนำเข้าเลย → หัก')
  assertEq(isReservationActive({ status: 'partial', sheetEnteredAt: null }, T_IMPORT_AFTER), true, 'partial หักเหมือน approved')
  assertEq(isReservationActive({ status: 'rejected', sheetEnteredAt: null }, null), false, 'rejected ไม่หัก')
  assertEq(isReservationActive({ status: 'received', sheetEnteredAt: T_DISPENSE }, T_IMPORT_AFTER), false,
    'ใบเก่า backfill (ลงชีท = เวลาจ่าย) นำเข้าหลังจ่าย → เลิกหักเหมือนพฤติกรรมเดิม')
}

section('itemHolds — จำนวนที่หักต่อสถานะ')
{
  assertDeep(itemHolds({ requested_qty: 100 }, 'pending'), [{ lot: null, base: 100 }], 'pending ยังไม่อนุมัติ → ตามที่ขอ')
  assertDeep(itemHolds({ requested_qty: 100, approved_qty: 60 }, 'approved'), [{ lot: null, base: 60 }], 'approved → ตามที่อนุมัติ')
  assertDeep(itemHolds({ requested_qty: 100, approved_qty: 0 }, 'partial'), [], 'partial รายการที่ไม่อนุมัติ (0) → ไม่หัก')
  assertDeep(itemHolds({ requested_qty: 100, picked_allocation: [{ lot: 'A1', base: 30 }] }, 'approved'),
    [{ lot: null, base: 100 }], 'ยังไม่จัด → ไม่อ่าน allocation ค้างเก่า')
  assertDeep(itemHolds({ approved_qty: 60, picked_allocation: [{ lot: ' A1 ', base: 40 }, { lot: 'B2', base: 20 }] }, 'dispensed'),
    [{ lot: 'A1', base: 40 }, { lot: 'B2', base: 20 }], 'จัดแล้ว → ราย lot ตามที่หยิบจริง (trim lot)')
  assertDeep(itemHolds({ approved_qty: 60, picked_qty: 50 }, 'picking'), [{ lot: null, base: 50 }], 'จัดแล้วไม่มี allocation → picked_qty')
}

section('summarizeHolds — รวมต่อรหัส')
{
  const rows = [
    { drug_code: 'X', requisition_id: 1, requested_qty: 100, status: 'pending' },
    { drug_code: 'x', requisition_id: 2, approved_qty: 50, picked_allocation: [{ lot: 'L1', base: 50 }], status: 'dispensed', sheet_entered_at: null },
    { drug_code: 'X', requisition_id: 3, approved_qty: 70, status: 'approved', sheet_entered_at: T_SHEET },
    { drug_code: 'Y', requisition_id: 4, requested_qty: 5, status: 'rejected' },
  ]
  const keyOf = (c) => String(c).toLowerCase()
  assertDeep(summarizeHolds(rows, { keyOf, lastImportAt: T_IMPORT_AFTER }),
    { x: { total: 150, byLot: { L1: 50 }, unassigned: 100 } },
    'ใบ 3 ลงชีท+นำเข้าแล้วไม่นับ · rejected ไม่นับ · รหัสต่างตัวพิมพ์รวมกัน')
  assertDeep(summarizeHolds(rows, { keyOf, lastImportAt: T_IMPORT_AFTER, excludeReqId: 1 }).x.total, 50, 'excludeReqId ไม่นับใบตัวเอง')
  assertDeep(summarizeHolds([{ drug_code: '-', requested_qty: 1, status: 'pending' }], { keyOf: (c) => (c === '-' ? '' : c) }), {},
    'รหัส "-" ไม่นับ')
}

section('applyHolds — หักราย lot')
{
  const lots = [
    { lot: 'A', base: 100, packSize: 10 },
    { lot: 'B', base: 100, packSize: 10 },
  ]
  const r1 = applyHolds(lots, { total: 30, byLot: { B: 30 }, unassigned: 0 }, { fefoRemainder: false })
  assertDeep(r1.lots.map(l => [l.lot, l.base, l.packs]), [['A', 100, 10], ['B', 70, 7]], 'หน้าจัดยา: ใบก่อนหยิบ B → หักที่ B ไม่ใช่ lot แรก')
  assertEq(r1.held, 30, 'held = 30')

  const r2 = applyHolds(lots, { total: 150, byLot: { B: 30 }, unassigned: 120 }, { fefoRemainder: false })
  assertEq(r2.held, 30, 'หน้าจัดยา: ใบที่ยังไม่จัดไม่หัก (ของยังอยู่บนชั้น)')

  const r3 = applyHolds(lots, { total: 150, byLot: { B: 30 }, unassigned: 120 })
  assertDeep(r3.lots.map(l => [l.lot, l.base]), [['B', 50]], 'หน้าค้นหา: B หัก 30 ก่อน แล้ว 120 หักตามลำดับ A100 + B20')
  assertEq(r3.held, 150, 'held = ยอดจองรวม')

  const r4 = applyHolds(lots, { total: 40, byLot: { Z: 40 }, unassigned: 0 })
  assertDeep(r4.lots.map(l => [l.lot, l.base]), [['A', 60], ['B', 100]], 'หน้าค้นหา: lot ที่ไม่อยู่ในรายการ → หักตามลำดับจ่าย ยอดรวมไม่เกินจริง')
  assertEq(applyHolds(lots, { total: 40, byLot: { Z: 40 }, unassigned: 0 }, { fefoRemainder: false }).held, 0,
    'หน้าจัดยา: lot ที่ไม่อยู่ในรายการ (เช่นหมดอายุ ถูกกรองออก) → ไม่หักมั่ว')

  const dup = [{ lot: 'A', base: 10, packSize: 1 }, { lot: 'A', base: 10, packSize: 1 }]
  assertDeep(applyHolds(dup, { total: 15, byLot: { A: 15 }, unassigned: 0 }, { fefoRemainder: false }).lots.map(l => l.base), [5],
    'lot ซ้ำ 2 แถว (คนละ exp) → หักต่อเนื่องข้ามแถว')
  assertDeep(applyHolds(lots, { total: 999, byLot: {}, unassigned: 999 }).lots, [], 'จองเกินคงเหลือ → ไม่เหลือ lot (ไม่ติดลบ)')
  assertDeep(applyHolds(lots, null).lots.length, 2, 'ไม่มียอดจอง → lot เดิมครบ')
  assertEq(lots[1].base, 100, 'ไม่แก้ array ต้นทาง')
}

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
if (fail) { console.log(fails.join('\n')); process.exit(1) }
