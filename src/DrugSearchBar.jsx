import React, { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

/**
 * DrugTypeBadge — badge แสดงชนิดยา
 * Export ออกมาเพื่อให้ไฟล์อื่น import ใช้ได้จากที่เดียว
 */
export function DrugTypeBadge({ type }) {
  if (!type || type === '-') return null;
  const t = type.trim().toLowerCase();
  let cls = 'bg-slate-100 text-slate-600';
  if (t === 'tablet')    cls = 'bg-blue-100 text-blue-700';
  else if (t === 'syrup')     cls = 'bg-green-100 text-green-700';
  else if (t === 'injection') cls = 'bg-rose-100 text-rose-700';
  else if (t === 'apply')     cls = 'bg-amber-100 text-amber-700';
  else if (t === 'inhale')    cls = 'bg-purple-100 text-purple-700';
  else if (t === 'saline')    cls = 'bg-cyan-100 text-cyan-700';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      {type}
    </span>
  );
}

/**
 * DrugSearchBar — input ค้นหาชื่อยา พร้อม dropdown autocomplete + DrugTypeBadge
 *
 * Props:
 *   value         string            — ค่าที่กำลังพิมพ์/เลือกอยู่
 *   onChange      fn(val: string)   — callback เมื่อพิมพ์หรือเลือกจาก dropdown
 *   options       {name,type}[]     — รายการยาสำหรับ autocomplete
 *   placeholder   string            — placeholder ของ input
 *   ringClass     string            — tailwind focus:ring-* class (default: focus:ring-indigo-400)
 *   hoverClass    string            — tailwind hover:bg-* class ของ dropdown item (default: hover:bg-indigo-50)
 *   maxResults    number            — จำนวนสูงสุดของ dropdown (default: 8)
 *   className     string            — class ของ wrapper div
 *   inputClassName string           — class เพิ่มเติมของ input
 */
export default function DrugSearchBar({
  value = '',
  onChange,
  onSelect,       // optional: called when item selected from dropdown (falls back to onChange)
  options = [],
  placeholder = 'ค้นหายา...',
  ringClass = 'focus:ring-indigo-400',
  hoverClass = 'hover:bg-indigo-50',
  maxResults = 8,
  className = '',
  inputClassName = '',
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // ปิด dropdown เมื่อคลิกนอก
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const suggestions = value.trim()
    ? options.filter(d => d.name.toLowerCase().includes(value.toLowerCase())).slice(0, maxResults)
    : [];

  const handleSelect = (name) => {
    if (onSelect) onSelect(name);
    else onChange(name);
    setOpen(false);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (value.trim()) setOpen(true); }}
        placeholder={placeholder}
        className={`w-full pl-9 pr-8 py-2 border border-slate-300 rounded-xl text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 ${ringClass} placeholder-slate-400 ${inputClassName}`}
      />
      {value && (
        <button
          onMouseDown={e => { e.preventDefault(); onChange(''); setOpen(false); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 z-10"
        >
          <X size={13} />
        </button>
      )}

      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 overflow-hidden">
          {suggestions.map(({ name, type }) => (
            <button
              key={name}
              onMouseDown={e => { e.preventDefault(); handleSelect(name); }}
              className={`w-full text-left px-4 py-2.5 text-sm text-slate-700 ${hoverClass} border-b border-slate-100 last:border-0 transition-colors`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span>{name}</span>
                {type && <DrugTypeBadge type={type} />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
