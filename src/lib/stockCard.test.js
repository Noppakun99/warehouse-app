// golden test: src/lib/stockCard.js — การ์ดคลัง lot (Stock Card)
// รัน: npm run test:stockcard   (standalone node ไม่มี framework ตาม convention repo)
// fixture อ้างอิงข้อมูลจริงจาก DB + สูตร Excel §45.5/§46.2 (Context.csv)

import { buildStockCard, filterStockCard, NO_DEDUCT, lotOf, dateSortKey } from './stockCard.js'

let pass = 0, fail = 0
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { pass++ }
  else { fail++; console.error(`  ✗ ${label}\n      คาดหวัง: ${e}\n      ได้: ${a}`) }
}
function section(name) { console.log(`\n=== ${name} ===`) }

// ── Test 1: เคสจริงจาก DB — Fluconazole 200mg lot K675202 ──
// receive_logs 0 แถว → opening = qty_before ของแถวเบิกแรก = 72 → 72 − 10 = 62 = inventory.qty
section('Test 1: Fluconazole K675202 (lot ไม่มีประวัติรับ → opening = qty_before)')
{
  const r = buildStockCard({
    receiveRows: [],
    dispenseRows: [{ dispense_date: '2026-03-16', lot: 'K675202', item_type: 'ยกยอด', qty_out: '10.00', qty_before: '72.00', department: 'ห้องยาG' }],
    pricePerUnit: 190,
  })
  eq(r.rows.length, 1, 'มี 1 movement')
  eq(r.rows[0].balance, 62, 'balance = 72 − 10 = 62 (ตรง inventory.qty จริง)')
  eq(r.lots[0].opening, 72, 'opening = 72')
  eq(r.lots[0].hasReceipt, false, 'ไม่มีประวัติรับเข้า')
  eq(r.lots[0].negative, false, 'ไม่ติดลบ')
  eq(r.rows[0].value, 1900, 'มูลค่า = 10 × 190')
}

// ── Test 2: lot มีประวัติรับเข้า → opening = 0 ──
section('Test 2: opening = 0 เมื่อ lot มีรับเข้า')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-10', lot: 'L1', item_type: 'ซื้อยา', qty_received: 100, supplier_current: 'บริษัทA', bill_number: 'B001' }],
    dispenseRows: [{ dispense_date: '2026-02-01', lot: 'L1', item_type: 'ยกยอด', qty_out: 30, qty_before: 999, department: 'ห้องยา1' }],
  })
  eq(r.lots[0].opening, 0, 'opening = 0 (ไม่ใช้ qty_before ทั้งที่มีค่า 999)')
  eq(r.rows.map(x => x.balance), [100, 70], 'balance ไล่ 100 → 70')
}

// ── Test 3: บันทึกเท่านั้น / แก้ไขระบบ ไม่หัก balance (Excel §46.3, §46.7) ──
section('Test 3: NO_DEDUCT ไม่หัก balance')
{
  eq(NO_DEDUCT.has('บันทึกเท่านั้น'), true, 'บันทึกเท่านั้น อยู่ใน NO_DEDUCT')
  eq(NO_DEDUCT.has('แก้ไขระบบ'), true, 'แก้ไขระบบ อยู่ใน NO_DEDUCT')
  eq(NO_DEDUCT.has('คืนยา'), false, 'คืนยา หักปกติ (ยึด Excel)')
  eq(NO_DEDUCT.has('ยืมยา'), false, 'ยืมยา หักปกติ')
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-01', lot: 'L2', item_type: 'ซื้อยา', qty_received: 50 }],
    dispenseRows: [
      { dispense_date: '2026-01-05', lot: 'L2', item_type: 'บันทึกเท่านั้น', qty_out: 10, qty_before: 50 },
      { dispense_date: '2026-01-06', lot: 'L2', item_type: 'แก้ไขระบบ', qty_out: 5, qty_before: 50 },
      { dispense_date: '2026-01-07', lot: 'L2', item_type: 'ยกยอด', qty_out: 20, qty_before: 50 },
    ],
  })
  eq(r.rows.map(x => x.balance), [50, 50, 50, 30], 'หักเฉพาะ ยกยอด → 50 − 20 = 30')
  eq(r.rows[1].qtyOut, 10, 'qtyOut ยังเก็บไว้แสดง (Excel: E ยังโชว์ 10 แต่ F ไม่หัก)')
  eq(r.rows[1].noDeduct, true, 'flag noDeduct ให้ UI ทำ CF ได้')
}

