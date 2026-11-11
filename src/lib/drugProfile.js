// drugProfile.js — บัตรยา + ช่องค้นหายา (Phase 2a ของแผน Dashboard 10/10/2569) — pure module (no supabase)
// นิยาม: CONTEXT.md §บัตรยา (Drug Profile) · §คงเหลือรวม (ระดับยา)
//
// กฎตัวเลขต้องตรงกับหน้าอื่นของระบบ (Rule #6) — ฟังก์ชันที่นี่จึงถูกใช้ร่วมกับ db.js:
//   stockTotalInMainUnit  = ยอดรวมของโมดอล "รายการยาในคลัง" (fetchStockSummary)
//   isBelowSafetyStock    = เกณฑ์ "ต่ำกว่า Safety Stock" ของ Dashboard (fetchDashboardAlerts.lowStock — Rule #13)
//   isPurchaseReceipt     = บิล "การซื้อ" ที่ใช้เลือกหน่วยซื้อล่าสุด (fetchLatestReceiptInfo / ReorderApp)
//   parseExpDate / parseUnitFactor = ตัวเดียวกับที่ db.js ใช้ (ย้ายมาที่นี่ให้ node รัน test ได้)

import { computeStats, fmtCoverage, thaiMonthLabel } from './reorder.js'
import { computeReturnStatus, parseReturnPolicyV2, computeReturnStatusV2 } from './swapPolicy.js'

const toNum = (v) => parseFloat(String(v ?? '0').replace(/,/g, '')) || 0

// "450ml" → { factor: 450, base: 'ml' } · "vial" → { factor: 1, base: 'vial' }
export const parseUnitFactor = (unit) => {
  const m = String(unit || '').match(/^(\d+)\s*(.+)$/)
  if (m) return { factor: parseInt(m[1]), base: m[2].trim() }
  return { factor: 1, base: String(unit || '-').trim() }
}

// ป้ายหน่วยสำหรับแสดงผล — inventory.unit เก็บหน่วยซื้อแบบ <ขนาดบรรจุ><หน่วยย่อย> ("200เม็ด" = กล่องละ 200 เม็ด)
// "18 200เม็ด" อ่านไม่ออก → "18 กล่อง (200 เม็ด)" · คำว่า "กล่อง" ตามหน้าเบิกยา (lotPackLabel) ให้ทั้งระบบพูดเหมือนกัน
// แสดงผลอย่างเดียว — ห้ามใช้ค่านี้คำนวณ (ตัวคูณยังมาจาก parseUnitFactor)
// เลขนำหน้าที่เป็นปริมาตร/น้ำหนัก (450ml, 50gm) = ขนาดของภาชนะ 1 ชิ้น ไม่ใช่กล่องละ N ชิ้น
// (user 20/10/2569: "1 ขวด = 450ml" — Povidine/OliveOil 450ml เคยขึ้น "กล่อง (450 ml)")
const VOLUME_BASE = /^(ml|มล\.?|cc|l|ลิตร)$/i
const WEIGHT_BASE = /^(gm|g|กรัม|kg)$/i
export function packWord(unit) {
  const { base } = parseUnitFactor(unit)
  if (VOLUME_BASE.test(base)) return 'ขวด'
  if (WEIGHT_BASE.test(base)) return 'ชิ้น'
  return 'กล่อง'
}
export function packUnitLabel(unit) {
  const { factor, base } = parseUnitFactor(unit)
  if (factor > 1) return `${packWord(unit)} (${factor.toLocaleString('en-US')} ${base})`
  return String(unit || '-').trim() || '-'
}

// วันหมดอายุของ inventory (DD/MM/YYYY ค.ศ. เป็นหลัก) → Date เที่ยงคืน local · อ่านไม่ได้ = null
export function parseExpDate(raw) {
  if (!raw || raw === '-' || String(raw).trim() === '') return null
  const s = String(raw).trim()
  // DD/MM/YYYY หรือ D/M/YYYY
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m1) {
    let [, d, mo, y] = m1.map(Number)
    if (y < 100) y += 2000
    if (y > 2500) y -= 543
    const dt = new Date(y, mo - 1, d)
    return isNaN(dt) ? null : dt
  }
  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m2) {
    let [, y, mo, d] = m2.map(Number)
    if (y > 2500) y -= 543
    const dt = new Date(y, mo - 1, d)
    return isNaN(dt) ? null : dt
  }
  // MM/YYYY หรือ MM-YYYY (ไม่มีวัน → ใช้วันสุดท้ายของเดือน)
  const m3 = s.match(/^(\d{1,2})[/-](\d{4})$/)
  if (m3) {
    let [, mo, y] = m3.map(Number)
    if (y > 2500) y -= 543
    const dt = new Date(y, mo, 0)
    return isNaN(dt) ? null : dt
  }
  return null
}

// "รอตรวจรับมา N วัน" — ใช้ร่วม Dashboard (คิว "รอตรวจรับเกิน 14 วัน") · หน้าตรวจนับ · บัตรยา ห้ามแยกสูตร
// receive_date เป็นชนิด date ('YYYY-MM-DD') → อ่านเป็นเที่ยงคืน local
// (เดิม new Date('YYYY-MM-DD') = เที่ยงคืน UTC = 07:00 ไทย → นับขาด 1 วันทุกจุด — แก้ 11/10/2569)
export function waitDaysSince(receiveIso, today0) {
  if (!receiveIso) return null
  const d = parseExpDate(String(receiveIso).slice(0, 10)) || new Date(receiveIso)
  return Math.floor((today0 - d) / 86400000)
}

export const isDiscontinuedRow = (row) => String(row?.receive_status || '').includes('ตัดออก')
export const isPendingRow = (row) => String(row?.receive_status || '').includes('รอตรวจรับ')

// บิลการซื้อจริง (ไม่ใช่บริจาค/ยืม/คืน และราคา > 0) — หน่วยของบิลนี้คือ "หน่วยซื้อล่าสุด"
const PURCHASE_TYPE = 'การซื้อ'
export const isPurchaseReceipt = (row) =>
  toNum(row?.price_per_unit) > 0 && String(row?.purchase_type || '').trim() === PURCHASE_TYPE

// หน่วยซื้อล่าสุดจากแถว receive_logs ของยา 1 รหัส — **rows ต้องเรียง receive_date ใหม่→เก่า, id ใหม่→เก่า แล้ว**
// (ลำดับเดียวกับ fetchLatestReceiptInfo — เรียงฝั่ง DB)
export function latestPurchaseUnit(sortedReceiveRows = []) {
  const hit = sortedReceiveRows.find(r => isPurchaseReceipt(r) && r.drug_unit)
  return hit ? hit.drug_unit : null
}

// หน่วยหลักที่ใช้แสดงยอดรวม = หน่วยซื้อล่าสุด → ไม่มีบิลซื้อ = หน่วยของแถวแรกที่มีของ (กฎ fetchStockSummary)
export function pickMainUnit(purchaseUnit, stockRows = []) {
  return purchaseUnit || stockRows[0]?.unit || '-'
}

// ยอดรวมระดับยา: Σ(qty × packsize ของแถว) ÷ packsize หน่วยหลัก แล้วปัดขึ้น — ตัวเดียวกับโมดอล "รายการยาในคลัง"
export function stockTotalInMainUnit(stockRows = [], mainUnit) {
  const main = parseUnitFactor(mainUnit)
  let base = 0
  for (const r of stockRows) base += toNum(r.qty) * parseUnitFactor(r.unit).factor
  return Math.ceil(main.factor > 0 ? base / main.factor : base)
}

