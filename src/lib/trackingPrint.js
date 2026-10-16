// พิมพ์รายการจากโมดอลติดตาม (รอตรวจรับ / ใกล้หมดอายุ / หมดอายุแล้ว) ในระบบแผนผังคลังยา
// คอลัมน์ตรงกับ Excel export ของโมดอลเดียวกัน (Critical Rule #6 — ตัวเลข/รายการที่ user เห็นต้องตรงกันทุกช่องทาง)
// UI helper: build HTML แล้วส่งให้ openPrintView (Blob URL + fallback WebView) — ไม่ใช่ pure module
import { openPrintView } from './openPrintView';

const HOSPITAL_NAME = 'โรงพยาบาลประชาธิปัตย์';

function todayThaiDateTime() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear() + 543} ${hh}:${mi} น.`;
}

const esc = (v) => String(v ?? '-')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// วันที่รับเข้าเก็บเป็น ISO — แสดงเป็น DD/MM/YYYY พ.ศ. ให้ตรงรูปแบบวันที่ทั้งระบบ
const fmtThaiFromIso = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return '-';
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;
};

// ข้อความเดียวกับ badge "รอมา N วัน" ในโมดอล (waitBadge ใน App.jsx) — คนอ่านกระดาษกับจอต้องเห็นตรงกัน
const fmtWaitDays = (d) => {
  if (d == null) return 'ไม่ทราบวันรับ';
  return d === 0 ? 'รับวันนี้' : `${d} วัน`;
};

// ข้อความเดียวกับคอลัมน์ "สถานะ" ใน EXPIRY_EXCEL_COLS (AppRoot.jsx) — กระดาษกับ Excel ต้องอ่านได้ตรงกัน
const fmtDaysLeft = (d) => {
  if (d == null) return '-';
  if (d < 0) return `หมดอายุแล้ว ${Math.abs(d)} วัน`;
  return d === 0 ? 'หมดอายุวันนี้' : `อีก ${d} วัน`;
};

// receiveStatus เก็บรวม 2 ค่าเป็น "<สถานะตรวจรับ>|<ผลการพิจารณา>" (ดู import ใน App.jsx)
// บนกระดาษเอาเฉพาะสถานะตรวจรับ — ผลการพิจารณา (คงไว้/ตัดออก) คนละเรื่องกัน ทำให้ช่องแคบต้องตัดขึ้นบรรทัดใหม่
const fmtReceiveStatus = (s) => {
  const first = String(s ?? '').split('|')[0].trim();
  return first || '-';
};

// แสดง '-' เมื่อค่าว่าง เพื่อให้ช่องไม่โล่ง (ต่างจาก '' ที่อ่านแล้วไม่รู้ว่าไม่มีข้อมูลหรือลืมกรอก)
const cell = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? '-' : esc(s);
};

// สรุปเหนือตารางของใบรอตรวจรับ — นับจาก rows ชุดเดียวกับตาราง (Rule #6)
// บิล key = เลขบิล+วันรับ ไม่ใส่บริษัท: supplier เติมราย lot จาก drugDetails (อาจว่างบาง lot) → บิลเดียวนับเป็น 2
// ใบรอตรวจรับ: ตัดคำนำหน้า/ท้ายชื่อบริษัท ให้ช่องบริษัทไม่ขึ้นบรรทัดใหม่ (ชื่อเต็มยังอยู่ใน Excel)
const shortSupplier = (s) => String(s ?? '')
  .replace(/^\s*(บริษัท|บจก\.|หจก\.|ห้างหุ้นส่วนจำกัด)\s*/, '')
  .replace(/\s*จำกัด\s*(\(มหาชน\))?\s*$/, '')
  .trim();

const isBlank = (v) => { const s = String(v ?? '').trim(); return s === '' || s === '-'; };
export function summarizePending(rows) {
  const drugs = new Set(), bills = new Set(), pos = new Set();
  let noBill = 0, noPo = 0, noDate = 0, maxWait = null, minWait = null;
  for (const r of rows) {
    drugs.add(isBlank(r.code) ? `name:${String(r.name ?? '').trim()}` : String(r.code).trim());
    if (isBlank(r.invoice)) noBill++; else bills.add(`${String(r.invoice).trim()}|${r._receiveDate || ''}`);
    if (isBlank(r.po)) noPo++; else pos.add(String(r.po).trim());
    if (r.waitDays == null) noDate++;
    else {
      if (maxWait == null || r.waitDays > maxWait) maxWait = r.waitDays;
      if (minWait == null || r.waitDays < minWait) minWait = r.waitDays;
    }
  }
  return { lots: rows.length, drugs: drugs.size, bills: bills.size, noBill, pos: pos.size, noPo, maxWait, minWait, noDate };
}

// สรุปบรรทัดเดียว (เดิม 5 กล่อง) — คืนพื้นที่ให้แถวรายการ
function pendingSummaryHtml(rows) {
  const s = summarizePending(rows);
  const item = (label, value, note = '') =>
    `<span><b>${esc(label)}</b> ${esc(value)}${note ? ` (${esc(note)})` : ''}</span>`;
  const wait = (d) => (d == null ? '-' : fmtWaitDays(d));
  return `<div class="sum">
  ${item('รายการยา', `${s.drugs} รายการ`, `${s.lots} lot`)}
  ${item('บิล', `${s.bills} บิล`, s.noBill ? `ไม่มีเลขบิล ${s.noBill} lot` : '')}
  ${item('PO', `${s.pos} ใบ`, s.noPo ? `ไม่มี PO ${s.noPo} lot` : '')}
  ${item('รอนานสุด', wait(s.maxWait))}
  ${item('รอน้อยสุด', wait(s.minWait), s.noDate ? `ไม่ทราบวันรับ ${s.noDate} lot` : '')}
