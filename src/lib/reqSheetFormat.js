// รูปแบบใบเบิกแบบ "ชีทเบิก" — ล้อ PDF ที่คลังทำจาก Excel (scripts/dispense-pdf.ps1) ให้ใบพิมพ์ / PDF แชร์ / Excel ดาวน์โหลด
// ในแอปหน้าตาเดียวกับใบที่คลังพิมพ์ทุกวัน (user สั่ง 13/11/2569) · pure module — golden test: npm run test:reqsheet
//
// คอลัมน์ = ชีท 'เบิก ' B–Q · ความกว้าง = $pdfW ใน dispense-pdf.ps1 · MainLog + ชนิด ซ่อนตอนพิมพ์ (เหมือน PDF)

export const SHEET_COLS = [
  { key: 'date',      header: 'วันที่เบิก',        width: 18.75, align: 'c' },
  { key: 'mainLog',   header: 'MainLog',           width: 18.13, align: 'c', hidden: true },
  { key: 'detailLog', header: 'DetailedLog',       width: 20.5,  align: 'c', big: true },
  { key: 'code',      header: 'รหัส',              width: 13.5,  align: 'c' },
  { key: 'drugType',  header: 'ชนิด',              width: 17,    align: 'c', hidden: true },
  { key: 'name',      header: 'รายการยา',          width: 35,    align: 'l' },
  { key: 'unit',      header: 'หน่วย',             width: 15,    align: 'c' },
  { key: 'price',     header: 'ราคา/หน่วย',        width: 13,    align: 'r', num: '#,##0.00' },
  { key: 'lot',       header: 'Lot Number',        width: 18.5,  align: 'c' },
  { key: 'exp',       header: 'Exp',               width: 19,    align: 'c' },
  { key: 'itemType',  header: 'ชนิดรายการ',        width: 16.5,  align: 'c' },
  { key: 'before',    header: 'คงเหลือก่อนเบิก',   width: 13.5,  align: 'r', num: '#,##0' },
  { key: 'out',       header: 'ปริมาณ (ออก)',      width: 12,    align: 'r', num: '#,##0' },
  { key: 'after',     header: 'คงเหลือหลังจ่าย',   width: 13.5,  align: 'r', num: '#,##0' },
  { key: 'dept',      header: 'หน่วยงานที่เบิก',   width: 15,    align: 'c' },
  { key: 'note',      header: 'หมายเหตุ',          width: 52,    align: 'l', bold: true },
]

export const SORT_BY_LOG = 'log'   // ฉบับคลัง — เดินจัดยาตามชั้น
export const SORT_BY_REQ = 'req'   // ฉบับห้องยา/หน่วยงานเช็ค — ตามลำดับในใบ

