#!/usr/bin/env node
// import-purchase.mjs — นำเข้า "รายงานแจ้งการสั่งซื้อยา" (รายงานการซื้อยา_69.xlsx) → purchase_request
//
//   npm run import:purchase                       ← ดูอย่างเดียว
//   npm run import:purchase -- --commit           ← เขียนจริง
//   npm run import:purchase -- --file "<path>"    ← เครื่องอื่น (path default เป็นของเครื่องคลัง)
//
// 🔴 แทนทั้งตาราง (DELETE ALL แล้ว INSERT) — Excel เป็นตัวจริง (ADR-0030) · สำรองก่อนเขียนเสมอ
// ชีท "รายงานซื้อยา" (รอของ) + "ประวัติแจ้งซื้อ" (☑ มาส่งแล้ว · ☐ ยกเลิก)

import XLSX from 'xlsx'
import path from 'path'
import { loadEnv, log, fmt, die, parseArgs, checkFile, backupTable, fetchAll } from './_shared.mjs'

loadEnv()
const { readPurchaseReportWorkbook, MAIN_SHEET, HISTORY_SHEET } = await import('../src/lib/purchaseReportSheet.js')
const db = await import('../src/lib/db.js')
const { supabase } = await import('../src/lib/supabase.js')

const args = parseArgs()
const FILE = args.file || 'C:/Users/PRH0000484/OneDrive/รายงานการซื้อยา_69.xlsx'

log('')
log('━━━ นำเข้ารายงานแจ้งการสั่งซื้อยา ' + (args.commit ? '(เขียนจริง)' : '(ดูอย่างเดียว)') + ' ━━━')
log('')
if (!supabase) die('ไม่พบค่า Supabase ใน .env.local')
checkFile(FILE)

let out
try { out = readPurchaseReportWorkbook(XLSX, FILE) }
catch (e) { die('อ่านไฟล์ไม่สำเร็จ — ' + e.message) }
const s = out.stats

log(`  ชีท ${MAIN_SHEET} : ${fmt(s.main)} แถว (รอของ ${fmt(s.mainWaiting)} · ติ๊กมาส่งแล้วแต่ยังไม่ย้าย ${fmt(s.mainArrived)})`)
log(`  ชีท ${HISTORY_SHEET}       : ${fmt(s.history)} แถว (มาส่งแล้ว ${fmt(s.historyArrived)} · ยกเลิก ${fmt(s.historyCancelled)})`)
log(`  รวม ${fmt(s.total)} แถว · ยา ${fmt(s.codes)} รหัส`)
if (out.skipped.length) {
  log('')
  log(`  ⚠ ข้าม ${fmt(out.skipped.length)} แถว (ไม่นำเข้า):`)
  out.skipped.slice(0, 10).forEach(k => log(`     - ${k.sheet} แถว ${k.rowNumber}${k.code ? ` รหัส ${k.code}` : ''}: ${k.skip}`))
}

// จำนวนที่แจ้ง/เรท ณ วันแจ้ง (ADR-0030 amendment) — ประวัติแจ้งซื้อไม่มีหัวตาราง จึงตรวจ จำนวน × ราคา = มูลค่าสั่ง แทน
const withQty = out.rows.filter(r => r.qty_requested != null).length
log(`  จำนวนที่แจ้ง มีค่า ${fmt(withQty)} / ${fmt(s.total)} แถว · เรท/เดือน มีค่า ${fmt(out.rows.filter(r => r.rate_per_month != null).length)} แถว`)
if (out.mismatch.length) {
  log('')
  log(`  ⚠ จำนวน × ราคา ≠ มูลค่าสั่ง ${fmt(out.mismatch.length)} แถว — คอลัมน์อาจเลื่อน ตรวจไฟล์ก่อน --commit:`)
  out.mismatch.slice(0, 10).forEach(k => log(`     - ${k.sheet} แถว ${k.rowNumber} รหัส ${k.code}`))
}

// ด่านตรวจ: รหัสที่ไม่มีในคลังเลย = อาจพิมพ์ผิด (แจ้งไว้ ไม่หยุด — เวชภัณฑ์ใหม่ยังไม่มีใน Master ได้)
let invCodes = new Set()
try { invCodes = new Set((await fetchAll(supabase, 'inventory', 'code')).map(r => String(r.code ?? '').trim())) }
catch (e) { die('อ่าน inventory ไม่สำเร็จ — ' + e.message) }
const unknown = [...new Set(out.rows.filter(r => !invCodes.has(r.code)).map(r => `${r.code} ${r.name ?? ''}`))]
if (unknown.length) {
  log('')
  log(`  ⚠ รหัสที่ไม่มีใน Master ตอนนี้ ${fmt(unknown.length)} รหัส (ยังนำเข้า — ยาตัดออก/เลิกใช้แล้วก็เป็นแบบนี้):`)
  unknown.slice(0, 8).forEach(u => log(`     - ${u.slice(0, 60)}`))
}

const { count: prevCount, error: cErr } = await supabase.from('purchase_request').select('id', { count: 'exact', head: true })
if (cErr) die('อ่านข้อมูลเดิมไม่สำเร็จ — ' + cErr.message + '\n  (สร้างตารางแล้วหรือยัง? purchase_request_migration.sql)')
log('')
log(`  ของเดิมใน DB : ${fmt(prevCount)} แถว → จะแทนด้วย ${fmt(s.total)} แถว`)

if (!args.commit) {
  log('')
  log('  ── ยังไม่ได้เขียนอะไรลงฐานข้อมูล ──')
  log('  ถ้าถูกต้องแล้ว สั่ง:  npm run import:purchase -- --commit' + (args.file ? ` --file "${args.file}"` : ''))
  log('')
  process.exit(0)
}

log('')
log('  กำลังสำรองข้อมูลเดิม…')
let bk
try { bk = await backupTable(supabase, 'purchase_request') }
catch (e) { die('สำรองข้อมูลไม่สำเร็จ — ' + e.message + '\n  ไม่เขียนทับของเดิม') }
log(`  ✓ สำรองแล้ว ${fmt(bk.rows)} แถว → backup/${path.basename(bk.file)} (${bk.mb} MB)`)

log('')
log(`  กำลังเขียน ${fmt(s.total)} แถว (ลบของเดิม ${fmt(prevCount)} แถวก่อน)…`)
try {
  await db.replacePurchaseRequests(out.rows, { name: `${args.user} (CLI)`, department: 'คลังยา' }, { fileName: path.basename(FILE) })
} catch (e) {
  log('')
  log('  ✗ เขียนไม่สำเร็จ — ' + e.message)
  log(`  กู้คืนด้วย:  node scripts/restore.mjs backup/${path.basename(bk.file)} --commit`)
  process.exit(1)
}
const { count: after } = await supabase.from('purchase_request').select('id', { count: 'exact', head: true })
log('')
if (after !== s.total) die(`จำนวนในฐานข้อมูล ${fmt(after)} ไม่ตรงกับไฟล์ ${fmt(s.total)} — กู้คืนด้วย restore.mjs backup/${path.basename(bk.file)}`)
log(`  ✓ เสร็จ — purchase_request มี ${fmt(after)} แถว ตรงกับไฟล์`)
log(`  สำรองเดิมเก็บไว้ที่ backup/${path.basename(bk.file)}`)
log('')
