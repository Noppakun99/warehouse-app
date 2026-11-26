// ตัวกันบั๊ก "จำนวนติดหน่วยที่ขึ้นต้นด้วยเลข" — "คงเหลือ 7 50amp" อ่านไม่ออกว่า 7 อะไร (user 25/11/2569: นับเป็นบั๊ก แก้ถาวรทุกระบบ)
// กฎ: หน่วยที่แสดงต่อจากตัวเลขต้องผ่าน unitLabel()/qtyWithUnit()/packUnitLabel() (src/lib/drugProfile.js) → "7 กล่อง (50 amp)"
// สแกนทั้งไฟล์ (ไม่ใช่ทีละบรรทัด) เพราะตัวเลขกับหน่วยมักอยู่คนละ element คนละบรรทัด:
//   <span>{remaining.toLocaleString()}</span>
//   <span> {drug.baseUnit}</span>            ← จับได้
// ตั้งใจให้หน่วยเดี่ยว (ไม่ใช่หลังตัวเลข) หรือรู้ว่าเป็นหน่วยย่อยแน่นอน → ใส่ comment `qty-unit-ok` บรรทัดเดียวกัน
// รัน: npm run test:qtyunit (exit 1 = เจอจุดหลุด)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const SRC = join(ROOT, 'src')
const SAFE_WRAP = /\b(unitLabel|qtyWithUnit|packUnitLabel|qtyUnitText|fmtQtyUnit|unitShort|packWord|cartUnitText|entryText)\s*\(/ // 2 ตัวท้าย = helper ใน RequisitionApp ที่ห่อ unitLabel แล้ว
// ชื่อตัวแปร/ฟิลด์ที่เป็น "หน่วย" (unit, drug_unit, baseUnit, mainUnit, ssUnit, countUnit …)
const UNIT_EXPR = /(^|[^\w$])([\w$]+\.)*[\w$]*(unit|Unit)([\w$]*)\b/
// สิ่งที่อยู่ก่อนหน้าแล้วถือว่าเป็น "ตัวเลข"
const NUMERIC_EXPR = /toLocaleString|fmt\w*\(|num\(|Number\(|Math\.|qty|Qty|total|Total|count|Count|base\b|Base\b|packs|remaining|avail|requested|picked|allocated|shortfall|over\w*Base|ssQty|\bss\b|\bv\b|\bval\b|own|amount/

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|mjs)$/.test(n) && !/\.test\.js$/.test(n)) out.push(p)
  }
  return out
}

// หา interpolation ทั้งหมด: JSX {expr} และ template ${expr} (ไม่ซ้อนลึก — พอสำหรับ heuristic)
function interpolations(src) {
  const res = []
  const re = /\$?\{/g
  let m
  while ((m = re.exec(src))) {
    let depth = 1, i = m.index + m[0].length
    while (i < src.length && depth > 0) {
      const c = src[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      i++
    }
    if (depth === 0) res.push({ start: m.index, end: i, expr: src.slice(m.index + m[0].length, i - 1), tpl: m[0] === '${' })
  }
  return res
}

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length

const violations = []
for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  const ints = interpolations(src)
  for (let k = 0; k < ints.length; k++) {
    const it = ints[k]
    const e = it.expr.trim()
    if (!UNIT_EXPR.test(e) || SAFE_WRAP.test(e)) continue
    if (/parseUnitFactor\([^)]*\)\.base\s*$/.test(e) || /^field\(/.test(e)) continue             // หน่วยย่อยที่ถอดเลขแล้ว · ช่องฟอร์ม
    if (/=>|\bfunction\b|\breturn\b|\bconst\b|\blet\b|\bif\s*\(/.test(e)) continue          // block โค้ด ไม่ใช่ค่าที่แสดง
    if (/^\s*[\w$.?]+\s*(===|!==|==|!=|>|<)/.test(e) || /\?\s*['"`<(]/.test(e) && !/\|\|/.test(e) && !/unit\s*$/i.test(e)) continue
    if (/^[\w$.]+\s*:/.test(e) || /^\.\.\./.test(e)) continue                                   // object literal / spread
    if (/<[A-Za-z]|`/.test(e)) continue                                                         // ห่อ JSX/template ข้างใน — ตัวในถูกตรวจแยกอยู่แล้ว
    const ln = lineOf(src, it.start)
    if ((lines[ln - 1] || '').includes('qty-unit-ok')) continue
    // ข้อความระหว่าง interpolation ก่อนหน้ากับตัวนี้ (ตัดแท็ก JSX + ช่องว่าง + {' '})
    const prev = ints.slice(0, k).reverse().find(p => p.end <= it.start && !(p.start < it.start && p.end > it.start))
    if (!prev) continue
    const gap = src.slice(prev.end, it.start)
    const gapClean = gap.replace(/<[^>]*>/g, '').replace(/\{\s*['"]\s*['"]\s*\}/g, '')
      .replace(/\{[^{}`]*\?\s*`/g, '')                                                          // เงื่อนไขครอบ: {r.unit ? ` (${r.unit})` : ''}
      .replace(/[\s ]/g, '')
    if (gap.length > 400) continue
    const pe = prev.expr.trim()
    // รหัสยาเป็นตัวเลข "1000135 · 30เม็ด" อ่านเหมือนจำนวน → นับเป็นจุดหลุดด้วย
    if (gapClean === '·' && /(^|\.)code$/.test(pe)) {
      violations.push(`${relative(ROOT, file).replace(/\\/g, '/')}:${ln}  ${pe.slice(0, 50)}  ·  ${e.slice(0, 50)}`)
      continue
    }
    if (gapClean !== '' && gapClean !== '(') continue                                            // มีข้อความคั่น = ไม่ได้ต่อจากตัวเลข
    if (!NUMERIC_EXPR.test(pe) || UNIT_EXPR.test(pe) && !/toLocaleString|fmt|num\(/.test(pe)) continue
    violations.push(`${relative(ROOT, file).replace(/\\/g, '/')}:${ln}  ${pe.slice(0, 50)}  →  ${e.slice(0, 50)}`)
  }
  // คอลัมน์ตาราง "หน่วย" ข้างคอลัมน์คงเหลือ: cell: r => dash(r.unit) — ไม่มี interpolation ติดตัวเลขให้จับข้างบน
  lines.forEach((line, i) => {
    const m = line.match(/\bcell\s*:\s*\(?\w+\)?\s*=>\s*(.*)/)
    if (!m || line.includes('qty-unit-ok') || SAFE_WRAP.test(m[1])) return
    if (/^[\w$]+\([\w$]+\.[\w$]*(unit|Unit)\)|^[\w$]+\.[\w$]*(unit|Unit)\b\s*(\|\||,|\}|$)/.test(m[1].trim()))
      violations.push(`${relative(ROOT, file).replace(/\\/g, '/')}:${i + 1}  คอลัมน์หน่วย  →  ${m[1].trim().slice(0, 50)}`)
  })
}

if (violations.length) {
  console.log(violations.join('\n'))
  console.log(`\n✗ เจอ ${violations.length} จุดที่จำนวนติดหน่วยโดยไม่ผ่าน unitLabel()/qtyWithUnit() (src/lib/drugProfile.js)`)
  console.log('  แก้: {qty} {unitLabel(unit)} · `${qtyWithUnit(qty, unit)}` · ตั้งใจแสดงหน่วยย่อยแน่นอน = comment qty-unit-ok')
  process.exit(1)
}
console.log('✓ ไม่พบจำนวนติดหน่วยที่ไม่ผ่าน unitLabel()')
