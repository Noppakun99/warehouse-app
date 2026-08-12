-- drug_loan_migration.sql — ยืม-คืนยาระหว่างโรงพยาบาล (ทาง B)
--
-- ทำไมเป็นตารางใหม่ ไม่ derive จาก receive_logs/dispense_logs:
--   วัดแล้ว (12/08/2569): CSV ยืมยา_คืนยา 41 แถว vs receive_logs ที่ purchase_type
--   เป็น 'การยืม'/'การคืน' 68 แถว → **50 แถวใน DB ไม่มีใน CSV** และ 12 แถวใน CSV
--   ชนกับการซื้อปกติ (code+lot เดียวกัน) แยกด้วยวันที่ก็ไม่ออก
--   = 2 แหล่งไม่ใช่ชุดเดียวกัน reconcile อัตโนมัติไม่ได้ จึงให้ตารางนี้เป็น
--   source of truth ของ "การยืม" โดยตรง ส่วน receive_logs/dispense_logs
--   ทำหน้าที่เดิม (ของเข้า-ออกคลัง/มูลค่า) ไม่แตะ
--
-- ⚠️ ระบบนี้ **ไม่หักสต็อก** — ขาออกอยู่ใน dispense_logs (department = ชื่อ รพ.)
--   ขาเข้าอยู่ใน receive_logs อยู่แล้ว ถ้าหักซ้ำจะนับสองเด้ง

CREATE TABLE IF NOT EXISTS public.drug_loan (
  id            bigserial PRIMARY KEY,
  -- ทิศทาง: borrow = เรายืมเขา (ของเข้า เราต้องคืน) / lend = เราให้เขายืม (ของออก เรารอรับคืน)
  direction     text NOT NULL CHECK (direction IN ('borrow','lend')),
  counterparty  text NOT NULL,              -- คู่สัญญา: รพ./บริษัท อีกฝั่ง
  drug_code     text,
  drug_name     text NOT NULL,
  dosage_form   text,                       -- รูปแบบ (Tablet/Injection/…)
  lot           text DEFAULT '-',
  exp           text,                       -- เก็บตามที่กรอก (ไทยเต็ม/DD/MM/YYYY ปนกันใน CSV ต้นทาง)
  qty           numeric,
  unit          text,
  price_per_unit numeric,
  total_price   numeric,
  loan_date     date,                       -- วันที่ให้ยืม
  loan_doc      text,                       -- เลขที่ใบยืม (เป็นคำอธิบายก็ได้ เช่น "รูปถ่าย" → ใช้เป็น key ไม่ได้)
  loan_company  text,                       -- บริษัทตอนยืม
  return_date   date,                       -- วันที่รับคืน — NULL = ยังค้างคืน
  return_doc    text,
  return_company text,                      -- บริษัทตอนคืน (เปลี่ยนจากตอนยืมได้ พบจริง 3 แถว)
  note          text,
  created_by    text,
  updated_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ค้างคืน = return_date IS NULL → index ให้ query แท็บ "ค้างอยู่" เร็ว
CREATE INDEX IF NOT EXISTS drug_loan_outstanding_idx
  ON public.drug_loan (return_date) WHERE return_date IS NULL;
CREATE INDEX IF NOT EXISTS drug_loan_direction_idx ON public.drug_loan (direction);
CREATE INDEX IF NOT EXISTS drug_loan_code_idx      ON public.drug_loan (drug_code);
CREATE INDEX IF NOT EXISTS drug_loan_loan_date_idx ON public.drug_loan (loan_date DESC);

-- กัน seed ซ้ำ (รันสคริปต์ 2 รอบ) — ไม่ใช้ loan_doc เป็น key เพราะเป็น free-text ซ้ำได้
-- ⚠️ ต้อง COALESCE ทุกคอลัมน์ที่ NULL ได้ รวม loan_date — NULL <> NULL ใน SQL ทำให้
--    unique index ไม่กันแถวที่เว้นวันยืมไว้ (พิสูจน์แล้ว: insert เดิม 2 รอบได้ 2 แถว)
CREATE UNIQUE INDEX IF NOT EXISTS drug_loan_dedupe_key
  ON public.drug_loan (direction, counterparty, COALESCE(drug_code,''), COALESCE(lot,'-'),
                       COALESCE(loan_date, DATE '1900-01-01'), COALESCE(qty,0));

ALTER TABLE public.drug_loan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all drug_loan" ON public.drug_loan;
CREATE POLICY "allow all drug_loan" ON public.drug_loan
  FOR ALL USING (true) WITH CHECK (true);

-- realtime: หน้าค้างคืนอัปเดตข้ามเครื่อง (ลืมเปิด = subscription เงียบไม่ error)
ALTER PUBLICATION supabase_realtime ADD TABLE public.drug_loan;
