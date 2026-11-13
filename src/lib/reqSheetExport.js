// ส่งออกใบเบิกรูปแบบชีทเบิก (reqSheetFormat.js) เป็นไฟล์ — Excel มีรูปแบบ + ตั้งหน้า / PDF แชร์เข้า LINE
// exceljs · html2canvas · jspdf โหลดตอนกดปุ่มเท่านั้น (dynamic import) — ไม่ถ่วงหน้าแรก
import { SHEET_COLS, isFraction } from './reqSheetFormat';

const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

// มือถือ = share sheet (LINE ได้ไฟล์จริง — ลิงก์ blob: ส่งต่อแล้วเปิดไม่ได้) · คอม/แชร์ไม่ได้ = ดาวน์โหลด
export async function shareOrDownload(blob, fileName, title = fileName) {
  const file = new File([blob], fileName, { type: blob.type });
  if (isTouch() && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}

export const safeFileName = (s) => String(s || 'ใบเบิก').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

// ความสูงแถวโดยประมาณ (Excel ไม่ autofit แถวที่ตัดบรรทัดตอนเปิดไฟล์) · ตัวอักษร 20 ≈ 1.6 หน่วยกว้างต่อตัว
const estHeight = (r) => {
  let lines = 1;
  SHEET_COLS.forEach(c => {
    if (c.hidden) return;
    const len = String(r[c.key] ?? '').length;
    const per = c.big ? 2.2 : 1.6;
    lines = Math.max(lines, Math.ceil((len * per) / c.width));
  });
  return Math.max(56, lines * 27);
};

// rows แบบเดียวกับ buildSheetHtml (+ dateObj/expObj เป็น Date ให้ Excel เก็บเป็นวันที่จริง)
// ตั้งหน้าเหมือน dispense-pdf.ps1: A4 แนวนอน · พอดี 1 หน้ากว้าง · หัวตารางซ้ำ · หัวกระดาษ ซ้าย/กลาง/ขวา · เลขหน้าท้าย
export async function buildSheetXlsxBlob(rows = [], { title = '', centerNo = '', sheetName = 'ใบเบิกยา' } = {}) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31), {
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true, printTitlesRow: '1:1',
      margins: { left: 0.157, right: 0.079, top: 0.906, bottom: 0.551, header: 0.512, footer: 0.197 },
    },
    headerFooter: {
      oddHeader: `&L&"-,Bold"&36${title}${centerNo ? `&C&"-,Bold"&36เลขที่ ${centerNo}` : ''}&R&"-,Bold"&36&D เวลา:&T`,
      oddFooter: '&C&20&P',
    },
  });
  ws.columns = SHEET_COLS.map(c => ({ key: c.key, width: c.width, hidden: !!c.hidden }));
  const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const H = { c: 'center', r: 'right', l: 'left' };

  const head = ws.addRow(SHEET_COLS.map(c => c.header));
  head.height = 81; // = ชีท 'เบิก ' แถว 6 (Calibri 19 ตัวหนา)
  head.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 19, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });

  rows.forEach(r => {
    const values = SHEET_COLS.map(c => {
      if (c.key === 'date') return r.dateObj || r.date || '';
      if (c.key === 'exp') return r.expObj || r.exp || '';
      const v = r[c.key];
      if (c.num) return v == null || v === '' ? '' : Number(v);
      return v ?? '';
    });
    const row = ws.addRow(values);
    row.height = estHeight(r);
    SHEET_COLS.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.font = { name: 'Calibri', size: c.big ? 28 : 20, bold: !!c.bold };
      cell.alignment = { horizontal: H[c.align], vertical: 'middle', wrapText: true };
      cell.border = border;
      if (c.num) cell.numFmt = c.num === '#,##0' && isFraction(r[c.key]) ? '#,##0.00' : c.num;
      if ((c.key === 'date' && r.dateObj) || (c.key === 'exp' && r.expObj)) cell.numFmt = 'dd/mm/yyyy';
      if (c.key === 'exp' && r.nearExp) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } };
    });
  });
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// HTML ใบ (buildSheetHtml) → PDF A4 แนวนอน · วาดผ่าน browser จริง (ตัวไทย/สระซ้อนถูก) แล้วตัดหน้าที่ขอบแถว
// ไม่ตัดกลางแถว · หน้า 2+ ซ้ำหัวกระดาษ+หัวตาราง · เลขหน้าท้ายกระดาษ (เหมือน PDF คลัง)
export async function htmlToPdfBlob(html) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  // 285 มม. (A4 แนวนอน − ขอบ 6 มม. สองข้าง) ที่ 96dpi → 1px = 0.75pt บนกระดาษพอดี ตัวอักษร pt ใน CSS จึงได้ขนาดจริงแบบ PDF คลัง
  const WIDTH_PX = 1077;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', left: '-20000px', top: '0', width: `${WIDTH_PX}px`, height: '1000px', border: '0' });
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    doc.open(); doc.write(html); doc.close();
    await new Promise(res => (doc.readyState === 'complete' ? res() : iframe.addEventListener('load', res, { once: true })));
    try { await doc.fonts?.ready; } catch { /* ไม่มี FontFace API — ใช้ฟอนต์ที่มี */ }
    await new Promise(res => setTimeout(res, 150));
    const body = doc.body;
    body.style.padding = '0'; // ขอบกระดาษใส่ตอน addImage แล้ว
    const fullH = Math.max(body.scrollHeight, doc.documentElement.scrollHeight);
    iframe.style.height = `${fullH}px`;
    // foreignObjectRendering = ให้เบราว์เซอร์วาดตัวอักษรเอง — ตัววาดปกติของ html2canvas วางข้อความต่ำกว่าจริงจนทับเส้นล่างของช่อง
    // (เห็นชัดตั้งแต่ใช้ขนาดตัวอักษรเท่า PDF คลัง 13/11/2569) · เบราว์เซอร์ที่ไม่รองรับ html2canvas ตรวจแล้วถอยไปตัววาดปกติเอง
    const canvas = await html2canvas(body, { scale: 2, backgroundColor: '#ffffff', windowWidth: WIDTH_PX, width: WIDTH_PX, height: fullH, logging: false, foreignObjectRendering: true });
    const k = canvas.width / WIDTH_PX;
    const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top * k, bottom: r.bottom * k }; };
    const headBottom = box(doc.querySelector('thead')).bottom;
    const rowBottoms = [...doc.querySelectorAll('tbody tr')].map(tr => box(tr).bottom);

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const M = 6, pageW = 297 - M * 2, pageH = 210 - M * 2 - 6;
    const pxPerMm = canvas.width / pageW;
    const bodyAvail = pageH * pxPerMm - headBottom;
    let start = headBottom, page = 0;
    const end = rowBottoms.length ? rowBottoms[rowBottoms.length - 1] : headBottom;
    do {
      let stop = Math.min(start + bodyAvail, end);
      if (stop < end) {
        const fit = rowBottoms.filter(b => b > start && b <= stop);
        if (fit.length) stop = fit[fit.length - 1];
      }
      const h = headBottom + (stop - start);
      const pc = document.createElement('canvas');
      pc.width = canvas.width; pc.height = Math.max(1, Math.ceil(h));
      const ctx = pc.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, pc.width, pc.height);
      ctx.drawImage(canvas, 0, 0, canvas.width, headBottom, 0, 0, canvas.width, headBottom);
      if (stop > start) ctx.drawImage(canvas, 0, start, canvas.width, stop - start, 0, headBottom, canvas.width, stop - start);
      if (page > 0) pdf.addPage();
      pdf.addImage(pc.toDataURL('image/jpeg', 0.92), 'JPEG', M, M, pageW, h / pxPerMm);
      page++;
      pdf.setFontSize(10);
      pdf.text(String(page), 297 / 2, 210 - M, { align: 'center' });
      start = stop;
    } while (start < end - 0.5);
    return pdf.output('blob');
  } finally {
    iframe.remove();
  }
}
