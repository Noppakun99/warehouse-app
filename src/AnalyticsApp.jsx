import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend,
} from 'recharts';
import {
  Activity, TrendingUp, Package, Building2, Banknote, RefreshCcw,
  BarChart2, CalendarDays, FileText, Layers, AlertTriangle, ChevronDown, ChevronUp, FileDown,
} from 'lucide-react';
import { fetchDispenseAnalytics } from './lib/db';
import BackButton from './BackButton';
import { exportToExcel } from './lib/exportExcel';
import DrugSearchBar from './DrugSearchBar';

// ============================================================
// Constants & helpers
// ============================================================
const BLUE        = '#1E90FF';
const YEAR_COLORS = ['#1E90FF','#F59E0B','#10B981','#EF4444','#8B5CF6'];

function IsoDateInput({ value, onChange, className = '' }) {
  const display = iso => { if (!iso) return null; const [y,m,d] = iso.split('-'); return `${d}/${m}/${Number(y)+543}`; }
  return (
    <div className={`relative flex items-center bg-white border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-400 ${className}`}>
      <span className={`px-3 py-1.5 text-sm w-full select-none pointer-events-none ${value ? 'text-slate-800' : 'text-slate-400'}`}>{display(value) || 'dd/mm/yyyy'}</span>
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 w-full cursor-pointer" />
    </div>
  )
}

// ============================================================
// Excel column definitions (module-level — no re-create per render)
// ============================================================

// Tab 1: สรุปผู้บริหาร — top drugs enriched with ABC group + momentum
const SUMMARY_EXCEL_COLS = [
  { header: 'รายการยา',             key: 'name' },
  { header: 'กลุ่ม ABC',             key: 'group' },
  { header: 'มูลค่ารวม (฿)',         value: r => Math.round(r.value) },
  { header: 'ปริมาณรวม (หน่วย)',     value: r => Math.round(r.qty) },
  { header: 'จำนวนวันที่เบิก',       value: r => r.days ?? '' },
  { header: '% Momentum (เดือนล่าสุด vs เฉลี่ย 3 เดือนก่อน)', value: r => r.momentum != null ? parseFloat(r.momentum.toFixed(1)) : '' },
];

// Tab 2: ABC Analysis ทั้งหมด
const ABC_EXCEL_COLS = [
  { header: '#',                  key: 'rank' },
  { header: 'รายการยา',           key: 'name' },
  { header: 'กลุ่ม ABC',           key: 'group' },
  { header: 'มูลค่ารวม (฿)',       value: r => Math.round(r.value) },
  { header: 'ปริมาณรวม (หน่วย)',   value: r => Math.round(r.qty) },
  { header: '% ของมูลค่าทั้งหมด', value: r => parseFloat(r.pct.toFixed(2)) },
  { header: '% สะสม',             value: r => parseFloat(r.cumPct.toFixed(2)) },
];

// Tab 3: คาดการณ์การเบิกยา
const FORECAST_EXCEL_COLS = [
  { header: 'รายการยา',                key: 'name' },
  { header: 'มูลค่าเฉลี่ย/เดือน (฿)', value: r => Math.round(r.curAvg) },
  { header: 'คาดการณ์ +1 เดือน (฿)',  value: r => Math.round(r.p1) },
  { header: 'คาดการณ์ +6 เดือน (฿)',  value: r => Math.round(r.p6) },
  { header: 'คาดการณ์ +12 เดือน (฿)', value: r => Math.round(r.p12) },
  { header: '% Growth 1 เดือน',       value: r => parseFloat(r.pct1.toFixed(1)) },
  { header: '% Growth 6 เดือน',       value: r => parseFloat(r.pct6.toFixed(1)) },
  { header: '% Growth 12 เดือน',      value: r => parseFloat(r.pct12.toFixed(1)) },
];

// Single-hue blue gradient: index 0 = darkest (#1E40AF), last = lightest (#93C5FD)
function heatBlue(i, total) {
  if (total <= 1) return '#1E40AF';
  const t = i / (total - 1);
  const r = Math.round(30  + (147 - 30)  * t);
  const g = Math.round(64  + (197 - 64)  * t);
  const b = Math.round(175 + (253 - 175) * t);
  return `rgb(${r},${g},${b})`;
}

function getPrice(r) {
  if (r.price_per_unit != null && r.price_per_unit !== '') return parseFloat(r.price_per_unit) || 0;
  const u = parseFloat(r.drug_unit);
  return (!isNaN(u) && u > 0) ? u : 0;
}

function fmt(n) {
  if (n == null || isNaN(n)) return '-';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '-';
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ฿';
}

function thMonth(iso) {
  if (!iso) return '';
  const [y, m] = iso.split('-');
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${months[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}

function addMonth(iso, n) {
  const [y, mo] = iso.split('-').map(Number);
  const t = mo + n;
  return `${y + Math.floor((t - 1) / 12)}-${String(((t - 1) % 12) + 1).padStart(2, '0')}`;
}

function linReg(xs, ys) {
  const n = xs.length;
  if (n < 2) return { m: 0, b: ys[0] ?? 0 };
  const xm = xs.reduce((s, v) => s + v, 0) / n;
  const ym = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - xm) * (ys[i] - ym); den += (x - xm) ** 2; });
  const m = den ? num / den : 0;
  return { m, b: ym - m * xm };
}

function holtForecast(values, h, alpha = 0.3, beta = 0.15) {
  if (!values.length) return Array(h).fill(0);
  if (values.length === 1) return Array(h).fill(Math.max(0, values[0]));
  let L = values[0], T = values[1] - values[0];
  for (let i = 1; i < values.length; i++) {
    const Lp = L;
    L = alpha * values[i] + (1 - alpha) * (L + T);
    T = beta  * (L - Lp) + (1 - beta)  * T;
  }
  return Array.from({ length: h }, (_, i) => Math.max(0, L + (i + 1) * T));
}

function abcClassify(drugs) {
  const sorted = [...drugs].sort((a, b) => b.value - a.value);
  const total  = sorted.reduce((s, d) => s + d.value, 0);
  let cumValue = 0;
  return sorted.map((d, i) => {
    cumValue += d.value;
    const cumPct = total > 0 ? (cumValue / total) * 100 : 0;
    const pct    = total > 0 ? (d.value  / total) * 100 : 0;
    return { ...d, pct, cumPct, group: cumPct <= 80 ? 'A' : cumPct <= 95 ? 'B' : 'C', rank: i + 1 };
  });
}

