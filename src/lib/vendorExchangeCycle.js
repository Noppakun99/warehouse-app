// แบบฟอร์มรอบเปลี่ยน/คืนบริษัท (คู่ ส่งออก ↔ รับกลับ) — พิมพ์ให้กรอกมือ ไม่ดึงข้อมูลจากระบบ
//   printExchangeOutForm()  = ใบส่งคืนบริษัท (ขาออก) — คลังออก "เลขที่รอบ" เอง
//   printExchangeInForm()   = ใบรับยาเปลี่ยนกลับ (ขาเข้า) — อ้างเลขที่รอบเดิม
//
// ที่มา: บริษัทไม่ออกเอกสารให้เซ็นตอนมารับของ (ผู้แทนเดินมาเก็บที่คลัง) คลังจึงต้องออกเอกสารเอง
// เอกสารคู่นี้เป็น "หลักฐานชิ้นเดียว" ที่ยืนยันว่าของออกจากคลังไปเมื่อไหร่ และกลับมาครบหรือไม่
//
// **เลขที่รอบ** = key ที่ผูก 2 ขาเข้าด้วยกัน (ADR-0024) — เขียนลงช่องเลขที่บิลตอนบันทึกเข้าระบบ
// ทำให้ vendorExchange.js เลิกเดาคู่ด้วย รหัส+บริษัท+เวลา
//
// UI helper: build HTML แล้วส่งให้ openPrintView (Blob URL + fallback WebView) — ไม่ใช่ pure module
import { openPrintView } from './openPrintView';

const HOSPITAL_NAME = 'โรงพยาบาลประชาธิปัตย์';

function todayThaiDate() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear() + 543}`;
}

// เหตุผลที่เปลี่ยน/คืน — มาจาก note จริงในไฟล์เบิก ไม่ได้คิดเอง
// แยก "ใครเริ่ม": คลังเริ่ม (ใกล้ exp/หมดอายุ) vs บริษัทเริ่ม (เรียกเก็บ) — ต่างกันเรื่องความรับผิดชอบ
const REASONS = [
  'ใกล้หมดอายุ',
  'หมดอายุแล้ว',
  'บริษัทเรียกเก็บ (มีหนังสือ)',
  'คุณภาพ/ชำรุด',
  'ของไม่ตรงเอกสาร',
  'อื่นๆ',
];

// CSS ร่วม 2 ใบ — ขาวดำล้วน (เครื่องพิมพ์ไม่มีสี) ตัวอักษร/เส้น #000 พื้นขาว
const SHARED_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 12px; color: #000; background: #fff; padding: 12px 18px 14px; }
  @page { size: A4 portrait; margin: 10mm; }
  .h-row { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
  h1 { font-size: 17px; font-weight: 700; color: #000; }
  .sub { font-size: 12px; color: #000; font-weight: 700; margin-top: 2px; }
  .refbox { border: 2px solid #000; padding: 5px 8px; margin-bottom: 7px; display: flex;
    justify-content: space-between; align-items: center; gap: 10px; font-size: 12px; font-weight: 700; }
  .refbox .num { font-size: 14px; letter-spacing: 1px; }
  .refbox span.fill { display: inline-block; border-bottom: 1px solid #000; min-width: 92px; margin-left: 5px;
    height: 16px; vertical-align: bottom; }
  .meta { display: flex; flex-wrap: wrap; gap: 3px 14px; font-size: 11px; color: #000; margin-bottom: 7px; }
  .meta span { display: inline-block; border-bottom: 1px dotted #000; min-width: 120px; margin-left: 5px;
    height: 14px; vertical-align: bottom; }
  /* ช่องเว้นให้เขียนมือ — ต้อง align bottom + มีความสูง ไม่งั้นเส้นลอยไปกลางบรรทัด (ดูเหมือนขีดฆ่า) */
  .fl { display: inline-block; border-bottom: 1px solid #000; height: 14px; vertical-align: bottom;
    margin: 0 3px; min-width: 60px; }
  .fl-s { min-width: 44px; }
  .fl-m { min-width: 82px; }
  .fl-l { min-width: 130px; }
  .reasons { border: 1px solid #000; padding: 5px 8px; margin-bottom: 7px; font-size: 11px; }
  .reasons b { font-size: 11px; }
  .reasons ul { list-style: none; display: flex; flex-wrap: wrap; gap: 5px 14px; margin-top: 4px; }
  /* baseline ไม่ใช่ center — ไม่งั้น .fl (เส้นเขียนมือ) ถูกดันขึ้นไปกลางบรรทัด */
  .reasons li { display: flex; align-items: baseline; gap: 4px; }
  .reasons li .bx { align-self: center; }
  .bx { display: inline-block; width: 11px; height: 11px; border: 1px solid #000; vertical-align: middle; flex: none; }
  .bx-lg { width: 12px; height: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 7px; page-break-inside: avoid;
    table-layout: fixed; }
  th { background: #fff; color: #000; font-weight: 700; padding: 3px 2px; text-align: center; border: 1px solid #000;
    word-wrap: break-word; }
  td { padding: 3px 3px; border: 1px solid #000; height: 30px; vertical-align: middle; word-wrap: break-word; }
  td.c { text-align: center; }
  .note-line { font-size: 11px; margin-bottom: 7px; }
  .note-line span { display: inline-block; border-bottom: 1px dotted #000; min-width: 74%; margin-left: 5px;
    height: 15px; vertical-align: bottom; }
  .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 8px; page-break-inside: avoid; }
  .sig-box { padding: 5px 10px; text-align: center; }
  .sig-title { font-size: 11px; font-weight: 700; color: #000; margin-bottom: 24px; }
  .sig-line { border-bottom: 1px solid #000; }
  .sig-label { font-size: 10px; color: #000; margin-top: 4px; }
  .sig-date { font-size: 10px; color: #000; margin-top: 5px; }
  .sig-date span { display: inline-block; border-bottom: 1px dotted #000; min-width: 88px; margin-left: 5px;
    height: 13px; vertical-align: bottom; }
  .foot { font-size: 9px; color: #000; text-align: right; margin-top: 6px; }
  .tbl-wrap { width: 100%; }
  /* ใบที่ 2 ของโหมดพิมพ์คู่ — ต้องขึ้นหน้ากระดาษใหม่เสมอ */
  .sheet2 { break-before: page; page-break-before: always; }
  .sheet2-hint { display: none; }
  @media print { button { display: none !important; } thead { display: table-header-group; } .tbl-wrap { overflow: visible; } }
  @media screen {
    /* บนจอไม่มีขอบกระดาษ — ใส่เส้นคั่นให้เห็นว่าเป็นคนละแผ่น */
    .sheet2 { margin-top: 26px; padding-top: 20px; border-top: 3px double #000; }
    .sheet2-hint { display: block; font-size: 11px; font-weight: 700; text-align: center; margin-bottom: 10px; }
  }
  @media screen and (max-width: 768px) {
    body { padding: 12px; }
    .tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    table { min-width: 700px; }
  }
`;