// แถวที่นับเข้ายอดคงเหลือของบัตรยา/ช่องค้นหา: qty > 0 — **รวมแถวตัดออกจากบัญชี**
// ตัดออก = เลิกสั่งซื้อ ไม่ใช่ของหายจากคลัง: ของที่เหลือยังจ่ายต่อจนหมด (หน้าเบิกไม่บล็อก) ต้องเห็นยอด/lot/ที่เก็บ
// (16/10/2569 — Cefdinir 1660111 ของจริง 60 ขวด บัตรขึ้น 0 + "ไม่มีของในคลัง") · โมดอลรายการยาในคลังไม่แสดงยาตัดออกเลย
// จึงไม่มียอดของรหัสนี้ให้ขัดกัน · Dashboard นับด้วยกฎของตัวเองใน db.js (ไม่ได้ใช้ฟังก์ชันนี้)
export const isStockRow = (row) => toNum(row?.qty) > 0

// ── ต่ำกว่า Safety Stock (กฎ Dashboard) ─────────────────────────────────
// รวม qty ดิบทุกแถวของรหัส (ไม่แปลงหน่วย · นับรอตรวจรับ/หมดอายุด้วย) เทียบ SS สูงสุดของรหัส
// ยาตัดออกจากบัญชี / config 'ตัดออก' / 'สั่งเมื่อขอ' ไม่นับ
export function ssAggregate(rows = []) {
  let qty = 0, ss = 0, discontinued = false
  for (const r of rows) {
    qty += parseFloat(r.qty) || 0
    const s = r.safety_stock != null ? parseFloat(r.safety_stock) : 0
    if (s > ss) ss = s
    if (isDiscontinuedRow(r)) discontinued = true
  }
  return { qty, ss, discontinued }
}
export function isBelowSafetyStock({ qty, ss, discontinued }, excludeStatus) {
  if (discontinued) return false
  if (excludeStatus === 'ตัดออก' || excludeStatus === 'สั่งเมื่อขอ') return false
  return ss > 0 && qty < ss
}

// ── ช่องค้นหายา ─────────────────────────────────────────────────────
export const normSearch = (s) => String(s || '').toLowerCase().replace(/\s+/g, '')

// แถว inventory → 1 รายการต่อรหัสยา (lot ไม่ซ้ำ + มีของไหม) สำหรับค้นหา
export function buildSearchIndex(rows = []) {
  const byCode = new Map()
  for (const r of rows) {
    const code = String(r.code || '').trim()
    const name = String(r.name || '').trim()
    if (!code || code === '-') continue
    let d = byCode.get(code)
    if (!d) { d = { code, name, type: r.type || '', lots: new Set(), inStock: false }; byCode.set(code, d) }
    if (!d.name && name) d.name = name
    const lot = String(r.lot || '').trim()
    if (lot && lot !== '-') d.lots.add(lot)
    if (isStockRow(r)) d.inStock = true
  }
  return [...byCode.values()].map(d => ({
    ...d, lots: [...d.lots],
    _name: normSearch(d.name), _code: normSearch(d.code),
  }))
}

// ค้นชื่อ/รหัส/lot — อันดับ: รหัสตรงตัว > ชื่อขึ้นต้น > รหัสขึ้นต้น > ชื่อมีคำ > lot ตรงตัว > lot มีคำ
// lot ต้องพิมพ์ ≥ 3 ตัว (ตัวเลข 1–2 หลักตรงกับ lot แทบทุกตัว — ผลเกลื่อน)
export function searchDrugs(index = [], q, limit = 8) {
  const nq = normSearch(q)
  if (!nq) return []
  const out = []
  for (const d of index) {
    let score = -1, lot = null
    if (d._code === nq) score = 0
    else if (d._name.startsWith(nq)) score = 1
    else if (d._code.startsWith(nq)) score = 2
    else if (d._name.includes(nq)) score = 3
    else if (nq.length >= 3) {
      const exact = d.lots.find(l => normSearch(l) === nq)
      const part = exact || d.lots.find(l => normSearch(l).includes(nq))
      if (part) { score = exact ? 4 : 5; lot = part }
    }
    if (score >= 0) out.push({ code: d.code, name: d.name, type: d.type, inStock: d.inStock, matchedLot: lot, score })
  }
  out.sort((a, b) => (a.score - b.score) || (b.inStock - a.inStock) || a.name.localeCompare(b.name, 'th'))
  return out.slice(0, limit)
}

// ── บัตรยา ─────────────────────────────────────────────────────────
const uniq = (arr) => [...new Set(arr.filter(v => v != null && String(v).trim() !== '' && String(v).trim() !== '-'))]
const splitLoc = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean)
const round2 = (n) => Math.round(n * 100) / 100

