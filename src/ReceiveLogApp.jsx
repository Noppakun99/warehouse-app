import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase';
import { fetchDrugDetails } from './lib/db';
import {
  ArrowLeft, UploadCloud, RefreshCcw, Search, X,
  FileSpreadsheet, ChevronDown, ChevronUp, AlertCircle,
  TrendingUp, BarChart3,
} from 'lucide-react';

// ============================================================
// Column aliases
// ============================================================
const COL_MAP = {
  order_date:           ['วันที่แจ้งสั่ง', 'order date', 'order_date', 'วันสั่ง'],
  receive_date:         ['วันที่รับ', 'receive date', 'receive_date', 'วันที่รับของ', 'วันรับ'],
  inspect_date:         ['วันที่ตรวจรับ', 'inspect date', 'inspect_date', 'วันตรวจรับ'],
  leadtime:             ['leadtime', 'lead time', 'ระยะเวลา'],
  inspect_lag:          ['วันที่ตรวจรับ-วันที่รับของ', 'inspect lag', 'lag', 'ระยะตรวจรับ'],
  bill_number:          ['เลขที่บิลซื้อ', 'เลขบิล', 'bill', 'bill_number', 'เลขที่บิล', 'invoice'],
  po_number:            ['เลขที่po', 'po number', 'po_number', 'po', 'เลข po'],
  purchase_type:        ['สถานะการซื้อ', 'purchase type', 'purchase_type', 'ประเภทการซื้อ'],
  receive_status:       ['สถานะตรวจรับ', 'receive status', 'receive_status', 'สถานะรับ'],
  drug_code:            ['รหัส', 'รหัสยา', 'code', 'drug_code', 'รหัส hosxp', 'รหัสhosxp'],
  drug_name:            ['รายการยา', 'ชื่อยา', 'drug_name', 'name', 'item'],
  drug_type:            ['รูปแบบ', 'ชนิด', 'type', 'drug_type', 'form'],
  supplier_current:     ['บริษัทปัจจุบัน', 'บริษัท', 'supplier', 'supplier_current', 'vendor'],
  supplier_prev:        ['บริษัทก่อนหน้า', 'supplier_prev', 'previous supplier', 'บริษัทเก่า'],
  supplier_changed:     ['เปลี่ยนบริษัท', 'supplier_changed', 'change', 'เปลี่ยน'],
  lot:                  ['lot', 'lot.', 'lot no', 'เลขที่ lot'],
  exp:                  ['exp', 'exp.', 'exp date', 'วันหมดอายุ'],
  exp_note:             ['หมายเหตุหมดอายุ', 'exp_note', 'exp note', 'expiry note'],
  qty_received:         ['จำนวนที่รับ', 'qty_received', 'quantity', 'จำนวนรับ', 'จำนวน'],
  unit_per_bill:        ['หน่วย/บิล', 'unit_per_bill', 'unit per bill', 'หน่วยบิล'],
  price_per_unit:       ['ราคาต่อหน่วย(บาท)', 'ราคาต่อหน่วย', 'ราคา/หน่วย', 'price_per_unit', 'price', 'unit price'],
  total_price_vat:      ['ราคารวมภาษี (บาท)', 'ราคารวมภาษี', 'total_price_vat', 'total vat', 'ราคารวม'],
  total_price_formula:  ['ราคารวมภาษี (บาท)/สูตร', 'ราคารวมภาษี/สูตร', 'total_price_formula', 'formula price'],
};

const CHUNK = 300;

// แปลง ISO (yyyy-mm-dd) ↔ Thai (dd/mm/yyyy)
const isoToThai = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const thaiToIso = (thai) => {
  if (!thai || !thai.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) return '';
  const [d, m, y] = thai.split('/');
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
};

function ThaiDateInput({ value, onChange, ring = 'focus-within:ring-emerald-400', size = 'w-28' }) {
  const ref = React.useRef(null);
  return (
    <div className={`relative ${size} border border-slate-300 rounded-lg bg-white cursor-pointer flex items-center focus-within:ring-2 focus-within:outline-none ${ring}`}
      onClick={() => ref.current?.showPicker?.()}>
      <span className={`px-2 py-1.5 text-sm w-full select-none ${value ? 'text-slate-800' : 'text-slate-400'}`}>
        {value || 'dd/mm/yyyy'}
      </span>
      <input type="date" ref={ref} tabIndex={-1}
        className="absolute opacity-0 w-0 h-0 top-0 left-0 pointer-events-none"
        value={thaiToIso(value) || ''}
        onChange={e => onChange(isoToThai(e.target.value))} />
    </div>
  );
}

const FIELD_LABELS = {
  order_date:          'วันที่แจ้งสั่ง',
  receive_date:        'วันที่รับ',
  inspect_date:        'วันที่ตรวจรับ',
  leadtime:            'Leadtime',
  inspect_lag:         'ระยะตรวจรับ',
  bill_number:         'เลขที่บิล',
  po_number:           'เลขที่ PO',
  purchase_type:       'ประเภทการซื้อ',
  receive_status:      'สถานะตรวจรับ',
  drug_code:           'รหัสยา',
  drug_name:           'ชื่อรายการยา',
  drug_type:           'รูปแบบยา',
  supplier_current:    'บริษัทปัจจุบัน',
  supplier_prev:       'บริษัทก่อนหน้า',
  supplier_changed:    'เปลี่ยนบริษัท',
  lot:                 'Lot',
  exp:                 'Exp',
  exp_note:            'หมายเหตุ Exp',
  qty_received:        'จำนวนที่รับ',
  unit_per_bill:       'หน่วย/บิล',
  price_per_unit:      'ราคา/หน่วย',
  total_price_vat:     'มูลค่ารวมภาษี',
  total_price_formula: 'มูลค่า/สูตร',
};

function matchHeader(header) {
  const h = header.toLowerCase().trim().replace(/\s+/g, ' ');
  for (const [field, aliases] of Object.entries(COL_MAP)) {
    if (aliases.some(a => h === a.toLowerCase() || h.includes(a.toLowerCase()))) return field;
  }
  return null;
}

function parseCSVRow(str) {
  const arr = []; let quote = false; let col = '';
  for (let i = 0; i < str.length; i++) {
    const cc = str[i], nc = str[i + 1];
    if (cc === '"' && quote && nc === '"') { col += '"'; i++; continue; }
    if (cc === '"') { quote = !quote; continue; }
    if (cc === ',' && !quote) { arr.push(col.trim()); col = ''; continue; }
    col += cc;
  }
  arr.push(col.trim().replace(/^"|"$/g, ''));
  return arr;
}

