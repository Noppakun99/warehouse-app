import React, { useState, useEffect, useRef } from 'react'
import {
  RotateCcw, Search, CheckCircle,
  AlertCircle, FileText, ChevronDown, ChevronUp, FileDown, Printer,
  Pencil, Trash2, X, MapPin, Pill, UserCheck,
} from 'lucide-react'
import { fetchReturnLogs, insertReturnLog, deleteReturnLog, updateReturnLog } from './lib/db'
import { exportToExcel } from './lib/exportExcel'
import { supabase } from './lib/supabase'
import SearchableSelect from './SearchableSelect'

// ============================================================
// Constants
// ============================================================

// ── ข้อมูลเก่า (legacy) — ใช้แสดง label เมื่อ return_source = null ──
const LEGACY_TYPES = [
  { key: 'ward_return',     label: 'คืนยาจาก Ward',    short: 'คืน Ward',   badgeBg: 'bg-blue-100',   badgeText: 'text-blue-800',   border: 'border-blue-200' },
  { key: 'damaged',         label: 'ยาเสียหาย/แตกหัก', short: 'ยาเสียหาย', badgeBg: 'bg-orange-100', badgeText: 'text-orange-800', border: 'border-orange-200' },
  { key: 'expired_removal', label: 'ตัดยาหมดอายุออก',  short: 'ยาหมดอายุ', badgeBg: 'bg-red-100',    badgeText: 'text-red-800',    border: 'border-red-200' },
  { key: 'vendor_return',   label: 'ส่งคืนบริษัทยา',   short: 'คืนบริษัท', badgeBg: 'bg-purple-100', badgeText: 'text-purple-800', border: 'border-purple-200' },
]
const LEGACY_MAP = Object.fromEntries(LEGACY_TYPES.map(t => [t.key, t]))

// ── ระบบใหม่ 2 ระดับ ──
const RETURN_SOURCES = [
  { key: 'ward',   label: 'หน่วยงาน / Ward',   short: 'Ward',   badgeBg: 'bg-blue-100',   badgeText: 'text-blue-800',   border: 'border-blue-200',   needsDept: true },
  { key: 'or',     label: 'ห้องผ่าตัด',         short: 'ห้องผ่าตัด', badgeBg: 'bg-purple-100', badgeText: 'text-purple-800', border: 'border-purple-200', needsDept: false },
  { key: 'er',     label: 'ห้องฉุกเฉิน',        short: 'ER',     badgeBg: 'bg-red-100',    badgeText: 'text-red-800',    border: 'border-red-200',    needsDept: false },
  { key: 'opd',    label: 'OPD คลินิก',          short: 'OPD',    badgeBg: 'bg-sky-100',    badgeText: 'text-sky-800',    border: 'border-sky-200',    needsDept: false },
  { key: 'vendor', label: 'บริษัทยา / Supplier', short: 'บริษัทยา', badgeBg: 'bg-orange-100', badgeText: 'text-orange-800', border: 'border-orange-200', needsDept: false },
]
const SOURCE_MAP = Object.fromEntries(RETURN_SOURCES.map(s => [s.key, s]))

