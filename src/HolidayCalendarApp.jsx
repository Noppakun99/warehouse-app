import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CalendarDays, Plus, RefreshCcw, Trash2, Pencil, X, AlertTriangle,
  CheckCircle2, MessageSquare, Gauge,
} from 'lucide-react';
import BackButton from './BackButton';
import {
  fetchPublicHolidays, upsertPublicHoliday, deletePublicHoliday, fetchLineQuota,
} from './lib/db';
import {
  announcementFor, buildAnnouncementText, addDays, toYmd, formatThaiDate,
} from '../supabase/functions/_shared/announceSchedule.js';

// ปฏิทินวันหยุดราชการ — แหล่งความจริงของ "วันทำการ" ที่บอทประกาศรอบเบิก-รับ ใช้ตัดสิน
// ดู CONTEXT.md §"รอบเบิก-รับ (Requisition–Pickup Cycle)"

const thaiYear = (y) => Number(y) + 543;

// วันที่ input type=date เก็บ ISO — overlay แสดง DD/MM/YYYY (พ.ศ.) ตาม Critical Rule #14
// onClick + showPicker แบบ guarded ตาม Rule #3 (ห้าม bare showPicker — mobile บล็อก)
function IsoDateInput({ value, onChange, className = '' }) {
  const display = iso => { if (!iso) return null; const [y, m, d] = iso.split('-'); return `${d}/${m}/${Number(y) + 543}` };
  return (
    <div className={`relative flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus-within:ring-2 focus-within:ring-sky-400 ${className}`}>
      <span className={`px-3 py-1.5 text-sm w-full select-none pointer-events-none ${value ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>{display(value) || 'dd/mm/yyyy'}</span>
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
        onClick={e => { try { e.currentTarget.showPicker?.() } catch { /* noop */ } }}
        className="absolute inset-0 opacity-0 w-full cursor-pointer" />
    </div>
  );
}

function HolidayForm({ initial, onSave, onCancel, saving }) {
  const [date, setDate] = useState(initial?.holiday_date || '');
  const [name, setName] = useState(initial?.name || '');
  const [observed, setObserved] = useState(!!initial?.is_observed);
  const isEdit = !!initial;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 dark:text-slate-100">{isEdit ? 'แก้ไขวันหยุด' : 'เพิ่มวันหยุด'}</h3>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">วันที่</label>
          <IsoDateInput value={date} onChange={setDate} className={isEdit ? 'opacity-60 pointer-events-none' : ''} />
          {isEdit && <p className="text-[11px] text-slate-400 dark:text-slate-500">แก้วันที่ไม่ได้ — ลบแล้วเพิ่มใหม่</p>}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">ชื่อวันหยุด</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="เช่น วันสงกรานต์"
            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-sky-400 outline-none" />
          <p className="text-[11px] text-slate-400 dark:text-slate-500">ชื่อนี้จะถูกใช้เป็นเหตุผลในข้อความประกาศ</p>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={observed} onChange={e => setObserved(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-600" />
          เป็นวันหยุดชดเชย
        </label>

        <div className="flex gap-2 pt-1">
          <button onClick={onCancel}
            className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
            ยกเลิก
          </button>
          <button onClick={() => onSave({ holiday_date: date, name, is_observed: observed })}
            disabled={saving || !date || !name.trim()}
            className="flex-1 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * โควตา LINE คงเหลือของบอททั้ง 2 ตัว
 *
 * โหลดเมื่อกดเท่านั้น (ไม่ auto-load ตอนเปิดหน้า) เพราะเรียก LINE API จริงทุกครั้ง
 * และคนดูแลไม่ได้ต้องการตัวเลขนี้ทุกครั้งที่เข้าหน้าปฏิทิน
 */
function LineQuotaPanel() {
  const [bots, setBots] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [at, setAt] = useState(null);

  const load = async () => {
    setLoading(true); setErr('');
    try {
      setBots(await fetchLineQuota());
      setAt(new Date());
    } catch (e) {
      setErr(e.message || 'อ่านโควตาไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Gauge size={16} className="text-sky-600" />
        <h2 className="font-bold text-slate-800 dark:text-slate-100">โควตาแจ้งเตือน LINE</h2>
        <button onClick={load} disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-[#1E90FF] text-white hover:bg-blue-600 disabled:opacity-50">
          <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'กำลังตรวจ...' : bots ? 'ตรวจอีกครั้ง' : 'ตรวจโควตาคงเหลือ'}
        </button>
      </div>
      <p className="text-[13px] text-slate-500 dark:text-slate-400">
        ส่งเข้ากลุ่มนับ &quot;รายหัว&quot; — กลุ่ม 10 คน ส่ง 1 ครั้ง หัก 10 ข้อความ · โควตารีเซ็ตต้นเดือน
      </p>

      {err && (
        <div className="flex items-start gap-2 text-[13px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{err}</span>
        </div>
      )}

      {bots?.map(b => (
        <div key={b.key} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{b.label}</span>
            {!b.configured && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">ยังไม่ได้ตั้งค่า</span>
            )}
            {b.sendsLeft != null && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                b.sendsLeft <= 2
                  ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-900/60'
                  : b.sendsLeft <= 5
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-900/60'
                    : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-900/60'
              }`}>
                ส่งได้อีก {b.sendsLeft.toLocaleString()} ครั้ง
              </span>
            )}
          </div>
          {b.error && <p className="text-[13px] text-rose-600 dark:text-rose-400 mt-1">{b.error}</p>}
          {b.configured && !b.error && (
            <div className="text-[13px] text-slate-600 dark:text-slate-300 mt-1.5 space-y-0.5">
              {b.limit == null
                ? <p>แพ็กเกจไม่จำกัดจำนวนข้อความ (ใช้ไป {b.used?.toLocaleString()})</p>
                : <p>ใช้ไป <span className="font-semibold text-slate-800 dark:text-slate-100">{b.used?.toLocaleString()} / {b.limit?.toLocaleString()}</span> ข้อความ · เหลือ {b.remain?.toLocaleString()}</p>}
              <p>สมาชิกในกลุ่ม: {b.members == null ? 'อ่านไม่ได้ (บอทอาจยังไม่อยู่ในกลุ่ม)' : `${b.members} คน`}</p>
            </div>
          )}
        </div>
      ))}

      {at && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          ข้อมูล ณ {at.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
        </p>
      )}
    </div>
  );
}

