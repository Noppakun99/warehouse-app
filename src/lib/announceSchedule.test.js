// announceSchedule.test.js — Golden tests สำหรับ supabase/functions/_shared/announceSchedule.js
// รัน: node src/lib/announceSchedule.test.js  (npm run test:announce)
// กฎ: ต้องผ่าน 100% ก่อน commit
//
// หมายเหตุ layout: source อยู่ที่ supabase/functions/_shared/ (Deno ก็ import ได้)
// test อยู่ที่นี่ตามที่อื่นใน repo — ดู CLAUDE.md §Commands
//
// ครอบ: date helper (UTC ไม่เลื่อนวัน) + วันทำการ + closedRun + resolveCycles (ยุบรอบ)
//       + announcementFor (ส่ง/ไม่ส่ง, เลื่อน, เคลียร์ก่อนหยุดยาว) + format ไทย + ข้อความ

/* eslint-disable no-undef */
import {
  parseYmd, toYmd, addDays, weekday, mondayOf,
  isClosed, isWorkingDay, nextWorkingDay, thisOrNextWorkingDay,
  closedRunLength, closedRun, resolveCycles, announcementFor,
  formatThaiDate, formatThaiShort, buildAnnouncementText,
  REQUISITION_WEEKDAYS, LONG_HOLIDAY_MIN_DAYS,
} from '../../supabase/functions/_shared/announceSchedule.js'

let pass = 0, fail = 0
const fails = []

