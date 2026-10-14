// loan-slip.mjs — ใบยืมยา / ใบคืนยา ระหว่างหน่วยงาน แบบกรอกข้อมูลให้ล่วงหน้า (พร้อมเซ็น)
//   node scripts/loan-slip.mjs --next-ln                 ← เลขที่ใบยืมถัดไป (อ่านคอลัมน์ "เลขที่ใบยืม" ทะเบียน รพ.ยืมยา)
//   node scripts/loan-slip.mjs <job.json> --preview      ← PDF ใน temp อย่างเดียว
//   node scripts/loan-slip.mjs <job.json>                ← PDF ลง รวมเบิกยา\PDF\ยืม-คืนยา\ + _สถานะพิมพ์.csv + print-queue
//   node scripts/loan-slip.mjs <job.json> --replace      ← ทับไฟล์เดิม (แก้ก่อนพิมพ์)
//
// หน้าตาฟอร์ม = ของแอปตัวเดียวกัน (src/lib/drugLoanForm.js) — สคริปต์นี้แค่ติ๊ก/กรอกลงไป ไม่มีฟอร์มชุดที่สอง
// เลข LN ต้องเขียนลงทะเบียน รพ.ยืมยา เอง (COM บนสำเนา) — ทะเบียนคือแหล่งเดียวของเลขถัดไป (CONTEXT.md §การยืมยา)
//
// job.json (ช่องที่ไม่ใส่ = เว้นให้เขียนมือ):
// { "kind": "out" | "return", "ln": "LN-70/001", "fileDate": "8.10.69", "title": "อภ Losartan50",
//   "slipDate": "", "direction": "lend" | "borrow", "counterparty": "...", "coordinator": "", "phone": "",
//   "partyType": "โรงพยาบาล" | "บริษัทยา" | "อื่นๆ", "partyOther": "",
//   "courier": ""   ← ผู้นำส่ง (คนกลาง) เช่น "ผู้แทน บ.ดีทแฮล์ม" — ว่าง = เว้นให้เขียนมือ (ทั้ง 2 ใบ)
//   out:    "reason": { "pick": "shortage"|"urgent"|"help"|"other", "text": "" },
//           "returnTerm": { "pick": "po"|"date"|"other", "po": "", "eta": "", "date": "", "text": "" },
//           "responsible": { "pick": "store"|"handover", "who": "", "date": "" },
//   return: "loanDate": "06/10/2569", "result": ["full"|"partial"|"otherLot"|"compensate"], "partialLeft": "", "compensate": "",
//           "returner": { "pick": "store"|"caretaker", "who": "", "when": "" }, "note": "",
//   "items": [{ "name": "", "code": "", "lot": "", "lotReturned": "", "exp": "18/06/2572", "qty": 3,
//               "unit": "กล่อง (300 เม็ด)", "price": 214, "note": "" }] }
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import XLSX from 'xlsx'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RECV = 'C:/Users/PRH0000484/OneDrive/รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm'
const PDF_DIR = 'C:/Users/PRH0000484/Desktop/รวมเบิกยา/PDF'
const SUB = 'ยืม-คืนยา'
const LOG = path.join(PDF_DIR, '_สถานะพิมพ์.csv')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const args = process.argv.slice(2)
const die = (m) => { console.error('STOP: ' + m); process.exit(1) }

function fiscal2(d = new Date()) {
  return (d.getFullYear() + 543 + (d.getMonth() >= 9 ? 1 : 0)) % 100
}

function nextLn() {
  const wb = XLSX.readFile(RECV, { sheets: ['รพ.ยืมยา'] })
  const grid = XLSX.utils.sheet_to_json(wb.Sheets['รพ.ยืมยา'], { header: 1, defval: '' })
  const col = grid[0].indexOf('เลขที่ใบยืม')
  if (col < 0) die('ไม่พบคอลัมน์ เลขที่ใบยืม')
  const fy = fiscal2()
  const re = new RegExp(`^LN-${fy}/(\\d{3})$`)
  const used = grid.slice(1).map(r => String(r[col]).trim().match(re)).filter(Boolean).map(m => +m[1])
  return `LN-${fy}/${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`
}

