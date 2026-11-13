-- ============================================================
-- case_size_migration.sql  (เบิกยาออนไลน์ เฟส 1 ขั้น 3 · 13/11/2569)
-- ขนาดลัง = จำนวนหน่วยซื้อต่อ 1 ลัง (CONTEXT §ลัง)
--
-- case_size: มาจากชีท `ขนาดลัง` ใน ยอดคลังยา_69.xlsm (ตาราง CaseSize)
--            จับคู่ราย lot ด้วย รหัส + บริษัท (Master คอลัมน์ บริษัท) + หน่วยซื้อ (Master คอลัมน์ หน่วย)
--            NULL = ไม่รู้ขนาดลัง (ไม่มีในชีท หรือบริษัท/ขนาดแพ็คเปลี่ยน) — ห้ามเดาจาก lot อื่น
--            inventory ไม่เก็บบริษัท ใช้แค่ตอนนำเข้า (masterSheet.js parseCaseSizeGrid)
--
-- ⚠️ รันก่อน import:master --commit / ปุ่มนำเข้าจาก Excel ด้วยโค้ดใหม่ — ไม่งั้น insert ล้ม
--    (saveInventory ส่ง case_size ทุกแถว · fetchExcelSyncBaseline select case_size)
-- รันใน Supabase Dashboard → SQL Editor (รันซ้ำได้)
-- ============================================================

ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS case_size NUMERIC;

COMMENT ON COLUMN public.inventory.case_size IS
  'จำนวนหน่วยซื้อต่อ 1 ลัง จากชีท ขนาดลัง (คีย์ รหัส+บริษัท+หน่วยซื้อ) · NULL = ไม่รู้ขนาดลัง';
