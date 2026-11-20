#!/usr/bin/env node
// import-ledger.mjs — นำเข้าชีท snapshot ปิดงวด "Master_<เดือน>" → stock_ledger (งวด closed) — ADR-0031
//
//   node scripts/import-ledger.mjs --sheet Master_ต.ค.69                     ← ดูอย่างเดียว (งวดอ่านจากชื่อชีท)
//   node scripts/import-ledger.mjs --sheet Master_ต.ค.69 --period 2026-10 --commit
//   ... --commit --reason "แก้ยอด Xxx หลังส่งบัญชี"                           ← ทับงวดที่ปิดแล้ว (ลงเหตุผลใน audit)
//
// เขียนเป็นสถานะ closed ทันที (snapshot มีได้ต่อเมื่อปิดยอดเดือนนั้นแล้ว)
// ⛔ ไม่เรียก closeLedgerPeriod — มันคำนวณ closing ใหม่ด้วยสมการ ซึ่งผิดกับแถวบริจาค/โครงการ (ADR-0031 ข้อ 1)

import XLSX from 'xlsx'
import path from 'path'
import { loadEnv, log, fmt, fmtBaht, die, parseArgs, checkFile, backupTable, fetchAll } from './_shared.mjs'

loadEnv()
const { seedFromMasterGrid } = await import('../src/lib/ledgerSeed.js')
const db = await import('../src/lib/db.js')
const { supabase } = await import('../src/lib/supabase.js')

const args = parseArgs()
const FILE = args.file || 'C:/Users/PRH0000484/OneDrive/ยอดคลังยา_69.xlsm'
const SHEET = args.sheet
const REASON = (args.valueOf('--reason') || '').trim()

const TH_MONTH = { 'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12 }
/** 'Master_ต.ค.69' → '2026-10' · อ่านไม่ออก = null */
function periodFromSheet(name) {
  const m = String(name || '').match(/(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{2})\s*$/)
  if (!m) return null
  return `${2500 + Number(m[2]) - 543}-${String(TH_MONTH[m[1]]).padStart(2, '0')}`
}

log('')
log('━━━ นำเข้าทะเบียนคงคลังรายเดือน (ชีท snapshot) ' + (args.commit ? '(เขียนจริง)' : '(ดูอย่างเดียว)') + ' ━━━')
log('')
if (!supabase) die('ไม่พบค่า Supabase ใน .env.local')
if (!SHEET) die('ต้องระบุ --sheet เช่น --sheet Master_ต.ค.69 (ห้ามใช้ชีท Master ที่ยังเดินอยู่ — ไม่ใช่ยอดปิดงวด)')
if (SHEET.trim() === 'Master') die('ชีท Master คือเดือนที่ยังเดินอยู่ ไม่ใช่ snapshot ปิดงวด — ใช้ Master_<เดือน>')

const fromName = periodFromSheet(SHEET)
const PERIOD = args.valueOf('--period') || fromName
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(PERIOD || '')) die(`งวดไม่ถูกต้อง: ${PERIOD} — ระบุ --period YYYY-MM`)
if (fromName && fromName !== PERIOD) die(`--period ${PERIOD} ไม่ตรงกับชื่อชีท ${SHEET} (= ${fromName})`)

checkFile(FILE)
log(`  ชีท   : ${SHEET}   →   งวด ${PERIOD}`)

let wb
try { wb = XLSX.readFile(FILE, { sheets: [SHEET], cellDates: false }) }
catch (e) { die('อ่านไฟล์ไม่สำเร็จ — ' + e.message) }
const ws = wb.Sheets[SHEET]
if (!ws) die(`ไม่พบชีท "${SHEET}" ในไฟล์`)
const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false })

let out
try { out = seedFromMasterGrid(grid, PERIOD, { status: 'closed' }) }
catch (e) { die(e.message) }
const { rows, skipped, merged, expConflicts, noExp, tieOut } = out

log('')
log(`  อ่านได้ ${fmt(rows.length)} แถวบัญชี (cost layer) · ข้ามแถวสรุป ${fmt(skipped)} · ยุบแถวซ้ำ ${fmt(merged)}`)
log(`  รหัสยาไม่ซ้ำ ${fmt(new Set(rows.map(r => r.drug_code)).size)}`)
log('')
log('  ยอดคงคลังสิ้นงวด (เทียบไฟล์รายงานส่งบัญชีก่อนเขียน):')
log(`     เวชภัณฑ์ยา          ${fmtBaht(tieOut.drug).padStart(16)} บาท`)
log(`     เวชภัณฑ์มิใช่ยา      ${fmtBaht(tieOut.nonDrug).padStart(16)} บาท`)
log(`     บริจาค+สนับสนุน     ${fmtBaht(tieOut.donation).padStart(16)} บาท`)
log(`     ยาโครงการ          ${fmtBaht(tieOut.project).padStart(16)} บาท`)
log(`     รวม               ${fmtBaht(tieOut.total).padStart(16)} บาท`)

