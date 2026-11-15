-- หมายเหตุผู้ตรวจจ่าย (ไม่บังคับ) — ตรวจเจอของผิดแล้วแจ้งแก้: หยิบผิดยา / ผิด lot / จำนวนไม่ตรง / อื่นๆ (user สั่ง 15/11/2569)
-- แยกจาก staff_note (หมายเหตุคลังตอนจัด ขึ้นใบ lot คุม) และ item_note (ผู้เบิก) — คนละคนเขียน
-- รันใน Supabase Dashboard → SQL Editor ก่อน deploy
ALTER TABLE requisition_items ADD COLUMN IF NOT EXISTS verify_note text;
