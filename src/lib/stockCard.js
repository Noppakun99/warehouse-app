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

// note ของแถวที่ย้ายมาจาก Excel ตอนเริ่มใช้ระบบ (เช่น "นำเข้าจาก ต.ค.68 (unpivot)")
// drift ของแถวกลุ่มนี้ = ประวัติก่อนหน้าไม่ได้ถูกนำเข้า ไม่ใช่ของหายจริง
const MIGRATION_RE = /unpivot|นำเข้าจาก/

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
      _qtyAfter: null,
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
      _qtyAfter: d.qty_after == null || d.qty_after === '' ? null : toNum(d.qty_after),
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
  const lastDriftByLot = {}   // drift ครั้งก่อนของ lot — ใช้หา "จุดที่ของหายจริง" (drift เปลี่ยนค่า)
  const rows = []

  for (const m of mv) {
    if (!(m.lot in balByLot)) {
      // opening ของ lot: มีรับเข้า → 0; ไม่มี (lot เก่าก่อนระบบ) → ยอดก่อนเบิกของแถวแรก
      const opening = hasReceipt.has(m.lot) ? 0 : (m._qtyBefore ?? 0)
      openingByLot[m.lot] = opening
      balByLot[m.lot] = opening
      lastDriftByLot[m.lot] = 0
    }
    // drift = ยอดที่ระบบคำนวณ ≠ ยอดก่อนเบิกที่ต้นทางบันทึกไว้ → มี movement ที่ไม่ถูกบันทึก
    // (Excel ทำ detect นี้ไม่ได้ — คลังเคยเจอเองแล้วเรียก "Group B Data Gap" 19 lots, Context.csv:1508)
    // เช็คเฉพาะแถวขาออกที่มี qty_before จริง; ไม่ throw/ไม่แก้ยอด แค่ flag ให้คนดู
    // balanceBefore = ยอดสะสม "ก่อน" หักแถวนี้ — เก็บไว้ให้ UI แสดงตรงๆ
    // (คำนวณจาก balance+qtyOut ไม่ได้ เพราะแถว NO_DEDUCT ไม่ได้ถูกหัก → จะเกินไป qtyOut)
    const balanceBefore = balByLot[m.lot]
    const drift = (m.side === 'out' && m._qtyBefore != null)
      ? balanceBefore - m._qtyBefore
      : null

    // driftDelta = drift "เพิ่มขึ้นเท่าไรจากแถวก่อน" = ของที่หายตรงจุดนี้จริงๆ
    // drift ค้างเท่าเดิม (delta=0) = ผลพวงจากช่องว่างก่อนหน้า ไม่ใช่ของหายซ้ำ → ไม่ต้องเตือนซ้ำทุกแถว
    const driftDelta = drift == null ? null : drift - lastDriftByLot[m.lot]
    if (drift != null) lastDriftByLot[m.lot] = drift

    // ตรวจสมการ "ในแถวเดียวกัน" ของต้นทาง: ก่อนเบิก − เบิกออก = หลังเบิก
    // ไม่เท่า = คนกรอกผิด/Excel ไม่ได้ตัดยอด (คนละเรื่องกับ drift ที่เป็นช่องว่างระหว่างแถว)
    // พบจริง 55 แถว เช่น ก่อนเบิก 10 เบิก 40 แต่หลังเบิกยังเป็น 10
    // แถวไม่หักยอด (บันทึกเท่านั้น/แก้ไขระบบ) ชีทตั้งใจให้ หลัง = ก่อน → ตรวจ ก่อน − หลัง แทน
    // (เดิมใช้สมการเดียวกัน → แถวบันทึกเท่านั้น 152/154 แถวจริงขึ้น "กรอกผิด" ปลอม — แก้ 14/11/2569)
    const rowErr = (m.side === 'out' && m._qtyBefore != null && m._qtyAfter != null)
      ? (m._qtyBefore - (NO_DEDUCT.has(m.kind) ? 0 : m.qtyOut)) - m._qtyAfter
      : null

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
      qtyBefore: m._qtyBefore,
      balanceBefore,               // ยอดสะสมก่อนหักแถวนี้ — UI ใช้แสดงคู่กับ qtyBefore ตอนอธิบาย drift
      drift,                       // null = เทียบไม่ได้ · 0 = ตรง · ≠0 = ยอดสะสมไม่ตรงบันทึก (ค้างมาได้)
      hasDrift: drift != null && drift !== 0,
      driftDelta,                  // ของที่หาย/เกิน "ตรงจุดนี้" (drift − drift แถวก่อนของ lot เดียวกัน)
      isDriftPoint: driftDelta != null && driftDelta !== 0,   // จุดที่ของหายจริง → UI เตือนเฉพาะแถวนี้
      qtyAfter: m._qtyAfter,       // ยอดหลังเบิกที่ต้นทางบันทึก
      rowErr,                      // สมการในแถวของต้นทาง: (ก่อน − ออก) − หลัง · 0 = ถูก · ≠0 = กรอกผิด
      hasRowErr: rowErr != null && rowErr !== 0,
      // แถวที่ย้ายมาจาก Excel ตอนเริ่มใช้ระบบ — ประวัติก่อนหน้าไม่ครบเป็นเรื่องปกติ
      // ไม่ใช่ของหายจริง (52% ของ drift ทั้งระบบมาจากกลุ่มนี้) → แยกออกจากรายการที่ต้องตรวจ
      fromMigration: MIGRATION_RE.test(m.ref || ''),
    })
  }

  const lots = Object.keys(balByLot).sort((a, b) => a.localeCompare(b, 'th')).map(lot => {
    const lotRows = rows.filter(r => r.lot === lot)
    const driftRows = lotRows.filter(r => r.hasDrift)
    const driftPoints = lotRows.filter(r => r.isDriftPoint)
    const driftReal = driftPoints.filter(r => !r.fromMigration).length
    const rowErrCount = lotRows.filter(r => r.hasRowErr).length
    const negative = balByLot[lot] < 0
    return {
      lot,
      opening: openingByLot[lot],
      closing: balByLot[lot],
      hasReceipt: hasReceipt.has(lot),
      negative,
      driftCount: driftPoints.length,   // นับ "จุดที่ของหาย" ไม่ใช่ทุกแถวที่ drift ค้าง
      // drift ล่าสุดของ lot — ใช้บอกขนาดของช่องว่างรวม (บวก = ระบบคิดว่ามีมากกว่าที่บันทึก)
      lastDrift: driftRows.length ? driftRows[driftRows.length - 1].drift : 0,
      exp: lotExp(lotRows),
      totalIn: lotRows.reduce((s, r) => s + r.qtyIn, 0),
      // เฉพาะแถวที่หักยอดจริง → ยอดตั้งต้น + รับ − เบิก = คงเหลือ เสมอ (แถวบันทึกเท่านั้น/แก้ไขระบบ ไม่นับ)
      totalOut: lotRows.reduce((s, r) => s + (r.noDeduct ? 0 : r.qtyOut), 0),
      driftReal,                                          // ยอดไม่ตรงที่ต้องตรวจ
      driftMigration: driftPoints.length - driftReal,     // ข้อมูลก่อนเริ่มใช้ระบบ (สีเทา ไม่ใช่เตือน)
      rowErrCount,
      warn: driftReal > 0 || rowErrCount > 0 || negative,
    }
  })

  return {
    rows,
    lots,
    summary: {
      totalIn: rows.reduce((s, r) => s + r.qtyIn, 0),
      totalOut: rows.reduce((s, r) => s + r.qtyOut, 0),
      lotCount: lots.length,
      negativeLots: lots.filter(l => l.negative).length,
      driftLots: lots.filter(l => l.driftCount > 0).length,
      driftRows: rows.filter(r => r.isDriftPoint).length,   // จำนวนจุดที่ของหายจริง (รวม migration)
      // แยกจุดที่ "ต้องตรวจจริง" ออกจากจุดที่เกิดตอนย้ายข้อมูล Excel
      driftRowsReal: rows.filter(r => r.isDriftPoint && !r.fromMigration).length,
      driftRowsMigration: rows.filter(r => r.isDriftPoint && r.fromMigration).length,
      rowErrRows: rows.filter(r => r.hasRowErr).length,     // แถวที่ต้นทางกรอกผิด (ก่อน−ออก≠หลัง)
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

// ── การแสดงผลหน้าการ์ดคลัง (ออกแบบใหม่ 13/11/2569 — docs/features/stock-card.md) ─────────

// Exp ของ lot: แถวรับเข้าก่อน (ตรงบิล) ไม่มีค่อยใช้แถวเบิกล่าสุด · ว่าง/'-' = ไม่รู้
function lotExp(lotRows) {
  const ok = (r) => r.exp && String(r.exp).trim() !== '-'
  const fromIn = lotRows.find(r => r.side === 'in' && ok(r))
  if (fromIn) return fromIn.exp
  const out = lotRows.filter(ok)
  return out.length ? out[out.length - 1].exp : ''
}

// ลำดับในรายการ lot: มีป้ายเตือน → ยังมีของ (หมดอายุเร็วก่อน) → หมดแล้ว (ท้ายสุด)
// exp ที่อ่านไม่ได้ไปท้ายกลุ่ม · เสมอกันเรียงชื่อ lot
export function orderLots(lots = []) {
  const group = (l) => (l.warn ? 0 : l.closing > 0 ? 1 : 2)
  const expKey = (l) => dateSortKey(l.exp) || Number.MAX_SAFE_INTEGER
  return [...lots].sort((a, b) =>
    group(a) - group(b) || expKey(a) - expKey(b) || a.lot.localeCompare(b.lot, 'th'))
}

// lot ที่เปิดให้เมื่อเลือกยา (จอคอม): lot มีป้ายเตือน → lot ที่ยังมีของหมดอายุเร็วสุด → null (= ดูทุก lot)
export function defaultLot(lots = []) {
  const first = orderLots(lots)[0]
  return first && (first.warn || first.closing > 0) ? first.lot : null
}

// "ดูทุก lot เรียงตามวัน" — วัน → รับก่อนเบิกในวันเดียวกัน → lot (ลำดับเดิมใน lot คงไว้)
export function sortRowsByDate(rows = []) {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) =>
      dateSortKey(a.r.date) - dateSortKey(b.r.date) ||
      (a.r.side === b.r.side ? 0 : a.r.side === 'in' ? -1 : 1) ||
      a.r.lot.localeCompare(b.r.lot, 'th') ||
      a.i - b.i)
    .map(x => x.r)
}

