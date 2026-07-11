// StockLedgerApp — ทะเบียนคงคลังรายเดือน (Monthly Stock Ledger) — ADR-0007
// admin: ดู ledger ต่องวด + seed งวดตั้งต้นจาก master CSV + ปิด/เปิดงวด
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers, Upload, Lock, Unlock, RefreshCw, X, CheckCircle, AlertTriangle, Search, PlusCircle, FileDown,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react';
import {
  fetchLedgerPeriod, fetchLatestLedgerPeriod, bulkInsertLedgerRows,
  closeLedgerPeriod, reopenLedgerPeriod, addLedgerAdjustment,
} from './lib/db';
import { exportToExcel } from './lib/exportExcel';
import { seedFromMasterCsv } from './lib/ledgerSeed';
import BackButton from './BackButton';

const fmtBaht = (n) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const fmtNum = (n) => new Intl.NumberFormat('th-TH').format(n || 0);

// คอลัมน์ Excel ส่งบัญชี — ตรงกับตาราง (จำนวน 4 + มูลค่า 4) + หมวด ยา/มิใช่ยา
const LEDGER_EXCEL_COLS = [
  { header: 'รหัส', key: 'drug_code' },
  { header: 'ชื่อยา', key: 'drug_name' },
  { header: 'Lot', key: 'lot' },
  { header: 'ชนิดรายการ', key: 'item_type' },
  { header: 'หมวด', key: 'med_category' },
  { header: 'ราคา/หน่วย', value: (r) => Number(r.price_per_unit) || 0 },
  { header: 'ยกมา (จำนวน)', value: (r) => Number(r.opening_qty) || 0 },
  { header: 'เข้า', value: (r) => Number(r.in_qty) || 0 },
  { header: 'ออก', value: (r) => Number(r.out_qty) || 0 },
  { header: 'คงเหลือ', value: (r) => Number(r.closing_qty) || 0 },
  { header: 'ยกมา (บาท)', value: (r) => Number(r.carry_in_value) || 0 },
  { header: 'ซื้อ (บาท)', value: (r) => Number(r.in_value) || 0 },
  { header: 'เบิก (บาท)', value: (r) => Number(r.out_value) || 0 },
  { header: 'คงคลัง (บาท)', value: (r) => Number(r.closing_value) || 0 },
];

// 'YYYY-MM' → 'เดือน พ.ศ.' (เช่น 2026-06 → มิ.ย. 2569)
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function periodLabel(period) {
  if (!period) return '-';
  const [y, m] = period.split('-').map(Number);
  return `${TH_MONTHS[m - 1]} ${y + 543}`;
}

// คอลัมน์ตาราง ledger (key = field สำหรับ sort, align, กลุ่มจำนวน qty)
const LEDGER_TABLE_COLS = [
  { key: 'drug_code', label: 'รหัส', align: 'left' },
  { key: 'drug_name', label: 'ชื่อยา', align: 'left' },
  { key: 'lot', label: 'Lot', align: 'left' },
  { key: 'item_type', label: 'ชนิดรายการ', align: 'left' },
  { key: 'price_per_unit', label: 'ราคา/หน่วย', align: 'right' },
  { key: 'opening_qty', label: 'ยกมา (จำนวน)', align: 'right', qty: true },
  { key: 'in_qty', label: 'เข้า', align: 'right', qty: true },
  { key: 'out_qty', label: 'ออก', align: 'right', qty: true },
  { key: 'closing_qty', label: 'คงเหลือ', align: 'right', qty: true },
  { key: 'carry_in_value', label: 'ยกมา (บาท)', align: 'right' },
  { key: 'in_value', label: 'ซื้อ (บาท)', align: 'right' },
  { key: 'out_value', label: 'เบิก (บาท)', align: 'right' },
  { key: 'closing_value', label: 'คงคลัง (บาท)', align: 'right' },
];

// คอลัมน์ที่ sort แบบตัวเลข — ที่เหลือ sort แบบ string
const NUMERIC_KEYS = new Set(['price_per_unit', 'opening_qty', 'in_qty', 'out_qty', 'closing_qty', 'carry_in_value', 'in_value', 'out_value', 'closing_value']);

