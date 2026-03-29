import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';

/**
 * SearchableSelect — dropdown ที่พิมพ์ค้นหาได้
 * Props:
 *   value       string  — ค่าที่เลือกอยู่
 *   onChange    fn(val) — callback เมื่อเลือก
 *   options     string[] — รายการตัวเลือก
 *   placeholder string  — ข้อความเมื่อยังไม่ได้เลือก (default "-- เลือกหน่วยงาน --")
 *   emptyLabel  string  — option แรก "ทุกหน่วยงาน" / null = ไม่มี
 *   className   string  — class ของ container input
 */
export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = '-- เลือกหน่วยงาน --',
  emptyLabel = null,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  // ปิด dropdown เมื่อคลิกนอก
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // เมื่อ open ให้ reset query เป็น ''
  const handleOpen = () => { setQuery(''); setOpen(true); };

  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()));

  const select = (val) => { onChange(val); setOpen(false); setQuery(''); };

  const displayText = value || '';

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Input */}
      <div
        className="flex items-center gap-1 w-full border border-slate-300 rounded-xl bg-white cursor-pointer overflow-hidden focus-within:ring-2 focus-within:ring-[#1E90FF] focus-within:border-transparent"
        onClick={handleOpen}
      >
        <input
          type="text"
          value={open ? query : (displayText || placeholder)}
          onChange={e => setQuery(e.target.value)}
          onFocus={handleOpen}
          placeholder={placeholder}
          className={`flex-1 px-3 py-2 text-sm bg-transparent outline-none cursor-pointer ${!open && !value ? 'text-slate-400' : 'text-slate-800'}`}
        />
        {value && !open ? (
          <button
            type="button"
            onMouseDown={e => { e.stopPropagation(); select(emptyLabel !== null ? '' : ''); onChange(''); }}
            className="pr-2 text-slate-400 hover:text-slate-600"
          >
            <X size={13} />
          </button>
        ) : (
          <span className="pr-2 text-slate-400 pointer-events-none">
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        )}
      </div>

      {/* Dropdown list */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {emptyLabel !== null && (
            <div
              onMouseDown={() => select('')}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-[#F0F8FF] ${!value ? 'text-[#1E90FF] font-semibold' : 'text-slate-500'}`}
            >
              {emptyLabel}
            </div>
          )}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-400">ไม่พบ "{query}"</div>
          )}
          {filtered.map(o => (
            <div
              key={o}
              onMouseDown={() => select(o)}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-[#F0F8FF] ${value === o ? 'text-[#1E90FF] font-semibold bg-[#F0F8FF]' : 'text-slate-800'}`}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
