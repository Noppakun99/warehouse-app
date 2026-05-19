import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SearchableSelect from './SearchableSelect';
import {
  Pill, Package, TrendingUp, TrendingDown,
  User, Shield, LogOut, ShieldCheck, Users,
  ChevronRight, Activity, Database, Clock,
  AlertTriangle, ChevronDown, ChevronUp, RotateCcw, ClipboardList,
  Eye, EyeOff, X, Bell, Search, RefreshCcw, FileDown,
} from 'lucide-react';
import App                from './App';
import DrugSearchBar, { DrugTypeBadge } from './DrugSearchBar';
import { exportToExcel }  from './lib/exportExcel';
import RequisitionApp     from './RequisitionApp';
import DispenseLogApp     from './DispenseLogApp';
import ReceiveLogApp      from './ReceiveLogApp';
import { supabase }       from './lib/supabase';
import { fetchDashboardAlerts, fetchNotifications, loginUser, registerUser, checkFirstRun, createAppUser, fetchStockSummary } from './lib/db';
import ReturnApp          from './ReturnApp';
import AuditLogApp        from './AuditLogApp';
import UserManagementApp  from './UserManagementApp';
import AnalyticsApp       from './AnalyticsApp';


// ============================================================
// Root — manages auth + page routing
// ============================================================
const AUTH_KEY = 'wh_auth';

const PAGE_VARIANTS = {
  initial:  { opacity: 0, y: 18 },
  animate:  { opacity: 1, y: 0,  transition: { duration: 0.22, ease: 'easeOut' } },
  exit:     { opacity: 0, y: -10, transition: { duration: 0.15, ease: 'easeIn'  } },
};

