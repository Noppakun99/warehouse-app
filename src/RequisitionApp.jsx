import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from './lib/supabase';
import SearchableSelect from './SearchableSelect';
import {
  ArrowLeft, Search, Plus, Minus, Trash2, Send, Pencil,
  CheckCircle, XCircle, Package, FileText,
  Printer, RefreshCcw, ChevronRight, Bell,
  Check, X, AlertCircle, Clock, Download, FileDown,
} from 'lucide-react';
import { exportToExcel } from './lib/exportExcel';

// ============================================================
// Config
// ============================================================
// Drug type badge colors
// normalize code สำหรับ match — ตัด leading zeros, lowercase, แก้ scientific notation
const codeKey = (val) => {
  if (!val || val === '-') return '';
  let s = String(val).trim().toLowerCase();
  if (/^[\d.]+[eE][+\-]?\d+$/.test(s)) {
    const n = parseFloat(s);
    s = isFinite(n) ? BigInt(Math.round(n)).toString() : s;
  }
  s = s.replace(/^0+(\d)/, '$1');
  return s;
};

// normalize name สำหรับ match — lowercase + collapse spaces
const nameKey = (val) => {
  if (!val || val === '-') return '';
  return String(val).trim().toLowerCase().replace(/\s+/g, ' ');
};

function DrugTypeBadge({ type }) {
  if (!type || type === '-') return null;
  const t = type.trim().toLowerCase();
  let cls = 'bg-slate-100 text-slate-600';
  if (t.includes('เม็ด') || t.includes('tablet') || t.includes('cap')) cls = 'bg-blue-100 text-blue-700';
  else if (t.includes('น้ำ') || t.includes('syrup') || t.includes('liquid') || t.includes('sol')) cls = 'bg-emerald-100 text-emerald-700';
  else if (t.includes('ฉีด') || t.includes('inject') || t.includes('iv') || t.includes('im')) cls = 'bg-rose-100 text-rose-700';
  else if (t.includes('apply') || t.includes('cream') || t.includes('oint') || t.includes('ทา')) cls = 'bg-amber-100 text-amber-700';
  else if (t.includes('inhale') || t.includes('สูด') || t.includes('spray')) cls = 'bg-purple-100 text-purple-700';
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{type}</span>
  );
}

const STATUS_CONFIG = {
  pending:   { label: 'รอดำเนินการ',    badge: 'bg-amber-100  text-amber-700  border border-amber-300'   },
  approved:  { label: 'อนุมัติแล้ว',    badge: 'bg-green-100  text-green-700  border border-green-300'   },
  partial:   { label: 'อนุมัติบางส่วน', badge: 'bg-orange-100 text-orange-700 border border-orange-300'  },
  rejected:  { label: 'ไม่อนุมัติ',         badge: 'bg-red-100    text-red-700    border border-red-300'     },
  dispensed: { label: 'จ่ายยาแล้ว',     badge: 'bg-blue-100   text-blue-700   border border-blue-300'    },
};

const exportCSV = (reqs, filename) => {
  // หัวข้อตรงกับ COL_MAP ของ dispense log เรียงลำดับตาม template
  const rows = [[
    'วันที่เบิก', 'mainlog', 'detailedlog',
    'รหัส', 'ชนิดยา', 'รายการยา',
    'หน่วยนับ', 'ราคา/หน่วย',
    'lot number', 'exp', 'ชนิดรายการ',
    'คงเหลือก่อนเบิก', 'ปริมาณ (ออก)', 'คงเหลือหลังจ่าย',
    'หน่วยงานที่เบิก', 'หมายเหตุ',
    'เลขที่ใบเบิก',
  ]];
  reqs.forEach(req => {
    const d = new Date(req.created_at);
    const pad = n => String(n).padStart(2,'0');
    const date = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
    (req.requisition_items || []).forEach(item => {
      rows.push([
        date,
        item.main_log || '',
        item.detail_log || '',
        item.drug_code || '-',
        item.drug_type || '-',
        item.drug_name || '-',
        item.drug_unit || '-',
        item.price_per_unit || '',
        item.lot || '-',
        item.exp || '-',
        item.item_type || '',
        '',
        item.requested_qty,
        '',
        req.department,
        item.item_note || req.note || '',
        req.req_number,
      ]);
    });
  });
  const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
    download: filename
  });
  a.click();
};

