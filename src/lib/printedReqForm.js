// ใบเบิกฟอร์มรายการ (CONTEXT.md §ใบเบิกฟอร์มรายการ) — น้ำเกลือ / ยา (เวชภัณฑ์ยาและมิใช่ยา) / ถุง-ขวด-ตลับ
// ใบเปล่าให้หน่วยงานกรอกจำนวนมือ ไม่ดึงข้อมูลจากระบบ · ประเภทละ 1 ฉบับใช้ร่วมทุกหน่วยงานใน รพ. (ยกเว้นห้องยา1/ห้องยาG)
// แทนไฟล์ Word เดิมใน Desktop\ยอดคงคลัง\ (ใบเบิกเวชภัณฑ์น้ำเกลือ / ใบเบิกเวชภัณฑ์ยาและมิใช่ยา / ใบเบิกเวชภัณฑ์มิใช่ยา ถุง.ขวด.ตลับ)
//   - ฉบับเดิมตารางเป็นรูปภาพ แผ่นที่หน่วยงานพิมพ์จาก Drive/ไลน์ ฝั่งขวา (หน่วยนับ+จำนวน) เลื่อนจากฝั่งซ้าย 1 บรรทัด
//     → 15/10/2569 คลังลงใบเบิกผิดตัว 2 ใบ (ER D-5-W 1000→100ml · ห้องยาG S010→S007)
//   - ฉบับนี้เป็นตาราง HTML ชิ้นเดียว + ช่อง "ที่" ซ้ำชิดซ้ายช่องจำนวนที่เบิก → ตัวเลขทุกตัวมีลำดับอยู่ข้างๆ เสมอ ห้ามถอด
// ข้อตกลง /grill-with-docs 16/10/2569: ลงนาม 5 ขั้นแบบใบเบิกยานอกเวลา (② ผู้เบิก = หัวหน้างาน ตามระเบียบฯ ข้อ 204)
//   · ไม่มีช่องจำนวนที่จ่าย (คลังดูจากชีท/PDF) · บรรทัดว่างเขียนรายการนอกใบ (ยา 5 · น้ำเกลือ/ถุง 3) · ท้ายใบพิมพ์ฉบับปรับปรุง
// PDF ใบเปล่าที่แจกในกลุ่มไลน์ / Google Drive สร้างจาก buildPrintedReqFormHtml() ตัวเดียวกัน — ห้ามแก้ไฟล์ Word/PDF แยก
// เพิ่ม/ลบรายการ: แก้ items ด้านล่าง ชื่อ/หน่วยให้ตรงชีท Master + เปลี่ยน REVISION · ขนาดแถวตั้งให้เต็ม A4 หน้าเดียว — แก้แล้ว render วัดใหม่
import { openPrintView } from './openPrintView';

const HOSPITAL_NAME = 'โรงพยาบาลประชาธิปัตย์';
const REVISION = '16/10/2569';