// ป้ายชนิดรายการแสดงเฉพาะค่าที่มีผลต่อการอ่านยอด (CONTEXT §การ์ดคลัง lot) — ซื้อยา/ยกยอด ไม่แสดง
export const SHOWN_KINDS = new Set(['บันทึกเท่านั้น', 'แก้ไขระบบ', 'ยืมยา', 'คืนยา', 'แลกเปลี่ยนยา', 'เปลี่ยนหมดอายุ', 'ยาโครงการ'])
export const kindBadgeOf = (kind) => (SHOWN_KINDS.has(kind) ? kind : null)

// คอลัมน์ "รายการ": รับจาก <บริษัท> / เบิก <หน่วยงาน>
export function rowTitle(r) {
  const party = String(r.party || '').trim()
  if (r.side === 'in') return party ? `รับจาก ${party}` : 'รับเข้า'
  return party ? `เบิก ${party}` : 'เบิกออก'
}

// หมายเหตุที่แสดง — ตัดศัพท์เทคนิคตอนแสดงผลเท่านั้น (ค่าดิบใน DB/MIGRATION_RE ไม่เปลี่ยน)
export function displayRef(ref) {
  return String(ref || '')
    .replace(/นำเข้าจาก\s*(\S+)\s*\(unpivot\)/g, 'นำเข้าจากชีทเบิก $1')
    .replace(/\s*\(unpivot\)/g, '')
    .trim()
}

