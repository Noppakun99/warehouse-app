import React, { useState, useEffect, useMemo, useRef } from 'react'
import { ScrollText, Package, AlertTriangle, Info, X, FileDown, Printer, RotateCcw, ChevronDown, CalendarDays } from 'lucide-react'
import { fetchInventoryNameCodeMap, fetchStockCard, fetchAllStockCardIssues, fetchVendorExchanges } from './lib/db'
import { buildStockCard, filterStockCard, orderLots, defaultLot, sortRowsByDate, kindBadgeOf, rowTitle, displayRef, rowIssues } from './lib/stockCard'
import { buildVendorExchanges } from './lib/vendorExchange'
import { exportToExcel } from './lib/exportExcel'
import DrugSearchBar from './DrugSearchBar'
import BackButton from './BackButton'

// selLot ยังไม่ได้เลือก → คอมเลือกให้ (defaultLot) · มือถือดูทุก lot (docs/features/stock-card.md ข้อ 2/7)
const AUTO = Symbol('auto')

// บรรทัดอธิบายใต้แถว (rowIssues) — ข้อมูลก่อนเริ่มใช้ระบบเป็นสีเทา ไม่ใช่เตือน
const ISSUE_STYLE = {
  drift: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300',
  rowErr: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300',
  migration: 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
}

// วันที่ ISO/DD-MM-YYYY → DD/MM/YYYY (พ.ศ.) ตาม Rule #14
const fmtThai = (raw) => {
  if (!raw) return '-'
  const s = String(raw).trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (iso) return `${String(+iso[3]).padStart(2, '0')}/${String(+iso[2]).padStart(2, '0')}/${+iso[1] + 543}`
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (dmy) {
    const y = +dmy[3]
    return `${String(+dmy[1]).padStart(2, '0')}/${String(+dmy[2]).padStart(2, '0')}/${y > 2500 ? y : y + 543}`
  }
  return s
}
const fmtNum = (n) => {
  const v = Number(n) || 0
  return v.toLocaleString('th-TH', { maximumFractionDigits: 2 })
}

