-- ============================================================
-- AP Workflow — Acknowledge by Purchaser
-- เพิ่ม 2 columns เพื่อ track ว่า จนท.จัดซื้อ "รับบิล" จากคลังแล้ว
-- (ก่อนกรรมการตรวจรับจริง)
-- รันใน Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE receive_logs
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,  -- เวลาจัดซื้อกด "รับบิลแล้ว"
  ADD COLUMN IF NOT EXISTS acknowledged_by TEXT;         -- ชื่อ จนท.จัดซื้อที่รับบิล

CREATE INDEX IF NOT EXISTS idx_receive_logs_ack ON receive_logs(acknowledged_at);

-- ============================================================
-- Workflow:
--   NULL + acknowledged_at IS NULL  → "รอจัดซื้อรับ"     (จัดซื้อยังไม่กดรับ)
--   NULL + acknowledged_at NOT NULL → "จัดซื้อรับแล้ว"   (รอกรรมการตรวจ)
--   inspected                        → "ตรวจรับแล้ว/รอส่งบัญชี"
--   ...
--
-- หมายเหตุ:
-- - acknowledged ไม่บล็อก flow — Mark ตรวจรับได้แม้ยังไม่ ack (กัน workflow ติด)
-- - แต่ถ้ามี ack → audit trail ดี
-- ============================================================
