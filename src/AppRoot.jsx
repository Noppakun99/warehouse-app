import React, { useState, useEffect } from 'react';
import SearchableSelect from './SearchableSelect';
import {
  Pill, Package, TrendingUp, TrendingDown,
  User, Shield, LogOut,
  ChevronRight, Activity, Database, Clock,
} from 'lucide-react';
import App            from './App';
import RequisitionApp from './RequisitionApp';
import DispenseLogApp from './DispenseLogApp';
import ReceiveLogApp  from './ReceiveLogApp';
import { supabase }   from './lib/supabase';


// ============================================================
// Root — manages auth + page routing
// ============================================================
export default function AppRoot() {
  const [auth, setAuth]   = useState(null); // { name, role, department }
  const [page, setPage]   = useState('dashboard'); // dashboard | inventory | requisition | dispense | receive

  const logout = () => { setAuth(null); setPage('dashboard'); };

  if (!auth) return <LoginPage onLogin={setAuth} />;

  switch (page) {
    case 'inventory':
      return <App onBackToDashboard={() => setPage('dashboard')} role={auth.role} />;
    case 'requisition':
      return (
        <RequisitionApp
          onBack={() => setPage('dashboard')}
          prefilledUser={auth.role === 'requester' ? { name: auth.name, department: auth.department } : null}
          startAsStaff={auth.role === 'staff'}
        />
      );
    case 'dispense':
      return <DispenseLogApp onBack={() => setPage('dashboard')} />;
    case 'receive':
      return <ReceiveLogApp onBack={() => setPage('dashboard')} />;
    default:
      return <Dashboard auth={auth} onNavigate={setPage} onLogout={logout} />;
  }
}

