// แบบฟอร์มยาหมดอายุ / ใกล้หมดอายุ — คัดแยกปลายทาง (เปลี่ยนคืนบริษัท vs รอทำลาย)
//   printExpiryDispositionForm() = ใบสำรวจ+ตัดสินปลายทาง (ก่อนลงมือ)
//   printDestroyForm()           = ใบส่งทำลาย (หลังตัดสินว่าทำลาย) — มีคณะกรรมการเซ็น
//
// ที่มา: ระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างฯ พ.ศ. 2560 **ข้อ 215**
//   "จำหน่ายพัสดุ" มี 4 วิธี: ขาย · แลกเปลี่ยน · โอน · แปรสภาพหรือทำลาย
//   → "เปลี่ยนคืนบริษัท" = แลกเปลี่ยน · "รอทำลาย" = แปรสภาพหรือทำลาย
//   สองกิ่งของเรื่องเดียวกัน จึงตัดสินบนใบเดียวกันแล้วแยกทางทีหลัง
//
// ทำไมต้องแยกจาก [ฟอร์มคืนยาใกล้หมดอายุ] เดิม: ใบเดิมสำรวจอย่างเดียว ไม่มีที่บันทึก "ตัดสินใจ"
// ทำให้ของที่เปลี่ยนคืนได้กับของที่ต้องทำลายปนกันในถังเดียว (พบจริง: Digoxin lot 6180009
// ถูกบันทึกว่า "เบิกยาหมดอายุจากคลัง" แต่ note เขียนว่าจะเอาไปแลกเปลี่ยนกับบริษัท)
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

