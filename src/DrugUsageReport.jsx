// DrugUsageReport.jsx — หน้า "ค้นยา · สรุปรับ-เบิก" (หน้าแรกของ ReorderApp — 14/11/2569)
// ค้นยาทีละตัวหรือหลายตัว → คงเหลือ · เรท · ยอดเบิกรายเดือน · หน่วยงานที่เบิก (มาก/น้อยสุด) · รับเข้า · แจ้งซื้อ
// ตัวเลขทุกตัวมาจาก report ชุดเดียว (src/lib/usageReport.js) — จอ / Excel / ใบพิมพ์ / ข้อความไลน์ ตรงกัน (Rule #6)
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Copy, FileSpreadsheet, Printer, Loader2, Building2, Truck, ShoppingBag, AlertTriangle, Pill } from 'lucide-react';
import { fetchDrugSearchIndex, fetchDrugUsageReport } from './lib/db';
import { searchDrugs, packUnitLabel } from './lib/drugProfile';
import { isoMonthsAgo, isoPrevMonthEnd } from './lib/reorder';
import { usageReportLineText, usageReportSheets, usageReportHtml, purchaseStatusText, nonDeptText, fmtQty, fmtThaiDate, unitShort } from './lib/usageReport';
import { exportSheetsToExcel } from './lib/exportExcel';
import { openPrintView } from './lib/openPrintView';
import { localYmd } from '../supabase/functions/_shared/usageRow.js';
import { copyText } from './lib/clipboard';

const RANGES = [12, 6, 3];
const MAX_DRUGS = 20;


