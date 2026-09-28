// ============================================================
// ExcelSync — ปุ่ม "นำเข้าจาก Excel" (2 ไฟล์ · 4 ชีท)
//   ยอดคลังยา_69.xlsm          : Master → inventory · เบิก → dispense_logs
//   รับจากการซื้อ_ยืม_…xlsm    : รับยา → receive_logs · รพ.ยืมยา → drug_loan
//
// วางบน top bar ของ AppShell (staff/admin) — หน้าอื่นเปิดโมดอลด้วย openExcelSync() (lib/excelSyncEvent.js)
// ตรรกะเทียบ/ด่านตรวจ: src/lib/excelSync.js · เขียน DB: applyExcelSync ใน db.js (ตัวเดียวกับ CLI)
// เลือก 1 หรือ 2 ไฟล์ต่อรอบได้ — ถ้าเลือกทั้งคู่ สถานะตรวจรับใน Master เทียบกับชีทรับยาในไฟล์ (ไม่ใช่ของเดิมใน DB)
//
// ตัวเฝ้าไฟล์ (File System Access API — Chrome/Edge บนคอมเท่านั้น) แยกต่อไฟล์:
//   เชื่อมครั้งเดียว → handle ใน IndexedDB → เช็ค lastModified ทุก 10 วิ (ไม่อ่านไฟล์ทั้งก้อน)
//   ต้องนิ่ง 2 รอบก่อนแจ้ง — OneDrive AutoSave เซฟถี่ ไม่งั้นป้ายกระพริบ
//   สิทธิ์อ่านต้องขอจริงจาก Chrome ทุกครั้งก่อน getFile (เปิดแอปใหม่ Chrome ถามอีกรอบ — เลี่ยงไม่ได้)
// เบราว์เซอร์อื่น/มือถือ = เลือกไฟล์ทุกครั้ง (ใช้ได้เหมือนกัน แค่ไม่รู้เองว่าไฟล์เปลี่ยน)
// ============================================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet, X, Upload, RefreshCcw, AlertTriangle, CheckCircle2, ShieldAlert,
  ChevronDown, ChevronUp, Link2, Loader2, Clock,
} from 'lucide-react';
import {
  readWorkbookGrids, buildSyncPlan, readReceiveWorkbookGrids, buildReceivePlan, combinePlans,
  INVENTORY_SPEC, DISPENSE_SPEC, RECEIVE_SPEC,
} from './lib/excelSync';
import { fetchExcelSyncBaseline, fetchReceiveSyncBaseline, applyExcelSync } from './lib/db';
import { EXCEL_SYNC_OPEN_EVENT as OPEN_EVENT } from './lib/excelSyncEvent';

const SLOTS = {
  stock: { idbKey: 'handle', seenKey: 'excel_sync_seen', title: 'ยอดคลังยา_69.xlsm', sheets: 'ชีท Master · เบิก' },
  receive: { idbKey: 'handle_receive', seenKey: 'excel_sync_seen_receive', title: 'รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm', sheets: 'ชีท รับยา · รพ.ยืมยา' },
};
const SLOT_KEYS = ['stock', 'receive'];
const POLL_MS = 10000;

const readSeen = (k) => { try { return Number(localStorage.getItem(SLOTS[k].seenKey)) || 0; } catch { return 0; } };
const writeSeen = (k, ms) => { try { localStorage.setItem(SLOTS[k].seenKey, String(ms)); } catch { /* WebView ปิด storage */ } };

// ── IndexedDB เก็บ file handle (localStorage เก็บ handle ไม่ได้) ──
const idb = (mode, fn) => new Promise((resolve, reject) => {
  const open = indexedDB.open('excel-sync', 1);
  open.onupgradeneeded = () => open.result.createObjectStore('kv');
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const tx = open.result.transaction('kv', mode);
    const req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  };
});
const loadHandle = (key) => idb('readonly', s => s.get(key)).catch(() => null);
const saveHandle = (key, h) => idb('readwrite', s => s.put(h, key)).catch(() => {});

