// ============================================================
// ManualApp — หน้า "คู่มือและตารางงาน" (เมนูกลุ่ม ช่วยเหลือ · ทุก role)
// แถบ 1 คู่มือการใช้แอป: เนื้อหาจาก src/lib/appManual.js (pure) กรองตาม role + ค้นหา
// แถบ 2 ตารางการทำงาน: ตาราง work_schedule (db.js) — ทุกคนดูได้ · admin เพิ่ม/แก้/ลบ (audit + กระดิ่ง)
// แถบ 3 Work flow คลัง: ขั้นตอนงานคลังจาก src/lib/warehouseWorkflow.js (pure) — staff/admin เท่านั้น
// ============================================================
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen, CalendarRange, Search, ChevronDown, Plus, Pencil, Trash2, X, RefreshCcw, Info,
  Workflow, Megaphone, ClipboardCheck, Split, Wrench,
} from 'lucide-react';
import BackButton from './BackButton';
import ConfirmModal from './ConfirmModal';
import { manualFor } from './lib/appManual';
import { WORKFLOW_PHASES, WORKFLOW_KINDS, WORKFLOW_SYSTEMS, WORKFLOW_VERSION } from './lib/warehouseWorkflow';
import { WORK_SCHEDULE_DAYS, fetchWorkSchedule, upsertWorkScheduleRow, deleteWorkScheduleRow } from './lib/db';

const TABS = [
  { key: 'manual', label: 'คู่มือการใช้แอป', icon: BookOpen },
  { key: 'schedule', label: 'ตารางการทำงาน', icon: CalendarRange },
  { key: 'workflow', label: 'Work flow คลัง', icon: Workflow, roles: ['staff', 'admin'] },
];

