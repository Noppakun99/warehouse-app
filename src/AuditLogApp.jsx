import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCcw, Search, ClipboardList, Pencil, Trash2, X, Save, CheckSquare, BarChart3, Users, TrendingUp, Filter, ChevronDown } from 'lucide-react';
import { fetchAuditLogs, updateAuditLog, deleteAuditLog, bulkDeleteAuditLogs, fetchUserActivityStats } from './lib/db';
import BackButton from './BackButton';
import { useSort, SortableTh } from './SortableTable';

const ROLE_LABELS = { admin: 'ผู้ดูแลระบบ', staff: 'เจ้าหน้าที่คลัง', requester: 'ผู้เบิก' };
const roleLabel = (r) => ROLE_LABELS[r] || r || '-';

// สรุปการใช้งานระบบ (admin-only) — derived จาก audit_logs (login event), cap 90 วัน
function UsageAnalyticsPanel() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setStats(await fetchUserActivityStats()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center text-slate-400 dark:text-slate-500 py-16 text-sm">กำลังโหลด…</div>;
  if (error) return <div className="text-center text-red-500 py-16 text-sm">โหลดข้อมูลล้มเหลว: {error}</div>;
  if (!stats) return <div className="text-center text-slate-400 dark:text-slate-500 py-16 text-sm">ยังไม่มีข้อมูลการใช้งาน</div>;

  const { dau, wau, mau, stickiness, trend, byRole, users, capDays, dataFrom } = stats;
  const maxTrend = Math.max(1, ...trend.map(d => d.count));
  const maxRole = Math.max(1, ...byRole.map(r => r.count));
  const fmtDate = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} น.`;
  };
  const cards = [
    { label: 'ผู้ใช้วันนี้ (DAU)', value: dau, icon: Users, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'ผู้ใช้ 7 วัน (WAU)', value: wau, icon: Users, color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/40' },
    { label: 'ผู้ใช้ 30 วัน (MAU)', value: mau, icon: Users, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40' },
    { label: 'Stickiness (DAU/MAU)', value: `${Math.round(stickiness * 100)}%`, icon: TrendingUp, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
  ];

  return (
    <div className="space-y-4">
      {/* caption ความครอบคลุมข้อมูล — staleness มองเห็นได้ (Rule #18) */}
      <p className="text-xs text-slate-400 dark:text-slate-500">
        นับจากการเข้าสู่ระบบ (login) ย้อนหลังสูงสุด {capDays} วัน — ข้อมูลเก่ากว่านี้ถูกลบตามนโยบายเก็บ log
        {dataFrom && <> · มีข้อมูลตั้งแต่ {fmtDate(dataFrom)}</>}
      </p>

      {/* stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
            <div className={`inline-flex p-2 rounded-lg mb-2 ${c.color}`}><c.icon size={16} /></div>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 leading-none">{c.value}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* กราฟแนวโน้ม 30 วัน */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">แนวโน้มผู้เข้าใช้รายวัน (30 วัน)</h3>
          <div className="flex items-end gap-0.5 h-32">
            {trend.map(d => (
              <div key={d.ymd} className="flex-1 group relative flex items-end" title={`${d.ymd}: ${d.count} คน`}>
                <div className="w-full bg-sky-400 rounded-t hover:bg-sky-500 transition-colors"
                  style={{ height: `${(d.count / maxTrend) * 100}%`, minHeight: d.count > 0 ? '3px' : '0' }} />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-1">
            <span>{trend[0]?.ymd.slice(5)}</span>
            <span>{trend[trend.length - 1]?.ymd.slice(5)}</span>
          </div>
        </div>

        {/* active ตาม role */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">ผู้ใช้ active ตามบทบาท (30 วัน)</h3>
          {byRole.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-8 text-center">ไม่มีข้อมูล</p>
          ) : (
            <div className="space-y-2.5">
              {byRole.map(r => (
                <div key={r.role} className="flex items-center gap-2">
                  <span className="w-24 text-xs text-slate-500 dark:text-slate-400 shrink-0">{roleLabel(r.role)}</span>
                  <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-5 overflow-hidden">
                    <div className="bg-indigo-400 h-full rounded-full flex items-center justify-end px-2"
                      style={{ width: `${(r.count / maxRole) * 100}%`, minWidth: '1.5rem' }}>
                      <span className="text-[10px] font-semibold text-white">{r.count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ตารางรายคน */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">รายละเอียดผู้ใช้</h3>
          <button onClick={load} className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="โหลดใหม่"><RefreshCcw size={14} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-2 font-semibold">ผู้ใช้</th>
                <th className="px-4 py-2 font-semibold">บทบาท</th>
                <th className="px-4 py-2 font-semibold text-right">เข้าใช้ล่าสุด</th>
                <th className="px-4 py-2 font-semibold text-right">จำนวนครั้ง</th>
                <th className="px-4 py-2 font-semibold text-center">วันนี้</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500 text-xs">ไม่มีการเข้าใช้ใน {capDays} วันที่ผ่านมา</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-200">{u.name}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-xs">{roleLabel(u.role)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{fmtDate(u.lastLogin)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-200">{u.count.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-center">
                    {u.activeToday
                      ? <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="เข้าใช้วันนี้" />
                      : <span className="inline-block w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700" title="ไม่ได้เข้าใช้วันนี้" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// role ในระบบ → คำที่คนอ่านเข้าใจ (audit log ไม่ควรโชว์ศัพท์ระบบดิบ)
const ROLE_TH = {
  admin: 'ผู้ดูแลระบบ',
  staff: 'เจ้าหน้าที่คลังยา',
  requester: 'ผู้เบิก',
};

// id/uuid ภายใน — ไม่มีความหมายกับคนอ่าน ซ่อนจากบรรทัดรายละเอียด (ยังอยู่ใน DB ใช้คำนวณสถิติได้)
const HIDDEN_DETAIL_KEYS = new Set(['user_id', 'session_id', 'row_id', 'id', 'item_ids', 'ids']);

// ชื่อฟิลด์ดิบ → ภาษาไทย สำหรับ action ที่ยังไม่มี case เฉพาะ
const DETAIL_LABELS = {
  role: 'สิทธิ์', drug_code: 'รหัสยา', drug_name: 'ยา', lot: 'Lot', qty: 'จำนวน',
  company: 'บริษัท', supplier: 'บริษัท', department: 'หน่วยงาน', reason: 'เหตุผล',
  count: 'จำนวนรายการ', rows: 'จำนวนแถว', file_name: 'ไฟล์', filename: 'ไฟล์',
  sheet: 'ชีต', period: 'งวด', status: 'สถานะ', note: 'หมายเหตุ', exp: 'วันหมดอายุ',
  deadline: 'กำหนด', bill_number: 'เลขที่บิล', po_number: 'เลขที่ PO',
};

const ACTION_LABELS = {
  import_inventory:             { label: 'นำเข้า Inventory',       color: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'      },
  import_receive:               { label: 'นำเข้าประวัติรับยา',      color: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'  },
  import_dispense:              { label: 'นำเข้าประวัติเบิกจ่าย',   color: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'     },
  scan_invoice:                 { label: 'สแกนบิลรับยา',            color: 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300'     },
  map_drug_alias:               { label: 'จับคู่ชื่อยา→รหัส',        color: 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'     },
  insert_return:                { label: 'ส่งคำขอคืนยา',             color: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300'  },
  confirm_return:               { label: 'ยืนยันรับคืนยา',           color: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'},
  update_return:                { label: 'แก้ไขรายการคืนยา',         color: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'   },
  delete_return:                { label: 'ลบรายการคืนยา',            color: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'       },
  flag_swap_return:             { label: 'แจ้งเปลี่ยน/คืนยา',        color: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'   },
  swap_return_action:           { label: 'ดำเนินการคืนบริษัท',       color: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'   },
  add_holiday:                  { label: 'เพิ่มวันหยุดราชการ',       color: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'           },
  edit_holiday:                 { label: 'แก้ไขวันหยุดราชการ',       color: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'           },
  delete_holiday:               { label: 'ลบวันหยุดราชการ',          color: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'       },
  line_announce:                { label: 'ประกาศรอบเบิก-รับ (LINE)', color: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'},
  line_expiry_alert:            { label: 'แจ้งเตือนยาใกล้หมดอายุ (LINE)', color: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'},
  line_quota_low:               { label: 'โควตาแจ้งเตือน LINE ใกล้หมด', color: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'    },
  insert_drug_loan:             { label: 'บันทึกยืมยา',               color: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'           },
  return_drug_loan:             { label: 'รับคืนยาที่ยืม',            color: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'           },
  update_drug_loan:             { label: 'แก้ไขรายการยืม-คืน',       color: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'           },
  delete_drug_loan:             { label: 'ลบรายการยืม-คืน',          color: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'        },
  seed_swap_policy:             { label: 'อัปเดตนโยบายคืนยา',        color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'   },
  export_excel:                 { label: 'ส่งออก Excel',             color: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'},
  submit_requisition:           { label: 'ส่งใบเบิกยา',             color: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'        },
  requester_edit_requisition:   { label: 'แก้ไขใบเบิก',             color: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'    },
  requester_delete_requisition: { label: 'ลบใบเบิก',                color: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'        },
  delete_requisition:           { label: 'ลบใบเบิก (staff)',         color: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'        },
  update_requisition:           { label: 'แก้ไขใบเบิก (staff)',      color: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'    },
  picking_requisition:          { label: 'จัดยา (Picking)',          color: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'     },
  verify_requisition:           { label: 'ตรวจสอบใบเบิก',           color: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300' },
  dispense_requisition:         { label: 'จ่ายยา',                   color: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'},
  received_requisition:         { label: 'รับยาที่หน่วยงาน',         color: 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'     },
  delete_dispense:              { label: 'ลบรายการจ่ายยา',           color: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'        },
  update_dispense:              { label: 'แก้ไขรายการจ่ายยา',        color: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'    },
  delete_receive:               { label: 'ลบรายการรับยา',            color: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'        },
  update_receive:               { label: 'แก้ไขรายการรับยา',         color: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'    },
  // ── AP Workflow (ส่งบัญชี) ──
  ap_acknowledge:               { label: 'จัดซื้อรับเอกสาร',         color: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'       },
  ap_unacknowledge:             { label: 'ยกเลิกรับเอกสาร',          color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'   },
  ap_mark_inspected:            { label: 'ตรวจรับบิล',               color: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'},
  ap_uninspect:                 { label: 'ยกเลิกตรวจรับ',            color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'   },
  ap_send_batch:                { label: 'ส่งบัญชีรอบ',              color: 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300' },
  ap_unsend_batch:              { label: 'ยกเลิกส่งบัญชี',           color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'   },
  ap_mark_posted:               { label: 'ตั้งหนี้แล้ว (Post)',      color: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300' },
  ap_unpost:                    { label: 'ยกเลิกตั้งหนี้',           color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'   },
  ap_reset_batch:               { label: 'รีเซ็ตรอบส่งบัญชี',        color: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'       },
  print_ap_batch:               { label: 'พิมพ์รอบส่งบัญชี',         color: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'     },
  print_ack_batch:              { label: 'พิมพ์ใบส่งจัดซื้อ',        color: 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300'     },
  export_ap_batch:              { label: 'Export Excel รอบส่งบัญชี', color: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'},
  login:                        { label: 'เข้าสู่ระบบ',              color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'   },
  // ── Reorder Analysis ──
  analysis_run:                 { label: 'บันทึก Snapshot สั่งซื้อ',  color: 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300' },
  analysis_view:                { label: 'รันวิเคราะห์สั่งซื้อ',       color: 'bg-orange-50 dark:bg-orange-950/40 text-orange-600'  },
  delete_analysis_run:          { label: 'ลบ Snapshot สั่งซื้อ',     color: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'       },
  update_reorder_config:        { label: 'แก้ Master ยา',           color: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300' },
  import_reorder_config:        { label: 'Import Master ยา',        color: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300' },
  mark_ordered:                 { label: 'ทำเครื่องหมายสั่งแล้ว',     color: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'},
  unmark_ordered:               { label: 'ยกเลิกสั่งแล้ว',           color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'   },
  print_po:                     { label: 'พิมพ์ใบสั่งซื้อ',           color: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'     },
  reconcile_excel:              { label: 'เทียบผลกับ Excel',         color: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600'  },
  // ── Monthly Stock Ledger (ADR-0007) ──
  seed_ledger:                  { label: 'นำเข้างวดคงคลังตั้งต้น',    color: 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'     },
  close_ledger_period:          { label: 'ปิดงวดคงคลัง',            color: 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'     },
  reopen_ledger_period:         { label: 'เปิดงวดคงคลังใหม่',        color: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'   },
  add_ledger_adjustment:        { label: 'เพิ่มแถวปรับยอดคงคลัง',     color: 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'     },
  // ── Stock Count (ADR-0008) ──
  create_stock_count:           { label: 'ตรวจนับคงคลัง',           color: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'},
  update_stock_count:           { label: 'แก้ไขผลตรวจนับ',          color: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'   },
  delete_stock_count:           { label: 'ลบรอบตรวจนับ',            color: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'       },
};

const RETURN_TYPE_LABELS = {
  ward_return:    'คืนจากหอผู้ป่วย',
  damaged:        'ยาเสียหาย',
  expired:        'ยาหมดอายุ',
  over_dispensed: 'จ่ายเกิน',
};

function formatDetails(action, details, recordCount) {
  const d = details || {};
  switch (action) {
    case 'submit_requisition':
      return [
        d.req_number && `เลขที่ใบเบิก: ${d.req_number}`,
        recordCount != null && `${recordCount} รายการยา`,
      ].filter(Boolean).join(' · ') || '-';

    case 'requester_edit_requisition':
    case 'update_requisition':
      return [
        d.req_number && `เลขที่: ${d.req_number}`,
        d.requisition_id && !d.req_number && `ใบเบิก #${d.requisition_id}`,
      ].filter(Boolean).join(' · ') || '-';

    case 'requester_delete_requisition':
    case 'delete_requisition':
      return [
        d.req_number && `เลขที่: ${d.req_number}`,
        d.requisition_id && !d.req_number && `ใบเบิก #${d.requisition_id}`,
      ].filter(Boolean).join(' · ') || '-';

    case 'insert_return': {
      const rtLabel = RETURN_TYPE_LABELS[d.return_type] || d.return_type || '';
      return [
        d.drug_name && `ยา: ${d.drug_name}`,
        d.qty != null && `${d.qty} หน่วย`,
        rtLabel && `(${rtLabel})`,
      ].filter(Boolean).join(' · ') || '-';
    }

    case 'confirm_return': {
      // ผลการดำเนินการ (ADR-0012) — inline map (DISPOSITION_META อยู่ใน ReturnApp)
      const DISP_LABEL = { restock: 'รับเข้าคลัง', dispose: 'ทำลาย/ตัดจำหน่าย', to_vendor: 'ส่งคืนบริษัท', rejected: 'ปฏิเสธการคืน' };
      return [
        d.received_by && `ผู้รับคืน: ${d.received_by}`,
        d.disposition && `ผล: ${DISP_LABEL[d.disposition] || d.disposition}`,
        d.disposition_note && `(${d.disposition_note})`,
        d.return_log_id && `รายการ #${d.return_log_id}`,
      ].filter(Boolean).join(' · ') || '-';
    }

    case 'flag_swap_return':
      return [
        d.drug_name && `ยา: ${d.drug_name}`,
        d.lot && `Lot ${d.lot}`,
        d.company && `บริษัท: ${d.company}`,
        d.deadline && `ต้องคืนภายใน ${d.deadline}`,
      ].filter(Boolean).join(' · ') || '-';

    case 'swap_return_action':
      return [
        d.drug_name && `ยา: ${d.drug_name}`,
        d.lot && `Lot ${d.lot}`,
        d.company && `บริษัท: ${d.company}`,
        (d.status_label || d.status) && `สถานะ: ${d.status_label || d.status}`,
        d.action_date && `วันที่ดำเนินการ ${d.action_date}`,
      ].filter(Boolean).join(' · ') || '-';

    case 'insert_drug_loan':
    case 'return_drug_loan':
    case 'update_drug_loan':
    case 'delete_drug_loan':
      return [
        d.direction_label && `ทิศทาง: ${d.direction_label}`,
        d.counterparty && `คู่สัญญา: ${d.counterparty}`,
        d.drug_name && `ยา: ${d.drug_name}`,
        d.lot && `Lot ${d.lot}`,
        d.qty != null && `จำนวน ${d.qty}`,
        d.loan_date && `วันที่ยืม ${d.loan_date}`,
        d.return_date && `วันที่คืน ${d.return_date}`,
      ].filter(Boolean).join(' · ') || '-';

    case 'export_excel':
      return d.file ? `ไฟล์: ${d.file}` : '-';

    case 'import_receive':
    case 'import_inventory':
      return recordCount != null ? `${recordCount.toLocaleString()} รายการ` : '-';

    case 'login':
      // เดิมโชว์ "role: admin · user_id: 633b0c5c-…" = ศัพท์ระบบ + UUID ที่คนอ่านไม่ได้ความหมาย
      // user_id ยังใช้ในการนับ DAU/WAU (fetchUserActivityStats) แต่ไม่ต้องโชว์ให้คนอ่าน
      return `เข้าสู่ระบบในสิทธิ์${ROLE_TH[d.role] || d.role || 'ไม่ระบุ'}`;

    default: {
      if (!details) return '-';
      // แปลชื่อฟิลด์เป็นไทย + ซ่อน id ภายในที่ไม่มีความหมายกับคนอ่าน
      const parts = Object.entries(d)
        .filter(([k, v]) => v != null && !HIDDEN_DETAIL_KEYS.has(k))
        .map(([k, v]) => {
          const label = DETAIL_LABELS[k] || k;
          const val = k === 'role' ? (ROLE_TH[v] || v) : v;
          return `${label}: ${val}`;
        });
      return parts.join(' · ') || '-';
    }
  }
}

