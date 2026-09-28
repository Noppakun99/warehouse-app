// excelSync.js — ปุ่ม "นำเข้าจาก Excel": อ่าน ยอดคลังยา_69.xlsm (ชีท Master + เบิก) → เทียบกับ DB → แผนที่ให้คนตรวจก่อนเขียน
//
// pure module: ไม่ import supabase — รัน golden test ใน node ได้ (npm run test:excelsync)
// ตัวอ่านชีทใช้ masterSheet.js / dispenseSheet.js ตัวเดียวกับ CLI (scripts/import-*.mjs) — ห้ามเขียนตัวอ่านใหม่
//
// หลัก (ADR-0027): Excel เป็นตัวจริงของ inventory + dispense_logs — การเขียนยังเป็น DELETE ALL → INSERT
// ผ่าน saveInventory / insertDispenseRows เหมือน CLI; ส่วนต่างในไฟล์นี้มีไว้ "ให้คนเห็นก่อนกด" เท่านั้น
//
// ⚠️ ส่วนต่างต้องคำนวณจาก "แถวหน้าตาเดียวกับที่จะเขียนลง DB จริง" (flattenInventory / backfillDrugUnit)
//    ไม่งั้นไฟล์ที่ไม่ได้แก้อะไรจะโชว์ว่ามีของเปลี่ยน — db.js จึงเรียก 2 ฟังก์ชันนี้ด้วย

import { parseMasterGrid, MASTER_SHEET_NAME } from './masterSheet.js'
import { parseDispenseGrid, DISPENSE_SHEET_NAME } from './dispenseSheet.js'
import { parseReceiveGrid, RECEIVE_SHEET_NAME } from './receiveSheet.js'
import { parseLoanGrid, diffLoanImport } from './loanImport.js'
import { runGuards, summarize } from './importGuard.js'
import { serialToThai } from './excelSerial.js'

// ── แปลงเป็นแถวที่จะเขียนลง DB (ใช้ร่วมกับ db.js) ────────────────────

/** object แผนผัง { location: [item] } → แถว inventory (ไม่รวม updated_at — db.js เติมเอง) */
export function flattenInventory(inventoryObj = {}) {
  const rows = []
  Object.entries(inventoryObj).forEach(([location, items]) => {
    items.forEach(item => {
      rows.push({
        location,
        code: item.code || '-',
        name: item.name,
        type: item.type || '-',
        unit: item.unit || '-',
        lot: item.lot || '-',
        exp: item.exp || '-',
        qty: item.qty || '0',
        invoice: item.invoice || '-',
        main_log: item.mainLog || null,
        item_type: item.itemType || null,
        receive_status: item.receiveStatus || 'ไม่มีการดำเนินการ',
        safety_stock: item.safetyStock != null ? item.safetyStock : null,
      })
    })
  })
  return rows
}

/** เติมนโยบายคืนยาที่ชีทไม่มี จากแถวเดิมใน DB ที่รหัสยาเดียวกัน (ตัวเดียวกับที่ insertReceiveRows ใช้)
 *  @param dbRows [{ drug_code, drug_swap_policy }] */
export function backfillSwapPolicy(rows = [], dbRows = []) {
  const byCode = {}
  dbRows.forEach(d => { if (d.drug_code && d.drug_swap_policy && !byCode[d.drug_code]) byCode[d.drug_code] = d.drug_swap_policy })
  rows.forEach(r => { if (!r.drug_swap_policy && byCode[r.drug_code]) r.drug_swap_policy = byCode[r.drug_code] })
  return rows
}

/** เติม drug_unit ที่ว่างจากแถวอื่นที่รหัสยาเดียวกัน (แก้แถวเดิม in-place + คืนแถวเดิม) */
export function backfillDrugUnit(rows = []) {
  const unitByCode = {}
  rows.forEach(r => {
    if (r.drug_unit && r.drug_unit !== '-' && r.drug_code && r.drug_code !== '-') unitByCode[r.drug_code] = r.drug_unit
  })
  rows.forEach(r => {
    if ((!r.drug_unit || r.drug_unit === '-') && r.drug_code && r.drug_code !== '-' && unitByCode[r.drug_code]) {
      r.drug_unit = unitByCode[r.drug_code]
    }
  })
  return rows
}

