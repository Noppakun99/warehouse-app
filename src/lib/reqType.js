// ประเภทใบเบิกออนไลน์ (CONTEXT §ใบเบิกออนไลน์ — 1 ใบมีประเภทเดียว)
// pure module: ไม่ import supabase → golden-testable (npm run test:reqtype)
//
// key ชุดเดียวกับ FORMS ใน printedReqForm.js + CHECK constraint requisitions.req_type
// ประเภทของยามาจาก inventory.main_log (คอลัมน์ MainLog ของ Master) — ตรวจข้อมูลจริง 13/11/2569:
//   คลังน้ำเกลือ 94 แถว (ชนิด Saline) · คลังถุง/ขวด/ตลับ 41 แถว (เวชภัณฑ์มิใช่ยา) · ที่เหลือ = ยา
//   Gelofusine อยู่ชั้น C → ยา (หัวหน้าสั่งเอง ไม่อยู่ในใบน้ำเกลือ)

import { packWord as unitPackWord } from './drugProfile.js';

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

// ลัง (CONTEXT §ลัง — ผู้เบิกเห็นและเบิกเป็นลัง 24/11/2569): lot มี caseSize/caseWord/caseUnit จากชีทขนาดลัง (inventory.case_*)
// เบิกเป็นลังได้เฉพาะเมื่อ "ทุก lot" รู้ขนาดลัง และ ขนาดแพ็ค/จำนวนต่อลัง/คำเรียก/หน่วยในลัง เท่ากันหมด — ไม่ครบ = null (ห้ามเดา)
// word ว่าง = "ลัง" · หน่วยในลังว่าง = หน่วยตาม Master ("37 × 1000เม็ด" / "10 bott") ไม่เดาว่ากล่องหรือกระปุก
export function caseOfLots(lots = []) {
  if (!lots.length) return null;
  const sig = (l) => [Number(l?.packSize) > 1 ? Number(l.packSize) : 1, Number(l?.caseSize) || 0, l?.caseWord || '', l?.caseUnit || '', String(l?.unit || '').trim()].join('|');
  if (!(Number(lots[0]?.caseSize) > 0) || lots.some(l => sig(l) !== sig(lots[0]))) return null;
  const l = lots[0];
  const packSize = Number(l.packSize) > 1 ? Number(l.packSize) : 1;
  const unit = String(l.unit || '').trim();
  const per = Number(l.caseSize);
  const inner = l.caseUnit ? `${per} ${l.caseUnit}` : packSize > 1 ? `${per} × ${unit}` : `${per} ${unit}`;
  return { per, packSize, unit, word: l.caseWord || 'ลัง', boxWord: l.caseUnit || null, inner };
}

// "1 ลัง = 24 กระปุก" — บรรทัดบอกขนาดลังบนการ์ดยา/รายละเอียด lot
export const caseLine = (c) => (c ? `1 ${c.word} = ${c.inner}` : '');

// entry_unit แบบมีคำเรียกในตัว "ลัง (24 กระปุก)" / "กระปุก (500เม็ด)" — ใบเก่าเก็บแค่หน่วย Master ("400เม็ด") ใช้ packWord เหมือนเดิม
// (ตรวจ DB 24/11/2569: entry_unit เดิมมีแค่ "12หลอด" · หน่วยใน inventory ไม่มีตัวไหนมี " (" — ไม่ชนกัน)
const WORD_FORM = /^\S+ \(.+\)$/;
export const entryPackLabel = (entryUnit, baseUnit = '') => (WORD_FORM.test(String(entryUnit || '')) ? entryUnit : `${packWord(baseUnit)} (${entryUnit})`);