export default function DrugUsageReport({ auth = {}, onToast }) {
  const [index, setIndex] = useState(null);
  const [indexError, setIndexError] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState([]);          // [{ code, name }]
  const [months, setMonths] = useState(12);
  const [state, setState] = useState({ loading: false, error: '', reports: [] });
  const reqId = useRef(0);
  const boxRef = useRef(null);

  useEffect(() => {
    fetchDrugSearchIndex().then(setIndex).catch(e => setIndexError(e?.message || 'โหลดรายชื่อยาไม่สำเร็จ'));
  }, []);

  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const suggestions = useMemo(() => {
    if (!index) return [];
    const chosen = new Set(picked.map(p => p.code));
    return searchDrugs(index, q, 12).filter(d => !chosen.has(d.code)).slice(0, 8);
  }, [index, q, picked]);

  // โหลดในตัวจัดการเหตุการณ์ (ไม่ใช่ effect) — reqId ทิ้งผลของคำขอเก่าที่ตอบช้ากว่า
  const load = async (list, n) => {
    const id = ++reqId.current;
    if (!list.length) { setState({ loading: false, error: '', reports: [] }); return; }
    setState(s => ({ ...s, loading: true, error: '' }));
    try {
      const reports = await fetchDrugUsageReport(list.map(p => p.code), { from: isoMonthsAgo(n), to: isoPrevMonthEnd() });
      if (id === reqId.current) setState({ loading: false, error: '', reports });
    } catch (e) {
      if (id === reqId.current) setState(s => ({ ...s, loading: false, error: e?.message || 'โหลดข้อมูลไม่สำเร็จ' }));
    }
  };

  const add = (d) => {
    if (picked.length >= MAX_DRUGS) { onToast?.({ tone: 'error', message: `เลือกได้สูงสุด ${MAX_DRUGS} รายการต่อรายงาน` }); return; }
    const next = [...picked, { code: d.code, name: d.name }];
    setPicked(next); setQ(''); setOpen(false);
    load(next, months);
  };
  const remove = (code) => { const next = picked.filter(p => p.code !== code); setPicked(next); load(next, months); };
  const clearAll = () => { setPicked([]); load([], months); };
  const pickRange = (n) => { setMonths(n); load(picked, n); };

  const reports = state.reports;
  const updatedAt = reports[0]?.inventoryUpdatedAt || null;
  const missing = picked.filter(p => !reports.some(r => r.code === p.code));

  const onCopy = async () => {
    const ok = await copyText(usageReportLineText(reports));
    onToast?.(ok ? { tone: 'success', message: 'คัดลอกข้อความแล้ว — วางในไลน์ได้เลย' } : { tone: 'error', message: 'คัดลอกไม่สำเร็จ' });
  };
  const onExcel = async () => {
    try {
      await exportSheetsToExcel(usageReportSheets(reports, { updatedAt }), `สรุปรับเบิก_${localYmd(new Date())}.xlsx`, auth,
        { tableName: 'drug_usage_report', details: { codes: reports.map(r => r.code), months } });
    } catch (e) { onToast?.({ tone: 'error', message: 'ส่งออก Excel ไม่สำเร็จ: ' + (e?.message || e) }); }
  };
  const onPrint = () => openPrintView(usageReportHtml(reports, { printedBy: auth?.name || auth?.username || '', updatedAt }));

  const actionBtn = 'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';

  return (
    <div className="space-y-4">
      {/* ค้นยา + ช่วงข้อมูล + ส่งออก */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4 space-y-3">
        <div ref={boxRef} className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Enter' && suggestions[0]) { e.preventDefault(); add(suggestions[0]); }
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder={index ? 'ค้นชื่อยา รหัส หรือ lot แล้วกด Enter — เพิ่มได้หลายตัว' : 'กำลังโหลดรายชื่อยา…'}
            aria-label="ค้นหายา"
            className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-xl pl-10 pr-4 py-3 text-base text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          {open && q.trim() && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
              {suggestions.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">ไม่พบยาที่ตรงกับ “{q}”</p>
              ) : suggestions.map(d => (
                <button key={d.code} type="button" onClick={() => add(d)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors cursor-pointer">
                  <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 w-20 shrink-0">{d.code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={d.name}>{d.name}</span>
                  {d.matchedLot && <span className="text-[11px] text-slate-400 shrink-0">lot {d.matchedLot}</span>}
                  {!d.inStock && <span className="text-[11px] text-slate-400 shrink-0">ไม่มีของ</span>}
                </button>
              ))}
            </div>
          )}
          {indexError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{indexError}</p>}
        </div>

        {picked.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {picked.map(p => (
              <span key={p.code} className="inline-flex items-center gap-1.5 max-w-full rounded-full bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/60 text-orange-800 dark:text-orange-200 pl-3 pr-1 py-1 text-sm">
                <span className="truncate" title={`${p.name} (${p.code})`}>{p.name}</span>
                <button type="button" onClick={() => remove(p.code)} aria-label={`เอา ${p.name} ออก`}
                  className="rounded-full p-0.5 hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors cursor-pointer"><X size={14} /></button>
              </span>
            ))}
            {picked.length > 1 && (
              <button type="button" onClick={clearAll} className="text-xs font-semibold text-slate-500 dark:text-slate-400 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer">ล้างทั้งหมด</button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">ช่วงข้อมูล</span>
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5" role="group" aria-label="ช่วงข้อมูล">
              {RANGES.map(n => (
                <button key={n} type="button" onClick={() => pickRange(n)} aria-pressed={months === n}
                  className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${months === n ? 'bg-white dark:bg-slate-900 text-orange-700 dark:text-orange-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                  {n} เดือน
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onCopy} disabled={!reports.length || state.loading}
              className={`${actionBtn} bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white`}>
              <Copy size={15} /> คัดลอกข้อความไลน์
            </button>
            <button type="button" onClick={onExcel} disabled={!reports.length || state.loading}
              className={`${actionBtn} bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 hover:border-slate-400 text-slate-700 dark:text-slate-200`}>
              <FileSpreadsheet size={15} /> Excel
            </button>
            <button type="button" onClick={onPrint} disabled={!reports.length || state.loading}
              className={`${actionBtn} bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 hover:border-slate-400 text-slate-700 dark:text-slate-200`}>
              <Printer size={15} /> พิมพ์
            </button>
          </div>
        </div>
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl px-4 py-3">{state.error}</p>
      )}

      {!picked.length ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl px-6 py-10 text-center">
          <Pill size={28} className="mx-auto text-orange-400" />
          <p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">พิมพ์ชื่อยาเพื่อดูสรุปรับ-เบิก</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">คงเหลือ · เรท · เบิกรายเดือน · หน่วยงานที่เบิกมาก/น้อยสุด · รับเข้า · แจ้งซื้อหรือยัง — เลือกหลายตัวเพื่อรวมเป็นรายงานเดียว</p>
        </div>
      ) : state.loading && !reports.length ? (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-500 dark:text-slate-400"><Loader2 size={18} className="animate-spin" /> กำลังโหลด…</div>
      ) : (
        <div className={`space-y-4 ${state.loading ? 'opacity-60' : ''}`}>
          {missing.length > 0 && !state.loading && (
            <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl px-4 py-3">
              ไม่พบในคลัง: {missing.map(m => m.name).join(', ')}
            </p>
          )}
          {reports.length > 1 && <SummaryTable reports={reports} />}
          {reports.map(r => <DrugSection key={r.code} r={r} />)}
          {updatedAt && <p className="text-xs text-slate-400 dark:text-slate-500 text-right">ข้อมูลคงคลัง ณ นำเข้าล่าสุด {fmtThaiDate(updatedAt)}</p>}
        </div>
      )}
    </div>
  );
}

// ── ตารางรวมเมื่อเลือกหลายยา (1 แถวต่อยา — หน่วยต่างกัน ไม่รวมยอดข้ามยา) ─────────────
function SummaryTable({ reports }) {
  const go = (code) => document.getElementById(`usage-${code}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <h3 className="font-bold text-slate-800 dark:text-slate-100">สรุป {reports.length} รายการ · {reports[0].range.label}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">กดชื่อยาเพื่อเลื่อนไปดูรายละเอียด · ตัวเลขเป็นหน่วยหลักของยาแต่ละตัว</p>
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
              <th className="px-4 py-3 text-left bg-slate-50/80 dark:bg-slate-800/60">ยา</th>
              <th className="px-4 py-3 text-right bg-slate-50/80 dark:bg-slate-800/60">คงเหลือ</th>
              <th className="px-4 py-3 text-right bg-slate-50/80 dark:bg-slate-800/60">เรท/เดือน</th>
              <th className="px-4 py-3 text-left bg-slate-50/80 dark:bg-slate-800/60">คงอยู่ได้อีก</th>
              <th className="px-4 py-3 text-right bg-slate-50/80 dark:bg-slate-800/60">เบิกรวม</th>
              <th className="px-4 py-3 text-left bg-slate-50/80 dark:bg-slate-800/60">เบิกมากสุด</th>
              <th className="px-4 py-3 text-left bg-slate-50/80 dark:bg-slate-800/60">แจ้งซื้อ</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.code} className="border-b border-slate-50 dark:border-slate-800 hover:bg-orange-50/50 dark:hover:bg-orange-950/20 transition-colors">
                <td className="px-4 py-3">
                  <button type="button" onClick={() => go(r.code)} className="text-left font-semibold text-slate-800 dark:text-slate-100 underline underline-offset-2 decoration-slate-300 hover:text-orange-700 dark:hover:text-orange-300 cursor-pointer">{r.name}</button>
                  <div className="text-xs text-slate-400 font-mono">{r.code} · {packUnitLabel(r.mainUnit)}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-800 dark:text-slate-100">{fmtQty(r.total)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.rate ? fmtQty(r.rate.avgMonth) : '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap">{r.rate?.coverage || '-'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtQty(r.usage.total)}</td>
                <td className="px-4 py-3">{r.usage.top ? `${r.usage.top.department} ${fmtQty(r.usage.top.qty)}` : '-'}</td>
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{purchaseStatusText(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
        {reports.map(r => (
          <button key={r.code} type="button" onClick={() => go(r.code)} className="w-full text-left px-4 py-3 active:bg-orange-50 dark:active:bg-orange-950/30 transition-colors cursor-pointer">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 dark:text-slate-100 break-words">{r.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">เรท {r.rate ? fmtQty(r.rate.avgMonth) : '-'}/เดือน · อยู่ได้ {r.rate?.coverage || '-'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-black tabular-nums text-slate-800 dark:text-slate-100">{fmtQty(r.total)}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{unitShort(r.mainUnit)}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, unit, sub, tone = 'slate' }) {
  const box = {
    slate: 'bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-700',
    orange: 'bg-orange-50 dark:bg-orange-950/40 border-orange-100 dark:border-orange-900/60',
    red: 'bg-red-50 dark:bg-red-950/40 border-red-100 dark:border-red-900/60',
    blue: 'bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/60',
  }[tone];
  return (
    <div className={`rounded-xl border px-3.5 py-3 min-w-0 ${box}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
        <span className="text-2xl font-black tabular-nums text-slate-900 dark:text-slate-50">{value}</span>
        {unit && <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-600 dark:text-slate-300 break-words">{sub}</div>}
    </div>
  );
}

// ── รายละเอียด 1 ยา ───────────────────────────────────────────────
function DrugSection({ r }) {
  const u = unitShort(r.mainUnit);
  const maxMonth = Math.max(1, ...r.usage.monthly.map(m => m.qty));
  const maxDept = Math.max(1, ...r.usage.departments.map(d => d.qty));
  const lowSet = new Set(r.usage.lowest.map(d => d.department));
  const pr = r.pendingRequest;
  const lowStockSub = r.split.pending > 0 || r.split.expired > 0
    ? [r.split.pending > 0 && `รอตรวจรับ ${fmtQty(r.split.pending)}`, r.split.expired > 0 && `หมดอายุ ${fmtQty(r.split.expired)}`].filter(Boolean).join(' · ')
    : 'พร้อมเบิกทั้งหมด';
  return (
    <section id={`usage-${r.code}`} className="scroll-mt-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4 sm:p-5 space-y-5">
      {/* หัว: ชื่อ + ป้าย */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 rounded-md px-1.5 py-0.5">{r.code}</span>
            {r.type && <span className="text-xs text-slate-500 dark:text-slate-400">{r.type}</span>}
            {r.discontinued && <span className="rounded-full bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 px-2.5 py-0.5 text-xs font-semibold">ตัดออกจากบัญชี</span>}
            {r.belowSS && <span className="rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 px-2.5 py-0.5 text-xs font-semibold">ต่ำกว่า Safety Stock</span>}
          </div>
          <h3 className="mt-1.5 text-lg font-bold text-slate-900 dark:text-slate-50 break-words">{r.name}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ช่วง {r.range.label} ({r.range.months.length} เดือน) · หน่วย = {packUnitLabel(r.mainUnit)}</p>
        </div>
        {pr ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-3 py-1 text-sm font-semibold" title={pr.reason || ''}>
            <ShoppingBag size={14} /> {purchaseStatusText(r)}
          </span>
        ) : null}
      </div>

      {r.unitNote && (
        <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> ยานี้มีหลายหน่วยในคลัง/บิล — ตัวเลขแปลงเป็น {packUnitLabel(r.mainUnit)} ตามบัตรยา (ดูคำอธิบายหน่วยในบัตรยา)
        </p>
      )}

      {/* ตัวเลขหลัก */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="คงเหลือ" value={fmtQty(r.total)} unit={u} sub={lowStockSub} tone={r.total <= 0 ? 'red' : 'slate'} />
        <Stat label="เรท/เดือน" value={r.rate && r.rate.avgMonth > 0 ? fmtQty(r.rate.avgMonth) : '-'} unit={r.rate?.avgMonth > 0 ? u : ''}
          sub={r.rate ? `${r.rate.monthLabel} · อยู่ได้อีก ${r.rate.coverage}` : null} tone="orange" />
        <Stat label="เบิกรวมในช่วง" value={fmtQty(r.usage.total)} unit={u} sub={`${fmtQty(r.usage.count)} ครั้ง · ${r.usage.departments.length} หน่วยงาน`} />
        <Stat label="รับเข้าในช่วง" value={r.receivedTotal == null ? '-' : fmtQty(r.receivedTotal)} unit={r.receivedTotal == null ? '' : u}
          sub={r.lastReceipt ? `ล่าสุด ${fmtThaiDate(r.lastReceipt.date)} · ${r.lastReceipt.supplier}` : 'ไม่มีประวัติรับ'} tone="blue" />
      </div>
      {/* แจ้งซื้อที่ยังรอของ → ป้ายบนหัวแล้ว · ไม่มีที่ค้าง → บอกครั้งล่าสุด/ไม่มี ตรงนี้ */}
      {!pr && <p className="text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2"><ShoppingBag size={15} className="text-blue-500 shrink-0" /> {purchaseStatusText(r)}</p>}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* รายเดือน */}
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">เบิกรายเดือน ({u})</h4>
          <ul className="space-y-1.5">
            {r.usage.monthly.map(m => (
              <li key={m.ym} className="grid grid-cols-[3.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-sm">
                <span className="text-slate-500 dark:text-slate-400">{m.label}</span>
                <span className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <span className="block h-full rounded-full bg-orange-400" style={{ width: `${(m.qty / maxMonth) * 100}%` }} />
                </span>
                <span className={`text-right tabular-nums ${m.qty ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-400'}`}>{fmtQty(m.qty)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* หน่วยงาน */}
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"><Building2 size={15} /> หน่วยงานที่เบิก ({u})</h4>
          {r.usage.departments.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">ไม่มีการเบิกในช่วงนี้</p>
          ) : (
            <ul className="space-y-1.5">
              {r.usage.departments.map((d, i) => (
                <li key={d.department} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 text-sm">
                  <span className="text-xs text-slate-400 tabular-nums text-right">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-slate-800 dark:text-slate-100" title={d.department}>{d.department}</span>
                      {i === 0 && <span className="shrink-0 rounded-full bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 px-2 py-0.5 text-[11px] font-semibold">มากสุด</span>}
                      {i > 0 && lowSet.has(d.department) && <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 text-[11px] font-semibold">น้อยสุด</span>}
                    </div>
                    <span className="mt-1 block h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <span className="block h-full rounded-full bg-sky-400" style={{ width: `${(d.qty / maxDept) * 100}%` }} />
                    </span>
                  </div>
                  <span className="text-right whitespace-nowrap">
                    <span className="tabular-nums font-semibold text-slate-800 dark:text-slate-100">{fmtQty(d.qty)}</span>
                    <span className="text-xs text-slate-400"> · {d.count} ครั้ง</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {nonDeptText(r.usage) && (
            <p className="text-xs text-slate-500 dark:text-slate-400">รวมในยอดเบิกแต่ไม่ใช่หน่วยงาน: {nonDeptText(r.usage)}</p>
          )}
        </div>
      </div>

      {/* รับเข้า */}
      <div className="space-y-2">
        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"><Truck size={15} /> รับเข้าในช่วง{r.receiptBills.length ? ` (${r.receiptBills.length} บิล · ${r.receipts.length} lot)` : ''}</h4>
        {r.receipts.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">ไม่มีรับเข้าในช่วงนี้{r.lastReceipt ? ` — รับล่าสุด ${fmtThaiDate(r.lastReceipt.date)} ${r.lastReceipt.supplier}` : ''}</p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                    <th className="px-3 py-2.5 text-left bg-slate-50/80 dark:bg-slate-800/60">วันที่รับ</th>
                    <th className="px-3 py-2.5 text-left bg-slate-50/80 dark:bg-slate-800/60">บริษัท</th>
                    <th className="px-3 py-2.5 text-left bg-slate-50/80 dark:bg-slate-800/60">เลขบิล</th>
                    <th className="px-3 py-2.5 text-left bg-slate-50/80 dark:bg-slate-800/60">Lot</th>
                    <th className="px-3 py-2.5 text-left bg-slate-50/80 dark:bg-slate-800/60">ประเภท</th>
                    <th className="px-3 py-2.5 text-right bg-slate-50/80 dark:bg-slate-800/60">จำนวน ({u})</th>
                  </tr>
                </thead>
                <tbody>
                  {r.receipts.map((x, i) => (
                    <tr key={`${x.billNumber}-${x.lot}-${i}`} className="border-b border-slate-50 dark:border-slate-800">
                      <td className="px-3 py-2 whitespace-nowrap">{fmtThaiDate(x.date)}</td>
                      <td className="px-3 py-2">{x.supplier}</td>
                      <td className="px-3 py-2 font-mono text-xs">{x.billNumber}</td>
                      <td className="px-3 py-2 font-mono text-xs">{x.lot}</td>
                      <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{x.purchaseType || '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{x.qtyMain != null ? fmtQty(x.qtyMain) : <span title="หน่วยตามบิลแปลงเป็นหน่วยหลักไม่ได้">{fmtQty(x.qty)} {x.unit}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden space-y-2">
              {r.receipts.map((x, i) => (
                <li key={`${x.billNumber}-${x.lot}-${i}`} className="rounded-xl border border-slate-100 dark:border-slate-800 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 break-words">{x.supplier}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{fmtThaiDate(x.date)} · บิล {x.billNumber} · lot {x.lot}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 text-xs font-bold tabular-nums">
                      {x.qtyMain != null ? `${fmtQty(x.qtyMain)} ${u}` : `${fmtQty(x.qty)} ${x.unit}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
