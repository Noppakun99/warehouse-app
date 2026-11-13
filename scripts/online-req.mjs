// ใบเบิกออนไลน์ → ชีท 'เบิก ' (เฟส 1 ขั้น 4 · ADR-0028 · CONTEXT §ใบเบิกออนไลน์)
// ตรรกะเลือก lot อยู่ src/lib/onlineReqPlan.js (pure) — ไฟล์นี้แค่อ่าน/เขียน DB + อ่านชีท (SheetJS อ่านอย่างเดียว)
//
//   node scripts/online-req.mjs --plan --file <สำเนา xlsm> --out <plan.json> [--date 2026-11-13]
//        → ใบ pending ที่ยังไม่ลงชีท (เฉพาะห้องยาG — pilot) → แผนแถวเบิก + เลข บย. ถัดไป (ไม่เขียนอะไร)
//   node scripts/online-req.mjs --writeback --plan <plan.json> [--commit]
//        → หลังลงชีทแล้ว: receipt_no · sheet_entered_at · status approved · picked_allocation · audit
//          ต้องรัน **ก่อน** import:master (กฎเลิกหักยอดจอง src/lib/reservation.js)
//   node scripts/online-req.mjs --mark-entered --req <เลขใบ> --receipt บย.70/xxxx [--commit]
//        → ใบที่ลงชีทด้วยมือ (นอก pilot): ตั้ง receipt_no + sheet_entered_at เท่านั้น ไม่แตะสถานะ/lot
//          ไม่ตั้ง = ใบหักยอดจองค้างตลอดไป · รัน **ก่อน** import:master เหมือน --writeback
//   node scripts/online-req.mjs --backtest --file <สำเนา xlsm> --rows 9068-9077,9079-9145
//        → ทดสอบย้อนหลัง: เอารายการของแถวเบิกที่ลงมือไว้ วางแผนใหม่ด้วยยอดคงคลังย้อนกลับ แล้วเทียบ lot
import XLSX from 'xlsx'
import fs from 'fs'
import { loadEnv, log, die, parseArgs, serialToThai } from './_shared.mjs'

loadEnv()
const { planRequisition, sheetDept, PLACEHOLDER } = await import('../src/lib/onlineReqPlan.js')
const { normalizeCode, normalizeLot, toThaiDate } = await import('../src/lib/masterSheet.js')
const { parseUnit } = await import('../src/lib/unitParser.js')

const A = parseArgs()
const REGISTER = 'C:/Users/PRH0000484/Desktop/รวมเบิกยา/_ทะเบียนใบเบิก.csv'
const PILOT_DEPT = 'ห้องยาG'
const txt = (v) => String(v ?? '').trim()
const num = (v) => Number(v) || 0
const serialToDate = (n) => {
  if (typeof n !== 'number' || !n) return null
  const d = new Date(Math.round((n - 25569) * 86400000))
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}
const rowKey = (code, lot, price, itemType) => `${txt(code)}|${txt(lot)}|${num(price)}|${txt(itemType)}`

function grid(wb, sn) {
  return XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true, blankrows: true })
}

function readMaster(wb) {
  const g = grid(wb, 'Master')
  const h = g[0].map(txt)
  const want = { 2: 'สถานะตรวจรับ', 5: 'รหัสHosxp', 8: 'หน่วย', 9: 'ราคา/หน่วย', 10: 'Lot Number', 11: 'Exp', 12: 'ชนิดรายการ', 20: 'คงเหลือหลังจ่าย' }
  for (const [i, name] of Object.entries(want)) if (!h[i].startsWith(name)) die(`Master คอลัมน์ ${XLSX.utils.encode_col(+i)} ไม่ใช่ "${name}" (เจอ "${h[i]}")`)
  const out = []
  for (let i = 1; i < g.length; i++) {
    const r = g[i]
    const code = normalizeCode(r[5])
    if (!code) continue
    out.push({ row: i + 1, result: txt(r[0]), status: txt(r[2]), mainLog: txt(r[3]), location: txt(r[4]), code, name: txt(r[7]),
      unit: txt(r[8]), price: num(r[9]), lot: normalizeLot(r[10]), exp: toThaiDate(r[11], serialToThai), expDate: serialToDate(r[11]),
      itemType: txt(r[12]), u: num(r[20]), receiveDate: num(r[14]), invoice: txt(r[17]) })
  }
  return out
}

