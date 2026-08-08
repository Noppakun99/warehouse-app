// ============================================================
// DashboardV2Preview — PROTOTYPE ชั่วคราว (throwaway)
// ------------------------------------------------------------
// หน้า mockup ดูภาพ "Dashboard แบบ sidebar" สไตล์ ref (Nexus/Shopeers)
// กับเนื้อหาคลังยาจริง — ใช้ MOCK DATA ทั้งหมด ไม่ต่อ db.js / supabase
// เปิดดูที่ URL `?v2` (ดู AppRoot.jsx) — ปกติไม่ถูก render
//
// ⚠️ นี่คือ prototype สำหรับตัดสินใจ design เท่านั้น — ถ้าไม่เอา ลบไฟล์นี้
//    + ลบ 2 จุดใน AppRoot.jsx (import + early-return ?v2) ก็จบ
// ============================================================
import React, { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  Pill, Package, Database, RotateCcw, TrendingUp, TrendingDown, Activity,
  ClipboardList, Users, ShoppingCart, Boxes, AlertTriangle, Search, Bell,
  ChevronLeft, LayoutDashboard,
} from 'lucide-react';

// ── เมนู sidebar = SYSTEMS จริงของแอป จัดกลุ่มตาม GROUPS (workflow) ──
// สี = palette ประจำระบบจาก AppRoot.jsx SYSTEMS (+ reorder = orange ตาม ReorderApp)
// แต่ละ item: c = base color name (Tailwind) ใช้สร้าง icon/active class
// (สำเนาแบบย่อจาก AppRoot.jsx เพื่อให้ไฟล์ standalone — prototype เท่านั้น)
const NAV_GROUPS = [
  {
    label: 'งานประจำวัน', dot: 'bg-emerald-500',
    items: [
      { key: 'requisition', icon: Package,  title: 'เบิกยาออนไลน์',     c: 'blue'    },
      { key: 'inventory',   icon: Database,  title: 'แผนผังคลังยา',       c: 'indigo'  },
      { key: 'return',      icon: RotateCcw, title: 'คืนยา / ยาเสียหาย', c: 'violet'  },
    ],
  },
  {
    label: 'สรุปและรายงาน', dot: 'bg-blue-500',
    items: [
      { key: 'receive',   icon: TrendingUp,   title: 'ประวัติรับยา',     c: 'emerald' },
      { key: 'dispense',  icon: TrendingDown, title: 'ประวัติเบิกจ่าย',  c: 'rose'    },
      { key: 'analytics', icon: Activity,     title: 'วิเคราะห์การเบิก', c: 'cyan'    },
      { key: 'reorder',   icon: ShoppingCart, title: 'วิเคราะห์สั่งซื้อ', c: 'orange'  },
    ],
  },
  {
    label: 'ควบคุมระบบ', dot: 'bg-slate-500',
    items: [
      { key: 'audit', icon: ClipboardList, title: 'Audit Log',        c: 'amber' },
      { key: 'users', icon: Users,         title: 'จัดการผู้ใช้งาน', c: 'slate' },
    ],
  },
];

// flat map สำหรับ shortcut cards + lookup สี (เลี่ยง dynamic class string ที่ Tailwind purge ไม่เห็น)
const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

