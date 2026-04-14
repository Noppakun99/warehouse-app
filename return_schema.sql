-- ============================================================
-- ระบบคืนยา / บันทึกยาเสียหาย - Supabase Schema
-- รันไฟล์นี้ใน Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS return_logs (
  id              BIGSERIAL PRIMARY KEY,
  return_date     DATE NOT NULL,
  drug_name       TEXT NOT NULL DEFAULT '-',
  drug_code       TEXT DEFAULT '-',
  drug_type       TEXT DEFAULT '-',
  lot             TEXT DEFAULT '-',
  exp             TEXT DEFAULT '-',
  qty_returned    NUMERIC(12,2) NOT NULL DEFAULT 0,
  drug_unit       TEXT DEFAULT '-',
  return_type     TEXT NOT NULL DEFAULT 'ward_return',
    -- 'ward_return'       = คืนยาจาก Ward (stock เพิ่ม)
    -- 'damaged'           = ยาเสียหาย / แตกหัก (stock ลด)
    -- 'expired_removal'   = ตัดยาหมดอายุออก (stock ลด)
    -- 'vendor_return'     = ส่งคืนบริษัทยา (stock ลด)
  department      TEXT DEFAULT '-',   -- หน่วยงานที่คืน (สำหรับ ward_return)
  returned_by     TEXT DEFAULT '-',   -- ชื่อผู้คืน / ผู้แจ้ง
  received_by     TEXT DEFAULT '-',   -- เภสัชกรที่รับและบันทึก
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retlog_date ON return_logs(return_date DESC);
CREATE INDEX IF NOT EXISTS idx_retlog_type ON return_logs(return_type);
CREATE INDEX IF NOT EXISTS idx_retlog_drug ON return_logs(drug_name);
CREATE INDEX IF NOT EXISTS idx_retlog_dept ON return_logs(department);

ALTER TABLE return_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all" ON return_logs;
CREATE POLICY "Allow public all" ON return_logs FOR ALL USING (true) WITH CHECK (true);
