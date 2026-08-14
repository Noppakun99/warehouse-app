// announceSchedule.js — logic ปฏิทินรอบเบิก-รับ (pure, ไม่มี dependency)
//
// วางไว้ที่ supabase/functions/_shared/ โดยเจตนา: Deno (edge function) import .js ได้
// และ node (golden test) ก็ import ได้เพราะ package.json เป็น type: module
// → แหล่งความจริงเดียว ไม่ต้อง copy logic ไป TS แล้วมา sync กันภายหลัง
// (บทเรียนจาก Critical Rule #11 ที่ swapPolicy ต้อง sync 4 ที่ทุกครั้งที่แก้)
//
// ศัพท์ทั้งหมดนิยามไว้ใน CONTEXT.md §"รอบเบิก-รับ (Requisition–Pickup Cycle)"

/** วันในสัปดาห์ที่ส่งใบเบิกได้ — 1=จันทร์, 3=พุธ */
export const REQUISITION_WEEKDAYS = [1, 3]

/** ปิดติดกันกี่วันถึงนับเป็น "หยุดยาว" — นับเสาร์-อาทิตย์รวมด้วย */
export const LONG_HOLIDAY_MIN_DAYS = 4

const DAY_MS = 86400000

// ---------- date helpers (UTC ล้วน กัน off-by-one วันบน UTC+7) ----------

