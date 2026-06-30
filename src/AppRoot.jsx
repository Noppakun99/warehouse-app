import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area,
} from 'recharts';
import SearchableSelect from './SearchableSelect';
import {
  Pill, Package, TrendingUp, TrendingDown,
  User, Shield, ShieldCheck,
  ChevronRight, Activity, Database, Clock,
  AlertTriangle, ChevronDown, ChevronUp, ClipboardList,
  Eye, EyeOff, X, Bell, Search, RefreshCcw, FileDown,
  Boxes, ShoppingCart, ArrowRight,
} from 'lucide-react';
import App                from './App';
import DrugSearchBar, { DrugTypeBadge } from './DrugSearchBar';
import { exportToExcel }  from './lib/exportExcel';
import RequisitionApp     from './RequisitionApp';
import DispenseLogApp     from './DispenseLogApp';
import ReceiveLogApp      from './ReceiveLogApp';
import { supabase }       from './lib/supabase';
import { fetchDashboardAlerts, fetchDashboardCharts, fetchNotifications, loginUser, registerUser, checkFirstRun, createAppUser, fetchStockSummary } from './lib/db';
import ReturnApp          from './ReturnApp';
import AuditLogApp        from './AuditLogApp';
import UserManagementApp  from './UserManagementApp';
import AnalyticsApp       from './AnalyticsApp';
import ReorderApp         from './ReorderApp';
import StockLedgerApp     from './StockLedgerApp';
import StockCountApp      from './StockCountApp';
import DashboardV2Preview from './DashboardV2Preview'; // prototype ชั่วคราว — เปิดด้วย ?v2 (ลบได้ทั้งบรรทัด)
import AppShell           from './AppShell';
import { printInspectWorksheet } from './lib/inspectWorksheet';


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
  // ── PROTOTYPE: เปิดหน้า Dashboard V2 (sidebar) ด้วย ?v2 — ดูดีไซน์เท่านั้น ไม่กระทบ flow จริง ──
  const [showV2, setShowV2] = useState(() => new URLSearchParams(window.location.search).has('v2'));

  const [auth, setAuth]   = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(AUTH_KEY)) || null; } catch { return null; }
  });
  // navigation stack (browser-like back) — หน้าปัจจุบัน = ตัวท้าย, ปุ่มย้อน = pop
  const [navStack, setNavStack] = useState(['dashboard']);
  const page = navStack[navStack.length - 1];
  const canGoBack = navStack.length > 1;
  // navigateTo: ไปหน้าใหม่ (push) — ถ้าหน้าเดิมซ้ำหน้าปัจจุบันไม่ push (กัน stack บวม)
  const setPage = useCallback((p) => {
    setNavStack(prev => (prev[prev.length - 1] === p ? prev : [...prev, p]));
  }, []);
  const goBack = useCallback(() => {
    setNavStack(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);
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
  const logout = () => { sessionStorage.removeItem(AUTH_KEY); setAuth(null); setNavStack(['dashboard']); setToasts([]); };
  const refreshPage = () => setSubKey(k => k + 1);

  // action item ใน sidebar (เมนู "แบบฟอร์มต่างๆ") — ทำ action ไม่เปิดหน้า/ไม่เข้า navStack
  const runFormAction = (action) => {
    if (action === 'inspectWorksheet') printInspectWorksheet();
  };

  // early-return หลัง hooks ทั้งหมด (Rules of Hooks) — prototype ?v2
  if (showV2) return <DashboardV2Preview onExit={() => setShowV2(false)} />;

  let content;
  if (!auth) {
    content = <LoginPage onLogin={handleLogin} />;
  } else {
    switch (page) {
      case 'inventory':
        content = <App key={subKey} onBackToDashboard={() => setPage('dashboard')} onRefresh={refreshPage} onNavigate={setPage} role={auth.role} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
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
            onGoBack={goBack}
            canGoBack={canGoBack}
          />
        );
        break;
      case 'dispense':
        content = <DispenseLogApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      case 'receive':
        content = <ReceiveLogApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      case 'receive-ap':
        content = <ReceiveLogApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} initialTab="ap" onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      case 'return':
        content = <ReturnApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      case 'audit':
        content = <AuditLogApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      case 'users':
        content = <UserManagementApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      case 'analytics':
        content = <AnalyticsApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      case 'reorder':
        content = <ReorderApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      case 'ledger':
        content = <StockLedgerApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      case 'stockcount':
        content = <StockCountApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      default:
        content = <Dashboard key={subKey} auth={auth} onNavigate={setPage} />;
    }
  }

  const pageKey = auth ? page : '__login__';

  // ครอบทุกหน้าด้วย sidebar shell เมื่อ login แล้ว (รวม Dashboard) — navigation สม่ำเสมอทั้งแอป
  if (auth) {
    const displayName = (auth.name && auth.name.trim() && auth.name.trim() !== '-') ? auth.name : auth.username;
    content = (
      <AppShell page={page} onNavigate={setPage} onFormAction={runFormAction} onRefresh={refreshPage} displayName={displayName} role={auth.role} onLogout={logout}>
        {content}
      </AppShell>
    );
  }

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

