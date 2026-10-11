// ============================================================
// CommandPalette — ช่องค้นหาเดียว (⌘K / Ctrl+K / ช่องใหญ่บนหน้าหลัก)
// ผล 2 กลุ่ม: "ยา" (ชื่อ/รหัส/lot → เปิดบัตรยา) ก่อน "เมนู" (หน้า/แบบฟอร์มจาก NAV_GROUPS)
// ตรรกะค้นยาอยู่ src/lib/drugProfile.js (searchDrugs) · รายการยาโหลดใหม่ทุกครั้งที่เปิด
//   (component นี้อยู่ใน AppShell ไม่ remount ตอนนำเข้า Excel — cache ข้ามรอบจะค้างยอดเก่า)
//
// สิทธิ์เมนู: ใช้ canSee เดียวกับ AppShell — ห้ามให้ค้นเจอหน้าที่ role ตัวเองเข้าไม่ได้
// ยา: ทุก role ค้นได้ (บัตรยาเลือกเองว่าแต่ละ role เห็นอะไร — CONTEXT §บัตรยา)
// ============================================================
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, CornerDownLeft, ArrowUp, ArrowDown, X, Pill, Loader2 } from 'lucide-react';
import { NAV_GROUPS, COLOR } from './navConfig';
import { fetchDrugSearchIndex } from './lib/db';
import { searchDrugs } from './lib/drugProfile';

// normalize สำหรับ match: ตัดช่องว่าง + lowercase (ไทยไม่มี case แต่ชื่อระบบมีอังกฤษปน เช่น Stockcard)
const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, '');

