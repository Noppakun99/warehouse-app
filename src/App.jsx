import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { fetchInventory, saveInventory, fetchDrugDetails, fetchUploadMeta, saveUploadMeta, importReceiveLogs, fetchUsageRates, normalizeLotSearch } from './lib/db';
import { supabase } from './lib/supabase';
import { exportToExcel } from './lib/exportExcel';
import DrugSearchBar, { DrugTypeBadge } from './DrugSearchBar';
import {
  Search, Package, MapPin, X, UploadCloud, FileSpreadsheet,
  AlertCircle, BarChart3, Layers, Pill, FileText,
  ChevronUp, ChevronDown, Database, Clock, Check, CalendarDays, AlertTriangle, RefreshCcw, FileDown, Eye, EyeOff,
} from 'lucide-react';

const INVENTORY_EXCEL_COLS = [
  { header: 'ตำแหน่งจัดเก็บ',  key: 'location' },
  { header: 'รหัสยา',           key: 'code' },
  { header: 'ชื่อยา',           key: 'name' },
  { header: 'ประเภท',           key: 'type' },
  { header: 'หน่วย',            key: 'unit' },
  { header: 'Lot Number',       key: 'lot' },
  { header: 'Exp',              key: 'exp' },
  { header: 'คงเหลือ',          key: 'qty' },
  { header: 'ชนิดรายการ',       key: 'itemType' },
  { header: 'สถานะรับยา',       key: 'receiveStatus' },
  { header: 'Safety Stock',     key: 'safetyStock' },
];

// --- ข้อมูลตั้งต้นสำหรับคลังยา (Mockup Data) ---
// * อัปเดต: เพิ่มฟิลด์ code (รหัสยา) เข้ามาเพื่อใช้ในการอ้างอิง
const initialInventory = {};

// --- ข้อมูลจำลองสำหรับรายละเอียดตัวยา (Master Data) ---
// * อัปเดต: เปลี่ยน Key จาก "ชื่อยา|Lot|บิล" เป็น "รหัสยา|Lot|บิล"
const initialDrugDetails = {};



