import { useEffect } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

/**
 * Toast แจ้งผลมุมขวาล่าง — ใช้แทน alert() ของ browser
 *
 * ย้ายมาจาก Toast ที่เดิมอยู่ใน UserManagementApp (สไตล์เดียวกัน) เพื่อให้ทุก sub-app ใช้ร่วมกัน
 * error หายช้ากว่า success เพราะผู้ใช้ต้องมีเวลาอ่านสาเหตุ
 *
 * @param {string}   message  ข้อความ (ว่าง/null = ไม่แสดง)
 * @param {string}   tone     'success' (เขียว) | 'error' (แดง)
 * @param {Function} onClose  ต้องเป็น callback เสถียร (useCallback) ไม่งั้น timer reset ทุก render
 */
export default function Toast({ message, tone = 'success', onClose }) {
  const isError = tone === 'error';

  useEffect(() => {
    const t = setTimeout(onClose, isError ? 5000 : 2500);
    return () => clearTimeout(t);
  }, [message, onClose, isError]);

  const Icon = isError ? AlertCircle : CheckCircle;

  return (
    <div
      role="status"
      className={`fixed bottom-5 right-5 z-[60] flex items-start gap-2.5 rounded-xl shadow-2xl pl-4 pr-3 py-3 text-sm max-w-sm ${
        isError ? 'bg-rose-700 text-white' : 'bg-slate-800 text-white'
      }`}
    >
      <Icon size={16} className={`shrink-0 mt-0.5 ${isError ? 'text-rose-200' : 'text-emerald-400'}`} />
      <span className="flex-1 whitespace-pre-line">{message}</span>
      <button
        type="button"
        onClick={onClose}
        className={`transition-colors shrink-0 ${isError ? 'text-rose-200 hover:text-white' : 'text-slate-400 hover:text-white'}`}
      >
        <X size={15} />
      </button>
    </div>
  );
}
