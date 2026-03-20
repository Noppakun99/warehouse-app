import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { fetchInventory, saveInventory, fetchDrugDetails, saveDrugDetails, fetchUploadMeta, saveUploadMeta } from './lib/db';
import { 
  Search, Package, MapPin, X, UploadCloud, FileSpreadsheet, 
  AlertCircle, BarChart3, Layers, Pill, FileText, ChevronDown, 
  ChevronUp, Database, Clock, Info, Copy, Check, CalendarDays, AlertTriangle, RefreshCcw
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

// บังคับ รหัสยา เป็น text (ป้องกัน Excel แปลง "003" → 3)
const normalizeCode = (val) => {
  if (!val && val !== 0) return '-';
  return String(val).trim() || '-';
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

export default function App({ onBackToDashboard }) {
  const [inventory, setInventory] = useState(initialInventory);
  const [drugDetails, setDrugDetails] = useState(initialDrugDetails);
  const [logFileName, setLogFileName] = useState('');
  const [drugFileName, setDrugFileName] = useState('');
  const [logUpdateDate, setLogUpdateDate] = useState(null);
  const [drugUpdateDate, setDrugUpdateDate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [expandedDetailsId, setExpandedDetailsId] = useState(null);
  const [expiryViewFilter, setExpiryViewFilter] = useState(null); 
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  
  const logInputRef = useRef(null);
  const drugInputRef = useRef(null);

  // โหลดข้อมูลจาก Supabase เมื่อแอปเริ่มทำงาน
  useEffect(() => {
    async function loadFromSupabase() {
      try {
        setIsLoading(true);
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
          if (meta?.drug_details?.file_name) setDrugFileName(meta.drug_details.file_name);
          if (meta?.drug_details?.updated_at) setDrugUpdateDate(new Date(meta.drug_details.updated_at));
        }
      } catch (err) {
        setErrorMsg('ไม่สามารถเชื่อมต่อ Supabase: ' + err.message + ' (ใช้ข้อมูลท้องถิ่นแทน)');
        setTimeout(() => setErrorMsg(''), 8000);
      } finally {
        setIsLoading(false);
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

  // คำนวณรายการยารอตรวจรับ
  const pendingReceiveItems = useMemo(() => {
    const pending = [];
    Object.entries(inventory).forEach(([loc, items]) => {
      items.forEach((item, idx) => {
        if (item.receiveStatus === 'รอตรวจรับ') {
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
      if (meta?.drug_details?.file_name) setDrugFileName(meta.drug_details.file_name);
      if (meta?.drug_details?.updated_at) setDrugUpdateDate(new Date(meta.drug_details.updated_at));
      setErrorMsg('');
      setSuccessMsg('โหลดข้อมูลล่าสุดจาก Supabase เรียบร้อยแล้ว');
    } catch (err) {
      setErrorMsg('โหลดข้อมูลล้มเหลว: ' + err.message);
    }
    setTimeout(() => setSuccessMsg(''), 5000);
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
        const unitIdx = headers.findIndex(h => h.includes('หน่วย') || h.toLowerCase().includes('unit'));
        const lotIdx = headers.findIndex(h => h.toLowerCase().includes('lot') || h.includes('รุ่น'));
        const expIdx = headers.findIndex(h => h.toLowerCase().includes('exp') || h.includes('หมดอายุ'));
        const qtyIdx = headers.findIndex(h => h.includes('คงเหลือ') || h.toLowerCase() === 'qty');
        const invoiceIdx = headers.findIndex(h => h.includes('บิล') || h.includes('ใบเสร็จ') || h.toLowerCase().includes('invoice') || h.toLowerCase().includes('inv'));
        const statusIdx = headers.findIndex(h => h.includes('สถานะ') || h.includes('ตรวจรับ') || h.toLowerCase().includes('status'));

        const newInventory = {};

        for (let i = headerRowIndex + 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          
          const row = parseCSVRow(lines[i]);
          const location = row[logIdx]?.trim() || '';
          const code = codeIdx !== -1 && row[codeIdx] ? row[codeIdx].trim() : '-';
          const name = row[nameIdx]?.trim() || '';

          if (!location || (!name && code === '-')) continue;

          const qtyStr = qtyIdx !== -1 && row[qtyIdx] ? row[qtyIdx].trim() : '-';
          
          if (qtyStr !== '-') {
            const numericQty = parseFloat(qtyStr.replace(/,/g, ''));
            if (!isNaN(numericQty) && numericQty <= 0) continue; 
          }

          if (!newInventory[location]) newInventory[location] = [];

          newInventory[location].push({
            code: normalizeCode(code),
            name,
            type: typeIdx !== -1 && row[typeIdx] ? row[typeIdx].trim() : '-',
            unit: unitIdx !== -1 && row[unitIdx] ? row[unitIdx].trim() : '-',
            lot: lotIdx !== -1 && row[lotIdx]?.trim() ? String(row[lotIdx].trim()) : '-',
            exp: normalizeDateStr(expIdx !== -1 ? row[expIdx] : '-'),
            qty: qtyStr,
            invoice: invoiceIdx !== -1 && row[invoiceIdx]?.trim() ? row[invoiceIdx].trim() : '-',
            receiveStatus: statusIdx !== -1 && row[statusIdx]?.trim() ? row[statusIdx].trim() : 'ไม่มีการดำเนินการ'
          });
        }

        const now = new Date();

        setInventory(newInventory);
        setLogFileName(file.name);
        setLogUpdateDate(now);
        setErrorMsg('');
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

  const handleDrugFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r?\n/);
        
        if (lines.length < 2) throw new Error("ไฟล์ข้อมูลยาว่างเปล่า");

        const headers = parseCSVRow(lines[0]);
        const codeIdx = headers.findIndex(h => h.includes('รหัสยา') || h.includes('รหัส') || h.toLowerCase().includes('code'));
        const nameIdx = headers.findIndex(h => h.includes('รายการยา') || h.includes('ชื่อยา') || h.toLowerCase().includes('drug'));
        const lotIdx = headers.findIndex(h => h.toLowerCase().includes('lot') || h.includes('รุ่น'));
        const invoiceIdx = headers.findIndex(h => h.includes('บิล') || h.includes('ใบเสร็จ') || h.toLowerCase().includes('invoice') || h.toLowerCase().includes('inv'));

        if (codeIdx === -1) throw new Error('ไฟล์ข้อมูลยา ต้องมีคอลัมน์ "รหัสยา" หรือ "Code"');

        const newDrugDetails = {};

        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          const row = parseCSVRow(lines[i]);
          
          const drugCode = normalizeCode(row[codeIdx]);
          const drugName = nameIdx !== -1 && row[nameIdx] ? row[nameIdx].trim() : '-';
          const lot = lotIdx !== -1 && row[lotIdx]?.trim() ? String(row[lotIdx].trim()) : '-';
          const invoice = invoiceIdx !== -1 && row[invoiceIdx]?.trim() ? row[invoiceIdx].trim() : '-';

          if (!drugCode || drugCode === '-') continue;

          // คำสำคัญที่บ่งบอกว่าคอลัมน์นั้นเป็นวันที่
          const DATE_KEYWORDS = ['exp', 'วันที่', 'date', 'หมดอายุ'];
          const isDateCol = (h) => DATE_KEYWORDS.some(k => h.toLowerCase().includes(k));

          // หาคอลัมน์ exp สำหรับ fallback matching
          const expHeaderIdx = headers.findIndex(h => {
            const hl = h.toLowerCase();
            return hl.includes('exp') || hl.includes('หมดอายุ');
          });

          let details = {
            _code: drugCode,
            _name: drugName,
            _lot: lot,
            _invoice: invoice,
            _exp: expHeaderIdx !== -1 && row[expHeaderIdx]?.trim() ? normalizeDateStr(row[expHeaderIdx].trim()) : '-'
          };

          headers.forEach((headerName, index) => {
            if (row[index] && row[index].trim() !== '') {
              const val = row[index].trim();
              details[headerName.trim()] = isDateCol(headerName) ? normalizeDateStr(val) : val;
            }
          });

          const compositeKey = `${drugCode.toLowerCase()}|${lot.toLowerCase()}|${invoice.toLowerCase()}`;
          newDrugDetails[compositeKey] = details;
        }

        const now = new Date();

        setDrugDetails(newDrugDetails);
        setDrugFileName(file.name);
        setDrugUpdateDate(now);
        setErrorMsg('');
        setSuccessMsg(`กำลังบันทึกฐานข้อมูลยา "${file.name}" ขึ้น Supabase...`);

        saveDrugDetails(newDrugDetails)
          .then(() => saveUploadMeta('drug_details', file.name))
          .then(() => {
            setSuccessMsg(`อัปโหลดฐานข้อมูลยาและ "แทนที่ข้อมูลเดิม" ด้วยไฟล์ "${file.name}" สำเร็จ`);
            setTimeout(() => setSuccessMsg(''), 5000);
          })
          .catch(err => setErrorMsg('บันทึกขึ้น Supabase ล้มเหลว: ' + err.message));
        
      } catch (err) { setErrorMsg(err.message); }
    };
    reader.onerror = () => setErrorMsg("เกิดข้อผิดพลาดในการอ่านไฟล์ข้อมูลยา");
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
    setSelectedLocation({
      id: locationId,
      items: inventory[locationId] || []
    });
    setExpandedDetailsId(null);
  };

  const toggleDetails = (id) => {
    setExpandedDetailsId(expandedDetailsId === id ? null : id);
  };

  const Slot = ({ id }) => {
    const itemCount = inventory[id] ? inventory[id].length : 0;
    const highlighted = isMatch(id);
    
    let hasExpired = false;
    let hasNearExpiry = false;

    inventory[id]?.forEach(item => {
       const d = parseDateString(item.exp);
       if (!d) return;
       d.setHours(0,0,0,0);
       if (d < todayForDisplay) hasExpired = true;
       else if (d <= targetDateForDisplay) hasNearExpiry = true;
    });

    let statusClasses = 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100';
    let countClasses = 'text-emerald-600';
    let StatusIcon = null;

    if (hasExpired) {
      statusClasses = 'bg-rose-50 border-rose-400 text-rose-800 hover:bg-rose-100';
      countClasses = 'text-rose-600';
      StatusIcon = <AlertTriangle size={12} className="absolute top-1 right-1 text-rose-500" />;
    } else if (hasNearExpiry) {
      statusClasses = 'bg-amber-50 border-amber-400 text-amber-800 hover:bg-amber-100';
      countClasses = 'text-amber-600';
      StatusIcon = <Clock size={12} className="absolute top-1 right-1 text-amber-500" />;
    }

    return (
      <div 
        onClick={() => handleLocationClick(id)}
        className={`
          relative cursor-pointer transition-all duration-200 border rounded-lg flex items-center justify-center text-xs font-bold px-3 py-3 min-w-[70px] flex-1
          ${highlighted ? 'ring-4 ring-yellow-400 scale-105 z-10 shadow-lg' : 'shadow-sm hover:scale-105 hover:shadow-md'}
          ${statusClasses}
        `}
      >
        <div className="flex flex-col items-center">
          <span>{id}</span>
          <span className={`text-[10px] font-medium mt-1 ${countClasses}`}>
            {itemCount} รายการ
          </span>
          {StatusIcon}
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
    const lookupExp = item.exp?.trim() || '-';

    // 1) ค้นหา exact match ด้วย code|lot|invoice
    const exactKey = `${lookupCode}|${lookupLot}|${lookupInvoice}`;
    const exactMatch = drugDetails[exactKey];

    // 2) ถ้าไม่พบ → fallback ค้นด้วย code + lot + exp (ดึงทุกบิลที่ตรงกัน)
    let allMatchedDetails;
    if (exactMatch) {
      allMatchedDetails = [exactMatch];
    } else {
      const fallbacks = Object.values(drugDetails).filter(d =>
        d._code?.toLowerCase() === lookupCode &&
        d._lot?.toLowerCase() === lookupLot &&
        // ถ้า _exp ไม่มีในฐานข้อมูลเก่า หรือ lookupExp เป็น '-' → match ด้วย code+lot เพียงอย่างเดียว
        (lookupExp === '-' || !d._exp || d._exp === '-' || d._exp === lookupExp)
      );
      allMatchedDetails = fallbacks;
    }

    const hasDrugDetails = allMatchedDetails.length > 0;

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

    const isPendingStatus = item.receiveStatus === 'รอตรวจรับ' || item.isPending;

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
                onClick={() => hasDrugDetails && toggleDetails(uniqueItemId)}
                disabled={!hasDrugDetails}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  !hasDrugDetails
                    ? 'bg-rose-50 text-rose-500 border-rose-200 cursor-default'
                    : isExpanded 
                      ? 'bg-slate-100 text-slate-700 border-slate-300' 
                      : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 cursor-pointer'
                }`}
              >
                {!hasDrugDetails ? (
                  <span className="flex items-center gap-1.5"><AlertCircle size={16} /> ไม่พบในฐานข้อมูลยา</span>
                ) : isExpanded ? (
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
                <div className="text-[11px] text-slate-500 uppercase font-bold tracking-wider mb-1">จำนวนคงเหลือ</div>
                <div className={`text-sm font-black ${item.isPending ? 'text-sky-700' : 'text-slate-700'}`}>{item.qty}</div>
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

            {isExpanded && hasDrugDetails && (
              <div className="mt-4 space-y-3">
                {allMatchedDetails.map((detailRecord, recordIdx) => {
                  const displayableFields = Object.entries(detailRecord).filter(
                    ([key, val]) => !key.startsWith('_') && val !== undefined && val !== ''
                  );
                  return (
                    <div key={recordIdx} className="bg-teal-50/50 rounded-xl p-4 border border-teal-100 relative overflow-hidden">
                      <div className="absolute -right-4 -top-4 text-teal-100/50 opacity-50"><Database size={100} /></div>
                      <h5 className="font-bold text-teal-800 flex items-center gap-2 mb-3 relative z-10 border-b border-teal-200/50 pb-2">
                        <FileText size={18} /> ข้อมูลอ้างอิงจากฐานข้อมูลยา
                        {allMatchedDetails.length > 1 && (
                          <span className="ml-1 text-xs bg-teal-200 text-teal-900 px-2 py-0.5 rounded-full font-medium">
                            บิล {recordIdx + 1}/{allMatchedDetails.length} — {detailRecord._invoice || '-'}
                          </span>
                        )}
                      </h5>
                      <div className="relative z-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                          {displayableFields.map(([key, val], i) => (
                            <div key={i} className="flex flex-col">
                              <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wide">{key}</span>
                              <span className="text-sm text-slate-700 mt-0.5 whitespace-pre-line leading-snug">{val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
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


  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6 font-sans text-slate-800 pb-20">
      <div className="max-w-[1400px] mx-auto space-y-6">
        
        {/* Header & Controls */}
        <div className="bg-white rounded-2xl shadow-sm p-6 flex flex-col gap-6 border border-slate-200">

          {onBackToDashboard && (
            <button
              onClick={onBackToDashboard}
              className="self-start flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 text-sm font-medium transition-colors"
            >
              ← กลับหน้าหลัก
            </button>
          )}

          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">

            <div className="flex items-center gap-4">
              <div className="p-4 bg-indigo-100 text-indigo-700 rounded-xl shadow-inner relative overflow-hidden shrink-0">
                <Database size={28} className="relative z-10" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  ระบบแผนผังและข้อมูลคลังยา
                </h1>
                <div className="text-sm text-slate-500 mt-2 flex flex-col sm:flex-row gap-2">
                  <div className="flex items-center gap-2 flex-wrap bg-slate-50/50 px-3 py-1.5 rounded-lg border border-slate-100">
                    <span>📦 Log คลัง: <span className="text-slate-700 font-medium">{logFileName || 'ข้อมูลตั้งต้น (Mockup)'}</span></span>
                    {logUpdateDate ? (
                      <span className="flex items-center gap-1 text-[11px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md font-medium shadow-sm">
                        <Clock size={12} /> อัปโหลดเมื่อ: {formatDateTime(logUpdateDate)}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-medium shadow-sm">
                        <Clock size={12} /> ข้อมูลระบบเริ่มต้น
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap bg-slate-50/50 px-3 py-1.5 rounded-lg border border-slate-100">
                    <span>💊 ข้อมูลยา: <span className="text-slate-700 font-medium">{drugFileName || 'ข้อมูลตั้งต้น (Mockup)'}</span></span>
                    {drugUpdateDate ? (
                      <span className="flex items-center gap-1 text-[11px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-md font-medium shadow-sm">
                        <Clock size={12} /> อัปโหลดเมื่อ: {formatDateTime(drugUpdateDate)}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-medium shadow-sm">
                        <Clock size={12} /> ข้อมูลระบบเริ่มต้น
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col xl:items-end gap-2 bg-slate-50 p-4 rounded-xl border border-slate-200 w-full xl:w-auto shadow-sm">
              <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mb-2 bg-white px-3 py-1.5 rounded-full border border-slate-100 shadow-sm w-fit">
                <AlertCircle size={14} className="text-indigo-400" />
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
              </div>
            </div>

          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-slate-100">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="ค้นหาชื่อยา, รหัส, ตำแหน่ง, Lot, บิล..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm text-sm"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            
            <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
              <div className="flex flex-wrap justify-end gap-2 w-full sm:w-auto">
                <button onClick={() => setShowSummaryModal(true)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl font-medium transition-colors shadow-sm text-sm">
                  <BarChart3 size={16} /> สรุปข้อมูล
                </button>

                <button onClick={() => setShowResetConfirm(true)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2.5 rounded-xl font-medium transition-colors shadow-sm text-sm">
                  <RefreshCcw size={16} /> รีเซ็ตข้อมูล
                </button>

                <button onClick={() => logInputRef.current?.click()} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-medium transition-colors shadow-sm text-sm">
                  <UploadCloud size={16} /> อัปโหลด Log
                </button>
                <input type="file" accept=".csv, text/csv, application/csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ref={logInputRef} onChange={handleLogFileUpload} className="hidden" />

                <button onClick={() => drugInputRef.current?.click()} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl font-medium transition-colors shadow-sm text-sm">
                  <FileText size={16} /> อัปโหลดข้อมูลยา
                </button>
                <input type="file" accept=".csv, text/csv, application/csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ref={drugInputRef} onChange={handleDrugFileUpload} className="hidden" />
              </div>
              <span className="text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">*อัปโหลดได้เฉพาะไฟล์ .csv เท่านั้น (หากบันทึกจาก Excel ในมือถือ ให้บันทึกเป็น CSV ก่อน)</span>
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
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {Object.keys(filteredLayout).sort().map(cabinet => (
                <div key={cabinet} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-indigo-600 text-white py-3 px-5 flex justify-between items-center">
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
              <button onClick={() => setExpiryViewFilter(null)} className="text-white/70 hover:text-white transition-colors bg-black/10 p-2 rounded-xl hover:bg-black/20">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto bg-slate-50">
              <div className="space-y-4">
                <div className="text-slate-500 mb-2 border-b border-slate-200 pb-3 flex justify-between items-end">
                  <span className="font-medium text-slate-700">
                    พบทั้งหมด {trackingModal.list.length} รายการ
                    {expiryViewFilter !== 'pending' && ' (เรียงตามวันที่หมดอายุก่อน)'}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {trackingModal.list.map((item, idx) => renderItemCard(item, idx, item.location))}
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 border-t border-slate-200 flex justify-end shrink-0 rounded-b-2xl">
              <button onClick={() => setExpiryViewFilter(null)} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors shadow-sm">
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