const RETURN_REASONS = [
  { key: 'leftover',      label: 'ยาเหลือจากการใช้',       short: 'เหลือใช้',   sources: ['ward', 'or', 'er', 'opd'], badgeBg: 'bg-teal-100',   badgeText: 'text-teal-800'   },
  { key: 'over_req',      label: 'เบิกเกินจำนวน',           short: 'เบิกเกิน',   sources: ['ward', 'opd'],             badgeBg: 'bg-cyan-100',   badgeText: 'text-cyan-800'   },
  { key: 'wrong_drug',    label: 'ยาผิดชนิด / ขนาด',       short: 'ผิดชนิด',   sources: ['ward', 'or', 'er', 'opd', 'vendor'], badgeBg: 'bg-amber-100',  badgeText: 'text-amber-800'  },
  { key: 'damaged',       label: 'ยาเสียหาย / แตกหัก',     short: 'ยาเสียหาย', sources: ['ward', 'or', 'er', 'opd', 'vendor'], badgeBg: 'bg-orange-100', badgeText: 'text-orange-800' },
  { key: 'expired',       label: 'ยาหมดอายุ',               short: 'ยาหมดอายุ', sources: ['ward', 'or', 'er', 'opd', 'vendor'], badgeBg: 'bg-red-100',    badgeText: 'text-red-800'    },
  { key: 'recall',        label: 'Lot เรียกคืน (Recall)',   short: 'Recall',     sources: ['vendor'],                  badgeBg: 'bg-rose-100',   badgeText: 'text-rose-800'   },
  { key: 'vendor_return', label: 'ส่งคืนตามสัญญา',         short: 'คืนบริษัท', sources: ['vendor'],                  badgeBg: 'bg-purple-100', badgeText: 'text-purple-800' },
]
const REASON_MAP = Object.fromEntries(RETURN_REASONS.map(r => [r.key, r]))

