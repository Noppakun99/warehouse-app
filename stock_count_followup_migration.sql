-- ============================================================
-- ตรวจนับคงคลัง: สถานะติดตามส่วนต่าง (ระดับรายการ) — ADR-0017
-- ============================================================
-- รันใน Supabase Dashboard → SQL Editor (ครั้งเดียว) ก่อน deploy
--
-- ทำไมระดับ "รายการ" ไม่ใช่ "รอบ":
--   รอบเดียวมีหลาย lot และแต่ละ lot จบคนละทาง — บาง lot ของหายจริงต้องไปแก้ HosXP
--   บาง lot แค่กรอกผิดแก้ในแอปจบ ถ้าเก็บสถานะที่ระดับรอบจะบันทึกได้แค่แบบเดียว
--
-- ⚠️ ไม่แตะ counted_* / system_* — ส่วนต่างยังอยู่ครบตาม ADR-0008 (append-only)
--    คอลัมน์นี้ตอบว่า "ใครตามเรื่องนี้แล้วหรือยัง" ไม่ใช่ "ทำให้ตัวเลขตรงกัน"
-- ============================================================

-- สถานะติดตาม: pending | fixed_source | confirmed_diff | fixed_entry
--   pending        = ยังไม่มีใครจัดการ (default — แถวเก่าทั้งหมดเป็นค่านี้)
--   fixed_source   = ไปแก้ที่ต้นทางแล้ว (HosXP/CSV) ให้ตรงกับของจริง
--   confirmed_diff = ยืนยันว่าส่วนต่างเป็นจริง (ของหาย/ย้ายชั้น) รับทราบแล้ว ไม่ต้องแก้
--   fixed_entry    = กรอกผิดตอนนับ แก้ค่าในแอปแล้ว
ALTER TABLE stock_count_item
  ADD COLUMN IF NOT EXISTS followup_status TEXT DEFAULT 'pending';

-- ใครเป็นคนกดปิดเรื่อง + เมื่อไหร่ (audit trail ระดับแถว — ไม่ต้อง join audit_logs)
ALTER TABLE stock_count_item
  ADD COLUMN IF NOT EXISTS followup_by   TEXT DEFAULT '';
ALTER TABLE stock_count_item
  ADD COLUMN IF NOT EXISTS followup_at   TIMESTAMPTZ;
ALTER TABLE stock_count_item
  ADD COLUMN IF NOT EXISTS followup_note TEXT DEFAULT '';

-- กรอง "ยังไม่จัดการ" เป็น query หลักของหน้าประวัติ
CREATE INDEX IF NOT EXISTS idx_stock_count_item_followup
  ON stock_count_item(followup_status);

-- ============================================================
-- ตรวจสอบ
-- ============================================================
-- SELECT followup_status, count(*) FROM stock_count_item GROUP BY 1;
-- แถวเก่าทั้งหมดต้องเป็น 'pending'
