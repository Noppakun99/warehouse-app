import React, { useState, useEffect } from 'react'
import {
  RotateCcw, Search, CheckCircle,
  AlertCircle, FileText, ChevronDown, ChevronRight, FileDown, Printer,
  Pencil, Trash2, X, MapPin, Pill, UserCheck,
  Package, Hash, Layers, ArrowRight, Clock, PackageCheck,
} from 'lucide-react'
import { fetchReturnLogs, insertReturnLog, deleteReturnLog, updateReturnLog, confirmReturnReceived, fetchAllInventoryRows } from './lib/db'
import { exportToExcel } from './lib/exportExcel'
import { supabase } from './lib/supabase'
import SearchableSelect from './SearchableSelect'
import DrugSearchBar, { DrugTypeBadge } from './DrugSearchBar'
import BackButton from './BackButton'
import { useSort, SortableTh } from './SortableTable'

// ============================================================
// Constants
// ============================================================

// ── ข้อมูลเก่า (legacy) — ใช้แสดง label เมื่อ return_source = null ──
const LEGACY_TYPES = [
  { key: 'ward_return',     label: 'คืนยาจาก Ward',    short: 'คืน Ward',   badgeBg: 'bg-blue-100 dark:bg-blue-950/60',   badgeText: 'text-blue-800 dark:text-blue-300',   border: 'border-blue-200 dark:border-blue-900/60' },
  { key: 'damaged',         label: 'ยาเสียหาย/แตกหัก', short: 'ยาเสียหาย', badgeBg: 'bg-orange-100 dark:bg-orange-950/60', badgeText: 'text-orange-800 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-900/60' },
  { key: 'expired_removal', label: 'ตัดยาหมดอายุออก',  short: 'ยาหมดอายุ', badgeBg: 'bg-red-100 dark:bg-red-950/60',    badgeText: 'text-red-800 dark:text-red-300',    border: 'border-red-200 dark:border-red-900/60' },
  { key: 'vendor_return',   label: 'ส่งคืนบริษัทยา',   short: 'คืนบริษัท', badgeBg: 'bg-purple-100 dark:bg-purple-950/60', badgeText: 'text-purple-800 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-900/60' },
]
const LEGACY_MAP = Object.fromEntries(LEGACY_TYPES.map(t => [t.key, t]))

// ── ระบบใหม่ 2 ระดับ ──
const RETURN_SOURCES = [
  { key: 'ward',   label: 'หน่วยงาน / Ward',   short: 'Ward',   badgeBg: 'bg-blue-100 dark:bg-blue-950/60',   badgeText: 'text-blue-800 dark:text-blue-300',   border: 'border-blue-200 dark:border-blue-900/60',   needsDept: true },
  { key: 'or',     label: 'ห้องผ่าตัด',         short: 'ห้องผ่าตัด', badgeBg: 'bg-purple-100 dark:bg-purple-950/60', badgeText: 'text-purple-800 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-900/60', needsDept: false },
  { key: 'er',     label: 'ห้องฉุกเฉิน',        short: 'ER',     badgeBg: 'bg-red-100 dark:bg-red-950/60',    badgeText: 'text-red-800 dark:text-red-300',    border: 'border-red-200 dark:border-red-900/60',    needsDept: false },
  { key: 'opd',    label: 'OPD คลินิก',          short: 'OPD',    badgeBg: 'bg-sky-100 dark:bg-sky-950/60',    badgeText: 'text-sky-800 dark:text-sky-300',    border: 'border-sky-200 dark:border-sky-900/60',    needsDept: false },
  { key: 'vendor', label: 'บริษัทยา / Supplier', short: 'บริษัทยา', badgeBg: 'bg-orange-100 dark:bg-orange-950/60', badgeText: 'text-orange-800 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-900/60', needsDept: false },
]
const SOURCE_MAP = Object.fromEntries(RETURN_SOURCES.map(s => [s.key, s]))

const RETURN_REASONS = [
  { key: 'leftover',      label: 'ยาเหลือจากการใช้',       short: 'เหลือใช้',   sources: ['ward', 'or', 'er', 'opd'], badgeBg: 'bg-teal-100 dark:bg-teal-950/60',   badgeText: 'text-teal-800 dark:text-teal-300'   },
  { key: 'over_req',      label: 'เบิกเกินจำนวน',           short: 'เบิกเกิน',   sources: ['ward', 'opd'],             badgeBg: 'bg-cyan-100 dark:bg-cyan-950/60',   badgeText: 'text-cyan-800 dark:text-cyan-300'   },
  { key: 'wrong_drug',    label: 'ยาผิดชนิด / ขนาด',       short: 'ผิดชนิด',   sources: ['ward', 'or', 'er', 'opd', 'vendor'], badgeBg: 'bg-amber-100 dark:bg-amber-950/60',  badgeText: 'text-amber-800 dark:text-amber-300'  },
  { key: 'damaged',       label: 'ยาเสียหาย / แตกหัก',     short: 'ยาเสียหาย', sources: ['ward', 'or', 'er', 'opd', 'vendor'], badgeBg: 'bg-orange-100 dark:bg-orange-950/60', badgeText: 'text-orange-800 dark:text-orange-300' },
  { key: 'expired',       label: 'ยาหมดอายุ',               short: 'ยาหมดอายุ', sources: ['ward', 'or', 'er', 'opd', 'vendor'], badgeBg: 'bg-red-100 dark:bg-red-950/60',    badgeText: 'text-red-800 dark:text-red-300'    },
  { key: 'recall',        label: 'Lot เรียกคืน (Recall)',   short: 'Recall',     sources: ['vendor'],                  badgeBg: 'bg-rose-100 dark:bg-rose-950/60',   badgeText: 'text-rose-800 dark:text-rose-300'   },
  { key: 'vendor_return', label: 'ส่งคืนตามสัญญา',         short: 'คืนบริษัท', sources: ['vendor'],                  badgeBg: 'bg-purple-100 dark:bg-purple-950/60', badgeText: 'text-purple-800 dark:text-purple-300' },
  { key: 'other',         label: 'อื่นๆ (ระบุในหมายเหตุ)',  short: 'อื่นๆ',      sources: ['ward', 'or', 'er', 'opd', 'vendor'], badgeBg: 'bg-slate-100 dark:bg-slate-800', badgeText: 'text-slate-700 dark:text-slate-200' },
]
const REASON_MAP = Object.fromEntries(RETURN_REASONS.map(r => [r.key, r]))

// ── helper: badge ของ "สาเหตุการคืน" (reason) — ตารางประวัติเลิกโชว์ source กลุ่มแล้ว ──
function getReasonBadge(log) {
  const rsn = REASON_MAP[log.return_type] || (log.return_source ? null : LEGACY_MAP[log.return_type])
  return rsn || { label: log.return_type || '-', badgeBg: 'bg-slate-100 dark:bg-slate-800', badgeText: 'text-slate-600 dark:text-slate-300' }
}
function getReturnLabel(log) {
  if (!log.return_source) {
    const t = LEGACY_MAP[log.return_type]
    return t ? t.label : (log.return_type || '-')
  }
  const src = SOURCE_MAP[log.return_source]
  const rsn = REASON_MAP[log.return_type]
  const parts = [src?.label, rsn?.label].filter(Boolean)
  return parts.join(' · ') || '-'
}
function getReturnShort(log) {
  if (!log.return_source) {
    const t = LEGACY_MAP[log.return_type]
    return t ? t.short : (log.return_type || '-')
  }
  const src = SOURCE_MAP[log.return_source]
  return src?.short || log.return_source || '-'
}