// หัวคอลัมน์คลิก sort ได้ + ไอคอนบอกทิศ
function SortTh({ col, sort, onSort }) {
  const active = sort.key === col.key;
  const Icon = !active ? ChevronsUpDown : (sort.dir === 'asc' ? ChevronUp : ChevronDown);
  return (
    <th className={`px-3 py-2 font-semibold whitespace-nowrap ${col.align === 'left' ? 'text-left' : 'text-right'} ${col.qty ? 'bg-slate-600' : ''}`}>
      <button
        onClick={() => onSort(col.key)}
        className={`inline-flex items-center gap-1 hover:text-teal-200 transition-colors ${col.align === 'right' ? 'flex-row-reverse' : ''}`}
        title="คลิกเพื่อเรียงลำดับ"
      >
        <span>{col.label}</span>
        <Icon size={13} className={active ? 'text-teal-300' : 'text-slate-400'} />
      </button>
    </th>
  );
}

// ────────────────────────────────────────────────────────────
// SeedModal — เลือก master CSV → preview tie-out → ยืนยัน seed
// ────────────────────────────────────────────────────────────
function SeedModal({ open, onClose, onSeeded, auth }) {
  const [parsing, setParsing] = useState(false);
  const [period, setPeriod] = useState('');
  const [preview, setPreview] = useState(null); // { rows, skipped, tieOut }
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setParsing(false); setPreview(null); setError(''); setSaving(false); };

  const handleFile = async (file) => {
    reset(); setParsing(true);
    try {
      const text = await file.text();
      if (!period || !/^\d{4}-\d{2}$/.test(period)) {
        setError('กรอกงวด (YYYY-MM) ก่อนเลือกไฟล์'); setParsing(false); return;
      }
      const result = seedFromMasterCsv(text, period);
      if (result.rows.length === 0) { setError('ไม่พบแถวข้อมูลในไฟล์ (รหัสยาว่างทั้งหมด?)'); setParsing(false); return; }
      setPreview(result);
    } catch (e) {
      setError('อ่านไฟล์ไม่สำเร็จ: ' + (e.message || e));
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setSaving(true); setError('');
    try {
      const n = await bulkInsertLedgerRows(preview.rows, auth);
      onSeeded(period, n);
      reset(); onClose();
    } catch (e) {
      setError(e.message || String(e)); setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-800">นำเข้างวดจาก Master CSV</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">งวดบัญชี (YYYY-MM)</label>
            <input
              type="text" value={period} onChange={(e) => setPeriod(e.target.value.trim())}
              placeholder="2026-06"
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="text-xs text-slate-400 mt-1">งวดที่นำเข้า (เช่น 2026-07 = ก.ค. 2569). ถ้างวดนี้มีอยู่แล้วและยังเปิดอยู่ → นำเข้าทับทั้งงวด; งวดที่ล็อกแล้วต้องปลดล็อกก่อน</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">ไฟล์ master (.csv)</label>
            <input
              type="file" accept=".csv"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
            />
          </div>

          {parsing && <p className="text-sm text-slate-500">กำลังอ่านไฟล์…</p>}

          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" /> {error}
            </p>
          )}

          {preview && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
              <p className="text-sm font-semibold text-slate-700">ตรวจสอบยอดก่อนนำเข้า (tie-out)</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-xs text-slate-500">จำนวนแถว</p>
                  <p className="font-bold text-slate-800">{fmtNum(preview.rows.length)} <span className="text-xs font-normal text-slate-400">(ตัด summary {preview.skipped}{preview.merged > 0 ? `, รวมซ้ำ ${preview.merged}` : ''})</span></p>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-xs text-slate-500">มูลค่าคงคลังรวม</p>
                  <p className="font-bold text-slate-800">{fmtBaht(preview.tieOut.total)}</p>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-xs text-slate-500">เวชภัณฑ์ยา</p>
                  <p className="font-bold text-teal-700">{fmtBaht(preview.tieOut.drug)}</p>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-xs text-slate-500">เวชภัณฑ์มิใช่ยา</p>
                  <p className="font-bold text-teal-700">{fmtBaht(preview.tieOut.nonDrug)}</p>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-xs text-slate-500">บริจาค+สนับสนุน</p>
                  <p className="font-bold text-amber-600">{fmtBaht(preview.tieOut.donation)}</p>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-xs text-slate-500">ยาโครงการ</p>
                  <p className="font-bold text-amber-600">{fmtBaht(preview.tieOut.project)}</p>
                </div>
              </div>
              <p className="text-xs text-slate-500">⚠️ ตรวจยอดแยก 4 หมวด (ยา/มิใช่ยา/บริจาค/โครงการ) ให้ตรงไฟล์ส่งบัญชีก่อนยืนยัน — งวดที่ล็อกแล้วแก้ไม่ได้</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button onClick={onClose} className="bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl py-2 px-4 font-medium text-sm transition-colors">ยกเลิก</button>
          <button
            onClick={handleConfirm} disabled={!preview || saving}
            className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white rounded-xl py-2 px-5 font-semibold text-sm transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? 'กำลังนำเข้า…' : `ยืนยันนำเข้า ${preview ? fmtNum(preview.rows.length) + ' แถว' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// AdjustModal — เพิ่มแถวปรับยอด (item_type='แก้ไขระบบ') ในงวดที่เปิดอยู่ — ADR-0007 ข้อ 4
// ────────────────────────────────────────────────────────────
function AdjustModal({ open, period, onClose, onAdded, auth }) {
  const [form, setForm] = useState({
    drug_code: '', drug_name: '', lot: '-', price_per_unit: '',
    med_category: 'ยา', adjust_qty: '', adjust_value: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleConfirm = async () => {
    setError('');
    if (!form.drug_code.trim()) { setError('กรอกรหัสยา'); return; }
    if (!form.adjust_qty && !form.adjust_value) { setError('กรอกจำนวนปรับ หรือ มูลค่าปรับ อย่างน้อยหนึ่งช่อง'); return; }
    setSaving(true);
    try {
      await addLedgerAdjustment({ period, ...form, drug_code: form.drug_code.trim() }, auth);
      onAdded();
      setForm({ drug_code: '', drug_name: '', lot: '-', price_per_unit: '', med_category: 'ยา', adjust_qty: '', adjust_value: '' });
      onClose();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-800">เพิ่มแถวปรับยอด — {periodLabel(period)}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            แถวปรับยอด (ชนิดรายการ <span className="font-semibold">แก้ไขระบบ</span>) มีผลต่อยอดคงคลังของงวดนี้เท่านั้น ไม่แตะข้อมูลรับ/เบิก และจะถูกลบอัตโนมัติเมื่อปิดงวด
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">รหัสยา *</label>
              <input type="text" value={form.drug_code} onChange={set('drug_code')} placeholder="เช่น 1000001"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Lot</label>
              <input type="text" value={form.lot} onChange={set('lot')} placeholder="-"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">ชื่อยา</label>
              <input type="text" value={form.drug_name} onChange={set('drug_name')} placeholder="(ไม่บังคับ)"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">หมวด</label>
              <select value={form.med_category} onChange={set('med_category')}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="ยา">เวชภัณฑ์ยา</option>
                <option value="เวชภัณฑ์มิใช่ยา">เวชภัณฑ์มิใช่ยา</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">ราคา/หน่วย</label>
              <input type="number" value={form.price_per_unit} onChange={set('price_per_unit')} placeholder="0"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">จำนวนปรับ (+/−)</label>
              <input type="number" value={form.adjust_qty} onChange={set('adjust_qty')} placeholder="0"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">มูลค่าปรับ (+/−)</label>
              <input type="number" value={form.adjust_value} onChange={set('adjust_value')} placeholder="0"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" /> {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button onClick={onClose} className="bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl py-2 px-4 font-medium text-sm transition-colors">ยกเลิก</button>
          <button
            onClick={handleConfirm} disabled={saving}
            className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white rounded-xl py-2 px-5 font-semibold text-sm transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก…' : 'เพิ่มแถวปรับยอด'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// StockLedgerApp
// ────────────────────────────────────────────────────────────
export default function StockLedgerApp({ onRefresh, auth = {}, onGoBack, canGoBack }) {
  const [period, setPeriod] = useState(null);
  const [status, setStatus] = useState(null);      // 'open' | 'closed' | null
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seedOpen, setSeedOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: null, dir: 'asc' }); // คลิกหัวตาราง sort
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const isAdmin = auth?.role === 'admin';

  const loadPeriod = useCallback(async (p) => {
    setLoading(true);
    try {
      const data = await fetchLedgerPeriod(p);
      setRows(data);
      setStatus(data[0]?.status || null);
    } finally {
      setLoading(false);
    }
  }, []);

  const init = useCallback(async () => {
    setLoading(true);
    const latest = await fetchLatestLedgerPeriod();
    if (latest) { setPeriod(latest.period); await loadPeriod(latest.period); }
    else { setPeriod(null); setRows([]); setStatus(null); setLoading(false); }
  }, [loadPeriod]);

  useEffect(() => { init(); }, [init]);

  const tieOut = useMemo(() => {
    let drug = 0, nonDrug = 0, donation = 0, project = 0;
    for (const r of rows) {
      const v = Number(r.closing_value) || 0;
      if (r.med_category === 'เวชภัณฑ์มิใช่ยา') nonDrug += v;
      else if (r.med_category === 'บริจาค+สนับสนุน') donation += v;
      else if (r.med_category === 'ยาโครงการ') project += v;
      else drug += v;
    }
    return { drug, nonDrug, donation, project, total: drug + nonDrug + donation + project };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.drug_name || '').toLowerCase().includes(q) ||
      (r.drug_code || '').toLowerCase().includes(q) ||
      (r.lot || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const num = NUMERIC_KEYS.has(sort.key);
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (num) return ((Number(a[sort.key]) || 0) - (Number(b[sort.key]) || 0)) * factor;
      return String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), 'th') * factor;
    });
  }, [filtered, sort]);

  // คลิกหัว: คอลัมน์เดิม → สลับ asc/desc; คอลัมน์ใหม่ → เริ่ม asc
  const toggleSort = (key) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });

  const onSeeded = async (p, n) => {
    setMsg(`นำเข้างวด ${periodLabel(p)} สำเร็จ (${fmtNum(n)} แถว)`);
    setPeriod(p);
    await loadPeriod(p);
  };

  const onAdjustAdded = async () => {
    setMsg(`เพิ่มแถวปรับยอดในงวด ${periodLabel(period)} แล้ว`);
    await loadPeriod(period);
  };

  const handleClose = async () => {
    if (!period || !isAdmin) return;
    if (!window.confirm(`ล็อกงวด ${periodLabel(period)}?\nยอดงวดนี้จะถูก freeze แก้ไม่ได้ (นำเข้าทับไม่ได้จนกว่าจะปลดล็อก).`)) return;
    setBusy(true); setMsg('');
    try {
      const r = await closeLedgerPeriod(period, auth);
      setMsg(`ล็อกงวด ${periodLabel(period)} แล้ว (${fmtNum(r.closed)} แถว)`);
      await loadPeriod(period);
    } catch (e) {
      setMsg('ล็อกงวดไม่สำเร็จ: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = async () => {
    if (!period || !isAdmin) return;
    // บังคับเหตุผล (หลักบัญชี: แก้งบย้อนหลังต้องมีร่องรอย) → ลง audit
    const reason = window.prompt(`ปลดล็อกงวด ${periodLabel(period)}?\nจะกลับมาแก้/นำเข้าทับได้อีกครั้ง.\n\nระบุเหตุผลการปลดล็อก (บันทึกลง audit):`);
    if (reason == null) return;                 // กด Cancel
    if (!reason.trim()) { setMsg('ปลดล็อกงวดไม่สำเร็จ: ต้องระบุเหตุผล'); return; }
    setBusy(true); setMsg('');
    try {
      await reopenLedgerPeriod(period, auth, reason.trim());
      setMsg(`ปลดล็อกงวด ${periodLabel(period)} แล้ว`);
      await loadPeriod(period);
    } catch (e) {
      setMsg('ปลดล็อกงวดไม่สำเร็จ: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const handleExport = () => {
    if (!period || rows.length === 0) return;
    exportToExcel(rows, LEDGER_EXCEL_COLS, `ทะเบียนคงคลัง ${periodLabel(period)}`, `ทะเบียนคงคลัง_${period}.xlsx`, auth);
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 pb-20">
      {/* Title bar */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
            <div className="p-1.5 rounded-lg bg-teal-100 text-teal-600 shrink-0"><Layers size={18} /></div>
            <button onClick={onRefresh} className="text-left hover:opacity-70 transition-opacity" title="คลิกเพื่อโหลดใหม่">
              <h1 className="text-base sm:text-lg font-bold leading-tight text-slate-800">ทะเบียนคงคลังรายเดือน</h1>
              <p className="text-xs text-slate-400">มูลค่าคงคลัง · นำเข้า master รายเดือน · ADR-0007</p>
            </button>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
              {period && rows.length > 0 && (
                <button onClick={handleExport} className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors">
                  <FileDown size={14} /> ส่งบัญชี (Excel)
                </button>
              )}
              <button onClick={() => setSeedOpen(true)} className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors">
                <Upload size={14} /> นำเข้างวด (master CSV)
              </button>
              {period && status === 'open' && (
                <button onClick={() => setAdjustOpen(true)} className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors">
                  <PlusCircle size={14} /> เพิ่มแถวปรับยอด
                </button>
              )}
              {period && status === 'open' && (
                <button onClick={handleClose} disabled={busy} className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors">
                  <Lock size={14} /> ล็อกงวด
                </button>
              )}
              {period && status === 'closed' && (
                <button onClick={handleReopen} disabled={busy} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors">
                  <Unlock size={14} /> ปลดล็อกงวด
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 space-y-4">
        {msg && (
          <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-teal-800 text-sm font-medium">
            <CheckCircle size={16} className="text-teal-600 shrink-0" /> {msg}
          </div>
        )}

        {!loading && !period && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
            <Layers size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-600 font-medium">ยังไม่มีงวดในระบบ</p>
            <p className="text-sm text-slate-400 mt-1">{isAdmin ? 'กด "นำเข้างวดตั้งต้น" เพื่อ seed จาก Excel master sheet' : 'รอ admin นำเข้างวดตั้งต้น'}</p>
          </div>
        )}

        {period && (
          <>
            {/* งวด + สถานะ + tie-out */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-xs text-slate-500">งวดปัจจุบัน</p>
                    <p className="text-xl font-bold text-slate-800">{periodLabel(period)}</p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${status === 'closed' ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                    {status === 'closed' ? 'ปิดงวดแล้ว' : 'เปิดอยู่'}
                  </span>
                  <button onClick={() => loadPeriod(period)} className="text-slate-400 hover:text-slate-600" title="โหลดใหม่"><RefreshCw size={15} /></button>
                </div>
                <div className="flex gap-4 text-right flex-wrap justify-end">
                  <div>
                    <p className="text-xs text-slate-500">เวชภัณฑ์ยา</p>
                    <p className="text-base font-bold text-teal-700">{fmtBaht(tieOut.drug)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">มิใช่ยา</p>
                    <p className="text-base font-bold text-teal-700">{fmtBaht(tieOut.nonDrug)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">บริจาค+สนับสนุน</p>
                    <p className="text-base font-bold text-amber-600">{fmtBaht(tieOut.donation)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">ยาโครงการ</p>
                    <p className="text-base font-bold text-amber-600">{fmtBaht(tieOut.project)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">รวม ({fmtNum(rows.length)} แถว)</p>
                    <p className="text-base font-bold text-slate-800">{fmtBaht(tieOut.total)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ตาราง ledger */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200">
                <div className="relative max-w-sm">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหา ชื่อยา / รหัส / lot…"
                    className="w-full border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div className="overflow-x-auto max-h-[60vh]">
                <table className="w-full text-sm">
                  <thead className="bg-slate-700 text-white sticky top-0 z-10">
                    <tr>
                      {LEDGER_TABLE_COLS.map(col => (
                        <SortTh key={col.key} col={col} sort={sort} onSort={toggleSort} />
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={13} className="px-3 py-8 text-center text-slate-400">กำลังโหลด…</td></tr>
                    ) : sorted.length === 0 ? (
                      <tr><td colSpan={13} className="px-3 py-8 text-center text-slate-400">ไม่พบรายการ</td></tr>
                    ) : sorted.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.drug_code}</td>
                        <td className="px-3 py-2 text-slate-800">{r.drug_name}</td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.lot}</td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.item_type}</td>
                        <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">{fmtBaht(r.price_per_unit)}</td>
                        <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap bg-slate-50">{fmtNum(r.opening_qty)}</td>
                        <td className="px-3 py-2 text-right text-emerald-700 whitespace-nowrap bg-slate-50">{fmtNum(r.in_qty)}</td>
                        <td className="px-3 py-2 text-right text-rose-600 whitespace-nowrap bg-slate-50">{fmtNum(r.out_qty)}</td>
                        <td className="px-3 py-2 text-right text-slate-700 font-medium whitespace-nowrap bg-slate-50">{fmtNum(r.closing_qty)}</td>
                        <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">{fmtBaht(r.carry_in_value)}</td>
                        <td className="px-3 py-2 text-right text-emerald-700 whitespace-nowrap">{fmtBaht(r.in_value)}</td>
                        <td className="px-3 py-2 text-right text-rose-600 whitespace-nowrap">{fmtBaht(r.out_value)}</td>
                        <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${Number(r.closing_value) < 0 ? 'text-red-600' : 'text-slate-800'}`}>{fmtBaht(r.closing_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <SeedModal open={seedOpen} onClose={() => setSeedOpen(false)} onSeeded={onSeeded} auth={auth} />
      <AdjustModal open={adjustOpen} period={period} onClose={() => setAdjustOpen(false)} onAdded={onAdjustAdded} auth={auth} />
    </div>
  );
}
