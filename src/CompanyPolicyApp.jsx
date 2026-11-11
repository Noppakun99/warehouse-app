// ============================================================
// CompanyPolicyApp — นโยบายคืนบริษัท (staff/admin)
// ค้นได้ 3 โหมด: รายการยา (ยานี้เคยซื้อกี่บริษัท → เลือกบริษัท → คืนได้ไหม/ทำอะไรต่อ) · Lot · บริษัท
// กฎนโยบาย = buildLotReturnPolicies ตัวเดียวกับบัตรยา/โมดอลใกล้หมดอายุ → เส้นตายตรงกับ popup คืนบริษัท
// สิ่งที่เลือกอยู่ใน AppRoot (selection) — ไปการ์ดคลัง lot จากบัตรยาแล้วกดย้อน ต้องกลับมาที่เดิม
// ============================================================
import React, { useState, useEffect, useMemo } from 'react';
import { Building2, Search, Loader2, AlertTriangle, PackageOpen, ChevronRight, ChevronDown, Pill, Hash } from 'lucide-react';
import BackButton from './BackButton';
import { fetchCompanyPolicyData } from './lib/db';
import {
  buildCompanyPolicyIndex, groupCompanyLots, searchCompanies, returnPolicyLabel,
  searchPolicyDrugs, drugPolicyView, searchPolicyLots, policyNextAction, policyCategory,
} from './lib/drugProfile';

const fmtThaiDate = (d) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}` : 'ไม่ระบุ');
const fmtIsoThai = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${Number(m[1]) + 543}` : 'ไม่ระบุ';
};

const CHIP = {
  red:     'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900',
  amber:   'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  orange:  'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-900',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  slate:   'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  violet:  'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-900',
};
const chipCls = (tone) => `inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CHIP[tone]}`;

const ACTION_CLS = {
  return:  'text-emerald-700 dark:text-emerald-300',
  wait:    'text-slate-500 dark:text-slate-400',
  dispose: 'text-red-700 dark:text-red-300',
  check:   'text-amber-700 dark:text-amber-300',
  none:    'text-slate-500 dark:text-slate-400',
  ward:    'text-violet-700 dark:text-violet-300',
};

const MODES = [
  { key: 'drug', label: 'รายการยา', Icon: Pill, placeholder: 'พิมพ์ชื่อยาหรือรหัส เช่น Clexane, Gemotran' },
  { key: 'lot', label: 'Lot', Icon: Hash, placeholder: 'พิมพ์เลข lot อย่างน้อย 3 ตัว' },
  { key: 'company', label: 'บริษัท', Icon: Building2, placeholder: 'พิมพ์ชื่อบริษัท เช่น แอตแลนติค, GPO' },
];

const OUT_OF_STOCK_NOTE = 'lot ที่คลังไม่มีแล้ว ไม่ได้แปลว่าห้องยายังมีของ — สอบถามห้องยาก่อน';

