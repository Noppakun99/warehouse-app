// DrugProfileModal.jsx — บัตรยา (Phase 2a แผน Dashboard) · เปิดจากช่องค้นหาเดียว ทุกหน้า ทุก role
// "มีไหม เหลือเท่าไหร่ อยู่ไหน" ของยา 1 รหัส ณ ยอดนำเข้าล่าสุด — นิยาม CONTEXT.md §บัตรยา
// ตัวเลขทั้งหมดมาจาก buildDrugProfile (src/lib/drugProfile.js) ที่ใช้กฎเดียวกับโมดอลรายการยาในคลัง + Dashboard
// คอม = โมดอลกลางจอ · มือถือ = เต็มจอ
import React, { useState, useEffect } from 'react';
import {
  X, Pill, Database, MapPin, Layers, Hourglass, AlertTriangle, CircleCheck, PackageX, Ban, ScrollText,
  TrendingDown, Loader2, CalendarClock,
} from 'lucide-react';
import { fetchDrugProfile } from './lib/db';
import { parseExpDate } from './lib/drugProfile';

const fmtNum = (n) => (Number(n) || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const fmtThaiDate = (d) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}` : '-');
const fmtThaiDateTime = (iso) => (iso
  ? new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  : 'ไม่ทราบ');

// exp ของ lot อาจรวมหลายค่า (แถวซ้ำต่างรูปแบบ "01/03/2028, 1/3/2028") → แสดงวันที่ไม่ซ้ำ เป็น พ.ศ.
const expLabel = (raw) => {
  const parts = String(raw || '').split(',').map(s => s.trim()).filter(s => s && s !== '-');
  const out = [...new Set(parts.map(p => { const d = parseExpDate(p); return d ? fmtThaiDate(d) : p; }))];
  return out.join(', ') || 'ไม่ระบุ';
};

const CHIP = {
  red:     'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900',
  amber:   'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  slate:   'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
};

// สรุปสถานะ = ข้อความจากกฎตายตัว (CONTEXT §บัตรยา) — ไม่ใช่ความเห็น
function statusChips(p) {
  const out = [];
  if (p.total <= 0) out.push({ tone: 'red', icon: PackageX, text: 'ไม่มีของในคลัง' });
  // เกณฑ์ Dashboard รวม qty ดิบไม่แปลงหน่วย — ยาหลายขนาดบรรจุโชว์แค่ SS (ยอดดิบจะขัดกับยอดรวมตัวใหญ่)
  if (p.belowSS) out.push({
    tone: 'amber', icon: TrendingDown,
    text: p.ssUnit
      ? `ต่ำกว่า Safety Stock (คงเหลือ ${fmtNum(p.ssQty)} / SS ${fmtNum(p.ss)} ${p.ssUnit})`
      : `ต่ำกว่า Safety Stock (SS ${fmtNum(p.ss)})`,
  });
  if (p.expiredLots) out.push({ tone: 'red', icon: AlertTriangle, text: `หมดอายุค้างคลัง ${p.expiredLots} lot` });
  if (p.pendingLots) out.push({ tone: 'amber', icon: Hourglass, text: `รอตรวจรับ ${p.pendingLots} lot` });
  if (p.useFirst) out.push({
    tone: 'emerald', icon: CircleCheck,
    // lot '-' (เวชภัณฑ์ไม่มีเลข lot) บอก "lot -" ไม่มีความหมาย → ชี้ด้วยวันหมดอายุแทน
    text: p.useFirst.lot === '-'
      ? `ควรใช้ของที่หมดอายุ ${fmtThaiDate(p.useFirst.expDate)} ก่อน`
      : `ควรใช้ lot ${p.useFirst.lot} ก่อน (หมดอายุ ${fmtThaiDate(p.useFirst.expDate)})`,
  });
  if (p.discontinued) out.push({ tone: 'slate', icon: Ban, text: p.discontinuedQty > 0 ? `ตัดออกจากบัญชี (ค้าง ${fmtNum(p.discontinuedQty)})` : 'ตัดออกจากบัญชี' });
  else if (p.excludeStatus === 'สั่งเมื่อขอ') out.push({ tone: 'slate', icon: Ban, text: 'สั่งเมื่อขอ' });
  return out;
}

function LotRow({ l }) {
  let expTone = 'text-slate-500 dark:text-slate-400';
  let expNote = '';
  if (l.daysLeft != null) {
    if (l.daysLeft < 0) { expTone = 'text-red-600 dark:text-red-400 font-semibold'; expNote = `หมดอายุแล้ว ${fmtNum(-l.daysLeft)} วัน`; }
    else if (l.daysLeft <= 90) { expTone = 'text-amber-700 dark:text-amber-300 font-semibold'; expNote = `อีก ${fmtNum(l.daysLeft)} วัน`; }
    else expNote = `อีก ${fmtNum(l.daysLeft)} วัน`;
  }
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">lot {l.lot}</p>
          <p className={`text-xs mt-0.5 inline-flex items-center gap-1 ${expTone}`}>
            <CalendarClock size={12} className="shrink-0" /> หมดอายุ {expLabel(l.exp)}{expNote && ` · ${expNote}`}
          </p>
        </div>
        <p className="text-sm font-black tabular-nums text-slate-800 dark:text-slate-100 whitespace-nowrap">
          {fmtNum(l.qty)} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{l.unit}</span>
        </p>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1"><Layers size={12} className="shrink-0" /> โซน {l.zones.join(', ') || '-'}</span>
        <span className="inline-flex items-center gap-1"><MapPin size={12} className="shrink-0" /> ชั้น {l.locations.join(', ') || '-'}</span>
        {l.pending && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
            <Hourglass size={11} /> รอตรวจรับ{l.waitDays != null ? ` ${fmtNum(l.waitDays)} วัน` : ''}
          </span>
        )}
      </div>
    </li>
  );
}

export default function DrugProfileModal({ code, isStaff, onClose, onOpenStockCard }) {
  // ผลโหลดผูกกับรหัสที่ขอ — เปลี่ยนรหัส = ถือว่ายังไม่โหลด (ไม่โชว์บัตรของยาตัวก่อน)
  const [state, setState] = useState({ code: null, profile: null, error: '' });

  useEffect(() => {
    if (!code) return undefined;
    let alive = true;
    fetchDrugProfile(code)
      .then(profile => { if (alive) setState({ code, profile, error: '' }); })
      .catch(e => { if (alive) setState({ code, profile: null, error: e.message || 'โหลดไม่สำเร็จ' }); });
    return () => { alive = false; };
  }, [code]);

  useEffect(() => {
    if (!code) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [code, onClose]);

  if (!code) return null;
  const loading = state.code !== code;
  const p = loading ? null : state.profile;
  const chips = p ? statusChips(p) : [];
  const splitParts = p ? [
    ['พร้อมเบิก', p.split.ready],
    p.split.pending ? ['รอตรวจรับ', p.split.pending] : null,
    p.split.expired ? ['หมดอายุ', p.split.expired] : null,
  ].filter(Boolean) : [];

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={p ? `บัตรยา ${p.name}` : 'บัตรยา'}
        className="bg-white dark:bg-slate-900 w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[88vh] flex flex-col sm:rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}>
        {/* หัว */}
        <div className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-300 shrink-0"><Pill size={20} /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 leading-snug">{p?.name || (loading ? 'กำลังโหลด…' : 'บัตรยา')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">รหัส {code}{p?.type && p.type !== '-' ? ` · ${p.type}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> กำลังโหลดบัตรยา…</p>
          ) : state.error ? (
            <p className="m-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-600 dark:text-red-300">โหลดบัตรยาไม่สำเร็จ: {state.error}</p>
          ) : !p ? (
            <p className="py-16 text-center text-sm text-slate-400">ไม่พบรหัสยานี้ในคลัง</p>
          ) : (
            <>
              <div className="px-4 pt-4 space-y-3">
                {/* ความสดข้อมูล — บัตรยาไม่ใช่ยอดสด ต้องบอกเวลาเสมอ (CONTEXT §บัตรยา) */}
                <p className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Database size={13} className="shrink-0" /> ยอด ณ นำเข้า Excel ล่าสุด <b className="font-semibold text-slate-700 dark:text-slate-200">{fmtThaiDateTime(p.inventoryUpdatedAt)}</b>
                </p>

                {/* ยอดรวม */}
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">คงเหลือในบัญชี</p>
                  <p className="mt-0.5 text-2xl font-black tabular-nums text-slate-800 dark:text-slate-100">
                    {fmtNum(p.total)} <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{p.mainUnit}</span>
                  </p>
                  {p.total > 0 && (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {splitParts.map(([label, v], i) => (
                        <span key={label}>{i > 0 && ' · '}{label} <b className="tabular-nums">{fmtNum(v)}</b></span>
                      ))}
                    </p>
                  )}
                  {p.multiUnit && (
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">มีหลายขนาดบรรจุ — แปลงเป็น {p.mainUnit} ก่อนรวม</p>
                  )}
                </div>

                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {chips.map(c => (
                      <span key={c.text} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${CHIP[c.tone]}`}>
                        <c.icon size={12} className="shrink-0" /> {c.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ราย lot */}
              <div className="mt-4 border-t border-slate-100 dark:border-slate-800">
                <p className="px-4 pt-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  ราย lot ({p.lots.length}) — เรียงตามวันหมดอายุ
                </p>
                {p.lots.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-400">ไม่มี lot ที่มีของ</p>
                ) : (
                  <ul className="divide-y divide-slate-50 dark:divide-slate-800">
                    {p.lots.map(l => <LotRow key={l.key} l={l} />)}
                  </ul>
                )}
                {p.zeroLots > 0 && (
                  <p className="px-4 pb-3 text-[11px] text-slate-400 dark:text-slate-500">ไม่แสดง {p.zeroLots} lot ที่คงเหลือ 0</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-800">
          <button type="button" onClick={onClose} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:border-slate-400 text-slate-700 dark:text-slate-200 rounded-xl py-2 px-4 font-medium text-sm transition-colors">ปิด</button>
          {isStaff && p && (
            <button type="button" onClick={() => onOpenStockCard?.(p.code, p.name)}
              className="inline-flex items-center gap-1.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl py-2 px-4 font-semibold text-sm shadow-sm">
              <ScrollText size={15} /> เปิดการ์ดคลัง lot
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
