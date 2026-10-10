import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire('file:///c:/Users/Admin/OneDrive/Desktop/warehouse-app/package.json')
const { createClient } = require('@supabase/supabase-js')
const env = Object.fromEntries(readFileSync('c:/Users/Admin/OneDrive/Desktop/warehouse-app/.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]))
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const { data: users, error: uErr } = await sb.from('app_users').select('*'); if (uErr) throw uErr
const byRole = {}; for (const u of users) byRole[u.role] = (byRole[u.role] || 0) + 1
console.log('users by role', JSON.stringify(byRole), 'total', users.length)
const roleOf = {}; for (const u of users) { roleOf[u.full_name] = u.role; roleOf[u.name] = u.role; roleOf[u.username] = u.role; roleOf['id:' + u.id] = u.role }
const since = new Date(Date.now() - 60 * 864e5).toISOString()
let rows = [], from = 0
for (;;) { const { data, error } = await sb.from('audit_logs').select('action,user_name,department,details,created_at').gte('created_at', since).range(from, from + 999); if (error) throw error; rows.push(...data); if (data.length < 1000) break; from += 1000 }
console.log('audit rows 60d', rows.length)
const role = (r) => roleOf['id:' + r.details?.user_id] || roleOf[r.user_name] || 'unknown'
// logins per role: distinct users + login count + distinct days
const lg = {}
for (const r of rows.filter(r => r.action === 'login')) { const k = role(r); lg[k] ??= { logins: 0, users: new Set(), days: new Set() }; lg[k].logins++; lg[k].users.add(r.user_name); lg[k].days.add(r.created_at.slice(0, 10)) }
for (const [k, v] of Object.entries(lg)) console.log('login', k, 'count', v.logins, 'users', v.users.size, 'days', v.days.size)
// top actions per role
const act = {}
for (const r of rows.filter(r => r.action !== 'login')) { const k = role(r); act[k] ??= {}; act[k][r.action] = (act[k][r.action] || 0) + 1 }
for (const [k, v] of Object.entries(act)) console.log('actions', k, JSON.stringify(Object.entries(v).sort((a, b) => b[1] - a[1]).slice(0, 14)))
// requester departments active
const dep = {}; for (const r of rows.filter(r => r.action === 'login' && role(r) === 'requester')) dep[r.department || '-'] = (dep[r.department || '-'] || 0) + 1
console.log('requester login by dept', JSON.stringify(Object.entries(dep).sort((a, b) => b[1] - a[1]).slice(0, 15)))
// hour-of-day for logins
const hr = {}; for (const r of rows.filter(r => r.action === 'login')) { const h = new Date(r.created_at).getHours(); hr[h] = (hr[h] || 0) + 1 }
console.log('login by hour', JSON.stringify(hr))
// device hint
const dev = {}; for (const r of rows.filter(r => r.action === 'login')) { const ua = String(r.details?.ua || r.details?.user_agent || r.details?.device || ''); const k = /Line\//i.test(ua) ? 'LINE' : /Mobile|Android|iPhone/i.test(ua) ? 'mobile' : ua ? 'desktop' : 'n/a'; dev[k] = (dev[k] || 0) + 1 }
console.log('login device', JSON.stringify(dev), 'sample details', JSON.stringify(rows.find(r => r.action === 'login')?.details))

const { data: reqs, error: rErr } = await sb.from('requisitions').select('id,status,created_at,department,requester_name').gte('created_at', since)
if (rErr) console.log('req err', rErr.message); else { const st = {}; const dp = {}; for (const r of reqs) { st[r.status] = (st[r.status] || 0) + 1; dp[r.department] = (dp[r.department] || 0) + 1 } console.log('requisitions 60d', reqs.length, JSON.stringify(st), JSON.stringify(dp)) }
const { count: dl } = await sb.from('dispense_logs').select('id', { count: 'exact', head: true }).gte('dispense_date', since.slice(0, 10))
console.log('dispense_logs rows 60d', dl)
const unk = {}; for (const r of rows.filter(r => role(r) === 'unknown')) unk[r.user_name] = (unk[r.user_name] || 0) + 1
console.log('unknown user_names', JSON.stringify(unk))
const ru = users.map(u => `${u.role}:${u.full_name || u.username}:${u.department || '-'}`); console.log(ru.join(' | '))
process.exit(0)
