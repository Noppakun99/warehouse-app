// golden test: src/lib/stockCard.js — การ์ดคลัง lot (Stock Card)
// รัน: npm run test:stockcard   (standalone node ไม่มี framework ตาม convention repo)
// fixture อ้างอิงข้อมูลจริงจาก DB + สูตร Excel §45.5/§46.2 (Context.csv)

import { buildStockCard, filterStockCard, NO_DEDUCT, lotOf, dateSortKey, orderLots, defaultLot, sortRowsByDate, kindBadgeOf, rowTitle, displayRef, rowIssues, SYSTEM_START } from './stockCard.js'

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
  eq(NO_DEDUCT.has('แก้ไขระบบ'), false, 'แก้ไขระบบ หักปกติ (user สั่ง 14/11/2569 — ชีทหักจริง)')
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
  eq(r.rows.map(x => x.balance), [50, 50, 45, 25], 'บันทึกเท่านั้น ไม่หัก · แก้ไขระบบ หัก 5 · ยกยอด หัก 20 → 25')
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

// ── Test 13: drift detection — รับ 5,000+100 แต่แถวเบิกแรกบันทึก qty_before=2,400 ──
// → หาย 2,700 โดยไม่มีแถวเบิก (Excel detect ไม่ได้ แอปทำได้)
// เดิมเป็นเคสจริง CH553 (รับ 18/08/68) — 14/11/2569 พบว่าเป็นการเบิกก่อนเริ่มระบบ ไม่ใช่ของหาย
// จึงย้ายวันรับมาหลัง SYSTEM_START เพื่อทดสอบกลไก drift · เคสจริงอยู่ Test 34
section('Test 13: drift detection (รับหลังเริ่มระบบ แต่ก่อนเบิกขาด)')
{
  const r = buildStockCard({
    receiveRows: [
      { receive_date: '2025-10-01', lot: 'CH553', item_type: 'ซื้อยา', qty_received: 5000 },
      { receive_date: '2025-10-01', lot: 'CH553', item_type: 'ซื้อยา', qty_received: 100 },
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
    receiveRows: [{ receive_date: '2025-10-01', lot: '194584', item_type: 'ซื้อยา', qty_received: 100 }],
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
    receiveRows: [{ receive_date: '2025-10-01', lot: '194584', item_type: 'ซื้อยา', qty_received: 100 }],
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
    receiveRows: [{ receive_date: '2025-10-01', lot: 'M1', item_type: 'ซื้อยา', qty_received: 100 }],
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

// ── Test 26–33: ข้อมูลหน้าการ์ดคลังแบบใหม่ (13/11/2569 — docs/features/stock-card.md) ──
section('Test 26: lot — exp/รับรวม/เบิกรวม (เบิกรวมไม่นับแถวไม่หักยอด) + สมการยอด')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-01', lot: 'A', item_type: 'ซื้อยา', qty_received: 100, exp: '2027-05-31' }],
    dispenseRows: [
      { dispense_date: '2026-02-01', lot: 'A', item_type: 'ยกยอด', qty_out: 30, qty_before: 100, qty_after: 70, exp: '31/05/2027' },
      { dispense_date: '2026-02-02', lot: 'A', item_type: 'บันทึกเท่านั้น', qty_out: 5, qty_before: 70, qty_after: 70 },
    ],
  })
  const a = r.lots[0]
  eq(a.exp, '2027-05-31', 'exp จากแถวรับเข้าก่อน')
  eq(a.totalIn, 100, 'รับรวม')
  eq(a.totalOut, 30, 'เบิกรวมไม่นับบันทึกเท่านั้น')
  eq(a.opening + a.totalIn - a.totalOut, a.closing, 'ยอดตั้งต้น + รับ − เบิก = คงเหลือ')
  eq(a.warn, false, 'ไม่มีปัญหา → ไม่เตือน')
}

section('Test 27: lot ไม่มีแถวรับ → exp จากแถวเบิกล่าสุด · ว่าง/"-" ข้าม')
{
  const r = buildStockCard({
    dispenseRows: [
      { dispense_date: '2026-01-01', lot: 'B', qty_out: 1, qty_before: 10, exp: '2027-01-01' },
      { dispense_date: '2026-02-01', lot: 'B', qty_out: 1, qty_before: 9, exp: '-' },
    ],
  })
  eq(r.lots[0].exp, '2027-01-01', 'ข้าม "-"')
}

section('Test 28: นับยอดไม่ตรงจริง vs ข้อมูลก่อนเริ่มใช้ระบบ vs กรอกผิด → warn')
{
  const r = buildStockCard({
    receiveRows: [
      { receive_date: '2025-10-01', lot: 'M', qty_received: 100 },
      { receive_date: '2026-01-01', lot: 'R', qty_received: 100 },
    ],
    dispenseRows: [
      { dispense_date: '2025-10-01', lot: 'M', qty_out: 5, qty_before: 80, note: 'นำเข้าจาก ต.ค.68 (unpivot)' },
      { dispense_date: '2026-02-01', lot: 'R', qty_out: 5, qty_before: 90, qty_after: 80 },
    ],
  })
  const m = r.lots.find(l => l.lot === 'M'), rr = r.lots.find(l => l.lot === 'R')
  eq([m.driftReal, m.driftMigration, m.rowErrCount, m.warn], [0, 1, 0, false], 'migration อย่างเดียว = ไม่เตือน')
  eq([rr.driftReal, rr.driftMigration, rr.rowErrCount, rr.warn], [1, 0, 1, true], 'ยอดไม่ตรงจริง + กรอกผิด = เตือน')
}

section('Test 29: orderLots — เตือน → มีของ exp เร็วก่อน → หมดแล้วท้าย')
{
  const lots = [
    { lot: 'empty', warn: false, closing: 0, exp: '2026-01-01' },
    { lot: 'late', warn: false, closing: 5, exp: '2028-01-01' },
    { lot: 'noexp', warn: false, closing: 5, exp: '' },
    { lot: 'early', warn: false, closing: 5, exp: '15/03/2570' },
    { lot: 'bad', warn: true, closing: 0, exp: '2029-01-01' },
  ]
  eq(orderLots(lots).map(l => l.lot), ['bad', 'early', 'late', 'noexp', 'empty'], 'ลำดับ lot (exp พ.ศ. อ่านได้ · ไม่มี exp ท้ายกลุ่ม)')
  eq(defaultLot(lots), 'bad', 'เปิด lot ที่มีป้ายเตือนก่อน')
  eq(defaultLot(lots.filter(l => !l.warn)), 'early', 'ไม่มีเตือน → มีของ exp เร็วสุด')
  eq(defaultLot([{ lot: 'x', warn: false, closing: 0, exp: '' }]), null, 'หมดทุก lot → null (ดูทุก lot)')
  eq(defaultLot([]), null, 'ไม่มี lot → null')
}

section('Test 30: sortRowsByDate — ข้าม lot เรียงวัน รับก่อนเบิก')
{
  const r = buildStockCard({
    receiveRows: [
      { receive_date: '2026-03-01', lot: 'B', qty_received: 10 },
      { receive_date: '2026-01-01', lot: 'A', qty_received: 10 },
    ],
    dispenseRows: [
      { dispense_date: '2026-03-01', lot: 'A', qty_out: 1, qty_before: 10 },
      { dispense_date: '2026-02-01', lot: 'B', qty_out: 1, qty_before: 0 },
    ],
  })
  eq(sortRowsByDate(r.rows).map(x => `${x.date}|${x.lot}|${x.side}`),
    ['2026-01-01|A|in', '2026-02-01|B|out', '2026-03-01|B|in', '2026-03-01|A|out'], 'เรียงวัน → รับก่อนเบิก')
  eq(r.rows.length, 4, 'ไม่แตะ array เดิม')
}

section('Test 31: ป้ายชนิดรายการ + คอลัมน์รายการ')
{
  eq([kindBadgeOf('ซื้อยา'), kindBadgeOf('ยกยอด'), kindBadgeOf('คืนยา'), kindBadgeOf('บันทึกเท่านั้น')],
    [null, null, 'คืนยา', 'บันทึกเท่านั้น'], 'ซื้อยา/ยกยอด ไม่แสดงป้าย')
  eq(rowTitle({ side: 'in', party: 'บริษัท ก' }), 'รับจาก บริษัท ก', 'แถวรับ')
  eq(rowTitle({ side: 'out', party: 'ER' }), 'เบิก ER', 'แถวเบิก')
  eq([rowTitle({ side: 'in', party: '' }), rowTitle({ side: 'out' })], ['รับเข้า', 'เบิกออก'], 'ไม่มีชื่อ')
}

section('Test 32: displayRef ตัดศัพท์ unpivot ตอนแสดงผล')
{
  eq(displayRef('นำเข้าจาก ต.ค.68 (unpivot)'), 'นำเข้าจากชีทเบิก ต.ค.68', 'ค่าจริงใน DB (594 แถว)')
  eq(displayRef('IV12345'), 'IV12345', 'หมายเหตุอื่นไม่แตะ')
  eq(displayRef(null), '', 'null → ว่าง')
}

section('Test 33: rowIssues — ข้อความใต้แถว')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-01', lot: 'A', qty_received: 4800 }],
    dispenseRows: [
      { dispense_date: '2026-02-01', lot: 'A', qty_out: 100, qty_before: 4750, qty_after: 4650 },
      { dispense_date: '2026-03-01', lot: 'A', qty_out: 100, qty_before: 4640, qty_after: 4500 },
    ],
  })
  const [i1] = rowIssues(r.rows[1])
  eq(i1, { type: 'drift', text: 'ยอดไม่ตรง: ชีทเบิกบันทึกว่าก่อนเบิกเหลือ 4,750 แต่ไล่จากประวัติได้ 4,800 — ขาดไป 50 ก่อนแถวนี้' }, 'drift จุดแรก')
  const i2 = rowIssues(r.rows[2])
  eq(i2.map(x => x.type), ['drift', 'rowErr'], 'จุดที่ 2 มีทั้งยอดไม่ตรงและกรอกผิด')
  eq(i2[0].text.endsWith('ขาดไป 10 ก่อนแถวนี้ (รวมที่ต่างมาก่อนหน้า ต่างกันทั้งหมด 60)'), true, 'drift ค้างบอกยอดรวม')
  eq(i2[1].text, 'แถวกรอกผิด: ชีทเบิกบันทึก ก่อนเบิก 4,640 − เบิก 100 = หลังเบิก 4,500 (ควรเป็น 4,540)', 'กรอกผิด')
  eq(rowIssues(r.rows[0]), [], 'แถวรับ ไม่มีปัญหา')
  const m = buildStockCard({
    receiveRows: [{ receive_date: '2025-10-01', lot: 'M', qty_received: 100 }],
    dispenseRows: [{ dispense_date: '2025-10-01', lot: 'M', qty_out: 5, qty_before: 80, note: 'นำเข้าจาก ต.ค.68 (unpivot)' }],
  })
  eq(rowIssues(m.rows[1])[0].type, 'migration', 'ข้อมูลก่อนเริ่มใช้ระบบ แยก type')
}

