-- เพิ่มหมายเหตุฝั่งเจ้าหน้าที่คลัง (ตอนจัดยา) แยกจาก item_note ของผู้เบิก
-- รันใน Supabase Dashboard → SQL Editor ก่อน deploy
ALTER TABLE requisition_items ADD COLUMN IF NOT EXISTS staff_note text;
