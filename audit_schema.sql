-- ============================================================
-- ระบบ Audit Log — บันทึกการกระทำสำคัญในระบบ
-- รันไฟล์นี้ใน Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  action       TEXT NOT NULL,
    -- 'import_inventory'   = นำเข้าข้อมูล inventory จาก CSV
    -- 'import_receive'     = นำเข้าข้อมูลรับยาจาก CSV
    -- 'insert_return'      = บันทึกคืนยา / ยาเสียหาย
    -- 'export_excel'       = ส่งออกข้อมูลเป็น Excel
    -- 'login'              = เข้าสู่ระบบ
  table_name   TEXT,               -- ตารางที่ถูกกระทำ (inventory, receive_logs, return_logs)
  user_name    TEXT NOT NULL DEFAULT '-',
  department   TEXT DEFAULT '-',
  record_count INT  DEFAULT NULL,  -- จำนวน record ที่เกี่ยวข้อง (import/export)
  details      JSONB DEFAULT NULL, -- ข้อมูลเพิ่มเติม เช่น { drug_name, return_type }
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_name);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all" ON audit_logs;
CREATE POLICY "Allow public all" ON audit_logs FOR ALL USING (true) WITH CHECK (true);
