import React from 'react';
import { ArrowLeft } from 'lucide-react';

// ปุ่มย้อนกลับ inline — วางซ้ายชื่อระบบใน header ของทุก sub-app
// (เดิมเป็นปุ่มลอยใน AppShell ที่ทับชื่อระบบ — ย้ายมา inline ให้สม่ำเสมอทุกหน้า)
// แสดงเมื่อ canGoBack เท่านั้น (หน้า dashboard ไม่มีให้ย้อน)
export default function BackButton({ onGoBack, canGoBack, className = '' }) {
  if (!canGoBack || !onGoBack) return null;
  return (
    <button
      onClick={onGoBack}
      aria-label="ย้อนกลับ"
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 text-sm font-medium transition-colors shrink-0 ${className}`}
    >
      <ArrowLeft size={16} /> <span className="hidden sm:inline">ย้อนกลับ</span>
    </button>
  );
}
