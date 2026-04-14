import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend,
} from 'recharts';
import { ArrowLeft, TrendingUp, Package, Building2, Banknote, RefreshCcw, BarChart2, CalendarDays } from 'lucide-react';
import { fetchDispenseAnalytics } from './lib/db';

// ============================================================
// Helpers
// ============================================================
const BLUE   = '#1E90FF';
const COLORS = ['#1E90FF','#3B82F6','#06B6D4','#10B981','#8B5CF6','#F59E0B','#EF4444','#EC4899','#6366F1','#14B8A6'];

// ราคาต่อหน่วย พร้อม fallback จาก drug_unit (เหมือน DispenseSummaryModal)
function getPrice(r) {
  if (r.price_per_unit != null && r.price_per_unit !== '') return parseFloat(r.price_per_unit) || 0;
  const u = parseFloat(r.drug_unit);
  if (!isNaN(u) && u > 0) return u;
  return 0;
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

// Default: ดึงข้อมูลทั้งหมด (ไม่จำกัดช่วงวันที่)
function defaultRange() {
  return { from: '', to: '' };
}

// ============================================================
// Stat Card
// ============================================================
function StatCard({ icon: Icon, label, value, sub, color = BLUE, bg = 'bg-blue-50' }) {
  return (
    <div className={`${bg} rounded-2xl p-4 flex items-center gap-4`}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: color + '20' }}>
        <Icon size={24} style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-black" style={{ color }}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ============================================================
// Custom tooltip
// ============================================================
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

// ============================================================
// Main Component
// ============================================================
export default function AnalyticsApp({ onBack }) {
  const range = defaultRange();
  const [dateFrom, setDateFrom] = useState(range.from);
  const [dateTo,   setDateTo]   = useState(range.to);
  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchDispenseAnalytics(dateFrom, dateTo);
      setRows(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  // ---- Aggregations (ตรงกับ DispenseSummaryModal) ----
  const { topDrugs, topDrugsByDays, monthlyTrend, topDepts, topDeptsValue, totalQty, totalValue, uniqueDays } = useMemo(() => {
    const drugMap     = {};
    const drugDaysMap = {}; // unique days ต่อยา
    const monthMap    = {};
    const deptMap     = {};
    const deptDaysMap = {}; // unique days ต่อหน่วยงาน
    let totalQty = 0, totalValue = 0;

    rows.forEach(r => {
      const qty   = parseFloat(r.qty_out) || 0;
      const price = getPrice(r);
      const value = qty * price;
      totalQty   += qty;
      totalValue += value;

      // Drug map
      const drugKey = r.drug_name || r.drug_code || '-';
      if (!drugMap[drugKey]) drugMap[drugKey] = { name: drugKey, qty: 0, value: 0 };
      drugMap[drugKey].qty   += qty;
      drugMap[drugKey].value += value;

      // Drug unique days
      if (r.dispense_date) {
        if (!drugDaysMap[drugKey]) drugDaysMap[drugKey] = new Set();
        drugDaysMap[drugKey].add(r.dispense_date);
      }

      // Monthly trend
      const month = (r.dispense_date || '').slice(0, 7);
      if (month) {
        if (!monthMap[month]) monthMap[month] = { month, qty: 0, value: 0 };
        monthMap[month].qty   += qty;
        monthMap[month].value += value;
      }

      // Department: qty และ unique days
      const dept = r.department || 'ไม่ระบุ';
      if (!deptMap[dept]) deptMap[dept] = { name: dept, qty: 0, value: 0 };
      deptMap[dept].qty   += qty;
      deptMap[dept].value += value;

      if (r.dispense_date) {
        if (!deptDaysMap[dept]) deptDaysMap[dept] = new Set();
        deptDaysMap[dept].add(r.dispense_date);
      }
    });

    // ใส่ days กลับเข้า drugMap
    Object.keys(drugDaysMap).forEach(k => {
      if (drugMap[k]) drugMap[k].days = drugDaysMap[k].size;
    });

    // unique days ทั้งหมด
    const allDates = new Set(rows.map(r => r.dispense_date).filter(Boolean));
    const uniqueDays = allDates.size;

    // Top drugs by value (มูลค่า)
    const topDrugs = Object.values(drugMap)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map(d => ({ ...d, nameShort: d.name.length > 28 ? d.name.slice(0, 28) + '…' : d.name }));

    // Top drugs by unique days (วันที่มีการเบิกจริง)
    const topDrugsByDays = Object.values(drugMap)
      .sort((a, b) => b.days - a.days)
      .slice(0, 10)
      .map(d => ({ ...d, nameShort: d.name.length > 28 ? d.name.slice(0, 28) + '…' : d.name }));

    const monthlyTrend = Object.values(monthMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({ ...m, label: thMonth(m.month) }));

    // top dept by unique days (เหมือน "หน่วยงานที่เบิกบ่อย")
    const topDepts = Object.entries(deptDaysMap)
      .map(([name, days]) => ({ name, days: days.size }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 10);

    // top dept by value (เหมือน "หน่วยงาน — มูลค่าสูงสุด")
    const topDeptsValue = Object.values(deptMap)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return { topDrugs, topDrugsByDays, monthlyTrend, topDepts, topDeptsValue, totalQty, totalValue, uniqueDays };
  }, [rows]);

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1E90FF] to-[#0055cc] text-white px-4 pt-safe">
        <div className="flex items-center gap-3 py-4">
          <button onClick={onBack} className="p-2 rounded-xl bg-white/10 hover:bg-white/25 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-black">วิเคราะห์การเบิกยา</h1>
            <p className="text-white/70 text-xs">ข้อมูลจาก Dispense Log</p>
          </div>
          <button onClick={load} className="p-2 rounded-xl bg-white/10 hover:bg-white/25 transition-colors" title="รีเฟรช">
            <RefreshCcw size={18} />
          </button>
        </div>

        {/* Date filter */}
        <div className="flex items-center gap-2 pb-4 flex-wrap">
          <span className="text-white/70 text-sm">ตั้งแต่</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-white/10 border border-white/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:bg-white/20" />
          <span className="text-white/70 text-sm">ถึง</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-white/10 border border-white/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:bg-white/20" />
        </div>
      </div>

      <div className="p-4 space-y-5 max-w-4xl mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-10 h-10 border-4 border-[#1E90FF] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm">กำลังโหลดข้อมูล...</p>
          </div>
        ) : (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={Package}      label="รายการเบิกทั้งหมด"      value={rows.length.toLocaleString()}  sub={`ปริมาณรวม ${fmt(totalQty)}`}   color="#1E90FF" bg="bg-blue-50" />
              <StatCard icon={Banknote}     label="มูลค่าเบิกทั้งหมด (บาท)" value={fmtMoney(totalValue)}          sub="ราคา × จำนวน"                   color="#10B981" bg="bg-emerald-50" />
              <StatCard icon={CalendarDays} label="จำนวนวันที่มีการเบิก"    value={uniqueDays.toLocaleString()}   sub="วัน (ทุกช่วงเวลา)"              color="#8B5CF6" bg="bg-purple-50" />
              <StatCard icon={Building2}    label="หน่วยงานที่เบิก"         value={topDeptsValue.length}          sub="หน่วยงาน"                       color="#F59E0B" bg="bg-amber-50" />
            </div>

            {/* Monthly Trend — Line Chart */}
            {monthlyTrend.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h2 className="font-bold text-slate-700 mb-1 flex items-center gap-2">
                  <BarChart2 size={18} className="text-[#1E90FF]" /> แนวโน้มการเบิกรายเดือน
                </h2>
                <p className="text-xs text-slate-400 mb-4">ทุกเดือนที่มีข้อมูลใน dispense log</p>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={monthlyTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} width={50} />
                    <Tooltip content={<ChartTooltip valueLabel="จำนวนเบิก" />} />
                    <Line type="monotone" dataKey="qty" stroke={BLUE} strokeWidth={2.5} dot={{ r: 4, fill: BLUE }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top 10 Drugs — by Value */}
            {topDrugs.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h2 className="font-bold text-slate-700 mb-1 flex items-center gap-2">
                  <Banknote size={18} className="text-[#10B981]" /> ยาที่มีมูลค่าเบิกสูงสุด
                </h2>
                <p className="text-xs text-slate-400 mb-4">คำนวณจาก ราคา/หน่วย × จำนวนที่เบิก</p>
                <ResponsiveContainer width="100%" height={topDrugs.length * 38 + 20}>
                  <BarChart data={topDrugs} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmt} />
                    <YAxis type="category" dataKey="nameShort" tick={{ fontSize: 11 }} width={170} />
                    <Tooltip content={<ChartTooltip valueLabel="มูลค่า" money />} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#64748B', formatter: fmt }}>
                      {topDrugs.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top 10 Drugs — by Unique Days */}
            {topDrugsByDays.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h2 className="font-bold text-slate-700 mb-1 flex items-center gap-2">
                  <CalendarDays size={18} className="text-[#8B5CF6]" /> ยาที่เบิกบ่อย (จำนวนวัน)
                </h2>
                <p className="text-xs text-slate-400 mb-4">นับจากจำนวนวันที่มีการเบิกยานั้นจริง</p>
                <ResponsiveContainer width="100%" height={topDrugsByDays.length * 38 + 20}>
                  <BarChart data={topDrugsByDays} layout="vertical" margin={{ top: 0, right: 50, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="nameShort" tick={{ fontSize: 11 }} width={170} />
                    <Tooltip content={<ChartTooltip valueLabel="จำนวนวัน" />} />
                    <Bar dataKey="days" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#64748B' }}>
                      {topDrugsByDays.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top Departments — by Days */}
            {topDepts.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h2 className="font-bold text-slate-700 mb-1 flex items-center gap-2">
                  <Building2 size={18} className="text-[#1E90FF]" /> หน่วยงานที่เบิกบ่อย (จำนวนวัน)
                </h2>
                <p className="text-xs text-slate-400 mb-4">นับจากจำนวนวันที่มีการเบิกต่อหน่วยงาน</p>
                <ResponsiveContainer width="100%" height={topDepts.length * 38 + 20}>
                  <BarChart data={topDepts} layout="vertical" margin={{ top: 0, right: 50, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip content={<ChartTooltip valueLabel="จำนวนวัน" />} />
                    <Bar dataKey="days" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#64748B' }}>
                      {topDepts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top Departments — by Value */}
            {topDeptsValue.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h2 className="font-bold text-slate-700 mb-1 flex items-center gap-2">
                  <Banknote size={18} className="text-[#10B981]" /> หน่วยงาน — มูลค่าสูงสุด
                </h2>
                <p className="text-xs text-slate-400 mb-4">มูลค่าการเบิกรวมต่อหน่วยงาน (บาท)</p>
                <ResponsiveContainer width="100%" height={topDeptsValue.length * 38 + 20}>
                  <BarChart data={topDeptsValue} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmt} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip content={<ChartTooltip valueLabel="มูลค่า" money />} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#64748B', formatter: fmt }}>
                      {topDeptsValue.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {rows.length === 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-slate-400">
                <TrendingUp size={40} className="mx-auto mb-3 opacity-20" />
                <p className="font-semibold">ไม่พบข้อมูลในช่วงเวลาที่เลือก</p>
                <p className="text-sm mt-1">ลองเปลี่ยนช่วงวันที่</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