const normalizeCode = (val) => {
  if (!val && val !== 0) return '-';
  return String(val).trim() || '-';
};

const pad = (n) => String(n).padStart(2, '0');

const fmtDate = (iso) => {
  if (!iso || iso === '-') return '-';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const MON = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};

// แปลงวันที่ทุกรูปแบบ (Excel serial, dd-Mon-yy, d/m/yyyy) → dd/mm/yyyy
const fmtAnyDate = (raw) => {
  if (!raw && raw !== 0) return '-';
  const s = String(raw).trim();
  if (!s || s === '-') return '-';
  // Excel serial (4-5 digits)
  if (/^\d{4,5}$/.test(s)) {
    const ms = (parseInt(s) - 25569) * 86400000;
    const d = new Date(ms);
    if (!isNaN(d)) return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  }
  // dd-Mon-yy or dd-Mon-yyyy (e.g. 17-Sep-29, 17-Sep-2029)
  const mMon = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (mMon) {
    const day = parseInt(mMon[1]);
    const mon = MON[mMon[2].toLowerCase()];
    let yr = parseInt(mMon[3]);
    if (yr < 100) yr += 2000;
    if (mon && day && yr) return `${pad(day)}/${pad(mon)}/${yr}`;
  }
  // slash/dash text date → parse → reformat
  const iso = parseDate(s);
  if (iso) return fmtDate(iso);
  return s;
};

function parseDate(raw) {
  if (!raw || raw === '-' || raw === '0' || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  const sep = s.includes('/') ? '/' : s.includes('-') ? '-' : null;
  if (sep) {
    const p = s.split(sep).map(x => x.trim());
    if (p.length === 3) {
      let [a, b, c] = p.map(Number);
      if ([a, b, c].some(isNaN)) return null;
      let d, m, y;
      if (p[0].length === 4) { [y, m, d] = [a, b, c]; } else { [d, m, y] = [a, b, c]; }
      if (y > 2500) y -= 543;
      if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > 2200) return null;
      const dt = new Date(y, m - 1, d);
      if (!isNaN(dt) && dt.getDate() === d) return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }
  }
  return null;
}

