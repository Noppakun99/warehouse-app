// แบบฟอร์มคืนยา (เปล่า) — พิมพ์ให้กรอกมือ ไม่ดึงข้อมูลจากระบบ — ดู CONTEXT.md §Return
//   printReturnForm()          = คืนภายใน รพ. (ward/or/er/opd) — portrait
//   printVendorExchangeForm()  = เปลี่ยน/คืนยาใกล้หมดอายุกับบริษัท (vendor) — landscape
// UI helper: build HTML + window.open (Blob URL, iOS-safe) — ไม่ใช่ pure module (มี window.open)
const HOSPITAL_NAME = 'โรงพยาบาลประชาธิปัตย์';

function todayThaiDate() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear() + 543}`;
}

// เปิด print view ผ่าน Blob URL + fallback <a> click (in-app WebView LINE/FB บล็อก window.open) — Critical Rule #4
function openPrintView(html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) { setTimeout(() => URL.revokeObjectURL(url), 30000); return; }
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ── ฟอร์ม 1: คืนยาภายใน รพ. (portrait) ──────────────────────────────
export function printReturnForm() {
  const ROW_COUNT = 14;
  const emptyRows = Array.from({ length: ROW_COUNT }, (_, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td></td>
      <td></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>
      <td></td>
      <td></td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>แบบฟอร์มคืนยา</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #1e293b; background: #fff; padding: 16px 28px 18px; }
  @page { size: A4 portrait; margin: 12mm; }
  .h-row { text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 6px; margin-bottom: 10px; }
  h1 { font-size: 19px; font-weight: 700; color: #1e293b; }
  .sub { font-size: 12px; color: #334155; font-weight: 600; margin-top: 2px; }
  .meta { display: flex; justify-content: space-between; gap: 16px; font-size: 12px; color: #334155; margin-bottom: 10px; }
  .meta span { display: inline-block; border-bottom: 1px dotted #94a3b8; min-width: 120px; margin-left: 6px; }
  .legend { font-size: 10px; color: #64748b; margin-bottom: 8px; line-height: 1.5; }
  .legend b { color: #334155; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 10px; page-break-inside: avoid; }
  th { background: #f1f5f9; color: #1e293b; font-weight: 700; padding: 5px 6px; text-align: center; border: 1px solid #000; }
  td { padding: 4px 8px; border: 1px solid #94a3b8; height: 34px; vertical-align: middle; }
  td.c { text-align: center; }
  .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 14px; page-break-inside: avoid; }
  .sig-box { padding: 8px 16px; text-align: center; }
  .sig-title { font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 28px; }
  .sig-line { border-bottom: 1px solid #94a3b8; }
  .sig-label { font-size: 11px; color: #64748b; margin-top: 4px; }
  .sig-date { font-size: 11px; color: #64748b; margin-top: 6px; }
  .sig-date span { display: inline-block; border-bottom: 1px dotted #94a3b8; min-width: 110px; margin-left: 6px; }
  .foot { font-size: 10px; color: #94a3b8; text-align: right; margin-top: 8px; }
  @media print { button { display: none !important; } thead { display: table-header-group; } }
</style>
</head><body>
<button id="btnPrint" type="button" style="position:fixed;top:14px;right:14px;background:#7c3aed;color:#fff;border:none;
  padding:8px 18px;border-radius:8px;font-family:Sarabun,sans-serif;font-size:13px;cursor:pointer;font-weight:600;z-index:9999;">
  พิมพ์
</button>

<div class="h-row">
  <h1>${HOSPITAL_NAME}</h1>
  <p class="sub">แบบฟอร์มคืนยา / บันทึกยาเสียหาย (ภายในโรงพยาบาล)</p>
</div>

<div class="meta">
  <div>หน่วยงานที่คืน <span></span></div>
  <div>วันที่คืน <span></span></div>
</div>

<table>
  <thead>
  <tr>
    <th style="width:5%;">ลำดับ</th>
    <th style="width:28%;">ชื่อยา</th>
    <th style="width:14%;">LOT.NO</th>
    <th style="width:9%;">EXP.</th>
    <th style="width:8%;">จำนวน</th>
    <th style="width:8%;">หน่วย</th>
    <th style="width:14%;">สาเหตุการคืน</th>
    <th style="width:14%;">หมายเหตุ</th>
  </tr>
  </thead>
  <tbody>${emptyRows}</tbody>
</table>

<p class="legend">
  <b>แหล่งที่คืน:</b> หน่วยงาน/Ward · ห้องผ่าตัด · ห้องฉุกเฉิน · OPD คลินิก &nbsp;&nbsp;
  <b>สาเหตุ:</b> ยาเหลือจากการใช้ · เบิกเกินจำนวน · ยาผิดชนิด/ขนาด · ยาเสียหาย/แตกหัก · ยาหมดอายุ
</p>

<div class="sig-row">
  <div class="sig-box">
    <p class="sig-title">ผู้คืนยา</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ ผู้คืนยา</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
  <div class="sig-box">
    <p class="sig-title">ผู้รับคืน (เจ้าหน้าที่คลัง)</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ ผู้รับคืน</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
</div>

<p class="foot">พิมพ์เมื่อ ${todayThaiDate()}</p>
<script>document.getElementById('btnPrint').addEventListener('click', function(){ window.print(); });</script>
</body></html>`;
  openPrintView(html);
}

