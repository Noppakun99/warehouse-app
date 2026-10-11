// drugProfile.js — บัตรยา + ช่องค้นหายา (Phase 2a ของแผน Dashboard 10/10/2569) — pure module (no supabase)
// นิยาม: CONTEXT.md §บัตรยา (Drug Profile) · §คงเหลือรวม (ระดับยา)
//
// กฎตัวเลขต้องตรงกับหน้าอื่นของระบบ (Rule #6) — ฟังก์ชันที่นี่จึงถูกใช้ร่วมกับ db.js:
//   stockTotalInMainUnit  = ยอดรวมของโมดอล "รายการยาในคลัง" (fetchStockSummary)
//   isBelowSafetyStock    = เกณฑ์ "ต่ำกว่า Safety Stock" ของ Dashboard (fetchDashboardAlerts.lowStock — Rule #13)
//   isPurchaseReceipt     = บิล "การซื้อ" ที่ใช้เลือกหน่วยซื้อล่าสุด (fetchLatestReceiptInfo / ReorderApp)
//   parseExpDate / parseUnitFactor = ตัวเดียวกับที่ db.js ใช้ (ย้ายมาที่นี่ให้ node รัน test ได้)

import { computeStats, fmtCoverage, thaiMonthLabel } from './reorder.js'

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
export function packUnitLabel(unit) {
  const { factor, base } = parseUnitFactor(unit)
  if (factor > 1) return `กล่อง (${factor.toLocaleString('en-US')} ${base})`
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

// แถวที่นับเข้ายอดคงเหลือ (= โมดอลรายการยาในคลัง): qty > 0 และไม่ตัดออกจากบัญชี
export const isStockRow = (row) => toNum(row?.qty) > 0 && !isDiscontinuedRow(row)

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

  const readyLots = lots.filter(l => !l.pending && !l.expired)
  const useFirst = readyLots.length > 1 ? readyLots[0] : null   // lot เดียวไม่ต้องบอก "ใช้ก่อน"

  const ssAgg = ssAggregate(rows)
  const discontinuedQty = rows.filter(r => isDiscontinuedRow(r) && toNum(r.qty) > 0).reduce((s, r) => s + toNum(r.qty), 0)
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
    discontinuedQty: round2(discontinuedQty),
    excludeStatus: excludeStatus || null,
    rate: usageRate({ usage, rows, mainUnit }),
    dispenseHistory: dispenseHistory(dispenseRows, department),
    receiveHistory: receiveRows.slice(0, HISTORY_LIMIT).map(receiveView),
    lastReceiveDate: receiveRows.reduce((m, r) => (r.receive_date && (!m || r.receive_date > m) ? r.receive_date : m), null),
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
