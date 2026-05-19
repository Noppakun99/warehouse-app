-- เพิ่ม column return_source สำหรับระบบเลือกประเภทการคืนยา 2 ระดับ
-- รัน 1 ครั้งใน Supabase Dashboard > SQL Editor

ALTER TABLE return_logs ADD COLUMN IF NOT EXISTS return_source TEXT;