// ── ฟอร์ม 2: เปลี่ยน/คืนยาใกล้หมดอายุกับบริษัท (landscape) ──────────
export function printVendorExchangeForm() {
  const ROW_COUNT = 12;
  const emptyRows = Array.from({ length: ROW_COUNT }, (_, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td></td>
      <td></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>
      <td class="c"></td>
      <td></td>
      <td></td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>แบบฟอร์มคืนยาใกล้หมดอายุ (เปลี่ยนกับบริษัท)</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #1e293b; background: #fff; padding: 14px 24px 16px; }
  @page { size: A4 landscape; margin: 8mm; }
  .h-row { text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 6px; margin-bottom: 10px; }
  h1 { font-size: 19px; font-weight: 700; color: #1e293b; }
  .sub { font-size: 12px; color: #334155; font-weight: 600; margin-top: 2px; }
  .meta { display: flex; justify-content: space-between; gap: 16px; font-size: 12px; color: #334155; margin-bottom: 10px; }
  .meta span { display: inline-block; border-bottom: 1px dotted #94a3b8; min-width: 160px; margin-left: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 10px; page-break-inside: avoid; }
  th { background: #f1f5f9; color: #1e293b; font-weight: 700; padding: 5px 6px; text-align: center; border: 1px solid #000; }
  td { padding: 4px 8px; border: 1px solid #94a3b8; height: 36px; vertical-align: middle; }
  td.c { text-align: center; }
  .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 12px; page-break-inside: avoid; }
  .sig-box { padding: 8px 16px; text-align: center; }
  .sig-title { font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 28px; }
  .sig-line { border-bottom: 1px solid #94a3b8; }
  .sig-label { font-size: 11px; color: #64748b; margin-top: 4px; }
  .sig-date { font-size: 11px; color: #64748b; margin-top: 6px; }
  .sig-date span { display: inline-block; border-bottom: 1px dotted #94a3b8; min-width: 120px; margin-left: 6px; }
  .foot { font-size: 10px; color: #94a3b8; text-align: right; margin-top: 8px; }
  .tbl-wrap { width: 100%; }
  @media print { button { display: none !important; } thead { display: table-header-group; } .tbl-wrap { overflow: visible; } }
  @media screen and (max-width: 768px) {
    body { padding: 12px; }
    .tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    table { min-width: 900px; }
  }
</style>
</head><body>
<button id="btnPrint" type="button" style="position:fixed;top:14px;right:14px;background:#ea580c;color:#fff;border:none;
  padding:8px 18px;border-radius:8px;font-family:Sarabun,sans-serif;font-size:13px;cursor:pointer;font-weight:600;z-index:9999;">
  พิมพ์
</button>

<div class="h-row">
  <h1>${HOSPITAL_NAME}</h1>
  <p class="sub">แบบฟอร์มคืน / เปลี่ยนยาใกล้หมดอายุ กับบริษัท</p>
</div>

<div class="meta">
  <div>บริษัท / ผู้ขาย <span></span></div>
  <div>วันที่แจ้งเปลี่ยน <span></span></div>
</div>

<div class="tbl-wrap">
<table>
  <thead>
  <tr>
    <th style="width:4%;">ลำดับ</th>
    <th style="width:24%;">ชื่อยา</th>
    <th style="width:15%;">LOT.NO</th>
    <th style="width:8%;">EXP.</th>
    <th style="width:8%;">จำนวนขอเปลี่ยน</th>
    <th style="width:7%;">หน่วย</th>
    <th style="width:10%;">deadline เปลี่ยน</th>
    <th style="width:12%;">นโยบายบริษัท</th>
    <th style="width:12%;">หมายเหตุ</th>
  </tr>
  </thead>
  <tbody>${emptyRows}</tbody>
</table>
</div>

<div class="sig-row">
  <div class="sig-box">
    <p class="sig-title">เจ้าหน้าที่คลัง (ผู้ส่งคืน)</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ เจ้าหน้าที่คลัง</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
  <div class="sig-box">
    <p class="sig-title">ผู้แทนบริษัท (ผู้รับคืน)</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ ผู้แทนบริษัท</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
</div>

<p class="foot">พิมพ์เมื่อ ${todayThaiDate()}</p>
<script>document.getElementById('btnPrint').addEventListener('click', function(){ window.print(); });</script>
</body></html>`;
  openPrintView(html);
}
