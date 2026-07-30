// vendorExchange.js — รอบเปลี่ยน/คืนบริษัท: จับคู่ "ขาส่งออก" กับ "ขารับทดแทน" หาของที่ยังค้าง
// pure module — ห้าม import supabase (รัน golden test ใน node ได้: npm run test:vendorexchange)
//
// ที่มา (CONTEXT.md §รอบเปลี่ยน/คืนบริษัท): คลังรวบรวมยามีปัญหาส่งคืนบริษัท แล้วรอของทดแทน
// 2 ขาบันทึกคนละตาราง และ **lot มักเปลี่ยนระหว่างทาง** (ส่ง NP26099A → ได้ NP26101A คืน)
// จึงจับคู่ด้วย lot ไม่ได้ → ใช้ รหัสยา + บริษัท + ลำดับเวลา
//
// ⚠️ เป็น "ตัวช่วยเตือน" ไม่ใช่ทะเบียนที่ถูก 100% — ไม่มี key ผูก 2 ขาในข้อมูลต้นทาง
// ถ้ามีหลายรอบซ้อนกันในยาเดียวกัน อาจจับคู่คลาดได้ ผู้ใช้ต้อง verify กับเอกสารจริง

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
    })
  }

  // ── ขารับทดแทน (บิลที่บ่งชี้ว่าเป็นของคืน ไม่ใช่ซื้อปกติ) ──
  const ins = []
  for (const r of receiveRows) {
    const bill = String(r.bill_number || '')
    if (!RETURN_BILL_RE.test(bill)) continue
    const qty = toNum(r.qty_received)
    if (qty <= 0) continue
    ins.push({
      code: String(r.drug_code || '').trim(),
      lot: String(r.lot || '-').trim() || '-',
      qty,
      date: r.receive_date || '',
      dateKey: dateKey(r.receive_date),
      bill,
      company: String(r.supplier_current || '').trim(),
      _used: false,
    })
  }

  outs.sort((a, b) => a.dateKey - b.dateKey)
  ins.sort((a, b) => a.dateKey - b.dateKey)

  // ── จับคู่: รหัสยาเดียวกัน + ขาเข้าเกิด "หลัง" ขาออก + บริษัทตรง (ถ้ารู้) ──
  // greedy ตามเวลา: ขาออกที่เก่าที่สุดได้จับคู่กับขาเข้าที่ใกล้ที่สุดก่อน
  const open = []
  const matched = []
  for (const o of outs) {
    const cand = ins.find(i =>
      !i._used &&
      i.code === o.code &&
      i.dateKey >= o.dateKey &&
      (!o.company || !i.company || i.company === o.company)
    )
    if (cand) {
      cand._used = true
      matched.push({
        ...o,
        returnedQty: cand.qty,
        returnedAt: cand.date,
        returnLot: cand.lot,
        returnBill: cand.bill,
        lotChanged: cand.lot !== o.lot,
        daysToReturn: dayDiff(cand.dateKey, o.dateKey),
        // จำนวนไม่เท่ากัน = ได้คืนไม่ครบ/เกิน — ต้องให้คนดู
        qtyMismatch: cand.qty !== o.qty,
      })
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
      oldestWaitingDays: open.length ? open[0].daysWaiting : 0,
    },
  }
}