// rows           = แถว inventory ทั้งหมดของรหัส (ทุกแถว รวม qty 0 — เรียงตาม location เหมือน fetchAllInventoryRows)
// purchaseUnit   = latestPurchaseUnit(receive_logs ของรหัส)
// receiveDates   = { 'code|lot' (lowercase) → receive_date ล่าสุด ISO } สำหรับ "รอตรวจรับมา N วัน"
// excludeStatus  = drug_reorder_config.exclude_status ของรหัส
// receiveRows    = receive_logs ของรหัส เรียงใหม่→เก่า — บิลของ lot + ประวัติรับ (Phase 2b)
// usage          = { months: ['YYYY-MM'…], monthsBase: { ym → เม็ด } } จาก fetchMonthlyDispenseUsage ช่วงเดียวกับ ReorderApp
// dispenseRows   = dispense_logs ของรหัส เรียงใหม่→เก่า · department = หน่วยงานผู้เบิก (null = ทุกหน่วยงาน — staff)
export function buildDrugProfile({
  rows = [], purchaseUnit = null, receiveDates = {}, excludeStatus = null, today = new Date(),
  receiveRows = [], usage = null, dispenseRows = [], department = null,
  companyPolicies = {}, companyBillPolicies = null,
}) {
  if (!rows.length) return null
  const t0 = new Date(today); t0.setHours(0, 0, 0, 0)
  const first = rows.find(r => r.name) || rows[0]
  const code = String(first.code || '').trim()

  const stockRows = rows.filter(isStockRow)
  const mainUnit = pickMainUnit(purchaseUnit, stockRows)
  const mainFactor = parseUnitFactor(mainUnit).factor || 1
  const total = stockTotalInMainUnit(stockRows, mainUnit)

  // แยกยอดรายแถว (lot เดียวอาจมีแถวรอตรวจรับปนแถวตรวจแล้ว) — หน่วยย่อยสุด แปลงเป็นหน่วยหลักตอนท้าย
  // ลำดับ: รอตรวจรับ > หมดอายุ > พร้อมเบิก (ของรอตรวจรับที่หมดอายุยังต้องตรวจรับก่อนตัดสินใจ)
  const split = { ready: 0, pending: 0, expired: 0 }
  for (const r of stockRows) {
    const base = toNum(r.qty) * parseUnitFactor(r.unit).factor
    const d = parseExpDate(r.exp)
    if (isPendingRow(r)) split.pending += base
    else if (d && d < t0) split.expired += base
    else split.ready += base
  }

  // บรรทัด = lot + วันหมดอายุ + หน่วย: บวกแถว code+lot ซ้ำ (ห้าม dedupe) แต่ไม่รวมข้ามวันหมดอายุ
  // (lot '-' ของเวชภัณฑ์มักมีหลาย exp — รวมแล้วไม่รู้ว่าของไหนหมดอายุเมื่อไหร่ · กฎเดียวกับโมดอลรายการยาในคลัง
  //  ต่างแค่เทียบวันที่หลัง parse — "01/03/2028" กับ "1/3/2028" คือวันเดียวกัน) · หน่วยต่างบวก qty ตรงๆ ไม่ได้
  const lotMap = new Map()
  for (const r of stockRows) {
    const lot = String(r.lot || '').trim() || '-'
    const expD = parseExpDate(r.exp)
    const expKey = expD ? expD.getTime() : (String(r.exp || '').trim() || '-')
    const k = `${lot}|${expKey}|${r.unit || ''}`
    let L = lotMap.get(k)
    if (!L) {
      L = { key: k, lot, unit: r.unit || '-', qty: 0, exps: [], locations: [], zones: [], invoices: [], byInvoice: {}, rowCount: 0, pending: false }
      lotMap.set(k, L)
    }
    L.qty += toNum(r.qty)
    L.rowCount += 1
    L.exps.push(r.exp)
    L.locations.push(...splitLoc(r.location))
    L.zones.push(r.main_log)
    L.invoices.push(r.invoice)
    const inv = String(r.invoice || '').trim()
    if (inv && inv !== '-') L.byInvoice[inv] = (L.byInvoice[inv] || 0) + toNum(r.qty)
    if (isPendingRow(r)) L.pending = true
  }

  const lots = [...lotMap.values()].map(L => {
    const exps = uniq(L.exps)
    const dates = exps.map(parseExpDate).filter(Boolean).sort((a, b) => a - b)
    const expDate = dates[0] || null
    const daysLeft = expDate ? Math.floor((expDate - t0) / 86400000) : null
    const expired = daysLeft != null && daysLeft < 0
    const recv = receiveDates[`${code.toLowerCase()}|${L.lot.toLowerCase()}`] || null
    const waitDays = L.pending ? waitDaysSince(recv, t0) : null
    return {
      key: L.key, lot: L.lot, unit: L.unit, qty: round2(L.qty), rowCount: L.rowCount,
      exp: exps.join(', ') || '-', expDate, daysLeft, expired,
      locations: uniq(L.locations), zones: uniq(L.zones), invoices: uniq(L.invoices),
      pending: L.pending, waitDays,
      ...lotBills({ lot: L.lot, qty: L.qty, byInvoice: L.byInvoice }, receiveRows),
    }
  }).sort((a, b) => {
    if (a.expDate && b.expDate) return a.expDate - b.expDate
    if (a.expDate) return -1
    if (b.expDate) return 1
    return a.lot.localeCompare(b.lot)
  })

  // นโยบายคืนบริษัทราย lot — ฟังก์ชันเดียวกับโมดอลใกล้หมดอายุ (deadline = popup คืนบริษัท)
  const policies = buildLotReturnPolicies({ lots: lots.map(l => ({ code, lot: l.lot, expDate: l.expDate })), receiveRows, companyPolicies, companyBillPolicies, today: t0 })
  lots.forEach((l, i) => { l.returnPolicy = policies[i] })

  const readyLots = lots.filter(l => !l.pending && !l.expired)
  const useFirst = readyLots.length > 1 ? readyLots[0] : null   // lot เดียวไม่ต้องบอก "ใช้ก่อน"

  const ssAgg = ssAggregate(rows)
  const zeroLots = uniq(rows.filter(r => !isStockRow(r) && !isDiscontinuedRow(r)).map(r => r.lot))
    .filter(l => !lots.some(x => x.lot === l)).length

  return {
    code,
    name: first.name || '',
    type: first.type || '',
    mainUnit,
    multiUnit: uniq(stockRows.map(r => r.unit)).length > 1,
    total,
    split: {
      ready: round2(split.ready / mainFactor),
      pending: round2(split.pending / mainFactor),
      expired: round2(split.expired / mainFactor),
    },
    lots,
    zeroLots,
    useFirst,
    pendingLots: lots.filter(l => l.pending).length,
    expiredLots: lots.filter(l => l.expired && !l.pending).length,
    belowSS: isBelowSafetyStock(ssAgg, excludeStatus),
    ss: ssAgg.ss,
    ssQty: ssAgg.qty,
    // หน่วยของ qty/SS ดิบ (กฎ Dashboard ไม่แปลงหน่วย) — หลายหน่วย = null: ยอดดิบเทียบกับยอดรวมบนบัตรไม่ได้ ห้ามโชว์คู่กัน
    ssUnit: uniq(rows.map(r => r.unit)).length === 1 ? uniq(rows.map(r => r.unit))[0] : null,
    discontinued: ssAgg.discontinued,
    excludeStatus: excludeStatus || null,
    unitNote: unitNote({ mainUnit, purchaseUnit, stockRows, receiveRows }),
    rate: usageRate({ usage, rows, mainUnit }),
    dispenseHistory: dispenseHistory(dispenseRows, department),
    receiveHistory: receiveRows.slice(0, HISTORY_LIMIT).map(receiveView),
    lastReceiveDate: receiveRows.reduce((m, r) => (r.receive_date && (!m || r.receive_date > m) ? r.receive_date : m), null),
  }
}

// ── โน้ตอธิบายหน่วยบนบัตรยา (20/10/2569 — Para 500 บัตรขึ้น 130 กล่อง (500 เม็ด) ทั้งที่ซื้อกล่องละ 1000) ──────
// กรณี 1 (conversions): ของในคลังมีหน่วยอื่นที่ไม่ใช่หน่วยหลัก → บอกว่าหน่วยหลักมาจากไหน + แปลงผ่านหน่วยย่อยยังไง
//   sameBase = false (เช่น 450ml กับ ขวด) และมีขนาดบรรจุ > 1 ฝั่งใดฝั่งหนึ่ง = แปลงไม่ได้จริง ยอดรวมเชื่อไม่ได้
//   (stockTotalInMainUnit คูณ/หารตามเลขนำหน้าเท่านั้น — ไม่รู้ว่า ml กับ ขวด คนละอย่าง)
// กรณี 2 (change): หน่วยของบิลซื้อล่าสุด ≠ บิลซื้อใบก่อนหน้า (คนละบิล) → บอกว่าเปลี่ยนจากอะไรเป็นอะไร
// receiveRows ต้องเรียงใหม่→เก่า (ลำดับเดียวกับ latestPurchaseUnit)
const billView = (r) => ({
  unit: r.drug_unit, billNumber: String(r.bill_number || '').trim() || '-',
  supplier: String(r.supplier_current || '').trim() || '-', receiveDate: r.receive_date || null,
})
export function unitNote({ mainUnit, purchaseUnit = null, stockRows = [], receiveRows = [] }) {
  const purchases = receiveRows.filter(r => isPurchaseReceipt(r) && r.drug_unit)
  const latest = purchases[0] || null
  const latestKey = latest ? `${latest.bill_number}|${latest.receive_date}` : null
  const prev = latest ? purchases.find(r => `${r.bill_number}|${r.receive_date}` !== latestKey) : null

  const main = parseUnitFactor(mainUnit)
  const byUnit = new Map()
  for (const r of stockRows) {
    const u = String(r.unit || '-').trim() || '-'
    if (u === String(mainUnit || '').trim()) continue
    byUnit.set(u, (byUnit.get(u) || 0) + toNum(r.qty))
  }
  const conversions = [...byUnit.entries()].map(([unit, qty]) => {
    const { factor, base } = parseUnitFactor(unit)
    const sameBase = base.toLowerCase() === main.base.toLowerCase()
    return {
      unit, qty: round2(qty), factor, base, sameBase,
      convertible: sameBase || (factor === 1 && main.factor === 1),
      baseQty: round2(qty * factor),
      inMain: round2(qty * factor / (main.factor || 1)),
    }
  })

  const change = latest && prev && String(latest.drug_unit).trim() !== String(prev.drug_unit).trim()
    ? { from: billView(prev), to: billView(latest) } : null
  if (!conversions.length && !change) return null

  const fromPurchase = !!purchaseUnit && purchaseUnit === mainUnit
  return {
    mainUnit, mainFactor: main.factor, mainBase: main.base,
    basis: fromPurchase ? 'purchase' : 'stock',
    bill: fromPurchase && latest && latest.drug_unit === mainUnit ? billView(latest) : null,
    conversions,
    change,
  }
}

