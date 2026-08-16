import React, { useState, useEffect, useRef } from 'react'
import {
  ClipboardCheck, X, Printer, Save, CheckCircle, AlertTriangle,
  ChevronDown, ChevronUp, Search, Package, Pencil, Trash2, Calendar, Eye, History,
  Sparkles, RefreshCcw,
} from 'lucide-react'
import {
  fetchInventoryNameCodeMap, fetchLotsForCount, createStockCount,
  fetchStockCountSessions, fetchStockCountItems, fetchInventoryLocations,
  updateStockCountItem, updateStockCountSession, deleteStockCountSession, fetchAllStockCountItems,
  updateStockCountFollowup, FOLLOWUP_STATUS, fetchCountPriorityData,
} from './lib/db'
import { dimStatus, diffLabel, computeCountMatch } from './lib/countMatch'
import { rankCountPriority } from './lib/countPriority'
import DrugSearchBar from './DrugSearchBar'
import BackButton from './BackButton'

// ============================================================
// helper
// ============================================================
const fmtThaiDate = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`
}
// วันที่ + เวลา (จาก created_at timestamptz) — ใช้ในประวัติ
const fmtThaiDateTime = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return `${fmtThaiDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} น.`
}
const toNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
// วันนี้ตามเวลาท้องถิ่น — ห้ามใช้ toISOString().slice(0,10) (UTC: ช่วง 00:00-07:00 น. ไทยจะได้วันก่อนหน้า)
const todayLocalIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// date input ที่แสดง DD/MM/YYYY (พ.ศ.) ทับ hidden <input type="date"> — ตาม pattern AuditLog (Rule #3/#14)
function IsoDateInput({ value, onChange, className = '' }) {
  const display = iso => { if (!iso) return null; const [y, m, d] = iso.split('-'); return `${d}/${m}/${Number(y) + 543}` }
  return (
    <div className={`relative flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus-within:ring-2 focus-within:ring-emerald-400 ${className}`}>
      <span className={`px-3 py-1.5 text-sm w-full select-none pointer-events-none ${value ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>{display(value) || 'dd/mm/yyyy'}</span>
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
        onClick={e => { try { e.currentTarget.showPicker?.() } catch { /* noop */ } }}
        className="absolute inset-0 opacity-0 w-full cursor-pointer" />
    </div>
  )
}

// ปุ่ม "ตรง" ใต้แต่ละช่อง — เติมค่าตามระบบ (autofill รายช่อง) / กดซ้ำ = ล้าง
function FieldTick({ active, onClick }) {
  return (
    <button type="button" onClick={onClick}
      title={active ? 'ตรงระบบ (กดเพื่อล้าง)' : 'เติมค่าตามระบบ'}
      className={`mt-1 mx-auto flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
        active ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-600'}`}>
      <CheckCircle size={11} /> ตรง
    </button>
  )
}
// แสดงคงเหลือเป็น "จำนวน × หน่วย" (เช่น 2 × 1000เม็ด) — unit ฝัง packsize ไว้แล้ว
const qtyUnit = (qty, unit) => `${toNum(qty)} × ${unit || '-'}`