const reasonList = () => `
<div class="reasons">
  <b>เหตุผลที่เปลี่ยน / คืน</b> (ติ๊กได้มากกว่า 1 ข้อ)
  <ul>${REASONS.map((r) => `<li><span class="bx bx-lg"></span> ${r}</li>`).join('')}</ul>
</div>`;

const printBtn = () => `
<button id="btnPrint" type="button" style="position:fixed;top:14px;right:14px;background:#000;color:#fff;border:none;
  padding:8px 18px;border-radius:8px;font-family:Sarabun,sans-serif;font-size:13px;cursor:pointer;font-weight:600;z-index:9999;">
  พิมพ์
</button>`;

const printScript = () => `<script>document.getElementById('btnPrint').addEventListener('click', function(){ window.print(); });</script>`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// รายการที่ส่งคืน (ถ้ามี) เอามาเติมล่วงหน้าในใบรับกลับ — คนกรอกแค่ฝั่ง "ที่ได้รับจริง"
// rows = [{ name, lot, qty, unit }] — ว่าง = ฟอร์มเปล่าเหมือนเดิม
const outRowsOrBlank = (rows, count, cells) => {
  const list = Array.isArray(rows) ? rows : [];
  return Array.from({ length: Math.max(count, list.length) }, (_, i) => {
    const r = list[i];
    return `
    <tr>
      <td class="c">${i + 1}</td>
      ${cells(r)}
    </tr>`;
  }).join('');
};

