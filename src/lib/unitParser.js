// unitParser.js
// แยก packSize จาก "หน่วยยา" string ผสม เช่น "1000เม็ด", "Tablet (500เม็ด)", "10แผง×10เม็ด"
// ใช้แปลงคงเหลือราย lot → หน่วยย่อยสุด (เม็ด) เพื่อรวมข้ามหน่วยในการเบิกระดับยา (ADR-0004)
// test: src/unitParser.test.js

/**
 * แยก unit string → { packSize, baseUnit, original }
 *   "1000เม็ด"          → { packSize: 1000, baseUnit: "เม็ด" }
 *   "Tablet (500เม็ด)"  → { packSize: 500,  baseUnit: "เม็ด" }
 *   "10แผง×10เม็ด"      → { packSize: 100,  baseUnit: "เม็ด" }
 *   "เม็ด" / "amp"      → { packSize: null, baseUnit: "เม็ด" }  (ไม่มีตัวเลข = หน่วยย่อยอยู่แล้ว)
 */
export function parseUnit(raw) {
  if (!raw || raw === '-') return { packSize: null, baseUnit: raw || '-', original: raw };

  const s = String(raw).trim();

  // "แผง×เม็ด" เช่น "10แผง×10เม็ด"
  const blisterMatch = s.match(/(\d+)\s*แผง\s*[×x]\s*(\d+)\s*(เม็ด|แคปซูล|cap|tab)/i);
  if (blisterMatch) {
    const sheets = parseInt(blisterMatch[1]);
    const perSheet = parseInt(blisterMatch[2]);
    return { packSize: sheets * perSheet, baseUnit: blisterMatch[3], original: s, note: `${sheets}แผง×${perSheet}` };
  }

  // วงเล็บ เช่น "Tablet (500เม็ด)", "Apply (15เม็ด)"
  const parenMatch = s.match(/\((\d[\d,]*)\s*(เม็ด|แคปซูล|cap|tab|ml|mg|g|iu|unit|วาย|ซอง|ขวด|หลอด|แผ่น|อัน|ชิ้น|pack|pcs)\)/i);
  if (parenMatch) {
    return { packSize: parseInt(parenMatch[1].replace(/,/g, '')), baseUnit: parenMatch[2], original: s };
  }

  // ตัวเลข + หน่วยติดกัน เช่น "1000เม็ด", "500ml"
  const directMatch = s.match(/^([\d,]+)\s*(เม็ด|แคปซูล|cap|tab|ml|mg|g|iu|unit|วาย|ซอง|ขวด|หลอด|แผ่น|อัน|ชิ้น|pack|pcs)$/i);
  if (directMatch) {
    return { packSize: parseInt(directMatch[1].replace(/,/g, '')), baseUnit: directMatch[2], original: s };
  }

  // ไม่มีตัวเลข → หน่วยย่อยอยู่แล้ว
  return { packSize: null, baseUnit: s, original: s };
}

/**
 * qty ในหน่วยบรรจุ × packSize → จำนวนหน่วยย่อยสุด
 *   calcTotalUnits(10, "1000เม็ด") → { total: 10000, unit: "เม็ด", packSize: 1000 }
 *   calcTotalUnits(100, "เม็ด")    → { total: 100, unit: "เม็ด" }  (ไม่มี packSize = qty เป็นหน่วยย่อยอยู่แล้ว)
 */
export function calcTotalUnits(qtyReceived, unitPerBill) {
  const parsed = parseUnit(unitPerBill);
  const qty = parseFloat(qtyReceived) || 0;
  if (!parsed.packSize) return { total: qty, unit: parsed.baseUnit };
  return { total: qty * parsed.packSize, unit: parsed.baseUnit, packSize: parsed.packSize, qtyBills: qty };
}
