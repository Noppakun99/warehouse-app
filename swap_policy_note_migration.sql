-- swap_policy_note_migration.sql — หมายเหตุนโยบายคืนบริษัท (25/11/2569)
-- เก็บคอลัมน์ F ของชีท เงื่อนไข_แจกแจง (ไฟล์รับยา) ผ่าน รับยา AD (= C | F) → receiveSheet.js policyNoteFromMatch
-- เช่น หนังสือบริษัทแจ้งรับเปลี่ยนคืนราย lot (Gemotran lot 201025 ภิญโญ 20/11/2569) ให้บัตรยา/หน้านโยบายคืนบริษัทแสดง
-- แยกจาก drug_swap_policy โดยเจตนา — บอท expiry-alert พิมพ์และ parse ข้อความนั้น
-- ⚠️ ต้องรันก่อน npm run import:receive -- --commit (insertReceiveRows ลบทั้งตารางก่อน insert — คอลัมน์ไม่มี = ตารางว่าง)

ALTER TABLE public.receive_logs ADD COLUMN IF NOT EXISTS swap_policy_note text;
