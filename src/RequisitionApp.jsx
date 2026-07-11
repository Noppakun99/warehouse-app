import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from './lib/supabase';
import SearchableSelect from './SearchableSelect';
import {
  ArrowLeft, Search, Plus, Minus, Trash2, Send, Pencil,
  CheckCircle, XCircle, Package, FileText,
  Printer, RefreshCcw, ChevronRight, Bell,
  Check, X, AlertCircle, Clock, FileDown,
  SlidersHorizontal, MapPin,
} from 'lucide-react';
import { exportToExcel } from './lib/exportExcel';
import { parseUnit } from './lib/unitParser';
import { allocateFefo } from './lib/lotAllocation';
import { deleteRequesterRequisition, updateRequesterRequisition, insertAuditLog, resolveAuditUserName, startPickingRequisition, verifyRequisition, markRequisitionDispensed, confirmReceivedRequisition, fetchInventoryByCodes, fetchLastInventoryImportAt } from './lib/db';
import DrugSearchBar from './DrugSearchBar';

// ============================================================
// Config
// ============================================================
// Drug type badge colors
// normalize code สำหรับ match — ตัด leading zeros, lowercase, แก้ scientific notation
function IsoDateInput({ value, onChange, className = '', ring = 'focus-within:ring-[#1E90FF]' }) {
  const display = iso => { if (!iso) return null; const [y,m,d] = iso.split('-'); return `${d}/${m}/${Number(y)+543}`; }
  return (
    <div className={`relative flex items-center bg-white border border-slate-300 rounded-xl focus-within:ring-2 ${ring} ${className}`}>
      <span className={`px-3 py-2 text-sm w-full select-none pointer-events-none ${value ? 'text-slate-800' : 'text-slate-400'}`}>{display(value) || 'dd/mm/yyyy'}</span>
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
        onClick={e => { try { e.currentTarget.showPicker?.() } catch { /* noop */ } }}
        className="absolute inset-0 opacity-0 w-full cursor-pointer" />
    </div>
  )
}

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

const RefreshCtx = React.createContext(null);

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
  rejected:  { label: 'ไม่อนุมัติ',     badge: 'bg-red-100    text-red-700    border border-red-300'     },
  picking:   { label: 'กำลังจัดยา',    badge: 'bg-purple-100 text-purple-700 border border-purple-300'  },
  ready:     { label: 'รอตรวจนับ',     badge: 'bg-indigo-100 text-indigo-700 border border-indigo-300'  },
  dispensed: { label: 'จ่ายยาแล้ว',    badge: 'bg-blue-100   text-blue-700   border border-blue-300'    },
  received:  { label: 'รับยาแล้ว',     badge: 'bg-teal-100   text-teal-700   border border-teal-300'    },
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
  { header: 'ราคา/หน่วย',       value: (r) => r._alloc?.price_per_unit ?? r._item?.price_per_unit ?? '' },
  { header: 'Lot Number',         value: (r) => r._alloc?.lot ?? r._item?.picked_lot ?? r._item?.lot ?? '' },
  { header: 'Exp',                value: (r) => r._alloc?.exp ?? r._item?.picked_exp ?? r._item?.exp ?? '' },
  { header: 'ชนิดรายการ',        value: (r) => r._item?._item_type_ref || '' },
  { header: 'คงเหลือก่อนเบิก',  value: (r) => r._before ?? '' },
  { header: 'ปริมาณ (ออก)',      value: (r) => r._out ?? '' },
  { header: 'คงเหลือหลังจ่าย',  value: (r) => r._after ?? '' },
  { header: 'หน่วยงานที่เบิก',  value: (r) => r.department || '' },
  { header: 'หมายเหตุ',          value: (r) => [r._item?.item_note, r._item?.staff_note].filter(Boolean).join(' ') || r.note || '' },
];

// คำนวณ allocation ต่อ item.id สำหรับ print/Excel:
//   จัดแล้ว → ใช้ picked_allocation (lot จริงที่จ่าย)
//   ยังไม่จัด → คำนวณ FEFO สดจาก inventory (preview ว่าจะได้ lot ไหน) + เติมราคาราย lot จาก receive_logs
// คืน { allocByItem: {id: [{lot,exp,base,packs,price_per_unit}]}, priceMap, logMap }
async function computeReqAllocations(reqs) {
  const allItems = reqs.flatMap(r => r.requisition_items || []);
  const codes = [...new Set(allItems.map(i => i.drug_code).filter(Boolean))];
  const logMap = {}, priceMap = {}, fefoByCode = {};
  // สำหรับหมายเหตุอัตโนมัติในใบ lot คุม (ดู CONTEXT.md §ใบ lot คุม)
  const pendingCodes = new Set();        // รหัสที่มีบิลรอตรวจรับ (จาก receive_logs — แหล่งเดียวกับ flow ค้นยาตอนเบิก)
  const discontinuedCodes = new Set();   // รหัสที่ตัดออกจากบัญชี (inventory.receive_status — precedent เดียวกับ Dashboard)
  const supplierChangedLots = new Set(); // "code|lot" ที่บิลรับ flag เปลี่ยนบริษัท
  if (supabase && codes.length) {
    // ไม่ filter qty>0 ที่ SQL — ต้องเห็นแถว qty=0/ตัดออก เพื่อ status map; FEFO มี guard packs>0 อยู่แล้ว
    const [{ data: inv }, { data: rl }] = await Promise.all([
      supabase.from('inventory').select('code, lot, exp, qty, unit, main_log, location, item_type, receive_status').in('code', codes).limit(3000),
      supabase.from('receive_logs').select('drug_code, lot, price_per_unit, receive_status, supplier_changed').in('drug_code', codes).limit(5000),
    ]);
    (inv || []).forEach(r => {
      const code = String(r.code||'').trim();
      const key = `${code}|${String(r.lot||'').trim()}`;
      if (!logMap[key]) logMap[key] = { main_log: r.main_log || '', detail_log: r.location || '', item_type: r.item_type || '' };
      if (String(r.receive_status || '').includes('ตัดออก')) discontinuedCodes.add(code);
      const { packSize } = parseUnit(r.unit);
      const packs = parseFloat(r.qty) || 0;
      if (packs > 0) (fefoByCode[code] = fefoByCode[code] || []).push({ lot: r.lot, exp: r.exp, unit: r.unit, location: r.location, packSize: packSize || 1, packs, base: packs * (packSize || 1) });
    });
    Object.values(fefoByCode).forEach(lots => lots.sort((a, b) => {
      const da = parseExp(a.exp), db = parseExp(b.exp);
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
      return da - db;
    }));
    (rl || []).forEach(r => {
      const code = String(r.drug_code||'').trim();
      const key = `${code}|${String(r.lot||'').trim()}`;
      if (priceMap[key] == null && r.price_per_unit != null) priceMap[key] = r.price_per_unit;
      if (String(r.receive_status || '').includes('รอ')) pendingCodes.add(code);
      if (r.supplier_changed) supplierChangedLots.add(key);
    });
  }
  const withPrice = (code, a) => {
    const key = `${String(code||'').trim()}|${String(a.lot||'').trim()}`;
    // location: ใช้ของ allocation ถ้ามี (FEFO สด) ไม่งั้น backfill จาก logMap (picked_allocation เก่าไม่ได้เก็บที่เก็บ)
    return { ...a, price_per_unit: a.price_per_unit ?? priceMap[key] ?? null, location: a.location ?? logMap[key]?.detail_log ?? null };
  };
  // คงเหลือสดรวมต่อรหัสยา (หน่วยย่อยสุด) — ใช้คำนวณ "คงเหลือหลังจ่าย" ในใบพิมพ์
  const onHandByCode = {};
  // คงเหลือสดราย lot (หน่วยย่อยสุด) key = "code|lot" — ใบพิมพ์แสดงคงเหลือหลังจ่ายราย lot
  const onHandByLot = {};
  Object.entries(fefoByCode).forEach(([code, lots]) => {
    onHandByCode[code] = lots.reduce((s, l) => s + l.base, 0);
    lots.forEach(l => {
      const key = `${code}|${String(l.lot || '').trim()}`;
      onHandByLot[key] = (onHandByLot[key] || 0) + l.base;
    });
  });
  const allocByItem = {};
  allItems.forEach(item => {
    if (Array.isArray(item.picked_allocation) && item.picked_allocation.length) {
      allocByItem[item.id] = item.picked_allocation.map(a => withPrice(item.drug_code, a));
    } else {
      const wantQty = item.approved_qty ?? item.requested_qty ?? 0;
      const lots = fefoByCode[String(item.drug_code||'').trim()];
      if (wantQty > 0 && lots && lots.length) {
        allocByItem[item.id] = allocateFefo(wantQty, lots).allocation.map(a => withPrice(item.drug_code, a));
      }
    }
  });
  return { allocByItem, priceMap, logMap, onHandByCode, onHandByLot, pendingCodes, discontinuedCodes, supplierChangedLots };
}

// แปลง list ของ requisitions → flat rows สำหรับ Excel
// 1 item → หลาย row ถ้าจ่ายข้าม lot (picked_allocation); ไม่มี allocation → 1 row
const flattenReqs = (reqs, allocByItem = {}) =>
  reqs.flatMap(req =>
    (req.requisition_items?.length ? req.requisition_items : [{}]).flatMap(item => {
      const alloc = allocByItem[item.id] || (Array.isArray(item.picked_allocation) ? item.picked_allocation : null);
      if (alloc && alloc.length) return alloc.map(a => ({ ...req, _item: item, _alloc: a }));
      return [{ ...req, _item: item, _alloc: null }];
    })
  );

