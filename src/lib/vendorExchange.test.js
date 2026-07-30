// golden test: src/lib/vendorExchange.js — รอบเปลี่ยน/คืนบริษัท (ของลอย)
// รัน: npm run test:vendorexchange
// fixture = เคสจริงจาก DB (Omeprazole, Carvedilol, Digoxin, Pioglitazone)

import { buildVendorExchanges, dateKey } from './vendorExchange.js'

let pass = 0, fail = 0
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) pass++
  else { fail++; console.error(`  ✗ ${label}\n      คาดหวัง: ${e}\n      ได้: ${a}`) }
}
function section(n) { console.log(`\n=== ${n} ===`) }

const TODAY = new Date(2026, 6, 30)   // 30/07/2026

// ── Test 1: จับคู่ได้ + lot เปลี่ยนระหว่างทาง (เคสจริง Digoxin) ──
section('Test 1: Digoxin — ส่ง 8180005 ได้ 9180002 คืน (lot เปลี่ยน)')
{
  const r = buildVendorExchanges({
    dispenseRows: [{ drug_code: '1000113', drug_name: 'Digoxin 0.25mg', lot: '8180005', item_type: 'คืนยา', qty_out: 5, dispense_date: '2026-06-01' }],
    receiveRows: [{ drug_code: '1000113', lot: '9180002', qty_received: 5, receive_date: '2026-06-23', bill_number: 'แลกเปลี่ยนยาหมดอายุ ,SS6906/00062', supplier_current: 'ที.โอ.เคมีคอลส์' }],
    supplierByLot: { '1000113|8180005': 'ที.โอ.เคมีคอลส์' },
    today: TODAY,
  })
  eq(r.summary.matchedCount, 1, 'จับคู่ได้ 1 รอบ')
  eq(r.summary.openCount, 0, 'ไม่มีของลอย')
  eq(r.matched[0].lotChanged, true, 'lot เปลี่ยน → flag')
  eq(r.matched[0].returnLot, '9180002', 'lot ที่ได้คืน')
  eq(r.matched[0].daysToReturn, 22, 'ใช้เวลา 22 วัน')
  eq(r.matched[0].qtyMismatch, false, 'จำนวนตรง')
}

// ── Test 2: ของลอย — ส่งแล้วยังไม่ได้คืน ──
section('Test 2: ของลอย + นับวันค้าง')
{
  const r = buildVendorExchanges({
    dispenseRows: [{ drug_code: 'X1', drug_name: 'ยา A', lot: 'L1', item_type: 'แลกเปลี่ยนยา', qty_out: 200, dispense_date: '2026-07-08' }],
    receiveRows: [],
    supplierByLot: { 'x1|l1': 'บริษัท A' },
    today: TODAY,
  })
  eq(r.summary.openCount, 1, 'มีของลอย 1 รายการ')
  eq(r.summary.openQty, 200, 'จำนวนที่ค้าง')
  eq(r.open[0].daysWaiting, 22, 'ค้างมา 22 วัน')
  eq(r.summary.oldestWaitingDays, 22, 'ค้างนานสุด')
}

// ── Test 3: แถวแก้ข้อมูลย้อนหลัง ไม่นับเป็นรอบใหม่ (เคสจริง Carvedilol) ──
// ส่ง 20 (25/5) แล้วมีแถว 20 อีกครั้ง (15/6) note "ระบบผิดพลาด" = ชดเชย ไม่ใช่ส่งเพิ่ม
section('Test 3: Carvedilol — แถว "ระบบผิดพลาด" ไม่นับ')
{
  const r = buildVendorExchanges({
    dispenseRows: [
      { drug_code: '1000055', drug_name: 'Carvedilol 12.5mg', lot: 'T685003', item_type: 'คืนยา', qty_out: 20, dispense_date: '2026-05-25', note: 'มี2lot' },
      { drug_code: '1000055', drug_name: 'Carvedilol 12.5mg', lot: 'T685003', item_type: 'คืนยา', qty_out: 20, dispense_date: '2026-06-15', note: 'เบิกไป วันที่ 25/5/202 ระบบผิดพลาด' },
    ],
    receiveRows: [],
    today: TODAY,
  })
  eq(r.summary.openCount, 1, 'นับแค่รอบจริง 1 (ไม่ใช่ 2)')
  eq(r.summary.openQty, 20, 'ของลอย 20 ไม่ใช่ 40')
}