function fmtDatetime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const day  = String(d.getDate()).padStart(2, '0');
  const mon  = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear() + 543;
  const hh   = String(d.getHours()).padStart(2, '0');
  const mm   = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${mon}/${year} ${hh}:${mm}`;
}

// ใช้ local date (ไม่ใช่ toISOString ที่เป็น UTC) — ตอนเช้าไทย <07:00 UTC ยังเป็นเมื่อวาน ทำให้ log วันนี้หลุด
function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayStr() {
  return localDateStr();
}
function monthAgoStr() {
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  return localDateStr(d);
}

function IsoDateInput({ value, onChange, className = '' }) {
  const display = iso => { if (!iso) return null; const [y,m,d] = iso.split('-'); return `${d}/${m}/${Number(y)+543}`; }
  return (
    <div className={`relative flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus-within:ring-2 focus-within:ring-slate-400 ${className}`}>
      <span className={`px-3 py-1.5 text-sm w-full select-none pointer-events-none ${value ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>{display(value) || 'dd/mm/yyyy'}</span>
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
        onClick={e => { try { e.currentTarget.showPicker?.(); } catch { /* noop */ } }}
        className="absolute inset-0 opacity-0 w-full cursor-pointer" />
    </div>
  )
}

export default function AuditLogApp({ onRefresh, auth, onGoBack, canGoBack }) {
  const [logs, setLogs]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [dateFrom, setDateFrom]   = useState(monthAgoStr());
  const [dateTo, setDateTo]       = useState(todayStr());
  const [actionFilter, setAction] = useState('all');
  const [userSearch, setUser]     = useState('');

  // edit state
  const [editId, setEditId]         = useState(null);
  const [editUserName, setEditUserName]   = useState('');
  const [editDept, setEditDept]         = useState('');
  const [editCount, setEditCount]       = useState('');
  const [editDetails, setEditDetails]   = useState('');
  const [editError, setEditError]       = useState('');
  const [saving, setSaving]             = useState(false);

  // delete state
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  // bulk select state (admin only)
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const isAdmin = auth?.role === 'admin';
  const [mainView, setMainView] = useState('logs'); // 'logs' | 'usage' (usage = admin-only)
  // เรียงตารางฝั่ง client (data โหลดครบใน state) — default = ลำดับจาก server (created_at ล่าสุด)
  const { sorted, sort, toggleSort } = useSort(logs, { numericKeys: ['record_count'] });

  const allSelected = logs.length > 0 && selectedIds.size === logs.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < logs.length;

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(logs.map(r => r.id)));
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await bulkDeleteAuditLogs([...selectedIds]);
      setLogs(prev => prev.filter(r => !selectedIds.has(r.id)));
      setSelectedIds(new Set());
      setBulkConfirm(false);
    } catch (e) { alert('ลบไม่สำเร็จ: ' + e.message); }
    setBulkDeleting(false);
  };

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLogs({
        dateFrom, dateTo,
        action:   actionFilter,
        userName: userSearch.trim() || undefined,
      });
      setLogs(data);
    } catch (e) {
      alert('โหลดข้อมูลล้มเหลว: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, actionFilter, userSearch]);

  const openEdit = (r) => {
    setEditId(r.id);
    setEditUserName(r.user_name || '');
    setEditDept(r.department || '');
    setEditCount(r.record_count != null ? String(r.record_count) : '');
    setEditDetails(r.details ? JSON.stringify(r.details, null, 2) : '');
    setEditError('');
  };
  const cancelEdit = () => { setEditId(null); setEditError(''); };

  const handleSave = async (id) => {
    setSaving(true); setEditError('');
    let parsedDetails = null;
    if (editDetails.trim()) {
      try { parsedDetails = JSON.parse(editDetails); }
      catch { setEditError('รูปแบบ Details ไม่ถูกต้อง (ต้องเป็น JSON)'); setSaving(false); return; }
    }
    try {
      await updateAuditLog(id, {
        user_name: editUserName,
        department: editDept,
        record_count: editCount !== '' ? editCount : null,
        details: parsedDetails,
      });
      setLogs(prev => prev.map(r => r.id !== id ? r : {
        ...r,
        user_name: editUserName,
        department: editDept,
        record_count: editCount !== '' ? Number(editCount) : null,
        details: parsedDetails,
      }));
      setEditId(null);
    } catch (e) { setEditError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    setDeleting(true);
    try {
      await deleteAuditLog(id);
      setLogs(prev => prev.filter(r => r.id !== id));
      setDeleteId(null);
    } catch (e) { alert('ลบไม่สำเร็จ: ' + e.message); }
    setDeleting(false);
  };

  useEffect(() => { load(); setSelectedIds(new Set()); setBulkConfirm(false); }, [load]);

  // dropdown กรอง action — จัดกลุ่มตาม workflow, label มาจาก ACTION_LABELS (single source ไม่ duplicate)
  const ACTION_GROUPS = [
    { label: 'ใบเบิกยา',   keys: ['submit_requisition', 'requester_edit_requisition', 'requester_delete_requisition', 'update_requisition', 'delete_requisition', 'picking_requisition', 'verify_requisition', 'dispense_requisition', 'received_requisition'] },
    { label: 'รับยา',      keys: ['import_receive', 'scan_invoice', 'map_drug_alias', 'update_receive', 'delete_receive'] },
    { label: 'จ่ายยา',     keys: ['import_dispense', 'update_dispense', 'delete_dispense'] },
    { label: 'คืนยา',      keys: ['insert_return', 'confirm_return', 'update_return', 'delete_return', 'flag_swap_return', 'swap_return_action', 'seed_swap_policy'] },
    { label: 'ยืม-คืนยา',  keys: ['insert_drug_loan', 'return_drug_loan', 'update_drug_loan', 'delete_drug_loan'] },
    { label: 'คลัง/Inventory', keys: ['import_inventory', 'create_stock_count', 'update_stock_count', 'delete_stock_count', 'seed_ledger', 'close_ledger_period', 'reopen_ledger_period', 'add_ledger_adjustment'] },
    { label: 'ส่งบัญชี (AP)', keys: ['ap_acknowledge', 'ap_unacknowledge', 'ap_mark_inspected', 'ap_uninspect', 'ap_send_batch', 'ap_unsend_batch', 'ap_mark_posted', 'ap_unpost', 'ap_reset_batch', 'print_ap_batch', 'print_ack_batch', 'export_ap_batch'] },
    { label: 'วิเคราะห์สั่งซื้อ', keys: ['analysis_run', 'analysis_view', 'delete_analysis_run', 'update_reorder_config', 'import_reorder_config', 'mark_ordered', 'unmark_ordered', 'print_po', 'reconcile_excel'] },
    { label: 'อื่นๆ',      keys: ['export_excel', 'login'] },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800">
      {/* Title bar — sidebar (AppShell) คุม navigation แล้ว header เดิมเหลือแค่ title + refresh */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3 flex items-center gap-3">
        <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
        <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 shrink-0"><ClipboardList size={18} /></div>
        <button onClick={onRefresh} className="flex-1 min-w-0 text-left hover:opacity-70 transition-opacity" title="คลิกเพื่อโหลดใหม่">
          <h1 className="font-bold text-base leading-tight text-slate-800 dark:text-slate-100">Audit Log</h1>
          <p className="text-slate-400 dark:text-slate-500 text-xs">ประวัติการดำเนินการในระบบ</p>
        </button>
        <button onClick={onRefresh} className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="โหลดใหม่">
          <RefreshCcw size={16} />
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">

        {/* View switcher — สรุปการใช้งานเป็น admin-only */}
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => setMainView('logs')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors inline-flex items-center gap-1.5 ${
                mainView === 'logs' ? 'bg-slate-700 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}>
              <ClipboardList size={15} /> รายการ
            </button>
            <button onClick={() => setMainView('usage')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors inline-flex items-center gap-1.5 ${
                mainView === 'usage' ? 'bg-slate-700 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}>
              <BarChart3 size={15} /> สรุปการใช้งาน
            </button>
          </div>
        )}

        {isAdmin && mainView === 'usage' && <UsageAnalyticsPanel />}

        {(!isAdmin || mainView === 'logs') && (<>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">วันที่เริ่ม</label>
            <IsoDateInput value={dateFrom} onChange={setDateFrom} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">วันที่สิ้นสุด</label>
            <IsoDateInput value={dateTo} onChange={setDateTo} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">ค้นหาผู้ใช้</label>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2 text-slate-400 dark:text-slate-500" />
              <input
                type="text" value={userSearch} onChange={e => setUser(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && load()}
                placeholder="ชื่อผู้ใช้..."
                className="border border-slate-300 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          </div>
          <button onClick={load}
            className="px-4 py-1.5 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
            ค้นหา
          </button>
        </div>

        {/* Action filter dropdown — เลือกกรองประเภทการดำเนินการ (auto-refetch ผ่าน useEffect[load]) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">กรองประเภทการดำเนินการ</label>
          <div className="relative w-full sm:w-72">
            <Filter size={14} className="absolute left-2.5 top-2.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <select value={actionFilter} onChange={e => setAction(e.target.value)}
              className="w-full appearance-none bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg pl-8 pr-8 py-1.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 cursor-pointer">
              <option value="all">ทั้งหมด</option>
              {ACTION_GROUPS.map(g => (
                <optgroup key={g.label} label={g.label}>
                  {g.keys.map(k => (
                    <option key={k} value={k}>{ACTION_LABELS[k]?.label || k}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown size={15} className="absolute right-2.5 top-2.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* Mobile edit bottom sheet */}
        {isMobile && editId && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={cancelEdit}>
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-2" />
              <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">แก้ไข Audit Log</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">ผู้ดำเนินการ</label>
                  <input value={editUserName} onChange={e => setEditUserName(e.target.value)}
                    className="w-full border border-amber-300 dark:border-amber-800/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">หน่วยงาน</label>
                  <input value={editDept} onChange={e => setEditDept(e.target.value)}
                    className="w-full border border-amber-300 dark:border-amber-800/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">จำนวน</label>
                <input type="number" value={editCount} onChange={e => setEditCount(e.target.value)}
                  className="w-full border border-amber-300 dark:border-amber-800/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/>
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Details (JSON)</label>
                <textarea value={editDetails} onChange={e => setEditDetails(e.target.value)} rows={3}
                  className="w-full border border-amber-300 dark:border-amber-800/60 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"/>
                {editError && <p className="text-red-500 text-xs mt-1">{editError}</p>}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => handleSave(editId)} disabled={saving}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button onClick={cancelEdit}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium">
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800 gap-3 flex-wrap">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {loading ? 'กำลังโหลด...' : `${logs.length} รายการ`}
            </span>
            {isAdmin && selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">เลือก <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedIds.size}</span> รายการ</span>
                <button onClick={() => { setSelectedIds(new Set()); setBulkConfirm(false); }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors">
                  ยกเลิก
                </button>
                {bulkConfirm ? (
                  <>
                    <button onClick={handleBulkDelete} disabled={bulkDeleting}
                      className="text-xs px-3 py-1 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
                      {bulkDeleting ? 'กำลังลบ...' : `ยืนยันลบ ${selectedIds.size} รายการ`}
                    </button>
                    <button onClick={() => setBulkConfirm(false)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors">
                      <X size={12}/>
                    </button>
                  </>
                ) : (
                  <button onClick={() => setBulkConfirm(true)}
                    className="text-xs px-3 py-1 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 border border-red-200 dark:border-red-900/60 font-semibold hover:bg-red-100 dark:hover:bg-red-950/70 transition-colors flex items-center gap-1">
                    <Trash2 size={12}/> ลบที่เลือก
                  </button>
                )}
              </div>
            )}
          </div>

          {logs.length === 0 && !loading ? (
            <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-10">ไม่มีข้อมูล</p>
          ) : isMobile ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sorted.map((r) => {
                const meta = ACTION_LABELS[r.action] || { label: r.action, color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' };
                const isDeletePending = deleteId === r.id;
                return (
                  <div key={r.id} className={`p-4 space-y-2 ${selectedIds.has(r.id) ? 'bg-slate-100 dark:bg-slate-800/70' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isAdmin && (
                          <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)}
                            className="w-4 h-4 accent-slate-700 cursor-pointer shrink-0 mt-0.5" />
                        )}
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.color}`}>{meta.label}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{fmtDatetime(r.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <span className="font-medium">{r.user_name || '-'}</span>
                      {r.department && r.department !== '-' && <><span className="text-slate-300 dark:text-slate-500">·</span><span>{r.department}</span></>}
                      {r.record_count != null && <><span className="text-slate-300 dark:text-slate-500">·</span><span>{r.record_count.toLocaleString()} รายการ</span></>}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{formatDetails(r.action, r.details, r.record_count)}</p>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => openEdit(r)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60">
                        <Pencil size={11}/> แก้ไข
                      </button>
                      {isDeletePending ? (
                        <>
                          <button onClick={() => handleDelete(r.id)} disabled={deleting}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-600 text-white">
                            {deleting ? '...' : 'ยืนยันลบ'}
                          </button>
                          <button onClick={() => setDeleteId(null)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            ยกเลิก
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setDeleteId(r.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-950/40 text-red-600 border border-red-200 dark:border-red-900/60">
                          <Trash2 size={11}/> ลบ
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>
              <table className="w-full text-xs min-w-[800px]">
                <thead className="sticky top-0 z-20">
                  <tr className="text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800">
                    {isAdmin && (
                      <th className="pl-4 pr-2 py-2.5 bg-slate-50 dark:bg-slate-800 w-8">
                        <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected; }}
                          onChange={toggleSelectAll}
                          className="w-3.5 h-3.5 accent-slate-700 cursor-pointer" />
                      </th>
                    )}
                    <SortableTh sortKey="created_at" label="วันที่/เวลา" sort={sort} onSort={toggleSort} className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800" activeColor="text-slate-700 dark:text-slate-200" />
                    <SortableTh sortKey="action" label="การดำเนินการ" sort={sort} onSort={toggleSort} className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800" activeColor="text-slate-700 dark:text-slate-200" />
                    <SortableTh sortKey="user_name" label="ผู้ดำเนินการ" sort={sort} onSort={toggleSort} className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800" activeColor="text-slate-700 dark:text-slate-200" />
                    <SortableTh sortKey="department" label="หน่วยงาน" sort={sort} onSort={toggleSort} className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800" activeColor="text-slate-700 dark:text-slate-200" />
                    <SortableTh sortKey="record_count" label="จำนวน" align="right" sort={sort} onSort={toggleSort} className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800" activeColor="text-slate-700 dark:text-slate-200" />
                    <th className="px-4 py-2.5 text-left bg-slate-50 dark:bg-slate-800">รายละเอียด</th>
                    <th className="px-4 py-2.5 text-center bg-slate-50 dark:bg-slate-800">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => {
                    const meta = ACTION_LABELS[r.action] || { label: r.action, color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' };
                    const isEditing = editId === r.id;
                    const isDeletePending = deleteId === r.id;
                    return (
                      <tr key={r.id} className={`border-b border-slate-100 dark:border-slate-800 ${isEditing ? 'bg-amber-50 dark:bg-amber-950/40' : selectedIds.has(r.id) ? 'bg-slate-100 dark:bg-slate-800/70' : i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/40'}`}>
                        {isAdmin && (
                          <td className="pl-4 pr-2 py-2.5 w-8">
                            <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)}
                              className="w-3.5 h-3.5 accent-slate-700 cursor-pointer" />
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtDatetime(r.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.color}`}>
                            {meta.label}
                          </span>
                        </td>

                        {/* ผู้ดำเนินการ */}
                        <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                          {isEditing
                            ? <input value={editUserName} onChange={e => setEditUserName(e.target.value)}
                                className="border border-amber-300 dark:border-amber-800/60 rounded px-2 py-0.5 w-28 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"/>
                            : r.user_name || '-'}
                        </td>

                        {/* หน่วยงาน */}
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                          {isEditing
                            ? <input value={editDept} onChange={e => setEditDept(e.target.value)}
                                className="border border-amber-300 dark:border-amber-800/60 rounded px-2 py-0.5 w-28 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"/>
                            : r.department || '-'}
                        </td>

                        {/* จำนวน */}
                        <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-300">
                          {isEditing
                            ? <input type="number" value={editCount} onChange={e => setEditCount(e.target.value)}
                                className="border border-amber-300 dark:border-amber-800/60 rounded px-2 py-0.5 w-16 text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-400"/>
                            : r.record_count != null ? r.record_count.toLocaleString() : '-'}
                        </td>

                        {/* รายละเอียด */}
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 max-w-[280px]">
                          {isEditing ? (
                            <div className="space-y-1">
                              <textarea value={editDetails} onChange={e => setEditDetails(e.target.value)} rows={2}
                                placeholder='{"key":"value"}'
                                className="border border-amber-300 dark:border-amber-800/60 rounded px-2 py-0.5 w-full text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"/>
                              {editError && <p className="text-red-500 text-[10px]">{editError}</p>}
                            </div>
                          ) : (
                            <span className="leading-relaxed">
                              {formatDetails(r.action, r.details, r.record_count)}
                            </span>
                          )}
                        </td>

                        {/* จัดการ */}
                        <td className="px-4 py-2.5 text-center whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => handleSave(r.id)} disabled={saving}
                                className="p-1.5 text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-50" title="บันทึก">
                                <Save size={13}/>
                              </button>
                              <button onClick={cancelEdit}
                                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors" title="ยกเลิก">
                                <X size={13}/>
                              </button>
                            </div>
                          ) : isDeletePending ? (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => handleDelete(r.id)} disabled={deleting}
                                className="px-2 py-1 text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50">
                                {deleting ? '...' : 'ยืนยัน'}
                              </button>
                              <button onClick={() => setDeleteId(null)}
                                className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                <X size={13}/>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => openEdit(r)}
                                className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-lg transition-colors" title="แก้ไข">
                                <Pencil size={13}/>
                              </button>
                              <button onClick={() => setDeleteId(r.id)}
                                className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors" title="ลบ">
                                <Trash2 size={13}/>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        </>)}
      </div>
    </div>
  );
}
