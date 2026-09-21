// ใบรับรองผลการตรวจนับคงคลัง — พิมพ์ "เฉพาะบรรทัดที่นับแล้ว" ของ 1 รอบ พร้อมช่องลงนาม 2 ฝ่าย
//
// ต่างจาก printCountSheet (ใบเดินนับ) ใน StockCountApp.jsx โดยสิ้นเชิง:
//   ใบเดินนับ = กระดาษเปล่าช่องว่าง เอาไปถือเดินนับ (ออกก่อนนับ)
//   ใบนี้      = ผลที่นับได้จริง เอาไว้เซ็นรับรองเก็บแฟ้ม (ออกหลังนับ)
//
// กติกาสำคัญ (ADR-0026):
//   - เข้าใบเฉพาะบรรทัดที่มี counted_qty — บรรทัดที่ระบบ gen รอไว้ไม่ใช่ผลการตรวจ
//   - ใบล็อกที่ "นับแล้ว" เสมอ ไม่ตามตัวกรองบนจอ (ต่างจาก Excel) เพราะรับรองของที่ยังไม่นับไม่ได้
//   - หัวกระดาษต้องบอกสถานะรอบ + สัดส่วนที่นับแล้ว ไม่งั้นคนอ่านเข้าใจว่านับครบทั้งคลัง
//   - คอลัมน์ "มิติที่ตรวจ" (N/4) บอกความจริงรายบรรทัด ห้ามให้ใบอ้างเกินกว่าที่ตรวจจริง
//
// UI helper: build HTML แล้วส่งให้ openPrintView (Blob URL + fallback WebView, Critical Rule #4)
import { openPrintView } from './openPrintView';
import { dimStatus, computeCountMatch, diffLabel, DIM_COUNT } from './countMatch';

const HOSPITAL_NAME = 'โรงพยาบาลประชาธิปัตย์';

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);

const toNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

function thaiDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear() + 543}`;
}

function thaiDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${thaiDate(iso)} ${hh}:${mi} น.`;
}

const isCounted = (i) => i.counted_qty !== null && i.counted_qty !== '' && i.counted_qty !== undefined;

