// แม่แบบใบยืมยา / ใบคืนยา + ตัวกรอกข้อมูลลงใบ (pure — ไม่ import supabase/DOM → node รันได้)
//   loanOutHtml() / loanReturnHtml() = ใบเปล่า (เมนูแบบฟอร์ม — drugLoanForm.js เปิดหน้าพิมพ์)
//   fillLoanSlip(job)                = ใบที่กรอกแล้ว { html, total } — ใช้ร่วม 2 ทาง:
//     แอป (ใบแจ้งยืม/ใบแจ้งรับคืน — DrugLoanSlipModal.jsx) และ scripts/loan-slip.mjs (PDF + คิวพิมพ์)
//   job = รูปแบบเดียวกับ job.json ของ loan-slip.mjs (ดูหัวไฟล์สคริปต์) — ห้ามแยกเป็น 2 ชุด
// ที่มาของฟอร์ม (ระเบียบพัสดุ ข้อ 210–211) ดูหัวไฟล์ drugLoanForm.js
// ตัวกรองหาตำแหน่งในใบด้วย string → แก้แม่แบบแล้ว fillLoanSlip โยน error บอกจุดที่หาไม่เจอ (ไม่กรอกผิดที่เงียบๆ)

const HOSPITAL_NAME = 'โรงพยาบาลประชาธิปัตย์';

