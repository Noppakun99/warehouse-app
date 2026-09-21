#!/usr/bin/env node
// export-csv.mjs — แตกชีทจาก .xlsm/.xlsx ออกเป็นไฟล์ CSV ใน csv_file/
//
//   node scripts/export-csv.mjs              ← แตกทุกชีทที่ตั้งค่าไว้
//   node scripts/export-csv.mjs --only master   ← เฉพาะตัวเดียว
//   node scripts/export-csv.mjs --list       ← ดูรายการที่จะแตก
//
// แทนการเปิด Excel → คลิกขวาชีท → Move or Copy → Save As CSV ทีละไฟล์
// ได้ไฟล์หน้าตาเดียวกับที่คลังทำมือ (UTF-8 BOM ให้ Excel เปิดภาษาไทยไม่เพี้ยน)
//
// ⚠️ วันที่ถูกเขียนตามที่ Excel "แสดง" โดยตั้งใจ — ไฟล์ CSV นี้ไว้ให้คน/เครื่องมืออื่นอ่าน
//    ส่วนการนำเข้าแอพใช้ import-*.mjs ที่อ่าน serial ดิบ ไม่ผ่าน CSV (แม่นกว่า)

import fs from 'fs'
import path from 'path'
import XLSX from 'xlsx'
import { log, fmt, die, parseArgs, checkFile, ROOT } from './_shared.mjs'

const OD = 'C:/Users/PRH0000484/OneDrive'

// ชีทที่แตกออกมา — ชื่อไฟล์ตรงกับที่คลังใช้อยู่เดิมใน csv_file/
export const TARGETS = [
  { key: 'master', file: `${OD}/ยอดคลังยา_69.xlsm`, sheet: 'Master', out: 'ยอดคงคลัง_master.csv' },
  { key: 'dispense', file: `${OD}/ยอดคลังยา_69.xlsm`, sheet: 'เบิก ', out: 'ยอดคงคลัง_เบิก.csv' },
  { key: 'reorder', file: `${OD}/ยอดคลังยา_69.xlsm`, sheet: 'วิเคราะห์สั่งซื้อ', out: 'ยอดคงคลัง_วิเคราะห์สั่งซื้อ.csv' },
  { key: 'receive', file: `${OD}/รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm`, sheet: 'รับยา', out: 'ยอดคงคลัง_รับ.csv' },
  { key: 'loan', file: `${OD}/รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm`, sheet: 'รพ.ยืมยา', out: 'ยืมยา-คืนยา.csv' },
  { key: 'purchase', file: `${OD}/รายงานการซื้อยา_69.xlsx`, sheet: 'รายงานซื้อยา', out: 'รายงานการซื้อยา.csv' },
  { key: 'supplier', file: `${OD}/รายงานการซื้อยา_69.xlsx`, sheet: 'บริษัท_วันที่ล่าสุด_ราคา', out: 'บริษัท_วันที่ล่าสุด_ราคา.csv' },
]

const args = parseArgs()
const only = args.valueOf('--only')
const OUT_DIR = args.valueOf('--out') || path.join(ROOT, 'csv_file')

if (args.has('--list')) {
  log('')
  log('  ชีทที่แตกได้:')
  TARGETS.forEach(t => log(`     ${t.key.padEnd(10)} ${path.basename(t.file)} / "${t.sheet}"  →  ${t.out}`))
  log('')
  process.exit(0)
}

const todo = only ? TARGETS.filter(t => t.key === only) : TARGETS
if (!todo.length) die(`ไม่รู้จัก --only "${only}" (ดูรายการด้วย --list)`)

log('')
log('━━━ แตกชีทเป็น CSV ━━━')
log('')
log(`  ปลายทาง: ${OUT_DIR}`)
fs.mkdirSync(OUT_DIR, { recursive: true })

// ไฟล์ที่ต้องเปิด (เปิดครั้งเดียวต่อไฟล์ ไม่เปิดซ้ำต่อชีท — .xlsm 6 MB เปิดช้า)
const byFile = new Map()
for (const t of todo) {
  if (!byFile.has(t.file)) byFile.set(t.file, [])
  byFile.get(t.file).push(t)
}

let ok = 0, failed = 0
for (const [file, items] of byFile) {
  log('')
  checkFile(file)
  let wb
  try {
    wb = XLSX.readFile(file, { sheets: items.map(i => i.sheet), cellDates: false })
  } catch (e) {
    log(`  ✗ เปิดไฟล์ไม่ได้ — ${e.message}`)
    failed += items.length
    continue
  }
  for (const t of items) {
    const ws = wb.Sheets[t.sheet]
    if (!ws) {
      log(`  ✗ ไม่พบชีท "${t.sheet}"`)
      failed++
      continue
    }
    try {
      // ค่าที่แสดง (raw:false) — ให้เหมือนที่ Excel Save As CSV ออกมา
      const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false, rawNumbers: false })
      const dest = path.join(OUT_DIR, t.out)
      // BOM — ไม่งั้น Excel เปิดแล้วภาษาไทยเพี้ยน
      fs.writeFileSync(dest, '\uFEFF' + csv, 'utf8')
      const kb = (fs.statSync(dest).size / 1024).toFixed(0)
      const lines = csv.split('\n').length - 1
      log(`  ✓ ${t.sheet.padEnd(22)} → ${t.out.padEnd(34)} ${fmt(lines)} แถว · ${fmt(kb)} KB`)
      ok++
    } catch (e) {
      log(`  ✗ ${t.sheet} — ${e.message}`)
      failed++
    }
  }
}

log('')
log(`  เสร็จ ${fmt(ok)} ไฟล์` + (failed ? ` · ล้มเหลว ${fmt(failed)}` : ''))
log('')
if (failed) process.exit(1)
