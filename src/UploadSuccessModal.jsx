import { useState } from 'react';
import { Check, AlertTriangle, X, MapPin } from 'lucide-react';

/**
 * Popup ยืนยันหลังอัปโหลดไฟล์ (CSV/Excel) เสร็จ — ใช้ร่วมทุก sub-app ที่มีการอัปโหลด
 *
 * รวม "สำเร็จ" กับ "แถวที่ไม่ผ่านเงื่อนไข" เป็น popup เดียว (เดิมเป็น modal ส้มแยกอีกชั้น
 * ทำให้ผู้ใช้ต้องกดรับทราบ 2 ครั้งเมื่อไฟล์มีปัญหา) — รายการแถวปัญหาพับไว้ กดดูได้
 *
 * @param {boolean}  open      แสดง popup หรือไม่
 * @param {string}   title     หัวข้อ เช่น 'นำเข้า CSV คลังเบิกสำเร็จ'
 * @param {string}   message   บรรทัดสรุป เช่น 'นำเข้า 1,204 รายการ'
 * @param {string}   fileName  ชื่อไฟล์ที่อัปโหลด (ไม่บังคับ)
 * @param {Array}    warnings  [{ row, name, code, location, issues[] }] — ไม่มี/ว่าง = ไม่แสดงส่วนเตือน
 * @param {Function} onClose   ปิด popup (ต้องเคลียร์ทั้ง success และ warnings ที่ฝั่ง caller)
 */
export default function UploadSuccessModal({ open, title = 'อัปโหลดสำเร็จ', message, fileName, warnings = [], onClose }) {
  const [showRows, setShowRows] = useState(false);
  if (!open) return null;

  const warnCount = warnings?.length || 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-emerald-500 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <p className="font-bold text-lg flex items-center gap-2"><Check size={20}/> {title}</p>
            {fileName && <p className="text-emerald-50 text-sm truncate">ไฟล์: {fileName}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white bg-white/20 hover:bg-white/30 p-2 rounded-xl transition-colors shrink-0"
          >
            <X size={18}/>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-3">
          {message && <p className="text-slate-700 dark:text-slate-200">{message}</p>}

          {warnCount > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <p className="text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <AlertTriangle size={16} className="shrink-0"/>
                  มี {warnCount.toLocaleString()} แถวที่ควรตรวจสอบ — ข้อมูลที่ถูกต้องถูกบันทึกแล้ว
                </p>
                <button
                  onClick={() => setShowRows(v => !v)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium shrink-0"
                >
                  {showRows ? 'ซ่อนรายการ' : 'ดูแถวที่มีปัญหา'}
                </button>
              </div>

              {showRows && (
                <div className="mt-3 space-y-2">
                  {warnings.map((r, i) => (
                    <div key={i} className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-xl px-4 py-2 text-sm">
                      <div className="flex gap-3 items-start">
                        <span className="font-mono bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded text-xs font-bold shrink-0">Row {r.row}</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{r.name}</span>
                          {r.code && r.code !== '-' && <span className="text-slate-400 dark:text-slate-500 ml-2 text-xs">[{r.code}]</span>}
                          {r.location && <span className="text-slate-500 dark:text-slate-400 ml-2 text-xs inline-flex items-center gap-0.5"><MapPin size={11}/>{r.location}</span>}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {r.issues.map((issue, j) => (
                              <span key={j} className="bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60 px-2 py-0.5 rounded-full text-xs">{issue}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">แก้ไขไฟล์ต้นทางแล้วอัปโหลดใหม่ได้</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium text-sm">
            รับทราบ
          </button>
        </div>
      </div>
    </div>
  );
}
