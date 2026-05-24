// reorder.test.js — Golden tests สำหรับ src/lib/reorder.js
// รัน: node src/lib/reorder.test.js
// กฎ: ต้องผ่าน 100% ก่อน commit (spec §4)

/* eslint-disable no-undef */
import {
  analyzeDrug, analyzeBatch,
  computeSafetyStock,
  STATUS,
} from './reorder.js';

let pass = 0, fail = 0;
const fails = [];

function assertEq(actual, expected, label) {
  const ok = typeof expected === 'number' && typeof actual === 'number'
    ? Math.abs(actual - expected) < 1e-3
    : actual === expected;
  if (ok) { pass++; return; }
  fail++;
  fails.push(`  ✗ ${label}\n     expected: ${expected}\n     actual:   ${actual}`);
}

function section(name) { console.log(`\n=== ${name} ===`); }

// ────────────────────────────────────────────────────────────────────
// Test 1 — Atorvastatin 40mg (Refill mode, พ.ค.69) — Golden จาก Excel
// ────────────────────────────────────────────────────────────────────
section('Test 1: Atorvastatin 40mg — Refill mode (Excel golden)');
{
  const r = analyzeDrug({
    code: 'ATOR40',
    name: 'Atorvastatin 40mg',
    monthlyUsage: [2833, 1477, 1960, 2603], // dec, jan, feb, mar
    stock: 4400,
    leadTimeDays: 15.5,
    riskGroup: 'Essential',
    pricePerUnit: 33.30,
  }, { mode: 'refill' });

  assertEq(r.max, 2833, 'Max = 2833');
  assertEq(r.avgMonth, 2218.25, 'Avg/mo = 2218.25');
  assertEq(r.avgDay, 73.94166666666666, 'Avg/d ≈ 73.9417');
  assertEq(r.ss, 6655, 'SS = 6655 (round of 6654.75)');
  assertEq(r.rop, 7801, 'ROP = 7801');
  assertEq(r.status, STATUS.REORDER, 'Status = สั่งเพิ่ม');
  assertEq(r.orderQty, 3401, 'V (orderQty) = 3401');
  assertEq(r.amount, 113253.30, 'Amount = 113253.30');
}

// ────────────────────────────────────────────────────────────────────
// Test 2 — ตัดออก → V=0, status="ตัดออก"
// ────────────────────────────────────────────────────────────────────
section('Test 2: รายการตัดออก → V=0');
{
  const r = analyzeDrug({
    code: 'X001', name: 'ยาตัดออก',
    monthlyUsage: [500, 600, 700, 800],
    stock: 100, leadTimeDays: 15,
    excludeStatus: STATUS.EXCLUDED,
    pricePerUnit: 10,
  });
  assertEq(r.status, STATUS.EXCLUDED, 'Status = ตัดออก');
  assertEq(r.orderQty, 0, 'V = 0');
  assertEq(r.amount, 0, 'Amount = 0');
}

// ────────────────────────────────────────────────────────────────────
// Test 3 — คงเหลือ = 0 → status="หมดสต็อค" + V>0
// ────────────────────────────────────────────────────────────────────
section('Test 3: คงเหลือ=0 → หมดสต็อค, V>0');
{
  const r = analyzeDrug({
    code: 'X002', name: 'ยาหมด',
    monthlyUsage: [100, 100, 100, 100],
    stock: 0, leadTimeDays: 15,
    riskGroup: 'Normal',
    pricePerUnit: 5,
  });
  assertEq(r.status, STATUS.OUT_OF_STOCK, 'Status = หมดสต็อค');
  if (r.orderQty > 0) pass++; else { fail++; fails.push(`  ✗ V > 0 (got ${r.orderQty})`); }
}

// ────────────────────────────────────────────────────────────────────
// Test 4 — Refill > Normal สำหรับยาเดียวกัน
// ────────────────────────────────────────────────────────────────────
section('Test 4: Refill > Normal (เลือก param ที่ avg×factor มีผล)');
{
  const drug = {
    code: 'X003', name: 'ยา Refill test',
    monthlyUsage: [100, 100, 100, 100], // max=100, avgMonth=100
    stock: 0, leadTimeDays: 5,           // lead<9 ให้ avg×factor > ROP
    riskGroup: 'Normal',
    pricePerUnit: 1,
  };
  const normal = analyzeDrug(drug, { mode: 'normal' });
  const refill = analyzeDrug(drug, { mode: 'refill' });
  if (refill.orderQty > normal.orderQty) pass++;
  else { fail++; fails.push(`  ✗ Refill (${refill.orderQty}) ต้อง > Normal (${normal.orderQty})`); }
  // คำนวณคาดหวัง: avgDay=3.333, rawSS=200, ROP=round(200+16.67)=217
  // Normal: target=MIN(300, MAX(200,200,217))=217 → V=217
  // Refill: target=MIN(300, MAX(230,200,217))=230 → V=230
  assertEq(normal.orderQty, 217, 'Normal V = 217');
  assertEq(refill.orderQty, 230, 'Refill V = 230');
}

