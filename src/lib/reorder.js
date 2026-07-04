// reorder.js — Pharmacy reorder analysis (pure functions, no I/O)
// อ้างอิง spec §3 Step 1-8 — ห้าม mutate input

export const RISK_MULTIPLIER = { Normal: 1.0, Essential: 1.5, Critical: 2.0 };
export const ORDER_FACTOR = 2.3;        // Excel: Avg/เดือน × 2.3 (คงที่ ไม่มี Refill mode)
export const DEFAULT_LEAD_TIME = 20;    // Excel default LT เมื่อไม่มีข้อมูล
export const SS_BASE_DAYS = 30;         // Excel: Avg/วัน × 30 × ตัวคูณ (ไม่มี cap)
export const NEAR_EXPIRY_DAYS = 180;

export const STATUS = {
  EXCLUDED: 'ตัดออก',
  ON_DEMAND: 'สั่งเมื่อขอ',
  OUT_OF_STOCK: 'หมดสต็อค',
  NEAR_EXPIRY: 'สั่งเพิ่ม ใกล้หมดอายุ',
  REORDER: 'สั่งเพิ่ม',
  SUFFICIENT: 'คงคลังเพียงพอ',
};

const ZERO_V_STATUSES = new Set([STATUS.SUFFICIENT, STATUS.EXCLUDED, STATUS.ON_DEMAND]);

// Step 3 — สถิติยอดใช้
export function computeStats(monthlyUsage) {
  const months = (monthlyUsage || []).filter(m => m != null && !Number.isNaN(m));
  if (months.length === 0) return { max: 0, avgMonth: 0, avgDay: 0 };
  const max = Math.max(...months);
  const sum = months.reduce((s, m) => s + m, 0);
  const avgMonth = sum / months.length;
  // Excel: ROUND(avg_monthly/30, 4) — ปัดทศนิยม 4 ตำแหน่งก่อนคำนวณ SS/ROP
  // (ถ้าไม่ปัด ค่าจะคลาด ±1 ที่ขอบ round เช่น Lidocaine 38/55 แทน 37/54)
  const avgDay = Math.round((avgMonth / 30) * 1e4) / 1e4;
  return { max, avgMonth, avgDay };
}

// Step 5 — Safety Stock (Excel: Avg/วัน × 30 × ตัวคูณ, ขั้นต่ำ 1, ไม่มี cap) + ROP
export function computeSafetyStock(avgDay, riskMultiplier) {
  return Math.max(1, Math.round(avgDay * SS_BASE_DAYS * riskMultiplier));
}

export function computeROP(rawSS, avgDay, leadTimeDays) {
  return Math.round(rawSS + avgDay * leadTimeDays);
}

// Step 6 — จัดสถานะ (priority order)
export function classifyStatus({ excludeStatus, stock, nearestExpiryDays, rop }) {
  if (excludeStatus === STATUS.EXCLUDED) return STATUS.EXCLUDED;
  if (excludeStatus === STATUS.ON_DEMAND) return STATUS.ON_DEMAND;
  if (stock <= 0) return STATUS.OUT_OF_STOCK;
  if (nearestExpiryDays != null && nearestExpiryDays <= NEAR_EXPIRY_DAYS) return STATUS.NEAR_EXPIRY;
  if (stock <= rop) return STATUS.REORDER;
  return STATUS.SUFFICIENT;
}

// Step 7 — จำนวนแนะนำสั่งซื้อ (Excel: MIN(Max×3, MAX(Avg×2.3, Max×2, ROP)) − คงเหลือ)
export function computeOrderQty({ status, max, avgMonth, rop, stock, ss }) {
  if (ZERO_V_STATUSES.has(status)) return 0;
  // Excel §08: ROUND(avg_monthly*2.3,0) ก่อนเทียบใน MAX (กัน avg×2.3 ชนะแล้วได้ทศนิยม)
  const target = Math.min(max * 3, Math.max(Math.round(avgMonth * ORDER_FACTOR), max * 2, rop));
  const v = target - stock;
  if (v <= 0) return max > 0 ? Math.max(1, max) : ss;   // Excel: max=0 → fallback = safety_stock
  return v;
}