// ── Test 4: หลาย lot ไม่ปนกัน + เรียง lot ASC → date ASC ──
section('Test 4: running balance แยกต่อ lot')
{
  const r = buildStockCard({
    receiveRows: [
      { receive_date: '2026-01-01', lot: 'B', item_type: 'ซื้อยา', qty_received: 10 },
      { receive_date: '2026-01-01', lot: 'A', item_type: 'ซื้อยา', qty_received: 100 },
    ],
    dispenseRows: [
      { dispense_date: '2026-02-01', lot: 'A', item_type: 'ยกยอด', qty_out: 40, qty_before: 100 },
      { dispense_date: '2026-02-01', lot: 'B', item_type: 'ยกยอด', qty_out: 3, qty_before: 10 },
    ],
  })
  eq(r.rows.map(x => x.lot), ['A', 'A', 'B', 'B'], 'เรียง lot ASC')
  eq(r.rows.map(x => x.balance), [100, 60, 10, 7], 'balance แยกต่อ lot ไม่ปนกัน')
  eq(r.summary.lotCount, 2, 'นับ 2 lot')
}

// ── Test 5: ติดลบได้ (data gap) ไม่ throw ──
section('Test 5: balance ติดลบ = data gap ไม่ใช่บั๊ก')
{
  const r = buildStockCard({
    receiveRows: [],
    dispenseRows: [
      { dispense_date: '2026-01-01', lot: 'X', item_type: 'ยกยอด', qty_out: 50, qty_before: 20 },
    ],
  })
  eq(r.rows[0].balance, -30, 'opening 20 − 50 = −30')
  eq(r.lots[0].negative, true, 'flag negative')
  eq(r.summary.negativeLots, 1, 'นับ lot ติดลบ')
}

// ── Test 6: lot='-' (เวชภัณฑ์ไม่มีเลข lot) ──
section("Test 6: lot ว่าง/'-' normalize เป็น '-'")
{
  eq(lotOf(''), '-', "lot ว่าง → '-'")
  eq(lotOf('  '), '-', "lot ช่องว่าง → '-'")
  eq(lotOf('-'), '-', "'-' คงเดิม")
  eq(lotOf(' L9 '), 'L9', 'trim')
  eq(lotOf(null), '-', "null → '-'")
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-01', lot: '', item_type: 'ซื้อยา', qty_received: 200 }],
    dispenseRows: [{ dispense_date: '2026-01-09', lot: '-', item_type: 'ยกยอด', qty_out: 80, qty_before: 200 }],
  })
  eq(r.summary.lotCount, 1, "lot ว่างกับ '-' = lot เดียวกัน")
  eq(r.rows.map(x => x.balance), [200, 120], 'balance ต่อเนื่อง')
}

// ── Test 7: ขาเข้าก่อนขาออกในวันเดียวกัน ──
section('Test 7: วันเดียวกัน — รับเข้าก่อนเบิกออก')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-03-01', lot: 'S', item_type: 'ซื้อยา', qty_received: 60 }],
    dispenseRows: [{ dispense_date: '2026-03-01', lot: 'S', item_type: 'ยกยอด', qty_out: 25, qty_before: 60 }],
  })
  eq(r.rows.map(x => x.side), ['in', 'out'], 'in มาก่อน out')
  eq(r.rows.map(x => x.balance), [60, 35], 'ไม่ติดลบชั่วคราว')
}

