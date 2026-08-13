// ============================================================
// navConfig — เมนู sidebar + สีประจำระบบ (shared)
// ใช้ร่วมระหว่าง AppShell.jsx (production) และ DashboardV2Preview.jsx (prototype)
// page key ตรงกับ AppRoot routing (setPage) — ดู AppRoot.jsx switch(page)
// ============================================================
import {
  Package, Database, RotateCcw, TrendingUp, TrendingDown,
  Activity, ShoppingCart, ClipboardList, Users, History, BarChart3, Layers,
  FileText, ClipboardCheck, Send, ScanLine, ListChecks, Building2, ShieldAlert,
  Undo2, CalendarClock, ScrollText, ArrowLeftRight,
} from 'lucide-react';

// โครงสร้างเมนู — รองรับ 3 แบบใน group.items / children:
//   1) leaf item:    { page, icon, title, c, roles }    → ปุ่มเมนูตรง (onNavigate → เปิดหน้า)
//   2) submenu:      { key, icon, title, roles, children: [...] }  → กดกางแบบ collapsible
//   3) action item:  { action, icon, title, c, roles }  → ปุ่มที่ "ทำ action" (เช่น เปิด print) ไม่เปิดหน้า/ไม่เข้า navStack
// page = key สำหรับ onNavigate (ตรง AppRoot routing), action = key สำหรับ onFormAction, c = สีประจำระบบ, roles ตรงกับ SYSTEMS.roles
export const NAV_GROUPS = [
  {
    label: 'งานประจำวัน', dot: 'bg-emerald-500',
    items: [
      { page: 'requisition', icon: Package,  title: 'เบิกยาออนไลน์',     c: 'blue',   roles: ['requester', 'staff', 'admin'] },
      { page: 'inventory',   icon: Database,  title: 'แผนผังคลังยา',       c: 'indigo', roles: ['requester', 'staff', 'admin'] },
      { page: 'return',      icon: RotateCcw, title: 'คืนยา / ยาเสียหาย', c: 'violet', roles: ['requester', 'staff', 'admin'] },
      { page: 'loan',        icon: ArrowLeftRight, title: 'ยืม-คืนยาระหว่าง รพ.', c: 'sky', roles: ['requester', 'staff', 'admin'] },
    ],
  },
  {
    label: 'สรุปและรายงาน', dot: 'bg-blue-500',
    items: [
      {
        key: 'receive', icon: TrendingUp, title: 'ประวัติรับยา', c: 'emerald', roles: ['requester', 'staff', 'admin'],
        children: [
          { page: 'receive',      icon: TrendingUp, title: 'ประวัติรับยา', c: 'emerald', roles: ['requester', 'staff', 'admin'] },
          { page: 'receive-ap',   icon: Send,       title: 'ส่งบัญชี',      c: 'emerald', roles: ['staff', 'admin'] },
          { page: 'receive-scan', icon: ScanLine,   title: 'สแกนบิล',       c: 'emerald', roles: ['staff', 'admin'] },
        ],
      },
      { page: 'dispense', icon: TrendingDown, title: 'ประวัติเบิกจ่าย', c: 'rose', roles: ['requester', 'staff', 'admin'] },
      { page: 'analytics', icon: Activity, title: 'วิเคราะห์การเบิก', c: 'cyan', roles: ['requester', 'staff', 'admin'] },
      { page: 'stockcard', icon: ScrollText, title: 'Stockcard', c: 'teal', roles: ['requester', 'staff', 'admin'] },
      {
        key: 'reorder', icon: ShoppingCart, title: 'วิเคราะห์สั่งซื้อ', c: 'orange', roles: ['staff', 'admin'],
        children: [
          { page: 'reorder',          icon: ListChecks,  title: 'ตารางวิเคราะห์',    c: 'orange', roles: ['staff', 'admin'] },
          { page: 'reorder-supplier', icon: Building2,    title: 'ใบสั่งซื้อแยกบริษัท', c: 'orange', roles: ['staff', 'admin'] },
          { page: 'reorder-verify',   icon: ShieldAlert, title: 'Verification',      c: 'orange', roles: ['staff', 'admin'] },
          { page: 'reorder-history',  icon: History,     title: 'History',           c: 'orange', roles: ['staff', 'admin'] },
        ],
      },
      {
        key: 'forms', icon: FileText, title: 'แบบฟอร์มต่างๆ', c: 'slate', roles: ['requester', 'staff', 'admin'],
        children: [
          { action: 'inspectWorksheet', icon: ClipboardCheck, title: 'ฟอร์มตรวจรับ', c: 'emerald', roles: ['requester', 'staff', 'admin'] },
          { action: 'returnForm',        icon: Undo2,         title: 'ฟอร์มคืนยา', c: 'violet', roles: ['requester', 'staff', 'admin'] },
          { action: 'vendorExchangeForm', icon: CalendarClock, title: 'ฟอร์มคืนยาใกล้หมดอายุ', c: 'orange', roles: ['requester', 'staff', 'admin'] },
        ],
      },
    ],
  },
  {
    label: 'ควบคุมระบบ', dot: 'bg-slate-500',
    items: [
      { page: 'ledger',     icon: Layers,         title: 'ทะเบียนคงคลัง',   c: 'teal',    roles: ['admin'] },
      { page: 'stockcount', icon: ClipboardCheck, title: 'ตรวจนับคงคลัง',   c: 'emerald', roles: ['staff', 'admin'] },
      { page: 'audit',  icon: ClipboardList,  title: 'Audit Log',        c: 'amber', roles: ['staff', 'admin'] },
      { page: 'users',  icon: Users,          title: 'จัดการผู้ใช้งาน', c: 'slate', roles: ['admin'] },
    ],
  },
];

