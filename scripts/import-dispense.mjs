#!/usr/bin/env node
// import-dispense.mjs — นำเข้าประวัติเบิกจ่ายจากชีท "เบิก " → dispense_logs
//
//   node scripts/import-dispense.mjs            ← ดูอย่างเดียว
//   node scripts/import-dispense.mjs --commit   ← เขียนจริง
//
// 🔴 DELETE ALL → INSERT (insertDispenseRows ใน db.js) — ไฟล์ไม่ครบ = ประวัติเบิกหายถาวร
// ⚠️ ชื่อชีทมีเว้นวรรคต่อท้าย (`'เบิก '`) · หัวตารางอยู่แถวที่ 6

import XLSX from 'xlsx'
import path from 'path'
import { loadEnv, log, fmt, die, parseArgs, checkFile, backupTable, fetchAll } from './_shared.mjs'

loadEnv()
const { readDispenseWorkbook, DISPENSE_SHEET_NAME } = await import('../src/lib/dispenseSheet.js')
const { runGuards, formatGuardReport } = await import('../src/lib/importGuard.js')
const db = await import('../src/lib/db.js')
const { supabase } = await import('../src/lib/supabase.js')

const args = parseArgs()
const FILE = args.file || 'C:/Users/PRH0000484/OneDrive/ยอดคลังยา_69.xlsm'
const SHEET = args.sheet || DISPENSE_SHEET_NAME

log('')
log('━━━ นำเข้าประวัติเบิกจ่าย ' + (args.commit ? '(เขียนจริง)' : '(ดูอย่างเดียว)') + ' ━━━')
log('')
if (!supabase) die('ไม่พบค่า Supabase ใน .env.local')
checkFile(FILE)
log(`  ชีท   : "${SHEET}"   (ชื่อมีเว้นวรรคต่อท้าย)`)

let out
try { out = readDispenseWorkbook(XLSX, FILE, SHEET) }
catch (e) { die('อ่านชีทไม่สำเร็จ — ' + e.message) }

log('')
log(`  หัวตาราง : แถวที่ ${out.headerRow + 1}`)
log(`  อ่านได้ ${fmt(out.rows.length)} แถว · ข้าม ${fmt(out.skipped)}`)

let prevRows = []
try { prevRows = await fetchAll(supabase, 'dispense_logs', 'dispense_date, qty_out, drug_code') }
catch (e) { die('อ่านข้อมูลเดิมไม่สำเร็จ — ' + e.message) }

// ด่านตรวจ: ใช้ dispense_date เป็นวันที่ และ qty_out แทนมูลค่า (ตารางนี้ไม่มีราคารวม)
const asGuard = (r) => ({ receive_date: r.dispense_date, total_price_vat: Number(r.qty_out) || 0, bill_number: null, drug_code: r.drug_code })
const prev = (() => {
  const g = prevRows.map(asGuard)
  const dates = g.map(r => r.receive_date).filter(Boolean).sort()
  return {
    count: g.length,
    value: g.reduce((s, r) => s + r.total_price_vat, 0),
    bills: 0,
    codes: new Set(g.map(r => r.drug_code)).size,
    firstDate: dates[0] || null,
    lastDate: dates[dates.length - 1] || null,
  }
})()
const guard = runGuards(out.rows.map(asGuard), prev, [])

log('')
log(formatGuardReport(guard).replace('มูลค่ารวม', 'ยอดจ่ายรวม').replace(/ บาท/g, ' หน่วย'))

if (out.warnings.length) {
  log('')
  log(`  ⚠ แถวที่ข้อมูลไม่ครบ ${fmt(out.warnings.length)} แถว:`)
  const byIssue = {}
  out.warnings.forEach(w => w.issues.forEach(i => { byIssue[i] = (byIssue[i] || 0) + 1 }))
  Object.entries(byIssue).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => log(`     - ${k}: ${fmt(v)} แถว`))
}

const newest = [...out.rows].sort((a, b) => String(b.dispense_date).localeCompare(String(a.dispense_date))).slice(0, 5)
log('')
log('  5 แถวล่าสุดในไฟล์:')
newest.forEach(r => log(`     ${r.dispense_date} | ${String(r.drug_name).slice(0, 30)} | lot ${r.lot} | ออก ${fmt(r.qty_out)} | ${r.department}`))

if (!guard.ok && !args.force) {
  log('')
  log('  ⛔ ไม่ผ่านด่านตรวจ — ไม่เขียนอะไรทั้งนั้น')
  log('     ถ้าแน่ใจว่าถูกต้อง ให้เพิ่ม --force')
  process.exit(1)
}

if (!args.commit) {
  log('')
  log('  ── ยังไม่ได้เขียนอะไรลงฐานข้อมูล ──')
  log('  ถ้าถูกต้องแล้ว สั่ง:  node scripts/import-dispense.mjs --commit')
  log('')
  process.exit(0)
}

log('')
log('  กำลังสำรองข้อมูลเดิม…')
let bk
try { bk = await backupTable(supabase, 'dispense_logs') }
catch (e) { die('สำรองข้อมูลไม่สำเร็จ — ' + e.message + '\n  ไม่เขียนทับของเดิม') }
log(`  ✓ สำรองแล้ว ${fmt(bk.rows)} แถว → backup/${path.basename(bk.file)} (${bk.mb} MB)`)

log('')
log(`  กำลังเขียน ${fmt(out.rows.length)} แถว (ลบของเดิม ${fmt(prev.count)} แถวก่อน)…`)
try {
  await db.insertDispenseRows(out.rows, { name: `${args.user} (CLI)`, department: 'คลังยา' },
    `${path.basename(FILE)} / ${SHEET}`)
} catch (e) {
  log('')
  log('  ✗ เขียนไม่สำเร็จ — ' + e.message)
  log(`  กู้คืนด้วย:  node scripts/restore.mjs backup/${path.basename(bk.file)} --commit`)
  process.exit(1)
}

const after = await fetchAll(supabase, 'dispense_logs', 'id')
log('')
log(after.length === out.rows.length
  ? `  ✓ เสร็จ — dispense_logs มี ${fmt(after.length)} แถว ตรงกับไฟล์`
  : `  ⚠ เขียนเสร็จแต่จำนวนไม่ตรง: ไฟล์ ${fmt(out.rows.length)} แต่ DB มี ${fmt(after.length)}`)
log(`  สำรองเดิมเก็บไว้ที่ backup/${path.basename(bk.file)}`)
log('')
