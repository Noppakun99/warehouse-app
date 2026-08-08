// ledgerRollover.js
// Logic บัญชีคงคลังรายเดือน (Monthly Stock Ledger) — ADR-0007
// pure module — ไม่ import supabase (test ได้ด้วย node ตรงๆ; db.js ทำ I/O แยก)
//
// สมการคงคลัง (ทุกแถวบัญชีต้องเป็นจริงทุกงวด):
//   จำนวน:  closing_qty   = opening_qty + in_qty − out_qty + adjust_qty
//   มูลค่า:  closing_value = carry_in_value + in_value − out_value + adjust_value
//
// แถวบัญชี (ledger row) identity = drug_code + lot + item_type + price_per_unit (= cost layer)

// ชนิดรายการที่ถูกแปลงตอนขึ้นเดือนใหม่ (ของซื้อ/รับเดือนก่อน → ยอดยกมา)
const ROLLOVER_TYPE_MAP = {
  'ซื้อยา': 'ยกยอด',
  'ซื้อยา(2)': 'ยกยอด(2)',
  'ซื้อยา(3)': 'ยกยอด(3)',
  'บริจาค': 'บริจาค-ยกยอด',
};

// ชนิดรายการ adjustment — ต้องลบทิ้งก่อนขึ้นเดือนใหม่ ไม่ค้างข้ามงวด
const ADJUST_TYPE = 'แก้ไขระบบ';

const num = (v) => (typeof v === 'number' ? v : parseFloat(v) || 0);
const round4 = (v) => Math.round(num(v) * 1e4) / 1e4;

/**
 * คำนวณ closing (จำนวน+มูลค่า) ของแถวบัญชีหนึ่งแถว จาก opening/in/out/adjust
 * mutate ไม่ได้ — คืน object ใหม่พร้อม closing_qty / closing_value
 */
export function computeClosing(row) {
  const closing_qty =
    num(row.opening_qty) + num(row.in_qty) - num(row.out_qty) + num(row.adjust_qty);
  const closing_value = round4(
    num(row.carry_in_value) + num(row.in_value) - num(row.out_value) + num(row.adjust_value)
  );
  return { ...row, closing_qty, closing_value };
}

/**
 * แปลงทุกแถวของงวด → เติม closing ให้ครบ (derive สด)
 */
export function computeLedgerClosings(rows) {
  return rows.map(computeClosing);
}

/**
 * ขึ้นเดือนใหม่ (Month Rollover) — ADR-0007 ข้อ 3
 * รับแถวงวดที่ปิด (มี closing แล้ว) → คืนแถวตั้งต้นของงวดถัดไป
 *   - opening_qty      ← closing_qty       (U → S)
 *   - carry_in_value   ← closing_value     (AB → AC)
 *   - in/out/adjust    = 0                 (เริ่มนับใหม่)
 *   - item_type        แปลงตาม ROLLOVER_TYPE_MAP (ซื้อยา → ยกยอด ฯลฯ)
 *   - แถว 'แก้ไขระบบ'  ถูกตัดทิ้ง (ไม่ยกไปงวดใหม่)
 *
 * @param closedRows  แถวงวดที่ปิด (ต้องผ่าน computeClosing มาแล้ว)
 * @param nextPeriod  'YYYY-MM' ของงวดถัดไป
 */
export function rolloverToNextPeriod(closedRows, nextPeriod) {
  return closedRows
    .filter((r) => r.item_type !== ADJUST_TYPE)
    .map((r) => {
      const item_type = ROLLOVER_TYPE_MAP[r.item_type] || r.item_type;
      const opening_qty = num(r.closing_qty);
      const carry_in_value = round4(r.closing_value);
      return {
        period: nextPeriod,
        status: 'open',
        drug_code: r.drug_code,
        lot: r.lot,
        item_type,
        price_per_unit: round4(r.price_per_unit),
        drug_name: r.drug_name,
        drug_type: r.drug_type,
        unit: r.unit,
        med_category: r.med_category,
        company: r.company,
        opening_qty,
        in_qty: 0,
        out_qty: 0,
        adjust_qty: 0,
        closing_qty: opening_qty, // ยังไม่มี movement → closing = opening
        carry_in_value,
        in_value: 0,
        out_value: 0,
        adjust_value: 0,
        closing_value: carry_in_value,
      };
    });
}

export { ROLLOVER_TYPE_MAP, ADJUST_TYPE };