// ============================================================
// Sub-components
// ============================================================
function StatCard({ icon: Icon, label, value, sub, badge, color = BLUE, bg = 'bg-blue-50' }) {
  return (
    <div className={`${bg} rounded-2xl p-4 flex items-center gap-3`}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '20' }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
        <p className="text-xl font-black leading-tight" style={{ color }}>{value}</p>
        {(sub || badge) && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {badge && <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${badge.up ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>{badge.up ? '▲' : '▼'} {badge.text}</span>}
            {sub && <p className="text-xs text-slate-400">{sub}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, valueLabel = 'จำนวน', money = false }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      <p style={{ color: BLUE }}>{valueLabel}: <strong>{money ? fmtMoney(val) : Number(val).toLocaleString('th-TH')}</strong></p>
    </div>
  );
}

function MultiLineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter(p => p.value != null);
  if (!items.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {items.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-2">
          <span className="font-medium">{p.name}:</span>
          <strong>{fmtMoney(p.value)}</strong>
        </p>
      ))}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================
export default function AnalyticsApp({ onRefresh, auth = {} }) {
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [rows,           setRows]           = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [activeTab,      setActiveTab]      = useState('summary');
  const [drugSearch,     setDrugSearch]     = useState('');
  const [forecastPeriod, setForecastPeriod] = useState(12);
  const [forecastModel,  setForecastModel]  = useState('linear');
  const [abcFilter,      setAbcFilter]      = useState('A');
  const [showAllDepts,   setShowAllDepts]   = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchDispenseAnalytics(dateFrom, dateTo)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  // รายชื่อยาสำหรับ DrugSearchBar autocomplete
  const drugNames = useMemo(() => {
    const typeMap = {};
    const normMap = {}; // normalized → original canonical name
    rows.forEach(r => {
      if (!r.drug_name) return;
      const norm = r.drug_name.trim().replace(/\s+/g, ' ');
      if (!normMap[norm]) normMap[norm] = norm; // ใช้ชื่อที่ normalize แล้วเป็น canonical
      if (r.drug_type && r.drug_type !== '-') typeMap[norm] = r.drug_type;
    });
    return Object.keys(normMap).sort().map(name => ({ name, type: typeMap[name] || '' }));
  }, [rows]);

  // กรองตามชื่อยาที่พิมพ์/เลือก — normalize ก่อน compare เพื่อรวม whitespace variants
  const filteredRows = useMemo(() => {
    if (!drugSearch.trim()) return rows;
    const q = drugSearch.trim().replace(/\s+/g, ' ').toLowerCase();
    return rows.filter(r =>
      r.drug_name?.trim().replace(/\s+/g, ' ').toLowerCase().includes(q)
    );
  }, [rows, drugSearch]);

  // ---- Core aggregations ----
  const {
    topDrugs, topDrugsByDays, monthlyTrend, topDepts, topDeptsValue,
    totalQty, totalValue, uniqueDays, uniqueDrugCount,
    abcDrugs, yoyData, yoyYears, yoySufficient, yoyMonthsPerYear,
    ma3Trend, risingMomentum, lastMonthLabel,
    actualDateMin, actualDateMax,
  } = useMemo(() => {
    const drugMap     = {};
    const drugDaysMap = {};
    const drugMonMap  = {}; // drug → month → value (for momentum)
    const monthMap    = {};
    const deptMap     = {};
    const deptDaysMap = {};
    let totalQty = 0, totalValue = 0;

    filteredRows.forEach(r => {
      const qty   = parseFloat(r.qty_out) || 0;
      const price = getPrice(r);
      const value = qty * price;
      totalQty   += qty;
      totalValue += value;

      const dk = r.drug_name || r.drug_code || '-';
      if (!drugMap[dk]) drugMap[dk] = { name: dk, qty: 0, value: 0 };
      drugMap[dk].qty   += qty;
      drugMap[dk].value += value;

      if (r.dispense_date) {
        if (!drugDaysMap[dk]) drugDaysMap[dk] = new Set();
        drugDaysMap[dk].add(r.dispense_date);
      }

      const mon = (r.dispense_date || '').slice(0, 7);
      if (mon) {
        if (!monthMap[mon]) monthMap[mon] = { month: mon, qty: 0, value: 0 };
        monthMap[mon].qty   += qty;
        monthMap[mon].value += value;

        if (!drugMonMap[dk]) drugMonMap[dk] = {};
        drugMonMap[dk][mon] = (drugMonMap[dk][mon] || 0) + value;
      }

      const dept = r.department || 'ไม่ระบุ';
      if (!deptMap[dept]) deptMap[dept] = { name: dept, qty: 0, value: 0 };
      deptMap[dept].qty   += qty;
      deptMap[dept].value += value;

      if (r.dispense_date) {
        if (!deptDaysMap[dept]) deptDaysMap[dept] = new Set();
        deptDaysMap[dept].add(r.dispense_date);
      }
    });

    Object.keys(drugDaysMap).forEach(k => {
      if (drugMap[k]) drugMap[k].days = drugDaysMap[k].size;
    });

    const allDates     = new Set(filteredRows.map(r => r.dispense_date).filter(Boolean));
    const uniqueDays   = allDates.size;
    const uniqueDrugCount = Object.keys(drugMap).length;

    const topDrugs = Object.values(drugMap)
      .sort((a, b) => b.value - a.value).slice(0, 10)
      .map(d => ({ ...d, nameShort: d.name.length > 28 ? d.name.slice(0, 28) + '…' : d.name }));

    const topDrugsByDays = Object.values(drugMap)
      .sort((a, b) => (b.days || 0) - (a.days || 0)).slice(0, 10)
      .map(d => ({ ...d, nameShort: d.name.length > 28 ? d.name.slice(0, 28) + '…' : d.name }));

    const monthlyTrend = Object.values(monthMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({ ...m, label: thMonth(m.month) }));

    const topDepts = Object.entries(deptDaysMap)
      .map(([name, s]) => ({ name, days: s.size }))
      .sort((a, b) => b.days - a.days).slice(0, 10);

    const topDeptsValue = Object.values(deptMap)
      .sort((a, b) => b.value - a.value).slice(0, 10);

    // ABC Pareto
    const abcDrugs = abcClassify(Object.values(drugMap));

    // Momentum: last month vs avg of previous 3 months (Rising Demand ≥ +30%)
    const sortedMons = Object.keys(monthMap).sort();
    const lastMon   = sortedMons[sortedMons.length - 1] || '';
    const prev3Mons = sortedMons.slice(-4, -1);
    const risingMomentum = [];
    const abcGroupMap = Object.fromEntries(abcDrugs.map(d => [d.name, d.group]));

    if (prev3Mons.length >= 2 && lastMon) {
      Object.entries(drugMonMap).forEach(([name, mVals]) => {
        const lastVal  = mVals[lastMon] || 0;
        const prevVals = prev3Mons.map(m => mVals[m] || 0);
        const prevAvg  = prevVals.reduce((s, v) => s + v, 0) / prevVals.length;
        if (prevAvg > 0 && lastVal > 0) {
          const momentum = ((lastVal - prevAvg) / prevAvg) * 100;
          if (momentum >= 30) {
            risingMomentum.push({
              name,
              nameShort: name.length > 32 ? name.slice(0, 32) + '…' : name,
              lastVal, prevAvg, momentum,
              group: abcGroupMap[name] || 'C',
            });
          }
        }
      });
      risingMomentum.sort((a, b) => b.momentum - a.momentum);
    }

    // Year-over-Year
    const yoyMap = {};
    monthlyTrend.forEach(m => {
      const [y, mo] = m.month.split('-');
      if (!yoyMap[y]) yoyMap[y] = {};
      yoyMap[y][mo] = m.value;
    });
    const yoyYears = Object.keys(yoyMap).sort();
    const yoyMonthsPerYear = {};
    yoyYears.forEach(y => { yoyMonthsPerYear[y] = Object.keys(yoyMap[y] || {}).length; });
    const refYears = yoyYears.slice(0, -1);
    const yoySufficient = refYears.length > 0 && Math.min(...refYears.map(y => yoyMonthsPerYear[y])) >= 6;
    const MONTH_ABBR = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const yoyData = ['01','02','03','04','05','06','07','08','09','10','11','12']
      .map((mo, i) => {
        const obj = { month: MONTH_ABBR[i] };
        yoyYears.forEach(y => { obj[y] = yoyMap[y]?.[mo] ?? null; });
        return obj;
      })
      .filter(d => yoyYears.some(y => d[y] != null));

    // 3-month Moving Average
    const ma3Trend = monthlyTrend.map((m, i, arr) => ({
      ...m,
      ma3: i >= 2 ? (arr[i].value + arr[i - 1].value + arr[i - 2].value) / 3 : undefined,
    }));

    const lastMonthLabel = lastMon ? thMonth(lastMon) : '';

    const isoFmt = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${parseInt(y) + 543}`; };
    const dates = filteredRows.map(r => r.dispense_date).filter(Boolean).sort();
    const actualDateMin = dates.length ? isoFmt(dates[0]) : '';
    const actualDateMax = dates.length ? isoFmt(dates[dates.length - 1]) : '';

    return {
      topDrugs, topDrugsByDays, monthlyTrend, topDepts, topDeptsValue,
      totalQty, totalValue, uniqueDays, uniqueDrugCount,
      abcDrugs, yoyData, yoyYears, yoySufficient, yoyMonthsPerYear,
      ma3Trend, risingMomentum, lastMonthLabel,
      actualDateMin, actualDateMax,
    };
  }, [filteredRows]);

  // ---- Forecast: Linear & Holt Exponential Smoothing ----
  const { combinedChartLinear, combinedChartHolt, risingDrugsLinear, risingDrugsHolt, hasEnoughData, forecastReliable } = useMemo(() => {
    const empty = { combinedChartLinear: [], combinedChartHolt: [], risingDrugsLinear: [], risingDrugsHolt: [], hasEnoughData: false, forecastReliable: false };
    if (monthlyTrend.length < 2) return { ...empty, combinedChartLinear: monthlyTrend.map(m => ({ label: m.label, actual: m.value })), combinedChartHolt: monthlyTrend.map(m => ({ label: m.label, actual: m.value })) };

    const monthIdx = {};
    monthlyTrend.forEach((m, i) => { monthIdx[m.month] = i; });
    const lastIdx   = monthlyTrend.length - 1;
    const lastMon   = monthlyTrend[lastIdx].month;
    const futureMons = Array.from({ length: 12 }, (_, i) => addMonth(lastMon, i + 1));

    const drugMon = {};
    filteredRows.forEach(r => {
      const key = r.drug_name || r.drug_code || '-';
      const mon = (r.dispense_date || '').slice(0, 7);
      if (!mon || monthIdx[mon] === undefined) return;
      if (!drugMon[key]) drugMon[key] = {};
      drugMon[key][mon] = (drugMon[key][mon] || 0) + (parseFloat(r.qty_out) || 0) * getPrice(r);
    });

    const totalFutLin = new Array(12).fill(0);
    const totalFutHolt = new Array(12).fill(0);
    const risingLin = [], risingHolt = [];

    Object.entries(drugMon).forEach(([drug, mVals]) => {
      const sorted = Object.keys(mVals).sort();
      if (sorted.length < 3) return;
      const xs = sorted.map(m => monthIdx[m]);
      const ys = sorted.map(m => mVals[m]);
      const curAvg = ys.reduce((a, v) => a + v, 0) / ys.length;
      const nameShort = drug.length > 30 ? drug.slice(0, 30) + '…' : drug;

      const { m: slope, b } = linReg(xs, ys);
      const floor = curAvg * 0.1;
      const linPreds  = futureMons.map((_, i) => Math.max(floor, slope * (lastIdx + i + 1) + b));
      const holtPreds = holtForecast(ys, 12);
      linPreds.forEach((v, i)  => { totalFutLin[i]  += v; });
      holtPreds.forEach((v, i) => { totalFutHolt[i] += v; });

      if (curAvg > 0) {
        const mkEntry = (preds) => ({ name: drug, nameShort, curAvg, p1: preds[0], p6: preds[5], p12: preds[11], pct1: ((preds[0]  - curAvg) / curAvg) * 100, pct6: ((preds[5]  - curAvg) / curAvg) * 100, pct12: ((preds[11] - curAvg) / curAvg) * 100 });
        risingLin.push(mkEntry(linPreds));
        risingHolt.push(mkEntry(holtPreds));
      }
    });

    risingLin.sort((a, b) => b.curAvg - a.curAvg);
    risingHolt.sort((a, b) => b.curAvg - a.curAvg);

    const lastActual = monthlyTrend[lastIdx].value;
    const buildCombined = (futArr) => [
      ...monthlyTrend.map((m, i) => ({ label: m.label, actual: m.value, forecast: i === lastIdx ? lastActual : undefined })),
      ...futureMons.map((mon, i) => ({ label: thMonth(mon), actual: undefined, forecast: futArr[i] })),
    ];

    const forecastReliable = monthlyTrend.length >= 6;
    return { combinedChartLinear: buildCombined(totalFutLin), combinedChartHolt: buildCombined(totalFutHolt), risingDrugsLinear: risingLin, risingDrugsHolt: risingHolt, hasEnoughData: true, forecastReliable };
  }, [filteredRows, monthlyTrend]);

  const risingDrugs = useMemo(
    () => forecastModel === 'linear' ? risingDrugsLinear : risingDrugsHolt,
    [forecastModel, risingDrugsLinear, risingDrugsHolt]
  );
  const combinedChart = forecastModel === 'linear' ? combinedChartLinear : combinedChartHolt;

  const sortedRisingDrugs = useMemo(() => {
    const key = forecastPeriod === 1 ? 'p1' : forecastPeriod === 6 ? 'p6' : 'p12';
    return [...risingDrugs].sort((a, b) => b[key] - a[key]).slice(0, 10);
  }, [risingDrugs, forecastPeriod]);

  const filteredAbcDrugs = useMemo(
    () => abcDrugs.filter(d => d.group === abcFilter).slice(0, 30),
    [abcDrugs, abcFilter]
  );

  const momTrend = useMemo(() => {
    const lastM = monthlyTrend[monthlyTrend.length - 1];
    const prevM = monthlyTrend[monthlyTrend.length - 2];
    if (!lastM || !prevM || prevM.value === 0) return null;
    const diff = lastM.value - prevM.value;
    const pct  = diff / prevM.value * 100;
    return { pct, diff, label: lastM.label, up: pct > 0 };
  }, [monthlyTrend]);

  const displayedDepts = showAllDepts ? topDeptsValue : topDeptsValue.slice(0, 5);

  const TABS = [
    { id: 'summary',   icon: '🏥', label: 'ภาพรวม' },
    { id: 'inventory', icon: '📦', label: 'คลังยา / ABC' },
    { id: 'forecast',  icon: '📈', label: 'แนวโน้ม' },
  ];

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="min-h-screen bg-slate-100">
      {/* Title bar — sidebar (AppShell) คุม navigation; เหลือ title + refresh + filter */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3">
          <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
          <div className="p-1.5 rounded-lg bg-cyan-100 text-cyan-600 shrink-0"><Activity size={18} /></div>
          <button onClick={onRefresh} className="flex-1 min-w-0 text-left hover:opacity-70 transition-opacity" title="คลิกเพื่อโหลดใหม่">
            <h1 className="font-bold text-base leading-tight text-slate-800">วิเคราะห์การเบิกยา</h1>
            <p className="text-slate-400 text-xs">
              {actualDateMin && actualDateMax
                ? `ข้อมูล ${actualDateMin} – ${actualDateMax}`
                : 'ข้อมูลจาก Dispense Log'}
            </p>
          </button>
          <button onClick={onRefresh} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors" title="รีเฟรช">
            <RefreshCcw size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-slate-500 text-sm">ตั้งแต่</span>
          <IsoDateInput value={dateFrom} onChange={setDateFrom} />
          <span className="text-slate-500 text-sm">ถึง</span>
          <IsoDateInput value={dateTo} onChange={setDateTo} />
        </div>
        {/* Drug filter */}
        <div className="mt-3">
          <DrugSearchBar
            value={drugSearch}
            onChange={setDrugSearch}
            options={drugNames}
            placeholder="ค้นหารายการยา... (ทั้งหมด)"
            maxResults={12}
            ringClass="focus:ring-blue-400"
            hoverClass="hover:bg-blue-50"
            className="w-full max-w-sm"
          />
        </div>
      </div>

      {/* Tab navigation */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="flex max-w-4xl mx-auto">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-all flex flex-col items-center gap-0.5 ${
                activeTab === tab.id ? 'border-[#1E90FF] text-[#1E90FF]' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              <span className="text-base leading-none">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-4xl mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-10 h-10 border-4 border-[#1E90FF] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm">กำลังโหลดข้อมูล...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-slate-400">
            <TrendingUp size={40} className="mx-auto mb-3 opacity-20" />
            <p className="font-semibold">ไม่พบข้อมูลในช่วงเวลาที่เลือก</p>
            <p className="text-sm mt-1">ลองเปลี่ยนช่วงวันที่</p>
          </div>
        ) : (
          <>
            {/* ===================== TAB 1: EXECUTIVE SUMMARY ===================== */}
            {activeTab === 'summary' && (
              <>
                {/* Export button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      const momMap  = Object.fromEntries(risingMomentum.map(m => [m.name, m.momentum]));
                      const abcMap  = Object.fromEntries(abcDrugs.map(d => [d.name, d.group]));
                      const today   = new Date().toISOString().slice(0, 10);
                      const data    = topDrugs.map(d => ({ ...d, group: abcMap[d.name] || '-', momentum: momMap[d.name] ?? null }));
                      exportToExcel(data, SUMMARY_EXCEL_COLS, 'สรุปภาพรวม', `analytics_summary_${today}.xlsx`, auth);
                    }}
                    className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                  >
                    <FileDown size={14} /> Export ภาพรวม
                  </button>
                </div>
                {/* KPI Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <StatCard icon={Banknote}     label="มูลค่าเบิกทั้งหมด"   value={fmtMoney(totalValue)}               sub="ราคา × จำนวน"           color="#10B981" bg="bg-emerald-50"
                    badge={momTrend ? { up: momTrend.up, text: `${momTrend.up ? '+' : ''}${momTrend.pct.toFixed(1)}% MoM` } : null} />
                  <StatCard icon={Package}      label="รายการยาทั้งหมด"    value={`${uniqueDrugCount} รายการ`}          sub={`${rows.length.toLocaleString()} บันทึก`} color="#1E90FF" bg="bg-blue-50" />
                  <StatCard icon={CalendarDays} label="วันที่มีการเบิก"     value={uniqueDays.toLocaleString()}           sub="วัน"                     color="#8B5CF6" bg="bg-purple-50" />
                  <StatCard icon={Building2}    label="หน่วยงานที่เบิก"     value={topDeptsValue.length}                  sub="หน่วยงาน"               color="#F59E0B" bg="bg-amber-50" />
                </div>

                {/* Attention + Forecast Snapshot — side by side on md+ */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Attention: top drugs + top dept */}
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="bg-amber-50 border-b border-amber-100 px-4 py-2.5 flex items-center gap-2">
                      <AlertTriangle size={15} className="text-amber-600" />
                      <span className="font-bold text-amber-800 text-sm">ยาที่ต้องติดตาม</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {topDrugs.slice(0, 3).map((d, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs text-white shrink-0 ${i === 0 ? 'bg-red-500' : i === 1 ? 'bg-orange-400' : 'bg-amber-400'}`}>{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-700 truncate">{d.name}</p>
                            <p className="text-xs text-slate-400">ปริมาณ {Math.round(d.qty).toLocaleString()} หน่วย</p>
                          </div>
                          <span className="text-sm font-bold text-amber-700 shrink-0">{fmtMoney(d.value)}</span>
                        </div>
                      ))}
                      {topDeptsValue[0] && (
                        <div className="flex items-center gap-3 px-4 py-3">
                          <Building2 size={18} className="text-purple-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-400">หน่วยงานมูลค่าสูงสุด</p>
                            <p className="text-sm font-semibold text-slate-700 truncate">{topDeptsValue[0].name}</p>
                          </div>
                          <span className="text-sm font-bold text-purple-700 shrink-0">{fmtMoney(topDeptsValue[0].value)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Forecast snapshot */}
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="bg-blue-50 border-b border-blue-100 px-4 py-2.5 flex items-center gap-2">
                      <TrendingUp size={15} className="text-blue-600" />
                      <span className="font-bold text-blue-800 text-sm">คาดการณ์ 12 เดือนข้างหน้า</span>
                    </div>
                    {risingDrugsLinear.length === 0 ? (
                      <p className="px-4 py-6 text-xs text-slate-400 text-center">ข้อมูลไม่เพียงพอสำหรับการคาดการณ์</p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {risingDrugsLinear.slice(0, 5).map((d, i) => {
                          const pct = d.pct12;
                          const color = pct >= 100 ? '#DC2626' : pct >= 50 ? '#EA580C' : pct >= 20 ? '#D97706' : '#059669';
                          const bgBadge = pct >= 100 ? 'bg-red-100' : pct >= 50 ? 'bg-orange-100' : pct >= 20 ? 'bg-amber-100' : 'bg-emerald-100';
                          return (
                            <div key={i} className="flex items-center gap-3 px-4 py-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-700 truncate">{d.name}</p>
                                <p className="text-xs text-slate-400">เฉลี่ย {fmtMoney(d.curAvg)}/เดือน</p>
                              </div>
                              <span className={`text-xs font-bold px-2 py-1 rounded-full ${bgBadge} shrink-0`} style={{ color }}>
                                {pct >= 0 ? '+' : ''}{pct.toFixed(0)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Rising Demand Alerts (momentum) */}
                {risingMomentum.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="bg-red-50 border-b border-red-100 px-4 py-2.5 flex items-center gap-2">
                      <TrendingUp size={15} className="text-red-600" />
                      <span className="font-bold text-red-800 text-sm">Rising Demand — ยาที่ยอดพุ่งเกิน +30% (เดือนล่าสุด vs เฉลี่ย 3 เดือนก่อน)</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {risingMomentum.slice(0, 8).map((d, i) => {
                        const groupColor = d.group === 'A' ? 'bg-red-500' : d.group === 'B' ? 'bg-amber-500' : 'bg-emerald-500';
                        return (
                          <div key={i} className="flex items-center gap-3 px-4 py-3">
                            <span className={`text-xs font-black px-1.5 py-0.5 rounded text-white shrink-0 ${groupColor}`}>{d.group}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-700 truncate">{d.nameShort}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-slate-400">เดือนล่าสุด {fmtMoney(d.lastVal)}</span>
                                <span className="text-xs text-slate-300">vs</span>
                                <span className="text-xs text-slate-400">เฉลี่ยก่อนหน้า {fmtMoney(d.prevAvg)}</span>
                              </div>
                            </div>
                            <span className="text-sm font-black text-red-600 shrink-0">+{d.momentum.toFixed(0)}%</span>
                          </div>
                        );
                      })}
                    </div>
                    {lastMonthLabel && (
                      <p className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
                        เดือนอ้างอิง: {lastMonthLabel} | badge A/B/C = กลุ่ม ABC ของยานั้น
                      </p>
                    )}
                  </div>
                )}

                {/* MoM trend summary */}
                {momTrend && (
                  <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${momTrend.up ? 'bg-orange-50 border border-orange-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                    <TrendingUp size={18} className={momTrend.up ? 'text-orange-500' : 'text-emerald-500'} />
                    <p className={`text-sm font-semibold ${momTrend.up ? 'text-orange-700' : 'text-emerald-700'}`}>
                      เดือน {momTrend.label} มูลค่าการเบิก{momTrend.up ? 'เพิ่มขึ้น' : 'ลดลง'}{' '}
                      <strong>{fmtMoney(Math.abs(momTrend.diff))}</strong>{' '}
                      ({momTrend.up ? '+' : ''}{momTrend.pct.toFixed(1)}%) จากเดือนก่อน
                    </p>
                  </div>
                )}
              </>
            )}

            {/* ===================== TAB 2: INVENTORY & ABC ===================== */}
            {activeTab === 'inventory' && (
              <>
                {/* Export button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      const today = new Date().toISOString().slice(0, 10);
                      exportToExcel(abcDrugs, ABC_EXCEL_COLS, 'ABC Analysis', `analytics_abc_${today}.xlsx`, auth);
                    }}
                    className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                  >
                    <FileDown size={14} /> Export ABC ทั้งหมด
                  </button>
                </div>
                {/* ABC Summary Stats */}
                {abcDrugs.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm p-4">
                    <h2 className="font-bold text-slate-700 mb-1 flex items-center gap-2">
                      <Layers size={18} className="text-[#EF4444]" /> ABC Analysis — จัดลำดับความสำคัญยา
                    </h2>
                    <p className="text-xs text-slate-400 mb-3">Pareto Principle — ยากลุ่ม A (ส่วนน้อย) รับผิดชอบ 80% ของมูลค่าทั้งหมด</p>

                    {/* ABC Stats row */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {['A','B','C'].map(g => {
                        const count = abcDrugs.filter(d => d.group === g).length;
                        const cls = g === 'A' ? 'bg-red-50 border-red-200 text-red-700' : g === 'B' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700';
                        const dot = g === 'A' ? 'bg-red-500' : g === 'B' ? 'bg-amber-500' : 'bg-emerald-500';
                        const pctValue = g === 'A' ? '80%' : g === 'B' ? '15%' : '5%';
                        return (
                          <div key={g} className={`rounded-xl border p-3 text-center ${cls}`}>
                            <div className={`w-6 h-6 rounded-full ${dot} text-white text-xs font-black flex items-center justify-center mx-auto mb-1`}>{g}</div>
                            <p className="text-xl font-black">{count}</p>
                            <p className="text-xs">รายการ</p>
                            <p className="text-xs opacity-70">{pctValue} ของมูลค่า</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Proportion bar */}
                    <div className="flex h-3 rounded-full overflow-hidden mb-4">
                      {['A','B','C'].map(g => {
                        const count = abcDrugs.filter(d => d.group === g).length;
                        const pct   = abcDrugs.length > 0 ? (count / abcDrugs.length) * 100 : 0;
                        const cls   = g === 'A' ? 'bg-red-400' : g === 'B' ? 'bg-amber-400' : 'bg-emerald-400';
                        return <div key={g} className={cls} style={{ width: `${pct}%` }} title={`กลุ่ม ${g}: ${count} รายการ`} />;
                      })}
                    </div>

                    {/* Group filter tabs */}
                    <div className="flex gap-2 mb-3 flex-wrap">
                      {['A','B','C'].map(g => {
                        const count = abcDrugs.filter(d => d.group === g).length;
                        const active = abcFilter === g;
                        const cls = g === 'A'
                          ? active ? 'bg-red-100 text-red-700 border-red-300'     : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                          : g === 'B'
                            ? active ? 'bg-amber-100 text-amber-700 border-amber-300'   : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                            : active ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100';
                        const dot = g === 'A' ? 'bg-red-500' : g === 'B' ? 'bg-amber-500' : 'bg-emerald-500';
                        return (
                          <button key={g} onClick={() => setAbcFilter(g)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${cls}`}>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-xs text-white ${dot}`}>{g}</span>
                            กลุ่ม {g}: {count}
                          </button>
                        );
                      })}
                    </div>

                    {/* Description */}
                    <div className={`text-xs px-3 py-2 rounded-lg mb-3 border ${abcFilter === 'A' ? 'bg-red-50 text-red-700 border-red-200' : abcFilter === 'B' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                      {abcFilter === 'A' && <><strong>กลุ่ม A</strong> — มูลค่าสูง: ตรวจสอบ Safety Stock และวางแผนจัดซื้อล่วงหน้า ต้องมีความแม่นยำในการพยากรณ์สูงสุด</>}
                      {abcFilter === 'B' && <><strong>กลุ่ม B</strong> — มูลค่าปานกลาง: ทบทวน Reorder Point ทุก 1-3 เดือน</>}
                      {abcFilter === 'C' && <><strong>กลุ่ม C</strong> — มูลค่าต่ำ: พิจารณาสั่งซื้อ Bulk เพื่อลดต้นทุนการจัดการ</>}
                    </div>

                    {/* ABC Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-slate-600">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="text-left py-2 pr-2 font-semibold w-8">#</th>
                            <th className="text-left py-2 pr-2 font-semibold">รายการยา</th>
                            <th className="text-right py-2 pr-2 font-semibold">มูลค่า (฿)</th>
                            <th className="text-right py-2 pr-2 font-semibold">%</th>
                            <th className="text-right py-2 font-semibold">% สะสม</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAbcDrugs.map((d, i) => (
                            <tr key={i} className={`border-b border-slate-100 ${i % 2 ? 'bg-slate-50' : ''}`}>
                              <td className="py-2 pr-2 text-slate-400 font-mono">{d.rank}</td>
                              <td className="py-2 pr-2 font-medium max-w-0 w-full">
                                <span className="block truncate" title={d.name}>{d.name}</span>
                              </td>
                              <td className="py-2 pr-2 text-right font-semibold">{fmtMoney(d.value)}</td>
                              <td className="py-2 pr-2 text-right text-slate-500">{d.pct.toFixed(1)}%</td>
                              <td className="py-2 text-right">
                                <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-xs ${d.group === 'A' ? 'bg-red-100 text-red-700' : d.group === 'B' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                  {d.cumPct.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {abcDrugs.filter(d => d.group === abcFilter).length > 30 && (
                        <p className="text-xs text-slate-400 mt-2 text-center">แสดง 30 รายการแรก (ทั้งหมด {abcDrugs.filter(d => d.group === abcFilter).length} รายการ)</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Top Drugs by Value — gradient bar */}
                {topDrugs.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm p-4">
                    <h2 className="font-bold text-slate-700 mb-1 flex items-center gap-2">
                      <Banknote size={18} className="text-[#1E40AF]" /> ยาที่มีมูลค่าเบิกสูงสุด Top {topDrugs.length}
                    </h2>
                    <p className="text-xs text-slate-400 mb-4">ราคา/หน่วย × จำนวนเบิก — สีเข้ม = มูลค่าสูง</p>
                    <ResponsiveContainer width="100%" height={topDrugs.length * 38 + 20}>
                      <BarChart data={topDrugs} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmt} />
                        <YAxis type="category" dataKey="nameShort" tick={{ fontSize: 11 }} width={170} />
                        <Tooltip content={<ChartTooltip valueLabel="มูลค่า" money />} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#64748B', formatter: fmt }}>
                          {topDrugs.map((_, i) => <Cell key={i} fill={heatBlue(i, topDrugs.length)} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Top Depts by Value — top 5 with expand */}
                {topDeptsValue.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm p-4">
                    <h2 className="font-bold text-slate-700 mb-1 flex items-center gap-2">
                      <Building2 size={18} className="text-[#8B5CF6]" /> หน่วยงาน — มูลค่าการเบิก
                    </h2>
                    <p className="text-xs text-slate-400 mb-4">มูลค่าการเบิกรวมต่อหน่วยงาน (บาท)</p>
                    <ResponsiveContainer width="100%" height={displayedDepts.length * 38 + 20}>
                      <BarChart data={displayedDepts} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmt} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                        <Tooltip content={<ChartTooltip valueLabel="มูลค่า" money />} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#64748B', formatter: fmt }}>
                          {displayedDepts.map((_, i) => <Cell key={i} fill={heatBlue(i, displayedDepts.length)} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    {topDeptsValue.length > 5 && (
                      <button onClick={() => setShowAllDepts(!showAllDepts)}
                        className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-[#1E90FF] hover:bg-blue-50 rounded-xl transition-colors">
                        {showAllDepts ? <><ChevronUp size={14} /> แสดงน้อยลง</> : <><ChevronDown size={14} /> ดูทั้งหมด {topDeptsValue.length} หน่วยงาน</>}
                      </button>
                    )}
                  </div>
                )}

                {/* Top Drugs by Days */}
                {topDrugsByDays.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm p-4">
                    <h2 className="font-bold text-slate-700 mb-1 flex items-center gap-2">
                      <CalendarDays size={18} className="text-[#06B6D4]" /> ยาที่เบิกบ่อย (จำนวนวัน)
                    </h2>
                    <p className="text-xs text-slate-400 mb-4">นับจากจำนวนวันที่มีการเบิกยานั้นจริง</p>
                    <ResponsiveContainer width="100%" height={topDrugsByDays.length * 38 + 20}>
                      <BarChart data={topDrugsByDays} layout="vertical" margin={{ top: 0, right: 50, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="nameShort" tick={{ fontSize: 11 }} width={170} />
                        <Tooltip content={<ChartTooltip valueLabel="จำนวนวัน" />} />
                        <Bar dataKey="days" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#64748B' }}>
                          {topDrugsByDays.map((_, i) => <Cell key={i} fill={heatBlue(i, topDrugsByDays.length)} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}

            {/* ===================== TAB 3: TRENDS & FORECAST ===================== */}
            {activeTab === 'forecast' && (
              <>
                {/* Export button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      const today   = new Date().toISOString().slice(0, 10);
                      const model   = forecastModel === 'linear' ? 'linear' : 'exp';
                      exportToExcel(risingDrugs, FORECAST_EXCEL_COLS, 'คาดการณ์', `analytics_forecast_${model}_${today}.xlsx`, auth);
                    }}
                    className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                    disabled={!hasEnoughData}
                  >
                    <FileDown size={14} /> Export คาดการณ์
                  </button>
                </div>
                {/* Monthly trend + MA3 */}
                {monthlyTrend.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm p-4">
                    <h2 className="font-bold text-slate-700 mb-1 flex items-center gap-2">
                      <BarChart2 size={18} className="text-[#1E90FF]" /> แนวโน้มการเบิกรายเดือน
                    </h2>
                    <p className="text-xs text-slate-400 mb-4">เส้นสีน้ำเงิน = มูลค่าจริง &nbsp;|&nbsp; เส้นประสีส้ม = MA3 (เฉลี่ย 3 เดือน ตัดสัญญาณรบกวน)</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={ma3Trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtMoney} width={80} />
                        <Tooltip content={<MultiLineTooltip />} />
                        <Legend verticalAlign="top" height={28} />
                        <Line type="monotone" dataKey="value" name="มูลค่าจริง"           stroke={BLUE}     strokeWidth={2.5} dot={{ r: 4, fill: BLUE }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="ma3"   name="MA3 (เฉลี่ย 3 เดือน)" stroke="#F59E0B" strokeWidth={2}   strokeDasharray="6 3" dot={false} connectNulls={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Year-over-Year Seasonality */}
                {yoyYears.length >= 2 && yoyData.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm p-4">
                    <h2 className="font-bold text-slate-700 mb-1 flex items-center gap-2">
                      <CalendarDays size={18} className="text-[#8B5CF6]" /> เปรียบเทียบรายปี — Seasonality
                    </h2>
                    <p className="text-xs text-slate-400 mb-3">มูลค่าเบิกเดือนเดียวกันของแต่ละปี — ระบุช่วงฤดูกาลที่การใช้ยาพุ่งสูงเป็นประจำ</p>
                    {!yoySufficient && (
                      <div className="text-xs text-purple-700 bg-purple-50 border border-purple-200 px-3 py-2 rounded-lg mb-3 flex items-start gap-2">
                        <span className="shrink-0">⚠️</span>
                        <span>
                          ข้อมูลปีอ้างอิงน้อยกว่า 6 เดือน ({yoyYears.slice(0,-1).map(y => `ปี ${parseInt(y)+543}: ${yoyMonthsPerYear[y]} เดือน`).join(', ')}) — ควรรวบรวมข้อมูลให้ครบ 12 เดือนก่อนนำไปตีความ
                        </span>
                      </div>
                    )}
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={yoyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtMoney} width={80} />
                        <Tooltip content={<MultiLineTooltip />} />
                        <Legend verticalAlign="top" height={28} />
                        {yoyYears.map((y, i) => (
                          <Line key={y} type="monotone" dataKey={y}
                            name={`ปี พ.ศ. ${parseInt(y)+543}${!yoySufficient && i < yoyYears.length-1 ? ' (ข้อมูลไม่ครบ)' : ''}`}
                            stroke={YEAR_COLORS[i % YEAR_COLORS.length]} strokeWidth={2}
                            strokeDasharray={!yoySufficient && i < yoyYears.length-1 ? '5 3' : undefined}
                            dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Forecast Combined Chart */}
                {hasEnoughData && (
                  <div className="bg-white rounded-2xl shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div>
                        <h2 className="font-bold text-slate-700 flex items-center gap-2">
                          <TrendingUp size={18} className="text-[#F59E0B]" /> คาดการณ์ 12 เดือนข้างหน้า
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">เส้นสีน้ำเงิน = จริง &nbsp;|&nbsp; เส้นประสีส้ม = คาดการณ์</p>
                      </div>
                      <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1 shrink-0">
                        <button onClick={() => setForecastModel('linear')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${forecastModel === 'linear' ? 'bg-white text-[#1E90FF] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                          Linear
                        </button>
                        <button onClick={() => setForecastModel('exponential')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${forecastModel === 'exponential' ? 'bg-white text-[#1E90FF] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                          Exp. Smoothing
                        </button>
                      </div>
                    </div>
                    {!forecastReliable && (
                      <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-2 flex items-start gap-2">
                        <span className="shrink-0">🚨</span>
                        <span>ข้อมูลมีเพียง <strong>{monthlyTrend.length} เดือน</strong> — ต้องการอย่างน้อย 6 เดือน ตัวเลขเป็นเพียงการประมาณเบื้องต้น</span>
                      </div>
                    )}
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg mb-4 flex items-start gap-2">
                      <span className="shrink-0">⚠️</span>
                      <span>{forecastModel === 'linear' ? 'Linear Regression — เหมาะเมื่อแนวโน้มเป็นเส้นตรงต่อเนื่อง' : "Exponential Smoothing (Holt's) — ให้น้ำหนักข้อมูลล่าสุดมากกว่า เหมาะเมื่อแนวโน้มเปลี่ยนเร็ว"} ใช้ประเมินทิศทางเท่านั้น</span>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={combinedChart} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtMoney} width={80} />
                        <Tooltip content={<MultiLineTooltip />} />
                        <Legend verticalAlign="top" height={36} />
                        <Line type="monotone" dataKey="actual"   name="ข้อมูลจริง" stroke={BLUE}    strokeWidth={2.5} dot={{ r: 3, fill: BLUE }} activeDot={{ r: 6 }} connectNulls={false} />
                        <Line type="monotone" dataKey="forecast" name="คาดการณ์"   stroke="#F59E0B" strokeWidth={2}   strokeDasharray="7 4" dot={{ r: 3, fill: 'white', stroke: '#F59E0B', strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Forecast Table */}
                {hasEnoughData && sortedRisingDrugs.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                      <div>
                        <h2 className="font-bold text-slate-700 flex items-center gap-2">
                          <FileText size={18} className="text-[#10B981]" /> ตารางคาดการณ์มูลค่า Top 10
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">โมเดล: {forecastModel === 'linear' ? 'Linear Regression' : 'Exp. Smoothing'}</p>
                      </div>
                      <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1 shrink-0">
                        {[1, 6, 12].map(p => (
                          <button key={p} onClick={() => setForecastPeriod(p)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${forecastPeriod === p ? 'bg-white text-[#1E90FF] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            +{p} เดือน
                          </button>
                        ))}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={sortedRisingDrugs.length * 38 + 20}>
                      <BarChart data={sortedRisingDrugs} layout="vertical" margin={{ top: 0, right: 80, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmt} />
                        <YAxis type="category" dataKey="nameShort" tick={{ fontSize: 11 }} width={170} />
                        <Tooltip content={<ChartTooltip valueLabel={`คาดการณ์ (+${forecastPeriod} เดือน)`} money />} />
                        <Bar dataKey={forecastPeriod === 1 ? 'p1' : forecastPeriod === 6 ? 'p6' : 'p12'} radius={[0, 4, 4, 0]}
                          label={{ position: 'right', fontSize: 11, fill: '#64748B', formatter: fmt }}>
                          {sortedRisingDrugs.map((_, i) => <Cell key={i} fill={heatBlue(i, sortedRisingDrugs.length)} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-xs text-slate-600">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="text-left py-2 pr-2 font-semibold">ยา</th>
                            <th className="text-right py-2 pr-2 font-semibold">เฉลี่ย/เดือน</th>
                            <th className="text-right py-2 pr-2 font-semibold">+1 เดือน</th>
                            <th className="text-right py-2 pr-2 font-semibold">+6 เดือน</th>
                            <th className="text-right py-2 pr-2 font-semibold">+12 เดือน</th>
                            <th className="text-right py-2 font-semibold">% Growth</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedRisingDrugs.map((d, i) => {
                            const pct = forecastPeriod === 1 ? d.pct1 : forecastPeriod === 6 ? d.pct6 : d.pct12;
                            const pctColor = pct >= 50 ? 'text-red-600' : pct >= 20 ? 'text-orange-500' : pct >= 0 ? 'text-emerald-600' : 'text-slate-400';
                            const pctBg   = pct >= 50 ? 'bg-red-50'   : pct >= 20 ? 'bg-orange-50'   : pct >= 0 ? 'bg-emerald-50'   : 'bg-slate-100';
                            return (
                              <tr key={i} className={`border-b border-slate-100 ${i % 2 ? 'bg-slate-50' : ''}`}>
                                <td className="py-2 pr-2 font-medium">{d.nameShort}</td>
                                <td className="py-2 pr-2 text-right text-slate-500">{fmt(d.curAvg)}</td>
                                <td className={`py-2 pr-2 text-right ${forecastPeriod === 1  ? 'font-semibold text-[#1E90FF]' : 'text-amber-600'}`}>{fmt(d.p1)}</td>
                                <td className={`py-2 pr-2 text-right ${forecastPeriod === 6  ? 'font-semibold text-[#1E90FF]' : 'text-amber-600'}`}>{fmt(d.p6)}</td>
                                <td className={`py-2 pr-2 text-right ${forecastPeriod === 12 ? 'font-semibold text-[#1E90FF]' : 'text-amber-600'}`}>{fmt(d.p12)}</td>
                                <td className="py-2 text-right">
                                  <span className={`inline-block px-2 py-0.5 rounded-full font-bold ${pctColor} ${pctBg}`}>
                                    {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <p className="text-xs text-slate-400 mt-2">* % Growth = มูลค่าคาดการณ์ ณ เดือนที่เลือก เทียบกับค่าเฉลี่ยต่อเดือนปัจจุบัน</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