// ---- Notification helpers ----
const NOTIF_LABELS = {
  // ── Requisition lifecycle ──
  submit_requisition:           { label: 'ส่งใบเบิกใหม่',        color: 'text-[#1E90FF]',  dot: 'bg-[#1E90FF]' },
  requester_edit_requisition:   { label: 'แก้ไขใบเบิก',          color: 'text-amber-600',  dot: 'bg-amber-400' },
  requester_delete_requisition: { label: 'ลบใบเบิก',             color: 'text-red-600',    dot: 'bg-red-400'   },
  delete_requisition:           { label: 'ลบใบเบิก',             color: 'text-red-600',    dot: 'bg-red-400'   },
  update_requisition:           { label: 'แก้ไขใบเบิก',          color: 'text-amber-600',  dot: 'bg-amber-400' },
  picking_requisition:          { label: 'จัดยา',                color: 'text-blue-600',   dot: 'bg-blue-400'  },
  verify_requisition:           { label: 'ตรวจสอบใบเบิก',       color: 'text-indigo-600', dot: 'bg-indigo-400'},
  dispense_requisition:         { label: 'จ่ายยา',                color: 'text-emerald-600',dot: 'bg-emerald-400'},
  received_requisition:         { label: 'หน่วยงานรับยา',        color: 'text-teal-600',   dot: 'bg-teal-400'  },
  // ── Receive / Dispense / Return ──
  insert_return:                { label: 'คืนยา',                color: 'text-blue-600',   dot: 'bg-blue-400'  },
  update_return:                { label: 'แก้ไขรายการคืนยา',     color: 'text-amber-600',  dot: 'bg-amber-400' },
  delete_return:                { label: 'ลบรายการคืนยา',        color: 'text-red-600',    dot: 'bg-red-400'   },
  delete_dispense:              { label: 'ลบรายการจ่ายยา',       color: 'text-red-600',    dot: 'bg-red-400'   },
  update_dispense:              { label: 'แก้ไขรายการจ่ายยา',    color: 'text-amber-600',  dot: 'bg-amber-400' },
  import_dispense:              { label: 'นำเข้าประวัติเบิกจ่าย', color: 'text-rose-600',  dot: 'bg-rose-400'  },
  delete_receive:               { label: 'ลบรายการรับยา',        color: 'text-red-600',    dot: 'bg-red-400'   },
  update_receive:               { label: 'แก้ไขรายการรับยา',     color: 'text-amber-600',  dot: 'bg-amber-400' },
  import_receive:               { label: 'นำเข้าประวัติรับยา',    color: 'text-indigo-600', dot: 'bg-indigo-400'},
  import_inventory:             { label: 'อัปโหลด Log คลัง',     color: 'text-blue-600',   dot: 'bg-blue-400'  },
  scan_invoice:                 { label: 'สแกนบิลรับยา',         color: 'text-cyan-600',   dot: 'bg-cyan-400'  },
  // ── AP Workflow (ส่งบัญชี) ──
  ap_acknowledge:               { label: 'จัดซื้อรับเอกสาร',     color: 'text-sky-600',    dot: 'bg-sky-400'   },
  ap_mark_inspected:            { label: 'ตรวจรับบิล',           color: 'text-emerald-600',dot: 'bg-emerald-400'},
  ap_send_batch:                { label: 'ส่งบัญชี',             color: 'text-orange-600', dot: 'bg-orange-400'},
  ap_mark_posted:               { label: 'ตั้งหนี้แล้ว',          color: 'text-violet-600', dot: 'bg-violet-400'},
  export_excel:                 { label: 'Export Excel',         color: 'text-emerald-600', dot: 'bg-emerald-400' },
  // ── Reorder Analysis ──
  analysis_run:                 { label: 'บันทึก Snapshot สั่งซื้อ', color: 'text-orange-600', dot: 'bg-orange-400' },
  update_reorder_config:        { label: 'แก้ Master ยา',         color: 'text-violet-600',  dot: 'bg-violet-400' },
  import_reorder_config:        { label: 'Import Master ยา',      color: 'text-indigo-600',  dot: 'bg-indigo-400' },
  mark_ordered:                 { label: 'ทำเครื่องหมายสั่งแล้ว',  color: 'text-emerald-600', dot: 'bg-emerald-400' },
  print_po:                     { label: 'พิมพ์ใบสั่งซื้อ',        color: 'text-slate-700',   dot: 'bg-slate-500'  },
  // ── Stock Count (ตรวจนับคงคลัง) ──
  create_stock_count:           { label: 'ตรวจนับคงคลัง',         color: 'text-emerald-600', dot: 'bg-emerald-400' },
  update_stock_count:           { label: 'แก้ไขผลตรวจนับ',        color: 'text-amber-600',   dot: 'bg-amber-400' },
  delete_stock_count:           { label: 'ลบรอบตรวจนับ',          color: 'text-red-600',     dot: 'bg-red-400' },
};

