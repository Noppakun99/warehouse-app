// reorder.js — Pharmacy reorder analysis (pure functions, no I/O)
// อ้างอิง spec §3 Step 1-8 — ห้าม mutate input

export const RISK_MULTIPLIER = { Normal: 1.0, Essential: 1.5, Critical: 2.0 };
export const REFILL_FACTOR = { normal: 2.0, refill: 2.3 };
export const DEFAULT_LEAD_TIME = 15;
export const SS_BASE_DAYS = 60;
export const SS_DAY_CAP = 90;
export const NEAR_EXPIRY_DAYS = 180;

export const STATUS = {
  EXCLUDED: 'ตัดออก',
  ON_DEMAND: 'สั่งเมื่อขอ',
  OUT_OF_STOCK: 'หมดสต็อค',
  NEAR_EXPIRY: 'ใกล้หมดอายุ',
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
  const avgDay = avgMonth / 30;
  return { max, avgMonth, avgDay };
}

// Step 5 — Safety Stock (cap 90 วัน) + ROP
export function computeSafetyStock(avgDay, riskMultiplier) {
  const base = Math.max(1, avgDay * SS_BASE_DAYS * riskMultiplier);
  const cap = Math.max(1, avgDay * SS_DAY_CAP);
  return Math.min(base, cap);
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

// Step 7 — จำนวนแนะนำสั่งซื้อ
export function computeOrderQty({ status, max, avgMonth, rop, stock, mode }) {
  if (ZERO_V_STATUSES.has(status)) return 0;
  const factor = mode === 'refill' ? REFILL_FACTOR.refill : REFILL_FACTOR.normal;
  const target = Math.min(max * 3, Math.max(avgMonth * factor, max * 2, rop));
  const v = target - stock;
  if (v <= 0) return Math.max(1, max);
  return v;
}

// Orchestrator: Step 1-8 ต่อยา 1 รายการ
export function analyzeDrug(drug, opts = {}) {
  const {
    code = '', name = '',
    monthlyUsage = [],
    stock = 0,
    leadTimeDays = DEFAULT_LEAD_TIME,
    riskGroup = 'Normal',
    excludeStatus = null,
    pricePerUnit = 0,
    supplier = '',
    nearestExpiryDays = null,
  } = drug;
  const { mode = 'normal' } = opts;

  const riskMult = RISK_MULTIPLIER[riskGroup] ?? 1.0;
  const { max, avgMonth, avgDay } = computeStats(monthlyUsage);
  const rawSS = computeSafetyStock(avgDay, riskMult);
  const rop = computeROP(rawSS, avgDay, leadTimeDays);
  const ss = Math.round(rawSS);
  const status = classifyStatus({ excludeStatus, stock, nearestExpiryDays, rop });
  const orderQty = computeOrderQty({ status, max, avgMonth, rop, stock, mode });
  const amount = Math.round(orderQty * pricePerUnit * 100) / 100;

  return {
    code, name, supplier, riskGroup, leadTimeDays,
    max, avgMonth, avgDay, ss, rop, stock,
    status, orderQty, amount, pricePerUnit,
  };
}

// Step 8 — รวมผลทั้งหมด + จัดกลุ่ม supplier
export function analyzeBatch(drugs, opts = {}) {
  const rows = drugs.map(d => analyzeDrug(d, opts));
  const suppliers = groupBySupplier(rows);
  const totals = rows.reduce((t, r) => {
    t.byStatus[r.status] = (t.byStatus[r.status] || 0) + 1;
    t.totalAmount = Math.round((t.totalAmount + r.amount) * 100) / 100;
    return t;
  }, { byStatus: {}, totalAmount: 0 });
  return { rows, suppliers, totals };
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