section('Test 34: แถวไม่หักยอด — หลัง = ก่อน คือถูก (เดิมขึ้นกรอกผิดปลอม 152/154 แถวจริง)')
{
  const r = buildStockCard({
    dispenseRows: [
      { dispense_date: '2026-01-01', lot: 'N', item_type: 'บันทึกเท่านั้น', qty_out: 5, qty_before: 70, qty_after: 70 },
      { dispense_date: '2026-01-02', lot: 'N', item_type: 'บันทึกเท่านั้น', qty_out: 5, qty_before: 70, qty_after: 65 },
    ],
  })
  eq(r.rows[0].hasRowErr, false, 'หลัง = ก่อน → ไม่ผิด')
  eq(r.rows[1].hasRowErr, true, 'แถวไม่หักยอดแต่หลังเบิกลด → ผิด')
  eq(rowIssues(r.rows[1])[0].text, 'แถวกรอกผิด: แถวบันทึกเท่านั้นไม่ตัดยอด หลังเบิกควรเท่าก่อนเบิก 70 แต่ชีทเบิกบันทึก 65', 'ข้อความแถวไม่หักยอด')
  eq(r.summary.rowErrRows, 1, 'นับเฉพาะแถวที่ผิดจริง')
}

section('Test 35: rowIssues — ยอดกลับมาตรง (drift → 0) ไม่ใช้คำ ขาดไป/เกินมา')
{
  // รับ 60 · เบิก 12 (ชีทว่าก่อนเบิก 60 ตรง) · ชีทว่าก่อนเบิก 60 แต่ไล่ได้ 48 (เกิน 12) · ชีทว่า 44 ไล่ได้ 44 (กลับมาตรง)
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-03-04', lot: 'Z', qty_received: 60 }],
    dispenseRows: [
      { dispense_date: '2026-03-16', lot: 'Z', qty_out: 12, qty_before: 60 },
      { dispense_date: '2026-03-17', lot: 'Z', qty_out: 4, qty_before: 60 },
      { dispense_date: '2026-03-23', lot: 'Z', qty_out: 15, qty_before: 44 },
    ],
  })
  const back = r.rows[3]
  eq(back.drift, 0, 'ผลต่างกลับเป็น 0')
  eq(back.isDriftPoint, true, 'ยังนับเป็นจุดเปลี่ยน (ไม่แก้สูตร)')
  eq(rowIssues(back), [{ type: 'drift', text: 'ยอดกลับมาตรงกัน: ชีทเบิกบันทึกว่าก่อนเบิกเหลือ 44 ตรงกับที่ไล่จากประวัติ — ผลต่าง 12 ของแถวก่อนหน้าหายไประหว่างทาง' }], 'ข้อความยอดกลับมาตรง')
  eq(rowIssues(r.rows[2])[0].text.includes('เกินมา 12'), true, 'แถวก่อนหน้ายังเป็น เกินมา')
}