// ขาวดำล้วน (เครื่องพิมพ์ไม่มีสี) — ชุดเดียวกับ vendorExchangeCycle.js
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
  .refbox span.fill { display: inline-block; border-bottom: 1px solid #000; min-width: 92px; margin-left: 5px;
    height: 14px; vertical-align: bottom; }
  .meta { display: flex; flex-wrap: wrap; gap: 3px 14px; font-size: 11px; color: #000; margin-bottom: 7px; }
  .meta span { display: inline-block; border-bottom: 1px dotted #000; min-width: 120px; margin-left: 5px;
    height: 14px; vertical-align: bottom; }
  .box { border: 1px solid #000; padding: 5px 8px; margin-bottom: 7px; font-size: 11px; }
  .box ul { list-style: none; display: flex; flex-wrap: wrap; gap: 5px 14px; margin-top: 4px; }
  /* baseline ไม่ใช่ center — ไม่งั้น .fl (เส้นเขียนมือ) ถูกดันขึ้นไปกลางบรรทัด */
  .box li { display: flex; align-items: baseline; gap: 4px; }
  .box li .bx { align-self: center; }
  /* รายการที่มีช่องเขียนหลายช่องต่อบรรทัด — ให้กินเต็มความกว้าง 1 ข้อ/บรรทัด */
  .box ul.stack { flex-direction: column; gap: 7px; }
  .box ul.stack li { width: 100%; flex-wrap: wrap; }
  .bx { display: inline-block; width: 12px; height: 12px; border: 1px solid #000; vertical-align: middle; flex: none; }
  /* ช่องเว้นให้เขียนมือ — ต้อง align bottom + มีความสูง ไม่งั้นเส้นลอยไปกลางบรรทัด (ดูเหมือนขีดฆ่า) */
  .fl { display: inline-block; border-bottom: 1px solid #000; height: 14px; vertical-align: bottom;
    margin: 0 3px; min-width: 60px; }
  .fl-s { min-width: 44px; }
  .fl-m { min-width: 82px; }
  .fl-l { min-width: 130px; }
  .fl-xl { min-width: 155px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 7px; page-break-inside: avoid;
    table-layout: fixed; }
  th { background: #fff; color: #000; font-weight: 700; padding: 3px 2px; text-align: center; border: 1px solid #000;
    word-wrap: break-word; }
  td { padding: 3px 3px; border: 1px solid #000; height: 30px; vertical-align: middle; word-wrap: break-word; }
  td.c { text-align: center; }
  .note-line { font-size: 11px; margin-bottom: 7px; }
  .note-line span { display: inline-block; border-bottom: 1px dotted #000; min-width: 74%; margin-left: 5px;
    height: 14px; vertical-align: bottom; }
  .sig-row { display: grid; gap: 18px; margin-top: 8px; page-break-inside: avoid; }
  .sig-2 { grid-template-columns: 1fr 1fr; }
  .sig-3 { grid-template-columns: 1fr 1fr 1fr; }
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

const blankRows = (count, cells) => Array.from({ length: count }, (_, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      ${cells}
    </tr>`).join('');

// ── ใบที่ 1: สำรวจยาหมดอายุ/ใกล้หมดอายุ + ตัดสินปลายทาง ───────────────
export function printExpiryDispositionForm() {
  const ROW_COUNT = 12;
  const rows = blankRows(ROW_COUNT, `
      <td></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>`);

  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ใบสำรวจยาหมดอายุ - คัดแยกปลายทาง</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>${SHARED_CSS}</style>
</head><body>
${printBtn()}

<div class="h-row">
  <h1>${HOSPITAL_NAME}</h1>
  <p class="sub">ใบสำรวจยาหมดอายุ / ใกล้หมดอายุ — คัดแยกปลายทาง</p>
  <p class="legal">ตามระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560 ข้อ 215 (การจำหน่ายพัสดุ)</p>
</div>

<div class="refbox">
  <div>เลขที่ใบสำรวจ <span class="num">EX -</span><span class="fill"></span></div>
  <div>วันที่สำรวจ <span class="fill"></span></div>
</div>

<div class="meta">
  <div>ผู้สำรวจ <span style="min-width:170px;"></span></div>
  <div>รอบการสำรวจ <span style="min-width:120px;"></span></div>
  <div>ที่เก็บ / โซนที่สำรวจ <span style="min-width:150px;"></span></div>
</div>

<div class="box">
  <b>ปลายทางที่เป็นไปได้</b> (ระเบียบฯ ข้อ 215 — เลือก 1 ข้อต่อรายการ ในคอลัมน์ "ปลายทาง")
  <ul>
    <li><b>A</b> = เปลี่ยน/คืนบริษัท <span style="font-weight:400;">(แลกเปลี่ยน — ยังอยู่ในเงื่อนไขบริษัท)</span></li>
    <li><b>B</b> = รอทำลาย <span style="font-weight:400;">(แปรสภาพหรือทำลาย — บริษัทไม่รับเปลี่ยน)</span></li>
    <li><b>C</b> = ยังไม่ตัดสิน <span style="font-weight:400;">(ต้องสอบถามบริษัทก่อน)</span></li>
  </ul>
</div>

<div class="tbl-wrap">
<table>
  <thead>
  <tr>
    <th style="width:3.5%;">ลำดับ</th>
    <th style="width:19%;">ชื่อยา</th>
    <th style="width:10%;">LOT.NO</th>
    <th style="width:8%;">EXP.</th>
    <th style="width:7%;">คงเหลือ</th>
    <th style="width:6%;">หน่วย</th>
    <th style="width:9%;">มูลค่า<br/>(บาท)</th>
    <th style="width:13%;">บริษัท</th>
    <th style="width:9%;">นโยบาย<br/>เปลี่ยนคืน</th>
    <th style="width:7%;">deadline<br/>เปลี่ยน</th>
    <th style="width:7.5%;">ปลายทาง<br/>A/B/C</th>
  </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</div>

<p style="font-size:10px;margin-bottom:6px;">
  <b>นโยบายเปลี่ยนคืน</b> — เขียนตามที่บริษัทให้ไว้ เช่น "คืนได้ 100% ก่อน exp 6 เดือน" · "ไม่รับคืน" ·
  <b>deadline เปลี่ยน</b> = วันสุดท้ายที่ยังส่งคืนได้ (exp ลบด้วยระยะเวลาตามนโยบาย) ·
  ถ้าเลย deadline แล้ว ปลายทางมักเป็น <b>B</b>
</p>

<div class="box">
  <b>สรุปผลการคัดแยก</b>
  <ul class="stack">
    <li><span class="bx"></span> A — เปลี่ยน/คืนบริษัท <span class="fl fl-s"></span> รายการ
      &nbsp;→ ออก <b>ใบส่งคืนบริษัท (ขาออก)</b> เลขที่ VX <span class="fl fl-m"></span></li>
    <li><span class="bx"></span> B — รอทำลาย <span class="fl fl-s"></span> รายการ
      &nbsp;→ ย้ายเข้าโซนกักกัน + ออก <b>ใบส่งทำลาย</b> เลขที่ DS <span class="fl fl-m"></span></li>
    <li><span class="bx"></span> C — ยังไม่ตัดสิน <span class="fl fl-s"></span> รายการ
      &nbsp;→ ติดตามภายในวันที่ <span class="fl fl-m"></span></li>
  </ul>
</div>

<div class="sig-row sig-2">
  <div class="sig-box">
    <p class="sig-title">ผู้สำรวจ (เจ้าหน้าที่คลัง)</p>
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

<p class="foot">ยาที่ยังไม่ถูกจำหน่ายออกตามระเบียบ ยังนับเป็นทรัพย์สินคงคลัง — เก็บใบนี้เป็นหลักฐานการคัดแยก · พิมพ์เมื่อ ${todayThaiDate()}</p>
${printScript()}
</body></html>`;
  openPrintView(html);
}

// ── ใบที่ 2: ส่งทำลาย (เฉพาะรายการที่ตัดสินเป็น B) ────────────────────
// คณะกรรมการ 3 คน อิงระเบียบฯ ข้อ 215 (แปรสภาพหรือทำลาย) — วิธีการตามที่หน่วยงานกำหนด
export function printDestroyForm() {
  const ROW_COUNT = 12;
  const rows = blankRows(ROW_COUNT, `
      <td></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>
      <td></td>`);

  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ใบส่งทำลายยาหมดอายุ</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>${SHARED_CSS}</style>
</head><body>
${printBtn()}

<div class="h-row">
  <h1>${HOSPITAL_NAME}</h1>
  <p class="sub">ใบส่งทำลายยาหมดอายุ / เสื่อมสภาพ</p>
  <p class="legal">การจำหน่ายพัสดุโดยวิธี "แปรสภาพหรือทำลาย" ตามระเบียบกระทรวงการคลังฯ พ.ศ. 2560 ข้อ 215</p>
</div>

<div class="refbox">
  <div>เลขที่ใบส่งทำลาย <span class="num">DS -</span><span class="fill"></span></div>
  <div>วันที่ทำลาย <span class="fill"></span></div>
</div>

<div class="meta">
  <div>อ้างถึงใบสำรวจเลขที่ EX <span style="min-width:110px;"></span></div>
  <div>หนังสืออนุมัติเลขที่ <span style="min-width:130px;"></span></div>
  <div>ลงวันที่ <span style="min-width:90px;"></span></div>
</div>

<div class="box">
  <b>วิธีทำลาย</b>
  <ul class="stack">
    <li><span class="bx"></span> ส่งบริษัทกำจัดขยะติดเชื้อ/ของเสียอันตราย — ชื่อบริษัท <span class="fl fl-xl"></span></li>
    <li><span class="bx"></span> ทำลายเองในโรงพยาบาล — วิธี <span class="fl fl-l"></span></li>
    <li><span class="bx"></span> ส่งคืนหน่วยงานต้นสังกัด / อภ.</li>
    <li><span class="bx"></span> อื่นๆ <span class="fl fl-xl"></span></li>
  </ul>
  <div style="border-top:1px solid #000;margin-top:5px;padding-top:4px;">
    <b>ยาควบคุมพิเศษ</b>
    <ul class="stack">
      <li><span class="bx"></span> ไม่มีในรายการนี้</li>
      <li><span class="bx"></span> มี — <b>วัตถุออกฤทธิ์/ยาเสพติด ต้องแจ้ง อย. และทำลายต่อหน้าพนักงานเจ้าหน้าที่</b>
        เลขที่หนังสือแจ้ง <span class="fl fl-l"></span></li>
    </ul>
  </div>
</div>

<div class="tbl-wrap">
<table>
  <thead>
  <tr>
    <th style="width:4%;">ลำดับ</th>
    <th style="width:24%;">ชื่อยา</th>
    <th style="width:12%;">LOT.NO</th>
    <th style="width:9%;">EXP.</th>
    <th style="width:9%;">จำนวน<br/>ที่ทำลาย</th>
    <th style="width:8%;">หน่วย</th>
    <th style="width:10%;">ราคา/หน่วย<br/>(บาท)</th>
    <th style="width:11%;">มูลค่ารวม<br/>(บาท)</th>
    <th style="width:13%;">เหตุที่ทำลาย</th>
  </tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr>
      <td colspan="7" style="text-align:right;font-weight:700;">รวมมูลค่าที่จำหน่ายออก (บาท)</td>
      <td class="c"></td>
      <td></td>
    </tr>
  </tfoot>
</table>
</div>

<p style="font-size:10px;margin-bottom:6px;">
  <b>เหตุที่ทำลาย</b> — เช่น หมดอายุ · เสื่อมสภาพ · ชำรุด/แตกหัก · บริษัทไม่รับเปลี่ยน · เลย deadline เปลี่ยนคืน ·
  <b>มูลค่ารวมคือยอดที่ต้องตัดออกจากบัญชีคงคลัง</b> ต้องตรงกับที่บันทึกในระบบ
</p>

<div class="sig-row sig-3">
  <div class="sig-box">
    <p class="sig-title">กรรมการทำลาย คนที่ 1<br/>(ประธาน)</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ / ชื่อตัวบรรจง</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
  <div class="sig-box">
    <p class="sig-title">กรรมการทำลาย คนที่ 2</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ / ชื่อตัวบรรจง</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
  <div class="sig-box">
    <p class="sig-title">กรรมการทำลาย คนที่ 3</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ / ชื่อตัวบรรจง</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
</div>

<div class="sig-row sig-2" style="margin-top:14px;">
  <div class="sig-box">
    <p class="sig-title">ผู้รับของไปทำลาย (บริษัท/หน่วยงานภายนอก)</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ / ชื่อตัวบรรจง</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
  <div class="sig-box">
    <p class="sig-title">ผู้อนุมัติ (ผู้อำนวยการ / ผู้ได้รับมอบหมาย)</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ / ชื่อตัวบรรจง</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
</div>

<p class="foot">บันทึกเข้าระบบ: ไฟล์เบิก — หน่วยงาน "เบิกยาหมดอายุจากคลัง" · หมายเหตุ = เลขที่ใบส่งทำลาย DS ข้างต้น · พิมพ์เมื่อ ${todayThaiDate()}</p>
${printScript()}
</body></html>`;
  openPrintView(html);
}