// ── ใบที่ 1: ส่งคืนบริษัท (ขาออก) ────────────────────────────────
// คลังเขียนตอนผู้แทนบริษัทมารับของ — ออกเลขที่รอบตรงนี้ ใบรับกลับจะอ้างเลขนี้
function buildExchangeOutHtml({ vxNo = '', supplier = '', outDate = '', rows = [] } = {}) {
  const ROW_COUNT = 10;
  const emptyRows = outRowsOrBlank(rows, ROW_COUNT, (r) => `
      <td>${esc(r?.name)}</td>
      <td class="c">${esc(r?.lot)}</td>
      <td class="c">${esc(r?.exp)}</td>
      <td class="c">${esc(r?.qty)}</td>
      <td class="c">${esc(r?.unit)}</td>
      <td class="c"></td>
      <td class="c"></td>
      <td></td>`);

  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ใบส่งคืนยาให้บริษัท</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>${SHARED_CSS}</style>
</head><body>
${printBtn()}

<div class="h-row">
  <h1>${HOSPITAL_NAME}</h1>
  <p class="sub">ใบส่งคืน / เปลี่ยนยากับบริษัท <span style="font-weight:400;">(ขาออก — ยาออกจากคลังไปบริษัท)</span></p>
</div>

<div class="refbox">
  <div>เลขที่รอบ (คลังออก) <span class="num">VX -</span><span class="fill">${esc(vxNo)}</span></div>
  <div>วันที่ส่งคืน <span class="fill">${esc(outDate)}</span></div>
</div>

<div class="meta">
  <div>บริษัท / ผู้ขาย <span style="min-width:210px;">${esc(supplier)}</span></div>
  <div>ชื่อผู้แทนที่มารับของ <span></span></div>
  <div>เบอร์ติดต่อ <span style="min-width:95px;"></span></div>
  <div>เลขที่เอกสารบริษัท (RMA / หนังสือแจ้ง — ถ้ามี) <span style="min-width:135px;"></span></div>
  <div>อ้างถึงบิลซื้อเลขที่ <span style="min-width:120px;"></span></div>
</div>

${reasonList()}

<div class="tbl-wrap">
<table>
  <thead>
  <tr>
    <th style="width:4%;">ลำดับ</th>
    <th style="width:23%;">ชื่อยา</th>
    <th style="width:12%;">LOT.NO</th>
    <th style="width:9%;">EXP.</th>
    <th style="width:8%;">จำนวน<br/>ที่ส่งคืน</th>
    <th style="width:8%;">หน่วย</th>
    <th style="width:10%;">ราคา/หน่วย<br/>(บาท)</th>
    <th style="width:11%;">มูลค่ารวม<br/>(บาท)</th>
    <th style="width:15%;">ขนาดบรรจุ / หมายเหตุ</th>
  </tr>
  </thead>
  <tbody>${emptyRows}</tbody>
  <tfoot>
    <tr>
      <td colspan="7" style="text-align:right;font-weight:700;">รวมมูลค่าที่ส่งคืน (บาท)</td>
      <td class="c"></td>
      <td></td>
    </tr>
  </tfoot>
</table>
</div>

<p class="note-line">กำหนดรับของเปลี่ยนคืนภายในวันที่ <span style="min-width:150px;"></span></p>

<div class="reasons">
  <b>ระหว่างรอของเปลี่ยน</b>
  <ul>
    <li><span class="bx bx-lg"></span> ของในคลังพอใช้ ไม่ต้องยืม</li>
    <li><span class="bx bx-lg"></span> <b>ยืมยามาใช้ระหว่างรอ</b> — จาก <span class="fl fl-l"></span>
      จำนวน <span class="fl fl-s"></span>
      (ต้องคืนผู้ให้ยืมเมื่อได้ของเปลี่ยนแล้ว)</li>
  </ul>
</div>

<p style="font-size:10px;margin-bottom:6px;">
  <b>ขนาดบรรจุ</b> — เขียนตามที่นับจริง เช่น <b>8 × 1000's</b> (8 กล่อง กล่องละ 1000 เม็ด) ·
  <b>1 หลอด</b> / <b>1 ขวด</b> (ยาพ่น ยาน้ำ ยาครีม ที่จ่ายเป็นชิ้น ไม่ต้องมีตัวคูณ)
</p>

<div class="sig-row">
  <div class="sig-box">
    <p class="sig-title">เจ้าหน้าที่คลัง (ผู้ส่งมอบ)</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ / ชื่อตัวบรรจง</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
  <div class="sig-box">
    <p class="sig-title">ผู้แทนบริษัท (ผู้รับของไป)</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ / ชื่อตัวบรรจง</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
</div>

<p class="foot">เก็บใบนี้ไว้จนกว่าจะได้ของเปลี่ยนคืนครบ — ใบรับกลับต้องอ้างเลขที่รอบเดียวกัน · พิมพ์เมื่อ ${todayThaiDate()}</p>
${printScript()}
</body></html>`;
  return html;
}

export function printExchangeOutForm(opts) {
  openPrintView(buildExchangeOutHtml(opts));
}

// ── ใบที่ 2: รับยาเปลี่ยนกลับ (ขาเข้า) ────────────────────────────
// lot/exp มักเปลี่ยนระหว่างทาง จึงมีทั้งช่อง lot เดิม (อ้างอิง) และ lot ใหม่ (ของที่ได้จริง)
// rows = รายการจากใบส่งคืน [{ name, lot, qty, unit }] — ส่งมาแล้วฝั่งซ้ายถูกเติมให้ ไม่ต้องลอกมือ
// vxNo = เลขที่รอบ, ไว้พิมพ์ลงหัวใบให้ตรงกับใบส่งคืน
function buildExchangeInHtml({ rows = [], vxNo = '', supplier = '', outDate = '' } = {}) {
  const ROW_COUNT = 10;
  const emptyRows = outRowsOrBlank(rows, ROW_COUNT, (r) => `
      <td>${esc(r?.name)}</td>
      <td class="c">${esc(r?.lot)}</td>
      <td class="c">${r?.qty ? `${esc(r.qty)} ${esc(r.unit || '')}`.trim() : ''}</td>
      <td></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>
      <td></td>`);

  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ใบรับยาเปลี่ยนกลับจากบริษัท</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>${SHARED_CSS}</style>
</head><body>
${printBtn()}

<div class="h-row">
  <h1>${HOSPITAL_NAME}</h1>
  <p class="sub">ใบรับยาเปลี่ยนกลับจากบริษัท <span style="font-weight:400;">(ขาเข้า — ยากลับเข้าคลัง)</span></p>
</div>

<div class="refbox">
  <div>อ้างถึงใบส่งคืนเลขที่ <span class="num">VX -</span><span class="fill">${esc(vxNo)}</span></div>
  <div>วันที่รับกลับ <span class="fill"></span></div>
</div>

<div class="meta">
  <div>บริษัท / ผู้ขาย <span style="min-width:200px;">${esc(supplier)}</span></div>
  <div>ชื่อผู้แทนที่นำของมาส่ง <span></span></div>
  <div>วันที่ส่งคืนเดิม <span style="min-width:95px;">${esc(outDate)}</span></div>
  <div>เลขที่เอกสารบริษัท (RMA / หนังสือแจ้ง — ถ้ามี) <span style="min-width:135px;"></span></div>
  <div>เลขที่บิลที่มากับของ <span style="min-width:120px;"></span></div>
</div>

<div class="reasons">
  <b>ผลการรับของเปลี่ยนคืน</b>
  <ul>
    <li><span class="bx bx-lg"></span> ได้รับครบตามที่ส่งคืน — ปิดรอบ</li>
    <li><span class="bx bx-lg"></span> ได้รับบางส่วน — ยังค้างอีก <span class="fl"></span> รายการ</li>
    <li><span class="bx bx-lg"></span> บริษัทไม่เปลี่ยนให้ / ปฏิเสธ (ระบุเหตุผลด้านล่าง)</li>
    <li><span class="bx bx-lg"></span> เปลี่ยนเป็นเงินคืน / ใบลดหนี้</li>
  </ul>
  <div style="border-top:1px solid #000;margin-top:5px;padding-top:4px;">
    <b>ชนิดของที่ได้รับกลับ</b>
    <ul>
      <li><span class="bx bx-lg"></span> <b>ยาเดิม</b> (lot ใหม่)</li>
      <li><span class="bx bx-lg"></span> <b>ยาอื่น / ของชดเชย</b> — ไม่ใช่ยาตัวที่ส่งคืน (กรอกคอลัมน์ "ยาที่ได้รับจริง")</li>
      <li><span class="bx bx-lg"></span> <b>ยืมยาไว้ระหว่างรอ — คืนผู้ให้ยืมแล้ว</b> วันที่ <span class="fl fl-m"></span></li>
    </ul>
  </div>
</div>

<div class="tbl-wrap">
<table>
  <thead>
  <tr>
    <th rowspan="2" style="width:3%;">ลำดับ</th>
    <th colspan="3" style="width:33%;">ยาที่ส่งคืนไป (อ้างอิงใบส่งคืน)</th>
    <th colspan="5" style="width:55%;">ยาที่ได้รับจริง</th>
    <th rowspan="2" style="width:9%;">หมายเหตุ</th>
  </tr>
  <tr>
    <th style="width:16%;">ชื่อยา</th>
    <th style="width:9%;">LOT</th>
    <th style="width:8%;">จำนวน<br/>+ หน่วย</th>
    <th style="width:16%;">ชื่อยา<br/><span style="font-weight:400;">(ตัวเดิม เขียน "เดิม")</span></th>
    <th style="width:9%;">LOT</th>
    <th style="width:8%;">EXP.</th>
    <th style="width:10%;">จำนวน<br/>+ หน่วย</th>
    <th style="width:12%;">มูลค่ารวม<br/>(บาท)</th>
  </tr>
  </thead>
  <tbody>${emptyRows}</tbody>
</table>
</div>

<div class="reasons" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;">
  <b>สรุปมูลค่า</b>
  <span>ที่ส่งคืนไป <span class="fl fl-m"></span> บาท</span>
  <span>ที่ได้รับกลับ <span class="fl fl-m"></span> บาท</span>
  <span>ส่วนต่าง <span class="fl fl-m"></span> บาท</span>
  <span><span class="bx"></span> เคลียร์แล้ว &nbsp; <span class="bx"></span> รอเคลียร์กับบริษัท</span>
</div>

<p class="note-line">หมายเหตุเพิ่มเติม <span></span></p>

<p style="font-size:10px;margin-bottom:6px;">
  <b>ถ้าของที่ได้รับไม่ใช่ยาตัวเดิม</b> — กรอก "ยาที่ได้รับจริง" ตามของที่มาส่ง แล้วเขียนในหมายเหตุว่าชดเชยแทนรายการใด ·
  <b>ได้หลาย lot ต่อ 1 รายการ</b> ให้แยกบรรทัด · <b>จำนวนไม่เท่าที่ส่งคืน</b> ให้เขียนตามที่ได้รับจริง แล้วระบุส่วนต่างในหมายเหตุ ·
  <b>หน่วยคนละแบบ</b> (เช่น ส่งคืนเป็นกล่อง ได้กลับเป็นขวด) ให้เขียนหน่วยตามของจริงทั้งสองฝั่ง <u>ห้ามแปลงหน่วยเอง</u> — ใช้มูลค่าเป็นตัวเทียบแทน
</p>

<div class="sig-row">
  <div class="sig-box">
    <p class="sig-title">ผู้แทนบริษัท (ผู้นำของมาส่ง)</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ / ชื่อตัวบรรจง</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
  <div class="sig-box">
    <p class="sig-title">เจ้าหน้าที่คลัง (ผู้รับของ)</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ / ชื่อตัวบรรจง</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
</div>

<p class="foot">บันทึกเข้าระบบ: ไฟล์รับ — สถานะการซื้อ = "แลกเปลี่ยนยา" · เลขที่บิล = เลขที่รอบ VX ข้างต้น · พิมพ์เมื่อ ${todayThaiDate()}</p>
${printScript()}
</body></html>`;
  return html;
}

