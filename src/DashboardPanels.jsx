// DashboardPanels.jsx — ชิ้นส่วนหน้าหลัก (Phase 1 ของแผน Dashboard 10/10/2569)
// คิวงานวันนี้ · โมดอลรายการของคิว · คอลัมน์ภาพรวม · กราฟมูลค่าเบิก vs รับ · บรรทัดความสดข้อมูล/รอบเบิก-รับ
// ตรรกะคิวอยู่ใน src/lib/workQueue.js (pure) — ไฟล์นี้แสดงผลอย่างเดียว
import React, { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  AlertTriangle, Undo2, PackageX, ClipboardCheck, CalendarClock, ArrowLeftRight, MessageSquareWarning,
  ListChecks, ChevronRight, CircleCheck, X, ArrowRight, Boxes, ShoppingCart, Activity,
  TrendingUp, TrendingDown, ChevronDown, CalendarDays, Database, Hourglass, Search, RotateCcw, Lightbulb, Copy, Check,
  BookOpenCheck, Pencil, Trash2, Plus, Package, ShoppingBag, FileSpreadsheet, Loader2, Pin, ChevronUp,
} from 'lucide-react';
import { fmtReportNum } from './lib/purchaseReportSheet';
import { SWAP_ACTION_STATUS, insertFormularyChange, updateFormularyChange, deleteFormularyChange, fetchCartDraft, deleteCartDraft, fetchPurchaseArrivals, fetchNewDrugDispense } from './lib/db';
import { reqTypeLabel, clearLocalCart } from './lib/reqType';
import { openDrugSearch } from './lib/drugSearchEvent';
import { isSwapRed, fmtYmdBE, pickCollapsedQueue, togglePin, QUEUE_COLLAPSED_SIZE } from './lib/workQueue';
import { parseExpDate, unitLabel } from './lib/drugProfile';
import {
  NEW_DRUG_DAYS, CHANGE_TYPE_LABEL, buildNewDrugs, buildFormularyOut, buildNewDrugLine, countReceivedNew,
  sortRegistry, validateFormularyEntry, windowFromYmd, NEW_DRUG_FILTERS, countNewDrugFilters, summarizeNewDrugDispense,
} from './lib/formularyChange';
import ConfirmModal from './ConfirmModal';

