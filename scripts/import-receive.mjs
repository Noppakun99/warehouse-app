#!/usr/bin/env node
// import-receive.mjs — นำเข้าประวัติรับยาจาก .xlsm เข้า receive_logs โดยตรง
//
//   npm run import:receive                 ← ดูอย่างเดียว ไม่เขียนอะไร (ค่าเริ่มต้น)
//   npm run import:receive -- --commit     ← เขียนจริง (สำรองข้อมูลเดิมก่อนอัตโนมัติ)
//   npm run import:receive -- --commit --force   ← ข้ามด่านที่บล็อกไว้ (ต้องตั้งใจ)
//   npm run import:receive -- --file "D:/path/ไฟล์.xlsm"
//
// **dry-run เป็นค่าเริ่มต้นโดยเจตนา** — กดลูกศรขึ้นซ้ำคำสั่งเก่าแล้วจะไม่มีอะไรเสียหาย
// ต้องพิมพ์ --commit เพิ่มทุกครั้งที่จะเขียนจริง
//
// เขียน DB ผ่าน `insertReceiveRows` ใน db.js = ฟังก์ชันตัวเดียวกับที่หน้าเว็บใช้
// (ไม่ทำ DELETE/INSERT เอง เพื่อไม่ให้ตรรกะแตกเป็น 2 ชุดแล้วดริฟต์กัน)

import fs from 'fs'
import path from 'path'
import XLSX from 'xlsx'

const ROOT = path.resolve(import.meta.dirname, '..')

// ── โหลด .env.local เข้า process.env ก่อน import db.js ────────────
// (supabase client ถูกสร้างตอน import module จึงต้องมี env พร้อมก่อน)
function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = path.join(ROOT, name)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
}
loadEnv()

const { readReceiveWorkbook, RECEIVE_SHEET_NAME } = await import('../src/lib/receiveSheet.js')
const { runGuards, formatGuardReport, summarize } = await import('../src/lib/importGuard.js')
const db = await import('../src/lib/db.js')
const { supabase } = await import('../src/lib/supabase.js')

// ── อาร์กิวเมนต์ ──────────────────────────────────────────────────
const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const valueOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null }

const COMMIT = has('--commit')
const FORCE = has('--force')
const DEFAULT_FILE = 'C:/Users/PRH0000484/OneDrive/รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm'
const FILE = valueOf('--file') || DEFAULT_FILE
const SHEET = valueOf('--sheet') || RECEIVE_SHEET_NAME
const USER = valueOf('--user') || process.env.USERNAME || 'CLI'

const log = (s = '') => console.log(s)
const fmt = (n) => Number(n || 0).toLocaleString('th-TH')

function die(msg) { log(''); log('✗ ' + msg); process.exit(1) }

// ── 1. ตรวจไฟล์ ──────────────────────────────────────────────────
log('')
log('━━━ นำเข้าประวัติรับยา ' + (COMMIT ? '(เขียนจริง)' : '(ดูอย่างเดียว)') + ' ━━━')
log('')

if (!supabase) die('ไม่พบค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ใน .env.local')
if (!fs.existsSync(FILE)) die(`ไม่พบไฟล์: ${FILE}`)

const stat = fs.statSync(FILE)
const mtime = stat.mtime.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
log(`  ไฟล์  : ${path.basename(FILE)}`)
log(`  ชีท   : ${SHEET}`)
log(`  แก้ล่าสุด : ${mtime}   (${(stat.size / 1024 / 1024).toFixed(1)} MB)`)

// Excel เปิดไฟล์ค้างอยู่ = อาจมีของที่พิมพ์แล้วยังไม่ Save ซึ่งไฟล์บนดิสก์ยังไม่มี
const lock = path.join(path.dirname(FILE), '~$' + path.basename(FILE))
if (fs.existsSync(lock)) {
  log('')
  log('  ⚠ ไฟล์นี้กำลังเปิดอยู่ใน Excel — สิ่งที่พิมพ์แล้วยังไม่กด Save จะไม่ถูกนำเข้า')
  log('    กด Ctrl+S ใน Excel ก่อน แล้วสั่งใหม่')
}

// ── 2. อ่านไฟล์ ──────────────────────────────────────────────────
let parsed
try {
  parsed = readReceiveWorkbook(XLSX, FILE, SHEET)
} catch (e) {
  die('อ่านไฟล์ไม่สำเร็จ — ' + e.message)
}
log('')
log(`  อ่านได้ ${fmt(parsed.rows.length)} แถว · ข้ามแถวว่าง/ผลรวม ${fmt(parsed.skipped)}`)

// ── 3. สรุปของเดิมใน DB + ของที่มีแต่ในแอป ───────────────────────
log('')
log('  กำลังอ่านข้อมูลเดิมจากฐานข้อมูล…')

