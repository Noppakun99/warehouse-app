// golden test: src/lib/reqType.js — npm run test:reqtype
import { reqTypeOfMainLog, reqTypeOfRows, entryUnitOf, reqTypeLabel, entryQtyText, packWord } from './reqType.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    ได้ ${JSON.stringify(got)}\n    ควร ${JSON.stringify(want)}`}`);
};

console.log('=== reqTypeOfMainLog ===');
eq('คลังน้ำเกลือ → saline', reqTypeOfMainLog('คลังน้ำเกลือ'), 'saline');
eq('คลังถุง/ขวด/ตลับ → supply', reqTypeOfMainLog('คลังถุง/ขวด/ตลับ'), 'supply');
eq('ช่องว่างปน → supply', reqTypeOfMainLog(' คลังถุง / ขวด / ตลับ '), 'supply');
eq('ชั้น C (Gelofusine) → drug', reqTypeOfMainLog('C'), 'drug');
eq('ตู้เย็น → drug', reqTypeOfMainLog('ตู้เย็นชั้น4'), 'drug');
eq('ว่าง → drug', reqTypeOfMainLog(null), 'drug');

console.log('=== reqTypeOfRows ===');
eq('แถวส่วนใหญ่น้ำเกลือ', reqTypeOfRows([{ main_log: 'คลังน้ำเกลือ' }, { main_log: 'คลังน้ำเกลือ' }, { main_log: 'E' }]), 'saline');
eq('ไม่มีแถว → drug', reqTypeOfRows([]), 'drug');

console.log('=== entryUnitOf ===');
eq('bott ไม่มีขนาด', entryUnitOf({ unit: 'bott', packSizes: [null] }), { packSize: 1, label: 'bott', hint: null });
eq('SWI 1000ml คีย์เป็นขวด', entryUnitOf({ unit: '1000ml', packSizes: [1000, 1000] }), { packSize: 1000, label: '1000ml', hint: null });
eq('SWI 10ml 50amp บอกขนาด', entryUnitOf({ unit: '50amp', packSizes: [null] }), { packSize: 1, label: '50amp', hint: '1 50amp = 50 amp' });
eq('lot ต่างขนาด → คีย์หน่วยย่อย', entryUnitOf({ unit: '1000เม็ด', baseUnit: 'เม็ด', packSizes: [1000, 500] }), { packSize: 1, label: 'เม็ด', hint: null });
console.log('=== เลือกขนาดกล่อง (packUnits) ===');
const diclox = entryUnitOf({ unit: '500เม็ด', baseUnit: 'เม็ด', packUnits: [{ packSize: 400, unit: '400เม็ด' }, { packSize: 500, unit: '500เม็ด' }, { packSize: 400, unit: '400เม็ด' }] });
eq('Dicloxa 2 ขนาด → options ตามลำดับจ่าย', diclox.options.map(o => o.label), ['กล่อง (400เม็ด)', 'กล่อง (500เม็ด)']);
eq('Dicloxa ค่าเริ่ม = lot แรก', diclox.defaultPack, 400);
eq('Dicloxa ไม่เลือก = หน่วยย่อย', [diclox.packSize, diclox.label], [1, 'เม็ด']);
const hista = entryUnitOf({ unit: '12หลอด', baseUnit: 'หลอด', packUnits: [{ packSize: 12, unit: '12หลอด' }, { packSize: null, unit: 'หลอด' }] });
eq('แพ็ค + หน่วยย่อยปน → มีตัวเลือกหน่วยย่อย', hista.options.map(o => [o.packSize, o.label]), [[12, 'กล่อง (12หลอด)'], [1, 'หลอด']]);
eq('ขนาดเดียว + packUnits = กฎเดิม', entryUnitOf({ unit: '1000ml', packSizes: [1000], packUnits: [{ packSize: 1000, unit: '1000ml' }] }), { packSize: 1000, label: '1000ml', hint: null });
eq('ยาน้ำ = ลัง', packWord('ขวด'), 'ลัง');
eq('bott = ลัง', packWord('bott'), 'ลัง');
eq('เม็ด = กล่อง', packWord('เม็ด'), 'กล่อง');
eq('ข้อความ 2 กล่อง (400เม็ด)', entryQtyText(800, 400, '400เม็ด', 'เม็ด'), '2 กล่อง (400เม็ด)');
eq('ยาน้ำ 3 ลัง (12ขวด)', entryQtyText(36, 12, '12ขวด', 'ขวด'), '3 ลัง (12ขวด)');
eq('แก้จนไม่เต็มกล่อง → ทศนิยม', entryQtyText(1000, 400, '400เม็ด', 'เม็ด'), '2.5 กล่อง (400เม็ด)');
eq('ไม่ได้เลือกขนาด → null', entryQtyText(800, null, null, 'เม็ด'), null);
eq('เลือกหน่วยย่อย → null', entryQtyText(800, 1, 'เม็ด', 'เม็ด'), null);
eq('ป้ายประเภท', reqTypeLabel('supply'), 'ถุง/ขวด/ตลับ');

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`);
if (fail) process.exit(1);
