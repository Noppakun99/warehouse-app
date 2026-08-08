// billGroup.test.js — Golden tests สำหรับ src/lib/billGroup.js
// รัน: node src/lib/billGroup.test.js
// กฎ: ต้องผ่าน 100% ก่อน commit
// ครอบ: เลขบิลซ้ำคนละบริษัท (group A) / ซ้ำคนละวัน (group B) / บิลว่าง / multi-lot / item_ids

/* eslint-disable no-undef */
import { billGroupKey, groupRowsByBill } from './billGroup.js'

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

// helper สร้าง row ย่อ
const row = (o) => ({
  id: o.id, bill_number: o.bill, supplier_current: o.supp, receive_date: o.date,
  drug_code: o.code ?? '-', drug_name: o.name ?? '-', lot: o.lot ?? '-',
  qty_received: o.qty ?? 0, price_per_unit: o.price ?? 0, total_price_vat: o.vat ?? null,
  ap_stage: o.stage ?? null,
})

const find = (groups, predicate) => groups.find(predicate)

// ────────────────────────────────────────────────────────────────────
// Test 1 — billGroupKey: composite จาก bill+supplier+date
// ────────────────────────────────────────────────────────────────────
section('Test 1: billGroupKey composite')
{
  assertEq(billGroupKey(row({ bill: 'IV6803645', supp: 'แอปคาร์', date: '2025-04-08' })),
    'IV6803645|แอปคาร์|2025-04-08', 'key = bill|supplier|date')
  // คนละ supplier → คนละ key
  const a = billGroupKey(row({ bill: 'IV6803645', supp: 'แอปคาร์', date: '2025-04-08' }))
  const b = billGroupKey(row({ bill: 'IV6803645', supp: 'บี.เอ็ล.ฮั้ว', date: '2025-04-08' }))
  assertEq(a === b, false, 'เลขเดียว คนละบริษัท → คนละ key')
  // คนละวัน → คนละ key
  const c = billGroupKey(row({ bill: '5342833396', supp: 'DKSH', date: '2024-11-26' }))
  const d = billGroupKey(row({ bill: '5342833396', supp: 'DKSH', date: '2024-11-27' }))
  assertEq(c === d, false, 'เลขเดียว บริษัทเดียว คนละวัน → คนละ key')
  // trim + null tolerance
  assertEq(billGroupKey(row({ bill: ' X ', supp: ' Y ', date: '2025-01-01' })), 'X|Y|2025-01-01', 'trim bill+supplier')
}

// ────────────────────────────────────────────────────────────────────
// Test 2 — billGroupKey: บิลว่าง/'-' → __nobill__<id> แยกทุกแถว
// ────────────────────────────────────────────────────────────────────
section('Test 2: billGroupKey บิลว่าง')
{
  assertEq(billGroupKey(row({ id: 42, bill: '-', supp: 'A', date: '2025-01-01' })), '__nobill__42', "'-' → __nobill__id")
  assertEq(billGroupKey(row({ id: 7, bill: '', supp: 'A', date: '2025-01-01' })), '__nobill__7', "'' → __nobill__id")
  assertEq(billGroupKey(row({ id: 9, bill: '   ', supp: 'A', date: '2025-01-01' })), '__nobill__9', "whitespace → __nobill__id")
}

// ────────────────────────────────────────────────────────────────────
// Test 3 — group A: เลขเดียว คนละบริษัท → 2 บิลแยก (IV6803645 จริง)
// ────────────────────────────────────────────────────────────────────
section('Test 3: group A — เลขชน คนละบริษัท')
{
  const groups = groupRowsByBill([
    row({ id: 87344, bill: 'IV6803645', supp: 'แอปคาร์', date: '2025-04-08', code: '1460152', qty: 100, price: 180 }),
    row({ id: 88002, bill: 'IV6803645', supp: 'บี.เอ็ล.ฮั้ว', date: '2025-04-08', code: '1660064', qty: 40, price: 128.4 }),
  ])
  assertEq(groups.length, 2, 'แยกเป็น 2 บิล')
  const apc = find(groups, g => g.supplier === 'แอปคาร์')
  const blh = find(groups, g => g.supplier === 'บี.เอ็ล.ฮั้ว')
  assertDeep(apc.item_ids, [87344], 'แอปคาร์ item_ids = [87344] เท่านั้น')
  assertDeep(blh.item_ids, [88002], 'บี.เอ็ล.ฮั้ว item_ids = [88002] เท่านั้น')
  assertEq(apc.total_value, 18000, 'แอปคาร์ total = 100×180 = 18000 (ไม่รวมของอีกบริษัท)')
  assertEq(blh.total_value, 5136, 'บี.เอ็ล.ฮั้ว total = 40×128.4 = 5136')
  assertEq(apc.bill_number, 'IV6803645', 'bill_number ยังเป็นเลขเดิม')
}