</div>`;
}

/**
 * @param {Array} rows       แถวที่ผ่านตัวกรองแล้ว (ต้องเป็นชุดเดียวกับที่แสดงในตาราง/ส่งออก Excel)
 * @param {object} opts
 * @param {string} opts.title      ชื่อรายการ (ใช้เป็นหัวเอกสาร + ชื่อหน้าต่าง)
 * @param {boolean} opts.isExpiryMode  โหมดใกล้หมดอายุ/หมดอายุ → ไม่มีคอลัมน์ บิลยา/PO (ตรงกับ Excel)
 * @param {string} [opts.filterNote]   บรรทัดสรุปตัวกรองที่ใช้อยู่ (โซน/ช่วงเวลา/คำค้น)
 * @param {string} [opts.printedBy]    ชื่อผู้พิมพ์
 * @param {boolean} [opts.dashboardMode] โมดอลใกล้หมดอายุของ Dashboard (AppRoot) — คอลัมน์ต่างจาก
 *   โมดอลแผนผัง: มี รหัสยา/สถานะ(นับวัน)/นโยบายเปลี่ยนยา แทน สถานะตรวจรับ (ตรงกับ EXPIRY_EXCEL_COLS)
 */
export function printTrackingList(rows, { title, isExpiryMode = false, filterNote = '', printedBy = '', dashboardMode = false } = {}) {
  // ใบรอตรวจรับ: ตัด ชนิด/สถานะตรวจรับ (ทุกแถวคือ "รอตรวจรับ") ให้ทุกแถวอยู่บรรทัดเดียว
  // ย่อชื่อบริษัท — Excel ยังมีชื่อเต็ม
  const pendingMode = !isExpiryMode && !dashboardMode;
  // โมดอล Dashboard ใช้ชุดคอลัมน์ของตัวเอง ให้ตรงกับ Excel ของโมดอลเดียวกัน (Rule #6)
  const cols = pendingMode ? [
    { header: 'ลำดับ',   get: (_r, i) => i + 1, cls: 'c w-no' },
    { header: 'ชื่อยา',  get: r => r.name },
    { header: 'ตำแหน่ง', get: r => r.location, cls: 'c nowrap' },
    { header: 'Lot',     get: r => r.lot, cls: 'c' },
    { header: 'วันหมดอายุ', get: r => r.exp, cls: 'c nowrap' },
    // ช่องเดียว "5 x 1000เม็ด" — แยก 2 คอลัมน์แล้วชื่อยา/บริษัทตัดบรรทัด 10/45 แถว (ทดสอบ 16/10/2569)
    { header: 'คงเหลือ x หน่วย', get: r => isBlank(r.unit) ? r.qty : `${isBlank(r.qty) ? '-' : r.qty} x ${r.unit}`, cls: 'c nowrap' },
    { header: 'บิลยา',   get: r => r.invoice, cls: 'c' },
    { header: 'PO',      get: r => r.po, cls: 'c nowrap' },
    { header: 'วันที่รับเข้า', get: r => fmtThaiFromIso(r._receiveDate), cls: 'c nowrap' },
    { header: 'รอมาแล้ว', get: r => fmtWaitDays(r.waitDays), cls: 'c nowrap b' },
    { header: 'บริษัท',  get: r => shortSupplier(r.supplier) },
  ] : dashboardMode ? [
    { header: 'ลำดับ',   get: (_r, i) => i + 1, cls: 'c w-no' },
    { header: 'ชื่อยา',  get: r => r.name },
    { header: 'รหัสยา',  get: r => r.code, cls: 'c' },
    { header: 'ชนิด',    get: r => r.type, cls: 'c' },
    { header: 'ตำแหน่ง', get: r => r.location, cls: 'c' },
    { header: 'Lot',     get: r => r.lot, cls: 'c' },
    { header: 'วันหมดอายุ', get: r => r.exp, cls: 'c' },
    { header: 'สถานะ',   get: r => fmtDaysLeft(r.daysLeft), cls: 'c nowrap' },
    { header: 'บริษัท',  get: r => r.supplier },
    { header: 'นโยบายเปลี่ยนยา', get: r => r.swapPolicy },
    { header: 'คงเหลือ', get: r => r.qty, cls: 'c' },
    { header: 'หน่วย',   get: r => r.unit, cls: 'c' },
    // สถานะดำเนินการคืนบริษัท (ตรงกับ EXPIRY_EXCEL_COLS) — '-' ถ้ายังไม่เคยคีย์
    { header: 'ดำเนินการ', get: r => r.actionLabel || '-', cls: 'c nowrap' },
    { header: 'วันที่ดำเนินการ', get: r => r.actionDateLabel || '-', cls: 'c nowrap' },
  ] : [
    { header: 'ลำดับ',   get: (_r, i) => i + 1, cls: 'c w-no' },
    { header: 'ชื่อยา',  get: r => r.name },
    { header: 'ชนิด',    get: r => r.type, cls: 'c' },
    { header: 'ตำแหน่ง', get: r => r.location, cls: 'c' },
    { header: 'Lot',     get: r => r.lot, cls: 'c' },
    ...(isExpiryMode ? [] : [
      { header: 'บิลยา', get: r => r.invoice, cls: 'c' },
      { header: 'PO',    get: r => r.po, cls: 'c' },
      { header: 'วันที่รับเข้า',      get: r => fmtThaiFromIso(r._receiveDate), cls: 'c' },
      { header: 'รอตรวจรับมาแล้ว',   get: r => fmtWaitDays(r.waitDays), cls: 'c' },
    ]),
    { header: 'วันหมดอายุ', get: r => r.exp, cls: 'c' },
    { header: 'คงเหลือ',    get: r => r.qty, cls: 'c' },
    { header: 'หน่วย',      get: r => r.unit, cls: 'c' },
    { header: 'สถานะตรวจรับ', get: r => fmtReceiveStatus(r.receiveStatus), cls: 'c nowrap' },
    { header: 'บริษัท',     get: r => r.supplier },
  ];

  const thead = cols.map(c => `<th class="${c.cls || ''}">${esc(c.header)}</th>`).join('');
  const tbody = rows.length === 0
    ? `<tr><td class="c empty" colspan="${cols.length}">ไม่มีรายการ</td></tr>`
    : rows.map((r, i) => `<tr>${cols.map(c => `<td class="${c.cls || ''}">${cell(c.get(r, i))}</td>`).join('')}</tr>`).join('');

  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 12px; color: #1e293b; background: #fff; padding: 14px 20px 16px; }
  @page { size: A4 landscape; margin: 8mm; }
  .h-row { text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 6px; margin-bottom: 8px; }
  h1 { font-size: 18px; font-weight: 700; }
  .sub { font-size: 12px; color: #334155; font-weight: 600; margin-top: 2px; }
  .meta { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; color: #475569; margin-bottom: 8px; }
  .meta .note { font-weight: 600; }
  .sum { display: flex; flex-wrap: wrap; gap: 2px 16px; border: 1px solid #000; border-radius: 4px; padding: 3px 8px; margin-bottom: 6px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f1f5f9; font-weight: 700; padding: 5px 6px; text-align: center; border: 1px solid #000; }
  td { padding: 4px 6px; border: 1px solid #94a3b8; vertical-align: middle; }
  td.c { text-align: center; }
  td.nowrap { white-space: nowrap; }
  td.b { font-weight: 700; }
  /* ใบรอตรวจรับ: กว้าง = พื้นที่พิมพ์ A4 แนวนอน (297 − 2×8mm) ให้จอกับกระดาษตัดบรรทัดเหมือนกัน
     11.5px ทุกแถวอยู่บรรทัดเดียว (45 lot = 2 หน้า) — แนวตั้งชื่อยา/บริษัทตัดบรรทัด 35/45 แถว อ่านยาก
     ไม่ย่อให้จบหน้าเดียว: เคยลอง zoom อัตโนมัติ (16/10/2569) ตัวหนังสือเล็กจนอ่านไม่ออก — ล้นหน้า 2 ดีกว่า */
  .pending .page { width: 281mm; margin: 0 auto; }
  .pending table { font-size: 11.5px; }
  .pending th { padding: 4px 3px; border-color: #000; }
  .pending td { padding: 4px 3px; border-color: #475569; }
  .pending th.w-no, .pending td.w-no { width: 30px; }
  th.w-no, td.w-no { width: 34px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  td.empty { padding: 18px; color: #64748b; }
  .foot { font-size: 10px; color: #64748b; margin-top: 10px; display: flex; justify-content: space-between; }
  .btn { position: fixed; top: 10px; right: 12px; padding: 8px 16px; font-family: inherit; font-size: 13px;
    font-weight: 600; color: #fff; background: #0284c7; border: 0; border-radius: 8px; cursor: pointer; }
  @media print {
    body { padding: 0; }
    .btn { display: none !important; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
</style></head><body class="${pendingMode ? 'pending' : ''}">
<button class="btn" onclick="window.print()">พิมพ์</button>
<div class="page">
<div class="h-row">
  <h1>${esc(title)}</h1>
  <div class="sub">${esc(HOSPITAL_NAME)}</div>
</div>
<div class="meta">
  <span class="note">${filterNote ? esc(filterNote) : 'แสดงทุกรายการ'}</span>
  <span>รวม ${rows.length} รายการ</span>
</div>
${!isExpiryMode && !dashboardMode && rows.length > 0 ? pendingSummaryHtml(rows) : ''}
<table>
  <thead><tr>${thead}</tr></thead>
  <tbody>${tbody}</tbody>
</table>
<div class="foot">
  <span>${printedBy ? 'ผู้พิมพ์: ' + esc(printedBy) : ''}</span>
  <span>พิมพ์เมื่อ ${todayThaiDateTime()}</span>
</div>
</div>
</body></html>`;

  openPrintView(html);
}
