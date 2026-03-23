import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase';
import {
  ArrowLeft, Search, Plus, Minus, Trash2, Send,
  CheckCircle, XCircle, Package, FileText,
  Printer, RefreshCcw, ChevronRight, Bell,
  Check, X, AlertCircle, Clock, Download,
} from 'lucide-react';

// ============================================================
// Config
// ============================================================
const STATUS_CONFIG = {
  pending:   { label: 'รอดำเนินการ',    badge: 'bg-amber-100  text-amber-700  border border-amber-300'   },
  approved:  { label: 'อนุมัติแล้ว',    badge: 'bg-green-100  text-green-700  border border-green-300'   },
  partial:   { label: 'อนุมัติบางส่วน', badge: 'bg-orange-100 text-orange-700 border border-orange-300'  },
  rejected:  { label: 'ไม่อนุมัติ',         badge: 'bg-red-100    text-red-700    border border-red-300'     },
  dispensed: { label: 'จ่ายยาแล้ว',     badge: 'bg-blue-100   text-blue-700   border border-blue-300'    },
};

const exportCSV = (reqs, filename) => {
  const rows = [
    ['เลขที่ใบเบิก','วันที่เบิก','log','รหัส','ชนิดยา','รายการยา','lot','exp','จำนวนที่เบิก','หน่วย','ราคา/หน่วย','หน่วยงานที่เบิก','หมายเหตุ']
  ];
  let logNo = 1;
  reqs.forEach(req => {
    const d = new Date(req.created_at);
    const pad = n => String(n).padStart(2,'0');
    const date = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
    (req.requisition_items || []).forEach(item => {
      rows.push([
        req.req_number,
        date,
        logNo++,
        item.drug_code || '-',
        item.drug_type || '-',
        item.drug_name,
        item.lot || '-',
        item.exp || '-',
        item.requested_qty,
        item.drug_unit || '-',
        item.price_per_unit || '-',
        req.department,
        item.item_note || req.note || '',
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
    <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3 flex items-center gap-3 shadow-sm">
      <button onClick={onBack} className="text-slate-500 hover:text-indigo-600 p-1 transition-colors">
        <ArrowLeft size={20} />
      </button>
      <div className="flex-1 min-w-0">
        {title    && <p className="font-semibold text-slate-800 truncate">{title}</p>}
        {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
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
export default function RequisitionApp({ onBack, prefilledUser = null, startAsStaff = false }) {
  const [view, setView] = useState(
    prefilledUser ? 'requester' :
    startAsStaff  ? 'staff'     :
    'home'
  );
  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans">
      {view === 'home'      && <HomeView      onSelect={setView} onBack={onBack} />}
      {view === 'requester' && <RequesterRoot onBack={() => prefilledUser ? onBack() : setView('home')} prefilledUser={prefilledUser} />}
      {view === 'staff'     && <StaffRoot     onBack={() => startAsStaff  ? onBack() : setView('home')} alreadyAuthed={startAsStaff} />}
    </div>
  );
}

// ============================================================
// Home (แสดงเมื่อเข้าผ่านปุ่มใน Dashboard โดยไม่มี prefilledUser)
// ============================================================
function HomeView({ onSelect, onBack }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 relative">
      <button onClick={onBack} className="absolute top-5 left-5 flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 text-sm transition-colors">
        <ArrowLeft size={16} /> กลับหน้าหลัก
      </button>
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-100 rounded-2xl mb-4">
          <Package size={40} className="text-indigo-600" />
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
          <div className="text-slate-500 text-sm mt-1">หน่วยงาน / แผนก</div>
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
function RequesterRoot({ onBack, prefilledUser }) {
  const [step, setStep] = useState(prefilledUser ? 'search' : 'login');
  const [info, setInfo] = useState(prefilledUser || null);
  const [cart, setCart] = useState([]);

  if (step === 'login')   return <RequesterLogin onLogin={v => { setInfo(v); setStep('search'); }} onBack={onBack} />;
  if (step === 'search')  return <DrugSearch info={info} cart={cart} setCart={setCart} onCart={() => setStep('cart')} onHistory={() => setStep('history')} onBack={onBack} />;
  if (step === 'cart')    return <CartView info={info} cart={cart} setCart={setCart} onBack={() => setStep('search')} onSubmitted={() => { setCart([]); setStep('history'); }} />;
  if (step === 'history') return <RequisitionHistory info={info} onBack={() => setStep('search')} />;
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
      <button onClick={onBack} className="absolute top-5 left-5 flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 text-sm transition-colors">
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
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">หน่วยงาน / แผนก</label>
            <select value={dept} onChange={e => setDept(e.target.value)} required
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white">
              <option value="">-- เลือกหน่วยงาน --</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <button type="submit" disabled={!name.trim() || !dept}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-3 font-semibold text-sm transition-all mt-2">
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
  const [q, setQ]             = useState('');
  const [results, setResults]  = useState([]);
  const [loading, setLoading]  = useState(false);
  const [qtyMap, setQtyMap]    = useState({});   // key = code+name+lot
  const [warnMap, setWarnMap]  = useState({});   // key = lotKey → warning msg
  const [drugNames, setDrugNames]   = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);

  const today = new Date(); today.setHours(0,0,0,0);
  const nearExpLimit = new Date(today); nearExpLimit.setMonth(nearExpLimit.getMonth() + 16); // 1 ปี 4 เดือน

  // Preload drug names for dropdown
  useEffect(() => {
    if (!supabase) return;
    supabase.from('inventory').select('name').then(({ data }) => {
      if (data) setDrugNames([...new Set(data.map(r => r.name).filter(Boolean))].sort());
    });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredSuggestions = q.trim()
    ? drugNames.filter(n => n.toLowerCase().includes(q.toLowerCase())).slice(0, 10)
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

      // Get supplier from drug_details (บริษัทปัจจุบัน) — more reliable than receive_logs
      const uniqueCodes = [...new Set(merged.map(r => r.code).filter(Boolean))];
      const supplierMap = {}; // "code|lot|invoice" → supplier (exact), "code|lot" → fallback
      if (uniqueCodes.length > 0) {
        const { data: dd } = await supabase.from('drug_details')
          .select('code, lot, invoice, data')
          .in('code', uniqueCodes);
        (dd || []).forEach(r => {
          const code = String(r.code || '').trim().toLowerCase();
          const lot  = String(r.lot  || '').trim().toLowerCase();
          const inv  = String(r.invoice || '').trim().toLowerCase();
          const k3 = `${code}|${lot}|${inv}`;
          const k2 = `${code}|${lot}`;
          const entry = {
            supplier: r.data?.['บริษัทปัจจุบัน'] || r.data?.['บริษัท'] || r.data?.['supplier_current'] || r.data?.['supplier'] || '',
            price:    r.data?.['ราคาต่อหน่วย(บาท)'] || r.data?.['ราคาต่อหน่วย'] || r.data?.['ราคา/หน่วย'] || r.data?.['price_per_unit'] || '',
            drugType: r.data?.['รูปแบบ'] || r.data?.['ชนิด'] || r.data?.['drug_type'] || r.data?.['type'] || '',
          };
          if (!supplierMap[k3]) supplierMap[k3] = entry;
          if (!supplierMap[k2]) supplierMap[k2] = entry;
        });
      }

      const getDetail = (row) => {
        const code = String(row.code    || '').trim().toLowerCase();
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
          grouped[key].availableQty += rowQty;
        }
        const detail = getDetail(row);
        grouped[key].lots.push({ lot: row.lot, exp: row.exp, qty: rowQty, rawQty: row.qty, unit: row.unit, location: row.location, invoice: row.invoice, supplier: detail.supplier || '', price: detail.price || '', drugType: detail.drugType || '', pending: isPending, expired: isExpired });
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
      setResults(result);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(q), 350);
    return () => clearTimeout(t);
  }, [q, search]);

  const addToCart = (drug, lot, qty, lotKey) => {
    const requested = parseInt(qty) || 1;
    if (requested > lot.qty) {
      setWarnMap(p => ({ ...p, [lotKey]: `คงเหลือไม่พอ — มีเพียง ${lot.qty} ${lot.unit || drug.unit || ''} เลือกจำนวนใหม่` }));
      return;
    }
    setWarnMap(p => { const n = { ...p }; delete n[lotKey]; return n; });
    const safeQty = Math.max(1, requested);
    setCart(prev => {
      const idx = prev.findIndex(i => i.code === drug.code && i.name === drug.name);
      if (idx >= 0) {
        const newQty = prev[idx].requestedQty + safeQty;
        if (newQty > drug.availableQty) {
          setWarnMap(p => ({ ...p, [lotKey]: `รวมในตะกร้าแล้ว ${prev[idx].requestedQty} — คงเหลือรวมไม่พอ (มี ${drug.availableQty}) เลือกจำนวนใหม่` }));
          return prev;
        }
        const u = [...prev]; u[idx] = { ...u[idx], requestedQty: newQty }; return u;
      }
      return [...prev, { code: drug.code, name: drug.name, unit: lot.unit, lot: lot.lot, exp: lot.exp, price: lot.price, drugType: lot.drugType, availableQty: drug.availableQty, lotRawQty: lot.rawQty ?? lot.qty, requestedQty: safeQty, note: '' }];
    });
    setQtyMap(p => ({ ...p, [lotKey]: 1 }));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader onBack={onBack} title={info.name} subtitle={info.department}>
        <button onClick={onHistory} className="text-slate-500 hover:text-indigo-600 transition-colors p-2"><FileText size={20} /></button>
        <button onClick={onCart} className="relative bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-3 py-2 flex items-center gap-1.5 transition-colors">
          <Package size={18} /><span className="text-sm font-semibold">ตะกร้า</span>
          {cart.length > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{cart.length}</span>}
        </button>
      </PageHeader>

      <div className="p-4 space-y-2">
        {results.length > 0 && (
          <button onClick={() => search(q)}
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
            <RefreshCcw size={14} /> อัพเดตคงเหลือใหม่
          </button>
        )}
        <div className="relative" ref={searchRef}>
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={q}
            onChange={e => { setQ(e.target.value); setShowDropdown(true); }}
            onFocus={() => { if (q.trim()) setShowDropdown(true); }}
            placeholder="ค้นหายาด้วยชื่อหรือรหัสยา..." autoFocus
            className="w-full bg-white border border-slate-300 rounded-xl pl-11 pr-10 py-3.5 text-slate-800 placeholder-slate-400 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm" />
          {q && <button onClick={() => { setQ(''); setResults([]); }} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={18} /></button>}
          {showDropdown && filteredSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
              {filteredSuggestions.map(name => (
                <button key={name} onMouseDown={e => { e.preventDefault(); setQ(name); setShowDropdown(false); }}
                  className="w-full text-left px-4 py-3 text-base text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors border-b border-slate-100 last:border-0">
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 pb-6 space-y-3">
        {loading && <p className="text-center text-slate-500 py-10">กำลังค้นหา...</p>}
        {!loading && q && results.length === 0 && <p className="text-center text-slate-500 py-10">ไม่พบยาที่ค้นหา</p>}
        {!q && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Search size={48} className="mb-3 opacity-30" /><p>พิมพ์ชื่อยาหรือรหัสยาเพื่อค้นหา</p>
          </div>
        )}
        {results.map(drug => {
          const drugKey = drug.code + drug.name;
          const inCart = cart.find(i => i.code === drug.code && i.name === drug.name);
          return (
            <div key={drugKey} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              {/* Drug header */}
              <div className="px-4 py-4 bg-slate-50 border-b border-slate-100">
                <p className="font-bold text-xl text-slate-800">{drug.name}</p>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <p className="text-base text-slate-500">รหัส: {drug.code}</p>
                  {inCart && <span className="text-base text-indigo-600 font-semibold">ในตะกร้า: {inCart.requestedQty}</span>}
                </div>
              </div>

              {/* Lot rows */}
              {drug.lots.map((lot, li) => {
                const lotKey = drugKey + lot.lot;
                const expDate = parseExp(lot.exp);
                const isExpired = lot.expired;
                const nearExp = !isExpired && expDate && expDate <= nearExpLimit;
                const isPending = lot.pending;
                const canAdd = !isPending && !isExpired && lot.qty > 0;

                let rowBg = 'border-b border-slate-100 last:border-0';
                if (isPending) rowBg = 'bg-sky-50/60 border-b border-sky-200 border-dashed last:border-0';
                else if (isExpired) rowBg = 'bg-rose-50 border-b border-rose-100 last:border-0';
                else if (nearExp) rowBg = 'bg-amber-50 border-b border-amber-100 last:border-0';

                return (
                  <div key={li} className={`flex items-center gap-3 px-4 py-4 ${rowBg}`}>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className={`text-base font-bold ${isPending ? 'text-sky-700' : isExpired ? 'text-rose-700' : nearExp ? 'text-amber-700' : 'text-slate-700'}`}>Lot: {lot.lot || '-'}</span>
                        {lot.invoice && lot.invoice !== '-' && (
                          <span className="text-base text-slate-500">บิล: {lot.invoice}</span>
                        )}
                        <span className={`text-base font-bold ${isExpired ? 'text-rose-700' : nearExp ? 'text-amber-700' : 'text-emerald-700'}`}>
                          Exp: {fmtExp(lot.exp)}
                          {(isExpired || nearExp) && ' ⚠️'}
                        </span>
                        <span className="text-base text-emerald-700 font-semibold">คงเหลือ: {lot.rawQty ?? lot.qty}×{lot.unit || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 text-sm font-bold border border-sky-200">
                            <Package size={13} /> รอตรวจรับ
                          </span>
                        )}
                        {isExpired && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-sm font-bold border border-rose-200">
                            <AlertCircle size={13} /> หมดอายุแล้ว
                          </span>
                        )}
                        {nearExp && !isExpired && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-bold border border-amber-200">
                            <Clock size={13} /> ใกล้หมดอายุ
                          </span>
                        )}
                        {lot.drugType && lot.drugType !== '-' && <span className="text-base font-medium text-indigo-600">💊 {lot.drugType}</span>}
                        {lot.supplier && <span className="text-base font-medium text-slate-600">🏢 {lot.supplier}</span>}
                        {lot.location && lot.location !== '-' && <span className="text-base text-slate-400">📍 {lot.location}</span>}
                      </div>
                    </div>
                    {canAdd ? (
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="flex items-center gap-2">
                          <input type="number" min="1" max={lot.qty}
                            value={qtyMap[lotKey] ?? 1}
                            onChange={e => {
                              setQtyMap(p => ({ ...p, [lotKey]: e.target.value }));
                              setWarnMap(p => { const n = { ...p }; delete n[lotKey]; return n; });
                            }}
                            className={`w-20 bg-white border rounded-lg px-2 py-2 text-slate-800 text-center text-base font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400 ${warnMap[lotKey] ? 'border-red-400 bg-red-50' : 'border-slate-300'}`} />
                          <button onClick={() => addToCart(drug, lot, qtyMap[lotKey] ?? 1, lotKey)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 text-base font-bold flex items-center gap-1.5 transition-colors">
                            <Plus size={16} /> เพิ่ม
                          </button>
                        </div>
                        {warnMap[lotKey] && (
                          <p className="text-sm text-red-600 font-medium text-right max-w-[220px]">⚠️ {warnMap[lotKey]}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400 shrink-0 italic">
                        {isPending ? 'รอตรวจรับ' : isExpired ? 'หมดอายุ' : 'ไม่มีสต็อก'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Cart ----
function CartView({ info, cart, setCart, onBack, onSubmitted }) {
  const [note, setNote]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const updateQty   = (i, v) => setCart(p => { const u=[...p]; u[i]={...u[i], requestedQty: Math.min(Math.max(1, parseInt(v)||1), u[i].availableQty || 99999)}; return u; });
  const updateNote  = (i, v) => setCart(p => { const u=[...p]; u[i]={...u[i], note: v}; return u; });

  const submit = async () => {
    if (!cart.length) return;
    const overLimit = cart.find(item => item.availableQty && item.requestedQty > item.availableQty);
    if (overLimit) { setError(`จำนวนที่ขอเกินคงเหลือ: ${overLimit.name} (คงเหลือ ${overLimit.availableQty})`); return; }
    setLoading(true); setError('');
    try {
      if (supabase) {
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
            lot:            item.lot || null,
            exp:            item.exp || null,
            price_per_unit: item.price || null,
            requested_qty:  item.requestedQty,
            item_note:      item.note?.trim() || null,
          }))
        );
        if (e2) throw e2;
      }
      onSubmitted();
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

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
                </div>
                <div className="flex items-center gap-2 shrink-0 mt-1">
                  <button onClick={() => updateQty(i, item.requestedQty-1)} className="bg-slate-100 hover:bg-slate-200 rounded-lg p-2 transition-colors"><Minus size={16} /></button>
                  <input type="number" min="1" value={item.requestedQty} onChange={e => updateQty(i, e.target.value)}
                    className="w-16 bg-slate-50 border border-slate-300 rounded-lg px-2 py-2 text-slate-800 text-center text-base font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <button onClick={() => updateQty(i, item.requestedQty+1)} disabled={item.availableQty != null && item.requestedQty >= item.availableQty}
                    className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg p-2 transition-colors"><Plus size={16} /></button>
                  <button onClick={() => setCart(p => p.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-600 p-2 transition-colors"><Trash2 size={18} /></button>
                </div>
              </div>
              <div className="px-4 pb-4">
                <input type="text" value={item.note || ''} onChange={e => updateNote(i, e.target.value)}
                  placeholder="หมายเหตุรายการนี้..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder-slate-400 text-base focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              </div>
            </div>
          ))
        }
        {cart.length > 0 && (
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="หมายเหตุ (ถ้ามี)..." rows={2}
            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none mt-2" />
        )}
        {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center gap-2"><AlertCircle size={14}/>{error}</p>}
      </div>
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-slate-200">
          <button onClick={submit} disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-3.5 font-semibold flex items-center justify-center gap-2 transition-all">
            <Send size={18} />{loading ? 'กำลังส่งใบเบิก...' : `ส่งใบเบิก (${cart.length} รายการ)`}
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Requisition History ----
function RequisitionHistory({ info, onBack }) {
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

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
        <button onClick={load} className="text-slate-500 hover:text-indigo-600 p-1 transition-colors"><RefreshCcw size={18} /></button>
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
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.badge}`}>{cfg.label}</span>
                  <ChevronRight size={16} className={`text-slate-400 transition-transform ${expanded===req.id?'rotate-90':''}`} />
                </div>
              </button>
              {expanded===req.id && (
                <div className="border-t border-slate-100 p-4 space-y-2 bg-slate-50">
                  {req.requisition_items?.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-sm gap-2">
                      <div className="min-w-0"><span className="text-slate-800">{item.drug_name}</span><span className="text-slate-400 ml-1.5">({item.drug_unit||'-'})</span></div>
                      <div className="text-right shrink-0">
                        <span className="text-slate-500">ขอ {item.requested_qty}</span>
                        {item.approved_qty!=null && (
                          <span className={`ml-2 font-semibold ${item.approved_qty>0?'text-emerald-600':'text-red-500'}`}>
                            → {item.approved_qty>0?`อนุมัติ ${item.approved_qty}`:'ไม่อนุมัติ'}
                          </span>
                        )}
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
function StaffRoot({ onBack, alreadyAuthed = false }) {
  const [authed, setAuthed]     = useState(alreadyAuthed);
  const [selected, setSelected] = useState(null);

  if (!authed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 relative">
        <button onClick={onBack} className="absolute top-5 left-5 flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 text-sm transition-colors">
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
  return <StaffDashboard onLogout={() => alreadyAuthed ? onBack() : setAuthed(false)} onSelect={setSelected} />;
}

// ---- Staff Dashboard ----
function StaffDashboard({ onLogout, onSelect }) {
  const [list, setList]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('pending');
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [deleteId, setDeleteId] = useState(null); // id รอยืนยันลบ

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (deleteId !== id) { setDeleteId(id); return; }
    await supabase.from('requisition_items').delete().eq('requisition_id', id);
    await supabase.from('requisitions').delete().eq('id', id);
    setDeleteId(null);
    setList(prev => prev.filter(r => r.id !== id));
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

  const filtered = list.filter(r => {
    const statusMatch = filter === 'all' || r.status === filter;
    const dateMatch = !dateFilter || (r.created_at && r.created_at.slice(0, 10) === dateFilter);
    return statusMatch && dateMatch;
  });

  const tabs = [
    { key:'pending',   label:'รอดำเนินการ' },
    { key:'approved',  label:'อนุมัติแล้ว'  },
    { key:'rejected',  label:'ไม่อนุมัติ'       },
    { key:'all',       label:'ทั้งหมด'      },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader onBack={onLogout} title="ใบเบิกยา">
        {pendingCount>0 && (
          <span className="flex items-center gap-1 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            <Bell size={11}/> {pendingCount}
          </span>
        )}
        <button onClick={load} className="text-slate-500 hover:text-indigo-600 p-1 transition-colors"><RefreshCcw size={18}/></button>
      </PageHeader>

      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-100">
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <button onClick={() => setDateFilter('')}
          className={`text-xs px-2 py-1 rounded-lg border transition-colors ${!dateFilter ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'text-slate-500 border-slate-300 hover:bg-slate-100'}`}>
          ทั้งหมด
        </button>
        <button onClick={() => exportCSV(filtered, `ใบเบิกยา_${new Date().toISOString().slice(0,10)}.csv`)}
          className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg px-3 py-1 text-sm font-medium transition-colors">
          <Download size={16}/> Export CSV
        </button>
      </div>

      <div className="flex gap-1 px-3 py-2.5 bg-white border-b border-slate-200 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => { setFilter(tab.key); setDeleteId(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap font-medium transition-all ${
              filter===tab.key ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}>
            {tab.label}
            {tab.key==='pending' && pendingCount>0 && (
              <span className="bg-amber-500 text-white text-xs font-bold rounded-full px-1.5">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 space-y-3">
        {loading && <p className="text-center text-slate-500 py-10">กำลังโหลด...</p>}
        {!loading && filtered.length===0 && <p className="text-center text-slate-500 py-20">ไม่มีรายการ</p>}
        {filtered.map(req => {
          const cfg = STATUS_CONFIG[req.status]||STATUS_CONFIG.pending;
          const confirming = deleteId === req.id;
          return (
            <div key={req.id} className="bg-white border border-slate-200 rounded-xl shadow-sm flex items-stretch overflow-hidden">
              <button onClick={() => onSelect(req)}
                className="flex-1 p-4 text-left flex items-start justify-between gap-3 hover:bg-slate-50 transition-colors">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-slate-400">{req.req_number}</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{req.department}</p>
                  <p className="text-sm text-slate-500">ผู้เบิก: {req.requester_name}</p>
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
  const isPending    = req.status==='pending';
  const isApproved   = req.status==='approved'||req.status==='partial';
  const isRejected   = req.status==='rejected';

  const [items, setItems] = useState(
    (req.requisition_items||[]).map(item => ({
      ...item,
      decision:   item.approved_qty!=null?(item.approved_qty>0?'approve':'reject'):'approve',
      approvedQty: item.approved_qty??item.requested_qty,
      itemNote:   item.note||'',
    }))
  );
  const [staffNote, setStaffNote] = useState(req.note||'');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

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
        await supabase.from('requisitions').update({ status, note:staffNote||null, updated_at:new Date().toISOString() }).eq('id',req.id);
        // Stock is updated via CSV import in แผนผังคลังยา, not deducted here
      }
      onDone();
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  };

  const deductStock = async (approvedItems) => {
    const today = new Date().toISOString().slice(0,10);
    for (const item of approvedItems) {
      if (item.decision==='reject') continue;
      const deductAmt = parseInt(item.approvedQty)||0;
      if (deductAmt<=0) continue;
      const { data:invRows } = await supabase.from('inventory').select('*').eq('code',item.drug_code).order('exp');
      if (!invRows?.length) continue;
      let remaining = deductAmt;
      for (const row of invRows) {
        if (remaining<=0) break;
        const rowQty = parseFloat(row.qty)||0;
        if (rowQty<=0) continue;
        const take = Math.min(rowQty,remaining);
        const qtyAfter = rowQty-take;
        await supabase.from('inventory').update({ qty:String(qtyAfter), updated_at:new Date().toISOString() }).eq('id',row.id);
        await supabase.from('dispense_logs').insert({
          dispense_date:today, main_log:'REQ', detail_log:req.req_number,
          department:req.department, note:`ผู้เบิก: ${req.requester_name}`,
          drug_code:item.drug_code, drug_name:item.drug_name,
          drug_type:row.type||'-', drug_unit:item.drug_unit||row.unit||'-',
          lot:row.lot||'-', exp:row.exp||'-',
          qty_before:rowQty, qty_out:take, qty_after:qtyAfter,
          requisition_id:req.id, requisition_number:req.req_number, source:'online',
        });
        remaining -= take;
      }
    }
  };

  return (
    <>
      <style>{`@media print { .no-print{display:none!important} body{background:white;color:black;font-family:sans-serif} .print-card{background:white!important;border:1px solid #ccc!important;border-radius:8px;padding:12px;margin-bottom:8px} }`}</style>
      <div className="min-h-screen flex flex-col">
        <div className="no-print">
          <PageHeader onBack={onBack} title={req.req_number} subtitle={`${req.department} · ${req.requester_name}`}>
            <button onClick={() => exportCSV([{ ...req }], `${req.req_number}.csv`)} className="text-slate-500 hover:text-indigo-600 p-2 transition-colors">
              <Download size={20}/>
            </button>
            <button onClick={() => window.print()} className="text-slate-500 hover:text-indigo-600 p-2 transition-colors"><Printer size={20}/></button>
          </PageHeader>
        </div>

        {/* Print header */}
        <div className="hidden print:block p-6 pb-2 text-black">
          <h2 className="text-xl font-bold">ใบเบิกยา</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-3 text-sm">
            <div>เลขที่: <strong>{req.req_number}</strong></div>
            <div>วันที่: <strong>{new Date(req.created_at).toLocaleDateString('th-TH',{dateStyle:'long'})}</strong></div>
            <div>หน่วยงาน: <strong>{req.department}</strong></div>
            <div>ผู้เบิก: <strong>{req.requester_name}</strong></div>
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
                  <p className="text-sm mt-1 text-slate-600">ขอ: <span className="font-bold text-slate-800">{item.requested_qty} {item.drug_unit||''}</span></p>
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
                          className="w-20 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <span className="text-xs text-slate-500">{item.drug_unit||''}</span>
                      </div>
                    )}
                    <input type="text" value={item.itemNote} onChange={e => updateItem(i,'itemNote',e.target.value)} placeholder="หมายเหตุ..."
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
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

          {isPending && (
            <textarea value={staffNote} onChange={e => setStaffNote(e.target.value)} placeholder="หมายเหตุโดยรวมจากเจ้าหน้าที่..." rows={2}
              className="no-print w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none shadow-sm" />
          )}
          {error && <p className="no-print text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center gap-2"><AlertCircle size={14}/>{error}</p>}

          <div className="hidden print:block mt-12 text-sm text-black px-2">
            <div className="grid grid-cols-2 gap-16">
              <div className="text-center"><div className="border-t border-slate-400 pt-2 mt-16">ผู้เบิก<br/>({req.requester_name})</div></div>
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
        {isApproved && (
          <div className="no-print fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-slate-200">
            <button onClick={() => save('dispensed')} disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-3.5 font-semibold flex items-center justify-center gap-2 transition-all">
              <Package size={18}/>{loading?'กำลังบันทึก...':'ยืนยันจ่ายยา (ตัดยอดสต็อก)'}
            </button>
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
