-- ============================================================
-- ตรวจนับคงคลัง: สถานะติดตามส่วนต่าง (ระดับรายการ) — ADR-0017
-- ============================================================
-- รันใน Supabase Dashboard → SQL Editor (ครั้งเดียว) ก่อน deploy
--
-- ทำไมระดับ "รายการ" ไม่ใช่ "รอบ":
--   รอบเดียวมีหลาย lot และแต่ละ lot จบคนละทาง — บาง lot ของหายจริงต้องไปแก้ HosXP
--   บาง lot แค่กรอกผิดแก้ในแอปจบ ถ้าเก็บสถานะที่ระดับรอบจะบันทึกได้แค่แบบเดียว
--
-- ⚠️ ไม่แตะ counted_* / system_* — ส่วนต่างยังอยู่ครบตาม ADR-0008 (append-only)
--    คอลัมน์นี้ตอบว่า "ใครตามเรื่องนี้แล้วหรือยัง" ไม่ใช่ "ทำให้ตัวเลขตรงกัน"
-- ============================================================

-- สถานะติดตาม: pending | fixed_source | confirmed_diff | fixed_entry
--   pending        = ยังไม่มีใครจัดการ (default — แถวเก่าทั้งหมดเป็นค่านี้)
--   fixed_source   = ไปแก้ที่ต้นทางแล้ว (HosXP/CSV) ให้ตรงกับของจริง
--   confirmed_diff = ยืนยันว่าส่วนต่างเป็นจริง (ของหาย/ย้ายชั้น) รับทราบแล้ว ไม่ต้องแก้
--   fixed_entry    = กรอกผิดตอนนับ แก้ค่าในแอปแล้ว
ALTER TABLE stock_count_item
  ADD COLUMN IF NOT EXISTS followup_status TEXT DEFAULT 'pending';

-- ใครเป็นคนกดปิดเรื่อง + เมื่อไหร่ (audit trail ระดับแถว — ไม่ต้อง join audit_logs)
ALTER TABLE stock_count_item
  ADD COLUMN IF NOT EXISTS followup_by   TEXT DEFAULT '';
ALTER TABLE stock_count_item
  ADD COLUMN IF NOT EXISTS followup_at   TIMESTAMPTZ;
ALTER TABLE stock_count_item
  ADD COLUMN IF NOT EXISTS followup_note TEXT DEFAULT '';

-- กรอง "ยังไม่จัดการ" เป็น query หลักของหน้าประวัติ
CREATE INDEX IF NOT EXISTS idx_stock_count_item_followup
  ON stock_count_item(followup_status);

-- ============================================================
-- ตรวจสอบ
-- ============================================================
-- SELECT followup_status, count(*) FROM stock_count_item GROUP BY 1;
-- แถวเก่าทั้งหมดต้องเป็น 'pending'

-- ============================================================
-- ตรวจนับประจำปี (annual count) — เพิ่ม 2026-09-20
-- ============================================================
-- แยกรอบประจำปี (632 บรรทัด) ออกจาก spot check (1–18 บรรทัด) ในหน้าประวัติ
-- ไม่งั้นรอบใหญ่จะกลบรอบเล็กจนหาไม่เจอ
--
-- ใช้ status ของเดิม ('draft' ระหว่างนับ → 'done' ตอนปิดรอบ) ไม่เพิ่มคอลัมน์ใหม่
-- draft อยู่บน DB ไม่ใช่ localStorage เพราะงานนับกินเวลาหลายวัน ข้ามเครื่อง/ข้ามวันได้
-- (localStorage = งานทั้งรอบแขวนบนเบราว์เซอร์เครื่องเดียว ล้าง cache แล้วหายถาวร)
ALTER TABLE stock_count_session
  ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'spot';   -- 'spot' | 'annual'

COMMENT ON COLUMN stock_count_session.kind IS
  'spot = ตรวจนับเฉพาะจุด (เลือกยาเอง) | annual = รอบประจำปี (ระบบ gen ทุก lot ที่มีของ)';

-- หา draft ที่ค้างอยู่ตอนเปิดหน้า + กรองประวัติตามชนิดรอบ
CREATE INDEX IF NOT EXISTS idx_stock_count_session_kind_status
  ON stock_count_session(kind, status);

-- ============================================================
-- ตรวจนับ: lot เป็นอีกมิติที่เทียบตรง/ไม่ตรง — เพิ่ม 2026-09-20
-- ============================================================
-- เดิมเทียบ 3 มิติ (จำนวน/ที่เก็บ/exp) แต่หน้างานเจอ lot บนกล่องไม่ตรงกับที่ระบบบันทึก
-- ซึ่งเป็นสัญญาณสำคัญ (รับเข้าคีย์ผิด / ของสลับ lot) เดิมจดได้แค่ในหมายเหตุซึ่งค้นย้อนหลังไม่ได้
--
-- ⚠️ ไม่แก้คอลัมน์ `lot` เดิม — นั่นคือ lot ที่ระบบบันทึกไว้ (snapshot) ใช้เป็น identity ของแถว
--    counted_lot = lot ที่อ่านได้จากกล่องจริง ว่าง = ไม่ได้ตรวจ (ไม่ใช่ "ตรง") ตาม ADR-0008
ALTER TABLE stock_count_item
  ADD COLUMN IF NOT EXISTS counted_lot TEXT DEFAULT '';

COMMENT ON COLUMN stock_count_item.counted_lot IS
  'lot ที่อ่านได้จากกล่องจริงตอนนับ — ว่าง = ไม่ได้ตรวจมิตินี้ (คนละอันกับคอลัมน์ lot ที่เป็น snapshot ของระบบ)';