// ── Phase 2b: บิลของ lot · เรท · ประวัติเบิก/รับ ────────────────────────────
export const HISTORY_LIMIT = 10

const normLot = (s) => String(s || '').trim().toLowerCase() || '-'

// บิลของ lot (CONTEXT §บัตรยา): บริษัท/ราคา/บิล = ของบิลที่ lot นั้นรับเข้ามาจริง ห้ามยืมบิลระดับรหัส
//   lot จริง → แถว receive_logs ที่ lot ตรง (รหัสถูกกรองมาแล้วตอน query)
//   lot '-'  → จับด้วยเลขบิลของแถว inventory เท่านั้น (lot '-' ของรหัสเดียวกันมีหลายบิลข้ามปี — จับด้วย lot = ยืมบิลอื่น)
// หลายบิล = แยกรายบิล ไม่เฉลี่ยราคา · คงเหลือรายบิลรู้ได้เฉพาะแถว inventory ที่เลขบิลตรง (ไม่ตรง = null ไม่ใช่ 0)
export function lotBills({ lot, qty, byInvoice = {} }, receiveRows = []) {
  const invoices = new Set(Object.keys(byInvoice).map(s => s.toLowerCase()))
  const hit = lot === '-'
    ? receiveRows.filter(r => invoices.has(String(r.bill_number || '').trim().toLowerCase()))
    : receiveRows.filter(r => normLot(r.lot) === normLot(lot))
  const map = new Map()
  for (const r of hit) {
    const billNumber = String(r.bill_number || '').trim() || '-'
    const k = `${billNumber}|${String(r.supplier_current || '').trim()}|${r.receive_date || ''}`
    let b = map.get(k)
    if (!b) {
      b = {
        key: k, billNumber, supplier: String(r.supplier_current || '').trim() || '-', receiveDate: r.receive_date || null,
        price: toNum(r.price_per_unit), unit: r.drug_unit || '-', purchaseType: String(r.purchase_type || '').trim() || null,
        qtyReceived: 0, remaining: null,
      }
      map.set(k, b)
    }
    b.qtyReceived += toNum(r.qty_received)
  }
  const bills = [...map.values()].sort((a, b) => String(b.receiveDate || '').localeCompare(String(a.receiveDate || '')))
  // คงเหลือรายบิล — แถว inventory บอกเลขบิล → ยกยอดของแถวนั้นให้บิลแรกที่เลขตรง (บิลเลขซ้ำคนละวันรับ ได้แค่ใบล่าสุด)
  let assigned = 0
  for (const [inv, q] of Object.entries(byInvoice)) {
    const b = bills.find(x => x.billNumber.toLowerCase() === inv.toLowerCase())
    if (b) { b.remaining = round2((b.remaining || 0) + q); assigned += q }
  }
  bills.forEach(b => { b.qtyReceived = round2(b.qtyReceived) })
  const sameUnit = uniq(bills.map(b => b.unit)).length === 1
  const prices = bills.map(b => b.price)
  return {
    bills,
    // คงเหลือที่บอกไม่ได้ว่ามาจากบิลไหน (แถว inventory เลขบิลว่าง/ไม่ตรงบิลใด)
    unassignedQty: bills.length ? round2(qty - assigned) : null,
    priceRange: bills.length && sameUnit ? { min: Math.min(...prices), max: Math.max(...prices), unit: bills[0].unit } : null,
  }
}

// เรท = กฎหน้าวิเคราะห์สั่งซื้อ (ReorderApp.runAnalysis): ยอดเบิกรายเดือน(เม็ด) ÷ packsize หน่วยหลัก → computeStats
// (เดือนที่ไม่มีเบิก = 0 นับเป็นตัวหาร) · คงอยู่ได้อีก = คงเหลือทุกแถว (เม็ด, กฎ stockInfo ของ ReorderApp) ÷ Avg/วัน
export function reorderStockBase(rows = []) {
  return rows.reduce((s, r) => s + toNum(r.qty) * parseUnitFactor(r.unit).factor, 0)
}
export function usageRate({ usage, rows = [], mainUnit }) {
  if (!usage?.months?.length) return null
  const pack = parseUnitFactor(mainUnit).factor || 1
  const monthly = usage.months.map(ym => (usage.monthsBase?.[ym] || 0) / pack)
  const { avgMonth, avgDay } = computeStats(monthly)
  const stock = reorderStockBase(rows) / pack
  return {
    avgMonth: round2(avgMonth),
    avgDay,
    unit: mainUnit,
    months: usage.months,
    monthLabel: `${thaiMonthLabel(usage.months[0])}–${thaiMonthLabel(usage.months[usage.months.length - 1])}`,
    coverage: fmtCoverage(stock, avgDay),
    coverageDays: avgDay > 0 ? Math.floor(stock / avgDay) : null,
  }
}

// ชื่อหน่วยงาน 2 ระบบเขียนไม่ตรงกัน: app_users "ห้องยา G" / "ER (ฉุกเฉิน)" vs dispense_logs "ห้องยาG" / "ER"
// → ตัดข้อความในวงเล็บ + ช่องว่าง + ตัวพิมพ์ แล้วเทียบ (ตรวจ 10/10/2569: ตรงครบ 3 หน่วยงานที่มีประวัติเบิก)
export const normDept = (s) => String(s || '').replace(/\(.*?\)/g, '').replace(/\s+/g, '').toLowerCase()

const dispenseView = (r) => ({
  date: r.dispense_date || null, department: r.department || '-', lot: r.lot || '-',
  qty: round2(toNum(r.qty_out)), unit: r.drug_unit || '-', itemType: r.item_type || null, note: r.note || null,
})
const receiveView = (r) => ({
  date: r.receive_date || null, billNumber: r.bill_number || '-', supplier: r.supplier_current || '-', lot: r.lot || '-',
  qty: round2(toNum(r.qty_received)), unit: r.drug_unit || '-', price: toNum(r.price_per_unit), purchaseType: r.purchase_type || null,
})

// ประวัติเบิก: department = null → ทุกหน่วยงาน (staff) · มีค่า → เฉพาะหน่วยงานนั้น (ผู้เบิก — CONTEXT §บัตรยา)
export function dispenseHistory(sortedRows = [], department = null) {
  const own = department ? normDept(department) : null
  const matched = own ? sortedRows.filter(r => normDept(r.department) === own) : sortedRows
  return { department: department || null, total: matched.length, rows: matched.slice(0, HISTORY_LIMIT).map(dispenseView) }
}

// ── นโยบายคืนบริษัทราย lot (22/10/2569) — ใช้ร่วม บัตรยา (DrugProfileModal) + โมดอลใกล้หมดอายุ (ExpiryAlertSection) ──
// กฎเลือกบริษัท / นโยบาย / deadline = fetchSwapReturnDue (db.js) ทุกข้อ → deadline บนบัตร = popup คืนบริษัท:
//   บริษัท   = แถว receive_logs ใหม่สุดของ รหัส+lot ที่มีบริษัท · lot เดียวกันคนละบริษัท = กำกวม ไม่ประเมิน (ADR-0012)
//   deadline = tier ของบิลนั้นที่ระบุชัด (V2 · ADR-0014/0015) → ไม่มี tier ใช้ตารางนโยบายบริษัท (V1)
// ข้อความนโยบายที่แสดง: บิลของ lot → ไม่มีใช้นโยบาย "เงื่อนไขเดียวกันทุกรายการ" ของบริษัทเดียวกันจากบิลยาอื่น (ใบล่าสุด) → ตารางนโยบายบริษัท
//   ข้อความจากบิลยาอื่นแสดงพร้อมป้ายที่มาเท่านั้น ไม่ใช้คิด deadline · ข้อความอื่น (เงื่อนไขต่างรายการ/หมายเหตุเฉพาะบิล) ห้ามยืมข้ามยา
export const POLICY_SOURCE_LABEL = {
  lot: 'จากบิลของ lot นี้',
  company_bill: 'นโยบายบริษัทจากบิลยาอื่น',
  company_table: 'ตารางนโยบายบริษัท',
}
const cleanText = (v) => { const s = String(v ?? '').trim(); return s && s !== '-' ? s : null }
const byReceiveDesc = (rows) => [...rows].sort((a, b) => String(b.receive_date || '').localeCompare(String(a.receive_date || '')))
const isoLocal = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null

