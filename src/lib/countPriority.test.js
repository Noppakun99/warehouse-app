// golden test — countPriority.js (จัดอันดับควรตรวจนับก่อน)
// รัน: npm run test:countpriority
import { rankCountPriority, daysSince, WEIGHT, STALE_DAYS } from './countPriority.js'

let pass = 0, fail = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) { pass++; console.log(`  ok   ${label}`) }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`) }
}
const truthy = (label, got) => {
  if (got) { pass++; console.log(`  ok   ${label}`) }
  else { fail++; console.log(`  FAIL ${label} → ${JSON.stringify(got)}`) }
}

const TODAY = '2026-08-16'

console.log('\n[1] daysSince')
eq('ไม่มีค่า → null', daysSince(null, TODAY), null)
eq('วันนี้ → 0', daysSince('2026-08-16', TODAY), 0)
eq('30 วันก่อน', daysSince('2026-07-17', TODAY), 30)
eq('ค่าเพี้ยน → null', daysSince('ไม่ใช่วันที่', TODAY), null)

console.log('\n[2] ไม่เคยนับ ต้องมาก่อนยาที่เพิ่งนับ (ตัวแปรอื่นเท่ากัน)')
{
  const r = rankCountPriority({
    drugs: [{ code: 'A', name: 'ยา A', locations: 1 }, { code: 'B', name: 'ยา B', locations: 1 }],
    dispenseFreq: { A: 10, B: 10 },
    receiveValue: { A: 1000, B: 1000 },
    lastCounted: { B: TODAY },          // B เพิ่งนับวันนี้ · A ไม่เคยนับ
    today: TODAY,
  })
  eq('อันดับ 1 = A (ไม่เคยนับ)', r[0].code, 'A')
  eq('A มีเหตุผล never', r[0].reasons[0].key, 'never')
  eq('B ไม่มีเหตุผลเรื่องเวลา', r[1].reasons.filter(x => x.key === 'never' || x.key === 'stale').length, 0)
  truthy('คะแนน A > B', r[0].score > r[1].score)
}

console.log('\n[3] นับนานแล้ว (>= STALE_DAYS) ได้คะแนนเวลาเต็ม เท่าไม่เคยนับ')
{
  const old = new Date(Date.UTC(2026, 7, 16) - STALE_DAYS * 86400000).toISOString().slice(0, 10)
  const r = rankCountPriority({
    drugs: [{ code: 'A', name: 'A', locations: 1 }, { code: 'B', name: 'B', locations: 1 }],
    dispenseFreq: {}, receiveValue: {},
    lastCounted: { A: old },            // A นับไว้พอดี STALE_DAYS · B ไม่เคยนับ
    today: TODAY,
  })
  eq('คะแนนเท่ากัน', r[0].score, r[1].score)
  eq('A ได้เหตุผล stale', r.find(x => x.code === 'A').reasons[0].key, 'stale')
}

console.log('\n[4] เบิกบ่อยกว่า → คะแนนสูงกว่า (relative ต่อค่าสูงสุดในชุด)')
{
  const r = rankCountPriority({
    drugs: [{ code: 'HI', name: 'เบิกบ่อย', locations: 1 }, { code: 'LO', name: 'เบิกน้อย', locations: 1 }],
    dispenseFreq: { HI: 100, LO: 1 },
    receiveValue: {}, lastCounted: {}, today: TODAY,
  })
  eq('อันดับ 1 = HI', r[0].code, 'HI')
  truthy('HI มีเหตุผล dispense', r[0].reasons.some(x => x.key === 'dispense'))
  truthy('LO ไม่ควรมีเหตุผล dispense (ต่ำกว่าครึ่งของสูงสุด)', !r[1].reasons.some(x => x.key === 'dispense'))
}

console.log('\n[5] หลายชั้นวาง → ได้คะแนน location, ชั้นเดียว → ไม่ได้')
{
  const r = rankCountPriority({
    drugs: [{ code: 'M', name: 'หลายชั้น', locations: 4 }, { code: 'S', name: 'ชั้นเดียว', locations: 1 }],
    dispenseFreq: {}, receiveValue: {}, lastCounted: { M: TODAY, S: TODAY }, today: TODAY,
  })
  const m = r.find(x => x.code === 'M'), s = r.find(x => x.code === 'S')
  eq('M ได้คะแนน location เต็ม', m.score, WEIGHT.location)
  eq('S ได้ 0', s.score, 0)
  truthy('M บอกเหตุผลจำนวนชั้น', m.reasons.some(x => x.text.includes('4 ชั้นวาง')))
}

console.log('\n[6] มูลค่ารับเข้าสูง → ได้คะแนน value')
{
  const r = rankCountPriority({
    drugs: [{ code: 'V', name: 'แพง', locations: 1 }, { code: 'C', name: 'ถูก', locations: 1 }],
    dispenseFreq: {}, receiveValue: { V: 500000, C: 100 },
    lastCounted: { V: TODAY, C: TODAY }, today: TODAY,
  })
  eq('V ได้คะแนน value เต็ม', r[0].code, 'V')
  eq('V score = WEIGHT.value', r[0].score, WEIGHT.value)
  truthy('C ได้ 0', r[1].score === 0)
}

console.log('\n[7] เคสรวม — ยาที่เข้าเกณฑ์ทุกข้อต้องมาที่ 1 และคะแนนเต็ม 100')
{
  const r = rankCountPriority({
    drugs: [
      { code: 'ALL', name: 'ครบทุกเกณฑ์', locations: 4 },
      { code: 'MEH', name: 'ธรรมดา', locations: 1 },
    ],
    dispenseFreq: { ALL: 50, MEH: 1 },
    receiveValue: { ALL: 900000, MEH: 10 },
    lastCounted: { MEH: TODAY },   // ALL ไม่เคยนับ
    today: TODAY,
  })
  eq('อันดับ 1 = ALL', r[0].code, 'ALL')
  eq('คะแนนเต็ม 100', r[0].score, 100)
  truthy('มีเหตุผลครบ 4 ข้อ', r[0].reasons.length === 4)
  truthy('เหตุผลแรกคือน้ำหนักมากสุด (never=35)', r[0].reasons[0].key === 'never')
}

console.log('\n[8] guard — ชุดว่าง / ข้อมูลขาด ต้องไม่ระเบิด')
{
  eq('drugs ว่าง → []', rankCountPriority({ drugs: [], today: TODAY }), [])
  const r = rankCountPriority({ drugs: [{ code: 'X' }], today: TODAY })
  eq('ไม่มีชื่อ → "-"', r[0].name, '-')
  eq('ไม่มี locations → นับเป็น 1 ชั้น', r[0].locations, 1)
  eq('ไม่เคยนับ → daysSinceCount null', r[0].daysSinceCount, null)
  truthy('ยังได้คะแนนเวลา', r[0].score === WEIGHT.neverCounted)
}

console.log('\n[9] ไม่หารด้วยศูนย์เมื่อทุกตัวเบิก 0 ครั้ง')
{
  const r = rankCountPriority({
    drugs: [{ code: 'A', name: 'A', locations: 1 }, { code: 'B', name: 'B', locations: 1 }],
    dispenseFreq: { A: 0, B: 0 }, receiveValue: { A: 0, B: 0 },
    lastCounted: { A: TODAY, B: TODAY }, today: TODAY,
  })
  eq('ทุกตัวคะแนน 0 ไม่ใช่ NaN', [r[0].score, r[1].score], [0, 0])
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} ผ่าน / ${fail} ไม่ผ่าน`)
process.exit(fail === 0 ? 0 : 1)
