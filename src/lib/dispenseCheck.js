// dispenseCheck.js — ตรวจใบเบิกต่อรหัสก่อนจ่าย: จ่ายแล้วคงเหลือพอให้ทั้ง รพ. ใช้ถึง Lead Time ไหม (pure · golden test)
// port เกณฑ์จาก .claude/skills/dispense-entry/scripts/rate_check.py (ตัวที่ Claude ใช้ก่อนลงชีท) ลำดับเดียวกัน
// ต่างจาก rate_check: เรท = กฎแอป (4 เดือนที่ปิดงวด · CONTEXT §เรท) ไม่ใช่ชีทวิเคราะห์ 3 เดือน · LT = เฉลี่ยจากบิลซื้อ (ADR-0001)
// ทุกยอดเป็นหน่วยย่อยสุด (base) เหมือน requestedQty / availableBase ของใบเบิก
// ยอดแนะนำแบ่งจ่าย = จ่ายได้เท่าที่หลังจ่ายยังเหลือ Avg/วัน × LT (user ตัดสิน 24/11/2569: เตือนผู้เบิก แต่ส่งเต็มจำนวนได้ คลังตัดสินอีกที)

import { computeStats, DEFAULT_LEAD_TIME } from './reorder.js'
import { isPurchaseReceipt } from './drugProfile.js'

export const VERDICT = {
  SHORT: 'short',                       // ของไม่พอจ่าย
  EXPIRY_OK: 'expiry_ok',               // ใช้ไม่ทันก่อน exp lot แรก → จ่ายตามขอ ไม่ต้องกั๊ก
  LARGE: 'large',                       // ใบเดียวกินของมาก
  BELOW_LT: 'below_lt',                 // หลังจ่ายพอใช้ไม่ถึง LT + ไม่มีของกำลังมา
  BELOW_LT_INCOMING: 'below_lt_incoming', // ไม่ถึง LT แต่มีรอตรวจรับ/แจ้งซื้อแล้ว → จ่ายตามขอได้
  NO_RATE: 'no_rate',                   // ไม่มีเรทในช่วง → ตรวจเรื่อง LT ไม่ได้
  OK: 'ok',
}

const LEVEL_OF = {
  short: 'stop', large: 'stop', below_lt: 'stop',
  below_lt_incoming: 'warn', no_rate: 'info', expiry_ok: 'ok', ok: 'ok',
}

const DAY_MS = 86400000

