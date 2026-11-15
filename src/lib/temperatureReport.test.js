// temperatureReport.test.js — Golden tests สำหรับ src/lib/temperatureReport.js
// รัน: node src/lib/temperatureReport.test.js  (npm run test:tempreport)
// ครอบ: เกณฑ์หลุดช่วงจาก snapshot · ความครบถ้วนนับ "รอบ" ไม่ใช่แถว · ตัดวันอนาคต · ช่วงเดือนข้ามปี
//       · ปีงบ ต.ค.–ก.ย. · รายงานรายเดือน (วันไม่ได้วัด / เลือกค่าใกล้ 09:00 15:00) · สรุปจากกราฟ · กราฟรวมรายสัปดาห์/เดือน

import {
  isExcursion, roundOf, monthBounds, monthRange, thaiMonthLabel, fiscalYearMonths,
  summarizeReadings, dailySeries, buildMonthReport, describeReadings, chartBuckets,
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

// 6. สรุปจากกราฟ — describeReadings
const FRIDGE = { kind: 'fridge', min: 2, max: 8 }
const ROOM = { kind: 'ambient', min: 0, max: 30 }
const has = (res, re) => res.lines.some(l => re.test(l.text))
const lineOf = (res, re) => res.lines.find(l => re.test(l.text))

const empty = describeReadings([], FRIDGE, { from: '2026-11-01', to: '2026-11-30', today: TODAY })
assertEq(empty.tone, 'none', 'ไม่มีข้อมูล = none (ไม่เดา)')
assertEq(empty.verdict, 'ไม่มีค่าที่วัดในช่วงนี้', 'ไม่มีข้อมูล ข้อความ')

// วันวัดล่าสุด: ช่วงอยู่หลังค่าล่าสุด = ขาดถึงวันนี้ · ไม่เคยวัด = null · ไม่รู้ = undefined ไม่พูดถึง
const after = describeReadings([], FRIDGE, { from: '2026-11-01', to: '2026-11-30', today: TODAY, lastDate: '2026-08-19' })
assertEq(lineOf(after, /ล่าสุด/)?.text, 'วัดครั้งล่าสุด 19/08/2569 — ไม่มีการบันทึกตั้งแต่ 20/08/2569 ถึงวันนี้ (87 วัน)', 'ขาดตั้งแต่วันถัดจากค่าล่าสุดถึงวันนี้')
const before = describeReadings([], FRIDGE, { from: '2024-01-01', to: '2024-01-31', today: TODAY, lastDate: '2026-08-19' })
assertEq(lineOf(before, /ล่าสุด/)?.text, 'วัดครั้งล่าสุด 19/08/2569', 'ช่วงก่อนเริ่มวัด บอกแค่วันล่าสุด')
assertEq(has(describeReadings([], ROOM, { from: '2026-11-01', to: '2026-11-30', today: TODAY, lastDate: null }), /ยังไม่เคยมีการบันทึก/), true, 'ไม่เคยวัด')
assertEq(empty.lines.length, 1, 'ไม่รู้วันล่าสุด ไม่พูดถึง')

// ครบ 2 รอบทุกวัน 1–14 พ.ย. ค่า 4–5 → เหมาะสม
const full = []
for (let d = 1; d <= 14; d++) {
  const iso = `2026-11-${String(d).padStart(2, '0')}`
  full.push(r(iso, '09:00', 4), r(iso, '15:00', 5))
}
const good = describeReadings(full, FRIDGE, { from: '2026-11-01', to: '2026-11-30', today: TODAY })
assertEq(good.tone, 'good', 'ครบ+ในช่วง = good')
assertEq(good.verdict, 'เหมาะสม — อยู่ในช่วงที่ยอมรับทุกค่า', 'verdict เหมาะสม')
assertEq(good.lines[0].text, 'เฉลี่ย 4.5 °C · ต่ำสุด 4.0 · สูงสุด 5.0 °C (เกณฑ์ 2–8 °C)', 'บรรทัดเฉลี่ย')
assertEq(has(good, /บันทึก 28 จาก 28 รอบ \(100%\)/), true, 'ความครบถ้วน 100%')
assertEq(has(good, /ไม่ได้วัด/), false, 'ไม่มีช่วงขาด')
assertEq(has(good, /แนวโน้ม/), false, 'เดือนเดียว ไม่มีแนวโน้ม')

// ใกล้ขอบ: 7.6 / 2.4 (ตู้เย็น) · 8.0 พอดีขอบ = ใกล้ขอบ ไม่ใช่หลุด
const near = describeReadings([...full, r('2026-11-03', '10:00', 7.6), r('2026-11-04', '10:00', 8), r('2026-11-09', '10:00', 2.4)],
  FRIDGE, { from: '2026-11-01', to: '2026-11-30', today: TODAY })
assertEq(near.tone, 'warn', 'ใกล้ขอบ = warn')
assertEq(near.verdict, 'อยู่ในช่วงที่ยอมรับทุกค่า แต่มีค่าใกล้ขอบ 3 ค่า', 'verdict ใกล้ขอบ')
assertEq(lineOf(near, /ใกล้ขอบบน/)?.text, 'ใกล้ขอบบน (สูงกว่า 7.5 °C) 2 ค่า: 03/11/2569 – 04/11/2569', 'ขอบบน รวมวันติดกันเป็นช่วง')
assertEq(lineOf(near, /ใกล้ขอบล่าง/)?.text, 'ใกล้ขอบล่าง (ต่ำกว่า 2.5 °C) 1 ค่า: 09/11/2569', 'ขอบล่าง')

// ห้อง: >28 ใกล้ขอบ · ไม่เตือนขอบล่าง (0–2 °C)
const roomRows = [r('2026-11-01', '09:00', 28.5, { min_c: 0, max_c: 30 }), r('2026-11-01', '15:00', 1, { min_c: 0, max_c: 30 })]
const room = describeReadings(roomRows, ROOM, { from: '2026-11-01', to: '2026-11-01', today: TODAY })
assertEq(lineOf(room, /ใกล้ขอบบน/)?.text, 'ใกล้ขอบบน (สูงกว่า 28.0 °C) 1 ค่า: 01/11/2569', 'ห้อง ขอบบน 28')
assertEq(has(room, /ใกล้ขอบล่าง/), false, 'ห้อง ไม่เตือนขอบล่าง')

// หลุดช่วง + ยังไม่ระบุการดำเนินการ
const bad = describeReadings([...full, r('2026-11-05', '11:00', 9), r('2026-11-06', '11:00', 8.4, { action_taken: 'ปรับตู้' }), r('2026-11-10', '11:00', 1.5)],
  FRIDGE, { from: '2026-11-01', to: '2026-11-30', today: TODAY })
assertEq(bad.tone, 'bad', 'หลุดช่วง = bad')
assertEq(bad.verdict, 'ไม่เหมาะสม — มีค่าหลุดช่วง 3 ครั้ง', 'verdict หลุดช่วง')
assertEq(lineOf(bad, /สูงเกิน/)?.text, 'สูงเกิน 8 °C 2 ครั้ง: 05/11/2569 – 06/11/2569', 'สูงเกิน')
assertEq(lineOf(bad, /ต่ำกว่า 2 °C/)?.text, 'ต่ำกว่า 2 °C 1 ครั้ง: 10/11/2569', 'ต่ำเกิน')
assertEq(has(bad, /ยังไม่ระบุการดำเนินการแก้ไข 2 ครั้ง/), true, 'ยังไม่ระบุ 2 (8.4 ระบุแล้ว)')

// ช่วงขาด ≥3 วัน + ถึงวันนี้ · ขาด 2 วัน (เสาร์–อาทิตย์) ไม่ยก
const gappy = full.filter(x => !['2026-11-07', '2026-11-08', '2026-11-12', '2026-11-13', '2026-11-14'].includes(x.reading_date))
const gap = describeReadings(gappy, FRIDGE, { from: '2026-11-01', to: '2026-11-30', today: TODAY })
assertEq(gap.tone, 'warn', 'บันทึกไม่ครบ 64% = warn')
assertEq(gap.verdict, 'อยู่ในช่วงที่ยอมรับทุกค่า แต่บันทึกไม่ครบ (64%)', 'verdict บันทึกไม่ครบ')
assertEq(lineOf(gap, /ไม่ได้วัด/)?.text, 'ไม่ได้วัดติดกัน 3 วันขึ้นไป: 12/11/2569 – 14/11/2569 (3 วัน) — ยังไม่ได้วัดจนถึงวันนี้', 'ช่วงขาดถึงวันนี้ · 7–8 ไม่ยก')
const part = describeReadings(gappy, FRIDGE, { from: '2026-11-01', to: '2026-11-30', today: TODAY, partial: true })
assertEq(has(part, /^ไม่ได้วัดติดกัน|^บันทึก \d/), false, 'กรองผู้บันทึก ไม่สรุปความครบ/ช่วงขาด')
assertEq(part.tone, 'good', 'กรองผู้บันทึก ไม่ลดเป็น warn เพราะความครบ')

// แนวโน้ม + เดือนอุ่น/เย็นสุด (3 เดือนที่มีข้อมูล)
const tri = [r('2026-08-10', '09:00', 3), r('2026-09-10', '09:00', 5), r('2026-10-10', '09:00', 5.3)]
const tr = describeReadings(tri, FRIDGE, { from: '2026-08-01', to: '2026-10-31', today: TODAY })
assertEq(lineOf(tr, /แนวโน้ม/)?.text, 'แนวโน้ม: ต.ค. 2569 เฉลี่ย 5.3 °C ใกล้เคียง ก.ย. 2569 (5.0 °C)', 'แนวโน้มใกล้เคียง (ต่าง ≤0.5)')
assertEq(lineOf(tr, /อุ่นที่สุด/)?.text, 'เดือนที่อุ่นที่สุด ต.ค. 2569 (เฉลี่ย 5.3 °C) · เย็นที่สุด ส.ค. 2569 (3.0 °C)', 'อุ่น/เย็นสุด')
const tr2 = describeReadings(tri.slice(0, 2), FRIDGE, { from: '2026-08-01', to: '2026-09-30', today: TODAY })
assertEq(lineOf(tr2, /แนวโน้ม/)?.text, 'แนวโน้ม: ก.ย. 2569 เฉลี่ย 5.0 °C สูงกว่า ส.ค. 2569 (3.0 °C) อยู่ 2.0 °C', 'แนวโน้มสูงขึ้น')
assertEq(has(tr2, /อุ่นที่สุด/), false, '2 เดือน ไม่บอกอุ่น/เย็นสุด')

// 7. กราฟ — รายวัน ≤ 93 วัน · รายสัปดาห์ ≤ 366 · รายเดือน
const cd = chartBuckets(rows, FRIDGE, { from: '2026-11-01', to: '2026-11-14' })
assertEq(cd.unit, 'day', '14 วัน = รายวัน')
assertEq(cd.points.length, 14, 'ครบทุกวัน')
assertEq(cd.points[3].count, 0, 'วันไม่ได้วัด count 0')
assertEq(cd.points[3].min, null, 'วันไม่ได้วัด ค่า null (ไม่เติม)')
assertEq(cd.points[1].outPoint, 9, 'วันหลุดช่วง จุดแดงที่ค่าสูง')
assertEq(cd.points[0].title, '01/11/2569', 'title รายวัน')
const cw = chartBuckets([r('2026-01-01', '09:00', 3), r('2026-01-07', '09:00', 6), r('2026-01-08', '09:00', 4)], FRIDGE, { from: '2026-01-01', to: '2026-06-30' })
assertEq(cw.unit, 'week', '6 เดือน = รายสัปดาห์')
assertEq(cw.points[0].count, 2, 'สัปดาห์แรก 1–7 ม.ค. มี 2 ค่า')
assertEq(cw.points[0].avg, 4.5, 'เฉลี่ยสัปดาห์')
assertEq(cw.points[0].title, '01/01/2569 – 07/01/2569', 'title สัปดาห์')
assertEq(cw.points[1].count, 1, '8 ม.ค. อยู่สัปดาห์ที่ 2')
assertEq(cw.points[cw.points.length - 1].title.endsWith('30/06/2569'), true, 'สัปดาห์สุดท้ายตัดที่ปลายช่วง')
const cm = chartBuckets([r('2025-03-05', '09:00', 3), r('2025-03-20', '09:00', 5)], FRIDGE, { from: '2024-10-01', to: '2026-11-14' })
assertEq(cm.unit, 'month', '2 ปี = รายเดือน')
assertEq(cm.points.length, 26, 'ต.ค. 67 – พ.ย. 69 = 26 เดือน')
assertEq(cm.points[5].label, 'มี.ค. 68', 'label เดือนย่อ')
assertEq(cm.points[5].avg, 4, 'เฉลี่ยเดือน')
assertEq(cm.points[0].count, 0, 'เดือนไม่มีข้อมูล count 0')

console.log(`\ntemperatureReport: ${pass} ผ่าน · ${fail} ไม่ผ่าน`)
if (fail) { console.log(fails.join('\n')); process.exit(1) }