export const COMPANY_WIDE_POLICY_PREFIX = 'เงื่อนไขเดียวกันทุกรายการ'

// นโยบายใช้ทุกรายการของบริษัทจากบิลใบล่าสุด → { [บริษัท]: { text, billNumber, receiveDate, drugName } }
export function latestPolicyByCompany(receiveRows = []) {
  const out = {}
  for (const r of byReceiveDesc(receiveRows)) {
    const co = cleanText(r.supplier_current)
    const text = cleanText(r.drug_swap_policy)
    if (!co || !text?.startsWith(COMPANY_WIDE_POLICY_PREFIX) || out[co]) continue
    out[co] = { text, billNumber: cleanText(r.bill_number), receiveDate: r.receive_date || null, drugName: cleanText(r.drug_name) }
  }
  return out
}

// lots = [{ code, lot, expDate }] · receiveRows = receive_logs (ต้องมี drug_code, lot, supplier_current, drug_swap_policy,
// swap_tier_detail, swap_condition_am, receive_date, bill_number) · companyPolicies = fetchSwapPolicies()
// companyBillPolicies = latestPolicyByCompany ของบิลทุกยา (ไม่ส่ง = หาจาก receiveRows เอง)
// → array ตามลำดับ lots: { company, ambiguous, policyText, policySource, policyRef, status, deadline, deadlineIso,
//    daysToDeadline, percent, note, returnMonths, method }
//   status: ok | due | overdue | no_return | review | no_policy | no_company
export function buildLotReturnPolicies({ lots = [], receiveRows = [], companyPolicies = {}, companyBillPolicies = null, today = new Date() }) {
  const t0 = new Date(today); t0.setHours(0, 0, 0, 0)
  const lotKey = (code, lot) => `${String(code || '').trim().toLowerCase()}|${String(lot || '-').trim().toLowerCase() || '-'}`
  const idx = new Map()   // code|lot → { supplier (null = กำกวม), row (บิลที่ใช้), receiveDate }
  for (const r of byReceiveDesc(receiveRows)) {
    const code = String(r.drug_code || '').trim()
    if (!code) continue
    const k = lotKey(code, r.lot)
    let e = idx.get(k)
    if (!e) { e = { supplier: undefined, row: null, receiveDate: r.receive_date || null }; idx.set(k, e) }
    const co = cleanText(r.supplier_current)
    if (!co) continue
    if (e.supplier === undefined) { e.supplier = co; e.row = r }
    else if (e.supplier !== null && e.supplier !== co) e.supplier = null
  }
  const billPolicies = companyBillPolicies || latestPolicyByCompany(receiveRows)

  return lots.map(({ code, lot, expDate }) => {
    const e = idx.get(lotKey(code, lot))
    const base = {
      company: null, ambiguous: false, policyText: null, policySource: null, policyRef: null,
      status: 'no_company', deadline: null, deadlineIso: null, daysToDeadline: null, percent: null, note: null, returnMonths: null, method: null,
    }
    if (!e || e.supplier === undefined) return base
    if (e.supplier === null) return { ...base, ambiguous: true, note: 'lot เดียวกันรับจากหลายบริษัท — ไม่ประเมิน' }
    const company = e.supplier
    const table = companyPolicies[company] || null
    const lotText = cleanText(e.row.drug_swap_policy)
    const shown = lotText ? { policyText: lotText, policySource: 'lot', policyRef: null }
      : billPolicies[company] ? { policyText: billPolicies[company].text, policySource: 'company_bill',
        policyRef: { billNumber: billPolicies[company].billNumber, receiveDate: billPolicies[company].receiveDate, drugName: billPolicies[company].drugName } }
      : cleanText(table?.rawNote) ? { policyText: cleanText(table.rawNote), policySource: 'company_table', policyRef: null }
      : { policyText: null, policySource: null, policyRef: null }
    const out = { ...base, company, ...shown, status: 'no_policy' }

    const exp = expDate instanceof Date && !isNaN(expDate) ? expDate : null
    if (!exp) return out
    const rIso = e.receiveDate ? String(e.receiveDate).split('T')[0] : null
    const rDate = rIso ? parseExpDate(rIso.split('-').reverse().join('/')) : null
    const differsByCompany = /แตกต่าง|แล้วแต่รายการ/.test(cleanText(e.row.swap_condition_am) || '')
    const tierDetail = cleanText(e.row.swap_tier_detail)
    const policyV2 = tierDetail ? parseReturnPolicyV2(tierDetail) : null
    const explicit = !!policyV2 && policyV2.shape !== 'ambiguous' && !policyV2.needsReview
    const done = (r, extra) => ({ ...out, ...extra, status: r.status, deadline: r.deadline || null, deadlineIso: isoLocal(r.deadline), daysToDeadline: r.daysToDeadline ?? null })

    if (differsByCompany && !explicit) return { ...out, status: 'review', note: 'บริษัทให้เงื่อนไขต่างกันแต่ละรายการ — เช็กเอกสาร' }
    if (explicit) {
      const r = computeReturnStatusV2({ policy: policyV2, exp, receiveDate: rDate, today: t0 })
      return done(r, { method: 'v2', percent: r.percent ?? null, note: r.note || null,
        returnMonths: policyV2.beforeExpMonths ?? policyV2.afterExpMonths ?? policyV2.receiveThresholdMonths ?? null,
        // ไว้ให้ returnPolicyLabel แยก "คืนได้หลังหมดอายุ" (deadline = วันเริ่มคืน) ออกจาก "ต้องคืนก่อน"
        shape: policyV2.shape, afterExpMonths: policyV2.afterExpMonths ?? null, expDate: exp, expired: exp <= t0 })
    }
    if (tierDetail) return { ...out, status: 'review', note: 'เงื่อนไขในบิลกำกวม — เช็กเอกสาร' }
    if (!table) return out
    if (table.differsByItem) return { ...out, status: 'review', note: 'บริษัทให้เงื่อนไขต่างกันแต่ละรายการ — เช็กเอกสาร' }
    if (table.returnMonths == null) return table.canReturn === false ? { ...out, status: 'no_return', note: 'บริษัทไม่รับคืน' } : out
    const r = computeReturnStatus({ exp, months: table.returnMonths, today: t0 })
    return done(r, { method: 'v1', returnMonths: table.returnMonths, note: `คืนก่อนหมดอายุ ${table.returnMonths} เดือน (ตารางนโยบายบริษัท)` })
  })
}

// ── หน้านโยบายคืนบริษัท (03/11/2569) ──
// ชื่อบริษัทสำหรับเทียบคำค้น: ตัดคำนำหน้า/ท้าย + วรรณยุกต์ + เครื่องหมาย · รวม เเ/แ, ํา/ำ, ก/ค (แอตแลนติก = แอตแลนติค)
const normCompany = (s) => String(s || '').toLowerCase().normalize('NFC')
  .replace(/\u0E4D\u0E32/g, '\u0E33').replace(/เเ/g, 'แ')
  .replace(/ห้างหุ้นส่วนจำกัด|หสน\.?|บริษัท|\(มหาชน\)|จำกัด/g, '')
  .replace(/[\u0E47-\u0E4E\s.,()-]/g, '').replace(/ก/g, 'ค')