// ต้อง paginate — receive_logs เกิน 1000 แถว (Critical Rule #2)
async function fetchAllReceive() {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('receive_logs')
      .select('receive_date, total_price_vat, bill_number, drug_code')
      .range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

let prev = null, atRisk = []
try {
  prev = summarize(await fetchAllReceive())
  // แถวที่มีร่องรอยการทำงานในแอป — ของพวกนี้ไม่มีในไฟล์ Excel จะหายถ้า DELETE ALL
  const { data: risk, error } = await supabase.from('receive_logs')
    .select('bill_number, scan_image_url, inspect_meta, ap_stage, acknowledged_at')
    .or('scan_image_url.not.is.null,inspect_meta.not.is.null,ap_stage.not.is.null,acknowledged_at.not.is.null')
  if (error) throw error
  atRisk = (risk || []).map(r => ({
    bill_number: r.bill_number,
    reason: r.scan_image_url ? 'บิลสแกน'
      : r.inspect_meta ? 'มีรูปตรวจรับ'
        : r.ap_stage ? 'เดิน AP แล้ว' : 'จัดซื้อรับแล้ว',
  }))
} catch (e) {
  die('อ่านข้อมูลเดิมไม่สำเร็จ — ' + e.message + '\n  (ไม่เขียนอะไรทั้งนั้น เพราะเทียบของเดิมไม่ได้)')
}

// ── 4. ด่านตรวจ ──────────────────────────────────────────────────
const guard = runGuards(parsed.rows, prev, atRisk)
log('')
log(formatGuardReport(guard))

if (parsed.warnings.length) {
  log('')
  log(`  ⚠ แถวที่ข้อมูลไม่ครบ ${fmt(parsed.warnings.length)} แถว (ยังนำเข้าได้ แต่ควรดู):`)
  const byIssue = {}
  parsed.warnings.forEach(w => w.issues.forEach(i => { byIssue[i] = (byIssue[i] || 0) + 1 }))
  Object.entries(byIssue).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => log(`     - ${k}: ${fmt(v)} แถว`))
  log('     ตัวอย่าง: ' + parsed.warnings.slice(0, 3)
    .map(w => `แถว ${w.row} ${w.name} (${w.issues.join(', ')})`).join(' · '))
}

// ── 5. ตัวอย่างแถว ───────────────────────────────────────────────
const newest = [...parsed.rows].sort((a, b) => String(b.receive_date).localeCompare(String(a.receive_date))).slice(0, 5)
log('')
log('  5 แถวล่าสุดในไฟล์:')
newest.forEach(r => log(`     ${r.receive_date} | ${r.bill_number} | ${r.drug_name} | lot ${r.lot} | ${fmt(r.qty_received)}`))

// ── 6. หยุดถ้าไม่ผ่านด่าน ────────────────────────────────────────
if (!guard.ok && !FORCE) {
  log('')
  log('  ⛔ ไม่ผ่านด่านตรวจ — ไม่เขียนอะไรทั้งนั้น')
  log('     ถ้าแน่ใจว่าถูกต้อง ให้เพิ่ม --force')
  process.exit(1)
}
if (!guard.ok && FORCE) {
  log('')
  log('  ⚠ ข้ามด่านตรวจด้วย --force')
}

// ── 7. dry-run จบตรงนี้ ──────────────────────────────────────────
if (!COMMIT) {
  log('')
  log('  ── ยังไม่ได้เขียนอะไรลงฐานข้อมูล ──')
  log('  ถ้าถูกต้องแล้ว สั่ง:  npm run import:receive -- --commit')
  log('')
  process.exit(0)
}

// ── 8. สำรองข้อมูลเดิม (บังคับ — ล้มเหลว = ไม่เขียน) ─────────────
log('')
log('  กำลังสำรองข้อมูลเดิม…')
let backupPath = null
try {
  const all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('receive_logs').select('*').range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < 1000) break
  }
  const dir = path.join(ROOT, 'backup')
  fs.mkdirSync(dir, { recursive: true })
  const d = new Date()
  const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    + `_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
  backupPath = path.join(dir, `receive_logs_${ts}.json`)
  fs.writeFileSync(backupPath, JSON.stringify({
    table: 'receive_logs', saved_at: d.toISOString(), rows: all.length, data: all,
  }, null, 0), 'utf8')
  const mb = (fs.statSync(backupPath).size / 1024 / 1024).toFixed(1)
  log(`  ✓ สำรองแล้ว ${fmt(all.length)} แถว → backup/${path.basename(backupPath)} (${mb} MB)`)

  // เก็บ 10 ไฟล์ล่าสุดต่อตาราง — ที่เหลือลบทิ้ง
  const olds = fs.readdirSync(dir).filter(f => f.startsWith('receive_logs_') && f.endsWith('.json')).sort().reverse()
  olds.slice(10).forEach(f => { try { fs.unlinkSync(path.join(dir, f)) } catch { /* ไม่สำคัญพอจะหยุดงาน */ } })
} catch (e) {
  die('สำรองข้อมูลไม่สำเร็จ — ' + e.message + '\n  ไม่เขียนทับของเดิม (ต้องมี backup ก่อนเสมอ)')
}

// ── 9. เขียนจริง ─────────────────────────────────────────────────
log('')
log(`  กำลังเขียน ${fmt(parsed.rows.length)} แถว (ลบของเดิม ${fmt(prev?.count || 0)} แถวก่อน)…`)
try {
  await db.insertReceiveRows(parsed.rows, {
    name: `${USER} (CLI)`,
    department: 'คลังยา',
  })
} catch (e) {
  log('')
  log('  ✗ เขียนไม่สำเร็จ — ' + e.message)
  log(`  กู้คืนด้วย:  npm run import:restore backup/${path.basename(backupPath)}`)
  process.exit(1)
}

// ── 10. ตรวจผลหลังเขียน ──────────────────────────────────────────
const { count: after } = await supabase.from('receive_logs').select('*', { count: 'exact', head: true })
log('')
if (after === parsed.rows.length) {
  log(`  ✓ เสร็จ — ฐานข้อมูลมี ${fmt(after)} แถว ตรงกับไฟล์`)
} else {
  log(`  ⚠ เขียนเสร็จแต่จำนวนไม่ตรง: ไฟล์ ${fmt(parsed.rows.length)} แถว แต่ DB มี ${fmt(after)} แถว`)
  log(`     กู้คืนได้ด้วย:  npm run import:restore backup/${path.basename(backupPath)}`)
}
log(`  สำรองเดิมเก็บไว้ที่ backup/${path.basename(backupPath)}`)
log('')
