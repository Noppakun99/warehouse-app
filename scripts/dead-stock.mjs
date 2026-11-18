#!/usr/bin/env node
// dead-stock.mjs — ยาไม่เคลื่อนไหว (Dead Stock) · คงเหลือ+ราคาจากชีท Master · เบิก/รับ/VEN/นโยบายคืนจาก DB (อ่านอย่างเดียวทั้งคู่)
//
//   node scripts/dead-stock.mjs                 ← สรุปจำนวน report/watch
//   node scripts/dead-stock.mjs --json <path>   ← เขียนผลรายยาเป็น JSON (ให้สคริปต์ทำ Excel หัวหน้าอ่าน)
//
// ตรรกะ = buildDeadStock (src/lib/deadStock.js) · นโยบายคืนบริษัท = buildCompanyPolicyIndex ตัวเดียวกับบัตรยา
// มูลค่า = คงเหลือหลังจ่าย × ราคา/หน่วย ของแถว Master นั้น — ไม่ใช้ราคาบิลใน receive_logs
//   (หน่วยบิลกับหน่วยคลังต่างกันได้ เช่นบิล 50amp แต่ลงหน่วย amp → มูลค่าเพี้ยน 50 เท่า · ตรวจ 18/11/2569)
//   --file <xlsm> = ไฟล์ยอดคลัง (ค่าเริ่ม OneDrive\ยอดคลังยา_69.xlsm · อ่านอย่างเดียว)

import fs from 'fs'
import XLSX from 'xlsx'
import { loadEnv, log, die, parseArgs, checkFile } from './_shared.mjs'

loadEnv()
const db = await import('../src/lib/db.js')
const { supabase } = await import('../src/lib/supabase.js')
const { buildCompanyPolicyIndex, parseExpDate } = await import('../src/lib/drugProfile.js')
const { buildDeadStock, drugKey, ymThai } = await import('../src/lib/deadStock.js')
const args = parseArgs()
if (!supabase) die('ไม่พบค่า Supabase ใน .env.local')

async function all(table, cols) {
  const out = []
  for (let p = 0; ; p++) {
    const { data, error } = await supabase.from(table).select(cols).order('id').range(p * 1000, p * 1000 + 999)
    if (error) die(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) return out
  }
}

const [recv, disp, cfg] = await Promise.all([
  all('receive_logs', 'id,drug_code,drug_name,receive_date'),
  all('dispense_logs', 'id,drug_code,drug_name,dispense_date,department,qty_out'),
  supabase.from('drug_reorder_config').select('code,risk_group').then(r => r.data || []),
])

const FILE = args.file || 'C:/Users/PRH0000484/OneDrive/ยอดคลังยา_69.xlsm'
checkFile(FILE)
const { mapMasterColumns, rowToInventoryItem } = await import('../src/lib/masterSheet.js')
const { serialToThai } = await import('../src/lib/excelSerial.js')
const M = XLSX.utils.sheet_to_json(XLSX.readFile(FILE, { sheets: ['Master'], cellDates: false }).Sheets['Master'], { header: 1, raw: true, defval: '' })
const C = mapMasterColumns(M[0])
const cPrice = M[0].findIndex(h => String(h).replace(/\s+/g, '') === 'ราคา/หน่วย')
if (cPrice < 0) die('Master ไม่มีคอลัมน์ ราคา/หน่วย')
// แถว Master ทีละแถว (กฎเดียวกับนำเข้า) + ราคาแถวนั้น — lot เดียวกันมีแถวซื้อ+แถวบริจาคราคา 0 ได้ มูลค่าต้องคิดรายแถว
const stockLots = []
for (const raw of M.slice(1)) {
  const res = raw && rowToInventoryItem(raw, C, serialToThai)
  if (!res) continue
  const it = res.item
  stockLots.push({
    code: it.code, name: it.name, type: it.type, unit: it.unit, lot: it.lot, expDate: parseExpDate(it.exp),
    qty: parseFloat(String(it.qty ?? '').replace(/,/g, '')) || 0, price: Number(raw[cPrice]) || 0,
    location: res.location, itemType: it.itemType, result: it.receiveStatus, supplier: C.supplier >= 0 ? String(raw[C.supplier] ?? '').trim() : '',
  })
}

const firstReceive = new Map()
for (const r of [...recv].sort((a, b) => String(a.receive_date).localeCompare(String(b.receive_date)))) {
  const k = drugKey(r.drug_code, r.drug_name)
  if (r.receive_date && !firstReceive.has(k)) firstReceive.set(k, r.receive_date)
}

const { lines } = buildCompanyPolicyIndex({ ...(await db.fetchCompanyPolicyData()), today: new Date() })
const policies = new Map(lines.map(l => [`${l.code}|${l.lot}`.toLowerCase(), l.returnPolicy]))

const ven = new Map(cfg.map(c => [String(c.code).trim(), c.risk_group]))

const res = buildDeadStock({ stockLots, dispenses: disp, firstReceive, ven, policies, historyStart: '2025-10' })
const rep = res.rows.filter(r => r.tier === 'report'), watch = res.rows.filter(r => r.tier === 'watch')
const sum = (a) => a.reduce((s, r) => s + r.value, 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })
log(`ยาไม่เคลื่อนไหว ณ ${new Date().toLocaleDateString('th-TH')} · นับถึงเดือน ${ymThai(res.lastCompleteYm)}`)
log(`  ≥6 เดือน (แจ้ง)   ${rep.length} รายการ · ${sum(rep)} บาท · เสนอ PTC ได้ ${rep.filter(r => r.ptc === 'เสนอพิจารณาออกได้').length}`)
log(`  3–5 เดือน (เฝ้าดู) ${watch.length} รายการ · ${sum(watch)} บาท`)

const out = args.valueOf('--json')
if (out) {
  const iso = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null
  const rows = res.rows.map(({ lots, ...r }) => ({
    ...r, nearestExp: iso(r.nearestExp), lastUseThai: ymThai(r.lastUseYm), firstReceiveThai: ymThai(r.firstReceiveYm), ven: ven.get(r.code) || null,
    lots: lots.map(l => ({ lot: l.lot, exp: iso(l.expDate), qty: l.qty, unit: l.unit, value: Math.round(l.value * 100) / 100, location: l.location || '',
      supplier: l.supplier || '', supported: l.supported, policy: l.policy ? { status: l.policy.status, deadline: l.policy.deadlineIso, company: l.policy.company } : null })),
  }))
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), currentYm: res.currentYm, lastCompleteYm: res.lastCompleteYm, rows }, null, 1))
  log(`เขียน ${out}`)
}