// ── กฎ 14/11/2569 (สแกนทั้งระบบ: คงเหลือ lot ไม่ตรง Master 1,017 → 124 lot) ──
section('Test 36: ใบรับก่อนเริ่มระบบ — เคสจริง Atorvastatin CH553 (เบิก ส.ค.–ก.ย.68 ไม่มีในระบบ)')
{
  const r = buildStockCard({
    receiveRows: [
      { receive_date: '2025-08-18', lot: 'CH553', qty_received: 5000 },
      { receive_date: '2025-08-18', lot: 'CH553', qty_received: 100 },
    ],
    dispenseRows: [
      { dispense_date: '2025-10-06', lot: 'CH553', qty_out: 100, qty_before: 2500, qty_after: 2400, note: 'นำเข้าจาก ต.ค.68 (unpivot)' },
      { dispense_date: '2025-11-10', lot: 'CH553', qty_out: 2400, qty_before: 2400, qty_after: 0 },
    ],
  })
  const l = r.lots[0]
  eq(SYSTEM_START, '2025-10-01', 'วันเริ่มระบบ = ต.ค.68')
  eq([l.opening, l.hasOpening, l.totalIn, l.closing], [2500, true, 0, 0], 'ยอดตั้งต้น = ก่อนเบิกแถวแรก · ใบรับเก่าไม่บวกยอด · คงเหลือ 0')
  eq(r.rows.filter(x => x.side === 'in').map(x => [x.preSystem, x.balance]), [[true, 2500], [true, 2500]], 'ใบรับเก่าแสดงเป็นประวัติ ยอดไม่ขยับ')
  eq(r.summary.driftRows, 0, 'ไม่มีจุดไม่ตรงปลอม (เดิมขึ้น 2,600)')
  eq(rowIssues(r.rows[0])[0].type, 'migration', 'ใบรับเก่ามีบรรทัดอธิบายสีเทา')
  eq(l.opening + l.totalIn - l.totalOut, l.closing, 'ยอดตั้งต้น + รับ − เบิก = คงเหลือ')
}

