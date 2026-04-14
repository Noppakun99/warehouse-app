import React, { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft, RotateCcw, Search, CheckCircle,
  AlertCircle, FileText, ChevronDown, ChevronUp, FileDown, Printer,
} from 'lucide-react'
import { fetchReturnLogs, insertReturnLog } from './lib/db'
import { exportToExcel } from './lib/exportExcel'
import { supabase } from './lib/supabase'
import SearchableSelect from './SearchableSelect'

// ============================================================
// Constants
// ============================================================
const RETURN_TYPES = [
  { key: 'ward_return',     label: 'คืนยาจาก Ward',    short: 'คืน Ward',   badgeBg: 'bg-blue-100',   badgeText: 'text-blue-800',   border: 'border-blue-200' },
  { key: 'damaged',         label: 'ยาเสียหาย/แตกหัก', short: 'ยาเสียหาย', badgeBg: 'bg-orange-100', badgeText: 'text-orange-800', border: 'border-orange-200' },
  { key: 'expired_removal', label: 'ตัดยาหมดอายุออก',  short: 'ยาหมดอายุ', badgeBg: 'bg-red-100',    badgeText: 'text-red-800',    border: 'border-red-200' },
  { key: 'vendor_return',   label: 'ส่งคืนบริษัทยา',   short: 'คืนบริษัท', badgeBg: 'bg-purple-100', badgeText: 'text-purple-800', border: 'border-purple-200' },
]
const TYPE_MAP = Object.fromEntries(RETURN_TYPES.map(t => [t.key, t]))

const DEPARTMENTS = [
  'ห้องยา G','ห้องยา 1','ER (ฉุกเฉิน)','IPD (ผู้ป่วยใน)','OPD (ผู้ป่วยนอก)','LR (ห้องคลอด)',
  'ทันตกรรม','แผนไทย','กายภาพ','LAB','X-ray','ห้องทำแผล','งานส่งต่อ','บริหารทั่วไป',
  'กลุ่มงานจิตเวชและยาเสพติด','IPD-หน่วยวัง','IPD-โดม',
  'รพสต.คูคต','รพสต.วัดประยูร','รพ.สามโคก','รพ.เปาโล','รพ.ปทุมเวศ','รพ.ลาดหลุมแก้ว',
]

function isoToThai(iso) {
  if (!iso) return '-'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${Number(y) + 543}`
}

function printReturnLog(r) {
  const typeInfo = TYPE_MAP[r.return_type] || { label: r.return_type || '-' }
  const typeColors = {
    ward_return:     { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' },
    damaged:         { bg: '#FED7AA', text: '#9A3412', border: '#FDBA74' },
    expired_removal: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
    vendor_return:   { bg: '#EDE9FE', text: '#5B21B6', border: '#C4B5FD' },
  }
  const tc = typeColors[r.return_type] || { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' }
  const printDate = isoToThai(r.return_date || new Date().toISOString().slice(0, 10))
  const today = isoToThai(new Date().toISOString().slice(0, 10))

  const win = window.open('', '_blank', 'width=800,height=900')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html lang="th"><head>
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
<div class="badge">${typeInfo.label}</div>

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
  <div class="field"><label>เภสัชกรผู้รับ / บันทึก</label><span>${r.received_by && r.received_by !== '-' ? r.received_by : '-'}</span></div>
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
</body></html>`)
  win.document.close()
}