// ── Test 8: คืนยา 2 ทิศทาง (CONTEXT.md §คืนยา) ──
section('Test 8: คืนยา ฝั่งรับ = เข้า, ฝั่งเบิก = ออก')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-07-16', lot: 'J690081', item_type: 'คืนยา', qty_received: 30, supplier_current: 'องค์การเภสัชกรรม', bill_number: 'ใบคืนยา' }],
    dispenseRows: [{ dispense_date: '2026-07-20', lot: 'J690081', item_type: 'คืนยา', qty_out: 5, qty_before: 30, department: 'ห้องยา1' }],
  })
  eq(r.rows[0].qtyIn, 30, 'ฝั่งรับ = qtyIn')
  eq(r.rows[1].qtyOut, 5, 'ฝั่งเบิก = qtyOut')
  eq(r.rows.map(x => x.balance), [30, 25], 'คืนยา หักปกติฝั่งออก')
  eq(r.rows[0].ref, 'ใบคืนยา', 'ref = เลขบิลฝั่งรับ')
  eq(r.rows[1].party, 'ห้องยา1', 'party = หน่วยงานฝั่งเบิก')
}

// ── Test 9: dateSortKey รองรับ ISO + DD/MM/YYYY + พ.ศ. ──
section('Test 9: dateSortKey')
{
  eq(dateSortKey('2026-03-16'), Date.UTC(2026, 2, 16), 'ISO')
  eq(dateSortKey('16/3/2026'), Date.UTC(2026, 2, 16), 'DD/MM/YYYY ค.ศ.')
  eq(dateSortKey('16/3/2569'), Date.UTC(2026, 2, 16), 'พ.ศ. → ค.ศ.')
  eq(dateSortKey(''), 0, 'ว่าง → 0')
  eq(dateSortKey('ขยะ'), 0, 'parse ไม่ได้ → 0')
}

// ── Test 10: qty_before null → opening 0 ──
section('Test 10: qty_before null (112 แถวจริงใน DB)')
{
  const r = buildStockCard({
    receiveRows: [],
    dispenseRows: [{ dispense_date: '2026-01-01', lot: 'N', item_type: 'ยกยอด', qty_out: 5, qty_before: null }],
  })
  eq(r.lots[0].opening, 0, 'opening fallback 0')
  eq(r.rows[0].balance, -5, 'balance ติดลบ (data gap ที่ถูกต้อง)')
}

// ── Test 11: filterStockCard (เฟส ข) ──
section('Test 11: filter แยกจาก build')
{
  const { rows } = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-01', lot: 'A', item_type: 'ซื้อยา', qty_received: 10 }],
    dispenseRows: [
      { dispense_date: '2026-02-15', lot: 'A', item_type: 'ยกยอด', qty_out: 2, qty_before: 10 },
      { dispense_date: '2026-03-20', lot: 'B', item_type: 'บันทึกเท่านั้น', qty_out: 1, qty_before: 5 },
    ],
  })
  eq(filterStockCard(rows, { lot: 'A' }).length, 2, 'กรอง lot')
  eq(filterStockCard(rows, { kind: 'บันทึกเท่านั้น' }).length, 1, 'กรองชนิดรายการ')
  eq(filterStockCard(rows, { from: '2026-02-01' }).length, 2, 'กรองวันที่เริ่ม')
  eq(filterStockCard(rows, { from: '2026-02-01', to: '2026-02-28' }).length, 1, 'กรองช่วงวันที่')
  eq(filterStockCard(rows, {}).length, 3, 'ไม่กรอง = ครบ')
}

