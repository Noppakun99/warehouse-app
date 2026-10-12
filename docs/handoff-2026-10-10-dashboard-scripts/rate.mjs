import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire('file:///c:/Users/Admin/OneDrive/Desktop/warehouse-app/package.json')
const XLSX = require('xlsx')
const { createClient } = require('@supabase/supabase-js')
const wb = XLSX.read(readFileSync('c:/Users/Admin/OneDrive/ยอดคลังยา_69.xlsm'), { sheets: ['วิเคราะห์สั่งซื้อ'], cellFormula: true })
const f = wb.Sheets['วิเคราะห์สั่งซื้อ']['E4']?.f || ''
console.log('Excel E4 exclusions:', (f.match(/\*\(เบิกยา\[[^\]]+\][^)]*\)/g) || []).join('\n  '))
const env = Object.fromEntries(readFileSync('c:/Users/Admin/OneDrive/Desktop/warehouse-app/.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]))
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
let rows = [], from = 0
for (;;) { const { data, error } = await sb.from('dispense_logs').select('item_type,main_log,note,department,qty_out,price_per_unit').gte('dispense_date', '2025-10-01').range(from, from + 999); if (error) throw error; rows.push(...data); if (data.length < 1000) break; from += 1000 }
const appSkip = r => String(r.main_log || '').includes('บันทึก') || String(r.note || '').includes('บันทึกเท่านั้น')
const groups = { 'item_type=บันทึกเท่านั้น': r => r.item_type === 'บันทึกเท่านั้น', 'item_type=ยาโครงการ': r => r.item_type === 'ยาโครงการ', 'dept=เบิกเพื่อแลกเปลี่ยนคืนยา': r => r.department === 'เบิกเพื่อแลกเปลี่ยนคืนยา', 'dept=คืนยา': r => r.department === 'คืนยา', 'dept=เบิกเพิ่มจากความผิดพลาด': r => r.department === 'เบิกเพิ่มจากความผิดพลาด' }
console.log('dispense_logs since 2025-10-01:', rows.length)
for (const [k, fn] of Object.entries(groups)) { const g = rows.filter(fn); console.log(k, 'rows', g.length, '| app ตัดออกอยู่แล้ว', g.filter(appSkip).length, '| app นับเป็นการใช้', g.filter(r => !appSkip(r)).length) }
process.exit(0)