// --- Helper Functions สำหรับจัดการวันที่ ---
const parseDateString = (dateInput) => {
  if (!dateInput || dateInput === '-') return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;

  const dateStr = String(dateInput).trim();
  if (!dateStr) return null;

  // Excel serial number (เช่น 44926)
  const serial = Number(dateStr);
  if (!isNaN(serial) && serial > 30000 && serial < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  // แยก separator ที่เป็นไปได้: / หรือ -
  const sep = dateStr.includes('/') ? '/' : dateStr.includes('-') ? '-' : null;
  if (sep) {
    const parts = dateStr.split(sep).map(p => p.trim());
    if (parts.length === 3) {
      let [a, b, c] = parts.map(Number);
      let day, month, year;

      if (parts[0].length === 4) {
        // yyyy/mm/dd หรือ yyyy-mm-dd
        [year, month, day] = [a, b, c];
      } else {
        // dd/mm/yyyy หรือ dd-mm-yyyy
        [day, month, year] = [a, b, c];
      }

      // แปลง พ.ศ. → ค.ศ. (ถ้าปีมากกว่า 2500)
      if (year > 2500) year -= 543;

      const result = new Date(year, month - 1, day);
      return isNaN(result.getTime()) ? null : result;
    }
  }

  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
};

// แปลงวันที่ใดๆ → string "d/m/yyyy" มาตรฐาน (ใช้ตอน import CSV)
const normalizeDateStr = (raw) => {
  if (!raw || String(raw).trim() === '' || raw === '-') return '-';
  const d = parseDateString(raw);
  if (!d) return String(raw).trim();
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

// บังคับ รหัสยา เป็น text + แก้ scientific notation + ตัด leading zeros
const normalizeCode = (val) => {
  if (!val && val !== 0) return '-';
  let s = String(val).trim();
  if (!s) return '-';
  // แก้ scientific notation เช่น 1.5E+6 → "1500000"
  if (/^[\d.]+[eE][+-]?\d+$/.test(s)) {
    const n = parseFloat(s);
    s = isFinite(n) ? BigInt(Math.round(n)).toString() : s;
  }
  return s || '-';
};

// ใช้สำหรับ match/เปรียบเทียบ code — lowercase + ตัด leading zeros + trim
const codeKey = (val) => {
  if (!val || val === '-') return '';
  let s = String(val).trim().toLowerCase();
  if (/^[\d.]+[eE][+-]?\d+$/.test(s)) {
    const n = parseFloat(s);
    s = isFinite(n) ? BigInt(Math.round(n)).toString() : s;
  }
  // ตัด leading zeros เพื่อให้ "003" === "3"
  s = s.replace(/^0+(\d)/, '$1');
  return s;
};

// แปลง scientific notation → ตัวเลขเต็ม (เช่น 1.12512E+11 → "112512000000")
const normalizeNumericText = (val) => {
  if (!val) return '-';
  const v = String(val).trim();
  if (/^[\d.]+[eE][+-]?\d+$/.test(v)) {
    const n = parseFloat(v);
    return isFinite(n) ? BigInt(Math.round(n)).toString() : v;
  }
  return v || '-';
};

const isoToThai = (iso) => {
  if (!iso) return '-';
  const parts = String(iso).split('T')[0].split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
};

// แปลง "(blank)" → "-"
const cleanCell = (val) => {
  if (!val) return '';
  const v = String(val).trim();
  return v.toLowerCase() === '(blank)' ? '-' : v;
};

const formatDateDisplay = (dateInput) => {
  if (!dateInput || dateInput === '-') return '-';
  const d = parseDateString(dateInput);
  if (!d) return String(dateInput); 
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

const formatDateTime = (dateObj) => {
  if (!dateObj) return '';
  return dateObj.toLocaleDateString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

const parseCSVRow = (str) => {
  let arr = [];
  let quote = false;
  let col = '';
  for (let i = 0; i < str.length; i++) {
    let cc = str[i], nc = str[i+1];
    if (cc === '"' && quote && nc === '"') { col += '"'; i++; continue; }
    if (cc === '"') { quote = !quote; continue; }
    if (cc === ',' && !quote) { arr.push(col.trim()); col = ''; continue; }
    col += cc;
  }
  arr.push(col.trim().replace(/^"|"$/g, ''));
  return arr;
};

export default function App({ onRefresh, onNavigate, role = 'staff', auth = {} }) {
  const isStaff = role === 'staff' || role === 'admin';
  const [inventory, setInventory] = useState(initialInventory);
  const [exportLoading, setExportLoading] = useState(false);
  const [drugDetails, setDrugDetails] = useState(initialDrugDetails);
  const [_logFileName, setLogFileName] = useState('');
  const [logUpdateDate, setLogUpdateDate] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeZone,      setActiveZone]      = useState(null);   // null = auto-first
  const [hideEmptySlots,  setHideEmptySlots]  = useState(false);
  const [collapsedLevels, setCollapsedLevels] = useState(new Set());
  const [showManageMenu,  setShowManageMenu]  = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [expandedDetailsId, setExpandedDetailsId] = useState(null);
  const [expiryViewFilter, setExpiryViewFilter] = useState(null);
  const [modalSearch, setModalSearch] = useState('');
  const [modalTimeFilter, setModalTimeFilter] = useState('all'); // all | expired | soon30 | soon90 | soon180 | soon16m
  const [modalLogFilter, setModalLogFilter] = useState('all');   // 'all' | <invoice>
  const [modalExporting, setModalExporting] = useState(false);
  const [isMobileExpiry, setIsMobileExpiry] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  useEffect(() => {
    const fn = () => setIsMobileExpiry(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryStorageView, setSummaryStorageView] = useState('chart'); // 'chart' | 'table'
  const [usageRates, setUsageRates] = useState({});
  const [uploadWarnings, setUploadWarnings] = useState(null); // { fileName, rows: [{row, issues[]}] }

  const [showColumnGuide, setShowColumnGuide] = useState(null); // 'log' | 'drug' | null
  
  const logInputRef     = useRef(null);
  const receiveInputRef = useRef(null);

  // โหลดข้อมูลจาก Supabase เมื่อแอปเริ่มทำงาน
  useEffect(() => {
    async function loadFromSupabase() {
      try {
        const [inv, drugs, meta] = await Promise.all([
          fetchInventory(),
          fetchDrugDetails(),
          fetchUploadMeta(),
        ]);

        // ถ้า Supabase ยังไม่มีข้อมูล → แจ้งให้ import CSV
        if (!inv) {
          setErrorMsg('ยังไม่มีข้อมูลใน Supabase กรุณาอัปโหลด Log คลังยา (CSV) เพื่อเริ่มต้นใช้งาน');
        } else {
          setInventory(inv);
          if (drugs) setDrugDetails(drugs);
          if (meta?.inventory?.file_name) setLogFileName(meta.inventory.file_name);
          if (meta?.inventory?.updated_at) setLogUpdateDate(new Date(meta.inventory.updated_at));
        }
      } catch (err) {
        setErrorMsg('ไม่สามารถเชื่อมต่อ Supabase: ' + err.message + ' (ใช้ข้อมูลท้องถิ่นแทน)');
        setTimeout(() => setErrorMsg(''), 8000);
      }
    }
    loadFromSupabase();
  }, []);

  // โหลดเรทการใช้ยาจริง (avgPerDay) จาก dispense_logs 6 เดือนล่าสุด
  useEffect(() => {
    if (!supabase) return;
    fetchUsageRates(6)
      .then(r => setUsageRates(r))
      .catch(() => {}); // fallback: lowStockItems ใช้ ss/60 แทนถ้าโหลดไม่ได้
  }, []);

  const { todayForDisplay, targetDateForDisplay } = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const target = new Date(today); target.setMonth(target.getMonth() + 16);
    return { todayForDisplay: today, targetDateForDisplay: target };
  }, []);

  // คำนวณวันหมดอายุและการแจ้งเตือน
  const { expiredItems, nearExpiryItems, safeItems } = useMemo(() => {
    const expired = [];
    const near = [];
    const safe = [];
    
    Object.entries(inventory).forEach(([loc, items]) => {
      items.forEach((item, idx) => {
        const itemQty = parseFloat(String(item.qty || '0').replace(/,/g, '')) || 0;
        // ข้ามยาที่คงเหลือ 0 — ถูกนำออกจากคลังแล้ว ไม่ต้องแจ้งเตือน
        if (itemQty === 0) return;
        const isDiscontinued = item.receiveStatus && String(item.receiveStatus).includes('ตัดออก');
        if (isDiscontinued) return;

        const expDate = parseDateString(item.exp);
        const itemData = { ...item, location: loc, originalIndex: idx };

        if (expDate) {
          expDate.setHours(0,0,0,0);
          itemData.parsedExp = expDate;

          if (expDate < todayForDisplay) expired.push(itemData);
          else if (expDate <= targetDateForDisplay) near.push(itemData);
          else safe.push(itemData);
        } else {
           itemData.parsedExp = null;
           safe.push(itemData);
        }
      });
    });
    
    expired.sort((a,b) => a.parsedExp - b.parsedExp);
    near.sort((a,b) => a.parsedExp - b.parsedExp);
    
    return { expiredItems: expired, nearExpiryItems: near, safeItems: safe };
  }, [inventory, todayForDisplay, targetDateForDisplay]);

  // คำนวณยาที่ต่ำกว่า Safety Stock (Low Stock Alert)
  const lowStockItems = useMemo(() => {
    // ค้นหาค่าใน object แบบ case-insensitive
    const findVal = (obj, ...keys) => {
      const lowers = keys.map(k => k.toLowerCase().trim());
      for (const [k, v] of Object.entries(obj)) {
        if (lowers.includes(k.toLowerCase().trim())) return v;
      }
      return undefined;
    };

    // สร้าง map: code → { safetyStock, leadTimeDays, name }
    const safetyMap = {};
    const ltMap     = {}; // แยก leadtime ออกมา — เก็บค่าจริงจาก CSV ถ้ามี
    const nameMap   = {};
    const typeMap   = {};
    const unitMap   = {};
    Object.values(drugDetails).forEach(d => {
      const code = codeKey(d._code);
      if (!code || code === '-') return;
      const ssVal = findVal(d, 'Safety Stock', 'safety_stock', 'สต็อกขั้นต่ำ', 'ปริมาณขั้นต่ำ', 'ss');
      const ss = parseFloat(String(ssVal || '0').replace(/,/g, '')) || 0;
      const ltVal = findVal(d, 'Sum of Lead Time (In days)', 'sum of lead time (in days)', 'Sum of Lead Time', 'sum_of_lead_time', 'lead time (in days)', 'lead time', 'leadtime');
      const ltRaw = parseFloat(String(ltVal || '0').replace(/,/g, ''));
      // เก็บ leadtime ที่ไม่ใช่ 0/null ไว้ใน ltMap (ใช้ค่าแรกที่พบ หรืออัปเดตถ้าใหม่กว่า)
      if (ltRaw > 0 && !ltMap[code]) ltMap[code] = ltRaw;
      if (ss > 0) {
        if (!safetyMap[code] || ss > safetyMap[code].ss) {
          safetyMap[code] = { ss };
        }
        if (!nameMap[code]) nameMap[code] = d._name;
      }
    });

    // รวม qty ต่อ drug_code จาก inventory ทุก location
    const qtyMap = {};
    const discontinuedSet = new Set();
    Object.values(inventory).forEach(items => {
      items.forEach(item => {
        const code = codeKey(item.code);
        if (!code || code === '-') return;
        const qty = parseFloat(String(item.qty || '0').replace(/,/g, '')) || 0;
        qtyMap[code] = (qtyMap[code] || 0) + qty;
        if (!nameMap[code]) nameMap[code] = item.name;
        if (!typeMap[code] && item.type && item.type !== '-') typeMap[code] = item.type;
        if (!unitMap[code] && item.unit && item.unit !== '-') unitMap[code] = item.unit;
        if (item.receiveStatus && String(item.receiveStatus).includes('ตัดออก')) {
          discontinuedSet.add(code);
        }
        const ss = item.safetyStock || 0;
        if (ss > 0 && !safetyMap[code]) {
          safetyMap[code] = { ss };
          if (!nameMap[code]) nameMap[code] = item.name;
        }
      });
    });

    if (Object.keys(safetyMap).length === 0) return [];

    // หายาที่ qty < safety stock และคำนวณ Reorder Point
    const alerts = [];
    Object.entries(safetyMap).forEach(([code, { ss }]) => {
      const lt = ltMap[code] || 20; // ใช้ leadtime จาก CSV ถ้ามี ไม่งั้น default 20
      const currentQty = qtyMap[code] || 0;
      // ใช้เรทการใช้จริงจาก dispense_logs ถ้ามีข้อมูล ≥3 เดือน ไม่งั้น fallback ss/60
      const avgPerDay  = usageRates[code] ?? (ss > 0 ? ss / 60 : 0);
      const reorderPt  = ss + Math.round(avgPerDay * lt);
      alerts.push({
        code,
        name:        nameMap[code] || code,
        type:        typeMap[code] || '-',
        unit:        unitMap[code] || '-',
        currentQty,
        safetyStock: ss,
        leadTime:    lt,
        reorderPoint: reorderPt,
        deficit:     Math.max(0, ss - currentQty),
        belowReorder: currentQty <= reorderPt,
        belowSafety:  currentQty < ss,
        pct:         ss > 0 ? Math.round((currentQty / ss) * 100) : 100,
      });
    });

    // แสดงเฉพาะที่ต่ำกว่า Reorder Point เรียงจากวิกฤตที่สุด
    // ยกเว้นยาที่ตัดออกจากบัญชีและคงเหลือ 0 (ไม่ต้องสั่งซื้อ)
    return alerts
      .filter(a => a.belowReorder)
      .filter(a => !(a.currentQty === 0 && discontinuedSet.has(a.code)))
      .sort((a, b) => a.pct - b.pct);
  }, [drugDetails, inventory, usageRates]);

  // คำนวณรายการยารอตรวจรับ — เรียงจากวันที่รับเข้านานที่สุดก่อน
  const pendingReceiveItems = useMemo(() => {
    const pending = [];
    Object.entries(inventory).forEach(([loc, items]) => {
      items.forEach((item, idx) => {
        if (String(item.receiveStatus || '').includes('รอตรวจรับ')) {
          const lookupCode    = item.code?.trim().toLowerCase()    || '-';
          const lookupLot     = item.lot?.trim().toLowerCase()     || '-';
          const lookupInvoice = item.invoice?.trim().toLowerCase() || '-';
          const exactKey      = `${lookupCode}|${lookupLot}|${lookupInvoice}`;
          const detail = (drugDetails || {})[exactKey]
            || Object.values(drugDetails || {}).find(d =>
                d._code?.toLowerCase() === lookupCode && d._lot?.toLowerCase() === lookupLot
               );
          pending.push({
            ...item,
            location: loc,
            isPending: true,
            originalIndex: idx,
            _receiveDate: detail?.receive_date || null,
          });
        }
      });
    });
    // เรียงจากรับเข้านานสุดก่อน (ยังไม่ตรวจรับนานที่สุด)
    pending.sort((a, b) => {
      if (!a._receiveDate && !b._receiveDate) return 0;
      if (!a._receiveDate) return 1;
      if (!b._receiveDate) return -1;
      return new Date(a._receiveDate) - new Date(b._receiveDate);
    });
    return pending;
  }, [inventory, drugDetails]);

  // คำนวณโครงสร้างตู้ และหาจำนวน Unique Item / Unique Lot
  const { layout, otherZones, summary, overallStats } = useMemo(() => {
    const lay = {};
    const other = {};
    const sum = {};
    const allNames = new Set();
    const allLots = new Set();
    let totalValue = 0;

    Object.entries(inventory).forEach(([loc, items]) => {
      if (!items || items.length === 0) return;

      const match = loc.match(/^([A-Za-zก-ฮ0-9]+)-(\d+)(?:-(\d+))?$/);
      const cab = match ? match[1] : loc;

      if (!sum[cab]) sum[cab] = { names: new Set(), lots: new Set(), total: 0, value: 0 };

      if (match) {
        const lev = match[2];
        const bin = match[3] || 'main';
        if (!lay[cab]) lay[cab] = {};
        if (!lay[cab][lev]) lay[cab][lev] = [];
        lay[cab][lev].push({ id: loc, bin });
      } else {
        other[loc] = items;
      }

      items.forEach(item => {
        const qty = parseFloat(String(item.qty || '0').replace(/,/g, '')) || 0;
        const isDiscontinued = item.receiveStatus && String(item.receiveStatus).includes('ตัดออก');
        // ⛔ ข้าม qty=0 และยาตัดออก — ไม่ใช่ "ของในคลังจริง"
        if (qty === 0 || isDiscontinued) return;

        const codeKey = (item.code && item.code !== '-') ? item.code.trim().toLowerCase() : item.name.trim().toLowerCase();
        const lotKey = `${codeKey}|${(item.lot || '').trim().toLowerCase()}`;

        // lookup ราคาจาก drugDetails — exact key ก่อน, fallback ที่ code+lot
        const invKey = (item.invoice || '-').trim().toLowerCase();
        const exactKey = `${codeKey}|${(item.lot || '-').trim().toLowerCase()}|${invKey}`;
        let price = parseFloat(String(drugDetails[exactKey]?.price_per_unit || 0)) || 0;
        if (!price) {
          const fallback = Object.values(drugDetails).find(d =>
            d._code?.toLowerCase() === codeKey && d._lot?.toLowerCase() === (item.lot || '').trim().toLowerCase()
          );
          if (fallback?.price_per_unit) price = parseFloat(fallback.price_per_unit) || 0;
        }
        const value = qty * price;

        sum[cab].names.add(codeKey);
        sum[cab].lots.add(lotKey);
        sum[cab].total += 1;
        sum[cab].value += value;

        allNames.add(codeKey);
        allLots.add(lotKey);
        totalValue += value;
      });
    });

    Object.keys(lay).forEach(cab => {
      Object.keys(lay[cab]).forEach(lev => {
        lay[cab][lev].sort((a, b) => {
          if (a.bin === 'main') return -1;
          if (b.bin === 'main') return 1;
          return Number(a.bin) - Number(b.bin);
        });
      });
    });

    return { layout: lay, otherZones: other, summary: sum, overallStats: { names: allNames.size, lots: allLots.size, value: totalValue } };
  }, [inventory, drugDetails]);

  const totalCabinets = Object.keys(summary).length;

  // % การใช้พื้นที่ต่อ zone — slot ที่มีของ (qty>0) ÷ slot ทั้งหมด — สำหรับ "List of sections"
  const sectionUsage = useMemo(() => {
    return Object.keys(layout).sort().map(cab => {
      let total = 0;
      let used = 0;
      Object.values(layout[cab]).forEach(slots => {
        slots.forEach(slot => {
          total += 1;
          const hasStock = (inventory[slot.id] || []).some(item =>
            (parseFloat(String(item.qty || '0').replace(/,/g, '')) || 0) > 0
          );
          if (hasStock) used += 1;
        });
      });
      const pct = total > 0 ? Math.round((used / total) * 100) : 0;
      return { cab, total, used, empty: total - used, pct };
    });
  }, [layout, inventory]);

  // --- ข้อมูลสำหรับสร้างกราฟ ---
  const { typeStats, maxTypeCount } = useMemo(() => {
    const stats = {};
    const uniqueTracker = new Set();
    let max = 0;

    Object.values(inventory).forEach(items => {
      items.forEach(item => {
        const qty = parseFloat(String(item.qty || '0').replace(/,/g, '')) || 0;
        const isDiscontinued = item.receiveStatus && String(item.receiveStatus).includes('ตัดออก');
        if (qty === 0 || isDiscontinued) return;

        const typeStr = (item.type && item.type !== '-') ? item.type.toUpperCase() : 'ไม่ระบุ';
        const codeKey = (item.code && item.code !== '-') ? item.code.trim().toLowerCase() : item.name.trim().toLowerCase();

        const uniqueId = `${typeStr}|${codeKey}`;
        if (!uniqueTracker.has(uniqueId)) {
          uniqueTracker.add(uniqueId);
          stats[typeStr] = (stats[typeStr] || 0) + 1;
        }
      });
    });

    // เรียงจากมากไปน้อย
    const sortedStats = Object.entries(stats).sort((a, b) => b[1] - a[1]);
    if (sortedStats.length > 0) max = sortedStats[0][1];

    return { typeStats: sortedStats, maxTypeCount: max };
  }, [inventory]);

  const maxLogCount = useMemo(() => {
    let max = 0;
    Object.values(summary).forEach(val => {
      if (val.names.size > max) max = val.names.size;
    });
    return max;
  }, [summary]);
  // -----------------------------

  const drugNamesList = useMemo(() => {
    const map = {};
    Object.values(inventory).forEach(items => items.forEach(item => {
      if (item.name && !map[item.name]) map[item.name] = item.type || '';
    }));
    return Object.entries(map).map(([name, type]) => ({ name, type })).sort((a, b) => a.name.localeCompare(b.name));
  }, [inventory]);

  const searchResults = useMemo(() => {
    if (!searchTerm) return [];
    const term = searchTerm.toLowerCase();
    const lotTerm = normalizeLotSearch(term);
    const results = [];

    Object.entries(inventory).forEach(([loc, items]) => {
      items.forEach((item, idx) => {
        const qty = parseFloat(String(item.qty || '0').replace(/,/g, '')) || 0;
        if (qty === 0) return; // ซ่อน qty=0 เหมือนแผนผัง
        if (
          item.name.toLowerCase().includes(term) ||
          (item.code && item.code.toLowerCase().includes(term)) ||
          (item.lot && normalizeLotSearch(item.lot.toLowerCase()).includes(lotTerm)) ||
          loc.toLowerCase().includes(term) ||
          (item.invoice && item.invoice.toLowerCase().includes(term))
        ) {
          results.push({ ...item, location: loc, originalIndex: idx });
        }
      });
    });

    // เรียง exp ใกล้หมดก่อน (ascending) — ไม่มี exp อยู่ล่างสุด
    results.sort((a, b) => {
      const da = parseDateString(a.exp);
      const db = parseDateString(b.exp);
      if (da && db) return da - db;
      if (da) return -1;
      if (db) return 1;
      return 0;
    });

    return results;
  }, [inventory, searchTerm]);

  // โหลดข้อมูลล่าสุดจาก Supabase ใหม่
  const confirmResetData = async () => {
    setShowResetConfirm(false);
    setSuccessMsg('กำลังโหลดข้อมูลจาก Supabase ใหม่...');
    try {
      const [inv, drugs, meta] = await Promise.all([
        fetchInventory(),
        fetchDrugDetails(),
        fetchUploadMeta(),
      ]);
      if (inv) setInventory(inv);
      if (drugs) setDrugDetails(drugs);
      if (meta?.inventory?.file_name) setLogFileName(meta.inventory.file_name);
      if (meta?.inventory?.updated_at) setLogUpdateDate(new Date(meta.inventory.updated_at));
      setErrorMsg('');
      setSuccessMsg('โหลดข้อมูลล่าสุดจาก Supabase เรียบร้อยแล้ว');
    } catch (err) {
      setErrorMsg('โหลดข้อมูลล้มเหลว: ' + err.message);
    }
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  const handleInventoryExport = async () => {
    setExportLoading(true);
    try {
      const rows = [];
      Object.entries(inventory).forEach(([location, items]) => {
        items.forEach(item => {
          if ((item.qty || 0) > 0) rows.push({ ...item, location });
        });
      });
      rows.sort((a, b) => a.location.localeCompare(b.location, 'th'));
      await exportToExcel(rows, INVENTORY_EXCEL_COLS, 'คลังยา', `inventory_${new Date().toISOString().slice(0,10)}.xlsx`, auth);
    } finally {
      setExportLoading(false);
    }
  };

  const handleReceiveFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = async (ev) => {
      setSuccessMsg(`กำลังนำเข้าประวัติรับยา "${file.name}"...`);
      try {
        const count = await importReceiveLogs(ev.target.result);
        setSuccessMsg(`นำเข้าประวัติรับยาสำเร็จ ${count.toLocaleString()} รายการ จากไฟล์ "${file.name}"`);
        // โหลด drugDetails ใหม่เพราะดึงจาก receive_logs
        const drugs = await fetchDrugDetails();
        if (drugs) setDrugDetails(drugs);
        setTimeout(() => setSuccessMsg(''), 6000);
      } catch (err) {
        setErrorMsg('นำเข้าประวัติรับยาล้มเหลว: ' + err.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleLogFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r?\n/);
        
        let headerRowIndex = -1;
        let headers = [];

        for (let i = 0; i < lines.length; i++) {
          const row = parseCSVRow(lines[i]);
          if (row.some(cell => cell.includes('DetailedLog') || cell.includes('รายการยา') || cell.includes('ชื่อยา') || cell.includes('ตำแหน่ง') || cell.includes('รหัสยา'))) {
            headerRowIndex = i;
            headers = row;
            break;
          }
        }

        if (headerRowIndex === -1) throw new Error('ไฟล์ Log ต้องมีคอลัมน์ตำแหน่ง และชื่อยา/รหัสยา');

        const logIdx = headers.findIndex(h => h.includes('DetailedLog') || h.includes('ตำแหน่ง') || h.toLowerCase().includes('location'));
        const codeIdx = headers.findIndex(h => h.includes('รหัสยา') || h.includes('รหัส') || h.toLowerCase().includes('code'));
        const nameIdx = headers.findIndex(h => h.includes('รายการยา') || h.includes('ชื่อยา') || h.toLowerCase().includes('drug'));
        const typeIdx = headers.findIndex(h => h.includes('ชนิด') || h.toLowerCase().includes('type'));
        const unitIdx = headers.findIndex(h => {
          const hl = h.toLowerCase().trim();
          // ต้อง match "หน่วย" หรือ "หน่วยนับ" แต่ห้าม match "หน่วยงาน" (department)
          if (hl.includes('หน่วยงาน')) return false;
          return h.includes('หน่วย') || hl === 'unit' || hl.includes('unit_label') || hl.includes('หน่วยนับ');
        });
        const lotIdx = headers.findIndex(h => h.toLowerCase().includes('lot') || h.includes('รุ่น'));
        const expIdx = headers.findIndex(h => h.toLowerCase().includes('exp') || h.includes('หมดอายุ'));
        const qtyIdx = headers.findIndex(h => h.includes('คงเหลือ') || h.toLowerCase() === 'qty');
        const qtyReceivedIdx = headers.findIndex(h => h.includes('จำนวนที่รับ') || h.includes('ที่รับ') || h.toLowerCase().includes('qty_received') || h.toLowerCase().includes('received'));
        const invoiceIdx = headers.findIndex(h => h.includes('บิล') || h.includes('ใบเสร็จ') || h.toLowerCase().includes('invoice') || h.toLowerCase().includes('inv'));
        // สถานะตรวจรับ → รอตรวจรับ (เช็คก่อน เพราะต้องการค่า "รอตรวจรับ" จากคอลัมน์นี้)
        const statusIdx = headers.findIndex(h => h.includes('สถานะตรวจรับ') || h.includes('ตรวจรับ') || h.toLowerCase().includes('status'));
        // ผลการพิจารณา → ตัดออกจากบัญชี (แยก index ต่างหาก)
        const resultIdx = headers.findIndex(h => h.includes('ผลการพิจารณา'));
        // Safety Stock และ Lead Time จาก log CSV
        const ssIdx = headers.findIndex(h => h.toLowerCase().replace(/\s+/g,' ').trim() === 'safety stock' || h.toLowerCase().trim() === 'safety_stock' || h.toLowerCase().includes('safety stock') || h.includes('สต็อกขั้นต่ำ'));
        const ltIdx = headers.findIndex(h => h.toLowerCase().includes('lead time') || h.toLowerCase() === 'leadtime');
        const itemTypeIdx = headers.findIndex(h => h.includes('ชนิดรายการ') || h.toLowerCase().trim() === 'item_type' || h.toLowerCase().trim() === 'item type');
        const mainLogIdx = headers.findIndex(h => h.toLowerCase().trim() === 'mainlog' || h.toLowerCase().trim() === 'main_log' || h.toLowerCase().trim() === 'main log');

        const newInventory = {};
        const warnRows = [];

        for (let i = headerRowIndex + 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;

          const rawRow = parseCSVRow(lines[i]);
          const row = rawRow.map(cleanCell); // แปลง (blank) → -
          const location = row[logIdx] || '';
          const code = codeIdx !== -1 && row[codeIdx] ? row[codeIdx] : '-';
          const name = row[nameIdx] || '';

          if (!location || (!name && code === '-')) continue;

          // --- Row Validation ---
          const issues = [];
          const rowNum = i - headerRowIndex;
          if (!code || code === '-') issues.push('ไม่มีรหัสยา');
          if (!name) issues.push('ไม่มีชื่อยา');
          if (!location) issues.push('ไม่มีตำแหน่ง');
          if (expIdx !== -1 && row[expIdx] && row[expIdx] !== '-' && !parseDateString(row[expIdx]))
            issues.push(`วันหมดอายุไม่ถูกต้อง: "${row[expIdx]}"`);
          if (qtyIdx !== -1 && row[qtyIdx] && row[qtyIdx] !== '-' && isNaN(parseFloat(String(row[qtyIdx]).replace(/,/g,''))))
            issues.push(`qty ไม่ใช่ตัวเลข: "${row[qtyIdx]}"`);
          if (issues.length > 0) warnRows.push({ row: rowNum, code, name: name || '-', location, issues });

          const qtyStr = qtyIdx !== -1 && row[qtyIdx] ? row[qtyIdx] : '-';
          // ไม่กรองออก qty=0 — แสดงในแผนผังด้วยเพื่อให้เห็นว่ายาหมดและต้องสั่ง

          if (!newInventory[location]) newInventory[location] = [];

          newInventory[location].push({
            code: normalizeCode(code),
            name,
            type: typeIdx !== -1 && row[typeIdx] ? row[typeIdx] : '-',
            unit: unitIdx !== -1 && row[unitIdx] ? row[unitIdx] : '-',
            lot: lotIdx !== -1 && row[lotIdx] ? normalizeNumericText(row[lotIdx]) : '-',
            exp: normalizeDateStr(expIdx !== -1 ? row[expIdx] : '-'),
            qty: qtyStr,
            qtyReceived: qtyReceivedIdx !== -1 && row[qtyReceivedIdx] ? normalizeNumericText(row[qtyReceivedIdx]) : null,
            invoice: invoiceIdx !== -1 ? normalizeNumericText(row[invoiceIdx]) : '-',
            mainLog: mainLogIdx !== -1 && row[mainLogIdx] ? row[mainLogIdx] : null,
            itemType: itemTypeIdx !== -1 && row[itemTypeIdx] ? row[itemTypeIdx] : null,
            safetyStock: ssIdx !== -1 ? parseFloat(String(row[ssIdx] || '0').replace(/,/g, '')) || 0 : 0,
            leadTime: ltIdx !== -1 ? parseFloat(String(row[ltIdx] || '0').replace(/,/g, '')) || 20 : 20,
            receiveStatus: (() => {
              const s = statusIdx !== -1 ? row[statusIdx]?.trim() : '';   // สถานะตรวจรับ เช่น "รอตรวจรับ"
              const r = resultIdx !== -1 ? row[resultIdx]?.trim() : '';   // ผลการพิจารณา เช่น "ตัดออก", "คงไว้"
              // เก็บทั้งสองค่าด้วย | เพื่อให้ตรวจสอบได้ทั้งคู่
              const combined = [s, r].filter(Boolean).join('|');
              return combined || 'ไม่มีการดำเนินการ';
            })()
          });
        }

        const now = new Date();

        setInventory(newInventory);
        setLogFileName(file.name);
        setLogUpdateDate(now);
        setErrorMsg('');
        if (warnRows.length > 0) setUploadWarnings({ fileName: file.name, type: 'Log คลังยา', rows: warnRows });
        setSuccessMsg(`กำลังบันทึก Log คลังยา "${file.name}" ขึ้น Supabase...`);

        saveInventory(newInventory)
          .then(() => saveUploadMeta('inventory', file.name))
          .then(() => {
            setSuccessMsg(`อัปโหลด Log คลังยาและ "แทนที่ข้อมูลเดิม" ด้วยไฟล์ "${file.name}" สำเร็จ`);
            setTimeout(() => setSuccessMsg(''), 5000);
          })
          .catch(err => setErrorMsg('บันทึกขึ้น Supabase ล้มเหลว: ' + err.message));
        
      } catch (err) { setErrorMsg(err.message); }
    };
    reader.onerror = () => setErrorMsg("เกิดข้อผิดพลาดในการอ่านไฟล์ Log");
    reader.readAsText(file, 'utf-8'); 
    e.target.value = '';
  };


  const isMatch = useCallback((locationId) => {
    if (!searchTerm) return false;
    const term = searchTerm.toLowerCase();
    if (locationId.toLowerCase().includes(term)) return true;
    
    const items = inventory[locationId];
    if (items) {
      return items.some(item => 
        item.name.toLowerCase().includes(term) || 
        (item.code && item.code.toLowerCase().includes(term)) ||
        (item.lot && item.lot.toLowerCase().includes(term)) ||
        (item.invoice && item.invoice.toLowerCase().includes(term))
      );
    }
    return false;
  }, [searchTerm, inventory]);

  const { filteredLayout, filteredOtherZones } = useMemo(() => {
    if (!searchTerm) return { filteredLayout: layout, filteredOtherZones: otherZones };

    const fl = {};
    const fo = {};

    Object.keys(layout).forEach(cab => {
      Object.keys(layout[cab]).forEach(lev => {
        const matchedSlots = layout[cab][lev].filter(slot => isMatch(slot.id));
        if (matchedSlots.length > 0) {
          if (!fl[cab]) fl[cab] = {};
          fl[cab][lev] = matchedSlots;
        }
      });
    });

    Object.keys(otherZones).forEach(zone => {
      if (isMatch(zone)) {
        fo[zone] = otherZones[zone];
      }
    });

    return { filteredLayout: fl, filteredOtherZones: fo };
  }, [layout, otherZones, searchTerm, isMatch]);

  // Zone tab helpers
  const zoneKeys = useMemo(() => Object.keys(filteredLayout).sort(), [filteredLayout]);
  const activeZoneKey = useMemo(() => {
    if (activeZone === '__other__') return '__other__';
    if (activeZone && zoneKeys.includes(activeZone)) return activeZone;
    return zoneKeys[0] || null;
  }, [activeZone, zoneKeys]);

  const toggleLevel = useCallback((cab, lev) => {
    const key = `${cab}-${lev}`;
    setCollapsedLevels(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handleLocationClick = (locationId) => {
    const allItems = inventory[locationId] || [];
    const filtered = allItems.filter(item => {
      const qty = parseFloat(String(item.qty || '0').replace(/,/g, '')) || 0;
      return qty > 0;
    });
    // เรียงลำดับ exp ใกล้หมดก่อน (ascending) — ไม่มี exp อยู่ล่างสุด
    filtered.sort((a, b) => {
      const da = parseDateString(a.exp);
      const db = parseDateString(b.exp);
      if (da && db) return da - db;
      if (da) return -1;
      if (db) return 1;
      return 0;
    });
    setSelectedLocation({
      id: locationId,
      items: filtered,
    });
    setExpandedDetailsId(null);
  };

  const toggleDetails = (id) => {
    setExpandedDetailsId(expandedDetailsId === id ? null : id);
  };

  const Slot = ({ id }) => {
    // ซ่อน qty=0 จากแผนผัง — ข้อมูลยังอยู่ใน inventory state เพื่อคำนวณ low-stock alert
    const visibleItems = (inventory[id] || []).filter(item => {
      const qty = parseFloat(String(item.qty || '0').replace(/,/g, '')) || 0;
      return qty > 0;
    });
    const itemCount = visibleItems.length;
    const highlighted = isMatch(id);

    let hasExpired = false;
    let hasNearExpiry = false;

    visibleItems.forEach(item => {
       const qty = parseFloat(String(item.qty || '0').replace(/,/g, '')) || 0;
       if (qty === 0) return; // qty=0 ไม่มียาในคลังแล้ว ไม่ต้องเตือน
       const d = parseDateString(item.exp);
       if (!d) return;
       d.setHours(0,0,0,0);
       if (d < todayForDisplay) hasExpired = true;
       else if (d <= targetDateForDisplay) hasNearExpiry = true;
    });

    const isEmpty = itemCount === 0;

    // Heatmap square: ว่าง = จาง+dashed, มีของ = indigo เข้มตามความหนาแน่น
    // expiry override: ใกล้หมด = amber, หมดแล้ว = rose
    let fill   = 'bg-indigo-400';
    let border = 'border-indigo-200';
    let ring   = 'hover:ring-2 hover:ring-indigo-300';
    let StatusIcon = null;

    const opacity = itemCount <= 2 ? 0.45 : itemCount <= 6 ? 0.65 : itemCount <= 12 ? 0.85 : 1;

    if (isEmpty) {
      fill   = 'bg-slate-100';
      border = 'border-slate-200 border-dashed';
      ring   = 'hover:ring-2 hover:ring-slate-300';
    } else if (hasExpired) {
      fill   = 'bg-rose-500';
      border = 'border-rose-200';
      ring   = 'hover:ring-2 hover:ring-rose-300';
      StatusIcon = <AlertTriangle size={11} className="absolute -top-1 -right-1 text-rose-600 bg-white rounded-full drop-shadow" />;
    } else if (hasNearExpiry) {
      fill   = 'bg-amber-500';
      border = 'border-amber-200';
      ring   = 'hover:ring-2 hover:ring-amber-300';
      StatusIcon = <Clock size={11} className="absolute -top-1 -right-1 text-amber-600 bg-white rounded-full drop-shadow" />;
    }

    // รายการยาสำหรับ tooltip (สูงสุด 4 รายการ)
    const previewItems = visibleItems.slice(0, 4);

    return (
      <div className="relative group/slot">
        <button
          onClick={() => handleLocationClick(id)}
          aria-label={`ตำแหน่ง ${id} — ${itemCount} รายการ`}
          className={`
            relative cursor-pointer transition-all duration-150 border rounded-lg
            w-9 h-9 shrink-0 ${border} ${ring}
            ${highlighted
              ? 'ring-4 ring-yellow-400 scale-110 z-10 shadow-lg'
              : 'hover:scale-110 active:scale-95'}
          `}
        >
          <span className={`absolute inset-0 rounded-lg ${fill}`} style={!isEmpty && !hasExpired && !hasNearExpiry ? { opacity } : undefined} />
          {StatusIcon}
        </button>

        {/* Hover tooltip — รหัสตำแหน่ง + รายการยา */}
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-30 w-max max-w-[220px]
          opacity-0 group-hover/slot:opacity-100 transition-opacity duration-150">
          <div className="bg-indigo-600 text-white rounded-xl shadow-xl px-3 py-2 text-left">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold tracking-wide">{id}</span>
              <span className="text-[10px] font-semibold bg-white/20 rounded-full px-2 py-0.5">{itemCount} รายการ</span>
            </div>
            {isEmpty ? (
              <p className="text-[11px] text-indigo-100 mt-1">ช่องว่าง</p>
            ) : (
              <div className="mt-1.5 space-y-0.5">
                {previewItems.map((it, i) => (
                  <p key={i} className="text-[11px] text-indigo-50 leading-tight truncate">• {it.name || it.code || '-'}</p>
                ))}
                {itemCount > previewItems.length && (
                  <p className="text-[10px] text-indigo-200 mt-0.5">+ อีก {itemCount - previewItems.length} รายการ</p>
                )}
              </div>
            )}
          </div>
          <div className="w-2 h-2 bg-indigo-600 rotate-45 mx-auto -mt-1" />
        </div>
      </div>
    );
  };

  const renderItemCard = (item, idx, locationId = null) => {
    const uniqueItemId = `card-${locationId || 'search'}-${item.name}-${idx}`;
    const isExpanded = expandedDetailsId === uniqueItemId;
    
    const lookupCode = item.code?.trim().toLowerCase() || '-';
    const lookupLot = item.lot?.trim().toLowerCase() || '-';
    const lookupInvoice = item.invoice?.trim().toLowerCase() || '-';
    const lookupType = item.type?.trim().toLowerCase() || '';
    const lookupName = item.name?.trim().toLowerCase() || '';

    // 1) exact: code|lot|invoice
    const exactKey = `${lookupCode}|${lookupLot}|${lookupInvoice}`;
    const exactMatch = drugDetails[exactKey];

    // 2) fallback: code + lot + type + name
    // 3) fallback: code + lot
    // 4) fallback: name + lot
    let allMatchedDetails;
    if (exactMatch) {
      allMatchedDetails = [exactMatch];
    } else {
      const typeNameMatches = Object.values(drugDetails).filter(d =>
        d._code?.toLowerCase() === lookupCode &&
        d._lot?.toLowerCase() === lookupLot &&
        d._drug_type?.trim().toLowerCase() === lookupType &&
        d._name?.trim().toLowerCase() === lookupName
      );
      if (typeNameMatches.length > 0) {
        allMatchedDetails = typeNameMatches;
      } else {
        const codeLotMatches = Object.values(drugDetails).filter(d =>
          d._code?.toLowerCase() === lookupCode &&
          d._lot?.toLowerCase() === lookupLot
        );
        if (codeLotMatches.length > 0) {
          allMatchedDetails = codeLotMatches;
        } else {
          allMatchedDetails = Object.values(drugDetails).filter(d =>
            d._name?.trim().toLowerCase() === lookupName &&
            d._lot?.toLowerCase() === lookupLot
          );
        }
      }
    }

    const hasReceiveMatch = allMatchedDetails.length > 0;

    const expDate = parseDateString(item.exp);
    let expColorClass = "text-slate-700 font-medium";
    let expBgClass = "bg-slate-50 border-slate-100";
    let expIcon = null;

    if (expDate) {
      expDate.setHours(0,0,0,0);
      if (expDate < todayForDisplay) {
        expColorClass = "text-rose-700 font-bold";
        expBgClass = "bg-rose-50 border-rose-200 shadow-sm";
        expIcon = <AlertTriangle size={14} className="inline mr-1 text-rose-600" />;
      } else if (expDate <= targetDateForDisplay) {
        expColorClass = "text-amber-700 font-bold";
        expBgClass = "bg-amber-50 border-amber-200 shadow-sm";
        expIcon = <Clock size={14} className="inline mr-1 text-amber-600" />;
      } else {
        expColorClass = "text-emerald-700 font-bold";
        expBgClass = "bg-emerald-50 border-emerald-100";
      }
    }

    const isPendingStatus = String(item.receiveStatus || '').includes('รอตรวจรับ') || item.isPending;

    // คำนวณระยะเวลารอตรวจรับ — ใช้วันที่รับยาจาก receive_log ที่ยังไม่มี inspect_date
    let waitTimeStr = null;
    if (isPendingStatus && allMatchedDetails.length > 0) {
      const pendingDetail = allMatchedDetails.find(d => !d.inspect_date);
      if (pendingDetail?.receive_date) {
        const diffDays = Math.floor((new Date().setHours(0,0,0,0) - new Date(pendingDetail.receive_date).setHours(0,0,0,0)) / 86400000);
        if (diffDays > 0) {
          const months = Math.floor(diffDays / 30);
          const days   = diffDays % 30;
          waitTimeStr  = months > 0 && days > 0 ? `${months} เดือน ${days} วัน`
                       : months > 0              ? `${months} เดือน`
                       :                           `${days} วัน`;
        }
      }
    }

    return (
      <div key={uniqueItemId} className={`bg-white border ${isPendingStatus ? 'border-sky-300 bg-sky-50/40 border-dashed' : 'border-slate-200'} shadow-sm rounded-xl p-5 hover:border-indigo-300 transition-colors`}>
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <div className={`p-3 rounded-xl shrink-0 shadow-inner mt-1 ${isPendingStatus ? 'bg-sky-100 text-sky-600' : 'bg-indigo-50 text-indigo-600'}`}>
            {isPendingStatus ? <Package size={32} /> : <Pill size={32} />}
          </div>
          
          <div className="w-full">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
              <div>
                <h4 className="font-bold text-slate-800 text-lg leading-tight mb-2">
                  {item.code && item.code !== '-' && <span className="text-indigo-600 mr-2">[{item.code}]</span>}
                  {item.name}
                  {item.type && <span className="ml-2 align-middle"><DrugTypeBadge type={item.type} /></span>}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {locationId && (
                    <span className="inline-flex items-center gap-1.5 bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold border border-indigo-200">
                      <MapPin size={14} /> ตำแหน่งจัดเก็บ: {locationId}
                    </span>
                  )}
                  {isPendingStatus && (
                    <span className="inline-flex items-center gap-1.5 bg-sky-100 text-sky-800 px-3 py-1 rounded-full text-xs font-bold border border-sky-200">
                      <Package size={14} /> สถานะ: รอตรวจรับ
                    </span>
                  )}
                  {isPendingStatus && waitTimeStr && (
                    <span className="inline-flex items-center gap-1.5 bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs font-bold border border-orange-200">
                      <Clock size={14} /> รอตรวจรับมา {waitTimeStr}
                    </span>
                  )}
                  {!isPendingStatus && item.receiveStatus && item.receiveStatus !== 'ไม่มีการดำเนินการ' && (
                    <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">
                      <Check size={14} /> สถานะ: {item.receiveStatus}
                    </span>
                  )}
                </div>
              </div>
              
              <button
                onClick={() => toggleDetails(uniqueItemId)}
                className={`shrink-0 inline-flex items-center justify-center gap-1.5 min-w-[140px] px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  isExpanded
                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                    : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 cursor-pointer'
                }`}
              >
                <FileText size={16} /> รายละเอียด
                {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              <div className="bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-100">
                <div className="text-[11px] text-slate-500 uppercase font-bold tracking-wider mb-1">ชนิด/หน่วย</div>
                <div className="text-sm font-medium text-slate-700">{item.type} <span className="text-slate-400">({item.unit})</span></div>
              </div>
              <div className={`${item.isPending ? 'bg-sky-50 border-sky-100' : 'bg-slate-50 border-slate-100'} px-3 py-2.5 rounded-lg border`}>
                <div className="text-[11px] text-slate-500 uppercase font-bold tracking-wider mb-1">
                  {item.isPending && item.qtyReceived != null ? 'จำนวนที่รับ' : 'จำนวนคงเหลือ'}
                </div>
                <div className={`text-sm font-black ${item.isPending ? 'text-sky-700' : 'text-slate-700'}`}>
                  {item.isPending && item.qtyReceived != null ? item.qtyReceived : item.qty}
                </div>
              </div>
              <div className="bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-100">
                <div className="text-[11px] text-slate-500 uppercase font-bold tracking-wider mb-1">Lot Number</div>
                <div className="text-sm font-medium text-slate-700">{item.lot}</div>
              </div>
              <div className="bg-indigo-50 px-3 py-2.5 rounded-lg border border-indigo-100">
                <div className="text-[11px] text-indigo-500 uppercase font-bold tracking-wider mb-1">เลขที่บิลซื้อ</div>
                <div className="text-sm font-medium text-indigo-700">{item.invoice}</div>
              </div>
              <div className={`px-3 py-2.5 rounded-lg border ${expBgClass}`}>
                <div className="text-[11px] opacity-70 uppercase font-bold tracking-wider mb-1">Exp Date</div>
                <div className={`text-sm ${expColorClass}`}>
                  {expIcon}
                  {formatDateDisplay(item.exp)}
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="mt-4">
                <div className="bg-teal-50/50 rounded-xl p-4 border border-teal-100 relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 text-teal-100/50 opacity-50"><Database size={100} /></div>
                  <h5 className="font-bold text-teal-800 flex items-center gap-2 mb-3 relative z-10 border-b border-teal-200/50 pb-2">
                    <FileText size={18} /> ข้อมูลอ้างอิงจากประวัติรับยา
                    {!hasReceiveMatch && (
                      <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">ไม่พบใน receive log</span>
                    )}
                  </h5>
                  <div className="relative z-10 space-y-3">
                    {hasReceiveMatch ? allMatchedDetails.map((d, idx) => (
                      <div key={idx}>
                        {allMatchedDetails.length > 1 && (
                          <p className="text-xs text-teal-600 font-medium mb-2">บิล {idx + 1}/{allMatchedDetails.length} — {normalizeNumericText(d._invoice) || '-'}</p>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-3">
                          {[
                            { label: 'วันที่รับยา',      val: isoToThai(d.receive_date) },
                            { label: 'จำนวนที่รับ',      val: d.qty_received != null ? String(d.qty_received) : null },
                            { label: 'บริษัทปัจจุบัน',  val: d.supplier_current || d._company },
                            { label: 'บริษัทก่อนหน้า',  val: d.supplier_prev },
                            { label: 'สถานะตรวจรับ',    val: d.receive_status },
                            { label: 'วันที่ตรวจรับ',   val: isoToThai(d.inspect_date) },
                            { label: 'สถานะการซื้อ',    val: d.purchase_type },
                          ].map(({ label, val }) => (
                            <div key={label} className="flex flex-col">
                              <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wide">{label}</span>
                              <span className="text-sm text-slate-700 mt-0.5">{val || '-'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wide">บริษัท</span>
                          <span className="text-sm text-slate-400 mt-0.5 italic">ไม่มีข้อมูล</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wide">ราคา/หน่วย (บาท)</span>
                          <span className="text-sm text-slate-400 mt-0.5 italic">ไม่มีข้อมูล</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wide">เลขที่บิล</span>
                          <span className="text-sm font-medium text-indigo-700 mt-0.5">{normalizeNumericText(item.invoice) || '-'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const getModalConfig = () => {
    if (expiryViewFilter === 'expired') return { bg: 'bg-rose-700', text: 'text-rose-200', icon: AlertTriangle, title: 'รายการยาหมดอายุแล้ว', list: expiredItems };
    if (expiryViewFilter === 'near') return { bg: 'bg-amber-600', text: 'text-amber-200', icon: Clock, title: 'รายการยาใกล้หมดอายุ (ภายใน 1 ปี 4 เดือน)', list: [...expiredItems, ...nearExpiryItems] };
    if (expiryViewFilter === 'pending') return { bg: 'bg-sky-600', text: 'text-sky-200', icon: Package, title: 'รายการยารอตรวจรับ (อ้างอิงสถานะจาก Log คลัง)', list: pendingReceiveItems };
    return { bg: '', text: '', icon: null, title: '', list: [] };
  };
  const trackingModal = getModalConfig();
  const TrackingModalIcon = trackingModal.icon;



  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">

      {/* ── Top header bar ── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          {/* ปุ่มกลับเดิมเอาออก — sidebar (AppShell) คุม navigation */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center shrink-0">
              <Database size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800 leading-tight cursor-pointer hover:text-sky-600 transition-colors" onClick={onRefresh}>
                ระบบแผนผังและข้อมูลคลังยา
              </h1>
              {logUpdateDate && (
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock size={10}/> อัพเดตล่าสุด: <span className="font-medium text-slate-500">{formatDateTime(logUpdateDate)}</span>
                </p>
              )}
            </div>
          </div>
        </div>
        {/* Manage dropdown in header */}
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSummaryModal(true)} className="flex items-center gap-1.5 bg-white border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
            <BarChart3 size={15}/><span className="hidden sm:inline">สรุปข้อมูล</span>
          </button>
          <div className="relative">
            <button onClick={() => setShowManageMenu(v => !v)}
              className="flex items-center gap-1.5 bg-white border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
              จัดการข้อมูล <ChevronDown size={14} className={`transition-transform ${showManageMenu ? 'rotate-180' : ''}`}/>
            </button>
            {showManageMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1 min-w-[200px]">
                <button onClick={() => { handleInventoryExport(); setShowManageMenu(false); }}
                  disabled={exportLoading || Object.keys(inventory).length === 0}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors disabled:opacity-40">
                  <FileDown size={15}/> {exportLoading ? 'กำลังส่งออก...' : 'Export Excel'}
                </button>
                {isStaff && <>
                  <div className="border-t border-slate-100 my-1"/>
                  <button onClick={() => { logInputRef.current?.click(); setShowManageMenu(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
                    <UploadCloud size={15}/> อัปโหลด Log คลัง
                  </button>
                  <button onClick={() => { setShowColumnGuide(showColumnGuide === 'log' ? null : 'log'); setShowManageMenu(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors">
                    ดูหัวคอลัมน์ที่รองรับ
                  </button>
                  <button onClick={() => { receiveInputRef.current?.click(); setShowManageMenu(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
                    <UploadCloud size={15}/> อัปโหลดประวัติรับยา
                  </button>
                </>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 space-y-4">

        {/* ── Alert stat cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div onClick={() => expiredItems.length > 0 && setExpiryViewFilter('expired')}
            className={`bg-white rounded-2xl border-2 p-4 transition-all shadow-sm ${expiredItems.length > 0 ? 'border-red-200 hover:border-red-400 cursor-pointer hover:shadow-md' : 'border-slate-100 opacity-60'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertTriangle size={16} className={expiredItems.length > 0 ? 'text-red-500' : 'text-slate-300'}/>
              </div>
              <span className={`text-2xl font-black ${expiredItems.length > 0 ? 'text-red-600' : 'text-slate-300'}`}>{expiredItems.length}</span>
            </div>
            <p className={`text-xs font-semibold ${expiredItems.length > 0 ? 'text-red-500' : 'text-slate-400'}`}>หมดอายุแล้ว</p>
          </div>

          <div onClick={() => nearExpiryItems.length > 0 && setExpiryViewFilter('near')}
            className={`bg-white rounded-2xl border-2 p-4 transition-all shadow-sm ${nearExpiryItems.length > 0 ? 'border-amber-200 hover:border-amber-400 cursor-pointer hover:shadow-md' : 'border-slate-100 opacity-60'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                <Clock size={16} className={nearExpiryItems.length > 0 ? 'text-amber-500' : 'text-slate-300'}/>
              </div>
              <span className={`text-2xl font-black ${nearExpiryItems.length > 0 ? 'text-amber-600' : 'text-slate-300'}`}>{nearExpiryItems.length}</span>
            </div>
            <p className={`text-xs font-semibold ${nearExpiryItems.length > 0 ? 'text-amber-500' : 'text-slate-400'}`}>ใกล้หมดอายุ (16 เดือน)</p>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">{formatDateDisplay(todayForDisplay)} – {formatDateDisplay(targetDateForDisplay)}</p>
          </div>

          <div onClick={() => pendingReceiveItems.length > 0 && setExpiryViewFilter('pending')}
            className={`bg-white rounded-2xl border-2 p-4 transition-all shadow-sm ${pendingReceiveItems.length > 0 ? 'border-sky-200 hover:border-sky-400 cursor-pointer hover:shadow-md' : 'border-slate-100 opacity-60'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center">
                <Package size={16} className={pendingReceiveItems.length > 0 ? 'text-sky-500' : 'text-slate-300'}/>
              </div>
              <span className={`text-2xl font-black ${pendingReceiveItems.length > 0 ? 'text-sky-600' : 'text-slate-300'}`}>{pendingReceiveItems.length}</span>
            </div>
            <p className={`text-xs font-semibold ${pendingReceiveItems.length > 0 ? 'text-sky-500' : 'text-slate-400'}`}>รอตรวจรับ</p>
          </div>

          {isStaff ? (
            <div onClick={() => onNavigate && onNavigate('reorder')}
              className={`bg-white rounded-2xl border-2 p-4 transition-all shadow-sm cursor-pointer hover:shadow-md ${lowStockItems.length > 0 ? 'border-orange-200 hover:border-orange-400' : 'border-slate-100 hover:border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${lowStockItems.length > 0 ? 'bg-orange-100' : 'bg-slate-100'}`}>
                  <AlertTriangle size={16} className={lowStockItems.length > 0 ? 'text-orange-500' : 'text-slate-300'}/>
                </div>
                <span className={`text-2xl font-black ${lowStockItems.length > 0 ? 'text-orange-600' : 'text-slate-300'}`}>{lowStockItems.length}</span>
              </div>
              <p className={`text-xs font-semibold ${lowStockItems.length > 0 ? 'text-orange-500' : 'text-slate-400'}`}>ต่ำกว่าจุดสั่งซื้อ</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border-2 border-slate-100 p-4 shadow-sm opacity-40">
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                  <AlertCircle size={16} className="text-slate-300"/>
                </div>
                <span className="text-2xl font-black text-slate-300">—</span>
              </div>
              <p className="text-xs font-semibold text-slate-400">ต่ำกว่าจุดสั่งซื้อ</p>
            </div>
          )}
        </div>

        {/* ── Search + hidden file inputs ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex gap-2 items-stretch">
            <DrugSearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              options={drugNamesList}
              placeholder="ค้นหาชื่อยา, รหัส, ตำแหน่ง, Lot, บิล..."
              ringClass="focus:ring-indigo-500"
              hoverClass="hover:bg-indigo-50 hover:text-indigo-700"
              className="flex-1"
              inputClassName="py-2.5"
            />
          </div>

          {/* Hidden file inputs */}
          {isStaff && <>
            <input type="file" accept=".csv, text/csv, application/csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ref={logInputRef} onChange={handleLogFileUpload} className="hidden"/>
            <input type="file" accept=".csv, text/csv, application/csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ref={receiveInputRef} onChange={handleReceiveFileUpload} className="hidden"/>
            <p className="text-[11px] text-slate-400">*อัปโหลดได้เฉพาะไฟล์ .csv (หากบันทึกจาก Excel ในมือถือ ให้บันทึกเป็น CSV ก่อน)</p>
          </>}

          {/* Column Guide Popup */}
          {showColumnGuide && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold text-slate-700">
                  {showColumnGuide === 'log' ? 'หัวคอลัมน์ที่รองรับ — ไฟล์ Log คลังยา' : 'หัวคอลัมน์ที่รองรับ — ไฟล์ข้อมูลยา'}
                </p>
                <button onClick={() => setShowColumnGuide(null)} className="text-slate-400 hover:text-slate-700"><X size={14}/></button>
              </div>
              <p className="text-xs text-slate-400">ชื่อหัวคอลัมน์ใน CSV ต้องตรงกับชื่อด้านล่าง (ไม่ต้องครบทุก column)</p>
              <div className="flex flex-wrap gap-2">
                {(showColumnGuide === 'log' ? [
                  { label: 'ตำแหน่งจัดเก็บ',  req: true,  hints: ['DetailedLog', 'ตำแหน่ง', 'location'] },
                  { label: 'ชื่อยา',            req: true,  hints: ['รายการยา', 'ชื่อยา'] },
                  { label: 'คงเหลือ',           req: true,  hints: ['คงเหลือ', 'qty'] },
                  { label: 'รหัสยา',            req: false, hints: ['รหัส', 'รหัสยา', 'code'] },
                  { label: 'รูปแบบยา',          req: false, hints: ['ชนิด', 'type'] },
                  { label: 'หน่วยนับ',          req: false, hints: ['หน่วย', 'unit_label'] },
                  { label: 'Lot Number',        req: false, hints: ['Lot Number', 'lot', 'lot.'] },
                  { label: 'Exp',               req: false, hints: ['Exp', 'exp.', 'วันหมดอายุ'] },
                  { label: 'ราคา/หน่วย',        req: false, hints: ['ราคา/หน่วย', 'ราคาต่อหน่วย'] },
                  { label: 'ชนิดรายการ',        req: false, hints: ['ชนิดรายการ', 'item_type'] },
                  { label: 'บริษัท',            req: false, hints: ['บริษัทยา', 'บริษัท'] },
                  { label: 'เลขบิล',            req: false, hints: ['เลขที่บิลซื้อ', 'เลขบิล'] },
                  { label: 'Safety Stock',      req: false, hints: ['Safety Stock', 'safety_stock'] },
                  { label: 'Lead Time',         req: false, hints: ['Lead Time', 'leadtime'] },
                  { label: 'ผลการพิจารณา',      req: false, hints: ['ผลการพิจารณา'] },
                  { label: 'สถานะตรวจรับ',      req: false, hints: ['สถานะตรวจรับ', 'สถานะ'] },
                  { label: 'MainLog',           req: false, hints: ['MainLog', 'main_log'] },
                ] : [
                  { label: 'รหัสยา',            req: true,  hints: ['รหัส', 'รหัสยา', 'code'] },
                  { label: 'ชื่อยา',            req: false, hints: ['รายการยา', 'ชื่อยา'] },
                  { label: 'Safety Stock',      req: false, hints: ['Safety Stock', 'safety_stock'] },
                  { label: 'Lead Time',         req: false, hints: ['Sum of Lead Time (In days)', 'Lead Time (In days)', 'lead time'] },
                  { label: 'Lot Number',        req: false, hints: ['Lot Number', 'lot'] },
                  { label: 'เลขบิล',            req: false, hints: ['เลขที่บิลซื้อ', 'invoice'] },
                  { label: 'Exp',               req: false, hints: ['Exp', 'exp date'] },
                  { label: 'ผลการพิจารณา',      req: false, hints: ['ผลการพิจารณา'] },
                ]).map(({ label, req, hints }) => (
                  <div key={label} className="bg-white rounded-xl px-3 py-2 border border-slate-200">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">{label}</span>
                      {req && <span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full">จำเป็น</span>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {hints.map(h => (
                        <code key={h} className="text-[10px] bg-slate-50 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-mono whitespace-nowrap">{h}</code>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {showColumnGuide === 'drug' && <p className="text-xs text-slate-400">💡 สามารถใช้ไฟล์ Log คลังยาไฟล์เดียวกันได้</p>}
            </div>
          )}
        </div>

        {/* Zone Tabs + Hide Empty Toggle */}
        {(zoneKeys.length > 0 || Object.keys(filteredOtherZones).length > 0) && (
          <div className="flex items-center gap-2 flex-wrap bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm">
            <div className="flex gap-1.5 flex-wrap flex-1 min-w-0">
              {zoneKeys.map(cab => (
                <button key={cab} onClick={() => setActiveZone(cab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${!searchTerm && activeZoneKey === cab ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'}`}>
                  Log {cab}
                  <span className="ml-1.5 opacity-70">({summary[cab]?.names.size || 0})</span>
                </button>
              ))}
              {Object.keys(filteredOtherZones).length > 0 && (
                <button onClick={() => setActiveZone('__other__')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${!searchTerm && activeZoneKey === '__other__' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'}`}>
                  โซนอื่นๆ
                  <span className="ml-1.5 opacity-70">({Object.keys(filteredOtherZones).length})</span>
                </button>
              )}
            </div>
            <button onClick={() => setHideEmptySlots(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all shrink-0 ${hideEmptySlots ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'}`}>
              {hideEmptySlots ? <EyeOff size={13}/> : <Eye size={13}/>} ซ่อนช่องว่าง
            </button>
          </div>
        )}

        {/* List of sections — % การใช้พื้นที่ต่อ zone (ซ่อนตอนค้นหา) */}
        {!searchTerm && sectionUsage.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-600"><Layers size={15} /></div>
                <span className="text-sm font-bold text-slate-700">รายการโซน</span>
                <span className="text-xs text-slate-400">% การใช้พื้นที่</span>
              </div>
              {/* Legend — ระดับการใช้พื้นที่ (ตาม % ของ slot ที่มีของ) */}
              <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-500" /> ว่าง/น้อย (&lt;60%)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500" /> ค่อนข้างเต็ม (60–85%)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-500" /> เกือบเต็ม (≥85%)</span>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {sectionUsage.map(({ cab, used, total, pct }) => {
                const barColor = pct >= 85 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-indigo-500';
                const isActive = !searchTerm && activeZoneKey === cab;
                return (
                  <button key={cab} onClick={() => setActiveZone(cab)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? 'bg-indigo-50/60' : 'hover:bg-slate-50'}`}>
                    <span className={`text-sm font-bold w-20 shrink-0 ${isActive ? 'text-indigo-700' : 'text-slate-700'}`}>Log {cab}</span>
                    <span className="text-xs text-slate-400 w-24 shrink-0 hidden sm:inline">ใช้ {used}/{total} ช่อง</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-bold text-slate-700 w-12 text-right shrink-0">{pct}%</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl border border-emerald-200 flex items-center gap-3 shadow-sm mb-6 animate-in fade-in slide-in-from-top-2">
            <Check size={20} className="text-emerald-500" /> <span className="font-medium">{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 flex items-center gap-3 shadow-sm mb-6">
            <AlertCircle size={20} /> <span className="font-medium">{errorMsg}</span>
          </div>
        )}

        {searchTerm && searchResults.length > 0 && (() => {
          const uniqueDrugs = new Set(searchResults.map(r => r.code && r.code !== '-' ? r.code : r.name)).size;
          const totalQty    = searchResults.reduce((s, r) => s + (parseFloat(String(r.qty || '0').replace(/,/g,'')) || 0), 0);
          return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
              <div className="bg-indigo-600 text-white py-3 px-5 flex flex-wrap justify-between items-center gap-2">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Search size={16}/> ผลการค้นหา: พบ {searchResults.length} Lot
                </h2>
                <div className="flex items-center gap-2 text-xs">
                  <span className="bg-white/20 rounded-full px-2.5 py-1 font-semibold">{uniqueDrugs} ชนิดยา</span>
                  <span className="bg-white/20 rounded-full px-2.5 py-1 font-semibold">รวม {totalQty.toLocaleString()} หน่วย</span>
                </div>
              </div>
              <div className="p-6 bg-slate-50/50 max-h-[600px] overflow-y-auto">
                <div className="grid grid-cols-1 gap-4">
                  {searchResults.map((item) => renderItemCard(item, item.originalIndex, item.location))}
                </div>
              </div>
            </div>
          );
        })()}

        {Object.keys(filteredLayout).length === 0 && Object.keys(filteredOtherZones).length === 0 && searchTerm ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 flex flex-col items-center justify-center text-slate-500">
            <Search size={48} className="text-slate-300 mb-4" />
            <h3 className="text-xl font-bold text-slate-700 mb-2">ไม่พบรายการที่ค้นหา</h3>
          </div>
        ) : Object.keys(inventory).length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border-2 border-dashed border-slate-200 p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
              <Database size={32} className="text-indigo-400"/>
            </div>
            <h3 className="text-xl font-bold text-slate-700 mb-1.5">ยังไม่มีข้อมูลในคลัง</h3>
            <p className="text-sm text-slate-500 mb-5 max-w-md">เริ่มต้นใช้งานด้วยการอัปโหลดไฟล์ Log คลังยา (CSV) เพื่อสร้างแผนผังตำแหน่งจัดเก็บอัตโนมัติ</p>
            {isStaff ? (
              <button onClick={() => logInputRef.current?.click()}
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm">
                <UploadCloud size={16}/> อัปโหลด Log คลังยา
              </button>
            ) : (
              <p className="text-xs text-slate-400 inline-flex items-center gap-1.5"><AlertCircle size={12}/> ติดต่อเจ้าหน้าที่คลังยาเพื่ออัปโหลดข้อมูล</p>
            )}
          </div>
        ) : (
          <>
            {searchTerm && searchResults.length > 0 && (
              <h3 className="text-lg font-bold text-slate-700 mb-2 flex items-center gap-2">
                <MapPin size={20} className="text-indigo-500" /> ตำแหน่งบนแผนผัง
              </h3>
            )}
            <div className="grid grid-cols-1 gap-6">
              {(searchTerm
                ? zoneKeys
                : (activeZoneKey && activeZoneKey !== '__other__' ? [activeZoneKey] : zoneKeys)
              ).filter(cab => filteredLayout[cab]).map(cabinet => (
                <div key={cabinet} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-indigo-600 text-white py-3 px-5 flex justify-between items-center">
                    <h2 className="text-sm font-bold flex items-center gap-2">
                      <Layers size={16}/> Log {cabinet}
                    </h2>
                    <div className="flex gap-2">
                      <span className="bg-white/20 px-2.5 py-1 rounded-full text-xs font-medium">
                        {summary[cabinet]?.names.size || 0} รายการยา
                      </span>
                      <span className="bg-white/20 px-2.5 py-1 rounded-full text-xs font-medium">
                        {summary[cabinet]?.lots.size || 0} Lot
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50/50 space-y-2">
                    {Object.keys(filteredLayout[cabinet]).sort((a, b) => Number(a) - Number(b)).map(level => {
                      const levelKey = `${cabinet}-${level}`;
                      const isCollapsed = collapsedLevels.has(levelKey);
                      const allSlots = filteredLayout[cabinet][level];
                      const displaySlots = hideEmptySlots
                        ? allSlots.filter(slot =>
                            (inventory[slot.id] || []).some(item =>
                              parseFloat(String(item.qty || '0').replace(/,/g, '')) > 0
                            )
                          )
                        : allSlots;
                      if (hideEmptySlots && displaySlots.length === 0) return null;
                      return (
                        <div key={levelKey}>
                          {/* Accordion header */}
                          <button
                            onClick={() => toggleLevel(cabinet, level)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors text-left"
                          >
                            <span className="text-sm font-bold text-slate-700">ชั้น {level}</span>
                            <span className="text-xs text-slate-400">{displaySlots.length} ช่อง</span>
                            <div className="flex-1" />
                            {isCollapsed
                              ? <ChevronDown size={14} className="text-slate-400 shrink-0" />
                              : <ChevronUp   size={14} className="text-slate-400 shrink-0" />
                            }
                          </button>
                          {!isCollapsed && (
                            <div className="flex flex-wrap gap-1.5 px-1 pt-2 pb-1">
                              {displaySlots.map(slot => <Slot key={slot.id} id={slot.id} />)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {(searchTerm || activeZoneKey === '__other__') && Object.keys(filteredOtherZones).length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6">
                <div className="bg-indigo-600 text-white py-3 px-5 flex justify-between items-center">
                  <h2 className="text-sm font-bold flex items-center gap-2">
                    <FileSpreadsheet size={16}/> โซนอื่นๆ หรือจัดเก็บแบบเหมาโซน
                  </h2>
                </div>
                <div className="p-6 bg-slate-50 flex flex-wrap gap-4">
                  {Object.keys(filteredOtherZones).sort().map(zone => (
                    <div key={zone} onClick={() => handleLocationClick(zone)} className={`cursor-pointer transition-all border border-emerald-300 rounded-xl flex flex-col items-center justify-center p-6 min-w-[200px] bg-white ${isMatch(zone) ? 'ring-4 ring-yellow-400 shadow-lg scale-105' : 'hover:shadow-md hover:scale-105'}`}>
                      <div className="text-xl font-bold mb-3 text-emerald-800 text-center">{zone}</div>
                      <div className="flex flex-col items-center gap-1.5 mt-1">
                        <span className="text-sm font-medium bg-emerald-100 text-emerald-800 px-4 py-1 rounded-full shadow-sm">{summary[zone]?.names.size || 0} รายการยา</span>
                        <span className="text-xs font-medium bg-emerald-50 text-emerald-600 px-3 py-0.5 rounded-full border border-emerald-200">{summary[zone]?.lots.size || 0} Lot</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}


      </div>

      {/* Upload Warning Modal */}
      {uploadWarnings && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="bg-amber-500 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <div>
                <p className="font-bold text-lg flex items-center gap-2"><AlertTriangle size={20}/> พบ Row ที่ไม่ผ่านเงื่อนไข</p>
                <p className="text-amber-100 text-sm">{uploadWarnings.type}: {uploadWarnings.fileName} — {uploadWarnings.rows.length} row มีปัญหา</p>
              </div>
              <button onClick={() => setUploadWarnings(null)} className="text-white/80 hover:text-white bg-white/20 hover:bg-white/30 p-2 rounded-xl transition-colors"><X size={16}/></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {uploadWarnings.rows.map((r, i) => (
                <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm">
                  <div className="flex gap-3 items-start">
                    <span className="font-mono bg-amber-200 text-amber-900 px-2 py-0.5 rounded text-xs font-bold shrink-0">Row {r.row}</span>
                    <div className="flex-1">
                      <span className="font-semibold text-slate-800">{r.name}</span>
                      {r.code && r.code !== '-' && <span className="text-slate-400 ml-2 text-xs">[{r.code}]</span>}
                      {r.location && <span className="text-slate-500 ml-2 text-xs inline-flex items-center gap-0.5"><MapPin size={11}/>{r.location}</span>}
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

      {showSummaryModal && (() => {
        const totalLogItems = expiredItems.length + nearExpiryItems.length + safeItems.length;
        const expPct   = totalLogItems > 0 ? (expiredItems.length / totalLogItems) * 100 : 0;
        const nearPct  = totalLogItems > 0 ? (nearExpiryItems.length / totalLogItems) * 100 : 0;
        const safePct  = 100 - expPct - nearPct;
        const donutStyle = {
          background: `conic-gradient(
            #ef4444 0% ${expPct}%,
            #f59e0b ${expPct}% ${expPct + nearPct}%,
            #10b981 ${expPct + nearPct}% 100%
          )`
        };

        // คำนวณ slot utilization ต่อ cabinet
        const slotStats = {};
        Object.entries(layout).forEach(([cab, levels]) => {
          let totalSlots = 0, usedSlots = 0;
          Object.values(levels).forEach(slots => {
            slots.forEach(slot => {
              totalSlots++;
              const items = inventory[slot.id] || [];
              const hasStock = items.some(it => (parseFloat(String(it.qty || '0').replace(/,/g, '')) || 0) > 0);
              if (hasStock) usedSlots++;
            });
          });
          slotStats[cab] = { totalSlots, usedSlots, utilPct: totalSlots > 0 ? (usedSlots / totalSlots) * 100 : 0 };
        });

        const summaryRows = Object.entries(summary).sort((a, b) => b[1].names.size - a[1].names.size);

        // Top 5 ใกล้หมดอายุ (รวม expired ที่ยังไม่ทิ้ง + near) เรียงตามวันหมดอายุ
        const topNearExpiry = [...expiredItems, ...nearExpiryItems]
          .filter(it => it.parsedExp)
          .sort((a, b) => a.parsedExp - b.parsedExp)
          .slice(0, 5);

        // Top 5 รายการคงเหลือมากที่สุด (group by code, sum qty)
        const stockByDrug = {};
        Object.entries(inventory).forEach(([loc, items]) => {
          items.forEach(it => {
            const qty = parseFloat(String(it.qty || '0').replace(/,/g, '')) || 0;
            const isDiscontinued = it.receiveStatus && String(it.receiveStatus).includes('ตัดออก');
            if (qty === 0 || isDiscontinued) return;
            const codeKey = (it.code && it.code !== '-') ? it.code.trim() : it.name.trim();
            if (!stockByDrug[codeKey]) stockByDrug[codeKey] = { code: it.code, name: it.name, unit: it.unit, type: it.type, qty: 0, locations: new Set() };
            stockByDrug[codeKey].qty += qty;
            stockByDrug[codeKey].locations.add(loc);
          });
        });
        const topStock = Object.values(stockByDrug).sort((a, b) => b.qty - a.qty).slice(0, 5);

        // Total slot util
        const totalUsed = Object.values(slotStats).reduce((s, v) => s + v.usedSlots, 0);
        const totalAvail = Object.values(slotStats).reduce((s, v) => s + v.totalSlots, 0);
        const totalUtilPct = totalAvail > 0 ? (totalUsed / totalAvail) * 100 : 0;

        const formatBaht = v => v >= 1000000 ? `${(v / 1000000).toFixed(2)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : Math.round(v).toLocaleString();

        const handleExportSummary = () => {
          const rows = summaryRows.map(([cab, data], i) => ({
            no: i + 1,
            location: `Log ${cab}`,
            drugs: data.names.size,
            lots: data.lots.size,
            total: data.total,
            value: Math.round(data.value || 0),
            slots: `${slotStats[cab]?.usedSlots || 0}/${slotStats[cab]?.totalSlots || 0}`,
            util: `${(slotStats[cab]?.utilPct || 0).toFixed(1)}%`,
          }));
          const cols = [
            { header: '#', key: 'no' },
            { header: 'พื้นที่จัดเก็บ', key: 'location' },
            { header: 'รายการยา (Unique)', key: 'drugs' },
            { header: 'จำนวน Lot', key: 'lots' },
            { header: 'Lot รวม', key: 'total' },
            { header: 'มูลค่า (บาท)', key: 'value' },
            { header: 'Slot ใช้/ทั้งหมด', key: 'slots' },
            { header: '% การใช้พื้นที่', key: 'util' },
          ];
          const dateStr = new Date().toISOString().split('T')[0];
          exportToExcel(rows, cols, 'สรุปคลังยา', `inventory_summary_${dateStr}.xlsx`, auth);
        };

        const showExpired = expiredItems.length > 0;
        const kpiCards = [
          { label: 'พื้นที่จัดเก็บ', value: totalCabinets, unit: 'แห่ง', icon: <MapPin size={18}/>, bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', val: 'text-indigo-900' },
          { label: 'รายการยา (Unique)', value: overallStats?.names || 0, unit: 'รายการ', icon: <Pill size={18}/>, bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', val: 'text-emerald-900' },
          { label: 'จำนวน Lot', value: overallStats?.lots || 0, unit: 'Lot', icon: <Layers size={18}/>, bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', val: 'text-sky-900' },
          { label: 'มูลค่าคงคลัง', value: formatBaht(overallStats?.value || 0), unit: 'บาท', icon: <FileSpreadsheet size={18}/>, bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', val: 'text-teal-900', raw: true },
          ...(showExpired ? [{ label: 'หมดอายุแล้ว', value: expiredItems.length, unit: 'รายการ', icon: <AlertTriangle size={18}/>, bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-700', val: 'text-rose-800' }] : []),
          { label: 'ใกล้หมดอายุ', value: nearExpiryItems.length, unit: 'รายการ', icon: <Clock size={18}/>, bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', val: 'text-amber-800' },
          { label: 'รอตรวจรับ', value: pendingReceiveItems.length, unit: 'รายการ', icon: <Package size={18}/>, bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', val: 'text-purple-900' },
        ];

        return (
          <div className="fixed inset-0 bg-slate-900/70 flex items-start justify-center z-50 p-4 pt-6 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col animate-in fade-in zoom-in duration-200 mb-6">

              {/* Header */}
              <div className="bg-indigo-600 px-5 py-4 flex justify-between items-center text-white shrink-0 rounded-t-2xl gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <BarChart3 size={20}/>
                  <div>
                    <h3 className="text-base font-bold leading-tight">สรุปข้อมูลคลังยา</h3>
                    {logUpdateDate && (
                      <p className="text-[11px] text-indigo-100 flex items-center gap-1 mt-0.5">
                        <Clock size={10}/> ข้อมูล ณ {formatDateTime(logUpdateDate)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleExportSummary}
                    className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                    <FileDown size={14}/> <span className="hidden sm:inline">Export Excel</span>
                  </button>
                  <button onClick={() => setShowSummaryModal(false)} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-colors">
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6 bg-slate-50/30">

                {/* KPI Cards */}
                <div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {kpiCards.map((k, i) => (
                      <div key={i} className={`${k.bg} border ${k.border} rounded-xl p-3.5 shadow-sm flex flex-col gap-0.5`}>
                        <div className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${k.text}`}>{k.icon}<span className="truncate">{k.label}</span></div>
                        <div className={`text-2xl font-black ${k.val} leading-tight mt-1`}>{k.raw ? k.value : k.value.toLocaleString()}</div>
                        <div className="text-[11px] text-slate-500">{k.unit}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                    <AlertCircle size={11}/> นับเฉพาะคงเหลือ &gt; 0 · ไม่รวมยาตัดออกจากบัญชี · มูลค่าคำนวณจากราคา/หน่วยล่าสุดใน receive_logs
                  </p>
                </div>

                {/* Donut + Drug Types */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* Donut: Expiry Status */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                      <CalendarDays size={18} className="text-rose-500" /> สถานะวันหมดอายุ
                    </h4>
                    <div className="flex items-center gap-6">
                      <div className="relative w-36 h-36 shrink-0">
                        <div className="w-full h-full rounded-full" style={donutStyle} />
                        <div className="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center shadow-inner">
                          <span className="text-xl font-black text-slate-800">{totalLogItems.toLocaleString()}</span>
                          <span className="text-[10px] text-slate-500 font-medium">รายการ</span>
                        </div>
                      </div>
                      <div className="space-y-3 flex-1">
                        {[
                          { color: 'bg-rose-500', label: 'หมดอายุแล้ว', count: expiredItems.length, pct: expPct },
                          { color: 'bg-amber-500', label: 'ใกล้หมดอายุ', count: nearExpiryItems.length, pct: nearPct },
                          { color: 'bg-emerald-500', label: 'ปกติ', count: safeItems.length, pct: safePct },
                        ].map((s, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full shrink-0 ${s.color}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                                <span>{s.label}</span>
                                <span className="font-bold">{s.count} <span className="text-slate-400 font-normal">({s.pct.toFixed(1)}%)</span></span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5">
                                <div className={`${s.color} h-1.5 rounded-full`} style={{ width: `${s.pct}%` }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Bar: Drug Types */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                      <Pill size={18} className="text-emerald-500" /> สัดส่วนรูปแบบยา
                    </h4>
                    <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1">
                      {typeStats.length > 0 ? typeStats.map(([type, count], i) => (
                        <div key={type}>
                          <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                            <span>{type}</span>
                            <span className="font-bold text-slate-700">{count} รายการ</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-2 rounded-full"
                              style={{
                                width: `${maxTypeCount > 0 ? (count / maxTypeCount) * 100 : 0}%`,
                                background: `hsl(${160 - i * 18}, 65%, 45%)`
                              }}
                            />
                          </div>
                        </div>
                      )) : (
                        <div className="text-sm text-slate-400 text-center py-8"><AlertCircle size={20} className="mx-auto mb-2 opacity-40"/> ไม่มีข้อมูลชนิดยา</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Top 5 Panels */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* Top 5 Near-Expiry */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                      <Clock size={18} className="text-amber-500" /> Top 5 Lot ใกล้/หมดอายุที่สุด
                    </h4>
                    {topNearExpiry.length > 0 ? (
                      <div className="space-y-2">
                        {topNearExpiry.map((it, i) => {
                          const isExpired = it.parsedExp < todayForDisplay;
                          return (
                            <div key={i} onClick={() => { setShowSummaryModal(false); handleLocationClick(it.location); }}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors border ${isExpired ? 'bg-rose-50 border-rose-200 hover:bg-rose-100' : 'bg-amber-50 border-amber-200 hover:bg-amber-100'}`}>
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${isExpired ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'}`}>{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-slate-800 truncate">{it.name}</div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center gap-0.5"><MapPin size={9}/>{it.location}</span>
                                  <span>· Lot {it.lot}</span>
                                  <span>· คงเหลือ {it.qty}</span>
                                </div>
                              </div>
                              <span className={`text-xs font-bold shrink-0 ${isExpired ? 'text-rose-700' : 'text-amber-700'}`}>{formatDateDisplay(it.parsedExp)}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400 text-center py-6"><Check size={20} className="mx-auto mb-2 text-emerald-400"/> ไม่มียาใกล้หมดอายุ</div>
                    )}
                  </div>

                  {/* Top 5 High Stock */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                      <Package size={18} className="text-sky-500" /> Top 5 รายการคงเหลือสูงสุด
                    </h4>
                    {topStock.length > 0 ? (
                      <div className="space-y-2">
                        {topStock.map((s, i) => (
                          <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-sky-50 border border-sky-100">
                            <span className="w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs font-black shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-slate-800 truncate">{s.name}</div>
                              <div className="text-[11px] text-slate-500">{s.code && s.code !== '-' ? `[${s.code}] · ` : ''}{s.type || '-'} · {s.locations.size} ตำแหน่ง</div>
                            </div>
                            <span className="text-sm font-black text-sky-700 shrink-0">{s.qty.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">{s.unit || ''}</span></span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400 text-center py-6"><AlertCircle size={20} className="mx-auto mb-2 opacity-40"/> ยังไม่มีข้อมูล</div>
                    )}
                  </div>
                </div>

                {/* Storage Areas — Toggle view */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3 flex-wrap gap-2">
                    <h4 className="font-bold text-slate-700 flex items-center gap-2">
                      <Layers size={18} className="text-indigo-500" /> รายละเอียดตามพื้นที่จัดเก็บ
                      {totalAvail > 0 && (
                        <span className="text-[11px] font-normal text-slate-500 ml-2">
                          (ใช้งาน {totalUsed}/{totalAvail} ช่อง · {totalUtilPct.toFixed(0)}%)
                        </span>
                      )}
                    </h4>
                    <div className="inline-flex gap-1 bg-slate-100 p-0.5 rounded-lg">
                      <button onClick={() => setSummaryStorageView('chart')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${summaryStorageView === 'chart' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        <BarChart3 size={12}/> กราฟ
                      </button>
                      <button onClick={() => setSummaryStorageView('table')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${summaryStorageView === 'table' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        <Database size={12}/> ตาราง
                      </button>
                    </div>
                  </div>

                  {summaryStorageView === 'chart' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 max-h-[260px] overflow-y-auto pr-1">
                      {summaryRows.map(([cab, data]) => {
                        const util = slotStats[cab]?.utilPct || 0;
                        return (
                          <div key={cab}>
                            <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                              <span className="flex items-center gap-1"><MapPin size={11} className="opacity-40"/> Log {cab}</span>
                              <span className="font-bold text-slate-700">{data.names.size} รายการ <span className="text-slate-400 font-normal">· {data.lots.size} Lot</span></span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${maxLogCount > 0 ? (data.names.size / maxLogCount) * 100 : 0}%` }}/>
                            </div>
                            {slotStats[cab] && slotStats[cab].totalSlots > 0 && (
                              <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400">
                                <span>Slot ใช้งาน {slotStats[cab].usedSlots}/{slotStats[cab].totalSlots}</span>
                                <div className="flex-1 bg-slate-100 rounded-full h-1 overflow-hidden">
                                  <div className={`h-1 rounded-full ${util >= 85 ? 'bg-rose-400' : util >= 60 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${util}%` }}/>
                                </div>
                                <span className="font-bold">{util.toFixed(0)}%</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[300px] overflow-y-auto -mx-5 -mb-5">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-100 text-slate-600 text-xs uppercase tracking-wide">
                          <tr>
                            <th className="px-4 py-3 text-left font-bold">#</th>
                            <th className="px-4 py-3 text-left font-bold">พื้นที่</th>
                            <th className="px-4 py-3 text-right font-bold">รายการยา</th>
                            <th className="px-4 py-3 text-right font-bold">Lot</th>
                            <th className="px-4 py-3 text-right font-bold">มูลค่า</th>
                            <th className="px-4 py-3 text-right font-bold">Slot</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {summaryRows.map(([cab, data], i) => {
                            const util = slotStats[cab]?.utilPct || 0;
                            return (
                              <tr key={cab} className={`hover:bg-indigo-50/50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                                <td className="px-4 py-3 text-slate-400 text-xs font-medium">{i + 1}</td>
                                <td className="px-4 py-3 font-semibold text-slate-800 flex items-center gap-1.5">
                                  <MapPin size={13} className="text-indigo-400 shrink-0"/> Log {cab}
                                </td>
                                <td className="px-4 py-3 text-right font-bold text-indigo-700">{data.names.size.toLocaleString()}</td>
                                <td className="px-4 py-3 text-right font-bold text-slate-700">{data.lots.size.toLocaleString()}</td>
                                <td className="px-4 py-3 text-right text-teal-700 font-medium">{formatBaht(data.value || 0)}</td>
                                <td className="px-4 py-3 text-right text-xs">
                                  {slotStats[cab]?.totalSlots > 0 ? (
                                    <span className={`font-bold ${util >= 85 ? 'text-rose-600' : util >= 60 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                      {slotStats[cab].usedSlots}/{slotStats[cab].totalSlots} ({util.toFixed(0)}%)
                                    </span>
                                  ) : <span className="text-slate-400">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="bg-slate-800 text-white font-bold text-sm">
                            <td className="px-4 py-3" colSpan={2}>รวมทั้งหมด</td>
                            <td className="px-4 py-3 text-right">{(overallStats?.names || 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">{(overallStats?.lots || 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">{formatBaht(overallStats?.value || 0)}</td>
                            <td className="px-4 py-3 text-right">{totalAvail > 0 ? `${totalUsed}/${totalAvail} (${totalUtilPct.toFixed(0)}%)` : '—'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>

              {/* Footer */}
              <div className="bg-white p-4 border-t border-slate-200 flex justify-end shrink-0 rounded-b-2xl">
                <button onClick={() => setShowSummaryModal(false)} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors shadow-sm">
                  ปิด
                </button>
              </div>
            </div>
          </div>
        );
      })()}


      {selectedLocation && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="bg-indigo-700 p-5 flex justify-between items-center text-white shrink-0 rounded-t-2xl">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <MapPin size={24} className="text-indigo-200" />
                ตำแหน่งจัดเก็บ: {selectedLocation.id}
              </h3>
              <button onClick={() => setSelectedLocation(null)} className="text-white/70 hover:text-white transition-colors bg-white/10 p-2 rounded-xl hover:bg-white/20">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto bg-slate-50">
              <div className="space-y-4">
                <div className="text-slate-500 mb-2 border-b border-slate-200 pb-3 flex justify-between items-end">
                  <span className="font-medium text-slate-700">พบยาทั้งหมด {selectedLocation.items.length} รายการ</span>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {selectedLocation.items.map((item, idx) => renderItemCard(item, idx, selectedLocation.id))}
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 border-t border-slate-200 flex justify-end shrink-0 rounded-b-2xl">
              <button onClick={() => setSelectedLocation(null)} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors shadow-sm">
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {expiryViewFilter && (() => {
        const isExpiryMode = expiryViewFilter === 'near' || expiryViewFilter === 'expired';
        const computeDays = (item) => {
          const d = parseDateString(item.exp);
          if (!d) return null;
          d.setHours(0,0,0,0);
          return Math.floor((d - todayForDisplay) / 86400000);
        };
        const computeWaitDays = (item) => {
          if (!item._receiveDate) return null;
          const d = new Date(item._receiveDate);
          if (isNaN(d)) return null;
          d.setHours(0,0,0,0);
          return Math.max(0, Math.floor((todayForDisplay - d) / 86400000));
        };
        const fmtQty = (r) => {
          const n = Number(r.qty);
          const qStr = Number.isFinite(n) ? n.toLocaleString('th-TH') : (r.qty || '-');
          const u = (r.unit && String(r.unit).trim()) || 'หน่วย';
          return `${qStr} × ${u}`;
        };
        const lookupDetail = (item) => {
          const code = (item.code || '-').trim().toLowerCase();
          const lot  = (item.lot  || '-').trim().toLowerCase();
          const inv  = (item.invoice || '-').trim().toLowerCase();
          const exact = drugDetails[`${code}|${lot}|${inv}`];
          if (exact) return exact;
          return Object.values(drugDetails || {}).find(d =>
            (d._code || '').toLowerCase() === code &&
            (d._lot  || '').toLowerCase() === lot
          ) || null;
        };
        const buildSwapPolicy = (d) => {
          if (!d) return '';
          const parts = [];
          if (d._drug_swap_policy && d._drug_swap_policy !== '-') parts.push(d._drug_swap_policy);
          if (d.supplier_changed && d.supplier_changed !== '-')   parts.push(d.supplier_changed);
          return parts.join(' | ');
        };
        const enriched = trackingModal.list.map(item => {
          const d = lookupDetail(item);
          return {
            ...item,
            daysLeft: computeDays(item),
            waitDays: computeWaitDays(item),
            supplier: d?.supplier_current || d?._company || '',
            swapPolicy: buildSwapPolicy(d),
          };
        });
        const q = modalSearch.trim().toLowerCase();
        const searched = q
          ? enriched.filter(item =>
              (item.name || '').toLowerCase().includes(q) ||
              (item.invoice || '').toLowerCase().includes(q)
            )
          : enriched;
        const zoneOf = (r) => {
          const loc = (r.location || '').trim().toUpperCase();
          const m = loc.match(/^([A-Z]+)/);
          return m ? m[1] : '-';
        };
        const logGroups = (() => {
          const map = new Map();
          searched.forEach(r => {
            const z = zoneOf(r);
            map.set(z, (map.get(z) || 0) + 1);
          });
          return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
        })();
        const sortByLoc = (arr) => [...arr].sort((a, b) =>
          (a.location || '￿').localeCompare(b.location || '￿', 'en', { numeric: true })
        );
        const zoneFiltered = modalLogFilter !== 'all'
          ? searched.filter(r => zoneOf(r) === modalLogFilter)
          : searched;
        const timeFiltered = isExpiryMode ? zoneFiltered.filter(r => {
          if (modalTimeFilter === 'all') return true;
          if (r.daysLeft == null) return false;
          if (modalTimeFilter === 'expired') return r.daysLeft < 0;
          if (modalTimeFilter === 'soon30')  return r.daysLeft >= 0 && r.daysLeft < 30;
          if (modalTimeFilter === 'soon90')  return r.daysLeft >= 30 && r.daysLeft < 90;
          if (modalTimeFilter === 'soon180') return r.daysLeft >= 90 && r.daysLeft < 180;
          if (modalTimeFilter === 'soon16m') return r.daysLeft >= 180;
          return true;
        }) : sortByLoc(zoneFiltered);
        const counts = {
          all:     zoneFiltered.length,
          expired: zoneFiltered.filter(r => r.daysLeft != null && r.daysLeft < 0).length,
          soon30:  zoneFiltered.filter(r => r.daysLeft != null && r.daysLeft >= 0 && r.daysLeft < 30).length,
          soon90:  zoneFiltered.filter(r => r.daysLeft != null && r.daysLeft >= 30 && r.daysLeft < 90).length,
          soon180: zoneFiltered.filter(r => r.daysLeft != null && r.daysLeft >= 90 && r.daysLeft < 180).length,
          soon16m: zoneFiltered.filter(r => r.daysLeft != null && r.daysLeft >= 180).length,
        };
        const rowColor = (d) => {
          if (d == null) return 'bg-white border-slate-100';
          if (d < 0)   return 'bg-red-50 border-red-100';
          if (d < 30)  return 'bg-orange-50 border-orange-100';
          if (d < 90)  return 'bg-yellow-50 border-yellow-100';
          if (d < 180) return 'bg-lime-50 border-lime-100';
          return 'bg-blue-50 border-blue-100';
        };
        const badgeColor = (d) => {
          if (d == null) return 'bg-slate-100 text-slate-600 border-slate-200';
          if (d < 0)   return 'bg-red-100 text-red-700 border-red-200';
          if (d < 30)  return 'bg-orange-100 text-orange-700 border-orange-200';
          if (d < 90)  return 'bg-yellow-100 text-yellow-700 border-yellow-200';
          if (d < 180) return 'bg-lime-100 text-lime-700 border-lime-200';
          return 'bg-blue-100 text-blue-700 border-blue-200';
        };
        const daysLabel = (d) => {
          if (d == null) return '-';
          if (d < 0)  return `หมดอายุแล้ว ${Math.abs(d)} วัน`;
          if (d === 0) return 'หมดอายุวันนี้';
          return `อีก ${d} วัน`;
        };
        const handleModalExport = async () => {
          setModalExporting(true);
          try {
            const cols = [
              { header: 'ชื่อยา', key: 'name' },
              { header: 'รหัสยา', key: 'code' },
              { header: 'ชนิด', key: 'type' },
              { header: 'ตำแหน่ง', key: 'location' },
              { header: 'Lot', key: 'lot' },
              { header: 'วันหมดอายุ', key: 'exp' },
              { header: 'คงเหลือ', key: 'qty' },
              { header: 'หน่วย', key: 'unit' },
              { header: 'สถานะตรวจรับ', key: 'receiveStatus' },
              { header: 'บริษัท', key: 'supplier' },
              { header: 'นโยบายเปลี่ยนยา', key: 'swapPolicy' },
            ];
            const tabLabel = expiryViewFilter === 'expired' ? 'หมดอายุแล้ว'
              : expiryViewFilter === 'near' ? 'ใกล้หมดอายุ'
              : 'รอตรวจรับ';
            await exportToExcel(timeFiltered, cols, tabLabel, `${tabLabel}_${new Date().toISOString().slice(0,10)}.xlsx`, auth);
          } finally { setModalExporting(false); }
        };
        return (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className={`p-5 flex justify-between items-center text-white shrink-0 rounded-t-2xl ${trackingModal.bg}`}>
              <h3 className="text-base sm:text-xl font-bold flex items-center gap-2 min-w-0">
                {TrackingModalIcon && <TrackingModalIcon size={20} className={`${trackingModal.text} shrink-0`} />}
                <span className="truncate">{trackingModal.title}</span>
                <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full shrink-0">{trackingModal.list.length}</span>
              </h3>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={handleModalExport} disabled={modalExporting || timeFiltered.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors">
                  {modalExporting ? <RefreshCcw size={12} className="animate-spin"/> : <FileDown size={12}/>}
                  <span className="hidden sm:inline">{modalExporting ? 'กำลังส่งออก...' : 'Excel'}</span>
                </button>
                <button onClick={() => { setExpiryViewFilter(null); setModalSearch(''); setModalTimeFilter('all'); setModalLogFilter('all'); }} className="text-white/70 hover:text-white transition-colors bg-black/10 p-2 rounded-xl hover:bg-black/20">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="px-4 sm:px-6 pt-4 pb-2 bg-white border-b border-slate-200 shrink-0 space-y-3">
              <DrugSearchBar
                value={modalSearch}
                onChange={setModalSearch}
                options={(() => {
                  const seen = new Map();
                  trackingModal.list.forEach(item => {
                    if (item.name && !seen.has(item.name)) seen.set(item.name, item.type || '');
                  });
                  return [...seen.entries()].map(([name, type]) => ({ name, type }));
                })()}
                placeholder="ค้นหาชื่อยา, เลขที่บิล..."
                ringClass="focus:ring-sky-400"
                hoverClass="hover:bg-sky-50"
                maxResults={20}
                inputClassName="py-2.5 bg-slate-50"
              />
              {isExpiryMode && (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {[
                    { key: 'all',     label: 'ทั้งหมด',      active: 'bg-slate-700 text-white' },
                    { key: 'expired', label: 'หมดอายุแล้ว',   active: 'bg-red-600 text-white' },
                    { key: 'soon30',  label: 'ภายใน 30 วัน',  active: 'bg-orange-500 text-white' },
                    { key: 'soon90',  label: '1–3 เดือน',     active: 'bg-yellow-500 text-white' },
                    { key: 'soon180', label: '3–6 เดือน',     active: 'bg-lime-500 text-white' },
                    { key: 'soon16m', label: '6–16 เดือน',    active: 'bg-blue-500 text-white' },
                  ].map(tab => (
                    <button key={tab.key} onClick={() => setModalTimeFilter(tab.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
                        modalTimeFilter === tab.key ? tab.active + ' border-transparent shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}>
                      {tab.label}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${modalTimeFilter === tab.key ? 'bg-white/30 text-inherit' : 'bg-slate-100 text-slate-600'}`}>{counts[tab.key]}</span>
                    </button>
                  ))}
                </div>
              )}
              {logGroups.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  <button onClick={() => setModalLogFilter('all')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
                      modalLogFilter === 'all' ? 'bg-sky-600 text-white border-transparent shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}>
                    ทั้งหมด
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${modalLogFilter === 'all' ? 'bg-white/30 text-inherit' : 'bg-slate-100 text-slate-600'}`}>{searched.length}</span>
                  </button>
                  {logGroups.map(([zone, n]) => (
                    <button key={zone} onClick={() => setModalLogFilter(zone)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
                        modalLogFilter === zone ? 'bg-sky-600 text-white border-transparent shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}>
                      {zone}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${modalLogFilter === zone ? 'bg-white/30 text-inherit' : 'bg-slate-100 text-slate-600'}`}>{n}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-500">
                {q ? `ผลการค้นหา: ${timeFiltered.length} รายการ` : `พบ ${timeFiltered.length} รายการ`}
                {expiryViewFilter !== 'pending' && ' · เรียงตามวันหมดอายุก่อน'}
              </p>
            </div>

            <div className="overflow-auto bg-slate-50 flex-1">
              {timeFiltered.length === 0 ? (
                <p className="text-center text-slate-400 py-10 text-sm">ไม่พบรายการ</p>
              ) : isMobileExpiry ? (
                <div className="p-3 space-y-2">
                  {timeFiltered.map((r, i) => (
                    <div key={i} className={`border rounded-xl p-3 ${rowColor(r.daysLeft)}`}>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800 text-sm leading-tight">{r.name || '-'}</p>
                          {r.code && r.code !== '-' && <p className="text-[11px] text-slate-400 mt-0.5">{r.code}</p>}
                        </div>
                        {isExpiryMode && (
                          <span className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor(r.daysLeft)}`}>
                            {daysLabel(r.daysLeft)}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mt-2 pt-2 border-t border-slate-200/60">
                        <div><span className="text-slate-400">ชนิด:</span> {r.type ? <DrugTypeBadge type={r.type} /> : <span className="text-slate-700 font-medium">-</span>}</div>
                        <div><span className="text-slate-400">ตำแหน่ง:</span> <span className="text-slate-700 font-medium">{r.location || '-'}</span></div>
                        <div><span className="text-slate-400">Lot:</span> <span className="text-slate-700">{r.lot || '-'}</span></div>
                        <div><span className="text-slate-400">Exp:</span> <span className="text-slate-700">{r.exp || '-'}</span></div>
                        <div className="col-span-2"><span className="text-slate-400">คงเหลือ:</span> <span className="text-slate-800 font-bold">{fmtQty(r)}</span></div>
                        {!isExpiryMode && r.waitDays != null && (
                          <div className="col-span-2"><span className="text-slate-400">รอตรวจรับมา:</span> <span className="text-sky-700 font-semibold">{r.waitDays} วัน</span></div>
                        )}
                        {!isExpiryMode && r.receiveStatus && (
                          <div className="col-span-2"><span className="text-slate-400">สถานะ:</span> <span className="text-slate-700">{r.receiveStatus}</span></div>
                        )}
                        {r.supplier && (
                          <div className="col-span-2"><span className="text-slate-400">บริษัท:</span> <span className="text-slate-700">{r.supplier}</span></div>
                        )}
                        {r.swapPolicy && (
                          <div className="col-span-2"><span className="text-slate-400">นโยบายเปลี่ยนยา:</span> <span className="text-slate-700">{r.swapPolicy}</span></div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <table className="w-auto text-xs table-auto">
                  <thead className="sticky top-0 z-20">
                    <tr className="text-slate-500 font-semibold border-b border-slate-100 bg-slate-50">
                      <th className="px-3 py-2 text-left bg-slate-50">ชื่อยา</th>
                      <th className="px-3 py-2 text-left bg-slate-50">ชนิด</th>
                      <th className="px-3 py-2 text-left bg-slate-50">ตำแหน่ง</th>
                      <th className="px-3 py-2 text-left bg-slate-50">Lot</th>
                      {isExpiryMode && <th className="px-3 py-2 text-center bg-slate-50">วันหมดอายุ</th>}
                      {isExpiryMode && <th className="px-3 py-2 text-center bg-slate-50">สถานะ</th>}
                      {!isExpiryMode && <th className="px-3 py-2 text-center bg-slate-50">รอตรวจรับมา</th>}
                      {!isExpiryMode && <th className="px-3 py-2 text-left bg-slate-50">สถานะรับ</th>}
                      <th className="px-3 py-2 text-left bg-slate-50">บริษัท</th>
                      {isExpiryMode && <th className="px-3 py-2 text-left bg-slate-50">นโยบายเปลี่ยนยา</th>}
                      <th className="px-3 py-2 text-right bg-slate-50 whitespace-nowrap">คงเหลือ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeFiltered.map((r, i) => (
                      <tr key={i} className={`border-b ${rowColor(r.daysLeft)}`}>
                        <td className="px-3 py-2.5 font-semibold text-slate-800 max-w-[200px]">
                          <span className="block truncate">{r.name || '-'}</span>
                          {r.code && r.code !== '-' && <span className="text-slate-400 font-normal">{r.code}</span>}
                        </td>
                        <td className="px-3 py-2.5">{r.type ? <DrugTypeBadge type={r.type} /> : <span className="text-slate-500">-</span>}</td>
                        <td className="px-3 py-2.5 text-slate-600 font-medium whitespace-nowrap">{r.location || '-'}</td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.lot || '-'}</td>
                        <td className="px-3 py-2.5 text-center font-medium text-slate-700 whitespace-nowrap">{r.exp || '-'}</td>
                        {isExpiryMode && (
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgeColor(r.daysLeft)}`}>
                              {daysLabel(r.daysLeft)}
                            </span>
                          </td>
                        )}
                        {!isExpiryMode && (
                          <td className="px-3 py-2.5 text-center">
                            {r.waitDays != null ? (
                              <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border bg-sky-100 text-sky-700 border-sky-200">
                                {r.waitDays} วัน
                              </span>
                            ) : <span className="text-slate-400">-</span>}
                          </td>
                        )}
                        {!isExpiryMode && (
                          <td className="px-3 py-2.5 text-slate-600 text-xs max-w-[160px] truncate">{r.receiveStatus || '-'}</td>
                        )}
                        <td className="px-3 py-2.5 text-slate-700 text-xs max-w-[160px] truncate" title={r.supplier || '-'}>{r.supplier || '-'}</td>
                        <td className="px-3 py-2.5 text-slate-600 text-xs max-w-[220px]" title={r.swapPolicy || '-'}>
                          <span className="line-clamp-2 leading-snug">{r.swapPolicy || '-'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">{fmtQty(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white p-4 border-t border-slate-200 flex justify-end shrink-0 rounded-b-2xl">
              <button onClick={() => { setExpiryViewFilter(null); setModalSearch(''); setModalTimeFilter('all'); setModalLogFilter('all'); }} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors shadow-sm">
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {showResetConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <AlertTriangle size={28} />
              <h3 className="text-xl font-bold">ยืนยันการรีเซ็ตข้อมูล</h3>
            </div>
            <p className="text-slate-600 mb-6 leading-relaxed">
              คุณต้องการล้างข้อมูลที่อัปโหลดไว้ และกลับไปใช้ข้อมูลเริ่มต้น (Mockup) ของระบบหรือไม่?<br/>
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowResetConfirm(false)} 
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
              >
                ยกเลิก
              </button>
              <button 
                onClick={confirmResetData} 
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-medium transition-colors shadow-sm"
              >
                ยืนยันการรีเซ็ต
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
