// golden test: src/lib/dmsicReport.js — npm run test:dmsic
import {
  HOSP_CODE, deptGroupOf, periodRpt, periodEndDate, formatDateSend, expToText,
  buildInventoryReport, buildDistributionReport,
} from './dmsicReport.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    ได้ ${JSON.stringify(got)}\n    ควร ${JSON.stringify(want)}`}`);
};
const types = (problems) => problems.map(p => `${p.level}:${p.type}`).sort();

console.log('=== helper ===');
eq('HOSP_CODE', HOSP_CODE, 'EA0010763');
eq('กลุ่ม ห้องยา1 = 1', deptGroupOf('ห้องยา1'), '1');
eq('กลุ่ม ห้องยาG = 2', deptGroupOf('ห้องยาG'), '2');
eq('กลุ่ม IPD = 3', deptGroupOf('IPD'), '3');
eq('กลุ่ม x-ray = 4', deptGroupOf('x-ray'), '4');
eq('กลุ่ม รพสต.คูคต = 5', deptGroupOf('รพสต.คูคต'), '5');
eq('กลุ่ม ศบส.1 ช่องว่างเกิน = 6', deptGroupOf('ศูนย์บริการสาธารณสุข 1  (ชุมชนสินสมุทร) '), '6');
eq('กลุ่ม รพ.อื่น = 9', deptGroupOf('รพ.ปทุมธานี'), '9');
eq('กลุ่ม รพ.ปทุมเวศ = 9 (user ยืนยัน 19/11/2569)', deptGroupOf('รพ.ปทุมเวศ'), '9');
eq('หน่วยงานใหม่ = null ไม่เดา', deptGroupOf('ห้องผ่าตัด'), null);
eq('periodRpt', periodRpt('2026-10'), '202610');
eq('periodEndDate ต.ค.', periodEndDate('2026-10'), '20261031');
eq('periodEndDate ก.พ. อธิกสุรทิน', periodEndDate('2028-02'), '20280229');
eq('periodEndDate พ.ย.', periodEndDate('2026-11'), '20261130');
eq('formatDateSend 14 หลัก', formatDateSend(new Date(2026, 10, 5, 8, 3, 9)), '20261105080309');
eq('expToText ISO', expToText('2028-03-31'), '20280331');
eq('expToText ว่าง', expToText(''), null);
eq('expToText ไม่ใช่ ISO', expToText('31/03/2028'), null);

// --- ข้อมูลตัวอย่าง (งวด ต.ค.69 ปิดแล้ว) ---
const L = (o) => ({
  period: '2026-10', status: 'closed', drug_code: '1000112', lot: 'A1', item_type: 'ยกยอด', price_per_unit: 500,
  drug_name: 'Dicloxacillin 250mg', drug_type: 'Tablet', unit: '500เม็ด', company: 'องค์การเภสัชกรรม',
  closing_qty: 4, closing_value: 2000, exp: '2028-03-31', pack_size: 500, sub_unit: 'เม็ด', ...o,
});
const ledgerRows = [
  L({}),
  // lot เดียวกัน คนละราคา (ยกยอด(2)) → รวมเป็น 1 record
  L({ item_type: 'ยกยอด(2)', price_per_unit: 520, closing_qty: 1, closing_value: 520 }),
  // packsize ต่าง (400เม็ด) = คนละ record
  L({ lot: 'B2', unit: '400เม็ด', pack_size: 400, price_per_unit: 400, closing_qty: 2, closing_value: 800 }),
  // ยอด 0 ไม่ส่ง
  L({ lot: 'Z0', closing_qty: 0, closing_value: 0 }),
  // บันทึกเท่านั้น ไม่ส่ง
  L({ lot: 'R1', item_type: 'บันทึกเท่านั้น', price_per_unit: 0, closing_qty: 5, closing_value: 0 }),
  // เวชภัณฑ์มิใช่ยา (แม้เป็นแถวบริจาค) ไม่ส่ง
  L({ drug_code: 'S009', drug_name: 'ถุงซิบ', drug_type: 'เวชภัณฑ์มิใช่ยา', item_type: 'บริจาค', lot: '-', company: 'บริษัท ก', closing_qty: 3 }),
  // ไม่มี TPU + ไม่มี exp + หน่วย amp เทียบได้ + บริษัทไม่มีเลขภาษี + ยอดทศนิยม
  L({ drug_code: '1501115', drug_name: 'Dexamethasone 4mg/ml', drug_type: 'Injection', unit: '100amp', lot: '425266',
    company: 'บริษัท ข  จำกัด', price_per_unit: 300, closing_qty: 2.5, closing_value: 750, exp: null, pack_size: 100, sub_unit: 'amp' }),
  // หน่วย เม็ด กำกวม + ไม่มี TPU = เทียบ BASE_UNIT ไม่ได้
  L({ drug_code: '25', drug_name: 'เถาเอ็นอ่อนแคปซูล', drug_type: 'Herb', unit: '30เม็ด', lot: 'H1', company: 'องค์การเภสัชกรรม',
    price_per_unit: 60, closing_qty: 10, closing_value: 600, pack_size: 30, sub_unit: 'เม็ด' }),
];
const tpuRows = [
  { drug_code: '1000112', company: 'องค์การเภสัชกรรม', tpu_code: '623456', trade_name: 'DICLOXACILLIN GPO (dicloxacillin 250 mg) capsule', base_unit: 'capsule' },
];
const taxRows = [{ company: 'องค์การเภสัชกรรม', tax_id: '0994000158378' }];
const SEND = '20261105080309';

