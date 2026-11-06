// formularyChange.js — ยาเข้าใหม่ / ยาตัดออกจากบัญชี / ทะเบียนมติ PTC (pure — ไม่ import supabase)
// นิยาม CONTEXT.md §ยาเข้าใหม่ · §ยาตัดออกจากบัญชี · ตาราง formulary_change (formulary_change_migration.sql)
//
// ยาเข้าใหม่มาจาก 2 ทาง:
//   (ก) คำนวณ — รหัสที่รับเข้าครั้งแรกในช่วงที่เลือก (ซื้อ/สนับสนุน/บริจาค) ไม่เคยรับก่อนช่วง และไม่เคยเบิกก่อนรับครั้งแรก
//       (เบิกก่อนรับ = ของยกยอดที่อยู่ในคลังมาก่อน receive_logs เริ่มเก็บ เช่น S018)
//   (ข) ทะเบียน PTC — มติเข้าบัญชีที่ยังไม่มีของ/ยังไม่มีรหัส แสดงเสมอจนของมา
// ยาตัดออก: ธงจริงอยู่ที่ Master คอลัมน์ A (inventory.receive_status มี 'ตัดออก') — ทะเบียนบอกแค่ว่ามีมติรองรับไหม

import { stockTotalInMainUnit } from './drugProfile.js'
import { addDaysYmd, fmtYmdBE } from './workQueue.js'

export const NEW_DRUG_DAYS = [30, 90]
export const NEW_DRUG_TYPES = ['การซื้อ', 'การสนับสนุน', 'การบริจาค']
export const RECEIVE_STATUS = { inspected: 'ตรวจรับแล้ว', pending: 'รอตรวจรับ' }
export const CHANGE_TYPE_LABEL = { in: 'เข้าบัญชี', out: 'ตัดออก' }
const TYPE_TAG = { 'การสนับสนุน': 'ยาสนับสนุน', 'การบริจาค': 'ยาบริจาค' }

// 'N วันล่าสุด' นับวันนี้เป็นวันแรก
export const windowFromYmd = (today, days) => addDaysYmd(today, 1 - days)

const normCode = (c) => {
  const s = String(c ?? '').trim()
  return s && s !== '-' ? s : ''
}
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0 }

/**
 * สรุปแถวรับของรหัสหนึ่ง: วันรับครั้งแรก/ล่าสุด + บริษัท/ราคาของแถวรับล่าสุด (ราคา 0/ว่าง ข้ามไปแถวก่อนหน้า)
 * @returns {{firstReceive, lastReceive, supplier, price, priceUnit}}
 */
export function receiveSummary(rows = []) {
  const dated = rows.filter(r => r.receive_date)
  if (dated.length === 0) return { firstReceive: null, lastReceive: null, supplier: '', price: null, priceUnit: '' }
  const sorted = [...dated].sort((a, b) => (a.receive_date < b.receive_date ? 1 : a.receive_date > b.receive_date ? -1 : (b.id || 0) - (a.id || 0)))
  const priced = sorted.find(r => num(r.price_per_unit) > 0)
  return {
    firstReceive: sorted[sorted.length - 1].receive_date,
    lastReceive: sorted[0].receive_date,
    supplier: String(sorted.find(r => String(r.supplier_current || '').trim())?.supplier_current || '').trim(),
    price: priced ? num(priced.price_per_unit) : null,
    priceUnit: String(priced?.drug_unit || '').trim(),
  }
}

/** มติล่าสุดของรหัส+ประเภท (มติหลายครั้งของรหัสเดียว = เอาวันที่ล่าสุด) */
export function ptcByCode(entries = [], changeType) {
  const map = new Map()
  for (const e of entries) {
    if (e.change_type !== changeType) continue
    const code = normCode(e.drug_code)
    if (!code) continue
    const cur = map.get(code)
    if (!cur || String(e.ptc_date) > String(cur.ptc_date)) map.set(code, e)
  }
  return map
}

/**
 * รายการยาเข้าใหม่
 * @param {object} p
 * @param {Array}  p.windowRows   receive_logs ช่วงยาวสุด (NEW_DRUG_DAYS สูงสุด) ทุกชนิดการรับ
 * @param {Set}    p.priorCodes   รหัสที่มีแถวรับก่อนช่วงยาวสุด (ทุกชนิด)
 * @param {Map}    p.firstDispense รหัส → วันเบิกแรกสุด 'YYYY-MM-DD'
 * @param {Array}  p.ptcEntries   formulary_change ทั้งหมด
 * @param {Map}    p.stockByCode  รหัส → แถว inventory ที่มีของ [{qty, unit}] (คงเหลือ — รวมรอตรวจรับ แบบบัตรยา)
 * @param {string} p.today        'YYYY-MM-DD'
 * @param {number} p.days         ช่วงที่เลือก
 * @returns {Array<{key, code, name, unit, firstReceive, lastReceive, supplier, price, total, types, inspectedQty, pendingQty, rows, ptc, status}>}
 *   status: 'inspected' (มีของตรวจรับแล้ว) | 'pending' (รอตรวจรับทั้งหมด) | 'noStock' (มติแล้ว ยังไม่เคยรับ) | 'noCode' (มติแล้ว ยังไม่มีรหัส)
 *   total: คงเหลือในหน่วยของแถวรับล่าสุด (null = มติที่ยังไม่มีของ)
 */
