// ใบเบิกออนไลน์ → แผนลงชีท 'เบิก ' (เฟส 1 ขั้น 4 — scripts/online-req.mjs)
// pure module: ไม่ import supabase → golden-testable (npm run test:onlinereq)
//
// 1 รายการในใบ → แถวเบิก 1..n แถว (1 แถว = 1 แถว Master = lot+ราคา+ชนิดรายการเดียว · ห้ามปน packsize)
// ลำดับจ่าย = sortLotsForDispense (ยาซื้อ exp ≤6 เดือน → ยาสนับสนุน → FEFO) · exp เท่ากัน/ไม่มี exp = รับก่อนจ่ายก่อน
// ข้าม: แถวรอตรวจรับ · หมดอายุแล้ว · U ≤ 0 · ของไม่พอ = จ่ายเท่าที่มี + W/X + หมายเหตุ (/dispense-entry)
// หมายเหตุที่ต้องให้คนเติม (วันแจ้งสั่งซื้อ) ใส่ PLACEHOLDER — ตัวเขียนชีทปฏิเสธถ้ายังเหลือ

import { allocateFefo, sortLotsForDispense, lotOrderNote } from './lotAllocation.js'
import { parseUnit } from './unitParser.js'

export const PLACEHOLDER = '[วันแจ้งสั่งซื้อ?]'

const txt = (v) => String(v ?? '').trim()
const num = (v) => Number(v) || 0

// หน่วยงานบัญชีผู้ใช้ ("ห้องยา G") → ชื่อในชีทเบิก ("ห้องยาG") — กฎเดียวกับ normDept
export const sheetDept = (d) => txt(d).replace(/\s*\(.*?\)\s*/g, '').replace(/\s+/g, '')

