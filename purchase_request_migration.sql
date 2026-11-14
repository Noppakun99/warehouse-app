-- purchase_request: รายการแจ้งสั่งซื้อยาจาก "รายงานแจ้งการสั่งซื้อยา" (รายงานการซื้อยา_69.xlsx)
-- (ADR-0030 · docs/features/purchase-request.md · CONTEXT.md §แจ้งซื้อแล้ว)
--
-- Excel เป็นตัวจริง — นำเข้าแบบแทนทั้งชุด (npm run import:purchase) ห้ามแก้ในแอป
-- เก็บเฉพาะ วันที่แจ้ง + สถานะใน Excel + เหตุผล + หมายเหตุ — ไม่เก็บคงเหลือ/ROP/จำนวนแนะนำ (snapshot ขัดกับ ReorderApp)
-- "มาส่งแล้ว/รอกี่วัน" คำนวณสดจาก receive_logs การซื้อ วันรับ ≥ notified_on (purchaseReportSheet.js requestState)
--
-- 1 รหัสมีได้หลายแถว (แจ้งซ้ำหลังของมาแล้วยังต่ำกว่า ROP) — ไม่มี unique key โดยเจตนา

CREATE TABLE IF NOT EXISTS purchase_request (
  id            bigserial PRIMARY KEY,
  code          text NOT NULL,
  name          text,
  unit          text,
  drug_type     text,
  notified_on   date NOT NULL,              -- วันที่แจ้งสั่ง (คอลัมน์ B ชีทหลัก / C ของ Sheet1)
  status        text NOT NULL
                CHECK (status IN ('รอ', 'มาส่งแล้ว', 'ยกเลิก')),  -- ตามช่องติ๊กใน Excel
  reason        text,                       -- เหตุผลที่แจ้ง
  note          text,                       -- หมายเหตุ (แสดงเฉพาะ staff/admin)
  source_sheet  text NOT NULL,              -- 'รายงานซื้อยา' | 'Sheet1'
  source_row    integer NOT NULL,           -- เลขแถวในชีท — ใช้ไล่กลับไป Excel
  imported_at   timestamptz DEFAULT now(),
  imported_by   text
);

CREATE INDEX IF NOT EXISTS idx_purchase_request_code ON purchase_request (code);

-- RLS public (convention เดิม — ADR-0016: แอปอ่าน/เขียนผ่าน anon key)
ALTER TABLE purchase_request ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all" ON purchase_request FOR ALL USING (true) WITH CHECK (true);