// Orchestrator: Step 1-8 ต่อยา 1 รายการ
export function analyzeDrug(drug) {
  const {
    code = '', name = '',
    monthlyUsage = [],
    stock = 0,
    leadTimeDays = DEFAULT_LEAD_TIME,
    riskGroup = null,   // ว่าง/ไม่ระบุ → null เพื่อให้ถึง default 1.5 ใน riskMult (ดู docs/adr/0002)
    excludeStatus = null,
    pricePerUnit = 0,
    supplier = '',
    nearestExpiryDays = null,
  } = drug;

  // VEN ว่าง/null → default Essential (1.5) ตาม Excel spec (ดู docs/adr/0002)
  const riskMult = RISK_MULTIPLIER[riskGroup] ?? 1.5;
  const { max, avgMonth, avgDay } = computeStats(monthlyUsage);
  const ss = computeSafetyStock(avgDay, riskMult);
  const rop = computeROP(ss, avgDay, leadTimeDays);
  const status = classifyStatus({ excludeStatus, stock, nearestExpiryDays, rop });
  const orderQty = computeOrderQty({ status, max, avgMonth, rop, stock, ss });
  const amount = Math.round(orderQty * pricePerUnit * 100) / 100;

  return {
    code, name, supplier, riskGroup, leadTimeDays,
    max, avgMonth, avgDay, ss, rop, stock,
    status, orderQty, amount, pricePerUnit,
  };
}

// Step 8 — รวมผลทั้งหมด + จัดกลุ่ม supplier
export function analyzeBatch(drugs) {
  const rows = drugs.map(d => analyzeDrug(d));
  const suppliers = groupBySupplier(rows);
  const totals = rows.reduce((t, r) => {
    t.byStatus[r.status] = (t.byStatus[r.status] || 0) + 1;
    t.totalAmount = Math.round((t.totalAmount + r.amount) * 100) / 100;
    return t;
  }, { byStatus: {}, totalAmount: 0 });
  return { rows, suppliers, totals };
}

// ────────────────────────────────────────────────────────────
// Reconcile — เทียบผลแอป (recompute) กับ Excel "วิเคราะห์สั่งซื้อ" (source of truth, ADR-0001)
// read-only diff กลางๆ — ไม่ auto-fix
// ────────────────────────────────────────────────────────────

// map ค่า "สถานะ" ใน CSV (มี emoji นำหน้า เช่น "❌ หมดสต็อค") → STATUS enum
export function normalizeCsvStatus(raw) {
  const v = String(raw ?? '').replace(/[^฀-๿a-zA-Z]/g, '');
  if (!v) return null;
  if (v.includes('ตัดออก')) return STATUS.EXCLUDED;
  if (v.includes('สั่งเมื่อขอ')) return STATUS.ON_DEMAND;
  if (v.includes('หมดสต็อค') || v.includes('หมดสตอค')) return STATUS.OUT_OF_STOCK;
  if (v.includes('ใกล้หมดอายุ')) return STATUS.NEAR_EXPIRY;
  if (v.includes('สั่งเพิ่ม')) return STATUS.REORDER;
  if (v.includes('เพียงพอ')) return STATUS.SUFFICIENT;
  return null;
}