section('Test 37: ไล่ย้อนยอดตั้งต้น — เริ่มด้วยการเบิก แล้วค่อยรับเพิ่ม (ถุงซิป S006)')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-21', lot: '-', qty_received: 50 }],
    dispenseRows: [
      { dispense_date: '2025-11-10', lot: '-', qty_out: 1, qty_before: 16, qty_after: 15 },
      { dispense_date: '2026-03-10', lot: '-', qty_out: 2, qty_before: 65, qty_after: 63 },
    ],
  })
  eq(r.lots[0].opening, 16, 'เดิมเริ่ม 0 เพราะมีใบรับ → ไม่ตรงปลอม −16')
  eq(r.summary.driftRows, 0, 'ไม่มีจุดไม่ตรง')
  eq(r.lots[0].closing, 63, 'คงเหลือ 16 − 1 + 50 − 2')
  // แถวแรกที่มีตัวเลขอยู่หลังการรับ → ไล่ย้อน: 65 − รับ 50 + เบิกก่อนหน้า 1 = 16
  const b = buildStockCard({
    receiveRows: [{ receive_date: '2026-01-21', lot: '-', qty_received: 50 }],
    dispenseRows: [
      { dispense_date: '2025-11-10', lot: '-', qty_out: 1, qty_before: null },
      { dispense_date: '2026-03-10', lot: '-', qty_out: 2, qty_before: 65 },
    ],
  })
  eq(b.lots[0].opening, 16, 'ไล่ย้อนข้ามแถวที่ไม่มีตัวเลข')
}

