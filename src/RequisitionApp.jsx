import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from './lib/supabase';
import SearchableSelect from './SearchableSelect';
import {
  ArrowLeft, Search, Plus, Minus, Trash2, Send, Pencil,
  CheckCircle, XCircle, Package, FileText,
  Printer, RefreshCcw, ChevronRight, ChevronDown, ChevronUp, Bell,
  Check, X, AlertCircle, Clock, FileDown,
  MapPin, Share2, Loader2, CheckSquare,
  ListOrdered, AlertTriangle, StickyNote, Lock, History,
} from 'lucide-react';
import { parseUnit } from './lib/unitParser';
import { allocateFefo, sortLotsForDispense, lotOrderNote, isSupportedLot } from './lib/lotAllocation';
import { findOverReserved, availableForOwn, increasedCodes } from './lib/reservationCheck';
import { RESERVING_STATUSES, summarizeHolds, applyHolds } from './lib/reservation';
import { REQ_TYPES, reqTypeLabel, reqTypeOfRows, entryUnitOf, entryUnitForLots, entryQtyText, packWord, caseOfLots, caseLine, entryPackLabel, CART_KEY, CART_TYPE_KEY } from './lib/reqType';
import { awaitsSheetEntry } from './lib/onlineReqPlan';
import { QUEUE_TABS, stageOf, tabOf, nextStep, waitText, itemAllocation, defaultPickResult, pickPayload, verifyNoteText, sortByLog, reqFlags, PICK_REASONS, VERIFY_ISSUES } from './lib/reqStaffView';
import { rankDrugs, matchDrugQuery } from './lib/drugSearchText';
import { checkDispenseLine, requesterNoteText, staffNoteText } from './lib/dispenseCheck';
import { ALREADY_GOT_PREFIX, isAlreadyGotQty, formatAlreadyGotNote, alreadyGotNoteForSubmit, recentDispenseOptions, missingAlreadyGotDetail, isoToThaiBE, qtyUnitText } from './lib/alreadyGot';
import { SORT_BY_LOG, SORT_BY_REQ, sortRowsByLog, sheetTitle, fmtDateCE, buildSheetHtml, toPackQty, fmtPackNote } from './lib/reqSheetFormat';
import { buildPaginatedHtml } from './lib/paginatedPrint';
import { reqFormTitle } from './lib/printedReqForm';
import { buildSheetXlsxBlob, htmlToPdfBlob, pagesToPdfBlob, shareOrDownload, safeFileName } from './lib/reqSheetExport';
import ConfirmModal from './ConfirmModal';
import { fetchCartDraft, saveCartDraft, deleteCartDraft, deleteRequesterRequisition, updateRequesterRequisition, deleteRequesterRequisitionItems, REQUESTER_LOCKED_MSG, submitRequisition, withdrawRequisition, insertAuditLog, resolveAuditUserName, startPickingRequisition, verifyAndDispenseRequisition, markRequisitionDispensed, confirmReceivedRequisition, fetchInventoryByCodes, fetchLastInventoryImportAt, fetchAllInventoryRows, fetchDispenseCheckData, fetchDeptRecentDispense } from './lib/db';
import DrugSearchBar from './DrugSearchBar';

