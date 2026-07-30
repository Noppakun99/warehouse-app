import React, { useState, useEffect, useMemo } from 'react'
import { ScrollText, Package, AlertTriangle, TrendingUp, TrendingDown, Filter, X } from 'lucide-react'
import { fetchInventoryNameCodeMap, fetchStockCard } from './lib/db'
import { buildStockCard, filterStockCard } from './lib/stockCard'
import DrugSearchBar from './DrugSearchBar'
import BackButton from './BackButton'

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

// badge ชนิดรายการ — สีตามความหมาย (เข้า=เขียว, ไม่หักยอด=เทา, ออก=ขาว)
function KindBadge({ kind, side, noDeduct }) {
  const cls = noDeduct ? 'bg-slate-100 text-slate-500 border-slate-200'
    : side === 'in' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-white text-slate-600 border-slate-200'
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>{kind || '-'}</span>
}

export default function StockCardApp({ onGoBack, canGoBack, onRefresh }) {
  const [drugOptions, setDrugOptions] = useState([])
  const [nameToCode, setNameToCode] = useState({})
  const [drugName, setDrugName] = useState('')
  const [data, setData] = useState(null)      // { receiveRows, dispenseRows, meta }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lotFilter, setLotFilter] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [driftRow, setDriftRow] = useState(null)   // แถวที่กดดูรายละเอียด "ยอดไม่ตรงบันทึก"

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

  const loadCard = async (name) => {
    const code = nameToCode[name]
    if (!code) { setData(null); return }
    setLoading(true); setError('')
    try {
      setData(await fetchStockCard(code))
      setLotFilter(''); setKindFilter('')
    } catch (e) { setError(e.message); setData(null) }
    finally { setLoading(false) }
  }

  const card = useMemo(() => {
    if (!data) return null
    return buildStockCard({
      receiveRows: data.receiveRows,
      dispenseRows: data.dispenseRows,
      pricePerUnit: data.meta?.pricePerUnit || 0,
    })
  }, [data])

  const visibleRows = useMemo(
    () => (card ? filterStockCard(card.rows, { lot: lotFilter || undefined, kind: kindFilter || undefined }) : []),
    [card, lotFilter, kindFilter]
  )
  const kinds = useMemo(
    () => (card ? [...new Set(card.rows.map(r => r.kind).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')) : []),
    [card]
  )

  const meta = data?.meta
  const hasFilter = !!(lotFilter || kindFilter)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* title bar ขาวบาง + ไอคอนสีประจำระบบ (teal) */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
          <div className="p-2 bg-teal-100 text-teal-600 rounded-xl shrink-0"><ScrollText size={20} /></div>
          <button onClick={onRefresh} className="text-left hover:opacity-70 transition-opacity" title="คลิกเพื่อโหลดใหม่">
            <p className="font-bold text-sm leading-tight text-slate-800">การ์ดคลัง lot</p>
            <p className="text-slate-400 text-xs">Stock Card — ประวัติทุก lot ทุกเดือน</p>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5 space-y-4">
        {/* เลือกยา */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">เลือกยา</label>
          <DrugSearchBar
            value={drugName}
            onChange={(v) => { setDrugName(v); if (nameToCode[v]) loadCard(v) }}
            options={drugOptions}
            placeholder="พิมพ์ชื่อยาเพื่อดูประวัติทุก lot..."
            ringClass="focus:ring-teal-400"
            hoverClass="hover:bg-teal-50"
          />
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}
        {loading && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-sm">กำลังโหลด...</div>
        )}

        {!loading && card && meta && (
          <>
            {/* header ยา: รหัส / หน่วย / ราคา / จำนวน lot (ตาม Excel row 5) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="font-bold text-slate-800 text-lg leading-tight">{meta.name || '-'}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm">
                <span className="text-slate-500">รหัส: <b className="text-slate-700">{meta.code}</b></span>
                <span className="text-slate-500">หน่วย: <b className="text-slate-700">{meta.unit || '-'}</b></span>
                <span className="text-slate-500">ราคา/หน่วย: <b className="text-slate-700">{fmtNum(meta.pricePerUnit)}</b></span>
                <span className="text-slate-500">จำนวน Lot: <b className="text-slate-700">{card.summary.lotCount}</b></span>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <TrendingUp size={13} /> รับเข้ารวม {fmtNum(card.summary.totalIn)}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                  <TrendingDown size={13} /> เบิกออกรวม {fmtNum(card.summary.totalOut)}
                </span>
                {card.summary.negativeLots > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-300">
                    <AlertTriangle size={13} /> คงเหลือติดลบ {card.summary.negativeLots} lot
                  </span>
                )}
                {card.summary.driftLots > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                    <AlertTriangle size={13} /> ยอดไม่ตรงบันทึก {card.summary.driftLots} lot
                  </span>
                )}
              </div>
              {card.summary.driftLots > 0 && (
                <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  พบ {card.summary.driftRows} แถวที่ยอดคำนวณไม่ตรงกับ &quot;คงเหลือก่อนเบิก&quot; ที่บันทึกไว้ —
                  แปลว่ามีการเคลื่อนไหวที่ไม่ได้ถูกบันทึกในระบบ (ไม่ใช่การคำนวณผิด) ดูแถวที่มีเครื่องหมายเตือน
                </p>
              )}
            </div>

            {/* ตัวกรอง (พับได้) */}
            <div className="bg-white rounded-2xl border border-slate-200">
              <button
                onClick={() => setShowFilter(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-2xl transition-colors"
              >
                <span className="flex items-center gap-2"><Filter size={15} /> ตัวกรอง
                  {hasFilter && <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[11px]">กำลังกรอง</span>}
                </span>
                <span className="text-xs text-slate-400">{visibleRows.length} / {card.rows.length} รายการ</span>
              </button>
              {showFilter && (
                <div className="px-4 pb-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Lot</label>
                    <select value={lotFilter} onChange={e => setLotFilter(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-400 outline-none">
                      <option value="">ทุก lot</option>
                      {card.lots.map(l => <option key={l.lot} value={l.lot}>{l.lot}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">ชนิดรายการ</label>
                    <select value={kindFilter} onChange={e => setKindFilter(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-400 outline-none">
                      <option value="">ทุกชนิด</option>
                      {kinds.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                  {hasFilter && (
                    <button onClick={() => { setLotFilter(''); setKindFilter('') }}
                      className="self-end flex items-center gap-1 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700">
                      <X size={14} /> ล้างตัวกรอง
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ตาราง (desktop) */}
            <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto max-h-[70vh]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-100 text-slate-600">
                      {['วันที่', 'Lot', 'ชนิดรายการ', 'รับเข้า', 'เบิกออก', 'คงเหลือ Lot', 'หน่วยงาน/บริษัท', 'หมายเหตุ/บิล', 'มูลค่า', 'Exp'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-bold whitespace-nowrap border-b border-slate-200">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r, i) => (
                      <tr key={i} className={`border-b border-slate-100 ${r.qtyIn > 0 ? 'bg-emerald-50/60' : ''}`}>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtThai(r.date)}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-700">{r.lot}</td>
                        <td className="px-3 py-2 whitespace-nowrap"><KindBadge kind={r.kind} side={r.side} noDeduct={r.noDeduct} /></td>
                        <td className="px-3 py-2 text-right text-emerald-700 font-semibold">{r.qtyIn > 0 ? fmtNum(r.qtyIn) : '-'}</td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {r.qtyOut > 0 ? fmtNum(r.qtyOut) : '-'}
                          {r.noDeduct && r.qtyOut > 0 && <span className="ml-1 text-[10px] text-slate-400">(ไม่หัก)</span>}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${r.balance < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                          {fmtNum(r.balance)}
                          {r.hasDrift && (
                            <button
                              onClick={() => setDriftRow(r)}
                              className="ml-1 inline-flex items-center align-middle text-amber-600 hover:text-amber-700 hover:bg-amber-100 rounded p-0.5 transition-colors"
                              aria-label="ดูรายละเอียดยอดไม่ตรง"
                            >
                              <AlertTriangle size={13} />
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate" title={r.party}>{r.party || '-'}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs max-w-[200px] truncate" title={r.ref}>{r.ref || '-'}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{r.value ? fmtNum(r.value) : '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-500 text-xs">{fmtThai(r.exp)}</td>
                      </tr>
                    ))}
                    {visibleRows.length === 0 && (
                      <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-400">ไม่มีรายการตามตัวกรอง</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* card list (mobile < 768px — Rule #5) */}
            <div className="md:hidden space-y-2">
              {visibleRows.map((r, i) => (
                <div key={i} className={`bg-white rounded-xl border p-3 ${r.qtyIn > 0 ? 'border-emerald-200' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">{fmtThai(r.date)}</span>
                    <KindBadge kind={r.kind} side={r.side} noDeduct={r.noDeduct} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Package size={14} className="text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-700 text-sm">Lot {r.lot}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="bg-emerald-50 rounded-lg py-1.5">
                      <p className="text-[10px] text-emerald-600">รับเข้า</p>
                      <p className="font-bold text-emerald-700 text-sm">{r.qtyIn > 0 ? fmtNum(r.qtyIn) : '-'}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg py-1.5">
                      <p className="text-[10px] text-slate-500">เบิกออก</p>
                      <p className="font-bold text-slate-700 text-sm">{r.qtyOut > 0 ? fmtNum(r.qtyOut) : '-'}</p>
                    </div>
                    <div className={`rounded-lg py-1.5 ${r.balance < 0 ? 'bg-rose-50' : 'bg-teal-50'}`}>
                      <p className={`text-[10px] ${r.balance < 0 ? 'text-rose-600' : 'text-teal-600'}`}>คงเหลือ</p>
                      <p className={`font-bold text-sm ${r.balance < 0 ? 'text-rose-700' : 'text-teal-700'}`}>{fmtNum(r.balance)}</p>
                    </div>
                  </div>
                  {r.hasDrift && (
                    <button
                      onClick={() => setDriftRow(r)}
                      className="mt-2 w-full flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 text-left active:bg-amber-100"
                    >
                      <AlertTriangle size={13} className="shrink-0" />
                      <span>ยอดไม่ตรงบันทึก (ต่าง {fmtNum(r.drift)}) — แตะดูรายละเอียด</span>
                    </button>
                  )}
                  <div className="mt-2 text-xs text-slate-500 space-y-0.5">
                    {r.party && <p>{r.side === 'in' ? 'บริษัท' : 'หน่วยงาน'}: {r.party}</p>}
                    {r.ref && <p className="truncate">อ้างอิง: {r.ref}</p>}
                    {r.exp && r.exp !== '-' && <p>Exp: {fmtThai(r.exp)}</p>}
                  </div>
                </div>
              ))}
              {visibleRows.length === 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">ไม่มีรายการตามตัวกรอง</div>
              )}
            </div>
          </>
        )}

        {!loading && !card && !error && (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
            <ScrollText size={40} className="mx-auto text-slate-300" />
            <p className="mt-3 text-slate-500 text-sm">เลือกยาเพื่อดูประวัติการเคลื่อนไหวทุก lot ทุกเดือน</p>
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-xl shrink-0"><AlertTriangle size={18} /></div>
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">ยอดไม่ตรงกับที่บันทึก</p>
              <p className="text-slate-400 text-xs">Lot {row.lot} · {fmtThai(row.date)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg shrink-0" aria-label="ปิด">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <p className="text-[11px] text-slate-500">ยอดที่ระบบคำนวณ</p>
              <p className="font-bold text-slate-800 text-lg">{fmtNum(calc)}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <p className="text-[11px] text-slate-500">ยอดที่บันทึกไว้</p>
              <p className="font-bold text-slate-800 text-lg">{fmtNum(recorded)}</p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            <p className="text-[11px] text-amber-700">ผลต่าง</p>
            <p className="font-bold text-amber-800 text-xl">{diff > 0 ? '+' : ''}{fmtNum(diff)}</p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              {more ? 'ระบบคิดว่ามีมากกว่าที่บันทึก' : 'ระบบคิดว่ามีน้อยกว่าที่บันทึก'}
            </p>
          </div>

          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 leading-relaxed">
            <p className="font-semibold text-slate-700 mb-1">หมายความว่าอะไร</p>
            <p>
              {more
                ? 'มียาออกจาก lot นี้โดยไม่มีแถวเบิกรองรับ — เบิกจริงแต่ไม่ได้ลงบันทึก หรือถูกโอน/ปรับยอดนอกระบบ'
                : 'มียาเข้า lot นี้โดยไม่มีแถวรับรองรับ — รับเข้าแต่ไม่ได้ลงบันทึก หรือยอดตั้งต้นไม่ครบ'}
            </p>
            <p className="mt-1.5 text-slate-500">
              เป็นปัญหา<b>ข้อมูลต้นทาง</b> ไม่ใช่การคำนวณผิด — ระบบไม่แก้ยอดให้อัตโนมัติ
              เพราะต้องให้คนตรวจสอบว่าของหายไปไหนก่อน
            </p>
          </div>

          <div className="text-xs text-slate-500 space-y-1 border-t border-slate-100 pt-3">
            <p>ชนิดรายการ: <b className="text-slate-700">{row.kind || '-'}</b></p>
            {row.party && <p>{row.side === 'in' ? 'บริษัท' : 'หน่วยงาน'}: <b className="text-slate-700">{row.party}</b></p>}
            {row.ref && <p>อ้างอิง: <b className="text-slate-700">{row.ref}</b></p>}
          </div>
        </div>
      </div>
    </div>
  )
}
