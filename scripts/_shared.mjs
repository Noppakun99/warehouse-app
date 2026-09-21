// _shared.mjs — ส่วนที่ทุก CLI นำเข้าใช้ร่วมกัน (โหลด env, สำรองข้อมูล, อาร์กิวเมนต์, ตรวจไฟล์)
// แยกไว้ที่เดียวเพื่อไม่ให้ตรรกะสำรอง/ตรวจไฟล์แตกเป็น 4 ชุดแล้วดริฟต์กัน

import fs from 'fs'
import path from 'path'

export const ROOT = path.resolve(import.meta.dirname, '..')

/** โหลด .env.local เข้า process.env — ต้องเรียกก่อน import db.js เสมอ
 *  (supabase client ถูกสร้างตอน import module จึงต้องมี env พร้อมก่อน) */
export function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = path.join(ROOT, name)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
}

export const log = (s = '') => console.log(s)
export const fmt = (n) => Number(n || 0).toLocaleString('th-TH')
export const fmtBaht = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })

export function die(msg) { log(''); log('✗ ' + msg); process.exit(1) }

/** อ่านอาร์กิวเมนต์แบบเดียวกันทุกสคริปต์ */
export function parseArgs(argv = process.argv.slice(2)) {
  const has = (f) => argv.includes(f)
  const valueOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null }
  return {
    commit: has('--commit'),
    force: has('--force'),
    file: valueOf('--file'),
    sheet: valueOf('--sheet'),
    user: valueOf('--user') || process.env.USERNAME || 'CLI',
    has, valueOf, argv,
  }
}

/** ตรวจไฟล์ + เตือนถ้า Excel เปิดค้างอยู่ (มีของที่ยังไม่ Save) */
export function checkFile(FILE) {
  if (!fs.existsSync(FILE)) die(`ไม่พบไฟล์: ${FILE}`)
  const stat = fs.statSync(FILE)
  log(`  ไฟล์  : ${path.basename(FILE)}`)
  log(`  แก้ล่าสุด : ${stat.mtime.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`
    + `   (${(stat.size / 1024 / 1024).toFixed(1)} MB)`)
  const lock = path.join(path.dirname(FILE), '~$' + path.basename(FILE))
  if (fs.existsSync(lock)) {
    log('')
    log('  ⚠ ไฟล์นี้กำลังเปิดอยู่ใน Excel — สิ่งที่พิมพ์แล้วยังไม่กด Save จะไม่ถูกนำเข้า')
    log('    กด Ctrl+S ใน Excel ก่อน แล้วสั่งใหม่')
  }
  return stat
}

/** ดึงทุกแถวของตาราง (ข้าม 1000-row limit — Critical Rule #2) */
export async function fetchAll(supabase, table, cols = '*') {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols).range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

/** สำรองตารางลง backup/<table>_<ts>.json — **ล้มเหลว = ต้องไม่เขียนต่อ**
 *  เก็บ 10 ไฟล์ล่าสุดต่อตาราง ที่เหลือลบทิ้ง */
export async function backupTable(supabase, table) {
  const all = await fetchAll(supabase, table)
  const dir = path.join(ROOT, 'backup')
  fs.mkdirSync(dir, { recursive: true })
  const d = new Date()
  const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    + `_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
  const file = path.join(dir, `${table}_${ts}.json`)
  fs.writeFileSync(file, JSON.stringify({
    table, saved_at: d.toISOString(), rows: all.length, data: all,
  }, null, 0), 'utf8')

  const olds = fs.readdirSync(dir).filter(f => f.startsWith(`${table}_`) && f.endsWith('.json')).sort().reverse()
  olds.slice(10).forEach(f => { try { fs.unlinkSync(path.join(dir, f)) } catch { /* ไม่สำคัญพอจะหยุดงาน */ } })

  return { file, rows: all.length, mb: (fs.statSync(file).size / 1024 / 1024).toFixed(1) }
}

/** Excel serial → "DD/MM/YYYY" (ใช้กับชีทที่เก็บวันที่เป็นตัวเลข)
 *  แปลง พ.ศ. → ค.ศ. เฉพาะช่วง 2500–2600 (คนพิมพ์ปี พ.ศ. ลงช่องวันที่) */
export function serialToThai(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1 || n > 300000) return null
  // Math.floor ไม่ใช่ round — serial ที่มีเศษคือ "เวลา" ของวันนั้น (46202.58 = 29 มิ.ย. 13:54)
  // round จะปัดเศษ >= 0.5 ขึ้นเป็นวันถัดไป (ชีทเบิกมี 1,316 แถวที่เพี้ยนแบบนี้ — เจอ 2026-09-21)
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000)
  if (isNaN(d)) return null
  let y = d.getUTCFullYear()
  if (y >= 2500 && y <= 2600) y -= 543
  if (y < 1990 || y > 2100) return null
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${y}`
}