// Excel sort ข้อความไม่สนขีด: E-10 < E-11 < E-1-3 · ภาษาไทย (ห้องประชุม/ตู้เย็น) อยู่หลังตัวอังกฤษ · ว่างไปท้าย
// เทียบด้วย code point เหมือนกันทุกเครื่อง (ไม่ใช้ localeCompare ที่ผลต่างตาม locale ของ browser)
export const logSortKey = (v) => {
  const s = String(v ?? '').trim()
  return s ? s.toUpperCase().replace(/[-']/g, '') : '￿'
}
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// เรียงแบบ dispense-pdf.ps1 -SortLog: MainLog แล้ว DetailedLog · ค่าเท่ากันคงลำดับเดิม (stable)
export function sortRowsByLog(rows = []) {
  return rows
    .map((r, i) => ({ r, i, m: logSortKey(r.mainLog), d: logSortKey(r.detailLog) }))
    .sort((a, b) => cmp(a.m, b.m) || cmp(a.d, b.d) || a.i - b.i)
    .map(x => x.r)
}

// หัวกระดาษซ้าย "ห้องยาG ยา" (หน่วยงานตัดช่องว่างแบบชื่อไฟล์ PDF คลัง)
export const sheetTitle = (department, typeLabel) =>
  [String(department || '').replace(/\s+/g, ''), typeLabel || ''].filter(Boolean).join(' ')

// ปริมาณหน่วยย่อย (เม็ด 6,000) → หน่วยซื้อแบบชีทเบิก (1000เม็ด × 6) ให้ตรงกับราคา/หน่วยที่เป็นราคาต่อหน่วยซื้อ
// (user สั่ง 13/11/2569) · หารไม่ลงตัว (98เม็ด) เก็บ 2 ตำแหน่ง
export const toPackQty = (base, packSize) => {
  const b = Number(base) || 0, ps = Number(packSize) || 1
  return ps > 1 ? Math.round(b / ps * 100) / 100 : b
}
export const isFraction = (v) => v != null && v !== '' && !Number.isInteger(Number(v))

// ตัวเลขในหมายเหตุ "เบิก X จ่าย Y" เป็นหน่วยซื้อเหมือนคอลัมน์ปริมาณ (user สั่ง 13/11/2569)
// เต็มแพ็ค → "6" · ไม่เต็มแพ็ค → "2.5 (2,500 เม็ด)" ให้คนจัดยารู้จำนวนจริง · ขวด/vial (packSize ≤ 1) → เลขเดิม
export const fmtPackNote = (base, packSize, baseUnit = '') => {
  const b = Number(base) || 0
  const pack = toPackQty(b, packSize)
  if (!isFraction(pack)) return pack.toLocaleString('en-US')
  const packText = pack.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.?0+$/, '')
  return `${packText} (${b.toLocaleString('en-US')}${baseUnit ? ` ${baseUnit}` : ''})`
}

const pad = (n) => String(n).padStart(2, '0')
export const fmtDateCE = (d) => (d instanceof Date && !isNaN(d)) ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : ''
export const fmtPrintedAt = (d) => `${fmtDateCE(d)} เวลา:${pad(d.getHours())}:${pad(d.getMinutes())}`

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const cellText = (col, v) => {
  if (v == null || v === '') return ''
  if (col.num === '#,##0.00') return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (col.num) return Number(v).toLocaleString('en-US', isFraction(v) ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined)
  return String(v)
}

// rows = [{ date, mainLog, detailLog, code, drugType, name, unit, price, lot, exp, itemType, before, out, after, dept, note, nearExp }]
//   ค่าเป็นข้อความที่ฟอร์แมตแล้ว (วันที่/exp) ยกเว้นตัวเลข · nearExp = ระบายแดงช่อง Exp แบบใบ lot คุม
// opts: { title, centerNo, printedAt (Date), autoPrint, footerNote }
// A4 แนวนอน · หัวตารางซ้ำทุกหน้า · หัวกระดาษ ซ้าย=ชื่อใบ กลาง="เลขที่ …" ขวา=วันเวลาพิมพ์ (เหมือน PageSetup ของ ps1)
export function buildSheetHtml(rows = [], { title = '', centerNo = '', printedAt = new Date(), autoPrint = false, footerNote = '' } = {}) {
  const cols = SHEET_COLS.filter(c => !c.hidden)
  // ColumnWidth ของ Excel = จำนวนตัวอักษร → px จริง = กว้าง×7+5 (ช่องแคบได้สัดส่วนกว้างกว่าแบ่งตรงๆ เท่า PDF คลัง)
  const px = (c) => c.width * 7 + 5
  const total = cols.reduce((s, c) => s + px(c), 0)
  const colgroup = cols.map(c => `<col style="width:${(px(c) / total * 100).toFixed(2)}%">`).join('')
  const head = cols.map(c => `<th class="col">${esc(c.header)}</th>`).join('')
  // หัวกระดาษอยู่ใน thead → ซ้ำทุกหน้าแบบ LeftHeader/CenterHeader/RightHeader ของ Excel
  const pageHead = `<tr><th class="ph" colspan="${cols.length}"><div class="head"><span>${esc(title)}</span><span>${centerNo ? `เลขที่ ${esc(centerNo)}` : ''}</span><span>${esc(fmtPrintedAt(printedAt))}</span></div></th></tr>`
  const body = rows.map(r => `<tr>${cols.map(c => {
    const cls = [c.align, c.big ? 'big' : '', c.bold ? 'b' : '', c.key === 'exp' && r.nearExp ? 'near' : ''].filter(Boolean).join(' ')
    return `<td class="${cls}">${esc(cellText(c, r[c.key]))}</td>`
  }).join('')}</tr>`).join('')
  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<title>${esc(title)}${centerNo ? ` ${esc(centerNo)}` : ''}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
  /* ขนาดเป็น pt ตาม PDF คลังจริง (dispense-pdf.ps1 ย่อชีท ~49%): ตาราง 10 · หัวตาราง 9.5 · DetailedLog 14 · หัวกระดาษ 18
     แถวสูงอย่างน้อย 28 · หัวตาราง 40 · ตารางกว้าง 285 มม. (ขอบซ้าย-ขวา 6 มม.) — วัดจาก PDF ห้องยาG 11.11.69 (13/11/2569) */
  @page { size: A4 landscape; margin: 10mm 6mm 10mm 6mm; @bottom-center { content: counter(page); font: 10pt Calibri, Tahoma, 'Sarabun', sans-serif; } }
  body { font-family: Calibri, Tahoma, 'Sarabun', sans-serif; margin: 0; padding: 8px; color: #000; background: #fff;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .head { display: flex; justify-content: space-between; align-items: baseline; font-weight: 700; font-size: 18pt; gap: 12px; text-align: left; }
  .head span:nth-child(2) { text-align: center; flex: 1; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th, td { border: 1px solid #000; padding: 1pt 1.5pt; font-size: 10pt; vertical-align: middle; word-break: break-word; }
  th.col { font-weight: 700; font-size: 9.5pt; text-align: center; height: 40pt; padding: 1pt 0; word-break: normal; overflow-wrap: normal; }
  th.ph { border: 0; padding: 0 0 6pt; font-weight: 700; }
  td { height: 28pt; }
  td.c { text-align: center; } td.r { text-align: right; } td.l { text-align: left; }
  td.big { font-size: 14pt; }
  td.b { font-weight: 700; }
  td.near { background: #fecaca; font-weight: 700; }
  .foot { margin-top: 8px; font-size: 11px; color: #475569; }
  .noprint { margin: 0 0 8px; padding: 6px 10px; border: 1px solid #fcd34d; background: #fffbeb; color: #92400e; font-size: 12px; border-radius: 6px; }
  @media print { .noprint { display: none; } body { padding: 0; } }
</style></head><body>
${footerNote ? `<div class="noprint">${esc(footerNote)}</div>` : ''}
<table><colgroup>${colgroup}</colgroup><thead>${pageHead}<tr>${head}</tr></thead><tbody>${body}</tbody></table>
${autoPrint ? '<script>window.onload=()=>{window.print();}</script>' : ''}
</body></html>`
}
