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

// Excel "วิเคราะห์สั่งซื้อ" ใส่ emoji นำหน้าสถานะ (เช่น '📋 สั่งเมื่อขอ') — ตัดออกก่อนเทียบ
export function normalizeStatus(raw) {
  return String(raw ?? '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/\u{FE0F}/gu, '')
    .trim();
}

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
    ssMultiplier = null,   // override ตัวคูณ SS ตรง ๆ (Excel เก็บค่าเป็นตัวเลข ไม่ใช่ชื่อกลุ่ม)
  } = drug;
  const { mode = 'normal' } = opts;

  const riskMult = ssMultiplier != null && !Number.isNaN(+ssMultiplier)
    ? +ssMultiplier
    : (RISK_MULTIPLIER[riskGroup] ?? 1.0);
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

// ── Parse ชีต "วิเคราะห์สั่งซื้อ" (pure — รับ array-of-arrays) ──
// Excel เป็นเจ้าของสูตร แอปอ่านเลขมาแสดงตรง ๆ (docs/features/reorder-excel-redesign.md)
const THAI_MONTH_ABBR = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

// 'เบิก ธ.ค.68' → '2025-12' (ปี พ.ศ. 2 หลัก)
export function monthHeaderToYm(header) {
  const m = String(header).replace(/^เบิก\s*/, '').trim();
  const idx = THAI_MONTH_ABBR.findIndex(a => m.startsWith(a));
  if (idx < 0) return null;
  const yy = m.slice(THAI_MONTH_ABBR[idx].length).trim();
  if (!/^\d{2}$/.test(yy)) return null;
  return `${2500 + Number(yy) - 543}-${String(idx + 1).padStart(2, '0')}`;
}

// header ไทย → field — ใช้ predicate ไม่ใช่ exact string เพราะหัวตารางมีหน่วยต่อท้าย
// (เช่น 'คงเหลือ (หน่วย)', 'ROP = SS + Avg×LT') และเปลี่ยนได้ตามรุ่นของชีต
const ANALYSIS_FIELDS = [
  ['code',          h => h === 'รหัส' || h === 'รหัสยา' || h.toLowerCase() === 'code'],
  ['type',          h => h === 'ชนิด'],
  ['name',          h => h === 'รายการยา' || h === 'ชื่อยา'],
  ['unit',          h => h === 'หน่วย'],
  ['max',           h => h.startsWith('Max')],
  ['avgMonth',      h => h.startsWith('Avg/เดือน')],
  ['avgDay',        h => h.startsWith('Avg/วัน')],
  ['stock',         h => h === 'คงเหลือ' || h.startsWith('คงเหลือ (')],
  ['ss',            h => h.startsWith('Safety Stock')],
  ['leadTimeDays',  h => h.startsWith('Lead Time')],
  ['rop',           h => h.startsWith('ROP')],
  ['status',        h => h === 'สถานะ'],
  ['orderQty',      h => h.startsWith('จำนวน') && h.includes('สั่ง')],
  ['pricePerUnit',  h => h.startsWith('ราคา')],
  ['supplier',      h => h.startsWith('บริษัท')],
  ['lastReceived',  h => h.startsWith('วันที่รับเข้า')],
  ['amount',        h => h.startsWith('มูลค่า')],
  ['riskGroup',     h => h.startsWith('กลุ่ม')],
  ['ssMultiplier',  h => h.startsWith('ตัวคูณ')],
  ['excludeStatus', h => h.startsWith('ตัดออกจากบัญชี')],
];

const TEXT_FIELDS = new Set(['name','type','unit','supplier','status','riskGroup','excludeStatus','lastReceived']);

