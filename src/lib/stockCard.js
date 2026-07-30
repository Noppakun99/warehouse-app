// stockCard.js — การ์ดคลัง lot (Stock Card): ประวัติ movement ของยา 1 รหัส ทุก lot ทุกเดือน
// port สูตรจาก Excel sheet "Stock Card (Lot)" (Context.csv §45.5 + §46.2 — verify แล้ว 23/24 ยา, scan 2,118 lots)
// pure module — ห้าม import supabase (รัน golden test ใน node ได้: npm run test:stockcard)
//
// running balance ต่อ lot:
//   opening = hasReceipt ? 0 : (คงเหลือก่อนเบิกของแถวเบิกแรก)
//   balance += qtyIn − (NO_DEDUCT.has(kind) ? 0 : qtyOut)
// ติดลบได้ = data gap ของต้นทาง ไม่ใช่บั๊ก (Excel พบ 37/2,118 lots = 1.7%)

// ชนิดรายการที่ "ไม่หัก balance" — บันทึกเหตุการณ์เฉยๆ ไม่ใช่ของออกจริง (Excel §46.3 + §46.7)
// บันทึกเท่านั้น = O=M ไม่ตัดยอด · แก้ไขระบบ = แถวปรับยอด ไม่ใช่ movement จริง
export const NO_DEDUCT = new Set(['บันทึกเท่านั้น', 'แก้ไขระบบ'])

const toNum = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

// lot ว่าง/'-' → '-' (เวชภัณฑ์ไม่มีเลข lot). ต้อง key ด้วย code|lot เสมอ — lot ซ้ำข้ามรหัสได้
export const lotOf = (lot) => {
  const s = String(lot ?? '').trim()
  return s && s !== '-' ? s : '-'
}

// วันที่ ISO (YYYY-MM-DD) หรือ DD/MM/YYYY → epoch สำหรับ sort; parse ไม่ได้ = 0 (ไปอยู่ต้น)
export function dateSortKey(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return 0
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3])
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (dmy) {
    let y = +dmy[3]
    if (y > 2500) y -= 543   // พ.ศ. → ค.ศ.
    return Date.UTC(y, +dmy[2] - 1, +dmy[1])
  }
  return 0
}

// union ขาเข้า (receive) + ขาออก (dispense) → movement เดียวกัน
// receiveRows: { receive_date, lot, item_type, qty_received, supplier_current, bill_number, exp, price_per_unit }
// dispenseRows: { dispense_date, lot, item_type, qty_out, qty_before, department, note, exp, price_per_unit }
function toMovements(receiveRows = [], dispenseRows = []) {
  const mv = []
  for (const r of receiveRows) {
    mv.push({
      date: r.receive_date || '',
      lot: lotOf(r.lot),
      kind: String(r.item_type || '').trim() || 'รับเข้า',
      qtyIn: toNum(r.qty_received),
      qtyOut: 0,
      party: String(r.supplier_current || '').trim(),
      ref: String(r.bill_number || '').trim(),
      exp: r.exp || '',
      side: 'in',
      _qtyBefore: null,
    })
  }
  for (const d of dispenseRows) {
    mv.push({
      date: d.dispense_date || '',
      lot: lotOf(d.lot),
      kind: String(d.item_type || '').trim() || 'เบิกออก',
      qtyIn: 0,
      qtyOut: toNum(d.qty_out),
      party: String(d.department || '').trim(),
      ref: String(d.note || '').trim(),
      exp: d.exp || '',
      side: 'out',
      // ยอดก่อนเบิก — ใช้หา opening ของ lot ที่ไม่มีประวัติรับเข้า (lot เก่าก่อนระบบ)
      _qtyBefore: d.qty_before == null || d.qty_before === '' ? null : toNum(d.qty_before),
    })
  }
  return mv
}

/**
 * buildStockCard({ receiveRows, dispenseRows, pricePerUnit })
 *   → { rows, lots, summary }
 *
 * rows  = movement เรียง lot ASC → date ASC (ตาม Excel §46.2) พร้อม balance สะสมต่อ lot
 * lots  = [{ lot, opening, closing, hasReceipt, negative }]
 * summary = { totalIn, totalOut, lotCount, negativeLots }
 *
 * pricePerUnit = ราคาจาก Master (ไม่ใช้ราคาในแถวเบิก — แถว 'ยกยอด' มี price=0 ตาม Excel §45.5 I8)
 */
export function buildStockCard({ receiveRows = [], dispenseRows = [], pricePerUnit = 0 } = {}) {
  const price = toNum(pricePerUnit)
  const mv = toMovements(receiveRows, dispenseRows)

  // lot ที่มีประวัติรับเข้า → opening = 0 (ของเข้ามาเพิ่ม balance เอง)
  const hasReceipt = new Set(mv.filter(m => m.side === 'in').map(m => m.lot))

  // sort: lot ASC → date ASC → ขาเข้าก่อนขาออกในวันเดียวกัน (รับเข้าแล้วค่อยเบิก)
  mv.sort((a, b) =>
    a.lot.localeCompare(b.lot, 'th') ||
    dateSortKey(a.date) - dateSortKey(b.date) ||
    (a.side === b.side ? 0 : a.side === 'in' ? -1 : 1)
  )

  const openingByLot = {}
  const balByLot = {}
  const rows = []

  for (const m of mv) {
    if (!(m.lot in balByLot)) {
      // opening ของ lot: มีรับเข้า → 0; ไม่มี (lot เก่าก่อนระบบ) → ยอดก่อนเบิกของแถวแรก
      const opening = hasReceipt.has(m.lot) ? 0 : (m._qtyBefore ?? 0)
      openingByLot[m.lot] = opening
      balByLot[m.lot] = opening
    }
    const deduct = NO_DEDUCT.has(m.kind) ? 0 : m.qtyOut
    balByLot[m.lot] += m.qtyIn - deduct
    rows.push({
      date: m.date,
      lot: m.lot,
      kind: m.kind,
      qtyIn: m.qtyIn,
      qtyOut: m.qtyOut,
      balance: balByLot[m.lot],
      party: m.party,
      ref: m.ref,
      exp: m.exp,
      value: (m.qtyIn + m.qtyOut) * price,
      side: m.side,
      noDeduct: NO_DEDUCT.has(m.kind),
    })
  }

  const lots = Object.keys(balByLot).sort((a, b) => a.localeCompare(b, 'th')).map(lot => ({
    lot,
    opening: openingByLot[lot],
    closing: balByLot[lot],
    hasReceipt: hasReceipt.has(lot),
    negative: balByLot[lot] < 0,
  }))

  return {
    rows,
    lots,
    summary: {
      totalIn: rows.reduce((s, r) => s + r.qtyIn, 0),
      totalOut: rows.reduce((s, r) => s + r.qtyOut, 0),
      lotCount: lots.length,
      negativeLots: lots.filter(l => l.negative).length,
    },
  }
}

// กรอง movement ที่ derive แล้ว (เฟส ข) — แยกจาก build เพื่อไม่ต้อง re-derive ตอนกรอง
export function filterStockCard(rows, { lot, kind, from, to } = {}) {
  const fromKey = from ? dateSortKey(from) : null
  const toKey = to ? dateSortKey(to) : null
  return rows.filter(r => {
    if (lot && r.lot !== lot) return false
    if (kind && r.kind !== kind) return false
    if (fromKey != null && dateSortKey(r.date) < fromKey) return false
    if (toKey != null && dateSortKey(r.date) > toKey) return false
    return true
  })
}
