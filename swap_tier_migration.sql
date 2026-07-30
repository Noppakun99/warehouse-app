-- swap_tier_migration.sql — เฟส 2 นโยบายคืนยา structured (ADR-0014)
-- เพิ่ม 2 คอลัมน์ใน receive_logs เก็บ structured detail จากคอลัมน์ Auto-Match ของ Excel แม่:
--   swap_tier_detail = col 28 "รายละเอียดเงื่อนไขการแลกเปลี่ยน (Auto-Match)" — tier % + ฐานเวลา (parseReturnPolicyV2 อ่านตัวนี้)
--   swap_return_pct  = col 29 "% คืนโดยประมาณ (Auto-Match)" — enum "100%/50-100%/..." สำหรับ cross-check
-- ⚠️ ต้องรันใน Supabase Dashboard ก่อน deploy + ก่อน import receive CSV รอบถัดไป
-- ไม่แตะ drug_swap_policy เดิม (V1 ยังใช้ merged free-text — backward-compat)

ALTER TABLE public.receive_logs ADD COLUMN IF NOT EXISTS swap_tier_detail text;
ALTER TABLE public.receive_logs ADD COLUMN IF NOT EXISTS swap_return_pct  text;

-- finding #2: เงื่อนไขบริษัท (Auto-Match) col27 = "เดียวกันทุกรายการ"/"แตกต่างกัน แล้วแต่รายการ"
--   "แตกต่างกัน" (authoritative) → นโยบายรายยา เชื่อ tier รวมไม่ได้ → override เป็น review ไม่เตือน (ADR-0012)
ALTER TABLE public.receive_logs ADD COLUMN IF NOT EXISTS swap_condition_am text;