// ============================================================
// Root
// ============================================================
export default function ReceiveLogApp({ onBack }) {
  const [tab, setTab]                 = useState('view');
  const [showSummary, setShowSummary] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm px-4 py-3 flex items-center gap-2">
        <button onClick={onBack} className="text-slate-500 hover:text-indigo-600 p-1 transition-colors shrink-0"><ArrowLeft size={20}/></button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <TrendingUp size={20} className="text-emerald-500 shrink-0" />
          <span className="font-semibold text-slate-800 truncate">บันทึกการรับเข้าคลัง (คลังรับ)</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setShowSummary(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 transition-all">
            <BarChart3 size={15}/> สรุปผล
          </button>
          <button onClick={() => setTab('import')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === 'import' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
          >Import CSV</button>
        </div>
      </div>
      {tab === 'import' && <ReceiveImport onDone={() => setTab('view')} />}
      {tab === 'view'   && <ReceiveView />}
      {showSummary      && <ReceiveSummaryModal onClose={() => setShowSummary(false)} />}
    </div>
  );
}

// ============================================================
// CSV Import
// ============================================================
function ReceiveImport({ onDone }) {
  const [status, setStatus]         = useState('');
  const [error, setError]           = useState('');
  const [preview, setPreview]       = useState(null);
  const [mapping, setMapping]       = useState({});
  const [rawHeaders, setRawHeaders] = useState([]);
  const [rawRows, setRawRows]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(''); setStatus(''); setPreview(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const lines = ev.target.result.split('\n').filter(l => l.trim());
        if (lines.length < 2) throw new Error('ไฟล์ไม่มีข้อมูล');
        const headers = parseCSVRow(lines[0]);
        const autoMap = {};
        headers.forEach((h, i) => { const f = matchHeader(h); if (f) autoMap[f] = i; });
        setRawHeaders(headers);
        setMapping(autoMap);
        setRawRows(lines.slice(1).map(parseCSVRow));
        setPreview({ fileName: file.name, total: lines.length - 1 });
      } catch (err) { setError(err.message); }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const getVal = (row, field) => {
    const idx = mapping[field];
    if (idx == null || idx === '') return null;
    return row[idx]?.trim() || null;
  };

  const handleImport = async () => {
    if (!rawRows.length || !supabase) return;
    setLoading(true); setError('');
    try {
      const rows = rawRows
        .filter(row => row.some(c => c.trim()))
        .map(row => {
          const drugName = getVal(row, 'drug_name');
          if (!drugName) return null;
          return {
            order_date:           parseDate(getVal(row, 'order_date')),
            receive_date:         parseDate(getVal(row, 'receive_date')),
            inspect_date:         parseDate(getVal(row, 'inspect_date')),
            leadtime:             getVal(row, 'leadtime'),
            inspect_lag:          getVal(row, 'inspect_lag'),
            bill_number:          getVal(row, 'bill_number') || '-',
            po_number:            getVal(row, 'po_number') || '-',
            purchase_type:        getVal(row, 'purchase_type') || '-',
            receive_status:       getVal(row, 'receive_status') || '-',
            drug_code:            normalizeCode(getVal(row, 'drug_code')),
            drug_name:            drugName,
            drug_type:            getVal(row, 'drug_type') || '-',
            supplier_current:     getVal(row, 'supplier_current') || '-',
            supplier_prev:        getVal(row, 'supplier_prev') || '-',
            supplier_changed:     getVal(row, 'supplier_changed') || '-',
            lot:                  getVal(row, 'lot') || '-',
            exp:                  getVal(row, 'exp') || '-',
            exp_note:             getVal(row, 'exp_note'),
            qty_received:         parseFloat(String(getVal(row, 'qty_received') || '0').replace(/,/g,'')) || null,
            unit_per_bill:        getVal(row, 'unit_per_bill') || '-',
            price_per_unit:       parseFloat(String(getVal(row, 'price_per_unit') || '0').replace(/,/g,'')) || null,
            total_price_vat:      parseFloat(String(getVal(row, 'total_price_vat') || '0').replace(/,/g,'')) || null,
            total_price_formula:  getVal(row, 'total_price_formula'),
          };
        })
        .filter(Boolean);

      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: e } = await supabase.from('receive_logs').insert(rows.slice(i, i + CHUNK));
        if (e) throw e;
      }
      const now = new Date();
      const importTime = now.toLocaleString('th-TH', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
      setStatus(`นำเข้าสำเร็จ ${rows.length.toLocaleString()} รายการ · นำเข้าเมื่อ ${importTime}`);
      setPreview(null); setRawRows([]); setRawHeaders([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      <div onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-slate-300 hover:border-emerald-400 bg-white rounded-2xl p-10 text-center cursor-pointer transition-colors">
        <FileSpreadsheet size={40} className="mx-auto mb-3 text-slate-400" />
        <p className="font-semibold text-slate-700">คลิกเพื่อเลือกไฟล์ CSV คลังรับ</p>
        <p className="text-xs text-slate-400 mt-1">รองรับ .csv (UTF-8 หรือ TIS-620)</p>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
      </div>

      {error  && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2 flex items-center gap-2"><AlertCircle size={16}/>{error}</p>}
      {status && <p className="text-emerald-700 text-sm bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">{status}</p>}

      {/* Column reference — shown before file is selected */}
      {!preview && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
          <p className="text-sm font-semibold text-slate-700">หัวคอลัมน์ที่รองรับในไฟล์ CSV</p>
          <p className="text-xs text-slate-400">ชื่อหัวคอลัมน์ใน CSV ต้องตรงกับชื่อด้านล่าง (ไม่ต้องเว้นวรรค / ไม่ต้องตรงทุกตัว)</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'วันที่รับ',         req: true,  hints: ['วันที่รับ', 'receive_date', 'วันรับ'] },
              { label: 'ชื่อรายการยา',      req: true,  hints: ['รายการยา', 'ชื่อยา', 'drug_name'] },
              { label: 'รหัสยา',            req: false, hints: ['รหัสยา', 'รหัส', 'code'] },
              { label: 'รูปแบบยา',          req: false, hints: ['รูปแบบ', 'ชนิด', 'drug_type'] },
              { label: 'บริษัทปัจจุบัน',    req: false, hints: ['บริษัทปัจจุบัน', 'บริษัท', 'supplier'] },
              { label: 'เลขที่บิล',         req: false, hints: ['เลขที่บิลซื้อ', 'เลขบิล', 'bill_number'] },
              { label: 'เลขที่ PO',         req: false, hints: ['เลขที่po', 'po_number', 'po'] },
              { label: 'Lot',               req: false, hints: ['lot', 'lot.', 'เลขที่ lot'] },
              { label: 'Exp',               req: false, hints: ['exp', 'exp.', 'วันหมดอายุ'] },
              { label: 'จำนวนที่รับ',       req: false, hints: ['จำนวนที่รับ', 'qty_received', 'จำนวน'] },
              { label: 'หน่วย/บิล',         req: false, hints: ['หน่วย/บิล', 'unit_per_bill'] },
              { label: 'ราคา/หน่วย',        req: false, hints: ['ราคาต่อหน่วย(บาท)', 'ราคาต่อหน่วย', 'ราคา/หน่วย'] },
              { label: 'มูลค่ารวมภาษี',     req: false, hints: ['ราคารวมภาษี (บาท)', 'ราคารวมภาษี', 'total_price_vat'] },
              { label: 'วันที่แจ้งสั่ง',    req: false, hints: ['วันที่แจ้งสั่ง', 'order_date'] },
              { label: 'วันที่ตรวจรับ',     req: false, hints: ['วันที่ตรวจรับ', 'inspect_date'] },
              { label: 'สถานะตรวจรับ',      req: false, hints: ['สถานะตรวจรับ', 'receive_status'] },
              { label: 'ประเภทการซื้อ',     req: false, hints: ['สถานะการซื้อ', 'purchase_type'] },
              { label: 'บริษัทก่อนหน้า',   req: false, hints: ['บริษัทก่อนหน้า', 'supplier_prev'] },
            ].map(({ label, req, hints }) => (
              <div key={label} className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">{label}</span>
                  {req && <span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full">จำเป็น</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {hints.map(h => (
                    <code key={h} className="text-[10px] bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-mono whitespace-nowrap">{h}</code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {preview && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-800">{preview.fileName}</p>
            <span className="text-xs text-slate-500">{preview.total.toLocaleString()} แถว</span>
          </div>

          {/* CSV header tags */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">หัวคอลัมน์ CSV ที่ตรวจพบ ({rawHeaders.length} คอลัมน์):</p>
            <div className="flex flex-wrap gap-1.5">
              {rawHeaders.map((h, i) => {
                const matchedField = Object.entries(mapping).find(([, idx]) => idx === i)?.[0];
                return (
                  <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${
                    matchedField ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}>
                    {matchedField ? '✓' : '?'} {h}
                    {matchedField && <span className="text-[10px] text-emerald-500 ml-0.5">→ {FIELD_LABELS[matchedField] || matchedField}</span>}
                  </span>
                );
              })}
            </div>
            {rawHeaders.some((_, i) => !Object.values(mapping).includes(i)) && (
              <p className="text-xs text-amber-600 mt-1.5">⚠ คอลัมน์ที่มี ? ไม่ถูกนำเข้า — ตรวจสอบชื่อหัวตาราง CSV ให้ตรงกับที่ระบบรู้จัก</p>
            )}
          </div>

          {/* Editable mapping (collapsed) */}
          <details>
            <summary className="cursor-pointer text-xs text-indigo-600 hover:text-indigo-800 font-medium select-none">แก้ไขการจับคู่คอลัมน์ด้วยตัวเอง ▸</summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto mt-2">
              {Object.keys(COL_MAP).map(field => (
                <div key={field} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-36 shrink-0">{FIELD_LABELS[field] || field}</span>
                  <select value={mapping[field] ?? ''}
                    onChange={e => setMapping(p => ({ ...p, [field]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="">-- ไม่ใช้ --</option>
                    {rawHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </details>

          {/* Full preview table - all matched fields */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">ตัวอย่างข้อมูล 3 แถวแรก (เฉพาะคอลัมน์ที่ match):</p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-slate-600 border-b border-slate-200 bg-slate-50">
                    {Object.keys(COL_MAP).filter(f => mapping[f] != null).map(f => (
                      <th key={f} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{FIELD_LABELS[f] || f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rawRows.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {Object.keys(COL_MAP).filter(f => mapping[f] != null).map(f => {
                        const val = getVal(row, f);
                        return (
                          <td key={f} className={`px-3 py-1.5 truncate max-w-[140px] ${val ? 'text-slate-700' : 'text-rose-300'}`}>
                            {val || '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button onClick={handleImport} disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 transition-all">
            <UploadCloud size={18}/>
            {loading ? 'กำลังนำเข้า...' : `นำเข้า ${rawRows.filter(r=>r.some(c=>c.trim())).length.toLocaleString()} รายการ`}
          </button>
        </div>
      )}

      {status && (
        <button onClick={onDone} className="w-full bg-slate-800 hover:bg-slate-700 text-white rounded-xl py-3 font-semibold transition-all">
          ไปดูข้อมูล →
        </button>
      )}
    </div>
  );
}

// ============================================================
// View
// ============================================================
function ReceiveView() {
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [supplierFilter, setSupplier] = useState('');
  const [suppliers, setSuppliers]     = useState([]);
  const [drugNames, setDrugNames]     = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedDrug, setSelectedDrug] = useState('');
  const [drugRows, setDrugRows]         = useState([]);
  const [drugLoading, setDrugLoading]   = useState(false);
  const [drugDateFrom, setDrugDateFrom] = useState('');
  const [drugDateTo, setDrugDateTo]     = useState('');
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [expanded, setExpanded]       = useState(null);
  const [drugExpanded, setDrugExpanded] = useState(null);
  const [page, setPage]               = useState(0);
  const PAGE_SIZE = 50;
  const searchRef    = useRef(null);
  const supplierRef  = useRef(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDd, setShowSupplierDd] = useState(false);
  const [drugDetailMap, setDrugDetailMap] = useState({});

  const SUPPLIER_KEYS = ['บริษัทปัจจุบัน', 'บริษัท', 'supplier', 'supplier_current', 'vendor'];
  const PRICE_KEYS    = ['ราคาต่อหน่วย(บาท)', 'ราคาต่อหน่วย', 'ราคา/หน่วย', 'price_per_unit', 'price', 'unit price'];

  // normalize lot/bill — ลบช่องว่าง อักขระพิเศษ แล้ว lowercase
  const norm = (s) => (s || '').trim().replace(/[\s\-\/\.]/g, '').toLowerCase();

  const getDetailSupplier = useCallback((row) => {
    if (!drugDetailMap || Object.keys(drugDetailMap).length === 0) return null;
    const code    = (row.drug_code    || '').trim().toLowerCase();
    const lot     = norm(row.lot);
    const bill    = norm(row.bill_number);

    // 1) exact: code | lot(norm) | bill(norm)
    let detail = Object.values(drugDetailMap).find(d =>
      (d._code    || '').trim().toLowerCase() === code &&
      norm(d._lot)     === lot &&
      norm(d._invoice) === bill
    );

    // 2) fallback: code + lot(norm) → tiebreak ด้วย price_per_unit
    if (!detail) {
      const candidates = Object.values(drugDetailMap).filter(d =>
        (d._code || '').trim().toLowerCase() === code &&
        norm(d._lot) === lot
      );
      if (candidates.length === 1) {
        detail = candidates[0];
      } else if (candidates.length > 1 && row.price_per_unit != null) {
        const rowPrice = parseFloat(String(row.price_per_unit).replace(/,/g, ''));
        detail = candidates.find(d => {
          const pVal = PRICE_KEYS.map(k => d[k]).find(v => v != null);
          return pVal != null && parseFloat(String(pVal).replace(/,/g, '')) === rowPrice;
        }) || candidates[0];
      }
    }

    if (!detail) return null;
    for (const k of SUPPLIER_KEYS) {
      if (detail[k] && detail[k] !== '-') return detail[k];
    }
    return null;
  }, [drugDetailMap]);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    let q = supabase.from('receive_logs').select('*')
      .order('receive_date', { ascending: false })
      .order('id', { ascending: false });
    if (search.trim())  q = q.or(`drug_name.ilike.%${search}%,drug_code.ilike.%${search}%,lot.ilike.%${search}%,bill_number.ilike.%${search}%`);
    if (dateFrom)       q = q.gte('receive_date', thaiToIso(dateFrom) || dateFrom);
    if (dateTo)         q = q.lte('receive_date', thaiToIso(dateTo)   || dateTo);
    q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    const { data } = await q;
    setRows(data || []);
    setLoading(false);
  }, [search, dateFrom, dateTo, page]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  useEffect(() => {
    fetchDrugDetails().then(details => {
      if (details) {
        setDrugDetailMap(details);
        // ดึงชื่อบริษัทจาก drug_details
        const SUPP_KEYS = ['บริษัทปัจจุบัน', 'บริษัท', 'supplier', 'supplier_current', 'vendor'];
        const names = [...new Set(
          Object.values(details)
            .map(d => { const k = SUPP_KEYS.find(k => d[k] != null && String(d[k]).trim() !== '' && d[k] !== '-'); return k ? String(d[k]).trim() : null; })
            .filter(Boolean)
        )].sort();
        setSuppliers(names);
      }
    });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('receive_logs').select('drug_name').then(({ data }) => {
      if (data) setDrugNames([...new Set(data.map(d => d.drug_name).filter(Boolean))].sort());
    });
  }, []);

  // ปิด dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current   && !searchRef.current.contains(e.target))   setShowDropdown(false);
      if (supplierRef.current && !supplierRef.current.contains(e.target))  setShowSupplierDd(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // โหลดทุก row ของยาที่เลือก
  useEffect(() => {
    if (!selectedDrug || !supabase) { setDrugRows([]); return; }
    setDrugLoading(true);
    supabase.from('receive_logs')
      .select('*')
      .eq('drug_name', selectedDrug)
      .order('receive_date', { ascending: false })
      .then(({ data }) => { setDrugRows(data || []); setDrugLoading(false); });
  }, [selectedDrug]);

  const filteredDrugs = search.trim()
    ? drugNames.filter(n => n.toLowerCase().includes(search.toLowerCase())).slice(0, 10)
    : [];

  const selectDrug = (name) => {
    setSearch(name);
    setSelectedDrug(name);
    setShowDropdown(false);
    setPage(0);
  };

  const clearSearch = () => {
    setSearch('');
    setSelectedDrug('');
    setDrugRows([]);
    setDrugDateFrom('');
    setDrugDateTo('');
    setPage(0);
  };

  // กรองด้วย date range ฝั่ง drug table (client-side)
  const filteredDrugRows = drugRows.filter(r => {
    if (drugDateFrom && r.receive_date < drugDateFrom) return false;
    if (drugDateTo   && r.receive_date > drugDateTo)   return false;
    return true;
  });
  const drugCode  = drugRows.find(r => r.drug_code    && r.drug_code    !== '-')?.drug_code    || '-';
  const drugUnit  = drugRows.find(r => r.unit_per_bill && r.unit_per_bill !== '-')?.unit_per_bill || '-';
  const drugTotalQty   = filteredDrugRows.reduce((s, r) => s + (r.qty_received    || 0), 0);
  const drugTotalValue = filteredDrugRows.reduce((s, r) => s + (r.total_price_vat || 0), 0);

  const displayRows = supplierFilter
    ? rows.filter(r => (getDetailSupplier(r) || r.supplier_current || '') === supplierFilter)
    : rows;
  const totalQty   = displayRows.reduce((s, r) => s + (r.qty_received || 0), 0);
  const totalValue = displayRows.reduce((s, r) => s + (r.total_price_vat || 0), 0);
  const hasFilter  = search || supplierFilter || dateFrom || dateTo;

  const clearAll = () => { clearSearch(); setSupplier(''); setSupplierSearch(''); setDateFrom(''); setDateTo(''); };

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      {/* Filter card */}
      <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-xl p-3 shadow-sm space-y-2 sticky top-14 z-10">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-[2] min-w-[160px]" ref={searchRef}>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setSelectedDrug(''); setDrugRows([]); setPage(0); setShowDropdown(true); }}
              onFocus={() => { if (search.trim()) setShowDropdown(true); }}
              placeholder="ค้นหาชื่อยา, รหัส, Lot, เลขบิล..."
              className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            {search && (
              <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14}/>
              </button>
            )}
            {/* Dropdown ชื่อยา */}
            {showDropdown && filteredDrugs.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
                {filteredDrugs.map(name => (
                  <button
                    key={name}
                    onMouseDown={e => { e.preventDefault(); selectDrug(name); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors border-b border-slate-100 last:border-0"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative" ref={supplierRef}>
            <input
              type="text"
              value={supplierSearch}
              onChange={e => { setSupplierSearch(e.target.value); setShowSupplierDd(true); }}
              onFocus={() => setShowSupplierDd(true)}
              placeholder={supplierFilter || 'ค้นหาบริษัท...'}
              className={`bg-white border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 w-64 ${supplierFilter ? 'border-emerald-400 text-emerald-700 font-medium' : 'border-slate-300 text-slate-800'}`}
            />
            {supplierFilter && (
              <button onClick={() => { setSupplier(''); setSupplierSearch(''); setPage(0); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14}/>
              </button>
            )}
            {showSupplierDd && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 w-64 max-h-60 overflow-y-auto">
                <button onMouseDown={e => { e.preventDefault(); setSupplier(''); setSupplierSearch(''); setShowSupplierDd(false); setPage(0); }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 border-b border-slate-100">
                  ทุกบริษัท
                </button>
                {suppliers
                  .filter(s => !supplierSearch || s.toLowerCase().includes(supplierSearch.toLowerCase()))
                  .map(s => (
                    <button key={s} onMouseDown={e => { e.preventDefault(); setSupplier(s); setSupplierSearch(''); setShowSupplierDd(false); setPage(0); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 hover:text-emerald-700 border-b border-slate-100 last:border-0 ${supplierFilter === s ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-700'}`}>
                      {s}
                    </button>
                  ))
                }
              </div>
            )}
          </div>
          <button onClick={clearAll} className="text-slate-400 hover:text-slate-600 p-2 transition-colors" title="ล้างตัวกรองทั้งหมด">
            <RefreshCcw size={16}/>
          </button>
        </div>
        {/* Date range */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-slate-500 font-medium">ตั้งแต่</span>
          <ThaiDateInput value={dateFrom} onChange={v => { setDateFrom(v); setPage(0); }} />
          <span className="text-xs text-slate-400">ถึง</span>
          <ThaiDateInput value={dateTo} onChange={v => { setDateTo(v); setPage(0); }} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(0); }}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"><X size={12}/>ล้างวันที่</button>
          )}
        </div>
      </div>

      {/* ตารางประวัติรับยาที่เลือก */}
      {selectedDrug && (
        <div className="bg-white border border-emerald-200 rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-emerald-800">{selectedDrug}</p>
                <p className="text-xs text-emerald-600 mt-0.5">รหัส: {drugCode} · หน่วย: {drugUnit}</p>
                {/* บริษัทที่เคยรับ */}
                {drugRows.length > 0 && (() => {
                  const suppliers = [...new Set(drugRows.map(r => r.supplier_current).filter(s => s && s !== '-'))];
                  return suppliers.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                      <span className="text-xs text-emerald-700 font-semibold shrink-0">บริษัทที่เคยรับ:</span>
                      {suppliers.map(s => (
                        <span key={s} className="text-xs bg-white border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">{s}</span>
                      ))}
                    </div>
                  ) : null;
                })()}
              </div>
              <button onClick={clearSearch} className="text-emerald-400 hover:text-emerald-600 shrink-0 mt-0.5"><X size={16}/></button>
            </div>
          </div>

          {/* Date filter + totals */}
          <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate-500 font-medium">ช่วงวันที่:</span>
            <input type="date" value={drugDateFrom} onChange={e => setDrugDateFrom(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white" />
            <span className="text-xs text-slate-400">—</span>
            <input type="date" value={drugDateTo} onChange={e => setDrugDateTo(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white" />
            {(drugDateFrom || drugDateTo) && (
              <button onClick={() => { setDrugDateFrom(''); setDrugDateTo(''); }}
                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-0.5"><X size={11}/>ล้าง</button>
            )}
            <div className="ml-auto flex items-center gap-4 text-xs">
              <span className="text-slate-500">{filteredDrugRows.length.toLocaleString()} รายการ</span>
              <span className="font-semibold text-emerald-700">รับรวม {drugTotalQty.toLocaleString(undefined,{maximumFractionDigits:0})} {drugUnit}</span>
              <span className="font-semibold text-amber-700">{drugTotalValue.toLocaleString(undefined,{maximumFractionDigits:0})} บาท</span>
            </div>
          </div>

          {/* Table */}
          {drugLoading ? (
            <p className="text-center text-slate-400 py-8 text-sm">กำลังโหลด...</p>
          ) : filteredDrugRows.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">ไม่พบข้อมูลในช่วงที่เลือก</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-semibold">
                    <th className="px-4 py-2.5 text-left">วันที่รับ</th>
                    <th className="px-4 py-2.5 text-right">จำนวน</th>
                    <th className="px-4 py-2.5 text-left">หน่วย</th>
                    <th className="px-4 py-2.5 text-left">Lot</th>
                    <th className="px-4 py-2.5 text-left">Exp</th>
                    <th className="px-4 py-2.5 text-right">ราคา/หน่วย</th>
                    <th className="px-4 py-2.5 text-right">มูลค่ารวมภาษี (บาท)</th>
                    <th className="px-4 py-2.5 text-left">บริษัท</th>
                    <th className="px-4 py-2.5 text-left">เลขบิล</th>
                    <th className="px-4 py-2.5 w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrugRows.map((r, i) => (
                    <React.Fragment key={r.id}>
                      <tr
                        onClick={() => setDrugExpanded(drugExpanded === r.id ? null : r.id)}
                        className={`border-b border-slate-100 cursor-pointer transition-colors ${drugExpanded === r.id ? 'bg-emerald-50' : i % 2 === 0 ? 'hover:bg-slate-50' : 'bg-slate-50/40 hover:bg-slate-100'}`}
                      >
                        <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{fmtDate(r.receive_date)}</td>
                        <td className="px-4 py-2.5 text-emerald-700 font-semibold text-right whitespace-nowrap">+{(r.qty_received || 0).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{r.unit_per_bill || '-'}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{r.lot || '-'}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmtAnyDate(r.exp)}</td>
                        <td className="px-4 py-2.5 text-slate-600 text-right whitespace-nowrap">{r.price_per_unit != null ? Number(r.price_per_unit).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '-'}</td>
                        <td className="px-4 py-2.5 text-amber-700 text-right whitespace-nowrap">{r.total_price_vat != null ? Number(r.total_price_vat).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '-'}</td>
                        <td className="px-4 py-2.5 max-w-[160px]">
                          {(() => {
                            const ds = getDetailSupplier(r);
                            const raw = r.supplier_current || '-';
                            if (ds && ds !== raw) return (
                              <div>
                                <div className="text-emerald-700 font-medium truncate text-xs">{ds}</div>
                                <div className="text-slate-400 line-through truncate text-xs">{raw}</div>
                              </div>
                            );
                            return <span className="text-slate-600 truncate block">{ds || raw}</span>;
                          })()}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{r.bill_number || '-'}</td>
                        <td className="px-4 py-2.5 text-slate-400">
                          {drugExpanded === r.id ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                        </td>
                      </tr>
                      {drugExpanded === r.id && (
                        <tr className="bg-emerald-50/70 border-b border-emerald-100">
                          <td colSpan={10} className="px-6 py-3">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-1.5 text-sm">
                              {[
                                ['วันที่แจ้งสั่ง',   fmtDate(r.order_date)],
                                ['วันที่ตรวจรับ',    fmtDate(r.inspect_date)],
                                ['Leadtime',          r.leadtime],
                                ['ระยะตรวจรับ',       r.inspect_lag],
                                ['เลขที่ PO',         r.po_number],
                                ['ประเภทการซื้อ',      r.purchase_type],
                                ['สถานะตรวจรับ',      r.receive_status],
                                ['รูปแบบ',            r.drug_type],
                                ['บริษัทก่อนหน้า',    r.supplier_prev],
                                ['เปลี่ยนบริษัท',     r.supplier_changed],
                                ['หมายเหตุหมดอายุ',   r.exp_note],
                                ['ราคารวมภาษี/สูตร',  r.total_price_formula],
                              ].map(([label, val]) => val != null && val !== '-' && val !== '' ? (
                                <div key={label}>
                                  <span className="text-slate-400 text-xs">{label}: </span>
                                  <span className="text-slate-700 font-medium">{val}</span>
                                </div>
                              ) : null)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-50 border-t-2 border-emerald-200 font-semibold text-sm">
                    <td className="px-4 py-2.5 text-slate-700">รวม {filteredDrugRows.length} รายการ</td>
                    <td className="px-4 py-2.5 text-emerald-700 text-right">{drugTotalQty.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{drugUnit}</td>
                    <td colSpan={3}></td>
                    <td className="px-4 py-2.5 text-amber-700 text-right">{drugTotalValue.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {!selectedDrug && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-slate-800">{rows.length.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">รายการ{hasFilter ? ' (กรอง)' : ' (หน้านี้)'}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-emerald-600">{totalQty.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
            <p className="text-xs text-slate-500 mt-0.5">ปริมาณรับรวม</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-amber-600">{totalValue.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
            <p className="text-xs text-slate-500 mt-0.5">มูลค่ารวมภาษี (บาท)</p>
          </div>
        </div>
      )}

      {!selectedDrug && loading && <p className="text-center text-slate-400 py-10">กำลังโหลด...</p>}
      {!selectedDrug && !loading && rows.length === 0 && (
        <div className="text-center text-slate-400 py-20">
          <TrendingUp size={48} className="mx-auto mb-3 opacity-30" />
          <p>ไม่พบข้อมูล{hasFilter ? ' — ลองเปลี่ยนตัวกรอง' : ' — กด Import CSV เพื่อนำเข้าข้อมูล'}</p>
        </div>
      )}

      {!selectedDrug && rows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-260px)]">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 z-[5]">
                <tr className="text-xs text-slate-500 font-semibold border-b border-slate-200">
                  <th className="px-4 py-2.5 text-left bg-slate-100">วันที่รับ</th>
                  <th className="px-4 py-2.5 text-left bg-slate-100">ชื่อรายการยา</th>
                  <th className="px-4 py-2.5 text-right bg-slate-100">จำนวน</th>
                  <th className="px-4 py-2.5 text-left bg-slate-100">หน่วย</th>
                  <th className="px-4 py-2.5 text-left bg-slate-100">Lot</th>
                  <th className="px-4 py-2.5 text-left bg-slate-100">Exp</th>
                  <th className="px-4 py-2.5 text-right bg-slate-100">ราคา/หน่วย</th>
                  <th className="px-4 py-2.5 text-right bg-slate-100">มูลค่ารวมภาษี (บาท)</th>
                  <th className="px-4 py-2.5 text-left bg-slate-100">บริษัท</th>
                  <th className="px-4 py-2.5 text-left bg-slate-100">เลขบิล</th>
                  <th className="px-4 py-2.5 w-8 bg-slate-100"></th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => (
                  <React.Fragment key={row.id}>
                    <tr
                      onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                      className={`border-b border-slate-100 cursor-pointer transition-colors ${expanded === row.id ? 'bg-emerald-50' : i % 2 === 0 ? 'hover:bg-slate-50' : 'bg-slate-50/40 hover:bg-slate-100'}`}
                    >
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(row.receive_date)}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800 max-w-[220px]">
                        <span className="block truncate">{row.drug_name}</span>
                        <span className="text-xs text-slate-400 font-normal">{row.drug_code}</span>
                      </td>
                      <td className="px-4 py-2.5 text-emerald-700 font-semibold text-right whitespace-nowrap">+{(row.qty_received || 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{row.unit_per_bill || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{row.lot || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmtAnyDate(row.exp)}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-right whitespace-nowrap">{row.price_per_unit != null ? Number(row.price_per_unit).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '-'}</td>
                      <td className="px-4 py-2.5 text-amber-700 text-right whitespace-nowrap">{row.total_price_vat != null ? Number(row.total_price_vat).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '-'}</td>
                      <td className="px-4 py-2.5 text-slate-600 max-w-[140px] truncate">
                        {getDetailSupplier(row) || row.supplier_current || '-'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{row.bill_number || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-400">
                        {expanded === row.id ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                      </td>
                    </tr>
                    {expanded === row.id && (
                      <tr className="bg-emerald-50/60 border-b border-emerald-100">
                        <td colSpan={11} className="px-6 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-1.5 text-sm">
                            {[
                              ['วันที่แจ้งสั่ง',   fmtDate(row.order_date)],
                              ['วันที่ตรวจรับ',    fmtDate(row.inspect_date)],
                              ['Leadtime',          row.leadtime],
                              ['ระยะตรวจรับ',       row.inspect_lag],
                              ['เลขที่ PO',         row.po_number],
                              ['ประเภทการซื้อ',      row.purchase_type],
                              ['สถานะตรวจรับ',      row.receive_status],
                              ['รูปแบบ',            row.drug_type],
                              ['บริษัทก่อนหน้า',    row.supplier_prev],
                              ['เปลี่ยนบริษัท',     row.supplier_changed],
                              ['หมายเหตุหมดอายุ',   row.exp_note],
                              ['ราคารวมภาษี/สูตร',  row.total_price_formula],
                            ].map(([label, val]) => val != null && val !== '-' && val !== '' ? (
                              <div key={label}>
                                <span className="text-slate-400 text-xs">{label}: </span>
                                <span className="text-slate-700 font-medium">{val}</span>
                              </div>
                            ) : null)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!selectedDrug && rows.length === PAGE_SIZE && (
        <div className="flex gap-2 justify-center pt-2">
          {page > 0 && <button onClick={() => setPage(p => p-1)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl px-4 py-2 text-sm shadow-sm">← ก่อนหน้า</button>}
          <button onClick={() => setPage(p => p+1)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl px-4 py-2 text-sm shadow-sm">ถัดไป →</button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Summary Modal
// ============================================================
function ReceiveSummaryModal({ onClose }) {
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [supplierFilter, setSupplier] = useState('');
  const [suppliers, setSuppliers]     = useState([]);
  const [stats, setStats]             = useState(null);
  const [loading, setLoading]         = useState(true);
  const [drugFilter, setDrugFilter]   = useState('');
  const [drugNames, setDrugNames]     = useState([]);
  const [showDrugDd, setShowDrugDd]   = useState(false);
  const drugRef = useRef(null);
  const [allTimeTotal, setAllTimeTotal] = useState(null);
  const [allTimeValue, setAllTimeValue] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    // ดึงจำนวนรายการทั้งหมด
    supabase.from('receive_logs').select('*', { count: 'exact', head: true })
      .then(({ count }) => setAllTimeTotal(count ?? 0));
    // ดึงมูลค่าทั้งหมด
    supabase.from('receive_logs').select('total_price_vat')
      .then(({ data }) => {
        if (data) setAllTimeValue(data.reduce((s, r) => s + (r.total_price_vat || 0), 0));
      });
    // ดึงวันแรก-วันล่าสุด → แปลงเป็น dd/mm/yyyy
    supabase.from('receive_logs').select('receive_date').order('receive_date', { ascending: true  }).limit(1)
      .then(({ data }) => { if (data?.[0]?.receive_date) setDateFrom(isoToThai(data[0].receive_date)); });
    supabase.from('receive_logs').select('receive_date').order('receive_date', { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]?.receive_date) setDateTo(isoToThai(data[0].receive_date)); });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('receive_logs').select('supplier_current').then(({ data }) => {
      if (data) setSuppliers([...new Set(data.map(d => d.supplier_current).filter(Boolean))].sort());
    });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('receive_logs').select('drug_name').then(({ data }) => {
      if (data) setDrugNames([...new Set(data.map(d => d.drug_name).filter(Boolean))].sort());
    });
  }, []);

  useEffect(() => {
    const h = (e) => { if (drugRef.current && !drugRef.current.contains(e.target)) setShowDrugDd(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const loadStats = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    let q = supabase.from('receive_logs').select('supplier_current, drug_name, qty_received, total_price_vat, receive_date');
    const isoFrom = thaiToIso(dateFrom);
    const isoTo   = thaiToIso(dateTo);
    if (isoFrom)        q = q.gte('receive_date', isoFrom);
    if (isoTo)          q = q.lte('receive_date', isoTo);
    if (supplierFilter) q = q.eq('supplier_current', supplierFilter);
    if (drugFilter)     q = q.ilike('drug_name', `%${drugFilter}%`);
    const { data: rows } = await q;
    if (!rows || rows.length === 0) { setStats(null); setLoading(false); return; }

    const totalQty   = rows.reduce((s, r) => s + (r.qty_received || 0), 0);
    const totalValue = rows.reduce((s, r) => s + (r.total_price_vat || 0), 0);

    const aggBy = (key, valFn) => {
      const map = {};
      rows.forEach(r => { const k = r[key] || 'ไม่ระบุ'; map[k] = (map[k] || 0) + valFn(r); });
      return Object.entries(map).sort((a, b) => b[1] - a[1]);
    };

    setStats({
      total: rows.length,
      totalQty,
      totalValue,
      topSuppliers:      aggBy('supplier_current', r => r.total_price_vat || 0).slice(0, 10),
      topSuppliersQty:   aggBy('supplier_current', r => r.qty_received || 0).slice(0, 10),
      topDrugsByFreq:        (() => {
        const cnt = {};
        rows.forEach(r => { const k = r.drug_name || 'ไม่ระบุ'; cnt[k] = (cnt[k] || 0) + 1; });
        return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 10);
      })(),
      topDrugsByValuePerTx:  (() => {
        const val = {}, cnt = {};
        rows.forEach(r => { const k = r.drug_name || 'ไม่ระบุ'; val[k] = (val[k] || 0) + (r.total_price_vat || 0); cnt[k] = (cnt[k] || 0) + 1; });
        return Object.entries(val).map(([name, total]) => [name, Math.round(total / (cnt[name] || 1))]).sort((a, b) => b[1] - a[1]).slice(0, 10);
      })(),
    });
    setLoading(false);
  }, [dateFrom, dateTo, supplierFilter, drugFilter]);

  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-start justify-center z-50 p-3 pt-4 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col mb-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-emerald-800 p-5 flex justify-between items-center text-white rounded-t-2xl">
          <h3 className="text-xl font-bold flex items-center gap-3">
            <BarChart3 size={22} className="text-emerald-300"/> สรุปข้อมูลการรับเข้าคลัง
          </h3>
          <button onClick={onClose} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-colors"><X size={20}/></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Filters */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-600">กรองข้อมูล:</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">ตั้งแต่</span>
              <ThaiDateInput value={dateFrom} onChange={setDateFrom} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">ถึง</span>
              <ThaiDateInput value={dateTo} onChange={setDateTo} />
            </div>
            <select value={supplierFilter} onChange={e => setSupplier(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
              <option value="">ทุกบริษัท</option>
              {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {/* Drug search dropdown */}
            <div className="relative" ref={drugRef}>
              <input
                type="text" value={drugFilter}
                onChange={e => { setDrugFilter(e.target.value); setShowDrugDd(true); }}
                onFocus={() => { if (drugFilter.trim()) setShowDrugDd(true); }}
                placeholder="ค้นหายา..."
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 w-40"
              />
              {drugFilter && <button onClick={() => setDrugFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X size={12}/></button>}
              {showDrugDd && drugFilter && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 w-64 overflow-hidden">
                  {drugNames.filter(n => n.toLowerCase().includes(drugFilter.toLowerCase())).slice(0,8).map(name => (
                    <button key={name} onMouseDown={e => { e.preventDefault(); setDrugFilter(name); setShowDrugDd(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-emerald-50 border-b border-slate-100 last:border-0">{name}</button>
                  ))}
                </div>
              )}
            </div>
            {(dateFrom || dateTo || supplierFilter || drugFilter) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); setSupplier(''); setDrugFilter(''); }}
                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"><X size={12}/>ล้าง</button>
            )}
          </div>

          {loading ? (
            <p className="text-center text-slate-400 py-16">กำลังโหลด...</p>
          ) : !stats ? (
            <p className="text-center text-slate-400 py-16">ไม่มีข้อมูลในช่วงที่เลือก</p>
          ) : (
            <>
              {/* KPI */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label:'รายการรับทั้งหมด',      value:(allTimeTotal ?? '...').toLocaleString?.() ?? '...', unit:'รายการ (ทุกช่วงเวลา)', bg:'bg-indigo-50',  bd:'border-indigo-200',  lbl:'text-indigo-600',  val:'text-indigo-900'  },
                  { label:'ปริมาณรับรวม (กรอง)',   value:stats.totalQty.toLocaleString(undefined,{maximumFractionDigits:0}), unit:'หน่วย', bg:'bg-emerald-50', bd:'border-emerald-200', lbl:'text-emerald-600', val:'text-emerald-900' },
                  { label:'มูลค่ารับทั้งหมด (บาท)', value:allTimeValue != null ? allTimeValue.toLocaleString(undefined,{maximumFractionDigits:0}) : '...', unit:'บาท (ทุกช่วงเวลา)', bg:'bg-amber-50', bd:'border-amber-200', lbl:'text-amber-600', val:'text-amber-900' },
                ].map((k,i) => (
                  <div key={i} className={`${k.bg} border ${k.bd} rounded-xl p-4 shadow-sm`}>
                    <div className={`text-xs font-bold uppercase tracking-wide ${k.lbl} mb-1`}>{k.label}</div>
                    <div className={`text-2xl font-black ${k.val}`}>{k.value}</div>
                    <div className="text-xs text-slate-500">{k.unit}</div>
                  </div>
                ))}
              </div>

              {/* Bar charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <BarSection title="บริษัทที่มูลค่าสูงสุด (บาท)"    items={stats.topSuppliers}    barColor="bg-emerald-500" unit="บาท"   />
                <BarSection title="บริษัทที่รับปริมาณสูงสุด (หน่วย)" items={stats.topSuppliersQty} barColor="bg-teal-400"    unit="หน่วย" />
              </div>
              {/* Drug comparison — frequency vs value/tx */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h4 className="font-bold text-slate-700 mb-1 flex items-center gap-2">
                  <BarChart3 size={16} className="text-emerald-500"/> ยาที่รับเข้าบ่อยและมูลค่าต่อครั้ง
                </h4>
                <div className="flex gap-5 mb-4 pt-2 border-b border-slate-100 pb-3">
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="inline-block w-3 h-3 rounded-full bg-indigo-400"/>&nbsp;จำนวนครั้งที่รับ</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="inline-block w-3 h-3 rounded-full bg-amber-400"/>&nbsp;มูลค่าเฉลี่ย/ครั้ง (บาท)</span>
                </div>
                {(() => {
                  const freqMap  = Object.fromEntries(stats.topDrugsByFreq);
                  const valTxMap = Object.fromEntries(stats.topDrugsByValuePerTx);
                  const maxFreq  = stats.topDrugsByFreq[0]?.[1] || 1;
                  const maxValTx = stats.topDrugsByValuePerTx[0]?.[1] || 1;
                  // merge: union ของทั้งสองลิสต์ เรียงตามความถี่
                  const names = [...new Set([...stats.topDrugsByFreq.map(([n]) => n), ...stats.topDrugsByValuePerTx.map(([n]) => n)])].slice(0, 10);
                  return (
                    <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                      {names.map((name, i) => {
                        const freq  = freqMap[name]  || 0;
                        const valTx = valTxMap[name] || 0;
                        return (
                          <div key={i} className="flex items-center gap-3 hover:bg-slate-50 rounded-lg px-1 py-0.5 transition-colors">
                            <span className={`text-xs font-black w-5 text-center shrink-0 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-400' : 'text-slate-300'}`}>
                              {i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-700 truncate mb-1">{name}</p>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div className="bg-indigo-400 h-1.5 rounded-full" style={{width:`${(freq/maxFreq)*100}%`}}/>
                                  </div>
                                  <span className="text-xs font-bold text-indigo-700 w-16 text-right shrink-0">{freq} ครั้ง</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div className="bg-amber-400 h-1.5 rounded-full" style={{width:`${(valTx/maxValTx)*100}%`}}/>
                                  </div>
                                  <span className="text-xs font-bold text-amber-700 w-20 text-right shrink-0">{Number(valTx).toLocaleString(undefined,{maximumFractionDigits:0})} ฿</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>

        <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end rounded-b-2xl">
          <button onClick={onClose} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors shadow-sm">ปิด</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Shared bar chart section
// ============================================================
function BarSection({ title, items, barColor, unit }) {
  if (!items || items.length === 0) return null;
  const max = items[0][1] || 1;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
        <BarChart3 size={16} className="text-slate-400"/> {title}
      </h4>
      <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
        {items.map(([name, val], i) => (
          <div key={i}>
            <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
              <span className="truncate mr-2">{name}</span>
              <span className="font-bold text-slate-700 shrink-0">{Number(val).toLocaleString(undefined,{maximumFractionDigits:0})} {unit}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div className={`${barColor} h-2 rounded-full`} style={{ width:`${(val/max)*100}%` }}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