console.log('=== แฟ้ม 5 INVENTORY ===');
const inv = buildInventoryReport({ ledgerRows, tpuRows, taxRows, period: '2026-10', dateSend: SEND });
eq('จำนวน record (A1 รวม · B2 · Dexa · เถาเอ็นอ่อน)', inv.rows.length, 4);
const a1 = inv.rows.find(r => r.LOT_NO === 'A1');
eq('A1 รวม 2 ราคา', [a1.QTY_ONHAND, a1.VALUE_ONHAND, a1.PACK_COST], [5, 2520, 504]);
eq('A1 ฟิลด์ครบ', a1, {
  HOSP_CODE: 'EA0010763', WORKING_CODE: '1000112', TRADE_NAME: 'DICLOXACILLIN GPO (dicloxacillin 250 mg) capsule',
  TPUID: '623456', VENDOR_NAME: 'องค์การเภสัชกรรม', VENDOR_TAX_ID: '0994000158378', QTY_ONHAND: 5, PACK_SIZE: 500,
  BASE_UNIT: 'capsule', PACK_COST: 504, VALUE_ONHAND: 2520, LOT_NO: 'A1', EXPIRE_DATE: '20280331',
  DATE_ONHAND: '20261031', DATE_SEND: SEND,
});
eq('B2 packsize 400 แยกแถว', inv.rows.find(r => r.LOT_NO === 'B2').PACK_SIZE, 400);
const dexa = inv.rows.find(r => r.LOT_NO === '425266');
eq('ไม่พบ TPU → 99 + ชื่อ Master', [dexa.TPUID, dexa.TRADE_NAME], ['99', 'Dexamethasone 4mg/ml']);
eq('amp → ampoule', dexa.BASE_UNIT, 'ampoule');
eq('บริษัทตัดช่องว่างซ้ำ', dexa.VENDOR_NAME, 'บริษัท ข จำกัด');
eq('problem Dexa', types(inv.problems.filter(p => p.drug_code === '1501115')), [
  'error:ไม่มีวันหมดอายุ', 'error:ไม่มีเลขผู้เสียภาษีบริษัท', 'error:ยอดคงคลังเป็นทศนิยม (2.5)', 'warn:ไม่พบ TPU (ส่ง 99 + ชื่อยา Master)',
].sort());
eq('problem เถาเอ็นอ่อน', types(inv.problems.filter(p => p.drug_code === '25')), [
  'error:เทียบ BASE_UNIT ไม่ได้ (หน่วยย่อย "เม็ด")', 'warn:ไม่พบ TPU (ส่ง 99 + ชื่อยา Master)',
]);
eq('Dicloxacillin ไม่มี problem', inv.problems.filter(p => p.drug_code === '1000112').length, 0);
const openInv = buildInventoryReport({ ledgerRows: [L({ status: 'open' })], tpuRows, taxRows, period: '2026-10', dateSend: SEND });
eq('งวดยังไม่ปิด = error', types(openInv.problems), ['error:งวด 2026-10 ยังไม่ปิด (1 แถว)']);
const noLot = buildInventoryReport({ ledgerRows: [L({ lot: '-' })], tpuRows, taxRows, period: '2026-10', dateSend: SEND });
eq('ไม่มี lot = error', types(noLot.problems), ['error:ไม่มี Lot']);
const noPack = buildInventoryReport({ ledgerRows: [L({ pack_size: null })], tpuRows, taxRows, period: '2026-10', dateSend: SEND });
eq('ไม่มี PACK_SIZE = error', types(noPack.problems), ['error:ไม่มี PACK_SIZE']);

console.log('=== แฟ้ม 4 DISTRIBUTION ===');
const D = (o) => ({ department: 'ห้องยาG', item_type: 'ยกยอด', drug_code: '1000112', drug_name: 'Dicloxacillin 250mg',
  lot: 'A1', price_per_unit: 500, qty_out: 1, drug_type: 'Tablet', ...o });