// Export Excel — เติม lot/exp/ราคา/main_log ตามที่จ่าย (จัดแล้ว) หรือ FEFO สด (ยังไม่จัด)
// คงเหลือก่อนเบิก/หลังจ่าย + ปริมาณออก ใช้ logic เดียวกับใบ lot คุม (lotBeforeAfter) — เลขต้องตรงกัน (Rule #6)
async function exportReqExcel(reqs, auth) {
  const { allocByItem, logMap, onHandByLot } = await computeReqAllocations(reqs);
  const lastImportAt = await fetchLastInventoryImportAt();
  const flat = flattenReqs(reqs, allocByItem);
  const lotOf = (r) => String(r._alloc?.lot || r._item?.picked_lot || r._item?.lot || '').trim();
  const enriched = flat.map(r => {
    const key = `${String(r._item?.drug_code||'').trim()}|${lotOf(r)}`;
    const ref = logMap[key] || {};
    // ไม่มี allocation และไม่มี lot ที่จัด = จ่าย 0 (ห้ามใช้ยอดที่ขอเป็นยอดออก)
    const out = r._alloc?.base ?? (lotOf(r) ? (r._item?.picked_qty ?? r._item?.approved_qty ?? r._item?.requested_qty ?? 0) : 0);
    const { before, after } = lotBeforeAfter(r, r._item?.drug_code, lotOf(r), out, r._alloc?.onhand ?? null, onHandByLot, lastImportAt);
    return { ...r, _out: out, _before: before, _after: after, _item: { ...r._item, _main_log: ref.main_log || '', _detail_log: ref.detail_log || '', _item_type_ref: ref.item_type || r._item?.item_type || '' } };
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
// Helpers
// ============================================================
const timeAgo = (dateStr) => {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'เพิ่งส่งมา';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
  return `${Math.floor(hrs / 24)} วันที่แล้ว`;
};

const drugPreview = (items) => {
  if (!items?.length) return 'ไม่มีรายการ';
  const names = items.slice(0, 2).map(i => i.drug_name).filter(Boolean);
  const extra = items.length > 2 ? ` +${items.length - 2} รายการ` : '';
  return `${items.length} รายการ: ${names.join(', ')}${extra}`;
};

// ============================================================
// Shared: sticky page header
// ============================================================
function PageHeader({ onBack, title, subtitle, children }) {
  const onRefresh = React.useContext(RefreshCtx);
  return (
    <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
      <button onClick={onBack} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors">
        <ArrowLeft size={20} />
      </button>
      <div
        className={`flex-1 min-w-0${onRefresh ? ' hover:opacity-70 transition-opacity cursor-pointer' : ''}`}
        onClick={onRefresh}
      >
        {title    && <p className="font-bold text-slate-800 truncate text-lg leading-tight">{title}</p>}
        {subtitle && <p className="text-slate-500 truncate text-sm">{subtitle}</p>}
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
export default function RequisitionApp({ onBack, onRefresh, prefilledUser = null, startAsStaff = false, initialStep = null, auth = {} }) {
  const [view, setView] = useState(
    startAsStaff  ? 'staff'     :
    prefilledUser ? 'requester' :
    'home'
  );
  return (
    <RefreshCtx.Provider value={onRefresh}>
      <div className="min-h-screen text-slate-800 font-sans" style={{background:'#F0F8FF'}}>
        {view === 'home'      && <HomeView      onSelect={setView} onBack={onBack} />}
        {view === 'requester' && <RequesterRoot onBack={() => prefilledUser ? onBack() : setView('home')} prefilledUser={prefilledUser} initialStep={initialStep} auth={auth} />}
        {view === 'staff'     && <StaffRoot     onBack={() => startAsStaff  ? onBack() : setView('home')} alreadyAuthed={startAsStaff} auth={auth} />}
      </div>
    </RefreshCtx.Provider>
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
    'เทศบาลนครรังสิต',
    'ทดลองระบบ',
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

// marker นำหน้าบรรทัดหมายเหตุที่ระบบเติมอัตโนมัติ (จ่ายเกิน) — ใช้หา/ตัดออกกัน duplicate ตอน save ซ้ำ
const MARK_OVER = '[จ่ายเกิน]';

// วลีหมายเหตุคลังที่ใช้บ่อย (จาก vocabulary ใบจริงของคลัง) — chip กดเติมลง staff_note ตอนจัดยา แก้ข้อความต่อได้
// (เคส "รอตรวจรับ/ยาหมดรอของส่ง/เปลี่ยนบริษัท/มีXlot/ใกล้exp" ระบบเติมอัตโนมัติในใบ lot คุม ไม่ต้องมี chip)
const STAFF_NOTE_PRESETS = ['จ่ายlotเก่าให้หมด', 'ตัดยอดยาเสพติด', 'รถกู้ชีพ', 'เบิกห้องยา'];

// ข้อความ pre-printed บนใบปะหน้า "ใบเบิกเวชภัณฑ์ยา" (ฟอร์มราชการ) — ตามฟอร์มกระดาษจริงของ รพ.
// เปลี่ยนผู้รับผิดชอบ/ชื่อ รพ. → แก้ที่นี่จุดเดียว
const COVER_FORM = {
  hospital:  'โรงพยาบาลประชาธิปัตย์',
  dispenser: { name: 'นายนพคุณ อายุขุนทด', role: 'เจ้าหน้าที่คลังยาเวชภัณฑ์', position: 'เจ้าพนักงานเภสัชกรรมปฏิบัติงาน' },
  approver:  { name: 'นางสาวสุขาวดี กิตติณิชกุล', role: 'หัวหน้าหน่วยพัสดุยา', position: 'เภสัชกรปฏิบัติการ' },
  requesterHead: { position: 'เภสัชกรชำนาญการ', group: 'หัวหน้ากลุ่มงาน เภสัชกรรมและคุ้มครองผู้บริโภค' },
};

// lot ใกล้หมดอายุ = exp ภายใน 16 เดือนนับจากวันนี้ (เกณฑ์เดียวกับหน้าแผนผังคลัง App.jsx)
const isNearExpiry = (raw) => {
  const d = parseExp(raw); if (!d) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(today); target.setMonth(target.getMonth() + 16);
  d.setHours(0, 0, 0, 0);
  return d <= target;
};

// ระยะถึงวันหมดอายุ → "อีก X ปี Y เดือน Z วัน" (สำหรับใบพิมพ์); หมดอายุแล้ว → "หมดอายุแล้ว"
const expCountdown = (raw) => {
  const d = parseExp(raw); if (!d) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  if (d < today) return 'หมดอายุแล้ว';
  let years = d.getFullYear() - today.getFullYear();
  let months = d.getMonth() - today.getMonth();
  let days = d.getDate() - today.getDate();
  if (days < 0) { months -= 1; const prevMonth = new Date(d.getFullYear(), d.getMonth(), 0); days += prevMonth.getDate(); }
  if (months < 0) { years -= 1; months += 12; }
  const parts = [];
  if (years)  parts.push(`${years} ปี`);
  if (months) parts.push(`${months} เดือน`);
  if (days)   parts.push(`${days} วัน`);
  return parts.length ? `อีก ${parts.join(' ')}` : 'หมดอายุวันนี้';
};

// แสดงจำนวนที่จ่ายของ lot เป็น "กล่อง × หน่วยย่อย" จาก allocation (packs กล่อง + base เม็ด)
//   ผู้เบิกใช้เช็คตอนรับของ — packSize = base/packs (ไม่ต้องโหลด inventory)
const allocPackLabel = (a, unit) => {
  const packs = Number(a.packs) || 0;
  const base = Number(a.base) || 0;
  if (packs <= 0) return `${base.toLocaleString()} ${unit || ''}`.trim();
  const size = Math.round(base / packs);
  return size > 1 ? `${packs.toLocaleString()} กล่อง × ${size.toLocaleString()}${unit || ''}` : `${packs.toLocaleString()} ${unit || ''}`.trim();
};

// แสดงคงเหลือราย lot เป็น "กล่อง × หน่วยย่อย" ให้ staff นับของจริงง่าย
//   on = ข้อมูล lot จาก inventory สด { packs, packSize, unit }, pickedPacks = กล่องที่จ่ายไป
//   คืน { remainPacks, label, before, out } — label/before/out เป็นข้อความ "กล่อง × หน่วย"
const remainLotPacks = (on, pickedPacks) => {
  if (!on) return null;
  const size = on.packSize || 1;
  const before = Math.max(0, on.packs || 0);
  const out = Math.max(0, pickedPacks || 0);
  const remainPacks = Math.max(0, before - out);
  const fmt = (p) => size > 1 ? `${p.toLocaleString()} กล่อง × ${size.toLocaleString()}${on.unit || ''}` : `${p.toLocaleString()} ${on.unit || ''}`;
  return { remainPacks, label: fmt(remainPacks), before: fmt(before), out: fmt(out) };
};

// สรุปกล่องคงเหลือ แยกตาม packsize เช่น "105 กล่อง × 1000เม็ด" หรือ "5 × 1000เม็ด + 2 × 500เม็ด"
const packSummary = (fefoLots) => {
  if (!fefoLots || !fefoLots.length) return '';
  const byUnit = {};
  fefoLots.forEach(l => { if (l.packs > 0) byUnit[l.unit] = (byUnit[l.unit] || 0) + l.packs; });
  const parts = Object.entries(byUnit).map(([unit, packs]) => `${Math.ceil(packs).toLocaleString()} × ${unit}`);
  return parts.join(' + ');
};

// ---- Drug Search ----
function DrugSearch({ info, cart, setCart, onCart, onHistory, onBack }) {
  const [q, setQ]              = useState('');
  const [rawResults, setRawResults] = useState([]);   // inventory data (no reservation)
  const [reservedMap, setReservedMap] = useState({}); // drug_code → total reserved qty (หน่วยย่อยสุด, realtime)
  const [loading, setLoading]  = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // ระดับยา (B-base, ADR-0004): คงเหลือรวม = Σ(lot.qty × packSize) แปลงเป็นหน่วยย่อยสุด
  // หัก reservation ต่อรหัสยา (ของที่ใบ pending/approved จองไว้) — กัน oversell
  const results = useMemo(() =>
    rawResults.map(drug => {
      // lot ที่เบิกได้จริง: ตรวจรับแล้ว (ไม่ pending) + ไม่หมดอายุ + มีของ — เรียง FEFO (ใกล้หมดอายุก่อน)
      const baseUnitCount = {};
      let totalBaseRaw = 0;
      const fefoLots = [];
      drug.lots.forEach(lot => {
        if (lot.pending || lot.expired) return;
        const { packSize, baseUnit } = parseUnit(lot.unit);
        const packs = parseFloat(lot.rawQty) || 0;
        const base = packs * (packSize || 1);
        totalBaseRaw += base;
        if (baseUnit && baseUnit !== '-') baseUnitCount[baseUnit] = (baseUnitCount[baseUnit] || 0) + packs;
        if (packs > 0) fefoLots.push({ lot: lot.lot, exp: lot.exp, unit: lot.unit, packSize: packSize || 1, packs, base, baseUnit });
      });
      fefoLots.sort((a, b) => {
        const da = parseExp(a.exp), db = parseExp(b.exp);
        if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
        return da - db;
      });
      // baseUnit = หน่วยย่อยที่พบบ่อยสุด (ปกติยาตัวเดียวกันหน่วยเดียว)
      const baseUnit = Object.keys(baseUnitCount).sort((a, b) => baseUnitCount[b] - baseUnitCount[a])[0] || (drug.unit || '');
      const reservedBase = reservedMap[codeKey(drug.code)] || 0;
      const availableBase = Math.max(0, totalBaseRaw - reservedBase);
      // หัก reservation ออกจาก fefoLots ตามลำดับ FEFO (ของที่จองไปแล้ว = lot ใกล้หมดอายุก่อน)
      // เพื่อให้ allocation preview ในตะกร้าตรงกับ availableBase (ไม่ preview ของที่ถูกจอง)
      let toReserve = reservedBase;
      const availLots = [];
      for (const l of fefoLots) {
        if (toReserve <= 0) { availLots.push(l); continue; }
        if (toReserve >= l.base) { toReserve -= l.base; continue; } // lot นี้ถูกจองหมด
        const leftBase = l.base - toReserve;
        availLots.push({ ...l, base: leftBase, packs: l.packSize ? leftBase / l.packSize : leftBase });
        toReserve = 0;
      }
      return { ...drug, totalBaseRaw, baseUnit, reservedBase, availableBase, fefoLots: availLots };
    }), [rawResults, reservedMap]);
  const [qtyMap, setQtyMap]    = useState({});   // key = code+name+lot
  const [warnMap, setWarnMap]  = useState({});   // key = lotKey → warning msg
  const [drugNames, setDrugNames]   = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [toast, setToast] = useState(null);
  const searchRef = useRef(null);

  const today = new Date(); today.setHours(0,0,0,0);

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

  // โหลดและ subscribe ใบเบิกที่รอดำเนินการของ requester นี้
  useEffect(() => {
    if (!supabase || !info?.department || !info?.name) return;
    const load = async () => {
      const { count } = await supabase.from('requisitions')
        .select('id', { count: 'exact', head: true })
        .eq('department', info.department)
        .eq('requester_name', info.name)
        .eq('status', 'pending');
      setPendingCount(count || 0);
    };
    load();
    const ch = supabase.channel('drugsearch-pending')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisitions' }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [info?.department, info?.name]);

  const filteredSuggestions = q.trim()
    ? drugNames.filter(n => n.name.toLowerCase().includes(q.toLowerCase())).slice(0, 10)
    : [];

  const search = useCallback(async (term) => {
    if (!term.trim()) { setRawResults([]); return; }
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

      // Get supplier/price/type from receive_logs — source of truth for drug details
      const uniqueCodes = [...new Set(merged.map(r => r.code).filter(Boolean))];

      // หัก qty ที่มี requisition pending/approved อยู่ (reserved) ออกจาก available — ต่อรหัสยา (B-base, ADR-0004)
      // requested_qty เป็นหน่วยย่อยสุดอยู่แล้ว จึงรวมต่อ code ได้ตรงๆ
      const reservedQtyMap = {}; // drug_code (normalized) → total reserved (หน่วยย่อยสุด)
      if (uniqueCodes.length > 0) {
        const { data: ri } = await supabase
          .from('requisition_items')
          .select('drug_code, requested_qty, requisitions(status)')
          .in('drug_code', uniqueCodes);
        (ri || []).forEach(item => {
          const status = item.requisitions?.status;
          if ((status === 'pending' || status === 'approved') && item.drug_code) {
            const k = codeKey(item.drug_code);
            reservedQtyMap[k] = (reservedQtyMap[k] || 0) + (item.requested_qty || 0);
          }
        });
      }
      const supplierMap = {}; // "code|lot|invoice" → entry (exact), "code|lot" → fallback
      if (uniqueCodes.length > 0) {
        const CHUNK = 500;
        for (let ci = 0; ci < uniqueCodes.length; ci += CHUNK) {
          const { data: rl } = await supabase.from('receive_logs')
            .select('drug_code, lot, bill_number, supplier_current, price_per_unit, drug_type, item_type')
            .in('drug_code', uniqueCodes.slice(ci, ci + CHUNK))
            .order('receive_date', { ascending: false });
          (rl || []).forEach(r => {
            const code = codeKey(r.drug_code);
            const lot  = String(r.lot || '').trim().toLowerCase();
            const inv  = String(r.bill_number || '').trim().toLowerCase();
            const k3 = `${code}|${lot}|${inv}`;
            const k2 = `${code}|${lot}`;
            const entry = {
              supplier: r.supplier_current || '',
              price:    r.price_per_unit != null ? String(r.price_per_unit) : '',
              drugType: r.drug_type || '',
              itemType: r.item_type || '',
            };
            if (!supplierMap[k3]) supplierMap[k3] = entry;
            if (!supplierMap[k2]) supplierMap[k2] = entry;
          });
        }
      }

      const getDetail = (row) => {
        const code = codeKey(row.code);
        const lot  = String(row.lot     || '').trim().toLowerCase();
        const inv  = String(row.invoice || '').trim().toLowerCase();
        return supplierMap[`${code}|${lot}|${inv}`] || supplierMap[`${code}|${lot}`] || {};
      };

      // Group by drug — เก็บ lot ไว้ภายในเพื่อ classify pending/หมดอายุ + แปลงหน่วยใน results useMemo
      // (ผู้เบิกไม่เห็น lot — คงเหลือรวมคำนวณระดับยาใน results, ADR-0004)
      const grouped = {};
      merged.forEach(row => {
        const key = `${row.code}||${row.name}`;
        if (!grouped[key]) grouped[key] = { code: row.code, name: row.name, unit: row.unit, type: '', lots: [] };
        const rowQty = parseFloat(row.qty) || 0;
        const isPending = pendingLotSet.has(row.lot);
        const expDate = parseExp(row.exp);
        const isExpired = expDate && expDate < today;
        const detail = getDetail(row);
        if (!grouped[key].type && detail.drugType && detail.drugType !== '-') grouped[key].type = detail.drugType;
        grouped[key].lots.push({ lot: row.lot, exp: row.exp, qty: rowQty, rawQty: row.qty, unit: row.unit, drugType: detail.drugType || '', pending: isPending, expired: isExpired });
      });

      setRawResults(Object.values(grouped));
      setReservedMap(reservedQtyMap); // initial snapshot; realtime will update this
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(q), 350);
    return () => clearTimeout(t);
  }, [q, search]);

  // Realtime: อัพเดต reservedMap (ต่อรหัสยา) ทันทีเมื่อ requisition_items เปลี่ยน
  useEffect(() => {
    if (!supabase || rawResults.length === 0) return;
    const allCodes = [...new Set(rawResults.map(d => d.code).filter(Boolean))];
    if (allCodes.length === 0) return;

    const fetchReserved = async () => {
      const { data: ri } = await supabase
        .from('requisition_items')
        .select('drug_code, requested_qty, requisitions(status)')
        .in('drug_code', allCodes);
      const map = {};
      (ri || []).forEach(item => {
        const status = item.requisitions?.status;
        if ((status === 'pending' || status === 'approved') && item.drug_code) {
          const k = codeKey(item.drug_code);
          map[k] = (map[k] || 0) + (item.requested_qty || 0);
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

  // เบิกระดับยา (B-base, ADR-0004): ขอเป็นหน่วยย่อยสุด, lot=null — คลังเลือก FEFO ตอน picking
  const addToCart = (drug, qty) => {
    const drugKey = drug.code + drug.name;
    const requested = parseInt(qty) || 1;
    const safeQty = Math.max(1, requested);
    const inCartQty = cart.find(i => i.code === drug.code && i.name === drug.name)?.requestedQty || 0;
    if (inCartQty + safeQty > drug.availableBase) {
      setWarnMap(p => ({ ...p, [drugKey]: inCartQty > 0
        ? `รวมในตะกร้าแล้ว ${inCartQty.toLocaleString()} — คงเหลือไม่พอ (มี ${drug.availableBase.toLocaleString()} ${drug.baseUnit})`
        : `คงเหลือไม่พอ — มีเพียง ${drug.availableBase.toLocaleString()} ${drug.baseUnit}` }));
      return;
    }
    setWarnMap(p => { const n = { ...p }; delete n[drugKey]; return n; });
    setCart(prev => {
      const idx = prev.findIndex(i => i.code === drug.code && i.name === drug.name);
      if (idx >= 0) {
        const u = [...prev]; u[idx] = { ...u[idx], requestedQty: u[idx].requestedQty + safeQty }; return u;
      }
      return [...prev, { code: drug.code, name: drug.name, unit: drug.baseUnit, lot: null, drugType: drug.type || '', availableBase: drug.availableBase, fefoLots: drug.fefoLots || [], requestedQty: safeQty, note: '', addedAt: new Date().toISOString() }];
    });
    setQtyMap(p => ({ ...p, [drugKey]: 1 }));
    setToast({ name: drug.name, type: drug.type || '', qty: safeQty, unit: drug.baseUnit });
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
        <button onClick={onHistory} className="transition-colors px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 flex items-center gap-1.5 text-slate-700">
          <FileText size={16} strokeWidth={2} />
          <span className="text-sm font-medium">ประวัติการเบิก</span>
        </button>
      </PageHeader>

      {/* Pending notification */}
      {pendingCount > 0 && (
        <button onClick={onHistory}
          className="w-full flex items-center gap-2 px-4 py-3 bg-amber-50 border-b border-amber-200 text-left hover:bg-amber-100 transition-colors">
          <Clock size={15} className="text-amber-500 shrink-0" />
          <span className="text-sm text-amber-800 font-medium">
            มี <span className="font-bold">{pendingCount}</span> ใบเบิกรอดำเนินการ
          </span>
          <ChevronRight size={14} className="text-amber-400 ml-auto" />
        </button>
      )}

      {/* Search Area */}
      <div className="bg-white border-b border-slate-200 px-4 pt-4 pb-5">
        <p className="text-slate-500 text-sm mb-2 font-medium">ค้นหายาในคลัง</p>
        <div className="relative" ref={searchRef}>
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
          <input type="text" value={q}
            onChange={e => { setQ(e.target.value); setShowDropdown(true); }}
            onFocus={() => { if (q.trim()) setShowDropdown(true); }}
            placeholder="ชื่อยาหรือรหัสยา..." autoFocus
            className="w-full bg-slate-100 rounded-xl pl-11 pr-10 py-3.5 text-slate-800 placeholder-slate-400 text-base focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white border border-slate-200" />
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
          <button onClick={() => search(q)} className="mt-3 flex items-center gap-1.5 text-sky-600 hover:text-sky-700 text-sm font-bold transition-colors">
            <RefreshCcw size={15} strokeWidth={2.5} /> อัพเดตคงเหลือใหม่
          </button>
        )}
      </div>

      {/* Results list */}
      <div className="flex-1 px-4 pt-4 pb-28 space-y-3">
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
              <span className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full font-medium">กรอกจำนวนที่ต้องการเบิก</span>
            </div>
          </div>
        )}

        {/* การ์ดระดับยา (B-base): มีของขึ้นก่อน เรียงตามชื่อ → หมดสต็อกจางๆ ท้ายสุด */}
        {[...results]
          .sort((a, b) => {
            const aOut = a.availableBase <= 0, bOut = b.availableBase <= 0;
            if (aOut !== bOut) return aOut ? 1 : -1;
            return (a.name || '').localeCompare(b.name || '', 'th');
          })
          .map(drug => {
            const drugKey = drug.code + drug.name;
            const inCart = cart.find(i => i.code === drug.code && i.name === drug.name);
            const accentColor = drugTypeAccent(drug.type);
            const outOfStock = drug.availableBase <= 0;
            const remaining = Math.max(0, drug.availableBase - (inCart?.requestedQty || 0));
            return (
              <div key={drugKey} className={`bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200 ${outOfStock ? 'opacity-60' : ''}`}
                style={{ borderLeft: `4px solid ${outOfStock ? '#CBD5E1' : accentColor}` }}>
                <div className="px-4 py-3.5">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className="font-bold text-lg text-slate-800 leading-snug flex-1">{drug.name}</p>
                    {drug.type && drug.type !== '-' && <DrugTypeBadge type={drug.type} />}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-sm text-slate-400">รหัส: {drug.code}</span>
                    {inCart && <span className="text-sm text-[#1E90FF] font-bold bg-blue-50 px-2 py-0.5 rounded-full">ในตะกร้า: {inCart.requestedQty.toLocaleString()}</span>}
                  </div>

                  {/* คงเหลือรวมระดับยา — base unit เด่น + สรุปกล่องแยก packsize */}
                  {outOfStock ? (
                    <span className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1.5 rounded-full bg-red-50 text-red-600 text-sm font-bold border border-red-200">
                      <AlertCircle size={14} /> หมดสต็อก
                    </span>
                  ) : (
                    <div className="mt-2.5">
                      <p className="text-base">
                        <span className="text-slate-500">คงเหลือในคลัง </span>
                        <span className="font-extrabold text-emerald-600">{remaining.toLocaleString()}</span>
                        <span className="text-slate-500"> {drug.baseUnit}</span>
                        {drug.reservedBase > 0 && (
                          <span className="ml-1.5 text-xs text-slate-400">(จองแล้ว {drug.reservedBase.toLocaleString()})</span>
                        )}
                      </p>
                      {packSummary(drug.fefoLots) && (
                        <p className="text-xs text-slate-400 mt-0.5">= {packSummary(drug.fefoLots)}</p>
                      )}
                    </div>
                  )}

                  {/* Add to cart */}
                  {!outOfStock && (
                    <div className="flex items-center gap-2 flex-wrap mt-3">
                      <span className="text-sm text-slate-500 font-medium">ขอเบิก</span>
                      <input type="number" min="1" max={remaining}
                        value={qtyMap[drugKey] ?? 1}
                        onChange={e => {
                          setQtyMap(p => ({ ...p, [drugKey]: e.target.value }));
                          setWarnMap(p => { const n = { ...p }; delete n[drugKey]; return n; });
                        }}
                        className={`w-24 bg-white border rounded-lg px-2 py-2 text-slate-800 text-center text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#1E90FF] ${warnMap[drugKey] ? 'border-red-400 bg-red-50' : 'border-slate-300'}`} />
                      <span className="text-sm text-slate-500">{drug.baseUnit}</span>
                      <button onClick={() => addToCart(drug, qtyMap[drugKey] ?? 1)}
                        className="bg-[#1E90FF] hover:bg-[#1a7fe0] text-white rounded-lg px-4 py-2 text-sm font-bold flex items-center gap-1.5 transition-colors shadow-sm ml-auto">
                        <Plus size={15} /> เพิ่มเข้าตะกร้า
                      </button>
                      {warnMap[drugKey] && (
                        <p className="w-full text-xs text-red-600 font-medium mt-0.5 flex items-center gap-1"><AlertCircle size={12} /> {warnMap[drugKey]}</p>
                      )}
                    </div>
                  )}
                </div>
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
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [doneInfo, setDoneInfo] = useState(null);
  const [search, setSearch]   = useState('');
  const [openNotes, setOpenNotes] = useState({}); // index → เปิดช่องหมายเหตุ

  const updateQty   = (i, v) => setCart(p => { const u=[...p]; u[i]={...u[i], requestedQty: Math.min(Math.max(1, parseInt(v)||1), u[i].availableBase || 99999)}; return u; });
  const updateNote  = (i, v) => setCart(p => { const u=[...p]; u[i]={...u[i], note: v}; return u; });

  const submit = async () => {
    if (!cart.length) return;
    setLoading(true); setError('');
    try {
      if (supabase) {
        // Re-validate ณ เวลา submit — ระดับรหัสยา หน่วยย่อยสุด (B-base, ADR-0004)
        // คงเหลือ = Σ(lot.qty × packSize) แปลงเป็นหน่วยย่อย; หัก reservation ต่อ code
        const codes = [...new Set(cart.map(i => i.code).filter(Boolean))];
        if (codes.length > 0) {
          const [{ data: invData }, { data: riData }] = await Promise.all([
            supabase.from('inventory').select('code, qty, unit').in('code', codes),
            supabase.from('requisition_items')
              .select('drug_code, requested_qty, requisitions(status)')
              .in('drug_code', codes),
          ]);
          const invBaseMap = {}; // code → คงเหลือรวม (หน่วยย่อยสุด)
          (invData || []).forEach(r => {
            const { packSize } = parseUnit(r.unit);
            const k = codeKey(r.code);
            invBaseMap[k] = (invBaseMap[k] || 0) + (parseFloat(r.qty) || 0) * (packSize || 1);
          });
          const reservedNow = {}; // code → จองแล้ว (หน่วยย่อยสุด) — รวมทุกใบ pending/approved
          (riData || []).forEach(item => {
            const status = item.requisitions?.status;
            if ((status === 'pending' || status === 'approved') && item.drug_code) {
              const k = codeKey(item.drug_code);
              reservedNow[k] = (reservedNow[k] || 0) + (item.requested_qty || 0);
            }
          });
          const conflicts = cart.filter(item => {
            const k = codeKey(item.code);
            const effective = Math.max(0, (invBaseMap[k] ?? 0) - (reservedNow[k] ?? 0));
            return item.requestedQty > effective;
          });
          if (conflicts.length > 0) {
            const msg = conflicts.map(item => {
              const k = codeKey(item.code);
              const effective = Math.max(0, (invBaseMap[k] ?? 0) - (reservedNow[k] ?? 0));
              return `${item.name}: ขอ ${item.requestedQty.toLocaleString()} แต่เหลือ ${effective.toLocaleString()} ${item.unit || ''}`;
            }).join('\n');
            setError(`ส่งใบเบิกไม่ได้ — สต็อกไม่เพียงพอ:\n${msg}`);
            setLoading(false);
            return;
          }
        }

        const { data: req, error: e1 } = await supabase.from('requisitions')
          .insert({ req_number: genReqNumber(), department: info.department, requester_name: info.name, status: 'pending' })
          .select().single();
        if (e1) throw e1;
        // เบิกระดับยา: ไม่ระบุ lot/exp/ราคา — คลังจัดสรร lot (FEFO) ตอน picking (ADR-0004)
        const { error: e2 } = await supabase.from('requisition_items').insert(
          cart.map(item => ({
            requisition_id: req.id,
            drug_code:      item.code,
            drug_name:      item.name,
            drug_unit:      item.unit || null,
            drug_type:      item.drugType || null,
            requested_qty:  item.requestedQty,
            item_note:      item.note?.trim() || null,
          }))
        );
        if (e2) throw e2;
        insertAuditLog({
          action: 'submit_requisition', table_name: 'requisitions',
          user_name: info.name, department: info.department,
          record_count: cart.length,
          details: { req_number: req.req_number, requisition_id: req.id },
        });
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
        <div className="flex justify-center"><CheckCircle size={56} className="text-emerald-500" strokeWidth={2} /></div>
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

  const filteredCart = search.trim()
    ? cart.filter(item => item.name?.toLowerCase().includes(search.toLowerCase()) || item.code?.toLowerCase().includes(search.toLowerCase()))
    : cart;

  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader onBack={onBack} title="ตะกร้าใบเบิก" subtitle={`${info.department} · ${info.name}`} />

      {cart.length > 1 && (
        <div className="px-4 pt-3 pb-1">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหายาในตะกร้า..."
              className="w-full border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E90FF] bg-white" />
          </div>
          {search && (
            <p className="text-xs text-slate-400 mt-1.5 px-1">
              แสดง {filteredCart.length} / {cart.length} รายการ
            </p>
          )}
        </div>
      )}

      <div className="flex-1 p-4 space-y-2 pb-32">
        {cart.length === 0
          ? <p className="text-center text-slate-500 py-20">ยังไม่มีรายการยา</p>
          : filteredCart.length === 0
            ? <p className="text-center text-slate-500 py-10">ไม่พบยาที่ค้นหา</p>
          : filteredCart.map((item) => {
              const i = cart.indexOf(item);
              const overStock = item.availableBase != null && item.requestedQty > item.availableBase;
              const noteOpen = openNotes[i] || !!item.note;
              // preview: คาดว่าจะได้ lot อะไรบ้าง ตาม FEFO (lot ตรวจรับแล้ว) — authoritative recompute ตอน picking
              const alloc = item.fefoLots ? allocateFefo(item.requestedQty, item.fefoLots) : null;
              return (
            <div key={i} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* ลำดับการเบิก */}
                  <span className="shrink-0 w-7 h-7 rounded-full bg-blue-50 text-[#1E90FF] font-bold text-sm flex items-center justify-center mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <p className="font-bold text-lg text-slate-800 leading-snug flex-1">{item.name}</p>
                      {item.drugType && item.drugType !== '-' && <DrugTypeBadge type={item.drugType} />}
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5">รหัส: {item.code}</p>
                    {item.availableBase != null && (
                      <p className="text-sm mt-1">
                        <span className="text-slate-500">คงเหลือในคลัง </span>
                        <span className="font-bold text-emerald-600">{Number(item.availableBase).toLocaleString()}</span>
                        <span className="text-slate-500"> {item.unit || ''}</span>
                      </p>
                    )}
                  </div>
                  <button onClick={() => { setCart(p => p.filter((_,j)=>j!==i)); setError(''); }}
                    className="shrink-0 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg p-2 transition-colors"><Trash2 size={18} /></button>
                </div>

                {/* จำนวนที่ขอเบิก */}
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-sm text-slate-500 font-medium">ขอเบิก</span>
                  <button onClick={() => updateQty(i, item.requestedQty-1)} className="bg-slate-100 hover:bg-slate-200 rounded-lg p-2 transition-colors"><Minus size={16} /></button>
                  <input type="number" min="1" value={item.requestedQty} onChange={e => updateQty(i, e.target.value)}
                    className={`w-20 border rounded-lg px-2 py-2 text-slate-800 text-center text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#1E90FF] ${overStock ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-slate-50'}`} />
                  <button onClick={() => updateQty(i, item.requestedQty+1)} disabled={item.availableBase != null && item.requestedQty >= item.availableBase}
                    className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg p-2 transition-colors"><Plus size={16} /></button>
                  <span className="text-sm text-slate-500">{item.unit || ''}</span>
                </div>
                {overStock && (
                  <p className="text-xs text-red-600 font-medium mt-1.5 flex items-center gap-1"><AlertCircle size={12} /> เกินคงเหลือในคลัง ({Number(item.availableBase).toLocaleString()} {item.unit || ''})</p>
                )}

                {/* Preview: คาดว่าจะได้ lot อะไรบ้าง ตาม FEFO (lot ตรวจรับแล้ว) */}
                {alloc && alloc.allocation.length > 0 && (
                  <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                      <Package size={12} /> คาดว่าจะจ่ายจาก Lot (ใกล้หมดอายุก่อน)
                    </p>
                    <div className="space-y-1">
                      {alloc.allocation.map((a, ai) => (
                        <div key={ai} className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 items-start text-sm">
                          <div className="flex items-center gap-x-2 gap-y-1 flex-wrap min-w-0">
                            <span className="font-mono font-semibold text-slate-700">Lot {a.lot || '-'}</span>
                            <span className="text-xs text-slate-400">Exp {fmtExp(a.exp)}</span>
                            {isNearExpiry(a.exp) && (
                              <span className="inline-flex items-center gap-0.5 text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 font-semibold"><Clock size={10}/> ใกล้หมดอายุ · {expCountdown(a.exp)}</span>
                            )}
                          </div>
                          <div className="text-right whitespace-nowrap">
                            <span className="font-bold text-emerald-600">{a.base.toLocaleString()} {item.unit || ''}</span>
                            <span className="text-xs text-slate-400"> ({a.packs.toLocaleString()} × {a.unit})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {alloc.overBase > 0 && (
                      <p className="text-xs text-amber-600 font-semibold mt-2 pt-2 border-t border-amber-100 flex items-center gap-1">
                        <AlertCircle size={12} /> จ่ายเต็มกล่อง — ได้ {alloc.allocatedBase.toLocaleString()} {item.unit || ''} (เกินที่ขอ {alloc.overBase.toLocaleString()})
                      </p>
                    )}
                    {!alloc.fulfilled && (
                      <p className="text-xs text-red-600 font-semibold mt-2 pt-2 border-t border-red-100 flex items-center gap-1">
                        <AlertCircle size={12} /> ของไม่พอเบิก — ขาดอีก {alloc.shortfallBase.toLocaleString()} {item.unit || ''} (มีให้จ่าย {alloc.allocatedBase.toLocaleString()})
                      </p>
                    )}
                  </div>
                )}

                {/* หมายเหตุรายการ — ซ่อนจนกดเปิด */}
                {noteOpen ? (
                  <input type="text" value={item.note || ''} onChange={e => updateNote(i, e.target.value)} autoFocus={!item.note}
                    placeholder="หมายเหตุรายการนี้..."
                    className="w-full mt-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder-slate-400 text-base focus:outline-none focus:ring-1 focus:ring-[#1E90FF]" />
                ) : (
                  <button onClick={() => setOpenNotes(p => ({ ...p, [i]: true }))}
                    className="mt-2.5 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-[#1E90FF] transition-colors">
                    <Plus size={14} /> เพิ่มหมายเหตุ
                  </button>
                )}
              </div>
            </div>
          ); })}
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
// async: คำนวณ allocation (จัดแล้ว=picked / ยังไม่จัด=FEFO สด) ก่อนสร้าง HTML เพื่อโชว์ lot/exp/ราคา
// preopenedWin = หน้าต่างเปล่าที่เปิดไว้ตั้งแต่ตอนคลิก (กัน popup blocker บน mobile — ต้องเปิดใน user gesture ก่อน await)
async function printReq(req, preopenedWin) {
  const { allocByItem, onHandByLot, logMap } = await computeReqAllocations([req]);
  const d = new Date(req.created_at);
  const dateStr = d.toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' });
  const allItems = req.requisition_items || [];
  const items = req.status === 'partial'
    ? allItems.filter(item => item.approved_qty != null && item.approved_qty > 0)
    : allItems;
  // คงเหลือหลังจ่ายราย lot = คงเหลือสดของ lot นั้น − จำนวนที่จ่ายจาก lot นั้น
  const remainLot = (code, lot, out) => {
    const onHand = onHandByLot[`${String(code || '').trim()}|${String(lot || '').trim()}`];
    if (onHand == null) return '-';
    return Math.max(0, onHand - (Number(out) || 0)).toLocaleString();
  };
  // exp + ระยะถึงหมดอายุ (อีกกี่ปี/เดือน/วัน)
  const expCell = (raw) => {
    if (!raw) return '-';
    const cd = expCountdown(raw);
    return `${fmtExp(raw)}${cd ? `<br><span style="font-size:12px;color:#b45309">${cd}</span>` : ''}`;
  };
  // หมายเหตุรายการ + จำนวนที่จ่ายเกินจากขอเบิก (จ่ายเต็มกล่อง)
  const noteCell = (item, alloc) => {
    const want = Number(item.approved_qty ?? item.requested_qty) || 0;
    const out = (alloc && alloc.length) ? alloc.reduce((s, a) => s + (Number(a.base) || 0), 0) : 0;
    const over = out - want;
    const u = item.drug_unit || '';
    const overTxt = over > 0
      ? `<span style="color:#b45309">ขอ ${want.toLocaleString()} จ่าย ${out.toLocaleString()} ${u} — เนื่องจากจ่ายเต็มกล่อง (ไม่แกะกล่อง เกิน ${over.toLocaleString()})</span>`
      : '';
    const note = item.item_note || '';
    return [note, overTxt].filter(Boolean).join('<br>');
  };
  // 1 รายการ → หลายแถวตาม lot ที่จะจ่าย; ไม่มี allocation → แถวเดียว (ค่าที่ขอ)
  const rows = items.map((item, i) => {
    const alloc = allocByItem[item.id] || (Array.isArray(item.picked_allocation) ? item.picked_allocation : null);
    const note = noteCell(item, alloc);
    if (alloc && alloc.length) {
      return alloc.map((a, ai) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td style="text-align:center">${item.drug_code || '-'}</td>
      <td style="text-align:center">${item.drug_type || '-'}</td>
      <td>${item.drug_name || '-'}</td>
      <td style="text-align:center">${item.drug_unit || '-'}</td>
      <td style="text-align:center">${Number(a.base).toLocaleString()}</td>
      <td style="text-align:center">${a.lot || '-'}</td>
      <td style="text-align:center">${a.location && a.location !== '-' ? a.location : '-'}</td>
      <td style="text-align:center">${expCell(a.exp)}</td>
      <td style="text-align:center">${remainLot(item.drug_code, a.lot, a.base)}</td>
      <td>${ai === 0 ? note : ''}</td>
    </tr>`).join('');
    }
    const outQty = item.picked_qty ?? item.approved_qty ?? item.requested_qty;
    const lot = item.picked_lot || item.lot || '';
    const exp = item.picked_exp || item.exp || '';
    const loc = logMap[`${String(item.drug_code||'').trim()}|${String(lot||'').trim()}`]?.detail_log;
    return `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td style="text-align:center">${item.drug_code || '-'}</td>
      <td style="text-align:center">${item.drug_type || '-'}</td>
      <td>${item.drug_name || '-'}</td>
      <td style="text-align:center">${item.drug_unit || '-'}</td>
      <td style="text-align:center">${Number(outQty).toLocaleString()}</td>
      <td style="text-align:center">${lot || '-'}</td>
      <td style="text-align:center">${loc && loc !== '-' ? loc : '-'}</td>
      <td style="text-align:center">${exp ? expCell(exp) : '-'}</td>
      <td style="text-align:center">${remainLot(item.drug_code, lot, outQty)}</td>
      <td>${note}</td>
    </tr>`;
  }).join('');

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
      table { width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 24px; }
      th { background: transparent; color: #000; padding: 8px 10px; font-size: 15px; font-weight: 700; text-align: left; border-bottom: 2px solid #000; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 15px; vertical-align: top; }
      tr:nth-child(even) td { background: #f8fafc; }
      .badge { display:inline-block; padding: 2px 10px; border-radius: 999px; font-size:13px; font-weight:600;
               background:#fef3c7; color:#92400e; border:1px solid #fde68a; }
      /* ลายเซ็น = flow ปกติใต้ตาราง ไม่ทับแถวเบิก (เดิม position:fixed ลอยทับ) */
      .sig-block {
        margin-top: 48px;
        margin-right: 16px;
        font-size: 15px;
        line-height: 2;
        text-align: center;
        float: right;
        width: 320px;
        page-break-inside: avoid;
      }
      .sig-block p { margin: 0; }
      @media print { body { margin: 10mm 12mm; } }
    </style></head><body>
    <h2>ใบเบิกยา : ${req.department}</h2>
    <div class="meta">
      เลขที่: <strong>${req.req_number}</strong> &nbsp;|&nbsp;
      หน่วยงาน: <strong>${req.department}</strong> &nbsp;|&nbsp;
      ผู้เบิก: <strong>${req.requester_name || '-'}</strong> &nbsp;|&nbsp;
      วันที่: <strong>${dateStr}</strong>
    </div>
    <table>
      <thead><tr>
        <th style="width:48px;text-align:center">ลำดับที่</th>
        <th style="width:90px;text-align:center">รหัส</th>
        <th style="width:80px;text-align:center">ชนิด</th>
        <th>รายการ</th>
        <th style="width:80px;text-align:center">หน่วยนับ</th>
        <th style="width:100px;text-align:center">จำนวนที่เบิก</th>
        <th style="width:90px;text-align:center">Lot</th>
        <th style="width:90px;text-align:center">ที่เก็บ</th>
        <th style="width:90px;text-align:center">Exp</th>
        <th style="width:110px;text-align:center">คงเหลือหลังจ่าย</th>
        <th style="width:120px">หมายเหตุ</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${req.note ? `<p style="margin-top:12px;color:#64748b;font-size:14px">หมายเหตุ: ${req.note}</p>` : ''}
    ${sigBlock}
    <div style="clear:both"></div>
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  // ใช้หน้าต่างที่เปิดไว้ตอนคลิก (mobile) ถ้ามี ไม่งั้นเปิดใหม่ (desktop ไม่โดนบล็อก)
  const w = preopenedWin && !preopenedWin.closed ? (preopenedWin.location.href = url, preopenedWin) : window.open(url, '_blank');
  if (w) setTimeout(() => URL.revokeObjectURL(url), 30000);
  else   URL.revokeObjectURL(url);
}

// จ่ายออกแล้ว + มี import inventory CSV รอบใหม่หลังจ่าย → qty สดสะท้อน "หลังจ่าย" แล้ว
// (แอปไม่หัก inventory.qty เองตอนจ่าย — ตัดจริงใน HosXP แล้ว re-import; ดู CONTEXT.md §ใบ lot คุม)
const qtyIsPostDispense = (req, lastImportAt) => {
  if (req.status !== 'dispensed' && req.status !== 'received') return false;
  const dispensedAt = req.dispensed_at || req.updated_at;
  return !!(dispensedAt && lastImportAt && new Date(lastImportAt) > new Date(dispensedAt));
};

// คงเหลือก่อนเบิก/หลังจ่ายของแถว lot ในใบ lot คุม/Excel
//   snap = snapshot onhand ที่เก็บใน picked_allocation ตอนจัดยา (แม่นเสมอ ใบใหม่มีทุกใบ)
//   ไม่มี snapshot (ใบเก่า/ยังไม่จัด) → อนุมานจาก qty สด ± ออก ตาม qtyIsPostDispense
const lotBeforeAfter = (req, code, lot, out, snap, onHandByLot, lastImportAt) => {
  const o = Number(out) || 0;
  if (snap != null) return { before: Number(snap), after: Math.max(0, Number(snap) - o) };
  const live = onHandByLot[`${String(code || '').trim()}|${String(lot || '').trim()}`] ?? 0;
  return qtyIsPostDispense(req, lastImportAt)
    ? { before: live + o, after: live }
    : { before: live, after: Math.max(0, live - o) };
};

// ============================================================
// ใบ lot คุม (Lot Control Sheet) — เอกสารคุมคลังแนวนอน 16 คอลัมน์ตามแบบรายงาน HosXP
// รายรหัส×lot เรียงตามเส้นทางเดินหยิบ (MainLog → DetailedLog) — ดู CONTEXT.md §ใบ lot คุม
// ============================================================
async function printLotControl(req, preopenedWin) {
  const { allocByItem, onHandByLot, onHandByCode, logMap, pendingCodes, discontinuedCodes, supplierChangedLots } =
    await computeReqAllocations([req]);
  const lastImportAt = await fetchLastInventoryImportAt();
  const pad = n => String(n).padStart(2, '0');
  const fmtDateCE = (iso) => { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const now = new Date();
  const isPicked = !['pending', 'approved', 'partial', 'rejected'].includes(req.status);
  const allItems = req.requisition_items || [];
  const items = req.status === 'partial'
    ? allItems.filter(item => item.approved_qty != null && item.approved_qty > 0)
    : allItems;

  const rowObjs = [];
  items.forEach(item => {
    const code = String(item.drug_code || '').trim();
    const alloc = allocByItem[item.id] || (Array.isArray(item.picked_allocation) ? item.picked_allocation : null);
    let entries;
    if (alloc && alloc.length) {
      entries = alloc.map(a => ({ lot: a.lot || '', exp: a.exp || '', out: Number(a.base) || 0, price: a.price_per_unit ?? null, snap: a.onhand ?? null }));
    } else if (item.picked_lot) {
      // legacy (ก่อน B-base): จัดแบบระบุ lot เดียว ไม่มี allocation
      entries = [{ lot: item.picked_lot, exp: item.picked_exp || item.exp || '', out: Number(item.picked_qty ?? item.approved_qty ?? item.requested_qty) || 0, price: item.price_per_unit ?? null, snap: null }];
    } else {
      // ไม่มี lot ให้จ่ายเลย → ออก = 0 (ห้ามพิมพ์ยอดที่ขอเป็นยอดออก — ตาม HosXP "เบิก X จ่าย 0")
      entries = [{ lot: '', exp: '', out: 0, price: null, snap: null }];
    }
    const want = Number(item.approved_qty ?? item.requested_qty) || 0;
    const out = entries.reduce((s, e) => s + e.out, 0);
    // หมายเหตุระดับรายการ: เหตุผลจ่ายไม่ครบ / จ่ายเกินเต็มกล่อง / โน้ตผู้เบิก / โน้ตคลัง
    const itemNotes = [];
    if (item.item_note) itemNotes.push(item.item_note);
    if (item.staff_note) itemNotes.push(item.staff_note);
    if (out < want) {
      // "ยาหมดรอของส่ง" = สถานะสด ณ วันพิมพ์ (live) โดยเจตนา — ผู้เบิกต้องรู้ว่า "ตอนนี้" ยาหมดหรือยัง
      // ไม่ผูกกับ snapshot ที่คอลัมน์คงเหลือหลังจ่ายใช้ (นั่นคือยอด ณ ตอนจัด) จึงอาจต่างจากคอลัมน์นั้นในใบเก่า
      const liveTotal = onHandByCode[code] ?? 0;
      const remainAfter = qtyIsPostDispense(req, lastImportAt) ? liveTotal : liveTotal - out;
      const wo = `เบิก ${want.toLocaleString()} จ่าย ${out.toLocaleString()}`;
      if (discontinuedCodes.has(code))    itemNotes.push(`${wo} ยาตัดออกจากบัญชี`);
      else if (pendingCodes.has(code))    itemNotes.push(`${wo} รอตรวจรับ`);
      else if (remainAfter <= 0)          itemNotes.push(`${wo} ยาหมดรอของส่ง`);
    } else if (out > want) {
      itemNotes.push(`ขอ ${want.toLocaleString()} จ่าย ${out.toLocaleString()} — จ่ายเต็มกล่อง`);
    }
    entries.forEach((e, ei) => {
      const key = `${code}|${String(e.lot || '').trim()}`;
      const ref = logMap[key] || {};
      const { before, after } = lotBeforeAfter(req, code, e.lot, e.out, e.snap, onHandByLot, lastImportAt);
      const notes = [];
      if (entries.length > 1) notes.push(`มี${entries.length}lot`);
      if (e.exp && isNearExpiry(e.exp)) {
        const cd = expCountdown(e.exp);
        notes.push(cd === 'หมดอายุแล้ว' ? cd : `ใกล้exp ${cd.replace(/^อีก /, '')}`);
      }
      if (supplierChangedLots.has(key)) notes.push('เปลี่ยนบริษัท');
      if (ei === 0) notes.push(...itemNotes);
      rowObjs.push({
        mainLog: ref.main_log || '', detailLog: ref.detail_log || '',
        code: code || '-', drugType: item.drug_type || '-', name: item.drug_name || '-',
        unit: item.drug_unit || '-', price: e.price, lot: e.lot || '-', exp: e.exp,
        itemType: ref.item_type || '-', before, out: e.out, after, note: notes.join(' '),
      });
    });
  });
  // เรียงตามเส้นทางเดินหยิบ — ไม่มีที่เก็บไปท้ายสุด
  const sk = v => (v && String(v).trim()) ? String(v).trim() : '￿';
  rowObjs.sort((a, b) => sk(a.mainLog).localeCompare(sk(b.mainLog), 'en') || sk(a.detailLog).localeCompare(sk(b.detailLog), 'en'));

  const dateCol = fmtDateCE(req.created_at);
  const rows = rowObjs.map(r => `
    <tr>
      <td class="c">${dateCol}</td>
      <td class="c">${r.mainLog || '-'}</td>
      <td class="c">${r.detailLog || '-'}</td>
      <td class="c">${r.code}</td>
      <td class="c">${r.drugType}</td>
      <td>${r.name}</td>
      <td class="c">${r.unit}</td>
      <td class="r">${r.price != null ? Number(r.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
      <td class="c">${r.lot}</td>
      <td class="c${r.exp && isNearExpiry(r.exp) ? ' exp-near' : ''}">${r.exp ? fmtExp(r.exp) : '-'}</td>
      <td class="c">${r.itemType}</td>
      <td class="r">${r.before.toLocaleString()}</td>
      <td class="r">${r.out.toLocaleString()}</td>
      <td class="r">${r.after.toLocaleString()}</td>
      <td class="c">${req.department || '-'}</td>
      <td>${r.note}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
    <title>ใบ lot คุม ${req.req_number}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
      @page { size: A4 landscape; margin: 8mm; }
      body { font-family: 'Sarabun', sans-serif; font-size: 13px; margin: 12px; color: #111;
             -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .head { display: flex; justify-content: space-between; align-items: baseline; font-weight: 700; font-size: 16px; }
      .meta { color: #334155; font-size: 12px; margin: 2px 0 8px; }
      table { width: 100%; border-collapse: collapse; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      th, td { border: 1px solid #94a3b8; padding: 3px 5px; font-size: 11.5px; vertical-align: top; }
      th { font-weight: 700; text-align: center; background: #f1f5f9; }
      td.c { text-align: center; } td.r { text-align: right; }
      td.exp-near { background: #f87171; font-weight: 600; }
    </style></head><body>
    <div class="head">
      <span>${req.department || '-'}</span>
      <span>${fmtDateCE(now)} เวลา:${pad(now.getHours())}:${pad(now.getMinutes())}</span>
    </div>
    <div class="meta">
      ใบ lot คุม — เลขที่: <strong>${req.req_number}</strong>
      &nbsp;|&nbsp; ผู้เบิก: ${req.requester_name || '-'}
      ${req.picker_name ? `&nbsp;|&nbsp; ผู้จัดยา: ${req.picker_name}` : ''}
      &nbsp;|&nbsp; สถานะ: ${STATUS_CONFIG[req.status]?.label || req.status}
      ${!isPicked ? ' <strong style="color:#b45309">(ประมาณการ FEFO — ยังไม่จัดยา)</strong>' : ''}
    </div>
    <table>
      <thead><tr>
        <th>วันที่เบิก</th><th>MainLog</th><th>DetailedLog</th><th>รหัส</th><th>ชนิด</th>
        <th>รายการยา</th><th>หน่วย</th><th>ราคา/หน่วย</th><th>Lot Number</th><th>Exp</th>
        <th>ชนิดรายการ</th><th>คงเหลือก่อนเบิก</th><th>ปริมาณ (ออก)</th><th>คงเหลือหลังจ่าย</th>
        <th>หน่วยงานที่เบิก</th><th>หมายเหตุ</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const w = preopenedWin && !preopenedWin.closed ? (preopenedWin.location.href = url, preopenedWin) : window.open(url, '_blank');
  if (w) setTimeout(() => URL.revokeObjectURL(url), 30000);
  else   URL.revokeObjectURL(url);
}

// ============================================================
// ใบปะหน้า "ใบเบิกเวชภัณฑ์ยา" (ฟอร์มราชการ) — replica ฟอร์มกระดาษ พิมพ์แทนเขียนมือ
// ตารางระดับรายการยา (ไม่ลง lot) + สายลายเซ็น: ผู้เขียนคำขอ/ผู้จ่ายยา/ผู้รับยา/ผู้เบิก/ผู้อนุมัติเบิกจ่าย
// ============================================================
async function printCoverForm(req, preopenedWin) {
  const { allocByItem, onHandByCode } = await computeReqAllocations([req]);
  const lastImportAt = await fetchLastInventoryImportAt();
  const post = qtyIsPostDispense(req, lastImportAt);
  const isPicked = !['pending', 'approved', 'partial', 'rejected'].includes(req.status);
  const allItems = req.requisition_items || [];
  const items = req.status === 'partial'
    ? allItems.filter(item => item.approved_qty != null && item.approved_qty > 0)
    : allItems;
  const thaiDate = new Date(req.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

  // แถวตาราง: ≤12 รายการพิมพ์ตรง, เกินนั้นใช้ "ตามเอกสารแนบท้าย" ตามธรรมเนียมฟอร์ม
  // จำนวนที่จ่าย/คงเหลือหลังจ่าย เติมเมื่อจัดยาแล้วเท่านั้น — ยังไม่จัดเว้นว่างให้คลังเขียน
  const MAX_INLINE = 12, MIN_ROWS = 7;
  let bodyRows;
  if (items.length > MAX_INLINE) {
    bodyRows = `<tr><td class="c">-</td><td>ตามเอกสารแนบท้าย จำนวน ${items.length} รายการ</td><td></td><td></td><td></td><td></td><td></td></tr>`
      + Array.from({ length: MIN_ROWS - 1 }, () => '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('');
  } else {
    const filled = items.map((item, i) => {
      const code = String(item.drug_code || '').trim();
      const want = Number(item.approved_qty ?? item.requested_qty) || 0;
      const alloc = allocByItem[item.id] || (Array.isArray(item.picked_allocation) ? item.picked_allocation : null);
      const out = !isPicked ? null
        : (alloc && alloc.length) ? alloc.reduce((s, a) => s + (Number(a.base) || 0), 0)
        : item.picked_lot ? (Number(item.picked_qty ?? want) || 0)
        : 0;
      const live = onHandByCode[code] ?? 0;
      const before = (post && out != null) ? live + out : live;
      const after = out != null ? Math.max(0, before - out) : null;
      return `<tr>
        <td class="c">${i + 1}</td>
        <td>${item.drug_name || '-'}</td>
        <td class="c">${item.drug_unit || '-'}</td>
        <td class="r">${before.toLocaleString()}</td>
        <td class="r">${want.toLocaleString()}</td>
        <td class="r">${out != null ? out.toLocaleString() : ''}</td>
        <td class="r">${after != null ? after.toLocaleString() : ''}</td>
      </tr>`;
    });
    const blanks = Array.from({ length: Math.max(0, MIN_ROWS - items.length) },
      () => '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>');
    bodyRows = [...filled, ...blanks].join('');
  }

  const dotted = (w = 140) => `<span class="dot" style="min-width:${w}px"></span>`;
  const dateLine = `วันที่ ${dotted(40)} / ${dotted(40)} / ${dotted(60)}`;

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
    <title>ใบเบิกเวชภัณฑ์ยา ${req.req_number}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
      @page { size: A4 portrait; margin: 14mm 14mm 10mm; }
      body { font-family: 'Sarabun', sans-serif; font-size: 14.5px; color: #111; margin: 16px; line-height: 1.7; }
      .num { text-align: right; font-size: 14px; }
      h2 { text-align: center; font-size: 19px; margin: 2px 0 4px; text-decoration: underline; text-underline-offset: 5px; }
      .hosp { text-align: right; line-height: 1.6; margin-bottom: 6px; }
      .dot { display: inline-block; border-bottom: 1px dotted #333; height: 1em; vertical-align: baseline; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; }
      th, td { border: 1px solid #333; padding: 4px 6px; font-size: 13.5px; }
      th { font-weight: 600; text-align: center; }
      td.c { text-align: center; } td.r { text-align: right; }
      .cols { display: flex; gap: 24px; margin-top: 6px; }
      .col { flex: 1; font-size: 14px; }
      .blk { margin-bottom: 22px; page-break-inside: avoid; }
      .blk p { margin: 0 0 6px; }
      .indent { margin-left: 16px; }
      .sig-center { text-align: center; }
    </style></head><body>
    <p class="num">เลขที่เบิก <span class="dot" style="min-width:120px;text-align:center;font-weight:600">&nbsp;${req.req_number}&nbsp;</span></p>
    <h2>ใบเบิกเวชภัณฑ์ยา</h2>
    <div class="hosp"><strong>${COVER_FORM.hospital}</strong><br>วันที่ <span class="dot" style="min-width:110px;text-align:center">&nbsp;${thaiDate}&nbsp;</span></div>
    <p>เรียน ผู้อำนวยการ${COVER_FORM.hospital}</p>
    <p>ข้าพเจ้า <span class="dot" style="min-width:200px;text-align:center">&nbsp;${req.requester_name || ''}&nbsp;</span>
       ตำแหน่ง ${dotted(220)}</p>
    <p>หน่วยงานผู้เบิก(ฝ่าย) <span class="dot" style="min-width:240px;text-align:center">&nbsp;${req.department || ''}&nbsp;</span>
       มีความประสงค์จะขอเบิกวัสดุเพื่อใช้ในรายการต่อไปนี้</p>
    <table>
      <thead><tr>
        <th style="width:52px">ลำดับที่</th><th>รายการ</th><th style="width:70px">หน่วยนับ</th>
        <th style="width:80px">คงเหลือ<br>ก่อนจ่าย</th><th style="width:85px">จำนวนที่เบิก</th>
        <th style="width:85px">จำนวนที่จ่าย</th><th style="width:80px">คงเหลือ<br>หลังจ่าย</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div class="cols">
      <div class="col">
        <div class="blk">
          <p><strong>เรียน หัวหน้ากลุ่มงาน / หน่วยงาน</strong></p>
          <p class="indent">- เพื่อเห็นชอบให้เบิกวัสดุเพื่อใช้ในงานราชการ</p>
          <p>ในหน่วยงาน <span class="dot" style="min-width:220px;text-align:center">&nbsp;${req.department || ''}&nbsp;</span></p>
          <p>ลงชื่อ ${dotted(200)} (ผู้เขียนคำขอ)</p>
          <p>ตำแหน่ง ${dotted(230)}</p>
          <p>${dateLine}</p>
        </div>
        <div class="blk">
          <p>(ลงชื่อ)${dotted(200)} (ผู้รับยา)</p>
          <p>ตำแหน่ง ${dotted(230)}</p>
          <p>${dateLine}</p>
        </div>
        <div class="blk">
          <p>(ลงชื่อ)${dotted(200)} (ผู้เบิก)</p>
          <p>(${dotted(220)})</p>
          <p>ตำแหน่ง ${COVER_FORM.requesterHead.position}</p>
          <p>${COVER_FORM.requesterHead.group}</p>
          <p>${dateLine}</p>
        </div>
      </div>
      <div class="col">
        <div class="blk">
          <p><strong>เรียน ${COVER_FORM.approver.role}</strong></p>
          <p class="indent">- เพื่ออนุมัติเบิกจ่ายวัสดุตามคำขอข้างต้น</p>
          <p>(ลงชื่อ)${dotted(180)} (ผู้จ่ายยาและลงทะเบียน)</p>
          <p>(${COVER_FORM.dispenser.name}) ${COVER_FORM.dispenser.role}</p>
          <p>ตำแหน่ง ${COVER_FORM.dispenser.position}</p>
          <p>${dateLine}</p>
          <p class="indent">- อนุมัติ</p>
          <p class="indent">- รับทราบการเบิกจ่าย</p>
        </div>
        <div class="blk">
          <p>(ลงชื่อ)${dotted(180)} (ผู้อนุมัติเบิกจ่าย)</p>
          <p>(${COVER_FORM.approver.name}) ${COVER_FORM.approver.role}</p>
          <p>ตำแหน่ง ${COVER_FORM.approver.position}</p>
          <p>${dateLine}</p>
        </div>
      </div>
    </div>
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const w = preopenedWin && !preopenedWin.closed ? (preopenedWin.location.href = url, preopenedWin) : window.open(url, '_blank');
  if (w) setTimeout(() => URL.revokeObjectURL(url), 30000);
  else   URL.revokeObjectURL(url);
}

// ---- Requisition History ----
function RequisitionHistory({ info, onBack, auth = {} }) {
  const [list, setList]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // { type:'delete'|'edit', req }
  const [editDraft, setEditDraft]       = useState(null); // { note, items:[{id,requested_qty,note,...}] }
  const [saving, setSaving]             = useState(false);
  const [actionMsg, setActionMsg]       = useState('');
  const [itemSearch, setItemSearch]     = useState('');
  const [drugSearch, setDrugSearch]     = useState('');
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');
  const [confirmingReceived, setConfirmingReceived] = useState(null); // req.id

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    let q = supabase.from('requisitions').select('*, requisition_items(*)')
      .eq('department', info.department).eq('requester_name', info.name)
      .order('created_at', { ascending: false }).limit(100);
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59');
    const { data } = await q;
    setList(data || []); setLoading(false);
  }, [info, dateFrom, dateTo]);

  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase.channel('req-history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisitions' }, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  const openEdit = (req) => {
    setEditDraft({ note: req.note || '', items: req.requisition_items.map(i => ({ ...i, requested_qty: i.requested_qty })) });
    setConfirmModal({ type: 'edit', req });
    setItemSearch('');
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteRequesterRequisition(confirmModal.req.id, auth);
      setActionMsg('ลบใบเบิกสำเร็จ — เจ้าหน้าที่คลังยารับทราบแล้ว');
      setConfirmModal(null);
      load();
    } catch (e) { setActionMsg('เกิดข้อผิดพลาด: ' + e.message); }
    setSaving(false);
    setTimeout(() => setActionMsg(''), 4000);
  };

  const handleConfirmReceived = async (req) => {
    try {
      await confirmReceivedRequisition(req.id, info.name, auth);
      setActionMsg('ยืนยันรับยาสำเร็จ');
      setConfirmingReceived(null);
      load();
    } catch (e) { setActionMsg('เกิดข้อผิดพลาด: ' + e.message); }
    setTimeout(() => setActionMsg(''), 4000);
  };

  const handleEdit = async () => {
    setSaving(true);
    try {
      await updateRequesterRequisition(confirmModal.req.id, editDraft, auth);
      setActionMsg('แก้ไขใบเบิกสำเร็จ — เจ้าหน้าที่คลังยารับทราบแล้ว');
      setConfirmModal(null);
      load();
    } catch (e) { setActionMsg('เกิดข้อผิดพลาด: ' + e.message); }
    setSaving(false);
    setTimeout(() => setActionMsg(''), 4000);
  };

  // รายชื่อยาทั้งหมดจากประวัติ — สำหรับ autocomplete
  const historyDrugNames = useMemo(() => {
    const seen = new Set();
    list.forEach(req => (req.requisition_items || []).forEach(item => {
      if (item.drug_name) seen.add(item.drug_name.trim());
    }));
    return [...seen].sort().map(name => ({ name, type: '' }));
  }, [list]);

  // กรองใบเบิกที่มียาตรงกับ drugSearch
  const filteredList = useMemo(() => {
    if (!drugSearch.trim()) return list;
    const q = drugSearch.toLowerCase();
    return list.filter(req =>
      (req.requisition_items || []).some(item =>
        item.drug_name?.toLowerCase().includes(q)
      )
    );
  }, [list, drugSearch]);

  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader onBack={onBack} title="ประวัติการเบิกยา">
        <button onClick={load} className="text-slate-500 hover:text-[#1E90FF] p-1 transition-colors"><RefreshCcw size={18} /></button>
      </PageHeader>

      {actionMsg && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-800 text-sm font-medium">
          <CheckCircle size={16} className="text-emerald-600 shrink-0" /> {actionMsg}
        </div>
      )}

      <div className="flex-1 p-4 space-y-3">
        {/* Date range filter */}
        <div className="flex flex-wrap items-center gap-2">
          <IsoDateInput value={dateFrom} onChange={v => { setDateFrom(v); setLoading(true); }} className="flex-1 min-w-[130px]" />
          <span className="text-slate-400 text-sm">–</span>
          <IsoDateInput value={dateTo} onChange={v => { setDateTo(v); setLoading(true); }} className="flex-1 min-w-[130px]" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100">
              <X size={12}/> ล้าง
            </button>
          )}
        </div>

        {/* DrugSearchBar — ค้นหาย้อนหลังตามชื่อยา */}
        {!loading && list.length > 0 && (
          <DrugSearchBar
            value={drugSearch}
            onChange={setDrugSearch}
            options={historyDrugNames}
            placeholder="ค้นหายาที่เคยเบิก..."
            ringClass="focus:ring-[#1E90FF]"
            hoverClass="hover:bg-blue-50"
            maxResults={10}
          />
        )}
        {drugSearch && (
          <p className="text-xs text-slate-400 -mt-1">
            พบ {filteredList.length} ใบเบิก · ค้นหา "{drugSearch}"
          </p>
        )}
        {loading && <p className="text-center text-slate-500 py-10">กำลังโหลด...</p>}
        {!loading && filteredList.length === 0 && (
          <p className="text-center text-slate-500 py-20">
            {drugSearch ? `ไม่พบใบเบิกที่มียา "${drugSearch}"` : 'ยังไม่มีประวัติการเบิกยา'}
          </p>
        )}
        {filteredList.map(req => {
          const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
          const isPending = req.status === 'pending';
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
                  <button onClick={e => { e.stopPropagation(); printReq(req, window.open('', '_blank')); }}
                    className="p-1.5 text-slate-400 hover:text-[#1E90FF] hover:bg-[#F0F8FF] rounded-lg transition-colors" title="พิมพ์ใบเบิก">
                    <Printer size={15} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); printCoverForm(req, window.open('', '_blank')); }}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="พิมพ์ใบปะหน้า (ใบเบิกเวชภัณฑ์ยา)">
                    <FileText size={15} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); exportReqExcel([req], auth); }}
                    className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Export Excel">
                    <FileDown size={15} />
                  </button>
                  {isPending && (<>
                    <button onClick={e => { e.stopPropagation(); openEdit(req); }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="แก้ไขใบเบิก">
                      <Pencil size={15} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); setConfirmModal({ type: 'delete', req }); }}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="ลบใบเบิก">
                      <Trash2 size={15} />
                    </button>
                  </>)}
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
                        {item.picked_qty!=null && (
                          <span className="text-xs text-purple-600 font-semibold ml-2">
                            · จัด {Number(item.picked_qty).toLocaleString()} {item.drug_unit||''}
                          </span>
                        )}
                        {/* Lot/Exp ที่จ่ายจริง (ADR-0005) — ผู้เบิกเห็นว่าได้ของ lot ไหน */}
                        {Array.isArray(item.picked_allocation) && item.picked_allocation.length > 0 ? (
                          <div className="mt-1 space-y-0.5">
                            {item.picked_allocation.map((a, ai) => (
                              <p key={ai} className="text-xs text-slate-500 flex items-center gap-1 flex-wrap">
                                <span className="font-mono font-medium text-slate-600">Lot {a.lot || '-'}</span>
                                <span className="text-slate-400">· Exp {fmtExp(a.exp)} · {Number(a.base).toLocaleString()} {item.drug_unit||''}</span>
                                <span className="text-indigo-600 font-medium">({allocPackLabel(a, item.drug_unit)})</span>
                                {isNearExpiry(a.exp) && (
                                  <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded px-1 py-0.5 font-semibold"><Clock size={9}/> ใกล้หมดอายุ · {expCountdown(a.exp)}</span>
                                )}
                              </p>
                            ))}
                          </div>
                        ) : item.picked_lot ? (
                          <p className="mt-1 text-xs text-slate-500">
                            <span className="font-mono font-medium text-slate-600">{item.picked_lot}</span>
                            {item.picked_exp && <span className="text-slate-400"> · Exp {fmtExp(item.picked_exp)}</span>}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-500 text-xs">ขอ <b>{item.requested_qty}</b>{item.drug_unit && item.drug_unit !== '-' && <span> × {item.drug_unit}</span>}</span>
                      </div>
                    </div>
                  ))}
                  {req.note && <p className="text-xs text-slate-400 pt-2 border-t border-slate-200">หมายเหตุ: {req.note}</p>}
                  {req.status === 'dispensed' && (
                    <div className="pt-2 border-t border-slate-200">
                      {confirmingReceived === req.id ? (
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmingReceived(null)}
                            className="flex-1 bg-white border border-slate-200 text-slate-600 rounded-xl py-2 text-sm font-medium">
                            ยกเลิก
                          </button>
                          <button onClick={() => handleConfirmReceived(req)}
                            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white rounded-xl py-2 text-sm font-semibold transition-colors">
                            ยืนยันรับยาแล้ว
                          </button>
                        </div>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); setConfirmingReceived(req.id); }}
                          className="w-full bg-teal-50 hover:bg-teal-100 border border-teal-300 text-teal-700 rounded-xl py-2.5 font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                          <CheckCircle size={15}/> ยืนยันรับยาแล้ว
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ===== Confirmation / Edit Modal ===== */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className={`px-5 py-4 border-b flex items-center gap-3 ${confirmModal.type==='delete' ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
              <AlertCircle size={20} className={confirmModal.type==='delete' ? 'text-red-500' : 'text-blue-500'} />
              <div>
                <p className={`font-bold text-sm ${confirmModal.type==='delete' ? 'text-red-800' : 'text-blue-800'}`}>
                  {confirmModal.type==='delete' ? 'ลบใบเบิก' : 'แก้ไขใบเบิก'}
                </p>
                <p className="text-xs text-slate-500 font-mono">{confirmModal.req.req_number}</p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Staff notification warning */}
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <Bell size={15} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">การดำเนินการนี้จะ<span className="font-semibold">แจ้งให้เจ้าหน้าที่คลังยาและผู้ดูแลระบบรับทราบ</span>ทันที</p>
              </div>

              {confirmModal.type === 'delete' ? (
                <p className="text-sm text-slate-700">ต้องการลบใบเบิก <span className="font-semibold">{confirmModal.req.req_number}</span> ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
              ) : (
                <div className="space-y-3">
                  {/* Search filter — แสดงเมื่อมีรายการ > 4 */}
                  {(editDraft?.items.length || 0) > 4 && (
                    <DrugSearchBar
                      value={itemSearch}
                      onChange={setItemSearch}
                      options={(editDraft?.items || []).map(i => ({ name: i.drug_name, type: i.drug_type || '' }))}
                      placeholder="ค้นหารายการยา..."
                      ringClass="focus:ring-blue-400"
                      hoverClass="hover:bg-blue-50"
                      maxResults={10}
                    />
                  )}
                  {/* Edit items qty */}
                  {editDraft?.items
                    .filter(item => !itemSearch.trim() || item.drug_name.toLowerCase().includes(itemSearch.toLowerCase()))
                    .map((item, idx) => {
                    const realIdx = editDraft.items.findIndex(i => i.id === item.id);
                    return (
                    <div key={item.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{item.drug_name}</p>
                        <p className="text-xs text-slate-400">{item.drug_unit||'-'}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => setEditDraft(d => ({ ...d, items: d.items.map((it,i) => i===realIdx ? { ...it, requested_qty: Math.max(1, it.requested_qty-1) } : it) }))}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition-colors">−</button>
                        <span className="w-8 text-center font-bold text-slate-800">{item.requested_qty}</span>
                        <button onClick={() => setEditDraft(d => ({ ...d, items: d.items.map((it,i) => i===realIdx ? { ...it, requested_qty: it.requested_qty+1 } : it) }))}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition-colors">+</button>
                      </div>
                    </div>
                    );
                  })}
                  {/* Note */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">หมายเหตุ</label>
                    <input type="text" value={editDraft?.note||''} onChange={e => setEditDraft(d => ({ ...d, note: e.target.value }))}
                      placeholder="หมายเหตุ (ถ้ามี)"
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setConfirmModal(null)} disabled={saving}
                className="flex-1 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl py-2.5 font-medium text-sm transition-colors">
                ยกเลิก
              </button>
              <button onClick={confirmModal.type==='delete' ? handleDelete : handleEdit} disabled={saving}
                className={`flex-1 text-white rounded-xl py-2.5 font-semibold text-sm transition-colors disabled:opacity-50 ${confirmModal.type==='delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {saving ? 'กำลังดำเนินการ...' : confirmModal.type==='delete' ? 'ลบใบเบิก' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Staff Root
// ============================================================
// ============================================================
// DispatchConfirmModal — popup ยืนยันจ่ายออก (ใช้ร่วมทั้งการ์ด list + หน้ารายละเอียด)
// ============================================================
function DispatchConfirmModal({ req, onConfirm, onClose, loading = false }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-blue-100 bg-blue-50 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
            <Check size={18} className="text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-blue-800 text-sm">ยืนยันจ่ายออก</p>
            <p className="text-xs text-slate-500 font-mono truncate">{req.req_number}</p>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-700">
            ต้องการจ่ายยาตามใบเบิก <span className="font-semibold">{req.department}</span> ออกจากคลังใช่หรือไม่?
          </p>
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 truncate">
            {drugPreview(req.requisition_items)}
          </p>
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">เมื่อจ่ายออกแล้ว ใบเบิกจะถูกบันทึกเป็น<span className="font-semibold">จ่ายแล้ว</span> และตัดสต็อกตามที่จัด</p>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} disabled={loading}
            className="flex-1 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl py-2.5 font-medium text-sm transition-colors disabled:opacity-50">
            ยกเลิก
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-2.5 font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            <Check size={15} /> {loading ? 'กำลังจ่ายออก...' : 'ยืนยันจ่ายออก'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PickingModal — staff จัดยา เลือก Lot FEFO + บันทึกจำนวนที่จัด
// ============================================================
function PickingModal({ req, auth, onClose, onDone }) {
  const defaultName = (auth.name && auth.name.trim() && auth.name.trim() !== '-') ? auth.name : (auth.username || '');
  const [pickerName, setPickerName] = useState(defaultName);
  const [loadingInv, setLoadingInv]     = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  const approvedItems = useMemo(() =>
    (req.requisition_items || []).filter(item => (item.approved_qty ?? item.requested_qty) > 0),
    [req]
  );

  const [itemStates, setItemStates] = useState(() =>
    approvedItems.map(item => ({
      id:           item.id,
      drug_name:    item.drug_name,
      drug_code:    item.drug_code,
      drug_unit:    item.drug_unit,
      approved_qty: item.approved_qty ?? item.requested_qty,
      picked_lot:   '',
      picked_exp:   '',
      picked_qty:   item.approved_qty ?? item.requested_qty,
      staff_note:   item.staff_note || '',
    }))
  );

  useEffect(() => {
    const codes = [...new Set(approvedItems.map(i => i.drug_code).filter(Boolean))];
    if (!codes.length) { setLoadingInv(false); return; }
    fetchInventoryByCodes(codes).then(data => {
      const map = {};
      data.forEach(row => {
        const code = String(row.code || '').trim();
        if (!map[code]) map[code] = [];
        map[code].push(row);
      });
      // sort FEFO client-side
      Object.values(map).forEach(lots => {
        lots.sort((a, b) => {
          const da = parseExp(a.exp), db = parseExp(b.exp);
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return da - db;
        });
      });
      // คำนวณ FEFO allocation สดจากของจริง ณ ตอนนี้ (ADR-0005) — approved_qty เป็นเม็ด
      setItemStates(prev => prev.map(item => {
        const lots = map[String(item.drug_code || '').trim()] || [];
        const fefoLots = lots.map(l => {
          const { packSize, baseUnit } = parseUnit(l.unit);
          const packs = parseFloat(l.qty) || 0;
          // unit = หน่วยเต็ม (แสดง packs × unit), baseUnit = หน่วยย่อยล้วน (เม็ด/amp/ขวด) สำหรับ label คงเหลือ
          return { lot: l.lot, exp: l.exp, unit: l.unit, location: l.location, baseUnit: baseUnit || l.unit, packSize: packSize || 1, packs, base: packs * (packSize || 1) };
        });
        const alloc = allocateFefo(item.approved_qty, fefoLots);
        const first = alloc.allocation[0];
        // คงเหลือกล่องสดราย lot (lot → { packs, packSize, unit }) — แสดง "คงเหลือก่อน/หลังจ่าย" เป็นกล่อง
        // unit ใช้ baseUnit (หน่วยย่อยล้วน) กัน label เพี้ยน เช่น "× 1000เม็ด" ไม่ใช่ "× 10001000เม็ด"
        const lotOnHand = {};
        fefoLots.forEach(l => { lotOnHand[String(l.lot || '').trim()] = { packs: l.packs, packSize: l.packSize, unit: l.baseUnit }; });
        return { ...item, allocation: alloc.allocation, shortfallBase: alloc.shortfallBase, allocatedBase: alloc.allocatedBase, overBase: alloc.overBase, lotOnHand,
          picked_lot: first?.lot || '', picked_exp: first?.exp || '', picked_qty: alloc.allocatedBase };
      }));
      setLoadingInv(false);
    }).catch(() => setLoadingInv(false));
  }, []);

  const handleConfirm = async () => {
    if (!pickerName.trim()) { setError('กรุณากรอกชื่อผู้จัดยา'); return; }
    setSaving(true); setError('');
    try {
      const items = itemStates.map(it => ({
        id:         it.id,
        picked_lot: it.picked_lot || null,
        picked_exp: it.picked_exp || null,
        picked_qty: parseInt(it.picked_qty) || 0,
        picked_allocation: (it.allocation && it.allocation.length)
          // onhand = คงเหลือ lot นั้น (หน่วยย่อยสุด) snapshot ณ ตอนจัด — ใบ lot คุมใช้เป็น "คงเหลือก่อนเบิก" ที่พิมพ์ซ้ำเมื่อไหร่ก็ตรง
          ? it.allocation.map(a => {
              const oh = it.lotOnHand?.[String(a.lot || '').trim()];
              return { lot: a.lot, exp: a.exp, base: a.base, packs: a.packs, onhand: oh ? oh.packs * oh.packSize : null };
            })
          : null,
        staff_note: it.staff_note?.trim() || null,
      }));
      await startPickingRequisition(req.id, { pickerName: pickerName.trim(), items }, auth);
      onDone();
    } catch (e) { setError(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-purple-50 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
            <Package size={18} className="text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-purple-800">เริ่มจัดยา</p>
            <p className="text-xs text-slate-500 font-mono truncate">{req.req_number} · {req.department}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">ชื่อผู้จัดยา</label>
            <input type="text" value={pickerName} onChange={e => setPickerName(e.target.value)}
              placeholder="กรอกชื่อผู้จัดยา"
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400" />
          </div>

          {loadingInv ? (
            <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
              <RefreshCcw size={18} className="animate-spin" /> กำลังโหลดข้อมูล Lot...
            </div>
          ) : (
            <div className="space-y-3">
              {itemStates.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">ไม่มีรายการที่อนุมัติ</p>
              )}
              {itemStates.map((item) => {
                const alloc = item.allocation || [];
                return (
                  <div key={item.id} className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2.5">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{item.drug_name}</p>
                      <p className="text-xs text-slate-500">
                        อนุมัติ <span className="font-bold text-emerald-600">{Number(item.approved_qty).toLocaleString()}</span> {item.drug_unit || ''}
                      </p>
                    </div>
                    {alloc.length > 0 ? (
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">จ่ายจาก Lot (FEFO — ใกล้หมดอายุก่อน)</label>
                        <div className="space-y-1 bg-white border border-slate-200 rounded-lg p-2.5">
                          {alloc.map((a, ai) => {
                            const remain = remainLotPacks(item.lotOnHand?.[String(a.lot || '').trim()], a.packs);
                            return (
                            <div key={ai} className="text-sm">
                              <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 items-start">
                                <div className="flex items-center gap-x-2 gap-y-1 flex-wrap min-w-0">
                                  <span className="font-mono font-semibold text-slate-700">Lot {a.lot || '-'}</span>
                                  <span className="text-xs text-slate-400">Exp {fmtExp(a.exp)}</span>
                                  {isNearExpiry(a.exp) && (
                                    <span className="inline-flex items-center gap-0.5 text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 font-semibold"><Clock size={10}/> ใกล้หมดอายุ · {expCountdown(a.exp)}</span>
                                  )}
                                </div>
                                <div className="text-right whitespace-nowrap">
                                  <span className="font-bold text-emerald-600">{a.base.toLocaleString()} {item.drug_unit || ''}</span>
                                  <span className="block text-xs text-slate-400">({a.packs.toLocaleString()} × {a.unit})</span>
                                </div>
                              </div>
                              {a.location && a.location !== '-' && (
                                <p className="flex items-center gap-1 text-xs text-indigo-700 font-semibold mt-0.5">
                                  <MapPin size={11}/> ที่เก็บ: {a.location}
                                </p>
                              )}
                              {remain && (
                                <p className="text-xs text-slate-400 mt-0.5">
                                  คงเหลือก่อนจ่าย <span className="font-medium text-slate-600">{remain.before}</span>
                                  <span className="text-slate-400"> − เบิกออก {remain.out} = </span>
                                  <span className="font-bold text-indigo-700">{remain.label}</span>
                                </p>
                              )}
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        ไม่พบ Lot ในคลัง — กรุณาตรวจสอบสต็อก
                      </p>
                    )}
                    {item.overBase > 0 && (
                      <p className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                        <AlertCircle size={12} /> จ่ายเต็มกล่อง — ได้ {Number(item.allocatedBase).toLocaleString()} {item.drug_unit || ''} (เกินที่ขอ {Number(item.overBase).toLocaleString()})
                      </p>
                    )}
                    {item.shortfallBase > 0 && (
                      <p className="text-xs text-red-600 font-semibold flex items-center gap-1">
                        <AlertCircle size={12} /> ของไม่พอเบิก — จัดได้ {Number(item.allocatedBase).toLocaleString()} จาก {Number(item.approved_qty).toLocaleString()} {item.drug_unit || ''} (ขาด {Number(item.shortfallBase).toLocaleString()})
                      </p>
                    )}
                    <div>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {STAFF_NOTE_PRESETS.map(p => (
                          <button key={p} type="button"
                            onClick={() => setItemStates(prev => prev.map(s => s.id === item.id ? { ...s, staff_note: s.staff_note ? `${s.staff_note} ${p}` : p } : s))}
                            className="text-xs px-2 py-0.5 rounded-full border border-slate-300 bg-white text-slate-500 hover:border-purple-400 hover:text-purple-700 transition-colors">
                            {p}
                          </button>
                        ))}
                      </div>
                      <input type="text" value={item.staff_note}
                        onChange={e => setItemStates(prev => prev.map(s => s.id === item.id ? { ...s, staff_note: e.target.value } : s))}
                        placeholder="หมายเหตุคลัง (ขึ้นใบ lot คุม)"
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="px-4 pb-5 pt-3 border-t border-slate-100 flex gap-2 shrink-0">
          <button onClick={onClose} disabled={saving}
            className="flex-1 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl py-2.5 font-medium text-sm transition-colors">
            ยกเลิก
          </button>
          <button onClick={handleConfirm} disabled={saving || loadingInv || !pickerName.trim()}
            className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-2.5 font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            <Package size={15} /> {saving ? 'กำลังบันทึก...' : 'ยืนยันจัดยา'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// VerifyModal — staff คนที่ 2 ตรวจนับ (Double Check)
// ============================================================
function VerifyModal({ req, auth, onClose, onDone }) {
  const defaultName = (auth.name && auth.name.trim() && auth.name.trim() !== '-') ? auth.name : (auth.username || '');
  const [verifierName, setVerifierName] = useState(defaultName);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');
  const [onHandLotMap, setOnHandLotMap] = useState(null); // "code|lot" → { packs, packSize, unit } คงเหลือสดราย lot
  const [checkedItems, setCheckedItems] = useState({});    // item.id → staff ติ๊กว่าตรวจรายการนี้ถูกต้องแล้ว

  const pickedItems = (req.requisition_items || []).filter(item => item.picked_qty != null);

  // โหลดคงเหลือสดราย lot เพื่อให้ผู้ตรวจนับเทียบ "คงเหลือหลังจ่าย" เป็นกล่อง × หน่วยย่อย (นับของจริงง่าย)
  useEffect(() => {
    if (!supabase) return;
    const codes = [...new Set((req.requisition_items || []).filter(i => i.picked_qty != null).map(i => i.drug_code).filter(Boolean))];
    if (!codes.length) { setOnHandLotMap({}); return; }
    fetchInventoryByCodes(codes).then(data => {
      const map = {};
      data.forEach(row => {
        const key = `${String(row.code || '').trim()}|${String(row.lot || '').trim()}`;
        const { packSize, baseUnit } = parseUnit(row.unit);
        const packs = parseFloat(row.qty) || 0;
        // เก็บ baseUnit (หน่วยย่อยไม่มีตัวเลข) — label = packs × packSize+baseUnit เช่น "0 × 100เม็ด"
        const prev = map[key] || { packs: 0, packSize: packSize || 1, unit: baseUnit || row.unit || '' };
        prev.packs += packs;
        map[key] = prev;
      });
      setOnHandLotMap(map);
    }).catch(() => setOnHandLotMap({}));
  }, [req.id]);
  const isSamePicker = verifierName.trim() && verifierName.trim() === req.picker_name;
  const allChecked = pickedItems.length > 0 && pickedItems.every(item => checkedItems[item.id]);

  const handleConfirm = async () => {
    if (!verifierName.trim()) { setError('กรุณากรอกชื่อผู้ตรวจนับ'); return; }
    if (!allChecked) { setError('กรุณาติ๊กยืนยันให้ครบทุกรายการก่อน'); return; }
    setSaving(true); setError('');
    try {
      await verifyRequisition(req.id, verifierName.trim(), auth);
      onDone();
    } catch (e) { setError(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-indigo-50 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
            <CheckCircle size={18} className="text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-indigo-800">ตรวจนับยา (Double Check)</p>
            <p className="text-xs text-slate-500 truncate">ผู้จัด: <span className="font-medium">{req.picker_name || '-'}</span> · {req.req_number}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">ชื่อผู้ตรวจนับ</label>
            <input type="text" value={verifierName} onChange={e => setVerifierName(e.target.value)}
              placeholder="กรอกชื่อผู้ตรวจนับ"
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            {isSamePicker && (
              <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 mt-2">
                <AlertCircle size={14} className="text-orange-500 shrink-0 mt-0.5" />
                <p className="text-xs text-orange-700">ชื่อตรงกับผู้จัดยา — แนะนำให้ใช้เจ้าหน้าที่คนอื่นตรวจนับเพื่อความถูกต้อง</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">รายการที่จัดแล้ว</p>
            {pickedItems.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">ไม่มีรายการที่จัดแล้ว</p>
            )}
            {pickedItems.map(item => {
              const allocs = Array.isArray(item.picked_allocation) && item.picked_allocation.length
                ? item.picked_allocation
                : [{ lot: item.picked_lot, exp: item.picked_exp, base: item.picked_qty, packs: null }];
              const checked = !!checkedItems[item.id];
              return (
              <div key={item.id} className={`rounded-xl border px-3 py-2.5 ${checked ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800 min-w-0 truncate">{item.drug_name}</p>
                  <div className="shrink-0 text-right">
                    <span className="text-sm font-bold text-indigo-700">{Number(item.picked_qty).toLocaleString()}</span>
                    <span className="text-xs text-slate-500 ml-1">{item.drug_unit || ''}</span>
                  </div>
                </div>
                {/* แต่ละ lot ที่จ่าย + คงเหลือหลังจ่ายเป็นกล่อง × หน่วยย่อย (นับของจริงง่าย) */}
                <div className="mt-1 space-y-1">
                  {allocs.map((a, ai) => {
                    const key = `${String(item.drug_code || '').trim()}|${String(a.lot || '').trim()}`;
                    const on = onHandLotMap ? onHandLotMap[key] : null;
                    const remain = remainLotPacks(on, a.packs);
                    return (
                      <div key={ai} className="text-xs text-slate-500">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="font-mono font-medium text-slate-600">Lot {a.lot || '-'}</span>
                          {a.exp && <span className="text-slate-400">· Exp {fmtExp(a.exp)}</span>}
                          {isNearExpiry(a.exp) && (
                            <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded px-1 py-0.5 font-semibold"><Clock size={9}/> ใกล้หมดอายุ · {expCountdown(a.exp)}</span>
                          )}
                          <span className="text-slate-400">· จ่าย {Number(a.base).toLocaleString()} {item.drug_unit || ''}</span>
                        </div>
                        {remain && (
                          <p className="text-slate-400 mt-0.5">
                            คงเหลือก่อนจ่าย <span className="font-medium text-slate-600">{remain.before}</span>
                            <span> − เบิกออก {remain.out} = </span>
                            <span className="font-bold text-indigo-700">{remain.label}</span>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* ติ๊กยืนยันว่าตรวจรายการนี้ถูกต้องแล้ว */}
                <button type="button" onClick={() => setCheckedItems(p => ({ ...p, [item.id]: !p[item.id] }))}
                  className={`mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors ${checked ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:border-emerald-400'}`}>
                  <CheckCircle size={14} /> {checked ? 'ตรวจรับรายการนี้แล้ว ✓' : 'ติ๊กเมื่อตรวจรายการนี้ถูกต้อง'}
                </button>
              </div>
              );
            })}
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="px-4 pb-5 pt-3 border-t border-slate-100 flex gap-2 shrink-0">
          <button onClick={onClose} disabled={saving}
            className="flex-1 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl py-2.5 font-medium text-sm transition-colors">
            ยกเลิก
          </button>
          <button onClick={handleConfirm} disabled={saving || !verifierName.trim() || !allChecked}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-2.5 font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            <CheckCircle size={15} /> {saving ? 'กำลังบันทึก...' : 'ยืนยันถูกต้อง'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StaffRoot({ onBack, alreadyAuthed = false, auth = {} }) {
  const [authed, setAuthed]     = useState(alreadyAuthed);
  const [selected, setSelected] = useState(null);
  // tab/date filter ยกขึ้นมาที่นี่ — กันรีเซ็ตเมื่อเปิดดูรายละเอียดใบเบิกแล้วกดย้อนกลับ
  const [filter, setFilter]         = useState('pending');
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));

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
  if (selected) return <RequisitionDetail req={selected} onBack={() => setSelected(null)} onDone={() => setSelected(null)} auth={auth} />;
  return <StaffDashboard onLogout={() => alreadyAuthed ? onBack() : setAuthed(false)} onSelect={setSelected} auth={auth} filter={filter} setFilter={setFilter} dateFilter={dateFilter} setDateFilter={setDateFilter} />;
}

// ---- Staff Dashboard ----
function StaffDashboard({ onLogout, onSelect, auth = {}, filter, setFilter, dateFilter, setDateFilter }) {
  const [list, setList]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [deleteId, setDeleteId] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [searchDept, setSearchDept] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [pickingModal, setPickingModal] = useState(null); // req object
  const [verifyModal, setVerifyModal]   = useState(null); // req object
  const [dispatchModal, setDispatchModal] = useState(null); // req ที่กำลังยืนยันจ่ายออก
  const [dispatching, setDispatching]     = useState(false); // กำลังจ่ายออก (loading)

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (deleteId !== id) { setDeleteId(id); return; }
    const req = list.find(r => r.id === id);
    await supabase.from('requisition_items').delete().eq('requisition_id', id);
    await supabase.from('requisitions').delete().eq('id', id);
    insertAuditLog({ action: 'delete_requisition', table_name: 'requisitions', user_name: resolveAuditUserName(auth), department: auth?.department || '-', details: { req_number: req?.req_number, requisition_id: id } });
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
    const ids = [...selected];
    for (const id of ids) {
      const req = list.find(r => r.id === id);
      await supabase.from('requisition_items').delete().eq('requisition_id', id);
      await supabase.from('requisitions').delete().eq('id', id);
      insertAuditLog({ action: 'delete_requisition', table_name: 'requisitions', user_name: resolveAuditUserName(auth), department: auth?.department || '-', details: { req_number: req?.req_number, requisition_id: id } });
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
      insertAuditLog({ action: 'update_requisition', table_name: 'requisitions', user_name: resolveAuditUserName(auth), department: auth?.department || '-', details: { req_number: req.req_number, requisition_id: id, action_detail: 'bulk_approve' } });
    }
    await load();
    setSelected(new Set());
    setBulkLoading(false);
  };

  const approveOne = async (req, e) => {
    e.stopPropagation();
    if (!supabase || req.status !== 'pending') return;
    for (const item of req.requisition_items || []) {
      await supabase.from('requisition_items').update({ approved_qty: item.requested_qty }).eq('id', item.id);
    }
    await supabase.from('requisitions').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', req.id);
    insertAuditLog({ action: 'update_requisition', table_name: 'requisitions', user_name: resolveAuditUserName(auth), department: auth?.department || '-', details: { req_number: req.req_number, requisition_id: req.id, action_detail: 'quick_approve' } });
    load();
  };

  const confirmDispatch = async () => {
    if (!dispatchModal) return;
    setDispatching(true);
    try {
      await markRequisitionDispensed(dispatchModal.id, auth);
      load();
    } catch {}
    setDispatching(false);
    setDispatchModal(null);
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

  const pendingCount    = list.filter(r => r.status === 'pending').length;
  const approvedCount   = list.filter(r => r.status === 'approved' || r.status === 'partial').length;
  const pickingCount    = list.filter(r => r.status === 'picking'  || r.status === 'ready').length;

  const allDepts = [...new Set(list.map(r => r.department).filter(Boolean))].sort();

  const filtered = list.filter(r => {
    const statusMatch =
      filter === 'all'      ? true :
      filter === 'approved' ? (r.status === 'approved' || r.status === 'partial') :
      filter === 'picking'  ? (r.status === 'picking'  || r.status === 'ready') :
      r.status === filter;
    const dateMatch = filter === 'pending' || filter === 'approved' || filter === 'picking' || !dateFilter || (r.created_at && r.created_at.slice(0, 10) === dateFilter);
    const nameMatch = !searchName.trim() || (r.requester_name||'').toLowerCase().includes(searchName.trim().toLowerCase()) || (r.req_number||'').toLowerCase().includes(searchName.trim().toLowerCase());
    const deptMatch = !searchDept || r.department === searchDept;
    return statusMatch && dateMatch && nameMatch && deptMatch;
  });

  const tabs = [
    { key:'pending',  label:'รอดำเนินการ'   },
    { key:'approved', label:'รออนุมัติ/จัด' },
    { key:'picking',  label:'กำลังจัด/ตรวจ' },
    { key:'all',      label:'ประวัติ'        },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <PageHeader onBack={onLogout} title="ระบบเบิกยาออนไลน์">
        {pendingCount > 0 && (
          <span className="flex items-center gap-1 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            <Bell size={11}/> {pendingCount}
          </span>
        )}
        <button onClick={load} className="text-white/70 hover:text-white p-1 transition-colors"><RefreshCcw size={18}/></button>
      </PageHeader>

      {/* Filter Bar — mobile-responsive */}
      <div className="bg-white border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="text" value={searchName} onChange={e => setSearchName(e.target.value)}
              placeholder="ชื่อผู้เบิก หรือ เลขใบเบิก..."
              className="w-full pl-8 pr-7 py-1.5 border border-slate-300 rounded-xl text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1E90FF]" />
            {searchName && (
              <button onClick={() => setSearchName('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13}/>
              </button>
            )}
          </div>
          {/* Filter toggle — mobile only */}
          <button onClick={() => setShowFilters(f => !f)}
            className={`sm:hidden flex items-center justify-center w-9 h-9 rounded-xl border transition-colors shrink-0 ${showFilters || searchDept || !dateFilter ? 'bg-[#F0F8FF] border-[#1E90FF] text-[#1E90FF]' : 'border-slate-300 text-slate-500 hover:border-slate-400'}`}>
            <SlidersHorizontal size={16}/>
          </button>
          {/* Desktop: always visible */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="relative w-28 min-h-[36px] border border-slate-300 rounded-xl bg-white flex items-center cursor-pointer hover:border-slate-400 transition-colors focus-within:ring-2 focus-within:ring-[#1E90FF]">
              <span className={`px-2 py-1.5 text-sm pointer-events-none block w-full ${dateFilter ? 'text-slate-700' : 'text-slate-400'}`}>
                {dateFilter ? dateFilter.split('-').reverse().join('/') : 'dd/mm/yyyy'}
              </span>
              <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                onClick={e => { try { e.currentTarget.showPicker?.() } catch { /* noop */ } }}
                className="absolute inset-0 opacity-0 w-full cursor-pointer text-base" />
            </div>
            <button onClick={() => setDateFilter('')}
              className={`text-xs px-2.5 py-1.5 rounded-xl border transition-colors whitespace-nowrap ${!dateFilter ? 'bg-[#F0F8FF] text-[#1E90FF] border-[#1E90FF]' : 'text-slate-500 border-slate-300 hover:bg-slate-100'}`}>
              ทั้งหมด
            </button>
            <div className="relative min-w-[160px]">
              <select value={searchDept} onChange={e => setSearchDept(e.target.value)}
                className="w-full appearance-none pl-3 pr-7 py-1.5 border border-slate-300 rounded-xl text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1E90FF]">
                <option value="">-- ทุกหน่วยงาน --</option>
                {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <ChevronRight size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" />
            </div>
            <button onClick={() => exportReqExcel(filtered, auth)}
              className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap">
              <FileDown size={16}/> Excel
            </button>
          </div>
        </div>
        {/* Mobile expanded filters */}
        {showFilters && (
          <div className="sm:hidden mt-2 space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1 min-h-[36px] border border-slate-300 rounded-xl bg-white flex items-center cursor-pointer hover:border-slate-400 transition-colors focus-within:ring-2 focus-within:ring-[#1E90FF]">
                <span className={`px-2 py-1.5 text-sm pointer-events-none block w-full ${dateFilter ? 'text-slate-700' : 'text-slate-400'}`}>
                  {dateFilter ? dateFilter.split('-').reverse().join('/') : 'dd/mm/yyyy'}
                </span>
                <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                  onClick={e => { try { e.currentTarget.showPicker?.() } catch { /* noop */ } }}
                  className="absolute inset-0 opacity-0 w-full cursor-pointer text-base" />
              </div>
              <button onClick={() => setDateFilter('')}
                className={`text-xs px-2.5 py-1.5 rounded-xl border transition-colors whitespace-nowrap ${!dateFilter ? 'bg-[#F0F8FF] text-[#1E90FF] border-[#1E90FF]' : 'text-slate-500 border-slate-300 hover:bg-slate-100'}`}>
                ทั้งหมด
              </button>
            </div>
            <div className="relative">
              <select value={searchDept} onChange={e => setSearchDept(e.target.value)}
                className="w-full appearance-none pl-3 pr-7 py-1.5 border border-slate-300 rounded-xl text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1E90FF]">
                <option value="">-- ทุกหน่วยงาน --</option>
                {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <ChevronRight size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" />
            </div>
            <button onClick={() => exportReqExcel(filtered, auth)}
              className="w-full flex items-center justify-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-xl py-2 text-sm font-medium transition-colors">
              <FileDown size={16}/> Export Excel
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 py-2.5 bg-white border-b border-slate-200 overflow-x-auto shadow-sm">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => {
            setFilter(tab.key);
            setDeleteId(null);
            if (tab.key === 'all') {
              setDateFilter('');
            } else if (tab.key !== 'pending' && tab.key !== 'approved' && tab.key !== 'picking' && !dateFilter) {
              setDateFilter(new Date().toISOString().slice(0, 10));
            }
          }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm whitespace-nowrap font-medium transition-all ${
              filter === tab.key ? 'bg-[#F0F8FF] text-[#1E90FF]' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}>
            {tab.label}
            {tab.key === 'pending'  && pendingCount  > 0 && (
              <span className="bg-amber-500  text-white text-xs font-bold rounded-full px-1.5">{pendingCount}</span>
            )}
            {tab.key === 'approved' && approvedCount > 0 && (
              <span className="bg-green-500  text-white text-xs font-bold rounded-full px-1.5">{approvedCount}</span>
            )}
            {tab.key === 'picking'  && pickingCount  > 0 && (
              <span className="bg-purple-500 text-white text-xs font-bold rounded-full px-1.5">{pickingCount}</span>
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
              {[...selected].some(id => list.find(r => r.id === id)?.status === 'pending') && (
                <button onClick={bulkApprove} disabled={bulkLoading}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors">
                  <Check size={13}/> อนุมัติที่เลือก
                </button>
              )}
              <button onClick={bulkDelete} disabled={bulkLoading}
                className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 disabled:bg-slate-300 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors">
                <Trash2 size={13}/> ลบที่เลือก
              </button>
            </>
          )}
        </div>
      )}

      {/* Requisition Cards */}
      <div className="flex-1 p-3 space-y-3">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <RefreshCcw size={24} className="text-slate-300 animate-spin mb-2"/>
            <p className="text-sm text-slate-400">กำลังโหลด...</p>
          </div>
        )}
        {filtered.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
              <CheckCircle size={32} className="text-emerald-500"/>
            </div>
            <p className="text-base font-semibold text-slate-700">
              {filter === 'pending'  ? 'ยอดเยี่ยม!' :
               filter === 'approved' ? 'ไม่มีรายการรออนุมัติ' :
               filter === 'picking'  ? 'ไม่มีรายการกำลังจัดยา' : 'ไม่พบรายการ'}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {filter === 'pending' ? 'ไม่มีใบเบิกตกค้าง ทำงานได้ดีมาก' : 'ลองปรับตัวกรองหรือเปลี่ยนวันที่'}
            </p>
          </div>
        )}
        {filtered.map(req => {
          const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
          const confirming = deleteId === req.id;
          const isPending = req.status === 'pending';
          return (
            <div key={req.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              {/* Card body — clickable to detail */}
              <button onClick={() => onSelect(req)} className="w-full text-left p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="pt-1 shrink-0" onClick={e => toggleSelect(e, req.id)}>
                    <input type="checkbox" readOnly checked={selected.has(req.id)}
                      className="w-4 h-4 accent-[#1E90FF] cursor-pointer" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-bold text-slate-800 truncate">{req.department}</p>
                      <p className="text-xs text-slate-400 shrink-0">{timeAgo(req.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-sm text-slate-500">ผู้เบิก: <span className="font-medium text-slate-700">{req.requester_name}</span></p>
                      <span className="text-slate-300 text-xs">·</span>
                      <p className="font-mono text-xs text-slate-400">{req.req_number}</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5 bg-slate-50 rounded-xl px-2.5 py-1 truncate">
                      {drugPreview(req.requisition_items)}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5 pt-0.5">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.badge}`}>{cfg.label}</span>
                    <ChevronRight size={14} className="text-slate-300"/>
                  </div>
                </div>
              </button>
              {/* Card footer — action buttons */}
              <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-t border-slate-100">
                <div className="flex items-center gap-1">
                  <button onClick={e => { e.stopPropagation(); printReq(req, window.open('', '_blank')); }}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#1E90FF] transition-colors px-2 py-1 rounded-xl hover:bg-white">
                    <Printer size={13}/> พิมพ์
                  </button>
                  <button onClick={e => { e.stopPropagation(); printLotControl(req, window.open('', '_blank')); }}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-purple-600 transition-colors px-2 py-1 rounded-xl hover:bg-white">
                    <Printer size={13}/> ใบ lot คุม
                  </button>
                  <button onClick={e => { e.stopPropagation(); printCoverForm(req, window.open('', '_blank')); }}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 transition-colors px-2 py-1 rounded-xl hover:bg-white">
                    <FileText size={13}/> ใบปะหน้า
                  </button>
                  <button onClick={e => { e.stopPropagation(); exportReqExcel([req], auth); }}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-600 transition-colors px-2 py-1 rounded-xl hover:bg-white">
                    <FileDown size={13}/> Excel
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {filter === 'all' && (
                    <button onClick={e => handleDelete(e, req.id)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-xl border transition-colors ${
                        confirming ? 'bg-red-500 text-white border-red-500' : 'text-slate-400 border-slate-200 hover:text-red-500 hover:border-red-200 hover:bg-red-50'
                      }`}>
                      <Trash2 size={12}/> {confirming ? 'ยืนยัน?' : 'ลบ'}
                    </button>
                  )}
                  {isPending && (
                    <button onClick={e => approveOne(req, e)}
                      className="flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 text-xs font-semibold px-2.5 py-1 rounded-xl transition-colors">
                      <Check size={12}/> อนุมัติด่วน
                    </button>
                  )}
                  {(req.status === 'approved' || req.status === 'partial') && (
                    <button onClick={e => { e.stopPropagation(); setPickingModal(req); }}
                      className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-2.5 py-1 rounded-xl transition-colors">
                      <Package size={12}/> เริ่มจัดยา
                    </button>
                  )}
                  {req.status === 'picking' && (
                    <button onClick={e => { e.stopPropagation(); setVerifyModal(req); }}
                      className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-2.5 py-1 rounded-xl transition-colors">
                      <CheckCircle size={12}/> ตรวจนับ
                    </button>
                  )}
                  {req.status === 'ready' && (
                    <button onClick={e => { e.stopPropagation(); setDispatchModal(req); }}
                      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-xl transition-colors bg-blue-600 hover:bg-blue-700 text-white">
                      <Check size={12}/> จ่ายออก
                    </button>
                  )}
                  <button onClick={() => onSelect(req)}
                    className="flex items-center gap-1 bg-[#1E90FF] hover:bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors">
                    ดูรายละเอียด <ChevronRight size={12}/>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {pickingModal && (
        <PickingModal req={pickingModal} auth={auth}
          onClose={() => setPickingModal(null)}
          onDone={() => { setPickingModal(null); load(); }} />
      )}
      {verifyModal && (
        <VerifyModal req={verifyModal} auth={auth}
          onClose={() => setVerifyModal(null)}
          onDone={() => { setVerifyModal(null); load(); }} />
      )}
      {dispatchModal && (
        <DispatchConfirmModal req={dispatchModal} loading={dispatching}
          onConfirm={confirmDispatch}
          onClose={() => setDispatchModal(null)} />
      )}
    </div>
  );
}

// ---- Requisition Detail ----
function RequisitionDetail({ req, onBack, onDone, auth = {} }) {
  const [currentReq, setCurrentReq] = useState(req);
  const isPending    = currentReq.status==='pending';
  const isApproved   = currentReq.status==='approved'||currentReq.status==='partial';
  const isPicking    = currentReq.status==='picking';
  const isReady      = currentReq.status==='ready';
  const isRejected   = currentReq.status==='rejected';

  // workflow action ในหน้ารายละเอียด (จัดยา/ตรวจนับ/จ่ายออก) — reuse modal เดิม ไม่ทำ logic ซ้ำ
  const [pickingModal, setPickingModal] = useState(false);
  const [verifyModal, setVerifyModal]   = useState(false);
  const [dispatchModal, setDispatchModal] = useState(false); // popup ยืนยันจ่ายออก
  const [dispatching, setDispatching]   = useState(false);

  const confirmDispatch = async () => {
    setDispatching(true); setError('');
    try {
      await markRequisitionDispensed(currentReq.id, auth);
      onDone();
    } catch (e) { setError(e.message); setDispatching(false); setDispatchModal(false); }
  };

  const toItemState = (list) => (list||[]).map(item => ({
    ...item,
    decision:   item.approved_qty!=null?(item.approved_qty>0?'approve':'reject'):'approve',
    approvedQty: item.approved_qty??item.requested_qty,
    itemNote:   item.note||'',
  }));

  const requesterNote = req.note || '';
  const [items, setItems]         = useState(() => toItemState(req.requisition_items));
  const [staffNote, setStaffNote] = useState('');
  const [editingItems, setEditingItems] = useState({}); // item.id → เปิดปรับรายตัว
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [detailSearch, setDetailSearch] = useState('');
  const [fefoMap, setFefoMap]     = useState({}); // drug_code → fefoLots (เรียง FEFO, base units) — preview allocation ตอนอนุมัติ

  // โหลด inventory เพื่อ preview ว่าจะจ่ายจาก lot ไหน (FEFO) — แสดงตอนอนุมัติ
  useEffect(() => {
    if (!supabase) return;
    const codes = [...new Set((req.requisition_items || []).map(i => i.drug_code).filter(Boolean))];
    if (!codes.length) return;
    fetchInventoryByCodes(codes).then(data => {
      const map = {};
      data.forEach(row => {
        const code = String(row.code || '').trim();
        const { packSize } = parseUnit(row.unit);
        const packs = parseFloat(row.qty) || 0;
        if (packs <= 0) return;
        (map[code] = map[code] || []).push({ lot: row.lot, exp: row.exp, unit: row.unit, location: row.location, packSize: packSize || 1, packs, base: packs * (packSize || 1) });
      });
      Object.values(map).forEach(lots => lots.sort((a, b) => {
        const da = parseExp(a.exp), db = parseExp(b.exp);
        if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
        return da - db;
      }));
      setFefoMap(map);
    }).catch(() => {});
  }, [req.id]);

  const filteredItems = useMemo(() => {
    if (!detailSearch.trim()) return items;
    const q = detailSearch.toLowerCase();
    return items.filter(item => item.drug_name?.toLowerCase().includes(q));
  }, [items, detailSearch]);

  const detailDrugNames = useMemo(() =>
    items.map(i => ({ name: i.drug_name, type: i.drug_type || '' })),
    [items]
  );

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
        insertAuditLog({ action: 'delete_requisition', table_name: 'requisitions', user_name: resolveAuditUserName(auth), department: auth?.department || '-', details: { req_number: req.req_number, requisition_id: req.id } });
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
        // เติมหมายเหตุอัตโนมัติเมื่อจ่ายเกินที่ขอ (จ่ายเต็มกล่อง ไม่แกะกล่อง) — 1 บรรทัดต่อรายการที่เกิน
        const overLines = items.map(item => {
          if (item.decision === 'reject') return null;
          const wantQty = Number(item.approvedQty) || 0;
          const lots = fefoMap[String(item.drug_code || '').trim()];
          if (wantQty <= 0 || !lots) return null;
          const a = allocateFefo(wantQty, lots);
          if (a.overBase <= 0) return null;
          const u = item.drug_unit && item.drug_unit !== '-' ? item.drug_unit : '';
          return `${MARK_OVER} ${item.drug_name}: ขอ ${wantQty.toLocaleString()} จ่าย ${a.allocatedBase.toLocaleString()} ${u} เนื่องจากจ่ายเต็มกล่อง (ไม่แกะกล่อง เกิน ${a.overBase.toLocaleString()})`.trim();
        }).filter(Boolean);
        // ตัดบรรทัด auto เดิมออกก่อน กัน duplicate เมื่อ save ซ้ำ แล้วต่อบรรทัดใหม่
        const baseNote = (staffNote || requesterNote || '').split('\n').filter(l => !l.startsWith(MARK_OVER)).join('\n').trim();
        const finalNote = [baseNote, ...overLines].filter(Boolean).join('\n') || null;
        await supabase.from('requisitions').update({ status, note:finalNote, updated_at:new Date().toISOString() }).eq('id',req.id);
        insertAuditLog({ action: 'update_requisition', table_name: 'requisitions', user_name: resolveAuditUserName(auth), department: auth?.department || '-', details: { req_number: req.req_number, requisition_id: req.id, status } });
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
            <button onClick={() => exportReqExcel([currentReq], auth)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors shadow-sm no-print">
              <FileDown size={16}/> Excel
            </button>
            <button onClick={() => printReq(currentReq, window.open('', '_blank'))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#1E90FF] text-sm font-semibold transition-colors shadow-sm no-print">
              <Printer size={16}/> พิมพ์
            </button>
            <button onClick={() => printLotControl(currentReq, window.open('', '_blank'))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-purple-600 text-sm font-semibold transition-colors shadow-sm no-print">
              <Printer size={16}/> ใบ lot คุม
            </button>
            <button onClick={() => printCoverForm(currentReq, window.open('', '_blank'))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-indigo-600 text-sm font-semibold transition-colors shadow-sm no-print">
              <FileText size={16}/> ใบปะหน้า
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
          {/* Search bar — แสดงเมื่อมีรายการ > 3 */}
          {items.length > 3 && (
            <div className="no-print">
              <DrugSearchBar
                value={detailSearch}
                onChange={setDetailSearch}
                options={detailDrugNames}
                placeholder="ค้นหารายการยาในใบเบิก..."
                ringClass="focus:ring-[#1E90FF]"
                hoverClass="hover:bg-blue-50"
                maxResults={15}
              />
              {detailSearch && (
                <p className="text-xs text-slate-400 mt-1">
                  พบ {filteredItems.length} / {items.length} รายการ
                  {filteredItems.length === 0 && <span className="text-red-500"> — ไม่พบรายการที่ค้นหา</span>}
                </p>
              )}
            </div>
          )}

          {filteredItems.map((item) => {
            const realIdx = items.findIndex(it => it.id === item.id);
            return (
            <div key={item.id} className="print-card bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-slate-100 text-slate-600 font-bold text-sm flex items-center justify-center mt-0.5">{realIdx+1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className="font-semibold text-slate-800 flex-1">{item.drug_name}</p>
                    {item.drug_type && item.drug_type !== '-' && <DrugTypeBadge type={item.drug_type} />}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">รหัส: {item.drug_code}</p>
                  <p className="text-sm mt-1 text-slate-600">ขอเบิก <span className="font-bold text-slate-800">{Number(item.requested_qty).toLocaleString()}</span> {item.drug_unit && item.drug_unit !== '-' ? item.drug_unit : ''}</p>
                  {item.item_note && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mt-1.5">หมายเหตุจากผู้เบิก: {item.item_note}</p>}

                  {/* Preview: จะจ่ายจาก lot ไหน (FEFO) — คำนวณจากจำนวนที่จะอนุมัติ */}
                  {(() => {
                    const wantQty = item.decision === 'reject' ? 0 : Number(item.approvedQty) || 0;
                    if (wantQty <= 0) return null;
                    const lots = fefoMap[String(item.drug_code || '').trim()];
                    if (!lots) return null;
                    const a = allocateFefo(wantQty, lots);
                    if (!a.allocation.length) return (
                      <p className="no-print text-xs text-red-600 font-semibold mt-1.5 flex items-center gap-1"><AlertCircle size={12}/> ไม่มีของในคลัง</p>
                    );
                    return (
                      <div className="no-print mt-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1"><Package size={12}/> จะจ่ายจาก Lot (ใกล้หมดอายุก่อน)</p>
                        <div className="space-y-1">
                          {a.allocation.map((al, ai) => (
                            <div key={ai} className="text-xs">
                              <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 items-start">
                                <div className="flex items-center gap-x-2 gap-y-1 flex-wrap min-w-0">
                                  <span className="font-mono font-semibold text-slate-700">{al.lot || '-'}</span>
                                  <span className="text-slate-400">Exp {fmtExp(al.exp)}</span>
                                  {isNearExpiry(al.exp) && (
                                    <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 font-semibold">
                                      <Clock size={10}/> ใกล้หมดอายุ · {expCountdown(al.exp)}
                                    </span>
                                  )}
                                </div>
                                <div className="text-right whitespace-nowrap">
                                  <span className="font-bold text-emerald-600">{al.base.toLocaleString()} {item.drug_unit||''}</span>
                                  <span className="text-slate-400"> ({al.packs.toLocaleString()} × {al.unit})</span>
                                </div>
                              </div>
                              {al.location && al.location !== '-' && (
                                <p className="flex items-center gap-1 text-indigo-700 font-semibold mt-0.5">
                                  <MapPin size={11}/> ที่เก็บ: {al.location}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                        {a.overBase > 0 && (
                          <p className="text-xs text-amber-600 font-semibold mt-1.5 pt-1.5 border-t border-amber-100 flex items-center gap-1">
                            <AlertCircle size={12}/> จ่ายเต็มกล่อง — ได้ {a.allocatedBase.toLocaleString()} {item.drug_unit||''} (เกินที่ขอ {a.overBase.toLocaleString()})
                          </p>
                        )}
                        {!a.fulfilled && (
                          <p className="text-xs text-red-600 font-semibold mt-1.5 pt-1.5 border-t border-red-100 flex items-center gap-1">
                            <AlertCircle size={12}/> ของไม่พอเบิก — ขาดอีก {a.shortfallBase.toLocaleString()} {item.drug_unit||''} (จัดได้ {a.allocatedBase.toLocaleString()})
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* สถานะการอนุมัติ (collapsed default = อนุมัติเต็ม) */}
                  {isPending && !editingItems[item.id] && (
                    <div className="no-print flex items-center gap-2 mt-2 flex-wrap">
                      {item.decision === 'reject' ? (
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-500"><X size={14}/> ไม่อนุมัติ</span>
                      ) : Number(item.approvedQty) !== Number(item.requested_qty) ? (
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600"><Check size={14}/> อนุมัติ {Number(item.approvedQty).toLocaleString()} {item.drug_unit||''}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600"><Check size={14}/> อนุมัติเต็มจำนวน</span>
                      )}
                      <button onClick={() => setEditingItems(p => ({ ...p, [item.id]: true }))}
                        className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-[#1E90FF] transition-colors ml-auto">
                        <Pencil size={12}/> ปรับรายการนี้
                      </button>
                    </div>
                  )}

                  {/* ปรับรายตัว (เปิดเมื่อกด) */}
                  {isPending && editingItems[item.id] && (
                    <div className="no-print mt-2.5 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5">
                      <div className="flex gap-1.5">
                        <button onClick={() => updateItem(realIdx,'decision','approve')}
                          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-sm font-medium transition-all border ${item.decision==='approve'?'bg-emerald-600 text-white border-emerald-600':'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                          <Check size={14}/> อนุมัติ
                        </button>
                        <button onClick={() => updateItem(realIdx,'decision','reject')}
                          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-sm font-medium transition-all border ${item.decision==='reject'?'bg-red-500 text-white border-red-500':'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                          <X size={14}/> ไม่อนุมัติ
                        </button>
                      </div>
                      {item.decision==='approve' && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-500">อนุมัติจำนวน</span>
                          <input type="number" min="0" max={item.requested_qty} value={item.approvedQty} onChange={e => updateItem(realIdx,'approvedQty',e.target.value)}
                            className="w-24 bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-slate-800 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1E90FF]" />
                          <span className="text-sm text-slate-500">{item.drug_unit||''}</span>
                        </div>
                      )}
                      <input type="text" value={item.itemNote} onChange={e => updateItem(realIdx,'itemNote',e.target.value)} placeholder="หมายเหตุรายการนี้..."
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E90FF]" />
                      <button onClick={() => setEditingItems(p => { const n={...p}; delete n[item.id]; return n; })}
                        className="text-xs text-slate-400 hover:text-slate-600 transition-colors">เสร็จ</button>
                    </div>
                  )}
                </div>

                {/* สรุปผลเมื่ออนุมัติแล้ว (read-only) */}
                {!isPending && item.approved_qty!=null && (
                  <div className="text-right shrink-0">
                    <p className={`inline-flex items-center gap-1 text-sm font-bold ${item.approved_qty>0?'text-emerald-600':'text-red-500'}`}>
                      {item.approved_qty>0 ? <><Check size={14}/> อนุมัติ {Number(item.approved_qty).toLocaleString()}</> : <><X size={14}/> ไม่อนุมัติ</>}
                    </p>
                    {item.note && <p className="text-xs text-slate-400 mt-0.5">{item.note}</p>}
                  </div>
                )}
              </div>
            </div>
            );
          })}

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
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button onClick={() => save(null)} disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 transition-all">
                <CheckCircle size={18}/>{loading?'กำลังบันทึก...':'ยืนยันอนุมัติใบเบิก'}
              </button>
              <button onClick={() => save('rejected')} disabled={loading}
                className="bg-white hover:bg-red-50 border border-red-300 text-red-600 disabled:opacity-40 rounded-xl px-4 py-3 font-semibold flex items-center justify-center gap-2 transition-all">
                <XCircle size={18}/> ไม่อนุมัติทั้งใบ
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

        {/* ── Workflow actions ตามสถานะ (จัดยา/ตรวจนับ/จ่ายออก) ── */}
        {isApproved && (
          <div className="no-print fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-slate-200">
            <button onClick={() => setPickingModal(true)} disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 transition-all">
              <Package size={18}/> เริ่มจัดยา
            </button>
          </div>
        )}
        {isPicking && (
          <div className="no-print fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-slate-200">
            <button onClick={() => setVerifyModal(true)} disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 transition-all">
              <CheckCircle size={18}/> ตรวจนับยา (Double Check)
            </button>
          </div>
        )}
        {isReady && (
          <div className="no-print fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-slate-200 space-y-2">
            <button onClick={() => setDispatchModal(true)} disabled={loading}
              className="w-full rounded-xl py-3 font-semibold flex items-center justify-center gap-2 transition-all bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-200 disabled:text-slate-400">
              <Check size={18}/> จ่ายออก
            </button>
            {error && <p className="text-red-600 text-sm text-center">{error}</p>}
          </div>
        )}
      </div>

      {pickingModal && (
        <PickingModal req={currentReq} auth={auth}
          onClose={() => setPickingModal(false)}
          onDone={() => { setPickingModal(false); onDone(); }} />
      )}
      {verifyModal && (
        <VerifyModal req={currentReq} auth={auth}
          onClose={() => setVerifyModal(false)}
          onDone={() => { setVerifyModal(false); onDone(); }} />
      )}
      {dispatchModal && (
        <DispatchConfirmModal req={currentReq} loading={dispatching}
          onConfirm={confirmDispatch}
          onClose={() => setDispatchModal(false)} />
      )}
    </>
  );
}