// ── Test 12: summary + qty มี comma ──
section('Test 12: summary + parse comma')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-01', lot: 'C', item_type: 'ซื้อยา', qty_received: '1,200' }],
    dispenseRows: [{ dispense_date: '2026-01-02', lot: 'C', item_type: 'ยกยอด', qty_out: '200', qty_before: '1,200' }],
  })
  eq(r.summary.totalIn, 1200, 'parse "1,200" → 1200')
  eq(r.summary.totalOut, 200, 'totalOut')
  eq(r.rows[1].balance, 1000, 'balance = 1200 − 200')
}

// ── Test 13: drift detection — เคสจริง Atorvastatin 40mg lot CH553 ──
// รับ 5,000+100 แต่แถวเบิกแรกบันทึก qty_before=2,400 → หาย 2,700 โดยไม่มีแถวเบิก
// = "Group B Data Gap" ที่คลังเจอเองใน Excel (Context.csv:1508) — Excel detect ไม่ได้ แอปทำได้
section('Test 13: drift detection (Atorvastatin CH553 — data gap จริง)')
{
  const r = buildStockCard({
    receiveRows: [
      { receive_date: '2025-08-18', lot: 'CH553', item_type: 'ซื้อยา', qty_received: 5000 },
      { receive_date: '2025-08-18', lot: 'CH553', item_type: 'ซื้อยา', qty_received: 100 },
    ],
    dispenseRows: [
      { dispense_date: '2025-10-06', lot: 'CH553', item_type: 'ยกยอด', qty_out: 400, qty_before: 2400 },
    ],
  })
  const out = r.rows.find(x => x.side === 'out')
  eq(out.qtyBefore, 2400, 'เก็บ qty_before ที่ต้นทางบันทึก')
  eq(out.drift, 2700, 'drift = 5100 (คำนวณ) − 2400 (บันทึก) = 2700')
  eq(out.hasDrift, true, 'flag hasDrift')
  eq(r.lots[0].driftCount, 1, 'นับแถว drift ต่อ lot')
  eq(r.lots[0].lastDrift, 2700, 'lastDrift = ขนาดช่องว่างล่าสุด')
  eq(r.summary.driftLots, 1, 'summary นับ lot ที่มี drift')
  eq(r.summary.driftRows, 1, 'summary นับแถว drift')
}

// ── Test 14: ไม่มี drift เมื่อยอดตรง + แถวรับไม่นับ drift ──
section('Test 14: ยอดตรง → drift = 0, แถวรับ → drift = null')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-01', lot: 'OK', item_type: 'ซื้อยา', qty_received: 100 }],
    dispenseRows: [
      { dispense_date: '2026-01-05', lot: 'OK', item_type: 'ยกยอด', qty_out: 30, qty_before: 100 },
      { dispense_date: '2026-01-09', lot: 'OK', item_type: 'ยกยอด', qty_out: 20, qty_before: 70 },
    ],
  })
  eq(r.rows[0].drift, null, 'แถวรับเข้า → drift = null (เทียบไม่ได้)')
  eq(r.rows[0].hasDrift, false, 'แถวรับไม่ flag')
  eq(r.rows[1].drift, 0, 'เบิกแรก: 100 − 100 = 0')
  eq(r.rows[2].drift, 0, 'เบิกสอง: 70 − 70 = 0')
  eq(r.summary.driftLots, 0, 'ไม่มี lot drift')
}

// ── Test 15: qty_before null → ไม่ flag drift (กัน false positive 112 แถวจริง) ──
section('Test 15: qty_before null → drift = null ไม่ใช่ 0')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-01', lot: 'Z', item_type: 'ซื้อยา', qty_received: 10 }],
    dispenseRows: [{ dispense_date: '2026-01-02', lot: 'Z', item_type: 'ยกยอด', qty_out: 3, qty_before: null }],
  })
  eq(r.rows[1].drift, null, 'ไม่มี qty_before → เทียบไม่ได้ → null')
  eq(r.rows[1].hasDrift, false, 'ไม่ flag เป็น drift (กัน false positive)')
  eq(r.summary.driftRows, 0, 'ไม่นับเข้า summary')
}