// ============================================================
// Login Page
// ============================================================
function LoginPage({ onLogin }) {
  const [tab, setTab]     = useState('requester'); // requester | staff
  const [name, setName]   = useState('');
  const [dept, setDept]   = useState('');
  const [error, setError] = useState('');
  const [departments]     = useState([
    'ห้องยา G', 'ห้องยา 1',
    'ER (ฉุกเฉิน)', 'IPD (ผู้ป่วยใน)', 'OPD (ผู้ป่วยนอก)', 'LR (ห้องคลอด)',
    'ทันตกรรม', 'แผนไทย', 'กายภาพ', 'LAB', 'X-ray',
    'ห้องทำแผล', 'งานส่งต่อ', 'บริหารทั่วไป', 'พ.ข.ร (พนักงานขับรถ)',
    'กลุ่มงานจิตเวชและยาเสพติด', 'IPD-หน่วยวัง', 'IPD-โดม',
    'รพสต.คูคต', 'รพสต.วัดประยูร',
    'ศูนย์บริการสาธารณสุข 2 (ชุมชนรัตนโกสินทร์)',
    'ศูนย์บริการสาธารณสุข 3 (เทพธัญญะอุปถัมภ์)',
    'ศูนย์บริการสาธารณสุข 4 (สิริเวชชะพันธ์อุปถัมภ์)',
    'เทศบาลนครรังสิต',
    'รพ.สามโคก', 'รพ.เปาโล', 'รพ.ปทุมเวศ', 'รพ.ลาดหลุมแก้ว',
    'เบิกเพิ่มจากความผิดพลาด', 'เบิกยาหมดอายุจากคลัง',
  ]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (tab === 'requester') {
      if (!name.trim() || !dept) { setError('กรุณากรอกชื่อและเลือกหน่วยงาน'); return; }
      onLogin({ name: name.trim(), role: 'requester', department: dept });
    } else {
      if (!name.trim()) { setError('กรุณากรอกชื่อ'); return; }
      onLogin({ name: name.trim(), role: 'staff', department: 'คลังยา' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 flex flex-col items-center justify-center p-4">
      {/* Brand */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur rounded-2xl shadow-xl mb-4 border border-white/30">
          <Pill size={40} className="text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white drop-shadow">ระบบบริหารคลังยา</h1>
        <p className="text-indigo-200 mt-1.5">โรงพยาบาล · Pharmacy Management System</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Tab switcher */}
        <div className="grid grid-cols-2 border-b border-slate-200">
          <button
            onClick={() => { setTab('requester'); setError(''); }}
            className={`flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-colors ${
              tab === 'requester'
                ? 'bg-sky-50 text-sky-700 border-b-2 border-sky-500'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <User size={16} /> ผู้เบิก
          </button>
          <button
            onClick={() => { setTab('staff'); setError(''); }}
            className={`flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-colors ${
              tab === 'staff'
                ? 'bg-sky-50 text-sky-700 border-b-2 border-sky-500'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Shield size={16} /> เจ้าหน้าที่คลัง
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              {tab === 'requester' ? 'ชื่อ-สกุล ผู้เบิก' : 'ชื่อ-สกุล เจ้าหน้าที่'}
            </label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="กรอกชื่อ-สกุล" required
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Department (requester only) */}
          {tab === 'requester' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">หน่วยงาน / แผนก</label>
              <SearchableSelect value={dept} onChange={setDept}
                options={departments} placeholder="-- เลือกหน่วยงาน --"
                className="w-full" />
            </div>
          )}


          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl py-3 font-semibold text-sm transition-colors shadow-sm mt-2"
          >
            เข้าสู่ระบบ
          </button>
        </form>
      </div>

      <p className="text-slate-400 text-xs mt-6">Pharmacy Management System v2.0</p>
    </div>
  );
}

// ============================================================
// Dashboard — system selection
// ============================================================
const SYSTEMS = [
  {
    key:         'inventory',
    icon:        Database,
    title:       'ระบบแผนผังคลังยา',
    desc:        'ดูแผนผังตำแหน่งยา ค้นหาสต็อก ตรวจสอบวันหมดอายุ',
    bg:          'bg-indigo-50 hover:bg-indigo-100',
    border:      'border-indigo-300 hover:border-indigo-500',
    iconBg:      'bg-sky-500 text-white',
    badge:       'bg-sky-500 text-white',
    badgeText:   'แผนผัง',
    accentText:  'text-sky-600',
    hoverLink:   'group-hover:text-sky-700',
    clockColor:  'text-sky-600',
    roles:       ['requester', 'staff'],
  },
  {
    key:         'requisition',
    icon:        Package,
    title:       'ระบบเบิกยาออนไลน์',
    desc:        'ส่งใบเบิก ตรวจสอบสถานะ อนุมัติและจ่ายยา',
    bg:          'bg-blue-50 hover:bg-blue-100',
    border:      'border-blue-300 hover:border-blue-500',
    iconBg:      'bg-blue-600 text-white',
    badge:       'bg-blue-600 text-white',
    badgeText:   'เบิกยา',
    accentText:  'text-blue-600',
    hoverLink:   'group-hover:text-blue-700',
    clockColor:  'text-blue-600',
    roles:       ['requester', 'staff'],
  },
  {
    key:         'receive',
    icon:        TrendingUp,
    title:       'ประวัติการรับยาเข้าคลัง',
    desc:        'ค้นหาประวัติการรับเวชภัณฑ์เข้าคลัง ดูสรุปยอดและมูลค่า',
    bg:          'bg-emerald-50 hover:bg-emerald-100',
    border:      'border-emerald-300 hover:border-emerald-500',
    iconBg:      'bg-emerald-600 text-white',
    badge:       'bg-emerald-600 text-white',
    badgeText:   'คลังรับ',
    accentText:  'text-emerald-600',
    hoverLink:   'group-hover:text-emerald-700',
    clockColor:  'text-emerald-600',
    roles:       ['staff'],
  },
  {
    key:         'dispense',
    icon:        TrendingDown,
    title:       'ประวัติการเบิกจ่ายยา',
    desc:        'ค้นหาและวิเคราะห์ประวัติการเบิกจ่ายตามหน่วยงาน',
    bg:          'bg-rose-50 hover:bg-rose-100',
    border:      'border-rose-300 hover:border-rose-500',
    iconBg:      'bg-rose-600 text-white',
    badge:       'bg-rose-600 text-white',
    badgeText:   'คลังเบิก',
    accentText:  'text-rose-600',
    hoverLink:   'group-hover:text-rose-700',
    clockColor:  'text-rose-600',
    roles:       ['staff'],
  },
];

function Dashboard({ auth, onNavigate, onLogout }) {
  const isStaff = auth.role === 'staff';
  const visible = SYSTEMS.filter(s => s.roles.includes(auth.role));
  const [uploadMeta, setUploadMeta] = useState({ inventory: null, drug_details: null });
  const [lastReceive, setLastReceive] = useState(null);
  const [lastDispense, setLastDispense] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('upload_meta').select('*').then(({ data }) => {
      if (data) {
        const m = {};
        data.forEach(r => { m[r.type] = r; });
        setUploadMeta(m);
      }
    });
    if (isStaff) {
      supabase.from('receive_logs').select('created_at').order('created_at', { ascending: false }).limit(1)
        .then(({ data }) => { if (data?.[0]) setLastReceive(data[0].created_at); });
      supabase.from('dispense_logs').select('created_at').order('created_at', { ascending: false }).limit(1)
        .then(({ data }) => { if (data?.[0]) setLastDispense(data[0].created_at); });
    }
  }, [isStaff]);

  const fmtDate = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-200 via-slate-100 to-indigo-100 font-sans">
      {/* Top navbar */}
      <header className="bg-gradient-to-r from-sky-500 to-blue-600 shadow-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 text-white rounded-xl">
              <Pill size={22} />
            </div>
            <div>
              <p className="font-bold text-white text-sm leading-tight">ระบบบริหารคลังยา</p>
              <p className="text-xs text-indigo-200">Pharmacy Management System</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-white/15 border border-white/20 rounded-xl px-3 py-1.5">
              {isStaff
                ? <Shield size={14} className="text-indigo-200" />
                : <User   size={14} className="text-indigo-200" />
              }
              <div className="text-xs">
                <p className="font-semibold text-white">{auth.name}</p>
                <p className="text-indigo-200">{isStaff ? 'เจ้าหน้าที่คลังยา' : auth.department}</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 text-indigo-100 hover:text-white text-sm font-medium transition-colors px-3 py-1.5 rounded-xl hover:bg-white/10"
            >
              <LogOut size={15} /> ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      {/* Welcome */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-4">
        <h2 className="text-2xl font-bold text-slate-800">
          สวัสดี, {auth.name} 👋
        </h2>
        <p className="text-slate-500 mt-1 text-sm">
          {isStaff
            ? 'คุณมีสิทธิ์เข้าถึงระบบทั้งหมด — เลือกระบบที่ต้องการใช้งาน'
            : `หน่วยงาน: ${auth.department} — เลือกระบบที่ต้องการ`
          }
        </p>
      </div>

      {/* System cards */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
        <div className={`grid gap-4 ${visible.length > 1 ? 'sm:grid-cols-2' : 'max-w-sm'}`}>
          {visible.map(sys => {
            const Icon = sys.icon;
            return (
              <button
                key={sys.key}
                onClick={() => onNavigate(sys.key)}
                className={`group ${sys.bg} ${sys.border} border-2 rounded-2xl p-6 text-left shadow-md hover:shadow-xl transition-all duration-200`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className={`p-3.5 ${sys.iconBg} rounded-xl shrink-0 shadow-sm`}>
                    <Icon size={28} />
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${sys.badge} shrink-0 mt-1 shadow-sm`}>
                    {sys.badgeText}
                  </span>
                </div>

                <div className="mt-4">
                  <h3 className="font-bold text-slate-800 text-lg leading-tight">{sys.title}</h3>
                  <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">{sys.desc}</p>
                  {sys.key === 'inventory' && fmtDate(uploadMeta.inventory?.updated_at) && (
                    <p className={`flex items-center gap-1 text-xs mt-2 font-medium ${sys.clockColor}`}>
                      <Clock size={11} /> อัพเดต: {fmtDate(uploadMeta.inventory?.updated_at)}
                    </p>
                  )}
                  {sys.key === 'receive' && fmtDate(lastReceive) && (
                    <p className={`flex items-center gap-1 text-xs mt-2 font-medium ${sys.clockColor}`}>
                      <Clock size={11} /> อัพเดต: {fmtDate(lastReceive)}
                    </p>
                  )}
                  {sys.key === 'dispense' && fmtDate(lastDispense) && (
                    <p className={`flex items-center gap-1 text-xs mt-2 font-medium ${sys.clockColor}`}>
                      <Clock size={11} /> อัพเดต: {fmtDate(lastDispense)}
                    </p>
                  )}
                </div>

                <div className={`flex items-center gap-1 mt-5 text-sm font-semibold text-slate-400 ${sys.hoverLink} transition-colors`}>
                  เข้าสู่ระบบ <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Quick stats strip (staff only) */}
        {isStaff && <StatsStrip />}
      </div>
    </div>
  );
}

// ---- Quick stats (staff view only) ----
function StatsStrip() {
  const [stats, setStats] = React.useState({ inventory: '-', pending: '-', dispense30: '-', receive30: '-' });

  React.useEffect(() => {
    if (!supabase) return;
    const ago30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    Promise.all([
      supabase.from('inventory').select('id', { count: 'exact', head: true }),
      supabase.from('requisitions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('dispense_logs').select('id', { count: 'exact', head: true }).gte('dispense_date', ago30),
      supabase.from('receive_logs').select('id', { count: 'exact', head: true }).gte('receive_date', ago30),
    ]).then(([inv, pend, disp, recv]) => {
      setStats({
        inventory:  inv.count  ?? '-',
        pending:    pend.count ?? '-',
        dispense30: disp.count ?? '-',
        receive30:  recv.count ?? '-',
      });
    });
  }, []);

  const items = [
    { label: 'รายการยาในคลัง',    value: stats.inventory,  color: 'text-sky-700',  cardBg: 'bg-sky-50',  borderColor: 'border-sky-200',  labelColor: 'text-sky-500' },
    { label: 'ใบเบิกรอดำเนินการ', value: stats.pending,    color: stats.pending > 0 ? 'text-amber-700' : 'text-slate-700',  cardBg: stats.pending > 0 ? 'bg-amber-50' : 'bg-slate-50',  borderColor: stats.pending > 0 ? 'border-amber-200' : 'border-slate-200',  labelColor: stats.pending > 0 ? 'text-amber-600' : 'text-slate-500' },
    { label: 'เบิกจ่าย (30 วัน)', value: stats.dispense30, color: 'text-rose-700',    cardBg: 'bg-rose-50',    borderColor: 'border-rose-200',    labelColor: 'text-rose-500' },
    { label: 'รับเข้า (30 วัน)',   value: stats.receive30,  color: 'text-emerald-700', cardBg: 'bg-emerald-50', borderColor: 'border-emerald-200', labelColor: 'text-emerald-600' },
  ];

  return (
    <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(item => (
        <div key={item.label} className={`${item.cardBg} border ${item.borderColor} rounded-xl p-4 text-center shadow-sm`}>
          <p className={`text-2xl font-bold ${item.color}`}>{typeof item.value === 'number' ? item.value.toLocaleString() : item.value}</p>
          <p className={`text-xs mt-1 leading-tight ${item.labelColor}`}>{item.label}</p>
        </div>
      ))}
    </div>
  );
}
