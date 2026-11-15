// reqStaffView.test.js — golden test หน้าเบิกยาเจ้าหน้าที่ (ขั้นของใบ · lot ที่จ่าย · ผลการจัด · เรียงตามที่เก็บ)
// รัน: node src/lib/reqStaffView.test.js
import { stageOf, tabOf, nextStep, waitText, normAllocation, itemAllocation, trimAllocation, defaultPickResult, pickPayload, verifyNoteText, sortByLog, reqFlags } from './reqStaffView.js'

let pass = 0, fail = 0
function check(label, got, expect) {
  const ok = JSON.stringify(got) === JSON.stringify(expect)
  if (ok) pass++; else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`)
  if (!ok) console.log(`   got:    ${JSON.stringify(got)}\n   expect: ${JSON.stringify(expect)}`)
}

// 1) ขั้นของใบ → แท็บคิว
check('pending → แท็บรอลงชีท/อนุมัติ', tabOf({ status: 'pending' }), 'pending')
check('partial = รอจัดเหมือน approved', [stageOf({ status: 'partial' }), tabOf({ status: 'partial' })], ['pick', 'pick'])
check('ready (flow เดิม) อยู่แท็บรอตรวจจ่าย', tabOf({ status: 'ready' }), 'check')
check('rejected/received → ประวัติ', [tabOf({ status: 'rejected' }), tabOf({ status: 'received' })], ['hist', 'hist'])

// 2) ขั้นถัดไป — ใบห้องยาG ที่ยังไม่ลงชีท = รอลงชีท · หน่วยงานอื่น = รออนุมัติ
check('ห้องยาG pending = รอลงชีทเบิก', nextStep({ status: 'pending', department: 'ห้องยา G' }).label, 'รอลงชีทเบิก')
check('หน่วยงานอื่น pending = รออนุมัติ', nextStep({ status: 'pending', department: 'ER' }).label, 'รออนุมัติ')
check('รอจัด ลงชีทแล้ว บอกว่าจัดตามชีท', nextStep({ status: 'approved', sheet_entered_at: '2026-11-14T08:00:00Z' }).sub, 'จัดตาม lot ในชีท')
check('รอตรวจ บอกชื่อผู้จัด', nextStep({ status: 'picking', picker_name: 'นพคุณ' }).sub, 'ผู้จัด นพคุณ')

// 3) รอกี่วัน — นับวันปฏิทิน
const today = new Date(2026, 10, 15, 9, 0)
check('ส่งวันนี้', waitText(new Date(2026, 10, 15, 7, 0).toISOString(), today), 'วันนี้')
check('ส่ง 13/11 ดึก = รอ 2 วัน', waitText(new Date(2026, 10, 13, 23, 50).toISOString(), today), 'รอ 2 วัน')

// 4) allocation จากชีท — เติม packSize/packs · ตัดแถว 0
check('normAllocation คำนวณ packSize จาก base/packs', normAllocation([{ lot: 'A', base: 300, packs: 3 }, { lot: 'B', base: 0 }]),
  [{ lot: 'A', base: 300, packs: 3, packSize: 100 }])

const lots = [
  { lot: 'L1', exp: '01/03/2027', packSize: 100, packs: 2, base: 200, location: 'E-1-3', mainLog: 'Log E' },
  { lot: 'L2', exp: '01/03/2028', packSize: 100, packs: 5, base: 500, location: 'E-1-4', mainLog: 'Log E' },
]
const isNear = (exp) => exp === '01/03/2027'

// 5) pending = ประมาณการ FEFO · ปัดเต็มกล่อง
const est = itemAllocation({ requested_qty: 250 }, { stage: 'pending', fefoLots: lots, isNear })
check('pending ขอ 250 → L1 200 + L2 100 (เกิน 50) · ใกล้หมดอายุ', [est.source, est.allocation.map(a => [a.lot, a.base]), est.got, est.over, est.short, est.near],
  ['fefo', [['L1', 200], ['L2', 100]], 300, 50, 0, true])
check('pending ใช้จำนวนที่จะอนุมัติ (wantQty) ไม่ใช่ที่ขอ', itemAllocation({ requested_qty: 250 }, { stage: 'pending', fefoLots: lots, wantQty: 100 }).got, 100)
check('ขอเกินของ → ขาด', itemAllocation({ requested_qty: 900 }, { stage: 'pending', fefoLots: lots }).short, 200)

// 6) รอจัด ลงชีทแล้ว = lot ตามชีท ไม่คำนวณ FEFO ใหม่
const sheetItem = { approved_qty: 100, picked_allocation: [{ lot: 'L2', exp: '01/03/2028', base: 100, packs: 1, packSize: 100, onhand: 500, location: 'E-1-4' }] }
const sv = itemAllocation(sheetItem, { stage: 'pick', sheetMode: true, fefoLots: lots })
check('pick+ชีท ใช้ lot ในชีท (L2 ไม่ใช่ L1)', [sv.source, sv.allocation.map(a => a.lot), sv.short], ['sheet', ['L2'], 0])
check('pick+ชีท ไม่มีแถวในชีท = ขาดทั้งหมด', itemAllocation({ approved_qty: 30, picked_allocation: null }, { stage: 'pick', sheetMode: true }).short, 30)

// 7) รอตรวจ = ที่จัดจริง · ใบเก่าไม่มี allocation ใช้ picked_lot/qty
const pk = itemAllocation({ approved_qty: 100, picked_qty: 60, picked_lot: 'X9', picked_exp: '01/01/2028' }, { stage: 'check' })
check('check ใบเก่า fallback picked_lot · จัดไม่ครบ 40', [pk.allocation.map(a => [a.lot, a.base]), pk.short], [[['X9', 60]], 40])
check('ไม่อนุมัติทั้งใบ ไม่มี lot', itemAllocation({ requested_qty: 10 }, { stage: 'rej', fefoLots: lots }).allocation.length, 0)

// 8) ตัด allocation ตามที่จัดได้จริง
check('trim 250 จาก L1 200 + L2 100 → L1 200 + L2 50 (0.5 กล่อง)',
  trimAllocation(est.allocation, 250).map(a => [a.lot, a.base, a.packs]), [['L1', 200, 2], ['L2', 50, 0.5]])
check('trim 0 = ไม่มี lot', trimAllocation(est.allocation, 0), [])

// 9) ผลการจัดเริ่มต้น
check('ของไม่พอ → เริ่มที่ "ไม่ครบ" จัดได้เท่าที่มี', defaultPickResult({ want: 900, got: 700, short: 200 }), { st: 'part', qty: 700, why: 'ของไม่พอ' })
check('ของพอ → เริ่มที่ "ครบ"', defaultPickResult({ want: 100, got: 100, short: 0 }).st, 'full')

// 10) payload บันทึกการจัด
const full = pickPayload({ id: 7 }, est, { st: 'full' }, '', { L1: 200, L2: 500 })
check('ครบ FEFO → เก็บ onhand snapshot ราย lot', [full.picked_qty, full.picked_lot, full.picked_allocation.map(a => [a.lot, a.base, a.onhand]), full.staff_note],
  [300, 'L1', [['L1', 200, 200], ['L2', 100, 500]], null])
const part = pickPayload({ id: 7 }, est, { st: 'part', qty: 150, why: 'ของชำรุด/แตก' }, 'จ่ายlotเก่าให้หมด', { L1: 200 })
check('ไม่ครบ → ตัด lot + ต่อเหตุท้ายหมายเหตุคลัง', [part.picked_qty, part.picked_allocation.length, part.staff_note], [150, 1, 'จ่ายlotเก่าให้หมด · ของชำรุด/แตก'])
check('เหตุซ้ำกับหมายเหตุเดิม ไม่ต่อซ้ำ', pickPayload({ id: 7 }, est, { st: 'part', qty: 10, why: 'ของไม่พอ' }, 'ของไม่พอ').staff_note, 'ของไม่พอ')
const sp = pickPayload({ id: 8 }, sv, { st: 'full' })
check('ตามชีท → ส่ง allocation ของชีทเดิม (มี location/onhand ของชีท)', [sp.picked_allocation[0].location, sp.picked_allocation[0].onhand], ['E-1-4', 500])
check('จัดได้ 0 → ไม่มี allocation · picked_qty 0', [pickPayload({ id: 9 }, est, { st: 'part', qty: 0, why: 'ของไม่พอ' }).picked_allocation, pickPayload({ id: 9 }, est, { st: 'part', qty: 0 }).picked_qty], [null, 0])

// 11) หมายเหตุผู้ตรวจ
check('แจ้งแก้ ผิด lot + รายละเอียด', verifyNoteText({ kind: 'ผิด lot', text: ' หยิบ L2 แทน L1 ' }), 'ผิด lot: หยิบ L2 แทน L1')
check('แจ้งแก้ ไม่มีรายละเอียด', verifyNoteText({ kind: 'หยิบผิดยา', text: '' }), 'หยิบผิดยา')
check('ไม่ได้เลือกปัญหา = ไม่มีหมายเหตุ', verifyNoteText({ kind: '', text: 'x' }), null)

// 12) เรียงตามที่เก็บ — MainLog → DetailedLog แบบ Excel (E-10 < E-11 < E-1-3) · ไม่มีที่เก็บไปท้าย
const views = [
  { i: 1, mainLog: 'Log E', locs: ['E-1-3'] },
  { i: 2, mainLog: '', locs: [] },
  { i: 3, mainLog: 'Log A', locs: ['A-2-1'] },
  { i: 4, mainLog: 'Log E', locs: ['E-10'] },
]
check('sortByLog', sortByLog(views).map(v => v.i), [3, 4, 1, 2])

// 13) ป้ายในคิว ใช้ตรรกะเดียวกับหน้ารายละเอียด
const req = { status: 'pending', requisition_items: [{ drug_code: 'A', requested_qty: 250 }, { drug_code: 'A', requested_qty: 900 }, { drug_code: 'B', requested_qty: 5 }] }
check('reqFlags: ไม่พอ 2 (A 900 + B ไม่มีของ) · ใกล้หมดอายุ 2', reqFlags(req, { lotsOf: c => c === 'A' ? lots : [], isNear }), { short: 2, near: 2 })

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