// ────────────────────────────────────────────────────────────────────
// Test 4 — group B: เลขเดียว บริษัทเดียว คนละวัน → แยกตามวัน
// ────────────────────────────────────────────────────────────────────
section('Test 4: group B — เลขชน คนละวันรับ')
{
  const groups = groupRowsByBill([
    row({ id: 1, bill: '5342833396', supp: 'DKSH', date: '2024-11-26', code: 'A', qty: 1, price: 21668 }),
    row({ id: 2, bill: '5342833396', supp: 'DKSH', date: '2024-11-27', code: 'B', qty: 1, price: 4012 }),
    row({ id: 3, bill: '5342833396', supp: 'DKSH', date: '2024-12-02', code: 'C', qty: 1, price: 1733 }),
    row({ id: 4, bill: '5342833396', supp: 'DKSH', date: '2024-12-20', code: 'D', qty: 1, price: 4931 }),
  ])
  assertEq(groups.length, 4, 'แยกเป็น 4 บิลตามวัน')
  // sort = receive_date desc → วันล่าสุดก่อน
  assertEq(groups[0].receive_date, '2024-12-20', 'group แรก = วันล่าสุด (sort desc)')
  assertDeep(groups.map(g => g.item_ids[0]).sort(), [1, 2, 3, 4], 'แต่ละวันมี item_id ของตัวเอง')
}

// ────────────────────────────────────────────────────────────────────
// Test 5 — บิลว่าง 2 แถว (คนละบริษัท) → ไม่ collapse รวมกัน
// ────────────────────────────────────────────────────────────────────
section('Test 5: บิลว่างไม่ collapse')
{
  const groups = groupRowsByBill([
    row({ id: 100, bill: '-', supp: 'บริษัท X', date: '2025-01-01', qty: 1, price: 10 }),
    row({ id: 101, bill: '', supp: 'บริษัท Y', date: '2025-01-02', qty: 1, price: 20 }),
  ])
  assertEq(groups.length, 2, 'บิลว่าง 2 แถว = 2 กลุ่ม (ไม่รวม)')
  assertEq(groups.every(g => g.bill_number === '-'), true, "bill_number แสดงเป็น '-'")
}

// ────────────────────────────────────────────────────────────────────
// Test 6 — 1 บิล หลายรายการยา + 1 ยาหลาย lot → drug_count vs item_count
// ────────────────────────────────────────────────────────────────────
section('Test 6: multi-drug + multi-lot (drug_count vs item_count)')
{
  const groups = groupRowsByBill([
    row({ id: 1, bill: 'B1', supp: 'S', date: '2025-03-01', code: 'D1', lot: 'L1', qty: 10, price: 5 }),
    row({ id: 2, bill: 'B1', supp: 'S', date: '2025-03-01', code: 'D1', lot: 'L2', qty: 20, price: 5 }), // ยาเดิม คนละ lot
    row({ id: 3, bill: 'B1', supp: 'S', date: '2025-03-01', code: 'D2', lot: 'L3', qty: 5, price: 100 }),
  ])
  assertEq(groups.length, 1, 'รวมเป็น 1 บิล')
  const g = groups[0]
  assertEq(g.item_count, 3, 'item_count = 3 (lot/แถว)')
  assertEq(g.drug_count, 2, 'drug_count = 2 (รหัสยาไม่ซ้ำ: D1, D2)')
  assertDeep(g.item_ids, [1, 2, 3], 'item_ids ครบทุกแถว')
  assertEq(g.total_value, 10 * 5 + 20 * 5 + 5 * 100, 'total = sum ทุกแถว = 650')
}

// ────────────────────────────────────────────────────────────────────
// Test 7 — total_value: ใช้ total_price_vat เมื่อ > 0, ไม่งั้น qty×price
// ────────────────────────────────────────────────────────────────────
section('Test 7: total_value VAT fallback')
{
  const groups = groupRowsByBill([
    row({ id: 1, bill: 'V', supp: 'S', date: '2025-01-01', qty: 10, price: 5, vat: 60 }),   // ใช้ vat 60
    row({ id: 2, bill: 'V', supp: 'S', date: '2025-01-01', qty: 10, price: 5, vat: 0 }),    // vat=0 → fallback 50
    row({ id: 3, bill: 'V', supp: 'S', date: '2025-01-01', qty: 10, price: 5, vat: null }), // null → fallback 50
  ])
  assertEq(groups[0].total_value, 60 + 50 + 50, 'total = 160 (vat ก่อน, ไม่งั้น qty×price)')
}

// ────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
if (fail === 0) {
  console.log(`✓ ผ่านทั้งหมด ${pass} assertions`)
} else {
  console.log(`✗ FAIL ${fail} / ${pass + fail} assertions:\n`)
  console.log(fails.join('\n\n'))
  process.exit(1)
}