// ดึงตัวเลขจาก cell CSV — รองรับ "(1)" = ค่าติดลบ (Excel แสดงวงเล็บ), คอมมา, ช่องว่าง, "-"
export function parseCsvNumber(raw) {
  const s = String(raw ?? '').trim();
  if (!s || s === '-') return null;
  const neg = /^\(.*\)$/.test(s);
  const n = parseFloat(s.replace(/[(),\s]/g, ''));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

// 1 row ของ CSV (key = header ไทย) → { code, name, ss, rop, status, orderQty }
export function parseReconcileCsvRow(r) {
  const code = String(r['รหัส'] ?? r['code'] ?? r['Code'] ?? '').trim();
  if (!code) return null;
  return {
    code,
    name: String(r['รายการยา'] ?? r['ชื่อยา'] ?? r['name'] ?? '').trim() || null,
    ss: parseCsvNumber(r['Safety Stock'] ?? r['safety_stock'] ?? r['SS']),
    rop: parseCsvNumber(r['ROP = SS + Avg×LT'] ?? r['ROP'] ?? r['rop']),
    status: normalizeCsvStatus(r['สถานะ'] ?? r['status']),
    orderQty: parseCsvNumber(r['จำนวนแนะนำสั่งซื้อ (หน่วย)'] ?? r['จำนวนแนะนำสั่งซื้อ'] ?? r['orderQty']),
  };
}

// เทียบ 1 field: ต่าง > NUM_TOLERANCE ถึงนับว่า diff (±1 = ตรง เผื่อ Excel ปัดเศษ)
const NUM_TOLERANCE = 1;
function numFieldDiff(app, csv) {
  if (csv == null || app == null) return null;   // ไม่มีข้อมูลฝั่งใด → ข้าม (ไม่ถือว่าต่าง)
  return Math.abs(app - csv) > NUM_TOLERANCE ? { app, csv, delta: app - csv } : null;
}

// appRows = result.rows (จาก analyzeBatch), csvRows = parsed CSV rows
// keyFn = normalize รหัสยาให้ 2 ฝั่งตรงกัน (default identity/trim; ReorderApp ส่ง codeKey กัน
//         Excel drift เช่น leading-zero / sci-notation → กัน false excelOnly/appOnly)
// → { matched, differing, excelOnly, appOnly, summary }
export function reconcileRows(appRows, csvRows, keyFn) {
  const norm = (c) => keyFn ? keyFn(c) : String(c ?? '').trim();
  const appByCode = new Map((appRows || []).map(r => [norm(r.code), r]));
  const csvByCode = new Map();
  for (const raw of csvRows || []) {
    if (!raw) continue;
    // รับได้ทั้ง raw CSV row (key ไทย) และ object ที่ parse แล้ว (มี code + ss เป็น field)
    const alreadyParsed = 'code' in raw && 'ss' in raw;
    const p = alreadyParsed ? raw : parseReconcileCsvRow(raw);
    if (p && p.code) csvByCode.set(norm(p.code), p);
  }

  const matched = [], differing = [], excelOnly = [], appOnly = [];

  for (const [code, csv] of csvByCode) {
    const app = appByCode.get(code);
    if (!app) { excelOnly.push(csv); continue; }
    const diffs = {
      ss: numFieldDiff(app.ss, csv.ss),
      rop: numFieldDiff(app.rop, csv.rop),
      orderQty: numFieldDiff(Math.round(app.orderQty), csv.orderQty),
      status: (csv.status != null && app.status !== csv.status)
        ? { app: app.status, csv: csv.status } : null,
    };
    const hasDiff = diffs.ss || diffs.rop || diffs.orderQty || diffs.status;
    // แสดง code เดิม (อ่านง่าย) ไม่ใช่ normalized key
    const entry = { code: app.code || csv.code || code, name: app.name || csv.name, app, csv, diffs };
    if (hasDiff) differing.push(entry); else matched.push(entry);
  }
  for (const [code, app] of appByCode) {
    if (!csvByCode.has(code)) appOnly.push(app);
  }

  return {
    matched, differing, excelOnly, appOnly,
    summary: {
      total: csvByCode.size,
      matched: matched.length,
      differing: differing.length,
      excelOnly: excelOnly.length,
      appOnly: appOnly.length,
    },
  };
}

export function groupBySupplier(rows) {
  const map = new Map();
  for (const r of rows) {
    if (r.orderQty <= 0) continue;
    const key = r.supplier || '(ไม่ระบุบริษัท)';
    if (!map.has(key)) map.set(key, { supplier: key, items: [], totalAmount: 0, totalQty: 0 });
    const g = map.get(key);
    g.items.push(r);
    g.totalAmount = Math.round((g.totalAmount + r.amount) * 100) / 100;
    g.totalQty += r.orderQty;
  }
  return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}