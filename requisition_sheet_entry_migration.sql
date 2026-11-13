-- ============================================================
-- requisition_sheet_entry_migration.sql  (เบิกยาออนไลน์ เฟส 0 · 12/11/2569)
-- ใบเบิกออนไลน์ที่ลงชีทเบิกแล้ว — ฐานของกฎเลิกหักยอดจอง (CONTEXT §ตัดยอดชั่วคราว)
--
-- receipt_no       = เลขรับใบเบิก บย.70/xxxx ที่สคริปต์ลงชีทเขียนกลับ (แอปไม่ออกเลขเอง)
-- sheet_entered_at = เวลาที่ลงชีทเบิกแล้ว · ใบเลิกหักยอดเมื่อมีการนำเข้ายอดคลัง (audit import_inventory)
--                    หลังเวลานี้ — ไม่ขึ้นกับสถานะใบหรือเวลาจ่าย
--
-- backfill: ใบที่จ่ายแล้วก่อน migration ถือว่าลงชีท ณ เวลาจ่าย = พฤติกรรมเดิม (เลิกหักเมื่อนำเข้าหลังจ่าย)
--           ไม่งั้นใบเก่าที่ไม่มีเลข บย. ถูกหักยอดค้างตลอดไป (ณ 12/11/2569 ตารางว่าง — เผื่อรันซ้ำ)
--
-- รันใน Supabase Dashboard → SQL Editor ก่อน deploy โค้ด (รันซ้ำได้)
-- ============================================================

ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS receipt_no TEXT;
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS sheet_entered_at TIMESTAMPTZ;

-- 1 ใบ = 1 เลข บย. (CONTEXT §ใบเบิกออนไลน์)
CREATE UNIQUE INDEX IF NOT EXISTS requisitions_receipt_no_key
  ON public.requisitions (receipt_no) WHERE receipt_no IS NOT NULL;

UPDATE public.requisitions
   SET sheet_entered_at = COALESCE(dispensed_at, updated_at)
 WHERE status IN ('dispensed', 'received')
   AND sheet_entered_at IS NULL;
