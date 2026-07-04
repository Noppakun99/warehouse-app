import React, { useState, useEffect } from 'react'
import {
  ClipboardCheck, Plus, X, Printer, Save, CheckCircle, AlertTriangle,
  ChevronDown, ChevronUp, Search, Package, Pencil, Trash2,
} from 'lucide-react'
import {
  fetchInventoryNameCodeMap, fetchLotsForCount, createStockCount,
  fetchStockCountSessions, fetchStockCountItems, fetchInventoryLocations,
  updateStockCountItem, deleteStockCountSession,
} from './lib/db'
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

// ปุ่ม "ตรง" ใต้แต่ละช่อง — เติมค่าตามระบบ (autofill รายช่อง) / กดซ้ำ = ล้าง
function FieldTick({ active, onClick }) {
  return (
    <button type="button" onClick={onClick}
      title={active ? 'ตรงระบบ (กดเพื่อล้าง)' : 'เติมค่าตามระบบ'}
      className={`mt-1 mx-auto flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
        active ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'}`}>
      <CheckCircle size={11} /> ตรง
    </button>
  )
}
// แสดงคงเหลือเป็น "จำนวน × หน่วย" (เช่น 2 × 1000เม็ด) — unit ฝัง packsize ไว้แล้ว
const qtyUnit = (qty, unit) => `${toNum(qty)} × ${unit || '-'}`

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
  if (win) setTimeout(() => URL.revokeObjectURL(url), 30000)
  else URL.revokeObjectURL(url)
}