function readDispense(wb) {
  const g = grid(wb, 'เบิก ')
  if (txt(g[5]?.[29]) !== 'เลขรับใบเบิก') die('ชีทเบิก AD6 ไม่ใช่ เลขรับใบเบิก')
  let last = 0
  for (let i = 6; i < Math.min(g.length, 12000); i++) if (txt(g[i][4]) || txt(g[i][6])) last = i + 1
  return { g, last }
}

function nextReceiptNo() {
  const s = fs.readFileSync(REGISTER, 'utf8')
  const nums = [...s.matchAll(/บย\.70\/(\d{4})/g)].map(m => Number(m[1]))
  return Math.max(...nums) + 1
}

function printPlan(title, plan) {
  log(`\n━━ ${title} · หน่วยงานชีท ${plan.dept} · ${plan.lines.length} แถว`)
  for (const l of plan.lines) {
    log(`  M${l.masterRow} ${l.key} @${l.price} | U ${l.u} → ออก ${l.q} → ${l.u - l.q}${l.w != null ? ` | W=${l.w} X=${l.x}` : ''}${l.note ? `\n      Q: ${l.note}` : ''}`)
  }
  if (plan.flags.length) { log('  ⚠ ต้องดู:'); for (const f of plan.flags) log('    - ' + f) }
}

// ── --backtest ──
if (A.has('--backtest')) {
  if (!A.file || !A.valueOf('--rows')) die('--backtest ต้องมี --file และ --rows')
  const wb = XLSX.readFile(A.file, { sheets: ['Master', 'เบิก '] })
  const master = readMaster(wb)
  const { g } = readDispense(wb)
  const rowNums = A.valueOf('--rows').split(',').flatMap(p => { const [a, b] = p.split('-').map(Number); return Array.from({ length: (b || a) - a + 1 }, (_, i) => a + i) })
  const first = Math.min(...rowNums)
  // ยอดคงคลังย้อนกลับ ณ ก่อนแถวแรก: U ตอนนี้ + ทุกแถวเบิกตั้งแต่แถวแรกถึงปัจจุบันที่ตัดแถว Master เดียวกัน
  const outSince = {}
  for (let i = first - 1; i < g.length; i++) {
    const r = g[i]; if (!txt(r[4])) continue
    const k = rowKey(normalizeCode(r[4]), normalizeLot(r[9]), r[8], r[11])
    outSince[k] = (outSince[k] || 0) + num(r[13])
  }
  const dateOf = (r) => num(r[1])
  const firstDate = dateOf(g[first - 1])
  const masterThen = master
    .filter(m => !m.receiveDate || m.receiveDate <= firstDate)
    .map(m => ({ ...m, u: m.u + (outSince[rowKey(m.code, m.lot, m.price, m.itemType)] || 0) }))
  // จัดกลุ่มตามเลข บย. → รายการตามรหัส (แถวติดกันรหัสเดียวกัน = รายการเดียว)
  const byNo = new Map()
  for (const n of rowNums) {
    const r = g[n - 1]; if (!txt(r[4])) continue
    const no = txt(r[29]) || '(ไม่มีเลข)'
    if (!byNo.has(no)) byNo.set(no, { dept: txt(r[15]), date: dateOf(r), items: [] })
    const grp = byNo.get(no)
    const code = normalizeCode(r[4])
    const ps = parseUnit(txt(r[7])).packSize || 1
    let it = grp.items[grp.items.length - 1]
    if (!it || it.drug_code !== code) { it = { id: `${no}#${grp.items.length + 1}`, drug_code: code, drug_name: txt(r[6]), requested_qty: 0, actual: [], w: null }; grp.items.push(it) }
    it.actual.push({ row: n, lot: normalizeLot(r[9]), price: num(r[8]), itemType: txt(r[11]), q: num(r[13]) })
    it.requested_qty += num(r[13]) * ps
    if (txt(r[22])) it.w = num(r[22]) * ps
  }
  let same = 0, diff = 0
  const report = []
  let pool = masterThen
  for (const [no, grp] of byNo) {
    for (const it of grp.items) if (it.w != null) it.requested_qty = it.w
    const plan = planRequisition({ department: grp.dept, items: grp.items }, pool, { today: serialToDate(grp.date) })
    // ใบถัดไปเห็นยอดหลังใบนี้
    const cut = {}; for (const l of plan.lines) cut[l.masterRow] = (cut[l.masterRow] || 0) + l.q
    pool = pool.map(m => cut[m.row] ? { ...m, u: m.u - cut[m.row] } : m)
    log(`\n━━ ${no} · ${grp.dept} · ${grp.items.length} รายการ`)
    for (const it of grp.items) {
      const mine = plan.lines.filter(l => l.itemId === it.id && l.q > 0).map(l => `${l.lot}/${l.itemType}@${l.price}×${l.q}`).sort()
      const real = it.actual.filter(a => a.q > 0).map(a => `${a.lot}/${a.itemType}@${a.price}×${a.q}`).sort()
      const ok = mine.join(',') === real.join(',')
      ok ? same++ : diff++
      const flags = plan.items.find(x => x.itemId === it.id)?.flags || []
      if (!ok) log(`  ✗ ${it.drug_code} ${it.drug_name}\n      ลงมือ: ${real.join(' + ') || '(จ่าย 0)'}\n      ระบบ : ${mine.join(' + ') || '(จ่าย 0)'}${flags.length ? `\n      ⚠ ${flags.join(' · ')}` : ''}`)
      report.push({ no, code: it.drug_code, name: it.drug_name, ok, real, mine, flags, rows: it.actual.map(a => a.row) })
    }
  }
  log(`\nสรุป: ตรงกัน ${same} รายการ · ต่างกัน ${diff} รายการ (จาก ${same + diff})`)
  if (A.valueOf('--out')) fs.writeFileSync(A.valueOf('--out'), JSON.stringify(report, null, 1), 'utf8')
  process.exit(0)
}