// ขาวดำล้วน (เครื่องพิมพ์คลังไม่มีสี) — ชุดเดียวกับ expiryDispositionForm.js / vendorExchangeCycle.js
const SHARED_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 12px; color: #000; background: #fff; padding: 12px 18px 14px; }
  @page { size: A4 portrait; margin: 10mm; }
  .h-row { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
  h1 { font-size: 17px; font-weight: 700; color: #000; }
  .sub { font-size: 12px; color: #000; font-weight: 700; margin-top: 2px; }
  .legal { font-size: 9.5px; font-weight: 400; margin-top: 2px; }
  .refbox { border: 2px solid #000; padding: 5px 8px; margin-bottom: 7px; display: flex;
    justify-content: space-between; align-items: center; gap: 10px; font-size: 12px; font-weight: 700; }
  .refbox .num { font-size: 14px; letter-spacing: 1px; }
  .meta { display: flex; flex-wrap: wrap; gap: 3px 14px; font-size: 11px; color: #000; margin-bottom: 7px; }
  .status-box { border: 1px solid #000; padding: 5px 8px; margin-bottom: 7px; font-size: 11px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 7px; table-layout: fixed; }
  th { background: #fff; color: #000; font-weight: 700; padding: 3px 2px; text-align: center; border: 1px solid #000;
    word-wrap: break-word; }
  td { padding: 3px 3px; border: 1px solid #000; height: 22px; vertical-align: middle; word-wrap: break-word; }
  td.c { text-align: center; }
  td.note { font-size: 9px; }
  .sum { font-weight: 700; }
  /* ช่องเขียนมือ — ต้อง align bottom + มีความสูง ไม่งั้นเส้นลอยไปกลางบรรทัด (ดูเหมือนขีดฆ่า) */
  .note-line { font-size: 11px; margin: 9px 0 7px; }
  .note-line span { display: inline-block; border-bottom: 1px dotted #000; min-width: 74%; margin-left: 5px;
    height: 14px; vertical-align: bottom; }
  .sig-row { display: grid; gap: 18px; margin-top: 10px; page-break-inside: avoid; }
  .sig-2 { grid-template-columns: 1fr 1fr; }
  .sig-box { padding: 5px 8px; text-align: center; }
  .sig-title { font-size: 10.5px; font-weight: 700; color: #000; margin-bottom: 24px; }
  .sig-line { border-bottom: 1px solid #000; }
  .sig-label { font-size: 9.5px; color: #000; margin-top: 4px; }
  .sig-date { font-size: 9.5px; color: #000; margin-top: 5px; }
  .sig-date span { display: inline-block; border-bottom: 1px dotted #000; min-width: 70px; margin-left: 4px;
    height: 14px; vertical-align: bottom; }
  .foot { font-size: 9px; color: #000; text-align: right; margin-top: 6px; }
  .tbl-wrap { width: 100%; }
  @media print { button { display: none !important; } thead { display: table-header-group; } .tbl-wrap { overflow: visible; } }
  @media screen and (max-width: 768px) {
    body { padding: 12px; }
    .tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    table { min-width: 760px; }
  }
`;

const printBtn = () => `
<button id="btnPrint" type="button" style="position:fixed;top:14px;right:14px;background:#000;color:#fff;border:none;
  padding:8px 18px;border-radius:8px;font-family:Sarabun,sans-serif;font-size:13px;cursor:pointer;font-weight:600;z-index:9999;">
  พิมพ์
</button>`;

const printScript = () => `<script>document.getElementById('btnPrint').addEventListener('click', function(){ window.print(); });</script>`;

/**
 * พิมพ์ใบรับรองผลตรวจนับของ 1 รอบ
 * @param {object} session  แถว stock_count_session (id, counted_at, counter_name, kind, status, note)
 * @param {Array}  allItems บรรทัดทั้งรอบ — ฟังก์ชันกรองเหลือเฉพาะที่นับแล้วเอง (ห้ามกรองมาก่อน
 *                          ไม่งั้นนับ "ยังไม่ได้นับ" บนหัวกระดาษไม่ได้)
 * @param {object} opts     { printedBy }
 */
export function printCountCertificate(session, allItems = [], { printedBy = '' } = {}) {
  const rows = (allItems || []).filter(isCounted);
  const notCounted = (allItems || []).length - rows.length;
  const isOpen = session?.status === 'draft';
  const isAnnual = session?.kind === 'annual';

  // สถานะรอบเปลี่ยนทั้งชื่อใบและคำรับรอง — รอบที่ยังไม่ปิดรับรองได้แค่ "ที่นับไปแล้ว" (ADR-0026)
  const title = isOpen ? 'บันทึกผลการตรวจนับคงคลัง' : 'ใบรับรองผลการตรวจนับคงคลัง';
  const subtitle = isAnnual ? 'รอบตรวจนับประจำปี' : 'รอบสุ่มตรวจนับ (Spot Check)';

  const mismatch = rows.filter((r) => !computeCountMatch(r).match).length;
  const fullDim = rows.filter((r) => dimStatus(r).checked === DIM_COUNT).length;

  const body = rows.map((it, i) => {
    const d = dimStatus(it);
    const m = computeCountMatch(it);
    return `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(it.name)}<br><span style="font-size:8.5px">${esc(it.code || '')}</span></td>
      <td class="c">${esc(it.lot || '-')}</td>
      <td class="c">${esc(it.system_location || '-')}</td>
      <td class="c">${toNum(it.system_qty)}</td>
      <td class="c sum">${toNum(it.counted_qty)}</td>
      <td class="c">${esc(diffLabel(it.system_qty, it.counted_qty))}</td>
      <td class="c">${d.checked}/${DIM_COUNT}</td>
      <td class="c">${m.match ? 'ตรง' : 'ไม่ตรง'}</td>
      <td class="note">${esc(it.item_note || '')}</td>
    </tr>`;
  }).join('');

  const emptyRow = '<tr><td class="c" colspan="10">— ยังไม่มีรายการที่นับแล้วในรอบนี้ —</td></tr>';

  const statusLine = isOpen
    ? `สถานะรอบ: ยังไม่ปิดรอบ — ใบนี้รับรองเฉพาะรายการที่นับไปแล้ว <u>${rows.length}</u> รายการ${notCounted > 0 ? ` (ยังไม่ได้นับอีก ${notCounted} รายการ)` : ''}`
    : `สถานะรอบ: ปิดรอบแล้ว — ตรวจนับรวม <u>${rows.length}</u> รายการ${notCounted > 0 ? ` (ไม่ได้ตรวจ ${notCounted} รายการ)` : ''}`;

  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)} SC-${esc(session?.id)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>${SHARED_CSS}</style>
</head><body>
${printBtn()}

<div class="h-row">
  <h1>${HOSPITAL_NAME}</h1>
  <p class="sub">${esc(title)} — ${esc(subtitle)}</p>
  <p class="legal">เอกสารภายในคลังเวชภัณฑ์ — บันทึกผลการนับจริงเทียบกับยอดคงคลังในระบบ</p>
</div>

<div class="refbox">
  <div>เลขที่ <span class="num">SC-${esc(session?.id)}</span></div>
  <div>วันที่รอบ ${esc(thaiDate(session?.counted_at))}</div>
</div>

<div class="meta">
  <div>ผู้ตรวจนับ: <b>${esc(session?.counter_name || '-')}</b></div>
  <div>หมายเหตุรอบ: ${esc(session?.note || '-')}</div>
</div>

<div class="status-box">
  ${statusLine}
  &nbsp;·&nbsp; ตรงกับระบบ ${rows.length - mismatch} รายการ · ไม่ตรง ${mismatch} รายการ · ตรวจครบ ${DIM_COUNT} มิติ ${fullDim} รายการ
</div>

<div class="tbl-wrap">
<table>
  <colgroup>
    <col style="width:4%"><col style="width:22%"><col style="width:9%"><col style="width:11%">
    <col style="width:8%"><col style="width:8%"><col style="width:9%"><col style="width:7%">
    <col style="width:7%"><col style="width:15%">
  </colgroup>
  <thead><tr>
    <th>#</th><th>รายการยา / รหัส</th><th>Lot</th><th>ที่เก็บ (ระบบ)</th>
    <th>ยอดระบบ</th><th>นับได้จริง</th><th>ส่วนต่าง</th><th>มิติที่ตรวจ</th><th>ผล</th><th>หมายเหตุ</th>
  </tr></thead>
  <tbody>${body || emptyRow}</tbody>
</table>
</div>

<p class="note-line">ข้อสังเกตเพิ่มเติม <span></span></p>

<div class="sig-row sig-2">
  <div class="sig-box">
    <p class="sig-title">ผู้ตรวจนับ (เจ้าหน้าที่คลัง)</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ / ชื่อตัวบรรจง</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
  <div class="sig-box">
    <p class="sig-title">หัวหน้าคลัง / เภสัชกรผู้รับผิดชอบ</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ / ชื่อตัวบรรจง</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
</div>

<p class="foot">ส่วนต่างที่พบต้องไปแก้ที่ต้นทาง (HosXP / ไฟล์ CSV) — ระบบบันทึกผลนับไว้เป็นหลักฐาน ไม่แก้ยอดคงคลังอัตโนมัติ
 · พิมพ์โดย ${esc(printedBy || '-')} เมื่อ ${esc(thaiDateTime(new Date().toISOString()))}</p>
${printScript()}
</body></html>`;

  openPrintView(html);
}