// items: [HosxpCode, รายการ, หน่วยนับ, ชนิด?] — ลำดับ "ที่" = ตำแหน่งในลิสต์ · ใบที่มี ชนิด แสดงคอลัมน์ชนิด
const FORMS = {
  saline: {
    title: 'ใบเบิกเวชภัณฑ์ยา (น้ำเกลือ)',
    rowH: 23,
    blank: 3,
    items: [
      ['1460046', 'AcetateRingerSolution ,1000ml ,ARI', 'ขวด'],
      ['1460133', 'D-10-1/2S 1000ml', 'bott'],
      ['1501130', 'D-5-S 1000ml', 'bott'],
      ['1501131', 'D-5-S/2 1000ml', 'ขวด'],
      ['1501132', 'D-5-S/2 500ml', 'ขวด'],
      ['1501134', 'D-5-S/3 1000ml', 'bott'],
      ['1000097', 'D-5-S/3 500ml', 'bott'],
      ['1000094', 'D-5-S/5 500ml', 'bott'],
      ['1501138', 'D-5-W 1000ml', 'bott'],
      ['1660035', 'D-5-W 100ml', 'bott'],
      ['1620031', 'D-5-W 250ml', 'bott'],
      ['1000102', 'D-5-W 500ml', 'bott'],
      ['1680046', 'Gelofusine 500ml', 'ขวด'],
      ['1660020', 'Lactate Ringer 1000 ml ,LRI', 'ขวด'],
      ['1530004', 'SodiumChloride 1000ml ,Nss1000ml', 'bott'],
      ['1000216', 'SodiumChloride 100ml ,Nss100ml', 'bott'],
      ['1630006', 'SodiumChloride 500ml ,Nss500ml', 'bott'],
      ['1560006', 'SodiumChloride 50ml ,Nss50ml', 'bott'],
      ['1440401', 'SodiumChloride 5ml ,Nss5ml', '50หลอด'],
      ['1460037', 'SodiumChloride0.45% 1000ml ,Nss0.45%', 'bott'],
      ['1460044', 'SodiumChloride3% 500ml', 'bott'],
      ['1500009', 'SodiumChlorideIrrigate 1000ml ,NssIrrigate', 'bott'],
      ['1460279', 'Sterile Water for injection 1000ml ,SWI1000', '1000ml'],
      ['1670016', 'Sterile Water for injection 10ml ,SWI10', '50amp'],
      ['1620029', 'Water for Irrigate 1000ml ,SwiIrrigate', '1000ml'],
    ],
  },
  // รวมรายการจากใบ "ยา" 2 รุ่นที่หมุนเวียนอยู่ (19 + 22 รายการ) ตัดที่ไม่มีใครเบิก · จัดกลุ่มตามชนิด เรียงตัวอักษรในกลุ่ม
  // ยาตู้เย็น ER (Speeda/Td/ERIG) ไม่อยู่ในใบ — ใช้การ์ด Store ER
  drug: {
    title: 'ใบเบิกเวชภัณฑ์ยาและมิใช่ยา',
    rowH: 20,
    blank: 5,
    items: [
      ['1470506', 'ChlorhexidineGluconate 0.12g/100ml ,360ml ,C20', 'bott', 'Apply'],
      ['1680050', 'ChlorhexidineGluconate 0.12g/100ml ,250ml ,C24 ,Mybacin', 'bott', 'Apply'],
      ['1520002', 'Ethylalcohol70% ,450ml', 'bott', 'Apply'],
      ['1000151', 'Hydrogenperoxide', '450ml', 'Apply'],
      ['1501141', 'Povidone-iodine 450ml', '450ml', 'Apply'],
      ['1460260', 'Povidone-iodinegargle', '30ml', 'Apply'],
      ['1510302', 'Povidone-iodineoint 50gm', '50gm', 'Apply'],
      ['1440314', 'SilverSulfadiazine 450gm', 'bott', 'Apply'],
      ['1600012', 'SodiumSulfateenemaUnison 133ml', '500กรัม', 'Apply'],
      ['1570027', 'Terramycineyeointment 3.5gm', 'หลอด', 'Apply'],
      ['1000296', 'Tetracaine 0.5% ,eyedrop ,15ml', 'ขวด', 'Apply'],
      ['1670031', 'BudesonidenebuliserPulmicort 2ml/unit', '20neb', 'Inhaler'],
      ['1460508', 'Ipratropium/Fenoteral Forte sol teva er ,berodualER', '21neb', 'Inhaler'],
      ['1501148', 'SalbutamolSulfate 0.5%w/v(5mg/ml) ,20ml', 'ขวด', 'Inhaler'],
      ['1000168', 'LidocaineHCL 1% 20ml', 'vial', 'Injection'],
      ['1000169', 'LidocaineHCL 2% ,50ml', 'vial', 'Injection'],
      ['1530007', 'Medroxyprogesteroneacetate 150mg/3ml ,DepoM', 'vial', 'Injection'],
      ['1460026', 'Mixtard 70/30 10ml', 'vial', 'Injection'],
      ['1460192', 'Regular Insulin 100 IU/1ml ,10ml ,RI', 'vial', 'Injection'],
      ['1460159', 'FerrousFumarate (Fe15mg/0.6ml) ,15ml', 'ขวด', 'Syrup'],
      ['1680032', 'PotassiumChlorideElixir 500mg(6.67meq)/5ml ,30ml', 'ขวด', 'Syrup'],
      ['1000227', 'Acetaminophen 500mg ,Para', '1000เม็ด', 'Tablet'],
      ['1000131', 'Ferrous Fumarate 200mg', '1000เม็ด', 'Tablet'],
      ['1000135', 'Folicacid 5mg', '1000เม็ด', 'Tablet'],
      ['S1460512', 'LubricantgelKyjell 5gm', 'ซอง', 'มิใช่ยา'],
      ['1460267', 'ParraffinWhiteSoft ,Vasaline ,450gm', 'ขวด', 'มิใช่ยา'],
    ],
  },
  supply: {
    title: 'ใบเบิกเวชภัณฑ์มิใช่ยา (ถุง / ขวด / ตลับ)',
    rowH: 25,
    blank: 3,
    items: [
      ['S002', 'ขวดพลาสติก ขนาด 60ซีซี (สีน้ำเงิน-แบบ)', 'ขวด'],
      ['S005', 'ขวดพลาสติก ขนาด 30ซีซี (สีน้ำเงิน-แบบ)', 'ขวด'],
      ['S013', 'ขวดพลาสติก ขนาด 10ซีซี (สีน้ำเงิน-แบบ)', 'ขวด'],
      ['S004', 'ถุงซิบใส ขนาด 13X20ซม.', 'กิโลกรัม'],
      ['S006', 'ถุงซิบใส ขนาด 6X8ซม.', 'กิโลกรัม'],
      ['S007', 'ถุงซิบใส ขนาด 10X15ซม.', 'กิโลกรัม'],
      ['S009', 'ถุงซิบใส ขนาด 20X30ซม.', 'กิโลกรัม'],
      ['S010', 'ถุงซิบชา ขนาด 6X8ซม.', 'กิโลกรัม'],
      ['S012', 'ถุงซิบชา ขนาด 13X20ซม.', 'กิโลกรัม'],
      ['S014', 'ตลับยา ขนาด 30กรัม ,สีเขียว', 'ตลับ'],
      ['S015', 'ถุงหูหิ้ว ขนาด 6X14 ,1pack/ครึ่งกิโล', 'แพ็ค'],
      ['S016', 'ถุงซิบสีแดง ขนาด 10X15ซม.', 'กิโลกรัม'],
      ['S017', 'ตลับยา ขนาด 30กรัม ,สีครีม', 'ตลับ'],
      ['S018', 'ตลับยา ขนาด 30กรัม ,สีฟ้า', 'ตลับ'],
      ['S019', 'ถุงหูหิ้ว ขนาด 6X18 ,1pack/ครึ่งกิโล', 'แพ็ค'],
      ['S020', 'ตลับยา ขนาด 10กรัม ,สีครีม+สีฟ้า', 'ตลับ'],
      ['S021', 'ถุงซิบใส ขนาด 10X20ซม.', 'กิโลกรัม'],
      ['S011', 'ถุงซิบชา ขนาด 9X13ซม.', 'กิโลกรัม'],
      ['S001', 'สติกเกอร์ฉลากยา ขนาด 8.5X6ซม. ,1ลัง/16ม้วน/1000ดวง', 'ม้วน'],
      ['S022', 'สติกเกอร์ HAD ขนาด 1X0.8ซม. ,กระดาษสีส้มสะท้อนแสง พิมพ์ 1 สี (ดำ) ,บรรจุ 255 ดวง/ใบ', 'ดวง'],
      ['S008', 'ถุงซิบใส ขนาด 15X23ซม.', 'กิโลกรัม'],
      ['S003', 'ถุงซิบใส ขนาด 9X13ซม.', 'กิโลกรัม'],
    ],
  },
};

