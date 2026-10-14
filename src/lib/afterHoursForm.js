// ใบขอเบิกยา / น้ำเกลือ / เวชภัณฑ์ นอกเวลาที่กำหนด — ใบเปล่าให้หน่วยงานกรอกมือ ไม่ดึงข้อมูลจากระบบ
// ฉบับปรับปรุง 14/10/2569 (แทนไฟล์ Desktop\ยอดคงคลัง\แบบฟอร์มขอเบิกยา-นอกเวลา.html ฉบับ 23/09/2569)
//   - ช่องเซ็นทั้งหมดอยู่กล่องเดียวท้ายใบ เรียงตามขั้นตอน ① ขอ → ② รับรอง → ③ จ่าย → ④ รับ → ⑤ อนุมัติ
//   - ② ควรคนละคนกับ ① แต่ไม่บังคับ: เวรที่มีคนเดียวติ๊ก "ไม่มีผู้รับรอง" แล้วหัวหน้าคลัง (⑤) ตรวจแทน
//     (บังคับเด็ดขาด = เวรดึกกรอกใบไม่ได้ → กลับไปเบิกปากเปล่าที่ไม่มีหลักฐานเลย)
//   - "ใครจ่ายยา": ห้องยาจ่ายแทน = ไม่ตัดยอดคลัง คลังบันทึกไว้เป็นหลักฐานเท่านั้น
// PDF ใบเปล่าที่แจกในกลุ่มไลน์ / Google Drive สร้างจาก buildAfterHoursFormHtml() ตัวเดียวกัน — ห้ามแก้ไฟล์ HTML แยก
import { openPrintView } from './openPrintView';

