// temperatureReport.js — สรุปอุณหภูมิที่เก็บยา (pure — ไม่ import supabase จึงรัน golden test ด้วย node ได้)
// ใช้ร่วม: การ์ดสถิติ · กราฟ · ตารางสรุปรายเดือน · ใบพิมพ์ — ตัวเลขทุกจุดมาจากฟังก์ชันชุดเดียว (Rule #6)
// ⚠️ ส่งเฉพาะ "ค่าที่วัดจริง" เข้ามา — แถว source='generated' ต้องถูกกรองที่ db.js ก่อน (ADR-0018)

export const TEMP_MIN_DEFAULT = 2
export const TEMP_MAX_DEFAULT = 8
const PLAN_TIMES = { am: '09:00', pm: '15:00' }   // = TEMP_ROUNDS ใน db.js
const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** หลุดช่วงยอมรับไหม — ใช้เกณฑ์ที่ snapshot ไว้ในแถว ไม่ใช่ค่าคงที่ในโค้ด */
export function isExcursion(r) {
  if (!r) return false
  const lo = r.min_c ?? TEMP_MIN_DEFAULT
  const hi = r.max_c ?? TEMP_MAX_DEFAULT
  const t = Number(r.temp_c)
  return Number.isFinite(t) && (t < Number(lo) || t > Number(hi))
}

const minutes = (t) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** รอบของแถว: เช้า < 12:00 ≤ บ่าย (กฎเดียวกับ findTemperatureSameRound) · ไม่มีเวลา → ดู round_label */
export function roundOf(r) {
  const m = minutes(r?.reading_time)
  if (m != null) return m < 720 ? 'am' : 'pm'
  return r?.round_label === 'บ่าย' ? 'pm' : 'am'
}

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysBetween = (a, b) => Math.floor((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) + 1

/** 'YYYY-MM' → { from, to } วันแรก–วันสุดท้ายของเดือน */
export function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
}

/** รายการเดือนตั้งแต่ ymFrom ถึง ymTo (รวมหัวท้าย) · สลับลำดับให้เองถ้าใส่กลับด้าน */
export function monthRange(ymFrom, ymTo) {
  const [a, b] = [ymFrom, ymTo].sort()
  const out = []
  let [y, m] = a.split('-').map(Number)
  while (`${y}-${String(m).padStart(2, '0')}` <= b && out.length < 600) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1; if (m > 12) { m = 1; y += 1 }
  }
  return out
}

/** 'YYYY-MM' → 'พ.ย. 2569' */
export function thaiMonthLabel(ym) {
  const [y, m] = ym.split('-').map(Number)
  return `${TH_MONTH[m - 1]} ${y + 543}`
}

/** ปีงบประมาณที่ today อยู่ (ต.ค.–ก.ย.) → { from:'YYYY-10', to:'YYYY-09' } */
export function fiscalYearMonths(today = new Date()) {
  const y = today.getFullYear()
  const start = today.getMonth() >= 9 ? y : y - 1
  return { from: `${start}-10`, to: `${start + 1}-09` }
}

/**
 * สรุปสถิติของชุดค่าที่วัดจริง
 * ความครบถ้วน = จำนวน "รอบที่มีการวัด" (วัน × เช้า/บ่าย ที่มี ≥1 แถว) ÷ รอบที่ควรมี
 * — วัดซ้ำในรอบเดียว / data logger วัดถี่ ไม่ดันเกิน 100% · รอบที่ไม่มีคนวัดไม่ถูกเติมให้ (ADR-0018 ข้อ 6)
 * ช่วงวันที่ควรมี = from–to ที่ส่งมา (ตัดไม่ให้เกิน today) ถ้าไม่ส่ง ใช้ช่วงข้อมูลจริง
 */
