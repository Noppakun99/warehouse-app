// ประเภทใบเบิกออนไลน์ (CONTEXT §ใบเบิกออนไลน์ — 1 ใบมีประเภทเดียว)
// pure module: ไม่ import supabase → golden-testable (npm run test:reqtype)
//
// key ชุดเดียวกับ FORMS ใน printedReqForm.js + CHECK constraint requisitions.req_type
// ประเภทของยามาจาก inventory.main_log (คอลัมน์ MainLog ของ Master) — ตรวจข้อมูลจริง 13/11/2569:
//   คลังน้ำเกลือ 94 แถว (ชนิด Saline) · คลังถุง/ขวด/ตลับ 41 แถว (เวชภัณฑ์มิใช่ยา) · ที่เหลือ = ยา
//   Gelofusine อยู่ชั้น C → ยา (หัวหน้าสั่งเอง ไม่อยู่ในใบน้ำเกลือ)

export const REQ_TYPES = [
  { key: 'saline', label: 'น้ำเกลือ' },
  { key: 'supply', label: 'ถุง/ขวด/ตลับ' },
  { key: 'drug',   label: 'ยา' },
];

export const reqTypeLabel = (key) => REQ_TYPES.find(t => t.key === key)?.label || '';

export function reqTypeOfMainLog(mainLog) {
  const s = String(mainLog || '').replace(/\s+/g, '');
  if (s === 'คลังน้ำเกลือ') return 'saline';
  if (s === 'คลังถุง/ขวด/ตลับ') return 'supply';
  return 'drug';
}

// ยา 1 รหัสมีหลายแถว (หลาย lot/ที่เก็บ) — ประเภทของยา = ประเภทที่แถวส่วนใหญ่อยู่ (เสมอกันเอาที่เจอก่อน)
export function reqTypeOfRows(rows = []) {
  const count = {};
  let best = null;
  for (const r of rows) {
    const t = reqTypeOfMainLog(r?.main_log);
    count[t] = (count[t] || 0) + 1;
    if (!best || count[t] > count[best]) best = t;
  }
  return best || 'drug';
}

// หน่วยคีย์ (CONTEXT §หน่วยคีย์): ใบน้ำเกลือ/ถุง คีย์เป็นหน่วยตาม Master แล้วเก็บ requested_qty เป็นหน่วยย่อยสุดเหมือนเดิม
// packSize = ขนาดบรรจุที่ parseUnit แยกได้ (เช่น "1000ml" = 1000) — lot ต่างขนาดกัน = คีย์หน่วยย่อย (เฟส 2 ค่อยบังคับเลือก)
// hint = หน่วยที่มีตัวเลขนำแต่ parseUnit ไม่แตก (เช่น "50amp") → บอกผู้เบิกว่า 1 หน่วย = 50 amp ไม่แปลงจำนวน
export function entryUnitOf({ unit = '', baseUnit = '', packSizes = [] } = {}) {
  const sizes = [...new Set(packSizes.filter(n => Number(n) > 1).map(Number))];
  if (sizes.length === 1) return { packSize: sizes[0], label: unit, hint: null };
  if (sizes.length > 1) return { packSize: 1, label: baseUnit || unit, hint: null };
  const m = String(unit || '').trim().match(/^(\d[\d,]*)\s*(\D.*)$/);
  const hint = m && Number(m[1].replace(/,/g, '')) > 1 ? `1 ${unit} = ${m[1]} ${m[2].trim()}` : null;
  return { packSize: 1, label: unit, hint };
}