// flatten leaf items (รวม children ของ submenu) — ใช้โดย DashboardV2Preview/อื่นๆ
// กรอง action item ออก (ไม่มี page — ไม่ใช่หน้าให้ navigate)
export const NAV_ITEMS = NAV_GROUPS.flatMap(g =>
  g.items.flatMap(it => (it.children ? it.children : [it]))
).filter(it => it.page);

// Tailwind ต้องเห็น class เต็มตอน build → map ตรงต่อสี (ห้ามใช้ `bg-${c}-50` — purge ตัด)
// hover = สี hover ของเมนู sidebar ตอนยังไม่ active, darkActive = สีเมนู active ในโหมดมืด,
// darkIcon = กล่องไอคอนโหมดมืด (ต้องเขียนเต็ม — purge ตัด class ที่ประกอบด้วย template string)
export const COLOR = {
  blue:    { icon: 'bg-blue-100 text-blue-600',       darkIcon: 'dark:bg-blue-950 dark:text-blue-400',       activeBg: 'bg-blue-50 text-blue-700',       darkActive: 'dark:bg-blue-950 dark:text-blue-300',       bar: 'bg-blue-500',    hover: 'hover:bg-blue-50 hover:text-blue-700',       cardBg: 'bg-blue-50 hover:bg-blue-100 border-blue-200' },
  indigo:  { icon: 'bg-indigo-100 text-indigo-600',   darkIcon: 'dark:bg-indigo-950 dark:text-indigo-400',   activeBg: 'bg-indigo-50 text-indigo-700',   darkActive: 'dark:bg-indigo-950 dark:text-indigo-300',   bar: 'bg-indigo-500',  hover: 'hover:bg-indigo-50 hover:text-indigo-700',   cardBg: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200' },
  violet:  { icon: 'bg-violet-100 text-violet-600',   darkIcon: 'dark:bg-violet-950 dark:text-violet-400',   activeBg: 'bg-violet-50 text-violet-700',   darkActive: 'dark:bg-violet-950 dark:text-violet-300',   bar: 'bg-violet-500',  hover: 'hover:bg-violet-50 hover:text-violet-700',   cardBg: 'bg-violet-50 hover:bg-violet-100 border-violet-200' },
  emerald: { icon: 'bg-emerald-100 text-emerald-600', darkIcon: 'dark:bg-emerald-950 dark:text-emerald-400', activeBg: 'bg-emerald-50 text-emerald-700', darkActive: 'dark:bg-emerald-950 dark:text-emerald-300', bar: 'bg-emerald-500', hover: 'hover:bg-emerald-50 hover:text-emerald-700', cardBg: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200' },
  rose:    { icon: 'bg-rose-100 text-rose-600',       darkIcon: 'dark:bg-rose-950 dark:text-rose-400',       activeBg: 'bg-rose-50 text-rose-700',       darkActive: 'dark:bg-rose-950 dark:text-rose-300',       bar: 'bg-rose-500',    hover: 'hover:bg-rose-50 hover:text-rose-700',       cardBg: 'bg-rose-50 hover:bg-rose-100 border-rose-200' },
  cyan:    { icon: 'bg-cyan-100 text-cyan-600',       darkIcon: 'dark:bg-cyan-950 dark:text-cyan-400',       activeBg: 'bg-cyan-50 text-cyan-700',       darkActive: 'dark:bg-cyan-950 dark:text-cyan-300',       bar: 'bg-cyan-500',    hover: 'hover:bg-cyan-50 hover:text-cyan-700',       cardBg: 'bg-cyan-50 hover:bg-cyan-100 border-cyan-200' },
  orange:  { icon: 'bg-orange-100 text-orange-600',   darkIcon: 'dark:bg-orange-950 dark:text-orange-400',   activeBg: 'bg-orange-50 text-orange-700',   darkActive: 'dark:bg-orange-950 dark:text-orange-300',   bar: 'bg-orange-500',  hover: 'hover:bg-orange-50 hover:text-orange-700',   cardBg: 'bg-orange-50 hover:bg-orange-100 border-orange-200' },
  amber:   { icon: 'bg-amber-100 text-amber-600',     darkIcon: 'dark:bg-amber-950 dark:text-amber-400',     activeBg: 'bg-amber-50 text-amber-700',     darkActive: 'dark:bg-amber-950 dark:text-amber-300',     bar: 'bg-amber-500',   hover: 'hover:bg-amber-50 hover:text-amber-700',     cardBg: 'bg-amber-50 hover:bg-amber-100 border-amber-200' },
  teal:    { icon: 'bg-teal-100 text-teal-600',       darkIcon: 'dark:bg-teal-950 dark:text-teal-400',       activeBg: 'bg-teal-50 text-teal-700',       darkActive: 'dark:bg-teal-950 dark:text-teal-300',       bar: 'bg-teal-500',    hover: 'hover:bg-teal-50 hover:text-teal-700',       cardBg: 'bg-teal-50 hover:bg-teal-100 border-teal-200' },
  slate:   { icon: 'bg-slate-200 text-slate-600',     darkIcon: 'dark:bg-slate-800 dark:text-slate-300',     activeBg: 'bg-slate-100 text-slate-700',    darkActive: 'dark:bg-slate-800 dark:text-slate-200',     bar: 'bg-slate-500',   hover: 'hover:bg-slate-100 hover:text-slate-700',    cardBg: 'bg-slate-50 hover:bg-slate-100 border-slate-200' },
  sky:     { icon: 'bg-sky-100 text-sky-600',         darkIcon: 'dark:bg-sky-950 dark:text-sky-400',         activeBg: 'bg-sky-50 text-sky-700',         darkActive: 'dark:bg-sky-950 dark:text-sky-300',         bar: 'bg-sky-500',     hover: 'hover:bg-sky-50 hover:text-sky-700',         cardBg: 'bg-sky-50 hover:bg-sky-100 border-sky-200' },
};
