// ReorderApp.jsx — ระบบวิเคราะห์การสั่งซื้อยา (Pharmacy Reorder System)
// อ้างอิง spec §3 — logic อยู่ใน src/lib/reorder.js (pure functions + tests)
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShoppingCart, AlertTriangle, Package, Building2, CheckCircle2, XCircle, Clock,
  ChevronDown, FileSpreadsheet, Printer, Save, History, Search, Upload,
  Pencil, ListChecks, AlertCircle, Loader2, RefreshCw, X,
  Database, Calendar, ShieldAlert, TrendingDown, Trash2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import DrugSearchBar from './DrugSearchBar';
import { supabase } from './lib/supabase';
import {
  fetchInventory, fetchDrugReorderConfig, upsertDrugReorderConfig,
  bulkUpsertDrugReorderConfig, fetchMonthlyDispenseUsage, saveAnalysisRun,
  fetchAnalysisRuns, deleteAnalysisRun, logReorderAction,
  fetchLatestReceiptInfo, parseUnitFactor,
} from './lib/db';
import { exportToExcel } from './lib/exportExcel';
import {
  analyzeBatch, analyzeDrug, STATUS, DEFAULT_LEAD_TIME,
  computeSafetyStock,
} from './lib/reorder';

// ────────────────────────────────────────────────────────────
// Constants / lookup
// ────────────────────────────────────────────────────────────
const STATUS_ORDER = [
  STATUS.OUT_OF_STOCK, STATUS.NEAR_EXPIRY, STATUS.REORDER,
  STATUS.SUFFICIENT, STATUS.ON_DEMAND, STATUS.EXCLUDED,
];

const STATUS_META = {
  [STATUS.OUT_OF_STOCK]: { tone: 'rose',    icon: AlertCircle,     hint: 'คงเหลือ = 0' },
  [STATUS.NEAR_EXPIRY]:  { tone: 'amber',   icon: Clock,           hint: 'ของในสต็อกจะหมดอายุ ≤ 180 วัน' },
  [STATUS.REORDER]:      { tone: 'orange',  icon: AlertTriangle,   hint: 'คงเหลือ ≤ ROP' },
  [STATUS.SUFFICIENT]:   { tone: 'emerald', icon: CheckCircle2,    hint: 'คงเหลือ > ROP — ยังไม่ต้องสั่ง' },
  [STATUS.ON_DEMAND]:    { tone: 'sky',     icon: Package,         hint: 'รอใบสั่ง — ไม่คำนวณอัตโนมัติ' },
  [STATUS.EXCLUDED]:     { tone: 'slate',   icon: XCircle,         hint: 'ตัดออกจากการคำนวณ' },
};

const TONE_CLASSES = {
  rose:    { chip: 'bg-rose-50 text-rose-700 border-rose-200',     bar: 'bg-rose-500',    text: 'text-rose-700' },
  amber:   { chip: 'bg-amber-50 text-amber-700 border-amber-200',  bar: 'bg-amber-500',   text: 'text-amber-700' },
  orange:  { chip: 'bg-orange-50 text-orange-700 border-orange-200',bar: 'bg-orange-500', text: 'text-orange-700' },
  emerald: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',bar:'bg-emerald-500',text:'text-emerald-700' },
  sky:     { chip: 'bg-sky-50 text-sky-700 border-sky-200',        bar: 'bg-sky-500',     text: 'text-sky-700' },
  slate:   { chip: 'bg-slate-100 text-slate-600 border-slate-200', bar: 'bg-slate-400',   text: 'text-slate-600' },
};

// VEN (Excel) ↔ risk_group (schema เดิม): V=Vital=Critical, E=Essential, N=Non-essential=Normal
const RISK_OPTIONS = [
  { value: 'Critical',  label: 'V — Vital (2.0×)',         color: 'text-rose-700'  },
  { value: 'Essential', label: 'E — Essential (1.5×)',     color: 'text-amber-700' },
  { value: 'Normal',    label: 'N — Non-essential (1.0×)', color: 'text-slate-600' },
];

// risk_group → ตัวอักษร VEN (สำหรับ badge)
// ว่าง/null = ยังไม่จัดกลุ่ม → "E?" (คำนวณด้วย default 1.5 = Essential, ? = ค่า default ไม่ใช่จัดกลุ่มจริง — ดู docs/adr/0002)
const venLetter = (risk) =>
  risk === 'Critical' ? 'V' : risk === 'Essential' ? 'E' : risk === 'Normal' ? 'N' : 'E?';

const EXCLUDE_OPTIONS = [
  { value: '',                label: 'คำนวณตามปกติ' },
  { value: STATUS.ON_DEMAND,  label: 'สั่งเมื่อขอ — ไม่คำนวณ V' },
  { value: STATUS.EXCLUDED,   label: 'ตัดออก — ไม่อยู่ในใบสั่งซื้อ' },
];

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
const codeKey = (val) => {
  if (val == null) return '';
  let s = String(val).trim().toLowerCase();
  if (/^[\d.]+[eE][+-]?\d+$/.test(s)) {
    const n = parseFloat(s);
    if (isFinite(n)) s = BigInt(Math.round(n)).toString();
  }
  return s.replace(/^0+(\d)/, '$1');
};

function parseExpToDate(raw) {
  if (!raw || raw === '-') return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (m) return new Date(+m[1], +m[2] - 1, +(m[3] || 1));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) { let y = +m[3]; if (y > 2400) y -= 543; return new Date(y, +m[2] - 1, +m[1]); }
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) { let y = +m[2]; if (y > 2400) y -= 543; return new Date(y, +m[1] - 1, 1); }
  return null;
}

const fmtBaht = (n) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const fmtNum  = (n) => new Intl.NumberFormat('th-TH').format(Math.round(n || 0));
const todayIso = () => new Date().toISOString().slice(0, 10);

// ISO → DD/MM/YY (พ.ศ.) สั้น
const fmtThaiDate = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${(Number(m[1]) + 543) % 100}` : '-';
};

// คงอยู่ได้อีก (Coverage): คงเหลือ ÷ Avg/วัน → "X ปี Y ด. Z วัน" (หน่วยเดียวกันทั้งคู่)
const fmtCoverage = (stock, avgDay) => {
  if (!avgDay || avgDay <= 0) return stock > 0 ? '∞' : '—';
  let days = Math.floor(stock / avgDay);
  if (days <= 0) return '0 วัน';
  const y = Math.floor(days / 365); days -= y * 365;
  const mo = Math.floor(days / 30); days -= mo * 30;
  const parts = [];
  if (y) parts.push(`${y} ปี`);
  if (mo) parts.push(`${mo} ด.`);
  if (days) parts.push(`${days} วัน`);
  return parts.join(' ') || '0 วัน';
};

function isoMonthsAgo(months) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

// วันสุดท้ายของเดือนก่อนหน้า (ปิดงวดเดือนปัจจุบันที่ยังไม่ครบออก)
function isoPrevMonthEnd() {
  const d = new Date();
  d.setDate(0);
  return d.toISOString().slice(0, 10);
}

function listMonthYM(fromIso, toIso) {
  const out = [];
  const start = new Date(fromIso); start.setDate(1);
  const end = new Date(toIso); end.setDate(1);
  while (start <= end) {
    out.push(start.toISOString().slice(0, 7));
    start.setMonth(start.getMonth() + 1);
  }
  return out;
}

function thaiMonthLabel(ym) {
  const [y, m] = ym.split('-');
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${months[+m - 1]} ${(+y + 543) % 100}`;
}

