// ปุ่มลัดช่วงเวลา + หัววัน ของหน้าประวัติเบิกจ่าย / ประวัติรับยา — pure (ไม่ import supabase)
// วันที่ใน state ของช่องวันที่เป็น DD/MM/YYYY ค.ศ. (แบบ ThaiDateInput) · ปีงบเริ่ม 1 ต.ค.

const pad2 = (n) => String(n).padStart(2, '0');
const ceThai = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

export const PERIODS = [['month', 'เดือนนี้'], ['prev', 'เดือนก่อน'], ['3m', '3 เดือน'], ['fy', 'ปีงบนี้'], ['all', 'ทั้งหมด']];

/** ปุ่มลัด → [ตั้งแต่, ถึง] · 'all' = ['', ''] */
export function periodRange(key, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), today = ceThai(now);
  if (key === 'month') return [ceThai(new Date(y, m, 1)), today];
  if (key === 'prev')  return [ceThai(new Date(y, m - 1, 1)), ceThai(new Date(y, m, 0))];
  if (key === '3m')    return [ceThai(new Date(y, m - 2, 1)), today];
  if (key === 'fy')    return [ceThai(new Date(m >= 9 ? y : y - 1, 9, 1)), today];
  return ['', ''];
}

/** ช่วงวันที่ตรงปุ่มลัดไหน — ไม่ตรงสักปุ่ม = 'custom' */
export const activePeriod = (from, to) => PERIODS.find(([k]) => { const [f, t] = periodRange(k); return f === from && t === to; })?.[0] || 'custom';

/**
 * ครอบค่าในตัวกรอง .or() ของ PostgREST ด้วย "..." — ชื่อยามี , หรือ ( ) ได้ (เช่น "Acetaminophen 500mg ,Para")
 * ไม่ครอบ = จุลภาคถูกอ่านเป็นตัวคั่นเงื่อนไข → 400 ทั้งตาราง/สรุป/ส่งออก
 */
export const pgOrValue = (v) => `"${String(v).replace(/[\\"]/g, m => `\\${m}`)}"`;

/**
 * จัดอันดับตามมูลค่า (แผงสรุปบนหน้าประวัติ) → { top: [{ key, label, value, count }], size }
 * countFn = นับแบบไม่ซ้ำ (เช่น บิล) · ไม่ส่ง = นับแถว · size = จำนวน key ทั้งหมด
 */
export function rankBy(rows, keyFn, valueFn, { n = 10, labelFn, countFn } = {}) {
  const m = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    if (!key) continue;
    let e = m.get(key);
    if (!e) { e = { key, label: labelFn ? labelFn(r) : key, value: 0, seen: new Set(), rows: 0 }; m.set(key, e); }
    e.value += Number(valueFn(r)) || 0;
    e.rows += 1;
    if (countFn) e.seen.add(countFn(r));
  }
  const all = [...m.values()]
    .map(({ key, label, value, seen, rows: c }) => ({ key, label, value, count: countFn ? seen.size : c }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'th'));
  return { top: all.slice(0, n), size: all.length };
}

const TH_DAYS =['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
/** ISO → "พฤหัสบดี 13/11/2569" */
export const dayLabel = (iso) => {
  if (!iso) return 'ไม่ระบุวันที่';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${TH_DAYS[new Date(y, m - 1, d).getDay()]} ${pad2(d)}/${pad2(m)}/${y + 543}`;
};
