// lotAllocation.test.js — golden test สำหรับ allocateFefo
// รัน: node src/lib/lotAllocation.test.js
// กฎ (ADR-0005): จ่ายเป็นกล่องเต็ม ไม่แกะกล่อง — เศษปัดขึ้นเป็นกล่อง (จ่ายเกิน) เฉพาะ lot สุดท้าย

import { allocateFefo, sortLotsForDispense, lotOrderNote } from './lotAllocation.js';

let pass = 0, fail = 0;
function check(label, got, expect) {
  const ok = JSON.stringify(got) === JSON.stringify(expect);
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`);
  if (!ok) console.log(`   got:    ${JSON.stringify(got)}\n   expect: ${JSON.stringify(expect)}`);
}

// Atorvastatin 1680056: กล่องละ 30 เม็ด
const ator = [
  { lot: 'CH643', exp: '2029-03-27', unit: '30เม็ด', packSize: 30, packs: 595, base: 17850 },
];

// 1) ขอ 10,000 (ไม่ลงตัวกล่อง 30) → 334 กล่อง = 10,020 (เกิน 20) — ไม่แกะกล่อง
const r1 = allocateFefo(10000, ator);
check('ขอ 10,000 กล่อง30 → ปัดขึ้น 334 กล่อง', r1.allocation, [
  { lot: 'CH643', exp: '2029-03-27', unit: '30เม็ด', packSize: 30, base: 10020, packs: 334 },
]);
check('ขอ 10,000 → over 20, ครบ', [r1.allocatedBase, r1.shortfallBase, r1.overBase, r1.fulfilled], [10020, 0, 20, true]);

// 2) ขอลงตัวกล่องพอดี 300 (10 กล่อง) → ไม่เกิน
const r2 = allocateFefo(300, ator);
check('ขอ 300 (ลงตัว) → 10 กล่อง พอดี', [r2.allocatedBase, r2.overBase], [300, 0]);

// Acetaminophen: lot 30เม็ด split หลาย lot
const acet = [
  { lot: 'A', exp: '2030-01-01', unit: '30เม็ด', packSize: 30, packs: 2, base: 60 },   // 2 กล่อง = 60
  { lot: 'B', exp: '2031-01-01', unit: '30เม็ด', packSize: 30, packs: 100, base: 3000 },
];

// 3) ขอ 100 → lot A เต็ม (60) + lot B ปัดขึ้น (ceil(40/30)=2 กล่อง=60) = 120, เกิน 20
const r3 = allocateFefo(100, acet);
check('split: lot A เต็ม + lot B ปัดขึ้น', r3.allocation, [
  { lot: 'A', exp: '2030-01-01', unit: '30เม็ด', packSize: 30, base: 60, packs: 2 },
  { lot: 'B', exp: '2031-01-01', unit: '30เม็ด', packSize: 30, base: 60, packs: 2 },
]);
check('split → allocated 120, over 20', [r3.allocatedBase, r3.overBase, r3.fulfilled], [120, 20, true]);

// 4) ขอเกินคงเหลือทั้งหมด (มี 60+3000=3060 → ขอ 5000) → จัดได้ 3060 ขาด 1940
const r4 = allocateFefo(5000, acet);
check('ขอเกิน → shortfall', [r4.allocatedBase, r4.shortfallBase, r4.fulfilled], [3060, 1940, false]);

// 5) amp packSize=1 → ลงตัวเสมอ ไม่มีเกิน
const amp = [{ lot: 'X', exp: '2027-01-01', unit: 'amp', packSize: 1, packs: 50, base: 50 }];
const r5 = allocateFefo(30, amp);
check('amp (packSize=1) ขอ 30 — ไม่เกิน', [r5.allocatedBase, r5.overBase, r5.allocation[0].packs], [30, 0, 30]);

// ── ลำดับจ่าย: ยาซื้อ exp ≤6 เดือน → ยาสนับสนุน → ที่เหลือ (หัวหน้าสั่ง 14/10/2569) ──
const iso = (s) => (s ? new Date(`${s}T00:00:00`) : null);
const TODAY = new Date('2026-10-14T00:00:00');
const names = (ls) => ls.map(l => l.lot);

// 6) Para 500: ยาซื้อ exp ไกล 2 lot + ยาสนับสนุน สสจ. → สนับสนุนขึ้นก่อน (แม้ exp ช้ากว่าบาง lot)
const para = [
  { lot: 'P1', exp: '2031-02-28', itemType: 'ยกยอด',   packSize: 1000, packs: 3,  base: 3000 },
  { lot: 'S1', exp: '2031-03-01', itemType: 'สนับสนุน', packSize: 1000, packs: 53, base: 53000 },
  { lot: 'P2', exp: '2031-07-22', itemType: 'ซื้อยา',  packSize: 1000, packs: 10, base: 10000 },
];
check('สนับสนุนก่อนยาซื้อ', names(sortLotsForDispense(para, iso, TODAY)), ['S1', 'P1', 'P2']);

// 7) ยาซื้อที่หมดอายุภายใน 6 เดือน → ขึ้นก่อนยาสนับสนุน · เกิน 6 เดือนไม่ขึ้น
const mix = [
  { lot: 'S1', exp: '2027-01-01', itemType: 'สนับสนุน2', base: 10 },
  { lot: 'P6', exp: '2027-04-14', itemType: 'ซื้อยา', base: 10 },   // ครบ 6 เดือนพอดี → กลุ่มแรก
  { lot: 'P7', exp: '2027-04-15', itemType: 'ซื้อยา', base: 10 },   // เกิน 6 เดือน 1 วัน → กลุ่มท้าย
  { lot: 'P3', exp: '2027-01-10', itemType: 'ยกยอด',  base: 10 },
];
check('ยาซื้อ ≤6 เดือนก่อน แล้วสนับสนุน แล้วที่เหลือ', names(sortLotsForDispense(mix, iso, TODAY)), ['P3', 'P6', 'S1', 'P7']);

// 8) บริจาค / ยาโครงการ ไม่นับเป็นยาสนับสนุน — เรียง FEFO ปนยาซื้อ · ไม่มี exp ไว้ท้ายกลุ่ม · ไม่แก้ array เดิม
const donate = [
  { lot: 'D1', exp: '2029-01-01', itemType: 'บริจาค-ยกยอด', base: 5 },
  { lot: 'N1', exp: '',           itemType: 'ยกยอด',        base: 5 },
  { lot: 'Q1', exp: '2028-01-01', itemType: 'ยาโครงการ',     base: 5 },
];
check('บริจาค/ยาโครงการ = FEFO ปกติ, ไม่มี exp ท้าย', names(sortLotsForDispense(donate, iso, TODAY)), ['Q1', 'D1', 'N1']);
check('ไม่แก้ array เดิม', names(donate), ['D1', 'N1', 'Q1']);

// 9) clamp วันสิ้นเดือน: 31/8 + 6 เดือน = 28/2 (ไม่ล้นเป็น 3/3)
const endOfMonth = [{ lot: 'X', exp: '2027-03-01', itemType: 'ซื้อยา', base: 1 }, { lot: 'S', exp: '2030-01-01', itemType: 'สนับสนุน', base: 1 }];
check('31/8 + 6 เดือน = 28/2 → 1/3 ไม่ใช่กลุ่มใกล้หมดอายุ', names(sortLotsForDispense(endOfMonth, iso, new Date('2026-08-31T00:00:00'))), ['S', 'X']);

// 10) หมายเหตุ lot ไม่เรียง exp — จ่ายสนับสนุน S1 ข้าม P1 (exp ก่อน)
const sorted = sortLotsForDispense(para.map(l => ({ ...l, baseUnit: 'เม็ด' })), iso, TODAY);
const a10 = allocateFefo(5000, sorted);
check('จ่าย 5,000 จาก S1 อย่างเดียว', names(a10.allocation), ['S1']);
check('หมายเหตุข้าม exp', lotOrderNote(a10.allocation, sorted, iso),
  'lot ไม่เรียง exp: จ่ายยาสนับสนุนก่อน (lot P1 exp 2031-02-28 ยังเหลือ 3,000 เม็ด)');

// 11) จ่ายเรียง exp ปกติ → ไม่มีหมายเหตุ · จ่าย P1 หมดแล้วต่อ P2 ก็ไม่ใช่การข้าม
const fefo = sortLotsForDispense(ator.map(l => ({ ...l, itemType: 'ยกยอด' })), iso, TODAY);
check('FEFO ปกติ ไม่มีหมายเหตุ', lotOrderNote(allocateFefo(300, fefo).allocation, fefo, iso), '');
const twoBuy = [
  { lot: 'P1', exp: '2031-02-28', itemType: 'ยกยอด', packSize: 1, base: 3 },
  { lot: 'P2', exp: '2031-07-22', itemType: 'ซื้อยา', packSize: 1, base: 10 },
];
check('ใช้ lot ก่อนหมดแล้วต่อ lot ถัดไป = ไม่ข้าม', lotOrderNote(allocateFefo(5, twoBuy).allocation, twoBuy, iso), '');

console.log(`\nผล: ${pass}/${pass + fail} ผ่าน, ${fail} ไม่ผ่าน`);
if (fail > 0) process.exitCode = 1;
