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

-- ============================================================
-- ตรวจนับ: เวลาที่นับรายบรรทัด — เพิ่ม 2026-09-24
-- ============================================================
-- รอบประจำปีกินเวลาหลายวัน/หลายสัปดาห์ แต่เดิมมีแค่ stock_count_session.counted_at
-- = "วันเปิดรอบ" ทำให้ตอบไม่ได้ว่ายาตัวไหนถูกนับวันไหน (ทุกบรรทัดดูเหมือนนับวันเปิดรอบหมด)
--
-- ⚠️ ชื่อซ้ำกับ stock_count_session.counted_at โดยตั้งใจ — คนละระดับ:
--      session.counted_at = DATE   วันที่เปิดรอบ (รอบประจำปี = วันแรกที่เริ่มเดินนับ)
--      item.counted_at    = TSTZ   เวลาที่ "บรรทัดนี้" ถูกนับครั้งแรก
--    คู่กับ counted_qty / counted_exp / counted_lot ที่เป็นมิติของผลนับเหมือนกัน
--
-- นิยาม: **เวลาที่กดบันทึกครั้งแรก** (ยังไม่ได้นับ → นับแล้ว) ไม่ใช่เวลาที่แก้ล่าสุด
--   กลับมาแก้ยอดทีหลัง → เวลานี้ไม่เปลี่ยน (ใบรับรองต้องตอบ "นับวันไหน" ไม่ใช่ "แก้ล่าสุดเมื่อไหร่")
--   ใช้นาฬิกา DB (NOW()) ไม่ใช่นาฬิกาเครื่องผู้ใช้ — ปลอมไม่ได้ ตาม pattern ทุกตารางใน repo
--
-- ⚠️ null ได้ และ **ห้าม backfill** — แถวที่นับไปก่อนมีคอลัมน์นี้ไม่มีเวลาจริงให้กู้
--    (updateAnnualCountLine ไม่เขียน audit log โดยเจตนา จึงไม่มีร่องรอยที่ไหนเลย)
--    เติมด้วยเวลาเปิดรอบ = สร้างข้อมูลปลอมที่ดูเหมือนจริง → แสดงว่างแทน
ALTER TABLE stock_count_item
  ADD COLUMN IF NOT EXISTS counted_at TIMESTAMPTZ;

COMMENT ON COLUMN stock_count_item.counted_at IS
  'เวลาที่บรรทัดนี้ถูกนับครั้งแรก (นาฬิกา DB) — ไม่ทับเมื่อแก้ยอดภายหลัง; null = นับก่อนมีคอลัมน์นี้ หรือยังไม่ได้นับ. คนละอันกับ stock_count_session.counted_at ที่เป็นวันเปิดรอบ';

-- ============================================================
-- ตรวจสอบ
-- ============================================================
-- SELECT count(*) FILTER (WHERE counted_qty IS NOT NULL AND counted_at IS NULL) AS ไม่มีเวลา_ของเก่า,
--        count(*) FILTER (WHERE counted_at IS NOT NULL)                          AS มีเวลาแล้ว
-- FROM stock_count_item;
-- รันครั้งแรกต้องได้ มีเวลาแล้ว = 0 (แถวเก่าทั้งหมดไม่มีเวลา ตามที่ตั้งใจ)
