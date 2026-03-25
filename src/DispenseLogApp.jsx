import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase';
import {
  ArrowLeft, UploadCloud, RefreshCcw, Search, X,
  FileSpreadsheet, ChevronDown, ChevronUp, AlertCircle,
  TrendingDown, BarChart3, Pencil, Trash2, Save,
} from 'lucide-react';

// ============================================================
// Column aliases
// ============================================================
const COL_MAP = {
  dispense_date: ['วันที่เบิก', 'วันที่', 'date', 'dispense_date'],
  main_log:      ['mainlog', 'main_log', 'main log', 'log หลัก'],
  detail_log:    ['detailedlog', 'detail_log', 'detailed log', 'detaillog', 'log ย่อย', 'กลุ่ม'],
  department:    ['หน่วยงานที่เบิก', 'หน่วยงานที่', 'หน่วยงาน', 'department', 'แผนก', 'ward'],
  note:          ['หมายเหตุ', 'note', 'notes', 'remark'],
  drug_code:     ['รหัส', 'รหัสยา', 'code', 'drug_code', 'รหัส hosxp', 'รหัสhosxp'],
  drug_name:     ['รายการยา', 'ชื่อยา', 'drug_name', 'name', 'item'],
  drug_type:     ['ชนิดยา', 'ชนิด', 'ประเภท', 'type', 'drug_type', 'รูปแบบ'],
  item_type:     ['ชนิดรายการ', 'item_type', 'item type'],
  drug_unit:     ['หน่วยนับ', 'unit_label', 'drug_unit', 'หน่วยยา', 'หน่วย'],
  price_per_unit:['ราคา/หน่วย', 'ราคาต่อหน่วย', 'price', 'price_per_unit', 'unit price'],
  lot:           ['lot', 'lot.', 'lot number', 'lot no', 'เลขที่ lot'],
  exp:           ['exp', 'exp.', 'exp date', 'วันหมดอายุ'],
  near_exp_date: ['วันที่ใกล้exp', 'วันที่ใกล้ exp', 'near_exp_date', 'วันใกล้หมดอายุ', 'วันที่ใกล้หมดอายุ'],
  qty_before:    ['คงเหลือก่อนเบิก', 'คงเหลือก่อน', 'ยอดก่อน', 'before', 'qty_before', 'stock before'],
  qty_out:       ['ปริมาณ (ออก)', 'ปริมาณออก', 'จำนวนเบิก', 'qty_out', 'out', 'จำนวน'],
  qty_after:     ['คงเหลือหลังจ่าย', 'คงเหลือหลัง', 'ยอดหลัง', 'after', 'qty_after', 'stock after'],
};

const CHUNK = 300;

