// ฟอร์มตรวจรับยา (เปล่า) — พิมพ์ให้กรรมการตรวจรับกรอกมือขณะตรวจของจริง ไม่ดึงข้อมูลจากระบบ
// (กรรมการเลือกเองว่าจะตรวจอะไร ดูจากบิล+PO ก่อนมาตรวจ คลังไม่รู้ล่วงหน้า) — ดู CONTEXT.md "ฟอร์มตรวจรับ"
// UI helper: build HTML + window.open (Blob URL, iOS-safe) — ไม่ใช่ pure module (มี window.open)
const HOSPITAL_NAME = 'โรงพยาบาลประชาธิปัตย์';

function todayThaiDate() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear() + 543}`;
}

export function printInspectWorksheet() {
  const ROW_COUNT = 12;
  const emptyRows = Array.from({ length: ROW_COUNT }, (_, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td></td>
      <td></td>
      <td class="c"></td>
      <td></td>
      <td class="c"></td>
      <td class="c"></td>
      <td></td>
      <td class="c"></td>
      <td class="c"><span class="bx"></span></td>
      <td class="c"><span class="bx"></span></td>
      <td></td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ฟอร์มตรวจรับยา</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #1e293b; background: #fff; padding: 14px 24px 16px; }
  @page { size: A4 landscape; margin: 8mm; }
  .h-row { text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 6px; margin-bottom: 10px; }
  h1 { font-size: 19px; font-weight: 700; color: #1e293b; }
  .sub { font-size: 12px; color: #334155; font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 10px; page-break-inside: avoid; }
  th { background: #f1f5f9; color: #1e293b; font-weight: 700; padding: 5px 6px; text-align: center;
    border: 1px solid #000; }
  td { padding: 4px 8px; border: 1px solid #94a3b8; height: 36px; vertical-align: middle; }
  td.c { text-align: center; }
  .bx { display: inline-block; width: 13px; height: 13px; border: 1px solid #475569; vertical-align: middle; }
  .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 12px; page-break-inside: avoid; }
  .sig-box { padding: 8px 16px; text-align: center; }
  .sig-title { font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 28px; }
  .sig-line { border-bottom: 1px solid #94a3b8; }
  .sig-label { font-size: 11px; color: #64748b; margin-top: 4px; }
  .sig-date { font-size: 11px; color: #64748b; margin-top: 6px; }
  .sig-date span { display: inline-block; border-bottom: 1px dotted #94a3b8; min-width: 120px; margin-left: 6px; }
  .foot { font-size: 10px; color: #94a3b8; text-align: right; margin-top: 8px; }
  .tbl-wrap { width: 100%; }
  @media print {
    button { display: none !important; }
    thead { display: table-header-group; }
    .tbl-wrap { overflow: visible; }
  }
  /* บนมือถือ: ปล่อยให้ตารางคงขนาดอ่านได้แล้วเลื่อนแนวนอน แทนการบีบจนตัวเล็ก */
  @media screen and (max-width: 768px) {
    body { padding: 12px; }
    .tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    table { min-width: 760px; }
  }
</style>
</head><body>
<button id="btnPrint" type="button" style="position:fixed;top:14px;right:14px;background:#047857;color:#fff;border:none;
  padding:8px 18px;border-radius:8px;font-family:Sarabun,sans-serif;font-size:13px;cursor:pointer;font-weight:600;z-index:9999;">
  พิมพ์
</button>

<div class="h-row">
  <h1>${HOSPITAL_NAME}</h1>
  <p class="sub">ใบตรวจรับยา / เวชภัณฑ์</p>
</div>

<div class="tbl-wrap">
<table>
  <thead>
  <tr>
    <th style="width:4%;" rowspan="2">ลำดับ</th>
    <th style="width:19%;" rowspan="2">ชื่อยา</th>
    <th style="width:12%;" rowspan="2">บริษัท/ผู้ขาย</th>
    <th style="width:8%;" rowspan="2">เลขบิล/PO</th>
    <th style="width:6%;" rowspan="2">จำนวนสั่ง</th>
    <th style="width:6%;" rowspan="2">จำนวนรับจริง</th>
    <th style="width:13%;" rowspan="2">LOT.NO</th>
    <th style="width:7%;" rowspan="2">EXP.</th>
    <th style="width:8%;" rowspan="2">วันที่ตรวจรับ</th>
    <th colspan="2">ตรงตามเอกสาร</th>
    <th rowspan="2">หมายเหตุ</th>
  </tr>
  <tr>
    <th style="width:4%;">ถูก</th>
    <th style="width:4%;">ไม่ถูก</th>
  </tr>
  </thead>
  <tbody>${emptyRows}</tbody>
</table>
</div>

<div class="sig-row">
  <div class="sig-box">
    <p class="sig-title">กรรมการตรวจรับ</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ ผู้ตรวจรับ</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
  <div class="sig-box">
    <p class="sig-title">ผู้ส่งมอบ (เจ้าหน้าที่คลัง)</p>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ ผู้ส่งมอบ</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
</div>

<p class="foot">พิมพ์เมื่อ ${todayThaiDate()}</p>
<script>document.getElementById('btnPrint').addEventListener('click', function(){ window.print(); });</script>
</body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) setTimeout(() => URL.revokeObjectURL(url), 30000);
  else     URL.revokeObjectURL(url);
}
