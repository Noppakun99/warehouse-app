/**
 * unitParser.test.js — golden test สำหรับ src/lib/unitParser.js
 * รัน: node src/unitParser.test.js
 */

import { parseUnit, calcTotalUnits } from './lib/unitParser.js';

// ============================================================
// ทดสอบ
// ============================================================

const TEST_CASES = [
  // [input, expectedPackSize, expectedBaseUnit]
  ['1000เม็ด',         1000,  'เม็ด'],
  ['500 เม็ด',         500,   'เม็ด'],
  ['Tablet (500เม็ด)', 500,   'เม็ด'],
  ['Apply (15เม็ด)',   15,    'เม็ด'],
  ['100แคปซูล',        100,   'แคปซูล'],
  ['500ml',            500,   'ml'],
  ['10แผง×10เม็ด',     100,   'เม็ด'],
  ['เม็ด',             null,  'เม็ด'],
  ['-',                null,  '-'],
  ['Tablet',           null,  'Tablet'],
  ['1,000เม็ด',        1000,  'เม็ด'],
  // unit aliases (sheet "หน่วยย่อย") — normalize ชื่อ packSize ยังเป็น null
  ['bott',             null,  'ขวด'],
  ['neb',              null,  'หลอด'],
  ['gm',               null,  'กรัม'],
  ['Vial',             null,  'vial'],
  ['capsules',         null,  'แคปซูล'],
  ['amp',              null,  'amp'],
];

console.log('=== ทดสอบ parseUnit ===\n');
let pass = 0, fail = 0;
TEST_CASES.forEach(([input, expectedPack, expectedUnit]) => {
  const result = parseUnit(input);
  const ok = result.packSize === expectedPack && result.baseUnit.toLowerCase() === expectedUnit.toLowerCase();
  if (ok) pass++; else fail++;
  console.log(
    `${ok ? '✅' : '❌'} "${input}"\n` +
    `   → packSize: ${result.packSize} (expect ${expectedPack})` +
    `  baseUnit: "${result.baseUnit}" (expect "${expectedUnit}")\n`
  );
});
console.log(`\nผล: ${pass}/${TEST_CASES.length} ผ่าน, ${fail} ไม่ผ่าน\n`);

console.log('=== ทดสอบ calcTotalUnits ===\n');
const CALC_CASES = [
  { qty: 10,  unit: '1000เม็ด',         label: '10 กล่อง × 1000เม็ด' },
  { qty: 5,   unit: 'Tablet (500เม็ด)', label: '5 กล่อง × 500เม็ด (Tablet)' },
  { qty: 20,  unit: '500ml',             label: '20 ขวด × 500ml' },
  { qty: 3,   unit: '10แผง×10เม็ด',     label: '3 กล่อง × 10แผง×10เม็ด' },
  { qty: 100, unit: 'เม็ด',              label: '100 เม็ด (ไม่มี packSize)' },
];
CALC_CASES.forEach(({ qty, unit, label }) => {
  const r = calcTotalUnits(qty, unit);
  console.log(`📦 ${label}`);
  console.log(`   รับ ${qty} × packSize ${r.packSize || '?'} = ${r.total.toLocaleString()} ${r.unit}\n`);
});