const { supabase } = await import('../src/lib/supabase.js')
if (!supabase) die('ไม่พบค่า Supabase ใน .env.local')

// ── --plan ──
if (A.has('--plan')) {
  if (!A.file || !A.valueOf('--out')) die('--plan ต้องมี --file <สำเนา xlsm> และ --out <plan.json>')
  const { data, error } = await supabase.from('requisitions').select('*, requisition_items(*)')
    .eq('status', 'pending').is('sheet_entered_at', null).order('created_at')
  if (error) die(error.message)
  const reqs = (data || []).filter(r => sheetDept(r.department) === PILOT_DEPT)
  for (const r of data || []) if (sheetDept(r.department) !== PILOT_DEPT) log(`  ข้าม ${r.req_number} ${r.department} (นอก pilot ห้องยาG)`)
  if (!reqs.length) { log('ไม่มีใบเบิกออนไลน์ห้องยาG ที่รอลงชีท'); process.exit(0) }
  const wb = XLSX.readFile(A.file, { sheets: ['Master', 'เบิก '] })
  let pool = readMaster(wb)
  const { last } = readDispense(wb)
  const date = A.valueOf('--date') ? new Date(A.valueOf('--date') + 'T00:00:00') : new Date()
  let no = nextReceiptNo()
  const out = { createdAt: new Date().toISOString(), file: A.file, expectLast: last, date: date.toISOString().slice(0, 10), reqs: [], rows: [] }
  let rowNo = last + 1
  for (const r of reqs) {
    const items = (r.requisition_items || []).slice().sort((a, b) => a.id - b.id)
    const plan = planRequisition({ ...r, items }, pool, { today: date })
    const receipt = `บย.70/${String(no++).padStart(4, '0')}`
    const sheetRows = []
    for (const l of plan.lines) { l.no = receipt; l.sheetRow = rowNo; sheetRows.push(rowNo++); out.rows.push(l) }
    const cut = {}; for (const l of plan.lines) cut[l.masterRow] = (cut[l.masterRow] || 0) + l.q
    pool = pool.map(m => cut[m.row] ? { ...m, u: m.u - cut[m.row] } : m)
    out.reqs.push({ id: r.id, req_number: r.req_number, department: r.department, req_type: r.req_type, receipt, sheetRows, items: plan.items, flags: plan.flags })
    printPlan(`${r.req_number} (${r.req_type || '-'}) → ${receipt}`, plan)
  }
  fs.writeFileSync(A.valueOf('--out'), JSON.stringify(out, null, 1), 'utf8')
  const ph = out.rows.filter(l => l.note.includes(PLACEHOLDER)).length
  log(`\nแผน → ${A.valueOf('--out')} · แถวเบิก ${last + 1}–${rowNo - 1}${ph ? ` · ⚠ ยังมี ${PLACEHOLDER} ${ph} แถว ต้องเติมก่อนเขียนชีท` : ''}`)
  process.exit(0)
}

