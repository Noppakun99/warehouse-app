import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Thermometer, Plus, RefreshCcw, X, AlertTriangle, CheckCircle2,
  ShieldAlert, Pencil, Trash2, FlaskConical, FileDown, Upload,
} from 'lucide-react';
import BackButton from './BackButton';
import Toast from './Toast';
import UploadSuccessModal from './UploadSuccessModal';
import { exportToExcel } from './lib/exportExcel';
import {
  fetchTemperatureLogs, fetchTemperatureStats, insertTemperatureLog,
  updateTemperatureLog, deleteTemperatureLog, isExcursion,
  TEMP_MIN_DEFAULT, TEMP_MAX_DEFAULT, TEMP_DEVICES, TEMP_DEVICE_DEFAULT, tempDeviceLabel,
  findTemperatureSameRound, importTemperatureRows, fetchTemperatureRecorders,
} from './lib/db';

// บันทึกอุณหภูมิตู้เย็นคลังยา — ADR-0018
// ⚠️ แถว source='generated' = ค่าที่ Apps Script เคยสุ่มขึ้น ไม่ใช่การวัดจริง
//    db.js กรองออกให้แล้วโดย default — หน้านี้ขอ includeGenerated เฉพาะตอนโชว์หลักฐาน

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const thaiDate = (iso) => {
  if (!iso) return '-';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${Number(y) + 543}`;
};
const hhmm = (t) => (t ? String(t).slice(0, 5) : '-');
const fmt1 = (n) => (n == null ? '-' : Number(n).toFixed(1));

// คอลัมน์ Excel — "ที่มา" กับ "วัดด้วย" ต้องติดไปด้วยเสมอ ไม่งั้นไฟล์ที่ส่งออกไป
// แยกไม่ออกว่าแถวไหนเป็นค่าที่ระบบสุ่ม/วัดด้วยจอตู้ (ADR-0018)
const SOURCE_LABEL = {
  manual: 'กรอกในระบบ', form_import: 'นำเข้าจากฟอร์มเดิม',
  generated: 'ระบบสร้าง (ไม่ใช่ค่าจริง)', device: 'จากเครื่องบันทึก',
};
const TEMP_EXCEL_COLS = [
  { header: 'วันที่',        value: (r) => thaiDate(r.reading_date) },
  { header: 'เวลา',          value: (r) => hhmm(r.reading_time) },
  { header: 'รอบ',           key: 'round_label' },
  { header: 'อุณหภูมิ (°C)', value: (r) => Number(r.temp_c) },
  { header: 'ความชื้น (%)',  value: (r) => (r.humidity_pct == null ? '' : Number(r.humidity_pct)) },
  { header: 'เกณฑ์ต่ำสุด',   value: (r) => Number(r.min_c) },
  { header: 'เกณฑ์สูงสุด',   value: (r) => Number(r.max_c) },
  { header: 'สถานะ',         value: (r) => (r.source === 'generated' ? 'ไม่ใช่ค่าจริง' : isExcursion(r) ? 'หลุดช่วง' : 'ปกติ') },
  { header: 'ที่มาของค่า',   value: (r) => SOURCE_LABEL[r.source] || r.source },
  { header: 'วัดด้วย',       value: (r) => (r.source === 'generated' ? '-' : tempDeviceLabel(r.device)) },
  { header: 'ที่เก็บ',       key: 'location' },
  { header: 'ผู้บันทึก',     key: 'recorded_by' },
  { header: 'การดำเนินการ',  key: 'action_taken' },
  { header: 'หมายเหตุ',      key: 'note' },
];

// CSV จาก data logger — รองรับหัวตารางหลายแบบ (ไทย/อังกฤษ) เพราะแต่ละยี่ห้อไม่เหมือนกัน
const parseCSVRow = (str) => {
  const arr = []; let quote = false; let col = '';
  for (let i = 0; i < str.length; i++) {
    const cc = str[i], nc = str[i + 1];
    if (cc === '"' && quote && nc === '"') { col += '"'; i++; continue; }
    if (cc === '"') { quote = !quote; continue; }
    if ((cc === ',' || cc === '	') && !quote) { arr.push(col.trim()); col = ''; continue; }
    col += cc;
  }
  arr.push(col.trim().replace(/^"|"$/g, ''));
  return arr;
};

const matchHeader = (h) => {
  const s = String(h || '').toLowerCase().trim();
  if (/date|วันที่/.test(s) && !/time|เวลา/.test(s)) return 'date';
  if (/time|เวลา/.test(s) && !/date|วันที่/.test(s)) return 'time';
  if (/date.*time|datetime|timestamp/.test(s)) return 'datetime';
  if (/temp|อุณหภูมิ|°c|celsius/.test(s)) return 'temp';
  if (/humid|ความชื้น|rh|%/.test(s)) return 'humidity';
  return null;
};

// รับได้ทั้ง DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY (เดาจากค่า >12 = วัน)
const toIsoDate = (v) => {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (!m) return null;
  let [, a, b, y] = m;
  let d = Number(a), mo = Number(b);
  if (d <= 12 && mo > 12) { const t = d; d = mo; mo = t; }   // MM/DD → DD/MM
  if (Number(y) > 2500) y = String(Number(y) - 543);          // พ.ศ. → ค.ศ.
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
const toHms = (v) => {
  const m = String(v || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${String(Number(m[1])).padStart(2, '0')}:${m[2]}:${m[3] || '00'}` : null;
};

