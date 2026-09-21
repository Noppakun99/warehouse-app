#!/usr/bin/env node
// restore.mjs — กู้ข้อมูลจากไฟล์สำรองที่ import-receive.mjs สร้างไว้
//
//   npm run import:restore backup/receive_logs_20260921_1530.json            ← ดูอย่างเดียว
//   npm run import:restore backup/receive_logs_20260921_1530.json -- --commit ← กู้จริง
//
// dry-run เป็นค่าเริ่มต้นเหมือนตัวนำเข้า — ต้องพิมพ์ --commit ถึงจะเขียน
// กู้ = ลบของปัจจุบันทั้งหมด แล้วใส่ของจากไฟล์สำรองกลับไป (ตรงกับตอนที่สำรองไว้เป๊ะ)

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')

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

const { supabase } = await import('../src/lib/supabase.js')
const { insertAuditLog } = await import('../src/lib/db.js')

const argv = process.argv.slice(2)
const COMMIT = argv.includes('--commit')
const target = argv.find(a => !a.startsWith('--'))
const USER = process.env.USERNAME || 'CLI'

const log = (s = '') => console.log(s)
const fmt = (n) => Number(n || 0).toLocaleString('th-TH')
const die = (m) => { log(''); log('✗ ' + m); process.exit(1) }

log('')
log('━━━ กู้คืนข้อมูล ' + (COMMIT ? '(เขียนจริง)' : '(ดูอย่างเดียว)') + ' ━━━')
log('')

if (!supabase) die('ไม่พบค่า Supabase ใน .env.local')
if (!target) {
  log('  ต้องระบุไฟล์สำรอง เช่น:')
  log('    npm run import:restore backup/receive_logs_20260921_1530.json')
  const dir = path.join(ROOT, 'backup')
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse()
    if (files.length) {
      log('')
      log('  ไฟล์สำรองที่มี:')
      files.slice(0, 10).forEach(f => {
        const s = fs.statSync(path.join(dir, f))
        log(`    ${f}   (${(s.size / 1024 / 1024).toFixed(1)} MB · ${s.mtime.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })})`)
      })
    }
  }
  log('')
  process.exit(1)
}

const file = path.isAbsolute(target) ? target : path.join(ROOT, target)
if (!fs.existsSync(file)) die(`ไม่พบไฟล์: ${file}`)

let dump
try {
  dump = JSON.parse(fs.readFileSync(file, 'utf8'))
} catch (e) {
  die('อ่านไฟล์สำรองไม่ได้ (ไฟล์อาจเสีย) — ' + e.message)
}
if (!dump?.table || !Array.isArray(dump.data)) die('รูปแบบไฟล์สำรองไม่ถูกต้อง')

const table = dump.table
const rows = dump.data
log(`  ไฟล์สำรอง : ${path.basename(file)}`)
log(`  ตาราง     : ${table}`)
log(`  สำรองเมื่อ : ${new Date(dump.saved_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`)
log(`  จำนวนแถว  : ${fmt(rows.length)}`)

const { count: current } = await supabase.from(table).select('*', { count: 'exact', head: true })
log(`  ตอนนี้ใน DB: ${fmt(current)} แถว`)
log('')
log(`  การกู้จะ: ลบ ${fmt(current)} แถวปัจจุบันทิ้ง แล้วใส่ ${fmt(rows.length)} แถวจากไฟล์สำรองกลับไป`)

if (!COMMIT) {
  log('')
  log('  ── ยังไม่ได้เขียนอะไร ──')
  log(`  ถ้าต้องการกู้จริง:  npm run import:restore ${target} -- --commit`)
  log('')
  process.exit(0)
}

// ใส่ค่ากลับทั้งแถวรวม id เดิม — ให้เหมือนตอนสำรองที่สุด
log('')
log('  กำลังกู้คืน…')
try {
  const { error: delErr } = await supabase.from(table).delete().gte('id', 0)
  if (delErr) throw delErr
  const CHUNK = 300
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + CHUNK))
    if (error) throw error
  }
} catch (e) {
  die('กู้คืนไม่สำเร็จ — ' + e.message + '\n  ไฟล์สำรองยังอยู่ ลองใหม่ได้')
}

await insertAuditLog({
  action: 'restore_backup', table_name: table,
  user_name: `${USER} (CLI)`, department: 'คลังยา',
  record_count: rows.length,
  details: { file: path.basename(file), saved_at: dump.saved_at, replaced: current, via: 'cli' },
})

const { count: after } = await supabase.from(table).select('*', { count: 'exact', head: true })
log('')
log(after === rows.length
  ? `  ✓ กู้คืนสำเร็จ — ${table} มี ${fmt(after)} แถว ตรงกับไฟล์สำรอง`
  : `  ⚠ กู้เสร็จแต่จำนวนไม่ตรง: ไฟล์สำรอง ${fmt(rows.length)} แต่ DB มี ${fmt(after)}`)
log('')
