// ============================================================
// navConfig — เมนู sidebar + สีประจำระบบ (shared)
// ใช้ร่วมระหว่าง AppShell.jsx (production) และ DashboardV2Preview.jsx (prototype)
// page key ตรงกับ AppRoot routing (setPage) — ดู AppRoot.jsx switch(page)
// ============================================================
import {
  Package, Database, RotateCcw, TrendingUp, TrendingDown,
  Activity, ShoppingCart, ClipboardList, Users, History, BarChart3,
} from 'lucide-react';

// โครงสร้างเมนู — รองรับ 2 แบบใน group.items:
//   1) leaf item:    { page, icon, title, c, roles }  → ปุ่มเมนูตรง
//   2) submenu:      { key, icon, title, roles, children: [leaf, ...] }  → กดกางแบบ collapsible
// page = key สำหรับ onNavigate (ตรง AppRoot routing), c = สีประจำระบบ, roles ตรงกับ SYSTEMS.roles
export const NAV_GROUPS = [
  {
    label: 'งานประจำวัน', dot: 'bg-emerald-500',
    items: [
      { page: 'requisition', icon: Package,  title: 'เบิกยาออนไลน์',     c: 'blue',   roles: ['requester', 'staff', 'admin'] },
      { page: 'inventory',   icon: Database,  title: 'แผนผังคลังยา',       c: 'indigo', roles: ['requester', 'staff', 'admin'] },
      { page: 'return',      icon: RotateCcw, title: 'คืนยา / ยาเสียหาย', c: 'violet', roles: ['requester', 'staff', 'admin'] },
    ],
  },
  {
    label: 'สรุปและรายงาน', dot: 'bg-blue-500',
    items: [
      {
        key: 'history', icon: History, title: 'ประวัติ', roles: ['requester', 'staff', 'admin'],
        children: [
          { page: 'receive',  icon: TrendingUp,   title: 'ประวัติรับยา',    c: 'emerald', roles: ['requester', 'staff', 'admin'] },
          { page: 'dispense', icon: TrendingDown, title: 'ประวัติเบิกจ่าย', c: 'rose',    roles: ['requester', 'staff', 'admin'] },
        ],
      },
      {
        key: 'analyze', icon: BarChart3, title: 'วิเคราะห์', roles: ['requester', 'staff', 'admin'],
        children: [
          { page: 'analytics', icon: Activity,     title: 'วิเคราะห์การเบิก', c: 'cyan',   roles: ['requester', 'staff', 'admin'] },
          { page: 'reorder',   icon: ShoppingCart, title: 'วิเคราะห์สั่งซื้อ', c: 'orange', roles: ['staff', 'admin'] },
        ],
      },
    ],
  },
  {
    label: 'ควบคุมระบบ', dot: 'bg-slate-500',
    items: [
      { page: 'audit', icon: ClipboardList, title: 'Audit Log',        c: 'amber', roles: ['staff', 'admin'] },
      { page: 'users', icon: Users,         title: 'จัดการผู้ใช้งาน', c: 'slate', roles: ['admin'] },
    ],
  },
];

// flatten leaf items (รวม children ของ submenu) — ใช้โดย DashboardV2Preview/อื่นๆ
export const NAV_ITEMS = NAV_GROUPS.flatMap(g =>
  g.items.flatMap(it => (it.children ? it.children : [it]))
);

// Tailwind ต้องเห็น class เต็มตอน build → map ตรงต่อสี (ห้ามใช้ `bg-${c}-50` — purge ตัด)
export const COLOR = {
  blue:    { icon: 'bg-blue-100 text-blue-600',       activeBg: 'bg-blue-50 text-blue-700',       bar: 'bg-blue-500',    cardBg: 'bg-blue-50 hover:bg-blue-100 border-blue-200' },
  indigo:  { icon: 'bg-indigo-100 text-indigo-600',   activeBg: 'bg-indigo-50 text-indigo-700',   bar: 'bg-indigo-500',  cardBg: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200' },
  violet:  { icon: 'bg-violet-100 text-violet-600',   activeBg: 'bg-violet-50 text-violet-700',   bar: 'bg-violet-500',  cardBg: 'bg-violet-50 hover:bg-violet-100 border-violet-200' },
  emerald: { icon: 'bg-emerald-100 text-emerald-600', activeBg: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500', cardBg: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200' },
  rose:    { icon: 'bg-rose-100 text-rose-600',       activeBg: 'bg-rose-50 text-rose-700',       bar: 'bg-rose-500',    cardBg: 'bg-rose-50 hover:bg-rose-100 border-rose-200' },
  cyan:    { icon: 'bg-cyan-100 text-cyan-600',       activeBg: 'bg-cyan-50 text-cyan-700',       bar: 'bg-cyan-500',    cardBg: 'bg-cyan-50 hover:bg-cyan-100 border-cyan-200' },
  orange:  { icon: 'bg-orange-100 text-orange-600',   activeBg: 'bg-orange-50 text-orange-700',   bar: 'bg-orange-500',  cardBg: 'bg-orange-50 hover:bg-orange-100 border-orange-200' },
  amber:   { icon: 'bg-amber-100 text-amber-600',     activeBg: 'bg-amber-50 text-amber-700',     bar: 'bg-amber-500',   cardBg: 'bg-amber-50 hover:bg-amber-100 border-amber-200' },
  slate:   { icon: 'bg-slate-200 text-slate-600',     activeBg: 'bg-slate-100 text-slate-700',    bar: 'bg-slate-500',   cardBg: 'bg-slate-50 hover:bg-slate-100 border-slate-200' },
};
