-- ============================================================
-- Picking Workflow Migration
-- เพิ่ม columns สำหรับ workflow: picking → ready → dispensed → received
-- รันใน Supabase Dashboard > SQL Editor
-- ============================================================

-- เพิ่ม columns ใน requisitions
ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS picker_name        TEXT,
  ADD COLUMN IF NOT EXISTS picking_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verifier_name      TEXT,
  ADD COLUMN IF NOT EXISTS verified_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispensed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by        TEXT;

-- เพิ่ม columns ใน requisition_items สำหรับบันทึก actual picking (FEFO)
ALTER TABLE requisition_items
  ADD COLUMN IF NOT EXISTS picked_lot TEXT,
  ADD COLUMN IF NOT EXISTS picked_exp TEXT,
  ADD COLUMN IF NOT EXISTS picked_qty INTEGER;

-- ============================================================
-- Status flow ใหม่:
--   pending → approved/partial/rejected
--          → picking  (เริ่มจัดยา)
--          → ready    (ตรวจนับแล้ว / double check)
--          → dispensed (จ่ายออกแล้ว)
--          → received  (หน่วยยืนยันรับ)
-- ============================================================