function fmtDateTimeThai(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const y = (d.getFullYear() + 543) % 100;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dd} ${months[d.getMonth()]} ${y} ${hh}:${mm}`;
}

// ISO date input — overlay pattern แสดง DD/MM/YYYY (พ.ศ.) ตาม docs/patterns.md
// ห้ามใช้ plain <input type="date"> เพราะ browser US locale แสดง MM/DD/YYYY
function IsoDateInput({ value, onChange, className = '' }) {
  const display = (iso) => {
    if (!iso) return null;
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return iso;
    return `${m[3]}/${m[2]}/${Number(m[1]) + 543}`;
  };
  return (
    <div className={`relative flex items-center bg-white border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-orange-400 ${className}`}>
      <span className={`pl-3 pr-8 py-1.5 text-sm w-full select-none pointer-events-none ${value ? 'text-slate-800' : 'text-slate-400'}`}>
        {display(value) || 'dd/mm/yyyy'}
      </span>
      <Calendar size={15} className="absolute right-2.5 text-slate-400 pointer-events-none"/>
      {/* type=date: คลิก = showPicker (desktop) guarded ด้วย try/catch + ?. → mobile แตะเปิด native ได้ตามปกติ */}
      <input type="date" value={value || ''} onChange={(e) => onChange(e.target.value)}
        onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* noop */ } }}
        className="absolute inset-0 opacity-0 w-full cursor-pointer"/>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// StatusChip
// ────────────────────────────────────────────────────────────
function StatusChip({ status, count, active, onClick }) {
  const meta = STATUS_META[status] || STATUS_META[STATUS.SUFFICIENT];
  const tone = TONE_CLASSES[meta.tone];
  const Icon = meta.icon;
  return (
    <button onClick={onClick} title={meta.hint}
      className={`group relative flex flex-col items-center justify-center px-3 py-2.5 rounded-xl border transition-all min-w-[96px]
        ${active ? `${tone.chip} ring-2 ring-offset-1 ring-${meta.tone}-400 shadow-sm` : `${tone.chip} hover:shadow-sm`}`}>
      <div className="flex items-center gap-1.5">
        <Icon size={14} />
        <span className="text-lg font-black tabular-nums">{fmtNum(count)}</span>
      </div>
      <span className="text-[11px] font-semibold mt-0.5 whitespace-nowrap">{status}</span>
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// MasterEditModal — แก้ Master ของยา 1 ตัว
// ────────────────────────────────────────────────────────────
function MasterEditModal({ open, drug, onClose, onSave }) {
  const [form, setForm] = useState({ supplier: '', risk_group: 'Normal', lead_time_days: 15, price_per_unit: 0, exclude_status: '', pack_size: 1, notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!drug) return;
    setForm({
      supplier: drug.supplier ?? '',
      risk_group: drug.risk_group ?? 'Normal',
      lead_time_days: drug.lead_time_days ?? 15,
      price_per_unit: drug.price_per_unit ?? 0,
      exclude_status: drug.exclude_status ?? '',
      pack_size: drug.pack_size ?? 1,
      notes: drug.notes ?? '',
    });
  }, [drug]);

  if (!open || !drug) return null;
  const submit = async () => {
    setSaving(true);
    try {
      await onSave({ code: drug.code, name: drug.name, ...form, exclude_status: form.exclude_status || null });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-orange-600 to-rose-600 text-white px-5 py-3.5 rounded-t-2xl flex items-center justify-between">
          <div>
            <h2 className="font-bold flex items-center gap-2"><Pencil size={16}/> แก้ Master ยา</h2>
            <p className="text-xs text-orange-100">{drug.code} · {drug.name}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X size={20}/></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <Field label="บริษัทผู้จำหน่าย (supplier)">
            <input value={form.supplier} onChange={(e) => setForm(f => ({...f, supplier: e.target.value}))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="เช่น บ.ABC จำกัด"/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Risk Group">
              <select value={form.risk_group} onChange={(e) => setForm(f => ({...f, risk_group: e.target.value}))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white">
                {RISK_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Lead Time (วัน)">
              <input type="number" min="0" step="0.5" value={form.lead_time_days} onChange={(e) => setForm(f => ({...f, lead_time_days: parseFloat(e.target.value) || 0}))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ราคา/หน่วย (บาท)">
              <input type="number" min="0" step="0.01" value={form.price_per_unit} onChange={(e) => setForm(f => ({...f, price_per_unit: parseFloat(e.target.value) || 0}))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"/>
            </Field>
            <Field label="Pack size">
              <input type="number" min="1" step="1" value={form.pack_size} onChange={(e) => setForm(f => ({...f, pack_size: parseFloat(e.target.value) || 1}))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"/>
            </Field>
          </div>
          <Field label="สถานะพิเศษ">
            <select value={form.exclude_status} onChange={(e) => setForm(f => ({...f, exclude_status: e.target.value}))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white">
              {EXCLUDE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="หมายเหตุ">
            <textarea rows={2} value={form.notes} onChange={(e) => setForm(f => ({...f, notes: e.target.value}))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 resize-none"/>
          </Field>
        </div>
        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

// ────────────────────────────────────────────────────────────
// ImportMasterModal — bulk upload Excel/CSV
// ────────────────────────────────────────────────────────────
function ImportMasterModal({ open, onClose, onImported, auth }) {
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  const handleFile = async (file) => {
    setParsing(true); setError(''); setRows([]);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // ไฟล์ export จาก Excel "วิเคราะห์สั่งซื้อ" มีแถว title/คำเตือนนำหน้า header จริง
      // → หาแถว header (cell ใดมีคำว่า "รหัส"/"code") แล้วใช้เป็นจุดเริ่ม ไม่งั้น key เพี้ยนทั้งไฟล์
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const headerRow = grid.findIndex(row =>
        row.some(c => { const s = String(c).trim(); return s === 'รหัส' || s.toLowerCase() === 'code'; }));
      const arr = XLSX.utils.sheet_to_json(ws, { defval: '', range: headerRow >= 0 ? headerRow : 0 });
      const parsed = arr.map(r => {
        const code = String(r['รหัส'] ?? r['code'] ?? r['Code'] ?? '').trim();
        if (!code) return null;
        // รับได้ทั้ง risk_group เดิม (Normal/Essential/Critical) และ VEN (V/E/N) → map เป็น enum
        // VEN ว่าง/ไม่ระบุ → null (ไม่ใช่ Normal) เพื่อให้ analyzeDrug fallback เป็น 1.5 ตาม ADR-0002
        const risk = String(r['VEN'] ?? r['ven'] ?? r['กลุ่ม VEN'] ?? r['risk'] ?? r['risk_group'] ?? r['Risk'] ?? '').trim();
        const VEN_MAP = { V: 'Critical', E: 'Essential', N: 'Normal' };
        const riskNorm = VEN_MAP[risk.toUpperCase()] ?? (['Normal','Essential','Critical'].includes(risk) ? risk : null);
        return {
          code,
          name: String(r['รายการยา'] ?? r['ชื่อยา'] ?? r['name'] ?? r['Name'] ?? '').trim() || null,
          supplier: String(r['บริษัทล่าสุด'] ?? r['บริษัท'] ?? r['supplier'] ?? r['Supplier'] ?? '').trim() || null,
          risk_group: riskNorm,
          lead_time_days: parseFloat(r['lead_time'] ?? r['lead_time_days'] ?? r['LT'] ?? 15) || 15,
          price_per_unit: parseFloat(r['ราคา'] ?? r['price'] ?? r['price_per_unit'] ?? 0) || 0,
          exclude_status: (() => {
            // CSV จริงมี emoji นำหน้า (เช่น "✂️ ตัดออก" / "📋 สั่งเมื่อขอ") → strip ก่อนเทียบด้วย includes
            const v = String(r['exclude_status'] ?? r['ตัดออกจากบัญชี ,สั่งเมื่อขอ'] ?? r['สถานะ'] ?? '')
              .replace(/[^฀-๿a-zA-Z]/g, '');
            if (v.includes('ตัดออก')) return STATUS.EXCLUDED;
            if (v.includes('สั่งเมื่อขอ')) return STATUS.ON_DEMAND;
            return null;
          })(),
          pack_size: parseFloat(r['pack_size'] ?? r['pack'] ?? 1) || 1,
          notes: String(r['notes'] ?? r['หมายเหตุ'] ?? '').trim() || null,
        };
      }).filter(Boolean);
      if (parsed.length === 0) throw new Error('ไม่พบรายการ — ต้องมีคอลัมน์ "รหัส" หรือ "code"');
      setRows(parsed);
    } catch (e) { setError(e.message || 'อ่านไฟล์ไม่ได้'); }
    finally { setParsing(false); }
  };

  const apply = async () => {
    setParsing(true);
    try {
      const n = await bulkUpsertDrugReorderConfig(rows, auth);
      onImported(n);
      onClose();
    } catch (e) { setError(e.message || 'บันทึกไม่สำเร็จ'); }
    finally { setParsing(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-5 py-3.5 rounded-t-2xl flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2"><Upload size={16}/> Import Master ยา</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X size={20}/></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-800">
            <p className="font-bold mb-1">รองรับไฟล์ "วิเคราะห์สั่งซื้อ" จาก Excel โดยตรง</p>
            <p className="text-indigo-700">ใช้คอลัมน์ รหัส · กลุ่ม VEN · ตัดออก/สั่งเมื่อขอ เป็นหลัก (ราคา/บริษัท/LT คำนวณสดจากบิลรับเข้า) — ข้ามแถวหัวตารางให้อัตโนมัติ</p>
          </div>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="block w-full text-sm border border-slate-300 rounded-lg p-2 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-indigo-600 file:text-white"/>
          {parsing && <p className="text-slate-500 flex items-center gap-1.5"><Loader2 size={14} className="animate-spin"/> กำลังประมวลผล…</p>}
          {error && <p className="text-rose-600 text-xs">{error}</p>}
          {rows.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 sticky top-0">
                  <tr><th className="px-2 py-1.5 text-left">รหัส</th><th className="px-2 py-1.5 text-left">ชื่อ</th><th className="px-2 py-1.5 text-left">บริษัท</th><th className="px-2 py-1.5 text-right">LT</th><th className="px-2 py-1.5 text-right">ราคา</th></tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1 font-mono">{r.code}</td>
                      <td className="px-2 py-1 truncate max-w-[160px]">{r.name || '—'}</td>
                      <td className="px-2 py-1">{r.supplier || '—'}</td>
                      <td className="px-2 py-1 text-right">{r.lead_time_days}</td>
                      <td className="px-2 py-1 text-right">{fmtBaht(r.price_per_unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 100 && <p className="text-center text-xs text-slate-400 py-1.5">…และอีก {rows.length - 100} รายการ</p>}
            </div>
          )}
        </div>
        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={apply} disabled={rows.length === 0 || parsing} className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-1.5">
            {parsing ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
            Import {rows.length > 0 && `(${rows.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main App
// ────────────────────────────────────────────────────────────
export default function ReorderApp({ onRefresh, auth = {} }) {
  // ── Filters / control state ──
  const [statsFrom, setStatsFrom] = useState(isoMonthsAgo(4));
  const [statsTo,   setStatsTo]   = useState(isoPrevMonthEnd());
  const [excludedMonth, setExcludedMonth] = useState('');
  const [leadDefault,   setLeadDefault]   = useState(DEFAULT_LEAD_TIME);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);
  const [drugNames, setDrugNames] = useState([]);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('dispense_logs').select('drug_name, drug_type').then(({ data }) => {
      if (!data) return;
      const typeMap = {};
      data.forEach(d => {
        if (d.drug_name && d.drug_type && d.drug_type !== '-') typeMap[d.drug_name] = d.drug_type;
      });
      const names = [...new Set(data.map(d => d.drug_name).filter(Boolean))].sort();
      setDrugNames(names.map(name => ({ name, type: typeMap[name] || '' })));
    });
  }, []);

  // ── Data ──
  const [inventory, setInventory] = useState({});
  const [configMap, setConfigMap] = useState({}); // code -> config
  const [receiptInfo, setReceiptInfo] = useState({}); // codeLower -> { unit, factor, supplier, pricePerUnit, receiveDate, leadTimeAvg }
  const [, setUsage] = useState({});              // raw usage cache (set for debugging)
  const [loadingData, setLoadingData] = useState(true);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');

  // ── Results ──
  const [result, setResult] = useState(null); // { rows, suppliers, totals }
  const [orderedMap, setOrderedMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reorder.ordered') || '{}'); }
    catch { return {}; }
  });

  // ── UI ──
  const [tab, setTab] = useState('analysis'); // analysis | supplier | verify | history
  const [editingDrug, setEditingDrug] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  // Initial fetch
  useEffect(() => {
    (async () => {
      setLoadingData(true);
      try {
        const [inv, cfg, receipt] = await Promise.all([fetchInventory(), fetchDrugReorderConfig(), fetchLatestReceiptInfo()]);
        setInventory(inv || {});
        setConfigMap(Object.fromEntries((cfg || []).map(c => [codeKey(c.code), c])));
        setReceiptInfo(receipt || {});
      } catch (e) { setRunError(e.message || 'โหลดข้อมูลไม่สำเร็จ'); }
      finally { setLoadingData(false); }
    })();
  }, []);

  // Stock + nearest expiry per code (derived from inventory)
  const stockInfo = useMemo(() => {
    const out = {}; // code -> { stock, nearestExpiryDays, name, unit, type }
    const now = new Date();
    Object.values(inventory).forEach(items => items.forEach(item => {
      const ck = codeKey(item.code);
      if (!ck) return;
      const qty = (parseFloat(String(item.qty ?? '0').replace(/,/g, '')) || 0) * parseUnitFactor(item.unit).factor; // → เม็ด
      if (!out[ck]) out[ck] = { stock: 0, nearestExpiryDays: null, name: item.name || '', unit: item.unit || '', type: item.type || '', rawCode: item.code };
      out[ck].stock += qty;
      if (qty > 0) {
        const exp = parseExpToDate(item.exp);
        if (exp) {
          const days = Math.floor((exp - now) / 86400000);
          if (out[ck].nearestExpiryDays == null || days < out[ck].nearestExpiryDays) {
            out[ck].nearestExpiryDays = days;
          }
        }
      }
      if (!out[ck].name && item.name) out[ck].name = item.name;
    }));
    return out;
  }, [inventory]);

  // Month list for selected range
  const monthsInRange = useMemo(() => listMonthYM(statsFrom, statsTo), [statsFrom, statsTo]);

  const runAnalysis = useCallback(async () => {
    if (statsFrom > statsTo) { setRunError('ช่วงสถิติไม่ถูกต้อง'); return; }
    setRunning(true); setRunError('');
    try {
      const u = await fetchMonthlyDispenseUsage(statsFrom, statsTo);
      setUsage(u);
      // Build payload again with fresh usage
      const allCodes = new Set([...Object.keys(stockInfo), ...Object.keys(u)]);
      // re-key receipt info ด้วย codeKey ให้ตรงกับ stockInfo (กัน sci-notation / leading zero)
      const receiptByCk = {};
      for (const [k, v] of Object.entries(receiptInfo)) receiptByCk[codeKey(k)] = v;
      const arr = [];
      for (const ck of allCodes) {
        const info = stockInfo[ck] || {};
        const ur = u[ck];
        const cfg = configMap[ck] || {};
        const rc = receiptByCk[ck] || {};
        // stock + usage เก็บเป็นเม็ด → แปลงเป็นหน่วยซื้อล่าสุด (pack) ก่อนคำนวณ
        // ตัวหาร = factor หน่วยซื้อล่าสุด (fallback: หน่วย inventory → pack_size → 1)
        const packFactor = rc.factor || parseUnitFactor(info.unit).factor || parseFloat(cfg.pack_size) || 1;
        const toPack = (qtyBase) => packFactor > 0 ? qtyBase / packFactor : qtyBase;
        const monthlyUsage = monthsInRange
          .filter(mm => mm !== excludedMonth)
          .map(mm => toPack(ur?.months?.[mm] || 0));
        arr.push({
          code: info.rawCode || ck,
          name: cfg.name || info.name || ur?.name || '',
          monthlyUsage,
          stock: toPack(info.stock || 0),
          leadTimeDays: cfg.lead_time_days ?? (rc.leadTimeAvg > 0 ? rc.leadTimeAvg : leadDefault),
          riskGroup: cfg.risk_group || null,   // ว่าง → null เพื่อให้ถึง default 1.5 (ดู docs/adr/0002)
          excludeStatus: cfg.exclude_status || null,
          pricePerUnit: rc.pricePerUnit || parseFloat(cfg.price_per_unit) || 0,
          supplier: rc.supplier || cfg.supplier || '',
          nearestExpiryDays: info.nearestExpiryDays,
          unit: rc.unit || info.unit, type: info.type, _ck: ck,
          packFactor, receiveDate: rc.receiveDate || null,
        });
      }
      const out = analyzeBatch(arr);
      // attach unit/type/packFactor/receiveDate back
      const ckMeta = Object.fromEntries(arr.map(d => [d._ck, d]));
      out.rows = out.rows.map(r => {
        const m = ckMeta[codeKey(r.code)] || {};
        return { ...r, unit: m.unit, type: m.type, nearestExpiryDays: m.nearestExpiryDays, packFactor: m.packFactor || 1, receiveDate: m.receiveDate || null };
      });
      out.reorderRows = out.rows.filter(r => r.orderQty > 0).length;
      setResult(out);
      await logReorderAction('analysis_view', {
        mode: 'normal', stats_from: statsFrom, stats_to: statsTo,
        total_rows: out.rows.length, reorder_rows: out.reorderRows,
        total_amount: out.totals.totalAmount,
      }, auth);
    } catch (e) { setRunError(e.message || 'รันวิเคราะห์ไม่สำเร็จ'); }
    finally { setRunning(false); }
  }, [statsFrom, statsTo, excludedMonth, leadDefault, stockInfo, configMap, receiptInfo, monthsInRange, auth]);

  // Auto-run when initial data loaded
  useEffect(() => {
    if (!loadingData && !result) runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingData]);

  const toggleOrdered = useCallback(async (code) => {
    const ck = codeKey(code);
    const now = orderedMap[ck];
    const next = { ...orderedMap };
    if (now) { delete next[ck]; }
    else { next[ck] = todayIso(); }
    setOrderedMap(next);
    localStorage.setItem('reorder.ordered', JSON.stringify(next));
    await logReorderAction(now ? 'unmark_ordered' : 'mark_ordered', { code }, auth);
  }, [orderedMap, auth]);

  const onMasterSaved = useCallback(async (config) => {
    await upsertDrugReorderConfig(config, auth);
    setConfigMap(prev => ({ ...prev, [codeKey(config.code)]: { ...config } }));
  }, [auth]);

  const onMasterImported = useCallback(async (count) => {
    const cfg = await fetchDrugReorderConfig();
    setConfigMap(Object.fromEntries((cfg || []).map(c => [codeKey(c.code), c])));
    alert(`Import สำเร็จ ${count} รายการ`);
  }, []);

  const saveSnapshot = useCallback(async () => {
    if (!result) return;
    try {
      const id = await saveAnalysisRun({
        mode: 'normal', stats_from: statsFrom, stats_to: statsTo,
        excluded_month: excludedMonth || null,
        lead_time_default: leadDefault,
        snapshot_date: todayIso(),
        total_rows: result.rows.length,
        reorder_rows: result.reorderRows,
        total_amount: result.totals.totalAmount,
        summary: { byStatus: result.totals.byStatus, supplierCount: result.suppliers.length },
        results: result.rows,
      }, auth);
      alert(`บันทึก Snapshot สำเร็จ (ID #${id})`);
    } catch (e) { alert('บันทึก Snapshot ไม่สำเร็จ: ' + (e.message || e)); }
  }, [result, statsFrom, statsTo, excludedMonth, leadDefault, auth]);

  // Filtered rows based on search + status filter
  const filteredRows = useMemo(() => {
    if (!result) return [];
    const q = search.trim().toLowerCase();
    return result.rows.filter(r => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (q) {
        const hit = (r.code || '').toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [result, search, statusFilter]);

  // Status counts (always from unfiltered)
  const statusCounts = useMemo(() => {
    if (!result) return {};
    return result.totals.byStatus || {};
  }, [result]);

  // ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 pb-20">
      {/* Title bar — sidebar (AppShell) คุม navigation; เหลือ title + action */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-orange-100 text-orange-600 shrink-0"><ShoppingCart size={18}/></div>
            <button onClick={onRefresh} className="text-left hover:opacity-70 transition-opacity" title="คลิกเพื่อโหลดใหม่">
              <h1 className="text-base sm:text-lg font-bold leading-tight text-slate-800">ระบบวิเคราะห์การสั่งซื้อยา</h1>
              <p className="text-xs text-slate-400">คำนวณ ROP · Safety Stock · ใบสั่งซื้อแยกบริษัท · ตามสูตรจาก Excel "วิเคราะห์สั่งซื้อ"</p>
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors">
              <Upload size={14}/> Import Master
            </button>
            <button onClick={saveSnapshot} disabled={!result || running} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors">
              <Save size={14}/> บันทึก Snapshot
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 space-y-4">
        {/* Control Bar */}
        <ControlBar
          {...{ statsFrom, setStatsFrom, statsTo, setStatsTo, excludedMonth, setExcludedMonth, leadDefault, setLeadDefault, search, setSearch, drugNames, monthsInRange, running, onRun: runAnalysis }}
        />

        {runError && (
          <div className="bg-rose-50 border border-rose-300 text-rose-800 rounded-xl p-3 text-sm flex items-center gap-2">
            <ShieldAlert size={16}/> {runError}
          </div>
        )}

        {/* Status Strip */}
        {result && (
          <StatusStrip
            counts={statusCounts}
            total={result.rows.length}
            reorderRows={result.reorderRows}
            totalAmount={result.totals.totalAmount}
            active={statusFilter}
            onPick={(s) => setStatusFilter(s === statusFilter ? null : s)}
          />
        )}

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex border-b border-slate-200 overflow-x-auto bg-gradient-to-r from-slate-50 to-white">
            <TabBtn id="analysis" cur={tab} set={setTab} icon={<ListChecks size={14}/>}>ตารางวิเคราะห์</TabBtn>
            <TabBtn id="supplier" cur={tab} set={setTab} icon={<Building2 size={14}/>}>ใบสั่งซื้อแยกบริษัท {result?.suppliers?.length ? `(${result.suppliers.length})` : ''}</TabBtn>
            <TabBtn id="verify"   cur={tab} set={setTab} icon={<ShieldAlert size={14}/>}>Verification</TabBtn>
            <TabBtn id="history"  cur={tab} set={setTab} icon={<History size={14}/>}>History</TabBtn>
          </div>

          <div className="p-3 sm:p-5">
            {loadingData ? (
              <LoadingState text="กำลังโหลดข้อมูลคลัง + Master…"/>
            ) : running && !result ? (
              <LoadingState text="กำลังคำนวณ…"/>
            ) : !result ? (
              <EmptyState text="ยังไม่มีผลการวิเคราะห์ — กด 'รันวิเคราะห์'"/>
            ) : tab === 'analysis' ? (
              <AnalysisTab
                rows={filteredRows}
                orderedMap={orderedMap} toggleOrdered={toggleOrdered}
                onEdit={setEditingDrug} auth={auth}
              />
            ) : tab === 'supplier' ? (
              <SupplierTab suppliers={result.suppliers} totalAmount={result.totals.totalAmount} auth={auth}/>
            ) : tab === 'verify' ? (
              <VerifyTab/>
            ) : (
              <HistoryTab auth={auth}/>
            )}
          </div>
        </div>
      </div>

      <MasterEditModal open={!!editingDrug} drug={editingDrug} onClose={() => setEditingDrug(null)} onSave={onMasterSaved}/>
      <ImportMasterModal open={importOpen} onClose={() => setImportOpen(false)} onImported={onMasterImported} auth={auth}/>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────
function ControlBar({ statsFrom, setStatsFrom, statsTo, setStatsTo, excludedMonth, setExcludedMonth, leadDefault, setLeadDefault, search, setSearch, drugNames, monthsInRange, running, onRun }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-3 sm:p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1"><Calendar size={11}/> ช่วงสถิติ (จาก)</label>
          <IsoDateInput value={statsFrom} onChange={setStatsFrom} className="w-full"/>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1"><Calendar size={11}/> ถึง</label>
          <IsoDateInput value={statsTo} onChange={setStatsTo} className="w-full"/>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Lead Time default (วัน)</label>
          <input type="number" min="1" step="0.5" value={leadDefault} onChange={(e) => setLeadDefault(parseFloat(e.target.value) || DEFAULT_LEAD_TIME)}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"/>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1"><Search size={11}/> ค้นหา</label>
          <DrugSearchBar
            value={search}
            onChange={setSearch}
            options={drugNames}
            placeholder="พิมพ์ชื่อยา/รหัส เช่น Atorvastatin หรือ ATOR40"
            ringClass="focus:ring-orange-400"
            hoverClass="hover:bg-orange-50"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">เดือนตัดออก (ช่วง Refill)</label>
          <select value={excludedMonth} onChange={(e) => setExcludedMonth(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="">— ไม่ตัด —</option>
            {monthsInRange.map(m => <option key={m} value={m}>{thaiMonthLabel(m)}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onRun} disabled={running} className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm">
          {running ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
          รันวิเคราะห์
        </button>
      </div>
    </div>
  );
}

function StatusStrip({ counts, total, reorderRows, totalAmount, active, onPick }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-3 sm:p-4">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {STATUS_ORDER.map(s => (
          <StatusChip key={s} status={s} count={counts[s] || 0} active={active === s} onClick={() => onPick(s)}/>
        ))}
        {active && (
          <button onClick={() => onPick(active)} className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 flex items-center gap-1">
            <X size={12}/> ล้าง filter
          </button>
        )}
      </div>
      <div className="flex items-center gap-4 text-xs sm:text-sm text-slate-600 flex-wrap pt-3 border-t border-slate-100">
        <span>ทั้งหมด <b className="text-slate-800">{fmtNum(total)}</b> รายการ</span>
        <span className="text-orange-700">ต้องสั่ง <b>{fmtNum(reorderRows)}</b> รายการ</span>
        <span className="text-emerald-700">มูลค่ารวม <b>฿{fmtBaht(totalAmount)}</b></span>
      </div>
    </div>
  );
}

function TabBtn({ id, cur, set, icon, children }) {
  const active = cur === id;
  return (
    <button onClick={() => set(id)} className={`flex items-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-colors
      ${active ? 'border-orange-600 text-orange-700 bg-orange-50' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>
      {icon} {children}
    </button>
  );
}

function LoadingState({ text }) {
  return <div className="flex flex-col items-center justify-center py-16 text-slate-500"><Loader2 size={28} className="animate-spin mb-2 text-orange-500"/><p className="text-sm">{text}</p></div>;
}

function EmptyState({ text }) {
  return <div className="flex flex-col items-center justify-center py-16 text-slate-400"><Database size={32} className="mb-2"/><p className="text-sm">{text}</p></div>;
}

// ────────────────────────────────────────────────────────────
// Analysis tab — table (desktop) + cards (mobile)
// ────────────────────────────────────────────────────────────
function AnalysisTab({ rows, orderedMap, toggleOrdered, onEdit, auth }) {
  const [sortBy, setSortBy] = useState('status'); // status | amount | gap
  const [exporting, setExporting] = useState(false);

  const sorted = useMemo(() => {
    const arr = [...rows];
    if (sortBy === 'amount') arr.sort((a, b) => b.amount - a.amount);
    else if (sortBy === 'gap') arr.sort((a, b) => (a.stock - a.rop) - (b.stock - b.rop));
    else arr.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.amount - a.amount);
    return arr;
  }, [rows, sortBy]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await exportToExcel(sorted, [
        { header: 'รหัส',  key: 'code' },
        { header: 'ชื่อยา', key: 'name' },
        { header: 'VEN',  value: r => venLetter(r.riskGroup) },
        { header: 'หน่วยซื้อ', key: 'unit' },
        { header: 'บริษัทล่าสุด', key: 'supplier' },
        { header: 'วันรับล่าสุด', value: r => fmtThaiDate(r.receiveDate) },
        { header: 'Max',   value: r => Math.round(r.max) },
        { header: 'Avg/mo', value: r => Math.round(r.avgMonth) },
        { header: 'Avg/d',  value: r => Math.round(r.avgDay * 100) / 100 },
        { header: 'คงเหลือ', value: r => Math.round(r.stock) },
        { header: 'คงอยู่ได้อีก', value: r => fmtCoverage(r.stock, r.avgDay) },
        { header: 'SS',    key: 'ss' },
        { header: 'ROP',   key: 'rop' },
        { header: 'คงเหลือ−ROP', value: r => Math.round(r.stock - r.rop) },
        { header: 'Lead Time', value: r => Math.round((r.leadTimeDays || 0) * 100) / 100 },
        { header: 'ต้องซื้อ(หน่วยซื้อ)',  value: r => Math.round(r.orderQty) },
        { header: 'ต้องซื้อ(เม็ด)', value: r => Math.round(r.orderQty * (r.packFactor || 1)) },
        { header: 'ราคา/หน่วยซื้อ', key: 'pricePerUnit' },
        { header: 'มูลค่า',     key: 'amount' },
        { header: 'สถานะ',     key: 'status' },
        { header: 'หมดอายุ (วัน)', key: 'nearestExpiryDays' },
      ], 'reorder', `วิเคราะห์สั่งซื้อ_${todayIso()}.xlsx`, auth);
    } finally { setExporting(false); }
  };

  if (rows.length === 0) return <EmptyState text="ไม่มีรายการตรงกับ filter"/>;
  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">เรียง:</span>
          {[
            { v: 'status', l: 'สถานะ' },
            { v: 'amount', l: 'มูลค่า' },
            { v: 'gap', l: 'ช่องว่าง ROP' },
          ].map(o => (
            <button key={o.v} onClick={() => setSortBy(o.v)} className={`px-2.5 py-1 rounded-md ${sortBy === o.v ? 'bg-orange-100 text-orange-700 font-semibold' : 'text-slate-500 hover:bg-slate-100'}`}>{o.l}</button>
          ))}
        </div>
        <button onClick={exportCsv} disabled={exporting} className="flex items-center gap-1.5 text-xs sm:text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg font-medium">
          {exporting ? <Loader2 size={13} className="animate-spin"/> : <FileSpreadsheet size={13}/>} Export Excel
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-700 text-white sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold sticky left-0 bg-slate-700 z-20">รายการยา</th>
              <th className="px-3 py-2.5 text-center font-semibold">Risk</th>
              <th className="px-3 py-2.5 text-right font-semibold">Max</th>
              <th className="px-3 py-2.5 text-right font-semibold">Avg/mo</th>
              <th className="px-3 py-2.5 text-right font-semibold">คงเหลือ</th>
              <th className="px-3 py-2.5 text-right font-semibold bg-rose-800">SS</th>
              <th className="px-3 py-2.5 text-right font-semibold bg-orange-800">ROP</th>
              <th className="px-3 py-2.5 text-right font-semibold">คงเหลือ−ROP</th>
              <th className="px-3 py-2.5 text-right font-semibold bg-cyan-800">ต้องซื้อ</th>
              <th className="px-3 py-2.5 text-right font-semibold bg-emerald-800">มูลค่า</th>
              <th className="px-3 py-2.5 text-center font-semibold">สถานะ</th>
              <th className="px-3 py-2.5 text-center font-semibold">⚙</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => <AnalysisRow key={r.code + i} r={r} ordered={!!orderedMap[codeKey(r.code)]} toggleOrdered={() => toggleOrdered(r.code)} onEdit={() => onEdit({ code: r.code, name: r.name, supplier: r.supplier, risk_group: r.riskGroup, lead_time_days: r.leadTimeDays, price_per_unit: r.pricePerUnit })}/>)}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {sorted.map((r, i) => <AnalysisCard key={r.code + i} r={r} ordered={!!orderedMap[codeKey(r.code)]} toggleOrdered={() => toggleOrdered(r.code)} onEdit={() => onEdit({ code: r.code, name: r.name, supplier: r.supplier, risk_group: r.riskGroup, lead_time_days: r.leadTimeDays, price_per_unit: r.pricePerUnit })}/>)}
      </div>
    </>
  );
}

function AnalysisRow({ r, ordered, toggleOrdered, onEdit }) {
  const meta = STATUS_META[r.status] || STATUS_META[STATUS.SUFFICIENT];
  const tone = TONE_CLASSES[meta.tone];
  const Icon = meta.icon;
  const gap = r.stock - r.rop;
  return (
    <tr className={`border-t border-slate-100 ${ordered ? 'bg-emerald-50/40 opacity-70' : 'hover:bg-slate-50'}`}>
      <td className="px-3 py-2.5 sticky left-0 z-10 bg-inherit">
        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
          {ordered && <CheckCircle2 size={13} className="text-emerald-600"/>}
          <span className={ordered ? 'line-through text-slate-400' : ''}>{r.name || '-'}</span>
        </div>
        <div className="text-xs text-slate-400 font-mono">{r.code}{r.unit ? ` · ${r.unit}` : ''}{r.supplier ? ` · ${r.supplier}` : ''}{r.receiveDate ? ` · รับ ${fmtThaiDate(r.receiveDate)}` : ''}</div>
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${r.riskGroup === 'Critical' ? 'bg-rose-50 border-rose-200 text-rose-700' : r.riskGroup === 'Normal' ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>{venLetter(r.riskGroup)}</span>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(r.max)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmtNum(r.avgMonth)}</td>
      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
        <div>{fmtNum(r.stock)}</div>
        <div className="text-[10px] font-normal text-slate-400">อยู่ได้ {fmtCoverage(r.stock, r.avgDay)}</div>
        {r.rop > 0 && (
          <div className="w-20 bg-slate-200 rounded-full h-1 mt-1 ml-auto">
            <div className={`h-1 rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, (r.stock / r.rop) * 100)}%` }}/>
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-rose-700 font-semibold">{fmtNum(r.ss)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-orange-700 font-semibold">{fmtNum(r.rop)}</td>
      <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${gap < 0 ? 'text-rose-600' : 'text-slate-500'}`}>{fmtNum(gap)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums font-bold">
        {r.orderQty > 0 ? (
          <>
            <span className="text-cyan-700">{fmtNum(r.orderQty)}</span>
            {(r.packFactor || 1) > 1 && <div className="text-[10px] font-normal text-slate-400">{fmtNum(r.orderQty * r.packFactor)} {parseUnitFactor(r.unit).base}</div>}
          </>
        ) : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {r.amount > 0 ? <span className="font-bold text-emerald-700">฿{fmtBaht(r.amount)}</span> : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className={`inline-flex items-center gap-1 ${tone.chip} px-2 py-0.5 rounded-full text-[11px] font-semibold border`}>
          <Icon size={11}/> {r.status}
        </span>
        {gap < 0 && r.orderQty > 0 && <div className="text-[10px] text-rose-600 mt-0.5">ขาด {fmtNum(-gap)}</div>}
      </td>
      <td className="px-3 py-2.5 text-center">
        <div className="flex items-center justify-center gap-1">
          <button onClick={toggleOrdered} title={ordered ? 'ยกเลิกการสั่ง' : 'สั่งแล้ว'}
            className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${ordered ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:bg-emerald-50 hover:border-emerald-400'}`}>
            {ordered && <CheckCircle2 size={12}/>}
          </button>
          <button onClick={onEdit} title="แก้ Master" className="w-6 h-6 rounded-md border border-slate-300 hover:bg-orange-50 hover:border-orange-400 flex items-center justify-center text-slate-500 hover:text-orange-700">
            <Pencil size={11}/>
          </button>
        </div>
      </td>
    </tr>
  );
}

function AnalysisCard({ r, ordered, toggleOrdered, onEdit }) {
  const meta = STATUS_META[r.status] || STATUS_META[STATUS.SUFFICIENT];
  const tone = TONE_CLASSES[meta.tone];
  const Icon = meta.icon;
  return (
    <div className={`bg-white border rounded-xl p-3 shadow-sm ${ordered ? 'border-emerald-200 opacity-75' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className={`font-bold text-sm leading-tight ${ordered ? 'line-through text-slate-400' : 'text-slate-800'}`}>{r.name || '-'}</div>
          <div className="text-[11px] text-slate-400 font-mono">{r.code}{r.unit ? ` · ${r.unit}` : ''}{r.supplier ? ` · ${r.supplier}` : ''}</div>
        </div>
        <span className={`inline-flex items-center gap-1 ${tone.chip} px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap`}>
          <Icon size={10}/> {r.status}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 text-center mb-2">
        <Stat label="คงเหลือ"  value={fmtNum(r.stock)}/>
        <Stat label="SS"      value={fmtNum(r.ss)}    tone="rose"/>
        <Stat label="ROP"     value={fmtNum(r.rop)}   tone="orange"/>
        <Stat label="ต้องซื้อ" value={r.orderQty > 0 ? fmtNum(r.orderQty) : '—'} tone="cyan"/>
      </div>
      <div className="text-[10px] text-slate-400 mb-2">
        อยู่ได้ {fmtCoverage(r.stock, r.avgDay)}
        {(r.packFactor || 1) > 1 && r.orderQty > 0 ? ` · สั่ง ${fmtNum(r.orderQty * r.packFactor)} ${parseUnitFactor(r.unit).base}` : ''}
        {r.receiveDate ? ` · รับ ${fmtThaiDate(r.receiveDate)}` : ''}
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
        <div className="text-sm">
          {r.amount > 0 ? <span className="font-bold text-emerald-700">฿{fmtBaht(r.amount)}</span> : <span className="text-slate-400 text-xs">ไม่ต้องสั่ง</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={toggleOrdered} className={`px-2.5 py-1 rounded-md text-xs font-medium ${ordered ? 'bg-emerald-500 text-white' : 'bg-slate-100 hover:bg-emerald-100 text-slate-600'}`}>
            {ordered ? '✓ สั่งแล้ว' : 'สั่งแล้ว'}
          </button>
          <button onClick={onEdit} className="w-7 h-7 rounded-md border border-slate-300 hover:bg-orange-50 flex items-center justify-center text-slate-500">
            <Pencil size={11}/>
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'slate' }) {
  const t = TONE_CLASSES[tone] || TONE_CLASSES.slate;
  return (
    <div className="bg-slate-50 rounded-md px-1.5 py-1.5">
      <div className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">{label}</div>
      <div className={`text-sm font-black tabular-nums ${t.text}`}>{value}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Supplier tab
// ────────────────────────────────────────────────────────────
function SupplierTab({ suppliers, totalAmount, auth }) {
  if (!suppliers || suppliers.length === 0) return <EmptyState text="ไม่มีรายการที่ต้องสั่งซื้อ"/>;
  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm flex items-center justify-between flex-wrap gap-2">
        <span className="text-emerald-800"><b>{suppliers.length}</b> บริษัท · <b>{suppliers.reduce((s, g) => s + g.items.length, 0)}</b> รายการ</span>
        <span className="text-emerald-700">มูลค่ารวม <b className="text-base">฿{fmtBaht(totalAmount)}</b></span>
      </div>
      {suppliers.map((g, i) => <SupplierCard key={i} group={g} auth={auth}/>)}
    </div>
  );
}

function SupplierCard({ group, auth }) {
  const [expanded, setExpanded] = useState(true);
  const exportOne = async () => {
    await exportToExcel(group.items, [
      { header: 'รหัส', key: 'code' },
      { header: 'ชื่อยา', key: 'name' },
      { header: 'หน่วยซื้อ', key: 'unit' },
      { header: 'บริษัทล่าสุด', key: 'supplier' },
      { header: 'คงเหลือ', value: r => Math.round(r.stock) },
      { header: 'ROP', key: 'rop' },
      { header: 'ต้องซื้อ(หน่วยซื้อ)', value: r => Math.round(r.orderQty) },
      { header: 'ต้องซื้อ(เม็ด)', value: r => Math.round(r.orderQty * (r.packFactor || 1)) },
      { header: 'ราคา/หน่วยซื้อ', key: 'pricePerUnit' },
      { header: 'มูลค่า', key: 'amount' },
    ], group.supplier, `PO_${group.supplier.replace(/\s+/g, '_')}_${todayIso()}.xlsx`, auth);
  };

  const printPo = () => {
    const rows = group.items.map((it, i) => `
      <tr>
        <td>${i + 1}</td><td>${it.code || '-'}</td><td>${it.name || '-'}</td>
        <td class="r">${fmtNum(it.stock)}</td><td class="r">${fmtNum(it.rop)}</td>
        <td class="r"><b>${fmtNum(it.orderQty)}</b></td>
        <td class="r">${fmtBaht(it.pricePerUnit)}</td>
        <td class="r"><b>${fmtBaht(it.amount)}</b></td>
      </tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>ใบสั่งซื้อ ${group.supplier}</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Sarabun', sans-serif; padding: 24px; color: #0f172a; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        h2 { font-size: 14px; color: #475569; margin: 0 0 16px; font-weight: 500; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; }
        th { background: #f1f5f9; text-align: left; }
        .r { text-align: right; }
        tfoot td { background: #fef3c7; font-weight: bold; }
        .sign { margin-top: 40px; display: flex; justify-content: space-around; font-size: 12px; }
        .sign div { text-align: center; width: 200px; border-top: 1px dashed #94a3b8; padding-top: 4px; }
      </style></head><body>
      <h1>ใบสั่งซื้อยา — ${group.supplier}</h1>
      <h2>วันที่ ${fmtDateTimeThai(new Date().toISOString())} · ${group.items.length} รายการ · มูลค่ารวม ฿${fmtBaht(group.totalAmount)}</h2>
      <table>
        <thead><tr><th>ลำดับ</th><th>รหัส</th><th>ชื่อยา</th><th class="r">คงเหลือ</th><th class="r">ROP</th><th class="r">ต้องซื้อ</th><th class="r">ราคา/หน่วย</th><th class="r">มูลค่า</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="5" class="r">รวม</td><td class="r">${fmtNum(group.totalQty)}</td><td></td><td class="r">฿${fmtBaht(group.totalAmount)}</td></tr></tfoot>
      </table>
      <div class="sign"><div>ผู้สั่งซื้อ</div><div>ผู้อนุมัติ</div></div>
      <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
      </body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (w) setTimeout(() => URL.revokeObjectURL(url), 60_000);
    logReorderAction('print_po', { supplier: group.supplier, items: group.items.length, amount: group.totalAmount }, auth);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <button onClick={() => setExpanded(v => !v)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-orange-600"/>
          <span className="font-bold text-slate-800">{group.supplier}</span>
          <span className="text-xs text-slate-500">· {group.items.length} รายการ</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-emerald-700">฿{fmtBaht(group.totalAmount)}</span>
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}/>
        </div>
      </button>
      {expanded && (
        <>
          <div className="border-t border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">รหัส / ชื่อยา</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">คงเหลือ</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">ROP</th>
                  <th className="px-3 py-2 text-right font-semibold text-cyan-700">ต้องซื้อ</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">฿/หน่วย</th>
                  <th className="px-3 py-2 text-right font-semibold text-emerald-700">มูลค่า</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((it, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-700">{it.name || '-'}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{it.code}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(it.stock)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-orange-700">{fmtNum(it.rop)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-cyan-700">{fmtNum(it.orderQty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmtBaht(it.pricePerUnit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700">฿{fmtBaht(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-amber-50">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right font-bold text-slate-700">รวม</td>
                  <td className="px-3 py-2 text-right font-bold text-cyan-700 tabular-nums">{fmtNum(group.totalQty)}</td>
                  <td></td>
                  <td className="px-3 py-2 text-right font-black text-emerald-700 tabular-nums text-sm">฿{fmtBaht(group.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="border-t border-slate-200 px-4 py-2.5 flex items-center justify-end gap-2 bg-slate-50 rounded-b-2xl">
            <button onClick={exportOne} className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-medium">
              <FileSpreadsheet size={12}/> Export Excel
            </button>
            <button onClick={printPo} className="flex items-center gap-1.5 text-xs bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg font-medium">
              <Printer size={12}/> พิมพ์ใบสั่งซื้อ
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Verification tab — run golden tests inline
// ────────────────────────────────────────────────────────────
function VerifyTab() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const runTests = useCallback(() => {
    setRunning(true);
    const cases = [];
    const assert = (label, actual, expected) => {
      const ok = typeof expected === 'number' && typeof actual === 'number'
        ? Math.abs(actual - expected) < 1e-3 : actual === expected;
      cases.push({ label, actual, expected, ok });
    };

    // Test 1: Atorvastatin (สูตร Excel — SS ฐาน 30, factor 2.3)
    const r1 = analyzeDrug({
      code: 'ATOR40', name: 'Atorvastatin 40mg',
      monthlyUsage: [2833, 1477, 1960, 2603], stock: 4400,
      leadTimeDays: 15.5, riskGroup: 'Essential', pricePerUnit: 33.30,
    });
    assert('Atorvastatin · Max', r1.max, 2833);
    assert('Atorvastatin · Avg/mo', r1.avgMonth, 2218.25);
    assert('Atorvastatin · SS', r1.ss, 3327);
    assert('Atorvastatin · ROP', r1.rop, 4473);
    assert('Atorvastatin · V', r1.orderQty, 1266);
    assert('Atorvastatin · Amount', r1.amount, 42157.80);
    assert('Atorvastatin · Status', r1.status, STATUS.REORDER);

    // Test 2: Excluded
    const r2 = analyzeDrug({ code: 'X', monthlyUsage: [100,100,100,100], stock: 100, excludeStatus: STATUS.EXCLUDED });
    assert('ตัดออก · V=0', r2.orderQty, 0);

    // Test 3: Out of stock
    const r3 = analyzeDrug({ code: 'X', monthlyUsage: [100,100,100,100], stock: 0 });
    assert('หมดสต็อค · status', r3.status, STATUS.OUT_OF_STOCK);

    // Test 4: Acetaminophen syrup — Excel reference (SS=506, ROP=686)
    const r4 = analyzeDrug({
      code: 'PARA-SYR', name: 'Acetaminophen 120mg/5ml',
      monthlyUsage: [337.5, 337.5, 337.5, 337.5], stock: 900,
      leadTimeDays: 16, riskGroup: 'Essential',
    });
    assert('Para syrup · SS = 506', r4.ss, 506);
    assert('Para syrup · ROP = 686', r4.rop, 686);
    assert('Para syrup · status = เพียงพอ', r4.status, STATUS.SUFFICIENT);

    // Test 5: Edge case (no usage)
    const r5 = analyzeDrug({ code: 'X', monthlyUsage: [0,0,0,0], stock: 0 });
    assert('ไม่เคยเบิก · V = 1 (fallback)', r5.orderQty, 1);
    assert('ไม่เคยเบิก · SS = 1', r5.ss, 1);

    // Test 6: Lidocaine (แถวจริง Excel) — round avgDay 4 ตำแหน่ง
    const r6 = analyzeDrug({
      code: 'LIDO', name: 'Lidocaine',
      monthlyUsage: [100, 0, 0, 0], stock: 0, leadTimeDays: 20, riskGroup: 'Essential',
    });
    assert('Lidocaine · SS = 37 (ไม่ใช่ 38)', r6.ss, 37);
    assert('Lidocaine · ROP = 54 (ไม่ใช่ 55)', r6.rop, 54);
    assert('Lidocaine · V = 200', r6.orderQty, 200);

    // Test 7: VEN ว่าง → default 1.5 = Essential (ADR-0002)
    const rBlank = analyzeDrug({ code: 'B', monthlyUsage: [300,300,300,300], stock: 0, leadTimeDays: 15 });
    const rEss   = analyzeDrug({ code: 'E', monthlyUsage: [300,300,300,300], stock: 0, leadTimeDays: 15, riskGroup: 'Essential' });
    assert('VEN ว่าง · SS = Essential (×1.5)', rBlank.ss, rEss.ss);

    // SS ฐาน 30 ไม่ cap
    assert('SS Critical (avg/d=10) = 600', computeSafetyStock(10, 2.0), 600);

    setResults(cases);
    setRunning(false);
  }, []);

  const passCount = results ? results.filter(c => c.ok).length : 0;
  const failCount = results ? results.length - passCount : 0;

  return (
    <div className="space-y-3">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><ShieldAlert size={16}/> Golden Test Suite</h3>
            <p className="text-xs text-slate-500 mt-0.5">ทดสอบสูตรคำนวณตาม Excel reference — ต้องผ่าน 100% ก่อน trust ผลลัพธ์</p>
          </div>
          <button onClick={runTests} disabled={running} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5">
            {running ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>} Run tests
          </button>
        </div>
      </div>

      {results && (
        <div className={`rounded-xl border-2 p-3 ${failCount === 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'}`}>
          <div className="flex items-center gap-2 font-bold mb-2">
            {failCount === 0 ? <CheckCircle2 size={18} className="text-emerald-700"/> : <XCircle size={18} className="text-rose-700"/>}
            <span className={failCount === 0 ? 'text-emerald-800' : 'text-rose-800'}>
              {passCount} ผ่าน · {failCount} ล้มเหลว · จาก {results.length} cases
            </span>
          </div>
          <div className="space-y-1 text-xs font-mono max-h-96 overflow-auto">
            {results.map((c, i) => (
              <div key={i} className={`flex items-start gap-2 px-2 py-1 rounded ${c.ok ? 'text-emerald-700' : 'text-rose-700 bg-white border border-rose-200'}`}>
                <span>{c.ok ? '✓' : '✗'}</span>
                <span className="flex-1">{c.label}</span>
                {!c.ok && <span className="text-[10px]">expected {String(c.expected)} got {String(c.actual)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// History tab
// ────────────────────────────────────────────────────────────
function HistoryTab({ auth }) {
  const [runs, setRuns] = useState(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setRuns(await fetchAnalysisRuns(50)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const remove = async (id) => {
    if (!confirm('ลบ snapshot นี้ออกจากระบบ?')) return;
    await deleteAnalysisRun(id, auth);
    reload();
  };

  if (loading || runs == null) return <LoadingState text="กำลังโหลด history…"/>;
  if (runs.length === 0) return <EmptyState text="ยังไม่มี snapshot — กด 'บันทึก Snapshot' จากหน้าผลวิเคราะห์"/>;

  return (
    <div className="overflow-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-3 py-2 text-left">เวลา</th>
            <th className="px-3 py-2 text-left">โดย</th>
            <th className="px-3 py-2 text-center">โหมด</th>
            <th className="px-3 py-2 text-left">ช่วงสถิติ</th>
            <th className="px-3 py-2 text-right">รายการ</th>
            <th className="px-3 py-2 text-right">ต้องสั่ง</th>
            <th className="px-3 py-2 text-right">มูลค่า</th>
            <th className="px-3 py-2 text-center">⚙</th>
          </tr>
        </thead>
        <tbody>
          {runs.map(r => (
            <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2 text-slate-600">{fmtDateTimeThai(r.run_at)}</td>
              <td className="px-3 py-2 text-slate-600">{r.run_by || '-'}</td>
              <td className="px-3 py-2 text-center">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.mode === 'refill' ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'}`}>{r.mode}</span>
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">{r.stats_from} → {r.stats_to}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.total_rows)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-orange-700 font-semibold">{fmtNum(r.reorder_rows)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-semibold">฿{fmtBaht(r.total_amount)}</td>
              <td className="px-3 py-2 text-center">
                <button onClick={() => remove(r.id)} className="text-rose-500 hover:bg-rose-50 rounded p-1" title="ลบ">
                  <Trash2 size={13}/>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
