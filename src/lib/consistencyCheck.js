// consistencyCheck.js
// ตรวจความสอดคล้องข้อมูลนำเข้า (on-demand) — ดู CONTEXT.md §"Data Consistency Check"
// pure module — ไม่ import supabase (golden-testable; db.js ทำ I/O + เรียก module นี้)
//
// รับ array ที่ fetch มาแล้ว → return report มีโครงสร้าง ไม่แตะข้อมูล
// ขอบเขต ship-1 (ตกลงกับ user + scrutiny):
//   1. referential: inventory → receive (code+lot) ทิศเดียว, ข้าม lot='-'
//   2. numeric range-guard: safety_stock / qty / price — จับค่าเพี้ยนระดับ
//      order-of-magnitude (ไม่ recompute สูตร domain — กันกับดัก drift แบบ SS)

// normalize lot ให้เทียบสองฝั่งได้ตรงกัน (Finding #1: inventory กับ receive
// เก็บ lot คนละ pipeline — ต้อง normalize ด้วย logic เดียวกันก่อน compare)
export function normLot(lot) {
  if (lot == null) return ''
  let v = String(lot).trim()
  // scientific notation (เช่น "1.2E+5") → เลขเต็ม — ตรง normalizeNumericText ใน App.jsx
  if (/^[\d.]+[eE][+-]?\d+$/.test(v)) {
    const n = parseFloat(v)
    if (isFinite(n)) v = String(Math.round(n))
  }
  return v.toLowerCase()
}

// lot ที่ถือว่า "ไม่มีเลข lot จริง" — ข้ามจาก referential (ยกยอด/บริจาค/ว่าง)
export function isBlankLot(lot) {
  const v = normLot(lot)
  return v === '' || v === '-'
}

const toNum = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, '').trim())
  return isFinite(n) ? n : null
}

// threshold ของ range-guard — named const เพื่อจูนง่าย + สื่อขอบเขตชัด
// (จับ order-of-magnitude error เท่านั้น ไม่ใช่ reconcile — ดู scrutiny Finding #2)
export const GUARD = {
  SS_MAX: 10000,   // SS เกินนี้ = น่าสงสัยผิดขนาด (ปกติหลักหน่วย–พัน; เหตุการณ์ 01/07 มี 180740)
}

/**
 * สร้าง Set ของ key `code|lot` จาก receive rows (normalize แล้ว)
 * @param receiveRows [{ drug_code, lot }]
 */
export function buildReceiveKeySet(receiveRows) {
  const set = new Set()
  for (const r of receiveRows || []) {
    const code = String(r.drug_code ?? '').trim().toLowerCase()
    const lot = normLot(r.lot)
    if (code) set.add(`${code}|${lot}`)
  }
  return set
}

/**
 * ตรวจ referential: lot ที่มีของในคลัง (qty>0, lot จริง) แต่ไม่มีใน receive
 * @param inventoryRows [{ code, name, lot, qty, location }]
 * @param receiveKeySet Set<`code|lot`>
 * @returns { hasReceiveData, orphans: [{code,name,lot,qty,location}] }
 */
export function checkInventoryOrphans(inventoryRows, receiveKeySet) {
  // Finding #4: receive ว่าง → ไม่ flag รายตัว (จะแดงทั้งจอ) — คืน hasReceiveData=false
  const hasReceiveData = receiveKeySet && receiveKeySet.size > 0
  const orphans = []
  if (hasReceiveData) {
    for (const row of inventoryRows || []) {
      const qty = toNum(row.qty)
      if (qty == null || qty <= 0) continue        // ไม่มีของ = ไม่สนใจ
      if (isBlankLot(row.lot)) continue            // lot='-' (ยกยอด/บริจาค) = ข้าม
      const code = String(row.code ?? '').trim().toLowerCase()
      if (!code) continue
      const key = `${code}|${normLot(row.lot)}`
      if (!receiveKeySet.has(key)) {
        orphans.push({
          code: row.code,
          name: row.name || '-',
          lot: row.lot,
          qty: row.qty,
          location: row.location || '-',
        })
      }
    }
  }
  return { hasReceiveData, orphans }
}

/**
 * range-guard: จับค่าที่เพี้ยนผิดขนาดบน column ที่ import แล้ว (อ่านอย่างเดียว)
 * @param inventoryRows [{ code, name, lot, qty, safety_stock, receive_status, ... }]
 * @returns { ssTooHigh, qtyNegative } — แต่ละตัวเป็น array ของ row ที่ต้องดู
 */
export function checkRangeGuards(inventoryRows) {
  const ssTooHigh = []
  const qtyNegative = []
  for (const row of inventoryRows || []) {
    const ss = toNum(row.safety_stock)
    if (ss != null && ss > GUARD.SS_MAX) {
      ssTooHigh.push({ code: row.code, name: row.name || '-', safety_stock: row.safety_stock })
    }
    const qty = toNum(row.qty)
    if (qty != null && qty < 0) {
      qtyNegative.push({ code: row.code, name: row.name || '-', lot: row.lot, qty: row.qty, location: row.location || '-' })
    }
  }
  return { ssTooHigh, qtyNegative }
}

/**
 * รวมทุกตรวจเป็น report เดียว
 * @param inventoryRows  จาก fetchAllInventoryRows
 * @param receiveRows    [{ drug_code, lot }] จาก receive_logs (paginated)
 * @returns report
 */
export function buildConsistencyReport(inventoryRows, receiveRows) {
  const receiveKeySet = buildReceiveKeySet(receiveRows)
  const referential = checkInventoryOrphans(inventoryRows, receiveKeySet)
  const guards = checkRangeGuards(inventoryRows)
  return {
    counts: {
      inventoryRows: (inventoryRows || []).length,
      receiveKeys: receiveKeySet.size,
    },
    referential,   // { hasReceiveData, orphans }
    guards,        // { ssTooHigh, qtyNegative }
  }
}
