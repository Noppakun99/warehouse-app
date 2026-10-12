// ตัวกรองรองบนมือถือ (< md) — ปุ่ม "ตัวกรอง (N)" + bottom sheet
// เดิมการ์ดตัวกรองของประวัติเบิก/รับยาเป็น sticky และกินจอ ~1/3 ตลอดการเลื่อนบนมือถือ
// หน้าเรียกใช้เก็บตัวกรองเป็นตัวแปร JSX ชุดเดียว แล้ววาง "ที่ใดที่หนึ่ง" ตามขนาดจอ — คอมใช้ layout เดิม มือถือส่งเข้า sheet นี้
// ห้าม render ตัวกรองสองชุดพร้อมกัน (ซ่อนด้วย CSS) — ช่องบริษัทของประวัติรับยาใช้ ref ตรวจคลิกนอกช่อง สองชุด = ref ชี้ผิดตัว
import { useEffect } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

export function FilterButton({ activeCount = 0, onOpen }) {
  return (
    <button type="button" onClick={onOpen} aria-label={activeCount ? `ตัวกรอง (${activeCount})` : 'ตัวกรอง'}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${activeCount
        ? 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300'
        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}>
      <SlidersHorizontal size={15} />
      ตัวกรอง
      {activeCount > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-sky-600 text-white text-[10px] font-bold inline-flex items-center justify-center">{activeCount}</span>}
    </button>
  );
}

// z-50 = เหนือแถบปุ่มล่างจอของ AppShell (z-30) · ไม่ใส่ overflow ที่แผง — dropdown ของ SearchableSelect (absolute) จะถูกตัด
// min-h 60vh: ช่องเลือกอยู่ส่วนบนของแผง มีที่ให้ dropdown (สูง 224px) กางลง — แผงเตี้ยชิดก้นจอ dropdown ล้นขอบจอ รายการท้ายกดไม่ได้
export default function FilterSheet({ open, onClose, onClear, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="ตัวกรอง" onClick={e => e.stopPropagation()}
        className="relative w-full min-h-[60vh] flex flex-col gap-3 bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl p-4 pb-6">
        <div className="flex items-center gap-2">
          <span className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700 absolute left-1/2 -translate-x-1/2 -mt-2" />
          <h3 className="flex-1 font-bold text-slate-800 dark:text-slate-100">ตัวกรอง</h3>
          <button type="button" onClick={onClose} aria-label="ปิดตัวกรอง" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        {children}
        <div className="flex gap-2 pt-1 mt-auto">
          <button type="button" onClick={onClear}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-600 dark:text-slate-300">ล้างตัวกรอง</button>
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold">ดูผลลัพธ์</button>
        </div>
      </div>
    </div>
  );
}
