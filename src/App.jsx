import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { fetchInventory, saveInventory, fetchDrugDetails, fetchUploadMeta, saveUploadMeta, importReceiveLogs } from './lib/db';
import { supabase } from './lib/supabase';
import DrugSearchBar, { DrugTypeBadge } from './DrugSearchBar';
import {
  Search, Package, MapPin, X, UploadCloud, FileSpreadsheet,
  AlertCircle, BarChart3, Layers, Pill, FileText,
  ChevronUp, Database, Clock, Check, CalendarDays, AlertTriangle, RefreshCcw
} from 'lucide-react';

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
  if (/^[\d.]+[eE][+\-]?\d+$/.test(s)) {
    const n = parseFloat(s);
    s = isFinite(n) ? BigInt(Math.round(n)).toString() : s;
  }
  return s || '-';
};

// ใช้สำหรับ match/เปรียบเทียบ code — lowercase + ตัด leading zeros + trim
const codeKey = (val) => {
  if (!val || val === '-') return '';
  let s = String(val).trim().toLowerCase();
  if (/^[\d.]+[eE][+\-]?\d+$/.test(s)) {
    const n = parseFloat(s);
    s = isFinite(n) ? BigInt(Math.round(n)).toString() : s;
  }
  // ตัด leading zeros เพื่อให้ "003" === "3"
  s = s.replace(/^0+(\d)/, '$1');
  return s;
};

// ใช้สำหรับ match ชื่อยา — lowercase + collapse spaces + trim
const nameKey = (val) => {
  if (!val || val === '-') return '';
  return String(val).trim().toLowerCase().replace(/\s+/g, ' ');
};

// แปลง scientific notation → ตัวเลขเต็ม (เช่น 1.12512E+11 → "112512000000")
const normalizeNumericText = (val) => {
  if (!val) return '-';
  const v = String(val).trim();
  if (/^[\d.]+[eE][+\-]?\d+$/.test(v)) {
    const n = parseFloat(v);
    return isFinite(n) ? BigInt(Math.round(n)).toString() : v;
  }
  return v || '-';
};

