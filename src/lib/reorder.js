// reorder.js — Pharmacy reorder analysis (pure functions, no I/O)
// อ้างอิง spec §3 Step 1-8 — ห้าม mutate input

import { localYmd } from '../../supabase/functions/_shared/usageRow.js';

export const RISK_MULTIPLIER = { Normal: 1.0, Essential: 1.5, Critical: 2.0 };
export const SS_MIN_MULTIPLIER = 2;     // Excel AH = MAX(2, IFS(VEN…)) → ×2 ทุกกลุ่ม (ADR-0029) — ยกเลิกขั้นต่ำนี้ VEN จะกลับมามีผล
export const DEFAULT_LEAD_TIME = 20;    // Excel default LT เมื่อไม่มีข้อมูล
export const SS_BASE_DAYS = 30;         // Excel: Avg/วัน × 30 × ตัวคูณ (ไม่มี cap)
export const DAYS_PER_MONTH = 30.4;     // Excel: Avg/วัน = ROUND(Avg/เดือน ÷ 30.4, 4)
export const ORDER_CYCLE_DAYS = 7;      // Excel ชีทวิเคราะห์สั่งซื้อ ช่อง AM2 "รอบสั่งซื้อ" — คลังเปลี่ยนใน Excel ต้องแก้ที่นี่ด้วย
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
  // Excel: S = ROUND(ผลรวม/จำนวนเดือน, 2) ก่อนหาร 30.4 (ไม่ปัด = Avg/วัน คลาดหลักที่ 4 เช่น Para 0.9101 แทน 0.9102)
  const avgMonth = Math.round((sum / months.length) * 100) / 100;
  // Excel: ROUND(avg_monthly/30.4, 4) — ปัดทศนิยม 4 ตำแหน่งก่อนคำนวณ SS/ROP
  // (ถ้าไม่ปัด ค่าจะคลาด ±1 ที่ขอบ round เช่น Lidocaine 38/55 แทน 37/54)
  // ตัวหาร 30 → 30.4 ตามชีทวิเคราะห์สั่งซื้อที่จัดใหม่ (ตรวจ 20/10/2569: คอลัมน์ T ทั้ง 457 แถว) · SS ยังคูณ 30 (SS_BASE_DAYS)
  const avgDay = Math.round((avgMonth / DAYS_PER_MONTH) * 1e4) / 1e4;
  return { max, avgMonth, avgDay };
}

// Step 5 — Safety Stock (Excel: Avg/วัน × 30 × ตัวคูณ, ขั้นต่ำ 1, ไม่มี cap) + ROP
export function computeSafetyStock(avgDay, riskMultiplier) {
  return Math.max(1, Math.round(avgDay * SS_BASE_DAYS * riskMultiplier));
}

// Excel: X = ROUND(SS + Avg/วัน × (LT + $AM$2), 0) — AM2 = รอบสั่งซื้อ (ตรวจ 20/10/2569 = 7 วัน)
export function computeROP(rawSS, avgDay, leadTimeDays) {
  return Math.round(rawSS + avgDay * (leadTimeDays + ORDER_CYCLE_DAYS));
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

// Step 7 — จำนวนแนะนำสั่งซื้อ (Excel AA: MIN(Max×3, MAX(Max×2, ROP)) − คงเหลือ)
// เลิกตัวคูณ Avg×2.3 แล้ว 22/10/2569 (Excel + แอปพร้อมกัน) — ไม่มีรายการไหนที่ 2.3 เป็นตัวกำหนด (CONTEXT §Refill mode)
export function computeOrderQty({ status, max, rop, stock, ss }) {
  if (ZERO_V_STATUSES.has(status)) return 0;
  const target = Math.min(max * 3, Math.max(max * 2, rop));
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

  // VEN ว่าง/null → default Essential (1.5) ตาม Excel spec (ดู docs/adr/0002) แล้วยกขึ้นเป็นขั้นต่ำ ×2 (ADR-0029)
  const riskMult = Math.max(SS_MIN_MULTIPLIER, RISK_MULTIPLIER[riskGroup] ?? 1.5);
  const { max, avgMonth, avgDay } = computeStats(monthlyUsage);
  const ss = computeSafetyStock(avgDay, riskMult);
  const rop = computeROP(ss, avgDay, leadTimeDays);
  const status = classifyStatus({ excludeStatus, stock, nearestExpiryDays, rop });
  const orderQty = computeOrderQty({ status, max, avgMonth, rop, stock, ss });
  const amount = Math.round(orderQty * pricePerUnit * 100) / 100;

  return {
    code, name, supplier, riskGroup, leadTimeDays,
    max, avgMonth, avgDay, ssMult: riskMult, ss, rop, stock,
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

// ────────────────────────────────────────────────────────────
// ช่วงสถิติ + รูปแบบแสดงผล — ย้ายจาก ReorderApp.jsx (11/10/2569) ให้บัตรยาใช้ตัวเดียวกัน
// ช่วงตั้งต้น = isoMonthsAgo(4)..isoPrevMonthEnd() = 4 เดือนที่ปิดงวดแล้ว (CONTEXT §เรท)
// ────────────────────────────────────────────────────────────

// คงอยู่ได้อีก (Coverage): คงเหลือ ÷ Avg/วัน → "X ปี Y ด. Z วัน" (หน่วยเดียวกันทั้งคู่)
export const fmtCoverage = (stock, avgDay) => {
  if (!avgDay || avgDay <= 0) return stock > 0 ? '∞' : '—';
  let days = Math.floor(stock / avgDay);
  if (days <= 0) return '0 วัน';
  const y = Math.floor(days / 365); days -= y * 365;
  const mo = Math.floor(days / 30); days -= mo * 30;
  const parts = [];
  if (y) parts.push(`${y} ปี`);
  if (mo) parts.push(`${mo} ด.`);
  if (days) parts.push(`${days} วัน`);
  return parts.join(' ') || '0 วัน';
};

export function isoMonthsAgo(months) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - months);
  return localYmd(d);
}

// วันสุดท้ายของเดือนก่อนหน้า (ปิดงวดเดือนปัจจุบันที่ยังไม่ครบออก)
export function isoPrevMonthEnd() {
  const d = new Date();
  d.setDate(0);
  return localYmd(d);
}

export function listMonthYM(fromIso, toIso) {
  const out = [];
  const start = new Date(fromIso); start.setDate(1);
  const end = new Date(toIso); end.setDate(1);
  while (start <= end) {
    out.push(start.toISOString().slice(0, 7));
    start.setMonth(start.getMonth() + 1);
  }
  return out;
}

export function thaiMonthLabel(ym) {
  const [y, m] = ym.split('-');
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${months[+m - 1]} ${(+y + 543) % 100}`;
}
