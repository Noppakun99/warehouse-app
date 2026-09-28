// Golden tests — src/lib/excelSync.js (ปุ่ม "นำเข้าจาก Excel": ส่วนต่าง + ด่านตรวจ)
// รัน: npm run test:excelsync
// เคสจากการตรวจไฟล์จริง 2026-09-28: ราคา 13 ตำแหน่ง vs DB 4 ตำแหน่ง, สถานะตรวจรับ 15 lot ค้างเก่า,
// Adenosine 2F24005 มี 2 แถวคนละบิล (แถวซ้ำ code+lot จริง)

import XLSX from 'xlsx'
import {
  flattenInventory, backfillDrugUnit, normValue, fingerprint, diffRows, summarizeChangedFields,
  checkFileOlderThanImport, findReceiveStatusConflicts, checkReceiveStatusConflicts, checkAppOnlyDispense,
  readWorkbookGrids, buildSyncPlan, INVENTORY_SPEC, DISPENSE_SPEC,
  backfillSwapPolicy, readReceiveWorkbookGrids, buildReceivePlan, combinePlans, RECEIVE_SPEC,
} from './excelSync.js'
import { serialToThai } from './excelSerial.js'

let pass = 0, fail = 0
const eq = (got, want, label) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++ } else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`) }
}
const section = (t) => console.log(`\n=== ${t} ===`)

const inv = (o = {}) => ({
  location: 'C-4-4', code: '1540029', name: 'Adenosine 6mg/2ml', type: 'Injection', unit: 'amp',
  lot: '2F24005', exp: '31/10/2027', qty: '10', invoice: 'IV6870281', main_log: 'C', item_type: 'ยกยอด',
  receive_status: 'ตรวจรับแล้ว|คงไว้', safety_stock: 13, ...o,
})
const disp = (o = {}) => ({
  dispense_date: '2026-09-28', main_log: 'C', detail_log: 'C-4-4', department: 'ห้องยาG', note: null,
  drug_code: '1540029', drug_name: 'Adenosine 6mg/2ml', drug_type: 'Injection', item_type: 'ยกยอด',
  drug_unit: 'amp', price_per_unit: 300, lot: '2F24005', exp: '31/10/2027', near_exp_date: null,
  qty_before: 10, qty_out: 10, qty_after: 0, source: 'csv', ...o,
})

// ── serialToThai (ย้ายจาก scripts/_shared.mjs) ──────────────────────
section('serialToThai')
eq(serialToThai(46202.58), '29/06/2026', 'เศษ = เวลา ต้อง floor ไม่ round')
eq(serialToThai(244980), '23/09/2027', 'ปี พ.ศ. ในช่องวันที่ → ค.ศ.')
eq(serialToThai(80110), null, 'ปี 2119 = ค่าเสีย → null')
eq(serialToThai('46202'), null, 'ข้อความ → null')

// ── flattenInventory — ต้องเท่ากับที่ saveInventory เขียน ────────────
section('flattenInventory')
const flat = flattenInventory({
  'C-4-4': [{ code: '1540029', name: 'Adenosine', lot: '2F24005', qty: '10', invoice: 'IV1', mainLog: 'C', itemType: 'ยกยอด', receiveStatus: 'ตรวจรับแล้ว', safetyStock: 13 }],
  'E-10': [{ name: 'Aspirin' }],
})
eq(flat.length, 2, '2 ที่เก็บ → 2 แถว')
eq(flat[0], { location: 'C-4-4', code: '1540029', name: 'Adenosine', type: '-', unit: '-', lot: '2F24005', exp: '-', qty: '10', invoice: 'IV1', main_log: 'C', item_type: 'ยกยอด', receive_status: 'ตรวจรับแล้ว', safety_stock: 13 }, 'map ฟิลด์ครบ + ค่าว่างเป็น -')
eq([flat[1].code, flat[1].qty, flat[1].receive_status, flat[1].safety_stock, flat[1].main_log], ['-', '0', 'ไม่มีการดำเนินการ', null, null], 'ค่า default')
eq('updated_at' in flat[0], false, 'ไม่ใส่ updated_at (db.js เติมเอง — ไม่งั้นส่วนต่างไม่มีวันเป็น 0)')

// ── backfillDrugUnit ───────────────────────────────────────────────
section('backfillDrugUnit')
const bf = backfillDrugUnit([{ drug_code: 'A', drug_unit: 'amp' }, { drug_code: 'A', drug_unit: '-' }, { drug_code: 'B', drug_unit: null }, { drug_code: '-', drug_unit: null }])
eq(bf.map(r => r.drug_unit), ['amp', 'amp', null, null], 'เติมจากรหัสเดียวกัน · ไม่มีต้นแบบ = คงเดิม')

// ── normValue ──────────────────────────────────────────────────────
section('normValue')
eq(normValue(65.9976666666666, 'num'), normValue('65.9977', 'num'), 'ราคา 13 ตำแหน่ง = 4 ตำแหน่งใน DB')
eq(normValue('1,200', 'num'), '1200', 'ตัด comma')
eq(normValue(null, 'num'), normValue('', 'num'), 'null = ว่าง')
eq(normValue('10', 'num'), normValue(10, 'num'), 'qty text vs number')
eq(normValue('2026-09-28T00:00:00', 'date'), '2026-09-28', 'date ตัดเวลา')
eq(normValue(null), normValue(''), 'null = ว่าง (ข้อความ)')
eq(normValue(' 26E266 '), '26E266', 'lot ไม่ถูกแปลงเป็นเลข')

// ── diffRows ───────────────────────────────────────────────────────
section('diffRows — ไม่มีอะไรเปลี่ยน')
let d = diffRows([inv(), inv({ invoice: 'IV2' })], [inv({ invoice: 'IV2' }), inv()], INVENTORY_SPEC)
eq([d.unchanged, d.added.length, d.removed.length, d.changed.length], [2, 0, 0, 0], 'ลำดับไม่มีผล')
d = diffRows([disp({ price_per_unit: 65.9976666666666 })], [disp({ price_per_unit: '65.9977' })], DISPENSE_SPEC)
eq(d.unchanged, 1, 'ราคาต่างแค่ทศนิยม = ไม่เปลี่ยน (เคสจริง 17 แถว)')
d = diffRows([disp({ dispense_date: '2026-09-28' })], [disp({ dispense_date: '2026-09-28T00:00:00+00:00' })], DISPENSE_SPEC)
eq(d.unchanged, 1, 'วันที่จาก DB มีเวลาติดมา = ไม่เปลี่ยน')

section('diffRows — แถวซ้ำจริง (multiset)')
d = diffRows([inv(), inv(), inv()], [inv(), inv()], INVENTORY_SPEC)
eq([d.unchanged, d.added.length, d.removed.length], [2, 1, 0], 'ไฟล์มี 3 แถวเหมือนกัน DB มี 2 → เพิ่ม 1 (ห้าม dedupe)')
d = diffRows([inv()], [inv(), inv()], INVENTORY_SPEC)
eq([d.unchanged, d.removed.length], [1, 1], 'DB มีเกิน 1 แถว → ลบ 1')

section('diffRows — แก้ค่า (จับคู่ด้วยตัวตนกองยา)')
d = diffRows(
  [inv({ receive_status: 'รอตรวจรับ|คงไว้' }), inv({ invoice: 'IV2', qty: '0', safety_stock: 26 })],
  [inv(), inv({ invoice: 'IV2' })], INVENTORY_SPEC)
eq([d.unchanged, d.added.length, d.removed.length, d.changed.length], [0, 0, 0, 2], 'ค่าเปลี่ยน = changed ไม่ใช่ ลบ+เพิ่ม')
const byInv = Object.fromEntries(d.changed.map(c => [c.next.invoice, c.fields]))
eq(byInv.IV6870281, [{ field: 'receive_status', label: 'สถานะตรวจรับ', from: 'ตรวจรับแล้ว|คงไว้', to: 'รอตรวจรับ|คงไว้' }], 'บอกรายช่อง: สถานะ')
eq(byInv.IV2.map(f => [f.field, f.from, f.to]), [['qty', '10', '0'], ['safety_stock', '13', '26']], 'บอกรายช่อง: คงเหลือ + SS')
eq(summarizeChangedFields(d.changed).map(f => `${f.field}:${f.count}`).sort(), ['qty:1', 'receive_status:1', 'safety_stock:1'], 'สรุปรายช่อง')
const stChange = d.changed.find(c => c.fields.some(f => f.field === 'receive_status'))
eq(summarizeChangedFields([...d.changed, stChange])[0].field, 'receive_status', 'เรียงช่องที่เปลี่ยนมากสุดก่อน')

section('diffRows — เพิ่ม/ลบ')
d = diffRows([inv({ lot: 'NEW1' })], [inv({ lot: 'OLD1' })], INVENTORY_SPEC)
eq([d.added.length, d.removed.length, d.changed.length], [1, 1, 0], 'แก้ lot = เปลี่ยนตัวตน → ลบ+เพิ่ม')
d = diffRows([disp(), disp({ lot: '2F25005' })], [disp()], DISPENSE_SPEC)
eq([d.unchanged, d.added.length, d.added[0]?.lot], [1, 1, '2F25005'], 'เบิกเพิ่ม 1 แถว')
d = diffRows([], [disp()], DISPENSE_SPEC)
eq(d.removed.length, 1, 'แถวหายจากไฟล์ = ลบ')
eq(fingerprint(disp(), DISPENSE_SPEC).split('|').length, DISPENSE_SPEC.fields.length, 'fingerprint ครบทุกช่อง')

// ── ด่านตรวจ ───────────────────────────────────────────────────────
section('checkFileOlderThanImport')
const last = { at: '2026-09-24T09:00:24Z', user: 'PRH0000484 (CLI)' }
eq(checkFileOlderThanImport(Date.parse('2026-09-24T08:41:20Z'), last)?.code, 'file_older_than_import', 'ไฟล์ 15:41 < นำเข้า 16:00 → บล็อก')
eq(checkFileOlderThanImport(Date.parse('2026-09-24T08:41:20Z'), last)?.overridable, true, 'ข้ามได้ถ้าคนยืนยัน')
eq(checkFileOlderThanImport(Date.parse('2026-09-28T06:10:30Z'), last), null, 'ไฟล์ใหม่กว่า → ผ่าน')
eq(checkFileOlderThanImport(Date.parse('2026-09-24T08:41:20Z'), null), null, 'ไม่เคยนำเข้า → ผ่าน')
eq(checkFileOlderThanImport(0, last), null, 'ไม่รู้เวลาไฟล์ → ไม่เดา')
eq(checkFileOlderThanImport(Date.parse('2026-09-24T08:41:20Z'), last).message.includes('PRH0000484'), true, 'บอกว่าใครนำเข้าล่าสุด')

section('findReceiveStatusConflicts')
const rcv = [
  { drug_code: '1000249', lot: 'F690523', bill_number: '3001261994', receive_status: 'ตรวจรับแล้ว' },
  { drug_code: '1540029', lot: '2F24005', bill_number: 'IV6866385', receive_status: 'ตรวจรับแล้ว' },
  { drug_code: '1000055', lot: 'T685013', bill_number: '3001264410', receive_status: 'รอตรวจรับ' },
]
const invRows = [
  inv({ code: '1000249', lot: 'F690523', invoice: '3001261994', receive_status: 'รอตรวจรับ|คงไว้' }),
  inv({ code: '1540029', lot: '2F24005', invoice: 'IV6859433 ,IV6866385', receive_status: 'รอตรวจรับ' }),
  inv({ code: '1000055', lot: 'T685013', invoice: '3001264410', receive_status: 'รอตรวจรับ|คงไว้' }),
  inv({ code: '1000249', lot: 'F690523', invoice: '3001261994', receive_status: 'ตรวจรับแล้ว|คงไว้' }),
  inv({ code: '9999999', lot: 'F690523', invoice: '3001261994', receive_status: 'รอตรวจรับ' }),
]
const cf = findReceiveStatusConflicts(invRows, rcv)
eq(cf.map(r => r.code), ['1000249', '1540029'], 'เจอ: สถานะมี |ผลพิจารณา · บิลหลายใบคั่น comma')
eq(checkReceiveStatusConflicts(cf)?.code, 'receive_status_conflict', 'มีขัดกัน → บล็อก')
eq(checkReceiveStatusConflicts([]), null, 'ไม่มี → ผ่าน')

section('checkAppOnlyDispense')
eq(checkAppOnlyDispense(0), null, 'ทุกแถวมาจากไฟล์ → ผ่าน')
eq([checkAppOnlyDispense(3)?.code, checkAppOnlyDispense(3)?.overridable], ['app_only_dispense', false], 'มีแถวจากแอป → บล็อกห้ามข้าม')

// ── readWorkbookGrids + buildSyncPlan (workbook สังเคราะห์ ผ่าน SheetJS จริง) ─
section('readWorkbookGrids')
const MH = ['ผลการพิจารณา', 'สถานะตรวจรับ', 'MainLog', 'DetailedLog', 'รหัสHosxp', 'ชนิด', 'รายการยา', 'หน่วย', 'ราคา/หน่วย', 'Lot Number', 'Exp', 'ชนิดรายการ', 'เลขที่บิลซื้อ', 'คงเหลือหลังจ่าย', 'Safety Stock', 'มูลค่าคงเหลือ(บาท)']
const mRow = (lot, qty, status = 'ตรวจรับแล้ว', bill = 'IV6870281') => ['คงไว้', status, 'C', 'C-4-4', 1540029, 'Injection', 'Adenosine 6mg/2ml', 'amp', 300, lot, 46691, 'ยกยอด', bill, qty, 13, 9999]
const DH = ['', 'วันที่เบิก', 'MainLog', 'DetailedLog', 'รหัส', 'ชนิด', 'รายการยา', 'หน่วย', 'ราคา/หน่วย', 'Lot Number', 'Exp', 'ชนิดรายการ', 'คงเหลือก่อนเบิก', 'ปริมาณ (ออก)', 'คงเหลือหลังจ่าย', 'หน่วยงานที่เบิก', 'หมายเหตุ']
const dRow = (serial, lot, out) => ['', serial, 'C', 'C-4-4', 1540029, 'Injection', 'Adenosine 6mg/2ml', 'amp', 300, lot, 46691, 'ยกยอด', 10, out, 10 - out, 'ห้องยาG', '']
const mkBook = (sheets) => {
  const wb = XLSX.utils.book_new()
  Object.entries(sheets).forEach(([n, aoa]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n))
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}
// ชีทเบิกจริง: บล็อกจดลอยแถว 1–3 (มีคำว่า Lot Number/Exp) หัวตารางแถว 6
const dispGrid = [['', '', '', '', '', '', '', '', '', '', 'ยาจด'], ['', '', '', '', '', '', '', '', '', '', 'Lot Number', 'Exp'], [], [], [], DH,
  dRow(46293.6, '2F24005', 10), dRow(46293, '2F25005', 10)]
const buf = mkBook({ Master: [MH, mRow('2F24005', 0), mRow('2F25005', 0, 'ตรวจรับแล้ว', 'IV6926464')], 'เบิก ': dispGrid, 'อื่นๆ': [['x']] })
const grids = readWorkbookGrids(XLSX, buf)
eq([grids.masterGrid.length, grids.dispenseGrid.length], [3, 8], 'อ่านเฉพาะ 2 ชีท ค่าดิบ')
eq(grids.dispenseGrid[6][1], 46293.6, 'วันที่ยังเป็น serial ดิบ')
let threw = null
try { readWorkbookGrids(XLSX, mkBook({ Master: [MH], 'เบิก': [DH] })) } catch (e) { threw = e.message }
eq(threw?.includes('เว้นวรรคต่อท้าย'), true, 'ชีท "เบิก" ไม่มีวรรคท้าย → บอกสาเหตุ')

section('buildSyncPlan')
const base = {
  ...grids, today: '2026-09-28',
  prevInventory: [inv({ qty: '10' }), inv({ lot: '2F25005', qty: '10', invoice: 'IV6926464' })],
  prevDispense: [],
  receiveRows: [], lastImport: last, fileModifiedMs: Date.parse('2026-09-28T06:10:30Z'), appOnlyDispenseCount: 0,
}
// prevDispense ต้องมีแถวพอไม่ให้ shrink/stale ยิง — ใส่แถวเก่า 1 แถว
base.prevDispense = [disp({ dispense_date: '2026-09-24', qty_before: 20, qty_out: 5, qty_after: 15 })]
let plan = buildSyncPlan(base)
eq(plan.inventory.rows[0].exp, '31/10/2027', 'exp serial → DD/MM/YYYY')
eq(plan.inventory.rows[0].receive_status, 'ตรวจรับแล้ว|คงไว้', 'สถานะ|ผลพิจารณา')
eq([plan.inventory.diff.changed.length, plan.inventory.changedFields.map(f => f.label)], [2, ['คงเหลือ']], 'คงเหลือ 10→0 สองแถว = แก้ค่า')
eq(plan.dispense.rows.map(r => r.dispense_date), ['2026-09-28', '2026-09-28'], 'serial มีเวลา (.6) ต้องไม่เลื่อนเป็นวันถัดไป')
eq([plan.dispense.diff.added.length, plan.dispense.diff.removed.length], [2, 1], 'เบิกใหม่ 2 แถว + แถวเก่าที่ไม่มีในไฟล์')
eq([plan.ok, plan.hasChanges, plan.dispense.lastDate], [true, true, '2026-09-28'], 'ผ่านด่าน + มีส่วนต่าง')

plan = buildSyncPlan({ ...base, fileModifiedMs: Date.parse('2026-09-24T08:41:20Z') })
eq([plan.ok, plan.canOverride, plan.blockers.map(b => b.code)], [false, true, ['file_older_than_import']], 'ไฟล์เก่ากว่าการนำเข้า → บล็อก ข้ามได้')

plan = buildSyncPlan({ ...base, masterGrid: [MH, mRow('2F24005', 0, 'รอตรวจรับ'), mRow('2F25005', 0, 'ตรวจรับแล้ว', 'IV6926464')], receiveRows: [{ drug_code: '1540029', lot: '2F24005', bill_number: 'IV6870281', receive_status: 'ตรวจรับแล้ว' }] })
eq([plan.ok, plan.conflicts.length, plan.blockers.map(b => b.code)], [false, 1, ['receive_status_conflict']], 'สถานะ Master ค้างเก่า → บล็อก (เคสจริง 15 lot)')

plan = buildSyncPlan({ ...base, appOnlyDispenseCount: 2 })
eq([plan.ok, plan.canOverride], [false, false], 'มีแถวเบิกจากแอป → บล็อกห้ามข้าม')

plan = buildSyncPlan({ ...base, prevDispense: [disp({ dispense_date: '2026-09-30' })] })
eq(plan.blockers.map(b => [b.code, b.sheet]), [['stale_file', 'เบิก']], 'ชีทเบิกเก่ากว่า DB → บล็อกทั้งไฟล์')

plan = buildSyncPlan({ ...base, prevInventory: Array.from({ length: 10 }, (_, i) => inv({ lot: `L${i}` })) })
eq(plan.blockers.map(b => [b.code, b.sheet]), [['shrink', 'Master']], 'Master หด 80% → บล็อก')

// ไฟล์ที่ไม่ได้แก้อะไร → ไม่มีส่วนต่าง (ต้องเป็นจริงไม่งั้นทุกรอบจะโชว์ว่าเปลี่ยน)
const same = buildSyncPlan(base)
plan = buildSyncPlan({ ...base, prevInventory: same.inventory.rows.map(r => ({ ...r })), prevDispense: same.dispense.rows.map(r => ({ ...r, price_per_unit: String(r.price_per_unit) })) })
eq([plan.hasChanges, plan.inventory.diff.unchanged, plan.dispense.diff.unchanged], [false, 2, 2], 'ไฟล์เดิม = ไม่มีส่วนต่าง')
// หลังนำเข้าเสร็จ เวลาแก้ไฟล์ < เวลานำเข้าเสมอ — เปิดไฟล์เดิมซ้ำต้องไม่เตือน (เจอตอน /scrutinize 2026-09-28)
const reopened = { ...base, prevInventory: same.inventory.rows.map(r => ({ ...r })), prevDispense: same.dispense.rows.map(r => ({ ...r })), fileModifiedMs: Date.parse('2026-09-28T06:10:30Z'), lastImport: { at: '2026-09-28T06:20:00Z', user: 'Noppakun' } }
plan = buildSyncPlan(reopened)
eq([plan.hasChanges, plan.blockers.map(b => b.code)], [false, []], 'ไฟล์เดิมหลังนำเข้า → ไม่มี blocker')
reopened.prevDispense = reopened.prevDispense.slice(1)
plan = buildSyncPlan(reopened)
eq([plan.hasChanges, plan.blockers.map(b => b.code)], [true, ['file_older_than_import']], 'ไฟล์เก่ากว่าการนำเข้า + มีส่วนต่าง → ยังบล็อก')

// ── ไฟล์ที่ 2: รับยา + รพ.ยืมยา ───────────────────────────────────────
section('normValue money + backfillSwapPolicy')
eq(normValue(1599.9984, 'money'), normValue('1600', 'money'), 'มูลค่า 4 ตำแหน่ง = 2 ตำแหน่งใน DB (เคสจริง 19 แถว)')
eq(normValue(16199.586, 'money'), '16199.59', 'ปัด 2 ตำแหน่ง')
const sp = backfillSwapPolicy([{ drug_code: 'A', drug_swap_policy: null }, { drug_code: 'A', drug_swap_policy: 'ของไฟล์' }, { drug_code: 'B', drug_swap_policy: null }],
  [{ drug_code: 'A', drug_swap_policy: 'ของ DB' }])
eq(sp.map(r => r.drug_swap_policy), ['ของ DB', 'ของไฟล์', null], 'เติมเฉพาะที่ไฟล์ว่าง · ไม่มีใน DB = คงว่าง')

// หัวตารางชีทรับยา (ตำแหน่งตาม COL ใน receiveSheet.js)
const RH = Array(29).fill('')
Object.assign(RH, { 0: 'วันที่สั่ง', 1: 'รหัส', 2: 'ชนิด', 3: 'รายการยา', 4: 'ประเภท', 5: 'Lot', 6: 'Exp', 7: 'เลขที่บิลซื้อ', 8: 'PO',
  9: 'จำนวนที่รับ', 10: 'หน่วย', 11: 'ราคา', 12: 'รวม', 13: 'สูตร', 14: 'วันที่รับ', 15: 'สถานะ', 16: 'วันตรวจ', 17: 'บริษัท' })
const rRow = (bill, lot, total, status = 'ตรวจรับแล้ว') => {
  const r = Array(29).fill('')
  Object.assign(r, { 0: 46270, 1: 1540029, 2: 'Injection', 3: 'Adenosine 6mg/2ml', 4: 'ซื้อ', 5: lot, 6: 46691, 7: bill, 8: 'PO1',
    9: 10, 10: 'amp', 11: 300, 12: total, 14: 46275, 15: status, 17: 'บริษัท ก' })
  return r
}
const LH = ['ลำดับ', 'รพ.ที่ขอยืม', 'เลขที่ใบยืม', 'รพ.ที่ให้ยืม', 'รหัสยา', 'รูปแบบ', 'ชื่อยา', 'Lot', 'Exp',
  'จำนวน', 'หน่วยนับ', 'ราคาต่อหน่วย', 'ราคารวมภาษี', 'วันที่ให้ยืม', 'บริษัทที่ให้ยืม', 'วันที่รับคืนยา', 'เลขที่ใบคืน', 'บริษัทที่รับคืน']
const lRow = [1, 'รพ.คลองหลวง', 'ใบ001', 'รพ.ประชาธิปัตย์', '1590002', 'Tablet', 'ยาทดสอบ', 'L001', 46443, 10, '30เม็ด', 8.8, 88, 45702, 'องค์การฯ', '', '', '']

section('readReceiveWorkbookGrids')
const rbuf = mkBook({ 'รับยา': [RH, rRow('IV6870281', '2F24005', 1599.9984)], 'รพ.ยืมยา': [LH, lRow] })
const rg = readReceiveWorkbookGrids(XLSX, rbuf)
eq([rg.receiveGrid.length, rg.loanGrid.length, Array.isArray(rg.receiveFmtGrid)], [2, 2, true], 'อ่าน 2 ชีท + grid ที่แสดง')
threw = null
try { readReceiveWorkbookGrids(XLSX, mkBook({ Master: [MH], 'เบิก ': [DH] })) } catch (e) { threw = e.message }
eq(threw?.includes('รับยา'), true, 'เลือกไฟล์ยอดคลังผิดช่อง → บอกว่าไม่มีชีทรับยา')

section('buildReceivePlan')
const first = buildReceivePlan({ ...rg, prevReceive: [], prevLoans: [], atRisk: [] })
const rbase = {
  ...rg, atRisk: [], lastImport: null, fileModifiedMs: Date.parse('2026-09-28T06:10:30Z'),
  prevReceive: first.receive.rows.map(r => ({ ...r, total_price_vat: 1600 })),
  prevLoans: first.loan.rows.map((r, i) => ({ ...r, id: i + 1 })),
}
let rp = buildReceivePlan(rbase)
eq(first.receive.rows[0].receive_date, '2026-09-10', 'วันที่รับจาก serial')
eq([rp.hasChanges, rp.receive.diff.unchanged, rp.loan.diff.unchanged.length, rp.blockers.length], [false, 1, 1, 0], 'ไฟล์เดิม (มูลค่าปัดต่างกัน) = ไม่มีส่วนต่าง')
eq(RECEIVE_SPEC.fields.map(f => f[0]).sort(), Object.keys(first.receive.rows[0]).sort(), 'RECEIVE_SPEC ครบทุกคอลัมน์ที่ rowToReceiveLog สร้าง')

rp = buildReceivePlan({ ...rbase, atRisk: [{ bill_number: 'SCAN-1', reason: 'บิลสแกน' }] })
eq(rp.blockers.map(b => [b.code, b.overridable]), [['app_only_data', false]], 'บิลที่มีแต่ในแอปจะหาย → บล็อกห้ามข้าม')
rp = buildReceivePlan({ ...rbase, atRisk: [{ bill_number: 'IV6870281', reason: 'เดิน AP แล้ว' }] })
eq(rp.blockers.length, 0, 'บิลยังอยู่ในไฟล์ → ไม่บล็อก (ตรงกับ CLI)')

rp = buildReceivePlan({ ...rbase, prevReceive: [], prevLoans: [] })
eq([rp.receive.diff.added.length, rp.loan.diff.inserts.length, rp.loan.changed, rp.hasChanges], [1, 1, true, true], 'ของใหม่ทั้ง 2 ชีท')
rp = buildReceivePlan({ ...rbase, prevLoans: [...rbase.prevLoans, { ...rbase.prevLoans[0], id: 99, lot: 'OLD' }] })
eq([rp.loan.changed, rp.warnings.map(w => w.code)], [false, ['loan_missing']], 'ยืมยาที่หายจากไฟล์ = เตือน ไม่ลบ')
rp = buildReceivePlan({ ...rbase, prevReceive: rbase.prevReceive.map(r => ({ ...r, qty_received: 99 })), lastImport: { at: '2026-09-28T07:00:00Z' } })
eq(rp.blockers.map(b => b.code), ['file_older_than_import'], 'ไฟล์เก่ากว่าการนำเข้า + มีส่วนต่าง → บล็อก')

section('combinePlans — 2 ไฟล์ในรอบเดียว')
const stockOk = buildSyncPlan({ ...base, prevInventory: same.inventory.rows.map(r => ({ ...r })), prevDispense: same.dispense.rows.map(r => ({ ...r })) })
const recvOk = buildReceivePlan(rbase)
let cp = combinePlans(stockOk, recvOk)
eq([cp.ok, cp.hasChanges], [true, false], 'ทั้ง 2 ไฟล์ตรงกับแอป')
cp = combinePlans(null, buildReceivePlan({ ...rbase, prevLoans: [], atRisk: [{ bill_number: 'SCAN-1', reason: 'บิลสแกน' }] }))
eq([cp.ok, cp.canOverride, cp.blockers[0].file], [false, false, 'รับยา'], 'ด่านของไฟล์รับยาติด → บล็อกทั้งรอบ + บอกว่าไฟล์ไหน')
// Master "รอตรวจรับ" แต่ชีทรับยาที่นำเข้ารอบเดียวกันบอก "ตรวจรับแล้ว" → ต้องเทียบกับไฟล์ ไม่ใช่ DB
const stockConflict = buildSyncPlan({ ...base, masterGrid: [MH, mRow('2F24005', 0, 'รอตรวจรับ'), mRow('2F25005', 0, 'ตรวจรับแล้ว', 'IV6926464')], receiveRows: recvOk.receive.rows })
eq(stockConflict.conflicts.length, 1, 'สถานะขัดกับชีทรับยาในไฟล์ → จับได้')
// ไฟล์ยอดคลังนำเข้าไปแล้ว (ไม่มีส่วนต่าง) แต่สถานะยังขัด → ต้องไม่บล็อกไฟล์รับยาที่มีส่วนต่าง (เจอจริง 2026-09-28)
const stockDoneConflict = { ...stockConflict, hasChanges: false }
cp = combinePlans(stockDoneConflict, buildReceivePlan({ ...rbase, prevLoans: [] }))
eq([cp.ok, cp.warnings.some(w => w.code === 'receive_status_conflict')], [true, true], 'ไฟล์ที่ไม่มีอะไรจะเขียน → ด่านลดเป็นคำเตือน')
cp = combinePlans(stockConflict.hasChanges ? stockConflict : { ...stockConflict, hasChanges: true }, recvOk)
eq(cp.ok, false, 'ไฟล์ที่มีส่วนต่าง → ด่านยังบล็อก')

console.log(`\nผ่าน ${pass} / ${pass + fail}`)
if (fail > 0) throw new Error(`golden test ไม่ผ่าน ${fail} ข้อ`)