// ลงนาม 5 ขั้น — ลำดับ/บทบาทเดียวกับใบเบิกยานอกเวลา (afterHoursForm.js)
const SIGN_ROWS = [
  { who: 'ผู้ขอเบิก', tag: 'หน่วยงาน', note: 'คนกรอกใบ' },
  { who: 'ผู้เบิก — หัวหน้างาน / หัวหน้าเวร', tag: 'หน่วยงาน', note: 'ระเบียบฯ ข้อ 204 · <span class="bx"></span>ผู้ขอเบิกเป็นหัวหน้าเอง (เซ็น ① ② คนเดียวได้)' },
  { who: 'ผู้จ่าย', tag: 'คลังยา', note: '', name: 'นายนพคุณ ฉายขุนทด' },
  { who: 'ผู้รับ', tag: 'หน่วยงาน', note: 'คนเดียวกับ ① ได้' },
  { who: 'ผู้อนุมัติเบิกจ่าย / หัวหน้าคลังยา', tag: 'คลังยา', note: 'ระเบียบฯ ข้อ 205 · เซ็นภายหลังได้' },
];

const css = (rowH) => `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 13.5px; color: #000; background: #fff; padding: 6px 14px 8px; }
  @page { size: A4 portrait; margin: 10mm; }
  /* ขนาดทั้งหมดตั้งให้เต็ม A4 หน้าเดียวพอดี — เพิ่มรายการ/บรรทัดต้อง render ตรวจว่าไม่ล้นหน้า 2 */
  /* หัวกระดาษตามแบบใบเบิกเดิม (แบบฟอร์มขอเบิกยา น้ำเกลือ เวชภัณฑ์มิใช่ยา.pdf — user เลือก 16/10/2569):
     ชื่อใบ + หน่วยงานกลาง · วันที่/เวลาบรรทัดเดียวชิดซ้าย · หัวข้อ 1./2./3. · ช่องเว้นกว้างคงที่ ไม่ห่อบรรทัด (ห่อ = วันที่เลื่อน) */
  h1 { font-size: 18px; font-weight: 700; text-align: center; }
  .unit { text-align: center; font-size: 15px; font-weight: 700; margin: 2px 0 6px; }
  .row { display: flex; justify-content: space-between; align-items: center; white-space: nowrap; margin-bottom: 4px; }
  .sec { font-weight: 700; font-size: 14px; margin: 4px 0 2px; }
  .ref { border: 2px solid #000; padding: 3px 8px; font-size: 12.5px; font-weight: 700; }
  .ref small { font-weight: 400; font-size: 10.5px; }
  /* ช่องเว้นให้เขียนมือ — ต้อง align bottom + มีความสูง ไม่งั้นเส้นลอยไปกลางบรรทัด (ดูเหมือนขีดฆ่า) */
  .fl { display: inline-block; border-bottom: 1px solid #000; height: 18px; vertical-align: bottom; margin: 0 3px; min-width: 60px; }
  .fl-m { min-width: 110px; } .fl-l { min-width: 190px; } .fl-xl { min-width: 300px; }
  .line { white-space: nowrap; margin-bottom: 4px; }
  .line > span + span { margin-left: 28px; }
  .bx { display: inline-block; width: 12px; height: 12px; border: 1px solid #000; vertical-align: middle; margin: 0 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; table-layout: fixed; }
  th { background: #fff; font-weight: 700; padding: 3px 2px; text-align: center; border: 1px solid #000; line-height: 1.2; }
  td { padding: 0 5px; border: 1px solid #000; vertical-align: middle; }
  .items td { height: ${rowH}px; }
  td.c { text-align: center; }
  /* ช่อง "ที่" ซ้ำชิดช่องจำนวน — เส้นคู่แยกฝั่งรายการ/ฝั่งกรอก ให้คนเขียนเห็นว่าเลขที่เขียนอยู่บรรทัดไหน */
  td.no2, th.no2 { border-left: 3px double #000; font-weight: 700; text-align: center; }
  .hint { font-size: 11px; margin-top: 2px; }
  .sign td { height: 30px; font-size: 12px; }
  .sign td.step { text-align: center; font-size: 17px; font-weight: 700; }
  .sign td.who { font-weight: 700; line-height: 1.25; }
  .sign td.who small { display: block; font-weight: 400; font-size: 10px; }
  .tag { display: inline-block; border: 1px solid #000; padding: 0 3px; font-size: 10px; font-weight: 700; margin-right: 4px; }
  .foot { font-size: 10px; display: flex; justify-content: space-between; margin-top: 4px; }
  @media print { button { display: none !important; } }
  @media screen and (max-width: 768px) { body { padding: 12px; } .tbl-wrap { overflow-x: auto; } table { min-width: 680px; } }
`;