export function buildNewDrugs({ windowRows = [], priorCodes = new Set(), firstDispense = new Map(), ptcEntries = [], stockByCode = new Map(), today, days = NEW_DRUG_DAYS[0] } = {}) {
  const from = windowFromYmd(today, days)
  const ptcIn = ptcByCode(ptcEntries, 'in')

  const byCode = new Map()
  for (const r of windowRows) {
    const code = normCode(r.drug_code)
    if (!code || !r.receive_date || r.receive_date > today) continue
    const g = byCode.get(code) || { code, firstAny: r.receive_date, rows: [] }
    if (r.receive_date < g.firstAny) g.firstAny = r.receive_date
    g.rows.push(r)
    byCode.set(code, g)
  }

  const out = []
  for (const g of byCode.values()) {
    if (priorCodes.has(g.code)) continue
    const dispensed = firstDispense.get(g.code)
    if (dispensed && dispensed < g.firstAny) continue
    const rows = g.rows.filter(r => NEW_DRUG_TYPES.includes(r.purchase_type))
    if (rows.length === 0) continue
    const firstReceive = rows.reduce((m, r) => (r.receive_date < m ? r.receive_date : m), rows[0].receive_date)
    if (firstReceive < from) continue
    rows.sort((a, b) => (a.receive_date < b.receive_date ? 1 : a.receive_date > b.receive_date ? -1 : (b.id || 0) - (a.id || 0)))
    let inspectedQty = 0, pendingQty = 0
    for (const r of rows) {
      if (r.receive_status === RECEIVE_STATUS.inspected) inspectedQty += num(r.qty_received)
      else if (r.receive_status === RECEIVE_STATUS.pending) pendingQty += num(r.qty_received)
    }
    const unit = String(rows[0].drug_unit || '').trim()
    const recv = receiveSummary(rows)
    const stock = stockByCode.get(g.code) || []
    out.push({
      key: `r:${g.code}`, code: g.code, name: rows[0].drug_name || g.code,
      unit, firstReceive, lastReceive: recv.lastReceive, supplier: recv.supplier, price: recv.price,
      total: stock.length ? stockTotalInMainUnit(stock, unit) : 0,
      types: [...new Set(rows.map(r => r.purchase_type))],
      inspectedQty, pendingQty, rows, ptc: ptcIn.get(g.code) || null,
      status: inspectedQty > 0 ? 'inspected' : 'pending',
    })
  }
  out.sort((a, b) => (a.firstReceive < b.firstReceive ? 1 : a.firstReceive > b.firstReceive ? -1 : a.name.localeCompare(b.name)))

  // มติเข้าบัญชีที่ของยังไม่เคยมา — แสดงทุกช่วงวัน (ไม่ผูกกับวันรับ)
  const everReceived = new Set([...priorCodes, ...byCode.keys()])
  const waiting = []
  for (const e of ptcEntries) {
    if (e.change_type !== 'in') continue
    const code = normCode(e.drug_code)
    if (code && everReceived.has(code)) continue
    waiting.push({
      key: `p:${e.id}`, code, name: e.drug_name, unit: '', firstReceive: null, lastReceive: null, supplier: '', price: null, total: null, types: [],
      inspectedQty: 0, pendingQty: 0, rows: [], ptc: e, status: code ? 'noStock' : 'noCode',
    })
  }
  waiting.sort((a, b) => a.name.localeCompare(b.name))
  return [...out, ...waiting]
}

/** นับเฉพาะที่ของเข้าคลังแล้ว (ไม่รวมมติที่ยังรอของ) — ใช้เป็นตัวเลขในคิวงาน */
export const countReceivedNew = (list = []) => list.filter(d => d.status === 'inspected' || d.status === 'pending').length

/**
 * ข้อความไลน์แจ้งหน่วยงาน — เฉพาะยาที่มีของตรวจรับแล้ว (รอตรวจรับยังจ่ายไม่ได้) · ไม่มีรายการ = ''
 * ยาตัดออกไม่ใส่ (user ตัดสิน 05/11/2569 — แสดงในแอปอย่างเดียว)
 */
