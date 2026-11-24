-- ============================================================
-- case_word_migration.sql  (เบิกเป็นลัง · 24/11/2569)
-- คำเรียกลัง + หน่วยในลัง จากชีท `ขนาดลัง` คอลัมน์ H `เรียกว่า` / I `หน่วยในลัง` (ตาราง CaseSize ใน ยอดคลังยา_69.xlsm)
--
-- case_word: ลัง / แพ็ค / กล่อง — NULL = ชีทเว้นว่าง (จอเรียก "ลัง")
-- case_unit: ชื่อหน่วยซื้อในลัง เช่น ขวด / หลอด / กระปุก / vial — NULL = ชีทเว้นว่าง (จอใช้หน่วยตาม Master ไม่เดา)
-- จับคู่ราย lot ด้วยคีย์เดียวกับ case_size (รหัส + บริษัท + หน่วยซื้อ — masterSheet.js parseCaseSizeGrid)
--
-- ⚠️ รันก่อน import:master --commit / ปุ่มนำเข้าจาก Excel ด้วยโค้ดใหม่ — ไม่งั้น insert ล้ม
-- รันใน Supabase Dashboard → SQL Editor (รันซ้ำได้) · รันแล้ว 24/11/2569 ผ่าน MCP
-- ============================================================

ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS case_word TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS case_unit TEXT;

COMMENT ON COLUMN public.inventory.case_word IS
  'คำเรียกลังจากชีท ขนาดลัง คอลัมน์ เรียกว่า (ลัง/แพ็ค/กล่อง) · NULL = เว้นว่าง จอเรียก ลัง';
COMMENT ON COLUMN public.inventory.case_unit IS
  'ชื่อหน่วยซื้อในลัง จากชีท ขนาดลัง คอลัมน์ หน่วยในลัง · NULL = เว้นว่าง จอใช้หน่วยตาม Master';
