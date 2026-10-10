import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire('file:///c:/Users/Admin/OneDrive/Desktop/warehouse-app/package.json')
const { createClient } = require('@supabase/supabase-js')
const env = Object.fromEntries(readFileSync('c:/Users/Admin/OneDrive/Desktop/warehouse-app/.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]))
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const all = async (t, cols) => { let out = [], f = 0; for (;;) { const { data, error } = await sb.from(t).select(cols).range(f, f + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break; f += 1000 } return out }
const inv = (await all('inventory', 'code,lot,exp,qty,invoice,item_type,receive_status')).filter(r => Number(r.qty) > 0 && !String(r.receive_status || '').includes('ตัดออก'))
const rl = await all('receive_logs', 'drug_code,lot,exp,bill_number,supplier_current,price_per_unit')
const k = (c, l) => `${String(c || '').trim().toLowerCase()}|${String(l || '').trim().toLowerCase()}`
const byCL = new Map(); for (const r of rl) { const key = k(r.drug_code, r.lot); if (!byCL.has(key)) byCL.set(key, []); byCL.get(key).push(r) }
let match1 = 0, matchMany = 0, manyDiffPrice = 0, none = 0, dashLot = 0, invBillMatch = 0
const noneByType = {}
for (const r of inv) {
  const lot = String(r.lot || '').trim()
  if (lot === '-' || lot === '') dashLot++
  const hits = byCL.get(k(r.code, r.lot)) || []
  if (!hits.length) { none++; noneByType[r.item_type] = (noneByType[r.item_type] || 0) + 1; continue }
  const bills = new Set(hits.map(h => h.bill_number)); const prices = new Set(hits.map(h => Number(h.price_per_unit).toFixed(2)))
  if (bills.size === 1) match1++; else { matchMany++; if (prices.size > 1) manyDiffPrice++ }
  if (r.invoice && hits.some(h => String(h.bill_number).trim() === String(r.invoice).trim())) invBillMatch++
}
console.log('inventory lots qty>0:', inv.length, '| lot "-":', dashLot)
console.log('match 1 bill:', match1, '| match >1 bill:', matchMany, '(ราคาต่างกัน', manyDiffPrice, ') | ไม่เจอใน receive_logs:', none)
console.log('ไม่เจอ แยกชนิดรายการ:', JSON.stringify(noneByType))
console.log('inventory.invoice ตรงกับบิลใน receive_logs:', invBillMatch)
process.exit(0)
