// swapPolicy.js — ตรรกะนโยบายเปลี่ยน/คืนยาก่อนพ้นเงื่อนไขบริษัท (เฟส 1)
// แยกจาก db.js เพราะเป็น pure (ไม่พึ่ง supabase) → golden-test ด้วย node ตรงๆ
// ดู docs/features/swap-return.md + แผน swap-return-plan
//
// เฟส 1: เดือน + คืนเต็ม/ไม่คืน เท่านั้น (ยังไม่ทำ tier % 100/50/25 — เก็บ raw ไว้ให้คนอ่าน)
// ผูกนโยบายระดับบริษัท (supplier). buffer เตือน default 60 วัน (จาก p90 lead time 49 วัน + เผื่อ)

export const RETURN_ALERT_BUFFER_DAYS = 60

// แปลง "N ปี/เดือน/วัน" ในข้อความ → จำนวนเดือน (number) — คืน null ถ้าไม่พบ
// "วัน" แปลงเป็นเดือนโดยหาร 30 แล้วปัดขึ้น (เช่น 60 วัน → 2 เดือน) — บางบริษัทระบุเป็นวัน
function monthsFromMatch(numStr, unit) {
  const n = parseFloat(numStr)
  if (isNaN(n) || n <= 0) return null
  if (unit === 'ปี') return Math.round(n * 12)
  if (unit === 'วัน') return Math.max(1, Math.ceil(n / 30))
  return Math.round(n)
}

// parseReturnPolicy(text) → { canReturn, months, differsByItem }
//   canReturn: true = คืนได้ (มีเดือน) | false = บริษัทไม่รับคืน | null = ไม่รู้/ต้องเช็กเอกสาร
//   months:    จำนวนเดือน "ก่อนหมดอายุ" ที่ต้องคืนภายใน (number) หรือ null
//   differsByItem: true = flag "เงื่อนไขแตกต่างกัน แล้วแต่รายการ" → ผูกระดับบริษัทไม่ได้
//
// หลักความปลอดภัย (conservative): ถ้าดึงเดือนได้ → canReturn=true เสมอ
// (แม้ข้อความมีคำ "ไม่รับ" ปนในเงื่อนไขยกเว้น) — ยอมเตือนเกินดีกว่าบอกผิดว่าคืนไม่ได้
export function parseReturnPolicy(text) {
  const raw = (text || '').trim()
  if (!raw || raw === '-') return { canReturn: null, months: null, differsByItem: false }

  const differsByItem = /เงื่อนไข\s*แตกต่าง|แล้วแต่รายการ/.test(raw)

  // ดึงเดือน: จับเลข+หน่วยที่อยู่ในบริบท "เปลี่ยน/คืน/แลก/อายุ/แจ้ง/ก่อนหมดอายุ"
  // ครอบคลุมทั้งมีเว้นวรรค ("6 เดือน") และไม่มี ("6เดือน")
  const monthRe = /(\d+(?:\.\d+)?)\s*(เดือน|ปี|วัน)/g
  let best = null
  let m
  while ((m = monthRe.exec(raw)) !== null) {
    const val = monthsFromMatch(m[1], m[2])
    if (val == null) continue
    // เลือกเดือนที่ "น้อยที่สุด" ที่เกี่ยวกับ window การคืน (tier คืนเต็มมักเป็นค่าที่เข้มสุด)
    // เฟส 1 ใช้ค่าเดียว — ค่าที่น้อยสุดคือ deadline ที่ปลอดภัยสุด (เตือนเร็วสุด)
    if (best == null || val < best) best = val
  }

  if (best != null) return { canReturn: true, months: best, differsByItem }

  // ไม่มีเดือน → เช็คว่าเป็น "ไม่รับคืน" ชัดเจนไหม
  const noReturn = /ไม่รับ(แลก)?(เปลี่ยน|คืน)|ไม่มีนโยบาย(การ)?แลกเปลี่ยน|สงวนสิทธิ์ไม่รับ/.test(raw)
  if (noReturn) return { canReturn: false, months: null, differsByItem }

  return { canReturn: null, months: null, differsByItem }
}

// diffDays(a, b) = จำนวนวัน a − b (ปัดเป็นวันเต็ม, ไม่สนเวลา)
function diffDays(a, b) {
  const MS = 86400000
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((da - db) / MS)
}

// ลบ N เดือนจากวันหมดอายุ → วัน deadline ที่ต้องคืนภายใน
function subMonths(date, months) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setMonth(d.getMonth() - months)
  return d
}

// computeReturnStatus({ exp, months, today, bufferDays })
//   → { status, deadline, daysToDeadline }
//   status: 'ok'         = ยังไม่ถึง window เตือน (เหลือเวลา > buffer)
//           'due'        = ถึง window แล้ว (0 < เหลือ ≤ buffer) → เด้ง popup
//           'overdue'    = พ้น deadline คืนแล้ว (เหลือ ≤ 0)
//           'no_policy'  = ไม่มีเดือน (คืนไม่ได้/ไม่รู้) → ไม่เด้ง
// exp = Date (วันหมดอายุ), months = number|null, today = Date
export function computeReturnStatus({ exp, months, today, bufferDays = RETURN_ALERT_BUFFER_DAYS }) {
  if (months == null || !(exp instanceof Date) || isNaN(exp) || !(today instanceof Date) || isNaN(today)) {
    return { status: 'no_policy', deadline: null, daysToDeadline: null }
  }
  const deadline = subMonths(exp, months)
  const daysToDeadline = diffDays(deadline, today)
  let status
  if (daysToDeadline <= 0) status = 'overdue'
  else if (daysToDeadline <= bufferDays) status = 'due'
  else status = 'ok'
  return { status, deadline, daysToDeadline }
}
