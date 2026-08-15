import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, ComposedChart, LabelList,
} from 'recharts';
import SearchableSelect from './SearchableSelect';
import {
  Pill, Package, TrendingUp, TrendingDown,
  ShieldCheck,
  ChevronRight, Activity, Database, Clock,
  AlertTriangle, ChevronDown, ChevronUp, ClipboardList,
  Eye, EyeOff, X, Bell, Search, RefreshCcw, FileDown, Printer,
  Boxes, ShoppingCart, ArrowRight, Filter,
} from 'lucide-react';
import App                from './App';
import DrugSearchBar, { DrugTypeBadge } from './DrugSearchBar';
import { exportToExcel }  from './lib/exportExcel';
import { printTrackingList } from './lib/trackingPrint';
import RequisitionApp     from './RequisitionApp';
import DispenseLogApp     from './DispenseLogApp';
import ReceiveLogApp      from './ReceiveLogApp';
import { supabase }       from './lib/supabase';
import { fetchDashboardAlerts, fetchDashboardCharts, fetchChartMonthRange, fetchPendingReturnCount, fetchPendingRequisitionCount, loginUser, registerUser, checkFirstRun, createAppUser, fetchStockSummary, fetchDrugDetails, fetchAllInventoryRows, fetchSwapReturnDue, flagSwapReturn, fetchSwapPolicies, upsertSwapReturnAction, SWAP_ACTION_STATUS, fetchSwapReturnActions, swapActionKey, fetchLatestLineQuotaAlert } from './lib/db';
import { computeReturnStatus } from './lib/swapPolicy';
import { matchReceiveDetails } from './lib/receiveMatch';
import ReturnApp          from './ReturnApp';
import AuditLogApp        from './AuditLogApp';
import UserManagementApp  from './UserManagementApp';
import HolidayCalendarApp from './HolidayCalendarApp';
import AnalyticsApp       from './AnalyticsApp';
import ReorderApp         from './ReorderApp';
import StockLedgerApp     from './StockLedgerApp';
import StockCountApp      from './StockCountApp';
import DrugLoanApp        from './DrugLoanApp';
import StockCardApp       from './StockCardApp';
import NotificationBell   from './NotificationBell';
import DashboardV2Preview from './DashboardV2Preview'; // prototype ชั่วคราว — เปิดด้วย ?v2 (ลบได้ทั้งบรรทัด)
import AppShell           from './AppShell';
import { printInspectWorksheet } from './lib/inspectWorksheet';
import { printReturnForm, printVendorExchangeForm } from './lib/returnForm';


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

  // badge จำนวนงานรอดำเนินการ (status=pending) บนเมนู sidebar — staff/admin เท่านั้น
  // คืนยา (return_logs) + ใบเบิกใหม่ (requisitions)
  const [pendingReturns, setPendingReturns]           = useState(0);
  const [pendingRequisitions, setPendingRequisitions] = useState(0);
  const [badgeTick, setBadgeTick] = useState(0); // bump เพื่อบังคับ refetch count (ปุ่ม "โหลดหน้านี้ใหม่")
  useEffect(() => {
    // เฉพาะ staff/admin — requester ไม่ fetch (count คง 0 ตาม initial state, ไม่ต้อง reset sync)
    if (!supabase || !auth || (auth.role !== 'staff' && auth.role !== 'admin')) return;
    const refreshReturns = () => fetchPendingReturnCount().then(setPendingReturns).catch(() => {});
    const refreshReqs    = () => fetchPendingRequisitionCount().then(setPendingRequisitions).catch(() => {});
    refreshReturns(); refreshReqs();
    const ch = supabase
      .channel('approot-pending-badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'return_logs' },   refreshReturns)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisitions' },   refreshReqs)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [auth?.id, auth?.role, badgeTick]);

  const handleLogin = (user) => { sessionStorage.setItem(AUTH_KEY, JSON.stringify(user)); setAuth(user); };
  const logout = () => {
    if (auth?.id) sessionStorage.removeItem(`swap_popup_shown_${auth.id}`); // login ใหม่ให้เด้ง popup ได้อีก
    sessionStorage.removeItem(AUTH_KEY); setAuth(null); setNavStack(['dashboard']); setToasts([]);
  };
  // โหลดหน้านี้ใหม่ = remount sub-app (subKey) + refetch badge count (badgeTick) — กัน badge ค้างเมื่อ realtime พลาด
  const refreshPage = () => { setSubKey(k => k + 1); setBadgeTick(t => t + 1); };

  // action item ใน sidebar (เมนู "แบบฟอร์มต่างๆ") — ทำ action ไม่เปิดหน้า/ไม่เข้า navStack
  const runFormAction = (action) => {
    if (action === 'inspectWorksheet') printInspectWorksheet();
    else if (action === 'returnForm') printReturnForm();
    else if (action === 'vendorExchangeForm') printVendorExchangeForm();
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
      case 'receive-scan':
        content = <ReceiveLogApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} initialTab="scan" onGoBack={goBack} canGoBack={canGoBack} />;
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
      case 'holiday':
        content = <HolidayCalendarApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      case 'analytics':
        content = <AnalyticsApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      case 'reorder':
      case 'reorder-supplier':
      case 'reorder-verify':
      case 'reorder-history':
        content = <ReorderApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} initialTab={{ 'reorder-supplier': 'supplier', 'reorder-verify': 'verify', 'reorder-history': 'history' }[page] || 'analysis'} onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      case 'ledger':
        content = <StockLedgerApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      case 'loan':
        content = <DrugLoanApp key={subKey} onRefresh={refreshPage} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      case 'stockcount':
        content = <StockCountApp key={subKey} onBack={() => setPage('dashboard')} onRefresh={refreshPage} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
        break;
      case 'stockcard':
        content = <StockCardApp key={subKey} onRefresh={refreshPage} auth={auth} onGoBack={goBack} canGoBack={canGoBack} />;
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
      <AppShell page={page} onNavigate={setPage} onFormAction={runFormAction} onRefresh={refreshPage} displayName={displayName} role={auth.role} permissions={auth.permissions} auth={auth} onLogout={logout} badges={{ return: pendingReturns, requisition: pendingRequisitions }}>
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
    <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-2xl shadow-2xl p-4 flex items-start gap-3 w-80 max-w-[calc(100vw-2rem)]">
      <div className="shrink-0 w-9 h-9 bg-amber-100 dark:bg-amber-950/60 rounded-xl flex items-center justify-center">
        <Bell size={18} className="text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-tight">ใบเบิกยาใหม่เข้า</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
          {req.department} · {req.requester_name || 'ไม่ระบุ'}
        </p>
        {req.req_number && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{req.req_number}</p>
        )}
        <button
          onClick={onNavigate}
          className="text-xs text-amber-600 font-semibold mt-1.5 hover:text-amber-700 hover:underline"
        >
          ไปดูใบเบิก →
        </button>
      </div>
      <button onClick={onDismiss} className="shrink-0 text-slate-300 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-400 transition-colors mt-0.5">
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
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-violet-50 dark:bg-violet-950/40 border-b border-violet-100 dark:border-violet-900/50 px-6 py-4 text-center">
            <ShieldCheck size={28} className="mx-auto text-violet-600 mb-1"/>
            <p className="font-bold text-violet-800 dark:text-violet-300">ตั้งค่าระบบครั้งแรก</p>
            <p className="text-xs text-violet-500 mt-0.5">สร้างบัญชีผู้ดูแลระบบ (Admin)</p>
          </div>
          <form onSubmit={handleFirstRun} className="p-6 space-y-4">
            <LabelInput label="ชื่อผู้ใช้ (username)" value={aUsername} onChange={e => setAUsername(e.target.value)} placeholder="เช่น admin" required autoComplete="off"/>
            <LabelInput label="ชื่อ-สกุล" value={aFullName} onChange={e => setAFullName(e.target.value)} placeholder="ชื่อ-สกุลจริง" required/>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">รหัสผ่าน</label>
              <PwInput value={aPassword} onChange={e => setAPassword(e.target.value)} show={aShowPw} onToggle={() => setAShowPw(s => !s)} required/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">ยืนยันรหัสผ่าน</label>
              <PwInput value={aConfirm} onChange={e => setAConfirm(e.target.value)} show={aShowPw} onToggle={() => setAShowPw(s => !s)} placeholder="ยืนยันรหัสผ่าน" required/>
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 text-white rounded-xl py-3 font-semibold text-sm transition-colors shadow-sm disabled:opacity-50">
              {loading ? 'กำลังสร้าง...' : 'สร้างบัญชี Admin'}
            </button>
          </form>
        </div>
      )}

      {/* ===== Login ===== */}
      {view === 'login' && (
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <form onSubmit={handleLogin} className="p-6 space-y-4">
            <LabelInput label="ชื่อผู้ใช้ (username)" value={username} onChange={e => setUsername(e.target.value)} placeholder="กรอกชื่อผู้ใช้" required autoComplete="username"/>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">รหัสผ่าน</label>
              <PwInput value={password} onChange={e => setPassword(e.target.value)} show={showPw} onToggle={() => setShowPw(s => !s)} required autoComplete="current-password"/>
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl py-3 font-semibold text-sm transition-colors shadow-sm disabled:opacity-50">
              {loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
          <div className="border-t border-slate-100 dark:border-slate-800 px-6 py-4 flex items-center justify-between">
            <button onClick={() => { setView('forgot'); setError(''); }}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-sm transition-colors">
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
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-sky-50 dark:bg-sky-950/40 border-b border-sky-100 dark:border-sky-900/50 px-6 py-4">
            <p className="font-bold text-sky-800 dark:text-sky-300">สมัครเข้าใช้งาน</p>
            <p className="text-xs text-sky-500 mt-0.5">บัญชีใหม่จะได้รับสิทธิ์ผู้เบิก (requester)</p>
          </div>
          {rSuccess ? (
            <div className="p-6 text-center space-y-3">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 dark:bg-emerald-950/60 rounded-full">
                <CheckCircle size={28} className="text-emerald-600"/>
              </div>
              <p className="font-bold text-slate-800 dark:text-slate-100">สมัครสำเร็จ!</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">สามารถเข้าสู่ระบบได้ทันที</p>
              <button onClick={() => { setView('login'); setError(''); }}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white rounded-xl py-2.5 font-semibold text-sm transition-colors">
                ไปหน้าเข้าสู่ระบบ
              </button>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="p-6 space-y-3.5">
              <LabelInput label="ชื่อผู้ใช้ (username)" value={rUsername} onChange={e => setRUsername(e.target.value)} placeholder="ภาษาอังกฤษ ไม่มีช่องว่าง" required autoComplete="off"/>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">หน่วยงาน</label>
                <SearchableSelect value={rDept} onChange={setRDept} options={DEPARTMENTS_LIST} placeholder="-- เลือกหน่วยงาน --"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">รหัสผ่าน (อย่างน้อย 6 ตัว)</label>
                <PwInput value={rPassword} onChange={e => setRPassword(e.target.value)} show={rShowPw} onToggle={() => setRShowPw(s => !s)} required/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">ยืนยันรหัสผ่าน</label>
                <PwInput value={rConfirm} onChange={e => setRConfirm(e.target.value)} show={rShowPw} onToggle={() => setRShowPw(s => !s)} placeholder="ยืนยันรหัสผ่าน" required/>
              </div>
              {error && <p className="text-red-600 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl py-3 font-semibold text-sm transition-colors shadow-sm disabled:opacity-50">
                {loading ? 'กำลังสมัคร...' : 'สมัครเข้าใช้งาน'}
              </button>
              <button type="button" onClick={() => { setView('login'); setError(''); }}
                className="w-full text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm font-medium transition-colors py-1">
                ← กลับหน้าเข้าสู่ระบบ
              </button>
            </form>
          )}
        </div>
      )}

      {/* ===== Forgot Password ===== */}
      {view === 'forgot' && (
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-100 dark:border-amber-900/50 px-6 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div>
              <p className="font-bold text-amber-800 dark:text-amber-300 text-sm">ลืมรหัสผ่าน</p>
              <p className="text-xs text-amber-600 mt-0.5">ติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน</p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              ระบบนี้ไม่รองรับการรีเซ็ตรหัสผ่านด้วยตนเอง<br/>
              กรุณาติดต่อ <span className="font-semibold text-slate-800 dark:text-slate-100">ผู้ดูแลระบบ (Admin)</span> เพื่อให้รีเซ็ตรหัสผ่านให้
            </p>
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">ขั้นตอน</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">1. แจ้ง Username ของคุณให้ Admin</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">2. Admin รีเซ็ตรหัสผ่านชั่วคราวให้</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">3. เข้าสู่ระบบด้วยรหัสใหม่</p>
            </div>
          </div>
          <div className="border-t border-slate-100 dark:border-slate-800 px-6 py-4 text-center">
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
      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">{label}</label>
      <input type="text" value={value} onChange={onChange} placeholder={placeholder} required={required} autoComplete={autoComplete}
        className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"/>
    </div>
  );
}

function PwInput({ value, onChange, show, onToggle, placeholder = 'รหัสผ่าน', required, autoComplete }) {
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder} required={required} autoComplete={autoComplete}
        className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 pr-10 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"/>
      <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
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

function Dashboard({ auth, onNavigate }) {
  const isStaff = auth.role === 'staff' || auth.role === 'admin';
  const [alerts, setAlerts] = useState({ expiring: [], lowStock: [], pendingReceive: [] });
  const [charts, setCharts] = useState(null);
  const [alertModal, setAlertModal] = useState(null); // null | 'expiry' | 'lowStock' | 'stock'
  const [swapDue, setSwapDue] = useState([]);          // ยาต้องคืนบริษัทก่อนพ้นกำหนด (staff/admin)
  const [swapPopupOpen, setSwapPopupOpen] = useState(false); // popup เด้งอัตโนมัติตอน login
  const [expiredPopupOpen, setExpiredPopupOpen] = useState(false); // popup ยาหมดอายุค้างคลัง
  const [quotaPopup, setQuotaPopup] = useState(null);  // popup โควตา LINE ใกล้หมด (staff/admin)
  const [chartMonths, setChartMonths] = useState(6);   // ช่วงเปรียบเทียบกราฟ: 3 | 6 | 12 | 'all'
  const [chartEndYm, setChartEndYm] = useState(null);  // เดือนสิ้นสุดของช่วง (YYYY-MM); null = เดือนล่าสุด
  const [monthRange, setMonthRange] = useState([]);    // รายการเดือนให้เลือกใน dropdown

  // ยาหมดอายุค้างคลัง = ของที่ยังอยู่บนชั้นทั้งที่เลย exp แล้ว (CONTEXT §Expired-On-Shelf)
  // ⚠️ ต้อง derive จาก alerts.expiring ชุดเดียวกับโมดอลส้ม — expired/near-expiry อยู่ในชุดเดียวกัน
  // (ดู Do-Not rule เรื่องโมดอลส้มใน CLAUDE.md) แยก query ใหม่จะหลุดจากกันได้
  const expiredItems = useMemo(
    () => (alerts.expiring || []).filter(it => it.daysLeft < 0),
    [alerts.expiring],
  );

  useEffect(() => {
    if (!supabase) return;
    fetchDashboardAlerts().then(a => {
      setAlerts(a);
      // เด้ง popup ยาหมดอายุค้างคลังพร้อมกับที่ข้อมูลมาถึง — ครั้งเดียวต่อรอบ login
      const expired = (a.expiring || []).filter(it => it.daysLeft < 0);
      const shownKey = `expired_popup_shown_${auth.id}`;
      if (expired.length > 0 && !sessionStorage.getItem(shownKey)) {
        setExpiredPopupOpen(true);
        sessionStorage.setItem(shownKey, '1');
      }
    });
    fetchChartMonthRange().then(setMonthRange).catch(() => {});
  }, [auth.id]);

  // กราฟเบิก/รับ — refetch เมื่อเปลี่ยนช่วง (3/6/12/ทั้งหมด) หรือเดือนสิ้นสุด. แสดงทุก role
  // ไม่ล้าง charts เป็น null ระหว่างโหลด → คงกราฟเดิมไว้ ไม่กระพริบว่าง (race: ค่าล่าสุดชนะด้วย alive flag)
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    fetchDashboardCharts(chartMonths, chartEndYm).then(c => { if (alive) setCharts(c); }).catch(() => {});
    return () => { alive = false; };
  }, [chartMonths, chartEndYm]);

  useEffect(() => {
    if (!supabase) return;
    // ยาต้องเปลี่ยน/คืนบริษัทก่อนพ้นกำหนด — เด้ง popup อัตโนมัติ "ครั้งเดียวต่อรอบ login"
    // (Dashboard remount ทุกครั้งที่กลับมาหน้าหลัก → กันเด้งซ้ำด้วย sessionStorage flag; ล้างตอน logout)
    // แสดงทุก role — ไม่ใช่แค่เจ้าหน้าที่คลังยา (ผู้ใช้อื่นต้องเห็นด้วยเพื่อช่วยกันไม่ให้ของตกหล่น)
    const shownKey = `swap_popup_shown_${auth.id}`;
    fetchSwapReturnDue().then(rows => {
      setSwapDue(rows);
      if (rows.length > 0 && !sessionStorage.getItem(shownKey)) {
        setSwapPopupOpen(true);
        sessionStorage.setItem(shownKey, '1');
      }
    }).catch(() => {});
  }, [auth.id]);

  // ยาหมดอายุค้างคลัง (ของยังอยู่บนชั้นทั้งที่เลย exp) — เด้งครั้งเดียวต่อรอบ login
  // ใช้ alerts.expiring ชุดเดียวกับโมดอลส้ม แล้วกรอง daysLeft < 0 (Do-Not rule: expired อยู่ในชุดเดียวกัน)
  //
  // ตั้ง flag "เคยเด้งแล้ว" ตอน fetch เสร็จ (ไม่ใช่ setState ใน effect แยก — cascading render)
  // pattern เดียวกับ swap popup แต่ต้องรอ alerts โหลดก่อน จึงเช็คใน callback ของ fetchDashboardAlerts

  // โควตาแจ้งเตือน LINE ใกล้หมด — staff/admin เท่านั้น (ward ทำอะไรกับโควตาไม่ได้)
  // อ่านจาก audit action `line_quota_low` ที่บอทบันทึกไว้ (ดู docs/features/requisition-announce.md)
  useEffect(() => {
    if (!supabase || !isStaff) return;
    const shownKey = `line_quota_popup_shown_${auth.id}`;
    if (sessionStorage.getItem(shownKey)) return;
    fetchLatestLineQuotaAlert().then(row => {
      if (!row) return;
      setQuotaPopup(row);
      sessionStorage.setItem(shownKey, '1');
    }).catch(() => {});
  }, [auth.id, isStaff]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-200 via-slate-100 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 font-sans">
      {/* กระดิ่ง + เมนูบัญชี + สลับธีม อยู่บน top bar (ขาว) ของ AppShell — แสดงทุกหน้า */}

      {/* หัวหน้า — ชื่อหน้าอย่างเดียว (ชื่อผู้ใช้/บทบาทดูได้ที่เมนูบัญชีบน top bar) */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-4">
        <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h2>
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
          months={chartMonths}
          onChangeMonths={setChartMonths}
          endYm={chartEndYm}
          onChangeEndYm={setChartEndYm}
          monthRange={monthRange}
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

      {/* Popup เด้งอัตโนมัติตอน login — ยาต้องเปลี่ยน/คืนบริษัทก่อนพ้นกำหนด */}
      {swapPopupOpen && swapDue.length > 0 && (
        <SwapReturnPopup rows={swapDue} auth={auth} onClose={() => setSwapPopupOpen(false)} />
      )}

      {/* Popup ยาหมดอายุค้างคลัง — ของที่ยังอยู่บนชั้นทั้งที่เลย exp แล้ว ต้องเก็บออก */}
      {expiredPopupOpen && expiredItems.length > 0 && (
        <ExpiredStockPopup
          rows={expiredItems}
          onClose={() => setExpiredPopupOpen(false)}
          onOpenAll={() => { setExpiredPopupOpen(false); setAlertModal('expiry'); }}
        />
      )}

      {/* Popup โควตาแจ้งเตือน LINE ใกล้หมด — staff/admin เท่านั้น (ward ไม่เกี่ยว) */}
      {quotaPopup && (
        <LineQuotaPopup info={quotaPopup} onClose={() => setQuotaPopup(null)} />
      )}
    </div>
  );
}

// ---- Popup ยาต้องเปลี่ยน/คืนบริษัทก่อนพ้นกำหนด (เด้งตอน login) ----
// deadline เก็บเป็น ISO YYYY-MM-DD → DD/MM/YYYY (พ.ศ.)
const swapFmtDeadline = (iso) => {
  if (!iso) return '-';
  const [y, m, d] = String(iso).split('-').map(Number);
  return (y && m && d) ? `${d}/${m}/${y + 543}` : String(iso);
};
// exp เก็บเป็น D/M/YYYY (ค.ศ.) ใน inventory — แปลงเป็น พ.ศ. (คนละ format กับ deadline)
const swapFmtExp = (raw) => {
  if (!raw) return '-';
  const [d, m, y] = String(raw).split('/').map(Number);
  return (d && m && y) ? `${d}/${m}/${y + 543}` : String(raw);
};
// date input แสดง DD/MM/YYYY (พ.ศ.) ทับ hidden <input type="date"> — Rule #3/#14
// ห้ามใช้ plain <input type="date"> เพราะ browser US locale แสดง MM/DD/YYYY
function SwapActionDateInput({ value, onChange, className = '' }) {
  return (
    <div className={`relative flex items-center bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md focus-within:ring-2 focus-within:ring-amber-500 ${className}`}>
      <span className={`px-2 py-1 text-[11px] w-full select-none pointer-events-none ${value ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>{value ? swapFmtDeadline(value) : 'dd/mm/yyyy'}</span>
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
        onClick={e => { try { e.currentTarget.showPicker?.(); } catch { /* mobile ไม่รองรับ — ปล่อยให้ native เปิดเอง */ } }}
        className="absolute inset-0 opacity-0 w-full cursor-pointer" />
    </div>
  );
}
const swapStatusText = (r) => r.status === 'overdue' ? 'พ้นกำหนดแล้ว' : `เหลือ ${r.daysToDeadline} วัน`;
const swapRateText = (r) => r.avgBaseUnit ? `~${Math.round(r.avgBaseUnit).toLocaleString()} ${r.baseUnit || 'หน่วย'}/เดือน` : 'ไม่มีการเบิก';

// normExpDate + matchReceiveDetails ย้ายไป src/lib/receiveMatch.js (ใช้ร่วมกับโมดอลแผนผัง App.jsx
// โดยไม่ชน circular import) — import ไว้ที่หัวไฟล์

// column def สำหรับ Excel export (reuse header เดียวกับตาราง print)
const SWAP_RETURN_EXCEL_COLS = [
  { header: 'สถานะ',            value: swapStatusText },
  { header: 'ชื่อยา',            key: 'name' },
  { header: 'รหัสยา',            key: 'code' },
  { header: 'Lot',               key: 'lot' },
  { header: 'ที่เก็บ',           key: 'location' },
  { header: 'วันที่คลังรับ',     value: r => swapFmtDeadline(r.receiveDate) },
  { header: 'วันหมดอายุ',       value: r => swapFmtExp(r.exp) },
  { header: 'คงเหลือ',           key: 'qty' },
  { header: 'หน่วย',             key: 'unit' },
  { header: 'บริษัท',            key: 'company' },
  { header: 'ต้องคืนภายใน',     value: r => swapFmtDeadline(r.deadline) },
  { header: 'เบิกเฉลี่ย/เดือน (6ด.)', value: swapRateText },
  { header: 'ดำเนินการ',        value: r => SWAP_ACTION_STATUS[r.actionStatus] || SWAP_ACTION_STATUS.pending },
  { header: 'วันที่ดำเนินการ',  value: r => swapFmtDeadline(r.actionDate) },
  { header: 'ผู้บันทึก',         value: r => r.actionBy || '-' },
  { header: 'นโยบายเปลี่ยน/คืน', value: r => r.policyText || '-' },
];

// ---- Popup ยาหมดอายุค้างคลัง (เด้งตอน login) ----
// "ค้างคลัง" = เลย exp แล้วแต่ qty ยังไม่ 0 → ของจริงยังอยู่บนชั้น ต้องเก็บออก
// ต่างจากโมดอลส้ม (ใกล้หมดอายุ) ตรงที่อันนี้เจาะเฉพาะของที่ **เลยกำหนดไปแล้ว** — ด่วนกว่า
function ExpiredStockPopup({ rows = [], onClose, onOpenAll }) {
  const SHOW = 8;
  const shown = rows.slice(0, SHOW);
  const rest = rows.length - shown.length;
  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-red-50 dark:bg-red-950/40 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-red-200 dark:border-red-900/60 flex items-start gap-3 shrink-0">
          <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-xl shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">ยาหมดอายุค้างคลัง {rows.length} รายการ</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              เลยวันหมดอายุแล้วแต่ยังมีของค้างอยู่บนชั้น — ต้องเก็บออกจากคลังและบันทึกตัดจ่าย
            </p>
          </div>
        </div>

        <div className="p-3 overflow-y-auto space-y-2 flex-1">
          {shown.map((it, i) => (
            <div key={`${it.code}|${it.lot}|${it.location}|${i}`}
              className="rounded-lg border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm break-words">{it.name}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{it.code}</p>
                </div>
                <span className="shrink-0 px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 text-[11px] font-semibold">
                  หมดอายุแล้ว {Math.abs(it.daysLeft)} วัน
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-slate-600 dark:text-slate-300">
                <p>Lot: <span className="font-medium text-slate-800 dark:text-slate-100">{it.lot || '-'}</span></p>
                <p>Exp: <span className="font-medium text-slate-800 dark:text-slate-100">{it.exp || '-'}</span></p>
                <p>ที่เก็บ: <span className="font-medium text-slate-800 dark:text-slate-100">{it.location || '-'}</span></p>
                <p>คงเหลือ: <span className="font-medium text-slate-800 dark:text-slate-100">{it.qty}{it.unit ? ` (${it.unit})` : ''}</span></p>
              </div>
            </div>
          ))}
          {rest > 0 && (
            <p className="text-center text-xs text-slate-500 dark:text-slate-400 py-2">และอีก {rest} รายการ</p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 border-t border-red-200 dark:border-red-900/60 flex justify-end items-center gap-2 shrink-0 rounded-b-2xl">
          <button onClick={onOpenAll}
            className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium transition-colors">
            ดูรายการทั้งหมด
          </button>
          <button onClick={onClose}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors">
            รับทราบ
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Popup โควตาแจ้งเตือน LINE ใกล้หมด (staff/admin, เด้งตอน login) ----
// โควตา LINE = 300 ข้อความ/เดือน · push เข้ากลุ่มนับรายหัว → ส่งได้จำกัดครั้งต่อเดือน
// ดู docs/features/requisition-announce.md §โควตา
function LineQuotaPopup({ info, onClose }) {
  const d = info?.details || {};
  const left = Number(d.sends_left ?? 0);
  const exhausted = d.exhausted || left <= 0;
  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-amber-50 dark:bg-amber-950/40 rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-amber-200 dark:border-amber-900/60 flex items-start gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-xl shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {exhausted ? 'โควตาแจ้งเตือน LINE หมดแล้ว' : 'โควตาแจ้งเตือน LINE ใกล้หมด'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">ประกาศรอบเบิก-รับเข้ากลุ่ม LINE</p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            {d.skipped_announcement
              ? 'ประกาศรอบเบิก-รับวันนี้ไม่ได้ส่งเข้ากลุ่ม เพราะโควตาเดือนนี้หมดแล้ว ระบบจะกลับมาส่งอัตโนมัติต้นเดือนหน้า'
              : exhausted
                ? 'ส่งประกาศครั้งสุดท้ายของเดือนนี้แล้ว หลังจากนี้กลุ่มจะไม่ได้รับประกาศจนถึงสิ้นเดือน'
                : `ส่งประกาศเข้ากลุ่มได้อีก ${left} ครั้ง หลังจากนั้นประกาศจะขาดช่วงจนถึงสิ้นเดือน`}
          </p>
          {d.quota_used != null && d.quota_limit != null && (
            <div className="rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 p-3 text-[12px] text-slate-600 dark:text-slate-300 space-y-1">
              <p>ใช้ไปแล้ว: <span className="font-semibold text-slate-800 dark:text-slate-100">{d.quota_used} / {d.quota_limit}</span> ข้อความ</p>
              {d.group_members != null && (
                <p>สมาชิกกลุ่ม: <span className="font-semibold text-slate-800 dark:text-slate-100">{d.group_members}</span> คน (ส่ง 1 ครั้ง = หัก {d.group_members} ข้อความ)</p>
              )}
            </div>
          )}
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            ward ยังดูรอบเบิก-รับได้ที่ปฏิทินในระบบคลังยา · โควตารีเซ็ตต้นเดือนถัดไป
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 border-t border-amber-200 dark:border-amber-900/60 flex justify-end rounded-b-2xl">
          <button onClick={onClose}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold transition-colors">
            รับทราบ
          </button>
        </div>
      </div>
    </div>
  );
}

function SwapReturnPopup({ rows = [], auth, onClose }) {
  const [flagged, setFlagged] = React.useState({});
  const [exporting, setExporting] = React.useState(false);
  // สถานะดำเนินการที่แก้ในหน้านี้ (override ค่าที่มาจาก DB จนกว่าจะโหลดใหม่)
  const [actions, setActions] = React.useState({});
  const [savingKey, setSavingKey] = React.useState(null);
  // แก้สถานะได้เฉพาะเจ้าหน้าที่คลังยา + admin — role อื่นเห็นอย่างเดียว (read-only)
  const canEdit = auth?.role === 'staff' || auth?.role === 'admin';
  const [drugDetails, setDrugDetails] = React.useState(null); // receive_logs — คลิกรายการดูประวัติรับยา (ชุดเดียวกับโมดอลใกล้หมดอายุ)
  const [expandedKey, setExpandedKey] = React.useState(null);
  React.useEffect(() => {
    fetchDrugDetails().then(setDrugDetails).catch(() => setDrugDetails(null));
  }, []);
  const keyOf = (r) => r.id ?? `${r.code}|${r.lot}|${r.location}`; // id = inventory row id — business key ซ้ำได้จริง (แถวซ้ำ code+lot+location) ทำ React key ชน
  const fmtThai = swapFmtDeadline;
  const fmtExp = swapFmtExp;
  const overdue = rows.filter(r => r.status === 'overdue');
  const due = rows.filter(r => r.status === 'due');
  const handleFlag = async (r) => {
    try {
      await flagSwapReturn({
        drugCode: r.code, drugName: r.name, lot: r.lot, company: r.company,
        returnMonths: r.returnMonths, deadline: r.deadline, daysLeft: r.daysToDeadline,
      }, auth);
      setFlagged(prev => ({ ...prev, [keyOf(r)]: true }));
    } catch { /* เงียบ — ไม่บล็อกการใช้งาน */ }
  };
  // บันทึกสถานะดำเนินการ (status และ/หรือ วันที่) — upsert ต่อ code|lot|company
  const saveAction = async (r, patch) => {
    const k = keyOf(r);
    const cur = actions[k] || { status: r.actionStatus || 'pending', date: r.actionDate || '' };
    const next = { ...cur, ...patch };
    setActions(prev => ({ ...prev, [k]: next }));   // optimistic — ผู้ใช้เห็นผลทันที
    setSavingKey(k);
    try {
      await upsertSwapReturnAction({
        drugCode: r.code, drugName: r.name, lot: r.lot, company: r.company,
        status: next.status, actionDate: next.date || null,
      }, auth);
    } catch {
      setActions(prev => ({ ...prev, [k]: cur }));  // ล้มเหลว → คืนค่าเดิม ไม่หลอกว่าบันทึกแล้ว
    } finally { setSavingKey(null); }
  };
  const handleExport = async () => {
    if (exporting || rows.length === 0) return;
    setExporting(true);
    try {
      await exportToExcel(rows, SWAP_RETURN_EXCEL_COLS, 'ยาต้องเปลี่ยนคืน',
        `ยาต้องเปลี่ยนคืน_${new Date().toISOString().slice(0, 10)}.xlsx`, auth);
    } catch { /* เงียบ */ }
    finally { setExporting(false); }
  };
  const handlePrint = () => {
    const esc = (s) => String(s ?? '-').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const today = swapFmtDeadline(new Date().toISOString().slice(0, 10));
    const section = (title, list, tone) => !list.length ? '' : `
      <h2 style="color:${tone};margin:14px 0 4px">${title} (${list.length})</h2>
      <table><thead><tr>
        <th>สถานะ</th><th>ชื่อยา</th><th>รหัสยา</th><th>Lot</th><th>ที่เก็บ</th><th>วันที่คลังรับ</th><th>EXP</th>
        <th>คงเหลือ</th><th>บริษัท</th><th>ต้องคืนภายใน</th><th>เบิก/เดือน</th><th>ดำเนินการ</th><th>วันที่</th><th>นโยบาย</th>
      </tr></thead><tbody>
      ${list.map(r => `<tr>
        <td>${esc(swapStatusText(r))}</td><td>${esc(r.name)}</td><td>${esc(r.code)}</td>
        <td>${esc(r.lot)}</td><td>${esc(r.location)}</td><td>${esc(swapFmtDeadline(r.receiveDate))}</td><td>${esc(swapFmtExp(r.exp))}</td>
        <td style="text-align:right">${esc(r.qty)}${r.unit ? ` (${esc(r.unit)})` : ''}</td>
        <td>${esc(r.company)}</td><td>${esc(swapFmtDeadline(r.deadline))}</td>
        <td style="text-align:right">${esc(swapRateText(r))}</td>
        <td>${esc(SWAP_ACTION_STATUS[r.actionStatus] || SWAP_ACTION_STATUS.pending)}</td>
        <td>${esc(swapFmtDeadline(r.actionDate))}</td>
        <td style="font-size:10px">${esc(r.policyText || '-')}</td>
      </tr>`).join('')}
      </tbody></table>`;
    const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
      <title>ยาต้องเปลี่ยน/คืนบริษัท</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        *{font-family:'Sarabun',sans-serif;box-sizing:border-box}
        body{margin:20px;color:#1e293b}
        h1{font-size:18px;margin:0 0 2px}
        .sub{color:#64748b;font-size:12px;margin:0 0 8px}
        table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}
        th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}
        th{background:#f1f5f9;font-weight:700}
        @media print{body{margin:0}}
      </style></head><body>
      <h1>ยาต้องเปลี่ยน/คืนบริษัทก่อนพ้นกำหนด</h1>
      <p class="sub">พิมพ์เมื่อ ${today} · ทั้งหมด ${rows.length} รายการ${overdue.length ? ` (พ้นกำหนดแล้ว ${overdue.length})` : ''}</p>
      ${section('พ้นกำหนดคืนแล้ว', overdue, '#be123c')}
      ${section('ใกล้พ้นกำหนด', due, '#b45309')}
      <script>window.onload=function(){window.print()}</script>
      </body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win === null) {
      // In-app WebView (LINE/FB) บล็อก window.open → นำทางผ่าน <a> click แทน (Rule #4)
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const Row = (r) => {
    const isFlagged = flagged[keyOf(r)];
    const isOpen = expandedKey === keyOf(r);
    // สถานะที่แก้ในหน้านี้ชนะค่าที่มาจาก DB (ยังไม่ refetch)
    const curAction = actions[keyOf(r)] || { status: r.actionStatus || 'pending', date: r.actionDate || '' };
    const det = matchReceiveDetails(drugDetails, r); // ประวัติรับยา — helper กลางชุดเดียวกับโมดอลใกล้หมดอายุ
    // willDeplete = ของจะหมดเองก่อนถึง deadline (ตามเรทเบิก) → ไม่ต้องคืน (flag จาง ไม่ซ่อน — ดู CONTEXT.md §ความจำเป็นต้องคืน)
    return (
      <div key={keyOf(r)} className={`rounded-lg border overflow-hidden ${r.willDeplete ? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-80' : 'bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-900/60'}`}>
        <div onClick={() => setExpandedKey(isOpen ? null : keyOf(r))} className="px-3 py-2 cursor-pointer hover:bg-amber-50/60 dark:hover:bg-amber-950/50">
          <div className="flex items-center gap-2 flex-wrap">
            <ChevronDown size={13} className={`text-amber-600 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${r.status === 'overdue' ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300'}`}>
              {r.status === 'overdue' ? 'พ้นกำหนด' : `เหลือ ${r.daysToDeadline} วัน`}
            </span>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate min-w-0">{r.name}</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">Lot {r.lot} · {r.location}</span>
            {r.receiveDate && <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">คลังรับ {fmtThai(r.receiveDate)}</span>}
            <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">EXP {fmtExp(r.exp)}</span>
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 shrink-0">คงเหลือ {r.qty}{r.unit ? ` (${r.unit})` : ''}</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">{r.company}</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">ต้องคืนภายใน {fmtThai(r.deadline)}</span>
            {isFlagged ? (
              <span className="ml-auto text-[11px] font-semibold text-emerald-600 shrink-0">แจ้งหัวหน้าแล้ว</span>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); handleFlag(r); }}
                className="ml-auto text-[11px] font-semibold bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-md transition-colors shrink-0">
                แจ้งหัวหน้า
              </button>
            )}
          </div>
          {/* ดำเนินการ + วันที่ — staff/admin แก้ได้, role อื่นเห็นอย่างเดียว. stopPropagation กันคลิกแล้วไปพับ/กางประวัติ */}
          <div className="flex items-center gap-2 flex-wrap mt-1.5" onClick={(e) => e.stopPropagation()}>
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 shrink-0">ดำเนินการ:</span>
            {canEdit ? (
              <>
                <select
                  value={curAction.status}
                  onChange={(e) => saveAction(r, { status: e.target.value })}
                  className="text-[11px] border border-slate-300 dark:border-slate-600 rounded-md px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {Object.entries(SWAP_ACTION_STATUS).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
                <SwapActionDateInput
                  value={curAction.date}
                  onChange={(v) => saveAction(r, { date: v })}
                  className="w-32"
                />
                {savingKey === keyOf(r) && <RefreshCcw size={12} className="animate-spin text-amber-600" />}
              </>
            ) : (
              <>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${curAction.status === 'pending' ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700' : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60'}`}>
                  {SWAP_ACTION_STATUS[curAction.status] || SWAP_ACTION_STATUS.pending}
                </span>
                {curAction.date && <span className="text-[11px] text-slate-500 dark:text-slate-400">{fmtThai(curAction.date)}</span>}
              </>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            <span className="font-semibold text-slate-600 dark:text-slate-300">เบิกเฉลี่ย/เดือน (6 ด.ล่าสุด):</span>{' '}
            {r.avgBaseUnit ? `~${Math.round(r.avgBaseUnit).toLocaleString()} ${r.baseUnit || 'หน่วย'}/เดือน` : 'ไม่มีการเบิก'}
          </p>
          {r.willDeplete && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-1 flex items-center gap-1">
              <span className="font-semibold">คาดว่าจะหมดเองก่อน</span>
              (ใช้ ~{Math.round(r.avgPerDay)}/วัน · คงเหลือพอ ~{r.coverageDays} วัน) — อาจไม่ต้องคืน
            </p>
          )}
          {r.policyText && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
              <span className="font-semibold text-slate-600 dark:text-slate-300">นโยบาย:</span> {r.policyText}
            </p>
          )}
          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 mt-1 flex items-center gap-1">
            <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            {isOpen ? 'ซ่อนประวัติรับยา' : 'ดูประวัติรับยา'}
          </p>
        </div>
        {isOpen && <div className="px-3 border-t border-amber-100 dark:border-amber-900/50"><ReceiveHistoryDetail details={det.rows} scope={det.scope} /></div>}
      </div>
    );
  };
  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-amber-50 dark:bg-amber-950/40 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="p-5 flex justify-between items-start gap-3 shrink-0 rounded-t-2xl bg-amber-500 text-white">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle size={22} className="text-white shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-lg font-bold leading-tight">ยาต้องเปลี่ยน/คืนบริษัทก่อนพ้นกำหนด</h3>
              <p className="text-amber-50 text-xs mt-0.5">
                มี {rows.length} รายการ{overdue.length > 0 ? ` (พ้นกำหนดแล้ว ${overdue.length})` : ''}
                {rows.some(r => r.willDeplete) ? ` · ควรคืนจริง ${rows.filter(r => !r.willDeplete).length}` : ''} — แจ้งหัวหน้าให้ดำเนินการก่อนตกหล่น
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white bg-black/10 hover:bg-black/20 p-2 rounded-xl transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-auto p-4 space-y-2 flex-1">
          {overdue.length > 0 && (
            <>
              <p className="text-xs font-bold text-rose-700 dark:text-rose-300 px-1">พ้นกำหนดคืนแล้ว ({overdue.length})</p>
              {overdue.map(Row)}
            </>
          )}
          {due.length > 0 && (
            <>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-300 px-1 pt-1">ใกล้พ้นกำหนด ({due.length})</p>
              {due.map(Row)}
            </>
          )}
        </div>
        <div className="bg-white dark:bg-slate-900 p-3 border-t border-amber-200 dark:border-amber-900/60 flex justify-between items-center gap-2 shrink-0 rounded-b-2xl flex-wrap">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 min-w-0">ดูรายละเอียดเพิ่มเติมได้ที่ระบบแผนผัง ▸ ใกล้หมดอายุ</p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handlePrint} disabled={rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
              <Printer size={15}/> พิมพ์
            </button>
            <button onClick={handleExport} disabled={exporting || rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
              {exporting ? <RefreshCcw size={15} className="animate-spin"/> : <FileDown size={15}/>} Excel
            </button>
            <button onClick={onClose} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition-colors">
              รับทราบ
            </button>
          </div>
        </div>
      </div>
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
  { header: 'บริษัท',      key: 'supplier' },
  { header: 'นโยบายเปลี่ยนยา', key: 'swapPolicy' },
  { header: 'คงเหลือ',     key: 'qty' },
  { header: 'หน่วย',       key: 'unit' },
  // สถานะดำเนินการคืนบริษัท — ให้กระดาษ/ไฟล์บอกได้ว่าตัวไหนตามแล้ว (ตรงกับ dropdown ในโมดอล)
  { header: 'ดำเนินการ',   value: r => SWAP_ACTION_STATUS[r.actionStatus] || SWAP_ACTION_STATUS.pending },
  { header: 'วันที่ดำเนินการ', value: r => swapFmtDeadline(r.actionDate) },
];

// รายละเอียดจากประวัติรับยา (receive_logs) — กางใต้ card/row ในโมดอลใกล้หมดอายุ
// details = แถว receive_logs ที่ match (จาก fetchDrugDetails); scope บอกความแคบของ match
// strict display: การ์ดบิลเต็มเฉพาะ scope 'code_lot_exp' (บิลของ ยา+lot+EXP นี้จริง — ใช้อ้างอิงแจ้งหัวหน้าได้)
// scope กว้างกว่า = ไม่ใช่หลักฐานของ lot นี้ → บอก "ไม่พบ" ตรงๆ; ถ้า lot ตรงแต่ EXP ไม่ตรง/ไม่ระบุ
// ใบ้เลขที่บิลให้ผู้ใช้ไป verify เองในระบบประวัติรับยา (ข้อมูลผิดบิลอันตรายกว่าไม่มีข้อมูล)
function ReceiveHistoryDetail({ details = [], scope = 'code_lot' }) {
  const fmtDate = (iso) => {
    if (!iso || iso === '-') return '-';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()+543}`;
  };
  // EXP ตาม log — แสดง พ.ศ. ให้เทียบกับ EXP บนรายการได้ทันที; ว่าง = "ไม่ระบุ"
  const fmtLogExp = (raw) => (raw && String(raw).trim() && raw !== '-') ? swapFmtExp(raw) : 'ไม่ระบุ';
  const exact = scope === 'code_lot_exp' && details.length > 0;
  const NEAR_MISS_CAP = 5; // lot '-' (เวชภัณฑ์) บิลเยอะ — ใบ้พอให้ตามหา ไม่ flood
  return (
    <div className="py-2.5 space-y-2.5">
      <p className="text-[11px] font-bold text-teal-700 dark:text-teal-300 uppercase tracking-wide flex items-center gap-1.5 flex-wrap">
        ประวัติรับยา (จาก Log คลัง)
        {exact && (
          <span className="font-semibold normal-case text-emerald-600 inline-flex items-center gap-1">
            <ShieldCheck size={12} /> ตรงกับ lot + EXP รายการนี้
          </span>
        )}
      </p>
      {exact ? details.map((d, idx) => (
        <div key={idx} className="rounded-lg border border-teal-100 dark:border-teal-900/50 bg-teal-50 dark:bg-teal-950/40 p-2.5">
          {details.length > 1 && (
            <p className="text-[11px] text-teal-600 font-medium mb-1.5">บิล {idx + 1}/{details.length} — {d._invoice || '-'}</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
            {[
              { label: 'วันที่รับยา',     val: fmtDate(d.receive_date) },
              { label: 'จำนวนที่รับ',     val: d.qty_received != null ? String(d.qty_received) : '-' },
              { label: 'เลขที่บิล',       val: d._invoice || '-' },
              { label: 'Lot (ตาม log)',   val: d._lot || '-' },
              { label: 'EXP (ตาม log)',   val: fmtLogExp(d._exp) },
              { label: 'เลขที่ PO',       val: d.po_number || '-' },
              { label: 'บริษัทปัจจุบัน',  val: d.supplier_current || d._company || '-' },
              { label: 'บริษัทก่อนหน้า',  val: d.supplier_prev || '-' },
              { label: 'ราคา/หน่วย',      val: d.price_per_unit != null ? String(d.price_per_unit) : '-' },
              { label: 'สถานะตรวจรับ',    val: d.receive_status || '-' },
              { label: 'วันที่ตรวจรับ',   val: fmtDate(d.inspect_date) },
              { label: 'สถานะการซื้อ',    val: d.purchase_type || '-' },
            ].map(({ label, val }) => (
              <div key={label} className="flex flex-col">
                <span className="text-[10px] font-semibold text-teal-600">{label}</span>
                <span className="text-slate-700 dark:text-slate-200">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )) : (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-rose-600">
            {details.length ? 'ไม่พบบิลของ lot/EXP รายการนี้ในประวัติรับยา' : 'ไม่พบข้อมูลในประวัติรับยา'}
          </p>
          {scope === 'code_lot' && details.length > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-2.5 space-y-1">
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                พบบิลของ lot นี้ {details.length} ใบ แต่ EXP ใน log ไม่ตรง/ไม่ระบุ — โปรดตรวจสอบบิลในระบบประวัติรับยาก่อนใช้อ้างอิง
              </p>
              <ul className="space-y-0.5">
                {details.slice(0, NEAR_MISS_CAP).map((d, idx) => (
                  <li key={idx} className="text-[11px] text-slate-700 dark:text-slate-200">
                    เลขที่บิล <span className="font-semibold">{d._invoice || '-'}</span> · EXP ใน log: {fmtLogExp(d._exp)} · รับ {fmtDate(d.receive_date)}
                  </li>
                ))}
                {details.length > NEAR_MISS_CAP && (
                  <li className="text-[11px] text-slate-500 dark:text-slate-400">… และอีก {details.length - NEAR_MISS_CAP} ใบ</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExpiryAlertSection({ expiring = [], onClose, auth }) {
  const [filter, setFilter]     = React.useState('all'); // all | expired | soon30 | soon90 | soon180 | soon16m
  const [zoneFilter, setZoneFilter] = React.useState('all'); // โซนที่เก็บ A/B/C ... (จาก location prefix)
  const [search, setSearch]     = React.useState('');
  const [expanded, setExpanded] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [drugDetails, setDrugDetails] = React.useState(null); // receive_logs detail — เติมบริษัท/นโยบายเปลี่ยนยา (เหมือนโมดอลระบบแผนผัง)
  const [swapPolicies, setSwapPolicies] = React.useState({}); // นโยบายคืนยาต่อบริษัท — คิด deadline คืนบริษัท (เหมือนโมดอลระบบแผนผัง)
  const [returnBannerOpen, setReturnBannerOpen] = React.useState(false); // banner "ต้องเปลี่ยน/คืนบริษัท" กาง/ยุบ
  const [timePillsOpen, setTimePillsOpen] = React.useState(false); // พับ pill กรองช่วงเวลาไว้ก่อน คลิกแล้วกาง (ลดความรก — pattern เดียวกับโมดอลระบบแผนผัง)
  const [zonePillsOpen, setZonePillsOpen] = React.useState(false); // พับ pill กรองโซนไว้ก่อน
  const [swapFlagged, setSwapFlagged] = React.useState({});   // { [flagKey]: true } — lot ที่กด "แจ้งหัวหน้า" แล้ว (กันกดซ้ำในเซสชัน)
  const [expandedRow, setExpandedRow] = React.useState(null); // flagKey ของ card ที่กางดูประวัติรับยา (คลิกทีละใบ)
  const [isMobile, setIsMobile] = React.useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  React.useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  // โหลด drugDetails + นโยบายคืนยา ตอนเปิดโมดอลเท่านั้น (query receive_logs ทั้งหมด — หนัก จึง lazy)
  const [swapActions, setSwapActions] = React.useState({});   // code|lot|company → สถานะดำเนินการคืนบริษัท (ลง Excel/พิมพ์ด้วย)
  React.useEffect(() => {
    fetchDrugDetails().then(setDrugDetails).catch(() => setDrugDetails(null));
    fetchSwapPolicies().then(setSwapPolicies).catch(() => setSwapPolicies({}));
    fetchSwapReturnActions().then(setSwapActions).catch(() => setSwapActions({}));
  }, []);

  if (expiring.length === 0) return null;

  // เติมบริษัท + นโยบายเปลี่ยนยา + โซน จาก drugDetails (ตรรกะเดียวกับโมดอลระบบแผนผัง App.jsx)
  const lookupDetail = (item) => {
    if (!drugDetails) return null;
    const code = (item.code || '-').trim().toLowerCase();
    const lot  = (item.lot  || '-').trim().toLowerCase();
    const all  = Object.values(drugDetails);
    // 1) match รหัส+lot เป๊ะ  2) fallback: match แค่รหัสยา — บริษัท/นโยบายเป็นคุณสมบัติระดับรหัส
    //    (lot ใน inventory มักไม่มีใน receive_logs → เดิมว่างทั้งคู่พร้อมกัน)
    return all.find(d => (d._code || '').toLowerCase() === code && (d._lot || '').toLowerCase() === lot)
        || all.find(d => (d._code || '').toLowerCase() === code)
        || null;
  };
  const buildSwapPolicy = (d) => {
    if (!d) return '';
    const parts = [];
    if (d._drug_swap_policy && d._drug_swap_policy !== '-') parts.push(d._drug_swap_policy);
    if (d.supplier_changed && d.supplier_changed !== '-')   parts.push(d.supplier_changed);
    return parts.join(' | ');
  };
  const zoneOf = (r) => {
    const m = (r.location || '').trim().toUpperCase().match(/^([A-Z]+)/);
    return m ? m[1] : '-';
  };
  // ประวัติรับยา — ใช้ helper กลาง matchReceiveDetails (ชุดเดียวกับ SwapReturnPopup)
  // เพื่อให้ข้อมูลประวัติรับสัมพันธ์กับการแจ้งเตือนทุกจุด
  const allDetailsFor = (item) => matchReceiveDetails(drugDetails, item);
  // บริษัทของ lot นี้ (unique) — ใช้คิด deadline; กำกวม (lot เดียวคนละบริษัท) → คืน '' ไม่ประเมิน
  const supplierForLot = (item) => {
    const dets = allDetailsFor(item).rows;
    let found = '';
    for (const d of dets) {
      const co = (d.supplier_current || d._company || '').trim();
      if (!co || co === '-') continue;
      if (!found) found = co;
      else if (found !== co) return '';
    }
    return found;
  };
  // นโยบายคืนยา: บริษัทของ lot → policy → deadline ต้องคืนก่อนหมดอายุ (ADR-0012, ตรรกะเดียวกับ App.jsx)
  const buildReturnInfo = (lotSupplier, item) => {
    const pol = lotSupplier ? swapPolicies[lotSupplier] : null;
    if (!pol) return null;
    const exp = item.expDate instanceof Date ? item.expDate : null;
    if (!exp || isNaN(exp)) return { ...pol, status: 'no_policy', deadline: null, daysToDeadline: null };
    const r = computeReturnStatus({ exp, months: pol.returnMonths, today: new Date() });
    return { ...pol, ...r };
  };
  const enriched = expiring.map(item => {
    const d = lookupDetail(item);
    const lotSupplier = supplierForLot(item);
    const det = allDetailsFor(item);
    // สถานะดำเนินการคืนบริษัท — key เดียวกับ fetchSwapReturnDue (code|lot|company)
    const act = swapActions[swapActionKey(item.code, item.lot, lotSupplier || d?.supplier_current || '')] || null;
    return {
      ...item,
      supplier: d?.supplier_current || d?._company || '',
      swapPolicy: buildSwapPolicy(d),
      zone: zoneOf(item),
      returnInfo: buildReturnInfo(lotSupplier, item),
      details: det.rows,
      detailScope: det.scope,
      actionStatus: act?.status || 'pending',
      actionDate: act?.action_date || null,
    };
  });

  // ค้นชื่อยา / รหัส / เลขบิล (invoice ไม่มีใน expiring — ค้นจาก name/code)
  const q = search.trim().toLowerCase();
  const searched = q
    ? enriched.filter(r => (r.name || '').toLowerCase().includes(q) || (r.code || '').toLowerCase().includes(q))
    : enriched;

  // filter โซนที่เก็บ (นับจาก searched เพื่อให้ตัวเลข chip ตรงกับที่ค้นเจอ)
  const zoneGroups = (() => {
    const map = new Map();
    searched.forEach(r => map.set(r.zone, (map.get(r.zone) || 0) + 1));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
  })();
  const zoneScoped = zoneFilter !== 'all' ? searched.filter(r => r.zone === zoneFilter) : searched;

  const filtered = zoneScoped.filter(r => {
    if (filter === 'expired') return r.daysLeft < 0;
    if (filter === 'soon30')  return r.daysLeft >= 0 && r.daysLeft < 30;
    if (filter === 'soon90')  return r.daysLeft >= 30 && r.daysLeft < 90;
    if (filter === 'soon180') return r.daysLeft >= 90 && r.daysLeft < 180;
    if (filter === 'soon16m') return r.daysLeft >= 180;
    return true;
  });

  // นับจาก zoneScoped (หลัง search+zone) เพื่อให้ตัวเลขบน tab ตรงกับที่ตารางแสดง
  const allCount     = zoneScoped.length;
  const expiredCount = zoneScoped.filter(r => r.daysLeft < 0).length;
  const soon30Count  = zoneScoped.filter(r => r.daysLeft >= 0 && r.daysLeft < 30).length;
  const soon90Count  = zoneScoped.filter(r => r.daysLeft >= 30 && r.daysLeft < 90).length;
  const soon180Count = zoneScoped.filter(r => r.daysLeft >= 90 && r.daysLeft < 180).length;
  const soon16mCount = zoneScoped.filter(r => r.daysLeft >= 180).length;

  const fmtExp = (raw) => {
    if (!raw || raw === '-') return '-';
    return raw;
  };

  const rowColor = (daysLeft) => {
    if (daysLeft < 0)   return 'bg-red-50 dark:bg-red-950/40 border-red-100 dark:border-red-900/50';
    if (daysLeft < 30)  return 'bg-orange-50 dark:bg-orange-950/40 border-orange-100 dark:border-orange-900/50';
    if (daysLeft < 90)  return 'bg-yellow-50 dark:bg-yellow-950/40 border-yellow-100 dark:border-yellow-900/50';
    if (daysLeft < 180) return 'bg-lime-50 dark:bg-lime-950/40 border-lime-100 dark:border-lime-900/50';
    return 'bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/50';
  };

  const badgeColor = (daysLeft) => {
    if (daysLeft < 0)   return 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/60';
    if (daysLeft < 30)  return 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-900/60';
    if (daysLeft < 90)  return 'bg-yellow-100 dark:bg-yellow-950/60 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-900/60';
    if (daysLeft < 180) return 'bg-lime-100 dark:bg-lime-950/60 text-lime-700 dark:text-lime-300 border-lime-200 dark:border-lime-900/60';
    return 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/60';
  };

  const daysLabel = (daysLeft) => {
    if (daysLeft < 0)  return `หมดอายุแล้ว ${Math.abs(daysLeft)} วัน`;
    if (daysLeft === 0) return 'หมดอายุวันนี้';
    return `อีก ${daysLeft} วัน`;
  };

  // ── นโยบายคืนยา (ADR-0012): badge + banner + แจ้งหัวหน้า — ตรรกะเดียวกับโมดอลระบบแผนผัง ──
  const flagKeyOf = (r) => `${(r.code||'-')}|${(r.lot||'-')}|${(r.location||'-')}`;
  const returnBadge = (ri) => {
    if (!ri) return null;
    if (ri.differsByItem) return { text: 'ต้องเช็กเอกสาร', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700' };
    if (ri.canReturn === false) return { text: 'บริษัทไม่รับคืน', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' };
    if (ri.status === 'overdue') return { text: 'พ้นกำหนดคืน', cls: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60' };
    if (ri.status === 'due')     return { text: `ต้องคืนใน ${ri.daysToDeadline} วัน`, cls: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300' };
    if (ri.status === 'ok' && ri.returnMonths != null) return { text: `คืนก่อน ${ri.returnMonths} ด.`, cls: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60' };
    return null;
  };
  // รายการที่ต้องเด้ง banner = due/overdue (คืนได้ + ไม่กำกวม)
  const dueReturns = enriched.filter(r =>
    r.returnInfo && !r.returnInfo.differsByItem && r.returnInfo.canReturn !== false &&
    (r.returnInfo.status === 'due' || r.returnInfo.status === 'overdue')
  );
  const fmtThaiDate = (d) => d ? `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()+543}` : '-';
  const handleFlagReturn = async (r) => {
    const ri = r.returnInfo;
    try {
      await flagSwapReturn({
        drugCode: r.code, drugName: r.name, lot: r.lot, company: r.supplier,
        returnMonths: ri?.returnMonths, deadline: ri?.deadline ? ri.deadline.toISOString().slice(0,10) : null,
        daysLeft: ri?.daysToDeadline,
      }, auth);
      setSwapFlagged(prev => ({ ...prev, [flagKeyOf(r)]: true }));
    } catch { /* เงียบ — banner ยังคงอยู่ ผู้ใช้ลองใหม่ได้ */ }
  };

  const displayed = expanded ? filtered : filtered.slice(0, 8);

  const handleExport = async () => {
    setExporting(true);
    try {
      const tabLabel = filter === 'all' ? 'ทั้งหมด' : filter === 'expired' ? 'หมดอายุแล้ว' : filter === 'soon30' ? '30วัน' : filter === 'soon90' ? '1-3เดือน' : filter === 'soon180' ? '3-6เดือน' : '6-16เดือน';
      await exportToExcel(filtered, EXPIRY_EXCEL_COLS, 'ยาใกล้หมดอายุ', `expiry_alert_${tabLabel}_${new Date().toISOString().slice(0,10)}.xlsx`, auth);
    } finally { setExporting(false); }
  };

  // พิมพ์จาก filtered ชุดเดียวกับตาราง/Excel (Rule #6) + ระบุตัวกรองบนหัวกระดาษ
  // ไม่งั้นกระดาษที่พิมพ์ตอนกรองอยู่ ดูเหมือนเป็นรายการทั้งหมด
  const handlePrint = () => {
    const notes = [];
    if (search) notes.push(`คำค้น "${search}"`);
    if (zoneFilter !== 'all') notes.push(`โซน ${zoneFilter}`);
    if (filter !== 'all') {
      notes.push(`ช่วงเวลา ${({ expired: 'หมดอายุแล้ว', soon30: 'ภายใน 30 วัน', soon90: '1–3 เดือน', soon180: '3–6 เดือน', soon16m: '6–16 เดือน' })[filter] || filter}`);
    }
    // แปลง label ที่นี่ — trackingPrint.js ใช้ร่วมกับ App.jsx จึงไม่ควร import ค่าคงที่จาก db เข้าไป
    const forPrint = filtered.map(r => ({
      ...r,
      actionLabel: SWAP_ACTION_STATUS[r.actionStatus] || SWAP_ACTION_STATUS.pending,
      actionDateLabel: r.actionDate ? swapFmtDeadline(r.actionDate) : '-',
    }));
    printTrackingList(forPrint, {
      title: 'แจ้งเตือนยาใกล้หมดอายุ',
      dashboardMode: true,
      filterNote: notes.length ? `ตัวกรอง: ${notes.join(' · ')}` : '',
      printedBy: auth?.name || auth?.username || '',
    });
  };

  const inner = (
    <div className={`bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl shadow-sm overflow-hidden flex flex-col ${onClose ? 'max-h-[90vh]' : 'mt-5'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/60 shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-500" />
          <span className="font-bold text-red-800 dark:text-red-300 text-sm">แจ้งเตือนยาใกล้หมดอายุ</span>
          <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {expiring.length} รายการ
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handlePrint} disabled={filtered.length === 0}
            title="พิมพ์รายการที่กรองอยู่"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors">
            <Printer size={12}/>
            <span className="hidden sm:inline">พิมพ์</span>
          </button>
          <button onClick={handleExport} disabled={exporting || filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors">
            {exporting ? <RefreshCcw size={12} className="animate-spin"/> : <FileDown size={12}/>}
            {exporting ? 'กำลังส่งออก...' : 'Excel'}
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-red-100 dark:hover:bg-red-950/60 rounded-lg transition-colors">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Banner: ต้องเปลี่ยน/คืนบริษัทก่อนพ้นกำหนด (ADR-0012) — เหมือนโมดอลระบบแผนผัง */}
      {dueReturns.length > 0 && (
        <div className="px-5 py-2.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 shrink-0">
          <button onClick={() => setReturnBannerOpen(v => !v)} className="w-full flex items-center gap-2.5 text-left">
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
            <span className="text-sm font-bold text-amber-800 dark:text-amber-300 min-w-0 flex-1">
              มี {dueReturns.length} รายการต้องเปลี่ยน/คืนบริษัทก่อนพ้นกำหนด
              <span className="font-normal text-amber-700 dark:text-amber-300"> — แจ้งหัวหน้าให้ดำเนินการก่อนตกหล่น</span>
            </span>
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 shrink-0">{returnBannerOpen ? 'ซ่อน' : 'ดูรายการ'}</span>
            <ChevronDown size={16} className={`text-amber-600 shrink-0 transition-transform ${returnBannerOpen ? 'rotate-180' : ''}`} />
          </button>
          {returnBannerOpen && (
            <div className="mt-2 space-y-1.5 max-h-52 overflow-auto">
              {dueReturns.slice(0, 30).map((r) => {
                const flagged = swapFlagged[flagKeyOf(r)];
                const isOpen = expandedRow === flagKeyOf(r);
                return (
                  <div key={flagKeyOf(r)} className="bg-white/70 dark:bg-slate-900/70 rounded-lg border border-amber-200 dark:border-amber-900/60 overflow-hidden">
                    <div onClick={() => setExpandedRow(isOpen ? null : flagKeyOf(r))}
                      className="flex items-center gap-2 flex-wrap px-2.5 py-1.5 cursor-pointer hover:bg-amber-50/60 dark:hover:bg-amber-950/50">
                      <ChevronDown size={13} className={`text-amber-600 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${r.returnInfo.status === 'overdue' ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300'}`}>
                        {r.returnInfo.status === 'overdue' ? 'พ้นกำหนด' : `เหลือ ${r.returnInfo.daysToDeadline} วัน`}
                      </span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{r.name}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">Lot {r.lot} · {r.location || '-'}</span>
                      {(() => {
                        // คลังรับ = วันที่รับล่าสุดจากประวัติที่ match — ไม่โชว์ถ้าเป็นข้อมูลระดับรหัส (คนละ lot)
                        if (r.detailScope === 'code_only') return null;
                        const ts = r.details.map(d => Date.parse(d.receive_date)).filter(t => !isNaN(t));
                        return ts.length ? <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">คลังรับ {fmtThaiDate(new Date(Math.max(...ts)))}</span> : null;
                      })()}
                      {r.exp && r.exp !== '-' && <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">EXP {swapFmtExp(r.exp)}</span>}
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 shrink-0">คงเหลือ {r.qty}{r.unit ? ` (${r.unit})` : ''}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">{r.supplier || 'ไม่ทราบบริษัท'}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">ต้องคืนภายใน {fmtThaiDate(r.returnInfo.deadline)}</span>
                      {flagged ? (
                        <span className="ml-auto text-[11px] font-semibold text-emerald-600 shrink-0">แจ้งหัวหน้าแล้ว</span>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); handleFlagReturn(r); }}
                          className="ml-auto text-[11px] font-semibold bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded-md transition-colors shrink-0">
                          แจ้งหัวหน้า
                        </button>
                      )}
                    </div>
                    {isOpen && <div className="px-2.5 border-t border-amber-200 dark:border-amber-900/60"><ReceiveHistoryDetail details={r.details} scope={r.detailScope} /></div>}
                  </div>
                );
              })}
              {dueReturns.length > 30 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 pt-1">และอีก {dueReturns.length - 30} รายการ (ดูในตารางด้านล่าง)</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search bar */}
      <div className="px-5 pt-3">
        <DrugSearchBar
          value={search}
          onChange={setSearch}
          options={(() => {
            const seen = new Map();
            expiring.forEach(item => { if (item.name && !seen.has(item.name)) seen.set(item.name, item.type || ''); });
            return [...seen.entries()].map(([name, type]) => ({ name, type }));
          })()}
          placeholder="ค้นหาชื่อยา, รหัสยา..."
          ringClass="focus:ring-red-400"
          hoverClass="hover:bg-red-50 dark:hover:bg-red-950/50"
          maxResults={20}
          inputClassName="py-2 bg-slate-50 dark:bg-slate-800"
        />
      </div>

      {/* ตัวกรอง (ช่วงเวลา + โซน) — พับเป็นปุ่มเลือก คลิกแล้วค่อยกาง (ลดความรก — pattern เดียวกับโมดอลระบบแผนผัง) */}
      {(() => {
        const TIME_TABS = [
          { key: 'all',     label: 'ทั้งหมด',          count: allCount,         active: 'bg-slate-700 text-white' },
          { key: 'expired', label: 'หมดอายุแล้ว',       count: expiredCount,     active: 'bg-red-600 text-white' },
          { key: 'soon30',  label: 'ภายใน 30 วัน',      count: soon30Count,      active: 'bg-orange-500 text-white' },
          { key: 'soon90',  label: '1–3 เดือน',          count: soon90Count,      active: 'bg-yellow-500 text-white' },
          { key: 'soon180', label: '3–6 เดือน',          count: soon180Count,     active: 'bg-lime-500 text-white' },
          { key: 'soon16m', label: '6–16 เดือน',         count: soon16mCount,     active: 'bg-blue-500 text-white' },
        ];
        const curTime = TIME_TABS.find(t => t.key === filter) || TIME_TABS[0];
        return (
          <>
            <div className="flex flex-wrap gap-2 px-5 pt-3 pb-1">
              <button onClick={() => setTimePillsOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                <Filter size={13} />
                ช่วงเวลา
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${filter !== 'all' ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                  {curTime.label} · {curTime.count}
                </span>
                {timePillsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {zoneGroups.length > 1 && (
                <button onClick={() => setZonePillsOpen(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                  <Filter size={13} />
                  กรองตามโซน
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${zoneFilter !== 'all' ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                    {zoneFilter === 'all' ? 'ทั้งหมด' : zoneFilter}
                  </span>
                  {zonePillsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              )}
            </div>
            {timePillsOpen && (
              <div className="flex gap-2 px-5 pt-1 pb-1 overflow-x-auto">
                {TIME_TABS.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => { setFilter(tab.key); setExpanded(false); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
                      filter === tab.key
                        ? tab.active + ' border-transparent shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {tab.label}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      filter === tab.key ? 'bg-white/30 text-inherit' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}>{tab.count}</span>
                  </button>
                ))}
              </div>
            )}
            {zonePillsOpen && zoneGroups.length > 1 && (
              <div className="flex gap-2 px-5 pt-1 pb-1 overflow-x-auto">
                <button onClick={() => { setZoneFilter('all'); setExpanded(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
                    zoneFilter === 'all' ? 'bg-red-600 text-white border-transparent shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}>
                  ทั้งหมด
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${zoneFilter === 'all' ? 'bg-white/30 text-inherit' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{searched.length}</span>
                </button>
                {zoneGroups.map(([zone, n]) => (
                  <button key={zone} onClick={() => { setZoneFilter(zone); setExpanded(false); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
                      zoneFilter === zone ? 'bg-red-600 text-white border-transparent shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}>
                    {zone}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${zoneFilter === zone ? 'bg-white/30 text-inherit' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{n}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        );
      })()}

      {/* Table (desktop) / Card list (mobile) */}
      {filtered.length === 0 ? (
        <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-6">ไม่มีรายการในหมวดนี้</p>
      ) : isMobile ? (
        <div className="overflow-y-auto p-3 space-y-2" style={{ maxHeight: onClose ? 'calc(90vh - 200px)' : 'calc(100vh - 420px)' }}>
          {displayed.map((r, i) => {
            const rb = returnBadge(r.returnInfo);
            const isOpen = expandedRow === flagKeyOf(r);
            return (
            <div key={i} className={`border rounded-xl p-3 ${rowColor(r.daysLeft)}`}>
              <button type="button" onClick={() => setExpandedRow(isOpen ? null : flagKeyOf(r))} className="w-full text-left">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-tight">{r.name || '-'}</p>
                    {r.code && r.code !== '-' && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{r.code}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor(r.daysLeft)}`}>
                      {daysLabel(r.daysLeft)}
                    </span>
                    {rb && <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${rb.cls}`}>{rb.text}</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mt-2 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                  <div><span className="text-slate-400 dark:text-slate-500">ชนิด:</span> <span className="text-slate-700 dark:text-slate-200 font-medium">{r.type || '-'}</span></div>
                  <div><span className="text-slate-400 dark:text-slate-500">ตำแหน่ง:</span> <span className="text-slate-700 dark:text-slate-200 font-medium">{r.location || '-'}</span></div>
                  <div><span className="text-slate-400 dark:text-slate-500">Lot:</span> <span className="text-slate-700 dark:text-slate-200">{r.lot || '-'}</span></div>
                  <div><span className="text-slate-400 dark:text-slate-500">Exp:</span> <span className="text-slate-700 dark:text-slate-200">{fmtExp(r.exp)}</span></div>
                  {/* วงเล็บครอบหน่วย — "1 500เม็ด" อ่านเป็น 1,500 ได้ ต้องเป็น "1 (500เม็ด)" (ล้อ pattern ที่ใช้อยู่แล้วในไฟล์นี้) */}
                  <div className="col-span-2"><span className="text-slate-400 dark:text-slate-500">คงเหลือ:</span> <span className="text-slate-800 dark:text-slate-100 font-bold">{r.qty || '-'}</span>{r.unit ? <span className="text-slate-500 dark:text-slate-400"> ({r.unit})</span> : null}</div>
                  {r.supplier && (
                    <div className="col-span-2"><span className="text-slate-400 dark:text-slate-500">บริษัท:</span> <span className="text-slate-700 dark:text-slate-200">{r.supplier}</span></div>
                  )}
                  {r.swapPolicy && (
                    <div className="col-span-2"><span className="text-slate-400 dark:text-slate-500">นโยบายเปลี่ยนยา:</span> <span className="text-slate-700 dark:text-slate-200">{r.swapPolicy}</span></div>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-red-600">
                  <ChevronDown size={13} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  {isOpen ? 'ซ่อนประวัติรับยา' : 'ดูประวัติรับยา'}
                </div>
              </button>
              {isOpen && <ReceiveHistoryDetail details={r.details} scope={r.detailScope} />}
            </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-auto" style={{ maxHeight: onClose ? 'calc(90vh - 200px)' : 'calc(100vh - 420px)' }}>
          <table className="w-full text-xs min-w-[860px]">
            <thead className="sticky top-0 z-20">
              <tr className="text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800">
                <th className="px-4 py-2 text-left bg-slate-50 dark:bg-slate-800">ชื่อยา</th>
                <th className="px-4 py-2 text-left bg-slate-50 dark:bg-slate-800">ชนิด</th>
                <th className="px-4 py-2 text-left bg-slate-50 dark:bg-slate-800">ตำแหน่ง</th>
                <th className="px-4 py-2 text-left bg-slate-50 dark:bg-slate-800">Lot</th>
                <th className="px-4 py-2 text-center bg-slate-50 dark:bg-slate-800">วันหมดอายุ</th>
                <th className="px-4 py-2 text-center bg-slate-50 dark:bg-slate-800">สถานะ</th>
                <th className="px-4 py-2 text-left bg-slate-50 dark:bg-slate-800">บริษัท</th>
                <th className="px-4 py-2 text-left bg-slate-50 dark:bg-slate-800">นโยบายเปลี่ยนยา</th>
                <th className="px-4 py-2 text-right bg-slate-50 dark:bg-slate-800">คงเหลือ</th>
                <th className="px-4 py-2 text-left bg-slate-50 dark:bg-slate-800">หน่วย</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((r, i) => {
                const rb = returnBadge(r.returnInfo);
                const isOpen = expandedRow === flagKeyOf(r);
                return (
                <React.Fragment key={i}>
                <tr onClick={() => setExpandedRow(isOpen ? null : flagKeyOf(r))}
                  className={`border-b cursor-pointer hover:brightness-95 ${rowColor(r.daysLeft)}`}>
                  <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100 max-w-[200px]">
                    <span className="flex items-center gap-1">
                      <ChevronDown size={13} className={`text-slate-400 dark:text-slate-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      <span className="truncate">{r.name || '-'}</span>
                    </span>
                    {r.code && r.code !== '-' && (
                      <span className="text-slate-400 dark:text-slate-500 font-normal pl-[18px] block">{r.code}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{r.type || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 font-medium">{r.location || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{r.lot || '-'}</td>
                  <td className="px-4 py-2.5 text-center font-medium text-slate-700 dark:text-slate-200">{fmtExp(r.exp)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgeColor(r.daysLeft)}`}>
                        {daysLabel(r.daysLeft)}
                      </span>
                      {rb && <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${rb.cls}`}>{rb.text}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200 text-xs max-w-[160px] truncate" title={r.supplier || '-'}>{r.supplier || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 text-xs max-w-[220px]" title={r.swapPolicy || '-'}>
                    <span className="line-clamp-2 leading-snug">{r.swapPolicy || '-'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-700 dark:text-slate-200">{r.qty || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{r.unit || '-'}</td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td colSpan={10} className="px-4 py-0 bg-slate-50 dark:bg-slate-800">
                      <ReceiveHistoryDetail details={r.details} scope={r.detailScope} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Show more / less */}
      {filtered.length > 8 && (
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-center shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
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
    <div className={`bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-2xl shadow-sm overflow-hidden flex flex-col ${onClose ? 'max-h-[90vh]' : 'mt-4'}`}>
      <div className="flex items-center justify-between px-5 py-3.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle size={18} className="text-amber-500" />
          <span className="font-bold text-amber-800 dark:text-amber-300 text-sm truncate">แจ้งเตือน Stock ต่ำกว่ากำหนด</span>
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
            <button onClick={onClose} className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-amber-100 dark:hover:bg-amber-950/60 rounded-lg transition-colors">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight: onClose ? 'calc(90vh - 160px)' : 'calc(100vh - 420px)' }}>
        <table className="w-full text-xs min-w-[520px]">
          <thead className="sticky top-0 z-20">
            <tr className="text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800">
              <th className="px-4 py-2 text-left bg-slate-50 dark:bg-slate-800">ชื่อยา</th>
              <th className="px-4 py-2 text-left bg-slate-50 dark:bg-slate-800">ชนิด</th>
              <th className="px-4 py-2 text-left bg-slate-50 dark:bg-slate-800">ตำแหน่ง</th>
              <th className="px-4 py-2 text-right bg-slate-50 dark:bg-slate-800">คงเหลือ</th>
              <th className="px-4 py-2 text-left bg-slate-50 dark:bg-slate-800">หน่วย</th>
              <th className="px-4 py-2 text-right bg-slate-50 dark:bg-slate-800">Safety Stock</th>
              <th className="px-4 py-2 text-left bg-slate-50 dark:bg-slate-800">ระดับ</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((r, i) => {
              const pct      = Math.min(100, r.ratio * 100);
              const isEmpty  = r.qty === 0;
              const barColor = isEmpty ? 'bg-red-500' : pct < 30 ? 'bg-orange-400' : 'bg-amber-400';
              return (
                <tr key={i} className={`border-b border-slate-100 dark:border-slate-800 transition-colors ${isEmpty ? 'bg-red-50 dark:bg-red-950/40' : 'hover:bg-amber-50 dark:hover:bg-amber-950/50'}`}>
                  <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100 max-w-[200px]">
                    <span className="block truncate">{r.name}</span>
                    {r.code && r.code !== '-' && <span className="text-slate-400 dark:text-slate-500 font-normal">{r.code}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{r.type || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 font-medium">{r.location || '-'}</td>
                  <td className={`px-4 py-2.5 text-right font-bold ${isEmpty ? 'text-red-600' : 'text-amber-700 dark:text-amber-300'}`}>
                    {r.qty.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{r.unit || '-'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">{r.safety_stock.toLocaleString()}</td>
                  <td className="px-4 py-2.5 min-w-[100px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                        <div className={`${barColor} h-2 rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0 w-8 text-right">
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
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-center shrink-0">
          <button onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
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

// พิมพ์รายการคงเหลือในคลัง — Blob URL (iOS-safe) + fallback <a> click (WebView LINE/FB) ตาม Critical Rule #4
function printStockSummary(rows, uploadInfo) {
  const esc = (s) => String(s ?? '-').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const d = new Date();
  const today = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()+543}`;
  const uploadTxt = uploadInfo?.updated_at
    ? new Date(uploadInfo.updated_at).toLocaleString('th-TH', { day:'numeric', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '-';
  const body = rows.map((r, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td class="c">${esc(r.code && r.code !== '-' ? r.code : '')}</td>
      <td>${esc(r.name)}</td>
      <td class="c">${esc(r.type)}</td>
      <td class="r">${Number(r.totalQty || 0).toLocaleString()}</td>
      <td>${esc(r.mainUnit)}${r.hasMultipleUnits ? ' *' : ''}</td>
      <td class="c">${Number(r.lotCount || 0)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>รายการคงเหลือในคลัง</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #1e293b; background: #fff; padding: 16px 24px; }
  @page { size: A4 portrait; margin: 10mm; }
  .h-row { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 6px; }
  h1 { font-size: 20px; font-weight: 700; }
  .sub { font-size: 12px; color: #334155; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  th { background: #f1f5f9; font-weight: 700; padding: 5px 6px; text-align: center; border: 1px solid #000; }
  td { padding: 4px 6px; border: 1px solid #94a3b8; }
  tr:nth-child(even) td { background: #f8fafc; }
  td.c { text-align: center; } td.r { text-align: right; font-weight: 700; }
  thead { display: table-header-group; }
  .foot { margin-top: 10px; font-size: 11px; color: #64748b; }
</style></head><body>
<div class="h-row">
  <h1>รายการคงเหลือในคลัง</h1>
  <p class="sub">ทั้งหมด ${rows.length} รายการ · ข้อมูลอัพโหลด ${esc(uploadTxt)}</p>
</div>
<table>
  <thead><tr>
    <th style="width:5%;">ลำดับ</th>
    <th style="width:12%;">รหัสยา</th>
    <th style="width:38%;">ชื่อยา</th>
    <th style="width:12%;">ประเภท</th>
    <th style="width:12%;">คงเหลือ</th>
    <th style="width:13%;">หน่วย</th>
    <th style="width:8%;">Lot</th>
  </tr></thead>
  <tbody>${body}</tbody>
</table>
<p class="foot">พิมพ์เมื่อ ${today} · * = มีหลายหน่วย (ปัดเศษขึ้น) · ยาตัดออกจากบัญชีไม่แสดง</p>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) { setTimeout(() => URL.revokeObjectURL(url), 30000); return; }
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ---- Stock Summary Modal ----
function StockSummaryModal({ onClose, auth = {} }) {
  const [rows, setRows]             = React.useState([]);
  const [discontinued, setDiscontinued] = React.useState([]);   // ยาตัดออกจากบัญชี (ไม่อยู่ในตาราง)
  const [loading, setLoading]       = React.useState(true);
  const [search, setSearch]         = React.useState('');
  const [drugNames, setDrugNames]   = React.useState([]);
  const [error, setError]           = React.useState('');
  const [exporting, setExporting]   = React.useState(false);
  const [uploadInfo, setUploadInfo] = React.useState(null);
  const [isMobile, setIsMobile]     = React.useState(() => window.innerWidth < 768);
  const [sortBy, setSortBy]         = React.useState(null); // null | { key: 'name'|'lot'|'qty', dir: 'asc'|'desc' }
  const [expanded, setExpanded]     = React.useState(() => new Set()); // key ยาที่กางดูราย lot

  const toggleExpand = (key) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

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
      setDiscontinued(summary.discontinued || []);
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

  // ยาตัดออกที่ตรงกับคำค้น — เตือนเฉพาะตอนค้น (ไม่ค้น = ไม่ต้องรก)
  const discontinuedHits = React.useMemo(() => {
    if (!search) return [];
    const t = search.toLowerCase();
    return discontinued.filter(d =>
      (d.name || '').toLowerCase().includes(t) || (d.code || '').toLowerCase().includes(t)
    );
  }, [discontinued, search]);

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
      <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-5xl flex flex-col min-h-[60vh] sm:min-h-0" style={{ maxHeight: '95vh' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 bg-sky-50 dark:bg-sky-950/40 rounded-t-2xl shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Package size={18} className="text-sky-600" />
              <span className="font-bold text-slate-800 dark:text-slate-100">จำนวนคงเหลือในคลัง</span>
              {!loading && <span className="bg-sky-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{rows.length} รายการ</span>}
              {search && <span className="text-xs text-slate-500 dark:text-slate-400">· แสดง {filtered.length}</span>}
            </div>
            {uploadInfo && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                <Clock size={10}/> อัพโหลด: {new Date(uploadInfo.updated_at).toLocaleString('th-TH', { day:'numeric', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                {uploadInfo.file_name && <span className="text-slate-300 dark:text-slate-500 hidden sm:inline">· {uploadInfo.file_name}</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => printStockSummary(sortedFiltered, uploadInfo)} disabled={filtered.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors">
              <Printer size={12}/> พิมพ์
            </button>
            <button onClick={handleExport} disabled={exporting || filtered.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors">
              {exporting ? <RefreshCcw size={12} className="animate-spin"/> : <Database size={12}/>}
              {exporting ? 'กำลังส่งออก...' : 'Excel'}
            </button>
            <button onClick={load} className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-sky-600 hover:bg-sky-100 dark:hover:bg-sky-950/60 rounded-lg transition-colors" title="รีเฟรช">
              <RefreshCcw size={15}/>
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors">
              <X size={18}/>
            </button>
          </div>
        </div>

        {/* DrugSearchBar */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0 space-y-3">
          <DrugSearchBar
            value={search}
            onChange={setSearch}
            options={drugNames}
            placeholder="ค้นหาชื่อยา หรือรหัสยา..."
            ringClass="focus:ring-sky-400"
            hoverClass="hover:bg-sky-50 dark:hover:bg-sky-950/50"
          />
          {/* ยาตัดออกไม่อยู่ในตาราง (กรองที่ fetchStockSummary) → ค้นแล้วขึ้น "ไม่พบรายการ" เฉยๆ
              ต้องบอกเหตุผลให้ตรงกับระบบแผนผังคลังยา ไม่งั้นคนนึกว่ายาหายจากระบบ
              ไม่มีปุ่มปิด — ต้องค้างไว้ตราบใดที่ยังค้นคำนี้ (ผู้ใช้ขอ: กันพลาดสั่งซื้อซ้ำ) */}
          {discontinuedHits.length > 0 && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-900/70 rounded-xl p-3.5">
              <div className="flex items-start gap-2.5">
                <span className="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 shrink-0">
                  <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-rose-800 dark:text-rose-300 text-sm">
                    ยานี้ถูกตัดออกจากบัญชีแล้ว — ไม่มีการสั่งซื้อเพิ่ม
                  </p>
                  <ul className="mt-1.5 space-y-0.5">
                    {discontinuedHits.map(d => (
                      <li key={d.code || d.name} className="text-xs text-rose-700 dark:text-rose-300 flex flex-wrap items-center gap-x-2">
                        <span className="font-semibold">{d.name}</span>
                        {d.code && <span className="text-rose-500 dark:text-rose-400">({d.code})</span>}
                        <span className="text-rose-600 dark:text-rose-400">คงเหลือ {d.totalQty.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
                    กรุณา<span className="font-bold">แจ้งหัวหน้าให้ปิด code ยาใน HosXP</span> เพื่อไม่ให้มีการเบิก/สั่งซื้อรายการนี้อีก
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Table — sticky header + frozen ชื่อยา */}
        <div className="overflow-auto flex-1 rounded-b-2xl">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 dark:text-slate-500">
              <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mr-3"/>
              กำลังคำนวณคงเหลือ...
            </div>
          ) : error ? (
            <div className="text-center py-10 text-red-500 text-sm px-6">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-sm">
              {discontinuedHits.length > 0 ? 'ไม่มีรายการคงเหลือที่ตรงกับคำค้น' : 'ไม่พบรายการ'}
            </div>
          ) : isMobile ? (
            /* ── Mobile card list ── */
            <div className="divide-y divide-slate-100">
              {sortedFiltered.map((r, i) => {
                const rowKey = r.code || r.name || i;
                const isOpen = expanded.has(rowKey);
                const lots = r.lots || [];
                return (
                <div key={rowKey}>
                  <div onClick={() => lots.length > 0 && toggleExpand(rowKey)}
                    className={`px-4 py-3 flex items-center gap-3 ${lots.length > 0 ? 'cursor-pointer active:bg-sky-50' : ''}`}>
                    {lots.length > 0 && (isOpen
                      ? <ChevronDown size={16} className="text-sky-500 shrink-0"/>
                      : <ChevronRight size={16} className="text-slate-300 dark:text-slate-500 shrink-0"/>)}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-snug truncate">{r.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {r.code && r.code !== '-' && <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{r.code}</span>}
                        <DrugTypeBadge type={r.type} />
                        {r.hasMultipleUnits && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60">~หลายหน่วย</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-sky-700 dark:text-sky-300 leading-tight">{r.totalQty.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">{r.mainUnit} · {r.lotCount} Lot</p>
                    </div>
                  </div>
                  {isOpen && lots.length > 0 && (
                    <div className="bg-sky-50 dark:bg-sky-950/40 px-4 pb-2.5 pt-1 space-y-1">
                      {lots.map((l, li) => (
                        <div key={`${rowKey}-lot-${li}`} className="flex items-center justify-between text-xs pl-6">
                          <div className="min-w-0">
                            <span className="text-slate-400 dark:text-slate-500">Lot </span>
                            <span className="font-mono text-slate-700 dark:text-slate-200">{l.lot || '—'}</span>
                            {l.exp && <span className="text-slate-400 dark:text-slate-500 ml-2">EXP {l.exp}</span>}
                          </div>
                          <div className="shrink-0 text-slate-600 dark:text-slate-300">
                            <span className="font-semibold text-sky-700 dark:text-sky-300">{l.qty.toLocaleString()}</span> {l.unit}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          ) : (
            /* ── Desktop table ── */
            <table className="w-full text-sm min-w-[560px]">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 sticky left-0 z-30 shadow-[2px_0_4px_rgba(0,0,0,0.06)] whitespace-nowrap">
                    <button onClick={() => cycleSort('name')} className="flex items-center gap-1 hover:text-sky-600 transition-colors">
                      ชื่อยา
                      <span className="flex flex-col leading-none">
                        <ChevronUp  size={9} className={sortBy?.key==='name' && sortBy.dir==='asc'  ? 'text-sky-600' : 'text-slate-300 dark:text-slate-500'}/>
                        <ChevronDown size={9} className={sortBy?.key==='name' && sortBy.dir==='desc' ? 'text-sky-600' : 'text-slate-300 dark:text-slate-500'}/>
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 whitespace-nowrap">ประเภท</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 whitespace-nowrap">
                    <button onClick={() => cycleSort('qty')} className="flex items-center gap-1 ml-auto hover:text-sky-600 transition-colors">
                      คงเหลือ
                      <span className="flex flex-col leading-none">
                        <ChevronUp  size={9} className={sortBy?.key==='qty' && sortBy.dir==='asc'  ? 'text-sky-600' : 'text-slate-300 dark:text-slate-500'}/>
                        <ChevronDown size={9} className={sortBy?.key==='qty' && sortBy.dir==='desc' ? 'text-sky-600' : 'text-slate-300 dark:text-slate-500'}/>
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 whitespace-nowrap">หน่วย</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 whitespace-nowrap">
                    <button onClick={() => cycleSort('lot')} className="flex items-center gap-1 mx-auto hover:text-sky-600 transition-colors">
                      LOT
                      <span className="flex flex-col leading-none">
                        <ChevronUp  size={9} className={sortBy?.key==='lot' && sortBy.dir==='asc'  ? 'text-sky-600' : 'text-slate-300 dark:text-slate-500'}/>
                        <ChevronDown size={9} className={sortBy?.key==='lot' && sortBy.dir==='desc' ? 'text-sky-600' : 'text-slate-300 dark:text-slate-500'}/>
                      </span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedFiltered.map((r, i) => {
                  const rowKey = r.code || r.name || i;
                  const isOpen = expanded.has(rowKey);
                  const lots = r.lots || [];
                  return (
                  <React.Fragment key={rowKey}>
                  <tr onClick={() => lots.length > 0 && toggleExpand(rowKey)}
                    className={`border-b border-slate-100 dark:border-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950/50 transition-colors ${lots.length > 0 ? 'cursor-pointer' : ''} ${i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/40'}`}>
                    <td className="px-4 py-2.5 sticky left-0 z-10 bg-inherit shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                      <div className="flex items-center gap-1.5">
                        {lots.length > 0 && (isOpen
                          ? <ChevronDown size={14} className="text-sky-500 shrink-0"/>
                          : <ChevronRight size={14} className="text-slate-300 dark:text-slate-500 shrink-0"/>)}
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-100 leading-snug">{r.name}</p>
                          {r.code && r.code !== '-' && <p className="text-[10px] text-slate-400 dark:text-slate-500">{r.code}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><DrugTypeBadge type={r.type}/></td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.hasMultipleUnits && (
                          <span title={`มีหลายหน่วย: ${r.units.join(', ')} — ปัดเศษขึ้นแล้ว`}
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 cursor-help whitespace-nowrap">
                            ~หลายหน่วย
                          </span>
                        )}
                        <span className="font-bold text-sky-700 dark:text-sky-300">{r.totalQty.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">{r.mainUnit}</td>
                    <td className="px-4 py-2.5 text-center text-slate-400 dark:text-slate-500 text-xs">{r.lotCount}</td>
                  </tr>
                  {isOpen && lots.map((l, li) => (
                    <tr key={`${rowKey}-lot-${li}`} className="border-b border-slate-100 dark:border-slate-800 bg-sky-50 dark:bg-sky-950/40 text-xs">
                      <td className="px-4 py-1.5 pl-10 sticky left-0 z-10 bg-sky-50 dark:bg-sky-950/40 text-slate-600 dark:text-slate-300">
                        <span className="text-slate-400 dark:text-slate-500">Lot: </span>
                        <span className="font-mono text-slate-700 dark:text-slate-200">{l.lot || '—'}</span>
                      </td>
                      <td className="px-4 py-1.5 text-slate-400 dark:text-slate-500">
                        {l.exp ? <><span className="text-slate-400 dark:text-slate-500">EXP </span>{l.exp}</> : '—'}
                      </td>
                      <td className="px-4 py-1.5 text-right font-semibold text-sky-700 dark:text-sky-300">{l.qty.toLocaleString()}</td>
                      <td className="px-4 py-1.5 text-slate-500 dark:text-slate-400">{l.unit}</td>
                      <td className="px-4 py-1.5"></td>
                    </tr>
                  ))}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 rounded-b-2xl shrink-0">
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
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${up ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40' : 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40'}`}>
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

const CHART_RANGES = [
  { key: 3,     label: '3 เดือน' },
  { key: 6,     label: '6 เดือน' },
  { key: 12,    label: '12 เดือน' },
  { key: 'all', label: 'ทั้งหมด' },
];

// ตัวเลือกช่วงเปรียบเทียบ — คุมทั้งกราฟเบิกจ่ายและกราฟรับเข้า (มาจาก fetchDashboardCharts เดียวกัน)
// months = จำนวนเดือน/ทั้งหมด · endYm = เดือนสิ้นสุด (dropdown; ปิดเมื่อเลือกทั้งหมด)
function RangeSelector({ months, onChange, endYm, onChangeEndYm, monthRange = [], loading }) {
  const isAll = months === 'all';
  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {/* dropdown เลือกเดือนสิ้นสุด — ปิดเมื่อ "ทั้งหมด" (กางตั้งแต่แรกสุด ไม่ต้องเลือกสิ้นสุด) */}
      {monthRange.length > 0 && (
        <select
          value={isAll ? '' : (endYm || '')}
          onChange={e => onChangeEndYm(e.target.value || null)}
          disabled={loading || isAll}
          title="เลือกเดือนสิ้นสุดของช่วงเปรียบเทียบ"
          className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed">
          <option value="">ถึงเดือนล่าสุด</option>
          {monthRange.map(m => <option key={m.ym} value={m.ym}>ถึง {m.label}</option>)}
        </select>
      )}
      <div className="inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
        {CHART_RANGES.map(r => (
          <button key={r.key} type="button" onClick={() => onChange(r.key)} disabled={loading}
            className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 ${months === r.key ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DashboardCharts({ charts, months = 6, onChangeMonths, endYm, onChangeEndYm, monthRange = [], lowStock = [], onOpenReorder, onOpenDispense, onOpenReceive }) {
  const [showTrendLine, setShowTrendLine] = React.useState(true); // เส้นเปรียบเทียบแนวโน้มบนกราฟรับเข้า
  const loading = charts == null;
  const { dispense = [], receive = [], trend = {}, maxValueMonth = null, maxReceiveValueMonth = null } = charts || {};
  const hasData = dispense.some(d => d.value > 0) || receive.some(r => r.value > 0);
  const top5 = lowStock.slice(0, 5);
  const dispenseTotal = dispense.reduce((s, d) => s + (d.value || 0), 0);
  const receiveTotal = receive.reduce((s, r) => s + (r.value || 0), 0);

  return (
    <div className="mt-4 space-y-4">
      {/* Hero panel — การเบิกจ่ายรายเดือน (เลขรวม + area chart) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600"><Activity size={15} /></div>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">การเบิกจ่ายรายเดือน</span>
            {months === 'all' && dispense.length > 0 && <span className="text-xs text-slate-400 dark:text-slate-500">({dispense.length} เดือน)</span>}
          </div>
          <RangeSelector months={months} onChange={onChangeMonths} endYm={endYm} onChangeEndYm={onChangeEndYm} monthRange={monthRange} loading={loading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-5 items-center">
          {/* เลขเด่นซ้าย */}
          <div className="lg:pr-6 lg:border-r lg:border-slate-100">
            <p className="text-4xl font-black text-slate-800 dark:text-slate-100 leading-none">{fmtBaht(dispenseTotal)}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">มูลค่าเบิกจ่ายรวม (บาท)</p>
            <div className="flex items-center gap-2 mt-3">
              <TrendBadge pct={trend.dispensePct} />
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {trend.dispenseLabels?.cur ? `${trend.dispenseLabels.cur} เทียบ ${trend.dispenseLabels.prev}` : 'เทียบเดือนก่อน'}
              </span>
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
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              เดือน <span className="font-bold text-indigo-700 dark:text-indigo-300">{maxValueMonth.label}</span> มูลค่าเบิกสูงสุด <span className="font-bold text-slate-700 dark:text-slate-200">{fmtBaht(maxValueMonth.value)}</span>
            </p>
            <button onClick={onOpenDispense} className="text-xs text-[#1E90FF] hover:underline font-semibold inline-flex items-center gap-0.5">
              ดูรายการยาที่มูลค่าสูงสุด <ArrowRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Panel รอง — รับเข้ารายเดือน (มูลค่าบาท, bar) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-600"><Package size={15} /></div>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">มูลค่าการรับเข้ารายเดือน</span>
            {receiveTotal > 0 && <span className="text-xs text-slate-400 dark:text-slate-500">รวม {fmtBaht(receiveTotal)}</span>}
          </div>
          <div className="flex items-center gap-2">
            {/* toggle เส้นเปรียบเทียบแนวโน้ม — ให้ user เลือกเปิด/ปิดได้ */}
            <button onClick={() => setShowTrendLine(v => !v)}
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border transition-colors ${showTrendLine ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900/60 text-sky-700 dark:text-sky-300' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
              title={showTrendLine ? 'ซ่อนเส้นเปรียบเทียบ' : 'แสดงเส้นเปรียบเทียบ'}>
              <TrendingUp size={13} /> เส้นเปรียบเทียบ
            </button>
            <TrendBadge pct={trend.receivePct} />
            {trend.receiveLabels?.cur && <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline">{trend.receiveLabels.cur} เทียบ {trend.receiveLabels.prev}</span>}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={170}>
          <ComposedChart data={receive} margin={{ top: showTrendLine ? 20 : 5, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} tickFormatter={fmtBahtShort} />
            <Tooltip formatter={(v) => [fmtBaht(v), 'มูลค่ารับเข้า']} cursor={{ fill: '#f8fafc' }} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="value" fill="#7dd3fc" radius={[6, 6, 0, 0]} maxBarSize={40} />
            {/* เส้นแนวโน้ม — toggle ได้: เปิดแล้วโชว์เส้น + จุดทุกเดือน + ตัวเลขมูลค่ากำกับ (default ซ่อนให้กราฟโล่ง) */}
            {showTrendLine && (
              <Line type="monotone" dataKey="value" stroke="#0284c7" strokeWidth={1.5} dot={{ r: 3, fill: '#0284c7', strokeWidth: 0 }} activeDot={{ r: 4, fill: '#0284c7' }}>
                <LabelList dataKey="value" position="top" offset={8} formatter={fmtBahtShort} style={{ fontSize: 10, fill: '#0369a1', fontWeight: 600 }} />
              </Line>
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* คำสรุป: เดือนรับเข้ามูลค่าสูงสุด + ลิงก์ไปประวัติรับยา */}
        {maxReceiveValueMonth && maxReceiveValueMonth.value > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              เดือน <span className="font-bold text-sky-700 dark:text-sky-300">{maxReceiveValueMonth.label}</span> รับเข้ามูลค่าสูงสุด <span className="font-bold text-slate-700 dark:text-slate-200">{fmtBaht(maxReceiveValueMonth.value)}</span>
            </p>
            <button onClick={onOpenReceive} className="text-xs text-[#1E90FF] hover:underline font-semibold inline-flex items-center gap-0.5">
              ดูประวัติรับเข้า <ArrowRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* ตารางยาต้องสั่งซื้อ (Top 5) */}
      {top5.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600"><ShoppingCart size={15} /></div>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">ยาต้องสั่งซื้อ</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">ต่ำกว่า Safety Stock</span>
            </div>
            <button onClick={onOpenReorder} className="text-xs text-[#1E90FF] hover:underline font-semibold inline-flex items-center gap-0.5">
              ดูทั้งหมด <ArrowRight size={13} />
            </button>
          </div>

          {/* Desktop: ตาราง */}
          <table className="hidden sm:table w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-2 font-semibold">ชื่อยา</th>
                <th className="px-4 py-2 font-semibold text-right">คงเหลือ</th>
                <th className="px-4 py-2 font-semibold text-left">หน่วย</th>
                <th className="px-4 py-2 font-semibold text-right">Safety Stock</th>
                <th className="px-4 py-2 font-semibold text-right">เบิก 3 เดือน</th>
                <th className="px-4 py-2 font-semibold text-right">% ของ SS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {top5.map((r, i) => (
                <tr key={r.code || i} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-slate-700 dark:text-slate-200 leading-tight">{r.name || r.code}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{r.code}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-red-600 whitespace-nowrap">{Number(r.qty).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-left text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{r.unit || '-'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{Number(r.safety_stock).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap" title="มีการเบิกกี่สัปดาห์ จาก 13 สัปดาห์ล่าสุด · และยอดรวมที่ใช้ไป">
                    {r.usageWeeks > 0 ? (
                      <>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">เบิก {r.usageWeeks}/13 สัปดาห์</span>
                        <span className="block text-slate-500 dark:text-slate-400">รวม {Number(r.usage3m).toLocaleString()}</span>
                      </>
                    ) : <span className="text-slate-300 dark:text-slate-500">—</span>}
                  </td>
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
                    <p className="font-semibold text-slate-700 dark:text-slate-200 leading-tight truncate">{r.name || r.code}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{r.code}</p>
                  </div>
                  <span className="text-xs font-semibold text-amber-600 shrink-0">{Math.round(r.ratio * 100)}% ของ SS</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  คงเหลือ <span className="font-bold text-red-600">{Number(r.qty).toLocaleString()}</span>{r.unit ? <span className="text-slate-400 dark:text-slate-500"> ({r.unit})</span> : ''} / SS {Number(r.safety_stock).toLocaleString()}{r.unit ? ` (${r.unit})` : ''}
                </p>
                {r.usageWeeks > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="text-slate-400 dark:text-slate-500">เบิก</span> <span className="font-semibold text-slate-600 dark:text-slate-300">{r.usageWeeks}/13 สัปดาห์</span>
                    <span className="text-slate-400 dark:text-slate-500"> · รวม </span><span className="font-semibold text-slate-600 dark:text-slate-300">{Number(r.usage3m).toLocaleString()}{r.unit ? ` (${r.unit})` : ''}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasData && top5.length === 0 && (
        <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-4">ยังไม่มีข้อมูลสำหรับแสดงกราฟ</p>
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
      // paginate ครบทุก row (ข้าม 1000-row limit) + กรองยา 'ตัดออกจากบัญชี' ออก
      // ให้ตรงกับ "รายการยาในคลังจริง" — pattern เดียวกับ fetchDashboardAlerts (Rule #2/#13)
      fetchAllInventoryRows('code, receive_status'),
      supabase.from('requisitions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    const uniqueDrugs = new Set(
      (inv || [])
        .filter(r => r.code && !String(r.receive_status || '').includes('ตัดออก'))
        .map(r => r.code)
    ).size;
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
      color: 'text-sky-700 dark:text-sky-300', cardBg: 'bg-white dark:bg-slate-900', borderColor: 'border-slate-200 dark:border-slate-700', labelColor: 'text-slate-500 dark:text-slate-400',
      iconBg: 'bg-sky-100 dark:bg-sky-950/60 text-sky-600',
      onClick: onOpenStock,
    },
    {
      label: 'ใบเบิกรอดำเนินการ',
      value: typeof stats.pending === 'number' ? stats.pending : 0,
      icon: ClipboardList,
      color:       stats.pending > 0 ? 'text-amber-700 dark:text-amber-300'   : 'text-slate-700 dark:text-slate-200',
      cardBg:      'bg-white dark:bg-slate-900',
      borderColor: stats.pending > 0 ? 'border-amber-200 dark:border-amber-900/60' : 'border-slate-200 dark:border-slate-700',
      labelColor:  'text-slate-500 dark:text-slate-400',
      iconBg:      stats.pending > 0 ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
      onClick: stats.pending > 0 ? onOpenRequisition : undefined,
    },
    {
      label: expiredCount > 0 ? `ยาหมดอายุแล้ว ${expiredCount} + ใกล้หมด` : 'ยาใกล้หมดอายุ (16 เดือน)',
      value: expiryCount,
      icon: AlertTriangle,
      color:       expiryCount > 0 ? (expiredCount > 0 ? 'text-red-700 dark:text-red-300' : 'text-orange-700 dark:text-orange-300')   : 'text-slate-700 dark:text-slate-200',
      cardBg:      'bg-white dark:bg-slate-900',
      borderColor: expiryCount > 0 ? (expiredCount > 0 ? 'border-red-200 dark:border-red-900/60' : 'border-orange-200 dark:border-orange-900/60') : 'border-slate-200 dark:border-slate-700',
      labelColor:  'text-slate-500 dark:text-slate-400',
      iconBg:      expiryCount > 0 ? (expiredCount > 0 ? 'bg-red-100 dark:bg-red-950/60 text-red-600' : 'bg-orange-100 dark:bg-orange-950/60 text-orange-600') : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
      onClick: expiryCount > 0 ? onOpenExpiry : undefined,
    },
  ];

  const staffItems = [
    {
      label: 'Stock ต่ำกว่ากำหนด',
      value: lowStockCount,
      icon: ShoppingCart,
      color:       lowStockCount > 0 ? 'text-amber-700 dark:text-amber-300'   : 'text-slate-700 dark:text-slate-200',
      cardBg:      'bg-white dark:bg-slate-900',
      borderColor: lowStockCount > 0 ? 'border-amber-200 dark:border-amber-900/60' : 'border-slate-200 dark:border-slate-700',
      labelColor:  'text-slate-500 dark:text-slate-400',
      iconBg:      lowStockCount > 0 ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
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
            {item.onClick && !item.subLabel && <p className="text-[10px] mt-1.5 text-slate-400 dark:text-slate-500 text-left">กดเพื่อดูรายละเอียด</p>}
          </>
        );
        return item.onClick
          ? <button key={item.label} onClick={item.onClick} className={`${cls} text-left`}>{content}</button>
          : <div key={item.label} className={cls}>{content}</div>;
      })}
    </div>
  );
}
