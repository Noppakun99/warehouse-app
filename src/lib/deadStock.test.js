// golden test: src/lib/deadStock.js — npm run test:deadstock
import {
  isRealUsage, ymOf, ymThai, drugKey, essentialGroup, buildDeadStock,
  stockLotsFromInventory, firstReceiveMap, REPORT_MONTHS, WATCH_MONTHS,
} from './deadStock.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    ได้ ${JSON.stringify(got)}\n    ควร ${JSON.stringify(want)}`}`);
};

console.log('=== เกณฑ์ ===');
eq('แจ้ง 6 · เฝ้าดู 3', [REPORT_MONTHS, WATCH_MONTHS], [6, 3]);

console.log('=== isRealUsage ===');
eq('หน่วยงานจริง', isRealUsage('ห้องยาG'), true);
eq('เบิกเพิ่มจากความผิดพลาด ไม่นับ', isRealUsage('เบิกเพิ่มจากความผิดพลาด'), false);
eq('ยาหมดอายุจากคลัง ไม่นับ', isRealUsage('เบิกยาหมดอายุจากคลัง'), false);
eq('ให้ รพ.อื่นยืม ไม่นับ', isRealUsage('รพ.ธัญบุรี'), false);
eq('บริษัท ไม่นับ', isRealUsage('บริษัท ซิลลิค ฟาร์มา'), false);
eq('องค์การเภสัชกรรม ไม่นับ', isRealUsage('องค์การเภสัชกรรม'), false);
eq('ว่าง ไม่นับ', isRealUsage(''), false);

console.log('=== helper ===');
eq('ymOf ISO', ymOf('2026-05-31'), '2026-05');
eq('ymOf Date', ymOf(new Date(2026, 10, 18)), '2026-11');
eq('ymThai', ymThai('2026-05'), 'พ.ค.69');
eq('drugKey รหัส', drugKey(' 1000112 ', 'x'), '1000112');
eq('drugKey รหัส - ใช้ชื่อ', drugKey('-', 'Formalin'), 'name:formalin');
eq('ไม่ใช่ยา', essentialGroup({ type: 'เวชภัณฑ์มิใช่ยา', name: 'ถุงมือ' }), 'ไม่ใช่ยา (ไม่ผ่าน PTC)');
eq('ยาต้านเชื้อฉีด', essentialGroup({ type: 'Injection', name: 'Ceftriaxone 1g' }), 'ยาต้านเชื้อฉีด');
eq('ยาวัณโรค', essentialGroup({ type: 'Tablet', name: 'Isoniazid 100mg' }), 'ยาโรคติดต่อตามนโยบาย');
eq('VEN Critical', essentialGroup({ type: 'Tablet', name: 'X', ven: 'Critical' }), 'V — ยาช่วยชีวิต/ฉุกเฉิน');
eq('ยาทั่วไป', essentialGroup({ type: 'Tablet', name: 'Famotidine' }), null);