function todayThaiDate() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear() + 543}`;
}

// ประเภทคู่สัญญา — มาจากข้อมูลจริงในไฟล์ยืมยา (40/42 เป็นโรงพยาบาล ที่เหลือ สถาบัน + บริษัท)
const PARTY_TYPES = ['โรงพยาบาล', 'บริษัทยา', 'อื่นๆ (ระบุ)'];

// ขาวดำล้วน (เครื่องพิมพ์ไม่มีสี) — ชุดเดียวกับ vendorExchangeCycle.js / expiryDispositionForm.js
// ความสูงแถวรายการต่อใบ — ตั้งให้แต่ละใบเต็ม A4 หน้าเดียวพอดี (ใบที่ใช้ SHARED_CSS ร่วมกันมีเนื้อหาสูงไม่เท่ากัน)
const LOAN_OUT_ROW_H = 24;
const LOAN_RETURN_ROW_H = 31;

const SHARED_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #000; background: #fff; padding: 8px 18px 10px; }
  @page { size: A4 portrait; margin: 10mm; }
  .h-row { text-align: center; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
  h1 { font-size: 19px; font-weight: 700; color: #000; }
  .sub { font-size: 13px; color: #000; font-weight: 700; margin-top: 2px; }
  .legal { font-size: 10.5px; font-weight: 400; margin-top: 2px; }
  .refbox { border: 2px solid #000; padding: 4px 8px; margin-bottom: 5px; display: flex;
    justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; }
  .refbox .num { font-size: 15px; letter-spacing: 1px; }
  .refbox span.fill { display: inline-block; border-bottom: 1px solid #000; min-width: 92px; margin-left: 5px;
    height: 19px; vertical-align: bottom; }
  .meta { display: flex; flex-wrap: wrap; gap: 2px 14px; font-size: 12px; color: #000; margin-bottom: 5px; }
  .meta span { display: inline-block; border-bottom: 1px dotted #000; min-width: 120px; margin-left: 5px;
    height: 17px; vertical-align: bottom; }
  /* ช่องเว้นให้เขียนมือ — ต้อง align bottom + มีความสูง ไม่งั้นเส้นลอยไปกลางบรรทัด (ดูเหมือนขีดฆ่า) */
  .fl { display: inline-block; border-bottom: 1px solid #000; height: 17px; vertical-align: bottom;
    margin: 0 3px; min-width: 60px; }
  .fl-s { min-width: 46px; }
  .fl-m { min-width: 88px; }
  .fl-l { min-width: 135px; }
  .fl-xl { min-width: 200px; }
  .box { border: 1px solid #000; padding: 4px 8px; margin-bottom: 5px; font-size: 12px; }
  .box ul { list-style: none; display: flex; flex-wrap: wrap; gap: 3px 14px; margin-top: 3px; }
  /* baseline ไม่ใช่ center — ไม่งั้น .fl ถูกดันขึ้นไปกลางบรรทัด */
  .box li { display: flex; align-items: baseline; gap: 4px; }
  .box li .bx { align-self: center; }
  .box ul.stack { flex-direction: column; gap: 4px; }
  .box ul.stack li { width: 100%; flex-wrap: wrap; }
  .bx { display: inline-block; width: 14px; height: 14px; border: 1px solid #000; vertical-align: middle; flex: none; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-bottom: 5px; page-break-inside: avoid;
    table-layout: fixed; }
  th { background: #fff; color: #000; font-weight: 700; padding: 3px 2px; text-align: center; border: 1px solid #000;
    word-wrap: break-word; }
  td { padding: 2px 3px; border: 1px solid #000; height: 26px; vertical-align: middle; word-wrap: break-word; }
  td.c { text-align: center; }
  .note-line { font-size: 12px; margin-bottom: 7px; }
  .note-line span { display: inline-block; border-bottom: 1px dotted #000; min-width: 74%; margin-left: 5px;
    height: 18px; vertical-align: bottom; }
  /* กล่องลงนาม — ทุกช่องเซ็นอยู่ที่เดียว เรียงตามขั้นตอน แต่ละแถวบอกฝ่าย + เซ็นยืนยันอะไร */
  .sign { border: 2px solid #000; margin-top: 6px; page-break-inside: avoid; }
  .sign-h { display: flex; justify-content: space-between; gap: 8px; padding: 3px 8px; border-bottom: 2px solid #000;
    font-size: 12px; font-weight: 700; }
  .sign-h .legend { font-weight: 400; font-size: 11px; }
  .sign table { margin: 0; page-break-inside: avoid; }
  .sign th { font-size: 11px; }
  .sign td { height: 40px; font-size: 11.5px; }
  .sign td.step { text-align: center; font-size: 17px; font-weight: 700; }
  .sign td.who { font-weight: 700; line-height: 1.3; }
  .sign td.who small { display: block; font-weight: 400; font-size: 10.5px; }
  .sign td.what { line-height: 1.3; }
  .tag { display: inline-block; border: 1px solid #000; padding: 0 4px; font-size: 10.5px; font-weight: 700; }
  .pp { white-space: nowrap; font-weight: 400; font-size: 10.5px; margin-right: 6px; }
  .foot { font-size: 10px; color: #000; text-align: right; margin-top: 4px; }
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

// ประเภทคู่สัญญา — ใช้ทั้ง 2 ใบ ให้ติ๊กตรงกัน
const partyBox = () => `
<div class="box">
  <b>ประเภทคู่สัญญา</b>
  <ul>
    ${PARTY_TYPES.map((t) => `<li><span class="bx"></span> ${t}${t.includes('ระบุ') ? '<span class="fl fl-l"></span>' : ''}</li>`).join('')}
  </ul>