// ── Test 16: balanceBefore ต้องถูกแม้แถว NO_DEDUCT (bug ที่เจอตอน /scrutinize) ──
// แถว บันทึกเท่านั้น ไม่ถูกหัก → balance+qtyOut จะเกินไป qtyOut → โมดอลแสดงเลขผิด
section('Test 16: balanceBefore vs balance+qtyOut (NO_DEDUCT)')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-01', lot: 'A', item_type: 'ซื้อยา', qty_received: 100 }],
    dispenseRows: [{ dispense_date: '2026-01-05', lot: 'A', item_type: 'บันทึกเท่านั้น', qty_out: 10, qty_before: 60 }],
  })
  const row = r.rows[1]
  eq(row.balanceBefore, 100, 'balanceBefore = ยอดก่อนแถวนี้จริง (100)')
  eq(row.balance, 100, 'balance ไม่ถูกหัก (NO_DEDUCT)')
  eq(row.balance + row.qtyOut, 110, 'balance+qtyOut = 110 → ผิด ห้ามใช้สูตรนี้ใน UI')
  eq(row.drift, 40, 'drift = 100 − 60 = 40 (ตรงกับ balanceBefore ไม่ใช่ 110)')
  eq(row.balanceBefore - row.qtyBefore, row.drift, 'ตัวเลขในโมดอล reconcile กับ drift ได้')
}

// ── Test 17: balanceBefore ของแถวหักปกติ ──
section('Test 17: balanceBefore แถวหักปกติ')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-01', lot: 'B', item_type: 'ซื้อยา', qty_received: 100 }],
    dispenseRows: [{ dispense_date: '2026-01-05', lot: 'B', item_type: 'ยกยอด', qty_out: 30, qty_before: 100 }],
  })
  const row = r.rows[1]
  eq(row.balanceBefore, 100, 'balanceBefore = 100')
  eq(row.balance, 70, 'balance = 100 − 30')
  eq(row.balanceBefore - row.qtyBefore, 0, 'ยอดตรง → drift 0')
  eq(row.hasDrift, false, 'ไม่ flag')
}

// ── Test 18: driftDelta — เตือนเฉพาะจุดที่ของหายจริง (เคสจริง lot 194584) ──
// รับ 100 (22/09) แต่แถวเบิกแรก 06/10 บันทึก qty_before=91 → หาย 9 ตรงจุดนั้นจุดเดียว
// แถวถัดๆ ไป qty_before ต่อกันเป๊ะ → drift ค้าง 9 เท่าเดิม ไม่ใช่ของหายซ้ำ → ต้องไม่เตือน
section('Test 18: driftDelta — lot 194584 (ของหายจุดเดียว ไม่เตือนซ้ำ)')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2025-09-22', lot: '194584', item_type: 'ซื้อยา', qty_received: 100 }],
    dispenseRows: [
      { dispense_date: '2025-10-06', lot: '194584', item_type: 'ยกยอด', qty_out: 5, qty_before: 91 },
      { dispense_date: '2025-10-06', lot: '194584', item_type: 'ยกยอด', qty_out: 1, qty_before: 86 },
      { dispense_date: '2025-10-14', lot: '194584', item_type: 'ยกยอด', qty_out: 5, qty_before: 85 },
      { dispense_date: '2025-10-20', lot: '194584', item_type: 'ยกยอด', qty_out: 10, qty_before: 80 },
    ],
  })
  const outs = r.rows.filter(x => x.side === 'out')
  eq(outs.map(x => x.drift), [9, 9, 9, 9], 'drift ค้าง 9 ทุกแถว (สะสม)')
  eq(outs.map(x => x.driftDelta), [9, 0, 0, 0], 'driftDelta: หาย 9 แถวแรกจุดเดียว ที่เหลือ 0')
  eq(outs.map(x => x.isDriftPoint), [true, false, false, false], 'เตือนแค่แถวแรก')
  eq(r.summary.driftRows, 1, 'summary นับ 1 จุด (ไม่ใช่ 4 แถว)')
  eq(r.lots[0].driftCount, 1, 'lot นับ 1 จุด')
  eq(r.lots[0].lastDrift, 9, 'lastDrift = ช่องว่างสะสม 9')
}