console.log('=== stockLotsFromInventory ===');
const parseExp = (v) => { const m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
const inv = stockLotsFromInventory([
  { code: '1000001', name: 'Famotidine', type: 'Tablet', unit: '100เม็ด', lot: 'A1', exp: '31/12/2027', qty: '1,200', price: '35.5', location: 'E-1', item_type: 'ซื้อยา', receive_status: 'ตรวจรับแล้ว|คงไว้' },
  { code: '1000002', name: 'X', qty: 'abc', price: null, exp: '-' },
], parseExp);
eq('qty มีจุลภาค → number · price → number', [inv[0].qty, inv[0].price, inv[0].itemType, inv[0].result], [1200, 35.5, 'ซื้อยา', 'ตรวจรับแล้ว|คงไว้']);
eq('exp แปลงด้วย parseExp', inv[0].expDate?.getFullYear(), 2027);
eq('qty/price เสีย → 0 · exp - → null', [inv[1].qty, inv[1].price, inv[1].expDate], [0, 0, null]);

console.log('=== firstReceiveMap ===');
const fr = firstReceiveMap([
  { drug_code: '1', receive_date: '2026-03-05' }, { drug_code: '1', receive_date: '2025-12-01T00:00:00' },
  { drug_code: '-', drug_name: 'Formalin', receive_date: '2026-01-10' }, { drug_code: '2', receive_date: null },
]);
eq('เอาวันแรกสุด · ตัดเวลา', fr.get('1'), '2025-12-01');
eq('รหัส - ใช้ชื่อ', fr.get('name:formalin'), '2026-01-10');
eq('ไม่มีวันที่ = ไม่ใส่', fr.has('2'), false);

console.log('=== buildDeadStock ===');
const today = new Date(2026, 10, 18); // 18 พ.ย. 69 → นับถึง ต.ค.69
const lot = (code, name, qty, price, extra = {}) => ({ code, name, type: 'Tablet', unit: 'กล่อง', lot: `L${code}`, expDate: new Date(2028, 0, 1), qty, price, location: 'E-1', itemType: 'ซื้อยา', result: 'ตรวจรับแล้ว|คงไว้', supplier: '', ...extra });
const res = buildDeadStock({
  today, historyStart: '2025-10',
  stockLots: [
    lot('A', 'ยาเงียบ 8 เดือน', 10, 100),
    lot('B', 'ยาเงียบ 4 เดือน', 2, 50),
    lot('C', 'ยาเดือนนี้มีเบิก', 5, 10),
    lot('D', 'ยาเงียบ 2 เดือน', 5, 10),
    lot('E', 'ยาไม่เคยเบิก รับนานแล้ว', 3, 20),
    lot('F', 'ยาใหม่ ไม่เคยเบิก', 3, 20),
    lot('G', 'ยาของหมด', 0, 20),
    lot('A', 'ยาเงียบ 8 เดือน', 5, 0, { lot: 'LA2', itemType: 'ยาสนับสนุน' }),
  ],
  dispenses: [
    { drug_code: 'A', dispense_date: '2026-02-10', department: 'ห้องยาG', qty_out: 1 },
    { drug_code: 'A', dispense_date: '2026-01-10', department: 'ER', qty_out: 1 },
    { drug_code: 'A', dispense_date: '2026-02-20', department: 'ห้องยาG', qty_out: 1 },
    { drug_code: 'A', dispense_date: '2026-09-01', department: 'เบิกเพิ่มจากความผิดพลาด', qty_out: 1 },
    { drug_code: 'B', dispense_date: '2026-06-15', department: 'ER', qty_out: 1 },
    { drug_code: 'C', dispense_date: '2026-11-02', department: 'ER', qty_out: 1 },
    { drug_code: 'D', dispense_date: '2026-08-15', department: 'ER', qty_out: 1 },
    { drug_code: 'D', dispense_date: '2026-10-15', department: 'รพ.ธัญบุรี', qty_out: 5 },
  ],
  firstReceive: new Map([['A', '2025-10-01'], ['E', '2025-10-05'], ['F', '2026-08-01']]),
  policies: new Map([['a|la', { status: 'ok', deadlineIso: '2027-06-30', company: 'บริษัท ก' }]]),
});
eq('นับถึงเดือนที่จบแล้ว', [res.currentYm, res.lastCompleteYm], ['2026-11', '2026-10']);
const by = Object.fromEntries(res.rows.map(r => [r.code, r]));
eq('ได้เฉพาะ A B E (C เดือนนี้มีเบิก · D 2 เดือน + ให้ รพ.อื่นยืมไม่นับ · F ยาใหม่ · G ของหมด)', Object.keys(by).sort(), ['A', 'B', 'E']);
eq('A: เบิกจริงล่าสุด ก.พ. (ไม่นับเบิกเพิ่มจากความผิดพลาด) → 8 เดือน แจ้ง', [by.A.lastUseYm, by.A.idleMonths, by.A.tier], ['2026-02', 8, 'report']);
eq('A: รวม 2 lot · มูลค่าคิดรายแถว', [by.A.qty, by.A.value, by.A.lots.length], [15, 1000, 2]);
eq('A: หน่วยงานที่เคยใช้ เรียงล่าสุดก่อน', by.A.usedBy, [{ dept: 'ห้องยาG', count: 2, lastYm: '2026-02' }, { dept: 'ER', count: 1, lastYm: '2026-01' }]);
eq('A: คืนบริษัทได้ 1/2 lot (lot สนับสนุนไม่นับ) + บริษัทจากนโยบาย', [by.A.returnableLots, by.A.returnDeadline, by.A.suppliers], [1, '2027-06-30', ['บริษัท ก']]);
eq('A: ยาทั่วไป ≥6 เดือน → เสนอ PTC ได้', by.A.ptc, 'เสนอพิจารณาออกได้');
eq('B: 4 เดือน → เฝ้าดู · PTC -', [by.B.idleMonths, by.B.tier, by.B.ptc], [4, 'watch', '-']);
eq('E: ไม่เคยเบิก นับจากรับครั้งแรก ต.ค.68 → 12 เดือน', [by.E.neverUsed, by.E.idleMonths, by.E.tier, by.E.isNew], [true, 12, 'report', false]);
eq('F: ยาใหม่รับ ส.ค.69 ไม่เคยเบิก → นับจากวันรับ 2 เดือน ยังไม่ขึ้น', by.F ?? null, null);
eq('เรียงนานสุดก่อน', res.rows.map(r => r.code), ['E', 'A', 'B']);

console.log(`\nผ่าน ${pass} / ${pass + fail}`);
if (fail > 0) throw new Error(`golden test ไม่ผ่าน ${fail} ข้อ`);