</div>`;

// ── กล่องลงนาม (ใช้ทั้ง 2 ใบ) ─────────────────────────────────────────
// ใบเปล่าไม่รู้ทิศทาง → แถวผู้ส่ง/ผู้รับให้ติ๊กฝ่ายเอง (data-p ให้ loan-slip.mjs ติ๊กแทนตามทิศทาง)
// ผู้นำส่ง (คนกลาง) — เคส Amoxi-Clav ผู้แทนบริษัทนำของไปคืน รพ.อื่นแทนเรา: ต้องมีลายเซ็นคนที่ถือของระหว่างทาง
const HOSPITAL_SHORT = 'รพ.ประชาธิปัตย์';
const partyPick = (key) =>
  `<br/><span class="pp"><span class="bx" data-p="${key}-us"></span> ${HOSPITAL_SHORT}</span>` +
  `<span class="pp"><span class="bx" data-p="${key}-them"></span> คู่สัญญา</span>`;

const COURIER_ROW = {
  who: 'ผู้นำส่ง (คนกลาง)<small>ถ้ามี เช่น ผู้แทนบริษัท · ชื่อ/หน่วยงาน <span class="fl fl-m" data-courier></span></small>',
  what: 'รับยาจาก ① ไปส่งถึงผู้รับครบ (ไม่มีคนกลาง เว้นว่าง)',
};

const signBox = (rows) => `
<div class="sign">
  <div class="sign-h"><span>ลงนาม — เรียงตามขั้นตอน</span><span class="legend">ติ๊กฝ่ายของผู้ส่ง/ผู้รับให้ตรงกับทิศทางข้างบน</span></div>
  <table>
    <colgroup><col style="width:5%"><col style="width:26%"><col style="width:26%"><col style="width:19%"><col style="width:15%"><col style="width:9%"></colgroup>
    <tr><th>ขั้น</th><th>ใครเซ็น</th><th>เซ็นเพื่อยืนยันว่า</th><th>ลายมือชื่อ</th><th>ชื่อตัวบรรจง</th><th>วันที่</th></tr>
    ${rows.map((r, i) => `<tr><td class="step">${'①②③④⑤'[i]}</td><td class="who">${r.who}</td><td class="what">${r.what}</td><td></td><td></td><td></td></tr>`).join('')}
  </table>