// ============================================================
// Root
// ============================================================
export default function ReturnApp({ onBack, auth }) {
  const [tab, setTab] = useState('record')

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <header className="bg-gradient-to-r from-violet-600 to-purple-700 text-white shadow-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-xl hover:bg-white/20 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="p-2 bg-white/20 rounded-xl"><RotateCcw size={20} /></div>
          <div>
            <p className="font-bold text-sm leading-tight">ระบบคืนยา / บันทึกยาเสียหาย</p>
            <p className="text-violet-200 text-xs">Return &amp; Write-off Management</p>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 flex gap-1 pb-2">
          {[{ key: 'record', label: 'บันทึกรายการ' }, { key: 'history', label: 'ประวัติ' }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.key ? 'bg-white text-violet-700 shadow-sm' : 'text-violet-200 hover:text-white hover:bg-white/15'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-5">
        {tab === 'record'  && <RecordTab  auth={auth} />}
        {tab === 'history' && <HistoryTab />}
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
    return_date:  today,
    return_type:  'ward_return',
    drug_name:    '',
    drug_code:    '-',
    drug_type:    '-',
    lot:          '-',
    exp:          '-',
    qty_returned: '',
    drug_unit:    '-',
    department:   '',
    returned_by:  '',
    received_by:  auth?.name || '',
    note:         '',
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
    if (!form.drug_name.trim())                        { setError('กรุณากรอกชื่อยา'); return }
    if (!form.qty_returned || parseFloat(form.qty_returned) <= 0) { setError('กรุณากรอกจำนวนที่ถูกต้อง'); return }
    if (form.return_type === 'ward_return' && !form.department)   { setError('กรุณาเลือกหน่วยงานที่คืน'); return }

    setSubmitting(true)
    try {
      await insertReturnLog({
        return_date:  form.return_date,
        drug_name:    form.drug_name.trim(),
        drug_code:    form.drug_code   || '-',
        drug_type:    form.drug_type   || '-',
        lot:          form.lot         || '-',
        exp:          form.exp         || '-',
        qty_returned: parseFloat(form.qty_returned),
        drug_unit:    form.drug_unit   || '-',
        return_type:  form.return_type,
        department:   form.return_type === 'ward_return' ? (form.department || '-') : '-',
        returned_by:  form.returned_by || '-',
        received_by:  form.received_by || '-',
        note:         form.note        || null,
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

      {/* ประเภทการคืน */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">ประเภทการคืน / บันทึก</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {RETURN_TYPES.map(t => (
            <button key={t.key} type="button" onClick={() => set('return_type', t.key)}
              className={`px-3 py-2.5 rounded-xl text-xs font-semibold border-2 transition-all text-center ${
                form.return_type === t.key
                  ? `${t.badgeBg} ${t.badgeText} ${t.border} shadow-sm scale-[1.02]`
                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ข้อมูลยา */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">ข้อมูลยา</p>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">วันที่คืน / บันทึก *</label>
            <input type="date" value={form.return_date} onChange={e => set('return_date', e.target.value)} required
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
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
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">ข้อมูลผู้คืน / ผู้รับ</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {form.return_type === 'ward_return' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">หน่วยงานที่คืน *</label>
              <SearchableSelect value={form.department} onChange={v => set('department', v)}
                options={DEPARTMENTS} placeholder="-- เลือกหน่วยงาน --" />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">ชื่อผู้คืน / ผู้แจ้ง</label>
            <input type="text" value={form.returned_by} onChange={e => set('returned_by', e.target.value)}
              placeholder="ชื่อ-สกุล"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">เภสัชกรผู้รับ / บันทึก</label>
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
        className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm transition-colors shadow-sm">
        {submitting ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
      </button>
    </form>
  )
}

const RETURN_EXCEL_COLS = [
  { header: 'วันที่',          key: 'return_date' },
  { header: 'ประเภท',          value: r => ({ ward_return: 'คืนยาจาก Ward', damaged: 'ยาเสียหาย', expired_removal: 'ตัดยาหมดอายุ', vendor_return: 'ส่งคืนบริษัท' })[r.return_type] || r.return_type },
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
// HistoryTab — ประวัติการคืนยา
// ============================================================
function HistoryTab() {
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [search, setSearch]     = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [expanded, setExpanded] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchReturnLogs({
        dateFrom:   dateFrom   || undefined,
        dateTo:     dateTo     || undefined,
        returnType: filterType !== 'all' ? filterType : undefined,
        drugName:   search.trim() || undefined,
      })
      setLogs(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterType, dateFrom, dateTo])

  const countOf = (key) => key === 'all' ? logs.length : logs.filter(l => l.return_type === key).length

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex gap-2 flex-wrap">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          <span className="self-center text-slate-400 text-sm">–</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
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
            onClick={() => exportToExcel(logs, RETURN_EXCEL_COLS, 'คืนยา', `return_logs_${new Date().toISOString().slice(0,10)}.xlsx`)}
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
          {RETURN_TYPES.map(t => (
            <button key={t.key} onClick={() => setFilterType(t.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                filterType === t.key ? `${t.badgeBg} ${t.badgeText} ${t.border}` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}>
              {t.short} ({countOf(t.key)})
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-center text-slate-400 py-10 text-sm">กำลังโหลด...</p>
      ) : logs.length === 0 ? (
        <div className="text-center text-slate-400 py-16">
          <FileText size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">ไม่พบข้อมูล</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-xs text-white font-bold bg-slate-700 border-b border-slate-600">
                  <th className="px-4 py-2.5 text-left">วันที่</th>
                  <th className="px-4 py-2.5 text-left">ชื่อยา</th>
                  <th className="px-4 py-2.5 text-left">ประเภท</th>
                  <th className="px-4 py-2.5 text-right">จำนวน</th>
                  <th className="px-4 py-2.5 text-left">Lot / Exp</th>
                  <th className="px-4 py-2.5 text-left">หน่วยงาน</th>
                  <th className="px-4 py-2.5 text-left">ผู้คืน / รับ</th>
                  <th className="px-4 py-2.5 text-left w-8"></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => {
                  const t = TYPE_MAP[l.return_type] || { badgeBg: 'bg-slate-100', badgeText: 'text-slate-600', label: l.return_type, short: l.return_type }
                  const isOpen = expanded === l.id
                  return (
                    <React.Fragment key={l.id}>
                      <tr onClick={() => setExpanded(isOpen ? null : l.id)}
                        className={`border-b border-slate-100 cursor-pointer transition-colors ${isOpen ? 'bg-violet-50' : i % 2 === 0 ? 'hover:bg-violet-50' : 'bg-slate-50 hover:bg-violet-50'}`}>
                        <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap font-medium">{isoToThai(l.return_date)}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800 max-w-[200px]">
                          <span className="block truncate">{l.drug_name}</span>
                          {l.drug_code && l.drug_code !== '-' && <span className="text-xs text-slate-400 font-normal">{l.drug_code}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${t.badgeBg} ${t.badgeText}`}>{t.short}</span>
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
                              <button onClick={e => { e.stopPropagation(); printReturnLog(l) }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex-shrink-0">
                                <Printer size={13} /> พิมพ์
                              </button>
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
    </div>
  )
}
