// drugProfile.test.js — Golden tests สำหรับ src/lib/drugProfile.js
// รัน: node src/lib/drugProfile.test.js  (npm run test:drugprofile)
// กฎ: ต้องผ่าน 100% ก่อน commit
// ครอบ: แปลงหน่วย/วันหมดอายุ · ยอดรวม = กฎโมดอลรายการยาในคลัง · หน่วยซื้อล่าสุด · ต่ำกว่า SS = กฎ Dashboard ·
//       ค้นชื่อ/รหัส/lot · บัตรยา (บวกแถวซ้ำ · แยกพร้อมเบิก/รอตรวจรับ/หมดอายุ · lot ที่ควรใช้ก่อน · ตัดออก)

import {
  packUnitLabel, parseUnitFactor, parseExpDate, stockTotalInMainUnit, latestPurchaseUnit, pickMainUnit,
  ssAggregate, isBelowSafetyStock, buildSearchIndex, searchDrugs, buildDrugProfile,
  waitDaysSince, lotBills, usageRate, normDept, dispenseHistory, HISTORY_LIMIT,
} from './drugProfile.js'

let pass = 0, fail = 0
const fails = []

function assertEq(actual, expected, label) {
  const ok = actual === expected
  if (ok) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`)
}
function assertDeep(actual, expected, label) {
  assertEq(JSON.stringify(actual), JSON.stringify(expected), label)
}
function section(name) { console.log(`\n=== ${name} ===`) }

const TODAY = new Date(2026, 9, 11) // 11/10/2026

section('parseUnitFactor / parseExpDate')
assertDeep(parseUnitFactor('450ml'), { factor: 450, base: 'ml' }, 'เลขนำหน้า = packsize')
assertDeep(parseUnitFactor('100 เม็ด'), { factor: 100, base: 'เม็ด' }, 'มีช่องว่าง')
assertDeep(parseUnitFactor('vial'), { factor: 1, base: 'vial' }, 'ไม่มีเลข = 1')
assertEq(parseExpDate('14/8/2026')?.getTime(), new Date(2026, 7, 14).getTime(), 'D/M/YYYY')
assertEq(parseExpDate('14/08/2569')?.getTime(), new Date(2026, 7, 14).getTime(), 'พ.ศ. → ค.ศ.')
assertEq(parseExpDate('2026-08-14')?.getTime(), new Date(2026, 7, 14).getTime(), 'ISO')
assertEq(parseExpDate('08/2026')?.getTime(), new Date(2026, 7, 31).getTime(), 'MM/YYYY = สิ้นเดือน')
assertEq(parseExpDate('-'), null, "'-' = null")

section('ยอดรวม = กฎโมดอลรายการยาในคลัง (fetchStockSummary)')
assertEq(stockTotalInMainUnit([{ qty: 3, unit: '100เม็ด' }, { qty: 30, unit: '100เม็ด' }], '100เม็ด'), 33, 'แถว code+lot ซ้ำ บวกกัน (Baclofen 3+30)')
assertEq(stockTotalInMainUnit([{ qty: 2, unit: '100เม็ด' }, { qty: 5, unit: '10เม็ด' }], '100เม็ด'), 3, 'หลายหน่วย แปลงเป็นเม็ดก่อนบวก แล้วปัดขึ้น (2.5 → 3)')
assertEq(stockTotalInMainUnit([], 'vial'), 0, 'ไม่มีของ = 0')

section('หน่วยซื้อล่าสุด')
{
  const sorted = [
    { drug_unit: '50เม็ด', purchase_type: 'บริจาค', price_per_unit: 0 },
    { drug_unit: '100เม็ด', purchase_type: 'การซื้อ', price_per_unit: 0 },
    { drug_unit: '500เม็ด', purchase_type: 'การซื้อ', price_per_unit: '1,200.50' },
    { drug_unit: '1000เม็ด', purchase_type: 'การซื้อ', price_per_unit: 99 },
  ]
  assertEq(latestPurchaseUnit(sorted), '500เม็ด', 'ข้ามบริจาค + ซื้อราคา 0 → บิลซื้อจริงใบล่าสุด')
  assertEq(latestPurchaseUnit([{ drug_unit: 'vial', purchase_type: 'ยืม', price_per_unit: 5 }]), null, 'ไม่มีบิลซื้อ = null')
  assertEq(pickMainUnit(null, [{ unit: '10เม็ด' }, { unit: '100เม็ด' }]), '10เม็ด', 'ไม่มีบิลซื้อ → หน่วยแถวแรกที่มีของ')
  assertEq(pickMainUnit('500เม็ด', [{ unit: '10เม็ด' }]), '500เม็ด', 'มีบิลซื้อ → หน่วยซื้อ')
}

section('ต่ำกว่า Safety Stock = กฎ Dashboard')
{
  const rows = [
    { qty: 5, safety_stock: 20, receive_status: 'ตรวจรับแล้ว' },
    { qty: 4, safety_stock: 10, receive_status: 'รอตรวจรับ' },
    { qty: 0, safety_stock: null },
  ]
  const agg = ssAggregate(rows)
  assertDeep(agg, { qty: 9, ss: 20, discontinued: false }, 'qty ดิบรวมทุกแถว (รวมรอตรวจรับ) · SS สูงสุด')
  assertEq(isBelowSafetyStock(agg, null), true, '9 < 20 → ต่ำกว่า SS')
  assertEq(isBelowSafetyStock(agg, 'สั่งเมื่อขอ'), false, 'config สั่งเมื่อขอ ไม่นับ')
  assertEq(isBelowSafetyStock(agg, 'ตัดออก'), false, 'config ตัดออก ไม่นับ')
  assertEq(isBelowSafetyStock(ssAggregate([...rows, { qty: 0, receive_status: 'ตัดออกจากบัญชี' }]), null), false, 'มีแถวตัดออก → ไม่นับทั้งรหัส')
  assertEq(isBelowSafetyStock({ qty: 0, ss: 0, discontinued: false }, null), false, 'SS = 0 ไม่นับ')
}

section('ค้นหายา')
{
  const index = buildSearchIndex([
    { code: '1001', name: 'Paracetamol 500mg', lot: '26E266', qty: 10 },
    { code: '1001', name: 'Paracetamol 500mg', lot: '25A001', qty: 0 },
    { code: '2002', name: 'Para-amino 10mg', lot: '-', qty: 0 },
    { code: '3003', name: 'Amoxicillin', lot: '261001', qty: 3, receive_status: 'ตัดออกจากบัญชี' },
    { code: '100', name: 'Ibuprofen', lot: '99X', qty: 1 },
  ])
  assertEq(index.length, 4, '1 รายการต่อรหัส')
  assertDeep(index.find(d => d.code === '1001').lots, ['26E266', '25A001'], 'lot ไม่ซ้ำ ไม่เอา -')
  assertEq(index.find(d => d.code === '3003').inStock, true, 'แถวตัดออกที่ยังมีของ = มีของ (ตัดออก = เลิกซื้อ ไม่ใช่ของหาย)')
  assertDeep(searchDrugs(index, 'para').map(r => r.code), ['1001', '2002'], 'ชื่อขึ้นต้น · มีของมาก่อน')
  assertDeep(searchDrugs(index, '100').map(r => r.code), ['100', '1001', '3003'], 'รหัสตรงตัว > รหัสขึ้นต้น > lot มีคำ (261001)')
  assertEq(searchDrugs(index, '26e266')[0]?.matchedLot, '26E266', 'ค้น lot ไม่สนพิมพ์เล็ก-ใหญ่ (lot ตัว E ไม่ถูกแปลง)')
  assertEq(searchDrugs(index, '26').length, 0, 'lot ต้องพิมพ์ ≥ 3 ตัว')
  assertEq(searchDrugs(index, 'para cet')[0]?.code, '1001', 'ไม่สนช่องว่าง')
  assertEq(searchDrugs(index, '   ').length, 0, 'คำค้นว่าง = ไม่มีผล')
}

section('บัตรยา')
{
  const rows = [
    // Baclofen-like: lot เดียว 2 แถว (คนละบิล) + ที่เก็บหลายชั้น
    { code: '5005', name: 'Baclofen 10mg', type: 'Tab', unit: '100เม็ด', lot: '260301', exp: '01/03/2028', qty: 3, location: 'E-1-1', main_log: 'โซน E', invoice: 'INV1', safety_stock: 50, receive_status: 'ตรวจรับแล้ว' },
    { code: '5005', name: 'Baclofen 10mg', type: 'Tab', unit: '100เม็ด', lot: '260301', exp: '1/3/2028', qty: 30, location: 'E-1-1 ,E-1-2', main_log: 'โซน E', invoice: 'INV2', safety_stock: 50, receive_status: 'ตรวจรับแล้ว' },
    // lot ใกล้หมดอายุกว่า → ควรใช้ก่อน
    { code: '5005', name: 'Baclofen 10mg', unit: '100เม็ด', lot: '250901', exp: '01/12/2026', qty: 5, location: 'E-1-3', main_log: 'โซน E', safety_stock: 50 },
    // หมดอายุแล้ว
    { code: '5005', name: 'Baclofen 10mg', unit: '100เม็ด', lot: '240101', exp: '01/01/2026', qty: 2, location: 'E-9-9', safety_stock: 50 },
    // รอตรวจรับ
    { code: '5005', name: 'Baclofen 10mg', unit: '100เม็ด', lot: '261010', exp: '01/10/2029', qty: 10, location: 'รับเข้า', safety_stock: 50, receive_status: 'รอตรวจรับ' },
    // คงเหลือ 0 → ไม่แสดง แต่นับเป็น lot ที่หมดแล้ว
    { code: '5005', name: 'Baclofen 10mg', unit: '100เม็ด', lot: '230101', exp: '01/01/2025', qty: 0, safety_stock: 50 },
  ]
  const p = buildDrugProfile({
    rows, purchaseUnit: '100เม็ด', excludeStatus: null, today: TODAY,
    receiveDates: { '5005|261010': '2026-09-21' },
  })
  assertEq(p.total, 50, 'ยอดบัญชี = 3+30+5+2+10 (รวมหมดอายุ/รอตรวจรับ — ตรงโมดอลรายการยาในคลัง)')
  assertDeep(p.split, { ready: 38, pending: 10, expired: 2 }, 'แยกพร้อมเบิก/รอตรวจรับ/หมดอายุ')
  assertEq(p.lots.length, 4, 'lot ละบรรทัด (ซ่อนที่คงเหลือ 0)')
  const bac = p.lots.find(l => l.lot === '260301')
  assertEq(bac.qty, 33, 'แถว code+lot ซ้ำ บวกกัน ไม่ dedupe')
  assertEq(bac.rowCount, 2, 'นับจำนวนแถวที่รวม')
  assertEq(bac.exp, '01/03/2028, 1/3/2028', 'exp ต่างรูปแบบ แสดงครบ (ไม่ทิ้ง)')
  assertDeep(bac.locations, ['E-1-1', 'E-1-2'], 'ที่เก็บ split comma + ไม่ซ้ำ')
  assertDeep(bac.invoices, ['INV1', 'INV2'], 'เก็บเลขบิลของแถวไว้ (ใช้ Phase 2b)')
  assertDeep(p.lots.map(l => l.lot), ['240101', '250901', '260301', '261010'], 'เรียงตามวันหมดอายุ')
  assertEq(p.useFirst?.lot, '250901', 'lot ที่ควรใช้ก่อน = พร้อมเบิกที่หมดอายุก่อน (ข้ามที่หมดอายุแล้ว)')
  assertEq(p.lots.find(l => l.lot === '240101').expired, true, 'flag หมดอายุ')
  assertEq(p.lots.find(l => l.lot === '261010').waitDays, 20, 'รอตรวจรับ 21/09 → 11/10 = 20 วัน (เดิมได้ 19 จาก UTC)')
  assertEq(p.pendingLots, 1, 'รอตรวจรับ 1 lot')
  assertEq(p.expiredLots, 1, 'หมดอายุค้าง 1 lot')
  assertEq(p.zeroLots, 1, 'lot ที่หมดแล้ว 1')
  assertEq(p.belowSS, false, '50 ไม่ต่ำกว่า SS 50')
  assertEq(p.mainUnit, '100เม็ด', 'หน่วยหลัก = หน่วยซื้อล่าสุด')
  assertEq(p.ssUnit, '100เม็ด', 'หน่วยเดียว → ssUnit = หน่วยของแถว')
}
{
  // ยาหลายหน่วย + ยาตัดออกบางแถว
  const rows = [
    { code: '7007', name: 'Syrup X', unit: '450ml', lot: 'A1', exp: '01/01/2028', qty: 2, safety_stock: 10 },
    { code: '7007', name: 'Syrup X', unit: '60ml', lot: 'B1', exp: '01/01/2028', qty: 3, safety_stock: 10 },
  ]
  const p = buildDrugProfile({ rows, purchaseUnit: null, today: TODAY })
  assertEq(p.mainUnit, '450ml', 'ไม่มีบิลซื้อ → หน่วยแถวแรก')
  assertEq(p.total, 3, '(900+180)/450 = 2.4 → ปัดขึ้น 3')
  assertEq(p.multiUnit, true, 'flag หลายหน่วย')
  assertEq(p.split.ready, 2.4, 'ยอดแยกไม่ปัด (ทศนิยม 2 ตำแหน่ง)')
  assertEq(p.belowSS, true, 'SS ใช้ qty ดิบ 5 < 10 (กฎ Dashboard ไม่แปลงหน่วย)')
  assertEq(p.ssUnit, null, 'หลายหน่วย → ssUnit null (ห้ามโชว์ยอดดิบคู่ยอดรวม)')
}
{
  const rows = [
    { code: '8008', name: 'Old drug', unit: 'vial', lot: '-', exp: '-', qty: 4, receive_status: 'ตัดออกจากบัญชี' },
    { code: '8008', name: 'Old drug', unit: 'vial', lot: '-', exp: '-', qty: 0 },
  ]
  const p = buildDrugProfile({ rows, today: TODAY })
  assertEq(p.total, 4, 'แถวตัดออกที่ยังมีของ นับเข้ายอด (Cefdinir 1660111: ของจริง 60 บัตรเคยขึ้น 0)')
  assertEq(p.discontinued, true, 'flag ตัดออก')
  assertEq(p.lots.length, 1, 'แสดง lot ของที่เหลือ ให้รู้ exp/ที่เก็บ')
  assertEq(p.useFirst, null, 'lot เดียว ไม่ต้องบอกใช้ก่อน')
  assertEq(buildDrugProfile({ rows: [] }), null, 'ไม่มีแถว = null')
}
{
  // lot '-' หลายแถว (เวชภัณฑ์) รวมเป็นบรรทัดเดียว
  const rows = [
    { code: '9009', name: 'Gauze', unit: 'ห่อ', lot: '-', exp: '-', qty: 10, invoice: 'A' },
    { code: '9009', name: 'Gauze', unit: 'ห่อ', lot: '', exp: '', qty: 5, invoice: 'B' },
  ]
  const p = buildDrugProfile({ rows, today: TODAY })
  assertEq(p.lots.length, 1, "lot '-' กับ lot ว่าง = บรรทัดเดียว")
  assertEq(p.lots[0].qty, 15, 'บวกรวม')
  assertEq(p.lots[0].daysLeft, null, 'ไม่มี exp = ไม่ทราบวัน')
  assertEq(p.split.ready, 15, 'ไม่มี exp = พร้อมเบิก')
}
{
  // lot '-' คนละวันหมดอายุ (Glucose powder ของจริง 14 + 24) → แยกบรรทัด ไม่รวมจนไม่รู้ว่าอะไรหมดอายุเมื่อไหร่
  const rows = [
    { code: '1501142', name: 'Glucose powder 454gm', unit: '454gm', lot: '-', exp: '30/09/2028', qty: 24 },
    { code: '1501142', name: 'Glucose powder 454gm', unit: '454gm', lot: '-', exp: '03/02/2028', qty: 14 },
  ]
  const p = buildDrugProfile({ rows, today: TODAY })
  assertEq(p.lots.length, 2, "lot '-' คนละ exp = 2 บรรทัด")
  assertDeep(p.lots.map(l => l.qty), [14, 24], 'เรียง exp ก่อน-หลัง พร้อมยอดของตัวเอง')
  assertEq(p.total, 38, 'ยอดรวมยังเท่าเดิม')
}

section('รอตรวจรับมา N วัน (waitDaysSince)')
assertEq(waitDaysSince('2026-09-27', TODAY), 14, '27/09 → 11/10 = 14 วันพอดี (ไม่เกิน 14)')
assertEq(waitDaysSince('2026-09-26', TODAY), 15, '26/09 → 15 วัน (เกิน 14)')
assertEq(waitDaysSince('2026-10-11', TODAY), 0, 'รับวันนี้ = 0')
assertEq(waitDaysSince(null, TODAY), null, 'ไม่มีวันรับ = null')

section('บิลของ lot')
{
  // Baclofen lot 260301 ของจริง: มาจาก 2 บิล (30 + 10) · แถว inventory ระบุเลขบิลใบล่าสุด
  const recv = [
    { lot: '260502', bill_number: 'ML26075531', supplier_current: 'แมคโคร', receive_date: '2026-07-24', price_per_unit: '148.0000', drug_unit: '200เม็ด', qty_received: '15', purchase_type: 'การซื้อ' },
    { lot: '260301', bill_number: 'ML26063066', supplier_current: 'แมคโคร', receive_date: '2026-06-19', price_per_unit: '148.0000', drug_unit: '200เม็ด', qty_received: '30', purchase_type: 'การซื้อ' },
    { lot: '260301', bill_number: 'ML26053463', supplier_current: 'แมคโคร', receive_date: '2026-05-25', price_per_unit: '150.5', drug_unit: '200เม็ด', qty_received: '10', purchase_type: 'การซื้อ' },
  ]
  const b = lotBills({ lot: '260301', qty: 3, byInvoice: { ML26063066: 3 } }, recv)
  assertDeep(b.bills.map(x => x.billNumber), ['ML26063066', 'ML26053463'], 'lot จริง → บิลที่ lot ตรงเท่านั้น เรียงใหม่→เก่า')
  assertDeep(b.bills.map(x => x.remaining), [3, null], 'คงเหลือรายบิลเฉพาะบิลที่แถว inventory ระบุ (อีกบิล = null ไม่ใช่ 0)')
  assertEq(b.unassignedQty, 0, 'คงเหลือระบุบิลได้ครบ')
  assertDeep(b.priceRange, { min: 148, max: 150.5, unit: '200เม็ด' }, 'ช่วงราคา ไม่เฉลี่ย')

  const none = lotBills({ lot: '999999', qty: 5, byInvoice: {} }, recv)
  assertEq(none.bills.length, 0, 'lot ไม่มีบิล → ว่าง (ห้ามยืมบิลของ lot อื่น)')
  assertEq(none.unassignedQty, null, 'ไม่มีบิล = ไม่บอกคงเหลือรายบิล')

  // lot '-' — จับด้วยเลขบิลของแถว inventory ไม่ใช่ lot
  const dashRecv = [
    { lot: '-', bill_number: 'A1', supplier_current: 'X', receive_date: '2026-01-10', price_per_unit: 5, drug_unit: 'ห่อ', qty_received: 20 },
    { lot: '-', bill_number: 'A2', supplier_current: 'X', receive_date: '2025-06-01', price_per_unit: 4, drug_unit: 'ห่อ', qty_received: 30 },
    { lot: '-', bill_number: 'A3', supplier_current: 'Y', receive_date: '2024-02-01', price_per_unit: 3, drug_unit: 'ห่อ', qty_received: 10 },
  ]
  const d = lotBills({ lot: '-', qty: 15, byInvoice: { A1: 10, 'ไม่มีบิล': 5 } }, dashRecv)
  assertDeep(d.bills.map(x => x.billNumber), ['A1'], "lot '-' → เฉพาะบิลที่เลขตรงแถว inventory (ไม่เอา A2/A3)")
  assertEq(d.unassignedQty, 5, 'แถวที่เลขบิลไม่ตรงบิลใด = คงเหลือไม่ระบุบิล')
  const mixed = lotBills({ lot: 'L1', qty: 1, byInvoice: {} }, [
    { lot: 'L1', bill_number: 'B1', price_per_unit: 10, drug_unit: '100เม็ด', qty_received: 1 },
    { lot: 'L1', bill_number: 'B2', price_per_unit: 50, drug_unit: '500เม็ด', qty_received: 1 },
  ])
  assertEq(mixed.priceRange, null, 'บิลคนละหน่วย → ไม่ทำช่วงราคา (เทียบกันไม่ได้)')
}

section('เรท + คงอยู่ได้อีก (กฎหน้าวิเคราะห์สั่งซื้อ)')
{
  const usage = { months: ['2026-06', '2026-07', '2026-08', '2026-09'], monthsBase: { '2026-06': 1200, '2026-07': 0, '2026-08': 2400, '2026-09': 1200 } }
  const rows = [{ qty: 18, unit: '200เม็ด' }, { qty: -1, unit: '200เม็ด', receive_status: 'ตัดออกจากบัญชี' }]
  const r = usageRate({ usage, rows, mainUnit: '200เม็ด' })
  assertEq(r.avgMonth, 6, '(6+0+12+6)/4 = 6 กล่อง/เดือน (เดือนที่ไม่เบิกนับเป็น 0)')
  assertEq(r.avgDay, 0.1974, 'Avg/วัน = 6/30.4 ปัด 4 ตำแหน่ง (ตัวหารเดียวกับชีทวิเคราะห์สั่งซื้อ)')
  assertEq(r.coverageDays, 86, 'คงเหลือทุกแถว (18−1 = 17) ÷ 0.1974 = 86 วัน (กฎ stockInfo ของ ReorderApp)')
  assertEq(r.coverage, '2 ด. 26 วัน', 'รูปแบบเดียวกับหน้าวิเคราะห์สั่งซื้อ')
  assertEq(r.monthLabel, 'มิ.ย. 69–ก.ย. 69', 'เขียนช่วงเดือนกำกับ')
  assertEq(usageRate({ usage: { months: ['2026-09'], monthsBase: {} }, rows, mainUnit: '200เม็ด' }).coverage, '∞', 'ไม่มีการเบิก + มีของ = ∞')
  assertEq(usageRate({ usage: null, rows, mainUnit: 'x' }), null, 'ไม่มีข้อมูลเรท = null')
}

section('ประวัติเบิก: เฉพาะหน่วยงานตัวเอง')
{
  assertEq(normDept('ห้องยา G'), normDept('ห้องยาG'), 'ตัดช่องว่าง')
  assertEq(normDept('ER (ฉุกเฉิน)'), normDept('ER'), 'ตัดข้อความในวงเล็บ')
  const rows = [
    { dispense_date: '2026-10-02', department: 'ห้องยาG', qty_out: '5', drug_unit: '200เม็ด', lot: 'A' },
    { dispense_date: '2026-10-01', department: 'ห้องยา1', qty_out: '10', drug_unit: '200เม็ด', lot: 'A' },
    { dispense_date: '2026-09-01', department: 'ห้องยาG', qty_out: '2', drug_unit: '200เม็ด', lot: 'B' },
  ]
  const g = dispenseHistory(rows, 'ห้องยา G')
  assertEq(g.total, 2, 'ผู้เบิกห้องยา G เห็น 2 แถวของตัวเอง')
  assertDeep(g.rows.map(r => r.qty), [5, 2], 'ไม่มีแถวของห้องยา1')
  assertEq(dispenseHistory(rows, null).total, 3, 'staff (department null) เห็นทุกหน่วยงาน')
  assertEq(dispenseHistory(rows, 'คลังยา').total, 0, 'หน่วยงานที่ไม่มีประวัติ = 0 (UI แสดง empty state)')
  const many = Array.from({ length: 25 }, (_, i) => ({ dispense_date: '2026-09-01', department: 'ER', qty_out: i }))
  const e = dispenseHistory(many, 'ER (ฉุกเฉิน)')
  assertEq(e.rows.length, HISTORY_LIMIT, `แสดงล่าสุด ${HISTORY_LIMIT} แถว`)
  assertEq(e.total, 25, 'แต่บอกจำนวนทั้งหมด')
}

console.log('\n=== packUnitLabel (ป้ายหน่วยแสดงผล) ===')
{
  assertEq(packUnitLabel('200เม็ด'), 'กล่อง (200 เม็ด)', 'ขนาดบรรจุนำหน้า → กล่อง (ขนาด หน่วยย่อย)')
  assertEq(packUnitLabel('1000เม็ด'), 'กล่อง (1,000 เม็ด)', 'คั่นหลักพัน')
  assertEq(packUnitLabel('450ml'), 'ขวด (450 ml)', 'ปริมาตร = ขนาดขวด 1 ขวด ไม่ใช่กล่อง (user: 1 ขวด = 450ml)')
  assertEq(packUnitLabel('60cc'), 'ขวด (60 cc)', 'cc = ปริมาตร')
  assertEq(packUnitLabel('50gm'), 'ชิ้น (50 gm)', 'น้ำหนัก = ขนาดชิ้น (หลอด/กระปุก) ไม่ใช่กล่อง')
  assertEq(packUnitLabel('450กรัม'), 'ชิ้น (450 กรัม)', 'กรัม = น้ำหนัก')
  assertEq(packUnitLabel('50amp'), 'กล่อง (50 amp)', 'amp = กล่องละ 50 amp')
  assertEq(packUnitLabel('vial'), 'vial', 'ไม่มีตัวเลข = คงเดิม')
  assertEq(packUnitLabel('1เม็ด'), '1เม็ด', 'ขนาด 1 = คงเดิม (ไม่ใช่กล่อง)')
  assertEq(packUnitLabel(''), '-', 'ว่าง = -')
  assertEq(packUnitLabel(null), '-', 'null = -')
}

section('โน้ตอธิบายหน่วย (unitNote)')
{
  // กรณี 1 — Furosemide inj 1000137 (ข้อมูลจริง 20/10/2569): บิลซื้อ 50amp แต่ Master นับ amp
  const recv = [
    { drug_unit: '50amp', purchase_type: 'การซื้อ', price_per_unit: 325, bill_number: '3001266847', receive_date: '2026-09-21', supplier_current: 'องค์การเภสัชกรรม' },
    { drug_unit: '50amp', purchase_type: 'การซื้อ', price_per_unit: 325, bill_number: '3001246292', receive_date: '2026-08-18', supplier_current: 'องค์การเภสัชกรรม' },
  ]
  const rows = [
    { code: '1000137', name: 'Furosemide inj', unit: 'amp', lot: 'J690287', exp: '01/01/2029', qty: 600 },
    { code: '1000137', name: 'Furosemide inj', unit: 'amp', lot: 'J690200', exp: '01/01/2029', qty: 200 },
  ]
  const p = buildDrugProfile({ rows, purchaseUnit: latestPurchaseUnit(recv), receiveRows: recv, today: TODAY })
  assertEq(p.total, 16, '800 amp ÷ 50 = 16 กล่อง')
  const n = p.unitNote
  assertEq(n.basis, 'purchase', 'หน่วยหลักมาจากบิลซื้อ')
  assertEq(n.bill?.billNumber, '3001266847', 'อ้างบิลซื้อล่าสุด')
  assertEq(n.conversions.length, 1, 'หน่วยในคลังที่ต่างจากหน่วยหลัก 1 แบบ')
  assertDeep([n.conversions[0].unit, n.conversions[0].qty, n.conversions[0].inMain, n.conversions[0].convertible], ['amp', 800, 16, true], 'amp 800 → 16 กล่อง แปลงได้')
  assertEq(n.change, null, 'บิลก่อนหน้าก็ 50amp → ไม่มีโน้ตหน่วยซื้อเปลี่ยน')
}
{
  // กรณี 2 — หน่วยซื้อเปลี่ยน (แบบ 1460094: 100เม็ด → 500เม็ด) · บิลเดียวกันหลายแถวไม่นับเป็น "บิลก่อนหน้า"
  const recv = [
    { drug_unit: '500เม็ด', purchase_type: 'การซื้อ', price_per_unit: 9, bill_number: 'NEW', receive_date: '2026-07-24', supplier_current: 'บ.ใหม่' },
    { drug_unit: '500เม็ด', purchase_type: 'การซื้อ', price_per_unit: 9, bill_number: 'NEW', receive_date: '2026-07-24', supplier_current: 'บ.ใหม่' },
    { drug_unit: '200เม็ด', purchase_type: 'บริจาค', price_per_unit: 0, bill_number: 'DON', receive_date: '2026-01-01', supplier_current: 'สสจ' },
    { drug_unit: '100เม็ด', purchase_type: 'การซื้อ', price_per_unit: 2, bill_number: 'OLD', receive_date: '2025-06-24', supplier_current: 'บ.เดิม' },
  ]
  const rows = [{ code: '1460094', name: 'X', unit: '500เม็ด', lot: 'L1', exp: '01/01/2029', qty: 3 }]
  const n = buildDrugProfile({ rows, purchaseUnit: latestPurchaseUnit(recv), receiveRows: recv, today: TODAY }).unitNote
  assertEq(n.conversions.length, 0, 'ของในคลังหน่วยเดียวกับหน่วยหลัก → ไม่มีกรณี 1')
  assertDeep([n.change?.from.unit, n.change?.from.billNumber, n.change?.to.unit, n.change?.to.billNumber], ['100เม็ด', 'OLD', '500เม็ด', 'NEW'], 'เปลี่ยนจาก 100เม็ด (OLD) เป็น 500เม็ด (NEW) — ข้ามบริจาค + แถวบิลเดียวกัน')
  const same = buildDrugProfile({ rows, purchaseUnit: '500เม็ด', receiveRows: recv.slice(0, 2), today: TODAY })
  assertEq(same.unitNote, null, 'หน่วยตรงกัน + ไม่มีบิลก่อนหน้า → ไม่มีโน้ต')
}
{
  // หน่วยย่อยไม่ตรงกัน (แบบ 1000222: บิลซื้อ ขวด · Master 450ml) → แปลงไม่ได้ ต้องเตือน
  const recv = [{ drug_unit: 'ขวด', purchase_type: 'การซื้อ', price_per_unit: 30, bill_number: 'B1', receive_date: '2025-03-01', supplier_current: 'บ.A' }]
  const rows = [{ code: '1000222', name: 'Syrup', unit: '450ml', lot: 'L', exp: '01/01/2029', qty: 14 }]
  const n = buildDrugProfile({ rows, purchaseUnit: 'ขวด', receiveRows: recv, today: TODAY }).unitNote
  assertEq(n.conversions[0].convertible, false, '450ml กับ ขวด หน่วยย่อยต่าง + ขนาดบรรจุ > 1 = แปลงไม่ได้')
  // 1 : 1 คนละชื่อ (bott กับ ขวด) — ตัวเลขไม่เพี้ยน ไม่ต้องเตือน
  const b = buildDrugProfile({ rows: [{ ...rows[0], unit: 'bott', qty: 9 }], purchaseUnit: 'ขวด', receiveRows: recv, today: TODAY }).unitNote
  assertEq(b.conversions[0].convertible, true, 'bott กับ ขวด ขนาด 1 ทั้งคู่ = นับ 1:1 ได้')
  assertEq(b.conversions[0].sameBase, false, 'แต่บอกว่าชื่อหน่วยต่าง')
  // ไม่มีบิลซื้อ → หน่วยหลัก = lot แรก
  const s = buildDrugProfile({ rows: [{ ...rows[0], unit: '450ml', qty: 2 }, { ...rows[0], lot: 'M', unit: '60ml', qty: 3 }], today: TODAY }).unitNote
  assertDeep([s.basis, s.bill, s.conversions[0].inMain], ['stock', null, 0.4], 'ไม่มีบิลซื้อ: basis = stock · 3×60 ÷ 450 = 0.4')
}

console.log(`\n${pass} ผ่าน · ${fail} ตก`)
if (fail) { console.log(fails.join('\n')); process.exit(1) }