// Tailwind ต้องเห็น class เต็มตอน build → map ตรงต่อสี (อย่าใช้ `bg-${c}-50`)
const COLOR = {
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

// ── MOCK DATA (ตัวเลขสมมติ — ไม่ใช่ของจริง) ──
const MOCK = {
  stats: [
    { label: 'รายการยาในคลัง',     value: '1,284', icon: Boxes,         iconBg: 'bg-sky-100 text-sky-600',       trend: null },
    { label: 'ใบเบิกรอดำเนินการ',  value: '8',     icon: ClipboardList, iconBg: 'bg-amber-100 text-amber-600',   trend: { pct: 12, up: true } },
    { label: 'ยาใกล้หมดอายุ',      value: '23',    icon: AlertTriangle, iconBg: 'bg-orange-100 text-orange-600', trend: { pct: 4, up: false } },
    { label: 'Stock ต่ำกว่ากำหนด', value: '17',    icon: ShoppingCart,  iconBg: 'bg-rose-100 text-rose-600',     trend: { pct: 9, up: true } },
  ],
  dispense: [
    { label: 'ม.ค.', count: 420 }, { label: 'ก.พ.', count: 510 }, { label: 'มี.ค.', count: 480 },
    { label: 'เม.ย.', count: 620 }, { label: 'พ.ค.', count: 580 }, { label: 'มิ.ย.', count: 690 },
  ],
  receive: [
    { label: 'ม.ค.', count: 38 }, { label: 'ก.พ.', count: 44 }, { label: 'มี.ค.', count: 41 },
    { label: 'เม.ย.', count: 52 }, { label: 'พ.ค.', count: 47 }, { label: 'มิ.ย.', count: 55 },
  ],
  top5: [
    { code: 'A001', name: 'Atorvastatin 40mg',  qty: 120,  ss: 600,  unit: '300เม็ด', ratio: 0.20 },
    { code: 'A014', name: 'Amlodipine 5mg',      qty: 340,  ss: 900,  unit: '500เม็ด', ratio: 0.38 },
    { code: 'M027', name: 'Metformin 500mg',     qty: 80,   ss: 400,  unit: '100เม็ด', ratio: 0.20 },
    { code: 'O009', name: 'Omeprazole 20mg',     qty: 210,  ss: 480,  unit: '30เม็ด',  ratio: 0.44 },
    { code: 'P033', name: 'Paracetamol 500mg',   qty: 1500, ss: 4000, unit: '1000เม็ด',ratio: 0.38 },
  ],
};

function TrendBadge({ trend }) {
  if (!trend) return null;
  const Icon = trend.up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${trend.up ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
      <Icon size={12} /> {trend.pct}%
    </span>
  );
}

export default function DashboardV2Preview({ onExit }) {
  const [active, setActive] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex">
      {/* ───── Sidebar ───── */}
      <aside className={`${collapsed ? 'w-16' : 'w-60'} shrink-0 bg-white border-r border-slate-200 flex flex-col transition-all duration-200 sticky top-0 h-screen`}>
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 h-16 border-b border-slate-100">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white shrink-0"><Pill size={18} /></div>
          {!collapsed && <span className="font-black text-slate-800 tracking-tight">คลังยา</span>}
          <button onClick={() => setCollapsed(c => !c)} className="ml-auto p-1 rounded-lg text-slate-400 hover:bg-slate-100">
            <ChevronLeft size={16} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Dashboard link */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5">
          <button
            onClick={() => setActive('dashboard')}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-semibold transition-colors ${active === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <LayoutDashboard size={17} className="shrink-0" />
            {!collapsed && 'หน้าหลัก'}
          </button>

          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              {!collapsed && (
                <div className="flex items-center gap-2 px-2.5 mb-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${group.dot}`} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{group.label}</span>
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const Icon = item.icon;
                  const on = active === item.key;
                  const col = COLOR[item.c];
                  return (
                    <button
                      key={item.key}
                      onClick={() => setActive(item.key)}
                      title={item.title}
                      className={`relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${on ? `${col.activeBg} font-semibold` : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                      {/* แถบสีซ้าย — เฉพาะ active */}
                      {on && <span className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full ${col.bar}`} />}
                      {/* ไอคอนในกล่องสีประจำระบบ */}
                      <span className={`p-1 rounded-md shrink-0 ${col.icon}`}><Icon size={15} /></span>
                      {!collapsed && <span className="truncate">{item.title}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Exit preview */}
        <div className="p-3 border-t border-slate-100">
          <button onClick={onExit} className="w-full text-xs text-slate-400 hover:text-slate-600 py-1.5">
            {collapsed ? '✕' : '← ออกจาก preview'}
          </button>
        </div>
      </aside>

      {/* ───── Main ───── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center gap-4 px-6 sticky top-0 z-10">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="ค้นหายา / ใบเบิก / บิล..."
            />
          </div>
          <button className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 relative">
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
          </button>
          <div className="flex items-center gap-2.5 pl-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white flex items-center justify-center text-sm font-bold">ภ</div>
            <div className="hidden sm:block leading-tight">
              <p className="text-sm font-bold text-slate-800">เภสัชกร (mock)</p>
              <p className="text-xs text-slate-400">เจ้าหน้าที่คลัง</p>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">หน้าหลัก</h1>
            <p className="text-sm text-slate-500 mt-0.5">ภาพรวมคลังยา — <span className="text-orange-500 font-semibold">ข้อมูลตัวอย่าง (mock) สำหรับดูดีไซน์เท่านั้น</span></p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {MOCK.stats.map(s => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`p-1.5 rounded-lg ${s.iconBg}`}><Icon size={16} /></div>
                    <TrendBadge trend={s.trend} />
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{s.label}</p>
                </div>
              );
            })}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-600"><Activity size={15} /></div>
                <span className="text-sm font-bold text-slate-700">การเบิกจ่ายรายเดือน</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={MOCK.dispense} margin={{ top: 5, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip formatter={(v) => [`${v} ครั้ง`, 'เบิกจ่าย']} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3, fill: '#6366f1' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-sky-100 text-sky-600"><Package size={15} /></div>
                <span className="text-sm font-bold text-slate-700">การรับเข้ารายเดือน</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={MOCK.receive} margin={{ top: 5, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip formatter={(v) => [`${v} ครั้ง`, 'รับเข้า']} cursor={{ fill: '#f8fafc' }} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#38bdf8" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top5 ยาต้องสั่งซื้อ */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <div className="p-1.5 rounded-lg bg-amber-100 text-amber-600"><ShoppingCart size={15} /></div>
              <span className="text-sm font-bold text-slate-700">ยาต้องสั่งซื้อ</span>
              <span className="text-xs text-slate-400">ต่ำกว่า Safety Stock</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-2 font-semibold">ชื่อยา</th>
                  <th className="px-4 py-2 font-semibold text-right">คงเหลือ</th>
                  <th className="px-4 py-2 font-semibold text-right">Safety Stock</th>
                  <th className="px-4 py-2 font-semibold text-right">% ของ SS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {MOCK.top5.map(r => (
                  <tr key={r.code} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/60">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-slate-700 leading-tight">{r.name}</p>
                      <p className="text-xs text-slate-400">{r.code}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-red-600">{r.qty.toLocaleString()} <span className="font-normal text-slate-400 text-xs">{r.unit}</span></td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{r.ss.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-amber-600">{Math.round(r.ratio * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ทางลัดเข้าแต่ละระบบ — การ์ดไอคอนสีประจำระบบ */}
          <div>
            <h2 className="text-sm font-bold text-slate-700 mb-3">เข้าใช้งานระบบ</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {NAV_ITEMS.map(item => {
                const Icon = item.icon;
                const col = COLOR[item.c];
                return (
                  <button
                    key={item.key}
                    onClick={() => setActive(item.key)}
                    className={`flex flex-col items-start gap-2.5 border rounded-2xl p-3.5 text-left shadow-sm transition-colors ${col.cardBg}`}
                  >
                    <span className={`p-2 rounded-lg ${col.icon}`}><Icon size={18} /></span>
                    <span className="text-sm font-semibold text-slate-700 leading-tight">{item.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
