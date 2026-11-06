// formularyChange.test.js — Golden tests สำหรับ src/lib/formularyChange.js
// รัน: node src/lib/formularyChange.test.js  (npm run test:formulary)
// ครอบ: ยาเข้าใหม่ (ไม่เคยรับก่อนช่วง · ตัดรหัสที่เบิกก่อนรับ · ชนิดการรับ · ช่วง 30/90) /
//       มติ PTC ที่ยังรอของ / ข้อความไลน์ / ตัดออก (มีของ · มติรองรับ · มติแต่ยังไม่ตั้งธง) / ฟอร์มทะเบียน

import {
  buildNewDrugs, countReceivedNew, buildNewDrugLine, buildFormularyOut, sortRegistry,
  validateFormularyEntry, normalizeFormularyEntry, windowFromYmd, ptcByCode, receiveSummary,
} from './formularyChange.js'

let pass = 0, fail = 0
const fails = []
function assertEq(actual, expected, label) {
  if (actual === expected) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`)
}
const assertDeep = (a, e, l) => assertEq(JSON.stringify(a), JSON.stringify(e), l)
const section = (n) => console.log(`\n=== ${n} ===`)
const codes = (list) => list.map(d => d.code || d.name)

const today = '2026-11-06'
const R = (id, drug_code, receive_date, extra = {}) => ({
  id, drug_code, drug_name: `Drug ${drug_code}`, receive_date, purchase_type: 'การซื้อ',
  receive_status: 'ตรวจรับแล้ว', qty_received: 10, drug_unit: 'ขวด', ...extra,
})

section('ช่วงวัน')
{
  assertEq(windowFromYmd(today, 30), '2026-10-08', '30 วันล่าสุด นับวันนี้เป็นวันแรก')
  assertEq(windowFromYmd(today, 90), '2026-08-09', '90 วัน')
}

section('ยาเข้าใหม่ — คำนวณจากการรับครั้งแรก')
{
  const windowRows = [
    R(1, 'NEW1', '2026-11-02', { receive_status: 'รอตรวจรับ', qty_received: 5 }),
    R(2, 'NEW1', '2026-11-03', { qty_received: 20 }),
    R(3, 'NEW1', '2026-11-04', { qty_received: 4 }),
    R(4, 'OLD', '2026-11-01'),                                         // เคยรับก่อนช่วง
    R(5, 'S018', '2026-10-20'),                                        // เบิกก่อนรับครั้งแรก = ของยกยอด
    R(6, 'SUP', '2026-10-15', { purchase_type: 'การสนับสนุน' }),
    R(7, 'BORROW', '2026-10-15', { purchase_type: 'การยืม', receive_status: 'รับจากการยืม' }),  // ยืมมาไม่ใช่ยาเข้าใหม่
    R(8, 'MID', '2026-09-01'),                                         // อยู่ใน 90 วัน แต่ไม่อยู่ใน 30
    R(9, 'EDGE', '2026-10-08'),                                        // วันแรกของ 30 วันพอดี
    R(10, 'FUT', '2026-11-07'),                                        // อนาคต (พิมพ์ผิด) ไม่นับ
    R(11, '-', '2026-11-01'),                                          // รหัสว่าง
    R(12, 'RET1', '2026-10-10', { purchase_type: 'การคืน', receive_status: 'รับจากการคืน' }),
    R(13, 'RET1', '2026-10-20'),                                       // รับคืนก่อนซื้อ → firstAny = 10/10 แต่ยังเป็นรหัสใหม่
  ]
  const priorCodes = new Set(['OLD'])
  const firstDispense = new Map([['S018', '2025-11-18'], ['NEW1', '2026-11-05']])
  const p = { windowRows, priorCodes, firstDispense, ptcEntries: [], today }

  const d30 = buildNewDrugs({ ...p, days: 30 })
  assertDeep(codes(d30), ['NEW1', 'RET1', 'SUP', 'EDGE'], '30 วัน: ตัดเคยรับก่อน/เบิกก่อนรับ/ยืม/อนาคต/รหัสว่าง · เรียงรับครั้งแรกล่าสุดก่อน')
  const n1 = d30[0]
  assertEq(n1.firstReceive, '2026-11-02', 'รับครั้งแรก = แถวเก่าสุด')
  assertEq(n1.inspectedQty, 24, 'ตรวจรับแล้วรวมทุกบิล')
  assertEq(n1.pendingQty, 5, 'รอตรวจรับแยก')
  assertEq(n1.status, 'inspected', 'มีของตรวจรับแล้ว')
  assertDeep(n1.rows.map(r => r.id), [3, 2, 1], 'แถวรับเรียงใหม่→เก่า')
  assertEq(d30.find(d => d.code === 'SUP').types[0], 'การสนับสนุน', 'ยาสนับสนุนรหัสใหม่นับเป็นยาเข้าใหม่ แสดงที่มา')

  const d90 = buildNewDrugs({ ...p, days: 90 })
  assertEq(d90.length, 5, '90 วันเพิ่ม MID')
  assertEq(countReceivedNew(d30), 4, 'นับในคิว = ยาที่ของเข้าแล้ว')

  const pendingOnly = buildNewDrugs({ ...p, windowRows: [R(1, 'P', '2026-11-01', { receive_status: 'รอตรวจรับ' })] })
  assertEq(pendingOnly[0].status, 'pending', 'รอตรวจรับทั้งหมด')
}

section('มติ PTC เข้าบัญชี — ผูกกับยาที่รับ + รอของ')
{
  const ptc = [
    { id: 1, change_type: 'in', drug_code: 'NEW1', drug_name: 'New one', ptc_date: '2026-10-09' },
    { id: 2, change_type: 'in', drug_code: null, drug_name: 'Levetiracetam inj', ptc_date: '2026-10-09' },
    { id: 3, change_type: 'in', drug_code: 'NOSTOCK', drug_name: 'Vanco', ptc_date: '2026-10-09' },
    { id: 4, change_type: 'in', drug_code: '86', drug_name: 'Phenytoin Infatab', ptc_date: '2026-10-09' },   // รหัสเดิมเคยรับแล้ว
    { id: 5, change_type: 'out', drug_code: 'X', drug_name: 'Out', ptc_date: '2026-10-09' },
    { id: 6, change_type: 'in', drug_code: 'NEW1', drug_name: 'New one (ซ้ำ)', ptc_date: '2026-11-01' },
  ]
  const list = buildNewDrugs({ windowRows: [R(1, 'NEW1', '2026-11-03')], priorCodes: new Set(['86']), ptcEntries: ptc, today })
  assertDeep(codes(list), ['NEW1', 'Levetiracetam inj', 'NOSTOCK'], 'รับแล้วก่อน · ตามด้วยมติที่ยังรอของ (เรียงชื่อ) · รหัสเดิมที่เคยรับไม่ขึ้น')
  assertEq(list[0].ptc.id, 6, 'มติหลายครั้ง = ล่าสุด')
  assertEq(list[1].status, 'noCode', 'ยังไม่มีรหัส')
  assertEq(list[2].status, 'noStock', 'มีรหัสแต่ยังไม่เคยรับ')
  assertEq(countReceivedNew(list), 1, 'มติรอของไม่นับในคิว')
  assertEq(ptcByCode(ptc, 'out').get('X').id, 5, 'ptcByCode แยกประเภท')
}

section('ข้อความไลน์ — เฉพาะที่ตรวจรับแล้ว')
{
  const list = buildNewDrugs({
    windowRows: [
      R(1, 'B', '2026-11-03', { drug_name: 'Beta', qty_received: 1200, drug_unit: '500เม็ด' }),
      R(2, 'A', '2026-11-03', { drug_name: 'Alpha', purchase_type: 'การสนับสนุน' }),
      R(3, 'C', '2026-11-03', { drug_name: 'Gamma', receive_status: 'รอตรวจรับ' }),
    ],
    ptcEntries: [{ id: 1, change_type: 'in', drug_code: 'B', drug_name: 'Beta', ptc_date: '2026-10-09' }],
    today,
  })
  assertEq(buildNewDrugLine(list, { today, days: 30 }),
    'แจ้งจากคลังยา :\nยาใหม่ในคลัง เบิกได้แล้ว (รับเข้า 08/10/2569 – 06/11/2569)\n- Alpha 10 x ขวด (ยาสนับสนุน)\n- Beta 1,200 x 500เม็ด (เข้าบัญชีตามมติ PTC 09/10/2569)',
    'เรียงชื่อ · ป้ายที่มา + มติ · ตัดรอตรวจรับ')
  assertEq(buildNewDrugLine(list.filter(d => d.code === 'C'), { today }), '', 'ไม่มีที่ตรวจรับแล้ว = ข้อความว่าง')
}

section('ยาตัดออกจากบัญชี')
{
  const discontinued = [
    { code: 'A', name: 'Alpha', rows: [{ qty: '30', unit: 'เม็ด' }, { qty: '2', unit: '10เม็ด' }, { qty: '0', unit: 'เม็ด' }] },
    { code: 'B', name: 'Beta', rows: [{ qty: '0', unit: 'ขวด' }] },
    { code: 'C', name: 'Gamma', rows: [{ qty: '5', unit: 'ขวด' }] },
  ]
  const ptc = [
    { id: 1, change_type: 'out', drug_code: 'A', drug_name: 'Alpha', ptc_date: '2026-10-09' },
    { id: 2, change_type: 'out', drug_code: 'Z', drug_name: 'Zeta', ptc_date: '2026-10-09' },     // มติแต่ Master ยังไม่ตั้งธง
  ]
  const def = buildFormularyOut({ discontinued, ptcEntries: ptc })
  assertDeep(codes(def), ['Z', 'A', 'C'], 'ตั้งต้น: มติที่ยังไม่ตั้งธงก่อน · เฉพาะที่มีของ เรียงยอดมาก→น้อย')
  const a = def.find(d => d.code === 'A')
  assertEq(a.total, 50, 'ยอดรวมแปลงหน่วย (30 เม็ด + 2×10เม็ด) — ไม่รวมดิบ')
  assertEq(a.lots, 2, 'นับเฉพาะแถวที่มีของ')
  assertEq(a.ptc.id, 1, 'ผูกมติ')
  assertEq(def.find(d => d.code === 'C').ptc, null, 'ไม่พบมติในทะเบียน')
  assertEq(def.find(d => d.code === 'Z').notFlagged, true, 'มติแต่ยังไม่ตั้งธง')
  assertEq(buildFormularyOut({ discontinued, ptcEntries: ptc, onlyWithStock: false }).length, 4, 'สลับดูทั้งหมด รวมที่หมดแล้ว')
}

section('คอลัมน์โมดอล — วันที่รับ · บริษัท · ราคา · คงเหลือ')
{
  const s = receiveSummary([
    { id: 1, receive_date: '2026-10-10', supplier_current: 'เก่า', price_per_unit: 20, drug_unit: 'ขวด' },
    { id: 3, receive_date: '2026-11-03', supplier_current: 'ใหม่', price_per_unit: 0, drug_unit: 'ขวด' },
    { id: 2, receive_date: '2026-11-03', supplier_current: 'กลาง', price_per_unit: 25.68, drug_unit: 'กล่อง' },
  ])
  assertDeep([s.firstReceive, s.lastReceive], ['2026-10-10', '2026-11-03'], 'วันรับแรก/ล่าสุด')
  assertEq(s.supplier, 'ใหม่', 'บริษัทของแถวรับล่าสุด (วันเท่ากัน id มากก่อน)')
  assertDeep([s.price, s.priceUnit], [25.68, 'กล่อง'], 'ราคา 0 ข้ามไปแถวถัดไปที่มีราคา + หน่วยของราคา')
  assertDeep(receiveSummary([]), { firstReceive: null, lastReceive: null, supplier: '', price: null, priceUnit: '' }, 'ไม่มีแถวรับ')

  const list = buildNewDrugs({
    windowRows: [R(1, 'N', '2026-11-01', { supplier_current: 'ซิลลิค', price_per_unit: 25.68, drug_unit: '10เม็ด' }),
                 R(2, 'N', '2026-11-04', { supplier_current: 'ซิลลิค', price_per_unit: 26 , drug_unit: '10เม็ด' })],
    stockByCode: new Map([['N', [{ qty: '3', unit: '10เม็ด' }, { qty: '10', unit: 'เม็ด' }]]]),
    ptcEntries: [{ id: 9, change_type: 'in', drug_name: 'รอของ', ptc_date: '2026-10-09' }],
    today,
  })
  const n = list.find(d => d.code === 'N')
  assertDeep([n.firstReceive, n.lastReceive, n.supplier, n.price, n.total], ['2026-11-01', '2026-11-04', 'ซิลลิค', 26, 4],
    'ยาเข้าใหม่: วันรับแรก/ล่าสุด · ราคาล่าสุด · คงเหลือแปลงหน่วยของแถวรับล่าสุด (30+10 เม็ด = 4 x 10เม็ด)')
  assertEq(buildNewDrugs({ windowRows: [R(1, 'N', '2026-11-01')], today })[0].total, 0, 'ไม่มีแถวคงเหลือ = 0')
  assertEq(list.find(d => d.name === 'รอของ').total, null, 'มติรอของ = ไม่มียอด (แสดง -)')

  const out = buildFormularyOut({
    discontinued: [{ code: 'A', name: 'Alpha', rows: [{ qty: '5', unit: 'ขวด' }] }],
    receiveByCode: new Map([['A', [{ id: 1, receive_date: '2025-01-02', supplier_current: 'ก', price_per_unit: 12, drug_unit: 'ขวด' }]]]),
  })
  assertDeep([out[0].lastReceive, out[0].supplier, out[0].price, out[0].priceUnit], ['2025-01-02', 'ก', 12, 'ขวด'], 'ตัดออก: ข้อมูลรับจาก receiveByCode')
  assertEq(buildFormularyOut({ discontinued: [{ code: 'A', name: 'Alpha', rows: [{ qty: '5', unit: 'ขวด' }] }] })[0].supplier, '', 'ไม่มีประวัติรับ = ว่าง')
}

section('ทะเบียน + ฟอร์ม')
{
  const sorted = sortRegistry([
    { change_type: 'out', drug_name: 'B', ptc_date: '2026-10-09' },
    { change_type: 'in', drug_name: 'C', ptc_date: '2026-10-09' },
    { change_type: 'in', drug_name: 'A', ptc_date: '2025-06-01' },
    { change_type: 'out', drug_name: 'A', ptc_date: '2026-10-09' },
  ])
  assertDeep(sorted.map(e => `${e.change_type}${e.drug_name}`), ['inC', 'outA', 'outB', 'inA'], 'มติล่าสุดก่อน → เข้าก่อนออก → ชื่อ')

  const ok = { change_type: 'in', drug_name: 'Vanco', ptc_date: '2026-10-09' }
  assertEq(validateFormularyEntry(ok), null, 'ยาเข้าไม่มีรหัสได้')
  assertEq(validateFormularyEntry({ ...ok, change_type: '' }), 'เลือกประเภทมติ (เข้าบัญชี / ตัดออก)', 'ต้องเลือกประเภท')
  assertEq(validateFormularyEntry({ ...ok, drug_name: '  ' }), 'กรอกชื่อยาตามเอกสารมติ', 'ต้องมีชื่อ')
  assertEq(validateFormularyEntry({ ...ok, ptc_date: '' }), 'เลือกวันที่ประชุม PTC', 'ต้องมีวันที่')
  assertEq(validateFormularyEntry({ ...ok, change_type: 'out', drug_code: '-' }), 'ยาตัดออกต้องมีรหัสยา (ยาที่มีในคลัง)', 'ตัดออกต้องมีรหัส')
  assertDeep(normalizeFormularyEntry({ change_type: 'in', drug_code: ' - ', drug_name: ' Vanco ', ptc_date: '2026-10-09', ptc_ref: ' ', note: ' PO 1 ' }),
    { change_type: 'in', drug_code: null, drug_name: 'Vanco', ptc_date: '2026-10-09', ptc_ref: null, note: 'PO 1' }, 'normalize: trim · ว่างเป็น null')
}

console.log('\n' + '─'.repeat(50))
if (fail) { console.log(fails.join('\n')); console.log(`✗ ไม่ผ่าน ${fail} / ${pass + fail} assertions`); process.exit(1) }
console.log(`✓ ผ่านทั้งหมด ${pass} assertions`)
