#!/usr/bin/env node
// import-reorder.mjs — นำเข้า VEN + สถานะตัดออก จากชีท "วิเคราะห์สั่งซื้อ" → drug_reorder_config
//
//   node scripts/import-reorder.mjs            ← ดูอย่างเดียว
//   node scripts/import-reorder.mjs --commit   ← เขียนจริง
//
// ⚠️ UPSERT ไม่ใช่ DELETE ALL — แถวเดิมที่ไม่มีในไฟล์จะคงอยู่ ไม่ถูกลบ
// ⚠️ ADR-0001: import แค่ VEN + exclude_status เท่านั้น
//    ราคา/บริษัท/LT แอป derive จาก receive_logs สด — ค่าใน Excel stale ห้ามทับ

import XLSX from 'xlsx'
import path from 'path'
import { loadEnv, log, fmt, die, parseArgs, checkFile, backupTable } from './_shared.mjs'

loadEnv()
const { readReorderWorkbook, STATUS } = await import('../src/lib/reorderSheet.js')
const db = await import('../src/lib/db.js')
const { supabase } = await import('../src/lib/supabase.js')

const args = parseArgs()
const FILE = args.file || 'C:/Users/PRH0000484/OneDrive/ยอดคลังยา_69.xlsm'
const SHEET = args.sheet || 'วิเคราะห์สั่งซื้อ'

log('')
log('━━━ นำเข้าวิเคราะห์สั่งซื้อ (VEN + ตัดออก) ' + (args.commit ? '(เขียนจริง)' : '(ดูอย่างเดียว)') + ' ━━━')
log('')
if (!supabase) die('ไม่พบค่า Supabase ใน .env.local')
checkFile(FILE)
log(`  ชีท   : ${SHEET}`)

let out
try { out = readReorderWorkbook(XLSX, FILE, SHEET) }
catch (e) { die('อ่านชีทไม่สำเร็จ — ' + e.message) }

log('')
log(`  อ่านได้ ${fmt(out.rows.length)} รายการ · ข้ามแถวไม่มีรหัส ${fmt(out.skipped)}`)
log('')
log(`  กลุ่ม VEN : Critical ${fmt(out.stats.byRisk.Critical)} · Essential ${fmt(out.stats.byRisk.Essential)}`
  + ` · Normal ${fmt(out.stats.byRisk.Normal)} · ไม่ระบุ ${fmt(out.stats.noRisk)}`)
log(`  ตัดออกจากบัญชี ${fmt(out.stats.excluded)} · สั่งเมื่อขอ ${fmt(out.stats.onDemand)}`)

let prev = []
try { prev = await db.fetchDrugReorderConfig() }
catch (e) { die('อ่านข้อมูลเดิมไม่สำเร็จ — ' + e.message) }
const prevArr = Array.isArray(prev) ? prev : Object.values(prev || {})
log('')
log(`  ของเดิมใน DB : ${fmt(prevArr.length)} รายการ`)

const prevByCode = new Map(prevArr.map(r => [String(r.code), r]))
const isNew = out.rows.filter(r => !prevByCode.has(r.code))
const changed = out.rows.filter(r => {
  const p = prevByCode.get(r.code)
  return p && (p.risk_group !== r.risk_group || p.exclude_status !== r.exclude_status)
})
log(`  รายการใหม่   : ${fmt(isNew.length)}`)
log(`  VEN/สถานะเปลี่ยน : ${fmt(changed.length)}`)
if (changed.length) {
  log('')
  log('  ตัวอย่างที่เปลี่ยน:')
  changed.slice(0, 5).forEach(r => {
    const p = prevByCode.get(r.code)
    const bits = []
    if (p.risk_group !== r.risk_group) bits.push(`VEN ${p.risk_group ?? '-'}→${r.risk_group ?? '-'}`)
    if (p.exclude_status !== r.exclude_status) bits.push(`สถานะ ${p.exclude_status ?? '-'}→${r.exclude_status ?? '-'}`)
    log(`     ${r.code} ${String(r.name ?? '').slice(0, 26)} : ${bits.join(' · ')}`)
  })
}

if (!args.commit) {
  log('')
  log('  ── ยังไม่ได้เขียนอะไรลงฐานข้อมูล ──')
  log('  ถ้าถูกต้องแล้ว สั่ง:  node scripts/import-reorder.mjs --commit')
  log('')
  process.exit(0)
}

log('')
log('  กำลังสำรองข้อมูลเดิม…')
let bk
try { bk = await backupTable(supabase, 'drug_reorder_config') }
catch (e) { die('สำรองข้อมูลไม่สำเร็จ — ' + e.message + '\n  ไม่เขียนทับของเดิม') }
log(`  ✓ สำรองแล้ว ${fmt(bk.rows)} แถว → backup/${path.basename(bk.file)} (${bk.mb} MB)`)

log('')
log(`  กำลังเขียน ${fmt(out.rows.length)} รายการ (UPSERT ไม่ลบของเดิม)…`)
try {
  const n = await db.bulkUpsertDrugReorderConfig(out.rows, { name: `${args.user} (CLI)`, department: 'คลังยา' })
  log('')
  log(`  ✓ เสร็จ — บันทึก ${fmt(n ?? out.rows.length)} รายการ`)
} catch (e) {
  log('')
  log('  ✗ เขียนไม่สำเร็จ — ' + e.message)
  log(`  กู้คืนด้วย:  node scripts/restore.mjs backup/${path.basename(bk.file)} --commit`)
  process.exit(1)
}
log(`  สำรองเดิมเก็บไว้ที่ backup/${path.basename(bk.file)}`)
log('')
void STATUS
