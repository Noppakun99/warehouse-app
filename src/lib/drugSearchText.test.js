// drugSearchText.test.js — Golden tests สำหรับ src/lib/drugSearchText.js
// รัน: node src/lib/drugSearchText.test.js
// คำค้น = คำที่เขียนจริงในรูปใบเบิก (ตรวจ 13/11/2569) · ชื่อยา = ชื่อจริงใน Master ณ วันเดียวกัน

import { normDrugText, matchDrugQuery, rankDrugs } from './drugSearchText.js';

let pass = 0, fail = 0;
const fails = [];
const ok = (cond, label, extra = '') => { if (cond) pass++; else { fail++; fails.push(`  ✗ ${label}${extra ? `\n     ${extra}` : ''}`); } };

const N = (code, name) => ({ code, name });
const MASTER = [
  N('1000227', 'Acetaminophen 500mg ,Para'), N('1000228', 'Acetaminophen 120mg/5ml ,60ml ,Para'),
  N('1660064', 'OralRehydration ,เด็กเล็ก'), N('1660065', 'OralRehydration ,ผู้ใหญ่'),
  N('1650020', 'Streptokinase 1.5MU'), N('S1700001', 'สเปรย์กันยุงและทาก ,Sketolene Shield 40ml'),
  N('1680100', 'SodiumChloride 100ml ,Nss100ml'), N('1680101', 'SodiumChloride 1000ml ,Nss1000ml'),
  N('1680102', 'D-5-S 1000ml ,5% Dextrose in Normal Saline'), N('1680103', 'D-5-S/3 500ml'), N('1680104', 'D-5-W 1000ml'),
  N('1000010', 'Amlodipine besilate 10mg'), N('1000011', 'Atenolol 50mg'), N('1000012', 'Omeprazole 20mg'),
  N('1000168', 'LidocaineHCL 1% 20ml'), N('1000169', 'LidocaineHCL 2% ,50ml'),
  N('1460260', 'Povidone-iodinegargle'), N('1501141', 'Povidone-iodine 450ml'),
  N('1680050', 'ChlorhexidineGluconate 0.12g/100ml ,250ml ,C24 ,Mybacin'),
  N('1900001', 'ไพลครีม 30กรัม'), N('1900002', 'ยาประสะไพล 500mg'), N('1900003', 'พญายอครีม 5g'),
  N('1000300', 'MethylSalicylateBalm'),
  N('1000040', 'Carvedilol 12.5mg'), N('1000041', 'EnalaprilMaleate 20mg'),
  N('1600015', 'Glycerylguaiacolate 100mg'), N('1600016', 'Glycerylguaiacolate ,60ml'),
  N('1440100', 'ขี้ผึ้งทาน้ำกัดเท้า ,5g'), N('1000135', 'Folicacid 5mg'),
];
const hits = (q) => rankDrugs(MASTER, q).map(d => d.name);
const finds = (q, expectName) => {
  const r = hits(q);
  ok(r.some(n => n.includes(expectName)), `"${q}" เจอ ${expectName}`, `ได้: ${r.join(' ; ') || '(ไม่เจอ)'}`);
};

console.log('\n=== normDrugText ===');
ok(normDrugText('N.S.S. 0.9 %') === 'nss09%', 'N.S.S. 0.9 % → nss09%');
ok(normDrugText('D-5-S/3') === 'd5s3', 'D-5-S/3 → d5s3');
ok(normDrugText(null) === '', 'null → ว่าง');

console.log('\n=== ช่องว่าง/จุด/ขีดต่างกัน (ข้อ 1) ===');
finds('amlodipine 10 mg', 'Amlodipine');
finds('atenolol 50 mg', 'Atenolol');
finds('omeprazole 20 mg', 'Omeprazole');
finds('n.s.s', 'Nss100ml');
finds('nss 100', 'Nss100ml');
finds('d5s', 'D-5-S');
finds('d5w', 'D-5-W');

console.log('\n=== คำไม่เรียง/มีคำคั่น (ข้อ 2) ===');
finds('lidocaine 2%', 'LidocaineHCL 2%');
ok(!hits('lidocaine 2%').some(n => n.includes('1%')), '"lidocaine 2%" ไม่ขึ้น 1%');
finds('povidone gargle', 'Povidone-iodinegargle');
ok(hits('povidone gargle').length === 1, '"povidone gargle" ได้ตัวเดียว');
finds('chlorhexidine gluconate', 'ChlorhexidineGluconate');
finds('gargle povidone', 'Povidone-iodinegargle');

console.log('\n=== คำเรียกอื่น (ข้อ 3) ===');
finds('paracetamol', 'Acetaminophen 500mg');
finds('พารา', 'Acetaminophen');
finds('paracetamol syr', 'Acetaminophen 120mg/5ml');
ok(!hits('paracetamol syr').some(n => n.includes('500mg')), '"paracetamol syr" ไม่ขึ้นยาเม็ด');
finds('ors', 'OralRehydration');
finds('เกลือแร่', 'OralRehydration');
finds('ครีมไพล', 'ไพลครีม');
finds('ครีมพญายอ', 'พญายอครีม');
finds('analgesic balm', 'MethylSalicylateBalm');
finds('normal saline', 'SodiumChloride');
finds('nss 0.9%', 'SodiumChloride');
finds('carvediol', 'Carvedilol');
finds('enalapril mealeate', 'EnalaprilMaleate');
finds('amlodipine besylate', 'Amlodipine');
finds('glyceryl gualacalate', 'Glycerylguaiacolate');
ok(hits('sk')[0] === 'Streptokinase 1.5MU', '"sk" → Streptokinase ขึ้นก่อน Sketolene', `ได้: ${hits('sk').join(' ; ')}`);

console.log('\n=== คำที่ค้นได้อยู่แล้วต้องไม่พัง ===');
finds('para', 'Acetaminophen 500mg');
finds('ไพล', 'ไพลครีม');
finds('น้ำกัดเท้า', 'ขี้ผึ้งทาน้ำกัดเท้า');
finds('1000135', 'Folicacid');
ok(matchDrugQuery('Folicacid 5mg', '1000135', '1000135') === 0, 'รหัสตรงตัว = คะแนน 0');
ok(hits('amox').length === 0, 'คำที่ไม่มีในรายการ → ไม่เจอ');
ok(hits('   ').length === 0, 'คำค้นว่าง → ไม่เจอ');
ok(rankDrugs(MASTER, 'acetaminophen', 1).length === 1, 'limit ใช้ได้');

console.log(`\nผ่าน ${pass} / ${pass + fail}`);
if (fail) { console.log(fails.join('\n')); process.exit(1); }