// ── นิยามคอลัมน์ที่เทียบ ─────────────────────────────────────────────
// num: เทียบเป็นตัวเลขปัด 4 ตำแหน่ง — DB เก็บราคา numeric 4 ตำแหน่ง แต่ไฟล์มี 13 ตำแหน่ง
//      (ไม่ปัด = 17 แถวโชว์ว่า "เปลี่ยน" ทุกรอบทั้งที่ไม่มีอะไรเปลี่ยน — เจอ 2026-09-28)
// money: ปัด 2 ตำแหน่ง — receive_logs.total_price_vat เก็บ 2 ตำแหน่ง ไฟล์มีมากกว่า (1599.9984 vs 1600)
// date: ตัดเหลือ YYYY-MM-DD

export const INVENTORY_SPEC = {
  fields: [
    ['location', 'ที่เก็บ'], ['code', 'รหัสยา'], ['name', 'ชื่อยา'], ['type', 'ชนิด'], ['unit', 'หน่วย'],
    ['lot', 'Lot'], ['exp', 'วันหมดอายุ'], ['qty', 'คงเหลือ', 'num'], ['invoice', 'เลขที่บิล'],
    ['main_log', 'MainLog'], ['item_type', 'ชนิดรายการ'], ['receive_status', 'สถานะตรวจรับ'],
    ['safety_stock', 'Safety Stock', 'num'],
  ],
  // แถวเดียวกันที่ "ค่าเปลี่ยน" — จับคู่ด้วยตัวตนของกองยา
  pairKey: ['location', 'code', 'lot', 'exp', 'invoice'],
}

export const DISPENSE_SPEC = {
  fields: [
    ['dispense_date', 'วันที่เบิก', 'date'], ['main_log', 'MainLog'], ['detail_log', 'ที่เก็บ'],
    ['department', 'หน่วยงาน'], ['note', 'หมายเหตุ'], ['drug_code', 'รหัสยา'], ['drug_name', 'ชื่อยา'],
    ['drug_type', 'ชนิด'], ['item_type', 'ชนิดรายการ'], ['drug_unit', 'หน่วย'],
    ['price_per_unit', 'ราคา/หน่วย', 'num'], ['lot', 'Lot'], ['exp', 'วันหมดอายุ'],
    ['near_exp_date', 'วันที่ใกล้ exp', 'date'], ['qty_before', 'คงเหลือก่อนเบิก', 'num'],
    ['qty_out', 'ปริมาณออก', 'num'], ['qty_after', 'คงเหลือหลังจ่าย', 'num'], ['source', 'ที่มา'],
  ],
  pairKey: ['dispense_date', 'drug_code', 'lot', 'department', 'qty_before'],
}

// คอลัมน์ = ที่ rowToReceiveLog (receiveSheet.js) สร้าง — ถ้าเพิ่มคอลัมน์ที่นั่น ต้องเพิ่มที่นี่ด้วย
export const RECEIVE_SPEC = {
  fields: [
    ['order_date', 'วันที่สั่ง', 'date'], ['receive_date', 'วันที่รับ', 'date'], ['inspect_date', 'วันที่ตรวจรับ', 'date'],
    ['leadtime', 'Lead time'], ['inspect_lag', 'ระยะตรวจรับ'], ['bill_number', 'เลขที่บิล'], ['po_number', 'เลขที่ PO'],
    ['purchase_type', 'ประเภทการซื้อ'], ['receive_status', 'สถานะตรวจรับ'], ['main_log', 'MainLog'], ['detail_log', 'ที่เก็บ'],
    ['drug_code', 'รหัสยา'], ['drug_name', 'ชื่อยา'], ['drug_type', 'ชนิด'], ['item_type', 'ชนิดรายการ'], ['drug_unit', 'หน่วย'],
    ['supplier_current', 'บริษัท'], ['supplier_prev', 'บริษัทเดิม'], ['supplier_changed', 'เปลี่ยนบริษัท'],
    ['lot', 'Lot'], ['exp', 'วันหมดอายุ'], ['note', 'หมายเหตุ'], ['exp_note', 'หมายเหตุ exp'],
    ['qty_received', 'จำนวนรับ', 'num'], ['unit_per_bill', 'หน่วยในบิล'], ['price_per_unit', 'ราคา/หน่วย', 'num'],
    ['total_price_vat', 'มูลค่ารวม VAT', 'money'], ['total_price_formula', 'สูตรมูลค่า'], ['safety_stock', 'Safety Stock', 'num'],
    ['sum_of_lead_time', 'Sum lead time', 'num'], ['drug_swap_policy', 'นโยบายคืนยา'], ['swap_tier_detail', 'เงื่อนไขคืน (tier)'],
    ['swap_return_pct', '% คืน'], ['swap_condition_am', 'เงื่อนไข Auto-Match'],
  ],
  pairKey: ['bill_number', 'drug_code', 'lot', 'receive_date'],
}

