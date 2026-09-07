// vendorExchange.js — รอบเปลี่ยน/คืนบริษัท: จับคู่ "ขาส่งออก" กับ "ขารับทดแทน" หาของที่ยังค้าง
// pure module — ห้าม import supabase (รัน golden test ใน node ได้: npm run test:vendorexchange)
//
// ที่มา (CONTEXT.md §รอบเปลี่ยน/คืนบริษัท): คลังรวบรวมยามีปัญหาส่งคืนบริษัท แล้วรอของทดแทน
// 2 ขาบันทึกคนละตาราง และ **lot มักเปลี่ยนระหว่างทาง** (ส่ง NP26099A → ได้ NP26101A คืน)
// จึงจับคู่ด้วย lot ไม่ได้ → ใช้ รหัสยา + บริษัท + ลำดับเวลา
//
// จับคู่ 2 ชั้น (ADR-0024):
//   1) **เลขที่รอบ VX** ที่คลังเขียนบนใบส่งคืน/ใบรับกลับ — เป็นข้อเท็จจริงจากเอกสาร
//      ฝั่งจ่ายออกอ่านจาก note · ฝั่งรับเข้าอ่านจากช่องเลขที่บิล (ดู vendorExchangeCycle.js)
//      จับข้ามรหัสยาได้ — ของชดเชยมักเป็นยาคนละตัว ซึ่งชั้น 2 จับไม่ได้เลย
//   2) เดาจาก รหัสยา + บริษัท + ลำดับเวลา — สำหรับรอบเก่าก่อนเริ่มใช้เลขรอบ
//
// ⚠️ เฉพาะแถวที่ `matchedBy: 'guess'` ยังเป็น "ตัวช่วยเตือน" ที่อาจคลาดได้เมื่อมีหลายรอบ
// ซ้อนกันในยาเดียวกัน — ผู้ใช้ต้อง verify กับเอกสารจริง ส่วน `'vx'` ยืนยันแล้วจากกระดาษ

// ชนิดรายการฝั่งจ่ายออกที่ถือเป็น "ส่งคืน/แลกเปลี่ยนกับบริษัท"
const OUT_KINDS = new Set(['แลกเปลี่ยนยา', 'คืนยา', 'คืนยา(2)', 'คืนยา(3)'])

// เลขบิลฝั่งรับที่บ่งชี้ว่าเป็น "ของทดแทน/คืนกลับ" ไม่ใช่การซื้อปกติ
const RETURN_BILL_RE = /คืน|ยืม|แลกเปลี่ยน|เปลี่ยนหมดอายุ/

// note ที่บอกว่าแถวนั้นเป็น "การแก้ข้อมูลย้อนหลัง" ไม่ใช่ของที่ส่งออกจริง
// (เคสจริง Carvedilol: "เบิกไป วันที่ 25/5 ระบบผิดพลาด" = แถวชดเชย ไม่ใช่รอบใหม่)
const CORRECTION_RE = /ผิดพลาด|แก้ไข|ซ้ำ|ยกเลิก/

// note ที่บอกว่ายัง "ไม่ได้ส่งของออกไปจริง" — รอของจากบริษัทอยู่
// (เคสจริง Omeprazole: "เบิก 400 จ่าย 0 รอแลกเปลี่ยนยาจากบริษัท")
const PENDING_RE = /รอ(แลกเปลี่ยน|ของ|บริษัท)/

// เลขที่รอบ VX ที่คลังออกเองบนใบส่งคืน/ใบรับกลับ (ดู vendorExchangeCycle.js)
// รูปแบบ VX-<ปี พ.ศ. 2 หลัก><เดือน 2 หลัก>-<ลำดับ> เช่น VX-6909-001
// รับทั้ง VX-6909-001 / VX 6909-001 / vx6909-001 — คนเขียนมือ เว้นวรรคไม่แน่นอน
const VX_RE = /VX[\s-]*(\d{3,4}[\s-]*\d{1,4})/i