// ขึ้นต้นด้วยคำค้นมาก่อน · คำค้นเป็นแค่ "บริษัท"/"จำกัด" = ไม่มีผล (กันขึ้นทั้งรายการ)
export function searchCompanies(names = [], q, limit = 8) {
  const nq = normCompany(q)
  if (!nq) return []
  // คำย่อ (GPO/อภ/LBS/DKSH/atlantic) ได้ชื่อจริงขึ้นก่อน — กัน "อภ" ได้ อภัยภูเบศร ขึ้นบนสุด
  const alias = COMPANY_ALIAS[aliasKey(q)]
  const na = alias ? normCompany(alias) : null
  return names
    .map(name => ({ name, n: normCompany(name) }))
    .map(x => ({ ...x, rank: na && x.n.includes(na) ? 0 : x.n.startsWith(nq) ? 1 : x.n.includes(nq) ? 2 : -1 }))
    .filter(x => x.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'th'))
    .slice(0, limit)
    .map(x => x.name)
}

// inventory + receive_logs → lot คงเหลือทุกบรรทัดพร้อมนโยบาย · รวมแถวซ้ำรหัส+lot+exp+หน่วยด้วยการบวก (ห้ามทับ — ตารางมีแถวซ้ำจริง)
// → { lines, companies: [{ name, lots }] (ทุกบริษัทที่เคยรับยา), unresolvedLots: จำนวน lot ที่ระบุบริษัทไม่ได้,
//     latestPolicyByName: ข้อความจากบิลล่าสุดของแต่ละบริษัท — บริษัทไม่มีของยังดูนโยบายก่อนสั่งซื้อได้ }
export function buildCompanyPolicyIndex({ inventoryRows = [], receiveRows = [], companyPolicies = {}, today = new Date() }) {
  const merged = new Map()
  for (const r of inventoryRows) {
    const qty = parseFloat(String(r.qty ?? '').replace(/,/g, ''))
    if (!(qty > 0)) continue
    const expDate = parseExpDate(r.exp)
    const key = [r.code, r.lot, expDate ? expDate.getTime() : r.exp, r.unit].join('|')
    const status = String(r.receive_status || '')
    const location = cleanText(r.location)
    const e = merged.get(key)
    if (e) {
      e.qty += qty
      if (location && !e.locations.includes(location)) e.locations.push(location)
      e.pending = e.pending || status.includes('รอตรวจรับ')
      e.excluded = e.excluded || status.includes('ตัดออก')
    } else {
      merged.set(key, { key, code: r.code, name: r.name, lot: r.lot, unit: r.unit, qty, expDate,
        locations: location ? [location] : [], pending: status.includes('รอตรวจรับ'), excluded: status.includes('ตัดออก') })
    }
  }
  const stock = [...merged.values()]
  const companyBillPolicies = latestPolicyByCompany(receiveRows)
  const policies = buildLotReturnPolicies({ lots: stock, receiveRows, companyPolicies, companyBillPolicies, today })
  const lines = stock.map((l, i) => ({ ...l, returnPolicy: policies[i] }))
  const counts = {}
  for (const l of lines) if (l.returnPolicy.company) counts[l.returnPolicy.company] = (counts[l.returnPolicy.company] || 0) + 1
  const names = new Set(receiveRows.map(r => cleanText(r.supplier_current)).filter(Boolean))
  const latestPolicyByName = {}
  const recentFirst = byReceiveDesc(receiveRows)
  for (const r of recentFirst) {
    const co = cleanText(r.supplier_current)
    const text = cleanText(r.drug_swap_policy)
    if (co && text && !latestPolicyByName[co]) latestPolicyByName[co] = text
  }

  // ── ค้นตามยา / lot (10/11/2569) ──
  // lot ที่มีในบิลแต่คลังไม่มีคงเหลือแล้ว — ใช้เฉพาะโหมดค้นยา/lot ไม่นับในหน้าบริษัท (ของอาจอยู่ห้องยา)
  const lk = (code, lot) => `${String(code || '').trim().toLowerCase()}|${String(lot || '').trim().toLowerCase()}`
  const stockKeys = new Set(stock.map(l => lk(l.code, l.lot)))
  const past = new Map()
  // ยา → บริษัทที่เคยซื้อ (วันรับล่าสุด) · ข้อความนโยบายจากบิลของยานี้กับบริษัทนี้ (ใบล่าสุดที่มีข้อความ)
  const drugMap = new Map()
  const drugOf = (code, name) => {
    let d = drugMap.get(code)
    if (!d) { d = { code, name: name || '', companies: new Map() }; drugMap.set(code, d) }
    if (!d.name && name) d.name = name
    return d
  }
  for (const l of lines) if (l.code && l.code !== '-') drugOf(String(l.code).trim(), cleanText(l.name))
  const drugCompanyPolicy = {}
  for (const r of recentFirst) {
    const code = String(r.drug_code || '').trim()
    if (!code || code === '-') continue
    const d = drugOf(code, cleanText(r.drug_name))
    const co = cleanText(r.supplier_current)
    if (co && !d.companies.has(co)) d.companies.set(co, r.receive_date || null)
    const text = cleanText(r.drug_swap_policy)
    if (co && text && !drugCompanyPolicy[`${code}|${co}`]) {
      drugCompanyPolicy[`${code}|${co}`] = { text, billNumber: cleanText(r.bill_number), receiveDate: r.receive_date || null }
    }
    const lot = cleanText(r.lot)
    const k = lk(code, lot)
    if (!lot || stockKeys.has(k) || past.has(k)) continue
    past.set(k, { key: `past|${k}`, code, name: d.name || cleanText(r.drug_name) || code, lot, unit: '', qty: 0,
      expDate: parseExpDate(r.exp), locations: [], pending: false, excluded: false, outOfStock: true,
      billNumber: cleanText(r.bill_number), receiveDate: r.receive_date || null })
  }
  const pastLots = [...past.values()]
  const pastPolicies = buildLotReturnPolicies({ lots: pastLots, receiveRows, companyPolicies, companyBillPolicies, today })

  return {
    lines,
    latestPolicyByName,
    companies: [...names].sort((a, b) => a.localeCompare(b, 'th')).map(name => ({ name, lots: counts[name] || 0 })),
    unresolvedLots: lines.filter(l => !l.returnPolicy.company).length,
    pastLines: pastLots.map((l, i) => ({ ...l, returnPolicy: pastPolicies[i] })),
    drugs: [...drugMap.values()].map(d => ({
      code: d.code, name: d.name || d.code,
      companies: [...d.companies].map(([name, lastReceive]) => ({ name, lastReceive })),
      _name: normSearch(d.name), _code: normSearch(d.code),
    })),
    drugCompanyPolicy,
    companyBillPolicies,
    companyPolicies,
  }
}

// คำที่คนในคลังพิมพ์ ≠ ชื่อในระบบ (ชื่อจริงตรวจจาก DB แล้ว 10/11/2569) · key = ตัวพิมพ์เล็ก ตัดช่องว่าง/จุด
const DRUG_ALIAS = { clexane: 'enoxaparin', vitk: 'phytonadione', vitamink: 'phytonadione', d5s5: 'd-5-s', gemotran: 'tranexamic' }
const COMPANY_ALIAS = { gpo: 'องค์การเภสัชกรรม', อภ: 'องค์การเภสัชกรรม', lbs: 'แอล.บี.เอส.', dksh: 'ดีเคเอสเอช', atlantic: 'แอตแลนติค' }
const aliasKey = (q) => String(q || '').toLowerCase().replace(/[\s.]/g, '')