const txt = (v) => String(v ?? '').trim()

export function normValue(v, kind) {
  if (kind === 'money') {
    if (v == null || v === '') return ''
    const n = Number(String(v).replace(/,/g, ''))
    return Number.isFinite(n) ? n.toFixed(2) : txt(v)
  }
  if (kind === 'num') {
    if (v == null || v === '') return ''
    const n = Number(String(v).replace(/,/g, ''))
    return Number.isFinite(n) ? String(Number(n.toFixed(4))) : txt(v)
  }
  if (kind === 'date') return txt(v).slice(0, 10)
  return txt(v)
}

const keyOf = (row, spec, names) => names.map(n => {
  const f = spec.fields.find(x => x[0] === n)
  return normValue(row[n], f?.[2])
}).join('|')

export const fingerprint = (row, spec) => keyOf(row, spec, spec.fields.map(f => f[0]))

/**
 * เทียบแถวใหม่ (ไฟล์) กับแถวเดิม (DB) แบบ multiset — แถวซ้ำกันจริงได้ (inventory มีแถว code+lot ซ้ำจริง)
 * 1) แถวที่เหมือนกันทุกช่อง = ไม่เปลี่ยน
 * 2) ที่เหลือจับคู่ด้วย pairKey → "แก้ค่า" (บอกรายช่อง)
 * 3) ที่จับคู่ไม่ได้ = เพิ่ม / ลบ
 * @returns { unchanged, added, removed, changed: [{ prev, next, fields: [{field,label,from,to}] }] }
 */
export function diffRows(nextRows = [], prevRows = [], spec) {
  const pool = new Map()
  prevRows.forEach(r => {
    const k = fingerprint(r, spec)
    if (!pool.has(k)) pool.set(k, [])
    pool.get(k).push(r)
  })
  let unchanged = 0
  const restNext = []
  nextRows.forEach(r => {
    const arr = pool.get(fingerprint(r, spec))
    if (arr && arr.length) { arr.pop(); unchanged++ } else restNext.push(r)
  })
  const restPrev = [...pool.values()].flat()

  const byPair = new Map()
  const sortFp = (a, b) => fingerprint(a, spec).localeCompare(fingerprint(b, spec))
  restPrev.slice().sort(sortFp).forEach(r => {
    const k = keyOf(r, spec, spec.pairKey)
    if (!byPair.has(k)) byPair.set(k, [])
    byPair.get(k).push(r)
  })
  const changed = []
  const added = []
  restNext.slice().sort(sortFp).forEach(r => {
    const arr = byPair.get(keyOf(r, spec, spec.pairKey))
    if (!arr || !arr.length) { added.push(r); return }
    const prev = arr.shift()
    const fields = spec.fields
      .filter(([n, , kind]) => normValue(prev[n], kind) !== normValue(r[n], kind))
      .map(([n, label, kind]) => ({ field: n, label, from: normValue(prev[n], kind), to: normValue(r[n], kind) }))
    changed.push({ prev, next: r, fields })
  })
  const removed = [...byPair.values()].flat()
  return { unchanged, added, removed, changed }
}

/** นับว่าช่องไหนเปลี่ยนกี่แถว — "สถานะตรวจรับ 15 แถว" อ่านง่ายกว่าไล่ดูทีละแถว */
export function summarizeChangedFields(changed = []) {
  const m = new Map()
  changed.forEach(c => c.fields.forEach(f => {
    const cur = m.get(f.field) || { field: f.field, label: f.label, count: 0 }
    cur.count++
    m.set(f.field, cur)
  }))
  return [...m.values()].sort((a, b) => b.count - a.count)
}

