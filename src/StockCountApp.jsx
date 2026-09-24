import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  ClipboardCheck, X, Printer, Save, CheckCircle, AlertTriangle,
  ChevronDown, ChevronUp, Search, Package, Pencil, Trash2, Calendar, Eye, History,
  Sparkles, RefreshCcw, CalendarCheck, ChevronLeft, ChevronRight, Loader2, WifiOff, FileDown, Eraser, Clock,
} from 'lucide-react'
import {
  fetchInventoryNameCodeMap, fetchLotsForCount, createStockCount,
  fetchStockCountSessions, fetchStockCountItems, fetchInventoryLocations,
  updateStockCountItem, updateStockCountSession, deleteStockCountSession, fetchAllStockCountItems,
  updateStockCountFollowup, FOLLOWUP_STATUS, fetchCountPriorityData, clearStockCountItem,
  fetchOpenAnnualCount, createAnnualCount, updateAnnualCountLine, closeAnnualCount,
  fetchZeroLotsForAnnual, addLotToAnnualCount, addUnknownItemToAnnualCount, UNKNOWN_TAG, sortByShelf,
  fetchLotLocationBreakdown, fetchPendingReceiveLots, refreshAnnualCountSystemQty,
} from './lib/db'
import { dimStatus, diffLabel, computeCountMatch, DIM_COUNT } from './lib/countMatch'
import { rankCountPriority } from './lib/countPriority'
import { printCountCertificate } from './lib/stockCountCertificate'
import { exportToExcel } from './lib/exportExcel'
import DrugSearchBar from './DrugSearchBar'
import BackButton from './BackButton'
import Toast from './Toast'
import ConfirmModal from './ConfirmModal'

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
// จำนวนมิติที่เทียบกับระบบ: จำนวน / lot / exp / ที่เก็บ (เพิ่ม lot 2026-09-20)
// ต้องตรงกับ dimStatus() ใน countMatch.js — แก้ที่นั่นต้องแก้ค่านี้ด้วย
/** โซนของชั้นวาง — ตัวอักษรนำหน้าของรหัสชั้น (A-1-4 → A, E-11 → E)
 *  ที่เก็บชื่อไทย (คลังน้ำเกลือ/ตู้เย็นห้องยาชั้น4) เป็นโซนของตัวเอง ไม่มีชั้นย่อย
 *  ช่องที่เก็บหลายชั้นคั่น comma ("D-2-4 ,D-2-1") ใช้ชั้นแรกเป็นตัวจัดโซน
 *  — ของจริงวางอยู่ที่เดียวกันในโซนเดียวกัน (ตรวจข้อมูลจริง 2026-09-20: 18 ช่องแบบนี้) */
const zoneOf = (loc) => {
  const first = String(loc || '-').split(',')[0].trim()
  const m = first.match(/^([A-Za-z])-/)
  return m ? m[1].toUpperCase() : (first || '-')
}
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
// เลขกับหน่วยยาวไม่เท่ากันทุกแถว (50ขวด / vial / amp) — ถ้าปล่อยเป็น string เดียวใน text-center
// จุดกึ่งกลางจะเลื่อนตามความยาวหน่วย ทำให้ตัวเลขในคอลัมน์ไม่ตรงแนวกัน
// จึงแยก 2 ฝั่งรอบแกนกลาง: เลขชิดขวา · หน่วยชิดซ้าย → เลขเรียงตรงแนวลงมาทั้งคอลัมน์
// ใช้ในประโยค (ไม่ใช่คอลัมน์ตาราง) ที่ไม่ต้องจัดแนวเลข
const qtyUnit = (qty, unit) => `${toNum(qty)} × ${unit || '-'}`

const QtyUnit = ({ qty, unit }) => (
  <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
    <span className="text-right tabular-nums">{toNum(qty)}</span>
    <span className="text-left text-slate-500 dark:text-slate-400">× {unit || '-'}</span>
  </span>
)

// lot เดียวที่แบ่งวางคนละที่ — บอกว่าแต่ละที่มีเท่าไหร่ (เช่น ชั้น4 750 · E-1-1 550)
// บรรทัดนับยังเป็นบรรทัดเดียว กรอกยอดรวมครั้งเดียว (ADR-0008 ข้อ 3) นี่คือข้อมูลประกอบ
// ให้คนเดินนับรู้ว่าต้องไปกี่ที่ ไม่ใช่ช่องกรอกแยก
function LocBreakdown({ parts, unit, className = '' }) {
  if (!parts?.length) return null
  return (
    <div className={`mt-1 flex flex-wrap items-center justify-center gap-1 ${className}`}>
      <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">แบ่งเก็บ {parts.length} ที่:</span>
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-200">
          {p.location} <b className="ml-1 tabular-nums">{toNum(p.qty)}</b>
          <span className="ml-0.5 opacity-70">{unit || ''}</span>
        </span>
      ))}
    </div>
  )
}

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

