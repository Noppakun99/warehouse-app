// workQueue.js — คิวงานวันนี้ (CONTEXT.md §คิวงานวันนี้) + บรรทัดรอบเบิก-รับถัดไป
// pure module (ไม่ import supabase) → golden test: npm run test:workqueue
//
// รับข้อมูลที่ fetch มาแล้ว (fetchDashboardAlerts / fetchSwapReturnDue / fetchDrugLoans /
// fetchOpenAnnualCount / fetchLatestLineQuotaAlerts) แล้วคืนรายการคิว — แต่ละรายการถือ rows ชุดที่นับ
// ไว้ด้วย ให้โมดอลรายการแสดง array เดียวกับตัวเลข (Rule #6: ตัวเลขในคิว = จำนวนแถวที่กดไปเห็น)

export const QUEUE_THRESHOLDS = {
  pendingReceiveDays: 14,   // lot รอตรวจรับเกินกี่วันถึงเข้าคิว
  nearExpiryDays: 90,       // ใกล้หมดอายุภายในกี่วัน
  loanOverdueDays: 90,      // ของยืมค้างคืนเกินกี่วัน (ตรงเกณฑ์แดงของหน้า ยืม-คืนยา)
  swapRedDays: 30,          // เหลือกี่วันถึงเส้นตายคืนบริษัทถึงเป็นสีแดง (ช่วงเตือนทั้งหมด = 60 วันจาก swapPolicy)
}

// สถานะดำเนินการคืนบริษัทที่ถือว่า "จัดการแล้ว" — ไม่ใช่งานค้าง (SWAP_ACTION_STATUS ใน db.js)
export const SWAP_ACTION_DONE = new Set(['sent', 'accepted', 'no_return'])

export const isSwapOpen = (r) => !SWAP_ACTION_DONE.has(r?.actionStatus || 'pending')

// lot คืนบริษัทที่ "ใกล้มาก" = ยังค้าง + ไม่ได้คาดว่าจะหมดเอง + เหลือ ≤ 30 วัน (รวมที่เลยเส้นตายแล้ว)
export const isSwapRed = (r) =>
  isSwapOpen(r) && !r?.willDeplete && r?.daysToDeadline != null && r.daysToDeadline <= QUEUE_THRESHOLDS.swapRedDays

/**
 * @param {object} p
 * @param {Array} p.expiring        alerts.expiring (มี daysLeft; ตัด qty=0 และยาตัดออกมาแล้ว)
 * @param {Array} p.lowStock        alerts.lowStock (qty รวมต่อรหัส, safety_stock)
 * @param {Array} p.pendingReceive  alerts.pendingReceive (waitDays)
 * @param {Array} p.swapDue         fetchSwapReturnDue()
 * @param {Array} p.loans           drug_loan rows พร้อม overdueDays (loanOverdueDays) — คำนวณโดยผู้เรียก
 * @param {{session, items}|null} p.annual  fetchOpenAnnualCount()
 * @param {Array} p.quota           fetchLatestLineQuotaAlerts() — แสดงเฉพาะ admin
 * @param {string} p.role
 * @returns {Array<{key, label, count, severity: 'red'|'amber'|'slate', note, rows, progress?}>}
 */
