import { AlertTriangle, Check, X } from 'lucide-react';

/**
 * Popup ยืนยันการกระทำ — ใช้แทน window.confirm() ของเบราว์เซอร์
 *
 * ทำไมต้องมี: window.confirm แสดงกล่องของ OS ที่ขึ้นหัวว่า "Code"/ชื่อเบราว์เซอร์
 * อ่านเป็นภาษาอังกฤษ ปุ่ม OK/Cancel ไม่ใช่ภาษาไทย และหน้าตาหลุดจากธีมของแอป
 * (ธีมมืดก็ไม่ตาม) — repo นี้เลิกใช้ alert() ไปแล้วด้วยเหตุผลเดียวกัน (commit fe41c30)
 *
 * รูปแบบล้อ DispatchConfirmModal ใน RequisitionApp — หัวสี + ไอคอน + ปุ่มคู่
 *
 * @param {boolean}  open       แสดงหรือไม่
 * @param {string}   title      หัวข้อ เช่น 'เริ่มรอบตรวจนับประจำปี'
 * @param {string}   message    ข้อความหลัก
 * @param {string}   detail     บรรทัดรอง (ไม่บังคับ) — แสดงในกล่องสีเทา
 * @param {string}   warning    คำเตือน (ไม่บังคับ) — แสดงในกล่องสีเหลืองพร้อมไอคอน
 * @param {string}   confirmText  ข้อความปุ่มยืนยัน (default 'ยืนยัน')
 * @param {string}   cancelText   ข้อความปุ่มยกเลิก (default 'ยกเลิก')
 * @param {string}   tone       'primary' (น้ำเงิน) | 'danger' (แดง) — สีหัวและปุ่มยืนยัน
 * @param {boolean}  loading    กำลังทำงาน — ปิดปุ่มกันกดซ้ำ
 * @param {Function} onConfirm  กดยืนยัน
 * @param {Function} onClose    กดยกเลิก/ปิด
 */
export default function ConfirmModal({
  open, title, message, detail, warning,
  confirmText = 'ยืนยัน', cancelText = 'ยกเลิก',
  tone = 'primary', loading = false, onConfirm, onClose,
}) {
  if (!open) return null;

  const danger = tone === 'danger';
  const head = danger
    ? 'border-red-100 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40'
    : 'border-blue-100 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/40';
  const iconWrap = danger
    ? 'bg-red-100 dark:bg-red-950/60 text-red-600'
    : 'bg-blue-100 dark:bg-blue-950/60 text-blue-600';
  const titleColor = danger ? 'text-red-800 dark:text-red-300' : 'text-blue-800 dark:text-blue-300';
  const confirmBtn = danger
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-blue-600 hover:bg-blue-700';

  return (
    // คลิกฉากหลังปิดได้ — แต่ไม่ปิดระหว่างกำลังทำงาน (กันปิดทิ้งกลางคัน)
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4"
      onClick={() => { if (!loading) onClose?.(); }}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className={`px-5 py-4 border-b flex items-center gap-3 ${head}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconWrap}`}>
            {danger ? <AlertTriangle size={18} /> : <Check size={18} />}
          </div>
          <p className={`font-bold text-sm min-w-0 flex-1 ${titleColor}`}>{title}</p>
          <button onClick={onClose} disabled={loading}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg disabled:opacity-40 shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {message && <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line">{message}</p>}
          {detail && (
            <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
              {detail}
            </p>
          )}
          {warning && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl px-3 py-2.5">
              <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300 whitespace-pre-line">{warning}</p>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} disabled={loading}
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:border-slate-400 text-slate-700 dark:text-slate-200 rounded-xl py-2.5 font-medium text-sm transition-colors disabled:opacity-50">
            {cancelText}
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`flex-1 text-white rounded-xl py-2.5 font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 ${confirmBtn}`}>
            {loading ? 'กำลังดำเนินการ...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
