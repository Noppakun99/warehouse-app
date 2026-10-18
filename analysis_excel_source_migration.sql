-- ============================================================
-- analysis_excel_source_migration.sql
-- รองรับ Import ผลวิเคราะห์จาก Excel "วิเคราะห์สั่งซื้อ"
-- (ดู docs/features/reorder-excel-redesign.md)
--
-- เพิ่มเฉพาะคอลัมน์ source — VEN/ตัวคูณ SS/วันที่รับเข้าล่าสุด
-- เก็บใน results JSONB อยู่แล้ว ไม่ต้องเพิ่ม column
--
-- รันใน Supabase Dashboard > SQL Editor ก่อน deploy
-- ============================================================

ALTER TABLE analysis_runs
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'app'
  CHECK (source IN ('app', 'excel'));

COMMENT ON COLUMN analysis_runs.source IS
  'app = แอปคำนวณเอง (reorder.js) | excel = import จากชีต "วิเคราะห์สั่งซื้อ" (Excel เป็นเจ้าของสูตร)';

CREATE INDEX IF NOT EXISTS idx_analysis_runs_source ON analysis_runs(source);