const REQUISITION_EXCEL_COLS = [
  { header: 'วันที่เบิก',        value: (r) => {
    const d = new Date(r.created_at);
    const pad = n => String(n).padStart(2,'0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()+543}`;
  }},
  { header: 'MainLog',            value: (r) => r._item?._main_log || '' },
  { header: 'DetailedLog',        value: (r) => r._item?._detail_log || '' },
  { header: 'รหัส',              value: (r) => r._item?.drug_code || '' },
  { header: 'ชนิด',              value: (r) => r._item?.drug_type || '' },
  { header: 'รายการยา',          value: (r) => r._item?.drug_name || '' },
  { header: 'หน่วย',             value: (r) => r._item?.drug_unit || '' },
  { header: 'ราคา/หน่วย',       value: (r) => r._item?.price_per_unit ?? '' },
  { header: 'Lot Number',         value: (r) => r._item?.lot || '' },
  { header: 'Exp',                value: (r) => r._item?.exp || '' },
  { header: 'ชนิดรายการ',        value: (r) => r._item?._item_type_ref || '' },
  { header: 'คงเหลือก่อนเบิก',  value: () => '' },
  { header: 'ปริมาณ (ออก)',      value: (r) => r._item?.approved_qty ?? r._item?.requested_qty ?? '' },
  { header: 'คงเหลือหลังจ่าย',  value: () => '' },
  { header: 'หน่วยงานที่เบิก',  value: (r) => r.department || '' },
  { header: 'หมายเหตุ',          value: (r) => r._item?.item_note || r.note || '' },
];

// แปลง list ของ requisitions → flat rows (1 row ต่อ item) สำหรับ Excel
const flattenReqs = (reqs) =>
  reqs.flatMap(req =>
    (req.requisition_items?.length ? req.requisition_items : [{}]).map(item => ({ ...req, _item: item }))
  );

// Export Excel พร้อม lookup main_log / detail_log / item_type จาก receive_logs
async function exportReqExcel(reqs, auth) {
  const flat = flattenReqs(reqs);
  // lookup main_log, detail_log, item_type จาก receive_logs ตาม drug_code+lot
  const logMap = {};
  if (supabase) {
    const lots = [...new Set(flat.map(r => r._item?.lot).filter(Boolean))];
    const codes = [...new Set(flat.map(r => r._item?.drug_code).filter(Boolean))];
    if (lots.length > 0 || codes.length > 0) {
      let q = supabase.from('receive_logs').select('drug_code, lot, main_log, detail_log, item_type');
      if (lots.length > 0) q = q.in('lot', lots);
      const { data } = await q.limit(2000);
      (data || []).forEach(r => {
        const key = `${String(r.drug_code||'').trim()}|${String(r.lot||'').trim()}`;
        if (!logMap[key]) logMap[key] = { main_log: r.main_log || '', detail_log: r.detail_log || '', item_type: r.item_type || '' };
      });
    }
  }
  // เติม main_log / detail_log / item_type เข้า flat rows
  const enriched = flat.map(r => {
    const key = `${String(r._item?.drug_code||'').trim()}|${String(r._item?.lot||'').trim()}`;
    const ref = logMap[key] || {};
    return { ...r, _item: { ...r._item, _main_log: ref.main_log || '', _detail_log: ref.detail_log || '', _item_type_ref: ref.item_type || r._item?.item_type || '' } };
  });
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const filename = reqs.length === 1 ? `${reqs[0].req_number}.xlsx` : `ใบเบิกยา_${date}.xlsx`;
  exportToExcel(enriched, REQUISITION_EXCEL_COLS, 'ใบเบิกยา', filename, auth);
}

const genReqNumber = () => {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `REQ-${date}-${String(Math.floor(Math.random()*9000)+1000)}`;
};

// ============================================================
// Shared: sticky page header
// ============================================================
function PageHeader({ onBack, title, subtitle, children }) {
  return (
    <div className="sticky top-0 z-10 shadow-md px-4 py-3 flex items-center gap-3" style={{background:'#1E90FF'}}>
      <button onClick={onBack} className="p-1 transition-colors hover:opacity-70" style={{color:'#001F3F'}}>
        <ArrowLeft size={20} />
      </button>
      <div className="flex-1 min-w-0 border-l-4 pl-3 py-0.5" style={{borderColor:'rgba(255,255,255,0.7)'}}>
        {title    && <p className="font-bold truncate drop-shadow" style={{fontSize:'23px',color:'#ffffff'}}>{title}</p>}
        {subtitle && <p className="truncate font-medium" style={{fontSize:'20px',color:'rgba(0,0,0,0.55)'}}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ============================================================
// Root
// prefilledUser: { name, department } → skip requester login
// startAsStaff: true → skip staff login (AppRoot already authed)
// ============================================================
export default function RequisitionApp({ onBack, prefilledUser = null, startAsStaff = false, initialStep = null, auth = {} }) {
  const [view, setView] = useState(
    startAsStaff  ? 'staff'     :
    prefilledUser ? 'requester' :
    'home'
  );
  return (
    <div className="min-h-screen text-slate-800 font-sans" style={{background:'#F0F8FF'}}>
      {view === 'home'      && <HomeView      onSelect={setView} onBack={onBack} />}
      {view === 'requester' && <RequesterRoot onBack={() => prefilledUser ? onBack() : setView('home')} prefilledUser={prefilledUser} initialStep={initialStep} auth={auth} />}
      {view === 'staff'     && <StaffRoot     onBack={() => startAsStaff  ? onBack() : setView('home')} alreadyAuthed={startAsStaff} auth={auth} />}
    </div>
  );
}

// ============================================================
// Home (แสดงเมื่อเข้าผ่านปุ่มใน Dashboard โดยไม่มี prefilledUser)
// ============================================================
function HomeView({ onSelect, onBack }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 relative">
      <button onClick={onBack} className="absolute top-5 left-5 flex items-center gap-1.5 text-slate-500 hover:text-[#1E90FF] text-sm transition-colors">
        <ArrowLeft size={16} /> กลับหน้าหลัก
      </button>
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-100 rounded-2xl mb-4">
          <Package size={40} className="text-[#1E90FF]" />
        </div>
        <h1 className="text-3xl font-bold text-slate-800">ระบบเบิกยาออนไลน์</h1>
        <p className="text-slate-500 mt-2">เลือกบทบาทของคุณเพื่อเข้าใช้งาน</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
        <button onClick={() => onSelect('requester')}
          className="group bg-white border-2 border-slate-200 hover:border-blue-400 rounded-2xl p-8 text-center transition-all shadow-sm hover:shadow-md">
          <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Package size={32} className="text-blue-600" />
          </div>
          <div className="font-bold text-lg text-slate-800">ผู้เบิก</div>
          <div className="text-slate-500 text-sm mt-1">หน่วยงาน</div>
        </button>
        <button onClick={() => onSelect('staff')}
          className="group bg-white border-2 border-slate-200 hover:border-emerald-400 rounded-2xl p-8 text-center transition-all shadow-sm hover:shadow-md">
          <div className="w-14 h-14 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={32} className="text-emerald-600" />
          </div>
          <div className="font-bold text-lg text-slate-800">เจ้าหน้าที่คลังยา</div>
          <div className="text-slate-500 text-sm mt-1">อนุมัติ / จ่ายยา</div>
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Requester Root
// ============================================================
const CART_KEY = 'req_cart_draft';

function RequesterRoot({ onBack, prefilledUser, initialStep = null, auth = {} }) {
  const [step, setStep] = useState(initialStep || (prefilledUser ? 'search' : 'login'));
  const [info, setInfo] = useState(prefilledUser || null);
  const [cart, setCart] = useState(() => {
    try {
      const saved = sessionStorage.getItem(CART_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // sync cart → sessionStorage ทุกครั้งที่ cart เปลี่ยน
  useEffect(() => {
    try { sessionStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}
  }, [cart]);

  const clearCart = () => {
    setCart([]);
    try { sessionStorage.removeItem(CART_KEY); } catch {}
  };

  if (step === 'login')   return <RequesterLogin onLogin={v => { setInfo(v); setStep('search'); }} onBack={onBack} />;
  if (step === 'search')  return <DrugSearch info={info} cart={cart} setCart={setCart} onCart={() => setStep('cart')} onHistory={() => setStep('history')} onBack={onBack} />;
  if (step === 'cart')    return <CartView info={info} cart={cart} setCart={setCart} onBack={() => setStep('search')} onSubmitted={() => { clearCart(); setStep('history'); }} />;
  if (step === 'history') return <RequisitionHistory info={info} onBack={() => setStep('search')} auth={auth} />;
  return null;
}

// ---- Requester Login ----
function RequesterLogin({ onLogin, onBack }) {
  const [name, setName] = useState('');
  const [dept, setDept] = useState('');
  const [departments, setDepartments] = useState([
    'ห้องยา G','ห้องยา 1','ER (ฉุกเฉิน)','IPD (ผู้ป่วยใน)','OPD (ผู้ป่วยนอก)',
    'LR (ห้องคลอด)','ทันตกรรม','แผนไทย','กายภาพ','LAB','X-ray',
    'ห้องทำแผล','งานส่งต่อ','บริหารทั่วไป','พ.ข.ร (พนักงานขับรถ)',
    'กลุ่มงานจิตเวชและยาเสพติด','IPD-หน่วยวัง','IPD-โดม',
    'รพสต.คูคต','รพสต.วัดประยูร',
    'ศูนย์บริการสาธารณสุข 2 (ชุมชนรัตนโกสินทร์)',
    'ศูนย์บริการสาธารณสุข 3 (เทพธัญญะอุปถัมภ์)',
    'ศูนย์บริการสาธารณสุข 4 (สิริเวชชะพันธ์อุปถัมภ์)',
    'เทศบาลนครรังสิต','รพ.สามโคก','รพ.เปาโล','รพ.ปทุมเวศ','รพ.ลาดหลุมแก้ว',
    'เบิกเพิ่มจากความผิดพลาด','เบิกยาหมดอายุจากคลัง',
  ]);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('departments').select('name').order('name').then(({ data }) => {
      if (data?.length) setDepartments(data.map(d => d.name));
    });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 relative">
      <button onClick={onBack} className="absolute top-5 left-5 flex items-center gap-1.5 text-slate-500 hover:text-[#1E90FF] text-sm transition-colors">
        <ArrowLeft size={16} /> กลับ
      </button>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-100 rounded-xl mb-3">
            <Package size={28} className="text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">ข้อมูลผู้เบิก</h2>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (name.trim() && dept) onLogin({ name: name.trim(), department: dept }); }} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">ชื่อ-สกุล ผู้เบิก</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="กรอกชื่อ-สกุล" required
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E90FF] focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">หน่วยงาน</label>
            <SearchableSelect value={dept} onChange={setDept}
              options={departments} placeholder="-- เลือกหน่วยงาน --"
              className="w-full" />
          </div>
          <button type="submit" disabled={!name.trim() || !dept}
            className="w-full bg-[#1E90FF] hover:bg-[#1a7fe0] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-3 font-semibold text-sm transition-all mt-2">
            เข้าสู่ระบบเบิกยา →
          </button>
        </form>
      </div>
    </div>
  );
}

// ---- Helpers for date parsing in DrugSearch ----
const _pad = (n) => String(n).padStart(2, '0');
const _MON = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const parseExp = (raw) => {
  if (!raw && raw !== 0) return null;
  const s = String(raw).trim();
  if (/^\d{4,5}$/.test(s)) return new Date((parseInt(s) - 25569) * 86400000);
  // d/m/yyyy หรือ dd/mm/yyyy (format ที่ inventory เก็บจาก normalizeDateStr)
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    let yr = parseInt(slash[3]);
    if (yr > 2500) yr -= 543;
    return new Date(yr, parseInt(slash[2]) - 1, parseInt(slash[1]));
  }
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const mm = _MON[m[2].toLowerCase()];
    if (mm) { let yr = parseInt(m[3]); if (yr < 100) yr += yr < 70 ? 2000 : 1900; return new Date(yr, mm - 1, parseInt(m[1])); }
  }
  const d = new Date(s); return isNaN(d) ? null : d;
};
const fmtExp = (raw) => {
  const d = parseExp(raw); if (!d) return raw || '-';
  return `${_pad(d.getDate())}/${_pad(d.getMonth()+1)}/${d.getFullYear()}`;
};

// ---- Drug Search ----
function DrugSearch({ info, cart, setCart, onCart, onHistory, onBack }) {
  const [q, setQ]              = useState('');
  const [rawResults, setRawResults] = useState([]);   // inventory data (no reservation)
  const [reservedMap, setReservedMap] = useState({}); // lot → total reserved qty (realtime)
  const [loading, setLoading]  = useState(false);

  // Combine inventory + reservation → effective qty (recomputes whenever either changes)
  const results = useMemo(() =>
    rawResults.map(drug => {
      const lots = drug.lots.map(lot => {
        const reserved = reservedMap[lot.lot] || 0;
        const rawQtyNum = parseFloat(lot.rawQty) || 0;
        const effectiveQty = Math.max(0, rawQtyNum - reserved);
        return { ...lot, qty: effectiveQty, reserved };
      });
      const availableQty = lots.reduce((sum, lot) => (!lot.pending && !lot.expired ? sum + lot.qty : sum), 0);
      return { ...drug, lots, availableQty };
    }), [rawResults, reservedMap]);
  const [qtyMap, setQtyMap]    = useState({});   // key = code+name+lot
  const [warnMap, setWarnMap]  = useState({});   // key = lotKey → warning msg
  const [drugNames, setDrugNames]   = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [toast, setToast] = useState(null);
  const searchRef = useRef(null);

  const today = new Date(); today.setHours(0,0,0,0);
  const nearExpLimit = new Date(today); nearExpLimit.setMonth(nearExpLimit.getMonth() + 16); // 1 ปี 4 เดือน

  // Preload drug names + types for dropdown
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: inv } = await supabase.from('inventory').select('name, code, type');
      if (!inv) return;
      // build name→code and name→type maps directly from inventory (log คลัง CSV)
      const nameCodeMap = {};
      const nameTypeFromInv = {};
      inv.forEach(r => {
        if (r.name && r.code) nameCodeMap[r.name] = r.code;
        if (r.name && r.type && r.type !== '-' && !nameTypeFromInv[r.name]) nameTypeFromInv[r.name] = r.type;
      });
      const uniqueNames = [...new Set(inv.map(r => r.name).filter(Boolean))].sort();
      const uniqueCodes = [...new Set(inv.map(r => r.code).filter(Boolean))];
      // fallback 1: drug_details (match by code)
      const codeTypeMap = {};
      if (uniqueCodes.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < uniqueCodes.length; i += CHUNK) {
          const { data: dd } = await supabase.from('receive_logs').select('drug_code, drug_type').in('drug_code', uniqueCodes.slice(i, i + CHUNK));
          (dd || []).forEach(r => {
            const t = r.drug_type || '';
            if (t && t !== '-' && !codeTypeMap[r.drug_code]) codeTypeMap[r.drug_code] = t;
          });
        }
      }

      setDrugNames(uniqueNames.map(name => ({
        name,
        // priority: inventory.type → drug_details → (ไม่มี)
        type: nameTypeFromInv[name] || codeTypeMap[nameCodeMap[name]] || '',
      })));
    })();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredSuggestions = q.trim()
    ? drugNames.filter(n => n.name.toLowerCase().includes(q.toLowerCase())).slice(0, 10)
    : [];

  const search = useCallback(async (term) => {
    if (!term.trim()) { setResults([]); return; }
    setLoading(true);
    if (supabase) {
      // Separate queries to avoid comma in term breaking PostgREST or() syntax
      const [{ data: byName }, { data: byCode }] = await Promise.all([
        supabase.from('inventory').select('code, name, unit, qty, lot, exp, location, invoice').ilike('name', `%${term}%`).order('name').limit(300),
        supabase.from('inventory').select('code, name, unit, qty, lot, exp, location, invoice').ilike('code', `%${term}%`).order('name').limit(300),
      ]);
      const seen = new Set();
      const merged = [];
      [...(byName || []), ...(byCode || [])].forEach(r => {
        const k = `${r.code}|${r.name}|${r.lot}`;
        if (!seen.has(k)) { seen.add(k); merged.push(r); }
      });

      // Check receive_logs for รอตรวจรับ status
      const uniqueLots = [...new Set(merged.map(r => r.lot).filter(Boolean))];
      let pendingLotSet = new Set();
      if (uniqueLots.length > 0) {
        const { data: rl } = await supabase.from('receive_logs')
          .select('lot, receive_status')
          .in('lot', uniqueLots);
        (rl || []).forEach(r => {
          if (r.lot && String(r.receive_status || '').includes('รอ')) pendingLotSet.add(r.lot);
        });
      }

      // หัก qty ที่มี requisition pending/approved อยู่ (reserved) ออกจาก available
      const reservedQtyMap = {}; // lot → total reserved qty
      if (uniqueLots.length > 0) {
        const { data: ri } = await supabase
          .from('requisition_items')
          .select('lot, requested_qty, requisitions(status)')
          .in('lot', uniqueLots);
        (ri || []).forEach(item => {
          const status = item.requisitions?.status;
          if ((status === 'pending' || status === 'approved') && item.lot) {
            reservedQtyMap[item.lot] = (reservedQtyMap[item.lot] || 0) + (item.requested_qty || 0);
          }
        });
      }

      // Get supplier from drug_details (บริษัทปัจจุบัน) — more reliable than receive_logs
      const uniqueCodes = [...new Set(merged.map(r => r.code).filter(Boolean))];
      const supplierMap = {}; // "code|lot|invoice" → supplier (exact), "code|lot" → fallback
      if (uniqueCodes.length > 0) {
        const { data: dd } = await supabase.from('drug_details')
          .select('code, lot, invoice, drug_type, company, data')
          .in('code', uniqueCodes);
        (dd || []).forEach(r => {
          const code = codeKey(r.code);
          const lot  = String(r.lot  || '').trim().toLowerCase();
          const inv  = String(r.invoice || '').trim().toLowerCase();
          const k3 = `${code}|${lot}|${inv}`;
          const k2 = `${code}|${lot}`;
          const entry = {
            supplier: r.company || r.data?.['บริษัทปัจจุบัน'] || r.data?.['บริษัท'] || r.data?.['supplier_current'] || r.data?.['supplier'] || '',
            price:    r.data?.['ราคาต่อหน่วย(บาท)'] || r.data?.['ราคาต่อหน่วย'] || r.data?.['ราคา/หน่วย'] || r.data?.['price_per_unit'] || '',
            drugType: r.drug_type || r.data?.['รูปแบบ'] || r.data?.['ชนิด'] || r.data?.['drug_type'] || r.data?.['type'] || '',
            itemType: r.data?.['ชนิดรายการ'] || r.data?.['item_type'] || r.data?.['item type'] || '',
          };
          if (!supplierMap[k3]) supplierMap[k3] = entry;
          if (!supplierMap[k2]) supplierMap[k2] = entry;
        });
      }

      const getDetail = (row) => {
        const code = codeKey(row.code);
        const lot  = String(row.lot     || '').trim().toLowerCase();
        const inv  = String(row.invoice || '').trim().toLowerCase();
        return supplierMap[`${code}|${lot}|${inv}`] || supplierMap[`${code}|${lot}`] || {};
      };

      // Group by drug
      const grouped = {};
      merged.forEach(row => {
        const key = `${row.code}||${row.name}`;
        if (!grouped[key]) grouped[key] = { code: row.code, name: row.name, unit: row.unit, availableQty: 0, pendingQty: 0, lots: [] };
        const rowQty = parseFloat(row.qty) || 0;
        const isPending = pendingLotSet.has(row.lot);
        const expDate = parseExp(row.exp);
        const isExpired = expDate && expDate < today;
        if (isPending) {
          grouped[key].pendingQty += rowQty;
        } else if (!isExpired) {
          grouped[key].availableQty += rowQty; // raw qty; useMemo adjusts with reservedMap
        }
        const detail = getDetail(row);
        grouped[key].lots.push({ lot: row.lot, exp: row.exp, qty: rowQty, rawQty: row.qty, unit: row.unit, location: row.location, invoice: row.invoice, supplier: detail.supplier || '', price: detail.price || '', drugType: detail.drugType || '', itemType: detail.itemType || '', pending: isPending, expired: isExpired });
      });

      const result = Object.values(grouped);
      result.forEach(drug => {
        // Sort: available first by exp ASC, then pending, then expired
        drug.lots.sort((a, b) => {
          if (a.pending !== b.pending) return a.pending ? 1 : -1;
          if (a.expired !== b.expired) return a.expired ? 1 : -1;
          const da = parseExp(a.exp), db = parseExp(b.exp);
          if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
          return da - db;
        });
      });
      setRawResults(result);
      setReservedMap(reservedQtyMap); // initial snapshot; realtime will update this
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(q), 350);
    return () => clearTimeout(t);
  }, [q, search]);

  // Realtime: อัพเดต reservedMap ทันทีเมื่อ requisition_items เปลี่ยน
  useEffect(() => {
    if (!supabase || rawResults.length === 0) return;
    const allLots = [...new Set(rawResults.flatMap(d => d.lots.map(l => l.lot)).filter(Boolean))];
    if (allLots.length === 0) return;

    const fetchReserved = async () => {
      const { data: ri } = await supabase
        .from('requisition_items')
        .select('lot, requested_qty, requisitions(status)')
        .in('lot', allLots);
      const map = {};
      (ri || []).forEach(item => {
        const status = item.requisitions?.status;
        if ((status === 'pending' || status === 'approved') && item.lot) {
          map[item.lot] = (map[item.lot] || 0) + (item.requested_qty || 0);
        }
      });
      setReservedMap(map);
    };

    const channel = supabase
      .channel('req-reserved-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisition_items' }, fetchReserved)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requisitions' }, fetchReserved)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [rawResults]);

  const addToCart = (drug, lot, qty, lotKey) => {
    const requested = parseInt(qty) || 1;
    if (requested > lot.qty) {
      setWarnMap(p => ({ ...p, [lotKey]: `คงเหลือไม่พอ — มีเพียง ${lot.qty} ${lot.unit || drug.unit || ''} เลือกจำนวนใหม่` }));
      return;
    }
    setWarnMap(p => { const n = { ...p }; delete n[lotKey]; return n; });
    const safeQty = Math.max(1, requested);
    setCart(prev => {
      const idx = prev.findIndex(i => i.code === drug.code && i.name === drug.name && i.lot === lot.lot);
      if (idx >= 0) {
        const newQty = prev[idx].requestedQty + safeQty;
        if (newQty > lot.qty) {
          setWarnMap(p => ({ ...p, [lotKey]: `รวมในตะกร้าแล้ว ${prev[idx].requestedQty} — คงเหลือ Lot นี้ไม่พอ (มี ${lot.qty}) เลือกจำนวนใหม่` }));
          return prev;
        }
        const u = [...prev]; u[idx] = { ...u[idx], requestedQty: newQty }; return u;
      }
      return [...prev, { code: drug.code, name: drug.name, unit: lot.unit, lot: lot.lot, exp: lot.exp, price: lot.price, drugType: lot.drugType, itemType: lot.itemType || '', location: lot.location || '', availableQty: lot.qty, lotRawQty: lot.rawQty ?? lot.qty, requestedQty: safeQty, note: '', addedAt: new Date().toISOString() }];
    });
    setQtyMap(p => ({ ...p, [lotKey]: 1 }));
    setToast({ name: drug.name, type: lot.drugType || drug.type || '', qty: safeQty, unit: lot.unit || drug.unit || '' });
    setTimeout(() => setToast(null), 3000);
  };

  // accent color bar ซ้ายของ card ตาม drug type
  const drugTypeAccent = (type) => {
    if (!type || type === '-') return '#CBD5E1';
    const t = type.trim().toLowerCase();
    if (t.includes('เม็ด') || t.includes('tablet') || t.includes('cap')) return '#3B82F6';
    if (t.includes('น้ำ') || t.includes('syrup') || t.includes('liquid') || t.includes('sol')) return '#10B981';
    if (t.includes('ฉีด') || t.includes('inject') || t.includes('iv') || t.includes('im')) return '#EF4444';
    if (t.includes('apply') || t.includes('cream') || t.includes('oint') || t.includes('ทา')) return '#F59E0B';
    if (t.includes('inhale') || t.includes('สูด') || t.includes('spray')) return '#8B5CF6';
    return '#94A3B8';
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 max-w-sm w-full mx-4">
          <CheckCircle size={20} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate">{toast.name}</p>
            <p className="text-xs text-green-100">{toast.type && `${toast.type} · `}เพิ่มเข้าตะกร้าแล้ว · จำนวน <span className="font-bold text-white">{toast.qty} × {toast.unit}</span></p>
          </div>
        </div>
      )}

      <PageHeader onBack={onBack} title={info.name} subtitle={info.department}>
        <button onClick={onHistory} className="transition-colors px-3 py-2 rounded-lg border border-white/50 bg-white/10 hover:bg-white/25 flex items-center gap-1.5 text-white">
          <FileText size={16} strokeWidth={2} />
          <span className="text-sm font-medium">ประวัติการเบิก</span>
        </button>
        <button onClick={onCart} className="relative rounded-lg border border-white/50 bg-white/10 hover:bg-white/25 px-3 py-2 flex items-center gap-1.5 transition-colors text-white">
          <Package size={16} /><span className="text-sm font-medium">ตะกร้า</span>
          {cart.length > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{cart.length}</span>}
        </button>
      </PageHeader>

      {/* Hero Search Area */}
      <div className="bg-gradient-to-br from-[#1E90FF] to-[#0055cc] px-4 pt-5 pb-10 shadow-md">
        <p className="text-white/80 text-sm mb-3 font-medium">ค้นหายาในคลัง</p>
        <div className="relative" ref={searchRef}>
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
          <input type="text" value={q}
            onChange={e => { setQ(e.target.value); setShowDropdown(true); }}
            onFocus={() => { if (q.trim()) setShowDropdown(true); }}
            placeholder="ชื่อยาหรือรหัสยา..." autoFocus
            className="w-full bg-white rounded-xl pl-11 pr-10 py-3.5 text-slate-800 placeholder-slate-400 text-base focus:outline-none focus:ring-2 focus:ring-white/80 shadow-lg border-0" />
          {q && (
            <button onClick={() => { setQ(''); setRawResults([]); }} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          )}
          {showDropdown && filteredSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
              {filteredSuggestions.map(({ name, type }) => (
                <button key={name} onMouseDown={e => { e.preventDefault(); setQ(name); setShowDropdown(false); }}
                  className="w-full text-left px-4 py-3 text-base text-slate-700 hover:bg-[#F0F8FF] hover:text-[#1E90FF] transition-colors border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{name}</span>
                    {type && <DrugTypeBadge type={type} />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {results.length > 0 && (
          <button onClick={() => search(q)} className="mt-3 flex items-center gap-1.5 text-white hover:text-white/80 text-sm font-bold transition-colors">
            <RefreshCcw size={15} strokeWidth={2.5} /> อัพเดตคงเหลือใหม่
          </button>
        )}
      </div>

      {/* Results list — pulls up over hero via negative margin */}
      <div className="flex-1 px-4 pb-28 -mt-5 space-y-3">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <div className="w-8 h-8 border-4 border-[#1E90FF] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm">กำลังค้นหา...</p>
          </div>
        )}

        {!loading && q && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Search size={48} className="mb-3 opacity-20" />
            <p className="font-semibold text-slate-500">ไม่พบยาที่ค้นหา</p>
            <p className="text-sm mt-1">ลองใช้ชื่อสั้นกว่านี้ หรือค้นด้วยรหัสยา</p>
          </div>
        )}

        {/* Empty state — welcome */}
        {!q && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex flex-col items-center text-center mt-1">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
              <Package size={32} className="text-[#1E90FF]" />
            </div>
            <h3 className="font-bold text-lg text-slate-700 mb-1">ยินดีต้อนรับ</h3>
            <p className="text-slate-400 text-sm mb-5">พิมพ์ชื่อยาหรือรหัสยาในช่องด้านบน<br />เพื่อค้นหาและเพิ่มรายการยาเข้าตะกร้า</p>
            <div className="flex flex-wrap gap-2 justify-center text-xs">
              <span className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full font-medium">ค้นด้วยชื่อยา</span>
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full font-medium">ค้นด้วยรหัสยา</span>
              <span className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full font-medium">เลือก Lot ที่ต้องการ</span>
            </div>
          </div>
        )}

        {results.map(drug => {
          const drugKey = drug.code + drug.name;
          const inCart = cart.find(i => i.code === drug.code && i.name === drug.name);
          const accentColor = drugTypeAccent(drug.lots[0]?.drugType);
          return (
            <div key={drugKey} className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200"
              style={{ borderLeft: `4px solid ${accentColor}` }}>
              {/* Drug header */}
              <div className="px-4 py-3">
                <div className="flex items-start gap-2 flex-wrap">
                  <p className="font-bold text-lg text-slate-800 leading-snug flex-1">{drug.name}</p>
                  {drug.lots[0]?.drugType && drug.lots[0].drugType !== '-' && (
                    <DrugTypeBadge type={drug.lots[0].drugType} />
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-sm text-slate-400">รหัส: {drug.code}</span>
                  {inCart && <span className="text-sm text-[#1E90FF] font-bold bg-blue-50 px-2 py-0.5 rounded-full">ในตะกร้า: {inCart.requestedQty}</span>}
                </div>
              </div>

              {/* Lot rows — badge/chip layout */}
              {drug.lots.map((lot, li) => {
                const lotKey = drugKey + lot.lot;
                const expDate = parseExp(lot.exp);
                const isExpired = lot.expired;
                const nearExp = !isExpired && expDate && expDate <= nearExpLimit;
                const isPending = lot.pending;
                const canAdd = !isPending && !isExpired && lot.qty > 0;

                let rowBg = 'border-t border-slate-100';
                if (isPending) rowBg = 'border-t border-dashed border-sky-200 bg-sky-50/50';
                else if (isExpired) rowBg = 'border-t border-rose-100 bg-rose-50/60';
                else if (nearExp) rowBg = 'border-t border-amber-100 bg-amber-50/50';

                return (
                  <div key={li} className={`px-4 py-3 ${rowBg}`}>
                    {/* Chip row */}
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      {/* Lot chip */}
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border
                        ${isPending ? 'bg-sky-100 text-sky-700 border-sky-200'
                          : isExpired ? 'bg-rose-100 text-rose-700 border-rose-200'
                          : nearExp ? 'bg-amber-100 text-amber-700 border-amber-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        Lot: {lot.lot || '-'}
                      </span>
                      {/* Exp chip */}
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border
                        ${isExpired ? 'bg-rose-100 text-rose-700 border-rose-200'
                          : nearExp ? 'bg-amber-100 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                        {isExpired || nearExp ? <AlertCircle size={11} /> : <Clock size={11} />}
                        Exp: {fmtExp(lot.exp)}
                      </span>
                      {/* Qty chip */}
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border
                        ${lot.qty === 0 ? 'bg-red-50 text-red-600 border-red-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                        จำนวน: {lot.qty}×{lot.unit || '-'}
                        {lot.reserved > 0 && <span className="ml-1 text-slate-400 font-normal">(จาก {lot.rawQty ?? lot.qty})</span>}
                      </span>
                      {/* Status chips */}
                      {isPending && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 text-xs font-bold border border-sky-200">
                          <Package size={11} /> รอตรวจรับ
                        </span>
                      )}
                      {isExpired && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200">
                          <AlertCircle size={11} /> หมดอายุแล้ว
                        </span>
                      )}
                      {nearExp && !isExpired && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">
                          <Clock size={11} /> ใกล้หมดอายุ
                        </span>
                      )}
                      {lot.reserved > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-bold border border-orange-200">
                          <Clock size={11} /> จอง {lot.reserved}
                        </span>
                      )}
                      {/* Info chips */}
                      {lot.invoice && lot.invoice !== '-' && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs border border-slate-200">
                          บิล: {lot.invoice}
                        </span>
                      )}
                      {lot.supplier && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs border border-indigo-100">
                          {lot.supplier}
                        </span>
                      )}
                      {lot.location && lot.location !== '-' && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs border border-slate-200">
                          {lot.location}
                        </span>
                      )}
                      {lot.itemType && lot.itemType !== '-' && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-purple-50 text-purple-600 text-xs border border-purple-100">
                          {lot.itemType}
                        </span>
                      )}
                      {lot.price && lot.price !== '-' && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200">
                          ฿ {lot.price}
                        </span>
                      )}
                    </div>

                    {/* Add to cart controls */}
                    {canAdd ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <input type="number" min="1" max={lot.qty}
                          value={qtyMap[lotKey] ?? 1}
                          onChange={e => {
                            setQtyMap(p => ({ ...p, [lotKey]: e.target.value }));
                            setWarnMap(p => { const n = { ...p }; delete n[lotKey]; return n; });
                          }}
                          className={`w-20 bg-white border rounded-lg px-2 py-2 text-slate-800 text-center text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#1E90FF] ${warnMap[lotKey] ? 'border-red-400 bg-red-50' : 'border-slate-300'}`} />
                        <button onClick={() => addToCart(drug, lot, qtyMap[lotKey] ?? 1, lotKey)}
                          className="bg-[#1E90FF] hover:bg-[#1a7fe0] text-white rounded-lg px-4 py-2 text-sm font-bold flex items-center gap-1.5 transition-colors shadow-sm">
                          <Plus size={15} /> เพิ่มเข้าตะกร้า
                        </button>
                        {warnMap[lotKey] && (
                          <p className="w-full text-xs text-red-600 font-medium mt-0.5">⚠️ {warnMap[lotKey]}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">
                        {isPending ? 'รอตรวจรับ — ยังไม่สามารถเบิกได้' : isExpired ? 'ยาหมดอายุแล้ว' : 'ไม่มีสต็อก'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Floating Cart Button */}
      {cart.length > 0 && (
        <button onClick={onCart}
          className="fixed bottom-6 right-5 z-40 bg-[#1E90FF] hover:bg-[#1a7fe0] text-white rounded-2xl shadow-2xl px-5 py-3.5 flex items-center gap-2.5 transition-all active:scale-95">
          <Package size={20} />
          <span className="font-bold text-base">ตะกร้ายา</span>
          <span className="bg-white text-[#1E90FF] rounded-full w-6 h-6 flex items-center justify-center font-black text-sm">{cart.length}</span>
        </button>
      )}
    </div>
  );
}

// ---- Cart ----
function CartView({ info, cart, setCart, onBack, onSubmitted }) {
  const [note, setNote]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [doneInfo, setDoneInfo] = useState(null);

  const updateQty   = (i, v) => setCart(p => { const u=[...p]; u[i]={...u[i], requestedQty: Math.min(Math.max(1, parseInt(v)||1), u[i].availableQty || 99999)}; return u; });
  const updateNote  = (i, v) => setCart(p => { const u=[...p]; u[i]={...u[i], note: v}; return u; });

  const submit = async () => {
    if (!cart.length) return;
    setLoading(true); setError('');
    try {
      if (supabase) {
        // Re-validate ณ เวลา submit — ดึง qty จริงจาก DB + pending reservations
        const lots = [...new Set(cart.map(i => i.lot).filter(Boolean))];
        if (lots.length > 0) {
          const [{ data: invData }, { data: riData }] = await Promise.all([
            supabase.from('inventory').select('lot, qty').in('lot', lots),
            supabase.from('requisition_items')
              .select('lot, requested_qty, requisitions(status)')
              .in('lot', lots),
          ]);
          const invQtyMap = {};
          (invData || []).forEach(r => {
            invQtyMap[r.lot] = (invQtyMap[r.lot] || 0) + (parseFloat(r.qty) || 0);
          });
          const reservedNow = {};
          (riData || []).forEach(item => {
            const status = item.requisitions?.status;
            if ((status === 'pending' || status === 'approved') && item.lot) {
              reservedNow[item.lot] = (reservedNow[item.lot] || 0) + (item.requested_qty || 0);
            }
          });
          const conflicts = cart.filter(item => {
            if (!item.lot) return false;
            const effective = Math.max(0, (invQtyMap[item.lot] ?? 0) - (reservedNow[item.lot] ?? 0));
            return item.requestedQty > effective;
          });
          if (conflicts.length > 0) {
            const msg = conflicts.map(item => {
              const effective = Math.max(0, (invQtyMap[item.lot] ?? 0) - (reservedNow[item.lot] ?? 0));
              return `${item.name} Lot ${item.lot}: ขอ ${item.requestedQty} แต่เหลือ ${effective}`;
            }).join('\n');
            setError(`ส่งใบเบิกไม่ได้ — สต็อกไม่เพียงพอ:\n${msg}`);
            setLoading(false);
            return;
          }
        }

        const { data: req, error: e1 } = await supabase.from('requisitions')
          .insert({ req_number: genReqNumber(), department: info.department, requester_name: info.name, status: 'pending', note: note.trim()||null })
          .select().single();
        if (e1) throw e1;
        const { error: e2 } = await supabase.from('requisition_items').insert(
          cart.map(item => ({
            requisition_id: req.id,
            drug_code:      item.code,
            drug_name:      item.name,
            drug_unit:      item.unit || null,
            drug_type:      item.drugType || null,
            item_type:      item.itemType || null,
            lot:            item.lot || null,
            exp:            item.exp || null,
            price_per_unit: item.price || null,
            location:       item.location || null,
            requested_qty:  item.requestedQty,
            item_note:      item.note?.trim() || null,
          }))
        );
        if (e2) throw e2;
        const d = new Date();
        setDoneInfo({
          reqNumber:  req.req_number,
          department: info.department,
          name:       info.name,
          itemCount:  cart.length,
          date:       d.toLocaleDateString('th-TH', { day:'numeric', month:'long', year:'numeric' }),
          time:       d.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' }),
        });
      } else {
        onSubmitted();
      }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  if (doneInfo) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center space-y-4">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-black text-slate-800">ส่งใบเบิกสำเร็จ</h2>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">เลขที่ใบเบิก</span><span className="font-bold text-[#1E90FF]">{doneInfo.reqNumber}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">วันที่</span><span className="font-semibold text-slate-800">{doneInfo.date} {doneInfo.time}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">หน่วยงาน</span><span className="font-semibold text-slate-800">{doneInfo.department}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">ชื่อผู้ส่ง</span><span className="font-semibold text-slate-800">{doneInfo.name}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">จำนวนรายการ</span><span className="font-bold text-emerald-600">{doneInfo.itemCount} รายการ</span></div>
        </div>
        <button onClick={onSubmitted}
          className="w-full bg-[#1E90FF] hover:bg-[#1a7fe0] text-white rounded-xl py-3 font-bold text-base transition-colors">
          ตกลง
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader onBack={onBack} title="ตะกร้าใบเบิก" subtitle={`${info.department} · ${info.name}`} />
      <div className="flex-1 p-4 space-y-2 pb-32">
        {cart.length === 0
          ? <p className="text-center text-slate-500 py-20">ยังไม่มีรายการยา</p>
          : cart.map((item, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-lg text-slate-800 leading-snug">{item.name}</p>
                  <p className="text-base text-slate-500 mt-1">รหัส: {item.code} · หน่วย: {item.unit || '-'}</p>
                  {(item.lot || item.exp) && (
                    <p className="text-base text-slate-500 mt-0.5">
                      {item.lot && `Lot: ${item.lot}`}{item.lot && item.exp && ' · '}{item.exp && `Exp: ${item.exp}`}
                    </p>
                  )}
                  {item.lotRawQty != null && (
                    <p className="text-base text-emerald-600 font-medium mt-0.5">คงเหลือ: {item.lotRawQty}×{item.unit || ''}</p>
                  )}
                  {item.addedAt && (
                    <p className="text-xs text-slate-400 mt-1">เพิ่มเข้าตะกร้า: {new Date(item.addedAt).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'})}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 mt-1">
                  <button onClick={() => updateQty(i, item.requestedQty-1)} className="bg-slate-100 hover:bg-slate-200 rounded-lg p-2 transition-colors"><Minus size={16} /></button>
                  <input type="number" min="1" value={item.requestedQty} onChange={e => updateQty(i, e.target.value)}
                    className="w-16 bg-slate-50 border border-slate-300 rounded-lg px-2 py-2 text-slate-800 text-center text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#1E90FF]" />
                  <button onClick={() => updateQty(i, item.requestedQty+1)} disabled={item.availableQty != null && item.requestedQty >= item.availableQty}
                    className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg p-2 transition-colors"><Plus size={16} /></button>
                  <button onClick={() => { setCart(p => p.filter((_,j)=>j!==i)); setError(''); }} className="text-red-400 hover:text-red-600 p-2 transition-colors"><Trash2 size={18} /></button>
                </div>
              </div>
              <div className="px-4 pb-4">
                <input type="text" value={item.note || ''} onChange={e => updateNote(i, e.target.value)}
                  placeholder="หมายเหตุรายการนี้..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder-slate-400 text-base focus:outline-none focus:ring-1 focus:ring-[#1E90FF]" />
              </div>
            </div>
          ))
        }
        {cart.length > 0 && (
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="หมายเหตุ (ถ้ามี)..." rows={2}
            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E90FF] resize-none mt-2" />
        )}
        {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center gap-2"><AlertCircle size={14}/>{error}</p>}
      </div>
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-slate-200">
          <button onClick={submit} disabled={loading}
            className="w-full bg-[#1E90FF] hover:bg-[#1a7fe0] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-3.5 font-semibold flex items-center justify-center gap-2 transition-all">
            <Send size={18} />{loading ? 'กำลังส่งใบเบิก...' : `ส่งใบเบิก (${cart.length} รายการ)`}
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Print helper ----
function printReq(req) {
  const d = new Date(req.created_at);
  const dateStr = d.toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' });
  const statusLabel = (STATUS_CONFIG[req.status] || STATUS_CONFIG.pending).label;
  const allItems = req.requisition_items || [];
  const items = req.status === 'partial'
    ? allItems.filter(item => item.approved_qty != null && item.approved_qty > 0)
    : allItems;
  const rows = items.map((item, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td style="text-align:center">${item.drug_code || '-'}</td>
      <td style="text-align:center">${item.drug_type || '-'}</td>
      <td>${item.drug_name || '-'}</td>
      <td style="text-align:center">${item.drug_unit || '-'}</td>
      <td style="text-align:center">${item.requested_qty}</td>
      <td style="text-align:right">${item.price_per_unit != null && item.price_per_unit !== '' ? Number(item.price_per_unit).toLocaleString('th-TH') : '-'}</td>
      <td style="text-align:center">${item.lot || '-'}</td>
      <td style="text-align:center">${item.exp || '-'}</td>
      <td>${item.item_note || ''}</td>
    </tr>`).join('');

  const sigBlock = `
    <div class="sig-block">
      <p>(ลงชื่อ)...........................................(ผู้เบิก)</p>
      <p>(...........................................)</p>
      <p>ตำแหน่ง เภสัชกรชำนาญการ</p>
      <p>วันที่........./........./................</p>
    </div>`;

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
    <title>ใบเบิกยา ${req.req_number}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
      body { font-family: 'Sarabun', sans-serif; font-size: 16px; margin: 20px; color: #1e293b; }
      h2 { margin: 0 0 4px; font-size: 22px; font-weight: 700; }
      .meta { color: #374151; font-size: 14px; margin-bottom: 16px; line-height: 1.8; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 80px; }
      th { background: transparent; color: #000; padding: 8px 10px; font-size: 15px; font-weight: 700; text-align: left; border-bottom: 2px solid #000; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 15px; }
      tr:nth-child(even) td { background: #f8fafc; }
      .badge { display:inline-block; padding: 2px 10px; border-radius: 999px; font-size:13px; font-weight:600;
               background:#fef3c7; color:#92400e; border:1px solid #fde68a; }
      /* signature fixed at bottom — appears on every printed page */
      .sig-block {
        position: fixed;
        bottom: 24px;
        right: 32px;
        font-size: 15px;
        line-height: 2;
        text-align: center;
      }
      .sig-block p { margin: 0; }
      @media print {
        body { margin: 10mm 12mm; }
        .sig-block {
          position: fixed;
          bottom: 12mm;
          right: 16mm;
        }
      }
    </style></head><body>
    <h2>ใบเบิกยา : ${req.department}</h2>
    <div class="meta">
      เลขที่: <strong>${req.req_number}</strong> &nbsp;|&nbsp;
      หน่วยงาน: <strong>${req.department}</strong> &nbsp;|&nbsp;
      ผู้เบิก: <strong>${req.requester_name || '-'}</strong> &nbsp;|&nbsp;
      วันที่: <strong>${dateStr}</strong> &nbsp;|&nbsp;
      สถานะ: <span class="badge">${statusLabel}</span>
    </div>
    <table>
      <thead><tr>
        <th style="width:48px;text-align:center">ลำดับที่</th>
        <th style="width:90px;text-align:center">รหัส</th>
        <th style="width:80px;text-align:center">ชนิด</th>
        <th>รายการ</th>
        <th style="width:90px;text-align:center">หน่วยนับ</th>
        <th style="width:110px;text-align:center">จำนวนที่เบิก</th>
        <th style="width:90px;text-align:right">ราคา/หน่วย</th>
        <th style="width:90px;text-align:center">Lot</th>
        <th style="width:90px;text-align:center">Exp</th>
        <th style="width:120px">หมายเหตุ</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${req.note ? `<p style="margin-top:12px;color:#64748b;font-size:14px">หมายเหตุ: ${req.note}</p>` : ''}
    ${sigBlock}
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`;

  const w = window.open('', '_blank', 'width=900,height=650');
  if (w) { w.document.write(html); w.document.close(); }
}

// ---- Requisition History ----
function RequisitionHistory({ info, onBack, auth = {} }) {
  const [list, setList]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from('requisitions').select('*, requisition_items(*)')
      .eq('department', info.department).eq('requester_name', info.name)
      .order('created_at', { ascending: false }).limit(30);
    setList(data || []); setLoading(false);
  }, [info]);

  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase.channel('req-history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisitions' }, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader onBack={onBack} title="ประวัติการเบิกยา">
        <button onClick={load} className="text-slate-500 hover:text-[#1E90FF] p-1 transition-colors"><RefreshCcw size={18} /></button>
      </PageHeader>
      <div className="flex-1 p-4 space-y-3">
        {loading && <p className="text-center text-slate-500 py-10">กำลังโหลด...</p>}
        {!loading && list.length === 0 && <p className="text-center text-slate-500 py-20">ยังไม่มีประวัติการเบิกยา</p>}
        {list.map(req => {
          const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
          return (
            <div key={req.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <button className="w-full p-4 text-left flex items-start justify-between gap-3"
                onClick={() => setExpanded(expanded===req.id ? null : req.id)}>
                <div className="min-w-0">
                  <p className="font-mono text-xs text-slate-400">{req.req_number}</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{req.department}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(req.created_at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'})}
                    &nbsp;· {req.requisition_items?.length||0} รายการ
                  </p>
                  {req.updated_at && req.updated_at !== req.created_at && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      แก้ไขล่าสุด: {new Date(req.updated_at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'})}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.badge}`}>{cfg.label}</span>
                  <button onClick={e => { e.stopPropagation(); printReq(req); }}
                    className="p-1.5 text-slate-400 hover:text-[#1E90FF] hover:bg-[#F0F8FF] rounded-lg transition-colors" title="พิมพ์ใบเบิก">
                    <Printer size={15} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); exportReqExcel([req], auth); }}
                    className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Export Excel">
                    <FileDown size={15} />
                  </button>
                  <ChevronRight size={16} className={`text-slate-400 transition-transform ${expanded===req.id?'rotate-90':''}`} />
                </div>
              </button>
              {expanded===req.id && (
                <div className="border-t border-slate-100 p-4 space-y-2 bg-slate-50">
                  {req.requisition_items?.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-sm gap-2 bg-white rounded-lg px-3 py-2 border border-slate-100">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <DrugTypeBadge type={item.drug_type} />
                          <span className="text-slate-800 font-medium">{item.drug_name}</span>
                          <span className="text-slate-400 text-xs">({item.drug_unit||'-'})</span>
                        </div>
                        {item.approved_qty!=null && (
                          <span className={`text-xs font-semibold ${item.approved_qty>0?'text-emerald-600':'text-red-500'}`}>
                            → {item.approved_qty>0?`อนุมัติ ${item.approved_qty}`:'ไม่อนุมัติ'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-500 text-xs">ขอ <b>{item.requested_qty}</b>{item.drug_unit && item.drug_unit !== '-' && <span> × {item.drug_unit}</span>}</span>
                        {item.approved_qty == null && item.approved_qty !== 0 && null}
                      </div>
                    </div>
                  ))}
                  {req.note && <p className="text-xs text-slate-400 pt-2 border-t border-slate-200">หมายเหตุ: {req.note}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Staff Root
// ============================================================
function StaffRoot({ onBack, alreadyAuthed = false, auth = {} }) {
  const [authed, setAuthed]     = useState(alreadyAuthed);
  const [selected, setSelected] = useState(null);

  if (!authed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 relative">
        <button onClick={onBack} className="absolute top-5 left-5 flex items-center gap-1.5 text-slate-500 hover:text-[#1E90FF] text-sm transition-colors">
          <ArrowLeft size={16} /> กลับ
        </button>
        <div className="w-full max-w-xs bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 rounded-xl mb-4">
            <CheckCircle size={28} className="text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-1">เจ้าหน้าที่คลังยา</h2>
          <p className="text-slate-500 text-sm mb-6">กดยืนยันเพื่อเข้าระบบ</p>
          <button onClick={() => setAuthed(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 font-semibold transition-all">
            เข้าสู่ระบบ
          </button>
        </div>
      </div>
    );
  }
  if (selected) return <RequisitionDetail req={selected} onBack={() => setSelected(null)} onDone={() => setSelected(null)} />;
  return <StaffDashboard onLogout={() => alreadyAuthed ? onBack() : setAuthed(false)} onSelect={setSelected} auth={auth} />;
}

// ---- Staff Dashboard ----
function StaffDashboard({ onLogout, onSelect, auth = {} }) {
  const [list, setList]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('pending');
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [deleteId, setDeleteId] = useState(null); // id รอยืนยันลบ
  const [selected, setSelected] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [searchDept, setSearchDept] = useState('');

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (deleteId !== id) { setDeleteId(id); return; }
    await supabase.from('requisition_items').delete().eq('requisition_id', id);
    await supabase.from('requisitions').delete().eq('id', id);
    setDeleteId(null);
    setList(prev => prev.filter(r => r.id !== id));
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const toggleSelect = (e, id) => {
    e.stopPropagation();
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(r => r.id)));
    }
  };

  const bulkDelete = async () => {
    if (!selected.size) return;
    setBulkLoading(true);
    for (const id of selected) {
      await supabase.from('requisition_items').delete().eq('requisition_id', id);
      await supabase.from('requisitions').delete().eq('id', id);
    }
    setList(prev => prev.filter(r => !selected.has(r.id)));
    setSelected(new Set());
    setBulkLoading(false);
  };

  const bulkApprove = async () => {
    if (!selected.size) return;
    setBulkLoading(true);
    for (const id of selected) {
      const req = list.find(r => r.id === id);
      if (!req || req.status !== 'pending') continue;
      for (const item of req.requisition_items || []) {
        await supabase.from('requisition_items').update({ approved_qty: item.requested_qty }).eq('id', item.id);
      }
      await supabase.from('requisitions').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', id);
    }
    await load();
    setSelected(new Set());
    setBulkLoading(false);
  };

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from('requisitions').select('*, requisition_items(*)')
      .order('created_at', { ascending: false }).limit(200);
    setList(data||[]); setLoading(false);
  }, []);

  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase.channel('staff-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisitions' }, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  const pendingCount = list.filter(r=>r.status==='pending').length;

  const allDepts = [...new Set(list.map(r => r.department).filter(Boolean))].sort();

  const filtered = list.filter(r => {
    const statusMatch = filter === 'all' || r.status === filter;
    const dateMatch = filter === 'pending' || !dateFilter || (r.created_at && r.created_at.slice(0, 10) === dateFilter);
    const nameMatch = !searchName.trim() || (r.requester_name||'').toLowerCase().includes(searchName.trim().toLowerCase());
    const deptMatch = !searchDept || r.department === searchDept;
    return statusMatch && dateMatch && nameMatch && deptMatch;
  });

  const tabs = [
    { key:'pending',   label:'รอดำเนินการ' },
    { key:'all',       label:'ทั้งหมด'      },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader onBack={onLogout} title="ระบบเบิกยาออนไลน์">
        {pendingCount>0 && (
          <span className="flex items-center gap-1 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            <Bell size={11}/> {pendingCount}
          </span>
        )}
        <button onClick={load} className="text-slate-500 hover:text-[#1E90FF] p-1 transition-colors"><RefreshCcw size={18}/></button>
      </PageHeader>

      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-100 flex-wrap">
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1E90FF]" />
        <button onClick={() => setDateFilter('')}
          className={`text-xs px-2 py-1 rounded-lg border transition-colors ${!dateFilter ? 'bg-[#F0F8FF] text-[#1E90FF] border-[#1E90FF]' : 'text-slate-500 border-slate-300 hover:bg-slate-100'}`}>
          ทั้งหมด
        </button>
        <div className="relative min-w-[160px] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" value={searchName} onChange={e => setSearchName(e.target.value)}
            placeholder="ชื่อผู้เบิก..."
            className="w-full pl-8 pr-7 py-1 border border-slate-300 rounded-lg text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1E90FF]" />
          {searchName && (
            <button onClick={() => setSearchName('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={13}/>
            </button>
          )}
        </div>
        <div className="relative min-w-[160px] flex-1">
          <select value={searchDept} onChange={e => setSearchDept(e.target.value)}
            className="w-full appearance-none pl-3 pr-7 py-1 border border-slate-300 rounded-lg text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1E90FF]">
            <option value="">-- ทุกหน่วยงาน --</option>
            {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <ChevronRight size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" />
        </div>
        <button onClick={() => exportReqExcel(filtered, auth)}
          className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg px-3 py-1 text-sm font-medium transition-colors">
          <FileDown size={16}/> Excel
        </button>
      </div>

      <div className="flex gap-1 px-3 py-2.5 bg-white border-b border-slate-200 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => {
            setFilter(tab.key);
            setDeleteId(null);
            if (tab.key === 'all') {
              // ทั้งหมด = ไม่กรองวัน (แสดงทุกวัน)
              setDateFilter('');
            } else if (tab.key !== 'pending' && !dateFilter) {
              // กลับมา tab อื่น → restore วันนี้
              setDateFilter(new Date().toISOString().slice(0, 10));
            }
          }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap font-medium transition-all ${
              filter===tab.key ? 'bg-[#F0F8FF] text-[#1E90FF]' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}>
            {tab.label}
            {tab.key==='pending' && pendingCount>0 && (
              <span className="bg-amber-500 text-white text-xs font-bold rounded-full px-1.5">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Bulk action toolbar */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-600" onClick={toggleAll}>
            <input type="checkbox" readOnly checked={selected.size > 0 && selected.size === filtered.length}
              ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length; }}
              className="w-4 h-4 accent-[#1E90FF] cursor-pointer" />
            เลือกทั้งหมด
          </label>
          {selected.size > 0 && (
            <>
              <span className="text-xs text-slate-400">({selected.size} รายการ)</span>
              <button onClick={bulkApprove} disabled={bulkLoading}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                <Check size={13}/> อนุมัติที่เลือก
              </button>
              <button onClick={bulkDelete} disabled={bulkLoading}
                className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 disabled:bg-slate-300 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                <Trash2 size={13}/> ลบที่เลือก
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex-1 p-4 space-y-3">
        {loading && <p className="text-center text-slate-500 py-10">กำลังโหลด...</p>}
        {!loading && filtered.length===0 && <p className="text-center text-slate-500 py-20">ไม่มีรายการ</p>}
        {filtered.map(req => {
          const cfg = STATUS_CONFIG[req.status]||STATUS_CONFIG.pending;
          const confirming = deleteId === req.id;
          return (
            <div key={req.id} className="bg-white border border-slate-200 rounded-xl shadow-sm flex items-stretch overflow-hidden">
              <div className="flex items-center pl-3" onClick={e => toggleSelect(e, req.id)}>
                <input type="checkbox" readOnly checked={selected.has(req.id)}
                  className="w-4 h-4 accent-[#1E90FF] cursor-pointer" />
              </div>
              <button onClick={() => onSelect(req)}
                className="flex-1 p-4 text-left flex items-start justify-between gap-3 hover:bg-slate-50 transition-colors">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-slate-400">{req.req_number}</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{req.department}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-sm text-slate-500">ผู้เบิก: {req.requester_name}</p>
                    <button onClick={e => { e.stopPropagation(); printReq(req); }}
                      className="p-1 text-slate-400 hover:text-[#1E90FF] hover:bg-[#F0F8FF] rounded-lg transition-colors" title="พิมพ์ใบเบิก">
                      <Printer size={13} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); exportReqExcel([req], auth); }}
                      className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Export Excel">
                      <FileDown size={13} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(req.created_at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'})}
                    &nbsp;· {req.requisition_items?.length||0} รายการ
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 mt-1">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.badge}`}>{cfg.label}</span>
                  <ChevronRight size={16} className="text-slate-400"/>
                </div>
              </button>
              {filter === 'all' && (
                <button
                  onClick={(e) => handleDelete(e, req.id)}
                  className={`shrink-0 px-4 flex flex-col items-center justify-center gap-1 border-l transition-colors ${
                    confirming
                      ? 'bg-red-500 border-red-500 text-white'
                      : 'border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200'
                  }`}>
                  <Trash2 size={16}/>
                  <span className="text-[10px] font-medium">{confirming ? 'ยืนยัน?' : 'ลบ'}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Requisition Detail ----
function RequisitionDetail({ req, onBack, onDone }) {
  const [currentReq, setCurrentReq] = useState(req);
  const isPending    = currentReq.status==='pending';
  const isApproved   = currentReq.status==='approved'||currentReq.status==='partial';
  const isRejected   = currentReq.status==='rejected';

  const toItemState = (list) => (list||[]).map(item => ({
    ...item,
    decision:   item.approved_qty!=null?(item.approved_qty>0?'approve':'reject'):'approve',
    approvedQty: item.approved_qty??item.requested_qty,
    itemNote:   item.note||'',
  }));

  const requesterNote = req.note || '';
  const [items, setItems] = useState(() => toItemState(req.requisition_items));
  const [staffNote, setStaffNote] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // Realtime: รับการแก้ไขจากหน้าผู้เบิก (แก้จำนวน/ลบรายการ)
  useEffect(() => {
    if (!supabase) return;
    const refresh = async () => {
      const { data } = await supabase.from('requisitions').select('*, requisition_items(*)')
        .eq('id', req.id).single();
      if (data) {
        setCurrentReq(data);
        setItems(toItemState(data.requisition_items));
      }
    };
    const ch = supabase.channel(`req-detail-${req.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisition_items' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisitions' }, refresh)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [req.id]);

  const updateItem = (i,field,val) => setItems(p => { const u=[...p]; u[i]={...u[i],[field]:val}; return u; });

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handleDelete = async () => {
    setLoading(true); setError('');
    try {
      if (supabase) {
        await supabase.from('requisition_items').delete().eq('requisition_id', req.id);
        await supabase.from('requisitions').delete().eq('id', req.id);
      }
      onDone();
    } catch(e) { setError(e.message); setLoading(false); }
  };

  const save = async (forceStatus) => {
    setLoading(true); setError('');
    try {
      if (supabase) {
        for (const item of items) {
          const aq = item.decision==='reject' ? 0 : Math.max(0, parseInt(item.approvedQty)||0);
          await supabase.from('requisition_items').update({ approved_qty:aq, note:item.itemNote||null }).eq('id',item.id);
        }
        let status = forceStatus;
        if (!status) {
          const allReject  = items.every(i=>i.decision==='reject');
          const allApprove = items.every(i=>i.decision==='approve');
          status = allReject?'rejected':allApprove?'approved':'partial';
        }
        await supabase.from('requisitions').update({ status, note:staffNote||requesterNote||null, updated_at:new Date().toISOString() }).eq('id',req.id);
        // Stock is updated via CSV import in แผนผังคลังยา, not deducted here
      }
      onDone();
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  };


  return (
    <>
      <style>{`@media print { .no-print{display:none!important} body{background:white;color:black;font-family:sans-serif} .print-card{background:white!important;border:1px solid #ccc!important;border-radius:8px;padding:12px;margin-bottom:8px} }`}</style>
      <div className="min-h-screen flex flex-col">
        <div className="no-print">
          <PageHeader onBack={onBack} title={currentReq.req_number} subtitle={`${currentReq.department} · ${currentReq.requester_name}`}>
            <button onClick={() => exportCSV([{ ...currentReq }], `${currentReq.req_number}.csv`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-white/70 text-white hover:bg-white/20 transition-colors text-sm font-semibold no-print">
              <Download size={16}/> โหลด CSV
            </button>
            <button onClick={() => printReq(currentReq)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-white/70 text-white hover:bg-white/20 transition-colors text-sm font-semibold no-print">
              <Printer size={16}/> พิมพ์
            </button>
          </PageHeader>
        </div>

        {/* Print header */}
        <div className="hidden print:block p-6 pb-2 text-black">
          <h2 className="text-xl font-bold">ใบเบิกยา</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-3 text-sm">
            <div>เลขที่: <strong>{currentReq.req_number}</strong></div>
            <div>วันที่: <strong>{new Date(currentReq.created_at).toLocaleDateString('th-TH',{dateStyle:'long'})}</strong></div>
            <div>หน่วยงาน: <strong>{currentReq.department}</strong></div>
            <div>ผู้เบิก: <strong>{currentReq.requester_name}</strong></div>
          </div>
          <hr className="mt-4 border-slate-300"/>
        </div>

        <div className="flex-1 p-4 space-y-3 pb-40">
          {items.map((item,i) => (
            <div key={item.id} className="print-card bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800">{i+1}. {item.drug_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">รหัส: {item.drug_code} · หน่วย: {item.drug_unit||'-'}</p>
                  <p className="text-sm mt-1 text-slate-600">ขอ: <span className="font-bold text-slate-800">{item.requested_qty}</span>{item.drug_unit && item.drug_unit !== '-' && <span className="text-slate-600"> × {item.drug_unit}</span>}</p>
                  {item.item_note && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mt-1">หมายเหตุจากผู้เบิก: {item.item_note}</p>}
                </div>
                {isPending && (
                  <div className="no-print flex flex-col gap-2 shrink-0 min-w-[160px]">
                    <div className="flex gap-1">
                      <button onClick={() => updateItem(i,'decision','approve')}
                        className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all border ${item.decision==='approve'?'bg-emerald-600 text-white border-emerald-600':'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                        <Check size={12}/> อนุมัติ
                      </button>
                      <button onClick={() => updateItem(i,'decision','reject')}
                        className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all border ${item.decision==='reject'?'bg-red-500 text-white border-red-500':'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                        <X size={12}/> ไม่อนุมัติ
                      </button>
                    </div>
                    {item.decision==='approve' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">จำนวน:</span>
                        <input type="number" min="0" value={item.approvedQty} onChange={e => updateItem(i,'approvedQty',e.target.value)}
                          className="w-20 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1E90FF]" />
                        <span className="text-xs text-slate-500">{item.drug_unit||''}</span>
                      </div>
                    )}
                    <input type="text" value={item.itemNote} onChange={e => updateItem(i,'itemNote',e.target.value)} placeholder="หมายเหตุ..."
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E90FF]" />
                  </div>
                )}
                {!isPending && item.approved_qty!=null && (
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${item.approved_qty>0?'text-emerald-600':'text-red-500'}`}>
                      {item.approved_qty>0?`✓ อนุมัติ ${item.approved_qty}`:'✗ ไม่อนุมัติ'}
                    </p>
                    {item.note && <p className="text-xs text-slate-400 mt-0.5">{item.note}</p>}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isPending && requesterNote && (
            <div className="no-print bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              <span className="font-semibold">หมายเหตุจากผู้เบิก:</span> {requesterNote}
            </div>
          )}
          {isPending && (
            <textarea value={staffNote} onChange={e => setStaffNote(e.target.value)} placeholder="หมายเหตุโดยรวมจากเจ้าหน้าที่..." rows={2}
              className="no-print w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E90FF] resize-none shadow-sm" />
          )}
          {error && <p className="no-print text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center gap-2"><AlertCircle size={14}/>{error}</p>}

          <div className="hidden print:block mt-12 text-sm text-black px-2">
            <div className="grid grid-cols-2 gap-16">
              <div className="text-center"><div className="border-t border-slate-400 pt-2 mt-16">ผู้เบิก<br/>({currentReq.requester_name})</div></div>
              <div className="text-center"><div className="border-t border-slate-400 pt-2 mt-16">เจ้าหน้าที่คลังยา</div></div>
            </div>
          </div>
        </div>

        {isPending && (
          <div className="no-print fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-slate-200">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => save(null)} disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 transition-all">
                <CheckCircle size={18}/>{loading?'กำลังบันทึก...':'อนุมัติ'}
              </button>
              <button onClick={() => save('rejected')} disabled={loading}
                className="bg-red-500 hover:bg-red-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 transition-all">
                <XCircle size={18}/> ไม่อนุมัติทั้งหมด
              </button>
            </div>
          </div>
        )}
        {isRejected && (
          <div className="no-print fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-slate-200 space-y-2">
            {!deleteConfirm ? (
              <button onClick={() => setDeleteConfirm(true)} disabled={loading}
                className="w-full bg-red-50 hover:bg-red-100 border border-red-300 text-red-600 rounded-xl py-3 font-semibold flex items-center justify-center gap-2 transition-all">
                <Trash2 size={18}/> ลบใบเบิกนี้ออกจากระบบ
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setDeleteConfirm(false)} disabled={loading}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-3 font-semibold flex items-center justify-center gap-2 transition-all">
                  <X size={16}/> ยกเลิก
                </button>
                <button onClick={handleDelete} disabled={loading}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 transition-all">
                  <Trash2 size={16}/> {loading ? 'กำลังลบ...' : 'ยืนยันลบ'}
                </button>
              </div>
            )}
            {error && <p className="text-red-600 text-sm text-center">{error}</p>}
          </div>
        )}
      </div>
    </>
  );
}