// ── Test 19: drift หลายจุดใน lot เดียว → เตือนทุกจุดที่เปลี่ยน ──
section('Test 19: ของหาย 2 จุด → เตือน 2 จุด')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-01', lot: 'M', item_type: 'ซื้อยา', qty_received: 100 }],
    dispenseRows: [
      { dispense_date: '2026-01-05', lot: 'M', item_type: 'ยกยอด', qty_out: 10, qty_before: 90 },  // หาย 10
      { dispense_date: '2026-01-10', lot: 'M', item_type: 'ยกยอด', qty_out: 10, qty_before: 80 },  // ต่อเนื่อง
      { dispense_date: '2026-01-15', lot: 'M', item_type: 'ยกยอด', qty_out: 5, qty_before: 65 },   // หายอีก 5
    ],
  })
  const outs = r.rows.filter(x => x.side === 'out')
  eq(outs.map(x => x.drift), [10, 10, 15], 'drift สะสม 10 → 10 → 15')
  eq(outs.map(x => x.driftDelta), [10, 0, 5], 'delta: 10, ไม่หาย, หายอีก 5')
  eq(outs.map(x => x.isDriftPoint), [true, false, true], 'เตือน 2 จุด')
  eq(r.summary.driftRows, 2, 'summary นับ 2 จุด')
}

// ── Test 20: ยอดตรงตลอด → ไม่มีจุดเตือน ──
section('Test 20: ยอดตรงตลอด → 0 จุด')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-01', lot: 'OK2', item_type: 'ซื้อยา', qty_received: 50 }],
    dispenseRows: [
      { dispense_date: '2026-01-05', lot: 'OK2', item_type: 'ยกยอด', qty_out: 20, qty_before: 50 },
      { dispense_date: '2026-01-06', lot: 'OK2', item_type: 'ยกยอด', qty_out: 10, qty_before: 30 },
    ],
  })
  eq(r.rows.filter(x => x.isDriftPoint).length, 0, 'ไม่มีจุดเตือน')
  eq(r.summary.driftLots, 0, 'ไม่มี lot drift')
}

// ── Test 21: rowErr — ต้นทางกรอกผิดในแถวเดียวกัน (เคสจริง Naproxen F681020) ──
// ก่อนเบิก 10 เบิก 40 แต่หลังเบิกยังเป็น 10 → Excel ไม่ได้ตัดยอด (พบจริง 55 แถวใน DB)
section('Test 21: rowErr — ก่อน − ออก ≠ หลัง (คนกรอกผิด)')
{
  const r = buildStockCard({
    receiveRows: [],
    dispenseRows: [
      { dispense_date: '2026-06-02', lot: 'F681020', item_type: 'ยกยอด', qty_out: 40, qty_before: 10, qty_after: 10 },
    ],
  })
  const row = r.rows[0]
  eq(row.qtyAfter, 10, 'เก็บ qty_after')
  eq(row.rowErr, -40, 'rowErr = (10 − 40) − 10 = −40')
  eq(row.hasRowErr, true, 'flag hasRowErr')
  eq(r.summary.rowErrRows, 1, 'summary นับแถวกรอกผิด')
}

