// หน้าเบิกยาของเจ้าหน้าที่คลัง — ขั้นของใบในคิว · lot ที่จะจ่าย/ที่จัดจริงต่อรายการ · ผลการจัด · เรียงตามที่เก็บ
// pure module (ไม่ import supabase) → npm run test:reqstaff · หน้าตาตาม docs/mockups/requisition-staff.html (user เคาะ 15/11/2569)
import { allocateFefo } from './lotAllocation.js'
import { awaitsSheetEntry } from './onlineReqPlan.js'
import { sortRowsByLog } from './reqSheetFormat.js'

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const lotKey = (lot) => String(lot ?? '').trim()

// สถานะใบ (requisitions.status) → ขั้นงานของคลัง
// ready = ตรวจแล้วรอจ่ายออก (flow เดิม) — flow ใหม่ "ตรวจแล้ว จ่ายออก" กดครั้งเดียว ไม่ผ่านขั้นนี้
export const STAGE_OF_STATUS = {
  pending: 'pending', approved: 'pick', partial: 'pick', picking: 'check', ready: 'ready',
  dispensed: 'done', received: 'recv', rejected: 'rej',
}
export const stageOf = (req) => STAGE_OF_STATUS[req?.status] || 'pending'

export const QUEUE_TABS = [
  { key: 'pending', label: 'รอลงชีท/อนุมัติ', stages: ['pending'] },
  { key: 'pick', label: 'รอจัด', stages: ['pick'] },
  { key: 'check', label: 'รอตรวจจ่าย', stages: ['check', 'ready'] },
  { key: 'hist', label: 'ประวัติ', stages: ['done', 'recv', 'rej'] },
]
export const tabOf = (req) => (QUEUE_TABS.find(t => t.stages.includes(stageOf(req))) || QUEUE_TABS[3]).key

// ขั้นถัดไปของใบ (คอลัมน์ "ขั้นถัดไป" ในคิว + ป้ายหัวใบ) · tone = ชื่อชุดสีใน component
export function nextStep(req) {
  const st = stageOf(req)
  if (st === 'pending') return awaitsSheetEntry(req)
    ? { label: 'รอลงชีทเบิก', sub: 'ลงชีทแล้วได้เลข บย. → พร้อมจัด', tone: 'amber' }
    : { label: 'รออนุมัติ', sub: 'ตรวจรายการแล้วอนุมัติ', tone: 'amber' }
  if (st === 'pick') return { label: 'รอจัดยา', sub: req.sheet_entered_at ? 'จัดตาม lot ในชีท' : 'จัดตาม lot ที่ระบบเสนอ', tone: 'blue' }
  if (st === 'check') return { label: 'รอตรวจจ่าย', sub: req.picker_name ? `ผู้จัด ${req.picker_name}` : 'จัดเสร็จแล้ว', tone: 'violet' }
  if (st === 'ready') return { label: 'ตรวจแล้ว รอจ่ายออก', sub: req.verifier_name ? `ผู้ตรวจ ${req.verifier_name}` : '', tone: 'violet' }
  if (st === 'done') return { label: 'จ่ายแล้ว รอผู้เบิกรับ', sub: '', tone: 'teal' }
  if (st === 'recv') return { label: 'ผู้เบิกรับแล้ว', sub: req.received_by ? `ผู้รับ ${req.received_by}` : '', tone: 'green' }
  return { label: 'ไม่อนุมัติ', sub: '', tone: 'red' }
}

// "วันนี้" / "รอ 3 วัน" — นับตามวันปฏิทิน ไม่ใช่ 24 ชม.
export function waitText(iso, today = new Date()) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((b - a) / 864e5)
  return days <= 0 ? 'วันนี้' : `รอ ${days} วัน`
}

// picked_allocation จากชีท/จากการจัด → รูปเดียวกัน (packSize/packs ครบ · ตัดแถว 0)
export function normAllocation(list) {
  return (Array.isArray(list) ? list : []).map(a => {
    const base = n(a.base)
    const packSize = n(a.packSize) || (n(a.packs) ? base / n(a.packs) : 1) || 1
    return { ...a, base, packSize, packs: a.packs != null ? n(a.packs) : base / packSize }
  }).filter(a => a.base > 0)
}