// วันที่พ.ศ. วว/ดด/ปปปป
export const fmtThai = (d) => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}` : ''

const addMonths = (today, n) => {
  const t = new Date(today); t.setHours(0, 0, 0, 0)
  const last = new Date(t.getFullYear(), t.getMonth() + n + 1, 0).getDate()
  return new Date(t.getFullYear(), t.getMonth() + n, Math.min(t.getDate(), last))
}

/**
 * @param req   { req_number, department, req_type, items: [{ id, drug_code, drug_name, requested_qty, approved_qty }] }
 *              requested_qty = หน่วยย่อยสุด (เหมือนแอป)
 * @param master [{ row, status, location, mainLog, code, name, unit, price, lot, exp, expDate, itemType, u, receiveDate, invoice, result }]
 *              exp = ข้อความเดียวกับ inventory.exp · expDate = Date|null · u = คงเหลือหลังจ่าย (หน่วย Master) · receiveDate = ตัวเลขเรียงได้
 * @returns { dept, lines: [แถวเบิก], items: [{ itemId, allocation, approved, picked, flags, note }], flags: [] }
 */
export function planRequisition(req, master, { today = new Date() } = {}) {
  const t0 = new Date(today); t0.setHours(0, 0, 0, 0)
  const expSoon = addMonths(t0, 7)
  const dept = sheetDept(req.department)
  const lines = []
  const items = []
  const usedRows = new Set()

  const byCode = {}
  for (const m of master) (byCode[txt(m.code)] ||= []).push(m)

  for (const it of req.items || []) {
    const code = txt(it.drug_code)
    const rows = (byCode[code] || []).slice().sort((a, b) => num(a.receiveDate) - num(b.receiveDate))
    const flags = []
    const want = Math.max(0, Math.floor(num(it.approved_qty ?? it.requested_qty)))
    if (!rows.length) {
      items.push({ itemId: it.id, code, name: it.drug_name, allocation: [], approved: want, picked: 0, flags: ['ไม่พบรหัสใน Master — ถาม user'], skip: true })
      continue
    }
    const isPending = (m) => txt(m.status).includes('รอตรวจรับ')
    const isExpired = (m) => m.expDate && m.expDate < t0
    const pending = rows.filter(isPending)
    const pendingQty = pending.reduce((s, m) => s + num(m.u), 0)
    const pendingBills = [...new Set(pending.map(m => txt(m.invoice)).filter(Boolean))]
    const avail = rows.filter(m => !isPending(m) && !isExpired(m) && num(m.u) > 0 && !usedRows.has(m.row))
    if (rows.some(m => txt(m.result).includes('ตัดออก'))) flags.push('ยาตัดออกจากบัญชี')
    if (code === '1000135') flags.push('Folic: ตรวจกฎ lot เซ็นทรัล/GPO (memory folic-central-lot-first)')

    const lots = avail.map(m => {
      const { packSize, baseUnit } = parseUnit(m.unit)
      const ps = packSize || 1
      return { row: m.row, lot: txt(m.lot), exp: m.exp, unit: m.unit, location: m.location, itemType: txt(m.itemType),
        baseUnit: baseUnit || m.unit, packSize: ps, packs: num(m.u), base: num(m.u) * ps, src: m }
    })
    const ordered = sortLotsForDispense(lots, (e) => lots.find(l => l.exp === e)?.src.expDate || null, t0)
    const alloc = allocateFefo(want, ordered)
    const orderNote = lotOrderNote(alloc.allocation, ordered, (e) => ordered.find(l => l.exp === e)?.src.expDate || null,
      (e) => fmtThai(ordered.find(l => l.exp === e)?.src.expDate || null) || e)

    // allocateFefo ไม่คืนแถว — จับคู่กลับตามลำดับ (lot+exp ซ้ำได้หลายแถว → เดินตามลำดับ ordered)
    const taken = []
    {
      const pool = ordered.map(l => ({ ...l }))
      for (const a of alloc.allocation) {
        const l = pool.find(p => p.lot === a.lot && p.exp === a.exp && p.packSize === a.packSize && p.packs >= a.packs && !p.used)
        if (!l) throw new Error(`จับคู่แถว Master ไม่ได้: ${code} lot ${a.lot}`)
        l.used = true
        taken.push({ l, packs: a.packs, base: a.base })
      }
    }

    const unitOf = (rows[0] && rows[0].unit) || ''
    const wantPacks = (() => { const ps = parseUnit(unitOf).packSize || 1; return Math.ceil(want / ps) })()
    const lotTotalAfter = (lot) => avail.filter(m => txt(m.lot) === lot).reduce((s, m) => s + num(m.u), 0)
      - taken.filter(x => x.l.lot === lot).reduce((s, x) => s + x.packs, 0)
    const codeTotalAfter = avail.reduce((s, m) => s + num(m.u), 0) - taken.reduce((s, x) => s + x.packs, 0)

    const itemLines = taken.map(({ l, packs, base }) => {
      usedRows.add(l.row)
      const m = l.src
      const notes = []
      const after = num(m.u) - packs
      const lotLeft = lotTotalAfter(l.lot)
      if (lotLeft !== after) notes.push(`lot ${l.lot} ยังเหลือ ${lotLeft} · คงคลังรวม ${codeTotalAfter}`)
      else if (after === 0 && codeTotalAfter > 0) {
        const others = [...new Set(avail.filter(x => txt(x.lot) !== l.lot).map(x => txt(x.lot)))]
        notes.push(`lot ${l.lot} หมด · คงคลังรวม ${codeTotalAfter}${others.length ? ` (lot ${others.join(', ')})` : ''}`)
      }
      if (m.expDate && m.expDate < expSoon) notes.push(`exp ${fmtThai(m.expDate)} ใกล้หมดอายุ`)
      return { masterRow: m.row, key: `${code}|${txt(m.lot)}|${txt(m.itemType)}`, price: num(m.price), u: num(m.u), q: packs, base,
        no: null, dept, notes, w: null, x: null, lot: l.lot, exp: m.exp, unit: m.unit, packSize: l.packSize, baseUnit: l.baseUnit,
        location: m.location, itemType: txt(m.itemType) }
    })

    // ของไม่พอ / ไม่มีให้จ่าย
    if (alloc.shortfallBase > 0) {
      const given = taken.reduce((s, x) => s + x.packs, 0)
      let x, tail
      if (pendingQty > 0) {
        x = 'รอตรวจรับ'
        tail = `รอตรวจรับ ${pendingQty} (บิล ${pendingBills.join(', ') || '-'})`
      } else if (given > 0) {
        x = 'ของไม่พอ'
        tail = `ยาหมด เหลือ 0 · ${PLACEHOLDER}`
      } else {
        x = 'ยาหมด-รอของส่ง'
        tail = PLACEHOLDER
      }
      const head = `เบิก ${wantPacks} จ่าย ${given}`
      if (itemLines.length) {
        const last = itemLines[itemLines.length - 1]
        last.w = wantPacks; last.x = x; last.notes.unshift(`${head} · ${tail}`)
      } else {
        // จ่าย 0: อ้างแถว Master ของรหัสนี้ (แถวรอตรวจรับก่อน ไม่งั้นแถวล่าสุด) N=0
        const ref = pending[pending.length - 1] || rows[rows.length - 1]
        itemLines.push({ masterRow: ref.row, key: `${code}|${txt(ref.lot)}|${txt(ref.itemType)}`, price: num(ref.price), u: num(ref.u), q: 0, base: 0,
          no: null, dept, notes: [`${head} · ${tail}`], w: wantPacks, x, lot: txt(ref.lot), exp: ref.exp, unit: ref.unit,
          packSize: parseUnit(ref.unit).packSize || 1, baseUnit: parseUnit(ref.unit).baseUnit || ref.unit, location: ref.location,
          itemType: txt(ref.itemType), zero: true })
      }
      flags.push(`จ่ายไม่ครบ ${x}`)
    } else if (pendingQty > 0 && itemLines.length) {
      itemLines[itemLines.length - 1].notes.push(`รอตรวจรับอีก ${pendingQty} (บิล ${pendingBills.join(', ') || '-'})`)
    }
    if (orderNote && itemLines.length) itemLines[0].notes.push(orderNote)
    if (alloc.overBase > 0) flags.push(`ปัดเต็มหน่วยบรรจุ เกินที่ขอ ${alloc.overBase}`)
    if (taken.length > 1) flags.push(`แตก ${taken.length} แถว`)

    for (const ln of itemLines) { ln.itemId = it.id; ln.note = ln.notes.join(' · ') }
    lines.push(...itemLines)

    // picked_allocation ให้แอป (PickingModal/VerifyModal/ใบ lot คุม ใช้ตามชีท)
    const onhandOf = (lot, packSize) => avail.filter(m => txt(m.lot) === lot).reduce((s, m) => s + num(m.u), 0) * packSize
    const allocation = itemLines.filter(l => !l.zero).map(l => ({
      lot: l.lot, exp: l.exp, base: l.base, packs: l.q, packSize: l.packSize, unit: l.unit, baseUnit: l.baseUnit,
      location: l.location, price_per_unit: l.price, onhand: onhandOf(l.lot, l.packSize),
    }))
    items.push({ itemId: it.id, code, name: it.drug_name, allocation, approved: want,
      picked: allocation.reduce((s, a) => s + a.base, 0), flags, staffNote: itemLines.map(l => l.note).filter(Boolean).join(' · ') || null })
  }

  return { dept, lines, items, flags: items.filter(i => i.flags.length).map(i => `${i.code} ${i.name}: ${i.flags.join(' · ')}`) }
}