// ── Test 4: qty_out = 0 "รอแลกเปลี่ยน" ไม่นับ (เคสจริง Omeprazole) ──
section('Test 4: Omeprazole — แถว "เบิก 400 จ่าย 0 รอแลกเปลี่ยน" ไม่นับ')
{
  const r = buildVendorExchanges({
    dispenseRows: [
      { drug_code: '1501143', drug_name: 'Omeprazole 40mg/ml', lot: 'NP26099A', item_type: 'แลกเปลี่ยนยา', qty_out: 200, dispense_date: '2026-07-08', note: 'เบิกเพื่อ ทดแทนยาที่มีการเรียกเก็บคืนไป' },
      { drug_code: '1501143', drug_name: 'Omeprazole 40mg/ml', lot: 'NP26099A', item_type: 'แลกเปลี่ยนยา', qty_out: 0, dispense_date: '2026-07-13', note: 'เบิก 400 จ่าย 0 รอแลกเปลี่ยนยาจากยริษัท' },
      { drug_code: '1501143', drug_name: 'Omeprazole 40mg/ml', lot: 'NP26101A', item_type: 'แลกเปลี่ยนยา', qty_out: 200, dispense_date: '2026-07-17', note: 'เบิกเพื่อ ทดแทนยาที่มีการเรียกเก็บคืนไป' },
    ],
    receiveRows: [],
    today: TODAY,
  })
  eq(r.summary.openCount, 2, 'นับ 2 รอบ (ตัดแถว qty 0 ออก)')
  eq(r.summary.openQty, 400, 'รวม 400')
}

// ── Test 5: ขาเข้าต้องเกิดหลังขาออก ──
section('Test 5: ขาเข้าก่อนขาออก → ไม่จับคู่')
{
  const r = buildVendorExchanges({
    dispenseRows: [{ drug_code: 'Y1', lot: 'A', item_type: 'คืนยา', qty_out: 10, dispense_date: '2026-07-20' }],
    receiveRows: [{ drug_code: 'Y1', lot: 'B', qty_received: 10, receive_date: '2026-07-01', bill_number: 'ใบคืนยา' }],
    today: TODAY,
  })
  eq(r.summary.matchedCount, 0, 'ไม่จับคู่ (ของเข้ามาก่อน)')
  eq(r.summary.openCount, 1, 'ยังเป็นของลอย')
}

// ── Test 6: บิลซื้อปกติไม่นับเป็นของทดแทน ──
section('Test 6: บิลซื้อปกติ → ไม่จับคู่')
{
  const r = buildVendorExchanges({
    dispenseRows: [{ drug_code: 'Z1', lot: 'A', item_type: 'คืนยา', qty_out: 10, dispense_date: '2026-07-01' }],
    receiveRows: [{ drug_code: 'Z1', lot: 'B', qty_received: 10, receive_date: '2026-07-10', bill_number: 'DSP6802085' }],
    today: TODAY,
  })
  eq(r.summary.matchedCount, 0, 'บิลซื้อปกติไม่ใช่ของทดแทน')
  eq(r.summary.openCount, 1, 'ยังค้าง')
}

