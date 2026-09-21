// importGuard.js — ด่านตรวจก่อนเขียนทับตาราง (ใช้กับ CLI นำเข้าข้อมูล)
//
// pure module: ไม่ import supabase / ไม่แตะ DB — รับ "ของใหม่" กับ "สรุปของเดิม" เข้ามาเทียบ
// รัน golden test ใน node ได้: npm run test:importguard
//
// ทำไมต้องมี: `insertReceiveRows` ลบทั้งตารางก่อน insert (DELETE ALL → INSERT)
// ถ้าไฟล์ที่ชี้ผิด/เก่า/เสีย ข้อมูลเดิมหายทันทีโดยไม่มีอะไรเตือน
// (เหตุการณ์จริง 2026-07-01: import ไฟล์ผิด → Safety Stock เพี้ยนทั้งระบบ ต้องกู้ด้วย SQL)
//
// ปรัชญา: **ด่านไม่ตัดสินใจแทนคน** — คืนผลเป็น blocker/warning ให้คนอ่านแล้วตัดสินใจ
// blocker ข้ามได้ด้วย --force (ตั้งใจพิมพ์เพิ่ม) แต่ต้องเห็นเหตุผลก่อนเสมอ

/** ปีที่ยอมรับว่าเป็นวันที่จริงของคลัง — นอกช่วงนี้คืออาการของการแปลงวันที่ผิด
 *  (เช่น serial ถูกอ่านเป็นข้อความ, พ.ศ. ไม่ถูกแปลง, ปีพิมพ์เกินหลัก) */
export const YEAR_MIN = 2020
export const YEAR_MAX = 2035

/** แถวหายเกินเท่านี้ = สงสัยไฟล์ผิด/ไฟล์เก่า ต้องยืนยันก่อน
 *  20% เพราะข้อมูลรับยาโตขึ้นเรื่อยๆ ไม่เคยหดเอง — หดมาก = ผิดปกติแน่ */
export const SHRINK_LIMIT = 0.20

const pct = (a, b) => (b === 0 ? 0 : (a - b) / b)
const fmtNum = (n) => Number(n || 0).toLocaleString('th-TH')
const fmtBaht = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })

/** สรุปตัวเลขของชุดแถว — ใช้เทียบ "ของใหม่ vs ของเดิม"
 *  @param rows แถวที่จะเขียน (จาก receiveSheet.parseReceiveGrid)
 */
export function summarize(rows = []) {
  const dates = rows.map(r => r.receive_date).filter(Boolean).sort()
  return {
    count: rows.length,
    value: rows.reduce((s, r) => s + (Number(r.total_price_vat) || 0), 0),
    bills: new Set(rows.map(r => r.bill_number).filter(b => b && b !== '-')).size,
    codes: new Set(rows.map(r => r.drug_code).filter(Boolean)).size,
    firstDate: dates[0] || null,
    lastDate: dates[dates.length - 1] || null,
  }
}

/** ── ด่าน 1: แถวหดผิดปกติ ──────────────────────────────────────
 *  ของใหม่น้อยกว่าของเดิมเกิน SHRINK_LIMIT = สงสัยชี้ไฟล์ผิดหรือไฟล์เก่า */
export function checkShrink(next, prev, limit = SHRINK_LIMIT) {
  if (!prev || prev.count === 0) return null          // ตารางว่างอยู่แล้ว ไม่มีอะไรให้หาย
  const change = pct(next.count, prev.count)
  if (change >= -limit) return null
  return {
    level: 'blocker',
    code: 'shrink',
    message: `ข้อมูลใหม่น้อยกว่าเดิม ${(Math.abs(change) * 100).toFixed(1)}% ` +
      `(เดิม ${fmtNum(prev.count)} → ใหม่ ${fmtNum(next.count)} แถว) — อาจชี้ไฟล์ผิดหรือไฟล์เก่า`,
  }
}

/** ── ด่าน 2: วันที่นอกช่วงที่เป็นไปได้ ────────────────────────
 *  อาการของการแปลงวันที่ผิด เช่น พ.ศ. ไม่ถูกแปลง (2569) หรือ serial อ่านผิด */
export function checkDateRange(rows = [], { min = YEAR_MIN, max = YEAR_MAX } = {}) {
  const bad = []
  rows.forEach((r, i) => {
    for (const f of ['receive_date', 'order_date', 'inspect_date']) {
      const v = r[f]
      if (!v) continue
      const y = Number(String(v).slice(0, 4))
      if (!Number.isFinite(y) || y < min || y > max) {
        bad.push({ index: i, field: f, value: v, name: r.drug_name })
      }
    }
  })
  if (!bad.length) return null
  const sample = bad.slice(0, 3).map(b => `${b.name || '-'} ${b.field}=${b.value}`).join(' · ')
  return {
    level: 'blocker',
    code: 'date_range',
    message: `พบวันที่นอกช่วง ${min}–${max} จำนวน ${fmtNum(bad.length)} ค่า — น่าจะแปลงวันที่ผิด: ${sample}`,
    detail: bad,
  }
}

/** ── ด่าน 3: ของที่มีแต่ใน DB จะหาย ───────────────────────────
 *  บิลที่สแกนด้วย AI / ตรวจรับในแอป / เดิน AP ไปแล้ว **ไม่มีอยู่ในไฟล์ Excel**
 *  DELETE ALL จะกลืนหายถาวร (Critical Rule #8) — ต้องเตือนเป็นรายบิล ไม่ใช่แค่ตัวเลข
 *  @param atRisk [{ bill_number, reason }] — แถวใน DB ที่มีร่องรอยการทำงานในแอป
 *  @param nextBills Set ของเลขบิลในไฟล์ใหม่
 */