// lot ขนาดเดียว + รู้ลัง → ปุ่ม [หน่วยซื้อ | ลัง] (ค่าเริ่ม = หน่วยซื้อ) · caseInner = ขนาดแพ็คในลัง (ตะกร้าเทียบกับ lot ที่จะจ่าย)
// ปุ่มหน่วยซื้อเก็บ entry_unit เฉพาะเมื่อมีคำเรียก (หน่วยในลัง) — ไม่มีคง unit null = ใบออกหน้าตาเดิม (scrutinize 24/11/2569)
function withCaseOption(base, c) {
  const box = c.packSize > 1
    ? (c.boxWord ? { packSize: c.packSize, unit: `${c.boxWord} (${c.unit})`, word: c.boxWord, label: `${c.boxWord} (${c.unit})` }
      : { packSize: c.packSize, unit: null, word: null, label: c.unit })
    : { packSize: 1, unit: null, word: null, label: c.boxWord || c.unit };
  const label = `${c.word} (${c.inner})`;
  const kase = { packSize: c.packSize * c.per, unit: label, word: c.word, label, caseInner: c.packSize };
  return { ...base, options: [box, kase], defaultPack: box.packSize, caseInfo: c };
}

// packUnits = [{ packSize, unit, caseSize?, caseWord?, caseUnit? }] ของ lot ที่ยังไม่หมดอายุ เรียง lot ที่จะจ่ายก่อนไว้หน้า (ไม่ส่ง = กฎเดิม)
// lot ต่างขนาด (รวมแบบไม่มีขนาด = หน่วยย่อย) → options ให้ผู้เบิกเลือก (CONTEXT §หน่วยคีย์ "กันกำกวม") · defaultPack = ขนาดของ lot แรก
// packSize/label ของผลยังเป็นหน่วยย่อย = ค่าที่ใช้เมื่อไม่รู้ว่าเลือกอะไร (ใบเก่าที่ไม่มี entry_pack)
export function entryUnitOf({ unit = '', baseUnit = '', packSizes = [], packUnits = null } = {}) {
  const c = packUnits ? caseOfLots(packUnits) : null;
  if (c) return withCaseOption(entryUnitOf({ unit, baseUnit, packSizes }), c);
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
  const hint = m && Number(m[1].replace(/,/g, '')) > 1 ? `1 ${unitPackWord(unit)} = ${m[1]} ${m[2].trim()}` : null;
  return { packSize: 1, label: unit, hint };
}

// หน่วยคีย์ของยา 1 ตัวจาก lot ในคลัง: ขนาดให้เลือกมาจาก lot ที่จ่ายได้ตอนนี้ (dispensable — ตรวจรับแล้ว มีของ เรียงลำดับจ่าย) เท่านั้น
// others (lot รอตรวจรับ / คงเหลือ 0) ใช้เมื่อไม่มี lot จ่ายได้เลย — เดิมรวมกัน ผู้เบิกเลือก "กล่อง (400เม็ด)" ของ lot ที่ยังรอตรวจรับ
// แล้วคลังจ่ายกล่อง 500 ขึ้นว่าเกินที่ขอ (Dicloxacillin user 20/11/2569)
export function entryUnitForLots({ unit = '', baseUnit = '', dispensable = [], others = [] } = {}) {
  const src = dispensable.length ? dispensable : others;
  return entryUnitOf({ unit: src[0]?.unit || unit, baseUnit, packSizes: src.map(p => p.packSize), packUnits: src });
}

// จำนวนที่ผู้เบิกขอตามขนาดที่เลือก (requisition_items.entry_pack/entry_unit) → "2 กล่อง (400เม็ด)"
// ไม่ได้เลือกขนาด → null (ผู้เรียกแสดงแบบเดิม) · แก้จำนวนทีหลังจนไม่เต็มกล่อง → ทศนิยม เช่น "2.5 กล่อง (400เม็ด)"
export function entryQtyText(base, entryPack, entryUnit, baseUnit = '') {
  const ps = Number(entryPack) || 0;
  if (!(ps > 1) || !entryUnit) return null;
  const n = (Number(base) || 0) / ps;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${entryPackLabel(entryUnit, baseUnit)}`;
}