const HOSPITAL_NAME = 'โรงพยาบาลประชาธิปัตย์';
const REVISION = '14/10/2569';
const ROW_COUNT = 9;

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 12px; color: #000; background: #fff; padding: 8px 18px 10px; }
  @page { size: A4 portrait; margin: 10mm; }
  .h-row { text-align: center; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
  h1 { font-size: 16px; font-weight: 700; }
  .sub { font-size: 12px; font-weight: 700; margin-top: 2px; }
  .legal { font-size: 9.5px; margin-top: 2px; }
  .refbox { border: 2px solid #000; padding: 4px 8px; margin-bottom: 5px; display: flex;
    justify-content: space-between; align-items: baseline; gap: 10px; font-size: 12px; font-weight: 700; }
  .refbox .small { font-weight: 400; font-size: 10px; }
  /* ช่องเว้นให้เขียนมือ — ต้อง align bottom + มีความสูง ไม่งั้นเส้นลอยไปกลางบรรทัด (ดูเหมือนขีดฆ่า) */
  .fl { display: inline-block; border-bottom: 1px solid #000; height: 15px; vertical-align: bottom; margin: 0 3px; min-width: 60px; }
  .fl-s { min-width: 46px; } .fl-m { min-width: 88px; } .fl-l { min-width: 150px; } .fl-xl { min-width: 230px; }
  .line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; font-size: 11.5px; margin-bottom: 5px; }
  .bx { display: inline-block; width: 12px; height: 12px; border: 1px solid #000; vertical-align: middle; margin-right: 3px; }
  .box { border: 1px solid #000; padding: 4px 8px; margin-bottom: 5px; font-size: 11px; line-height: 1.7; }
  .box b.t { margin-right: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 5px; table-layout: fixed; page-break-inside: avoid; }
  th { background: #fff; font-weight: 700; padding: 3px 2px; text-align: center; border: 1px solid #000; }
  th small { display: block; font-weight: 400; font-size: 8.5px; }
  td { padding: 2px 3px; border: 1px solid #000; height: 25px; vertical-align: middle; }
  td.c { text-align: center; }
  .sign { border: 2px solid #000; margin-top: 6px; page-break-inside: avoid; }
  .sign-h { display: flex; justify-content: space-between; gap: 8px; padding: 3px 8px; border-bottom: 2px solid #000; font-size: 11px; font-weight: 700; }
  .sign-h .legend { font-weight: 400; font-size: 10px; }
  .sign table { margin: 0; }
  .sign th { font-size: 10px; }
  .sign td { height: 38px; font-size: 10.5px; }
  .sign td.step { text-align: center; font-size: 15px; font-weight: 700; }
  .sign td.who { font-weight: 700; line-height: 1.3; }
  .sign td.who small { display: block; font-weight: 400; font-size: 9.5px; }
  .sign td.what { line-height: 1.3; }
  .tag { display: inline-block; border: 1px solid #000; padding: 0 4px; font-size: 9.5px; font-weight: 700; }
  .foot { font-size: 9px; text-align: right; margin-top: 4px; }
  @media print { button { display: none !important; } }
  @media screen and (max-width: 768px) { body { padding: 12px; } .tbl-wrap { overflow-x: auto; } table { min-width: 720px; } }
`;

const SIGN_ROWS = [
  { who: 'ผู้ขอเบิก', tag: 'หน่วยงาน', what: 'ขอเบิกตามรายการ ช่อง "ขอเบิก"' },
  { who: 'หัวหน้าหน่วยงาน / หัวหน้าเวร', tag: 'หน่วยงาน', note: 'ควรเป็นคนละคนกับ ①',
    what: 'รับรองว่าจำเป็นต้องใช้นอกรอบจริง<br/><span class="bx"></span>เวรนี้ไม่มีผู้รับรอง — ให้ ⑤ ตรวจแทน' },
  { who: 'ผู้จ่ายยา', tag: 'คลังยา / ห้องยา', note: 'คนที่หยิบยาจ่ายจริง', what: 'จ่ายตามช่อง "จ่ายจริง" ครบถ้วน' },
  { who: 'ผู้รับยา', tag: 'หน่วยงาน', note: 'เป็นคนเดียวกับ ① ได้', what: 'ได้รับยาครบตามช่อง "จ่ายจริง"' },
  { who: 'หัวหน้าคลังยา', tag: 'คลังยา', note: 'เซ็นภายหลังได้', what: 'อนุมัติการจ่ายนอกรอบ' },
];

export function buildAfterHoursFormHtml({ withPrintButton = true } = {}) {
  const rows = Array.from({ length: ROW_COUNT }, (_, i) =>
    `<tr><td class="c">${i + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
  const sign = SIGN_ROWS.map((r, i) => `
      <tr><td class="step">${'①②③④⑤'[i]}</td>
        <td class="who"><span class="tag">${r.tag}</span><br/>${r.who}${r.note ? `<small>${r.note}</small>` : ''}</td>
        <td class="what">${r.what}</td><td></td><td></td><td></td></tr>`).join('');

  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ใบขอเบิกยา นอกเวลาที่กำหนด</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>${CSS}</style>
</head><body>
${withPrintButton ? `<button id="btnPrint" type="button" style="position:fixed;top:14px;right:14px;background:#000;color:#fff;border:none;
  padding:8px 18px;border-radius:8px;font-family:Sarabun,sans-serif;font-size:13px;cursor:pointer;font-weight:600;z-index:9999;">พิมพ์</button>` : ''}

<div class="h-row">
  <h1>${HOSPITAL_NAME} · คลังยา</h1>
  <p class="sub">ใบขอเบิกยา / น้ำเกลือ / เวชภัณฑ์ นอกเวลาที่กำหนด</p>
  <p class="legal">กรณีฉุกเฉิน / ลืมเบิกตามรอบ · ใช้เป็นหลักฐานการจ่ายนอกรอบ แนบกับใบเบิกประจำรอบถัดไป</p>
</div>

<div class="refbox">
  <div>เลขที่ OT-<span class="fl fl-m"></span></div>
  <div>เลขรับใบเบิก <span class="small">(คลังกรอก)</span> บย.<span class="fl fl-m"></span></div>
</div>

<div class="line">
  <span>หน่วยงาน<span class="fl fl-xl"></span></span>
  <span>โทร/ต่อ<span class="fl fl-s"></span></span>
</div>
<div class="line">
  <span>วันที่<span class="fl fl-m"></span></span>
  <span>เวลา<span class="fl fl-s"></span>น.</span>
  <span>เวร <span class="bx"></span>เช้า 08–16 &nbsp;<span class="bx"></span>บ่าย 16–24 &nbsp;<span class="bx"></span>ดึก 24–08</span>
</div>

<div class="tbl-wrap">
<table>
  <colgroup><col style="width:5%"><col style="width:33%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:14%"><col style="width:12%"></colgroup>
  <thead>
    <tr><th rowspan="2">ที่</th><th rowspan="2">ชื่อยา / เวชภัณฑ์<small>รูปแบบ ความแรง ขนาด</small></th><th rowspan="2">คงเหลือ<br/>ที่หน่วยงาน<small>จำนวน × หน่วย</small></th>
      <th colspan="2">จำนวน (ระบุหน่วย)</th><th colspan="2">คลังยากรอก</th></tr>
    <tr><th>ขอเบิก</th><th>จ่ายจริง</th><th>Lot / EXP</th><th>หมายเหตุ</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</div>

<div class="box"><b class="t">เหตุผลที่ขอเบิกนอกรอบ</b>
  <span class="bx"></span>ลืมเบิกตามรอบ &nbsp; <span class="bx"></span>ใช้เกินคาด &nbsp; <span class="bx"></span>ผู้ป่วยฉุกเฉินจำนวนมาก &nbsp; <span class="bx"></span>อื่นๆ<span class="fl fl-l"></span><br/>
  ยาที่มีอยู่คาดว่าพอใช้ถึงวันที่<span class="fl fl-m"></span>เวลา<span class="fl fl-s"></span>น.
</div>

<div class="box"><b class="t">ใครจ่ายยา (เลือก 1 ช่อง)</b>
  <span class="bx"></span><b>คลังยาจ่าย</b> — ตัดยอดคลัง &nbsp;&nbsp;
  <span class="bx"></span><b>ห้องยาจ่ายแทน</b> — <u>ไม่ตัดยอดคลัง</u> คลังบันทึกไว้เป็นหลักฐานเท่านั้น
</div>

<div class="sign">
  <div class="sign-h"><span>ลงนาม — ทุกช่องอยู่ตรงนี้ เรียงตามขั้นตอน</span><span class="legend"><span class="tag">หน่วยงาน</span> เซ็น ① ② ④ · <span class="tag">คลังยา / ห้องยา</span> เซ็น ③ ⑤</span></div>
  <table>
    <colgroup><col style="width:5%"><col style="width:25%"><col style="width:28%"><col style="width:18%"><col style="width:15%"><col style="width:9%"></colgroup>
    <tr><th>ขั้น</th><th>ใครเซ็น</th><th>เซ็นเพื่อยืนยันว่า</th><th>ลายมือชื่อ</th><th>ชื่อตัวบรรจง</th><th>วันที่</th></tr>
    ${sign}
  </table>
</div>

<div class="box" style="margin-top:6px;"><b class="t">คลังยาบันทึก</b>
  <span class="bx"></span>ลงชีทเบิกแล้ว &nbsp; <span class="bx"></span>แนบใบเบิกประจำรอบวันที่<span class="fl fl-m"></span> &nbsp; หมายเหตุ<span class="fl fl-l"></span>
</div>

<p class="foot">ใบเบิกนอกเวลา · ฉบับปรับปรุง ${REVISION} · เก็บที่คลังยา 1 ฉบับ / หน่วยงาน 1 ฉบับ</p>
${withPrintButton ? `<script>document.getElementById('btnPrint').addEventListener('click', function(){ window.print(); });</script>` : ''}
</body></html>`;
}

export function printAfterHoursForm() {
  openPrintView(buildAfterHoursFormHtml());
}