export default function HolidayCalendarApp({ auth, onGoBack, canGoBack, onRefresh }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [formOpen, setFormOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try { setRows(await fetchPublicHolidays()); }
    catch (e) { setErr(e.message || 'โหลดข้อมูลไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const holidayMap = useMemo(() => new Map(rows.map(r => [r.holiday_date, r.name])), [rows]);
  const byYear = useMemo(() => {
    const m = {};
    for (const r of rows) { const y = Number(String(r.holiday_date).slice(0, 4)); m[y] = (m[y] || 0) + 1; }
    return m;
  }, [rows]);

  const yearRows = useMemo(
    () => rows.filter(r => String(r.holiday_date).startsWith(String(year))),
    [rows, year],
  );

  const thisYear = new Date().getFullYear();
  const years = useMemo(() => {
    const set = new Set([thisYear, thisYear + 1, ...Object.keys(byYear).map(Number)]);
    return [...set].sort();
  }, [byYear, thisYear]);

  // ปฏิทินว่าง = ระบบจะประกาศทับวันหยุด ไม่ใช่แค่ "ไม่มีข้อมูล" — ต้องเตือนให้ชัด
  const nextYearEmpty = !byYear[thisYear + 1];

  // ตัวอย่างประกาศ 4 สัปดาห์ข้างหน้า — วิธีเดียวที่ admin ตรวจได้ว่ากรอกวันหยุดแล้วผลถูกต้อง ก่อนของจริงยิง
  const preview = useMemo(() => {
    const out = [];
    const start = toYmd(new Date());
    for (let i = 0; i < 28; i++) {
      const d = addDays(start, i);
      const info = announcementFor(d, holidayMap);
      if (info.send) out.push({ date: d, info, text: buildAnnouncementText(info) });
    }
    return out;
  }, [holidayMap]);

  const save = async (payload) => {
    setSaving(true); setErr('');
    try {
      await upsertPublicHoliday(payload, auth);
      setFormOpen(false); setEditRow(null);
      await load();
    } catch (e) { setErr(e.message || 'บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  const remove = async (row) => {
    if (!window.confirm(`ลบ "${row.name}" (${formatThaiDate(row.holiday_date)}) ?`)) return;
    setErr('');
    try { await deletePublicHoliday(row.holiday_date, auth); await load(); }
    catch (e) { setErr(e.message || 'ลบไม่สำเร็จ'); }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3 sticky top-0 z-30">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
            <CalendarDays size={20} className="text-sky-600 shrink-0" />
            <button onClick={onRefresh} className="text-left min-w-0">
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">ปฏิทินวันหยุดราชการ</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">ใช้เลื่อนรอบเบิก-รับ และงดประกาศในวันหยุด</p>
            </button>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={load} title="โหลดใหม่"
              className="p-2 rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
              <RefreshCcw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => { setEditRow(null); setFormOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-medium">
              <Plus size={15} /> เพิ่มวันหยุด
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {err && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-300 rounded-xl px-4 py-3 text-sm">{err}</div>
        )}

        {nextYearEmpty && (
          <div className="bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/60 rounded-xl px-4 py-3 flex items-start gap-3">
            <AlertTriangle size={18} className="text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
            <div className="text-sm text-orange-800 dark:text-orange-200">
              <p className="font-semibold">ยังไม่ได้กรอกวันหยุดปี {thaiYear(thisYear + 1)}</p>
              <p className="text-[13px] mt-0.5 text-orange-700 dark:text-orange-300">
                ถ้าไม่กรอก ระบบจะถือว่าปีหน้าไม่มีวันหยุดเลย และจะประกาศทับวันหยุดจริง — กรอกตามประกาศ ครม. (ปกติออกช่วง ธ.ค.)
              </p>
            </div>
          </div>
        )}

        {/* ตัวเลือกปี */}
        <div className="flex items-center gap-2 flex-wrap">
          {years.map(y => (
            <button key={y} onClick={() => setYear(y)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                y === year
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}>
              {thaiYear(y)} <span className="opacity-70">({byYear[y] || 0})</span>
            </button>
          ))}
        </div>

        {/* ตารางวันหยุด — desktop */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">วันที่</th>
                  <th className="text-left px-4 py-2.5 font-medium">ชื่อวันหยุด</th>
                  <th className="text-left px-4 py-2.5 font-medium">ประเภท</th>
                  <th className="text-right px-4 py-2.5 font-medium">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {yearRows.map(r => (
                  <tr key={r.holiday_date} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <td className="px-4 py-2.5 text-slate-800 dark:text-slate-100 whitespace-nowrap">{formatThaiDate(r.holiday_date)}</td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.name}</td>
                    <td className="px-4 py-2.5">
                      {r.is_observed
                        ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-900/60">ชดเชย</span>
                        : <span className="text-[11px] text-slate-400 dark:text-slate-500">-</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => { setEditRow(r); setFormOpen(true); }} title="แก้ไข"
                        className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil size={15} /></button>
                      <button onClick={() => remove(r)} title="ลบ"
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
                {!yearRows.length && !loading && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">ยังไม่มีวันหยุดในปี {thaiYear(year)}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* mobile card list (Critical Rule #5) */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {yearRows.map(r => (
              <div key={r.holiday_date} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{formatThaiDate(r.holiday_date)}</p>
                  <p className="text-[13px] text-slate-600 dark:text-slate-400">{r.name}</p>
                  {r.is_observed && <span className="inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-900/60">ชดเชย</span>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { setEditRow(r); setFormOpen(true); }}
                    className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil size={15} /></button>
                  <button onClick={() => remove(r)}
                    className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
            {!yearRows.length && !loading && (
              <div className="px-4 py-8 text-center text-slate-400 dark:text-slate-500 text-sm">ยังไม่มีวันหยุดในปี {thaiYear(year)}</div>
            )}
          </div>
        </div>

        {/* โควตา LINE คงเหลือ — ถามสดตอนกด ไม่โหลดอัตโนมัติ (เรียก LINE API ทุกครั้ง) */}
        <LineQuotaPanel />

        {/* ตัวอย่างประกาศ 4 สัปดาห์ข้างหน้า */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-sky-600" />
            <h2 className="font-bold text-slate-800 dark:text-slate-100">ตัวอย่างประกาศ 4 สัปดาห์ข้างหน้า</h2>
          </div>
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            ข้อความจริงที่บอทจะส่งเข้ากลุ่ม LINE ตามปฏิทินด้านบน — ใช้ตรวจว่ากรอกวันหยุดถูกต้องก่อนของจริงยิง
          </p>

          {preview.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">ไม่มีรอบประกาศใน 4 สัปดาห์ข้างหน้า</p>
          )}

          {preview.map(p => (
            <div key={p.date} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{formatThaiDate(p.date)}</span>
                {p.info.shiftedFrom && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border border-orange-300 dark:border-orange-900/60">เลื่อน</span>
                )}
                {p.info.mergedFrom.length > 1 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-300 border border-violet-300 dark:border-violet-900/60">ยุบรอบ</span>
                )}
                {p.info.clearance && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-900/60">เตือนก่อนหยุดยาว</span>
                )}
              </div>
              <pre className="text-[13px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{p.text}</pre>
            </div>
          ))}
        </div>
      </div>

      {formOpen && (
        <HolidayForm initial={editRow} saving={saving}
          onSave={save} onCancel={() => { setFormOpen(false); setEditRow(null); }} />
      )}
    </div>
  );
}
