-- ============================================================
-- AP Workflow Migration (ระบบติดตามตั้งหนี้)
-- เพิ่ม columns สำหรับ workflow: ตรวจรับ → ส่งบัญชี (batch รายสัปดาห์) → ตั้งหนี้
-- รันใน Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE receive_logs
  ADD COLUMN IF NOT EXISTS ap_stage      TEXT,         -- 'inspected' | 'sent_batch' | 'posted' | NULL (legacy)
  ADD COLUMN IF NOT EXISTS inspected_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inspected_by  TEXT,         -- ชื่อกรรมการตรวจรับ (กรอก manual)
  ADD COLUMN IF NOT EXISTS ap_batch_id   TEXT,         -- 'YYYY-MM-DD' = วันที่ export ไฟล์ส่งบัญชี
  ADD COLUMN IF NOT EXISTS ap_sent_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ap_sent_by    TEXT,         -- staff ที่กด export batch
  ADD COLUMN IF NOT EXISTS ap_posted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ap_posted_by  TEXT;         -- staff ที่กดยืนยันบัญชี post แล้ว

-- Index ช่วย query batch + dashboard cards
CREATE INDEX IF NOT EXISTS idx_receive_logs_ap_stage   ON receive_logs(ap_stage);
CREATE INDEX IF NOT EXISTS idx_receive_logs_ap_batch   ON receive_logs(ap_batch_id);
CREATE INDEX IF NOT EXISTS idx_receive_logs_bill       ON receive_logs(bill_number);

-- ============================================================
-- Stage flow:
--   NULL (legacy)  → ข้อมูลเก่าก่อนใช้ระบบ tracking — ไม่บังคับ
--   'inspected'    → กรรมการตรวจรับเซ็นแล้ว (คลังกด)
--   'sent_batch'   → รวมในไฟล์ Excel weekly ส่งบัญชีแล้ว (จัดซื้อกด)
--   'posted'       → บัญชีตอบกลับว่า post เข้าระบบบัญชีแล้ว (staff กดยืนยัน)
--
-- ใครกด:
--   ทุก stage staff คลังกดให้ทั้งหมด (ไม่ต้องมี role แยก)
--   field "_by" เก็บชื่อผู้รับผิดชอบจริง (กรรมการ / จนท.จัดซื้อ / จนท.บัญชี)
--   field auth_user_name แยกอยู่ใน audit_logs
--
-- batch_id format:
--   ใช้วันที่ export = 'YYYY-MM-DD' (เช่น '2569-05-25')
--   1 batch = หลายบิล รวมเป็นไฟล์ Excel ส่งบัญชี 1 ไฟล์
-- ============================================================
