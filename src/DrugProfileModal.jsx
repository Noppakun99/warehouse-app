// DrugProfileModal.jsx — บัตรยา (Phase 2a+2b แผน Dashboard) · เปิดจากช่องค้นหาเดียว ทุกหน้า ทุก role
// "มีไหม เหลือเท่าไหร่ อยู่ไหน มาจากบิลไหน ใช้หมดเมื่อไหร่" ของยา 1 รหัส ณ ยอดนำเข้าล่าสุด — นิยาม CONTEXT.md §บัตรยา
// ผู้เบิกเห็นประวัติเบิกเฉพาะหน่วยงานตัวเอง · ประวัติรับทั้งหมด + การ์ดคลัง lot เฉพาะ staff/admin
// ตัวเลขทั้งหมดมาจาก buildDrugProfile (src/lib/drugProfile.js) ที่ใช้กฎเดียวกับโมดอลรายการยาในคลัง + Dashboard
// คอม = โมดอลกลางจอ · มือถือ = เต็มจอ
import React, { useState, useEffect } from 'react';
import {
  X, Pill, Database, MapPin, Layers, Hourglass, AlertTriangle, CircleCheck, PackageX, Ban, ScrollText,
  TrendingDown, Loader2, CalendarClock, Receipt, ChevronDown, Activity, History, Truck,
} from 'lucide-react';
import { fetchDrugProfile } from './lib/db';
import { parseExpDate } from './lib/drugProfile';

const fmtNum = (n) => (Number(n) || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const fmtThaiDate = (d) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}` : '-');
const fmtThaiDateTime = (iso) => (iso
  ? new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  : 'ไม่ทราบ');

// วันที่ ISO (YYYY-MM-DD) → DD/MM/YYYY พ.ศ. (อ่านตรงจากสตริง ไม่ผ่าน Date — กันเลื่อนวันจาก UTC)
const fmtIsoTh = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${Number(m[1]) + 543}` : '-';
};
const fmtMoney = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isPurchase = (t) => !t || t === 'การซื้อ';