export default function AppRoot() {
  const [auth, setAuth]   = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(AUTH_KEY)) || null; } catch { return null; }
  });
  const [page, setPage]   = useState('dashboard');
  const [subKey, setSubKey] = useState(0);
  const [toasts, setToasts] = useState([]);

  const dismissToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  // Subscribe ใบเบิกใหม่ — เฉพาะ staff/admin เท่านั้น
  useEffect(() => {
    if (!supabase || !auth || (auth.role !== 'staff' && auth.role !== 'admin')) return;
    const ch = supabase
      .channel('approot-req-toast')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requisitions' }, (payload) => {
        const req = payload.new;
        const id = Date.now();
        setToasts(prev => [...prev.slice(-2), { id, req }]); // max 3 toasts
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [auth?.id]);

  const handleLogin = (user) => { sessionStorage.setItem(AUTH_KEY, JSON.stringify(user)); setAuth(user); };
  const logout = () => { sessionStorage.removeItem(AUTH_KEY); setAuth(null); setPage('dashboard'); setToasts([]); };
  const refreshPage = () => setSubKey(k => k + 1);

  let content;
  if (!auth) {
    content = <LoginPage onLogin={handleLogin} />;
  } else {
    switch (page) {
      case 'inventory':
        content = <App key={subKey} onBackToDashboard={() => setPage('dashboard')} onRefresh={refreshPage} role={auth.role} auth={auth} />;
        break;
      case 'requisition':
      case 'requisition-history':
        content = (
          <RequisitionApp
            key={subKey}
            onBack={() => setPage('dashboard')}
            onRefresh={refreshPage}
            prefilledUser={{ name: (auth.name && auth.name.trim() && auth.name.trim() !== '-') ? auth.name : auth.username, department: auth.department }}
            startAsStaff={auth.role === 'staff' || auth.role === 'admin'}
            initialStep={page === 'requisition-history' ? 'history' : null}
            auth={auth}
          />
        );
        break;
      case 'dispense':
        content = <DispenseLogApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} />;
        break;
      case 'receive':
        content = <ReceiveLogApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} />;
        break;
      case 'return':
        content = <ReturnApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} />;
        break;
      case 'audit':
        content = <AuditLogApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} />;
        break;
      case 'users':
        content = <UserManagementApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} />;
        break;
      case 'analytics':
        content = <AnalyticsApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} />;
        break;
      default:
        content = <Dashboard auth={auth} onNavigate={setPage} onLogout={logout} />;
    }
  }

  const pageKey = auth ? page : '__login__';

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div key={pageKey} variants={PAGE_VARIANTS} initial="initial" animate="animate" exit="exit">
          {content}
        </motion.div>
      </AnimatePresence>

      {/* ── Toast stack (ใบเบิกใหม่) ── */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0,  scale: 1 }}
              exit={{    opacity: 0, x: 80, scale: 0.95 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="pointer-events-auto"
            >
              <ReqToast
                toast={t}
                onDismiss={() => dismissToast(t.id)}
                onNavigate={() => { setPage('requisition'); dismissToast(t.id); }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

// ============================================================
// Req Toast
// ============================================================
function ReqToast({ toast, onDismiss, onNavigate }) {
  const { req } = toast;
  const itemCount = (req.requisition_items || []).length;
  return (
    <div className="bg-white border border-amber-200 rounded-2xl shadow-2xl p-4 flex items-start gap-3 w-80 max-w-[calc(100vw-2rem)]">
      <div className="shrink-0 w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
        <Bell size={18} className="text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-sm leading-tight">ใบเบิกยาใหม่เข้า</p>
        <p className="text-xs text-slate-500 mt-0.5 truncate">
          {req.department} · {req.requester_name || 'ไม่ระบุ'}
        </p>
        {req.req_number && (
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">{req.req_number}</p>
        )}
        <button
          onClick={onNavigate}
          className="text-xs text-amber-600 font-semibold mt-1.5 hover:text-amber-700 hover:underline"
        >
          ไปดูใบเบิก →
        </button>
      </div>
      <button onClick={onDismiss} className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors mt-0.5">
        <X size={14} />
      </button>
    </div>
  );
}

// ============================================================
// Login Page
// ============================================================
const DEPARTMENTS_LIST = [
  'คลังยา',
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
  'ทดลองระบบ',
];

function LoginPage({ onLogin }) {
  const [view, setView]     = useState('login'); // login | register | firstrun | forgot
  const [checking, setChecking] = useState(true);

  // login fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // register fields
  const [rUsername,   setRUsername]   = useState('');
  const [rPassword,   setRPassword]   = useState('');
  const [rConfirm,    setRConfirm]    = useState('');
  const [rDept,       setRDept]       = useState('');
  const [rShowPw,     setRShowPw]     = useState(false);
  const [rSuccess,    setRSuccess]    = useState(false);

  // first-run (admin setup) fields — same as register but role = admin
  const [aUsername,   setAUsername]   = useState('');
  const [aPassword,   setAPassword]   = useState('');
  const [aConfirm,    setAConfirm]    = useState('');
  const [aFullName,   setAFullName]   = useState('');
  const [aShowPw,     setAShowPw]     = useState(false);

  useEffect(() => {
    checkFirstRun().then(first => {
      if (first) setView('firstrun');
      setChecking(false);
    }).catch(() => setChecking(false));
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) { setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'); return; }
    setLoading(true); setError('');
    const result = await loginUser(username, password);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    onLogin(result.user);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (rPassword !== rConfirm) { setError('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน'); return; }
    if (rPassword.length < 6)   { setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    if (!rDept) { setError('กรุณาเลือกหน่วยงาน'); return; }
    setLoading(true); setError('');
    try {
      await registerUser({ username: rUsername, password: rPassword, full_name: '', department: rDept });
      setRSuccess(true);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleFirstRun = async (e) => {
    e.preventDefault();
    if (aPassword !== aConfirm) { setError('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน'); return; }
    if (aPassword.length < 6)   { setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    setLoading(true); setError('');
    try {
      await createAppUser({ username: aUsername, password: aPassword, full_name: aFullName, department: 'คลังยา', role: 'admin' });
      setView('login');
      setError('');
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 flex items-center justify-center">
        <div className="text-white text-lg font-semibold animate-pulse">กำลังโหลด...</div>
      </div>
    );
  }

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

      {/* ===== First Run Setup ===== */}
      {view === 'firstrun' && (
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-violet-50 border-b border-violet-100 px-6 py-4 text-center">
            <ShieldCheck size={28} className="mx-auto text-violet-600 mb-1"/>
            <p className="font-bold text-violet-800">ตั้งค่าระบบครั้งแรก</p>
            <p className="text-xs text-violet-500 mt-0.5">สร้างบัญชีผู้ดูแลระบบ (Admin)</p>
          </div>
          <form onSubmit={handleFirstRun} className="p-6 space-y-4">
            <LabelInput label="ชื่อผู้ใช้ (username)" value={aUsername} onChange={e => setAUsername(e.target.value)} placeholder="เช่น admin" required autoComplete="off"/>
            <LabelInput label="ชื่อ-สกุล" value={aFullName} onChange={e => setAFullName(e.target.value)} placeholder="ชื่อ-สกุลจริง" required/>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">รหัสผ่าน</label>
              <PwInput value={aPassword} onChange={e => setAPassword(e.target.value)} show={aShowPw} onToggle={() => setAShowPw(s => !s)} required/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">ยืนยันรหัสผ่าน</label>
              <PwInput value={aConfirm} onChange={e => setAConfirm(e.target.value)} show={aShowPw} onToggle={() => setAShowPw(s => !s)} placeholder="ยืนยันรหัสผ่าน" required/>
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 text-white rounded-xl py-3 font-semibold text-sm transition-colors shadow-sm disabled:opacity-50">
              {loading ? 'กำลังสร้าง...' : 'สร้างบัญชี Admin'}
            </button>
          </form>
        </div>
      )}

      {/* ===== Login ===== */}
      {view === 'login' && (
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <form onSubmit={handleLogin} className="p-6 space-y-4">
            <LabelInput label="ชื่อผู้ใช้ (username)" value={username} onChange={e => setUsername(e.target.value)} placeholder="กรอกชื่อผู้ใช้" required autoComplete="username"/>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">รหัสผ่าน</label>
              <PwInput value={password} onChange={e => setPassword(e.target.value)} show={showPw} onToggle={() => setShowPw(s => !s)} required autoComplete="current-password"/>
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl py-3 font-semibold text-sm transition-colors shadow-sm disabled:opacity-50">
              {loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
          <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between">
            <button onClick={() => { setView('forgot'); setError(''); }}
              className="text-slate-400 hover:text-slate-600 text-sm transition-colors">
              ลืมรหัสผ่าน?
            </button>
            <button onClick={() => { setView('register'); setError(''); setRSuccess(false); }}
              className="text-sky-600 hover:text-sky-800 text-sm font-medium transition-colors">
              สมัครเข้าใช้งาน →
            </button>
          </div>
        </div>
      )}

      {/* ===== Register ===== */}
      {view === 'register' && (
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-sky-50 border-b border-sky-100 px-6 py-4">
            <p className="font-bold text-sky-800">สมัครเข้าใช้งาน</p>
            <p className="text-xs text-sky-500 mt-0.5">บัญชีใหม่จะได้รับสิทธิ์ผู้เบิก (requester)</p>
          </div>
          {rSuccess ? (
            <div className="p-6 text-center space-y-3">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 rounded-full">
                <CheckCircle size={28} className="text-emerald-600"/>
              </div>
              <p className="font-bold text-slate-800">สมัครสำเร็จ!</p>
              <p className="text-sm text-slate-500">สามารถเข้าสู่ระบบได้ทันที</p>
              <button onClick={() => { setView('login'); setError(''); }}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white rounded-xl py-2.5 font-semibold text-sm transition-colors">
                ไปหน้าเข้าสู่ระบบ
              </button>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="p-6 space-y-3.5">
              <LabelInput label="ชื่อผู้ใช้ (username)" value={rUsername} onChange={e => setRUsername(e.target.value)} placeholder="ภาษาอังกฤษ ไม่มีช่องว่าง" required autoComplete="off"/>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">หน่วยงาน</label>
                <SearchableSelect value={rDept} onChange={setRDept} options={DEPARTMENTS_LIST} placeholder="-- เลือกหน่วยงาน --"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">รหัสผ่าน (อย่างน้อย 6 ตัว)</label>
                <PwInput value={rPassword} onChange={e => setRPassword(e.target.value)} show={rShowPw} onToggle={() => setRShowPw(s => !s)} required/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">ยืนยันรหัสผ่าน</label>
                <PwInput value={rConfirm} onChange={e => setRConfirm(e.target.value)} show={rShowPw} onToggle={() => setRShowPw(s => !s)} placeholder="ยืนยันรหัสผ่าน" required/>
              </div>
              {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl py-3 font-semibold text-sm transition-colors shadow-sm disabled:opacity-50">
                {loading ? 'กำลังสมัคร...' : 'สมัครเข้าใช้งาน'}
              </button>
              <button type="button" onClick={() => { setView('login'); setError(''); }}
                className="w-full text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors py-1">
                ← กลับหน้าเข้าสู่ระบบ
              </button>
            </form>
          )}
        </div>
      )}

      {/* ===== Forgot Password ===== */}
      {view === 'forgot' && (
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-amber-50 border-b border-amber-100 px-6 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div>
              <p className="font-bold text-amber-800 text-sm">ลืมรหัสผ่าน</p>
              <p className="text-xs text-amber-600 mt-0.5">ติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน</p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              ระบบนี้ไม่รองรับการรีเซ็ตรหัสผ่านด้วยตนเอง<br/>
              กรุณาติดต่อ <span className="font-semibold text-slate-800">ผู้ดูแลระบบ (Admin)</span> เพื่อให้รีเซ็ตรหัสผ่านให้
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">ขั้นตอน</p>
              <p className="text-sm text-slate-700">1. แจ้ง Username ของคุณให้ Admin</p>
              <p className="text-sm text-slate-700">2. Admin รีเซ็ตรหัสผ่านชั่วคราวให้</p>
              <p className="text-sm text-slate-700">3. เข้าสู่ระบบด้วยรหัสใหม่</p>
            </div>
          </div>
          <div className="border-t border-slate-100 px-6 py-4 text-center">
            <button onClick={() => { setView('login'); setError(''); }}
              className="text-sky-600 hover:text-sky-800 text-sm font-medium transition-colors">
              ← กลับหน้าเข้าสู่ระบบ
            </button>
          </div>
        </div>
      )}

      <p className="text-indigo-200 text-xs mt-6">Pharmacy Management System v2.0</p>
    </div>
  );
}

// ---- Login sub-components ----
function LabelInput({ label, value, onChange, placeholder, required, autoComplete }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
      <input type="text" value={value} onChange={onChange} placeholder={placeholder} required={required} autoComplete={autoComplete}
        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"/>
    </div>
  );
}

function PwInput({ value, onChange, show, onToggle, placeholder = 'รหัสผ่าน', required, autoComplete }) {
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder} required={required} autoComplete={autoComplete}
        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 pr-10 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"/>
      <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        {show ? <EyeOff size={16}/> : <Eye size={16}/>}
      </button>
    </div>
  );
}

// ---- CheckCircle for register success (inline import) ----
function CheckCircle({ size, className }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>;
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
    roles:       ['requester', 'staff', 'admin'],
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
    roles:       ['requester', 'staff', 'admin'],
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
    roles:       ['requester', 'staff', 'admin'],
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
    roles:       ['requester', 'staff', 'admin'],
  },
  {
    key:         'return',
    icon:        RotateCcw,
    title:       'ระบบคืนยา / ยาเสียหาย',
    desc:        'บันทึกการคืนยาจาก ward ยาเสียหาย ตัดยาหมดอายุ และส่งคืนบริษัท',
    bg:          'bg-violet-50 hover:bg-violet-100',
    border:      'border-violet-300 hover:border-violet-500',
    iconBg:      'bg-violet-600 text-white',
    badge:       'bg-violet-600 text-white',
    badgeText:   'คืนยา',
    accentText:  'text-violet-600',
    hoverLink:   'group-hover:text-violet-700',
    clockColor:  'text-violet-600',
    roles:       ['requester', 'staff', 'admin'],
  },
  {
    key:         'audit',
    icon:        ClipboardList,
    title:       'Audit Log',
    desc:        'ประวัติการดำเนินการในระบบ — นำเข้า ส่งออก บันทึกคืนยา และเข้าสู่ระบบ',
    bg:          'bg-slate-50 hover:bg-slate-100',
    border:      'border-slate-300 hover:border-slate-500',
    iconBg:      'bg-slate-600 text-white',
    badge:       'bg-slate-600 text-white',
    badgeText:   'Audit',
    accentText:  'text-slate-600',
    hoverLink:   'group-hover:text-slate-700',
    clockColor:  'text-slate-600',
    roles:       ['staff', 'admin'],
  },
  {
    key:         'analytics',
    icon:        Activity,
    title:       'วิเคราะห์การเบิกยา',
    desc:        'กราฟแนวโน้มการเบิก ยา Top 10 หน่วยงาน และมูลค่ารวม',
    bg:          'bg-cyan-50 hover:bg-cyan-100',
    border:      'border-cyan-400 hover:border-cyan-600',
    iconBg:      'bg-cyan-600 text-white',
    badge:       'bg-cyan-600 text-white',
    badgeText:   'วิเคราะห์',
    accentText:  'text-cyan-600',
    hoverLink:   'group-hover:text-cyan-700',
    clockColor:  'text-cyan-600',
    roles:       ['requester', 'staff', 'admin'],
  },
  {
    key:         'users',
    icon:        Users,
    title:       'จัดการผู้ใช้งาน',
    desc:        'สร้าง แก้ไข ลบบัญชีผู้ใช้ กำหนด role และระงับการใช้งาน',
    bg:          'bg-violet-50 hover:bg-violet-100',
    border:      'border-violet-400 hover:border-violet-600',
    iconBg:      'bg-violet-700 text-white',
    badge:       'bg-violet-700 text-white',
    badgeText:   'Admin',
    accentText:  'text-violet-700',
    hoverLink:   'group-hover:text-violet-800',
    clockColor:  'text-violet-700',
    roles:       ['admin'],
  },
];

// ---- System groups (Workflow-Based Dashboard) ----
const GROUPS = [
  {
    id: 'daily',
    label: 'Daily Operations',
    sublabel: 'งานประจำวัน',
    textColor: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    keys: ['requisition', 'inventory', 'return'],
  },
  {
    id: 'reports',
    label: 'History & Reports',
    sublabel: 'สรุปและรายงาน',
    textColor: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
    keys: ['receive', 'dispense', 'analytics'],
  },
  {
    id: 'security',
    label: 'Security & Control',
    sublabel: 'ควบคุมระบบ',
    textColor: 'text-slate-700',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    dot: 'bg-slate-500',
    keys: ['audit', 'users'],
  },
];

// ---- Notification helpers ----
const NOTIF_LABELS = {
  submit_requisition:           { label: 'ส่งใบเบิกใหม่',        color: 'text-[#1E90FF]',  dot: 'bg-[#1E90FF]' },
  requester_edit_requisition:   { label: 'แก้ไขใบเบิก',          color: 'text-amber-600',  dot: 'bg-amber-400' },
  requester_delete_requisition: { label: 'ลบใบเบิก',             color: 'text-red-600',    dot: 'bg-red-400'   },
  delete_requisition:           { label: 'ลบใบเบิก',             color: 'text-red-600',    dot: 'bg-red-400'   },
  update_requisition:           { label: 'แก้ไขใบเบิก',          color: 'text-amber-600',  dot: 'bg-amber-400' },
  insert_return:                { label: 'คืนยา',                color: 'text-blue-600',   dot: 'bg-blue-400'  },
  delete_dispense:              { label: 'ลบรายการจ่ายยา',       color: 'text-red-600',    dot: 'bg-red-400'   },
  update_dispense:              { label: 'แก้ไขรายการจ่ายยา',    color: 'text-amber-600',  dot: 'bg-amber-400' },
  delete_receive:               { label: 'ลบรายการรับยา',        color: 'text-red-600',    dot: 'bg-red-400'   },
  update_receive:               { label: 'แก้ไขรายการรับยา',     color: 'text-amber-600',  dot: 'bg-amber-400' },
  export_excel:                 { label: 'Export Excel',         color: 'text-emerald-600', dot: 'bg-emerald-400' },
};

const NOTIFY_ACTIONS = Object.keys(NOTIF_LABELS);

function notifMessage(n) {
  const who = n.user_name && n.user_name !== '-' ? n.user_name : (n.department || 'ผู้ใช้');
  const d = n.details || {};
  switch (n.action) {
    case 'submit_requisition':
      return `${who} ส่งใบเบิก${d.req_number ? ` ${d.req_number}` : ''} ${n.record_count ? `(${n.record_count} รายการ)` : ''} · ${n.department}`;
    case 'insert_return':
      return `${who} คืนยา "${d.drug_name || ''}" ${d.qty ? `${d.qty} หน่วย` : ''} · ${n.department}`;
    case 'export_excel':
      return `${who} Export Excel · ${n.department}`;
    case 'requester_edit_requisition':
    case 'update_requisition':
      return `${who} แก้ไขใบเบิก · ${n.department}`;
    case 'requester_delete_requisition':
    case 'delete_requisition':
      return `${who} ลบใบเบิก · ${n.department}`;
    default:
      return `${who} · ${n.department}`;
  }
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เมื่อกี้';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hrs / 24);
  return `${days} วันที่แล้ว`;
}

function Dashboard({ auth, onNavigate, onLogout }) {
  const isStaff = auth.role === 'staff' || auth.role === 'admin';
  const extraPerms = auth.permissions || [];
  const visible = SYSTEMS.filter(s => s.roles.includes(auth.role) || extraPerms.includes(s.key));
  const [uploadMeta, setUploadMeta] = useState({ inventory: null, drug_details: null });
  const [lastReceive, setLastReceive] = useState(null);
  const [lastDispense, setLastDispense] = useState(null);
  const [alerts, setAlerts] = useState({ expiring: [], lowStock: [] });
  const [alertModal, setAlertModal] = useState(null); // null | 'expiry' | 'lowStock' | 'stock'
  const [pendingCount, setPendingCount] = useState(0);

  // Online presence
  const [onlineUsers, setOnlineUsers] = useState([]);
  useEffect(() => {
    if (!supabase || !auth?.id) return;
    const ch = supabase.channel('user-presence', { config: { presence: { key: String(auth.id) } } });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      setOnlineUsers(Object.values(state).flat());
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({
          user_id:    auth.id,
          user_name:  (auth.name && auth.name.trim() && auth.name.trim() !== '-') ? auth.name : auth.username,
          role:       auth.role,
          department: auth.department || '-',
          joined_at:  new Date().toISOString(),
        });
      }
    });
    return () => { supabase.removeChannel(ch); };
  }, [auth?.id]);

  // Notification bell
  const LAST_READ_KEY = `notif_last_read_${auth.id}`;
  const [notifs, setNotifs]       = useState([]);
  const [showBell, setShowBell]   = useState(false);
  const [lastRead, setLastRead]   = useState(() => localStorage.getItem(LAST_READ_KEY) || null);
  const bellRef = useRef(null);

  const unreadCount = notifs.filter(n => !lastRead || new Date(n.created_at) > new Date(lastRead)).length;

  const markRead = useCallback(() => {
    const now = new Date().toISOString();
    localStorage.setItem(LAST_READ_KEY, now);
    setLastRead(now);
  }, [LAST_READ_KEY]);

  const loadNotifs = useCallback(() => {
    fetchNotifications().then(setNotifs).catch(() => {});
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('upload_meta').select('*').then(({ data }) => {
      if (data) {
        const m = {};
        data.forEach(r => { m[r.type] = r; });
        setUploadMeta(m);
      }
    });
    fetchDashboardAlerts().then(setAlerts);

    if (isStaff) {
      supabase.from('receive_logs').select('created_at').order('created_at', { ascending: false }).limit(1)
        .then(({ data }) => { if (data?.[0]) setLastReceive(data[0].created_at); });
      supabase.from('dispense_logs').select('created_at').order('created_at', { ascending: false }).limit(1)
        .then(({ data }) => { if (data?.[0]) setLastDispense(data[0].created_at); });
      loadNotifs();

      const sub = supabase
        .channel('notif-bell')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, (payload) => {
          const row = payload.new;
          if (NOTIFY_ACTIONS.includes(row.action)) {
            setNotifs(prev => [row, ...prev].slice(0, 30));
          }
        })
        .subscribe();
      return () => { supabase.removeChannel(sub); };
    }
  }, [isStaff, loadNotifs]);

  // ปิด dropdown เมื่อคลิกนอก
  useEffect(() => {
    if (!showBell) return;
    const handler = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) setShowBell(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showBell]);

  const displayName = (auth.name && auth.name.trim() && auth.name.trim() !== '-') ? auth.name : auth.username;

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
              {auth.role === 'admin'
                ? <ShieldCheck size={14} className="text-violet-200" />
                : isStaff
                  ? <Shield size={14} className="text-indigo-200" />
                  : <User   size={14} className="text-indigo-200" />
              }
              <div className="text-xs">
                <p className="font-semibold text-white">{displayName}</p>
                <p className="text-indigo-200">
                  {auth.role === 'admin' ? 'ผู้ดูแลระบบ' : isStaff ? 'เจ้าหน้าที่คลังยา' : auth.department}
                </p>
              </div>
            </div>

            {/* Bell — staff/admin เท่านั้น */}
            {isStaff && (
              <div className="relative" ref={bellRef}>
                <button
                  onClick={() => { setShowBell(v => { if (!v) markRead(); return !v; }); }}
                  className="relative p-2 text-indigo-100 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                  title="การแจ้งเตือน"
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-0.5 leading-none shadow">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {showBell && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                      <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                        <Bell size={14} className="text-slate-500" /> การแจ้งเตือน
                        {notifs.length > 0 && (
                          <span className="text-xs text-slate-400 font-normal">7 วันล่าสุด</span>
                        )}
                      </span>
                      <button onClick={() => setShowBell(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={16} />
                      </button>
                    </div>

                    {/* ── ผู้ใช้งานออนไลน์ขณะนี้ ── */}
                    <div className="px-4 py-3 border-b border-slate-100 bg-emerald-50/60">
                      <p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 mb-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                        ออนไลน์ขณะนี้
                        <span className="ml-auto font-semibold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                          {onlineUsers.length} คน
                        </span>
                      </p>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {onlineUsers.length === 0
                          ? <p className="text-xs text-slate-400">ไม่มีผู้ใช้งาน</p>
                          : onlineUsers.map((u, i) => {
                            const isMe = String(u.user_id) === String(auth.id);
                            const roleLabel = u.role === 'admin' ? 'ผู้ดูแล' : u.role === 'staff' ? 'เจ้าหน้าที่' : 'ผู้ใช้';
                            const roleColor = u.role === 'admin' ? 'text-violet-700 bg-violet-100' : u.role === 'staff' ? 'text-indigo-700 bg-indigo-100' : 'text-slate-600 bg-slate-100';
                            return (
                              <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isMe ? 'bg-emerald-100/80' : 'bg-white'}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                <span className="text-xs font-semibold text-slate-700 truncate flex-1">
                                  {u.user_name || '-'}
                                  {isMe && <span className="ml-1 text-emerald-600 font-normal">(คุณ)</span>}
                                </span>
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${roleColor}`}>{roleLabel}</span>
                              </div>
                            );
                          })
                        }
                      </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                      {notifs.length === 0
                        ? (
                          <div className="py-8 text-center">
                            <Bell size={28} className="text-slate-300 mx-auto mb-2" />
                            <p className="text-slate-400 text-sm">ไม่มีการแจ้งเตือน</p>
                          </div>
                        )
                        : notifs.map(n => {
                          const meta = NOTIF_LABELS[n.action] || { label: n.action, color: 'text-slate-600', dot: 'bg-slate-400' };
                          const isNew = !lastRead || new Date(n.created_at) > new Date(lastRead);
                          return (
                            <div key={n.id} className={`px-4 py-3 ${isNew ? 'bg-blue-50/50' : ''}`}>
                              <div className="flex items-start gap-2.5">
                                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${meta.dot}`} />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-bold ${meta.color}`}>{meta.label}</p>
                                  <p className="text-sm text-slate-700 leading-snug mt-0.5 break-words">{notifMessage(n)}</p>
                                  <p className="text-xs text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                                </div>
                                {isNew && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
                              </div>
                            </div>
                          );
                        })
                      }
                    </div>

                    {notifs.length > 0 && (
                      <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-center">
                        <button
                          onClick={() => { setShowBell(false); onNavigate('audit'); }}
                          className="text-xs text-[#1E90FF] hover:underline font-semibold"
                        >
                          ดูประวัติทั้งหมด →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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
          สวัสดี, {displayName} 👋
        </h2>
        <p className="text-slate-500 mt-1 text-sm">
          {isStaff
            ? 'คุณมีสิทธิ์เข้าถึงระบบทั้งหมด — เลือกระบบที่ต้องการใช้งาน'
            : `หน่วยงาน: ${auth.department} — เลือกระบบที่ต้องการ`
          }
        </p>
      </div>

      {/* Quick stats strip */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-4">
        <StatsStrip
          alerts={alerts}
          isStaff={isStaff}
          onOpenExpiry={() => setAlertModal('expiry')}
          onOpenLowStock={() => setAlertModal('lowStock')}
          onOpenRequisition={() => onNavigate(isStaff ? 'requisition' : 'requisition-history')}
          onOpenStock={() => setAlertModal('stock')}
          onStatsReady={({ pending }) => setPendingCount(pending || 0)}
        />
      </div>

      {/* System cards — Workflow-Based Groups */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-12 space-y-6">
        {GROUPS.map(group => {
          const groupSystems = visible.filter(s => group.keys.includes(s.key));
          if (groupSystems.length === 0) return null;
          return (
            <div key={group.id}>
              {/* Group header */}
              <div className="flex items-center gap-2.5 mb-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${group.dot}`} />
                <span className={`text-xs font-black uppercase tracking-widest ${group.textColor}`}>{group.label}</span>
                <span className="text-xs text-slate-400">{group.sublabel}</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              {/* Cards grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {groupSystems.map(sys => {
                  const Icon = sys.icon;
                  const lastUpdateIso =
                    sys.key === 'inventory' ? uploadMeta.inventory?.updated_at
                    : sys.key === 'receive'  ? lastReceive
                    : sys.key === 'dispense' ? lastDispense
                    : sys.key === 'analytics' ? lastDispense
                    : null;
                  return (
                    <button
                      key={sys.key}
                      onClick={() => onNavigate(sys.key)}
                      className={`group ${sys.bg} ${sys.border} border-2 rounded-xl p-4 text-left shadow-sm hover:shadow-lg transition-all duration-200 relative`}
                    >
                      {/* Pending badge — requisition เท่านั้น */}
                      {sys.key === 'requisition' && pendingCount > 0 && (
                        <span className="absolute top-2.5 right-2.5 bg-red-500 text-white text-[10px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none shadow">
                          {pendingCount > 99 ? '99+' : pendingCount}
                        </span>
                      )}

                      <div className="flex items-center gap-2.5 mb-3">
                        <div className={`p-2 ${sys.iconBg} rounded-lg shrink-0 shadow-sm`}>
                          <Icon size={18} />
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sys.badge} shrink-0`}>
                          {sys.badgeText}
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-800 text-sm leading-tight">{sys.title}</h3>
                      <p className="text-slate-400 text-xs mt-1 leading-relaxed line-clamp-2">{sys.desc}</p>

                      {fmtDate(lastUpdateIso) && (
                        <p className={`flex items-center gap-1 text-[10px] mt-2 font-medium ${sys.clockColor}`}>
                          <Clock size={10} /> {fmtDate(lastUpdateIso)}
                        </p>
                      )}

                      <div className={`flex items-center gap-0.5 mt-3 text-xs font-semibold text-slate-400 ${sys.hoverLink} transition-colors`}>
                        เข้าสู่ระบบ <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>


      {/* Alert modals */}
      {alertModal === 'expiry' && (
        <ExpiryAlertSection expiring={alerts.expiring} onClose={() => setAlertModal(null)} auth={auth} />
      )}
      {alertModal === 'lowStock' && (
        <LowStockAlertSection lowStock={alerts.lowStock} onClose={() => setAlertModal(null)} />
      )}
      {alertModal === 'stock' && (
        <StockSummaryModal onClose={() => setAlertModal(null)} auth={auth} />
      )}
    </div>
  );
}

// ---- Expiry Alert Section ----
const EXPIRY_EXCEL_COLS = [
  { header: 'ชื่อยา',      key: 'name' },
  { header: 'รหัสยา',      key: 'code' },
  { header: 'ชนิด',        key: 'type' },
  { header: 'ตำแหน่ง',    key: 'location' },
  { header: 'Lot',          key: 'lot' },
  { header: 'วันหมดอายุ', key: 'exp' },
  { header: 'สถานะ',       value: r => r.daysLeft < 0 ? `หมดอายุแล้ว ${Math.abs(r.daysLeft)} วัน` : r.daysLeft === 0 ? 'หมดอายุวันนี้' : `อีก ${r.daysLeft} วัน` },
  { header: 'คงเหลือ',     key: 'qty' },
  { header: 'หน่วย',       key: 'unit' },
];

function ExpiryAlertSection({ expiring = [], onClose, auth }) {
  const [filter, setFilter]     = React.useState('all'); // all | expired | soon30 | soon90 | soon180 | soon16m
  const [expanded, setExpanded] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  if (expiring.length === 0) return null;

  const filtered = expiring.filter(r => {
    if (filter === 'expired') return r.daysLeft < 0;
    if (filter === 'soon30')  return r.daysLeft >= 0 && r.daysLeft < 30;
    if (filter === 'soon90')  return r.daysLeft >= 30 && r.daysLeft < 90;
    if (filter === 'soon180') return r.daysLeft >= 90 && r.daysLeft < 180;
    if (filter === 'soon16m') return r.daysLeft >= 180;
    return true;
  });

  const expiredCount = expiring.filter(r => r.daysLeft < 0).length;
  const soon30Count  = expiring.filter(r => r.daysLeft >= 0 && r.daysLeft < 30).length;
  const soon90Count  = expiring.filter(r => r.daysLeft >= 30 && r.daysLeft < 90).length;
  const soon180Count = expiring.filter(r => r.daysLeft >= 90 && r.daysLeft < 180).length;
  const soon16mCount = expiring.filter(r => r.daysLeft >= 180).length;

  const fmtExp = (raw) => {
    if (!raw || raw === '-') return '-';
    return raw;
  };

  const rowColor = (daysLeft) => {
    if (daysLeft < 0)   return 'bg-red-50 border-red-100';
    if (daysLeft < 30)  return 'bg-orange-50 border-orange-100';
    if (daysLeft < 90)  return 'bg-yellow-50 border-yellow-100';
    if (daysLeft < 180) return 'bg-lime-50 border-lime-100';
    return 'bg-blue-50 border-blue-100';
  };

  const badgeColor = (daysLeft) => {
    if (daysLeft < 0)   return 'bg-red-100 text-red-700 border-red-200';
    if (daysLeft < 30)  return 'bg-orange-100 text-orange-700 border-orange-200';
    if (daysLeft < 90)  return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    if (daysLeft < 180) return 'bg-lime-100 text-lime-700 border-lime-200';
    return 'bg-blue-100 text-blue-700 border-blue-200';
  };

  const daysLabel = (daysLeft) => {
    if (daysLeft < 0)  return `หมดอายุแล้ว ${Math.abs(daysLeft)} วัน`;
    if (daysLeft === 0) return 'หมดอายุวันนี้';
    return `อีก ${daysLeft} วัน`;
  };

  const displayed = expanded ? filtered : filtered.slice(0, 8);

  const handleExport = async () => {
    setExporting(true);
    try {
      const tabLabel = filter === 'all' ? 'ทั้งหมด' : filter === 'expired' ? 'หมดอายุแล้ว' : filter === 'soon30' ? '30วัน' : filter === 'soon90' ? '1-3เดือน' : filter === 'soon180' ? '3-6เดือน' : '6-16เดือน';
      await exportToExcel(filtered, EXPIRY_EXCEL_COLS, 'ยาใกล้หมดอายุ', `expiry_alert_${tabLabel}_${new Date().toISOString().slice(0,10)}.xlsx`, auth);
    } finally { setExporting(false); }
  };

  const inner = (
    <div className={`bg-white border border-red-200 rounded-2xl shadow-sm overflow-hidden flex flex-col ${onClose ? 'max-h-[90vh]' : 'mt-5'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-red-50 border-b border-red-200 shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-500" />
          <span className="font-bold text-red-800 text-sm">แจ้งเตือนยาใกล้หมดอายุ</span>
          <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {expiring.length} รายการ
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleExport} disabled={exporting || filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors">
            {exporting ? <RefreshCcw size={12} className="animate-spin"/> : <FileDown size={12}/>}
            {exporting ? 'กำลังส่งออก...' : 'Excel'}
          </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 px-5 pt-3 pb-1 overflow-x-auto">
        {[
          { key: 'all',     label: 'ทั้งหมด',          count: expiring.length,  active: 'bg-slate-700 text-white' },
          { key: 'expired', label: 'หมดอายุแล้ว',       count: expiredCount,     active: 'bg-red-600 text-white' },
          { key: 'soon30',  label: 'ภายใน 30 วัน',      count: soon30Count,      active: 'bg-orange-500 text-white' },
          { key: 'soon90',  label: '1–3 เดือน',          count: soon90Count,      active: 'bg-yellow-500 text-white' },
          { key: 'soon180', label: '3–6 เดือน',          count: soon180Count,     active: 'bg-lime-500 text-white' },
          { key: 'soon16m', label: '6–16 เดือน',         count: soon16mCount,     active: 'bg-blue-500 text-white' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => { setFilter(tab.key); setExpanded(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
              filter === tab.key
                ? tab.active + ' border-transparent shadow-sm'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            {tab.label}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              filter === tab.key ? 'bg-white/30 text-inherit' : 'bg-slate-100 text-slate-600'
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-6">ไม่มีรายการในหมวดนี้</p>
      ) : (
        <div className="overflow-auto" style={{ maxHeight: onClose ? 'calc(90vh - 200px)' : 'calc(100vh - 420px)' }}>
          <table className="w-full text-xs min-w-[600px]">
            <thead className="sticky top-0 z-20">
              <tr className="text-slate-500 font-semibold border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-2 text-left bg-slate-50">ชื่อยา</th>
                <th className="px-4 py-2 text-left bg-slate-50">ชนิด</th>
                <th className="px-4 py-2 text-left bg-slate-50">ตำแหน่ง</th>
                <th className="px-4 py-2 text-left bg-slate-50">Lot</th>
                <th className="px-4 py-2 text-center bg-slate-50">วันหมดอายุ</th>
                <th className="px-4 py-2 text-center bg-slate-50">สถานะ</th>
                <th className="px-4 py-2 text-right bg-slate-50">คงเหลือ</th>
                <th className="px-4 py-2 text-left bg-slate-50">หน่วย</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((r, i) => (
                <tr key={i} className={`border-b ${rowColor(r.daysLeft)}`}>
                  <td className="px-4 py-2.5 font-semibold text-slate-800 max-w-[200px]">
                    <span className="block truncate">{r.name || '-'}</span>
                    {r.code && r.code !== '-' && (
                      <span className="text-slate-400 font-normal">{r.code}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{r.type || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-600 font-medium">{r.location || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.lot || '-'}</td>
                  <td className="px-4 py-2.5 text-center font-medium text-slate-700">{fmtExp(r.exp)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgeColor(r.daysLeft)}`}>
                      {daysLabel(r.daysLeft)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-700">{r.qty || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.unit || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Show more / less */}
      {filtered.length > 8 && (
        <div className="px-5 py-3 border-t border-slate-100 flex justify-center shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
          >
            {expanded
              ? <><ChevronUp size={14}/> ย่อรายการ</>
              : <><ChevronDown size={14}/> ดูทั้งหมด {filtered.length} รายการ</>
            }
          </button>
        </div>
      )}
    </div>
  );

  if (onClose) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="w-full max-w-5xl">{inner}</div>
      </div>
    );
  }
  return inner;
}

// ---- Low Stock Alert Section ----
function LowStockAlertSection({ lowStock = [], onClose }) {
  const [expanded, setExpanded] = React.useState(false);
  if (lowStock.length === 0) return null;
  const displayed = expanded ? lowStock : lowStock.slice(0, 8);

  const inner = (
    <div className={`bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden flex flex-col ${onClose ? 'max-h-[90vh]' : 'mt-4'}`}>
      <div className="flex items-center justify-between px-5 py-3.5 bg-amber-50 border-b border-amber-200 shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-500" />
          <span className="font-bold text-amber-800 text-sm">แจ้งเตือน Stock ต่ำกว่ากำหนด</span>
          <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {lowStock.length} รายการ
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-amber-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="overflow-auto" style={{ maxHeight: onClose ? 'calc(90vh - 160px)' : 'calc(100vh - 420px)' }}>
        <table className="w-full text-xs min-w-[520px]">
          <thead className="sticky top-0 z-20">
            <tr className="text-slate-500 font-semibold border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-2 text-left bg-slate-50">ชื่อยา</th>
              <th className="px-4 py-2 text-left bg-slate-50">ชนิด</th>
              <th className="px-4 py-2 text-left bg-slate-50">ตำแหน่ง</th>
              <th className="px-4 py-2 text-right bg-slate-50">คงเหลือ</th>
              <th className="px-4 py-2 text-left bg-slate-50">หน่วย</th>
              <th className="px-4 py-2 text-right bg-slate-50">Safety Stock</th>
              <th className="px-4 py-2 text-left bg-slate-50">ระดับ</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((r, i) => {
              const pct      = Math.min(100, r.ratio * 100);
              const isEmpty  = r.qty === 0;
              const barColor = isEmpty ? 'bg-red-500' : pct < 30 ? 'bg-orange-400' : 'bg-amber-400';
              return (
                <tr key={i} className={`border-b border-slate-100 transition-colors ${isEmpty ? 'bg-red-50' : 'hover:bg-amber-50'}`}>
                  <td className="px-4 py-2.5 font-semibold text-slate-800 max-w-[200px]">
                    <span className="block truncate">{r.name}</span>
                    {r.code && r.code !== '-' && <span className="text-slate-400 font-normal">{r.code}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{r.type || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-600 font-medium">{r.location || '-'}</td>
                  <td className={`px-4 py-2.5 text-right font-bold ${isEmpty ? 'text-red-600' : 'text-amber-700'}`}>
                    {r.qty.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{r.unit || '-'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{r.safety_stock.toLocaleString()}</td>
                  <td className="px-4 py-2.5 min-w-[100px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div className={`${barColor} h-2 rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 shrink-0 w-8 text-right">
                        {isEmpty ? 'หมด' : `${Math.round(pct)}%`}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {lowStock.length > 8 && (
        <div className="px-5 py-3 border-t border-slate-100 flex justify-center shrink-0">
          <button onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">
            {expanded
              ? <><ChevronUp size={14}/> ย่อรายการ</>
              : <><ChevronDown size={14}/> ดูทั้งหมด {lowStock.length} รายการ</>
            }
          </button>
        </div>
      )}
    </div>
  );

  if (onClose) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="w-full max-w-4xl">{inner}</div>
      </div>
    );
  }
  return inner;
}

const STOCK_EXCEL_COLS = [
  { header: 'รหัสยา',      key: 'code' },
  { header: 'ชื่อยา',      key: 'name' },
  { header: 'ประเภท',      key: 'type' },
  { header: 'คงเหลือ',     key: 'totalQty' },
  { header: 'หน่วยหลัก',   key: 'mainUnit' },
  { header: 'หลายหน่วย',   value: r => r.hasMultipleUnits ? r.units.join(', ') : '' },
  { header: 'จำนวน Lot',   key: 'lotCount' },
];

// ---- Stock Summary Modal ----
function StockSummaryModal({ onClose, auth = {} }) {
  const [rows, setRows]             = React.useState([]);
  const [loading, setLoading]       = React.useState(true);
  const [search, setSearch]         = React.useState('');
  const [drugNames, setDrugNames]   = React.useState([]);
  const [error, setError]           = React.useState('');
  const [exporting, setExporting]   = React.useState(false);
  const [uploadInfo, setUploadInfo] = React.useState(null);
  const [isMobile, setIsMobile]     = React.useState(() => window.innerWidth < 768);
  const [sortBy, setSortBy]         = React.useState(null); // null | { key: 'name'|'lot'|'qty', dir: 'asc'|'desc' }

  const cycleSort = (key) => setSortBy(prev => {
    if (!prev || prev.key !== key) return { key, dir: 'asc' };
    if (prev.dir === 'asc') return { key, dir: 'desc' };
    return null;
  });

  React.useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [summary, meta] = await Promise.all([
        fetchStockSummary(),
        supabase ? supabase.from('upload_meta').select('file_name, updated_at').eq('type', 'inventory').single().then(r => r.data) : null,
      ]);
      setRows(summary);
      setUploadInfo(meta || null);
    }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // โหลด drugNames สำหรับ autocomplete จาก inventory
  React.useEffect(() => {
    if (!supabase) return;
    supabase.from('inventory').select('name, type').then(({ data }) => {
      if (!data) return;
      const typeMap = {};
      data.forEach(d => { if (d.name && d.type && d.type !== '-') typeMap[d.name] = d.type; });
      const names = [...new Set(data.map(d => d.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
      setDrugNames(names.map(name => ({ name, type: typeMap[name] || '' })));
    });
  }, []);

  // Realtime subscribe
  React.useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel('stock-modal-inv')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  const filtered = rows.filter(r =>
    !search || (r.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.code || '').toLowerCase().includes(search.toLowerCase())
  );

  const sortedFiltered = React.useMemo(() => {
    if (!sortBy) return filtered;
    return [...filtered].sort((a, b) => {
      if (sortBy.key === 'name') {
        const cmp = (a.name || '').localeCompare(b.name || '', 'th');
        return sortBy.dir === 'asc' ? cmp : -cmp;
      }
      if (sortBy.key === 'lot') {
        const cmp = (a.lotCount || 0) - (b.lotCount || 0);
        return sortBy.dir === 'asc' ? cmp : -cmp;
      }
      if (sortBy.key === 'qty') {
        const cmp = (a.totalQty || 0) - (b.totalQty || 0);
        return sortBy.dir === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }, [filtered, sortBy]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportToExcel(filtered, STOCK_EXCEL_COLS, 'คงเหลือในคลัง', `stock_summary_${new Date().toISOString().slice(0,10)}.xlsx`, auth);
    } finally { setExporting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-start justify-center sm:p-4 sm:pt-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-5xl flex flex-col" style={{ maxHeight: '95vh' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 bg-sky-50 rounded-t-2xl shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Package size={18} className="text-sky-600" />
              <span className="font-bold text-slate-800">จำนวนคงเหลือในคลัง</span>
              {!loading && <span className="bg-sky-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{rows.length} รายการ</span>}
              {search && <span className="text-xs text-slate-500">· แสดง {filtered.length}</span>}
            </div>
            {uploadInfo && (
              <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                <Clock size={10}/> อัพโหลด: {new Date(uploadInfo.updated_at).toLocaleString('th-TH', { day:'numeric', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                {uploadInfo.file_name && <span className="text-slate-300 hidden sm:inline">· {uploadInfo.file_name}</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={handleExport} disabled={exporting || filtered.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors">
              {exporting ? <RefreshCcw size={12} className="animate-spin"/> : <Database size={12}/>}
              {exporting ? 'กำลังส่งออก...' : 'Excel'}
            </button>
            <button onClick={load} className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-100 rounded-lg transition-colors" title="รีเฟรช">
              <RefreshCcw size={15}/>
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
              <X size={18}/>
            </button>
          </div>
        </div>

        {/* DrugSearchBar */}
        <div className="px-5 py-3 border-b border-slate-100 shrink-0">
          <DrugSearchBar
            value={search}
            onChange={setSearch}
            options={drugNames}
            placeholder="ค้นหาชื่อยา หรือรหัสยา..."
            ringClass="focus:ring-sky-400"
            hoverClass="hover:bg-sky-50"
          />
        </div>

        {/* Table — sticky header + frozen ชื่อยา */}
        <div className="overflow-auto flex-1 rounded-b-2xl">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mr-3"/>
              กำลังคำนวณคงเหลือ...
            </div>
          ) : error ? (
            <div className="text-center py-10 text-red-500 text-sm px-6">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">ไม่พบรายการ</div>
          ) : isMobile ? (
            /* ── Mobile card list ── */
            <div className="divide-y divide-slate-100">
              {sortedFiltered.map((r, i) => (
                <div key={r.code || r.name || i} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm leading-snug truncate">{r.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {r.code && r.code !== '-' && <span className="text-[10px] text-slate-400 font-mono">{r.code}</span>}
                      <DrugTypeBadge type={r.type} />
                      {r.hasMultipleUnits && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">~หลายหน่วย</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-sky-700 leading-tight">{r.totalQty.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400">{r.mainUnit} · {r.lotCount} Lot</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ── Desktop table ── */
            <table className="w-full text-sm min-w-[560px]">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 bg-slate-50 sticky left-0 z-30 shadow-[2px_0_4px_rgba(0,0,0,0.06)] whitespace-nowrap">
                    <button onClick={() => cycleSort('name')} className="flex items-center gap-1 hover:text-sky-600 transition-colors">
                      ชื่อยา
                      <span className="flex flex-col leading-none">
                        <ChevronUp  size={9} className={sortBy?.key==='name' && sortBy.dir==='asc'  ? 'text-sky-600' : 'text-slate-300'}/>
                        <ChevronDown size={9} className={sortBy?.key==='name' && sortBy.dir==='desc' ? 'text-sky-600' : 'text-slate-300'}/>
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 bg-slate-50 whitespace-nowrap">ประเภท</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 bg-slate-50 whitespace-nowrap">
                    <button onClick={() => cycleSort('qty')} className="flex items-center gap-1 ml-auto hover:text-sky-600 transition-colors">
                      คงเหลือ
                      <span className="flex flex-col leading-none">
                        <ChevronUp  size={9} className={sortBy?.key==='qty' && sortBy.dir==='asc'  ? 'text-sky-600' : 'text-slate-300'}/>
                        <ChevronDown size={9} className={sortBy?.key==='qty' && sortBy.dir==='desc' ? 'text-sky-600' : 'text-slate-300'}/>
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 bg-slate-50 whitespace-nowrap">หน่วย</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500 bg-slate-50 whitespace-nowrap">
                    <button onClick={() => cycleSort('lot')} className="flex items-center gap-1 mx-auto hover:text-sky-600 transition-colors">
                      LOT
                      <span className="flex flex-col leading-none">
                        <ChevronUp  size={9} className={sortBy?.key==='lot' && sortBy.dir==='asc'  ? 'text-sky-600' : 'text-slate-300'}/>
                        <ChevronDown size={9} className={sortBy?.key==='lot' && sortBy.dir==='desc' ? 'text-sky-600' : 'text-slate-300'}/>
                      </span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedFiltered.map((r, i) => (
                  <tr key={r.code || r.name || i} className={`border-b border-slate-100 hover:bg-sky-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                    <td className="px-4 py-2.5 sticky left-0 z-10 bg-inherit shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                      <p className="font-medium text-slate-800 leading-snug">{r.name}</p>
                      {r.code && r.code !== '-' && <p className="text-[10px] text-slate-400">{r.code}</p>}
                    </td>
                    <td className="px-4 py-2.5"><DrugTypeBadge type={r.type}/></td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.hasMultipleUnits && (
                          <span title={`มีหลายหน่วย: ${r.units.join(', ')} — ปัดเศษขึ้นแล้ว`}
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 cursor-help whitespace-nowrap">
                            ~หลายหน่วย
                          </span>
                        )}
                        <span className="font-bold text-sky-700">{r.totalQty.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs whitespace-nowrap">{r.mainUnit}</td>
                    <td className="px-4 py-2.5 text-center text-slate-400 text-xs">{r.lotCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-slate-100 text-[11px] text-slate-400 bg-slate-50 rounded-b-2xl shrink-0">
          คงเหลือรวม Lot · หน่วยหลักจากวันที่รับยาล่าสุด · ยาตัดออกจากบัญชีไม่แสดง
        </div>
      </div>
    </div>
  );
}

// ---- Quick stats (staff view only) ----
function StatsStrip({ alerts = { expiring: [], lowStock: [] }, isStaff = false, onOpenExpiry, onOpenLowStock, onOpenRequisition, onOpenStock, onStatsReady }) {
  const [stats, setStats] = React.useState({ inventory: '-', pending: '-' });

  const loadStats = React.useCallback(async () => {
    if (!supabase) return;
    const [inv, pend] = await Promise.all([
      supabase.from('inventory').select('code'),
      supabase.from('requisitions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    const uniqueDrugs = new Set((inv.data || []).map(r => r.code).filter(Boolean)).size;
    const pending = pend.count ?? 0;
    setStats({ inventory: uniqueDrugs || '-', pending: pending || '-' });
    if (onStatsReady) onStatsReady({ inventory: uniqueDrugs || 0, pending });
  }, [onStatsReady]);

  React.useEffect(() => {
    loadStats();
    if (!supabase) return;
    // อัพเดต pending count แบบ realtime เมื่อมีใบเบิกใหม่หรือสถานะเปลี่ยน
    const ch = supabase
      .channel('statsstrip-requisitions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisitions' }, loadStats)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadStats]);

  const expiryCount   = alerts.expiring.length;
  const expiredCount  = alerts.expiring.filter(r => r.daysLeft < 0).length;
  const lowStockCount = alerts.lowStock.length;

  const baseItems = [
    {
      label: 'รายการยาในคลัง',
      subLabel: 'ดูจำนวนคงเหลือ',
      value: stats.inventory,
      color: 'text-sky-700', cardBg: 'bg-sky-50', borderColor: 'border-sky-200', labelColor: 'text-sky-500',
      onClick: onOpenStock,
    },
    {
      label: 'ใบเบิกรอดำเนินการ',
      value: stats.pending,
      color:       stats.pending > 0 ? 'text-amber-700'   : 'text-slate-700',
      cardBg:      stats.pending > 0 ? 'bg-amber-50'      : 'bg-slate-50',
      borderColor: stats.pending > 0 ? 'border-amber-200' : 'border-slate-200',
      labelColor:  stats.pending > 0 ? 'text-amber-600'   : 'text-slate-500',
      onClick: stats.pending > 0 ? onOpenRequisition : undefined,
    },
    {
      label: expiredCount > 0 ? `ยาหมดอายุแล้ว ${expiredCount} + ใกล้หมด` : 'ยาใกล้หมดอายุ (16 เดือน)',
      value: expiryCount,
      color:       expiryCount > 0 ? (expiredCount > 0 ? 'text-red-700' : 'text-orange-700')   : 'text-slate-700',
      cardBg:      expiryCount > 0 ? (expiredCount > 0 ? 'bg-red-50'    : 'bg-orange-50')      : 'bg-slate-50',
      borderColor: expiryCount > 0 ? (expiredCount > 0 ? 'border-red-200' : 'border-orange-200') : 'border-slate-200',
      labelColor:  expiryCount > 0 ? (expiredCount > 0 ? 'text-red-500' : 'text-orange-500')   : 'text-slate-500',
      onClick: expiryCount > 0 ? onOpenExpiry : undefined,
    },
  ];

  const staffItems = [
    {
      label: 'Stock ต่ำกว่ากำหนด',
      value: lowStockCount,
      color:       lowStockCount > 0 ? 'text-amber-700'   : 'text-slate-700',
      cardBg:      lowStockCount > 0 ? 'bg-amber-50'      : 'bg-slate-50',
      borderColor: lowStockCount > 0 ? 'border-amber-200' : 'border-slate-200',
      labelColor:  lowStockCount > 0 ? 'text-amber-600'   : 'text-slate-500',
      onClick: lowStockCount > 0 ? onOpenLowStock : undefined,
    },
  ];

  const items = isStaff ? [...baseItems, ...staffItems] : baseItems;
  const colsMap = { 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' };
  const cols = colsMap[items.length] || 'sm:grid-cols-2';

  return (
    <div className={`mt-6 grid grid-cols-2 ${cols} gap-3`}>
      {items.map(item => {
        const cls = `${item.cardBg} border ${item.borderColor} rounded-xl p-4 text-center shadow-sm ${item.onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`;
        const content = (
          <>
            <p className={`text-2xl font-bold ${item.color}`}>{typeof item.value === 'number' ? item.value.toLocaleString() : item.value}</p>
            <p className={`text-xs mt-1 leading-tight ${item.labelColor}`}>{item.label}</p>
            {item.subLabel && <p className="text-xs mt-1.5 font-bold text-sky-600 underline underline-offset-2">{item.subLabel}</p>}
            {item.onClick && !item.subLabel && <p className="text-[10px] mt-1.5 text-slate-400">กดเพื่อดูรายละเอียด</p>}
          </>
        );
        return item.onClick
          ? <button key={item.label} onClick={item.onClick} className={cls}>{content}</button>
          : <div key={item.label} className={cls}>{content}</div>;
      })}
    </div>
  );
}