const dispenseRows = [
  D({}),
  D({ department: 'OPD', qty_out: 2 }),                         // กลุ่ม 2 เดียวกัน → รวม
  D({ item_type: 'ยกยอด(2)', price_per_unit: 520, qty_out: 1 }), // คนละ cost layer แต่ยาเดียวกัน → รวม · มูลค่าตามราคาจริง
  D({ department: 'ห้องยา1', qty_out: 0.5 }),                   // กลุ่ม 1 · ทศนิยมได้ (FLOAT)
  D({ department: 'IPD', lot: 'B2', price_per_unit: 400, qty_out: 1 }), // packsize 400 = แถวแยก
  D({ department: 'รพ.ปทุมธานี', qty_out: 1 }),                  // ให้ รพ.อื่นยืม = 9
  D({ department: 'เบิกยาหมดอายุจากคลัง', qty_out: 9 }),        // ตัด
  D({ department: 'คืนยา', qty_out: 9 }),                        // ตัด
  D({ department: 'เบิกเพื่อแลกเปลี่ยนคืนยา', qty_out: 9 }),     // ตัด
  D({ department: 'เบิกเพิ่มจากความผิดพลาด', qty_out: 9 }),     // ตัด
  D({ item_type: 'บันทึกเท่านั้น', price_per_unit: 0, qty_out: 9 }), // ตัด
  D({ drug_code: 'S009', drug_type: 'เวชภัณฑ์มิใช่ยา', lot: '-', qty_out: 9 }), // ตัด
  // ราคาในชีทเบิกไม่ตรงแถวบัญชี แต่ lot มีแถวเดียวที่รูปเดียวกัน → ใช้ได้
  D({ price_per_unit: 499.99, qty_out: 1 }),
  // หน่วยงานใหม่ = error ไม่เดากลุ่ม
  D({ department: 'ห้องผ่าตัด', qty_out: 1 }),
  // ไม่มีแถวบัญชี
  D({ drug_code: '9999', drug_name: 'ยาไม่มีในงวด', lot: 'X', qty_out: 1 }),
];
const dist = buildDistributionReport({ dispenseRows, ledgerRows, tpuRows, period: '2026-10', dateSend: SEND });
const pick = (lotPack, group) => dist.rows.find(r => r.PACK_SIZE === lotPack && r.DIS_DEPT_GROUP === group);
eq('จำนวน record (500×กลุ่ม 1/2/9 · 400×กลุ่ม 3)', dist.rows.length, 4);
const g2 = pick(500, '2');
eq('กลุ่ม 2 รวม 5 กล่อง (1+2+1+ราคาเพี้ยน 1) มูลค่าตามราคาจริง', [g2.QTY_DIS, g2.VALUE], [5, 2519.99]);
eq('กลุ่ม 2 ฟิลด์ครบ', g2, {
  HOSP_CODE: 'EA0010763', WORKING_CODE: '1000112', TRADE_NAME: 'DICLOXACILLIN GPO (dicloxacillin 250 mg) capsule',
  TPUID: '623456', QTY_DIS: 5, PACK_SIZE: 500, BASE_UNIT: 'capsule', VALUE: 2519.99, DIS_DEPT_GROUP: '2',
  PERIOD_RPT: '202610', DATE_SEND: SEND,
});
eq('กลุ่ม 1 ทศนิยม', [pick(500, '1').QTY_DIS, pick(500, '1').VALUE], [0.5, 250]);
eq('กลุ่ม 3 packsize 400', [pick(400, '3').QTY_DIS, pick(400, '3').VALUE], [1, 400]);
eq('กลุ่ม 9 รพ.อื่น', pick(500, '9').QTY_DIS, 1);
eq('problem แฟ้มจ่าย', types(dist.problems), [
  'error:ไม่พบแถวบัญชีในงวด (ยกยอด · ราคา 500)',
  'error:หน่วยงานไม่อยู่ในตารางกลุ่มหน่วยเบิก (ห้องผ่าตัด)',
].sort());
// lot เดียวกันมีแถวบัญชี 2 บริษัท → ราคาไม่ตรง = ไม่เลือกให้
const twoCo = [L({}), L({ item_type: 'ซื้อยา', price_per_unit: 510, company: 'บริษัท อื่น' })];
const amb = buildDistributionReport({ dispenseRows: [D({ price_per_unit: 505 })], ledgerRows: twoCo, tpuRows, period: '2026-10', dateSend: SEND });
eq('ราคาไม่ตรง + lot มี 2 บริษัท = error ไม่เดา', [amb.rows.length, types(amb.problems)], [0, ['error:ไม่พบแถวบัญชีในงวด (ยกยอด · ราคา 505)']]);
// แถวเบิกยาเดียวหลายแถวชนปัญหาเดียว → แสดงครั้งเดียวพร้อม count
const dup = buildDistributionReport({ dispenseRows: [D({ department: 'ห้องผ่าตัด' }), D({ department: 'ห้องผ่าตัด' })], ledgerRows, tpuRows, period: '2026-10', dateSend: SEND });
eq('problem ซ้ำรวมเป็น count', dup.problems.map(p => p.count), [2]);

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`);
if (fail) process.exit(1);