export function buildNewDrugLine(list = [], { today, days = NEW_DRUG_DAYS[0] } = {}) {
  const ready = list.filter(d => d.inspectedQty > 0)
  if (ready.length === 0) return ''
  const lines = [...ready]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(d => {
      const tags = [...new Set(d.types.map(t => TYPE_TAG[t]).filter(Boolean))]
      if (d.ptc) tags.push(`เข้าบัญชีตามมติ PTC ${fmtYmdBE(d.ptc.ptc_date)}`)
      return `- ${d.name} ${d.inspectedQty.toLocaleString()}${d.unit ? ` x ${d.unit}` : ''}${tags.length ? ` (${tags.join(' · ')})` : ''}`
    })
  return ['แจ้งจากคลังยา :', `ยาใหม่ในคลัง เบิกได้แล้ว (รับเข้า ${fmtYmdBE(windowFromYmd(today, days))} – ${fmtYmdBE(today)})`, ...lines].join('\n')
}

/**
 * ยาตัดออกจากบัญชี
 * @param {object} p
 * @param {Array} p.discontinued fetchDashboardAlerts().discontinued — [{code, name, rows:[{qty, unit, lot, exp, location}]}]
 * @param {Array} p.ptcEntries   formulary_change ทั้งหมด
 * @param {Map}   p.receiveByCode รหัส → แถว receive_logs (วันที่รับ/บริษัท/ราคา — inventory ไม่มี)
 * @param {boolean} p.onlyWithStock ตั้งต้น true = เฉพาะที่มีของเหลือ (+ มติที่ Master ยังไม่ตั้งธงเสมอ)
 * @returns {Array<{key, code, name, total, unit, lots, firstReceive, lastReceive, supplier, price, priceUnit, rows, ptc, notFlagged}>}
 */
export function buildFormularyOut({ discontinued = [], ptcEntries = [], receiveByCode = new Map(), onlyWithStock = true } = {}) {
  const ptcOut = ptcByCode(ptcEntries, 'out')
  const flagged = new Set()
  const list = discontinued.map(d => {
    const code = normCode(d.code)
    if (code) flagged.add(code)
    const stock = (d.rows || []).filter(r => num(r.qty) > 0)
    const unit = String((stock[0] || d.rows?.[0] || {}).unit || '').trim()
    return {
      key: `f:${code || d.name}`, code, name: d.name || code, unit,
      total: stock.length ? stockTotalInMainUnit(stock, unit) : 0,
      lots: stock.length, ...receiveSummary(receiveByCode.get(code) || []),
      rows: stock, ptc: ptcOut.get(code) || null, notFlagged: false,
    }
  })
  // มติตัดออกแล้ว แต่ Master คอลัมน์ A ยังไม่ตั้งธง — ต้องเห็นเสมอ (แอปยังถือว่าเป็นยาในบัญชี)
  for (const [code, e] of ptcOut) {
    if (flagged.has(code)) continue
    list.push({ key: `p:${e.id}`, code, name: e.drug_name, unit: '', total: null, lots: 0, ...receiveSummary([]), rows: [], ptc: e, notFlagged: true })
  }
  return list
    .filter(d => !onlyWithStock || d.notFlagged || d.total > 0)
    .sort((a, b) => (Number(b.notFlagged) - Number(a.notFlagged)) || ((b.total || 0) - (a.total || 0)) || a.name.localeCompare(b.name))
}

/** ทะเบียนเรียง มติล่าสุดก่อน → เข้าก่อนออก → ชื่อ */
export function sortRegistry(entries = []) {
  return [...entries].sort((a, b) =>
    (String(b.ptc_date) > String(a.ptc_date) ? 1 : String(b.ptc_date) < String(a.ptc_date) ? -1 : 0)
    || (a.change_type === b.change_type ? 0 : a.change_type === 'in' ? -1 : 1)
    || String(a.drug_name).localeCompare(String(b.drug_name)))
}

/** ตรวจฟอร์มทะเบียน — คืนข้อความผิดพลาด หรือ null */
export function validateFormularyEntry(f = {}) {
  if (!['in', 'out'].includes(f.change_type)) return 'เลือกประเภทมติ (เข้าบัญชี / ตัดออก)'
  if (!String(f.drug_name || '').trim()) return 'กรอกชื่อยาตามเอกสารมติ'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.ptc_date || ''))) return 'เลือกวันที่ประชุม PTC'
  if (f.change_type === 'out' && !normCode(f.drug_code)) return 'ยาตัดออกต้องมีรหัสยา (ยาที่มีในคลัง)'
  return null
}

/** ค่าที่จะเขียน DB — trim + รหัสว่างเป็น null */
export function normalizeFormularyEntry(f = {}) {
  const t = (v) => { const s = String(v ?? '').trim(); return s || null }
  return {
    change_type: f.change_type, drug_code: normCode(f.drug_code) || null, drug_name: String(f.drug_name || '').trim(),
    ptc_date: f.ptc_date, ptc_ref: t(f.ptc_ref), note: t(f.note),
  }
}
