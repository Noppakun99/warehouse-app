// ============================================================
// DeadStockApp — ยาไม่เคลื่อนไหว (staff/admin)
// นิยาม CONTEXT §ยาไม่เคลื่อนไหว · ตรรกะ buildDeadStock (deadStock.js) ตัวเดียวกับ scripts/dead-stock.mjs ที่ทำรายงานหัวหน้า
// → ตัวเลขบนหน้านี้ต้องเท่ากับรายงาน (ตรวจ 18/11/2569: แจ้ง 22 รายการ 122,452.82 · เฝ้าดู 21 รายการ 79,594.39)
// อ่านอย่างเดียว ไม่มี mutation → ไม่มี audit log · docs/features/dead-stock.md
// ============================================================
import React, { useState, useEffect, useMemo } from 'react';
import { Hourglass, Search, Loader2, AlertTriangle, ChevronDown, Users, MapPin, Building2 } from 'lucide-react';
import BackButton from './BackButton';
import { fetchDeadStockData } from './lib/db';
import { buildCompanyPolicyIndex, parseExpDate, returnPolicyLabel, unitLabel } from './lib/drugProfile';
import { buildDeadStock, stockLotsFromInventory, firstReceiveMap, ymThai, REPORT_MONTHS, WATCH_MONTHS } from './lib/deadStock';

const HISTORY_START = '2025-10'; // เดือนแรกที่มีข้อมูลเบิกในระบบ (ตรงกับ CLI)

const fmtThaiDate = (d) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}` : '-');
const fmtIsoThai = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${Number(m[1]) + 543}` : '-';
};
const baht = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });

const CHIP = {
  red:     'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900',
  amber:   'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  orange:  'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-900',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  slate:   'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  violet:  'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-900',
};
const chipCls = (tone) => `inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CHIP[tone]}`;

const TABS = [
  { key: 'report', label: `ไม่มีเบิก ≥${REPORT_MONTHS} เดือน` },
  { key: 'watch', label: `เฝ้าดู ${WATCH_MONTHS}–${REPORT_MONTHS - 1} เดือน` },
  { key: 'all', label: 'ทั้งหมด' },
];

