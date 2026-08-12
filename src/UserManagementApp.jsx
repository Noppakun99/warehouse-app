import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Plus, Pencil, Trash2, X,
  User, Shield, ShieldCheck, Eye, EyeOff, RefreshCcw,
  CheckCircle, XCircle, KeyRound, Users, ShieldPlus, MoreVertical,
} from 'lucide-react';
import {
  fetchAppUsers, createAppUser, updateAppUser,
  deleteAppUser, changeAppUserPassword, updateUserPermissions,
} from './lib/db';
import BackButton from './BackButton';
import { useSort, SortableTh } from './SortableTable';

const ROLE_CONFIG = {
  requester: { label: 'ผู้เบิก',          badge: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800/60',   icon: User      },
  staff:     { label: 'เจ้าหน้าที่คลัง', badge: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60', icon: Shield },
  admin:     { label: 'ผู้ดูแลระบบ',      badge: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-800/60',   icon: ShieldCheck },
};

// ประเภทผู้ใช้ (แสดงในตาราง)
const USER_TYPE = {
  requester: { label: 'ผู้ใช้งานทั่วไป',    color: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-900/60' },
  staff:     { label: 'เจ้าหน้าที่คลังยา', color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60' },
  admin:     { label: 'เจ้าหน้าที่คลังยา', color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60' },
};

// ระบบที่ admin สามารถ grant เพิ่มให้ผู้ใช้แต่ละคนได้ (ยกเว้น users ที่เป็น admin-only)
const GRANTABLE_SYSTEMS = [
  { key: 'inventory',  label: 'แผนผังคลังยา',        color: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300', defaultRoles: ['requester','staff','admin'] },
  { key: 'requisition',label: 'เบิกยาออนไลน์',       color: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300',    defaultRoles: ['requester','staff','admin'] },
  { key: 'receive',    label: 'ประวัติรับเข้าคลัง',  color: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300', defaultRoles: ['requester','staff','admin'] },
  { key: 'dispense',   label: 'ประวัติเบิกยา',       color: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',    defaultRoles: ['requester','staff','admin'] },
  { key: 'return',     label: 'คืนยา',               color: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300', defaultRoles: ['requester','staff','admin'] },
  { key: 'audit',      label: 'Audit Log',            color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',  defaultRoles: ['staff','admin'] },
  { key: 'analytics',  label: 'วิเคราะห์การเบิกยา', color: 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300',    defaultRoles: ['requester','staff','admin'] },
  { key: 'reorder',    label: 'วิเคราะห์การสั่งซื้อ', color: 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300', defaultRoles: ['staff','admin'] },
  { key: 'ledger',     label: 'ทะเบียนคงคลัง',       color: 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300',    defaultRoles: ['admin'] },
  { key: 'stockcount', label: 'ตรวจนับคงคลัง',       color: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300', defaultRoles: ['staff','admin'] },
  { key: 'stockcard',  label: 'Stockcard',            color: 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300',    defaultRoles: ['requester','staff','admin'] },
  { key: 'loan',       label: 'ยืม-คืนยาระหว่าง รพ.', color: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',       defaultRoles: ['requester','staff','admin'] },
];

// สรุปสิทธิ์ต่อ user — นับจาก GRANTABLE_SYSTEMS (แหล่งเดียวกับโมดอลสิทธิ์) ไม่ใช่ลิสต์แยก
// admin เห็นทุกระบบอยู่แล้ว → บอกเป็นคำ ไม่นับเลข (จัดการผู้ใช้เป็น admin-only grant รายคนไม่ได้ จึงไม่อยู่ในลิสต์)
function summarizeAccess(user) {
  const base  = GRANTABLE_SYSTEMS.filter(s => s.defaultRoles.includes(user.role));
  const extra = (user.permissions || [])
    .map(key => GRANTABLE_SYSTEMS.find(s => s.key === key))
    .filter(s => s && !s.defaultRoles.includes(user.role));
  return {
    baseLabel: user.role === 'admin' ? 'ทุกระบบ' : `สิทธิ์มาตรฐาน (${base.length} ระบบ)`,
    extra,
  };
}

// avatar ตัวอักษรแรก — app_users ไม่มีคอลัมน์รูป จึงใช้อักษรย่อ + สีตาม role
const AVATAR_COLOR = {
  requester: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
  staff:     'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
  admin:     'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300',
};

const DEPARTMENTS = [
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

function RoleBadge({ role }) {
  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.requester;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
      <Icon size={11}/> {cfg.label}
    </span>
  );
}

function PasswordInput({ value, onChange, placeholder = 'รหัสผ่าน', required = false }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value} onChange={onChange}
        placeholder={placeholder} required={required}
        className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 pr-10 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
        {show ? <EyeOff size={16}/> : <Eye size={16}/>}
      </button>
    </div>
  );
}

// ============================================================
// UserManagementApp
// ============================================================
export default function UserManagementApp({ auth, onGoBack, canGoBack }) {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [suspendedOnly, setSuspendedOnly] = useState(false);
  const [toast, setToast] = useState('');

  // Modal state
  const [modal, setModal] = useState(null); // null | 'create' | 'edit' | 'password' | 'delete'
  const [target, setTarget] = useState(null); // user object being edited
  const [saving, setSaving]  = useState(false);
  const [error, setError]    = useState('');

  // Form fields
  const [fUsername,   setFUsername]   = useState('');
  const [fPassword,   setFPassword]   = useState('');
  const [fConfirm,    setFConfirm]    = useState('');
  const [fFullName,   setFFullName]   = useState('');
  const [fDepartment, setFDepartment] = useState('');
  const [fRole,         setFRole]         = useState('requester');
  const [fActive,       setFActive]       = useState(true);
  const [fSuspendMode,  setFSuspendMode]  = useState('active'); // 'active' | 'temp' | 'perm'
  const [fSuspendUntil, setFSuspendUntil] = useState('');
  const [fShowPw,       setFShowPw]       = useState(true);
  const [pwSaved,       setPwSaved]       = useState(''); // รหัสผ่านที่บันทึกสำเร็จ — เพื่อ copy ส่งให้ user
  const [copied,        setCopied]        = useState(false);
  const [fPermissions, setFPermissions] = useState([]);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const clearToast = useCallback(() => setToast(''), []);

  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await fetchAppUsers()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setFUsername(''); setFPassword(''); setFConfirm('');
    setFFullName(''); setFDepartment(''); setFRole('requester'); setFActive(true);
    setError(''); setModal('create');
  };
  const openEdit = (u) => {
    setTarget(u);
    setFFullName(u.full_name); setFDepartment(u.department || '');
    setFRole(u.role); setFActive(u.is_active);
    if (u.is_active) {
      setFSuspendMode('active'); setFSuspendUntil('');
    } else if (u.suspend_until) {
      setFSuspendMode('temp');
      setFSuspendUntil(u.suspend_until.slice(0, 16)); // datetime-local format
    } else {
      setFSuspendMode('perm'); setFSuspendUntil('');
    }
    setError(''); setModal('edit');
  };
  const openPassword    = (u) => { setTarget(u); setFPassword(''); setFShowPw(true); setPwSaved(''); setCopied(false); setError(''); setModal('password'); };
  const openDelete      = (u) => { setTarget(u); setError(''); setModal('delete'); };
  const openPermissions = (u) => { setTarget(u); setFPermissions(u.permissions || []); setError(''); setModal('permissions'); };
  const closeModal      = () => { setModal(null); setTarget(null); setError(''); setPwSaved(''); setCopied(false); };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (fPassword !== fConfirm) { setError('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน'); return; }
    if (fPassword.length < 6)   { setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    setSaving(true); setError('');
    try {
      await createAppUser({ username: fUsername, password: fPassword, full_name: fFullName, department: fDepartment, role: fRole });
      await load(); closeModal(); setToast(`สร้างบัญชี "${fUsername}" แล้ว`);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (target.id === auth.id && fRole !== 'admin') { setError('ไม่สามารถเปลี่ยน role ของตัวเองออกจาก admin ได้'); return; }
    if (fSuspendMode === 'temp' && !fSuspendUntil) { setError('กรุณาระบุวันเวลาสิ้นสุดการระงับ'); return; }
    const isActive = fSuspendMode === 'active';
    const suspendUntil = fSuspendMode === 'temp' ? new Date(fSuspendUntil).toISOString() : null;
    setSaving(true); setError('');
    try {
      const name = target.username;
      await updateAppUser(target.id, { full_name: fFullName, department: fDepartment, role: fRole, is_active: isActive, suspend_until: suspendUntil });
      await load(); closeModal(); setToast(`แก้ไข "${name}" แล้ว`);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    if (fPassword.length < 6) { setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    setSaving(true); setError('');
    try {
      await changeAppUserPassword(target.id, fPassword);
      setPwSaved(fPassword); // เก็บไว้แสดงให้ copy — ไม่ปิด modal
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (target.id === auth.id) { setError('ไม่สามารถลบบัญชีของตัวเองได้'); return; }
    setSaving(true); setError('');
    try {
      const name = target.username;
      await deleteAppUser(target.id);
      await load(); closeModal(); setToast(`ลบบัญชี "${name}" แล้ว`);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const handlePermissions = async () => {
    setSaving(true); setError('');
    try {
      const name = target.username;
      await updateUserPermissions(target.id, fPermissions);
      await load(); closeModal(); setToast(`บันทึกสิทธิ์ของ "${name}" แล้ว`);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const togglePerm = (key) => {
    setFPermissions(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const fmtDate = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()+543}`;
  };

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (u.department || '').toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole && (!suspendedOnly || !u.is_active);
  });

  const suspendedCount = users.filter(u => !u.is_active).length;

  // เรียงตารางฝั่ง client (users โหลดครบใน state) — default = ลำดับจาก server (created_at ล่าสุด)
  const { sorted, sort, toggleSort } = useSort(filtered, {});

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800 font-sans">
      {/* Title bar — sidebar (AppShell) คุม navigation แล้ว header เดิมเหลือแค่ title + refresh */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3 flex items-center gap-3">
        <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
        <div className="p-1.5 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 shrink-0"><Users size={18}/></div>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-base leading-tight text-slate-800 dark:text-slate-100">จัดการผู้ใช้งาน</h1>
          <p className="text-slate-400 dark:text-slate-500 text-xs">สร้าง แก้ไข และลบบัญชีผู้ใช้</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="รีเฟรช">
          <RefreshCcw size={16}/>
        </button>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อผู้ใช้ ชื่อ-สกุล หน่วยงาน..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400"/>
          </div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            className="border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400">
            <option value="all">ทุก Role</option>
            <option value="requester">ผู้เบิก</option>
            <option value="staff">เจ้าหน้าที่คลัง</option>
            <option value="admin">ผู้ดูแลระบบ</option>
          </select>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors shadow-sm">
            <Plus size={15}/> เพิ่มผู้ใช้
          </button>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
          {/* หัวตาราง: จำนวนผู้ใช้ + ป้ายระงับ (โผล่เมื่อมีจริง — กดกรองได้) */}
          <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">ผู้ใช้ทั้งหมด</h2>
            <span className="text-base font-semibold text-slate-400 dark:text-slate-500 tabular-nums">{users.length}</span>
            {suspendedCount > 0 && (
              <button type="button" onClick={() => setSuspendedOnly(v => !v)}
                title={suspendedOnly ? 'แสดงผู้ใช้ทั้งหมด' : 'กรองเฉพาะที่ถูกระงับ'}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                  suspendedOnly
                    ? 'bg-red-600 text-white'
                    : 'bg-red-50 dark:bg-red-950/40 text-red-600 border border-red-200 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-950/70'
                }`}>
                <XCircle size={11}/> ระงับ {suspendedCount}
              </button>
            )}
            {suspendedOnly && (
              <button type="button" onClick={() => setSuspendedOnly(false)}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline">
                ล้างตัวกรอง
              </button>
            )}
          </div>
          {loading ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">กำลังโหลด...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
              <Users size={32} className="mx-auto mb-2 opacity-30"/>
              ไม่พบผู้ใช้งาน
            </div>
          ) : isMobile ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sorted.map(u => {
                const t = USER_TYPE[u.role] || USER_TYPE.requester;
                return (
                  <div key={u.id} className={`p-4 space-y-2.5 ${!u.is_active ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <UserCell user={u} isSelf={u.id === auth.id}/>
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${t.color}`}>{t.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                      {u.department && <span>{u.department}</span>}
                      {u.is_active
                        ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 px-2 py-0.5 rounded-full"><CheckCircle size={10}/>ใช้งานได้</span>
                        : u.suspend_until
                          ? <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 px-2 py-0.5 rounded-full"><XCircle size={10}/>ระงับชั่วคราว</span>
                          : <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-2 py-0.5 rounded-full"><XCircle size={10}/>ระงับถาวร</span>
                      }
                    </div>
                    <AccessCell user={u}/>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(u)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 active:bg-slate-50">
                        <Pencil size={12}/> แก้ไข
                      </button>
                      <RowMenu
                        onPermissions={() => openPermissions(u)}
                        onPassword={() => openPassword(u)}
                        onDelete={() => openDelete(u)}
                        disableDelete={u.id === auth.id}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
              <table className="w-full text-sm min-w-[900px]">
                <thead className="sticky top-0 z-10">
                  <tr className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                    <SortableTh sortKey="username" label="ผู้ใช้" sort={sort} onSort={toggleSort} className="px-4 py-3.5 bg-slate-50 dark:bg-slate-800/95" activeColor="text-violet-600" />
                    <SortableTh sortKey="department" label="หน่วยงาน" sort={sort} onSort={toggleSort} className="px-4 py-3.5 bg-slate-50 dark:bg-slate-800/95" activeColor="text-violet-600" />
                    <th className="px-4 py-3.5 text-center bg-slate-50 dark:bg-slate-800/95">ประเภทผู้ใช้</th>
                    <th className="px-4 py-3.5 text-left bg-slate-50 dark:bg-slate-800/95">สิทธิ์ระบบ</th>
                    <th className="px-4 py-3.5 text-center bg-slate-50 dark:bg-slate-800/95">สถานะ</th>
                    <SortableTh sortKey="created_at" label="วันที่สมัคร" align="center" sort={sort} onSort={toggleSort} className="px-4 py-3.5 bg-slate-50 dark:bg-slate-800/95" activeColor="text-violet-600" />
                    <th className="px-4 py-3.5 text-center bg-slate-50 dark:bg-slate-800/95">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(u => {
                    const t = USER_TYPE[u.role] || USER_TYPE.requester;
                    return (
                      <tr key={u.id} className={`border-b border-slate-50 hover:bg-violet-50 dark:hover:bg-violet-950/50 transition-colors ${!u.is_active ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3"><UserCell user={u} isSelf={u.id === auth.id}/></td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-xs">{u.department || '-'}</td>

                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${t.color}`}>{t.label}</span>
                        </td>

                        <td className="px-4 py-3"><AccessCell user={u}/></td>

                        <td className="px-4 py-3 text-center">
                          {u.is_active
                            ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 px-2 py-0.5 rounded-full"><CheckCircle size={11}/>ใช้งานได้</span>
                            : u.suspend_until
                              ? <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 px-2 py-0.5 rounded-full"><XCircle size={11}/>ระงับชั่วคราว</span>
                                  <p className="text-[10px] text-amber-600 text-center">ถึง {fmtDate(u.suspend_until)}</p>
                                </div>
                              : <span className="inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-2 py-0.5 rounded-full"><XCircle size={11}/>ระงับถาวร</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{fmtDate(u.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEdit(u)}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-white hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-800 dark:hover:text-slate-100 transition-colors" title="แก้ไข">
                              <Pencil size={13}/> แก้ไข
                            </button>
                            <RowMenu
                              onPermissions={() => openPermissions(u)}
                              onPassword={() => openPassword(u)}
                              onDelete={() => openDelete(u)}
                              disableDelete={u.id === auth.id}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ===== Modals ===== */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">

            {/* Create User */}
            {modal === 'create' && (
              <form onSubmit={handleCreate}>
                <ModalHeader title="เพิ่มผู้ใช้งาน" icon={<Plus size={18}/>} onClose={closeModal}/>
                <div className="p-5 space-y-3.5">
                  <Field label="ชื่อผู้ใช้ (username)">
                    <input value={fUsername} onChange={e => setFUsername(e.target.value)} required
                      placeholder="เช่น nurse.ward1" autoComplete="off"
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"/>
                  </Field>
                  <Field label="ชื่อ-สกุล">
                    <input value={fFullName} onChange={e => setFFullName(e.target.value)} required
                      placeholder="ชื่อ-สกุลจริง"
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"/>
                  </Field>
                  <Field label="หน่วยงาน">
                    <select value={fDepartment} onChange={e => setFDepartment(e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500">
                      <option value="">-- ไม่ระบุ --</option>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </Field>
                  <Field label="บทบาท">
                    <select value={fRole} onChange={e => setFRole(e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500">
                      <option value="requester">ผู้เบิก (Requester)</option>
                      <option value="staff">เจ้าหน้าที่คลัง (Staff)</option>
                      <option value="admin">ผู้ดูแลระบบ (Admin)</option>
                    </select>
                  </Field>
                  <Field label="รหัสผ่าน">
                    <PasswordInput value={fPassword} onChange={e => setFPassword(e.target.value)} required/>
                  </Field>
                  <Field label="ยืนยันรหัสผ่าน">
                    <PasswordInput value={fConfirm} onChange={e => setFConfirm(e.target.value)} placeholder="ยืนยันรหัสผ่าน" required/>
                  </Field>
                  {error && <ErrorMsg>{error}</ErrorMsg>}
                </div>
                <ModalFooter saving={saving} onCancel={closeModal} submitLabel="สร้างบัญชี"/>
              </form>
            )}

            {/* Edit User */}
            {modal === 'edit' && target && (
              <form onSubmit={handleEdit}>
                <ModalHeader title={`แก้ไข: ${target.username}`} icon={<Pencil size={18}/>} onClose={closeModal}/>
                <div className="p-5 space-y-3.5">
                  <Field label="ชื่อ-สกุล">
                    <input value={fFullName} onChange={e => setFFullName(e.target.value)} required
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"/>
                  </Field>
                  <Field label="หน่วยงาน">
                    <select value={fDepartment} onChange={e => setFDepartment(e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500">
                      <option value="">-- ไม่ระบุ --</option>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </Field>
                  <Field label="บทบาท">
                    <select value={fRole} onChange={e => setFRole(e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500">
                      <option value="requester">ผู้เบิก (Requester)</option>
                      <option value="staff">เจ้าหน้าที่คลัง (Staff)</option>
                      <option value="admin">ผู้ดูแลระบบ (Admin)</option>
                    </select>
                  </Field>
                  <Field label="สถานะบัญชี">
                    <div className="space-y-2">
                      {[
                        { val: 'active', label: 'ใช้งานได้',              color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800/60' },
                        { val: 'temp',   label: 'ระงับชั่วคราว',          color: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800/60' },
                        { val: 'perm',   label: 'ระงับถาวร',              color: 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800/60' },
                      ].map(({ val, label, color }) => (
                        <label key={val} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${fSuspendMode === val ? color : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                          <input type="radio" name="suspendMode" value={val} checked={fSuspendMode === val}
                            onChange={() => setFSuspendMode(val)} className="accent-violet-600"/>
                          <span className="text-sm font-medium">{label}</span>
                        </label>
                      ))}
                      {fSuspendMode === 'temp' && (
                        <div className="pt-1">
                          <label className="text-xs text-slate-500 dark:text-slate-400 font-medium block mb-1">ระงับถึงวันเวลา</label>
                          <input type="datetime-local" value={fSuspendUntil} onChange={e => setFSuspendUntil(e.target.value)}
                            min={new Date().toISOString().slice(0,16)}
                            className="w-full border border-amber-300 dark:border-amber-800/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50 dark:bg-amber-950/40"/>
                        </div>
                      )}
                    </div>
                  </Field>
                  {error && <ErrorMsg>{error}</ErrorMsg>}
                </div>
                <ModalFooter saving={saving} onCancel={closeModal} submitLabel="บันทึก"/>
              </form>
            )}

            {/* Change Password */}
            {modal === 'password' && target && (
              pwSaved ? (
                /* ── Success panel ── */
                <div>
                  <ModalHeader title={`ตั้งรหัสผ่าน: ${target.username}`} icon={<KeyRound size={18}/>} onClose={closeModal}/>
                  <div className="p-5 space-y-4">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl px-4 py-3">
                      <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
                      <span className="text-sm font-semibold">บันทึกรหัสผ่านใหม่สำเร็จ</span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-2">ข้อความสำหรับแจ้ง User — กด Copy แล้วส่งทาง Line / SMS</p>
                      <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1 font-mono text-sm text-slate-800 dark:text-slate-100 select-all">
                        <p>ชื่อผู้ใช้: <span className="font-bold">{target.username}</span></p>
                        <p>รหัสผ่านใหม่: <span className="font-bold text-violet-700 dark:text-violet-300">{pwSaved}</span></p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 font-sans mt-2">* กรุณาเข้าสู่ระบบด้วยรหัสผ่านนี้ และเปลี่ยนรหัสผ่านใหม่ด้วยตนเอง</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `ชื่อผู้ใช้: ${target.username}\nรหัสผ่านใหม่: ${pwSaved}\n* กรุณาเข้าสู่ระบบด้วยรหัสผ่านนี้ และเปลี่ยนรหัสผ่านใหม่ด้วยตนเอง`
                        );
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2500);
                      }}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${copied ? 'bg-emerald-600 text-white' : 'bg-violet-600 hover:bg-violet-700 text-white'}`}>
                      {copied
                        ? <><svg xmlns="http://www.w3.org/2000/svg" width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> คัดลอกแล้ว!</>
                        : <><svg xmlns="http://www.w3.org/2000/svg" width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy ข้อความ</>
                      }
                    </button>
                  </div>
                  <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3 flex justify-end">
                    <button onClick={closeModal} className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl px-5 py-2 text-sm font-medium transition-colors">ปิด</button>
                  </div>
                </div>
              ) : (
                /* ── Input form ── */
                <form onSubmit={handlePassword}>
                  <ModalHeader title={`ตั้งรหัสผ่าน: ${target.username}`} icon={<KeyRound size={18}/>} onClose={closeModal}/>
                  <div className="p-5 space-y-3.5">
                    <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 dark:text-slate-400">ผู้ใช้</p>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{target.username}</p>
                      </div>
                      {target.full_name && target.full_name !== '-' && (
                        <div className="min-w-0 border-l border-slate-200 dark:border-slate-700 pl-3">
                          <p className="text-xs text-slate-500 dark:text-slate-400">ชื่อ-สกุล</p>
                          <p className="text-sm text-slate-700 dark:text-slate-200">{target.full_name}</p>
                        </div>
                      )}
                    </div>
                    <Field label="รหัสผ่านใหม่">
                      <div className="relative">
                        <input
                          type={fShowPw ? 'text' : 'password'}
                          value={fPassword} onChange={e => setFPassword(e.target.value)}
                          placeholder="อย่างน้อย 6 ตัวอักษร" required autoComplete="new-password"
                          className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 pr-10 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono tracking-wider"/>
                        <button type="button" onClick={() => setFShowPw(s => !s)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
                          {fShowPw
                            ? <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            : <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          }
                        </button>
                      </div>
                    </Field>
                    <p className="text-xs text-slate-400 dark:text-slate-500">รหัสผ่านจะถูกเข้ารหัสก่อนบันทึก — ระบบไม่สามารถแสดงรหัสผ่านเดิมได้</p>
                    {error && <ErrorMsg>{error}</ErrorMsg>}
                  </div>
                  <ModalFooter saving={saving} onCancel={closeModal} submitLabel="บันทึกรหัสผ่าน" danger/>
                </form>
              )
            )}

            {/* Permissions */}
            {modal === 'permissions' && target && (
              <div>
                <ModalHeader title={`สิทธิ์ระบบ: ${target.username}`} icon={<ShieldPlus size={18}/>} onClose={closeModal}/>
                <div className="p-5 space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    บทบาท <strong>{ROLE_CONFIG[target.role]?.label || target.role}</strong> — ติ๊กถูกสีเทา = มีสิทธิ์จาก role แล้ว · ติ๊กถูกสีเขียว = grant เพิ่มเป็นพิเศษ
                  </p>
                  <div className="space-y-2">
                    {GRANTABLE_SYSTEMS.map(sys => {
                      const fromRole = sys.defaultRoles.includes(target.role);
                      const granted  = fPermissions.includes(sys.key);
                      return (
                        <label key={sys.key} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${fromRole ? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-default' : granted ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800/60' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                          <input
                            type="checkbox"
                            checked={fromRole || granted}
                            disabled={fromRole}
                            onChange={() => !fromRole && togglePerm(sys.key)}
                            className="w-4 h-4 accent-emerald-600 disabled:accent-slate-400"
                          />
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${sys.color}`}>{sys.label}</span>
                          {fromRole && <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">จาก role</span>}
                          {!fromRole && granted && <span className="ml-auto text-[10px] text-emerald-600 font-semibold">grant เพิ่ม</span>}
                        </label>
                      );
                    })}
                  </div>
                  {error && <ErrorMsg>{error}</ErrorMsg>}
                </div>
                <div className="flex gap-2 px-5 pb-5">
                  <button type="button" onClick={closeModal}
                    className="flex-1 border border-slate-300 dark:border-slate-600 rounded-xl py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    ยกเลิก
                  </button>
                  <button type="button" onClick={handlePermissions} disabled={saving}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50">
                    {saving ? 'กำลังบันทึก...' : 'บันทึกสิทธิ์'}
                  </button>
                </div>
              </div>
            )}

            {/* Delete Confirm */}
            {modal === 'delete' && target && (
              <div>
                <ModalHeader title="ยืนยันการลบ" icon={<Trash2 size={18}/>} onClose={closeModal} danger/>
                <div className="p-5">
                  <p className="text-slate-700 dark:text-slate-200">ต้องการลบบัญชี <strong>{target.username}</strong> ({target.full_name}) ใช่ไหม?</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">การดำเนินการนี้ไม่สามารถยกเลิกได้</p>
                  {error && <ErrorMsg className="mt-3">{error}</ErrorMsg>}
                </div>
                <div className="flex gap-2 px-5 pb-5">
                  <button type="button" onClick={closeModal}
                    className="flex-1 border border-slate-300 dark:border-slate-600 rounded-xl py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    ยกเลิก
                  </button>
                  <button type="button" onClick={handleDelete} disabled={saving}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50">
                    {saving ? 'กำลังลบ...' : 'ลบบัญชี'}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {toast && <Toast message={toast} onClose={clearToast} />}
    </div>
  );
}

// ---- Shared sub-components ----

// คอลัมน์ผู้ใช้ — avatar + ชื่อ (fallback username) + username บรรทัดล่าง
function UserCell({ user, isSelf }) {
  // full_name ว่าง/'-' เยอะในระบบจริง → ใช้ username เป็นบรรทัดหลักแทน และไม่ซ้ำบรรทัดล่าง
  const fullName = user.full_name && user.full_name !== '-' ? user.full_name : '';
  const label = fullName || user.username;
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className={`w-9 h-9 rounded-full grid place-items-center font-bold text-sm shrink-0 ${AVATAR_COLOR[user.role] || AVATAR_COLOR.requester}`}>
        {(label[0] || '?').toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`truncate ${fullName ? 'font-semibold text-slate-800 dark:text-slate-100' : 'font-mono font-semibold text-slate-800 dark:text-slate-100'}`}>{label}</span>
          {isSelf && <span className="text-[10px] bg-violet-100 dark:bg-violet-950/60 text-violet-600 px-1.5 py-0.5 rounded-full font-semibold shrink-0">คุณ</span>}
        </div>
        {fullName && <p className="text-xs text-slate-400 dark:text-slate-500 font-mono truncate">{user.username}</p>}
      </div>
    </div>
  );
}

// คอลัมน์สิทธิ์ระบบ — ป้ายสรุปฐาน + ป้าย grant เพิ่มเฉพาะที่มี (ไม่ไล่ชื่อทุกระบบ — แถวจะสูงเกินอ่าน)
function AccessCell({ user }) {
  const { baseLabel, extra } = summarizeAccess(user);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 whitespace-nowrap">{baseLabel}</span>
      {extra.map(s => (
        <span key={s.key} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap border border-dashed border-current ${s.color}`}>
          +{s.label}
        </span>
      ))}
    </div>
  );
}

// เมนู ⋮ ต่อแถว — action รอง (สิทธิ์/รหัสผ่าน/ลบ) ส่วน "แก้ไข" อยู่นอกเมนู
function RowMenu({ onPermissions, onPassword, onDelete, disableDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey  = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const item = 'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors';
  const pick = (fn) => { setOpen(false); fn(); };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors" title="ตัวเลือกเพิ่มเติม">
        <MoreVertical size={16}/>
      </button>
      {/* mobile กาง"ขวา"จากปุ่ม (ปุ่มอยู่ซ้ายจอ) — desktop กาง"ซ้าย" (ปุ่มอยู่ขวาสุดตาราง) กันล้นขอบ */}
      {open && (
        <div className="absolute left-0 md:left-auto md:right-0 top-full mt-1 z-20 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden py-1">
          <button type="button" onClick={() => pick(onPermissions)} className={`${item} text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700`}>
            <ShieldPlus size={14}/> กำหนดสิทธิ์ระบบ
          </button>
          <button type="button" onClick={() => pick(onPassword)} className={`${item} text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/50 hover:text-amber-700`}>
            <KeyRound size={14}/> เปลี่ยนรหัสผ่าน
          </button>
          <div className="border-t border-slate-100 dark:border-slate-800 my-1"/>
          <button type="button" onClick={() => pick(onDelete)} disabled={disableDelete}
            className={`${item} text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent`}>
            <Trash2 size={14}/> ลบบัญชี
          </button>
        </div>
      )}
    </div>
  );
}

// Toast แจ้งผลสำเร็จ — มุมล่างขวา หายเองใน 2.5 วิ
function Toast({ message, onClose }) {
  // onClose ต้องเป็น callback เสถียร (useCallback ฝั่ง parent) ไม่งั้น timer reset ทุก render
  useEffect(() => {
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [message, onClose]);
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-2.5 bg-slate-800 text-white rounded-xl shadow-2xl pl-4 pr-3 py-3 text-sm max-w-sm">
      <CheckCircle size={16} className="text-emerald-400 shrink-0"/>
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-white transition-colors"><X size={15}/></button>
    </div>
  );
}

function ModalHeader({ title, icon, onClose, danger = false }) {
  return (
    <div className={`flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 ${danger ? 'bg-red-50 dark:bg-red-950/40' : 'bg-slate-50 dark:bg-slate-800'} rounded-t-2xl`}>
      <div className={`flex items-center gap-2 font-bold text-base ${danger ? 'text-red-700 dark:text-red-300' : 'text-slate-800 dark:text-slate-100'}`}>
        {icon} {title}
      </div>
      <button type="button" onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
        <X size={18}/>
      </button>
    </div>
  );
}

function ModalFooter({ saving, onCancel, submitLabel, danger = false }) {
  return (
    <div className="flex gap-2 px-5 pb-5">
      <button type="button" onClick={onCancel}
        className="flex-1 border border-slate-300 dark:border-slate-600 rounded-xl py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
        ยกเลิก
      </button>
      <button type="submit" disabled={saving}
        className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${danger ? 'bg-amber-500 hover:bg-amber-600' : 'bg-violet-600 hover:bg-violet-700'}`}>
        {saving ? 'กำลังบันทึก...' : submitLabel}
      </button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ErrorMsg({ children, className = '' }) {
  return (
    <p className={`text-red-600 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg px-3 py-2 ${className}`}>{children}</p>
  );
}