section('Test 38: แถวเบิกออก 0 ไม่เทียบยอด ("เบิก 2 จ่าย 0 รอตรวจรับ")')
{
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-05-12', lot: 'L', qty_received: 20 }],
    dispenseRows: [
      { dispense_date: '2026-05-25', lot: 'L', qty_out: 0, qty_before: 0, qty_after: 0 },
      { dispense_date: '2026-06-02', lot: 'L', qty_out: 3, qty_before: 20, qty_after: 17 },
    ],
  })
  eq(r.rows[1].drift, null, 'แถวจ่าย 0 เทียบไม่ได้')
  eq(r.summary.driftRows, 0, 'เดิมขึ้น +20 แล้ว −20')
}

section('Test 39: เทียบ Master — คงเหลือตรง = จุดไม่ตรงระหว่างทางเป็นสีเทา')
{
  // lot เดียวแยก 2 แถวใน Master (ยกยอด 10 + ซื้อยา(2) 50) ชีทบันทึกก่อนเบิกต่อแถว
  const input = {
    receiveRows: [{ receive_date: '2026-07-13', lot: 'B', qty_received: 50 }],
    dispenseRows: [
      { dispense_date: '2025-10-06', lot: 'B', item_type: 'ยกยอด', qty_out: 0, qty_before: 10, qty_after: 10 },
      { dispense_date: '2026-09-14', lot: 'B', item_type: 'ยกยอด', qty_out: 10, qty_before: 10, qty_after: 0 },
      { dispense_date: '2026-09-14', lot: 'B', item_type: 'ซื้อยา(2)', qty_out: 50, qty_before: 50, qty_after: 0 },
    ],
  }
  const noMaster = buildStockCard(input)
  eq([noMaster.lots[0].driftReal, noMaster.lots[0].masterQty, noMaster.lots[0].masterMismatch], [2, null, false], 'ไม่ส่ง Master = พฤติกรรมเดิม')
  const ok = buildStockCard({ ...input, masterRows: [] })
  const l = ok.lots[0]
  eq([l.closing, l.masterQty, l.masterMismatch, l.driftReal, l.driftSettled, l.warn], [0, 0, false, 0, 2, false], 'คงเหลือ 0 = Master (lot ไม่อยู่ใน Master แล้ว) → ไม่เตือน')
  eq(rowIssues(ok.rows.find(x => x.settled && x.drift !== 0))[0].type, 'settled', 'บรรทัดอธิบายสีเทา')
  eq(ok.summary.driftRowsReal, 0, 'สแกนทั้งระบบไม่นับ')
  eq(ok.summary.driftRowsSettled, 2, 'นับแยก')
}