// ── สถานะคืนยา (ADR-0009): null = แถวเก่า = ถือเป็น received ──
function returnStatus(log) {
  return log.status === 'pending' ? 'pending' : 'received'
}
const STATUS_META = {
  pending:  { label: 'รอรับคืน', icon: Clock,        badgeBg: 'bg-amber-100 dark:bg-amber-950/60',   badgeText: 'text-amber-800 dark:text-amber-300'   },
  received: { label: 'รับแล้ว',  icon: PackageCheck, badgeBg: 'bg-emerald-100 dark:bg-emerald-950/60', badgeText: 'text-emerald-700 dark:text-emerald-300' },
}

// ผลการดำเนินการหลัง staff ตรวจรับ (ADR-0012) — บันทึกผลอย่างเดียว ไม่แตะ inventory.qty
const DISPOSITION_META = {
  restock:   { label: 'รับเข้าคลัง',  icon: PackageCheck, badgeBg: 'bg-emerald-100 dark:bg-emerald-950/60', badgeText: 'text-emerald-700 dark:text-emerald-300', desc: 'ยาสภาพดี — บันทึกว่ารับกลับเข้าคลัง' },
  dispose:   { label: 'ทำลาย/ตัดจำหน่าย', icon: Trash2,   badgeBg: 'bg-red-100 dark:bg-red-950/60',     badgeText: 'text-red-700 dark:text-red-300',     desc: 'หมดอายุ/เสียหาย — ตัดจำหน่าย' },
  to_vendor: { label: 'ส่งคืนบริษัท',  icon: ArrowRight,   badgeBg: 'bg-sky-100 dark:bg-sky-950/60',     badgeText: 'text-sky-700 dark:text-sky-300',     desc: 'ส่งคืนบริษัท (recall/เปลี่ยน)' },
  rejected:  { label: 'ปฏิเสธการคืน',  icon: X,            badgeBg: 'bg-slate-200 dark:bg-slate-700',   badgeText: 'text-slate-600 dark:text-slate-300',   desc: 'ไม่รับคืน — ระบุเหตุผล' },
}
const DISPOSITION_ORDER = ['restock', 'dispose', 'to_vendor', 'rejected']

// ── ยังคง RETURN_TYPES ไว้ให้ backward compat (EditReturnModal legacy) ──
const RETURN_TYPES = LEGACY_TYPES
const TYPE_MAP = LEGACY_MAP

const DEPARTMENTS = [
  'ห้องยา G','ห้องยา 1','ER (ฉุกเฉิน)','IPD (ผู้ป่วยใน)','OPD (ผู้ป่วยนอก)','LR (ห้องคลอด)',
  'ทันตกรรม','แผนไทย','กายภาพ','LAB','X-ray','ห้องทำแผล','งานส่งต่อ','บริหารทั่วไป',
  'กลุ่มงานจิตเวชและยาเสพติด','IPD-หน่วยวัง','IPD-โดม',
  'รพสต.คูคต','รพสต.วัดประยูร',
]
const VENDOR_LABEL = 'บริษัทยา / Supplier'
const SOURCE_DEPARTMENTS = [...DEPARTMENTS, VENDOR_LABEL]

// map หน่วยงาน → return_source (ดู docs/adr/0003) — explicit เฉพาะที่ชัด ที่เหลือ ward
function deptToSource(dept) {
  if (dept === VENDOR_LABEL)     return 'vendor'
  if (dept === 'ER (ฉุกเฉิน)')   return 'er'
  if (dept === 'OPD (ผู้ป่วยนอก)') return 'opd'
  return 'ward'
}

function isoToThai(iso) {
  if (!iso) return '-'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${Number(y) + 543}`
}

function IsoDateInput({ value, onChange, className = '', ring = 'focus-within:ring-violet-400' }) {
  const display = iso => { if (!iso) return null; const [y,m,d] = iso.split('-'); return `${d}/${m}/${Number(y)+543}`; }
  return (
    <div className={`relative flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl focus-within:ring-2 ${ring} ${className}`}>
      <span className={`px-3 py-2 text-sm w-full select-none pointer-events-none ${value ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>{display(value) || 'dd/mm/yyyy'}</span>
      {/* onClick + showPicker guarded (Rule #3): เสริมเปิดปฏิทินตอนคลิกบน desktop; mobile แตะเปิด native ตามปกติ */}
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
        onClick={e => { try { e.currentTarget.showPicker?.() } catch { /* noop */ } }}
        className="absolute inset-0 opacity-0 w-full cursor-pointer" />
    </div>
  )
}