// ค้นยาในหน้านโยบาย — ทุกยาที่มีคงเหลือหรือเคยมีบิล · อันดับ: รหัสตรง > ชื่อขึ้นต้น > รหัสขึ้นต้น > ชื่อมีคำ
export function searchPolicyDrugs(drugs = [], q, limit = 20) {
  const nq = normSearch(q)
  if (!nq) return []
  const alias = DRUG_ALIAS[aliasKey(q)]
  const out = []
  for (const d of drugs) {
    let score = -1
    if (alias && d._name.includes(alias)) score = 0
    else if (d._code === nq) score = 0
    else if (d._name.startsWith(nq)) score = 1
    else if (d._code.startsWith(nq)) score = 2
    else if (d._name.includes(nq)) score = 3
    if (score >= 0) out.push({ ...d, score })
  }
  out.sort((a, b) => (a.score - b.score) || (b.companies.length - a.companies.length) || a.name.localeCompare(b.name, 'th'))
  return out.slice(0, limit)
}

// ยา 1 รหัส → บริษัทที่เคยซื้อ แต่ละบริษัทมีนโยบาย + lot ในคลัง + lot ที่คลังไม่มีแล้ว
// บริษัทที่มีของในคลังก่อน แล้วเรียงตามวันซื้อล่าสุด · lot ในคลังที่ระบุบริษัทไม่ได้แยกไว้ใน unresolved
export function drugPolicyView(index, code) {
  const d = index?.drugs?.find(x => x.code === code)
  if (!d) return null
  const all = [...index.lines, ...index.pastLines].filter(l => String(l.code).trim() === code)
  const expDesc = (a, b) => (b.expDate?.getTime() ?? -Infinity) - (a.expDate?.getTime() ?? -Infinity)
  const companies = d.companies.map(c => {
    const lots = all.filter(l => l.returnPolicy.company === c.name)
    const own = index.drugCompanyPolicy[`${code}|${c.name}`]
    const bill = index.companyBillPolicies[c.name]
    const table = cleanText(index.companyPolicies?.[c.name]?.rawNote)
    const policy = own ? { text: own.text, sourceNote: `จากบิลยานี้ ${own.billNumber || '-'}` }
      : bill ? { text: bill.text, sourceNote: policySourceNote({ policySource: 'company_bill', policyRef: bill }) }
      : table ? { text: table, sourceNote: POLICY_SOURCE_LABEL.company_table }
      : { text: null, sourceNote: null }
    return {
      name: c.name, lastReceive: c.lastReceive, policyText: policy.text, policySourceNote: policy.sourceNote,
      stockLots: lots.filter(l => !l.outOfStock).sort((a, b) => -expDesc(a, b)),
      pastLots: lots.filter(l => l.outOfStock).sort(expDesc),
    }
  }).sort((a, b) => Number(!a.stockLots.length) - Number(!b.stockLots.length)
    || String(b.lastReceive || '').localeCompare(String(a.lastReceive || '')))
  return { code, name: d.name, companies, unresolved: all.filter(l => !l.returnPolicy.company && !l.outOfStock) }
}

// ค้นเลข lot (≥ 3 ตัว) ทั้งในคลังและจากบิล · ตรงตัวก่อน แล้ว lot ในคลังก่อน
export function searchPolicyLots(index, q, limit = 50) {
  const nq = normSearch(q)
  if (!index || nq.length < 3) return []
  return [...index.lines, ...index.pastLines]
    .map(l => ({ l, n: normSearch(l.lot) }))
    .filter(x => x.n.includes(nq))
    .sort((a, b) => Number(a.n !== nq) - Number(b.n !== nq) || Number(!!a.l.outOfStock) - Number(!!b.l.outOfStock)
      || String(a.l.name).localeCompare(String(b.l.name), 'th'))
    .slice(0, limit)
    .map(x => x.l)
}

// "ทำอะไรต่อ" ของ lot — กฎเดียวกับป้าย (returnPolicyLabel) แต่ตัดสินจาก status/shape ไม่ใช่ข้อความบนป้าย
// kind: return (ทำใบส่งคืน VX) · wait (ยังไม่ต้องทำ) · dispose (คืนไม่ได้ → จำหน่าย) · check (เช็กเอกสาร) · none (ไม่มีข้อมูล) · ward (คลังไม่มีแล้ว)
export function policyNextAction(line) {
  if (!line) return null
  if (line.outOfStock) return { kind: 'ward', text: 'คลังไม่มีแล้ว — ถ้าห้องยายังมีของ ห้องยาแจ้งหัวหน้า เพื่อทำเรื่องคืนหรือรอทำลาย' }
  const rp = line.returnPolicy
  const label = returnPolicyLabel(rp)
  if (!rp || !label) return null
  if (rp.ambiguous) return { kind: 'check', text: 'lot นี้รับจากหลายบริษัท — เช็กบิลว่าของที่มีมาจากบริษัทไหน' }
  if (rp.status === 'no_policy' || rp.status === 'no_company') return { kind: 'none', text: 'ไม่มีข้อมูลนโยบายคืน — สอบถามบริษัทก่อนตัดสินใจ' }
  if (rp.status === 'review') return { kind: 'check', text: 'เงื่อนไขไม่ชัด — เช็กเอกสาร/สอบถามบริษัท' }
  const dispose = 'ใช้ให้หมดก่อนหมดอายุ · หมดอายุแล้วทำเรื่องจำหน่าย (แปรสภาพหรือทำลาย)'
  if (rp.status === 'no_return') return { kind: 'dispose', text: `บริษัทไม่รับคืน — ${dispose}` }
  if (label.tone === 'red') return { kind: 'dispose', text: `พ้นกำหนดคืนแล้ว — ${dispose}` }
  if (label.tone === 'orange') return { kind: 'return', text: `คืนได้บางส่วน ${rp.percent}% — ถ้าใช้ไม่ทัน ทำใบส่งคืนบริษัท (VX)` }
  if (rp.shape === 'after_exp' && rp.expDate) {
    if (!rp.expired) return { kind: 'wait', text: 'ยังไม่ถึงเวลา — คืนได้เมื่อหมดอายุ' }
    // หมดอายุแล้ว — "ถ้าใช้ไม่ทัน" ไม่มีความหมายแล้ว
    return { kind: 'return', text: rp.deadline ? 'หมดอายุแล้ว — ทำใบส่งคืนบริษัท (VX) ก่อนครบกำหนด' : 'หมดอายุแล้ว — ทำใบส่งคืนบริษัท (VX)' }
  }
  if (rp.status === 'ok' && rp.deadline) return { kind: 'wait', text: 'ยังไม่ต้องทำ — ใช้ตามปกติ' }
  if (label.tone === 'amber') return { kind: 'return', text: 'ถ้าใช้ไม่ทัน ทำใบส่งคืนบริษัท (VX) ก่อนกำหนด' }
  return { kind: 'return', text: 'คืนได้ — ถ้าใช้ไม่ทัน ทำใบส่งคืนบริษัท (VX)' }
}

const monthsText = (n) => (n >= 12 && n % 12 === 0 ? `${n / 12} ปี` : `${n} เดือน`)