// leadtime ต่อบิล: กฎเดียวกับ fetchLatestReceiptInfo (db.js) — ว่าง/'-'/นอก 0–90 = ไม่นับ (Excel AVERAGEIFS 0–90)
export function parseLeadTime(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (!s || s === '-') return null
  const n = parseFloat(s.replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 && n <= 90 ? n : null
}

// LT ของรหัส = เฉลี่ย leadtime บิลการซื้อ · ไม่มีข้อมูล = DEFAULT_LEAD_TIME (20 = ค่าตั้งต้นของ Excel)
export function leadTimeFromReceipts(rows = []) {
  let sum = 0, n = 0
  for (const r of rows) {
    if (!isPurchaseReceipt(r)) continue
    const lt = parseLeadTime(r.leadtime)
    if (lt != null) { sum += lt; n += 1 }
  }
  return n ? { days: Math.round((sum / n) * 10) / 10, fromBills: n } : { days: DEFAULT_LEAD_TIME, fromBills: 0 }
}

// เรทหน่วยย่อยสุด จาก { 'YYYY-MM': base } (usageMonthsBase) · เดือนไม่มีเบิก = 0 นับเป็นตัวหาร (กฎ usageRate)
export function rateFromMonths(monthsBase = {}, months = []) {
  if (!months.length) return { avgMonth: 0, avgDay: 0 }
  const { avgMonth, avgDay } = computeStats(months.map(ym => monthsBase[ym] || 0))
  return { avgMonth, avgDay }
}

/**
 * @param qty        ยอดขอรวมของรหัสนี้ในใบ (base)
 * @param avail      จ่ายได้ (ไม่รวมรอตรวจรับ · ไม่รวม lot หมดอายุ · หักยอดจองใบอื่นแล้ว) (base)
 * @param pending    ยอดรอตรวจรับ (base)
 * @param notifiedOn วันที่แจ้งซื้อที่ยังรอของ (ISO) | null
 * @param lots       lot ที่จ่ายได้ [{ exp: Date|null }] — หา exp lot แรก
 */
export function checkDispenseLine({
  qty = 0, avail = 0, pending = 0, notifiedOn = null,
  avgDay = 0, avgMonth = 0, leadTime = DEFAULT_LEAD_TIME, lots = [], today = new Date(),
} = {}) {
  const after = avail - qty
  const hasRate = avgDay > 0
  const coverDays = hasRate ? Math.floor(Math.max(0, after) / avgDay) : null
  const share = avgMonth > 0 ? qty / avgMonth : null
  const incoming = pending > 0 || !!notifiedOn
  const need = hasRate ? avgDay * leadTime : 0           // ต้องเหลือไว้ให้ทั้ง รพ. ระหว่างรอของ
  const suggestQty = hasRate ? Math.max(0, Math.floor(avail - need)) : null
  const t0 = new Date(today); t0.setHours(0, 0, 0, 0)
  const firstExp = lots.map(l => l?.exp).filter(d => d instanceof Date && !Number.isNaN(+d)).sort((a, b) => a - b)[0] || null
  const daysToFirstExp = firstExp ? Math.floor((firstExp - t0) / DAY_MS) : null
  const belowLt = hasRate && after < need

  let verdict
  if (after < 0) verdict = VERDICT.SHORT
  else if (daysToFirstExp != null && coverDays != null && coverDays > daysToFirstExp) verdict = VERDICT.EXPIRY_OK
  else if ((share != null && share >= 1) || (avail > 0 && qty >= avail * 0.5)) verdict = VERDICT.LARGE
  else if (!hasRate) verdict = VERDICT.NO_RATE
  else if (belowLt && !incoming) verdict = VERDICT.BELOW_LT
  else if (belowLt) verdict = VERDICT.BELOW_LT_INCOMING
  else verdict = VERDICT.OK

  // ผู้เบิกเห็นเฉพาะ "คลังอาจแบ่งจ่าย" — ไม่ถึง LT + ไม่มีของกำลังมา (ขอเกินคงเหลือก็เตือน: คลังอาจจ่ายไม่ถึงที่มี)
  // ไม่เตือนเมื่อของจะหมดอายุก่อนใช้หมดอยู่แล้ว (จ่ายตามขอดีกว่ากั๊ก)
  const requesterWarn = belowLt && !incoming && verdict !== VERDICT.EXPIRY_OK

  return {
    verdict, level: LEVEL_OF[verdict], after, coverDays, share, suggestQty, incoming,
    belowLt, requesterWarn, daysToFirstExp, leadTime, avgDay, avgMonth,
  }
}

const n0 = (x) => Math.round(x).toLocaleString()

// ข้อความใต้รายการในตะกร้าผู้เบิก ('' = ไม่ต้องเตือน)
export function requesterNoteText(res, unit = '') {
  if (!res?.requesterWarn) return ''
  const u = unit ? ` ${unit}` : ''
  const lt = n0(res.leadTime)
  const head = res.suggestQty > 0
    ? `คลังอาจแบ่งจ่าย แนะนำไม่เกิน ${n0(res.suggestQty)}${u}`
    : 'คงเหลือในคลังน้อยกว่ายอดที่ทั้ง รพ. ใช้ระหว่างรอของรอบใหม่ — คลังอาจแบ่งจ่าย'
  return `${head} เพื่อให้คงเหลือพอใช้ทั้ง รพ. อีก ${lt} วันจนของรอบใหม่มา · ส่งเต็มจำนวนได้ คลังจะพิจารณาอีกครั้ง`
}

// ข้อความสั้นหน้าคลัง (บรรทัดเดียว) — รายละเอียดตัวเลขให้คลังตัดสิน
export function staffNoteText(res, unit = '') {
  if (!res) return ''
  const u = unit ? ` ${unit}` : ''
  const nums = res.avgDay > 0
    ? `หลังจ่ายพอใช้ ${res.coverDays.toLocaleString()} วัน · LT ${n0(res.leadTime)} วัน · เรท ${n0(res.avgMonth)}${u}/เดือน`
    : 'ไม่มีเรทเบิก 4 เดือนล่าสุด'
  const sug = res.belowLt && res.suggestQty != null ? ` · แนะนำจ่าย ≤ ${n0(res.suggestQty)}${u}` : ''
  const head = {
    short: 'ของไม่พอจ่าย',
    expiry_ok: 'ใช้ไม่ทันก่อนหมดอายุ จ่ายตามขอได้',
    large: `ใบเดียวกินของมาก${res.share != null ? ` (${res.share.toFixed(1)} เดือนของเรท)` : ''}`,
    below_lt: 'หลังจ่ายพอใช้ไม่ถึง Lead Time · ไม่มีรอตรวจรับ/แจ้งซื้อ',
    below_lt_incoming: 'ไม่ถึง Lead Time แต่มีของกำลังมา จ่ายตามขอได้',
    no_rate: 'ตรวจเรทไม่ได้',
    ok: 'พอ',
  }[res.verdict]
  return `${head} — ${nums}${sug}`
}