function LotTable({ lots }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="hidden md:grid grid-cols-12 gap-3 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
        <span className="col-span-2">Lot</span><span className="col-span-2">หมดอายุ</span>
        <span className="col-span-2 text-right">คงเหลือ</span><span className="col-span-2 text-right">มูลค่า (บาท)</span>
        <span className="col-span-4">บริษัท · นโยบายคืน</span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {lots.map((l, i) => {
          const label = l.supported ? null : returnPolicyLabel(l.policy);
          return (
            <div key={`${l.lot}-${i}`} className="px-3 py-2.5 text-sm md:grid md:grid-cols-12 md:gap-3 md:items-start space-y-1 md:space-y-0">
              <span className="block md:col-span-2 min-w-0">
                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded break-all">{l.lot || '-'}</span>
                {l.location && <span className="block mt-1 text-[11px] text-slate-400 dark:text-slate-500">ที่เก็บ {l.location}</span>}
              </span>
              <span className="block md:col-span-2 text-xs text-slate-600 dark:text-slate-300 tabular-nums"><span className="md:hidden text-slate-400">หมดอายุ </span>{fmtThaiDate(l.expDate)}</span>
              <span className="block md:col-span-2 md:text-right text-xs text-slate-700 dark:text-slate-200 tabular-nums"><span className="md:hidden text-slate-400">คงเหลือ </span>{num(l.qty)} {unitLabel(l.unit)}</span>
              <span className="block md:col-span-2 md:text-right text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums"><span className="md:hidden text-slate-400 font-normal">มูลค่า </span>{baht(l.value)}</span>
              <span className="block md:col-span-4 min-w-0 text-xs">
                <span className="block text-slate-600 dark:text-slate-300 break-words">{l.policy?.company || 'ไม่ทราบบริษัท'}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1">
                  {l.supported && <span className={chipCls('violet')}>{l.itemType || 'ยาสนับสนุน'} — คืนบริษัทไม่ได้</span>}
                  {label && <span className={chipCls(label.tone)}>{label.text}</span>}
                  {label?.dateLabel && <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{label.dateLabel} {fmtThaiDate(label.date)}</span>}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DrugRow({ r, open, onToggle, onOpenDrug }) {
  const canOpen = r.code && r.code !== '-';
  const idleChip = r.tier === 'report' ? 'red' : 'amber';
  const panelId = `dead-${r.key}`;
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId}
        className="w-full text-left p-4 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors rounded-2xl">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={chipCls(idleChip)}>{r.neverUsed ? `ไม่เคยเบิก · ${r.idleMonths} เดือน` : `ไม่มีเบิก ${r.idleMonths} เดือน`}</span>
            {r.excluded && <span className={chipCls('slate')}>ตัดออกจากบัญชีแล้ว</span>}
            {r.returnableLots > 0 && <span className={chipCls('emerald')}>คืนบริษัทได้ {r.returnableLots} lot</span>}
          </span>
          <span className="block mt-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100 break-words">{r.name}</span>
          <span className="block text-[11px] text-slate-400 dark:text-slate-500 break-words">
            รหัส {r.code || '-'} · {r.type || '-'} · {r.neverUsed ? `รับเข้าครั้งแรก ${ymThai(r.firstReceiveYm)}` : `เบิกใช้ล่าสุด ${ymThai(r.lastUseYm)}`}
          </span>
          <span className="block mt-1 text-xs text-slate-600 dark:text-slate-300 break-words">{r.suggestion.replace(/\d{4}-\d{2}-\d{2}/g, fmtIsoThai)}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">{baht(r.value)}</span>
          <span className="block text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{num(r.qty)} {r.mixedUnits ? '(หลายหน่วย)' : unitLabel(r.unit)}</span>
          <ChevronDown size={16} className={`ml-auto mt-1 text-slate-400 ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div id={panelId} className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700 px-3 py-2.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold tracking-wider mb-1">เสนอ PTC</div>
              <div className="text-sm text-slate-700 dark:text-slate-200 break-words">{r.ptc}</div>
              {r.group && <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">ระบบจัดกลุ่มจากชนิดยา/VEN — คลังต้องยืนยันเหตุผลเอง</div>}
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700 px-3 py-2.5">
              <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 font-bold tracking-wider mb-1"><Users size={12} /> หน่วยงานที่เคยเบิกใช้</div>
              {r.usedBy.length === 0
                ? <div className="text-sm text-slate-500 dark:text-slate-400">ไม่มีประวัติเบิกใช้ในระบบ (ตั้งแต่ {ymThai(HISTORY_START)})</div>
                : (
                  <ul className="text-sm text-slate-700 dark:text-slate-200 space-y-0.5">
                    {r.usedBy.map(u => <li key={u.dept} className="break-words">{u.dept} <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{u.count} ครั้ง · ล่าสุด {ymThai(u.lastYm)}</span></li>)}
                  </ul>
                )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{r.lots.length} lot</span>
              {r.locations.length > 0 && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {r.locations.join(', ')}</span>}
              {r.suppliers.length > 0 && <span className="inline-flex items-center gap-1 min-w-0"><Building2 size={12} className="shrink-0" /> <span className="break-words">{r.suppliers.join(' · ')}</span></span>}
            </div>
            <LotTable lots={r.lots} />
          </div>
          {canOpen && (
            <button type="button" onClick={() => onOpenDrug?.(r.code)}
              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:border-slate-400 text-slate-700 dark:text-slate-200 rounded-xl py-2 px-4 font-medium text-sm transition-colors">
              เปิดบัตรยา
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DeadStockApp({ onOpenDrug, onRefresh, onGoBack, canGoBack }) {
  const [state, setState] = useState({ loading: true, error: '', res: null });
  const [tab, setTab] = useState('report');
  const [q, setQ] = useState('');
  const [openKey, setOpenKey] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchDeadStockData()
      .then(d => {
        const today = new Date();
        const { lines } = buildCompanyPolicyIndex({ inventoryRows: d.inventoryRows, receiveRows: d.receiveRows, companyPolicies: d.companyPolicies, today });
        const res = buildDeadStock({
          stockLots: stockLotsFromInventory(d.inventoryRows, parseExpDate),
          dispenses: d.dispenses,
          firstReceive: firstReceiveMap(d.receiveRows),
          ven: new Map(d.venRows.map(c => [String(c.code).trim(), c.risk_group])),
          policies: new Map(lines.map(l => [`${l.code}|${l.lot}`.toLowerCase(), l.returnPolicy])),
          historyStart: HISTORY_START, today,
        });
        if (alive) setState({ loading: false, error: '', res });
      })
      .catch(e => { if (alive) setState({ loading: false, error: e.message || 'โหลดไม่สำเร็จ', res: null }); });
    return () => { alive = false; };
  }, []);

  const { res } = state;
  const rows = useMemo(() => res?.rows || [], [res]);
  const stats = useMemo(() => {
    const sum = (a) => a.reduce((s, r) => s + r.value, 0);
    const report = rows.filter(r => r.tier === 'report');
    const watch = rows.filter(r => r.tier === 'watch');
    return { report: report.length, reportValue: sum(report), watch: watch.length, watchValue: sum(watch), ptc: rows.filter(r => r.ptc === 'เสนอพิจารณาออกได้').length };
  }, [rows]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter(r => (tab === 'all' || r.tier === tab) && (!t || r.name.toLowerCase().includes(t) || r.code.toLowerCase().includes(t)));
  }, [rows, tab, q]);
  const tabCount = { report: stats.report, watch: stats.watch, all: rows.length };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
          <div className="p-2 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-xl shrink-0"><Hourglass size={20} /></div>
          <button onClick={onRefresh} className="text-left hover:opacity-70 transition-opacity min-w-0" title="คลิกเพื่อโหลดใหม่">
            <p className="font-bold text-sm leading-tight text-slate-800 dark:text-slate-100">ยาไม่เคลื่อนไหว</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs">
              {res ? `ไม่มีเบิกใช้จริงติดต่อกัน นับถึงเดือน ${ymThai(res.lastCompleteYm)}` : 'ยาที่ไม่มีการเบิกใช้หลายเดือน — เร่งใช้ คืนบริษัท หรือเสนอ PTC'}
            </p>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        {state.loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500 dark:text-slate-400 text-sm"><Loader2 size={18} className="animate-spin" /> กำลังโหลดคงเหลือ ประวัติเบิก และนโยบายคืน…</div>
        )}
        {state.error && (
          <p className="flex items-center gap-2 text-red-600 dark:text-red-300 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3"><AlertTriangle size={16} /> โหลดข้อมูลไม่สำเร็จ: {state.error}</p>
        )}

        {res && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative overflow-hidden bg-gradient-to-br from-rose-500 to-rose-700 rounded-2xl p-3.5 text-center shadow-lg shadow-rose-300/50 dark:shadow-none">
                <span className="pointer-events-none absolute -left-5 -top-8 w-28 h-28 rounded-full bg-white/25 blur-xl" />
                <p className="relative text-2xl font-bold text-white tabular-nums">{stats.report} <span className="text-sm font-semibold">รายการ</span></p>
                <p className="relative text-xs text-rose-50 mt-0.5">ไม่มีเบิก ≥{REPORT_MONTHS} เดือน · {baht(stats.reportValue)} บาท</p>
              </div>
              <div className="bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl p-3.5 text-center shadow-lg shadow-amber-200/60 dark:shadow-none">
                <p className="text-2xl font-bold text-white tabular-nums">{stats.watch} <span className="text-sm font-semibold">รายการ</span></p>
                <p className="text-xs text-amber-50 mt-0.5">เฝ้าดู {WATCH_MONTHS}–{REPORT_MONTHS - 1} เดือน · {baht(stats.watchValue)} บาท</p>
              </div>
              <div className="bg-gradient-to-br from-slate-600 to-slate-800 rounded-2xl p-3.5 text-center shadow-lg shadow-slate-300/50 dark:shadow-none">
                <p className="text-2xl font-bold text-white tabular-nums">{stats.ptc} <span className="text-sm font-semibold">รายการ</span></p>
                <p className="text-xs text-slate-300 mt-0.5">เสนอ PTC พิจารณาออกได้</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="ช่วงเวลาที่ไม่มีเบิก">
                {TABS.map(t => (
                  <button key={t.key} type="button" onClick={() => { setTab(t.key); setOpenKey(null); }} aria-pressed={tab === t.key}
                    className={tab === t.key
                      ? 'px-3 py-1.5 text-sm font-semibold rounded-lg bg-rose-600 text-white'
                      : 'px-3 py-1.5 text-sm font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors'}>
                    {t.label} <span className="tabular-nums">({tabCount[t.key]})</span>
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นชื่อยาหรือรหัส"
                  className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                ไม่นับเป็นการใช้: เบิกเพิ่มจากความผิดพลาด · เบิกยาหมดอายุ · เบิกเพื่อแลกเปลี่ยนคืน · คืนยา · ให้ รพ.อื่น/บริษัทยืม — ยาที่ไม่เคยเบิกนับจากเดือนรับเข้าครั้งแรก · มูลค่า = คงเหลือ × ราคา/หน่วยใน Master (นำเข้าล่าสุด)
              </p>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">แสดง {shown.length} รายการ · เรียงไม่มีเบิกนานสุดก่อน · กดรายการเพื่อดูราย lot</p>
            {shown.length === 0
              ? <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-10 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700">ไม่มีรายการ{q.trim() ? 'ที่ตรงกับคำค้น' : ''}</div>
              : (
                <div className="space-y-2">
                  {shown.map(r => (
                    <DrugRow key={r.key} r={r} open={openKey === r.key} onToggle={() => setOpenKey(k => (k === r.key ? null : r.key))} onOpenDrug={onOpenDrug} />
                  ))}
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}
