// countMatch.js — pure logic เทียบผลตรวจนับกับ snapshot ระบบ (ADR-0008 เพิ่มเติม 2026-07-16)
// - 3 สถานะต่อมิติ: 'unchecked' (ช่องว่าง = ไม่ได้ตรวจ) / 'ok' / 'diff'
// - "ตรง" ของ ที่เก็บ/exp = set equality หลัง normalize (split comma + trim, ไม่สนลำดับ/ช่องว่าง)
//   เจอแค่บางชั้นจากที่ระบบว่ามี = ไม่ตรง (สัญญาณจริง ไม่ใช่ noise)
// pure module — ห้าม import supabase (รัน golden test ใน node ได้: npm run test:countmatch)

const toNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }

// normalize ค่าหลายส่วนคั่น comma → เซ็ตเรียงลำดับ ("C-3-5 , C-3-1" ≡ "C-3-1 ,C-3-5")
export function normSet(v) {
  return String(v ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s && s !== '-')
    .sort()
    .join('|')
}

export function setEq(a, b) { return normSet(a) === normSet(b) }

// สถานะ 3 ค่าต่อมิติของ 1 บรรทัดนับ (ใช้ทั้งตอนกรอกสด + render ประวัติ)
// รับ item ที่มี counted_qty/counted_exp/counted_location + system_qty/system_exp/system_location
export function dimStatus(item) {
  const cntQty = item.counted_qty === '' || item.counted_qty == null ? null : toNum(item.counted_qty)
  const qty = cntQty == null ? 'unchecked' : (cntQty - toNum(item.system_qty) === 0 ? 'ok' : 'diff')
  const expRaw = String(item.counted_exp ?? '').trim()
  const exp = !expRaw ? 'unchecked' : (setEq(expRaw, item.system_exp) ? 'ok' : 'diff')
  const locRaw = String(item.counted_location ?? '').trim()
  const loc = !locRaw ? 'unchecked' : (setEq(locRaw, item.system_location) ? 'ok' : 'diff')
  const checked = [qty, exp, loc].filter(s => s !== 'unchecked').length
  const anyDiff = qty === 'diff' || exp === 'diff' || loc === 'diff'
  return { qty, exp, loc, checked, anyDiff }
}

// ค่าที่ persist ลง stock_count_item — นิยาม match เดิมตาม ADR-0008:
// จำนวนต้องถูกนับ (ไม่ null) + ทุกมิติที่ตรวจตรงหมด (มิติที่ไม่ได้ตรวจไม่ทำให้ fail)
export function computeCountMatch(item) {
  const d = dimStatus(item)
  const cntQty = item.counted_qty === '' || item.counted_qty == null ? null : toNum(item.counted_qty)
  const diff = cntQty == null ? 0 : toNum(item.system_qty) - cntQty
  return { counted_qty: cntQty, diff_qty: diff, match: d.qty === 'ok' && !d.anyDiff }
}

// ป้ายส่วนต่างเป็นคำไทย — ระบบ−นับได้ > 0 = ของจริงน้อยกว่าระบบ = "ขาด N", < 0 = "เกิน N"
// (เลขมีเครื่องหมาย "+2" คนอ่านตีความกลับด้านว่าเกิน — ADR-0008 เพิ่มเติม 2026-07-16)
export function diffLabel(systemQty, countedQty) {
  if (countedQty == null || countedQty === '') return '-'
  const diff = toNum(systemQty) - toNum(countedQty)
  if (diff === 0) return 'ตรง'
  const n = Math.round(Math.abs(diff) * 100) / 100
  return diff > 0 ? `ขาด ${n}` : `เกิน ${n}`
}
