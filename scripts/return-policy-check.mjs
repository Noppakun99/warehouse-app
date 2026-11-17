#!/usr/bin/env node
// return-policy-check.mjs — สรุปนโยบายคืนบริษัทของ lot คงเหลือทุกตัว (อ่านอย่างเดียว ไม่เขียน DB)
//
//   node scripts/return-policy-check.mjs              ← สรุปจำนวน + รายชื่อ lot ที่บริษัทไม่รับคืน
//   node scripts/return-policy-check.mjs --all        ← + รายชื่อ lot ต้องเช็กเอกสาร / ไม่พบบริษัท
//   node scripts/return-policy-check.mjs --json <path> ← เขียนผลราย lot เป็น JSON (ไว้เทียบกับบอท dryRun)
//
// ใช้ fetchCompanyPolicyData + buildCompanyPolicyIndex ตัวเดียวกับหน้านโยบายคืนบริษัท/บัตรยา
// → ผลตรงแอปทุก lot · บอท expiry-alert ต้องติดป้าย "บริษัทไม่รับคืน" ชุดเดียวกับ status no_return ที่นี่

import fs from 'fs'
import { loadEnv, log, die, parseArgs } from './_shared.mjs'

loadEnv()
const db = await import('../src/lib/db.js')
const { supabase } = await import('../src/lib/supabase.js')
const { buildCompanyPolicyIndex } = await import('../src/lib/drugProfile.js')
const args = parseArgs()
if (!supabase) die('ไม่พบค่า Supabase ใน .env.local')

const data = await db.fetchCompanyPolicyData()
const { lines } = buildCompanyPolicyIndex({ ...data, today: new Date() })

const GROUP = {
  ok: 'คืนได้ (ยังไม่ถึงกำหนด)', due: 'ใกล้ถึงกำหนดคืน', overdue: 'พ้นกำหนดคืน',
  no_return: 'บริษัทไม่รับคืน', review: 'ต้องเช็กเอกสาร', no_policy: 'มีบริษัท ไม่มีนโยบาย', no_company: 'ไม่พบบริษัทของ lot',
}
const by = {}
for (const l of lines) (by[l.returnPolicy.status] ||= []).push(l)

const fmtExp = (d) => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}` : '-'
const row = (l) => `  ${l.code} ${l.name} · lot ${l.lot || '-'} · exp ${fmtExp(l.expDate)} · ${l.qty} ${l.unit || ''} · ${l.returnPolicy.company || '-'}${l.returnPolicy.note ? ` · ${l.returnPolicy.note}` : ''}`

log('')
log(`━━━ นโยบายคืนบริษัท lot คงเหลือ ${lines.length} lot (${new Date().toLocaleDateString('th-TH')}) ━━━`)
for (const k of Object.keys(GROUP)) log(`  ${GROUP[k].padEnd(26)} ${String(by[k]?.length || 0).padStart(4)}`)

const show = ['no_return', ...(args.has('--all') ? ['review', 'no_company'] : [])]
for (const k of show) {
  const list = (by[k] || []).sort((a, b) => (a.expDate?.getTime() ?? 9e15) - (b.expDate?.getTime() ?? 9e15))
  log('')
  log(`── ${GROUP[k]} (${list.length}) ──`)
  list.forEach(l => log(row(l)))
}

const jsonPath = args.valueOf('--json')
if (jsonPath) {
  const out = lines.map(l => ({ code: l.code, lot: l.lot || '-', status: l.returnPolicy.status, company: l.returnPolicy.company, note: l.returnPolicy.note }))
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 1))
  log('')
  log(`เขียน ${out.length} แถว → ${jsonPath}`)
}
log('')
