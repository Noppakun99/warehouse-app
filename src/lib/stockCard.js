// stockCard.js — การ์ดคลัง lot (Stock Card): ประวัติ movement ของยา 1 รหัส ทุก lot ทุกเดือน
// port สูตรจาก Excel sheet "Stock Card (Lot)" (Context.csv §45.5 + §46.2 — verify แล้ว 23/24 ยา, scan 2,118 lots)
// pure module — ห้าม import supabase (รัน golden test ใน node ได้: npm run test:stockcard)
//
// running balance ต่อ lot:
//   opening = hasReceipt ? 0 : (คงเหลือก่อนเบิกของแถวเบิกแรก)
//   balance += qtyIn − (NO_DEDUCT.has(kind) ? 0 : qtyOut)
// ติดลบได้ = data gap ของต้นทาง ไม่ใช่บั๊ก (Excel พบ 37/2,118 lots = 1.7%)

// ชนิดรายการที่ "ไม่หัก balance" — บันทึกเหตุการณ์เฉยๆ ไม่ใช่ของออกจริง (Excel §46.3 + §46.7)
// บันทึกเท่านั้น = O=M ไม่ตัดยอด
// แก้ไขระบบ หักปกติ (user สั่ง 14/11/2569) — แถวเบิกที่ lot มาจากแถวปรับยอดใน Master เป็นของออกจริง
// ชีทหักจริง 11/11 แถว + SUMIFS ปริมาณออกของ Master นับแถวนี้ด้วย
export const NO_DEDUCT = new Set(['บันทึกเท่านั้น'])

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

// วันเริ่มใช้ระบบ — ชีทเบิกนำเข้าตั้งแต่ ต.ค.68 การเบิกก่อนวันนี้ไม่มีในระบบ
// ใบรับก่อนวันนี้จึงบวกเข้าคงเหลือตรงๆ ไม่ได้ (ของส่วนหนึ่งถูกเบิกไปก่อนเริ่มระบบแล้ว)
// สแกน 14/11/2569: นับใบรับเก่าเต็มจำนวน → คงเหลือ lot ไม่ตรง Master 1,017 lot · ตัดออกแล้วเหลือ 124
export const SYSTEM_START = '2025-10-01'

// ── ปรับยอดให้ตรง Master (user สั่ง 14/11/2569: "Master ถูกต้อง ให้แอปตรง") ──
// lot ที่ไล่จากประวัติรับ-เบิกแล้วไม่เท่า Master → แถวท้าย lot ส่วนต่าง ±N คงเหลือปลาย = Master
// เหตุผลที่รู้ได้: แถว Master ชนิดเหล่านี้เพิ่มของเข้า lot โดยไม่มีแถวในชีทรับยา (คืนยอดใบที่ยกเลิก · คืนยาจากใบยืม · รับเกินบิล)
// ของที่แถวนั้นนำเข้า = คงเหลือของแถว + ยอดเบิกที่ระบุชนิดเดียวกัน → เท่าส่วนต่างพอดี = อธิบายได้
// ใช้เป็นกฎบวกทุกแถวไม่ได้: หลายแถวคืนยาลงชีทรับยาไว้แล้ว/ยอดตั้งต้นไล่ย้อนรวมไว้แล้ว (บวกซ้ำ)
export const MASTER_ADJUST_KINDS = new Set(['แก้ไขระบบ', 'คืนยา'])
export const ADJUST_KIND = 'ปรับยอดตาม Master'

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * buildStockCard({ receiveRows, dispenseRows, pricePerUnit, masterRows })
 *   → { rows, lots, summary }
 *
 * rows  = movement เรียง lot ASC → date ASC (ตาม Excel §46.2) พร้อม balance สะสมต่อ lot
 * lots  = [{ lot, opening, closing, hasReceipt, hasOpening, negative, masterQty, masterMismatch, ... }]
 * summary = { totalIn, totalOut, lotCount, negativeLots, masterMismatchLots, ... }
 *
 * pricePerUnit = ราคาจาก Master (ไม่ใช้ราคาในแถวเบิก — แถว 'ยกยอด' มี price=0 ตาม Excel §45.5 I8)
 * masterRows   = แถว inventory ของรหัสนี้ [{ lot, qty, item_type?, invoice? }] (ไม่ส่ง = ไม่เทียบกับ Master)
 * asOf         = วันที่ของแถวปรับยอดตาม Master (ค่าเริ่มต้น = วันนี้ — Master คือยอด ณ ตอนนี้)
 */