const canWatch = typeof window !== 'undefined' && 'showOpenFilePicker' in window;

const fmtDateTime = (ms) => new Date(ms).toLocaleString('th-TH', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const fmtNum = (n) => Number(n || 0).toLocaleString('th-TH');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const isoToThai = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${Number(iso.slice(0, 4)) + 543}` : '-');

// ============================================================
// ไฟล์ที่เชื่อมไว้ 1 ช่อง — handle + สิทธิ์ + ตัวเฝ้า lastModified
// ============================================================
function useLinkedFile(slot) {
  const { idbKey } = SLOTS[slot];
  const [handle, setHandle] = useState(null);
  const [permission, setPermission] = useState(null); // 'granted' | 'prompt' | 'denied'
  const [changedAt, setChangedAt] = useState(0);       // lastModified ที่ยังไม่ได้ตรวจ (0 = ไม่มี)
  const lastPollRef = useRef(0);                       // ค่ารอบก่อน — ค่าเปลี่ยน = ยังเซฟไม่นิ่ง รอรอบหน้า

  useEffect(() => {
    if (!canWatch) return;
    let alive = true;
    loadHandle(idbKey).then(async (h) => {
      if (!alive || !h) return;
      setHandle(h);
      try { setPermission(await h.queryPermission({ mode: 'read' })); } catch { setPermission('prompt'); }
    });
    return () => { alive = false; };
  }, [idbKey]);

  useEffect(() => {
    if (!handle || permission !== 'granted') return;
    let alive = true;
    const tick = async () => {
      try {
        const f = await handle.getFile();
        if (!alive) return;
        if (f.lastModified !== lastPollRef.current) { lastPollRef.current = f.lastModified; return; }
        setChangedAt(f.lastModified > readSeen(slot) ? f.lastModified : 0);
      } catch { /* ไฟล์กำลังถูกเซฟ/ย้าย — รอบหน้าค่อยดู */ }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [handle, permission, slot]);

  const link = async () => {
    const [h] = await window.showOpenFilePicker({
      types: [{ description: 'ไฟล์ Excel', accept: { 'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
      multiple: false,
    });
    await saveHandle(idbKey, h);
    lastPollRef.current = 0;
    setHandle(h);
    // ห้ามสมมติว่าได้สิทธิ์แล้ว — ต้องถาม Chrome จริง (เคยตั้ง 'granted' เอง → getFile ล้ม NotAllowedError 2026-09-28)
    try { setPermission(await h.queryPermission({ mode: 'read' })); } catch { setPermission('prompt'); }
    return h;
  };

  /** เช็คสิทธิ์อ่านจริงก่อน getFile — ยังไม่ได้ = ขอ (Chrome เด้งถาม; ต้องเรียกภายในการคลิกของผู้ใช้) */
  const ensureRead = async (h = handle) => {
    let p = 'denied';
    try {
      p = await h.queryPermission({ mode: 'read' });
      if (p !== 'granted') p = await h.requestPermission({ mode: 'read' });
    } catch { p = 'denied'; }
    setPermission(p);
    return p === 'granted';
  };

  const markSeen = useCallback((ms) => { writeSeen(slot, ms); setChangedAt(0); }, [slot]);

  return { slot, handle, permission, changedAt, link: canWatch ? link : null, ensureRead, markSeen };
}

// ============================================================
// ปุ่มบน top bar + โมดอล
// ============================================================
export default function ExcelSyncControl({ auth, onDone }) {
  const [open, setOpen] = useState(false);
  const linked = { stock: useLinkedFile('stock'), receive: useLinkedFile('receive') };

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const changed = SLOT_KEYS.filter(k => linked[k].changedAt > 0);
  const needsPermission = SLOT_KEYS.some(k => linked[k].handle && linked[k].permission === 'prompt');
  const changedTitle = changed.map(k => `${SLOTS[k].title} เปลี่ยนเมื่อ ${fmtDateTime(linked[k].changedAt)}`).join(' · ');
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={changed.length ? `${changedTitle} — ยังไม่ได้นำเข้า` : 'นำเข้าจาก Excel'}
        aria-label="นำเข้าจาก Excel"
        className={`relative flex items-center gap-1.5 p-2 rounded-xl transition-colors ${changed.length ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50' : 'text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
      >
        <FileSpreadsheet size={19} />
        {changed.length > 0 && <span className="hidden md:inline text-xs font-semibold pr-1">ไฟล์ Excel เปลี่ยน</span>}
        {(changed.length > 0 || needsPermission) && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900" />}
      </button>
      {open && (
        <ExcelSyncModal
          auth={auth}
          linked={linked}
          onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); onDone?.(); }}
        />
      )}
    </>
  );
}