// ── Test 7: จำนวนไม่ตรง → flag ──
section('Test 7: ได้คืนไม่ครบ → qtyMismatch')
{
  const r = buildVendorExchanges({
    dispenseRows: [{ drug_code: 'W1', lot: 'A', item_type: 'แลกเปลี่ยนยา', qty_out: 100, dispense_date: '2026-06-01' }],
    receiveRows: [{ drug_code: 'W1', lot: 'A2', qty_received: 60, receive_date: '2026-06-20', bill_number: 'ใบคืนยา' }],
    today: TODAY,
  })
  eq(r.matched[0].qtyMismatch, true, 'ส่ง 100 ได้คืน 60 → flag')
  eq(r.matched[0].returnedQty, 60, 'จำนวนที่ได้คืน')
  eq(r.summary.qtyMismatchCount, 1, 'summary นับ')
}

// ── Test 8: บริษัทต่างกัน → ไม่จับคู่ (กันจับผิดเจ้า ADR-0012) ──
section('Test 8: คนละบริษัท → ไม่จับคู่')
{
  const r = buildVendorExchanges({
    dispenseRows: [{ drug_code: 'V1', lot: 'A', item_type: 'คืนยา', qty_out: 5, dispense_date: '2026-06-01' }],
    receiveRows: [{ drug_code: 'V1', lot: 'B', qty_received: 5, receive_date: '2026-06-10', bill_number: 'ใบคืนยา', supplier_current: 'บริษัท B' }],
    supplierByLot: { 'v1|a': 'บริษัท A' },
    today: TODAY,
  })
  eq(r.summary.matchedCount, 0, 'บริษัทไม่ตรง → ไม่จับคู่')
  eq(r.summary.openCount, 1, 'ยังค้าง')
}

// ── Test 9: greedy — ขาออกเก่าสุดได้จับคู่ก่อน ──
section('Test 9: หลายรอบซ้อน → เรียงตามเวลา')
{
  const r = buildVendorExchanges({
    dispenseRows: [
      { drug_code: 'M', lot: 'L1', item_type: 'คืนยา', qty_out: 10, dispense_date: '2026-05-01' },
      { drug_code: 'M', lot: 'L2', item_type: 'คืนยา', qty_out: 20, dispense_date: '2026-06-01' },
    ],
    receiveRows: [{ drug_code: 'M', lot: 'R1', qty_received: 10, receive_date: '2026-05-15', bill_number: 'ใบคืนยา' }],
    today: TODAY,
  })
  eq(r.summary.matchedCount, 1, 'จับคู่ได้ 1')
  eq(r.matched[0].date, '2026-05-01', 'รอบเก่าสุดได้จับคู่ก่อน')
  eq(r.open[0].date, '2026-06-01', 'รอบใหม่ยังค้าง')
}

// ── Test 10: dateKey รองรับ พ.ศ. ──
section('Test 10: dateKey')
{
  eq(dateKey('2026-07-08'), Date.UTC(2026, 6, 8), 'ISO')
  eq(dateKey('8/7/2569'), Date.UTC(2026, 6, 8), 'พ.ศ. → ค.ศ.')
  eq(dateKey(''), 0, 'ว่าง')
}

// ── Test 11: ชนิดรายการที่ไม่ใช่รอบเปลี่ยนคืน → ไม่นับ ──
section('Test 11: ยกยอด/ซื้อยา ไม่ใช่รอบเปลี่ยนคืน')
{
  const r = buildVendorExchanges({
    dispenseRows: [
      { drug_code: 'N', lot: 'A', item_type: 'ยกยอด', qty_out: 50, dispense_date: '2026-07-01' },
      { drug_code: 'N', lot: 'A', item_type: 'ยืมยา', qty_out: 5, dispense_date: '2026-07-02' },
    ],
    receiveRows: [],
    today: TODAY,
  })
  eq(r.summary.openCount, 0, 'ยกยอด/ยืมยา ไม่นับเป็นรอบคืนบริษัท')
}

console.log('\n' + '─'.repeat(50))
if (fail === 0) {
  console.log(`✓ ผ่านทั้งหมด ${pass} assertions`)
} else {
  console.error(`✗ ไม่ผ่าน ${fail} จาก ${pass + fail} assertions`)
  throw new Error(`vendorExchange golden test failed: ${fail}/${pass + fail}`)
}
