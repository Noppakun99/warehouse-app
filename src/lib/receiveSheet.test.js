// Golden tests — src/lib/receiveSheet.js (อ่านชีท "รับยา" .xlsm → แถว receive_logs)
// รัน: npm run test:receivesheet   (node เปล่า ไม่มี framework — ตาม pattern golden test อื่นในรีโป)
//
// เคสส่วนใหญ่มาจาก **ข้อมูลจริง** ในไฟล์ รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm
// (สำรวจ 2026-09-21: 2,917 แถว — วันที่เป็น serial 2,852 แถว / ข้อความ 69 แถว / เสีย 2 แถว)

import {
  cleanVal, serialToIso, textToIso, cellToIso, isoToThai, num,
  normalizeCode, normalizeLot, validateHeader, rowToReceiveLog, rowWarnings, percentCellToText,
  parseReceiveGrid, COL,
} from './receiveSheet.js'

let pass = 0, fail = 0
const eq = (got, want, label) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++ }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`) }
}
const section = (t) => console.log(`\n=== ${t} ===`)

// ── 1. serial → ISO ───────────────────────────────────────────────
// หัวใจของไฟล์นี้: serial ไม่ขึ้นกับรูปแบบที่แสดง จึงเชื่อถือได้เสมอ
section('serialToIso — Excel serial')
eq(serialToIso(45146), '2023-08-08', 'serial 45146 (ชีทแสดง "8/8/23" แบบ US)')
eq(serialToIso(45412), '2024-04-30', 'serial 45412 (ชีทแสดง "30/4/2024" แบบไทย)')
eq(serialToIso(46226), '2026-07-23', 'serial 46226 = 23 ก.ค. ไม่ใช่ 7 มี.ค.')
eq(serialToIso(46281), '2026-09-16', 'serial 46281')
eq(serialToIso(46265), '2026-08-31', 'serial 46265')
eq(serialToIso(0), null, '0 ไม่ใช่วันที่')
eq(serialToIso(-5), null, 'ติดลบ')
eq(serialToIso(999999), null, 'เกินช่วง')
eq(serialToIso('45146'), null, 'string ไม่รับ (ต้องเป็น number)')
// พ.ศ. ที่ถูกพิมพ์ลงช่องวันที่ → Excel เก็บเป็นวันที่ไกลโพ้น (เจอจริง 3 แถว 2026-09-21)
// ถ้าไม่แปลง ค่าที่กรอกถูกต้องจะถูกทิ้งเป็น '-' (เหตุการณ์จริงตอน commit ครั้งแรก)
eq(serialToIso(244980), '2027-09-23', 'serial ปี พ.ศ. 2570 → 2027 (Losartan แถว 117)')
eq(serialToIso(244979), '2027-09-22', 'serial ปี พ.ศ. 2570 → 2027 (Quetiapine แถว 118)')
eq(serialToIso(244747), '2027-02-02', 'serial ปี พ.ศ. 2570 → 2027 (ยาทาพระเส้น แถว 2219)')
eq(serialToIso(80110), null, 'ปี 2119 = ข้อมูลเสีย ไม่ใช่ พ.ศ. (ลบ 543 ได้ 1576) → null')
eq(serialToIso(NaN), null, 'NaN')

// ── 2. ข้อความ → ISO ──────────────────────────────────────────────
section('textToIso — ข้อความวันที่')
eq(textToIso('06/08/2026'), '2026-08-06', 'DD/MM/YYYY')
eq(textToIso(' 06/08/2026'), '2026-08-06', 'มีช่องว่างนำ (เจอจริง 69 แถว)')
eq(textToIso('  5/9/2027'), '2027-09-05', 'วัน/เดือนหลักเดียว')
eq(textToIso(' 27/03/2027 '), '2027-03-27', 'ช่องว่างท้าย')
eq(textToIso('23/09/2570'), '2027-09-23', 'พ.ศ. 2570 → ค.ศ. 2027')
eq(textToIso('2026-08-06'), '2026-08-06', 'ISO อยู่แล้ว')
eq(textToIso('-'), null, 'ขีด = ว่าง')
eq(textToIso(''), null, 'ว่าง')
eq(textToIso(null), null, 'null')
eq(textToIso('(blank)'), null, '(blank)')
eq(textToIso('14/1/22029'), null, 'ปีพิมพ์เกิน (แถว 1928 ของจริง) → null ไม่เดา')
eq(textToIso('648/2569'), null, 'เลข PO หลุดมาในช่อง exp (แถว 2374 ของจริง) → null')
eq(textToIso('31/02/2026'), null, '31 ก.พ. ไม่มีจริง → null (ไม่ roll over เป็น 3 มี.ค.)')
eq(textToIso('45146'), '2023-08-08', 'serial ที่มาเป็นข้อความ')

section('cellToIso — เลือกทางตามชนิดค่า')
eq(cellToIso(46226), '2026-07-23', 'number → serial')
eq(cellToIso(' 06/08/2026'), '2026-08-06', 'string → text')
eq(cellToIso('-'), null, 'ขีด')
eq(cellToIso(''), null, 'ว่าง')

section('isoToThai — ISO → DD/MM/YYYY (รูปแบบที่ receive_logs.exp เก็บ)')
eq(isoToThai('2026-07-23'), '23/07/2026', 'ปกติ')
eq(isoToThai('2029-06-05'), '05/06/2029', 'เติม 0 นำหน้า')
eq(isoToThai(null), null, 'null')
eq(isoToThai('ไม่ใช่วันที่'), null, 'ข้อความมั่ว')

// ── 3. ค่าว่าง / ตัวเลข / รหัส / lot ─────────────────────────────
section('cleanVal — นิยาม "ไม่มีค่า" (ต้องตรงกับ getVal ใน ReceiveLogApp)')
eq(cleanVal('-'), null, 'ขีด')
eq(cleanVal('(blank)'), null, '(blank)')
eq(cleanVal('BLANK'), null, 'BLANK ตัวใหญ่')
eq(cleanVal('  ค่า  '), 'ค่า', 'trim')
eq(cleanVal(0), '0', 'เลข 0 เป็นค่าจริง ไม่ใช่ว่าง')

section('num — ตัวเลขที่มีคอมมา')
eq(num('88,275.00'), 88275, 'คอมมาคั่นหลักพัน')
eq(num('214.0000'), 214, 'ทศนิยมศูนย์')
eq(num(300), 300, 'number อยู่แล้ว')
eq(num('-'), null, 'ขีด')
eq(num('abc'), null, 'ไม่ใช่ตัวเลข')

section('normalizeCode — รหัสยา')
eq(normalizeCode(1501106), '1501106', 'number → string ไม่มี .0')
eq(normalizeCode('1501106'), '1501106', 'string เดิม')
eq(normalizeCode('0150110'), '0150110', 'เลข 0 นำหน้าต้องไม่หาย')
eq(normalizeCode('-'), null, 'ขีด')

section('normalizeLot — ⚠️ ห้ามแปลง scientific notation (เหตุการณ์ 2026-07-29)')
eq(normalizeLot('26E266'), '26E266', 'lot ที่มี E ต้องไม่กลายเป็นเลข 269 หลัก')
eq(normalizeLot('26D172'), '26D172', 'lot ปกติ')
eq(normalizeLot('L690544'), 'L690544', 'lot ขึ้นต้นตัวอักษร')
eq(normalizeLot(24082001), '24082001', 'lot ตัวเลขล้วน ไม่ใส่คอมมา')
eq(normalizeLot('L670743 , L670742'), 'L670743 , L670742', 'lot คู่ในช่องเดียว เก็บตามเดิม')
eq(normalizeLot(''), '-', 'ว่าง → ขีด')
eq(normalizeLot(null), '-', 'null → ขีด')

section('percentCellToText — เซลล์ % ที่ถูกจัดรูปแบบเป็นเปอร์เซ็นต์')
// เจอจริงตอนทดสอบเพิ่มบิล 2026-09-21: เขียน "100%" ผ่าน COM แล้ว Excel เก็บเป็นเลข 1
// อ่านค่าดิบได้ "1" ซึ่งผิดความหมาย — ต้องใช้ค่าที่แสดง (w)
eq(percentCellToText({ t: 'n', v: 1, w: '100%' }), '100%', 'เลข 1 แสดง 100% → "100%"')
eq(percentCellToText({ t: 'n', v: 0.5, w: '50%' }), '50%', 'เลข 0.5 แสดง 50%')
eq(percentCellToText({ t: 'n', v: 1 }), '100%', 'ไม่มี w → คำนวณจากค่า')
eq(percentCellToText({ t: 's', v: '25-100%' }), '25-100%', 'ข้อความช่วง เก็บตามเดิม')
eq(percentCellToText({ t: 's', v: 'ตามจำนวนจริง' }), 'ตามจำนวนจริง', 'ข้อความไทย')
eq(percentCellToText({ t: 's', v: '-' }), null, 'ขีด → null')
eq(percentCellToText(null), null, 'null')
eq(percentCellToText('100%'), '100%', 'ส่งค่าดิบมาตรงๆ ก็ได้')

// ── 4. หัวตาราง ───────────────────────────────────────────────────
section('validateHeader — กันคลังสลับคอลัมน์แล้วอ่านผิดเงียบๆ')
const goodHeader = []
goodHeader[COL.drug_code] = 'รหัส'
goodHeader[COL.drug_name] = 'รายการยา'
goodHeader[COL.lot] = 'Lot Number'
goodHeader[COL.exp] = 'Exp'
goodHeader[COL.bill_number] = 'เลขที่บิลซื้อ'
goodHeader[COL.qty_received] = 'จำนวนที่รับ'
goodHeader[COL.receive_date] = 'วันที่รับ'
goodHeader[COL.supplier_current] = 'บริษัท'
eq(validateHeader(goodHeader), [], 'หัวตารางถูกต้อง → ไม่มีปัญหา')
const badHeader = [...goodHeader]
badHeader[COL.lot] = 'อย่างอื่น'
eq(validateHeader(badHeader).length, 1, 'คอลัมน์ Lot เพี้ยน → รายงาน 1 ปัญหา')
eq(validateHeader([]).length, 8, 'หัวตารางว่าง → รายงานครบ 8')

// ── 5. แปลงทั้งแถว (ข้อมูลจริง) ──────────────────────────────────
section('rowToReceiveLog — แถวจริงจากชีท')
// แถว 2831: Losartan 50mg รับ 16/09/2026 — เคสที่ตรวจสอบด้วยมือแล้วในบทสนทนา
const real = []
real[COL.order_date] = '-'
real[COL.drug_code] = 1501106
real[COL.drug_type] = 'Tablet'
real[COL.drug_name] = 'Losartan 50mg'
real[COL.purchase_type] = 'การซื้อ'
real[COL.lot] = 'L690544'
real[COL.exp] = 47306                    // serial → 07/07/2029 (ยืนยันด้วย XLSX.SSF)
real[COL.bill_number] = 3001264405
real[COL.po_number] = '899.05/2569'
real[COL.qty_received] = 243
real[COL.drug_unit] = '300เม็ด'
real[COL.price_per_unit] = 214
real[COL.total_price_vat] = '52,002.00'
real[COL.receive_date] = 46281           // serial → 2026-09-16
real[COL.receive_status] = 'รอตรวจรับ'
real[COL.inspect_date] = '-'
real[COL.supplier_current] = 'องค์การเภสัชกรรม'
real[COL.supplier_prev] = 'องค์การเภสัชกรรม'
real[COL.swap_condition] = 'เงื่อนไขเดียวกันทุกรายการ'
real[COL.swap_note] = 'เปลี่ยนคืนได้ หลังจากหมดอายุไปแล้ว'
real[COL.swap_automatch] = 'เปลี่ยนคืนได้หลังจากหมดอายุไปแล้ว'
real[COL.swap_return_pct] = '100%'
real[COL.leadtime] = 14

const r = rowToReceiveLog(real)
eq(r.drug_code, '1501106', 'รหัสยา')
eq(r.drug_name, 'Losartan 50mg', 'ชื่อยา')
eq(r.lot, 'L690544', 'lot')
eq(r.receive_date, '2026-09-16', 'วันที่รับจาก serial')
eq(r.exp, '07/07/2029', 'exp เก็บเป็น DD/MM/YYYY')
eq(r.qty_received, 243, 'จำนวน')
eq(r.price_per_unit, 214, 'ราคา/หน่วย')
eq(r.total_price_vat, 52002, 'ราคารวมภาษี (ตัดคอมมา)')
eq(r.bill_number, '3001264405', 'เลขบิลเป็น string')
eq(r.po_number, '899.05/2569', 'เลข PO')
eq(r.receive_status, 'รอตรวจรับ', 'สถานะตรวจรับ')
eq(r.order_date, null, 'วันที่แจ้งสั่ง "-" → null')
eq(r.inspect_date, null, 'วันที่ตรวจรับ "-" → null')
eq(r.supplier_current, 'องค์การเภสัชกรรม', 'บริษัท')
eq(
  r.drug_swap_policy,
  'เงื่อนไขเดียวกันทุกรายการ | เปลี่ยนคืนได้ หลังจากหมดอายุไปแล้ว | เปลี่ยนคืนได้หลังจากหมดอายุไปแล้ว',
  'นโยบายคืนยา = รวมคอลัมน์คั่น " | " (เคยหาย 746 บิลเพราะใช้แค่ 2 คอลัมน์)'
)
eq(r.swap_tier_detail, 'เปลี่ยนคืนได้หลังจากหมดอายุไปแล้ว', 'tier detail (ADR-0014)')
eq(r.swap_return_pct, '100%', '% คืน')
eq(Object.keys(r).length, 34, 'ครบ 34 ฟิลด์ เท่ากับที่ ReceiveLogApp สร้าง (รวม lot ที่เขียนแบบ shorthand)')

section('rowToReceiveLog — ใช้ค่าที่แสดงสำหรับคอลัมน์ % คืน')
const fmtRow = []
fmtRow[COL.swap_return_pct] = '100%'
const rawPct = [...real]
rawPct[COL.swap_return_pct] = 1                      // Excel เก็บ 100% เป็นเลข 1
eq(rowToReceiveLog(rawPct, fmtRow).swap_return_pct, '100%', 'ใช้ค่าที่แสดงแทนค่าดิบ')
eq(rowToReceiveLog(rawPct, null).swap_return_pct, '1', 'ไม่มี fmtRow → ใช้ค่าดิบ (พฤติกรรมเดิม)')
eq(rowToReceiveLog(real, fmtRow).receive_date, '2026-09-16', 'วันที่ยังใช้ค่าดิบ ไม่แตะ')

section('rowToReceiveLog — แถวที่ต้องข้าม')
const empty = []
empty[COL.total_price_vat] = '1,234.00'      // แถวผลรวมท้ายตาราง
eq(rowToReceiveLog(empty), null, 'ไม่มีทั้งชื่อยาและรหัสยา → null (footer/ผลรวม)')
const nameOnly = []
nameOnly[COL.drug_name] = 'ยาอะไรสักอย่าง'
eq(rowToReceiveLog(nameOnly) !== null, true, 'มีชื่อยาอย่างเดียว → ยังเก็บ (แล้วเตือนว่าไม่มีรหัส)')

// ── 6. คำเตือน ───────────────────────────────────────────────────
section('rowWarnings')
eq(rowWarnings(r, 2831), null, 'แถวสมบูรณ์ → ไม่เตือน')
const noLot = { ...r, lot: '-' }
eq(rowWarnings(noLot, 5).issues, ['ไม่มี Lot'], 'ไม่มี lot → เตือน')
const supply = { ...r, lot: '-', drug_type: 'เวชภัณฑ์มิใช่ยา' }
eq(rowWarnings(supply, 5), null, 'เวชภัณฑ์มิใช่ยาไม่มี lot = ปกติ ไม่เตือน')
const badDate = { ...r, receive_date: null, exp: '-' }
eq(rowWarnings(badDate, 9).issues, ['อ่านวันที่รับไม่ได้', 'อ่าน Exp ไม่ได้'], 'วันที่อ่านไม่ได้ → เตือน 2 ข้อ')

// ── 7. ทั้งชีท ───────────────────────────────────────────────────
section('parseReceiveGrid')
const rowNoLot = [...real]
rowNoLot[COL.lot] = '-'
const grid = [goodHeader, real, [], empty, rowNoLot]
const out = parseReceiveGrid(grid)
eq(out.rows.length, 2, 'ได้ 2 แถว (real + rowNoLot) — ข้ามแถวว่าง + แถวผลรวม')
eq(out.skipped, 2, 'ข้าม 2 แถว')
eq(out.warnings.length, 1, 'เตือน 1 แถว (ตัวที่ไม่มี lot)')
eq(out.warnings[0].issues, ['ไม่มี Lot'], 'เหตุผลที่เตือน')
eq(out.total, 4, 'นับแถวข้อมูลทั้งหมด (ไม่รวมหัวตาราง)')

let threw = null
try { parseReceiveGrid([badHeader, real]) } catch (e) { threw = e.message }
eq(threw !== null && threw.includes('หัวตาราง'), true, 'หัวตารางเพี้ยน → throw ไม่อ่านต่อ')
try { parseReceiveGrid([goodHeader]) } catch (e) { threw = e.message }
eq(threw.includes('ไม่มีข้อมูล'), true, 'ชีทมีแต่หัวตาราง → throw')

console.log(`\nผ่าน ${pass} / ${pass + fail}`)
if (fail > 0) { console.log(`ไม่ผ่าน ${fail}`); process.exit(1) }
