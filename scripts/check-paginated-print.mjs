// ตรวจใบพิมพ์แบ่งหน้า (buildPaginatedHtml — ใบเบิกเวชภัณฑ์ยา) ก่อนสรุปว่าแก้เสร็จ ทุกครั้งที่แตะ
// src/lib/paginatedPrint.js · css/ส่วนท้ายของ buildCoverHtml (RequisitionApp.jsx) · pagesToPdfBlob (reqSheetExport.js)
//
//   node scripts/check-paginated-print.mjs                 → ตารางผลทุกขนาดใบ × 2 โหมด (exit 1 = มี ✗)
//   node scripts/check-paginated-print.mjs --pdf 55,6 --out <โฟลเดอร์>
//        → ทำ PDF จริงผ่าน pagesToPdfBlob (html2canvas+jsPDF แบบที่ผู้ใช้กด "ส่งเป็น PDF") + ใบพิมพ์ Chromium
//          + PNG ทุกหน้า (ต้องมี python + pymupdf) ไว้ Read ดูด้วยตา
//
// โหมด print = ฟอนต์ Sarabun (ปุ่ม "พิมพ์") · pdf = ตัด @import ฟอนต์ (pagesToPdfBlob วาดด้วยฟอนต์ระบบ แถวสูงกว่า)
// ข้อมูล = scripts/fixtures/cover-req-0098.json (หัว/แถว/ส่วนท้าย ณ 25/11/2569) · css อ่านสดจาก buildCoverHtml
//
// เกิดจาก (user 25/11/2569 "ทำไมยังเจอจุดผิดอยู่"): แก้ใบพิมพ์ 5 รอบใน 3 วัน แต่ละรอบตรวจแค่ใบเดียวที่ user แจ้ง
//   23/11 แถวท้ายครึ่งตัว · 23/11 iOS ล้นหน้าว่าง · 24/11 ใบ 6 รายการลายเซ็นตกหน้า 2 · 25/11 PDF หน้า 2–3 ว่าง
//   25/11 ขยายฟอนต์แล้ว: เส้นปิดหน้า 2 หาย + หน้า 3 ว่าง + ใบ 6 รายการกลับเป็น 2 หน้า (ไม่มีใครตรวจใบสั้น)
//
// เกณฑ์
//   ✗ แถวหาย/ซ้ำ/สลับ · ✗ ล้น .pbody หรือชิดขอบล่าง < 3px (เส้นปิดตารางโดนตัด) · ✗ ใบ ≤ 6 รายการเกิน 1 หน้า
//   ⚠ หน้าที่ไม่ใช่หน้าสุดท้ายว่างเกินครึ่ง (ลายเซ็นยกไปหน้าใหม่) — บางขนาดเลี่ยงไม่ได้ ดูว่าขนาดไหน แล้วตัดสินกับ user
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const SIZES = (opt('--sizes') || '1,6,7,12,20,25,30,40,46,50,55').split(',').map(Number)
const pdfSizes = opt('--pdf') ? opt('--pdf').split(',').map(Number) : []
const OUT = opt('--out') || fs.mkdtempSync(path.join(os.tmpdir(), 'pagchk-'))
fs.mkdirSync(OUT, { recursive: true })

const { buildPaginatedHtml } = await import(pathToFileURL(path.join(REPO, 'src/lib/paginatedPrint.js')).href)
const { chromium } = await import(pathToFileURL(path.join(REPO, 'node_modules/playwright/index.mjs')).href)

const fixture = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/cover-req-0098.json'), 'utf8'))
const app = fs.readFileSync(path.join(REPO, 'src/RequisitionApp.jsx'), 'utf8')
const fn = app.slice(app.indexOf('async function buildCoverHtml'))
const cssStart = fn.indexOf('const css = `') + 'const css = `'.length
const css = fn.slice(cssStart, fn.indexOf('`;', cssStart))
if (cssStart < 20 || css.includes('${')) throw new Error('หา css ของ buildCoverHtml ไม่เจอ หรือมี ${} — แก้ตัวอ่านในสคริปต์นี้')

