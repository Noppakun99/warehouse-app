// ============================================================
// AppShell — persistent sidebar shell (Phase 1)
// ครอบ content ของ AppRoot เมื่อ login แล้ว — sub-app ยังมี header เดิม
// (Phase 2 ค่อยตัด header ของ sub-app ทีละตัว)
//
// Desktop (lg+): sidebar fixed ซ้าย, content เลื่อนด้วย lg:pl-60
//   → ใช้ padding (ไม่ใช่ flex) เพื่อให้ sticky top-0 ของ sub-app คำนวณจาก viewport เหมือนเดิม
// Mobile (< lg): sidebar = drawer overlay เปิดด้วย hamburger
// ============================================================
import React, { useState } from 'react';
import { Pill, LayoutDashboard, ChevronLeft, ChevronDown, Menu, X, LogOut, RefreshCcw, Shield, ShieldCheck, User } from 'lucide-react';
import { NAV_GROUPS, COLOR } from './navConfig';
import NotificationBell from './NotificationBell';

// submenu ที่มี active page อยู่ข้างใน → เปิดไว้ตั้งแต่แรก
const submenuKeyOf = (pageKey) => {
  for (const g of NAV_GROUPS)
    for (const it of g.items)
      if (it.children?.some(c => c.page === pageKey)) return it.key;
  return null;
};

export default function AppShell({ page, onNavigate, onFormAction, onRefresh, displayName, role, permissions, auth, onLogout, children, badges = {} }) {
  const isStaff = role === 'staff' || role === 'admin';
  // เมนูแสดงเมื่อ role อนุญาต หรือ admin grant permission รายคน (key = item.page)
  const canSee = (it) => it.roles.includes(role) || (it.page && (permissions || []).includes(it.page));
  const [collapsed, setCollapsed] = useState(false); // desktop collapse
  const [drawerOpen, setDrawerOpen] = useState(false); // mobile drawer
  const [openMenus, setOpenMenus] = useState(() => {
    const k = submenuKeyOf(page);
    return k ? { [k]: true } : {};
  });

  const go = (p) => { onNavigate(p); setDrawerOpen(false); };
  const toggleMenu = (k) => setOpenMenus(m => ({ ...m, [k]: !m[k] }));

  // action item (ทำ action เช่นเปิด print — ไม่เปิดหน้า/ไม่เข้า navStack)
  const doAction = (a) => { onFormAction?.(a); setDrawerOpen(false); };

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
        className={`relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${on ? `${col.activeBg} font-semibold` : 'text-slate-600 hover:bg-slate-50'}`}
      >
        {on && <span className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full ${col.bar}`} />}
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
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-slate-100 shrink-0">
        <div className="p-1.5 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white shrink-0"><Pill size={18} /></div>
        {!mini && <span className="font-black text-slate-800 tracking-tight">คลังยา</span>}
        <button onClick={() => setCollapsed(c => !c)} className="ml-auto p-1 rounded-lg text-slate-400 hover:bg-slate-100 hidden lg:block">
          <ChevronLeft size={16} className={`transition-transform ${mini ? 'rotate-180' : ''}`} />
        </button>
        <button onClick={() => setDrawerOpen(false)} className="ml-auto p-1 rounded-lg text-slate-400 hover:bg-slate-100 lg:hidden">
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5">
        <button
          onClick={() => go('dashboard')}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-semibold transition-colors ${page === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          <LayoutDashboard size={17} className="shrink-0" />
          {!mini && 'หน้าหลัก'}
        </button>

        {NAV_GROUPS.map(group => {
          // submenu (มี children) แสดงเมื่อ role กลุ่มอนุญาต หรือมีลูกอย่างน้อย 1 ที่ canSee
          const items = group.items.filter(it => (it.children ? (it.roles.includes(role) || it.children.some(canSee)) : canSee(it)));
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              {!mini && (
                <div className="flex items-center gap-2 px-2.5 mb-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${group.dot}`} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{group.label}</span>
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
                    // โหมด mini: ไม่มีที่กาง → แสดง leaf ของลูกตรงๆ
                    if (mini) return children.map(c => renderLeaf(c, true));
                    return (
                      <div key={item.key}>
                        <button
                          onClick={() => toggleMenu(item.key)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${hasActive && !open ? 'text-slate-800 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                          <span className="p-1 rounded-md shrink-0 bg-slate-100 text-slate-500"><SubIcon size={15} /></span>
                          <span className="truncate flex-1 text-left">{item.title}</span>
                          <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                        {open && (
                          <div className="ml-5 mt-0.5 pl-3 border-l border-slate-200 space-y-0.5">
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
          <button onClick={() => { onRefresh(); setDrawerOpen(false); }} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors ${mini ? 'justify-center' : ''}`} title="โหลดหน้านี้ใหม่">
            <RefreshCcw size={16} className="shrink-0" />
            {!mini && 'โหลดหน้านี้ใหม่'}
          </button>
        )}
        <button onClick={onLogout} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors ${mini ? 'justify-center' : ''}`}>
          <LogOut size={16} className="shrink-0" />
          {!mini && 'ออกจากระบบ'}
        </button>
        {!mini && displayName && <p className="text-[10px] text-slate-400 mt-1.5 px-2.5 truncate">{displayName}</p>}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Desktop sidebar (fixed) ── */}
      <aside className={`hidden lg:flex fixed inset-y-0 left-0 z-40 ${collapsed ? 'w-16' : 'w-60'} bg-white border-r border-slate-200 flex-col transition-all duration-200`}>
        {renderSidebar(collapsed)}
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
              <button
                type="button"
                onClick={() => onRefresh?.()}
                disabled={!onRefresh}
                title="คลิกเพื่อโหลดหน้านี้ใหม่"
                className={`flex items-center gap-2.5 min-w-0 rounded-xl -m-1 p-1 transition-colors ${onRefresh ? 'hover:bg-white/10 cursor-pointer' : 'cursor-default'}`}
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
              <UserChip displayName={displayName} role={role} department={auth.department} isStaff={isStaff} />
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// user chip — ไอคอน role + ชื่อ + บทบาท (ขาวบนแถบสีฟ้า — ย้ายมาจาก Dashboard blue header)
function UserChip({ displayName, role, department, isStaff }) {
  const RoleIcon = role === 'admin' ? ShieldCheck : isStaff ? Shield : User;
  const roleColor = role === 'admin' ? 'text-violet-200' : 'text-indigo-100';
  const roleLabel = role === 'admin' ? 'ผู้ดูแลระบบ' : isStaff ? 'เจ้าหน้าที่คลังยา' : department;
  return (
    <div className="flex items-center gap-2 bg-white/15 border border-white/20 rounded-xl px-2.5 py-1.5 max-w-[200px]">
      <RoleIcon size={15} className={`${roleColor} shrink-0`} />
      <div className="text-xs min-w-0">
        <p className="font-semibold text-white leading-tight truncate">{displayName}</p>
        <p className="text-indigo-100 leading-tight truncate">{roleLabel}</p>
      </div>
    </div>
  );
}