// รายการหนึ่งจ่ายจาก lot ไหน ตามขั้นของใบ
//   pending           = ประมาณการ FEFO จากจำนวนที่จะอนุมัติ (source 'fefo')
//   pick ลงชีทแล้ว    = lot ตามชีท (source 'sheet') — ห้ามคำนวณ FEFO ใหม่ (หลังนำเข้า inventory ลดไปแล้ว)
//   pick ยังไม่ลงชีท  = FEFO สดหลังหักของที่ใบอื่นหยิบไป (source 'fefo')
//   check ขึ้นไป      = ที่จัดจริง picked_allocation (source 'picked')
// fefoLots = lot เรียงลำดับจ่ายแล้ว (merge แถวซ้ำ · ตัดหมดอายุ · หัก holds) · isNear(exp) = เกณฑ์ใกล้หมดอายุของแอป (16 เดือน)
export function itemAllocation(item = {}, { stage, sheetMode = false, fefoLots = [], wantQty, isNear = () => false } = {}) {
  const want = Math.max(0, Math.floor(n(wantQty ?? item.approved_qty ?? item.requested_qty)))
  let allocation = []
  let source = 'picked'
  if (stage === 'rej') source = 'none'
  else if (stage === 'pending' || (stage === 'pick' && !sheetMode)) {
    source = 'fefo'
    if (want > 0) allocation = allocateFefo(want, fefoLots).allocation
  } else {
    if (stage === 'pick') source = 'sheet'
    allocation = normAllocation(item.picked_allocation)
    if (!allocation.length && n(item.picked_qty) > 0 && stage !== 'pick') {
      allocation = [{ lot: item.picked_lot, exp: item.picked_exp, base: n(item.picked_qty), packs: n(item.picked_qty), packSize: 1 }]
    }
  }
  const got = allocation.reduce((s, a) => s + n(a.base), 0)
  return {
    want, allocation, source, got,
    short: Math.max(0, want - got),
    over: Math.max(0, got - want),
    near: allocation.some(a => isNear(a.exp)),
  }
}

// จัดได้น้อยกว่าที่ระบบเสนอ → ตัด allocation ตามลำดับจ่ายให้รวมเท่าที่จัดได้จริง (ยอดจอง/ใบ lot คุมใช้ allocation นี้)
export function trimAllocation(allocation = [], qty) {
  let rem = Math.max(0, Math.floor(n(qty)))
  const out = []
  for (const a of allocation) {
    if (rem <= 0) break
    const base = Math.min(n(a.base), rem)
    if (base <= 0) continue
    const ps = n(a.packSize) || 1
    out.push({ ...a, base, packs: Math.round((base / ps) * 100) / 100 })
    rem -= base
  }
  return out
}

export const PICK_REASONS = ['ของไม่พอ', 'lot ไม่ตรงชีท', 'ของชำรุด/แตก', 'อื่นๆ']
export const VERIFY_ISSUES = ['หยิบผิดยา', 'ผิด lot', 'จำนวนไม่ตรง', 'อื่นๆ']

// ผลการจัดเริ่มต้นต่อรายการ: ของไม่พอ = ไม่ครบ (จัดได้เท่าที่มี) · นอกนั้น = ครบ
export const defaultPickResult = (view) => view.want > 0 && view.short > 0
  ? { st: 'part', qty: view.got, why: 'ของไม่พอ' }
  : { st: 'full', qty: '', why: 'ของไม่พอ' }

// แถวที่ส่งให้ startPickingRequisition — lotOnHand = { [lot]: คงเหลือหน่วยย่อย } snapshot ตอนจัด (เฉพาะ FEFO · ชีทมี onhand ในตัว)
export function pickPayload(item, view, result = {}, staffNote = '', lotOnHand = {}) {
  const part = result.st === 'part'
  const alloc = part ? trimAllocation(view.allocation, result.qty) : view.allocation
  const allocation = alloc.map(a => view.source === 'sheet' ? a
    : { lot: a.lot, exp: a.exp, base: a.base, packs: a.packs, onhand: lotOnHand[lotKey(a.lot)] ?? null })
  const picked = allocation.reduce((s, a) => s + n(a.base), 0)
  const base = String(staffNote || '').trim()
  const why = part && result.why && !base.includes(result.why) ? result.why : ''
  return {
    id: item.id,
    picked_lot: allocation[0]?.lot || null,
    picked_exp: allocation[0]?.exp || null,
    picked_qty: picked,
    picked_allocation: allocation.length ? allocation : null,
    staff_note: [base, why].filter(Boolean).join(' · ') || null,
  }
}

// หมายเหตุผู้ตรวจ (ไม่บังคับ) → ข้อความเดียวเก็บใน requisition_items.verify_note
export const verifyNoteText = (issue) => {
  if (!issue?.kind) return null
  const t = String(issue.text || '').trim()
  return t ? `${issue.kind}: ${t}` : issue.kind
}

// เรียงแบบใบพิมพ์ฉบับคลัง (MainLog → DetailedLog) ด้วย lot แรกที่จะจ่าย · ไม่มีของ/ไม่มีที่เก็บไปท้าย
export function sortByLog(views = []) {
  return sortRowsByLog(views.map(v => ({ v, mainLog: v.mainLog || '', detailLog: v.locs?.[0] || '' }))).map(x => x.v)
}

// ป้ายในคิว: กี่รายการของไม่พอ / ใกล้หมดอายุ — ใช้ itemAllocation ตัวเดียวกับหน้ารายละเอียด (Rule #6)
export function reqFlags(req, { lotsOf = () => [], isNear } = {}) {
  const stage = stageOf(req)
  const sheetMode = !!req?.sheet_entered_at
  let short = 0, near = 0
  for (const it of req?.requisition_items || []) {
    const v = itemAllocation(it, { stage, sheetMode, fefoLots: lotsOf(it.drug_code), isNear })
    if (v.want > 0 && v.short > 0) short++
    if (v.near) near++
  }
  return { short, near }
}