// ── helper: คืน badge info สำหรับแสดงผล ──
function getReturnBadge(log) {
  if (!log.return_source) return LEGACY_MAP[log.return_type] || { label: log.return_type || '-', badgeBg: 'bg-slate-100', badgeText: 'text-slate-600', border: 'border-slate-200' }
  const src = SOURCE_MAP[log.return_source]
  return src || { label: log.return_source, badgeBg: 'bg-slate-100', badgeText: 'text-slate-600', border: 'border-slate-200' }
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

function isoToThai(iso) {
  if (!iso) return '-'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${Number(y) + 543}`
}

function IsoDateInput({ value, onChange, className = '', ring = 'focus-within:ring-violet-400' }) {
  const display = iso => { if (!iso) return null; const [y,m,d] = iso.split('-'); return `${d}/${m}/${Number(y)+543}`; }
  return (
    <div className={`relative flex items-center bg-white border border-slate-300 rounded-xl focus-within:ring-2 ${ring} ${className}`}>
      <span className={`px-3 py-2 text-sm w-full select-none pointer-events-none ${value ? 'text-slate-800' : 'text-slate-400'}`}>{display(value) || 'dd/mm/yyyy'}</span>
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 w-full cursor-pointer" />
    </div>
  )
}

function printReturnLog(r) {
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

  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<title>ใบคืนยา ${printDate}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #1e293b; background: #fff; padding: 28px 32px; }
  h1 { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 2px; }
  .sub { font-size: 11px; color: #64748b; margin-bottom: 14px; }
  .badge { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 12px; font-weight: 700;
    background: ${tc.bg}; color: ${tc.text}; border: 1px solid ${tc.border}; margin-bottom: 16px; }
  .divider { border: none; border-top: 1.5px solid #e2e8f0; margin: 12px 0; }
  .section-title { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 10px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px 20px; }
  .field { margin-bottom: 6px; }
  .field label { font-size: 10px; color: #94a3b8; font-weight: 600; display: block; margin-bottom: 1px; }
  .field span { font-size: 13px; color: #1e293b; font-weight: 600; }
  .note-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px;
    font-size: 12px; color: #475569; min-height: 36px; }
  /* Signature section */
  .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 28px; }
  .sig-box { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; background: #f8fafc; }
  .sig-box .sig-title { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;
    letter-spacing: .05em; margin-bottom: 10px; text-align: center; }
  .sig-name { font-size: 13px; font-weight: 600; color: #1e293b; text-align: center;
    border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; min-height: 22px; }
  .sig-line { margin-top: 40px; border-bottom: 1px solid #94a3b8; }
  .sig-label { font-size: 11px; color: #64748b; text-align: center; margin-top: 4px; }
  .sig-date { font-size: 11px; color: #64748b; margin-top: 10px; }
  .sig-date span { display: inline-block; border-bottom: 1px solid #94a3b8; min-width: 100px; margin-left: 6px; }
  @media print {
    body { padding: 10mm 12mm; }
    button { display: none !important; }
  }
</style>
</head><body>
<button onclick="window.print()" style="position:fixed;top:14px;right:14px;background:#5B21B6;color:#fff;border:none;
  padding:8px 18px;border-radius:8px;font-family:Sarabun,sans-serif;font-size:13px;cursor:pointer;font-weight:600;">
  พิมพ์
</button>

<h1>ใบคืนยา / บันทึกยาเสียหาย</h1>
<p class="sub">Return &amp; Write-off Record</p>
<div class="badge">${badgeLabel}</div>${subLabel ? `<div style="font-size:11px;color:#64748b;margin-bottom:14px;margin-top:-10px;">สาเหตุ: ${subLabel}</div>` : ''}

<hr class="divider"/>

<p class="section-title">ข้อมูลยา</p>
<div class="grid2" style="margin-bottom:10px;">
  <div class="field"><label>ชื่อยา</label><span>${r.drug_name || '-'}</span></div>
  <div class="field"><label>รหัสยา</label><span>${r.drug_code || '-'}</span></div>
</div>
<div class="grid3" style="margin-bottom:10px;">
  <div class="field"><label>ชนิดยา</label><span>${r.drug_type || '-'}</span></div>
  <div class="field"><label>Lot Number</label><span>${r.lot || '-'}</span></div>
  <div class="field"><label>วันหมดอายุ (Exp)</label><span>${r.exp || '-'}</span></div>
</div>
<div class="grid3">
  <div class="field"><label>จำนวนคืน</label><span>${Number(r.qty_returned || 0).toLocaleString()}</span></div>
  <div class="field"><label>หน่วย</label><span>${r.drug_unit || '-'}</span></div>
  <div class="field"><label>วันที่คืน</label><span>${printDate}</span></div>
</div>

<hr class="divider"/>

<p class="section-title">ข้อมูลผู้คืน / ผู้รับ</p>
<div class="grid3" style="margin-bottom:10px;">
  <div class="field"><label>หน่วยงานที่คืน</label><span>${r.department && r.department !== '-' ? r.department : '-'}</span></div>
  <div class="field"><label>ผู้คืน / ผู้แจ้ง</label><span>${r.returned_by && r.returned_by !== '-' ? r.returned_by : '-'}</span></div>
  <div class="field"><label>เจ้าหน้าที่ผู้รับคืน / บันทึก</label><span>${r.received_by && r.received_by !== '-' ? r.received_by : '-'}</span></div>
</div>
${r.note ? `<p class="section-title" style="margin-top:6px;">หมายเหตุ</p><div class="note-box">${r.note}</div>` : ''}

<!-- ลายเซ็น -->
<div class="sig-row">
  <div class="sig-box">
    <p class="sig-title">ผู้คืนยา</p>
    <div class="sig-name">${r.returned_by && r.returned_by !== '-' ? r.returned_by : ''}</div>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ ผู้คืนยา</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
  <div class="sig-box">
    <p class="sig-title">ผู้รับยา</p>
    <div class="sig-name">${r.received_by && r.received_by !== '-' ? r.received_by : ''}</div>
    <div class="sig-line"></div>
    <p class="sig-label">ลายมือชื่อ ผู้รับยา</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
</div>

<p style="font-size:10px;color:#94a3b8;text-align:right;margin-top:18px;">พิมพ์วันที่ ${today}</p>
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
export default function ReturnApp({ onRefresh, auth }) {
  const [tab, setTab] = useState('record')

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        {/* sidebar (AppShell) คุม navigation; ปุ่ม back เดิมเอาออก */}
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="p-2 bg-violet-100 text-violet-600 rounded-xl shrink-0"><RotateCcw size={20} /></div>
          <button onClick={onRefresh} className="text-left hover:opacity-70 transition-opacity" title="คลิกเพื่อโหลดใหม่">
            <p className="font-bold text-sm leading-tight text-slate-800">ระบบคืนยา / บันทึกยาเสียหาย</p>
            <p className="text-slate-400 text-xs">Return &amp; Write-off Management</p>
          </button>
        </div>
        <div className="max-w-4xl mx-auto px-4 flex gap-2 pb-2.5">
          {[{ key: 'record', label: 'บันทึกรายการ' }, { key: 'history', label: 'ประวัติ' }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                tab === t.key ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 bg-slate-100 hover:bg-slate-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-5">
        {tab === 'record'  && <RecordTab  auth={auth} />}
        {tab === 'history' && <HistoryTab auth={auth} />}
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
    return_source: 'ward',
    return_type:   'leftover',
    drug_name:     '',
    drug_code:     '-',
    drug_type:     '-',
    lot:           '-',
    exp:           '-',
    qty_returned:  '',
    drug_unit:     '-',
    department:    '',
    returned_by:   '',
    received_by:   auth?.name || '',
    note:          '',
  })

  const [form, setForm]           = useState(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)
  const [lastSubmitted, setLastSubmitted] = useState(null)
  const [drugNames, setDrugNames] = useState([])
  const [drugSearch, setDrugSearch] = useState('')
  const [showDrug, setShowDrug] = useState(false)
  const drugRef = useRef(null)

  // โหลดชื่อยาจาก inventory
  useEffect(() => {
    if (!supabase) return
    supabase.from('inventory').select('name, code, type, unit').then(({ data }) => {
      if (!data) return
      const seen = new Set()
      const names = []
      data.forEach(r => {
        if (r.name && !seen.has(r.name)) {
          seen.add(r.name)
          names.push({ name: r.name, code: r.code, type: r.type, unit: r.unit })
        }
      })
      setDrugNames(names.sort((a, b) => a.name.localeCompare(b.name, 'th')))
    })
  }, [])

  useEffect(() => {
    const handle = (e) => { if (drugRef.current && !drugRef.current.contains(e.target)) setShowDrug(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const filteredDrugs = drugSearch.trim().length >= 1
    ? drugNames.filter(d => d.name.toLowerCase().includes(drugSearch.toLowerCase())).slice(0, 10)
    : []

  const selectDrug = (d) => {
    setDrugSearch(d.name)
    setForm(f => ({ ...f, drug_name: d.name, drug_code: d.code || '-', drug_type: d.type || '-', drug_unit: d.unit || '-' }))
    setShowDrug(false)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.department)                                         { setError('กรุณาเลือกหน่วยงาน / แหล่งที่คืน'); return }
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
        received_by:   form.received_by || '-',
        note:          form.note        || null,
      })
      setLastSubmitted({ ...form })
      setSuccess(true)
      setForm(emptyForm())
      setDrugSearch('')
      setTimeout(() => setSuccess(false), 8000)
    } catch (err) {
      setError('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {success && (
        <div className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
            <CheckCircle size={16} /> บันทึกสำเร็จ
          </div>
          {lastSubmitted && (
            <button onClick={() => printReturnLog(lastSubmitted)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold transition-colors">
              <Printer size={13} /> พิมพ์ใบคืนยา
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* ประเภทการคืน — 2 ระดับ */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-violet-100 text-violet-600 shrink-0"><MapPin size={15} /></div>
          <p className="text-sm font-bold text-slate-700">ประเภทการคืน</p>
          <span className="ml-auto text-[10px] font-bold text-violet-400 bg-violet-50 rounded-full w-5 h-5 flex items-center justify-center">1</span>
        </div>
        {/* ระดับ 1: คืนจากไหน — dropdown หน่วยงาน */}
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2.5">คืนจากไหน *</p>
          <SearchableSelect
            value={form.department}
            onChange={v => {
              const isVendor = v === VENDOR_LABEL
              const newSource = isVendor ? 'vendor' : 'ward'
              const validReasons = RETURN_REASONS.filter(r => r.sources.includes(newSource))
              set('department', v)
              set('return_source', newSource)
              set('return_type', validReasons[0]?.key || '')
            }}
            options={SOURCE_DEPARTMENTS}
            placeholder="-- เลือกหน่วยงาน / แหล่งที่คืน --"
          />
        </div>
        {/* ระดับ 2: สาเหตุ */}
        {form.department && (() => {
          const validReasons = RETURN_REASONS.filter(r => r.sources.includes(form.return_source))
          return validReasons.length > 0 ? (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2.5">สาเหตุการคืน *</p>
              <select value={form.return_type} onChange={e => set('return_type', e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 appearance-none">
                {validReasons.map(r => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>
          ) : null
        })()}
      </div>

      {/* ข้อมูลยา */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-sky-100 text-sky-600 shrink-0"><Pill size={15} /></div>
          <p className="text-sm font-bold text-slate-700">ข้อมูลยา</p>
          <span className="ml-auto text-[10px] font-bold text-sky-400 bg-sky-50 rounded-full w-5 h-5 flex items-center justify-center">2</span>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">วันที่คืน / บันทึก *</label>
            <IsoDateInput value={form.return_date} onChange={v => set('return_date', v)} className="w-full" />
          </div>

          <div ref={drugRef} className="relative">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">ชื่อยา *</label>
            <input type="text" value={drugSearch || form.drug_name}
              onChange={e => { setDrugSearch(e.target.value); set('drug_name', e.target.value); setShowDrug(true) }}
              onFocus={() => { if ((drugSearch || form.drug_name).trim()) setShowDrug(true) }}
              placeholder="พิมพ์ชื่อยา..." required
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            {showDrug && filteredDrugs.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden max-h-44 overflow-y-auto">
                {filteredDrugs.map(d => (
                  <button key={d.name} type="button" onMouseDown={e => { e.preventDefault(); selectDrug(d) }}
                    className="w-full text-left px-3 py-2 hover:bg-violet-50 text-sm border-b border-slate-100 last:border-0">
                    <span className="font-medium text-slate-800">{d.name}</span>
                    {d.type && d.type !== '-' && <span className="ml-2 text-xs text-slate-400">{d.type}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">รหัสยา</label>
            <input type="text" value={form.drug_code === '-' ? '' : form.drug_code}
              onChange={e => set('drug_code', e.target.value || '-')} placeholder="-"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Lot</label>
            <input type="text" value={form.lot === '-' ? '' : form.lot}
              onChange={e => set('lot', e.target.value || '-')} placeholder="-"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Exp</label>
            <input type="text" value={form.exp === '-' ? '' : form.exp}
              onChange={e => set('exp', e.target.value || '-')} placeholder="DD/MM/YYYY"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">จำนวนคืน *</label>
            <input type="number" min="0.01" step="0.01" value={form.qty_returned}
              onChange={e => set('qty_returned', e.target.value)} placeholder="0" required
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">หน่วย</label>
            <input type="text" value={form.drug_unit === '-' ? '' : form.drug_unit}
              onChange={e => set('drug_unit', e.target.value || '-')} placeholder="เม็ด, ขวด..."
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">ชนิดยา</label>
            <input type="text" value={form.drug_type === '-' ? '' : form.drug_type}
              onChange={e => set('drug_type', e.target.value || '-')} placeholder="Tablet, Syrup..."
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
        </div>
      </div>

      {/* ข้อมูลผู้คืน */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-600 shrink-0"><UserCheck size={15} /></div>
          <p className="text-sm font-bold text-slate-700">ข้อมูลผู้คืน / ผู้รับ</p>
          <span className="ml-auto text-[10px] font-bold text-emerald-400 bg-emerald-50 rounded-full w-5 h-5 flex items-center justify-center">3</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">ชื่อผู้คืน / ผู้แจ้ง</label>
            <input type="text" value={form.returned_by} onChange={e => set('returned_by', e.target.value)}
              placeholder="ชื่อ-สกุล"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">เจ้าหน้าที่ผู้รับคืน / บันทึก</label>
            <input type="text" value={form.received_by} onChange={e => set('received_by', e.target.value)}
              placeholder="ชื่อ-สกุล"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">หมายเหตุ</label>
          <textarea value={form.note} onChange={e => set('note', e.target.value)}
            placeholder="รายละเอียดเพิ่มเติม..." rows={2}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none" />
        </div>
      </div>

      <button type="submit" disabled={submitting}
        className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm transition-colors shadow-sm">
        <CheckCircle size={16} /> {submitting ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
      </button>
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
  { header: 'ผู้คืน',          key: 'returned_by' },
  { header: 'ผู้รับ',          key: 'received_by' },
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
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      <input type={type} value={form[key]} onChange={e => set(key, e.target.value)}
        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400" />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-violet-50 flex items-center gap-3 shrink-0">
          <Pencil size={18} className="text-violet-600" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-violet-800">แก้ไขรายการ</p>
            <p className="text-xs text-slate-500 truncate">{log.drug_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {field('วันที่', 'return_date', 'date')}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">ประเภท</label>
              <select value={form.return_type} onChange={e => set('return_type', e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white">
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
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">หมายเหตุ</label>
            <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none" />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="px-4 pb-5 pt-3 border-t border-slate-100 flex gap-2 shrink-0">
          <button onClick={onClose} disabled={saving}
            className="flex-1 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl py-2.5 font-medium text-sm transition-colors">
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
function HistoryTab({ auth = {} }) {
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [search, setSearch]     = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [expanded, setExpanded] = useState(null)
  const [isMobile, setIsMobile]     = useState(() => window.innerWidth < 768)
  const [mobileDetail, setMobileDetail] = useState(null)
  const [editLog, setEditLog]       = useState(null)   // log object กำลัง edit
  const [deletingId, setDeletingId] = useState(null)   // id รอ confirm ลบ
  const isAdmin = auth?.role === 'admin'

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      // แยก filter: key ใน RETURN_SOURCES → returnSource, อื่น → returnType (legacy)
      const srcKeys = new Set(RETURN_SOURCES.map(s => s.key))
      const data = await fetchReturnLogs({
        dateFrom:     dateFrom   || undefined,
        dateTo:       dateTo     || undefined,
        returnSource: filterType !== 'all' && srcKeys.has(filterType) ? filterType : undefined,
        returnType:   filterType !== 'all' && !srcKeys.has(filterType) ? filterType : undefined,
        drugName:     search.trim() || undefined,
      })
      setLogs(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterType, dateFrom, dateTo])

  const countOf = (key) => {
    if (key === 'all') return logs.length
    const srcKeys = new Set(RETURN_SOURCES.map(s => s.key))
    if (srcKeys.has(key)) {
      // แท็บ source: นับทั้งข้อมูลใหม่ (return_source) และ legacy mapping
      if (key === 'ward')   return logs.filter(l => l.return_source === 'ward' || (!l.return_source && l.return_type === 'ward_return')).length
      if (key === 'vendor') return logs.filter(l => l.return_source === 'vendor' || (!l.return_source && l.return_type === 'vendor_return')).length
      return logs.filter(l => l.return_source === key).length
    }
    // legacy key
    return logs.filter(l => l.return_type === key).length
  }

  const handleDelete = async (id) => {
    try {
      await deleteReturnLog(id, auth)
      setDeletingId(null)
      setMobileDetail(null)
      load()
    } catch (e) { console.error(e) }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex gap-2 flex-wrap">
          <IsoDateInput value={dateFrom} onChange={setDateFrom} />
          <span className="self-center text-slate-400 text-sm">–</span>
          <IsoDateInput value={dateTo} onChange={setDateTo} />
          <div className="flex-1 min-w-[160px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load()}
              placeholder="ค้นหาชื่อยา... (Enter)"
              className="w-full border border-slate-300 rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
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

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterType('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${filterType === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            ทั้งหมด ({countOf('all')})
          </button>
          {RETURN_SOURCES.map(s => (
            <button key={s.key} onClick={() => setFilterType(s.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                filterType === s.key ? `${s.badgeBg} ${s.badgeText} ${s.border}` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}>
              {s.short} ({countOf(s.key)})
            </button>
          ))}
        </div>
      </div>

      {/* ── Mobile bottom sheet detail ── */}
      {mobileDetail && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setMobileDetail(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 mb-1" />
            <div className="px-4 pb-3 border-b border-slate-100">
              <p className="font-bold text-slate-900 text-base leading-tight">{mobileDetail.drug_name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{mobileDetail.drug_code && mobileDetail.drug_code !== '-' ? mobileDetail.drug_code + ' · ' : ''}{isoToThai(mobileDetail.return_date)}</p>
            </div>
            <div className="p-4 space-y-3">
              {(() => {
                const b = getReturnBadge(mobileDetail)
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-violet-50 rounded-xl p-2.5 text-center col-span-1">
                      <p className="text-lg font-bold text-violet-700">{Number(mobileDetail.qty_returned).toLocaleString()}</p>
                      <p className="text-[10px] text-violet-500">{mobileDetail.drug_unit && mobileDetail.drug_unit !== '-' ? mobileDetail.drug_unit : 'หน่วย'}</p>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-1">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${b.badgeBg} ${b.badgeText}`}>{b.label}</span>
                      {mobileDetail.return_source && REASON_MAP[mobileDetail.return_type] && (
                        <span className="text-[10px] text-slate-500">{REASON_MAP[mobileDetail.return_type].label}</span>
                      )}
                    </div>
                  </div>
                )
              })()}
              <div className="space-y-2">
                {[
                  ['ชนิดยา',     mobileDetail.drug_type],
                  ['Lot',        mobileDetail.lot !== '-' ? mobileDetail.lot : null],
                  ['Exp',        mobileDetail.exp !== '-' ? mobileDetail.exp : null],
                  ['หน่วยงาน',   mobileDetail.department !== '-' ? mobileDetail.department : null],
                  ['ผู้คืน',     mobileDetail.returned_by !== '-' ? mobileDetail.returned_by : null],
                  ['ผู้รับ',     mobileDetail.received_by !== '-' ? mobileDetail.received_by : null],
                  ['หมายเหตุ',   mobileDetail.note],
                ].filter(([, val]) => val != null && val !== '').map(([label, val]) => (
                  <div key={label} className="flex justify-between items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
                    <span className="text-xs text-slate-400 shrink-0">{label}</span>
                    <span className="text-sm text-slate-700 font-medium text-right">{val}</span>
                  </div>
                ))}
              </div>
              <button onClick={e => { e.stopPropagation(); printReturnLog(mobileDetail); setMobileDetail(null) }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors">
                <Printer size={15} /> พิมพ์
              </button>
              {isAdmin && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={e => { e.stopPropagation(); setEditLog(mobileDetail); setMobileDetail(null) }}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-amber-50 border border-amber-300 text-amber-700 rounded-xl text-sm font-semibold transition-colors">
                    <Pencil size={15}/> แก้ไข
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleDelete(mobileDetail.id) }}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-semibold transition-colors">
                    <Trash2 size={15}/> ลบ
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-center text-slate-400 py-10 text-sm">กำลังโหลด...</p>
      ) : logs.length === 0 ? (
        <div className="text-center text-slate-400 py-16">
          <FileText size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">ไม่พบข้อมูล</p>
        </div>
      ) : isMobile ? (
        <div className="space-y-2">
          {logs.map((l) => {
            const b = getReturnBadge(l)
            return (
              <div key={l.id} onClick={() => setMobileDetail(l)}
                className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm active:bg-violet-50 transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate text-sm">{l.drug_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{isoToThai(l.return_date)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-violet-700">{Number(l.qty_returned).toLocaleString()}</p>
                    {l.drug_unit && l.drug_unit !== '-' && <p className="text-[10px] text-slate-400">{l.drug_unit}</p>}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${b.badgeBg} ${b.badgeText}`}>{b.label}</span>
                    {l.return_source && REASON_MAP[l.return_type] && (
                      <span className="text-[10px] text-slate-400 truncate">{REASON_MAP[l.return_type].short}</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 truncate ml-2 shrink-0">{l.department !== '-' ? l.department : ''}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-xs text-slate-500 font-semibold bg-slate-50 border-b border-slate-200 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">วันที่</th>
                  <th className="px-4 py-3 text-left">ชื่อยา</th>
                  <th className="px-4 py-3 text-left">ประเภท</th>
                  <th className="px-4 py-3 text-right">จำนวน</th>
                  <th className="px-4 py-3 text-left">Lot / Exp</th>
                  <th className="px-4 py-3 text-left">หน่วยงาน</th>
                  <th className="px-4 py-3 text-left">ผู้คืน / รับ</th>
                  <th className="px-4 py-3 text-left w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => {
                  const b = getReturnBadge(l)
                  const isOpen = expanded === l.id
                  return (
                    <React.Fragment key={l.id}>
                      <tr onClick={() => setExpanded(isOpen ? null : l.id)}
                        className={`cursor-pointer transition-colors ${isOpen ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                        <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap font-medium">{isoToThai(l.return_date)}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800 max-w-[200px]">
                          <span className="block truncate">{l.drug_name}</span>
                          {l.drug_code && l.drug_code !== '-' && <span className="text-xs text-slate-400 font-normal">{l.drug_code}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${b.badgeBg} ${b.badgeText}`}>{b.label}</span>
                          {l.return_source && REASON_MAP[l.return_type] && (
                            <div className="text-[10px] text-slate-400 mt-0.5">{REASON_MAP[l.return_type].label}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-violet-700">
                          {Number(l.qty_returned).toLocaleString()}
                          {l.drug_unit && l.drug_unit !== '-' && <span className="text-xs font-normal text-slate-500 ml-1">{l.drug_unit}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs">
                          {l.lot !== '-' && <div>Lot: {l.lot}</div>}
                          {l.exp !== '-' && <div>Exp: {l.exp}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 text-xs">{l.department !== '-' ? l.department : '-'}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs">
                          {l.returned_by !== '-' && <div>คืน: {l.returned_by}</div>}
                          {l.received_by !== '-' && <div>รับ: {l.received_by}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">
                          {isOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-violet-50 border-b border-violet-100">
                          <td colSpan={8} className="px-6 py-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-600 flex-1">
                                <div><span className="font-semibold text-slate-500">ชนิดยา:</span> {l.drug_type || '-'}</div>
                                <div><span className="font-semibold text-slate-500">Lot:</span> {l.lot || '-'}</div>
                                <div><span className="font-semibold text-slate-500">Exp:</span> {l.exp || '-'}</div>
                                <div><span className="font-semibold text-slate-500">หมายเหตุ:</span> {l.note || '-'}</div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button onClick={e => { e.stopPropagation(); printReturnLog(l) }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
                                  <Printer size={13} /> พิมพ์
                                </button>
                                {isAdmin && (<>
                                  <button onClick={e => { e.stopPropagation(); setEditLog(l); setDeletingId(null) }}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
                                    <Pencil size={12}/> แก้ไข
                                  </button>
                                  {deletingId === l.id ? (
                                    <div className="flex items-center gap-1">
                                      <button onClick={e => { e.stopPropagation(); handleDelete(l.id) }}
                                        className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
                                        ยืนยัน?
                                      </button>
                                      <button onClick={e => { e.stopPropagation(); setDeletingId(null) }}
                                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
                                        <X size={13}/>
                                      </button>
                                    </div>
                                  ) : (
                                    <button onClick={e => { e.stopPropagation(); setDeletingId(l.id) }}
                                      className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
                                      <Trash2 size={12}/> ลบ
                                    </button>
                                  )}
                                </>)}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 text-right">
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
    </div>
  )
}