// ── ด่านตรวจเฉพาะปุ่มในแอป (เพิ่มจาก importGuard ที่ CLI ใช้) ──────────
// overridable: true = คนติ๊ก "ฉันตรวจแล้ว นำเข้าต่อ" ได้ (เท่ากับ --force ของ CLI)
//              false = ห้ามข้ามเด็ดขาด

const fmtDateTime = (ms) => new Date(ms).toLocaleString('th-TH', {
  timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

/** ไฟล์แก้ล่าสุดก่อนการนำเข้าครั้งล่าสุด = อาจเป็นสำเนาเก่า/อีกเครื่องหนึ่ง
 *  Master ไม่มีวันที่ให้ checkStale ใช้ จึงต้องพึ่งด่านนี้ (เหตุการณ์ 2026-09-28: ไฟล์ 2 เครื่องค่าไม่ตรงกัน) */
export function checkFileOlderThanImport(fileModifiedMs, lastImport) {
  const at = lastImport?.at ? Date.parse(lastImport.at) : NaN
  if (!fileModifiedMs || !Number.isFinite(at) || fileModifiedMs >= at) return null
  return {
    level: 'blocker', overridable: true, code: 'file_older_than_import',
    message: `ไฟล์นี้แก้ล่าสุด ${fmtDateTime(fileModifiedMs)} แต่ระบบนำเข้าครั้งล่าสุดเมื่อ ${fmtDateTime(at)}` +
      (lastImport.user ? ` โดย ${lastImport.user}` : '') + ' — อาจเป็นสำเนาเก่าหรือไฟล์ของอีกเครื่อง',
  }
}

/** Master บอก "รอตรวจรับ" แต่ประวัติรับยาบอกว่าบิลนั้นตรวจรับแล้ว — นำเข้าไปจะทำให้ยาจ่ายไม่ได้
 *  (เหตุการณ์ 2026-09-28: 15 lot ในชีทยังค้างสถานะเก่า ด่านเดิมทั้ง 6 ผ่านหมด)
 *  @param receiveRows [{ drug_code, lot, bill_number, receive_status }] */
export function findReceiveStatusConflicts(inventoryRows = [], receiveRows = []) {
  const inspected = new Set()
  receiveRows.forEach(r => {
    if (txt(r.receive_status) === 'ตรวจรับแล้ว') inspected.add(`${txt(r.drug_code)}|${txt(r.lot)}|${txt(r.bill_number)}`)
  })
  return inventoryRows.filter(r => {
    if (txt(r.receive_status).split('|')[0].trim() !== 'รอตรวจรับ') return false
    const bills = txt(r.invoice).split(',').map(b => b.trim()).filter(b => b && b !== '-')
    return bills.some(b => inspected.has(`${txt(r.code)}|${txt(r.lot)}|${b}`))
  })
}

export function checkReceiveStatusConflicts(conflicts = []) {
  if (!conflicts.length) return null
  return {
    level: 'blocker', overridable: true, code: 'receive_status_conflict',
    message: `ชีท Master บอก "รอตรวจรับ" ${conflicts.length} แถว แต่ประวัติรับยาบอกว่าบิลนั้นตรวจรับแล้ว — ` +
      'ถ้านำเข้า ยาเหล่านี้จะขึ้นว่ายังจ่ายไม่ได้ ควรแก้สถานะในชีท Master ก่อน',
  }
}

/** แถวเบิกที่แอปสร้างเอง (source ≠ csv) จะหายตอนลบทั้งตาราง — ADR-0027 ยอมให้ Excel ทับได้
 *  เฉพาะตอนที่ทุกแถวมาจากไฟล์ ถ้าวันหนึ่งแอปบันทึกการเบิกเอง ต้องหยุดแล้วทบทวน ADR */
export function checkAppOnlyDispense(appOnlyCount = 0) {
  if (!appOnlyCount) return null
  return {
    level: 'blocker', overridable: false, code: 'app_only_dispense',
    message: `ประวัติเบิกมี ${appOnlyCount} แถวที่บันทึกจากในแอป (ไม่ได้มาจากไฟล์) — ถ้านำเข้าจะหายทั้งหมด ห้ามนำเข้าจนกว่าจะตัดสินใจเรื่องนี้ (ADR-0027)`,
  }
}

// ── อ่านไฟล์ ─────────────────────────────────────────────────────────

/** workbook → grid ของ 2 ชีท (ค่าดิบ — วันที่เป็น serial ห้ามใช้ค่าที่แสดง)
 *  @param data ArrayBuffer / Uint8Array ของไฟล์ */
export function readWorkbookGrids(XLSX, data) {
  const wb = XLSX.read(data, { type: 'array', sheets: [MASTER_SHEET_NAME, DISPENSE_SHEET_NAME], cellDates: false })
  const grid = (name) => {
    const ws = wb.Sheets[name]
    if (!ws) throw new Error(`ไม่พบชีท "${name}" ในไฟล์` + (name.endsWith(' ') ? ' (ชื่อชีทมีเว้นวรรคต่อท้าย)' : ''))
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true })
  }
  return { masterGrid: grid(MASTER_SHEET_NAME), dispenseGrid: grid(DISPENSE_SHEET_NAME) }
}

