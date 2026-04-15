import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Search, ClipboardList, Pencil, Trash2, X, Save } from 'lucide-react';
import { fetchAuditLogs, updateAuditLog, deleteAuditLog } from './lib/db';

const ACTION_LABELS = {
  import_inventory:             { label: 'นำเข้า Inventory',       color: 'bg-blue-100 text-blue-700'      },
  import_receive:               { label: 'นำเข้าประวัติรับยา',      color: 'bg-indigo-100 text-indigo-700'  },
  insert_return:                { label: 'บันทึกคืนยา',              color: 'bg-violet-100 text-violet-700'  },
  export_excel:                 { label: 'ส่งออก Excel',             color: 'bg-emerald-100 text-emerald-700'},
  submit_requisition:           { label: 'ส่งใบเบิกยา',             color: 'bg-sky-100 text-sky-700'        },
  requester_edit_requisition:   { label: 'แก้ไขใบเบิก',             color: 'bg-amber-100 text-amber-700'    },
  requester_delete_requisition: { label: 'ลบใบเบิก',                color: 'bg-red-100 text-red-700'        },
  delete_requisition:           { label: 'ลบใบเบิก (staff)',         color: 'bg-red-100 text-red-700'        },
  update_requisition:           { label: 'แก้ไขใบเบิก (staff)',      color: 'bg-amber-100 text-amber-700'    },
  delete_dispense:              { label: 'ลบรายการจ่ายยา',           color: 'bg-red-100 text-red-700'        },
  update_dispense:              { label: 'แก้ไขรายการจ่ายยา',        color: 'bg-amber-100 text-amber-700'    },
  delete_receive:               { label: 'ลบรายการรับยา',            color: 'bg-red-100 text-red-700'        },
  update_receive:               { label: 'แก้ไขรายการรับยา',         color: 'bg-amber-100 text-amber-700'    },
  login:                        { label: 'เข้าสู่ระบบ',              color: 'bg-slate-100 text-slate-600'   },
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

    case 'export_excel':
      return d.file ? `ไฟล์: ${d.file}` : '-';

    case 'import_receive':
    case 'import_inventory':
      return recordCount != null ? `${recordCount.toLocaleString()} รายการ` : '-';

    default:
      if (!details) return '-';
      return Object.entries(d).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(' · ') || '-';
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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function monthAgoStr() {
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

export default function AuditLogApp({ onBack, auth }) {
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

  useEffect(() => { load(); }, [load]);

  const actionTabs = [
    { key: 'all',                          label: 'ทั้งหมด' },
    { key: 'submit_requisition',           label: 'ส่งใบเบิก' },
    { key: 'requester_edit_requisition',   label: 'แก้ไขใบเบิก' },
    { key: 'requester_delete_requisition', label: 'ลบใบเบิก' },
    { key: 'insert_return',                label: 'คืนยา' },
    { key: 'import_receive',               label: 'นำเข้าประวัติรับยา' },
    { key: 'import_inventory',             label: 'นำเข้า Inventory' },
    { key: 'export_excel',                 label: 'ส่งออก Excel' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white px-6 py-4 flex items-center gap-3 shadow-md">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <ClipboardList size={22} />
        <div>
          <h1 className="font-bold text-lg leading-tight">Audit Log</h1>
          <p className="text-slate-300 text-xs">ประวัติการดำเนินการในระบบ</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">วันที่เริ่ม</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">วันที่สิ้นสุด</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">ค้นหาผู้ใช้</label>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text" value={userSearch} onChange={e => setUser(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && load()}
                placeholder="ชื่อผู้ใช้..."
                className="border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          </div>
          <button onClick={load}
            className="px-4 py-1.5 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
            ค้นหา
          </button>
        </div>

        {/* Action tabs */}
        <div className="flex gap-2 flex-wrap">
          {actionTabs.map(t => (
            <button key={t.key} onClick={() => setAction(t.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                actionFilter === t.key
                  ? 'bg-slate-700 text-white border-transparent shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">
              {loading ? 'กำลังโหลด...' : `${logs.length} รายการ`}
            </span>
          </div>

          {logs.length === 0 && !loading ? (
            <p className="text-center text-slate-400 text-sm py-10">ไม่มีข้อมูล</p>
          ) : (
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>
              <table className="w-full text-xs min-w-[800px]">
                <thead className="sticky top-0 z-20">
                  <tr className="text-slate-500 font-semibold border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-2.5 text-left bg-slate-50">วันที่/เวลา</th>
                    <th className="px-4 py-2.5 text-left bg-slate-50">การดำเนินการ</th>
                    <th className="px-4 py-2.5 text-left bg-slate-50">ผู้ดำเนินการ</th>
                    <th className="px-4 py-2.5 text-left bg-slate-50">หน่วยงาน</th>
                    <th className="px-4 py-2.5 text-right bg-slate-50">จำนวน</th>
                    <th className="px-4 py-2.5 text-left bg-slate-50">รายละเอียด</th>
                    <th className="px-4 py-2.5 text-center bg-slate-50">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((r, i) => {
                    const meta = ACTION_LABELS[r.action] || { label: r.action, color: 'bg-slate-100 text-slate-600' };
                    const isEditing = editId === r.id;
                    const isDeletePending = deleteId === r.id;
                    return (
                      <tr key={r.id} className={`border-b border-slate-100 ${isEditing ? 'bg-amber-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtDatetime(r.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.color}`}>
                            {meta.label}
                          </span>
                        </td>

                        {/* ผู้ดำเนินการ */}
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {isEditing
                            ? <input value={editUserName} onChange={e => setEditUserName(e.target.value)}
                                className="border border-amber-300 rounded px-2 py-0.5 w-28 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"/>
                            : r.user_name || '-'}
                        </td>

                        {/* หน่วยงาน */}
                        <td className="px-4 py-2.5 text-slate-500">
                          {isEditing
                            ? <input value={editDept} onChange={e => setEditDept(e.target.value)}
                                className="border border-amber-300 rounded px-2 py-0.5 w-28 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"/>
                            : r.department || '-'}
                        </td>

                        {/* จำนวน */}
                        <td className="px-4 py-2.5 text-right text-slate-600">
                          {isEditing
                            ? <input type="number" value={editCount} onChange={e => setEditCount(e.target.value)}
                                className="border border-amber-300 rounded px-2 py-0.5 w-16 text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-400"/>
                            : r.record_count != null ? r.record_count.toLocaleString() : '-'}
                        </td>

                        {/* รายละเอียด */}
                        <td className="px-4 py-2.5 text-slate-600 max-w-[280px]">
                          {isEditing ? (
                            <div className="space-y-1">
                              <textarea value={editDetails} onChange={e => setEditDetails(e.target.value)} rows={2}
                                placeholder='{"key":"value"}'
                                className="border border-amber-300 rounded px-2 py-0.5 w-full text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"/>
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
                                className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="ยกเลิก">
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
                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                <X size={13}/>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => openEdit(r)}
                                className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="แก้ไข">
                                <Pencil size={13}/>
                              </button>
                              <button onClick={() => setDeleteId(r.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="ลบ">
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
      </div>
    </div>
  );
}
