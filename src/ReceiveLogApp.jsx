import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from './lib/supabase';
import { fetchDrugDetails, RECEIVE_COL_MAP, insertReceiveRows, normalizeLotSearch, scanInvoiceImage, insertScannedBillRows, deleteScannedBillRows, uploadInvoiceImage, checkExistingBills,
  fetchInventoryNameCodeMap, lookupDrugAliases, upsertDrugAliases,
  fetchApBills, groupRowsByBill, billGroupKey, markBillsInspected, markBillsSentBatch, markBillsPosted, unmarkBillsPosted, unmarkBillsInspected, unmarkBillsSentBatch, resetApBatch, fetchApBatches,
  markBillsAcknowledged, unmarkBillsAcknowledged } from './lib/db';
import DrugSearchBar from './DrugSearchBar';
import SearchableSelect from './SearchableSelect';
import BackButton from './BackButton';
import {
  ArrowLeft, UploadCloud, RefreshCcw, Search, X,
  FileSpreadsheet, ChevronDown, ChevronUp, AlertCircle,
  TrendingUp, BarChart3, FileDown, ScanLine, CheckCircle2, HelpCircle,
  ImagePlus, Pencil, Trash2, Info, CalendarDays, Image as ImageIcon, AlertTriangle,
  ClipboardList, Send, FileCheck2, History, Undo2, Printer, ArrowRight, ArrowLeftRight,
} from 'lucide-react';
import { exportToExcel } from './lib/exportExcel';
import { insertAuditLog, resolveAuditUserName } from './lib/db';

function DrugTypeBadge({ type }) {
  if (!type || type === '-') return null;
  const t = type.trim().toLowerCase();
  let cls = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
  if (t.includes('เม็ด') || t.includes('tablet') || t.includes('cap')) cls = 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300';
  else if (t.includes('น้ำ') || t.includes('syrup') || t.includes('liquid') || t.includes('sol')) cls = 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300';
  else if (t.includes('ฉีด') || t.includes('inject') || t.includes('iv') || t.includes('im')) cls = 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300';
  else if (t.includes('apply') || t.includes('cream') || t.includes('oint') || t.includes('ทา')) cls = 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300';
  else if (t.includes('inhale') || t.includes('สูด') || t.includes('spray')) cls = 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300';
  return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{type}</span>;
}

// COL_MAP อยู่ใน db.js (RECEIVE_COL_MAP) — import มาใช้ที่นี่แทน

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