// ── รวมเป็นแผน ─────────────────────────────────────────────────────

const asMasterGuard = () => ({ receive_date: null, total_price_vat: 0, bill_number: null, drug_code: null })
const asDispenseGuard = (r) => ({ receive_date: r.dispense_date, total_price_vat: Number(r.qty_out) || 0, bill_number: null, drug_code: r.drug_code })
const tag = (list, overridable = true) => list.map(x => ({ overridable, ...x }))

/**
 * @param p.masterGrid / p.dispenseGrid   จาก readWorkbookGrids
 * @param p.prevInventory / p.prevDispense แถวปัจจุบันใน DB (คอลัมน์ตาม SPEC)
 * @param p.receiveRows    receive_logs (drug_code, lot, bill_number, receive_status)
 * @param p.lastImport     { at, user } การนำเข้าครั้งล่าสุด (จาก audit_logs)
 * @param p.fileModifiedMs File.lastModified
 * @param p.appOnlyDispenseCount  จำนวน dispense_logs ที่ source ≠ 'csv'
 * @returns แผน — ok=false แปลว่ามี blocker; canOverride=true แปลว่าทุก blocker ข้ามได้ด้วยการติ๊กยืนยัน
 */
export function buildSyncPlan(p) {
  const master = parseMasterGrid(p.masterGrid, serialToThai)
  const inventoryRows = flattenInventory(master.inventory)
  const dispense = parseDispenseGrid(p.dispenseGrid, p.today)
  const dispenseRows = backfillDrugUnit(dispense.rows)

  const prevInv = p.prevInventory || []
  const prevDisp = p.prevDispense || []
  const invGuard = runGuards(inventoryRows.map(asMasterGuard), summarize(prevInv.map(asMasterGuard)), [])
  const dispGuard = runGuards(dispenseRows.map(asDispenseGuard), summarize(prevDisp.map(asDispenseGuard)), [])

  const inventoryDiff = diffRows(inventoryRows, prevInv, INVENTORY_SPEC)
  const dispenseDiff = diffRows(dispenseRows, prevDisp, DISPENSE_SPEC)
  const changed = (d) => d.added.length + d.removed.length + d.changed.length > 0
  const hasChanges = changed(inventoryDiff) || changed(dispenseDiff)

  const conflicts = findReceiveStatusConflicts(inventoryRows, p.receiveRows || [])
  // ไฟล์เดียวกันทั้ง 2 ชีท — ด่านของชีทไหนติด ก็บล็อกทั้งไฟล์ (Master ไม่มีวันที่ ต้องพึ่งด่านของชีทเบิก)
  const blockers = [
    ...tag(invGuard.blockers.map(b => ({ ...b, sheet: 'Master' }))),
    ...tag(dispGuard.blockers.map(b => ({ ...b, sheet: 'เบิก' }))),
    // ไม่มีส่วนต่าง = ไม่มีอะไรจะเขียนทับ — ไม่งั้นเปิดไฟล์เดิมหลังนำเข้าเสร็จจะโดนเตือนทุกครั้ง
    // (เวลาแก้ไฟล์ย่อมก่อนเวลานำเข้าเสมอ) คนจะชินกับกรอบแดงจนไม่อ่านตอนเจอไฟล์ของอีกเครื่องจริง
    hasChanges ? checkFileOlderThanImport(p.fileModifiedMs, p.lastImport) : null,
    checkReceiveStatusConflicts(conflicts),
    checkAppOnlyDispense(p.appOnlyDispenseCount),
  ].filter(Boolean)
  const warnings = [
    ...invGuard.warnings.filter(w => w.code !== 'value_swing').map(w => ({ ...w, sheet: 'Master' })),
    ...dispGuard.warnings.filter(w => w.code !== 'value_swing').map(w => ({ ...w, sheet: 'เบิก' })),
  ]

  const dates = dispenseRows.map(r => r.dispense_date).filter(Boolean).sort()

  return {
    inventory: { rows: inventoryRows, inventoryObj: master.inventory, diff: inventoryDiff, count: inventoryRows.length, prevCount: prevInv.length, changedFields: summarizeChangedFields(inventoryDiff.changed) },
    dispense: { rows: dispenseRows, diff: dispenseDiff, count: dispenseRows.length, prevCount: prevDisp.length, warnings: dispense.warnings, firstDate: dates[0] || null, lastDate: dates[dates.length - 1] || null, changedFields: summarizeChangedFields(dispenseDiff.changed) },
    conflicts,
    blockers,
    warnings,
    ok: blockers.length === 0,
    canOverride: blockers.every(b => b.overridable),
    hasChanges,
  }
}