// ดึงเลข VX จากข้อความ (note ฝั่งจ่ายออก / เลขที่บิลฝั่งรับเข้า) → คืน key ปกติ
// null = ไม่มีเลข VX ในข้อความนั้น (ของเก่าก่อนใช้ระบบเลขรอบ)
export function parseVxNo(text) {
  const m = VX_RE.exec(String(text ?? ''))
  if (!m) return null
  return `vx-${m[1].replace(/[\s-]/g, '')}`
}

const toNum = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

// วันที่ ISO/DD-MM-YYYY → epoch (พ.ศ. → ค.ศ. อัตโนมัติ)
export function dateKey(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return 0
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3])
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (dmy) {
    let y = +dmy[3]
    if (y > 2500) y -= 543
    return Date.UTC(y, +dmy[2] - 1, +dmy[1])
  }
  return 0
}

const dayDiff = (a, b) => Math.round((a - b) / 86400000)

/**
 * buildVendorExchanges({ dispenseRows, receiveRows, supplierByLot, today })
 *   → { open, matched, summary }
 *
 * open    = ของลอย: ส่งคืนแล้วยังไม่ได้ของทดแทน [{ ...out, daysWaiting }]
 * matched = จับคู่ได้แล้ว [{ ...out, returnedQty, returnedAt, returnLot, daysToReturn }]
 *
 * supplierByLot = { 'code|lot' → บริษัท } — ฝั่งจ่ายออกไม่มีคอลัมน์บริษัท
 *                 ต้อง resolve จาก receive_logs (ADR-0012 per-lot supplier)
 */