export function buildStockCard({ receiveRows = [], dispenseRows = [], pricePerUnit = 0, masterRows = null, asOf = null } = {}) {
  const price = toNum(pricePerUnit)
  const mv = toMovements(receiveRows, dispenseRows)

  const hasReceipt = new Set(mv.filter(m => m.side === 'in').map(m => m.lot))

  // sort: lot ASC → date ASC → ขาเข้าก่อนขาออกในวันเดียวกัน (รับเข้าแล้วค่อยเบิก)
  mv.sort((a, b) =>
    a.lot.localeCompare(b.lot, 'th') ||
    dateSortKey(a.date) - dateSortKey(b.date) ||
    (a.side === b.side ? 0 : a.side === 'in' ? -1 : 1)
  )

  // ── ยอดตั้งต้นต่อ lot ──
  // ประวัติครบ (ไม่มีใบรับก่อนเริ่มระบบ + เริ่มด้วยการรับเข้า) → เริ่มจาก 0
  // ไม่ครบ → ไล่ย้อนจาก "ก่อนเบิก" ของแถวเบิกแรกที่มีตัวเลข: ก่อนเบิก − รับก่อนหน้า + เบิกก่อนหน้า
  // ใบรับก่อนเริ่มระบบของ lot ที่ไล่ย้อน = แสดงเป็นประวัติแต่ไม่บวกยอด (นับอยู่ในยอดตั้งต้นแล้ว)
  // ไม่มีแถวเบิกที่มีตัวเลขเลย → ไล่ย้อนไม่ได้ ใช้ 0 และนับใบรับทุกใบ (เหมือนเดิม)
  const startKey = dateSortKey(SYSTEM_START)
  const isPre = (m) => m.side === 'in' && dateSortKey(m.date) > 0 && dateSortKey(m.date) < startKey
  const byLot = {}
  for (const m of mv) (byLot[m.lot] ||= []).push(m)
  const masterByLot = masterRows ? {} : null
  if (masterRows) for (const r of masterRows) masterByLot[lotOf(r.lot)] = (masterByLot[lotOf(r.lot)] || 0) + toNum(r.qty)
  const openingByLot = {}
  const backSolved = new Set()
  for (const [lot, ms] of Object.entries(byLot)) {
    // มีแต่ใบรับก่อนเริ่มระบบ ไม่มีความเคลื่อนไหวหลังจากนั้นเลย → ยอดที่เหลือ ณ วันเริ่มระบบ = ยอดใน Master ตอนนี้
    // (สแกน 14/11/2569 ~650 lot: ส่วนใหญ่เบิกหมดก่อน ต.ค.68 แต่เดิมนับรับเต็ม → โชว์ว่ามีของ)
    if (masterByLot && ms.every(isPre)) {
      openingByLot[lot] = masterByLot[lot] || 0
      backSolved.add(lot)
      continue
    }
    const fullHistory = !ms.some(isPre) && ms[0].side === 'in'
    const anchor = ms.findIndex(m => m.side === 'out' && m._qtyBefore != null)
    if (fullHistory || anchor < 0) { openingByLot[lot] = 0; continue }
    let opening = ms[anchor]._qtyBefore
    for (const m of ms.slice(0, anchor)) {
      if (m.side === 'in') opening -= isPre(m) ? 0 : m.qtyIn
      else opening += NO_DEDUCT.has(m.kind) ? 0 : m.qtyOut
    }
    openingByLot[lot] = opening
    backSolved.add(lot)
  }

  const balByLot = {}
  const lastDriftByLot = {}   // drift ครั้งก่อนของ lot — ใช้หา "จุดที่ของหายจริง" (drift เปลี่ยนค่า)
  const rows = []

  for (const m of mv) {
    if (!(m.lot in balByLot)) {
      balByLot[m.lot] = openingByLot[m.lot]
      lastDriftByLot[m.lot] = 0
    }
    // drift = ยอดที่ระบบคำนวณ ≠ ยอดก่อนเบิกที่ต้นทางบันทึกไว้ → มี movement ที่ไม่ถูกบันทึก
    // (Excel ทำ detect นี้ไม่ได้ — คลังเคยเจอเองแล้วเรียก "Group B Data Gap" 19 lots, Context.csv:1508)
    // เช็คเฉพาะแถวขาออกที่มี qty_before จริง; ไม่ throw/ไม่แก้ยอด แค่ flag ให้คนดู
    // แถวเบิกออก 0 ไม่เทียบ: "เบิก 10 จ่าย 0 รอตรวจรับ" ชีทพิมพ์ก่อนเบิก 0 ทั้งที่มีของรอตรวจรับ → ไม่ตรงปลอม
    // balanceBefore = ยอดสะสม "ก่อน" หักแถวนี้ — เก็บไว้ให้ UI แสดงตรงๆ
    // (คำนวณจาก balance+qtyOut ไม่ได้ เพราะแถว NO_DEDUCT ไม่ได้ถูกหัก → จะเกินไป qtyOut)
    const balanceBefore = balByLot[m.lot]
    const drift = (m.side === 'out' && m._qtyBefore != null && m.qtyOut !== 0)
      ? balanceBefore - m._qtyBefore
      : null

    // driftDelta = drift "เพิ่มขึ้นเท่าไรจากแถวก่อน" = ของที่หายตรงจุดนี้จริงๆ
    // drift ค้างเท่าเดิม (delta=0) = ผลพวงจากช่องว่างก่อนหน้า ไม่ใช่ของหายซ้ำ → ไม่ต้องเตือนซ้ำทุกแถว
    const driftDelta = drift == null ? null : drift - lastDriftByLot[m.lot]
    if (drift != null) lastDriftByLot[m.lot] = drift

    // ตรวจสมการ "ในแถวเดียวกัน" ของต้นทาง: ก่อนเบิก − เบิกออก = หลังเบิก
    // ไม่เท่า = คนกรอกผิด/Excel ไม่ได้ตัดยอด (คนละเรื่องกับ drift ที่เป็นช่องว่างระหว่างแถว)
    // พบจริง 55 แถว เช่น ก่อนเบิก 10 เบิก 40 แต่หลังเบิกยังเป็น 10
    // แถวไม่หักยอด (บันทึกเท่านั้น) ชีทตั้งใจให้ หลัง = ก่อน → ตรวจ ก่อน − หลัง แทน
    // (เดิมใช้สมการเดียวกัน → แถวบันทึกเท่านั้น 152/154 แถวจริงขึ้น "กรอกผิด" ปลอม — แก้ 14/11/2569)
    const rowErr = (m.side === 'out' && m._qtyBefore != null && m._qtyAfter != null)
      ? (m._qtyBefore - (NO_DEDUCT.has(m.kind) ? 0 : m.qtyOut)) - m._qtyAfter
      : null

    const preSystem = backSolved.has(m.lot) && isPre(m)
    const deduct = NO_DEDUCT.has(m.kind) ? 0 : m.qtyOut
    balByLot[m.lot] += (preSystem ? 0 : m.qtyIn) - deduct
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
      preSystem,                   // ใบรับก่อนเริ่มระบบที่ไม่บวกยอด (นับในยอดตั้งต้นของ lot แล้ว)
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
      settled: false,              // ตั้งด้านล่าง: จุดไม่ตรงใน lot ที่คงเหลือตอนนี้ตรง Master
    })
  }

  // ── เทียบคงเหลือปลายทางกับ Master (ตัวตรวจหลัก) ──
  // lot ที่คงเหลือตรง Master = ของไม่ได้หาย จุดไม่ตรงระหว่างทางเป็นเรื่องการบันทึก
  // (lot เดียวแยกหลายแถวในชีท · ลำดับแถววันเดียวกัน) → ลดเป็นสีเทา ไม่เตือน
  const round =(n) => Math.round(n * 10000) / 10000

  // แถว Master ชนิดปรับยอด/คืนยาต่อ lot — เหตุผลของแถวปรับยอด
  const masterAdjByLot = {}
  if (masterRows) for (const r of masterRows) {
    const kind = String(r.item_type || '').trim()
    if (MASTER_ADJUST_KINDS.has(kind)) (masterAdjByLot[lotOf(r.lot)] ||= []).push({ kind, qty: toNum(r.qty), note: String(r.invoice || '').trim() })
  }
  const adjustByLot = {}
  if (masterByLot) for (const lot of Object.keys(balByLot)) {
    const diff = round((masterByLot[lot] || 0) - balByLot[lot])
    if (diff === 0) continue
    const adj = masterAdjByLot[lot] || []
    const kinds = new Set(adj.map(a => a.kind))
    const added = adj.reduce((s, a) => s + a.qty, 0) +
      rows.filter(r => r.lot === lot && r.side === 'out' && !r.noDeduct && kinds.has(r.kind)).reduce((s, r) => s + r.qtyOut, 0)
    const explained = adj.length > 0 && round(added) === diff
    adjustByLot[lot] = { diff, explained, reasons: explained ? adj : [] }
  }
  // แทรกแถวปรับยอดเป็นแถวสุดท้ายของ lot (rows เรียง lot → วัน อยู่แล้ว)
  const adjDate = asOf || todayIso()
  const allRows = []
  rows.forEach((r, i) => {
    allRows.push(r)
    const a = adjustByLot[r.lot]
    if (!a || (rows[i + 1] && rows[i + 1].lot === r.lot)) return
    allRows.push({
      date: adjDate, lot: r.lot, kind: ADJUST_KIND,
      qtyIn: a.diff > 0 ? a.diff : 0, qtyOut: a.diff < 0 ? -a.diff : 0,
      balance: masterByLot[r.lot] || 0,
      party: '', ref: a.reasons.map(x => x.note).filter(Boolean).join(' · '), exp: '',
      value: Math.abs(a.diff) * price, side: a.diff > 0 ? 'in' : 'out',
      noDeduct: false, preSystem: false, qtyBefore: null, balanceBefore: balByLot[r.lot],
      drift: null, hasDrift: false, driftDelta: null, isDriftPoint: false,
      qtyAfter: null, rowErr: null, hasRowErr: false, fromMigration: false, settled: false,
      adjust: true, adjustExplained: a.explained, adjustReasons: a.reasons,
    })
  })

  const lots = Object.keys(balByLot).sort((a, b) => a.localeCompare(b, 'th')).map(lot => {
    const lotRows = allRows.filter(r => r.lot === lot)
    const calcClosing = balByLot[lot]
    const masterQty = masterByLot ? (masterByLot[lot] || 0) : null
    const adj = adjustByLot[lot] || null
    const closing = adj ? masterQty : calcClosing
    // ตรง Master เลย หรือปรับแล้วอธิบายได้ → จุดไม่ตรงระหว่างทางเป็นสีเทา
    // ปรับแต่ไม่รู้สาเหตุ → คงจุดยอดไม่ตรงไว้ให้ไล่หาว่าของขาด/เกินตรงไหน
    if (masterByLot && (!adj || adj.explained)) for (const r of lotRows) if (r.isDriftPoint && !r.fromMigration) r.settled = true
    const driftRows = lotRows.filter(r => r.hasDrift)
    const driftPoints = lotRows.filter(r => r.isDriftPoint)
    const driftReal = driftPoints.filter(r => !r.fromMigration && !r.settled).length
    const rowErrCount = lotRows.filter(r => r.hasRowErr).length
    const negative = closing < 0
    return {
      lot,
      opening: openingByLot[lot],
      closing,                          // ปรับแล้ว = Master · ไม่ปรับ = ที่ไล่จากประวัติ
      calcClosing,                      // คงเหลือที่ไล่จากประวัติรับ-เบิก (ก่อนปรับ)
      hasReceipt: hasReceipt.has(lot),
      // มียอดตั้งต้น (ประวัติไม่ครบ) → หัว lot แสดงช่อง "ยอดตั้งต้นของ lot"
      hasOpening: backSolved.has(lot) || !hasReceipt.has(lot),
      negative,
      masterQty,                        // null = ไม่ได้เทียบ
      masterMismatch: !!adj,            // ไล่จากประวัติได้ ≠ Master → มีแถวปรับยอดท้าย lot
      adjustQty: adj ? adj.diff : 0,    // ยอดตั้งต้น + รับ − เบิก + ปรับ = คงเหลือ
      adjustExplained: adj ? adj.explained : false,
      driftCount: driftPoints.length,   // นับ "จุดที่ของหาย" ไม่ใช่ทุกแถวที่ drift ค้าง
      // drift ล่าสุดของ lot — ใช้บอกขนาดของช่องว่างรวม (บวก = ระบบคิดว่ามีมากกว่าที่บันทึก)
      lastDrift: driftRows.length ? driftRows[driftRows.length - 1].drift : 0,
      exp: lotExp(lotRows),
      // ไม่นับใบรับก่อนเริ่มระบบที่ไม่บวกยอด และแถวปรับยอด → ยอดตั้งต้น + รับ − เบิก + ปรับ = คงเหลือ เสมอ
      totalIn: lotRows.reduce((s, r) => s + (r.preSystem || r.adjust ? 0 : r.qtyIn), 0),
      // เฉพาะแถวที่หักยอดจริง (แถวบันทึกเท่านั้น ไม่นับ)
      totalOut: lotRows.reduce((s, r) => s + (r.noDeduct || r.adjust ? 0 : r.qtyOut), 0),
      driftReal,                                                          // ยอดไม่ตรงที่ต้องตรวจ
      driftMigration: driftPoints.filter(r => r.fromMigration).length,    // ข้อมูลก่อนเริ่มใช้ระบบ (สีเทา)
      driftSettled: driftPoints.filter(r => r.settled).length,            // ไม่ตรงระหว่างทาง คงเหลือตรง Master (สีเทา)
      rowErrCount,
      // ไม่ตรง Master อย่างเดียวไม่เตือนแล้ว (ปรับให้ตรงด้วยแถวท้าย lot) — ปรับแบบไม่รู้สาเหตุยังเหลือ driftReal ให้เตือน
      warn: driftReal > 0 || rowErrCount > 0 || negative,
    }
  })

  return {
    rows: allRows,
    lots,
    summary: {
      totalIn: allRows.reduce((s, r) => s + (r.preSystem || r.adjust ? 0 : r.qtyIn), 0),
      totalOut: allRows.reduce((s, r) => s + (r.adjust ? 0 : r.qtyOut), 0),
      lotCount: lots.length,
      negativeLots: lots.filter(l => l.negative).length,
      masterMismatchLots: lots.filter(l => l.masterMismatch).length,           // lot ที่มีแถวปรับยอด
      adjustUnexplainedLots: lots.filter(l => l.masterMismatch && !l.adjustExplained).length,
      driftLots: lots.filter(l => l.driftCount > 0).length,
      driftRows: rows.filter(r => r.isDriftPoint).length,   // จำนวนจุดที่ของหายจริง (รวม migration)
      // แยกจุดที่ "ต้องตรวจจริง" ออกจากจุดที่เกิดตอนย้ายข้อมูล Excel / ที่คงเหลือตรง Master แล้ว
      driftRowsReal: rows.filter(r => r.isDriftPoint && !r.fromMigration && !r.settled).length,
      driftRowsMigration: rows.filter(r => r.isDriftPoint && r.fromMigration).length,
      driftRowsSettled: rows.filter(r => r.settled).length,
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
  if (r.adjust) return 'ปรับยอดให้ตรง Master'
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

// บรรทัดอธิบายใต้แถวที่ยอดมีปัญหา → [{ type: 'drift'|'migration'|'settled'|'rowErr', text }]
// ใช้ร่วมจอ + ใบพิมพ์ ให้คำตรงกัน
export function rowIssues(r) {
  const out = []
  if (r.adjust) {
    const sign = r.qtyIn > 0 ? `+${fmt(r.qtyIn)}` : `−${fmt(r.qtyOut)}`
    const base = `ไล่จากประวัติรับ-เบิกได้ ${fmt(r.balanceBefore)} · Master มี ${fmt(r.balance)} (${sign})`
    out.push({
      type: 'adjust',
      text: r.adjustExplained
        ? `ปรับให้ตรง Master: ${base} — Master มีแถว${[...new Set(r.adjustReasons.map(a => a.kind))].join('/')} ที่ไม่มีในชีทรับยา`
        : `ปรับให้ตรง Master: ${base} — ยังไม่ทราบสาเหตุจากข้อมูลในระบบ (ตรวจกับบิล/ใบเบิกจริงได้)`,
    })
    return out
  }
  if (r.preSystem) {
    out.push({ type: 'migration', text: 'รับก่อนเริ่มใช้ระบบ (ก่อน ต.ค.68): ไม่บวกเข้าคงเหลือ เพราะยอดตั้งต้นของ lot นับของที่เหลือ ณ วันเริ่มระบบไว้แล้ว — การเบิกก่อน ต.ค.68 ไม่มีในระบบ' })
  }
  if (r.isDriftPoint) {
    const gap = r.driftDelta > 0 ? 'ขาดไป' : 'เกินมา'
    const head = `ชีทเบิกบันทึกว่าก่อนเบิกเหลือ ${fmt(r.qtyBefore)} แต่ไล่จากประวัติได้ ${fmt(r.balanceBefore)}`
    if (r.drift === 0) {
      // ผลต่างของแถวก่อนหน้าหายไป — ยอดกลับมาตรง (ยังนับเป็นจุดเปลี่ยน แต่คำ "ขาดไป/เกินมา" จะชวนงง)
      const prev = r.drift - r.driftDelta
      out.push({
        type: r.fromMigration ? 'migration' : r.settled ? 'settled' : 'drift',
        text: `ยอดกลับมาตรงกัน: ชีทเบิกบันทึกว่าก่อนเบิกเหลือ ${fmt(r.qtyBefore)} ตรงกับที่ไล่จากประวัติ — ผลต่าง ${fmt(Math.abs(prev))} ของแถวก่อนหน้าหายไประหว่างทาง`,
      })
    } else if (r.fromMigration) {
      out.push({ type: 'migration', text: `ข้อมูลก่อนเริ่มใช้ระบบ: ${head} — ประวัติก่อน ต.ค.68 ไม่ได้นำเข้า ไม่ใช่ของหาย` })
    } else if (r.settled) {
      out.push({ type: 'settled', text: `ไม่ตรงระหว่างทาง: ${head} — แต่คงเหลือของ lot ตอนนี้ตรงกับ Master ไม่ใช่ของหาย (มักเกิดจาก lot เดียวแยกหลายแถวในชีทเบิก)` })
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
