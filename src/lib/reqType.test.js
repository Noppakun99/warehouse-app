// golden test: src/lib/reqType.js — npm run test:reqtype
import { reqTypeOfMainLog, reqTypeOfRows, entryUnitOf, reqTypeLabel } from './reqType.js';

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
eq('ป้ายประเภท', reqTypeLabel('supply'), 'ถุง/ขวด/ตลับ');

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`);
if (fail) process.exit(1);
