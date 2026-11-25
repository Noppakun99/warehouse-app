// reqEditRound.test.js — Golden tests สำหรับ src/lib/reqEditRound.js (ผู้เบิกแก้ใบ + เพิ่มยา)
// รัน: node src/lib/reqEditRound.test.js  (npm run test:reqedit)
// ทางบันทึกจริงทดสอบ E2E ไม่ได้ (ไม่มี DB ทดสอบ) → ตรรกะแบ่งรอบ/ถอยรอบต้องผ่านที่นี่ 100% ก่อน commit

import { lineKey, duplicateAdded, splitEditRound, overBeforeSave, increasedOver, postCheckKeys, rollbackRound, editAuditDetails, editChangeText, packView } from './reqEditRound.js'

let pass = 0, fail = 0
const fails = []
function assertEq(actual, expected, label) {
  if (actual === expected) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`)
}
const assertDeep = (a, e, label) => assertEq(JSON.stringify(a), JSON.stringify(e), label)

// codeKey แบบเดียวกับ RequisitionApp (ตัด 0 นำหน้า · '-' = ไม่มีรหัส)
const keyOf = (v) => (!v || v === '-') ? '' : String(v).trim().toLowerCase().replace(/^0+(\d)/, '$1')

// ---- lineKey ----
assertEq(lineKey('1000227', 'Para', keyOf), 'c:1000227', 'มีรหัส = ใช้รหัส')
assertEq(lineKey(' 01000227', 'x', keyOf), 'c:1000227', 'รหัส normalize ตาม keyOf')
assertEq(lineKey('-', ' ถุง  ซิบ ', keyOf), 'n:ถุง ซิบ', 'ไม่มีรหัส = ชื่อ normalize')

// ---- duplicateAdded ----
const orig = [
  { id: 1, drug_code: '1000227', drug_name: 'Paracetamol 500', requested_qty: 8000, note: null },
  { id: 2, drug_code: '1000112', drug_name: 'Dicloxacillin', requested_qty: 2000, note: 'ด่วน' },
  { id: 3, drug_code: '1000300', drug_name: 'Gentamicin', requested_qty: 0, note: null }, // ได้ยาไปแล้ว
]
const got = new Set([3])
assertDeep(duplicateAdded([...orig, { _new: true, drug_code: '01000227', drug_name: 'Paracetamol 500' }], keyOf), ['Paracetamol 500'], 'เพิ่มยาที่มีในใบ = ซ้ำ')
assertDeep(duplicateAdded([...orig, { _new: true, drug_code: '1000300', drug_name: 'Gentamicin' }], keyOf), ['Gentamicin'], 'ยา "ได้ยาไปแล้ว" ก็นับว่าซ้ำ (ข้อ 4)')
assertDeep(duplicateAdded([...orig, { _new: true, drug_code: '9', drug_name: 'A' }, { _new: true, drug_code: '9', drug_name: 'A' }], keyOf), ['A'], 'เพิ่มซ้ำกันเองในรอบเดียว')
assertDeep(duplicateAdded([...orig, { _new: true, drug_code: '9', drug_name: 'A' }], keyOf), [], 'ยาใหม่ไม่ซ้ำ')

// ---- splitEditRound ----
{
  const lines = [
    { ...orig[0], requested_qty: 6000 },
    { ...orig[1], requested_qty: 0 },          // ตัดออก
    { ...orig[2] },                             // ได้ยาไปแล้ว คงไว้
    { _new: true, drug_code: '1000137', drug_name: 'Lasix inj', drug_unit: 'amp', drug_type: 'ฉีด', requested_qty: 50, item_note: '  ', entry_pack: 10, entry_unit: null },
    { _new: true, drug_code: '1000999', drug_name: 'X', requested_qty: 0 },  // เพิ่มแล้วแก้เป็น 0 = ทิ้ง
    { _new: true, drug_code: '1000888', drug_name: 'Y', requested_qty: 4, entry_pack: 400, entry_unit: 'กล่อง (400เม็ด)', item_note: 'ใช้ลัง' },
  ]
  const r = splitEditRound(lines, got)
  assertDeep(r.updates.map(u => [u.id, u.requested_qty, u.note]), [[1, 6000, null], [2, 0, 'ด่วน'], [3, 0, null]], 'updates = รายการเดิมทุกบรรทัด')
  assertDeep(r.removed.map(l => l.id), [2], 'removed = 0 ที่ไม่ใช่ได้ยาไปแล้ว')
  assertDeep(r.inserts.map(i => i.drug_code), ['1000137', '1000888'], 'inserts ทิ้งบรรทัดใหม่ที่เป็น 0')
  assertEq(r.inserts[0].entry_pack, null, 'ไม่ได้เลือกขนาด → entry_pack null (เหมือนส่งใบใหม่)')
  assertEq(r.inserts[0].item_note, null, 'หมายเหตุช่องว่าง → null')
  assertEq(r.inserts[1].entry_pack, 400, 'เลือกขนาด → เก็บ entry_pack')
  assertEq(r.inserts[1].item_note, 'ใช้ลัง', 'หมายเหตุบรรทัดใหม่')
  assertEq(r.allRemoved, false, 'ยังเหลือรายการ')
}
assertEq(splitEditRound([{ ...orig[0], requested_qty: 0 }, { ...orig[1], requested_qty: 0 }], got).allRemoved, true, 'ตัดหมดทุกบรรทัด = ให้ลบใบแทน')
assertEq(splitEditRound([{ ...orig[0], requested_qty: 0 }, { _new: true, drug_code: '9', drug_name: 'A', requested_qty: 1 }], got).allRemoved, false, 'ตัดของเดิมหมดแต่เพิ่มยาใหม่ = ไม่ใช่ลบใบ')
assertEq(splitEditRound([{ ...orig[0], requested_qty: 0 }, { ...orig[2] }], got).allRemoved, false, 'เหลือแค่ได้ยาไปแล้ว = ไม่นับว่าตัดหมด (แบบเดิม)')

// ---- overBeforeSave ----
{
  const added = [{ drug_code: 'A', requested_qty: 100 }, { drug_code: 'B', requested_qty: 50 }]
  const over = overBeforeSave(added, { a: 120, b: 40 }, { a: 30 }, keyOf)
  assertDeep([...over].sort(), ['a', 'b'], 'A 100 > 120−30 · B 50 > 40 → ขอเกินตั้งแต่ก่อนบันทึก')
  assertDeep([...overBeforeSave(added, { a: 130, b: 50 }, { a: 30 }, keyOf)], [], 'เท่ากันพอดี = ไม่เกิน')
  assertDeep([...overBeforeSave([{ drug_code: 'Z', requested_qty: 1 }], {}, {}, keyOf)], ['z'], 'ไม่มีในคลัง = เกิน')
}

// ---- postCheckKeys ----
{
  const lines = [
    { ...orig[0], requested_qty: 9000 },        // เพิ่ม
    { ...orig[1], requested_qty: 1000 },        // ลด
    { ...orig[2] },
    { _new: true, drug_code: 'N1', drug_name: 'N1', requested_qty: 5 },
    { _new: true, drug_code: 'N2', drug_name: 'N2', requested_qty: 5 },
    { _new: true, drug_code: 'N3', drug_name: 'N3', requested_qty: 0 },
  ]
  assertDeep(postCheckKeys(orig, lines, new Set(['n2']), keyOf).sort(), ['1000227', 'n1'], 'จำนวนเพิ่ม + ยาใหม่ · ไม่รวมที่ลด/ขอเกินก่อนบันทึก/บรรทัดใหม่ 0')
  assertDeep(postCheckKeys(orig, orig, new Set(), keyOf), [], 'ไม่เปลี่ยนอะไร = ไม่ต้องตรวจ')
}

// ---- rollbackRound ----
assertDeep(rollbackRound(orig, [77, 78]), {
  updates: [{ id: 1, requested_qty: 8000, note: null }, { id: 2, requested_qty: 2000, note: 'ด่วน' }, { id: 3, requested_qty: 0, note: null }],
  deleteIds: [77, 78],
}, 'ถอยรอบ = ค่าเดิมทุกบรรทัด + ลบบรรทัดที่เพิ่ม')

// ---- audit + ข้อความกระดิ่ง ----
{
  const d = editAuditDetails({ req: { id: 5, req_number: 'REQ-1' }, department: 'ห้องยา G', removed: [orig[1]], added: [{ drug_name: 'Lasix inj' }, { drug_name: 'Y' }] })
  assertDeep(d, { requisition_id: 5, req_number: 'REQ-1', req_department: 'ห้องยา G', removed_items: ['Dicloxacillin'], added_items: ['Lasix inj', 'Y'] }, 'details ครบ')
  assertEq(editChangeText(d), 'เพิ่ม Lasix inj, Y · ตัด Dicloxacillin', 'ข้อความเพิ่ม+ตัด')
  assertDeep(editAuditDetails({ req: { id: 5, req_number: 'REQ-1' }, department: 'ER' }), { requisition_id: 5, req_number: 'REQ-1', req_department: 'ER' }, 'แก้จำนวนอย่างเดียว ไม่มี key เพิ่ม/ตัด')
  assertEq(editChangeText({ requisition_id: 1 }), '', 'audit เก่า = ข้อความว่าง')
}

// ---- increasedOver (รายการเดิมขอเกิน = เตือน ไม่บล็อก) ----
{
  const o = [{ id: 1, drug_code: 'A', drug_name: 'Para', drug_unit: 'เม็ด', requested_qty: 8000 }, { id: 2, drug_code: 'B', drug_name: 'Diclo', requested_qty: 100 }]
  const inv = { a: 5000, b: 300 }
  assertDeep(increasedOver(o, o, inv, {}, keyOf), [], 'เกินตั้งแต่ส่งใบ ไม่แตะจำนวน = ไม่เตือน (เดิมบล็อกทั้งใบ)')
  assertDeep(increasedOver(o, [{ ...o[0], requested_qty: 7000 }, o[1]], inv, {}, keyOf), [], 'ลดลงแต่ยังเกิน = ไม่เตือน')
  const w = increasedOver(o, [{ ...o[0], requested_qty: 9000 }, o[1]], inv, {}, keyOf)
  assertDeep(w.map(x => [x.key, x.own, x.available, x.name, x.unit]), [['a', 9000, 5000, 'Para', 'เม็ด']], 'เพิ่มจำนวนจนเกิน = เตือน')
  assertDeep(increasedOver(o, [o[0], { ...o[1], requested_qty: 200 }], inv, { b: 150 }, keyOf).map(x => x.available), [150], 'หักยอดจองใบอื่น')
  assertDeep(increasedOver(o, [o[0], { ...o[1], requested_qty: 300 }], inv, {}, keyOf), [], 'เพิ่มเท่าคงเหลือพอดี = ไม่เตือน')
}

// ---- packView ----
assertDeep(packView(8000, 1000), { qty: 8, pack: 1000 }, 'Para 8000 → 8 × 1000เม็ด')
assertDeep(packView(2500, 1000), { qty: 2500, pack: 1 }, 'หารไม่ลงตัว → หน่วยย่อย')
assertDeep(packView(30, 1), { qty: 30, pack: 1 }, 'ไม่มีขนาด')
assertDeep(packView(0, 500), { qty: 0, pack: 500 }, '0 คงหน่วยคีย์')
assertDeep(packView('', 500), { qty: 0, pack: 500 }, 'ค่าว่าง = 0')

if (fails.length) console.log(fails.join('\n'))
console.log(`\n${fail ? '✗' : '✓'} ผ่าน ${pass} / ${pass + fail}`)
if (fail) process.exit(1)