// showName = คอลัมน์แรกเป็นชื่อยา (หน้าบริษัท/ค้น lot) · ไม่งั้นเป็นที่เก็บหรือบิล (หน้ายา — ชื่อยาอยู่หัวแล้ว)
function LotRow({ l, onOpenDrug, showName = true, showCompany = false }) {
  const rp = l.returnPolicy;
  const label = returnPolicyLabel(rp);
  const action = policyNextAction(l);
  const canOpen = l.code && l.code !== '-';
  const where = l.outOfStock
    ? `บิล ${l.billNumber || '-'} · รับ ${fmtIsoThai(l.receiveDate)}`
    : (l.locations.length > 0 ? `ที่เก็บ ${l.locations.join(', ')}` : 'ไม่ระบุที่เก็บ');
  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={() => onOpenDrug?.(l.code)}
      title={canOpen ? 'เปิดบัตรยา' : undefined}
      className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors md:grid md:grid-cols-12 md:gap-x-3 md:gap-y-1 md:items-center"
    >
      <span className="block md:col-span-4 min-w-0">
        {showName && <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 break-words">{l.name}</span>}
        <span className={`block break-words ${showName ? 'text-[11px] text-slate-400 dark:text-slate-500' : 'text-xs text-slate-600 dark:text-slate-300'}`}>
          {showName ? `รหัส ${l.code} · ` : ''}{where}
        </span>
        {showCompany && <span className="block text-[11px] text-slate-500 dark:text-slate-400 break-words">{rp.company || (rp.ambiguous ? 'หลายบริษัท' : 'ไม่ทราบบริษัท')}</span>}
        {(l.pending || l.excluded || l.outOfStock) && (
          <span className="mt-1 flex flex-wrap gap-1">
            {l.outOfStock && <span className={chipCls('violet')}>คลังไม่มีแล้ว (จากบิล)</span>}
            {l.pending && <span className={chipCls('amber')}>รอตรวจรับ</span>}
            {l.excluded && <span className={chipCls('slate')}>ตัดออกจากบัญชี</span>}
          </span>
        )}
      </span>
      {/* มือถือ = บรรทัดเดียวมีคำนำหน้า · จอใหญ่ = คอลัมน์ตามหัวตาราง */}
      <span className="mt-1 md:mt-0 block md:col-span-2 text-xs md:text-sm text-slate-700 dark:text-slate-200 break-all"><span className="md:hidden text-slate-400 dark:text-slate-500">Lot </span>{l.lot}</span>
      <span className="block md:col-span-2 md:text-right text-xs md:text-sm tabular-nums text-slate-700 dark:text-slate-200">
        <span className="md:hidden text-slate-400 dark:text-slate-500">คงเหลือ </span>{l.outOfStock ? '–' : `${l.qty.toLocaleString('th-TH')} ${l.unit}`}
      </span>
      <span className="block md:col-span-2 text-xs md:text-sm tabular-nums text-slate-700 dark:text-slate-200"><span className="md:hidden text-slate-400 dark:text-slate-500">Exp </span>{fmtThaiDate(l.expDate)}</span>
      <span className="mt-1.5 md:mt-0 block md:col-span-2 min-w-0">
        {label && <span className={chipCls(label.tone)}>{label.text}</span>}
        {label?.dateLabel && <span className="block mt-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{label.dateLabel} {fmtThaiDate(label.date)}</span>}
      </span>
      {action && (
        <span className={`mt-1.5 md:mt-0 block md:col-span-12 text-xs font-medium ${ACTION_CLS[action.kind]}`}>ทำต่อ: {action.text}</span>
      )}
    </button>
  );
}

function LotHeader({ first = 'ยา' }) {
  return (
    <div className="hidden md:grid md:grid-cols-12 md:gap-3 px-4 py-2 text-[11px] font-bold text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40">
      <span className="col-span-4">{first}</span><span className="col-span-2">Lot</span><span className="col-span-2 text-right">คงเหลือ</span><span className="col-span-2">Exp</span><span className="col-span-2">สถานะ</span>
    </div>
  );
}

function LotList({ lots, onOpenDrug, showName, showCompany }) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {lots.map(l => <li key={l.key}><LotRow l={l} onOpenDrug={onOpenDrug} showName={showName} showCompany={showCompany} /></li>)}
    </ul>
  );
}