// ============================================================
// โมดอล: เลือกไฟล์ (1–2 ไฟล์) → อ่าน → ส่วนต่าง + ด่านตรวจ → ยืนยัน
// ============================================================
function ExcelSyncModal({ auth, linked, onClose, onDone }) {
  // แหล่งไฟล์ต่อช่อง: { kind: 'handle' } = ไฟล์ที่เชื่อมไว้ · { kind: 'file', file } = เลือกครั้งเดียว · null = ไม่นำเข้ารอบนี้
  const [sources, setSources] = useState(() => ({
    stock: linked.stock.handle ? { kind: 'handle' } : null,
    receive: linked.receive.handle ? { kind: 'handle' } : null,
  }));
  const [step, setStep] = useState('pick'); // pick | reading | preview | applying | done
  const [files, setFiles] = useState({});    // File ที่อ่านจริงรอบนี้ (เวลาแก้ไฟล์/ชื่อ)
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [override, setOverride] = useState(false);
  const [result, setResult] = useState(null);

  const setSource = (k, v) => setSources(s => ({ ...s, [k]: v }));

  const linkSlot = async (k) => {
    setError('');
    try { await linked[k].link(); setSource(k, { kind: 'handle' }); }
    catch (e) { if (e?.name !== 'AbortError') setError(`${SLOTS[k].title}: ${e.message}`); }
  };

  /** ได้ File ของช่องนั้น — ไฟล์ที่เชื่อมไว้ต้องขอสิทธิ์ก่อน (อยู่ในการคลิก "อ่านและเทียบ") */
  const fileOf = async (k) => {
    const src = sources[k];
    if (src.kind === 'file') return src.file;
    const h = linked[k].handle;
    if (!(await linked[k].ensureRead(h))) throw Object.assign(new Error('ไม่ได้รับอนุญาต'), { name: 'NotAllowedError' });
    return h.getFile();
  };

  const readAll = async () => {
    setError(''); setPlan(null); setOverride(false);
    const picked = SLOT_KEYS.filter(k => sources[k]);
    const got = {};
    for (const k of picked) {
      try { got[k] = await fileOf(k); }
      catch (e) { setError(`${SLOTS[k].title}: ${linkedFileError(e)}`); return; }
    }
    setFiles(got);
    setStep('reading');
    try {
      await new Promise(r => setTimeout(r, 30)); // ให้ spinner วาดก่อน — อ่านไฟล์บล็อก main thread ~3 วิ/ไฟล์
      let receivePlan = null;
      if (got.receive) {
        const grids = readReceiveWorkbookGrids(XLSX, new Uint8Array(await got.receive.arrayBuffer()));
        const base = await fetchReceiveSyncBaseline(RECEIVE_SPEC.fields.map(x => x[0]));
        receivePlan = buildReceivePlan({ ...grids, ...base, fileModifiedMs: got.receive.lastModified });
      }
      let stockPlan = null;
      if (got.stock) {
        const grids = readWorkbookGrids(XLSX, new Uint8Array(await got.stock.arrayBuffer()));
        const base = await fetchExcelSyncBaseline(INVENTORY_SPEC.fields.map(x => x[0]), DISPENSE_SPEC.fields.map(x => x[0]));
        stockPlan = buildSyncPlan({
          ...grids, ...base, fileModifiedMs: got.stock.lastModified, today: todayIso(),
          // นำเข้ารับยารอบเดียวกัน → เทียบสถานะกับไฟล์ ไม่ใช่ของเดิมใน DB (ที่กำลังจะถูกแทน)
          receiveRows: receivePlan ? receivePlan.receive.rows : base.receiveRows,
        });
      }
      const p = combinePlans(stockPlan, receivePlan);
      setPlan(p);
      setStep('preview');
      if (!p.hasChanges) picked.forEach(k => linked[k].markSeen(got[k].lastModified));
    } catch (e) {
      setError('อ่านไฟล์ไม่สำเร็จ — ' + e.message + ' (ตรวจว่าเลือกไฟล์ถูกช่องไหม)');
      setStep('pick');
    }
  };

  const apply = async () => {
    setStep('applying'); setError('');
    try {
      const r = await applyExcelSync(plan, auth, { stockFile: files.stock?.name, receiveFile: files.receive?.name });
      Object.entries(files).forEach(([k, f]) => linked[k].markSeen(f.lastModified));
      setResult(r);
      setStep('done');
    } catch (e) {
      setError('นำเข้าไม่ครบ — ' + e.message + ' · ข้อมูลในแอปอาจขาดหาย ให้กด "ยืนยันนำเข้า" ไฟล์เดิมอีกครั้งทันที');
      setStep('preview');
    }
  };

  const busy = step === 'reading' || step === 'applying';
  const blocked = plan && !plan.ok && (!plan.canOverride || !override);
  // นำเข้าเสร็จแล้ว ปิดทางไหนก็ต้องโหลดหน้าใหม่ — ไม่งั้นหน้าจอยังโชว์ยอดก่อนนำเข้า
  const close = step === 'done' ? onDone : onClose;
  // ไฟล์ที่เลือกครั้งเดียว อ่านซ้ำหลังไฟล์ถูกแก้ไม่ได้ (File เป็น snapshot) → ต้องกลับไปเลือกใหม่
  const canReread = Object.keys(files).every(k => sources[k]?.kind === 'handle');

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/40 sm:p-4" onClick={busy ? undefined : close}>
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 shrink-0"><FileSpreadsheet size={18} /></div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-slate-800 dark:text-slate-100">นำเข้าจาก Excel</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">ยอดคลังยา (Master · เบิก) · รับยา (รับยา · รพ.ยืมยา)</p>
          </div>
          <button onClick={close} disabled={busy} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 disabled:opacity-40" aria-label="ปิด"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
          {error && (
            <p className="flex items-start gap-2 text-red-600 dark:text-red-300 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />{error}
            </p>
          )}

          {step === 'pick' && (
            <div className="space-y-3">
              {SLOT_KEYS.map(k => (
                <SlotCard key={k} slot={k} linked={linked[k]} source={sources[k]}
                  onLink={linked[k].link ? () => linkSlot(k) : null}
                  onUseLinked={() => setSource(k, { kind: 'handle' })}
                  onPickOnce={(f) => setSource(k, { kind: 'file', file: f })}
                  onClear={() => setSource(k, null)} />
              ))}
              <p className="text-xs text-slate-500 dark:text-slate-400">ต้องกด Ctrl+S ใน Excel ก่อน ระบบอ่านเฉพาะที่เซฟแล้ว · เลือก 1 หรือ 2 ไฟล์ก็ได้ ถ้าแก้ทั้ง 2 ไฟล์ ควรนำเข้าพร้อมกัน · ข้อมูลจากไฟล์จะแทนที่ข้อมูลในแอป (ADR-0027)</p>
            </div>
          )}

          {step === 'reading' && <Busy text="กำลังอ่านไฟล์และเทียบกับข้อมูลในระบบ…" />}
          {step === 'applying' && <Busy text="กำลังบันทึกลงระบบ — อย่าปิดหน้านี้" />}
          {step === 'preview' && plan && <Preview plan={plan} files={files} override={override} setOverride={setOverride} />}

          {step === 'done' && result && (
            <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl px-4 py-3 text-emerald-800 dark:text-emerald-200 text-sm">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">นำเข้าเรียบร้อย</p>
                {[['ประวัติรับยา', result.receive], ['แผนผังคลังยา', result.inventory], ['ประวัติเบิกจ่าย', result.dispense]].map(([label, n]) => (
                  <p key={label}>{label}: {n == null ? 'ไม่ได้เขียน (ไม่มีส่วนต่าง/ไม่ได้เลือกไฟล์)' : `${fmtNum(n)} แถว`}</p>
                ))}
                <p>ยืม-คืนยา: {result.loan == null ? 'ไม่ได้เขียน (ไม่มีส่วนต่าง/ไม่ได้เลือกไฟล์)' : `เพิ่ม ${fmtNum(result.loan.inserted)} · แก้ ${fmtNum(result.loan.updated)} แถว`}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-700 shrink-0">
          {step === 'preview' && (
            <button onClick={() => (canReread ? readAll() : setStep('pick'))}
              className="mr-auto flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-800 px-2 py-1.5">
              <RefreshCcw size={15} /> {canReread ? 'อ่านไฟล์ใหม่' : 'เลือกไฟล์ใหม่'}
            </button>
          )}
          {step === 'done' ? (
            <button onClick={onDone} className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl py-2.5 px-5 font-semibold text-sm shadow-sm">ปิดและโหลดหน้าใหม่</button>
          ) : (
            <>
              <button onClick={onClose} disabled={busy} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:border-slate-400 text-slate-700 dark:text-slate-200 rounded-xl py-2.5 px-5 font-medium text-sm disabled:opacity-50">ยกเลิก</button>
              {step === 'pick' && (
                <button onClick={readAll} disabled={!SLOT_KEYS.some(k => sources[k])}
                  className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl py-2.5 px-5 font-semibold text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  อ่านและเทียบ
                </button>
              )}
              {step === 'preview' && plan?.hasChanges && (
                <button onClick={apply} disabled={blocked}
                  className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl py-2.5 px-5 font-semibold text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  ยืนยันนำเข้า
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// แยกข้อความตามสาเหตุ — ข้อความเดียว "ไฟล์อาจถูกย้าย" พาผู้ใช้ไปผิดทางเมื่อที่จริงแค่ยังไม่ได้ให้สิทธิ์
function linkedFileError(e) {
  const tail = ` (${e?.name || 'Error'})`;
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
    return 'Chrome ยังไม่อนุญาตให้อ่านไฟล์ที่เชื่อมไว้ — กด "อ่านและเทียบ" อีกครั้งแล้วเลือก "อนุญาต" เมื่อ Chrome ถาม ' +
      'ถ้ายังไม่ได้ ให้ใช้ "เลือกครั้งเดียว" แทน (ผลเหมือนกัน แค่ระบบจะไม่แจ้งเองเมื่อไฟล์เปลี่ยน)' + tail;
  }
  if (e?.name === 'NotFoundError') return 'หาไฟล์ที่เชื่อมไว้ไม่เจอ (ถูกย้ายหรือเปลี่ยนชื่อ) — กด "เชื่อมไฟล์" ใหม่' + tail;
  if (e?.name === 'NotReadableError') return 'ไฟล์กำลังถูกเซฟ/sync อยู่ — รอสักครู่แล้วลองอีกครั้ง' + tail;
  return 'เปิดไฟล์ที่เชื่อมไว้ไม่ได้ — ' + (e?.message || '') + tail;
}

function Busy({ text }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-500 dark:text-slate-400 text-sm">
      <Loader2 size={28} className="animate-spin text-sky-500" />{text}
    </div>
  );
}

// ── ช่องไฟล์ 1 ช่อง ─────────────────────────────────────────────
function SlotCard({ slot, linked, source, onLink, onUseLinked, onPickOnce, onClear }) {
  const inputRef = useRef(null);
  const { title, sheets } = SLOTS[slot];
  const chosen = source?.kind === 'handle' ? linked.handle?.name : source?.kind === 'file' ? source.file.name : null;
  return (
    <div className={`rounded-xl border p-3 space-y-2.5 ${source ? 'border-sky-300 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/30' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60'}`}>
      <div className="flex items-start gap-2.5">
        <FileSpreadsheet size={18} className="text-emerald-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{sheets}</p>
        </div>
        {source && <button onClick={onClear} className="text-xs text-slate-500 hover:text-red-600 dark:text-slate-400 px-1.5 py-0.5 rounded">ไม่นำเข้ารอบนี้</button>}
      </div>

      {chosen ? (
        <p className="flex items-center gap-1.5 text-xs text-sky-800 dark:text-sky-200">
          {source.kind === 'handle' ? <Link2 size={13} /> : <Upload size={13} />}
          <span className="truncate"><b>{chosen}</b> — {source.kind === 'handle' ? 'ไฟล์ที่เชื่อมไว้ (ระบบเฝ้าให้)' : 'เลือกครั้งเดียว'}</span>
        </p>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">ยังไม่ได้เลือก — ไฟล์นี้จะไม่ถูกนำเข้ารอบนี้</p>
      )}
      {source?.kind === 'handle' && linked.permission && linked.permission !== 'granted' && (
        <p className="text-xs text-amber-700 dark:text-amber-300">ตอนกด "อ่านและเทียบ" Chrome จะถามสิทธิ์อ่านไฟล์ — กด "อนุญาต"</p>
      )}

      <div className="flex flex-wrap gap-2">
        {linked.handle && source?.kind !== 'handle' && (
          <button onClick={onUseLinked} className="flex items-center gap-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-lg px-2.5 py-1.5">
            <Link2 size={13} /> ใช้ไฟล์ที่เชื่อมไว้ ({linked.handle.name})
          </button>
        )}
        {onLink && (
          <button onClick={onLink} className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-lg px-2.5 py-1.5">
            <Link2 size={13} /> {linked.handle ? 'เชื่อมไฟล์อื่นแทน' : 'เชื่อมไฟล์ (แนะนำ)'}
          </button>
        )}
        <button onClick={() => inputRef.current?.click()} className="flex items-center gap-1.5 text-xs font-semibold bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg px-2.5 py-1.5">
          <Upload size={13} /> เลือกครั้งเดียว
        </button>
        <input ref={inputRef} type="file" accept=".xlsm,.xlsx" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPickOnce(f); }} />
      </div>
    </div>
  );
}

// ── ผลเทียบ ──────────────────────────────────────────────────────
function Preview({ plan, files, override, setOverride }) {
  const { stock, receive } = plan;
  const conflicts = stock?.conflicts || [];
  const hardBlock = plan.blockers.some(b => !b.overridable);
  return (
    <div className="space-y-4">
      {/* เวลาแก้ไฟล์ — ตัวใหญ่ เพราะ "ไฟล์ที่คิดว่าใหม่" มักไม่ใช่ไฟล์ที่เครื่องอ่านได้ (เหตุการณ์ 2026-09-28) */}
      <div className="grid sm:grid-cols-2 gap-3">
        {files.stock && <FileTime file={files.stock} note={`เบิกในไฟล์ถึงวันที่ ${isoToThai(stock?.dispense.lastDate)}`} />}
        {files.receive && <FileTime file={files.receive} note={`รับยาในไฟล์ถึงวันที่ ${isoToThai(receive?.receive.lastDate)}`} />}
      </div>

      {plan.blockers.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl p-3 space-y-2">
          <p className="flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-300 text-sm"><ShieldAlert size={16} /> ต้องตรวจก่อนนำเข้า</p>
          <ul className="space-y-1.5 text-sm text-red-700 dark:text-red-300 list-disc pl-5">
            {plan.blockers.map((b, i) => <li key={i}><b>[{b.file}{b.sheet ? ` · ${b.sheet}` : ''}] </b>{b.message}{!b.overridable && ' (ข้ามไม่ได้)'}</li>)}
          </ul>
          {conflicts.length > 0 && (
            <RowList title={`สถานะ "รอตรวจรับ" ที่ขัดกับประวัติรับยา (${conflicts.length})`} tone="red" defaultOpen
              items={conflicts.map(r => ({ main: r.name, sub: `lot ${r.lot} · บิล ${r.invoice} · ${r.location}` }))} />
          )}
          {!hardBlock && (
            <label className="flex items-start gap-2 text-sm text-red-800 dark:text-red-200 font-medium pt-1 cursor-pointer">
              <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} className="mt-0.5 w-4 h-4 accent-red-600" />
              ฉันตรวจแล้วว่าไฟล์ถูกต้อง นำเข้าต่อ
            </label>
          )}
        </div>
      )}

      {plan.warnings.length > 0 && (
        <div className="flex items-start gap-2 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 rounded-xl px-4 py-3 text-orange-800 dark:text-orange-200 text-sm">
          <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5" />
          <div>{plan.warnings.map((w, i) => <p key={i}>[{w.file}{w.sheet ? ` · ${w.sheet}` : ''}] {w.message}</p>)}</div>
        </div>
      )}

      {!plan.hasChanges && (
        <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl px-4 py-3 text-emerald-800 dark:text-emerald-200 text-sm font-medium">
          <CheckCircle2 size={16} className="text-emerald-600" /> ข้อมูลในแอปตรงกับไฟล์แล้ว ไม่มีอะไรต้องนำเข้า
        </div>
      )}

      {receive && (
        <>
          <SheetDiff title="ประวัติรับยา (ชีทรับยา)" part={receive.receive}
            describe={r => ({ main: r.drug_name, sub: `${isoToThai(r.receive_date)} · บิล ${r.bill_number} · lot ${r.lot} · รับ ${fmtNum(r.qty_received)}` })} />
          <LoanDiff part={receive.loan} />
        </>
      )}
      {stock && (
        <>
          <SheetDiff title="แผนผังคลังยา (ชีท Master)" part={stock.inventory}
            describe={r => ({ main: r.name, sub: `lot ${r.lot} · ${r.location} · คงเหลือ ${r.qty}` })} />
          <SheetDiff title="ประวัติเบิกจ่าย (ชีทเบิก)" part={stock.dispense}
            describe={r => ({ main: r.drug_name, sub: `${isoToThai(r.dispense_date)} · lot ${r.lot} · ออก ${fmtNum(r.qty_out)} · ${r.department}` })} />
        </>
      )}
    </div>
  );
}

function FileTime({ file, note }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex items-center gap-3">
      <Clock size={22} className="text-sky-600 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{file.name} — แก้ล่าสุดเมื่อ</p>
        <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{fmtDateTime(file.lastModified)}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p>
      </div>
    </div>
  );
}

