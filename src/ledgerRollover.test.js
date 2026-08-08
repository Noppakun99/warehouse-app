/**
 * ledgerRollover.test.js — golden test สำหรับ src/lib/ledgerRollover.js
 * รัน: node src/ledgerRollover.test.js
 * ครอบ: สมการคงคลัง (closing) + ขึ้นเดือนใหม่ (rollover) — ADR-0007
 */

import {
  computeClosing,
  computeLedgerClosings,
  rolloverToNextPeriod,
} from './lib/ledgerRollover.js';

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}`); }
}

// ============================================================
// 1. computeClosing — สมการคงคลัง
// ============================================================
console.log('=== computeClosing (closing = opening + in − out + adjust) ===\n');

const r1 = computeClosing({
  opening_qty: 100, in_qty: 50, out_qty: 30, adjust_qty: 0,
  carry_in_value: 1000, in_value: 500, out_value: 300, adjust_value: 0,
});
check('จำนวน: 100 + 50 − 30 = 120', r1.closing_qty === 120);
check('มูลค่า: 1000 + 500 − 300 = 1200', r1.closing_value === 1200);

const r2 = computeClosing({
  opening_qty: 5, in_qty: 0, out_qty: 10, adjust_qty: 0,   // เบิกเกิน → ติดลบ (ปล่อยให้ flag ทีหลัง)
  carry_in_value: 100, in_value: 0, out_value: 0, adjust_value: 0,
});
check('จำนวนติดลบได้: 5 − 10 = −5', r2.closing_qty === -5);

const r3 = computeClosing({
  opening_qty: 0, in_qty: 0, out_qty: 0, adjust_qty: 0,
  carry_in_value: 0, in_value: 0, out_value: 0, adjust_value: -670, // แถวแก้ไขระบบล้างยอด
});
check('adjust มูลค่า: 0 + (−670) = −670', r3.closing_value === -670);

// round 4 ตำแหน่ง (กัน float drift)
const r4 = computeClosing({
  opening_qty: 1, in_qty: 0, out_qty: 0, adjust_qty: 0,
  carry_in_value: 1.1, in_value: 2.2, out_value: 0, adjust_value: 0,
});
check('มูลค่า round 4dp: 1.1 + 2.2 = 3.3 (ไม่ใช่ 3.3000000000000003)', r4.closing_value === 3.3);

check('computeLedgerClosings map ครบทุกแถว',
  computeLedgerClosings([{ opening_qty: 1 }, { opening_qty: 2 }]).length === 2);

// ============================================================
// 2. rolloverToNextPeriod — ขึ้นเดือนใหม่
// ============================================================
console.log('\n=== rolloverToNextPeriod (U→S, AB→AC, แปลงชนิด, ลบแก้ไขระบบ) ===\n');

const closed = [
  { drug_code: '1000227', lot: '194584', item_type: 'ซื้อยา', price_per_unit: 220,
    closing_qty: 55, closing_value: 12100, drug_name: 'Para', drug_type: 'Tablet',
    unit: '1000เม็ด', med_category: 'เวชภัณฑ์ยา', company: 'X' },
  { drug_code: '1460050', lot: 'B256110', item_type: 'ยกยอด', price_per_unit: 16,
    closing_qty: 180, closing_value: 2880, drug_name: 'Antacid', drug_type: 'Syrup',
    unit: 'ขวด', med_category: 'เวชภัณฑ์ยา', company: 'Y' },
  { drug_code: '1470506', lot: '-', item_type: 'แก้ไขระบบ', price_per_unit: 0,
    closing_qty: 0, closing_value: -670, drug_name: 'Chlorhex', drug_type: 'Apply',
    unit: 'bott', med_category: 'เวชภัณฑ์มิใช่ยา', company: '-' },
];

const next = rolloverToNextPeriod(closed, '2026-07');

check('ลบแถวแก้ไขระบบ → เหลือ 2 แถว', next.length === 2);
check('ทุกแถว period = งวดถัดไป', next.every(r => r.period === '2026-07'));
check('ทุกแถว status = open', next.every(r => r.status === 'open'));

const para = next.find(r => r.drug_code === '1000227');
check('ซื้อยา → ยกยอด', para.item_type === 'ยกยอด');
check('closing_qty (55) → opening_qty', para.opening_qty === 55);
check('closing_value (12100) → carry_in_value', para.carry_in_value === 12100);
check('in/out/adjust รีเซ็ตเป็น 0', para.in_qty === 0 && para.out_qty === 0 && para.adjust_qty === 0);
check('closing_qty เริ่มต้น = opening_qty (ยังไม่มี movement)', para.closing_qty === 55);
check('closing_value เริ่มต้น = carry_in_value', para.closing_value === 12100);
check('descriptive ยกมาครบ (drug_name/unit/med_category)',
  para.drug_name === 'Para' && para.unit === '1000เม็ด' && para.med_category === 'เวชภัณฑ์ยา');

const antacid = next.find(r => r.drug_code === '1460050');
check('ยกยอด คง ยกยอด (ไม่อยู่ใน map)', antacid.item_type === 'ยกยอด');

// suffix mapping
const sfx = rolloverToNextPeriod([
  { drug_code: 'A', lot: '-', item_type: 'ซื้อยา(2)', price_per_unit: 1,
    closing_qty: 10, closing_value: 10 },
], '2026-07');
check('ซื้อยา(2) → ยกยอด(2)', sfx[0].item_type === 'ยกยอด(2)');

console.log(`\nผล: ${pass} ผ่าน, ${fail} ไม่ผ่าน`);
if (fail > 0) process.exitCode = 1;