// ============================================================
// Config
// ============================================================
// Drug type badge colors
// normalize code สำหรับ match — ตัด leading zeros, lowercase, แก้ scientific notation
const thaiDateFromIso = iso => { if (!iso) return null; const [y,m,d] = iso.split('-'); return `${d}/${m}/${Number(y)+543}`; };
function IsoDateInput({ value, onChange, className = '', ring = 'focus-within:ring-[#1E90FF]' }) {
  const display = thaiDateFromIso;
  return (
    <div className={`relative flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl focus-within:ring-2 ${ring} ${className}`}>
      <span className={`px-3 py-2 text-sm w-full select-none pointer-events-none ${value ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>{display(value) || 'dd/mm/yyyy'}</span>
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
  let cls = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
  if (t.includes('เม็ด') || t.includes('tablet') || t.includes('cap')) cls = 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300';
  else if (t.includes('น้ำ') || t.includes('syrup') || t.includes('liquid') || t.includes('sol')) cls = 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300';
  else if (t.includes('ฉีด') || t.includes('inject') || t.includes('iv') || t.includes('im')) cls = 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300';
  else if (t.includes('apply') || t.includes('cream') || t.includes('oint') || t.includes('ทา')) cls = 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300';
  else if (t.includes('inhale') || t.includes('สูด') || t.includes('spray')) cls = 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300';
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{type}</span>
  );
}

const STATUS_CONFIG = {
  pending:   { label: 'รอดำเนินการ',    badge: 'bg-amber-100 dark:bg-amber-950/60  text-amber-700 dark:text-amber-300  border border-amber-300 dark:border-amber-800/60'   },
  approved:  { label: 'อนุมัติแล้ว',    badge: 'bg-green-100 dark:bg-green-950/60  text-green-700 dark:text-green-300  border border-green-300 dark:border-green-800/60'   },
  partial:   { label: 'อนุมัติบางส่วน', badge: 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-300 dark:border-orange-800/60'  },
  rejected:  { label: 'ไม่อนุมัติ',     badge: 'bg-red-100 dark:bg-red-950/60    text-red-700 dark:text-red-300    border border-red-300 dark:border-red-800/60'     },
  picking:   { label: 'กำลังจัดยา',    badge: 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800/60'  },
  ready:     { label: 'รอตรวจนับ',     badge: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800/60'  },
  dispensed: { label: 'จ่ายยาแล้ว',    badge: 'bg-blue-100 dark:bg-blue-950/60   text-blue-700 dark:text-blue-300   border border-blue-300 dark:border-blue-800/60'    },
  received:  { label: 'รับยาแล้ว',     badge: 'bg-teal-100 dark:bg-teal-950/60   text-teal-700 dark:text-teal-300   border border-teal-300 dark:border-teal-800/60'    },
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

// คำนวณ allocation ต่อ item.id สำหรับ print/Excel:
//   จัดแล้ว → ใช้ picked_allocation (lot จริงที่จ่าย)
//   ยังไม่จัด → คำนวณ FEFO สดจาก inventory (preview ว่าจะได้ lot ไหน) + เติมราคาราย lot จาก receive_logs
// คืน { allocByItem: {id: [{lot,exp,base,packs,price_per_unit}]}, priceMap, logMap }
async function computeReqAllocations(reqs) {
  const allItems = reqs.flatMap(r => r.requisition_items || []);
  const codes = [...new Set(allItems.map(i => i.drug_code).filter(Boolean))];
  const logMap = {}, priceMap = {}, fefoByCode = {};
  const unitByCode = {};                 // หน่วยซื้อของรหัส (inventory.unit) — สำรองให้แถวที่ไม่มี lot
  // สำหรับหมายเหตุอัตโนมัติในใบ lot คุม (ดู CONTEXT.md §ใบ lot คุม)
  const pendingCodes = new Set();        // รหัสที่มีบิลรอตรวจรับ (จาก receive_logs — แหล่งเดียวกับ flow ค้นยาตอนเบิก)
  const discontinuedCodes = new Set();   // รหัสที่ตัดออกจากบัญชี (inventory.receive_status — precedent เดียวกับ Dashboard)
  const supplierChangedLots = new Set(); // "code|lot" ที่บิลรับ flag เปลี่ยนบริษัท
  if (supabase && codes.length) {
    // ไม่ filter qty>0 ที่ SQL — ต้องเห็นแถว qty=0/ตัดออก เพื่อ status map; FEFO มี guard packs>0 อยู่แล้ว
    // paginate จริง — Supabase cap 1000 แถว/request (limit 3000 เดิมได้จริงแค่ 1000 → export หลายใบข้อมูลหาย, Rule #2)
    const fetchPaged = async (table, cols, col) => {
      const all = [];
      for (let off = 0; ; off += 1000) {
        const { data } = await supabase.from(table).select(cols).in(col, codes).range(off, off + 999);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < 1000) break;
      }
      return all;
    };
    const [inv, rl] = await Promise.all([
      fetchPaged('inventory', 'code, lot, exp, qty, unit, main_log, location, item_type, receive_status', 'code'),
      fetchPaged('receive_logs', 'drug_code, lot, price_per_unit, receive_status, supplier_changed', 'drug_code'),
    ]);
    (inv || []).forEach(r => {
      const code = String(r.code||'').trim();
      const key = `${code}|${String(r.lot||'').trim()}`;
      if (!logMap[key]) logMap[key] = { main_log: r.main_log || '', detail_log: r.location || '', item_type: r.item_type || '', unit: r.unit || '' };
      if (!unitByCode[code] && r.unit) unitByCode[code] = r.unit;
      if (String(r.receive_status || '').includes('ตัดออก')) discontinuedCodes.add(code);
      const { packSize, baseUnit } = parseUnit(r.unit);
      const packs = parseFloat(r.qty) || 0;
      if (packs > 0) (fefoByCode[code] = fefoByCode[code] || []).push({ lot: r.lot, exp: r.exp, unit: r.unit, location: r.location, itemType: r.item_type || '', baseUnit: baseUnit || '', packSize: packSize || 1, packs, base: packs * (packSize || 1) });
    });
    // แถวซ้ำ lot เดียวกัน → บวกรวมก่อนเรียง (คงเหลือราย lot ต้องเต็มจำนวน) · ลำดับจ่าย = ยาสนับสนุนก่อน (sortLotsForDispense)
    Object.keys(fefoByCode).forEach(c => { fefoByCode[c] = sortLotsForDispense(mergeSameLotEntries(fefoByCode[c]), parseExp); });
    (rl || []).forEach(r => {
      const code = String(r.drug_code||'').trim();
      const key = `${code}|${String(r.lot||'').trim()}`;
      if (priceMap[key] == null && r.price_per_unit != null) priceMap[key] = r.price_per_unit;
      if (String(r.receive_status || '').includes('รอ')) pendingCodes.add(code);
      // ค่าว่างใน DB = '-' (3,005 แถว) — เช็คแค่ truthy เคยขึ้น "เปลี่ยนบริษัท" เกือบทุกแถว (แก้ 13/11/2569)
      if (r.supplier_changed && r.supplier_changed !== '-') supplierChangedLots.add(key);
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
      // lot หมดอายุห้ามเข้า allocation (FEFO เรียง exp เก่าสุดก่อน — ถ้าไม่กรองจะหยิบ lot หมดอายุเป็นอันดับแรก)
      const lots = (fefoByCode[String(item.drug_code||'').trim()] || []).filter(lotNotExpired);
      if (wantQty > 0 && lots.length) {
        allocByItem[item.id] = allocateFefo(wantQty, lots).allocation.map(a => withPrice(item.drug_code, a));
      }
    }
  });
  return { allocByItem, priceMap, logMap, unitByCode, onHandByCode, onHandByLot, pendingCodes, discontinuedCodes, supplierChangedLots, fefoByCode };
}

const genReqNumber = () => {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `REQ-${date}-${String(Math.floor(Math.random()*9000)+1000)}`;
};

// ============================================================
// Helpers
// ============================================================
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
    <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3">
      <button onClick={onBack} className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
        <ArrowLeft size={20} />
      </button>
      <div
        className={`flex-1 min-w-0${onRefresh ? ' hover:opacity-70 transition-opacity cursor-pointer' : ''}`}
        onClick={onRefresh}
      >
        {title    && <p className="font-bold text-slate-800 dark:text-slate-100 truncate text-lg leading-tight">{title}</p>}
        {subtitle && <p className="text-slate-500 dark:text-slate-400 truncate text-sm">{subtitle}</p>}
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
  // proxy = staff/admin สร้างใบเบิกแทนหน่วยงาน (เปิด RequesterRoot จากหน้า staff โดยไม่ prefill → เลือก ward เอง)
  const [proxy, setProxy] = useState(false);

  return (
    <RefreshCtx.Provider value={onRefresh}>
      <div className="min-h-screen bg-[#F0F8FF] dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans">
        {view === 'home'      && <HomeView      onSelect={setView} onBack={onBack} />}
        {view === 'requester' && <RequesterRoot onBack={() => prefilledUser ? onBack() : setView('home')} prefilledUser={prefilledUser} initialStep={initialStep} auth={auth} />}
        {view === 'staff' && (
          proxy
            ? <RequesterRoot onBack={() => { try { sessionStorage.removeItem(CART_KEY); } catch { /* ignore */ } setProxy(false); }} prefilledUser={null} initialStep={null} auth={auth} />
            : <StaffRoot onBack={() => startAsStaff ? onBack() : setView('home')} alreadyAuthed={startAsStaff} auth={auth} onProxyRequest={() => { try { sessionStorage.removeItem(CART_KEY); } catch { /* ignore */ } setProxy(true); }} />
        )}
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
      <button onClick={onBack} className="absolute top-5 left-5 flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-[#1E90FF] text-sm transition-colors">
        <ArrowLeft size={16} /> กลับหน้าหลัก
      </button>
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-100 dark:bg-indigo-950/60 rounded-2xl mb-4">
          <Package size={40} className="text-[#1E90FF]" />
        </div>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">ระบบเบิกยาออนไลน์</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">เลือกบทบาทของคุณเพื่อเข้าใช้งาน</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
        <button onClick={() => onSelect('requester')}
          className="group bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 rounded-2xl p-8 text-center transition shadow-sm hover:shadow-md">
          <div className="w-14 h-14 bg-blue-100 dark:bg-blue-950/60 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Package size={32} className="text-blue-600" />
          </div>
          <div className="font-bold text-lg text-slate-800 dark:text-slate-100">ผู้เบิก</div>
          <div className="text-slate-500 dark:text-slate-400 text-sm mt-1">หน่วยงาน</div>
        </button>
        <button onClick={() => onSelect('staff')}
          className="group bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-400 rounded-2xl p-8 text-center transition shadow-sm hover:shadow-md">
          <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/60 rounded-xl flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={32} className="text-emerald-600" />
          </div>
          <div className="font-bold text-lg text-slate-800 dark:text-slate-100">เจ้าหน้าที่คลังยา</div>
          <div className="text-slate-500 dark:text-slate-400 text-sm mt-1">อนุมัติ / จ่ายยา</div>
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Requester Root
// ============================================================

// ตะกร้าใน DB (requisition_cart_draft) ไม่เก็บคงเหลือ/lot preview — ค่าตอนใส่ตะกร้าเก่าได้หลายวัน
const cartItemForDb = (item) => Object.fromEntries(Object.entries(item).filter(([k]) => k !== 'fefoLots' && k !== 'availableBase'));

// โหลดตะกร้าจาก DB แล้วคำนวณคงเหลือ + lot preview ใหม่ ด้วยกฎเดียวกับ DrugSearch:
// ไม่นับ lot หมดอายุ / รอตรวจรับ (key code|lot) · หักยอดจอง · ลำดับจ่ายยาสนับสนุนก่อน
async function refreshCartStock(items) {
  const codes = [...new Set(items.map(i => i.code).filter(Boolean))];
  if (!supabase || !codes.length) return items;
  const [{ data: inv }, { data: rl }, holds] = await Promise.all([
    supabase.from('inventory').select('code, lot, exp, qty, unit, location, item_type').in('code', codes),
    supabase.from('receive_logs').select('drug_code, lot, receive_status').in('drug_code', codes),
    fetchReservationHolds(codes),
  ]);
  const pending = new Set((rl || []).filter(r => r.lot && String(r.receive_status || '').includes('รอ')).map(r => `${codeKey(r.drug_code)}|${r.lot}`));
  const lotsByCode = {};
  (inv || []).forEach(row => {
    const k = codeKey(row.code);
    const packs = parseFloat(row.qty) || 0;
    if (packs <= 0 || pending.has(`${k}|${row.lot}`) || !lotNotExpired(row)) return;
    const { packSize, baseUnit } = parseUnit(row.unit);
    (lotsByCode[k] = lotsByCode[k] || []).push({ lot: row.lot, exp: row.exp, unit: row.unit, itemType: row.item_type || '', packSize: packSize || 1, packs, base: packs * (packSize || 1), baseUnit, location: row.location || '', supplier: '' });
  });
  return items.map(item => {
    const k = codeKey(item.code);
    const lots = sortLotsForDispense(mergeSameLotEntries(lotsByCode[k] || []), parseExp);
    const hold = holds[k];
    const total = lots.reduce((s, l) => s + l.base, 0);
    return { ...item, availableBase: Math.max(0, total - (hold?.total || 0)), fefoLots: applyHolds(lots, hold).lots };
  });
}

function RequesterRoot({ onBack, prefilledUser, initialStep = null, auth = {} }) {
  const [step, setStep] = useState(initialStep || (prefilledUser ? 'search' : 'login'));
  const [info, setInfo] = useState(prefilledUser || null);
  const [cart, setCart] = useState(() => {
    try {
      const saved = sessionStorage.getItem(CART_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [reqType, setReqType] = useState(() => {
    try { return sessionStorage.getItem(CART_TYPE_KEY) || null; } catch { return null; }
  });

  // ตะกร้าค้างข้ามเครื่อง (requisition_cart_draft) — เฉพาะผู้เบิกที่ login เอง · คลังเบิกแทน (prefilledUser = null) ไม่บันทึก
  const draftUserId = prefilledUser && auth?.id ? auth.id : null;
  const [draftReady, setDraftReady] = useState(!draftUserId); // ห้ามบันทึกก่อนโหลดเสร็จ — ตะกร้าว่างตอนเปิดจะลบของใน DB
  const pendingSaveRef = useRef(null); // { timer, run } บันทึกที่หน่วงไว้ — ออกจากหน้าก่อนครบเวลาต้องบันทึกทันที

  useEffect(() => {
    if (!draftUserId) return;
    let alive = true;
    (async () => {
      try {
        // sessionStorage มีของ = ตะกร้าในเครื่องนี้ใหม่กว่า ใช้ต่อ (จะบันทึกทับ DB เอง)
        const hasLocal = (() => { try { return JSON.parse(sessionStorage.getItem(CART_KEY) || '[]').length > 0; } catch { return false; } })();
        if (!hasLocal) {
          const draft = await fetchCartDraft(draftUserId);
          if (draft && alive) {
            const items = await refreshCartStock(draft.items);
            if (alive) { setCart(items); setReqType(draft.req_type || null); }
          }
        }
      } catch (e) {
        console.warn('โหลดตะกร้าค้างไม่สำเร็จ', e);
      } finally {
        if (alive) setDraftReady(true);
      }
    })();
    return () => { alive = false; };
  }, [draftUserId]);

  // sync cart → sessionStorage ทุกครั้งที่ cart เปลี่ยน
  useEffect(() => {
    try { sessionStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}
  }, [cart]);
  useEffect(() => {
    try { if (reqType) sessionStorage.setItem(CART_TYPE_KEY, reqType); else sessionStorage.removeItem(CART_TYPE_KEY); } catch { /* storage ถูกปิด — ไม่จำประเภทข้ามรีเฟรช */ }
  }, [reqType]);

  // cart → DB หน่วง 1 วิ (กดเพิ่ม/แก้จำนวนติดกันบันทึกครั้งเดียว)
  useEffect(() => {
    if (!draftUserId || !draftReady) return;
    const run = () => { pendingSaveRef.current = null; saveCartDraft(draftUserId, { department: info?.department, requester_name: info?.name, req_type: reqType, items: cart.map(cartItemForDb) }); };
    const timer = setTimeout(run, 1000);
    pendingSaveRef.current = { timer, run };
    return () => clearTimeout(timer);
  }, [cart, reqType, draftUserId, draftReady, info]);
  // ออกจากหน้าเบิกก่อนครบ 1 วิ → บันทึกทันที (ไม่งั้นรายการล่าสุดไม่ถึง DB)
  useEffect(() => () => { const p = pendingSaveRef.current; if (p) { clearTimeout(p.timer); p.run(); } }, []);

  const clearCart = () => {
    setCart([]);
    setReqType(null);
    try { sessionStorage.removeItem(CART_KEY); } catch {}
    // ส่งใบแล้ว — ลบทันที ไม่รอรอบหน่วง (การ์ดตะกร้าค้างต้องหายเมื่อกลับหน้าหลัก)
    if (draftUserId) { const p = pendingSaveRef.current; if (p) { clearTimeout(p.timer); pendingSaveRef.current = null; } deleteCartDraft(draftUserId); }
  };

  if (!draftReady && (step === 'cart' || step === 'search')) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500 dark:text-slate-400 gap-2"><Loader2 size={18} className="animate-spin" /> กำลังโหลดตะกร้า…</div>;
  }
  if (step === 'login')   return <RequesterLogin onLogin={v => { setInfo(v); setStep('search'); }} onBack={onBack} />;
  if (step === 'search' && !reqType) return <ReqTypePicker info={info} onPick={setReqType} onHistory={() => setStep('history')} onBack={onBack} />;
  if (step === 'search')  return <DrugSearch info={info} reqType={reqType} onChangeType={() => setReqType(null)} cart={cart} setCart={setCart} onCart={() => setStep('cart')} onHistory={() => setStep('history')} onBack={onBack} />;
  if (step === 'cart')    return <CartView info={info} reqType={reqType} cart={cart} setCart={setCart} onBack={() => setStep('search')} onSubmitted={() => { clearCart(); setStep('history'); }} auth={auth} />;
  if (step === 'history') return <RequisitionHistory info={info} onBack={() => setStep('search')} auth={auth} />;
  return null;
}

// ---- เลือกประเภทใบก่อนคีย์ (1 ใบมีประเภทเดียว — PDF/ชีทแยกตามประเภท) ----
const REQ_TYPE_HINT = {
  saline: 'น้ำเกลือ · SWI · น้ำล้างแผล',
  supply: 'ถุงซิบ · ขวด · ตลับ · สติกเกอร์ฉลาก',
  drug:   'ยาเม็ด · ยาน้ำ · ยาฉีด · ยาใช้ภายนอก',
};

function ReqTypePicker({ info, onPick, onHistory, onBack }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-800">
      <PageHeader onBack={onBack} title={info.name} subtitle={info.department}>
        <button onClick={onHistory} className="transition-colors px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
          <FileText size={16} strokeWidth={2} />
          <span className="text-sm font-medium">ประวัติการเบิก</span>
        </button>
      </PageHeader>
      <div className="px-4 py-5 max-w-xl w-full mx-auto">
        <p className="font-bold text-lg text-slate-800 dark:text-slate-100">เลือกประเภทใบเบิก</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 mb-4">1 ใบเบิกได้ประเภทเดียว — เบิกหลายประเภทให้ส่งแยกใบ</p>
        <div className="space-y-3">
          {REQ_TYPES.map(t => (
            <button key={t.key} onClick={() => onPick(t.key)}
              className="w-full text-left bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-700 hover:border-blue-300 rounded-2xl shadow-sm px-4 py-4 flex items-center gap-3 transition-colors">
              <span className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center shrink-0">
                <Package size={22} className="text-blue-600" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-base text-slate-800 dark:text-slate-100">ใบเบิก{t.label}</span>
                <span className="block text-sm text-slate-500 dark:text-slate-400 truncate">{REQ_TYPE_HINT[t.key]}</span>
              </span>
              <ChevronRight size={18} className="text-slate-400 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
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
      <button onClick={onBack} className="absolute top-5 left-5 flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-[#1E90FF] text-sm transition-colors">
        <ArrowLeft size={16} /> กลับ
      </button>
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-100 dark:bg-blue-950/60 rounded-xl mb-3">
            <Package size={28} className="text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">ข้อมูลผู้เบิก</h2>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (name.trim() && dept) onLogin({ name: name.trim(), department: dept }); }} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">ชื่อ-สกุล ผู้เบิก</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="กรอกชื่อ-สกุล" required
              className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-slate-800 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E90FF] focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">หน่วยงาน</label>
            <SearchableSelect value={dept} onChange={setDept}
              options={departments} placeholder="-- เลือกหน่วยงาน --"
              className="w-full" />
          </div>
          <button type="submit" disabled={!name.trim() || !dept}
            className="w-full bg-[#1E90FF] hover:bg-[#1a7fe0] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-3 font-semibold text-sm transition mt-2">
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

// inventory มีแถวซ้ำ code+lot เดียวกันหลายแถวได้ (CSV import แยกแถว) — ทุกจุดอ่านต้อง "บวกรวม" ห้าม drop/ทับ
// (บัค 2026-07-18: Baclofen lot 260301 มี 2 แถว 3+30 กล่อง — dedupe เดิมทิ้งเหลือ 600 เม็ดจากจริง 6,600)
const mergeSameLotEntries = (lots) => {
  const map = new Map();
  for (const l of lots) {
    const k = `${String(l.lot || '').trim()}|${String(l.exp || '').trim()}`;
    const prev = map.get(k);
    if (prev) {
      prev.packs += l.packs || 0; prev.base += l.base || 0;
      if (isSupportedLot(l)) prev.itemType = l.itemType; // lot เดียวกันมีแถวสนับสนุน → นับทั้ง lot เป็นยาสนับสนุน
    }
    else map.set(k, { ...l });
  }
  return [...map.values()];
};

// escape user-content ก่อนฉีดลง HTML ใบพิมพ์ — ชื่อยา/หมายเหตุ/ชื่อคน มาจาก input ผู้ใช้และ CSV (กัน stored XSS ในหน้าปริ้น)
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// คงเหลือรวมต่อรหัส (หน่วยย่อยสุด) — ใช้ re-validate ตอนส่ง/แก้ใบเบิก (สูตรเดียวกับ availableBase ใน DrugSearch)
async function fetchInvBaseByCode(codes) {
  if (!supabase || !codes.length) return {};
  const { data } = await supabase.from('inventory').select('code, qty, unit').in('code', codes);
  const map = {};
  (data || []).forEach(r => {
    const { packSize } = parseUnit(r.unit);
    const k = codeKey(r.code);
    map[k] = (map[k] || 0) + (parseFloat(r.qty) || 0) * (packSize || 1);
  });
  return map;
}

// ยอดจอง = ตัดยอดชั่วคราว (CONTEXT §ตัดยอดชั่วคราว) — แอปไม่หัก inventory เอง ตัดจริงที่ชีทเบิกแล้วนำเข้า
// ใบหักยอดจนกว่าลงชีทแล้ว (sheet_entered_at) + มีการนำเข้าหลังลงชีท — กฎอยู่ใน lib/reservation.js
// คืน { [codeKey]: { total, byLot, unassigned } } (หน่วยย่อยสุด)
// excludeReqId = ไม่นับใบตัวเอง (ตอน requester แก้ใบเดิม / staff จัดใบนี้)
async function fetchReservationHolds(codes, { excludeReqId = null } = {}) {
  if (!supabase || !codes.length) return {};
  const lastImportAt = await fetchLastInventoryImportAt();
  const rows = [];
  // กรองใบที่เลิกหักแล้วฝั่ง DB — ใบจ่ายแล้วสะสมทุกวัน ถ้าดึงมากรองในเบราว์เซอร์จะชนเพดาน 1000 แถว (Rule #2)
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from('requisition_items')
      .select('id, drug_code, requisition_id, requested_qty, approved_qty, picked_qty, picked_allocation, requisitions!inner(status, sheet_entered_at)')
      .in('drug_code', codes)
      .in('requisitions.status', RESERVING_STATUSES)
      .order('id')
      .range(from, from + 999);
    if (lastImportAt) q = q.or(`sheet_entered_at.is.null,sheet_entered_at.gt."${lastImportAt}"`, { referencedTable: 'requisitions' });
    const { data, error } = await q;
    if (error) { console.error('fetchReservationHolds', error); break; }
    (data || []).forEach(r => rows.push({ ...r, status: r.requisitions?.status, sheet_entered_at: r.requisitions?.sheet_entered_at }));
    if (!data || data.length < 1000) break;
  }
  return summarizeHolds(rows, { keyOf: codeKey, lastImportAt, excludeReqId });
}

// ยอดจองรวมต่อรหัส (หน่วยย่อยสุด) — ใช้ re-validate ตอนส่ง/แก้ใบเบิก
async function fetchReservedBase(codes, opts) {
  const holds = await fetchReservationHolds(codes, opts);
  return Object.fromEntries(Object.entries(holds).map(([k, h]) => [k, h.total]));
}

// lot พร้อมจ่ายต่อรหัส (หน้าเจ้าหน้าที่ — คิว + หน้าใบ): บวกรวมแถวซ้ำ · ตัด lot หมดอายุ · เรียงลำดับจ่าย (ยาสนับสนุนก่อน)
// · หักเฉพาะ lot ที่ใบอื่นหยิบไปแล้ว (fefoRemainder false — ใบที่ยังไม่จัดไม่ได้เอาของออกจากชั้น) · key = รหัส trim
// fetchInventoryByCodes ไม่แบ่งหน้า → ส่งทีละ 100 รหัส กันชนเพดาน 1000 แถว (Rule #2)
async function loadStaffLots(codes, { excludeReqId = null } = {}) {
  const uniq = [...new Set((codes || []).map(c => String(c || '').trim()).filter(Boolean))];
  if (!supabase || !uniq.length) return { lotsByCode: {}, rowsByCode: {} };
  const rows = [];
  for (let i = 0; i < uniq.length; i += 100) rows.push(...await fetchInventoryByCodes(uniq.slice(i, i + 100)));
  const holds = await fetchReservationHolds(uniq, { excludeReqId });
  const rowsByCode = {};
  rows.forEach(r => { const c = String(r.code || '').trim(); (rowsByCode[c] = rowsByCode[c] || []).push(r); });
  const lotsByCode = {};
  Object.entries(rowsByCode).forEach(([c, list]) => {
    const sorted = sortLotsForDispense(mergeSameLotEntries(list.map(l => {
      const { packSize, baseUnit } = parseUnit(l.unit);
      const packs = parseFloat(l.qty) || 0;
      return { lot: l.lot, exp: l.exp, unit: l.unit, location: l.location, mainLog: l.main_log || '', itemType: l.item_type || '', baseUnit: baseUnit || l.unit, packSize: packSize || 1, packs, base: packs * (packSize || 1) };
    })).filter(lotNotExpired), parseExp);
    lotsByCode[c] = applyHolds(sorted, holds[codeKey(c)], { fefoRemainder: false }).lots;
  });
  return { lotsByCode, rowsByCode };
}

// เปิดหน้าปริ้นจาก Blob URL — LINE/FB in-app WebView บล็อก window.open → คืน null → นำทางผ่าน <a> click แทน (Rule #4)
function openPrintUrl(url, preopenedWin) {
  if (preopenedWin && !preopenedWin.closed) { preopenedWin.location.href = url; return preopenedWin; }
  const w = window.open(url, '_blank');
  if (w) return w;
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  return null;
}

// lot ที่หมดอายุแล้วห้ามเข้า FEFO allocation (ฝั่งค้นหาผู้เบิกกรองอยู่แล้ว — ฝั่งจัดยา/ใบพิมพ์ต้องกรองให้ตรงกัน)
const lotNotExpired = (l) => {
  const d = parseExp(l.exp);
  if (!d) return true;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return d >= t;
};

// วลีหมายเหตุคลังที่ใช้บ่อย (จาก vocabulary ใบจริงของคลัง) — chip กดเติมลง staff_note ตอนจัดยา แก้ข้อความต่อได้
// (เคส "รอตรวจรับ/ยาหมดรอของส่ง/เปลี่ยนบริษัท/มีXlot/ใกล้exp" ระบบเติมอัตโนมัติในใบ lot คุม ไม่ต้องมี chip)
const STAFF_NOTE_PRESETS = ['จ่ายlotเก่าให้หมด', 'ตัดยอดยาเสพติด', 'รถกู้ชีพ', 'เบิกห้องยา'];

// ข้อความ pre-printed บนใบปะหน้า "ใบเบิกเวชภัณฑ์ยา" (ฟอร์มราชการ) — ตามฟอร์มกระดาษจริงของ รพ.
// เปลี่ยนผู้รับผิดชอบ/ชื่อ รพ. → แก้ที่นี่จุดเดียว
const COVER_FORM = {
  hospital:  'โรงพยาบาลประชาธิปัตย์',
  dispenser: { name: 'นายนพคุณ ฉายขุนทด', role: 'เจ้าหน้าที่คลังยาเวชภัณฑ์', position: 'เจ้าพนักงานเภสัชกรรมปฏิบัติงาน' },
  approver:  { name: 'นางสาวสุชาวดี กิตติณิชกุล', role: 'หัวหน้าหน่วยพัสดุยา', position: 'เภสัชกรปฏิบัติการ' },
  // ชื่อพิมพ์เฉพาะใบของหน่วยงานใน depts (user สั่ง 13/11/2569) · หน่วยงานอื่นยังไม่รู้ชื่อหัวหน้า → เว้นเส้นให้เขียนมือ
  requesterHead: { name: 'นางสาวปภัสรา วรรณทอง', depts: ['ห้องยาG', 'ห้องยา1'],
                   position: 'เภสัชกรชำนาญการ', group: 'หัวหน้ากลุ่มงาน เภสัชกรรมและคุ้มครองผู้บริโภค' },
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

// บรรจุภัณฑ์ราย lot ในการ์ดเบิก → "N กล่อง × size หน่วย" (จาก packs/packSize ที่หัก reservation แล้ว)
//   ผู้เบิกดูเพื่อวางแผนที่เก็บ (กล่องใหญ่แค่ไหน) — packs อาจเป็นเศษหลังหักจอง จึงปัดขึ้นเป็นกล่อง
const lotPackLabel = (l) => {
  const size = l.packSize || 1;
  const packs = Math.ceil(l.packs || 0);
  // ใช้ baseUnit (หน่วยย่อยล้วน) — l.unit เต็มมีตัวเลข packSize ปน จะได้ "× 200 200เม็ด" ซ้ำ
  return size > 1 ? `${packs.toLocaleString()} กล่อง × ${size.toLocaleString()} ${l.baseUnit || l.unit || ''}`.trim()
                  : `${packs.toLocaleString()} ${l.baseUnit || l.unit || ''}`.trim();
};

// หน่วยคีย์บนจอ: หน่วยซื้อที่มีขนาด (1000เม็ด/450ml) อ่านเป็น "5 × 1000เม็ด" — Master ไม่บอกชื่อภาชนะ (กล่อง/ขวด/กระป๋อง)
const entryText = (label, pack) => (pack > 1 ? `× ${label}` : label);
// หน่วยของรายการในตะกร้า — เลือกขนาดกล่องไว้ (entryUnit) ป้ายเป็น "กล่อง (400เม็ด)" อยู่แล้ว ไม่ต้องนำด้วย ×
const cartUnitText = (item) => (item.entryUnit ? item.entryLabel : entryText(item.entryLabel || item.unit || '', item.entryPack || 1));

// สรุปกล่องคงเหลือ แยกตาม packsize เช่น "105 กล่อง × 1000เม็ด" หรือ "5 × 1000เม็ด + 2 × 500เม็ด"
const packSummary = (fefoLots) => {
  if (!fefoLots || !fefoLots.length) return '';
  const byUnit = {};
  fefoLots.forEach(l => { if (l.packs > 0) byUnit[l.unit] = (byUnit[l.unit] || 0) + l.packs; });
  const parts = Object.entries(byUnit).map(([unit, packs]) => `${Math.ceil(packs).toLocaleString()} × ${unit}`);
  return parts.join(' + ');
};

// ---- Drug Search ----
function DrugSearch({ info, reqType, onChangeType, cart, setCart, onCart, onHistory, onBack }) {
  const [q, setQ]              = useState('');
  const [rawResults, setRawResults] = useState([]);   // inventory data (no reservation)
  const [reservedMap, setReservedMap] = useState({}); // codeKey → { total, byLot, unassigned } ยอดจอง (หน่วยย่อยสุด, realtime)
  const [loading, setLoading]  = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // ระดับยา (B-base, ADR-0004): คงเหลือรวม = Σ(lot.qty × packSize) แปลงเป็นหน่วยย่อยสุด
  // หัก reservation ต่อรหัสยา (ของที่ใบ pending/approved จองไว้) — กัน oversell
  const results = useMemo(() =>
    rawResults.map(drug => {
      // lot ที่เบิกได้จริง: ตรวจรับแล้ว (ไม่ pending) + ไม่หมดอายุ + มีของ — เรียง FEFO (ใกล้หมดอายุก่อน)
      const baseUnitCount = {};
      let totalBaseRaw = 0;
      let pendingBase = 0; // ของรอตรวจรับ — ยังจ่ายไม่ได้ แต่ผู้เบิกขอได้ (CONTEXT §ใบเบิกออนไลน์ "ขอได้เสมอ")
      const fefoLots = [];
      drug.lots.forEach(lot => {
        if (lot.expired) return;
        const { packSize, baseUnit } = parseUnit(lot.unit);
        if (lot.pending) { pendingBase += (parseFloat(lot.rawQty) || 0) * (packSize || 1); return; }
        const packs = parseFloat(lot.rawQty) || 0;
        const base = packs * (packSize || 1);
        totalBaseRaw += base;
        if (baseUnit && baseUnit !== '-') baseUnitCount[baseUnit] = (baseUnitCount[baseUnit] || 0) + packs;
        if (packs > 0) fefoLots.push({ lot: lot.lot, exp: lot.exp, unit: lot.unit, itemType: lot.itemType || '', packSize: packSize || 1, packs, base, baseUnit, location: lot.location || '', supplier: lot.supplier || '', caseSize: lot.caseSize ?? null, caseWord: lot.caseWord ?? null, caseUnit: lot.caseUnit ?? null });
      });
      // แถวซ้ำ lot เดียวกัน (จาก DB) → บวกรวมเป็น entry เดียวก่อนเรียง · ลำดับจ่าย = ยาสนับสนุนก่อน
      const fefoUnique = sortLotsForDispense(mergeSameLotEntries(fefoLots), parseExp);
      // baseUnit = หน่วยย่อยที่พบบ่อยสุด (ปกติยาตัวเดียวกันหน่วยเดียว)
      const baseUnit = Object.keys(baseUnitCount).sort((a, b) => baseUnitCount[b] - baseUnitCount[a])[0] || (drug.unit || '');
      const hold = reservedMap[codeKey(drug.code)];
      const reservedBase = hold?.total || 0;
      const availableBase = Math.max(0, totalBaseRaw - reservedBase);
      // หักยอดจองออกจาก fefoLots — lot ที่ใบอื่นหยิบแล้วหักตรง lot ส่วนที่ยังไม่จัดหักตามลำดับจ่าย
      // เพื่อให้ allocation preview ในตะกร้าตรงกับ availableBase (ไม่ preview ของที่ถูกจอง)
      const { lots: availLots } = applyHolds(fefoUnique, hold);
      // หน่วยคีย์ = หน่วยซื้อตาม Master ทุกประเภทใบ (CONTEXT §หน่วยคีย์ · ใบยาเปลี่ยน 13/11/2569 — คลังจ่ายเต็มกล่อง
      // คีย์หน่วยย่อยแล้ว "ขอ 1 เม็ด ได้ 1000") · lot ต่างขนาดแพ็ค = ให้เลือกขนาด (entryUnitForLots)
      // ขนาดให้เลือกมาจาก lot ที่จ่ายได้ตอนนี้เท่านั้น (ค่าเริ่ม = lot ที่จะจ่ายก่อน) · lot รอตรวจรับใช้เมื่อไม่มีของจ่ายได้เลย
      // หลังหักยอดจอง (availLots) = ชุดเดียวกับที่ตะกร้าคาดว่าจะจ่าย · ถูกจองหมดทุก lot ค่อยใช้ fefoUnique
      const entry = entryUnitForLots({
        unit: drug.unit, baseUnit,
        // case* = ขนาดลังราย lot (inventory.case_*) — ปุ่มลังขึ้นเมื่อทุก lot ชุดนี้รู้ลังและเท่ากัน (caseOfLots)
        dispensable: (availLots.length ? availLots : fefoUnique).map(l => ({ packSize: l.packSize, unit: l.unit, caseSize: l.caseSize, caseWord: l.caseWord, caseUnit: l.caseUnit })),
        others: drug.lots.filter(l => !l.expired).map(l => ({ packSize: parseUnit(l.unit).packSize, unit: l.unit, caseSize: l.caseSize, caseWord: l.caseWord, caseUnit: l.caseUnit })),
      });
      return { ...drug, totalBaseRaw, baseUnit, reservedBase, availableBase, pendingBase, entry, fefoLots: availLots };
    }), [rawResults, reservedMap]);
  const [qtyMap, setQtyMap]    = useState({});   // key = code+name+lot
  const [packChoice, setPackChoice] = useState({}); // drugKey → packSize ที่ผู้เบิกเลือก (ยาที่ lot ต่างขนาดกล่อง)
  const [warnMap, setWarnMap]  = useState({});   // key = lotKey → warning msg
  const [expandedMap, setExpandedMap] = useState({}); // drugKey → กางรายละเอียด lot ไหม
  const [drugNames, setDrugNames]   = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [toast, setToast] = useState(null);
  const searchRef = useRef(null);

  const today = new Date(); today.setHours(0,0,0,0);

  // Preload drug names + types for dropdown
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      // ดึงครบทุกแถว (inventory > 1000 แถว — Rule #2) เพราะกรองชื่อตามประเภทใบ ตกหล่นแถวไหนชื่อยาหายจาก dropdown
      const inv = await fetchAllInventoryRows('name, code, type, main_log').catch(() => null);
      if (!inv) return;
      // build name→code and name→type maps directly from inventory (log คลัง CSV)
      const nameCodeMap = {};
      const nameTypeFromInv = {};
      const nameRows = {};
      inv.forEach(r => {
        if (r.name && r.code) nameCodeMap[r.name] = r.code;
        if (r.name && r.type && r.type !== '-' && !nameTypeFromInv[r.name]) nameTypeFromInv[r.name] = r.type;
        if (r.name) (nameRows[r.name] ||= []).push(r);
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
        code: nameCodeMap[name] || '',
        // priority: inventory.type → drug_details → (ไม่มี)
        type: nameTypeFromInv[name] || codeTypeMap[nameCodeMap[name]] || '',
        reqType: reqTypeOfRows(nameRows[name]),
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

  // ไม่สนช่องว่าง/จุด/ขีด + แยกคำ + คำเรียกอื่น (lib/drugSearchText.js — ชื่อในใบเบิกจริง ≠ ชื่อ Master)
  const filteredSuggestions = q.trim()
    ? rankDrugs(drugNames.filter(n => n.reqType === reqType), q, 10)
    : [];

  // ผลค้นหาเก่าที่ตอบกลับช้ากว่าคำค้นใหม่ต้องทิ้ง — ไม่งั้นการ์ดยาตัวก่อนค้าง คีย์เร็วแล้วจำนวนเข้ายาผิดตัว
  const searchSeqRef = useRef(0);
  const search = useCallback(async (term) => {
    const seq = ++searchSeqRef.current;
    if (!term.trim()) { setRawResults([]); setLoading(false); return; }
    setLoading(true);
    if (supabase) {
      const INV_COLS = 'id, code, name, unit, qty, lot, exp, location, invoice, item_type, main_log, case_size, case_word, case_unit';
      // รายชื่อยาโหลดแล้ว → หาชื่อที่ตรงด้วย rankDrugs แล้วดึงแถวตามชื่อจริง (ilike ตัดช่องว่าง/แยกคำ/คำเรียกอื่นไม่ได้)
      // ยังโหลดไม่เสร็จ → ilike ชื่อ/รหัสแบบเดิม
      const nameRank = drugNames.length ? rankDrugs(drugNames.filter(n => n.reqType === reqType), term, 30).map(n => n.name) : null;
      let byName = [], byCode = [];
      if (nameRank) {
        const chunks = [];
        for (let i = 0; i < nameRank.length; i += 15) chunks.push(nameRank.slice(i, i + 15));
        const res = await Promise.all(chunks.map(c => supabase.from('inventory').select(INV_COLS).in('name', c).limit(1000)));
        res.forEach(({ data }) => byName.push(...(data || [])));
        const pos = new Map(nameRank.map((n, i) => [n, i]));
        byName.sort((a, b) => (pos.get(a.name) ?? 999) - (pos.get(b.name) ?? 999));
      } else {
        // ilike ด้วยคำแรก แล้วกรองทุกคำด้วยกฎเดียวกัน ("amlodipine 10 mg" ilike ทั้งก้อนไม่เจอ)
        // Separate queries to avoid comma in term breaking PostgREST or() syntax
        const first = term.trim().split(/\s+/)[0];
        [{ data: byName }, { data: byCode }] = await Promise.all([
          supabase.from('inventory').select(INV_COLS).ilike('name', `%${first}%`).order('name').limit(300),
          supabase.from('inventory').select(INV_COLS).ilike('code', `%${term}%`).order('name').limit(300),
        ]);
        byName = (byName || []).filter(r => matchDrugQuery(r.name, r.code, term) >= 0);
      }
      // dedupe ด้วย row id เท่านั้น (แถวเดิมโผล่ทั้ง byName+byCode) — ห้าม key ด้วย code|name|lot
      // เพราะ inventory มีแถวซ้ำ lot เดียวกันหลายแถวจริง (qty แยกกัน) จะกลืนคงเหลือหาย
      const seen = new Set();
      const merged = [];
      [...(byName || []), ...(byCode || [])].forEach(r => {
        const k = r.id ?? `${r.code}|${r.name}|${r.lot}|${r.qty}|${r.location}`;
        if (!seen.has(k)) { seen.add(k); merged.push(r); }
      });

      // Check receive_logs for รอตรวจรับ status — key ด้วย code|lot เท่านั้น
      // (ห้าม key ด้วย lot เดี่ยว: lot ซ้ำข้ามตัวยาได้ โดยเฉพาะ lot "-" ของเวชภัณฑ์ → เหมาผิดตัว "หมดสต็อก" ปลอม)
      const uniqueLots = [...new Set(merged.map(r => r.lot).filter(Boolean))];
      let pendingLotSet = new Set(); // "codeKey|lot"
      if (uniqueLots.length > 0) {
        const { data: rl } = await supabase.from('receive_logs')
          .select('drug_code, lot, receive_status')
          .in('lot', uniqueLots);
        (rl || []).forEach(r => {
          if (r.lot && String(r.receive_status || '').includes('รอ')) pendingLotSet.add(`${codeKey(r.drug_code)}|${r.lot}`);
        });
      }

      // Get supplier/price/type from receive_logs — source of truth for drug details
      const uniqueCodes = [...new Set(merged.map(r => r.code).filter(Boolean))];

      // หัก qty ที่มี requisition pending/approved อยู่ (reserved) ออกจาก available — ต่อรหัสยา (B-base, ADR-0004)
      // requested_qty เป็นหน่วยย่อยสุดอยู่แล้ว จึงรวมต่อ code ได้ตรงๆ
      // ยอดจองครบวงจร (ส่งใบ → ลงชีทแล้วนำเข้า) — ดู fetchReservationHolds
      const reservedQtyMap = await fetchReservationHolds(uniqueCodes);
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
        if (!grouped[key]) grouped[key] = { code: row.code, name: row.name, unit: row.unit, type: '', lots: [], mainLogs: [] };
        grouped[key].mainLogs.push({ main_log: row.main_log });
        const rowQty = parseFloat(row.qty) || 0;
        const isPending = pendingLotSet.has(`${codeKey(row.code)}|${row.lot}`);
        const expDate = parseExp(row.exp);
        const isExpired = expDate && expDate < today;
        const detail = getDetail(row);
        if (!grouped[key].type && detail.drugType && detail.drugType !== '-') grouped[key].type = detail.drugType;
        grouped[key].lots.push({ lot: row.lot, exp: row.exp, qty: rowQty, rawQty: row.qty, unit: row.unit, itemType: row.item_type || '', drugType: detail.drugType || '', location: row.location || '', supplier: detail.supplier || '', pending: isPending, expired: isExpired, caseSize: row.case_size ?? null, caseWord: row.case_word ?? null, caseUnit: row.case_unit ?? null });
      });

      if (seq !== searchSeqRef.current) return; // มีคำค้นใหม่กว่าแล้ว
      // เฉพาะยาของประเภทใบนี้ (ประเภทของยา = MainLog ที่แถวส่วนใหญ่อยู่ — lib/reqType.js)
      setRawResults(Object.values(grouped).filter(g => reqTypeOfRows(g.mainLogs) === reqType));
      setReservedMap(reservedQtyMap); // initial snapshot; realtime will update this
    }
    if (seq === searchSeqRef.current) setLoading(false);
  }, [reqType, drugNames]);

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
      setReservedMap(await fetchReservationHolds(allCodes));
    };

    const channel = supabase
      .channel('req-reserved-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisition_items' }, fetchReserved)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requisitions' }, fetchReserved)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [rawResults]);

  // เบิกระดับยา (B-base, ADR-0004): ขอเป็นหน่วยย่อยสุด, lot=null — คลังเลือก FEFO ตอน picking
  // qty = จำนวนในหน่วยคีย์ (drug.entry) → เก็บ requestedQty เป็นหน่วยย่อยสุดเหมือนเดิม (CONTEXT §หน่วยคีย์)
  // ขอเกินคงเหลือ/ยาหมด/รอตรวจรับได้ — เตือนแต่ไม่ห้าม คลังจ่ายเท่าที่มี (CONTEXT §ใบเบิกออนไลน์ "ขอได้เสมอ")
  // chosen = ขนาดที่ผู้เบิกเลือก (drug.entry.options) — ยาขนาดเดียวไม่มี
  const addToCart = (drug, qty, chosen = null) => {
    const drugKey = drug.code + drug.name;
    const pack = chosen ? chosen.packSize : (drug.entry?.packSize || 1);
    const label = chosen ? chosen.label : (drug.entry?.label || drug.baseUnit);
    const entryUnit = chosen && chosen.packSize > 1 ? chosen.unit : null;
    const safeQty = Math.max(1, parseInt(qty) || 1) * pack;
    const inCartQty = cart.find(i => i.code === drug.code && i.name === drug.name)?.requestedQty || 0;
    const total = inCartQty + safeQty;
    if (total > drug.availableBase) {
      setWarnMap(p => ({ ...p, [drugKey]: drug.availableBase > 0
        ? `ขอ ${total.toLocaleString()} ${drug.baseUnit} เกินคงเหลือ ${drug.availableBase.toLocaleString()} — คลังจ่ายเท่าที่มี ส่วนที่ขาดบันทึกค้างจ่าย`
        : 'ยาหมดในคลัง — ส่งคำขอได้ คลังบันทึกค้างจ่ายให้' }));
    } else {
      setWarnMap(p => { const n = { ...p }; delete n[drugKey]; return n; });
    }
    setCart(prev => {
      const idx = prev.findIndex(i => i.code === drug.code && i.name === drug.name);
      if (idx >= 0) {
        // เพิ่มซ้ำคนละขนาดกล่อง → รวมยอดแล้วแสดงเป็นหน่วยย่อย (ไม่เดาว่าเป็นกล่องขนาดไหน)
        const same = (u => (u.entryPack || 1) === pack && (u.entryUnit || null) === entryUnit)(prev[idx]);
        const u = [...prev];
        // รายการ "ได้ยาไปแล้ว" ที่ยังไม่กรอกรายละเอียด → เพิ่มซ้ำ = ขอจริง ล้างคำนำหน้าที่เติมไว้ทิ้ง
        if (prev[idx].requestedQty === 0 && (prev[idx].note || '').trim() === ALREADY_GOT_PREFIX) u[idx] = { ...u[idx], note: '' };
        u[idx] = same ? { ...u[idx], requestedQty: u[idx].requestedQty + safeQty }
          : { ...u[idx], requestedQty: u[idx].requestedQty + safeQty, entryPack: 1, entryLabel: drug.baseUnit, entryUnit: null, entryInner: null, entryHint: null };
        return u;
      }
      // entryInner = ขนาดแพ็คในลัง (เลือกลัง) — ตะกร้าเทียบกับ lot ที่จะจ่ายด้วยตัวนี้ ไม่ใช่ entryPack (= ทั้งลัง)
      return [...prev, { code: drug.code, name: drug.name, unit: drug.baseUnit, lot: null, drugType: drug.type || '', availableBase: drug.availableBase, fefoLots: drug.fefoLots || [], requestedQty: safeQty, entryPack: pack, entryLabel: label, entryUnit, entryInner: chosen?.caseInner || null, entryHint: chosen ? null : (drug.entry?.hint || null), note: '', addedAt: new Date().toISOString() }];
    });
    setQtyMap(p => ({ ...p, [drugKey]: 1 }));
    setToast({ name: drug.name, type: drug.type || '', qty: safeQty / pack, unit: entryUnit || pack === 1 ? label : entryText(label, pack) });
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
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-800">
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
        <button onClick={onHistory} className="transition-colors px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
          <FileText size={16} strokeWidth={2} />
          <span className="text-sm font-medium">ประวัติการเบิก</span>
        </button>
      </PageHeader>

      {/* Pending notification */}
      {pendingCount > 0 && (
        <button onClick={onHistory}
          className="w-full flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 text-left hover:bg-amber-100 dark:hover:bg-amber-950/70 transition-colors">
          <Clock size={15} className="text-amber-500 shrink-0" />
          <span className="text-sm text-amber-800 dark:text-amber-300 font-medium">
            มี <span className="font-bold">{pendingCount}</span> ใบเบิกรอดำเนินการ
          </span>
          <ChevronRight size={14} className="text-amber-400 ml-auto" />
        </button>
      )}

      {/* Search Area */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 pt-4 pb-5">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 text-sm font-bold">
            <FileText size={14} /> ใบเบิก{reqTypeLabel(reqType)}
          </span>
          {cart.length === 0 ? (
            <button onClick={onChangeType} className="text-sm font-semibold text-[#1E90FF] hover:text-[#1a7fe0]">เปลี่ยนประเภท</button>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">เปลี่ยนประเภทได้หลังส่งหรือล้างตะกร้า</span>
          )}
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-2 font-medium">ค้นหายาในคลัง</p>
        <div className="relative" ref={searchRef}>
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 z-10" />
          <input type="text" value={q}
            onChange={e => { setQ(e.target.value); setShowDropdown(true); }}
            onFocus={() => { if (q.trim()) setShowDropdown(true); }}
            placeholder="ชื่อยาหรือรหัสยา..." autoFocus
            className="w-full bg-slate-100 dark:bg-slate-800 rounded-xl pl-11 pr-10 py-3.5 text-slate-800 dark:text-slate-100 placeholder-slate-400 text-base focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white border border-slate-200 dark:border-slate-700" />
          {q && (
            <button onClick={() => { setQ(''); setRawResults([]); }} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
              <X size={18} />
            </button>
          )}
          {showDropdown && filteredSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 overflow-hidden">
              {filteredSuggestions.map(({ name, type }) => (
                <button key={name} onMouseDown={e => { e.preventDefault(); setQ(name); setShowDropdown(false); }}
                  className="w-full text-left px-4 py-3 text-base text-slate-700 dark:text-slate-200 hover:bg-[#F0F8FF] dark:hover:bg-slate-800 hover:text-[#1E90FF] transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0">
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
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
            <div className="w-8 h-8 border-4 border-[#1E90FF] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm">กำลังค้นหา...</p>
          </div>
        )}

        {!loading && q && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
            <Search size={48} className="mb-3 opacity-20" />
            <p className="font-semibold text-slate-500 dark:text-slate-400">ไม่พบยาที่ค้นหา</p>
            <p className="text-sm mt-1">ลองใช้ชื่อสั้นกว่านี้ หรือค้นด้วยรหัสยา</p>
          </div>
        )}

        {/* Empty state — welcome */}
        {!q && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 flex flex-col items-center text-center mt-1">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center mb-4">
              <Package size={32} className="text-[#1E90FF]" />
            </div>
            <h3 className="font-bold text-lg text-slate-700 dark:text-slate-200 mb-1">ยินดีต้อนรับ</h3>
            <p className="text-slate-400 dark:text-slate-500 text-sm mb-5">พิมพ์ชื่อยาหรือรหัสยาในช่องด้านบน<br />เพื่อค้นหาและเพิ่มรายการยาเข้าตะกร้า</p>
            <div className="flex flex-wrap gap-2 justify-center text-xs">
              <span className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded-full font-medium">ค้นด้วยชื่อยา</span>
              <span className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-full font-medium">ค้นด้วยรหัสยา</span>
              <span className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-full font-medium">กรอกจำนวนที่ต้องการเบิก</span>
            </div>
          </div>
        )}

        {/* การ์ดระดับยา (B-base): มีของขึ้นก่อน เรียงตามชื่อ → หมดสต็อกจางๆ ท้ายสุด · ซ่อนระหว่างค้นหา (การ์ดเก่าค้าง = คีย์ผิดตัว) */}
        {!loading && [...results]
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
              <div key={drugKey} className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-700"
                style={{ borderLeft: `4px solid ${outOfStock ? '#CBD5E1' : accentColor}` }}>
                <div className="px-4 py-3.5">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className="font-bold text-lg text-slate-800 dark:text-slate-100 leading-snug flex-1">{drug.name}</p>
                    {drug.type && drug.type !== '-' && <DrugTypeBadge type={drug.type} />}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-sm text-slate-400 dark:text-slate-500">รหัส: {drug.code}</span>
                    {inCart && <span className="text-sm text-[#1E90FF] font-bold bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full">ในตะกร้า: {inCart.requestedQty === 0 ? ALREADY_GOT_PREFIX : `${(inCart.requestedQty / (inCart.entryPack || 1)).toLocaleString()} ${cartUnitText(inCart)}`}</span>}
                  </div>

                  {/* คงเหลือรวมระดับยา — base unit เด่น + สรุปกล่องแยก packsize */}
                  {outOfStock ? (
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 text-sm font-bold border border-red-200 dark:border-red-900/60">
                        <AlertCircle size={14} /> หมดสต็อก
                      </span>
                      {drug.pendingBase > 0 && (
                        <span className="text-xs text-amber-700 dark:text-amber-300">รอตรวจรับ {drug.pendingBase.toLocaleString()} {drug.baseUnit}</span>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2.5">
                      <p className="text-base">
                        <span className="text-slate-500 dark:text-slate-400">คงเหลือในคลัง </span>
                        <span className="font-extrabold text-emerald-600">{remaining.toLocaleString()}</span>
                        <span className="text-slate-500 dark:text-slate-400"> {drug.baseUnit}</span>
                        {drug.reservedBase > 0 && (
                          <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">(หักใบรอลงชีท {drug.reservedBase.toLocaleString()})</span>
                        )}
                      </p>
                      {packSummary(drug.fefoLots) && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">= {packSummary(drug.fefoLots)}</p>
                      )}
                      {drug.pendingBase > 0 && (
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">รอตรวจรับอีก {drug.pendingBase.toLocaleString()} {drug.baseUnit} (ยังจ่ายไม่ได้)</p>
                      )}
                    </div>
                  )}

                  {/* ขนาดลัง (CONTEXT §ลัง) — รู้ทุก lot และเท่ากัน · lot ปนกันบอกราย lot ในรายละเอียดแทน */}
                  {drug.entry?.caseInfo && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 flex items-center gap-1.5">
                      <Package size={14} className="shrink-0 text-slate-400 dark:text-slate-500" />
                      <span className="font-semibold">{caseLine(drug.entry.caseInfo)}</span>
                      {drug.entry.caseInfo.packSize > 1 && <span className="text-xs text-slate-400 dark:text-slate-500">(= {(drug.entry.caseInfo.per * drug.entry.caseInfo.packSize).toLocaleString()} {drug.baseUnit})</span>}
                    </p>
                  )}

                  {/* รายละเอียดราย lot — บรรจุภัณฑ์/exp/ที่เก็บ/บริษัท (กดขยาย, ประมาณการ FEFO) */}
                  {!outOfStock && drug.fefoLots?.length > 0 && (
                    <div className="mt-2">
                      <button type="button"
                        onClick={() => setExpandedMap(p => ({ ...p, [drugKey]: !p[drugKey] }))}
                        className="flex items-center gap-1 text-xs font-semibold text-[#1E90FF] hover:text-[#1a7fe0]">
                        {expandedMap[drugKey] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {expandedMap[drugKey] ? 'ซ่อนรายละเอียด lot' : `ดูรายละเอียด lot (${drug.fefoLots.length})`}
                      </button>
                      {expandedMap[drugKey] && (
                        <div className="mt-2 space-y-1.5">
                          {drug.fefoLots.map((l, li) => {
                            const near = isNearExpiry(l.exp);
                            return (
                              <div key={`${l.lot}-${li}`} className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg px-2.5 py-2">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="font-bold text-slate-700 dark:text-slate-200">{lotPackLabel(l)}</span>
                                  <span className={`font-medium ${near ? 'text-amber-600' : 'text-slate-400 dark:text-slate-500'}`}>
                                    {near && <AlertCircle size={11} className="inline mr-0.5 -mt-0.5" />}
                                    EXP {l.exp || '-'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-slate-500 dark:text-slate-400 mt-1">
                                  <span>Lot: <span className="font-mono text-slate-600 dark:text-slate-300">{l.lot || '-'}</span></span>
                                  {l.location && <span>ที่เก็บ: <span className="text-slate-600 dark:text-slate-300">{l.location}</span></span>}
                                  {l.supplier && <span>บริษัท: <span className="text-slate-600 dark:text-slate-300">{l.supplier}</span></span>}
                                  {!drug.entry?.caseInfo && caseOfLots([l]) && <span>{caseLine(caseOfLots([l]))}</span>}
                                </div>
                              </div>
                            );
                          })}
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">* ประมาณการตามลำดับ FEFO — lot ที่จ่ายจริงคำนวณอีกครั้งตอนคลังจัดยา</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Add to cart — ยาหมดก็ขอได้ (เตือน ไม่ห้าม) · คีย์เป็นหน่วยคีย์ แสดงผลแปลงเป็นหน่วยย่อย */}
                  {(() => {
                    const opts = drug.entry?.options;
                    const chosen = opts ? (opts.find(o => o.packSize === packChoice[drugKey]) || opts.find(o => o.packSize === drug.entry.defaultPack)) : null;
                    const pack = chosen ? chosen.packSize : (drug.entry?.packSize || 1);
                    const keyed = Math.max(1, parseInt(qtyMap[drugKey] ?? 1) || 1);
                    return (
                    <div className="flex items-center gap-2 flex-wrap mt-3">
                      {opts && (
                        <div className="w-full flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label="ขนาดที่ขอเบิก">
                          <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">ขนาด</span>
                          {opts.map(o => (
                            <button key={o.packSize} type="button" role="radio" aria-checked={o === chosen}
                              onClick={() => setPackChoice(p => ({ ...p, [drugKey]: o.packSize }))}
                              className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-colors ${o === chosen
                                ? 'bg-[#1E90FF] border-[#1E90FF] text-white'
                                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-[#1E90FF]'}`}>
                              {o.label}
                            </button>
                          ))}
                        </div>
                      )}
                      <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">ขอเบิก</span>
                      <input type="number" min="1"
                        value={qtyMap[drugKey] ?? 1}
                        onChange={e => {
                          setQtyMap(p => ({ ...p, [drugKey]: e.target.value }));
                          setWarnMap(p => { const n = { ...p }; delete n[drugKey]; return n; });
                        }}
                        className={`w-24 bg-white dark:bg-slate-900 border rounded-lg px-2 py-2 text-slate-800 dark:text-slate-100 text-center text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#1E90FF] ${warnMap[drugKey] ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40' : 'border-slate-300 dark:border-slate-600'}`} />
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {chosen && (chosen.unit || chosen.packSize === 1) ? chosen.label : entryText(chosen?.label || drug.entry?.label || drug.baseUnit, pack)}
                        {pack > 1 && <span className="text-xs text-slate-400 dark:text-slate-500"> (= {(keyed * pack).toLocaleString()} {drug.baseUnit})</span>}
                      </span>
                      <button onClick={() => addToCart(drug, qtyMap[drugKey] ?? 1, chosen)}
                        className="bg-[#1E90FF] hover:bg-[#1a7fe0] text-white rounded-lg px-4 py-2 text-sm font-bold flex items-center gap-1.5 transition-colors shadow-sm ml-auto">
                        <Plus size={15} /> เพิ่มเข้าตะกร้า
                      </button>
                      {drug.entry?.hint && (
                        <p className="w-full text-xs text-blue-700 dark:text-blue-300 font-medium">{drug.entry.hint} — คีย์จำนวนเป็น {drug.entry.label}</p>
                      )}
                      {warnMap[drugKey] && (
                        <p className="w-full text-xs text-amber-700 dark:text-amber-300 font-medium mt-0.5 flex items-center gap-1"><AlertCircle size={12} /> {warnMap[drugKey]}</p>
                      )}
                    </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
      </div>

      {/* Floating Cart Button */}
      {cart.length > 0 && (
        <button onClick={onCart}
          className="fixed bottom-6 right-5 z-40 bg-[#1E90FF] hover:bg-[#1a7fe0] text-white rounded-2xl shadow-2xl px-5 py-3.5 flex items-center gap-2.5 transition active:scale-95">
          <Package size={20} />
          <span className="font-bold text-base">ตะกร้ายา</span>
          <span className="bg-white dark:bg-slate-900 text-[#1E90FF] rounded-full w-6 h-6 flex items-center justify-center font-black text-sm">{cart.length}</span>
        </button>
      )}
    </div>
  );
}