export default function ManualApp({ auth = {}, onGoBack, canGoBack, onRefresh }) {
  const [tab, setTab] = useState('manual');
  const tabs = TABS.filter(t => !t.roles || t.roles.includes(auth.role));
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3 sticky top-0 z-30">
        <div className="flex items-center gap-2 min-w-0">
          <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
          <BookOpen size={20} className="text-sky-600 shrink-0" />
          <button onClick={onRefresh} className="text-left min-w-0">
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">คู่มือและตารางงาน</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">วิธีใช้แอปตามหน้าที่ของคุณ และตารางงานเจ้าหน้าที่คลังยา</p>
          </button>
        </div>
        <div role="tablist" className="mt-3 flex flex-wrap gap-2">
          {tabs.map(t => {
            const on = tab === t.key;
            const Icon = t.icon;
            return (
              <button key={t.key} role="tab" aria-selected={on} onClick={() => setTab(t.key)}
                className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors ${on
                  ? 'bg-sky-600 text-white font-semibold'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium'}`}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5">
        {tab === 'manual' ? <ManualTab role={auth.role} />
          : tab === 'workflow' ? <WorkflowTab />
          : <ScheduleTab auth={auth} />}
      </div>
    </div>
  );
}

// ── แถบ Work flow คลัง ───────────────────────────────────────────
const KIND_STYLE = {
  do: { icon: ClipboardCheck, box: 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 border-l-sky-500', icon_c: 'text-sky-600 dark:text-sky-400' },
  notify: { icon: Megaphone, box: 'bg-violet-50/60 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900 border-l-violet-500', icon_c: 'text-violet-600 dark:text-violet-400' },
  decision: { icon: Split, box: 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 border-dashed border-l-amber-500', icon_c: 'text-amber-600 dark:text-amber-400' },
};

function WorkflowTab() {
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm px-4 py-3 space-y-2">
        <p className="text-sm text-slate-700 dark:text-slate-200">
          ขั้นตอนที่คลังยาปฏิบัติ ตั้งแต่วางแผนซื้อจนปิดงวด — ขั้นของหน่วยงานอื่น (อนุมัติ ออก PO ตรวจรับ) ไม่แสดง แสดงเฉพาะจุดที่คลังแจ้ง/ติดตาม
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
          {Object.entries(WORKFLOW_KINDS).map(([k, label]) => {
            const Icon = KIND_STYLE[k].icon;
            return <span key={k} className="flex items-center gap-1"><Icon size={14} className={KIND_STYLE[k].icon_c} />{label}</span>;
          })}
        </div>
      </div>

      {WORKFLOW_PHASES.map(p => (
        <section key={p.no} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-teal-700 text-white">
            <span className="shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold tabular-nums">{p.no}</span>
            <span className="min-w-0">
              <h2 className="font-bold leading-tight">{p.title}</h2>
              <span className="text-xs text-teal-50">{p.when}{p.parallel ? ' · ทำคู่ขนาน ไม่มีลำดับ' : ''}</span>
            </span>
          </div>
          <ol className={`p-3 gap-2 ${p.parallel ? 'grid sm:grid-cols-2' : 'grid sm:grid-cols-2 lg:grid-cols-3'}`}>
            {p.steps.map((s, i) => <WorkflowStep key={s.title} s={s} n={p.parallel ? null : i + 1} />)}
          </ol>
        </section>
      ))}

      <p className="text-xs text-slate-500 dark:text-slate-400 px-1">
        <span className="font-semibold text-slate-600 dark:text-slate-300">ระบบที่ใช้:</span> {WORKFLOW_SYSTEMS} · {WORKFLOW_VERSION}
      </p>
    </div>
  );
}

function WorkflowStep({ s, n }) {
  const st = KIND_STYLE[s.kind];
  const Icon = st.icon;
  return (
    <li className={`min-w-0 rounded-xl border border-l-4 px-3 py-2.5 ${st.box}`}>
      <div className="flex items-start gap-2">
        <Icon size={16} className={`shrink-0 mt-0.5 ${st.icon_c}`} aria-label={WORKFLOW_KINDS[s.kind]} />
        <h3 className="min-w-0 font-semibold text-sm text-slate-800 dark:text-slate-100">
          {n != null && <span className="tabular-nums text-slate-400 dark:text-slate-500 mr-1">{n}.</span>}
          {s.title}
        </h3>
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{s.detail}</p>
      {(s.to || s.tool) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {s.to && <span className="rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 px-2 py-0.5 text-xs font-medium">แจ้ง → {s.to}</span>}
          {s.tool && <span className="flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 text-xs"><Wrench size={11} />{s.tool}</span>}
        </div>
      )}
    </li>
  );
}

// ── แถบคู่มือ ────────────────────────────────────────────────────
function ManualTab({ role }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => new Set());
  const groups = useMemo(() => manualFor(role, q), [role, q]);
  const searching = q.trim() !== '';
  const single = groups.length === 1;
  // ค้นอยู่ = กางทุกกลุ่มที่เจอ (ผลค้นต้องเห็นทันที) · กลุ่มเดียว = กางเลย
  const isOpen = (key) => searching || single || open.has(key);
  const toggle = (key) => setOpen(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const sectionCount = groups.reduce((s, g) => s + g.sections.length, 0);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} aria-label="ค้นหาในคู่มือ"
          placeholder="ค้นหาในคู่มือ เช่น ใบเบิก ตรวจรับ บิล"
          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl pl-9 pr-9 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500" />
        {q && (
          <button onClick={() => setQ('')} aria-label="ล้างคำค้น"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={15} />
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-6 text-center">
          ไม่พบหัวข้อที่ตรงกับ &quot;{q}&quot;
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-slate-400">
            <span>{groups.length} กลุ่ม · {sectionCount} หัวข้อ{!searching && !single ? ' · กดหัวข้อเพื่อดู' : ''}</span>
            {!searching && !single && (
              <span className="ml-auto flex gap-1">
                <button onClick={() => setOpen(new Set(groups.map(g => g.key)))}
                  className="px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sky-700 dark:text-sky-400 font-medium">กางทั้งหมด</button>
                <button onClick={() => setOpen(new Set())}
                  className="px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sky-700 dark:text-sky-400 font-medium">ย่อทั้งหมด</button>
              </span>
            )}
          </div>
          <div className="space-y-3">
            {groups.map(g => {
              const expanded = isOpen(g.key);
              const panelId = `manual-group-${g.key}`;
              return (
                <section key={g.key} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
                  {searching || single ? (
                    <h2 className="px-4 pt-3.5 pb-1 font-bold text-slate-800 dark:text-slate-100">{g.title}</h2>
                  ) : (
                    <button onClick={() => toggle(g.key)} aria-expanded={expanded} aria-controls={panelId}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-slate-800 dark:text-slate-100">{g.title}</span>
                        {!expanded && (
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400 mt-0.5" title={g.sections.map(s => s.title).join(' · ')}>
                            {g.sections.map(s => s.title).join(' · ')}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 text-xs font-semibold tabular-nums">{g.sections.length}</span>
                      <ChevronDown size={18} className={`shrink-0 text-slate-400 ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                  {expanded && (
                    <div id={panelId} className="px-4 pb-4 pt-1 space-y-5">
                      {g.sections.map(s => <ManualSection key={s.id} s={s} />)}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ManualSection({ s }) {
  return (
    <article className="pt-3 border-t border-slate-100 dark:border-slate-800 first:border-t-0 first:pt-2">
      <h3 className="font-semibold text-slate-800 dark:text-slate-100">{s.title}</h3>
      {s.summary && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{s.summary}</p>}
      {s.steps?.length > 0 && (
        <ol className="mt-2 space-y-1.5">
          {s.steps.map((st, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-slate-700 dark:text-slate-200">
              <span className="shrink-0 w-5 h-5 mt-0.5 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 text-[11px] font-bold flex items-center justify-center tabular-nums">{i + 1}</span>
              <span className="min-w-0 break-words">{st}</span>
            </li>
          ))}
        </ol>
      )}
      {s.table && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>{s.table.head.map(h => <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {s.table.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-2 text-slate-700 dark:text-slate-200 align-top">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s.notes?.length > 0 && (
        <div className="mt-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl px-3 py-2 space-y-1">
          {s.notes.map((n, i) => (
            <p key={i} className="flex gap-2 text-[13px] text-amber-800 dark:text-amber-200"><Info size={14} className="shrink-0 mt-0.5" /><span className="min-w-0 break-words">{n}</span></p>
          ))}
        </div>
      )}
    </article>
  );
}

// ── แถบตารางการทำงาน ─────────────────────────────────────────────
const EMPTY_ROW = { person: '', role_note: '', mon: '', tue: '', wed: '', thu: '', fri: '', note: '', sort_order: 0 };
const dash = (v) => (v && String(v).trim()) || '-';

function ScheduleTab({ auth }) {
  const isAdmin = auth.role === 'admin';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);     // แถวที่เปิดฟอร์ม (EMPTY_ROW = เพิ่มใหม่)
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try { setRows(await fetchWorkSchedule()); }
    catch (e) { setErr(e.message || 'โหลดตารางการทำงานไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (row) => {
    setSaving(true); setErr('');
    try { await upsertWorkScheduleRow(row, auth); setEditing(null); await load(); }
    catch (e) { setErr(e.message || 'บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    setSaving(true); setErr('');
    try { await deleteWorkScheduleRow(toDelete.id, auth); setToDelete(null); await load(); }
    catch (e) { setErr(e.message || 'ลบไม่สำเร็จ'); setToDelete(null); }
    finally { setSaving(false); }
  };

  const updatedAt = rows.reduce((m, r) => (r.updated_at && r.updated_at > m ? r.updated_at : m), '');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-slate-500 dark:text-slate-400 min-w-0">
          {updatedAt ? `แก้ล่าสุด ${new Date(updatedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}` : 'งานประจำของแต่ละคน จันทร์–ศุกร์'}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={load} title="โหลดใหม่" aria-label="โหลดตารางใหม่"
            className="p-2 rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
            <RefreshCcw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          {isAdmin && (
            <button onClick={() => setEditing({ ...EMPTY_ROW, sort_order: rows.length + 1 })}
              className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-medium">
              <Plus size={15} /> เพิ่มแถว
            </button>
          )}
        </div>
      </div>

      {err && <p className="text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl px-4 py-3">{err}</p>}

      {loading && rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-8 text-center">
          <CalendarRange size={28} className="mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-2 font-semibold text-slate-700 dark:text-slate-200">ยังไม่มีตารางการทำงาน</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{isAdmin ? 'กด "เพิ่มแถว" เพื่อเพิ่มเจ้าหน้าที่ทีละคน' : 'ผู้ดูแลระบบจะเพิ่มตารางให้'}</p>
        </div>
      ) : (
        <>
          {/* คอม: ตารางคน × วัน */}
          <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                    <th className="px-3 py-3 text-left bg-slate-50/80 dark:bg-slate-800/60">เจ้าหน้าที่</th>
                    {WORK_SCHEDULE_DAYS.map(d => <th key={d.key} className="px-3 py-3 text-left bg-slate-50/80 dark:bg-slate-800/60">{d.label}</th>)}
                    <th className="px-3 py-3 text-left bg-slate-50/80 dark:bg-slate-800/60">หมายเหตุ</th>
                    {isAdmin && <th className="px-3 py-3 bg-slate-50/80 dark:bg-slate-800/60"><span className="sr-only">จัดการ</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800 align-top">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{r.person}</p>
                        {r.role_note && <p className="text-xs text-slate-500 dark:text-slate-400">{r.role_note}</p>}
                      </td>
                      {WORK_SCHEDULE_DAYS.map(d => <td key={d.key} className="px-3 py-3 text-slate-700 dark:text-slate-200 whitespace-pre-line break-words">{dash(r[d.key])}</td>)}
                      <td className="px-3 py-3 text-slate-500 dark:text-slate-400 whitespace-pre-line break-words">{dash(r.note)}</td>
                      {isAdmin && (
                        <td className="px-2 py-2 whitespace-nowrap">
                          <RowActions row={r} onEdit={setEditing} onDelete={setToDelete} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* มือถือ: การ์ดรายคน */}
          <div className="md:hidden space-y-3">
            {rows.map(r => (
              <div key={r.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-100 break-words">{r.person}</p>
                    {r.role_note && <p className="text-xs text-slate-500 dark:text-slate-400 break-words">{r.role_note}</p>}
                  </div>
                  {isAdmin && <RowActions row={r} onEdit={setEditing} onDelete={setToDelete} />}
                </div>
                <dl className="mt-3 space-y-1.5">
                  {WORK_SCHEDULE_DAYS.map(d => (
                    <div key={d.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 text-sm">
                      <dt className="text-slate-500 dark:text-slate-400">{d.label}</dt>
                      <dd className="text-slate-700 dark:text-slate-200 whitespace-pre-line break-words">{dash(r[d.key])}</dd>
                    </div>
                  ))}
                </dl>
                {r.note && <p className="mt-3 text-[13px] text-slate-500 dark:text-slate-400 whitespace-pre-line break-words">{r.note}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {editing && <ScheduleForm initial={editing} saving={saving} onSave={save} onCancel={() => setEditing(null)} />}
      <ConfirmModal
        open={!!toDelete} tone="danger" loading={saving}
        title="ลบแถวนี้ออกจากตารางการทำงาน?"
        message={toDelete ? `${toDelete.person}${toDelete.role_note ? ` (${toDelete.role_note})` : ''}` : ''}
        confirmText="ลบ" onConfirm={remove} onClose={() => setToDelete(null)}
      />
    </div>
  );
}

function RowActions({ row, onEdit, onDelete }) {
  return (
    <span className="flex items-center gap-1 shrink-0">
      <button onClick={() => onEdit(row)} aria-label={`แก้ไข ${row.person}`} title="แก้ไข"
        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-sky-600"><Pencil size={15} /></button>
      <button onClick={() => onDelete(row)} aria-label={`ลบ ${row.person}`} title="ลบ"
        className="p-2 rounded-lg text-slate-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600"><Trash2 size={15} /></button>
    </span>
  );
}

function ScheduleForm({ initial, saving, onSave, onCancel }) {
  const [f, setF] = useState(() => ({ ...EMPTY_ROW, ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v ?? ''])) }));
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));
  const input = 'w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-sky-400 outline-none';
  const label = 'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 max-h-[90dvh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="font-bold text-slate-800 dark:text-slate-100">{initial.id ? 'แก้ไขตารางการทำงาน' : 'เพิ่มเจ้าหน้าที่ในตาราง'}</h3>
          <button onClick={onCancel} aria-label="ปิด" className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>
        <div className="px-5 overflow-y-auto space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="ws-person">ชื่อเจ้าหน้าที่</label>
              <input id="ws-person" value={f.person} onChange={set('person')} placeholder="ชื่อที่ใช้เรียกในคลัง" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="ws-role">ตำแหน่ง / หน้าที่</label>
              <input id="ws-role" value={f.role_note} onChange={set('role_note')} placeholder="เช่น เจ้าหน้าที่คลัง" className={input} />
            </div>
          </div>
          {WORK_SCHEDULE_DAYS.map(d => (
            <div key={d.key}>
              <label className={label} htmlFor={`ws-${d.key}`}>{d.label}</label>
              <textarea id={`ws-${d.key}`} rows={2} value={f[d.key]} onChange={set(d.key)} className={input} />
            </div>
          ))}
          <div>
            <label className={label} htmlFor="ws-note">หมายเหตุ</label>
            <textarea id="ws-note" rows={2} value={f.note} onChange={set('note')} placeholder="เช่น งานประจำเดือน วันที่ไปช่วยหน่วยอื่น" className={input} />
          </div>
          <div className="w-32">
            <label className={label} htmlFor="ws-order">ลำดับที่แสดง</label>
            <input id="ws-order" type="number" inputMode="numeric" value={f.sort_order} onChange={set('sort_order')} className={`${input} text-right tabular-nums`} />
          </div>
        </div>
        <div className="flex gap-2 px-5 py-4">
          <button onClick={onCancel}
            className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
            ยกเลิก
          </button>
          <button onClick={() => onSave(f)} disabled={saving || !f.person.trim()}
            className="flex-1 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}
