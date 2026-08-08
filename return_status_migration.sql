-- ============================================================
-- Workflow คืนยา ส่ง→รับ (ADR-0009) — เพิ่มสถานะ pending/received
-- รันไฟล์นี้ใน Supabase Dashboard > SQL Editor ก่อน deploy โค้ด
-- ============================================================

-- status: null = แถวเก่า (legacy) = ถือเป็น 'received' ใน code (ไม่ backfill)
--   'pending'  = รอเจ้าหน้าที่คลังยืนยันรับคืน
--   'received' = คลังยืนยันรับคืนแล้ว (เติม received_by + received_at ตอนกดยืนยัน)
ALTER TABLE return_logs ADD COLUMN IF NOT EXISTS status      TEXT;
ALTER TABLE return_logs ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_retlog_status ON return_logs(status);

-- หมายเหตุ: ไม่ backfill แถวเก่า — code (insertReturnLog default + fetchReturnLogs OR-filter)
-- treat status IS NULL เป็น received เพื่อไม่แตะ historical record (ตาม ADR-0009 / แนว ADR-0003)
