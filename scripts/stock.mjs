#!/usr/bin/env node
// stock.mjs — เช็คคงเหลือยาจากชีท Master ของ ยอดคลังยา_69.xlsm (อ่านอย่างเดียว ไม่แตะ DB/ไฟล์)
//
//   node scripts/stock.mjs ors ผู้ใหญ่
//   node scripts/stock.mjs clotri cream
//   node scripts/stock.mjs 1650101          ← รหัส HosXP
//   node scripts/stock.mjs clotri --all     ← แสดง lot ที่เหลือ 0 ด้วย
//
// คำค้นแยกด้วยช่องว่าง ทุกคำต้องเจอในชื่อยา (ไม่สนตัวพิมพ์/ช่องว่าง/จุลภาค) หรือตรงรหัส
// ค่าที่อ่าน = cache ของสูตรตอน Save ล่าสุด — พิมพ์ใน Excel แล้วยังไม่ Save จะไม่เห็น
// หาคอลัมน์ด้วยชื่อหัวตาราง ไม่ใช่ตัวอักษร (คอลัมน์ Master ถูกย้ายตอนขึ้นเดือนได้)

import XLSX from 'xlsx'
import { log, die, fmt, parseArgs, checkFile, serialToThai } from './_shared.mjs'

const args = parseArgs()
const FILE = args.file || 'C:/Users/PRH0000484/OneDrive/ยอดคลังยา_69.xlsm'
const showAll = args.has('--all')
const words = args.argv.filter((a, i) => !a.startsWith('--') && args.argv[i - 1] !== '--file')
if (!words.length) die('ใส่คำค้น เช่น  node scripts/stock.mjs ors ผู้ใหญ่')

// ชื่อเรียกสั้นที่ไม่อยู่ในชื่อยาของ Master — เจอคำที่ยังค้นไม่ติดให้เติมที่นี่
const ALIAS = { ors: 'oralrehydration' }

const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s,]+/g, '')
const tokens = words.map(norm).filter(Boolean).map((t) => ALIAS[t] || t)

checkFile(FILE)
const wb = XLSX.readFile(FILE, { sheets: ['Master'] })
const ws = wb.Sheets['Master']
if (!ws) die('ไม่พบชีท Master')
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' })
const head = rows[0].map((h) => String(h).trim())

const col = (pred, label) => {
  const i = head.findIndex(pred)
  if (i < 0) die(`ไม่พบคอลัมน์ "${label}" ในชีท Master`)
  return i
}
const C = {
  code: col((h) => h === 'รหัสHosxp', 'รหัสHosxp'),
  name: col((h) => h === 'รายการยา', 'รายการยา'),
  unit: col((h) => h === 'หน่วย', 'หน่วย'),
  form: col((h) => h === 'ชนิด', 'ชนิด'),
  lot: col((h) => h === 'Lot Number', 'Lot Number'),
  exp: col((h) => h === 'Exp', 'Exp'),
  type: col((h) => h === 'ชนิดรายการ', 'ชนิดรายการ'),
  status: col((h) => h === 'สถานะตรวจรับ', 'สถานะตรวจรับ'),
  out: col((h) => h === 'ปริมาณ (ออก)', 'ปริมาณ (ออก)'),
  left: col((h) => h === 'คงเหลือหลังจ่าย', 'คงเหลือหลังจ่าย'),
  recvDate: col((h) => h === 'วันที่รับเข้า', 'วันที่รับเข้า'),
  supplier: col((h) => h === 'บริษัท', 'บริษัท'),
  bill: col((h) => h === 'เลขที่บิลซื้อ', 'เลขที่บิลซื้อ'),
}