export default function CommandPalette({ open, onClose, onNavigate, onFormAction, onOpenDrug, role, permissions }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [drugIndex, setDrugIndex] = useState(null);   // null = ยังไม่ได้โหลด/กำลังโหลด
  const [drugError, setDrugError] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const canSee = (it) => it.roles.includes(role) || (it.page && (permissions || []).includes(it.page));

  // แบน NAV_GROUPS เป็นรายการค้นหา (เก็บชื่อกลุ่มไว้โชว์เป็น breadcrumb)
  const items = useMemo(() => {
    const out = [];
    for (const g of NAV_GROUPS) {
      for (const it of g.items) {
        if (it.children) {
          for (const c of it.children) {
            if (canSee(c)) out.push({ ...c, group: g.label, parent: it.title });
          }
        } else if (canSee(it)) {
          out.push({ ...it, group: g.label });
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, permissions]);

  const menuResults = useMemo(() => {
    const nq = norm(q);
    if (!nq) return items;
    // จัดอันดับ: ขึ้นต้นด้วยคำค้น > มีคำค้นอยู่ข้างใน (ชื่อเมนู ชนะ ชื่อกลุ่ม/พาเรนต์)
    return items
      .map(it => {
        const t = norm(it.title);
        const extra = norm(`${it.parent || ''}${it.group || ''}`);
        let score = -1;
        if (t.startsWith(nq)) score = 0;
        else if (t.includes(nq)) score = 1;
        else if (extra.includes(nq)) score = 2;
        return { it, score };
      })
      .filter(r => r.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map(r => r.it);
  }, [q, items]);

  const drugResults = useMemo(() => (drugIndex ? searchDrugs(drugIndex, q, 8) : []), [drugIndex, q]);

  // รายการเดียวสำหรับลูกศรขึ้น/ลง — ยาก่อนเมนู
  const entries = useMemo(() => [
    ...drugResults.map(d => ({ kind: 'drug', key: `drug:${d.code}`, d })),
    ...menuResults.map(it => ({ kind: 'menu', key: `menu:${it.page || it.action}`, it })),
  ], [drugResults, menuResults]);

  // เปิดใหม่ทุกครั้ง = เริ่มจากศูนย์ + โหลดรายการยาสด
  useEffect(() => {
    if (!open) return undefined;
    setQ(''); setActive(0); setDrugError(false);
    setTimeout(() => inputRef.current?.focus(), 0);
    let alive = true;
    fetchDrugSearchIndex()
      .then(ix => { if (alive) setDrugIndex(ix); })
      .catch(() => { if (alive) { setDrugIndex([]); setDrugError(true); } });
    return () => { alive = false; };
  }, [open]);

  useEffect(() => { setActive(0); }, [q]);

  const run = (entry) => {
    if (!entry) return;
    onClose();
    if (entry.kind === 'drug') { onOpenDrug?.(entry.d.code); return; }
    if (entry.it.action) onFormAction?.(entry.it.action);
    else onNavigate(entry.it.page);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, entries.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(entries[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  // เลื่อนรายการที่เลือกให้อยู่ในสายตาเมื่อกดลูกศร
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const hasQ = norm(q) !== '';
  const drugLoading = hasQ && drugIndex === null;
  const rowCls = (on) => `w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-colors ${on ? 'bg-slate-100 dark:bg-slate-800' : ''}`;
  const groupLabel = (text) => (
    <p className="px-2.5 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{text}</p>
  );

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/40 dark:bg-black/60 flex items-start justify-center p-4 pt-[10vh]"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* ช่องพิมพ์ */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-slate-100 dark:border-slate-800">
          <Search size={18} className="text-slate-400 dark:text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="ค้นหายา (ชื่อ / รหัส / lot) หรือเมนู..."
            aria-label="ค้นหายาหรือเมนู"
            className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
          />
          <button onClick={onClose} aria-label="ปิด" className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* ผลลัพธ์ */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto p-1.5">
          {hasQ && (
            <>
              {groupLabel('ยา')}
              {drugLoading ? (
                <p className="flex items-center gap-2 px-2.5 py-2 text-sm text-slate-400 dark:text-slate-500"><Loader2 size={14} className="animate-spin" /> กำลังโหลดรายการยา…</p>
              ) : drugError ? (
                <p className="px-2.5 py-2 text-sm text-red-600 dark:text-red-400">โหลดรายการยาไม่สำเร็จ — ปิดแล้วเปิดช่องค้นหาใหม่</p>
              ) : drugResults.length === 0 ? (
                <p className="px-2.5 py-2 text-sm text-slate-400 dark:text-slate-500">ไม่พบยาที่ตรงกับ &quot;{q}&quot;</p>
              ) : (
                drugResults.map((d, i) => {
                  const on = i === active;
                  return (
                    <button key={`drug:${d.code}`} data-active={on} onMouseEnter={() => setActive(i)} onClick={() => run(entries[i])} className={rowCls(on)}>
                      <span className="p-1 rounded-md shrink-0 bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300"><Pill size={15} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-slate-700 dark:text-slate-200">{d.name || d.code}</span>
                        <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500">
                          รหัส {d.code}{d.matchedLot ? ` · lot ${d.matchedLot}` : ''}
                        </span>
                      </span>
                      {!d.inStock && (
                        <span className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">ไม่มีของ</span>
                      )}
                    </button>
                  );
                })
              )}
              {menuResults.length > 0 && groupLabel('เมนู')}
            </>
          )}
          {/* ค้นแล้วไม่เจอเมนู = ซ่อนกลุ่มเมนูทั้งกลุ่ม (กลุ่มยาบอกผลการค้นอยู่แล้ว ไม่ต้องมี "ไม่พบ" ซ้ำ 2 บรรทัด) */}
          {menuResults.map((it, j) => {
            const i = drugResults.length + j;
            const Icon = it.icon;
            const col = COLOR[it.c] || COLOR.slate;
            const on = i === active;
            return (
              <button
                key={it.page || it.action}
                data-active={on}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(entries[i])}
                className={rowCls(on)}
              >
                <span className={`p-1 rounded-md shrink-0 ${col.icon} ${col.darkIcon}`}><Icon size={15} /></span>
                <span className="truncate text-slate-700 dark:text-slate-200">{it.title}</span>
                <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500 truncate shrink-0">
                  {it.parent ? `${it.group} · ${it.parent}` : it.group}
                </span>
              </button>
            );
          })}
        </div>

        {/* คำใบ้ปุ่มลัด */}
        <div className="flex items-center gap-3 px-4 h-9 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1"><ArrowUp size={11} /><ArrowDown size={11} /> เลื่อน</span>
          <span className="flex items-center gap-1"><CornerDownLeft size={11} /> เปิด</span>
          <span className="ml-auto">Esc ปิด</span>
        </div>
      </div>
    </div>
  );
}
