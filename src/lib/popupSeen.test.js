// popupSeen.test.js — Golden tests สำหรับ src/lib/popupSeen.js
// รัน: node src/lib/popupSeen.test.js  (npm run test:popupseen)
// กฎ: ต้องผ่าน 100% ก่อน commit
// ครอบ: ครั้งแรกเด้งทุกตัว / วันละครั้ง / เฉพาะ lot ใหม่ / ไม่มีเรื่องใหม่ไม่กินโควตาวันนี้ /
//       key ที่หลุดเกณฑ์แล้วกลับมา = ใหม่ / storage พัง = ถือว่ายังไม่เห็น

import { pickPopupRows, readSeen, writeSeen, popupStorageKey } from './popupSeen.js'

let pass = 0, fail = 0
const fails = []

function assertEq(actual, expected, label) {
  const ok = actual === expected
  if (ok) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`)
}
function assertDeep(actual, expected, label) {
  assertEq(JSON.stringify(actual), JSON.stringify(expected), label)
}
function section(name) { console.log(`\n=== ${name} ===`) }

const keyOf = (r) => `${r.code}|${r.lot}`
const A = { code: 'A', lot: '1' }, B = { code: 'B', lot: '2' }, C = { code: 'C', lot: '3' }

section('ครั้งแรก / วันละครั้ง / เฉพาะ lot ใหม่')
{
  const r1 = pickPopupRows({ rows: [A, B], keyOf, seen: undefined, today: '2026-10-11' })
  assertEq(r1.show.length, 2, 'ไม่เคยเห็นเลย → เด้งทุก lot')
  assertDeep(r1.nextSeen, { date: '2026-10-11', keys: ['A|1', 'B|2'] }, 'จำทุก lot ที่เข้าเกณฑ์ + วันที่')

  const r2 = pickPopupRows({ rows: [A, B, C], keyOf, seen: r1.nextSeen, today: '2026-10-11' })
  assertEq(r2.show.length, 0, 'วันเดียวกันเด้งไปแล้ว → ไม่เด้งซ้ำแม้มี lot ใหม่')
  assertEq(r2.nextSeen, null, 'ไม่ต้องเขียน state')

  const r3 = pickPopupRows({ rows: [A, B, C], keyOf, seen: r1.nextSeen, today: '2026-10-12' })
  assertDeep(r3.show.map(keyOf), ['C|3'], 'วันใหม่ → เด้งเฉพาะ lot ที่ยังไม่เคยเห็น')

  const r4 = pickPopupRows({ rows: [A, B], keyOf, seen: r1.nextSeen, today: '2026-10-12' })
  assertEq(r4.show.length, 0, 'วันใหม่แต่ไม่มีเรื่องใหม่ → ไม่เด้ง')
  assertEq(r4.nextSeen, null, 'ไม่มีเรื่องใหม่ = ยังไม่นับว่าเด้งวันนี้ (lot ใหม่ช่วงบ่ายยังเด้งได้)')
}

section('lot ที่หลุดเกณฑ์แล้วกลับมา = เรื่องใหม่')
{
  const day1 = pickPopupRows({ rows: [A, B], keyOf, seen: undefined, today: '2026-10-11' }).nextSeen
  const day2 = pickPopupRows({ rows: [C], keyOf, seen: day1, today: '2026-10-12' })
  assertDeep(day2.nextSeen.keys, ['C|3'], 'state เก็บเฉพาะ lot ที่เข้าเกณฑ์ตอนเด้ง (A, B หลุดไปแล้วถูกทิ้ง)')
  const day3 = pickPopupRows({ rows: [A, C], keyOf, seen: day2.nextSeen, today: '2026-10-13' })
  assertDeep(day3.show.map(keyOf), ['A|1'], 'A กลับมาเข้าเกณฑ์อีก → เด้งใหม่')
}

section('storage อ่าน/เขียนไม่ได้ = ถือว่ายังไม่เห็น ไม่ throw')
{
  const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assertDeep(readSeen(broken, 'k'), { date: null, keys: [] }, 'getItem throw → EMPTY')
  writeSeen(broken, 'k', { date: 'x', keys: [] })
  assertEq(true, true, 'setItem throw → ไม่ throw ออกมา')
  const garbage = { getItem: () => '{not json' }
  assertDeep(readSeen(garbage, 'k'), { date: null, keys: [] }, 'JSON เสีย → EMPTY')
  const wrongShape = { getItem: () => '{"date":"2026-10-11"}' }
  assertDeep(readSeen(wrongShape, 'k'), { date: null, keys: [] }, 'ไม่มี keys → EMPTY')
  assertDeep(readSeen(null, 'k'), { date: null, keys: [] }, 'ไม่มี storage → EMPTY')

  const mem = new Map()
  const fake = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }
  const key = popupStorageKey('expired', 7)
  assertEq(key, 'popup_seen_expired_7', 'key แยกตามชนิด popup + user')
  writeSeen(fake, key, { date: '2026-10-11', keys: ['A|1'] })
  assertDeep(readSeen(fake, key), { date: '2026-10-11', keys: ['A|1'] }, 'เขียนแล้วอ่านกลับได้')
}

// ────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
if (fail === 0) {
  console.log(`✓ ผ่านทั้งหมด ${pass} assertions`)
} else {
  console.log(`✗ FAIL ${fail} / ${pass + fail} assertions:\n`)
  console.log(fails.join('\n\n'))
  process.exit(1)
}