const NOTIFY_ACTIONS = Object.keys(NOTIF_LABELS);

function notifMessage(n) {
  const who = n.user_name && n.user_name !== '-' ? n.user_name : (n.department || 'ผู้ใช้');
  const d = n.details || {};
  const reqRef = d.req_number || (d.requisition_id ? `#${d.requisition_id}` : '');
  switch (n.action) {
    case 'submit_requisition':
      return `${who} ส่งใบเบิก${reqRef ? ` ${reqRef}` : ''} ${n.record_count ? `(${n.record_count} รายการ)` : ''} · ${n.department}`;
    case 'picking_requisition':
      return `${who} จัดยาใบเบิก${reqRef ? ` ${reqRef}` : ''}${d.picker_name ? ` (${d.picker_name})` : ''}`;
    case 'verify_requisition':
      return `${who} ตรวจสอบใบเบิก${reqRef ? ` ${reqRef}` : ''}${d.verifier_name ? ` (${d.verifier_name})` : ''}`;
    case 'dispense_requisition':
      return `${who} จ่ายยาตามใบเบิก${reqRef ? ` ${reqRef}` : ''}`;
    case 'received_requisition':
      return `${n.department} รับยาแล้ว${reqRef ? ` (${reqRef})` : ''}${d.received_by ? ` · ${d.received_by}` : ''}`;
    case 'insert_return':
      return `${who} คืนยา "${d.drug_name || ''}" ${d.qty ? `${d.qty} หน่วย` : ''} · ${n.department}`;
    case 'update_return':
      return `${who} แก้ไขรายการคืนยา${d.drug_name ? ` "${d.drug_name}"` : ''}`;
    case 'delete_return':
      return `${who} ลบรายการคืนยา · ${n.department}`;
    case 'update_dispense':
      return `${who} แก้ไขรายการจ่ายยา${d.drug_name ? ` "${d.drug_name}"` : ''}`;
    case 'delete_dispense':
      return `${who} ลบรายการจ่ายยา${d.drug_name ? ` "${d.drug_name}"` : ''}${d.qty ? ` (${d.qty} หน่วย)` : ''}`;
    case 'import_dispense':
      return `${who} นำเข้าประวัติเบิกจ่าย ${n.record_count ? `${n.record_count.toLocaleString()} รายการ` : ''}`;
    case 'delete_receive':
      return `${who} ลบรายการรับยา${n.record_count ? ` ${n.record_count} แถว` : ''}`;
    case 'update_receive':
      return `${who} แก้ไขรายการรับยา${d.drug_name ? ` "${d.drug_name}"` : ''}`;
    case 'import_receive':
      return `${who} นำเข้าประวัติรับยา ${n.record_count ? `${n.record_count.toLocaleString()} รายการ` : ''}`;
    case 'import_inventory':
      return `${who} อัปโหลด Log คลัง${d.file ? ` "${d.file}"` : ''}${n.record_count ? ` (${n.record_count.toLocaleString()} รายการ)` : ''}`;
    case 'scan_invoice':
      return `${who} สแกนบิลรับยา${d.bill_number ? ` (${d.bill_number})` : ''}${n.record_count ? ` · ${n.record_count} รายการ` : ''}`;
    case 'ap_acknowledge':
      return `${who} จัดซื้อรับเอกสาร${d.bill_count ? ` ${d.bill_count} บิล` : ''}`;
    case 'ap_mark_inspected':
      return `${who} ตรวจรับบิล${d.bill_count ? ` ${d.bill_count} บิล` : ''}${d.inspector_name ? ` (${d.inspector_name})` : ''}`;
    case 'ap_send_batch':
      return `${who} ส่งบัญชี${d.batch_id ? ` ${d.batch_id}` : ''}${d.bill_count ? ` (${d.bill_count} บิล)` : ''}`;
    case 'ap_mark_posted':
      return `${who} ตั้งหนี้แล้ว${d.batch_id ? ` ${d.batch_id}` : ''}${d.accountant_name ? ` (${d.accountant_name})` : ''}`;
    case 'export_excel':
      return `${who} Export Excel · ${n.department}`;
    case 'requester_edit_requisition':
    case 'update_requisition':
      return `${who} แก้ไขใบเบิก${reqRef ? ` ${reqRef}` : ''} · ${n.department}`;
    case 'requester_delete_requisition':
    case 'delete_requisition':
      return `${who} ลบใบเบิก${reqRef ? ` ${reqRef}` : ''} · ${n.department}`;
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

function Dashboard({ auth, onNavigate }) {
  const isStaff = auth.role === 'staff' || auth.role === 'admin';
  const [alerts, setAlerts] = useState({ expiring: [], lowStock: [], pendingReceive: [] });
  const [charts, setCharts] = useState(null);
  const [alertModal, setAlertModal] = useState(null); // null | 'expiry' | 'lowStock' | 'stock'

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
    fetchDashboardAlerts().then(setAlerts);
    // กราฟเบิก/รับ + ยาต้องสั่งซื้อ — แสดงทุก role
    fetchDashboardCharts(6).then(setCharts).catch(() => {});

    if (isStaff) {
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
                  <div className="fixed left-2 right-2 top-16 w-auto sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
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

            {/* ปุ่มออกจากระบบย้ายไป sidebar (AppShell) แล้ว */}
          </div>
        </div>
      </header>

      {/* Welcome */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-4">
        <h2 className="text-2xl font-bold text-slate-800">
          สวัสดี, {displayName}
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
          onOpenExpiry={() => setAlertModal('expiry')}
          onOpenLowStock={() => setAlertModal('lowStock')}
          onOpenRequisition={() => onNavigate(isStaff ? 'requisition' : 'requisition-history')}
          onOpenStock={() => setAlertModal('stock')}
        />

        {/* Charts + ยาต้องสั่งซื้อ — แสดงทุก role */}
        <DashboardCharts
          charts={charts}
          lowStock={alerts.lowStock}
          onOpenReorder={() => onNavigate('reorder')}
          onOpenDispense={() => onNavigate('dispense')}
          onOpenReceive={() => onNavigate('receive')}
        />
      </div>

      {/* Alert modals */}
      {alertModal === 'expiry' && (
        <ExpiryAlertSection expiring={alerts.expiring} onClose={() => setAlertModal(null)} auth={auth} />
      )}
      {alertModal === 'lowStock' && (
        <LowStockAlertSection lowStock={alerts.lowStock} onClose={() => setAlertModal(null)}
          onOpenReorder={() => { setAlertModal(null); onNavigate('reorder'); }} />
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
  const [isMobile, setIsMobile] = React.useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  React.useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

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
          {onClose && (
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-red-100 rounded-lg transition-colors">
              <X size={18} />
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

      {/* Table (desktop) / Card list (mobile) */}
      {filtered.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-6">ไม่มีรายการในหมวดนี้</p>
      ) : isMobile ? (
        <div className="overflow-y-auto p-3 space-y-2" style={{ maxHeight: onClose ? 'calc(90vh - 200px)' : 'calc(100vh - 420px)' }}>
          {displayed.map((r, i) => (
            <div key={i} className={`border rounded-xl p-3 ${rowColor(r.daysLeft)}`}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800 text-sm leading-tight">{r.name || '-'}</p>
                  {r.code && r.code !== '-' && <p className="text-[11px] text-slate-400 mt-0.5">{r.code}</p>}
                </div>
                <span className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor(r.daysLeft)}`}>
                  {daysLabel(r.daysLeft)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mt-2 pt-2 border-t border-slate-200/60">
                <div><span className="text-slate-400">ชนิด:</span> <span className="text-slate-700 font-medium">{r.type || '-'}</span></div>
                <div><span className="text-slate-400">ตำแหน่ง:</span> <span className="text-slate-700 font-medium">{r.location || '-'}</span></div>
                <div><span className="text-slate-400">Lot:</span> <span className="text-slate-700">{r.lot || '-'}</span></div>
                <div><span className="text-slate-400">Exp:</span> <span className="text-slate-700">{fmtExp(r.exp)}</span></div>
                <div className="col-span-2"><span className="text-slate-400">คงเหลือ:</span> <span className="text-slate-800 font-bold">{r.qty || '-'}</span> <span className="text-slate-500">{r.unit || ''}</span></div>
              </div>
            </div>
          ))}
        </div>
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
function LowStockAlertSection({ lowStock = [], onClose, onOpenReorder }) {
  const [expanded, setExpanded] = React.useState(false);
  if (lowStock.length === 0) return null;
  const displayed = expanded ? lowStock : lowStock.slice(0, 8);

  const inner = (
    <div className={`bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden flex flex-col ${onClose ? 'max-h-[90vh]' : 'mt-4'}`}>
      <div className="flex items-center justify-between px-5 py-3.5 bg-amber-50 border-b border-amber-200 shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle size={18} className="text-amber-500" />
          <span className="font-bold text-amber-800 text-sm truncate">แจ้งเตือน Stock ต่ำกว่ากำหนด</span>
          <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
            {lowStock.length} รายการ
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenReorder && (
            <button onClick={onOpenReorder} title="เปิดระบบวิเคราะห์การสั่งซื้อ"
              className="hidden sm:flex items-center gap-1.5 text-xs font-medium bg-orange-600 hover:bg-orange-700 text-white px-2.5 py-1.5 rounded-lg">
              เปิดระบบวิเคราะห์การสั่งซื้อ
              <ChevronRight size={12}/>
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-amber-100 rounded-lg transition-colors">
              <X size={18} />
            </button>
          )}
        </div>
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
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-5xl flex flex-col min-h-[60vh] sm:min-h-0" style={{ maxHeight: '95vh' }} onClick={e => e.stopPropagation()}>

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

// ---- Dashboard charts: เบิก/รับ รายเดือน + ยาต้องสั่งซื้อ (staff view only) ----
function TrendBadge({ pct }) {
  if (pct == null) return null;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${up ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
      <Icon size={12} /> {Math.abs(pct)}%
    </span>
  );
}

// ย่อมูลค่าบาท: 1,250,000 → "1.25M", 12,500 → "12.5K" (แกน Y กราฟ)
const fmtBahtShort = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(n);
};
const fmtBaht = (v) => `฿${(Number(v) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function DashboardCharts({ charts, lowStock = [], onOpenReorder, onOpenDispense, onOpenReceive }) {
  const { dispense = [], receive = [], trend = {}, maxValueMonth = null, maxReceiveValueMonth = null } = charts || {};
  const hasData = dispense.some(d => d.value > 0) || receive.some(r => r.value > 0);
  const top5 = lowStock.slice(0, 5);
  const dispenseTotal = dispense.reduce((s, d) => s + (d.value || 0), 0);
  const receiveTotal = receive.reduce((s, r) => s + (r.value || 0), 0);

  return (
    <div className="mt-4 space-y-4">
      {/* Hero panel — การเบิกจ่ายรายเดือน (เลขรวม + area chart) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-600"><Activity size={15} /></div>
            <span className="text-sm font-bold text-slate-700">การเบิกจ่ายรายเดือน</span>
          </div>
          <span className="text-xs text-slate-400">ย้อนหลัง {dispense.length} เดือน</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-5 items-center">
          {/* เลขเด่นซ้าย */}
          <div className="lg:pr-6 lg:border-r lg:border-slate-100">
            <p className="text-4xl font-black text-slate-800 leading-none">{fmtBaht(dispenseTotal)}</p>
            <p className="text-xs text-slate-400 mt-1.5">มูลค่าเบิกจ่ายรวม (บาท)</p>
            <div className="flex items-center gap-2 mt-3">
              <TrendBadge pct={trend.dispensePct} />
              <span className="text-xs text-slate-400">เทียบเดือนก่อน</span>
            </div>
          </div>

          {/* กราฟ area ขวา */}
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={dispense} margin={{ top: 5, right: 12, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="dispenseFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} tickFormatter={fmtBahtShort} />
              <Tooltip formatter={(v) => [fmtBaht(v), 'มูลค่าเบิก']} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }} />
              <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2.5} fill="url(#dispenseFill)" dot={{ r: 3, fill: '#6366f1' }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* คำสรุป: เดือนมูลค่าสูงสุด + ลิงก์ไปดูรายการยา */}
        {maxValueMonth && maxValueMonth.value > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-500">
              เดือน <span className="font-bold text-indigo-700">{maxValueMonth.label}</span> มูลค่าเบิกสูงสุด <span className="font-bold text-slate-700">{fmtBaht(maxValueMonth.value)}</span>
            </p>
            <button onClick={onOpenDispense} className="text-xs text-[#1E90FF] hover:underline font-semibold inline-flex items-center gap-0.5">
              ดูรายการยาที่มูลค่าสูงสุด <ArrowRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Panel รอง — รับเข้ารายเดือน (มูลค่าบาท, bar) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-100 text-sky-600"><Package size={15} /></div>
            <span className="text-sm font-bold text-slate-700">มูลค่าการรับเข้ารายเดือน</span>
            {receiveTotal > 0 && <span className="text-xs text-slate-400">รวม {fmtBaht(receiveTotal)}</span>}
          </div>
          <TrendBadge pct={trend.receivePct} />
        </div>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={receive} margin={{ top: 5, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} tickFormatter={fmtBahtShort} />
            <Tooltip formatter={(v) => [fmtBaht(v), 'มูลค่ารับเข้า']} cursor={{ fill: '#f8fafc' }} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="value" fill="#38bdf8" radius={[6, 6, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>

        {/* คำสรุป: เดือนรับเข้ามูลค่าสูงสุด + ลิงก์ไปประวัติรับยา */}
        {maxReceiveValueMonth && maxReceiveValueMonth.value > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-500">
              เดือน <span className="font-bold text-sky-700">{maxReceiveValueMonth.label}</span> รับเข้ามูลค่าสูงสุด <span className="font-bold text-slate-700">{fmtBaht(maxReceiveValueMonth.value)}</span>
            </p>
            <button onClick={onOpenReceive} className="text-xs text-[#1E90FF] hover:underline font-semibold inline-flex items-center gap-0.5">
              ดูประวัติรับเข้า <ArrowRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* ตารางยาต้องสั่งซื้อ (Top 5) */}
      {top5.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-100 text-amber-600"><ShoppingCart size={15} /></div>
              <span className="text-sm font-bold text-slate-700">ยาต้องสั่งซื้อ</span>
              <span className="text-xs text-slate-400">ต่ำกว่า Safety Stock</span>
            </div>
            <button onClick={onOpenReorder} className="text-xs text-[#1E90FF] hover:underline font-semibold inline-flex items-center gap-0.5">
              ดูทั้งหมด <ArrowRight size={13} />
            </button>
          </div>

          {/* Desktop: ตาราง */}
          <table className="hidden sm:table w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="px-4 py-2 font-semibold">ชื่อยา</th>
                <th className="px-4 py-2 font-semibold text-right">คงเหลือ</th>
                <th className="px-4 py-2 font-semibold text-right">Safety Stock</th>
                <th className="px-4 py-2 font-semibold text-right">% ของ SS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {top5.map((r, i) => (
                <tr key={r.code || i} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-slate-700 leading-tight">{r.name || r.code}</p>
                    <p className="text-xs text-slate-400">{r.code}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-red-600">{Number(r.qty).toLocaleString()} <span className="font-normal text-slate-400 text-xs">{r.unit}</span></td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{Number(r.safety_stock).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-block w-12 text-right font-semibold text-amber-600">{Math.round(r.ratio * 100)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: card list */}
          <div className="sm:hidden divide-y divide-slate-50">
            {top5.map((r, i) => (
              <div key={r.code || i} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-700 leading-tight truncate">{r.name || r.code}</p>
                    <p className="text-xs text-slate-400">{r.code}</p>
                  </div>
                  <span className="text-xs font-semibold text-amber-600 shrink-0">{Math.round(r.ratio * 100)}% ของ SS</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  คงเหลือ <span className="font-bold text-red-600">{Number(r.qty).toLocaleString()} {r.unit}</span> / SS {Number(r.safety_stock).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasData && top5.length === 0 && (
        <p className="text-center text-sm text-slate-400 py-4">ยังไม่มีข้อมูลสำหรับแสดงกราฟ</p>
      )}
    </div>
  );
}

// ---- Quick stats (staff view only) ----
function StatsStrip({ alerts = { expiring: [], lowStock: [], pendingReceive: [] }, onOpenExpiry, onOpenLowStock, onOpenRequisition, onOpenStock, onStatsReady }) {
  const [stats, setStats] = React.useState({ inventory: '-', pending: 0 });

  const loadStats = React.useCallback(async () => {
    if (!supabase) return;
    const [inv, pend] = await Promise.all([
      supabase.from('inventory').select('code'),
      supabase.from('requisitions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    const uniqueDrugs = new Set((inv.data || []).map(r => r.code).filter(Boolean)).size;
    const pending = pend.count ?? 0;

    setStats({ inventory: uniqueDrugs || '-', pending });
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
      icon: Boxes,
      color: 'text-sky-700', cardBg: 'bg-white', borderColor: 'border-slate-200', labelColor: 'text-slate-500',
      iconBg: 'bg-sky-100 text-sky-600',
      onClick: onOpenStock,
    },
    {
      label: 'ใบเบิกรอดำเนินการ',
      value: typeof stats.pending === 'number' ? stats.pending : 0,
      icon: ClipboardList,
      color:       stats.pending > 0 ? 'text-amber-700'   : 'text-slate-700',
      cardBg:      'bg-white',
      borderColor: stats.pending > 0 ? 'border-amber-200' : 'border-slate-200',
      labelColor:  'text-slate-500',
      iconBg:      stats.pending > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500',
      onClick: stats.pending > 0 ? onOpenRequisition : undefined,
    },
    {
      label: expiredCount > 0 ? `ยาหมดอายุแล้ว ${expiredCount} + ใกล้หมด` : 'ยาใกล้หมดอายุ (16 เดือน)',
      value: expiryCount,
      icon: AlertTriangle,
      color:       expiryCount > 0 ? (expiredCount > 0 ? 'text-red-700' : 'text-orange-700')   : 'text-slate-700',
      cardBg:      'bg-white',
      borderColor: expiryCount > 0 ? (expiredCount > 0 ? 'border-red-200' : 'border-orange-200') : 'border-slate-200',
      labelColor:  'text-slate-500',
      iconBg:      expiryCount > 0 ? (expiredCount > 0 ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600') : 'bg-slate-100 text-slate-500',
      onClick: expiryCount > 0 ? onOpenExpiry : undefined,
    },
  ];

  const staffItems = [
    {
      label: 'Stock ต่ำกว่ากำหนด',
      value: lowStockCount,
      icon: ShoppingCart,
      color:       lowStockCount > 0 ? 'text-amber-700'   : 'text-slate-700',
      cardBg:      'bg-white',
      borderColor: lowStockCount > 0 ? 'border-amber-200' : 'border-slate-200',
      labelColor:  'text-slate-500',
      iconBg:      lowStockCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500',
      onClick: lowStockCount > 0 ? onOpenLowStock : undefined,
    },
  ];

  const items = [...baseItems, ...staffItems];   // การ์ด "Stock ต่ำกว่ากำหนด" แสดงทุก role
  const colsMap = { 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4', 5: 'sm:grid-cols-5', 6: 'sm:grid-cols-3 lg:grid-cols-6' };
  const cols = colsMap[items.length] || 'sm:grid-cols-2';

  return (
    <div className={`mt-6 grid grid-cols-2 ${cols} gap-3`}>
      {items.map(item => {
        const Icon = item.icon;
        const cls = `${item.cardBg} border ${item.borderColor} rounded-2xl p-4 shadow-sm ${item.onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`;
        const content = (
          <>
            <div className="flex items-center gap-2 mb-2.5">
              <div className={`p-1.5 rounded-lg shrink-0 ${item.iconBg}`}>
                <Icon size={15} />
              </div>
              <p className={`text-xs leading-tight ${item.labelColor} text-left flex-1`}>{item.label}</p>
            </div>
            <p className={`text-2xl font-bold ${item.color} text-left`}>{typeof item.value === 'number' ? item.value.toLocaleString() : item.value}</p>
            {item.subLabel && <p className="text-xs mt-1.5 font-bold text-sky-600 underline underline-offset-2 text-left">{item.subLabel}</p>}
            {item.onClick && !item.subLabel && <p className="text-[10px] mt-1.5 text-slate-400 text-left">กดเพื่อดูรายละเอียด</p>}
          </>
        );
        return item.onClick
          ? <button key={item.label} onClick={item.onClick} className={`${cls} text-left`}>{content}</button>
          : <div key={item.label} className={cls}>{content}</div>;
      })}
    </div>
  );
}
