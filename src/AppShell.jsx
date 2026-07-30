// ============================================================
// AppShell — persistent sidebar shell (Phase 1)
// ครอบ content ของ AppRoot เมื่อ login แล้ว — sub-app ยังมี header เดิม
// (Phase 2 ค่อยตัด header ของ sub-app ทีละตัว)
//
// Desktop (lg+): sidebar fixed ซ้าย, content เลื่อนด้วย lg:pl-60
//   → ใช้ padding (ไม่ใช่ flex) เพื่อให้ sticky top-0 ของ sub-app คำนวณจาก viewport เหมือนเดิม
// Mobile (< lg): sidebar = drawer overlay เปิดด้วย hamburger
// ============================================================
import React, { useState, useEffect, useRef } from 'react';
import { Pill, LayoutDashboard, ChevronLeft, ChevronDown, Menu, X, LogOut, RefreshCcw, Shield, ShieldCheck, User, KeyRound, Eye, EyeOff, Check } from 'lucide-react';
import { NAV_GROUPS, COLOR } from './navConfig';
import { changeOwnPassword } from './lib/db';
import NotificationBell from './NotificationBell';

// submenu ที่มี active page อยู่ข้างใน → เปิดไว้ตั้งแต่แรก
const submenuKeyOf = (pageKey) => {
  for (const g of NAV_GROUPS)
    for (const it of g.items)
      if (it.children?.some(c => c.page === pageKey)) return it.key;
  return null;
};

// จำสถานะยุบแถบไว้ที่เครื่อง (UI preference ไม่ผูกกับ user) — localStorage อาจถูกปิดใน WebView
const COLLAPSE_KEY = 'sidebar_collapsed';
const readCollapsed = () => {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
};