// ตารางย่อยในบัตร: จอ ≥ sm = ตาราง · จอเล็ก = การ์ด ป้าย:ค่า (Rule #5 — pattern เดียวกับโมดอลรายการของคิว)
function MiniTable({ cols, rows, rowKey }) {
  return (
    <>
      <table className="hidden sm:table w-full text-xs">
        <thead>
          <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {cols.map(c => <th key={c.label} className={`px-2 py-1.5 whitespace-nowrap ${c.num ? 'text-right' : ''}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} className="align-top">
              {cols.map(c => (
                <td key={c.label} className={`px-2 py-1.5 ${c.num ? 'text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'} ${c.nowrap ? 'whitespace-nowrap' : ''}`}>{c.cell(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((r, i) => (
          <li key={rowKey(r, i)} className="py-2">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
              {cols.map(c => (
                <div key={c.label} className="flex gap-1.5 min-w-0">
                  <dt className="text-slate-400 dark:text-slate-500 shrink-0">{c.label}</dt>
                  <dd className={`text-slate-700 dark:text-slate-200 min-w-0 break-words ${c.num ? 'font-semibold tabular-nums' : ''}`}>{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

const priceText = (b) => (b.price > 0 ? `${fmtMoney(b.price)} บาท/${b.unit}` : (isPurchase(b.purchaseType) ? 'ราคา 0' : b.purchaseType));

// บิลของ lot (CONTEXT §บัตรยา): ไม่มีบิล = บอกตรงๆ ห้ามยืมบิลอื่น · 1 บิล = บรรทัดเดียว · หลายบิล = กางรายบิล ไม่เฉลี่ยราคา
function LotBills({ l }) {
  const [open, setOpen] = useState(false);
  const bills = l.bills || [];
  if (!bills.length) {
    return <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500 inline-flex items-center gap-1"><Receipt size={12} className="shrink-0" /> ไม่มีบิลในประวัติรับ</p>;
  }
  if (bills.length === 1) {
    const b = bills[0];
    return (
      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 inline-flex items-start gap-1">
        <Receipt size={12} className="shrink-0 mt-0.5" />
        <span>บิล {b.billNumber} · {b.supplier} · {priceText(b)} · รับ {fmtIsoTh(b.receiveDate)}</span>
      </p>
    );
  }
  const pr = l.priceRange;
  const rangeText = pr ? (pr.min === pr.max ? `${fmtMoney(pr.min)} บาท/${pr.unit}` : `${fmtMoney(pr.min)}–${fmtMoney(pr.max)} บาท/${pr.unit}`) : 'คนละหน่วย กางดูรายบิล';
  return (
    <div className="mt-1.5">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="text-xs text-sky-700 dark:text-sky-300 font-semibold inline-flex items-center gap-1 hover:underline">
        <Receipt size={12} className="shrink-0" /> {bills.length} บิล · {rangeText}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-2 py-1">
          <MiniTable
            rowKey={(b) => b.key}
            rows={bills}
            cols={[
              { label: 'เลขที่บิล', cell: b => b.billNumber, nowrap: true },
              { label: 'วันรับ', cell: b => fmtIsoTh(b.receiveDate), nowrap: true },
              { label: 'บริษัท', cell: b => b.supplier },
              { label: 'ราคา', cell: b => priceText(b), nowrap: true },
              { label: 'รับเข้า', cell: b => fmtNum(b.qtyReceived), num: true },
              { label: 'หน่วย', cell: b => b.unit, nowrap: true },
              { label: 'คงเหลือ', cell: b => (b.remaining == null ? '—' : fmtNum(b.remaining)), num: true },
            ]}
          />
          <p className="px-2 pb-1 text-[11px] text-slate-400 dark:text-slate-500">
            คงเหลือรายบิลรู้ได้เฉพาะแถวคงคลังที่ระบุเลขบิล{l.unassignedQty > 0 ? ` · ไม่ระบุบิล ${fmtNum(l.unassignedQty)} ${l.unit}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

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
      <LotBills l={l} />
    </li>
  );
}

export default function DrugProfileModal({ code, isStaff, department = null, onClose, onOpenStockCard }) {
  // ผลโหลดผูกกับรหัสที่ขอ — เปลี่ยนรหัส = ถือว่ายังไม่โหลด (ไม่โชว์บัตรของยาตัวก่อน)
  const [state, setState] = useState({ code: null, profile: null, error: '' });

  useEffect(() => {
    if (!code) return undefined;
    let alive = true;
    // ผู้เบิก → ประวัติเบิกเฉพาะหน่วยงานตัวเอง · staff (department null) → ทุกหน่วยงาน
    fetchDrugProfile(code, { department: isStaff ? null : department })
      .then(profile => { if (alive) setState({ code, profile, error: '' }); })
      .catch(e => { if (alive) setState({ code, profile: null, error: e.message || 'โหลดไม่สำเร็จ' }); });
    return () => { alive = false; };
  }, [code, isStaff, department]);

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

                {/* เรท = กฎหน้าวิเคราะห์สั่งซื้อ (4 เดือนที่ปิดงวด) เขียนช่วงเดือนกำกับเสมอ (CONTEXT §เรท) */}
                {p.rate && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold inline-flex items-center gap-1"><Activity size={12} /> เรทการใช้เฉลี่ย</p>
                      <p className="mt-0.5 text-sm font-black tabular-nums text-slate-800 dark:text-slate-100">
                        {p.rate.avgMonth > 0 ? <>{fmtNum(p.rate.avgMonth)} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{p.rate.unit}/เดือน</span></> : <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">ไม่มีการเบิกในช่วงนี้</span>}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">เฉลี่ย {p.rate.monthLabel} ({p.rate.months.length} เดือนที่ปิดงวดแล้ว)</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold inline-flex items-center gap-1"><CalendarClock size={12} /> คงอยู่ได้อีก</p>
                      <p className="mt-0.5 text-sm font-black text-slate-800 dark:text-slate-100">{p.rate.coverage === '∞' ? 'ไม่มีการใช้ในช่วงนี้' : p.rate.coverage}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">คงเหลือ ÷ เรท (สูตรหน้าวิเคราะห์สั่งซื้อ)</p>
                    </div>
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

              {/* ประวัติเบิก — ผู้เบิกเห็นเฉพาะหน่วยงานตัวเอง (CONTEXT §บัตรยา) */}
              <section className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 inline-flex items-center gap-1">
                  <History size={12} /> ประวัติเบิก{p.dispenseHistory.department ? ` — ${p.dispenseHistory.department}` : ' — ทุกหน่วยงาน'}
                  {p.dispenseHistory.total > p.dispenseHistory.rows.length && <span className="normal-case tracking-normal font-semibold"> (ล่าสุด {p.dispenseHistory.rows.length} จาก {fmtNum(p.dispenseHistory.total)} ครั้ง)</span>}
                </p>
                {p.dispenseHistory.rows.length === 0 ? (
                  <p className="py-2 text-sm text-slate-400 dark:text-slate-500">{p.dispenseHistory.department ? 'หน่วยงานนี้ยังไม่เคยเบิกยานี้' : 'ยังไม่มีประวัติเบิก'}</p>
                ) : (
                  <MiniTable
                    rowKey={(r, i) => `${r.date}|${r.department}|${r.lot}|${i}`}
                    rows={p.dispenseHistory.rows}
                    cols={[
                      { label: 'วันที่', cell: r => fmtIsoTh(r.date), nowrap: true },
                      ...(p.dispenseHistory.department ? [] : [{ label: 'หน่วยงาน', cell: r => r.department }]),
                      { label: 'Lot', cell: r => r.lot },
                      { label: 'จำนวน', cell: r => fmtNum(r.qty), num: true },
                      { label: 'หน่วย', cell: r => r.unit, nowrap: true },
                      { label: 'ชนิดรายการ', cell: r => r.itemType || '-' },
                    ]}
                  />
                )}
              </section>

              {/* ประวัติรับ — staff/admin เท่านั้น */}
              {isStaff && (
                <section className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 inline-flex items-center gap-1">
                    <Truck size={12} /> ประวัติรับ{p.lastReceiveDate ? <span className="normal-case tracking-normal font-semibold"> · รับล่าสุด {fmtIsoTh(p.lastReceiveDate)}</span> : ''}
                  </p>
                  {p.receiveHistory.length === 0 ? (
                    <p className="py-2 text-sm text-slate-400 dark:text-slate-500">ยังไม่มีประวัติรับในระบบ</p>
                  ) : (
                    <MiniTable
                      rowKey={(r, i) => `${r.billNumber}|${r.date}|${r.lot}|${i}`}
                      rows={p.receiveHistory}
                      cols={[
                        { label: 'วันรับ', cell: r => fmtIsoTh(r.date), nowrap: true },
                        { label: 'เลขที่บิล', cell: r => r.billNumber, nowrap: true },
                        { label: 'บริษัท', cell: r => r.supplier },
                        { label: 'Lot', cell: r => r.lot },
                        { label: 'จำนวน', cell: r => fmtNum(r.qty), num: true },
                        { label: 'หน่วย', cell: r => r.unit, nowrap: true },
                        { label: 'ราคา/หน่วย', cell: r => (r.price > 0 ? fmtMoney(r.price) : (isPurchase(r.purchaseType) ? '0' : r.purchaseType)), num: true },
                      ]}
                    />
                  )}
                </section>
              )}
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
