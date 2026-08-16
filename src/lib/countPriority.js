// countPriority.js — pure logic จัดอันดับ "ควรตรวจนับตัวไหนก่อน" (cycle count prioritization)
//
// ปัญหา: ตรวจนับเป็นการ "สุ่มเลือกรหัสเอง" (ADR-0008) — หัวหน้าคลังต้องเดาเองว่าจะนับตัวไหน
// ทำให้ยาบางตัวถูกนับซ้ำๆ ส่วนยาที่ไม่เคยนับเลยไม่ถูกแตะตลอดกาล
//
// วิธี: ให้คะแนนความเสี่ยง 4 สัญญาณ แล้วเรียงมาก→น้อย พร้อม "เหตุผลกำกับทุกตัว"
// (ห้ามโชว์คะแนนลอยๆ — คนใช้ต้องรู้ว่าทำไมระบบแนะนำตัวนี้ ไม่งั้นไม่เชื่อถือ)
//
// ⚠️ pure module — ห้าม import supabase (รัน golden test ใน node ได้: npm run test:countpriority)

const toNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }

/** น้ำหนักคะแนนแต่ละสัญญาณ (รวม 100) — ปรับที่เดียวจบ */
export const WEIGHT = {
  neverCounted: 35,   // ไม่เคยนับ/นับนานแล้ว — หัวใจของ cycle count กันยาตกสำรวจถาวร
  dispense:     30,   // เบิกบ่อย = เคลื่อนไหวมาก โอกาสคลาดเคลื่อนสูง
  value:        20,   // มูลค่ารับเข้าสูง = ผิดแล้วเสียหายเป็นเงินมาก
  location:     15,   // หลายชั้นวาง = เสี่ยงนับตกหล่น (เจอชั้นเดียวคิดว่าครบ)
}

/** จำนวนวันที่ถือว่า "นับนานแล้ว" — เกินนี้ได้คะแนนเต็มเท่าไม่เคยนับ */
export const STALE_DAYS = 180

/**
 * normalize ค่าเป็น 0..1 เทียบกับค่าสูงสุดในชุด (relative scoring)
 * ใช้ relative ไม่ใช่ absolute threshold เพราะขนาดคลังแต่ละที่ต่างกันมาก
 * — ยาที่เบิก 26 ครั้งอาจเป็น "บ่อยสุด" ในคลังเล็ก แต่ธรรมดาในคลังใหญ่
 */
const ratio = (v, max) => (max > 0 ? Math.min(1, toNum(v) / max) : 0)

/** วันห่างจาก iso ถึง today (ทั้งคู่ YYYY-MM-DD) — null = ไม่เคย */
export function daysSince(iso, today) {
  if (!iso) return null
  const a = new Date(String(iso).slice(0, 10) + 'T00:00:00Z')
  const b = new Date(String(today).slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.round((b - a) / 86400000)
}

/**
 * คำนวณอันดับความสำคัญของการตรวจนับ
 *
 * @param {object} input
 *   drugs        [{ code, name, locations:number, lots:number }]  — จาก inventory (qty>0)
 *   dispenseFreq { [code]: จำนวนครั้งที่เบิก }                      — นับ "ครั้ง" ไม่ใช่ปริมาณ
 *   receiveValue { [code]: มูลค่ารับเข้ารวม (บาท) }
 *   lastCounted  { [code]: 'YYYY-MM-DD' }                          — ไม่มี key = ไม่เคยนับ
 *   today        'YYYY-MM-DD'
 * @returns [{ code, name, score, reasons:[], daysSinceCount, ... }] เรียงคะแนนมาก→น้อย
 */
export function rankCountPriority({ drugs = [], dispenseFreq = {}, receiveValue = {}, lastCounted = {}, today }) {
  if (!drugs.length) return []
  const maxFreq = Math.max(0, ...drugs.map(d => toNum(dispenseFreq[d.code])))
  const maxValue = Math.max(0, ...drugs.map(d => toNum(receiveValue[d.code])))

  return drugs.map(d => {
    const freq = toNum(dispenseFreq[d.code])
    const value = toNum(receiveValue[d.code])
    const locs = Math.max(1, toNum(d.locations) || 1)
    const days = daysSince(lastCounted[d.code], today)

    // ไม่เคยนับ = เต็ม; เคยนับ = ไต่ขึ้นตามวันที่ผ่านไป จนเต็มที่ STALE_DAYS
    const stalePart = days == null ? 1 : Math.min(1, days / STALE_DAYS)
    const freqPart = ratio(freq, maxFreq)
    const valuePart = ratio(value, maxValue)
    // หลายชั้น: 1 ชั้น = 0, ตั้งแต่ 2 ชั้นขึ้นไปไต่ถึงเต็มที่ 4 ชั้น
    const locPart = locs <= 1 ? 0 : Math.min(1, (locs - 1) / 3)

    const score = Math.round(
      stalePart * WEIGHT.neverCounted +
      freqPart  * WEIGHT.dispense +
      valuePart * WEIGHT.value +
      locPart   * WEIGHT.location
    )

    // เหตุผล — เรียงตามน้ำหนักที่ส่งผลจริงกับตัวนี้ ไม่ใช่ลำดับคงที่
    const reasons = []
    if (days == null) reasons.push({ key: 'never', text: 'ไม่เคยตรวจนับ', w: stalePart * WEIGHT.neverCounted })
    else if (days >= STALE_DAYS) reasons.push({ key: 'stale', text: `นับล่าสุด ${days} วันก่อน`, w: stalePart * WEIGHT.neverCounted })
    if (freq > 0 && freqPart >= 0.5) reasons.push({ key: 'dispense', text: `เบิกบ่อย ${freq} ครั้ง`, w: freqPart * WEIGHT.dispense })
    if (value > 0 && valuePart >= 0.5) reasons.push({ key: 'value', text: `มูลค่ารับเข้าสูง`, w: valuePart * WEIGHT.value })
    if (locs > 1) reasons.push({ key: 'location', text: `เก็บ ${locs} ชั้นวาง`, w: locPart * WEIGHT.location })
    reasons.sort((a, b) => b.w - a.w)

    return {
      code: d.code, name: d.name || '-',
      score, reasons: reasons.map(r => ({ key: r.key, text: r.text })),
      daysSinceCount: days, dispenseCount: freq, receiveValue: value, locations: locs,
    }
  }).sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
}