// ── ไฟล์ที่ 2: รับจากการซื้อ_ยืม_…xlsm (ชีท รับยา + รพ.ยืมยา) ──────────────

export const LOAN_SHEET_NAME = 'รพ.ยืมยา'

/** workbook ไฟล์รับยา → grid ของ 2 ชีท
 *  fmtGrid (ค่าที่ Excel แสดง) ใช้เฉพาะคอลัมน์ enum/ข้อความ (% คืน, exp ของยืมยา) — ห้ามใช้กับวันที่ */
export function readReceiveWorkbookGrids(XLSX, data) {
  const wb = XLSX.read(data, { type: 'array', sheets: [RECEIVE_SHEET_NAME, LOAN_SHEET_NAME], cellDates: false })
  const need = (name) => {
    const ws = wb.Sheets[name]
    if (!ws) throw new Error(`ไม่พบชีท "${name}" ในไฟล์ — เลือกไฟล์รับยาถูกตัวไหม (รับจากการซื้อ_ยืม_…xlsm)`)
    return ws
  }
  const rws = need(RECEIVE_SHEET_NAME)
  const lws = need(LOAN_SHEET_NAME)
  const aoa = (ws, raw, blankrows) => XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw, blankrows })
  return {
    receiveGrid: aoa(rws, true, true), receiveFmtGrid: aoa(rws, false, true),
    // ตรงกับ scripts/import-loan.mjs — blankrows:false
    loanGrid: aoa(lws, true, false), loanFmtGrid: aoa(lws, false, false),
  }
}

/**
 * แผนของไฟล์รับยา
 * - รับยา → receive_logs: DELETE ALL → INSERT (insertReceiveRows) — ของที่มีแต่ในแอป (สถานะ AP/รูปตรวจรับ/บิลสแกน) จะหาย
 *   → ด่าน app_only_data **ห้ามข้าม** (สกิล import-excel: ห้าม --force ด่านนี้)
 * - รพ.ยืมยา → drug_loan: เพิ่ม/แก้เฉพาะที่เปลี่ยน ไม่ลบแถวที่หายจากไฟล์ (อาจยังค้างคืนจริง — ADR-0025)
 * @param p.prevReceive  receive_logs เดิม (คอลัมน์ตาม RECEIVE_SPEC)
 * @param p.atRisk       [{ bill_number, reason }] แถวที่มีร่องรอยงานในแอป
 * @param p.prevLoans    drug_loan เดิม (fetchDrugLoans)
 */