// ────────────────────────────────────────────────────────────────────
// Test 5 — Edge: ยาไม่เคยเบิก → Avg=0, ROP=SS=1, V=1
// ────────────────────────────────────────────────────────────────────
section('Test 5: ยาไม่เคยเบิก (edge case)');
{
  const r = analyzeDrug({
    code: 'X004', name: 'ยาไม่เคยใช้',
    monthlyUsage: [0, 0, 0, 0],
    stock: 0, leadTimeDays: 15,
    pricePerUnit: 7,
  });
  assertEq(r.avgMonth, 0, 'avgMonth = 0');
  assertEq(r.ss, 1, 'SS = 1 (floor)');
  assertEq(r.rop, 1, 'ROP = 1');
  assertEq(r.status, STATUS.OUT_OF_STOCK, 'Status = หมดสต็อค (stock=0)');
  assertEq(r.orderQty, 1, 'V = MAX(1, Max) = 1 (fallback)');
  if (!Number.isNaN(r.orderQty)) pass++;
  else { fail++; fails.push('  ✗ V ต้องไม่เป็น NaN'); }
}

// ────────────────────────────────────────────────────────────────────
// Test 6 — Invariants (sum, status exhaustiveness, V≥0)
// ────────────────────────────────────────────────────────────────────
section('Test 6: Sum invariants + status coverage');
{
  const batch = [
    { code: 'A', name: 'A', monthlyUsage: [100,100,100,100], stock: 0, pricePerUnit: 10, supplier: 'บ.อัลฟา' },
    { code: 'B', name: 'B', monthlyUsage: [50,50,50,50], stock: 1000, pricePerUnit: 20, supplier: 'บ.เบต้า' },
    { code: 'C', name: 'C', monthlyUsage: [200,200,200,200], stock: 100, pricePerUnit: 5, supplier: 'บ.อัลฟา' },
    { code: 'D', name: 'D', monthlyUsage: [0,0,0,0], stock: 500, pricePerUnit: 3, excludeStatus: STATUS.EXCLUDED, supplier: 'บ.แกมม่า' },
    { code: 'E', name: 'E', monthlyUsage: [80,80,80,80], stock: 50, pricePerUnit: 8, excludeStatus: STATUS.ON_DEMAND, supplier: 'บ.เบต้า' },
  ];
  const { rows, suppliers, totals } = analyzeBatch(batch);

  // ทุก row ต้องมี status
  const noStatus = rows.filter(r => !r.status);
  assertEq(noStatus.length, 0, 'ทุกแถวต้องมี status');

  // V ≥ 0 ทุกแถว
  const negative = rows.filter(r => r.orderQty < 0);
  assertEq(negative.length, 0, 'V ≥ 0 ทุกแถว');

  // V ≤ Max×3 ทุกแถว
  const overCap = rows.filter(r => r.orderQty > r.max * 3 && r.max > 0);
  assertEq(overCap.length, 0, 'V ≤ Max×3');

  // ตัดออก + สั่งเมื่อขอ → V=0
  assertEq(rows.find(r => r.code === 'D').orderQty, 0, 'ตัดออก V=0');
  assertEq(rows.find(r => r.code === 'E').orderQty, 0, 'สั่งเมื่อขอ V=0');

  // Σ amount per supplier = Σ amount ทั้งระบบ
  const supplierSum = suppliers.reduce((s, g) => s + g.totalAmount, 0);
  assertEq(Math.round(supplierSum * 100) / 100, totals.totalAmount, 'Σ supplier = Σ system');
}

// ────────────────────────────────────────────────────────────────────
// Test 7 — SS cap 90 วันทำงาน (Critical risk ที่ multiplier × 60 > 90)
// ────────────────────────────────────────────────────────────────────
section('Test 7: SS cap 90 วัน (Critical × 60 = 120 > 90 → cap kick in)');
{
  // avgDay=10, Critical (2.0): base = 10*60*2 = 1200; cap = 10*90 = 900 → SS = 900
  const ss = computeSafetyStock(10, 2.0);
  assertEq(ss, 900, 'SS = 900 (capped at 90 วัน)');
  // Essential (1.5): base = 10*60*1.5 = 900; cap = 900 → SS = 900 (เท่า)
  assertEq(computeSafetyStock(10, 1.5), 900, 'SS = 900 (เท่า cap)');
  // Normal (1.0): base = 10*60 = 600; cap = 900 → SS = 600 (cap ไม่ทำงาน)
  assertEq(computeSafetyStock(10, 1.0), 600, 'SS = 600 (cap ไม่ทำงาน)');
}

// ────────────────────────────────────────────────────────────────────
// Test 8 — ROP > SS เสมอ (เมื่อ avgDay > 0, leadTime > 0)
// ────────────────────────────────────────────────────────────────────
section('Test 8: ROP > SS เมื่อ avgDay×leadTime > 0');
{
  const r = analyzeDrug({
    code: 'X', monthlyUsage: [300,300,300,300], stock: 5000, leadTimeDays: 15,
  });
  if (r.rop > r.ss) pass++;
  else { fail++; fails.push(`  ✗ ROP (${r.rop}) ต้อง > SS (${r.ss})`); }
}

// ────────────────────────────────────────────────────────────────────
// Test 9 — ใกล้หมดอายุ → status=ใกล้หมดอายุ (stock>0)
// ────────────────────────────────────────────────────────────────────
section('Test 9: ใกล้หมดอายุ (≤180 วัน)');
{
  const r = analyzeDrug({
    code: 'X', monthlyUsage: [100,100,100,100], stock: 10000,
    leadTimeDays: 15, nearestExpiryDays: 90, pricePerUnit: 2,
  });
  assertEq(r.status, STATUS.NEAR_EXPIRY, 'Status = ใกล้หมดอายุ');
}

// ────────────────────────────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log(`ผลรวม: ${pass} ผ่าน · ${fail} ล้มเหลว`);
if (fail > 0) {
  console.log(`\nรายการที่ล้มเหลว:`);
  fails.forEach(f => console.log(f));
  process.exit(1);
} else {
  console.log('✓ ผ่านทุก case');
  process.exit(0);
}