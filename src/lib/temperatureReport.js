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

// ── สรุปจากกราฟ + กราฟช่วงยาว (user เคาะ 15/11/2569) ─────────────────────────────

/** "ใกล้ขอบ" = ยังไม่หลุดช่วงแต่ห่างขอบไม่ถึงค่านี้ (°C) · ห้องไม่เตือนขอบล่าง (0–2 °C ในห้องไม่เกิดจริง) */
export const NEAR_EDGE = { fridge: { lo: 0.5, hi: 0.5 }, ambient: { lo: null, hi: 2 } }
const SAME_TOL = { fridge: 0.5, ambient: 1 }   // ต่างจากเดือนก่อนไม่เกินนี้ = "ใกล้เคียง"
const GAP_MIN_DAYS = 3                          // ไม่ได้วัดติดกันน้อยกว่านี้ (เช่น เสาร์–อาทิตย์) ไม่ยกเป็นช่วงขาด
const MAX_SPANS = 4

const thDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${Number(y) + 543}` }
const addDays = (iso, k) => new Date(Date.parse(iso + 'T00:00:00Z') + k * 86400000).toISOString().slice(0, 10)
const f1 = (n) => Number(n).toFixed(1)
const num = (n) => Number(n).toLocaleString('en-US')

/** วันที่ (เรียงแล้ว ไม่ซ้ำ) → ช่วงวันติดกัน [{ a, b, n }] */
function toSpans(dates) {
  const out = []
  for (const d of dates) {
    const last = out[out.length - 1]
    if (last && addDays(last.b, 1) === d) { last.b = d; last.n += 1 } else out.push({ a: d, b: d, n: 1 })
  }
  return out
}
const spanText = (s) => (s.a === s.b ? thDate(s.a) : `${thDate(s.a)} – ${thDate(s.b)}`)
/** dates = วันที่ (ซ้ำได้ ไม่ต้องเรียง) · หรือส่ง spans ที่ทำแล้วผ่าน opts.spans */
function spansText(dates, { spans = toSpans([...new Set(dates)].sort()), withDays = false } = {}) {
  const shown = spans.slice(0, MAX_SPANS).map(s => spanText(s) + (withDays ? ` (${num(s.n)} วัน)` : ''))
  const rest = spans.length - shown.length
  return shown.join(', ') + (rest > 0 ? ` และอีก ${rest} ช่วง` : '')
}

/**
 * สรุปจากกราฟเป็นภาษาคน — ใช้ร่วมกล่องบนจอและใบพิมพ์ (Rule #6)
 * ไม่มีข้อมูล = บอกว่าไม่มี ห้ามเดา/เติมค่า (ADR-0018)
 * @param rows ค่าที่วัดจริงของจุดวัดเดียว ในช่วง from–to
 * @param point { kind:'fridge'|'ambient', min, max } (TEMP_POINTS)
 * @param opts.partial true = rows ถูกกรองเฉพาะผู้บันทึกคนเดียว → ไม่สรุปความครบถ้วน/ช่วงที่ไม่ได้วัด (จะเป็นข้อความเท็จ)
 * @param opts.lastDate วันล่าสุดที่จุดวัดนี้มีค่าวัดจริง (ทุกช่วงเวลา) · undefined = ไม่รู้ (ไม่พูดถึง) · null = ไม่เคยวัดเลย
 * @returns {{ tone:'none'|'good'|'warn'|'bad', verdict:string, lines:{tone:'info'|'warn'|'bad'|'muted', text:string}[] }}
 */
export function describeReadings(rows, point = {}, { from, to, today, partial = false, lastDate } = {}) {
  const kind = point.kind === 'ambient' ? 'ambient' : 'fridge'
  const edge = NEAR_EDGE[kind]
  const pMin = point.min ?? TEMP_MIN_DEFAULT
  const pMax = point.max ?? TEMP_MAX_DEFAULT
  const real = (rows || []).filter(r => r.reading_date && Number.isFinite(Number(r.temp_c)))
  if (!real.length) {
    const lines = [{ tone: 'muted', text: 'ยังบอกไม่ได้ว่าอุณหภูมิเหมาะสมหรือไม่ — ไม่มีการบันทึกในช่วงที่เลือก' }]
    if (lastDate === null) lines.push({ tone: 'warn', text: 'จุดวัดนี้ยังไม่เคยมีการบันทึกอุณหภูมิ' })
    else if (lastDate) {
      const todayIso = isoOf(today || new Date())
      const since = addDays(lastDate, 1)
      // ช่วงที่เลือกอยู่หลังค่าล่าสุด = ขาดต่อเนื่องจากค่าล่าสุดถึงวันนี้ · ช่วงที่เลือกอยู่ก่อน = บอกแค่วันล่าสุด
      lines.push(from && lastDate < from && since <= todayIso
        ? { tone: 'warn', text: `วัดครั้งล่าสุด ${thDate(lastDate)} — ไม่มีการบันทึกตั้งแต่ ${thDate(since)} ถึงวันนี้ (${num(daysBetween(since, todayIso))} วัน)` }
        : { tone: 'muted', text: `วัดครั้งล่าสุด ${thDate(lastDate)}` })
    }
    return { tone: 'none', verdict: 'ไม่มีค่าที่วัดในช่วงนี้', lines }
  }
  const s = summarizeReadings(real, { from, to, today })
  const t = (r) => Number(r.temp_c)
  const lo = (r) => Number(r.min_c ?? pMin)
  const hi = (r) => Number(r.max_c ?? pMax)
  const high = real.filter(r => t(r) > hi(r))
  const low = real.filter(r => t(r) < lo(r))
  const inRange = real.filter(r => !isExcursion(r))
  const nearHi = edge.hi == null ? [] : inRange.filter(r => t(r) > hi(r) - edge.hi)
  const nearLo = edge.lo == null ? [] : inRange.filter(r => t(r) < lo(r) + edge.lo)
  const dates = (list) => list.map(r => r.reading_date)

  const lines = [{ tone: 'info', text: `เฉลี่ย ${f1(s.avg)} °C · ต่ำสุด ${f1(s.min)} · สูงสุด ${f1(s.max)} °C (เกณฑ์ ${pMin}–${pMax} °C)` }]
  if (high.length) lines.push({ tone: 'bad', text: `สูงเกิน ${pMax} °C ${num(high.length)} ครั้ง: ${spansText(dates(high))}` })
  if (low.length) lines.push({ tone: 'bad', text: `ต่ำกว่า ${pMin} °C ${num(low.length)} ครั้ง: ${spansText(dates(low))}` })
  if (s.unhandled.length) lines.push({ tone: 'bad', text: `ยังไม่ระบุการดำเนินการแก้ไข ${num(s.unhandled.length)} ครั้ง` })
  if (nearHi.length) lines.push({ tone: 'warn', text: `ใกล้ขอบบน (สูงกว่า ${f1(pMax - edge.hi)} °C) ${num(nearHi.length)} ค่า: ${spansText(dates(nearHi))}` })
  if (nearLo.length) lines.push({ tone: 'warn', text: `ใกล้ขอบล่าง (ต่ำกว่า ${f1(pMin + edge.lo)} °C) ${num(nearLo.length)} ค่า: ${spansText(dates(nearLo))}` })

  const lowPct = !partial && s.expected > 0 && s.pct < 80
  if (partial) {
    lines.push({ tone: 'muted', text: 'กรองเฉพาะผู้บันทึกคนเดียว — ไม่สรุปความครบถ้วนและช่วงที่ไม่ได้วัด' })
  } else if (s.expected > 0) {
    lines.push({ tone: lowPct ? 'warn' : 'info', text: `บันทึก ${num(s.roundsDone)} จาก ${num(s.expected)} รอบ (${s.pct}%)` })
    // ช่วงที่ไม่ได้วัด: from → to (ตัดที่วันนี้) วันที่ไม่มีค่าเลยสักรอบ ติดกันตั้งแต่ GAP_MIN_DAYS วัน
    const todayIso = isoOf(today || new Date())
    const a = from || s.dataFrom
    const b = to && to < todayIso ? to : (to ? todayIso : s.dataTo)
    const have = new Set(dates(real))
    const missing = []
    for (let d = a; d && d <= b; d = addDays(d, 1)) if (!have.has(d)) missing.push(d)
    const gaps = toSpans(missing).filter(g => g.n >= GAP_MIN_DAYS)
    if (gaps.length) {
      const tail = gaps[gaps.length - 1].b === todayIso ? ' — ยังไม่ได้วัดจนถึงวันนี้' : ''
      lines.push({ tone: 'warn', text: `ไม่ได้วัดติดกัน ${GAP_MIN_DAYS} วันขึ้นไป: ${spansText(null, { spans: gaps, withDays: true })}${tail}` })
    }
  }

  // เทียบรายเดือน — เฉพาะเดือนที่มีค่าวัดจริง
  const byMonth = new Map()
  for (const r of real) {
    const ym = r.reading_date.slice(0, 7)
    if (!byMonth.has(ym)) byMonth.set(ym, [])
    byMonth.get(ym).push(t(r))
  }
  const months = [...byMonth.keys()].sort().map(ym => {
    const v = byMonth.get(ym)
    return { ym, label: thaiMonthLabel(ym), avg: v.reduce((x, y) => x + y, 0) / v.length }
  })
  if (months.length >= 2) {
    const last = months[months.length - 1], prev = months[months.length - 2]
    const diff = last.avg - prev.avg
    const cmp = Math.abs(diff) <= SAME_TOL[kind] ? 'ใกล้เคียง' : diff > 0 ? `สูงกว่า` : `ต่ำกว่า`
    const by = cmp === 'ใกล้เคียง' ? '' : ` อยู่ ${f1(Math.abs(diff))} °C`
    lines.push({ tone: 'info', text: `แนวโน้ม: ${last.label} เฉลี่ย ${f1(last.avg)} °C ${cmp} ${prev.label} (${f1(prev.avg)} °C)${by}` })
  }
  if (months.length >= 3) {
    const hot = months.reduce((x, y) => (y.avg > x.avg ? y : x))
    const cold = months.reduce((x, y) => (y.avg < x.avg ? y : x))
    lines.push({ tone: 'info', text: `เดือนที่อุ่นที่สุด ${hot.label} (เฉลี่ย ${f1(hot.avg)} °C) · เย็นที่สุด ${cold.label} (${f1(cold.avg)} °C)` })
  }

  const excN = high.length + low.length
  const nearN = nearHi.length + nearLo.length
  let tone, verdict
  if (excN) {
    tone = 'bad'; verdict = `ไม่เหมาะสม — มีค่าหลุดช่วง ${num(excN)} ครั้ง`
  } else if (nearN || lowPct) {
    const why = [nearN ? `มีค่าใกล้ขอบ ${num(nearN)} ค่า` : null, lowPct ? `บันทึกไม่ครบ (${s.pct}%)` : null].filter(Boolean)
    tone = 'warn'; verdict = `อยู่ในช่วงที่ยอมรับทุกค่า แต่${why.join(' และ')}`
  } else {
    tone = 'good'; verdict = 'เหมาะสม — อยู่ในช่วงที่ยอมรับทุกค่า'
  }
  return { tone, verdict, lines }
}

/**
 * จุดของกราฟ — ช่วงสั้นรายวัน · ยาวกว่า 3 เดือนรวมรายสัปดาห์ · ยาวกว่า 12 เดือนรวมรายเดือน
 * (ฟันเลื่อยรายวันหลายร้อยจุดอ่านไม่ออก — user เคาะ 15/11/2569) · ช่วงที่ไม่มีค่าได้ count 0 / ค่า null (กราฟเว้นว่าง ไม่ลากข้าม)
 */
export function chartBuckets(rows, point = {}, { from, to }) {
  const pMin = point.min ?? TEMP_MIN_DEFAULT
  const pMax = point.max ?? TEMP_MAX_DEFAULT
  const span = from && to && from <= to ? daysBetween(from, to) : 0
  const unit = span <= 93 ? 'day' : span <= 366 ? 'week' : 'month'
  const buckets = []
  if (unit === 'month') {
    for (const ym of monthRange(from.slice(0, 7), to.slice(0, 7))) {
      const [y, m] = ym.split('-').map(Number)
      buckets.push({ key: ym, label: `${TH_MONTH[m - 1]} ${String(y + 543).slice(2)}`, title: thaiMonthLabel(ym) })
    }
  } else if (span > 0) {
    const step = unit === 'day' ? 1 : 7
    for (let a = from; a <= to; a = addDays(a, step)) {
      const b = unit === 'day' ? a : (addDays(a, 6) < to ? addDays(a, 6) : to)
      const [, mm, dd] = a.split('-').map(Number)
      buckets.push({ key: a, label: `${dd}/${mm}`, title: a === b ? thDate(a) : `${thDate(a)} – ${thDate(b)}` })
    }
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]))
  const keyOf = (date) => (unit === 'month' ? date.slice(0, 7)
    : unit === 'day' ? date : buckets[Math.floor((daysBetween(from, date) - 1) / 7)]?.key)
  const groups = buckets.map(() => [])
  for (const r of rows || []) {
    if (!r.reading_date || r.reading_date < from || r.reading_date > to || !Number.isFinite(Number(r.temp_c))) continue
    const i = idx.get(keyOf(r.reading_date))
    if (i != null) groups[i].push(r)
  }
  const points = buckets.map((b, i) => {
    const list = groups[i]
    if (!list.length) return { ...b, count: 0, min: null, max: null, avg: null, range: null, out: false, outPoint: null }
    const ts = list.map(r => Number(r.temp_c))
    const min = Math.min(...ts), max = Math.max(...ts)
    return { ...b, count: list.length, min, max, avg: ts.reduce((x, y) => x + y, 0) / ts.length, range: [min, max],
      out: list.some(isExcursion), outPoint: max > pMax ? max : min < pMin ? min : null }
  })
  return { unit, points }
}