// ป้ายสถานะรายมิติในจอไล่ทีละ lot — ไม่ได้ตรวจ / ตรง / ไม่ตรง
// "ไม่ได้ตรวจ" ต้องต่างจาก "ตรง" ให้ชัด (ADR-0008: ช่องว่าง ≠ ยืนยันว่าตรง)
function DimBadge({ st }) {
  if (st === 'unchecked') return <span className="text-[10px] text-slate-400 dark:text-slate-500">ยังไม่ตรวจ</span>
  if (st === 'ok') return <span className="text-[10px] font-semibold text-emerald-600">ตรงระบบ</span>
  return <span className="text-[10px] font-semibold text-amber-600">ไม่ตรง — ต้องแก้ไข</span>
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

// ยอดแยกรายชั้นที่ระบบเขียนลงหมายเหตุ — ติดป้ายไว้เพื่อ "แทนที่ชุดเดิม" ได้เวลากดแก้ซ้ำ
// (ถ้าไม่มีป้าย จะแยกไม่ออกว่าข้อความไหนระบบเขียน ข้อความไหนคนพิมพ์เอง แล้วทับของคนหาย)
const SPLIT_TAG = 'แยกชั้น: '
const stripSplitNote = (note) =>
  String(note || '').split(' · ').filter(p => !p.trim().startsWith(SPLIT_TAG)).join(' · ').trim()

// ป้าย "รอตรวจรับ" ต่อ lot — ของมาถึงชั้นแล้วแต่ยังไม่ผ่านตรวจรับ
// คนนับเจอของจริงบนชั้นแต่ยอดระบบอาจยังไม่รวม/รวมแล้วแต่ยังไม่ควรนับเป็นของคลังเต็มตัว
// บอกไว้ตรงนี้กันเดินไปตามหา "ของเกิน" ที่จริงๆ แล้วคือของที่ยังไม่ตรวจรับ
function PendingReceiveBadge({ info }) {
  if (!info) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-semibold">
      <Clock size={11} />
      รอตรวจรับ{info.waitDays != null ? ` ${info.waitDays} วัน` : ''}
      {info.billNumber ? ` · บิล ${info.billNumber}` : ''}
    </span>
  )
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
      <td class="c">${it.system_location || '-'}${(it.loc_breakdown || []).length
        ? `<br><span class="muted">${it.loc_breakdown.map(b => `${b.location} = ${toNum(b.qty)}`).join('<br>')}</span>`
        : ''}</td>
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
            {[{ key: 'count', label: 'ตรวจนับ', icon: ClipboardCheck }, { key: 'annual', label: 'ประจำปี', icon: CalendarCheck }, { key: 'history', label: 'ประวัติ', icon: History }].map(t => {
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
        {tab === 'annual' && <AnnualTab auth={auth} />}
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
  const [toast, setToast] = useState(null)         // { tone, message } — แจ้งผลแทน alert()
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

  const clearToast = useCallback(() => setToast(null), [])

  const handleSave = async () => {
    const toSave = lines.filter(l => l._selected)
    if (!toSave.length) return
    // จำนวนเป็นมิติบังคับ (ADR-0008 2026-07-16 ข้อ 2) — กันบรรทัดผี "ไม่ตรง" จากการลืมกรอก
    const missing = toSave.filter(l => l.counted_qty === '' || l.counted_qty == null)
    if (missing.length) {
      const names = missing.slice(0, 3).map(l => `${l.name} (lot ${l.lot})`).join(', ')
      setToast({ tone: 'error', message: `ยังไม่ได้กรอกจำนวนนับ ${missing.length} รายการ: ${names}${missing.length > 3 ? ' ...' : ''}\nกรอกจำนวนให้ครบ หรือเอาติ๊กออกจากรายการที่ไม่ได้นับ` })
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
      setToast({ tone: 'error', message: 'บันทึกไม่สำเร็จ: ' + (e?.message || e) })
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
      {toast && <Toast message={toast.message} tone={toast.tone} onClose={clearToast} />}
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
                        <LocBreakdown parts={l.loc_breakdown} unit={l.unit} />
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
                          title={complete ? 'ล้างค่าที่กรอก' : 'ตรงทั้งหมด (เติมค่าตามระบบครบทุกมิติ)'}
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
                  <LocBreakdown parts={l.loc_breakdown} unit={l.unit} className="justify-start" />
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
                        : m.checked === DIM_COUNT ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle size={14} /> ตรงระบบ</span>
                        : <span className="text-emerald-600 flex items-center gap-1"><CheckCircle size={14} /> ตรงตามที่ตรวจ {m.checked}/{DIM_COUNT}</span>}
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
// ============================================================
// AnnualTab — ตรวจนับประจำปี: ระบบ gen ทุก lot แล้วไล่นับทีละตัว
// ============================================================
// ต่างจาก CountTab โดยเจตนา (ไม่ใช่ตารางยาว 632 แถว):
//   เดินนับบนมือถือ ยืนหน้าชั้นถือของอยู่ — scroll หาแถวในตาราง 632 บรรทัดแล้วกรอกผิดตัวได้ง่าย
//   จอนี้โชว์ทีละ lot + ปุ่ม "ตรงตามระบบ" กดครั้งเดียวจบ (ของส่วนใหญ่ตรง) แล้วเด้งตัวถัดไปเอง
// autosave ต่อบรรทัดลง DB ทันที — งานนับกินหลายวัน localStorage เอาไม่อยู่
function AnnualTab({ auth }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [items, setItems] = useState([])
  const [idx, setIdx] = useState(0)
  const [locations, setLocations] = useState([])
  const [locBreakdown, setLocBreakdown] = useState({})   // `code|lot` → [{location, qty}] ของ lot ที่แบ่งเก็บหลายที่
  const [pendingRecv, setPendingRecv] = useState({})     // `code|lot` → { billNumber, waitDays } ของที่ยังรอตรวจรับ
  const [toast, setToast] = useState(null)
  const [starting, setStarting] = useState(false)
  const [closing, setClosing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)   // กำลังดึงยอดระบบปัจจุบันมาอัปเดตบรรทัดที่ยังไม่ได้นับ
  const [countFilter, setCountFilter] = useState('pending')  // 'pending' | 'counted' | 'all' — เปิดมาวันที่ 2 ต้องเห็นเฉพาะที่ยังไม่นับ
  const [zoneFilter, setZoneFilter] = useState('')       // โซนหลัก (A/B/C… หรือชื่อไทย) — เลือกก่อน
  const [locFilter, setLocFilter] = useState('')          // ชั้นย่อยในโซนนั้น — ไม่เลือก = ทั้งโซน
  const [drugQ, setDrugQ] = useState('')                 // ค้นชื่อยา/รหัส/lot ในรอบ — หายาที่รู้ชื่อโดยไม่ต้องไล่ชั้น
  const [drugTypes, setDrugTypes] = useState({})          // ชื่อยา → ชนิด (badge ใน dropdown ค้นหา)
  const [splitOpen, setSplitOpen] = useState(false)      // กางช่องกรอกแยกรายชั้น (lot ที่แบ่งเก็บ)
  const [splitVals, setSplitVals] = useState([])         // ยอดที่นับได้รายชั้น ตามลำดับ curSplit
  const [mode, setMode] = useState('walk')               // 'walk' = ทีละ lot | 'list' = ตารางทบทวน
  const [saveState, setSaveState] = useState({})         // { itemId: 'saving'|'saved'|'error' }
  const [draft, setDraft] = useState(null)               // ค่าที่กำลังกรอกของ lot ปัจจุบัน
  const [confirm, setConfirm] = useState(null)           // { kind:'start'|'close' } — popup ในธีมแอป ไม่ใช่ window.confirm
  const [zeroPicker, setZeroPicker] = useState(null)     // { loading, rows, q } — โมดอล "เจอของที่ระบบว่าหมด"
  const [restored, setRestored] = useState(false)        // กู้ตำแหน่ง/ตัวกรองจากรอบก่อนแล้วหรือยัง
  const [pendingDraft, setPendingDraft] = useState(null) // { itemId, draft } ที่พิมพ์ค้างไว้ก่อนออกจากหน้า

  // ── จำ "ที่ค้างไว้" ต่อรอบ จนกว่าจะปิดรอบ ─────────────────────────────────
  // ผลนับอยู่บน DB อยู่แล้ว แต่ตำแหน่งที่ยืนอยู่ (ชั้นไหน/ตัวที่เท่าไหร่/ค่าที่พิมพ์ค้าง)
  // เป็น state ใน component ซึ่งหายทุกครั้งที่กดย้อนกลับหรือพับมือถือแล้วเบราว์เซอร์ทิ้งหน้า
  // งานนับกินหลายวัน กลับเข้ามาแล้วต้องยืนที่เดิม ไม่ใช่เด้งกลับชั้นแรกของ 632 รายการ
  // key ต่อ session — ปิดรอบแล้วลบทิ้ง ไม่ให้ค้างไปรอบหน้า
  const uiKey = session ? `annualcount_ui_${session.id}` : null

  // กู้คืนครั้งเดียวตอน session พร้อม (ไม่ auto-restore ทับค่าที่ผู้ใช้เพิ่งเปลี่ยน)
  useEffect(() => {
    if (!session || restored) return
    try {
      const raw = localStorage.getItem(`annualcount_ui_${session.id}`)
      if (raw) {
        const u = JSON.parse(raw)
        if (u.zoneFilter != null) setZoneFilter(u.zoneFilter)
        if (u.locFilter != null) setLocFilter(u.locFilter)
        if (u.drugQ != null) setDrugQ(u.drugQ)
        // ค่าใหม่เป็น string 3 สถานะ — แต่รอบที่กำลังนับอยู่มีค่าเก่า (boolean) ค้างใน localStorage
        // แปลงให้ ไม่งั้นคนที่นับค้างไว้เปิดมาเจอตัวกรองรีเซ็ตเอง
        if (u.countFilter) setCountFilter(u.countFilter)
        else if (typeof u.onlyPending === 'boolean') setCountFilter(u.onlyPending ? 'pending' : 'all')
        if (u.mode) setMode(u.mode)
        if (Number.isFinite(u.idx)) setIdx(u.idx)
        if (u.draft && u.draftItemId) setPendingDraft({ itemId: u.draftItemId, draft: u.draft })
      }
    } catch { /* private mode / quota — ไม่ block งานนับ */ }
    setRestored(true)
  }, [session, restored])

  // เก็บทุกครั้งที่ขยับ — เขียนหลัง restore เท่านั้น กันเขียนทับด้วยค่า default ตอน mount
  useEffect(() => {
    if (!uiKey || !restored) return
    try {
      localStorage.setItem(uiKey, JSON.stringify({
        idx, zoneFilter, locFilter, countFilter, mode, drugQ,
        draftItemId: cur?.id ?? null,
        // เก็บเฉพาะที่พิมพ์ค้างไว้จริง (ยังไม่กดบันทึก) — ไม่งั้นเก็บค่าที่ save ไปแล้วซ้ำเปล่าๆ
        draft: draft && (draft.counted_qty || draft.counted_lot || draft.counted_exp || draft.counted_location || draft.item_note)
          ? draft : null,
      }))
    } catch { /* noop */ }
  })

  useEffect(() => {
    fetchInventoryLocations().then(setLocations).catch(() => {})
    fetchLotLocationBreakdown().then(setLocBreakdown).catch(() => {})
    fetchPendingReceiveLots().then(setPendingRecv).catch(() => {})
    fetchInventoryNameCodeMap().then(m => setDrugTypes(m.typeByName || {})).catch(() => {})
    fetchOpenAnnualCount()
      .then(open => {
        if (open) { setSession(open.session); setItems(open.items) }
      })
      .catch(e => setToast({ tone: 'error', message: e?.message || 'โหลดรอบประจำปีไม่สำเร็จ' }))
      .finally(() => setLoading(false))
  }, [])

  const counted = items.filter(i => i.counted_qty !== null).length
  const total = items.length
  const pct = total ? Math.round((counted / total) * 100) : 0
  const mismatches = items.filter(i => i.counted_qty !== null && !i.match).length
  const failed = Object.values(saveState).filter(s => s === 'error').length

  // ไม่ตรงเพราะมิติไหน — "ไม่ตรง N" เฉยๆ คนอ่านเข้าใจว่าของขาด ทั้งที่ส่วนใหญ่เป็นที่เก็บ/exp ไม่ตรง
  // (1 บรรทัดไม่ตรงได้หลายมิติ ผลรวมรายมิติจึงเกินจำนวนบรรทัดไม่ตรงได้)
  const dimDiff = { qty: 0, loc: 0, exp: 0, lot: 0 }
  for (const it of items) {
    if (it.counted_qty === null || it.match) continue
    const d = dimStatus(it)
    for (const k of Object.keys(dimDiff)) if (d[k] === 'diff') dimDiff[k]++
  }
  const matched = counted - mismatches
  const [showZones, setShowZones] = useState(false)   // ความคืบหน้ารายโซน — ซ่อนก่อน (14 ช่อง กินที่จอ)
  // นับมาแล้วกี่วัน (วันแรก = วันที่ 1) — parse เป็นวันท้องถิ่น ไม่ใช่ UTC
  const dayNo = (() => {
    const m = String(session?.counted_at || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return null
    const [y, mo, d] = todayLocalIso().split('-').map(Number)
    return Math.round((new Date(y, mo - 1, d) - new Date(+m[1], +m[2] - 1, +m[3])) / 86400000) + 1
  })()

  // โซนหลัก + จำนวนที่ยังไม่นับต่อโซน (ให้เห็นว่าโซนไหนยังเหลือ ไม่ต้องเข้าไปดูทีละชั้น)
  const zoneStat = {}
  for (const it of items) {
    const z = zoneOf(it.system_location)
    if (!zoneStat[z]) zoneStat[z] = { total: 0, pending: 0 }
    zoneStat[z].total++
    if (it.counted_qty === null) zoneStat[z].pending++
  }
  const zones = Object.keys(zoneStat).sort((a, b) => a.localeCompare(b, 'th', { numeric: true }))

  // ชั้นย่อยเฉพาะในโซนที่เลือก — 113 ชั้นรวดเดียวหาไม่เจอ (เหตุผลที่แยก 2 ชั้น)
  const locsInZone = zoneFilter
    ? [...new Set(items.filter(i => zoneOf(i.system_location) === zoneFilter)
        .map(i => i.system_location || '-'))]
        .sort((a, b) => a.localeCompare(b, 'th', { numeric: true }))
    : []

  // อยู่ในขอบเขตที่เลือก (โซน/ชั้น) — แยกจาก queue เพื่อนับ "เหลือเท่าไหร่" ให้ตรงกับที่เห็น
  // ค้นได้ทั้ง ชื่อยา / รหัส / lot — คนนับมักจำได้อย่างใดอย่างหนึ่ง ไม่ใช่ทั้งสามอย่าง
  const matchQ = (it) => {
    const q = drugQ.trim().toLowerCase()
    if (!q) return true
    return [it.name, it.code, it.lot].some(v => String(v || '').toLowerCase().includes(q))
  }

  const inScope = (it) =>
    (!zoneFilter || zoneOf(it.system_location) === zoneFilter) &&
    (!locFilter || (it.system_location || '-') === locFilter) &&
    matchQ(it)

  // ตัวเลือก autocomplete — จากบรรทัดในรอบนี้เท่านั้น (ค้นแล้วต้องเจอของที่นับได้จริง)
  // badge ชนิดยาดึงจาก typeByName ของ inventory (บรรทัดนับไม่ได้เก็บ type)
  const drugOpts = (() => {
    const seen = new Set(), out = []
    for (const it of items) {
      if (!it.name || seen.has(it.name)) continue
      seen.add(it.name)
      out.push({ name: it.name, type: drugTypes[it.name] || '' })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'th'))
  })()

  const pendingInScope = items.filter(it => inScope(it) && it.counted_qty === null).length
  const countedInScope = items.filter(it => inScope(it) && it.counted_qty !== null).length

  // คิวที่กำลังไล่นับ — กรองแล้วค่อยไล่ ไม่งั้นกด "ถัดไป" แล้วข้ามไปคนละชั้น
  const isCountedLine = (it) => it.counted_qty !== null && it.counted_qty !== ''
  const queue = items.filter(it =>
    (countFilter === 'all' || (countFilter === 'pending' ? !isCountedLine(it) : isCountedLine(it))) &&
    inScope(it))

  // clamp เพราะคิวหดได้ระหว่างนับ: โหมด "เฉพาะที่ยังไม่นับ" พอบันทึกแล้วแถวหลุดคิวทันที
  // ถ้าอยู่ตัวท้าย idx จะเกินขอบ → cur เป็น undefined จอว่างทั้งที่ยังมีของให้นับ
  const safeIdx = queue.length ? Math.min(idx, queue.length - 1) : 0
  const cur = queue[safeIdx] || null

  // lot ปัจจุบันแบ่งเก็บกี่ที่ (จาก inventory สด ไม่ใช่ snapshot — บอกว่า "ตอนนี้ของอยู่ไหนบ้าง")
  const curSplit = (cur && locBreakdown[`${cur.code}|${cur.lot}`]) || []
  const splitSum = splitVals.reduce((a, v) => a + (parseFloat(v) || 0), 0)

  // เอายอดรวมรายชั้นไปใส่ช่อง "นับได้จริง" + จดที่มาลงหมายเหตุ
  // (คลังเขียนหมายเหตุแบบนี้ด้วยมืออยู่แล้ว เช่น "ชั้น 4 750 + คลังยา 550" — ทำให้อัตโนมัติ)
  const applySplit = () => {
    const parts = curSplit
      .map((b, i) => ({ loc: b.location, v: String(splitVals[i] ?? '').trim() }))
      .filter(p => p.v !== '')
    if (!parts.length) return
    const note = SPLIT_TAG + parts.map(p => `${p.loc} ${toNum(p.v)}`).join(' + ')
    setDraft(d => ({
      ...d,
      counted_qty: String(splitSum),
      // เก็บข้อสังเกตที่คนพิมพ์เองไว้ แต่ **แทนที่ชุดแยกชั้นเดิม** ไม่ต่อท้าย
      // (กดแก้แล้วกดใหม่ต้องได้ชุดเดียว ไม่ใช่ 2 ชุดที่ยอดขัดกันเอง)
      item_note: [stripSplitNote(d?.item_note), note].filter(Boolean).join(' · '),
    }))
    setSplitOpen(false)
  }

  // เปลี่ยน lot → รีเซ็ต draft เป็นค่าที่เคยบันทึกไว้ (กลับมาแก้ของเดิมได้)
  useEffect(() => {
    // เปลี่ยน lot = ล้างช่องกรอกแยกชั้น ไม่งั้นยอดของ lot ก่อนหน้าค้างมาปนกับตัวใหม่
    setSplitOpen(false)
    setSplitVals([])
    if (!cur) { setDraft(null); return }
    // ถ้ามีค่าที่พิมพ์ค้างไว้ก่อนออกจากหน้า และเป็น lot เดียวกัน → คืนค่านั้นแทน
    if (pendingDraft && pendingDraft.itemId === cur.id) {
      setDraft(pendingDraft.draft)
      setPendingDraft(null)
      return
    }
    setDraft({
      counted_qty: cur.counted_qty == null ? '' : String(toNum(cur.counted_qty)),
      counted_exp: cur.counted_exp || '',
      counted_location: cur.counted_location || '',
      counted_lot: cur.counted_lot || '',
      item_note: cur.item_note || '',
    })
  }, [cur?.id])   // eslint-disable-line react-hooks/exhaustive-deps

  const startRound = async () => {
    setConfirm(null)
    setStarting(true)
    try {
      const { id } = await createAnnualCount({ counted_at: todayLocalIso() }, auth)
      const open = await fetchOpenAnnualCount()
      if (open) { setSession(open.session); setItems(open.items) }
      setToast({ tone: 'success', message: `เริ่มรอบแล้ว — ${open?.items?.length || 0} รายการ (รอบที่ ${id})` })
    } catch (e) {
      setToast({ tone: 'error', message: e?.message || 'เริ่มรอบไม่สำเร็จ' })
    } finally { setStarting(false) }
  }

  // ดึงยอดคงคลังปัจจุบันมาอัปเดตบรรทัดที่ยังไม่ได้นับ
  // จำเป็นเพราะรอบประจำปีกินเวลาหลายสัปดาห์ ระหว่างนั้นมีเบิกจ่าย + import Master ทุกวัน
  // บรรทัดที่นับแล้วไม่ถูกแตะ — snapshot คู่กับผลนับต้องคงเดิม (ADR-0008)
  const doRefreshQty = async () => {
    if (!session) return
    setRefreshing(true)
    try {
      const { updated, checked, added } = await refreshAnnualCountSystemQty(session.id, auth)
      if (updated > 0 || added > 0) {
        const open = await fetchOpenAnnualCount()
        if (open) { setSession(open.session); setItems(open.items) }
      }
      const parts = []
      if (updated > 0) parts.push(`อัปเดตยอด ${updated} รายการ`)
      if (added > 0) parts.push(`เพิ่ม lot ใหม่ที่เข้าคลังหลังเปิดรอบ ${added} รายการ`)
      setToast({
        tone: 'success',
        message: parts.length
          ? `${parts.join(' · ')} (ตรวจ ${checked} รายการที่ยังไม่ได้นับ)`
          : `ยอดระบบตรงกับปัจจุบันอยู่แล้ว — ตรวจ ${checked} รายการที่ยังไม่ได้นับ`,
      })
    } catch (e) {
      setToast({ tone: 'error', message: e?.message || 'รีเฟรชยอดไม่สำเร็จ' })
    } finally { setRefreshing(false) }
  }

  /** บันทึกบรรทัดปัจจุบัน แล้วไปตัวถัดไป
   *  fields = ค่าที่จะบันทึก (ส่ง override ได้ เช่น ปุ่ม "ตรงตามระบบ") */
  const saveLine = async (fields, { advance = true } = {}) => {
    if (!cur) return
    const itemId = cur.id
    const payload = { ...cur, ...fields }
    setSaveState(s => ({ ...s, [itemId]: 'saving' }))
    // optimistic — คนเดินนับต้องไปต่อได้ทันที ไม่ยืนรอ network
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, ...fields, ...computeCountMatch(payload) } : it))
    // โหมด "เฉพาะที่ยังไม่นับ": แถวที่เพิ่งบันทึกหลุดคิวเอง → index เดิมกลายเป็นตัวถัดไปอยู่แล้ว
    // โหมดปกติ: ต้องขยับเอง แต่ห้ามเกินขอบคิว (ตัวสุดท้ายให้ค้างอยู่ที่เดิม)
    if (advance && countFilter !== 'pending') setIdx(i => Math.min(i + 1, queue.length - 1))
    try {
      // counted_at กลับมาเฉพาะครั้งแรกที่ stamp (ครั้งต่อไปเป็น undefined = ไม่ทับของเดิมในจอ)
      const { counted_at } = await updateAnnualCountLine(itemId, payload)
      if (counted_at) setItems(prev => prev.map(it => it.id === itemId ? { ...it, counted_at } : it))
      setSaveState(s => ({ ...s, [itemId]: 'saved' }))
    } catch (e) {
      // ⚠️ ไม่ revert ค่าในจอ — คนนับของจริงมาแล้ว ต้องไม่ทำให้ตัวเลขหายไปต่อหน้า
      //    ขึ้นแดงค้างไว้แทน + แถบเตือนด้านบน ให้กด "ลองบันทึกอีกครั้ง" ได้
      setSaveState(s => ({ ...s, [itemId]: 'error' }))
      setToast({ tone: 'error', message: `บันทึกไม่สำเร็จ: ${e?.message || 'เครือข่ายมีปัญหา'}` })
    }
  }

  // สถานะรายมิติของค่าที่กำลังกรอก (ยังไม่บันทึก) — ใช้ระบายสี/ป้ายให้เห็นสดตอนพิมพ์
  // เทียบกับ snapshot ของระบบผ่าน dimStatus ตัวเดียวกับแท็บตรวจนับ (ADR-0008: ว่าง = ไม่ได้ตรวจ)
  const dim = dimStatus({ ...(cur || {}), ...(draft || {}) })

  // ปุ่ม "ตรง" รายช่อง — เติมค่าตามระบบ / กดซ้ำ = ล้างกลับเป็น "ไม่ได้ตรวจ"
  const toggleDraftField = (field) => {
    const sysVal = field === 'counted_location' ? (cur?.system_location || '')
      : field === 'counted_lot' ? (cur?.lot || '')
      : (cur?.system_exp || '')
    setDraft(d => ({ ...d, [field]: d?.[field] ? '' : (sysVal === '-' ? '' : sysVal) }))
  }

  // "ตรงตามระบบ" = เติมค่าระบบให้ครบ 4 มิติ — แต่ **ห้ามทิ้งหมายเหตุที่พิมพ์ค้างไว้**
  // (saveLine ทำ {...cur, ...fields} ซึ่ง cur.item_note เป็นค่าจาก DB ไม่ใช่ที่กำลังพิมพ์
  //  ไม่ส่ง item_note ไปด้วย = หมายเหตุ/ยอดแยกชั้นที่เพิ่งกรอกหายเงียบ)
  const markSame = () => saveLine({
    counted_qty: String(toNum(cur.system_qty)),
    counted_exp: cur.system_exp && cur.system_exp !== '-' ? cur.system_exp : '',
    counted_location: cur.system_location && cur.system_location !== '-' ? cur.system_location : '',
    counted_lot: cur.lot && cur.lot !== '-' ? cur.lot : '',
    item_note: draft?.item_note ?? cur.item_note ?? '',
  })

  const saveDraft = () => {
    if (draft?.counted_qty === '' || draft?.counted_qty == null) {
      setToast({ tone: 'error', message: 'ยังไม่ได้กรอกจำนวนที่นับได้' }); return
    }
    saveLine(draft)
  }

  const retryFailed = async () => {
    const ids = Object.entries(saveState).filter(([, v]) => v === 'error').map(([k]) => Number(k))
    for (const id of ids) {
      const it = items.find(x => x.id === id)
      if (!it) continue
      setSaveState(s => ({ ...s, [id]: 'saving' }))
      try {
        await updateAnnualCountLine(id, it)
        setSaveState(s => ({ ...s, [id]: 'saved' }))
      } catch { setSaveState(s => ({ ...s, [id]: 'error' })) }
    }
  }

  // เจอของจริงในชั้นที่ระบบบอกว่าหมด (phantom stock) — ดึง lot ที่ระบบว่า 0 มาให้เลือกเพิ่ม
  const openZeroPicker = async () => {
    setZeroPicker({ loading: true, rows: [], q: '' })
    try {
      const rows = await fetchZeroLotsForAnnual(session.id)
      setZeroPicker({ loading: false, rows, q: '' })
    } catch (e) {
      setZeroPicker(null)
      setToast({ tone: 'error', message: e?.message || 'ดึงรายการไม่สำเร็จ' })
    }
  }

  // ตัวเลือก autocomplete ของโมดอลเพิ่ม lot — จาก rows ที่เลือกได้จริงเท่านั้น
  // (ยาตัวเดียวมีได้หลาย lot → dedupe ตามชื่อ ไม่งั้น dropdown ขึ้นชื่อซ้ำกันรัวๆ)
  const zeroDrugOpts = (() => {
    if (!zeroPicker?.rows?.length) return []
    const seen = new Set(), out = []
    for (const r of zeroPicker.rows) {
      if (!r.name || seen.has(r.name)) continue
      seen.add(r.name)
      out.push({ name: r.name, type: drugTypes[r.name] || '' })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'th'))
  })()

  // ของที่ไม่มีในระบบเลย (ไม่มีทั้งรหัสและ lot) — คนกรอกเอง บันทึกเป็นแถวพิเศษ
  const [unknownForm, setUnknownForm] = useState(null)   // null = ยังไม่เปิดฟอร์ม
  const [savingUnknown, setSavingUnknown] = useState(false)

  const submitUnknown = async () => {
    if (!unknownForm?.name?.trim()) { setToast({ tone: 'error', message: 'ต้องระบุชื่อยา' }); return }
    if (unknownForm.counted_qty === '' || unknownForm.counted_qty == null) {
      setToast({ tone: 'error', message: 'ต้องระบุจำนวนที่นับได้' }); return
    }
    setSavingUnknown(true)
    try {
      const row = await addUnknownItemToAnnualCount(session.id, unknownForm, auth)
      setItems(prev => sortByShelf([...prev, row]))
      setToast({ tone: 'success', message: `บันทึก "${unknownForm.name}" เป็นของพบนอกระบบแล้ว` })
      setUnknownForm(null)
      setZeroPicker(null)
    } catch (e) {
      setToast({ tone: 'error', message: e?.message || 'บันทึกไม่สำเร็จ' })
    } finally { setSavingUnknown(false) }
  }

  const addZeroLot = async (lot) => {
    try {
      const row = await addLotToAnnualCount(session.id, lot, auth)
      setItems(prev => sortByShelf([...prev, row]))
      setZeroPicker(p => p ? { ...p, rows: p.rows.filter(r => !(r.code === lot.code && r.lot === lot.lot)) } : p)
      setToast({ tone: 'success', message: `เพิ่ม ${lot.name} lot ${lot.lot} เข้ารอบแล้ว` })
    } catch (e) {
      setToast({ tone: 'error', message: e?.message || 'เพิ่มไม่สำเร็จ' })
    }
  }

  const finishRound = async () => {
    setConfirm(null)
    setClosing(true)
    try {
      await closeAnnualCount(session.id, auth)
      setToast({ tone: 'success', message: `ปิดรอบแล้ว — นับ ${counted}/${total} รายการ` })
      // ล้างตำแหน่ง/ตัวกรองที่จำไว้ — ปิดรอบแล้วไม่ควรค้างไปรอบหน้า
      try { localStorage.removeItem(`annualcount_ui_${session.id}`) } catch { /* noop */ }
      setSession(null); setItems([]); setIdx(0); setRestored(false); setPendingDraft(null)
      setZoneFilter(''); setLocFilter(''); setCountFilter('pending'); setDrugQ(''); setMode('walk')
    } catch (e) {
      setToast({ tone: 'error', message: e?.message || 'ปิดรอบไม่สำเร็จ' })
    } finally { setClosing(false) }
  }

  if (loading) return <p className="text-center text-slate-400 py-10 text-sm">กำลังโหลด…</p>

  // ── ยังไม่มีรอบ — จอเริ่มต้น ──────────────────────────────
  if (!session) {
    return (
      <>
        {toast && <Toast tone={toast.tone} message={toast.message} onClose={() => setToast(null)} />}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 text-center">
          <div className="inline-flex p-3 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 rounded-2xl mb-3">
            <CalendarCheck size={24} />
          </div>
          <p className="font-bold text-slate-800 dark:text-slate-100">ตรวจนับประจำปี</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-5">
            ระบบจะดึง<strong>ทุก lot ที่มีของ</strong>มาให้ไล่นับทีละตัว บันทึกอัตโนมัติทุกครั้งที่กด
            <br />นับค้างไว้ข้ามวันได้ เปิดเครื่องไหนก็นับต่อจากเดิม
          </p>
          <button onClick={() => setConfirm({ kind: 'start' })} disabled={starting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-semibold text-sm shadow-md shadow-indigo-500/30 disabled:opacity-60">
            {starting ? <Loader2 size={16} className="animate-spin" /> : <CalendarCheck size={16} />}
            {starting ? 'กำลังเตรียมรายการ…' : 'เริ่มรอบตรวจนับประจำปี'}
          </button>
        </div>

        <ConfirmModal
          open={confirm?.kind === 'start'}
          title="เริ่มรอบตรวจนับประจำปี"
          message="ระบบจะดึงทุก lot ที่มีของในคลังมาเตรียมไว้ให้ไล่นับทีละตัว"
          detail="นับค้างไว้ข้ามวันได้ — เปิดเครื่องไหนก็นับต่อจากเดิม บันทึกอัตโนมัติทุกครั้งที่กด"
          warning="มีรอบประจำปีได้ทีละ 1 รอบเท่านั้น"
          confirmText="เริ่มรอบ"
          loading={starting}
          onConfirm={startRound}
          onClose={() => setConfirm(null)}
        />
      </>
    )
  }

  // ── มีรอบค้างอยู่ ────────────────────────────────────────
  return (
    <>
      {toast && <Toast tone={toast.tone} message={toast.message} onClose={() => setToast(null)} />}

      {/* ความคืบหน้า — ต้องเห็นตลอดว่าบันทึกไปถึงไหนแล้ว */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 mb-4 shadow-sm">
        {/* หัว: รอบ + วันที่ + % ใหญ่ */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
              <ClipboardCheck size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">ตรวจนับ รอบประจำปี</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                เริ่ม {fmtThaiDate(session.counted_at)}{dayNo > 0 && <> · วันที่ {dayNo}</>} · ผู้ตรวจนับ {session.counter_name}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-3xl font-bold tabular-nums text-indigo-600 dark:text-indigo-300 leading-none">{pct}<span className="text-lg">%</span></p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">นับแล้ว {counted.toLocaleString()} / {total.toLocaleString()} lot</p>
          </div>
        </div>

        {/* แถบความคืบหน้าแยกสี: ตรง / ไม่ตรง / ยังไม่นับ */}
        <div className="mt-3 h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${total ? (matched / total) * 100 : 0}%` }} title={`ตรง ${matched}`} />
          <div className="h-full bg-amber-400 transition-all" style={{ width: `${total ? (mismatches / total) * 100 : 0}%` }} title={`ไม่ตรง ${mismatches}`} />
        </div>

        {/* ตัวเลขหลัก 4 ช่อง */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'นับแล้ว',    value: counted,       icon: ClipboardCheck, cls: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300' },
            { label: 'ยังไม่นับ',  value: total - counted, icon: Clock,        cls: 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200' },
            { label: 'ตรงระบบ',   value: matched,       icon: CheckCircle,    cls: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' },
            { label: 'ไม่ตรง',     value: mismatches,    icon: AlertTriangle,  cls: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300' },
          ].map(({ label, value, icon: Icon, cls }) => (
            <div key={label} className={`rounded-xl px-3 py-2 ${cls}`}>
              <p className="flex items-center gap-1 text-[11px] font-semibold opacity-80"><Icon size={12} /> {label}</p>
              <p className="text-xl font-bold tabular-nums leading-tight">{value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        {/* ไม่ตรงเพราะอะไร — แยกให้เห็นว่าของขาด/เกินจริง หรือแค่ที่เก็บ/exp/lot ไม่ตรง */}
        {mismatches > 0 && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-slate-500 dark:text-slate-400">ไม่ตรงที่:</span>
            {[['qty', 'จำนวน'], ['loc', 'ที่เก็บ'], ['exp', 'EXP'], ['lot', 'Lot']].map(([k, label]) => (
              <span key={k} className={`rounded-full px-2 py-0.5 font-semibold tabular-nums ${
                dimDiff[k]
                  ? (k === 'qty' ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300' : 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300')
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                {label} {dimDiff[k]}
              </span>
            ))}
            <span className="text-[11px] text-slate-400 dark:text-slate-500">(1 lot ไม่ตรงได้หลายอย่าง)</span>
          </div>
        )}

        {/* ความคืบหน้ารายโซน — กดเพื่อกรองไปนับโซนนั้น */}
        {zones.length > 1 && (
          <button type="button" onClick={() => setShowZones(v => !v)}
            className="mt-3 pt-2.5 w-full border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors">
            <span>ความคืบหน้ารายโซน ({zones.length}){zoneFilter && <span className="ml-1.5 text-indigo-600 dark:text-indigo-300">· กรองโซน {zoneFilter} อยู่</span>}</span>
            <span className="inline-flex items-center gap-1">
              {showZones ? <>ซ่อนโซน <ChevronUp size={14} /></> : <>แสดงโซน <ChevronDown size={14} /></>}
            </span>
          </button>
        )}
        {zones.length > 1 && showZones && (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {/* โซนชั้นวางหลัก (A–E) ขึ้นก่อน แล้วค่อยที่เก็บที่ตั้งชื่อ (ตู้เย็น/คลังน้ำเกลือ) */}
            {[...zones].sort((a, b) => (/^[A-Z]$/.test(b) - /^[A-Z]$/.test(a)) || a.localeCompare(b, 'th', { numeric: true })).map(z => {
              const zs = zoneStat[z]
              const zDone = zs.total - zs.pending
              const zPct = zs.total ? Math.round((zDone / zs.total) * 100) : 0
              const active = zoneFilter === z
              return (
                <button key={z} type="button"
                  onClick={() => { setZoneFilter(active ? '' : z); setLocFilter(''); setIdx(0) }}
                  className={`text-left rounded-xl border px-2.5 py-1.5 transition-colors ${active
                    ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                    : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}>
                  <div className="flex items-baseline justify-between gap-1 text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-200 truncate" title={z}>{/^[A-Z]$/.test(z) ? `โซน ${z}` : z}</span>
                    <span className={`tabular-nums font-semibold ${zs.pending === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      {zs.pending === 0 ? 'ครบ' : `${zDone}/${zs.total}`}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className={`h-full ${zs.pending === 0 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${zPct}%` }} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
        {failed > 0 && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-300">
              <WifiOff size={14} /> บันทึกไม่สำเร็จ {failed} รายการ
            </span>
            <button onClick={retryFailed} className="text-xs font-semibold text-red-700 dark:text-red-300 underline">ลองบันทึกอีกครั้ง</button>
          </div>
        )}
      </div>

      {/* ตัวกรอง + สลับโหมด */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 mb-4 flex items-center gap-2 flex-wrap">
        {/* เลือก 2 ชั้น: โซนก่อน → ชั้นย่อยในโซนนั้น
            (dropdown เดียว 113 ชั้นเลื่อนหาไม่เจอ และไม่ตรงกับการเดินนับที่ไล่ทีละตู้) */}
        <select value={zoneFilter}
          onChange={e => { setZoneFilter(e.target.value); setLocFilter(''); setIdx(0) }}
          className="border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-semibold">
          <option value="">ทุกโซน ({zones.length})</option>
          {zones.map(z => (
            <option key={z} value={z}>
              {z} — เหลือ {zoneStat[z].pending}/{zoneStat[z].total}
            </option>
          ))}
        </select>

        {/* ชั้นย่อยโผล่เมื่อเลือกโซนแล้ว และโซนนั้นมีมากกว่า 1 ชั้น
            (คลังน้ำเกลือ/ตู้เย็น มีชั้นเดียว เลือกโซนแล้วนับได้เลย ไม่ต้องมี dropdown ว่างๆ ให้งง) */}
        {zoneFilter && locsInZone.length > 1 && (
          <select value={locFilter} onChange={e => { setLocFilter(e.target.value); setIdx(0) }}
            className="border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
            <option value="">ทั้งโซน {zoneFilter} ({locsInZone.length} ชั้น)</option>
            {locsInZone.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        {/* ค้นชื่อยา — ไล่ตามชั้นเป็นหลัก แต่บางทีต้องหายาตัวที่รู้ชื่อโดยไม่รู้ว่าอยู่ชั้นไหน
            (เช่น หัวหน้าถามถึงตัวนั้นตัวนี้ระหว่างนับ) options ดึงจากบรรทัดในรอบเอง ไม่ต้อง query เพิ่ม */}
        <DrugSearchBar
          value={drugQ}
          onChange={(v) => { setDrugQ(v); setIdx(0) }}
          onSelect={(v) => { setDrugQ(v); setIdx(0) }}
          options={drugOpts}
          placeholder="ค้นชื่อยา / รหัส / lot"
          className="w-56"
          ringClass="focus:ring-indigo-400"
          hoverClass="hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
        />

        {/* ตัวกรองสถานะนับ — dropdown 3 ตัวเลือก (เดิมเป็นปุ่ม toggle 2 สถานะ
            ซึ่งบอกไม่ได้ว่า "ดูเฉพาะที่นับแล้ว" ทำได้ ต้องกดสลับแล้วเดาเอง)
            ตัวเลขในวงเล็บ = จำนวนในขอบเขตโซน/ชั้น/คำค้นที่กรองอยู่ ไม่ใช่ทั้งรอบ */}
        <select value={countFilter}
          onChange={e => { setCountFilter(e.target.value); setIdx(0) }}
          title="กรองตามสถานะการนับ"
          className="border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-semibold">
          <option value="pending">ยังไม่นับ ({pendingInScope})</option>
          <option value="counted">นับแล้ว ({countedInScope})</option>
          <option value="all">ทั้งหมด ({pendingInScope + countedInScope})</option>
        </select>
        <div className="inline-flex gap-1 p-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ml-auto">
          {[{ k: 'walk', t: '1 lot' }, { k: 'list', t: 'ตาราง' }].map(m => (
            <button key={m.k} onClick={() => setMode(m.k)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                mode === m.k ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
              {m.t}
            </button>
          ))}
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
          <CheckCircle size={32} className="mx-auto text-emerald-500 mb-2" />
          <p className="font-semibold text-slate-700 dark:text-slate-200">
            {countFilter === 'pending' ? 'นับครบแล้วในตัวกรองนี้'
              : countFilter === 'counted' ? 'ยังไม่มีรายการที่นับแล้วในตัวกรองนี้'
              : 'ไม่มีรายการตรงตัวกรอง'}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            {counted < total ? `ยังเหลืออีก ${total - counted} รายการในชั้นอื่น` : 'นับครบทุกรายการแล้ว — ปิดรอบได้เลย'}
          </p>
        </div>
      ) : mode === 'walk' ? (
        /* ── โหมดไล่ทีละ lot ── */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              ชั้น {cur?.system_location || '-'}
              {cur && locBreakdown[`${cur.code}|${cur.lot}`] && (
                <span className="ml-2 font-normal text-amber-700 dark:text-amber-300">
                  (แบ่งเก็บ {locBreakdown[`${cur.code}|${cur.lot}`].map(b => `${b.location} ${toNum(b.qty)}`).join(' · ')})
                </span>
              )}
            </span>
            <span className="text-xs tabular-nums text-slate-400">
              {safeIdx + 1} / {queue.length} ในคิวนี้
            </span>
          </div>

          <div className="p-5 space-y-4">
            {/* หัวการ์ด — ชื่อยา + สถานะบันทึก */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-snug">{cur?.name}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">รหัส {cur?.code}</p>
                {cur && pendingRecv[`${String(cur.code).toLowerCase()}|${String(cur.lot || '-').toLowerCase()}`] && (
                  <div className="mt-1.5">
                    <PendingReceiveBadge info={pendingRecv[`${String(cur.code).toLowerCase()}|${String(cur.lot || '-').toLowerCase()}`]} />
                  </div>
                )}
              </div>
              <div className="shrink-0">
                {saveState[cur?.id] === 'saved' && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle size={12} /> บันทึกแล้ว</span>}
                {saveState[cur?.id] === 'saving' && <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Loader2 size={12} className="animate-spin" /> กำลังบันทึก</span>}
                {saveState[cur?.id] === 'error' && <span className="inline-flex items-center gap-1 text-xs text-red-600 font-semibold"><AlertTriangle size={12} /> ยังไม่ได้บันทึก</span>}
              </div>
            </div>

            {/* สิ่งที่ระบบบันทึกไว้ — 3 ช่องกว้างเท่ากัน ขนาดตัวอักษรใกล้เคียงกัน
                (เดิมจำนวนใหญ่กว่า lot/exp มากจนดูไม่สมดุล — ทั้ง 3 ค่าสำคัญเท่ากันตอนเทียบกับของจริง)
                lot/exp ใช้ break-all ไม่ใช่ truncate: รหัสที่ถูกตัดหายอ่านเทียบกับกล่องไม่ได้ */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4">
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3">ระบบบันทึกไว้</p>
              <div className="grid grid-cols-3 gap-3 items-start">
                <div className="min-w-0">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-0.5">จำนวน</p>
                  <p className="text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100 leading-tight">{toNum(cur?.system_qty)}</p>
                  <p className="text-sm text-slate-400 dark:text-slate-500 truncate">{cur?.unit}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-0.5">lot</p>
                  <p className="text-base font-mono font-bold text-slate-800 dark:text-slate-100 leading-tight break-all">{cur?.lot || '-'}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-0.5">exp</p>
                  <p className="text-base font-bold tabular-nums text-slate-800 dark:text-slate-100 leading-tight break-all">{cur?.system_exp || '-'}</p>
                </div>
              </div>
            </div>

            {/* lot ที่แบ่งเก็บหลายที่ — กรอกแยกรายชั้นแล้วระบบรวมให้ ไม่ต้องบวกในหัว
                ผลรวมลง counted_qty ช่องเดียวเหมือนเดิม (1 บรรทัด = 1 code+lot ตาม ADR-0008 ข้อ 3)
                ยอดที่แยกไว้เก็บลง item_note เป็นข้อความ — คลังเขียนแบบนี้อยู่แล้วด้วยมือ */}
            {curSplit.length > 1 && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    lot นี้แบ่งเก็บ {curSplit.length} ที่ — กรอกแยกได้ ระบบรวมให้
                  </p>
                  <button type="button" onClick={() => setSplitOpen(v => !v)}
                    className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 underline underline-offset-2">
                    {splitOpen ? 'ซ่อน' : 'กรอกแยกที่เก็บ'}
                  </button>
                </div>
                {splitOpen && (
                  <div className="space-y-2">
                    {curSplit.map((b, i) => (
                      <div key={b.location} className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 text-xs text-slate-600 dark:text-slate-300 truncate" title={b.location}>
                          {b.location}
                          <span className="text-slate-400 dark:text-slate-500"> (ระบบ {toNum(b.qty)})</span>
                        </span>
                        <input type="number" inputMode="decimal" value={splitVals[i] ?? ''}
                          onChange={e => setSplitVals(v => { const n = [...v]; n[i] = e.target.value; return n })}
                          placeholder="นับได้"
                          className="w-24 shrink-0 px-2 py-1.5 border border-amber-300 dark:border-amber-800/60 rounded-lg text-center text-sm font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400" />
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1.5 border-t border-amber-200 dark:border-amber-900/50">
                      <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                        รวม {splitSum} {cur?.unit}
                      </span>
                      <button type="button" onClick={applySplit} disabled={!splitVals.some(v => String(v).trim() !== '')}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold disabled:opacity-40">
                        ใช้ยอดรวมนี้
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* นับได้จริง — ช่องหลัก เด่นกว่ามิติอื่นเพราะต้องกรอกทุกตัว */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">นับได้จริง</label>
                <DimBadge st={dim.qty} />
              </div>
              <div className="flex items-center gap-2">
                <input type="number" inputMode="decimal" value={draft?.counted_qty ?? ''}
                  onChange={e => setDraft(d => ({ ...d, counted_qty: e.target.value }))}
                  placeholder="จำนวน"
                  className={`flex-1 min-w-0 px-3 py-3 border rounded-xl text-center text-xl font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                    dim.qty === 'diff'
                      ? 'border-red-400 bg-red-50 dark:bg-red-950/40 focus:ring-red-400'
                      : 'border-slate-300 dark:border-slate-600 focus:ring-indigo-400'}`} />
                <span className="w-20 shrink-0 text-sm text-slate-400 truncate">× {cur?.unit}</span>
              </div>
              {dim.qty === 'diff' && (
                <p className="mt-1.5 text-sm font-bold text-red-600 text-center">
                  {diffLabel(cur?.system_qty, draft?.counted_qty)}
                </p>
              )}
            </div>

            {/* มิติที่เหลือ — กางเองเมื่อมีจุดไม่ตรง ไม่งั้นคนไม่เห็นว่าที่กรอกไว้ไม่ตรง */}
            <details className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
              open={dim.lot === 'diff' || dim.exp === 'diff' || dim.loc === 'diff'}>
              <summary className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none flex items-center justify-between gap-2">
                <span>ตรวจ lot / exp / ที่เก็บ ด้วย</span>
                {(dim.lot === 'diff' || dim.exp === 'diff' || dim.loc === 'diff')
                  ? <span className="font-semibold text-amber-600 shrink-0">มีจุดไม่ตรง</span>
                  : <span className="text-slate-400 shrink-0">ตรวจแล้ว {dim.checked}/4</span>}
              </summary>

              <div className="p-3 space-y-3">
                {/* lot บนกล่องจริง */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      lot บนกล่อง <span className="text-slate-400 dark:text-slate-500">(ระบบ: {cur?.lot || '-'})</span>
                    </label>
                    <DimBadge st={dim.lot} />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="text" value={draft?.counted_lot || ''} placeholder="lot ที่อ่านได้จากกล่อง"
                      onChange={e => setDraft(d => ({ ...d, counted_lot: e.target.value }))}
                      className={`flex-1 min-w-0 px-3 py-2 border rounded-xl text-sm font-mono bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                        dim.lot === 'diff' ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40' : 'border-slate-300 dark:border-slate-600'}`} />
                    <div className="w-20 shrink-0 flex justify-center">
                      <FieldTick active={dim.lot === 'ok'} onClick={() => toggleDraftField('counted_lot')} />
                    </div>
                  </div>
                </div>

                {/* exp บนกล่องจริง */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      exp บนกล่อง <span className="text-slate-400 dark:text-slate-500">(ระบบ: {cur?.system_exp || '-'})</span>
                    </label>
                    <DimBadge st={dim.exp} />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="text" value={draft?.counted_exp || ''} placeholder="เช่น 3/12/2028"
                      onChange={e => setDraft(d => ({ ...d, counted_exp: e.target.value }))}
                      className={`flex-1 min-w-0 px-3 py-2 border rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                        dim.exp === 'diff' ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40' : 'border-slate-300 dark:border-slate-600'}`} />
                    <div className="w-20 shrink-0 flex justify-center">
                      <FieldTick active={dim.exp === 'ok'} onClick={() => toggleDraftField('counted_exp')} />
                    </div>
                  </div>
                </div>

                {/* ที่เก็บจริง */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      ที่เก็บจริง <span className="text-slate-400 dark:text-slate-500">(ระบบ: {cur?.system_location || '-'})</span>
                    </label>
                    <DimBadge st={dim.loc} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <LocationInput value={draft?.counted_location || ''} locations={locations}
                        onChange={v => setDraft(d => ({ ...d, counted_location: v }))}
                        className={`w-full px-3 py-2 border rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                          dim.loc === 'diff' ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40' : 'border-slate-300 dark:border-slate-600'}`} />
                    </div>
                    <div className="w-20 shrink-0 flex justify-center">
                      <FieldTick active={dim.loc === 'ok'} onClick={() => toggleDraftField('counted_location')} />
                    </div>
                  </div>
                </div>

                <input type="text" value={draft?.item_note || ''} placeholder="หมายเหตุ เช่น พบชำรุด / กล่องฉีก"
                  onChange={e => setDraft(d => ({ ...d, item_note: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </details>

            {/* สรุปก่อนบันทึก — บอกว่ามิติไหนไม่ตรงบ้าง ไม่ให้กดผ่านไปโดยไม่รู้ตัว */}
            {dim.anyDiff && (
              <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 px-3 py-2">
                <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  ไม่ตรงระบบ: {[
                    dim.qty === 'diff' && `จำนวน (${diffLabel(cur?.system_qty, draft?.counted_qty)})`,
                    dim.lot === 'diff' && 'lot',
                    dim.exp === 'diff' && 'exp',
                    dim.loc === 'diff' && 'ที่เก็บ',
                  ].filter(Boolean).join(' · ')}
                  <br />บันทึกได้ตามที่นับจริง — ส่วนต่างจะขึ้นในประวัติให้ไปตามแก้ที่ต้นทาง
                </p>
              </div>
            )}

            {/* ปุ่มหลัก — ของส่วนใหญ่ตรง กดปุ่มเดียวจบแล้วไปตัวถัดไป */}
            <button onClick={markSame}
              className="w-full mb-2 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold shadow-md shadow-emerald-500/30">
              <CheckCircle size={18} /> ตรงตามระบบ ({toNum(cur?.system_qty)})
            </button>
            <button onClick={saveDraft}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-sm">
              <Save size={15} /> บันทึกค่าที่กรอก
            </button>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
            <button onClick={() => setIdx(Math.max(0, safeIdx - 1))} disabled={safeIdx === 0}
              className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40">
              <ChevronLeft size={16} /> ก่อนหน้า
            </button>
            <button onClick={() => setIdx(Math.min(queue.length - 1, safeIdx + 1))} disabled={safeIdx >= queue.length - 1}
              className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40">
              ข้ามไปตัวถัดไป <ChevronRight size={16} />
            </button>
          </div>
        </div>
      ) : (
        /* ── โหมดตาราง (ทบทวน) ── */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">รายการ</th>
                  <th className="text-center px-2 py-2 font-semibold">ชั้น</th>
                  <th className="text-center px-2 py-2 font-semibold">ระบบ</th>
                  <th className="text-center px-2 py-2 font-semibold">นับได้</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((it, i) => (
                  <tr key={it.id}
                    onClick={() => { setMode('walk'); setIdx(i) }}
                    className="border-t border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <td className="px-3 py-2">
                      <p className="text-slate-800 dark:text-slate-100 truncate max-w-[200px]">{it.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">lot {it.lot}</p>
                      {pendingRecv[`${String(it.code).toLowerCase()}|${String(it.lot || '-').toLowerCase()}`] && (
                        <PendingReceiveBadge info={pendingRecv[`${String(it.code).toLowerCase()}|${String(it.lot || '-').toLowerCase()}`]} />
                      )}
                    </td>
                    <td className="text-center px-2 py-2 text-xs text-slate-500">
                      {it.system_location}
                      <LocBreakdown parts={locBreakdown[`${it.code}|${it.lot}`]} unit={it.unit} />
                    </td>
                    <td className="text-center px-2 py-2 tabular-nums text-slate-600 dark:text-slate-300">{toNum(it.system_qty)}</td>
                    <td className="text-center px-2 py-2">
                      {it.counted_qty == null
                        ? <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                        : <span className={`tabular-nums font-semibold ${it.match ? 'text-emerald-600' : 'text-red-600'}`}>{toNum(it.counted_qty)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ปิดรอบ */}
      <div className="mt-4 flex justify-end gap-2 flex-wrap">
        <button onClick={openZeroPicker}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-sm font-semibold mr-auto">
          <Package size={15} /> เพิ่ม lot ที่ระบบว่าหมด
        </button>
        <button onClick={doRefreshQty} disabled={refreshing}
          title="ดึงยอดคงคลังปัจจุบันมาอัปเดตบรรทัดที่ยังไม่ได้นับ + เพิ่ม lot ใหม่ที่เข้าคลังหลังเปิดรอบ (ไม่แตะบรรทัดที่นับแล้ว)"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-sky-300 dark:border-sky-800/60 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-sm font-semibold disabled:opacity-60">
          {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />} รีเฟรชยอดระบบ
        </button>
        <button onClick={() => printCountSheet(items, { counterName: session.counter_name, dateLabel: fmtThaiDate(session.counted_at) })}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-semibold">
          <Printer size={15} /> พิมพ์ใบสำรอง
        </button>
        <button onClick={() => setConfirm({ kind: 'close' })} disabled={closing}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-sm font-semibold disabled:opacity-60">
          {closing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />} ปิดรอบ
        </button>
      </div>

      <ConfirmModal
        open={confirm?.kind === 'close'}
        title="ปิดรอบตรวจนับประจำปี"
        message={`นับไปแล้ว ${counted} จาก ${total} รายการ${mismatches ? ` · พบไม่ตรง ${mismatches} รายการ` : ''}`}
        detail="ปิดรอบแล้วจะแก้ไขผลนับได้ที่แท็บประวัติ เหมือนรอบตรวจนับอื่น"
        warning={total - counted > 0
          ? `ยังไม่ได้นับอีก ${total - counted} รายการ — จะถูกบันทึกว่า "ไม่ได้ตรวจ"`
          : undefined}
        tone={total - counted > 0 ? 'danger' : 'primary'}
        confirmText="ปิดรอบ"
        loading={closing}
        onConfirm={finishRound}
        onClose={() => setConfirm(null)}
      />

      {/* เจอของที่ระบบว่าหมด — เลือก lot เพิ่มเข้ารอบ (phantom stock) */}
      {zeroPicker && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => setZeroPicker(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-amber-100 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-100 dark:bg-amber-950/60 rounded-xl flex items-center justify-center shrink-0">
                <Package size={18} className="text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-amber-800 dark:text-amber-300 text-sm">เพิ่ม lot ที่ระบบว่าหมด</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">เลือก lot ที่เจอของจริงบนชั้น เพื่อเพิ่มเข้ารอบนับ</p>
              </div>
              <button onClick={() => setZeroPicker(null)} className="text-slate-400 hover:text-slate-600 p-1 shrink-0"><X size={16} /></button>
            </div>

            {/* autocomplete จาก lot ที่เลือกได้ในโมดอลนี้เท่านั้น — เลือกจาก dropdown แล้วต้องเจอของจริง
                (dropdown แนะนำตามชื่อยา ส่วนที่พิมพ์เองยังค้นได้ทั้ง ชื่อ/รหัส/lot เหมือนเดิม) */}
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
              <DrugSearchBar
                value={zeroPicker.q}
                onChange={(v) => setZeroPicker(p => ({ ...p, q: v }))}
                onSelect={(v) => setZeroPicker(p => ({ ...p, q: v }))}
                options={zeroDrugOpts}
                placeholder="พิมพ์ชื่อยา / รหัส / lot เพื่อค้นหา"
                ringClass="focus:ring-amber-400"
                hoverClass="hover:bg-amber-50 dark:hover:bg-amber-950/40"
              />
            </div>

            <div className="overflow-y-auto flex-1 px-3 py-2">
              {zeroPicker.loading ? (
                <p className="text-center text-sm text-slate-400 py-8">กำลังโหลด…</p>
              ) : (() => {
                const q = zeroPicker.q.trim().toLowerCase()
                const rows = q
                  ? zeroPicker.rows.filter(r =>
                      `${r.name} ${r.code} ${r.lot}`.toLowerCase().includes(q))
                  : zeroPicker.rows
                if (!rows.length) {
                  return <p className="text-center text-sm text-slate-400 py-8">
                    {zeroPicker.q ? 'ไม่พบรายการที่ค้นหา' : 'ไม่มี lot ที่ระบบว่าหมดเหลือให้เพิ่ม'}
                  </p>
                }
                return rows.slice(0, 100).map(r => (
                  <button key={`${r.code}|${r.lot}`} onClick={() => addZeroLot(r)}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/30 border-b border-slate-50 dark:border-slate-800 last:border-0">
                    <p className="text-sm text-slate-800 dark:text-slate-100 truncate">{r.name}</p>
                    <p className="text-xs text-slate-400">
                      {r.code} · lot <span className="font-mono">{r.lot}</span> · {r.system_location} · exp {r.system_exp}
                    </p>
                  </button>
                ))
              })()}
            </div>

            {/* ของที่ไม่มีในระบบเลย — ไม่มีทั้งรหัสและ lot ให้เลือก ต้องกรอกเอง */}
            <div className="border-t border-slate-200 dark:border-slate-700 px-5 py-3 shrink-0">
              {!unknownForm ? (
                <button onClick={() => setUnknownForm({ name: '', code: '', lot: '', unit: '', counted_qty: '', counted_location: '', counted_exp: '', item_note: '' })}
                  className="text-sm font-semibold text-amber-700 dark:text-amber-300 underline">
                  ไม่เจอในรายการ? — ของนี้ไม่มีในระบบเลย กรอกเอง
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    บันทึกเป็น <span className="font-semibold">{UNKNOWN_TAG}</span> — ระบบไม่รู้จักของชิ้นนี้
                    ส่วนต่างจะเท่ากับจำนวนที่นับได้ทั้งหมด และต้องไปเปิดรหัส/บันทึกรับเข้าที่ต้นทางเอง
                  </p>
                  <input type="text" autoFocus value={unknownForm.name} placeholder="ชื่อยา / ชื่อของ (บังคับ)"
                    onChange={e => setUnknownForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={unknownForm.code} placeholder="รหัส (ถ้ามี)"
                      onChange={e => setUnknownForm(f => ({ ...f, code: e.target.value }))}
                      className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
                    <input type="text" value={unknownForm.lot} placeholder="lot (ถ้ามี)"
                      onChange={e => setUnknownForm(f => ({ ...f, lot: e.target.value }))}
                      className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" inputMode="decimal" value={unknownForm.counted_qty} placeholder="นับได้ (บังคับ)"
                      onChange={e => setUnknownForm(f => ({ ...f, counted_qty: e.target.value }))}
                      className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
                    <input type="text" value={unknownForm.unit} placeholder="หน่วย เช่น กล่อง"
                      onChange={e => setUnknownForm(f => ({ ...f, unit: e.target.value }))}
                      className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <LocationInput value={unknownForm.counted_location} locations={locations}
                      onChange={v => setUnknownForm(f => ({ ...f, counted_location: v }))}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
                    <input type="text" value={unknownForm.counted_exp} placeholder="exp ที่เห็นบนกล่อง"
                      onChange={e => setUnknownForm(f => ({ ...f, counted_exp: e.target.value }))}
                      className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setUnknownForm(null)} disabled={savingUnknown}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium disabled:opacity-50">
                      ยกเลิก
                    </button>
                    <button onClick={submitUnknown} disabled={savingUnknown}
                      className="flex-1 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-60">
                      {savingUnknown ? 'กำลังบันทึก…' : 'บันทึกของที่พบ'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

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
  const [toast, setToast] = useState(null)          // { tone, message } — แจ้งผลแทน alert()
  const [dateFrom, setDateFrom] = useState('')      // filter ช่วงวันที่ตรวจนับ (ISO)
  const [dateTo, setDateTo] = useState('')
  const [drugQ, setDrugQ] = useState('')            // ค้นชื่อยา/รหัส/lot
  const [drugOpts, setDrugOpts] = useState([])
  const [sessEdit, setSessEdit] = useState(null)    // { id, counted_at, note } — แก้ header รอบ
  const [statusFilter, setStatusFilter] = useState('all')  // all|mismatch|pending|partial|ok
  const [viewAll, setViewAll] = useState({})        // { session_id: true } = กางดูบรรทัดที่ยังไม่ได้นับด้วย
  const [confirmClear, setConfirmClear] = useState(null)   // item ที่กำลังจะล้างผลนับ

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
  //   partial   = บรรทัดที่ตรวจไม่ครบทุกมิติ (เว้น lot/ที่เก็บ/exp ไว้)
  const sessionStat = (sid) => {
    const its = allItems[sid] || items[sid] || []
    let mismatch = 0, pending = 0, partial = 0, notCounted = 0
    for (const it of its) {
      // ⚠️ แถวที่ยังไม่ได้นับ (counted_qty = null) ไม่ใช่ "ไม่ตรง" และไม่ใช่ "ตรวจไม่ครบ"
      //    รอบประจำปี gen แถวรอไว้ล่วงหน้า ถ้านับรวมจะได้ mismatch/partial เท่าจำนวนแถวทั้งรอบ
      if (it.counted_qty === null || it.counted_qty === '') { notCounted++; continue }
      const d = dimStatus(it)
      if (!liveMatch(it)) {
        mismatch++
        if ((it.followup_status || 'pending') === 'pending') pending++
      }
      if (d.checked < DIM_COUNT) partial++
    }
    return { total: its.length, mismatch, pending, partial, notCounted, loaded: its.length > 0 }
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
      // เฉพาะบรรทัดที่ "นับแล้ว" — บรรทัดที่ระบบ gen รอไว้แต่ยังไม่ได้นับ ไม่ใช่ "ครั้งที่เคยนับ"
      // (ไม่งั้นค้นยาที่ไม่เคยนับเลย จะขึ้น "ประวัติการนับ N ครั้ง" พร้อมไอคอนไม่ตรง — ADR-0026)
      for (const it of its) {
        if (it.counted_qty === null || it.counted_qty === '') continue
        if (itemMatchesQ(it, drugQ)) timeline.push({ it, s })
      }
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

  // Export Excel ของรอบเดียว — ส่ง rows ชุดเดียวกับที่ตารางแสดงอยู่ (Critical Rule #6)
  // คอลัมน์ล้อตารางบนจอ + เพิ่ม "มิติที่ตรวจ"/หมายเหตุ ที่จอย่อไว้
  const exportSession = (s, rows, showingAll) => {
    const cols = [
      { header: 'รหัส', value: r => r.code || '' },
      { header: 'รายการยา', value: r => r.name || '' },
      { header: 'Lot (ระบบ)', value: r => r.lot || '' },
      { header: 'Lot (นับได้)', value: r => r.counted_lot || '' },
      { header: 'ที่เก็บ (ระบบ)', value: r => r.system_location || '' },
      { header: 'ที่เก็บ (นับได้)', value: r => r.counted_location || '' },
      { header: 'Exp (ระบบ)', value: r => r.system_exp || '' },
      { header: 'Exp (นับได้)', value: r => r.counted_exp || '' },
      { header: 'หน่วย', value: r => r.unit || '' },
      { header: 'ยอดระบบ', value: r => toNum(r.system_qty) },
      // ยังไม่ได้นับ = เว้นว่าง ไม่ใช่ 0 (0 คือ "นับได้ศูนย์" คนละความหมาย)
      { header: 'นับได้จริง', value: r => (r.counted_qty === null || r.counted_qty === '' ? '' : toNum(r.counted_qty)) },
      { header: 'ส่วนต่าง', value: r => diffLabel(r.system_qty, r.counted_qty) },
      { header: 'มิติที่ตรวจ', value: r => `${dimStatus(r).checked}/${DIM_COUNT}` },
      { header: 'ผล', value: r => (r.counted_qty === null || r.counted_qty === '' ? 'ยังไม่ได้นับ' : (computeCountMatch(r).match ? 'ตรง' : 'ไม่ตรง')) },
      // เวลานับรายบรรทัด — คนเอาไป pivot ดูความคืบหน้ารายวันของรอบประจำปี (632 บรรทัดดูบนจอไม่ไหว)
      { header: 'นับเมื่อ', value: r => (r.counted_at ? fmtThaiDateTime(r.counted_at) : '') },
      { header: 'สถานะติดตาม', value: r => (FOLLOWUP_STATUS[r.followup_status] || '') },
      { header: 'หมายเหตุรายการ', value: r => r.item_note || '' },
    ]
    const scope = showingAll ? 'ทั้งรอบ' : 'เฉพาะที่ตรวจแล้ว'
    exportToExcel(rows, cols, `ตรวจนับ SC-${s.id}`,
      `stockcount_SC-${s.id}_${s.counted_at}_${showingAll ? 'all' : 'counted'}.xlsx`, auth)
    setToast({ tone: 'success', message: `ส่งออก Excel ${rows.length} รายการ (${scope})` })
  }

  // จาก timeline (ผลค้นหา) → กระโดดไปแก้ที่รอบจริง
  // timeline เป็น read-only โดยตั้งใจ (แถวเดียวกันโผล่ได้หลายรอบ แก้ตรงนั้นสับสนว่าแก้รอบไหน)
  // จึงเปิดรอบนั้นให้ + เลื่อนไปที่แถว + เข้าโหมดแก้เลย — แก้/ลบทำที่เดียวคือในรอบ
  const jumpToItem = async (it, sess) => {
    setOpenId(sess.id)
    if (!items[sess.id]) {
      const data = allItems[sess.id] || await fetchStockCountItems(sess.id)
      setItems(prev => ({ ...prev, [sess.id]: data }))
    }
    // บรรทัดที่ยังไม่ได้นับถูกซ่อน default — ถ้าเป้าหมายเป็นแถวแบบนั้นต้องกางก่อน ไม่งั้นเลื่อนไปไม่เจอ
    if (it.counted_qty === null || it.counted_qty === '') setViewAll(v => ({ ...v, [sess.id]: true }))
    startEdit(it)
    setTimeout(() => {
      document.getElementById(`sc-item-${it.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)
  }

  const startEdit = (it) => {
    setEditId(it.id)
    setEditVal({
      counted_qty: it.counted_qty == null ? '' : String(toNum(it.counted_qty)),
      counted_location: it.counted_location || '',
      counted_exp: it.counted_exp || '',
      counted_lot: it.counted_lot || '',
      item_note: it.item_note || '',
      _expCustom: !!it.counted_exp && String(it.counted_exp) !== String(it.system_exp || ''),
    })
  }

  // ค่าที่ถือว่า "ตรงระบบ" ของแต่ละช่อง (อ้าง snapshot ระบบจาก it) — '-' = ไม่มีข้อมูล → เติม ''
  const sysValEdit = (it, field) =>
    field === 'counted_qty' ? String(toNum(it.system_qty))
      : field === 'counted_exp' ? (it.system_exp && it.system_exp !== '-' ? it.system_exp : '')
      // lot ที่ระบบบันทึก อยู่ในคอลัมน์ `lot` (snapshot ของแถว) ไม่ใช่ system_* เหมือนมิติอื่น
      : field === 'counted_lot' ? (it.lot && it.lot !== '-' ? it.lot : '')
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
    dimStatus({ ...editVal, system_qty: it.system_qty, system_exp: it.system_exp, system_location: it.system_location, lot: it.lot })

  const clearToast = useCallback(() => setToast(null), [])

  const saveEdit = async (it) => {
    setBusy(true)
    try {
      await updateStockCountItem(it.id, {
        ...editVal,
        system_qty: it.system_qty, system_exp: it.system_exp, system_location: it.system_location,
        lot: it.lot,
      }, auth)
      const data = await fetchStockCountItems(it.session_id)   // reload รอบนั้น
      setItems(prev => ({ ...prev, [it.session_id]: data }))
      setAllItems(prev => ({ ...prev, [it.session_id]: data })) // sync badge/timeline ให้ตรงกับที่แก้
      setEditId(null)
    } catch (e) { setToast({ tone: 'error', message: 'แก้ไขไม่สำเร็จ: ' + (e?.message || e) }) }
    finally { setBusy(false) }
  }

  // ล้างผลนับบรรทัดเดียว — กลับเป็น "ยังไม่ได้นับ" แถวยังอยู่ในรอบ (กรอกผิดแล้วไปนับใหม่)
  const doClearItem = async (it) => {
    setBusy(true)
    try {
      await clearStockCountItem(it.id, auth)
      const data = await fetchStockCountItems(it.session_id)
      setItems(prev => ({ ...prev, [it.session_id]: data }))
      setAllItems(prev => ({ ...prev, [it.session_id]: data }))  // sync badge/timeline
      setEditId(null)
      setConfirmClear(null)
      setToast({ tone: 'success', message: 'ล้างผลนับแล้ว — บรรทัดนี้กลับเป็น "ยังไม่ได้นับ"' })
    } catch (e) { setToast({ tone: 'error', message: 'ล้างผลนับไม่สำเร็จ: ' + (e?.message || e) }) }
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
      setToast({ tone: 'error', message: 'บันทึกสถานะไม่สำเร็จ: ' + (e?.message || e) })
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
    } catch (e) { setToast({ tone: 'error', message: 'แก้ไขไม่สำเร็จ: ' + (e?.message || e) }) }
    finally { setBusy(false) }
  }

  const deleteSession = async (s) => {
    if (!window.confirm(`ลบรอบตรวจนับวันที่ ${fmtThaiDate(s.counted_at)} ทั้งหมด?`)) return
    setBusy(true)
    try {
      await deleteStockCountSession(s.id, auth)
      setSessions(prev => prev.filter(x => x.id !== s.id))
      if (openId === s.id) setOpenId(null)
    } catch (e) { setToast({ tone: 'error', message: 'ลบไม่สำเร็จ: ' + (e?.message || e) }) }
    finally { setBusy(false) }
  }

  if (loading) return <p className="text-slate-400 dark:text-slate-500 text-sm">กำลังโหลด...</p>
  if (!sessions.length) return <p className="text-slate-400 dark:text-slate-500 text-sm text-center py-10">ยังไม่มีประวัติตรวจนับ</p>

  const hasFilter = dateFrom || dateTo || drugQ.trim()

  return (
    <div className="space-y-3">
      {toast && <Toast message={toast.message} tone={toast.tone} onClose={clearToast} />}
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
              { k: 'partial',  label: `ตรวจไม่ครบทุกมิติ (${summary.partial})` },
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
                  <th className="px-2"></th>
                </tr>
              </thead>
              <tbody>
                {timeline.slice(0, 30).map(({ it, s }) => {
                  const d = dimStatus(it)
                  const ok = liveMatch(it)
                  return (
                    <tr key={it.id} className={`border-b border-slate-50 ${!ok ? 'bg-amber-50 dark:bg-amber-950/40' : ''}`}>
                      {/* เวลานับของ "บรรทัด" ไม่ใช่ของรอบ — รอบประจำปี 632 บรรทัดนับคนละวัน
                          ถ้าใช้ s.created_at ทุกแถวจะโชว์เวลาเปิดรอบเหมือนกันหมด (บั๊กเดิม แก้ 2026-09-24)
                          ⚠️ บรรทัดเก่าไม่มี counted_at → เว้นว่าง **ห้าม fallback ไปวันของรอบ**
                             นั่นคือวันเปิดรอบ ไม่ใช่วันที่นับ — เติมให้ = สร้างข้อมูลปลอมที่ดูเหมือนจริง
                             ซึ่งคือบั๊กตัวเดิมที่กำลังแก้อยู่นี่เอง */}
                      <td className="py-1.5 pr-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {it.counted_at
                          ? fmtThaiDateTime(it.counted_at)
                          : <span className="text-slate-300 dark:text-slate-600" title="นับก่อนระบบเริ่มบันทึกเวลารายบรรทัด — ไม่มีข้อมูลเวลาจริง">—</span>}
                      </td>
                      <td className="px-2">{it.name}<span className="text-slate-400 dark:text-slate-500"> · {it.lot}</span></td>
                      <td className="text-center px-2"><QtyUnit qty={it.system_qty} unit={it.unit} /></td>
                      <td className="text-center px-2">{it.counted_qty == null ? '-' : <QtyUnit qty={it.counted_qty} unit={it.unit} />}</td>
                      <td className="text-center px-2"><DiffCell it={it} /></td>
                      <td className="text-center px-2">
                        {!ok ? <AlertTriangle size={14} className="text-amber-500 inline" />
                          : d.checked === DIM_COUNT ? <CheckCircle size={14} className="text-emerald-500 inline" />
                          : <span className="text-[10px] font-semibold text-emerald-600">ตรง {d.checked}/{DIM_COUNT}</span>}
                      </td>
                      <td className="px-2 text-right">
                        <button onClick={() => jumpToItem(it, s)} title="ไปแก้ไขรายการนี้ในรอบ"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors">
                          <Pencil size={12} /> แก้ไข
                        </button>
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
        // ⚠️ นับ "ไม่ตรง" เฉพาะแถวที่ *นับแล้ว* — แถว counted_qty = null คือ "ยังไม่ได้นับ"
        //    ไม่ใช่ "ไม่ตรง" (liveMatch คืน false ทั้งคู่ แยกไม่ได้ถ้าไม่กรองก่อน)
        //    รอบประจำปี gen 632 แถวรอไว้ตั้งแต่ต้น ถ้าไม่กรองจะขึ้น "ไม่ตรง 632" ทั้งที่ยังไม่ได้แตะ
        const isCounted = (i) => i.counted_qty !== null && i.counted_qty !== ''
        const mismatch = its.filter(i => isCounted(i) && !liveMatch(i)).length
        // ตารางที่กางออกแสดง "เฉพาะบรรทัดที่นับแล้ว" — บรรทัดที่ยังไม่ได้นับคืองานที่เหลือ ไม่ใช่ผลการตรวจ
        // (รอบประจำปี gen บรรทัดรอไว้ทั้งคลัง; spot check เก่าก่อนกฎ validate ก็มีค้าง — ADR-0026)
        const rowsCounted = its.filter(isCounted)
        const rowsNotCounted = its.filter(i => !isCounted(i))
        // ตาราง+Excel แสดงชุดเดียวกันเสมอ (Critical Rule #6) — สลับได้ว่าจะดูเฉพาะที่นับแล้วหรือทั้งรอบ
        // ใบรับรองไม่ตามตัวสลับนี้ ล็อกที่ "นับแล้ว" เสมอ (ADR-0026)
        const showAll = viewAll[s.id] === true
        const rowsShown = showAll ? its : rowsCounted
        // นับ "ไม่ตรง" จาก allItems (โหลดครบทุกรอบตั้งแต่แรก) เพื่อโชว์ badge บนหัวรอบโดยไม่ต้องกาง
        const allIts = allItems[s.id]
        const countedIts = allIts ? allIts.filter(isCounted) : null
        const headMismatch = countedIts ? countedIts.filter(i => !liveMatch(i)).length : null
        const headNotCounted = allIts ? allIts.filter(i => !isCounted(i)).length : 0
        // ในบรรทัดที่ไม่ตรง ยังเหลือกี่รายการที่ไม่มีใครกดสถานะติดตาม (ADR-0017)
        const headPending = countedIts ? countedIts.filter(i => !liveMatch(i) && (i.followup_status || 'pending') === 'pending').length : 0
        // "ตรงทั้งหมด" อ้างได้เฉพาะเมื่อทุกรายการตรวจครบทุกมิติ — ไม่งั้นเป็น "ตรงตามที่ตรวจ" (ADR-0008 2026-07-16 ข้อ 3)
        // DIM_COUNT = 4 (จำนวน/lot/exp/ที่เก็บ) — เดิม hardcode 3 ก่อนเพิ่มมิติ lot
        const fullyChecked = countedIts ? countedIts.every(i => dimStatus(i).checked === DIM_COUNT) : true
        const isAnnual = s.kind === 'annual'
        return (
          <div key={s.id} className={`bg-white dark:bg-slate-900 rounded-xl border overflow-hidden ${headMismatch ? 'border-amber-300 dark:border-amber-800/60' : 'border-slate-200 dark:border-slate-700'}`}>
            <div className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800">
              <button onClick={() => toggle(s.id)} className="flex items-center gap-3 flex-1 text-left">
                <div className={`p-2 rounded-lg ${headMismatch ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600'}`}><ClipboardCheck size={18} /></div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{s.created_at ? fmtThaiDateTime(s.created_at) : fmtThaiDate(s.counted_at)}</p>
                    {/* ชนิดรอบ — รอบประจำปี (632 รายการ) ปนกับ spot check (1-18 รายการ) แยกไม่ออกถ้าไม่ติดป้าย */}
                    {isAnnual
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 text-[11px] font-semibold"><CalendarCheck size={11} /> ประจำปี</span>
                      : <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 text-[11px] font-semibold">เฉพาะจุด</span>}
                    {/* รอบที่ยังนับไม่จบ — บอกความคืบหน้าแทนผลเทียบ (ยังสรุปไม่ได้) */}
                    {s.status === 'draft' && (
                      <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-semibold">
                        กำลังนับ {allIts ? allIts.length - headNotCounted : 0}/{allIts ? allIts.length : 0}
                      </span>
                    )}
                    {headMismatch != null && (headMismatch > 0
                      ? <>
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-semibold"><AlertTriangle size={11} /> ไม่ตรง {headMismatch} รายการ</span>
                          {/* ตามครบแล้วหรือยัง — แยก "ไม่ตรงแต่จัดการแล้ว" ออกจาก "ไม่ตรงและยังไม่มีใครแตะ" */}
                          {headPending === 0
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 px-2 py-0.5 text-[11px] font-semibold"><CheckCircle size={11} /> จัดการครบแล้ว</span>
                            : <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-[11px] font-semibold">ยังไม่จัดการ {headPending}</span>}
                        </>
                      : (countedIts && countedIts.length === 0)
                        ? <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 text-[11px] font-semibold">ยังไม่ได้นับ</span>
                      : fullyChecked
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-semibold">ตรงทั้งหมด</span>
                        : <span title="บางรายการตรวจไม่ครบ 4 มิติ (จำนวน/lot/exp/ที่เก็บ)" className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 px-2 py-0.5 text-[11px] font-semibold">ตรงตามที่ตรวจ</span>
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
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        ตรวจ {rowsCounted.length} รายการ · <span className={mismatch ? 'text-amber-600 font-semibold' : 'text-emerald-600'}>ไม่ตรง {mismatch} รายการ</span>
                        {/* บรรทัดที่ยังไม่ได้นับไม่ใช่ผลการตรวจ — บอกเป็นความคืบหน้าแยก ไม่ปนกับผลเทียบ (ADR-0026) */}
                        {rowsNotCounted.length > 0 && (
                          <span className="text-slate-400 dark:text-slate-500"> · ยังไม่ได้นับอีก {rowsNotCounted.length} รายการ</span>
                        )}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {rowsNotCounted.length > 0 && (
                          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-[11px] font-semibold">
                            <button onClick={() => setViewAll(v => ({ ...v, [s.id]: false }))}
                              className={`px-2 py-1 ${!showAll ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400'}`}>
                              ที่ตรวจแล้ว {rowsCounted.length}
                            </button>
                            <button onClick={() => setViewAll(v => ({ ...v, [s.id]: true }))}
                              className={`px-2 py-1 border-l border-slate-200 dark:border-slate-700 ${showAll ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400'}`}>
                              ทั้งหมด {its.length}
                            </button>
                          </div>
                        )}
                        <button onClick={() => exportSession(s, rowsShown, showAll)} disabled={!rowsShown.length}
                          title="Export Excel ตามที่แสดงอยู่"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-300 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold disabled:opacity-40">
                          <FileDown size={13} /> Excel
                        </button>
                        <button onClick={() => printCountCertificate(s, its, { printedBy: auth?.name || auth?.username || '' })}
                          disabled={!rowsCounted.length}
                          title="พิมพ์ใบรับรองผลตรวจนับ (เฉพาะรายการที่นับแล้ว)"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-[11px] font-semibold disabled:opacity-40">
                          <Printer size={13} /> ใบรับรอง
                        </button>
                      </div>
                    </div>
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
                          {rowsShown.map(it => {
                            const editing = editId === it.id
                            const d = dimStatus(it)
                            const ok = liveMatch(it)
                            return (
                              <tr key={it.id} id={`sc-item-${it.id}`} className={`border-b border-slate-50 dark:border-slate-800 ${editing ? 'bg-emerald-50 dark:bg-emerald-950/40' : !ok ? 'bg-amber-50 dark:bg-amber-950/40' : ''}`}>
                                <td className="py-1.5 pr-2 align-top">
                                  {it.name}<span className="text-slate-400 dark:text-slate-500"> · {it.lot}</span>
                                  {editing ? (
                                    <input type="text" value={editVal.item_note} placeholder="+ หมายเหตุรายการนี้"
                                      onChange={e => setEditVal(v => ({ ...v, item_note: e.target.value }))}
                                      className="w-full mt-1 px-1.5 py-1 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded text-[11px]" />
                                  ) : it.item_note ? (
                                    <p className="text-[11px] text-amber-600 mt-0.5">หมายเหตุ: {it.item_note}</p>
                                  ) : null}
                                  {/* เวลานับของบรรทัดนี้ — รอบประจำปีกินเวลาหลายวัน หัวรอบบอกแค่วันเปิดรอบ
                                      ไม่มีค่า = นับก่อนมีคอลัมน์นี้ หรือยังไม่ได้นับ → ไม่แสดง (ห้าม fallback ไปวันเปิดรอบ) */}
                                  {it.counted_at && (
                                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                                      นับเมื่อ {fmtThaiDateTime(it.counted_at)}
                                    </p>
                                  )}
                                </td>
                                <td className="text-center px-2 align-top"><QtyUnit qty={it.system_qty} unit={it.unit} /></td>
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
                                    {/* 3 มิติในช่องเดียว: วางเป็นแถวนอน แต่ละช่องจับคู่ปุ่ม "ตรง" ของตัวเอง
                                        (เดิมซ้อนลงล่าง 6 ชั้นในคอลัมน์แคบ แถวสูงจนช่องอื่นหลุดระนาบ) */}
                                    <td className="px-2 align-top">
                                      <div className="flex flex-wrap items-start justify-center gap-x-3 gap-y-1.5">
                                        <label className="flex flex-col items-center gap-1">
                                          <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">ที่เก็บ</span>
                                          <LocationInput value={editVal.counted_location} locations={locations}
                                            onChange={v => setEditVal(x => ({ ...x, counted_location: v }))}
                                            placeholder="— ที่เก็บ —"
                                            className={`w-28 px-1 py-1 border rounded text-center text-[11px] ${em.loc === 'diff' ? 'border-red-400 bg-red-50 dark:bg-red-950/40 text-slate-800 dark:text-red-100' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`} />
                                          <FieldTick active={em.loc === 'ok'} onClick={() => tickEdit(it, 'counted_location')} />
                                        </label>
                                        <label className="flex flex-col items-center gap-1">
                                          <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">exp</span>
                                          <select value={editVal._expCustom ? '__custom__' : editVal.counted_exp}
                                            onChange={e => pickExpEdit(e.target.value)}
                                            className={`w-28 px-1 py-1 border rounded text-center text-[11px] ${em.exp === 'diff' ? 'border-red-400 bg-red-50 dark:bg-red-950/40 text-slate-800 dark:text-red-100' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`}>
                                            <option value="">— exp จริง —</option>
                                            {(it.system_exp && it.system_exp !== '-') && <option value={it.system_exp}>{it.system_exp} (ตามระบบ)</option>}
                                            <option value="__custom__">อื่นๆ (พิมพ์เอง)</option>
                                          </select>
                                          {editVal._expCustom && (
                                            <input type="text" autoFocus value={editVal.counted_exp} placeholder="เช่น 3/12/2028"
                                              onChange={e => setEditVal(v => ({ ...v, counted_exp: e.target.value }))}
                                              className="w-28 px-1.5 py-1 border border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-slate-800 dark:text-amber-100 rounded text-center text-[11px]" />
                                          )}
                                          <FieldTick active={em.exp === 'ok'} onClick={() => tickEdit(it, 'counted_exp')} />
                                        </label>
                                        {/* lot = มิติที่ 4 เดิมไม่มีช่องนี้ในฟอร์มแก้ไข ทำให้ค่าที่นับไว้หาย */}
                                        <label className="flex flex-col items-center gap-1">
                                          <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">lot</span>
                                          <input type="text" value={editVal.counted_lot || ''}
                                            onChange={e => setEditVal(v => ({ ...v, counted_lot: e.target.value }))}
                                            placeholder="— lot จริง —"
                                            className={`w-28 px-1.5 py-1 border rounded text-center text-[11px] ${em.lot === 'diff' ? 'border-red-400 bg-red-50 dark:bg-red-950/40 text-slate-800 dark:text-red-100' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`} />
                                          <FieldTick active={em.lot === 'ok'} onClick={() => tickEdit(it, 'counted_lot')} />
                                        </label>
                                      </div>
                                    </td>
                                    <td className="text-center px-2 align-top">
                                      <div className="flex items-center justify-center gap-1">
                                        <button onClick={() => saveEdit(it)} disabled={busy}
                                          className="p-1.5 rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"><Save size={13} /></button>
                                        <button onClick={() => setEditId(null)}
                                          className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200"><X size={13} /></button>
                                        {/* ล้างผลนับ = กลับเป็น "ยังไม่ได้นับ" แถวยังอยู่ ไม่ใช่ลบหลักฐาน (ADR-0008) */}
                                        {it.counted_qty != null && (
                                          <button onClick={() => setConfirmClear(it)} disabled={busy}
                                            title="ล้างผลนับของบรรทัดนี้ (กลับเป็นยังไม่ได้นับ)"
                                            className="p-1.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-600 hover:bg-amber-100 disabled:opacity-50"><Eraser size={13} /></button>
                                        )}
                                      </div>
                                    </td>
                                    <td></td>
                                  </>
                                  )
                                })() : (
                                  <>
                                    <td className="text-center px-2 align-top">{it.counted_qty == null ? '-' : <QtyUnit qty={it.counted_qty} unit={it.unit} />}</td>
                                    <td className="text-center px-2 align-top"><DiffCell it={it} /></td>
                                    <td className="text-center px-2 align-top">
                                      <DimLine label="ที่เก็บ" st={d.loc} val={it.counted_location} />
                                      <DimLine label="exp" st={d.exp} val={it.counted_exp} />
                                    </td>
                                    <td className="text-center px-2 align-top">
                                      {!ok ? <AlertTriangle size={14} className="text-amber-500 inline" />
                                        : d.checked === DIM_COUNT ? <CheckCircle size={14} className="text-emerald-500 inline" />
                                        : <span className="text-[10px] font-semibold text-emerald-600" title="มิติที่ตรวจตรงหมด แต่ตรวจไม่ครบทุกมิติ">ตรง {d.checked}/{DIM_COUNT}</span>}
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
                                    <td className="text-center px-2 align-top">
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
                    {/* รอบที่เปิดไว้แต่ยังไม่ได้นับสักบรรทัด — ตารางว่างเปล่าอธิบายตัวเองไม่ได้ ต้องบอกว่าทำไม */}
                    {rowsShown.length === 0 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center">
                        ยังไม่ได้นับสักรายการในรอบนี้ — เมื่อบันทึกผลนับแล้วจะแสดงที่นี่
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )
          })}
        </div>
      ))}

      <ConfirmModal
        open={!!confirmClear}
        title="ล้างผลนับของรายการนี้"
        message={confirmClear ? `${confirmClear.name} · lot ${confirmClear.lot}` : ''}
        detail={'ค่าที่นับไว้ (จำนวน/lot/exp/ที่เก็บ) จะถูกล้าง แล้วบรรทัดนี้กลับเป็น "ยังไม่ได้นับ" — ยอดระบบและตัวบรรทัดยังอยู่ในรอบ นับใหม่ได้'}
        confirmText="ล้างผลนับ"
        tone="danger"
        loading={busy}
        onConfirm={() => confirmClear && doClearItem(confirmClear)}
        onClose={() => setConfirmClear(null)}
      />
    </div>
  )
}