export function buildWorkQueue({
  expiring = [], lowStock = [], pendingReceive = [], swapDue = [], loans = [],
  annual = null, quota = [], role = 'staff',
} = {}) {
  const T = QUEUE_THRESHOLDS
  const items = []
  const push = (it) => { if (it.count > 0) items.push(it) }   // รายการที่เป็น 0 ไม่แสดง

  const expired = expiring.filter(r => r.daysLeft < 0)
  push({
    key: 'expired', label: 'ยาหมดอายุค้างชั้น', count: expired.length, severity: 'red',
    note: 'เก็บออกจากชั้น แล้วแก้ยอดใน Excel', rows: expired,
  })

  const swapOpen = swapDue.filter(isSwapOpen)
  const swapRed = swapOpen.filter(isSwapRed)
  const swapNeed = swapOpen.filter(r => !r.willDeplete)
  // แดงแยก 2 ความหมาย: เลยเส้นตายแล้ว (ถามบริษัทว่ายังรับไหม ไม่รับ = บันทึก "ไม่คืน") vs ยังทันอยู่
  // ข้อมูลจริง 10/10/2569: แดง 13 lot ส่วนใหญ่เลยมาแล้วหลายร้อยวัน — รวมเป็น "ใกล้เส้นตาย" ชวนเข้าใจผิด
  const swapOverdue = swapRed.filter(r => r.daysToDeadline < 0).length
  const swapSoon = swapRed.length - swapOverdue
  push({
    key: 'swap', label: 'ยาต้องคืนบริษัท', count: swapOpen.length,
    severity: swapRed.length > 0 ? 'red' : 'amber',
    note: swapRed.length > 0
      ? [swapOverdue && `เลยเส้นตายแล้ว ${swapOverdue} lot`, swapSoon && `ใกล้เส้นตาย ≤${T.swapRedDays} วัน ${swapSoon} lot`].filter(Boolean).join(' · ')
      : swapNeed.length < swapOpen.length ? `ควรคืนจริง ${swapNeed.length} lot` : `ภายใน 60 วันก่อนเส้นตาย`,
    rows: swapOpen,
  })

  const outOfStock = lowStock.filter(r => (Number(r.qty) || 0) <= 0 && (Number(r.safety_stock) || 0) > 0)
  push({
    key: 'outOfStock', label: 'ยาหมดสต็อก', count: outOfStock.length, severity: 'red',
    note: 'คงเหลือ 0 และมี Safety Stock', rows: outOfStock,
  })

  const longPending = pendingReceive.filter(r => r.waitDays != null && r.waitDays > T.pendingReceiveDays)
  push({
    key: 'pendingReceive', label: `lot รอตรวจรับเกิน ${T.pendingReceiveDays} วัน`, count: longPending.length,
    severity: 'amber', note: 'ของมาถึงแล้วแต่ยังไม่ผ่านตรวจรับ', rows: longPending,
  })

  const nearExpiry = expiring.filter(r => r.daysLeft >= 0 && r.daysLeft <= T.nearExpiryDays)
  push({
    key: 'nearExpiry', label: `ยาใกล้หมดอายุ ≤${T.nearExpiryDays} วัน`, count: nearExpiry.length,
    severity: 'amber', note: 'ใช้ก่อน หรือแลก/คืนถ้ายังทัน', rows: nearExpiry,
  })

  const loanOverdue = loans.filter(r => !r.return_date && r.overdueDays != null && r.overdueDays > T.loanOverdueDays)
  push({
    key: 'loanOverdue', label: `ของยืมค้างคืนเกิน ${T.loanOverdueDays} วัน`, count: loanOverdue.length,
    severity: 'amber', note: 'ตามคืน หรือปิดรายการที่ส่งต่อแล้ว', rows: loanOverdue,
  })

  if (annual?.session) {
    const total = (annual.items || []).length
    const counted = (annual.items || []).filter(i => i.counted_qty != null).length
    const remaining = total - counted
    push({
      key: 'annualCount', label: 'รอบตรวจนับประจำปียังเปิดอยู่', count: Math.max(remaining, 0),
      severity: 'slate', note: `นับแล้ว ${counted.toLocaleString()} / ${total.toLocaleString()} บรรทัด`,
      rows: [], progress: { counted, total },
    })
  }

  if (role === 'admin') {
    push({
      key: 'lineQuota', label: 'โควตาแจ้งเตือน LINE ใกล้หมด', count: quota.length,
      severity: 'amber', note: 'บอทอาจส่งข้อความไม่ได้ในเดือนนี้', rows: quota,
    })
  }

  return items
}

// ── บรรทัดรอบเบิก-รับถัดไป ──────────────────────────────────────────────
const WEEKDAY_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const MONTH_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

// 'YYYY-MM-DD' → 'จ. 12 ต.ค.' (คำนวณจาก UTC parts — ymd ไม่มีเวลา ไม่ขึ้นกับ timezone เครื่อง)
export function thaiDayShort(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  if (!y || !m || !d) return String(ymd || '')
  const dt = new Date(Date.UTC(y, m - 1, d))
  return `${WEEKDAY_TH[dt.getUTCDay()]} ${d} ${MONTH_TH[m - 1]}`
}

const addDaysYmd = (ymd, n) => {
  const [y, m, d] = String(ymd).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/**
 * รอบเบิก-รับถัดไป (วันส่งใบเบิกที่ยังไม่ผ่าน) จาก cycles ของ resolveCycles (announceSchedule.js)
 * @param {string} today 'YYYY-MM-DD'
 * @param {Array<{nominal, requisitionDate, pickupDate}>} cycles
 * @param {Map|Object} holidays ymd → ชื่อวันหยุด
 * @returns {{requisition, pickup, shiftNote}|null}
 */
export function describeNextCycle(today, cycles = [], holidays = new Map()) {
  const next = [...cycles]
    .filter(c => c?.requisitionDate && c?.pickupDate && c.requisitionDate >= today)
    .sort((a, b) => a.requisitionDate.localeCompare(b.requisitionDate))[0]
  if (!next) return null
  const nameOf = (ymd) => (holidays instanceof Map ? holidays.get(ymd) : holidays?.[ymd]) || ''
  const notes = []
  if (next.nominal && next.nominal !== next.requisitionDate) {
    const why = nameOf(next.nominal)
    notes.push(`ส่งใบเบิกเลื่อนจาก ${thaiDayShort(next.nominal)}${why ? ` (${why})` : ''}`)
  }
  // วันรับปกติ = วันธรรมดาถัดจากวันเบิก (ข้ามเสาร์-อาทิตย์) — ต่างจากนี้แปลว่าเจอวันหยุด
  let usualPickup = addDaysYmd(next.requisitionDate, 1)
  while ([0, 6].includes(new Date(`${usualPickup}T00:00:00Z`).getUTCDay())) usualPickup = addDaysYmd(usualPickup, 1)
  if (next.pickupDate !== usualPickup) {
    const why = nameOf(usualPickup)
    notes.push(`รับยาเลื่อนจาก ${thaiDayShort(usualPickup)}${why ? ` (${why})` : ''}`)
  }
  return {
    requisition: thaiDayShort(next.requisitionDate),
    pickup: thaiDayShort(next.pickupDate),
    shiftNote: notes.join(' · '),
  }
}