// date input แสดง DD/MM/YYYY (พ.ศ.) ทับ hidden <input type="date"> — Rule #3/#14
// showPicker ต้อง guard เสมอ (bare showPicker พังบน mobile)
function IsoDateInput({ value, onChange, className = '' }) {
  const display = iso => { if (!iso) return null; const [y, m, d] = iso.split('-'); return `${d}/${m}/${Number(y) + 543}` }
  return (
    <div className={`relative flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus-within:ring-2 focus-within:ring-teal-400 ${className}`}>
      <span className={`px-3 py-1.5 text-sm w-full select-none pointer-events-none ${value ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>{display(value) || 'dd/mm/yyyy'}</span>
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
        onClick={e => { try { e.currentTarget.showPicker?.() } catch { /* noop */ } }}
        className="absolute inset-0 opacity-0 w-full cursor-pointer" />
    </div>
  )
}

// คอลัมน์ Excel — ตรงกับตารางที่ผู้ใช้เห็น (Rule #6: stat/export ต้องตรงกับตาราง)
const STOCKCARD_EXCEL_COLS = [
  { header: 'วันที่',            value: (r) => fmtThai(r.date) },
  { header: 'Lot',              key: 'lot' },
  { header: 'ชนิดรายการ',        key: 'kind' },
  { header: 'รับเข้า',           value: (r) => (r.qtyIn > 0 ? r.qtyIn : '') },
  { header: 'เบิกออก',           value: (r) => (r.qtyOut > 0 ? r.qtyOut : '') },
  { header: 'คงเหลือ Lot',       value: (r) => r.balance },
  { header: 'ยอดที่บันทึกไว้',    value: (r) => (r.qtyBefore == null ? '' : r.qtyBefore) },
  { header: 'ยอดหลังเบิก (บันทึก)', value: (r) => (r.qtyAfter == null ? '' : r.qtyAfter) },
  { header: 'ผลต่างสะสม',        value: (r) => (r.drift == null ? '' : r.drift) },
  { header: 'ของหายจุดนี้',      value: (r) => (r.isDriftPoint ? r.driftDelta : '') },
  { header: 'แถวกรอกผิด',        value: (r) => (r.hasRowErr ? `ผิด ${r.rowErr}` : '') },
  { header: 'หน่วยงาน/บริษัท',    key: 'party' },
  { header: 'หมายเหตุ/บิล',      key: 'ref' },
  { header: 'มูลค่า',            value: (r) => (r.value ? r.value : '') },
  { header: 'Exp',              value: (r) => fmtThai(r.exp) },
]

// เปิด print URL แบบ iOS/LINE-safe — WebView บล็อก window.open → fallback <a> click (Rule #4)
function openPrintUrl(url) {
  const w = window.open(url, '_blank')
  if (w) return w
  const a = document.createElement('a')
  a.href = url; a.target = '_blank'; a.rel = 'noopener'
  document.body.appendChild(a); a.click(); a.remove()
  return null
}

// ใบพิมพ์การ์ดคลัง — Blob URL (ห้าม document.write: พังบน iOS Safari, Rule #4)
function printStockCard(meta, rows, summary, filterLabel) {
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const body = rows.map(r => `<tr${r.qtyIn > 0 ? ' class="in"' : ''}>
    <td>${esc(fmtThai(r.date))}</td><td>${esc(r.lot)}</td><td>${esc(r.kind)}</td>
    <td class="n">${r.qtyIn > 0 ? fmtNum(r.qtyIn) : '-'}</td>
    <td class="n">${r.qtyOut > 0 ? fmtNum(r.qtyOut) : '-'}</td>
    <td class="n b${r.balance < 0 ? ' neg' : ''}">${fmtNum(r.balance)}${r.isDriftPoint ? ' *' : ''}</td>
    <td class="n${r.hasDrift ? ' warn' : ''}">${r.qtyBefore == null ? '-' : fmtNum(r.qtyBefore)}</td>
    <td>${esc(r.party)}</td><td class="sm">${esc(r.ref)}</td>
    <td class="n">${r.value ? fmtNum(r.value) : '-'}</td><td class="sm">${esc(fmtThai(r.exp))}</td>
  </tr>`).join('')

  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>การ์ดคลัง ${esc(meta.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box}
  body{font-family:'Sarabun',sans-serif;margin:16px;color:#1e293b;font-size:12px}
  h1{font-size:17px;margin:0 0 2px}
  .meta{color:#475569;font-size:12px;margin-bottom:2px}
  .sum{margin:8px 0;font-size:12px;color:#334155}
  .sum b{color:#0f172a}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#e2e8f0;border:1px solid #cbd5e1;padding:5px 6px;text-align:left;font-weight:700;font-size:11px;white-space:nowrap}
  td{border:1px solid #e2e8f0;padding:4px 6px;vertical-align:middle}
  td.n{text-align:right;white-space:nowrap}
  td.b{font-weight:700}
  td.sm{font-size:10px;color:#475569}
  tr.in td{background:#f0fdf4}
  td.neg{color:#dc2626}
  td.warn{color:#b45309;font-weight:600}
  .note{margin-top:10px;font-size:10px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:6px}
  @media print{@page{size:A4 landscape;margin:9mm} body{margin:0}}
</style></head><body>
<h1>การ์ดคลัง lot — ${esc(meta.name)}</h1>
<div class="meta">รหัส ${esc(meta.code)} · หน่วย ${esc(meta.unit || '-')} · ราคา/หน่วย ${fmtNum(meta.pricePerUnit)} · จำนวน Lot ${summary.lotCount}</div>
<div class="meta">พิมพ์เมื่อ ${fmtThai(new Date().toISOString().slice(0, 10))}${filterLabel ? ` · ${esc(filterLabel)}` : ''}</div>
<div class="sum">รับเข้ารวม <b>${fmtNum(summary.totalIn)}</b> · เบิกออกรวม <b>${fmtNum(summary.totalOut)}</b>${
  summary.driftRows > 0 ? ` · จุดยอดไม่ตรง <b>${summary.driftRows}</b>` : ''}${
  summary.rowErrRows > 0 ? ` · แถวกรอกผิด <b>${summary.rowErrRows}</b>` : ''}</div>
<table><thead><tr>
${['วันที่', 'Lot', 'ชนิดรายการ', 'รับเข้า', 'เบิกออก', 'คงเหลือ Lot', 'ยอดที่บันทึกไว้', 'หน่วยงาน/บริษัท', 'หมายเหตุ/บิล', 'มูลค่า', 'Exp'].map(h => `<th>${h}</th>`).join('')}
</tr></thead><tbody>${body}</tbody></table>
<div class="note">* = จุดที่ยอดคำนวณไม่ตรงกับยอดที่บันทึกไว้ (มีการเคลื่อนไหวที่ไม่ถูกบันทึก) — ไม่ใช่การคำนวณผิด</div>
</body></html>`

  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  openPrintUrl(url)
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

// badge ชนิดรายการ — สีตามความหมาย (เข้า=เขียว, ไม่หักยอด=เทา, ออก=ขาว)
function KindBadge({ kind, side, noDeduct }) {
  const cls = noDeduct ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
    : side === 'in' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60'
      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>{kind || '-'}</span>
}

// รายการ lot ฝั่งซ้าย — ลำดับ: มีป้ายเตือน → ยังมีของ (หมดอายุเร็วก่อน) → หมดแล้ว (จาง) · ท้ายสุด "ดูทุก lot"
function LotList({ lots, selected, onSelect }) {
  const ordered = orderLots(lots)
  return (
    <nav aria-label="รายการ lot" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden md:sticky md:top-20">
      <div className="flex items-center justify-between px-4 py-2.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
        <span>Lot ({lots.length})</span>
        <span>คงเหลือ</span>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-2 space-y-1">
        {ordered.map(l => {
          const sel = selected === l.lot
          const faded = !sel && !l.warn && l.closing === 0
          return (
            <button key={l.lot} type="button" onClick={() => onSelect(l.lot)} aria-pressed={sel}
              className={`w-full text-left rounded-xl px-3 py-2 border transition-colors ${sel
                ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800'
                : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              <div className={faded ? 'opacity-60' : ''}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-mono text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded" title={l.lot}>{l.lot}</span>
                  <span className={`shrink-0 text-sm font-bold tabular-nums ${l.closing < 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-100'}`}>{fmtNum(l.closing)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                  <span className="mr-1 tabular-nums">Exp {l.exp ? fmtThai(l.exp) : '-'}</span>
                  {l.driftReal > 0 && <IssueChip tone="amber">ยอดไม่ตรง {l.driftReal}</IssueChip>}
                  {l.rowErrCount > 0 && <IssueChip tone="rose">กรอกผิด {l.rowErrCount}</IssueChip>}
                  {l.negative && <IssueChip tone="rose">ติดลบ</IssueChip>}
                  {l.driftMigration > 0 && <IssueChip tone="slate">ข้อมูลก่อนเริ่มใช้ระบบ {l.driftMigration}</IssueChip>}
                </div>
              </div>
            </button>
          )
        })}
        {lots.length > 1 && (
          <button type="button" onClick={() => onSelect(null)} aria-pressed={selected === null}
            className={`w-full flex items-center gap-2 rounded-xl px-3 py-2.5 mt-1 border text-sm font-medium transition-colors ${selected === null
              ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800 text-teal-800 dark:text-teal-300'
              : 'border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            <CalendarDays size={15} className="shrink-0" /> ดูทุก lot เรียงตามวัน
          </button>
        )}
      </div>
    </nav>
  )
}

// ป้ายเตือนในรายการ lot (กดไม่ได้ — อยู่ในปุ่มเลือก lot อยู่แล้ว)
function IssueChip({ tone, children }) {
  const cls = {
    amber: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
    rose: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
  }[tone]
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-px font-semibold ${cls}`}>
      {tone !== 'slate' && <AlertTriangle size={10} />}{children}
    </span>
  )
}

// ตัวเลขบนหัวของ lot
function LotStat({ label, value, hint, tone }) {
  const t = {
    emerald: 'text-emerald-700 dark:text-emerald-300',
    teal: 'text-teal-700 dark:text-teal-300',
    rose: 'text-rose-600 dark:text-rose-400',
  }[tone] || 'text-slate-800 dark:text-slate-100'
  return (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-3 py-2">
      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${t}`}>{fmtNum(value)}</p>
      {hint && <p className="text-[10px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  )
}

// รายละเอียดที่ซ่อนอยู่ของแถว (กดแถวแล้วกาง) — มูลค่าย้ายมาอยู่ที่นี่ (ข้อตกลงข้อ 3)
function RowDetail({ r, price }) {
  const items = [
    ['มูลค่า', r.value ? `${fmtNum(r.value)} บาท` : '-', price ? `ราคา/หน่วย ${fmtNum(price)}` : null],
    ['Exp', fmtThai(r.exp)],
    ['ชนิดรายการ', r.kind || '-', r.noDeduct ? 'ไม่ตัดยอด' : null],
    ...(r.side === 'in'
      ? [['บริษัท', r.party || '-'], ['เลขที่บิล', r.ref || '-']]
      : [
        ['คงเหลือก่อนเบิกตามชีทเบิก', r.qtyBefore == null ? 'ไม่ได้บันทึก' : fmtNum(r.qtyBefore)],
        ['คงเหลือหลังเบิกตามชีทเบิก', r.qtyAfter == null ? 'ไม่ได้บันทึก' : fmtNum(r.qtyAfter)],
        ['หน่วยงาน', r.party || '-'],
        ['หมายเหตุ', displayRef(r.ref) || '-'],
      ]),
  ]
  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2 text-xs">
      {items.map(([k, v, hint]) => (
        <div key={k} className="min-w-0">
          <dt className="text-slate-400 dark:text-slate-500">{k}</dt>
          <dd className="font-semibold text-slate-700 dark:text-slate-200 break-words tabular-nums">
            {v}
            {hint && <span className="block font-normal text-[10px] text-slate-400 dark:text-slate-500">{hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function StockCardApp({ onGoBack, canGoBack, onRefresh, auth = {}, initialDrug = null, onInitialDrugUsed }) {
  const [drugOptions, setDrugOptions] = useState([])
  const [nameToCode, setNameToCode] = useState({})
  const [drugName, setDrugName] = useState('')
  const [data, setData] = useState(null)      // { receiveRows, dispenseRows, meta }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selLot, setSelLot] = useState(AUTO)       // lot ที่เลือก · null = ดูทุก lot เรียงตามวัน
  const [openRow, setOpenRow] = useState(null)     // แถวที่กางดูรายละเอียด (มูลค่า · ยอดตามชีทเบิก)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [driftRow, setDriftRow] = useState(null)   // แถวที่กดดูรายละเอียด "ยอดไม่ตรง"/"แถวกรอกผิด"
  const [flashKey, setFlashKey] = useState(null)   // แถวที่เพิ่งกระโดดไป — ไฮไลต์ชั่วคราว
  const rowRefs = useRef({})                       // key แถว → element (สำหรับ scroll ไปหา)
  const [scanning, setScanning] = useState(false)
  const [issues, setIssues] = useState(null)       // ผลสแกนทั้งระบบ: [{ code, name, driftPoints, rowErrs }]
  const [showIssues, setShowIssues] = useState(false)
  const [showMigration, setShowMigration] = useState(false)  // รวมยาที่ drift มาจากการย้ายข้อมูล Excel
  const [exch, setExch] = useState(null)          // รอบเปลี่ยน/คืนบริษัท (ของลอย)
  const [exchLoading, setExchLoading] = useState(false)
  const [showExch, setShowExch] = useState(false)

  useEffect(() => {
    let alive = true
    fetchInventoryNameCodeMap()
      .then(({ names, byName, typeByName }) => {
        if (!alive) return
        setDrugOptions(names.map(n => ({ name: n, type: typeByName[n] })))
        setNameToCode(byName)
      })
      .catch(e => alive && setError(e.message))
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // ยาตัวใหม่/ล้างชื่อยา → กลับไปให้ระบบเลือก lot เอง + ทิ้งตัวกรอง/แถวที่กาง
  // ล้าง rowRefs ด้วย ไม่งั้น ref ของยาตัวก่อนค้าง → กระโดดไปหา element ที่หลุด DOM แล้ว
  const resetView = () => {
    setSelLot(AUTO); setOpenRow(null); setDateFrom(''); setDateTo('')
    setDriftRow(null); setFlashKey(null)
    rowRefs.current = {}
  }

  // ล้างทุกอย่างกลับ empty state — ใช้ตอนกด X ล้างชื่อยา (ตารางต้องหายไปด้วย)
  const clearAll = () => {
    setData(null); setError('')
    resetView()
  }

  const loadCard = async (name) => {
    const code = nameToCode[name]
    if (!code) { clearAll(); return }
    setLoading(true); setError('')
    try {
      setData(await fetchStockCard(code))
      resetView()
    } catch (e) { setError(e.message); setData(null) }
    finally { setLoading(false) }
  }

  // สแกนทั้งระบบหายาที่ยอดไม่ตรง — ดึงครั้งเดียวแล้ว buildStockCard ต่อทุกรหัส
  const scanIssues = async () => {
    setScanning(true); setError('')
    try {
      const { byCode, meta: metaMap } = await fetchAllStockCardIssues()
      const found = []
      for (const [code, rows] of Object.entries(byCode)) {
        const c = buildStockCard({ receiveRows: rows.receiveRows, dispenseRows: rows.dispenseRows })
        const driftPoints = c.summary.driftRowsReal          // ไม่นับที่เกิดตอนย้ายข้อมูล Excel
        const migrationPoints = c.summary.driftRowsMigration
        const rowErrs = c.summary.rowErrRows
        if (driftPoints > 0 || rowErrs > 0 || migrationPoints > 0) {
          found.push({
            code,
            name: metaMap[code]?.name || code,
            driftPoints,
            migrationPoints,
            rowErrs,
            lots: c.lots.filter(l => l.driftCount > 0).map(l => l.lot),
          })
        }
      }
      // เรียงตามความรุนแรง: กรอกผิดก่อน (ต้องแก้ที่ต้นทาง) แล้วค่อยยอดไม่ตรงจริง
      found.sort((a, b) => (b.rowErrs - a.rowErrs) || (b.driftPoints - a.driftPoints))
      setIssues(found); setShowIssues(true)
    } catch (e) { setError(e.message) }
    finally { setScanning(false) }
  }

  // ของลอย — ส่งคืนบริษัทแล้วยังไม่ได้ของทดแทน (จับคู่จากข้อมูลที่มีอยู่ ไม่ต้องกรอกเพิ่ม)
  const loadExchanges = async () => {
    setExchLoading(true); setError('')
    try {
      const { dispenseRows, receiveRows, supplierByLot } = await fetchVendorExchanges()
      setExch(buildVendorExchanges({ dispenseRows, receiveRows, supplierByLot, today: new Date() }))
      setShowExch(true); setShowIssues(false)
    } catch (e) { setError(e.message) }
    finally { setExchLoading(false) }
  }

  // คลิกยาในผลสแกน → โหลดการ์ดของยานั้น + ปิดรายการ
  const openDrugByCode = async (code, name) => {
    setDrugName(name)
    setShowIssues(false)
    setLoading(true); setError('')
    try {
      setData(await fetchStockCard(code))
      resetView()
    } catch (e) { setError(e.message); setData(null) }
    finally { setLoading(false) }
  }

  // เปิดจากบัตรยา (ปุ่ม "เปิดการ์ดคลัง lot") — โหลดยานั้นทันที แล้วบอก AppRoot ล้างค่า
  // (ไม่ล้าง → เข้าเมนู Stockcard ครั้งหน้าจะเด้งยาตัวเดิมขึ้นมาเอง)
  useEffect(() => {
    if (!initialDrug?.code) return
    openDrugByCode(initialDrug.code, initialDrug.name || '')
    onInitialDrugUsed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDrug])

  // แยกยาที่ "ต้องตรวจจริง" ออกจากยาที่ต่างเพราะย้ายข้อมูล Excel (52% ของ drift ทั้งระบบ)
  const visibleIssues = useMemo(
    () => (issues || []).filter(it => showMigration || it.rowErrs > 0 || it.driftPoints > 0),
    [issues, showMigration]
  )
  const migrationOnlyCount = useMemo(
    () => (issues || []).filter(it => it.rowErrs === 0 && it.driftPoints === 0 && it.migrationPoints > 0).length,
    [issues]
  )

  const card = useMemo(() => {
    if (!data) return null
    return buildStockCard({
      receiveRows: data.receiveRows,
      dispenseRows: data.dispenseRows,
      pricePerUnit: data.meta?.pricePerUnit || 0,
    })
  }, [data])

  // lot ที่แสดงจริง: AUTO บนคอม = defaultLot (มีป้ายเตือน → ยังมีของ หมดอายุเร็วสุด) · มือถือไม่เลือกให้
  // lot ที่เลือกไว้แต่ไม่มีในยานี้ (ไม่ควรเกิด — resetView ทุกครั้งที่เปลี่ยนยา) → ดูทุก lot
  const lot = !card ? null
    : selLot === AUTO ? (isMobile ? null : defaultLot(card.lots))
      : (selLot && card.lots.some(l => l.lot === selLot) ? selLot : null)

  const lotRows = useMemo(
    () => (!card ? [] : lot ? card.rows.filter(r => r.lot === lot) : sortRowsByDate(card.rows)),
    [card, lot]
  )
  const visibleRows = useMemo(
    () => filterStockCard(lotRows, { from: dateFrom || undefined, to: dateTo || undefined }),
    [lotRows, dateFrom, dateTo]
  )

  // หัวของ lot ที่ดูอยู่ (หรือรวมทุก lot) — ยอดตั้งต้น + รับ − เบิก = คงเหลือ เสมอ
  // (lot ที่มีประวัติรับเข้า opening = 0 · totalOut ไม่นับแถวไม่หักยอด — stockCard.js)
  const view = useMemo(() => {
    if (!card) return null
    const ls = lot ? card.lots.filter(l => l.lot === lot) : card.lots
    const sum = (f) => ls.reduce((s, l) => s + f(l), 0)
    return {
      info: lot ? ls[0] : null,
      lotCount: ls.length,
      hasOpening: ls.some(l => !l.hasReceipt),
      opening: sum(l => l.opening),
      totalIn: sum(l => l.totalIn),
      totalOut: sum(l => l.totalOut),
      closing: sum(l => l.closing),
      driftReal: sum(l => l.driftReal),
      driftMigration: sum(l => l.driftMigration),
      rowErr: sum(l => l.rowErrCount),
      negative: ls.filter(l => l.negative).length,
    }
  }, [card, lot])

  const pickLot = (l) => { setSelLot(l); setOpenRow(null); setFlashKey(null) }

  // key แถวที่ stable ข้ามการกรอง (index เปลี่ยนเมื่อกรอง → ใช้เป็น ref key ไม่ได้)
  const rowKey = (r) => `${r.lot}|${r.date}|${r.side}|${r.qtyIn}|${r.qtyOut}|${r.qtyBefore ?? ''}`

  // กดบรรทัดสรุปบนหัวของ lot → ล้างช่วงวันที่ที่บังแถวนั้น แล้วเลื่อนไปหา + ไฮไลต์
  // ref แยก 'd:' (ตารางคอม) / 'm:' (การ์ดมือถือ) — เลือกตัวที่มองเห็นจริง
  const jumpToRow = (predicate) => {
    const target = lotRows.find(predicate)
    if (!target) return
    setDateFrom(''); setDateTo('')
    const key = rowKey(target)
    setFlashKey(key)
    // รอ React render แถวที่เพิ่งถูกปลดกรองก่อนค่อย scroll
    setTimeout(() => {
      // เลือก element ที่มองเห็นจริง (offsetParent = null เมื่อ display:none/หลุด DOM)
      const el = [rowRefs.current[`d:${key}`], rowRefs.current[`m:${key}`]]
        .find(n => n && n.offsetParent !== null)
      if (!el) return
      // ตารางคอมเป็น scroll container ของตัวเอง → scrollIntoView จัดกลางในกล่อง
      // แต่ถ้ากล่องอยู่นอกจอ ผู้ใช้จะไม่เห็นอะไรเลย จึงเลื่อนหน้าไปหากล่องด้วย
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const box = el.closest('[data-scrollbox]')
      if (box) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 60)
    setTimeout(() => setFlashKey(null), 2600)
  }

  const meta = data?.meta
  const hasDateFilter = !!(dateFrom || dateTo)
  // บอกบนใบพิมพ์ว่าเป็น lot ไหน/ช่วงไหน — กันเข้าใจผิดว่าเป็นข้อมูลครบทั้งหมด
  const filterLabel = [
    lot ? `Lot ${lot}` : (card && card.lots.length > 1 ? 'ทุก lot เรียงตามวัน' : ''),
    hasDateFilter && `ช่วง ${dateFrom ? fmtThai(dateFrom) : '...'}–${dateTo ? fmtThai(dateTo) : '...'}`,
  ].filter(Boolean).join(' · ')

  // ช่วงวันที่ — ตัวแปรชุดเดียว (มือถือจะย้ายเข้า FilterSheet ในขั้น 3)
  const dateFilter = (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 dark:text-slate-500 mb-1">ตั้งแต่วันที่</label>
        <IsoDateInput value={dateFrom} onChange={setDateFrom} className="w-36" />
      </div>
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 dark:text-slate-500 mb-1">ถึงวันที่</label>
        <IsoDateInput value={dateTo} onChange={setDateTo} className="w-36" />
      </div>
      {hasDateFilter && (
        <button type="button" onClick={() => { setDateFrom(''); setDateTo('') }}
          className="flex items-center gap-1 px-2 py-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
          <X size={14} /> ล้างช่วงวันที่
        </button>
      )}
      <span className="ml-auto self-center text-xs text-slate-400 dark:text-slate-500 tabular-nums">
        {visibleRows.length === lotRows.length ? `${lotRows.length} รายการ` : `${visibleRows.length} / ${lotRows.length} รายการ`}
      </span>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800">
      {/* title bar ขาวบาง + ไอคอนสีประจำระบบ (teal) */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
          <div className="p-2 bg-teal-100 dark:bg-teal-950/60 text-teal-600 rounded-xl shrink-0"><ScrollText size={20} /></div>
          <button onClick={onRefresh} className="text-left hover:opacity-70 transition-opacity" title="คลิกเพื่อโหลดใหม่">
            <p className="font-bold text-sm leading-tight text-slate-800 dark:text-slate-100">Stockcard</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs">ประวัติทุก lot ทุกเดือน</p>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5 space-y-4">
        {/* เลือกยา */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">เลือกยา</label>
            <div className="flex gap-2">
              <button
                onClick={loadExchanges}
                disabled={exchLoading}
                className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-950/70 disabled:opacity-60 text-orange-800 dark:text-orange-300 border border-orange-300 dark:border-orange-800/60 rounded-lg px-3 py-1 text-sm font-medium transition-colors"
              >
                <RotateCcw size={15} />
                {exchLoading ? 'กำลังตรวจ...' : 'ของรอคืนจากบริษัท'}
              </button>
              <button
                onClick={scanIssues}
                disabled={scanning}
                className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/70 disabled:opacity-60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60 rounded-lg px-3 py-1 text-sm font-medium transition-colors"
              >
                <AlertTriangle size={15} />
                {scanning ? 'กำลังตรวจ...' : 'ตรวจหายาที่ยอดไม่ตรง'}
              </button>
            </div>
          </div>
          <DrugSearchBar
            value={drugName}
            onChange={(v) => {
              setDrugName(v)
              if (nameToCode[v]) loadCard(v)
              else if (!v.trim()) clearAll()   // กด X ล้างชื่อ → ตารางหายไปด้วย
            }}
            options={drugOptions}
            placeholder="พิมพ์ชื่อยาเพื่อดูประวัติทุก lot..."
            ringClass="focus:ring-teal-400"
            hoverClass="hover:bg-teal-50 dark:hover:bg-teal-950/50"
          />
        </div>

        {/* ของลอย — ส่งคืนบริษัทแล้วยังไม่ได้ของทดแทน */}
        {showExch && exch && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-orange-300 dark:border-orange-800/60 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-orange-50 dark:bg-orange-950/40 border-b border-orange-200 dark:border-orange-900/60">
              <p className="font-bold text-orange-800 dark:text-orange-300 text-sm">
                {exch.summary.openCount > 0
                  ? `รอของคืนจากบริษัท ${exch.summary.openCount} รายการ (${fmtNum(exch.summary.openQty)} หน่วย)`
                  : 'ไม่มีของค้างรอคืนจากบริษัท'}
              </p>
              <button onClick={() => setShowExch(false)} className="p-1 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-950/70 rounded-lg" aria-label="ปิดรายการ">
                <X size={16} />
              </button>
            </div>
            <p className="px-4 py-2 text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
              จับคู่อัตโนมัติจากประวัติเบิก/รับ (รหัสยา + บริษัท + ลำดับเวลา) —
              <b> เป็นตัวช่วยเตือน ไม่ใช่ทะเบียนที่ถูก 100%</b> ควรตรวจกับเอกสารจริงก่อนทวงบริษัท
            </p>
            {exch.summary.openCount > 0 && (
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {exch.open.map((o, i) => (
                  <button
                    key={i}
                    onClick={() => openDrugByCode(o.code, o.name)}
                    className="w-full text-left px-4 py-2.5 hover:bg-orange-50 dark:hover:bg-orange-950/50 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{o.name || o.code}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">
                        lot {o.lot} · ส่งคืน {fmtThai(o.date)} · {o.kind}{o.company ? ` · ${o.company}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{fmtNum(o.qty)}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                        o.daysWaiting >= 90 ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800/60'
                          : o.daysWaiting >= 30 ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800/60'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
                        ค้าง {o.daysWaiting} วัน
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {exch.summary.matchedCount > 0 && (
              <p className="px-4 py-2 text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
                จับคู่ได้แล้ว {exch.summary.matchedCount} รอบ
                {exch.summary.lotChangedCount > 0 && ` · lot เปลี่ยน ${exch.summary.lotChangedCount}`}
                {exch.summary.qtyMismatchCount > 0 && ` · จำนวนไม่ตรง ${exch.summary.qtyMismatchCount}`}
              </p>
            )}
          </div>
        )}

        {/* ผลสแกนทั้งระบบ — คลิกยา → เปิดการ์ดของยานั้นทันที */}
        {showIssues && issues && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-300 dark:border-amber-800/60 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60">
              <p className="font-bold text-amber-800 dark:text-amber-300 text-sm">
                {visibleIssues.length > 0
                  ? `ต้องตรวจ ${visibleIssues.length} รายการ`
                  : 'ตรวจแล้ว — ไม่พบยาที่ต้องตรวจ'}
              </p>
              <button onClick={() => setShowIssues(false)} className="p-1 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/70 rounded-lg" aria-label="ปิดรายการ">
                <X size={16} />
              </button>
            </div>
            {migrationOnlyCount > 0 && (
              <label className="flex items-start gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 cursor-pointer">
                <input type="checkbox" checked={showMigration} onChange={e => setShowMigration(e.target.checked)} className="mt-0.5" />
                <span className="text-[11px] text-slate-600 dark:text-slate-300">
                  แสดงอีก <b>{migrationOnlyCount}</b> รายการที่ยอดต่างเพราะ<b>ประวัติก่อนเริ่มใช้ระบบไม่ครบ</b>
                  <span className="text-slate-400 dark:text-slate-500"> (ย้ายมาจาก Excel — ไม่ใช่ของหายจริง)</span>
                </span>
              </label>
            )}
            {visibleIssues.length > 0 && (
              <>
                <p className="px-4 py-2 text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  คลิกที่ยาเพื่อเปิดการ์ดคลังของยานั้น แล้วกด badge เพื่อไปยังแถวที่มีปัญหา
                </p>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleIssues.map(it => (
                    <button
                      key={it.code}
                      onClick={() => openDrugByCode(it.code, it.name)}
                      className="w-full text-left px-4 py-2.5 hover:bg-amber-50 dark:hover:bg-amber-950/50 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{it.name}</p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          รหัส {it.code}{it.lots.length > 0 ? ` · lot ${it.lots.slice(0, 3).join(', ')}${it.lots.length > 3 ? ` +${it.lots.length - 3}` : ''}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {it.rowErrs > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800/60">
                            กรอกผิด {it.rowErrs}
                          </span>
                        )}
                        {it.driftPoints > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60">
                            ยอดไม่ตรง {it.driftPoints}
                          </span>
                        )}
                        {it.migrationPoints > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            ข้อมูลเก่า {it.migrationPoints}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}
        {loading && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center text-slate-400 dark:text-slate-500 text-sm">กำลังโหลด...</div>
        )}

        {!loading && card && meta && view && (
          <>
            {/* หัวยา — กะทัดรัด (ป้ายเตือนย้ายไปอยู่รายการ lot + หัวของ lot แล้ว) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-64">
                <p className="font-bold text-slate-800 dark:text-slate-100 text-lg leading-tight break-words">{meta.name || '-'}</p>
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                  <span>รหัส: <b className="text-slate-700 dark:text-slate-200">{meta.code}</b></span>
                  <span>หน่วย: <b className="text-slate-700 dark:text-slate-200">{meta.unit || '-'}</b></span>
                  <span>ราคา/หน่วย: <b className="text-slate-700 dark:text-slate-200 tabular-nums">{fmtNum(meta.pricePerUnit)}</b></span>
                  <span><b className="text-slate-700 dark:text-slate-200 tabular-nums">{card.summary.lotCount}</b> lot</span>
                </p>
              </div>
              {/* export/print ใช้ visibleRows = ตรงกับที่ผู้ใช้เห็น (Rule #6) */}
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => printStockCard(meta, visibleRows, card.summary, filterLabel)}
                  className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                >
                  <Printer size={16} /> พิมพ์
                </button>
                <button
                  onClick={() => exportToExcel(
                    visibleRows, STOCKCARD_EXCEL_COLS, 'การ์ดคลัง lot',
                    `stockcard_${meta.code}_${new Date().toISOString().slice(0, 10)}.xlsx`, auth
                  )}
                  className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                >
                  <FileDown size={16} /> Excel
                </button>
              </div>
            </div>

            {/* รายการ lot ซ้าย + ความเคลื่อนไหวของ lot ที่เลือกขวา (ข้อตกลงข้อ 2) */}
            <div className="grid gap-4 items-start md:grid-cols-[17rem_minmax(0,1fr)]">
              <LotList lots={card.lots} selected={lot} onSelect={pickLot} />

              <div className="min-w-0 space-y-3">
                {/* หัวของ lot */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                  {view.info ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Lot</span>
                      <span className="font-mono text-base font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-2 py-0.5 rounded-md break-all">{view.info.lot}</span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">Exp <b className="text-slate-700 dark:text-slate-200 tabular-nums">{view.info.exp ? fmtThai(view.info.exp) : '-'}</b></span>
                    </div>
                  ) : (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold text-slate-800 dark:text-slate-100">
                      <CalendarDays size={16} className="text-teal-600 shrink-0" /> ทุก lot เรียงตามวัน
                      <span className="text-xs font-normal text-slate-400 dark:text-slate-500">{view.lotCount} lot · คอลัมน์คงเหลือเป็นยอดของ lot ในแถวนั้น</span>
                    </p>
                  )}

                  <div className={`mt-3 grid grid-cols-2 gap-2 ${view.hasOpening ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
                    {view.hasOpening && (
                      <LotStat label={view.info ? 'ยอดตั้งต้นของ lot' : 'ยอดตั้งต้นรวม'} value={view.opening}
                        hint={view.info ? 'ไม่มีประวัติรับเข้าในระบบ' : 'เฉพาะ lot ที่ไม่มีประวัติรับเข้า'} />
                    )}
                    <LotStat label="รับเข้ารวม" value={view.totalIn} tone="emerald" />
                    <LotStat label="เบิกออกรวม" value={view.totalOut} />
                    <LotStat label={view.info ? 'คงเหลือ' : 'คงเหลือรวม'} value={view.closing} tone={view.closing < 0 ? 'rose' : 'teal'} />
                  </div>

                  {/* บรรทัดสรุปจุดที่ยอดมีปัญหา — กดแล้วเลื่อนไปแถวแรกของเรื่องนั้น (ข้อตกลงข้อ 4) */}
                  {(view.driftReal + view.rowErr + view.negative + view.driftMigration) > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      {(view.driftReal + view.rowErr + view.negative) > 0
                        ? <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                        : <Info size={14} className="text-slate-400 shrink-0" />}
                      {view.driftReal > 0 && (
                        <button type="button" onClick={() => jumpToRow(r => r.isDriftPoint && !r.fromMigration)}
                          className="font-semibold text-amber-700 dark:text-amber-300 underline underline-offset-2 decoration-amber-300 hover:decoration-amber-600 transition-colors">
                          ยอดไม่ตรง {view.driftReal} จุด
                        </button>
                      )}
                      {view.rowErr > 0 && (
                        <button type="button" onClick={() => jumpToRow(r => r.hasRowErr)}
                          className="font-semibold text-rose-700 dark:text-rose-300 underline underline-offset-2 decoration-rose-300 hover:decoration-rose-600 transition-colors">
                          แถวกรอกผิด {view.rowErr} แถว
                        </button>
                      )}
                      {view.negative > 0 && (
                        <span className="font-semibold text-rose-700 dark:text-rose-300">คงเหลือติดลบ{view.info ? '' : ` ${view.negative} lot`}</span>
                      )}
                      {view.driftMigration > 0 && (
                        <button type="button" onClick={() => jumpToRow(r => r.isDriftPoint && r.fromMigration)}
                          className="text-slate-500 dark:text-slate-400 underline underline-offset-2 decoration-slate-300 hover:decoration-slate-500 transition-colors">
                          ข้อมูลก่อนเริ่มใช้ระบบ {view.driftMigration} จุด
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* ตาราง 6 คอลัมน์ (คอม) — กดแถวกางดูมูลค่า/ยอดตามชีทเบิก */}
                {!isMobile && (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">{dateFilter}</div>
                    <div data-scrollbox key={lot ?? '*'} className="overflow-auto max-h-[70vh]">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                          <tr className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">
                            <th className="px-3 py-3 text-left bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">วันที่</th>
                            <th className="px-3 py-3 text-left bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">รายการ</th>
                            <th className="px-3 py-3 text-right bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">รับเข้า</th>
                            <th className="px-3 py-3 text-right bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">เบิกออก</th>
                            <th className="px-3 py-3 text-right bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">คงเหลือ</th>
                            <th className="px-3 py-3 text-left bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">หมายเหตุ</th>
                            <th className="w-8 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700"><span className="sr-only">กางดูรายละเอียด</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRows.map((r, i) => {
                            const key = rowKey(r)
                            const flash = flashKey === key
                            const open = openRow === key
                            const issues = rowIssues(r)
                            const kb = kindBadgeOf(r.kind)
                            const note = displayRef(r.ref)
                            const toggle = () => setOpenRow(open ? null : key)
                            const line = 'border-b border-slate-100 dark:border-slate-800'
                            return (
                              <React.Fragment key={i}>
                                <tr
                                  ref={el => { if (el) rowRefs.current[`d:${key}`] = el }}
                                  onClick={toggle}
                                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
                                  tabIndex={0}
                                  aria-expanded={open}
                                  className={`cursor-pointer transition-colors ${issues.length || open ? '' : line} ${flash
                                    ? 'bg-amber-100 dark:bg-amber-950/60 ring-2 ring-inset ring-amber-400'
                                    : open ? 'bg-teal-50/70 dark:bg-teal-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                                >
                                  <td className="px-3 py-2.5 align-top whitespace-nowrap text-slate-600 dark:text-slate-300 tabular-nums">{fmtThai(r.date)}</td>
                                  <td className="px-3 py-2.5 align-top min-w-40">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {!lot && <span className="font-mono text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">{r.lot}</span>}
                                      <span className={`font-medium ${r.side === 'in' ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'}`}>{rowTitle(r)}</span>
                                      {kb && <KindBadge kind={kb} side={r.side} noDeduct={r.noDeduct} />}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 align-top text-right tabular-nums whitespace-nowrap">
                                    {r.qtyIn > 0
                                      ? <span className="font-semibold text-emerald-700 dark:text-emerald-300">{fmtNum(r.qtyIn)}</span>
                                      : <span className="text-slate-300 dark:text-slate-600">-</span>}
                                  </td>
                                  <td className="px-3 py-2.5 align-top text-right tabular-nums whitespace-nowrap">
                                    {r.qtyOut > 0
                                      ? (r.noDeduct
                                        ? <span className="text-slate-400 dark:text-slate-500">{fmtNum(r.qtyOut)} <span className="text-[10px]">(ไม่หัก)</span></span>
                                        : <span className="text-slate-700 dark:text-slate-200">{fmtNum(r.qtyOut)}</span>)
                                      : <span className="text-slate-300 dark:text-slate-600">-</span>}
                                  </td>
                                  <td className={`px-3 py-2.5 align-top text-right tabular-nums whitespace-nowrap font-bold ${r.balance < 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-100'}`}>
                                    {fmtNum(r.balance)}
                                  </td>
                                  {/* ตัด 2 บรรทัดแทน truncate บรรทัดเดียว — truncate ทำให้ตาราง auto layout กว้างตามหมายเหตุยาวสุด
                                      แล้วล้นขวา (แผงขวาที่ 1280px กว้างแค่ ~690px) · ข้อความเต็มอยู่ title + แถวที่กาง */}
                                  <td className="px-3 py-2.5 align-top text-xs text-slate-500 dark:text-slate-400">
                                    <p className="line-clamp-2 break-words" title={note}>{note ? (r.side === 'in' ? `บิล ${note}` : note) : '-'}</p>
                                  </td>
                                  <td className="pr-3 py-2.5 align-top text-slate-400 dark:text-slate-500">
                                    <ChevronDown size={15} className={open ? 'rotate-180' : ''} />
                                  </td>
                                </tr>
                                {issues.length > 0 && (
                                  <tr className={open ? '' : line}>
                                    <td colSpan={7} className="px-3 pb-2.5 pt-0">
                                      <div className="space-y-1">
                                        {issues.map((it, j) => (
                                          <div key={j} className={`flex items-start gap-2 rounded-lg px-3 py-1.5 text-xs ${ISSUE_STYLE[it.type]}`}>
                                            {it.type === 'migration'
                                              ? <Info size={13} className="mt-0.5 shrink-0" />
                                              : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
                                            <span className="flex-1 min-w-0">{it.text}</span>
                                            {j === 0 && (
                                              <button type="button" onClick={() => setDriftRow(r)}
                                                className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity">
                                                ดูรายละเอียด
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                {open && (
                                  <tr className={`${line} bg-teal-50/40 dark:bg-teal-950/20`}>
                                    <td colSpan={7} className="px-4 py-3">
                                      <RowDetail r={r} price={meta.pricePerUnit} />
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            )
                          })}
                          {visibleRows.length === 0 && (
                            <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400 dark:text-slate-500">ไม่มีรายการในช่วงวันที่นี้</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* มือถือ (< 768px) — ชั่วคราวจนถึงขั้น 3 (2 ชั้น + FilterSheet) */}
                {isMobile && (
                  <div className="space-y-2">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-3">{dateFilter}</div>
                    {visibleRows.map((r, i) => {
                      const key = rowKey(r)
                      const flash = flashKey === key
                      const kb = kindBadgeOf(r.kind)
                      return (
                      <div
                        key={i}
                        ref={el => { if (el) rowRefs.current[`m:${key}`] = el }}
                        className={`bg-white dark:bg-slate-900 rounded-xl border p-3 transition-colors ${flash ? 'border-amber-400 ring-2 ring-amber-300 bg-amber-50 dark:bg-amber-950/40' : (r.qtyIn > 0 ? 'border-emerald-200 dark:border-emerald-900/60' : 'border-slate-200 dark:border-slate-700')}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-500 dark:text-slate-400">{fmtThai(r.date)}</span>
                          {kb && <KindBadge kind={kb} side={r.side} noDeduct={r.noDeduct} />}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Package size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
                          <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Lot {r.lot}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                          <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-lg py-1.5">
                            <p className="text-[10px] text-emerald-600">รับเข้า</p>
                            <p className="font-bold text-emerald-700 dark:text-emerald-300 text-sm">{r.qtyIn > 0 ? fmtNum(r.qtyIn) : '-'}</p>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg py-1.5">
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">เบิกออก</p>
                            <p className="font-bold text-slate-700 dark:text-slate-200 text-sm">{r.qtyOut > 0 ? fmtNum(r.qtyOut) : '-'}</p>
                          </div>
                          <div className={`rounded-lg py-1.5 ${r.balance < 0 ? 'bg-rose-50 dark:bg-rose-950/40' : 'bg-teal-50 dark:bg-teal-950/40'}`}>
                            <p className={`text-[10px] ${r.balance < 0 ? 'text-rose-600' : 'text-teal-600'}`}>คงเหลือ</p>
                            <p className={`font-bold text-sm ${r.balance < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-teal-700 dark:text-teal-300'}`}>{fmtNum(r.balance)}</p>
                          </div>
                        </div>
                        {rowIssues(r).map((it, j) => (
                          <button key={j} type="button" onClick={() => setDriftRow(r)}
                            className={`mt-2 w-full flex items-start gap-1.5 text-[11px] rounded-lg px-2 py-1.5 text-left ${ISSUE_STYLE[it.type]}`}>
                            {it.type === 'migration' ? <Info size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
                            <span>{it.text}</span>
                          </button>
                        ))}
                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                          {r.party && <p>{r.side === 'in' ? 'บริษัท' : 'หน่วยงาน'}: {r.party}</p>}
                          {r.ref && <p className="break-words">หมายเหตุ: {displayRef(r.ref)}</p>}
                          {r.exp && r.exp !== '-' && <p>Exp: {fmtThai(r.exp)}</p>}
                        </div>
                      </div>
                      )
                    })}
                    {visibleRows.length === 0 && (
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center text-slate-400 dark:text-slate-500 text-sm">ไม่มีรายการในช่วงวันที่นี้</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {!loading && !card && !error && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-10 text-center">
            <ScrollText size={40} className="mx-auto text-slate-300 dark:text-slate-500" />
            <p className="mt-3 text-slate-500 dark:text-slate-400 text-sm">เลือกยาเพื่อดูประวัติการเคลื่อนไหวทุก lot ทุกเดือน</p>
          </div>
        )}
      </div>

      {driftRow && <DriftModal row={driftRow} onClose={() => setDriftRow(null)} />}
    </div>
  )
}

// โมดอลอธิบาย "ยอดไม่ตรงบันทึก" — แทน tooltip title ที่แตะไม่ได้บนมือถือ (Rule #5 + ผู้ใช้เปิดผ่าน LINE)
function DriftModal({ row, onClose }) {
  const calc = row.balanceBefore             // ยอดสะสมก่อนหักแถวนี้ (จาก stockCard.js — ไม่คำนวณเองใน UI)
  const recorded = row.qtyBefore             // ยอดก่อนเบิกที่ต้นทางบันทึก
  const diff = row.drift
  const more = diff > 0                      // บวก = ระบบคิดว่ามีมากกว่าที่บันทึก (ของหายไปโดยไม่มีแถว)
  // แถวไม่หักยอด (บันทึกเท่านั้น/แก้ไขระบบ): หลังเบิกควร = ก่อนเบิก (stockCard.js rowErr)
  const expectAfter = row.noDeduct ? recorded : recorded - row.qtyOut
  const title = row.hasDrift ? (row.fromMigration ? 'ข้อมูลก่อนเริ่มใช้ระบบ' : 'ยอดไม่ตรง') : 'แถวกรอกผิด'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-100 dark:bg-amber-950/60 text-amber-600 rounded-xl shrink-0"><AlertTriangle size={18} /></div>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight">{title}</p>
              <p className="text-slate-400 dark:text-slate-500 text-xs">Lot {row.lot} · {fmtThai(row.date)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg shrink-0" aria-label="ปิด">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* แถวตามที่ชีทเบิกบันทึก — ให้เห็นว่าสมการในแถวถูกไหม */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 border-b border-slate-200 dark:border-slate-700">
              แถวนี้ตามชีทเบิก
            </p>
            <table className="w-full text-sm">
              <tbody>
                <tr className={row.hasDrift ? 'border-b border-slate-100 dark:border-slate-800 bg-amber-50 dark:bg-amber-950/40' : 'border-b border-slate-100 dark:border-slate-800'}>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                    คงเหลือก่อนเบิก
                    {row.hasDrift && <span className="ml-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">← ไม่ถูกต้อง</span>}
                  </td>
                  <td className={`px-3 py-2 text-right font-bold ${row.hasDrift ? 'text-amber-700 dark:text-amber-300' : 'text-slate-800 dark:text-slate-100'}`}>
                    {fmtNum(recorded)}
                    {row.hasDrift && <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">ควรเป็น {fmtNum(calc)}</span>}
                  </td>
                </tr>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                    เบิกออก
                    {row.noDeduct && <span className="block text-[11px]">แถว{row.kind} — ไม่ตัดยอด</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-slate-800 dark:text-slate-100">{row.noDeduct ? fmtNum(row.qtyOut) : `− ${fmtNum(row.qtyOut)}`}</td>
                </tr>
                <tr className={row.hasRowErr ? 'bg-rose-50 dark:bg-rose-950/40' : 'bg-slate-50 dark:bg-slate-800'}>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">คงเหลือหลังเบิก</td>
                  <td className={`px-3 py-2 text-right font-bold ${row.hasRowErr ? 'text-rose-700 dark:text-rose-300' : 'text-slate-800 dark:text-slate-100'}`}>
                    {row.qtyAfter == null ? '(ไม่ได้บันทึก)' : fmtNum(row.qtyAfter)}
                  </td>
                </tr>
              </tbody>
            </table>
            {row.hasRowErr ? (
              <p className="text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 border-t border-rose-200 dark:border-rose-900/60">
                <b>แถวนี้กรอกผิด</b> — {row.noDeduct
                  ? `แถวไม่ตัดยอด หลังเบิกควรเท่าก่อนเบิก ${fmtNum(expectAfter)}`
                  : `${fmtNum(recorded)} − ${fmtNum(row.qtyOut)} ควรได้ ${fmtNum(expectAfter)}`}
                {' '}แต่ชีทเบิกบันทึก {fmtNum(row.qtyAfter)} (ต่าง {fmtNum(Math.abs(row.rowErr))})
              </p>
            ) : row.qtyAfter != null ? (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 border-t border-emerald-200 dark:border-emerald-900/60">
                สมการในแถวนี้ถูกต้อง ({row.noDeduct
                  ? `ไม่ตัดยอด หลังเบิก = ก่อนเบิก = ${fmtNum(row.qtyAfter)}`
                  : `${fmtNum(recorded)} − ${fmtNum(row.qtyOut)} = ${fmtNum(row.qtyAfter)}`})
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-3 py-2 border-t border-slate-200 dark:border-slate-700">
                แถวนี้<b>ไม่ได้บันทึกยอดหลังเบิก</b> — ตรวจสมการในแถวไม่ได้
              </p>
            )}
          </div>

          {/* เทียบคงเหลือก่อนเบิกตามชีทเบิก กับยอดที่ไล่จากประวัติ — แสดงเฉพาะแถวที่ยอดไม่ตรงจริง
              (แถวกรอกผิดอย่างเดียวผลต่าง = 0 กล่องนี้จะชวนเข้าใจผิด) */}
          {row.hasDrift && (
          <div className="border border-amber-200 dark:border-amber-900/60 rounded-xl overflow-hidden">
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 border-b border-amber-200 dark:border-amber-900/60">
              เทียบกับยอดที่ไล่จากประวัติ
            </p>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">ไล่จากประวัติรับ-เบิก</td>
                  <td className="px-3 py-2 text-right font-bold text-slate-800 dark:text-slate-100">{fmtNum(calc)}</td>
                </tr>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">คงเหลือก่อนเบิกตามชีทเบิก</td>
                  <td className="px-3 py-2 text-right font-bold text-slate-800 dark:text-slate-100">{fmtNum(recorded)}</td>
                </tr>
                <tr className="bg-amber-50 dark:bg-amber-950/40">
                  <td className="px-3 py-2 text-amber-700 dark:text-amber-300 font-semibold">ต่างกัน</td>
                  <td className="px-3 py-2 text-right font-bold text-amber-800 dark:text-amber-300">{diff > 0 ? '+' : ''}{fmtNum(diff)}</td>
                </tr>
              </tbody>
            </table>
            {row.driftDelta != null && row.driftDelta !== diff && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 px-3 py-2 border-t border-slate-100 dark:border-slate-800">
                หายเฉพาะจุดนี้ <b className="text-amber-700 dark:text-amber-300">{fmtNum(Math.abs(row.driftDelta))}</b> ·
                ที่เหลือค้างมาจากช่องว่างก่อนหน้า
              </p>
            )}
          </div>
          )}

          <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 leading-relaxed">
            <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">แปลว่าอะไร</p>
            {row.hasRowErr ? (
              <p>
                <b className="text-rose-700 dark:text-rose-300">แถวนี้กรอกผิดที่ต้นทาง</b> — ตัวเลขก่อนเบิก/เบิกออก/หลังเบิก
                ไม่สอดคล้องกันเอง ควรตรวจกับชีทเบิกว่ากรอกตกหล่นหรือไม่ได้ตัดยอด
              </p>
            ) : (
              <>
                <p>
                  <b className="text-amber-700 dark:text-amber-300">คงเหลือก่อนเบิกตามชีทเบิก ({fmtNum(recorded)}) ไม่ตรง</b> —
                  ไล่จากประวัติได้ {fmtNum(calc)}
                  {more
                    ? ' แปลว่ามีการเบิกไปก่อนหน้านี้แล้วไม่ได้ลงชีทเบิก'
                    : ' แปลว่ามีของเข้าเพิ่มโดยไม่มีบิลรับบันทึกไว้'}
                </p>
                <p className="mt-1.5">
                  <b>ตัวเลข &ldquo;เบิกออก {fmtNum(row.qtyOut)}&rdquo; ไม่ได้ผิด</b> — ที่ไม่ตรงคือคงเหลือก่อนเบิกที่ชีทเบิกบันทึก
                  {row.qtyAfter == null && ' (แถวนี้ไม่ได้บันทึกยอดหลังเบิก จึงตรวจสมการในแถวไม่ได้)'}
                </p>
              </>
            )}
            {row.hasDrift && row.fromMigration && (
              <p className="mt-1.5 text-slate-500 dark:text-slate-400">
                แถวนี้เป็น<b>ข้อมูลก่อนเริ่มใช้ระบบ</b> ({displayRef(row.ref)}) — ประวัติการเบิกก่อน ต.ค.68
                ไม่ได้นำเข้าระบบ ช่องว่างนี้จึงไม่ใช่ของหาย ไม่ต้องตามแก้
              </p>
            )}
            <p className="mt-1.5 text-slate-500 dark:text-slate-400">
              ระบบ<b>ไม่แก้ยอดให้อัตโนมัติ</b> — เป็นข้อมูลต้นทางที่ต้องให้คนตรวจสอบก่อน
            </p>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-3">
            <p>ชนิดรายการ: <b className="text-slate-700 dark:text-slate-200">{row.kind || '-'}</b></p>
            {row.party && <p>{row.side === 'in' ? 'บริษัท' : 'หน่วยงาน'}: <b className="text-slate-700 dark:text-slate-200">{row.party}</b></p>}
            {row.ref && <p>หมายเหตุ: <b className="text-slate-700 dark:text-slate-200">{displayRef(row.ref)}</b></p>}
          </div>
        </div>
      </div>
    </div>
  )
}
