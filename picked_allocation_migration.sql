-- picked_allocation_migration.sql
-- ADR-0005: เก็บ lot ที่ staff จัดจริง (FEFO, อาจหลาย lot ต่อ 1 รายการ)
-- รันใน Supabase Dashboard (SQL Editor) ก่อน deploy
--
-- โครงสร้าง: [{ "lot": "194634", "exp": "2030-12-26", "base": 5000, "packsTouched": 5 }, ...]
--   base = จำนวนเม็ด (หน่วยย่อยสุด) ที่จ่ายจาก lot นี้
--   packsTouched = จำนวนกล่องที่ต้องเปิด (แสดงผล)
-- คง picked_lot/picked_exp/picked_qty เดิมไว้ (lot แรก + รวม qty) เพื่อ backward-compat

ALTER TABLE requisition_items
  ADD COLUMN IF NOT EXISTS picked_allocation jsonb;

COMMENT ON COLUMN requisition_items.picked_allocation IS
  'lot ที่จ่ายจริงตาม FEFO (ADR-0005): [{lot,exp,base,packsTouched}] — base=เม็ด, อาจหลาย lot';
