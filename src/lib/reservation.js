// ยอดจองของใบเบิกออนไลน์ = ตัดยอดชั่วคราว (CONTEXT §ตัดยอดชั่วคราว · ตกลง 12/11/2569)
// pure module: ไม่ import supabase → golden-testable (npm run test:reservation)
//
// กฎเลิกหักเดียวทุกใบ: หักจนกว่า (1) ลงชีทเบิกแล้ว (sheet_entered_at) และ (2) มีการนำเข้ายอดคลังหลังลงชีท
// ไม่ขึ้นกับสถานะใบหรือเวลาจ่าย — กฎเดิม "นำเข้าหลังเวลาจ่าย" ผิด 2 ทาง:
//   นำเข้าเพื่อลงบิลก่อนลงใบจ่ายก่อนลงชีท = เลิกหักทั้งที่ยอดตัวจริงยังไม่ลด (คงเหลือเกินจริง)
//   ใบที่ลงชีทก่อนจัดแล้วนำเข้า = ยอดตัวจริงลดแล้วแต่ยังหักตามสถานะ (หักซ้ำ)

// partial = อนุมัติบางรายการ ยังรอจัดเหมือน approved (กฎเดิมตกสถานะนี้ → ใบอนุมัติบางส่วนไม่หักยอด)
export const RESERVING_STATUSES = ['pending', 'approved', 'partial', 'picking', 'ready', 'dispensed', 'received']

const NOT_PICKED = new Set(['pending', 'approved', 'partial'])

const lotKey = (lot) => String(lot ?? '').trim()

export function isReservationActive({ status, sheetEnteredAt } = {}, lastImportAt = null) {
  if (!RESERVING_STATUSES.includes(status)) return false
  if (!sheetEnteredAt || !lastImportAt) return true
  return !(new Date(lastImportAt) > new Date(sheetEnteredAt))
}

// ของที่รายการหนึ่งถือไว้ (หน่วยย่อยสุด) — lot = null คือยังไม่จัด หักตามลำดับจ่าย
export function itemHolds(item = {}, status) {
  if (!NOT_PICKED.has(status) && Array.isArray(item.picked_allocation) && item.picked_allocation.length) {
    return item.picked_allocation
      .map(a => ({ lot: lotKey(a.lot), base: Number(a.base) || 0 }))
      .filter(h => h.base > 0)
  }
  const qty = NOT_PICKED.has(status)
    ? Number(item.approved_qty ?? item.requested_qty) || 0
    : Number(item.picked_qty ?? item.approved_qty ?? item.requested_qty) || 0
  return qty > 0 ? [{ lot: null, base: qty }] : []
}

// rows = requisition_items + { status, sheet_entered_at } ของหัวใบ
// คืน { [codeKey]: { total, byLot: { [lot]: base }, unassigned } }
export function summarizeHolds(rows = [], { keyOf = (c) => c, lastImportAt = null, excludeReqId = null } = {}) {
  const out = {}
  for (const r of rows) {
    if (!r.drug_code) continue
    if (excludeReqId != null && r.requisition_id === excludeReqId) continue
    if (!isReservationActive({ status: r.status, sheetEnteredAt: r.sheet_entered_at }, lastImportAt)) continue
    const k = keyOf(r.drug_code)
    if (!k) continue
    for (const h of itemHolds(r, r.status)) {
      const s = out[k] || (out[k] = { total: 0, byLot: {}, unassigned: 0 })
      s.total += h.base
      if (h.lot == null) s.unassigned += h.base
      else s.byLot[h.lot] = (s.byLot[h.lot] || 0) + h.base
    }
  }
  return out
}

// หักยอดออกจาก lot ที่เรียงลำดับจ่ายแล้ว (lots = [{ lot, base, packSize, ... }])
// lot ที่ใบอื่นหยิบไปแล้วหักตรง lot นั้น — คนจัดใบถัดไปต้องไม่ถูกส่งไปหยิบ lot ที่หมดแล้ว
// fefoRemainder = true (หน้าค้นหาผู้เบิก): ส่วนที่ยังไม่จัด + lot ที่หาไม่เจอ หักตามลำดับจ่าย ให้ยอดรวมตรงยอดจอง
// fefoRemainder = false (หน้าจัดยา): หักเฉพาะ lot ที่ถูกหยิบไปจริง — ใบที่ยังไม่จัดไม่ได้เอาของออกจากชั้น
// คืน { lots: lot ที่เหลือของ (packs คำนวณใหม่), held: ยอดที่หักออกได้จริง }
export function applyHolds(lots = [], hold = null, { fefoRemainder = true } = {}) {
  const remaining = lots.map(l => ({ ...l }))
  let held = 0
  let carry = fefoRemainder ? (Number(hold?.unassigned) || 0) : 0
  for (const [lot, base] of Object.entries(hold?.byLot || {})) {
    let left = Number(base) || 0
    for (const l of remaining) {
      if (left <= 0) break
      if (lotKey(l.lot) !== lot || l.base <= 0) continue
      const take = Math.min(left, l.base)
      l.base -= take; left -= take; held += take
    }
    if (fefoRemainder) carry += left
  }
  for (const l of remaining) {
    if (carry <= 0) break
    if (l.base <= 0) continue
    const take = Math.min(carry, l.base)
    l.base -= take; carry -= take; held += take
  }
  return {
    lots: remaining.filter(l => l.base > 0).map(l => ({ ...l, packs: l.packSize ? l.base / l.packSize : l.base })),
    held,
  }
}