export function buildPrintedReqFormHtml(kind, { withPrintButton = true } = {}) {
  const f = FORMS[kind];
  if (!f) throw new Error(`unknown form kind: ${kind}`);
  const typed = f.items.some(it => it[3]);
  const rows = f.items.map(([code, name, unit, type], i) =>
    `<tr><td class="c">${i + 1}</td><td class="c">${code}</td>${typed ? `<td class="c">${type || ''}</td>` : ''}<td>${name}</td><td class="c">${unit}</td>`
    + `<td class="no2">${i + 1}</td><td></td><td></td></tr>`).join('')
    + Array.from({ length: f.blank }, (_, k) => {
      const no = f.items.length + k + 1;
      return `<tr><td class="c">${no}</td><td></td>${typed ? '<td></td>' : ''}<td></td><td></td><td class="no2">${no}</td><td></td><td></td></tr>`;
    }).join('');
  const cols = typed
    ? '<col style="width:5%"><col style="width:10%"><col style="width:9%"><col style="width:39%"><col style="width:9%"><col style="width:5%"><col style="width:9%"><col style="width:14%">'
    : '<col style="width:5%"><col style="width:10%"><col style="width:48%"><col style="width:9%"><col style="width:5%"><col style="width:9%"><col style="width:14%">';
  const sign = SIGN_ROWS.map((r, i) => `
      <tr><td class="step">${'①②③④⑤'[i]}</td>
        <td class="who"><span class="tag">${r.tag}</span>${r.who}${r.note ? `<small>${r.note}</small>` : ''}</td>
        <td></td><td class="c">${r.name || ''}</td><td></td></tr>`).join('');

  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${f.title}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>${css(f.rowH)}</style>
</head><body>
${withPrintButton ? `<button id="btnPrint" type="button" style="position:fixed;top:14px;right:14px;background:#000;color:#fff;border:none;
  padding:8px 18px;border-radius:8px;font-family:Sarabun,sans-serif;font-size:13px;cursor:pointer;font-weight:600;z-index:9999;">พิมพ์</button>` : ''}

<h1>${f.title} · ${HOSPITAL_NAME}</h1>
<div class="unit">หน่วยงาน:<span class="fl fl-xl"></span></div>
<div class="row">
  <div><span>วันที่ :<span class="fl fl-l"></span></span><span style="margin-left:28px;">เวลา :<span class="fl fl-l"></span></span></div>
  <div class="ref">เลขรับใบเบิก <small>(คลังกรอก)</small> บย.<span class="fl fl-m"></span></div>
</div>
<p class="sec">1. รายละเอียดผู้ขอเบิก</p>
<div class="line"><span>ชื่อ-สกุล:<span class="fl fl-xl"></span></span><span>ตำแหน่ง:<span class="fl fl-l"></span></span></div>
<p class="sec">2. ตารางรายการที่ขอเบิก</p>

<div class="tbl-wrap">
<table class="items">
  <colgroup>${cols}</colgroup>
  <thead><tr><th>ที่</th><th>HosxpCode</th>${typed ? '<th>ชนิด</th>' : ''}<th>รายการ</th><th>หน่วยนับ</th><th class="no2">ที่</th><th>จำนวน<br/>ที่เบิก</th><th>หมายเหตุ</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>
<p class="hint">เขียนจำนวนในบรรทัดเดียวกับเลข "ที่" ที่ต้องการเบิก · รายการที่ไม่เบิกเว้นว่าง · ยาที่ไม่มีในใบ เขียนชื่อ + หน่วยในบรรทัดว่างท้ายตาราง</p>

<p class="sec">3. ลงนาม — เรียงตามขั้นตอน</p>
<div class="tbl-wrap">
<table class="sign">
  <colgroup><col style="width:6%"><col style="width:40%"><col style="width:20%"><col style="width:22%"><col style="width:12%"></colgroup>
  <tr><th>ขั้น</th><th>ใครเซ็น</th><th>ลายมือชื่อ</th><th>ชื่อตัวบรรจง</th><th>วันที่</th></tr>
  ${sign}
</table>
</div>

<div class="foot"><span>ใบนี้ไม่ใช่ฉบับล่าสุด? ขอฉบับใหม่ได้ที่คลังยา</span><span>${f.title} · ฉบับปรับปรุง ${REVISION} · ${f.items.length} รายการ</span></div>
${withPrintButton ? `<script>document.getElementById('btnPrint').addEventListener('click', function(){ window.print(); });</script>` : ''}
</body></html>`;
}

export function printSalineReqForm() {
  openPrintView(buildPrintedReqFormHtml('saline'));
}

export function printDrugReqForm() {
  openPrintView(buildPrintedReqFormHtml('drug'));
}

export function printSupplyReqForm() {
  openPrintView(buildPrintedReqFormHtml('supply'));
}
