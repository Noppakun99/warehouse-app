// การ์ด lot รอตรวจรับ — ใช้ร่วม 2 ที่ ให้หน้าตา/ความหมายตรงกัน (user สั่ง 14/11/2569 เปลี่ยนตารางเลื่อนแนวนอนเป็นการ์ด):
//   1. โมดอลรอตรวจรับของแผนผังคลังยา (App.jsx — มีบิล/PO/บริษัทจาก receive_logs)
//   2. โมดอลรอตรวจรับบน Dashboard (PendingReceiveModal — มีเลขบิลจาก inventory ไม่มี PO/บริษัท)
import { useEffect, useMemo, useState } from 'react';
import { Clock, FileText, MapPin, Package, Search, X, ArrowRight } from 'lucide-react';
import { DrugTypeBadge } from './DrugSearchBar';

// ข้อความ/สีเดียวกับคอลัมน์ "รอตรวจรับมา" เดิม และใบพิมพ์ (trackingPrint fmtWaitDays)
function waitBadge(d) {
  if (d == null) return { text: 'ไม่ทราบวันรับ', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' };
  const text = d === 0 ? 'รับวันนี้' : `รอมา ${d} วัน`;
  if (d > 7) return { text, cls: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60' };
  if (d > 3) return { text, cls: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800/60' };
  return { text, cls: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-900/60' };
}

const fmtQtyUnit = (qty, unit) => {
  const n = Number(String(qty ?? '').replace(/,/g, ''));
  const q = Number.isFinite(n) && String(qty ?? '').trim() !== '' ? n.toLocaleString('th-TH') : (qty || '-');
  const u = (unit && String(unit).trim()) || 'หน่วย';
  return `${q} (${u})`;   // วงเล็บครอบหน่วย — "1 500เม็ด" ไม่ถูกอ่านเป็น 1,500
};

/**
 * @param {object} p.r  { name, code, type, location, lot, exp, qty, unit, invoice?, po?, supplier?, receiveStatus?, waitDays }
 * @param {Function} [p.onOpenDrug]  (code) → เปิดบัตรยา · ไม่ส่ง = ชื่อยาเป็นข้อความธรรมดา
 */
export default function PendingLotCard({ r, onOpenDrug }) {
  const b = waitBadge(r.waitDays);
  // ทุกใบ "รอตรวจรับ" อยู่แล้ว — โชว์เฉพาะสถานะอื่น (เช่น ผลพิจารณา คงไว้/ตัดออก)
  const extra = String(r.receiveStatus ?? r.receive_status ?? '').split('|').map(s => s.trim()).filter(s => s && !s.includes('รอตรวจรับ'));
  const hasCode = r.code && r.code !== '-';
  const invoice = String(r.invoice ?? '').trim();
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-sm flex flex-col gap-3 min-w-0">
      <div className="flex items-start gap-3">
        <span className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 shrink-0"><Package size={18} /></span>
        <div className="min-w-0 flex-1">
          {onOpenDrug && hasCode ? (
            <button type="button" onClick={() => onOpenDrug(r.code)}
              className="text-left font-bold text-sm text-slate-800 dark:text-slate-100 leading-snug break-words hover:text-sky-700 dark:hover:text-sky-300 hover:underline underline-offset-2">
              {r.name || '-'}
            </button>
          ) : (
            <p className="font-bold text-sm text-slate-800 dark:text-slate-100 leading-snug break-words">{r.name || '-'}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {hasCode && <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{r.code}</span>}
            {r.type && r.type !== '-' && <DrugTypeBadge type={r.type} />}
            {extra.map(s => (
              <span key={s} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${s.includes('ตัดออก') ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>{s}</span>
            ))}
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap shrink-0 ${b.cls}`}>
          <Clock size={11} />{b.text}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 min-w-0">
          <div className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold tracking-wider flex items-center gap-1"><MapPin size={10} />ตำแหน่ง</div>
          <div className="text-sm font-black text-indigo-700 dark:text-indigo-300 break-words">{r.location || '-'}</div>
        </div>
        <div className="bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1.5 rounded-xl border border-sky-100 dark:border-sky-900/50 min-w-0">
          <div className="text-[10px] text-sky-600 dark:text-sky-400 font-bold tracking-wider">คงเหลือ</div>
          <div className="text-sm font-black text-sky-700 dark:text-sky-300 tabular-nums break-words">{fmtQtyUnit(r.qty, r.unit)}</div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-100 dark:border-slate-700/60 min-w-0">
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold tracking-wider">Lot</div>
          <div className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 break-all">{r.lot || '-'}</div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-100 dark:border-slate-700/60 min-w-0">
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold tracking-wider">EXP</div>
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{r.exp || '-'}</div>
        </div>
      </div>

      {(invoice || (r.po && r.po !== '-') || r.supplier) && (
        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1.5 mt-auto">
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            {invoice && invoice !== '-' && (
              <span className="inline-flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900/50 max-w-full">
                <FileText size={10} className="shrink-0" /><span className="truncate" title={invoice}>บิล {invoice}</span>
              </span>
            )}
            {r.po && r.po !== '-' && (
              <span className="inline-flex items-center bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-semibold px-2 py-0.5 rounded-full border border-violet-100 dark:border-violet-900/50">PO {r.po}</span>
            )}
          </div>
          {r.supplier && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={r.supplier}><span className="font-bold text-teal-600 dark:text-teal-400">บริษัท</span> {r.supplier}</p>
          )}
        </div>
      )}
    </div>
  );
}

const norm = (s) => String(s ?? '').toLowerCase();

// โมดอลรายการรอตรวจรับบน Dashboard — rows = alerts.pendingReceive ชุดเดียวกับตัวเลขบนการ์ด (Rule #6)
export function PendingReceiveModal({ rows, onClose, onOpenDrug, onGoMap }) {
  const [q, setQ] = useState('');
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const shown = useMemo(() => {
    const t = norm(q).trim();
    if (!t) return rows;
    return rows.filter(r => [r.name, r.code, r.lot, r.location, r.invoice].some(v => norm(v).includes(t)));
  }, [rows, q]);
  const over7 = rows.filter(r => r.waitDays != null && r.waitDays > 7).length;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="pending-recv-title" onClick={e => e.stopPropagation()}
        className="bg-slate-50 dark:bg-slate-950 w-full sm:max-w-6xl max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="shrink-0 bg-white dark:bg-slate-900 px-4 sm:px-5 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700 space-y-3">
          <div className="flex items-start gap-3">
            <span className="p-2 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 shrink-0"><Package size={18} /></span>
            <div className="min-w-0 flex-1">
              <h2 id="pending-recv-title" className="text-base font-bold text-slate-800 dark:text-slate-100">
                รายการยารอตรวจรับ <span className="tabular-nums text-slate-400 dark:text-slate-500 font-semibold">({rows.length.toLocaleString()} lot)</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                อ้างอิงสถานะจาก Log คลัง · เรียงรอนานสุดก่อน{over7 > 0 ? <> · <span className="font-semibold text-rose-600 dark:text-rose-400">รอเกิน 7 วัน {over7} lot</span></> : null}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="ปิด"
              className="p-2 -mr-1 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"><X size={18} /></button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อยา รหัส lot ตำแหน่ง หรือเลขบิล…"
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          {q && <p className="text-xs text-slate-500 dark:text-slate-400">พบ {shown.length.toLocaleString()} จาก {rows.length.toLocaleString()} lot</p>}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
          {shown.length === 0
            ? <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-10">ไม่พบรายการ</p>
            : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {shown.map((r, i) => <PendingLotCard key={`${r.code}|${r.lot}|${r.location}|${i}`} r={r} onOpenDrug={onOpenDrug} />)}
              </div>}
        </div>
        {onGoMap && (
          <div className="shrink-0 bg-white dark:bg-slate-900 px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 min-w-0">พิมพ์ / Excel / บิลและบริษัท อยู่ที่แผนผังคลังยา</p>
            <button type="button" onClick={onGoMap}
              className="inline-flex items-center gap-1.5 shrink-0 bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors">
              ไปแผนผังคลังยา <ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