// ── บาทเป็นตัวอักษร (ชุดเดียวกับ bill_handover.py) ──
const DIG = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const POS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']
function readNum(n) {
  if (n >= 1e6) return readNum(Math.floor(n / 1e6)) + 'ล้าน' + readNum(n % 1e6)
  const s = String(n); let out = ''
  ;[...s].reverse().forEach((ch, i) => {
    const d = +ch
    if (!d) return
    out = (i === 1 && d === 1 ? 'สิบ' : i === 1 && d === 2 ? 'ยี่สิบ' : i === 0 && d === 1 && s.length > 1 ? 'เอ็ด' : DIG[d] + POS[i]) + out
  })
  return out
}
function bahtText(x) {
  const st = Math.round(x * 100), b = Math.floor(st / 100), s = st % 100
  return (readNum(b) || 'ศูนย์') + 'บาท' + (s ? readNum(s) + 'สตางค์' : 'ถ้วน')
}
const money = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function loadForm() {
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/drugLoanForm.js'), 'utf8')
    .replace(/^import \{ openPrintView \}.*$/m, 'const openPrintView = (h) => { globalThis.__loanHtml = h; };')
  const tmp = path.join(os.tmpdir(), `_drugLoanForm_${process.pid}.mjs`)
  fs.writeFileSync(tmp, src)
  try { return await import(pathToFileURL(tmp).href) } finally { fs.unlinkSync(tmp) }
}

