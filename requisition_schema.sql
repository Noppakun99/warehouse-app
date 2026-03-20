-- ============================================================
-- ระบบเบิกยาออนไลน์ - Supabase Schema
-- รันไฟล์นี้ใน Supabase Dashboard > SQL Editor
-- ============================================================

-- ตาราง departments: หน่วยงาน / แผนก
CREATE TABLE IF NOT EXISTS departments (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

-- เพิ่มหน่วยงานตั้งต้น
INSERT INTO departments (name) VALUES
  -- 1. หน่วยงานภายในโรงพยาบาล / จุดบริการยา
  ('ห้องยา G'),
  ('ห้องยา 1'),
  ('ER (ฉุกเฉิน)'),
  ('IPD (ผู้ป่วยใน)'),
  ('OPD (ผู้ป่วยนอก)'),
  ('LR (ห้องคลอด)'),
  ('ทันตกรรม'),
  ('แผนไทย'),
  ('กายภาพ'),
  ('LAB'),
  ('X-ray'),
  ('ห้องทำแผล'),
  ('งานส่งต่อ'),
  ('บริหารทั่วไป'),
  ('พ.ข.ร (พนักงานขับรถ)'),
  ('กลุ่มงานจิตเวชและยาเสพติด'),
  ('IPD-หน่วยวัง'),
  ('IPD-โดม'),
  -- 2. หน่วยงานภายนอกและศูนย์บริการสาธารณสุข
  ('รพสต.คูคต'),
  ('รพสต.วัดประยูร'),
  ('ศูนย์บริการสาธารณสุข 2 (ชุมชนรัตนโกสินทร์)'),
  ('ศูนย์บริการสาธารณสุข 3 (เทพธัญญะอุปถัมภ์)'),
  ('ศูนย์บริการสาธารณสุข 4 (สิริเวชชะพันธ์อุปถัมภ์)'),
  ('เทศบาลนครรังสิต'),
  -- 3. การส่งต่อระหว่างโรงพยาบาล
  ('รพ.สามโคก'),
  ('รพ.เปาโล'),
  ('รพ.ปทุมเวศ'),
  ('รพ.ลาดหลุมแก้ว'),
  -- 4. รายการเบิกกรณีพิเศษ (ทางบัญชี)
  ('เบิกเพิ่มจากความผิดพลาด'),
  ('เบิกยาหมดอายุจากคลัง')
ON CONFLICT (name) DO NOTHING;

-- ตาราง requisitions: ใบเบิกยา
CREATE TABLE IF NOT EXISTS requisitions (
  id             BIGSERIAL PRIMARY KEY,
  req_number     TEXT UNIQUE NOT NULL,         -- REQ-YYYYMMDD-XXXX
  department     TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  status         TEXT DEFAULT 'pending',        -- pending | approved | partial | rejected | dispensed
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_req_department  ON requisitions(department);
CREATE INDEX IF NOT EXISTS idx_req_status      ON requisitions(status);
CREATE INDEX IF NOT EXISTS idx_req_created_at  ON requisitions(created_at DESC);

-- ตาราง requisition_items: รายการยาในแต่ละใบเบิก
CREATE TABLE IF NOT EXISTS requisition_items (
  id               BIGSERIAL PRIMARY KEY,
  requisition_id   BIGINT NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  drug_code        TEXT DEFAULT '-',
  drug_name        TEXT NOT NULL,
  drug_unit        TEXT DEFAULT '-',
  requested_qty    INTEGER NOT NULL DEFAULT 1,
  approved_qty     INTEGER,                     -- NULL = ยังไม่ได้อนุมัติ
  note             TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_req_items_req_id ON requisition_items(requisition_id);

-- เปิด Row Level Security
ALTER TABLE departments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisition_items  ENABLE ROW LEVEL SECURITY;

-- Policy: อนุญาตทุกคน (internal app)
DROP POLICY IF EXISTS "Allow public all" ON departments;
DROP POLICY IF EXISTS "Allow public all" ON requisitions;
DROP POLICY IF EXISTS "Allow public all" ON requisition_items;

CREATE POLICY "Allow public all" ON departments       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all" ON requisitions      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all" ON requisition_items FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- ตาราง dispense_logs: บันทึกการเบิกจ่ายรายรายการ
-- (รองรับทั้ง import CSV เดิม และบันทึกจากระบบเบิกออนไลน์)
-- ============================================================
CREATE TABLE IF NOT EXISTS dispense_logs (
  id                  BIGSERIAL PRIMARY KEY,

  -- Transaction info
  dispense_date       DATE NOT NULL,           -- วันที่เบิก
  main_log            TEXT DEFAULT '-',        -- MainLog (เช่น 'E', 'D')
  detail_log          TEXT DEFAULT '-',        -- DetailedLog / กลุ่มบันทึก
  department          TEXT NOT NULL,           -- หน่วยงานที่เบิก
  note                TEXT,                    -- หมายเหตุ

  -- Item info
  drug_code           TEXT DEFAULT '-',        -- รหัส
  drug_name           TEXT NOT NULL,           -- รายการยา
  drug_type           TEXT DEFAULT '-',        -- ชนิด (Tablet, Syrup ...)
  drug_unit           TEXT DEFAULT '-',        -- หน่วย
  price_per_unit      NUMERIC(12,4),           -- ราคา/หน่วย

  -- Quality control
  lot                 TEXT DEFAULT '-',        -- Lot.
  exp                 TEXT DEFAULT '-',        -- Exp.

  -- Quantity tracking
  qty_before          NUMERIC(12,2),           -- คงเหลือก่อนเบิก
  qty_out             NUMERIC(12,2) NOT NULL,  -- ปริมาณ (ออก)
  qty_after           NUMERIC(12,2),           -- คงเหลือหลังจ่าย

  -- Link back to online requisition (optional)
  requisition_id      BIGINT REFERENCES requisitions(id) ON DELETE SET NULL,
  requisition_number  TEXT,

  -- Source
  source              TEXT DEFAULT 'csv',      -- 'csv' | 'online'
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_displog_date      ON dispense_logs(dispense_date DESC);
CREATE INDEX IF NOT EXISTS idx_displog_dept      ON dispense_logs(department);
CREATE INDEX IF NOT EXISTS idx_displog_code      ON dispense_logs(drug_code);
CREATE INDEX IF NOT EXISTS idx_displog_req_id    ON dispense_logs(requisition_id);

ALTER TABLE dispense_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all" ON dispense_logs;
CREATE POLICY "Allow public all" ON dispense_logs FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- ตาราง receive_logs: บันทึกการรับเข้าคลัง (คลังรับ)
-- ============================================================
CREATE TABLE IF NOT EXISTS receive_logs (
  id                    BIGSERIAL PRIMARY KEY,

  -- Ordering & process dates
  order_date            DATE,                        -- วันที่แจ้งสั่ง
  receive_date          DATE,                        -- วันที่รับ
  inspect_date          DATE,                        -- วันที่ตรวจรับ
  leadtime              TEXT,                        -- Leadtime (วัน)
  inspect_lag           TEXT,                        -- วันที่ตรวจรับ - วันที่รับของ

  -- Purchase document
  bill_number           TEXT DEFAULT '-',            -- เลขที่บิลซื้อ
  po_number             TEXT DEFAULT '-',            -- เลขที่ PO
  purchase_type         TEXT DEFAULT '-',            -- สถานะการซื้อ (ซื้อ/ยืม)
  receive_status        TEXT DEFAULT '-',            -- สถานะตรวจรับ

  -- Item info
  drug_code             TEXT DEFAULT '-',            -- รหัส
  drug_name             TEXT NOT NULL,               -- รายการยา
  drug_type             TEXT DEFAULT '-',            -- รูปแบบ (Tablet, Injection...)

  -- Supplier
  supplier_current      TEXT DEFAULT '-',            -- บริษัทปัจจุบัน
  supplier_prev         TEXT DEFAULT '-',            -- บริษัทก่อนหน้า
  supplier_changed      TEXT DEFAULT '-',            -- เปลี่ยนบริษัท (Y/N)

  -- Quality control
  lot                   TEXT DEFAULT '-',            -- Lot.
  exp                   TEXT DEFAULT '-',            -- Exp.
  exp_note              TEXT,                        -- หมายเหตุหมดอายุ

  -- Quantity & financials
  qty_received          NUMERIC(12,2),               -- จำนวนที่รับ
  unit_per_bill         TEXT DEFAULT '-',            -- หน่วย/บิล
  price_per_unit        NUMERIC(12,4),               -- ราคาต่อหน่วย (บาท)
  total_price_vat       NUMERIC(14,2),               -- ราคารวมภาษี (บาท)
  total_price_formula   TEXT,                        -- ราคารวมภาษี/สูตร

  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reclog_receive_date ON receive_logs(receive_date DESC);
CREATE INDEX IF NOT EXISTS idx_reclog_code         ON receive_logs(drug_code);
CREATE INDEX IF NOT EXISTS idx_reclog_bill         ON receive_logs(bill_number);
CREATE INDEX IF NOT EXISTS idx_reclog_supplier     ON receive_logs(supplier_current);

ALTER TABLE receive_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all" ON receive_logs;
CREATE POLICY "Allow public all" ON receive_logs FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- เปิด Realtime สำหรับ requisitions (ใช้ใน Supabase Realtime)
-- ไปที่ Supabase Dashboard > Database > Replication
-- แล้วเปิด "realtime" สำหรับตาราง requisitions และ requisition_items
-- ============================================================

-- ============================================================
-- วิธีใช้:
-- 1. เปิด Supabase Dashboard > SQL Editor
-- 2. วางโค้ดนี้แล้วกด Run
-- 3. เปิด Realtime ใน Database > Replication สำหรับตาราง requisitions
-- ============================================================
