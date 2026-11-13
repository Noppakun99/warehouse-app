// ค้นยาหน้าเบิก (ผู้เบิก) — ชื่อที่หน่วยงานเขียน/พิมพ์ ≠ ชื่อใน Master
// ตรวจรูปใบเบิกจริง 10 ใบ 13/11/2569: ช่องว่างต่างกัน ("Amlodipine 10 mg" vs "Amlodipine besilate 10mg"),
// คำคั่นกลาง ("lidocaine 2%" vs "LidocaineHCL 2%"), ชื่อเรียกอื่น (พารา/ORS/SK/ครีมไพล), สะกดต่าง (carvediol)
// pure module — ไม่ import supabase (golden test: npm run test:drugsearch)

// ตัวพิมพ์เล็ก + ตัดช่องว่าง . , - ( ) / + — "N.S.S" = "nss", "D-5-S/3" = "d5s3"
export const normDrugText = (s) => String(s ?? '').toLowerCase().normalize('NFC').replace(/[\s.,\-()/+]+/g, '')

// คำเรียกอื่น → คำที่อยู่ในชื่อ Master (key/value ผ่าน normDrugText แล้ว) · ระดับคำ ไม่ใช่รหัส: 1 คำได้หลายรหัส
// เจอคำที่ผู้เบิกค้นไม่ติดให้เติมที่นี่ + เติมเคสใน drugSearchText.test.js
export const DRUG_SYNONYMS = {
  para: ['acetaminophen'], paracetamol: ['acetaminophen'], พารา: ['acetaminophen'], พาราเซตามอล: ['acetaminophen'],
  syr: ['ml'], syrup: ['ml'],
  ors: ['oralrehydration'], เกลือแร่: ['oralrehydration'], ผงเกลือแร่: ['oralrehydration'],
  sk: ['streptokinase'],
  nss: ['sodiumchloride'], normalsaline: ['sodiumchloride'], '09%': ['sodiumchloride'], น้ำเกลือ: ['sodiumchloride'],
  ครีมไพล: ['ไพลครีม'], ครีมพญายอ: ['พญายอครีม'],
  analgesicbalm: ['methylsalicylatebalm'], ยาหม่อง: ['balm'],
  carvediol: ['carvedilol'], mealeate: ['maleate'], besylate: ['besilate'],
  gualacalate: ['guaiacolate'], guaifenesin: ['guaiacolate'],
  clexane: ['enoxaparin'], vitk: ['phytonadione'], vitamink: ['phytonadione'], tnk: ['tenecteplase'], gemotran: ['tranexamic'],
}

// คะแนน (น้อย = ขึ้นก่อน) หรือ -1 ถ้าไม่ตรง
//   0 รหัสตรงตัว / ทั้งคำค้นเป็นคำเรียกอื่น ("analgesic balm") · 1 ตรงผ่านคำเรียกอื่น (sk → Streptokinase ก่อน Sketolene)
//   2 ชื่อขึ้นต้นด้วยคำแรก · 3 ชื่อมีครบทุกคำ (ไม่ต้องเรียง)
export function matchDrugQuery(name, code, q) {
  const nq = normDrugText(q)
  if (!nq) return -1
  const hay = normDrugText(name)
  const c = normDrugText(code)
  if (c && c === nq) return 0
  if (DRUG_SYNONYMS[nq]?.some(s => hay.includes(s))) return 0
  const toks = String(q).split(/\s+/).map(normDrugText).filter(Boolean)
  let viaSyn = false
  for (const t of toks) {
    if (DRUG_SYNONYMS[t]?.some(s => hay.includes(s))) { viaSyn = true; continue }
    if (hay.includes(t) || (c && c.includes(t))) continue
    return -1
  }
  if (viaSyn) return 1
  return hay.startsWith(toks[0]) ? 2 : 3
}

// list = [{ name, code, ... }] → รายการที่ตรง เรียงตามคะแนนแล้วชื่อ
export function rankDrugs(list = [], q, limit = Infinity) {
  const out = []
  for (const d of list) {
    const score = matchDrugQuery(d.name, d.code, q)
    if (score >= 0) out.push({ d, score })
  }
  out.sort((a, b) => (a.score - b.score) || String(a.d.name).localeCompare(String(b.d.name), 'th'))
  return out.slice(0, limit).map(x => x.d)
}
