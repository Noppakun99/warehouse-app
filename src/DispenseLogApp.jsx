import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase';
import {
  ArrowLeft, UploadCloud, RefreshCcw, Search, X,
  FileSpreadsheet, ChevronDown, ChevronUp, AlertCircle,
  TrendingDown, BarChart3,
} from 'lucide-react';

// ============================================================
// Column aliases
// ============================================================
const COL_MAP = {
  dispense_date: ['วันที่เบิก', 'วันที่', 'date', 'dispense_date'],
  main_log:      ['mainlog', 'main_log', 'main log', 'log หลัก'],
  detail_log:    ['detailedlog', 'detail_log', 'detailed log', 'detaillog', 'log ย่อย', 'กลุ่ม'],
  department:    ['หน่วยงานที่เบิก', 'หน่วยงาน', 'department', 'แผนก', 'ward'],
  note:          ['หมายเหตุ', 'note', 'notes', 'remark'],
  drug_code:     ['รหัส', 'รหัสยา', 'code', 'drug_code', 'รหัส hosxp', 'รหัสhosxp'],
  drug_name:     ['รายการยา', 'ชื่อยา', 'drug_name', 'name', 'item'],
  drug_type:     ['ชนิด', 'ประเภท', 'type', 'drug_type', 'รูปแบบ'],
  drug_unit:     ['หน่วย', 'unit', 'drug_unit'],
  price_per_unit:['ราคา/หน่วย', 'ราคาต่อหน่วย', 'price', 'price_per_unit', 'unit price'],
  lot:           ['lot', 'lot.', 'เลขที่ lot', 'lot no'],
  exp:           ['exp', 'exp.', 'exp date', 'วันหมดอายุ'],
  qty_before:    ['คงเหลือก่อนเบิก', 'ยอดก่อน', 'before', 'qty_before', 'stock before'],
  qty_out:       ['ปริมาณ (ออก)', 'ปริมาณออก', 'จำนวนเบิก', 'qty_out', 'out', 'จำนวน'],
  qty_after:     ['คงเหลือหลังจ่าย', 'ยอดหลัง', 'after', 'qty_after', 'stock after'],
};