section('Test 40: เทียบ Master — คงเหลือไม่ตรง = เตือน (lot รับ/เบิกพิมพ์ต่างกัน)')
{
  // รับเป็น S685043 แต่เบิกเป็น S685040 → lot หนึ่งเหลือ 30 อีก lot ติดลบ 30 · Master ไม่มีทั้งคู่
  const r = buildStockCard({
    receiveRows: [{ receive_date: '2026-02-01', lot: 'S685043', qty_received: 30 }],
    dispenseRows: [{ dispense_date: '2026-02-05', lot: 'S685040', qty_out: 30, qty_before: 30, qty_after: 0 }],
    masterRows: [{ lot: 'X1', qty: 5 }, { lot: ' X1 ', qty: '2' }],
  })
  const a = r.lots.find(l => l.lot === 'S685043'), b = r.lots.find(l => l.lot === 'S685040')
  eq([a.closing, a.masterQty, a.masterMismatch, a.warn], [30, 0, true, true], 'ระบบเหลือ 30 แต่ Master 0')
  eq([b.opening, b.closing, b.masterMismatch], [30, 0, false], 'lot ที่ไม่มีใบรับ ไล่ย้อนจากก่อนเบิก')
  eq(r.summary.masterMismatchLots, 1, 'นับ lot ไม่ตรง Master')
  const m = buildStockCard({ dispenseRows: [{ dispense_date: '2026-02-05', lot: 'X1', qty_out: 3, qty_before: 10 }], masterRows: [{ lot: 'X1', qty: 5 }, { lot: ' X1 ', qty: '2' }] })
  eq([m.lots[0].masterQty, m.lots[0].masterMismatch], [7, false], 'Master หลายแถว lot เดียวกัน = บวกรวม (ตัดช่องว่าง)')
}

section('Test 41: มีแต่ใบรับก่อนเริ่มระบบ ไม่เคลื่อนไหวเลย → ยอดตั้งต้น = Master')
{
  const input = { receiveRows: [{ receive_date: '2025-01-14', lot: 'J670399', qty_received: 1500 }] }
  eq(buildStockCard(input).lots[0].closing, 1500, 'ไม่ส่ง Master = นับรับเต็ม (เดิม)')
  const gone = buildStockCard({ ...input, masterRows: [] }).lots[0]
  eq([gone.opening, gone.totalIn, gone.closing, gone.hasOpening, gone.masterMismatch, gone.warn], [0, 0, 0, true, false, false], 'เบิกหมดก่อน ต.ค.68 → คงเหลือ 0 ตรง Master')
  const kept = buildStockCard({ ...input, masterRows: [{ lot: 'J670399', qty: 40 }] }).lots[0]
  eq([kept.opening, kept.closing, kept.masterMismatch], [40, 40, false], 'ยังเหลือใน Master → ใช้ยอด Master')
}

console.log('\n' + '─'.repeat(50))
if (fail === 0) {
  console.log(`✓ ผ่านทั้งหมด ${pass} assertions`)
} else {
  console.error(`✗ ไม่ผ่าน ${fail} จาก ${pass + fail} assertions`)
  // throw แทน process.exit → node จบด้วย exit code ≠ 0 เหมือนกัน แต่ไม่ต้องใช้ global process (eslint browser env)
  throw new Error(`stockCard golden test failed: ${fail}/${pass + fail}`)
}