// ── Test 22: สมการในแถวถูก → ไม่ flag (แยกจาก drift) ──
section('Test 22: แถวถูก แต่มี drift → flag แค่ drift')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2025-09-22', lot: '194584', item_type: 'ซื้อยา', qty_received: 100 }],
    dispenseRows: [
      { dispense_date: '2025-10-06', lot: '194584', item_type: 'ยกยอด', qty_out: 5, qty_before: 91, qty_after: 86 },
    ],
  })
  const row = r.rows[1]
  eq(row.rowErr, 0, 'สมการในแถวถูก: 91 − 5 = 86')
  eq(row.hasRowErr, false, 'ไม่ flag กรอกผิด — การเบิกครั้งนี้ไม่ผิด')
  eq(row.isDriftPoint, true, 'แต่ยอดตั้งต้นไม่ตรง → flag drift')
  eq(r.summary.rowErrRows, 0, 'ไม่มีแถวกรอกผิด')
  eq(r.summary.driftRows, 1, 'มี 1 จุด drift')
}

// ── Test 23: qty_after null → เทียบสมการไม่ได้ (1,243 แถวจริงใน DB) ──
section('Test 23: qty_after null → rowErr = null')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-01', lot: 'Q', item_type: 'ซื้อยา', qty_received: 50 }],
    dispenseRows: [{ dispense_date: '2026-01-05', lot: 'Q', item_type: 'ยกยอด', qty_out: 10, qty_before: 50, qty_after: null }],
  })
  eq(r.rows[1].rowErr, null, 'ไม่มี qty_after → เทียบไม่ได้')
  eq(r.rows[1].hasRowErr, false, 'ไม่ flag (กัน false positive)')
}

// ── Test 24: แยก drift ที่มาจากการย้ายข้อมูล Excel ออกจากของหายจริง ──
// 52% ของ drift ทั้งระบบ (181/347 lots) มาจาก note "unpivot" = ประวัติก่อน ต.ค.68 ไม่ครบ
section('Test 24: fromMigration แยกออกจาก driftRowsReal')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2025-09-22', lot: 'M1', item_type: 'ซื้อยา', qty_received: 100 }],
    dispenseRows: [
      { dispense_date: '2025-10-06', lot: 'M1', item_type: 'ยกยอด', qty_out: 5, qty_before: 91, note: 'นำเข้าจาก ต.ค.68 (unpivot)' },
    ],
  })
  const row = r.rows[1]
  eq(row.fromMigration, true, 'note มี unpivot → fromMigration')
  eq(row.isDriftPoint, true, 'ยังนับเป็นจุด drift')
  eq(r.summary.driftRows, 1, 'driftRows นับรวม')
  eq(r.summary.driftRowsReal, 0, 'driftRowsReal ไม่นับ (ไม่ใช่ของหายจริง)')
  eq(r.summary.driftRowsMigration, 1, 'driftRowsMigration นับ')
}

// ── Test 25: drift ที่ไม่ใช่ migration → นับเป็นของจริง ──
section('Test 25: drift ปกติ (ไม่มี note migration) → driftRowsReal')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-01', lot: 'R1', item_type: 'ซื้อยา', qty_received: 100 }],
    dispenseRows: [
      { dispense_date: '2026-02-01', lot: 'R1', item_type: 'ยกยอด', qty_out: 5, qty_before: 90, note: null },
    ],
  })
  eq(r.rows[1].fromMigration, false, 'ไม่มี note migration')
  eq(r.summary.driftRowsReal, 1, 'นับเป็นของหายจริง')
  eq(r.summary.driftRowsMigration, 0, 'ไม่นับเป็น migration')
}

console.log('\n' + '─'.repeat(50))
if (fail === 0) {
  console.log(`✓ ผ่านทั้งหมด ${pass} assertions`)
} else {
  console.error(`✗ ไม่ผ่าน ${fail} จาก ${pass + fail} assertions`)
  // throw แทน process.exit → node จบด้วย exit code ≠ 0 เหมือนกัน แต่ไม่ต้องใช้ global process (eslint browser env)
  throw new Error(`stockCard golden test failed: ${fail}/${pass + fail}`)
}