// ดึง unique departments ทั้งหมด (pagination รอบ 1000)
async function fetchAllDepts(supabaseClient) {
  const PAGE = 1000;
  const found = new Set();
  let from = 0;
  while (true) {
    const { data } = await supabaseClient
      .from('dispense_logs')
      .select('department')
      .not('department', 'is', null)
      .neq('department', '-')
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    data.forEach(r => { if (r.department && r.department !== '-') found.add(r.department); });
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return [...found].sort();
}

function DrugTypeBadge({ type }) {
  if (!type || type === '-') return null;
  const t = type.trim().toLowerCase();
  let cls = 'bg-slate-100 text-slate-600';
  if (t.includes('เม็ด') || t.includes('tablet') || t.includes('cap')) cls = 'bg-blue-100 text-blue-700';
  else if (t.includes('น้ำ') || t.includes('syrup') || t.includes('liquid') || t.includes('sol')) cls = 'bg-emerald-100 text-emerald-700';
  else if (t.includes('ฉีด') || t.includes('inject') || t.includes('iv') || t.includes('im')) cls = 'bg-rose-100 text-rose-700';
  else if (t.includes('apply') || t.includes('cream') || t.includes('oint') || t.includes('ทา')) cls = 'bg-amber-100 text-amber-700';
  else if (t.includes('inhale') || t.includes('สูด') || t.includes('spray')) cls = 'bg-purple-100 text-purple-700';
  return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{type}</span>;
}

const FIELD_LABELS = {
  dispense_date:  'วันที่เบิก',
  main_log:       'MainLog',
  detail_log:     'DetailedLog',
  department:     'หน่วยงาน',
  note:           'หมายเหตุ',
  drug_code:      'รหัสยา',
  drug_name:      'ชื่อรายการยา',
  drug_type:      'รูปแบบยา',
  item_type:      'ชนิดรายการ',
  drug_unit:      'หน่วยยา',
  price_per_unit: 'ราคา/หน่วย',
  lot:            'Lot',
  exp:            'Exp',
  near_exp_date:  'วันที่ใกล้ Exp',
  qty_before:     'คงเหลือก่อนเบิก',
  qty_out:        'ปริมาณออก',
  qty_after:      'คงเหลือหลังจ่าย',
};

function matchHeader(header) {
  const h = header.toLowerCase().trim().replace(/\s+/g, ' ');
  // Pass 1: exact match (highest priority — prevents false partial matches)
  for (const [field, aliases] of Object.entries(COL_MAP)) {
    if (aliases.some(a => h === a.toLowerCase().trim())) return field;
  }
  // Pass 2: partial includes — only for aliases >= 7 chars to avoid short-alias collisions
  // e.g. "ชนิด" won't match "ชนิดรายการ", "วันที่" won't match "วันที่ใกล้exp"
  for (const [field, aliases] of Object.entries(COL_MAP)) {
    if (aliases.some(a => a.trim().length >= 7 && h.includes(a.toLowerCase().trim()))) return field;
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

const fmtDate = (iso) => {
  if (!iso || iso === '-') return '-';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

// ถ้า drug_unit เป็นตัวเลข → ถือว่าเป็นราคา ไม่ใช่หน่วย text
const isNumericVal = (v) => v != null && String(v).trim() !== '' && !isNaN(parseFloat(String(v))) && isFinite(String(v).trim());

// หน่วยยาที่เป็น text (กรองตัวเลขออก)
const getUnit = (r) => {
  if (!r.drug_unit || r.drug_unit === '-') return '-';
  return isNumericVal(r.drug_unit) ? '-' : String(r.drug_unit).trim();
};

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

function ThaiDateInput({ value, onChange, ring = 'focus-within:ring-rose-400', size = 'w-28' }) {
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

// ราคา/หน่วย พร้อม fallback จาก drug_unit ถ้า price_per_unit ไม่มี
const getPrice = (r) => {
  if (r.price_per_unit != null && r.price_per_unit !== '') return parseFloat(r.price_per_unit);
  if (isNumericVal(r.drug_unit)) return parseFloat(r.drug_unit);
  return null;
};

// แปลง Excel serial / text date หลายรูปแบบ → d/m/yyyy
const fmtAnyDate = (raw) => {
  if (!raw && raw !== 0) return '-';
  const s = String(raw).trim();
  if (!s || s === '-') return '-';
  // Excel serial number (4-5 digits, no separator)
  if (/^\d{4,5}$/.test(s)) {
    const ms = (parseInt(s) - 25569) * 86400000;
    const d = new Date(ms);
    if (!isNaN(d)) return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
  }
  // Slash/dash separated date → parse then reformat
  const iso = parseDate(s);
  if (iso) return fmtDate(iso);
  return s;
};

function parseDate(raw) {
  if (!raw || raw === '-' || raw.trim() === '') return null;
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
export default function DispenseLogApp({ onBack }) {
  const [tab, setTab]             = useState('view');
  const [showSummary, setShowSummary] = useState(false);

  return (
    <div className="min-h-screen bg-slate-200 text-slate-800 font-sans">
      <div className="sticky top-0 z-10 bg-rose-700 shadow-md px-4 py-3 flex items-center gap-2">
        <button onClick={onBack} className="text-rose-100 hover:text-white p-1 transition-colors shrink-0"><ArrowLeft size={20} /></button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <TrendingDown size={20} className="text-white shrink-0" />
          <span className="font-semibold text-white truncate">บันทึกการเบิกจ่าย (คลังเบิก)</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setShowSummary(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/20 text-white hover:bg-white/30 border border-white/30 transition-all">
            <BarChart3 size={15} /> สรุปผล
          </button>
          <button onClick={() => setTab('import')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === 'import' ? 'bg-white text-rose-700 font-bold' : 'text-rose-100 hover:text-white hover:bg-white/20'}`}
          >Import CSV</button>
        </div>
      </div>

      {tab === 'import' && <DispenseImport onDone={() => setTab('view')} />}
      {tab === 'view'   && <DispenseView />}
      {showSummary      && <DispenseSummaryModal onClose={() => setShowSummary(false)} />}
    </div>
  );
}

// ============================================================
// CSV Import
// ============================================================
function DispenseImport({ onDone }) {
  const [status, setStatus]         = useState('');
  const [error, setError]           = useState('');
  const [preview, setPreview]       = useState(null);
  const [mapping, setMapping]       = useState({});
  const [rawHeaders, setRawHeaders] = useState([]);
  const [rawRows, setRawRows]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [uploadWarnings, setUploadWarnings] = useState(null);
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
        headers.forEach((h, i) => { const field = matchHeader(h); if (field) autoMap[field] = i; });
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
      const warnRows = [];
      const activeRaws = rawRows
        .map((row, i) => ({ row, rowNum: i + 2 }))
        .filter(({ row }) => row.some(c => c.trim()));

      const rows = activeRaws.map(({ row, rowNum }) => {
          const drugName = getVal(row, 'drug_name');
          const drugCode = normalizeCode(getVal(row, 'drug_code'));
          const lot      = getVal(row, 'lot') || '-';

          const issues = [];
          if (!drugName) issues.push('ไม่มีชื่อยา');
          if (!drugCode || drugCode === '-') issues.push('ไม่มีรหัสยา');
          if (!lot || lot === '-') issues.push('ไม่มี Lot');
          if (issues.length > 0) warnRows.push({ row: rowNum, name: drugName || '-', code: drugCode || '-', issues });

          const qtyOut = parseFloat(String(getVal(row, 'qty_out') || '0').replace(/,/g, '')) || 0;
          return {
            dispense_date:  parseDate(getVal(row, 'dispense_date')) || new Date().toISOString().slice(0,10),
            main_log:       getVal(row, 'main_log') || '-',
            detail_log:     getVal(row, 'detail_log') || '-',
            department:     getVal(row, 'department') || '-',
            note:           getVal(row, 'note'),
            drug_code:      drugCode,
            drug_name:      drugName || '-',
            drug_type:      getVal(row, 'drug_type') || '-',
            item_type:      getVal(row, 'item_type') || null,
            drug_unit:      getVal(row, 'drug_unit') || '-',
            price_per_unit: parseFloat(String(getVal(row, 'price_per_unit') || '0').replace(/,/g, '')) || null,
            lot,
            exp:            getVal(row, 'exp') || '-',
            near_exp_date:  parseDate(getVal(row, 'near_exp_date')) || null,
            qty_before:     parseFloat(String(getVal(row, 'qty_before') || '').replace(/,/g, '')) || null,
            qty_out:        qtyOut,
            qty_after:      parseFloat(String(getVal(row, 'qty_after') || '').replace(/,/g, '')) || null,
            source:         'csv',
          };
        });

      // Backfill drug_unit: ถ้าบางแถวไม่มีหน่วย ให้ดึงจากแถวอื่นที่มีรหัสยาเดียวกัน
      const unitByCode = {};
      rows.forEach(r => {
        if (r.drug_unit && r.drug_unit !== '-' && r.drug_code && r.drug_code !== '-') {
          unitByCode[r.drug_code] = r.drug_unit;
        }
      });
      rows.forEach(r => {
        if ((!r.drug_unit || r.drug_unit === '-') && r.drug_code && r.drug_code !== '-' && unitByCode[r.drug_code]) {
          r.drug_unit = unitByCode[r.drug_code];
        }
      });

      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: e } = await supabase.from('dispense_logs').insert(rows.slice(i, i + CHUNK));
        if (e) throw e;
      }
      setStatus(`นำเข้าสำเร็จ ${rows.length.toLocaleString()} รายการ`);
      setPreview(null); setRawRows([]); setRawHeaders([]);
      if (warnRows.length > 0) setUploadWarnings({ fileName: preview?.fileName || '', type: 'CSV คลังเบิก', rows: warnRows });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      {/* Upload Warning Modal */}
      {uploadWarnings && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="bg-amber-500 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <div>
                <p className="font-bold text-lg">⚠️ พบ Row ที่ไม่ผ่านเงื่อนไข</p>
                <p className="text-amber-100 text-sm">{uploadWarnings.type}: {uploadWarnings.fileName} — {uploadWarnings.rows.length} row มีปัญหา</p>
              </div>
              <button onClick={() => setUploadWarnings(null)} className="text-white/80 hover:text-white bg-white/20 hover:bg-white/30 p-2 rounded-xl transition-colors">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {uploadWarnings.rows.map((r, i) => (
                <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm">
                  <div className="flex gap-3 items-start">
                    <span className="font-mono bg-amber-200 text-amber-900 px-2 py-0.5 rounded text-xs font-bold shrink-0">Row {r.row}</span>
                    <div className="flex-1">
                      <span className="font-semibold text-slate-800">{r.name}</span>
                      {r.code && r.code !== '-' && <span className="text-slate-400 ml-2 text-xs">[{r.code}]</span>}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.issues.map((issue, j) => (
                          <span key={j} className="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full text-xs">{issue}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center">
              <p className="text-sm text-slate-500">ข้อมูลที่ถูกต้องถูกบันทึกแล้ว — แก้ไข CSV แล้วอัปโหลดใหม่</p>
              <button onClick={() => setUploadWarnings(null)} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium text-sm">รับทราบ</button>
            </div>
          </div>
        </div>
      )}

      <div onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-slate-300 hover:border-rose-400 bg-white rounded-2xl p-10 text-center cursor-pointer transition-colors">
        <FileSpreadsheet size={40} className="mx-auto mb-3 text-slate-400" />
        <p className="font-semibold text-slate-700">คลิกเพื่อเลือกไฟล์ CSV คลังเบิก</p>
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
              { label: 'วันที่เบิก',         req: true,  hints: ['วันที่เบิก', 'วันที่', 'dispense_date'] },
              { label: 'ชื่อรายการยา',       req: true,  hints: ['รายการยา', 'ชื่อยา', 'drug_name'] },
              { label: 'รหัสยา',             req: false, hints: ['รหัสยา', 'รหัส', 'code'] },
              { label: 'รูปแบบยา',           req: false, hints: ['ชนิด', 'ประเภท', 'drug_type'] },
              { label: 'ชนิดรายการ',         req: false, hints: ['ชนิดรายการ', 'item_type'] },
              { label: 'หน่วยงาน',           req: false, hints: ['หน่วยงานที่เบิก', 'หน่วยงานที่', 'หน่วยงาน', 'department'] },
              { label: 'ปริมาณออก',          req: false, hints: ['ปริมาณ (ออก)', 'ปริมาณออก', 'qty_out'] },
              { label: 'คงเหลือก่อนเบิก',    req: false, hints: ['คงเหลือก่อนเบิก', 'qty_before'] },
              { label: 'คงเหลือหลังจ่าย',    req: false, hints: ['คงเหลือหลังจ่าย', 'qty_after'] },
              { label: 'Lot',                req: false, hints: ['lot', 'lot.', 'เลขที่ lot'] },
              { label: 'Exp',                req: false, hints: ['exp', 'exp.', 'วันหมดอายุ'] },
              { label: 'วันที่ใกล้ Exp',     req: false, hints: ['วันที่ใกล้ exp', 'near_exp_date'] },
              { label: 'ราคา/หน่วย',         req: false, hints: ['ราคา/หน่วย', 'ราคาต่อหน่วย', 'price_per_unit'] },
              { label: 'หน่วยยา',            req: false, hints: ['หน่วยนับ', 'unit_label', 'drug_unit'] },
              { label: 'MainLog',            req: false, hints: ['mainlog', 'main_log', 'main log'] },
              { label: 'DetailedLog',        req: false, hints: ['detailedlog', 'detail_log', 'กลุ่ม'] },
              { label: 'หมายเหตุ',           req: false, hints: ['หมายเหตุ', 'note', 'remark'] },
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
            <div className="grid grid-cols-1 gap-1.5 max-h-72 overflow-y-auto mt-2 pr-1">
              {Object.keys(COL_MAP).map(field => (
                <div key={field} className="grid gap-2 items-center" style={{gridTemplateColumns:'10rem 1fr'}}>
                  <span className="text-xs text-slate-600 font-medium truncate">{FIELD_LABELS[field] || field}</span>
                  <select value={mapping[field] ?? ''}
                    onChange={e => setMapping(p => ({ ...p, [field]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400">
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
            <UploadCloud size={18} />
            {loading ? 'กำลังนำเข้า...' : `นำเข้า ${rawRows.filter(r => r.some(c=>c.trim())).length.toLocaleString()} รายการ`}
          </button>
        </div>
      )}

      {status && (
        <button onClick={onDone} className="w-full bg-rose-600 hover:bg-rose-700 text-white rounded-xl py-3 font-semibold transition-all flex items-center justify-center gap-2">
          <ArrowLeft size={18}/> กลับไปหน้าประวัติเบิกยา
        </button>
      )}
    </div>
  );
}

// ============================================================
// Inventory helper — ปรับ qty ตาม delta (+คืน / -เบิก)
// ============================================================
// normalize lot/invoice — ลบ space, -, /, . แล้ว lowercase
const normKey = (s) => (s || '').trim().replace(/[\s\-\/\.]/g, '').toLowerCase();

async function adjustInventory(code, lot, delta) {
  if (!delta || !code || !lot || !supabase) return;
  const nCode = normKey(code);
  const nLot  = normKey(lot);
  // fetch ทุก row ของ code นี้ แล้ว filter lot ฝั่ง client ด้วย normKey
  const { data } = await supabase
    .from('inventory')
    .select('id, qty, lot')
    .ilike('code', nCode);
  if (!data || data.length === 0) return;
  const matched = data.filter(r => normKey(r.lot) === nLot);
  if (matched.length === 0) return;
  // เลือก row ที่มี qty มากสุด
  const inv = matched.reduce((a, b) =>
    (parseFloat(String(b.qty||'0').replace(/,/g,''))||0) >
    (parseFloat(String(a.qty||'0').replace(/,/g,''))||0) ? b : a
  );
  const current = parseFloat(String(inv.qty || '0').replace(/,/g, '')) || 0;
  const updated = Math.max(0, current + delta);
  await supabase.from('inventory').update({ qty: String(updated) }).eq('id', inv.id);
}

// ============================================================
// Edit Modal
// ============================================================
function EditModal({ row, onClose, onSaved }) {
  const [form, setForm] = useState({
    dispense_date:  row.dispense_date  || '',
    drug_name:      row.drug_name      || '',
    drug_code:      row.drug_code      || '',
    drug_type:      row.drug_type      || '',
    lot:            row.lot            || '',
    exp:            row.exp            || '',
    qty_out:        row.qty_out        ?? '',
    qty_before:     row.qty_before     ?? '',
    qty_after:      row.qty_after      ?? '',
    drug_unit:      row.drug_unit      || row.unit_label || '',
    price_per_unit: row.price_per_unit ?? '',
    department:     row.department     || '',
    main_log:       row.main_log       || '',
    detail_log:     row.detail_log     || '',
    note:           row.note           || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!supabase) return;
    setSaving(true); setError('');
    const newQtyOut = form.qty_out !== '' ? Number(form.qty_out) : null;
    const payload = {
      dispense_date:  form.dispense_date  || null,
      drug_name:      form.drug_name      || null,
      drug_code:      form.drug_code      || null,
      drug_type:      form.drug_type      || null,
      lot:            form.lot            || null,
      exp:            form.exp            || null,
      qty_out:        newQtyOut,
      qty_before:     form.qty_before !== '' ? Number(form.qty_before)  : null,
      qty_after:      form.qty_after !== '' ? Number(form.qty_after)    : null,
      drug_unit:      form.drug_unit      || null,
      price_per_unit: form.price_per_unit !== '' ? Number(form.price_per_unit) : null,
      department:     form.department     || null,
      main_log:       form.main_log       || null,
      detail_log:     form.detail_log     || null,
      note:           form.note           || null,
    };
    const { error: e } = await supabase.from('dispense_logs').update(payload).eq('id', row.id);
    if (e) { setError(e.message); setSaving(false); return; }

    // --- อัปเดต inventory ---
    const oldCode = (row.drug_code || '').trim();
    const oldLot  = (row.lot  || '').trim();
    const newCode = (form.drug_code || '').trim();
    const newLot  = (form.lot  || '').trim();
    const oldQty  = row.qty_out || 0;
    const newQty  = newQtyOut   || 0;

    if (oldCode && oldLot && newCode && newLot) {
      const sameCodeLot = oldCode.toLowerCase() === newCode.toLowerCase() &&
                          oldLot.toLowerCase()  === newLot.toLowerCase();
      if (sameCodeLot) {
        // lot เดิม: คืน/ลดตาม delta
        const delta = oldQty - newQty;
        if (delta !== 0) await adjustInventory(newCode, newLot, delta);
      } else {
        // lot เปลี่ยน: คืน lot เก่า + ลด lot ใหม่
        await adjustInventory(oldCode, oldLot,  oldQty);
        await adjustInventory(newCode, newLot, -newQty);
      }
    }

    setSaving(false);
    onSaved();
  };

  const fields = [
    ['วันที่เบิก',       'dispense_date',  'date'],
    ['ชื่อรายการยา',     'drug_name',      'text'],
    ['รหัสยา',          'drug_code',      'text'],
    ['รูปแบบยา',         'drug_type',      'text'],
    ['Lot',              'lot',            'text'],
    ['Exp',              'exp',            'text'],
    ['จำนวนเบิก',        'qty_out',        'number'],
    ['คงเหลือก่อนเบิก',  'qty_before',     'number'],
    ['คงเหลือหลังจ่าย',  'qty_after',      'number'],
    ['หน่วย',            'drug_unit',      'text'],
    ['ราคา/หน่วย',       'price_per_unit', 'number'],
    ['หน่วยงาน',          'department',     'text'],
    ['MainLog',          'main_log',       'text'],
    ['DetailedLog',      'detail_log',     'text'],
    ['หมายเหตุ',          'note',           'text'],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Pencil size={16} className="text-indigo-500"/> แก้ไขรายการเบิก
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18}/></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-3">
          {fields.map(([label, key, type]) => (
            <div key={key} className="flex items-center gap-3">
              <label className="text-xs text-slate-500 w-36 shrink-0 text-right">{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={e => set(key, e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          ))}
          {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-slate-200">
          <button onClick={onClose} className="flex-1 border border-slate-300 text-slate-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2">
            <Save size={15}/>{saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// View / Search
// ============================================================
function DispenseView() {
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [departments, setDepts]     = useState([]);
  const [expanded, setExpanded]     = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [page, setPage]             = useState(0);
  const PAGE_SIZE = 50;
  const [drugNames, setDrugNames]       = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedDrug, setSelectedDrug] = useState('');
  const [drugRows, setDrugRows]         = useState([]);
  const [drugLoading, setDrugLoading]   = useState(false);
  const [drugDateFrom, setDrugDateFrom] = useState('');
  const [drugDateTo, setDrugDateTo]     = useState('');
  const searchRef = useRef(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    let q = supabase.from('dispense_logs').select('*')
      .order('dispense_date', { ascending: false })
      .order('id', { ascending: false });
    if (deptFilter)    q = q.eq('department', deptFilter);
    const isoFrom = thaiToIso(dateFrom) || dateFrom;
    const isoTo   = thaiToIso(dateTo)   || dateTo;
    if (dateFrom && dateTo)   { q = q.gte('dispense_date', isoFrom).lte('dispense_date', isoTo); }
    else if (dateFrom)        { q = q.eq('dispense_date', isoFrom); }
    else if (dateTo)          { q = q.lte('dispense_date', isoTo); }
    if (search.trim()) q = q.or(`drug_name.ilike.%${search}%,drug_code.ilike.%${search}%,lot.ilike.%${search}%`);
    q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    const { data } = await q;
    setRows(data || []);
    setLoading(false);
  }, [search, deptFilter, dateFrom, dateTo, page]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  useEffect(() => {
    if (!supabase) return;
    fetchAllDepts(supabase).then(setDepts);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('dispense_logs').select('drug_name, drug_type').then(({ data }) => {
      if (!data) return;
      const typeMap = {};
      data.forEach(d => { if (d.drug_name && d.drug_type && d.drug_type !== '-') typeMap[d.drug_name] = d.drug_type; });
      const names = [...new Set(data.map(d => d.drug_name).filter(Boolean))].sort();
      setDrugNames(names.map(name => ({ name, type: typeMap[name] || '' })));
    });
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const totalOut   = rows.reduce((s, r) => s + (r.qty_out || 0), 0);
  const totalValue = rows.reduce((s, r) => s + ((r.qty_out || 0) * (getPrice(r) || 0)), 0);
  const hasFilter  = search || deptFilter || dateFrom || dateTo;

  const clearAll = () => { setSearch(''); setDeptFilter(''); setDateFrom(''); setDateTo(''); setPage(0); };

  const handleDelete = async (row, e) => {
    e.stopPropagation();
    if (!window.confirm(`ลบรายการ "${row.drug_name}" วันที่ ${fmtDate(row.dispense_date)} ใช่หรือไม่?\nระบบจะคืนยอดคงเหลือ ${row.qty_out || 0} หน่วยกลับ inventory`)) return;
    if (!supabase) return;
    await supabase.from('dispense_logs').delete().eq('id', row.id);
    // คืน qty กลับ inventory
    if (row.drug_code && row.lot && row.qty_out) {
      await adjustInventory(row.drug_code, row.lot, row.qty_out);
    }
    setExpanded(null);
    load();
  };

  // โหลด rows ของยาที่เลือก
  useEffect(() => {
    if (!selectedDrug || !supabase) { setDrugRows([]); return; }
    setDrugLoading(true);
    supabase.from('dispense_logs')
      .select('*')
      .eq('drug_name', selectedDrug)
      .order('dispense_date', { ascending: false })
      .then(({ data }) => { setDrugRows(data || []); setDrugLoading(false); });
  }, [selectedDrug]);

  const filteredDrugRows = drugRows.filter(r => {
    if (drugDateFrom && r.dispense_date < (thaiToIso(drugDateFrom) || drugDateFrom)) return false;
    if (drugDateTo   && r.dispense_date > (thaiToIso(drugDateTo)   || drugDateTo))   return false;
    return true;
  });
  const drugCode      = drugRows.find(r => r.drug_code && r.drug_code !== '-')?.drug_code || '-';
  const drugUnit      = drugRows.map(r => getUnit(r)).find(u => u !== '-') || '-';
  const drugTotalQty  = filteredDrugRows.reduce((s, r) => s + (r.qty_out || 0), 0);
  const drugTotalVal  = filteredDrugRows.reduce((s, r) => s + ((r.qty_out || 0) * (getPrice(r) || 0)), 0);

  const filteredDrugs = search.trim()
    ? drugNames.filter(n => n.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10)
    : [];

  const selectDrug = (name) => {
    setSearch(name);
    setSelectedDrug(name);
    setShowDropdown(false);
    setPage(0);
  };

  const clearSearchDrug = () => {
    setSearch('');
    setSelectedDrug('');
    setDrugRows([]);
    setDrugDateFrom('');
    setDrugDateTo('');
    setPage(0);
  };

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      {editingRow && (
        <EditModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSaved={() => { setEditingRow(null); load(); }}
        />
      )}
      {/* Filter card */}
      <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-xl p-3 shadow-sm space-y-2 sticky top-14 z-10">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]" ref={searchRef}>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" value={search}
              onChange={e => { setSearch(e.target.value); setSelectedDrug(''); setPage(0); setShowDropdown(true); }}
              onFocus={() => { if (search.trim()) setShowDropdown(true); }}
              placeholder="ค้นหาชื่อยา, รหัส, Lot..."
              className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
            {search && <button onClick={clearSearchDrug} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14}/></button>}
            {showDropdown && filteredDrugs.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
                {filteredDrugs.map(({ name, type }) => (
                  <button key={name} onMouseDown={e => { e.preventDefault(); selectDrug(name); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-rose-50 hover:text-rose-700 transition-colors border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{name}</span>
                      {type && <DrugTypeBadge type={type} />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(0); }}
            className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400">
            <option value="">ทุกหน่วยงาน</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={clearAll} className="text-slate-400 hover:text-slate-600 p-2 transition-colors" title="ล้างตัวกรองทั้งหมด">
            <RefreshCcw size={16} />
          </button>
        </div>
        {/* Date range row */}
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

      {/* ตารางประวัติเบิกยาที่เลือก */}
      {selectedDrug && (
        <div className="bg-white border border-rose-300 rounded-xl shadow-md overflow-hidden">
          {/* Header */}
          <div className="bg-rose-700 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-base">{selectedDrug}</p>
                <p className="text-xs text-rose-200 mt-0.5">รหัส: {drugCode} · หน่วย: {drugUnit}</p>
                {drugRows.length > 0 && (() => {
                  const depts = [...new Set(drugRows.map(r => r.department).filter(d => d && d !== '-'))];
                  return depts.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                      <span className="text-xs text-rose-200 font-semibold shrink-0">หน่วยงานที่เบิก:</span>
                      {depts.map(d => (
                        <span key={d} className="text-xs bg-white/20 border border-white/30 text-white px-2 py-0.5 rounded-full">{d}</span>
                      ))}
                    </div>
                  ) : null;
                })()}
              </div>
              <button onClick={clearSearchDrug} className="text-rose-200 hover:text-white shrink-0 mt-0.5"><X size={16}/></button>
            </div>
          </div>

          {/* Date filter */}
          <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate-500 font-medium">ช่วงวันที่:</span>
            <ThaiDateInput value={drugDateFrom} onChange={setDrugDateFrom} size="w-24" />
            <span className="text-xs text-slate-400">ถึง</span>
            <ThaiDateInput value={drugDateTo} onChange={setDrugDateTo} size="w-24" />
            {(drugDateFrom || drugDateTo) && (
              <button onClick={() => { setDrugDateFrom(''); setDrugDateTo(''); }}
                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-0.5"><X size={11}/>ล้าง</button>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 px-4 py-3">
            <div className="bg-slate-700 border border-slate-600 rounded-xl p-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-white">{filteredDrugRows.length.toLocaleString()}</p>
              <p className="text-xs text-slate-300 mt-0.5">รายการ (กรอง)</p>
            </div>
            <div className="bg-rose-700 border border-rose-600 rounded-xl p-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-white">{drugTotalQty.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
              <p className="text-xs text-rose-200 mt-0.5">ปริมาณรวม (ออก)</p>
            </div>
            <div className="bg-amber-600 border border-amber-500 rounded-xl p-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-white">{drugTotalVal.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
              <p className="text-xs text-amber-100 mt-0.5">มูลค่ารวม (บาท)</p>
            </div>
          </div>

          {/* Table */}
          {drugLoading ? (
            <p className="text-center text-slate-400 py-8 text-sm">กำลังโหลด...</p>
          ) : filteredDrugRows.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">ไม่พบข้อมูลในช่วงที่เลือก</p>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[480px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-[5]">
                  <tr className="text-xs text-white font-bold border-b border-slate-600">
                    <th className="px-4 py-2.5 text-left bg-slate-700">วันที่เบิก</th>
                    <th className="px-4 py-2.5 text-right bg-slate-700">จำนวน</th>
                    <th className="px-4 py-2.5 text-left bg-slate-700">หน่วย</th>
                    <th className="px-4 py-2.5 text-left bg-slate-700">Lot</th>
                    <th className="px-4 py-2.5 text-left bg-slate-700">Exp</th>
                    <th className="px-4 py-2.5 text-right bg-slate-700">ราคา/หน่วย</th>
                    <th className="px-4 py-2.5 text-right bg-slate-700">มูลค่า (บาท)</th>
                    <th className="px-4 py-2.5 text-left bg-slate-700">หน่วยงาน</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrugRows.map((r, i) => (
                    <tr key={r.id} className={`border-b border-slate-200 transition-colors ${i % 2 === 0 ? 'hover:bg-rose-50' : 'bg-slate-50 hover:bg-rose-50'}`}>
                      <td className="px-4 py-2.5 text-slate-800 whitespace-nowrap font-medium">{fmtDate(r.dispense_date)}</td>
                      <td className="px-4 py-2.5 text-rose-700 font-bold text-right whitespace-nowrap">-{(r.qty_out || 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-slate-700 text-xs whitespace-nowrap font-medium">{getUnit(r) !== '-' ? getUnit(r) : drugUnit}</td>
                      <td className="px-4 py-2.5 text-slate-700 text-xs whitespace-nowrap">{r.lot || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-700 text-xs whitespace-nowrap">{fmtAnyDate(r.exp)}</td>
                      <td className="px-4 py-2.5 text-slate-800 font-medium text-right whitespace-nowrap">{getPrice(r) != null ? Number(getPrice(r)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '-'}</td>
                      <td className="px-4 py-2.5 text-amber-800 font-bold text-right whitespace-nowrap">{getPrice(r) != null ? ((r.qty_out||0)*getPrice(r)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '-'}</td>
                      <td className="px-4 py-2.5 text-slate-800 max-w-[160px] truncate font-medium">{r.department || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Summary strip + main table — ซ่อนเมื่อดู drug detail panel */}
      {!selectedDrug && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-700 border border-slate-600 rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-white">{rows.length.toLocaleString()}</p>
            <p className="text-xs text-slate-300 mt-0.5">รายการ{hasFilter ? ' (กรอง)' : ' (หน้านี้)'}</p>
          </div>
          <div className="bg-rose-700 border border-rose-600 rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-white">{totalOut.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
            <p className="text-xs text-rose-200 mt-0.5">ปริมาณรวม (ออก)</p>
          </div>
          <div className="bg-amber-600 border border-amber-500 rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-white">{totalValue.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
            <p className="text-xs text-amber-100 mt-0.5">มูลค่ารวม (บาท)</p>
          </div>
        </div>
      )}

      {!selectedDrug && loading && <p className="text-center text-slate-400 py-10">กำลังโหลด...</p>}
      {!selectedDrug && !loading && rows.length === 0 && (
        <div className="text-center text-slate-400 py-20">
          <TrendingDown size={48} className="mx-auto mb-3 opacity-30" />
          <p>ไม่พบข้อมูล{hasFilter ? ' — ลองเปลี่ยนตัวกรอง' : ' — กด Import CSV เพื่อนำเข้าข้อมูล'}</p>
        </div>
      )}

      {!selectedDrug && rows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-260px)]">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="sticky top-0 z-[5]">
                <tr className="text-xs text-white font-bold border-b border-slate-600">
                  <th className="px-4 py-2.5 text-left bg-slate-700">วันที่เบิก</th>
                  <th className="px-4 py-2.5 text-left bg-slate-700">ชื่อรายการยา</th>
                  <th className="px-4 py-2.5 text-right bg-slate-700">จำนวน</th>
                  <th className="px-4 py-2.5 text-left bg-slate-700">หน่วย</th>
                  <th className="px-4 py-2.5 text-left bg-slate-700">Lot</th>
                  <th className="px-4 py-2.5 text-left bg-slate-700">Exp</th>
                  <th className="px-4 py-2.5 text-right bg-slate-700">ราคา/หน่วย</th>
                  <th className="px-4 py-2.5 text-right bg-slate-700">มูลค่า (บาท)</th>
                  <th className="px-4 py-2.5 text-left bg-slate-700">หน่วยงาน</th>
                  <th className="px-4 py-2.5 w-8 bg-slate-700"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <React.Fragment key={row.id}>
                    <tr
                      onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                      className={`border-b border-slate-200 cursor-pointer transition-colors ${expanded === row.id ? 'bg-rose-100' : i % 2 === 0 ? 'hover:bg-rose-50' : 'bg-slate-50 hover:bg-rose-50'}`}
                    >
                      <td className="px-4 py-2.5 text-slate-800 whitespace-nowrap font-medium">{fmtDate(row.dispense_date)}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900 max-w-[220px]">
                        <span className="block truncate">{row.drug_name}</span>
                        <span className="text-xs text-slate-600 font-normal">{row.drug_code}</span>
                      </td>
                      <td className="px-4 py-2.5 text-rose-700 font-bold text-right whitespace-nowrap">-{(row.qty_out || 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-slate-700 text-xs whitespace-nowrap font-medium">{getUnit(row)}</td>
                      <td className="px-4 py-2.5 text-slate-700 text-xs whitespace-nowrap">{row.lot || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-700 text-xs whitespace-nowrap">{fmtAnyDate(row.exp)}</td>
                      <td className="px-4 py-2.5 text-slate-800 font-medium text-right whitespace-nowrap">{getPrice(row) != null ? Number(getPrice(row)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '-'}</td>
                      <td className="px-4 py-2.5 text-amber-800 font-bold text-right whitespace-nowrap">{getPrice(row) != null ? ((row.qty_out||0)*getPrice(row)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '-'}</td>
                      <td className="px-4 py-2.5 text-slate-800 max-w-[140px] truncate font-medium">{row.department || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {expanded === row.id ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                      </td>
                    </tr>
                    {expanded === row.id && (
                      <tr key={`${row.id}-detail`} className="bg-rose-50/60 border-b border-rose-100">
                        <td colSpan={10} className="px-6 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-1.5 text-sm mb-3">
                            {[
                              ['รหัสยา', row.drug_code],
                              ['ชนิด', row.drug_type],
                              ['หน่วยงาน', row.department],
                              ['MainLog', row.main_log],
                              ['DetailedLog', row.detail_log],
                              ['Lot', row.lot],
                              ['Exp', fmtAnyDate(row.exp)],
                              ['ราคา/หน่วย', getPrice(row) != null ? `${Number(getPrice(row)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} บาท` : null],
                              ['คงเหลือก่อนเบิก', row.qty_before?.toLocaleString()],
                              ['ปริมาณออก', row.qty_out?.toLocaleString()],
                              ['คงเหลือหลังจ่าย', row.qty_after?.toLocaleString()],
                              ['หมายเหตุ', row.note],
                            ].map(([label, val]) => val != null && val !== '-' && val !== '' ? (
                              <div key={label}>
                                <span className="text-slate-400 text-xs">{label}: </span>
                                <span className="text-slate-700 font-medium">{val}</span>
                              </div>
                            ) : null)}
                          </div>
                          <div className="flex gap-2 pt-2 border-t border-rose-100">
                            <button
                              onClick={e => { e.stopPropagation(); setEditingRow(row); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors">
                              <Pencil size={13}/> แก้ไข
                            </button>
                            <button
                              onClick={e => handleDelete(row, e)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">
                              <Trash2 size={13}/> ลบ
                            </button>
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

      {rows.length === PAGE_SIZE && (
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
function DispenseSummaryModal({ onClose }) {
  const [activeTab, setActiveTab]   = useState('overview'); // 'overview' | 'monthly'
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [departments, setDepts]     = useState([]);
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [drugFilter, setDrugFilter]   = useState('');
  const [drugNames, setDrugNames]     = useState([]);
  const [showDrugDd, setShowDrugDd]   = useState(false);
  const drugRef = useRef(null);
  const [allTimeTotal, setAllTimeTotal] = useState(null);
  const [allTimeValue, setAllTimeValue] = useState(null);

  // Monthly stats
  const [numMonths, setNumMonths]         = useState(4);
  const [monthlyStats, setMonthlyStats]   = useState(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlySearch, setMonthlySearch]   = useState('');

  useEffect(() => {
    if (!supabase) return;
    // ดึงจำนวนรายการทั้งหมด
    supabase.from('dispense_logs').select('*', { count: 'exact', head: true })
      .then(({ count }) => setAllTimeTotal(count ?? 0));
    // ดึงมูลค่าทั้งหมด
    supabase.from('dispense_logs').select('qty_out, price_per_unit, drug_unit')
      .then(({ data }) => {
        if (data) setAllTimeValue(data.reduce((s, r) => s + ((r.qty_out || 0) * (getPrice(r) || 0)), 0));
      });
    // ดึงวันแรก-วันล่าสุด → แปลงเป็น dd/mm/yyyy
    supabase.from('dispense_logs').select('dispense_date').order('dispense_date', { ascending: true  }).limit(1)
      .then(({ data }) => { if (data?.[0]?.dispense_date) setDateFrom(isoToThai(data[0].dispense_date)); });
    supabase.from('dispense_logs').select('dispense_date').order('dispense_date', { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]?.dispense_date) setDateTo(isoToThai(data[0].dispense_date)); });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    fetchAllDepts(supabase).then(setDepts);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('dispense_logs').select('drug_name, drug_type').then(({ data }) => {
      if (!data) return;
      const typeMap = {};
      data.forEach(d => { if (d.drug_name && d.drug_type && d.drug_type !== '-') typeMap[d.drug_name] = d.drug_type; });
      const names = [...new Set(data.map(d => d.drug_name).filter(Boolean))].sort();
      setDrugNames(names.map(name => ({ name, type: typeMap[name] || '' })));
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
    let q = supabase.from('dispense_logs').select('department, drug_name, qty_out, price_per_unit, drug_unit, dispense_date');
    if (dateFrom)   q = q.gte('dispense_date', thaiToIso(dateFrom) || dateFrom);
    if (dateTo)     q = q.lte('dispense_date', thaiToIso(dateTo)   || dateTo);
    if (deptFilter) q = q.eq('department', deptFilter);
    if (drugFilter) q = q.ilike('drug_name', `%${drugFilter}%`);
    const { data: rows } = await q;
    if (!rows || rows.length === 0) { setStats(null); setLoading(false); return; }

    const totalQty   = rows.reduce((s, r) => s + (r.qty_out || 0), 0);
    const totalValue = rows.reduce((s, r) => s + ((r.qty_out || 0) * (getPrice(r) || 0)), 0);
    const uniqueDays = new Set(rows.map(r => r.dispense_date).filter(Boolean)).size;

    const aggBy = (key, valFn) => {
      const map = {};
      rows.forEach(r => { const k = r[key] || 'ไม่ระบุ'; map[k] = (map[k] || 0) + valFn(r); });
      return Object.entries(map).sort((a, b) => b[1] - a[1]);
    };

    setStats({
      total: rows.length,
      totalQty,
      totalValue,
      uniqueDays,
      topDepts:       aggBy('department', r => r.qty_out || 0).slice(0, 10),
      topDeptsValue:  aggBy('department', r => (r.qty_out || 0) * (getPrice(r) || 0)).slice(0, 10),
      topDrugs:         aggBy('drug_name', r => r.qty_out || 0).slice(0, 10),
      topDrugsByValue:  aggBy('drug_name', r => (r.qty_out || 0) * (getPrice(r) || 0)).slice(0, 10),
    });
    setLoading(false);
  }, [dateFrom, dateTo, deptFilter, drugFilter]);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ฟังก์ชันคำนวณ label เดือน Thai เช่น "พ.ย. 68"
  const getMonthLabel = (yyyy, mm) => {
    const d = new Date(yyyy, mm - 1, 1);
    return d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
  };

  const loadMonthlyStats = useCallback(async () => {
    if (!supabase) return;
    setMonthlyLoading(true);
    const now = new Date();
    // คำนวณเดือนย้อนหลัง numMonths เดือน
    const months = [];
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ key, label: getMonthLabel(d.getFullYear(), d.getMonth() + 1) });
    }
    const startISO = months[0].key + '-01';
    const { data } = await supabase
      .from('dispense_logs')
      .select('drug_name, drug_code, qty_out, dispense_date')
      .gte('dispense_date', startISO);

    if (!data) { setMonthlyLoading(false); return; }

    // รวม qty ตาม drug_name + เดือน
    const map = {};
    data.forEach(r => {
      if (!r.drug_name || !r.dispense_date) return;
      const mk = r.dispense_date.slice(0, 7);
      if (!map[r.drug_name]) map[r.drug_name] = { code: r.drug_code };
      map[r.drug_name][mk] = (map[r.drug_name][mk] || 0) + (r.qty_out || 0);
    });

    const drugs = Object.entries(map).map(([name, d]) => {
      const qtys = months.map(m => d[m.key] || 0);
      const total = qtys.reduce((s, q) => s + q, 0);
      const nonZero = qtys.filter(q => q > 0);
      const max = nonZero.length > 0 ? Math.max(...qtys) : 0;
      const avg = total / numMonths;
      return { name, code: d.code, qtys, total, max, avg };
    }).sort((a, b) => b.total - a.total);

    setMonthlyStats({ months, drugs });
    setMonthlyLoading(false);
  }, [numMonths]);

  useEffect(() => {
    if (activeTab === 'monthly') loadMonthlyStats();
  }, [activeTab, loadMonthlyStats]);

  const filteredMonthlyDrugs = monthlyStats
    ? (monthlySearch.trim()
        ? monthlyStats.drugs.filter(d => d.name.toLowerCase().includes(monthlySearch.toLowerCase()))
        : monthlyStats.drugs)
    : [];

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-start justify-center z-50 p-3 pt-4 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col mb-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-rose-800 p-5 flex justify-between items-center text-white rounded-t-2xl">
          <h3 className="text-xl font-bold flex items-center gap-3">
            <BarChart3 size={22} className="text-rose-300" /> สรุปข้อมูลการเบิกจ่าย
          </h3>
          <button onClick={onClose} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-colors"><X size={20}/></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-5 pt-3 gap-1">
          {[
            { key: 'overview', label: 'ภาพรวม' },
            { key: 'monthly',  label: 'สถิติการเบิก รายเดือน' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-rose-500 text-rose-600 bg-rose-50'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>{t.label}</button>
          ))}
        </div>

        <div className="p-5 space-y-5">

          {/* ========== TAB: ภาพรวม ========== */}
          {activeTab === 'overview' && (<>
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
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-rose-400">
                <option value="">ทุกหน่วยงาน</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <div className="relative" ref={drugRef}>
                <input type="text" value={drugFilter}
                  onChange={e => { setDrugFilter(e.target.value); setShowDrugDd(true); }}
                  onFocus={() => { if (drugFilter.trim()) setShowDrugDd(true); }}
                  placeholder="ค้นหายา..."
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-rose-400 w-40"
                />
                {drugFilter && <button onClick={() => setDrugFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X size={12}/></button>}
                {showDrugDd && drugFilter && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 w-64 overflow-hidden">
                    {drugNames.filter(n => n.name.toLowerCase().includes(drugFilter.toLowerCase())).slice(0,8).map(({ name, type }) => (
                      <button key={name} onMouseDown={e => { e.preventDefault(); setDrugFilter(name); setShowDrugDd(false); }}
                        className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-rose-50 border-b border-slate-100 last:border-0">
                        <div className="flex items-center gap-2 flex-wrap"><span>{name}</span>{type && <DrugTypeBadge type={type} />}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {(dateFrom || dateTo || deptFilter || drugFilter) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); setDeptFilter(''); setDrugFilter(''); }}
                  className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"><X size={12}/>ล้าง</button>
              )}
            </div>

            {loading ? (
              <p className="text-center text-slate-400 py-16">กำลังโหลด...</p>
            ) : !stats ? (
              <p className="text-center text-slate-400 py-16">ไม่พบข้อมูลที่กรอง หรือเลือก</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label:'รายการเบิกทั้งหมด', value:(allTimeTotal ?? '...').toLocaleString?.() ?? '...', unit:'รายการ (ทุกช่วงเวลา)', bg:'bg-indigo-50', bd:'border-indigo-200', lbl:'text-indigo-600', val:'text-indigo-900' },
                    { label:'จำนวนวันที่มีการเบิก', value:stats.uniqueDays.toLocaleString(), unit:'วัน (ในช่วงที่กรอง)', bg:'bg-rose-50', bd:'border-rose-200', lbl:'text-rose-600', val:'text-rose-900' },
                    { label:'มูลค่าเบิกทั้งหมด (บาท)', value:allTimeValue != null ? allTimeValue.toLocaleString(undefined,{maximumFractionDigits:0}) : '...', unit:'บาท (ทุกช่วงเวลา)', bg:'bg-amber-50', bd:'border-amber-200', lbl:'text-amber-600', val:'text-amber-900' },
                  ].map((k,i) => (
                    <div key={i} className={`${k.bg} border ${k.bd} rounded-xl p-4 shadow-sm`}>
                      <div className={`text-xs font-bold uppercase tracking-wide ${k.lbl} mb-1`}>{k.label}</div>
                      <div className={`text-2xl font-black ${k.val}`}>{k.value}</div>
                      <div className="text-xs text-slate-500">{k.unit}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <BarSection title="หน่วยงานที่เบิกสูงสุด (ปริมาณ)" items={stats.topDepts}      barColor="bg-rose-400"  unit="หน่วย" />
                  <BarSection title="หน่วยงาน — มูลค่าสูงสุด"        items={stats.topDeptsValue} barColor="bg-amber-400" unit="บาท"   />
                </div>
                <BarSection title="ยาที่มีมูลค่าเบิกสูงสุด" items={stats.topDrugsByValue} barColor="bg-indigo-400" unit="บาท" />
              </>
            )}
          </>)}

          {/* ========== TAB: สถิติรายเดือน ========== */}
          {activeTab === 'monthly' && (
            <div className="space-y-4">
              {/* Controls */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-slate-600">ย้อนหลัง:</span>
                {[2,3,4,6,12].map(n => (
                  <button key={n} onClick={() => setNumMonths(n)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      numMonths === n
                        ? 'bg-rose-500 text-white border-rose-500'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-rose-300'
                    }`}>{n} เดือน</button>
                ))}
                <div className="ml-auto relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input type="text" value={monthlySearch} onChange={e => setMonthlySearch(e.target.value)}
                    placeholder="ค้นหายา..." className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-rose-400 w-44"/>
                  {monthlySearch && <button onClick={() => setMonthlySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X size={12}/></button>}
                </div>
              </div>

              {monthlyLoading ? (
                <p className="text-center text-slate-400 py-16">กำลังโหลดข้อมูล...</p>
              ) : !monthlyStats ? (
                <p className="text-center text-slate-400 py-16">ไม่พบข้อมูล</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                  <table className="w-full text-xs min-w-[700px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-700 text-white text-center">
                        <th className="px-3 py-2.5 text-left font-semibold sticky left-0 bg-slate-700 min-w-[180px]">รายการยา</th>
                        <th className="px-3 py-2.5 font-semibold bg-rose-700 whitespace-nowrap">Max รายเดือน</th>
                        <th className="px-3 py-2.5 font-semibold bg-indigo-700 whitespace-nowrap">Avg รายเดือน</th>
                        <th className="px-3 py-2.5 font-semibold bg-amber-700 whitespace-nowrap">รวม {numMonths} เดือน</th>
                        {monthlyStats.months.map(m => (
                          <th key={m.key} className="px-3 py-2.5 font-semibold whitespace-nowrap">{m.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMonthlyDrugs.length === 0 ? (
                        <tr><td colSpan={4 + (monthlyStats?.months?.length || 0)} className="text-center py-10 text-slate-400">ไม่พบยา</td></tr>
                      ) : filteredMonthlyDrugs.map((drug, i) => (
                        <tr key={drug.name} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-rose-50/40 transition-colors`}>
                          <td className="px-3 py-2 font-medium text-slate-800 sticky left-0 bg-inherit">
                            <span className="block truncate max-w-[180px]" title={drug.name}>{drug.name}</span>
                            {drug.code && drug.code !== '-' && <span className="text-slate-400 font-normal">{drug.code}</span>}
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-rose-600">{drug.max > 0 ? drug.max.toLocaleString() : '-'}</td>
                          <td className="px-3 py-2 text-center font-semibold text-indigo-600">{drug.avg > 0 ? drug.avg.toLocaleString(undefined, {maximumFractionDigits:1}) : '-'}</td>
                          <td className="px-3 py-2 text-center font-bold text-amber-700">{drug.total > 0 ? drug.total.toLocaleString() : '-'}</td>
                          {drug.qtys.map((q, mi) => (
                            <td key={mi} className={`px-3 py-2 text-center ${q > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                              {q > 0 ? q.toLocaleString() : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-bold text-slate-700 border-t-2 border-slate-300">
                        <td className="px-3 py-2 sticky left-0 bg-slate-100">รวมทั้งหมด</td>
                        <td className="px-3 py-2 text-center text-rose-700">
                          {filteredMonthlyDrugs.length > 0 ? Math.max(...filteredMonthlyDrugs.map(d => d.max)).toLocaleString() : '-'}
                        </td>
                        <td className="px-3 py-2 text-center text-indigo-700">
                          {filteredMonthlyDrugs.length > 0
                            ? (filteredMonthlyDrugs.reduce((s,d)=>s+d.avg,0)/filteredMonthlyDrugs.length).toLocaleString(undefined,{maximumFractionDigits:1})
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-center text-amber-800">
                          {filteredMonthlyDrugs.reduce((s,d)=>s+d.total,0).toLocaleString()}
                        </td>
                        {monthlyStats.months.map((_m, mi) => (
                          <td key={mi} className="px-3 py-2 text-center">
                            {filteredMonthlyDrugs.reduce((s,d)=>s+(d.qtys[mi]||0),0).toLocaleString()}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              {monthlyStats && (
                <p className="text-xs text-slate-400 text-right">{filteredMonthlyDrugs.length} รายการยา</p>
              )}
            </div>
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
        <BarChart3 size={16} className="text-slate-400" /> {title}
      </h4>
      <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
        {items.map(([name, val], i) => (
          <div key={i}>
            <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
              <span className="truncate mr-2">{name}</span>
              <span className="font-bold text-slate-700 shrink-0">{Number(val).toLocaleString(undefined,{maximumFractionDigits:0})} {unit}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width:`${(val/max)*100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
