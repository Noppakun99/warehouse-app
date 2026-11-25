import React, { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';

// แผงสรุปบนหน้าประวัติเบิกจ่าย / ประวัติรับยา — สไตล์เดียวกับหน้า "ค้นยา · สรุปรับ-เบิก"
// ตัวเลขทั้งหมดมาจาก aggStats ชุดเดียวกับตัวกรอง (Rule #6) · สรุปเต็มอยู่ในปุ่ม "สรุปผล"

const TONE = {
  slate:   'bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-700',
  amber:   'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/60',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/60',
  rose:    'bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/60',
};

const fmtNum = (v) => Math.round(Number(v) || 0).toLocaleString();

function Stat({ label, value, unit, sub, tone = 'slate', className = '' }) {
  return (
    <div className={`rounded-xl border px-3.5 py-3 min-w-0 ${TONE[tone]} ${className}`}>
      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
        <span className="text-2xl font-black tabular-nums text-slate-900 dark:text-slate-50 break-all">{value}</span>
        {unit && <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-600 dark:text-slate-300 break-words">{sub}</div>}
    </div>
  );
}

function RankList({ title, desc, rank, countUnit, bar, note }) {
  const max = Math.max(1, ...rank.top.map(t => t.value));
  const [showDesc, setShowDesc] = useState(false);
  return (
    <div className="space-y-2 min-w-0">
      <div>
        <div className="flex items-start gap-1.5">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {title} <span className="font-normal text-xs text-slate-500 dark:text-slate-400">({rank.top.length} อันดับแรก จาก {rank.size.toLocaleString()})</span>
          </h3>
          {desc && (
            <button type="button" onClick={() => setShowDesc(v => !v)} aria-expanded={showDesc} aria-label={`ความหมายของกราฟ ${title}`}
              className="shrink-0 -my-1.5 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors">
              <Info size={15} />
            </button>
          )}
        </div>
        {desc && showDesc && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2">{desc}</p>}
      </div>
      {rank.top.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">ไม่มีข้อมูล</p>
      ) : (
        <ul className="space-y-1.5">
          {rank.top.map((t, i) => (
            <li key={t.key} className="grid grid-cols-[1.25rem_minmax(0,1fr)_7.5rem] items-center gap-2 text-sm">
              <span className="text-xs text-slate-400 tabular-nums text-right">{i + 1}</span>
              <div className="min-w-0">
                <span className="block break-words text-slate-800 dark:text-slate-100">{t.label}</span>
                <span className="mt-1 block h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <span className={`block h-full rounded-full ${bar}`} style={{ width: `${(t.value / max) * 100}%` }} />
                </span>
              </div>
              <span className="text-right whitespace-nowrap leading-tight">
                <span className="block tabular-nums font-semibold text-slate-800 dark:text-slate-100">{fmtNum(t.value)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">บาท</span></span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 tabular-nums">{t.count.toLocaleString()} {countUnit}{/* qty-unit-ok นับครั้ง/บิล ไม่ใช่หน่วยยา */}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p>}
    </div>
  );
}

/**
 * stats: [{ label, value, unit, sub, tone }] — ใบแรก = มูลค่า (มือถือเต็มแถว)
 * lists: [{ title, short, desc, rank: { top, size }, countUnit, bar, note }] · desc = กราฟวัดอะไร เรียงจากอะไร · ไม่ส่ง/ยังโหลด = ซ่อนส่วนอันดับ
 */
const readHidden = (key) => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };

// title = หัวแผง (เช่น "สรุป · เดือนนี้") · storageKey = จำว่าซ่อนไว้ต่อเครื่อง (แยกต่อหน้า)
export default function HistorySummary({ stats, lists, isMobile, title = 'สรุป', storageKey }) {
  const [open, setOpen] = useState(!isMobile);
  const hideKey = storageKey ? `hist_summary_hidden_${storageKey}` : null;
  const [hidden, setHidden] = useState(() => (hideKey ? readHidden(hideKey) : false));
  const toggleHidden = () => setHidden(h => {
    try { if (hideKey) localStorage.setItem(hideKey, h ? '0' : '1'); } catch { /* ไม่มี storage = จำไม่ได้ ไม่เป็นไร */ }
    return !h;
  });
  const compact = stats.map(s => `${s.value}${s.unit ? ` ${s.unit}` : ''}`).join(' · ');
  return (
    <section aria-label="สรุป" className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-3 sm:p-4 ${hidden ? '' : 'space-y-3'}`}>
      <button type="button" onClick={toggleHidden} aria-expanded={!hidden}
        className="w-full min-h-[36px] flex flex-wrap items-center gap-x-3 gap-y-0.5 text-left">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
          <ChevronDown size={16} className={`shrink-0 transition-transform duration-200 ${hidden ? '-rotate-90' : ''}`} />
          {title}
        </span>
        {hidden
          ? <span className="text-sm text-slate-600 dark:text-slate-300 tabular-nums">{compact}</span>
          : <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">ซ่อนสรุป</span>}
      </button>
      {!hidden && <>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        {stats.map((s, i) => <Stat key={s.label} {...s} className={i === 0 ? 'col-span-2 lg:col-span-1' : ''} />)}
      </div>
      {lists?.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
            className="min-h-[36px] inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50 transition-colors">
            <ChevronDown size={16} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            {open ? 'ซ่อนอันดับมูลค่าสูงสุด' : `ดูอันดับมูลค่าสูงสุด (${lists.map(l => l.short).join(' · ')})`}
          </button>
          {open && (
            <div className="grid lg:grid-cols-2 gap-x-6 gap-y-5">
              {lists.map(l => <RankList key={l.title} {...l} />)}
            </div>
          )}
        </>
      )}
      </>}
    </section>
  );
}
