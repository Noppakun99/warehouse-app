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

// ตะกร้าในเครื่อง (sessionStorage) — ใช้ร่วม RequisitionApp + การ์ดตะกร้าค้างบนหน้าหลัก (CartReminderCard)
export const CART_KEY = 'req_cart_draft';
export const CART_TYPE_KEY = 'req_cart_type'; // ประเภทใบของตะกร้า (1 ใบมีประเภทเดียว — CONTEXT §ใบเบิกออนไลน์)
// ล้างตะกร้าจากการ์ดต้องล้างในเครื่องด้วย — ไม่งั้นเปิดหน้าเบิกแล้วตะกร้าฟื้นจาก sessionStorage และบันทึกกลับลง DB (พบ 13/11/2569)
export function clearLocalCart() {
  try { sessionStorage.removeItem(CART_KEY); sessionStorage.removeItem(CART_TYPE_KEY); } catch { /* storage ถูกปิด */ }
}

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
// คำเรียกแพ็คใหญ่ตอนผู้เบิกเลือกขนาด: ยาน้ำ (หน่วยย่อยขวด) = ลัง · อื่นๆ = กล่อง (user 18/11/2569)
export const packWord = (baseUnit = '') => (/^(ขวด|bott)/i.test(String(baseUnit).trim()) ? 'ลัง' : 'กล่อง');

// packUnits = [{ packSize, unit }] ของ lot ที่ยังไม่หมดอายุ เรียง lot ที่จะจ่ายก่อนไว้หน้า (ไม่ส่ง = กฎเดิม)
// lot ต่างขนาด (รวมแบบไม่มีขนาด = หน่วยย่อย) → options ให้ผู้เบิกเลือก (CONTEXT §หน่วยคีย์ "กันกำกวม") · defaultPack = ขนาดของ lot แรก
// packSize/label ของผลยังเป็นหน่วยย่อย = ค่าที่ใช้เมื่อไม่รู้ว่าเลือกอะไร (ใบเก่าที่ไม่มี entry_pack)
export function entryUnitOf({ unit = '', baseUnit = '', packSizes = [], packUnits = null } = {}) {
  if (packUnits) {
    const seen = new Map();
    for (const p of packUnits) {
      const ps = Number(p?.packSize) > 1 ? Number(p.packSize) : 1;
      if (!seen.has(ps)) seen.set(ps, String(p?.unit || '').trim());
    }
    if (seen.size > 1) {
      const word = packWord(baseUnit);
      const options = [...seen].map(([ps, u]) => ps > 1
        ? { packSize: ps, unit: u, word, label: `${word} (${u})` }
        : { packSize: 1, unit: baseUnit || u, word: null, label: baseUnit || u });
      return { packSize: 1, label: baseUnit || unit, hint: null, options, defaultPack: options[0].packSize };
    }
  }
  const sizes = [...new Set(packSizes.filter(n => Number(n) > 1).map(Number))];
  if (sizes.length === 1) return { packSize: sizes[0], label: unit, hint: null };
  if (sizes.length > 1) return { packSize: 1, label: baseUnit || unit, hint: null };
  const m = String(unit || '').trim().match(/^(\d[\d,]*)\s*(\D.*)$/);
  const hint = m && Number(m[1].replace(/,/g, '')) > 1 ? `1 ${unit} = ${m[1]} ${m[2].trim()}` : null;
  return { packSize: 1, label: unit, hint };
}

// จำนวนที่ผู้เบิกขอตามขนาดที่เลือก (requisition_items.entry_pack/entry_unit) → "2 กล่อง (400เม็ด)"
// ไม่ได้เลือกขนาด → null (ผู้เรียกแสดงแบบเดิม) · แก้จำนวนทีหลังจนไม่เต็มกล่อง → ทศนิยม เช่น "2.5 กล่อง (400เม็ด)"
export function entryQtyText(base, entryPack, entryUnit, baseUnit = '') {
  const ps = Number(entryPack) || 0;
  if (!(ps > 1) || !entryUnit) return null;
  const n = (Number(base) || 0) / ps;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${packWord(baseUnit)} (${entryUnit})`;
}