// ── สี/ไอคอนต่อรายการในคิว ────────────────────────────────────────────
const SEVERITY = {
  red:   { chip: 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-300',     pill: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300' },
  amber: { chip: 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-300', pill: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300' },
  slate: { chip: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300', pill: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
  emerald: { chip: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300', pill: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' },
};
const QUEUE_ICON = {
  expired: AlertTriangle, swap: Undo2, outOfStock: PackageX, pendingReceive: Hourglass,
  nearExpiry: CalendarClock, loanOverdue: ArrowLeftRight, annualCount: ListChecks, lineQuota: MessageSquareWarning,
  formulary: BookOpenCheck, purchaseWaiting: ShoppingBag, purchaseNotMoved: FileSpreadsheet,
};

const fmtNum = (n) => (Number(n) || 0).toLocaleString();

const fmtThaiDateTime = (iso) => (iso
  ? new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '-');

// ── บรรทัดใต้หัวหน้า: เวลานำเข้าล่าสุด + รอบเบิก-รับถัดไป ─────────────────
export function DashboardInfoLines({ uploadMeta, cycle }) {
  const inv = uploadMeta?.inventory;
  return (
    <div className="mt-2 flex flex-col sm:flex-row sm:flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
      <span className="inline-flex items-center gap-1.5">
        <Database size={13} className="shrink-0" />
        <span>ข้อมูลคงคลัง ณ นำเข้าล่าสุด <b className="text-slate-700 dark:text-slate-200 font-semibold">{inv?.updated_at ? fmtThaiDateTime(inv.updated_at) : 'ไม่ทราบ'}</b></span>
      </span>
      {cycle && (
        <span className="inline-flex items-start gap-1.5">
          <CalendarDays size={13} className="shrink-0 mt-px" />
          <span>
            รอบถัดไป ส่งใบเบิก <b className="text-slate-700 dark:text-slate-200 font-semibold">{cycle.requisition}</b>
            {' · '}รับยา <b className="text-slate-700 dark:text-slate-200 font-semibold">{cycle.pickup}</b>
            {cycle.shiftNote && <span className="text-amber-700 dark:text-amber-300"> — {cycle.shiftNote}</span>}
          </span>
        </span>
      )}
    </div>
  );
}

// ── ช่องค้นหาใหญ่บนหน้าหลัก — เปิดช่องค้นหาเดียวกับ Ctrl+K บน top bar (ไม่ใช่ช่องแยก) ────
export function DrugSearchLauncher() {
  return (
    <button type="button" onClick={openDrugSearch}
      className="mt-5 w-full flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-sky-400 dark:hover:border-sky-600 rounded-2xl px-4 h-14 shadow-sm text-left transition-colors">
      <Search size={20} className="text-sky-500 shrink-0" />
      <span className="flex-1 min-w-0 truncate text-sm sm:text-base text-slate-400 dark:text-slate-500">ค้นหายา — ชื่อ, รหัส, lot, เลขบิล หรือ PO</span>
      <kbd className="hidden sm:inline text-[11px] font-sans font-semibold px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">Ctrl K</kbd>
    </button>
  );
}

// ── คิวงานวันนี้ ─────────────────────────────────────────────────────
// ย่อเหลือ 3 เรื่องเป็นค่าเริ่มต้น + ปักหมุดเรื่องที่อยากเห็นตลอด (user สั่ง 26/11/2569) — จำไว้ที่เครื่อง
const QUEUE_EXPANDED_KEY = 'dashboard_queue_expanded';
const QUEUE_PINS_KEY = 'dashboard_queue_pins';
const readPins = () => {
  try { const v = JSON.parse(localStorage.getItem(QUEUE_PINS_KEY) || '[]'); return Array.isArray(v) ? v.filter(k => typeof k === 'string') : []; } catch { return []; }
};

export function WorkQueuePanel({ items = [], loading = false, onOpen }) {
  const pendingCount = items.filter(it => !it.informational).length;
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem(QUEUE_EXPANDED_KEY) === '1'; } catch { return false; }
  });
  const [pins, setPins] = useState(readPins);
  const toggleExpanded = () => setExpanded(v => {
    try { localStorage.setItem(QUEUE_EXPANDED_KEY, v ? '0' : '1'); } catch { /* จำไม่ได้ — ใช้ได้แค่รอบนี้ */ }
    return !v;
  });
  const onTogglePin = (key) => setPins(prev => {
    const next = togglePin(prev, key);
    try { localStorage.setItem(QUEUE_PINS_KEY, JSON.stringify(next)); } catch { /* จำไม่ได้ — ใช้ได้แค่รอบนี้ */ }
    return next;
  });
  const { shown: collapsedItems, hiddenCount } = useMemo(() => pickCollapsedQueue(items, pins), [items, pins]);
  const canCollapse = items.length > QUEUE_COLLAPSED_SIZE;
  const visible = expanded || !canCollapse ? items : collapsedItems;
  const pinSet = new Set(pins);
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-300"><ClipboardCheck size={15} /></div>
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">คิวงานวันนี้</h3>
        </div>
        <div className="flex items-center gap-2">
          {!loading && <span className="text-xs text-slate-400 dark:text-slate-500">{pendingCount > 0 ? `${pendingCount} เรื่องค้าง` : ''}</span>}
          {!loading && canCollapse && expanded && (
            <button type="button" onClick={toggleExpanded} aria-expanded="true"
              className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors">
              ย่อเหลือ {QUEUE_COLLAPSED_SIZE} <ChevronUp size={14} />
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <ul className="divide-y divide-slate-50 dark:divide-slate-800" aria-busy="true">
          {[0, 1, 2].map(i => (
            <li key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-40 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                <div className="h-2.5 w-56 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
              </div>
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-6 text-sm text-emerald-700 dark:text-emerald-300">
          <CircleCheck size={20} className="shrink-0" />
          <span>ไม่มีงานค้างในคิว ณ ข้อมูลนำเข้าล่าสุด</span>
        </div>
      ) : (
        <>
        <ul className="divide-y divide-slate-50 dark:divide-slate-800">
          {visible.map(it => {
            const Icon = QUEUE_ICON[it.key] || AlertTriangle;
            const sev = SEVERITY[it.severity] || SEVERITY.slate;
            const pct = it.progress?.total ? Math.round((it.progress.counted / it.progress.total) * 100) : null;
            const pinned = pinSet.has(it.key);
            return (
              <li key={it.key} className="flex items-stretch">
                {canCollapse && (
                  <button type="button" onClick={() => onTogglePin(it.key)} aria-pressed={pinned}
                    aria-label={pinned ? `เลิกปักหมุด ${it.label}` : `ปักหมุด ${it.label} ให้อยู่ในคิวแบบย่อ`}
                    title={pinned ? 'เลิกปักหมุด' : `ปักหมุด — ให้เรื่องนี้อยู่ใน ${QUEUE_COLLAPSED_SIZE} เรื่องแรกเสมอ`}
                    className={`shrink-0 flex items-center justify-center w-10 transition-colors ${pinned
                      ? 'text-sky-600 dark:text-sky-300 bg-sky-50/70 dark:bg-sky-950/30'
                      : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
                    <Pin size={15} className={pinned ? 'fill-current' : ''} />
                  </button>
                )}
                <button type="button" onClick={() => onOpen?.(it)}
                  className={`flex-1 min-w-0 flex items-center gap-3 ${canCollapse ? 'pl-1 pr-4' : 'px-4'} py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors`}>
                  <span className={`p-2 rounded-xl shrink-0 ${sev.chip}`}><Icon size={18} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">{it.label}</span>
                    {/* มือถือขึ้นบรรทัดใหม่ — ตัดท้ายแล้ว "ใกล้เส้นตาย N lot" ที่อยู่ท้ายข้อความหาย */}
                    <span className="block text-xs text-slate-500 dark:text-slate-400 sm:truncate">{it.note}</span>
                    {pct != null && (
                      <span className="mt-1.5 block h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" aria-label={`นับแล้ว ${pct}%`}>
                        <span className="block h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
                      </span>
                    )}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums shrink-0 ${sev.pill}`}>
                    {it.key === 'annualCount' ? `เหลือ ${fmtNum(it.count)}` : fmtNum(it.count)}
                  </span>
                  <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
        {canCollapse && !expanded && hiddenCount > 0 && (
          <button type="button" onClick={toggleExpanded} aria-expanded="false"
            className="w-full flex items-center justify-center gap-1 px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 text-xs font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors">
            ดูทั้งหมด (อีก {hiddenCount} เรื่อง) <ChevronDown size={14} />
          </button>
        )}
        </>
      )}
    </section>
  );
}

// ── โมดอลรายการของคิว — แสดง rows ชุดเดียวกับตัวเลขในคิว (Rule #6) ─────────
// คอลัมน์ต่อชนิดรายการ: จอ ≥ sm = ตาราง · จอเล็ก = การ์ด (Rule #5) ใช้นิยามคอลัมน์ชุดเดียวกัน
// คงเหลือกับหน่วยแยกคอลัมน์ — หน่วยแบบ "200เม็ด" คือขนาดบรรจุ ติดกับตัวเลขแล้วอ่านผิดเป็น "3200 เม็ด" ได้
const numOrDash = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? fmtNum(n) : (v || '-'); };
const fmtExpTh = (raw) => { const d = parseExpDate(raw); return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}` : (raw || '-'); };
const dash = (v) => (v == null || String(v).trim() === '' ? '-' : v);

const COL = {
  lot:      { label: 'Lot',      cell: r => dash(r.lot) },
  exp:      { label: 'หมดอายุ',  cell: r => fmtExpTh(r.exp), nowrap: true },
  location: { label: 'ที่เก็บ',   cell: r => dash(r.location) },
  qty:      { label: 'คงเหลือ',  cell: r => numOrDash(r.qty), num: true },
  unit:     { label: 'หน่วย',    cell: r => unitLabel(r.unit) || '-', nowrap: true },
};
// ยาเข้าใหม่ / ตัดออก — วันที่รับ บริษัท ราคา มาจากแถวรับ (receiveSummary ใน formularyChange.js)
const fmtPrice = (v) => (v == null ? '-' : Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const FCOL = {
  received: { label: 'วันที่รับ', nowrap: true, cell: r => (!r.firstReceive ? '-' : (
    <>
      {fmtYmdBE(r.firstReceive)}
      {r.lastReceive && r.lastReceive !== r.firstReceive && <span className="block text-xs text-slate-400 dark:text-slate-500">ล่าสุด {fmtYmdBE(r.lastReceive)}</span>}
    </>
  )) },
  total:    { label: 'คงเหลือ', cell: r => (r.total == null ? '-' : fmtNum(r.total)), num: true },
  supplier: { label: 'บริษัท', cell: r => dash(r.supplier), wide: true },
  // ราคาคิดต่อหน่วยในบิล — แท็บตัดออก หน่วยบิลต่างหน่วยคงเหลือได้ จึงกำกับหน่วยไว้
  price:    { label: 'ราคา/หน่วย', num: true, nowrap: true, cell: r => `${fmtPrice(r.price)}${r.price != null && r.priceUnit && r.priceUnit !== r.unit ? ` / ${unitLabel(r.priceUnit)}` : ''}` },
};
// จำนวนที่แจ้ง + เรทเบิก/เดือน ตามรายงาน ณ วันแจ้ง (ADR-0030 amendment) — snapshot: true = ซ่อนเมื่อไม่มีค่าเลย (ผู้เบิก)
const PR_SNAPSHOT_COLS = [
  { label: 'แจ้งซื้อ', num: true, nowrap: true, snapshot: true, cell: r => fmtReportNum(r.qty_requested) },
  { label: 'เรท/เดือน ตอนแจ้ง', num: true, nowrap: true, snapshot: true, cell: r => fmtReportNum(r.rate_per_month) },
];
const QUEUE_COLUMNS = {
  expired:        [COL.lot, COL.exp, COL.location, COL.qty, COL.unit],
  nearExpiry:     [COL.lot, COL.exp, COL.location, COL.qty, COL.unit],
  swap:           [COL.lot, { label: 'บริษัท', cell: r => dash(r.company), wide: true }, COL.qty, COL.unit,
                   { label: 'การดำเนินการ', cell: r => SWAP_ACTION_STATUS[r.actionStatus] || SWAP_ACTION_STATUS.pending, nowrap: true }],
  outOfStock:     [COL.location, COL.qty, COL.unit, { label: 'Safety Stock', cell: r => numOrDash(r.safety_stock), num: true }],
  pendingReceive: [COL.lot, COL.location, COL.qty, COL.unit],
  loanOverdue:    [{ label: 'ทิศทาง', cell: r => (r.direction === 'lend' ? 'ให้ยืม' : 'ยืมมา'), nowrap: true },
                   { label: 'โรงพยาบาล', cell: r => dash(r.counterparty), wide: true }, COL.lot,
                   { label: 'จำนวน', cell: r => numOrDash(r.qty), num: true }, COL.unit],
  // โมดอล FormularyModal 3 แท็บ — rows มาจาก formularyChange.js · มติ PTC กางอ่านที่แถว (rowDetail) ไม่เป็นคอลัมน์
  newDrug:        [FCOL.received,
                   { label: 'ตรวจรับแล้ว', cell: r => (r.inspectedQty ? fmtNum(r.inspectedQty) : '-'), num: true },
                   { label: 'รอตรวจรับ', cell: r => (r.pendingQty ? fmtNum(r.pendingQty) : '-'), num: true },
                   FCOL.total, COL.unit, FCOL.supplier, FCOL.price],
  formularyOut:   [FCOL.received, FCOL.total, COL.unit,
                   { label: 'Lot ที่มีของ', cell: r => (r.lots ? fmtNum(r.lots) : '-'), num: true },
                   FCOL.supplier, FCOL.price],
  // รายงานแจ้งซื้อยา (ADR-0030) — หมายเหตุ/จำนวนที่แจ้ง/เรทเฉพาะ staff: แถวของผู้เบิกถูกล้างก่อนส่งมา (AppRoot)
  purchaseWaiting:  [{ label: 'วันที่แจ้ง', cell: r => fmtYmdBE(r.notified_on), nowrap: true }, COL.unit, ...PR_SNAPSHOT_COLS,
                     { label: 'เหตุผล · หมายเหตุ', wide: true, full: true, cell: r => [r.reason, r.note].filter(Boolean).join(' · ') || '-' }],
  purchaseNotMoved: [{ label: 'วันที่แจ้ง', cell: r => fmtYmdBE(r.notified_on), nowrap: true }, ...PR_SNAPSHOT_COLS,
                     { label: 'บิลซื้อเข้า', cell: r => fmtYmdBE(r.arrivedOn), nowrap: true },
                     { label: 'แถวใน Excel', cell: r => `${dash(r.source_sheet)} ${r.source_row ?? ''}`.trim(), nowrap: true }],
  ptcRegister:    [{ label: 'วันที่ประชุม', cell: r => fmtYmdBE(r.ptc_date), nowrap: true },
                   { label: 'อ้างอิง', cell: r => dash(r.ptc_ref) },
                   { label: 'หมายเหตุ', cell: r => dash(r.note), wide: true }],
};

// กางใต้แถวยา (แท็บยาเข้าใหม่ / ตัดออก) — กดชื่อยาเพื่อเปิด/ปิด
function PtcDetail({ e }) {
  if (!e) return <p className="text-xs text-slate-500 dark:text-slate-400">ไม่มีมติในทะเบียน PTC</p>;
  const line = (label, value) => (
    <div className="flex gap-2 min-w-0">
      <dt className="text-slate-400 dark:text-slate-500 shrink-0">{label}</dt>
      <dd className="text-slate-700 dark:text-slate-200 min-w-0 break-words">{value}</dd>
    </div>
  );
  return (
    <dl className="space-y-1 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
      {line('มติ PTC', <span className="font-semibold">{CHANGE_TYPE_LABEL[e.change_type]} · ประชุม {fmtYmdBE(e.ptc_date)}</span>)}
      {e.ptc_ref && line('อ้างอิง', e.ptc_ref)}
      {line('ชื่อตามเอกสาร', e.drug_name)}
      {e.note && line('หมายเหตุ', e.note)}
    </dl>
  );
}
const NEW_DRUG_BADGE = {
  inspected: { badge: 'ตรวจรับแล้ว', tone: 'emerald' },
  pending:   { badge: 'รอตรวจรับ', tone: 'amber' },
  noStock:   { badge: 'มติแล้ว รอของ', tone: 'slate' },
  noCode:    { badge: 'มติแล้ว ยังไม่มีรหัส', tone: 'slate' },
};
const NON_PURCHASE_TAG = { 'การสนับสนุน': 'ยาสนับสนุน', 'การบริจาค': 'ยาบริจาค' };

const purchaseNote = (p) => `แจ้งซื้อแล้ว ${fmtNum(p.waitDays)} วัน (${fmtYmdBE(p.notified_on)})`;

// ชื่อยา + รหัส + หมายเหตุ + ป้ายท้ายแถว
function rowHead(key, r) {
  const name = r.name || r.drug_name || r.code || r.drug_code || '-';
  const code = r.code || r.drug_code || '';
  switch (key) {
    case 'expired':
      return { name, code, badge: `หมดอายุแล้ว ${fmtNum(-r.daysLeft)} วัน`, tone: 'red' };
    case 'nearExpiry':
      return { name, code, badge: r.daysLeft === 0 ? 'หมดอายุวันนี้' : `อีก ${fmtNum(r.daysLeft)} วัน`, tone: r.daysLeft <= 30 ? 'red' : 'amber' };
    case 'swap': {
      const d = r.daysToDeadline;
      return { name, code, note: r.willDeplete ? 'คาดว่าจะหมดเองก่อนเส้นตาย' : null,
        badge: d == null ? (r.status === 'overdue' ? 'พ้นกำหนด' : 'คืนได้แล้ว') : d < 0 ? `เลยเส้นตาย ${fmtNum(-d)} วัน` : `เหลือ ${fmtNum(d)} วัน`, tone: isSwapRed(r) ? 'red' : 'amber' };
    }
    case 'outOfStock':
      return { name, code, note: r.purchasePending ? purchaseNote(r.purchasePending) : null, badge: 'หมด', tone: 'red' };
    case 'purchaseWaiting':
      return { name, code, note: r.count > 1 ? `แจ้ง ${fmtNum(r.count)} ใบ (แสดงใบเก่าสุด)` : null,
        badge: `รอ ${fmtNum(r.waitDays)} วัน`, tone: r.waitDays > 60 ? 'red' : 'amber' };
    case 'purchaseNotMoved':
      return { name, code, badge: `รอ ${fmtNum(r.leadDays)} วันถึงได้ของ`, tone: 'emerald' };
    case 'pendingReceive':
      return { name, code, badge: r.waitDays == null ? 'ไม่ทราบวันรับ' : `รอ ${fmtNum(r.waitDays)} วัน`, tone: 'amber' };
    case 'loanOverdue':
      return { name, code, badge: `ค้าง ${fmtNum(r.overdueDays)} วัน`, tone: 'red' };
    case 'newDrug': {
      const tags = (r.types || []).map(t => NON_PURCHASE_TAG[t]).filter(Boolean);
      return { name, code, note: tags.length ? tags.join(' · ') : null, ...(NEW_DRUG_BADGE[r.status] || { badge: '', tone: 'slate' }) };
    }
    case 'formularyOut':
      return r.notFlagged
        ? { name, code, badge: 'Master ยังไม่ตั้งธง', tone: 'red' }
        : { name, code, badge: r.total > 0 ? 'ยังมีของ' : 'หมดแล้ว', tone: r.total > 0 ? 'amber' : 'slate' };
    case 'ptcRegister':
      return { name, code, badge: CHANGE_TYPE_LABEL[r.change_type] || '', tone: r.change_type === 'in' ? 'emerald' : 'amber' };
    default:
      return { name, code, badge: '', tone: 'slate' };
  }
}

function QueueBadge({ head }) {
  if (!head.badge) return null;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums whitespace-nowrap ${(SEVERITY[head.tone] || SEVERITY.slate).pill}`}>{head.badge}</span>;
}

// span block ไม่ใช่ p — ต้องอยู่ใน <button> ได้ (แถวที่กางรายละเอียดได้)
function DrugCell({ head }) {
  return (
    <>
      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">{head.name}</span>
      {head.code && <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5">รหัส {head.code}</span>}
      {head.note && <span className="block text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">{head.note}</span>}
    </>
  );
}

// ช่องยา: มี rowDetail = ปุ่ม ▸ กางรายละเอียดใต้แถว
function DrugToggle({ head, open, onToggle }) {
  if (!onToggle) return <DrugCell head={head} />;
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className="flex items-start gap-1.5 text-left w-full">
      <ChevronRight size={15} className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      <span className="min-w-0"><DrugCell head={head} /></span>
    </button>
  );
}

export function QueueDetailModal({ item, onClose, manage, toolbar = null, footerStart = null, columns = null, bodyTop = null, rowDetail = null, statusLabel = 'สถานะ' }) {
  const [openRows, setOpenRows] = useState(() => new Set());
  useEffect(() => {
    if (!item) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);
  if (!item) return null;
  const cols = columns || QUEUE_COLUMNS[item.key] || [];
  const rowKey = (r, i) => r.key ?? r.id ?? `${r.code}|${r.lot}|${i}`;
  const toggleFor = (k) => (rowDetail ? () => setOpenRows(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  }) : null);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={item.label}
        className="bg-white dark:bg-slate-900 w-full sm:max-w-5xl max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="shrink-0 flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{item.label} <span className="tabular-nums text-slate-400 dark:text-slate-500 font-semibold">({fmtNum(item.rows.length)})</span></h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.note}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"><X size={18} /></button>
        </div>
        {/* shrink-0: แถบแท็บเป็น overflow-x-auto (min-height = 0) — จอเตี้ยแล้วถูกบีบจนแท็บหายใต้ส่วนเลื่อน */}
        {toolbar && <div className="shrink-0">{toolbar}</div>}

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* อยู่ในส่วนเลื่อน — ฟอร์มยาวบนจอเตี้ยต้องเลื่อนถึงปุ่มได้ (toolbar ไม่เลื่อน) */}
          {bodyTop}
          {item.rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">ไม่พบรายการตามตัวกรอง</p>}
          {/* จอ ≥ sm: ตาราง */}
          <table className="hidden sm:table w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-4 py-2">ยา</th>
                {cols.map(c => <th key={c.label} className={`px-3 py-2 whitespace-nowrap ${c.num ? 'text-right' : ''}`}>{c.label}</th>)}
                <th className="px-4 py-2 text-right">{statusLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {item.rows.map((r, i) => {
                const head = rowHead(item.key, r);
                const k = rowKey(r, i);
                const open = openRows.has(k);
                return (
                  <React.Fragment key={k}>
                    <tr className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 min-w-[12rem]"><DrugToggle head={head} open={open} onToggle={toggleFor(k)} /></td>
                      {cols.map(c => (
                        <td key={c.label} className={`px-3 py-2.5 ${c.num ? 'text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'} ${c.nowrap ? 'whitespace-nowrap' : ''} ${c.wide ? 'min-w-[10rem]' : ''}`}>{c.cell(r)}</td>
                      ))}
                      <td className="px-4 py-2.5 text-right"><QueueBadge head={head} /></td>
                    </tr>
                    {open && (
                      <tr><td colSpan={cols.length + 2} className="px-4 pb-3 pt-0 pl-10">{rowDetail(r)}</td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {/* จอเล็ก: การ์ด — คอลัมน์ชุดเดียวกันเป็น ป้าย : ค่า */}
          <ul className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {item.rows.map((r, i) => {
              const head = rowHead(item.key, r);
              const k = rowKey(r, i);
              const open = openRows.has(k);
              return (
                <li key={k} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><DrugToggle head={head} open={open} onToggle={toggleFor(k)} /></div>
                    <div className="shrink-0"><QueueBadge head={head} /></div>
                  </div>
                  {open && <div className="mt-2">{rowDetail(r)}</div>}
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {cols.map(c => (
                      <div key={c.label} className={`flex gap-1.5 min-w-0 ${c.full ? 'col-span-2' : ''}`}>
                        <dt className="text-slate-400 dark:text-slate-500 shrink-0">{c.label}</dt>
                        <dd className={`text-slate-700 dark:text-slate-200 min-w-0 break-words ${c.num ? 'font-semibold tabular-nums' : ''}`}>{c.cell(r)}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-800">
          {footerStart}
          <button type="button" onClick={onClose} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:border-slate-400 text-slate-700 dark:text-slate-200 rounded-xl py-2 px-4 font-medium text-sm transition-colors">ปิด</button>
          {manage && (
            <button type="button" onClick={() => { onClose(); manage.run(); }}
              className="inline-flex items-center gap-1.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl py-2 px-4 font-semibold text-sm shadow-sm">
              {manage.label} <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── โมดอลรายการแจ้งซื้อ (รอของ / ไฟล์ยังไม่ย้าย) — QueueDetailModal + ช่องค้นชื่อยา/รหัส ─────────
// ตัวเลขหัวโมดอลนับตามที่กรอง · ตัวเลขในคิว/การ์ด = ทั้งหมด (ค้นว่าง = ตรงกัน)
export function PurchaseQueueModal({ item, manage, onClose }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    if (!item) return null;
    const s = q.trim().toLowerCase();
    if (!s) return item;
    return { ...item, rows: item.rows.filter(r => String(r.code || '').toLowerCase().includes(s) || String(r.name || '').toLowerCase().includes(s)) };
  }, [item, q]);
  if (!item) return null;
  const toolbar = (
    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
      <div className="relative sm:w-72">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นชื่อยา / รหัส" aria-label="ค้นชื่อยาหรือรหัส"
          className="w-full border border-slate-300 dark:border-slate-600 rounded-xl pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400" />
      </div>
    </div>
  );
  const rowDetail = item.key === 'purchaseNotMoved' ? (r => <PurchaseArrivals row={r} />) : null;
  const hasSnapshot = item.rows.some(r => r.qty_requested != null || r.rate_per_month != null);
  const columns = (QUEUE_COLUMNS[item.key] || []).filter(c => hasSnapshot || !c.snapshot);
  return <QueueDetailModal item={shown} manage={manage} onClose={onClose} toolbar={toolbar} rowDetail={rowDetail} columns={columns} />;
}

// กางแถว "ไฟล์ยังไม่ย้าย" — บิลซื้อตั้งแต่วันที่แจ้ง (โหลดตอนกาง · บิลแรก = บิลที่ทำให้ขึ้นว่ามาแล้ว)
function PurchaseArrivals({ row }) {
  const [state, setState] = useState({ loading: true, error: '', rows: [] });
  useEffect(() => {
    let alive = true;
    fetchPurchaseArrivals(row.code, row.notified_on)
      .then(rows => { if (alive) setState({ loading: false, error: '', rows }); })
      .catch(e => { if (alive) setState({ loading: false, error: e.message || 'โหลดไม่สำเร็จ', rows: [] }); });
    return () => { alive = false; };
  }, [row.code, row.notified_on]);

  if (state.loading) return <p className="text-xs text-slate-400 dark:text-slate-500 inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> กำลังโหลดบิลรับเข้า…</p>;
  if (state.error) return <p className="text-xs text-red-600 dark:text-red-400">โหลดบิลรับเข้าไม่สำเร็จ: {state.error}</p>;
  if (!state.rows.length) return <p className="text-xs text-slate-500 dark:text-slate-400">ไม่พบบิลซื้อตั้งแต่ {fmtYmdBE(row.notified_on)}</p>;
  return (
    <div className="space-y-1.5">
      {(row.qty_requested != null || row.rate_per_month != null) && (
        <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
          แจ้งซื้อ {fmtYmdBE(row.notified_on)} จำนวน <b className="font-semibold text-slate-800 dark:text-slate-100">{fmtReportNum(row.qty_requested)}</b> {unitLabel(row.unit)}
          <span className="text-slate-400 dark:text-slate-500"> · เรทตอนแจ้ง {fmtReportNum(row.rate_per_month)}/เดือน</span>
        </p>
      )}
      <ul className="space-y-1.5">
        {state.rows.map(b => (
          <li key={b.id} className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">รับ {fmtYmdBE(b.receive_date)}</span>
              <span className="text-slate-600 dark:text-slate-300">บิล {b.bill_number || '-'}{b.po_number ? ` · PO ${b.po_number}` : ''}</span>
              <span className="text-slate-500 dark:text-slate-400 min-w-0 break-words">{b.supplier_current || '-'}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-slate-600 dark:text-slate-300 tabular-nums">
              <span>Lot {b.lot || '-'}</span>
              <span>EXP {b.exp || '-'}</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtNum(b.qty_received)} {unitLabel(b.drug_unit)}</span>
              {b.total_price_vat != null && <span>{Number(b.total_price_vat).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</span>}
              {b.receive_status && <span className="text-slate-500 dark:text-slate-400">{b.receive_status}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// กางแถวยาเข้าใหม่ — มติ PTC + รับเข้าเมื่อไร (แถวรับที่โหลดมาแล้ว) + ใครเบิก/เหลือหลังเบิก (โหลดตอนกาง)
const subHead = 'text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';
function NewDrugDetail({ row }) {
  const hasStock = row.status === 'inspected' || row.status === 'pending';
  const [state, setState] = useState({ loading: hasStock, error: '', rows: [] });
  useEffect(() => {
    if (!hasStock) return undefined;
    let alive = true;
    fetchNewDrugDispense(row.code, row.firstReceive)
      .then(rows => { if (alive) setState({ loading: false, error: '', rows }); })
      .catch(e => { if (alive) setState({ loading: false, error: e.message || 'โหลดไม่สำเร็จ', rows: [] }); });
    return () => { alive = false; };
  }, [hasStock, row.code, row.firstReceive]);

  if (!hasStock) return <PtcDetail e={row.ptc} />;
  const receipts = [...row.rows].reverse();
  const disp = summarizeNewDrugDispense(state.rows);
  const dispUnit = (disp.rows.find(r => r.drug_unit)?.drug_unit) || row.unit;
  return (
    <div className="space-y-3">
      <PtcDetail e={row.ptc} />
      <div>
        <p className={subHead}>รับเข้า {fmtNum(receipts.length)} ครั้ง</p>
        <ul className="mt-1 space-y-1.5">
          {receipts.map(b => (
            <li key={b.id} className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">รับ {fmtYmdBE(b.receive_date)}</span>
                <span className="text-slate-600 dark:text-slate-300">บิล {b.bill_number || '-'}</span>
                <span className="text-slate-500 dark:text-slate-400 min-w-0 break-words">{b.supplier_current || '-'}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-slate-600 dark:text-slate-300 tabular-nums">
                <span>Lot {b.lot || '-'}</span>
                <span>EXP {b.exp || '-'}</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtNum(b.qty_received)} {unitLabel(b.drug_unit)}</span>
                {b.purchase_type && b.purchase_type !== 'การซื้อ' && <span>{NON_PURCHASE_TAG[b.purchase_type] || b.purchase_type}</span>}
                {b.receive_status && <span className={b.receive_status === 'รอตรวจรับ' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}>{b.receive_status}</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className={subHead}>เบิกจ่าย</p>
        {state.loading && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> กำลังโหลดประวัติเบิก…</p>}
        {state.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">โหลดประวัติเบิกไม่สำเร็จ: {state.error}</p>}
        {!state.loading && !state.error && disp.rows.length === 0 && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">ยังไม่มีการเบิก · คงเหลือ {row.total == null ? '-' : fmtNum(row.total)} {unitLabel(row.unit)}</p>
        )}
        {!state.loading && !state.error && disp.rows.length > 0 && (
          <>
            <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
              เบิก <span className="font-semibold tabular-nums">{fmtNum(disp.count)}</span> ครั้ง รวม <span className="font-semibold tabular-nums">{fmtNum(disp.total)}</span> {unitLabel(dispUnit)}
              {' · '}คงเหลือตอนนี้ <span className="font-semibold tabular-nums">{row.total == null ? '-' : fmtNum(row.total)}</span> {unitLabel(row.unit)}
            </p>
            {disp.byDept.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {disp.byDept.map(d => (
                  <span key={d.dept} className="inline-flex items-center gap-1 rounded-full bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 px-2 py-0.5 text-xs">
                    <span className="min-w-0 break-words">{d.dept}</span>
                    <span className="font-semibold tabular-nums">{fmtNum(d.qty)}</span>
                    {d.times > 1 && <span className="opacity-70">({fmtNum(d.times)} ครั้ง)</span>}
                  </span>
                ))}
              </div>
            )}
            <ul className="mt-1.5 space-y-1.5">
              {disp.rows.map(r => {
                const recordOnly = String(r.item_type || '').includes('บันทึกเท่านั้น');
                return (
                  <li key={r.id} className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{fmtYmdBE(r.dispense_date)}</span>
                      <span className="text-slate-700 dark:text-slate-200 min-w-0 break-words">{r.department || '-'}</span>
                      {recordOnly && <span className="text-amber-600 dark:text-amber-400">บันทึกเท่านั้น (ไม่ตัดยอด)</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-slate-600 dark:text-slate-300 tabular-nums">
                      <span>เบิก <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtNum(r.qty_out)}</span> {unitLabel(r.drug_unit)}</span>
                      <span>Lot {r.lot || '-'}</span>
                      {r.qty_after != null && <span>เหลือใน lot {fmtNum(r.qty_after)}</span>}
                    </div>
                    {r.note && <p className="mt-0.5 text-slate-500 dark:text-slate-400 break-words">{r.note}</p>}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// ── โมดอลยาเข้าใหม่ / ตัดออกจากบัญชี / ทะเบียนมติ PTC — 3 แท็บ ครอบ QueueDetailModal ─────────
// ตรรกะอยู่ lib/formularyChange.js · รายการคำนวณจากข้อมูลที่ AppRoot โหลดไว้ ไม่ query ใหม่
// นิยาม CONTEXT.md §ยาเข้าใหม่ · §ยาตัดออกจากบัญชี
const FORMULARY_TABS = [
  { key: 'newDrug', label: 'ยาเข้าใหม่' },
  { key: 'formularyOut', label: 'ตัดออกจากบัญชี' },
  { key: 'ptcRegister', label: 'ทะเบียนมติ PTC' },
];
const EMPTY_FORMULARY_FORM = { change_type: 'in', ptc_date: '', drug_code: '', drug_name: '', ptc_ref: '', note: '' };
const inputCls = 'w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-base sm:text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500';

// ปฏิทินแสดง พ.ศ. ทับ input type=date (Rule #3/#14 — สำเนาจาก AnalyticsApp)
function IsoDateInput({ value, onChange, label }) {
  const display = (iso) => { if (!iso) return null; const [y, m, d] = iso.split('-'); return `${d}/${m}/${Number(y) + 543}`; };
  return (
    <div className="relative flex items-center bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus-within:ring-2 focus-within:ring-sky-500">
      <span className={`px-3 py-1.5 text-base sm:text-sm w-full select-none pointer-events-none ${value ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>{display(value) || 'วว/ดด/ปปปป'}</span>
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)} aria-label={label}
        onClick={e => { try { e.currentTarget.showPicker?.(); } catch { /* noop */ } }}
        className="absolute inset-0 opacity-0 w-full cursor-pointer" />
    </div>
  );
}

function FormField({ label, wide = false, children }) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function FormularyEntryForm({ initial, saving, error, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const [localErr, setLocalErr] = useState('');
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    const bad = validateFormularyEntry(f);
    setLocalErr(bad || '');
    if (!bad) onSave(f);
  };
  return (
    <form onSubmit={submit} className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label="ประเภทมติ">
          <select value={f.change_type} onChange={e => set('change_type')(e.target.value)} className={inputCls}>
            <option value="in">{CHANGE_TYPE_LABEL.in}</option>
            <option value="out">{CHANGE_TYPE_LABEL.out}</option>
          </select>
        </FormField>
        <FormField label="วันที่ประชุม PTC"><IsoDateInput value={f.ptc_date} onChange={set('ptc_date')} label="วันที่ประชุม PTC" /></FormField>
        <FormField label={f.change_type === 'out' ? 'รหัสยา (ต้องมี)' : 'รหัสยา (ถ้ามี)'}>
          <input type="text" value={f.drug_code} onChange={e => set('drug_code')(e.target.value)} placeholder="เช่น 1590035" className={inputCls} />
        </FormField>
        <FormField label="ชื่อยาตามเอกสารมติ" wide>
          <input type="text" value={f.drug_name} onChange={e => set('drug_name')(e.target.value)} className={inputCls} />
        </FormField>
        <FormField label="เลขที่/อ้างอิงเอกสาร">
          <input type="text" value={f.ptc_ref} onChange={e => set('ptc_ref')(e.target.value)} className={inputCls} />
        </FormField>
        <FormField label="หมายเหตุ" wide>
          <input type="text" value={f.note} onChange={e => set('note')(e.target.value)} className={inputCls} />
        </FormField>
        <div className="flex items-end gap-2">
          <button type="button" onClick={onCancel} disabled={saving}
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:border-slate-400 text-slate-700 dark:text-slate-200 rounded-xl py-2 px-3 font-medium text-sm">ยกเลิก</button>
          <button type="submit" disabled={saving}
            className="flex-1 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl py-2 px-3 font-semibold text-sm shadow-sm disabled:opacity-60">
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
      {(localErr || error) && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{localErr || error}</p>}
    </form>
  );
}

export function FormularyModal({ raw, discontinued = [], today, auth, onChanged, onClose }) {
  const [tab, setTab] = useState('newDrug');
  const [days, setDays] = useState(NEW_DRUG_DAYS[0]);
  const [outAll, setOutAll] = useState(false);
  const [newFilter, setNewFilter] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);   // null | { row: null (เพิ่ม) | entry (แก้) }
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [toDelete, setToDelete] = useState(null);
  // จำข้อความที่คัดลอก ไม่ใช่ true/false — เปลี่ยนช่วงวันแล้วปุ่มกลับเป็น "คัดลอก" เอง
  const [copiedText, setCopiedText] = useState('');
  const [manualText, setManualText] = useState(''); // คัดลอกอัตโนมัติไม่ได้ (LINE WebView) → ให้เลือกข้อความเอง

  const ptcEntries = useMemo(() => raw?.ptcEntries || [], [raw]);
  const newDrugs = useMemo(() => (raw ? buildNewDrugs({ ...raw, today, days }) : []), [raw, today, days]);
  const receiveByCode = raw?.outReceiveByCode;
  const outWithStock = useMemo(() => buildFormularyOut({ discontinued, ptcEntries, receiveByCode }), [discontinued, ptcEntries, receiveByCode]);
  const outEvery = useMemo(() => buildFormularyOut({ discontinued, ptcEntries, receiveByCode, onlyWithStock: false }), [discontinued, ptcEntries, receiveByCode]);
  const registry = useMemo(() => sortRegistry(ptcEntries), [ptcEntries]);
  const line = useMemo(() => buildNewDrugLine(newDrugs, { today, days }), [newDrugs, today, days]);
  const lineCount = line ? line.split('\n').length - 2 : 0;
  const copied = !!line && copiedText === line;
  const received = countReceivedNew(newDrugs);

  const s = q.trim().toLowerCase();
  const match = (r) => !s || [r.name, r.drug_name, r.code, r.drug_code, r.ptc_ref, r.note, r.supplier].some(v => String(v || '').toLowerCase().includes(s));
  const newFilterCount = useMemo(() => countNewDrugFilters(newDrugs), [newDrugs]);
  const newFilterTest = (NEW_DRUG_FILTERS.find(f => f.key === newFilter) || NEW_DRUG_FILTERS[0]).test;
  const all = { newDrug: newDrugs.filter(newFilterTest), formularyOut: outAll ? outEvery : outWithStock, ptcRegister: registry }[tab];
  const rows = all.filter(match);
  const tabCount = { newDrug: received, formularyOut: outWithStock.length, ptcRegister: registry.length };

  const NOTE = {
    newDrug: `รับเข้าครั้งแรก ${fmtYmdBE(windowFromYmd(today, days))} – ${fmtYmdBE(today)} · ของเข้าแล้ว ${fmtNum(received)} · มติเข้าบัญชีรอของ ${fmtNum(newDrugs.length - received)} (แสดงทุกช่วงวัน) · ข้อความไลน์ใช้เฉพาะตรวจรับแล้ว`,
    formularyOut: `ธงจริงอยู่ที่ Master คอลัมน์ A "ตัดออก" · ${outAll ? 'แสดงทุกรายการ' : 'เฉพาะที่ยังมีของ'} · ยอดแปลงเป็นหน่วยหลักของยา`,
    ptcRegister: 'มติเข้า/ออกบัญชียาจากเอกสารประชุม PTC · แก้ทะเบียนไม่แตะธงตัดออกใน Master',
  };

  const copyLine = async () => {
    try {
      await navigator.clipboard.writeText(line);
      setCopiedText(line);
    } catch {
      setManualText(line);
    }
  };

  const save = async (form) => {
    setSaving(true); setSaveErr('');
    try {
      if (editing?.row) await updateFormularyChange(editing.row.id, form, auth);
      else await insertFormularyChange(form, auth);
      setEditing(null);
      onChanged?.();
    } catch (e) {
      setSaveErr(e?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };
  const confirmDelete = async () => {
    setSaving(true);
    try {
      await deleteFormularyChange(toDelete.id, auth);
      onChanged?.();
    } catch (e) {
      setSaveErr(e?.message || 'ลบไม่สำเร็จ');
    } finally {
      setToDelete(null);
      setSaving(false);
    }
  };

  const columns = tab === 'ptcRegister'
    ? [...QUEUE_COLUMNS.ptcRegister, {
        label: 'จัดการ', nowrap: true, cell: r => (
          <span className="inline-flex gap-1">
            <button type="button" onClick={() => { setSaveErr(''); setEditing({ row: r }); }} aria-label={`แก้ไขมติ ${r.drug_name}`}
              className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40"><Pencil size={15} /></button>
            <button type="button" onClick={() => { setSaveErr(''); setToDelete(r); }} aria-label={`ลบมติ ${r.drug_name}`}
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"><Trash2 size={15} /></button>
          </span>
        ),
      }]
    : null;

  const segBtn = (active) => `text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${active ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`;
  const toolbar = (
    <>
      {/* flex w-max ไม่ใช่ inline-flex — inline ในกล่อง overflow ถูกตัดขอบล่างจากช่องว่าง baseline */}
      <div className="px-4 pt-2.5 pb-0.5 overflow-x-auto">
        <div role="tablist" aria-label="ยาเข้าใหม่ ตัดออก ทะเบียนมติ" className="flex w-max items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
          {FORMULARY_TABS.map(t => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
              onClick={() => { setTab(t.key); setEditing(null); setSaveErr(''); }} className={segBtn(tab === t.key)}>
              {t.label} <span className="tabular-nums opacity-70">({fmtNum(tabCount[t.key])})</span>
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2">
        {tab === 'newDrug' && (
          <div className="inline-flex self-start items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            {NEW_DRUG_DAYS.map(d => (
              <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} className={segBtn(days === d)}>{d} วัน</button>
            ))}
          </div>
        )}
        {tab === 'formularyOut' && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
            <input type="checkbox" checked={outAll} onChange={e => setOutAll(e.target.checked)} className="rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
            แสดงที่หมดแล้วด้วย
          </label>
        )}
        {tab === 'ptcRegister' && !editing && (
          <button type="button" onClick={() => { setSaveErr(''); setEditing({ row: null }); }}
            className="inline-flex self-start items-center gap-1.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl py-1.5 px-3 font-semibold text-sm shadow-sm whitespace-nowrap">
            <Plus size={15} /> เพิ่มมติ
          </button>
        )}
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นชื่อยา รหัส บริษัท" aria-label="ค้นหายาในแท็บนี้"
            className="w-full border border-slate-300 dark:border-slate-600 rounded-xl pl-9 pr-3 py-1.5 text-base sm:text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
      </div>
      {/* ตัวกรองยาเข้าใหม่ — ซ่อนตัวที่ไม่มีรายการในช่วงวันนี้ (ยกเว้นตัวที่เลือกอยู่) */}
      {tab === 'newDrug' && (
        <div role="group" aria-label="กรองยาเข้าใหม่" className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
          {NEW_DRUG_FILTERS.filter(f => f.key === 'all' || f.key === newFilter || newFilterCount[f.key] > 0).map(f => {
            const active = newFilter === f.key;
            return (
              <button key={f.key} type="button" onClick={() => setNewFilter(f.key)} aria-pressed={active}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${active
                  ? 'bg-sky-600 border-sky-600 text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-sky-400'}`}>
                {f.label} <span className="tabular-nums opacity-80">({fmtNum(newFilterCount[f.key])})</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
  const bodyTop = tab !== 'ptcRegister' ? null : editing ? (
    <FormularyEntryForm key={editing.row?.id ?? 'new'}
      initial={editing.row
        ? { ...EMPTY_FORMULARY_FORM, ...editing.row, drug_code: editing.row.drug_code || '', ptc_ref: editing.row.ptc_ref || '', note: editing.row.note || '' }
        : EMPTY_FORMULARY_FORM}
      saving={saving} error={saveErr} onSave={save} onCancel={() => { setEditing(null); setSaveErr(''); }} />
  ) : saveErr ? <p className="px-4 py-2 text-sm text-red-600 dark:text-red-400 border-b border-slate-100 dark:border-slate-800">{saveErr}</p> : null;

  const footerStart = tab === 'newDrug' ? (
    <div className="w-full sm:w-auto sm:mr-auto">
      <button type="button" onClick={copyLine} disabled={!line}
        className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-xl py-2 px-3 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? 'คัดลอกแล้ว' : `คัดลอกข้อความไลน์ (${fmtNum(lineCount)} ยา)`}
      </button>
      {manualText && manualText === line && (
        <textarea readOnly rows={4} value={manualText} aria-label="ข้อความไลน์สำหรับคัดลอกเอง" onFocus={e => e.target.select()}
          className="mt-2 w-full sm:w-96 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-base sm:text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800" />
      )}
    </div>
  ) : null;

  return (
    <>
      <QueueDetailModal
        item={{ key: tab, label: 'ยาเข้าใหม่ / ตัดออกจากบัญชี', note: NOTE[tab], rows }}
        columns={columns}
        bodyTop={bodyTop}
        rowDetail={tab === 'ptcRegister' ? null : tab === 'newDrug' ? (r) => <NewDrugDetail row={r} /> : (r) => <PtcDetail e={r.ptc} />}
        statusLabel={tab === 'newDrug' ? 'ตรวจรับ' : 'สถานะ'}
        onClose={onClose}
        toolbar={toolbar}
        footerStart={footerStart}
      />
      <ConfirmModal
        open={!!toDelete}
        title="ลบมติออกจากทะเบียน"
        message={toDelete ? `${CHANGE_TYPE_LABEL[toDelete.change_type]} · ${toDelete.drug_name} · มติ ${fmtYmdBE(toDelete.ptc_date)}` : ''}
        warning="ลบแล้วกู้คืนในแอปไม่ได้ (รายละเอียดเดิมยังอยู่ใน Audit Log) · ไม่แตะธงตัดออกใน Master"
        confirmText="ลบมติ"
        tone="danger"
        loading={saving}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}

// ── ส่วนพับได้ (ภาพรวม) — alwaysOpenLg: จอคอมกางเสมอ ซ่อนปุ่ม ─────────────
export function Collapsible({ title, open, onToggle, alwaysOpenLg = false, children, className = '' }) {
  return (
    <div className={className}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm ${alwaysOpenLg ? 'lg:hidden' : ''}`}>
        <span className="inline-flex items-center gap-2"><Activity size={15} className="text-indigo-500" /> {title}</span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`${open ? 'block mt-3' : 'hidden'} ${alwaysOpenLg ? 'lg:block lg:mt-0' : ''}`}>{children}</div>
    </div>
  );
}

const TOP5_OPEN_KEY = 'dashboard_top5_open';

// ── คอลัมน์ภาพรวม: 3 ตัวเลข + ยาต้องสั่งซื้อ 5 อันดับ ─────────────────────
// purchase = summarizePurchaseStatus | null (ยังโหลด/ล้ม → การ์ดแจ้งซื้อแสดง – และไม่มีป้ายใน Top 5)
export function OverviewPanel({ alerts, purchase = null, wide = false, loaded = true, onOpenStock, onOpenExpiry, onOpenPending, onOpenLowStock, onOpenPurchase }) {
  // drugCount คำนวณใน fetchDashboardAlerts ด้วยกฎเดียวกับ fetchStockSummary (โมดอลที่การ์ดนี้เปิด) — Rule #6
  const drugCount = alerts?.drugCount ?? null;
  const expiring = alerts?.expiring || [];
  const lowStock = alerts?.lowStock || [];
  const pending = alerts?.pendingReceive || [];
  const expiredLots = expiring.filter(r => r.daysLeft != null && r.daysLeft < 0).length;
  const pendingMaxWait = pending.reduce((m, r) => (r.waitDays != null && r.waitDays > m ? r.waitDays : m), -1);
  const purchaseMaxWait = purchase?.waiting?.[0]?.waitDays ?? null;
  // การ์ดตัวเลข 4 ใบ: ตัวเลข + หน่วย + บรรทัดบอกเรื่องที่ต้องรู้ต่อ (เดิมมีแต่ตัวเลข ต้องเปิดโมดอลถึงรู้ว่าด่วนไหม)
  // "ต่ำกว่า Safety Stock" ถูกแทนด้วย "รอตรวจรับ" (user สั่ง 14/11/2569) — ยาต่ำกว่า SS ยังดูได้จาก "ยาต้องสั่งซื้อ 5 อันดับแรก" ด้านล่าง
  const tiles = [
    { key: 'stock', label: 'รายการยาในคลัง', value: drugCount, unit: 'รายการ', icon: Boxes, accent: 'bg-sky-500', tone: 'text-sky-700 dark:text-sky-300', chip: 'bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400',
      sub: 'คงเหลือมากกว่า 0 · ไม่นับยาตัดออก', onClick: onOpenStock },
    { key: 'expiry', label: 'ใกล้หมดอายุใน 16 เดือน', value: loaded ? expiring.length : null, unit: 'lot', icon: CalendarClock, accent: 'bg-orange-500', tone: 'text-orange-700 dark:text-orange-300', chip: 'bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400',
      sub: !loaded ? '' : expiredLots > 0 ? `หมดอายุแล้ว ${fmtNum(expiredLots)} lot` : 'ยังไม่มี lot หมดอายุ', subTone: expiredLots > 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : '',
      onClick: expiring.length ? onOpenExpiry : undefined },
    { key: 'pending', label: 'รอตรวจรับ', value: loaded ? pending.length : null, unit: 'lot', icon: Hourglass, accent: 'bg-amber-500', tone: 'text-amber-700 dark:text-amber-300', chip: 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400',
      sub: !loaded || pending.length === 0 ? (loaded ? 'ไม่มีของค้างตรวจรับ' : '') : pendingMaxWait >= 0 ? `รอนานสุด ${fmtNum(pendingMaxWait)} วัน` : 'ไม่ทราบวันรับ',
      subTone: pendingMaxWait > 7 ? 'text-rose-600 dark:text-rose-400 font-semibold' : '',
      onClick: pending.length ? onOpenPending : undefined },
    { key: 'purchase', label: 'แจ้งซื้อแล้ว รอของ', value: purchase ? purchase.waiting.length : null, unit: 'รายการ', icon: ShoppingBag, accent: 'bg-blue-500', tone: 'text-blue-700 dark:text-blue-300', chip: 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400',
      sub: purchaseMaxWait != null ? `รอนานสุด ${fmtNum(purchaseMaxWait)} วัน` : '', onClick: purchase?.waiting.length ? onOpenPurchase : undefined },
  ];
  const top5 = lowStock.slice(0, 5);
  // พับไว้เป็นค่าเริ่มต้น ให้กราฟด้านล่างอยู่ในจอ — จำการกาง/พับไว้ที่เครื่อง (localStorage อาจถูกปิดใน WebView)
  const [topOpen, setTopOpen] = useState(() => {
    try { return localStorage.getItem(TOP5_OPEN_KEY) === '1'; } catch { return false; }
  });
  const toggleTop = () => setTopOpen(v => {
    try { localStorage.setItem(TOP5_OPEN_KEY, v ? '0' : '1'); } catch { /* จำไม่ได้ — กาง/พับได้แค่รอบนี้ */ }
    return !v;
  });

  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${wide ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-1'}`}>
        {tiles.map(t => {
          const Icon = t.icon;
          const body = (
            <>
              <span className={`absolute inset-y-0 left-0 w-1 ${t.accent}`} aria-hidden="true" />
              <span className={`p-2.5 rounded-xl shrink-0 ${t.chip}`}><Icon size={18} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">{t.label}</span>
                <span className="flex items-baseline gap-1.5 mt-0.5">
                  <span className={`text-2xl font-bold tabular-nums leading-none ${t.tone}`}>{t.value == null ? '–' : fmtNum(t.value)}</span>
                  {t.value != null && <span className="text-xs text-slate-500 dark:text-slate-400">{t.unit}</span>}
                </span>
                {t.sub && <span className={`block text-[11px] mt-1 truncate ${t.subTone || 'text-slate-500 dark:text-slate-400'}`} title={t.sub}>{t.sub}</span>}
              </span>
              {t.onClick && <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />}
            </>
          );
          const cls = 'relative overflow-hidden w-full flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl pl-4 pr-3 py-3 shadow-sm text-left';
          return t.onClick
            ? <button key={t.key} type="button" onClick={t.onClick} className={`${cls} hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-shadow`}>{body}</button>
            : <div key={t.key} className={cls}>{body}</div>;
        })}
      </div>

      {top5.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
          <div className={`flex items-center justify-between gap-2 px-4 py-2.5 ${topOpen ? 'border-b border-slate-100 dark:border-slate-800' : ''}`}>
            <button type="button" onClick={toggleTop} aria-expanded={topOpen}
              className="flex-1 min-w-0 flex items-center gap-1.5 text-left">
              <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${topOpen ? '' : '-rotate-90'}`} />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-700 dark:text-slate-200">ยาต้องสั่งซื้อ 5 อันดับแรก</span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">ต่ำกว่า Safety Stock ทั้งหมด <span className="font-bold text-amber-700 dark:text-amber-300 tabular-nums">{fmtNum(lowStock.length)}</span> รายการ</span>
              </span>
            </button>
            {/* การ์ดตัวเลข "ต่ำกว่า Safety Stock" ถูกแทนด้วยรอตรวจรับ — ทางเข้ารายการเต็มย้ายมาที่นี่ (ทุก role เหมือนการ์ดเดิม) */}
            <button type="button" onClick={onOpenLowStock} className="shrink-0 text-xs text-sky-600 dark:text-sky-300 hover:underline underline-offset-2 font-semibold inline-flex items-center gap-0.5 px-1 py-1">
              ดูทั้งหมด <ArrowRight size={13} />
            </button>
          </div>
          {topOpen && <ul className="divide-y divide-slate-50 dark:divide-slate-800">
            {top5.map((r, i) => {
              const pr = purchase?.pendingByCode?.[String(r.code ?? '').trim()];
              return (
              <li key={r.code || i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-tight truncate">{r.name || r.code}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    คงเหลือ <span className="font-bold text-red-600 dark:text-red-400">{fmtNum(r.qty)}</span> / SS {fmtNum(r.safety_stock)}{unitLabel(r.unit) ? ` ${unitLabel(r.unit)}` : ''}
                  </p>
                  {pr && (
                    <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-[11px] font-semibold"
                      title={`แจ้งเมื่อ ${fmtYmdBE(pr.notified_on)}${pr.reason ? ` · ${pr.reason}` : ''}`}>
                      <ShoppingBag size={11} /> แจ้งซื้อแล้ว {fmtNum(pr.waitDays)} วัน
                    </p>
                  )}
                </div>
                <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-xs font-bold tabular-nums shrink-0">{Math.round((r.ratio || 0) * 100)}%</span>
              </li>
              );
            })}
          </ul>}
        </div>
      )}
    </div>
  );
}

// ── กราฟมูลค่าเบิกจ่าย vs รับเข้า รายเดือน (กราฟเดียว แกน y เดียว — หน่วยบาททั้งคู่) ──
// สีผ่าน dataviz validator แล้ว (10/10/2569): light #4f46e5/#0d9488 บน #ffffff · dark #6366f1/#0d9488 บน #0f172a
const FLOW_COLORS = {
  light: { dispense: '#4f46e5', receive: '#0d9488', grid: '#f1f5f9', tick: '#94a3b8' },
  dark:  { dispense: '#6366f1', receive: '#0d9488', grid: '#1e293b', tick: '#64748b' },
};

// AppShell สลับธีมด้วย class 'dark' ที่ <html> — สี recharts เป็น prop JS จึงต้องตามเอง
const readHtmlDark = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
function useHtmlDark() {
  const [dark, setDark] = useState(readHtmlDark);
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(readHtmlDark()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

// ย่อมูลค่าบาท: 1,250,000 → "1.25M", 12,500 → "12.5K" (แกน Y)
const fmtBahtShort = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(n);
};
const fmtBaht = (v) => `฿${(Number(v) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const CHART_RANGES = [
  { key: 3, label: '3 เดือน' },
  { key: 6, label: '6 เดือน' },
  { key: 12, label: '12 เดือน' },
  { key: 'all', label: 'ทั้งหมด' },
];

function TrendBadge({ pct }) {
  if (pct == null) return null;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${up ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40' : 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40'}`}>
      <Icon size={12} /> {Math.abs(pct)}%
    </span>
  );
}

// ตัวเลือกช่วงเปรียบเทียบ — months = จำนวนเดือน/ทั้งหมด · endYm = เดือนสิ้นสุด (ปิดเมื่อเลือกทั้งหมด)
function RangeSelector({ months, onChange, endYm, onChangeEndYm, monthRange = [], loading }) {
  const isAll = months === 'all';
  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {monthRange.length > 0 && (
        <select value={isAll ? '' : (endYm || '')} onChange={e => onChangeEndYm(e.target.value || null)}
          disabled={loading || isAll} title="เลือกเดือนสิ้นสุดของช่วงเปรียบเทียบ"
          className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed">
          <option value="">ถึงเดือนล่าสุด</option>
          {monthRange.map(m => <option key={m.ym} value={m.ym}>ถึง {m.label}</option>)}
        </select>
      )}
      <div className="inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
        {CHART_RANGES.map(r => (
          <button key={r.key} type="button" onClick={() => onChange(r.key)} disabled={loading}
            className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 ${months === r.key ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// รวม 2 ชุดตามเดือน (ym) — fetchDashboardCharts คืนเดือนชุดเดียวกันทั้งคู่ แต่ไม่พึ่งลำดับ
function mergeFlow(charts) {
  const byYm = new Map();
  for (const d of charts?.dispense || []) byYm.set(d.ym, { ym: d.ym, label: d.label, dispense: d.value || 0, receive: 0 });
  for (const r of charts?.receive || []) {
    const cur = byYm.get(r.ym) || { ym: r.ym, label: r.label, dispense: 0, receive: 0 };
    cur.receive = r.value || 0;
    byYm.set(r.ym, cur);
  }
  return [...byYm.values()].sort((a, b) => String(a.ym).localeCompare(String(b.ym)));
}

function FlowTooltip({ active, payload, label, colors }) {
  if (!active || !payload?.length) return null;
  const get = (k) => payload.find(p => p.dataKey === k)?.value;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{label}</p>
      <p className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: colors.dispense }} /> เบิกจ่าย <b className="tabular-nums ml-auto pl-3">{fmtBaht(get('dispense'))}</b></p>
      <p className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: colors.receive }} /> รับเข้า <b className="tabular-nums ml-auto pl-3">{fmtBaht(get('receive'))}</b></p>
    </div>
  );
}

export function MonthlyFlowChart({ charts, months = 6, onChangeMonths, endYm, onChangeEndYm, monthRange = [], onOpenDispense, onOpenReceive }) {
  const dark = useHtmlDark();
  const colors = dark ? FLOW_COLORS.dark : FLOW_COLORS.light;
  const loading = charts == null;
  const failed = charts?.error === true;
  const { trend = {}, maxValueMonth = null, maxReceiveValueMonth = null } = charts || {};

  const data = useMemo(() => mergeFlow(charts), [charts]);

  const dispenseTotal = data.reduce((s, d) => s + d.dispense, 0);
  const receiveTotal = data.reduce((s, d) => s + d.receive, 0);
  const hasData = dispenseTotal > 0 || receiveTotal > 0;

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600"><Activity size={15} /></div>
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">มูลค่าเบิกจ่าย vs รับเข้า รายเดือน</h3>
        </div>
        <RangeSelector months={months} onChange={onChangeMonths} endYm={endYm} onChangeEndYm={onChangeEndYm} monthRange={monthRange} loading={loading} />
      </div>

      {/* legend + ยอดรวม + แนวโน้ม — ระบุชุดข้อมูลด้วยชื่อ ไม่พึ่งสีอย่างเดียว */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        {[
          { key: 'dispense', label: 'เบิกจ่าย', total: dispenseTotal, pct: trend.dispensePct, labels: trend.dispenseLabels, shape: 'line' },
          { key: 'receive', label: 'รับเข้า', total: receiveTotal, pct: trend.receivePct, labels: trend.receiveLabels, shape: 'bar' },
        ].map(s => (
          <div key={s.key} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              {s.shape === 'line'
                ? <span className="inline-block w-4 h-0.5 rounded-full" style={{ background: colors[s.key] }} />
                : <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: colors[s.key] }} />}
              มูลค่า{s.label}รวม
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {/* ระหว่างโหลด/โหลดไม่สำเร็จ ห้ามโชว์ ฿0 — อ่านได้ว่า "เดือนนี้ไม่มีเบิก" */}
              <span className="text-xl font-black text-slate-800 dark:text-slate-100 tabular-nums">{loading || failed ? '–' : fmtBaht(s.total)}</span>
              <TrendBadge pct={s.pct} />
              {s.labels?.cur && <span className="text-xs text-slate-400 dark:text-slate-500">{s.labels.cur} เทียบ {s.labels.prev}</span>}
            </div>
          </div>
        ))}
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.tick }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: colors.tick }} axisLine={false} tickLine={false} width={44} tickFormatter={fmtBahtShort} />
            <Tooltip content={<FlowTooltip colors={colors} />} cursor={{ fill: dark ? '#1e293b' : '#f8fafc' }} />
            <Bar dataKey="receive" name="รับเข้า" fill={colors.receive} radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Line type="monotone" dataKey="dispense" name="เบิกจ่าย" stroke={colors.dispense} strokeWidth={2}
              dot={{ r: 4, fill: colors.dispense, stroke: dark ? '#0f172a' : '#ffffff', strokeWidth: 2 }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-8">
          {loading ? 'กำลังโหลด…' : failed ? 'โหลดข้อมูลกราฟไม่สำเร็จ — กด "โหลดหน้านี้ใหม่" ที่เมนูซ้าย' : 'ยังไม่มีข้อมูลสำหรับแสดงกราฟ'}
        </p>
      )}

      {(maxValueMonth?.value > 0 || maxReceiveValueMonth?.value > 0) && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {maxValueMonth?.value > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">เบิกสูงสุด <b className="text-slate-700 dark:text-slate-200">{maxValueMonth.label}</b> {fmtBaht(maxValueMonth.value)}</span>
              <button type="button" onClick={onOpenDispense} className="text-sky-600 dark:text-sky-300 hover:underline font-semibold inline-flex items-center gap-0.5 shrink-0">ประวัติเบิกจ่าย <ArrowRight size={13} /></button>
            </div>
          )}
          {maxReceiveValueMonth?.value > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">รับสูงสุด <b className="text-slate-700 dark:text-slate-200">{maxReceiveValueMonth.label}</b> {fmtBaht(maxReceiveValueMonth.value)}</span>
              <button type="button" onClick={onOpenReceive} className="text-sky-600 dark:text-sky-300 hover:underline font-semibold inline-flex items-center gap-0.5 shrink-0">ประวัติรับเข้า <ArrowRight size={13} /></button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── การ์ดแนะนำ 4 ข้อของผู้เบิก (ข้อตกลงข้อ 23) ──────
// แต่ละข้อมีปุ่มในการ์ดเอง (ไม่อ้าง "ปุ่มล่างจอ" — แถบล่างมีเฉพาะจอเล็ก)
// ปิดไม่ได้ (15/11/2569 — เดิม "ไม่ต้องแสดงอีก") เพราะเป็นทางเข้าเบิกยาออนไลน์หลักบนหน้าหลัก
export function OnboardingCard({ onNavigate }) {
  // ข้อ 1 = เบิกยาออนไลน์ (user สั่ง 15/11/2569 ย้ายจากปุ่มแยกเข้ามาในการ์ดนี้) · กดได้ทั้งแถว
  const tips = [
    { icon: Package,      text: 'สร้างใบเบิก ยา · น้ำเกลือ · ถุง/ขวด/ตลับ ส่งให้คลังยา',   label: 'เบิกยาออนไลน์', run: () => onNavigate('requisition') },
    { icon: Search,       text: 'พิมพ์ชื่อยา รหัส หรือ lot เพื่อดูคงเหลือและวันหมดอายุ', label: 'ค้นหายา',    run: openDrugSearch },
    { icon: RotateCcw,    text: 'แจ้งคืนยา หรือยาเสียหาย กลับคลัง',                       label: 'คืนยา',      run: () => onNavigate('return') },
    { icon: TrendingDown, text: 'ดูยาที่หน่วยงานของคุณเคยเบิก',                           label: 'ประวัติเบิก', run: () => onNavigate('dispense-mine') },
  ];
  return (
    <section className="mt-4 bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-900/60 rounded-2xl shadow-sm p-4">
      <div className="flex items-center gap-2">
        <span className="p-1.5 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 shrink-0"><Lightbulb size={16} /></span>
        <h3 className="flex-1 min-w-0 font-bold text-slate-800 dark:text-slate-100">เริ่มต้นใช้งาน</h3>
      </div>
      <ol className="mt-3 space-y-2">
        {tips.map((t, i) => {
          const Icon = t.icon;
          return (
            <li key={t.label}>
              <button type="button" onClick={t.run} aria-label={`${t.label} — ${t.text}`}
                className="w-full text-left flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-xl px-3 py-2.5 min-h-[44px] cursor-pointer transition-colors">
                <span className="w-6 h-6 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-sky-700 dark:text-sky-300"><Icon size={15} className="shrink-0" /> {t.label}</span>
                  <span className="block text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">{t.text}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-sky-500 dark:text-sky-400" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ── การ์ดตะกร้าเบิกที่ยังไม่ส่ง (requester — requisition_cart_draft · เห็นเฉพาะเจ้าของตะกร้า) ──────
// ผู้เบิกใส่ยาแล้วปิดแอป/เปลี่ยนเครื่อง → เตือนบนหน้าหลัก · "เบิกต่อ" เปิดหน้าตะกร้า · "ล้างตะกร้า" ลบ + audit clear_req_cart
const fmtDraftAt = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear() + 543} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function CartReminderCard({ auth, onContinue }) {
  const [draft, setDraft] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  const userId = auth?.id;
  useEffect(() => {
    let alive = true;
    if (userId) fetchCartDraft(userId).then(d => { if (alive) setDraft(d); });
    return () => { alive = false; };
  }, [userId]);
  if (!draft) return null;

  const items = draft.items || [];
  const typeLabel = reqTypeLabel(draft.req_type);
  const preview = items.slice(0, 3).map(i => i.name).filter(Boolean);
  const clear = async () => {
    setClearing(true); setError('');
    try {
      await deleteCartDraft(userId, { auth, itemCount: items.length });
      clearLocalCart();
      setDraft(null);
    } catch {
      setError('ล้างตะกร้าไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setClearing(false); setConfirm(false);
    }
  };
  return (
    <section className="mt-4 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/60 rounded-2xl shadow-sm p-4">
      <div className="flex items-start gap-3">
        <span className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-[#1E90FF] shrink-0"><ShoppingCart size={18} /></span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-800 dark:text-slate-100">มีตะกร้าเบิกที่ยังไม่ได้ส่ง</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            {typeLabel ? `ใบเบิก${typeLabel} · ` : ''}<b className="tabular-nums">{fmtNum(items.length)}</b> รายการ
          </p>
          {preview.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
              {preview.join(' · ')}{items.length > preview.length ? ` และอีก ${fmtNum(items.length - preview.length)} รายการ` : ''}
            </p>
          )}
          {draft.updated_at && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">แก้ไขล่าสุด {fmtDraftAt(draft.updated_at)}</p>}
          {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onContinue}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold bg-[#1E90FF] hover:bg-blue-600 text-white transition-colors">
          <ShoppingCart size={15} /> เบิกต่อ
        </button>
        <button type="button" onClick={() => setConfirm(true)} disabled={clearing}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
          <Trash2 size={15} /> ล้างตะกร้า
        </button>
      </div>
      <ConfirmModal
        open={confirm}
        title="ล้างตะกร้าเบิก?"
        message={`รายการในตะกร้า ${fmtNum(items.length)} รายการจะถูกลบ และยังไม่ได้ส่งเป็นใบเบิก`}
        confirmText="ล้างตะกร้า"
        cancelText="ยกเลิก"
        tone="danger"
        loading={clearing}
        onConfirm={clear}
        onClose={() => !clearing && setConfirm(false)}
      />
    </section>
  );
}

// ── แบนเนอร์ยาต้องคืนบริษัท (requester — ไม่มีคิว ไม่มี popup) ─────────────
export function SwapBanner({ count, onOpen }) {
  if (!count) return null;
  return (
    <button type="button" onClick={onOpen}
      className="mt-4 w-full flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl px-4 py-2.5 text-sm text-amber-800 dark:text-amber-200 text-left hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors">
      <AlertTriangle size={16} className="text-amber-500 shrink-0" />
      <span className="flex-1 min-w-0">มียาต้องคืนบริษัท <b className="tabular-nums">{fmtNum(count)}</b> lot ก่อนพ้นกำหนด</span>
      <span className="text-xs font-semibold shrink-0 inline-flex items-center gap-0.5">ดูรายการ <ChevronRight size={14} /></span>
    </button>
  );
}
