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
  TrendingUp, TrendingDown, ChevronDown, CalendarDays, Database, Hourglass, Search, RotateCcw, Lightbulb,
} from 'lucide-react';
import { SWAP_ACTION_STATUS } from './lib/db';
import { openDrugSearch } from './lib/drugSearchEvent';
import { isSwapRed } from './lib/workQueue';
import { parseExpDate } from './lib/drugProfile';

// ── สี/ไอคอนต่อรายการในคิว ────────────────────────────────────────────
const SEVERITY = {
  red:   { chip: 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-300',     pill: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300' },
  amber: { chip: 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-300', pill: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300' },
  slate: { chip: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300', pill: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
};
const QUEUE_ICON = {
  expired: AlertTriangle, swap: Undo2, outOfStock: PackageX, pendingReceive: Hourglass,
  nearExpiry: CalendarClock, loanOverdue: ArrowLeftRight, annualCount: ListChecks, lineQuota: MessageSquareWarning,
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
      <span className="flex-1 min-w-0 truncate text-sm sm:text-base text-slate-400 dark:text-slate-500">ค้นหายา — ชื่อ, รหัส หรือ lot</span>
      <kbd className="hidden sm:inline text-[11px] font-sans font-semibold px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">Ctrl K</kbd>
    </button>
  );
}

// ── คิวงานวันนี้ ─────────────────────────────────────────────────────
export function WorkQueuePanel({ items = [], loading = false, onOpen }) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-300"><ClipboardCheck size={15} /></div>
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">คิวงานวันนี้</h3>
        </div>
        {!loading && <span className="text-xs text-slate-400 dark:text-slate-500">{items.length > 0 ? `${items.length} เรื่องค้าง` : ''}</span>}
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
        <ul className="divide-y divide-slate-50 dark:divide-slate-800">
          {items.map(it => {
            const Icon = QUEUE_ICON[it.key] || AlertTriangle;
            const sev = SEVERITY[it.severity] || SEVERITY.slate;
            const pct = it.progress?.total ? Math.round((it.progress.counted / it.progress.total) * 100) : null;
            return (
              <li key={it.key}>
                <button type="button" onClick={() => onOpen?.(it)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
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
  unit:     { label: 'หน่วย',    cell: r => dash(r.unit), nowrap: true },
};
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
};

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
        badge: d == null ? '-' : d < 0 ? `เลยเส้นตาย ${fmtNum(-d)} วัน` : `เหลือ ${fmtNum(d)} วัน`, tone: isSwapRed(r) ? 'red' : 'amber' };
    }
    case 'outOfStock':
      return { name, code, badge: 'หมด', tone: 'red' };
    case 'pendingReceive':
      return { name, code, badge: r.waitDays == null ? 'ไม่ทราบวันรับ' : `รอ ${fmtNum(r.waitDays)} วัน`, tone: 'amber' };
    case 'loanOverdue':
      return { name, code, badge: `ค้าง ${fmtNum(r.overdueDays)} วัน`, tone: 'red' };
    default:
      return { name, code, badge: '', tone: 'slate' };
  }
}