export function buildReceivePlan(p) {
  const parsed = parseReceiveGrid(p.receiveGrid, p.receiveFmtGrid)
  const prevReceive = p.prevReceive || []
  const receiveRows = backfillSwapPolicy(parsed.rows, prevReceive)
  const receiveDiff = diffRows(receiveRows, prevReceive, RECEIVE_SPEC)

  const loanParsed = parseLoanGrid(p.loanGrid, serialToThai, p.loanFmtGrid)
  const loanDiff = diffLoanImport(loanParsed.rows, p.prevLoans || [])

  const changed = (d) => d.added.length + d.removed.length + d.changed.length > 0
  const receiveChanged = changed(receiveDiff)
  const loanChanged = loanDiff.inserts.length + loanDiff.updates.length > 0

  const guard = runGuards(receiveRows, summarize(prevReceive), p.atRisk || [])
  const blockers = [
    ...guard.blockers.map(b => ({ ...b, sheet: 'รับยา', overridable: b.code !== 'app_only_data' })),
    receiveChanged || loanChanged ? checkFileOlderThanImport(p.fileModifiedMs, p.lastImport) : null,
  ].filter(Boolean)
  const warnings = [
    ...guard.warnings.map(w => ({ ...w, sheet: 'รับยา' })),
    loanParsed.errors.length ? { code: 'loan_parse', sheet: 'รพ.ยืมยา', message: `อ่านไม่ได้ ${loanParsed.errors.length} แถว — ${loanParsed.errors.slice(0, 3).map(e => `บรรทัด ${e.lineNo}: ${e.reason}`).join(' · ')}` } : null,
    loanDiff.duplicates.length ? { code: 'loan_duplicate', sheet: 'รพ.ยืมยา', message: `แถวซ้ำกันในไฟล์ ${loanDiff.duplicates.length} แถว — ข้ามแถวหลัง` } : null,
    loanDiff.missing.length ? { code: 'loan_missing', sheet: 'รพ.ยืมยา', message: `มีในแอปแต่ไม่มีในไฟล์ ${loanDiff.missing.length} แถว — เก็บไว้ ไม่ลบ (อาจยังค้างคืน)` } : null,
  ].filter(Boolean)
  const dates = receiveRows.map(r => r.receive_date).filter(Boolean).sort()

  return {
    receive: { rows: receiveRows, diff: receiveDiff, count: receiveRows.length, prevCount: prevReceive.length, warnings: parsed.warnings, lastDate: dates[dates.length - 1] || null, changedFields: summarizeChangedFields(receiveDiff.changed), changed: receiveChanged },
    loan: { rows: loanParsed.rows, diff: loanDiff, count: loanParsed.rows.length, prevCount: (p.prevLoans || []).length, changed: loanChanged },
    blockers,
    warnings,
    hasChanges: receiveChanged || loanChanged,
  }
}

/** รวมแผน 2 ไฟล์ (ไฟล์ไหนไม่ได้เลือก = null) — ด่านของไฟล์ไหนติด ก็บล็อกทั้งรอบ
 *  (Master เทียบสถานะตรวจรับกับชีทรับยาในรอบเดียวกัน ถ้าเขียนแค่ไฟล์เดียว ข้อมูล 2 ฝั่งจะขัดกัน) */
export function combinePlans(stock, receive) {
  const label = (list, file) => list.map(x => ({ ...x, file }))
  // ไฟล์ที่ไม่มีส่วนต่าง = ไม่มีอะไรจะเขียน → ทำให้อะไรเสียไม่ได้ ด่านของมันจึงเหลือแค่ "เตือน"
  // (ไม่งั้นสถานะค้างใน Master ที่นำเข้าไปแล้ว บล็อกไฟล์รับยาที่ไม่เกี่ยวไปด้วย — เจอ 2026-09-28)
  const split = (plan, file) => {
    const list = label(plan?.blockers || [], file)
    return plan?.hasChanges ? { block: list, warn: [] } : { block: [], warn: list }
  }
  const s = split(stock, 'ยอดคลังยา')
  const r = split(receive, 'รับยา')
  const blockers = [...s.block, ...r.block]
  return {
    stock, receive, blockers,
    warnings: [...s.warn, ...r.warn, ...label(stock?.warnings || [], 'ยอดคลังยา'), ...label(receive?.warnings || [], 'รับยา')],
    ok: blockers.length === 0,
    canOverride: blockers.every(b => b.overridable),
    hasChanges: !!(stock?.hasChanges || receive?.hasChanges),
  }
}
