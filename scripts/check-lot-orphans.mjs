#!/usr/bin/env node
// check-lot-orphans.mjs — หาบรรทัด "lot เก่าที่ถูกแทนที่แล้ว" ในรอบตรวจนับที่ยังเปิดอยู่
//
//   node scripts/check-lot-orphans.mjs            ← ดูอย่างเดียว
//   node scripts/check-lot-orphans.mjs --commit   ← ลบ (ถามยืนยันทีละคู่)
//
// ที่มา: แก้ lot ในชีท Master → import → กด "รีเฟรชยอดระบบ"
//   refreshAnnualCountSystemQty จะ insert บรรทัด lot ใหม่ให้ แต่ "ไม่ลบบรรทัด lot เก่า"
//   (ตั้งใจ — ถ้าแถวเก่ามีผลนับอยู่ การลบอัตโนมัติ = ทำลายหลักฐาน ผิด ADR-0008)
//   ผลคือของกองเดียวถูกนับซ้ำ 2 บรรทัด → ใบรับรองรายงานยอดเกิน
//
// ⚠️ เกณฑ์ชี้ขาด = "lot เก่าหายจาก inventory แล้ว" ไม่ใช่ "ฟิลด์อื่นเหมือนกัน"
//    ยาจากบิลเดียวกันมักมี lot ไล่กัน (60325/60326) + qty/exp/ที่เก็บเท่ากันเป๊ะ
//    ถ้าดูแค่ฟิลด์เหมือน จะลบของจริงทิ้ง — เจอจริง 4 เคสตอนทดสอบ 2026-09-23

import readline from 'readline'
import fs from 'fs'
import { loadEnv, log, die, parseArgs, fetchAll } from './_shared.mjs'

loadEnv()
const db = await import('../src/lib/db.js')
const { supabase } = await import('../src/lib/supabase.js')
const args = parseArgs()

if (!supabase) die('ไม่พบค่า Supabase ใน .env.local')

// "คู่ที่น่าสงสัย" = code เดียวกัน + ทุกฟิลด์ที่ระบบ gen เหมือนกัน ต่างแค่ lot
const SAME = ['name', 'unit', 'system_qty', 'system_exp', 'system_location']
const norm = (v) => String(v ?? '').trim()

log('')
log('━━━ ตรวจบรรทัด lot เก่าที่ถูกแทนที่ ' + (args.commit ? '(ลบได้)' : '(ดูอย่างเดียว)') + ' ━━━')

const { data: sessions } = await supabase.from('stock_count_session')
  .select('id, kind, status, counted_at').eq('status', 'draft')
if (!sessions?.length) { log('\n  ไม่มีรอบตรวจนับที่เปิดค้าง — ไม่มีอะไรต้องตรวจ\n'); process.exit(0) }

// lot ที่ยังมีของจริงตอนนี้ — ตัวตัดสินว่า lot เก่า "ถูกแทนที่" หรือ "เป็นของจริงอีกกอง"
const invRows = await fetchAll(supabase, 'inventory', 'code, lot, qty')
const liveLots = new Set(invRows.map(r => `${norm(r.code)}|${norm(r.lot) || '-'}`))
const isLive = (r) => liveLots.has(`${norm(r.code)}|${norm(r.lot) || '-'}`)

const all = await fetchAll(supabase, 'stock_count_item',
  'id, session_id, code, name, lot, unit, system_qty, system_exp, system_location, counted_qty, counted_lot, item_note, created_at')

const pairs = []
for (const s of sessions) {
  const rows = all.filter(r => r.session_id === s.id)
  const byCode = new Map()
  rows.forEach(r => byCode.set(r.code, (byCode.get(r.code) || []).concat(r)))

  for (const [, group] of byCode) {
    if (group.length < 2) continue
    for (const a of group) for (const b of group) {
      if (a.id >= b.id) continue
      if (norm(a.lot) === norm(b.lot)) continue                 // lot เดียวกัน = คนละเรื่อง (ซ้ำตรงๆ)
      if (!SAME.every(k => norm(a[k]) === norm(b[k]))) continue // ต่างมากกว่า lot = ของคนละกองจริง
      const [older, newer] = a.created_at <= b.created_at ? [a, b] : [b, a]
      // ⛔ ด่านสำคัญ: lot เก่าต้อง "หายจาก inventory แล้ว" และ lot ใหม่ต้อง "ยังมีของ"
      //    ทั้งคู่ยังมีของ = ของจริง 2 กอง (lot ไล่กันจากบิลเดียวกัน) ห้ามแตะ
      if (isLive(older) || !isLive(newer)) continue
      pairs.push({ session: s, older, newer })
    }
  }
}

