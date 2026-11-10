// loanSlip.test.js — Golden tests สำหรับ src/lib/loanSlip.js (+ fillLoanSlip กรอกใบจาก job ที่แอปสร้างได้)
// รัน: node src/lib/loanSlip.test.js  (npm run test:loanslip)
// ครอบ: เลข LN ข้ามปีงบ · EXP เป็น พ.ศ. · ใบแจ้งยืม validate/job · ผลการคืน (ครบ/บางส่วน/lot อื่น) · reconcile · Mixtard LN-70/003

import {
  fiscal2, nextLoanNumber, isoToThai, expToThai, fileDateOf, guessPartyType, itemNote,
  validateOutForm, buildOutJob, loanGroupKey, deriveReturnResult, buildReturnJob, openReturnByLoanId, reconcileSlips,
} from './loanSlip.js'
import { fillLoanSlip } from './loanSlipFill.js'

let pass = 0, fail = 0
const fails = []
function assertEq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`)
}
function section(name) { console.log(`\n=== ${name} ===`) }

section('เลข LN')
assertEq(fiscal2(new Date(2026, 8, 30)), 69, 'ก.ย. 2569 = ปีงบ 69')
assertEq(fiscal2(new Date(2026, 9, 1)), 70, 'ต.ค. 2569 = ปีงบ 70')
const nov = new Date(2026, 10, 10)
assertEq(nextLoanNumber(['LN-70/001', 'LN-70/003', 'ใบขอยืม รพ.สามโคก 9/11/69', null, 'LN-69/045'], nov), 'LN-70/004', 'ต่อจากเลขสูงสุดของปีงบ ข้ามข้อความอื่น/ปีเก่า')
assertEq(nextLoanNumber([], nov), 'LN-70/001', 'ยังไม่มีเลข = 001')
assertEq(nextLoanNumber(['  LN-70/009 '], nov), 'LN-70/010', 'trim ช่องว่าง')

section('วันที่ / EXP')
assertEq(isoToThai('2026-11-10'), '10/11/2569', 'ISO → พ.ศ.')
assertEq(isoToThai(''), '', 'ว่าง = ว่าง')
assertEq(expToThai('31/08/2029'), '31/08/2572', 'EXP ค.ศ. → พ.ศ.')
assertEq(expToThai('5/9/2572'), '05/09/2572', 'EXP พ.ศ. คงไว้ + เติม 0')
assertEq(expToThai('2029-02-28'), '28/02/2572', 'EXP ISO')
assertEq(expToThai('25 กุมภาพันธ์ 2027'), '25 กุมภาพันธ์ 2027', 'อ่านไม่ได้ = ค่าเดิม')
assertEq(expToThai('-'), '', 'lot ไม่มี exp')
assertEq(fileDateOf('2026-11-10'), '10.11.69', 'ชื่อไฟล์ ว.ด.ปป')
assertEq(guessPartyType('รพ.ปทุมธานี'), 'โรงพยาบาล', 'รพ.')
assertEq(guessPartyType('องค์การเภสัชกรรม'), '', 'อภ. ไม่เดา')
assertEq(itemNote('1460026', 'ลำดับ 58'), 'รหัส 1460026 · ลำดับ 58', 'รหัสไปหมายเหตุ')
assertEq(itemNote('-', ''), '', 'รหัส - ไม่ใส่')

section('ใบแจ้งยืม')
const outForm = {
  direction: 'lend', counterparty: 'รพ.กรุงไทยเวิสเทิร์น', partyType: 'โรงพยาบาล', slipDate: '2026-10-30',
  reason: { pick: 'help' }, returnTerm: { pick: 'date', date: '2026-11-09' }, responsible: {},
  items: [
    { code: '1460026', name: 'Mixtard 70/30 10ml', lot: 'A032515259', exp: '28/02/2029', qty: '50', unit: 'vial', price: '76', stockQty: 120 },
    { code: '1460026', name: 'Mixtard 70/30 10ml', lot: 'A032615028', exp: '30/04/2029', qty: '50', unit: 'vial', price: '76' },
  ],
}
assertEq(validateOutForm(outForm), null, 'ฟอร์มครบ')
assertEq(validateOutForm({ ...outForm, counterparty: ' ' }), 'กรอกชื่อหน่วยงานคู่สัญญา', 'ไม่มีคู่สัญญา')
assertEq(validateOutForm({ ...outForm, items: [{ ...outForm.items[0], qty: '200' }] }), 'รายการที่ 1: ให้ยืมเกินคงเหลือ lot นี้ (120)', 'ให้ยืมเกินคงเหลือ')
assertEq(validateOutForm({ ...outForm, direction: 'borrow', items: [{ ...outForm.items[0], qty: '200' }] }), null, 'ยืมเข้าไม่เช็คคงเหลือ')
assertEq(validateOutForm({ ...outForm, returnTerm: { pick: 'date', date: '' } }), 'ระบุวันที่กำหนดคืน', 'กำหนดคืนต้องมีวันที่')
const outJob = buildOutJob(outForm, 'LN-70/003', nov)
assertEq([outJob.kind, outJob.ln, outJob.fileDate, outJob.slipDate, outJob.title], ['out', 'LN-70/003', '30.10.69', '30/10/2569', 'รพ.กรุงไทยเวิสเทิร์น Mixtard 70/30'], 'หัว job')
assertEq(outJob.items[0], { name: 'Mixtard 70/30 10ml', code: '', drugCode: '1460026', lot: 'A032515259', exp: '28/02/2572', qty: 50, unit: 'vial', price: 76, note: 'รหัส 1460026' }, 'รายการ job (รหัสในหมายเหตุ)')
assertEq(outJob.returnTerm.date, '09/11/2569', 'กำหนดคืน พ.ศ.')
const outFill = fillLoanSlip(outJob)
assertEq([outFill.total, outFill.html.includes('LN-70/003'), outFill.html.includes('เจ็ดพันหกร้อยบาทถ้วน')], [7600, true, true], 'กรอกใบยืมได้ + ยอดรวม')

section('ใบแจ้งรับคืน')
const loans = [
  { id: 106, direction: 'lend', counterparty: 'รพ.กรุงไทยเวิสเทิร์น', drug_code: '1460026', drug_name: 'Mixtard 70/30 10ml', lot: 'A032515259', exp: '28/02/2029', qty: 50, unit: 'vial', price_per_unit: 76, loan_date: '2026-10-30', loan_doc: 'LN-70/003', return_date: null },
  { id: 107, direction: 'lend', counterparty: 'รพ.กรุงไทยเวิสเทิร์น', drug_code: '1460026', drug_name: 'Mixtard 70/30 10ml', lot: 'A032615028', exp: '30/04/2029', qty: 50, unit: 'vial', price_per_unit: 76, loan_date: '2026-10-30', loan_doc: 'LN-70/003', return_date: null },
  { id: 98, direction: 'lend', counterparty: 'องค์การเภสัชกรรม', drug_code: '1590183', drug_name: 'Losartan 50mg', lot: 'L690464', qty: 3, unit: 'กล่อง', price_per_unit: 214, loan_date: '2026-10-06', loan_doc: 'LN-70/001', return_date: null },
]
assertEq(loanGroupKey(loans[0]) === loanGroupKey(loans[1]), true, 'ใบยืมเดียวกัน = กลุ่มเดียว')
assertEq(loanGroupKey(loans[0]) === loanGroupKey(loans[2]), false, 'คนละใบ')
const group = loans.slice(0, 2)
const both = { 106: { checked: true, lotReturned: 'A032615133', exp: '31/08/2029', qty: '50' }, 107: { checked: true, lotReturned: 'A032615133', exp: '31/08/2029', qty: '50' } }
assertEq(deriveReturnResult(group, both), { result: ['full', 'otherLot'], partialLeft: '', error: null }, 'Mixtard คืนครบด้วย lot อื่น')
assertEq(deriveReturnResult(group, { 106: { checked: true, lotReturned: 'A032515259', qty: 50 } }), { result: ['partial'], partialLeft: '1', error: null }, 'คืนรายการเดียวจาก 2 = บางส่วน ค้าง 1')
assertEq(deriveReturnResult(group, { 106: { checked: true, qty: 20 }, 107: { checked: true, qty: 50 } }).result, ['partial'], 'จำนวนน้อยกว่าที่ยืม = บางส่วน')
assertEq(deriveReturnResult(group, { 106: { checked: true, qty: 60 } }).error, 'Mixtard 70/30 10ml: คืนเกินจำนวนที่ยืม (50)', 'คืนเกิน')
assertEq(deriveReturnResult(group, {}).error, 'เลือกรายการที่คืนอย่างน้อย 1 รายการ', 'ไม่เลือกเลย')
const retJob = buildReturnJob({ slipDate: '2026-11-10', partyType: 'โรงพยาบาล', returner: {} }, group, both, nov)
assertEq([retJob.kind, retJob.ln, retJob.loanDate, retJob.slipDate, retJob.result, retJob.note], ['return', 'LN-70/003', '30/10/2569', '10/11/2569', ['full', 'otherLot'], ''], 'หัว job คืน')
assertEq(retJob.items.map(i => [i.loanId, i.lot, i.lotReturned, i.exp, i.qty, i.price]), [[106, 'A032515259', 'A032615133', '31/08/2572', 50, 76], [107, 'A032615028', 'A032615133', '31/08/2572', 50, 76]], 'รายการ job คืน')
const retFill = fillLoanSlip(retJob)
assertEq([retFill.total, retFill.html.includes('A032615133')], [7600, true], 'กรอกใบคืนได้')
const noLn = buildReturnJob({ slipDate: '2026-11-10' }, [{ ...loans[2], loan_doc: 'ใบขอยืม รพ.สามโคก 9/11/69' }], { 98: { checked: true, qty: 3 } }, nov)
assertEq([noLn.ln, noLn.note], ['', 'อ้างถึงใบยืม ใบขอยืม รพ.สามโคก 9/11/69'], 'ใบยืมของคู่ยืม: อ้างเลขในหมายเหตุ')

section('สถานะใบ ↔ ทะเบียน')
const slipRet = { id: 1, kind: 'return', direction: 'lend', counterparty: 'รพ.กรุงไทยเวิสเทิร์น', status: 'pending', loan_ids: [106, 107], job: retJob }
const slipOut = { id: 2, kind: 'out', direction: 'lend', counterparty: 'รพ.กรุงไทยเวิสเทิร์น', ln: 'LN-70/003', status: 'pending', job: outJob }
assertEq([...openReturnByLoanId([slipRet, { ...slipRet, id: 9, status: 'applied', loan_ids: [98] }]).keys()], [106, 107], 'ป้ายรอลง Excel เฉพาะใบเปิด')
assertEq(reconcileSlips([slipRet], loans).pending, [1], 'ทะเบียนยังไม่ลงคืน = pending')
const returned = loans.map(l => l.id === 106 || l.id === 107 ? { ...l, return_date: '2026-11-10' } : l)
assertEq(reconcileSlips([slipRet], returned).applied, [{ id: 1, loan_ids: [106, 107] }], 'ลงคืนครบ = applied')
const split = [...returned.filter(l => l.id !== 106), { ...returned[0], id: 140, qty: 20 }]
assertEq(reconcileSlips([slipRet], split).applied.length, 1, 'แถวแยกจากคืนบางส่วน (id เปลี่ยน) ยังจับคู่ได้')
assertEq(reconcileSlips([slipRet], loans.filter(l => l.id !== 106)).conflict.length, 1, 'แถวหายและไม่มีแถวคืนแทน = conflict')
assertEq(reconcileSlips([slipOut], []).pending, [2], 'ทะเบียนยังไม่มี LN = pending')
assertEq(reconcileSlips([slipOut], loans).applied, [{ id: 2, loan_ids: [106, 107] }], 'ทะเบียนมี LN รายการตรง = applied')
assertEq(reconcileSlips([slipOut], [loans[0], { ...loans[1], qty: 40 }]).conflict.map(c => c.id), [2], 'จำนวนไม่ตรง = conflict')
assertEq(reconcileSlips([{ ...slipOut, status: 'cancelled' }], loans), { applied: [], conflict: [], pending: [] }, 'ใบยกเลิกไม่เทียบ')

section('scrutinize 10/11/2569')
// คืนบางส่วน: แถวคืนเป็น id ใหม่ แถวเดิม (ยังไม่คืน) ค้างในระบบเพราะ import ไม่ --delete-missing → ต้องไม่ค้าง pending ตลอดไป
const splitKeep = [...loans, { ...loans[0], id: 141, qty: 50, return_date: '2026-11-10' }, { ...loans[1], id: 142, return_date: '2026-11-10' }]
assertEq(reconcileSlips([slipRet], splitKeep).applied.length, 1, 'แถวเดิมค้าง + มีแถวคืนแทน = applied')
// ใบ conflict ที่แก้ทะเบียนแล้วต้องปิดได้
assertEq(reconcileSlips([{ ...slipOut, status: 'conflict' }], loans).applied.map(a => a.id), [2], 'conflict แก้ทะเบียนแล้ว = applied')
// lot เดียวกัน 2 แถวรวมกันเกินคงเหลือ
assertEq(validateOutForm({ ...outForm, items: [{ ...outForm.items[0], qty: '70' }, { ...outForm.items[0], qty: '60' }] }), 'รายการที่ 2: ให้ยืมเกินคงเหลือ lot นี้ (120)', 'lot ซ้ำรวมเกินคงเหลือ')
// ใช้ใบของคู่สัญญา (ไม่ออก LN)
const partyForm = { ...outForm, direction: 'borrow', counterparty: 'รพ.ปทุมธานี', partyDoc: true, partyDocNo: 'แบบฟอร์มขอยืมยา', slipDate: '2026-11-10', items: [{ code: '1670062', name: 'KCl Elixir 60ml', lot: 'FE260231', exp: '01/08/2029', qty: '20', unit: 'ขวด', price: '32.10' }] }
assertEq(validateOutForm({ ...partyForm, partyDocNo: '' }), 'กรอกเลขที่หนังสือ/ชื่อแบบฟอร์มของคู่สัญญา', 'ใบคู่สัญญาต้องมีเลขหนังสือ')
assertEq(validateOutForm({ ...partyForm, slipDate: '' }), 'ระบุวันที่ยืม (ใช้จับคู่กับทะเบียน)', 'ใบคู่สัญญาต้องมีวันที่ยืม')
assertEq(validateOutForm(partyForm), null, 'ใบคู่สัญญาครบ')
const partyJob = buildOutJob(partyForm, '', nov)
assertEq([partyJob.ln, partyJob.loanDoc], ['', 'แบบฟอร์มขอยืมยา'], 'ไม่มี LN · loanDoc = เลขหนังสือ')
assertEq(fillLoanSlip(partyJob).html.includes('LN -'), true, 'พิมพ์ได้ ช่อง LN ว่าง')
const slipParty = { id: 3, kind: 'out', direction: 'borrow', counterparty: 'รพ.ปทุมธานี', ln: null, status: 'pending', job: partyJob }
const kcl = { id: 200, direction: 'borrow', counterparty: 'รพ.ปทุมธานี', drug_code: '1670062', lot: 'FE260231', qty: 20, loan_date: '2026-11-10', loan_doc: 'แบบฟอร์มขอยืมยา' }
assertEq(reconcileSlips([slipParty], [{ ...kcl, id: 199, loan_date: '2026-10-22' }]).pending, [3], 'เลขหนังสือซ้ำแต่คนละวัน = pending')
assertEq(reconcileSlips([slipParty], [kcl]).applied, [{ id: 3, loan_ids: [200] }], 'เลขหนังสือ + วันที่ยืมตรง = applied')

console.log(`\nผ่าน ${pass} / ${pass + fail}`)
if (fail) { console.log(fails.join('\n')); process.exit(1) }
