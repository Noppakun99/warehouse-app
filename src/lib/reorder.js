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