// ── --writeback ──
if (A.has('--writeback')) {
  const plan = JSON.parse(fs.readFileSync(A.valueOf('--plan'), 'utf8'))
  const now = new Date().toISOString()
  for (const r of plan.reqs) {
    log(`${r.req_number} → ${r.receipt} · ${r.items.length} รายการ · แถวเบิก ${r.sheetRows[0]}–${r.sheetRows[r.sheetRows.length - 1]}`)
    if (!A.commit) continue
    const { data: cur, error: e0 } = await supabase.from('requisitions').select('status, sheet_entered_at').eq('id', r.id).single()
    if (e0) die(e0.message)
    if (cur.status !== 'pending' || cur.sheet_entered_at) die(`${r.req_number} สถานะ ${cur.status} / ลงชีทแล้ว ${cur.sheet_entered_at} — ไม่เขียนทับ`)
    for (const it of r.items) {
      const { error } = await supabase.from('requisition_items').update({
        approved_qty: it.approved, picked_qty: it.picked, picked_allocation: it.allocation.length ? it.allocation : null,
        picked_lot: it.allocation[0]?.lot || null, picked_exp: it.allocation[0]?.exp || null, staff_note: it.staffNote,
      }).eq('id', it.itemId)
      if (error) die(`item ${it.itemId}: ${error.message}`)
    }
    const { error } = await supabase.from('requisitions')
      .update({ receipt_no: r.receipt, sheet_entered_at: now, status: 'approved', updated_at: now }).eq('id', r.id)
    if (error) die(error.message)
    const { error: ea } = await supabase.from('audit_logs').insert({ action: 'sheet_enter_requisition', table_name: 'requisitions', user_name: A.user,
      department: 'คลังยา', record_count: r.items.length,
      details: { requisition_id: r.id, req_number: r.req_number, req_department: r.department, receipt_no: r.receipt, sheet_rows: r.sheetRows } })
    if (ea) log(`  ⚠ เขียนกลับแล้ว แต่บันทึก audit ไม่สำเร็จ (${ea.message}) — กระดิ่ง/ประวัติจะไม่มีรายการนี้`)
    else log('  ✓ เขียนกลับแล้ว')
  }
  if (!A.commit) log('\n(dry-run — ใส่ --commit เพื่อเขียนจริง)')
  process.exit(0)
}

// ── --mark-entered ──
if (A.has('--mark-entered')) {
  const reqNo = A.valueOf('--req'), receipt = A.valueOf('--receipt')
  if (!reqNo || !/^บย\.70\/\d{4}$/.test(receipt || '')) die('--mark-entered ต้องมี --req <เลขใบ> และ --receipt บย.70/xxxx')
  const { data: r, error: e0 } = await supabase.from('requisitions').select('id, req_number, department, status, receipt_no, sheet_entered_at, requisition_items(id)')
    .eq('req_number', reqNo).maybeSingle()
  if (e0) die(e0.message)
  if (!r) die(`ไม่พบใบ ${reqNo}`)
  if (r.sheet_entered_at) die(`${reqNo} ลงชีทแล้ว ${r.receipt_no || ''} (${r.sheet_entered_at}) — ไม่เขียนทับ`)
  if (['rejected', 'cancelled'].includes(r.status)) die(`${reqNo} สถานะ ${r.status} — ไม่ต้องตั้ง (ไม่หักยอดจองอยู่แล้ว)`)
  const { data: dup } = await supabase.from('requisitions').select('req_number').eq('receipt_no', receipt).maybeSingle()
  if (dup) die(`${receipt} ถูกใช้กับใบ ${dup.req_number} แล้ว`)
  log(`${reqNo} · ${r.department} · สถานะ ${r.status} → ${receipt}`)
  if (!A.commit) { log('\n(dry-run — ใส่ --commit เพื่อเขียนจริง)'); process.exit(0) }
  const now = new Date().toISOString()
  const { error } = await supabase.from('requisitions').update({ receipt_no: receipt, sheet_entered_at: now, updated_at: now })
    .eq('id', r.id).is('sheet_entered_at', null)
  if (error) die(error.message)
  const { error: ea } = await supabase.from('audit_logs').insert({ action: 'sheet_enter_requisition', table_name: 'requisitions', user_name: A.user,
    department: 'คลังยา', record_count: r.requisition_items?.length || 0,
    details: { requisition_id: r.id, req_number: r.req_number, req_department: r.department, receipt_no: receipt, manual: true } })
  log(ea ? `  ⚠ ตั้งแล้ว แต่บันทึก audit ไม่สำเร็จ (${ea.message})` : '  ✓ ตั้งแล้ว — รัน import:master ต่อเพื่อเลิกหักยอดจอง')
  process.exit(0)
}

log('ใช้: --plan | --writeback | --mark-entered | --backtest (ดูหัวไฟล์)')
