// Golden tests — src/lib/importGuard.js (ด่านตรวจก่อนเขียนทับตาราง)
// รัน: npm run test:importguard
//
// ตัวเลขฐานมาจากข้อมูลจริง (สำรวจ 2026-09-21): receive_logs 2,852 แถว
// มูลค่ารวม 36,143,025.99 บาท · 1,923 บิล · 428 รหัสยา · 2023-08-08 ถึง 2026-09-17

import {
  summarize, checkShrink, checkDateRange, checkAppOnlyData, checkStale,
  checkValueSwing, checkEmpty, runGuards, formatGuardReport,
  YEAR_MIN, YEAR_MAX, SHRINK_LIMIT,
} from './importGuard.js'

let pass = 0, fail = 0
const eq = (got, want, label) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++ } else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`) }
}
const section = (t) => console.log(`\n=== ${t} ===`)

// ตัวช่วยสร้างแถวปลอม
const mkRow = (o = {}) => ({
  drug_code: '1501106', drug_name: 'Losartan 50mg', bill_number: 'B1',
  receive_date: '2026-09-16', order_date: null, inspect_date: null,
  total_price_vat: 1000, ...o,
})
const mkRows = (n, o = {}) => Array.from({ length: n }, (_, i) =>
  mkRow({ bill_number: `B${i}`, ...o }))

// ── summarize ─────────────────────────────────────────────────────
section('summarize')
const s = summarize([
  mkRow({ bill_number: 'A', total_price_vat: 100, receive_date: '2026-01-05' }),
  mkRow({ bill_number: 'A', total_price_vat: 200, receive_date: '2026-03-10' }),
  mkRow({ bill_number: 'B', total_price_vat: 300, receive_date: '2025-12-01', drug_code: '999' }),
])
eq(s.count, 3, 'นับแถว')
eq(s.value, 600, 'รวมมูลค่า')
eq(s.bills, 2, 'บิลไม่ซ้ำ (A ซ้ำ 2 แถว)')
eq(s.codes, 2, 'รหัสยาไม่ซ้ำ')
eq(s.firstDate, '2025-12-01', 'วันแรก')
eq(s.lastDate, '2026-03-10', 'วันล่าสุด')
eq(summarize([]).count, 0, 'ไม่มีแถว')
eq(summarize([mkRow({ bill_number: '-' })]).bills, 0, 'บิล "-" ไม่นับ')

// ── ด่าน 1: แถวหด ────────────────────────────────────────────────
section('checkShrink — ไฟล์ผิด/ไฟล์เก่าทำให้แถวหาย')
const prev2852 = { count: 2852, value: 36143025.99, lastDate: '2026-09-17' }
eq(checkShrink({ count: 2917 }, prev2852), null, 'เพิ่มขึ้น → ผ่าน')
eq(checkShrink({ count: 2852 }, prev2852), null, 'เท่าเดิม → ผ่าน')
eq(checkShrink({ count: 2400 }, prev2852), null, 'ลด 15.8% (ยังไม่ถึง 20%) → ผ่าน')
eq(checkShrink({ count: 2281 }, prev2852)?.code, 'shrink', 'ลด 20.0% → บล็อก')
eq(checkShrink({ count: 100 }, prev2852)?.level, 'blocker', 'ลดฮวบ → บล็อก')
eq(checkShrink({ count: 10 }, null), null, 'ตารางเดิมว่าง → ไม่มีอะไรให้หาย')
eq(checkShrink({ count: 10 }, { count: 0 }), null, 'เดิม 0 แถว → ผ่าน')
eq(SHRINK_LIMIT, 0.20, 'เกณฑ์ 20%')

// ── ด่าน 2: วันที่นอกช่วง ────────────────────────────────────────
section('checkDateRange — อาการแปลงวันที่ผิด')
eq(checkDateRange(mkRows(5)), null, 'วันที่ปกติ → ผ่าน')
eq(checkDateRange([mkRow({ receive_date: '2569-09-16' })])?.code, 'date_range',
  'พ.ศ. ไม่ถูกแปลง (2569) → บล็อก')
eq(checkDateRange([mkRow({ receive_date: '1899-12-30' })])?.level, 'blocker',
  'serial 0 กลายเป็น 1899 → บล็อก')
eq(checkDateRange([mkRow({ receive_date: '2019-12-31' })])?.code, 'date_range',
  'ก่อนปี 2020 → บล็อก')
eq(checkDateRange([mkRow({ receive_date: '2036-01-01' })])?.code, 'date_range',
  'หลังปี 2035 → บล็อก')
eq(checkDateRange([mkRow({ receive_date: '2020-01-01' })]), null, 'ขอบล่างพอดี → ผ่าน')
eq(checkDateRange([mkRow({ receive_date: '2035-12-31' })]), null, 'ขอบบนพอดี → ผ่าน')
eq(checkDateRange([mkRow({ receive_date: null })]), null, 'วันที่ว่าง → ไม่ใช่หน้าที่ด่านนี้')
eq(checkDateRange([mkRow({ order_date: '2570-01-01' })])?.code, 'date_range',
  'ตรวจ order_date ด้วย')
eq(checkDateRange([mkRow({ inspect_date: '1970-01-01' })])?.code, 'date_range',
  'ตรวจ inspect_date ด้วย')
eq(checkDateRange([mkRow({ receive_date: '2569-01-01' })]).detail.length, 1, 'เก็บรายละเอียดไว้ดู')
eq([YEAR_MIN, YEAR_MAX], [2020, 2035], 'ช่วงปีที่ยอมรับ')

// ── ด่าน 3: ของที่มีแต่ในแอป ─────────────────────────────────────
section('checkAppOnlyData — บิลสแกน/ตรวจรับ จะหายเพราะ DELETE ALL (Critical Rule #8)')
const atRisk = [
  { bill_number: 'SCAN-1', reason: 'บิลสแกน' },
  { bill_number: 'SCAN-2', reason: 'บิลสแกน' },
  { bill_number: 'INSP-1', reason: 'มีรูปตรวจรับ' },
]
eq(checkAppOnlyData([], new Set(['B1'])), null, 'ไม่มีของเสี่ยง → ผ่าน')
eq(checkAppOnlyData(atRisk, new Set(['SCAN-1', 'SCAN-2', 'INSP-1'])), null,
  'ไฟล์มีครบทุกบิล → ผ่าน')
const lost = checkAppOnlyData(atRisk, new Set(['SCAN-1']))
eq(lost.code, 'app_only_data', 'บิลหาย → บล็อก')
eq(lost.level, 'blocker', 'ระดับ blocker')
eq(lost.detail.length, 2, 'ระบุได้ว่าหาย 2 แถว')
eq(lost.message.includes('SCAN-2'), true, 'บอกเลขบิลที่จะหาย')
eq(lost.message.includes('INSP-1'), true, 'บอกครบทุกใบ')
eq(lost.message.includes('บิลสแกน 1'), true, 'สรุปตามเหตุผล')

// ── ด่าน 4: ไฟล์เก่ากว่า DB ──────────────────────────────────────
section('checkStale — ไฟล์สำรองที่โครงสร้างถูกแต่เก่า (ด่านอื่นจับไม่ได้)')
eq(checkStale({ lastDate: '2026-09-17' }, prev2852), null, 'เท่ากัน → ผ่าน')
eq(checkStale({ lastDate: '2026-10-01' }, prev2852), null, 'ใหม่กว่า → ผ่าน')
eq(checkStale({ lastDate: '2026-08-01' }, prev2852)?.code, 'stale_file', 'เก่ากว่า → บล็อก')
eq(checkStale({ lastDate: '2026-09-16' }, prev2852)?.level, 'blocker', 'เก่ากว่า 1 วัน → บล็อก')
eq(checkStale({ lastDate: null }, prev2852), null, 'ไม่มีวันที่ → ข้าม')
eq(checkStale({ lastDate: '2026-01-01' }, null), null, 'ไม่มีของเดิม → ข้าม')

// ── ด่าน 5: มูลค่าแกว่ง (เตือน ไม่บล็อก) ─────────────────────────
section('checkValueSwing')
eq(checkValueSwing({ value: 36143025 }, prev2852), null, 'เท่าเดิม → ผ่าน')
eq(checkValueSwing({ value: 40000000 }, prev2852), null, 'เพิ่ม 10.7% → ยังไม่เตือน')
const swing = checkValueSwing({ value: 50000000 }, prev2852)
eq(swing?.level, 'warning', 'เพิ่ม 38% → เตือน (ไม่บล็อก)')
eq(swing?.code, 'value_swing', 'code')
eq(checkValueSwing({ value: 1000 }, prev2852)?.level, 'warning', 'ลดฮวบ → เตือน')
eq(checkValueSwing({ value: 100 }, { value: 0 }), null, 'เดิม 0 → ข้าม')

// ── ด่าน 6: ไฟล์ว่าง ─────────────────────────────────────────────
section('checkEmpty')
eq(checkEmpty({ count: 0 })?.code, 'empty', '0 แถว → บล็อก')
eq(checkEmpty({ count: 1 }), null, 'มีแถว → ผ่าน')

// ── รวมทุกด่าน ───────────────────────────────────────────────────
section('runGuards — ผลรวม')
const good = runGuards(mkRows(2900, { receive_date: '2026-09-17', total_price_vat: 12463 }), prev2852, [])
eq(good.ok, true, 'ไฟล์ปกติ → ผ่าน')
eq(good.blockers.length, 0, 'ไม่มี blocker')

const empty = runGuards([], prev2852, [])
eq(empty.ok, false, 'ไฟล์ว่าง → ไม่ผ่าน')
eq(empty.blockers[0].code, 'empty', 'เหตุผล: ว่าง')

const shrunk = runGuards(mkRows(100), prev2852, [])
eq(shrunk.ok, false, 'แถวหด → ไม่ผ่าน')
eq(shrunk.blockers.some(b => b.code === 'shrink'), true, 'จับได้ว่าหด')

const badDate = runGuards([mkRow({ receive_date: '2569-09-16' })], null, [])
eq(badDate.ok, false, 'วันที่ พ.ศ. → ไม่ผ่าน')
eq(badDate.blockers[0].code, 'date_range', 'เหตุผล: วันที่')

const warnOnly = runGuards(mkRows(2900, { total_price_vat: 100000, receive_date: '2026-09-17' }), prev2852, [])
eq(warnOnly.ok, true, 'มีแต่ warning → ยังผ่าน (ไม่บล็อก)')
eq(warnOnly.warnings.length >= 1, true, 'แต่ต้องเตือน')

// หลาย blocker พร้อมกัน — ต้องรายงานครบ ไม่ใช่หยุดที่ตัวแรก
const multi = runGuards(
  [mkRow({ receive_date: '2569-01-01', bill_number: 'X' })],
  prev2852,
  [{ bill_number: 'SCAN-9', reason: 'บิลสแกน' }]
)
eq(multi.ok, false, 'หลายปัญหา → ไม่ผ่าน')
eq(multi.blockers.length >= 3, true, 'รายงานครบทุกปัญหา (หด + วันที่ + บิลหาย)')

// ── รายงาน ───────────────────────────────────────────────────────
section('formatGuardReport')
const rpt = formatGuardReport(good)
eq(rpt.includes('ผ่านด่านตรวจทั้งหมด'), true, 'ผ่านหมด → บอกว่าผ่าน')
eq(rpt.includes('แถว'), true, 'มีจำนวนแถว')
const rptBad = formatGuardReport(shrunk)
eq(rptBad.includes('ปัญหาที่ต้องแก้ก่อน'), true, 'มี blocker → ขึ้นหัวข้อปัญหา')
eq(rptBad.includes('เดิม'), true, 'เทียบกับของเดิมให้เห็น')

console.log(`\nผ่าน ${pass} / ${pass + fail}`)
if (fail > 0) { console.log(`ไม่ผ่าน ${fail}`); process.exit(1) }