export function printExchangeInForm(opts) {
  openPrintView(buildExchangeInHtml(opts));
}

// ── พิมพ์คู่: ใบส่งคืน + ใบรับกลับ ในการเปิดครั้งเดียว ──────────────
// ใบรับกลับพิมพ์ตามหลังโดยฝั่ง "ยาที่ส่งคืนไป" ถูกเติมจากรายการเดียวกัน — ไม่ต้องลอกมือ
// ตั้งใจไม่ผูก DB: กรอกบนจอ (ยังไม่มีที่เก็บรอบในระบบ) — เมื่อมีทะเบียนรอบแล้วค่อยดึงมาแทน
export function printExchangePair({ rows = [], vxNo = '', supplier = '', outDate = '' } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const inHtml = buildExchangeInHtml({ rows: list, vxNo, supplier, outDate });
  const outHtml = buildExchangeOutHtml({ vxNo, supplier, outDate, rows: list });
  // ต่อ body ของใบที่ 2 ท้ายใบแรก คั่นด้วย page-break
  // ถอดปุ่มพิมพ์ + <script> ของใบที่ 2 ออก — id ซ้ำกันจะทำให้ปุ่มบนสุดหยุดทำงาน
  const body2 = inHtml
    .slice(inHtml.indexOf('<body>') + 6, inHtml.lastIndexOf('</body>'))
    .replace(/<button id="btnPrint"[\s\S]*?<\/button>/, '')
    .replace(/<script>[\s\S]*?<\/script>/, '');
  // ห่อใบที่ 2 ด้วย div ที่ "มีเนื้อหา" แล้วสั่ง break-before บนตัวมันเอง
  // (div เปล่าไม่ทำให้ขึ้นหน้าใหม่ — เบราว์เซอร์ข้าม element ที่ไม่มี content)
  const merged = outHtml.replace(
    '</body>',
    `<div class="sheet2"><p class="sheet2-hint">— แผ่นที่ 2: ใบรับยาเปลี่ยนกลับ (พิมพ์แยกคนละแผ่น) —</p>${body2}</div></body>`,
  );
  openPrintView(merged);
}