// ============================================================
// Root
// ============================================================
export default function StockCountApp({ onRefresh, auth, onGoBack, canGoBack }) {
  const [tab, setTab] = useState('count')
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl shrink-0"><ClipboardCheck size={20} /></div>
            <button onClick={onRefresh} className="text-left hover:opacity-70 transition-opacity" title="คลิกเพื่อโหลดใหม่">
              <p className="font-bold text-sm leading-tight text-slate-800">ตรวจนับคงคลัง</p>
              <p className="text-slate-400 text-xs">Stock Count / Spot Check</p>
            </button>
          </div>
          <div className="flex gap-2">
            {[{ key: 'count', label: 'ตรวจนับ' }, { key: 'history', label: 'ประวัติ' }].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  tab === t.key ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 bg-slate-100 hover:bg-slate-200'
                }`}>
                {t.label}
              </button>
            ))}
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
function CountTab({ auth }) {
  const today = new Date().toISOString().slice(0, 10)
  const [nameMap, setNameMap] = useState({ names: [], byName: {}, options: [] })
  const [pickName, setPickName] = useState('')
  const [lines, setLines] = useState([])       // บรรทัดนับ (1 ต่อ code+lot)
  const [addedCodes, setAddedCodes] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)
  const [locations, setLocations] = useState([])

  useEffect(() => {
    fetchInventoryNameCodeMap().then(m =>
      setNameMap({ ...m, options: (m.names || []).map(name => ({ name, type: m.typeByName?.[name] || '' })) }))
    fetchInventoryLocations().then(setLocations)
  }, [])

  const addDrug = async (name) => {
    const code = nameMap.byName[name]
    if (!code || addedCodes.has(code)) { setPickName(''); return }
    setLoading(true)
    try {
      const lots = await fetchLotsForCount([code])
      const newLines = lots.map(l => ({
        ...l, counted_qty: '', counted_exp: '', counted_location: '', item_note: '',
      }))
      setLines(prev => [...prev, ...newLines])
      setAddedCodes(prev => new Set(prev).add(code))
    } finally { setLoading(false); setPickName('') }
  }

  const updateLine = (idx, field, val) =>
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l))

  // ค่าที่ถือว่า "ตรงระบบ" ของแต่ละช่อง
  const sysVal = (l, field) =>
    field === 'counted_qty' ? String(toNum(l.system_qty))
      : field === 'counted_exp' ? (l.system_exp || '')
      : (l.system_location || '')

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

  // กดทีเดียว = ตรงทั้งหมด (เติมนับได้/ที่เก็บ/exp = ค่าระบบ); กดซ้ำ = ล้าง (toggle)
  const markLineAllMatch = (idx) =>
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const isAll = lineMatch(l).all
      return isAll
        ? { ...l, counted_qty: '', counted_exp: '', counted_location: '', _expCustom: false }
        : { ...l, counted_qty: String(toNum(l.system_qty)), counted_exp: l.system_exp || '', counted_location: l.system_location || '', _expCustom: false }
    }))

  const removeLine = (idx) => setLines(prev => prev.filter((_, i) => i !== idx))

  const lineMatch = (l) => {
    const cnt = l.counted_qty === '' ? null : toNum(l.counted_qty)
    const qtyOk = cnt != null && cnt - toNum(l.system_qty) === 0
    const expOk = !l.counted_exp || l.counted_exp.trim() === String(l.system_exp || '').trim()
    const locOk = !l.counted_location || l.counted_location.trim() === String(l.system_location || '').trim()
    return { qtyOk, expOk, locOk, all: qtyOk && expOk && locOk, counted: cnt != null }
  }

  const handleSave = async () => {
    if (!lines.length) return
    setSaving(true)
    try {
      const res = await createStockCount(
        { counted_at: today, note, status: 'done' },
        lines, auth,
      )
      setSaved(res)
      setLines([]); setAddedCodes(new Set()); setNote('')
    } catch (e) {
      alert('บันทึกไม่สำเร็จ: ' + (e?.message || e))
    } finally { setSaving(false) }
  }

  const counterName = auth?.name || auth?.username || '-'

  return (
    <div className="space-y-4">
      {saved && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle size={18} />
          บันทึกรอบตรวจนับแล้ว ({saved.mismatches} รายการไม่ตรง)
          <button onClick={() => setSaved(null)} className="ml-auto text-emerald-600 hover:text-emerald-800"><X size={16} /></button>
        </div>
      )}

      {/* เลือกยา */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
          <Search size={15} /> เลือกรหัสยาที่จะตรวจนับ (ทีละตัว)
        </label>
        <DrugSearchBar
          value={pickName}
          onChange={setPickName}
          onSelect={(name) => { addDrug(name) }}
          options={nameMap.options}
          placeholder="พิมพ์ชื่อยาเพื่อเพิ่ม..."
          ringClass="focus:ring-emerald-400"
          hoverClass="hover:bg-emerald-50"
          maxResults={10}
        />
        {loading && <p className="text-xs text-slate-400 mt-2">กำลังโหลด lot...</p>}
      </div>

      {/* ตารางนับ */}
      {lines.length > 0 ? (
        <>
          {/* desktop */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[22%]" /><col className="w-[8%]" /><col className="w-[18%]" />
                <col className="w-[16%]" /><col className="w-[16%]" /><col className="w-[16%]" />
                <col className="w-[7%]" /><col className="w-[7%]" />
              </colgroup>
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">รายการยา</th>
                  <th className="text-center px-2 py-2 font-semibold">Lot</th>
                  <th className="text-center px-2 py-2 font-semibold">ระบบ (คงเหลือ/ที่เก็บ/exp)</th>
                  <th className="text-center px-2 py-2 font-semibold">นับได้</th>
                  <th className="text-center px-2 py-2 font-semibold">ที่เก็บจริง</th>
                  <th className="text-center px-2 py-2 font-semibold">exp จริง</th>
                  <th className="text-center px-2 py-2 font-semibold">ตรงหมด</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const m = lineMatch(l)
                  const expCustom = !!l._expCustom
                  return (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2 align-top">
                        <p className="font-medium text-slate-800 truncate">{l.name}</p>
                        <p className="text-xs text-slate-400">{l.code}</p>
                        <input type="text" value={l.item_note} placeholder="+ หมายเหตุรายการนี้"
                          onChange={e => updateLine(i, 'item_note', e.target.value)}
                          className="w-full mt-1 px-2 py-1 border border-slate-200 rounded-lg text-xs placeholder-slate-300 focus:border-slate-300 focus:ring-1 focus:ring-emerald-200" />
                      </td>
                      <td className="text-center px-2 py-2">{l.lot}</td>
                      <td className="text-center px-2 py-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">{qtyUnit(l.system_qty, l.unit)}</span><br />
                        {l.system_location}<br />{l.system_exp}
                      </td>
                      {/* นับได้ */}
                      <td className="px-2 py-2 align-top">
                        <div className="flex items-center justify-center gap-1">
                          <input type="number" inputMode="decimal" value={l.counted_qty}
                            onChange={e => updateLine(i, 'counted_qty', e.target.value)}
                            className={`w-16 px-2 py-1 border rounded-lg text-center ${m.counted && !m.qtyOk ? 'border-red-400 bg-red-50' : 'border-slate-300'}`} />
                          <span className="text-xs text-slate-400 whitespace-nowrap">× {l.unit}</span>
                        </div>
                        <FieldTick active={m.counted && m.qtyOk} onClick={() => toggleField(i, 'counted_qty')} />
                      </td>
                      {/* ที่เก็บจริง */}
                      <td className="px-2 py-2 align-top">
                        <select value={l.counted_location}
                          onChange={e => updateLine(i, 'counted_location', e.target.value)}
                          className={`w-full px-2 py-1 border rounded-lg text-center text-xs ${l.counted_location && !m.locOk ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}>
                          <option value="">— ที่เก็บจริง —</option>
                          {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                        </select>
                        <FieldTick active={!!l.counted_location && m.locOk} onClick={() => toggleField(i, 'counted_location')} />
                      </td>
                      {/* exp จริง — dropdown (ค่าระบบ / อื่นๆ→พิมพ์เอง) */}
                      <td className="px-2 py-2 align-top">
                        <select value={expCustom ? '__custom__' : l.counted_exp}
                          onChange={e => pickExp(i, e.target.value)}
                          className={`w-full px-2 py-1 border rounded-lg text-center text-xs ${l.counted_exp && !m.expOk ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}>
                          <option value="">— exp จริง —</option>
                          {(l.system_exp && l.system_exp !== '-') && <option value={l.system_exp}>{l.system_exp} (ตามระบบ)</option>}
                          <option value="__custom__">อื่นๆ (พิมพ์เอง)</option>
                        </select>
                        {expCustom && (
                          <input type="text" autoFocus value={l.counted_exp} placeholder="เช่น 3/12/2028"
                            onChange={e => updateLine(i, 'counted_exp', e.target.value)}
                            className="w-full mt-1 px-2 py-1 border border-amber-400 bg-amber-50 rounded-lg text-center text-xs" />
                        )}
                        <FieldTick active={!!l.counted_exp && m.expOk} onClick={() => toggleField(i, 'counted_exp')} />
                      </td>
                      {/* ตรงทั้งหมด */}
                      <td className="text-center px-2 py-2 align-top">
                        <button onClick={() => markLineAllMatch(i)}
                          title={m.all ? 'ล้างค่าที่กรอก' : 'ตรงทั้งหมด (เติมค่าตามระบบ)'}
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors ${
                            m.all ? 'bg-emerald-500 border-emerald-500 text-white'
                            : m.counted ? 'border-amber-300 text-amber-500 hover:bg-amber-50'
                            : 'border-slate-300 text-slate-400 hover:bg-emerald-50 hover:text-emerald-500 hover:border-emerald-300'}`}>
                          {m.counted && !m.all ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
                        </button>
                      </td>
                      <td className="px-2 py-2 text-center align-top">
                        <button onClick={() => removeLine(i)} className="text-slate-300 hover:text-red-500"><X size={16} /></button>
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
              const expCustom = !!l._expCustom
              return (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-800 text-sm">{l.name}</p>
                      <p className="text-xs text-slate-400">{l.code} · Lot {l.lot}</p>
                    </div>
                    <button onClick={() => removeLine(i)} className="text-slate-300 hover:text-red-500"><X size={16} /></button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    ระบบ: <b className="text-slate-700">{qtyUnit(l.system_qty, l.unit)}</b> · {l.system_location} · {l.system_exp}
                  </p>
                  <div className="mt-2 space-y-2">
                    {/* นับได้ (ช่องหลัก — เต็มแถว) */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 w-14 shrink-0">นับได้</label>
                      <input type="number" inputMode="decimal" value={l.counted_qty} placeholder="จำนวน"
                        onChange={e => updateLine(i, 'counted_qty', e.target.value)}
                        className={`flex-1 min-w-0 px-2 py-1.5 border rounded-lg text-center text-sm ${m.counted && !m.qtyOk ? 'border-red-400 bg-red-50' : 'border-slate-300'}`} />
                      <span className="text-[10px] text-slate-400 shrink-0">× {l.unit}</span>
                      <FieldTick active={m.counted && m.qtyOk} onClick={() => toggleField(i, 'counted_qty')} />
                    </div>
                    {/* ที่เก็บจริง */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 w-14 shrink-0">ที่เก็บ</label>
                      <select value={l.counted_location}
                        onChange={e => updateLine(i, 'counted_location', e.target.value)}
                        className={`flex-1 min-w-0 px-2 py-1.5 border rounded-lg text-center text-xs ${l.counted_location && !m.locOk ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}>
                        <option value="">— เลือกที่เก็บ —</option>
                        {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                      </select>
                      <FieldTick active={!!l.counted_location && m.locOk} onClick={() => toggleField(i, 'counted_location')} />
                    </div>
                    {/* exp จริง — dropdown */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 w-14 shrink-0">exp</label>
                      <div className="flex-1 min-w-0">
                        <select value={expCustom ? '__custom__' : l.counted_exp}
                          onChange={e => pickExp(i, e.target.value)}
                          className={`w-full px-2 py-1.5 border rounded-lg text-center text-xs ${l.counted_exp && !m.expOk ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}>
                          <option value="">— เลือก exp —</option>
                          {(l.system_exp && l.system_exp !== '-') && <option value={l.system_exp}>{l.system_exp} (ตามระบบ)</option>}
                          <option value="__custom__">อื่นๆ (พิมพ์เอง)</option>
                        </select>
                        {expCustom && (
                          <input type="text" autoFocus value={l.counted_exp} placeholder="เช่น 3/12/2028"
                            onChange={e => updateLine(i, 'counted_exp', e.target.value)}
                            className="w-full mt-1 px-2 py-1.5 border border-amber-400 bg-amber-50 rounded-lg text-center text-xs" />
                        )}
                      </div>
                      <FieldTick active={!!l.counted_exp && m.expOk} onClick={() => toggleField(i, 'counted_exp')} />
                    </div>
                    {/* หมายเหตุรายการนี้ */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 w-14 shrink-0">หมายเหตุ</label>
                      <input type="text" value={l.item_note} placeholder="เช่น พบชำรุด / ตำแหน่งจริง"
                        onChange={e => updateLine(i, 'item_note', e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded-lg text-xs" />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="text-xs">
                      {!m.counted ? <span className="text-slate-400">ยังไม่กรอก</span>
                        : m.all ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle size={14} /> ตรงระบบ</span>
                        : <span className="text-amber-600 flex items-center gap-1"><AlertTriangle size={14} /> ไม่ตรง</span>}
                    </div>
                    <button onClick={() => markLineAllMatch(i)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                        m.all ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                      <CheckCircle size={13} /> {m.all ? 'ล้าง' : 'ตรงทั้งหมด'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* note + actions */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="หมายเหตุรอบนี้ (ไม่บังคับ)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => printCountSheet(lines, { counterName, dateLabel: fmtThaiDate(today) })}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200">
                <Printer size={16} /> พิมพ์ใบเดินนับ
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 ml-auto">
                <Save size={16} /> {saving ? 'กำลังบันทึก...' : 'บันทึกรอบตรวจนับ'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-slate-400">
          <Package size={40} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">เลือกรหัสยาด้านบนเพื่อเริ่มตรวจนับ</p>
        </div>
      )}
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

  useEffect(() => {
    fetchStockCountSessions().then(s => { setSessions(s); setLoading(false) })
    fetchInventoryLocations().then(setLocations)
  }, [])

  const toggle = async (id) => {
    if (openId === id) { setOpenId(null); return }
    setOpenId(id)
    if (!items[id]) {
      const data = await fetchStockCountItems(id)
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
    })
  }

  const saveEdit = async (it) => {
    setBusy(true)
    try {
      await updateStockCountItem(it.id, {
        ...editVal,
        system_qty: it.system_qty, system_exp: it.system_exp, system_location: it.system_location,
      }, auth)
      const data = await fetchStockCountItems(it.session_id)   // reload รอบนั้น
      setItems(prev => ({ ...prev, [it.session_id]: data }))
      setEditId(null)
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

  if (loading) return <p className="text-slate-400 text-sm">กำลังโหลด...</p>
  if (!sessions.length) return <p className="text-slate-400 text-sm text-center py-10">ยังไม่มีประวัติตรวจนับ</p>

  return (
    <div className="space-y-3">
      {sessions.map(s => {
        const its = items[s.id] || []
        const mismatch = its.filter(i => !i.match).length
        return (
          <div key={s.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
              <button onClick={() => toggle(s.id)} className="flex items-center gap-3 flex-1 text-left">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><ClipboardCheck size={18} /></div>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-slate-800">{s.created_at ? fmtThaiDateTime(s.created_at) : fmtThaiDate(s.counted_at)}</p>
                  <p className="text-xs text-slate-400">ผู้นับ: {s.counter_name}{s.note ? ` · ${s.note}` : ''}</p>
                </div>
              </button>
              <button onClick={() => deleteSession(s)} disabled={busy}
                title="ลบรอบนี้" className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50">
                <Trash2 size={16} />
              </button>
              <button onClick={() => toggle(s.id)} className="text-slate-400">
                {openId === s.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>
            {openId === s.id && (
              <div className="border-t border-slate-100 px-4 py-3">
                {items[s.id] == null ? <p className="text-xs text-slate-400">กำลังโหลด...</p> : (
                  <>
                    <p className="text-xs text-slate-500 mb-2">
                      ตรวจ {its.length} รายการ · <span className={mismatch ? 'text-amber-600 font-semibold' : 'text-emerald-600'}>ไม่ตรง {mismatch} รายการ</span>
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-slate-500">
                          <tr className="border-b border-slate-100">
                            <th className="text-left py-1.5 pr-2">ยา / Lot</th>
                            <th className="text-center px-2">ระบบ</th>
                            <th className="text-center px-2">นับได้</th>
                            <th className="text-center px-2">ส่วนต่าง</th>
                            <th className="text-center px-2">ที่เก็บ/exp</th>
                            <th className="text-center px-2">ผล</th>
                            <th className="px-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {its.map(it => {
                            const editing = editId === it.id
                            return (
                              <tr key={it.id} className={`border-b border-slate-50 ${editing ? 'bg-emerald-50/60' : !it.match ? 'bg-amber-50/50' : ''}`}>
                                <td className="py-1.5 pr-2 align-top">
                                  {it.name}<span className="text-slate-400"> · {it.lot}</span>
                                  {editing ? (
                                    <input type="text" value={editVal.item_note} placeholder="+ หมายเหตุรายการนี้"
                                      onChange={e => setEditVal(v => ({ ...v, item_note: e.target.value }))}
                                      className="w-full mt-1 px-1.5 py-1 border border-slate-300 rounded text-[11px]" />
                                  ) : it.item_note ? (
                                    <p className="text-[11px] text-amber-600 mt-0.5">หมายเหตุ: {it.item_note}</p>
                                  ) : null}
                                </td>
                                <td className="text-center px-2 align-top">{qtyUnit(it.system_qty, it.unit)}</td>
                                {editing ? (
                                  <>
                                    <td className="text-center px-2">
                                      <input type="number" inputMode="decimal" value={editVal.counted_qty}
                                        onChange={e => setEditVal(v => ({ ...v, counted_qty: e.target.value }))}
                                        className="w-16 px-1.5 py-1 border border-slate-300 rounded text-center" />
                                    </td>
                                    <td className="text-center px-2 text-slate-300">—</td>
                                    <td className="text-center px-2">
                                      <select value={editVal.counted_location}
                                        onChange={e => setEditVal(v => ({ ...v, counted_location: e.target.value }))}
                                        className="w-28 px-1 py-1 border border-slate-300 rounded text-center text-[11px]">
                                        <option value="">— ที่เก็บ —</option>
                                        {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                      </select>
                                      <input type="text" value={editVal.counted_exp} placeholder="exp จริง"
                                        onChange={e => setEditVal(v => ({ ...v, counted_exp: e.target.value }))}
                                        className="w-28 mt-1 px-1.5 py-1 border border-slate-300 rounded text-center text-[11px]" />
                                    </td>
                                    <td className="text-center px-2">
                                      <div className="flex items-center justify-center gap-1">
                                        <button onClick={() => saveEdit(it)} disabled={busy}
                                          className="p-1.5 rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"><Save size={13} /></button>
                                        <button onClick={() => setEditId(null)}
                                          className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><X size={13} /></button>
                                      </div>
                                    </td>
                                    <td></td>
                                  </>
                                ) : (
                                  <>
                                    <td className="text-center px-2">{it.counted_qty == null ? '-' : `${toNum(it.counted_qty)} × ${it.unit}`}</td>
                                    <td className={`text-center px-2 font-semibold ${toNum(it.diff_qty) !== 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                      {it.counted_qty == null ? '-' : (toNum(it.diff_qty) > 0 ? '+' : '') + (toNum(it.system_qty) - toNum(it.counted_qty))}
                                    </td>
                                    <td className="text-center px-2 text-slate-500">
                                      {it.counted_location && it.counted_location !== it.system_location ? `↪${it.counted_location}` : ''}
                                      {it.counted_exp && it.counted_exp !== it.system_exp ? ` exp:${it.counted_exp}` : ''}
                                      {(!it.counted_location || it.counted_location === it.system_location) && (!it.counted_exp || it.counted_exp === it.system_exp) ? '✓' : ''}
                                    </td>
                                    <td className="text-center px-2">
                                      {it.match ? <CheckCircle size={14} className="text-emerald-500 inline" /> : <AlertTriangle size={14} className="text-amber-500 inline" />}
                                    </td>
                                    <td className="text-center px-2">
                                      <button onClick={() => startEdit(it)} title="แก้ไข" className="text-slate-300 hover:text-emerald-600"><Pencil size={14} /></button>
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
  )
}
