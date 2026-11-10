// loan-slip.mjs — ใบยืมยา / ใบคืนยา ระหว่างหน่วยงาน แบบกรอกข้อมูลให้ล่วงหน้า (พร้อมเซ็น)
//   node scripts/loan-slip.mjs --next-ln                 ← เลขที่ใบยืมถัดไป (ทะเบียน รพ.ยืมยา "เลขที่ใบยืม" + เลขที่แอปออกใน drug_loan_slip)
//   node scripts/loan-slip.mjs <job.json> --preview      ← PDF ใน temp อย่างเดียว
//   node scripts/loan-slip.mjs <job.json>                ← PDF ลง รวมเบิกยา\PDF\ยืม-คืนยา\ + _สถานะพิมพ์.csv + print-queue
//   node scripts/loan-slip.mjs <job.json> --replace      ← ทับไฟล์เดิม (แก้ก่อนพิมพ์)
//
// หน้าตาฟอร์ม + ตัวกรอก = src/lib/loanSlipFill.js ตัวเดียวกับแอป (ใบแจ้งยืม/ใบแจ้งรับคืน) — ไม่มีฟอร์มชุดที่สอง
// เลข LN ต้องเขียนลงทะเบียน รพ.ยืมยา เอง (COM บนสำเนา) — เลขถัดไปนับจากทะเบียน + ใบที่แอปออก (CONTEXT.md §การยืมยา)
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
import { fillLoanSlip, money } from '../src/lib/loanSlipFill.js'
import { nextLoanNumber } from '../src/lib/loanSlip.js'
import { loadEnv } from './_shared.mjs'

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

// เลขถัดไป = นับทั้งทะเบียน Excel + ใบที่แอปออก (drug_loan_slip รวมใบยกเลิก) — ใบแอปที่ยังไม่ลง Excel
// ไม่อยู่ในทะเบียน ถ้านับแค่ Excel จะออกเลขซ้ำ (พบตอนทดลอง LN-70/004 10/11/2569) · ต่อ DB ไม่ได้ = หยุด ไม่เดา
async function nextLn() {
  const wb = XLSX.readFile(RECV, { sheets: ['รพ.ยืมยา'] })
  const grid = XLSX.utils.sheet_to_json(wb.Sheets['รพ.ยืมยา'], { header: 1, defval: '' })
  const col = grid[0].indexOf('เลขที่ใบยืม')
  if (col < 0) die('ไม่พบคอลัมน์ เลขที่ใบยืม')
  loadEnv()
  const { supabase } = await import('../src/lib/supabase.js')
  if (!supabase) die('ไม่พบค่า Supabase ใน .env.local — ต้องเห็นเลขที่แอปออกด้วย')
  const { data, error } = await supabase.from('drug_loan_slip').select('ln').not('ln', 'is', null)
  if (error) die('อ่าน drug_loan_slip ไม่ได้: ' + error.message)
  return nextLoanNumber([...grid.slice(1).map(r => r[col]), ...data.map(r => r.ln)])
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

function makeSlip() {
  const jobPath = args.find(a => !a.startsWith('--'))
  if (!jobPath) die('ระบุไฟล์ job.json')
  const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'))
  if (!['out', 'return'].includes(job.kind)) die('kind ต้องเป็น out หรือ return')
  if (!job.title || !/^\d{1,2}\.\d{1,2}\.\d{2}$/.test(job.fileDate || '')) die('ต้องมี title และ fileDate รูปแบบ ว.ด.ปป เช่น 8.10.69')
  if (job.ln && !/^LN-\d{2}\/\d{3}$/.test(job.ln)) die('ln ต้องเป็นรูปแบบ LN-70/001')

  let filled
  try { filled = fillLoanSlip(job) } catch (e) { die(e.message) }
  const { html, total } = filled
  const name = `${job.kind === 'out' ? 'ใบยืมยา' : 'ใบคืนยา'} ${job.title}_${job.fileDate}.pdf`
  const preview = path.join(os.tmpdir(), 'loan_slip_preview.pdf')
  toPdf(html, preview)
  console.log(`${name} · ${job.ln || '(ไม่มี LN)'} · ${job.items.length} รายการ · รวม ${money(total)} บาท`)
  console.log('preview:', preview)
  if (args.includes('--preview')) return

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
}

// --next-ln ห้าม process.exit — ปิดขณะ fetch ของ supabase ยังค้าง Node บน Windows ล่ม (libuv assertion · exit 127)
if (args.includes('--next-ln')) console.log(await nextLn())
else makeSlip()