/** 'YYYY-MM-DD' → Date (UTC midnight) */
export function parseYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Date → 'YYYY-MM-DD' (อ่านจาก UTC parts ไม่ใช้ toISOString slice) */
export function toYmd(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(ymd, n) {
  return toYmd(new Date(parseYmd(ymd).getTime() + n * DAY_MS))
}

/** 0=อาทิตย์ … 6=เสาร์ */
export function weekday(ymd) {
  return parseYmd(ymd).getUTCDay()
}

/** วันจันทร์ของสัปดาห์ที่ ymd อยู่ (อาทิตย์นับเป็นท้ายสัปดาห์ก่อน) */
export function mondayOf(ymd) {
  const wd = weekday(ymd)
  const back = wd === 0 ? 6 : wd - 1
  return addDays(ymd, -back)
}

// ---------- วันทำการ ----------

/** holidays: Map|Object ymd → ชื่อวันหยุด (หรือ Set ของ ymd) */
function holidayName(holidays, ymd) {
  if (!holidays) return null
  if (holidays instanceof Map) return holidays.get(ymd) ?? null
  if (holidays instanceof Set) return holidays.has(ymd) ? '' : null
  return Object.prototype.hasOwnProperty.call(holidays, ymd) ? holidays[ymd] : null
}

/** คลังปิด = เสาร์/อาทิตย์ หรือวันหยุดราชการ */
export function isClosed(ymd, holidays) {
  const wd = weekday(ymd)
  if (wd === 0 || wd === 6) return true
  return holidayName(holidays, ymd) !== null
}

export function isWorkingDay(ymd, holidays) {
  return !isClosed(ymd, holidays)
}

/** วันทำการถัดไป (ไม่รวมตัวมันเอง) — scan สูงสุด 60 วันกัน loop ไม่จบ */
export function nextWorkingDay(ymd, holidays) {
  let cur = addDays(ymd, 1)
  for (let i = 0; i < 60; i++) {
    if (isWorkingDay(cur, holidays)) return cur
    cur = addDays(cur, 1)
  }
  return null
}

/** วันทำการวันนี้หรือถัดไป (รวมตัวมันเอง) */
export function thisOrNextWorkingDay(ymd, holidays) {
  return isWorkingDay(ymd, holidays) ? ymd : nextWorkingDay(ymd, holidays)
}

/**
 * ความยาวของช่วงที่คลังปิดติดกัน โดยเริ่มนับที่ ymd
 * ถ้า ymd เป็นวันทำการ → 0
 */
export function closedRunLength(ymd, holidays) {
  if (isWorkingDay(ymd, holidays)) return 0
  let n = 0
  let cur = ymd
  while (isClosed(cur, holidays) && n < 60) {
    n++
    cur = addDays(cur, 1)
  }
  return n
}

/** รายละเอียดช่วงปิดที่เริ่มต้นที่ ymd — null ถ้า ymd เปิดทำการ */
export function closedRun(ymd, holidays) {
  const days = closedRunLength(ymd, holidays)
  if (days === 0) return null
  return { days, from: ymd, to: addDays(ymd, days - 1), resumeDate: addDays(ymd, days) }
}

/**
 * ช่วงปิดก้อนแรกที่เจอในช่วง (after, before) — ไม่รวมปลายทั้งสองข้าง
 *
 * ทำไมต้องสแกน ไม่ใช่ดูแค่วันถัดจาก after:
 *   สงกรานต์ 2569 หยุด จ13-พฤ16 แต่ **ศุกร์ 10 เป็นวันทำการ** คั่นอยู่
 *   ถ้าดูแค่วันถัดจากวันรับ (10 เม.ย.) จะเห็นว่าเปิด แล้วสรุปว่าไม่มีหยุดยาว = พลาด
 */
export function nextClosedRunBetween(after, before, holidays) {
  let cur = addDays(after, 1)
  while (cur < before) {
    if (isClosed(cur, holidays)) return closedRun(cur, holidays)
    cur = addDays(cur, 1)
  }
  return null
}

// ---------- รอบเบิก-รับ ----------

/**
 * รอบทั้งหมดของสัปดาห์ที่มี ymd อยู่ (ยังไม่ dedup)
 * แต่ละรอบ: { nominal, requisitionDate, pickupDate }
 *   nominal = วันตามปฏิทินตายตัว (จ/พ)
 *   requisitionDate = nominal ถ้าเปิด, ไม่งั้นเลื่อนไปวันทำการถัดไป
 *   pickupDate = วันทำการถัดไปจาก requisitionDate
 */
function cyclesOfWeek(ymd, holidays) {
  const mon = mondayOf(ymd)
  return REQUISITION_WEEKDAYS.map(wd => {
    const nominal = addDays(mon, wd - 1)
    const requisitionDate = thisOrNextWorkingDay(nominal, holidays)
    return {
      nominal,
      requisitionDate,
      pickupDate: requisitionDate ? nextWorkingDay(requisitionDate, holidays) : null,
    }
  })
}

/**
 * รอบที่ "ตกลงมาอยู่" วันเดียวกัน = ยุบเหลือรอบเดียว (CONTEXT: การเลื่อนรอบ)
 * มองข้ามสัปดาห์ด้วย เพราะรอบวันพุธที่เจอหยุดยาวอาจเลื่อนข้ามไปสัปดาห์หน้า
 */
export function resolveCycles(ymd, holidays) {
  const all = [
    ...cyclesOfWeek(addDays(ymd, -7), holidays),
    ...cyclesOfWeek(ymd, holidays),
    ...cyclesOfWeek(addDays(ymd, 7), holidays),
  ].filter(c => c.requisitionDate && c.pickupDate)

  const byDate = new Map()
  for (const c of all) {
    const prev = byDate.get(c.requisitionDate)
    if (prev) {
      // ยุบ: เก็บ nominal ทุกตัวที่มารวมกันไว้เป็นหลักฐาน
      prev.mergedFrom.push(c.nominal)
      prev.mergedFrom.sort()
    } else {
      byDate.set(c.requisitionDate, { ...c, mergedFrom: [c.nominal] })
    }
  }
  return [...byDate.values()].sort((a, b) => a.requisitionDate.localeCompare(b.requisitionDate))
}

/**
 * วันนี้ต้องประกาศไหม และประกาศว่าอะไร
 *
 * @param {string} today 'YYYY-MM-DD'
 * @param {Map|Object|Set} holidays ymd → ชื่อวันหยุด
 * @returns {{
 *   send: boolean,
 *   requisitionDate: string|null,
 *   pickupDate: string|null,
 *   shiftedFrom: { date: string, holidayName: string|null }|null,
 *   mergedFrom: string[],
 *   clearance: { days: number, from: string, to: string, resumeDate: string }|null,
 * }}
 */
export function announcementFor(today, holidays) {
  const empty = {
    send: false, requisitionDate: null, pickupDate: null,
    shiftedFrom: null, mergedFrom: [], pickupSkipped: [], clearance: null,
  }

  const cycles = resolveCycles(today, holidays)
  const idx = cycles.findIndex(c => c.requisitionDate === today)
  if (idx === -1) return empty
  const cycle = cycles[idx]
  const nextCycle = cycles[idx + 1] ?? null

  // เลื่อนมาจากวันไหน — ใช้ nominal ที่เก่าสุดที่ยุบมารวมกัน
  const earliest = cycle.mergedFrom[0]
  const shiftedFrom = earliest === today
    ? null
    : { date: earliest, holidayName: holidayName(holidays, earliest) }

  // หยุดยาวที่รออยู่ "ก่อนรอบถัดไป" → รอบนี้เป็นรอบสุดท้ายก่อนหยุด
  // จำกัดช่วงสแกนไว้ที่รอบถัดไป ไม่งั้นจะเตือนล่วงหน้าเป็นเดือน
  const scanUntil = nextCycle ? nextCycle.requisitionDate : addDays(cycle.pickupDate, 14)
  const upcomingRun = nextClosedRunBetween(cycle.pickupDate, scanUntil, holidays)
  const clearance = upcomingRun && upcomingRun.days >= LONG_HOLIDAY_MIN_DAYS
    ? upcomingRun
    : null

  // วันหยุดราชการที่ถูกข้ามระหว่างวันเบิก→วันรับ
  // เคสนี้ "วันเบิกไม่เลื่อน แต่วันรับเลื่อน" (เช่น จ.12 ต.ค. เบิกปกติ แต่ อ.13 หยุด → รับ พ.14)
  // ต้องบอกเหตุผลด้วย ไม่งั้น ward เห็นวันรับเปลี่ยนแล้วไม่รู้ว่าทำไม
  // (ไม่นับเสาร์-อาทิตย์ — คนรู้อยู่แล้วว่าคลังปิด ไม่ต้องอธิบาย)
  const pickupSkipped = []
  for (let d = addDays(cycle.requisitionDate, 1); d < cycle.pickupDate; d = addDays(d, 1)) {
    const nm = holidayName(holidays, d)
    if (nm !== null) pickupSkipped.push({ date: d, holidayName: nm })
  }

  return {
    send: true,
    requisitionDate: cycle.requisitionDate,
    pickupDate: cycle.pickupDate,
    shiftedFrom,
    mergedFrom: cycle.mergedFrom,
    pickupSkipped,
    clearance,
  }
}

// ---------- format ภาษาไทย (ใช้ร่วมทั้ง edge function และหน้า preview) ----------

const THAI_DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const THAI_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** '2026-08-17' → 'จันทร์ที่ 17 ส.ค. 2569' */
export function formatThaiDate(ymd) {
  const d = parseYmd(ymd)
  return `${THAI_DOW[d.getUTCDay()]}ที่ ${d.getUTCDate()} ${THAI_MON[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`
}

/** '2026-08-17' → '17 ส.ค.' (ใช้ในช่วงวันที่ ไม่ต้องซ้ำชื่อวัน) */
export function formatThaiShort(ymd) {
  const d = parseYmd(ymd)
  return `${d.getUTCDate()} ${THAI_MON[d.getUTCMonth()]}`
}

/**
 * ประกอบข้อความประกาศ — คงคำเดิมของบอทตัวก่อนทุกตัวอักษร
 * ต่อท้ายเฉพาะบรรทัดที่จำเป็น (เหตุผลการเลื่อน / เคลียร์ก่อนหยุดยาว)
 *
 * `{everyone}` เป็น placeholder ของ textV2 substitution (mention ทั้งกลุ่ม)
 * — ห้ามเปลี่ยนเป็น '@All' ตรงๆ เพราะจะกลายเป็นตัวอักษรธรรมดา ไม่เด้ง noti
 */
export function buildAnnouncementText(info) {
  // "พรุ่งนี้" ใช้ได้เฉพาะเมื่อวันรับ = วันถัดไปจริงๆ
  // เคสที่ไม่ใช่: ประกาศศุกร์ วันรับจันทร์ (ข้ามเสาร์อาทิตย์) — เรียก "พรุ่งนี้" จะผิดและทำให้ ward มาผิดวัน
  const isTomorrow = addDays(info.requisitionDate, 1) === info.pickupDate
  const whenPickup = isTomorrow
    ? `พรุ่งนี้ (${formatThaiDate(info.pickupDate)})`
    : `วัน${formatThaiDate(info.pickupDate)}`

  const lines = [
    '📋 {everyone} ฝ่ายไหนจะเบิก น้ำเกลือ/ยา/ถุง ส่งใบเบิกมาได้เลยครับ',
    '',
    `📢 ${whenPickup} ฝ่ายไหนที่พร้อม มารับ ,ยา ,น้ำเกลือ ,ถุง` +
    ' ให้แท็กไลน์ระบุเวลาที่พร้อมได้เลยครับ ตั้งแต่เวลา 9.00-15.00น.',
  ]

  if (info.shiftedFrom) {
    const why = info.shiftedFrom.holidayName
      ? ` (${info.shiftedFrom.holidayName})`
      : ''
    lines.push('', `📅 เลื่อนจาก${formatThaiDate(info.shiftedFrom.date)}${why}`)
  }

  for (const s of info.pickupSkipped || []) {
    const why = s.holidayName ? ` (${s.holidayName})` : ''
    lines.push('', `📅 ${formatThaiDate(s.date)} เป็นวันหยุด${why} วันมารับของจึงเลื่อนไป${formatThaiDate(info.pickupDate)}`)
  }

  if (info.mergedFrom.length > 1) {
    lines.push(`🔀 สัปดาห์นี้รวมเป็นรอบเดียว (เดิม ${info.mergedFrom.map(formatThaiShort).join(' และ ')})`)
  }

  if (info.clearance) {
    const { days, from, to, resumeDate } = info.clearance
    lines.push(
      '',
      `⚠️ หยุดยาว ${days} วัน (${formatThaiShort(from)} - ${formatThaiShort(to)})` +
      ` เปิดอีกครั้ง ${formatThaiDate(resumeDate)}`,
      'รอบนี้เป็นรอบสุดท้ายก่อนหยุด กรุณาเบิกเผื่อวันหยุดด้วยครับ',
    )
  }

  return lines.join('\n')
}
