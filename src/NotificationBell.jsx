// ============================================================
// NotificationBell — กระดิ่งแจ้งเตือนในแอป (YouTube-style)
// derived read-only view เหนือ audit_logs — แสดงบน AppShell จึงติดตามผู้ใช้ทุกหน้า
//
// scope ต่อ role (ดู CONTEXT.md §"การแจ้งเตือนในแอป"):
//   staff/admin = global feed (เห็นทุกเหตุการณ์)
//   requester   = department-scoped (เฉพาะเหตุการณ์ของแผนกตัวเอง)
// ============================================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X } from 'lucide-react';
import { supabase } from './lib/supabase';
import { fetchNotifications } from './lib/db';

// ---- Notification label + copy (key ต้องตรงกับ NOTIFY_ACTIONS ใน db.js) ----
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
  insert_return:                { label: 'ส่งคำขอคืนยา',         color: 'text-blue-600',   dot: 'bg-blue-400'  },
  confirm_return:               { label: 'ยืนยันรับคืนยา',        color: 'text-emerald-600',dot: 'bg-emerald-400'},
  update_return:                { label: 'แก้ไขรายการคืนยา',     color: 'text-amber-600',  dot: 'bg-amber-400' },
  delete_return:                { label: 'ลบรายการคืนยา',        color: 'text-red-600',    dot: 'bg-red-400'   },
  flag_swap_return:             { label: 'แจ้งเปลี่ยน/คืนยา',    color: 'text-amber-700 dark:text-amber-300',  dot: 'bg-amber-500' },
  swap_return_action:           { label: 'ดำเนินการคืนบริษัท',   color: 'text-amber-700 dark:text-amber-300',  dot: 'bg-amber-500' },
  insert_drug_loan:             { label: 'บันทึกยืมยา',           color: 'text-sky-700 dark:text-sky-300',      dot: 'bg-sky-500' },
  return_drug_loan:             { label: 'รับคืนยาที่ยืม',        color: 'text-sky-700 dark:text-sky-300',      dot: 'bg-sky-500' },
  update_drug_loan:             { label: 'แก้ไขรายการยืม-คืน',   color: 'text-sky-700 dark:text-sky-300',      dot: 'bg-sky-500' },
  delete_drug_loan:             { label: 'ลบรายการยืม-คืน',      color: 'text-rose-700 dark:text-rose-300',    dot: 'bg-rose-500' },
  import_drug_loan:             { label: 'นำเข้าไฟล์ยืม-คืนยา',  color: 'text-sky-700 dark:text-sky-300',      dot: 'bg-sky-500' },
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
  print_po:                     { label: 'พิมพ์ใบสั่งซื้อ',        color: 'text-slate-700 dark:text-slate-200',   dot: 'bg-slate-500'  },
  // ── บอทประกาศ LINE ──
  line_quota_low:               { label: 'โควตาแจ้งเตือน LINE ใกล้หมด', color: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  // ── Stock Count (ตรวจนับคงคลัง) ──
  create_stock_count:           { label: 'ตรวจนับคงคลัง',         color: 'text-emerald-600', dot: 'bg-emerald-400' },
  create_temperature_log:       { label: 'บันทึกอุณหภูมิตู้เย็น',  color: 'text-sky-600',     dot: 'bg-sky-400' },
  import_temperature_log:       { label: 'นำเข้าอุณหภูมิจากเครื่อง', color: 'text-sky-600',    dot: 'bg-sky-400' },
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
      return `${who} ส่งคำขอคืนยา "${d.drug_name || ''}" ${d.qty ? `${d.qty} หน่วย` : ''} · ${n.department} — รอเจ้าหน้าที่คลังดำเนินการ`;
    case 'confirm_return':
      return `${who} ยืนยันรับคืนยาแล้ว${d.received_by ? ` · ${d.received_by}` : ''}`;
    case 'update_return':
      return `${who} แก้ไขรายการคืนยา${d.drug_name ? ` "${d.drug_name}"` : ''}`;
    case 'delete_return':
      return `${who} ลบรายการคืนยา · ${n.department}`;
    case 'flag_swap_return':
      return `${who} แจ้งเปลี่ยน/คืนยา "${d.drug_name || ''}"${d.lot ? ` Lot ${d.lot}` : ''}${d.company ? ` · ${d.company}` : ''}${d.deadline ? ` — ต้องคืนภายใน ${d.deadline}` : ''}`;
    case 'swap_return_action':
      return `${who} อัปเดตการดำเนินการคืนบริษัท "${d.drug_name || ''}"${d.lot ? ` Lot ${d.lot}` : ''} — ${d.status_label || d.status}${d.action_date ? ` (${d.action_date})` : ''}`;
    case 'insert_drug_loan':
      return `${who} บันทึก${d.direction_label || 'ยืมยา'} "${d.drug_name || ''}"${d.lot ? ` Lot ${d.lot}` : ''}${d.counterparty ? ` · ${d.counterparty}` : ''}`;
    case 'return_drug_loan':
      return `${who} บันทึกรับคืนยา "${d.drug_name || ''}"${d.lot ? ` Lot ${d.lot}` : ''}${d.counterparty ? ` · ${d.counterparty}` : ''}`;
    case 'update_drug_loan':
      return `${who} แก้ไขรายการยืม-คืน "${d.drug_name || ''}"${d.counterparty ? ` · ${d.counterparty}` : ''}`;
    case 'delete_drug_loan':
      return `${who} ลบรายการยืม-คืน "${d.drug_name || ''}"${d.counterparty ? ` · ${d.counterparty}` : ''}`;
    case 'import_drug_loan':
      return `${who} นำเข้าไฟล์ยืม-คืนยา${d.file_name ? ` "${d.file_name}"` : ''} — เพิ่ม ${d.inserted || 0} · อัปเดต ${d.updated || 0}${d.deleted ? ` · ลบ ${d.deleted}` : ''} รายการ`;
    case 'line_quota_low': {
      // ประกาศเข้ากลุ่ม LINE นับโควตารายหัว → เดือนหนึ่งส่งได้จำกัด
      // ข้อความนี้เห็นเฉพาะในแอป (ไม่ส่งเข้ากลุ่ม) — คลังเป็นคนต้องรู้ ไม่ใช่ ward
      const used = d.quota_used != null && d.quota_limit != null
        ? ` (ใช้ ${d.quota_used}/${d.quota_limit})` : '';
      // บอท 2 ตัวใช้ action นี้ร่วมกัน แยกด้วย details.bot (ไม่มี = บอทประกาศ, record เก่า)
      const noun = d.bot === 'expiry' ? 'การแจ้งเตือนยาใกล้หมดอายุ' : 'ประกาศรอบเบิก-รับ';
      if (d.skipped_announcement)
        return `โควตาแจ้งเตือน LINE หมดแล้ว${used} — ${noun}วันนี้ไม่ได้ส่งเข้ากลุ่ม จะกลับมาส่งอัตโนมัติต้นเดือนหน้า`;
      if (d.exhausted)
        return `ส่ง${noun}ครั้งสุดท้ายของเดือนแล้ว${used} — หลังจากนี้กลุ่มจะไม่ได้รับจนถึงสิ้นเดือน`;
      return `โควตาแจ้งเตือน LINE ใกล้หมด${used} — ส่ง${noun}เข้ากลุ่มได้อีก ${d.sends_left} ครั้ง`;
    }
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

// requester เห็นเฉพาะเหตุการณ์ของแผนกตัวเอง:
//   - action ที่ requester ทำเอง (submit/edit/delete) → audit_logs.department = แผนกตัวเอง
//   - lifecycle ที่ staff ทำ (picking/verify/dispense/received) → details.req_department = แผนกต้นทาง
//     (audit_logs.department ของแถวเหล่านี้ = แผนกของ staff จึงใช้ scope ไม่ได้ — ดู CONTEXT.md)
const matchesDept = (n, dept) =>
  n.department === dept || (n.details && n.details.req_department === dept);

export default function NotificationBell({ auth, onNavigate, dropdownAlign = 'right', onBlue = false }) {
  const isStaff = auth.role === 'staff' || auth.role === 'admin';
  const scopeDept = isStaff ? null : (auth.department || null); // null = global feed

  const LAST_READ_KEY = `notif_last_read_${auth.id}`;
  const [notifs, setNotifs]       = useState([]);
  const [showBell, setShowBell]   = useState(false);
  const [lastRead, setLastRead]   = useState(() => localStorage.getItem(LAST_READ_KEY) || null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const bellRef = useRef(null);

  const unreadCount = notifs.filter(n => !lastRead || new Date(n.created_at) > new Date(lastRead)).length;

  const markRead = useCallback(() => {
    const now = new Date().toISOString();
    localStorage.setItem(LAST_READ_KEY, now);
    setLastRead(now);
  }, [LAST_READ_KEY]);

  const loadNotifs = useCallback(() => {
    fetchNotifications(scopeDept ? { department: scopeDept } : undefined)
      .then(setNotifs)
      .catch(() => {});
  }, [scopeDept]);

  // โหลด feed + subscribe realtime (ทุก role)
  useEffect(() => {
    if (!supabase) return;
    loadNotifs();
    const sub = supabase
      .channel('notif-bell')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, (payload) => {
        const row = payload.new;
        if (!NOTIFY_ACTIONS.includes(row.action)) return;
        if (scopeDept && !matchesDept(row, scopeDept)) return; // requester: เฉพาะแผนกตัวเอง
        setNotifs(prev => [row, ...prev].slice(0, 30));
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [loadNotifs, scopeDept]);

  // Online presence (แสดงในหัว dropdown)
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

  // ปิด dropdown เมื่อคลิกนอก
  useEffect(() => {
    if (!showBell) return;
    const handler = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) setShowBell(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showBell]);

  return (
    <div className="relative" ref={bellRef}>
      <button
        onClick={() => { setShowBell(v => { if (!v) markRead(); return !v; }); }}
        className={`relative p-2 rounded-xl transition-colors ${onBlue ? 'text-indigo-100 hover:text-white hover:bg-white/10' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
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
        <div className={`fixed left-2 right-2 top-16 w-auto sm:absolute sm:top-full sm:mt-2 sm:w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden ${dropdownAlign === 'left' ? 'sm:right-auto sm:left-0' : 'sm:left-auto sm:right-0'}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800">
            <span className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
              <Bell size={14} className="text-slate-500 dark:text-slate-400" /> การแจ้งเตือน
              {notifs.length > 0 && (
                <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">7 วันล่าสุด</span>
              )}
            </span>
            <button onClick={() => setShowBell(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* ── ผู้ใช้งานออนไลน์ขณะนี้ ── */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-emerald-50 dark:bg-emerald-950/40">
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
              ออนไลน์ขณะนี้
              <span className="ml-auto font-semibold text-emerald-600 bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-full">
                {onlineUsers.length} คน
              </span>
            </p>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {onlineUsers.length === 0
                ? <p className="text-xs text-slate-400 dark:text-slate-500">ไม่มีผู้ใช้งาน</p>
                : onlineUsers.map((u, i) => {
                  const isMe = String(u.user_id) === String(auth.id);
                  const roleLabel = u.role === 'admin' ? 'ผู้ดูแล' : u.role === 'staff' ? 'เจ้าหน้าที่' : 'ผู้ใช้';
                  const roleColor = u.role === 'admin' ? 'text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-950/60' : u.role === 'staff' ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/60' : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800';
                  return (
                    <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isMe ? 'bg-emerald-100 dark:bg-emerald-950/60' : 'bg-white dark:bg-slate-900'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate flex-1">
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

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {notifs.length === 0
              ? (
                <div className="py-8 text-center">
                  <Bell size={28} className="text-slate-300 dark:text-slate-500 mx-auto mb-2" />
                  <p className="text-slate-400 dark:text-slate-500 text-sm">ไม่มีการแจ้งเตือน</p>
                </div>
              )
              : notifs.map(n => {
                const meta = NOTIF_LABELS[n.action] || { label: n.action, color: 'text-slate-600 dark:text-slate-300', dot: 'bg-slate-400' };
                const isNew = !lastRead || new Date(n.created_at) > new Date(lastRead);
                return (
                  <div key={n.id} className={`px-4 py-3 ${isNew ? 'bg-blue-50 dark:bg-blue-950/40' : ''}`}>
                    <div className="flex items-start gap-2.5">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${meta.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold ${meta.color}`}>{meta.label}</p>
                        <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug mt-0.5 break-words">{notifMessage(n)}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                      {isNew && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
                    </div>
                  </div>
                );
              })
            }
          </div>

          {notifs.length > 0 && onNavigate && (
            <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-center">
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
  );
}
