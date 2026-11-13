// reqSheetFormat.test.js — Golden tests สำหรับ src/lib/reqSheetFormat.js
// รัน: node src/lib/reqSheetFormat.test.js

import { SHEET_COLS, logSortKey, sortRowsByLog, sheetTitle, fmtDateCE, buildSheetHtml, toPackQty, isFraction, fmtPackNote } from './reqSheetFormat.js';

let pass = 0, fail = 0;
const fails = [];
const ok = (cond, label, extra = '') => { if (cond) pass++; else { fail++; fails.push(`  ✗ ${label}${extra ? `\n     ${extra}` : ''}`); } };

console.log('\n=== คอลัมน์ = ชีทเบิก B–Q ===');
ok(SHEET_COLS.length === 16, '16 คอลัมน์');
ok(SHEET_COLS.map(c => c.header).join('|') === 'วันที่เบิก|MainLog|DetailedLog|รหัส|ชนิด|รายการยา|หน่วย|ราคา/หน่วย|Lot Number|Exp|ชนิดรายการ|คงเหลือก่อนเบิก|ปริมาณ (ออก)|คงเหลือหลังจ่าย|หน่วยงานที่เบิก|หมายเหตุ', 'หัวตารางตรงชีท');
ok(SHEET_COLS.filter(c => c.hidden).map(c => c.key).join(',') === 'mainLog,drugType', 'ซ่อน MainLog + ชนิด เหมือน PDF');
ok(Math.abs(SHEET_COLS.reduce((s, c) => s + c.width, 0) - 310.88) < 0.01, 'ความกว้างรวม = $pdfW ของ ps1');

console.log('\n=== เรียงตามที่เก็บแบบ Excel (ไม่สนขีด) ===');
ok(logSortKey('E-1-3') === 'E13' && logSortKey('') === '￿', 'logSortKey');
const R = (mainLog, detailLog, name) => ({ mainLog, detailLog, name });
const sorted = sortRowsByLog([
  R('ตู้เย็นชั้น4', 'ตู้เย็นชั้น4', 'NPH'), R('E', 'E-1-3', 'x13'), R('E', 'E-11', 'x11'), R('', '', 'ไม่มีที่เก็บ'),
  R('A', 'A-2-2', 'a22'), R('E', 'E-10', 'x10'), R('A', 'A-1-1 ,B-1-1', 'a11'), R('ห้องประชุมเล็กชั้น4', 'ห้องประชุมเล็กชั้น4', 'ประชุม'),
]).map(r => r.name).join(',');
ok(sorted === 'a11,a22,x10,x11,x13,NPH,ประชุม,ไม่มีที่เก็บ',
  'A → E (E-10 < E-11 < E-1-3) → ห้อง/ตู้เย็น → ว่างท้าย', `ได้: ${sorted}`);
const stable = sortRowsByLog([R('A', 'A-1-1', '1'), R('A', 'A-1-1', '2')]).map(r => r.name).join('');
ok(stable === '12', 'ที่เก็บเท่ากันคงลำดับเดิม');

console.log('\n=== หัวกระดาษ / HTML ===');
ok(sheetTitle('ห้องยา G', 'ยา') === 'ห้องยาG ยา', 'sheetTitle ตัดช่องว่างหน่วยงาน');
ok(fmtDateCE(new Date(2026, 10, 11)) === '11/11/2026', 'วันที่ ค.ศ. แบบชีท');
const html = buildSheetHtml([{ date: '11/11/2026', detailLog: 'A-1-1', code: '1500013', name: 'Amox <b>', price: 321, before: 108, out: 12, after: 96, note: 'เบิก 1x12', nearExp: true, exp: '04/08/2029' }],
  { title: 'ห้องยาG ยา', centerNo: 'บย.70/0069', printedAt: new Date(2026, 10, 11, 10, 12) });
ok(html.includes('เลขที่ บย.70/0069') && html.includes('11/11/2026 เวลา:10:12'), 'หัวกระดาษกลาง + ขวา');
ok(html.includes('321.00') && html.includes('>108<'), 'ราคา 2 ตำแหน่ง · ตัวเลขคั่นหลัก');
ok(html.includes('Amox &lt;b&gt;'), 'escape HTML');
ok(!html.includes('<th>MainLog</th>') && !html.includes('<th>ชนิด</th>'), 'ไม่แสดงคอลัมน์ที่ซ่อน');
ok(html.includes('class="c near"'), 'exp ใกล้หมดระบายสี');
ok(!html.includes('window.print') && buildSheetHtml([], { autoPrint: true }).includes('window.print'), 'autoPrint เฉพาะเมื่อขอ');

console.log('\n=== หน่วยย่อย → หน่วยซื้อแบบชีท ===');
ok(toPackQty(6000, 1000) === 6, 'Para 6,000 เม็ด = 6 × 1000เม็ด');
ok(toPackQty(60, 1) === 60 && toPackQty(60, null) === 60, 'ขวด/vial (ไม่มี packSize) คงเดิม');
ok(toPackQty(1000, 98) === 10.2, 'หารไม่ลงตัว เก็บ 2 ตำแหน่ง');
ok(!isFraction(6) && isFraction(10.2) && !isFraction('') && !isFraction(null), 'isFraction');
ok(fmtPackNote(6000, 1000, 'เม็ด') === '6', 'หมายเหตุ เต็มแพ็ค = เลขหน่วยซื้อ', fmtPackNote(6000, 1000, 'เม็ด'));
ok(fmtPackNote(0, 1000, 'เม็ด') === '0', 'หมายเหตุ จ่าย 0');
ok(fmtPackNote(2500, 1000, 'เม็ด') === '2.5 (2,500 เม็ด)', 'หมายเหตุ ไม่เต็มแพ็ค แนบหน่วยย่อย', fmtPackNote(2500, 1000, 'เม็ด'));
ok(fmtPackNote(1000, 98, 'เม็ด') === '10.2 (1,000 เม็ด)', 'หมายเหตุ หารไม่ลงตัว 2 ตำแหน่ง', fmtPackNote(1000, 98, 'เม็ด'));
ok(fmtPackNote(1500, 1, 'ขวด') === '1,500', 'หมายเหตุ ขวด/vial เลขเดิม');
const fr = buildSheetHtml([{ before: 12.5, out: 10.2, after: 2.3 }]);
ok(fr.includes('>10.20<') && fr.includes('>12.50<'), 'จำนวนมีเศษแสดง 2 ตำแหน่ง');

console.log(`\nผ่าน ${pass} / ${pass + fail}`);
if (fail) { console.log(fails.join('\n')); process.exit(1); }
