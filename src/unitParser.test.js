/**
 * unitParser.test.js
 * ทดลองฟังก์ชันแยก "หน่วยยา" จาก string ผสม เช่น "1000เม็ด", "Tablet (500เม็ด)"
 * ยังไม่ได้ใช้งานจริง — เป็นไฟล์ทดสอบเท่านั้น
 */

// ============================================================
// ฟังก์ชันหลัก
// ============================================================

/**
 * แยก unit string ออกเป็น { packSize, baseUnit }
 * ตัวอย่าง:
 *   "1000เม็ด"          → { packSize: 1000, baseUnit: "เม็ด" }
 *   "500 เม็ด"          → { packSize: 500,  baseUnit: "เม็ด" }
 *   "Tablet (100เม็ด)"  → { packSize: 100,  baseUnit: "เม็ด" }
 *   "Apply (15เม็ด)"    → { packSize: 15,   baseUnit: "เม็ด" }
 *   "เม็ด"              → { packSize: null,  baseUnit: "เม็ด" }
 *   "500ml"             → { packSize: 500,  baseUnit: "ml" }
 *   "10แผง×10เม็ด"      → { packSize: 100,  baseUnit: "เม็ด", note: "10แผง×10" }
 */
function parseUnit(raw) {
  if (!raw || raw === '-') return { packSize: null, baseUnit: raw || '-', original: raw };

  const s = String(raw).trim();

  // กรณี "แผง×เม็ด" เช่น "10แผง×10เม็ด"
  const blisterMatch = s.match(/(\d+)\s*แผง\s*[×x]\s*(\d+)\s*(เม็ด|แคปซูล|cap|tab)/i);
  if (blisterMatch) {
    const sheets = parseInt(blisterMatch[1]);
    const perSheet = parseInt(blisterMatch[2]);
    return {
      packSize: sheets * perSheet,
      baseUnit: blisterMatch[3],
      original: s,
      note: `${sheets}แผง×${perSheet}`,
    };
  }

  // กรณีมีวงเล็บ เช่น "Tablet (500เม็ด)", "Apply (15เม็ด)"
  const parenMatch = s.match(/\((\d[\d,]*)\s*(เม็ด|แคปซูล|cap|tab|ml|mg|g|iu|unit|วาย|ซอง|ขวด|หลอด|แผ่น|อัน|ชิ้น|pack|pcs)\)/i);
  if (parenMatch) {
    return {
      packSize: parseInt(parenMatch[1].replace(/,/g, '')),
      baseUnit: parenMatch[2],
      original: s,
    };
  }

  // กรณีตัวเลข + หน่วยติดกัน เช่น "1000เม็ด", "500ml"
  const directMatch = s.match(/^([\d,]+)\s*(เม็ด|แคปซูล|cap|tab|ml|mg|g|iu|unit|วาย|ซอง|ขวด|หลอด|แผ่น|อัน|ชิ้น|pack|pcs)$/i);
  if (directMatch) {
    return {
      packSize: parseInt(directMatch[1].replace(/,/g, '')),
      baseUnit: directMatch[2],
      original: s,
    };
  }

  // ไม่มีตัวเลข → เก็บเป็น baseUnit เฉยๆ
  return { packSize: null, baseUnit: s, original: s };
}

// ============================================================
// คำนวณ qty จริงจาก bill qty × packSize
// ============================================================

/**
 * qty_received = 10 (กล่อง), unit_per_bill = "1000เม็ด"
 * → totalUnits = 10,000 เม็ด
 */
function calcTotalUnits(qtyReceived, unitPerBill) {
  const parsed = parseUnit(unitPerBill);
  if (!parsed.packSize) return { total: qtyReceived, unit: parsed.baseUnit };
  return {
    total: qtyReceived * parsed.packSize,
    unit: parsed.baseUnit,
    packSize: parsed.packSize,
    qtyBills: qtyReceived,
  };
}

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

export { parseUnit, calcTotalUnits };