// บริษัท 1 แห่งของยาที่เลือก: นโยบาย → lot ในคลัง → lot ที่คลังไม่มีแล้ว (พับไว้)
function DrugCompanySection({ c, onOpenDrug }) {
  const [showPast, setShowPast] = useState(false);
  // หัวข้อภาษาคนจากหมวดของ lot (ในคลังก่อน · ไม่มีค่อยดู lot จากบิล) — lot ต่างบิลอาจคนละหมวด จึงแสดงได้หลายบรรทัด
  const lotsForTitle = c.stockLots.length ? c.stockLots : c.pastLots;
  const titles = [...new Set(lotsForTitle.map(l => policyCategory(l.returnPolicy)).filter(x => x.key !== 'none').map(x => x.title))];
  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <p className="text-[11px] font-bold tracking-wider text-slate-400 dark:text-slate-500">นโยบายคืนของยานี้ · {c.name}</p>
        {titles.map(t => <p key={t} className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100 break-words">{t}</p>)}
        {c.policyText ? (
          <>
            <p className="mt-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">ข้อความในบิล</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 break-words whitespace-pre-line">{c.policyText}</p>
            {c.policySourceNote && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 break-words">{c.policySourceNote}</p>}
          </>
        ) : (
          <p className="mt-0.5 text-sm font-semibold text-slate-500 dark:text-slate-400">ไม่มีข้อมูลนโยบายคืนของยานี้จากบริษัทนี้</p>
        )}
      </div>
      {c.stockLots.length > 0 ? (
        <>
          <LotHeader first="ที่เก็บ" />
          <LotList lots={c.stockLots} onOpenDrug={onOpenDrug} showName={false} />
        </>
      ) : (
        <p className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">คลังไม่มี lot ของบริษัทนี้คงเหลือ</p>
      )}
      {c.pastLots.length > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          <button type="button" onClick={() => setShowPast(v => !v)} aria-expanded={showPast}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
            <ChevronDown size={14} className={`shrink-0 ${showPast ? 'rotate-180' : ''}`} />
            {showPast ? 'ซ่อน' : 'ดู'} lot ที่คลังไม่มีแล้ว (จากบิล) {c.pastLots.length} lot
          </button>
          {showPast && (
            <>
              <p className="px-4 pb-2 text-[11px] text-slate-400 dark:text-slate-500">{OUT_OF_STOCK_NOTE}</p>
              <LotHeader first="บิล" />
              <LotList lots={c.pastLots} onOpenDrug={onOpenDrug} showName={false} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function DrugView({ view, company, onPickCompany, onOpenDrug }) {
  if (!view) {
    return <p className="px-1 text-sm text-slate-500 dark:text-slate-400">ไม่มีข้อมูลยานี้ในระบบ</p>;
  }
  const n = view.companies.length;
  const sel = view.companies.find(c => c.name === company) || view.companies[0];
  return (
    <>
      <div className="px-1">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 break-words">{view.name}</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          รหัส {view.code} · {n > 0 ? <>เคยซื้อจาก <b className="font-semibold tabular-nums">{n}</b> บริษัท{n > 1 ? ' — เลือกบริษัทเพื่อดูนโยบาย' : ''}</> : 'ไม่มีข้อมูลการซื้อ (ไม่พบบิล)'}
        </p>
      </div>
      {n > 1 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {view.companies.map(c => {
            const active = c === sel;
            return (
              <button key={c.name} type="button" onClick={() => onPickCompany(c.name)} aria-pressed={active}
                className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${active
                  ? 'border-violet-400 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-violet-300 dark:hover:border-violet-800'}`}>
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 break-words">{c.name}</span>
                <span className="block mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  ซื้อล่าสุด {fmtIsoThai(c.lastReceive)} · {c.stockLots.length > 0 ? `ในคลัง ${c.stockLots.length} lot` : 'คลังไม่มีแล้ว'} · {c.policyText ? 'มีนโยบายคืน' : 'ไม่มีข้อมูลนโยบาย'}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {sel && <DrugCompanySection key={sel.name} c={sel} onOpenDrug={onOpenDrug} />}
      {view.unresolved.length > 0 && (
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-[11px] font-bold tracking-wider text-slate-400 dark:text-slate-500">lot ในคลังที่ระบุบริษัทไม่ได้ · {view.unresolved.length} lot</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">ไม่พบบิล หรือ lot เดียวกันรับจากหลายบริษัท — ไม่มีข้อมูลนโยบาย</p>
          </div>
          <LotHeader first="ที่เก็บ" />
          <LotList lots={view.unresolved} onOpenDrug={onOpenDrug} showName={false} />
        </section>
      )}
    </>
  );
}

const groupKey = (g) => g.key;

// ข้อความนโยบายดิบในบิล — ตัวเล็กใต้หัวข้อภาษาคน ไว้ตรวจสอบ ไม่ใช่หัวข้อ
function PolicyTexts({ texts }) {
  return (
    <div className="px-4 py-2.5 space-y-1.5 bg-slate-50/60 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
      <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">ข้อความในบิล{texts.length > 1 ? ` (${texts.length} แบบ)` : ''}</p>
      {texts.map(t => (
        <div key={`${t.source}|${t.text}`} className="text-xs text-slate-600 dark:text-slate-300 break-words whitespace-pre-line">
          {t.text}
          {(t.sourceNote || texts.length > 1) && (
            <span className="block text-[11px] text-slate-400 dark:text-slate-500">{[t.sourceNote, texts.length > 1 ? `${t.lots} lot` : null].filter(Boolean).join(' · ')}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// หน้าบริษัท: กลุ่มตามหมวดนโยบายภาษาคน (policyCategory) พับได้ — หลายกลุ่มเปิดมาย่อหมด เห็นหัวข้อ + ชื่อยาในกลุ่ม แล้วกดกางเฉพาะที่ต้องการ
// (user ขอ 11/11/2569: เดิมกางหมด + หัวเป็นข้อความดิบในบิล ต้องเลื่อนนาน อ่านยาก) · ข้อความบิลอยู่ในส่วนที่กาง
// key={company} ที่ผู้เรียก = เปลี่ยนบริษัทแล้วกลับไปย่อ
function CompanyGroups({ groups, onOpenDrug }) {
  const [open, setOpen] = useState(() => new Set(groups.length === 1 ? [groupKey(groups[0])] : []));
  const allOpen = groups.every(g => open.has(groupKey(g)));
  const toggle = (k) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  return (
    <>
      {groups.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">{groups.length} กลุ่มนโยบาย · กดหัวข้อเพื่อดู lot</p>
          <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map(groupKey)))}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            {allOpen ? 'ย่อทั้งหมด' : 'กางทั้งหมด'}
          </button>
        </div>
      )}
      {groups.map(g => {
        const k = groupKey(g);
        const isOpen = open.has(k);
        const overdue = g.lots.filter(l => returnPolicyLabel(l.returnPolicy)?.tone === 'red').length;
        const names = [...new Set(g.lots.map(l => l.name).filter(Boolean))];
        const panelId = `policy-group-${groups.indexOf(g)}`;
        return (
          <section key={k} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button type="button" onClick={() => toggle(k)} aria-expanded={isOpen} aria-controls={panelId}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${isOpen ? 'border-b border-slate-100 dark:border-slate-800' : ''}`}>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 break-words">{g.title}</span>
                  <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500">{g.lots.length} lot</span>
                  {overdue > 0 && <span className={chipCls('red')}>พ้นกำหนด {overdue} lot</span>}
                </span>
                {!isOpen && names.length > 0 && (
                  <span className="block mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={names.join('\n')}>
                    ยา: {names.join(' · ')}
                  </span>
                )}
              </span>
              <ChevronDown size={16} className={`shrink-0 mt-0.5 text-slate-400 dark:text-slate-500 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div id={panelId}>
                {g.texts.length > 0 ? <PolicyTexts texts={g.texts} /> : g.key === 'none' && (
                  <p className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/60 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">ยังไม่มีเงื่อนไขในชีท เงื่อนไข / เงื่อนไข_แจกแจง — ไม่คิดเส้นตาย</p>
                )}
                <LotHeader />
                <LotList lots={g.lots} onOpenDrug={onOpenDrug} />
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

export default function CompanyPolicyApp({ selection, onSelectionChange, onOpenDrug, onRefresh, onGoBack, canGoBack }) {
  const [state, setState] = useState({ loading: true, error: '', index: null });
  const [q, setQ] = useState('');
  const sel = selection || { mode: 'drug' };
  const mode = sel.mode;
  const company = mode === 'company' ? sel.value : null;
  const drugCode = mode === 'drug' ? sel.value : null;
  const lotQuery = mode === 'lot' ? (sel.value || '') : '';

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
  const companyMatches = useMemo(() => {
    if (q.trim()) return searchCompanies(companies.map(c => c.name), q, 20);
    return [...companies].filter(c => c.lots > 0).sort((a, b) => b.lots - a.lots).map(c => c.name);
  }, [companies, q]);
  const drugMatches = useMemo(() => (mode === 'drug' && index ? searchPolicyDrugs(index.drugs, q, 20) : []), [mode, index, q]);
  const drugView = useMemo(() => (index && drugCode ? drugPolicyView(index, drugCode) : null), [index, drugCode]);
  const lotMatches = useMemo(() => (index ? searchPolicyLots(index, lotQuery) : []), [index, lotQuery]);
  const groups = useMemo(() => (index && company ? groupCompanyLots(index.lines, company) : []), [index, company]);
  const lotCount = groups.reduce((n, g) => n + g.lots.length, 0);
  // นับจากป้าย ไม่ใช่ status — after_exp หลังหมดอายุ ("คืนได้แล้ว") และ tier ที่ยังคืนได้บางส่วน status = overdue แต่ไม่ใช่พ้นกำหนด
  // · "คืนได้ตั้งแต่" เป็นวันเริ่มคืน ไม่ใช่เส้นตาย จึงไม่นับเป็น "ต้องคืนเร็วสุด"
  const labels = groups.flatMap(g => g.lots).map(l => returnPolicyLabel(l.returnPolicy)).filter(Boolean);
  const nearest = labels.filter(lb => lb.dateLabel === 'คืนภายใน' && lb.tone !== 'red')
    .sort((a, b) => a.date - b.date)[0];
  const overdueCount = labels.filter(lb => lb.tone === 'red').length;

  const setMode = (m) => { if (m !== mode) { onSelectionChange?.({ mode: m }); setQ(''); } };
  const pickCompany = (name) => { onSelectionChange?.({ mode: 'company', value: name }); setQ(''); };
  const pickDrug = (code) => { onSelectionChange?.({ mode: 'drug', value: code }); setQ(''); };
  const modeInfo = MODES.find(m => m.key === mode) || MODES[0];
  const inputValue = mode === 'lot' ? lotQuery : q;
  const onInput = (v) => (mode === 'lot' ? onSelectionChange?.({ mode: 'lot', value: v }) : setQ(v));
  const showCompanyList = mode === 'company' && !!index && (q.trim() !== '' || !company);
  const showDrugList = mode === 'drug' && !!index && q.trim() !== '';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
          <div className="p-2 bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 rounded-xl shrink-0"><Building2 size={20} /></div>
          <button onClick={onRefresh} className="text-left hover:opacity-70 transition-opacity" title="คลิกเพื่อโหลดใหม่">
            <p className="font-bold text-sm leading-tight text-slate-800 dark:text-slate-100">นโยบายคืนบริษัท</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs">ค้นตามยา · lot · บริษัท ว่าคืนได้ไหม ต้องทำอะไรต่อ</p>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 mb-3" role="group" aria-label="ค้นหาตาม">
            {MODES.map(({ key, label, Icon }) => (
              <button key={key} type="button" onClick={() => setMode(key)} aria-pressed={mode === key}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${mode === key
                  ? 'bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          <label htmlFor="policy-search" className="sr-only">ค้นหา{modeInfo.label}</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              id="policy-search"
              value={inputValue}
              onChange={e => onInput(e.target.value)}
              placeholder={modeInfo.placeholder}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-300 dark:focus:ring-violet-800"
            />
          </div>

          {showDrugList && (
            <div className="mt-3">
              {drugMatches.length === 0 ? (
                <p className="px-1 py-2 text-sm text-slate-400 dark:text-slate-500">ไม่พบยาที่ตรงกับ &quot;{q}&quot; — ไม่มีข้อมูล</p>
              ) : (
                <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {drugMatches.map(d => (
                    <li key={d.code}>
                      <button type="button" onClick={() => pickDrug(d.code)} className="w-full flex items-center gap-2 px-2 py-2.5 text-left text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-slate-700 dark:text-slate-200">
                        <span className="min-w-0 flex-1">
                          <span className="block break-words">{d.name}</span>
                          <span className="block text-[11px] text-slate-400 dark:text-slate-500">รหัส {d.code}</span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500">{d.companies.length ? `${d.companies.length} บริษัท` : 'ไม่พบบิล'}</span>
                        <ChevronRight size={14} className="shrink-0 text-slate-300 dark:text-slate-600" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {mode === 'drug' && !q.trim() && !drugCode && (
            <p className="mt-3 px-1 text-xs text-slate-500 dark:text-slate-400">พิมพ์ชื่อยา เพื่อดูว่าเคยซื้อจากบริษัทไหน แต่ละบริษัทคืนได้ไหม และต้องทำอะไรต่อ</p>
          )}
          {mode === 'lot' && lotQuery.trim() !== '' && lotQuery.replace(/\s/g, '').length < 3 && (
            <p className="mt-3 px-1 text-xs text-slate-500 dark:text-slate-400">พิมพ์เลข lot อย่างน้อย 3 ตัว</p>
          )}

          {showCompanyList && (
            <div className="mt-3">
              {!q.trim() && <p className="px-1 pb-1 text-xs text-slate-500 dark:text-slate-400">บริษัทที่มี lot คงเหลือ {companyMatches.length} บริษัท · เรียงตามจำนวน lot</p>}
              {companyMatches.length === 0 ? (
                <p className="px-1 py-2 text-sm text-slate-400 dark:text-slate-500">ไม่พบบริษัทที่ตรงกับ &quot;{q}&quot;</p>
              ) : (
                <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {companyMatches.map(name => (
                    <li key={name}>
                      <button type="button" onClick={() => pickCompany(name)} className="w-full flex items-center gap-2 px-2 py-2.5 text-left text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-slate-700 dark:text-slate-200">
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

        {index && mode === 'drug' && drugCode && !q.trim() && (
          <DrugView view={drugView} company={sel.company}
            onPickCompany={(name) => onSelectionChange?.({ ...sel, company: name })} onOpenDrug={onOpenDrug} />
        )}

        {index && mode === 'lot' && lotQuery.replace(/\s/g, '').length >= 3 && (
          lotMatches.length === 0 ? (
            <p className="px-1 text-sm text-slate-500 dark:text-slate-400">ไม่พบ lot ที่ตรงกับ &quot;{lotQuery}&quot; ทั้งในคลังและในบิล — ไม่มีข้อมูล</p>
          ) : (
            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <p className="text-[11px] font-bold tracking-wider text-slate-400 dark:text-slate-500">พบ {lotMatches.length} lot{lotMatches.length >= 50 ? ' (แสดง 50 แรก — พิมพ์เลข lot ให้ยาวขึ้น)' : ''}</p>
                {lotMatches.some(l => l.outOfStock) && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{OUT_OF_STOCK_NOTE}</p>}
              </div>
              <LotHeader />
              <LotList lots={lotMatches} onOpenDrug={onOpenDrug} showCompany />
            </section>
          )
        )}

        {index && mode === 'company' && company && !q.trim() && (
          <>
            <div className="px-1">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 break-words">{company}</h2>
              {lotCount > 0 && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {lotCount} lot คงเหลือ
                  {overdueCount > 0 && <span className="text-red-600 dark:text-red-400"> · พ้นกำหนดคืน {overdueCount} lot</span>}
                  {nearest && <> · ต้องคืนเร็วสุด <b className="font-semibold tabular-nums">{fmtThaiDate(nearest.date)}</b></>}
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
            ) : (
              <CompanyGroups key={company} groups={groups} onOpenDrug={onOpenDrug} />
            )}

            {index.unresolvedLots > 0 && (
              <p className="px-1 text-xs text-slate-400 dark:text-slate-500">ทั้งคลังมีอีก {index.unresolvedLots} lot ที่ระบุบริษัทไม่ได้ (ไม่พบบิล หรือ lot เดียวกันรับจากหลายบริษัท) จึงไม่อยู่ในรายการของบริษัทใด</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