// ช่อง "ที่เก็บจริง" — พิมพ์เองได้ + suggestion ตาม segment สุดท้าย (คั่น comma)
// เลือกจาก dropdown ซ้ำ = append ต่อท้าย ไม่ทับค่าเดิม (ยาวางหลายชั้น — ADR-0008 2026-07-16 ข้อ 4)
function LocationInput({ value, onChange, locations, className = '', placeholder = '— ที่เก็บจริง —' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const parts = String(value || '').split(',')
  const last = parts[parts.length - 1].trim()
  // segment สุดท้ายเป็น location สมบูรณ์แล้ว → การเลือกครั้งถัดไปคือ "เพิ่มชั้น" (append)
  const lastComplete = !!last && locations.some(l => l.toLowerCase() === last.toLowerCase())
  const base = (lastComplete ? parts : parts.slice(0, -1)).map(s => s.trim()).filter(Boolean)
  const term = lastComplete ? '' : last.toLowerCase()
  const chosen = new Set(base.map(s => s.toLowerCase()))
  const sugg = (open ? locations : []).filter(l => !chosen.has(l.toLowerCase()) && (!term || l.toLowerCase().includes(term))).slice(0, 8)
  const pick = (loc) => {
    onChange([...base, loc].join(' ,'))
    setOpen(false)
  }
  return (
    <div ref={ref} className="relative">
      <input type="text" value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder} className={className} />
      {sugg.length > 0 && (
        <div className="absolute top-full left-0 mt-1 min-w-full w-max max-w-[14rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto">
          {sugg.map(loc => (
            <button key={loc} type="button" onMouseDown={e => { e.preventDefault(); pick(loc) }}
              className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 border-b border-slate-50 last:border-0">
              {loc}{base.length > 0 ? <span className="text-slate-300 dark:text-slate-500"> (เพิ่มต่อท้าย)</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ผลตรวจของแถวประวัติ — derive สดจาก snapshot (ไม่เชื่อคอลัมน์ match ที่ persist)
// เหตุผล: แถวเก่าก่อนเปลี่ยนกติกา set equality เก็บ match=false จาก false positive
// (เช่น ที่เก็บสลับลำดับ comma) — คำนวณสดทำให้ badge/แถว/timeline สอดคล้องกันโดยไม่ต้อง migrate
const liveMatch = (it) => computeCountMatch(it).match

// สถานะ 1 มิติในประวัติ: ไม่ได้ตรวจ (เทา) / ตรง (เขียว) / ไม่ตรง (ส้ม + ค่าที่นับได้)
function DimLine({ label, st, val }) {
  if (st === 'unchecked') return <p className="text-[10px] text-slate-300 dark:text-slate-500">{label}: ไม่ได้ตรวจ</p>
  if (st === 'ok') return <p className="text-[10px] text-emerald-600">{label}: ตรง</p>
  return <p className="text-[10px] text-amber-600 font-semibold">{label}: {val || '-'}</p>
}

// ป้ายส่วนต่าง "ขาด N / เกิน N" — สีตามทิศ (ขาด = แดง, เกิน = ส้ม)
function DiffCell({ it }) {
  const lbl = diffLabel(it.system_qty, it.counted_qty)
  const cls = lbl === '-' ? 'text-slate-300 dark:text-slate-500'
    : lbl === 'ตรง' ? 'text-slate-400 dark:text-slate-500'
    : lbl.startsWith('ขาด') ? 'text-red-600'
    : 'text-amber-600'
  return <span className={`font-semibold ${cls}`}>{lbl}</span>
}

// chip "นับล่าสุด" ต่อยา — ให้คนนับรู้ว่าตัวนี้เพิ่งนับไปหรือยัง
function LastCountChip({ info }) {
  if (!info) return <p className="text-[10px] mt-0.5 text-slate-300 dark:text-slate-500">ไม่เคยนับ</p>
  return (
    <p className={`text-[10px] mt-0.5 ${info.mismatch ? 'text-amber-600' : 'text-emerald-600'}`}>
      นับล่าสุด {info.label} · {info.mismatch ? 'ไม่ตรง' : 'ตรง'}
    </p>
  )
}

// ใบเดินนับ (พิมพ์) — Blob URL (iOS-safe)
function printCountSheet(items, { counterName, dateLabel }) {
  const rows = items.map((it, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${it.name || '-'}<br><span class="muted">${it.code || ''}</span></td>
      <td class="c">${it.lot || '-'}</td>
      <td class="c">${it.system_location || '-'}</td>
      <td class="c">${it.system_exp || '-'}</td>
      <td class="c">${toNum(it.system_qty)} × ${it.unit || '-'}</td>
      <td class="blank"></td>
      <td class="blank"></td>
      <td class="blank"></td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
  <title>ใบตรวจนับคงคลัง</title>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    *{font-family:'Sarabun',sans-serif;box-sizing:border-box}
    body{margin:24px;color:#1e293b}
    h1{font-size:18px;margin:0 0 4px}
    .sub{font-size:12px;color:#64748b;margin:0 0 16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #cbd5e1;padding:5px 6px;text-align:left;vertical-align:top}
    th{background:#f1f5f9;font-weight:600}
    .c{text-align:center}
    .muted{color:#94a3b8;font-size:10px}
    .blank{background:#fffbeb;min-width:60px}
    .foot{margin-top:18px;font-size:11px;color:#94a3b8}
  </style></head><body>
  <h1>ใบตรวจนับคงคลัง (Stock Count Sheet)</h1>
  <p class="sub">ผู้ตรวจนับ: ${counterName || '-'} &nbsp;·&nbsp; วันที่ ${dateLabel}</p>
  <table>
    <thead><tr>
      <th class="c">#</th><th>รายการยา</th><th class="c">Lot</th>
      <th class="c">ที่เก็บ (ระบบ)</th><th class="c">Exp (ระบบ)</th><th class="c">คงเหลือ (ระบบ)</th>
      <th class="c">นับได้จริง</th><th class="c">ที่เก็บจริง</th><th class="c">Exp จริง</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="foot">พิมพ์เมื่อ ${fmtThaiDate(new Date().toISOString())} — ช่องสีเหลืองสำหรับกรอกมือขณะเดินนับ</p>
  </body></html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (win) { setTimeout(() => URL.revokeObjectURL(url), 30000); return }
  // fallback: in-app WebView (LINE/FB) บล็อก window.open('_blank') → คืน null
  // นำทางผ่าน <a> click แทน (WebView ยอมให้คลิกลิงก์ แต่บล็อก popup) — Rule #4
  const a = document.createElement('a')
  a.href = url; a.target = '_blank'; a.rel = 'noopener'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

// ============================================================
// Root
// ============================================================
export default function StockCountApp({ onRefresh, auth, onGoBack, canGoBack }) {
  const [tab, setTab] = useState('count')
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800 font-sans">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 rounded-xl shrink-0"><ClipboardCheck size={20} /></div>
            <button onClick={onRefresh} className="text-left hover:opacity-70 transition-opacity" title="คลิกเพื่อโหลดใหม่">
              <p className="font-bold text-sm leading-tight text-slate-800 dark:text-slate-100">ตรวจนับคงคลัง</p>
              <p className="text-slate-400 dark:text-slate-500 text-xs">Stock Count / Spot Check</p>
            </button>
          </div>
          {/* segmented control — 2 ปุ่มอยู่ในรางเดียวกัน สื่อว่าเป็นตัวเลือกคู่ (สลับ ไม่ใช่ปุ่มสั่งงานแยกกัน) */}
          <div className="inline-flex gap-1 p-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {[{ key: 'count', label: 'ตรวจนับ', icon: ClipboardCheck }, { key: 'history', label: 'ประวัติ', icon: History }].map(t => {
              const on = tab === t.key
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                    on
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30 dark:shadow-emerald-900/50'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-700/60'
                  }`}>
                  <t.icon size={14} className={on ? 'text-white' : 'text-slate-400 dark:text-slate-500'} />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-4 py-5">
        {tab === 'count' && <CountTab auth={auth} />}
        {tab === 'history' && <HistoryTab auth={auth} />}
      </div>
    </div>
  )
}

// ============================================================
// CountTab — เลือกยา → กรอก 3 มิติ → save
// ============================================================
/**
 * แนะนำว่าควรตรวจนับตัวไหนก่อน — ให้คะแนน 4 สัญญาณผ่าน rankCountPriority (pure)
 *
 * โหลดเมื่อกดเท่านั้น (ไม่ auto-load): ต้อง scan 3 ตารางหลายพันแถว
 * และคนที่รู้อยู่แล้วว่าจะนับตัวไหนไม่ควรต้องรอ
 */
function SuggestPanel({ onPick, onRemove, addedSet }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    setOpen(true)
    if (rows || loading) return
    setLoading(true); setErr('')
    try {
      const data = await fetchCountPriorityData({ months: 6 })
      const today = new Date().toISOString().slice(0, 10)
      setRows(rankCountPriority({ ...data, today }).slice(0, 10))
    } catch (e) {
      setErr(e?.message || 'โหลดข้อมูลไม่สำเร็จ')
    } finally { setLoading(false) }
  }

  const REASON_STYLE = {
    never:    'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',
    stale:    'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300',
    dispense: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
    value:    'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
    location: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300',
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="p-1 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-600"><Sparkles size={14} /></span>
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">ระบบแนะนำ: ควรตรวจตัวไหนก่อน</span>
        <button onClick={() => (open && rows ? setOpen(!open) : load())} disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
          {loading ? <RefreshCcw size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {loading ? 'กำลังวิเคราะห์...' : rows ? (open ? 'ซ่อน' : 'แสดง') : 'ดูรายการแนะนำ'}
        </button>
      </div>

      {open && (
        <>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-2">
            จัดอันดับจาก: ไม่เคยนับ/นับนานแล้ว · เบิกบ่อย (6 เดือน) · มูลค่ารับเข้าสูง · เก็บหลายชั้นวาง
          </p>
          {err && (
            <div className="mt-2 flex items-start gap-2 text-[13px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" /><span>{err}</span>
            </div>
          )}
          {rows && rows.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">ไม่มีข้อมูลพอสำหรับแนะนำ</p>
          )}
          {rows && rows.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {rows.map((r, i) => {
                const added = addedSet?.has(r.code)
                return (
                  <div key={r.code} className="flex items-center gap-2 flex-wrap bg-slate-50 dark:bg-slate-800/60 rounded-lg px-2.5 py-2 border border-slate-100 dark:border-slate-700">
                    <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 w-5 shrink-0">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">{r.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.reasons.map(rs => (
                          <span key={rs.key} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${REASON_STYLE[rs.key] || 'bg-slate-100 text-slate-600'}`}>
                            {rs.text}
                          </span>
                        ))}
                      </div>
                    </div>
                    {/* กดผิดต้องถอยได้ — ปุ่มเป็น toggle ไม่ใช่ทางเดียว (เพิ่มแล้ว = กดซ้ำเพื่อเอาออก) */}
                    <button onClick={() => (added ? onRemove(r.code) : onPick(r.name))}
                      title={added ? 'เอาออกจากรายการนับ' : 'เพิ่มเข้ารายการนับ'}
                      className={`inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-lg shrink-0 transition-colors ${
                        added ? 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-rose-100 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}>
                      {added ? <><X size={12} /> เอาออก</> : 'เพิ่มนับ'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CountTab({ auth }) {
  const today = todayLocalIso()
  const draftKey = `stockcount_draft_${auth?.username || 'anon'}`
  const [nameMap, setNameMap] = useState({ names: [], byName: {}, options: [] })
  const [pickName, setPickName] = useState('')
  const [lines, setLines] = useState([])           // บรรทัดนับ (1 ต่อ code+lot)
  const [addedDrugs, setAddedDrugs] = useState([]) // [{code,name}] ตามลำดับที่เพิ่ม — แทน Set เดิม (ต้องมี name ไว้แสดง placeholder ยาที่ไม่มีบรรทัด)
  const [zeroLots, setZeroLots] = useState({})     // { code: [lot ที่ระบบคงเหลือ 0] } — ซ่อนจนกด "แสดงเพื่อนับ" (phantom stock)
  const [countDate, setCountDate] = useState(today)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)
  const [locations, setLocations] = useState([])
  const [lastCount, setLastCount] = useState({})   // { code: { t, label, mismatch } } — นับล่าสุดต่อยา
  // draft ค้างจาก session ก่อน — แสดง banner ให้เลือกกู้คืน/ทิ้ง (ไม่ auto-restore เงียบ, ADR-0008 2026-07-03 ข้อ 5)
  const [pendingDraft, setPendingDraft] = useState(() => {
    try {
      const raw = localStorage.getItem(`stockcount_draft_${auth?.username || 'anon'}`)
      const d = raw ? JSON.parse(raw) : null
      return d && (d.lines?.length || d.addedDrugs?.length) ? d : null
    } catch { return null }
  })

  const addedSet = new Set(addedDrugs.map(d => d.code))

  useEffect(() => {
    fetchInventoryNameCodeMap().then(m =>
      setNameMap({ ...m, options: (m.names || []).map(name => ({ name, type: m.typeByName?.[name] || '' })) }))
    fetchInventoryLocations().then(setLocations)
    // นับล่าสุดต่อยา — session ล่าสุด (ตาม created_at) ที่มี code นั้น + มีรายการไม่ตรงไหม
    Promise.all([fetchStockCountSessions(), fetchAllStockCountItems()]).then(([sess, map]) => {
      const byId = {}
      sess.forEach(s => { byId[s.id] = s })
      const best = {}
      for (const [sid, items] of Object.entries(map)) {
        const s = byId[sid]
        if (!s) continue
        const t = String(s.created_at || s.counted_at || '')
        const perCode = {}
        items.forEach(it => { (perCode[it.code] ||= []).push(it) })
        for (const [code, its] of Object.entries(perCode)) {
          if (!best[code] || t > best[code].t)
            best[code] = { t, label: fmtThaiDate(s.counted_at || s.created_at), mismatch: its.some(x => !liveMatch(x)) }
        }
      }
      setLastCount(best)
    })
  }, [])

  // เก็บงานค้างลง localStorage ต่อ user — ห้ามเขียน/ล้างก่อนผู้ใช้ตัดสินใจกับ draft เดิม
  // (mount แรก lines ว่าง ถ้าไม่ guard จะลบ draft ทิ้งก่อนได้กู้คืน)
  useEffect(() => {
    if (pendingDraft) return
    try {
      if (lines.length || addedDrugs.length)
        localStorage.setItem(draftKey, JSON.stringify({ lines, addedDrugs, zeroLots, note, countDate, savedAt: new Date().toISOString() }))
      else localStorage.removeItem(draftKey)
    } catch { /* quota เต็ม/private mode — ไม่ block งานนับ */ }
  }, [lines, addedDrugs, zeroLots, note, countDate, pendingDraft, draftKey])

  const restoreDraft = () => {
    // กันทับงานปัจจุบัน — ผู้ใช้อาจเริ่มนับรอบใหม่ไปแล้วโดยยังไม่ตอบ banner
    if (lines.length && !window.confirm('กู้คืนงานค้างจะแทนที่รายการที่กำลังนับอยู่ — ดำเนินการต่อ?')) return
    setLines(pendingDraft.lines || [])
    setAddedDrugs(pendingDraft.addedDrugs || [])
    setZeroLots(pendingDraft.zeroLots || {})
    setNote(pendingDraft.note || '')
    setCountDate(pendingDraft.countDate || today)
    setPendingDraft(null)
  }
  const discardDraft = () => {
    try { localStorage.removeItem(draftKey) } catch { /* noop */ }
    setPendingDraft(null)
  }

  const initLine = (l) => ({ ...l, counted_qty: '', counted_exp: '', counted_location: '', item_note: '', _selected: true })

  const addDrug = async (name) => {
    const code = nameMap.byName[name]
    if (!code || addedSet.has(code)) { setPickName(''); return }
    setLoading(true)
    try {
      const lots = await fetchLotsForCount([code])
      const live = lots.filter(l => toNum(l.system_qty) > 0)
      const zero = lots.filter(l => toNum(l.system_qty) <= 0)
      setLines(prev => [...prev, ...live.map(initLine)])
      if (zero.length) setZeroLots(prev => ({ ...prev, [code]: zero }))
      // เพิ่มเข้ารายการเสมอ (แม้ทุก lot = 0) — แสดง placeholder + เอาออกได้ ไม่ล็อกรหัสเงียบๆ
      setAddedDrugs(prev => [...prev, { code, name }])
    } finally { setLoading(false); setPickName('') }
  }

  // เผย lot ที่ระบบคงเหลือ 0 เข้าตารางนับ (บันทึก phantom stock — ADR-0008 2026-07-16 ข้อ 5)
  const revealZero = (code) => {
    const zs = zeroLots[code] || []
    setLines(prev => [...prev, ...zs.map(l => ({ ...initLine(l), _zero: true }))])
    setZeroLots(prev => { const n = { ...prev }; delete n[code]; return n })
  }

  const updateLine = (idx, field, val) =>
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l))

  // ค่าที่ถือว่า "ตรงระบบ" ของแต่ละช่อง — '-' = ระบบไม่มีข้อมูลมิตินั้น
  // → เติม '' (คงสถานะไม่ได้ตรวจ) ไม่ใช่เติม '-' ซึ่งจะกลายเป็น "ตรวจแล้วตรง" ปลอม
  const sysVal = (l, field) =>
    field === 'counted_qty' ? String(toNum(l.system_qty))
      : field === 'counted_exp' ? (l.system_exp && l.system_exp !== '-' ? l.system_exp : '')
      : (l.system_location && l.system_location !== '-' ? l.system_location : '')

  // เติม/ล้าง 1 ช่อง ให้ตรงระบบ (toggle) — autofill รายช่อง
  const toggleField = (idx, field) =>
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const sv = sysVal(l, field)
      const next = { ...l, [field]: l[field] === sv ? '' : sv }
      if (field === 'counted_exp') next._expCustom = false   // ตรง/ล้าง → ออกจากโหมดพิมพ์เอง
      return next
    }))

  // เลือก exp จาก dropdown: '' = ล้าง, ค่าระบบ = ตรง, '__custom__' = พิมพ์เอง
  const pickExp = (idx, val) =>
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      if (val === '__custom__') return { ...l, _expCustom: true }
      return { ...l, counted_exp: val, _expCustom: false }
    }))

  // กดทีเดียว = ตรงทั้งหมด (เติมนับได้/ที่เก็บ/exp = ค่าระบบ); กดซ้ำเมื่อครบ 3 มิติ = ล้าง (toggle)
  const markLineAllMatch = (idx) =>
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const m = lineMatch(l)
      const complete = m.all && m.checked >= m.fillable
      return complete
        ? { ...l, counted_qty: '', counted_exp: '', counted_location: '', _expCustom: false }
        : { ...l, counted_qty: String(toNum(l.system_qty)), counted_exp: sysVal(l, 'counted_exp'), counted_location: sysVal(l, 'counted_location'), _expCustom: false }
    }))

  // X = เอายาออก "ทั้งตัว" (ทุก lot ของ code เดียวกัน + lot 0 ที่ซ่อน) + ปลดให้เลือกยาตัวนี้ใหม่ได้
  // ต่างจาก checkbox ที่แค่ข้าม lot รายตัวโดยยังเห็นในจอ
  const removeDrug = (code) => {
    setLines(prev => prev.filter(l => l.code !== code))
    setZeroLots(prev => { const n = { ...prev }; delete n[code]; return n })
    setAddedDrugs(prev => prev.filter(d => d.code !== code))
  }

  // ติ๊กเลือก lot ที่จะนับ (default ติ๊กหมด) — save เฉพาะที่ติ๊ก
  const toggleSelect = (idx) =>
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, _selected: !l._selected } : l))
  const selectedCount = lines.filter(l => l._selected).length

  // 3 สถานะต่อมิติ (unchecked/ok/diff) — logic กลางใน countMatch.js (set equality สำหรับ ที่เก็บ/exp)
  // fillable = จำนวนมิติที่ระบบมีข้อมูลให้เทียบ (qty เสมอ; exp/loc เว้น '-') — ใช้ตัดสินว่า autofill "ครบ" แล้ว
  const lineMatch = (l) => {
    const d = dimStatus(l)
    const fillable = 1 + (l.system_exp && l.system_exp !== '-' ? 1 : 0) + (l.system_location && l.system_location !== '-' ? 1 : 0)
    return { ...d, fillable, all: d.qty === 'ok' && !d.anyDiff, counted: d.qty !== 'unchecked' }
  }

  const handleSave = async () => {
    const toSave = lines.filter(l => l._selected)
    if (!toSave.length) return
    // จำนวนเป็นมิติบังคับ (ADR-0008 2026-07-16 ข้อ 2) — กันบรรทัดผี "ไม่ตรง" จากการลืมกรอก
    const missing = toSave.filter(l => l.counted_qty === '' || l.counted_qty == null)
    if (missing.length) {
      const names = missing.slice(0, 3).map(l => `${l.name} (lot ${l.lot})`).join(', ')
      alert(`ยังไม่ได้กรอกจำนวนนับ ${missing.length} รายการ: ${names}${missing.length > 3 ? ' ...' : ''}\nกรอกจำนวนให้ครบ หรือเอาติ๊กออกจากรายการที่ไม่ได้นับ`)
      return
    }
    setSaving(true)
    try {
      const res = await createStockCount(
        { counted_at: countDate || today, note, status: 'done' },
        toSave, auth,
      )
      setSaved(res)
      setLines([]); setAddedDrugs([]); setZeroLots({}); setNote('')
    } catch (e) {
      alert('บันทึกไม่สำเร็จ: ' + (e?.message || e))
    } finally { setSaving(false) }
  }

  const counterName = auth?.name || auth?.username || '-'

  // index บรรทัดแรกของแต่ละ code — ใช้วาง chip "นับล่าสุด" ครั้งเดียวต่อยา
  const firstIdxByCode = {}
  lines.forEach((l, i) => { if (!(l.code in firstIdxByCode)) firstIdxByCode[l.code] = i })

  // ยาที่มีของให้แจ้งใน strip: มี lot 0 ซ่อนอยู่ หรือไม่มีบรรทัดในตารางเลย (ทุก lot = 0)
  const stripDrugs = addedDrugs.filter(d => (zeroLots[d.code]?.length || 0) > 0 || !lines.some(l => l.code === d.code))

  return (
    <div className="space-y-4">
      {pendingDraft && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3 flex flex-wrap items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle size={17} className="shrink-0" />
          <span>มีงานนับค้างจาก {fmtThaiDateTime(pendingDraft.savedAt)} ({(pendingDraft.lines || []).length} รายการ)</span>
          <div className="ml-auto flex gap-2">
            <button onClick={restoreDraft} className="px-3 py-1 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600">กู้คืน</button>
            <button onClick={discardDraft} className="px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-950/70">ทิ้ง</button>
          </div>
        </div>
      )}

      {saved && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl p-3 flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300">
          <CheckCircle size={18} />
          บันทึกรอบตรวจนับแล้ว ({saved.mismatches} รายการไม่ตรง)
          <button onClick={() => setSaved(null)} className="ml-auto text-emerald-600 hover:text-emerald-800"><X size={16} /></button>
        </div>
      )}

      {/* เลือกยา */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
          <span className="p-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600"><Search size={14} /></span> เลือกรหัสยาที่จะตรวจนับ (ทีละตัว)
        </label>
        <DrugSearchBar
          value={pickName}
          onChange={setPickName}
          onSelect={(name) => { addDrug(name) }}
          options={nameMap.options}
          placeholder="พิมพ์ชื่อยาเพื่อเพิ่ม..."
          ringClass="focus:ring-emerald-400"
          hoverClass="hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
          maxResults={10}
        />
        {loading && <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">กำลังโหลด lot...</p>}
      </div>

      <SuggestPanel onPick={addDrug} onRemove={removeDrug} addedSet={addedSet} />

      {/* strip แจ้ง lot ที่ระบบคงเหลือ 0 (ซ่อนอยู่) + ยาที่ทุก lot = 0 */}
      {stripDrugs.length > 0 && (
        <div className="space-y-2">
          {stripDrugs.map(d => {
            const zs = zeroLots[d.code] || []
            const hasLines = lines.some(l => l.code === d.code)
            return (
              <div key={d.code} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-200">{d.name}</span>
                {zs.length > 0 ? (
                  <>
                    <span className={hasLines ? 'text-slate-400 dark:text-slate-500' : 'text-amber-600 font-semibold'}>
                      {hasLines ? `ซ่อน ${zs.length} lot ที่ระบบคงเหลือ 0` : `ทุก lot ของยานี้ระบบคงเหลือ 0 (${zs.length} lot)`}
                    </span>
                    <button onClick={() => revealZero(d.code)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-950/70 transition-colors">
                      <Eye size={12} /> แสดงเพื่อนับ
                    </button>
                  </>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">ไม่พบ lot ในระบบ</span>
                )}
                {!hasLines && (
                  <button onClick={() => removeDrug(d.code)} title="เอายาตัวนี้ออก"
                    className="ml-auto text-slate-300 dark:text-slate-500 hover:text-red-500"><X size={14} /></button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ตารางนับ */}
      {lines.length > 0 ? (
        <>
          {/* desktop */}
          <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[5%]" /><col className="w-[20%]" /><col className="w-[8%]" /><col className="w-[17%]" />
                <col className="w-[15%]" /><col className="w-[15%]" /><col className="w-[15%]" />
                <col className="w-[5%]" /><col className="w-[5%]" />
              </colgroup>
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 sticky top-0 z-[5]">
                <tr className="text-[11px] uppercase tracking-wider">
                  <th className="text-center px-2 py-3.5 font-semibold">นับ</th>
                  <th className="text-left px-3 py-3.5 font-semibold">รายการยา</th>
                  <th className="text-center px-2 py-3.5 font-semibold">Lot</th>
                  <th className="text-center px-2 py-3.5 font-semibold">ระบบ (คงเหลือ/ที่เก็บ/exp)</th>
                  <th className="text-center px-2 py-3.5 font-semibold">นับได้</th>
                  <th className="text-center px-2 py-3.5 font-semibold">ที่เก็บจริง</th>
                  <th className="text-center px-2 py-3.5 font-semibold">exp จริง</th>
                  <th className="text-center px-2 py-3.5 font-semibold">ตรงหมด</th>
                  <th className="px-2 py-3.5"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const m = lineMatch(l)
                  const complete = m.all && m.checked >= m.fillable
                  const expCustom = !!l._expCustom
                  return (
                    <tr key={i} className={`border-t border-slate-50 transition-colors ${l._selected ? 'hover:bg-emerald-50 dark:hover:bg-emerald-950/50' : 'bg-slate-50 dark:bg-slate-800/60 opacity-60'}`}>
                      <td className="text-center px-2 py-3 align-top">
                        <input type="checkbox" checked={!!l._selected} onChange={() => toggleSelect(i)}
                          title="เลือก lot นี้เข้าตรวจนับ"
                          className="w-4 h-4 mt-1 accent-emerald-600 cursor-pointer" />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="font-medium text-slate-800 dark:text-slate-100 truncate">{l.name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{l.code}</p>
                        {firstIdxByCode[l.code] === i && <LastCountChip info={lastCount[l.code]} />}
                        <input type="text" value={l.item_note} placeholder="+ หมายเหตุรายการนี้"
                          onChange={e => updateLine(i, 'item_note', e.target.value)}
                          className="w-full mt-1 px-2 py-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg text-xs placeholder-slate-300 dark:placeholder-slate-500 focus:border-slate-300 focus:ring-1 focus:ring-emerald-200" />
                      </td>
                      <td className="text-center px-2 py-3 align-top">
                        <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-xs px-2 py-0.5">{l.lot || '-'}</span>
                        {l._zero && <span className="block mt-1 mx-auto w-max rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[9px] font-semibold">ระบบว่า 0</span>}
                      </td>
                      <td className="text-center px-2 py-3 text-xs text-slate-500 dark:text-slate-400 align-top">
                        <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{qtyUnit(l.system_qty, l.unit)}</span><br />
                        {l.system_location}<br />{l.system_exp}
                      </td>
                      {/* นับได้ */}
                      <td className="px-2 py-2 align-top">
                        <div className="flex items-center justify-center gap-1">
                          <input type="number" inputMode="decimal" value={l.counted_qty}
                            onChange={e => updateLine(i, 'counted_qty', e.target.value)}
                            className={`w-16 px-2 py-1 border rounded-lg text-center ${m.qty === 'diff' ? 'border-red-400 bg-red-50 dark:bg-red-950/40 text-slate-800 dark:text-red-100' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`} />
                          <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">× {l.unit}</span>
                        </div>
                        <FieldTick active={m.qty === 'ok'} onClick={() => toggleField(i, 'counted_qty')} />
                      </td>
                      {/* ที่เก็บจริง — พิมพ์เอง/เลือกซ้ำเพื่อเพิ่มหลายชั้น */}
                      <td className="px-2 py-2 align-top">
                        <LocationInput value={l.counted_location} locations={locations}
                          onChange={v => updateLine(i, 'counted_location', v)}
                          className={`w-full px-2 py-1 border rounded-lg text-center text-xs ${m.loc === 'diff' ? 'border-red-400 bg-red-50 dark:bg-red-950/40 text-slate-800 dark:text-red-100' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`} />
                        <FieldTick active={m.loc === 'ok'} onClick={() => toggleField(i, 'counted_location')} />
                      </td>
                      {/* exp จริง — dropdown (ค่าระบบ / อื่นๆ→พิมพ์เอง) */}
                      <td className="px-2 py-2 align-top">
                        <select value={expCustom ? '__custom__' : l.counted_exp}
                          onChange={e => pickExp(i, e.target.value)}
                          className={`w-full px-2 py-1 border rounded-lg text-center text-xs ${m.exp === 'diff' ? 'border-red-400 bg-red-50 dark:bg-red-950/40 text-slate-800 dark:text-red-100' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`}>
                          <option value="">— exp จริง —</option>
                          {(l.system_exp && l.system_exp !== '-') && <option value={l.system_exp}>{l.system_exp} (ตามระบบ)</option>}
                          <option value="__custom__">อื่นๆ (พิมพ์เอง)</option>
                        </select>
                        {expCustom && (
                          <input type="text" autoFocus value={l.counted_exp} placeholder="เช่น 3/12/2028"
                            onChange={e => updateLine(i, 'counted_exp', e.target.value)}
                            className="w-full mt-1 px-2 py-1 border border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-slate-800 dark:text-amber-100 rounded-lg text-center text-xs" />
                        )}
                        <FieldTick active={m.exp === 'ok'} onClick={() => toggleField(i, 'counted_exp')} />
                      </td>
                      {/* ตรงทั้งหมด */}
                      <td className="text-center px-2 py-2 align-top">
                        <button onClick={() => markLineAllMatch(i)}
                          title={complete ? 'ล้างค่าที่กรอก' : 'ตรงทั้งหมด (เติมค่าตามระบบครบ 3 มิติ)'}
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors ${
                            complete ? 'bg-emerald-500 border-emerald-500 text-white'
                            : m.anyDiff ? 'border-amber-300 dark:border-amber-800/60 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/50'
                            : 'border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-500 hover:border-emerald-300'}`}>
                          {m.anyDiff ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
                        </button>
                      </td>
                      <td className="px-2 py-2 text-center align-top">
                        <button onClick={() => removeDrug(l.code)} title="เอายาตัวนี้ออกทั้งหมด (ทุก lot)" className="text-slate-300 dark:text-slate-500 hover:text-red-500"><X size={16} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* mobile card list */}
          <div className="md:hidden space-y-3">
            {lines.map((l, i) => {
              const m = lineMatch(l)
              const complete = m.all && m.checked >= m.fillable
              const expCustom = !!l._expCustom
              return (
                <div key={i} className={`bg-white dark:bg-slate-900 rounded-2xl border p-3 shadow-sm transition-colors ${l._selected ? 'border-slate-200 dark:border-slate-700' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 opacity-60'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <input type="checkbox" checked={!!l._selected} onChange={() => toggleSelect(i)}
                        title="เลือก lot นี้เข้าตรวจนับ"
                        className="w-4 h-4 mt-0.5 accent-emerald-600 cursor-pointer shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate">{l.name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {l.code} · <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">Lot {l.lot}</span>
                          {l._zero && <span className="ml-1 inline-flex rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[9px] font-semibold">ระบบว่า 0</span>}
                        </p>
                        {firstIdxByCode[l.code] === i && <LastCountChip info={lastCount[l.code]} />}
                      </div>
                    </div>
                    <button onClick={() => removeDrug(l.code)} title="เอายาตัวนี้ออกทั้งหมด (ทุก lot)" className="text-slate-300 dark:text-slate-500 hover:text-red-500 shrink-0"><X size={16} /></button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                    ระบบ: <b className="text-slate-700 dark:text-slate-200">{qtyUnit(l.system_qty, l.unit)}</b> · {l.system_location} · {l.system_exp}
                  </p>
                  <div className="mt-2 space-y-2">
                    {/* นับได้ (ช่องหลัก — เต็มแถว) */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 dark:text-slate-400 w-14 shrink-0">นับได้</label>
                      <input type="number" inputMode="decimal" value={l.counted_qty} placeholder="จำนวน"
                        onChange={e => updateLine(i, 'counted_qty', e.target.value)}
                        className={`flex-1 min-w-0 px-2 py-1.5 border rounded-lg text-center text-sm ${m.qty === 'diff' ? 'border-red-400 bg-red-50 dark:bg-red-950/40 text-slate-800 dark:text-red-100' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`} />
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">× {l.unit}</span>
                      <FieldTick active={m.qty === 'ok'} onClick={() => toggleField(i, 'counted_qty')} />
                    </div>
                    {/* ที่เก็บจริง */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 dark:text-slate-400 w-14 shrink-0">ที่เก็บ</label>
                      <div className="flex-1 min-w-0">
                        <LocationInput value={l.counted_location} locations={locations}
                          onChange={v => updateLine(i, 'counted_location', v)}
                          placeholder="— เลือก/พิมพ์ที่เก็บ —"
                          className={`w-full px-2 py-1.5 border rounded-lg text-center text-xs ${m.loc === 'diff' ? 'border-red-400 bg-red-50 dark:bg-red-950/40 text-slate-800 dark:text-red-100' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`} />
                      </div>
                      <FieldTick active={m.loc === 'ok'} onClick={() => toggleField(i, 'counted_location')} />
                    </div>
                    {/* exp จริง — dropdown */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 dark:text-slate-400 w-14 shrink-0">exp</label>
                      <div className="flex-1 min-w-0">
                        <select value={expCustom ? '__custom__' : l.counted_exp}
                          onChange={e => pickExp(i, e.target.value)}
                          className={`w-full px-2 py-1.5 border rounded-lg text-center text-xs ${m.exp === 'diff' ? 'border-red-400 bg-red-50 dark:bg-red-950/40 text-slate-800 dark:text-red-100' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`}>
                          <option value="">— เลือก exp —</option>
                          {(l.system_exp && l.system_exp !== '-') && <option value={l.system_exp}>{l.system_exp} (ตามระบบ)</option>}
                          <option value="__custom__">อื่นๆ (พิมพ์เอง)</option>
                        </select>
                        {expCustom && (
                          <input type="text" autoFocus value={l.counted_exp} placeholder="เช่น 3/12/2028"
                            onChange={e => updateLine(i, 'counted_exp', e.target.value)}
                            className="w-full mt-1 px-2 py-1.5 border border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-slate-800 dark:text-amber-100 rounded-lg text-center text-xs" />
                        )}
                      </div>
                      <FieldTick active={m.exp === 'ok'} onClick={() => toggleField(i, 'counted_exp')} />
                    </div>
                    {/* หมายเหตุรายการนี้ */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 dark:text-slate-400 w-14 shrink-0">หมายเหตุ</label>
                      <input type="text" value={l.item_note} placeholder="เช่น พบชำรุด / ตำแหน่งจริง"
                        onChange={e => updateLine(i, 'item_note', e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg text-xs" />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="text-xs">
                      {!m.counted ? <span className="text-slate-400 dark:text-slate-500">ยังไม่กรอก</span>
                        : m.anyDiff ? <span className="text-amber-600 flex items-center gap-1"><AlertTriangle size={14} /> ไม่ตรง</span>
                        : m.checked === 3 ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle size={14} /> ตรงระบบ</span>
                        : <span className="text-emerald-600 flex items-center gap-1"><CheckCircle size={14} /> ตรงตามที่ตรวจ {m.checked}/3</span>}
                    </div>
                    <button onClick={() => markLineAllMatch(i)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                        complete ? 'bg-emerald-500 text-white' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/70'}`}>
                      <CheckCircle size={13} /> {complete ? 'ล้าง' : 'ตรงทั้งหมด'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* note + วันที่ + actions */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><Calendar size={14} /> วันที่ตรวจนับ</span>
              <IsoDateInput value={countDate} onChange={setCountDate} className="w-40" />
              <input type="text" value={note} onChange={e => setNote(e.target.value)}
                placeholder="หมายเหตุรอบนี้ (ไม่บังคับ)"
                className="flex-1 min-w-[12rem] px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg text-sm" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">เลือกนับ <span className="font-semibold text-emerald-700 dark:text-emerald-300">{selectedCount}</span> / {lines.length} lot</span>
              <button onClick={() => printCountSheet(lines.filter(l => l._selected), { counterName, dateLabel: fmtThaiDate(countDate || today) })}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-sm font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-950/70 transition-colors ml-auto">
                <Printer size={16} /> พิมพ์ใบเดินนับ
              </button>
              <button onClick={handleSave} disabled={saving || !selectedCount}
                className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl text-sm font-semibold shadow-sm shadow-emerald-200 transition-all disabled:opacity-50 disabled:shadow-none">
                <Save size={16} /> {saving ? 'กำลังบันทึก...' : `บันทึกรอบตรวจนับ${selectedCount ? ` (${selectedCount})` : ''}`}
              </button>
            </div>
          </div>
        </>
      ) : addedDrugs.length === 0 ? (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <Package size={40} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">เลือกรหัสยาด้านบนเพื่อเริ่มตรวจนับ</p>
        </div>
      ) : null}
    </div>
  )
}

// ============================================================
// HistoryTab — ประวัติรอบตรวจนับ
// ============================================================
function HistoryTab({ auth }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [items, setItems] = useState({})
  const [locations, setLocations] = useState([])
  const [editId, setEditId] = useState(null)        // item id ที่กำลังแก้
  const [editVal, setEditVal] = useState({})
  const [busy, setBusy] = useState(false)
  const [allItems, setAllItems] = useState({})      // { session_id: [items] } ทุกรอบ — ใช้ค้นยา/lot + timeline
  const [dateFrom, setDateFrom] = useState('')      // filter ช่วงวันที่ตรวจนับ (ISO)
  const [dateTo, setDateTo] = useState('')
  const [drugQ, setDrugQ] = useState('')            // ค้นชื่อยา/รหัส/lot
  const [drugOpts, setDrugOpts] = useState([])
  const [sessEdit, setSessEdit] = useState(null)    // { id, counted_at, note } — แก้ header รอบ
  const [statusFilter, setStatusFilter] = useState('all')  // all|mismatch|pending|partial|ok

  useEffect(() => {
    fetchStockCountSessions().then(s => { setSessions(s); setLoading(false) })
    fetchInventoryLocations().then(setLocations)
    fetchAllStockCountItems().then(map => {
      setAllItems(map)
      // build autocomplete จากยาที่เคยนับจริง (unique ชื่อ) — badge ชนิดยาไม่มีใน snapshot จึงเว้น
      const seen = new Map()
      Object.values(map).flat().forEach(it => { if (it.name && !seen.has(it.name)) seen.set(it.name, { name: it.name, type: '' }) })
      setDrugOpts([...seen.values()].sort((a, b) => a.name.localeCompare(b.name)))
    })
  }, [])

  // ค้น item ตรงกับคำค้น (ชื่อยา / รหัส / lot)
  const itemMatchesQ = (it, q) => {
    const s = q.trim().toLowerCase()
    if (!s) return true
    return [it.name, it.code, it.lot].some(v => String(v || '').toLowerCase().includes(s))
  }

  // sessions ที่ผ่าน filter วันที่ + คำค้นยา/lot
  // สรุปสถานะของรอบ — derive สดจาก items ที่โหลดครบแล้ว (กฎ ADR-0008: อย่า persist สิ่งที่ compute ได้)
  //   mismatch  = บรรทัดที่ตรวจแล้วไม่ตรง (ต้องมีคนตาม)
  //   pending   = บรรทัดไม่ตรง ที่ยังไม่มีใครกดสถานะติดตาม
  //   partial   = บรรทัดที่ตรวจไม่ครบ 3 มิติ (เว้น ที่เก็บ/exp ไว้)
  const sessionStat = (sid) => {
    const its = allItems[sid] || items[sid] || []
    let mismatch = 0, pending = 0, partial = 0
    for (const it of its) {
      const d = dimStatus(it)
      const bad = !liveMatch(it)
      if (bad) {
        mismatch++
        if ((it.followup_status || 'pending') === 'pending') pending++
      }
      if (d.checked < 3) partial++
    }
    return { total: its.length, mismatch, pending, partial, loaded: its.length > 0 }
  }

  const filteredSessions = sessions.filter(s => {
    if (dateFrom && s.counted_at < dateFrom) return false
    if (dateTo && s.counted_at > dateTo) return false
    if (drugQ.trim()) {
      const its = allItems[s.id] || []
      if (!its.some(it => itemMatchesQ(it, drugQ))) return false
    }
    if (statusFilter !== 'all') {
      const st = sessionStat(s.id)
      if (statusFilter === 'mismatch' && st.mismatch === 0) return false
      if (statusFilter === 'pending'  && st.pending === 0) return false
      if (statusFilter === 'partial'  && st.partial === 0) return false
      if (statusFilter === 'ok'       && (st.mismatch > 0 || st.partial > 0)) return false
    }
    return true
  })

  // สรุปรวมทุกรอบ (ก่อนกรองสถานะ — ตัวเลขบนแถบสรุปต้องนิ่ง ไม่เปลี่ยนตามปุ่มที่กด)
  // ยึดขอบเขตวันที่/คำค้นเดียวกับตาราง ตาม Critical Rule #6 (stat ต้องตรงกับที่ user เห็น)
  const scopeSessions = sessions.filter(s => {
    if (dateFrom && s.counted_at < dateFrom) return false
    if (dateTo && s.counted_at > dateTo) return false
    if (drugQ.trim()) {
      const its = allItems[s.id] || []
      if (!its.some(it => itemMatchesQ(it, drugQ))) return false
    }
    return true
  })
  const summary = scopeSessions.reduce((a, s) => {
    const st = sessionStat(s.id)
    a.sessions++
    a.items += st.total
    a.mismatch += st.mismatch
    a.pending += st.pending
    a.partial += st.partial
    if (st.mismatch > 0) a.badSessions++
    if (st.mismatch === 0 && st.partial === 0 && st.total > 0) a.okSessions++
    return a
  }, { sessions: 0, items: 0, mismatch: 0, pending: 0, partial: 0, badSessions: 0, okSessions: 0 })

  // timeline รายยา: ทุกครั้งที่เคยนับรายการที่ตรงคำค้น เรียงใหม่สุดก่อน (ADR-0008 2026-07-16 ข้อ 7)
  const sessById = {}
  sessions.forEach(s => { sessById[s.id] = s })
  const timeline = []
  if (drugQ.trim()) {
    for (const [sid, its] of Object.entries(allItems)) {
      const s = sessById[sid]
      if (!s) continue
      for (const it of its) if (itemMatchesQ(it, drugQ)) timeline.push({ it, s })
    }
    timeline.sort((a, b) => String(b.s.created_at || b.s.counted_at || '').localeCompare(String(a.s.created_at || a.s.counted_at || '')))
  }

  // group ตามวันที่ตรวจนับ (counted_at) — sessions เรียงใหม่สุดก่อนอยู่แล้ว
  const groupedByDate = filteredSessions.reduce((acc, s) => {
    (acc[s.counted_at] ||= []).push(s)
    return acc
  }, {})
  const dateKeys = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a))

  const toggle = async (id) => {
    if (openId === id) { setOpenId(null); return }
    setOpenId(id)
    if (!items[id]) {
      // ใช้ allItems ที่โหลดมาแล้วถ้ามี — ไม่งั้น fetch รอบนั้น
      const data = allItems[id] || await fetchStockCountItems(id)
      setItems(prev => ({ ...prev, [id]: data }))
    }
  }

  const startEdit = (it) => {
    setEditId(it.id)
    setEditVal({
      counted_qty: it.counted_qty == null ? '' : String(toNum(it.counted_qty)),
      counted_location: it.counted_location || '',
      counted_exp: it.counted_exp || '',
      item_note: it.item_note || '',
      _expCustom: !!it.counted_exp && String(it.counted_exp) !== String(it.system_exp || ''),
    })
  }

  // ค่าที่ถือว่า "ตรงระบบ" ของแต่ละช่อง (อ้าง snapshot ระบบจาก it) — '-' = ไม่มีข้อมูล → เติม ''
  const sysValEdit = (it, field) =>
    field === 'counted_qty' ? String(toNum(it.system_qty))
      : field === 'counted_exp' ? (it.system_exp && it.system_exp !== '-' ? it.system_exp : '')
      : (it.system_location && it.system_location !== '-' ? it.system_location : '')

  // autofill รายช่องในโหมดแก้ไข (toggle เติม/ล้าง)
  const tickEdit = (it, field) =>
    setEditVal(v => {
      const sv = sysValEdit(it, field)
      const next = { ...v, [field]: v[field] === sv ? '' : sv }
      if (field === 'counted_exp') next._expCustom = false
      return next
    })

  // เลือก exp dropdown ในโหมดแก้ไข
  const pickExpEdit = (val) =>
    setEditVal(v => val === '__custom__'
      ? { ...v, _expCustom: true }
      : { ...v, counted_exp: val, _expCustom: false })

  // สถานะต่อมิติของค่าที่กำลังแก้ (set equality เดียวกับตอนนับ) — ใช้ไฮไลต์ FieldTick/กรอบแดง
  const editMatch = (it) =>
    dimStatus({ ...editVal, system_qty: it.system_qty, system_exp: it.system_exp, system_location: it.system_location })

  const saveEdit = async (it) => {
    setBusy(true)
    try {
      await updateStockCountItem(it.id, {
        ...editVal,
        system_qty: it.system_qty, system_exp: it.system_exp, system_location: it.system_location,
      }, auth)
      const data = await fetchStockCountItems(it.session_id)   // reload รอบนั้น
      setItems(prev => ({ ...prev, [it.session_id]: data }))
      setAllItems(prev => ({ ...prev, [it.session_id]: data })) // sync badge/timeline ให้ตรงกับที่แก้
      setEditId(null)
    } catch (e) { alert('แก้ไขไม่สำเร็จ: ' + (e?.message || e)) }
    finally { setBusy(false) }
  }

  // สถานะติดตามส่วนต่าง (ADR-0017) — ไม่แตะค่านับ ส่วนต่างยังอยู่ในประวัติ
  // optimistic: อัปเดต state ก่อนให้ badge/ตัวกรองขยับทันที แล้วค่อยยิง DB
  const saveFollowup = async (it, status) => {
    const patch = (arr) => arr.map(x => x.id === it.id ? { ...x, followup_status: status } : x)
    setItems(prev => ({ ...prev, [it.session_id]: patch(prev[it.session_id] || []) }))
    setAllItems(prev => ({ ...prev, [it.session_id]: patch(prev[it.session_id] || []) }))
    setBusy(true)
    try {
      await updateStockCountFollowup(it.id, status, '', auth)
      const data = await fetchStockCountItems(it.session_id)   // sync ค่า followup_by/at ที่ server เขียน
      setItems(prev => ({ ...prev, [it.session_id]: data }))
      setAllItems(prev => ({ ...prev, [it.session_id]: data }))
    } catch (e) {
      alert('บันทึกสถานะไม่สำเร็จ: ' + (e?.message || e))
      const data = await fetchStockCountItems(it.session_id).catch(() => null)  // rollback จากของจริง
      if (data) {
        setItems(prev => ({ ...prev, [it.session_id]: data }))
        setAllItems(prev => ({ ...prev, [it.session_id]: data }))
      }
    } finally { setBusy(false) }
  }

  const saveSessEdit = async () => {
    setBusy(true)
    try {
      await updateStockCountSession(sessEdit.id, { counted_at: sessEdit.counted_at, note: sessEdit.note }, auth)
      setSessions(prev => prev.map(s => s.id === sessEdit.id ? { ...s, counted_at: sessEdit.counted_at, note: sessEdit.note } : s))
      setSessEdit(null)
    } catch (e) { alert('แก้ไขไม่สำเร็จ: ' + (e?.message || e)) }
    finally { setBusy(false) }
  }

  const deleteSession = async (s) => {
    if (!window.confirm(`ลบรอบตรวจนับวันที่ ${fmtThaiDate(s.counted_at)} ทั้งหมด?`)) return
    setBusy(true)
    try {
      await deleteStockCountSession(s.id, auth)
      setSessions(prev => prev.filter(x => x.id !== s.id))
      if (openId === s.id) setOpenId(null)
    } catch (e) { alert('ลบไม่สำเร็จ: ' + (e?.message || e)) }
    finally { setBusy(false) }
  }

  if (loading) return <p className="text-slate-400 dark:text-slate-500 text-sm">กำลังโหลด...</p>
  if (!sessions.length) return <p className="text-slate-400 dark:text-slate-500 text-sm text-center py-10">ยังไม่มีประวัติตรวจนับ</p>

  const hasFilter = dateFrom || dateTo || drugQ.trim()

  return (
    <div className="space-y-3">
      {/* แถบค้นหา: ช่วงวันที่ + ค้นชื่อยา/lot ที่เคยนับ */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><Calendar size={14} /> วันที่ตรวจนับ</span>
          <IsoDateInput value={dateFrom} onChange={setDateFrom} className="w-40" />
          <span className="text-slate-400 dark:text-slate-500 text-sm">ถึง</span>
          <IsoDateInput value={dateTo} onChange={setDateTo} className="w-40" />
        </div>
        <DrugSearchBar
          value={drugQ}
          onChange={setDrugQ}
          options={drugOpts}
          placeholder="ค้นหายา / รหัส / lot ที่เคยนับ..."
          ringClass="focus:ring-emerald-400"
          hoverClass="hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
          maxResults={10}
        />
        {hasFilter && (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>พบ {filteredSessions.length} รอบ</span>
            <button onClick={() => { setDateFrom(''); setDateTo(''); setDrugQ('') }}
              className="flex items-center gap-1 text-slate-400 dark:text-slate-500 hover:text-red-500">
              <X size={12} /> ล้างตัวกรอง
            </button>
          </div>
        )}
      </div>

      {/* สรุปผล + กรองตามสถานะ — ตัวเลขยึดขอบเขตวันที่/คำค้นเดียวกับตาราง (Critical Rule #6) */}
      {summary.sessions > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5 border border-slate-100 dark:border-slate-700">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider mb-0.5">รอบทั้งหมด</div>
              <div className="text-lg font-black text-slate-700 dark:text-slate-100 tabular-nums">{summary.sessions}</div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">{summary.items} รายการ</div>
            </div>
            <div className="bg-rose-50 dark:bg-rose-950/40 rounded-xl px-3 py-2.5 border border-rose-100 dark:border-rose-900/60">
              <div className="text-[11px] text-rose-600 dark:text-rose-300 uppercase font-bold tracking-wider mb-0.5">ไม่ตรง</div>
              <div className="text-lg font-black text-rose-700 dark:text-rose-200 tabular-nums">{summary.mismatch}</div>
              <div className="text-[11px] text-rose-500 dark:text-rose-400">{summary.badSessions} รอบ</div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl px-3 py-2.5 border border-amber-100 dark:border-amber-900/60">
              <div className="text-[11px] text-amber-700 dark:text-amber-300 uppercase font-bold tracking-wider mb-0.5">ยังไม่จัดการ</div>
              <div className="text-lg font-black text-amber-800 dark:text-amber-200 tabular-nums">{summary.pending}</div>
              <div className="text-[11px] text-amber-600 dark:text-amber-400">รอคนตามเรื่อง</div>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl px-3 py-2.5 border border-emerald-100 dark:border-emerald-900/60">
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300 uppercase font-bold tracking-wider mb-0.5">ตรวจครบ/ตรง</div>
              <div className="text-lg font-black text-emerald-800 dark:text-emerald-200 tabular-nums">{summary.okSessions}</div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400">ตรวจไม่ครบ {summary.partial} รายการ</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { k: 'all',      label: 'ทั้งหมด' },
              { k: 'mismatch', label: `ไม่ตรง (${summary.badSessions})` },
              { k: 'pending',  label: `ยังไม่จัดการ (${summary.pending})` },
              { k: 'partial',  label: `ตรวจไม่ครบ 3 มิติ (${summary.partial})` },
              { k: 'ok',       label: `ตรงทั้งหมด (${summary.okSessions})` },
            ].map(f => (
              <button key={f.k} onClick={() => setStatusFilter(f.k)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  statusFilter === f.k
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* timeline รายยา — ทุกครั้งที่เคยนับรายการที่ค้น (ไม่ต้องไล่กางทีละรอบ) */}
      {timeline.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-900/60 p-3">
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-2 flex items-center gap-1.5">
            <ClipboardCheck size={14} /> ประวัติการนับของรายการที่ค้น ({timeline.length} ครั้ง)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500 dark:text-slate-400">
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left py-1.5 pr-2">นับเมื่อ</th>
                  <th className="text-left px-2">ยา / Lot</th>
                  <th className="text-center px-2">ระบบ</th>
                  <th className="text-center px-2">นับได้</th>
                  <th className="text-center px-2">ส่วนต่าง</th>
                  <th className="text-center px-2">ผล</th>
                </tr>
              </thead>
              <tbody>
                {timeline.slice(0, 30).map(({ it, s }) => {
                  const d = dimStatus(it)
                  const ok = liveMatch(it)
                  return (
                    <tr key={it.id} className={`border-b border-slate-50 ${!ok ? 'bg-amber-50 dark:bg-amber-950/40' : ''}`}>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-slate-600 dark:text-slate-300">{s.created_at ? fmtThaiDateTime(s.created_at) : fmtThaiDate(s.counted_at)}</td>
                      <td className="px-2">{it.name}<span className="text-slate-400 dark:text-slate-500"> · {it.lot}</span></td>
                      <td className="text-center px-2">{qtyUnit(it.system_qty, it.unit)}</td>
                      <td className="text-center px-2">{it.counted_qty == null ? '-' : `${toNum(it.counted_qty)} × ${it.unit}`}</td>
                      <td className="text-center px-2"><DiffCell it={it} /></td>
                      <td className="text-center px-2">
                        {!ok ? <AlertTriangle size={14} className="text-amber-500 inline" />
                          : d.checked === 3 ? <CheckCircle size={14} className="text-emerald-500 inline" />
                          : <span className="text-[10px] font-semibold text-emerald-600">ตรง {d.checked}/3</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {timeline.length > 30 && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">แสดง 30 จาก {timeline.length} ครั้ง — ระบุคำค้นให้แคบลง</p>}
        </div>
      )}

      {!filteredSessions.length ? (
        <p className="text-slate-400 dark:text-slate-500 text-sm text-center py-10">ไม่พบประวัติที่ตรงกับตัวกรอง</p>
      ) : dateKeys.map(dateKey => (
        <div key={dateKey} className="space-y-2">
          {/* หัวข้อวันที่ (group) */}
          <div className="flex items-center gap-2 px-1 pt-1">
            <Calendar size={15} className="text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{fmtThaiDate(dateKey)}</h3>
            <span className="text-xs text-slate-400 dark:text-slate-500">({groupedByDate[dateKey].length} รอบ)</span>
            <div className="flex-1 border-t border-slate-200 dark:border-slate-700 ml-1" />
          </div>
          {groupedByDate[dateKey].map(s => {
        const its = items[s.id] || []
        const mismatch = its.filter(i => !liveMatch(i)).length
        // นับ "ไม่ตรง" จาก allItems (โหลดครบทุกรอบตั้งแต่แรก) เพื่อโชว์ badge บนหัวรอบโดยไม่ต้องกาง
        const allIts = allItems[s.id]
        const headMismatch = allIts ? allIts.filter(i => !liveMatch(i)).length : null
        // ในบรรทัดที่ไม่ตรง ยังเหลือกี่รายการที่ไม่มีใครกดสถานะติดตาม (ADR-0017)
        const headPending = allIts ? allIts.filter(i => !liveMatch(i) && (i.followup_status || 'pending') === 'pending').length : 0
        // "ตรงทั้งหมด" อ้างได้เฉพาะเมื่อทุกรายการตรวจครบ 3 มิติ — ไม่งั้นเป็น "ตรงตามที่ตรวจ" (ADR-0008 2026-07-16 ข้อ 3)
        const fullyChecked = allIts ? allIts.every(i => dimStatus(i).checked === 3) : true
        return (
          <div key={s.id} className={`bg-white dark:bg-slate-900 rounded-xl border overflow-hidden ${headMismatch ? 'border-amber-300 dark:border-amber-800/60' : 'border-slate-200 dark:border-slate-700'}`}>
            <div className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800">
              <button onClick={() => toggle(s.id)} className="flex items-center gap-3 flex-1 text-left">
                <div className={`p-2 rounded-lg ${headMismatch ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600'}`}><ClipboardCheck size={18} /></div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{s.created_at ? fmtThaiDateTime(s.created_at) : fmtThaiDate(s.counted_at)}</p>
                    {headMismatch != null && (headMismatch > 0
                      ? <>
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-semibold"><AlertTriangle size={11} /> ไม่ตรง {headMismatch} รายการ</span>
                          {/* ตามครบแล้วหรือยัง — แยก "ไม่ตรงแต่จัดการแล้ว" ออกจาก "ไม่ตรงและยังไม่มีใครแตะ" */}
                          {headPending === 0
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 px-2 py-0.5 text-[11px] font-semibold"><CheckCircle size={11} /> จัดการครบแล้ว</span>
                            : <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-[11px] font-semibold">ยังไม่จัดการ {headPending}</span>}
                        </>
                      : fullyChecked
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-semibold">ตรงทั้งหมด</span>
                        : <span title="บางรายการตรวจไม่ครบ 3 มิติ (จำนวน/ที่เก็บ/exp)" className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 px-2 py-0.5 text-[11px] font-semibold">ตรงตามที่ตรวจ</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">ผู้นับ: {s.counter_name}{s.note ? ` · ${s.note}` : ''}</p>
                </div>
              </button>
              <button onClick={() => setSessEdit(sessEdit?.id === s.id ? null : { id: s.id, counted_at: s.counted_at, note: s.note || '' })}
                title="แก้วันที่/หมายเหตุรอบ" className="p-2 rounded-lg text-slate-300 dark:text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors">
                <Pencil size={15} />
              </button>
              <button onClick={() => deleteSession(s)} disabled={busy}
                title="ลบรอบนี้" className="p-2 rounded-lg text-slate-300 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors disabled:opacity-50">
                <Trash2 size={16} />
              </button>
              <button onClick={() => toggle(s.id)} className="text-slate-400 dark:text-slate-500">
                {openId === s.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>
            {sessEdit?.id === s.id && (
              <div className="border-t border-slate-100 dark:border-slate-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400">วันที่ตรวจนับ</span>
                <IsoDateInput value={sessEdit.counted_at} onChange={v => setSessEdit(e => ({ ...e, counted_at: v }))} className="w-36" />
                <input type="text" value={sessEdit.note} onChange={e => setSessEdit(x => ({ ...x, note: e.target.value }))}
                  placeholder="หมายเหตุรอบ" className="flex-1 min-w-[10rem] px-2 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg" />
                <button onClick={saveSessEdit} disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:opacity-50">บันทึก</button>
                <button onClick={() => setSessEdit(null)}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">ยกเลิก</button>
              </div>
            )}
            {openId === s.id && (
              <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
                {items[s.id] == null ? <p className="text-xs text-slate-400 dark:text-slate-500">กำลังโหลด...</p> : (
                  <>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                      ตรวจ {its.length} รายการ · <span className={mismatch ? 'text-amber-600 font-semibold' : 'text-emerald-600'}>ไม่ตรง {mismatch} รายการ</span>
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-slate-500 dark:text-slate-400">
                          <tr className="border-b border-slate-100 dark:border-slate-800">
                            <th className="text-left py-1.5 pr-2">ยา / Lot</th>
                            <th className="text-center px-2">ระบบ</th>
                            <th className="text-center px-2">นับได้</th>
                            <th className="text-center px-2">ส่วนต่าง</th>
                            <th className="text-center px-2">ที่เก็บ/exp</th>
                            <th className="text-center px-2">ผล</th>
                            <th className="px-2"></th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-700 dark:text-slate-200">
                          {its.map(it => {
                            const editing = editId === it.id
                            const d = dimStatus(it)
                            const ok = liveMatch(it)
                            return (
                              <tr key={it.id} className={`border-b border-slate-50 dark:border-slate-800 ${editing ? 'bg-emerald-50 dark:bg-emerald-950/40' : !ok ? 'bg-amber-50 dark:bg-amber-950/40' : ''}`}>
                                <td className="py-1.5 pr-2 align-top">
                                  {it.name}<span className="text-slate-400 dark:text-slate-500"> · {it.lot}</span>
                                  {editing ? (
                                    <input type="text" value={editVal.item_note} placeholder="+ หมายเหตุรายการนี้"
                                      onChange={e => setEditVal(v => ({ ...v, item_note: e.target.value }))}
                                      className="w-full mt-1 px-1.5 py-1 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded text-[11px]" />
                                  ) : it.item_note ? (
                                    <p className="text-[11px] text-amber-600 mt-0.5">หมายเหตุ: {it.item_note}</p>
                                  ) : null}
                                </td>
                                <td className="text-center px-2 align-top">{qtyUnit(it.system_qty, it.unit)}</td>
                                {editing ? (() => {
                                  const em = editMatch(it)
                                  return (
                                  <>
                                    <td className="text-center px-2 align-top">
                                      <input type="number" inputMode="decimal" value={editVal.counted_qty}
                                        onChange={e => setEditVal(v => ({ ...v, counted_qty: e.target.value }))}
                                        className={`w-16 px-1.5 py-1 border rounded text-center ${em.qty === 'diff' ? 'border-red-400 bg-red-50 dark:bg-red-950/40 text-slate-800 dark:text-red-100' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`} />
                                      <FieldTick active={em.qty === 'ok'} onClick={() => tickEdit(it, 'counted_qty')} />
                                    </td>
                                    <td className="text-center px-2 text-slate-300 dark:text-slate-500 align-top">—</td>
                                    <td className="text-center px-2 align-top">
                                      <LocationInput value={editVal.counted_location} locations={locations}
                                        onChange={v => setEditVal(x => ({ ...x, counted_location: v }))}
                                        placeholder="— ที่เก็บ —"
                                        className={`w-28 px-1 py-1 border rounded text-center text-[11px] ${em.loc === 'diff' ? 'border-red-400 bg-red-50 dark:bg-red-950/40 text-slate-800 dark:text-red-100' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`} />
                                      <FieldTick active={em.loc === 'ok'} onClick={() => tickEdit(it, 'counted_location')} />
                                      <select value={editVal._expCustom ? '__custom__' : editVal.counted_exp}
                                        onChange={e => pickExpEdit(e.target.value)}
                                        className={`w-28 mt-1 px-1 py-1 border rounded text-center text-[11px] ${em.exp === 'diff' ? 'border-red-400 bg-red-50 dark:bg-red-950/40 text-slate-800 dark:text-red-100' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`}>
                                        <option value="">— exp จริง —</option>
                                        {(it.system_exp && it.system_exp !== '-') && <option value={it.system_exp}>{it.system_exp} (ตามระบบ)</option>}
                                        <option value="__custom__">อื่นๆ (พิมพ์เอง)</option>
                                      </select>
                                      {editVal._expCustom && (
                                        <input type="text" autoFocus value={editVal.counted_exp} placeholder="เช่น 3/12/2028"
                                          onChange={e => setEditVal(v => ({ ...v, counted_exp: e.target.value }))}
                                          className="w-28 mt-1 px-1.5 py-1 border border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-slate-800 dark:text-amber-100 rounded text-center text-[11px]" />
                                      )}
                                      <FieldTick active={em.exp === 'ok'} onClick={() => tickEdit(it, 'counted_exp')} />
                                    </td>
                                    <td className="text-center px-2 align-top">
                                      <div className="flex items-center justify-center gap-1">
                                        <button onClick={() => saveEdit(it)} disabled={busy}
                                          className="p-1.5 rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"><Save size={13} /></button>
                                        <button onClick={() => setEditId(null)}
                                          className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200"><X size={13} /></button>
                                      </div>
                                    </td>
                                    <td></td>
                                  </>
                                  )
                                })() : (
                                  <>
                                    <td className="text-center px-2">{it.counted_qty == null ? '-' : `${toNum(it.counted_qty)} × ${it.unit}`}</td>
                                    <td className="text-center px-2"><DiffCell it={it} /></td>
                                    <td className="text-center px-2">
                                      <DimLine label="ที่เก็บ" st={d.loc} val={it.counted_location} />
                                      <DimLine label="exp" st={d.exp} val={it.counted_exp} />
                                    </td>
                                    <td className="text-center px-2">
                                      {!ok ? <AlertTriangle size={14} className="text-amber-500 inline" />
                                        : d.checked === 3 ? <CheckCircle size={14} className="text-emerald-500 inline" />
                                        : <span className="text-[10px] font-semibold text-emerald-600" title="มิติที่ตรวจตรงหมด แต่ตรวจไม่ครบ 3 มิติ">ตรง {d.checked}/3</span>}
                                      {/* สถานะติดตาม — เฉพาะบรรทัดที่ไม่ตรง (บรรทัดตรงไม่มีอะไรให้ตาม) */}
                                      {!ok && (
                                        <select value={it.followup_status || 'pending'}
                                          onChange={e => saveFollowup(it, e.target.value)}
                                          disabled={busy}
                                          title={it.followup_by ? `${it.followup_by} · ${fmtThaiDateTime(it.followup_at)}` : 'ยังไม่มีใครจัดการ'}
                                          className={`block w-full mt-1 px-1 py-0.5 rounded border text-[10px] text-center ${
                                            (it.followup_status || 'pending') === 'pending'
                                              ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
                                              : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                                          }`}>
                                          {Object.entries(FOLLOWUP_STATUS).map(([k, label]) => (
                                            <option key={k} value={k}>{label}</option>
                                          ))}
                                        </select>
                                      )}
                                    </td>
                                    <td className="text-center px-2">
                                      <button onClick={() => startEdit(it)} title="แก้ไข" className="text-slate-300 dark:text-slate-500 hover:text-emerald-600"><Pencil size={14} /></button>
                                    </td>
                                  </>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
          })}
        </div>
      ))}
    </div>
  )
}