// ---- Cart ----
// รายการจำนวน 0 = "ได้ยาไปแล้ว" — ดึงประวัติเบิกของหน่วยงาน×รหัสให้กดเติมหมายเหตุ (alreadyGot.js)
// ประวัติสดเท่ารอบนำเข้าชีทเบิก → ไม่พบก็พิมพ์เองในหมายเหตุได้
function AlreadyGotPicker({ department, item, onPick }) {
  const [state, setState] = useState({ loading: true, options: [], failed: false });
  useEffect(() => {
    let alive = true;
    fetchDeptRecentDispense(department, item.code)
      .then(rows => { if (alive) setState({ loading: false, options: recentDispenseOptions(rows), failed: false }); })
      .catch(() => { if (alive) setState({ loading: false, options: [], failed: true }); });
    return () => { alive = false; };
  }, [department, item.code]);
  const current = (item.note || '').trim();
  return (
    <div className="mt-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
        <History size={14} className="shrink-0" /> {ALREADY_GOT_PREFIX} — บันทึกในใบเท่านั้น คลังไม่จัดยาให้ซ้ำ
      </p>
      {state.loading ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> กำลังโหลดประวัติเบิก…</p>
      ) : state.options.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500 dark:text-slate-400">เลือกครั้งที่ได้ยาไป (ประวัติเบิก 90 วันของ {department})</p>
          <div className="flex flex-wrap gap-2">
            {state.options.map(o => {
              const text = formatAlreadyGotNote(o);
              const on = current === text;
              return (
                <button key={`${o.date}|${o.reqNumber}|${o.unit}`} type="button" aria-pressed={on} onClick={() => onPick(text)}
                  className={`text-left text-sm rounded-xl border px-3 py-1.5 transition-colors ${on ? 'bg-[#1E90FF] border-[#1E90FF] text-white' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-[#1E90FF]'}`}>
                  <span className="font-semibold tabular-nums">{isoToThaiBE(o.date)}</span>
                  <span className="tabular-nums"> · {qtyUnitText(o.qty, o.unit)}</span>
                  {o.reqNumber && <span className={on ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'}> · {o.reqNumber}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {state.failed ? 'โหลดประวัติเบิกไม่สำเร็จ' : 'ไม่พบในประวัติเบิก (ข้อมูลถึงรอบนำเข้าล่าสุด)'} — พิมพ์วันที่และจำนวนที่ได้ไปในหมายเหตุด้านล่าง
        </p>
      )}
    </div>
  );
}

function CartView({ info, reqType, cart, setCart, onBack, onSubmitted, auth = {} }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [doneInfo, setDoneInfo] = useState(null);
  const [search, setSearch]   = useState('');
  const [openNotes, setOpenNotes] = useState({}); // index → เปิดช่องหมายเหตุ
  const submittingRef = useRef(false); // กัน double-click ก่อน state loading ทัน re-render → ใบซ้ำ

  // v = จำนวนในหน่วยคีย์ (entryPack) → เก็บหน่วยย่อยสุด · ไม่จำกัดที่คงเหลือ (ขอได้เสมอ — คลังจ่ายเท่าที่มี)
  // 0 = "ได้ยาไปแล้ว" บันทึกเท่านั้น (alreadyGot.js) → เติมคำนำหน้าในหมายเหตุ · กลับเป็น >0 ล้างคำนำหน้าเปล่าทิ้ง
  const updateQty   = (i, v) => setCart(p => {
    const u = [...p]; const pack = u[i].entryPack || 1;
    const n = parseInt(v); const keyed = Number.isFinite(n) ? Math.max(0, n) : 1;
    const note = u[i].note || '';
    const nextNote = keyed === 0 ? (note.trim() ? note : `${ALREADY_GOT_PREFIX} `)
      : (note.trim() === ALREADY_GOT_PREFIX ? '' : note);
    u[i] = { ...u[i], requestedQty: keyed * pack, note: nextNote };
    return u;
  });
  const updateNote  = (i, v) => setCart(p => { const u=[...p]; u[i]={...u[i], note: v}; return u; });

  // เตือน "คลังอาจแบ่งจ่าย" (dispenseCheck — กฎเดียวกับที่คลังตรวจก่อนลงชีท) · ไม่บล็อกการส่ง
  const [chk, setChk] = useState(null);
  const codesKey = [...new Set(cart.map(i => String(i.code || '').trim()).filter(Boolean))].sort().join('|');
  useEffect(() => {
    if (!codesKey) return;
    let alive = true;
    fetchDispenseCheckData(codesKey.split('|')).then(r => { if (alive) setChk(r); }).catch(() => {});
    return () => { alive = false; };
  }, [codesKey]);
  const qtyByCode = {};
  cart.forEach(it => { const c = String(it.code || '').trim(); qtyByCode[c] = (qtyByCode[c] || 0) + (it.requestedQty || 0); });
  const splitNoteOf = (item) => {
    const c = String(item.code || '').trim();
    const d = chk?.byCode?.[c];
    if (!d || !(Number(item.availableBase) > 0)) return '';
    return requesterNoteText(checkDispenseLine({
      qty: qtyByCode[c], avail: Number(item.availableBase), pending: d.pendingBase, notifiedOn: d.notifiedOn,
      avgDay: d.avgDay, avgMonth: d.avgMonth, leadTime: d.leadTime,
      lots: (item.fefoLots || []).map(l => ({ exp: parseExp(l.exp) })),
    }), item.unit || '');
  };

  const submit = async () => {
    if (!cart.length || submittingRef.current) return;
    const missingGot = missingAlreadyGotDetail(cart);
    if (missingGot.length) {
      setError(`รายการจำนวน 0 = ได้ยาไปแล้ว — กดเลือกจากประวัติเบิก หรือพิมพ์วันที่และจำนวนในหมายเหตุ:\n${missingGot.join('\n')}`);
      return;
    }
    submittingRef.current = true;
    setLoading(true); setError('');
    try {
      if (supabase) {
        // Re-validate ณ เวลา submit — ระดับรหัสยา หน่วยย่อยสุด (B-base, ADR-0004)
        // คงเหลือ = Σ(lot.qty × packSize) แปลงเป็นหน่วยย่อย; หัก reservation ต่อ code
        const codes = [...new Set(cart.map(i => i.code).filter(Boolean))];
        let invBaseMap = {};
        // รหัสที่ขอเกินคงเหลืออยู่แล้วตอนกดส่ง = ผู้เบิกตั้งใจขอเกิน (เห็นคำเตือนแล้ว) — ไม่บล็อก (ขอได้เสมอ)
        // และไม่เอาเข้าด่านถอนใบ ADR-0028 ด้านล่าง ซึ่งเหลือไว้กันเฉพาะ 2 หน่วยงานแย่งของที่มีพอพร้อมกัน
        let overAtSubmit = new Set();
        if (codes.length > 0) {
          const [invNow, reservedNow] = await Promise.all([
            fetchInvBaseByCode(codes),
            fetchReservedBase(codes),
          ]);
          invBaseMap = invNow;
          const ownByCode = {};
          cart.forEach(item => { const k = codeKey(item.code); ownByCode[k] = (ownByCode[k] || 0) + item.requestedQty; });
          overAtSubmit = new Set(Object.keys(ownByCode).filter(k =>
            ownByCode[k] > Math.max(0, (invBaseMap[k] ?? 0) - (reservedNow[k] ?? 0))));
        }

        // หัวใบ+รายการในธุรกรรมเดียว (ADR-0028) — เลขใบสุ่ม 4 หลักชนได้ db.js ลองเลขใหม่ให้
        // เบิกระดับยา: ไม่ระบุ lot/exp/ราคา — คลังจัดสรร lot (FEFO) ตอน picking (ADR-0004)
        const req = await submitRequisition(
          { department: info.department, requester_name: info.name, req_type: reqType || null },
          cart.map(item => ({
            drug_code:     item.code,
            drug_name:     item.name,
            drug_unit:     item.unit || null,
            drug_type:     item.drugType || null,
            requested_qty: item.requestedQty,
            item_note:     item.requestedQty === 0 ? alreadyGotNoteForSubmit(item.note) : (item.note?.trim() || null),
            // ขนาดกล่องที่ผู้เบิกเลือก → ใบขอเบิก/หน้าจัดยาแสดง "2 กล่อง (400เม็ด)" (requisition_entry_pack_migration.sql)
            entry_pack:    item.entryUnit ? item.entryPack : null,
            entry_unit:    item.entryUnit || null,
          })),
          genReqNumber,
        );
        // ผู้กดจริง (staff/admin ที่ login) — ต่างจากผู้เบิก proxy (info.name) เมื่อ staff เบิกแทนหน่วยงาน (Critical Rule #1)
        // ถ้าไม่มี auth จริง (เช่น requester ที่ไม่ผ่าน app login) → ใช้ info.name เป็น actor เดิม
        const resolved = resolveAuditUserName(auth);
        const actorName = resolved !== '-' ? resolved : info.name;
        const onBehalfOf = actorName !== info.name ? info.name : undefined;

        // ตรวจซ้ำหลังบันทึก (ADR-0028): ยอดจองรวมใบตัวเองแล้วเกินคงเหลือ = หน่วยงานอื่นส่งยาตัวเดียวกันพร้อมกัน
        // → ถอนใบตัวเอง (ทั้งสองใบอาจถูกถอน — ปลอดภัยกว่าจองเกิน) · ตะกร้าไม่ล้าง ผู้เบิกแก้จำนวนแล้วส่งใหม่
        // ใช้คงเหลือชุดเดียวกับตอนตรวจก่อนบันทึก (คงเหลือเปลี่ยนเฉพาะตอนนำเข้า — ที่ชนกันคือยอดจอง)
        // ห้ามอ่านคงเหลือใหม่: fetchInvBaseByCode กลืน error เป็น {} → คงเหลือ 0 → ถอนใบที่ถูกต้องเพราะเน็ตสะดุด
        if (codes.length > 0) {
          const reservedAfter = await fetchReservedBase(codes);
          const over = findOverReserved({ invBase: invBaseMap, reserved: reservedAfter, codes: codes.map(codeKey).filter(k => !overAtSubmit.has(k)) });
          if (over.length > 0 && await withdrawRequisition(req.id)) {
            const conflicts = over.flatMap(o => {
              const lines = cart.filter(item => codeKey(item.code) === o.code);
              const own = lines.reduce((s, item) => s + item.requestedQty, 0);
              const available = availableForOwn({ inv: o.inv, reserved: o.reserved, own });
              return lines.map(item => ({ drug_code: item.code, drug_name: item.name, unit: item.unit || '', requested: item.requestedQty, available }));
            });
            insertAuditLog({
              action: 'requisition_conflict_withdrawn', table_name: 'requisitions',
              user_name: actorName, department: info.department,
              record_count: conflicts.length,
              details: { kind: 'submit', req_number: req.req_number, requisition_id: req.id, req_department: info.department, conflicts, ...(onBehalfOf ? { on_behalf_of: onBehalfOf } : {}) },
            });
            setError(`มีหน่วยงานอื่นเบิกยานี้พร้อมกัน — ยังไม่ได้ส่งใบเบิก แก้จำนวนแล้วส่งใหม่:\n${
              conflicts.map(c => `${c.drug_name}: ขอ ${c.requested.toLocaleString()} แต่เบิกได้ ${c.available.toLocaleString()} ${c.unit}`.trim()).join('\n')
            }`);
            return;
          }
        }

        insertAuditLog({
          action: 'submit_requisition', table_name: 'requisitions',
          user_name: actorName, department: info.department,
          record_count: cart.length,
          details: { req_number: req.req_number, requisition_id: req.id, req_type: reqType || null, ...(onBehalfOf ? { on_behalf_of: onBehalfOf } : {}) },
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
    } catch (e) { setError(e.message); } finally { setLoading(false); submittingRef.current = false; }
  };

  if (doneInfo) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800 p-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm p-6 text-center space-y-4">
        <div className="flex justify-center"><CheckCircle size={56} className="text-emerald-500" strokeWidth={2} /></div>
        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">ส่งใบเบิกสำเร็จ</h2>
        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-left space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">เลขที่ใบเบิก</span><span className="font-bold text-[#1E90FF]">{doneInfo.reqNumber}</span></div>
          <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">วันที่</span><span className="font-semibold text-slate-800 dark:text-slate-100">{doneInfo.date} {doneInfo.time}</span></div>
          <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">หน่วยงาน</span><span className="font-semibold text-slate-800 dark:text-slate-100">{doneInfo.department}</span></div>
          <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">ชื่อผู้ส่ง</span><span className="font-semibold text-slate-800 dark:text-slate-100">{doneInfo.name}</span></div>
          <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">จำนวนรายการ</span><span className="font-bold text-emerald-600">{doneInfo.itemCount} รายการ</span></div>
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
      <PageHeader onBack={onBack} title={reqType ? `ตะกร้าใบเบิก${reqTypeLabel(reqType)}` : 'ตะกร้าใบเบิก'} subtitle={`${info.department} · ${info.name}`} />

      {cart.length > 1 && (
        <div className="px-4 pt-3 pb-1">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหายาในตะกร้า..."
              className="w-full border border-slate-300 dark:border-slate-600 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E90FF] bg-white dark:bg-slate-900" />
          </div>
          {search && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 px-1">
              แสดง {filteredCart.length} / {cart.length} รายการ
            </p>
          )}
        </div>
      )}

      <div className="flex-1 p-4 space-y-2 pb-32">
        {cart.length === 0
          ? <p className="text-center text-slate-500 dark:text-slate-400 py-20">ยังไม่มีรายการยา</p>
          : filteredCart.length === 0
            ? <p className="text-center text-slate-500 dark:text-slate-400 py-10">ไม่พบยาที่ค้นหา</p>
          : filteredCart.map((item) => {
              const i = cart.indexOf(item);
              const gotAlready = item.requestedQty === 0;
              const overStock = item.availableBase != null && item.requestedQty > item.availableBase;
              const noteOpen = openNotes[i] || !!item.note;
              const splitNote = gotAlready ? '' : splitNoteOf(item);
              // preview: คาดว่าจะได้ lot อะไรบ้าง ตาม FEFO (lot ตรวจรับแล้ว) — authoritative recompute ตอน picking
              const alloc = item.fefoLots && !gotAlready ? allocateFefo(item.requestedQty, item.fefoLots) : null;
              // ขนาดกล่องที่เลือกไม่ตรง lot ที่จะจ่าย → บอกเป็นกล่องจริง เช่น "2 กล่อง (500เม็ด)" แทน "เกินที่ขอ"
              const packMismatch = alloc && item.entryUnit && item.entryPack > 1 && alloc.allocation.some(a => a.packSize !== (item.entryInner || item.entryPack))
                ? alloc.allocation.map(a => `${a.packs.toLocaleString()} ${packWord(item.unit)} (${a.unit})`).join(' + ')
                : null;
              return (
            <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* ลำดับการเบิก */}
                  <span className="shrink-0 w-7 h-7 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#1E90FF] font-bold text-sm flex items-center justify-center mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <p className="font-bold text-lg text-slate-800 dark:text-slate-100 leading-snug flex-1">{item.name}</p>
                      {item.drugType && item.drugType !== '-' && <DrugTypeBadge type={item.drugType} />}
                    </div>
                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">รหัส: {item.code}</p>
                    {item.availableBase != null && (
                      <p className="text-sm mt-1">
                        <span className="text-slate-500 dark:text-slate-400">คงเหลือในคลัง </span>
                        <span className="font-bold text-emerald-600">{Number(item.availableBase).toLocaleString()}</span>
                        <span className="text-slate-500 dark:text-slate-400"> {item.unit || ''}</span>
                      </p>
                    )}
                  </div>
                  <button onClick={() => { setCart(p => p.filter((_,j)=>j!==i)); setError(''); }}
                    className="shrink-0 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg p-2 transition-colors"><Trash2 size={18} /></button>
                </div>

                {/* จำนวนที่ขอเบิก — หน่วยคีย์ (entryPack) · ไม่จำกัดที่คงเหลือ */}
                {(() => {
                  const pack = item.entryPack || 1;
                  const keyed = Math.round(item.requestedQty / pack);
                  return (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">ขอเบิก</span>
                    <button onClick={() => updateQty(i, keyed - 1)} aria-label="ลดจำนวน" className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg p-2 transition-colors"><Minus size={16} /></button>
                    <input type="number" min="0" value={keyed} onChange={e => updateQty(i, e.target.value)} aria-label={`จำนวน ${item.name}`}
                      className={`w-20 border rounded-lg px-2 py-2 text-slate-800 dark:text-slate-100 text-center text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#1E90FF] ${overStock ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40' : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800'}`} />
                    <button onClick={() => updateQty(i, keyed + 1)}
                      className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg p-2 transition-colors"><Plus size={16} /></button>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {cartUnitText(item)}
                      {pack > 1 && <span className="text-xs text-slate-400 dark:text-slate-500"> (= {item.requestedQty.toLocaleString()} {item.unit || ''})</span>}
                    </span>
                    {item.entryHint && !gotAlready && <p className="w-full text-xs text-blue-700 dark:text-blue-300 font-medium">{item.entryHint}</p>}
                  </div>
                  );
                })()}
                {gotAlready && (
                  <AlreadyGotPicker department={info.department} item={item} onPick={(text) => { updateNote(i, text); setError(''); }} />
                )}
                {splitNote && (
                  <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg px-2.5 py-1.5 font-medium mt-2 flex items-start gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" /> {splitNote}</p>
                )}
                {overStock && !splitNote && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-medium mt-1.5 flex items-center gap-1"><AlertCircle size={12} /> {Number(item.availableBase) > 0
                    ? `เกินคงเหลือในคลัง (${Number(item.availableBase).toLocaleString()} ${item.unit || ''}) — คลังจ่ายเท่าที่มี ส่วนที่ขาดบันทึกค้างจ่าย`
                    : 'ยาหมดในคลัง — คลังบันทึกค้างจ่ายให้'}</p>
                )}

                {/* Preview: คาดว่าจะได้ lot อะไรบ้าง ตาม FEFO (lot ตรวจรับแล้ว) */}
                {alloc && alloc.allocation.length > 0 && (
                  <div className="mt-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                      <Package size={12} /> คาดว่าจะจ่ายจาก Lot (ใกล้หมดอายุก่อน)
                    </p>
                    <div className="space-y-1">
                      {alloc.allocation.map((a, ai) => (
                        <div key={ai} className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 items-start text-sm">
                          <div className="flex items-center gap-x-2 gap-y-1 flex-wrap min-w-0">
                            <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">Lot {a.lot || '-'}</span>
                            <span className="text-xs text-slate-400 dark:text-slate-500">Exp {fmtExp(a.exp)}</span>
                            {isNearExpiry(a.exp) && (
                              <span className="inline-flex items-center gap-0.5 text-xs bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 rounded px-1.5 py-0.5 font-semibold"><Clock size={10}/> ใกล้หมดอายุ · {expCountdown(a.exp)}</span>
                            )}
                          </div>
                          <div className="text-right whitespace-nowrap">
                            <span className="font-bold text-emerald-600">{a.base.toLocaleString()} {item.unit || ''}</span>
                            <span className="text-xs text-slate-400 dark:text-slate-500"> ({a.packs.toLocaleString()} × {a.unit})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {packMismatch ? (
                      <p className="text-xs text-amber-600 font-semibold mt-2 pt-2 border-t border-amber-100 dark:border-amber-900/50 flex items-start gap-1">
                        <AlertCircle size={12} className="mt-0.5 shrink-0" /> กล่องที่จะจ่ายไม่ใช่ขนาด {item.entryUnit} ที่เลือก — ได้ {packMismatch} = {alloc.allocatedBase.toLocaleString()} {item.unit || ''}
                      </p>
                    ) : alloc.overBase > 0 && (
                      <p className="text-xs text-amber-600 font-semibold mt-2 pt-2 border-t border-amber-100 dark:border-amber-900/50 flex items-center gap-1">
                        <AlertCircle size={12} /> จ่ายเต็มกล่อง — ได้ {alloc.allocatedBase.toLocaleString()} {item.unit || ''} (เกินที่ขอ {alloc.overBase.toLocaleString()})
                      </p>
                    )}
                    {!alloc.fulfilled && (
                      <p className="text-xs text-red-600 font-semibold mt-2 pt-2 border-t border-red-100 dark:border-red-900/50 flex items-center gap-1">
                        <AlertCircle size={12} /> ของไม่พอเบิก — ขาดอีก {alloc.shortfallBase.toLocaleString()} {item.unit || ''} (มีให้จ่าย {alloc.allocatedBase.toLocaleString()})
                      </p>
                    )}
                  </div>
                )}

                {/* หมายเหตุรายการ — ซ่อนจนกดเปิด */}
                {noteOpen ? (
                  <input type="text" value={item.note || ''} onChange={e => updateNote(i, e.target.value)} autoFocus={!item.note}
                    placeholder={gotAlready ? `${ALREADY_GOT_PREFIX} วันที่ จำนวน (เลขใบ)` : 'หมายเหตุรายการนี้...'} aria-label={`หมายเหตุ ${item.name}`}
                    className="w-full mt-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 placeholder-slate-400 text-base focus:outline-none focus:ring-1 focus:ring-[#1E90FF]" />
                ) : (
                  <button onClick={() => setOpenNotes(p => ({ ...p, [i]: true }))}
                    className="mt-2.5 inline-flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500 hover:text-[#1E90FF] transition-colors">
                    <Plus size={14} /> เพิ่มหมายเหตุ
                  </button>
                )}
              </div>
            </div>
          ); })}
        {error && <p className="text-red-600 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl px-3 py-2 flex items-start gap-2 whitespace-pre-line"><AlertCircle size={14} className="shrink-0 mt-0.5"/>{error}</p>}
      </div>
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-700">
          <button onClick={submit} disabled={loading}
            className="w-full bg-[#1E90FF] hover:bg-[#1a7fe0] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl py-3.5 font-semibold flex items-center justify-center gap-2 transition">
            <Send size={18} />{loading ? 'กำลังส่งใบเบิก...' : `ส่งใบเบิก (${cart.length} รายการ)`}
          </button>
        </div>
      )}
    </div>
  );
}

// ---- ใบเบิกรูปแบบชีทเบิก (ใบพิมพ์ / PDF แชร์ / Excel) ----
// ล้อ PDF ที่คลังทำจาก Excel (scripts/dispense-pdf.ps1) — lib/reqSheetFormat.js · แถว+หมายเหตุชุดเดียวกับใบ lot คุม (buildLotRowObjs)
// sort: SORT_BY_REQ = ตามลำดับในใบ (ฉบับห้องยา/หน่วยงาน) · SORT_BY_LOG = ตามที่เก็บ (ฉบับคลังเดินจัดยา)
async function buildReqSheetRows(reqs, sort = SORT_BY_REQ) {
  const ctx = await computeReqAllocations(reqs);
  ctx.lastImportAt = await fetchLastInventoryImportAt();
  return reqs.flatMap(req => {
    const created = new Date(req.created_at);
    const rows = buildLotRowObjs(req, ctx).map(r => {
      const expObj = r.exp ? parseExp(r.exp) : null;
      return {
        date: fmtDateCE(created), dateObj: isNaN(created) ? null : created,
        mainLog: r.mainLog, detailLog: r.detailLog, code: r.code, drugType: r.drugType, name: r.name, unit: r.unit,
        price: r.price, lot: r.lot, exp: r.exp ? fmtExp(r.exp) : '', expObj, nearExp: !!(r.exp && isNearExpiry(r.exp)),
        itemType: r.itemType, before: r.before, out: r.out, after: r.after, dept: req.department || '', note: r.note,
      };
    });
    return sort === SORT_BY_LOG ? sortRowsByLog(rows) : rows;
  });
}

const reqSheetTitle = (req) => sheetTitle(req.department, req.req_type ? reqTypeLabel(req.req_type) : '');
const reqSheetNo = (req) => req.receipt_no || req.req_number || '';
const reqFileBase = (req, sort) => safeFileName(`${reqSheetTitle(req)}${sort === SORT_BY_LOG ? ' (ตามที่เก็บ)' : ''}_${reqSheetNo(req)}`);
// บรรทัดใต้หัวใบ — ยกมาจากใบ lot คุม (รวมเข้าใบนี้ 24/11/2569) · ยังไม่จัดยา = lot ในใบเป็นแค่ประมาณการ FEFO
const reqSheetMeta = (req) => ({
  meta: [`ผู้เบิก: ${req.requester_name || '-'}`, req.picker_name ? `ผู้จัดยา: ${req.picker_name}` : '', `สถานะ: ${STATUS_CONFIG[req.status]?.label || req.status}`].filter(Boolean).join(' · '),
  metaWarn: ['pending', 'approved', 'partial', 'rejected'].includes(req.status) ? 'ประมาณการ FEFO — ยังไม่จัดยา' : '',
});

// พิมพ์ — preopenedWin = หน้าต่างที่เปิดตอนคลิก (กัน popup blocker); ไม่มี/โดนบล็อก → openPrintUrl มี <a> fallback สำหรับ LINE WebView
async function printReq(req, preopenedWin, sort = SORT_BY_REQ) {
  const rows = await buildReqSheetRows([req], sort);
  const html = buildSheetHtml(rows, {
    title: reqSheetTitle(req), centerNo: reqSheetNo(req), autoPrint: true, ...reqSheetMeta(req),
    // ลิงก์ blob: ของหน้านี้เปิดได้เฉพาะเครื่องที่สร้าง — ผู้ใช้เคยแชร์ลิงก์เข้า LINE แล้วผู้รับเปิดไม่ได้ (13/11/2569)
    footerNote: 'ลิงก์ของหน้านี้เปิดได้เฉพาะเครื่องนี้ — จะส่งให้คนอื่นพิมพ์ ใช้ปุ่ม "ส่งเป็น PDF" ในแอป',
  });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  openPrintUrl(url, preopenedWin);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ส่งเป็น PDF — มือถือเปิด share sheet (LINE ได้ไฟล์ PDF) · คอมดาวน์โหลดไฟล์
async function shareReqPdf(req, sort, auth) {
  const rows = await buildReqSheetRows([req], sort);
  const html = buildSheetHtml(rows, { title: reqSheetTitle(req), centerNo: reqSheetNo(req), ...reqSheetMeta(req) });
  const blob = await htmlToPdfBlob(html);
  const fileName = `${reqFileBase(req, sort)}.pdf`;
  const result = await shareOrDownload(blob, fileName, reqSheetTitle(req));
  if (result !== 'cancelled') {
    await insertAuditLog({
      action: 'export_pdf', table_name: 'requisitions', record_id: req.id,
      user_name: resolveAuditUserName(auth), department: auth?.department,
      details: { req_number: req.req_number, receipt_no: req.receipt_no || null, file: fileName, via: result, sort, req_department: req.department },
    });
  }
}

// Export Excel — คอลัมน์/รูปแบบ/ตั้งหน้าเหมือนชีทเบิก (เปิดแล้วสั่งพิมพ์ได้ทันที) · หลายใบ = เรียงทีละใบ
async function exportReqExcel(reqs, auth, sort = SORT_BY_REQ) {
  if (!reqs.length) return;
  const rows = await buildReqSheetRows(reqs, sort);
  const one = reqs.length === 1 ? reqs[0] : null;
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const fileName = one ? `${reqFileBase(one, sort)}.xlsx` : `ใบเบิกยา_${date}.xlsx`;
  const blob = await buildSheetXlsxBlob(rows, { title: one ? reqSheetTitle(one) : 'ใบเบิกยา', centerNo: one ? reqSheetNo(one) : '' });
  const result = await shareOrDownload(blob, fileName, 'ใบเบิกยา');
  if (result !== 'cancelled') {
    await insertAuditLog({
      action: 'export_excel', table_name: 'ใบเบิกยา',
      user_name: resolveAuditUserName(auth), department: auth?.department,
      record_count: rows.length, details: { file: fileName },
    });
  }
}

// จ่ายออกแล้ว + มี import inventory CSV รอบใหม่หลังจ่าย → qty สดสะท้อน "หลังจ่าย" แล้ว
// (แอปไม่หัก inventory.qty เองตอนจ่าย — ตัดจริงใน HosXP แล้ว re-import; ดู CONTEXT.md §ใบ lot คุม)
// ลงชีทเบิกแล้ว + นำเข้าหลังลงชีท = ยอดในแอปหักใบนี้แล้วเช่นกัน ไม่ว่าในแอปติ๊กจ่ายหรือยัง (กฎเลิกหักเดียวกับ reservation.js)
// เดิมดูแค่สถานะจ่ายออก → ใบห้องยา1 ที่ลงชีท+นำเข้าแล้วแต่ยังจัดอยู่ พิมพ์ "คงเหลือก่อนจ่าย" เป็นยอดหลังจ่าย (เจอ 24/11/2569)
const qtyIsPostDispense = (req, lastImportAt) => {
  if (req.sheet_entered_at && lastImportAt && new Date(lastImportAt) > new Date(req.sheet_entered_at)) return true;
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
// ใบ lot คุม (Lot Control Sheet) — รวมเข้า "พิมพ์ใบเบิก" แบบเรียงตามที่เก็บแล้ว 24/11/2569 (ข้อมูลชุดเดียวกัน · user เลือก)
// ดู CONTEXT.md §ใบ lot คุม
// ============================================================
// แถวราย lot ของใบ (คงเหลือก่อน/หลัง + หมายเหตุอัตโนมัติ) — ใช้ร่วม ใบพิมพ์แบบชีทเบิก / PDF / Excel
// เลขทุกเอกสารต้องตรงกัน (Rule #6) · ctx = ผล computeReqAllocations + lastImportAt · คืนตามลำดับในใบ (ยังไม่เรียง)
function buildLotRowObjs(req, ctx) {
  const { allocByItem, onHandByLot, onHandByCode, logMap, unitByCode = {}, pendingCodes, discontinuedCodes, supplierChangedLots, fefoByCode, lastImportAt } = ctx;
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
    // หน่วยซื้อของแต่ละ lot (inventory.unit) — หมายเหตุ "เบิก X จ่าย Y" ใช้หน่วยซื้อเดียวกับคอลัมน์ปริมาณ
    // lot ในรายการเดียวกันคนละขนาดแพ็ค = แปลงไม่ได้ → คงหน่วยย่อย
    const packUnitOf = (lot) => (logMap[`${code}|${String(lot || '').trim()}`] || {}).unit || unitByCode[code] || '';
    const packSizes = [...new Set(entries.map(e => parseUnit(packUnitOf(e.lot)).packSize || 1))];
    const notePs = packSizes.length === 1 ? packSizes[0] : 1;
    const noteBaseUnit = parseUnit(packUnitOf(entries[0].lot)).baseUnit || '';
    const nq = (v) => (notePs > 1 ? fmtPackNote(v, notePs, noteBaseUnit) : v.toLocaleString());
    // หมายเหตุระดับรายการ: เหตุผลจ่ายไม่ครบ / จ่ายเกินเต็มกล่อง / โน้ตผู้เบิก / โน้ตคลัง
    const itemNotes = [];
    if (item.item_note) itemNotes.push(item.item_note);
    if (item.staff_note) itemNotes.push(item.staff_note);
    // จ่าย lot ไม่เรียง exp (ยาสนับสนุนก่อน) ต้องแจ้งบนใบเสมอ — CONTEXT.md §การจัดสรร lot
    if (alloc && alloc.length) {
      const orderNote = lotOrderNote(alloc, (fefoByCode[code] || []).filter(lotNotExpired), parseExp, fmtExp);
      if (orderNote) itemNotes.push(orderNote);
    }
    if (out < want) {
      // "ยาหมดรอของส่ง" = สถานะสด ณ วันพิมพ์ (live) โดยเจตนา — ผู้เบิกต้องรู้ว่า "ตอนนี้" ยาหมดหรือยัง
      // ไม่ผูกกับ snapshot ที่คอลัมน์คงเหลือหลังจ่ายใช้ (นั่นคือยอด ณ ตอนจัด) จึงอาจต่างจากคอลัมน์นั้นในใบเก่า
      const liveTotal = onHandByCode[code] ?? 0;
      const remainAfter = qtyIsPostDispense(req, lastImportAt) ? liveTotal : liveTotal - out;
      const wo = `เบิก ${nq(want)} จ่าย ${nq(out)}`;
      if (discontinuedCodes.has(code))    itemNotes.push(`${wo} ยาตัดออกจากบัญชี`);
      else if (pendingCodes.has(code))    itemNotes.push(`${wo} รอตรวจรับ`);
      else if (remainAfter <= 0)          itemNotes.push(`${wo} ยาหมดรอของส่ง`);
    } else if (out > want) {
      itemNotes.push(`ขอ ${nq(want)} จ่าย ${nq(out)} — จ่ายเต็มกล่อง`);
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
      // หน่วย/ปริมาณ = หน่วยซื้อของ lot (inventory.unit เช่น 1000เม็ด × 6) คู่กับราคาต่อหน่วยซื้อ — แบบชีทเบิก (user สั่ง 13/11/2569)
      // ไม่มีหน่วยใน inventory → หน่วยในใบ + หน่วยย่อยเดิม
      const packUnit = ref.unit || unitByCode[code] || '';
      const ps = parseUnit(packUnit).packSize || 1;
      rowObjs.push({
        mainLog: ref.main_log || '', detailLog: ref.detail_log || '',
        code: code || '-', drugType: item.drug_type || '-', name: item.drug_name || '-',
        unit: packUnit || item.drug_unit || '-', price: e.price, lot: e.lot || '-', exp: e.exp,
        itemType: ref.item_type || '-', before: toPackQty(before, ps), out: toPackQty(e.out, ps), after: toPackQty(after, ps),
        note: notes.join(' '),
      });
    });
  });
  return rowObjs;
}

// ============================================================
// หน่วยนับของรายการในใบพิมพ์ = หน่วยซื้อตาม Master แบบใบตัดเบิก (6,000 เม็ด → 6 × 1000เม็ด · user สั่ง 14/11/2569)
// กฎเดียวกับหน้าคีย์ (entryUnitOf): lot ต่างขนาดแพ็ค / ไม่มีขนาด = คงหน่วยย่อยที่ DB เก็บ
// ผู้เบิกเลือกขนาดกล่องไว้ (entry_pack) → "กล่อง (400เม็ด)" ตามที่ขอ
// ============================================================
const makeItemPack = (fefoByCode, unitByCode) => (item) => {
  if (Number(item.entry_pack) > 1 && item.entry_unit) {
    return { packSize: Number(item.entry_pack), label: entryPackLabel(item.entry_unit, item.drug_unit) };
  }
  const code = String(item.drug_code || '').trim();
  const lots = fefoByCode[code] || [];
  const unit = unitByCode[code] || '';
  const packSizes = lots.length ? lots.map(l => l.packSize) : [parseUnit(unit).packSize];
  const r = entryUnitOf({ unit, baseUnit: parseUnit(unit).baseUnit || '', packSizes });
  return r.packSize > 1 ? r : { packSize: 1, label: item.drug_unit || '-' };
};
const fmtPack = (base, packSize) => toPackQty(base, packSize).toLocaleString('en-US', { maximumFractionDigits: 2 });

// ============================================================
// ใบเบิกเวชภัณฑ์ยา (ฟอร์มราชการ) — รวมใบปะหน้ากับรายการเป็นใบเดียว (user เห็นชอบแบบ 20/11/2569)
// เดิม >12 รายการพิมพ์ "ตามเอกสารแนบท้าย" แล้วแนบใบขอเบิก → เอกสารแนบไม่มีลายเซ็น สลับแผ่นได้ + ใบปะหน้าล้น 2 หน้า
// ตอนนี้ลงทุกรายการในตาราง (ไม่มีคงเหลือก่อน/หลังจ่าย และจำนวนที่จ่าย — อยู่ในใบตัดเบิกที่แนบ 24/11/2569) + รหัส/หมายเหตุ · แบ่งหน้าเอง (buildPaginatedHtml) หัวตารางทุกหน้า
// สายลายเซ็นชุดเดียวท้ายใบ เลข ①–⑤ = ลำดับการเซ็น (CONTEXT §ใบเบิกฟอร์มรายการ: ผู้ขอเบิก → ผู้เบิก → ผู้จ่าย → ผู้รับ → ผู้อนุมัติ)
// หลายหน้า: เลขที่เบิก + หน้า n/N ทุกหน้า (ป้ายผู้เบิกลงชื่อกำกับหน้า เอาออก 23/11/2569)
// ============================================================
async function buildCoverHtml(req, autoPrint = true) {
  const { fefoByCode, unitByCode } = await computeReqAllocations([req]);
  const allItems = req.requisition_items || [];
  const items = req.status === 'partial'
    ? allItems.filter(item => item.approved_qty != null && item.approved_qty > 0)
    : allItems;
  const thaiDate = new Date(req.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  const packOf = makeItemPack(fefoByCode, unitByCode);

  // ไม่มีช่องคงเหลือก่อน/หลังจ่าย และจำนวนที่จ่าย (user 24/11/2569): ห้องยาพิมพ์ใบนี้เซ็นตั้งแต่ก่อนคลังจัด
  // จำนวนจ่ายจริง + lot + คงเหลือ + เหตุผลจ่ายไม่ครบ อยู่ในใบตัดเบิกของคลังที่แม็กแนบใบนี้ทุกครั้ง
  const rows = items.map((item, i) => {
    const code = String(item.drug_code || '').trim();
    const want = Number(item.approved_qty ?? item.requested_qty) || 0;
    const { packSize, label } = packOf(item);
    return `<tr><td class="c">${i + 1}</td><td class="mono">${escHtml(code || '-')}</td>
      <td>${escHtml(item.drug_name || '-')}</td><td class="c">${escHtml(label)}</td>
      <td class="r b">${fmtPack(want, packSize)}</td>
      <td>${escHtml(item.item_note || '')}</td></tr>`;
  });

  // ช่องกรอกแบบฟอร์มกระดาษ: ค่าวางบนเส้นจุด · ไม่ใส่ width = ยืดเต็มบรรทัด
  // flex-basis auto (ไม่ใช่ 0) — ชื่อหน่วยงานยาว (ศบส.4 …) ดันข้อความท้ายขึ้นบรรทัดใหม่แทนการล้นทับ
  // ช่องว่างต้องมี &nbsp; ไม่งั้น flex หา baseline ไม่ได้ เส้นจะลอยไม่ตรงช่องที่มีค่า
  const fill = (val = '', style = '') => `<span class="f"${style ? ` style="${style}"` : ''}>${val ? escHtml(val) : '&nbsp;'}</span>`;
  const row = (cls, parts) => `<div class="ln${cls}">${parts.map(p => p.startsWith('<span class="f"') ? p : `<span>${p}</span>`).join('')}</div>`;
  const line = (...parts) => row('', parts);
  const lineRight = (...parts) => row(' right', parts);
  const dateLine = row(' dt', ['วันที่', fill('', 'min-width:20px'), '/', fill('', 'min-width:20px'), '/', fill('', 'min-width:20px')]);
  const step = (n) => `<span class="step">${n}</span>`;
  // บล็อกลายเซ็น = grid [① (ลงชื่อ) | เส้นเซ็น | (บทบาท)] · ชื่อ/ตำแหน่งกินเต็มความกว้างคอลัมน์
  // ③ ⑤ (under=true): เส้นเซ็นยาวเต็มคอลัมน์ · ชื่อในวงเล็บ + บทบาท/ตำแหน่งอยู่ใต้เส้น
  // (user 23/11/2569: ลองชื่อท้ายเส้นแล้วเส้นสั้นเซ็นไม่พอ ให้เลื่อนชื่อลงมาข้างล่าง)
  const nm = (text) => `<span class="nm">${escHtml(text)}</span>`;
  // ชื่อบุคคลในวงเล็บ — ชื่อกับนามสกุลเว้น 3 ช่อง (ช่องเดียวดูติดกัน · user สั่ง 14/11/2569)
  const person = (name, cls = 'nm') => `<span class="${cls}">(${escHtml(name).replace(/ +/g, '&nbsp;&nbsp;&nbsp;')})</span>`;
  const blankName = '<span class="nm">(..........................................................)</span>';
  const sig = (n, role, rows, under = false) => under
    ? `<div class="sig u"><span>${step(n)}(ลงชื่อ)</span>${fill()}${person(rows[0], 'nm who')}${nm(role)}${rows.slice(1).join('')}</div>`
    : `<div class="sig"><span>${step(n)}(ลงชื่อ)</span>${fill()}<span>(${role})</span>${rows.join('')}</div>`;
  const head = COVER_FORM.requesterHead;
  const headName = head.depts.includes(String(req.department || '').replace(/\s+/g, '')) ? head.name : '';
  const formTitle = reqFormTitle(req.req_type);

  const firstHead = `
    ${lineRight('เลขที่เบิก', fill(req.req_number, 'flex:none;width:52mm;font-weight:600'))}
    <h2>${formTitle}</h2>
    <div class="hosp">${COVER_FORM.hospital}</div>
    ${lineRight('วันที่', fill(thaiDate, 'flex:none;width:40mm'))}
    <p>เรียน ผู้อำนวยการ${COVER_FORM.hospital}</p>
    ${line('ข้าพเจ้า', fill(headName || req.requester_name || ''), 'ตำแหน่ง', fill(headName ? head.position : ''))}
    ${line('หน่วยงานผู้เบิก(ฝ่าย)', fill(req.department || ''), 'มีความประสงค์จะขอเบิกวัสดุเพื่อใช้ในรายการต่อไปนี้')}`;
  const contHead = `<div class="cont"><b>${formTitle} (ต่อ)</b><span>เลขที่เบิก <b>${escHtml(req.req_number)}</b> · ${escHtml(req.department || '')} · วันที่ ${thaiDate}</span></div>`;
  const table = `<colgroup><col style="width:12mm"><col style="width:18mm"><col><col style="width:19mm">
      <col style="width:18mm"><col style="width:34mm"></colgroup>
    <thead><tr><th>ลำดับ</th><th>รหัส</th><th>รายการ</th><th>หน่วยนับ</th>
      <th>จำนวน<br>ที่เบิก</th><th>หมายเหตุ</th></tr></thead>`;
  const tail = `
    <p class="sum">รวม ${items.length} รายการ · ตัวเลขทุกช่องเป็นหน่วยตามช่อง "หน่วยนับ" · จำนวนที่จ่าย lot และคงเหลือ ตามใบตัดเบิกของคลังที่แนบ${req.note ? ` · หมายเหตุใบเบิก: ${escHtml(req.note)}` : ''}</p>
    <div class="cols">
      <div class="col">
        <div class="blk">
          <p><strong>เรียน หัวหน้ากลุ่มงาน / หน่วยงาน</strong></p>
          <p class="indent">- เพื่อเห็นชอบให้เบิกวัสดุเพื่อใช้ในงานราชการ</p>
          ${line('ในหน่วยงาน', fill(req.department || ''))}
          ${sig('1', 'ผู้เขียนคำขอ', [])}
          ${line('ตำแหน่ง', fill())}
          ${dateLine}
        </div>
        <div class="blk">
          ${sig('2', 'ผู้เบิก', headName
            ? [person(headName), nm(`ตำแหน่ง ${head.position}`), nm(head.group)]
            : [blankName])}
          ${headName ? '' : line('ตำแหน่ง', fill())}
          ${dateLine}
        </div>
        <div class="blk">
          ${sig('4', 'ผู้รับยา', [blankName])}
          ${line('ตำแหน่ง', fill())}
          ${dateLine}
        </div>
      </div>
      <div class="col">
        <div class="blk">
          <p><strong>เรียน ${COVER_FORM.approver.role}</strong></p>
          <p class="indent">- เพื่ออนุมัติเบิกจ่ายวัสดุตามคำขอข้างต้น</p>
          ${sig('3', 'ผู้จ่ายยาและลงทะเบียน', [
            COVER_FORM.dispenser.name,
            nm(COVER_FORM.dispenser.role),
            nm(`ตำแหน่ง ${COVER_FORM.dispenser.position}`),
          ], true)}
          ${dateLine}
        </div>
        <div class="blk">
          <p class="indent">- อนุมัติ</p>
          <p class="indent">- รับทราบการเบิกจ่าย</p>
          ${sig('5', 'ผู้อนุมัติเบิกจ่าย', [
            COVER_FORM.approver.name,
            nm(COVER_FORM.approver.role),
            nm(`ตำแหน่ง ${COVER_FORM.approver.position}`),
          ], true)}
          ${dateLine}
        </div>
      </div>
    </div>`;
  const css = `
    h2 { text-align: center; font-size: 21px; margin: 0 0 2px; text-decoration: underline; text-underline-offset: 5px; }
    .hosp { text-align: right; font-weight: 700; margin-bottom: 2px; }
    p { margin: 0 0 6px; }
    .ln { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 6px; margin: 0 0 6px; }
    .ln > span { white-space: nowrap; }
    .ln.right { justify-content: flex-end; }
    .f { border-bottom: 1px dotted #333; text-align: center; line-height: 1.3; padding: 0 4px; }
    .ln .f { flex: 1 1 auto; min-width: 40px; }
    .sum { font-size: 14px; margin: 4px 0 0; }
    .cols { display: flex; gap: 8mm; margin-top: 10px; }
    .col { flex: 1 1 0; min-width: 0; font-size: 15px; }
    .col .ln { margin-bottom: 7px; }
    /* ระยะห่างระหว่างช่องเซ็น ①–⑤ (user 23/11/2569: ยังติดกัน ให้เว้นมากขึ้น · 24/11/2569: วันที่กับ (ลงชื่อ) บล็อกถัดไปยังใกล้ 10→26→40px · ลงชื่อกับวันที่ในบล็อก 10→18px) */
    .blk { margin-bottom: 40px; }
    /* บล็อกท้ายคอลัมน์ไม่ต้องเว้น + หัวใบชิดขึ้น — ใบ 6 รายการ (REQ-20261124-3837) ลายเซ็นเกินหน้า 40px ตกไปหน้า 2 พร้อม 3 แถวท้าย หน้า 1 ว่างครึ่งหน้า (user แจ้ง 24/11/2569) · ไม่แตะระยะช่องเซ็น */
    .col > .blk:last-child { margin-bottom: 0; }
    .pbody > .ln, .pbody > p { margin-bottom: 3px; }
    .pbody > h2 { margin-bottom: 0; }
    .indent { margin-left: 14px; }
    /* margin-top ของเส้นเซ็น = ที่ว่างให้เซ็นเหนือเส้น · วันที่เว้นจากชื่อ/ตำแหน่ง (user 23/11/2569: ช่องเซ็นแน่นเกิน) */
    .sig { display: grid; grid-template-columns: auto minmax(30px, 1fr) auto; column-gap: 6px; row-gap: 3px; align-items: baseline; margin: 22px 0 6px; }
    .sig > span { white-space: nowrap; }
    .sig.u { grid-template-columns: auto minmax(30px, 1fr); }
    .sig .who { padding-top: 4px; }
    .sig .nm { grid-column: 1 / -1; text-align: center; white-space: normal; }
    .ln.dt { margin-top: 18px; }
    .step { display: inline-block; min-width: 1.35em; height: 1.35em; line-height: 1.3em; border: 1px solid #000; border-radius: 50%; text-align: center; font-size: 12px; font-weight: 700; margin-right: 3px; }`;

  // ไม่มีป้าย "ผู้เบิกลงชื่อกำกับหน้า" แล้ว (user 23/11/2569) — ท้ายกระดาษทุกหน้ามีเลขที่เบิก + หน้า n/N ผูกแผ่นอยู่แล้ว
  return buildPaginatedHtml({
    title: `${formTitle} ${escHtml(req.req_number)}`,
    css, firstHead, contHead, table, rows,
    blankRow: '<tr class="blank"><td></td><td></td><td></td><td></td><td></td><td></td></tr>',
    minRows: 7, tail, autoPrint,
    footLeft: `${req.req_number} · ${req.department || ''}`,
  });
}

// ============================================================
// ใบขอเบิก — สิ่งที่ผู้เบิกกรอกส่งมา (requested_qty + หมายเหตุผู้เบิก) ไม่มี lot/คงเหลือ
// คู่กับ "ใบตัดเบิก" (printReq — ระบบ/คลังจัด lot ให้) และใบเบิกเวชภัณฑ์ยา (user ขอ 14/11/2569 ให้ผู้เบิกพิมพ์ได้ครบ 3 แบบ)
// จำนวน = requested_qty เสมอ (ไม่ใช่ approved_qty) — ใบนี้เป็นหลักฐานว่าหน่วยงานขออะไร
// แบ่งหน้าเอง (buildPaginatedHtml) — หัวคอลัมน์ทุกหน้า เส้นตารางปิดครบ (เดิม Safari ตัดแถวครึ่งตัว หน้า 2 ไม่มีหัวตาราง)
// ============================================================
async function buildRequestHtml(req, autoPrint = true) {
  const items = req.requisition_items || [];
  const { fefoByCode, unitByCode } = await computeReqAllocations([req]);
  const packOf = makeItemPack(fefoByCode, unitByCode);
  const dt = (v) => new Date(v).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  const edited = req.updated_at && req.updated_at !== req.created_at;
  const rows = items.map((item, i) => {
    const want = Number(item.requested_qty) || 0;
    const { packSize, label } = packOf(item);
    const qty = packSize > 1 ? fmtPackNote(want, packSize, item.drug_unit || '') : want.toLocaleString();
    return `<tr><td class="c">${i + 1}</td><td class="mono">${escHtml(item.drug_code || '-')}</td>
      <td>${escHtml(item.drug_name || '-')}</td><td class="r b">${escHtml(qty)}</td>
      <td class="c">${escHtml(label)}</td><td class="sm">${escHtml(item.item_note || '')}</td></tr>`;
  });
  const kind = req.req_type ? ` · ใบเบิก${escHtml(reqTypeLabel(req.req_type))}` : '';

  const firstHead = `
    <h2>ใบขอเบิกยาและเวชภัณฑ์</h2>
    <div class="sub">${escHtml(COVER_FORM.hospital)} · รายการที่หน่วยงานขอเบิก</div>
    <div class="meta">
      <span>เลขที่เบิก <b>${escHtml(req.req_number)}</b>${kind}</span>
      <span>วันที่ส่งใบเบิก <b>${dt(req.created_at)}</b></span>
      <span>หน่วยงาน <b>${escHtml(req.department || '-')}</b></span>
      <span>ผู้ขอเบิก <b>${escHtml(req.requester_name || '-')}</b></span>
      ${edited ? `<span>แก้ไขล่าสุด <b>${dt(req.updated_at)}</b></span>` : ''}
    </div>`;
  const contHead = `<div class="cont"><b>ใบขอเบิกยาและเวชภัณฑ์ (ต่อ)</b><span>เลขที่เบิก <b>${escHtml(req.req_number)}</b> · ${escHtml(req.department || '-')}</span></div>`;
  const table = `<colgroup><col style="width:11mm"><col style="width:19mm"><col><col style="width:20mm"><col style="width:22mm"><col style="width:38mm"></colgroup>
    <thead><tr><th>ลำดับ</th><th>รหัส</th><th>รายการ</th><th>จำนวน<br>ที่ขอ</th><th>หน่วยนับ</th><th>หมายเหตุ</th></tr></thead>`;
  const tail = `
    <p class="note">รวม ${items.length} รายการ${req.note ? ` · หมายเหตุใบเบิก: ${escHtml(req.note)}` : ''}</p>
    <p class="note">จำนวนในใบนี้คือจำนวนที่หน่วยงานขอ — lot และจำนวนที่คลังจ่ายจริงดูที่ใบตัดเบิก</p>
    <div class="sig">
      <p>(ลงชื่อ) <span class="ln">&nbsp;</span> ผู้ขอเบิก</p>
      <p>( <span class="ln">&nbsp;</span> )</p>
      <p>วันที่ <span class="ln" style="min-width:150px">&nbsp;</span></p>
    </div>`;
  const css = `
    h2 { text-align: center; font-size: 19px; margin: 0 0 2px; }
    .sub { text-align: center; color: #444; margin-bottom: 8px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; margin-bottom: 4px; }
    .meta b { font-weight: 600; }
    table.grid td.sm { font-size: 12px; }
    .note { font-size: 12.5px; color: #333; margin: 4px 0 0; }
    .sig { margin-top: 24px; margin-left: auto; width: 300px; text-align: center; }
    .sig p { margin: 0 0 8px; }
    .ln { display: inline-block; border-bottom: 1px dotted #333; min-width: 190px; }`;

  return buildPaginatedHtml({
    title: `ใบขอเบิก ${escHtml(req.req_number)}`,
    css, firstHead, contHead, table,
    rows: rows.length ? rows : ['<tr><td colspan="6" class="c">ไม่มีรายการ</td></tr>'],
    tail, autoPrint, footLeft: `${req.req_number} · ${req.department || ''}`,
  });
}

// ใบแนวตั้ง 2 แบบ (ใบปะหน้า · ใบขอเบิก) — พิมพ์เครื่องพิมพ์ หรือ ส่งเป็น PDF (user สั่ง 24/11/2569 ให้ทุกใบพิมพ์เลือกได้)
const FORM_DOCS = {
  cover:   { build: buildCoverHtml,   name: (req) => reqFormTitle(req.req_type) },
  request: { build: buildRequestHtml, name: () => 'ใบขอเบิก' },
};
async function printForm(doc, req, preopenedWin) {
  const html = await FORM_DOCS[doc].build(req);
  const url  = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  openPrintUrl(url, preopenedWin);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function shareFormPdf(doc, req, auth) {
  const name = FORM_DOCS[doc].name(req);
  const blob = await pagesToPdfBlob(await FORM_DOCS[doc].build(req, false));
  const fileName = `${safeFileName(`${name} ${req.department || ''}_${reqSheetNo(req)}`)}.pdf`;
  const result = await shareOrDownload(blob, fileName, name);
  if (result !== 'cancelled') {
    await insertAuditLog({
      action: 'export_pdf', table_name: 'requisitions', record_id: req.id,
      user_name: resolveAuditUserName(auth), department: auth?.department,
      details: { req_number: req.req_number, receipt_no: req.receipt_no || null, file: fileName, via: result, doc, req_department: req.department },
    });
  }
}

// ---- Requisition History ----
function RequisitionHistory({ info, onBack, auth = {} }) {
  const [list, setList]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // { type:'delete'|'edit', req }
  const [outReq, setOutReq]             = useState(null); // ReqOutputModal
  const [editDraft, setEditDraft]       = useState(null); // { note, items:[{id,requested_qty,note,...}] }
  const [editError, setEditError]       = useState(''); // error validate คงเหลือตอนแก้ใบเบิก
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

  // id รายการที่ส่งมาเป็น "ได้ยาไปแล้ว" (จำนวน 0 ตอนส่ง) — โมดอลแก้ใบแสดงเป็นบันทึก ไม่ให้แก้จำนวน/ไม่ลบ
  const gotAtSubmit = useMemo(() => new Set(
    (confirmModal?.type === 'edit' ? confirmModal.req.requisition_items || [] : [])
      .filter(i => isAlreadyGotQty(i.requested_qty)).map(i => i.id)
  ), [confirmModal]);

  const openEdit = (req) => {
    setEditDraft({ note: req.note || '', items: req.requisition_items.map(i => ({ ...i, requested_qty: i.requested_qty })) });
    setConfirmModal({ type: 'edit', req });
    setItemSearch('');
    setEditError('');
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteRequesterRequisition(confirmModal.req.id, auth);
      setActionMsg('ลบใบเบิกสำเร็จ — เจ้าหน้าที่คลังยารับทราบแล้ว');
      setConfirmModal(null);
      load();
    } catch (e) {
      setActionMsg(e.message === REQUESTER_LOCKED_MSG ? e.message : 'เกิดข้อผิดพลาด: ' + e.message);
      if (e.message === REQUESTER_LOCKED_MSG) { setConfirmModal(null); load(); }
    }
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
    setEditError('');
    // ช่องจำนวนพิมพ์ได้ → ค่าว่างระหว่างพิมพ์ได้ · 0 = ตัดรายการ (ลบหลังผ่านด่านยอดจองซ้ำ)
    const rawItems = editDraft?.items || [];
    if (rawItems.some(it => it.requested_qty === '' || !Number.isInteger(Number(it.requested_qty)) || Number(it.requested_qty) < 0)) {
      setEditError('กรอกจำนวนให้ครบทุกรายการ (ใส่ 0 = ตัดรายการนั้นออก)');
      return;
    }
    const draft = { ...editDraft, items: rawItems.map(it => ({ ...it, requested_qty: Number(it.requested_qty) })) };
    // รายการที่ส่งมาเป็น 0 ตั้งแต่แรก = "ได้ยาไปแล้ว" (บันทึก) ไม่ใช่การตัดรายการ — ห้ามลบ
    const removed = draft.items.filter(it => it.requested_qty === 0 && !gotAtSubmit.has(it.id));
    if (rawItems.length > 0 && removed.length === rawItems.length) {
      setEditError('ทุกรายการเป็น 0 — ถ้าไม่ต้องการเบิกแล้ว ให้กดปุ่มลบใบเบิกแทน');
      return;
    }
    setSaving(true);
    try {
      // re-validate คงเหลือ−จอง ก่อนบันทึก (ปุ่ม +/− ในโมดอลไม่มี cap) — ไม่นับยอดจองของใบตัวเอง
      const codes = [...new Set(draft.items.map(i => i.drug_code).filter(Boolean))];
      let invBaseMap = {};
      if (supabase && codes.length > 0) {
        const [invNow, reservedOther] = await Promise.all([
          fetchInvBaseByCode(codes),
          fetchReservedBase(codes, { excludeReqId: confirmModal.req.id }),
        ]);
        invBaseMap = invNow;
        const effectiveOf = (it) => {
          const k = codeKey(it.drug_code);
          return Math.max(0, (invBaseMap[k] ?? 0) - (reservedOther[k] ?? 0));
        };
        const conflicts = draft.items.filter(it => (Number(it.requested_qty) || 0) > effectiveOf(it));
        if (conflicts.length > 0) {
          setEditError('บันทึกไม่ได้ — เกินคงเหลือในคลัง: ' + conflicts.map(it =>
            `${it.drug_name} ขอ ${Number(it.requested_qty).toLocaleString()} แต่เบิกได้ ${effectiveOf(it).toLocaleString()} ${it.drug_unit || ''}`.trim()
          ).join(' · '));
          setSaving(false);
          return;
        }
      }
      const req = confirmModal.req;
      const original = req.requisition_items || [];
      await updateRequesterRequisition(req.id, draft, auth, { audit: false });

      // ตรวจซ้ำหลังบันทึก (ADR-0028) เฉพาะรหัสที่จำนวนเพิ่มขึ้น (ลดลงทำให้จองเกินไม่ได้)
      // ชนกับหน่วยงานอื่น → คืนจำนวน/หมายเหตุเดิมทั้งใบ โมดอลยังเปิดพร้อมค่าที่ผู้เบิกแก้ไว้
      const incKeys = increasedCodes(
        original.map(i => ({ code: i.drug_code, qty: i.requested_qty })),
        draft.items.map(i => ({ code: i.drug_code, qty: i.requested_qty })),
        codeKey,
      );
      if (supabase && incKeys.length > 0) {
        const incCodes = [...new Set(draft.items.map(i => i.drug_code).filter(c => incKeys.includes(codeKey(c))))];
        const reservedAfter = await fetchReservedBase(incCodes); // คงเหลือใช้ชุดก่อนบันทึก (เหตุผลเดียวกับตอนส่งใบ)
        const over = findOverReserved({ invBase: invBaseMap, reserved: reservedAfter, codes: incKeys });
        if (over.length > 0) {
          await updateRequesterRequisition(req.id, {
            note: req.note,
            items: original.map(i => ({ id: i.id, requested_qty: i.requested_qty, note: i.note })),
          }, auth, { audit: false });
          const conflicts = over.flatMap(o => {
            const lines = draft.items.filter(it => codeKey(it.drug_code) === o.code);
            const own = lines.reduce((s, it) => s + (Number(it.requested_qty) || 0), 0);
            const available = availableForOwn({ inv: o.inv, reserved: o.reserved, own });
            return lines.map(it => ({ drug_code: it.drug_code, drug_name: it.drug_name, unit: it.drug_unit || '', requested: Number(it.requested_qty) || 0, available }));
          });
          const resolved = resolveAuditUserName(auth);
          insertAuditLog({
            action: 'requisition_conflict_withdrawn', table_name: 'requisitions',
            user_name: resolved !== '-' ? resolved : info.name, department: info.department,
            record_count: conflicts.length,
            details: { kind: 'edit', req_number: req.req_number, requisition_id: req.id, req_department: info.department, conflicts },
          });
          setEditError('มีหน่วยงานอื่นเบิกยานี้พร้อมกัน — ยังไม่ได้บันทึกการแก้ไข: ' + conflicts.map(c =>
            `${c.drug_name} ขอ ${c.requested.toLocaleString()} แต่เบิกได้ ${c.available.toLocaleString()} ${c.unit}`.trim()
          ).join(' · '));
          setSaving(false);
          return;
        }
      }
      await deleteRequesterRequisitionItems(req.id, removed.map(it => it.id));
      insertAuditLog({ action: 'requester_edit_requisition', table_name: 'requisitions', user_name: resolveAuditUserName(auth), department: auth?.department || '-', details: { requisition_id: req.id, ...(removed.length ? { removed_items: removed.map(it => it.drug_name) } : {}) } });
      setActionMsg(removed.length
        ? `แก้ไขใบเบิกสำเร็จ (ตัดออก ${removed.length} รายการ) — เจ้าหน้าที่คลังยารับทราบแล้ว`
        : 'แก้ไขใบเบิกสำเร็จ — เจ้าหน้าที่คลังยารับทราบแล้ว');
      setConfirmModal(null);
      load();
    } catch (e) {
      // คลังรับใบไปแล้วระหว่างที่โมดอลเปิด → บอกในโมดอล + โหลดรายการใหม่ให้ปุ่มแก้/ลบหายไป
      setEditError(e.message === REQUESTER_LOCKED_MSG ? e.message : 'เกิดข้อผิดพลาด: ' + e.message);
      if (e.message === REQUESTER_LOCKED_MSG) load();
    }
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
        <button onClick={load} className="text-slate-500 dark:text-slate-400 hover:text-[#1E90FF] p-1 transition-colors"><RefreshCcw size={18} /></button>
      </PageHeader>

      {actionMsg && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl px-4 py-3 text-emerald-800 dark:text-emerald-300 text-sm font-medium">
          <CheckCircle size={16} className="text-emerald-600 shrink-0" /> {actionMsg}
        </div>
      )}

      <div className="flex-1 p-4 space-y-3">
        {/* Date range filter */}
        <div className="flex flex-wrap items-center gap-2">
          <IsoDateInput value={dateFrom} onChange={v => { setDateFrom(v); setLoading(true); }} className="flex-1 min-w-[130px]" />
          <span className="text-slate-400 dark:text-slate-500 text-sm">–</span>
          <IsoDateInput value={dateTo} onChange={v => { setDateTo(v); setLoading(true); }} className="flex-1 min-w-[130px]" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
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
            hoverClass="hover:bg-blue-50 dark:hover:bg-blue-950/50"
            maxResults={10}
          />
        )}
        {drugSearch && (
          <p className="text-xs text-slate-400 dark:text-slate-500 -mt-1">
            พบ {filteredList.length} ใบเบิก · ค้นหา "{drugSearch}"
          </p>
        )}
        {loading && <p className="text-center text-slate-500 dark:text-slate-400 py-10">กำลังโหลด...</p>}
        {!loading && filteredList.length === 0 && (
          <p className="text-center text-slate-500 dark:text-slate-400 py-20">
            {drugSearch ? `ไม่พบใบเบิกที่มียา "${drugSearch}"` : 'ยังไม่มีประวัติการเบิกยา'}
          </p>
        )}
        {filteredList.map(req => {
          const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
          const isPending = req.status === 'pending';
          // คลังลงชีทแล้ว (รับใบ) = ล็อก แม้สถานะยัง pending — db.js เช็คซ้ำฝั่ง DB
          const canModify = isPending && !req.sheet_entered_at;
          return (
            <div key={req.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
              {/* div ไม่ใช่ button — ข้างในมีปุ่มพิมพ์/แก้/ลบ (button ซ้อน button = invalid HTML, hydration error) */}
              {/* flex-wrap: จอแคบ (มือถือผู้เบิก) กลุ่มป้าย+ปุ่มขึ้นบรรทัดใหม่ชิดขวา — เดิมปุ่ม 5–6 ปุ่มบีบชื่อหน่วยงานเหลือคำละบรรทัด */}
              <div role="button" tabIndex={0} className="w-full p-4 text-left flex flex-wrap items-start justify-between gap-x-3 gap-y-2 cursor-pointer"
                onClick={() => setExpanded(expanded===req.id ? null : req.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(expanded===req.id ? null : req.id); } }}>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-mono text-xs text-slate-400 dark:text-slate-500">{req.req_number}{req.req_type && <span className="font-sans font-semibold text-blue-600 dark:text-blue-300"> · ใบเบิก{reqTypeLabel(req.req_type)}</span>}</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-100 mt-0.5">{req.department}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {new Date(req.created_at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'})}
                    &nbsp;· {req.requisition_items?.length||0} รายการ
                  </p>
                  {req.updated_at && req.updated_at !== req.created_at && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      แก้ไขล่าสุด: {new Date(req.updated_at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'})}
                    </p>
                  )}
                  {isPending && !canModify && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                      <Lock size={11} className="shrink-0" /> คลังยารับใบแล้ว — ต้องการแก้ไขให้ติดต่อคลังยา
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${cfg.badge}`}>{cfg.label}</span>
                  {/* ปุ่มพิมพ์ปุ่มเดียวเหมือนหน้าคลัง — เลือกใบ (ใบเบิก/ใบปะหน้า/ใบขอเบิก) ในโมดอล (user สั่ง 24/11/2569) */}
                  <button onClick={e => { e.stopPropagation(); setOutReq({ req, doc: 'sheet' }); }}
                    className="inline-flex items-center gap-1 px-2 py-1.5 text-[13px] font-medium text-slate-500 dark:text-slate-400 hover:text-[#1E90FF] hover:bg-[#F0F8FF] dark:hover:bg-slate-800 rounded-lg transition-colors"
                    title="พิมพ์ / ส่งเป็น PDF — ใบเบิก · ใบปะหน้า · ใบขอเบิก · Excel">
                    <Printer size={15} /> พิมพ์
                  </button>
                  {canModify && (<>
                    <button onClick={e => { e.stopPropagation(); openEdit(req); }}
                      className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors" title="แก้ไขใบเบิก">
                      <Pencil size={15} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); setConfirmModal({ type: 'delete', req }); }}
                      className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors" title="ลบใบเบิก">
                      <Trash2 size={15} />
                    </button>
                  </>)}
                  <ChevronRight size={16} className={`text-slate-400 dark:text-slate-500 transition-transform ${expanded===req.id?'rotate-90':''}`} />
                </div>
              </div>
              {expanded===req.id && (
                <div className="border-t border-slate-100 dark:border-slate-800 p-4 space-y-2 bg-slate-50 dark:bg-slate-800">
                  {req.requisition_items?.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-sm gap-2 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-800">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <DrugTypeBadge type={item.drug_type} />
                          <span className="text-slate-800 dark:text-slate-100 font-medium">{item.drug_name}</span>
                          <span className="text-slate-400 dark:text-slate-500 text-xs">({item.drug_unit||'-'})</span>
                        </div>
                        {isAlreadyGotQty(item.requested_qty) ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-start gap-1"><History size={12} className="shrink-0 mt-0.5" /> {item.item_note || ALREADY_GOT_PREFIX}</p>
                        ) : item.approved_qty!=null && (
                          <span className={`text-xs font-semibold ${item.approved_qty>0?'text-emerald-600':'text-red-500'}`}>
                            → {item.approved_qty>0?`อนุมัติ ${item.approved_qty}`:'ไม่อนุมัติ'}
                          </span>
                        )}
                        {item.picked_qty!=null && !isAlreadyGotQty(item.requested_qty) && (
                          <span className="text-xs text-purple-600 font-semibold ml-2">
                            · จัด {Number(item.picked_qty).toLocaleString()} {item.drug_unit||''}
                          </span>
                        )}
                        {/* Lot/Exp ที่จ่ายจริง (ADR-0005) — ผู้เบิกเห็นว่าได้ของ lot ไหน */}
                        {Array.isArray(item.picked_allocation) && item.picked_allocation.length > 0 ? (
                          <div className="mt-1 space-y-0.5">
                            {item.picked_allocation.map((a, ai) => (
                              <p key={ai} className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 flex-wrap">
                                <span className="font-mono font-medium text-slate-600 dark:text-slate-300">Lot {a.lot || '-'}</span>
                                <span className="text-slate-400 dark:text-slate-500">· Exp {fmtExp(a.exp)} · {Number(a.base).toLocaleString()} {item.drug_unit||''}</span>
                                <span className="text-indigo-600 font-medium">({allocPackLabel(a, item.drug_unit)})</span>
                                {isNearExpiry(a.exp) && (
                                  <span className="inline-flex items-center gap-0.5 bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 rounded px-1 py-0.5 font-semibold"><Clock size={9}/> ใกล้หมดอายุ · {expCountdown(a.exp)}</span>
                                )}
                              </p>
                            ))}
                          </div>
                        ) : item.picked_lot ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-mono font-medium text-slate-600 dark:text-slate-300">{item.picked_lot}</span>
                            {item.picked_exp && <span className="text-slate-400 dark:text-slate-500"> · Exp {fmtExp(item.picked_exp)}</span>}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isAlreadyGotQty(item.requested_qty) ? <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-2 leading-5 whitespace-nowrap">{ALREADY_GOT_PREFIX}</span>
                        : <span className="text-slate-500 dark:text-slate-400 text-xs">ขอ <b>{item.requested_qty}</b>{item.drug_unit && item.drug_unit !== '-' && <span> × {item.drug_unit}</span>}
                          {entryQtyText(item.requested_qty, item.entry_pack, item.entry_unit, item.drug_unit) && <span> (= {entryQtyText(item.requested_qty, item.entry_pack, item.entry_unit, item.drug_unit)})</span>}</span>}
                      </div>
                    </div>
                  ))}
                  {req.note && <p className="text-xs text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-700">หมายเหตุ: {req.note}</p>}
                  {req.status === 'dispensed' && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                      {confirmingReceived === req.id ? (
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmingReceived(null)}
                            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl py-2 text-sm font-medium">
                            ยกเลิก
                          </button>
                          <button onClick={() => handleConfirmReceived(req)}
                            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white rounded-xl py-2 text-sm font-semibold transition-colors">
                            ยืนยันรับยาแล้ว
                          </button>
                        </div>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); setConfirmingReceived(req.id); }}
                          className="w-full bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-950/70 border border-teal-300 dark:border-teal-800/60 text-teal-700 dark:text-teal-300 rounded-xl py-2.5 font-semibold text-sm transition-colors flex items-center justify-center gap-2">
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
          {/* max-h-full + เนื้อหา overflow-y-auto: ใบ 40 รายการเดิมสูงเกินจอ หัว/ปุ่มบันทึกตกขอบ กดไม่ได้ */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md max-h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className={`shrink-0 px-5 py-4 border-b flex items-center gap-3 ${confirmModal.type==='delete' ? 'bg-red-50 dark:bg-red-950/40 border-red-100 dark:border-red-900/50' : 'bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/50'}`}>
              <AlertCircle size={20} className={confirmModal.type==='delete' ? 'text-red-500' : 'text-blue-500'} />
              <div>
                <p className={`font-bold text-sm ${confirmModal.type==='delete' ? 'text-red-800 dark:text-red-300' : 'text-blue-800 dark:text-blue-300'}`}>
                  {confirmModal.type==='delete' ? 'ลบใบเบิก' : 'แก้ไขใบเบิก'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{confirmModal.req.req_number}</p>
              </div>
            </div>

            <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
              {/* Staff notification warning */}
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl px-3 py-2.5">
                <Bell size={15} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">การดำเนินการนี้จะ<span className="font-semibold">แจ้งให้เจ้าหน้าที่คลังยาและผู้ดูแลระบบรับทราบ</span>ทันที</p>
              </div>

              {confirmModal.type === 'delete' ? (
                <p className="text-sm text-slate-700 dark:text-slate-200">ต้องการลบใบเบิก <span className="font-semibold">{confirmModal.req.req_number}</span> ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
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
                      hoverClass="hover:bg-blue-50 dark:hover:bg-blue-950/50"
                      maxResults={10}
                    />
                  )}
                  {/* Edit items qty */}
                  {editDraft?.items
                    .filter(item => !itemSearch.trim() || item.drug_name.toLowerCase().includes(itemSearch.toLowerCase()))
                    .map((item, idx) => {
                    const realIdx = editDraft.items.findIndex(i => i.id === item.id);
                    const setQty = (q) => setEditDraft(d => ({ ...d, items: d.items.map((it,i) => i===realIdx ? { ...it, requested_qty: q } : it) }));
                    if (gotAtSubmit.has(item.id)) return (
                      <div key={item.id} className="flex items-start gap-2 rounded-xl px-3 py-2 border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                        <History size={14} className="shrink-0 mt-0.5 text-slate-400 dark:text-slate-500" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 break-words">{item.drug_name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 break-words">{item.item_note || ALREADY_GOT_PREFIX}</p>
                        </div>
                      </div>
                    );
                    const removedRow = item.requested_qty !== '' && Number(item.requested_qty) === 0;
                    return (
                    <div key={item.id} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 border ${removedRow ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/60' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium truncate ${removedRow ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>{item.drug_name}</p>
                        <p className={`text-xs ${removedRow ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>{removedRow ? 'ตัดรายการนี้ออก' : (item.drug_unit||'-')}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => setQty(Math.max(0, (Number(item.requested_qty) || 0) - 1))} aria-label="ลดจำนวน"
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 font-bold transition-colors">−</button>
                        {/* พิมพ์ได้ (เดิมกดได้ทีละ 1 · เลข 5 หลักล้นใต้ปุ่ม +) · 0 = ตัดรายการ */}
                        {/* type=text: ลูกศรของ type=number กินที่จนเลข 6 หลักโดนบัง */}
                        <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={7} value={item.requested_qty} aria-label={`จำนวน ${item.drug_name}`}
                          onChange={e => { const v = e.target.value.replace(/\D/g, ''); setQty(v === '' ? '' : Number(v)); }}
                          className="w-20 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-lg px-1.5 py-1 text-center text-base font-bold tabular-nums text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <button onClick={() => setQty((Number(item.requested_qty) || 0) + 1)} aria-label="เพิ่มจำนวน"
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 font-bold transition-colors">+</button>
                      </div>
                    </div>
                    );
                  })}
                  {/* Note */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">หมายเหตุ</label>
                    <input type="text" value={editDraft?.note||''} onChange={e => setEditDraft(d => ({ ...d, note: e.target.value }))}
                      placeholder="หมายเหตุ (ถ้ามี)"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}
            </div>

            {/* error อยู่นอกส่วนเลื่อน — ใบยาวกดบันทึกแล้วต้องเห็นทันที */}
            {confirmModal.type !== 'delete' && editError && (
              <p className="shrink-0 mx-5 mt-3 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl px-3 py-2 flex items-start gap-1.5 max-h-24 overflow-y-auto">
                <AlertCircle size={13} className="shrink-0 mt-0.5"/> {editError}
              </p>
            )}

            {/* Actions */}
            <div className="shrink-0 px-5 pb-5 pt-3 flex gap-2 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setConfirmModal(null)} disabled={saving}
                className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:border-slate-400 text-slate-700 dark:text-slate-200 rounded-xl py-2.5 font-medium text-sm transition-colors">
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
      {outReq && <ReqOutputModal req={outReq.req} doc={outReq.doc} auth={auth} defaultSort={SORT_BY_REQ} onClose={() => setOutReq(null)} />}
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-blue-100 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/40 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-100 dark:bg-blue-950/60 rounded-xl flex items-center justify-center shrink-0">
            <Check size={18} className="text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-blue-800 dark:text-blue-300 text-sm">ยืนยันจ่ายออก</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">{req.req_number}</p>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            ต้องการจ่ายยาตามใบเบิก <span className="font-semibold">{req.department}</span> ออกจากคลังใช่หรือไม่?
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 truncate">
            {drugPreview(req.requisition_items)}
          </p>
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl px-3 py-2.5">
            <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300">เมื่อจ่ายออกแล้ว ใบเบิกจะถูกบันทึกเป็น<span className="font-semibold">จ่ายแล้ว</span> และตัดสต็อกตามที่จัด</p>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} disabled={loading}
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:border-slate-400 text-slate-700 dark:text-slate-200 rounded-xl py-2.5 font-medium text-sm transition-colors disabled:opacity-50">
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
// ReqOutputModal — พิมพ์ / ส่งเป็น PDF / ดาวน์โหลด Excel ใบเบิกรูปแบบชีทเบิก + เลือกการเรียงแถว
// (PDF คลังมี 2 ฉบับ: เรียงตามที่เก็บให้คลังเดินจัดยา · เรียงตามใบให้ห้องยา/หน่วยงานเช็ค — user เลือก 13/11/2569)
// ============================================================
const SORT_OPTIONS = [
  { key: SORT_BY_REQ, label: 'เรียงตามใบ', hint: 'ห้องยา/หน่วยงานเช็คของ' },
  { key: SORT_BY_LOG, label: 'เรียงตามที่เก็บ', hint: 'คลังเดินจัดยาตามชั้น A→E' },
];

// doc = ใบที่เลือกไว้ตอนเปิด · เปลี่ยนในโมดอลได้ (ปุ่มพิมพ์ปุ่มเดียวทั้งหน้าผู้เบิก/หน้าคลัง — 24/11/2569)
// 'sheet' = ใบเบิกแบบชีทเบิก (รวมใบ lot คุมแล้ว · พิมพ์/PDF/Excel + เรียง) · 'cover' ใบปะหน้า / 'request' ใบขอเบิก = พิมพ์ หรือ PDF เท่านั้น
function ReqOutputModal({ req, auth, doc: initialDoc = 'sheet', defaultSort = SORT_BY_REQ, onClose }) {
  const [doc, setDoc] = useState(initialDoc);
  const isSheet = doc === 'sheet';
  const docOptions = [
    { key: 'sheet',   label: 'ใบเบิก',   hint: 'รายการ + lot ที่จ่าย แบบชีทเบิก' },
    { key: 'cover',   label: 'ใบปะหน้า', hint: reqFormTitle(req.req_type) },
    { key: 'request', label: 'ใบขอเบิก', hint: 'รายการที่หน่วยงานขอ' },
  ];
  const [sort, setSort] = useState(defaultSort);
  const [busy, setBusy] = useState(null); // 'pdf' | 'excel'
  const [error, setError] = useState('');
  const run = async (kind, fn) => {
    setBusy(kind); setError('');
    try { await fn(); onClose(); }
    catch (e) { console.error(kind, e); setError(kind === 'pdf' ? 'สร้าง PDF ไม่สำเร็จ ลองใหม่อีกครั้ง' : 'สร้างไฟล์ Excel ไม่สำเร็จ ลองใหม่อีกครั้ง'); }
    finally { setBusy(null); }
  };
  // หน้าต่างพิมพ์ต้องเปิดในจังหวะคลิก (ก่อน await) ไม่งั้นมือถือบล็อก popup
  const doPrint = () => { const w = window.open('', '_blank'); if (isSheet) printReq(req, w, sort); else printForm(doc, req, w); onClose(); };
  const btn = 'flex-1 min-w-0 rounded-xl py-2.5 font-semibold text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50';
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={e => { e.stopPropagation(); if (!busy) onClose(); }}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-100 dark:bg-blue-950/60 rounded-xl flex items-center justify-center shrink-0">
            <Printer size={18} className="text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">พิมพ์ / ส่งเอกสารใบเบิก</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{req.department} · <span className="font-mono">{req.receipt_no || req.req_number}</span></p>
          </div>
          <button onClick={onClose} disabled={!!busy} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50" aria-label="ปิด">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">เลือกใบ</p>
          <div className="grid grid-cols-3 gap-2">
            {docOptions.map(o => (
              <button key={o.key} type="button" onClick={() => { setDoc(o.key); setError(''); }} disabled={!!busy}
                className={`text-left rounded-xl border px-2.5 py-2 transition-colors min-w-0 ${doc === o.key
                  ? 'border-[#1E90FF] bg-blue-50 dark:bg-blue-950/40 ring-1 ring-[#1E90FF]'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{o.label}</span>
                <span className="block text-[11px] leading-snug text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{o.hint}</span>
              </button>
            ))}
          </div>
          {isSheet && <>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">การเรียงแถว</p>
          <div className="grid grid-cols-2 gap-2">
            {SORT_OPTIONS.map(o => (
              <button key={o.key} type="button" onClick={() => setSort(o.key)} disabled={!!busy}
                className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${sort === o.key
                  ? 'border-[#1E90FF] bg-blue-50 dark:bg-blue-950/40 ring-1 ring-[#1E90FF]'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{o.label}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{o.hint}</span>
              </button>
            ))}
          </div>
          </>}
          <p className="text-xs text-slate-500 dark:text-slate-400">{isSheet ? 'รูปแบบเดียวกับใบที่คลังพิมพ์จากชีทเบิก · เรียงตามที่เก็บ = ใบ lot คุมเดิม · ' : ''}"พิมพ์" ส่งเข้าเครื่องพิมพ์ · "ส่งเป็น PDF" ได้ไฟล์ส่งเข้า LINE ให้คนอื่นเปิดพิมพ์ได้</p>
          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl px-3 py-2">
              <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>
        <div className="px-5 pb-5 flex flex-wrap gap-2">
          <button onClick={doPrint} disabled={!!busy} className={`${btn} bg-[#1E90FF] hover:bg-blue-600 text-white`}>
            <Printer size={15} /> พิมพ์
          </button>
          <button onClick={() => run('pdf', () => (isSheet ? shareReqPdf(req, sort, auth) : shareFormPdf(doc, req, auth)))} disabled={!!busy}
            className={`${btn} bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:border-slate-400 text-slate-700 dark:text-slate-200`}>
            {busy === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />} {busy === 'pdf' ? 'กำลังสร้าง…' : 'ส่งเป็น PDF'}
          </button>
          {isSheet && (
          <button onClick={() => run('excel', () => exportReqExcel([req], auth, sort))} disabled={!!busy}
            className={`${btn} bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:border-slate-400 text-emerald-700 dark:text-emerald-300`}>
            {busy === 'excel' ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} Excel
          </button>
          )}
        </div>
      </div>
    </div>
  );
}


function StaffRoot({ onBack, alreadyAuthed = false, auth = {}, onProxyRequest }) {
  const [authed, setAuthed]     = useState(alreadyAuthed);
  const [selected, setSelected] = useState(null);
  // tab/date filter ยกขึ้นมาที่นี่ — กันรีเซ็ตเมื่อเปิดดูรายละเอียดใบเบิกแล้วกดย้อนกลับ
  const [filter, setFilter]         = useState('pending');
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));

  if (!authed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 relative">
        <button onClick={onBack} className="absolute top-5 left-5 flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-[#1E90FF] text-sm transition-colors">
          <ArrowLeft size={16} /> กลับ
        </button>
        <div className="w-full max-w-xs bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 dark:bg-emerald-950/60 rounded-xl mb-4">
            <CheckCircle size={28} className="text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">เจ้าหน้าที่คลังยา</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">กดยืนยันเพื่อเข้าระบบ</p>
          <button onClick={() => setAuthed(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 font-semibold transition">
            เข้าสู่ระบบ
          </button>
        </div>
      </div>
    );
  }
  if (selected) return <RequisitionDetail req={selected} onBack={() => setSelected(null)} onDone={() => setSelected(null)} auth={auth} />;
  return <StaffDashboard onLogout={() => alreadyAuthed ? onBack() : setAuthed(false)} onSelect={setSelected} auth={auth} filter={filter} setFilter={setFilter} dateFilter={dateFilter} setDateFilter={setDateFilter} onProxyRequest={onProxyRequest} />;
}

// ============================================================
// หน้าเบิกยาเจ้าหน้าที่ — คิวใบเบิก + หน้ารายละเอียดใบ (ตาม docs/mockups/requisition-staff.html · user เคาะ 15/11/2569)
// ขั้น: รอลงชีท/อนุมัติ → รอจัด (ผลการจัดรายแถว) → รอตรวจจ่าย (แจ้งแก้รายแถว ไม่บังคับ · คนจัด=คนตรวจได้) → จ่ายแล้ว
// ตรรกะขั้น/lot/ผลการจัด อยู่ lib/reqStaffView.js (golden test) — component แค่ประกอบข้อมูล + แสดงผล
// ============================================================
const TONE = {
  amber:  { pill: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800/60', bar: 'bg-amber-500', num: 'text-amber-600 dark:text-amber-400' },
  blue:   { pill: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800/60', bar: 'bg-[#1E90FF]', num: 'text-[#1E90FF] dark:text-blue-300' },
  violet: { pill: 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-800/60', bar: 'bg-violet-500', num: 'text-violet-600 dark:text-violet-300' },
  teal:   { pill: 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-800/60', bar: 'bg-teal-500', num: 'text-teal-600 dark:text-teal-300' },
  green:  { pill: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800/60', bar: 'bg-emerald-500', num: 'text-emerald-600 dark:text-emerald-300' },
  red:    { pill: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800/60', bar: 'bg-red-500', num: 'text-red-600 dark:text-red-400' },
  slate:  { pill: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600', bar: 'bg-slate-400', num: 'text-slate-700 dark:text-slate-200' },
};
const TAB_TONE = { pending: 'amber', pick: 'blue', check: 'violet', hist: 'slate' };
const Pill = ({ tone = 'slate', className = '', children }) => (
  <span className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-full px-2 leading-5 whitespace-nowrap ${TONE[tone].pill} ${className}`}>{children}</span>
);

// ตาราง/การ์ดเลือกด้วยความกว้างจอ — render ชุดเดียว ไม่ซ่อนด้วย CSS (pattern FilterSheet)
function useMinWidth(px) {
  const q = `(min-width: ${px}px)`;
  const [ok, setOk] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setOk(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return ok;
}

const fmtDT = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear() + 543} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const splitLocs = (s) => String(s || '').split(',').map(x => x.trim()).filter(x => x && x !== '-');
const defaultActor = (auth) => (auth.name && auth.name.trim() && auth.name.trim() !== '-') ? auth.name.trim() : (auth.username || '');
const SORT_PREF_KEY = 'req_staff_sort';

// ---- Staff Dashboard (คิวใบเบิก) ----
// เพดานใบเบิกที่หน้าคลังโหลด (ใหม่สุดก่อน) · เตือนที่ 90%
const STAFF_LIST_LIMIT = 200;
const STAFF_LIST_WARN = 180;

function StaffDashboard({ onLogout, onSelect, auth = {}, filter, setFilter, dateFilter, setDateFilter, onProxyRequest }) {
  const wide = useMinWidth(1024);
  const [list, setList]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [q, setQ]               = useState('');
  const [qType, setQType]       = useState('');
  const [lots, setLots]         = useState({ key: '', byCode: {} });
  const tab = QUEUE_TABS.some(t => t.key === filter) ? filter : 'pending';

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from('requisitions').select('*, requisition_items(*)')
      .order('created_at', { ascending: false }).limit(STAFF_LIST_LIMIT);
    setList(data||[]); setLoading(false);
  }, []);

  // ประวัติเลือกวันที่เก่ากว่าใบที่โหลดมา (โหลดเต็มเพดานแล้ว) → ดึงใบของวันนั้นจากฐานข้อมูลตรง (user สั่ง 24/11/2569)
  // วันที่เทียบแบบ UTC เหมือน inHistDate ด้านล่าง
  const oldestLoaded = list.length ? String(list[list.length - 1].created_at || '').slice(0, 10) : '';
  const needDay = list.length >= STAFF_LIST_LIMIT && dateFilter && dateFilter <= oldestLoaded ? dateFilter : '';
  const [dayRows, setDayRows] = useState({ day: '', rows: [] });
  useEffect(() => {
    if (!needDay || !supabase) return;
    let alive = true;
    const next = new Date(`${needDay}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    supabase.from('requisitions').select('*, requisition_items(*)')
      .gte('created_at', `${needDay}T00:00:00Z`).lt('created_at', next.toISOString())
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (alive) setDayRows({ day: needDay, rows: data || [] }); });
    return () => { alive = false; };
  }, [needDay]);
  const allList = useMemo(() => {
    if (!needDay || dayRows.day !== needDay) return list;
    const ids = new Set(list.map(r => r.id));
    return [...list, ...dayRows.rows.filter(r => !ids.has(r.id))];
  }, [list, needDay, dayRows]);

  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase.channel('staff-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisitions' }, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  // ป้าย "ไม่พอ/ใกล้หมดอายุ" — ใบที่ยังไม่มี lot ในใบ (FEFO) ต้องใช้ inventory · ใบลงชีท/จัดแล้วใช้ lot ในใบ
  const fefoCodes = useMemo(() => [...new Set(list
    .filter(r => { const s = stageOf(r); return s === 'pending' || (s === 'pick' && !r.sheet_entered_at); })
    .flatMap(r => (r.requisition_items || []).map(i => String(i.drug_code || '').trim()))
    .filter(Boolean))].sort().join('|'), [list]);
  useEffect(() => {
    if (!fefoCodes) return;
    let alive = true;
    loadStaffLots(fefoCodes.split('|')).then(r => { if (alive) setLots({ key: fefoCodes, byCode: r.lotsByCode }); }).catch(() => {});
    return () => { alive = false; };
  }, [fefoCodes]);
  const flagsOf = useMemo(() => {
    const m = {};
    const ready = lots.key === fefoCodes;
    list.forEach(r => {
      if (tabOf(r) === 'hist') return;
      const needsInv = stageOf(r) === 'pending' || (stageOf(r) === 'pick' && !r.sheet_entered_at);
      if (needsInv && !ready) return;
      m[r.id] = reqFlags(r, { lotsOf: c => lots.byCode[String(c || '').trim()] || [], isNear: isNearExpiry });
    });
    return m;
  }, [list, lots, fefoCodes]);

  const byTab = useMemo(() => {
    const inHistDate = (r) => !dateFilter || (r.created_at && r.created_at.slice(0, 10) === dateFilter);
    const m = Object.fromEntries(QUEUE_TABS.map(t => [t.key, []]));
    allList.forEach(r => { const k = tabOf(r); if (k !== 'hist' || inHistDate(r)) m[k].push(r); });
    return m;
  }, [allList, dateFilter]);

  const typeKeys = useMemo(() => [...new Set(list.map(r => r.req_type).filter(Boolean))], [list]);
  const ql = q.trim().toLowerCase();
  const filtered = byTab[tab].filter(r =>
    (!qType || r.req_type === qType) &&
    (!ql || `${r.department || ''} ${r.req_number || ''} ${r.receipt_no || ''} ${r.requester_name || ''}`.toLowerCase().includes(ql)));
  // ติ๊กไว้แล้วเปลี่ยนแท็บ/ตัวกรอง → ใบที่ติ๊กค้างแต่มองไม่เห็นต้องไม่ถูกนับ/อนุมัติ/ลบ
  const visibleSelected = filtered.filter(r => selected.has(r.id)).map(r => r.id);

  const toggleSelect = (e, id) => {
    e.stopPropagation();
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };
  const toggleAll = () => setSelected(visibleSelected.length === filtered.length ? new Set() : new Set(filtered.map(r => r.id)));

  const bulkDelete = async () => {
    if (!visibleSelected.length) return;
    setBulkLoading(true);
    const ids = visibleSelected;
    for (const id of ids) {
      const req = list.find(r => r.id === id);
      await supabase.from('requisition_items').delete().eq('requisition_id', id);
      await supabase.from('requisitions').delete().eq('id', id);
      insertAuditLog({ action: 'delete_requisition', table_name: 'requisitions', user_name: resolveAuditUserName(auth), department: auth?.department || '-', details: { req_number: req?.req_number, requisition_id: id } });
    }
    setList(prev => prev.filter(r => !ids.includes(r.id)));
    setSelected(new Set());
    setBulkLoading(false);
  };

  const bulkApprove = async () => {
    if (!visibleSelected.length) return;
    setBulkLoading(true);
    for (const id of visibleSelected) {
      const req = list.find(r => r.id === id);
      if (!req || req.status !== 'pending' || awaitsSheetEntry(req)) continue;
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

  const chipSub = (t) => {
    const rows = byTab[t.key];
    if (t.key === 'hist') return dateFilter ? `วันที่ ${thaiDateFromIso(dateFilter)}` : 'ทุกวันที่';
    if (!rows.length) return 'ไม่มีค้าง';
    const items = rows.reduce((s, r) => s + (r.requisition_items?.length || 0), 0);
    const oldest = rows.reduce((m, r) => (r.created_at < m ? r.created_at : m), rows[0].created_at);
    return `${items.toLocaleString()} รายการ · เก่าสุด${waitText(oldest).replace('รอ', '')}`;
  };

  const flagPills = (r) => {
    const f = flagsOf[r.id];
    if (!f) return null;
    const st = stageOf(r);
    return (
      <>
        {f.short > 0 && <Pill tone="red">{st === 'check' || st === 'ready' ? 'จัดไม่ครบ' : 'ไม่พอ'} {f.short}</Pill>}
        {f.near > 0 && <Pill tone="amber">ใกล้หมดอายุ {f.near}</Pill>}
      </>
    );
  };

  const nameBlock = (r) => (
    <div className="min-w-0">
      <p className="font-semibold text-[15px] text-slate-800 dark:text-slate-100 truncate">{r.department || '-'}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
        <span className="font-mono">{r.req_number}</span>
        {r.req_type && <span>ใบเบิก{reqTypeLabel(r.req_type)}</span>}
        {r.requester_name && <span className="truncate max-w-40">ผู้เบิก {r.requester_name}</span>}
        {r.receipt_no && <Pill tone="green">ลงชีทแล้ว {r.receipt_no}</Pill>}
      </div>
    </div>
  );
  const sentBlock = (r) => (
    <div className="min-w-0">
      {!wide && <p className="text-[11px] text-slate-400 dark:text-slate-500">ส่งเมื่อ</p>}
      <p className="font-semibold tabular-nums text-slate-700 dark:text-slate-200 text-sm">{fmtDT(r.created_at)}</p>
      {tabOf(r) !== 'hist' && <p className="text-xs text-slate-500 dark:text-slate-400">{waitText(r.created_at)}</p>}
    </div>
  );
  const itemsBlock = (r) => (
    <div className="min-w-0">
      {!wide && <p className="text-[11px] text-slate-400 dark:text-slate-500">รายการ</p>}
      <p className="font-semibold tabular-nums text-slate-700 dark:text-slate-200 text-sm">{(r.requisition_items?.length || 0).toLocaleString()} รายการ</p>
      <div className="flex flex-wrap gap-1 mt-0.5">{flagPills(r)}</div>
    </div>
  );
  const nextBlock = (r) => {
    const ns = nextStep(r);
    return (
      <div className="min-w-0">
        {!wide && <p className="text-[11px] text-slate-400 dark:text-slate-500">ขั้นถัดไป</p>}
        <Pill tone={ns.tone}>{ns.label}</Pill>
        {ns.sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{ns.sub}</p>}
      </div>
    );
  };
  const checkBox = (r) => (
    <span className="pt-0.5" onClick={e => toggleSelect(e, r.id)} onKeyDown={e => e.stopPropagation()}>
      <input type="checkbox" readOnly checked={selected.has(r.id)} aria-label={`เลือกใบ ${r.req_number}`}
        className="w-4 h-4 accent-[#1E90FF] cursor-pointer" />
    </span>
  );
  const ROW_GRID = 'grid grid-cols-[20px_minmax(0,2.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_16px] gap-3 items-center';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-800">
      <PageHeader onBack={onLogout} title="ระบบเบิกยาออนไลน์">
        {onProxyRequest && (
          <button onClick={onProxyRequest}
            className="flex items-center gap-1.5 bg-[#1E90FF] hover:bg-[#1a7fe0] text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors shadow-sm whitespace-nowrap">
            <Plus size={14}/> <span className="hidden sm:inline">สร้างใบเบิกแทนหน่วยงาน</span><span className="sm:hidden">สร้างใบเบิก</span>
          </button>
        )}
        <button onClick={load} aria-label="โหลดคิวใหม่" className="text-slate-400 hover:text-[#1E90FF] p-1 transition-colors"><RefreshCcw size={18}/></button>
      </PageHeader>

      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 py-3 space-y-3">
        {/* แถบขั้น 4 ขั้น — กดเพื่อดูใบในขั้นนั้น */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {QUEUE_TABS.map(t => {
            const on = tab === t.key;
            const tone = TONE[TAB_TONE[t.key]];
            return (
              <button key={t.key} type="button" aria-pressed={on}
                onClick={() => { setFilter(t.key); if (t.key === 'hist' && !dateFilter) setDateFilter(new Date().toISOString().slice(0, 10)); }}
                className={`relative overflow-hidden text-left rounded-xl border pl-3.5 pr-2.5 py-2 transition-colors ${on ? 'border-[#1E90FF] ring-1 ring-[#1E90FF] bg-blue-50 dark:bg-blue-950/40' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} />
                <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{t.label}</span>
                <span className={`block text-2xl font-bold leading-tight tabular-nums ${tone.num}`}>{byTab[t.key].length}</span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">{chipSub(t)}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหน่วยงาน · เลขใบเบิก · ผู้เบิก" aria-label="ค้นใบเบิก"
              className="w-full pl-8 pr-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1E90FF]" />
          </div>
          {typeKeys.length > 1 && (
            <select value={qType} onChange={e => setQType(e.target.value)} aria-label="ประเภทใบเบิก"
              className="py-1.5 pl-2 pr-7 border border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1E90FF]">
              <option value="">ทุกประเภทใบ</option>
              {typeKeys.map(k => <option key={k} value={k}>ใบเบิก{reqTypeLabel(k)}</option>)}
            </select>
          )}
          {tab === 'hist' && (
            <div className="flex items-center gap-1.5">
              <div className="relative w-32 min-h-[34px] border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 flex items-center cursor-pointer focus-within:ring-2 focus-within:ring-[#1E90FF]">
                <span className={`px-2 text-sm pointer-events-none ${dateFilter ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>{dateFilter ? thaiDateFromIso(dateFilter) : 'ทุกวันที่'}</span>
                <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} aria-label="วันที่ส่งใบ"
                  onClick={e => { try { e.currentTarget.showPicker?.() } catch { /* noop */ } }}
                  className="absolute inset-0 opacity-0 w-full cursor-pointer text-base" />
              </div>
              <button onClick={() => setDateFilter('')}
                className={`text-xs px-2.5 py-1.5 rounded-xl border whitespace-nowrap ${!dateFilter ? 'bg-blue-50 dark:bg-blue-950/40 text-[#1E90FF] border-[#1E90FF]' : 'text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                ทุกวันที่
              </button>
            </div>
          )}
          <button onClick={() => exportReqExcel(filtered, auth)}
            className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 rounded-xl px-3 py-1.5 text-sm font-medium whitespace-nowrap">
            <FileDown size={16}/> Excel
          </button>
          {/* เตือนเพดานรายการ (user สั่ง 24/11/2569): ≥90% เหลือง · เต็ม = ใบเก่ากว่าไม่ขึ้นใน "ทุกวันที่" ต้องเลือกวันที่ */}
          {tab === 'hist' && list.length >= STAFF_LIST_WARN && (
            <p className={`basis-full flex items-start gap-1.5 text-xs px-3 py-2 rounded-xl border ${list.length >= STAFF_LIST_LIMIT
              ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60'
              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'}`}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                {list.length >= STAFF_LIST_LIMIT
                  ? `หน้านี้โหลดใบเบิกล่าสุดได้ ${STAFF_LIST_LIMIT} ใบ (ย้อนถึง ${thaiDateFromIso(oldestLoaded)}) ใบที่เก่ากว่าไม่ขึ้นใน "ทุกวันที่" — เลือกวันที่เพื่อดูใบเก่า ข้อมูลไม่หาย`
                  : `ใบเบิกในหน้านี้ ${list.length}/${STAFF_LIST_LIMIT} ใบ (ย้อนถึง ${thaiDateFromIso(oldestLoaded)}) ใกล้เพดานแล้ว — เกินแล้วใบเก่าสุดจะไม่ขึ้นใน "ทุกวันที่" แต่ยังเลือกวันที่ดูได้`}
              </span>
            </p>
          )}
        </div>

        {/* แถบทำกับใบที่ติ๊ก ("เลือกทั้งหมด" อยู่ในแถบนี้ — user สั่ง 14/11/2569) */}
        {visibleSelected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
            <span className="text-xs text-slate-500 dark:text-slate-400">เลือก {visibleSelected.length} ใบ</span>
            <button onClick={toggleAll} disabled={bulkLoading}
              className="flex items-center gap-1.5 border border-slate-300 dark:border-slate-600 hover:border-[#1E90FF] hover:text-[#1E90FF] text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-xl">
              <CheckSquare size={13}/> {visibleSelected.length === filtered.length ? 'ยกเลิกที่เลือกทั้งหมด' : `เลือกทั้งหมด (${filtered.length})`}
            </button>
            {visibleSelected.some(id => { const r = list.find(x => x.id === id); return r?.status === 'pending' && !awaitsSheetEntry(r); }) && (
              <button onClick={bulkApprove} disabled={bulkLoading}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold px-3 py-1.5 rounded-xl">
                <Check size={13}/> อนุมัติที่เลือก
              </button>
            )}
            <button onClick={bulkDelete} disabled={bulkLoading}
              className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 disabled:bg-slate-300 text-white text-xs font-semibold px-3 py-1.5 rounded-xl">
              <Trash2 size={13}/> ลบที่เลือก
            </button>
          </div>
        )}

        <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {filtered.length} ใบ · {filtered.reduce((s, r) => s + (r.requisition_items?.length || 0), 0).toLocaleString()} รายการ
        </p>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          {wide && (
            <div className={`${ROW_GRID} pl-4 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400`}>
              <span /><span>หน่วยงาน · ใบเบิก</span><span>ส่งเมื่อ</span><span>รายการ</span><span>ขั้นถัดไป</span><span />
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-400"><RefreshCcw size={18} className="animate-spin"/> กำลังโหลด...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="py-14 text-center">
              <CheckCircle size={28} className="mx-auto text-emerald-500 mb-2"/>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{tab === 'hist' ? 'ไม่พบใบเบิก' : 'ไม่มีใบในขั้นนี้'}</p>
              <p className="text-xs text-slate-400 mt-0.5">{tab === 'hist' ? 'ลองเปลี่ยนวันที่ หรือกด "ทุกวันที่"' : 'ไม่มีงานค้าง'}</p>
            </div>
          )}
          {!loading && filtered.map(r => {
            const tone = TONE[nextStep(r).tone];
            const open = () => onSelect(r);
            return (
              <div key={r.id} role="button" tabIndex={0} data-testid="req-row" onClick={open}
                onKeyDown={e => { if (e.key === 'Enter') open(); }}
                className={`relative pl-4 pr-3 py-2.5 border-b last:border-b-0 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${wide ? ROW_GRID : 'grid grid-cols-[20px_minmax(0,1fr)_16px] gap-x-2.5 gap-y-2'}`}>
                <span className={`absolute left-0 inset-y-2 w-1 rounded-r ${tone.bar}`} />
                {wide ? (
                  <>
                    {checkBox(r)}{nameBlock(r)}{sentBlock(r)}{itemsBlock(r)}{nextBlock(r)}
                    <ChevronRight size={16} className="text-slate-300 dark:text-slate-500 justify-self-end"/>
                  </>
                ) : (
                  <>
                    {checkBox(r)}
                    <div className="min-w-0 space-y-2">
                      {nameBlock(r)}
                      <div className="grid grid-cols-2 gap-2">{sentBlock(r)}{itemsBlock(r)}</div>
                      {nextBlock(r)}
                    </div>
                    <ChevronRight size={16} className="text-slate-300 dark:text-slate-500 self-center"/>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- แถว lot ที่จะจ่าย/ที่จัดจริง ของรายการหนึ่ง ----
function LotLines({ v, unit, stage }) {
  const u = unit && unit !== '-' ? unit : '';
  if (!v.allocation.length) {
    if (v.want <= 0) return <span className="text-xs text-slate-400">—</span>;
    return <p className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1"><AlertCircle size={13}/> {stage === 'pending' || stage === 'pick' ? 'ไม่มีของในคลัง' : 'จ่าย 0'}</p>;
  }
  const picked = stage !== 'pending' && stage !== 'pick';
  return (
    <div>
      {v.allocation.map((a, ai) => (
        <div key={ai} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 items-baseline py-1 ${ai ? 'border-t border-dashed border-slate-200 dark:border-slate-700' : ''}`}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
            <span className="font-mono text-[13px] text-slate-700 dark:text-slate-200">{a.lot || '-'}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">Exp {fmtExp(a.exp)}</span>
            {isNearExpiry(a.exp) && <Pill tone="amber"><Clock size={11}/> {expCountdown(a.exp)}</Pill>}
            {isSupportedLot(a) && <Pill tone="green">สนับสนุน</Pill>}
            {v.perLotLoc && a.locs.map(x => <span key={x} className="font-mono text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 rounded px-1.5">{x}</span>)}
          </div>
          <div className="text-right whitespace-nowrap tabular-nums">
            {a.packSize > 1 && a.unit && <span className="text-xs text-slate-500 dark:text-slate-400 mr-2">{Number(a.packs).toLocaleString()} × {a.unit}</span>}
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{Number(a.base).toLocaleString()}</span> <span className="text-xs text-slate-500 dark:text-slate-400">{u}</span>
          </div>
        </div>
      ))}
      {v.over > 0 && <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-1 mt-1"><Package size={12}/> ปัดเต็มกล่อง เกินที่ขอ {v.over.toLocaleString()} {u}</p>}
      {v.want > 0 && v.short > 0 && <p className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1 mt-1"><AlertCircle size={12}/> {picked ? 'จัดไม่ครบ' : 'ของไม่พอ'} ขาด {v.short.toLocaleString()} {u}</p>}
    </div>
  );
}

// ---- ขั้นของใบ (แถบ 5 ขั้นบนหัวใบ) ----
function SlipSteps({ req, stage }) {
  const sheet = !!req.sheet_entered_at;
  const steps = [
    ['ส่งใบเบิก', fmtDT(req.created_at)],
    [sheet || awaitsSheetEntry(req) ? 'ลงชีทเบิก' : 'อนุมัติ', sheet ? (req.receipt_no || 'ลงชีทแล้ว') : stage === 'pending' ? (awaitsSheetEntry(req) ? 'รอเลข บย.' : 'รออนุมัติ') : 'อนุมัติแล้ว'],
    ['จัดเสร็จ', req.picker_name || ''],
    ['ตรวจแล้ว จ่ายออก', req.verifier_name || ''],
    ['ผู้เบิกรับของ', req.received_by || ''],
  ];
  const now = { pending: 1, pick: 2, check: 3, ready: 3, done: 4, recv: 5 }[stage] ?? 0;
  return (
    <ol className="grid grid-flow-col auto-cols-[minmax(96px,1fr)] gap-1.5 overflow-x-auto pb-0.5">
      {steps.map(([b, s], i) => (
        <li key={b} className={`pt-2 border-t-4 min-w-0 ${i < now ? 'border-emerald-500 text-slate-700 dark:text-slate-200' : i === now ? 'border-[#1E90FF] text-[#1E90FF] dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'}`}>
          <p className="text-[13px] font-semibold">{b}</p>
          <p className="text-[11px] truncate tabular-nums">{s}</p>
        </li>
      ))}
    </ol>
  );
}

// ---- Requisition Detail (หน้าใบเบิก) ----
function RequisitionDetail({ req, onBack, onDone, auth = {} }) {
  const wide = useMinWidth(768);
  const [currentReq, setCurrentReq] = useState(req);
  const [outReq, setOutReq] = useState(null); // ReqOutputModal
  const stage = stageOf(currentReq);
  const isPending = stage === 'pending';
  const sheetMode = !!currentReq.sheet_entered_at;
  // ใบ pilot ที่รอสคริปต์ลงชีท — อนุมัติตรงไม่ได้ ต้องเลือก "จัดจ่ายเอง (ก่อนลงชีท)" แล้วยืนยัน
  const awaitsSheet = awaitsSheetEntry(currentReq);
  const [selfDispenseOpen, setSelfDispenseOpen] = useState(false);
  const [dispatchModal, setDispatchModal] = useState(false); // ready (flow เดิม) → จ่ายออก
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');

  const toItemState = (list) => (list||[]).map(item => ({
    ...item,
    decision:   item.approved_qty!=null?(item.approved_qty>0?'approve':'reject'):'approve',
    approvedQty: item.approved_qty??item.requested_qty,
    itemNote:   item.note||'',
  }));

  const requesterNote = req.note || '';
  const [items, setItems]         = useState(() => toItemState(req.requisition_items));
  const [staffNote, setStaffNote] = useState('');
  const [editingItems, setEditingItems] = useState({}); // item.id → เปิดปรับรายตัว (ใบรออนุมัติ)
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [lots, setLots]           = useState({ ready: false, lotsByCode: {}, rowsByCode: {} });
  const [iFilter, setIFilter]     = useState('all');
  const [iq, setIq]               = useState('');
  const [sort, setSort]           = useState(() => { try { return localStorage.getItem(SORT_PREF_KEY) === 'log' ? 'log' : 'doc'; } catch { return 'doc'; } });
  const [pickRes, setPickRes]     = useState({});   // item.id → { st:'full'|'part', qty, why } ขั้นรอจัด
  const [pickNotes, setPickNotes] = useState({});   // item.id → หมายเหตุคลัง (staff_note) ที่แก้ในขั้นรอจัด
  const [openNote, setOpenNote]   = useState({});
  const [issues, setIssues]       = useState({});   // item.id → { kind, text } ผู้ตรวจแจ้งแก้ (ไม่บังคับ)
  const [openIssue, setOpenIssue] = useState({});
  const [actor, setActor]         = useState(() => defaultActor(auth)); // ชื่อผู้จัด / ผู้ตรวจ

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('requisitions').select('*, requisition_items(*)').eq('id', req.id).single();
    if (data) { setCurrentReq(data); setItems(toItemState(data.requisition_items)); }
  }, [req.id]);

  // lot พร้อมจ่าย (หัก lot ที่ใบอื่นหยิบไปแล้ว) + ที่เก็บ — ประมาณการตอนรออนุมัติ · FEFO ตอนจัดใบที่ยังไม่ลงชีท · ที่เก็บของ lot ทุกขั้น
  useEffect(() => {
    const codes = (req.requisition_items || []).map(i => i.drug_code);
    let alive = true;
    loadStaffLots(codes, { excludeReqId: req.id })
      .then(r => { if (alive) setLots({ ready: true, ...r }); })
      .catch(() => { if (alive) setLots(s => ({ ...s, ready: true })); });
    return () => { alive = false; };
  }, [req.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: รับการแก้ไขจากหน้าผู้เบิก (แก้จำนวน/ลบรายการ) + สคริปต์ลงชีท
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel(`req-detail-${req.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisition_items' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisitions' }, refresh)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [req.id, refresh]);

  const views = useMemo(() => items.map((it, i) => {
    const code = String(it.drug_code || '').trim();
    const fefoLots = lots.lotsByCode[code] || [];
    const rows = lots.rowsByCode[code] || [];
    const wantQty = isPending ? (it.decision === 'reject' ? 0 : Number(it.approvedQty) || 0) : undefined;
    const v = itemAllocation(it, { stage, sheetMode, fefoLots, wantQty, isNear: isNearExpiry });
    const rowOf = (lot) => rows.find(r => String(r.lot || '').trim() === String(lot || '').trim());
    const allocation = v.allocation.map(a => {
      const row = rowOf(a.lot);
      return { ...a, locs: splitLocs(a.location || row?.location || ''), mainLog: a.mainLog || row?.main_log || '', unit: a.unit || row?.unit || '' };
    });
    const locs = [...new Set(allocation.flatMap(a => a.locs))];
    if (!locs.length && rows.length) splitLocs(rows[0].location).forEach(x => locs.push(x));
    return {
      ...v, i, item: it, allocation, locs,
      perLotLoc: new Set(allocation.map(a => a.locs.join(','))).size > 1,
      mainLog: allocation[0]?.mainLog || rows[0]?.main_log || '',
      onhand: fefoLots.reduce((s, l) => s + (l.base || 0), 0),
    };
  }), [items, lots, stage, sheetMode, isPending]);

  // ตรวจเรท/Lead Time ก่อนจ่าย (dispenseCheck — กฎเดียวกับ rate_check) — เฉพาะใบที่ยังไม่ลงชีท:
  // ลงชีท+นำเข้าแล้ว inventory ตัดยอดใบนี้ไปแล้ว คิดซ้ำจะขึ้นของไม่พอปลอม
  const checkOn = !sheetMode && (isPending || stage === 'pick');
  const [chkData, setChkData] = useState(null);
  useEffect(() => {
    if (!checkOn) return;
    let alive = true;
    fetchDispenseCheckData((req.requisition_items || []).map(i => i.drug_code))
      .then(r => { if (alive) setChkData(r); }).catch(() => {});
    return () => { alive = false; };
  }, [req.id, checkOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const checkByCode = useMemo(() => {
    if (!checkOn || !chkData || !lots.ready) return {};
    const qty = {};
    views.forEach(v => { const c = String(v.item.drug_code || '').trim(); qty[c] = (qty[c] || 0) + v.want; });
    const out = {};
    for (const [c, q] of Object.entries(qty)) {
      const d = chkData.byCode[c];
      if (!d || q <= 0) continue;
      const ok = (lots.lotsByCode[c] || []).filter(l => !d.pendingLots.has(String(l.lot || '').trim()));
      out[c] = checkDispenseLine({
        qty: q, avail: ok.reduce((s, l) => s + (l.base || 0), 0), pending: d.pendingBase, notifiedOn: d.notifiedOn,
        avgDay: d.avgDay, avgMonth: d.avgMonth, leadTime: d.leadTime, lots: ok.map(l => ({ exp: parseExp(l.exp) })),
      });
    }
    return out;
  }, [checkOn, chkData, lots, views]);
  const chkOf = (v) => { const r = checkByCode[String(v.item.drug_code || '').trim()]; return r && (r.level === 'stop' || r.level === 'warn') ? r : null; };

  const resOf = (v) => pickRes[v.item.id] || defaultPickResult(v);
  const noteOf = (v) => pickNotes[v.item.id] ?? v.item.staff_note ?? '';
  const isPart = (v) => stage === 'pick' ? v.want > 0 && resOf(v).st === 'part'
    : (stage === 'check' || stage === 'ready' || stage === 'done' || stage === 'recv') && v.want > 0 && v.short > 0;
  const hasIssue = (v) => stage === 'check' ? !!issues[v.item.id]?.kind : !!v.item.verify_note;
  const isBad = (v) => (isPending || stage === 'pick') && v.want > 0 && v.short > 0 && !(stage === 'pick' && resOf(v).st === 'full') || isPart(v) || hasIssue(v);

  const filters = [
    ['all', 'ทั้งหมด', views.length, ''],
    ['near', 'ใกล้หมดอายุ', views.filter(v => v.near).length, 'text-amber-600 dark:text-amber-400'],
    ...(isPending || stage === 'pick' ? [['short', 'ของไม่พอ', views.filter(v => v.want > 0 && v.short > 0).length, 'text-red-600 dark:text-red-400']] : []),
    ['over', 'จ่ายเกิน (ปัดเต็มกล่อง)', views.filter(v => v.over > 0).length, 'text-violet-600 dark:text-violet-300'],
    ...(checkOn && chkData ? [['rate', 'ควรพิจารณาแบ่งจ่าย', views.filter(chkOf).length, 'text-amber-600 dark:text-amber-400']] : []),
    ...(['pick', 'check', 'ready', 'done', 'recv'].includes(stage) ? [['part', 'จัดไม่ครบ/ไม่ตรง', views.filter(isPart).length, 'text-red-600 dark:text-red-400']] : []),
    ...(['check', 'done', 'recv'].includes(stage) ? [['issue', 'แจ้งแก้', views.filter(hasIssue).length, 'text-amber-600 dark:text-amber-400']] : []),
  ];
  const fKey = filters.some(f => f[0] === iFilter) ? iFilter : 'all';
  const match = (v) => fKey === 'all' ? true : fKey === 'near' ? v.near : fKey === 'short' ? v.want > 0 && v.short > 0
    : fKey === 'over' ? v.over > 0 : fKey === 'rate' ? !!chkOf(v) : fKey === 'part' ? isPart(v) : hasIssue(v);
  const iql = iq.trim().toLowerCase();
  let shown = views.filter(v => match(v) && (!iql || `${v.item.drug_name || ''} ${v.item.drug_code || ''}`.toLowerCase().includes(iql)));
  if (sort === 'log') shown = sortByLog(shown);
  const groups = [];
  shown.forEach(v => {
    const z = sort === 'log' ? (v.allocation.length || v.locs.length ? (v.mainLog || 'ไม่ระบุ Log') : 'ไม่มีของในคลัง') : null;
    if (!groups.length || groups[groups.length - 1].z !== z) groups.push({ z, rows: [] });
    groups[groups.length - 1].rows.push(v);
  });
  const setSortPref = (s) => { setSort(s); try { localStorage.setItem(SORT_PREF_KEY, s); } catch { /* ignore */ } };

  const updateItem = (i,field,val) => setItems(p => { const u=[...p]; u[i]={...u[i],[field]:val}; return u; });
  const setRes = (v, patch) => setPickRes(p => ({ ...p, [v.item.id]: { ...resOf(v), ...patch } }));
  const setIssue = (v, patch) => setIssues(p => ({ ...p, [v.item.id]: { kind: '', text: '', ...p[v.item.id], ...patch } }));

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

  const save = async (forceStatus, { beforeSheet = false } = {}) => {
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
        const overLines = views.map(v => {
          if (v.want <= 0 || v.over <= 0) return null;
          const u = v.item.drug_unit && v.item.drug_unit !== '-' ? v.item.drug_unit : '';
          return `${MARK_OVER} ${v.item.drug_name}: ขอ ${v.want.toLocaleString()} จ่าย ${v.got.toLocaleString()} ${u} เนื่องจากจ่ายเต็มกล่อง (ไม่แกะกล่อง เกิน ${v.over.toLocaleString()})`.trim();
        }).filter(Boolean);
        // ตัดบรรทัด auto เดิมออกก่อน กัน duplicate เมื่อ save ซ้ำ แล้วต่อบรรทัดใหม่
        const baseNote = (staffNote || requesterNote || '').split('\n').filter(l => !l.startsWith(MARK_OVER)).join('\n').trim();
        const finalNote = [baseNote, ...(status === 'rejected' ? [] : overLines)].filter(Boolean).join('\n') || null;
        await supabase.from('requisitions').update({ status, note:finalNote, updated_at:new Date().toISOString() }).eq('id',req.id);
        insertAuditLog({ action: 'update_requisition', table_name: 'requisitions', user_name: resolveAuditUserName(auth), department: auth?.department || '-', details: { req_number: req.req_number, requisition_id: req.id, status, ...(beforeSheet ? { action_detail: 'approve_before_sheet' } : {}) } });
      }
      // จัดจ่ายเองก่อนลงชีท = จัดต่อในหน้านี้เลย (ขั้นรอจัด) · อนุมัติ/ไม่อนุมัติ = กลับคิว
      if (beforeSheet) { await refresh(); setLoading(false); window.scrollTo({ top: 0 }); return; }
      onDone();
    } catch(e) { setError(e.message); setLoading(false); }
  };

  const finishPick = async () => {
    if (!actor.trim()) { setError('กรอกชื่อผู้จัดยา'); return; }
    setLoading(true); setError('');
    try {
      const payload = views.filter(v => v.want > 0).map(v => {
        const oh = {};
        (lots.lotsByCode[String(v.item.drug_code || '').trim()] || []).forEach(l => { const k = String(l.lot || '').trim(); oh[k] = (oh[k] || 0) + (l.base || 0); });
        return pickPayload(v.item, v, resOf(v), noteOf(v), oh);
      });
      await startPickingRequisition(currentReq.id, { pickerName: actor.trim(), items: payload }, auth);
      await refresh();
      setPickRes({}); setPickNotes({}); setOpenNote({}); setIFilter('all');
      window.scrollTo({ top: 0 });
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const issueNotes = views.map(v => ({ v, t: verifyNoteText(issues[v.item.id]) })).filter(x => x.t);
  const finishVerify = async () => {
    setDispatching(true); setError('');
    try {
      const notes = issueNotes.map(({ v, t }) => ({ id: v.item.id, verify_note: t, drug_code: v.item.drug_code, drug_name: v.item.drug_name }));
      const r = await verifyAndDispenseRequisition(currentReq.id, { verifierName: actor.trim(), notes }, auth);
      setVerifyOpen(false);
      await refresh();
      setIssues({}); setOpenIssue({}); setIFilter('all');
      setDoneMsg(notes.length && !r.notesSaved
        ? 'จ่ายออกแล้ว แต่บันทึกหมายเหตุแจ้งแก้ลงรายการไม่สำเร็จ (ยังไม่ได้รัน verify_note_migration.sql) — หมายเหตุอยู่ในประวัติการใช้งาน (audit log)'
        : 'จ่ายออกแล้ว — รอผู้เบิกกดรับของ');
      window.scrollTo({ top: 0 });
    } catch (e) { setError(e.message); setVerifyOpen(false); }
    setDispatching(false);
  };

  const confirmDispatch = async () => {
    setDispatching(true); setError('');
    try {
      await markRequisitionDispensed(currentReq.id, auth);
      onDone();
    } catch (e) { setError(e.message); setDispatching(false); setDispatchModal(false); }
  };

  const ns = nextStep(currentReq);
  const unitOf = (it) => (it.drug_unit && it.drug_unit !== '-' ? it.drug_unit : '');
  const callout = isPending
    ? (awaitsSheet
      ? ['amber', 'ยังไม่ลงชีทเบิก — lot ในตารางเป็นประมาณการตาม FEFO (ใกล้หมดอายุภายใน 6 เดือนก่อน → ยาสนับสนุน → exp ใกล้สุด) · lot จริงตามที่ลงชีท · ลงชีทแล้วใบย้ายไป "รอจัด" เอง ไม่ต้องกดอนุมัติในแอป']
      : ['amber', 'รออนุมัติ — lot ในตารางเป็นประมาณการตาม FEFO · ปรับจำนวน/ไม่อนุมัติรายตัวได้ที่ "ปรับ" แล้วกดยืนยันอนุมัติ'])
    : stage === 'pick'
      ? ['blue', sheetMode
        ? `ลงชีทแล้ว ${currentReq.receipt_no || ''} — จัดตาม lot ในชีท · ครบทุกรายการกด "จัดเสร็จ" ได้เลย · บันทึกเฉพาะรายการที่จัดไม่ครบหรือ lot ไม่ตรง`
        : 'ยังไม่มี lot จากชีท ระบบเสนอ lot ตาม FEFO (หักของที่ใบอื่นหยิบไปแล้ว) · หยิบ lot อื่นหรือได้ไม่ครบ กด "ไม่ครบ/ไม่ตรง" แล้วระบุ · คลังลงชีทตามที่จ่ายจริงภายหลัง']
      : stage === 'check'
        ? ['violet', `จัดเสร็จแล้ว${currentReq.picker_name ? ` โดย ${currentReq.picker_name}` : ''} — ตรวจของกับตาราง ดูแถวที่ไฮไลต์ก่อน · เจอของผิดกด "แจ้งแก้" ที่แถวนั้น (ไม่บังคับ) แก้ของให้ถูกแล้วกด "ตรวจแล้ว จ่ายออก" · ไม่มีคนจัดยา คนจัดตรวจเองได้`]
        : stage === 'ready' ? ['violet', `ตรวจแล้ว${currentReq.verifier_name ? ` โดย ${currentReq.verifier_name}` : ''} — กดจ่ายออก`]
          : stage === 'done' ? ['teal', doneMsg || 'จ่ายออกแล้ว — รอผู้เบิกกดรับของ']
            : stage === 'recv' ? ['green', `ผู้เบิกรับของแล้ว${currentReq.received_by ? ` (${currentReq.received_by}${currentReq.received_at ? ` · ${fmtDT(currentReq.received_at)}` : ''})` : ''}`]
              : ['red', `ไม่อนุมัติทั้งใบ${currentReq.note ? ` — ${currentReq.note}` : ''}`];
  const calloutCls = {
    amber: 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
    blue: 'text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60',
    violet: 'text-violet-800 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-900/60',
    teal: 'text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900/60',
    green: 'text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60',
    red: 'text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60',
  }[callout[0]];

  const inputCls = 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1E90FF]';
  const segBtn = (on, onCls) => `inline-flex items-center gap-1 px-2.5 py-1 text-[13px] font-medium whitespace-nowrap transition-colors ${on ? onCls : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`;

  // คอลัมน์ "ประเมิน / ผลการจัด" ตามขั้นของใบ
  const resultCell = (v) => {
    const it = v.item, u = unitOf(it);
    // ผู้เบิกส่งจำนวน 0 = ได้ยาไปแล้ว (บันทึก) — ไม่ต้องอนุมัติ/จัด/ลงชีท · หมายเหตุผู้เบิกขึ้นใต้ชื่อยาอยู่แล้ว
    if (isAlreadyGotQty(it.requested_qty)) return <Pill tone="slate"><History size={12}/> {ALREADY_GOT_PREFIX} ไม่ต้องจัด</Pill>;
    if (stage === 'rej') return <span className="text-sm font-semibold text-red-600 dark:text-red-400">ไม่อนุมัติ</span>;
    if (isPending && !awaitsSheet) {
      const realIdx = v.i;
      if (!editingItems[it.id]) return (
        <div className="flex flex-wrap items-center gap-2">
          {it.decision === 'reject' ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-500"><X size={14}/> ไม่อนุมัติ</span>
            : Number(it.approvedQty) !== Number(it.requested_qty) ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600"><Check size={14}/> อนุมัติ {Number(it.approvedQty).toLocaleString()} {u}</span>
              : <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600"><Check size={14}/> อนุมัติเต็มจำนวน</span>}
          {v.want > 0 && v.short > 0 && <span className="text-xs text-red-600 dark:text-red-400 tabular-nums">ได้ {v.got.toLocaleString()} จาก {v.want.toLocaleString()}</span>}
          <button onClick={() => setEditingItems(p => ({ ...p, [it.id]: true }))} className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-[#1E90FF]"><Pencil size={12}/> ปรับ</button>
        </div>
      );
      return (
        <div className="space-y-2">
          <div className="inline-flex border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden divide-x divide-slate-300 dark:divide-slate-600">
            <button onClick={() => updateItem(realIdx, 'decision', 'approve')} className={segBtn(it.decision === 'approve', 'bg-emerald-600 text-white')}><Check size={13}/> อนุมัติ</button>
            <button onClick={() => updateItem(realIdx, 'decision', 'reject')} className={segBtn(it.decision === 'reject', 'bg-red-500 text-white')}><X size={13}/> ไม่อนุมัติ</button>
          </div>
          {it.decision === 'approve' && (
            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">อนุมัติ
              <input type="number" min="0" inputMode="numeric" value={it.approvedQty} onChange={e => updateItem(realIdx, 'approvedQty', e.target.value)} className={`${inputCls} w-24 text-right tabular-nums`} /> {u}
            </label>
          )}
          <input type="text" value={it.itemNote} onChange={e => updateItem(realIdx, 'itemNote', e.target.value)} placeholder="หมายเหตุรายการนี้..." aria-label={`หมายเหตุ ${it.drug_name}`} className={`${inputCls} w-full`} />
          <button onClick={() => setEditingItems(p => { const n = { ...p }; delete n[it.id]; return n; })} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">เสร็จ</button>
        </div>
      );
    }
    if (isPending) {
      if (!v.allocation.length) return <Pill tone="red">ไม่มีของ</Pill>;
      if (v.short > 0) return <div><Pill tone="red">จ่ายได้ไม่ครบ</Pill><p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">ได้ {v.got.toLocaleString()} จาก {v.want.toLocaleString()} {u}</p></div>;
      return <div><span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400"><Check size={14}/> พอจ่าย</span><p className="text-xs text-slate-500 dark:text-slate-400">ประมาณการ</p></div>;
    }
    if (stage === 'pick') {
      if (v.want <= 0) return <span className="text-sm font-semibold text-red-600 dark:text-red-400">ไม่อนุมัติรายการนี้</span>;
      const r = resOf(v), note = noteOf(v);
      return (
        <div className="space-y-2">
          <div role="group" aria-label={`ผลการจัด ${it.drug_name}`} className="inline-flex border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden divide-x divide-slate-300 dark:divide-slate-600">
            <button type="button" aria-pressed={r.st === 'full'} onClick={() => setRes(v, { st: 'full' })} className={segBtn(r.st === 'full', 'bg-emerald-600 text-white')}><Check size={13}/> ครบ</button>
            <button type="button" aria-pressed={r.st === 'part'} onClick={() => setRes(v, { st: 'part', qty: r.qty === '' ? v.got : r.qty })} className={segBtn(r.st === 'part', 'bg-red-600 text-white')}>ไม่ครบ/ไม่ตรง</button>
          </div>
          {r.st === 'part' && (
            <div className="grid gap-1.5">
              <label className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">จัดได้
                <input type="number" min="0" max={v.got} inputMode="numeric" value={r.qty} onChange={e => setRes(v, { qty: e.target.value })} className={`${inputCls} w-24 text-right tabular-nums`} /> {u}
              </label>
              <label className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">เหตุ
                <select value={r.why} onChange={e => setRes(v, { why: e.target.value })} className={inputCls}>
                  {PICK_REASONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </label>
            </div>
          )}
          {openNote[it.id] ? (
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1">
                {STAFF_NOTE_PRESETS.map(p => (
                  <button key={p} type="button" onClick={() => setPickNotes(s => ({ ...s, [it.id]: note ? `${note} ${p}` : p }))}
                    className="text-xs px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-[#1E90FF] hover:text-[#1E90FF]">{p}</button>
                ))}
              </div>
              <input type="text" value={note} onChange={e => setPickNotes(s => ({ ...s, [it.id]: e.target.value }))} placeholder="หมายเหตุคลัง (ขึ้นใบเบิก)" aria-label={`หมายเหตุคลัง ${it.drug_name}`} className={`${inputCls} w-full`} />
            </div>
          ) : (
            <button type="button" onClick={() => setOpenNote(s => ({ ...s, [it.id]: true }))} className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-[#1E90FF]">
              <StickyNote size={12}/> {note ? `หมายเหตุคลัง: ${note}` : 'หมายเหตุคลัง'}
            </button>
          )}
        </div>
      );
    }
    const pickLine = v.want <= 0 ? <span className="text-sm font-semibold text-red-600 dark:text-red-400">ไม่อนุมัติรายการนี้</span>
      : v.short > 0 ? <div><Pill tone="red">จัดไม่ครบ/ไม่ตรง</Pill><p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">ได้ {v.got.toLocaleString()} จาก {v.want.toLocaleString()} {u}</p></div>
        : stage === 'check' ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400"><Check size={14}/> จัดครบ</span>
          : <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums"><Check size={14}/> จ่าย {v.got.toLocaleString()} {u}</span>;
    const staffLine = it.staff_note ? <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">หมายเหตุคลัง: {it.staff_note}</p> : null;
    if (stage !== 'check') return (
      <div>{pickLine}{staffLine}
        {it.verify_note && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mt-1 flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0"/> แจ้งแก้: {it.verify_note}</p>}
      </div>
    );
    const iss = issues[it.id] || { kind: '', text: '' };
    return (
      <div className="space-y-1.5">
        {pickLine}{staffLine}
        {openIssue[it.id] || iss.kind ? (
          <div className="rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-2 space-y-1.5">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">แจ้งแก้ (ไม่บังคับ)</p>
            <div className="flex flex-wrap gap-1">
              {VERIFY_ISSUES.map(k => (
                <button key={k} type="button" aria-pressed={iss.kind === k} onClick={() => setIssue(v, { kind: iss.kind === k ? '' : k })}
                  className={`text-xs px-2 py-0.5 rounded-full border ${iss.kind === k ? 'bg-amber-500 border-amber-500 text-white' : 'border-amber-300 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60'}`}>{k}</button>
              ))}
            </div>
            <input type="text" value={iss.text} onChange={e => setIssue(v, { text: e.target.value })} placeholder="รายละเอียด เช่น หยิบ lot 25A01 แทน 24K03 แก้แล้ว" aria-label={`รายละเอียดแจ้งแก้ ${it.drug_name}`} className={`${inputCls} w-full`} />
            <button type="button" onClick={() => { setIssues(p => { const n = { ...p }; delete n[it.id]; return n; }); setOpenIssue(p => ({ ...p, [it.id]: false })); }}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">ยกเลิกแจ้งแก้</button>
          </div>
        ) : (
          <button type="button" onClick={() => setOpenIssue(p => ({ ...p, [it.id]: true }))} className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-amber-600">
            <AlertTriangle size={12}/> แจ้งแก้
          </button>
        )}
      </div>
    );
  };

  const lotHead = isPending ? 'จ่ายจาก lot (ประมาณการ FEFO)' : stage === 'pick' ? (sheetMode ? 'จ่ายจาก lot (ตามชีท)' : 'จ่ายจาก lot (ระบบเสนอ FEFO)') : 'จ่ายจาก lot (ที่จัดจริง)';
  const nameCell = (v) => (
    <>
      <p className="font-semibold text-slate-800 dark:text-slate-100 break-words">{v.item.drug_name}</p>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
        <span className="font-mono">{v.item.drug_code}</span>
        <DrugTypeBadge type={v.item.drug_type} />
      </div>
      {v.item.item_note && <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">ผู้เบิก: {v.item.item_note}</p>}
      {chkOf(v) && (
        <p className={`text-xs mt-1 flex items-start gap-1 ${chkOf(v).level === 'stop' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
          <AlertTriangle size={12} className="shrink-0 mt-0.5" /><span>{staffNoteText(chkOf(v), unitOf(v.item))}</span>
        </p>
      )}
    </>
  );
  const locPills = (v) => v.locs.length
    ? v.locs.map(x => <span key={x} className="inline-block font-mono text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 rounded px-1.5">{x}</span>)
    : <span className="text-xs text-slate-400">-</span>;
  const showOnhand = isPending || stage === 'pick';
  const badRow = 'bg-red-50/70 dark:bg-red-950/20';

  const partCount = views.filter(isPart).length;
  const wantCount = views.filter(v => v.want > 0).length;
  const sameAsPicker = stage === 'check' && actor.trim() && actor.trim() === (currentReq.picker_name || '').trim();
  const barCls = 'no-print sticky bottom-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-700 px-4 py-3';
  const actorInput = (label) => (
    <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">{label}
      <input type="text" value={actor} onChange={e => setActor(e.target.value)} className={`${inputCls} w-36`} aria-label={`ชื่อ${label}`} />
    </label>
  );

  return (
    <>
      <div className="min-h-screen flex flex-col">
        <div className="no-print">
          <PageHeader onBack={onBack} title={currentReq.department} subtitle={currentReq.requester_name ? `ผู้เบิก ${currentReq.requester_name}` : ''} />
        </div>

        <div className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-4 py-3 space-y-3">
          {/* หัวใบ */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                <span className="font-mono text-slate-700 dark:text-slate-200">{currentReq.req_number}</span>
                {currentReq.req_type && <span>ใบเบิก{reqTypeLabel(currentReq.req_type)}</span>}
                <span>ส่ง {fmtDT(currentReq.created_at)}</span>
                <span>{items.length} รายการ</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {currentReq.receipt_no && <Pill tone="green">ลงชีทแล้ว {currentReq.receipt_no}</Pill>}
                {awaitsSheet && <Pill tone="amber">รอลงชีทเบิก</Pill>}
                {!awaitsSheet && <Pill tone={ns.tone}>{ns.label}</Pill>}
              </div>
            </div>
            {stage !== 'rej' && <SlipSteps req={currentReq} stage={stage} />}
            <div className="flex flex-wrap gap-1 border-t border-slate-100 dark:border-slate-800 pt-2">
              {/* ปุ่มเดียวกับประวัติของผู้เบิก — เลือกใบในโมดอล (user สั่ง 24/11/2569) */}
              <button type="button" onClick={() => setOutReq({ req: currentReq, doc: 'sheet' })}
                title="พิมพ์ / ส่งเป็น PDF — ใบเบิก · ใบปะหน้า · ใบขอเบิก · Excel"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:text-[#1E90FF] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg px-2.5 py-1.5">
                <Printer size={14}/> พิมพ์
              </button>
            </div>
          </section>

          <p className={`flex items-start gap-2 text-sm border rounded-xl px-3 py-2 ${calloutCls}`}>
            <AlertCircle size={16} className="shrink-0 mt-0.5"/><span>{callout[1]}</span>
          </p>
          {isPending && requesterNote && (
            <p className="text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl px-3 py-2">
              <span className="font-semibold">หมายเหตุจากผู้เบิก:</span> {requesterNote}
            </p>
          )}

          {/* ตัวกรองในใบ */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="กรองรายการในใบ">
            {filters.map(([k, label, c, cls]) => (
              <button key={k} type="button" aria-pressed={fKey === k} onClick={() => setIFilter(k)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] ${fKey === k ? 'border-[#1E90FF] bg-blue-50 dark:bg-blue-950/40 text-[#1E90FF] dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                {label} <b className={`tabular-nums ${fKey === k ? '' : cls || 'text-slate-700 dark:text-slate-200'}`}>{c}</b>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="search" value={iq} onChange={e => setIq(e.target.value)} placeholder="ค้นชื่อยาหรือรหัสในใบนี้" aria-label="ค้นรายการในใบ"
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1E90FF]" />
            </div>
            <div role="group" aria-label="เรียงรายการ" className="inline-flex border border-slate-300 dark:border-slate-600 rounded-xl overflow-hidden divide-x divide-slate-300 dark:divide-slate-600">
              <button type="button" aria-pressed={sort === 'doc'} onClick={() => setSortPref('doc')} className={segBtn(sort === 'doc', 'bg-[#1E90FF] text-white')}><ListOrdered size={14}/> ตามลำดับใบ</button>
              <button type="button" aria-pressed={sort === 'log'} onClick={() => setSortPref('log')} className={segBtn(sort === 'log', 'bg-[#1E90FF] text-white')}><MapPin size={14}/> ตามที่เก็บ (เดินจัด)</button>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            แสดง {shown.length} จาก {views.length} รายการ{!lots.ready && ' · กำลังโหลด lot/ที่เก็บ…'}
          </p>

          {shown.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl py-10 text-center text-sm text-slate-500">ไม่พบรายการ</div>
          ) : wide ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
              <table className="w-full table-fixed text-sm">
                <colgroup><col className="w-10"/><col className="w-[27%]"/><col className="w-[12%]"/><col className="w-[11%]"/><col/><col className="w-[22%]"/></colgroup>
                <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-2 py-2 text-right font-semibold">#</th>
                    <th className="px-2.5 py-2 text-left font-semibold">รายการยา</th>
                    <th className="px-2.5 py-2 text-right font-semibold">ขอเบิก</th>
                    <th className="px-2.5 py-2 text-left font-semibold">ที่เก็บ</th>
                    <th className="px-2.5 py-2 text-left font-semibold">{lotHead}</th>
                    <th className="px-2.5 py-2 text-left font-semibold">{isPending && awaitsSheet ? 'ประเมิน' : isPending ? 'อนุมัติ' : 'ผลการจัด'}</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, gi) => (
                    <React.Fragment key={gi}>
                      {g.z && <tr><td colSpan={6} className="px-2.5 py-1.5 text-[13px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40">{g.z} · {g.rows.length} รายการ</td></tr>}
                      {g.rows.map(v => (
                        <tr key={v.item.id} className={`border-t border-slate-100 dark:border-slate-800 align-top ${isBad(v) ? badRow : ''}`}>
                          <td className={`px-2 py-2.5 text-right text-slate-400 tabular-nums ${isBad(v) ? 'shadow-[inset_3px_0_0_#ef4444]' : ''}`}>{v.i + 1}</td>
                          <td className="px-2.5 py-2.5">{nameCell(v)}</td>
                          <td className="px-2.5 py-2.5 text-right tabular-nums">
                            <p className="font-bold text-[15px] text-slate-800 dark:text-slate-100">{Number(v.item.requested_qty).toLocaleString()}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{unitOf(v.item)}{showOnhand && lots.ready ? ` · มี ${v.onhand.toLocaleString()}` : ''}</p>
                            {entryQtyText(v.item.requested_qty, v.item.entry_pack, v.item.entry_unit, v.item.drug_unit) && <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">= {entryQtyText(v.item.requested_qty, v.item.entry_pack, v.item.entry_unit, v.item.drug_unit)}</p>}
                          </td>
                          <td className="px-2.5 py-2.5"><div className="flex flex-col items-start gap-1">{locPills(v)}</div></td>
                          <td className="px-2.5 py-2.5"><LotLines v={v} unit={v.item.drug_unit} stage={stage} /></td>
                          <td className="px-2.5 py-2.5">{resultCell(v)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((g, gi) => (
                <React.Fragment key={gi}>
                  {g.z && <p className="text-[13px] font-semibold text-indigo-700 dark:text-indigo-300 px-0.5 pt-1">{g.z} · {g.rows.length} รายการ</p>}
                  {g.rows.map(v => (
                    <article key={v.item.id} className={`bg-white dark:bg-slate-900 border rounded-xl p-3 space-y-2 ${isBad(v) ? 'border-red-300 dark:border-red-800/60 shadow-[inset_3px_0_0_#ef4444]' : 'border-slate-200 dark:border-slate-700'}`}>
                      <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 items-start">
                        <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold grid place-items-center tabular-nums">{v.i + 1}</span>
                        <div className="min-w-0">{nameCell(v)}</div>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-slate-500 dark:text-slate-400 tabular-nums">
                        <span>ขอ <b className="text-[15px] text-slate-800 dark:text-slate-100">{Number(v.item.requested_qty).toLocaleString()}</b> {unitOf(v.item)}
                          {entryQtyText(v.item.requested_qty, v.item.entry_pack, v.item.entry_unit, v.item.drug_unit) && <b className="text-blue-700 dark:text-blue-300"> = {entryQtyText(v.item.requested_qty, v.item.entry_pack, v.item.entry_unit, v.item.drug_unit)}</b>}</span>
                        {showOnhand && lots.ready && <span>คงเหลือ {v.onhand.toLocaleString()}</span>}
                        {!v.perLotLoc && v.locs.length > 0 && <span className="flex flex-wrap gap-1">{locPills(v)}</span>}
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5">
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">{lotHead}</p>
                        <LotLines v={v} unit={v.item.drug_unit} stage={stage} />
                      </div>
                      <div>{resultCell(v)}</div>
                    </article>
                  ))}
                </React.Fragment>
              ))}
            </div>
          )}

          {isPending && !awaitsSheet && (
            <textarea value={staffNote} onChange={e => setStaffNote(e.target.value)} placeholder="หมายเหตุโดยรวมจากเจ้าหน้าที่..." rows={2} aria-label="หมายเหตุโดยรวมจากเจ้าหน้าที่"
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E90FF] resize-none" />
          )}
          {error && <p className="text-red-600 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl px-3 py-2 flex items-center gap-2"><AlertCircle size={14}/>{error}</p>}
        </div>

        {/* แถบปุ่มล่างจอ — sticky ในคอลัมน์เนื้อหา (fixed left-0 ถูก sidebar บัง) */}
        {isPending && (
          <div className={barCls}>
            {rejecting ? (
              <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-2">
                <label className="flex-1 min-w-60 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-red-600 dark:text-red-400">ไม่อนุมัติทั้งใบ</span>
                  <input type="text" value={staffNote} onChange={e => setStaffNote(e.target.value)} placeholder="แจ้งเหตุให้ผู้เบิก เช่น ส่งซ้ำกับใบเมื่อวาน" aria-label="เหตุที่ไม่อนุมัติ"
                    className="flex-1 min-w-48 bg-white dark:bg-slate-900 border border-red-300 dark:border-red-800/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                </label>
                <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
                  <button onClick={() => setRejecting(false)} disabled={loading} className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-200">ยกเลิก</button>
                  <button onClick={() => save('rejected')} disabled={loading} className="rounded-xl border border-red-300 dark:border-red-800/60 bg-white dark:bg-slate-900 hover:bg-red-50 text-red-600 px-4 py-2.5 font-semibold flex items-center justify-center gap-1.5"><XCircle size={16}/> {loading ? 'กำลังบันทึก...' : 'ยืนยันไม่อนุมัติ'}</button>
                </div>
              </div>
            ) : (
              <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{awaitsSheet ? 'รอลงชีทเบิก' : `อนุมัติ ${items.filter(i => i.decision !== 'reject').length} · ไม่อนุมัติ ${items.filter(i => i.decision === 'reject').length}`}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{awaitsSheet ? 'ลงชีทแล้วใบขึ้น "ลงชีทแล้ว บย." และย้ายไปรอจัดเอง' : `จาก ${items.length} รายการ`}</p>
                </div>
                <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
                  <button onClick={() => setRejecting(true)} disabled={loading}
                    className="rounded-xl border border-red-300 dark:border-red-800/60 bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-950/50 text-red-600 px-4 py-2.5 font-semibold flex items-center justify-center gap-1.5"><XCircle size={16}/> ไม่อนุมัติทั้งใบ</button>
                  {awaitsSheet ? (
                    <button onClick={() => setSelfDispenseOpen(true)} disabled={loading}
                      className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2.5 font-semibold flex items-center justify-center gap-1.5"><Package size={16}/> {loading ? 'กำลังบันทึก...' : 'จัดจ่ายเอง (ก่อนลงชีท)'}</button>
                  ) : (
                    <button onClick={() => save(null)} disabled={loading}
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-4 py-2.5 font-semibold flex items-center justify-center gap-1.5"><CheckCircle size={16}/> {loading ? 'กำลังบันทึก...' : 'ยืนยันอนุมัติใบเบิก'}</button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {stage === 'pick' && (
          <div className={barCls}>
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm min-w-0">
                <p className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">ครบ {wantCount - partCount} · ไม่ครบ/ไม่ตรง {partCount}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">จาก {wantCount} รายการที่อนุมัติ</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {actorInput('ผู้จัด')}
                <button onClick={finishPick} disabled={loading || !lots.ready || !actor.trim()}
                  className="flex-1 sm:flex-none rounded-xl bg-[#1E90FF] hover:bg-blue-600 disabled:bg-slate-300 text-white px-5 py-2.5 font-semibold flex items-center justify-center gap-1.5"><Check size={16}/> {loading ? 'กำลังบันทึก...' : 'จัดเสร็จ'}</button>
              </div>
            </div>
          </div>
        )}
        {stage === 'check' && (
          <div className={barCls}>
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm min-w-0">
                <p className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{partCount ? `จัดไม่ครบ/ไม่ตรง ${partCount} รายการ` : 'จัดครบทุกรายการ'}{issueNotes.length ? ` · แจ้งแก้ ${issueNotes.length}` : ''}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{sameAsPicker ? 'ผู้ตรวจคนเดียวกับผู้จัด — ใช้ได้เมื่อไม่มีคนจัดยา' : partCount ? 'ตรวจแถวที่ไฮไลต์ก่อนจ่ายออก' : `${wantCount} รายการ`}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {actorInput('ผู้ตรวจ')}
                <button onClick={() => setVerifyOpen(true)} disabled={dispatching || !actor.trim()}
                  className="flex-1 sm:flex-none rounded-xl bg-[#1E90FF] hover:bg-blue-600 disabled:bg-slate-300 text-white px-5 py-2.5 font-semibold flex items-center justify-center gap-1.5"><CheckCircle size={16}/> ตรวจแล้ว จ่ายออก</button>
              </div>
            </div>
          </div>
        )}
        {stage === 'ready' && (
          <div className={barCls}>
            <div className="max-w-7xl mx-auto flex justify-end">
              <button onClick={() => setDispatchModal(true)} disabled={dispatching}
                className="w-full sm:w-auto rounded-xl bg-[#1E90FF] hover:bg-blue-600 disabled:bg-slate-300 text-white px-6 py-2.5 font-semibold flex items-center justify-center gap-1.5"><Check size={16}/> จ่ายออก</button>
            </div>
          </div>
        )}
        {stage === 'rej' && (
          <div className={barCls}>
            <div className="max-w-7xl mx-auto">
              {!deleteConfirm ? (
                <button onClick={() => setDeleteConfirm(true)} disabled={loading}
                  className="w-full bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/70 border border-red-300 dark:border-red-800/60 text-red-600 rounded-xl py-2.5 font-semibold flex items-center justify-center gap-2">
                  <Trash2 size={16}/> ลบใบเบิกนี้ออกจากระบบ
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setDeleteConfirm(false)} disabled={loading}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl py-2.5 font-semibold flex items-center justify-center gap-2"><X size={16}/> ยกเลิก</button>
                  <button onClick={handleDelete} disabled={loading}
                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white rounded-xl py-2.5 font-semibold flex items-center justify-center gap-2"><Trash2 size={16}/> {loading ? 'กำลังลบ...' : 'ยืนยันลบ'}</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {dispatchModal && (
        <DispatchConfirmModal req={currentReq} loading={dispatching}
          onConfirm={confirmDispatch}
          onClose={() => setDispatchModal(false)} />
      )}
      <ConfirmModal open={verifyOpen} loading={dispatching}
        title="ตรวจแล้ว จ่ายออก"
        message={`จ่ายยาตามใบเบิก ${currentReq.department} ${wantCount} รายการ ออกจากคลัง · ผู้ตรวจ ${actor.trim() || '-'}`}
        detail={issueNotes.length ? `แจ้งแก้ ${issueNotes.length} รายการ: ${issueNotes.map(x => `${x.v.item.drug_name} (${x.t})`).join(' · ')}` : 'ไม่มีรายการแจ้งแก้'}
        warning={partCount ? `จัดไม่ครบ/ไม่ตรง ${partCount} รายการ — ผู้เบิกจะเห็นจำนวนที่จ่ายจริง` : undefined}
        confirmText="จ่ายออก"
        onConfirm={finishVerify}
        onClose={() => setVerifyOpen(false)} />
      <ConfirmModal open={selfDispenseOpen} loading={loading}
        title="จัดจ่ายเองก่อนลงชีท"
        message={`ใบนี้ยังไม่ได้ลงชีทเบิก (ยังไม่มีเลข บย.) — ปกติรอคลังลงชีทก่อน แล้วจัดยาตาม lot ในชีท`}
        detail={drugPreview(currentReq.requisition_items)}
        warning="จัดจ่ายเองแล้ว คลังต้องลงชีทเบิกตามหลังตามจำนวนและ lot ที่จ่ายจริง (วันที่เบิก = วันที่จ่าย) · ระหว่างนี้คงเหลือในแอปหักใบนี้ไว้ชั่วคราว"
        confirmText="จัดจ่ายเอง"
        onConfirm={() => { setSelfDispenseOpen(false); save(null, { beforeSheet: true }); }}
        onClose={() => setSelfDispenseOpen(false)} />
      {/* หน้าคลังเปิดมาเรียงตามที่เก็บเสมอ = ใบ lot คุมเดิม (รวมปุ่ม 24/11/2569) · ฉบับห้องยาสลับเป็นเรียงตามใบในโมดอล */}
      {outReq && <ReqOutputModal req={outReq.req} doc={outReq.doc} auth={auth} defaultSort={SORT_BY_LOG} onClose={() => setOutReq(null)} />}
    </>
  );
}