function StatGrid({ stats }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {stats.map(([label, n, cls]) => (
        <div key={label} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 px-2 py-2 text-center">
          <p className={`text-lg font-bold ${n ? cls : 'text-slate-400 dark:text-slate-500'}`}>{fmtNum(n)}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
        </div>
      ))}
    </div>
  );
}

function SheetDiff({ title, part, describe }) {
  const { diff, changedFields, count, prevCount } = part;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{title}</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">ในแอป {fmtNum(prevCount)} → ในไฟล์ {fmtNum(count)} แถว</span>
      </div>
      <StatGrid stats={[
        ['เหมือนเดิม', diff.unchanged, 'text-slate-600 dark:text-slate-300'],
        ['แก้ค่า', diff.changed.length, 'text-amber-700 dark:text-amber-300'],
        ['เพิ่ม', diff.added.length, 'text-emerald-700 dark:text-emerald-300'],
        ['ลบ', diff.removed.length, 'text-red-600 dark:text-red-300'],
      ]} />
      {changedFields.length > 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          ช่องที่เปลี่ยน: {changedFields.map(f => `${f.label} ${fmtNum(f.count)} แถว`).join(' · ')}
        </p>
      )}
      {diff.changed.length > 0 && (
        <RowList title={`แก้ค่า (${diff.changed.length})`} tone="amber"
          items={diff.changed.map(c => ({ ...describe(c.next), changes: c.fields }))} />
      )}
      {diff.added.length > 0 && <RowList title={`เพิ่ม (${diff.added.length})`} tone="emerald" items={diff.added.map(describe)} />}
      {diff.removed.length > 0 && <RowList title={`ลบ (${diff.removed.length})`} tone="red" items={diff.removed.map(describe)} />}
    </div>
  );
}

