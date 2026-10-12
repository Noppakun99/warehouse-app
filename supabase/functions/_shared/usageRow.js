// usageRow.js — กฎ "แถวเบิกที่นับเป็นการใช้" สำหรับเรท (CONTEXT.md §เรท) + วันที่แบบ local
// pure module ไม่มี dependency — วางใน supabase/functions/_shared/ โดยเจตนา (แบบ announceSchedule.js):
// แอป (db.js/ReorderApp) และ edge function expiry-alert import ไฟล์เดียวกัน ไม่ต้อง copy เป็น TS แล้ว sync ทีหลัง
// golden test: src/lib/usageRow.test.js (npm run test:usagerow)
//
// ตรงกับสูตรชีทวิเคราะห์สั่งซื้อของคลัง (E4: SUMPRODUCT … เบิกยา[ชนิดรายการ]<>… เบิกยา[หน่วยงานที่เบิก]<>…)
// ใช้ทุกจุดที่คิดเรทในแอป — เรทสั่งซื้อ (ReorderApp) และเรทความจำเป็นต้องคืนบริษัท ต้องนิยามเดียวกัน

export const NON_USAGE_ITEM_TYPES = new Set(['บันทึกเท่านั้น', 'ยาโครงการ'])
export const NON_USAGE_DEPARTMENTS = new Set(['คืนยา', 'เบิกเพื่อแลกเปลี่ยนคืนยา'])

// แถวเบิกนี้นับเป็นการใช้ยาจริงไหม — `เบิกเพิ่มจากความผิดพลาด` / `แก้ไขระบบ` นับ (ของออกจากคลังจริง)
export function isUsageRow(row) {
  const itemType = String(row?.item_type ?? '').trim()
  const department = String(row?.department ?? '').trim()
  return !NON_USAGE_ITEM_TYPES.has(itemType) && !NON_USAGE_DEPARTMENTS.has(department)
}

// Date → 'YYYY-MM-DD' จากวันที่ตามเวลาเครื่อง
// ห้ามใช้ toISOString().slice(0, 10) กับวันที่ local — บน UTC+7 วันที่ 00:00 local คือวันก่อนหน้าใน UTC
export function localYmd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