function ThaiDateInput({ value, onChange, placeholder = 'dd/mm/yyyy', ring = 'focus-within:ring-emerald-400', size = 'w-28' }) {
  return (
    <div className={`relative ${size} min-h-[36px] border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 flex items-center cursor-pointer hover:border-slate-400 transition-colors focus-within:ring-2 focus-within:outline-none ${ring}`}>
      <span className={`px-2 py-1.5 text-sm w-full select-none pointer-events-none ${value ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>
        {value || placeholder}
      </span>
      <input type="date"
        className="absolute inset-0 opacity-0 w-full cursor-pointer text-base"
        value={thaiToIso(value) || ''}
        onChange={e => onChange(isoToThai(e.target.value))}
        onClick={e => { try { e.currentTarget.showPicker?.(); } catch { /* noop */ } }} />
    </div>
  );
}

// ISO date input — เก็บค่าเป็น YYYY-MM-DD แสดง DD/MM/YYYY (พ.ศ.) ตาม docs/patterns.md
// ห้ามใช้ plain <input type="date"> เพราะ browser US locale แสดง MM/DD/YYYY
function IsoDateInput({ value, onChange, className = '' }) {
  const display = (iso) => {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return iso;
    return `${m[3]}/${m[2]}/${Number(m[1]) + 543}`;
  };
  return (
    <div className={`relative flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded ${className}`}>
      <span className={`px-2 py-1 text-xs w-full select-none pointer-events-none ${value ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
        {display(value) || 'dd/mm/yyyy'}
      </span>
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
        onClick={e => { try { e.currentTarget.showPicker?.(); } catch { /* noop */ } }}
        className="absolute inset-0 opacity-0 w-full cursor-pointer" />
    </div>
  );
}

function dateDiff(isoFrom, isoTo) {
  if (!isoFrom || !isoTo) return '';
  let y1 = +isoFrom.slice(0,4), m1 = +isoFrom.slice(5,7)-1, d1 = +isoFrom.slice(8,10);
  let y2 = +isoTo.slice(0,4),   m2 = +isoTo.slice(5,7)-1,   d2 = +isoTo.slice(8,10);
  let years = y2 - y1, months = m2 - m1, days = d2 - d1;
  if (days < 0)   { months--; days += new Date(y2, m2, 0).getDate(); }
  if (months < 0) { years--;  months += 12; }
  const parts = [];
  if (years  > 0) parts.push(`${years} ปี`);
  if (months > 0) parts.push(`${months} เดือน`);
  if (days   > 0) parts.push(`${days} วัน`);
  return parts.length ? parts.join(' ') : 'วันเดียวกัน';
}

// ดึงข้อมูลทั้งหมดโดยใช้ pagination เพื่อข้าม Supabase default 1,000-row limit
async function fetchAllRows(buildQuery) {
  const PAGE = 1000;
  let from = 0;
  let allRows = [];
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return allRows;
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
  main_log:            'MainLog',
  detail_log:          'DetailedLog',
  drug_code:           'รหัสยา',
  drug_name:           'ชื่อรายการยา',
  drug_type:           'รูปแบบยา',
  item_type:           'ชนิดรายการ',
  drug_unit:           'หน่วย',
  supplier_current:    'บริษัทปัจจุบัน',
  supplier_prev:       'บริษัทก่อนหน้า',
  supplier_changed:    'เปลี่ยนบริษัท',
  lot:                 'Lot',
  exp:                 'Exp',
  note:                'หมายเหตุ',
  exp_note:            'หมายเหตุ Exp',
  qty_received:        'จำนวนที่รับ',
  unit_per_bill:       'หน่วย/บิล',
  price_per_unit:      'ราคา/หน่วย',
  total_price_vat:     'มูลค่ารวมภาษี',
  total_price_formula: 'มูลค่า/สูตร',
  safety_stock:        'Safety Stock',
  sum_of_lead_time:    'Sum of Lead Time',
  swap_condition:      'เงื่อนไขแลกเปลี่ยน',
  swap_note:           'ระบุเงื่อนไขแลกเปลี่ยน',
  swap_items:          'รายการยาแลกเปลี่ยน',
};

function matchHeader(header) {
  const h = header.toLowerCase().trim().replace(/\s+/g, ' ');
  for (const [field, aliases] of Object.entries(RECEIVE_COL_MAP)) {
    if (aliases.some(a => h === a.toLowerCase().trim())) return field;
  }
  for (const [field, aliases] of Object.entries(RECEIVE_COL_MAP)) {
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
  const s = String(raw).trim().split(/[\sT]/)[0];
  if (/^\d{5}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + parseInt(s) * 86400000);
    if (!isNaN(d)) return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }
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

// ลำดับคอลัมน์ตาม CSV รับยาต้นทาง (ยอดคลังยา_รับยา_69.csv) + ครอบทุก field ที่ DB เก็บ
// ไม่รวม internal-only: id/created_at + AP workflow metadata (ap_*, inspect_meta, acknowledged_*)
const RECEIVE_EXCEL_COLS = [
  { header: 'วันที่แจ้งสั่ง',     key: 'order_date' },
  { header: 'รหัสยา',             key: 'drug_code' },
  { header: 'รูปแบบ',             key: 'drug_type' },
  { header: 'ชื่อยา',             key: 'drug_name' },
  { header: 'ประเภทการซื้อ',      key: 'purchase_type' },
  { header: 'Lot',                 key: 'lot' },
  { header: 'Exp',                 key: 'exp' },
  { header: 'หมายเหตุหมดอายุ',    key: 'exp_note' },
  { header: 'เลขที่บิล',          key: 'bill_number' },
  { header: 'เลขที่ PO',          key: 'po_number' },
  { header: 'จำนวนรับ',           key: 'qty_received' },
  { header: 'หน่วย',              key: 'drug_unit' },
  { header: 'หน่วย/บิล',          key: 'unit_per_bill' },
  { header: 'ราคา/หน่วย',        key: 'price_per_unit' },
  { header: 'ราคารวมภาษี (บาท)',  key: 'total_price_vat' },
  { header: 'วันที่รับ',          key: 'receive_date' },
  { header: 'ผลการพิจารณา',       key: 'receive_status' },
  { header: 'วันที่ตรวจรับ',      key: 'inspect_date' },
  { header: 'ระยะตรวจรับ',        key: 'inspect_lag' },
  { header: 'บริษัท',             key: 'supplier_current' },
  { header: 'บริษัทก่อนหน้า',     key: 'supplier_prev' },
  { header: 'เปลี่ยนบริษัท',      key: 'supplier_changed' },
  { header: 'leadtime',            key: 'leadtime' },
  { header: 'MainLog',             key: 'main_log' },
  { header: 'DetailedLog',         key: 'detail_log' },
  { header: 'ชนิดรายการ',         key: 'item_type' },
  { header: 'Safety Stock',        key: 'safety_stock' },
  { header: 'หมายเหตุ',           key: 'note' },
  { header: 'เงื่อนไขแลกเปลี่ยนยา', key: 'drug_swap_policy' },
]

// ============================================================
// Root
// ============================================================
export default function ReceiveLogApp({ onRefresh, auth = {}, initialTab = 'view', onGoBack, canGoBack }) {
  const [tab, setTab]                 = useState(initialTab);
  const [showSummary, setShowSummary] = useState(false);
  const isStaff = auth.role === 'staff' || auth.role === 'admin';
  // Rule #23: การเข้าถึง = role baseline OR per-user grant — hard guard เฉพาะ isStaff ทำให้ requester ที่ถูก grant เจอหน้าว่าง
  const perms = auth.permissions || [];
  const canScan = isStaff || perms.includes('receive-scan');
  const canAp   = isStaff || perms.includes('receive-ap');

  return (
    <div className="min-h-screen bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-sans">
      {/* Title bar — sidebar (AppShell) คุม navigation; เหลือ title + action */}
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3 flex items-center gap-2 flex-wrap">
        <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
        <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 shrink-0"><TrendingUp size={18} /></div>
        <button onClick={onRefresh} className="font-bold text-base text-slate-800 dark:text-slate-100 truncate flex-1 min-w-0 text-left hover:opacity-70 transition-opacity" title="คลิกเพื่อโหลดใหม่">บันทึกการรับเข้าคลัง (คลังรับ)</button>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <button onClick={() => setShowSummary(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <BarChart3 size={15}/> สรุปผล
          </button>
          {canAp && (
            <button onClick={() => setTab('ap')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'ap' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            ><Send size={15}/>ส่งบัญชี</button>
          )}
          {canScan && (
            <button onClick={() => setTab('scan')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'scan' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            ><ScanLine size={15}/>สแกนบิล</button>
          )}
          {isStaff && (
            <button onClick={() => setTab('import')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'import' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >Import CSV</button>
          )}
        </div>
      </div>
      {tab === 'scan'   && canScan && <ScanInvoice onDone={() => setTab('view')} auth={auth} />}
      {tab === 'import' && isStaff && <ReceiveImport onDone={() => setTab('view')} auth={auth} />}
      {tab === 'ap'     && canAp   && <ApWorkflow auth={auth} onBack={() => setTab('view')} />}
      {tab === 'view'   && <ReceiveView auth={auth} />}
      {showSummary      && <ReceiveSummaryModal onClose={() => setShowSummary(false)} />}
    </div>
  );
}

// ============================================================
// Invoice Scanner (AI Vision)
// ============================================================
// บีบรูปก่อนส่ง AI เพื่อลด token (≈ครึ่งหนึ่ง) — ปรับ 2 ค่านี้ถ้าต้องการ:
// SCAN_MAX_DIM ใหญ่ขึ้น = คมขึ้นแต่แพงขึ้น, SCAN_JPEG_QUALITY 0–1 (สูง=คม/ใหญ่)
const SCAN_MAX_DIM = 1600;        // ด้านยาวสุด (px) — ต่ำกว่านี้ตัวเลขบิล carbon จางอาจเบลอ
const SCAN_JPEG_QUALITY = 0.82;

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// คืน { base64, mimeType } — resize ผ่าน canvas; ถ้า canvas ใช้ไม่ได้ (เช่น HEIC) ส่งรูปเดิม
const toBase64 = async (file) => {
  const dataUrl = await readAsDataUrl(file);
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = dataUrl;
    });
    const scale = Math.min(1, SCAN_MAX_DIM / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', SCAN_JPEG_QUALITY);
    return { base64: out.split(',')[1], mimeType: 'image/jpeg' };
  } catch {
    // browser ถอดรูปไม่ได้ (HEIC ฯลฯ) → ส่งดิบ ให้ backend แจ้ง error ที่อ่านรู้เรื่อง
    return { base64: dataUrl.split(',')[1], mimeType: file.type };
  }
};

// บีบรูปก่อน upload (รูปตรวจรับ) → คืน Blob jpeg ~1600px; ถ้า canvas ใช้ไม่ได้ (HEIC) คืน file เดิม
const compressImageFile = async (file) => {
  try {
    const dataUrl = await readAsDataUrl(file);
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = dataUrl;
    });
    const scale = Math.min(1, SCAN_MAX_DIM / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', SCAN_JPEG_QUALITY));
    return blob || file;
  } catch {
    return file;
  }
};

const fmtExpFromIso = (iso) => {
  if (!iso) return '-';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const isoToDisplay = (iso) => {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const displayToIso = (display) => {
  if (!display) return null;
  const m = display.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
};

function EditableCell({ value, onChange, type = 'text', className = '' }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className={`w-full border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white dark:bg-slate-900 ${className}`}
    />
  );
}

// ดึงบิลที่บันทึกจากการสแกน AI (receive_status='สแกนบิล AI') — paginate กัน 1000-row limit (Rule #2)
async function fetchScannedBills() {
  return fetchAllRows(() =>
    supabase.from('receive_logs')
      .select('id, created_at, receive_date, bill_number, supplier_current, drug_name, drug_code, drug_type, gpu_code, tpu_code, ttmp_code, lot, exp, mfg_date, qty_received, drug_unit, price_per_unit, total_price_vat, scan_image_url')
      .eq('receive_status', 'สแกนบิล AI')
      .order('receive_date', { ascending: false })
  );
}

// group แถวสแกนตาม receive_date (วันที่อัพโหลด/บันทึก) → [{ date, rows }] เรียงวันล่าสุดก่อน
function groupScannedByDate(rows) {
  const map = {};
  for (const r of rows) {
    const d = r.receive_date || '-';
    (map[d] = map[d] || []).push(r);
  }
  return Object.keys(map).sort((a, b) => (a < b ? 1 : -1)).map(date => ({ date, rows: map[date] }));
}

const SCAN_EXCEL_COLS = [
  { header: 'เลขที่บิล',  key: 'bill_number' },
  { header: 'บริษัท',     key: 'supplier_current' },
  { header: 'ชื่อยา',     key: 'drug_name' },
  { header: 'รหัสยา',     key: 'drug_code' },
  { header: 'GPU',        key: 'gpu_code' },
  { header: 'TPU',        key: 'tpu_code' },
  { header: 'Lot',        key: 'lot' },
  { header: 'Exp',        key: 'exp' },
  { header: 'จำนวน',      key: 'qty_received' },
  { header: 'หน่วย',      key: 'drug_unit' },
  { header: 'ราคา/หน่วย', key: 'price_per_unit' },
  { header: 'มูลค่า',     key: 'total_price_vat' },
];

// fuzzy match ชื่อยาบนบิล → ชื่อ inventory (generic) เป็น "candidate ตัวช่วย" — ยังไม่ยืนยัน
// ใช้คำแรก (ตัวยาหลัก) match แบบ prefix; คืน candidate เฉพาะเมื่อ "ชัดพอ" (เจอ 1 ตัว) — กำกวม/ไม่เจอ → null
function fuzzyInventoryMatch(billName, invNames) {
  const first = String(billName || '').trim().toLowerCase().split(/\s+/)[0];
  if (!first || first.length < 3) return '';
  const hits = invNames.filter(n => n.toLowerCase().includes(first));
  return hits.length === 1 ? hits[0] : '';   // ชัดเจนเท่านั้น — หลายตัว = ปล่อยให้คนเลือกเอง
}

function ScanInvoice({ onDone, auth }) {
  const [files, setFiles] = useState([]);
  const [invoices, setInvoices] = useState([]); // [{ file, previewUrl, header, items, vatMode }]
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]); // [{ date, rows }] บิลสแกนย้อนหลัง group ตามวัน
  const [historyLoading, setHistoryLoading] = useState(false);
  const [histQuery, setHistQuery] = useState('');     // ค้นเลขบิล/ชื่อยา/บริษัท
  const [histFrom, setHistFrom] = useState('');       // ช่วงวันที่ (ISO)
  const [histTo, setHistTo] = useState('');
  const [histExpanded, setHistExpanded] = useState({}); // { [date]: true } กางวันไหนเห็นบิลรายใบ
  const [scanDrugNames, setScanDrugNames] = useState([]); // autocomplete ชื่อยาจากบิลที่เคยสแกน
  const [invNames, setInvNames] = useState([]);         // ชื่อยา generic จาก inventory (dropdown จับคู่)
  const [invByName, setInvByName] = useState({});       // { ชื่อ inventory → drug_code }
  const dropRef = useRef(null);
  const fileInputRef = useRef(null);
  const cancelRef = useRef(false);                       // ธงยกเลิกสแกน — มีผลหลังรูปที่กำลังอ่านเสร็จ
  const [fileStatus, setFileStatus] = useState({});      // { idx: 'reading'|'done'|'error' } ระหว่างสแกน
  const [confirmBox, setConfirmBox] = useState(null);    // { message, confirmLabel, onConfirm } — แทน window.confirm
  const [histError, setHistError] = useState('');        // error ของ action ในประวัติ (ลบ) — แทน alert

  // preview URL สร้างครั้งเดียวต่อชุดไฟล์ + revoke ชุดเก่า (เดิมสร้างใหม่ทุก render — memory leak)
  const filePreviews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files]);
  useEffect(() => () => { filePreviews.forEach(u => URL.revokeObjectURL(u)); }, [filePreviews]);

  // ช่องวันที่รับได้ ว่าง/'-'/วว/ดด/ปปปป เท่านั้น — กัน free text หลุดเข้า DB
  const isValidDateText = (v) => {
    const s = String(v ?? '').trim();
    return !s || s === '-' || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s);
  };

  // โหลดประวัติบิลสแกน — เก็บ raw rows (filter+group ตอน render) เรียกหลังบันทึกสำเร็จ
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setHistory(await fetchScannedBills());
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);        // โหลดตอนเปิดหน้า
  useEffect(() => { if (saved) loadHistory(); }, [saved, loadHistory]); // รีโหลดหลังบันทึก

  // autocomplete ชื่อยา — derive จาก history (บิลที่เคยสแกน) ไม่ query เพิ่ม
  useEffect(() => {
    const typeMap = {};
    history.forEach(r => { if (r.drug_name && r.drug_type && r.drug_type !== '-') typeMap[r.drug_name] = r.drug_type; });
    const names = [...new Set(history.map(r => r.drug_name).filter(Boolean))].sort();
    setScanDrugNames(names.map(name => ({ name, type: typeMap[name] || '' })));
  }, [history]);

  // Drag & drop
  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (dropped.length) addFiles(dropped);
  };

  const addFiles = (newFiles) => {
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...newFiles.filter(f => !existing.has(f.name + f.size))];
    });
    setInvoices([]);
    setSaved(false);
    setError('');
  };

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setInvoices([]);
  };

  // Process all images
  const handleScan = async () => {
    if (!files.length) return;
    setScanning(true);
    setError('');
    cancelRef.current = false;
    setFileStatus({});
    setScanProgress({ done: 0, total: files.length });

    // โหลดฐานข้อมูลคลัง (ชื่อ generic → code) + map alias ที่จับคู่ไว้ครั้งก่อน — ครั้งเดียวก่อน loop
    const { names: invNameList, byName } = await fetchInventoryNameCodeMap();
    setInvNames(invNameList); setInvByName(byName);

    const results = [];
    for (let i = 0; i < files.length; i++) {
      if (cancelRef.current) break;   // ผู้ใช้กดหยุด — เก็บผลรูปที่อ่านเสร็จแล้วไว้
      const file = files[i];
      setFileStatus(prev => ({ ...prev, [i]: 'reading' }));
      try {
        const { base64, mimeType } = await toBase64(file);
        const data = await scanInvoiceImage(base64, mimeType);
        if (data?._debug_error) {
          throw new Error(`${data.provider || 'AI'} (${data.status}): ${data.detail}`);
        }
        const previewUrl = URL.createObjectURL(file);

        // จับคู่ชื่อยาบนบิล → รหัสยา ตามลำดับ:
        //   1) alias table (จับคู่ครั้งก่อน, ชื่อเป๊ะเดิม) → auto-fill code + _autoCode
        //   2) fuzzy candidate จาก inventory (คำแรกตรง) → ใส่ candidate ใน dropdown แต่ "ยังไม่ยืนยัน" (_needConfirm)
        const billNames = (data.items || []).map(it => it.drug_name).filter(Boolean);
        const aliasMap = await lookupDrugAliases(billNames);

        const items = (data.items || []).map(it => {
          const billName = it.drug_name || '';
          const alias = aliasMap[billName.trim().toLowerCase()];
          const cand = alias ? null : fuzzyInventoryMatch(billName, invNameList);
          return {
            drug_name:      billName,
            drug_code:      alias ? alias.code : '',
            matched_name:   alias ? (alias.name || '') : '',   // ชื่อ generic ที่จับคู่ (โชว์ใน dropdown)
            gpu_code:       it.gpu_code || '',
            tpu_code:       it.tpu_code || '',
            ttmp_code:      it.ttmp_code || '',
            lot:            it.lot_number || '',
            exp:            fmtExpFromIso(it.expiry_date),
            mfg_date:       isoToDisplay(it.mfg_date),
            qty_received:   it.qty_received ?? '',
            drug_unit:      it.drug_unit || '',
            price_per_unit: it.price_per_unit ?? '',
            total_price_vat: it.total_price_vat ?? '',
            _autoCode:      !!alias,                            // จับคู่จาก alias = ยืนยันแล้ว (dot เขียว)
            _candidateName: cand || '',                        // fuzzy candidate (ยังไม่ยืนยัน)
            _needConfirm:   !alias && !!cand,                  // pre-fill fuzzy แต่ต้องให้คนยืนยัน (dot ส้ม)
          };
        });

        results.push({
          file,
          previewUrl,
          vatMode: 'included', // 'included' | 'excluded'
          header: {
            supplier:      data.supplier || '',
            bill_number:   data.invoice_number || '',
            invoice_date:  isoToDisplay(data.invoice_date),
            receive_date:  new Date().toISOString().slice(0, 10), // วันที่รับเข้า (ISO) — แก้ได้ก่อนบันทึก กันสแกนย้อนหลังได้วันผิด
            vat_percent:   data.vat_percent ?? 0,
            subtotal:      data.subtotal ?? '',
            vat_amount:    data.vat_amount ?? '',
            invoice_total: data.invoice_total ?? '',
          },
          items,
        });
        setFileStatus(prev => ({ ...prev, [i]: 'done' }));
      } catch (err) {
        results.push({ file, previewUrl: URL.createObjectURL(file), error: err.message, header: {}, items: [] });
        setFileStatus(prev => ({ ...prev, [i]: 'error' }));
      }
      setScanProgress({ done: i + 1, total: files.length });
    }
    // เตือนบิลซ้ำ — เลขบิลที่มีใน receive_logs แล้ว (เตือนอย่างเดียว ไม่ block เพราะเลขชนข้ามบริษัทได้ Rule #19)
    try {
      const dupMap = await checkExistingBills(results.filter(r => !r.error).map(r => r.header.bill_number));
      results.forEach(r => { if (!r.error) r._dup = dupMap[String(r.header.bill_number || '').trim()] || null; });
    } catch { /* เช็คซ้ำไม่ได้ ไม่ block การสแกน */ }
    setInvoices(results);
    setScanning(false);
  };

  // Edit helpers
  const updateHeader = (invIdx, field, val) => {
    setInvoices(prev => prev.map((inv, i) =>
      i !== invIdx ? inv : { ...inv, header: { ...inv.header, [field]: val } }
    ));
  };

  const updateItem = (invIdx, itemIdx, field, val) => {
    setInvoices(prev => prev.map((inv, i) =>
      i !== invIdx ? inv : {
        ...inv,
        items: inv.items.map((it, j) => j !== itemIdx ? it : { ...it, [field]: val }),
      }
    ));
  };

  // คนเลือกยาในระบบจาก dropdown "จับคู่ยาในระบบ" → เติม drug_code จาก inventory + mark ว่าจะ save alias
  // invName = '' (ล้าง) → คืนสถานะ unmatched
  const mapItemToInventory = (invIdx, itemIdx, invName) => {
    const code = invName ? (invByName[invName] || '') : '';
    setInvoices(prev => prev.map((inv, i) =>
      i !== invIdx ? inv : {
        ...inv,
        items: inv.items.map((it, j) => j !== itemIdx ? it : {
          ...it,
          matched_name: invName,
          drug_code: code || it.drug_code,
          _autoCode: !!code,
          _needConfirm: false,
          _userMapped: !!invName,   // คนจับคู่เอง → upsert alias ตอน save
        }),
      }
    ));
  };

  const removeItem = (invIdx, itemIdx) => {
    setInvoices(prev => prev.map((inv, i) =>
      i !== invIdx ? inv : { ...inv, items: inv.items.filter((_, j) => j !== itemIdx) }
    ));
  };

  const setVatMode = (invIdx, mode) => {
    setInvoices(prev => prev.map((inv, i) => i !== invIdx ? inv : { ...inv, vatMode: mode }));
  };

  // มูลค่ารายการหลังปรับตามโหมด VAT — ใช้ทั้งตอน save และแถบตรวจยอดท้ายบิล (สองที่ต้องตรงกัน)
  const effItemTotal = (inv, it) => {
    const qty   = parseFloat(String(it.qty_received).replace(/,/g, '')) || null;
    const price = parseFloat(String(it.price_per_unit).replace(/,/g, '')) || null;
    const vat   = parseFloat(inv.header.vat_percent) || 0;
    let total   = parseFloat(String(it.total_price_vat).replace(/,/g, '')) || null;
    if (inv.vatMode === 'excluded' && vat > 0 && qty && price) total = qty * price * (1 + vat / 100);
    return { qty, price, vat, total };
  };

  // Confirm & save
  const handleSave = async () => {
    if (!invoices.length) return;
    // ตรวจ format วันที่ก่อน (ช่องที่ผิดถูกไฮไลต์แดงในฟอร์มด้วย isValidDateText เดียวกัน)
    const dateErrs = [];
    invoices.forEach((inv, i) => {
      if (inv.error) return;
      if (!isValidDateText(inv.header.invoice_date)) dateErrs.push(`บิล #${i + 1} วันที่บิล`);
      inv.items.forEach((it, j) => {
        if (!isValidDateText(it.exp)) dateErrs.push(`บิล #${i + 1} รายการ ${j + 1} Exp`);
        if (!isValidDateText(it.mfg_date)) dateErrs.push(`บิล #${i + 1} รายการ ${j + 1} Mfg`);
      });
    });
    if (dateErrs.length) {
      setError(`รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น วว/ดด/ปปปป): ${dateErrs.slice(0, 5).join(', ')}${dateErrs.length > 5 ? ` และอีก ${dateErrs.length - 5} จุด` : ''}`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const allRows = [];

      for (const inv of invoices) {
        if (inv.error || !inv.items.length) continue;

        // Upload image to Supabase Storage — บีบก่อน (รูปมือถือดิบหลาย MB เปลือง Storage; compress fail → ใช้ไฟล์เดิม)
        let imageUrl = null;
        try {
          const ts = Date.now();
          const blob = await compressImageFile(inv.file);
          const safeName = inv.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const upName = blob !== inv.file ? `${ts}_${safeName.replace(/\.[^.]+$/, '')}.jpg` : `${ts}_${safeName}`;
          imageUrl = await uploadInvoiceImage(blob, upName);
        } catch (_) {
          // ถ้าอัพโหลดรูปไม่สำเร็จ ยังคง save ข้อมูลต่อ
        }

        for (const it of inv.items) {
          if (!it.drug_name && !it.drug_code) continue;

          const { qty, price, vat, total: itemTotal } = effItemTotal(inv, it);

          allRows.push({
            receive_date:      inv.header.receive_date || today,
            bill_number:       inv.header.bill_number || '-',
            supplier_current:  inv.header.supplier || '-',
            invoice_date:      displayToIso(inv.header.invoice_date) || null,
            vat_percent:       vat || null,
            subtotal:          parseFloat(String(inv.header.subtotal).replace(/,/g,'')) || null,
            vat_amount:        parseFloat(String(inv.header.vat_amount).replace(/,/g,'')) || null,
            invoice_total:     parseFloat(String(inv.header.invoice_total).replace(/,/g,'')) || null,
            drug_name:         it.drug_name || '-',
            drug_code:         it.drug_code || '-',
            gpu_code:          it.gpu_code || null,
            tpu_code:          it.tpu_code || null,
            ttmp_code:         it.ttmp_code || null,
            lot:               it.lot || '-',
            exp:               it.exp || '-',
            mfg_date:          it.mfg_date || null,
            qty_received:      qty,
            drug_unit:         it.drug_unit || null,
            price_per_unit:    price,
            total_price_vat:   itemTotal,
            scan_image_url:    imageUrl,
            receive_status:    'สแกนบิล AI',
          });
        }
      }

      if (!allRows.length) throw new Error('ไม่มีรายการยาที่จะบันทึก');
      await insertScannedBillRows(allRows, auth);

      // จดจำการจับคู่ชื่อยา→รหัส ที่คนเลือกเอง → ครั้งหน้าชื่อเป๊ะเดิม auto-fill
      const aliasRows = invoices.flatMap(inv => (inv.error ? [] : inv.items))
        .filter(it => it._userMapped && it.drug_name && it.drug_code && it.drug_code !== '-')
        .map(it => ({ billName: it.drug_name, drugCode: it.drug_code, drugName: it.matched_name || null }));
      if (aliasRows.length) {
        try { await upsertDrugAliases(aliasRows, auth); }
        catch { /* mapping ไม่สำเร็จ ไม่ block การบันทึกบิล */ }
      }

      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalItems = invoices.reduce((s, inv) => s + (inv.items?.length || 0), 0);

  const dateThai = (iso) => {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${Number(m[1]) + 543}` : (iso || '-');
  };

  // filter raw rows ตามคำค้น + ช่วงวันที่ แล้ว group ตามวัน
  const histQ = histQuery.trim().toLowerCase();
  const histFiltered = history.filter(r => {
    const d = r.receive_date || '';
    if (histFrom && d < histFrom) return false;
    if (histTo && d > histTo) return false;
    if (histQ && !`${r.bill_number || ''} ${r.drug_name || ''} ${r.supplier_current || ''} ${r.drug_code || ''}`.toLowerCase().includes(histQ)) return false;
    return true;
  });
  const histGrouped = groupScannedByDate(histFiltered);

  // group บิลรายใบในแต่ละวัน (composite key กัน bill_number ซ้ำ — Rule #19)
  // เก็บ item_ids (row id) ไว้ใช้ลบบิลรายใบด้วย .in('id', ...) ไม่ใช่ bill_number
  const billsOfDay = (rows) => {
    const m = {};
    for (const r of rows) {
      const k = `${r.bill_number || '-'}|${r.supplier_current || '-'}`;
      const g = (m[k] = m[k] || { bill_number: r.bill_number, supplier: r.supplier_current, items: [], item_ids: [], images: [] });
      g.items.push(r);
      if (r.id != null) g.item_ids.push(r.id);
      if (r.scan_image_url && !g.images.includes(r.scan_image_url)) g.images.push(r.scan_image_url);
    }
    return Object.values(m);
  };

  // นับ "รอบสแกน" ต่อวันจาก created_at — กลุ่มที่ห่างกันเกิน threshold = คนละรอบ
  const ROUND_GAP_MS = 2 * 60 * 1000; // ห่างเกิน 2 นาที = คนละรอบสแกน
  const countScanRounds = (rows) => {
    const ts = rows.map(r => r.created_at ? new Date(r.created_at).getTime() : null)
      .filter(Boolean).sort((a, b) => a - b);
    if (!ts.length) return 1;
    let rounds = 1;
    for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > ROUND_GAP_MS) rounds++;
    return rounds;
  };

  // ลบบิลสแกนตาม row id → confirm modal (สไตล์ app — window.confirm ใช้ใน LINE WebView ไม่สวย) → ลบ + audit + รีโหลด
  const handleDeleteScanned = (ids, confirmMsg, details) => {
    if (!ids?.length) return;
    setConfirmBox({
      message: confirmMsg,
      confirmLabel: 'ลบ',
      onConfirm: async () => {
        setHistError('');
        try {
          await deleteScannedBillRows(ids, auth, details);
          await loadHistory();
        } catch (err) {
          setHistError('ลบไม่สำเร็จ: ' + err.message);
        }
      },
    });
  };

  // confirm modal กลาง — ใช้ทั้งลบบิลในประวัติ และ "สแกนใหม่" (ทิ้งผลที่แก้ไว้)
  const confirmModal = confirmBox && (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 text-rose-600 mb-3">
          <AlertTriangle size={24}/>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">ยืนยันการทำรายการ</h3>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">{confirmBox.message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setConfirmBox(null)}
            className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:border-slate-400 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium transition-colors">
            ยกเลิก
          </button>
          <button onClick={() => { const fn = confirmBox.onConfirm; setConfirmBox(null); fn(); }}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm">
            {confirmBox.confirmLabel || 'ยืนยัน'}
          </button>
        </div>
      </div>
    </div>
  );

  // panel ประวัติบิลสแกน — ใช้ทั้งหน้า upload (ตลอด) และหน้า saved
  const historyPanel = (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
            <History size={16} className="text-emerald-600"/> ประวัติบิลที่สแกน (แยกตามวันที่อัพโหลด)
          </h3>

          {histError && (
            <p className="text-red-600 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg px-3 py-2 mb-3">{histError}</p>
          )}

          {/* ตัวกรอง: ค้นหา (ยา/เลขบิล/บริษัท) + ช่วงวันที่ */}
          <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-4 space-y-2.5">
            <DrugSearchBar
              value={histQuery}
              onChange={setHistQuery}
              options={scanDrugNames}
              placeholder="ค้นหายา / เลขบิล / บริษัท / รหัส"
              ringClass="focus:ring-emerald-400"
              hoverClass="hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
            />
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <CalendarDays size={15} className="text-slate-400 dark:text-slate-500 shrink-0"/>
              <span className="text-slate-600 dark:text-slate-300">วันที่:</span>
              <IsoDateInput value={histFrom} onChange={setHistFrom} className="w-32"/>
              <span className="text-slate-400 dark:text-slate-500">ถึง</span>
              <IsoDateInput value={histTo} onChange={setHistTo} className="w-32"/>
              {(histQuery || histFrom || histTo) && (
                <button onClick={() => { setHistQuery(''); setHistFrom(''); setHistTo(''); }}
                  className="flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-red-500 text-xs px-2 py-1 transition-colors">
                  <X size={13}/> ล้าง
                </button>
              )}
            </div>
          </div>

          {historyLoading ? (
            <div className="text-center text-slate-400 dark:text-slate-500 text-sm py-6 flex items-center justify-center gap-2">
              <RefreshCcw size={15} className="animate-spin"/> กำลังโหลด...
            </div>
          ) : histGrouped.length === 0 ? (
            <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-6">
              {history.length === 0 ? 'ยังไม่มีบิลที่สแกน' : 'ไม่พบบิลตามเงื่อนไข — ลองล้างตัวกรอง'}
            </p>
          ) : (
            <div className="space-y-3">
              {histGrouped.map(({ date, rows }) => {
                const dayBills = billsOfDay(rows);
                const rounds = countScanRounds(rows);
                const value = rows.reduce((s, r) => s + (parseFloat(String(r.total_price_vat || 0).replace(/,/g, '')) || 0), 0);
                const open = !!histExpanded[date];
                return (
                  <div key={date} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                      <button
                        onClick={() => setHistExpanded(p => ({ ...p, [date]: !p[date] }))}
                        className="flex items-center gap-2 text-sm hover:text-emerald-700 transition-colors">
                        {open ? <ChevronUp size={15} className="text-emerald-600"/> : <ChevronDown size={15} className="text-slate-400 dark:text-slate-500"/>}
                        <CalendarDays size={15} className="text-emerald-600"/>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{dateThai(date)}</span>
                        <span className="text-slate-400 dark:text-slate-500">· {rounds} รอบ · {dayBills.length} บิล · {rows.length} รายการ · {value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</span>
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => exportToExcel(rows, SCAN_EXCEL_COLS, 'บิลสแกน', `บิลสแกน_${date}.xlsx`, auth)}
                          className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 rounded-lg px-3 py-1 text-sm font-medium transition-colors"
                        >
                          <FileDown size={15}/> Excel
                        </button>
                        <button
                          onClick={() => handleDeleteScanned(
                            rows.map(r => r.id).filter(id => id != null),
                            `ลบบิลสแกนของวันที่ ${dateThai(date)} ทั้งหมด ${rows.length} รายการ?`,
                            { date, reason: 'scan_delete_day' },
                          )}
                          className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/70 text-red-600 border border-red-200 dark:border-red-900/60 rounded-lg px-3 py-1 text-sm font-medium transition-colors"
                        >
                          <Trash2 size={15}/> ลบ
                        </button>
                      </div>
                    </div>
                    {open && (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {dayBills.map((b, bi) => {
                          const bv = b.items.reduce((s, r) => s + (parseFloat(String(r.total_price_vat || 0).replace(/,/g, '')) || 0), 0);
                          return (
                            <div key={bi} className="px-4 py-2 flex items-center justify-between gap-3 text-xs">
                              <div className="min-w-0">
                                <span className="font-medium text-slate-700 dark:text-slate-200">{b.bill_number || '-'}</span>
                                <span className="text-slate-400 dark:text-slate-500"> · {b.supplier || '-'}</span>
                                <span className="text-slate-400 dark:text-slate-500"> · {b.items.length} รายการ · {bv.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</span>
                              </div>
                              <div className="flex items-center gap-2.5 shrink-0">
                                {b.images.map((url, ui) => (
                                  <a key={ui} href={url} target="_blank" rel="noreferrer"
                                    className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                                    title="ดูรูปบิลต้นฉบับ">
                                    <ImageIcon size={14}/> รูป{b.images.length > 1 ? ` ${ui + 1}` : ''}
                                  </a>
                                ))}
                                <button
                                  onClick={() => handleDeleteScanned(
                                    b.item_ids,
                                    `ลบบิล ${b.bill_number || '-'} (${b.items.length} รายการ)?`,
                                    { bill_number: b.bill_number, reason: 'scan_delete_bill' },
                                  )}
                                  className="flex items-center gap-1 text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors"
                                  title="ลบบิลนี้"
                                >
                                  <Trash2 size={14}/>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
  );

  if (saved) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-emerald-200 dark:border-emerald-900/60 p-6 text-center">
          <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-3"/>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">บันทึกสำเร็จ</h2>
          <p className="text-slate-600 dark:text-slate-300 text-sm mb-4">บันทึกข้อมูล {totalItems} รายการจาก {invoices.length} บิล เข้าระบบแล้ว</p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => {
                invoices.forEach(inv => { try { URL.revokeObjectURL(inv.previewUrl); } catch { /* noop */ } });
                setSaved(false); setFiles([]); setInvoices([]);
              }}
              className="bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-xl py-2 px-5 font-semibold text-sm transition-colors">
              สแกนบิลต่อ
            </button>
            <button onClick={onDone}
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl py-2 px-5 font-semibold text-sm transition-colors">
              กลับหน้าหลัก
            </button>
          </div>
        </div>
        {historyPanel}
        {confirmModal}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

      {/* Upload Area */}
      {!invoices.length && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
            <ScanLine size={18} className="text-emerald-600"/> อัพโหลดภาพบิลยา
          </h2>

          <div
            ref={dropRef}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-emerald-300 dark:border-emerald-800/60 rounded-xl p-8 text-center cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
          >
            <ImagePlus size={36} className="text-emerald-400 mx-auto mb-3"/>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">ลากวางหรือคลิกเพื่อเลือกรูปบิล</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">รองรับหลายรูปพร้อมกัน · JPG, PNG, HEIC</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => addFiles(Array.from(e.target.files))}
            />
          </div>

          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-700">
                  <img src={filePreviews[i]} alt="" className="w-10 h-10 object-cover rounded-lg border border-slate-200 dark:border-slate-700"/>
                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate">{f.name}</span>
                  {scanning && (
                    fileStatus[i] === 'reading' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/60 rounded-full px-2 py-0.5"><RefreshCcw size={11} className="animate-spin"/> กำลังอ่าน</span>
                    ) : fileStatus[i] === 'done' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-full px-2 py-0.5"><CheckCircle2 size={11}/> เสร็จ</span>
                    ) : fileStatus[i] === 'error' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-full px-2 py-0.5"><AlertCircle size={11}/> อ่านไม่ได้</span>
                    ) : (
                      <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-2 py-0.5">รอคิว</span>
                    )
                  )}
                  <span className="text-xs text-slate-400 dark:text-slate-500">{(f.size/1024).toFixed(0)} KB</span>
                  {!scanning && (
                    <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors">
                      <X size={16}/>
                    </button>
                  )}
                </div>
              ))}

              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleScan}
                  disabled={scanning}
                  className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-60 text-white rounded-xl py-2.5 font-semibold text-sm transition-colors shadow-sm"
                >
                  {scanning
                    ? <><RefreshCcw size={16} className="animate-spin"/> กำลังอ่านบิล {scanProgress.done}/{scanProgress.total}...</>
                    : <><ScanLine size={16}/> เริ่มอ่านบิล AI ({files.length} รูป)</>
                  }
                </button>
                {scanning && (
                  <button
                    onClick={() => { cancelRef.current = true; }}
                    className="px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:border-red-400 hover:text-red-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors"
                  >
                    หยุดหลังรูปนี้
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ประวัติบิลสแกน — แสดงใต้ upload area เสมอ (เมื่อยังไม่มีรายการกำลังตรวจ) */}
      {!invoices.length && historyPanel}

      {/* Preview per invoice */}
      {invoices.map((inv, invIdx) => (
        <div key={invIdx} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">

          {/* Invoice header */}
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/50 px-5 py-4">
            <div className="flex items-start gap-4">
              <img src={inv.previewUrl} alt="" className="w-16 h-16 object-cover rounded-xl border border-emerald-200 dark:border-emerald-900/60 shrink-0"/>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide mb-2">ข้อมูลบิล #{invIdx + 1}</p>
                {inv.error ? (
                  <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl px-3 py-2">
                    <AlertCircle size={16}/> อ่านบิลไม่สำเร็จ: {inv.error}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {[
                      { label: 'บริษัทผู้ขาย', field: 'supplier' },
                      { label: 'เลขที่บิล',    field: 'bill_number' },
                      { label: 'วันที่บิล',     field: 'invoice_date' },
                    ].map(({ label, field }) => (
                      <div key={field}>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">{label}</p>
                        <EditableCell value={inv.header[field]} onChange={v => updateHeader(invIdx, field, v)}
                          className={field === 'invoice_date' && !isValidDateText(inv.header[field]) ? 'border-red-400 bg-red-50 dark:bg-red-950/40' : ''}/>
                      </div>
                    ))}
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">วันที่รับเข้า</p>
                      <IsoDateInput value={inv.header.receive_date} onChange={v => updateHeader(invIdx, 'receive_date', v)} className="w-full min-h-[30px]"/>
                    </div>
                    {[
                      { label: 'VAT (%)',    field: 'vat_percent' },
                      { label: 'ก่อน VAT',  field: 'subtotal' },
                      { label: 'VAT',        field: 'vat_amount' },
                      { label: 'รวมทั้งบิล', field: 'invoice_total' },
                    ].map(({ label, field }) => (
                      <div key={field}>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">{label}</p>
                        <EditableCell value={inv.header[field]} onChange={v => updateHeader(invIdx, field, v)} type="number"/>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* เตือนบิลซ้ำ — เลขบิลนี้มีใน receive_logs แล้ว (เตือนอย่างเดียว ไม่ block) */}
            {!inv.error && inv._dup && (
              <div className="mt-3 flex items-start gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 rounded-xl px-3 py-2">
                <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5"/>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  <span className="font-bold">เลขบิลนี้มีในระบบแล้ว {inv._dup.count} รายการ</span>
                  {inv._dup.suppliers.length > 0 && <> · {inv._dup.suppliers.join(', ')}</>}
                  {inv._dup.lastDate && <> · รับล่าสุด {dateThai(inv._dup.lastDate)}</>}
                  {' '}— ตรวจสอบก่อนบันทึก กันข้อมูลรับซ้ำ
                </p>
              </div>
            )}

            {/* VAT toggle */}
            {!inv.error && (
              <div className="mt-3 flex items-center gap-3">
                <Info size={13} className="text-slate-400 dark:text-slate-500 shrink-0"/>
                <span className="text-xs text-slate-600 dark:text-slate-300">ราคาในบิลนี้:</span>
                {['included','excluded'].map(mode => (
                  <button
                    key={mode}
                    onClick={() => setVatMode(invIdx, mode)}
                    className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${inv.vatMode === mode ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-emerald-400'}`}
                  >
                    {mode === 'included' ? 'รวม VAT แล้ว' : 'ยังไม่รวม VAT'}
                  </button>
                ))}
                {inv.vatMode === 'excluded' && parseFloat(inv.header.vat_percent) > 0 && (
                  <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg px-2 py-0.5">
                    ระบบจะคำนวณ +{inv.header.vat_percent}% ให้อัตโนมัติ
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Items — mobile: card ต่อรายการ (Rule #5) / desktop: ตาราง */}
          {!inv.error && inv.items.length > 0 && (
            <>
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {inv.items.map((it, itemIdx) => (
                <div key={itemIdx} className="p-3.5 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">ชื่อยา (ตามบิล)</p>
                      <EditableCell value={it.drug_name} onChange={v => updateItem(invIdx, itemIdx, 'drug_name', v)}/>
                    </div>
                    <button onClick={() => removeItem(invIdx, itemIdx)} className="mt-5 text-slate-300 dark:text-slate-500 hover:text-red-500 transition-colors shrink-0"><Trash2 size={16}/></button>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">จับคู่ยาในระบบ</p>
                    <SearchableSelect
                      value={it.matched_name || it._candidateName || ''}
                      onChange={v => mapItemToInventory(invIdx, itemIdx, v)}
                      options={invNames}
                      placeholder="-- เลือกยาในระบบ --"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">รหัสยา</p>
                      <div className="relative">
                        <EditableCell value={it.drug_code} onChange={v => updateItem(invIdx, itemIdx, 'drug_code', v)}/>
                        {it._autoCode && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" title="จับคู่แล้ว"/>}
                        {it._needConfirm && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-400" title="แนะนำจากชื่อยา — ต้องตรวจ/ยืนยัน"/>}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">จำนวน</p>
                      <EditableCell value={it.qty_received} onChange={v => updateItem(invIdx, itemIdx, 'qty_received', v)} type="number"/>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Lot</p>
                      <EditableCell value={it.lot} onChange={v => updateItem(invIdx, itemIdx, 'lot', v)}/>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Exp</p>
                      <EditableCell value={it.exp} onChange={v => updateItem(invIdx, itemIdx, 'exp', v)} className={isValidDateText(it.exp) ? '' : 'border-red-400 bg-red-50 dark:bg-red-950/40'}/>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">หน่วย</p>
                      <EditableCell value={it.drug_unit} onChange={v => updateItem(invIdx, itemIdx, 'drug_unit', v)}/>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Mfg</p>
                      <EditableCell value={it.mfg_date} onChange={v => updateItem(invIdx, itemIdx, 'mfg_date', v)} className={isValidDateText(it.mfg_date) ? '' : 'border-red-400 bg-red-50 dark:bg-red-950/40'}/>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">ราคา/หน่วย</p>
                      <EditableCell value={it.price_per_unit} onChange={v => updateItem(invIdx, itemIdx, 'price_per_unit', v)} type="number"/>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">มูลค่า</p>
                      <EditableCell value={it.total_price_vat} onChange={v => updateItem(invIdx, itemIdx, 'total_price_vat', v)} type="number"/>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">GPU</p>
                      <EditableCell value={it.gpu_code} onChange={v => updateItem(invIdx, itemIdx, 'gpu_code', v)}/>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">TPU</p>
                      <EditableCell value={it.tpu_code} onChange={v => updateItem(invIdx, itemIdx, 'tpu_code', v)}/>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">TTMP</p>
                      <EditableCell value={it.ttmp_code} onChange={v => updateItem(invIdx, itemIdx, 'ttmp_code', v)}/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    {['ชื่อยา','รหัสยา','จับคู่ยาในระบบ','GPU','TPU','TTMP','Lot','Exp','Mfg','จำนวน','หน่วย','ราคา/หน่วย','มูลค่า',''].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {inv.items.map((it, itemIdx) => (
                    <tr key={itemIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-3 py-1.5 min-w-56"><EditableCell value={it.drug_name} onChange={v => updateItem(invIdx, itemIdx, 'drug_name', v)}/></td>
                      <td className="px-3 py-1.5 min-w-28">
                        <div className="relative">
                          <EditableCell value={it.drug_code} onChange={v => updateItem(invIdx, itemIdx, 'drug_code', v)}/>
                          {it._autoCode && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" title="จับคู่แล้ว"/>}
                          {it._needConfirm && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-400" title="แนะนำจากชื่อยา — ต้องตรวจ/ยืนยัน"/>}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 min-w-56">
                        <SearchableSelect
                          value={it.matched_name || it._candidateName || ''}
                          onChange={v => mapItemToInventory(invIdx, itemIdx, v)}
                          options={invNames}
                          placeholder="-- เลือกยาในระบบ --"
                        />
                      </td>
                      <td className="px-3 py-1.5 min-w-24"><EditableCell value={it.gpu_code} onChange={v => updateItem(invIdx, itemIdx, 'gpu_code', v)}/></td>
                      <td className="px-3 py-1.5 min-w-24"><EditableCell value={it.tpu_code} onChange={v => updateItem(invIdx, itemIdx, 'tpu_code', v)}/></td>
                      <td className="px-3 py-1.5 min-w-24"><EditableCell value={it.ttmp_code} onChange={v => updateItem(invIdx, itemIdx, 'ttmp_code', v)}/></td>
                      <td className="px-3 py-1.5 min-w-28"><EditableCell value={it.lot} onChange={v => updateItem(invIdx, itemIdx, 'lot', v)}/></td>
                      <td className="px-3 py-1.5 min-w-32"><EditableCell value={it.exp} onChange={v => updateItem(invIdx, itemIdx, 'exp', v)} className={isValidDateText(it.exp) ? '' : 'border-red-400 bg-red-50 dark:bg-red-950/40'}/></td>
                      <td className="px-3 py-1.5 min-w-32"><EditableCell value={it.mfg_date} onChange={v => updateItem(invIdx, itemIdx, 'mfg_date', v)} className={isValidDateText(it.mfg_date) ? '' : 'border-red-400 bg-red-50 dark:bg-red-950/40'}/></td>
                      <td className="px-3 py-1.5 min-w-20"><EditableCell value={it.qty_received} onChange={v => updateItem(invIdx, itemIdx, 'qty_received', v)} type="number"/></td>
                      <td className="px-3 py-1.5 min-w-20"><EditableCell value={it.drug_unit} onChange={v => updateItem(invIdx, itemIdx, 'drug_unit', v)}/></td>
                      <td className="px-3 py-1.5 min-w-28"><EditableCell value={it.price_per_unit} onChange={v => updateItem(invIdx, itemIdx, 'price_per_unit', v)} type="number"/></td>
                      <td className="px-3 py-1.5 min-w-28"><EditableCell value={it.total_price_vat} onChange={v => updateItem(invIdx, itemIdx, 'total_price_vat', v)} type="number"/></td>
                      <td className="px-3 py-1.5">
                        <button onClick={() => removeItem(invIdx, itemIdx)} className="text-slate-300 dark:text-slate-500 hover:text-red-500 transition-colors"><Trash2 size={14}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}

          {!inv.error && (() => {
            // ตรวจยอด: Σ มูลค่ารายการ (logic เดียวกับตอน save) เทียบ "รวมทั้งบิล" ที่ AI อ่าน — จับเลขอ่านผิดก่อนบันทึก
            const fmtBaht = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const sumItems = inv.items.reduce((s, it) => s + (effItemTotal(inv, it).total || 0), 0);
            const headerTotal = parseFloat(String(inv.header.invoice_total).replace(/,/g, '')) || 0;
            const diff = Math.abs(sumItems - headerTotal);
            const TOL = 1; // เศษสตางค์จากการปัดรายแถว
            return (
              <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-x-4 gap-y-1.5 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                <span>{inv.items.length} รายการ</span>
                <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
                  <span>Σ มูลค่ารายการ: <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{fmtBaht(sumItems)}</span> บาท</span>
                  <span>รวมทั้งบิล: <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{fmtBaht(headerTotal)}</span> บาท</span>
                  {headerTotal > 0 && (diff <= TOL ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 px-2 py-0.5 font-bold">
                      <CheckCircle2 size={11}/> ยอดตรงกับบิล
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60 px-2 py-0.5 font-bold">
                      <AlertTriangle size={11}/> ต่างจากยอดบิล {fmtBaht(diff)} บาท — ตรวจเลขก่อนบันทึก
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      ))}

      {/* Action bar */}
      {invoices.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{invoices.length} บิล · {totalItems} รายการ</p>
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmBox({
                message: `ทิ้งผลการอ่านทั้งหมด (${invoices.length} บิล) และเริ่มสแกนใหม่? ข้อมูลที่แก้ไขไว้จะหายไป`,
                confirmLabel: 'ทิ้งและเริ่มใหม่',
                onConfirm: () => {
                  invoices.forEach(inv => { try { URL.revokeObjectURL(inv.previewUrl); } catch { /* noop */ } });
                  setInvoices([]); setFiles([]); setSaved(false); setError('');
                },
              })}
              className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:border-slate-400 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium transition-colors"
            >
              สแกนใหม่
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !totalItems}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
            >
              {saving ? <><RefreshCcw size={15} className="animate-spin"/> กำลังบันทึก...</> : <><CheckCircle2 size={15}/> ยืนยันบันทึก {totalItems} รายการ</>}
            </button>
          </div>
        </div>
      )}
      {confirmModal}
    </div>
  );
}

// ============================================================
// CSV Import
// ============================================================
function ReceiveImport({ onDone, auth = {} }) {
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
    const v = row[idx]?.trim() || null;
    if (!v) return null;
    const lower = v.toLowerCase();
    if (lower === '(blank)' || lower === 'blank' || v === '-') return null;
    return v;
  };

  const handleImport = async () => {
    if (!rawRows.length || !supabase) return;
    setLoading(true); setError('');
    try {
      const warnRows = [];
      const activeRaws = rawRows
        .map((row, i) => ({ row, rowNum: i + 2 }))
        .filter(({ row }) => row.some(c => c.trim()));

      const rows = activeRaws.flatMap(({ row, rowNum }) => {
          const drugName   = getVal(row, 'drug_name');
          const drugCode   = normalizeCode(getVal(row, 'drug_code'));
          const drugType   = getVal(row, 'drug_type') || '';
          const lot        = getVal(row, 'lot') || '-';
          const billNumber = getVal(row, 'bill_number') || '-';

          // ข้ามแถวที่ไม่มีชื่อยาและไม่มีรหัสยาเลย (แถว footer/total/ว่าง)
          if (!drugName && (!drugCode || drugCode === '-')) return [];

          const issues = [];
          if (!drugName) issues.push('ไม่มีชื่อยา');
          if (!drugCode || drugCode === '-') issues.push('ไม่มีรหัสยา');
          // เวชภัณฑ์มิใช่ยา (ถุง/ขวด/ตลับ) ไม่มี lot ตามธรรมชาติ — ใช้ '-' ถูกต้อง ไม่เตือน
          if ((!lot || lot === '-') && drugType !== 'เวชภัณฑ์มิใช่ยา') issues.push('ไม่มี Lot');
          if (!billNumber || billNumber === '-') issues.push('ไม่มีเลขที่บิล');
          if (issues.length > 0) warnRows.push({ row: rowNum, name: drugName || '-', code: drugCode || '-', issues });

          // merge คอลัมน์ swap (#20 condition + #21 note + #22 items + Auto-Match รายละเอียด) — ตรงกับ importReceiveLogs ใน db.js
          // เดิมใช้แค่ 2 → #21 (ระบุเงื่อนไข) หาย 746 บิล (แก้ 2026-07-05); เพิ่ม Auto-Match ให้ "N เดือน" ครบขึ้น (2026-07-11)
          const swapFromCsv = [getVal(row, 'swap_condition'), getVal(row, 'swap_note'), getVal(row, 'swap_items'), getVal(row, 'swap_automatch')].filter(Boolean).join(' | ') || null;
          return [{
            order_date:           parseDate(getVal(row, 'order_date')),
            receive_date:         parseDate(getVal(row, 'receive_date')),
            inspect_date:         parseDate(getVal(row, 'inspect_date')),
            leadtime:             getVal(row, 'leadtime'),
            inspect_lag:          getVal(row, 'inspect_lag'),
            bill_number:          billNumber,
            po_number:            getVal(row, 'po_number') || '-',
            purchase_type:        getVal(row, 'purchase_type') || '-',
            receive_status:       getVal(row, 'receive_status') || '-',
            main_log:             getVal(row, 'main_log') || null,
            detail_log:           getVal(row, 'detail_log') || null,
            drug_code:            drugCode,
            drug_name:            drugName || '-',
            drug_type:            getVal(row, 'drug_type') || '-',
            item_type:            getVal(row, 'item_type') || null,
            drug_unit:            getVal(row, 'drug_unit') || null,
            supplier_current:     getVal(row, 'supplier_current') || '-',
            supplier_prev:        getVal(row, 'supplier_prev') || '-',
            supplier_changed:     getVal(row, 'supplier_changed') || '-',
            lot,
            exp:                  fmtAnyDate(getVal(row, 'exp')),
            note:                 getVal(row, 'note'),
            exp_note:             getVal(row, 'exp_note'),
            qty_received:         parseFloat(String(getVal(row, 'qty_received') || '0').replace(/,/g,'')) || null,
            unit_per_bill:        getVal(row, 'unit_per_bill') || '-',
            price_per_unit:       (() => { const p = parseFloat(String(getVal(row, 'price_per_unit') || '').replace(/,/g,'')); return isNaN(p) ? null : p; })(),
            total_price_vat:      parseFloat(String(getVal(row, 'total_price_vat') || '0').replace(/,/g,'')) || null,
            total_price_formula:  getVal(row, 'total_price_formula'),
            safety_stock:         parseFloat(String(getVal(row, 'safety_stock') || '').replace(/,/g,'')) || null,
            sum_of_lead_time:     getVal(row, 'sum_of_lead_time') || null,
            drug_swap_policy:     swapFromCsv,
            // เฟส 2 (ADR-0014): structured tier detail (col 28) + % คืน (col 29) — parseReturnPolicyV2 ใช้
            swap_tier_detail:     getVal(row, 'swap_automatch'),
            swap_return_pct:      getVal(row, 'swap_return_pct'),
            swap_condition_am:    getVal(row, 'swap_condition_am'),   // finding #2
          }];
        });

      await insertReceiveRows(rows, auth);
      const now = new Date();
      const importTime = now.toLocaleString('th-TH', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
      setStatus(`นำเข้าสำเร็จ ${rows.length.toLocaleString()} รายการ · นำเข้าเมื่อ ${importTime}`);
      setPreview(null); setRawRows([]); setRawHeaders([]);
      if (warnRows.length > 0) setUploadWarnings({ fileName: preview?.fileName || '', type: 'CSV คลังรับ', rows: warnRows });
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="bg-amber-500 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <div>
                <p className="font-bold text-lg flex items-center gap-2"><AlertCircle size={20}/>พบ Row ที่ไม่ผ่านเงื่อนไข</p>
                <p className="text-amber-100 text-sm">{uploadWarnings.type}: {uploadWarnings.fileName} — {uploadWarnings.rows.length} row มีปัญหา</p>
              </div>
              <button onClick={() => setUploadWarnings(null)} className="text-white/80 hover:text-white bg-white dark:bg-slate-900/20 hover:bg-white/30 p-2 rounded-xl transition-colors"><X size={18}/></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {uploadWarnings.rows.map((r, i) => (
                <div key={i} className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl px-4 py-2 text-sm">
                  <div className="flex gap-3 items-start">
                    <span className="font-mono bg-amber-200 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded text-xs font-bold shrink-0">Row {r.row}</span>
                    <div className="flex-1">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{r.name}</span>
                      {r.code && r.code !== '-' && <span className="text-slate-400 dark:text-slate-500 ml-2 text-xs">[{r.code}]</span>}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.issues.map((issue, j) => (
                          <span key={j} className="bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60 px-2 py-0.5 rounded-full text-xs">{issue}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">ข้อมูลที่ถูกต้องถูกบันทึกแล้ว — แก้ไข CSV แล้วอัปโหลดใหม่</p>
              <button onClick={() => setUploadWarnings(null)} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium text-sm">รับทราบ</button>
            </div>
          </div>
        </div>
      )}

      <div onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-emerald-400 bg-white dark:bg-slate-900 rounded-2xl p-10 text-center cursor-pointer transition-colors">
        <FileSpreadsheet size={40} className="mx-auto mb-3 text-slate-400 dark:text-slate-500" />
        <p className="font-semibold text-slate-700 dark:text-slate-200">คลิกเพื่อเลือกไฟล์ CSV คลังรับ</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">รองรับ .csv (UTF-8 หรือ TIS-620)</p>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
      </div>

      {error  && <p className="text-red-600 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl px-4 py-2 flex items-center gap-2"><AlertCircle size={16}/>{error}</p>}
      {status && <p className="text-emerald-700 dark:text-emerald-300 text-sm bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl px-4 py-2">{status}</p>}

      {/* Column reference — shown before file is selected */}
      {!preview && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-3">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">หัวคอลัมน์ที่รองรับในไฟล์ CSV</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">ชื่อหัวคอลัมน์ใน CSV ต้องตรงกับชื่อด้านล่าง (ไม่ต้องเว้นวรรค / ไม่ต้องตรงทุกตัว)</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'วันที่รับ',         req: true,  hints: ['วันที่รับ', 'receive_date', 'วันรับ'] },
              { label: 'ชื่อรายการยา',      req: true,  hints: ['รายการยา', 'ชื่อยา', 'drug_name'] },
              { label: 'รหัสยา',            req: false, hints: ['รหัสยา', 'รหัส', 'code'] },
              { label: 'รูปแบบยา',          req: false, hints: ['รูปแบบ', 'ชนิด', 'drug_type'] },
              { label: 'บริษัทปัจจุบัน',    req: false, hints: ['บริษัทปัจจุบัน', 'บริษัท', 'supplier'] },
              { label: 'เลขที่บิล',         req: false, hints: ['เลขที่บิลซื้อ', 'เลขบิล', 'bill_number'] },
              { label: 'เลขที่ PO',         req: false, hints: ['เลขที่po', 'po_number', 'po'] },
              { label: 'Lot',               req: false, hints: ['lot', 'lot.', 'lot number', 'เลขที่ lot'] },
              { label: 'Exp',               req: false, hints: ['exp', 'exp.', 'วันหมดอายุ'] },
              { label: 'จำนวนที่รับ',       req: false, hints: ['จำนวนที่รับ', 'qty_received', 'จำนวน'] },
              { label: 'หน่วย/บิล',         req: false, hints: ['หน่วย/บิล', 'unit_per_bill'] },
              { label: 'ราคา/หน่วย',        req: false, hints: ['ราคาต่อหน่วย(บาท)', 'ราคาต่อหน่วย', 'ราคา/หน่วย'] },
              { label: 'มูลค่ารวมภาษี',     req: false, hints: ['ราคารวมภาษี (บาท)', 'ราคารวมภาษี', 'total_price_vat'] },
              { label: 'วันที่แจ้งสั่ง',    req: false, hints: ['วันที่แจ้งสั่ง', 'order_date'] },
              { label: 'วันที่ตรวจรับ',     req: false, hints: ['วันที่ตรวจรับ', 'inspect_date'] },
              { label: 'สถานะตรวจรับ',      req: false, hints: ['สถานะตรวจรับ', 'สถานะตรวจ', 'receive_status'] },
              { label: 'ประเภทการซื้อ',     req: false, hints: ['สถานะการซื้อ', 'สถานะการสั่ง', 'purchase_type'] },
              { label: 'บริษัทก่อนหน้า',   req: false, hints: ['บริษัทก่อนหน้า', 'บริษัทก่อนนาน', 'supplier_prev'] },
              { label: 'หมายเหตุ',          req: false, hints: ['หมายเหตุ', 'note', 'remark'] },
            ].map(({ label, req, hints }) => (
              <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{label}</span>
                  {req && <span className="text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-600 px-1.5 py-0.5 rounded-full">จำเป็น</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {hints.map(h => (
                    <code key={h} className="text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded font-mono whitespace-nowrap">{h}</code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {preview && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-800 dark:text-slate-100">{preview.fileName}</p>
            <span className="text-xs text-slate-500 dark:text-slate-400">{preview.total.toLocaleString()} แถว</span>
          </div>

          {/* CSV header tags */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">หัวคอลัมน์ CSV ที่ตรวจพบ ({rawHeaders.length} คอลัมน์):</p>
            <div className="flex flex-wrap gap-1.5">
              {rawHeaders.map((h, i) => {
                const matchedField = Object.entries(mapping).find(([, idx]) => idx === i)?.[0];
                return (
                  <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${
                    matchedField ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'
                  }`}>
                    {matchedField ? <CheckCircle2 size={12}/> : <HelpCircle size={12}/>} {h}
                    {matchedField && <span className="text-[10px] text-emerald-500 ml-0.5">→ {FIELD_LABELS[matchedField] || matchedField}</span>}
                  </span>
                );
              })}
            </div>
            {rawHeaders.some((_, i) => !Object.values(mapping).includes(i)) && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12}/>คอลัมน์ที่ขึ้น <HelpCircle size={11} className="inline"/> ไม่ถูกนำเข้า — ตรวจสอบชื่อหัวตาราง CSV ให้ตรงกับที่ระบบรู้จัก</p>
            )}
          </div>

          {/* Editable mapping (collapsed) */}
          <details>
            <summary className="cursor-pointer text-xs text-indigo-600 hover:text-indigo-800 font-medium select-none">แก้ไขการจับคู่คอลัมน์ด้วยตัวเอง ▸</summary>
            <div className="grid grid-cols-1 gap-1.5 max-h-72 overflow-y-auto mt-2 pr-1">
              {Object.keys(RECEIVE_COL_MAP).map(field => (
                <div key={field} className="grid gap-2 items-center" style={{gridTemplateColumns:'10rem 1fr'}}>
                  <span className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate">{FIELD_LABELS[field] || field}</span>
                  <select value={mapping[field] ?? ''}
                    onChange={e => setMapping(p => ({ ...p, [field]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400">
                    <option value="">-- ไม่ใช้ --</option>
                    {rawHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </details>

          {/* Full preview table - all matched fields */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">ตัวอย่างข้อมูล 3 แถวแรก (เฉพาะคอลัมน์ที่ match):</p>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    {Object.keys(RECEIVE_COL_MAP).filter(f => mapping[f] != null).map(f => (
                      <th key={f} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{FIELD_LABELS[f] || f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rawRows.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                      {Object.keys(RECEIVE_COL_MAP).filter(f => mapping[f] != null).map(f => {
                        const val = getVal(row, f);
                        return (
                          <td key={f} className={`px-3 py-1.5 truncate max-w-[140px] ${val ? 'text-slate-700 dark:text-slate-200' : 'text-rose-300'}`}>
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
        <button onClick={onDone} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 font-semibold transition-all flex items-center justify-center gap-2">
          <ArrowLeft size={18}/> กลับไปหน้าประวัติรับยา
        </button>
      )}
    </div>
  );
}

// ============================================================
// View
// ============================================================
function ReceiveView({ auth = {} }) {
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [supplierFilter, setSupplier] = useState('');
  const [isMobile, setIsMobile]       = useState(() => window.innerWidth < 768);
  const [mobileDetail, setMobileDetail] = useState(null); // row ที่เปิด bottom sheet
  const [suppliers, setSuppliers]     = useState([]);
  const [drugNames, setDrugNames]     = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedDrug, setSelectedDrug] = useState('');
  const [drugRows, setDrugRows]         = useState([]);
  const [drugLoading, setDrugLoading]   = useState(false);
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [expanded, setExpanded]       = useState(null);
  const [drugExpanded, setDrugExpanded] = useState(null);
  const [page, setPage]               = useState(0);
  const [exportLoading, setExportLoading] = useState(false);
  const PAGE_SIZE = 200;
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
      .neq('receive_status', 'สแกนบิล AI') // บิลสแกนแยกอยู่ในหน้าสแกนบิล ไม่ปนประวัติรับยา (ADR-0006)
      .order('receive_date', { ascending: false })
      .order('id', { ascending: false });
    if (search.trim()) { const ls = normalizeLotSearch(search); q = q.or(`drug_name.ilike.%${search}%,drug_code.ilike.%${search}%,lot.ilike.%${ls}%,bill_number.ilike.%${search}%`); }
    if (supplierFilter) q = q.eq('supplier_current', supplierFilter);
    const isoFrom = thaiToIso(dateFrom) || dateFrom;
    const isoTo   = thaiToIso(dateTo) || dateTo || (isoFrom ? new Date().toISOString().split('T')[0] : '');
    if (isoFrom && isoTo)   { q = q.gte('receive_date', isoFrom).lte('receive_date', isoTo); }
    else if (isoFrom)       { q = q.gte('receive_date', isoFrom); }
    else if (isoTo)         { q = q.lte('receive_date', isoTo); }
    q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    const { data } = await q;
    setRows(data || []);
    setLoading(false);
  }, [search, supplierFilter, dateFrom, dateTo, page]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // โหลด aggregate stats ของทุก rows ที่ตรงกับ filter (ไม่ใช่แค่หน้าปัจจุบัน)
  const loadAgg = useCallback(async () => {
    if (!supabase) return;
    setAggStats(null);
    const isoFrom = thaiToIso(dateFrom) || dateFrom;
    const isoTo   = thaiToIso(dateTo) || dateTo || (isoFrom ? new Date().toISOString().split('T')[0] : '');
    const applyFilters = (q) => {
      q = q.neq('receive_status', 'สแกนบิล AI'); // แยกบิลสแกนออก ให้ stat ตรงกับตาราง (Rule #6)
      if (search.trim())    q = q.or(`drug_name.ilike.%${search}%,drug_code.ilike.%${search}%,lot.ilike.%${search}%,bill_number.ilike.%${search}%`);
      if (isoFrom && isoTo)  { q = q.gte('receive_date', isoFrom).lte('receive_date', isoTo); }
      else if (isoFrom)      { q = q.gte('receive_date', isoFrom); }
      else if (isoTo)        { q = q.lte('receive_date', isoTo); }
      if (supplierFilter) q = q.eq('supplier_current', supplierFilter);
      return q;
    };
    // ดึงทุก field ที่ต้องใช้กรอง blank+dedup เพื่อให้ stat card ตรงกับ displayRows ในตาราง
    const [data, minResult, maxResult] = await Promise.all([
      fetchAllRows(() => applyFilters(supabase.from('receive_logs').select('id, drug_name, drug_code, lot, exp, bill_number, supplier_current, receive_date, qty_received, total_price_vat'))),
      applyFilters(supabase.from('receive_logs').select('receive_date').not('receive_date', 'is', null).order('receive_date', { ascending: true }).limit(1)),
      applyFilters(supabase.from('receive_logs').select('receive_date').not('receive_date', 'is', null).order('receive_date', { ascending: false }).limit(1)),
    ]);
    // กรอง blank rows + dedup เหมือน displayRows ในตาราง
    const seen = new Set();
    const filtered = data.filter(r => {
      const name = (r.drug_name || '').trim().toLowerCase();
      const code = (r.drug_code || '').trim();
      const hasName = name && name !== '-' && name !== '(blank)' && name !== 'blank';
      const hasCode = code && code !== '-';
      if (!hasName && !hasCode) return false;
      const key = dedupKey(r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // นับ "บิลจริง" ด้วย composite key (bill_number|supplier|receive_date) — เลขบิลไม่ unique (Rule #19)
    // ไม่รวม qty ดิบข้ามหน่วย (กล่อง/ขวด/เม็ด/amp ปนกัน = ไร้ความหมายทางคลัง) — ใช้จำนวนบิลแทน
    const billCount  = new Set(filtered.map(billGroupKey)).size;
    const totalValue = filtered.reduce((s, r) => s + (r.total_price_vat || 0), 0);
    const minDate = minResult.data?.[0]?.receive_date || null;
    const maxDate = maxResult.data?.[0]?.receive_date || null;
    setAggStats({ count: filtered.length, billCount, totalValue, minDate, maxDate });
  }, [search, supplierFilter, dateFrom, dateTo]);

  useEffect(() => { const t = setTimeout(loadAgg, 300); return () => clearTimeout(t); }, [loadAgg]);

  const handleExport = async () => {
    if (!supabase) return;
    setExportLoading(true);
    try {
      const isoFrom = thaiToIso(dateFrom) || dateFrom;
      const isoTo   = thaiToIso(dateTo) || dateTo || (isoFrom ? new Date().toISOString().split('T')[0] : '');
      const allRows = await fetchAllRows(() => {
        let q = supabase.from('receive_logs').select('*')
          .neq('receive_status', 'สแกนบิล AI') // export ตรงกับตาราง — ไม่รวมบิลสแกน (Rule #6)
          .order('receive_date', { ascending: false })
          .order('id', { ascending: false });
        if (search.trim())  q = q.or(`drug_name.ilike.%${search}%,drug_code.ilike.%${search}%,lot.ilike.%${search}%,bill_number.ilike.%${search}%`);
        if (supplierFilter) q = q.eq('supplier_current', supplierFilter);
        if (isoFrom && isoTo)  q = q.gte('receive_date', isoFrom).lte('receive_date', isoTo);
        else if (isoFrom)      q = q.gte('receive_date', isoFrom);
        else if (isoTo)        q = q.lte('receive_date', isoTo);
        return q;
      });
      // กรอง blank rows + dedup ให้ตรงกับที่แสดงในตาราง — user คาดหวังให้ตรงกัน
      const seen = new Set();
      const exportRows = allRows.filter(r => {
        const name = (r.drug_name || '').trim().toLowerCase();
        const code = (r.drug_code || '').trim();
        const hasName = name && name !== '-' && name !== '(blank)' && name !== 'blank';
        const hasCode = code && code !== '-';
        if (!hasName && !hasCode) return false;
        const key = dedupKey(r);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      exportToExcel(exportRows, RECEIVE_EXCEL_COLS, 'ประวัติรับยา', `receive_logs_${new Date().toISOString().slice(0,10)}.xlsx`, auth);
    } finally {
      setExportLoading(false);
    }
  };

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
    fetchAllRows(() => supabase.from('receive_logs').select('drug_name, drug_type')).then(data => {
      const typeMap = {};
      data.forEach(d => { if (d.drug_name && d.drug_type && d.drug_type !== '-') typeMap[d.drug_name] = d.drug_type; });
      const names = [...new Set(data.map(d => d.drug_name).filter(Boolean))].sort();
      setDrugNames(names.map(name => ({ name, type: typeMap[name] || '' })));
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
    ? drugNames.filter(n => n.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10)
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
    setPage(0);
  };

  // dedup key: วันที่+ชื่อยา+lot+exp+เลขบิล (ใช้ drug_name แทน drug_code เพราะบางแถว code = "-")
  const dedupKey = (r) => [
    r.receive_date || '',
    (r.drug_name   || '').trim().toLowerCase(),
    (r.lot         || '').trim().toLowerCase().replace(/^-$/, ''),
    (r.exp         || '').trim().toLowerCase().replace(/^-$/, ''),
    (r.bill_number || '').trim().toLowerCase().replace(/^-$/, ''),
  ].join('|');

  // กรองด้วย date range จาก main filter + dedup
  const filteredDrugRows = (() => {
    const isoFrom = thaiToIso(dateFrom) || dateFrom;
    const isoTo   = thaiToIso(dateTo) || dateTo || (isoFrom ? new Date().toISOString().split('T')[0] : '');
    const seen = new Set();
    // เรียง: row ที่มีข้อมูลครบกว่า (supplier, price) ขึ้นก่อน → dedup จะเก็บ row ดีกว่า
    const sorted = [...drugRows].sort((a, b) => {
      const aScore = (a.supplier_current && a.supplier_current !== '-' ? 1 : 0) + (a.total_price_vat ? 1 : 0);
      const bScore = (b.supplier_current && b.supplier_current !== '-' ? 1 : 0) + (b.total_price_vat ? 1 : 0);
      return bScore - aScore;
    });
    return sorted.filter(r => {
      if (isoFrom && r.receive_date < isoFrom) return false;
      if (isoTo   && r.receive_date > isoTo)   return false;
      const key = dedupKey(r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => {
      if (!a.receive_date && !b.receive_date) return 0;
      if (!a.receive_date) return 1;
      if (!b.receive_date) return -1;
      return b.receive_date.localeCompare(a.receive_date);
    });
  })();
  const drugCode  = drugRows.find(r => r.drug_code    && r.drug_code    !== '-')?.drug_code    || '-';
  const drugUnit  = drugRows.find(r => (r.drug_unit && r.drug_unit !== '-') || (r.unit_per_bill && r.unit_per_bill !== '-'))
    ?.drug_unit || drugRows.find(r => r.unit_per_bill && r.unit_per_bill !== '-')?.unit_per_bill || '-';
  const drugTotalQty   = filteredDrugRows.reduce((s, r) => s + (r.qty_received    || 0), 0);
  const drugTotalValue = filteredDrugRows.reduce((s, r) => s + (r.total_price_vat || 0), 0);

  const displayRows = (() => {
    const seen = new Set();
    const base = supplierFilter
      ? rows.filter(r => (getDetailSupplier(r) || r.supplier_current || '') === supplierFilter)
      : rows;
    // เรียง: row ที่มีข้อมูลครบกว่าขึ้นก่อน
    const sorted = [...base].sort((a, b) => {
      const aScore = (a.supplier_current && a.supplier_current !== '-' ? 1 : 0) + (a.total_price_vat ? 1 : 0);
      const bScore = (b.supplier_current && b.supplier_current !== '-' ? 1 : 0) + (b.total_price_vat ? 1 : 0);
      return bScore - aScore;
    });
    return sorted.filter(r => {
      // ซ่อน blank row: ทั้ง drug_name และ drug_code ต้องมีค่าจริง
      const name = (r.drug_name || '').trim().toLowerCase();
      const code = (r.drug_code || '').trim();
      const hasName = name && name !== '-' && name !== '(blank)' && name !== 'blank';
      const hasCode = code && code !== '-';
      if (!hasName && !hasCode) return false;

      const key = dedupKey(r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();
  const totalQty   = displayRows.reduce((s, r) => s + (r.qty_received || 0), 0);
  const totalValue = displayRows.reduce((s, r) => s + (r.total_price_vat || 0), 0);
  const hasFilter  = search || supplierFilter || dateFrom || dateTo;
  const [aggStats, setAggStats] = useState(null);

  const clearAll = () => { clearSearch(); setSupplier(''); setSupplierSearch(''); setDateFrom(''); setDateTo(''); };


  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      {/* Filter card */}
      <div className="bg-white dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm space-y-2 sticky top-14 z-10">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-[2] min-w-[160px]" ref={searchRef}>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setSelectedDrug(''); setDrugRows([]); setPage(0); setShowDropdown(true); }}
              onFocus={() => { if (search.trim()) setShowDropdown(true); }}
              placeholder="ค้นหาชื่อยา, รหัส, Lot, เลขบิล..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl pl-9 pr-4 py-2 text-slate-800 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            {search && (
              <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={14}/>
              </button>
            )}
            {/* Dropdown ชื่อยา */}
            {showDropdown && filteredDrugs.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-20 overflow-hidden">
                {filteredDrugs.map(({ name, type }) => (
                  <button
                    key={name}
                    onMouseDown={e => { e.preventDefault(); selectDrug(name); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{name}</span>
                      {type && <DrugTypeBadge type={type} />}
                    </div>
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
              className={`bg-white dark:bg-slate-900 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 w-64 ${supplierFilter ? 'border-emerald-400 text-emerald-700 dark:text-emerald-300 font-medium' : 'border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100'}`}
            />
            {supplierFilter && (
              <button onClick={() => { setSupplier(''); setSupplierSearch(''); setPage(0); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={14}/>
              </button>
            )}
            {showSupplierDd && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-30 w-64 max-h-60 overflow-y-auto">
                <button onMouseDown={e => { e.preventDefault(); setSupplier(''); setSupplierSearch(''); setShowSupplierDd(false); setPage(0); }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
                  ทุกบริษัท
                </button>
                {suppliers
                  .filter(s => !supplierSearch || s.toLowerCase().includes(supplierSearch.toLowerCase()))
                  .map(s => (
                    <button key={s} onMouseDown={e => { e.preventDefault(); setSupplier(s); setSupplierSearch(''); setShowSupplierDd(false); setPage(0); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 border-b border-slate-100 dark:border-slate-800 last:border-0 ${supplierFilter === s ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold' : 'text-slate-700 dark:text-slate-200'}`}>
                      {s}
                    </button>
                  ))
                }
              </div>
            )}
          </div>
          <button onClick={clearAll} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 p-2 transition-colors" title="ล้างตัวกรองทั้งหมด">
            <RefreshCcw size={16}/>
          </button>
          <button
            onClick={handleExport}
            disabled={exportLoading || rows.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition-colors"
            title="ส่งออก Excel ทุกแถว">
            <FileDown size={14} /> {exportLoading ? 'กำลังโหลด...' : 'Excel'}
          </button>
        </div>
        {/* Date range */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">ตั้งแต่</span>
          <ThaiDateInput value={dateFrom} onChange={v => { setDateFrom(v); setPage(0); }} />
          <span className="text-xs text-slate-400 dark:text-slate-500">ถึง</span>
          <ThaiDateInput value={dateTo} onChange={v => { setDateTo(v); setPage(0); }}
            placeholder={dateFrom ? isoToThai(new Date().toISOString().split('T')[0]) : 'dd/mm/yyyy'} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(0); }}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1"><X size={12}/>ล้างวันที่</button>
          )}
        </div>
      </div>

      {/* ตารางประวัติรับยาที่เลือก */}
      {selectedDrug && (
        <div className="bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800/60 rounded-xl shadow-md overflow-hidden">
          {/* Header */}
          <div className="bg-emerald-700 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-base">{selectedDrug}</p>
                <p className="text-xs text-emerald-200 mt-0.5">รหัส: {drugCode} · หน่วย: {drugUnit}</p>
                {drugRows.length > 0 && (() => {
                  const suppliers = [...new Set(drugRows.map(r => r.supplier_current).filter(s => s && s !== '-'))];
                  return suppliers.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                      <span className="text-xs text-emerald-200 font-semibold shrink-0">บริษัทที่เคยรับ:</span>
                      {suppliers.map(s => (
                        <span key={s} className="text-xs bg-white dark:bg-slate-900/20 border border-white/30 text-white px-2 py-0.5 rounded-full">{s}</span>
                      ))}
                    </div>
                  ) : null;
                })()}
              </div>
              <button onClick={clearSearch} className="text-emerald-200 hover:text-white shrink-0 mt-0.5"><X size={16}/></button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 px-4 py-3">
            <div className="bg-gradient-to-br from-slate-600 to-slate-800 rounded-2xl p-3.5 text-center shadow-lg shadow-slate-300/50">
              <p className="text-2xl font-bold text-white tabular-nums">{filteredDrugRows.length.toLocaleString()}</p>
              <p className="text-xs text-slate-300 dark:text-slate-500 mt-0.5">รายการ (กรอง)</p>
            </div>
            <div className="relative overflow-hidden bg-gradient-to-br from-emerald-400 to-emerald-700 rounded-2xl p-3.5 text-center shadow-lg shadow-emerald-300/60">
              <span className="pointer-events-none absolute -left-5 -top-8 w-28 h-28 rounded-full bg-white dark:bg-slate-900/25 blur-xl" />
              <p className="relative text-2xl font-bold text-white tabular-nums">{drugTotalQty.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
              <p className="relative text-xs text-emerald-50 mt-0.5">ปริมาณรับรวม</p>
            </div>
            <div className="bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl p-3.5 text-center shadow-lg shadow-amber-200/60">
              <p className="text-2xl font-bold text-white tabular-nums">{drugTotalValue.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
              <p className="text-xs text-amber-50 mt-0.5">มูลค่ารวมภาษี (บาท)</p>
            </div>
          </div>

          {/* Table */}
          {drugLoading ? (
            <p className="text-center text-slate-400 dark:text-slate-500 py-8 text-sm">กำลังโหลด...</p>
          ) : filteredDrugRows.length === 0 ? (
            <p className="text-center text-slate-400 dark:text-slate-500 py-8 text-sm">ไม่พบข้อมูลในช่วงที่เลือก</p>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[480px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-[5]">
                  <tr className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                    <th className="px-4 py-3.5 text-left bg-slate-50 dark:bg-slate-800/80">วันที่รับ</th>
                    <th className="px-4 py-3.5 text-right bg-slate-50 dark:bg-slate-800/80">จำนวน</th>
                    <th className="px-4 py-3.5 text-left bg-slate-50 dark:bg-slate-800/80">หน่วย</th>
                    <th className="px-4 py-3.5 text-left bg-slate-50 dark:bg-slate-800/80">Lot</th>
                    <th className="px-4 py-3.5 text-left bg-slate-50 dark:bg-slate-800/80">Exp</th>
                    <th className="px-4 py-3.5 text-right bg-slate-50 dark:bg-slate-800/80">ราคา/หน่วย</th>
                    <th className="px-4 py-3.5 text-right bg-slate-50 dark:bg-slate-800/80">มูลค่ารวมภาษี (บาท)</th>
                    <th className="px-4 py-3.5 text-left bg-slate-50 dark:bg-slate-800/80">บริษัท</th>
                    <th className="px-4 py-3.5 text-left bg-slate-50 dark:bg-slate-800/80">เลขบิล</th>
                    <th className="px-4 py-3.5 w-6 bg-slate-50 dark:bg-slate-800/80"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrugRows.map((r, i) => (
                    <React.Fragment key={r.id}>
                      <tr
                        onClick={() => setDrugExpanded(drugExpanded === r.id ? null : r.id)}
                        className={`border-b border-slate-50 cursor-pointer transition-colors ${drugExpanded === r.id ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'hover:bg-emerald-50 dark:hover:bg-emerald-950/50/50'}`}
                      >
                        <td className="px-4 py-3 text-slate-800 dark:text-slate-100 whitespace-nowrap font-medium">{fmtDate(r.receive_date)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {r.qty_received ? <span className="inline-flex items-center justify-end rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold px-2.5 py-0.5 text-xs tabular-nums">+{r.qty_received.toLocaleString()}</span> : '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200 text-xs whitespace-nowrap font-medium">{r.drug_unit || r.unit_per_bill || '-'}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200 text-xs whitespace-nowrap">{r.lot || '-'}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200 text-xs whitespace-nowrap">{fmtAnyDate(r.exp)}</td>
                        <td className="px-4 py-3 text-slate-800 dark:text-slate-100 font-medium text-right whitespace-nowrap tabular-nums">{r.price_per_unit != null ? Number(r.price_per_unit).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '-'}</td>
                        <td className="px-4 py-3 text-amber-800 dark:text-amber-300 font-bold text-right whitespace-nowrap tabular-nums">{r.total_price_vat != null ? Number(r.total_price_vat).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '-'}</td>
                        <td className="px-4 py-3 max-w-[160px]">
                          <span className="text-slate-800 dark:text-slate-100 font-medium truncate block text-xs">
                            {getDetailSupplier(r) || r.supplier_current || '-'}
                          </span>
                          {r.supplier_changed && r.supplier_changed !== '-' && (
                            <span
                              title={r.supplier_prev && r.supplier_prev !== '-' ? `เดิม: ${r.supplier_prev}` : 'เปลี่ยนบริษัทจากเดิม'}
                              className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-900/60"
                            >
                              <ArrowLeftRight size={10}/> เปลี่ยนบริษัท
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200 text-xs whitespace-nowrap">{r.bill_number || '-'}</td>
                        <td className="px-4 py-3 text-slate-400 dark:text-slate-500">
                          {drugExpanded === r.id ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                        </td>
                      </tr>
                      {drugExpanded === r.id && (
                        <tr className="bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/50">
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
                                ['บริษัทก่อนหน้า',    r.supplier_prev && r.supplier_prev !== '-' ? r.supplier_prev : null],
                                ['หมายเหตุหมดอายุ',   r.exp_note],
                                ['ราคารวมภาษี/สูตร',  r.total_price_formula],
                              ].map(([label, val]) => val != null && val !== '-' && val !== '' ? (
                                <div key={label}>
                                  <span className="text-slate-400 dark:text-slate-500 text-xs">{label}: </span>
                                  <span className={label === 'บริษัทก่อนหน้า' ? 'text-orange-700 dark:text-orange-300 font-medium' : 'text-slate-700 dark:text-slate-200 font-medium'}>{val}</span>
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
                  <tr className="bg-emerald-50 dark:bg-emerald-950/40 border-t-2 border-emerald-200 dark:border-emerald-900/60 font-semibold text-sm">
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">รวม {filteredDrugRows.length} รายการ</td>
                    <td className="px-4 py-2.5 text-emerald-700 dark:text-emerald-300 text-right">{drugTotalQty.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-xs">{drugUnit}</td>
                    <td colSpan={3}></td>
                    <td className="px-4 py-2.5 text-amber-700 dark:text-amber-300 text-right">{drugTotalValue.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {!selectedDrug && rows.length > 0 && (
        <div className="space-y-2">
          {aggStats?.minDate && aggStats?.maxDate && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 flex-wrap">
              <CalendarDays size={13} className="text-slate-400 dark:text-slate-500 shrink-0" />
              <span>ข้อมูลตั้งแต่ <span className="font-semibold text-slate-700 dark:text-slate-200">{isoToThai(aggStats.minDate)}</span> – <span className="font-semibold text-slate-700 dark:text-slate-200">{isoToThai(aggStats.maxDate)}</span></span>
              <span className="text-slate-400 dark:text-slate-500">·</span>
              <span className="text-slate-600 dark:text-slate-300">{dateDiff(aggStats.minDate, aggStats.maxDate)}</span>
            </div>
          )}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gradient-to-br from-slate-600 to-slate-800 rounded-2xl p-3.5 text-center shadow-lg shadow-slate-300/50">
            <p className="text-2xl font-bold text-white tabular-nums">{aggStats ? aggStats.count.toLocaleString() : '...'}</p>
            <p className="text-xs text-slate-300 dark:text-slate-500 mt-0.5">จำนวนรายการ{supplierFilter ? ` (${supplierFilter})` : ' ทุกบริษัท'}</p>
          </div>
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-400 to-emerald-700 rounded-2xl p-3.5 text-center shadow-lg shadow-emerald-300/60">
            <span className="pointer-events-none absolute -left-5 -top-8 w-28 h-28 rounded-full bg-white dark:bg-slate-900/25 blur-xl" />
            <p className="relative text-2xl font-bold text-white tabular-nums">{aggStats ? aggStats.billCount.toLocaleString() : '...'}</p>
            <p className="relative text-xs text-emerald-50 mt-0.5">จำนวนบิล{supplierFilter ? ` (${supplierFilter})` : ' ทุกบริษัท'}</p>
          </div>
          <div className="bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl p-3.5 text-center shadow-lg shadow-amber-200/60">
            <p className="text-2xl font-bold text-white tabular-nums">{aggStats ? aggStats.totalValue.toLocaleString(undefined,{maximumFractionDigits:0}) : '...'}</p>
            <p className="text-xs text-amber-50 mt-0.5">มูลค่ารวมภาษี (บาท){supplierFilter ? ` (${supplierFilter})` : ' ทุกบริษัท'}</p>
          </div>
        </div>
        </div>
      )}

      {!selectedDrug && loading && <p className="text-center text-slate-400 dark:text-slate-500 py-10">กำลังโหลด...</p>}
      {!selectedDrug && !loading && rows.length === 0 && (
        <div className="text-center text-slate-400 dark:text-slate-500 py-20">
          <TrendingUp size={48} className="mx-auto mb-3 opacity-30" />
          <p>ไม่พบข้อมูล{hasFilter ? ' — ลองเปลี่ยนตัวกรอง' : ' — กด Import CSV เพื่อนำเข้าข้อมูล'}</p>
        </div>
      )}
      {!selectedDrug && !loading && rows.length > 0 && displayRows.length === 0 && supplierFilter && (
        <div className="text-center text-slate-400 dark:text-slate-500 py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl">
          <Search size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">ไม่พบรายการของบริษัท <span className="font-semibold text-slate-600 dark:text-slate-300">"{supplierFilter}"</span> ในช่วงนี้</p>
          <button onClick={() => setSupplier('')} className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 underline">ล้างตัวกรองบริษัท</button>
        </div>
      )}

      {/* ── Mobile bottom sheet detail ── */}
      {mobileDetail && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setMobileDetail(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* handle */}
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full"/></div>
            {/* header */}
            <div className="px-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <p className="font-bold text-slate-900 dark:text-slate-50 text-base leading-tight">{mobileDetail.drug_name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{mobileDetail.drug_code} · {fmtDate(mobileDetail.receive_date)}</p>
              {mobileDetail.supplier_changed && mobileDetail.supplier_changed !== '-' && (
                <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-900/60">
                  <ArrowLeftRight size={11}/> เปลี่ยนบริษัท{mobileDetail.supplier_prev && mobileDetail.supplier_prev !== '-' ? ` (เดิม: ${mobileDetail.supplier_prev})` : ''}
                </span>
              )}
            </div>
            {/* body */}
            <div className="overflow-y-auto px-4 py-3 space-y-3">
              {/* key stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">+{(mobileDetail.qty_received||0).toLocaleString()}</p>
                  <p className="text-[10px] text-emerald-600">{mobileDetail.drug_unit || mobileDetail.unit_per_bill || '-'}</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-2.5 text-center">
                  <p className="text-base font-bold text-amber-700 dark:text-amber-300">{mobileDetail.total_price_vat != null ? Number(mobileDetail.total_price_vat).toLocaleString(undefined,{maximumFractionDigits:0}) : '-'}</p>
                  <p className="text-[10px] text-amber-600">มูลค่า (บาท)</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2.5 text-center">
                  <p className="text-base font-bold text-slate-700 dark:text-slate-200">{mobileDetail.price_per_unit != null ? Number(mobileDetail.price_per_unit).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '-'}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">ราคา/หน่วย</p>
                </div>
              </div>
              {/* detail fields */}
              <div className="space-y-2">
                {[
                  ['บริษัท',           getDetailSupplier(mobileDetail) || mobileDetail.supplier_current],
                  ['เลขบิล',           mobileDetail.bill_number],
                  ['Lot',              mobileDetail.lot],
                  ['Exp',              fmtAnyDate(mobileDetail.exp)],
                  ['ชนิดยา',           mobileDetail.drug_type],
                  ['สถานะตรวจรับ',     mobileDetail.receive_status],
                  ['วันที่แจ้งสั่ง',   fmtDate(mobileDetail.order_date)],
                  ['วันที่ตรวจรับ',    fmtDate(mobileDetail.inspect_date)],
                  ['เลขที่ PO',        mobileDetail.po_number],
                  ['ประเภทการซื้อ',    mobileDetail.purchase_type],
                  ['Leadtime',         mobileDetail.leadtime],
                  ['บริษัทก่อนหน้า',  mobileDetail.supplier_prev],
                  ['ราคารวมภาษี/สูตร', mobileDetail.total_price_formula],
                  ['หมายเหตุหมดอายุ', mobileDetail.exp_note],
                ].filter(([, val]) => val != null && val !== '-' && val !== '').map(([label, val]) => (
                  <div key={label} className="flex justify-between items-start gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{label}</span>
                    <span className="text-sm text-slate-800 dark:text-slate-100 font-medium text-right">{val}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* close */}
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setMobileDetail(null)} className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl py-2.5 text-sm font-medium transition-colors">ปิด</button>
            </div>
          </div>
        </div>
      )}

      {!selectedDrug && rows.length > 0 && isMobile && (
        /* ── Mobile card list ── */
        <div className="space-y-2">
          {displayRows.map(row => (
            <button key={row.id} onClick={() => setMobileDetail(row)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 shadow-sm text-left active:bg-emerald-50 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-50 text-sm leading-tight truncate">{row.drug_name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{row.drug_code} · {fmtDate(row.receive_date)}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold px-2.5 py-0.5 text-xs tabular-nums">+{(row.qty_received||0).toLocaleString()}</span>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{row.drug_unit || row.unit_per_bill || '-'}</p>
                </div>
              </div>
              {((row.lot && row.lot !== '-') || (row.exp && row.exp !== '-')) && (
                <div className="flex items-center gap-1.5 mt-2 text-[11px]">
                  {row.lot && row.lot !== '-' && <span className="font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md">Lot {row.lot}</span>}
                  {row.exp && row.exp !== '-' && <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md">Exp {fmtAnyDate(row.exp)}</span>}
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[60%]">{getDetailSupplier(row) || row.supplier_current || '-'}</span>
                <span className="text-amber-700 dark:text-amber-300 font-bold text-sm">
                  {row.total_price_vat != null ? Number(row.total_price_vat).toLocaleString(undefined,{maximumFractionDigits:0}) + ' ฿' : '-'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {!selectedDrug && rows.length > 0 && !isMobile && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-260px)]">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 z-[5]">
                <tr className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 text-left bg-slate-50 dark:bg-slate-800">วันที่รับ</th>
                  <th className="px-4 py-3 text-left bg-slate-50 dark:bg-slate-800">ชื่อรายการยา</th>
                  <th className="px-4 py-3 text-left bg-slate-50 dark:bg-slate-800">ชนิดยา</th>
                  <th className="px-4 py-3 text-right bg-slate-50 dark:bg-slate-800">จำนวน</th>
                  <th className="px-4 py-3 text-left bg-slate-50 dark:bg-slate-800">หน่วย</th>
                  <th className="px-4 py-3 text-left bg-slate-50 dark:bg-slate-800">Lot</th>
                  <th className="px-4 py-3 text-left bg-slate-50 dark:bg-slate-800">Exp</th>
                  <th className="px-4 py-3 text-right bg-slate-50 dark:bg-slate-800">ราคา/หน่วย</th>
                  <th className="px-4 py-3 text-right bg-slate-50 dark:bg-slate-800">มูลค่ารวมภาษี (บาท)</th>
                  <th className="px-4 py-3 text-left bg-slate-50 dark:bg-slate-800">บริษัท</th>
                  <th className="px-4 py-3 text-left bg-slate-50 dark:bg-slate-800">เลขบิล</th>
                  <th className="px-4 py-3 w-8 bg-slate-50 dark:bg-slate-800"></th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => (
                  <React.Fragment key={row.id}>
                    <tr
                      onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                      className={`border-b border-slate-100 dark:border-slate-800 cursor-pointer transition-colors ${expanded === row.id ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'hover:bg-emerald-50 dark:hover:bg-emerald-950/50/60'}`}
                    >
                      <td className="px-4 py-2.5 text-slate-800 dark:text-slate-100 whitespace-nowrap font-medium">{fmtDate(row.receive_date)}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-50 max-w-[220px]">
                        <span className="block truncate">{row.drug_name}</span>
                        <span className="text-xs text-slate-600 dark:text-slate-300 font-normal">{row.drug_code}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">{row.drug_type || '-'}</td>
                      <td className="px-4 py-2.5 text-emerald-800 dark:text-emerald-300 font-bold text-right whitespace-nowrap">+{(row.qty_received || 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200 text-xs whitespace-nowrap font-medium">{row.drug_unit || row.unit_per_bill || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200 text-xs whitespace-nowrap">{row.lot || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200 text-xs whitespace-nowrap">{fmtAnyDate(row.exp)}</td>
                      <td className="px-4 py-2.5 text-slate-800 dark:text-slate-100 font-medium text-right whitespace-nowrap">{row.price_per_unit != null ? Number(row.price_per_unit).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '-'}</td>
                      <td className="px-4 py-2.5 text-amber-800 dark:text-amber-300 font-bold text-right whitespace-nowrap">{row.total_price_vat != null ? Number(row.total_price_vat).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '-'}</td>
                      <td className="px-4 py-2.5 text-slate-800 dark:text-slate-100 max-w-[160px] font-medium text-xs">
                        <span className="block truncate">{getDetailSupplier(row) || row.supplier_current || '-'}</span>
                        {row.supplier_changed && row.supplier_changed !== '-' && (
                          <span
                            title={row.supplier_prev && row.supplier_prev !== '-' ? `เดิม: ${row.supplier_prev}` : 'เปลี่ยนบริษัทจากเดิม'}
                            className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-900/60"
                          >
                            <ArrowLeftRight size={10}/> เปลี่ยนบริษัท
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200 text-xs whitespace-nowrap">{row.bill_number || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                        {expanded === row.id ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                      </td>
                    </tr>
                    {expanded === row.id && (
                      <tr className="bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/50">
                        <td colSpan={12} className="px-6 py-3">
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
                              ['บริษัทก่อนหน้า',    row.supplier_changed && row.supplier_changed !== '-' ? row.supplier_prev : null],
                              ['หมายเหตุหมดอายุ',   row.exp_note],
                              ['ราคารวมภาษี/สูตร',  row.total_price_formula],
                            ].map(([label, val]) => val != null && val !== '-' && val !== '' ? (
                              <div key={label}>
                                <span className="text-slate-400 dark:text-slate-500 text-xs">{label}: </span>
                                <span className={label === 'บริษัทก่อนหน้า' ? 'text-orange-700 dark:text-orange-300 font-medium' : 'text-slate-700 dark:text-slate-200 font-medium'}>{val}</span>
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

      {!selectedDrug && (rows.length === PAGE_SIZE || page > 0) && (() => {
        const totalPages = aggStats ? Math.ceil(aggStats.count / PAGE_SIZE) : null;
        return (
          <div className="flex items-center gap-3 justify-center pt-2 flex-wrap">
            {page > 0 && <button onClick={() => setPage(p => p-1)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl px-4 py-2 text-sm shadow-sm">← ก่อนหน้า</button>}
            {aggStats && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span>หน้า</span>
                <input
                  type="number" min={1} max={totalPages || undefined}
                  defaultValue={page + 1} key={page}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const v = parseInt(e.target.value, 10);
                      if (v >= 1 && (!totalPages || v <= totalPages)) setPage(v - 1);
                    }
                  }}
                  onBlur={e => {
                    const v = parseInt(e.target.value, 10);
                    if (v >= 1 && (!totalPages || v <= totalPages)) setPage(v - 1);
                  }}
                  className="w-14 text-center border border-slate-300 dark:border-slate-600 rounded-lg px-1 py-1 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <span>/ {totalPages}</span>
                <span className="text-slate-400 dark:text-slate-500 ml-1">({aggStats.count.toLocaleString()} รายการ)</span>
              </div>
            )}
            {rows.length === PAGE_SIZE && <button onClick={() => setPage(p => p+1)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl px-4 py-2 text-sm shadow-sm">ถัดไป →</button>}
          </div>
        );
      })()}
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
  const [allTimeTotal, setAllTimeTotal]           = useState(null);
  const [allTimeValue, setAllTimeValue]           = useState(null);
  const [allTimeUniqueDays, setAllTimeUniqueDays] = useState(null);
  const [dataRange, setDataRange]                 = useState({ from: '', to: '' }); // ช่วงข้อมูลจริง (วันแรก–วันล่าสุด)

  useEffect(() => {
    if (!supabase) return;
    // count ทั้งหมด (ไม่โหลด rows จริง — แม่นยำ)
    supabase.from('receive_logs').select('*', { count: 'exact', head: true })
      .then(({ count }) => setAllTimeTotal(count ?? 0));
    // มูลค่า + unique days (paginated — ข้าม 1,000-row limit)
    fetchAllRows(() =>
      supabase.from('receive_logs').select('total_price_vat, receive_date')
    ).then(data => {
      if (!data || data.length === 0) return;
      setAllTimeValue(data.reduce((s, r) => s + (r.total_price_vat || 0), 0));
      setAllTimeUniqueDays(new Set(data.map(r => r.receive_date).filter(Boolean)).size);
    });
    // วันแรก–วันล่าสุด → set dateFrom/dateTo อัตโนมัติ + เก็บช่วงข้อมูลจริงไว้แสดง
    supabase.from('receive_logs').select('receive_date').order('receive_date', { ascending: true  }).limit(1)
      .then(({ data }) => { if (data?.[0]?.receive_date) { const t = isoToThai(data[0].receive_date); setDateFrom(t); setDataRange(r => ({ ...r, from: t })); } });
    supabase.from('receive_logs').select('receive_date').order('receive_date', { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]?.receive_date) { const t = isoToThai(data[0].receive_date); setDateTo(t); setDataRange(r => ({ ...r, to: t })); } });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('receive_logs').select('supplier_current').then(({ data }) => {
      if (data) setSuppliers([...new Set(data.map(d => d.supplier_current).filter(Boolean))].sort());
    });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    fetchAllRows(() => supabase.from('receive_logs').select('drug_name, drug_type')).then(data => {
      const typeMap = {};
      data.forEach(d => { if (d.drug_name && d.drug_type && d.drug_type !== '-') typeMap[d.drug_name] = d.drug_type; });
      const names = [...new Set(data.map(d => d.drug_name).filter(Boolean))].sort();
      setDrugNames(names.map(name => ({ name, type: typeMap[name] || '' })));
    });
  }, []);


  const loadStats = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const rows = await fetchAllRows(() => {
      let q = supabase.from('receive_logs').select('supplier_current, drug_name, qty_received, total_price_vat, price_per_unit, receive_date');
      const isoFrom = thaiToIso(dateFrom);
      const isoTo   = thaiToIso(dateTo);
      if (isoFrom)        q = q.gte('receive_date', isoFrom);
      if (isoTo)          q = q.lte('receive_date', isoTo);
      if (supplierFilter) q = q.eq('supplier_current', supplierFilter);
      if (drugFilter)     q = q.ilike('drug_name', `%${drugFilter}%`);
      return q;
    });
    if (!rows || rows.length === 0) { setStats(null); setLoading(false); return; }

    const totalQty   = rows.reduce((s, r) => s + (r.qty_received || 0), 0);
    const totalValue = rows.reduce((s, r) => s + (r.total_price_vat || 0), 0);
    const uniqueDays = new Set(rows.map(r => r.receive_date).filter(Boolean)).size;

    const aggBy = (key, valFn) => {
      const map = {};
      rows.forEach(r => { const k = r[key] || 'ไม่ระบุ'; map[k] = (map[k] || 0) + valFn(r); });
      return Object.entries(map).sort((a, b) => b[1] - a[1]);
    };

    // --- map "เต็ม" ต่อยา (ทุกตัว ไม่ slice) ใช้ lookup ในกราฟยารับเข้าบ่อย+มูลค่า ---
    // กันบั๊กแถบมูลค่า = 0 เมื่อยาติดอันดับเพราะ "ความถี่" แต่ไม่ติด top-10 "มูลค่า"
    const freqSet = {};   // ยา → set ของ receive_date (1 วัน = 1 ครั้ง)
    const valFull = {};   // ยา → มูลค่ารับเข้ารวม
    rows.forEach(r => {
      const k = r.drug_name || 'ไม่ระบุ';
      (freqSet[k] || (freqSet[k] = new Set())).add(r.receive_date || `id_${r.id}`);
      const rowVal = (r.total_price_vat && r.total_price_vat > 0)
        ? r.total_price_vat
        : (r.qty_received || 0) * (r.price_per_unit || 0);
      valFull[k] = (valFull[k] || 0) + rowVal;
    });
    const drugFreqMap  = Object.fromEntries(Object.entries(freqSet).map(([n, s]) => [n, s.size]));
    const drugValueMap = Object.fromEntries(Object.entries(valFull).map(([n, t]) => [n, Math.round(t)]));

    setStats({
      total: rows.length,
      totalQty,
      totalValue,
      uniqueDays,
      topSuppliers:      aggBy('supplier_current', r => r.total_price_vat || 0).slice(0, 10),
      topSuppliersShare: (() => {
        const valMap = {};
        rows.forEach(r => {
          const k = r.supplier_current || 'ไม่ระบุ';
          valMap[k] = (valMap[k] || 0) + (r.total_price_vat || 0);
        });
        const grand = Object.values(valMap).reduce((s, v) => s + v, 0) || 1;
        // isGPO = องค์การเภสัชกรรม — บังคับซื้อตามกฎระเบียบ ไม่นับเป็น supply risk
        const isGPO = (name) => name.includes('องค์การเภสัช');
        return Object.entries(valMap)
          .map(([name, val]) => [name, parseFloat((val / grand * 100).toFixed(1)), isGPO(name)])
          .sort((a, b) => b[1] - a[1]).slice(0, 10);
      })(),
      // top-10 ตามความถี่ / ตามมูลค่า — ใช้เลือกว่าจะโชว์ยาตัวไหน
      topDrugsByFreq:       Object.entries(drugFreqMap).sort((a, b) => b[1] - a[1]).slice(0, 10),
      topDrugsByValuePerTx: Object.entries(drugValueMap).sort((a, b) => b[1] - a[1]).slice(0, 10),
      // map เต็ม — ใช้ lookup ค่าจริงของยาทุกตัวที่ถูกโชว์ (กันแถบมูลค่า = 0)
      drugFreqMap,
      drugValueMap,
    });
    setLoading(false);
  }, [dateFrom, dateTo, supplierFilter, drugFilter]);

  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-start justify-center z-50 p-3 pt-4 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col mb-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-emerald-800 p-5 flex justify-between items-center text-white rounded-t-2xl">
          <h3 className="text-xl font-bold flex items-center gap-3">
            <BarChart3 size={22} className="text-emerald-300"/> สรุปข้อมูลการรับเข้าคลัง
          </h3>
          <button onClick={onClose} className="text-white/70 hover:text-white bg-white dark:bg-slate-900/10 hover:bg-white/20 p-2 rounded-xl transition-colors"><X size={20}/></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Filters */}
          <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">กรองข้อมูล:</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">ตั้งแต่</span>
              <ThaiDateInput value={dateFrom} onChange={setDateFrom} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">ถึง</span>
              <ThaiDateInput value={dateTo} onChange={setDateTo} />
            </div>
            <select value={supplierFilter} onChange={e => setSupplier(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400">
              <option value="">ทุกบริษัท</option>
              {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <DrugSearchBar
              value={drugFilter}
              onChange={setDrugFilter}
              options={drugNames}
              placeholder="ค้นหายา..."
              className="w-44"
              ringClass="focus:ring-emerald-400"
              hoverClass="hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
            />
            {(dateFrom || dateTo || supplierFilter || drugFilter) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); setSupplier(''); setDrugFilter(''); }}
                className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1"><X size={12}/>ล้าง</button>
            )}
          </div>

          {/* ช่วงข้อมูลจริง — ระบุว่า "ทุกช่วงเวลา" คือวันไหนถึงวันไหน */}
          {dataRange.from && dataRange.to && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 -mt-2 px-1 flex-wrap">
              <CalendarDays size={13} className="text-slate-400 dark:text-slate-500" />
              ช่วงข้อมูลทั้งหมดในระบบ: <span className="font-semibold text-slate-700 dark:text-slate-200">{dataRange.from}</span> ถึง <span className="font-semibold text-slate-700 dark:text-slate-200">{dataRange.to}</span>
              <span className="text-slate-400 dark:text-slate-500">(ค่าในการ์ดสรุปนับจากข้อมูลทั้งหมดนี้ เว้นแต่จะกรองบริษัท/ยา)</span>
            </div>
          )}

          {loading ? (
            <p className="text-center text-slate-400 dark:text-slate-500 py-16">กำลังโหลด...</p>
          ) : !stats ? (
            <p className="text-center text-slate-400 dark:text-slate-500 py-16">ไม่มีข้อมูลในช่วงที่เลือก</p>
          ) : (
            (() => {
              const isFiltered  = !!(supplierFilter || drugFilter);
              const rangeLabel  = (dataRange.from && dataRange.to) ? `${dataRange.from} – ${dataRange.to}` : 'ทุกช่วงเวลา';
              const filterLabel = supplierFilter || (drugFilter ? `ยา: ${drugFilter}` : 'ทุกช่วงเวลา');
              const periodLabel = isFiltered ? filterLabel : rangeLabel; // ช่วงที่ใช้สรุป — โชว์วันที่จริงเมื่อดูทั้งหมด
              const cardTotal   = isFiltered ? stats.total      : (allTimeTotal      ?? null);
              const cardDays    = isFiltered ? stats.uniqueDays : (allTimeUniqueDays ?? null);
              const cardValue   = isFiltered ? stats.totalValue : (allTimeValue      ?? null);
              // --- สรุปอัตโนมัติ (insight) จากข้อมูลที่กรอง ---
              const topSup      = stats.topSuppliers[0];
              const topSupShare = stats.topSuppliersShare[0];
              const topShPct    = topSupShare?.[1] || 0;
              const topShGpo    = topSupShare?.[2];
              const avgPerDay   = stats.uniqueDays > 0 ? Math.round(stats.totalValue / stats.uniqueDays) : 0;
              const concentRisk = !topShGpo && topShPct >= 40;
              const topFreqDrug = stats.topDrugsByFreq[0];
              const topValDrug  = stats.topDrugsByValuePerTx[0];
              return (<>
              {/* KPI */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label:'รายการรับทั้งหมด',   value: cardTotal != null ? cardTotal.toLocaleString() : '...', unit:`รายการ (${filterLabel})`, Icon: ClipboardList, bg:'bg-indigo-50 dark:bg-indigo-950/40',  bd:'border-indigo-200 dark:border-indigo-900/60',  lbl:'text-indigo-600',  val:'text-indigo-900 dark:text-indigo-200'  },
                  { label:'จำนวนวันที่มีการรับ', value: cardDays  != null ? cardDays.toLocaleString()  : '...', unit:`วัน (${filterLabel})`,    Icon: CalendarDays,  bg:'bg-emerald-50 dark:bg-emerald-950/40', bd:'border-emerald-200 dark:border-emerald-900/60', lbl:'text-emerald-600', val:'text-emerald-900 dark:text-emerald-200' },
                  { label:'มูลค่ารับรวม (บาท)',  value: cardValue != null ? cardValue.toLocaleString(undefined,{maximumFractionDigits:0}) : '...', unit:`บาท (${filterLabel})`, Icon: TrendingUp, bg:'bg-amber-50 dark:bg-amber-950/40', bd:'border-amber-200 dark:border-amber-900/60', lbl:'text-amber-600', val:'text-amber-900 dark:text-amber-200' },
                ].map((k,i) => (
                  <div key={i} className={`${k.bg} border ${k.bd} rounded-xl p-4 shadow-sm relative overflow-hidden`}>
                    <k.Icon size={44} className={`absolute -right-2 -bottom-2 opacity-10 ${k.lbl}`} />
                    <div className={`text-xs font-bold uppercase tracking-wide ${k.lbl} mb-1 flex items-center gap-1.5`}><k.Icon size={13}/>{k.label}</div>
                    <div className={`text-2xl font-black ${k.val} relative z-10`}>{k.value}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{k.unit}</div>
                  </div>
                ))}
              </div>

              {/* สรุปอัตโนมัติ — อ่านประเด็นสำคัญได้ทันที */}
              <div className="bg-gradient-to-r from-slate-50 dark:from-slate-900 to-emerald-50 dark:to-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="flex items-start gap-2.5">
                  <Info size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">สรุป:</span>{' '}
                    ในช่วง <span className="font-semibold">{periodLabel}</span> รับเข้า{' '}
                    <span className="font-bold text-indigo-700 dark:text-indigo-300">{stats.total.toLocaleString()}</span> รายการ มูลค่ารวม{' '}
                    <span className="font-bold text-amber-700 dark:text-amber-300">{stats.totalValue.toLocaleString(undefined,{maximumFractionDigits:0})}</span> บาท
                    {stats.uniqueDays > 0 && <> (เฉลี่ย <span className="font-semibold">{avgPerDay.toLocaleString()}</span> บาท/วันที่มีการรับ)</>}
                    {topSup && <> · บริษัทที่ซื้อมากสุดคือ <span className="font-semibold text-emerald-800 dark:text-emerald-300">{topSup[0]}</span> คิดเป็น <span className="font-bold">{topShPct}%</span> ของมูลค่า</>}
                    {topValDrug && <> · ยาที่ใช้งบรับเข้าสูงสุดคือ <span className="font-semibold">{topValDrug[0]}</span></>}
                    {concentRisk && (
                      <span className="inline-flex items-center gap-1 ml-1 text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-2 py-0.5 rounded-full align-middle">
                        <AlertCircle size={12}/> พึ่งพาบริษัทเดียวเกิน 40% ควรกระจายแหล่งซื้อ
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bar charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <BarSection title="บริษัทที่มูลค่าสูงสุด (บาท)" items={stats.topSuppliers} barColor="bg-emerald-500" unit="บาท"
                  caption="เรียงบริษัทตามมูลค่าการรับซื้อรวม — ดูว่างบจัดซื้อกระจุกอยู่ที่บริษัทใด แท่งยาวสุด = ซื้อมากสุด" />
                <BarSection title="สัดส่วนมูลค่าต่อบริษัท (%)" items={stats.topSuppliersShare} shareMode
                  caption="% ของมูลค่ารวมที่ซื้อจากแต่ละบริษัท — เตือนความเสี่ยงพึ่งพาแหล่งเดียว (single-source) สีแดง ≥40% = เสี่ยงสูง" />
              </div>
              {/* Drug comparison — frequency vs value/tx */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
                <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-2">
                  <BarChart3 size={16} className="text-emerald-500"/> ยาที่รับเข้าบ่อยและมูลค่าต่อครั้ง
                </h4>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2 leading-snug">
                  เทียบ "ความถี่การรับเข้า" (แท่งม่วง = จำนวนวันที่รับ) กับ "มูลค่ารวม" (แท่งเหลือง) ของยาแต่ละตัว —
                  รับบ่อยแต่มูลค่าต่ำ = ของใช้ประจำ · รับน้อยแต่มูลค่าสูง = ยาราคาแพง ควรคุมสต็อกใกล้ชิด
                </p>
                <div className="flex gap-5 mb-4 pt-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><span className="inline-block w-3 h-3 rounded-full bg-indigo-400"/>&nbsp;จำนวนครั้งที่รับ (วัน)</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><span className="inline-block w-3 h-3 rounded-full bg-amber-400"/>&nbsp;มูลค่ารับเข้ารวม (บาท)</span>
                </div>
                {(() => {
                  const freqMap  = stats.drugFreqMap;   // map เต็ม — ค่าจริงของยาทุกตัว
                  const valTxMap = stats.drugValueMap;   // map เต็ม — กันแถบมูลค่า = 0
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
                          <div key={i} className="flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg px-1 py-0.5 transition-colors">
                            <span className={`text-xs font-black w-5 text-center shrink-0 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400 dark:text-slate-500' : i === 2 ? 'text-orange-400' : 'text-slate-300 dark:text-slate-500'}`}>
                              {i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate mb-1">{name}</p>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                    <div className="bg-indigo-400 h-1.5 rounded-full" style={{width:`${(freq/maxFreq)*100}%`}}/>
                                  </div>
                                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 w-16 text-right shrink-0">{freq} ครั้ง</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                    <div className="bg-amber-400 h-1.5 rounded-full" style={{width:`${(valTx/maxValTx)*100}%`}}/>
                                  </div>
                                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300 w-20 text-right shrink-0">{Number(valTx).toLocaleString(undefined,{maximumFractionDigits:0})} ฿</span>
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
              </>);
            })()
          )}
        </div>

        <div className="bg-slate-50 dark:bg-slate-800 p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end rounded-b-2xl">
          <button onClick={onClose} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors shadow-sm">ปิด</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Shared bar chart section
// ============================================================
function BarSection({ title, items, barColor, unit, shareMode = false, caption }) {
  if (!items || items.length === 0) return null;
  const max = items[0][1] || 1;

  const shareBarColor = (pct, gpo) => {
    if (gpo) return 'bg-blue-400';
    if (pct >= 40) return 'bg-red-500';
    if (pct >= 20) return 'bg-orange-400';
    if (pct >= 10) return 'bg-amber-400';
    return 'bg-emerald-400';
  };
  const shareBadge = (pct, gpo) => {
    if (gpo) return <span className="ml-1 text-[10px] font-bold text-blue-600 bg-blue-100 dark:bg-blue-950/60 px-1.5 py-0.5 rounded-full shrink-0">รัฐ</span>;
    if (pct >= 40) return <span className="ml-1 text-[10px] font-bold text-red-600 bg-red-100 dark:bg-red-950/60 px-1.5 py-0.5 rounded-full shrink-0">เสี่ยงสูง</span>;
    if (pct >= 20) return <span className="ml-1 text-[10px] font-bold text-orange-600 bg-orange-100 dark:bg-orange-950/60 px-1.5 py-0.5 rounded-full shrink-0">ระวัง</span>;
    return null;
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <h4 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
        <BarChart3 size={16} className="text-slate-400 dark:text-slate-500"/> {title}
      </h4>
      {caption && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 mb-2 leading-snug">{caption}</p>}
      <div className={caption ? 'border-b border-slate-100 dark:border-slate-800 mb-3' : 'border-b border-slate-100 dark:border-slate-800 mb-3 mt-3'} />
      {shareMode && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1"/>รัฐ (ยกเว้นประเมิน) &nbsp;
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"/>≥40% เสี่ยงสูง &nbsp;
          <span className="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1"/>≥20% ระวัง &nbsp;
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1"/>&lt;10% ปลอดภัย
        </p>
      )}
      <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
        {items.map(([name, val, gpo], i) => (
          <div key={i}>
            <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 gap-1">
              <span className="truncate">{name}</span>
              <div className="flex items-center shrink-0">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {shareMode ? `${val}%` : Number(val).toLocaleString(undefined,{maximumFractionDigits:0}) + ' ' + unit}
                </span>
                {shareMode && shareBadge(val, gpo)}
              </div>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className={`${shareMode ? shareBarColor(val, gpo) : barColor} h-2 rounded-full transition-all`}
                style={{ width:`${shareMode ? val : (val/max)*100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// AP Workflow — ติดตาม + ส่งบัญชี (Weekly Batch)
// ============================================================
const AP_STAGE_LABEL = {
  null:           { label: 'รอจัดซื้อรับเอกสาร',  bg: 'bg-amber-100 dark:bg-amber-950/60',  text: 'text-amber-700 dark:text-amber-300',  dot: 'bg-amber-500' },
  acked:          { label: 'จัดซื้อรับเอกสารแล้ว', bg: 'bg-sky-100 dark:bg-sky-950/60',    text: 'text-sky-700 dark:text-sky-300',    dot: 'bg-sky-500' },
  inspected:      { label: 'รอนำส่งบัญชี',   bg: 'bg-orange-100 dark:bg-orange-950/60', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
  sent_batch:     { label: 'นำส่งบัญชีแล้ว (รอตั้งหนี้)', bg: 'bg-indigo-100 dark:bg-indigo-950/60', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500' },
  posted:         { label: 'ตั้งหนี้แล้ว',  bg: 'bg-emerald-100 dark:bg-emerald-950/60', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
};

function daysSince(iso) {
  if (!iso) return 0;
  const d = new Date(iso); if (isNaN(d)) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

function fmtDateThaiShort(iso) {
  if (!iso) return '-';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${Number(m[1]) + 543}`;
}

function fmtBahtDisplay(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayIsoLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const HOSPITAL_NAME = 'โรงพยาบาลประชาธิปัตย์';

function printApBatch(rows, batchId, meta = {}) {
  if (!rows || rows.length === 0) return;
  // kind: 'ap' = ใบนำส่งบิลตั้งหนี้ (คลัง → บัญชี) | 'ack' = ใบส่งมอบเอกสาร (คลัง → จัดซื้อ)
  const kind = meta.kind || 'ap';
  const isAck = kind === 'ack';
  const docTitle    = isAck ? 'ใบส่งมอบเอกสาร'            : 'ใบนำส่งบิลตั้งหนี้';
  const docSubtitle = isAck ? 'Bills for Procurement Acknowledgement' : 'Weekly AP Batch Submission';
  const batchLabel  = isAck ? 'วันที่ส่งจัดซื้อ'                : 'รหัสรอบส่ง';
  const sigLeftTitle  = isAck ? 'เจ้าหน้าที่คลัง'   : 'กรรมการตรวจรับ';
  const sigLeftLabel  = isAck ? 'ลายมือชื่อ ผู้ส่ง' : 'ลายมือชื่อ ผู้ตรวจรับ';
  const sigRightTitle = isAck ? 'เจ้าหน้าที่จัดซื้อ' : 'เจ้าหน้าที่จัดซื้อ';
  const sigRightLabel = isAck ? 'ลายมือชื่อ ผู้รับบิล' : 'ลายมือชื่อ ผู้ส่ง';
  const bills = (function group(){
    const m = new Map();
    for (const r of rows) {
      // group ด้วย composite key เดียวกับ groupRowsByBill — เลขบิลซ้ำ (คนละบริษัท/วัน) แยกใบ
      const billNo = (r.bill_number || '').trim();
      const b = (billNo && billNo !== '-') ? billNo : '-';
      const key = billGroupKey(r);
      if (!m.has(key)) m.set(key, { bill_number: b, supplier: r.supplier_current || '-', receive_date: r.receive_date, items: [], total_value: 0 });
      const g = m.get(key);
      g.items.push(r);
      const qty = parseFloat(r.qty_received) || 0;
      const price = parseFloat(r.price_per_unit) || 0;
      const v = (r.total_price_vat != null && r.total_price_vat > 0) ? parseFloat(r.total_price_vat) : qty * price;
      g.total_value += v;
      if (!g.receive_date || (r.receive_date && r.receive_date > g.receive_date)) g.receive_date = r.receive_date;
    }
    return Array.from(m.values()).sort((a,b) => (a.receive_date||'').localeCompare(b.receive_date||''));
  })();

  const totalValue = bills.reduce((s,b) => s + b.total_value, 0);
  const totalLots  = bills.reduce((s,b) => s + b.items.length, 0);
  const dates = rows.map(r => r.receive_date).filter(Boolean).sort();
  const fromIso = meta.periodFrom || dates[0];
  const toIso   = meta.periodTo   || dates[dates.length - 1];

  const fmtDate = (iso) => {
    if (!iso) return '-';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return iso;
    return `${m[3]}/${m[2]}/${Number(m[1]) + 543}`;
  };
  const fmtBaht = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtQty  = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  const today   = fmtDate(todayIsoLocal());

  const billRows = bills.map((b,i) => `
    <tr>
      <td class="c">${i+1}</td>
      <td>${b.bill_number}</td>
      <td>${b.supplier}</td>
      <td class="c">${fmtDate(b.receive_date)}</td>
      <td class="c">${b.items.length}</td>
      <td class="r">${fmtBaht(b.total_value)}</td>
    </tr>`).join('');

  let runIdx = 0;
  const detailRows = bills.flatMap(b => b.items.map(r => {
    runIdx += 1;
    const qty = parseFloat(r.qty_received) || 0;
    const price = parseFloat(r.price_per_unit) || 0;
    const v = (r.total_price_vat != null && r.total_price_vat > 0) ? parseFloat(r.total_price_vat) : qty * price;
    return `<tr>
      <td class="c">${runIdx}</td>
      <td>${b.bill_number}</td>
      <td>${r.drug_code || '-'}</td>
      <td>${r.drug_name || '-'}</td>
      <td>${r.lot || '-'}</td>
      <td class="c">${r.exp || '-'}</td>
      <td class="r">${fmtQty(qty)}</td>
      <td>${r.drug_unit || '-'}</td>
      <td class="r">${fmtBaht(price)}</td>
      <td class="r">${fmtBaht(v)}</td>
    </tr>`;
  })).join('');

  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<title>${docTitle} ${batchId}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #1e293b; background: #fff; padding: 20px 28px 28px; }
  .h-row { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 8px; margin-bottom: 14px; }
  h1 { font-size: 20px; font-weight: 700; color: #1e293b; }
  .sub { font-size: 11px; color: #64748b; }
  .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 16px; margin-bottom: 16px;
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
  .meta-grid .field label { display:block; font-size: 10px; color: #94a3b8; font-weight: 600; margin-bottom: 2px; }
  .meta-grid .field span { font-size: 13px; font-weight: 700; color: #1e293b; }
  .meta-grid .field.total span { color: #047857; }
  .section-title { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;
    letter-spacing: .05em; margin: 12px 0 6px; border-left: 3px solid #047857; padding-left: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 14px; }
  th { background: #f1f5f9; color: #1e293b; font-weight: 700; padding: 6px 8px; text-align: left;
    border-bottom: 2px solid #000; border-right: 1px solid #cbd5e1; }
  th:last-child { border-right: none; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #f1f5f9; }
  td:last-child { border-right: none; }
  td.c { text-align: center; }
  td.r { text-align: right; font-variant-numeric: tabular-nums; }
  tr:nth-child(even) td { background: #fafbfc; }
  tfoot td { font-weight: 700; background: #ecfdf5 !important; border-top: 2px solid #047857; }
  .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 28px;
    page-break-inside: avoid; }
  .sig-box { border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px 16px; }
  .sig-box .sig-title { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;
    letter-spacing: .05em; margin-bottom: 6px; text-align: center; }
  .sig-name { font-size: 13px; color: #1e293b; text-align: center;
    border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; min-height: 22px; font-weight: 600; }
  .sig-line { margin-top: 36px; border-bottom: 1px solid #94a3b8; }
  .sig-label { font-size: 11px; color: #64748b; text-align: center; margin-top: 4px; }
  .sig-date { font-size: 11px; color: #64748b; margin-top: 8px; }
  .sig-date span { display: inline-block; border-bottom: 1px solid #94a3b8; min-width: 110px; margin-left: 6px; }
  .foot { font-size: 10px; color: #94a3b8; text-align: right; margin-top: 14px; }
  @media print {
    body { padding: 10mm 12mm; }
    button { display: none !important; }
    thead { display: table-header-group; }
  }
</style>
</head><body>
<button onclick="window.print()" style="position:fixed;top:14px;right:14px;background:#047857;color:#fff;border:none;
  padding:8px 18px;border-radius:8px;font-family:Sarabun,sans-serif;font-size:13px;cursor:pointer;font-weight:600;z-index:9999;">
  พิมพ์
</button>

<div class="h-row">
  <div>
    <h1>${HOSPITAL_NAME}</h1>
    <p class="sub">${docTitle} / ${docSubtitle}</p>
  </div>
  <div style="text-align:right;">
    <div style="font-size:14px;font-weight:700;color:#047857;">${batchLabel}: ${fmtDate(batchId)}</div>
    ${isAck ? '' : `<div class="sub">รหัสรอบ: ${batchId}</div>`}
  </div>
</div>

<div class="meta-grid">
  <div class="field"><label>${fromIso === toIso ? 'วันที่รับของ' : 'ช่วงวันรับของ'}</label><span>${fromIso === toIso ? fmtDate(fromIso) : `${fmtDate(fromIso)} – ${fmtDate(toIso)}`}</span></div>
  <div class="field"><label>จำนวนบิล</label><span>${bills.length} บิล</span></div>
  <div class="field"><label>จำนวนรายการ (lot)</label><span>${totalLots} รายการ</span></div>
  <div class="field total"><label>มูลค่ารวม</label><span>${fmtBaht(totalValue)} บาท</span></div>
</div>

<p class="section-title">รายการบิล (Bills Summary)</p>
<table>
  <thead><tr>
    <th style="width:6%;" class="c">ลำดับ</th>
    <th style="width:18%;">เลขบิล</th>
    <th>บริษัท</th>
    <th style="width:12%;" class="c">วันรับ</th>
    <th style="width:8%;" class="c">Lot</th>
    <th style="width:16%;" class="r">มูลค่า (บาท)</th>
  </tr></thead>
  <tbody>${billRows}</tbody>
  <tfoot><tr>
    <td colspan="4" class="r">รวม</td>
    <td class="c">${totalLots}</td>
    <td class="r">${fmtBaht(totalValue)}</td>
  </tr></tfoot>
</table>

<p class="section-title">รายการละเอียด (Item Detail)</p>
<table>
  <thead><tr>
    <th style="width:5%;" class="c">#</th>
    <th style="width:13%;">เลขบิล</th>
    <th style="width:9%;">รหัสยา</th>
    <th>ชื่อยา</th>
    <th style="width:10%;">Lot</th>
    <th style="width:8%;" class="c">Exp</th>
    <th style="width:7%;" class="r">จำนวน</th>
    <th style="width:7%;">หน่วย</th>
    <th style="width:9%;" class="r">ราคา/หน่วย</th>
    <th style="width:11%;" class="r">มูลค่า</th>
  </tr></thead>
  <tbody>${detailRows}</tbody>
  <tfoot><tr>
    <td colspan="9" class="r">รวมทั้งสิ้น</td>
    <td class="r">${fmtBaht(totalValue)}</td>
  </tr></tfoot>
</table>

<div class="sig-row">
  <div class="sig-box">
    <p class="sig-title">${sigLeftTitle}</p>
    <div class="sig-name">${isAck ? (meta.senderName || '') : ((meta.inspectorNames && meta.inspectorNames.length > 0) ? meta.inspectorNames.join(', ') : '')}</div>
    <div class="sig-line"></div>
    <p class="sig-label">${sigLeftLabel}</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
  <div class="sig-box">
    <p class="sig-title">${sigRightTitle}</p>
    <div class="sig-name">${isAck ? '' : (meta.senderName || '')}</div>
    <div class="sig-line"></div>
    <p class="sig-label">${sigRightLabel}</p>
    <p class="sig-date">วันที่ <span></span></p>
  </div>
</div>

<p class="foot">พิมพ์เมื่อ ${today}</p>
</body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) setTimeout(() => URL.revokeObjectURL(url), 30000);
  else     URL.revokeObjectURL(url);
}

// match บิลกับคำค้น — เลขบิล / บริษัท / ชื่อยา / รหัสยา / lot (ค้นในรายการยาของบิลด้วย)
// ใช้ร่วมกันทุกแท็บ (รอตรวจรับ/ส่งบัญชี + ประวัติ batch) เพื่อให้ค้นได้เหมือนกันทุกขั้น
function billMatchesQuery(bill, q) {
  if (!q) return true;
  if ((bill.bill_number || '').toLowerCase().includes(q)) return true;
  if ((bill.supplier || '').toLowerCase().includes(q)) return true;
  return (bill.items || []).some(it =>
    (it.drug_name || '').toLowerCase().includes(q) ||
    (it.drug_code || '').toLowerCase().includes(q) ||
    (it.lot || '').toLowerCase().includes(q)
  );
}

// วันที่ feature "บังคับรูปตรวจรับ" เริ่มใช้ (ISO) — บิลที่ตรวจรับก่อนวันนี้ไม่ flag badge "ไม่มีรูป"
// (บิลเก่าหลายร้อยใบ inspect_meta=null โดยธรรมชาติ — ไม่ใช่ความผิดพลาด)
const INSPECT_PHOTO_SINCE = '2026-06-27';

// รายการ checklist บังคับติ๊กก่อนยืนยันตรวจรับ (qty/exp/lot/doc) — ปิดช่องโหว่ "เซ็นโดยไม่ตรวจ"
const INSPECT_CHECKLIST = [
  { key: 'qty', label: 'จำนวนยาตรงกับบิล' },
  { key: 'exp', label: 'วันหมดอายุ (Exp) ตรงกับของจริง' },
  { key: 'lot', label: 'Lot ตรงกับของจริง' },
  { key: 'doc', label: 'เอกสาร/ใบกำกับครบถ้วน' },
];

// Modal บังคับ checklist + แนบรูป ก่อน Mark "ตรวจรับแล้ว"
// บังคับ: ติ๊กครบทุกข้อ + รูป >= 1 ถึงกดยืนยันได้ (แก้ปัญหา 1.2/1.3/1.7)
function InspectChecklistModal({ bills, defaultInspector, onConfirm, onClose, busy }) {
  const [checks, setChecks]       = useState({});
  const [inspector, setInspector] = useState(defaultInspector || '');
  const [images, setImages]       = useState([]); // [{ file, preview }]
  const [localErr, setLocalErr]   = useState('');
  const fileRef = useRef(null);

  const allChecked = INSPECT_CHECKLIST.every(c => checks[c.key]);
  const canConfirm = allChecked && images.length > 0 && !busy;

  async function handleAddFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const next = [];
    for (const file of files) {
      try { next.push({ file, preview: await readAsDataUrl(file) }); }
      catch { next.push({ file, preview: '' }); }
    }
    setImages(cur => [...cur, ...next]);
    if (fileRef.current) fileRef.current.value = '';
  }
  const removeImage = (idx) => setImages(cur => cur.filter((_, i) => i !== idx));

  function handleConfirm() {
    if (!allChecked) { setLocalErr('ต้องติ๊กยืนยันให้ครบทุกข้อก่อน'); return; }
    if (images.length === 0) { setLocalErr('ต้องแนบรูปการตรวจรับอย่างน้อย 1 รูป'); return; }
    setLocalErr('');
    onConfirm({ checklist: { ...checks }, inspector: inspector.trim(), images });
  }

  const billCount = bills.length;
  const itemCount = bills.reduce((s, b) => s + (b.item_count || 0), 0);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b bg-white dark:bg-slate-900 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-orange-500" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">ยืนยันการตรวจรับยา</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="rounded-lg bg-orange-50 dark:bg-orange-950/40 px-3 py-2 text-xs text-orange-700 dark:text-orange-300">
            กำลังตรวจรับ <b>{billCount} บิล</b> ({itemCount} รายการ) — ติ๊กยืนยันครบทุกข้อ + แนบรูป ถึงจะบันทึกได้
          </p>

          {/* Checklist */}
          <div className="space-y-2">
            {INSPECT_CHECKLIST.map(c => (
              <label key={c.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={!!checks[c.key]}
                  onChange={e => setChecks(cur => ({ ...cur, [c.key]: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-orange-500 focus:ring-orange-400"
                />
                <span className="text-sm text-slate-700 dark:text-slate-200">{c.label}</span>
              </label>
            ))}
          </div>

          {/* ชื่อกรรมการตรวจรับ */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">กรรมการตรวจรับ (ไม่กรอกก็ได้ — เซ็นเอง)</label>
            <input
              value={inspector}
              onChange={e => setInspector(e.target.value)}
              placeholder="ชื่อกรรมการตรวจรับ"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
            />
          </div>

          {/* รูปตรวจรับ */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              รูปการตรวจรับ <span className="text-red-500">*</span> (อย่างน้อย 1 รูป)
            </label>
            <div className="flex flex-wrap gap-2">
              {images.map((img, idx) => (
                <div key={idx} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                  {img.preview
                    ? <img src={img.preview} alt="" className="h-full w-full object-cover" />
                    : <div className="flex h-full w-full items-center justify-center bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-400 dark:text-slate-500">ไฟล์</div>}
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"
                  ><Trash2 size={12} /></button>
                </div>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:border-orange-400 hover:text-orange-500"
              >
                <ImagePlus size={20} />
                <span className="text-[10px]">เพิ่มรูป</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handleAddFiles}
                className="hidden"
              />
            </div>
          </div>

          {localErr && (
            <div className="flex items-center gap-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-600">
              <AlertCircle size={14} /> {localErr}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-white dark:bg-slate-900 px-5 py-3">
          <button onClick={onClose} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50">ยกเลิก</button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300"
          >{busy ? 'กำลังบันทึก…' : 'ยืนยันตรวจรับ'}</button>
        </div>
      </div>
    </div>
  );
}

function ApWorkflow({ auth, onBack }) {
  const [subTab, setSubTab]   = useState('pending'); // 'pending' | 'sent' | 'history'
  const [loading, setLoading] = useState(true);
  const [pendingBills, setPendingBills] = useState([]); // ap_stage IN (null, inspected)
  const [sentBills, setSentBills]       = useState([]); // ap_stage = sent_batch
  const [batches, setBatches]           = useState([]); // distinct ap_batch_id
  const [selected, setSelected]         = useState(new Set()); // bill_numbers
  // ไม่กรอกชื่อ จนท.จัดซื้อ ในระบบแล้ว — เซ็นด้วยมือบนใบที่พิมพ์แทน (ค่าว่าง = ช่องเซ็นเว้นว่าง)
  // กรรมการตรวจรับ → กรอกใน InspectChecklistModal ตอน Mark ตรวจรับ
  const purchaser = '';
  const [accountant, setAccountant]     = useState('');
  const [returnDate]                    = useState(() => todayIsoLocal()); // วันที่ส่งคืนจัดซื้อ = วันนี้ (เก็บใน inspected_at ตอน Mark ตรวจรับ)
  useEffect(() => {
    localStorage.removeItem('ap_inspector');
    localStorage.removeItem('ap_purchaser');
    localStorage.removeItem('ap_accountant');
  }, []);
  const [busy, setBusy]                 = useState(false);
  const [msg, setMsg]                   = useState('');
  const [error, setError]               = useState('');
  const [search, setSearch]             = useState('');
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');
  const [sortKey, setSortKey]           = useState('receive_date'); // 'receive_date' | 'days' | 'bill_number' | 'value' | 'drug_count'
  const [sortDir, setSortDir]           = useState('desc');         // 'asc' | 'desc'
  const [stageFilter, setStageFilter]   = useState('all');          // 'all' | 'null' | 'inspected'
  const [expandedBill, setExpandedBill] = useState(null);
  const toggleExpand = (bn) => setExpandedBill(cur => cur === bn ? null : bn);
  const [inspectModalBills, setInspectModalBills] = useState(null); // บิลที่รอยืนยันตรวจรับ (เปิด modal); null = ปิด

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [pendingRows, sentRows, batchList] = await Promise.all([
        fetchApBills({ stage: 'pending_all' }),
        fetchApBills({ stage: 'sent_batch' }),
        fetchApBatches(),
      ]);
      // กรอง: บิลที่ ap_stage=NULL ต้องมี receive_status = 'รอตรวจรับ' เท่านั้น
      // (บิลที่ inspected/sent_batch แล้ว ไม่ต้องเช็ค receive_status — อยู่ใน flow แล้ว)
      const pendingFiltered = pendingRows.filter(r => {
        if (!r.bill_number || r.bill_number === '-') return false;
        if (r.ap_stage) return true; // inspected / sent_batch ผ่านได้เลย
        const status = String(r.receive_status || '').trim();
        return status === 'รอตรวจรับ';
      });
      setPendingBills(groupRowsByBill(pendingFiltered));
      setSentBills(groupRowsByBill(sentRows.filter(r => r.bill_number && r.bill_number !== '-')));
      setBatches(batchList);
    } catch (e) {
      const msg = e.message || 'โหลดข้อมูลไม่สำเร็จ';
      if (msg.includes('acknowledged_at') && msg.includes('does not exist')) {
        setError('⚠️ ยังไม่ได้รัน migration!\nไป Supabase Dashboard → SQL Editor\nrun ไฟล์: ap_acknowledge_migration.sql\nแล้ว refresh หน้านี้');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelected(new Set()); }, [subTab]);
  // auto-dismiss แจ้งเตือน — success 3 วินาที / error 5 วินาที / migration alert 15 วินาที
  useEffect(() => {
    if (!msg && !error) return;
    const longMigrate = error && error.includes('migration');
    const delay = longMigrate ? 15000 : (error ? 5000 : 3000);
    const t = setTimeout(() => { setMsg(''); setError(''); }, delay);
    return () => clearTimeout(t);
  }, [msg, error]);

  const applyFilters = (list, baseDateKey, applyStage = false) => {
    const q = search.trim().toLowerCase();
    const from = dateFrom || null;
    const to   = dateTo   || null;
    let arr = list.filter(b => {
      if (!billMatchesQuery(b, q)) return false;
      const d = b.receive_date || '';
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (applyStage && stageFilter !== 'all') {
        const s = b.ap_stage;
        if (stageFilter === 'unack')         { if (s || b.acknowledged_at) return false; }
        else if (stageFilter === 'acked')    { if (s || !b.acknowledged_at) return false; }
        else if (stageFilter === 'inspected'){ if (s !== 'inspected') return false; }
      }
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    arr = [...arr].sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'bill_number': av = a.bill_number || ''; bv = b.bill_number || ''; return av.localeCompare(bv) * dir;
        case 'value':       av = a.total_value || 0;  bv = b.total_value || 0;  return (av - bv) * dir;
        case 'drug_count':  av = a.drug_count || 0;   bv = b.drug_count || 0;   return (av - bv) * dir;
        case 'item_count':  av = a.item_count || 0;   bv = b.item_count || 0;   return (av - bv) * dir;
        case 'days': {
          const baseA = (baseDateKey === 'sent' ? a.ap_sent_at : a.receive_date) || '';
          const baseB = (baseDateKey === 'sent' ? b.ap_sent_at : b.receive_date) || '';
          return baseA.localeCompare(baseB) * -dir; // เก่ากว่า = ค้างนานกว่า → invert
        }
        default: av = a.receive_date || ''; bv = b.receive_date || ''; return av.localeCompare(bv) * dir;
      }
    });
    return arr;
  };
  const filteredPending = applyFilters(pendingBills, 'receive', true);
  const filteredSent    = applyFilters(sentBills, 'sent');
  // กรอง batch ด้วย dateFrom/dateTo (batch_id = YYYY-MM-DD = วันที่ส่ง)
  const filteredBatches = batches.filter(b => {
    if (dateFrom && b.batch_id < dateFrom) return false;
    if (dateTo   && b.batch_id > dateTo)   return false;
    return true;
  });

  // นับจำนวนตามแต่ละ stage (ก่อน apply stageFilter เพื่อให้ปุ่มแสดงเลขถูก)
  const stageCount = pendingBills.reduce((acc, b) => {
    acc.all += 1;
    if (b.ap_stage === 'inspected') acc.inspected += 1;
    else if (!b.ap_stage && !b.acknowledged_at) acc.unack += 1;
    else if (!b.ap_stage && b.acknowledged_at)  acc.acked += 1;
    return acc;
  }, { all: 0, unack: 0, acked: 0, inspected: 0 });

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };
  const sortIndicator = (key) => sortKey !== key ? '' : (sortDir === 'asc' ? ' ▲' : ' ▼');

  const toggleBill = (bill) => {
    const next = new Set(selected);
    if (next.has(bill)) next.delete(bill); else next.add(bill);
    setSelected(next);
  };
  const toggleAll = (list) => {
    if (selected.size === list.length) setSelected(new Set());
    else setSelected(new Set(list.map(b => b._key)));
  };

  // ---- Actions ----
  async function handleMarkInspected() {
    if (selected.size === 0) { setError('เลือกบิลที่ตรวจรับเสร็จก่อน'); return; }
    // ต้องเป็นบิลที่ "จัดซื้อรับเอกสารแล้ว" (ap_stage=NULL + acknowledged_at NOT NULL) เท่านั้น
    const ackedSelected = filteredPending.filter(b => !b.ap_stage && b.acknowledged_at && selected.has(b._key));
    const unackSelected = filteredPending.filter(b => !b.ap_stage && !b.acknowledged_at && selected.has(b._key));
    if (ackedSelected.length === 0) {
      if (unackSelected.length > 0) {
        setError(`บิลที่เลือก ${unackSelected.length} บิลยังเป็น "รอจัดซื้อรับเอกสาร"\nต้องกด "จัดซื้อรับเอกสาร" ก่อน → แล้วค่อยยืนยันตรวจรับ`);
      } else {
        setError('ไม่มีบิลที่จัดซื้อรับเอกสารแล้วในการเลือก');
      }
      return;
    }
    // เปิด modal บังคับ checklist + แนบรูป ก่อนบันทึกจริง (กัน "เซ็นโดยไม่ตรวจ")
    setError('');
    setInspectModalBills(ackedSelected);
  }

  // บันทึกจริงหลังผ่าน checklist modal — upload รูป → markBillsInspected พร้อม inspect_meta
  async function doMarkInspected({ checklist, inspector: inspectorName, images }) {
    const ackedSelected = inspectModalBills || [];
    if (ackedSelected.length === 0) { setInspectModalBills(null); return; }
    setBusy(true); setError(''); setMsg('');
    try {
      // upload รูปทุกใบ → เก็บ URL
      const ts = Date.now();
      const imageUrls = [];
      for (let i = 0; i < images.length; i++) {
        const blob = await compressImageFile(images[i].file);
        const url = await uploadInvoiceImage(blob, `inspect_${ts}_${i}.jpg`);
        imageUrls.push(url);
      }
      const inspectMeta = {
        images: imageUrls,
        checklist,
        inspector: inspectorName || null,
        at: new Date().toISOString(),
      };
      const billNumbers = ackedSelected.map(b => b.bill_number);
      const rowIds = ackedSelected.flatMap(b => b.item_ids);
      const n = await markBillsInspected(rowIds, billNumbers, inspectorName, auth, returnDate, inspectMeta);
      setMsg(`ยืนยันตรวจรับ ${ackedSelected.length} บิล (${n} รายการ) · แนบรูป ${imageUrls.length} รูป · ส่งคืนวันที่ ${returnDate}`);
      setSelected(new Set());
      setInspectModalBills(null);
      await load();
    } catch (e) { setError(e.message || 'บันทึกไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  // คลังพิมพ์ใบส่งจัดซื้อ — เลือกบิลรอจัดซื้อรับเอกสาร (ap_stage=NULL + acknowledged_at=NULL) แล้วปริ้นใบให้จัดซื้อเซ็น
  // ไม่เปลี่ยน stage — เป็นแค่ paperwork helper
  async function handleExportAck() {
    const unackBills = filteredPending.filter(b => !b.ap_stage && !b.acknowledged_at && selected.has(b._key));
    if (unackBills.length === 0) { setError('เลือกบิล "รอจัดซื้อรับเอกสาร" ก่อน'); return; }
    setBusy(true); setError(''); setMsg('');
    try {
      const billNumbers = unackBills.map(b => b.bill_number);
      const rowsToPrint = unackBills.flatMap(b => b.items);
      const dates = rowsToPrint.map(r => r.receive_date).filter(Boolean).sort();
      const today = todayIsoLocal();
      printApBatch(rowsToPrint, today, {
        kind: 'ack',
        periodFrom: dates[0], periodTo: dates[dates.length - 1],
        senderName: resolveAuditUserName(auth) !== '-' ? resolveAuditUserName(auth) : '',
      });
      await insertAuditLog({
        action: 'print_ack_batch', table_name: 'receive_logs',
        user_name: resolveAuditUserName(auth), department: auth?.department || '-',
        record_count: rowsToPrint.length,
        details: { date: today, bill_count: billNumbers.length },
      });
      setMsg(`พิมพ์ใบส่งจัดซื้อ ${billNumbers.length} บิล (${rowsToPrint.length} รายการ)`);
    } catch (e) { setError(e.message || 'พิมพ์ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  async function handleExportAndSend() {
    const inspectedBills = filteredPending.filter(b => b.ap_stage === 'inspected' && selected.has(b._key));
    if (inspectedBills.length === 0) { setError('เลือกเฉพาะบิลที่ตรวจรับแล้ว (สถานะ "รอนำส่งบัญชี") ก่อน'); return; }
    setBusy(true); setError(''); setMsg('');
    try {
      const batchId = todayIsoLocal();
      const billNumbers = inspectedBills.map(b => b.bill_number);
      const rowIds = inspectedBills.flatMap(b => b.item_ids);
      const rowsToExport = inspectedBills.flatMap(b => b.items);
      const dates = rowsToExport.map(r => r.receive_date).filter(Boolean).sort();
      const inspectorNames = Array.from(new Set(inspectedBills.map(b => b.inspected_by).filter(Boolean)));
      const purchaserName = purchaser.trim();
      printApBatch(rowsToExport, batchId, {
        periodFrom: dates[0], periodTo: dates[dates.length - 1],
        senderName: purchaserName,   // ว่างก็ได้ → ช่องเซ็นในใบนำส่งจะเว้นว่าง
        inspectorNames,              // [] ถ้าไม่มีใครกรอก → ช่องกรรมการจะเว้นว่าง
      });
      await markBillsSentBatch(rowIds, billNumbers, batchId, auth, purchaserName || null);
      await insertAuditLog({
        action: 'print_ap_batch', table_name: 'receive_logs',
        user_name: resolveAuditUserName(auth), department: auth?.department || '-',
        record_count: rowsToExport.length,
        details: { batch_id: batchId, bill_count: billNumbers.length, purchaser: purchaser.trim() },
      });
      setMsg(`พิมพ์ใบนำส่ง + บันทึก ${billNumbers.length} บิล · batch ${batchId}`);
      setSelected(new Set());
      await load();
    } catch (e) { setError(e.message || 'พิมพ์ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  // billsToPost = array ของ bill object (จากปุ่ม per-batch) — ถ้าไม่ส่ง → ใช้ selected จาก filteredSent
  async function handleMarkPosted(billsToPost) {
    const list = (billsToPost && billsToPost.length > 0)
      ? billsToPost
      : filteredSent.filter(b => selected.has(b._key));
    if (list.length === 0) { setError('เลือกบิลก่อน'); return; }
    const name = accountant.trim();
    const label = name ? `บัญชี (${name})` : 'บัญชี';
    if (!confirm(`ยืนยันว่า${label} post แล้ว ${list.length} บิล?`)) return;
    setBusy(true); setError(''); setMsg('');
    try {
      // ถ้าไม่กรอกชื่อ → ส่ง null → ap_posted_by จะเป็น null (เว้นช่องเซ็นเอง)
      const n = await markBillsPosted(list.flatMap(b => b.item_ids), list.map(b => b.bill_number), auth, name || null);
      setMsg(`ยืนยันบัญชี post แล้ว ${list.length} บิล (${n} รายการ)`);
      setSelected(new Set());
      await load();
    } catch (e) { setError(e.message || 'บันทึกไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  // bills = array ของ bill object
  async function handleUnpost(bills) {
    if (!confirm(`ยกเลิกการ post กลับเป็น "รอ post" ${bills.length} บิล?`)) return;
    setBusy(true); setError('');
    try { await unmarkBillsPosted(bills.flatMap(b => b.item_ids), bills.map(b => b.bill_number), auth); await load(); setMsg(`ยกเลิก post ${bills.length} บิล`); }
    catch (e) { setError(e.message || 'ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  // จัดซื้อกด "รับบิลแล้ว" — รับ single bill (object) หรือ bulk จาก selected
  async function handleAcknowledge(singleBill) {
    let bills;
    if (singleBill) {
      bills = [singleBill];
    } else {
      bills = filteredPending.filter(b => !b.ap_stage && !b.acknowledged_at && selected.has(b._key));
      if (bills.length === 0) { setError('เลือกบิลที่ยังไม่ ack (สถานะ "รอจัดซื้อรับเอกสาร") ก่อน'); return; }
    }
    const rowIds = bills.flatMap(b => b.item_ids);
    const billNumbers = bills.map(b => b.bill_number);
    setBusy(true); setError(''); setMsg('');
    try {
      const n = await markBillsAcknowledged(rowIds, billNumbers, purchaser.trim() || null, auth);
      setMsg(`บันทึก "จัดซื้อรับเอกสารแล้ว" ${bills.length} บิล (${n} รายการ)`);
      if (!singleBill) setSelected(new Set());
      await load();
    } catch (e) {
      const msg = e.message || 'บันทึกไม่สำเร็จ';
      if (msg.includes('acknowledged_at') && msg.includes('does not exist')) {
        setError('⚠️ ยังไม่ได้รัน migration!\nไป Supabase Dashboard → SQL Editor\nrun ไฟล์: ap_acknowledge_migration.sql');
      } else {
        setError(msg);
      }
    }
    finally { setBusy(false); }
  }

  // ย้อน acknowledge
  async function handleUnacknowledge(bill) {
    if (!confirm(`ย้อนบิล ${bill.bill_number} กลับเป็น "รอจัดซื้อรับเอกสาร"?`)) return;
    setBusy(true); setError('');
    try { await unmarkBillsAcknowledged(bill.item_ids, [bill.bill_number], auth); await load(); setMsg(`ย้อน ack ${bill.bill_number}`); }
    catch (e) { setError(e.message || 'ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  // ย้อนกลับหลายบิลพร้อมกัน — group ตาม stage แล้วเรียก unmark ที่เหมาะสม
  async function handleBulkUndo() {
    const selectedBills = filteredPending.filter(b => selected.has(b._key));
    if (selectedBills.length === 0) { setError('เลือกบิลก่อน'); return; }

    const unackBills    = selectedBills.filter(b => !b.ap_stage && b.acknowledged_at);
    const uninspectBills = selectedBills.filter(b => b.ap_stage === 'inspected');

    if (unackBills.length === 0 && uninspectBills.length === 0) {
      setError('ไม่มีบิลที่ย้อนได้ในการเลือก');
      return;
    }
    const lines = [];
    if (uninspectBills.length) lines.push(`• ย้อน "ตรวจรับแล้ว" → "จัดซื้อรับเอกสารแล้ว": ${uninspectBills.length} บิล`);
    if (unackBills.length)     lines.push(`• ย้อน "จัดซื้อรับเอกสารแล้ว" → "รอจัดซื้อรับเอกสาร": ${unackBills.length} บิล`);
    if (!confirm(`ย้อนกลับ ${unackBills.length + uninspectBills.length} บิล?\n${lines.join('\n')}`)) return;

    setBusy(true); setError(''); setMsg('');
    try {
      let n = 0;
      // เรียงลำดับสำคัญ — inspect ย้อนก่อน (กรณีบิลเดียวกันถูกเลือกซ้ำสาย)
      if (uninspectBills.length > 0) n += await unmarkBillsInspected(uninspectBills.flatMap(b => b.item_ids), uninspectBills.map(b => b.bill_number), auth);
      if (unackBills.length > 0)    n += await unmarkBillsAcknowledged(unackBills.flatMap(b => b.item_ids), unackBills.map(b => b.bill_number), auth);
      setMsg(`ย้อนกลับ ${selectedBills.length} บิล สำเร็จ (${n} รายการ)`);
      setSelected(new Set());
      await load();
    } catch (e) { setError(e.message || 'ย้อนไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  // ย้อน inspected → null (กลับเป็น "รอตรวจรับ")
  async function handleUninspect(bill) {
    if (!confirm(`ย้อนบิล ${bill.bill_number} กลับเป็น "รอตรวจรับ"?`)) return;
    setBusy(true); setError('');
    try { await unmarkBillsInspected(bill.item_ids, [bill.bill_number], auth); await load(); setMsg(`ย้อน ${bill.bill_number} → รอตรวจรับ`); }
    catch (e) { setError(e.message || 'ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  // ย้อน sent_batch → inspected (ออกจาก batch)
  async function handleUnsendBatch(bill) {
    if (!confirm(`ย้อนบิล ${bill.bill_number} ออกจาก batch กลับเป็น "รอนำส่งบัญชี"?`)) return;
    setBusy(true); setError('');
    try { await unmarkBillsSentBatch(bill.item_ids, [bill.bill_number], auth); await load(); setMsg(`ย้อน ${bill.bill_number} → รอนำส่งบัญชี`); }
    catch (e) { setError(e.message || 'ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  // Reset ทั้ง batch — ทุกบิลกลับเป็น inspected, batch หาย
  async function handleResetBatch(batch) {
    if (!confirm(`Reset batch ${batch.batch_id}?\nทุกบิล (${batch.bill_count} บิล) จะกลับเป็น "รอนำส่งบัญชี"\nbatch นี้จะหายจากประวัติ`)) return;
    setBusy(true); setError('');
    try {
      const n = await resetApBatch(batch.batch_id, auth);
      await load();
      setMsg(`Reset batch ${batch.batch_id} เรียบร้อย (${n} รายการกลับสู่ "รอนำส่งบัญชี")`);
    } catch (e) { setError(e.message || 'ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  async function handleReExport(batch) {
    setBusy(true); setError(''); setMsg('');
    try {
      const all = await fetchApBills({ batchId: batch.batch_id });
      if (all.length === 0) { setError('ไม่พบรายการใน batch'); return; }
      const dates = all.map(r => r.receive_date).filter(Boolean).sort();
      const inspectorNames = Array.from(new Set(all.map(r => r.inspected_by).filter(Boolean)));
      printApBatch(all, batch.batch_id, {
        periodFrom: dates[0], periodTo: dates[dates.length - 1],
        senderName: batch.sent_by || purchaser || auth?.name || '',
        inspectorNames,
      });
      setMsg(`พิมพ์ใบนำส่งซ้ำ batch ${batch.batch_id}`);
    } catch (e) { setError(e.message || 'พิมพ์ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  // ---- UI ----
  const tabBtn = (key, label, count, icon) => (
    <button key={key} onClick={() => setSubTab(key)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${subTab === key ? 'bg-emerald-600 text-white shadow' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 border border-slate-200 dark:border-slate-700'}`}>
      {icon}{label} <span className={`ml-1 px-1.5 py-0.5 rounded text-xs ${subTab === key ? 'bg-white dark:bg-slate-900/20' : 'bg-slate-100 dark:bg-slate-800'}`}>{count}</span>
    </button>
  );

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 mb-4">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-2">
          <Send size={20} className="text-emerald-600" /> ส่งบัญชีรายอาทิตย์ (AP Workflow)
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">ตรวจรับ → ส่งบัญชี (export Excel batch) → ยืนยันบัญชี post แล้ว — track ทุก stage มี audit trail</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {tabBtn('pending', 'รอนำส่งบัญชี', filteredPending.length, <ClipboardList size={16}/>)}
        {tabBtn('sent',    'นำส่งบัญชีแล้ว', filteredSent.length, <FileCheck2 size={16}/>)}
        {tabBtn('history', 'ประวัติการตั้งหนี้',  batches.length,   <History size={16}/>)}
      </div>

      {(msg || error) && (
        <ToastPopup type={error ? 'error' : 'success'} message={error || msg}
          onClose={() => { setMsg(''); setError(''); }}/>
      )}

      {inspectModalBills && (
        <InspectChecklistModal
          bills={inspectModalBills}
          defaultInspector=""
          busy={busy}
          onConfirm={doMarkInspected}
          onClose={() => { if (!busy) setInspectModalBills(null); }}
        />
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search size={16} className="text-slate-400 dark:text-slate-500"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาเลขบิล / ชื่อยา / บริษัท"
              className="flex-1 outline-none text-sm" />
            {search && <button onClick={() => setSearch('')}><X size={14} className="text-slate-400 dark:text-slate-500"/></button>}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <CalendarDays size={14} className="text-slate-400 dark:text-slate-500"/>
            <span>{subTab === 'history' ? 'วันที่ส่ง:' : 'วันรับ:'}</span>
            <IsoDateInput value={dateFrom} onChange={setDateFrom} className="w-28" />
            <span>ถึง</span>
            <IsoDateInput value={dateTo} onChange={setDateTo} className="w-28" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"><X size={14}/></button>
            )}
          </div>
        </div>
      </div>

      {loading ? <div className="text-center text-slate-500 dark:text-slate-400 py-8">กำลังโหลด...</div> : (
        <>
          {subTab === 'pending' && (
            <PendingTab bills={filteredPending} selected={selected} toggleBill={toggleBill} toggleAll={toggleAll}
              stageFilter={stageFilter} setStageFilter={setStageFilter} stageCount={stageCount}
              busy={busy}
              onMarkInspected={handleMarkInspected} onExportSend={handleExportAndSend}
              onExportAck={handleExportAck}
              onUninspect={handleUninspect}
              onAcknowledge={handleAcknowledge} onUnacknowledge={handleUnacknowledge}
              onBulkUndo={handleBulkUndo}
              toggleSort={toggleSort} sortKey={sortKey} sortDir={sortDir}
              expandedBill={expandedBill} toggleExpand={toggleExpand} />
          )}
          {subTab === 'sent' && (
            <SentTab bills={filteredSent} selected={selected} toggleBill={toggleBill} toggleAll={toggleAll}
              accountant={accountant} setAccountant={setAccountant}
              busy={busy} onMarkPosted={handleMarkPosted} onUnsendBatch={handleUnsendBatch}
              toggleSort={toggleSort} sortKey={sortKey} sortDir={sortDir}
              expandedBill={expandedBill} toggleExpand={toggleExpand} />
          )}
          {subTab === 'history' && (
            <HistoryTab batches={filteredBatches} busy={busy} search={search}
              onReExport={handleReExport} onUnpost={handleUnpost} onResetBatch={handleResetBatch} />
          )}
        </>
      )}
    </div>
  );
}

// แสดงรายละเอียด lot ทั้งหมดในบิล — ใช้ทั้ง PendingTab + SentTab + HistoryTab
// แสดงหลักฐานการตรวจรับ (checklist + ชื่อกรรมการ + รูป) ที่บันทึกตอน "ยืนยันตรวจรับ"
// อ่านจาก bill.inspect_meta (jsonb { images, checklist, inspector, at }) — ดู docs/features/ap-workflow.md
function InspectEvidence({ bill }) {
  const meta = bill.inspect_meta;
  const [lightbox, setLightbox] = useState(null); // url ของรูปที่กำลังขยาย หรือ null
  if (!meta || (!meta.images?.length && !meta.checklist && !bill.inspected_by)) return null;
  const images = meta.images || [];
  const checklist = meta.checklist || {};
  const inspector = meta.inspector || bill.inspected_by || '-';
  const at = meta.at || bill.inspected_at;
  return (
    <div className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
        <FileCheck2 size={14}/> หลักฐานการตรวจรับ
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
        <span><span className="text-slate-400 dark:text-slate-500">กรรมการตรวจรับ:</span> <span className="font-medium text-slate-800 dark:text-slate-100">{inspector}</span></span>
        {at && <span className="inline-flex items-center gap-1"><CalendarDays size={12} className="text-slate-400 dark:text-slate-500"/> {fmtDateThaiShort(at)}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {INSPECT_CHECKLIST.map(c => (
          <span key={c.key} className={`inline-flex items-center gap-1 text-[11px] ${checklist[c.key] ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400 dark:text-slate-500'}`}>
            {checklist[c.key]
              ? <CheckCircle2 size={12} className="text-emerald-600"/>
              : <AlertCircle size={12} className="text-slate-300 dark:text-slate-500"/>}
            {c.label}
          </span>
        ))}
      </div>
      {images.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {images.map((url, i) => (
            <button key={i} type="button" onClick={() => setLightbox(url)}
              className="h-16 w-16 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-400 transition-colors">
              <img src={url} alt={`รูปตรวจรับ ${i+1}`} className="h-full w-full object-cover" loading="lazy"/>
            </button>
          ))}
        </div>
      )}
      {lightbox && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 p-4" onClick={() => setLightbox(null)}>
          <button type="button" className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setLightbox(null)}>
            <X size={28}/>
          </button>
          <img src={lightbox} alt="รูปตรวจรับ" className="max-h-full max-w-full rounded-lg object-contain" onClick={e => e.stopPropagation()}/>
        </div>
      )}
    </div>
  );
}

function BillItemsDetail({ bill }) {
  const items = bill.items || [];
  const totalQty = items.reduce((s, r) => s + (parseFloat(r.qty_received) || 0), 0);
  return (
    <div className="bg-slate-50 dark:bg-slate-800/70 border-t-2 border-emerald-200 dark:border-emerald-900/60 p-3">
      <div className="mb-2 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-3 flex-wrap">
        <span><span className="text-slate-400 dark:text-slate-500">บิล:</span> <span className="font-semibold text-slate-800 dark:text-slate-100">{bill.bill_number}</span></span>
        <span><span className="text-slate-400 dark:text-slate-500">บริษัท:</span> <span className="font-medium">{bill.supplier}</span></span>
        <span><span className="text-slate-400 dark:text-slate-500">วันรับ:</span> {fmtDateThaiShort(bill.receive_date)}</span>
        <span><span className="text-slate-400 dark:text-slate-500">รายการยา:</span> <span className="font-semibold">{bill.drug_count}</span></span>
        <span><span className="text-slate-400 dark:text-slate-500">Lot รวม:</span> <span className="font-semibold">{bill.item_count}</span></span>
        <span className="ml-auto"><span className="text-slate-400 dark:text-slate-500">มูลค่ารวม:</span> <span className="font-bold text-emerald-700 dark:text-emerald-300">{fmtBahtDisplay(bill.total_value)} บาท</span></span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <table className="w-full text-xs">
          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            <tr>
              <th className="p-2 text-center w-8">#</th>
              <th className="p-2 text-left">รหัสยา</th>
              <th className="p-2 text-left">ชื่อยา</th>
              <th className="p-2 text-center">ชนิด</th>
              <th className="p-2 text-left">Lot</th>
              <th className="p-2 text-center">Exp</th>
              <th className="p-2 text-right">จำนวน</th>
              <th className="p-2 text-center">หน่วย</th>
              <th className="p-2 text-right">ราคา/หน่วย</th>
              <th className="p-2 text-right">มูลค่า</th>
              <th className="p-2 text-center">สถานะตรวจรับ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => {
              const qty = parseFloat(r.qty_received) || 0;
              const price = parseFloat(r.price_per_unit) || 0;
              const v = (r.total_price_vat != null && r.total_price_vat > 0) ? parseFloat(r.total_price_vat) : qty * price;
              return (
                <tr key={r.id || i} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="p-2 text-center text-slate-400 dark:text-slate-500">{i+1}</td>
                  <td className="p-2 font-mono text-slate-700 dark:text-slate-200">{r.drug_code || '-'}</td>
                  <td className="p-2 font-medium text-slate-800 dark:text-slate-100">{r.drug_name || '-'}</td>
                  <td className="p-2 text-center"><DrugTypeBadge type={r.drug_type}/></td>
                  <td className="p-2 font-mono">{r.lot || '-'}</td>
                  <td className="p-2 text-center text-slate-600 dark:text-slate-300">{r.exp || '-'}</td>
                  <td className="p-2 text-right font-mono">{fmtBahtDisplay(qty)}</td>
                  <td className="p-2 text-center text-slate-500 dark:text-slate-400">{r.drug_unit || '-'}</td>
                  <td className="p-2 text-right font-mono text-slate-600 dark:text-slate-300">{fmtBahtDisplay(price)}</td>
                  <td className="p-2 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-300">{fmtBahtDisplay(v)}</td>
                  <td className="p-2 text-center text-slate-500 dark:text-slate-400 text-[11px]">{r.receive_status || '-'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-emerald-50 dark:bg-emerald-950/40">
              <td colSpan={6} className="p-2 text-right font-semibold text-slate-700 dark:text-slate-200">รวม</td>
              <td className="p-2 text-right font-mono font-bold">{fmtBahtDisplay(totalQty)}</td>
              <td/><td/>
              <td className="p-2 text-right font-mono font-bold text-emerald-700 dark:text-emerald-300">{fmtBahtDisplay(bill.total_value)}</td>
              <td/>
            </tr>
          </tfoot>
        </table>
      </div>
      <InspectEvidence bill={bill}/>
    </div>
  );
}

// Card สำหรับบิล 1 ใบ (ใช้ใน PendingTab/SentTab/BatchBillsList)
function BillCard({ bill, selected, onToggleSelect, isExpanded, onToggleExpand, busy, onUndo, undoTitle, sentTimestamp = false, onAcknowledge, onUnacknowledge }) {
  const stage = bill.ap_stage || null;
  const baseTimestamp = sentTimestamp ? bill.ap_sent_at : bill.receive_date;
  const days = daysSince(baseTimestamp);
  const overdue = days > 7;
  const isAcked = !stage && !!bill.acknowledged_at;
  // บิลที่ผ่านการตรวจรับแล้ว (inspected ขึ้นไป) แต่ไม่มีรูปแนบ → flag ช่องโหว่ "เซ็นโดยไม่ตรวจ"
  // เฉพาะบิลที่ตรวจรับตั้งแต่ feature live (INSPECT_PHOTO_SINCE) — บิลเก่าก่อนหน้านั้นไม่ flag (ไม่ใช่ noise)
  const isInspectedStage = stage === 'inspected' || stage === 'sent_batch' || stage === 'posted';
  const inspectedSinceFeature = bill.inspected_at && bill.inspected_at.slice(0, 10) >= INSPECT_PHOTO_SINCE;
  const missingInspectPhoto = isInspectedStage && inspectedSinceFeature && !(bill.inspect_meta?.images?.length > 0);
  return (
    <div className={`border-b border-slate-100 dark:border-slate-800 last:border-b-0 ${isExpanded ? 'bg-emerald-50 dark:bg-emerald-950/40' : ''}`}>
      <div className={`p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${selected ? 'bg-emerald-50 dark:bg-emerald-950/40' : ''}`}
           onClick={() => onToggleExpand(bill._key)}>
        <div className="flex items-start gap-2.5">
          {onToggleSelect && (
            <input type="checkbox" className="mt-1.5 shrink-0" onClick={e => e.stopPropagation()}
              checked={selected} onChange={() => onToggleSelect(bill._key)}/>
          )}
          <div className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500">
            {isExpanded ? <ChevronDown size={16} className="text-emerald-600"/> : <ChevronUp size={16} className="rotate-180"/>}
          </div>
          <div className="flex-1 min-w-0">
            {/* row 1: เลขบิล + รายการยา */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">{bill.bill_number}</span>
                <StageBadge stage={stage} acknowledged={bill.acknowledged_at}/>
                {missingInspectPhoto && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950/60 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-300"
                    title="ตรวจรับแล้วแต่ไม่มีรูปหลักฐาน">
                    <AlertCircle size={12}/> ไม่มีรูปตรวจรับ
                  </span>
                )}
              </div>
              <span className="text-emerald-600 font-bold text-sm whitespace-nowrap">
                <span className="text-slate-400 dark:text-slate-500 font-normal">จำนวนรายการยา </span>{bill.drug_count} รายการ
              </span>
            </div>
            {/* row 2: บริษัท · วันรับ + lot */}
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-0.5 gap-2">
              <span className="truncate">
                {bill.supplier}
                <span className="text-slate-400 dark:text-slate-500"> · วันที่รับ: </span>{fmtDateThaiShort(bill.receive_date)}
              </span>
              <span className="text-slate-400 dark:text-slate-500 whitespace-nowrap">{bill.item_count} lot</span>
            </div>
            {/* row 3: timeline (วันที่แต่ละขั้น + ผู้รับผิดชอบ) + มูลค่า + action */}
            <div className="flex items-center justify-between mt-1.5 gap-2">
              <div className="flex items-center gap-x-3 gap-y-1 text-xs flex-wrap">
                <span className="text-emerald-700 dark:text-emerald-300">
                  <span className="text-slate-400 dark:text-slate-500">คลังรับ:</span> {fmtDateThaiShort(bill.receive_date)}
                </span>
                {bill.acknowledged_at && (
                  <span className="text-sky-600">
                    <span className="text-slate-400 dark:text-slate-500">→ จัดซื้อรับ:</span> {fmtDateThaiShort(bill.acknowledged_at.slice(0,10))}
                    {bill.acknowledged_by && ` · ${bill.acknowledged_by}`}
                  </span>
                )}
                {bill.inspected_at && (
                  <span className="text-orange-700 dark:text-orange-300">
                    <span className="text-slate-400 dark:text-slate-500">→ ตรวจรับ:</span> {fmtDateThaiShort(bill.inspected_at.slice(0,10))}
                    {bill.inspected_by && ` · ${bill.inspected_by}`}
                  </span>
                )}
                {bill.ap_sent_at && (
                  <span className="text-indigo-700 dark:text-indigo-300">
                    <span className="text-slate-400 dark:text-slate-500">→ ส่งบัญชี:</span> {fmtDateThaiShort(bill.ap_sent_at.slice(0,10))}
                    {bill.ap_sent_by && ` · ${bill.ap_sent_by}`}
                  </span>
                )}
                {bill.ap_posted_at && (
                  <span className="text-violet-700 dark:text-violet-300">
                    <span className="text-slate-400 dark:text-slate-500">→ ตั้งหนี้:</span> {fmtDateThaiShort(bill.ap_posted_at.slice(0,10))}
                    {bill.ap_posted_by && ` · ${bill.ap_posted_by}`}
                  </span>
                )}
                <span className={`font-semibold ${overdue ? 'text-red-600' : 'text-slate-500 dark:text-slate-400'}`}>
                  <span className="text-slate-400 dark:text-slate-500 font-normal">{sentTimestamp ? '· ค้างที่บัญชี ' : '· รวม '}</span>{days} วัน
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-orange-600 font-mono text-sm">
                  <span className="text-slate-400 dark:text-slate-500 font-normal font-sans">มูลค่ารวม </span>
                  {Number(bill.total_value || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })} บาท
                </span>
                {/* ปุ่มรับบิล (เฉพาะ unack) */}
                {onAcknowledge && !stage && !bill.acknowledged_at && (
                  <button onClick={(e) => { e.stopPropagation(); onAcknowledge(bill); }}
                    disabled={busy} title="จัดซื้อรับเอกสารแล้ว"
                    className="text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-950/70 border border-sky-200 dark:border-sky-900/60 px-2 py-0.5 rounded inline-flex items-center gap-1 text-xs disabled:opacity-50 font-medium">
                    <CheckCircle2 size={12}/> รับบิล
                  </button>
                )}
                {/* ปุ่มย้อน ack */}
                {onUnacknowledge && isAcked && (
                  <button onClick={(e) => { e.stopPropagation(); onUnacknowledge(bill); }}
                    disabled={busy} title="ย้อนเป็นรอจัดซื้อรับเอกสาร"
                    className="text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/50 p-1 rounded inline-flex items-center text-xs disabled:opacity-50">
                    <Undo2 size={13}/>
                  </button>
                )}
                {/* ปุ่ม undo (inspected/sent) */}
                {onUndo && (stage === 'inspected' || stage === 'sent_batch') && (
                  <button onClick={(e) => { e.stopPropagation(); onUndo(bill); }}
                    disabled={busy} title={undoTitle || 'ย้อนกลับ'}
                    className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50 p-1 rounded inline-flex items-center text-xs disabled:opacity-50">
                    <Undo2 size={13}/>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {isExpanded && <BillItemsDetail bill={bill}/>}
    </div>
  );
}

// Sort toolbar — ใช้แทน header sortable
function SortToolbar({ sortKey, sortDir, toggleSort, allSelected, onToggleAll, totalSelected, totalBills, hideSelectAll }) {
  const options = [
    { key: 'receive_date', label: 'วันรับ' },
    { key: 'bill_number',  label: 'เลขบิล' },
    { key: 'drug_count',   label: 'รายการ' },
    { key: 'item_count',   label: 'Lot' },
    { key: 'value',        label: 'มูลค่า' },
    { key: 'days',         label: 'วันค้าง' },
  ];
  const arrow = sortDir === 'asc' ? '▲' : '▼';
  return (
    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center flex-wrap gap-1.5 text-xs">
      <span className="text-slate-500 dark:text-slate-400 mr-1">เรียง:</span>
      {options.map(opt => (
        <button key={opt.key} onClick={() => toggleSort(opt.key)}
          className={`px-2 py-0.5 rounded font-medium transition-colors ${sortKey === opt.key ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
          {opt.label}{sortKey === opt.key && <span className="ml-1">{arrow}</span>}
        </button>
      ))}
      {!hideSelectAll && onToggleAll && (
        <label className="ml-auto flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={allSelected} onChange={onToggleAll}/>
          เลือกทั้งหมด ({totalSelected}/{totalBills})
        </label>
      )}
    </div>
  );
}

function ToastPopup({ type = 'success', message, onClose }) {
  const isError = type === 'error';
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top duration-200">
      <div className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border-2 max-w-md min-w-[280px] ${isError ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800/60 text-red-800 dark:text-red-300' : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'}`}>
        <Icon size={20} className={`shrink-0 mt-0.5 ${isError ? 'text-red-600' : 'text-emerald-600'}`}/>
        <div className="flex-1 text-sm font-medium leading-relaxed whitespace-pre-line">{message}</div>
        <button onClick={onClose} className={`shrink-0 -mr-1 -mt-1 p-1 rounded hover:bg-white/40 ${isError ? 'text-red-600' : 'text-emerald-600'}`}>
          <X size={16}/>
        </button>
      </div>
    </div>
  );
}

function StageBadge({ stage, acknowledged }) {
  // ถ้า stage = NULL + ack แล้ว → ใช้ derived 'acked'
  const key = (!stage && acknowledged) ? 'acked' : (stage ?? 'null');
  const cfg = AP_STAGE_LABEL[key] || AP_STAGE_LABEL.null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>{cfg.label}
    </span>
  );
}

// Pipeline ขั้นตอนงาน AP — รวม "สถานะ (กรองได้) + จำนวน + ปุ่ม action" ของแต่ละขั้นเป็นการ์ดเดียว
// คลิกหัวการ์ด = กรองบิลตามสถานะนั้น, ปุ่มในการ์ด = ดำเนินการขั้นนั้นกับบิลที่เลือก
function StagePipeline({
  stageFilter, setStageFilter, stageCount,
  selUnack, selAcked, selInspected,
  busy, someUnackSelected, someAckedSelected, someInspectedSelected,
  onExportAck, onAcknowledge, onMarkInspected, onExportSend,
  onBulkUndo, undoableCount,
}) {
  const toggleStage = (key) => setStageFilter(stageFilter === key ? 'all' : key);
  const cardBase = 'flex flex-col min-w-[200px] flex-1 rounded-xl border-2 bg-white dark:bg-slate-900 transition-all overflow-hidden';
  const arrow = <ArrowRight size={18} className="text-slate-300 dark:text-slate-500 shrink-0 self-center"/>;

  // หัวการ์ด (คลิกเพื่อกรอง) — แสดงเลขขั้น, สถานะ, จำนวนบิลในสถานะนั้น
  const renderHead = (no, title, count, dot, active) => (
    <button onClick={() => toggleStage(active.key)}
      className={`text-left px-3 pt-2.5 pb-2 cursor-pointer transition-colors ${stageFilter === active.key ? active.head : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">ขั้น {no}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${active.pill}`}>{count} บิล</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <span className={`w-2 h-2 rounded-full ${dot}`}/>
        <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">{title}</span>
      </div>
    </button>
  );

  const cfg = {
    unack:     { key: 'unack',     border: stageFilter === 'unack'     ? 'border-amber-400'  : 'border-slate-200 dark:border-slate-700', head: 'bg-amber-50 dark:bg-amber-950/40',  pill: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' },
    acked:     { key: 'acked',     border: stageFilter === 'acked'     ? 'border-sky-400'    : 'border-slate-200 dark:border-slate-700', head: 'bg-sky-50 dark:bg-sky-950/40',    pill: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300' },
    inspected: { key: 'inspected', border: stageFilter === 'inspected' ? 'border-orange-400' : 'border-slate-200 dark:border-slate-700', head: 'bg-orange-50 dark:bg-orange-950/40', pill: 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300' },
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">ลำดับงาน — คลิกการ์ดเพื่อกรองบิลตามสถานะ แล้วเลือกบิลเพื่อกดปุ่มในขั้นนั้น</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setStageFilter('all')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${stageFilter === 'all' ? 'bg-slate-700 text-white shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>
            ดูทั้งหมด ({stageCount.all || 0})
          </button>
          {onBulkUndo && (
            <button onClick={onBulkUndo}
              disabled={busy || undoableCount === 0}
              title={undoableCount === 0 ? 'เลือกบิลที่ ack แล้ว หรือ ตรวจรับแล้ว ก่อน' : ''}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60 hover:bg-amber-50 dark:hover:bg-amber-950/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              <Undo2 size={12}/> ย้อนกลับ ({undoableCount})
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {/* ขั้น 1 — รอจัดซื้อรับเอกสาร: พิมพ์ใบส่งมอบเอกสาร + บันทึกจัดซื้อรับเอกสาร */}
        <div className={`${cardBase} ${cfg.unack.border}`}>
          {renderHead(1, 'รอจัดซื้อรับเอกสาร', stageCount.unack || 0, 'bg-amber-500', cfg.unack)}
          <div className="border-t border-slate-100 dark:border-slate-800 p-2 space-y-1.5">
            <button onClick={onExportAck} disabled={busy || !someUnackSelected}
              title={!someUnackSelected ? 'เลือกบิล "รอจัดซื้อรับเอกสาร" ก่อน' : 'พิมพ์ใบส่งมอบเอกสารให้เซ็น'}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-cyan-600 text-white hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all shadow-sm">
              <Printer size={15}/> พิมพ์ใบส่งมอบเอกสาร ({selUnack})
            </button>
            <button onClick={() => onAcknowledge()} disabled={busy || !someUnackSelected}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-sky-500 text-white hover:bg-sky-600 disabled:bg-slate-200 disabled:text-slate-400 transition-all shadow-sm">
              <CheckCircle2 size={15}/> บันทึกจัดซื้อรับเอกสาร ({selUnack})
            </button>
          </div>
        </div>

        {arrow}

        {/* ขั้น 2 — จัดซื้อรับเอกสารแล้ว: ยืนยันตรวจรับ (เปิด checklist modal) */}
        <div className={`${cardBase} ${cfg.acked.border}`}>
          {renderHead(2, 'จัดซื้อรับเอกสารแล้ว', stageCount.acked || 0, 'bg-sky-500', cfg.acked)}
          <div className="border-t border-slate-100 dark:border-slate-800 p-2 space-y-1.5">
            <button onClick={onMarkInspected} disabled={busy || !someAckedSelected}
              title={!someAckedSelected ? 'ต้องบันทึกจัดซื้อรับเอกสารก่อน (กรุณาเลือกบิลที่ "จัดซื้อรับเอกสารแล้ว")' : ''}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 transition-all shadow-sm">
              <CheckCircle2 size={15}/> ยืนยันตรวจรับ ({selAcked})
            </button>
          </div>
        </div>

        {arrow}

        {/* ขั้น 3 — รอนำส่งบัญชี: พิมพ์ใบนำส่ง + นำส่งบัญชี */}
        <div className={`${cardBase} ${cfg.inspected.border}`}>
          {renderHead(3, 'รอนำส่งบัญชี', stageCount.inspected || 0, 'bg-orange-500', cfg.inspected)}
          <div className="border-t border-slate-100 dark:border-slate-800 p-2 space-y-1.5">
            <button onClick={onExportSend} disabled={busy || !someInspectedSelected}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all shadow-sm">
              <Printer size={15}/> พิมพ์ใบนำส่ง & นำส่งบัญชี ({selInspected})
            </button>
          </div>
        </div>

        {arrow}

        {/* ปลายทาง — นำส่งบัญชีแล้ว (ดูที่แท็บถัดไป) */}
        <div className="flex flex-col items-center justify-center min-w-[140px] flex-1 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-3 text-center bg-slate-50 dark:bg-slate-800/50">
          <FileCheck2 size={20} className="text-slate-300 dark:text-slate-500 mb-1"/>
          <span className="font-semibold text-sm text-slate-400 dark:text-slate-500">นำส่งบัญชีแล้ว</span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">ดูที่แท็บ “นำส่งบัญชีแล้ว”</span>
        </div>
      </div>
    </div>
  );
}

function PendingTab({ bills, selected, toggleBill, toggleAll, stageFilter, setStageFilter, stageCount, busy, onMarkInspected, onExportSend, onExportAck, onUninspect, onAcknowledge, onUnacknowledge, onBulkUndo, toggleSort, sortKey, sortDir, expandedBill, toggleExpand }) {
  const allSelected = bills.length > 0 && selected.size === bills.length;
  const someInspectedSelected = bills.some(b => b.ap_stage === 'inspected' && selected.has(b._key));
  const someAckedSelected    = bills.some(b => !b.ap_stage && b.acknowledged_at && selected.has(b._key));   // ack แล้ว (พร้อมตรวจรับ)
  const someUnackSelected    = bills.some(b => !b.ap_stage && !b.acknowledged_at && selected.has(b._key)); // ยังไม่ ack (พร้อมรับบิล)
  const undoableCount = bills.filter(b => selected.has(b._key) && ((b.ap_stage === 'inspected') || (!b.ap_stage && b.acknowledged_at))).length;
  // จำนวนบิลที่เลือกในแต่ละขั้น — โชว์บนปุ่ม action ของขั้นนั้น
  const selUnack     = bills.filter(b => !b.ap_stage && !b.acknowledged_at && selected.has(b._key)).length;
  const selAcked     = bills.filter(b => !b.ap_stage && b.acknowledged_at && selected.has(b._key)).length;
  const selInspected = bills.filter(b => b.ap_stage === 'inspected' && selected.has(b._key)).length;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 space-y-3">
        {/* Pipeline ขั้นตอนงาน — สถานะ + จำนวน + ปุ่ม action ของแต่ละขั้นรวมเป็นการ์ดเดียว */}
        <StagePipeline
          stageFilter={stageFilter} setStageFilter={setStageFilter} stageCount={stageCount}
          selUnack={selUnack} selAcked={selAcked} selInspected={selInspected}
          busy={busy}
          someUnackSelected={someUnackSelected} someAckedSelected={someAckedSelected} someInspectedSelected={someInspectedSelected}
          onExportAck={onExportAck} onAcknowledge={onAcknowledge}
          onMarkInspected={onMarkInspected} onExportSend={onExportSend}
          onBulkUndo={onBulkUndo} undoableCount={undoableCount} />
      </div>
      {bills.length === 0 ? (
        <div className="text-center text-slate-400 dark:text-slate-500 py-12 text-sm">ไม่มีบิลรอตรวจรับ/ส่งบัญชี</div>
      ) : (
        <>
          <SortToolbar sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort}
            allSelected={allSelected} onToggleAll={() => toggleAll(bills)}
            totalSelected={selected.size} totalBills={bills.length}/>
          <div>
            {bills.map(b => (
              <BillCard key={b._key} bill={b}
                selected={selected.has(b._key)} onToggleSelect={toggleBill}
                isExpanded={expandedBill === b._key} onToggleExpand={toggleExpand}
                busy={busy} onUndo={onUninspect} undoTitle="ย้อนกลับเป็นรอตรวจรับ"
                onAcknowledge={onAcknowledge} onUnacknowledge={onUnacknowledge}/>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SentTab({ bills, selected, toggleBill, toggleAll, accountant, setAccountant, busy, onMarkPosted, onUnsendBatch, toggleSort, sortKey, sortDir, expandedBill, toggleExpand }) {
  const allSelected = bills.length > 0 && selected.size === bills.length;
  // group by batch_id for display
  const byBatch = bills.reduce((acc, b) => {
    const k = b.ap_batch_id || '-';
    if (!acc[k]) acc[k] = [];
    acc[k].push(b);
    return acc;
  }, {});
  const batchKeys = Object.keys(byBatch).sort().reverse();

  return (
    <div>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">จนท.บัญชี:</span>
          <input value={accountant} onChange={e => setAccountant(e.target.value)}
            placeholder=""
            className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm w-52"/>
        </div>
        <button onClick={() => toggleAll(bills)} disabled={bills.length === 0}
          className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 disabled:opacity-40">
          {allSelected ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกทั้งหมด'} ({selected.size}/{bills.length})
        </button>
        <button onClick={() => onMarkPosted()} disabled={busy || selected.size === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all">
          <CheckCircle2 size={15}/> ยืนยันตั้งหนี้ ({selected.size})
        </button>
      </div>

      {batchKeys.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-center text-slate-400 dark:text-slate-500 py-12 text-sm">ไม่มีบิลรอ post</div>
      ) : (
        <>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 mb-3">
            <SortToolbar sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} hideSelectAll/>
          </div>
          {batchKeys.map(bk => (
            <div key={bk} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden mb-3">
              <div className="p-2 bg-sky-50 dark:bg-sky-950/40 border-b border-sky-100 dark:border-sky-900/50 flex items-center justify-between">
                <div className="text-sm font-medium text-sky-800 dark:text-sky-300">Batch: {bk}  <span className="text-xs text-slate-500 dark:text-slate-400">({byBatch[bk].length} บิล)</span></div>
                <button onClick={() => onMarkPosted(byBatch[bk])}
                  disabled={busy}
                  className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                  ยืนยันตั้งหนี้ทั้งรอบ
                </button>
              </div>
              <div>
                {byBatch[bk].map(b => (
                  <BillCard key={b._key} bill={b}
                    selected={selected.has(b._key)} onToggleSelect={toggleBill}
                    isExpanded={expandedBill === b._key} onToggleExpand={toggleExpand}
                    busy={busy} onUndo={onUnsendBatch} undoTitle="ย้อนกลับเป็นรอนำส่งบัญชี (ออกจาก batch)"
                    sentTimestamp/>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function HistoryTab({ batches, busy, search = '', onReExport, onUnpost, onResetBatch }) {
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [batchBills, setBatchBills]       = useState({}); // { batchId: [billGroup[]] }
  const [loadingBatch, setLoadingBatch]   = useState(null);

  // เมื่อ search active → pre-fetch บิลทุก batch ที่ยังไม่ cache
  const q = search.trim().toLowerCase();
  useEffect(() => {
    if (!q || batches.length === 0) return;
    const missing = batches.filter(b => !batchBills[b.batch_id]).map(b => b.batch_id);
    if (missing.length === 0) return;
    (async () => {
      try {
        const results = await Promise.all(missing.map(bid => fetchApBills({ batchId: bid }).catch(() => [])));
        setBatchBills(prev => {
          const next = { ...prev };
          missing.forEach((bid, i) => { next[bid] = groupRowsByBill(results[i]); });
          return next;
        });
      } catch (_) { /* swallow */ }
    })();
  }, [q, batches, batchBills]);

  // กรอง batches: ถ้า search active → เฉพาะ batch ที่มี bill match (ถ้ายังไม่ load ยังแสดงไว้ก่อน)
  const visibleBatches = !q ? batches : batches.filter(b => {
    const bills = batchBills[b.batch_id];
    if (!bills) return true; // ยังโหลดไม่เสร็จ — แสดงไว้ก่อน
    return bills.some(bill => billMatchesQuery(bill, q));
  });

  if (batches.length === 0) return <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-center text-slate-400 dark:text-slate-500 py-12 text-sm">ไม่มี batch ตรงเงื่อนไข — ลองล้างตัวกรองวันที่ส่ง หรือไปแท็บ "รอนำส่งบัญชี" เพื่อสร้าง batch แรก</div>;
  if (visibleBatches.length === 0) return <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-center text-slate-400 dark:text-slate-500 py-12 text-sm">ไม่พบบิล/บริษัท ที่ตรงกับคำค้น "{q}"</div>;

  async function toggleExpand(batchId) {
    if (expandedBatch === batchId) { setExpandedBatch(null); return; }
    setExpandedBatch(batchId);
    if (batchBills[batchId]) return; // cached
    setLoadingBatch(batchId);
    try {
      const rows = await fetchApBills({ batchId });
      setBatchBills(prev => ({ ...prev, [batchId]: groupRowsByBill(rows) }));
    } catch (e) { /* swallow — bill list just won't load */ }
    finally { setLoadingBatch(null); }
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs uppercase">
          <tr>
            <th className="p-2 text-left">Batch ID</th>
            <th className="p-2 text-left">ส่งโดย</th>
            <th className="p-2 text-center">วันที่ส่ง</th>
            <th className="p-2 text-center">บิล</th>
            <th className="p-2 text-center">post แล้ว</th>
            <th className="p-2 text-right">มูลค่ารวม</th>
            <th className="p-2 text-center">การจัดการ</th>
          </tr>
        </thead>
        <tbody>
          {visibleBatches.map(b => {
            const done = b.posted_count === b.bill_count;
            const isExpanded = expandedBatch === b.batch_id || (!!q && !!batchBills[b.batch_id]); // auto-expand เมื่อ search
            return (
              <React.Fragment key={b.batch_id}>
                <tr className={`border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${isExpanded ? 'bg-emerald-50 dark:bg-emerald-950/40' : ''}`}
                    onClick={() => toggleExpand(b.batch_id)}>
                  <td className="p-2 font-mono font-medium text-slate-800 dark:text-slate-100">
                    <span className="inline-flex items-center gap-1">
                      {isExpanded ? <ChevronDown size={14} className="text-emerald-600"/> : <ChevronUp size={14} className="text-slate-400 dark:text-slate-500 rotate-180"/>}
                      {b.batch_id}
                    </span>
                  </td>
                  <td className="p-2 text-slate-600 dark:text-slate-300">{b.sent_by || '-'}</td>
                  <td className="p-2 text-center text-slate-600 dark:text-slate-300">{fmtDateThaiShort(b.sent_at?.slice(0,10))}</td>
                  <td className="p-2 text-center">{b.bill_count}</td>
                  <td className="p-2 text-center">
                    <span className={done ? 'text-emerald-600 font-semibold' : 'text-sky-600'}>{b.posted_count}/{b.bill_count}</span>
                  </td>
                  <td className="p-2 text-right font-mono">{fmtBahtDisplay(b.total_value)}</td>
                  <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      <button onClick={() => onReExport(b)} disabled={busy}
                        className="px-2 py-1 rounded text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center gap-1 disabled:opacity-50">
                        <Printer size={12}/> พิมพ์ซ้ำ
                      </button>
                      <button onClick={() => onResetBatch(b)} disabled={busy}
                        title={`Reset batch — ทุกบิล (${b.bill_count} บิล) จะกลับเป็น "รอนำส่งบัญชี"`}
                        className="px-2 py-1 rounded text-xs bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/70 text-amber-700 dark:text-amber-300 flex items-center gap-1 disabled:opacity-50">
                        <Undo2 size={12}/> Reset
                      </button>
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="bg-slate-50 dark:bg-slate-800/70 border-t-2 border-emerald-200 dark:border-emerald-900/60">
                    <td colSpan={7} className="p-3">
                      <div className="mb-2 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-3 flex-wrap">
                        <span><span className="text-slate-400 dark:text-slate-500">Batch:</span> <span className="font-semibold">{b.batch_id}</span></span>
                        <span><span className="text-slate-400 dark:text-slate-500">บิลทั้งหมด:</span> <span className="font-semibold">{b.bill_count}</span></span>
                        <span><span className="text-slate-400 dark:text-slate-500">Post แล้ว:</span> <span className={done ? 'text-emerald-600 font-semibold' : 'text-sky-600 font-semibold'}>{b.posted_count}/{b.bill_count}</span></span>
                        <span className="ml-auto"><span className="text-slate-400 dark:text-slate-500">มูลค่ารวม:</span> <span className="font-bold text-emerald-700 dark:text-emerald-300">{fmtBahtDisplay(b.total_value)} บาท</span></span>
                      </div>
                      {loadingBatch === b.batch_id ? (
                        <div className="text-center text-slate-400 dark:text-slate-500 py-4 text-sm">กำลังโหลด...</div>
                      ) : !batchBills[b.batch_id] || batchBills[b.batch_id].length === 0 ? (
                        <div className="text-center text-slate-400 dark:text-slate-500 py-4 text-sm">ไม่พบรายการ</div>
                      ) : (
                        <BatchBillsList bills={batchBills[b.batch_id]} search={q} />
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BatchBillsList({ bills, search = '' }) {
  const [expandedBill, setExpandedBill] = useState(null);
  const q = search.trim().toLowerCase();
  const filteredBills = !q ? bills : bills.filter(b => billMatchesQuery(b, q));
  if (filteredBills.length === 0) {
    return <div className="text-center text-slate-400 dark:text-slate-500 py-3 text-xs italic">— ไม่มีบิลที่ตรงกับคำค้น "{q}" ใน batch นี้ —</div>;
  }
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      {filteredBills.map(b => (
        <BillCard key={b._key} bill={b}
          isExpanded={expandedBill === b._key}
          onToggleExpand={(bn) => setExpandedBill(cur => cur === bn ? null : bn)}/>
      ))}
    </div>
  );
}
