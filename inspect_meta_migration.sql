-- inspect_meta: หลักฐานการตรวจรับยา (checklist + รูป + ชื่อกรรมการ) เก็บเป็น jsonb ก้อนเดียว
-- รันใน Supabase Dashboard → SQL Editor ก่อน deploy code
--
-- โครงสร้าง:
-- {
--   "images":    ["https://.../inspect-xxx.jpg", ...],   -- URL รูปตอนตรวจรับ (บังคับ >= 1)
--   "checklist": { "qty": true, "exp": true, "lot": true, "doc": true },  -- ติ๊กยืนยันครบทุกข้อ
--   "inspector": "ชื่อกรรมการตรวจรับ",
--   "at":        "2026-06-27T05:00:00.000Z"              -- timestamp ตอนยืนยัน
-- }

ALTER TABLE receive_logs ADD COLUMN IF NOT EXISTS inspect_meta jsonb;

-- index เพื่อ query บิลที่ "ตรวจรับแล้วแต่ไม่มีรูป" (inspect_meta IS NULL หรือ images ว่าง)
CREATE INDEX IF NOT EXISTS idx_receive_logs_inspect_meta ON receive_logs USING gin (inspect_meta);