function QueueBadge({ head }) {
  if (!head.badge) return null;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums whitespace-nowrap ${(SEVERITY[head.tone] || SEVERITY.slate).pill}`}>{head.badge}</span>;
}

function DrugCell({ head }) {
  return (
    <>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">{head.name}</p>
      {head.code && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">รหัส {head.code}</p>}
      {head.note && <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">{head.note}</p>}
    </>
  );
}

export function QueueDetailModal({ item, onClose, manage }) {
  useEffect(() => {
    if (!item) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);
  if (!item) return null;
  const cols = QUEUE_COLUMNS[item.key] || [];
  const rowKey = (r, i) => r.id ?? `${r.code}|${r.lot}|${i}`;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={item.label}
        className="bg-white dark:bg-slate-900 w-full sm:max-w-5xl max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{item.label} <span className="tabular-nums text-slate-400 dark:text-slate-500 font-semibold">({fmtNum(item.rows.length)})</span></h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.note}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* จอ ≥ sm: ตาราง */}
          <table className="hidden sm:table w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-4 py-2">ยา</th>
                {cols.map(c => <th key={c.label} className={`px-3 py-2 whitespace-nowrap ${c.num ? 'text-right' : ''}`}>{c.label}</th>)}
                <th className="px-4 py-2 text-right">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {item.rows.map((r, i) => {
                const head = rowHead(item.key, r);
                return (
                  <tr key={rowKey(r, i)} className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 min-w-[12rem]"><DrugCell head={head} /></td>
                    {cols.map(c => (
                      <td key={c.label} className={`px-3 py-2.5 ${c.num ? 'text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'} ${c.nowrap ? 'whitespace-nowrap' : ''} ${c.wide ? 'min-w-[10rem]' : ''}`}>{c.cell(r)}</td>
                    ))}
                    <td className="px-4 py-2.5 text-right"><QueueBadge head={head} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* จอเล็ก: การ์ด — คอลัมน์ชุดเดียวกันเป็น ป้าย : ค่า */}
          <ul className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {item.rows.map((r, i) => {
              const head = rowHead(item.key, r);
              return (
                <li key={rowKey(r, i)} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><DrugCell head={head} /></div>
                    <div className="shrink-0"><QueueBadge head={head} /></div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {cols.map(c => (
                      <div key={c.label} className="flex gap-1.5 min-w-0">
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
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-800">
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

// ── คอลัมน์ภาพรวม: 3 ตัวเลข + ยาต้องสั่งซื้อ 5 อันดับ ─────────────────────
export function OverviewPanel({ alerts, wide = false, canReorder = false, onOpenStock, onOpenExpiry, onOpenLowStock, onOpenReorder }) {
  // drugCount คำนวณใน fetchDashboardAlerts ด้วยกฎเดียวกับ fetchStockSummary (โมดอลที่การ์ดนี้เปิด) — Rule #6
  const drugCount = alerts?.drugCount ?? null;
  const expiring = alerts?.expiring || [];
  const lowStock = alerts?.lowStock || [];
  const tiles = [
    { key: 'stock', label: 'รายการยาในคลัง', value: drugCount, icon: Boxes, tone: 'text-sky-700 dark:text-sky-300', chip: 'bg-sky-100 dark:bg-sky-950/60 text-sky-600', onClick: onOpenStock },
    { key: 'expiry', label: 'ใกล้หมดอายุใน 16 เดือน', value: expiring.length, icon: CalendarClock, tone: 'text-orange-700 dark:text-orange-300', chip: 'bg-orange-100 dark:bg-orange-950/60 text-orange-600', onClick: expiring.length ? onOpenExpiry : undefined },
    { key: 'low', label: 'ต่ำกว่า Safety Stock', value: lowStock.length, icon: ShoppingCart, tone: 'text-amber-700 dark:text-amber-300', chip: 'bg-amber-100 dark:bg-amber-950/60 text-amber-600', onClick: lowStock.length ? onOpenLowStock : undefined },
  ];
  const top5 = lowStock.slice(0, 5);

  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${wide ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-3 lg:grid-cols-1'}`}>
        {tiles.map(t => {
          const Icon = t.icon;
          const body = (
            <>
              <span className={`p-2 rounded-xl shrink-0 ${t.chip}`}><Icon size={16} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs text-slate-500 dark:text-slate-400">{t.label}</span>
                <span className={`block text-xl font-bold tabular-nums ${t.tone}`}>{t.value == null ? '–' : fmtNum(t.value)}</span>
              </span>
              {t.onClick && <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />}
            </>
          );
          const cls = 'w-full flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-3 shadow-sm text-left';
          return t.onClick
            ? <button key={t.key} type="button" onClick={t.onClick} className={`${cls} hover:shadow-md transition-shadow`}>{body}</button>
            : <div key={t.key} className={cls}>{body}</div>;
        })}
      </div>

      {top5.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">ยาต้องสั่งซื้อ 5 อันดับแรก</h3>
            {canReorder && (
              <button type="button" onClick={onOpenReorder} className="text-xs text-sky-600 dark:text-sky-300 hover:underline font-semibold inline-flex items-center gap-0.5">
                ดูทั้งหมด <ArrowRight size={13} />
              </button>
            )}
          </div>
          <ul className="divide-y divide-slate-50 dark:divide-slate-800">
            {top5.map((r, i) => (
              <li key={r.code || i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-tight truncate">{r.name || r.code}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    คงเหลือ <span className="font-bold text-red-600 dark:text-red-400">{fmtNum(r.qty)}</span> / SS {fmtNum(r.safety_stock)}{r.unit ? ` ${r.unit}` : ''}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-xs font-bold tabular-nums shrink-0">{Math.round((r.ratio || 0) * 100)}%</span>
              </li>
            ))}
          </ul>
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

// ── การ์ดแนะนำ 3 ข้อของผู้เบิก (ข้อตกลงข้อ 23) — ปิดได้ จำในเบราว์เซอร์ต่อบัญชี ──────
// แต่ละข้อมีปุ่มในการ์ดเอง (ไม่อ้าง "ปุ่มล่างจอ" — แถบล่างมีเฉพาะจอเล็ก) · เครื่องของหน่วยงานอาจใช้ร่วมหลายบัญชี → key ต่อ user
const onboardKey = (userId) => `onboard_dismissed_${userId}`;
export function OnboardingCard({ userId, onNavigate }) {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(onboardKey(userId)) === '1'; } catch { return false; }
  });
  if (hidden) return null;
  const dismiss = () => {
    try { localStorage.setItem(onboardKey(userId), '1'); } catch { /* localStorage ปิด — ปิดได้แค่รอบนี้ */ }
    setHidden(true);
  };
  const tips = [
    { icon: Search,       text: 'พิมพ์ชื่อยา รหัส หรือ lot เพื่อดูคงเหลือและวันหมดอายุ', label: 'ค้นหายา',    run: openDrugSearch },
    { icon: RotateCcw,    text: 'แจ้งคืนยา หรือยาเสียหาย กลับคลัง',                       label: 'คืนยา',      run: () => onNavigate('return') },
    { icon: TrendingDown, text: 'ดูยาที่หน่วยงานของคุณเคยเบิก',                           label: 'ประวัติเบิก', run: () => onNavigate('dispense-mine') },
  ];
  return (
    <section className="mt-4 bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-900/60 rounded-2xl shadow-sm p-4">
      <div className="flex items-center gap-2">
        <span className="p-1.5 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 shrink-0"><Lightbulb size={16} /></span>
        <h3 className="flex-1 min-w-0 font-bold text-slate-800 dark:text-slate-100">เริ่มต้นใช้งาน</h3>
        <button type="button" onClick={dismiss}
          className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <X size={14} /> ไม่ต้องแสดงอีก
        </button>
      </div>
      <ol className="mt-3 space-y-2">
        {tips.map((t, i) => {
          const Icon = t.icon;
          return (
            <li key={t.label} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2.5">
              <span className="w-6 h-6 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200">{t.text}</span>
              <button type="button" onClick={t.run}
                className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors">
                <Icon size={14} /> {t.label}
              </button>
            </li>
          );
        })}
      </ol>
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
