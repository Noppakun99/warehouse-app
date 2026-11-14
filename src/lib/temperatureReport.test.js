// temperatureReport.test.js — Golden tests สำหรับ src/lib/temperatureReport.js
// รัน: node src/lib/temperatureReport.test.js  (npm run test:tempreport)
// ครอบ: เกณฑ์หลุดช่วงจาก snapshot · ความครบถ้วนนับ "รอบ" ไม่ใช่แถว · ตัดวันอนาคต · ช่วงเดือนข้ามปี
//       · ปีงบ ต.ค.–ก.ย. · รายงานรายเดือน (วันไม่ได้วัด / เลือกค่าใกล้ 09:00 15:00)

import {
  isExcursion, roundOf, monthBounds, monthRange, thaiMonthLabel, fiscalYearMonths,
  summarizeReadings, dailySeries, buildMonthReport,
} from './temperatureReport.js'

let pass = 0, fail = 0
const fails = []
function assertEq(actual, expected, label) {
  if (actual === expected) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`)
}
const assertDeep = (a, e, l) => assertEq(JSON.stringify(a), JSON.stringify(e), l)

const r = (date, time, temp, o = {}) => ({ reading_date: date, reading_time: time, temp_c: String(temp), min_c: 2, max_c: 8, recorded_by: 'ก', ...o })
const TODAY = new Date(2026, 10, 14) // 14 พ.ย. 2026

// 1. หลุดช่วงใช้เกณฑ์ในแถว ไม่ใช่ 2–8 ตายตัว
assertEq(isExcursion(r('2026-11-01', '09:00', 8)), false, 'ขอบบน 8.0 ไม่หลุด')
assertEq(isExcursion(r('2026-11-01', '09:00', 8.1)), true, '8.1 หลุด')
assertEq(isExcursion(r('2026-11-01', '09:00', 1.9)), true, '1.9 หลุด (ต่ำเกิน)')
assertEq(isExcursion(r('2026-11-01', '09:00', 29, { min_c: 0, max_c: 30 })), false, 'ห้องเก็บ 29 ไม่หลุด (เกณฑ์ 0–30)')
assertEq(isExcursion(r('2026-11-01', '09:00', 31, { min_c: 0, max_c: 30 })), true, 'ห้องเก็บ 31 หลุด')

// 2. รอบ — เวลาเป็นหลัก ไม่มีเวลาใช้ round_label
assertEq(roundOf(r('d', '11:59', 5)), 'am', '11:59 = เช้า')
assertEq(roundOf(r('d', '12:00', 5)), 'pm', '12:00 = บ่าย')
assertEq(roundOf(r('d', null, 5, { round_label: 'บ่าย' })), 'pm', 'ไม่มีเวลา ใช้ป้ายบ่าย')

// 3. เดือน
assertDeep(monthBounds('2028-02'), { from: '2028-02-01', to: '2028-02-29' }, 'ก.พ. ปีอธิกสุรทิน 29 วัน')
assertDeep(monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02'], 'ช่วงข้ามปี')
assertDeep(monthRange('2027-01', '2026-12'), ['2026-12', '2027-01'], 'ใส่กลับด้านสลับให้')
assertEq(thaiMonthLabel('2026-11'), 'พ.ย. 2569', 'ชื่อเดือนไทย พ.ศ.')
assertDeep(fiscalYearMonths(new Date(2026, 9, 1)), { from: '2026-10', to: '2027-09' }, '1 ต.ค. = ปีงบใหม่')
assertDeep(fiscalYearMonths(new Date(2026, 8, 30)), { from: '2025-10', to: '2026-09' }, '30 ก.ย. = ปีงบเดิม')

// 4. ความครบถ้วนนับรอบ — วัดซ้ำในรอบเดียว/logger วัดถี่ ไม่ดันเกิน · วันอนาคตไม่นับเป็นรอบที่ขาด
const rows = [
  r('2026-11-01', '09:05', 4), r('2026-11-01', '09:40', 4.5), r('2026-11-01', '15:10', 5),
  r('2026-11-02', '09:00', 9, { action_taken: 'ย้ายยา' }), r('2026-11-03', '15:00', 1.5),
]
const s = summarizeReadings(rows, { from: '2026-11-01', to: '2026-11-30', today: TODAY })
assertEq(s.count, 5, 'นับแถวจริง 5')
assertEq(s.roundsDone, 4, 'รอบที่วัด 4 (01 เช้าวัด 2 ครั้ง นับ 1)')
assertEq(s.expected, 28, 'ควรมี 14 วัน × 2 = 28 (ตัดที่วันนี้ ไม่ใช่ 30 วัน)')
assertEq(s.pct, 14, '4/28 = 14%')
assertEq(s.excursions.length, 2, 'หลุดช่วง 2')
assertEq(s.unhandled.length, 1, 'ยังไม่ระบุการดำเนินการ 1')
assertEq(s.min, 1.5, 'ต่ำสุด'); assertEq(s.max, 9, 'สูงสุด')
assertEq(summarizeReadings([], { from: '2026-12-01', to: '2026-12-31', today: TODAY }).expected, 0, 'เดือนอนาคตทั้งเดือน ควรมี 0')

// 5. รายวัน + รายงานรายเดือน
const d1 = dailySeries(rows)[0]
assertEq(d1.am.reading_time, '09:05', 'เช้าเลือกค่าใกล้ 09:00 ที่สุด')
assertEq(d1.pm.reading_time, '15:10', 'บ่าย')
assertEq(d1.count, 3, 'วันที่ 1 มี 3 ค่า')
const m = buildMonthReport(rows, '2026-11', { today: TODAY })
assertEq(m.days.length, 30, 'พ.ย. 30 วัน')
assertEq(m.days[3].count, 0, 'วันที่ 4 ไม่ได้วัด = count 0 (ไม่เติมค่า)')
assertEq(m.days[3].min, null, 'วันไม่ได้วัด min = null')
assertEq(m.days[14].future, true, '15 พ.ย. = อนาคต')
assertEq(m.days[1].out, true, 'วันที่ 2 หลุดช่วง')
assertEq(m.summary.expected, 28, 'สรุปเดือนตัดที่วันนี้')
assertEq(m.label, 'พ.ย. 2569', 'label')

console.log(`\ntemperatureReport: ${pass} ผ่าน · ${fail} ไม่ผ่าน`)
if (fail) { console.log(fails.join('\n')); process.exit(1) }