</div>`;

// ── ใบที่ 1: ใบยืมยา ────────────────────────────────────────────────
// ทิศทางติ๊กบนใบเดียว เพราะกระดาษใบเดียวใช้ได้ทั้ง 2 ทาง (ยืมเขา/ให้เขายืม)
// ต่างจากรอบเปลี่ยนคืนบริษัทที่ทิศทางตายตัวเสมอ
export function loanOutHtml() {
  const ROW_COUNT = 6;
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
<title>ใบยืมยา</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>${SHARED_CSS}  td { height: ${LOAN_OUT_ROW_H}px; }</style>
</head><body>
${printBtn()}

<div class="h-row">
  <h1>${HOSPITAL_NAME}</h1>
  <p class="sub">ใบยืมยา / เวชภัณฑ์ ระหว่างหน่วยงาน</p>
  <p class="legal">ตามระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560 ข้อ 210–211 (การยืมพัสดุประเภทใช้สิ้นเปลืองระหว่างหน่วยงานของรัฐ)</p>
</div>

<div class="refbox">
  <div>เลขที่ใบยืม <span class="num">LN -</span><span class="fill"></span></div>
  <div>วันที่ยืม <span class="fill"></span></div>
</div>

<div class="box">
  <b>ทิศทางการยืม</b>
  <ul>
    <li><span class="bx"></span> <b>เรายืมจากเขา</b> — ของเข้าคลัง <u>เราต้องคืน</u></li>
    <li><span class="bx"></span> <b>เราให้เขายืม</b> — ของออกจากคลัง <u>เรารอรับคืน</u></li>
  </ul>
</div>

<div class="meta">
  <div>ชื่อหน่วยงานคู่สัญญา <span style="min-width:230px;"></span></div>
  <div>ผู้ประสานงาน <span style="min-width:130px;"></span></div>
  <div>เบอร์ติดต่อ <span style="min-width:100px;"></span></div>
</div>

${partyBox()}

<div class="box">
  <b>เหตุผลที่ยืม</b> <span style="font-weight:400;">(ระเบียบฯ ข้อ 210 ยืมได้เมื่อจำเป็นต้องใช้รีบด่วน จัดหาไม่ทัน)</span>
  <ul class="stack">
    <li><span class="bx"></span> ยาขาดคลัง ผู้ป่วยต้องใช้ก่อน — รอของที่สั่งซื้อ</li>
    <li><span class="bx"></span> ยาใช้เร่งด่วน/ฉุกเฉิน ไม่มีสำรอง</li>
    <li><span class="bx"></span> ช่วยเหลือหน่วยงานอื่นที่ขาดยา</li>
    <li><span class="bx"></span> อื่นๆ <span class="fl fl-xl"></span></li>
  </ul>
</div>

<div class="box">
  <b>กำหนดการส่งคืน</b> <span style="font-weight:400;">(ระเบียบฯ ข้อ 211 ผู้ให้ยืมทวงคืนภายใน 7 วันนับแต่วันครบกำหนด)</span>
  <ul class="stack">
    <li><span class="bx"></span> <b>คืนเมื่อของที่สั่งซื้อมาถึง</b> — เลขที่ PO / ใบสั่งซื้อ <span class="fl fl-l"></span>
      คาดว่าของถึงประมาณ <span class="fl fl-m"></span></li>
    <li><span class="bx"></span> คืนภายในวันที่ <span class="fl fl-m"></span></li>
    <li><span class="bx"></span> อื่นๆ <span class="fl fl-xl"></span></li>
  </ul>
</div>

<div class="box">
  <b>ใครรับผิดชอบการคืน</b> <span style="font-weight:400;">(ระบุให้ชัด — คลังตามคืนได้เฉพาะของที่ตัวเองถืออยู่)</span>
  <ul class="stack">
    <li><span class="bx"></span> <b>ของอยู่ที่คลัง — คลังคืนเอง</b> <span style="font-weight:400;">(คลังตามจนกว่าจะคืนครบ)</span></li>
    <li><span class="bx"></span> <b>ส่งต่อให้ผู้ดูแลรับผิดชอบ</b> — ชื่อผู้ดูแล / หน่วยงาน <span class="fl fl-l"></span>
      วันที่ส่งต่อ <span class="fl fl-m"></span><br/>
      <span style="font-weight:400;">คลัง<u>ปิดรายการเมื่อส่งมอบ</u> ไม่นับเป็นของค้างคืน — ผู้ดูแลเป็นผู้คืนและแจ้งกลับให้คลังบันทึก (ADR-0025)</span></li>
  </ul>
</div>

<div class="tbl-wrap">
<table>
  <thead>
  <tr>
    <th style="width:4%;">ลำดับ</th>
    <th style="width:25%;">ชื่อยา</th>
    <th style="width:12%;">LOT.NO</th>
    <th style="width:9%;">EXP.</th>
    <th style="width:8%;">จำนวน</th>
    <th style="width:8%;">หน่วย</th>
    <th style="width:10%;">ราคา/หน่วย<br/>(บาท)</th>
    <th style="width:11%;">มูลค่ารวม<br/>(บาท)</th>
    <th style="width:13%;">หมายเหตุ</th>
  </tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr>
      <td colspan="7" style="text-align:right;font-weight:700;">รวมมูลค่าที่ยืม (บาท)</td>
      <td class="c"></td>
      <td></td>
    </tr>
  </tfoot>
</table>
</div>

${signBox([
  { who: `ผู้ส่งมอบยา${partyPick('s')}`, what: 'ส่งมอบยาตามรายการข้างบนครบ' },
  COURIER_ROW,
  { who: `ผู้รับยา${partyPick('r')}`, what: 'ได้รับยาครบ · ฝ่ายผู้ยืมรับว่าจะคืนตามกำหนด' },
  { who: `หัวหน้าคลังยา (ผู้อนุมัติ)<br/><span class="tag">${HOSPITAL_SHORT}</span>`, what: 'อนุมัติการยืม / ให้ยืมครั้งนี้' },
])}

<p class="foot">เก็บใบนี้ไว้จนกว่าจะคืนครบ — ใบคืนต้องอ้างเลขที่ใบยืมเดียวกัน · บันทึกเข้าระบบที่เมนู "ยืม-คืนยาระหว่าง รพ." · พิมพ์เมื่อ ${todayThaiDate()}</p>
${printScript()}
</body></html>`;
  return html;
}

