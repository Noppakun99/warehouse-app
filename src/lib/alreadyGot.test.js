// alreadyGot.test.js — Golden tests สำหรับ src/lib/alreadyGot.js (รายการ "ได้ยาไปแล้ว" ในใบเบิกออนไลน์)
// รัน: node src/lib/alreadyGot.test.js  (npm run test:alreadygot)
// เคสจริง: Gentamicin 80mg ห้องยาG รับไปก่อน 20/11/2569 2 × 50amp ชีทแถว 9321 เลขรับ บย.70/0090

import {
  ALREADY_GOT_PREFIX, isAlreadyGotQty, isoToThaiBE, qtyUnitText, formatAlreadyGotNote,
  hasAlreadyGotDetail, alreadyGotNoteForSubmit, recentDispenseOptions, missingAlreadyGotDetail,
} from './alreadyGot.js'

let pass = 0, fail = 0
const fails = []
const eq = (a, e, label) => {
  if (JSON.stringify(a) === JSON.stringify(e)) { pass++; return }
  fail++; fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(e)}\n     actual:   ${JSON.stringify(a)}`)
}
const section = (n) => console.log(`\n=== ${n} ===`)

section('isAlreadyGotQty')
eq(isAlreadyGotQty(0), true, '0 = ได้ยาไปแล้ว')
eq(isAlreadyGotQty('0'), true, "'0' (string จากฐานข้อมูล/ช่องกรอก)")
eq(isAlreadyGotQty(''), false, 'ช่องว่างระหว่างพิมพ์ ≠ 0')
eq(isAlreadyGotQty(null), false, 'null ≠ 0')
eq(isAlreadyGotQty(2), false, 'ขอจริง')

section('isoToThaiBE / qtyUnitText')
eq(isoToThaiBE('2026-11-20'), '20/11/2569', 'ISO → พ.ศ.')
eq(isoToThaiBE(''), '', 'ว่าง')
eq(qtyUnitText(2, '50amp'), '2 × 50amp', 'หน่วยขึ้นต้นเลข = ขนาดบรรจุ → ×')
eq(qtyUnitText(10, 'vial'), '10 vial', 'หน่วยตัวอักษร')
eq(qtyUnitText(1200, '-'), '1,200', 'ไม่มีหน่วย')

section('formatAlreadyGotNote')
eq(formatAlreadyGotNote({ date: '2026-11-20', qty: 2, unit: '50amp', reqNumber: 'บย.70/0090' }),
  'ได้ยาไปแล้ว 20/11/2569 จำนวน 2 × 50amp (บย.70/0090)', 'Gentamicin เคสจริง')
eq(formatAlreadyGotNote({ date: '2026-11-18', qty: 10, unit: 'vial', reqNumber: '' }),
  'ได้ยาไปแล้ว 18/11/2569 จำนวน 10 vial', 'ไม่มีเลขใบ → ไม่มีวงเล็บ')

section('hasAlreadyGotDetail')
eq(hasAlreadyGotDetail('ได้ยาไปแล้ว '), false, 'มีแค่คำนำหน้า')
eq(hasAlreadyGotDetail(''), false, 'ว่าง')
eq(hasAlreadyGotDetail('ได้ยาไปแล้ว เมื่อวาน'), false, 'ไม่มีวันที่/จำนวน')
eq(hasAlreadyGotDetail('ได้ยาไปแล้ว 20/11 2 กล่อง'), true, 'พิมพ์เอง')
eq(hasAlreadyGotDetail('รับไปแล้ว 20/11'), true, 'ไม่ขึ้นต้นคำนำหน้าแต่มีรายละเอียด')

section('alreadyGotNoteForSubmit')
eq(alreadyGotNoteForSubmit('รับไปแล้ว 20/11'), `${ALREADY_GOT_PREFIX} รับไปแล้ว 20/11`, 'เติมคำนำหน้า')
eq(alreadyGotNoteForSubmit('ได้ยาไปแล้ว 20/11'), 'ได้ยาไปแล้ว 20/11', 'ขึ้นต้นแล้วไม่เติมซ้ำ')

section('recentDispenseOptions')
{
  const rows = [
    { dispense_date: '2026-11-20', qty_out: 1, drug_unit: '50amp', requisition_number: 'บย.70/0090', lot: 'A' },
    { dispense_date: '2026-11-20', qty_out: 1, drug_unit: '50amp', requisition_number: 'บย.70/0090', lot: 'B' },
    { dispense_date: '2026-03-02', qty_out: 1, drug_unit: '50amp', requisition_number: null },
    { dispense_date: '2026-11-21', qty_out: 0, drug_unit: '50amp', requisition_number: 'บย.70/0091' },
    { dispense_date: null, qty_out: 3, drug_unit: '50amp' },
  ]
  const opts = recentDispenseOptions(rows)
  eq(opts.length, 2, 'รวม 2 lot วันเดียวกันเลขเดียวกัน · ตัด qty 0 และไม่มีวันที่')
  eq(opts[0], { date: '2026-11-20', qty: 2, unit: '50amp', reqNumber: 'บย.70/0090' }, 'ใหม่ก่อน + รวม qty')
  eq(opts[1].reqNumber, '', 'แถวเก่าไม่มีเลขใบ')
  eq(recentDispenseOptions(rows, { limit: 1 }).length, 1, 'limit')
  eq(recentDispenseOptions([]), [], 'ไม่มีประวัติ')
}

section('missingAlreadyGotDetail')
eq(missingAlreadyGotDetail([
  { name: 'Gentamicin', requestedQty: 0, note: 'ได้ยาไปแล้ว ' },
  { name: 'Para', requestedQty: 0, note: 'ได้ยาไปแล้ว 20/11/2569 จำนวน 2' },
  { name: 'ORS', requestedQty: 5, note: '' },
]), ['Gentamicin'], 'เฉพาะรายการ 0 ที่ยังไม่กรอกรายละเอียด')

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
if (fail) { console.log(fails.join('\n')); process.exit(1) }