const toNum = v => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// aoa = array-of-arrays จากชีต · คืน { headerRowIndex, months, rows, statsFrom, statsTo, ... }
// ห้าม fix header ที่แถว 1 — ชีตจริงมีแถว title/ปุ่มอยู่ข้างบน จึงต้องสแกนหา
export function parseAnalysisSheet(aoa) {
  const headerRowIndex = (aoa || []).findIndex(r =>
    Array.isArray(r) && r.some(c => String(c).trim() === 'รหัส') && r.some(c => String(c).trim() === 'สถานะ'));
  if (headerRowIndex < 0) throw new Error('ไม่พบแถวหัวตาราง — ต้องมีคอลัมน์ "รหัส" และ "สถานะ"');

  const header = aoa[headerRowIndex].map(h => String(h ?? '').trim());
  const colOf = {};
  const mappedCols = new Set();
  header.forEach((h, i) => {
    if (!h) return;
    for (const [field, test] of ANALYSIS_FIELDS) {
      if (colOf[field] == null && test(h)) { colOf[field] = i; mappedCols.add(i); break; }
    }
  });
  if (colOf.code == null) throw new Error('ไม่พบคอลัมน์ "รหัส"');

  // คอลัมน์เดือนเป็น dynamic — จับด้วย prefix 'เบิก ' ห้าม hardcode ชื่อเดือน
  const months = header
    .map((h, i) => (h.startsWith('เบิก') ? { ym: monthHeaderToYm(h), label: h, col: i } : null))
    .filter(m => m && m.ym)
    .sort((a, b) => a.ym.localeCompare(b.ym));

  const rows = [];
  for (let i = headerRowIndex + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    const rawCode = r[colOf.code];
    if (rawCode == null || String(rawCode).trim() === '') continue;
    const row = { code: String(rawCode).trim(), excelRow: i + 1 };
    for (const [field] of ANALYSIS_FIELDS) {
      if (field === 'code' || colOf[field] == null) continue;
      row[field] = TEXT_FIELDS.has(field) ? String(r[colOf[field]] ?? '').trim() : toNum(r[colOf[field]]);
    }
    row.status = normalizeStatus(row.status);
    row.excludeStatus = normalizeStatus(row.excludeStatus);
    if (row.excludeStatus === '-') row.excludeStatus = '';
    row.monthlyUsage = months.map(m => toNum(r[m.col]));
    rows.push(row);
  }
  if (rows.length === 0) throw new Error('ไม่พบแถวข้อมูล (คอลัมน์ "รหัส" ว่างทั้งหมด)');

  // ช่วงสถิติ = เดือนที่มียอดเบิกจริง (คอลัมน์เดือนที่เป็น 0 ทั้งชีต = เดือนที่ยังไม่มีข้อมูล)
  const used = months.filter((_, mi) => rows.some(r => r.monthlyUsage[mi] > 0));
  const span = used.length > 0 ? used : months;

  return {
    title: String(aoa[0]?.[0] ?? '').trim(),
    headerRowIndex,
    months,
    rows,
    statsFrom: span.length ? `${span[0].ym}-01` : null,
    statsTo: span.length ? `${span[span.length - 1].ym}-01` : null,
    unmatchedHeaders: header.filter((h, i) => h && !mappedCols.has(i) && !h.startsWith('เบิก')),
  };
}

// ── Verification: เทียบสูตรในโค้ดกับตัวเลขที่ Excel คำนวณมา ──
// ป้อน "ค่ากลาง" จาก Excel เข้าแต่ละ step เพื่อให้แต่ละ step อิสระต่อกัน
// (step ที่ ✗ = สูตรนั้นหลุดจาก Excel — ไม่ลาม cascade ไป step ถัดไป)
const VERIFY_TOL = { ss: 1, rop: 1, orderQty: 1, amount: 0.5 };

function stepDiff(key, appVal, excelVal) {
  const app = Math.round(appVal * 100) / 100;
  const excel = +excelVal || 0;
  const delta = Math.round((app - excel) * 100) / 100;
  return { app, excel, delta, ok: Math.abs(delta) <= VERIFY_TOL[key] };
}

// row = แถวที่ parse จาก Excel แล้ว (ดู parseAnalysisExcel ใน db.js)
export function verifyExcelRow(row) {
  const avgDay = +row.avgDay || 0;
  const ssMult = +row.ssMultiplier || RISK_MULTIPLIER[row.riskGroup] || 1.0;
  const rawSS = computeSafetyStock(avgDay, ssMult);

  const steps = {
    ss:  stepDiff('ss',  Math.round(rawSS), row.ss),
    rop: stepDiff('rop', computeROP(rawSS, avgDay, +row.leadTimeDays || 0), row.rop),
    orderQty: stepDiff('orderQty', computeOrderQty({
      status: normalizeStatus(row.status),
      max: +row.max || 0,
      avgMonth: +row.avgMonth || 0,
      rop: +row.rop || 0,        // ใช้ ROP ของ Excel เพื่อไม่ให้ error จาก step ก่อนลาม
      stock: +row.stock || 0,
      mode: row.mode || 'normal',
    }), row.orderQty),
  };
  steps.amount = stepDiff('amount', (+row.orderQty || 0) * (+row.pricePerUnit || 0), row.amount);

  return { steps, allOk: Object.values(steps).every(s => s.ok) };
}

// สรุปผล verify ทั้งชุด: { total, pass, fail, byStep: { ss: {pass,fail}, ... } }
export function summarizeVerification(verified) {
  const byStep = {};
  let pass = 0;
  for (const v of verified) {
    if (v.allOk) pass++;
    for (const [k, s] of Object.entries(v.steps)) {
      if (!byStep[k]) byStep[k] = { pass: 0, fail: 0 };
      byStep[k][s.ok ? 'pass' : 'fail']++;
    }
  }
  return { total: verified.length, pass, fail: verified.length - pass, byStep };
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