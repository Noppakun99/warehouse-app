// พิมพ์รายการจากโมดอลติดตาม (รอตรวจรับ / ใกล้หมดอายุ / หมดอายุแล้ว) ในระบบแผนผังคลังยา
// คอลัมน์ตรงกับ Excel export ของโมดอลเดียวกัน (Critical Rule #6 — ตัวเลข/รายการที่ user เห็นต้องตรงกันทุกช่องทาง)
// UI helper: build HTML + Blob URL (ไม่ใช่ pure module — มี window.open)
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

/**
 * @param {Array} rows       แถวที่ผ่านตัวกรองแล้ว (ต้องเป็นชุดเดียวกับที่แสดงในตาราง/ส่งออก Excel)
 * @param {object} opts
 * @param {string} opts.title      ชื่อรายการ (ใช้เป็นหัวเอกสาร + ชื่อหน้าต่าง)
 * @param {boolean} opts.isExpiryMode  โหมดใกล้หมดอายุ/หมดอายุ → ไม่มีคอลัมน์ บิลยา/PO (ตรงกับ Excel)
 * @param {string} [opts.filterNote]   บรรทัดสรุปตัวกรองที่ใช้อยู่ (โซน/ช่วงเวลา/คำค้น)
 * @param {string} [opts.printedBy]    ชื่อผู้พิมพ์
 */
export function printTrackingList(rows, { title, isExpiryMode = false, filterNote = '', printedBy = '' } = {}) {
  const cols = [
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
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f1f5f9; font-weight: 700; padding: 5px 6px; text-align: center; border: 1px solid #000; }
  td { padding: 4px 6px; border: 1px solid #94a3b8; vertical-align: middle; }
  td.c { text-align: center; }
  td.nowrap { white-space: nowrap; }
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
</style></head><body>
<button class="btn" onclick="window.print()">พิมพ์</button>
<div class="h-row">
  <h1>${esc(title)}</h1>
  <div class="sub">${esc(HOSPITAL_NAME)}</div>
</div>
<div class="meta">
  <span class="note">${filterNote ? esc(filterNote) : 'แสดงทุกรายการ'}</span>
  <span>รวม ${rows.length} รายการ</span>
</div>
<table>
  <thead><tr>${thead}</tr></thead>
  <tbody>${tbody}</tbody>
</table>
<div class="foot">
  <span>${printedBy ? 'ผู้พิมพ์: ' + esc(printedBy) : ''}</span>
  <span>พิมพ์เมื่อ ${todayThaiDateTime()}</span>
</div>
</body></html>`;

  // Blob URL เสมอ — document.write พังบน iOS Safari (Critical Rule #4)
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const win = window.open(url, '_blank');
  if (win) { setTimeout(() => URL.revokeObjectURL(url), 30000); return; }
  // fallback: in-app WebView (LINE/FB) บล็อก window.open('_blank') → คืน null
  // นำทางผ่าน <a> click แทน (WebView ยอมให้คลิกลิงก์ แต่บล็อก popup)
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
