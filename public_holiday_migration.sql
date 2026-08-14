-- public_holiday_migration.sql — ปฏิทินวันหยุดราชการ (สำหรับบอทประกาศรอบเบิก-รับ)
-- ⚠️ ต้องรันใน Supabase Dashboard (SQL Editor) ก่อน deploy
--
-- ทำไมต้องเป็นตารางให้คนกรอก ไม่ใช่สูตรคำนวณ:
--   1. วันหยุดพุทธศาสนาเลื่อนตามจันทรคติ (วิสาขบูชา/อาสาฬหบูชา) คำนวณจากสุริยคติไม่ได้
--   2. ครม. ประกาศวันหยุดพิเศษเพิ่มกลางปี — ปีนี้มี ปีหน้าอาจไม่มี ไม่มีสูตร
--   ดู CONTEXT.md §"วันทำการ (Working Day)"

CREATE TABLE IF NOT EXISTS public.public_holiday (
  holiday_date date PRIMARY KEY,
  name         text NOT NULL,
  is_observed  boolean NOT NULL DEFAULT false,  -- true = วันหยุดชดเชย (แสดงผลเท่านั้น ไม่มีผลต่อ logic)
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.public_holiday IS
  'วันหยุดราชการที่คลังยาปิด — กรอกโดย admin ปีละครั้งตามประกาศ ครม. (ADR/CONTEXT: รอบเบิก-รับ)';
COMMENT ON COLUMN public.public_holiday.is_observed IS
  'วันหยุดชดเชย — ใช้แสดงผลในเหตุผลการเลื่อนเท่านั้น logic ไม่แยกแยะ';

-- RLS: เปิดพร้อม policy กว้างเหมือนตารางอื่นทั้งระบบ เพราะหน้า admin ในแอปเรียกผ่าน anon key
-- (ไม่ใช่ตารางที่ client ไม่ใช้ จึงไม่เข้าเงื่อนไข "เปิด RLS ไม่ใส่ policy" ของ ADR-0016)
ALTER TABLE public.public_holiday ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'public_holiday' AND policyname = 'Allow public all'
  ) THEN
    CREATE POLICY "Allow public all" ON public.public_holiday
      FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ดัชนีช่วง: หน้า admin แสดงรายปี, edge function ดึงช่วง ±2 เดือนรอบวันนี้
CREATE INDEX IF NOT EXISTS idx_public_holiday_date ON public.public_holiday (holiday_date);