// ── ใบที่ 2: ใบคืนยา ────────────────────────────────────────────────
// lot ที่คืนอาจไม่ใช่ lot เดิม (ยืมไปใช้แล้ว คืนด้วยของล็อตใหม่ที่ซื้อมา) จึงแยก 2 คอลัมน์
export function loanReturnHtml() {
  const ROW_COUNT = 6;
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
<title>ใบคืนยา (ตามใบยืม)</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>${SHARED_CSS}  td { height: ${LOAN_RETURN_ROW_H}px; }</style>
</head><body>
${printBtn()}

<div class="h-row">
  <h1>${HOSPITAL_NAME}</h1>
  <p class="sub">ใบคืนยา / เวชภัณฑ์ ระหว่างหน่วยงาน</p>
  <p class="legal">ปิดรายการยืมตามระเบียบกระทรวงการคลังฯ พ.ศ. 2560 ข้อ 210 (คืนพัสดุประเภท ชนิด และปริมาณเช่นเดียวกัน)</p>
</div>

<div class="refbox">
  <div>อ้างถึงใบยืมเลขที่ <span class="num">LN -</span><span class="fill"></span></div>
  <div>วันที่คืน <span class="fill"></span></div>
</div>

<div class="box">
  <b>ทิศทางการคืน</b>
  <ul>
    <li><span class="bx"></span> <b>เราคืนให้เขา</b> — ของออกจากคลัง (เดิมเรายืมมา)</li>
    <li><span class="bx"></span> <b>เขาคืนให้เรา</b> — ของเข้าคลัง (เดิมเราให้ยืม)</li>
  </ul>
</div>

<div class="meta">
  <div>ชื่อหน่วยงานคู่สัญญา <span style="min-width:230px;"></span></div>
  <div>ผู้ประสานงาน <span style="min-width:130px;"></span></div>
  <div>วันที่ยืมเดิม <span style="min-width:100px;"></span></div>
</div>

${partyBox()}

<div class="box">
  <b>ผลการคืน</b>
  <ul class="stack">
    <li><span class="bx"></span> <b>คืนครบตามใบยืม — ปิดรายการ</b></li>
    <li><span class="bx"></span> คืนบางส่วน — ยังค้างอีก <span class="fl fl-s"></span> รายการ (ต้องออกใบคืนอีกครั้ง)</li>
    <li><span class="bx"></span> คืนด้วย <b>lot อื่น</b> แทนของเดิม (กรอกคอลัมน์ "LOT ที่คืนจริง")</li>
    <li><span class="bx"></span> ตกลงไม่คืนเป็นของ — ชดเชยเป็น <span class="fl fl-l"></span></li>
  </ul>
  <div style="border-top:1px solid #000;margin-top:5px;padding-top:4px;">
    <b>ใครเป็นผู้คืน</b>
    <ul class="stack">
      <li><span class="bx"></span> <b>คลังคืนเอง</b> — ของออกจากคลังวันที่คืน</li>
      <li><span class="bx"></span> <b>ผู้ดูแลคืนเอง ไม่ผ่านคลัง</b> — ชื่อผู้ดูแล <span class="fl fl-l"></span>
        แจ้งคลังเมื่อ <span class="fl fl-m"></span><br/>
        <span style="font-weight:400;">ใบนี้เป็น<u>การบันทึกตามที่ผู้ดูแลแจ้ง</u> ไม่ใช่หลักฐานการส่งมอบ — วันที่คืนจริงตามที่ผู้ดูแลระบุ</span></li>
    </ul>
  </div>
</div>

<div class="tbl-wrap">
<table>
  <thead>
  <tr>
    <th style="width:4%;">ลำดับ</th>
    <th style="width:24%;">ชื่อยา</th>
    <th style="width:12%;">LOT ที่ยืมไป</th>
    <th style="width:12%;">LOT ที่คืนจริง</th>
    <th style="width:9%;">EXP.</th>
    <th style="width:8%;">จำนวน<br/>ที่คืน</th>
    <th style="width:8%;">หน่วย</th>
    <th style="width:10%;">มูลค่ารวม<br/>(บาท)</th>
    <th style="width:13%;">หมายเหตุ</th>
  </tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr>
      <td colspan="7" style="text-align:right;font-weight:700;">รวมมูลค่าที่คืน (บาท)</td>
      <td class="c"></td>
      <td></td>
    </tr>
  </tfoot>
</table>
</div>

<p class="note-line">หมายเหตุเพิ่มเติม <span></span></p>

<p style="font-size:10px;margin-bottom:6px;">
  <b>ถ้าคืนด้วย lot อื่น</b> — กรอก "LOT ที่คืนจริง" ตามของที่ส่งคืน แล้วระบุในหมายเหตุว่าแทน lot ใด ·
  <b>คืนไม่ครบ</b> ให้เขียนตามที่คืนจริง ส่วนที่เหลือยังค้างอยู่ในใบยืมเดิม <u>ห้ามปิดใบ</u>
</p>

${signBox([
  { who: `ผู้ส่งคืน${partyPick('s')}`, what: 'ส่งคืนตามรายการข้างบน (lot ที่คืนจริง)' },
  COURIER_ROW,
  { who: `ผู้รับคืน${partyPick('r')}`, what: 'ได้รับคืนครบ ปิดรายการยืมนี้' },
  { who: `หัวหน้าคลังยา<br/><span class="tag">${HOSPITAL_SHORT}</span><small>เซ็นภายหลังได้</small>`, what: 'รับทราบการปิดรายการ (ยอดลูกหนี้/เจ้าหนี้ยืม)' },
])}

<p class="foot">บันทึกเข้าระบบ: เมนู "ยืม-คืนยาระหว่าง รพ." → ปุ่มรับคืน/คืนยา ของรายการเดิม (ออกใบแจ้งรับคืน) · พิมพ์เมื่อ ${todayThaiDate()}</p>
${printScript()}
</body></html>`;
  return html;
}

// ── กรอกข้อมูลลงใบ (ย้ายจาก scripts/loan-slip.mjs build() 10/11/2569) ──────────

// บาทเป็นตัวอักษร (ชุดเดียวกับ bill_handover.py)
const DIG = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const POS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
function readNum(n) {
  if (n >= 1e6) return readNum(Math.floor(n / 1e6)) + 'ล้าน' + readNum(n % 1e6);
  const s = String(n); let out = '';
  [...s].reverse().forEach((ch, i) => {
    const d = +ch;
    if (!d) return;
    out = (i === 1 && d === 1 ? 'สิบ' : i === 1 && d === 2 ? 'ยี่สิบ' : i === 0 && d === 1 && s.length > 1 ? 'เอ็ด' : DIG[d] + POS[i]) + out;
  });
  return out;
}
export function bahtText(x) {
  const st = Math.round(x * 100), b = Math.floor(st / 100), s = st % 100;
  return (readNum(b) || 'ศูนย์') + 'บาท' + (s ? readNum(s) + 'สตางค์' : 'ถ้วน');
}
export const money = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** @returns {{ html: string, total: number }} — โยน Error ถ้าแม่แบบเปลี่ยนจนหาจุดกรอกไม่เจอ / job ไม่ครบ */
export function fillLoanSlip(job) {
  const out = job.kind === 'out';
  let h = out ? loanOutHtml() : loanReturnHtml();
  const rep = (from, to) => { if (!h.includes(from)) throw new Error('ฟอร์มในแอปเปลี่ยน หาไม่เจอ: ' + from.slice(0, 70)); h = h.replace(from, to); };
  const TICK = '<span class="bx" style="text-align:center;font-size:11px;line-height:10px;font-weight:700;">&#10003;</span>';
  const BX = '<li><span class="bx"></span> ';
  const tick = (after) => rep(BX + after, `<li>${TICK} ${after}`);
  const W = (t, w = 120) => `<span style="display:inline-block;border-bottom:1px solid #000;min-width:${w}px;font-weight:700;padding:0 4px;">${esc(t)}</span>`;

  // หัวใบ
  if (job.ln) rep('<span class="num">LN -</span><span class="fill"></span>', `<span class="num">${esc(job.ln)}</span>`);
  if (job.slipDate) rep(`<div>${out ? 'วันที่ยืม' : 'วันที่คืน'} <span class="fill"></span></div>`, `<div>${out ? 'วันที่ยืม' : 'วันที่คืน'} ${W(job.slipDate, 92)}</div>`);
  // ทิศทาง — ใบคืน: เราให้ยืม (lend) = เขาคืนให้เรา
  const dir = out ? { lend: '<b>เราให้เขายืม</b>', borrow: '<b>เรายืมจากเขา</b>' } : { lend: '<b>เขาคืนให้เรา</b>', borrow: '<b>เราคืนให้เขา</b>' };
  if (!dir[job.direction]) throw new Error('direction ต้องเป็น lend หรือ borrow');
  tick(dir[job.direction]);
  // คู่สัญญา
  const meta = (label, w, t) => { if (t) rep(`<div>${label} <span style="min-width:${w}px;"></span></div>`, `<div>${label} <span style="min-width:${w}px;font-weight:700;">${esc(t)}</span></div>`); };
  meta('ชื่อหน่วยงานคู่สัญญา', 230, job.counterparty);
  meta('ผู้ประสานงาน', 130, job.coordinator);
  if (out) meta('เบอร์ติดต่อ', 100, job.phone);
  else meta('วันที่ยืมเดิม', 100, job.loanDate);
  if (job.partyType === 'อื่นๆ') rep(BX + 'อื่นๆ (ระบุ)<span class="fl fl-l"></span>', `<li>${TICK} อื่นๆ (ระบุ)${W(job.partyOther || '', 135)}`);
  else if (job.partyType) tick(job.partyType);

  if (out) {
    const OTHER = 'อื่นๆ <span class="fl fl-xl"></span></li>';   // ตัวแรก = เหตุผล · ตัวที่สอง = กำหนดคืน
    const r = job.reason || {};
    const REASON = { shortage: 'ยาขาดคลัง', urgent: 'ยาใช้เร่งด่วน', help: 'ช่วยเหลือหน่วยงานอื่น' };
    if (r.pick === 'other') rep(BX + OTHER, `<li>${TICK} อื่นๆ ${W(r.text, 360)}</li>`);
    else if (REASON[r.pick]) tick(REASON[r.pick]);
    const t = job.returnTerm || {};
    if (t.pick === 'po') {
      tick('<b>คืนเมื่อของที่สั่งซื้อมาถึง</b>');
      if (t.po) rep('เลขที่ PO / ใบสั่งซื้อ <span class="fl fl-l"></span>', 'เลขที่ PO / ใบสั่งซื้อ ' + W(t.po, 135));
      if (t.eta) rep('คาดว่าของถึงประมาณ <span class="fl fl-m"></span>', 'คาดว่าของถึงประมาณ ' + W(t.eta, 88));
    } else if (t.pick === 'date') {
      rep(BX + 'คืนภายในวันที่ <span class="fl fl-m"></span>', `<li>${TICK} คืนภายในวันที่ ${W(t.date, 88)}`);
    } else if (t.pick === 'other') {
      if (r.pick !== 'other') rep(BX + OTHER, BX + 'อื่นๆ <span class="fl fl-xl" data-skip></span></li>');   // ข้ามตัวเหตุผล
      rep(BX + OTHER, `<li>${TICK} อื่นๆ ${W(t.text, 330)}</li>`);
      h = h.replace(' data-skip', '');
    }
    const p = job.responsible || {};
    if (p.pick === 'store') tick('<b>ของอยู่ที่คลัง — คลังคืนเอง</b>');
    if (p.pick === 'handover') {
      tick('<b>ส่งต่อให้ผู้ดูแลรับผิดชอบ</b>');
      if (p.who) rep('ชื่อผู้ดูแล / หน่วยงาน <span class="fl fl-l"></span>', 'ชื่อผู้ดูแล / หน่วยงาน ' + W(p.who, 135));
      if (p.date) rep('วันที่ส่งต่อ <span class="fl fl-m"></span>', 'วันที่ส่งต่อ ' + W(p.date, 88));
    }
  } else {
    const res = new Set(job.result || []);
    if (res.has('full')) tick('<b>คืนครบตามใบยืม — ปิดรายการ</b>');
    if (res.has('partial')) rep(BX + 'คืนบางส่วน — ยังค้างอีก <span class="fl fl-s"></span>', `<li>${TICK} คืนบางส่วน — ยังค้างอีก ${W(job.partialLeft, 46)}`);
    if (res.has('otherLot')) tick('คืนด้วย <b>lot อื่น</b>');
    if (res.has('compensate')) rep(BX + 'ตกลงไม่คืนเป็นของ — ชดเชยเป็น <span class="fl fl-l"></span>', `<li>${TICK} ตกลงไม่คืนเป็นของ — ชดเชยเป็น ${W(job.compensate, 135)}`);
    const q = job.returner || {};
    if (q.pick === 'store') tick('<b>คลังคืนเอง</b>');
    if (q.pick === 'caretaker') {
      tick('<b>ผู้ดูแลคืนเอง ไม่ผ่านคลัง</b>');
      if (q.who) rep('ชื่อผู้ดูแล <span class="fl fl-l"></span>', 'ชื่อผู้ดูแล ' + W(q.who, 135));
      if (q.when) rep('แจ้งคลังเมื่อ <span class="fl fl-m"></span>', 'แจ้งคลังเมื่อ ' + W(q.when, 88));
    }
    if (job.note) rep('<p class="note-line">หมายเหตุเพิ่มเติม <span></span></p>', `<p class="note-line">หมายเหตุเพิ่มเติม <span style="font-weight:700;">${esc(job.note)}</span></p>`);
  }

  // กล่องลงนาม — ติ๊กฝ่ายของผู้ส่ง/ผู้รับตามทิศทาง: ใบยืม lend / ใบคืน borrow = เราเป็นผู้ส่ง
  const weSend = out ? job.direction === 'lend' : job.direction === 'borrow';
  rep(`<span class="bx" data-p="s-${weSend ? 'us' : 'them'}"></span>`, TICK);
  rep(`<span class="bx" data-p="r-${weSend ? 'them' : 'us'}"></span>`, TICK);
  if (job.courier) rep('<span class="fl fl-m" data-courier></span>', W(job.courier, 88));

  // ตาราง — สร้าง tbody ใหม่ทั้งก้อน (ขั้นต่ำ 6 แถวเหมือนฟอร์มเปล่า)
  const items = job.items || [];
  if (!items.length) throw new Error('items ว่าง');
  let total = 0;
  const rows = [];
  for (let i = 0; i < Math.max(6, items.length); i++) {
    const it = items[i];
    if (!it) { rows.push(`<tr><td class="c">${i + 1}</td>${'<td></td>'.repeat(8)}</tr>`); continue; }
    const value = Math.round(it.qty * it.price * 100) / 100;
    total += value;
    const name = `<b>${esc(it.name)}</b>${it.code ? ` (รหัส ${esc(it.code)})` : ''}`;
    const exp = `<td class="c" style="white-space:nowrap;font-size:9.5px;">${esc(it.exp)}</td>`;
    const note = `<td style="font-size:9.5px;">${esc(it.note)}</td>`;
    const unit = esc(it.unit).replace(' (', '<br/>(');
    rows.push(out
      ? `<tr><td class="c">${i + 1}</td><td>${name}</td><td class="c">${esc(it.lot)}</td>${exp}<td class="c">${it.qty}</td><td class="c">${unit}</td><td class="c">${money(it.price)}</td><td class="c">${money(value)}</td>${note}</tr>`
      : `<tr><td class="c">${i + 1}</td><td>${name}</td><td class="c">${esc(it.lot)}</td><td class="c">${esc(it.lotReturned || it.lot)}</td>${exp}<td class="c">${it.qty}</td><td class="c">${unit}</td><td class="c">${money(value)}</td>${note}</tr>`);
  }
  const tb = h.indexOf('<tbody>'), te = h.indexOf('</tbody>');
  h = h.slice(0, tb) + '<tbody>' + rows.join('') + h.slice(te);
  const label = out ? 'รวมมูลค่าที่ยืม (บาท)' : 'รวมมูลค่าที่คืน (บาท)';
  rep(`<td colspan="7" style="text-align:right;font-weight:700;">${label}</td>\n      <td class="c"></td>`,
    `<td colspan="7" style="text-align:right;font-weight:700;">${label} — ${bahtText(total)}</td>\n      <td class="c" style="font-weight:700;">${money(total)}</td>`);
  return { html: h, total };
}
