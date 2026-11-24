// dispenseCheck.test.js — Golden tests สำหรับ src/lib/dispenseCheck.js
// รัน: npm run test:dispensecheck
// ครอบ: ลำดับเกณฑ์แบบ rate_check.py (ไม่พอ → exp ก่อนใช้หมด → กินของมาก → ไม่ถึง LT) · ยอดแนะนำ · ข้อความผู้เบิก/คลัง · LT จากบิล
// ตัวเลขเป็นเคสสังเคราะห์ตามรูปแบบใบจริง — เทียบผลกับ rate_check บนใบจริงทำแยกตอน verify

import { checkDispenseLine, requesterNoteText, staffNoteText, leadTimeFromReceipts, rateFromMonths, parseLeadTime, VERDICT } from './dispenseCheck.js'

let pass = 0, fail = 0
const fails = []
function assertEq(actual, expected, label) {
  if (actual === expected) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`)
}
function section(name) { console.log(`\n=== ${name} ===`) }

const today = new Date(2026, 10, 24)
const exp = (y, m, d) => new Date(y, m - 1, d)
const far = [{ exp: exp(2035, 1, 1) }]

section('ลำดับเกณฑ์')
{
  // ขอเกินจ่ายได้
  const r = checkDispenseLine({ qty: 120, avail: 100, avgDay: 2, avgMonth: 60.8, leadTime: 20, lots: far, today })
  assertEq(r.verdict, VERDICT.SHORT, 'after < 0 → short')
  assertEq(r.level, 'stop', 'short = stop')
  assertEq(r.requesterWarn, true, 'short + ไม่มีของกำลังมา → ผู้เบิกเห็นคำเตือนแบ่งจ่าย')
  assertEq(r.suggestQty, 60, 'แนะนำ = 100 − 2×20')
}
{
  // ของจะหมดอายุก่อนใช้หมด: หลังจ่าย 900 / 1 ต่อวัน = 900 วัน > exp อีก ~67 วัน
  const r = checkDispenseLine({ qty: 100, avail: 1000, avgDay: 1, avgMonth: 30.4, leadTime: 20, lots: [{ exp: exp(2027, 1, 30) }], today })
  assertEq(r.verdict, VERDICT.EXPIRY_OK, 'cov > วันถึง exp lot แรก → expiry_ok')
  assertEq(r.requesterWarn, false, 'expiry_ok ไม่เตือนผู้เบิก')
}
{
  // กินของมาก: ขอ 1.5 เดือนของเรท แต่หลังจ่ายยังพอถึง LT
  const r = checkDispenseLine({ qty: 150, avail: 1000, avgDay: 3.2895, avgMonth: 100, leadTime: 20, lots: far, today })
  assertEq(r.verdict, VERDICT.LARGE, 'share ≥ 1 → large')
  assertEq(r.belowLt, false, 'หลังจ่าย 850 ≥ 66 → ไม่ต่ำกว่า LT')
  assertEq(r.requesterWarn, false, 'large แต่ยังพอถึง LT → ผู้เบิกไม่เห็น')
  assertEq(staffNoteText(r, 'เม็ด').startsWith('ใบเดียวกินของมาก (1.5 เดือนของเรท)'), true, 'ข้อความคลัง large')
}
{
  // กินของมากเพราะ ≥ ครึ่งของที่จ่ายได้ + ไม่ถึง LT → verdict large (ลำดับ rate_check) แต่ผู้เบิกยังเห็นคำเตือน
  const r = checkDispenseLine({ qty: 60, avail: 100, avgDay: 2, avgMonth: 60.8, leadTime: 30, lots: far, today })
  assertEq(r.verdict, VERDICT.LARGE, 'qty ≥ ครึ่งของ avail → large มาก่อน below_lt')
  assertEq(r.requesterWarn, true, 'large + หลังจ่าย 40 < 60 → ผู้เบิกเห็น')
  assertEq(r.suggestQty, 40, 'แนะนำ = 100 − 2×30')
}
{
  const r = checkDispenseLine({ qty: 20, avail: 100, avgDay: 2, avgMonth: 60.8, leadTime: 45, lots: far, today })
  assertEq(r.verdict, VERDICT.BELOW_LT, 'หลังจ่าย 80 < 90 ไม่มีของมา → below_lt')
  assertEq(r.coverDays, 40, 'coverDays = floor(80/2)')
  assertEq(r.suggestQty, 10, 'แนะนำ = 100 − 90')
  assertEq(requesterNoteText(r, 'เม็ด'), 'คลังอาจแบ่งจ่าย แนะนำไม่เกิน 10 เม็ด เพื่อให้คงเหลือพอใช้ทั้ง รพ. อีก 45 วันจนของรอบใหม่มา · ส่งเต็มจำนวนได้ คลังจะพิจารณาอีกครั้ง', 'ข้อความผู้เบิก')
}
{
  const base = { qty: 20, avail: 100, avgDay: 2, avgMonth: 60.8, leadTime: 45, lots: far, today }
  const p = checkDispenseLine({ ...base, pending: 50 })
  assertEq(p.verdict, VERDICT.BELOW_LT_INCOMING, 'มีรอตรวจรับ → below_lt_incoming')
  assertEq(p.level, 'warn', 'incoming = warn')
  assertEq(p.requesterWarn, false, 'มีของกำลังมา → ไม่เตือนผู้เบิก')
  const n = checkDispenseLine({ ...base, notifiedOn: '2026-11-20' })
  assertEq(n.verdict, VERDICT.BELOW_LT_INCOMING, 'แจ้งซื้อแล้ว → below_lt_incoming')
}
{
  // คงเหลือต่ำกว่าที่ต้องเหลือตั้งแต่ก่อนจ่าย → แนะนำ 0 ใช้ข้อความอีกแบบ
  const r = checkDispenseLine({ qty: 5, avail: 30, avgDay: 2, avgMonth: 60.8, leadTime: 20, lots: far, today })
  assertEq(r.suggestQty, 0, 'avail 30 < 40 → แนะนำ 0')
  assertEq(requesterNoteText(r, 'ขวด').startsWith('คงเหลือในคลังน้อยกว่ายอดที่ทั้ง รพ. ใช้'), true, 'แนะนำ 0 ไม่เขียน "ไม่เกิน 0"')
}
{
  const r = checkDispenseLine({ qty: 5, avail: 30, avgDay: 0, avgMonth: 0, lots: far, today })
  assertEq(r.verdict, VERDICT.NO_RATE, 'ไม่มีเรท → no_rate')
  assertEq(r.requesterWarn, false, 'ไม่มีเรท ไม่เตือนผู้เบิก')
  assertEq(staffNoteText(r), 'ตรวจเรทไม่ได้ — ไม่มีเรทเบิก 4 เดือนล่าสุด', 'ข้อความคลัง no_rate')
}
{
  const r = checkDispenseLine({ qty: 10, avail: 1000, avgDay: 1, avgMonth: 30.4, leadTime: 20, lots: far, today })
  assertEq(r.verdict, VERDICT.OK, 'พอ → ok')
  assertEq(requesterNoteText(r), '', 'ok ไม่มีข้อความผู้เบิก')
}
{
  // lot ไม่มี exp ไม่ทำให้ตกข้อ expiry_ok
  const r = checkDispenseLine({ qty: 10, avail: 1000, avgDay: 1, avgMonth: 30.4, leadTime: 20, lots: [{ exp: null }], today })
  assertEq(r.verdict, VERDICT.OK, 'exp ว่าง → ข้ามเกณฑ์ exp')
}

section('LT จากบิล + เรท')
{
  assertEq(parseLeadTime('-'), null, "'-' = ไม่นับ")
  assertEq(parseLeadTime('120'), null, 'เกิน 90 = ไม่นับ')
  assertEq(parseLeadTime('12'), 12, 'ตัวเลขปกติ')
  const rows = [
    { purchase_type: 'การซื้อ', price_per_unit: 10, leadtime: '10' },
    { purchase_type: 'การซื้อ', price_per_unit: 10, leadtime: '25' },
    { purchase_type: 'การซื้อ', price_per_unit: 0, leadtime: '90' },      // ราคา 0 ไม่ใช่บิลซื้อจริง
    { purchase_type: 'ยาสนับสนุน', price_per_unit: 10, leadtime: '80' },
    { purchase_type: 'การซื้อ', price_per_unit: 10, leadtime: '-' },
  ]
  const lt = leadTimeFromReceipts(rows)
  assertEq(lt.days, 17.5, 'เฉลี่ยเฉพาะบิลซื้อจริงที่มี leadtime')
  assertEq(lt.fromBills, 2, 'นับ 2 บิล')
  assertEq(leadTimeFromReceipts([]).days, 20, 'ไม่มีบิล → 20 (ค่าตั้งต้น Excel)')
  const rate = rateFromMonths({ '2026-07': 304, '2026-09': 304 }, ['2026-07', '2026-08', '2026-09', '2026-10'])
  assertEq(rate.avgMonth, 152, 'เดือนไม่มีเบิก = 0 อยู่ในตัวหาร')
  assertEq(rate.avgDay, 5, 'Avg/วัน = 152 ÷ 30.4')
}

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน`)
if (fail) { console.log(fails.join('\n')); process.exit(1) }