function printReturnLog(r) {
  // escape ค่าจากผู้ใช้กันโครงสร้าง HTML พัง (ชื่อยา/หมายเหตุ ที่มี < > & )
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const val = (v) => (v != null && String(v).trim() !== '' && v !== '-') ? esc(v) : '-'

  // รองรับทั้งข้อมูลใหม่ (2 ระดับ) และเก่า (legacy)
  const srcInfo    = r.return_source ? SOURCE_MAP[r.return_source] : null
  const reasonInfo = r.return_source ? REASON_MAP[r.return_type]   : null
  const legacyInfo = !r.return_source ? (LEGACY_MAP[r.return_type] || { label: r.return_type || '-' }) : null
  const badgeLabel = srcInfo ? srcInfo.label : (legacyInfo?.label || r.return_type || '-')
  const subLabel   = reasonInfo ? reasonInfo.label : null

  const sourceColors = {
    ward:   { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' },
    or:     { bg: '#EDE9FE', text: '#5B21B6', border: '#C4B5FD' },
    er:     { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
    opd:    { bg: '#E0F2FE', text: '#075985', border: '#7DD3FC' },
    vendor: { bg: '#FED7AA', text: '#9A3412', border: '#FDBA74' },
    // legacy
    ward_return:     { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' },
    damaged:         { bg: '#FED7AA', text: '#9A3412', border: '#FDBA74' },
    expired_removal: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
    vendor_return:   { bg: '#EDE9FE', text: '#5B21B6', border: '#C4B5FD' },
  }
  const tc = sourceColors[r.return_source || r.return_type] || { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' }
  const printDate = isoToThai(r.return_date || new Date().toISOString().slice(0, 10))
  const today = isoToThai(new Date().toISOString().slice(0, 10))

  // แถวข้อมูล (label, value) — render เป็น definition-table ให้ label/value เรียงคอลัมน์ตรงกันเป๊ะ
  const drugRows = [
    ['ชื่อยา', val(r.drug_name)],
    ['รหัสยา', val(r.drug_code)],
    ['ชนิดยา', val(r.drug_type)],
    ['Lot Number', val(r.lot)],
    ['วันหมดอายุ (Exp)', val(r.exp)],
    ['จำนวนคืน', `${Number(r.qty_returned || 0).toLocaleString()} ${r.drug_unit && r.drug_unit !== '-' ? esc(r.drug_unit) : ''}`.trim()],
  ]
  const partyRows = [
    ['แหล่งที่คืน', esc(badgeLabel)],
    ['สาเหตุการคืน', subLabel ? esc(subLabel) : '-'],
    ['หน่วยงานที่คืน', val(r.department)],
    ['วันที่คืน / บันทึก', printDate],
  ]
  const row = ([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`

  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<title>ใบคืนยา ${printDate}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #1e293b; background: #f1f5f9; padding: 24px; }
  .sheet { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px;
    padding: 32px 36px; }
  /* Header */
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    padding-bottom: 14px; border-bottom: 2px solid #5B21B6; }
  .head h1 { font-size: 19px; font-weight: 700; color: #1e293b; line-height: 1.2; }
  .head .sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }
  .head .badge { display: inline-block; padding: 4px 14px; border-radius: 999px; font-size: 12px; font-weight: 700;
    white-space: nowrap; background: ${tc.bg}; color: ${tc.text}; border: 1px solid ${tc.border}; }
  .head .reason { font-size: 11px; color: #64748b; margin-top: 5px; text-align: right; }
  /* Section */
  .section-title { font-size: 10px; font-weight: 700; color: #5B21B6; text-transform: uppercase;
    letter-spacing: .06em; margin: 18px 0 8px; }
  /* Definition table — label คอลัมน์กว้างคงที่ → value เรียงตรงกันทุกแถว */
  table.kv { width: 100%; border-collapse: collapse; }
  table.kv th, table.kv td { text-align: left; vertical-align: top; padding: 7px 10px; font-size: 13px; }
  table.kv th { width: 150px; font-weight: 500; color: #64748b; background: #f8fafc;
    border: 1px solid #e2e8f0; white-space: nowrap; }
  table.kv td { font-weight: 600; color: #1e293b; border: 1px solid #e2e8f0; word-break: break-word; }
  .note-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px;
    font-size: 12px; color: #475569; min-height: 40px; white-space: pre-wrap; }
  /* Signature */
  .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 34px; }
  .sig-box { text-align: center; }
  .sig-line { margin-top: 46px; border-bottom: 1px dotted #475569; }
  .sig-name { font-size: 12px; color: #94a3b8; margin-top: 5px; }
  .sig-label { font-size: 12px; font-weight: 600; color: #334155; margin-top: 3px; }
  .sig-date { font-size: 11px; color: #64748b; margin-top: 8px; }
  .sig-date span { display: inline-block; border-bottom: 1px dotted #94a3b8; min-width: 90px; }
  .foot { font-size: 10px; color: #94a3b8; text-align: right; margin-top: 22px; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { border: none; border-radius: 0; max-width: 100%; padding: 10mm 12mm; }
    button { display: none !important; }
  }
</style>
</head><body>
<button onclick="window.print()" style="position:fixed;top:16px;right:16px;background:#5B21B6;color:#fff;border:none;
  padding:9px 20px;border-radius:9px;font-family:Sarabun,sans-serif;font-size:13px;cursor:pointer;font-weight:600;
  box-shadow:0 2px 8px rgba(91,33,182,.3);">
  พิมพ์ / บันทึก PDF
</button>

<div class="sheet">
  <div class="head">
    <div>
      <h1>ใบคืนยา / บันทึกยาเสียหาย</h1>
      <p class="sub">Return &amp; Write-off Record</p>
    </div>
    <div style="text-align:right;">
      <span class="badge">${esc(badgeLabel)}</span>
      ${subLabel ? `<div class="reason">สาเหตุ: ${esc(subLabel)}</div>` : ''}
    </div>
  </div>

  <p class="section-title">ข้อมูลยา</p>
  <table class="kv">${drugRows.map(row).join('')}</table>

  <p class="section-title">ข้อมูลการคืน</p>
  <table class="kv">${partyRows.map(row).join('')}</table>

  ${r.note ? `<p class="section-title">หมายเหตุ</p><div class="note-box">${esc(r.note)}</div>` : ''}

  <div class="sig-row">
    <div class="sig-box">
      <div class="sig-line"></div>
      <p class="sig-name">${val(r.returned_by) !== '-' ? val(r.returned_by) : '(........................................)'}</p>
      <p class="sig-label">ผู้คืนยา</p>
      <p class="sig-date">วันที่ <span></span></p>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <p class="sig-name">${val(r.received_by) !== '-' ? val(r.received_by) : '(........................................)'}</p>
      <p class="sig-label">เจ้าหน้าที่ผู้รับคืน</p>
      <p class="sig-date">วันที่ <span></span></p>
    </div>
  </div>

  <p class="foot">พิมพ์เมื่อ ${today}</p>
</div>
</body></html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const win  = window.open(url, '_blank')
  if (win) setTimeout(() => URL.revokeObjectURL(url), 30000)
  else     URL.revokeObjectURL(url)
}

// ============================================================
// Root
// ============================================================
export default function ReturnApp({ onRefresh, auth, onGoBack, canGoBack }) {
  const [tab, setTab] = useState('record')
  const isStaff = auth?.role === 'staff' || auth?.role === 'admin'

  // แท็บ "ตรวจสอบรายการ" = staff/admin เท่านั้น (เคลียร์งานคืนที่รอตรวจ)
  const tabs = [
    { key: 'record',  label: 'บันทึกรายการ' },
    ...(isStaff ? [{ key: 'review', label: 'ตรวจสอบรายการ' }] : []),
    { key: 'history', label: 'ประวัติ' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800 font-sans">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
          <div className="p-2 bg-violet-100 dark:bg-violet-950/60 text-violet-600 rounded-xl shrink-0"><RotateCcw size={20} /></div>
          <button onClick={onRefresh} className="text-left hover:opacity-70 transition-opacity" title="คลิกเพื่อโหลดใหม่">
            <p className="font-bold text-sm leading-tight text-slate-800 dark:text-slate-100">ระบบคืนยา / บันทึกยาเสียหาย</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs">Return &amp; Write-off Management</p>
          </button>
        </div>
        <div className="max-w-4xl mx-auto px-4 flex gap-2 pb-2.5">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                tab === t.key ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-5">
        {tab === 'record'  && <RecordTab  auth={auth} />}
        {tab === 'review'  && <HistoryTab auth={auth} mode="review" />}
        {tab === 'history' && <HistoryTab auth={auth} mode="history" />}
      </div>
    </div>
  )
}

// ============================================================
// RecordTab — form บันทึก
// ============================================================
function RecordTab({ auth }) {
  const today = new Date().toISOString().split('T')[0]

  const emptyForm = () => ({
    return_date:   today,
    return_source: '',
    return_type:   '',
    drug_name:     '',
    drug_code:     '-',
    drug_type:     '-',
    lot:           '-',
    exp:           '-',
    qty_returned:  '',
    drug_unit:     '-',
    department:    '',
    returned_by:   '',
    received_by:   '-',   // เติมตอนคลังยืนยันรับคืน (ADR-0009) — ไม่ให้ผู้ส่งกรอกเอง
    note:          '',
  })

  const [form, setForm]             = useState(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)
  const [lastSubmitted, setLastSubmitted] = useState(null)
  const [drugNames, setDrugNames]   = useState([])   // [{ name, code, type, unit, lots: [{ lot, exp, qty }] }]
  const [drugSearch, setDrugSearch] = useState('')
  const [lotOptions, setLotOptions] = useState([])   // lot ของยาที่เลือก (จากคลัง)
  const [manualLot, setManualLot]   = useState(false) // true = พิมพ์ lot เอง (ไม่มีในคลัง)

  // โหลดยาจาก inventory (paginated — เลี่ยง 1000-row limit) + group lot ต่อชื่อยา
  useEffect(() => {
    if (!supabase) return
    fetchAllInventoryRows('name, code, type, unit, lot, exp, qty')
      .then(rows => {
        const byName = new Map()
        rows.forEach(r => {
          if (!r.name) return
          if (!byName.has(r.name)) byName.set(r.name, { name: r.name, code: r.code, type: r.type, unit: r.unit, lots: [] })
          const entry = byName.get(r.name)
          if (r.lot && r.lot !== '-') entry.lots.push({ lot: r.lot, exp: r.exp || '-', qty: Number(r.qty) || 0 })
        })
        const names = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'))
        setDrugNames(names)
      })
      .catch(() => {})
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectDrug = (d) => {
    setDrugSearch(d.name)
    // รวม lot ซ้ำ (คนละ location) เป็นรายการเดียว รวม qty
    const lotMap = new Map()
    d.lots.forEach(({ lot, exp, qty }) => {
      const k = `${lot}|${exp}`
      if (!lotMap.has(k)) lotMap.set(k, { lot, exp, qty: 0 })
      lotMap.get(k).qty += qty
    })
    const lots = [...lotMap.values()].sort((a, b) => (a.exp || '').localeCompare(b.exp || ''))
    setLotOptions(lots)
    setManualLot(false)
    setForm(f => ({
      ...f,
      drug_name: d.name,
      drug_code: d.code || '-',
      drug_type: d.type || '-',
      drug_unit: d.unit || '-',
      lot: '-',
      exp: '-',
    }))
  }

  // เลือก lot จาก dropdown → เติม exp อัตโนมัติ
  const selectLot = (v) => {
    if (v === '__manual__') { setManualLot(true); set('lot', ''); set('exp', '-'); return }
    const opt = lotOptions.find(o => o.lot === v)
    if (opt) setForm(f => ({ ...f, lot: opt.lot, exp: opt.exp || '-' }))
  }

  const reasonInfo = form.return_type ? REASON_MAP[form.return_type] : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.department)                                         { setError('กรุณาเลือกหน่วยงาน / แหล่งที่คืน'); return }
    if (!form.return_type)                                        { setError('กรุณาเลือกสาเหตุการคืน'); return }
    if (form.return_type === 'other' && !form.note.trim())        { setError('กรุณาระบุสาเหตุในช่องหมายเหตุ'); return }
    if (!form.drug_name.trim())                                   { setError('กรุณากรอกชื่อยา'); return }
    if (!form.qty_returned || parseFloat(form.qty_returned) <= 0) { setError('กรุณากรอกจำนวนที่ถูกต้อง'); return }

    setSubmitting(true)
    try {
      await insertReturnLog({
        return_date:   form.return_date,
        return_source: form.return_source,
        drug_name:     form.drug_name.trim(),
        drug_code:     form.drug_code   || '-',
        drug_type:     form.drug_type   || '-',
        lot:           form.lot         || '-',
        exp:           form.exp         || '-',
        qty_returned:  parseFloat(form.qty_returned),
        drug_unit:     form.drug_unit   || '-',
        return_type:   form.return_type,
        department:    form.department || '-',
        returned_by:   form.returned_by || '-',
        received_by:   '-',              // เติมตอนคลังยืนยัน (ADR-0009)
        status:        'pending',        // คำขอใหม่ = รอคลังยืนยันรับคืน
        note:          form.note        || null,
      }, auth)
      setLastSubmitted({ ...form })
      setSuccess(true)   // เปิด popup ยืนยัน — ผู้ใช้กดปิดเอง
      setForm(emptyForm())
      setDrugSearch('')
      setLotOptions([])
      setManualLot(false)
    } catch (err) {
      setError('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-shadow'
  const labelCls = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ── Popup ยืนยันบันทึกสำเร็จ ── */}
      {success && lastSubmitted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSuccess(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center mb-3">
              <CheckCircle size={30} className="text-emerald-600" />
            </div>
            <p className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1">บันทึกการคืนยาเรียบร้อยแล้ว</p>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              คืนยา <span className="font-semibold text-slate-800 dark:text-slate-100">{lastSubmitted.drug_name}</span>
              {lastSubmitted.qty_returned && <> จำนวน <span className="font-semibold text-violet-700 dark:text-violet-300">{Number(lastSubmitted.qty_returned).toLocaleString()} {lastSubmitted.drug_unit && lastSubmitted.drug_unit !== '-' ? lastSubmitted.drug_unit : 'หน่วย'}</span></>}
              <br />หน่วยงาน <span className="font-semibold text-slate-800 dark:text-slate-100">{lastSubmitted.department}</span>
            </p>
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2 mt-3">รอเจ้าหน้าที่คลังยืนยันรับคืน</p>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => printReturnLog(lastSubmitted)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors">
                <Printer size={15} /> พิมพ์ / PDF
              </button>
              <button type="button" onClick={() => setSuccess(false)}
                className="flex-1 px-3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-semibold transition-colors">
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-2xl px-4 py-3 text-red-600 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* ── STEP 1: แหล่งที่คืน + สาเหตุ ── */}
      {/* overflow-visible: ให้ dropdown ของ SearchableSelect ("คืนจากไหน") ล้นออกนอกการ์ดได้ ไม่โดน overflow-hidden ตัด */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-visible">
        <div className="flex items-center gap-2.5 px-5 py-3.5 bg-gradient-to-r from-violet-50 dark:from-slate-900 to-white border-b border-slate-100 dark:border-slate-800 rounded-t-2xl">
          <div className="p-1.5 rounded-lg bg-violet-600 text-white shrink-0"><MapPin size={15} /></div>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">แหล่งที่คืน &amp; สาเหตุ</p>
          <span className="ml-auto text-[11px] font-bold text-violet-600 bg-violet-100 dark:bg-violet-950/60 rounded-full w-6 h-6 flex items-center justify-center">1</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>คืนจากไหน *</label>
              <SearchableSelect
                value={form.department}
                onChange={v => {
                  const newSource = deptToSource(v)
                  const validReasons = RETURN_REASONS.filter(r => r.sources.includes(newSource))
                  setForm(f => ({ ...f, department: v, return_source: newSource, return_type: validReasons[0]?.key || '' }))
                }}
                options={SOURCE_DEPARTMENTS}
                placeholder="-- เลือกหน่วยงาน / แหล่งที่คืน --"
              />
            </div>
            <div>
              <label className={labelCls}>สาเหตุการคืน *</label>
              {form.department ? (() => {
                const validReasons = RETURN_REASONS.filter(r => r.sources.includes(form.return_source))
                return (
                  <select value={form.return_type} onChange={e => set('return_type', e.target.value)}
                    className={`${inputCls} bg-white dark:bg-slate-900 appearance-none`}>
                    {validReasons.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                )
              })() : (
                <div className="text-sm text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5">
                  เลือกหน่วยงานก่อน
                </div>
              )}
              {form.return_type === 'other' && (
                <div>
                  <textarea value={form.note} onChange={e => set('note', e.target.value)}
                    placeholder="ระบุสาเหตุการคืน..." rows={2} autoFocus
                    className={`${inputCls} resize-none mt-2 ring-2 ring-violet-300 border-violet-400`} />
                  <p className="text-[11px] text-violet-600 mt-1">ระบุสาเหตุการคืนที่ไม่มีในตัวเลือก (บันทึกในหมายเหตุ)</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── STEP 2: ข้อมูลยา ── */}
      {/* overflow-visible: ให้ dropdown DrugSearchBar ("ชื่อยา") ล้นออกนอกการ์ดได้ */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-visible">
        <div className="flex items-center gap-2.5 px-5 py-3.5 bg-gradient-to-r from-sky-50 dark:from-slate-900 to-white border-b border-slate-100 dark:border-slate-800 rounded-t-2xl">
          <div className="p-1.5 rounded-lg bg-sky-500 text-white shrink-0"><Pill size={15} /></div>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">ข้อมูลยา</p>
          <span className="ml-auto text-[11px] font-bold text-sky-600 bg-sky-100 dark:bg-sky-950/60 rounded-full w-6 h-6 flex items-center justify-center">2</span>
        </div>
        <div className="p-5 space-y-4">
          {/* ค้นหายา (เต็มแถว) — DrugSearchBar (autocomplete + badge ชนิดยา) */}
          <div>
            <label className={labelCls}>ชื่อยา *</label>
            <DrugSearchBar
              value={drugSearch || form.drug_name}
              onChange={v => { setDrugSearch(v); set('drug_name', v); setLotOptions([]); setManualLot(true) }}
              onSelect={name => { const d = drugNames.find(x => x.name === name); if (d) selectDrug(d) }}
              options={drugNames}
              placeholder="พิมพ์เพื่อค้นหายาในคลัง..."
              ringClass="focus:ring-violet-400"
              hoverClass="hover:bg-violet-50 dark:hover:bg-violet-950/50"
              maxResults={10}
            />
          </div>

          {/* แถวที่ 1: รหัส / ชนิด */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>รหัสยา</label>
              <div className="relative">
                <Hash size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                <input type="text" value={form.drug_code === '-' ? '' : form.drug_code}
                  onChange={e => set('drug_code', e.target.value || '-')} placeholder="-"
                  className={`${inputCls} pl-10`} />
              </div>
            </div>
            <div>
              <label className={labelCls}>ชนิดยา</label>
              <input type="text" value={form.drug_type === '-' ? '' : form.drug_type}
                onChange={e => set('drug_type', e.target.value || '-')} placeholder="Tablet, Syrup..."
                className={inputCls} />
            </div>
          </div>

          {/* แถวที่ 2: Lot (dropdown) / Exp */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Lot</label>
              {lotOptions.length > 0 && !manualLot ? (
                <div className="relative">
                  <Layers size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none z-10" />
                  <select value={form.lot === '-' ? '' : form.lot} onChange={e => selectLot(e.target.value)}
                    className={`${inputCls} pl-10 bg-white dark:bg-slate-900 appearance-none`}>
                    <option value="">-- เลือก lot จากคลัง --</option>
                    {lotOptions.map(o => (
                      <option key={o.lot} value={o.lot}>
                        {o.lot}{o.exp !== '-' ? ` · Exp ${o.exp}` : ''}{o.qty ? ` · คงเหลือ ${o.qty.toLocaleString()}` : ''}
                      </option>
                    ))}
                    <option value="__manual__">+ พิมพ์ lot เอง (ไม่มีในคลัง)</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                </div>
              ) : (
                <div className="relative">
                  <input type="text" value={form.lot === '-' ? '' : form.lot}
                    onChange={e => set('lot', e.target.value || '-')} placeholder="พิมพ์ lot..."
                    className={inputCls} />
                  {lotOptions.length > 0 && (
                    <button type="button" onClick={() => { setManualLot(false); set('lot', '-'); set('exp', '-') }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-violet-600 font-semibold hover:underline">
                      เลือกจากคลัง
                    </button>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>วันหมดอายุ (Exp)</label>
              <input type="text" value={form.exp === '-' ? '' : form.exp}
                onChange={e => set('exp', e.target.value || '-')} placeholder="DD/MM/YYYY"
                className={inputCls} />
            </div>
          </div>

          {/* แถวที่ 3: จำนวน / หน่วย / วันที่ */}
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>จำนวนคืน *</label>
              <div className="relative">
                <Package size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                <input type="number" min="0.01" step="0.01" value={form.qty_returned}
                  onChange={e => set('qty_returned', e.target.value)} placeholder="0" required
                  className={`${inputCls} pl-10`} />
              </div>
            </div>
            <div>
              <label className={labelCls}>หน่วย</label>
              <input type="text" value={form.drug_unit === '-' ? '' : form.drug_unit}
                onChange={e => set('drug_unit', e.target.value || '-')} placeholder="เม็ด, ขวด..."
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>วันที่คืน *</label>
              <IsoDateInput value={form.return_date} onChange={v => set('return_date', v)} className="w-full" />
            </div>
          </div>
        </div>
      </section>

      {/* ── STEP 3: ผู้คืน / ผู้รับ ── */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3.5 bg-gradient-to-r from-emerald-50 dark:from-slate-900 to-white border-b border-slate-100 dark:border-slate-800">
          <div className="p-1.5 rounded-lg bg-emerald-600 text-white shrink-0"><UserCheck size={15} /></div>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">ผู้คืน / ผู้รับ</p>
          <span className="ml-auto text-[11px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-950/60 rounded-full w-6 h-6 flex items-center justify-center">3</span>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>ชื่อผู้คืน / ผู้แจ้ง</label>
            <input type="text" value={form.returned_by} onChange={e => set('returned_by', e.target.value)}
              placeholder="ชื่อ-สกุล" className={inputCls} />
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">เจ้าหน้าที่ผู้รับคืนจะถูกเติมอัตโนมัติเมื่อคลังกดยืนยันรับคืน</p>
          </div>
          {/* เมื่อเลือก 'อื่นๆ' ช่องหมายเหตุ (= form.note) ถูกยกไปไว้ใต้ dropdown สาเหตุใน STEP 1 แล้ว — ซ่อนที่นี่กันซ้ำ */}
          {form.return_type !== 'other' && (
            <div>
              <label className={labelCls}>หมายเหตุ</label>
              <textarea value={form.note} onChange={e => set('note', e.target.value)}
                placeholder="รายละเอียดเพิ่มเติม..." rows={2}
                className={`${inputCls} resize-none`} />
            </div>
          )}
        </div>
      </section>

      {/* แถบสรุป + ปุ่มบันทึก (sticky bottom) */}
      <div className="sticky bottom-0 z-10 bg-slate-50 dark:bg-slate-800/80 backdrop-blur-sm pt-1 pb-1 -mx-4 px-4">
        {form.drug_name && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-slate-400 mb-2 px-1">
            <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[200px]">{form.drug_name}</span>
            {form.qty_returned && <span className="text-violet-700 dark:text-violet-300 font-bold">{Number(form.qty_returned).toLocaleString()} {form.drug_unit !== '-' ? form.drug_unit : 'หน่วย'}</span>}
            {form.department && <><ArrowRight size={12} /><span className="text-slate-500 dark:text-slate-400 truncate max-w-[140px]">{form.department}</span></>}
            {reasonInfo && <span className="text-slate-400 dark:text-slate-500">· {reasonInfo.short}</span>}
          </div>
        )}
        <button type="submit" disabled={submitting}
          className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm transition-colors shadow-sm">
          <CheckCircle size={16} /> {submitting ? 'กำลังบันทึก...' : 'บันทึกการคืนยา'}
        </button>
      </div>
    </form>
  )
}

const RETURN_EXCEL_COLS = [
  { header: 'วันที่',          key: 'return_date' },
  { header: 'แหล่งที่คืน',    value: r => r.return_source ? (SOURCE_MAP[r.return_source]?.label || r.return_source) : (LEGACY_MAP[r.return_type]?.label || r.return_type) },
  { header: 'สาเหตุ',          value: r => r.return_source ? (REASON_MAP[r.return_type]?.label || r.return_type || '-') : '-' },
  { header: 'ชื่อยา',          key: 'drug_name' },
  { header: 'รหัสยา',          key: 'drug_code' },
  { header: 'ชนิด',            key: 'drug_type' },
  { header: 'Lot',              key: 'lot' },
  { header: 'วันหมดอายุ',      key: 'exp' },
  { header: 'จำนวน',           key: 'qty_returned' },
  { header: 'หน่วย',           key: 'drug_unit' },
  { header: 'หน่วยงานที่คืน',  key: 'department' },
  { header: 'สถานะ',           value: r => STATUS_META[returnStatus(r)]?.label || '-' },
  { header: 'ผลการดำเนินการ',  value: r => r.disposition ? (DISPOSITION_META[r.disposition]?.label || r.disposition) : '-' },
  { header: 'หมายเหตุการดำเนินการ', value: r => r.disposition_note || '-' },
  { header: 'ผู้คืน',          key: 'returned_by' },
  { header: 'ผู้รับ',          key: 'received_by' },
  { header: 'ผู้ดำเนินการ',    value: r => r.disposition_by || '-' },
  { header: 'หมายเหตุ',        key: 'note' },
]

// ============================================================
// EditReturnModal — admin แก้ไขรายการ (modal ลอย)
// ============================================================
function EditReturnModal({ log, auth, onClose, onSaved }) {
  const [form, setForm] = useState({
    return_date:  log.return_date  || '',
    return_type:  log.return_type  || 'ward_return',
    drug_name:    log.drug_name    || '',
    drug_code:    log.drug_code    || '-',
    drug_type:    log.drug_type    || '-',
    qty_returned: log.qty_returned ?? 0,
    drug_unit:    log.drug_unit    || '-',
    lot:          log.lot          || '-',
    exp:          log.exp          || '-',
    department:   log.department   || '-',
    returned_by:  log.returned_by  || '-',
    received_by:  log.received_by  || '-',
    note:         log.note         || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.drug_name.trim()) { setError('กรุณากรอกชื่อยา'); return }
    setSaving(true); setError('')
    try {
      await updateReturnLog(log.id, form, auth)
      onSaved()
    } catch (e) { setError(e.message); setSaving(false) }
  }

  const field = (label, key, type = 'text') => (
    <div key={key}>
      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">{label}</label>
      <input type={type} value={form[key]} onChange={e => set(key, e.target.value)}
        className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400" />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-violet-50 dark:bg-violet-950/40 flex items-center gap-3 shrink-0">
          <Pencil size={18} className="text-violet-600" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-violet-800 dark:text-violet-300">แก้ไขรายการ</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{log.drug_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {field('วันที่', 'return_date', 'date')}
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">ประเภท</label>
              <select value={form.return_type} onChange={e => set('return_type', e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white dark:bg-slate-900">
                {RETURN_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
          </div>
          {field('ชื่อยา', 'drug_name')}
          <div className="grid grid-cols-2 gap-3">
            {field('รหัสยา', 'drug_code')}
            {field('ชนิดยา', 'drug_type')}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {field('จำนวน', 'qty_returned', 'number')}
            {field('หน่วย', 'drug_unit')}
            {field('Lot', 'lot')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('Exp', 'exp')}
            {field('หน่วยงาน', 'department')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('ผู้คืน', 'returned_by')}
            {field('ผู้รับ', 'received_by')}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">หมายเหตุ</label>
            <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none" />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="px-4 pb-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-2 shrink-0">
          <button onClick={onClose} disabled={saving}
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:border-slate-400 text-slate-700 dark:text-slate-200 rounded-xl py-2.5 font-medium text-sm transition-colors">
            ยกเลิก
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-2.5 font-semibold text-sm transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// HistoryTab — ประวัติการคืนยา
// ============================================================
function HistoryTab({ auth = {}, mode = 'history' }) {
  const isReview = mode === 'review'   // แท็บ "ตรวจสอบรายการ" = แสดงเฉพาะที่รอตรวจ (pending)
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [filterDept, setFilterDept] = useState('')   // '' = ทุกหน่วยงาน; อื่น = ชื่อหน่วยงานจริง
  const [search, setSearch]     = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [isMobile, setIsMobile]     = useState(() => window.innerWidth < 768)
  const [editLog, setEditLog]       = useState(null)   // log object กำลัง edit
  const [confirmingId, setConfirmingId] = useState(null)   // id กำลังยืนยันรับคืน
  const [dispositionLog, setDispositionLog] = useState(null)   // log object กำลังเลือกผลการดำเนินการ (ADR-0012)
  const [detailLog, setDetailLog] = useState(null)   // log object เปิดหน้ารายละเอียดเต็มจอ (เหมือนใบเบิก)
  const isAdmin = auth?.role === 'admin'

  // เรียงตารางฝั่ง client (logs โหลดครบใน state) — default = ลำดับจาก server (return_date ล่าสุด)
  const { sorted, sort, toggleSort } = useSort(logs, { numericKeys: ['qty_returned'] })
  const isStaff = auth?.role === 'staff' || auth?.role === 'admin'   // เจ้าหน้าที่คลัง — กดยืนยันรับคืนได้

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchReturnLogs({
        dateFrom:   dateFrom || undefined,
        dateTo:     dateTo   || undefined,
        department: filterDept || undefined,   // '' = ทุกหน่วยงาน
        drugName:   search.trim() || undefined,
        status:     isReview ? 'pending' : undefined,   // ตรวจสอบรายการ = เฉพาะที่รอตรวจ
      })
      setLogs(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterDept, dateFrom, dateTo, isReview])

  const handleDelete = async (id) => {
    try {
      await deleteReturnLog(id, auth)
      setDetailLog(null)
      load()
    } catch (e) { console.error(e) }
  }

  // staff/admin ยืนยันรับคืน → status='received' + เติมชื่อผู้รับ (ADR-0009)
  const receiverName = (auth?.name && auth.name.trim() && auth.name.trim() !== '-') ? auth.name : (auth?.username || '-')
  // ยืนยันรับคืนพร้อมระบุผลการดำเนินการ (ADR-0012) — เรียกจาก DispositionModal
  const handleConfirmWithDisposition = async (id, disposition, note) => {
    setConfirmingId(id)
    try {
      await confirmReturnReceived(id, receiverName, auth, disposition, note)
      setDispositionLog(null)
      setDetailLog(null)   // ปิดหน้ารายละเอียดกลับประวัติ — เห็นผลใน list ทันที
      load()
    } catch (e) { console.error(e) } finally { setConfirmingId(null) }
  }

  // หน้ารายละเอียดเต็มจอ (เหมือนใบเบิก) — คลิกรายการ → เปิด ReturnDetail
  if (detailLog) {
    return (
      <ReturnDetail
        log={detailLog}
        auth={auth}
        isStaff={isStaff}
        isAdmin={isAdmin}
        busy={confirmingId === detailLog.id}
        onBack={() => setDetailLog(null)}
        onDispose={() => setDispositionLog(detailLog)}
        onEdit={() => setEditLog(detailLog)}
        onPrint={() => printReturnLog(detailLog)}
        onDelete={() => handleDelete(detailLog.id)}
        editModal={editLog && editLog.id === detailLog.id ? (
          <EditReturnModal log={editLog} auth={auth}
            onClose={() => setEditLog(null)}
            onSaved={(updated) => { setEditLog(null); if (updated) setDetailLog(updated); load() }} />
        ) : null}
        dispositionModal={dispositionLog && dispositionLog.id === detailLog.id ? (
          <DispositionModal log={dispositionLog} busy={confirmingId === dispositionLog.id}
            onClose={() => setDispositionLog(null)}
            onConfirm={(disp, note) => handleConfirmWithDisposition(dispositionLog.id, disp, note)} />
        ) : null}
      />
    )
  }

  return (
    <div className="space-y-4">
      {isReview && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl px-4 py-3">
          <Clock size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">รายการคืนยาที่รอตรวจสอบ</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">คลิกรายการเพื่อตรวจรับและเลือกผลการดำเนินการ (รับเข้าคลัง / ทำลาย / ส่งคืนบริษัท / ปฏิเสธ)</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex gap-2 flex-wrap">
          <IsoDateInput value={dateFrom} onChange={setDateFrom} />
          <span className="self-center text-slate-400 dark:text-slate-500 text-sm">–</span>
          <IsoDateInput value={dateTo} onChange={setDateTo} />
          <div className="flex-1 min-w-[160px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load()}
              placeholder="ค้นหาชื่อยา... (Enter)"
              className="w-full border border-slate-300 dark:border-slate-600 rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <button onClick={load}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors">
            ค้นหา
          </button>
          <button
            onClick={() => exportToExcel(logs, RETURN_EXCEL_COLS, 'คืนยา', `return_logs_${new Date().toISOString().slice(0,10)}.xlsx`, auth)}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors">
            <FileDown size={14} /> Excel
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">หน่วยงาน</span>
          <SearchableSelect
            value={filterDept}
            onChange={setFilterDept}
            options={SOURCE_DEPARTMENTS}
            emptyLabel="ทุกหน่วยงาน"
            placeholder="ทุกหน่วยงาน"
            className="w-56"
          />
        </div>
      </div>


      {/* Table */}
      {loading ? (
        <p className="text-center text-slate-400 dark:text-slate-500 py-10 text-sm">กำลังโหลด...</p>
      ) : logs.length === 0 ? (
        <div className="text-center text-slate-400 dark:text-slate-500 py-16">
          <FileText size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">{isReview ? 'ไม่มีรายการรอตรวจสอบ' : 'ไม่พบข้อมูล'}</p>
        </div>
      ) : isMobile ? (
        <div className="space-y-2">
          {sorted.map((l) => {
            const b = getReasonBadge(l)
            return (
              <div key={l.id} onClick={() => setDetailLog(l)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm active:bg-violet-50 transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-50 truncate text-sm">{l.drug_name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {returnStatus(l) === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"><Clock size={9} />รอรับคืน</span>
                      )}
                      <p className="text-xs text-slate-400 dark:text-slate-500">{isoToThai(l.return_date)}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-violet-700 dark:text-violet-300">{Number(l.qty_returned).toLocaleString()}</p>
                    {l.drug_unit && l.drug_unit !== '-' && <p className="text-[10px] text-slate-400 dark:text-slate-500">{l.drug_unit}</p>}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${b.badgeBg} ${b.badgeText}`}>{b.label}</span>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate ml-2 shrink-0">{l.department !== '-' ? l.department : ''}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="text-xs text-slate-500 dark:text-slate-400 font-semibold bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 uppercase tracking-wide">
                  <SortableTh sortKey="return_date" label="วันที่" sort={sort} onSort={toggleSort} className="px-3 py-3" activeColor="text-violet-600" />
                  <SortableTh sortKey="drug_name" label="ชื่อยา" sort={sort} onSort={toggleSort} className="px-3 py-3" activeColor="text-violet-600" />
                  <th className="px-3 py-3 text-left">ชนิดยา</th>
                  <th className="px-3 py-3 text-left">สาเหตุ</th>
                  <SortableTh sortKey="qty_returned" label="จำนวน" align="right" sort={sort} onSort={toggleSort} className="px-3 py-3" activeColor="text-violet-600" />
                  <th className="px-3 py-3 text-left">หน่วย</th>
                  <th className="px-3 py-3 text-left">Lot</th>
                  <th className="px-3 py-3 text-left">Exp</th>
                  <SortableTh sortKey="department" label="หน่วยงาน" sort={sort} onSort={toggleSort} className="px-3 py-3" activeColor="text-violet-600" />
                  <th className="px-3 py-3 text-left">สถานะ</th>
                  <th className="px-3 py-3 text-left">ผู้คืน</th>
                  <th className="px-3 py-3 text-left">ผู้รับ</th>
                  <th className="px-3 py-3 text-left w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sorted.map((l) => {
                  const b = getReasonBadge(l)
                  return (
                    <React.Fragment key={l.id}>
                      <tr onClick={() => setDetailLog(l)}
                        className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 whitespace-nowrap font-medium">{isoToThai(l.return_date)}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-100 max-w-[200px]">
                          <span className="block truncate">{l.drug_name}</span>
                          {l.drug_code && l.drug_code !== '-' && <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">{l.drug_code}</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {l.drug_type && l.drug_type !== '-' ? <DrugTypeBadge type={l.drug_type} /> : <span className="text-slate-300 dark:text-slate-500">-</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${b.badgeBg} ${b.badgeText}`}>{b.label}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-violet-700 dark:text-violet-300 whitespace-nowrap">{Number(l.qty_returned).toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">{l.drug_unit && l.drug_unit !== '-' ? l.drug_unit : '-'}</td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">{l.lot && l.lot !== '-' ? l.lot : '-'}</td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">{l.exp && l.exp !== '-' ? l.exp : '-'}</td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 text-xs">{l.department !== '-' ? l.department : '-'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            {(() => {
                              const st = returnStatus(l), sm = STATUS_META[st], SIcon = sm.icon
                              return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${sm.badgeBg} ${sm.badgeText}`}><SIcon size={10} />{sm.label}</span>
                            })()}
                            {l.disposition && DISPOSITION_META[l.disposition] && (() => {
                              const dm = DISPOSITION_META[l.disposition], DIcon = dm.icon
                              return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${dm.badgeBg} ${dm.badgeText}`}><DIcon size={10} />{dm.label}</span>
                            })()}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 text-xs">{l.returned_by !== '-' ? l.returned_by : '-'}</td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 text-xs">{l.received_by !== '-' ? l.received_by : '-'}</td>
                        <td className="px-3 py-2.5 text-slate-400 dark:text-slate-500">
                          <ChevronRight size={14}/>
                        </td>
                      </tr>
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 text-right">
            แสดง {logs.length} รายการ
          </div>
        </div>
      )}

      {editLog && (
        <EditReturnModal
          log={editLog}
          auth={auth}
          onClose={() => setEditLog(null)}
          onSaved={() => { setEditLog(null); load() }}
        />
      )}

      {dispositionLog && (
        <DispositionModal
          log={dispositionLog}
          busy={confirmingId === dispositionLog.id}
          onClose={() => setDispositionLog(null)}
          onConfirm={(disp, note) => handleConfirmWithDisposition(dispositionLog.id, disp, note)}
        />
      )}
    </div>
  )
}

// ============================================================
// DispositionModal — staff ตรวจรับ + เลือกผลการดำเนินการ (ADR-0012)
// ============================================================
function DispositionModal({ log, busy, onClose, onConfirm }) {
  const [disp, setDisp] = useState('restock')
  const [note, setNote] = useState('')
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-emerald-600 text-white px-5 py-4 rounded-t-2xl flex items-center gap-2">
          <PackageCheck size={20} />
          <div className="min-w-0">
            <p className="font-bold text-base leading-tight">ตรวจรับ & ดำเนินการ</p>
            <p className="text-emerald-100 text-xs truncate">{log.drug_name} · {Number(log.qty_returned).toLocaleString()} {log.drug_unit && log.drug_unit !== '-' ? log.drug_unit : 'หน่วย'}</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">เลือกผลการดำเนินการ *</p>
            <div className="space-y-2">
              {DISPOSITION_ORDER.map(key => {
                const dm = DISPOSITION_META[key], DIcon = dm.icon, active = disp === key
                return (
                  <button key={key} type="button" onClick={() => setDisp(key)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${active ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 ring-1 ring-emerald-400' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                    <span className={`p-1.5 rounded-lg shrink-0 ${dm.badgeBg} ${dm.badgeText}`}><DIcon size={16} /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{dm.label}</span>
                      <span className="block text-xs text-slate-400 dark:text-slate-500">{dm.desc}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">หมายเหตุ / เหตุผล{disp === 'rejected' ? ' *' : ''}</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder={disp === 'rejected' ? 'ระบุเหตุผลที่ไม่รับคืน...' : 'เพิ่มเติม (ถ้ามี)'}
              className="mt-1 w-full border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} disabled={busy}
            className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
            ยกเลิก
          </button>
          <button
            onClick={() => onConfirm(disp, note.trim() || null)}
            disabled={busy || (disp === 'rejected' && !note.trim())}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
            <CheckCircle size={15} /> {busy ? 'กำลังบันทึก...' : 'ยืนยัน'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// ReturnDetail — หน้ารายละเอียดคำขอคืนยาเต็มจอ (เหมือนใบเบิก)
// คลิกรายการในประวัติ → เข้ามาดู + ตรวจรับ/ดำเนินการ/พิมพ์/แก้ไข ในหน้าเดียว
// ============================================================
function ReturnDetail({ log, isStaff, isAdmin, busy, onBack, onDispose, onEdit, onPrint, onDelete, editModal, dispositionModal }) {
  const [confirmDel, setConfirmDel] = useState(false)
  const st = returnStatus(log), sm = STATUS_META[st], SIcon = sm.icon
  const rb = getReasonBadge(log)
  const dm = log.disposition ? DISPOSITION_META[log.disposition] : null
  const DIcon = dm?.icon
  const isPending = st === 'pending'

  const rows = [
    ['รหัสยา',        log.drug_code && log.drug_code !== '-' ? log.drug_code : null],
    ['ชนิดยา',        log.drug_type && log.drug_type !== '-' ? log.drug_type : null],
    ['Lot',           log.lot && log.lot !== '-' ? log.lot : null],
    ['วันหมดอายุ',    log.exp && log.exp !== '-' ? log.exp : null],
    ['หน่วยงานที่คืน', log.department && log.department !== '-' ? log.department : null],
    ['สาเหตุการคืน',  getReturnLabel(log)],
    ['ผู้คืน',        log.returned_by && log.returned_by !== '-' ? log.returned_by : null],
    ['ผู้รับคืน',      log.received_by && log.received_by !== '-' ? log.received_by : null],
    ['วันที่รับคืน',   log.received_at ? isoToThai(log.received_at.slice(0, 10)) : null],
    ['ผู้ดำเนินการ',   log.disposition_by && log.disposition_by !== '-' ? log.disposition_by : null],
    ['หมายเหตุ',      log.note && log.note !== '-' ? log.note : null],
  ].filter(([, v]) => v != null && v !== '')

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800 -m-4 sm:-m-6">
      {/* Header bar */}
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3 flex items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-sm font-semibold transition-colors">
          <RotateCcw size={15} className="rotate-[135deg]" /> ย้อนกลับ
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-900 dark:text-slate-50 text-base leading-tight truncate">{log.drug_name}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">คืนวันที่ {isoToThai(log.return_date)}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* สรุปสถานะ + จำนวน */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${sm.badgeBg} ${sm.badgeText}`}><SIcon size={12} />{sm.label}</span>
            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${rb.badgeBg} ${rb.badgeText}`}>{rb.label}</span>
            {dm && <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${dm.badgeBg} ${dm.badgeText}`}><DIcon size={12} />{dm.label}</span>}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-violet-700 dark:text-violet-300">{Number(log.qty_returned).toLocaleString()}</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">{log.drug_unit && log.drug_unit !== '-' ? log.drug_unit : 'หน่วย'}</span>
          </div>
          {dm && log.disposition_note && (
            <div className={`flex items-start gap-2 rounded-xl p-2.5 ${dm.badgeBg}`}>
              <DIcon size={15} className={`${dm.badgeText} mt-0.5 shrink-0`} />
              <p className="text-xs text-slate-600 dark:text-slate-300">{log.disposition_note}</p>
            </div>
          )}
        </div>

        {/* ข้อมูลละเอียด */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">ข้อมูลการคืน</p>
          <div className="space-y-1">
            {rows.map(([label, val]) => (
              <div key={label} className="flex justify-between items-start gap-3 py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{label}</span>
                <span className="text-sm text-slate-700 dark:text-slate-200 font-medium text-right min-w-0">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ปุ่มดำเนินการ */}
        <div className="space-y-2">
          {isStaff && isPending && (
            <button onClick={onDispose} disabled={busy}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors">
              <PackageCheck size={16} /> ตรวจรับ & ดำเนินการ
            </button>
          )}
          <button onClick={onPrint}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors">
            <Printer size={15} /> พิมพ์ / PDF
          </button>
          {isAdmin && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onEdit}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60 rounded-xl text-sm font-semibold transition-colors">
                <Pencil size={14} /> แก้ไข
              </button>
              {confirmDel ? (
                <div className="flex items-center gap-1.5">
                  <button onClick={onDelete}
                    className="flex-1 px-3 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors">
                    ยืนยันลบ?
                  </button>
                  <button onClick={() => setConfirmDel(false)}
                    className="p-2.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDel(true)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/70 text-red-600 border border-red-200 dark:border-red-900/60 rounded-xl text-sm font-semibold transition-colors">
                  <Trash2 size={14} /> ลบ
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {editModal}
      {dispositionModal}
    </div>
  )
}