const CHUNK = 300;

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
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm px-4 py-3 flex items-center gap-2">
        <button onClick={onBack} className="text-slate-500 hover:text-indigo-600 p-1 transition-colors shrink-0"><ArrowLeft size={20} /></button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <TrendingDown size={20} className="text-rose-500 shrink-0" />
          <span className="font-semibold text-slate-800 truncate">บันทึกการเบิกจ่าย (คลังเบิก)</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setShowSummary(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 transition-all">
            <BarChart3 size={15} /> สรุปผล
          </button>
          {[{ key: 'view', label: 'ดูข้อมูล' }, { key: 'import', label: 'Import CSV' }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            >{t.label}</button>
          ))}
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
  const [status, setStatus]     = useState('');
  const [error, setError]       = useState('');
  const [preview, setPreview]   = useState(null);
  const [mapping, setMapping]   = useState({});
  const [rawHeaders, setRawHeaders] = useState([]);
  const [rawRows, setRawRows]   = useState([]);
  const [loading, setLoading]   = useState(false);
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
      const rows = rawRows
        .filter(row => row.some(c => c.trim()))
        .map(row => {
          const drugName = getVal(row, 'drug_name');
          if (!drugName) return null;
          const qtyOut = parseFloat(String(getVal(row, 'qty_out') || '0').replace(/,/g, '')) || 0;
          return {
            dispense_date:  parseDate(getVal(row, 'dispense_date')) || new Date().toISOString().slice(0,10),
            main_log:       getVal(row, 'main_log') || '-',
            detail_log:     getVal(row, 'detail_log') || '-',
            department:     getVal(row, 'department') || '-',
            note:           getVal(row, 'note'),
            drug_code:      getVal(row, 'drug_code') || '-',
            drug_name:      drugName,
            drug_type:      getVal(row, 'drug_type') || '-',
            drug_unit:      getVal(row, 'drug_unit') || '-',
            price_per_unit: parseFloat(String(getVal(row, 'price_per_unit') || '0').replace(/,/g, '')) || null,
            lot:            getVal(row, 'lot') || '-',
            exp:            getVal(row, 'exp') || '-',
            qty_before:     parseFloat(String(getVal(row, 'qty_before') || '').replace(/,/g, '')) || null,
            qty_out:        qtyOut,
            qty_after:      parseFloat(String(getVal(row, 'qty_after') || '').replace(/,/g, '')) || null,
            source:         'csv',
          };
        })
        .filter(Boolean);

      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: e } = await supabase.from('dispense_logs').insert(rows.slice(i, i + CHUNK));
        if (e) throw e;
      }
      setStatus(`นำเข้าสำเร็จ ${rows.length.toLocaleString()} รายการ`);
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
        className="border-2 border-dashed border-slate-300 hover:border-rose-400 bg-white rounded-2xl p-10 text-center cursor-pointer transition-colors">
        <FileSpreadsheet size={40} className="mx-auto mb-3 text-slate-400" />
        <p className="font-semibold text-slate-700">คลิกเพื่อเลือกไฟล์ CSV คลังเบิก</p>
        <p className="text-xs text-slate-400 mt-1">รองรับ .csv (UTF-8 หรือ TIS-620)</p>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
      </div>

      {error  && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2 flex items-center gap-2"><AlertCircle size={16}/>{error}</p>}
      {status && <p className="text-emerald-700 text-sm bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">{status}</p>}

      {preview && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-800">{preview.fileName}</p>
            <span className="text-xs text-slate-500">{preview.total.toLocaleString()} แถว</span>
          </div>
          <p className="text-sm text-slate-500">การจับคู่คอลัมน์ (แก้ไขได้ถ้าต้องการ):</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.keys(COL_MAP).map(field => (
              <div key={field} className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-32 shrink-0">{field}</span>
                <select value={mapping[field] ?? ''}
                  onChange={e => setMapping(p => ({ ...p, [field]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500">
                  <option value="">-- ไม่ใช้ --</option>
                  {rawHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="text-xs w-full">
              <thead><tr className="text-slate-500 border-b border-slate-200 bg-slate-50">
                {['dispense_date','department','drug_name','qty_out','lot'].map(f => <th key={f} className="px-3 py-2 text-left font-semibold">{f}</th>)}
              </tr></thead>
              <tbody>
                {rawRows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {['dispense_date','department','drug_name','qty_out','lot'].map(f => (
                      <td key={f} className="px-3 py-1.5 text-slate-700 truncate max-w-[120px]">
                        {getVal(row, f) || <span className="text-slate-300">-</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={handleImport} disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 transition-all">
            <UploadCloud size={18} />
            {loading ? 'กำลังนำเข้า...' : `นำเข้า ${rawRows.filter(r => r.some(c=>c.trim())).length.toLocaleString()} รายการ`}
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
  const [page, setPage]             = useState(0);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    let q = supabase.from('dispense_logs').select('*')
      .order('dispense_date', { ascending: false })
      .order('id', { ascending: false });
    if (deptFilter)    q = q.eq('department', deptFilter);
    if (dateFrom)      q = q.gte('dispense_date', dateFrom);
    if (dateTo)        q = q.lte('dispense_date', dateTo);
    if (search.trim()) q = q.or(`drug_name.ilike.%${search}%,drug_code.ilike.%${search}%`);
    q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    const { data } = await q;
    setRows(data || []);
    setLoading(false);
  }, [search, deptFilter, dateFrom, dateTo, page]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('dispense_logs').select('department').then(({ data }) => {
      if (data) setDepts([...new Set(data.map(d => d.department).filter(Boolean))].sort());
    });
  }, []);

  const totalOut   = rows.reduce((s, r) => s + (r.qty_out || 0), 0);
  const totalValue = rows.reduce((s, r) => s + ((r.qty_out || 0) * (r.price_per_unit || 0)), 0);
  const hasFilter  = search || deptFilter || dateFrom || dateTo;

  const clearAll = () => { setSearch(''); setDeptFilter(''); setDateFrom(''); setDateTo(''); setPage(0); };

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      {/* Filter card */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="ค้นหาชื่อยา หรือรหัส..."
              className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400" />
            {search && <button onClick={() => { setSearch(''); setPage(0); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14}/></button>}
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
          <span className="text-xs text-slate-500 font-medium">ช่วงวันที่:</span>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400 bg-white" />
          <span className="text-xs text-slate-400">—</span>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400 bg-white" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(0); }}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"><X size={12}/>ล้างวันที่</button>
          )}
        </div>
      </div>

      {/* Summary strip */}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-slate-800">{rows.length.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">รายการ{hasFilter ? ' (กรอง)' : ' (หน้านี้)'}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-rose-500">{totalOut.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
            <p className="text-xs text-slate-500 mt-0.5">ปริมาณรวม (ออก)</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-amber-600">{totalValue.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
            <p className="text-xs text-slate-500 mt-0.5">มูลค่ารวม (บาท)</p>
          </div>
        </div>
      )}

      {loading && <p className="text-center text-slate-400 py-10">กำลังโหลด...</p>}
      {!loading && rows.length === 0 && (
        <div className="text-center text-slate-400 py-20">
          <TrendingDown size={48} className="mx-auto mb-3 opacity-30" />
          <p>ไม่พบข้อมูล{hasFilter ? ' — ลองเปลี่ยนตัวกรอง' : ' — กด Import CSV เพื่อนำเข้าข้อมูล'}</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map(row => (
            <div key={row.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <button className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-slate-50 transition-colors"
                onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                <div className="text-xs text-slate-500 w-24 shrink-0">
                  {row.dispense_date ? new Date(row.dispense_date).toLocaleDateString('th-TH',{dateStyle:'short'}) : '-'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 truncate">{row.drug_name}</p>
                  <p className="text-xs text-slate-500 truncate">{row.department} · {row.drug_code}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-rose-500 text-sm">-{row.qty_out?.toLocaleString()}</p>
                  <p className="text-xs text-slate-500">{row.drug_unit}</p>
                </div>
                <div className="text-slate-400">{expanded === row.id ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</div>
              </button>
              {expanded === row.id && (
                <div className="border-t border-slate-200 px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-sm bg-slate-50">
                  {[
                    ['วันที่เบิก', row.dispense_date],
                    ['หน่วยงาน', row.department],
                    ['MainLog', row.main_log],
                    ['DetailedLog', row.detail_log],
                    ['รหัสยา', row.drug_code],
                    ['ชนิด', row.drug_type],
                    ['Lot', row.lot],
                    ['Exp', row.exp],
                    ['ราคา/หน่วย', row.price_per_unit != null ? `${Number(row.price_per_unit).toLocaleString()} บาท` : '-'],
                    ['คงเหลือก่อนเบิก', row.qty_before?.toLocaleString()],
                    ['ปริมาณออก', row.qty_out?.toLocaleString()],
                    ['คงเหลือหลังจ่าย', row.qty_after?.toLocaleString()],
                    ['หมายเหตุ', row.note],
                    ['แหล่งที่มา', row.source === 'online' ? '🖥 ระบบออนไลน์' : '📄 CSV'],
                  ].map(([label, val]) => val != null && val !== '-' && val !== '' ? (
                    <div key={label}>
                      <span className="text-slate-500 text-xs">{label}: </span>
                      <span className="text-slate-700">{val}</span>
                    </div>
                  ) : null)}
                </div>
              )}
            </div>
          ))}
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
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [departments, setDepts]     = useState([]);
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('dispense_logs').select('department').then(({ data }) => {
      if (data) setDepts([...new Set(data.map(d => d.department).filter(Boolean))].sort());
    });
  }, []);

  const loadStats = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    let q = supabase.from('dispense_logs').select('department, drug_name, qty_out, price_per_unit, dispense_date');
    if (dateFrom)   q = q.gte('dispense_date', dateFrom);
    if (dateTo)     q = q.lte('dispense_date', dateTo);
    if (deptFilter) q = q.eq('department', deptFilter);
    const { data: rows } = await q;
    if (!rows || rows.length === 0) { setStats(null); setLoading(false); return; }

    const totalQty   = rows.reduce((s, r) => s + (r.qty_out || 0), 0);
    const totalValue = rows.reduce((s, r) => s + ((r.qty_out || 0) * (r.price_per_unit || 0)), 0);

    const aggBy = (key, valFn) => {
      const map = {};
      rows.forEach(r => { const k = r[key] || 'ไม่ระบุ'; map[k] = (map[k] || 0) + valFn(r); });
      return Object.entries(map).sort((a, b) => b[1] - a[1]);
    };

    setStats({
      total: rows.length,
      totalQty,
      totalValue,
      topDepts:       aggBy('department', r => r.qty_out || 0).slice(0, 10),
      topDeptsValue:  aggBy('department', r => (r.qty_out || 0) * (r.price_per_unit || 0)).slice(0, 10),
      topDrugs:       aggBy('drug_name',  r => r.qty_out || 0).slice(0, 10),
    });
    setLoading(false);
  }, [dateFrom, dateTo, deptFilter]);

  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-start justify-center z-50 p-3 pt-4 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col mb-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-rose-800 p-5 flex justify-between items-center text-white rounded-t-2xl">
          <h3 className="text-xl font-bold flex items-center gap-3">
            <BarChart3 size={22} className="text-rose-300" /> สรุปข้อมูลการเบิกจ่าย
          </h3>
          <button onClick={onClose} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-colors"><X size={20}/></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Filters */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-600">กรองข้อมูล:</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">ตั้งแต่</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400 bg-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">ถึง</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400 bg-white" />
            </div>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-rose-400">
              <option value="">ทุกหน่วยงาน</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            {(dateFrom || dateTo || deptFilter) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); setDeptFilter(''); }}
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
                  { label:'รายการทั้งหมด', value:stats.total.toLocaleString(),                                    unit:'รายการ', bg:'bg-indigo-50', bd:'border-indigo-200', lbl:'text-indigo-600', val:'text-indigo-900' },
                  { label:'ปริมาณเบิกรวม', value:stats.totalQty.toLocaleString(undefined,{maximumFractionDigits:0}),  unit:'หน่วย',   bg:'bg-rose-50',   bd:'border-rose-200',   lbl:'text-rose-600',   val:'text-rose-900'   },
                  { label:'มูลค่ารวม (บาท)', value:stats.totalValue.toLocaleString(undefined,{maximumFractionDigits:0}), unit:'บาท',     bg:'bg-amber-50',  bd:'border-amber-200',  lbl:'text-amber-600',  val:'text-amber-900'  },
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
                <BarSection title="หน่วยงานที่เบิกสูงสุด (ปริมาณ)" items={stats.topDepts}      barColor="bg-rose-400"  unit="หน่วย" />
                <BarSection title="หน่วยงาน — มูลค่าสูงสุด"        items={stats.topDeptsValue} barColor="bg-amber-400" unit="บาท"   />
              </div>
              <BarSection title="ยาที่เบิกสูงสุด (ปริมาณ)" items={stats.topDrugs} barColor="bg-indigo-400" unit="หน่วย" />
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
