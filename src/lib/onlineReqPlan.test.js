// golden test: src/lib/onlineReqPlan.js — npm run test:onlinereq
import { planRequisition, sheetDept, PLACEHOLDER } from './onlineReqPlan.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    ได้ ${JSON.stringify(got)}\n    ควร ${JSON.stringify(want)}`}`);
};

const today = new Date(2026, 10, 13);
const d = (y, m, day) => new Date(y, m - 1, day);
let rowNo = 100;
const M = (o) => ({ row: rowNo++, status: 'ตรวจรับแล้ว', result: 'คงไว้', location: 'A-1', code: 'X1', name: 'ยา X', unit: '100เม็ด', price: 10,
  lot: 'L1', exp: '01/01/2028', expDate: d(2028, 1, 1), itemType: 'ยกยอด', u: 10, receiveDate: 1, invoice: 'B1', ...o });
const req = (items) => ({ department: 'ห้องยา G', items: items.map((x, i) => ({ id: i + 1, drug_code: 'X1', drug_name: 'ยา X', ...x })) });
const short = (p) => p.lines.map(l => `${l.lot}/${l.itemType}×${l.q}${l.w != null ? ` W${l.w} ${l.x}` : ''}`);

console.log('=== sheetDept ===');
eq('ห้องยา G → ห้องยาG', sheetDept('ห้องยา G'), 'ห้องยาG');
eq('ER (ฉุกเฉิน) → ER', sheetDept('ER (ฉุกเฉิน)'), 'ER');

console.log('=== ลำดับ lot ===');
{
  const p = planRequisition(req([{ requested_qty: 500 }]), [
    M({ lot: 'OLD', expDate: d(2027, 8, 1), exp: '01/08/2027', u: 3 }),
    M({ lot: 'NEW', expDate: d(2028, 6, 1), exp: '01/06/2028', u: 10 }),
  ], { today });
  eq('FEFO แตก 2 แถว', short(p), ['OLD/ยกยอด×3', 'NEW/ยกยอด×2']);
  eq('lot เก่าหมด บอกคงคลังรวม', p.lines[0].note, 'lot OLD หมด · คงคลังรวม 8 (lot NEW)');
  eq('allocation onhand = หน่วยย่อย', p.items[0].allocation.map(a => [a.lot, a.base, a.onhand]), [['OLD', 300, 300], ['NEW', 200, 1000]]);
}
{
  const p = planRequisition(req([{ requested_qty: 200 }]), [
    M({ lot: 'BUY', expDate: d(2027, 6, 1), exp: '01/06/2027', u: 10 }),
    M({ lot: 'SUP', expDate: d(2028, 6, 1), exp: '01/06/2028', u: 10, itemType: 'สนับสนุน' }),
  ], { today });
  eq('ยาสนับสนุนก่อน', short(p), ['SUP/สนับสนุน×2']);
  eq('หมายเหตุ lot ไม่เรียง exp', /lot ไม่เรียง exp: จ่ายยาสนับสนุนก่อน/.test(p.lines[0].note), true);
}
{
  const p = planRequisition(req([{ requested_qty: 100 }]), [
    M({ lot: 'SUP', expDate: d(2028, 6, 1), u: 10, itemType: 'สนับสนุน' }),
    M({ lot: 'SOON', expDate: d(2027, 3, 1), exp: '01/03/2027', u: 10 }),
  ], { today });
  eq('ยาซื้อ exp ≤6 เดือน ก่อนสนับสนุน', short(p), ['SOON/ยกยอด×1']);
  eq('exp <7 เดือน ขึ้นหมายเหตุ', p.lines[0].note.includes('exp 01/03/2570 ใกล้หมดอายุ'), true);
}
{
  const p = planRequisition(req([{ requested_qty: 100 }]), [
    M({ lot: 'EXP', expDate: d(2026, 10, 1), u: 10 }),
    M({ lot: 'OK', expDate: d(2028, 1, 1), u: 10 }),
  ], { today });
  eq('ข้าม lot หมดอายุแล้ว', short(p), ['OK/ยกยอด×1']);
}
{
  const p = planRequisition(req([{ requested_qty: 3 }]), [
    M({ lot: '-', exp: '-', expDate: null, unit: 'ขวด', price: 2.9, u: 5, receiveDate: 10 }),
    M({ lot: '-', exp: '-', expDate: null, unit: 'ขวด', price: 0, u: 5, receiveDate: 20, itemType: 'ยกยอด(2)' }),
  ], { today });
  eq('ไม่มี exp = รับก่อนจ่ายก่อน', short(p), ['-/ยกยอด×3']);
  eq('lot เดียวกันหลายแถว บอกยอดทั้ง lot', p.lines[0].note, 'lot - ยังเหลือ 7 · คงคลังรวม 7');
}

console.log('=== จ่ายไม่ครบ ===');
{
  const p = planRequisition(req([{ requested_qty: 500 }]), [
    M({ lot: 'A', u: 2 }),
    M({ lot: 'P', u: 10, status: 'รอตรวจรับ', invoice: 'INV9' }),
  ], { today });
  eq('จ่ายเท่าที่มี + รอตรวจรับ', short(p), ['A/ยกยอด×2 W5 รอตรวจรับ']);
  eq('หมายเหตุ เบิก/จ่าย/บิล', p.lines[0].note.startsWith('เบิก 5 จ่าย 2 · รอตรวจรับ 10 (บิล INV9)'), true);
}
{
  const p = planRequisition(req([{ requested_qty: 300 }]), [M({ lot: 'A', u: 0 })], { today });
  eq('ไม่มีของ = แถวจ่าย 0', short(p), ['A/ยกยอด×0 W3 ยาหมด-รอของส่ง']);
  eq('ต้องเติมวันแจ้งสั่งซื้อ', p.lines[0].note.includes(PLACEHOLDER), true);
  eq('allocation ว่าง', p.items[0].allocation, []);
}
{
  const p = planRequisition(req([{ requested_qty: 500 }]), [M({ lot: 'A', u: 2 })], { today });
  eq('ของไม่พอ จ่ายหมด', short(p), ['A/ยกยอด×2 W5 ของไม่พอ']);
}
{
  const p = planRequisition(req([{ requested_qty: 100, drug_code: 'NOPE' }]), [M({})], { today });
  eq('ไม่พบรหัส = ไม่มีแถว + flag', [p.lines.length, p.items[0].flags[0]], [0, 'ไม่พบรหัสใน Master — ถาม user']);
}

console.log('=== รายการซ้ำรหัสในใบเดียว ===');
{
  const p = planRequisition(req([{ requested_qty: 100 }, { requested_qty: 100 }]), [M({ lot: 'A', u: 1 }), M({ lot: 'B', u: 5 })], { today });
  eq('แถว Master ไม่ถูกใช้ซ้ำ', short(p), ['A/ยกยอด×1', 'B/ยกยอด×1']);
}

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`);
if (fail) process.exit(1);