export function checkAppOnlyData(atRisk = [], nextBills = new Set()) {
  const lost = atRisk.filter(r => !nextBills.has(r.bill_number))
  if (!lost.length) return null
  const byReason = {}
  lost.forEach(r => { byReason[r.reason] = (byReason[r.reason] || 0) + 1 })
  const bills = [...new Set(lost.map(r => r.bill_number))]
  return {
    level: 'blocker',
    code: 'app_only_data',
    message: `จะลบข้อมูลที่สร้างในแอป (ไม่มีในไฟล์ Excel) ${fmtNum(bills.length)} บิล: ` +
      Object.entries(byReason).map(([k, v]) => `${k} ${v}`).join(' · ') +
      ` — บิล ${bills.slice(0, 5).join(', ')}${bills.length > 5 ? ` และอีก ${bills.length - 5}` : ''}`,
    detail: lost,
  }
}

/** ── ด่าน 4: ไฟล์เก่ากว่าข้อมูลใน DB ──────────────────────────
 *  ไฟล์สำรองที่โครงสร้างถูกทุกอย่าง ด่านอื่นจับไม่ได้ — จับด้วย "วันที่ล่าสุด"
 *  ถ้า DB มีของใหม่กว่าที่ไฟล์มี แปลว่ากำลังย้อนเวลา */
export function checkStale(next, prev) {
  if (!prev?.lastDate || !next?.lastDate) return null
  if (next.lastDate >= prev.lastDate) return null
  return {
    level: 'blocker',
    code: 'stale_file',
    message: `ไฟล์เก่ากว่าข้อมูลใน DB — ไฟล์มีถึง ${next.lastDate} แต่ DB มีถึง ${prev.lastDate} ` +
      `(อาจเปิดไฟล์สำรองผิดตัว)`,
  }
}

/** ── ด่าน 5: มูลค่ารวมเปลี่ยนผิดปกติ ─────────────────────────
 *  เตือนอย่างเดียว ไม่บล็อก — ราคาย้อนหลังแก้ได้จริง แต่เปลี่ยนเยอะควรรู้ตัว */
export function checkValueSwing(next, prev, limit = SHRINK_LIMIT) {
  if (!prev || !prev.value) return null
  const change = pct(next.value, prev.value)
  if (Math.abs(change) < limit) return null
  return {
    level: 'warning',
    code: 'value_swing',
    message: `มูลค่ารวมเปลี่ยน ${change > 0 ? '+' : ''}${(change * 100).toFixed(1)}% ` +
      `(เดิม ${fmtBaht(prev.value)} → ใหม่ ${fmtBaht(next.value)} บาท)`,
  }
}

/** ── ด่าน 6: ไฟล์ว่าง ─────────────────────────────────────────── */
export function checkEmpty(next) {
  if (next.count > 0) return null
  return { level: 'blocker', code: 'empty', message: 'ไฟล์ไม่มีแถวข้อมูลเลย — ไม่เขียนทับของเดิม' }
}

/**
 * รวมทุกด่าน → ผลตรวจ
 * @param rows     แถวใหม่ที่จะเขียน
 * @param prev     สรุปของเดิมใน DB (จาก summarize หรือ query) — null = ตารางว่าง
 * @param atRisk   แถวใน DB ที่มีร่องรอยการทำงานในแอป [{bill_number, reason}]
 * @returns { ok, blockers, warnings, next, prev }  ok = ไม่มี blocker
 */
export function runGuards(rows = [], prev = null, atRisk = []) {
  const next = summarize(rows)
  const nextBills = new Set(rows.map(r => r.bill_number).filter(Boolean))
  const found = [
    checkEmpty(next),
    checkShrink(next, prev),
    checkStale(next, prev),
    checkDateRange(rows),
    checkAppOnlyData(atRisk, nextBills),
    checkValueSwing(next, prev),
  ].filter(Boolean)
  return {
    ok: !found.some(f => f.level === 'blocker'),
    blockers: found.filter(f => f.level === 'blocker'),
    warnings: found.filter(f => f.level === 'warning'),
    next,
    prev,
  }
}

/** ข้อความสรุปผลตรวจสำหรับพิมพ์บนหน้าจอ CLI */
export function formatGuardReport({ blockers, warnings, next, prev }) {
  const lines = []
  lines.push(`  แถว        : ${fmtNum(next.count)}` + (prev ? `   (เดิม ${fmtNum(prev.count)})` : ''))
  lines.push(`  มูลค่ารวม  : ${fmtBaht(next.value)} บาท` + (prev ? `   (เดิม ${fmtBaht(prev.value)})` : ''))
  lines.push(`  บิล        : ${fmtNum(next.bills)}   ยา ${fmtNum(next.codes)} รหัส`)
  lines.push(`  ช่วงวันที่  : ${next.firstDate || '-'} ถึง ${next.lastDate || '-'}`)
  if (blockers.length) {
    lines.push('', '  ⛔ ปัญหาที่ต้องแก้ก่อน:')
    blockers.forEach(b => lines.push(`     - ${b.message}`))
  }
  if (warnings.length) {
    lines.push('', '  ⚠ ข้อสังเกต:')
    warnings.forEach(w => lines.push(`     - ${w.message}`))
  }
  if (!blockers.length && !warnings.length) lines.push('', '  ✓ ผ่านด่านตรวจทั้งหมด')
  return lines.join('\n')
}