// หมวดนโยบายภาษาคนของ lot (หัวกลุ่มหน้าบริษัท · หัวโหมดรายการยา) — แปลจาก shape/status ที่คิดไว้แล้ว ไม่อ่านข้อความบิลซ้ำ
// ข้อความบิลเขียนต่างกันแต่ความหมายเดียวกัน (อภ. 3 แบบ = คืนได้หลังหมดอายุ) → หมวดเดียวกัน (user ขอ 11/11/2569)
// order = ลำดับในหน้า: มีเส้นตายก่อนหมดอายุ → % ตามอายุ → threshold → หลังหมดอายุ → คืนไม่ได้ → อื่นๆ → ไม่มีข้อมูล
export function policyCategory(rp) {
  if (!rp || rp.status === 'no_policy' || (rp.status === 'no_company' && !rp.ambiguous)) {
    return { key: 'none', order: 8, title: 'ไม่มีข้อมูลนโยบายคืน' }
  }
  if (rp.ambiguous || rp.status === 'review') return { key: 'review', order: 7, title: 'อื่นๆ — เงื่อนไขแล้วแต่รายการ ต้องเช็กเอกสาร' }
  if (rp.status === 'no_return') return { key: 'no_return', order: 6, title: 'เปลี่ยนคืนไม่ได้ — ใช้ให้หมด หมดอายุแล้วรอทำลาย' }
  if (rp.shape === 'after_exp') {
    return rp.afterExpMonths != null
      ? { key: `after_exp|${rp.afterExpMonths}`, order: 4, title: `เปลี่ยนคืนได้หลังหมดอายุ ภายใน ${monthsText(rp.afterExpMonths)}` }
      : { key: 'after_exp', order: 5, title: 'เปลี่ยนคืนได้หลังหมดอายุแล้ว' }
  }
  if (rp.shape === 'age_tier') return { key: 'age_tier', order: 2, title: 'เปลี่ยนคืนได้ตามเงื่อนไข — ได้คืนเป็น % ตามอายุยาที่เหลือ' }
  if (rp.shape === 'receive_threshold' && rp.returnMonths != null) {
    return { key: `receive_threshold|${rp.returnMonths}`, order: 3, title: `เปลี่ยนคืนได้ตามเงื่อนไข — เฉพาะ lot ที่ส่งมาอายุสั้นกว่า ${monthsText(rp.returnMonths)}` }
  }
  if (rp.returnMonths != null) {
    return { key: `before_exp|${rp.returnMonths}`, order: 1, title: `เปลี่ยนคืนได้ตามเงื่อนไข — ต้องคืนก่อนหมดอายุ ${monthsText(rp.returnMonths)}` }
  }
  return { key: 'review', order: 7, title: 'อื่นๆ — เงื่อนไขแล้วแต่รายการ ต้องเช็กเอกสาร' }
}

// lot ของบริษัทหนึ่ง จัดกลุ่มตามหมวดนโยบาย (policyCategory) — กลุ่มที่มี lot ต้องทำอะไร (ป้ายเหลือง/ส้ม/แดง) ก่อน แล้วตามลำดับหมวด
// texts = ข้อความในบิลทุกแบบของกลุ่ม (ไว้ตรวจสอบ) · ข้อความเดียวกันแต่ยืมจากบิลยาอื่น = แยกรายการพร้อมบอกบิลต้นทาง
// (เดิมจัดตามข้อความดิบ + เรียงตาม daysToDeadline ซึ่ง after_exp = วันเริ่มคืน จึงถูกดันขึ้นบนเหมือนเรื่องด่วน)
export function groupCompanyLots(lines = [], company) {
  const days = (l) => l.returnPolicy.daysToDeadline ?? Infinity
  const byLot = (a, b) => days(a) - days(b)
    || (a.expDate?.getTime() ?? Infinity) - (b.expDate?.getTime() ?? Infinity)
    || String(a.name).localeCompare(String(b.name), 'th')
  const URGENT = new Set(['red', 'amber', 'orange'])
  const groups = new Map()
  for (const l of lines) {
    const rp = l.returnPolicy
    if (rp.company !== company) continue
    const cat = policyCategory(rp)
    if (!groups.has(cat.key)) groups.set(cat.key, { ...cat, lots: [], texts: new Map() })
    const g = groups.get(cat.key)
    g.lots.push(l)
    const text = rp.policyText || null
    if (text) {
      const source = rp.policySource || null
      const tk = `${source}|${text}`
      if (!g.texts.has(tk)) g.texts.set(tk, { text, source, sourceNote: source && source !== 'lot' ? policySourceNote(rp) : null, lots: 0 })
      g.texts.get(tk).lots++
    }
  }
  return [...groups.values()]
    .map(g => ({
      ...g,
      lots: [...g.lots].sort(byLot),
      texts: [...g.texts.values()].sort((a, b) => b.lots - a.lots),
      urgent: g.lots.some(l => URGENT.has(returnPolicyLabel(l.returnPolicy)?.tone)),
    }))
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.order - b.order
      || days(a.lots[0]) - days(b.lots[0]) || b.lots.length - a.lots.length)
}

// ป้ายสถานะนโยบายคืนของ lot — ข้อความเดียวกันทั้งบัตรยา · โมดอลใกล้หมดอายุ · หน้านโยบายคืนบริษัท (tone = สีที่ UI แปลงเอง)
// → { tone, text, dateLabel, date } · dateLabel null = ไม่แสดงบรรทัดวันที่
// แก้ป้ายอย่างเดียว — status (popup/บอท/edge fn ใช้) ไม่เปลี่ยน: after_exp ใช้ deadline = exp เป็น "จุดเริ่มเตือน"
// จึงต้องแปลเองว่าก่อน exp = ยังคืนไม่ได้ · หลัง exp = คืนได้ (Rule #11)
export function returnPolicyLabel(rp) {
  if (!rp) return null
  const until = (tone, text) => ({ tone, text, dateLabel: rp.deadline ? 'คืนภายใน' : null, date: rp.deadline || null })
  const plain = (tone, text) => ({ tone, text, dateLabel: null, date: null })
  if (rp.shape === 'after_exp' && rp.expDate) {
    if (!rp.expired) return { tone: 'emerald', text: 'คืนได้หลังหมดอายุ', dateLabel: 'คืนได้ตั้งแต่', date: rp.expDate }
    if (rp.afterExpMonths == null) return plain('emerald', 'คืนได้แล้ว')
    if (rp.status === 'overdue') return until('red', 'พ้นกำหนดคืน')
    return until(rp.status === 'due' ? 'amber' : 'emerald', `คืนได้ภายใน ${rp.daysToDeadline} วัน`)
  }
  // age_tier: พ้นวันตก tier 100% แล้วแต่ยังคืนได้บางส่วน — วันตก tier ไม่ใช่เส้นตาย จึงไม่แสดงวันที่
  if (rp.shape === 'age_tier' && rp.status === 'overdue') {
    return rp.percent > 0 ? plain('orange', `คืนได้ ${rp.percent}%`) : plain('red', 'พ้นกำหนดคืน')
  }
  switch (rp.status) {
    case 'overdue': return until('red', 'พ้นกำหนดคืน')
    case 'due': return until('amber', `ต้องคืนใน ${rp.daysToDeadline} วัน`)
    case 'ok': return until('emerald', rp.deadline ? 'ยังไม่ถึงกำหนดคืน' : 'คืนได้')
    case 'no_return': return plain('slate', 'บริษัทไม่รับคืน')
    case 'review': return plain('slate', 'ต้องเช็กเอกสาร')
    case 'no_policy': return plain('slate', 'ไม่มีนโยบายคืน')
    default: return plain('slate', rp.ambiguous ? 'หลายบริษัท ไม่ประเมิน' : 'ไม่พบบิลของ lot')
  }
}

// ป้ายที่มาของข้อความนโยบาย — ข้อความจากบิลยาอื่นต้องบอกบิล/ยา/วันรับ (ไม่ใช่หลักฐานของ lot นี้)
export function policySourceNote(rp) {
  if (!rp?.policySource) return null
  if (rp.policySource !== 'company_bill' || !rp.policyRef) return POLICY_SOURCE_LABEL[rp.policySource]
  const ref = rp.policyRef
  const m = String(ref.receiveDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  const date = m ? ` · ${m[3]}/${m[2]}/${Number(m[1]) + 543}` : ''
  return `${POLICY_SOURCE_LABEL.company_bill} (บิล ${ref.billNumber || '-'}${ref.drugName ? ` · ${ref.drugName}` : ''}${date})`
}
