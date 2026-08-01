// ============================================================
// CommandPalette — ช่องค้นหาเมนู (⌘K / Ctrl+K)
// ขอบเขต: ค้นหน้า/เมนู จาก NAV_GROUPS เท่านั้น (ไม่แตะ db.js ไม่ค้นชื่อยา)
//   → ถ้าจะต่อยอดค้นชื่อยาภายหลัง: เพิ่ม source เข้า `items` แล้ว group ด้วย field `kind`
//
// สิทธิ์: ใช้ canSee เดียวกับ AppShell — ห้ามให้ค้นเจอหน้าที่ role ตัวเองเข้าไม่ได้
// ============================================================
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, CornerDownLeft, ArrowUp, ArrowDown, X } from 'lucide-react';
import { NAV_GROUPS, COLOR } from './navConfig';

// normalize สำหรับ match: ตัดช่องว่าง + lowercase (ไทยไม่มี case แต่ชื่อระบบมีอังกฤษปน เช่น Stockcard)
const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, '');

export default function CommandPalette({ open, onClose, onNavigate, onFormAction, role, permissions }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
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

  const results = useMemo(() => {
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

  // เปิดใหม่ทุกครั้ง = เริ่มจากศูนย์
  useEffect(() => {
    if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  useEffect(() => { setActive(0); }, [q]);

  const run = (item) => {
    if (!item) return;
    onClose();
    if (item.action) onFormAction?.(item.action);
    else onNavigate(item.page);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  // เลื่อนรายการที่เลือกให้อยู่ในสายตาเมื่อกดลูกศร
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

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
            placeholder="ค้นหาเมนู..."
            className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
          />
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* ผลลัพธ์ */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-400 dark:text-slate-500">ไม่พบเมนูที่ตรงกับ &quot;{q}&quot;</p>
          ) : (
            results.map((it, i) => {
              const Icon = it.icon;
              const col = COLOR[it.c] || COLOR.slate;
              const on = i === active;
              return (
                <button
                  key={it.page || it.action}
                  data-active={on}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(it)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-colors ${on ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                >
                  <span className={`p-1 rounded-md shrink-0 ${col.icon} ${col.darkIcon}`}><Icon size={15} /></span>
                  <span className="truncate text-slate-700 dark:text-slate-200">{it.title}</span>
                  <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500 truncate shrink-0">
                    {it.parent ? `${it.group} · ${it.parent}` : it.group}
                  </span>
                </button>
              );
            })
          )}
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
