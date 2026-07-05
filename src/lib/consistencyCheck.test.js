/**
 * consistencyCheck.test.js — golden test สำหรับ src/lib/consistencyCheck.js
 * รัน: node src/lib/consistencyCheck.test.js  (npm run test:consistency)
 * ครอบ: lot normalize สองฝั่ง + ข้าม lot='-' + receive ว่าง guard + range-guard
 */

import {
  normLot, isBlankLot, buildReceiveKeySet, checkInventoryOrphans,
  checkRangeGuards, buildConsistencyReport, GUARD,
} from './consistencyCheck.js'

let pass = 0, fail = 0
function check(label, cond) {
  if (cond) { pass++; console.log(`✅ ${label}`) }
  else { fail++; console.log(`❌ ${label}`) }
}

// ============================================================
// 1. normLot — normalize ให้เทียบสองฝั่งตรงกัน
// ============================================================
console.log('=== normLot ===\n')
check('trim + lowercase', normLot(' AB12 ') === 'ab12')
check('sci-notation → เลขเต็ม (1.2E+5)', normLot('1.2E+5') === '120000')
check('null → ""', normLot(null) === '')
check('lot ที่มี space ท้าย match กับไม่มี space', normLot('90736 ') === normLot('90736'))

check('isBlankLot: "-" → true', isBlankLot('-') === true)
check('isBlankLot: "" → true', isBlankLot('  ') === true)
check('isBlankLot: เลขจริง → false', isBlankLot('90736') === false)

// ============================================================
// 2. buildReceiveKeySet — สร้าง key set จาก receive
// ============================================================
console.log('\n=== buildReceiveKeySet ===\n')
const recv = [
  { drug_code: '1650017', lot: 'AB12' },
  { drug_code: '1000047', lot: '90736 ' },   // space ท้าย
  { drug_code: '', lot: 'X' },                // code ว่าง → ข้าม
]
const keySet = buildReceiveKeySet(recv)
check('2 key (code ว่างถูกข้าม)', keySet.size === 2)
check('key normalize: "1650017|ab12"', keySet.has('1650017|ab12'))
check('key normalize space: "1000047|90736"', keySet.has('1000047|90736'))

// ============================================================
// 3. checkInventoryOrphans — referential inv → receive
// ============================================================
console.log('\n=== checkInventoryOrphans ===\n')
const inv = [
  { code: '1650017', name: 'ยา A', lot: 'AB12', qty: '5', location: 'A-1' },   // มีใน receive → ไม่ orphan
  { code: '9999999', name: 'ยา B', lot: 'ZZ99', qty: '3', location: 'B-2' },   // ไม่มีใน receive → orphan
  { code: '1650017', name: 'ยา A', lot: '-', qty: '10', location: 'A-1' },     // lot='-' → ข้าม
  { code: '8888888', name: 'ยา C', lot: 'QQ11', qty: '0', location: 'C-3' },   // qty=0 → ข้าม
]
const orphanRes = checkInventoryOrphans(inv, keySet)
check('hasReceiveData = true', orphanRes.hasReceiveData === true)
check('1 orphan เท่านั้น (ยา B)', orphanRes.orphans.length === 1)
check('orphan คือ code 9999999', orphanRes.orphans[0]?.code === '9999999')
check('lot="-" ไม่ถูก flag', !orphanRes.orphans.some(o => o.code === '1650017'))
check('qty=0 ไม่ถูก flag', !orphanRes.orphans.some(o => o.code === '8888888'))

// lot match ข้ามฝั่ง: inventory มี space, receive ไม่มี → ต้อง match
const invSpace = [{ code: '1000047', name: 'ยา D', lot: '90736 ', qty: '2', location: 'D-1' }]
const spaceRes = checkInventoryOrphans(invSpace, keySet)
check('lot มี space ท้ายฝั่ง inventory → ยัง match receive (0 orphan)', spaceRes.orphans.length === 0)

// Finding #4: receive ว่าง → ไม่ flag รายตัว
const emptyRes = checkInventoryOrphans(inv, new Set())
check('receive ว่าง → hasReceiveData=false', emptyRes.hasReceiveData === false)
check('receive ว่าง → orphans=[] (ไม่ flag ทั้งจอ)', emptyRes.orphans.length === 0)

// ============================================================
// 4. checkRangeGuards — จับค่าเพี้ยนผิดขนาด
// ============================================================
console.log('\n=== checkRangeGuards ===\n')
const invGuard = [
  { code: 'A', name: 'ปกติ', qty: '5', safety_stock: '3' },
  { code: 'B', name: 'SS เพี้ยน', qty: '5', safety_stock: '180740' },   // 01/07 magnitude
  { code: 'C', name: 'qty ติดลบ', qty: '-2', lot: 'L1', safety_stock: '10', location: 'X' },
  { code: 'D', name: 'SS พอดีขอบ', qty: '1', safety_stock: String(GUARD.SS_MAX) }, // = MAX ไม่เกิน → ไม่ flag
]
const g = checkRangeGuards(invGuard)
check('SS เพี้ยน 180740 → flag', g.ssTooHigh.length === 1 && g.ssTooHigh[0].code === 'B')
check('SS = MAX พอดี → ไม่ flag (ใช้ >)', !g.ssTooHigh.some(r => r.code === 'D'))
check('qty ติดลบ → flag', g.qtyNegative.length === 1 && g.qtyNegative[0].code === 'C')

// ============================================================
// 5. buildConsistencyReport — รวม
// ============================================================
console.log('\n=== buildConsistencyReport ===\n')
const report = buildConsistencyReport(inv, recv)
check('counts.inventoryRows = 4', report.counts.inventoryRows === 4)
check('counts.receiveKeys = 2', report.counts.receiveKeys === 2)
check('referential.orphans มี 1', report.referential.orphans.length === 1)
check('guards มีทั้ง ssTooHigh + qtyNegative keys', 'ssTooHigh' in report.guards && 'qtyNegative' in report.guards)

// null-safe
const empty = buildConsistencyReport(null, null)
check('input null → ไม่ throw, counts=0', empty.counts.inventoryRows === 0 && empty.counts.receiveKeys === 0)

// ============================================================
console.log(`\n${'='.repeat(40)}`)
console.log(`ผ่าน ${pass} / ล้มเหลว ${fail}`)
if (fail > 0) process.exit(1)
