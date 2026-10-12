import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire('file:///c:/Users/Admin/OneDrive/Desktop/warehouse-app/package.json')
const { createClient } = require('@supabase/supabase-js')
const env = Object.fromEntries(readFileSync('c:/Users/Admin/OneDrive/Desktop/warehouse-app/.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]))
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const all = async (t, cols, q = x => x) => { let out = [], f = 0; for (;;) { const { data, error } = await q(sb.from(t).select(cols)).range(f, f + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break; f += 1000 } return out }
const parseExp = (raw) => { if (!raw || raw === '-') return null; const s = String(raw).trim(); let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (m) { let [, d, mo, y] = m.map(Number); if (y < 100) y += 2000; if (y > 2500) y -= 543; return new Date(y, mo - 1, d) } m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) { let [, y, mo, d] = m.map(Number); if (y > 2500) y -= 543; return new Date(y, mo - 1, d) } m = s.match(/^(\d{1,2})[/-](\d{4})$/); if (m) { let [, mo, y] = m.map(Number); if (y > 2500) y -= 543; return new Date(y, mo, 0) } return null }
const today = new Date(); today.setHours(0, 0, 0, 0)
const inv = await all('inventory', 'code,name,lot,exp,qty,receive_status,safety_stock')
const live = inv.filter(r => !String(r.receive_status || '').includes('ตัดออก'))
const days = r => { const e = parseExp(r.exp); return e ? Math.floor((e - today) / 864e5) : null }
const hasQty = r => !(!isNaN(parseFloat(r.qty)) && parseFloat(r.qty) === 0)
const exp = live.filter(r => hasQty(r) && days(r) !== null)
const b = (lo, hi) => exp.filter(r => days(r) >= lo && days(r) < hi).length
console.log('หมดอายุค้างชั้น (qty>0):', exp.filter(r => days(r) < 0).length, '| ≤90 วัน:', b(0, 91), '| 91–180:', b(91, 181), '| 181–365:', b(181, 366), '| 366–480 (16 เดือน):', b(366, 487))
console.log('การ์ดเดิม "ใกล้หมดอายุ 16 เดือน" นับได้:', exp.filter(r => days(r) < 487).length)
// pending receive + wait days
const rl = await all('receive_logs', 'drug_code,lot,receive_date,bill_number,supplier_current,ap_stage,acknowledged_at')
const lastRecv = new Map(); for (const r of rl) { const k = `${String(r.drug_code).toLowerCase()}|${String(r.lot).toLowerCase()}`; if (!lastRecv.has(k) || r.receive_date > lastRecv.get(k)) lastRecv.set(k, r.receive_date) }
const pend = live.filter(r => String(r.receive_status || '').includes('รอตรวจรับ'))
const wait = pend.map(r => { const d = lastRecv.get(`${String(r.code).toLowerCase()}|${String(r.lot).toLowerCase()}`); return d ? Math.floor((today - new Date(d)) / 864e5) : null })
console.log('รอตรวจรับ (lot):', pend.length, '| รอ >7 วัน:', wait.filter(w => w > 7).length, '| >14 วัน:', wait.filter(w => w > 14).length, '| ไม่รู้วันรับ:', wait.filter(w => w === null).length)
// AP bills not inspected
const bills = new Map(); for (const r of rl) { if (r.ap_stage) continue; const k = `${r.bill_number}|${r.supplier_current}|${r.receive_date}`; if (!bills.has(k)) bills.set(k, { ack: !!r.acknowledged_at, d: r.receive_date }) }
const bl = [...bills.values()]; const old = d => Math.floor((today - new Date(d)) / 864e5)
console.log('บิลยังไม่ตรวจรับ (ap_stage null):', bl.length, '| รอจัดซื้อรับ:', bl.filter(x => !x.ack).length, '| จัดซื้อรับแล้วรอตรวจ:', bl.filter(x => x.ack).length, '| เกิน 30 วัน:', bl.filter(x => old(x.d) > 30).length)
// low stock / out of stock per code
const cfg = await all('drug_reorder_config', 'code,exclude_status')
const exc = new Map(cfg.map(c => [String(c.code).toLowerCase(), c.exclude_status]))
const byCode = new Map(); for (const r of live) { const k = String(r.code || '').trim().toLowerCase(); if (!k) continue; const c = byCode.get(k) || { qty: 0, ss: 0 }; c.qty += parseFloat(r.qty) || 0; c.ss = Math.max(c.ss, parseFloat(r.safety_stock) || 0); byCode.set(k, c) }
const watch = [...byCode].filter(([k]) => !['ตัดออก', 'สั่งเมื่อขอ'].includes(exc.get(k)))
console.log('ต่ำกว่า SS:', watch.filter(([, c]) => c.ss > 0 && c.qty < c.ss).length, '| หมดสต็อก (qty=0, SS>0):', watch.filter(([, c]) => c.ss > 0 && c.qty <= 0).length, '| ต่ำกว่าครึ่ง SS:', watch.filter(([, c]) => c.ss > 0 && c.qty < c.ss / 2).length)
// loans
const loans = await all('drug_loan', 'direction,loan_date,return_date')
const open = loans.filter(l => !l.return_date); const ld = l => old(l.loan_date)
console.log('ยืม-คืนค้าง:', open.length, '| >90 วัน:', open.filter(l => ld(l) > 90).length, '| 30–90:', open.filter(l => ld(l) >= 30 && ld(l) <= 90).length)
// annual count
const { data: sess } = await sb.from('stock_count_session').select('id,kind,status,created_at').eq('kind', 'annual').eq('status', 'draft')
for (const s of sess || []) { const items = await all('stock_count_item', 'counted_qty', q => q.eq('session_id', s.id)); console.log('รอบนับประจำปีค้าง', s.id, 'เปิด', s.created_at.slice(0, 10), '| นับแล้ว', items.filter(i => i.counted_qty != null).length, '/', items.length) }
const { data: um } = await sb.from('upload_meta').select('*'); console.log('upload_meta:', JSON.stringify((um || []).map(u => [u.type, u.updated_at?.slice(0, 16)])))
const { data: sra } = await sb.from('swap_return_action').select('status'); const st = {}; for (const x of sra || []) st[x.status] = (st[x.status] || 0) + 1; console.log('swap_return_action สถานะ:', JSON.stringify(st))
process.exit(0)