const FONT_IMPORT_RE = /@import url\(['"]?https:\/\/fonts\.googleapis\.com[^)]*\);?/
const htmlFor = (n, mode) => {
  const h = buildPaginatedHtml({ ...fixture, css, rows: fixture.rows.slice(0, n), autoPrint: false })
  return mode === 'pdf' ? h.replace(FONT_IMPORT_RE, '') : h
}

const browser = await chromium.launch()
let fails = 0
const measure = async (n, mode) => {
  const page = await browser.newPage({ viewport: { width: 820, height: 1200 } })
  const file = path.join(OUT, `chk_${mode}_${n}.html`)
  fs.writeFileSync(file, htmlFor(n, mode))
  await page.goto(pathToFileURL(file).href)
  await page.waitForFunction(() => [...document.querySelectorAll('.pno')].some(e => /หน้า \d+\/\d+/.test(e.textContent)), null, { timeout: 15000 })
  const pages = await page.evaluate(() => [...document.querySelectorAll('.page')].map(p => {
    const b = p.querySelector('.pbody'); const br = b.getBoundingClientRect()
    const t = p.querySelector('table.grid').getBoundingClientRect(); const tl = p.querySelector('.ptail')
    const bottom = Math.max(t.bottom, tl.innerHTML ? tl.getBoundingClientRect().bottom : 0)
    return {
      nums: [...p.querySelectorAll('tbody tr:not(.blank)')].map(r => r.children[0].textContent.trim()),
      slack: br.bottom - bottom, fill: (bottom - br.top) / br.height,
      overflow: b.scrollHeight - b.clientHeight, tight: p.classList.contains('tight'), tail: !!tl.innerHTML,
    }
  }))
  await page.close()
  const probs = []; const warns = []
  const seq = pages.flatMap(p => p.nums)
  if (seq.join(',') !== Array.from({ length: n }, (_, i) => String(i + 1)).join(',')) probs.push(`ลำดับแถวไม่ครบ/ซ้ำ: ${seq.join(',')}`)
  pages.forEach((p, i) => {
    if (p.overflow > 0) probs.push(`หน้า ${i + 1} ล้น ${p.overflow}px`)
    if (p.slack < 3) probs.push(`หน้า ${i + 1} ชิดขอบล่าง ${p.slack.toFixed(1)}px (เส้นปิดโดนตัด)`)
    if (i < pages.length - 1 && p.fill < 0.5) warns.push(`หน้า ${i + 1} ใช้ ${Math.round(p.fill * 100)}%`)
  })
  if (!pages[pages.length - 1].tail) probs.push('หน้าสุดท้ายไม่มีส่วนลายเซ็น')
  if (n <= 6 && pages.length > 1) probs.push(`ใบ ${n} รายการได้ ${pages.length} หน้า`)
  if (probs.length) fails++
  const split = pages.map(p => p.nums.length + (p.tight ? 't' : '')).join('/')
  console.log(`${probs.length ? '✗' : warns.length ? '⚠' : '✓'} ${String(n).padStart(2)} รายการ ${mode.padEnd(5)} ${pages.length} หน้า [${split}] ${[...probs, ...warns].join(' · ')}`)
}

console.log('แถวต่อหน้า [n/n/n] · t = หน้าสุดท้ายใช้ระยะลายเซ็นแบบแน่น (.tight)')
for (const n of SIZES.filter(n => n <= fixture.rows.length)) for (const mode of ['print', 'pdf']) await measure(n, mode)

if (pdfSizes.length) {
  const bundle = path.join(OUT, 'rse.js')
  execFileSync(process.execPath, [path.join(REPO, 'node_modules/esbuild/bin/esbuild'), path.join(REPO, 'src/lib/reqSheetExport.js'),
    '--bundle', '--format=iife', '--global-name=RSE', `--outfile=${bundle}`, '--log-level=error'])
  for (const n of pdfSizes) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.setContent('<html><body></body></html>')
    await page.addScriptTag({ path: bundle })
    const b64 = await page.evaluate(async (h) => {
      const buf = new Uint8Array(await (await window.RSE.pagesToPdfBlob(h)).arrayBuffer()); let s = ''
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000))
      return btoa(s)
    }, htmlFor(n, 'print')) // pagesToPdfBlob ตัด @import เอง — ส่ง html เดียวกับที่แอปส่ง
    fs.writeFileSync(path.join(OUT, `app_${n}.pdf`), Buffer.from(b64, 'base64'))
    await page.goto(pathToFileURL(path.join(OUT, `chk_print_${n}.html`)).href)
    await page.waitForFunction(() => [...document.querySelectorAll('.pno')].some(e => /หน้า \d+\/\d+/.test(e.textContent)))
    await page.pdf({ path: path.join(OUT, `print_${n}.pdf`), preferCSSPageSize: true, printBackground: true })
    await page.close()
  }
  try {
    execFileSync('python', ['-c', `import pymupdf,glob,os
for f in sorted(glob.glob(os.path.join(r"${OUT}","*_*.pdf"))):
    d=pymupdf.open(f)
    for i,p in enumerate(d): p.get_pixmap(dpi=70).save(f[:-4]+f"_p{i+1}.png")
    print(os.path.basename(f), d.page_count, "หน้า")`], { stdio: 'inherit' })
  } catch { console.log('(ไม่มี python/pymupdf — เปิด PDF ดูเอง)') }
}
await browser.close()
console.log(`ไฟล์: ${OUT}`)
process.exit(fails ? 1 : 0)