export function buildVendorExchanges({
  dispenseRows = [], receiveRows = [], supplierByLot = {}, today = new Date(),
} = {}) {
  const todayKey = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const lotKey = (code, lot) => `${String(code ?? '').trim().toLowerCase()}|${String(lot ?? '-').trim().toLowerCase() || '-'}`

  // ── ขาส่งออก ──
  const outs = []
  for (const d of dispenseRows) {
    const kind = String(d.item_type || '').trim()
    if (!OUT_KINDS.has(kind)) continue
    const note = String(d.note || '')
    const qty = toNum(d.qty_out)
    // กรองแถวที่ไม่ใช่การส่งออกจริง — ไม่งั้นนับของลอยเกิน
    if (qty <= 0) continue                    // "เบิก 400 จ่าย 0 รอแลกเปลี่ยน" = ยังไม่ส่ง
    if (CORRECTION_RE.test(note)) continue    // แถวแก้ข้อมูลย้อนหลัง ไม่ใช่รอบใหม่
    if (PENDING_RE.test(note)) continue
    const code = String(d.drug_code || '').trim()
    outs.push({
      code,
      name: d.drug_name || '',
      lot: String(d.lot || '-').trim() || '-',
      kind,
      qty,
      date: d.dispense_date || '',
      dateKey: dateKey(d.dispense_date),
      party: d.department || '',
      note,
      company: supplierByLot[lotKey(code, d.lot)] || '',
      // เลขรอบจาก note (คลังเขียนตอนบันทึก) — มี = จับคู่ได้แน่นอน ไม่ต้องเดา
      vxNo: parseVxNo(note),
    })
  }

  // ── ขารับทดแทน (บิลที่บ่งชี้ว่าเป็นของคืน ไม่ใช่ซื้อปกติ) ──
  const ins = []
  for (const r of receiveRows) {
    const bill = String(r.bill_number || '')
    // เลขรอบ VX ในช่องเลขที่บิล = ของคืนแน่นอน (ใบรับกลับสั่งให้เขียนไว้ตรงนี้)
    // ต้องเช็คก่อน RETURN_BILL_RE เพราะ "VX-6909-001" ไม่มีคำว่า คืน/แลกเปลี่ยน จะถูกกรองทิ้ง
    const vxNo = parseVxNo(bill)
    if (!vxNo && !RETURN_BILL_RE.test(bill)) continue
    const qty = toNum(r.qty_received)
    if (qty <= 0) continue
    ins.push({
      code: String(r.drug_code || '').trim(),
      lot: String(r.lot || '-').trim() || '-',
      qty,
      date: r.receive_date || '',
      dateKey: dateKey(r.receive_date),
      bill,
      vxNo,
      company: String(r.supplier_current || '').trim(),
      _used: false,
    })
  }

  outs.sort((a, b) => a.dateKey - b.dateKey)
  ins.sort((a, b) => a.dateKey - b.dateKey)

  // ── จับคู่ 2 ชั้น ──
  // ชั้น 1 **เลขที่รอบ VX** — คนเขียนไว้บนเอกสาร = ข้อเท็จจริง ไม่ใช่การเดา (ADR-0024)
  //   จับข้ามรหัสยาได้ เพราะของชดเชยมักเป็นยาคนละตัว (52% ของเคสจริง เช่น ABCA:
  //   คืน Lidocaine Viscous → ได้ Racser Viscous) ซึ่งชั้น 2 จับไม่ได้เลย
  // ชั้น 2 **เดาจาก รหัส+บริษัท+เวลา** — ของเก่าก่อนมีเลขรอบ ยังต้องใช้ต่อได้
  const open = []
  const matched = []
  const pushMatched = (o, cand, how) => {
    cand._used = true
    matched.push({
      ...o,
      returnedQty: cand.qty,
      returnedAt: cand.date,
      returnLot: cand.lot,
      returnBill: cand.bill,
      returnCode: cand.code,
      lotChanged: cand.lot !== o.lot,
      // ของที่ได้คืนเป็นยาคนละรหัส = ของชดเชย ไม่ใช่ยาเดิม
      drugChanged: !!cand.code && cand.code !== o.code,
      daysToReturn: dayDiff(cand.dateKey, o.dateKey),
      // จำนวนไม่เท่ากัน = ได้คืนไม่ครบ/เกิน — ต้องให้คนดู
      qtyMismatch: cand.qty !== o.qty,
      matchedBy: how,          // 'vx' = ยืนยันจากเอกสาร · 'guess' = อนุมานเอง
      vxNo: o.vxNo || cand.vxNo || null,
    })
  }

  for (const o of outs) {
    // ชั้น 1: เลขรอบตรงกัน — ไม่สนรหัสยา/บริษัท/ลำดับเวลา เพราะเอกสารยืนยันแล้ว
    const byVx = o.vxNo ? ins.find(i => !i._used && i.vxNo === o.vxNo) : null
    if (byVx) { pushMatched(o, byVx, 'vx'); continue }

    // ชั้น 2: เดาแบบเดิม — greedy ตามเวลา ขาออกเก่าสุดได้คู่ที่ใกล้ที่สุดก่อน
    // ข้ามขาเข้าที่มีเลข VX อยู่แล้ว: มันจองไว้ให้รอบที่ระบุ ไม่ควรถูกเดาไปใช้ผิดรอบ
    const cand = ins.find(i =>
      !i._used &&
      !i.vxNo &&
      i.code === o.code &&
      i.dateKey >= o.dateKey &&
      (!o.company || !i.company || i.company === o.company)
    )
    if (cand) {
      pushMatched(o, cand, 'guess')
    } else {
      open.push({ ...o, daysWaiting: dayDiff(todayKey, o.dateKey) })
    }
  }

  // ค้างนานสุดขึ้นก่อน (ทวงด่วนสุด)
  open.sort((a, b) => b.daysWaiting - a.daysWaiting)
  matched.sort((a, b) => b.dateKey - a.dateKey)

  return {
    open,
    matched,
    summary: {
      openCount: open.length,
      openQty: open.reduce((s, o) => s + o.qty, 0),
      matchedCount: matched.length,
      lotChangedCount: matched.filter(m => m.lotChanged).length,
      qtyMismatchCount: matched.filter(m => m.qtyMismatch).length,
      // ยืนยันจากเลขรอบบนเอกสาร vs อนุมานเอง — ตัวหลังคือส่วนที่ยัง "ต้อง verify กับเอกสารจริง"
      vxMatchedCount: matched.filter(m => m.matchedBy === 'vx').length,
      guessMatchedCount: matched.filter(m => m.matchedBy === 'guess').length,
      drugChangedCount: matched.filter(m => m.drugChanged).length,
      oldestWaitingDays: open.length ? open[0].daysWaiting : 0,
    },
  }
}
