#!/usr/bin/env node
// import-master.mjs — นำเข้าแผนผังคลังยาจากชีท "Master" → inventory
//
//   node scripts/import-master.mjs            ← ดูอย่างเดียว
//   node scripts/import-master.mjs --commit   ← เขียนจริง
//
// 🔴 ตารางนี้เป็น DELETE ALL → INSERT (saveInventory) — ไฟล์ผิด = คลังหายทั้งระบบ
//    เหตุการณ์จริง 2026-07-01: import ไฟล์ผิด → Safety Stock เพี้ยนทั้งระบบ ต้องกู้ด้วย SQL

import XLSX from 'xlsx'
import path from 'path'
import { loadEnv, log, fmt, die, parseArgs, checkFile, backupTable, serialToThai, fetchAll } from './_shared.mjs'

loadEnv()
const { readMasterWorkbook } = await import('../src/lib/masterSheet.js')
const { runGuards, formatGuardReport } = await import('../src/lib/importGuard.js')
const db = await import('../src/lib/db.js')
const { supabase } = await import('../src/lib/supabase.js')

const args = parseArgs()
const FILE = args.file || 'C:/Users/PRH0000484/OneDrive/ยอดคลังยา_69.xlsm'
const SHEET = args.sheet || 'Master'

log('')
log('━━━ นำเข้าแผนผังคลังยา ' + (args.commit ? '(เขียนจริง)' : '(ดูอย่างเดียว)') + ' ━━━')
log('')
if (!supabase) die('ไม่พบค่า Supabase ใน .env.local')
checkFile(FILE)
log(`  ชีท   : ${SHEET}`)

let out
try { out = readMasterWorkbook(XLSX, FILE, serialToThai, SHEET) }
catch (e) { die('อ่านชีทไม่สำเร็จ — ' + e.message) }

const items = Object.values(out.inventory).flat()
log('')
log(`  อ่านได้ ${fmt(out.rows)} แถว · ${fmt(out.locations)} ที่เก็บ · ข้าม ${fmt(out.skipped)}`)

// เทียบของเดิม — ใช้ guard ชุดเดียวกับ receive (นับแถว/หด/ว่าง)
let prevRows = []
try { prevRows = await fetchAll(supabase, 'inventory', 'code, lot, qty, location, exp') }
catch (e) { die('อ่านข้อมูลเดิมไม่สำเร็จ — ' + e.message) }

const prev = { count: prevRows.length, value: 0, bills: 0, codes: new Set(prevRows.map(r => r.code)).size, firstDate: null, lastDate: null }
const guard = runGuards(items.map(i => ({ ...i, total_price_vat: 0, receive_date: null })), prev, [])
log('')
log(formatGuardReport({ ...guard, next: { ...guard.next, value: 0 }, prev }).split('\n')
  .filter(l => !l.includes('มูลค่า') && !l.includes('ช่วงวันที่')).join('\n'))

// ตรวจเฉพาะของแผนผังคลัง
const noLot = items.filter(i => !i.lot || i.lot === '-').length
const noExp = items.filter(i => !i.exp || i.exp === '-').length
const zeroQty = items.filter(i => parseFloat(i.qty) === 0).length
log('')
log(`  ไม่มี lot ${fmt(noLot)} · ไม่มี exp ${fmt(noExp)} · คงเหลือ 0 ${fmt(zeroQty)}`)
log(`  รหัสยาไม่ซ้ำ ${fmt(new Set(items.map(i => i.code)).size)}   (เดิม ${fmt(prev.codes)})`)

log('')
log('  5 ที่เก็บแรก:')
Object.entries(out.inventory).slice(0, 5).forEach(([loc, arr]) => log(`     ${loc} — ${fmt(arr.length)} รายการ`))

if (!guard.ok && !args.force) {
  log('')
  log('  ⛔ ไม่ผ่านด่านตรวจ — ไม่เขียนอะไรทั้งนั้น')
  log('     ถ้าแน่ใจว่าถูกต้อง ให้เพิ่ม --force')
  process.exit(1)
}

if (!args.commit) {
  log('')
  log('  ── ยังไม่ได้เขียนอะไรลงฐานข้อมูล ──')
  log('  ถ้าถูกต้องแล้ว สั่ง:  node scripts/import-master.mjs --commit')
  log('')
  process.exit(0)
}

log('')
log('  กำลังสำรองข้อมูลเดิม…')
let bk
try { bk = await backupTable(supabase, 'inventory') }
catch (e) { die('สำรองข้อมูลไม่สำเร็จ — ' + e.message + '\n  ไม่เขียนทับของเดิม') }
log(`  ✓ สำรองแล้ว ${fmt(bk.rows)} แถว → backup/${path.basename(bk.file)} (${bk.mb} MB)`)

log('')
log(`  กำลังเขียน ${fmt(out.rows)} แถว (ลบของเดิม ${fmt(prev.count)} แถวก่อน)…`)
try {
  await db.saveInventory(out.inventory, { name: `${args.user} (CLI)`, department: 'คลังยา' }, `${path.basename(FILE)} / ${SHEET}`)
} catch (e) {
  log('')
  log('  ✗ เขียนไม่สำเร็จ — ' + e.message)
  log(`  กู้คืนด้วย:  node scripts/restore.mjs backup/${path.basename(bk.file)} --commit`)
  process.exit(1)
}

const after = await fetchAll(supabase, 'inventory', 'id')
log('')
log(after.length === out.rows
  ? `  ✓ เสร็จ — inventory มี ${fmt(after.length)} แถว ตรงกับไฟล์`
  : `  ⚠ เขียนเสร็จแต่จำนวนไม่ตรง: ไฟล์ ${fmt(out.rows)} แต่ DB มี ${fmt(after.length)}`)
log(`  สำรองเดิมเก็บไว้ที่ backup/${path.basename(bk.file)}`)
log('')
