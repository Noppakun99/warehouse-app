// drugProfile.test.js — Golden tests สำหรับ src/lib/drugProfile.js
// รัน: node src/lib/drugProfile.test.js  (npm run test:drugprofile)
// กฎ: ต้องผ่าน 100% ก่อน commit
// ครอบ: แปลงหน่วย/วันหมดอายุ · ยอดรวม = กฎโมดอลรายการยาในคลัง · หน่วยซื้อล่าสุด · ต่ำกว่า SS = กฎ Dashboard ·
//       ค้นชื่อ/รหัส/lot · บัตรยา (บวกแถวซ้ำ · แยกพร้อมเบิก/รอตรวจรับ/หมดอายุ · lot ที่ควรใช้ก่อน · ตัดออก)

import {
  parseUnitFactor, parseExpDate, stockTotalInMainUnit, latestPurchaseUnit, pickMainUnit,
  ssAggregate, isBelowSafetyStock, buildSearchIndex, searchDrugs, buildDrugProfile,
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
  assertEq(index.find(d => d.code === '3003').inStock, false, 'มีแต่แถวตัดออก = ไม่มีของ')
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
  // 21/09 → 11/10 = 20 วันจริง แต่สูตร Dashboard ได้ 19 (UTC) — test ล็อกว่าบัตรยา = Dashboard; แก้สูตรแล้วเปลี่ยนเป็น 20
  assertEq(p.lots.find(l => l.lot === '261010').waitDays, 19, 'รอตรวจรับ — สูตรเดียวกับ Dashboard (waitDaysSince)')
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
  assertEq(p.total, 0, 'แถวตัดออกไม่นับเข้ายอด')
  assertEq(p.discontinued, true, 'flag ตัดออก')
  assertEq(p.discontinuedQty, 4, 'แสดงจำนวนที่ค้างในแถวตัดออก')
  assertEq(p.lots.length, 0, 'ไม่มี lot ที่มีของ')
  assertEq(p.useFirst, null, 'ไม่มี lot ให้ใช้ก่อน')
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

console.log(`\n${pass} ผ่าน · ${fail} ตก`)
if (fail) { console.log(fails.join('\n')); process.exit(1) }
