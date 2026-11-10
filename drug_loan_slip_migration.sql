-- drug_loan_slip: ใบแจ้งยืม / ใบแจ้งรับคืน ยาระหว่างหน่วยงาน ที่เจ้าหน้าที่คลังออกจากแอป
-- (docs/features/loan-slip.md · CONTEXT.md §ใบแจ้งยืม/ใบแจ้งรับคืน)
--
-- Excel ทะเบียน `รพ.ยืมยา` ยังเป็นตัวจริง (ADR-0027) — แถวนี้คือ "ใบที่รอลงทะเบียน"
--   แอปไม่เขียน drug_loan ตรง: import:loan จาก Excel ลบ/ทับแถวที่ไฟล์ไม่มีแบบเงียบ
--   (เหตุการณ์ 10/11/2569 ปุ่ม "บันทึกรับคืน" เดิมเขียน return_date ตรง → ไม่ได้ฟอร์ม/ใบ และ Excel ไม่รู้)
-- 1 แถว = 1 ใบ · job = ข้อมูลใบรูปแบบเดียวกับ scripts/loan-slip.mjs (แอปพิมพ์ + สคริปต์ทำ PDF จากชุดเดียวกัน)
-- status: pending (รอลง Excel) → applied (นำเข้าทะเบียนแล้วตรงใบ) / conflict (ทะเบียนไม่ตรงใบ) / cancelled

CREATE TABLE IF NOT EXISTS drug_loan_slip (
  id            bigserial PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('out', 'return')),       -- out = ใบแจ้งยืม · return = ใบแจ้งรับคืน
  direction     text NOT NULL CHECK (direction IN ('borrow', 'lend')), -- ทิศของการยืมเดิม (ชุดเดียวกับ drug_loan)
  counterparty  text NOT NULL,
  ln            text,                       -- out: เลขที่ใบยืมที่แอปออก · return: เลขใบยืมที่อ้างถึง (ไม่มี = ใบของคู่ยืม)
  slip_date     date,                       -- วันที่ยืม/วันที่คืนบนใบ (ว่าง = เขียนมือ)
  job           jsonb NOT NULL,             -- ข้อมูลใบเต็ม (items · เหตุผล · กำหนดคืน · ผู้คืน …)
  loan_ids      bigint[],                   -- return: drug_loan.id ที่ใบนี้คืน · out: เติมตอน applied
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'applied', 'conflict', 'cancelled')),
  note          text,                       -- เหตุผล conflict / ยกเลิก
  created_by    text,
  created_at    timestamptz DEFAULT now(),
  resolved_at   timestamptz
);

-- เลข LN ห้ามซ้ำ (2 เครื่องกดบันทึกพร้อมกัน → ตัวหลังชน 23505 แอปออกเลขใหม่) · ใบยกเลิกคืนเลขไม่ได้ (CONTEXT: LN ที่ยกเลิกไม่นำกลับมาใช้)
CREATE UNIQUE INDEX IF NOT EXISTS uq_drug_loan_slip_ln
  ON drug_loan_slip (ln) WHERE kind = 'out' AND ln IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drug_loan_slip_status ON drug_loan_slip (status);

-- RLS public (convention เดิม — ADR-0016: ข้อมูลไม่อ่อนไหวกว่า drug_loan ที่เปิดอยู่แล้ว)
ALTER TABLE drug_loan_slip ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all" ON drug_loan_slip;
CREATE POLICY "Allow public all" ON drug_loan_slip FOR ALL USING (true) WITH CHECK (true);
