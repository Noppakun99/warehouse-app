// ใบแจ้งย้ายที่เก็บ (location_move) — ฝั่ง Excel ของ skill /apply-location-moves
// (docs/features/location-move.md · CONTEXT.md §ใบแจ้งย้ายที่เก็บ)
//
// ใช้:
//   node scripts/location-moves.mjs                      → รายการใบ pending/conflict (อ่านอย่างเดียว)
//   node scripts/location-moves.mjs --json               → เหมือนกันแต่เป็น JSON (check-complete.py อ่าน)
//   node scripts/location-moves.mjs --plan --file <xlsm> --out <json>
//        → หาเลขแถว Master/list ที่ต้องแก้ D/E ด้วยตัวอ่านชีทเดียวกับการนำเข้า (lot normalize เหมือนกัน)
//          ไฟล์ที่อ่านควรเป็นสำเนาใน scratchpad (SheetJS อ่านอย่างเดียว ไม่เขียน)
//   node scripts/location-moves.mjs --resolve <id> --status <superseded|applied> [--note "<เหตุผล>"]
//        → ปิดใบ conflict ตามที่ user ตัดสิน (ห้ามใช้เอง)
import XLSX from 'xlsx'
import fs from 'fs'
import { loadEnv, log, die, parseArgs } from './_shared.mjs'

loadEnv()
const { supabase } = await import('../src/lib/supabase.js')
const { normalizeCode, normalizeLot, mapMasterColumns } = await import('../src/lib/masterSheet.js')
const { setEq } = await import('../src/lib/countMatch.js')
const { splitLoc } = await import('../src/lib/locationMove.js')

const A = parseArgs()
const args = { file: A.file, plan: A.has('--plan'), json: A.has('--json'), out: A.valueOf('--out'), resolve: A.valueOf('--resolve'), status: A.valueOf('--status'), note: A.valueOf('--note') }
if (!supabase) die('ไม่พบค่า Supabase ใน .env.local')

async function openMoves() {
  const { data, error } = await supabase.from('location_move').select('*').in('status', ['pending', 'conflict']).order('id')
  if (error) die('อ่าน location_move ไม่สำเร็จ — ' + error.message)
  return data || []
}

async function main() {
if (args.resolve) {
  const id = Number(args.resolve)
  if (!['superseded', 'applied'].includes(args.status)) die('--status ต้องเป็น superseded หรือ applied')
  const { data, error } = await supabase.from('location_move')
    .update({ status: args.status, resolved_at: new Date().toISOString(), note: args.note || null })
    .eq('id', id).in('status', ['pending', 'conflict']).select('id')
  if (error) die(error.message)
  log(data?.length ? `✓ ใบ #${id} → ${args.status}` : `✗ ไม่พบใบ #${id} ที่ยังเปิดอยู่`)
  if (!data?.length) process.exitCode = 1
  return
}

const moves = await openMoves()

if (!args.plan) {
  if (args.json) { console.log(JSON.stringify(moves)); return }
  log(moves.length ? `ใบแจ้งย้ายที่ยังเปิด ${moves.length} ใบ:` : 'ไม่มีใบแจ้งย้ายค้าง')
  for (const m of moves) log(`  #${m.id} [${m.status}] ${m.code} ${m.name || ''} lot ${m.lot}: ${m.from_location} → ${m.to_location} · ${m.created_by || '-'} ${String(m.created_at).slice(0, 16)}${m.note ? ` · ${m.note}` : ''}`)
  return
}

// ── --plan ──
if (!args.file || !args.out) die('--plan ต้องมี --file <xlsm> และ --out <json>')
const wb = XLSX.readFile(args.file, { sheets: ['Master', 'list'] })
const grid = (sn) => XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true, blankrows: true })
const g = grid('Master')
const C = mapMasterColumns(g[0])
for (const k of ['code', 'lot', 'location', 'mainLog', 'qty']) if (C[k] < 0) die(`Master ไม่พบคอลัมน์ ${k}`)
const ref = XLSX.utils.decode_range(wb.Sheets.Master['!ref'])
const rowNo = (i) => ref.s.r + i + 1   // index ใน grid → เลขแถว Excel

const pending = moves.filter(m => m.status === 'pending')
const plan = { file: args.file, moves: [], list: [], listSkipped: [] }
const locAfter = new Map()   // excel row → ที่เก็บหลังย้าย
for (const m of pending) {
  const rows = []
  for (let i = 1; i < g.length; i++) {
    const r = g[i]
    if (normalizeCode(r[C.code]) === m.code && normalizeLot(r[C.lot]) === m.lot && setEq(String(r[C.location] ?? ''), m.from_location)) rows.push(rowNo(i))
  }
  plan.moves.push({ id: m.id, code: m.code, name: m.name, lot: m.lot, from: m.from_location, to: m.to_location, main: m.to_main_log, rows })
  rows.forEach(n => locAfter.set(n, m.to_location))
}

// ชีท list = 1 แถว/รหัส → แก้เฉพาะเมื่อหลังย้าย ทุก lot ที่ยังมีของของรหัสนั้นอยู่ที่เก็บเดียวกัน (ตกลง 27/10/2569)
const lg = grid('list')
const lref = XLSX.utils.decode_range(wb.Sheets.list['!ref'])
for (const code of [...new Set(plan.moves.filter(m => m.rows.length).map(m => m.code))]) {
  const sets = new Map()
  for (let i = 1; i < g.length; i++) {
    const r = g[i]
    if (normalizeCode(r[C.code]) !== code || !(parseFloat(r[C.qty]) > 0 || locAfter.has(rowNo(i)))) continue
    const loc = locAfter.get(rowNo(i)) ?? String(r[C.location] ?? '')
    sets.set(splitLoc(loc).slice().sort().join('|'), loc)
  }
  const lrows = []
  for (let i = 0; i < lg.length; i++) if (normalizeCode(lg[i][5]) === code) lrows.push({ row: lref.s.r + i + 1, from: String(lg[i][4] ?? '') })
  if (sets.size !== 1) { plan.listSkipped.push({ code, reason: `หลังย้ายรหัสนี้อยู่ ${sets.size} ที่เก็บ: ${[...sets.values()].join(' / ')}` }); continue }
  if (lrows.length === 0) { plan.listSkipped.push({ code, reason: 'ไม่มีแถวในชีท list' }); continue }
  const to = [...sets.values()][0]
  const main = plan.moves.find(m => m.code === code && m.rows.length)?.main
  for (const lr of lrows) if (!setEq(lr.from, to)) plan.list.push({ row: lr.row, code, from: lr.from, to, main })
}

fs.writeFileSync(args.out, JSON.stringify(plan, null, 2))
log(`แผน: ${plan.moves.length} ใบ · แถว Master ${plan.moves.reduce((s, m) => s + m.rows.length, 0)} · แถว list ${plan.list.length} · list ข้าม ${plan.listSkipped.length}`)
for (const m of plan.moves) log(`  #${m.id} ${m.code} lot ${m.lot}: ${m.from} → ${m.to} · Master แถว ${m.rows.join(',') || '(ไม่พบ — Excel ไม่ใช่ที่เก็บเดิมแล้ว)'}`)
for (const l of plan.list) log(`  list แถว ${l.row} ${l.code}: ${l.from} → ${l.to}`)
for (const s of plan.listSkipped) log(`  list ข้าม ${s.code}: ${s.reason}`)
}

await main()