const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

// บรรทัดอธิบายใต้แถวที่ยอดมีปัญหา → [{ type: 'drift'|'migration'|'rowErr', text }]
// ใช้ร่วมจอ + ใบพิมพ์ ให้คำตรงกัน
export function rowIssues(r) {
  const out = []
  if (r.isDriftPoint) {
    const gap = r.driftDelta > 0 ? 'ขาดไป' : 'เกินมา'
    const head = `ชีทเบิกบันทึกว่าก่อนเบิกเหลือ ${fmt(r.qtyBefore)} แต่ไล่จากประวัติได้ ${fmt(r.balanceBefore)}`
    if (r.drift === 0) {
      // ผลต่างของแถวก่อนหน้าหายไป — ยอดกลับมาตรง (ยังนับเป็นจุดเปลี่ยน แต่คำ "ขาดไป/เกินมา" จะชวนงง)
      const prev = r.drift - r.driftDelta
      out.push({
        type: r.fromMigration ? 'migration' : 'drift',
        text: `ยอดกลับมาตรงกัน: ชีทเบิกบันทึกว่าก่อนเบิกเหลือ ${fmt(r.qtyBefore)} ตรงกับที่ไล่จากประวัติ — ผลต่าง ${fmt(Math.abs(prev))} ของแถวก่อนหน้าหายไประหว่างทาง`,
      })
    } else if (r.fromMigration) {
      out.push({ type: 'migration', text: `ข้อมูลก่อนเริ่มใช้ระบบ: ${head} — ประวัติก่อน ต.ค.68 ไม่ได้นำเข้า ไม่ใช่ของหาย` })
    } else {
      const carried = r.driftDelta !== r.drift ? ` (รวมที่ต่างมาก่อนหน้า ต่างกันทั้งหมด ${fmt(Math.abs(r.drift))})` : ''
      out.push({ type: 'drift', text: `ยอดไม่ตรง: ${head} — ${gap} ${fmt(Math.abs(r.driftDelta))} ก่อนแถวนี้${carried}` })
    }
  }
  if (r.hasRowErr && r.noDeduct) {
    out.push({
      type: 'rowErr',
      text: `แถวกรอกผิด: แถว${r.kind}ไม่ตัดยอด หลังเบิกควรเท่าก่อนเบิก ${fmt(r.qtyBefore)} แต่ชีทเบิกบันทึก ${fmt(r.qtyAfter)}`,
    })
  } else if (r.hasRowErr) {
    out.push({
      type: 'rowErr',
      text: `แถวกรอกผิด: ชีทเบิกบันทึก ก่อนเบิก ${fmt(r.qtyBefore)} − เบิก ${fmt(r.qtyOut)} = หลังเบิก ${fmt(r.qtyAfter)} (ควรเป็น ${fmt(r.qtyBefore - r.qtyOut)})`,
    })
  }
  return out
}