// ข้อสังเกตที่แฟ้ม 5 จะขึ้นเป็นปัญหา — ดูตอนนี้ก่อน ไม่เดาแทน
const withQty = rows.filter(r => Number(r.closing_qty) !== 0)
const noExpLive = withQty.filter(r => !r.exp)
log('')
log(`  ไม่มี exp ${fmt(noExp)} แถว (ที่ยังมีของ ${fmt(noExpLive.length)}) · ไม่มี packsize ${fmt(rows.filter(r => r.pack_size == null).length)}`
  + ` · ไม่มีหน่วยย่อย ${fmt(rows.filter(r => !r.sub_unit).length)} · exp ขัดกันในแถวที่ยุบ ${fmt(expConflicts)}`)
if (noExpLive.length) {
  log('  แถวที่ยังมีของแต่ไม่มี exp (10 แถวแรก):')
  noExpLive.slice(0, 10).forEach(r => log(`     ${r.drug_code}  ${r.drug_name.slice(0, 40)}  lot ${r.lot}  เหลือ ${fmt(r.closing_qty)}`))
}

// ของเดิมในงวดนี้
let prev = []
try { prev = await db.fetchLedgerPeriod(PERIOD) }
catch (e) { die('อ่านข้อมูลเดิมไม่สำเร็จ — ' + e.message) }
const prevClosed = prev.some(r => r.status === 'closed')
const prevValue = prev.reduce((s, r) => s + (Number(r.closing_value) || 0), 0)
log('')
log(prev.length
  ? `  งวด ${PERIOD} ในระบบตอนนี้: ${fmt(prev.length)} แถว · ${fmtBaht(prevValue)} บาท · สถานะ ${prevClosed ? 'ปิดแล้ว' : 'เปิด'} → จะถูกแทนทั้งงวด`
  : `  งวด ${PERIOD} ยังไม่มีในระบบ → เพิ่มใหม่`)

const blocked = prevClosed && !REASON
if (blocked) {
  log('')
  log('  ⛔ งวดนี้ปิดแล้ว — ทับได้เมื่อระบุเหตุผล:  --reason "<เหตุผล>"  (ลงประวัติการใช้งาน)')
}

// ไม่เรียก process.exit(0) หลัง supabase fetch — Node บน Windows ล้มด้วย UV_HANDLE_CLOSING (exit 127)
if (!args.commit || blocked) {
  if (!args.commit) {
    log('')
    log('  ── ยังไม่ได้เขียนอะไรลงฐานข้อมูล ──')
    log(`  ถ้ายอดตรงไฟล์ส่งบัญชีแล้ว สั่ง:  node scripts/import-ledger.mjs --sheet ${SHEET} --period ${PERIOD} --commit`)
    log('')
  }
  process.exitCode = blocked && args.commit ? 1 : 0
} else {
  await commitPeriod()
}

async function commitPeriod() {
  log('')
  log('  กำลังสำรองข้อมูลเดิม…')
  let bk
  try { bk = await backupTable(supabase, 'stock_ledger') }
  catch (e) { die('สำรองข้อมูลไม่สำเร็จ — ' + e.message + '\n  ไม่เขียนทับของเดิม') }
  log(`  ✓ สำรองแล้ว ${fmt(bk.rows)} แถว → backup/${path.basename(bk.file)} (${bk.mb} MB)`)

  log('')
  log(`  กำลังเขียน ${fmt(rows.length)} แถว งวด ${PERIOD} สถานะปิดแล้ว…`)
  try {
    await db.bulkInsertLedgerRows(rows, { name: `${args.user} (CLI)`, department: 'คลังยา' }, { replaceClosedReason: REASON })
  } catch (e) {
    log('')
    log('  ✗ เขียนไม่สำเร็จ — ' + e.message)
    log(`  กู้คืนด้วย:  node scripts/restore.mjs backup/${path.basename(bk.file)} --commit`)
    process.exit(1)
}

const after = (await fetchAll(supabase, 'stock_ledger', 'period, status, closing_value')).filter(r => r.period === PERIOD)
const afterValue = after.reduce((s, r) => s + (Number(r.closing_value) || 0), 0)
const ok = after.length === rows.length && Math.abs(afterValue - tieOut.total) < 0.01 && after.every(r => r.status === 'closed')
log('')
log(ok
  ? `  ✓ เสร็จ — งวด ${PERIOD} มี ${fmt(after.length)} แถว · ${fmtBaht(afterValue)} บาท ตรงกับชีท · ปิดแล้วทุกแถว`
  : `  ⚠ เขียนเสร็จแต่ไม่ตรง: ชีท ${fmt(rows.length)} แถว ${fmtBaht(tieOut.total)} บาท · DB ${fmt(after.length)} แถว ${fmtBaht(afterValue)} บาท`)
log(`  สำรองเดิมเก็บไว้ที่ backup/${path.basename(bk.file)}`)
log('')
}
