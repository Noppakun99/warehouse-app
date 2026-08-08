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

  // ตัดรูปแบบวันที่ dd/mm/yyyy (หรือ dd/mm/yy, คั่นด้วย / . -) ออกก่อน — กันเลขวัน/เดือนในวันที่
  // ถูกตีเป็นระยะเวลาคืน เช่น "วันที่ 17/11/2568" ต้องไม่กลายเป็น 11 หรือ 17 เดือน
  const cleaned = raw.replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, ' ')

  // ดึงเดือน: จับเลข+หน่วยที่อยู่ในบริบท "เปลี่ยน/คืน/แลก/อายุ/แจ้ง/ก่อนหมดอายุ"
  // ครอบคลุมทั้งมีเว้นวรรค ("6 เดือน") และไม่มี ("6เดือน")
  const monthRe = /(\d+(?:\.\d+)?)\s*(เดือน|ปี|วัน)/g
  let best = null
  let m
  while ((m = monthRe.exec(cleaned)) !== null) {
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

// ────────────────────────────────────────────────────────────────────
// เฟส 2 (ADR-0014): อ่าน structured detail จากคอลัมน์ Auto-Match (col 28) ของ Excel แม่
// แทน free-text parse. detail มี 25 แบบจำกัด → จัด 6 หมวดตามฐานเวลา (คำนวณด้วย exp + receiveDate)
// ทุกหมวดไม่ต้องใช้ "วันผลิต" (คลังแปลงเป็นอิง exp ให้แล้ว)
// ────────────────────────────────────────────────────────────────────

// แปลงเลข+หน่วยในวลี → เดือน (reuse monthsFromMatch semantics)
function monthsIn(text) {
  const m = /(\d+(?:\.\d+)?)\s*(เดือน|ปี|วัน)/.exec(text || '')
  return m ? monthsFromMatch(m[1], m[2]) : null
}

// parseReturnPolicyV2(detail) → { shape, canReturn, tiers, afterExpMonths, beforeExpMonths, receiveThresholdMonths, differsByItem, needsReview, raw }
//   detail = ข้อความ structured จาก col 28 "รายละเอียดเงื่อนไข (Auto-Match)"
//   shape: 'after_exp' | 'before_exp' | 'age_tier' | 'receive_threshold' | 'binary' | 'ambiguous'
//   tiers: [{ ageMonthsMin, ageMonthsMax, percent }] สำหรับ age_tier (อายุยาเหลือ ณ วันที่คืน — 3a)
// หมวด 6 (ambiguous) → needsReview=true, ไม่คำนวณ deadline (flag ให้คนดูเอกสารเอง)
export function parseReturnPolicyV2(detail) {
  const raw = (detail || '').trim()
  const empty = { shape: 'ambiguous', canReturn: null, tiers: [], afterExpMonths: null,
    beforeExpMonths: null, receiveThresholdMonths: null, differsByItem: false, needsReview: true, raw }
  if (!raw || raw === '-') return empty

  const differsByItem = /เงื่อนไข\s*แตกต่าง|แล้วแต่รายการ|ไม่ระบุ(เงื่อนไข)?ชัดเจน/.test(raw)

  // หมวด 6 — กำกวม: "ไม่ระบุชัดเจน" → flag ไม่เดา (แม้จะมีเลขปน)
  if (/ไม่ระบุ(เงื่อนไข)?ชัดเจน/.test(raw)) {
    return { ...empty, differsByItem, needsReview: true }
  }

  // หมวด 4 — threshold อายุตอนรับ: "ยกเว้น บ.ส่งยาอายุสั้นต่ำกว่า N ปี ยินดีรับ" (Diltiazem)
  //   รับคืนเฉพาะ lot ที่ exp − receiveDate < threshold. เช็คก่อน binary เพราะมี "ไม่รับ" ปน
  const hasReceiveException = /ยกเว้น.*(อายุสั้น|อายุ\s*สั้น|ล็อต?อายุสั้น|บ\.?ส่งยาอายุสั้น)/.test(raw)
  if (hasReceiveException) {
    const th = monthsIn(raw) // "1 ปี" → 12
    return { shape: 'receive_threshold', canReturn: null, tiers: [], afterExpMonths: null,
      beforeExpMonths: null, receiveThresholdMonths: th, differsByItem, needsReview: th == null, raw }
  }

  // หมวด 3a — window tier "คืนภายใน N → 100% / คืนหลัง N → 50%": window ก่อน exp (ไม่ใช่อายุเหลือ)
  //   "ภายใน N" = ก่อน exp N เดือน ได้ % สูงสุด → map เป็น before_exp ด้วย N ของ tier 100%
  //   เช็คก่อน age_tier เพราะ "หมดอายุ" มีคำ "อายุ" ปน (false-match gate age_tier)
  if (/คืน\s*(ภายใน|ก่อน)\s*\d+\s*(เดือน|ปี)/.test(raw)) {
    const first = /คืน\s*(?:ภายใน|ก่อน)\s*(\d+)\s*(เดือน|ปี)/.exec(raw)
    const n = first ? monthsFromMatch(first[1], first[2]) : null
    if (n != null) {
      const tiers = parseTiers(raw)
      return { shape: 'before_exp', canReturn: true, tiers,
        afterExpMonths: null, beforeExpMonths: n, receiveThresholdMonths: null, differsByItem, needsReview: false, raw }
    }
  }

  // หมวด 3 — tier % ตามอายุยาเหลือ (มี "→ คืน X%" หลายบรรทัด, threshold แยกช่วง)
  //   เช่น "อายุ > 2 ปี → คืน 100% / อายุ 6 เดือน - 2 ปี → 50% / อายุ < 6 เดือน → 25%"
  //   gate ต้องเป็น "อายุ <N/>N" หรือ "แจ้งก่อน" จริง (ไม่ใช่ "หมดอายุ" ที่มีคำ "อายุ" ปน)
  //   เช็คก่อน binary เพราะบางแบบมี "ไม่รับเปลี่ยน" ปนในบรรทัดเงื่อนไข (เช่น "ไม่เต็มขวด → ไม่รับ")
  const hasAgeTierGate = /อายุ\s*(ยา)?\s*[<>≤≥]|อายุ\s*(ยา)?\s*(มากกว่า|น้อยกว่า|ต่ำกว่า)|แจ้งก่อน/.test(raw)
  if (/\d+\s*%|เปลี่ยน(ให้|ได้|เต็มจำนวน)/.test(raw) && hasAgeTierGate) {
    const tiers = parseTiers(raw)
    if (tiers.length > 0) {
      // ถ้า tier อ้าง "แจ้งก่อนหมดอายุ N" = ฐานก่อน exp; ถ้าอ้าง "อายุ > N" = อายุเหลือ
      const isBeforeExp = /แจ้งก่อน(หมดอายุ)?/.test(raw) && !/อายุ\s*[<>]/.test(raw)
      return { shape: isBeforeExp ? 'before_exp' : 'age_tier', canReturn: true, tiers,
        afterExpMonths: null, beforeExpMonths: isBeforeExp ? (tiers[0]?.ageMonthsMin ?? null) : null,
        receiveThresholdMonths: null, differsByItem, needsReview: false, raw }
    }
  }

  // หมวด 5 — binary ไม่รับคืน (หลัง tier/threshold — "ไม่รับ" ที่ยืนเดี่ยว = ไม่รับจริง)
  if (/ไม่รับ(แลก)?(เปลี่ยน|คืน)|ไม่มีนโยบาย|ขายขาด|สงวนสิทธิ์ไม่รับ/.test(raw)) {
    return { shape: 'binary', canReturn: false, tiers: [], afterExpMonths: null,
      beforeExpMonths: null, receiveThresholdMonths: null, differsByItem, needsReview: false, raw }
  }

  // หมวด 1 — หลัง exp: "คืนได้หลังหมดอายุ" / "หมดอายุไปแล้วภายใน N เดือน" / "รับเมื่อหมดอายุ ตามจำนวนจริง"
  if (/หลังจากหมดอายุ|หลังหมดอายุ|หมดอายุ(ไป)?แล้ว|เมื่อหมดอายุ|สิ้นอายุ/.test(raw)) {
    const n = monthsIn(raw) // "3 เดือน" → 3; ถ้าไม่มีเลข = คืนได้ไม่จำกัดหลัง exp
    return { shape: 'after_exp', canReturn: true, tiers: [], afterExpMonths: n,
      beforeExpMonths: null, receiveThresholdMonths: null, differsByItem, needsReview: false, raw }
  }

  // หมวด 2 — ก่อน exp: "แจ้งก่อนหมดอายุ N", "ก่อนหมดอายุ N เดือน", "อายุไม่ต่ำกว่า N",
  //   "อายุยาไม่เกิน N เดือน" (รับแลกทุกกรณี — คืนได้ถ้าแจ้งภายใน window ก่อน exp)
  if (/ก่อน(วัน)?หมดอายุ|อายุ(ยา)?(จะต้อง)?ไม่(ต่ำ|น้อย)กว่า|อายุยาไม่เกิน/.test(raw)) {
    const n = monthsIn(raw)
    if (n != null) {
      return { shape: 'before_exp', canReturn: true, tiers: [], afterExpMonths: null,
        beforeExpMonths: n, receiveThresholdMonths: null, differsByItem, needsReview: false, raw }
    }
  }

  // ไม่เข้าหมวดไหน → กำกวม (flag)
  return { ...empty, differsByItem, needsReview: true }
}

// parseTiers(raw) → [{ ageMonthsMin, ageMonthsMax, percent }] เรียงจากอายุมาก→น้อย (100% ก่อน)
//   รองรับ: "อายุ > 2 ปี → 100%", "อายุ 6 เดือน - 2 ปี → 50%", "อายุ < 6 เดือน → 25%",
//           "แจ้งก่อนหมดอายุ 1 ปี → เต็มจำนวน", "แจ้งก่อน 6 เดือน → 50%"
function parseTiers(raw) {
  const tiers = []
  for (const line of raw.split(/[\n|]/)) {
    const s = line.trim()
    if (!s) continue
    // ข้ามบรรทัดเงื่อนไข "ไม่รับ..." (เช่น "ไม่เต็มขวด → ไม่รับเปลี่ยน") — ไม่ใช่ tier คืน
    if (/ไม่รับ/.test(s)) continue
    // percent: "100%" หรือ "เต็มจำนวน"→100 หรือ "ครึ่งหนึ่ง"→50 ("ไม่เต็ม" ไม่นับ — กันจับ "ไม่เต็มขวด")
    let percent = null
    const pm = /(\d+)\s*%/.exec(s)
    if (pm) percent = parseInt(pm[1])
    else if (/เต็มจำนวน/.test(s)) percent = 100
    else if (/ครึ่งหนึ่ง|ครึ่ง/.test(s)) percent = 50
    if (percent == null) continue

    // ช่วงอายุ: "N เดือน - M ปี" | "> N ปี" | "< N เดือน" | "แจ้งก่อน N"
    let min = null, max = null
    const range = /(\d+)\s*(เดือน|ปี)\s*[-–]\s*(\d+)\s*(เดือน|ปี)/.exec(s)
    if (range) {
      min = monthsFromMatch(range[1], range[2]); max = monthsFromMatch(range[3], range[4])
    } else if (/[>≥]|มากกว่า|ไม่ต่ำกว่า|ไม่น้อยกว่า/.test(s)) {
      min = monthsIn(s); max = null
    } else if (/[<≤]|น้อยกว่า|ต่ำกว่า/.test(s)) {
      min = null; max = monthsIn(s)
    } else {
      // "แจ้งก่อนหมดอายุ 1 ปี" ไม่มีเครื่องหมาย → ถือเป็น min (แจ้งเร็ว = อายุเหลือมาก)
      min = monthsIn(s); max = null
    }
    tiers.push({ ageMonthsMin: min, ageMonthsMax: max, percent })
  }
  // เรียงอายุมาก→น้อย (100% บนสุด). ช่วง "< N" (min=null) = อายุน้อยสุด → effective min = 0 (อยู่ล่าง)
  return tiers.sort((a, b) => (b.ageMonthsMin ?? 0) - (a.ageMonthsMin ?? 0))
}

// diffDays(a, b) = จำนวนวัน a − b (ปัดเป็นวันเต็ม, ไม่สนเวลา)
function diffDays(a, b) {
  const MS = 86400000
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((da - db) / MS)
}

// ลบ N เดือนจากวันหมดอายุ → วัน deadline ที่ต้องคืนภายใน
// clamp วันสิ้นเดือน: 31/7 − 3 เดือน = 30/4 (ไม่ใช่ spillover เป็น 1/5) — conservative เตือนเร็วกว่า
// (บั๊กเดิม: setMonth spillover ทำ deadline ฝั่ง client เพี้ยน +1 วัน ไม่ตรง popup — แก้ 2026-07-18)
function subMonths(date, months) {
  const y = date.getFullYear()
  const m = date.getMonth() - months
  const lastDay = new Date(y, m + 1, 0).getDate()   // วันสุดท้ายของเดือนเป้าหมาย
  return new Date(y, m, Math.min(date.getDate(), lastDay))
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

// บวก N เดือน (clamp วันสิ้นเดือนเหมือน subMonths) — สำหรับ after_exp deadline = exp + N
function addMonths(date, months) {
  const y = date.getFullYear()
  const m = date.getMonth() + months
  const lastDay = new Date(y, m + 1, 0).getDate()
  return new Date(y, m, Math.min(date.getDate(), lastDay))
}

// computeReturnStatusV2({ policy, exp, receiveDate, today, bufferDays })
//   policy = ผลจาก parseReturnPolicyV2; คำนวณ deadline + % + สถานะ ตาม shape (ADR-0014)
//   → { status, deadline, daysToDeadline, percent, needsReview, note }
//   status: 'ok'|'due'|'overdue'|'no_policy'|'review'
//     'review'    = หมวดกำกวม/threshold ที่ข้อมูลไม่พอ → ให้คนดูเอกสารเอง (ไม่เดา)
//     'no_return' = บริษัทไม่รับคืน lot นี้ (binary หรือ receive_threshold ที่ไม่ผ่าน)
export function computeReturnStatusV2({ policy, exp, receiveDate, today, bufferDays = RETURN_ALERT_BUFFER_DAYS }) {
  const nil = { status: 'review', deadline: null, daysToDeadline: null, percent: null, needsReview: true, note: null }
  if (!policy || !(exp instanceof Date) || isNaN(exp) || !(today instanceof Date) || isNaN(today)) return nil

  switch (policy.shape) {
    case 'binary':
      return { status: 'no_return', deadline: null, daysToDeadline: null, percent: 0, needsReview: false, note: 'บริษัทไม่รับคืน' }

    case 'receive_threshold': {
      // รับคืนเฉพาะ lot ที่ส่งมาอายุสั้น < threshold (exp − receiveDate)
      // เทียบด้วย subMonths (ไม่ใช่ /30) ให้ตรงกับ deadline logic อื่น — 1 ปีพอดีไม่ถูกปัดเกิน
      if (policy.receiveThresholdMonths == null || !(receiveDate instanceof Date) || isNaN(receiveDate)) return nil
      const thresholdDate = subMonths(exp, policy.receiveThresholdMonths) // exp − N เดือน
      if (receiveDate <= thresholdDate) { // รับก่อน (exp − N) = ส่งมาอายุ ≥ N → ไม่รับคืน
        return { status: 'no_return', deadline: null, daysToDeadline: null, percent: 0, needsReview: false,
          note: `บริษัทไม่รับคืน (ส่งมาอายุ ≥ ${policy.receiveThresholdMonths} เดือน)` }
      }
      // ผ่านเงื่อนไข → คืนได้ถึง exp (ไม่มี window ระบุ — ใช้ exp เป็น deadline)
      const dl = exp
      const d = diffDays(dl, today)
      return { status: d <= 0 ? 'overdue' : d <= bufferDays ? 'due' : 'ok', deadline: dl, daysToDeadline: d,
        percent: 100, needsReview: false, note: 'รับคืน (ส่งมาอายุสั้น)' }
    }

    case 'after_exp': {
      // คืนได้หลัง exp; deadline = exp + N (ถ้าไม่มี N = ไม่จำกัด → ใช้ exp เป็นจุดเริ่มเตือน)
      const dl = policy.afterExpMonths != null ? addMonths(exp, policy.afterExpMonths) : exp
      const d = diffDays(dl, today)
      return { status: d <= 0 ? 'overdue' : d <= bufferDays ? 'due' : 'ok', deadline: dl, daysToDeadline: d,
        percent: policy.afterExpMonths != null ? null : 100, needsReview: false,
        note: policy.afterExpMonths != null ? `คืนได้ถึง ${policy.afterExpMonths} เดือนหลังหมดอายุ` : 'คืนได้หลังหมดอายุ' }
    }

    case 'before_exp': {
      const m = policy.beforeExpMonths
      if (m == null) return nil
      const dl = subMonths(exp, m)
      const d = diffDays(dl, today)
      return { status: d <= 0 ? 'overdue' : d <= bufferDays ? 'due' : 'ok', deadline: dl, daysToDeadline: d,
        percent: policy.tiers?.[0]?.percent ?? 100, needsReview: false, note: `แจ้งก่อนหมดอายุ ${m} เดือน` }
    }

    case 'age_tier': {
      // % ตามอายุยาเหลือ ณ วันนี้ (3a) — หา tier ที่ตรงกับ ageMonths ปัจจุบัน
      const ageMonths = diffDays(exp, today) / 30
      // ยาหมดอายุแล้ว (ageMonths < 0): age_tier ไม่ครอบหลัง exp → overdue ไม่รับคืน (ต่างจาก after_exp)
      if (ageMonths < 0) {
        return { status: 'overdue', deadline: tierDeadline(policy.tiers, exp), daysToDeadline: null,
          percent: null, needsReview: false, note: 'ยาหมดอายุแล้ว — พ้นสิทธิ์คืนตามอายุ' }
      }
      const tier = tierForAge(policy.tiers, ageMonths)
      // deadline = วันที่ตกลง tier ต่ำสุด (ขอบล่างของ tier ที่คืนได้ % สูงสุดถัดไป) — เตือนก่อนตก tier
      const dl = tierDeadline(policy.tiers, exp)
      const d = dl ? diffDays(dl, today) : null
      const status = d == null ? 'ok' : d <= 0 ? 'overdue' : d <= bufferDays ? 'due' : 'ok'
      return { status, deadline: dl, daysToDeadline: d, percent: tier ? tier.percent : null,
        needsReview: false, note: tier ? `คืนได้ ${tier.percent}% (อายุเหลือ ~${Math.round(ageMonths)} เดือน)` : 'อายุเหลือน้อย — ตรวจ tier' }
    }

    default: // ambiguous
      return nil
  }
}

// หา tier ที่ ageMonths อยู่ในช่วง [max...min) — tiers เรียง min มาก→น้อยแล้ว
function tierForAge(tiers, ageMonths) {
  for (const t of tiers) {
    const okMin = t.ageMonthsMin == null || ageMonths >= t.ageMonthsMin
    const okMax = t.ageMonthsMax == null || ageMonths < t.ageMonthsMax
    if (okMin && okMax) return t
  }
  return null
}

// deadline สำหรับ age_tier = วันที่ยาจะ "ตกจาก tier บนสุด" (100%) → เตือนก่อนเสีย %
//   tier บนสุด (100%) มี ageMonthsMin = ขอบล่าง → deadline = exp − ageMonthsMin
function tierDeadline(tiers, exp) {
  const top = tiers.find(t => t.percent === 100) || tiers[0]
  if (!top || top.ageMonthsMin == null) return null
  return subMonths(exp, top.ageMonthsMin)
}