// ยืม-คืนยา: เพิ่ม/แก้เฉพาะที่เปลี่ยน — แถวที่หายจากไฟล์ "เก็บไว้" ไม่ลบ (ต่างจาก 3 ชีทที่ลบแล้วใส่ใหม่)
function LoanDiff({ part }) {
  const { diff, count, prevCount } = part;
  const describe = r => ({ main: r.drug_name, sub: `${isoToThai(r.loan_date)} · ${r.direction === 'borrow' ? 'เรายืม' : 'ให้ยืม'} ${r.counterparty} · lot ${r.lot || '-'} · ${fmtNum(r.qty)}` });
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">ยืม-คืนยาระหว่าง รพ. (ชีท รพ.ยืมยา)</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">ในแอป {fmtNum(prevCount)} → ในไฟล์ {fmtNum(count)} แถว</span>
      </div>
      <StatGrid stats={[
        ['เหมือนเดิม', diff.unchanged.length, 'text-slate-600 dark:text-slate-300'],
        ['แก้ค่า', diff.updates.length, 'text-amber-700 dark:text-amber-300'],
        ['เพิ่ม', diff.inserts.length, 'text-emerald-700 dark:text-emerald-300'],
        ['ไม่มีในไฟล์ (เก็บไว้)', diff.missing.length, 'text-slate-600 dark:text-slate-300'],
      ]} />
      {diff.updates.length > 0 && (
        <RowList title={`แก้ค่า (${diff.updates.length})`} tone="amber"
          items={diff.updates.map(u => ({ ...describe(u.row), changes: u.changed.map(f => ({ field: f, label: f, from: String(u.before[f] ?? ''), to: String(u.row[f] ?? '') })) }))} />
      )}
      {diff.inserts.length > 0 && <RowList title={`เพิ่ม (${diff.inserts.length})`} tone="emerald" items={diff.inserts.map(describe)} />}
    </div>
  );
}

const TONE = {
  amber: 'border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200',
  emerald: 'border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200',
  red: 'border-red-200 dark:border-red-900 text-red-700 dark:text-red-300',
};
const SHOW_MAX = 100;

function RowList({ title, items, tone, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-xl border ${TONE[tone]} bg-white dark:bg-slate-900`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold">
        {title}{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
          {items.slice(0, SHOW_MAX).map((it, i) => (
            <li key={i} className="px-3 py-2 text-sm">
              <p className="font-medium text-slate-800 dark:text-slate-100">{it.main}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{it.sub}</p>
              {it.changes?.map(ch => (
                <p key={ch.field} className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                  {ch.label}: <span className="line-through text-slate-400">{ch.from || '(ว่าง)'}</span> → <b>{ch.to || '(ว่าง)'}</b>
                </p>
              ))}
            </li>
          ))}
          {items.length > SHOW_MAX && <li className="px-3 py-2 text-xs text-slate-500">และอีก {fmtNum(items.length - SHOW_MAX)} แถว</li>}
        </ul>
      )}
    </div>
  );
}
