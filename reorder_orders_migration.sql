-- ============================================================
-- reorder_orders — เก็บสถานะ "สั่งแล้ว" ของ ReorderApp ลง DB
-- (เดิมอยู่ localStorage 'reorder.ordered' — หาย/ไม่ sync ข้ามเครื่อง)
-- รันไฟล์นี้ใน Supabase Dashboard > SQL Editor ก่อน deploy
-- อ้างอิง: docs/features/reorder.md (Phase 2 — ย้าย mark-ordered → DB)
-- ============================================================
-- 1 แถว = 1 รหัสยาที่ถูก mark "สั่งแล้ว"; untick = ลบแถว (persist จนกว่าคนกดเอง)

CREATE TABLE IF NOT EXISTS reorder_orders (
  code        TEXT PRIMARY KEY,                    -- รหัสยา HosXP (codeKey — trim/normalize ฝั่ง app)
  ordered_at  DATE NOT NULL DEFAULT CURRENT_DATE,  -- วันที่กด "สั่งแล้ว"
  ordered_by  TEXT DEFAULT '-',                    -- ผู้กด (resolveAuditUserName)
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS — public read/write (internal app) ตาม pattern เดิม
ALTER TABLE reorder_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all" ON reorder_orders;
CREATE POLICY "Allow public all" ON reorder_orders FOR ALL USING (true) WITH CHECK (true);
