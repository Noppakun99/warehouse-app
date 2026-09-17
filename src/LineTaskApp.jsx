import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MessageSquare, RefreshCcw, Check, X, Undo2, Search, MessagesSquare,
  CircleAlert, CheckCircle2, Clock, Loader2, Sparkles, ListTodo, User, CalendarClock,
} from 'lucide-react';
import BackButton from './BackButton';
import {
  fetchLineTasks, fetchLineTaskCounts, fetchLineTaskContext, markLineTask,
  fetchLineTaskItems, fetchLineTaskItemCounts, fetchLineTaskSources,
  markLineTaskItem, analyzeLineTasks,
} from './lib/db';

// สถานะงาน — ค่าตรงกับ CHECK constraint ของ line_message (ADR-0022)
const TABS = [
  { key: 'candidate', label: 'รอยืนยัน', icon: CircleAlert, tone: 'text-amber-600' },
  { key: 'task', label: 'ต้องทำ', icon: Clock, tone: 'text-blue-600' },
  { key: 'done', label: 'ทำแล้ว', icon: CheckCircle2, tone: 'text-emerald-600' },
  { key: 'dismissed', label: 'ไม่ใช่งาน', icon: X, tone: 'text-slate-400' },
];

const fmtWhen = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear() + 543} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** ข้อความรอบๆ — ข้อความเดี่ยวมักไม่พอตัดสินว่าเป็นงานจริงไหม */
function ContextPanel({ id }) {
  const [ctx, setCtx] = useState(null);
  // loading derive จาก ctx — ไม่ setState ใน effect body (react-hooks/set-state-in-effect)
  const loading = ctx === null;

  useEffect(() => {
    let alive = true;
    fetchLineTaskContext(id, 4)
      .then((c) => { if (alive) setCtx(c); })
      .catch(() => { if (alive) setCtx({ before: [], after: [] }); });
    return () => { alive = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 px-3 py-2">
        <Loader2 size={13} className="animate-spin" /> กำลังโหลดบทสนทนา...
      </div>
    );
  }
  const line = (m, dim) => (
    <div key={m.id} className={`text-xs py-1 ${dim ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'}`}>
      <span className="font-medium">{m.sender}</span>
      <span className="text-slate-300 dark:text-slate-600 mx-1">·</span>
      <span>{m.msg_type === 'text' ? m.body : `[${m.msg_type}]`}</span>
    </div>
  );
  return (
    <div className="mt-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2">
      <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mb-1">บทสนทนารอบๆ</div>
      {ctx.before.map((m) => line(m, true))}
      <div className="border-l-2 border-blue-400 pl-2 my-1 text-xs text-blue-700 dark:text-blue-300 font-medium">
        ↑ ข้อความนี้ ↓
      </div>
      {ctx.after.map((m) => line(m, true))}
      {!ctx.before.length && !ctx.after.length && (
        <div className="text-xs text-slate-400 dark:text-slate-500">ไม่มีข้อความรอบๆ</div>
      )}
    </div>
  );
}

function TaskCard({ row, onMark, busy }) {
  const [open, setOpen] = useState(false);
  const isOpen = row.task_status === 'candidate' || row.task_status === 'task';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span className="font-medium text-slate-700 dark:text-slate-200">{row.sender}</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span>{fmtWhen(row.sent_at)}</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="inline-flex items-center gap-1">
              <MessagesSquare size={11} /> {row.chat_name}
            </span>
            {row.matched_kw && (
              <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-300 text-[11px]">
                {row.matched_kw}
              </span>
            )}
            {/* ป้ายสถานะ — ให้เห็นชัดว่าการ์ดนี้อยู่สถานะไหน ไม่ต้องเดาจากปุ่ม */}
            {row.task_status === 'task' && (
              <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 text-[11px]">ยืนยันแล้ว</span>
            )}
            {row.task_status === 'done' && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[11px]">ทำแล้ว</span>
            )}
            {row.task_status === 'dismissed' && (
              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[11px]">ไม่ใช่งาน</span>
            )}
          </div>
          <div className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words">
            {row.body || <span className="text-slate-400 dark:text-slate-500">[{row.msg_type}]</span>}
          </div>
          {row.task_status === 'done' && row.done_by && (
            <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
              ทำแล้วโดย {row.done_by} · {fmtWhen(row.done_at)}
            </div>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mt-1.5 underline"
          >
            {open ? 'ซ่อนบทสนทนา' : 'ดูบทสนทนารอบๆ'}
          </button>
          {open && <ContextPanel id={row.id} />}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {row.task_status === 'candidate' && (
            <>
              <button
                onClick={() => onMark(row.id, 'task')}
                disabled={busy}
                className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 transition-colors"
              >
                ใช่ เป็นงาน
              </button>
              <button
                onClick={() => onMark(row.id, 'dismissed')}
                disabled={busy}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs disabled:opacity-50 transition-colors"
              >
                ไม่ใช่
              </button>
            </>
          )}
          {row.task_status === 'task' && (
            <button
              onClick={() => onMark(row.id, 'done')}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50 transition-colors"
            >
              <Check size={13} /> ทำแล้ว
            </button>
          )}
          {!isOpen && (
            <button
              onClick={() => onMark(row.id, 'task')}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs inline-flex items-center gap-1 disabled:opacity-50 transition-colors"
            >
              <Undo2 size={13} /> เอากลับมา
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** ข้อความต้นทางของงาน — ให้คนตรวจว่า AI สรุปมาจากอะไรก่อนกดรับ (ADR-0023) */
function TaskSources({ id }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchLineTaskSources(id)
      .then((r) => { if (alive) setRows(r); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [id]);

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 px-3 py-2">
        <Loader2 size={13} className="animate-spin" /> กำลังโหลด...
      </div>
    );
  }
  if (!rows.length) return <div className="text-xs text-slate-400 dark:text-slate-500 px-3 py-2">ไม่มีข้อความต้นทางที่ผูกไว้</div>;
  return (
    <div className="mt-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2">
      <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mb-1">ข้อความต้นทาง</div>
      {rows.map((m) => (
        <div key={m.id} className="text-xs text-slate-600 dark:text-slate-300 py-1">
          <span className="font-medium">{m.sender}</span>
          <span className="text-slate-300 dark:text-slate-600 mx-1">·</span>
          <span>{m.msg_type === 'text' ? m.body : `[${m.msg_type}]`}</span>
        </div>
      ))}
    </div>
  );
}

function TaskItemCard({ row, onMark, busy }) {
  const [open, setOpen] = useState(false);
  const isAi = row.status === 'ai_suggested';

  return (
    <div className={`bg-white border rounded-xl p-3 transition-colors ${isAi ? 'border-violet-200 dark:border-violet-800' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {isAi && (
              <span className="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-900/60 text-violet-700 dark:text-violet-300 text-[11px] inline-flex items-center gap-1">
                <Sparkles size={10} /> AI เสนอ
              </span>
            )}
            {row.assignee && (
              <span className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                <User size={11} /> {row.assignee}
              </span>
            )}
            {row.due_hint && (
              <span className="text-xs text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                <CalendarClock size={11} /> {row.due_hint}
              </span>
            )}
          </div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100 break-words">{row.title}</div>
          {row.detail && <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap break-words">{row.detail}</div>}
          {row.status === 'done' && row.done_by && (
            <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">ทำแล้วโดย {row.done_by} · {fmtWhen(row.done_at)}</div>
          )}
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mt-1.5 underline">
            {open ? 'ซ่อนข้อความต้นทาง' : 'ดูข้อความต้นทาง'}
          </button>
          {open && <TaskSources id={row.id} />}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isAi && (
            <>
              <button onClick={() => onMark(row.id, 'open')} disabled={busy}
                className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 transition-colors">
                รับงานนี้
              </button>
              <button onClick={() => onMark(row.id, 'dismissed')} disabled={busy}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs disabled:opacity-50 transition-colors">
                ไม่ใช่
              </button>
            </>
          )}
          {row.status === 'open' && (
            <button onClick={() => onMark(row.id, 'done')} disabled={busy}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50 transition-colors">
              <Check size={13} /> ทำแล้ว
            </button>
          )}
          {(row.status === 'done' || row.status === 'dismissed') && (
            <button onClick={() => onMark(row.id, 'open')} disabled={busy}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs inline-flex items-center gap-1 disabled:opacity-50 transition-colors">
              <Undo2 size={13} /> เอากลับมา
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const TASK_TABS = [
  { key: 'ai_suggested', label: 'AI เสนอ', icon: Sparkles, tone: 'text-violet-600' },
  { key: 'open', label: 'ต้องทำ', icon: Clock, tone: 'text-blue-600' },
  { key: 'done', label: 'ทำแล้ว', icon: CheckCircle2, tone: 'text-emerald-600' },
  { key: 'dismissed', label: 'ไม่ใช่งาน', icon: X, tone: 'text-slate-400' },
];

/** มุมมอง "งาน" — งานเป็นเอนทิตีแยกจากข้อความ (ADR-0023) */
function TaskView({ auth }) {
  const [tab, setTab] = useState('ai_suggested');
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    setRows([]);   // ล้างของแท็บเดิม — กันเห็นการ์ดเก่าคู่กับปุ่มของแท็บใหม่
    try {
      const [r, c] = await Promise.all([fetchLineTaskItems(tab), fetchLineTaskItemCounts()]);
      setRows(r); setCounts(c);
    } catch (e) { setErr(String(e.message || e)); } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const handleMark = async (id, status) => {
    setBusyId(id);
    try { await markLineTaskItem(id, status, { auth }); await load(); }
    catch (e) { setErr(String(e.message || e)); } finally { setBusyId(null); }
  };

  const runAnalyze = async (dryRun) => {
    setAnalyzing(true); setErr(''); setMsg('');
    try {
      const d = await analyzeLineTasks({ dryRun, auth });
      if (dryRun) {
        setMsg(`จะส่งข้อความ ${d.messages_sent ?? 0} ข้อความ (${(d.chars ?? 0).toLocaleString()} ตัวอักษร) จาก ${d.candidates ?? 0} จุดที่น่าสงสัย — ยังไม่เรียก AI ไม่มีค่าใช้จ่าย`);
      } else {
        setMsg(d.created ? `AI เสนองานใหม่ ${d.created} รายการ` : (d.note || 'AI ไม่พบงานใหม่'));
        setTab('ai_suggested');
        await load();
      }
    } catch (e) { setErr(String(e.message || e)); } finally { setAnalyzing(false); }
  };

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-3">
        {TASK_TABS.map((t) => {
          const Icon = t.icon; const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 border transition-colors ${
                active ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-200 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              <Icon size={14} className={active ? 'text-white' : t.tone} />
              {t.label}
              <span className={`text-xs ${active ? 'text-teal-100' : 'text-slate-400'}`}>{counts[t.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 flex-wrap mb-3">
        <button onClick={() => runAnalyze(false)} disabled={analyzing}
          className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors">
          {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          ให้ AI ช่วยสรุปงาน
        </button>
        <button onClick={() => runAnalyze(true)} disabled={analyzing}
          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm disabled:opacity-50 transition-colors">
          ดูก่อนว่าจะส่งอะไรออกไป
        </button>
      </div>

      {msg && <div className="mb-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 text-sm px-3 py-2">{msg}</div>}
      {err && <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-300 text-sm px-3 py-2">{err}</div>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 py-12 text-sm">
          <Loader2 size={16} className="animate-spin" /> กำลังโหลด...
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <ListTodo size={32} className="mx-auto mb-2 opacity-40" />
          <div className="text-sm">
            {tab === 'ai_suggested' ? 'ยังไม่มีงานที่ AI เสนอ — กดปุ่มด้านบนเพื่อให้ AI ช่วยสรุป' : 'ไม่มีรายการในสถานะนี้'}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => <TaskItemCard key={r.id} row={r} onMark={handleMark} busy={busyId === r.id} />)}
        </div>
      )}
    </div>
  );
}

export default function LineTaskApp({ auth, onGoBack, canGoBack }) {
  // 2 มุมมอง: 'task' = งาน (สิ่งที่ต้องทำ) · 'message' = ข้อความดิบที่ระบบดักคำได้
  const [view, setView] = useState('task');
  const [tab, setTab] = useState('candidate');
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    // ล้างของแท็บเดิมก่อนโหลด — ไม่งั้นระหว่างรอข้อมูลใหม่จะเห็นการ์ดของแท็บเก่า
    // พร้อมปุ่มของแท็บใหม่ (เช่น อยู่แท็บ "ต้องทำ" แต่เห็นการ์ด "รอยืนยัน" ที่มีปุ่ม "ทำแล้ว")
    setRows([]);
    try {
      const [r, c] = await Promise.all([fetchLineTasks({ status: tab, limit: 300 }), fetchLineTaskCounts()]);
      setRows(r);
      setCounts(c);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const handleMark = async (id, status) => {
    setBusyId(id);
    try {
      await markLineTask(id, status, { auth });
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      String(r.body || '').toLowerCase().includes(s)
      || String(r.sender || '').toLowerCase().includes(s));
  }, [rows, q]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3">
        <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
        <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center shrink-0">
          <MessageSquare size={17} className="text-white" />
        </div>
        <button onClick={load} className="text-left min-w-0">
          <div className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">งานค้างจากไลน์</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">เรื่องที่หัวหน้าหรือเพื่อนร่วมงานแจ้งไว้</div>
        </button>
        <button
          onClick={load}
          className="ml-auto p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="โหลดใหม่"
        >
          <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-4 max-w-4xl mx-auto">
        {/* สลับมุมมอง: งาน (สิ่งที่ต้องทำ) vs ข้อความ (หลักฐานดิบ) — ADR-0023 */}
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 mb-4">
          <button onClick={() => setView('task')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium inline-flex items-center gap-1.5 transition-colors ${
              view === 'task' ? 'bg-teal-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            <ListTodo size={14} /> งานที่ต้องทำ
          </button>
          <button onClick={() => setView('message')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium inline-flex items-center gap-1.5 transition-colors ${
              view === 'message' ? 'bg-teal-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            <MessagesSquare size={14} /> ข้อความที่น่าสงสัย
          </button>
        </div>

        {view === 'task' ? <TaskView auth={auth} /> : (
        <>
        <div className="flex gap-2 flex-wrap mb-3">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 border transition-colors ${
                  active
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Icon size={14} className={active ? 'text-white' : t.tone} />
                {t.label}
                <span className={`text-xs ${active ? 'text-teal-100' : 'text-slate-400'}`}>
                  {counts[t.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาในข้อความหรือชื่อผู้ส่ง"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>

        {err && (
          <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-300 text-sm px-3 py-2">
            {err}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 py-12 text-sm">
            <Loader2 size={16} className="animate-spin" /> กำลังโหลด...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500">
            <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
            <div className="text-sm">
              {q ? 'ไม่พบข้อความที่ค้นหา' : 'ไม่มีรายการในสถานะนี้'}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <TaskCard key={r.id} row={r} onMark={handleMark} busy={busyId === r.id} />
            ))}
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