// Rule #14 — แสดง DD/MM/YYYY (พ.ศ.) ทับ input type=date; Rule #3 — showPicker แบบ guarded
function IsoDateInput({ value, onChange, className = '' }) {
  const display = (iso) => { if (!iso) return null; const [y, m, d] = iso.split('-'); return `${d}/${m}/${Number(y) + 543}`; };
  return (
    <div className={`relative flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus-within:ring-2 focus-within:ring-sky-400 ${className}`}>
      <span className={`px-3 py-2 text-sm w-full select-none pointer-events-none ${value ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>{display(value) || 'dd/mm/yyyy'}</span>
      <input type="date" value={value || ''} onChange={(e) => onChange(e.target.value)}
        onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* noop */ } }}
        className="absolute inset-0 opacity-0 w-full cursor-pointer" />
    </div>
  );
}

function StatCard({ label, value, sub, tone = 'slate', icon: Icon }) {
  const tones = {
    slate:   'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200',
    sky:     'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900/60 text-sky-700 dark:text-sky-300',
    rose:    'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300',
    amber:   'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-300',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${tones[tone]}`}>
      <p className="text-xs opacity-70 flex items-center gap-1">{Icon && <Icon size={12} />}{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
      {sub && <p className="text-[11px] opacity-70 mt-0.5">{sub}</p>}
    </div>
  );
}

function RecordModal({ initial, onSave, onCancel, saving }) {
  const isEdit = !!initial;
  const [date, setDate] = useState(initial?.reading_date || todayIso());
  const [time, setTime] = useState(initial?.reading_time ? String(initial.reading_time).slice(0, 5) : '');
  const [temp, setTemp] = useState(initial?.temp_c != null ? String(Number(initial.temp_c)) : '');
  const [humidity, setHumidity] = useState(initial?.humidity_pct != null ? String(Number(initial.humidity_pct)) : '');
  const [note, setNote] = useState(initial?.note || '');
  const [action, setAction] = useState(initial?.action_taken || '');
  const [device, setDevice] = useState(initial?.device || TEMP_DEVICE_DEFAULT);

  // เตือนถ้ารอบนั้นบันทึกไปแล้ว (เช้า/บ่าย) — ไม่บล็อก แต่ต้องกดยืนยัน
  const [dupRows, setDupRows] = useState([]);
  const [dupChecked, setDupChecked] = useState(false);
  const [confirmedDup, setConfirmedDup] = useState(false);

  // เช็ค "รอบนี้บันทึกไปแล้วหรือยัง" แบบ async — setState อยู่ใน callback ไม่ใช่ effect body
  // (ล้าง confirmedDup ไปด้วยในจังหวะเดียวกัน เพราะเปลี่ยนวัน/เวลา = คนละรอบแล้ว)
  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => (date ? findTemperatureSameRound(date, time || '00:00') : []))
      .then((found) => {
        if (!alive) return;
        setDupRows((found || []).filter(r => r.id !== initial?.id)); // ตอนแก้ไข ไม่นับแถวตัวเอง
        setConfirmedDup(false);
        setDupChecked(true);
      })
      .catch(() => { if (alive) setDupChecked(true); });
    return () => { alive = false; };
  }, [date, time, initial?.id]);

  const tempNum = parseFloat(temp);
  const out = Number.isFinite(tempNum) && (tempNum < TEMP_MIN_DEFAULT || tempNum > TEMP_MAX_DEFAULT);
  const hasDup = dupChecked && dupRows.length > 0;
  const canSave = !!date && Number.isFinite(tempNum) && (!out || action.trim()) && (!hasDup || confirmedDup);
  const roundName = Number(String(time || '00:00').slice(0, 2)) < 12 ? 'เช้า' : 'บ่าย';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCancel}>
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><Thermometer size={18} className="text-sky-600" /> {isEdit ? 'แก้ไขบันทึกอุณหภูมิ' : 'บันทึกอุณหภูมิ'}</h3>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">วันที่วัด</label>
              <IsoDateInput value={date} onChange={setDate} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">เวลาที่วัด</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* noop */ } }}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">อุณหภูมิ (°C) *</label>
              <input type="number" step="0.1" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)}
                placeholder="เช่น 4.2"
                className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 ${out ? 'border-rose-400 dark:border-rose-700' : 'border-slate-300 dark:border-slate-600'}`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">ความชื้น (%)</label>
              <input type="number" step="0.1" inputMode="decimal" value={humidity} onChange={(e) => setHumidity(e.target.value)}
                placeholder="ไม่บังคับ"
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
            </div>
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500">ช่วงที่ยอมรับได้ {TEMP_MIN_DEFAULT}–{TEMP_MAX_DEFAULT} °C</p>

          {out && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl p-3 space-y-2">
              <p className="text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                อุณหภูมิหลุดช่วง — ต้องระบุการดำเนินการก่อนบันทึก
              </p>
              <textarea value={action} onChange={(e) => setAction(e.target.value)} rows={2}
                placeholder="เช่น ย้ายยาไปตู้สำรอง / แจ้งช่างซ่อม / ตรวจสอบประตูตู้"
                className="w-full border border-rose-300 dark:border-rose-800 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
            </div>
          )}

          {hasDup && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3 space-y-2">
              <p className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>
                  วันที่ {thaiDate(date)} <b>รอบ{roundName}</b> บันทึกไปแล้ว {dupRows.length} ครั้ง
                  <span className="block text-xs mt-1 opacity-90">
                    {dupRows.map(r => `${hhmm(r.reading_time)} = ${fmt1(r.temp_c)}°C`).join(' · ')}
                  </span>
                </span>
              </p>
              <label className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300 cursor-pointer">
                <input type="checkbox" checked={confirmedDup} onChange={(e) => setConfirmedDup(e.target.checked)}
                  className="mt-0.5 accent-amber-500" />
                ยืนยันบันทึกเพิ่มอีกรอบ (วัดซ้ำ/วัดใหม่)
              </label>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">วัดด้วยอุปกรณ์</label>
            <select value={device} onChange={(e) => setDevice(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
              {TEMP_DEVICES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            {device === 'fridge_display' && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-start gap-1">
                <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                จอตู้เย็นวัดอากาศใกล้คอยล์ ไม่ใช่อุณหภูมิของยา และไม่มีใบสอบเทียบ — ใช้ดูแนวโน้มได้ แต่ยืนยันกับผู้ตรวจไม่ได้
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">หมายเหตุ</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">ยกเลิก</button>
          <button disabled={!canSave || saving}
            onClick={() => onSave({
              id: initial?.id,
              reading_date: date, reading_time: time || null,
              round_label: time ? (Number(time.slice(0, 2)) < 12 ? 'เช้า' : 'บ่าย') : '',
              temp_c: tempNum, humidity_pct: humidity, note, action_taken: action, device,
            })}
            className="px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg text-sm font-semibold">
            {saving ? 'กำลังบันทึก…' : isEdit ? 'บันทึกการแก้ไข' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionModal({ row, onSave, onCancel, saving }) {
  const [action, setAction] = useState(row?.action_taken || '');
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCancel}>
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-slate-800 dark:text-slate-100">บันทึกการดำเนินการ</h3>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {thaiDate(row?.reading_date)} {hhmm(row?.reading_time)} — <span className="font-bold text-rose-600 dark:text-rose-400">{fmt1(row?.temp_c)} °C</span>
          </p>
          <textarea value={action} onChange={(e) => setAction(e.target.value)} rows={3}
            placeholder="ทำอะไรไปแล้วบ้าง"
            className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
        </div>
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">ยกเลิก</button>
          <button disabled={saving || !action.trim()} onClick={() => onSave(action)}
            className="px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg text-sm font-semibold">บันทึก</button>
        </div>
      </div>
    </div>
  );
}

export default function TemperatureLogApp({ onRefresh, auth, onGoBack, canGoBack }) {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showGenerated, setShowGenerated] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [recordedBy, setRecordedBy] = useState('');
  const [recorders, setRecorders] = useState([]);
  const [modal, setModal] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [actionRow, setActionRow] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const isAdmin = auth?.role === 'admin';
  const clearToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        fetchTemperatureLogs({ from: from || undefined, to: to || undefined, includeGenerated: showGenerated, recordedBy: recordedBy || undefined }),
        fetchTemperatureStats({ from: from || undefined, to: to || undefined, recordedBy: recordedBy || undefined }),
      ]);
      setRows(r);
      setStats(s);
    } catch (e) {
      setToast({ tone: 'error', message: 'โหลดข้อมูลไม่สำเร็จ: ' + (e?.message || e) });
    } finally {
      setLoading(false);
    }
  }, [from, to, showGenerated, recordedBy]);

  // รายชื่อผู้บันทึกโหลดครั้งเดียว (ไม่ผูกกับตัวกรอง ไม่งั้นเลือกแล้วชื่ออื่นหาย)
  useEffect(() => {
    let alive = true;
    fetchTemperatureRecorders()
      .then((list) => { if (alive) setRecorders(list); })
      .catch(() => { /* dropdown ว่างได้ ไม่ต้องรบกวนผู้ใช้ */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (payload) => {
    setSaving(true);
    try {
      if (payload.id) {
        await updateTemperatureLog(payload.id, {
          temp_c: payload.temp_c, humidity_pct: payload.humidity_pct,
          note: payload.note, action_taken: payload.action_taken,
          device: payload.device, reading_time: payload.reading_time,
          round_label: payload.round_label,
        }, auth);
      } else {
        await insertTemperatureLog(payload, auth);
      }
      setModal(false); setEditRow(null);
      setToast({ tone: 'success', message: payload.id ? 'แก้ไขเรียบร้อยแล้ว' : 'บันทึกอุณหภูมิเรียบร้อยแล้ว' });
      await load();
    } catch (e) {
      setToast({ tone: 'error', message: 'บันทึกไม่สำเร็จ: ' + (e?.message || e) });
    } finally { setSaving(false); }
  };

  const handleAction = async (text) => {
    setSaving(true);
    try {
      await updateTemperatureLog(actionRow.id, { action_taken: text }, auth);
      setActionRow(null);
      setToast({ tone: 'success', message: 'บันทึกการดำเนินการแล้ว' });
      await load();
    } catch (e) {
      setToast({ tone: 'error', message: 'บันทึกไม่สำเร็จ: ' + (e?.message || e) });
    } finally { setSaving(false); }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`ลบบันทึกวันที่ ${thaiDate(row.reading_date)} ${hhmm(row.reading_time)} ?`)) return;
    try {
      await deleteTemperatureLog(row.id, auth);
      setToast({ tone: 'success', message: 'ลบแล้ว' });
      await load();
    } catch (e) {
      setToast({ tone: 'error', message: 'ลบไม่สำเร็จ: ' + (e?.message || e) });
    }
  };

  // นำเข้า CSV จาก data logger — source='device' (ไม่ทับรอบที่มีอยู่แล้ว)
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSaving(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new Error('ไฟล์ไม่มีข้อมูล');

      // หาแถว header ที่ match ฟิลด์ที่รู้จักได้มากสุด (ไฟล์ logger มักมี block ข้อมูลเครื่องนำหน้า)
      let headerIdx = 0, best = 0;
      for (let i = 0; i < Math.min(lines.length, 30); i++) {
        const score = parseCSVRow(lines[i]).filter(matchHeader).length;
        if (score > best) { best = score; headerIdx = i; }
      }
      if (best < 2) throw new Error('ไม่พบหัวตาราง — ต้องมีคอลัมน์วันที่และอุณหภูมิ');

      const headers = parseCSVRow(lines[headerIdx]);
      const map = {};
      headers.forEach((h, i) => { const f = matchHeader(h); if (f && map[f] == null) map[f] = i; });

      const warnings = [];
      const parsed = [];
      lines.slice(headerIdx + 1).forEach((line, n) => {
        const c = parseCSVRow(line);
        if (!c.some(x => x.trim())) return;
        const rowNum = headerIdx + n + 2;
        const rawDate = map.date != null ? c[map.date] : (map.datetime != null ? c[map.datetime] : '');
        const rawTime = map.time != null ? c[map.time] : (map.datetime != null ? c[map.datetime] : '');
        const iso = toIsoDate(rawDate);
        const t = parseFloat(String(map.temp != null ? c[map.temp] : '').replace(/[^\d.-]/g, ''));
        const issues = [];
        if (!iso) issues.push(`วันที่ไม่ถูกต้อง: "${rawDate}"`);
        if (!Number.isFinite(t)) issues.push('อุณหภูมิไม่ใช่ตัวเลข');
        if (issues.length) { warnings.push({ row: rowNum, name: rawDate || '-', code: '-', issues }); return; }
        const hms = toHms(rawTime) || '00:00:00';
        const hum = map.humidity != null ? parseFloat(String(c[map.humidity]).replace(/[^\d.-]/g, '')) : NaN;
        parsed.push({
          reading_date: iso, reading_time: hms,
          round_label: Number(hms.slice(0, 2)) < 12 ? 'เช้า' : 'บ่าย',
          temp_c: t, humidity_pct: Number.isFinite(hum) ? hum : null,
          source_ref: `${rawDate} ${rawTime}`.trim(),
        });
      });

      if (!parsed.length) throw new Error('ไม่พบแถวข้อมูลที่อ่านได้');
      const { inserted, skipped } = await importTemperatureRows(parsed, { device: 'data_logger' }, auth);
      setImportResult({
        message: `นำเข้า ${inserted.toLocaleString()} รายการ` +
          (skipped > 0 ? ` · ข้าม ${skipped.toLocaleString()} รายการที่มีอยู่แล้ว` : ''),
        fileName: file.name,
        warnings,
      });
      await load();
    } catch (err) {
      setToast({ tone: 'error', message: 'นำเข้าไม่สำเร็จ: ' + (err?.message || err) });
    } finally { setSaving(false); }
  };

  const excursions = useMemo(() => rows.filter((r) => r.source !== 'generated' && isExcursion(r)), [rows]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800">
      {toast && <Toast message={toast.message} tone={toast.tone} onClose={clearToast} />}

      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3 flex items-center gap-3">
        <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
        <div className="p-1.5 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-600 shrink-0"><Thermometer size={18} /></div>
        <button onClick={onRefresh} className="flex-1 min-w-0 text-left hover:opacity-70 transition-opacity" title="คลิกเพื่อโหลดใหม่">
          <h1 className="font-bold text-base leading-tight text-slate-800 dark:text-slate-100">อุณหภูมิตู้เย็นคลังยา</h1>
          <p className="text-slate-400 dark:text-slate-500 text-xs">บันทึกและติดตามอุณหภูมิ (เกณฑ์ {TEMP_MIN_DEFAULT}–{TEMP_MAX_DEFAULT} °C)</p>
        </button>
        <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="โหลดใหม่"><RefreshCcw size={16} /></button>
        {/* จอแคบซ่อนแค่ "ข้อความ" ไม่ซ่อนปุ่ม — ไม่งั้นผู้ใช้หา Excel/นำเข้าไม่เจอเลย */}
        <button onClick={() => exportToExcel(rows, TEMP_EXCEL_COLS, 'อุณหภูมิตู้เย็น',
            `temperature_${todayIso()}.xlsx`, auth)}
          disabled={!rows.length} title="Export Excel"
          className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-900/60 disabled:opacity-40 rounded-lg px-2.5 sm:px-3 py-2 text-sm font-medium shrink-0">
          <FileDown size={16} /> <span className="hidden sm:inline">Excel</span>
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={saving}
          className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 disabled:opacity-40 rounded-lg px-2.5 sm:px-3 py-2 text-sm font-medium shrink-0"
          title="นำเข้า CSV จากเครื่องบันทึกอุณหภูมิ (data logger)">
          <Upload size={16} /> <span className="hidden sm:inline">นำเข้า CSV</span>
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} className="hidden" />
        <button onClick={() => setModal(true)} title="บันทึกอุณหภูมิ"
          className="bg-sky-600 hover:bg-sky-700 text-white px-2.5 sm:px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 shrink-0">
          <Plus size={16} /> <span className="hidden sm:inline">บันทึก</span>
        </button>
      </div>

      <div className="p-4 space-y-4 max-w-5xl mx-auto">
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatCard label="ค่าที่วัดจริง" value={stats.count.toLocaleString()} sub={stats.dataFrom ? `${thaiDate(stats.dataFrom)} – ${thaiDate(stats.dataTo)}` : null} tone="sky" icon={Thermometer} />
            <StatCard label="เฉลี่ย / ต่ำสุด–สูงสุด" value={`${fmt1(stats.avg)} °C`} sub={`${fmt1(stats.min)} – ${fmt1(stats.max)} °C`} tone="slate" />
            <StatCard label="หลุดช่วง" value={stats.excursionCount.toLocaleString()}
              sub={stats.unhandledCount > 0 ? `ยังไม่ระบุการดำเนินการ ${stats.unhandledCount}` : 'ระบุการดำเนินการครบ'}
              tone={stats.excursionCount > 0 ? 'rose' : 'emerald'} icon={stats.excursionCount > 0 ? AlertTriangle : CheckCircle2} />
            <StatCard label="ความครบถ้วน" value={`${stats.pct}%`} sub={`บันทึก ${stats.count} จาก ${stats.expected} รอบ`}
              tone={stats.pct >= 80 ? 'emerald' : 'amber'} />
          </div>
        )}

        {stats?.generatedCount > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <FlaskConical size={16} className="shrink-0 mt-0.5" />
              มี {stats.generatedCount.toLocaleString()} แถวที่ระบบสุ่มขึ้นในอดีต (ไม่ใช่ค่าที่วัดจริง) — ไม่ถูกนำมาคิดสถิติ
            </p>
            <button onClick={() => setShowGenerated((v) => !v)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium shrink-0">
              {showGenerated ? 'ซ่อนค่าที่ระบบสร้าง' : 'แสดงค่าที่ระบบสร้าง'}
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">ตั้งแต่วันที่</label>
            <IsoDateInput value={from} onChange={setFrom} className="w-40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">ถึงวันที่</label>
            <IsoDateInput value={to} onChange={setTo} className="w-40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">ผู้บันทึก</label>
            <select value={recordedBy} onChange={(e) => setRecordedBy(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 w-44">
              <option value="">ทุกคน</option>
              {recorders.map((r) => (
                <option key={r.name} value={r.name}>{r.name} ({r.count})</option>
              ))}
            </select>
          </div>
          {(from || to || recordedBy) && (
            <button onClick={() => { setFrom(''); setTo(''); setRecordedBy(''); }}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 pb-2"><X size={12} /> ล้างวันที่</button>
          )}
        </div>

        {excursions.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-xl overflow-hidden">
            <div className="bg-rose-50 dark:bg-rose-950/40 px-4 py-2 text-sm font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
              <AlertTriangle size={15} /> อุณหภูมิหลุดช่วง {excursions.length} ครั้ง
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {excursions.slice(0, 10).map((r) => (
                <div key={r.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <span className="text-slate-700 dark:text-slate-200">{thaiDate(r.reading_date)} {hhmm(r.reading_time)}</span>
                    <span className="ml-2 font-bold text-rose-600 dark:text-rose-400">{fmt1(r.temp_c)} °C</span>
                  </div>
                  {String(r.action_taken || '').trim()
                    ? <span className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><CheckCircle2 size={11} />ดำเนินการแล้ว</span>
                    : <button onClick={() => setActionRow(r)} className="text-xs bg-rose-500 hover:bg-rose-600 text-white px-2.5 py-1 rounded-lg font-medium">ระบุการดำเนินการ</button>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {loading ? (
            <p className="text-slate-400 dark:text-slate-500 text-sm text-center py-10">กำลังโหลด…</p>
          ) : rows.length === 0 ? (
            <p className="text-slate-400 dark:text-slate-500 text-sm text-center py-10">ยังไม่มีข้อมูลในช่วงที่เลือก</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">วันที่</th>
                    <th className="px-3 py-2 text-left font-semibold">เวลา</th>
                    <th className="px-3 py-2 text-right font-semibold">°C</th>
                    <th className="px-3 py-2 text-left font-semibold">สถานะ</th>
                    <th className="px-3 py-2 text-left font-semibold">วัดด้วย</th>
                    <th className="px-3 py-2 text-left font-semibold">ผู้บันทึก</th>
                    <th className="px-3 py-2 text-left font-semibold">การดำเนินการ</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                {/* สีตัวอักษรกำหนดที่ tbody — td ที่ไม่มี class สีจะ inherit (ไม่งั้นได้ดำบนพื้นมืด) */}
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                  {rows.map((r) => {
                    const gen = r.source === 'generated';
                    const out = !gen && isExcursion(r);
                    return (
                      <tr key={r.id} className={gen ? 'bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500' : ''}>
                        <td className="px-3 py-2 whitespace-nowrap">{thaiDate(r.reading_date)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{hhmm(r.reading_time)}{r.round_label ? ` (${r.round_label})` : ''}</td>
                        <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${out ? 'text-rose-600 dark:text-rose-400' : gen ? '' : 'text-slate-800 dark:text-slate-100'}`}>{fmt1(r.temp_c)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {gen
                            ? <span className="text-[11px] bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><FlaskConical size={10} />ระบบสร้าง</span>
                            : out
                              ? <span className="text-[11px] bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 px-2 py-0.5 rounded-full">หลุดช่วง</span>
                              : <span className="text-[11px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 px-2 py-0.5 rounded-full">ปกติ</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs">{gen ? '-' : tempDeviceLabel(r.device)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.recorded_by || '-'}</td>
                        <td className="px-3 py-2 max-w-[220px] truncate" title={r.action_taken || ''}>{r.action_taken || (out ? <span className="text-rose-500">ยังไม่ระบุ</span> : '-')}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-right">
                          {!gen && (
                            <button onClick={() => setEditRow(r)} className="p-1 text-slate-400 hover:text-sky-600" title="แก้ไขบันทึก"><Pencil size={14} /></button>
                          )}
                          {isAdmin && (
                            <button onClick={() => handleDelete(r)} className="p-1 text-slate-400 hover:text-rose-600" title="ลบ"><Trash2 size={14} /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {(modal || editRow) && (
        <RecordModal initial={editRow} onSave={handleSave}
          onCancel={() => { setModal(false); setEditRow(null); }} saving={saving} />
      )}
      <UploadSuccessModal
        open={!!importResult}
        title="นำเข้าอุณหภูมิสำเร็จ"
        message={importResult?.message}
        fileName={importResult?.fileName}
        warnings={importResult?.warnings}
        onClose={() => setImportResult(null)}
      />
      {actionRow && <ActionModal row={actionRow} onSave={handleAction} onCancel={() => setActionRow(null)} saving={saving} />}
    </div>
  );
}
