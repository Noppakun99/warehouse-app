#!/usr/bin/env node
// import-loan.mjs — นำเข้ายืม-คืนยาจากชีท "รพ.ยืมยา" เข้า drug_loan
//
//   node scripts/import-loan.mjs                  ← ดูอย่างเดียว
//   node scripts/import-loan.mjs --commit         ← เขียนจริง
//   node scripts/import-loan.mjs --commit --delete-missing   ← ลบแถวที่ไม่มีในไฟล์ด้วย
//
// ⚠️ ต่างจาก import-receive: ตารางนี้ **ไม่ DELETE ALL**
//    ใช้ diffLoanImport คำนวณว่าอะไรใหม่/อะไรเปลี่ยน แล้วแตะเฉพาะที่ต่าง
//    แถวเดิมคง `id` และ `note` ที่พิมพ์ในแอปไว้ (ไฟล์ไม่มีคอลัมน์ note)
//    การลบต้องสั่งเอง (--delete-missing) เพราะแถวที่หายจากไฟล์อาจเป็นของที่ยังค้างคืนอยู่จริง

import XLSX from 'xlsx'
import { loadEnv, log, fmt, die, parseArgs, checkFile, backupTable, serialToThai, ROOT } from './_shared.mjs'
import path from 'path'

loadEnv()
const { parseLoanGrid, diffLoanImport } = await import('../src/lib/loanImport.js')
const db = await import('../src/lib/db.js')
const { supabase } = await import('../src/lib/supabase.js')

const args = parseArgs()
const DELETE_MISSING = args.has('--delete-missing')
const FILE = args.file || 'C:/Users/PRH0000484/OneDrive/รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm'
const SHEET = args.sheet || 'รพ.ยืมยา'

log('')
log('━━━ นำเข้ายืม-คืนยา ' + (args.commit ? '(เขียนจริง)' : '(ดูอย่างเดียว)') + ' ━━━')
log('')
if (!supabase) die('ไม่พบค่า Supabase ใน .env.local')
checkFile(FILE)
log(`  ชีท   : ${SHEET}`)

// ── อ่านชีท ──────────────────────────────────────────────────────
let parsed
try {
  const wb = XLSX.readFile(FILE, { sheets: [SHEET], cellDates: false })
  const ws = wb.Sheets[SHEET]
  if (!ws) throw new Error(`ไม่พบชีท "${SHEET}" ในไฟล์`)
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false })
  // grid ข้อความ — ใช้เฉพาะ exp ที่เก็บเป็นข้อความอิสระ ("25 กุมภาพันธ์ 2027")
  const fmtGrid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false })
  parsed = parseLoanGrid(grid, serialToThai, fmtGrid)
} catch (e) {
  die('อ่านชีทไม่สำเร็จ — ' + e.message)
}
if (parsed.errors.length && !parsed.rows.length) {
  die('อ่านชีทไม่ได้ — ' + parsed.errors[0].reason)
}
log('')
log(`  อ่านได้ ${fmt(parsed.rows.length)} แถว`)
if (parsed.errors.length) {
  log(`  ⚠ แถวที่อ่านไม่ได้ ${fmt(parsed.errors.length)} แถว:`)
  parsed.errors.slice(0, 5).forEach(e => log(`     - บรรทัด ${e.lineNo}: ${e.reason}`))
}

// ── เทียบกับของเดิม ──────────────────────────────────────────────
let dbRows
try { dbRows = await db.fetchDrugLoans() }
catch (e) { die('อ่านข้อมูลเดิมไม่สำเร็จ — ' + e.message) }

const plan = diffLoanImport(parsed.rows, dbRows)
const deleteIds = DELETE_MISSING ? (plan.missing || []).map(r => r.id) : []

log('')
log(`  ของเดิมใน DB : ${fmt(dbRows.length)} แถว`)
log('')
log(`  แถวใหม่        : ${fmt(plan.inserts.length)}`)
log(`  แถวที่ต้องแก้   : ${fmt(plan.updates.length)}`)
log(`  ไม่เปลี่ยนแปลง  : ${fmt(plan.unchanged?.length ?? 0)}`)
log(`  มีใน DB ไม่มีในไฟล์ : ${fmt(plan.missing?.length ?? 0)}`
  + (DELETE_MISSING ? '   ← จะลบ (--delete-missing)' : '   ← เก็บไว้ (ใส่ --delete-missing ถ้าต้องการลบ)'))

if (plan.inserts.length) {
  log('')
  log('  ตัวอย่างแถวใหม่:')
  plan.inserts.slice(0, 5).forEach(r =>
    log(`     ${r.loan_date} | ${r.direction === 'borrow' ? 'เรายืม' : 'ให้ยืม'} ${r.counterparty} | ${r.drug_name} | ${fmt(r.qty)}`))
}
if (plan.updates.length) {
  log('')
  log('  ตัวอย่างแถวที่เปลี่ยน:')
  plan.updates.slice(0, 5).forEach(u =>
    log(`     id ${u.id}: ${Object.keys(u.fields).join(', ')}`))
}
if (deleteIds.length) {
  log('')
  log('  ⚠ แถวที่จะลบ:')
  plan.missing.slice(0, 5).forEach(r => log(`     id ${r.id} | ${r.drug_name} | ${r.loan_date}`))
}

const total = plan.inserts.length + plan.updates.length + deleteIds.length
if (total === 0) {
  log('')
  log('  ✓ ข้อมูลตรงกันอยู่แล้ว ไม่มีอะไรต้องเปลี่ยน')
  log('')
  process.exit(0)
}

if (!args.commit) {
  log('')
  log('  ── ยังไม่ได้เขียนอะไรลงฐานข้อมูล ──')
  log('  ถ้าถูกต้องแล้ว สั่ง:  node scripts/import-loan.mjs --commit')
  log('')
  process.exit(0)
}

// ── สำรอง แล้วเขียน ──────────────────────────────────────────────
log('')
log('  กำลังสำรองข้อมูลเดิม…')
let bk
try { bk = await backupTable(supabase, 'drug_loan') }
catch (e) { die('สำรองข้อมูลไม่สำเร็จ — ' + e.message + '\n  ไม่เขียนทับของเดิม') }
log(`  ✓ สำรองแล้ว ${fmt(bk.rows)} แถว → backup/${path.basename(bk.file)} (${bk.mb} MB)`)

log('')
log(`  กำลังเขียน (เพิ่ม ${fmt(plan.inserts.length)} · แก้ ${fmt(plan.updates.length)} · ลบ ${fmt(deleteIds.length)})…`)
try {
  await db.importDrugLoans(
    { inserts: plan.inserts, updates: plan.updates, deleteIds, fileName: `${path.basename(FILE)} / ${SHEET}` },
    { name: `${args.user} (CLI)`, department: 'คลังยา' },
  )
} catch (e) {
  log('')
  log('  ✗ เขียนไม่สำเร็จ — ' + e.message)
  log(`  กู้คืนด้วย:  node scripts/restore.mjs backup/${path.basename(bk.file)} --commit`)
  process.exit(1)
}

const after = await db.fetchDrugLoans()
log('')
log(`  ✓ เสร็จ — drug_loan มี ${fmt(after.length)} แถว`)
log(`  สำรองเดิมเก็บไว้ที่ backup/${path.basename(bk.file)}`)
log('')
void ROOT
