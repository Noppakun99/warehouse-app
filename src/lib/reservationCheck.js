// ตรวจยอดจองซ้ำหลังบันทึกใบเบิก (insert-then-verify — ADR-0028)
// pure module: ไม่ import supabase → golden-testable (npm run test:reservecheck)
//
// invBase  = { [codeKey]: คงเหลือรวม (หน่วยย่อยสุด) } จาก fetchInvBaseByCode
// reserved = { [codeKey]: ยอดจองรวม "รวมใบตัวเองแล้ว" } จาก fetchReservedBase
// codes    = codeKey ที่ต้องตรวจ (ใบใหม่ = ทุกรหัสในใบ · ใบแก้ไข = เฉพาะรหัสที่จำนวนเพิ่มขึ้น)
// คืน [{ code, inv, reserved, over }] เฉพาะรหัสที่ยอดจองรวมเกินคงเหลือ (เท่ากันพอดี = ไม่ชน)
export function findOverReserved({ invBase = {}, reserved = {}, codes = [] }) {
  const out = [];
  for (const code of new Set(codes)) {
    const inv = Number(invBase[code]) || 0;
    const res = Number(reserved[code]) || 0;
    if (res > inv) out.push({ code, inv, reserved: res, over: res - inv });
  }
  return out;
}

// ยอดที่ใบนี้เบิกได้จริง = คงเหลือ − ยอดจองของใบอื่น (ยอดจองรวม − ของใบตัวเอง) ไม่ติดลบ
export function availableForOwn({ inv = 0, reserved = 0, own = 0 }) {
  return Math.max(0, (Number(inv) || 0) - ((Number(reserved) || 0) - (Number(own) || 0)));
}

// รหัสที่จำนวนในใบแก้ไขเพิ่มขึ้นจากของเดิม (รวมต่อรหัส — ใบเดียวอาจมีรหัสซ้ำหลายบรรทัด)
// before/after = [{ code, qty }] · keyOf = ตัวแปลงรหัสเป็น key เดียวกับ invBase/reserved
export function increasedCodes(before = [], after = [], keyOf = (c) => c) {
  const sum = (rows) => rows.reduce((m, r) => {
    const k = keyOf(r.code);
    if (k) m[k] = (m[k] || 0) + (Number(r.qty) || 0);
    return m;
  }, {});
  const b = sum(before), a = sum(after);
  return Object.keys(a).filter(k => a[k] > (b[k] || 0));
}