export function summarizeReadings(rows, { from, to, today, roundsPerDay = 2 } = {}) {
  const real = rows || []
  const temps = real.map(r => Number(r.temp_c)).filter(Number.isFinite)
  const excursions = real.filter(isExcursion)
  const unhandled = excursions.filter(r => !String(r.action_taken || '').trim())
  const roundsDone = new Set(real.map(r => `${r.reading_date}|${roundOf(r)}`)).size
  const dates = real.map(r => r.reading_date).filter(Boolean).sort()
  const todayIso = isoOf(today || new Date())
  const a = from || dates[0]
  let b = to || dates[dates.length - 1]
  if (b && b > todayIso) b = todayIso
  const days = a && b && a <= b ? daysBetween(a, b) : 0
  const expected = days * roundsPerDay
  return {
    count: real.length,
    roundsDone,
    expected,
    pct: expected > 0 ? Math.min(100, Math.round((roundsDone / expected) * 100)) : 0,
    min: temps.length ? Math.min(...temps) : null,
    max: temps.length ? Math.max(...temps) : null,
    avg: temps.length ? temps.reduce((s, t) => s + t, 0) / temps.length : null,
    excursions,
    unhandled,
    dataFrom: dates[0] || null,
    dataTo: dates[dates.length - 1] || null,
  }
}

/** ค่าที่วัดใกล้เวลาตามแผนที่สุดของรอบนั้น (data logger มีหลายค่า/รอบ — คนวัดมีค่าเดียว) */
function pickRound(list, key) {
  const target = minutes(PLAN_TIMES[key])
  let best = null, bestGap = Infinity
  for (const r of list) {
    const m = minutes(r.reading_time)
    const gap = m == null ? 1e6 : Math.abs(m - target)
    if (gap < bestGap) { best = r; bestGap = gap }
  }
  return best
}

/** รายวันเรียงจากเก่าไปใหม่ — ใช้ทั้งกราฟบนจอและใบพิมพ์ */
export function dailySeries(rows) {
  const byDate = new Map()
  for (const r of rows || []) {
    const t = Number(r.temp_c)
    if (!r.reading_date || !Number.isFinite(t)) continue
    if (!byDate.has(r.reading_date)) byDate.set(r.reading_date, [])
    byDate.get(r.reading_date).push(r)
  }
  return [...byDate.keys()].sort().map((date) => {
    const list = byDate.get(date)
    const ts = list.map(r => Number(r.temp_c))
    const am = list.filter(r => roundOf(r) === 'am')
    const pm = list.filter(r => roundOf(r) === 'pm')
    return {
      date,
      min: Math.min(...ts),
      max: Math.max(...ts),
      count: list.length,
      out: list.some(isExcursion),
      am: pickRound(am, 'am'),
      pm: pickRound(pm, 'pm'),
      recorders: [...new Set(list.map(r => String(r.recorded_by || '').trim()).filter(x => x && x !== '-'))],
    }
  })
}

/**
 * รายงาน 1 เดือน (ใบพิมพ์ 1 หน้า / แถวในตารางสรุปรายเดือน)
 * days = ทุกวันของเดือน (วันที่ไม่มีการวัดได้ค่า null — ใบพิมพ์ต้องแสดง "ไม่ได้วัด" ตามจริง)
 */
export function buildMonthReport(rows, ym, { today, roundsPerDay = 2 } = {}) {
  const { from, to } = monthBounds(ym)
  const inMonth = (rows || []).filter(r => r.reading_date >= from && r.reading_date <= to)
  const series = new Map(dailySeries(inMonth).map(d => [d.date, d]))
  const last = Number(to.slice(8))
  const todayIso = isoOf(today || new Date())
  const days = Array.from({ length: last }, (_, i) => {
    const date = `${ym}-${String(i + 1).padStart(2, '0')}`
    return { date, day: i + 1, future: date > todayIso, ...(series.get(date) || { min: null, max: null, count: 0, out: false, am: null, pm: null, recorders: [] }) }
  })
  return { ym, label: thaiMonthLabel(ym), from, to, days, summary: summarizeReadings(inMonth, { from, to, today, roundsPerDay }) }
}