if (!pairs.length) {
  log(`\n  ตรวจ ${all.filter(r => sessions.some(s => s.id === r.session_id)).length} บรรทัด — ไม่พบคู่ที่ต่างกันแค่ lot\n`)
  process.exit(0)
}

log(`\n  พบ ${pairs.length} คู่ที่ต่างกันแค่ lot (ของกองเดียวแต่มี 2 บรรทัด)\n`)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(res => rl.question(q, res))
let deleted = 0, skipped = 0

for (const { session, older, newer } of pairs) {
  log('  ─────────────────────────────────────────────')
  log(`  รอบ #${session.id} · ${older.code} ${older.name}`)
  log(`     ${older.system_qty} ${older.unit} · exp ${older.system_exp} · ${older.system_location}`)
  log('')
  log(`     เก่า  id ${older.id}  lot ${older.lot}   นับแล้ว: ${older.counted_qty ?? '— ยังไม่นับ'}`)
  log(`     ใหม่  id ${newer.id}  lot ${newer.lot}   นับแล้ว: ${newer.counted_qty ?? '— ยังไม่นับ'}`)
  log('')

  // ⛔ แถวที่มีผลนับแล้ว = หลักฐาน ห้ามลบ (ADR-0008)
  if (older.counted_qty != null) {
    log('     ⛔ บรรทัดเก่ามีผลนับแล้ว — ไม่ลบ (เป็นหลักฐานว่ามีคนเดินไปนับมา)')
    log('        ถ้า lot ที่นับได้คือตัวใหม่ ให้แก้ที่ช่อง "lot ที่นับได้" ในแอพแทน')
    skipped++; continue
  }
  if (norm(older.item_note) || norm(older.counted_lot)) {
    log('     ⛔ บรรทัดเก่ามีหมายเหตุ/lot ที่นับได้ — ไม่ลบ ให้คนดูเองก่อน')
    skipped++; continue
  }

  if (!args.commit) { log('     (โหมดดูอย่างเดียว — สั่ง --commit เพื่อลบ)'); continue }

  const ans = (await ask(`     ลบบรรทัดเก่า id ${older.id} (lot ${older.lot}) ไหม? [y/N] `)).trim().toLowerCase()
  if (ans !== 'y') { log('     ข้าม'); skipped++; continue }

  fs.mkdirSync('backup', { recursive: true })
  const bak = `backup/stock_count_item_${older.id}_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.json`
  fs.writeFileSync(bak, JSON.stringify(older, null, 2), 'utf8')

  const { error } = await supabase.from('stock_count_item')
    .delete().eq('id', older.id).is('counted_qty', null)   // กันแข่งกับคนที่เพิ่งนับพอดี
  if (error) { log('     ✗ ลบไม่สำเร็จ — ' + error.message); skipped++; continue }

  await db.insertAuditLog({
    action: 'delete_annual_count_line', table_name: 'stock_count_item',
    user_name: db.resolveAuditUserName({ name: args.user }), department: 'คลังยา', record_count: 1,
    details: { session_id: session.id, item_id: older.id, code: older.code, lot: older.lot, name: older.name,
               reason: `lot เปลี่ยนเป็น ${newer.lot} (บรรทัดใหม่ id ${newer.id}) — บรรทัดนี้ซ้ำและยังไม่ได้นับ`,
               backup: bak },
  })
  log(`     ✓ ลบแล้ว · สำรองที่ ${bak}`)
  deleted++
}

rl.close()
log('')
log(`  สรุป: ลบ ${deleted} · ข้าม ${skipped}`)
log('')
