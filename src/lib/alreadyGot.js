// รายการ "ได้ยาไปแล้ว" ในใบเบิกออนไลน์ (user ตัดสิน 24/11/2569)
// หน่วยงานรับยาไปก่อนโดยยังไม่มีใบ แล้วเขียนรวมกับใบรอบถัดไป → รายการ requested_qty = 0 = บันทึกเท่านั้น
// คลังไม่จัด ไม่ลงชีทเบิกซ้ำ (ตัดสต็อกไปแล้วตอนจ่ายจริง) · ไม่มีคอลัมน์ DB ใหม่ — ใช้จำนวน 0 + หมายเหตุรายการ
// ใบที่มีแต่รายการได้ยาไปแล้วส่งได้ · pure (ไม่ import supabase) → node src/lib/alreadyGot.test.js

export const ALREADY_GOT_PREFIX = 'ได้ยาไปแล้ว'

export const isAlreadyGotQty = (qty) => qty !== '' && qty != null && Number(qty) === 0

// ISO YYYY-MM-DD → DD/MM/YYYY พ.ศ.
export function isoToThaiBE(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${Number(m[1]) + 543}` : ''
}

// จำนวน + หน่วยแบบชีทเบิก: หน่วยขึ้นต้นด้วยเลข (50amp, 1000เม็ด) = ขนาดบรรจุ → "2 × 50amp"
export function qtyUnitText(qty, unit) {
  const q = Number(qty)
  const qs = Number.isFinite(q) ? q.toLocaleString('en-US') : String(qty ?? '')
  const u = String(unit || '').trim()
  if (!u || u === '-') return qs
  return /^\d/.test(u) ? `${qs} × ${u}` : `${qs} ${u}`
}

// หมายเหตุรายการ: "ได้ยาไปแล้ว 20/11/2569 จำนวน 2 × 50amp (บย.70/0090)"
export function formatAlreadyGotNote({ date, qty, unit, reqNumber } = {}) {
  const parts = [ALREADY_GOT_PREFIX]
  const d = isoToThaiBE(date)
  if (d) parts.push(d)
  if (qty != null && qty !== '') parts.push(`จำนวน ${qtyUnitText(qty, unit)}`)
  const rn = String(reqNumber || '').trim()
  if (rn) parts.push(`(${rn})`)
  return parts.join(' ')
}

// มีรายละเอียดเกินคำนำหน้าไหม (อย่างน้อยวันที่หรือจำนวน) — ส่งใบได้เมื่อทุกรายการ 0 ผ่านข้อนี้
export function hasAlreadyGotDetail(note) {
  const s = String(note || '').trim()
  const rest = s.startsWith(ALREADY_GOT_PREFIX) ? s.slice(ALREADY_GOT_PREFIX.length).trim() : s
  return /\d/.test(rest)
}

// หมายเหตุที่ส่งจริง: ผู้เบิกพิมพ์เองไม่ขึ้นต้นคำนำหน้า → เติมให้ คลังเห็นชัดว่าเป็นรายการบันทึก
export function alreadyGotNoteForSubmit(note) {
  const s = String(note || '').trim()
  if (!s) return ALREADY_GOT_PREFIX
  return s.startsWith(ALREADY_GOT_PREFIX) ? s : `${ALREADY_GOT_PREFIX} ${s}`
}

// ประวัติเบิกของหน่วยงาน×รหัส (dispense_logs) → ตัวเลือกให้กด · ชีทเบิกแยกแถวต่อ lot
// จึงรวมวันเดียวกัน+เลขใบเดียวกัน+หน่วยเดียวกันเป็นรายการเดียว · ใหม่ก่อน · ตัด qty_out ≤ 0
export function recentDispenseOptions(rows = [], { limit = 5 } = {}) {
  const map = new Map()
  for (const r of rows) {
    const q = Number(r.qty_out)
    if (!r.dispense_date || !Number.isFinite(q) || q <= 0) continue
    const unit = String(r.drug_unit || '').trim()
    const reqNumber = String(r.requisition_number || '').trim()
    const k = `${r.dispense_date}|${reqNumber}|${unit}`
    const cur = map.get(k)
    if (cur) cur.qty += q
    else map.set(k, { date: r.dispense_date, qty: q, unit, reqNumber })
  }
  return [...map.values()]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.reqNumber < b.reqNumber ? 1 : -1))
    .slice(0, limit)
}

// ตะกร้า: รายการจำนวน 0 ที่ยังไม่บอกว่าได้ไปเมื่อไร/เท่าไร → ชื่อยา (ส่งไม่ได้จนกว่าจะกรอก)
export function missingAlreadyGotDetail(cart = []) {
  return cart.filter(it => Number(it.requestedQty) === 0 && !hasAlreadyGotDetail(it.note)).map(it => it.name)
}
