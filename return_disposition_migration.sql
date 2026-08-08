-- ระบบคืนยา: เพิ่มขั้นตัดสินใจผลการดำเนินการ (disposition) หลัง staff ตรวจรับ
-- ADR-0012 — ต้องรันใน Supabase Dashboard ก่อน deploy
--
-- disposition: ผลการดำเนินการที่ staff เลือกตอนยืนยันรับคืน
--   restock   = รับเข้าคลัง (ยาสภาพดี)           — ไม่บวก inventory.qty (คง append-only)
--   dispose   = ทำลาย/ตัดจำหน่าย (หมดอายุ/เสียหาย)
--   to_vendor = ส่งคืนบริษัท (recall/vendor)
--   rejected  = ปฏิเสธการคืน
-- เก็บเป็นการ "บันทึกผลตรวจ" เท่านั้น ไม่แตะ stock จริง (CONTEXT.md §Return)

ALTER TABLE public.return_logs
  ADD COLUMN IF NOT EXISTS disposition      TEXT,          -- restock|dispose|to_vendor|rejected (null = ยังไม่ตัดสิน)
  ADD COLUMN IF NOT EXISTS disposition_note TEXT,          -- เหตุผล/หมายเหตุการดำเนินการ
  ADD COLUMN IF NOT EXISTS disposition_at   TIMESTAMPTZ,   -- เวลาที่ตัดสิน
  ADD COLUMN IF NOT EXISTS disposition_by   TEXT;          -- ชื่อ staff ที่ตัดสิน

-- index สำหรับ filter tab ตามผลการดำเนินการ
CREATE INDEX IF NOT EXISTS idx_return_logs_disposition ON public.return_logs (disposition);
