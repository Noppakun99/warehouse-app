// usageReport.test.js — Golden tests หน้า "ค้นยา · สรุปรับ-เบิก"
// รัน: node src/lib/usageReport.test.js  (npm run test:usagereport)
// ครอบ: usageBaseQty/summarizeUsage/receiptsInRange (drugProfile.js) + buildDrugUsageReport · ข้อความไลน์ · Excel 4 ชีท · ใบพิมพ์

import { usageBaseQty, usageMonthsBase, summarizeUsage, receiptsInRange, buildDrugProfile } from './drugProfile.js'
import { buildDrugUsageReport, usageReportLineText, drugCardLineText, CARD_LINE_LOTS, usageReportSheets, usageReportHtml, fmtThaiDate, unitShort, groupReceiptBills } from './usageReport.js'

let pass = 0, fail = 0
const fails = []
function assertEq(actual, expected, label) {
  if (actual === expected) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`)
}
const assertDeep = (a, e, l) => assertEq(JSON.stringify(a), JSON.stringify(e), l)
const section = (n) => console.log(`\n=== ${n} ===`)

section('usageBaseQty — กฎเรทเดียวกับ fetchMonthlyDispenseUsage')
assertEq(usageBaseQty({ qty_out: 2, drug_unit: '1000เม็ด', department: 'ห้องยาG' }), 2000, 'กล่อง 1000 เม็ด × 2 = 2000')
assertEq(usageBaseQty({ qty_out: '1,500', drug_unit: 'เม็ด', department: 'ER' }), 1500, 'ตัวเลขมี comma')
assertEq(usageBaseQty({ qty_out: 5, drug_unit: 'เม็ด', department: 'คืนยา' }), 0, 'หน่วยงาน คืนยา ไม่นับ')
assertEq(usageBaseQty({ qty_out: 5, drug_unit: 'เม็ด', item_type: 'บันทึกเท่านั้น' }), 0, 'บันทึกเท่านั้น ไม่นับ')
assertEq(usageBaseQty({ qty_out: 5, drug_unit: 'เม็ด', department: 'เบิกเพิ่มจากความผิดพลาด' }), 5, 'เบิกเพิ่มจากความผิดพลาด นับ')
assertEq(usageBaseQty({ qty_out: -3, drug_unit: 'เม็ด' }), 0, 'ติดลบ = 0')
assertDeep(usageMonthsBase([
  { dispense_date: '2026-09-02', qty_out: 1, drug_unit: '1000เม็ด' },
  { dispense_date: '2026-09-20', qty_out: 500, drug_unit: 'เม็ด' },
  { dispense_date: '2026-10-01', qty_out: 1, drug_unit: '500เม็ด', department: 'คืนยา' },
]), { '2026-09': 1500 }, 'monthsBase รวมหน่วยปน + ตัดคืนยา')

section('summarizeUsage — หน่วยปน · รายเดือน · รายหน่วยงาน')
const months = ['2026-08', '2026-09', '2026-10']
const disp = [
  { dispense_date: '2026-08-05', department: 'ห้องยาG', qty_out: 2, drug_unit: '1000เม็ด' },
  { dispense_date: '2026-08-20', department: 'ห้องยา G', qty_out: 500, drug_unit: 'เม็ด' },
  { dispense_date: '2026-10-03', department: 'ห้องยาG', qty_out: 2, drug_unit: '500เม็ด' },
  { dispense_date: '2026-10-04', department: 'ER', qty_out: 1, drug_unit: '1000เม็ด' },
  { dispense_date: '2026-10-05', department: 'OPD', qty_out: 1000, drug_unit: 'เม็ด' },
  { dispense_date: '2026-10-06', department: 'คืนยา', qty_out: 9, drug_unit: '1000เม็ด' },
  { dispense_date: '2026-07-31', department: 'ห้องยาG', qty_out: 9, drug_unit: '1000เม็ด' },
]
const u = summarizeUsage({ dispenseRows: disp, mainUnit: '1000เม็ด', months })
assertEq(u.total, 5.5, 'รวม 2 + 0.5 + 1 + 1 + 1 = 5.5 กล่อง (ไม่รวมคืนยา/นอกช่วง)')
assertEq(u.count, 5, 'นับ 5 ครั้ง')
assertDeep(u.monthly.map(m => m.qty), [2.5, 0, 3], 'เดือนที่ไม่มีเบิก = 0')
assertEq(u.monthly[0].label, 'ส.ค. 69', 'ป้ายเดือน พ.ศ.')
assertEq(u.departments.length, 3, '"ห้องยา G" = "ห้องยาG" รวมเป็นหน่วยงานเดียว')
assertEq(u.top.department, 'ห้องยาG', 'มากสุด = ชื่อที่ลงบ่อยสุด')
assertEq(u.top.qty, 3.5, 'ห้องยาG 3.5 กล่อง')
assertEq(u.top.count, 3, 'ห้องยาG 3 ครั้ง')
assertDeep(u.lowest.map(d => d.department), ['ER', 'OPD'], 'น้อยสุดเท่ากัน 2 หน่วยงาน เรียงตามชื่อ')
assertEq(Math.round(u.departments.reduce((s, d) => s + d.share, 0) * 1000), 1000, 'สัดส่วนรวม 100%')
const withNon = summarizeUsage({ dispenseRows: [...disp,
  { dispense_date: '2026-10-07', department: 'เบิกเพิ่มจากความผิดพลาด', qty_out: 500, drug_unit: 'เม็ด' },
  { dispense_date: '2026-10-08', department: 'เบิกยาหมดอายุจากคลัง', qty_out: 100, drug_unit: 'เม็ด' },
], mainUnit: '1000เม็ด', months })
assertEq(withNon.total, 6, 'เบิกเพิ่มจากความผิดพลาด อยู่ในยอดรวม · เบิกยาหมดอายุจากคลัง ไม่นับ (กฎเรท)')
assertEq(withNon.departments.some(d => d.department.startsWith('เบิก')), false, 'แต่ไม่ขึ้นอันดับหน่วยงาน (Rule #16)')
assertDeep(withNon.lowest.map(d => d.department), ['ER', 'OPD'], 'และไม่ถูกเลือกเป็นน้อยสุด')
assertDeep(withNon.nonDepartments.map(d => [d.department, d.qty]), [['เบิกเพิ่มจากความผิดพลาด', 0.5]], 'แยกไว้ใน nonDepartments (ยาหมดอายุถูกตัดก่อน ไม่อยู่ในนี้)')
const one = summarizeUsage({ dispenseRows: disp.slice(0, 1), mainUnit: '1000เม็ด', months })
assertDeep(one.lowest, [], 'หน่วยงานเดียว = ไม่มีน้อยสุด')

section('receiptsInRange — แปลงหน่วยหลัก · หน่วยฐานต่างกัน = แปลงไม่ได้')
const recv = [
  { receive_date: '2026-09-30', drug_unit: '1000เม็ด', qty_received: 80, supplier_current: 'สสจ.', bill_number: 'B3', purchase_type: 'การซื้อ' },
  { receive_date: '2026-09-16', drug_unit: '500เม็ด', qty_received: 10, supplier_current: 'บูรพา', bill_number: 'B2', purchase_type: 'การซื้อ' },
  { receive_date: '2026-05-08', drug_unit: '1000เม็ด', qty_received: 100, supplier_current: 'บูรพา', bill_number: 'B1', purchase_type: 'การซื้อ' },
]
const rr = receiptsInRange(recv, { from: '2026-08-01', to: '2026-10-31', mainUnit: '1000เม็ด' })
assertDeep(rr.map(x => x.qtyMain), [80, 5], 'ในช่วง 2 บิล · 500เม็ด×10 = 5 กล่อง')
assertEq(receiptsInRange([{ receive_date: '2026-09-01', drug_unit: 'ขวด', qty_received: 3 }], { from: '2026-08-01', to: '2026-10-31', mainUnit: '450ml' })[0].qtyMain, null, 'ขวด vs 450ml = แปลงไม่ได้')

section('buildDrugUsageReport — ประกอบกับบัตรยา')
const TODAY = new Date(2026, 10, 14)
const inv = [
  { code: '1000227', name: 'Paracetamol 500mg', type: 'Tablet', unit: '1000เม็ด', lot: 'A1', exp: '01/01/2028', qty: '40', receive_status: 'ตรวจรับแล้ว|คงไว้' },
  { code: '1000227', name: 'Paracetamol 500mg', type: 'Tablet', unit: '1000เม็ด', lot: 'A2', exp: '01/06/2028', qty: '10', receive_status: 'รอตรวจรับ|คงไว้' },
]
const rep = buildDrugUsageReport({
  code: '1000227', rows: inv, receiveRows: recv.map(r => ({ ...r, drug_code: '1000227' })), dispenseRows: disp,
  purchaseRequests: [{ code: '1000227', notified_on: '2026-10-14', status: 'รอ', reason: null }],
  range: { from: '2026-08-01', to: '2026-10-31' }, rateMonths: ['2026-07', '2026-08', '2026-09', '2026-10'], today: TODAY,
})
assertEq(rep.mainUnit, '1000เม็ด', 'หน่วยหลัก = หน่วยซื้อล่าสุด')
assertEq(rep.total, 50, 'คงเหลือรวม 50')
assertEq(rep.split.pending, 10, 'รอตรวจรับ 10')
assertEq(rep.usage.total, 5.5, 'เบิกรวมช่วงรายงาน')
assertEq(rep.rate.avgMonth, 3.63, 'เรท 4 เดือน = (9 + 2.5 + 0 + 3) ÷ 4 = 3.625 — ก.ค. อยู่ในเรทแต่นอกช่วงรายงาน')
assertEq(rep.range.label, 'ส.ค. 69–ต.ค. 69', 'ป้ายช่วง')
assertEq(rep.receivedTotal, 85, 'รับเข้าในช่วงรวม 85 กล่อง')
assertEq(rep.lastReceipt.supplier, 'สสจ.', 'รับล่าสุดทั้งหมด')
assertEq(rep.pendingRequest?.waitDays, 31, 'แจ้งซื้อ 14/10 รอ 31 วัน (บิลซื้อหลังวันแจ้งยังไม่มี)')
assertEq(buildDrugUsageReport({ code: 'x', rows: [], range: { from: '2026-08-01', to: '2026-10-31' } }), null, 'ไม่มีใน inventory = null')
const arrived = buildDrugUsageReport({
  code: '1000227', rows: inv, receiveRows: recv.map(r => ({ ...r, drug_code: '1000227' })), dispenseRows: disp,
  purchaseRequests: [{ code: '1000227', notified_on: '2026-09-01', status: 'รอ' }],
  range: { from: '2026-08-01', to: '2026-10-31' }, rateMonths: [], today: TODAY,
})
assertEq(arrived.pendingRequest, null, 'บิลซื้อหลังวันแจ้ง = มาส่งแล้ว ไม่ค้าง')
assertEq(arrived.latestRequest.arrivedOn, '2026-09-16', 'มาส่ง = บิลซื้อใบแรกหลังวันแจ้ง')

section('groupReceiptBills — บิลเดียวหลาย lot = รับ 1 ครั้ง (Para 30/09 สสจ. 3 lot 1+8+71)')
const multiLot = groupReceiptBills([
  { date: '2026-09-30', billNumber: 'ว9241', supplier: 'สสจ.', lot: 'a', qtyMain: 1 },
  { date: '2026-09-30', billNumber: 'ว9241', supplier: 'สสจ.', lot: 'b', qtyMain: 8 },
  { date: '2026-09-30', billNumber: 'ว9241', supplier: 'สสจ.', lot: 'c', qtyMain: 71 },
  { date: '2026-09-16', billNumber: 'D1', supplier: 'บูรพา', lot: 'd', qtyMain: 10 },
])
assertDeep(multiLot.map(b => [b.billNumber, b.lots, b.qtyMain]), [['ว9241', 3, 80], ['D1', 1, 10]], 'รวม lot ต่อบิล')
assertEq(groupReceiptBills([{ date: 'd', billNumber: 'x', supplier: 's', qtyMain: 1 }, { date: 'd', billNumber: 'x', supplier: 's', qtyMain: null }])[0].qtyMain, null, 'lot ใดแปลงไม่ได้ = ยอดบิลเป็น null')
assertEq(rep.receiptBills.length, 2, 'report มีรายบิล')
assertEq(rep.lastReceipt.qtyMain, 80, 'รับล่าสุด = ทั้งบิล')

section('ข้อความไลน์ · Excel · ใบพิมพ์ — อ่านจาก report ชุดเดียวกับจอ')
const line = usageReportLineText([rep])
assertEq(line.split('\n')[0], 'Paracetamol 500mg (1000227)', 'บรรทัดแรก = ชื่อยา (รหัส)')
assertEq(line.includes('• คงเหลือ 50 กล่อง (1,000 เม็ด) (รอตรวจรับ 10)'), true, 'คงเหลือ + รอตรวจรับ')
assertEq(line.includes('• เบิกรวม 5.5 กล่อง 5 ครั้ง จาก 3 หน่วยงาน'), true, 'เบิกรวม')
assertEq(line.includes('น้อยสุด ER, OPD 1'), true, 'น้อยสุดเท่ากันหลายหน่วยงาน')
assertEq(line.includes('• แจ้งซื้อ 14/10/2569 รอของ 31 วัน'), true, 'สถานะแจ้งซื้อ')
assertEq(line.includes('• รับเข้า 2 บิล รวม 85 กล่อง · ล่าสุด 30/09/2569 สสจ. 80 กล่อง'), true, 'รับเข้านับรายบิล')
assertEq(usageReportLineText([rep, arrived]).split('\n')[0], 'สรุปรับ-เบิกยา 2 รายการ', 'หลายยา = หัวรวม')

section('drugCardLineText — ข้อความไลน์จากบัตรยา (15/11/2569)')
{
  const p = {
    ...buildDrugProfile({ rows: inv, purchaseUnit: '1000เม็ด', receiveRows: recv.map(r => ({ ...r, drug_code: '1000227' })), dispenseRows: disp, today: TODAY }),
    purchaseRequest: { waitDays: 31, notified_on: '2026-10-14' },
  }
  const t = drugCardLineText(p, { statusTexts: ['รอตรวจรับ 1 lot'], updatedAtText: '15 พ.ย. 69 14:00' })
  const ls = t.split('\n')
  assertEq(ls[0], 'Paracetamol 500mg (รหัส 1000227)', 'บรรทัดแรก = ชื่อยา (รหัส)')
  assertEq(ls[1], 'ยอด ณ นำเข้า Excel ล่าสุด 15 พ.ย. 69 14:00', 'บอกเวลายอด (บัตรยาไม่ใช่ยอดสด)')
  assertEq(ls.includes('• คงเหลือ 50 กล่อง (1,000 เม็ด) (พร้อมเบิก 40 · รอตรวจรับ 10)'), true, 'คงเหลือ + แยกพร้อมเบิก/รอตรวจรับ')
  assertEq(ls.includes('• รอตรวจรับ 1 lot'), true, 'ชิปสถานะบนบัตรตามมาครบ')
  assertEq(ls.includes('• แจ้งซื้อแล้ว 31 วัน (แจ้ง 14/10/2569)'), true, 'แจ้งซื้อ')
  assertEq(ls.includes('ราย lot (2):'), true, 'หัวราย lot')
  assertEq(ls.some(l => l.startsWith('- lot A1 หมดอายุ 01/01/2571 · 40 กล่อง (1,000 เม็ด)')), true, 'lot + exp พ.ศ. + จำนวน')
  assertEq(ls.some(l => l.startsWith('- lot A2') && l.endsWith('· รอตรวจรับ')), true, 'lot รอตรวจรับมีป้าย')
  assertEq(ls.includes('• รับล่าสุด 30/09/2569 สสจ. (บิล B3)'), true, 'รับล่าสุด')
  assertEq(ls.includes('• เบิกบ่อยสุด ห้องยาG (4 จาก 6 ครั้ง)'), true, 'เบิกบ่อยสุด (ไม่นับคืนยา) · ห้องยา G = ห้องยาG')
  const manyLots = buildDrugProfile({ rows: Array.from({ length: CARD_LINE_LOTS + 2 }, (_, i) => ({ ...inv[0], lot: `L${i}` })), today: TODAY })
  const t2 = drugCardLineText(manyLots).split('\n')
  assertEq(t2.filter(l => l.startsWith('- lot ')).length, CARD_LINE_LOTS, `แสดงไม่เกิน ${CARD_LINE_LOTS} lot`)
  assertEq(t2.includes('- และอีก 2 lot (ดูในบัตรยา)'), true, 'บอกจำนวน lot ที่ไม่ได้แสดง')
  assertEq(drugCardLineText(null), '', 'ไม่มีบัตร = ข้อความว่าง')
}
const sheets = usageReportSheets([rep])
assertDeep(sheets.map(s => s.name), ['สรุป', 'รายเดือน', 'หน่วยงาน', 'รับเข้า'], 'Excel 4 ชีท')
assertEq(sheets[0].rows[4][9], 5.5, 'ชีทสรุป เบิกรวม = จอ')
assertDeep(sheets[1].rows[4].slice(3, 6), [2.5, 0, 3], 'ชีทรายเดือน = จอ')
assertEq(sheets[2].rows.length - 4, 3, 'ชีทหน่วยงาน 3 แถว')
assertEq(sheets[3].rows[4][2], '30/09/2569', 'ชีทรับเข้า วันที่ พ.ศ.')
assertEq(sheets.every(s => s.cols.length === s.rows[3].length), true, 'ความกว้างคอลัมน์ครบทุกหัวตาราง')
const html = usageReportHtml([{ ...rep, name: 'A<b>' }], { printedAt: TODAY })
assertEq(html.includes('A&lt;b&gt;') && !html.includes('A<b>'), true, 'ใบพิมพ์ escape HTML')
assertEq(html.includes('พิมพ์ 14/11/2569'), true, 'วันที่พิมพ์ พ.ศ.')
assertEq(fmtThaiDate('2026-01-05'), '05/01/2569', 'fmtThaiDate')
assertEq(unitShort('450ml'), 'ขวด', 'unitShort ml → ขวด')

console.log(`\n${pass} ผ่าน · ${fail} ล้มเหลว`)
if (fail) { console.log(fails.join('\n')); process.exit(1) }
