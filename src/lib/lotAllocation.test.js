// lotAllocation.test.js — golden test สำหรับ allocateFefo
// รัน: node src/lib/lotAllocation.test.js
// กฎ (ADR-0005): จ่ายเป็นกล่องเต็ม ไม่แกะกล่อง — เศษปัดขึ้นเป็นกล่อง (จ่ายเกิน) เฉพาะ lot สุดท้าย

import { allocateFefo } from './lotAllocation.js';

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

console.log(`\nผล: ${pass}/${pass + fail} ผ่าน, ${fail} ไม่ผ่าน`);
if (fail > 0) process.exitCode = 1;