const today = new Date(); today.setHours(0, 0, 0, 0)
const thaiDate = (v) => {
  const s = typeof v === 'number' ? serialToThai(v) : null
  if (!s) return String(v || '-')
  const [d, m, y] = s.split('/')
  return `${d}/${m}/${Number(y) + 543}`
}
// EXP แสดง ค.ศ. ตามที่พิมพ์บนกล่องยาและตารางในแอป
const ceDate = (v) => (typeof v === 'number' ? serialToThai(v) : null) || String(v || '-')
const isExpired = (v) => {
  const s = typeof v === 'number' ? serialToThai(v) : null
  if (!s) return false
  const [d, m, y] = s.split('/').map(Number)
  return new Date(y, m - 1, d) < today
}
const num = (v) => (typeof v === 'number' ? v : Number(String(v).replace(/,/g, '')) || 0)
const shortSupplier = (v) => String(v || '-').replace(/^บริษัท\s*/, '').replace(/\s*จำกัด.*$/, '').trim() || '-'

const groups = new Map()
for (const r of rows.slice(1)) {
  const code = String(r[C.code]).trim()
  const name = String(r[C.name]).trim()
  if (!code || !name) continue
  const hay = norm(name)
  if (!tokens.every((t) => hay.includes(t) || norm(code) === t)) continue
  const key = `${code}|${name}|${r[C.unit]}`
  if (!groups.has(key)) groups.set(key, { code, name, unit: r[C.unit], form: String(r[C.form]).trim(), rows: [] })
  groups.get(key).rows.push(r)
}

if (!groups.size) {
  log('')
  log(`  ไม่พบยาที่ชื่อมีทุกคำ: ${words.join(' ')}`)
  log('  ลองคำสั้นลง/สะกดตามชื่อใน Master (ภาษาอังกฤษ) หรือค้นด้วยรหัส')
  process.exit(0)
}

// ผลลัพธ์เป็นตาราง markdown วางตอบ user ได้ทันที — หน้าตาตามตารางยาในแอป (ชื่อ+รหัส · ชนิด · ยอดรวม · จำนวน lot แล้วตามด้วยราย lot)
for (const g of groups.values()) {
  let total = 0, pending = 0, out = 0
  const live = [], zero = []
  for (const r of g.rows) {
    const left = num(r[C.left])
    total += left
    out += num(r[C.out])
    const isPending = String(r[C.status]).includes('รอตรวจรับ')
    if (isPending) pending += left
    if (left !== 0) live.push({ r, left, isPending })
    else zero.push(String(r[C.lot]))
  }
  const list = showAll ? g.rows.map((r) => ({ r, left: num(r[C.left]), isPending: String(r[C.status]).includes('รอตรวจรับ') })) : live
  log('')
  log(`**${g.name}** \`${g.code}\` · ${g.form || '-'} · รวม **${fmt(total)}** ${g.unit} · ${live.length} lot`)
  log(`จ่ายได้ ${fmt(total - pending)} ${g.unit}` + (pending ? ` · รอตรวจรับ ${fmt(pending)}` : '') + ` · เบิกออกงวดนี้ ${fmt(out)}`)
  if (!list.length) { log('(ไม่มี lot ที่มีของ)'); continue }
  const anyFlag = list.some(({ r, isPending }) => isPending || isExpired(r[C.exp]))
  log('')
  log(`| Lot | EXP | จำนวน | หน่วย | บริษัท | บิล |${anyFlag ? ' สถานะ |' : ''}`)
  log(`|---|---|--:|---|---|---|${anyFlag ? '---|' : ''}`)
  for (const { r, left, isPending } of list) {
    const flags = []
    if (isExpired(r[C.exp])) flags.push('หมดอายุแล้ว')
    if (isPending) flags.push(`รอตรวจรับ (รับ ${thaiDate(r[C.recvDate])})`)
    log(`| ${r[C.lot] || '-'} | ${ceDate(r[C.exp])} | ${fmt(left)} | ${g.unit} | ${shortSupplier(r[C.supplier])} | ${r[C.bill] || '-'} |`
      + (anyFlag ? ` ${flags.join(' · ')} |` : ''))
  }
  if (!showAll && zero.length) log(`\nlot ที่เหลือ 0: ${zero.join(', ')}`)
}