function assertEq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(expected === undefined ? actual : actual)}`)
}
function assertTrue(v, label) { assertEq(!!v, true, label) }
function section(name) { console.log(`\n=== ${name} ===`) }

// ปฏิทินอ้างอิง ส.ค. 2569 (2026): 1 ส.ค. = เสาร์
//  จ 3, อ 4, พ 5, พฤ 6, ศ 7 | จ 10 ... | จ 17 ...
const NO_HOLIDAY = new Map()

// ────────────────────────────────────────────────────────────────────
section('Test 1: date helper — UTC ล้วน ห้ามเลื่อนวันบน UTC+7')
// ────────────────────────────────────────────────────────────────────
{
  assertEq(toYmd(parseYmd('2026-08-14')), '2026-08-14', 'parse→format ได้วันเดิม')
  assertEq(toYmd(parseYmd('2026-01-01')), '2026-01-01', 'ต้นปีไม่เลื่อนไปปีก่อน')
  assertEq(toYmd(parseYmd('2026-12-31')), '2026-12-31', 'ปลายปีไม่เลื่อนไปปีหน้า')
  assertEq(addDays('2026-08-31', 1), '2026-09-01', 'ข้ามเดือน')
  assertEq(addDays('2026-12-31', 1), '2027-01-01', 'ข้ามปี')
  assertEq(addDays('2026-03-01', -1), '2026-02-28', 'ถอยข้ามเดือน (2026 ไม่ใช่ปีอธิกสุรทิน)')
  assertEq(addDays('2024-03-01', -1), '2024-02-29', 'ปีอธิกสุรทิน 29 ก.พ.')

  assertEq(weekday('2026-08-14'), 5, '14 ส.ค. 2026 = ศุกร์')
  assertEq(weekday('2026-08-17'), 1, '17 ส.ค. 2026 = จันทร์')
  assertEq(weekday('2026-08-16'), 0, '16 ส.ค. 2026 = อาทิตย์')

  assertEq(mondayOf('2026-08-19'), '2026-08-17', 'พุธ → จันทร์ต้นสัปดาห์')
  assertEq(mondayOf('2026-08-17'), '2026-08-17', 'จันทร์ → ตัวเอง')
  assertEq(mondayOf('2026-08-23'), '2026-08-17', 'อาทิตย์ = ท้ายสัปดาห์ ไม่ใช่ต้นสัปดาห์ใหม่')
}

// ────────────────────────────────────────────────────────────────────
section('Test 2: วันทำการ — เสาร์อาทิตย์ + วันหยุดราชการ')
// ────────────────────────────────────────────────────────────────────
{
  const h = new Map([['2026-08-17', 'วันหยุดชดเชยวันแม่แห่งชาติ']])

  assertEq(isClosed('2026-08-15', NO_HOLIDAY), true, 'เสาร์ = ปิด')
  assertEq(isClosed('2026-08-16', NO_HOLIDAY), true, 'อาทิตย์ = ปิด')
  assertEq(isClosed('2026-08-17', NO_HOLIDAY), false, 'จันทร์ปกติ = เปิด')
  assertEq(isClosed('2026-08-17', h), true, 'จันทร์ที่เป็นวันหยุดราชการ = ปิด')
  assertEq(isWorkingDay('2026-08-18', h), true, 'อังคาร = เปิด')

  assertEq(nextWorkingDay('2026-08-14', NO_HOLIDAY), '2026-08-17', 'ศุกร์ → ข้ามเสาร์อาทิตย์ → จันทร์')
  assertEq(nextWorkingDay('2026-08-14', h), '2026-08-18', 'ศุกร์ → จันทร์หยุด → อังคาร')
  assertEq(thisOrNextWorkingDay('2026-08-17', h), '2026-08-18', 'จันทร์หยุด → อังคาร (รวมตัวเอง)')
  assertEq(thisOrNextWorkingDay('2026-08-18', h), '2026-08-18', 'อังคารเปิด → ตัวเอง')

  // Set ก็ต้องใช้ได้ (ไม่มีชื่อวันหยุด)
  assertEq(isClosed('2026-08-17', new Set(['2026-08-17'])), true, 'รับ Set ได้')
  // Object ก็ต้องใช้ได้
  assertEq(isClosed('2026-08-17', { '2026-08-17': 'x' }), true, 'รับ plain object ได้')
}

// ────────────────────────────────────────────────────────────────────
section('Test 3: closedRun — นับเสาร์อาทิตย์รวมด้วย')
// ────────────────────────────────────────────────────────────────────
{
  assertEq(closedRunLength('2026-08-17', NO_HOLIDAY), 0, 'วันเปิด → 0')
  assertEq(closedRunLength('2026-08-15', NO_HOLIDAY), 2, 'เสาร์อาทิตย์ธรรมดา = 2 วัน')

  // ศุกร์ 14 หยุด + ส-อา + จันทร์ 17 หยุด = 4 วันติด → เข้าเกณฑ์หยุดยาว
  const longRun = new Map([['2026-08-14', 'วันหยุดพิเศษ'], ['2026-08-17', 'วันหยุดชดเชย']])
  assertEq(closedRunLength('2026-08-14', longRun), 4, 'ศ+ส+อา+จ = 4 วัน (คร่อมสุดสัปดาห์)')
  assertTrue(closedRunLength('2026-08-14', longRun) >= LONG_HOLIDAY_MIN_DAYS, '4 วัน = เข้าเกณฑ์หยุดยาว')

  const run = closedRun('2026-08-14', longRun)
  assertEq(run.from, '2026-08-14', 'ช่วงเริ่ม 14')
  assertEq(run.to, '2026-08-17', 'ช่วงจบ 17')
  assertEq(run.resumeDate, '2026-08-18', 'เปิดอีกครั้ง 18')
  assertEq(closedRun('2026-08-18', longRun), null, 'วันเปิด → null')

  // หยุดศุกร์เดียว = 3 วัน ไม่เข้าเกณฑ์ (จงใจ — ยังมีวันทำการเหลือพอในสัปดาห์)
  assertEq(closedRunLength('2026-08-14', new Map([['2026-08-14', 'x']])), 3, 'ศ+ส+อา = 3 วัน')
  assertTrue(3 < LONG_HOLIDAY_MIN_DAYS, '3 วัน ไม่เข้าเกณฑ์หยุดยาว')
}

// ────────────────────────────────────────────────────────────────────
section('Test 4: resolveCycles — สัปดาห์ปกติได้ 2 รอบ (จ/พ)')
// ────────────────────────────────────────────────────────────────────
{
  assertEq(REQUISITION_WEEKDAYS, [1, 3], 'วันส่งใบเบิก = จันทร์ + พุธ')

  const cy = resolveCycles('2026-08-17', NO_HOLIDAY)
    .filter(c => c.requisitionDate >= '2026-08-17' && c.requisitionDate <= '2026-08-21')
  assertEq(cy.length, 2, 'สัปดาห์ปกติ = 2 รอบ')
  assertEq(cy[0].requisitionDate, '2026-08-17', 'รอบ 1 เบิกจันทร์')
  assertEq(cy[0].pickupDate, '2026-08-18', 'รอบ 1 รับอังคาร')
  assertEq(cy[1].requisitionDate, '2026-08-19', 'รอบ 2 เบิกพุธ')
  assertEq(cy[1].pickupDate, '2026-08-20', 'รอบ 2 รับพฤหัส')
}

// ────────────────────────────────────────────────────────────────────
section('Test 5: จันทร์หยุด → เลื่อนทั้งวันเบิกและวันรับ')
// ────────────────────────────────────────────────────────────────────
{
  const h = new Map([['2026-08-17', 'วันหยุดชดเชยวันแม่แห่งชาติ']])

  assertEq(announcementFor('2026-08-17', h).send, false, 'วันหยุด → ไม่ประกาศ')

  const tue = announcementFor('2026-08-18', h)
  assertEq(tue.send, true, 'อังคาร → ประกาศ (รับรอบที่เลื่อนมา)')
  assertEq(tue.requisitionDate, '2026-08-18', 'วันเบิกเลื่อนเป็นอังคาร')
  assertEq(tue.pickupDate, '2026-08-19', 'วันรับเลื่อนเป็นพุธ')
  assertEq(tue.shiftedFrom.date, '2026-08-17', 'บอกว่าเลื่อนมาจากจันทร์')
  assertEq(tue.shiftedFrom.holidayName, 'วันหยุดชดเชยวันแม่แห่งชาติ', 'บอกชื่อวันหยุดเป็นเหตุผล')

  // พุธยังเป็นวันเบิกรอบ 2 ตามปฏิทิน → วันเดียวเป็นทั้งวันรับ(รอบ1) และวันเบิก(รอบ2) = ชนกันได้
  const wed = announcementFor('2026-08-19', h)
  assertEq(wed.send, true, 'พุธ → ยังประกาศรอบ 2 ตามปกติ')
  assertEq(wed.shiftedFrom, null, 'พุธไม่ได้เลื่อน → ไม่มีบรรทัดเหตุผล')
  assertEq(wed.pickupDate, '2026-08-20', 'รอบ 2 รับพฤหัส')
}

// ────────────────────────────────────────────────────────────────────
section('Test 6: สงกรานต์ 13-16 เม.ย. 2569 (จ-พฤ) → ยุบเหลือรอบเดียว')
// ────────────────────────────────────────────────────────────────────
{
  // 2026: 13 เม.ย. = จันทร์ … 16 = พฤหัส, 17 = ศุกร์
  const h = new Map([
    ['2026-04-13', 'วันสงกรานต์'], ['2026-04-14', 'วันสงกรานต์'],
    ['2026-04-15', 'วันสงกรานต์'], ['2026-04-16', 'วันหยุดชดเชยสงกรานต์'],
  ])
  assertEq(weekday('2026-04-13'), 1, '13 เม.ย. 2026 = จันทร์')

  assertEq(announcementFor('2026-04-13', h).send, false, 'จันทร์สงกรานต์ → ไม่ประกาศ')
  assertEq(announcementFor('2026-04-15', h).send, false, 'พุธสงกรานต์ → ไม่ประกาศ')

  const fri = announcementFor('2026-04-17', h)
  assertEq(fri.send, true, 'ศุกร์ 17 → ประกาศ (ทั้ง 2 รอบยุบมารวมกัน)')
  assertEq(fri.mergedFrom, ['2026-04-13', '2026-04-15'], 'ยุบรอบจันทร์+พุธ มาไว้วันเดียว')
  assertEq(fri.pickupDate, '2026-04-20', 'วันรับ = จันทร์ 20 (ข้ามเสาร์อาทิตย์)')
  assertEq(fri.shiftedFrom.date, '2026-04-13', 'เหตุผลอ้างวันแรกสุดที่ถูกเลื่อน')

  // รอบสุดท้ายก่อนสงกรานต์ = พุธ 8 เม.ย. (รับ พฤ 9)
  // ⚠️ ศุกร์ 10 เม.ย. "เป็นวันทำการ" คั่นอยู่ — ช่วงปิดจริงเริ่ม เสาร์ 11 ถึง พฤหัส 16 = 6 วัน
  // เคสนี้คือเหตุผลที่ logic ต้องสแกนหาช่วงปิดก้อนแรกก่อนรอบถัดไป ไม่ใช่ดูแค่วันถัดจากวันรับ
  assertEq(isWorkingDay('2026-04-10', h), true, 'ศุกร์ 10 เม.ย. เป็นวันทำการ (ไม่ใช่วันหยุด)')
  const wedBefore = announcementFor('2026-04-08', h)
  assertEq(wedBefore.send, true, 'พุธ 8 เม.ย. → ประกาศปกติ')
  assertTrue(wedBefore.clearance !== null, 'พุธ 8 = รอบสุดท้ายก่อนหยุดยาว → ต้องมีคำเตือนเคลียร์')
  assertEq(wedBefore.clearance.from, '2026-04-11', 'ช่วงปิดเริ่มเสาร์ 11 (ข้ามศุกร์ 10 ที่เปิด)')
  assertEq(wedBefore.clearance.to, '2026-04-16', 'ปิดถึงพฤหัส 16 (วันหยุดชดเชยสงกรานต์)')
  assertEq(wedBefore.clearance.days, 6, 'ปิดติดกัน 6 วัน')
  assertEq(wedBefore.clearance.resumeDate, '2026-04-17', 'เปิดอีกครั้งศุกร์ 17')
}

// ────────────────────────────────────────────────────────────────────
section('Test 7: สัปดาห์ปกติต้องไม่มีคำเตือนเคลียร์ (กัน false positive)')
// ────────────────────────────────────────────────────────────────────
{
  const mon = announcementFor('2026-08-17', NO_HOLIDAY)
  assertEq(mon.clearance, null, 'จันทร์ปกติ: รับอังคาร ปิดถัดไปคือ ส-อา (2 วัน) → ไม่เตือน')
  const wed = announcementFor('2026-08-19', NO_HOLIDAY)
  assertEq(wed.clearance, null, 'พุธปกติ: รับพฤหัส ปิดถัดไป ส-อา 2 วัน (ศุกร์เปิด) → ไม่เตือน')
  assertEq(wed.mergedFrom, ['2026-08-19'], 'ไม่ยุบ → mergedFrom มีตัวเดียว')

  assertEq(announcementFor('2026-08-18', NO_HOLIDAY).send, false, 'อังคารปกติ = วันรับ ไม่ใช่วันประกาศ (แบบ B)')
  assertEq(announcementFor('2026-08-20', NO_HOLIDAY).send, false, 'พฤหัสปกติ → ไม่ประกาศ')
  assertEq(announcementFor('2026-08-21', NO_HOLIDAY).send, false, 'ศุกร์ปกติ → ไม่ประกาศ')
  assertEq(announcementFor('2026-08-15', NO_HOLIDAY).send, false, 'เสาร์ → ไม่ประกาศ')
}

// ────────────────────────────────────────────────────────────────────
section('Test 8: เดือนที่มี 5 จันทร์ — ทุกจันทร์ต้องได้ประกาศ')
// ────────────────────────────────────────────────────────────────────
{
  // มี.ค. 2026: จันทร์ = 2, 9, 16, 23, 30
  for (const d of ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30']) {
    assertEq(announcementFor(d, NO_HOLIDAY).send, true, `จันทร์ ${d} → ประกาศ`)
  }
  // พุธ = 4, 11, 18, 25
  for (const d of ['2026-03-04', '2026-03-11', '2026-03-18', '2026-03-25']) {
    assertEq(announcementFor(d, NO_HOLIDAY).send, true, `พุธ ${d} → ประกาศ`)
  }
  assertEq(announcementFor('2026-03-31', NO_HOLIDAY).send, false, 'อังคาร 31 มี.ค. → ไม่ประกาศ')
}

// ────────────────────────────────────────────────────────────────────
section('Test 9: format ภาษาไทย — พ.ศ. + ชื่อวัน')
// ────────────────────────────────────────────────────────────────────
{
  assertEq(formatThaiDate('2026-08-17'), 'จันทร์ที่ 17 ส.ค. 2569', 'จันทร์ 17 ส.ค. 2569')
  assertEq(formatThaiDate('2026-01-01'), 'พฤหัสบดีที่ 1 ม.ค. 2569', 'ต้นปีไม่เลื่อน')
  assertEq(formatThaiDate('2026-12-31'), 'พฤหัสบดีที่ 31 ธ.ค. 2569', 'ปลายปีไม่เลื่อน')
  assertEq(formatThaiShort('2026-04-13'), '13 เม.ย.', 'รูปแบบสั้น')
}

// ────────────────────────────────────────────────────────────────────
section('Test 10: ข้อความ — คงคำเดิม + placeholder mention')
// ────────────────────────────────────────────────────────────────────
{
  const normal = buildAnnouncementText(announcementFor('2026-08-19', NO_HOLIDAY))
  assertTrue(normal.includes('{everyone}'), 'มี placeholder {everyone} สำหรับ mention ทั้งกลุ่ม')
  assertTrue(!normal.includes('@All'), 'ห้ามมี @All ตรงๆ (จะเป็นตัวอักษรธรรมดา ไม่เด้ง noti)')
  assertTrue(normal.includes('ฝ่ายไหนจะเบิก น้ำเกลือ/ยา/ถุง ส่งใบเบิกมาได้เลยครับ'), 'คงคำเดิมของบล็อกส่งใบเบิก')
  assertTrue(normal.includes('ตั้งแต่เวลา 9.00-15.00น.'), 'คงคำเดิมของบล็อกมารับของ')
  assertTrue(normal.includes('พฤหัสบดีที่ 20 ส.ค. 2569'), 'ระบุวันมารับของ')
  assertTrue(!normal.includes('📅'), 'วันปกติ: ไม่มีบรรทัดเหตุผลการเลื่อน')
  assertTrue(!normal.includes('⚠️'), 'วันปกติ: ไม่มีคำเตือนหยุดยาว')

  const shifted = buildAnnouncementText(announcementFor('2026-08-18',
    new Map([['2026-08-17', 'วันหยุดชดเชยวันแม่แห่งชาติ']])))
  assertTrue(shifted.includes('📅 เลื่อนจากจันทร์ที่ 17 ส.ค. 2569 (วันหยุดชดเชยวันแม่แห่งชาติ)'),
    'วันที่เลื่อน: มีบรรทัดเหตุผลพร้อมชื่อวันหยุด')

  const songkran = new Map([
    ['2026-04-13', 'วันสงกรานต์'], ['2026-04-14', 'วันสงกรานต์'],
    ['2026-04-15', 'วันสงกรานต์'], ['2026-04-16', 'วันหยุดชดเชยสงกรานต์'],
  ])
  const clearance = buildAnnouncementText(announcementFor('2026-04-08', songkran))
  assertTrue(clearance.includes('⚠️ หยุดยาว 6 วัน (11 เม.ย. - 16 เม.ย.)'), 'ก่อนหยุดยาว: บอกช่วงวันที่ปิด')
  assertTrue(clearance.includes('เปิดอีกครั้ง ศุกร์ที่ 17 เม.ย. 2569'), 'ก่อนหยุดยาว: บอกวันเปิดทำการอีกครั้ง')
  assertTrue(clearance.includes('เบิกเผื่อวันหยุดด้วยครับ'), 'ก่อนหยุดยาว: บอกให้เบิกเผื่อ ไม่ใช่แค่ "วันสุดท้าย"')

  const merged = buildAnnouncementText(announcementFor('2026-04-17', songkran))
  assertTrue(merged.includes('🔀 สัปดาห์นี้รวมเป็นรอบเดียว'), 'ยุบรอบ: บอกผู้ใช้ว่ารวมรอบแล้ว')
  assertTrue(merged.includes('13 เม.ย. และ 15 เม.ย.'), 'ยุบรอบ: ระบุรอบเดิมที่ถูกยุบ')

  // เคสจริง ต.ค. 2569: จันทร์ 12 เบิกปกติ แต่อังคาร 13 หยุด → วันรับเลื่อนเป็นพุธ 14
  // วันเบิกไม่ได้เลื่อน จึงไม่มีบรรทัด "เลื่อนจาก..." แต่ต้องอธิบายว่าทำไมวันรับขยับ
  const oct = new Map([['2026-10-13', 'วันคล้ายวันสวรรคต ร.9']])
  const octInfo = announcementFor('2026-10-12', oct)
  assertEq(octInfo.send, true, 'จันทร์ 12 ต.ค. → ประกาศปกติ')
  assertEq(octInfo.shiftedFrom, null, 'วันเบิกไม่ได้เลื่อน')
  assertEq(octInfo.pickupDate, '2026-10-14', 'วันรับเลื่อนเป็นพุธ 14 (ข้ามวันหยุด 13)')
  assertEq(octInfo.pickupSkipped.length, 1, 'บันทึกวันหยุดที่ถูกข้าม 1 วัน')
  const octText = buildAnnouncementText(octInfo)
  assertTrue(octText.includes('อังคารที่ 13 ต.ค. 2569 เป็นวันหยุด (วันคล้ายวันสวรรคต ร.9)'), 'บอกเหตุผลที่วันรับเลื่อน')
  assertTrue(!octText.includes('พรุ่งนี้'), 'วันรับไม่ใช่พรุ่งนี้ → ห้ามใช้คำนี้')
  // เสาร์-อาทิตย์ไม่ต้องอธิบาย (คนรู้อยู่แล้วว่าคลังปิด)
  // ใช้เคสหลังสงกรานต์: ประกาศศุกร์ 17 → วันรับจันทร์ 20 คร่อม ส-อา จริง (ต้องเป็นวันที่ส่งประกาศ ไม่ใช่วันที่ไม่ส่ง)
  const friCross = announcementFor('2026-04-17', songkran)
  assertEq(friCross.send, true, 'ศุกร์ 17 เม.ย. ส่งประกาศจริง (ไม่ใช่ empty object)')
  assertEq(friCross.pickupSkipped, [], 'คร่อมเสาร์อาทิตย์ → ไม่มีบรรทัดอธิบาย')

  // "พรุ่งนี้" ต้องใช้เฉพาะเมื่อวันรับเป็นวันถัดไปจริง
  assertTrue(normal.includes('📢 พรุ่งนี้ (พฤหัสบดีที่ 20 ส.ค. 2569)'), 'พุธ→พฤหัส = พรุ่งนี้จริง')
  assertTrue(!merged.includes('พรุ่งนี้'), 'ศุกร์ 17 → รับจันทร์ 20 ห้ามเรียก "พรุ่งนี้"')
  assertTrue(merged.includes('📢 วันจันทร์ที่ 20 เม.ย. 2569'), 'ข้ามสุดสัปดาห์ → ระบุวันตรงๆ')
}

// ────────────────────────────────────────────────────────────────────
console.log(`\nผ่าน ${pass} / ${pass + fail}`)
if (fail) { console.log(fails.join('\n')); process.exit(1) }