function build(job, form) {
  const out = job.kind === 'out'
  ;(out ? form.printLoanOutForm : form.printLoanReturnForm)()
  let h = globalThis.__loanHtml
  const rep = (from, to) => { if (!h.includes(from)) die('ฟอร์มในแอปเปลี่ยน หาไม่เจอ: ' + from.slice(0, 70)); h = h.replace(from, to) }
  const TICK = '<span class="bx" style="text-align:center;font-size:11px;line-height:10px;font-weight:700;">&#10003;</span>'
  const BX = '<li><span class="bx"></span> '
  const tick = (after) => rep(BX + after, `<li>${TICK} ${after}`)
  const W = (t, w = 120) => `<span style="display:inline-block;border-bottom:1px solid #000;min-width:${w}px;font-weight:700;padding:0 4px;">${esc(t)}</span>`

  // หัวใบ
  if (job.ln) rep('<span class="num">LN -</span><span class="fill"></span>', `<span class="num">${esc(job.ln)}</span>`)
  if (job.slipDate) rep(`<div>${out ? 'วันที่ยืม' : 'วันที่คืน'} <span class="fill"></span></div>`, `<div>${out ? 'วันที่ยืม' : 'วันที่คืน'} ${W(job.slipDate, 92)}</div>`)
  // ทิศทาง — ใบคืน: เราให้ยืม (lend) = เขาคืนให้เรา
  const dir = out ? { lend: '<b>เราให้เขายืม</b>', borrow: '<b>เรายืมจากเขา</b>' } : { lend: '<b>เขาคืนให้เรา</b>', borrow: '<b>เราคืนให้เขา</b>' }
  if (!dir[job.direction]) die('direction ต้องเป็น lend หรือ borrow')
  tick(dir[job.direction])
  // คู่สัญญา
  const meta = (label, w, t) => { if (t) rep(`<div>${label} <span style="min-width:${w}px;"></span></div>`, `<div>${label} <span style="min-width:${w}px;font-weight:700;">${esc(t)}</span></div>`) }
  meta('ชื่อหน่วยงานคู่สัญญา', 230, job.counterparty)
  meta('ผู้ประสานงาน', 130, job.coordinator)
  if (out) meta('เบอร์ติดต่อ', 100, job.phone)
  else meta('วันที่ยืมเดิม', 100, job.loanDate)
  if (job.partyType === 'อื่นๆ') rep(BX + 'อื่นๆ (ระบุ)<span class="fl fl-l"></span>', `<li>${TICK} อื่นๆ (ระบุ)${W(job.partyOther || '', 135)}`)
  else if (job.partyType) tick(job.partyType)

  if (out) {
    const OTHER = 'อื่นๆ <span class="fl fl-xl"></span></li>'   // ตัวแรก = เหตุผล · ตัวที่สอง = กำหนดคืน
    const r = job.reason || {}
    const REASON = { shortage: 'ยาขาดคลัง', urgent: 'ยาใช้เร่งด่วน', help: 'ช่วยเหลือหน่วยงานอื่น' }
    if (r.pick === 'other') rep(BX + OTHER, `<li>${TICK} อื่นๆ ${W(r.text, 360)}</li>`)
    else if (REASON[r.pick]) tick(REASON[r.pick])
    const t = job.returnTerm || {}
    if (t.pick === 'po') {
      tick('<b>คืนเมื่อของที่สั่งซื้อมาถึง</b>')
      if (t.po) rep('เลขที่ PO / ใบสั่งซื้อ <span class="fl fl-l"></span>', 'เลขที่ PO / ใบสั่งซื้อ ' + W(t.po, 135))
      if (t.eta) rep('คาดว่าของถึงประมาณ <span class="fl fl-m"></span>', 'คาดว่าของถึงประมาณ ' + W(t.eta, 88))
    } else if (t.pick === 'date') {
      rep(BX + 'คืนภายในวันที่ <span class="fl fl-m"></span>', `<li>${TICK} คืนภายในวันที่ ${W(t.date, 88)}`)
    } else if (t.pick === 'other') {
      if (r.pick !== 'other') rep(BX + OTHER, BX + 'อื่นๆ <span class="fl fl-xl" data-skip></span></li>')   // ข้ามตัวเหตุผล
      rep(BX + OTHER, `<li>${TICK} อื่นๆ ${W(t.text, 330)}</li>`)
      h = h.replace(' data-skip', '')
    }
    const p = job.responsible || {}
    if (p.pick === 'store') tick('<b>ของอยู่ที่คลัง — คลังคืนเอง</b>')
    if (p.pick === 'handover') {
      tick('<b>ส่งต่อให้ผู้ดูแลรับผิดชอบ</b>')
      if (p.who) rep('ชื่อผู้ดูแล / หน่วยงาน <span class="fl fl-l"></span>', 'ชื่อผู้ดูแล / หน่วยงาน ' + W(p.who, 135))
      if (p.date) rep('วันที่ส่งต่อ <span class="fl fl-m"></span>', 'วันที่ส่งต่อ ' + W(p.date, 88))
    }
  } else {
    const res = new Set(job.result || [])
    if (res.has('full')) tick('<b>คืนครบตามใบยืม — ปิดรายการ</b>')
    if (res.has('partial')) rep(BX + 'คืนบางส่วน — ยังค้างอีก <span class="fl fl-s"></span>', `<li>${TICK} คืนบางส่วน — ยังค้างอีก ${W(job.partialLeft, 46)}`)
    if (res.has('otherLot')) tick('คืนด้วย <b>lot อื่น</b>')
    if (res.has('compensate')) rep(BX + 'ตกลงไม่คืนเป็นของ — ชดเชยเป็น <span class="fl fl-l"></span>', `<li>${TICK} ตกลงไม่คืนเป็นของ — ชดเชยเป็น ${W(job.compensate, 135)}`)
    const q = job.returner || {}
    if (q.pick === 'store') tick('<b>คลังคืนเอง</b>')
    if (q.pick === 'caretaker') {
      tick('<b>ผู้ดูแลคืนเอง ไม่ผ่านคลัง</b>')
      if (q.who) rep('ชื่อผู้ดูแล <span class="fl fl-l"></span>', 'ชื่อผู้ดูแล ' + W(q.who, 135))
      if (q.when) rep('แจ้งคลังเมื่อ <span class="fl fl-m"></span>', 'แจ้งคลังเมื่อ ' + W(q.when, 88))
    }
    if (job.note) rep('<p class="note-line">หมายเหตุเพิ่มเติม <span></span></p>', `<p class="note-line">หมายเหตุเพิ่มเติม <span style="font-weight:700;">${esc(job.note)}</span></p>`)
  }

  // กล่องลงนาม — ติ๊กฝ่ายของผู้ส่ง/ผู้รับตามทิศทาง: ใบยืม lend / ใบคืน borrow = เราเป็นผู้ส่ง
  const weSend = out ? job.direction === 'lend' : job.direction === 'borrow'
  rep(`<span class="bx" data-p="s-${weSend ? 'us' : 'them'}"></span>`, TICK)
  rep(`<span class="bx" data-p="r-${weSend ? 'them' : 'us'}"></span>`, TICK)
  if (job.courier) rep('<span class="fl fl-m" data-courier></span>', W(job.courier, 88))

  // ตาราง — สร้าง tbody ใหม่ทั้งก้อน (ขั้นต่ำ 6 แถวเหมือนฟอร์มเปล่า)
  const items = job.items || []
  if (!items.length) die('items ว่าง')
  let total = 0
  const rows = []
  for (let i = 0; i < Math.max(6, items.length); i++) {
    const it = items[i]
    if (!it) { rows.push(`<tr><td class="c">${i + 1}</td>${'<td></td>'.repeat(8)}</tr>`); continue }
    const value = Math.round(it.qty * it.price * 100) / 100
    total += value
    const name = `<b>${esc(it.name)}</b>${it.code ? ` (รหัส ${esc(it.code)})` : ''}`
    const exp = `<td class="c" style="white-space:nowrap;font-size:9.5px;">${esc(it.exp)}</td>`
    const note = `<td style="font-size:9.5px;">${esc(it.note)}</td>`
    const unit = esc(it.unit).replace(' (', '<br/>(')
    rows.push(out
      ? `<tr><td class="c">${i + 1}</td><td>${name}</td><td class="c">${esc(it.lot)}</td>${exp}<td class="c">${it.qty}</td><td class="c">${unit}</td><td class="c">${money(it.price)}</td><td class="c">${money(value)}</td>${note}</tr>`
      : `<tr><td class="c">${i + 1}</td><td>${name}</td><td class="c">${esc(it.lot)}</td><td class="c">${esc(it.lotReturned || it.lot)}</td>${exp}<td class="c">${it.qty}</td><td class="c">${unit}</td><td class="c">${money(value)}</td>${note}</tr>`)
  }
  const tb = h.indexOf('<tbody>'), te = h.indexOf('</tbody>')
  h = h.slice(0, tb) + '<tbody>' + rows.join('') + h.slice(te)
  const label = out ? 'รวมมูลค่าที่ยืม (บาท)' : 'รวมมูลค่าที่คืน (บาท)'
  rep(`<td colspan="7" style="text-align:right;font-weight:700;">${label}</td>\n      <td class="c"></td>`,
    `<td colspan="7" style="text-align:right;font-weight:700;">${label} — ${bahtText(total)}</td>\n      <td class="c" style="font-weight:700;">${money(total)}</td>`)
  return { html: h, total }
}

