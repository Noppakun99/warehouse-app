import React, { useState } from 'react';
import {
  Pill, Package, TrendingUp, TrendingDown,
  User, Shield, LogOut,
  ChevronRight, Activity, Database,
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
      return <App onBackToDashboard={() => setPage('dashboard')} />;
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
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      {/* Brand */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-600 rounded-2xl shadow-lg mb-4">
          <Pill size={40} className="text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-800">ระบบบริหารคลังยา</h1>
        <p className="text-slate-500 mt-1.5">โรงพยาบาล · Pharmacy Management System</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Tab switcher */}
        <div className="grid grid-cols-2 border-b border-slate-200">
          <button
            onClick={() => { setTab('requester'); setError(''); }}
            className={`flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-colors ${
              tab === 'requester'
                ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <User size={16} /> ผู้เบิก
          </button>
          <button
            onClick={() => { setTab('staff'); setError(''); }}
            className={`flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-colors ${
              tab === 'staff'
                ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600'
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
              <select
                value={dept} onChange={e => setDept(e.target.value)} required
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
              >
                <option value="">-- เลือกหน่วยงาน --</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}


          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 font-semibold text-sm transition-colors shadow-sm mt-2"
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
    color:       'indigo',
    bg:          'bg-indigo-50',
    border:      'border-indigo-200 hover:border-indigo-400',
    iconBg:      'bg-indigo-100 text-indigo-600',
    badge:       'bg-indigo-100 text-indigo-700',
    badgeText:   'แผนผัง',
    roles:       ['staff'],
  },
  {
    key:         'requisition',
    icon:        Package,
    title:       'ระบบเบิกยาออนไลน์',
    desc:        'ส่งใบเบิก ตรวจสอบสถานะ อนุมัติและจ่ายยา',
    color:       'blue',
    bg:          'bg-blue-50',
    border:      'border-blue-200 hover:border-blue-400',
    iconBg:      'bg-blue-100 text-blue-600',
    badge:       'bg-blue-100 text-blue-700',
    badgeText:   'เบิกยา',
    roles:       ['requester', 'staff'],
  },
  {
    key:         'receive',
    icon:        TrendingUp,
    title:       'ประวัติการรับยาเข้าคลัง',
    desc:        'ค้นหาประวัติการรับเวชภัณฑ์เข้าคลัง ดูสรุปยอดและมูลค่า',
    color:       'emerald',
    bg:          'bg-emerald-50',
    border:      'border-emerald-200 hover:border-emerald-400',
    iconBg:      'bg-emerald-100 text-emerald-600',
    badge:       'bg-emerald-100 text-emerald-700',
    badgeText:   'คลังรับ',
    roles:       ['requester', 'staff'],
  },
  {
    key:         'dispense',
    icon:        TrendingDown,
    title:       'ประวัติการเบิกจ่ายยา',
    desc:        'ค้นหาและวิเคราะห์ประวัติการเบิกจ่ายตามหน่วยงาน',
    color:       'rose',
    bg:          'bg-rose-50',
    border:      'border-rose-200 hover:border-rose-400',
    iconBg:      'bg-rose-100 text-rose-600',
    badge:       'bg-rose-100 text-rose-700',
    badgeText:   'คลังเบิก',
    roles:       ['requester', 'staff'],
  },
];

function Dashboard({ auth, onNavigate, onLogout }) {
  const isStaff    = auth.role === 'staff';
  const visible    = SYSTEMS.filter(s => s.roles.includes(auth.role));

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      {/* Top navbar */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
              <Pill size={22} />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">ระบบบริหารคลังยา</p>
              <p className="text-xs text-slate-400">Pharmacy Management System</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              {isStaff
                ? <Shield size={14} className="text-indigo-500" />
                : <User   size={14} className="text-blue-500" />
              }
              <div className="text-xs">
                <p className="font-semibold text-slate-700">{auth.name}</p>
                <p className="text-slate-400">{isStaff ? 'เจ้าหน้าที่คลังยา' : auth.department}</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors px-3 py-1.5 rounded-xl hover:bg-slate-100"
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
                className={`group bg-white ${sys.border} border-2 rounded-2xl p-6 text-left shadow-sm hover:shadow-md transition-all`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className={`p-3.5 ${sys.iconBg} rounded-xl shrink-0`}>
                    <Icon size={28} />
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${sys.badge} shrink-0 mt-1`}>
                    {sys.badgeText}
                  </span>
                </div>

                <div className="mt-4">
                  <h3 className="font-bold text-slate-800 text-lg leading-tight">{sys.title}</h3>
                  <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">{sys.desc}</p>
                </div>

                <div className="flex items-center gap-1 mt-5 text-sm font-semibold text-slate-400 group-hover:text-indigo-600 transition-colors">
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
    { label: 'รายการยาในคลัง',    value: stats.inventory,  color: 'text-indigo-600' },
    { label: 'ใบเบิกรอดำเนินการ', value: stats.pending,    color: stats.pending > 0 ? 'text-amber-600' : 'text-slate-600' },
    { label: 'เบิกจ่าย (30 วัน)', value: stats.dispense30, color: 'text-rose-600' },
    { label: 'รับเข้า (30 วัน)',   value: stats.receive30,  color: 'text-emerald-600' },
  ];

  return (
    <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(item => (
        <div key={item.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
          <p className={`text-2xl font-bold ${item.color}`}>{typeof item.value === 'number' ? item.value.toLocaleString() : item.value}</p>
          <p className="text-xs text-slate-500 mt-1 leading-tight">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
