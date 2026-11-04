// ============================================================
// CompanyPolicyApp — นโยบายคืนบริษัท (staff/admin)
// พิมพ์ชื่อบริษัท → นโยบาย + lot คงเหลือของบริษัทนั้น จัดกลุ่มตามข้อความนโยบาย
// กฎนโยบาย = buildLotReturnPolicies ตัวเดียวกับบัตรยา/โมดอลใกล้หมดอายุ → เส้นตายตรงกับ popup คืนบริษัท
// บริษัทที่เลือกอยู่ใน AppRoot — ไปการ์ดคลัง lot จากบัตรยาแล้วกดย้อน ต้องกลับมาบริษัทเดิม
// ============================================================
import React, { useState, useEffect, useMemo } from 'react';
import { Building2, Search, Loader2, AlertTriangle, PackageOpen, ChevronRight } from 'lucide-react';
import BackButton from './BackButton';
import { fetchCompanyPolicyData } from './lib/db';
import { buildCompanyPolicyIndex, groupCompanyLots, searchCompanies, returnPolicyLabel } from './lib/drugProfile';

const fmtThaiDate = (d) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}` : 'ไม่ระบุ');

const CHIP = {
  red:     'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900',
  amber:   'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  slate:   'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
};
const chipCls = (tone) => `inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CHIP[tone]}`;

function LotRow({ l, onOpenDrug }) {
  const rp = l.returnPolicy;
  const label = returnPolicyLabel(rp);
  const canOpen = l.code && l.code !== '-';
  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={() => onOpenDrug?.(l.code)}
      title={canOpen ? 'เปิดบัตรยา' : undefined}
      className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors md:grid md:grid-cols-12 md:gap-3 md:items-center"
    >
      <span className="block md:col-span-4 min-w-0">
        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 break-words">{l.name}</span>
        <span className="block text-[11px] text-slate-400 dark:text-slate-500 break-words">รหัส {l.code}{l.locations.length > 0 ? ` · ${l.locations.join(', ')}` : ''}</span>
        {(l.pending || l.excluded) && (
          <span className="mt-1 flex flex-wrap gap-1">
            {l.pending && <span className={chipCls('amber')}>รอตรวจรับ</span>}
            {l.excluded && <span className={chipCls('slate')}>ตัดออกจากบัญชี</span>}
          </span>
        )}
      </span>
      {/* มือถือ = บรรทัดเดียวมีคำนำหน้า · จอใหญ่ = คอลัมน์ตามหัวตาราง */}
      <span className="mt-1 md:mt-0 block md:col-span-2 text-xs md:text-sm text-slate-700 dark:text-slate-200 break-all"><span className="md:hidden text-slate-400 dark:text-slate-500">Lot </span>{l.lot}</span>
      <span className="block md:col-span-2 text-xs md:text-sm tabular-nums text-slate-700 dark:text-slate-200"><span className="md:hidden text-slate-400 dark:text-slate-500">คงเหลือ </span>{l.qty.toLocaleString('th-TH')} {l.unit}</span>
      <span className="block md:col-span-2 text-xs md:text-sm tabular-nums text-slate-700 dark:text-slate-200"><span className="md:hidden text-slate-400 dark:text-slate-500">Exp </span>{fmtThaiDate(l.expDate)}</span>
      <span className="mt-1.5 md:mt-0 block md:col-span-2 min-w-0">
        {label && <span className={chipCls(label.tone)}>{label.text}</span>}
        {rp.deadline && <span className="block mt-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">คืนภายใน {fmtThaiDate(rp.deadline)}</span>}
      </span>
    </button>
  );
}

export default function CompanyPolicyApp({ company, onCompanyChange, onOpenDrug, onRefresh, onGoBack, canGoBack }) {
  const [state, setState] = useState({ loading: true, error: '', index: null });
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    fetchCompanyPolicyData()
      .then(d => { if (alive) setState({ loading: false, error: '', index: buildCompanyPolicyIndex(d) }); })
      .catch(e => { if (alive) setState({ loading: false, error: e.message || 'โหลดไม่สำเร็จ', index: null }); });
    return () => { alive = false; };
  }, []);

  const { index } = state;
  const companies = useMemo(() => index?.companies || [], [index]);
  const lotsOf = useMemo(() => Object.fromEntries(companies.map(c => [c.name, c.lots])), [companies]);
  const matches = useMemo(() => {
    if (q.trim()) return searchCompanies(companies.map(c => c.name), q, 20);
    return [...companies].filter(c => c.lots > 0).sort((a, b) => b.lots - a.lots).map(c => c.name);
  }, [companies, q]);
  const groups = useMemo(() => (index && company ? groupCompanyLots(index.lines, company) : []), [index, company]);
  const lotCount = groups.reduce((n, g) => n + g.lots.length, 0);
  const nearest = groups.flatMap(g => g.lots).map(l => l.returnPolicy)
    .filter(rp => rp.deadline && (rp.status === 'due' || rp.status === 'ok'))
    .sort((a, b) => a.daysToDeadline - b.daysToDeadline)[0];
  const overdueCount = groups.flatMap(g => g.lots).filter(l => l.returnPolicy.status === 'overdue').length;

  const pick = (name) => { onCompanyChange?.(name); setQ(''); };
  const showList = !!index && (q.trim() !== '' || !company);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
          <div className="p-2 bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 rounded-xl shrink-0"><Building2 size={20} /></div>
          <button onClick={onRefresh} className="text-left hover:opacity-70 transition-opacity" title="คลิกเพื่อโหลดใหม่">
            <p className="font-bold text-sm leading-tight text-slate-800 dark:text-slate-100">นโยบายคืนบริษัท</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs">ค้นตามบริษัท พร้อม lot ที่มีคงเหลือ</p>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
          <label htmlFor="company-search" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">ค้นหาบริษัท</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              id="company-search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="พิมพ์ชื่อบริษัท เช่น แอตแลนติค"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-300 dark:focus:ring-violet-800"
            />
          </div>
          {showList && (
            <div className="mt-3">
              {!q.trim() && <p className="px-1 pb-1 text-xs text-slate-500 dark:text-slate-400">บริษัทที่มี lot คงเหลือ {matches.length} บริษัท · เรียงตามจำนวน lot</p>}
              {matches.length === 0 ? (
                <p className="px-1 py-2 text-sm text-slate-400 dark:text-slate-500">ไม่พบบริษัทที่ตรงกับ &quot;{q}&quot;</p>
              ) : (
                <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {matches.map(name => (
                    <li key={name}>
                      <button type="button" onClick={() => pick(name)} className="w-full flex items-center gap-2 px-2 py-2.5 text-left text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                        <span className="min-w-0 flex-1 break-words">{name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500">{lotsOf[name] ? `${lotsOf[name]} lot` : 'ไม่มีของ'}</span>
                        <ChevronRight size={14} className="shrink-0 text-slate-300 dark:text-slate-600" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {state.loading && (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400 dark:text-slate-500"><Loader2 size={16} className="animate-spin" /> กำลังโหลดข้อมูล…</p>
        )}
        {state.error && (
          <p className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300"><AlertTriangle size={16} className="shrink-0" /> โหลดข้อมูลไม่สำเร็จ: {state.error}</p>
        )}

        {index && company && !q.trim() && (
          <>
            <div className="px-1">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 break-words">{company}</h2>
              {lotCount > 0 && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {lotCount} lot คงเหลือ
                  {overdueCount > 0 && <span className="text-red-600 dark:text-red-400"> · พ้นกำหนดคืน {overdueCount} lot</span>}
                  {nearest && <> · ต้องคืนเร็วสุด <b className="font-semibold tabular-nums">{fmtThaiDate(nearest.deadline)}</b></>}
                </p>
              )}
            </div>

            {lotCount === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-6 text-center">
                <PackageOpen size={28} className="mx-auto text-slate-300 dark:text-slate-600" />
                <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">ไม่มี lot คงเหลือของบริษัทนี้</p>
                {index.latestPolicyByName[company] ? (
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 break-words whitespace-pre-line">
                    <p className="font-semibold">ข้อความนโยบายจากบิลล่าสุดของบริษัทนี้</p>
                    {index.latestPolicyByName[company]}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">และไม่มีข้อความนโยบายในบิลของบริษัทนี้</p>
                )}
              </div>
            ) : groups.map(g => (
              <section key={`${g.source || ''}|${g.text || ''}`} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-[11px] font-bold tracking-wider text-slate-400 dark:text-slate-500">{g.text ? `นโยบาย · ${g.lots.length} lot` : `ไม่มีนโยบายคืน · ${g.lots.length} lot`}</p>
                  {g.text ? (
                    <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-200 break-words whitespace-pre-line">{g.text}</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">ยังไม่มีเงื่อนไขในชีท เงื่อนไข / เงื่อนไข_แจกแจง — ไม่คิดเส้นตาย</p>
                  )}
                  {g.sourceNote && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{g.sourceNote}</p>}
                </div>
                <div className="hidden md:grid md:grid-cols-12 md:gap-3 px-4 py-2 text-[11px] font-bold text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40">
                  <span className="col-span-4">ยา</span><span className="col-span-2">Lot</span><span className="col-span-2">คงเหลือ</span><span className="col-span-2">Exp</span><span className="col-span-2">สถานะ</span>
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {g.lots.map(l => <li key={l.key}><LotRow l={l} onOpenDrug={onOpenDrug} /></li>)}
                </ul>
              </section>
            ))}

            {index.unresolvedLots > 0 && (
              <p className="px-1 text-xs text-slate-400 dark:text-slate-500">ทั้งคลังมีอีก {index.unresolvedLots} lot ที่ระบุบริษัทไม่ได้ (ไม่พบบิล หรือ lot เดียวกันรับจากหลายบริษัท) จึงไม่อยู่ในรายการของบริษัทใด</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