export default function AppShell({ page, onNavigate, onFormAction, onRefresh, displayName, role, permissions, auth, onLogout, children, badges = {} }) {
  const isStaff = role === 'staff' || role === 'admin';
  // เมนูแสดงเมื่อ role อนุญาต หรือ admin grant permission รายคน (key = item.page)
  const canSee = (it) => it.roles.includes(role) || (it.page && (permissions || []).includes(it.page));
  const [collapsed, setCollapsed] = useState(readCollapsed); // desktop collapse (จำไว้ข้ามการรีเฟรช)
  const [drawerOpen, setDrawerOpen] = useState(false); // mobile drawer
  const [openMenus, setOpenMenus] = useState(() => {
    const k = submenuKeyOf(page);
    return k ? { [k]: true } : {};
  });
  const [flyout, setFlyout] = useState(null); // { key, top, left } ของ submenu ที่กางอยู่ตอนแถบยุบ (desktop)

  const toggleCollapsed = () => setCollapsed(c => {
    const next = !c;
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* localStorage ปิดอยู่ — ไม่จำ แต่ยังยุบได้ */ }
    setFlyout(null); // กางแถบกลับ → flyout ไม่มีความหมายแล้ว
    return next;
  });

  // ปิด flyout เมื่อคลิกนอกแถบ / กด Esc (แถบยุบเท่านั้นที่มี flyout)
  useEffect(() => {
    if (!flyout) return;
    const onDown = (e) => { if (!e.target.closest?.('[data-sidebar-flyout]')) setFlyout(null); };
    const onKey = (e) => { if (e.key === 'Escape') setFlyout(null); };
    // แผงเป็น fixed → ถ้าเลื่อน nav/หน้าจอ ตำแหน่งจะหลุดจากปุ่ม ปิดทิ้งดีกว่า
    const onScroll = () => setFlyout(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [flyout]);

  const go = (p) => { onNavigate(p); setDrawerOpen(false); setFlyout(null); };
  const toggleMenu = (k) => setOpenMenus(m => ({ ...m, [k]: !m[k] }));

  // action item (ทำ action เช่นเปิด print — ไม่เปิดหน้า/ไม่เข้า navStack)
  const doAction = (a) => { onFormAction?.(a); setDrawerOpen(false); setFlyout(null); };

  // leaf menu item (ใช้ทั้ง top-level และลูกของ submenu) — รองรับทั้ง page (navigate) และ action
  const renderLeaf = (item, mini) => {
    const Icon = item.icon;
    const isAction = !!item.action;
    const on = !isAction && page === item.page;
    const col = COLOR[item.c];
    const badge = item.page ? (badges[item.page] || 0) : 0;   // จำนวนรอดำเนินการ (เช่น คืนยา pending)
    return (
      <button
        key={item.page || item.action}
        onClick={() => (isAction ? doAction(item.action) : go(item.page))}
        title={item.title}
        className={`relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${mini ? 'justify-center' : ''} ${on ? `${col.activeBg} font-semibold` : `text-slate-600 ${col.hover}`}`}
      >
        {on && !mini && <span className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full ${col.bar}`} />}
        <span className={`p-1 rounded-md shrink-0 ${col.icon}`}><Icon size={15} /></span>
        {!mini && <span className="truncate">{item.title}</span>}
        {badge > 0 && (
          <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none ${mini ? 'absolute top-1 right-1' : 'ml-auto'}`}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    );
  };

  // ฟังก์ชันธรรมดาคืน JSX (ไม่ใช่ component ใน render — เลี่ยง remount ทุก render)
  const renderSidebar = (mini) => (
    <>
      {/* Brand — ปุ่มยุบ/กางย้ายไปเป็นปุ่มลอยบนขอบขวาของ aside (ดูใน return) */}
      <div className={`flex items-center gap-2.5 px-4 h-16 border-b border-slate-100 shrink-0 ${mini ? 'justify-center px-2' : ''}`}>
        <div className="p-1.5 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white shrink-0"><Pill size={18} /></div>
        {!mini && <span className="font-black text-slate-800 tracking-tight">คลังยา</span>}
        <button onClick={() => setDrawerOpen(false)} className="ml-auto p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden">
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      {/* แถบเลื่อนจาง — default ของ browser หนาและเข้มเกินไปบนแถบขาว */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5 [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.200)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200 hover:[&::-webkit-scrollbar-thumb]:bg-slate-300">
        <button
          onClick={() => go('dashboard')}
          title="หน้าหลัก"
          className={`relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-semibold transition-colors ${mini ? 'justify-center' : ''} ${page === 'dashboard' ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-sky-50 hover:text-sky-700'}`}
        >
          {page === 'dashboard' && !mini && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-sky-500" />}
          <span className="p-1 rounded-md shrink-0 bg-sky-100 text-sky-600"><LayoutDashboard size={15} /></span>
          {!mini && 'หน้าหลัก'}
        </button>

        {NAV_GROUPS.map(group => {
          // submenu (มี children) แสดงเมื่อ role กลุ่มอนุญาต หรือมีลูกอย่างน้อย 1 ที่ canSee
          const items = group.items.filter(it => (it.children ? (it.roles.includes(role) || it.children.some(canSee)) : canSee(it)));
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              {mini ? (
                // ยุบแล้วไม่มีที่ใส่ชื่อกลุ่ม → ใช้เส้นคั่นสีประจำกลุ่มแทน
                <div className="flex justify-center mb-1.5"><span className={`h-0.5 w-6 rounded-full ${group.dot} opacity-40`} /></div>
              ) : (
                <div className="flex items-center gap-2 px-2.5 mb-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${group.dot} ring-2 ring-offset-1 ring-transparent`} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{group.label}</span>
                  <span className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
                </div>
              )}
              <div className="space-y-0.5">
                {items.map(item => {
                  // ── submenu (collapsible) ──
                  if (item.children) {
                    const children = item.children.filter(canSee);
                    if (children.length === 0) return null;
                    const SubIcon = item.icon;
                    const open = !!openMenus[item.key];
                    const hasActive = children.some(c => c.page === page);
                    const subCol = COLOR[item.c] || COLOR.slate;
                    // โหมด mini: ไอคอน parent ตัวเดียว → คลิกกาง flyout ลอยขวา (ไม่ทะลุลูกออกมาเรียงกัน)
                    if (mini) {
                      const fOpen = flyout?.key === item.key;
                      return (
                        <div key={item.key} data-sidebar-flyout>
                          <button
                            onClick={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              setFlyout(f => (f?.key === item.key ? null : { key: item.key, top: r.top, left: r.right + 8 }));
                            }}
                            title={item.title}
                            className={`relative w-full flex items-center justify-center px-2.5 py-2 rounded-lg text-sm transition-colors ${hasActive || fOpen ? 'bg-slate-100 text-slate-800' : `text-slate-600 ${subCol.hover}`}`}
                          >
                            <span className={`p-1 rounded-md shrink-0 ${subCol.icon}`}><SubIcon size={15} /></span>
                            {hasActive && <span className="absolute right-1 top-1 w-1.5 h-1.5 rounded-full bg-sky-500" />}
                          </button>
                          {/* fixed ไม่ใช่ absolute — nav เป็น overflow-y-auto จะ clip แผงที่ยื่นออกนอกแถบ */}
                          {fOpen && (
                            <div
                              style={{ top: flyout.top, left: flyout.left }}
                              className="fixed w-56 bg-white rounded-xl shadow-2xl border border-slate-200 p-1.5 z-50"
                            >
                              <p className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">{item.title}</p>
                              <div className="space-y-0.5">
                                {children.map(c => renderLeaf(c, false))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div key={item.key}>
                        <button
                          onClick={() => toggleMenu(item.key)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${hasActive && !open ? 'text-slate-800 font-semibold bg-slate-50' : `text-slate-600 ${subCol.hover}`}`}
                        >
                          <span className={`p-1 rounded-md shrink-0 ${subCol.icon}`}><SubIcon size={15} /></span>
                          <span className="truncate flex-1 text-left">{item.title}</span>
                          <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                        {open && (
                          <div className="ml-5 mt-0.5 pl-3 border-l-2 border-slate-200 space-y-0.5">
                            {children.map(c => renderLeaf(c, false))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  // ── leaf item ──
                  return renderLeaf(item, mini);
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Refresh + Logout */}
      <div className="p-3 border-t border-slate-100 shrink-0 space-y-0.5">
        {onRefresh && (
          <button onClick={() => { onRefresh(); setDrawerOpen(false); }} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-slate-500 hover:bg-sky-50 hover:text-sky-700 transition-colors ${mini ? 'justify-center' : ''}`} title="โหลดหน้านี้ใหม่">
            <span className="p-1 rounded-md shrink-0 bg-sky-100 text-sky-600"><RefreshCcw size={15} /></span>
            {!mini && 'โหลดหน้านี้ใหม่'}
          </button>
        )}
        <button onClick={onLogout} title="ออกจากระบบ" className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors ${mini ? 'justify-center' : ''}`}>
          <span className="p-1 rounded-md shrink-0 bg-red-100 text-red-600"><LogOut size={15} /></span>
          {!mini && 'ออกจากระบบ'}
        </button>
        {!mini && displayName && <p className="text-[10px] text-slate-400 mt-1.5 px-2.5 truncate">{displayName}</p>}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-200">
      {/* ── Desktop sidebar (fixed) ──
          ปุ่มยุบ/กาง = ปุ่มกลมลอยคร่อมขอบขวา (แสดงตลอด ไม่ใช่ hover-only) — ต้องเป็นลูกตรงของ aside
          ไม่ใช่ลูกของ nav ที่ overflow-y-auto ไม่งั้นโดน clip */}
      <aside className={`hidden lg:flex fixed inset-y-0 left-0 z-40 ${collapsed ? 'w-16' : 'w-60'} bg-white border-r border-slate-200 flex-col transition-all duration-200`}>
        {renderSidebar(collapsed)}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'กางแถบเมนู' : 'ยุบแถบเมนู'}
          aria-label={collapsed ? 'กางแถบเมนู' : 'ยุบแถบเมนู'}
          className="absolute -right-3 top-[72px] z-50 w-6 h-6 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 shadow-md hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200 transition-colors"
        >
          <ChevronLeft size={14} className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* ── Mobile drawer ── */}
      {drawerOpen && (
        <>
          <div className="lg:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col">
            {renderSidebar(false)}
          </aside>
        </>
      )}

      {/* ── Content (sub-app เดิม พร้อม header ของตัวเอง) ── */}
      <div className={`${collapsed ? 'lg:pl-16' : 'lg:pl-60'} transition-all duration-200`}>
        {/* Top bar (แถบสีฟ้า) — ซ้าย: hamburger (mobile) · ขวา: user chip + กระดิ่ง.
            ไม่ sticky โดยเจตนา → เลื่อนหายไปกับหน้า ให้ header sticky ของ sub-app คุม top-0 เอง (กันชน) */}
        {auth && (
          <div className="flex items-center gap-2.5 h-14 px-3 sm:px-5 bg-gradient-to-r from-sky-500 to-blue-600 shadow-md">
            {/* ซ้าย: hamburger (mobile) + แบรนด์ชื่อระบบ */}
            <div className="flex items-center gap-2.5 min-w-0 mr-auto">
              <button
                onClick={() => setDrawerOpen(true)}
                className="lg:hidden p-2 -ml-1 rounded-xl text-indigo-100 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                aria-label="เปิดเมนู"
              >
                <Menu size={22} />
              </button>
              {/* โลโก้ = กลับหน้าหลัก (โหลดหน้านี้ใหม่ย้ายไปปุ่มใน sidebar footer + ปุ่มรีเฟรชของแต่ละ sub-app) */}
              <button
                type="button"
                onClick={() => go('dashboard')}
                title="กลับหน้าหลัก"
                className="flex items-center gap-2.5 min-w-0 rounded-xl -m-1 p-1 transition-colors hover:bg-white/10 cursor-pointer"
              >
                <div className="p-1.5 bg-white/20 text-white rounded-xl shrink-0"><Pill size={18} /></div>
                <div className="min-w-0 text-left">
                  <p className="font-bold text-white text-sm leading-tight truncate">ระบบบริหารคลังยา</p>
                  <p className="hidden sm:block text-xs text-indigo-200 leading-tight truncate">Pharmacy Management System</p>
                </div>
              </button>
            </div>
            {/* ขวา: กระดิ่ง → user chip (เรียงแบบ YouTube) */}
            <div className="flex items-center gap-2 shrink-0">
              <NotificationBell auth={auth} onNavigate={isStaff ? onNavigate : undefined} onBlue />
              <AccountMenu displayName={displayName} role={role} auth={auth} isStaff={isStaff} onLogout={onLogout} />
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// user chip → คลิกเปิดเมนูบัญชี (ดูข้อมูล + เปลี่ยนรหัสผ่าน + ออกจากระบบ) — สไตล์เมนูบัญชี YouTube
function AccountMenu({ displayName, role, auth, isStaff, onLogout }) {
  const [open, setOpen] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const ref = useRef(null);
  const RoleIcon = role === 'admin' ? ShieldCheck : isStaff ? Shield : User;
  const roleColor = role === 'admin' ? 'text-violet-200' : 'text-indigo-100';
  const roleLabel = role === 'admin' ? 'ผู้ดูแลระบบ' : isStaff ? 'เจ้าหน้าที่คลังยา' : (auth.department || 'ผู้เบิก');

  // ปิดเมนูเมื่อคลิกนอก / กด Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-white/15 border border-white/20 rounded-xl px-2.5 py-1.5 max-w-[200px] hover:bg-white/25 transition-colors"
        title="บัญชีของฉัน"
      >
        <RoleIcon size={15} className={`${roleColor} shrink-0`} />
        <div className="text-xs min-w-0 text-left">
          <p className="font-semibold text-white leading-tight truncate">{displayName}</p>
          <p className="text-indigo-100 leading-tight truncate">{roleLabel}</p>
        </div>
        <ChevronDown size={14} className={`text-indigo-100 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden text-slate-700">
          {/* การ์ดข้อมูลผู้ใช้ (อ่านอย่างเดียว) */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shrink-0">
              <RoleIcon size={18} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm text-slate-800 truncate">{displayName}</p>
              <p className="text-xs text-slate-400 truncate font-mono">@{auth.username}</p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{roleLabel}{isStaff && auth.department ? ` · ${auth.department}` : ''}</p>
            </div>
          </div>
          {/* actions */}
          <div className="py-1.5">
            <button
              type="button"
              onClick={() => { setOpen(false); setPwModal(true); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <KeyRound size={16} className="text-slate-400 shrink-0" /> เปลี่ยนรหัสผ่าน
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onLogout?.(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={16} className="shrink-0" /> ออกจากระบบ
            </button>
          </div>
        </div>
      )}

      {pwModal && <SelfPasswordModal auth={auth} onClose={() => setPwModal(false)} />}
    </div>
  );
}

// โมดอลให้ผู้ใช้เปลี่ยนรหัสผ่านตัวเอง — ต้องกรอกรหัสผ่านเดิม (ยืนยันผ่าน changeOwnPassword)
function SelfPasswordModal({ auth, onClose }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (newPw.length < 6) { setError('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    if (newPw !== confirm) { setError('รหัสผ่านใหม่และยืนยันไม่ตรงกัน'); return; }
    setSaving(true); setError('');
    try {
      await changeOwnPassword(auth.id, oldPw, newPw);
      setDone(true);
    } catch (err) { setError(err.message || 'เกิดข้อผิดพลาด'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm text-slate-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
          <div className="flex items-center gap-2 font-bold text-base text-slate-800"><KeyRound size={18} /> เปลี่ยนรหัสผ่านของฉัน</div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        {done ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <Check size={18} /><span className="text-sm font-semibold">เปลี่ยนรหัสผ่านสำเร็จ</span>
            </div>
            <p className="text-xs text-slate-500">ครั้งต่อไปที่เข้าสู่ระบบ กรุณาใช้รหัสผ่านใหม่นี้</p>
            <button type="button" onClick={onClose}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors">
              ปิด
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-3.5">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">ผู้ใช้</p>
                <p className="text-sm font-semibold text-slate-800 font-mono">{auth.username}</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">รหัสผ่านเดิม</label>
              <input type={show ? 'text' : 'password'} value={oldPw} onChange={e => setOldPw(e.target.value)} required autoComplete="current-password"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">รหัสผ่านใหม่</label>
              <div className="relative">
                <input type={show ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} required autoComplete="new-password"
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">ยืนยันรหัสผ่านใหม่</label>
              <input type={show ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 border border-slate-300 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                ยกเลิก
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
