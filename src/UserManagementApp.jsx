import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Search, Plus, Pencil, Trash2, X,
  User, Shield, ShieldCheck, Eye, EyeOff, RefreshCcw,
  CheckCircle, XCircle, KeyRound, Users,
} from 'lucide-react';
import {
  fetchAppUsers, createAppUser, updateAppUser,
  deleteAppUser, changeAppUserPassword,
} from './lib/db';

const ROLE_CONFIG = {
  requester: { label: 'ผู้เบิก',          badge: 'bg-blue-100 text-blue-700 border border-blue-300',   icon: User      },
  staff:     { label: 'เจ้าหน้าที่คลัง', badge: 'bg-emerald-100 text-emerald-700 border border-emerald-300', icon: Shield },
  admin:     { label: 'ผู้ดูแลระบบ',      badge: 'bg-violet-100 text-violet-700 border border-violet-300',   icon: ShieldCheck },
};

// ประเภทผู้ใช้ (แสดงในตาราง)
const USER_TYPE = {
  requester: { label: 'ผู้ใช้งานทั่วไป',    color: 'bg-sky-50 text-sky-700 border border-sky-200' },
  staff:     { label: 'เจ้าหน้าที่คลังยา', color: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  admin:     { label: 'เจ้าหน้าที่คลังยา', color: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
};

// สิทธิ์ระบบตาม role
const SYSTEM_ACCESS = {
  requester: [
    { name: 'แผนผังคลังยา',    color: 'bg-indigo-100 text-indigo-700' },
    { name: 'เบิกยาออนไลน์',   color: 'bg-blue-100 text-blue-700' },
  ],
  staff: [
    { name: 'แผนผังคลังยา',    color: 'bg-indigo-100 text-indigo-700' },
    { name: 'เบิกยาออนไลน์',   color: 'bg-blue-100 text-blue-700' },
    { name: 'ประวัติรับเข้าคลัง', color: 'bg-emerald-100 text-emerald-700' },
    { name: 'ประวัติเบิกยา',   color: 'bg-rose-100 text-rose-700' },
    { name: 'คืนยา',            color: 'bg-violet-100 text-violet-700' },
    { name: 'Audit Log',        color: 'bg-slate-100 text-slate-600' },
  ],
  admin: [
    { name: 'แผนผังคลังยา',    color: 'bg-indigo-100 text-indigo-700' },
    { name: 'เบิกยาออนไลน์',   color: 'bg-blue-100 text-blue-700' },
    { name: 'ประวัติรับเข้าคลัง', color: 'bg-emerald-100 text-emerald-700' },
    { name: 'ประวัติเบิกยา',   color: 'bg-rose-100 text-rose-700' },
    { name: 'คืนยา',            color: 'bg-violet-100 text-violet-700' },
    { name: 'Audit Log',        color: 'bg-slate-100 text-slate-600' },
    { name: 'จัดการผู้ใช้',    color: 'bg-violet-200 text-violet-800' },
  ],
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
  'รพ.สามโคก', 'รพ.เปาโล', 'รพ.ปทุมเวศ', 'รพ.ลาดหลุมแก้ว',
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
        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 pr-10 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        {show ? <EyeOff size={16}/> : <Eye size={16}/>}
      </button>
    </div>
  );
}

// ============================================================
// UserManagementApp
// ============================================================
export default function UserManagementApp({ onBack, auth }) {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

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
  const [fRole,       setFRole]       = useState('requester');
  const [fActive,     setFActive]     = useState(true);

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
    setError(''); setModal('edit');
  };
  const openPassword = (u) => { setTarget(u); setFPassword(''); setFConfirm(''); setError(''); setModal('password'); };
  const openDelete   = (u) => { setTarget(u); setError(''); setModal('delete'); };
  const closeModal   = () => { setModal(null); setTarget(null); setError(''); };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (fPassword !== fConfirm) { setError('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน'); return; }
    if (fPassword.length < 6)   { setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    setSaving(true); setError('');
    try {
      await createAppUser({ username: fUsername, password: fPassword, full_name: fFullName, department: fDepartment, role: fRole });
      await load(); closeModal();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (target.id === auth.id && fRole !== 'admin') { setError('ไม่สามารถเปลี่ยน role ของตัวเองออกจาก admin ได้'); return; }
    setSaving(true); setError('');
    try {
      await updateAppUser(target.id, { full_name: fFullName, department: fDepartment, role: fRole, is_active: fActive });
      await load(); closeModal();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    if (fPassword !== fConfirm) { setError('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน'); return; }
    if (fPassword.length < 6)   { setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    setSaving(true); setError('');
    try {
      await changeAppUserPassword(target.id, fPassword);
      closeModal();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (target.id === auth.id) { setError('ไม่สามารถลบบัญชีของตัวเองได้'); return; }
    setSaving(true); setError('');
    try {
      await deleteAppUser(target.id);
      await load(); closeModal();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
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
    return matchSearch && matchRole;
  });

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <div className="sticky top-0 z-10 shadow-md px-4 py-3 flex items-center gap-3 bg-gradient-to-r from-violet-700 to-violet-800">
        <button onClick={onBack} className="p-1 text-white/80 hover:text-white transition-colors">
          <ArrowLeft size={20}/>
        </button>
        <div className="flex-1 border-l-4 border-white/40 pl-3 py-0.5">
          <p className="font-bold text-white text-xl drop-shadow">จัดการผู้ใช้งาน</p>
          <p className="text-violet-200 text-sm">สร้าง แก้ไข และลบบัญชีผู้ใช้</p>
        </div>
        <button onClick={load} className="p-2 text-white/70 hover:text-white transition-colors" title="รีเฟรช">
          <RefreshCcw size={16}/>
        </button>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อผู้ใช้ ชื่อ-สกุล หน่วยงาน..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"/>
          </div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400">
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

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'ทั้งหมด',        count: users.length,                              color: 'text-slate-700' },
            { label: 'ใช้งานได้',      count: users.filter(u => u.is_active).length,     color: 'text-emerald-600' },
            { label: 'ถูกระงับ',       count: users.filter(u => !u.is_active).length,    color: 'text-red-600' },
          ].map(({ label, count, color }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-slate-400">กำลังโหลด...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users size={32} className="mx-auto mb-2 opacity-30"/>
              ไม่พบผู้ใช้งาน
            </div>
          ) : (
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 380px)' }}>
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left bg-slate-50">ชื่อผู้ใช้</th>
                    <th className="px-4 py-3 text-left bg-slate-50">ชื่อ-สกุล</th>
                    <th className="px-4 py-3 text-left bg-slate-50">หน่วยงาน</th>
                    <th className="px-4 py-3 text-center bg-slate-50">ประเภทผู้ใช้</th>
                    <th className="px-4 py-3 text-left bg-slate-50">สิทธิ์ระบบ</th>
                    <th className="px-4 py-3 text-center bg-slate-50">สถานะ</th>
                    <th className="px-4 py-3 text-center bg-slate-50">วันที่สมัคร</th>
                    <th className="px-4 py-3 text-center bg-slate-50">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(u => (
                    <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${!u.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-slate-700 font-medium">{u.username}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {u.full_name}
                        {u.id === auth.id && (
                          <span className="ml-1.5 text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-semibold">คุณ</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{u.department || '-'}</td>

                      {/* ประเภทผู้ใช้ */}
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const t = USER_TYPE[u.role] || USER_TYPE.requester;
                          return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${t.color}`}>{t.label}</span>;
                        })()}
                      </td>

                      {/* สิทธิ์ระบบ */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(SYSTEM_ACCESS[u.role] || SYSTEM_ACCESS.requester).map(s => (
                            <span key={s.name} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${s.color}`}>{s.name}</span>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-center">
                        {u.is_active
                          ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"><CheckCircle size={11}/>ใช้งานได้</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full"><XCircle size={11}/>ถูกระงับ</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-center text-slate-500 text-xs">{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(u)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="แก้ไข">
                            <Pencil size={14}/>
                          </button>
                          <button onClick={() => openPassword(u)}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="เปลี่ยนรหัสผ่าน">
                            <KeyRound size={14}/>
                          </button>
                          <button onClick={() => openDelete(u)}
                            disabled={u.id === auth.id}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="ลบ">
                            <Trash2 size={14}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ===== Modals ===== */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>

            {/* Create User */}
            {modal === 'create' && (
              <form onSubmit={handleCreate}>
                <ModalHeader title="เพิ่มผู้ใช้งาน" icon={<Plus size={18}/>} onClose={closeModal}/>
                <div className="p-5 space-y-3.5">
                  <Field label="ชื่อผู้ใช้ (username)">
                    <input value={fUsername} onChange={e => setFUsername(e.target.value)} required
                      placeholder="เช่น nurse.ward1" autoComplete="off"
                      className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"/>
                  </Field>
                  <Field label="ชื่อ-สกุล">
                    <input value={fFullName} onChange={e => setFFullName(e.target.value)} required
                      placeholder="ชื่อ-สกุลจริง"
                      className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"/>
                  </Field>
                  <Field label="หน่วยงาน">
                    <select value={fDepartment} onChange={e => setFDepartment(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500">
                      <option value="">-- ไม่ระบุ --</option>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </Field>
                  <Field label="บทบาท">
                    <select value={fRole} onChange={e => setFRole(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500">
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
                      className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"/>
                  </Field>
                  <Field label="หน่วยงาน">
                    <select value={fDepartment} onChange={e => setFDepartment(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500">
                      <option value="">-- ไม่ระบุ --</option>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </Field>
                  <Field label="บทบาท">
                    <select value={fRole} onChange={e => setFRole(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500">
                      <option value="requester">ผู้เบิก (Requester)</option>
                      <option value="staff">เจ้าหน้าที่คลัง (Staff)</option>
                      <option value="admin">ผู้ดูแลระบบ (Admin)</option>
                    </select>
                  </Field>
                  <Field label="สถานะบัญชี">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={fActive} onChange={e => setFActive(e.target.checked)}
                        className="w-4 h-4 accent-violet-600"/>
                      <span className="text-sm text-slate-700">เปิดใช้งาน (ปิด = ระงับบัญชี)</span>
                    </label>
                  </Field>
                  {error && <ErrorMsg>{error}</ErrorMsg>}
                </div>
                <ModalFooter saving={saving} onCancel={closeModal} submitLabel="บันทึก"/>
              </form>
            )}

            {/* Change Password */}
            {modal === 'password' && target && (
              <form onSubmit={handlePassword}>
                <ModalHeader title={`รีเซ็ตรหัสผ่าน: ${target.username}`} icon={<KeyRound size={18}/>} onClose={closeModal}/>
                <div className="p-5 space-y-3.5">
                  <p className="text-sm text-slate-500">ตั้งรหัสผ่านใหม่สำหรับ <strong>{target.full_name}</strong></p>
                  <Field label="รหัสผ่านใหม่">
                    <PasswordInput value={fPassword} onChange={e => setFPassword(e.target.value)} placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)" required/>
                  </Field>
                  <Field label="ยืนยันรหัสผ่าน">
                    <PasswordInput value={fConfirm} onChange={e => setFConfirm(e.target.value)} placeholder="ยืนยันรหัสผ่าน" required/>
                  </Field>
                  {error && <ErrorMsg>{error}</ErrorMsg>}
                </div>
                <ModalFooter saving={saving} onCancel={closeModal} submitLabel="เปลี่ยนรหัสผ่าน" danger/>
              </form>
            )}

            {/* Delete Confirm */}
            {modal === 'delete' && target && (
              <div>
                <ModalHeader title="ยืนยันการลบ" icon={<Trash2 size={18}/>} onClose={closeModal} danger/>
                <div className="p-5">
                  <p className="text-slate-700">ต้องการลบบัญชี <strong>{target.username}</strong> ({target.full_name}) ใช่ไหม?</p>
                  <p className="text-xs text-slate-500 mt-1">การดำเนินการนี้ไม่สามารถยกเลิกได้</p>
                  {error && <ErrorMsg className="mt-3">{error}</ErrorMsg>}
                </div>
                <div className="flex gap-2 px-5 pb-5">
                  <button type="button" onClick={closeModal}
                    className="flex-1 border border-slate-300 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
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
    </div>
  );
}

// ---- Shared sub-components ----
function ModalHeader({ title, icon, onClose, danger = false }) {
  return (
    <div className={`flex items-center justify-between px-5 py-4 border-b border-slate-100 ${danger ? 'bg-red-50' : 'bg-slate-50'} rounded-t-2xl`}>
      <div className={`flex items-center gap-2 font-bold text-base ${danger ? 'text-red-700' : 'text-slate-800'}`}>
        {icon} {title}
      </div>
      <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
        <X size={18}/>
      </button>
    </div>
  );
}

function ModalFooter({ saving, onCancel, submitLabel, danger = false }) {
  return (
    <div className="flex gap-2 px-5 pb-5">
      <button type="button" onClick={onCancel}
        className="flex-1 border border-slate-300 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
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
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ErrorMsg({ children, className = '' }) {
  return (
    <p className={`text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 ${className}`}>{children}</p>
  );
}