function toPdf(html, pdfPath) {
  const htmlPath = pdfPath.replace(/\.pdf$/, '.html')
  fs.writeFileSync(htmlPath, html)
  if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath)
  execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=15000',
    `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href], { stdio: 'ignore', timeout: 120000 })
  // Edge ที่เปิดค้างอยู่รับงานต่อแล้วคืนทันที — PDF มาตามหลัง 1–4 วิ (09/10/2569)
  for (let i = 0; i < 60 && !(fs.existsSync(pdfPath) && fs.statSync(pdfPath).size >= 5000); i++) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
  }
  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size < 5000) die('สร้าง PDF ไม่ได้')
}

if (args.includes('--next-ln')) {
  console.log(nextLn())
  process.exit(0)
}
const jobPath = args.find(a => !a.startsWith('--'))
if (!jobPath) die('ระบุไฟล์ job.json')
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'))
if (!['out', 'return'].includes(job.kind)) die('kind ต้องเป็น out หรือ return')
if (!job.title || !/^\d{1,2}\.\d{1,2}\.\d{2}$/.test(job.fileDate || '')) die('ต้องมี title และ fileDate รูปแบบ ว.ด.ปป เช่น 8.10.69')
if (job.ln && !/^LN-\d{2}\/\d{3}$/.test(job.ln)) die('ln ต้องเป็นรูปแบบ LN-70/001')

const { html, total } = build(job, await loadForm())
const name = `${job.kind === 'out' ? 'ใบยืมยา' : 'ใบคืนยา'} ${job.title}_${job.fileDate}.pdf`
const preview = path.join(os.tmpdir(), 'loan_slip_preview.pdf')
toPdf(html, preview)
console.log(`${name} · ${job.ln || '(ไม่มี LN)'} · ${job.items.length} รายการ · รวม ${money(total)} บาท`)
console.log('preview:', preview)
if (args.includes('--preview')) process.exit(0)

const rel = `${SUB}\\${name}`
const dest = path.join(PDF_DIR, SUB, name)
if (fs.existsSync(dest) && !args.includes('--replace')) die(`มีไฟล์อยู่แล้ว ${dest} (ใส่ --replace ถ้าจะทับก่อนพิมพ์)`)
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.copyFileSync(preview, dest)
const log = fs.readFileSync(LOG, 'utf8')
if (!log.split(/\r?\n/).some(l => l.split(',')[1] === rel)) {
  const d = new Date(), p2 = (n) => String(n).padStart(2, '0')
  const stamp = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear() + 543} ${p2(d.getHours())}:${p2(d.getMinutes())}`
  fs.appendFileSync(LOG, (log.endsWith('\n') ? '' : '\r\n') + `${stamp},${rel},,\r\n`, 'utf8')
}
console.log('บันทึก:', dest)
execFileSync('python', [path.join(ROOT, 'scripts/print-queue.py')], { stdio: 'inherit' })
