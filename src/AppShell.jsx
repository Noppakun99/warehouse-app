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
import { Pill, LayoutDashboard, ChevronLeft, ChevronDown, Menu, X, LogOut, RefreshCcw } from 'lucide-react';
import { NAV_GROUPS, COLOR } from './navConfig';

// submenu ที่มี active page อยู่ข้างใน → เปิดไว้ตั้งแต่แรก
const submenuKeyOf = (pageKey) => {
  for (const g of NAV_GROUPS)
    for (const it of g.items)
      if (it.children?.some(c => c.page === pageKey)) return it.key;
  return null;
};

export default function AppShell({ page, onNavigate, onRefresh, displayName, role, onLogout, children }) {
  const [collapsed, setCollapsed] = useState(false); // desktop collapse
  const [drawerOpen, setDrawerOpen] = useState(false); // mobile drawer
  const [openMenus, setOpenMenus] = useState(() => {
    const k = submenuKeyOf(page);
    return k ? { [k]: true } : {};
  });

  const go = (p) => { onNavigate(p); setDrawerOpen(false); };
  const toggleMenu = (k) => setOpenMenus(m => ({ ...m, [k]: !m[k] }));

  // leaf menu item (ใช้ทั้ง top-level และลูกของ submenu)
  const renderLeaf = (item, mini) => {
    const Icon = item.icon;
    const on = page === item.page;
    const col = COLOR[item.c];
    return (
      <button
        key={item.page}
        onClick={() => go(item.page)}
        title={item.title}
        className={`relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${on ? `${col.activeBg} font-semibold` : 'text-slate-600 hover:bg-slate-50'}`}
      >
        {on && <span className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full ${col.bar}`} />}
        <span className={`p-1 rounded-md shrink-0 ${col.icon}`}><Icon size={15} /></span>
        {!mini && <span className="truncate">{item.title}</span>}
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
          const items = group.items.filter(it => it.roles.includes(role));
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
                    const children = item.children.filter(c => c.roles.includes(role));
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

      {/* ── Mobile hamburger (floating) ── */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="lg:hidden fixed bottom-4 left-4 z-30 p-3 rounded-full bg-white border border-slate-200 shadow-lg text-slate-600"
        aria-label="เปิดเมนู"
      >
        <Menu size={20} />
      </button>

      {/* ── Content (sub-app เดิม พร้อม header ของตัวเอง) ── */}
      <div className={`${collapsed ? 'lg:pl-16' : 'lg:pl-60'} transition-all duration-200`}>
        {children}
      </div>
    </div>
  );
}