// แปลง "1000เม็ด" → { packSize:1000, label:"1000เม็ด" }
const parsePackUnit = (unit) => {
  if (!unit || unit === '-') return { packSize: 1, label: unit || '' };
  const m = String(unit).trim().match(/^(\d+\.?\d*)\s*(.+)$/);
  if (m) {
    const packSize = parseFloat(m[1]);
    if (packSize > 1) return { packSize, label: unit.trim() };
  }
  return { packSize: 1, label: unit.trim() };
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

export default function App({ onBackToDashboard, role = 'staff' }) {
  const isStaff = role === 'staff' || role === 'admin';
  const [inventory, setInventory] = useState(initialInventory);
  const [drugDetails, setDrugDetails] = useState(initialDrugDetails);
  const [logFileName, setLogFileName] = useState('');
  const [logUpdateDate, setLogUpdateDate] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [expandedDetailsId, setExpandedDetailsId] = useState(null);
  const [expiryViewFilter, setExpiryViewFilter] = useState(null);
  const [modalSearch, setModalSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [view, setView] = useState('map'); // 'map' | 'order'
  const [dispenseUsage, setDispenseUsage] = useState({});
  const [uploadWarnings, setUploadWarnings] = useState(null); // { fileName, rows: [{row, issues[]}] }
  const [usageDateRange, setUsageDateRange] = useState(null);
  const [orderedItems, setOrderedItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('orderedItems') || '{}'); } catch { return {}; }
  });

  // fetch เรทการใช้ยา 4 เดือนล่าสุด จาก dispense_logs เมื่อเปิดระบบสั่งยา
  useEffect(() => {
    if (view !== 'order' || !supabase) return;
    const now = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 4);
    const fromStr = from.toISOString().split('T')[0];
    const fmt = (d) => `${d.getDate()}/${d.getMonth()+1}/${String(d.getFullYear()).slice(2)}`;
    setUsageDateRange({ from: fmt(from), to: fmt(now) });

    // แปลง "1000เม็ด" → { packSize:1000, baseUnit:"เม็ด" }
    const parseUnit = (unit) => {
      if (!unit || unit === '-') return { packSize: 1, baseUnit: '-', ok: true };
      const u = unit.trim();
      const m = u.match(/^(\d+\.?\d*)\s*(.+)$/);
      if (m) {
        const packSize = parseFloat(m[1]);
        const baseUnit = m[2].trim();
        if (packSize > 0 && baseUnit) return { packSize, baseUnit, ok: true };
      }
      return { packSize: 1, baseUnit: u, ok: true };
    };

    const fetchAll = async () => {
      const PAGE = 1000;
      let all = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from('dispense_logs')
          .select('drug_code, drug_name, drug_unit, qty_out, dispense_date')
          .gte('dispense_date', fromStr)
          .order('dispense_date', { ascending: false })
          .range(page, page + PAGE - 1);
        if (error || !data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        page += PAGE;
      }

      // raw[key] = { totalBase, monthly, baseUnit, unitVariants:{baseUnit→qty}, ambiguous, name, code }
      const raw = {};

      all.forEach(row => {
        const byCode = codeKey(row.drug_code);
        const byName = nameKey(row.drug_name);
        const keys = [...new Set([byCode, byName].filter(Boolean))];
        if (keys.length === 0) return;

        const qty = parseFloat(String(row.qty_out || '0').replace(/,/g, '')) || 0;
        if (qty <= 0) return;

        const unitRaw = row.drug_unit ? String(row.drug_unit).trim() : '';

        // row ที่ไม่มีหน่วย: นับแยก ไม่รวมใน totals (ไม่รู้จะแปลงยังไง)
        if (!unitRaw || unitRaw === '-') {
          keys.forEach(key => {
            if (!raw[key]) raw[key] = { totalBase: 0, monthly: {}, baseUnit: '-', name: row.drug_name, code: row.drug_code, unitVariants: {}, noUnitRows: 0 };
            raw[key].noUnitRows = (raw[key].noUnitRows || 0) + 1;
          });
          return;
        }

        const { packSize, baseUnit } = parseUnit(unitRaw);
        const qtyBase = qty * packSize; // แปลงเป็น base unit เช่น 1000เม็ด×10 = 10000เม็ด
        const month = String(row.dispense_date || '').slice(0, 7);

        keys.forEach(key => {
          if (!raw[key]) {
            raw[key] = { totalBase: 0, monthly: {}, baseUnit, name: row.drug_name, code: row.drug_code, unitVariants: {}, noUnitRows: 0 };
          }
          raw[key].totalBase += qtyBase;
          raw[key].unitVariants[baseUnit] = (raw[key].unitVariants[baseUnit] || 0) + qtyBase;
          if (month) raw[key].monthly[month] = (raw[key].monthly[month] || 0) + qtyBase;
          // อัปเดต baseUnit เป็นตัวที่พบมากที่สุด (dominant)
          const dominant = Object.entries(raw[key].unitVariants).sort((a,b) => b[1]-a[1])[0];
          if (dominant) raw[key].baseUnit = dominant[0];
        });
      });

      const result = {};
      Object.entries(raw).forEach(([key, { totalBase, monthly, baseUnit, unitVariants, name, code, noUnitRows }]) => {
        const vals = Object.values(monthly);
        const maxMonth = vals.length ? Math.max(...vals) : 0;
        const avg = Math.round(totalBase / 4);
        const units = Object.keys(unitVariants);
        // ambiguous = หน่วย base ต่างกันจริงๆ เช่น เม็ด vs ml (ไม่ใช่แค่ packSize ต่างกัน)
        const ambiguous = units.length > 1 ? units : null;
        result[key] = {
          total: Math.round(totalBase),
          maxMonth: Math.round(maxMonth),
          avg,
          baseUnit: baseUnit || '-',
          ambiguous, // null = ปกติ, array = มีหลายหน่วยที่รวมไม่ได้
          unitVariants,
          noUnitRows: noUnitRows || 0,
          name,
          code,
        };
      });
      setDispenseUsage(result);
    };
    fetchAll();
  }, [view]);

  const toggleOrdered = useCallback((code) => {
    setOrderedItems(prev => {
      const next = { ...prev };
      if (next[code]) {
        delete next[code];
      } else {
        next[code] = new Date().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' });
      }
      localStorage.setItem('orderedItems', JSON.stringify(next));
      return next;
    });
  }, []);

  const [debugDrugQuery, setDebugDrugQuery] = useState('');
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
      } finally {
      }
    }
    loadFromSupabase();
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
      const avgPerDay  = ss > 0 ? ss / 60 : 0;
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
  }, [drugDetails, inventory]);

  // Debug: ตรวจสอบว่ามีข้อมูล Safety Stock จากทั้ง drugDetails และ inventory
  const lowStockDebug = useMemo(() => {
    const totalDrugs = Object.keys(drugDetails).length;
    // นับจาก inventory (log CSV)
    let withSSFromLog = 0;
    let ssExamples = [];
    Object.values(inventory).forEach(items => {
      items.forEach(item => {
        const ss = item.safetyStock || 0;
        if (ss > 0) {
          withSSFromLog++;
          if (ssExamples.length < 3) ssExamples.push(`${item.name?.slice(0,20)}: SS=${ss}`);
        }
      });
    });
    return { totalDrugs, withSSFromLog: new Set(Object.values(inventory).flat().filter(i => (i.safetyStock||0) > 0).map(i => i.code)).size, ssExamples };
  }, [drugDetails, inventory]);

  const exportLowStockCSV = useCallback(() => {
    const headers = [
      'รายการยา', 'รหัส', 'ชนิดยา', 'หน่วย', 'คงเหลือ',
      'Safety Stock (ปัจจุบัน)', 'แนะนำ SS (แพ็ค)', 'แนะนำ SS (หน่วย)',
      'Reorder Point', 'ต้องซื้อ (แพ็ค)', 'ต้องซื้อ (หน่วย)',
      'Lead Time (วัน)',
      'รวมการใช้ 4 เดือน', 'สูงสุด/เดือน', 'เฉลี่ย/เดือน', 'หน่วยเรท',
      'สถานะ', 'สั่งแล้ว', 'วันที่สั่ง',
    ];
    const rows = lowStockItems.map(item => {
      const u = dispenseUsage[codeKey(item.code)] || dispenseUsage[nameKey(item.name)] || {};
      const { packSize, label: unitLabel } = parsePackUnit(item.unit);
      const recSS = u.maxMonth > 0 ? Math.ceil(u.maxMonth * 2) : null;
      const recSSPacks = recSS != null ? Math.ceil(recSS / packSize) : '';
      const ltMonths = (item.leadTime || 20) / 30;
      const orderQty = recSS != null && u.avg > 0
        ? Math.max(0, Math.ceil(recSS + (u.avg * ltMonths) - item.currentQty))
        : null;
      const orderPacks = orderQty != null && orderQty > 0 ? Math.ceil(orderQty / packSize) : (orderQty === 0 ? 'เพียงพอ' : '');
      return [
        item.name,
        item.code,
        item.type,
        item.unit,
        item.currentQty,
        item.safetyStock,
        recSSPacks,
        unitLabel || '',
        item.reorderPoint,
        orderPacks,
        unitLabel || '',
        item.leadTime,
        u.total != null ? u.total : '',
        u.maxMonth != null ? u.maxMonth : '',
        u.avg != null ? u.avg : '',
        u.baseUnit || '',
        item.belowSafety ? 'วิกฤต' : 'สั่งได้เลย',
        orderedItems[item.code] ? 'สั่งแล้ว' : '',
        orderedItems[item.code] || '',
      ];
    });
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'รายการต้องสั่งยา.csv'; a.click();
    URL.revokeObjectURL(url);
  }, [lowStockItems, orderedItems]);

  // คำนวณรายการยารอตรวจรับ
  const pendingReceiveItems = useMemo(() => {
    const pending = [];
    Object.entries(inventory).forEach(([loc, items]) => {
      items.forEach((item, idx) => {
        if (String(item.receiveStatus || '').includes('รอตรวจรับ')) {
          pending.push({
            ...item,
            location: loc,
            isPending: true,
            originalIndex: idx
          });
        }
      });
    });
    return pending;
  }, [inventory]);

  // คำนวณโครงสร้างตู้ และหาจำนวน Unique Item / Unique Lot
  const { layout, otherZones, summary, overallStats } = useMemo(() => {
    const lay = {};
    const other = {};
    const sum = {};
    const allNames = new Set();
    const allLots = new Set();

    Object.entries(inventory).forEach(([loc, items]) => {
      if (!items || items.length === 0) return;
      
      const match = loc.match(/^([A-Za-zก-ฮ0-9]+)-(\d+)(?:-(\d+))?$/);
      const cab = match ? match[1] : loc;

      if (!sum[cab]) sum[cab] = { names: new Set(), lots: new Set(), total: 0 };

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
        const codeKey = (item.code && item.code !== '-') ? item.code.trim().toLowerCase() : item.name.trim().toLowerCase();
        const lotKey = `${codeKey}|${(item.lot || '').trim().toLowerCase()}`;
        
        sum[cab].names.add(codeKey);
        sum[cab].lots.add(lotKey);
        sum[cab].total += 1;

        allNames.add(codeKey);
        allLots.add(lotKey);
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

    return { layout: lay, otherZones: other, summary: sum, overallStats: { names: allNames.size, lots: allLots.size } };
  }, [inventory]);

  const totalCabinets = Object.keys(summary).length;

  // --- ข้อมูลสำหรับสร้างกราฟ ---
  const { typeStats, maxTypeCount } = useMemo(() => {
    const stats = {};
    const uniqueTracker = new Set();
    let max = 0;

    Object.values(inventory).forEach(items => {
      items.forEach(item => {
        const typeStr = (item.type && item.type !== '-') ? item.type.toUpperCase() : 'ไม่ระบุ';
        // นับเฉพาะรายการยาที่ไม่ซ้ำกัน (อิงตามรหัสหรือชื่อยา)
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

  const filteredSearchSuggestions = searchTerm.trim()
    ? drugNamesList.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 10)
    : [];

  const searchResults = useMemo(() => {
    if (!searchTerm) return [];
    const term = searchTerm.toLowerCase();
    const results = [];
    
    Object.entries(inventory).forEach(([loc, items]) => {
      items.forEach((item, idx) => {
        if (
          item.name.toLowerCase().includes(term) ||
          (item.code && item.code.toLowerCase().includes(term)) ||
          (item.lot && item.lot.toLowerCase().includes(term)) ||
          loc.toLowerCase().includes(term) ||
          (item.invoice && item.invoice.toLowerCase().includes(term))
        ) {
          results.push({ ...item, location: loc, originalIndex: idx });
        }
      });
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

  const handleLocationClick = (locationId) => {
    const allItems = inventory[locationId] || [];
    setSelectedLocation({
      id: locationId,
      items: allItems.filter(item => {
        const isDiscontinued = String(item.receiveStatus || '').includes('ตัดออก');
        const qty = parseFloat(String(item.qty || '0').replace(/,/g, '')) || 0;
        return !(isDiscontinued && qty === 0);
      })
    });
    setExpandedDetailsId(null);
  };

  const toggleDetails = (id) => {
    setExpandedDetailsId(expandedDetailsId === id ? null : id);
  };

  const Slot = ({ id }) => {
    // กรองรายการ ตัดออก+qty=0 ออก; ถ้ายังมีของเหลือให้แสดงตามปกติ
    const visibleItems = (inventory[id] || []).filter(item => {
      const isDiscontinued = String(item.receiveStatus || '').includes('ตัดออก');
      const qty = parseFloat(String(item.qty || '0').replace(/,/g, '')) || 0;
      return !(isDiscontinued && qty === 0);
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

    let gradient = 'bg-gradient-to-br from-emerald-100 via-teal-50 to-emerald-100';
    let border   = 'border-emerald-300';
    let textMain = 'text-slate-900';
    let textSub  = 'text-slate-700';
    let shadow   = 'shadow-emerald-100';
    let ring     = 'hover:ring-2 hover:ring-emerald-300';
    let StatusIcon = null;

    if (hasExpired) {
      gradient = 'bg-gradient-to-br from-rose-100 via-red-50 to-rose-100';
      border   = 'border-rose-300';
      textMain = 'text-slate-900';
      textSub  = 'text-slate-700';
      shadow   = 'shadow-rose-100';
      ring     = 'hover:ring-2 hover:ring-rose-300';
      StatusIcon = <AlertTriangle size={12} className="absolute top-1 right-1 text-rose-500 drop-shadow" />;
    } else if (hasNearExpiry) {
      gradient = 'bg-gradient-to-br from-amber-100 via-yellow-50 to-amber-100';
      border   = 'border-amber-300';
      textMain = 'text-slate-900';
      textSub  = 'text-slate-700';
      shadow   = 'shadow-amber-100';
      ring     = 'hover:ring-2 hover:ring-amber-300';
      StatusIcon = <Clock size={12} className="absolute top-1 right-1 text-amber-500 drop-shadow" />;
    }

    return (
      <div
        onClick={() => handleLocationClick(id)}
        className={`
          relative cursor-pointer transition-all duration-200 border-2 rounded-xl
          flex items-center justify-center text-xs font-bold px-3 py-3 min-w-[70px] flex-1
          ${gradient} ${border} shadow-md ${shadow} ${ring}
          ${highlighted
            ? 'ring-4 ring-yellow-400 scale-110 z-10 shadow-xl'
            : 'hover:scale-105 hover:shadow-lg active:scale-95'}
          overflow-hidden
        `}
      >
        {/* shine overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent pointer-events-none rounded-xl" />
        <div className="flex flex-col items-center relative z-10">
          <span className="tracking-wide drop-shadow-sm">{id}</span>
          <span className={`text-[10px] font-semibold mt-0.5 ${textSub}`}>
            {itemCount} รายการ
          </span>
        </div>
        {StatusIcon}
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
                  {!isPendingStatus && item.receiveStatus && item.receiveStatus !== 'ไม่มีการดำเนินการ' && (
                    <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">
                      <Check size={14} /> สถานะ: {item.receiveStatus}
                    </span>
                  )}
                </div>
              </div>
              
              <button
                onClick={() => toggleDetails(uniqueItemId)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  isExpanded
                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                    : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 cursor-pointer'
                }`}
              >
                {isExpanded ? (
                  <span className="flex items-center gap-1.5"><ChevronUp size={16} /> ปิดรายละเอียด</span>
                ) : (
                  <span className="flex items-center gap-1.5"><FileText size={16} /> ดูรายละเอียดเพิ่มเติม</span>
                )}
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
    if (expiryViewFilter === 'near') return { bg: 'bg-amber-600', text: 'text-amber-200', icon: Clock, title: 'รายการยาใกล้หมดอายุ (ภายใน 1 ปี 4 เดือน)', list: nearExpiryItems };
    if (expiryViewFilter === 'pending') return { bg: 'bg-sky-600', text: 'text-sky-200', icon: Package, title: 'รายการยารอตรวจรับ (อ้างอิงสถานะจาก Log คลัง)', list: pendingReceiveItems };
    return { bg: '', text: '', icon: null, title: '', list: [] };
  };
  const trackingModal = getModalConfig();
  const TrackingModalIcon = trackingModal.icon;


  // ===== ระบบสั่งยา (full-page view) =====
  if (view === 'order') {
    const ambiguousDrugs = Object.values(dispenseUsage).filter(u => u.ambiguous && u.ambiguous.length > 1);
    return (
      <div className="min-h-screen bg-slate-100 font-sans text-slate-800">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-700 to-rose-700 px-6 py-4 flex items-center justify-between text-white shadow-md sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('map')}
              className="flex items-center gap-1.5 text-orange-100 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors"
            >
              ← กลับ
            </button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <AlertTriangle size={20} className="text-orange-200" /> ระบบสั่งยา
              </h1>
              <p className="text-sm text-orange-200 mt-0.5">ยาที่อยู่ต่ำกว่า Reorder Point (Safety Stock + Buffer สำหรับ Lead Time)</p>
            </div>
          </div>
          <button
            onClick={exportLowStockCSV}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors shadow-sm text-sm"
          >
            <FileSpreadsheet size={15}/> Export CSV
          </button>
        </div>

        <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-4">
          {/* Info panel */}
          <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 text-sm space-y-2">
            <p className="font-bold text-yellow-800">ℹ️ ข้อมูลการคำนวณ</p>
            <div className="bg-white border border-yellow-200 rounded-lg p-3 space-y-2 text-xs text-slate-700">
              <p className="font-bold text-slate-800 mb-1">📐 สูตรคำนวณแต่ละคอลัมน์</p>
              <div className="space-y-1.5">
                <div>
                  <span className="font-semibold text-violet-700">แนะนำ SS</span>
                  <span className="text-slate-500 ml-1">=</span>
                  <span className="ml-1">ยอดใช้สูงสุดใน 1 เดือน (จาก 4 เดือนล่าสุด) × 2</span>
                  <p className="text-slate-400 pl-3">→ ให้มีสต็อกรองรับอย่างน้อย 2 เดือนในกรณีใช้สูงสุด</p>
                </div>
                <div>
                  <span className="font-semibold text-orange-700">Reorder Point</span>
                  <span className="text-slate-500 ml-1">=</span>
                  <span className="ml-1">SS ปัจจุบัน + (SS ÷ 60 วัน × Lead Time)</span>
                  <p className="text-slate-400 pl-3">→ จุดที่ต้องสั่งซื้อ เพื่อให้ของมาทันก่อนสต็อกหมด</p>
                </div>
                <div>
                  <span className="font-semibold text-cyan-700">ต้องซื้อ</span>
                  <span className="text-slate-500 ml-1">=</span>
                  <span className="ml-1">SS แนะนำ + (เฉลี่ยใช้/เดือน × เดือนรอของ) − คงเหลือปัจจุบัน</span>
                  <p className="text-slate-400 pl-3">→ จำนวนที่ต้องสั่งเพื่อให้ถึง SS แนะนำ หลังของมาถึง</p>
                </div>
                <div className="border-t border-yellow-100 pt-1.5 text-slate-400">
                  เฉลี่ยใช้/เดือน = ยอดรวม 4 เดือน ÷ 4 · Lead Time default = 20 วัน หากไม่มีข้อมูล
                </div>
              </div>
            </div>
            <p className="text-yellow-700">• ยาที่อ่าน SS จาก log CSV ได้: <b>{lowStockDebug.withSSFromLog} รายการ</b></p>
            {lowStockDebug.withSSFromLog === 0 && <p className="text-red-600 font-bold">⚠️ ไม่พบ Safety Stock — ตรวจสอบชื่อ column ในไฟล์</p>}

            {/* Drug search */}
            <div className="pt-1">
              <p className="font-semibold text-yellow-800 mb-1">ค้นหายาเฉพาะตัว:</p>
              <input
                className="border border-yellow-400 rounded-lg px-3 py-1.5 text-sm w-full bg-white"
                placeholder="พิมพ์ชื่อหรือรหัสยา เช่น Lorazepam"
                value={debugDrugQuery}
                onChange={e => setDebugDrugQuery(e.target.value)}
              />
              {debugDrugQuery.trim() && (() => {
                const q = debugDrugQuery.trim().toLowerCase();
                const grouped = {};
                Object.entries(inventory).forEach(([loc, items]) => items.forEach(item => {
                  if (!(item.name?.toLowerCase().includes(q) || item.code?.toLowerCase().includes(q))) return;
                  if (!grouped[item.code]) grouped[item.code] = { name: item.name, code: item.code, ss: item.safetyStock || 0, lt: item.leadTime || 20, lots: [] };
                  grouped[item.code].lots.push({ ...item, location: loc });
                }));
                const found = Object.values(grouped);
                if (found.length === 0) return <p className="text-slate-500 mt-2 text-sm">ไม่พบรายการ</p>;
                return (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-yellow-700 font-semibold">ผลการค้นหา: พบ {found.length} รายการ</p>
                    {found.map((f) => {
                      const totalQty = f.lots.reduce((s, l) => s + (parseFloat(String(l.qty||'0').replace(/,/g,''))||0), 0);
                      const rop = f.ss + Math.round((f.ss / 60) * f.lt);
                      const uByCode = dispenseUsage[codeKey(f.code)];
                      const uByName = dispenseUsage[nameKey(f.name)];
                      const u = uByCode || uByName;
                      const belowRop = f.ss > 0 && totalQty <= rop;
                      const inLowStockList = lowStockItems.some(item => item.code === f.code);
                      return (
                        <div key={f.code} className={`bg-white border ${inLowStockList ? 'border-orange-400' : 'border-slate-200'} shadow-sm rounded-xl p-4`}>
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <h4 className="font-bold text-slate-800 text-base leading-tight">
                                <span className="text-indigo-600 mr-1">[{f.code}]</span>{f.name}
                              </h4>
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {inLowStockList
                                  ? <span className="inline-flex items-center gap-1 bg-red-500 text-white px-2.5 py-0.5 rounded-full text-xs font-bold">🔔 อยู่ในรายการต้องสั่งยา</span>
                                  : <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold border border-emerald-200">✓ ไม่อยู่ในรายการต้องสั่งยา</span>
                                }
                                {belowRop && !inLowStockList && <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-bold border border-orange-200">⚠ qty ≤ ROP</span>}
                                {f.ss === 0 && <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold border border-red-200">SS = 0</span>}
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-2 mb-3">
                            <div className="bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">คงเหลือรวม</div>
                              <div className="text-sm font-black text-slate-800">{totalQty.toLocaleString()}</div>
                            </div>
                            <div className="bg-rose-50 px-3 py-2 rounded-lg border border-rose-100">
                              <div className="text-[10px] text-rose-500 uppercase font-bold tracking-wider mb-0.5">Safety Stock</div>
                              <div className="text-sm font-black text-rose-700">{f.ss}</div>
                            </div>
                            <div className="bg-orange-50 px-3 py-2 rounded-lg border border-orange-100">
                              <div className="text-[10px] text-orange-500 uppercase font-bold tracking-wider mb-0.5">ROP</div>
                              <div className="text-sm font-black text-orange-700">{rop}</div>
                            </div>
                            <div className="bg-blue-50 px-3 py-2 rounded-lg border border-blue-100">
                              <div className="text-[10px] text-blue-500 uppercase font-bold tracking-wider mb-0.5">เฉลี่ย/เดือน</div>
                              <div className="text-sm font-black text-blue-700">{u ? u.avg : '—'}</div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {f.lots.map((lot, li) => (
                              <div key={li} className="grid grid-cols-2 md:grid-cols-5 gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                                <div>
                                  <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">ตำแหน่ง</div>
                                  <div className="text-xs font-semibold text-indigo-700">{lot.location}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">ชนิด/หน่วย</div>
                                  <div className="text-xs text-slate-700">{lot.type} <span className="text-slate-400">({lot.unit})</span></div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">จำนวน</div>
                                  <div className="text-xs font-black text-slate-800">{lot.qty}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Lot / บิล</div>
                                  <div className="text-xs text-slate-700">{lot.lot || '—'} / <span className="text-indigo-600">{lot.invoice || '—'}</span></div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Exp Date</div>
                                  <div className="text-xs font-semibold text-emerald-700">{lot.exp || '—'}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Unit warning */}
          {ambiguousDrugs.length > 0 && (
            <div className="bg-amber-50 border border-amber-400 rounded-xl p-4 text-sm space-y-2">
              <p className="font-bold text-amber-800">⚠️ พบหน่วยไม่ตรงกัน {ambiguousDrugs.length} รายการ — ต้องแก้ไขใน CSV เบิก</p>
              <p className="text-amber-700 text-xs">รายการด้านล่างมีหน่วยหลายชนิดที่รวมกันไม่ได้ เช่น "เม็ด" กับ "ml" — ค่า rate อาจไม่ถูกต้อง กรุณาตรวจสอบและแก้หน่วยให้ตรงกันใน CSV ก่อนอัพโหลดใหม่</p>
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {ambiguousDrugs.map((u, i) => (
                  <div key={i} className="bg-white border border-amber-200 rounded-lg px-3 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="font-semibold text-slate-800 text-xs">{u.name || u.code}</span>
                    <span className="text-slate-400 text-xs">[{u.code}]</span>
                    <span className="text-amber-700 text-xs">
                      {Object.entries(u.unitVariants).sort((a,b) => b[1]-a[1]).map(([unit, qty]) =>
                        `${unit}: ${Math.round(qty).toLocaleString()}`
                      ).join('  |  ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary badges */}
          <div className="flex flex-wrap gap-3">
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2 text-center">
              <p className="text-2xl font-black text-rose-700">{lowStockItems.filter(i => i.belowSafety).length}</p>
              <p className="text-xs text-rose-500 font-medium">ต่ำกว่า Safety Stock</p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2 text-center">
              <p className="text-2xl font-black text-orange-700">{lowStockItems.filter(i => !i.belowSafety).length}</p>
              <p className="text-xs text-orange-500 font-medium">ถึง Reorder Point</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-center">
              <p className="text-2xl font-black text-slate-700">{lowStockItems.length}</p>
              <p className="text-xs text-slate-500 font-medium">รายการทั้งหมดที่ต้องสั่ง</p>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-auto rounded-xl border border-slate-200 shadow-sm bg-white" style={{maxHeight: 'calc(100vh - 180px)'}}>
            <table className="w-full text-base min-w-[780px]">
              <thead className="sticky top-0 z-20">
                <tr className="bg-slate-700 text-white text-sm">
                  <th className="px-3 py-2.5 text-left font-semibold sticky left-0 z-30 bg-slate-700 shadow-[2px_0_4px_rgba(0,0,0,0.15)]">รายการยา</th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">ชนิดยา</th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">หน่วย</th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">คงเหลือ</th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap bg-rose-800">
                    <div>Safety Stock</div>
                    <div className="text-[10px] font-normal opacity-80">ปัจจุบัน</div>
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap bg-violet-700">
                    <div>แนะนำ SS</div>
                    <div className="text-[10px] font-normal opacity-80">จากเรทจริง</div>
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap bg-orange-800">
                    <div>Reorder Point</div>
                    <div className="text-[10px] font-normal opacity-80">SS + เฉลี่ย×LT</div>
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap bg-cyan-700">
                    <div>ต้องซื้อ</div>
                    <div className="text-[10px] font-normal opacity-80">จากเรทจริง</div>
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Lead Time (วัน)</th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap bg-blue-800">
                    <div>รวมการใช้</div>
                    {usageDateRange && <div className="text-[10px] font-normal opacity-80">{usageDateRange.from} – {usageDateRange.to}</div>}
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap bg-blue-700">
                    <div>สูงสุด/เดือน</div>
                    {usageDateRange && <div className="text-[10px] font-normal opacity-80">4 เดือนล่าสุด</div>}
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap bg-blue-600">
                    <div>เฉลี่ย/เดือน</div>
                    {usageDateRange && <div className="text-[10px] font-normal opacity-80">4 เดือนล่าสุด</div>}
                  </th>
                  <th className="px-3 py-2.5 text-center font-semibold">สถานะ</th>
                  <th className="px-3 py-2.5 text-center font-semibold bg-emerald-800">สั่งแล้ว / วันที่</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.map((item, i) => {
                  const isOrdered = !!orderedItems[item.code];
                  return (
                    <tr key={item.code} className={`border-b border-slate-100 transition-colors ${isOrdered ? 'bg-emerald-50/60 opacity-70' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} ${!isOrdered && item.belowSafety ? 'bg-rose-50/60' : ''}`}>
                      <td className="px-4 py-3 sticky left-0 z-10 bg-white shadow-[2px_0_4px_rgba(0,0,0,0.06)]">
                        <span className={`font-semibold block text-base ${isOrdered ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.name}</span>
                        <span className="text-slate-400 text-sm">{item.code}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-sm whitespace-nowrap">{item.type !== '-' ? item.type : '—'}</td>
                      <td className="px-4 py-3 text-slate-600 text-sm whitespace-nowrap">{item.unit !== '-' ? item.unit : '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-700 text-base">
                        {item.currentQty.toLocaleString()}
                        <div className="w-full bg-slate-200 rounded-full h-2 mt-1">
                          <div
                            className={`h-2 rounded-full transition-all ${item.pct < 50 ? 'bg-rose-500' : item.pct < 100 ? 'bg-orange-400' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(item.pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">{item.pct}% ของ SS</span>
                      </td>
                      <td className="px-4 py-3 text-right text-rose-700 font-bold text-base">{item.safetyStock.toLocaleString()}</td>
                      {(() => {
                        const u = dispenseUsage[codeKey(item.code)] || dispenseUsage[nameKey(item.name)] || {};
                        const recSS = u.maxMonth > 0 ? Math.ceil(u.maxMonth * 2) : null;
                        const { packSize: ssPackSize } = parsePackUnit(item.unit);
                        const currentBase = item.safetyStock * ssPackSize;
                        let badge = null;
                        if (recSS != null) {
                          if (currentBase < recSS * 0.8) badge = { label: 'ควรเพิ่ม', cls: 'bg-rose-100 text-rose-700 border-rose-300' };
                          else if (currentBase > recSS * 2) badge = { label: 'Overstock', cls: 'bg-amber-100 text-amber-700 border-amber-300' };
                          else badge = { label: 'เหมาะสม', cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' };
                        }
                        return (
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {recSS != null ? (
                              <div className="flex flex-col items-end gap-1">
                                {(() => {
                                  const { packSize, label } = parsePackUnit(item.unit);
                                  const packs = Math.ceil(recSS / packSize);
                                  return (
                                    <span className="font-bold text-violet-700 text-base">
                                      {packs.toLocaleString()}
                                      {label && <><span className="text-xs font-normal text-violet-400 mx-1">×</span><span className="text-xs font-normal text-violet-400">{label}</span></>}
                                    </span>
                                  );
                                })()}
                                {badge && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>}
                              </div>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })()}
                      <td className="px-4 py-3 text-right text-orange-700 font-bold text-base">{item.reorderPoint.toLocaleString()}</td>
                      {(() => {
                        const u = dispenseUsage[codeKey(item.code)] || dispenseUsage[nameKey(item.name)] || {};
                        const ltMonths = (item.leadTime || 20) / 30;
                        const recSS = u.maxMonth > 0 ? Math.ceil(u.maxMonth * 2) : null;
                        const orderQty = recSS != null && u.avg > 0
                          ? Math.max(0, Math.ceil(recSS + (u.avg * ltMonths) - item.currentQty))
                          : null;
                        return (
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {orderQty != null ? (
                              orderQty > 0 ? (
                                (() => {
                                  const { packSize, label } = parsePackUnit(item.unit);
                                  const packs = Math.ceil(orderQty / packSize);
                                  return (
                                    <span className="font-black text-cyan-700 text-base">
                                      {packs.toLocaleString()}
                                      {label && <><span className="text-xs font-normal text-cyan-400 mx-1">×</span><span className="text-xs font-normal text-cyan-400">{label}</span></>}
                                    </span>
                                  );
                                })()
                              ) : (
                                <span className="text-emerald-600 font-semibold text-sm">เพียงพอ</span>
                              )
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })()}
                      <td className="px-4 py-3 text-right text-slate-500 text-base">{item.leadTime > 0 ? item.leadTime : '-'}</td>
                      {(() => {
                        const u = dispenseUsage[codeKey(item.code)] || dispenseUsage[nameKey(item.name)] || {};
                        const hasData = u.total != null;
                        const unit = u.baseUnit || '';
                        const isAmbiguous = u.ambiguous && u.ambiguous.length > 1;
                        const ambigDetail = isAmbiguous
                          ? Object.entries(u.unitVariants).sort((a,b) => b[1]-a[1]).map(([un, q]) => `${un}:${Math.round(q).toLocaleString()}`).join(' / ')
                          : null;
                        return (
                          <>
                            <td className={`px-4 py-3 text-right font-semibold text-sm ${isAmbiguous ? 'bg-amber-50' : ''}`}>
                              {hasData ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className={isAmbiguous ? 'text-amber-700' : 'text-blue-700'}>
                                    {isAmbiguous ? '⚠️ ' : ''}{u.total.toLocaleString()}
                                    {!isAmbiguous && unit && <span className="text-blue-400 text-xs ml-1">{unit}</span>}
                                  </span>
                                  {isAmbiguous && (
                                    <span className="text-[10px] text-amber-600 leading-tight text-right">{ambigDetail}</span>
                                  )}
                                </div>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className={`px-4 py-3 text-right font-semibold text-sm ${isAmbiguous ? 'bg-amber-50 text-amber-600' : 'text-blue-600'}`}>
                              {hasData ? <span>{u.maxMonth.toLocaleString()}{!isAmbiguous && <span className="text-blue-400 text-xs ml-1">{unit}</span>}</span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <td className={`px-4 py-3 text-right font-semibold text-sm ${isAmbiguous ? 'bg-amber-50 text-amber-500' : 'text-blue-500'}`}>
                              {hasData ? <span>{u.avg.toLocaleString()}{!isAmbiguous && <span className="text-blue-400 text-xs ml-1">{unit}</span>}</span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                          </>
                        );
                      })()}
                      <td className="px-4 py-3 text-center">
                        {item.belowSafety && !isOrdered ? (
                          <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-700 text-sm font-bold px-3 py-1 rounded-full border border-rose-200">
                            <AlertTriangle size={12}/> วิกฤต
                          </span>
                        ) : isOrdered ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-sm font-bold px-3 py-1 rounded-full border border-emerald-200">
                            <Check size={12}/> สั่งแล้ว
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-sm font-bold px-3 py-1 rounded-full border border-orange-200">
                            <Clock size={12}/> สั่งได้เลย
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center min-w-[140px]">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={() => toggleOrdered(item.code)}
                            className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-colors ${isOrdered ? 'bg-emerald-500 border-emerald-500 text-white hover:bg-red-400 hover:border-red-400' : 'border-slate-300 hover:border-emerald-400 hover:bg-emerald-50'}`}
                            title={isOrdered ? 'คลิกเพื่อยกเลิก' : 'คลิกเพื่อทำเครื่องหมายว่าสั่งแล้ว'}
                          >
                            {isOrdered && <Check size={12}/>}
                          </button>
                          {isOrdered && (
                            <input
                              type="date"
                              value={(() => { const d = orderedItems[item.code]; if (!d || d.includes('/')) { return new Date().toISOString().slice(0,10); } return d; })()}
                              onChange={e => {
                                const val = e.target.value;
                                setOrderedItems(prev => {
                                  const next = { ...prev, [item.code]: val };
                                  localStorage.setItem('orderedItems', JSON.stringify(next));
                                  return next;
                                });
                              }}
                              className="border border-emerald-300 rounded px-1 py-0.5 text-[10px] text-emerald-700 bg-emerald-50 w-28"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            * Reorder Point = Safety Stock + (Safety Stock ÷ 60 วัน × Lead Time) — สั่งเมื่อคงเหลือถึงจุดนี้เพื่อไม่ให้ขาดก่อนของมา · รายการที่ไม่มี Lead Time ใช้ค่า default = 20 วัน
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-200 p-4 md:p-6 font-sans text-slate-800 pb-20">
      <div className="max-w-[1400px] mx-auto space-y-6">
        
        {/* Header & Controls */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-600 rounded-2xl shadow-md p-6 flex flex-col gap-6">

          {onBackToDashboard && (
            <button
              onClick={onBackToDashboard}
              className="self-start flex items-center gap-1.5 text-indigo-200 hover:text-white text-sm font-medium transition-colors"
            >
              ← กลับหน้าหลัก
            </button>
          )}

          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">

            <div className="flex items-center gap-4">
              <div className="p-4 bg-white/20 text-white rounded-xl shadow-inner relative overflow-hidden shrink-0">
                <Database size={28} className="relative z-10" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  ระบบแผนผังและข้อมูลคลังยา
                </h1>
                {isStaff && (
                  <div className="text-sm text-indigo-100 mt-2 flex flex-col sm:flex-row gap-2">
                    <div className="flex items-center gap-2 flex-wrap bg-white/15 px-3 py-1.5 rounded-lg border border-white/20">
                      <span>📦 Log คลัง: <span className="text-white font-medium">{logFileName || 'ข้อมูลตั้งต้น (Mockup)'}</span></span>
                      {logUpdateDate ? (
                        <span className="flex items-center gap-1 text-[11px] bg-white/25 text-white px-2 py-0.5 rounded-md font-medium shadow-sm">
                          <Clock size={12} /> อัปโหลดเมื่อ: {formatDateTime(logUpdateDate)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] bg-white/15 text-indigo-200 px-2 py-0.5 rounded-md font-medium shadow-sm">
                          <Clock size={12} /> ข้อมูลระบบเริ่มต้น
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap bg-white/15 px-3 py-1.5 rounded-lg border border-white/20">
                      <span>💊 ข้อมูลยา: <span className="text-white font-medium">ดึงจากประวัติรับยา</span></span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col xl:items-end gap-2 bg-white/15 p-4 rounded-xl border border-white/25 w-full xl:w-auto shadow-sm">
              <div className="text-xs text-indigo-100 font-medium flex items-center gap-1.5 mb-2 bg-white/20 px-3 py-1.5 rounded-full border border-white/20 shadow-sm w-fit">
                <AlertCircle size={14} className="text-white" />
                กระดานแจ้งเตือนสถานะ (คำนวณวันหมดอายุ 16 เดือน: {formatDateDisplay(todayForDisplay)} - {formatDateDisplay(targetDateForDisplay)})
              </div>
              <div className="flex flex-wrap gap-3 w-full xl:w-auto">
                <div 
                  onClick={() => expiredItems.length > 0 && setExpiryViewFilter('expired')}
                  className={`flex-1 xl:flex-none flex items-center justify-between gap-4 px-4 py-2 rounded-lg border-2 transition-all min-w-[150px] ${expiredItems.length > 0 ? 'bg-rose-50 border-rose-300 hover:border-rose-500 cursor-pointer text-rose-700 shadow-sm' : 'bg-white border-slate-200 opacity-60 text-slate-400'}`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <AlertTriangle size={16} /> หมดอายุ
                  </div>
                  <span className="text-xl font-black">{expiredItems.length}</span>
                </div>

                <div 
                  onClick={() => nearExpiryItems.length > 0 && setExpiryViewFilter('near')}
                  className={`flex-1 xl:flex-none flex items-center justify-between gap-4 px-4 py-2 rounded-lg border-2 transition-all min-w-[150px] ${nearExpiryItems.length > 0 ? 'bg-amber-50 border-amber-300 hover:border-amber-500 cursor-pointer text-amber-700 shadow-sm' : 'bg-white border-slate-200 opacity-60 text-slate-400'}`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <Clock size={16} /> ใกล้หมดอายุ
                  </div>
                  <span className="text-xl font-black">{nearExpiryItems.length}</span>
                </div>

                <div
                  onClick={() => pendingReceiveItems.length > 0 && setExpiryViewFilter('pending')}
                  className={`flex-1 xl:flex-none flex items-center justify-between gap-4 px-4 py-2 rounded-lg border-2 transition-all min-w-[150px] ${pendingReceiveItems.length > 0 ? 'bg-sky-50 border-sky-300 hover:border-sky-500 cursor-pointer text-sky-700 shadow-sm' : 'bg-white border-slate-200 opacity-60 text-slate-400'}`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <Package size={16} /> รอตรวจรับ
                  </div>
                  <span className="text-xl font-black">{pendingReceiveItems.length}</span>
                </div>

                {isStaff && (
                  <div
                    onClick={() => setView('order')}
                    className={`flex-1 xl:flex-none flex items-center justify-between gap-4 px-4 py-2 rounded-lg border-2 transition-all min-w-[150px] cursor-pointer ${lowStockItems.length > 0 ? 'bg-orange-50 border-orange-400 hover:border-orange-600 text-orange-700 shadow-sm animate-pulse' : 'bg-white border-slate-200 hover:border-slate-400 text-slate-400'}`}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <AlertTriangle size={16} /> ระบบสั่งยา
                    </div>
                    <span className="text-xl font-black">{lowStockItems.length}</span>
                  </div>
                )}
              </div>
            </div>

          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-slate-100">
            <DrugSearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              options={drugNamesList}
              placeholder="ค้นหาชื่อยา, รหัส, ตำแหน่ง, Lot, บิล..."
              ringClass="focus:ring-indigo-500"
              hoverClass="hover:bg-indigo-50 hover:text-indigo-700"
              className="w-full sm:max-w-md"
              inputClassName="py-2.5 shadow-sm"
            />
            
            <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
              <div className="flex flex-wrap justify-end gap-2 w-full sm:w-auto">
                <button onClick={() => setShowSummaryModal(true)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl font-medium transition-colors shadow-sm text-sm">
                  <BarChart3 size={16} /> สรุปข้อมูล
                </button>

                {isStaff && <>
                  <button onClick={() => setShowResetConfirm(true)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2.5 rounded-xl font-medium transition-colors shadow-sm text-sm">
                    <RefreshCcw size={16} /> รีเซ็ตข้อมูล
                  </button>

                  <div className="flex gap-1">
                    <button onClick={() => logInputRef.current?.click()} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-medium transition-colors shadow-sm text-sm">
                      <UploadCloud size={16} /> อัปโหลด Log
                    </button>
                    <button onClick={() => setShowColumnGuide(showColumnGuide === 'log' ? null : 'log')} className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-2.5 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm" title="ดูคอลัมน์ที่ต้องการ">?</button>
                  </div>
                  <input type="file" accept=".csv, text/csv, application/csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ref={logInputRef} onChange={handleLogFileUpload} className="hidden" />

                  <button onClick={() => receiveInputRef.current?.click()} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-medium transition-colors shadow-sm text-sm">
                    <UploadCloud size={16} /> อัปโหลดประวัติรับยา
                  </button>
                  <input type="file" accept=".csv, text/csv, application/csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ref={receiveInputRef} onChange={handleReceiveFileUpload} className="hidden" />

                </>}
              </div>
              {isStaff && <span className="text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">*อัปโหลดได้เฉพาะไฟล์ .csv เท่านั้น (หากบันทึกจาก Excel ในมือถือ ให้บันทึกเป็น CSV ก่อน)</span>}
              {/* Column Guide Popup */}
              {showColumnGuide && (
                <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-lg p-4 mt-1 space-y-3">
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
                  {showColumnGuide === 'drug' && <p className="text-xs text-slate-400">💡 สามารถใช้ไฟล์ Log คลังยาไฟล์เดียวกันได้</p>}
                </div>
              )}
            </div>
          </div>
        </div>

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

        {searchTerm && searchResults.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            <div className="bg-amber-500 text-white py-3 px-6 flex justify-between items-center">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Search size={20} /> ผลการค้นหา: พบ {searchResults.length} รายการ
              </h2>
            </div>
            <div className="p-6 bg-slate-50/50 max-h-[600px] overflow-y-auto">
              <div className="grid grid-cols-1 gap-4">
                {searchResults.map((item) => renderItemCard(item, item.originalIndex, item.location))}
              </div>
            </div>
          </div>
        )}

        {Object.keys(filteredLayout).length === 0 && Object.keys(filteredOtherZones).length === 0 && searchTerm ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 flex flex-col items-center justify-center text-slate-500">
            <Search size={48} className="text-slate-300 mb-4" />
            <h3 className="text-xl font-bold text-slate-700 mb-2">ไม่พบรายการที่ค้นหา</h3>
          </div>
        ) : (
          <>
            {searchTerm && searchResults.length > 0 && (
              <h3 className="text-lg font-bold text-slate-700 mb-2 flex items-center gap-2">
                <MapPin size={20} className="text-indigo-500" /> ตำแหน่งบนแผนผัง
              </h3>
            )}
            <div className="grid grid-cols-1 gap-6">
              {Object.keys(filteredLayout).sort().map(cabinet => (
                <div key={cabinet} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-900 to-slate-600 text-white py-3 px-5 flex justify-between items-center">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <Layers size={20} /> Log {cabinet}
                    </h2>
                    <div className="flex gap-2">
                      <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-medium">
                        {summary[cabinet]?.names.size || 0} รายการยา
                      </span>
                      <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-medium">
                        {summary[cabinet]?.lots.size || 0} Lot
                      </span>
                    </div>
                  </div>
                  
                  <div className="p-5 bg-slate-50/50 space-y-4">
                    {Object.keys(filteredLayout[cabinet]).sort((a, b) => Number(a) - Number(b)).map(level => (
                      <div key={`${cabinet}-${level}`} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                        <div className="w-full sm:w-16 shrink-0 bg-slate-200 text-slate-700 text-center font-bold py-2 rounded-lg text-sm border border-slate-300">
                          ชั้น {level}
                        </div>
                        <div className="flex-1 flex flex-wrap gap-2 w-full">
                          {filteredLayout[cabinet][level].map(slot => (
                            <Slot key={slot.id} id={slot.id} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {Object.keys(filteredOtherZones).length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6">
                <div className="bg-slate-700 text-white py-3 px-5 flex justify-between items-center">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <FileSpreadsheet size={20} /> โซนอื่นๆ หรือจัดเก็บแบบเหมาโซน
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
                      {r.location && <span className="text-slate-500 ml-2 text-xs">📍{r.location}</span>}
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
        const summaryRows = Object.entries(summary).sort((a, b) => b[1].names.size - a[1].names.size);

        return (
          <div className="fixed inset-0 bg-slate-900/70 flex items-start justify-center z-50 p-4 pt-6 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col animate-in fade-in zoom-in duration-200 mb-6">

              {/* Header */}
              <div className="bg-gradient-to-r from-slate-800 to-indigo-900 p-5 flex justify-between items-center text-white shrink-0 rounded-t-2xl">
                <h3 className="text-xl font-bold flex items-center gap-3">
                  <BarChart3 size={24} className="text-indigo-300" />
                  สรุปข้อมูลคลังยา — Summary Dashboard
                </h3>
                <button onClick={() => setShowSummaryModal(false)} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6 bg-slate-50/30">

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: 'พื้นที่จัดเก็บ', value: totalCabinets, unit: 'แห่ง', icon: <MapPin size={18}/>, bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', val: 'text-indigo-900' },
                    { label: 'รายการยา (Unique)', value: overallStats?.names || 0, unit: 'รายการ', icon: <Pill size={18}/>, bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', val: 'text-emerald-900' },
                    { label: 'จำนวน Lot', value: overallStats?.lots || 0, unit: 'Lot', icon: <Layers size={18}/>, bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', val: 'text-sky-900' },
                    { label: 'หมดอายุแล้ว', value: expiredItems.length, unit: 'รายการ', icon: <AlertTriangle size={18}/>, bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-700', val: 'text-rose-800' },
                    { label: 'ใกล้หมดอายุ', value: nearExpiryItems.length, unit: 'รายการ', icon: <Clock size={18}/>, bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', val: 'text-amber-800' },
                    { label: 'รอตรวจรับ', value: pendingReceiveItems.length, unit: 'รายการ', icon: <Package size={18}/>, bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', val: 'text-purple-900' },
                  ].map((k, i) => (
                    <div key={i} className={`${k.bg} border ${k.border} rounded-xl p-4 shadow-sm flex flex-col gap-1`}>
                      <div className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${k.text}`}>{k.icon}{k.label}</div>
                      <div className={`text-2xl font-black ${k.val}`}>{k.value.toLocaleString()}</div>
                      <div className="text-xs text-slate-500">{k.unit}</div>
                    </div>
                  ))}
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

                {/* Bar: Storage Areas */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                  <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                    <Layers size={18} className="text-indigo-500" /> จำนวนรายการยาแยกตามพื้นที่จัดเก็บ
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 max-h-[220px] overflow-y-auto pr-1">
                    {summaryRows.map(([cab, data]) => (
                      <div key={cab}>
                        <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                          <span className="flex items-center gap-1"><MapPin size={11} className="opacity-40"/> Log {cab}</span>
                          <span className="font-bold text-slate-700">{data.names.size} รายการ <span className="text-slate-400 font-normal">· {data.lots.size} Lot</span></span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-indigo-500 h-2 rounded-full"
                            style={{ width: `${maxLogCount > 0 ? (data.names.size / maxLogCount) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Table */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-slate-700 text-white px-5 py-3 flex items-center gap-2 text-sm font-bold">
                    <Database size={16} className="text-slate-300" /> ตารางสรุปรายละเอียด
                  </div>
                  <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-100 text-slate-600 text-xs uppercase tracking-wide">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold">#</th>
                          <th className="px-4 py-3 text-left font-bold">พื้นที่จัดเก็บ</th>
                          <th className="px-4 py-3 text-right font-bold">รายการยา (Unique)</th>
                          <th className="px-4 py-3 text-right font-bold">จำนวน Lot</th>
                          <th className="px-4 py-3 text-right font-bold">Lot รวม</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {summaryRows.map(([cab, data], i) => (
                          <tr key={cab} className={`hover:bg-indigo-50/50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                            <td className="px-4 py-3 text-slate-400 text-xs font-medium">{i + 1}</td>
                            <td className="px-4 py-3 font-semibold text-slate-800 flex items-center gap-1.5">
                              <MapPin size={13} className="text-indigo-400 shrink-0"/> Log {cab}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-indigo-700">{data.names.size.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-700">{data.lots.size.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-slate-500">{data.total.toLocaleString()}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-800 text-white font-bold text-sm">
                          <td className="px-4 py-3" colSpan={2}>รวมทั้งหมด</td>
                          <td className="px-4 py-3 text-right">{(overallStats?.names || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">{(overallStats?.lots || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">{summaryRows.reduce((s, [, d]) => s + d.total, 0).toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
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

      {expiryViewFilter && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className={`p-5 flex justify-between items-center text-white shrink-0 rounded-t-2xl ${trackingModal.bg}`}>
              <h3 className="text-xl font-bold flex items-center gap-2">
                {TrackingModalIcon && <TrackingModalIcon size={24} className={trackingModal.text} />}
                {trackingModal.title}
              </h3>
              <button onClick={() => { setExpiryViewFilter(null); setModalSearch(''); }} className="text-white/70 hover:text-white transition-colors bg-black/10 p-2 rounded-xl hover:bg-black/20">
                <X size={20} />
              </button>
            </div>
            
            <div className="px-6 pt-4 pb-2 bg-white border-b border-slate-200 shrink-0">
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
            </div>

            <div className="p-6 overflow-y-auto bg-slate-50">
              {(() => {
                const q = modalSearch.trim().toLowerCase();
                const displayList = q
                  ? trackingModal.list.filter(item =>
                      (item.name || '').toLowerCase().includes(q) ||
                      (item.invoice || '').toLowerCase().includes(q)
                    )
                  : trackingModal.list;
                return (
                  <div className="space-y-4">
                    <div className="text-slate-500 mb-2 border-b border-slate-200 pb-3 flex justify-between items-end">
                      <span className="font-medium text-slate-700">
                        {q ? `ผลการค้นหา: ${displayList.length} รายการ` : `พบทั้งหมด ${trackingModal.list.length} รายการ`}
                        {expiryViewFilter !== 'pending' && !q && ' (เรียงตามวันที่หมดอายุก่อน)'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {displayList.map((item, idx) => renderItemCard(item, idx, item.location))}
                    </div>
                    {q && displayList.length === 0 && <p className="text-center text-slate-400 py-10">ไม่พบรายการที่ค้นหา</p>}
                  </div>
                );
              })()}
            </div>
            
            <div className="bg-white p-4 border-t border-slate-200 flex justify-end shrink-0 rounded-b-2xl">
              <button onClick={() => { setExpiryViewFilter(null); setModalSearch(''); }} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors shadow-sm">
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

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