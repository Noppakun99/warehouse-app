// reorder.test.js — Golden tests สำหรับ src/lib/reorder.js
// รัน: node src/lib/reorder.test.js
// กฎ: ต้องผ่าน 100% ก่อน commit (spec §4)

/* eslint-disable no-undef */
import {
  analyzeDrug, analyzeBatch,
  computeSafetyStock,
  STATUS,
  reconcileRows, parseReconcileCsvRow, parseCsvNumber, normalizeCsvStatus,
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
// Test 1 — Atorvastatin 40mg — สูตร Excel (SS ฐาน 30 ไม่ cap, factor 2.3)
// ────────────────────────────────────────────────────────────────────
section('Test 1: Atorvastatin 40mg — Excel formula (SS ฐาน 30)');
{
  const r = analyzeDrug({
    code: 'ATOR40',
    name: 'Atorvastatin 40mg',
    monthlyUsage: [2833, 1477, 1960, 2603], // dec, jan, feb, mar
    stock: 4400,
    leadTimeDays: 15.5,
    riskGroup: 'Essential',
    pricePerUnit: 33.30,
  });

  // avgDay=73.9417; SS=round(73.9417×30×1.5)=3327; ROP=round(3327+73.9417×15.5)=4473
  // target=MIN(2833×3, MAX(2218.25×2.3, 2833×2, 4473))=MIN(8499, 5666)=5666; V=5666−4400=1266
  assertEq(r.max, 2833, 'Max = 2833');
  assertEq(r.avgMonth, 2218.25, 'Avg/mo = 2218.25');
  assertEq(r.avgDay, 73.94166666666666, 'Avg/d ≈ 73.9417');
  assertEq(r.ss, 3327, 'SS = 3327 (round of 3327.375)');
  assertEq(r.rop, 4473, 'ROP = 4473');
  assertEq(r.status, STATUS.REORDER, 'Status = สั่งเพิ่ม');
  assertEq(r.orderQty, 1266, 'V (orderQty) = 1266');
  assertEq(r.amount, 42157.80, 'Amount = 42157.80');
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
// Test 4 — Golden แถวจริงจาก Excel: Acetaminophen syrup (SS=506, ROP=686)
// ────────────────────────────────────────────────────────────────────
section('Test 4: Acetaminophen syrup — Excel reference (SS=506, ROP=686)');
{
  // จากรูป Excel: Avg/วัน=11.25 (Avg/mo=337.5), Essential(×1.5), LT=16, stock=900
  // SS=round(11.25×30×1.5)=506; ROP=round(506+11.25×16)=686
  const r = analyzeDrug({
    code: 'PARA-SYR', name: 'Acetaminophen 120mg/5ml',
    monthlyUsage: [337.5, 337.5, 337.5, 337.5], // avgMonth=337.5 → avgDay=11.25
    stock: 900, leadTimeDays: 16,
    riskGroup: 'Essential',
  });
  assertEq(r.avgDay, 11.25, 'Avg/วัน = 11.25');
  assertEq(r.ss, 506, 'SS = 506');
  assertEq(r.rop, 686, 'ROP = 686');
  assertEq(r.status, STATUS.SUFFICIENT, 'Status = คงคลังเพียงพอ (stock 900 > ROP 686)');
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
// Test 7 — SS = Avg/วัน × 30 × ตัวคูณ (Excel: ฐาน 30 วัน, ไม่มี cap)
// ────────────────────────────────────────────────────────────────────
section('Test 7: SS ฐาน 30 วัน ไม่มี cap');
{
  // avgDay=10: Critical(2.0)=600, Essential(1.5)=450, Normal(1.0)=300 — สัดส่วนตามตัวคูณตรงๆ
  assertEq(computeSafetyStock(10, 2.0), 600, 'SS Critical = 600 (10×30×2.0)');
  assertEq(computeSafetyStock(10, 1.5), 450, 'SS Essential = 450 (10×30×1.5)');
  assertEq(computeSafetyStock(10, 1.0), 300, 'SS Normal = 300 (10×30×1.0)');
  // ค่าสูง avgDay ไม่ถูก cap (เดิม cap 90 จะตัด — ตอนนี้ไม่มี)
  assertEq(computeSafetyStock(100, 2.0), 6000, 'SS ไม่ถูก cap (100×30×2.0)');
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
// Test 10 — Lidocaine (แถวจริง Excel) — จับบั๊ก round avgDay 4 ตำแหน่ง
// ────────────────────────────────────────────────────────────────────
section('Test 10: Lidocaine — round avgDay (Excel: SS=37, ROP=54, order=200)');
{
  // avgMonth=25; avgDay=ROUND(25/30,4)=0.8333; SS=round(0.8333×30×1.5)=37; ROP=round(37+0.8333×20)=54
  // target=MIN(100×3, MAX(round(25×2.3)=58, 100×2=200, 54))=MIN(300,200)=200; V=200−0=200
  // ถ้าไม่ปัด avgDay (0.83333…): SS=round(37.5)=38, ROP=55 — บั๊กเดิม
  const r = analyzeDrug({
    code: 'LIDO', name: 'Lidocaine',
    monthlyUsage: [100, 0, 0, 0], stock: 0,
    leadTimeDays: 20, riskGroup: 'Essential',
  });
  assertEq(r.avgMonth, 25, 'Avg/mo = 25');
  assertEq(r.avgDay, 0.8333, 'Avg/d = 0.8333 (round 4)');
  assertEq(r.ss, 37, 'SS = 37 (ปัด avgDay ก่อน ไม่ใช่ 38)');
  assertEq(r.rop, 54, 'ROP = 54 (ไม่ใช่ 55)');
  assertEq(r.status, STATUS.OUT_OF_STOCK, 'Status = หมดสต็อค');
  assertEq(r.orderQty, 200, 'V = 200 (Max×2)');
}

// ────────────────────────────────────────────────────────────────────
// Test 11 — VEN ว่าง/null → default Essential (1.5), ไม่ใช่ Normal (1.0)
// ────────────────────────────────────────────────────────────────────
section('Test 11: VEN ว่าง → default 1.5 (ADR-0002)');
{
  // ไม่ส่ง riskGroup → ต้อง fallback 1.5 (เท่ากับ Essential) ไม่ใช่ 1.0 (Normal)
  const blank = analyzeDrug({ code: 'B', monthlyUsage: [300,300,300,300], stock: 0, leadTimeDays: 15 });
  const ess   = analyzeDrug({ code: 'E', monthlyUsage: [300,300,300,300], stock: 0, leadTimeDays: 15, riskGroup: 'Essential' });
  const norm  = analyzeDrug({ code: 'N', monthlyUsage: [300,300,300,300], stock: 0, leadTimeDays: 15, riskGroup: 'Normal' });
  assertEq(blank.ss, ess.ss, 'VEN ว่าง SS = Essential SS (×1.5)');
  if (blank.ss > norm.ss) pass++;
  else { fail++; fails.push(`  ✗ VEN ว่าง SS (${blank.ss}) ต้อง > Normal SS (${norm.ss})`); }
}

// ────────────────────────────────────────────────────────────────────
// Test 12 — parseCsvNumber / normalizeCsvStatus (Excel cell quirks)
// ────────────────────────────────────────────────────────────────────
section('Test 12: parse CSV cell (วงเล็บ=ติดลบ, emoji สถานะ)');
{
  assertEq(parseCsvNumber('(1)'), -1, '"(1)" → -1 (Excel วงเล็บ = ติดลบ)');
  assertEq(parseCsvNumber('1,266'), 1266, '"1,266" → 1266 (ตัดคอมมา)');
  assertEq(parseCsvNumber(' -  '), null, '" - " → null');
  assertEq(parseCsvNumber(''), null, '"" → null');
  assertEq(normalizeCsvStatus('❌ หมดสต็อค'), STATUS.OUT_OF_STOCK, 'strip emoji → หมดสต็อค');
  assertEq(normalizeCsvStatus('📋 สั่งเมื่อขอ'), STATUS.ON_DEMAND, 'strip emoji → สั่งเมื่อขอ');
  assertEq(normalizeCsvStatus('สั่งเพิ่ม ใกล้หมดอายุ'), STATUS.NEAR_EXPIRY, 'ใกล้หมดอายุ ชนะ สั่งเพิ่ม');
}

// ────────────────────────────────────────────────────────────────────
// Test 13 — reconcileRows: matched / differing / excelOnly / appOnly
// ────────────────────────────────────────────────────────────────────
section('Test 13: reconcileRows — 4 กลุ่ม + tolerance ±1');
{
  const appRows = [
    { code: 'A', name: 'A', ss: 100, rop: 150, status: STATUS.REORDER, orderQty: 50 },
    { code: 'B', name: 'B', ss: 200, rop: 260, status: STATUS.SUFFICIENT, orderQty: 0 },
    { code: 'C', name: 'C', ss: 10,  rop: 20,  status: STATUS.OUT_OF_STOCK, orderQty: 5 },  // app-only
  ];
  const csvRows = [
    // A: ตรงเป๊ะ (ss ต่าง 1 = ยังตรง เพราะ tolerance ±1)
    { 'รหัส': 'A', 'Safety Stock': '101', 'ROP = SS + Avg×LT': '150', 'สถานะ': 'สั่งเพิ่ม', 'จำนวนแนะนำสั่งซื้อ (หน่วย)': '50' },
    // B: ต่าง (rop ต่าง 40 + status ต่าง)
    { 'รหัส': 'B', 'Safety Stock': '200', 'ROP = SS + Avg×LT': '300', 'สถานะ': '❌ หมดสต็อค', 'จำนวนแนะนำสั่งซื้อ (หน่วย)': '10' },
    // D: excel-only
    { 'รหัส': 'D', 'Safety Stock': '5', 'ROP = SS + Avg×LT': '8', 'สถานะ': '📋 สั่งเมื่อขอ', 'จำนวนแนะนำสั่งซื้อ (หน่วย)': '-' },
  ];
  const res = reconcileRows(appRows, csvRows);
  assertEq(res.summary.matched, 1, 'matched = 1 (A — ss ต่าง 1 ยังตรง)');
  assertEq(res.summary.differing, 1, 'differing = 1 (B)');
  assertEq(res.summary.excelOnly, 1, 'excelOnly = 1 (D)');
  assertEq(res.summary.appOnly, 1, 'appOnly = 1 (C)');
  assertEq(res.summary.total, 3, 'total (CSV) = 3');
  assertEq(res.matched[0].code, 'A', 'A อยู่ matched');
  const b = res.differing.find(x => x.code === 'B');
  assertEq(b.diffs.rop.delta, -40, 'B rop delta = app−csv = 260−300 = -40');
  if (b.diffs.status) pass++; else { fail++; fails.push('  ✗ B ต้องมี status diff'); }
  assertEq(res.appOnly[0].code, 'C', 'C อยู่ appOnly');
  assertEq(res.excelOnly[0].code, 'D', 'D อยู่ excelOnly');
}

// ────────────────────────────────────────────────────────────────────
// Test 14 — parseReconcileCsvRow: header ไทยจริง → shape ที่ reconcile ใช้
// ────────────────────────────────────────────────────────────────────
section('Test 14: parseReconcileCsvRow — header CSV จริง');
{
  const p = parseReconcileCsvRow({
    'รหัส': '25', 'รายการยา': 'เถาเอ็นอ่อนแคปซูล',
    'Safety Stock': '1', 'ROP = SS + Avg×LT': '20',
    'สถานะ': '📋 สั่งเมื่อขอ', 'จำนวนแนะนำสั่งซื้อ (หน่วย)': '(1)',
  });
  assertEq(p.code, '25', 'code = 25');
  assertEq(p.ss, 1, 'ss = 1');
  assertEq(p.rop, 20, 'rop = 20');
  assertEq(p.status, STATUS.ON_DEMAND, 'status = สั่งเมื่อขอ');
  assertEq(p.orderQty, -1, 'orderQty = -1 (จาก "(1)")');
  assertEq(parseReconcileCsvRow({ 'รายการยา': 'ไม่มีรหัส' }), null, 'ไม่มีรหัส → null');
}

// ────────────────────────────────────────────────────────────────────
// Test 15 — reconcileRows keyFn: normalize กัน Excel drift (leading-zero)
// ────────────────────────────────────────────────────────────────────
section('Test 15: reconcileRows keyFn — leading-zero drift');
{
  // app code "001000230" (rawCode) vs CSV code "1000230" (Excel ตัด 0 นำ) = ยาตัวเดียวกัน
  const appRows = [{ code: '001000230', name: 'ยา A', ss: 100, rop: 150, status: STATUS.REORDER, orderQty: 50 }];
  const csvRows = [{ 'รหัส': '1000230', 'Safety Stock': '100', 'ROP = SS + Avg×LT': '150', 'สถานะ': 'สั่งเพิ่ม', 'จำนวนแนะนำสั่งซื้อ (หน่วย)': '50' }];

  // ไม่มี keyFn → ไม่ match (false orphan) — พิสูจน์ว่า bug จริงถ้าไม่ normalize
  const raw = reconcileRows(appRows, csvRows);
  assertEq(raw.summary.excelOnly, 1, 'ไม่ normalize → excelOnly=1 (false orphan)');
  assertEq(raw.summary.appOnly, 1, 'ไม่ normalize → appOnly=1 (false orphan)');

  // มี keyFn (จำลอง codeKey: lowercase + ตัด 0 นำ) → match
  const codeKey = (v) => String(v ?? '').trim().toLowerCase().replace(/^0+(\d)/, '$1');
  const fixed = reconcileRows(appRows, csvRows, codeKey);
  assertEq(fixed.summary.matched, 1, 'normalize → matched=1 (ตัวเดียวกัน)');
  assertEq(fixed.summary.excelOnly, 0, 'normalize → ไม่มี orphan');
  assertEq(fixed.summary.appOnly, 0, 'normalize → ไม่มี orphan');
  assertEq(fixed.matched[0].code, '001000230', 'แสดง code เดิม (app.code) ไม่ใช่ normalized key');
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