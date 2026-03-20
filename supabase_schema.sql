-- ============================================================
-- Pharmacy Warehouse - Supabase Schema
-- รันไฟล์นี้ใน Supabase Dashboard > SQL Editor
-- ============================================================

-- ตาราง inventory: เก็บข้อมูลยาในคลังแยกตามตำแหน่ง
CREATE TABLE IF NOT EXISTS inventory (
  id            BIGSERIAL PRIMARY KEY,
  location      TEXT NOT NULL,
  code          TEXT DEFAULT '-',
  name          TEXT NOT NULL,
  type          TEXT DEFAULT '-',
  unit          TEXT DEFAULT '-',
  lot           TEXT DEFAULT '-',
  exp           TEXT DEFAULT '-',
  qty           TEXT DEFAULT '0',
  invoice       TEXT DEFAULT '-',
  receive_status TEXT DEFAULT 'ไม่มีการดำเนินการ',
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location);
CREATE INDEX IF NOT EXISTS idx_inventory_code ON inventory(code);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);

-- ตาราง drug_details: เก็บ Master Data ยา (จาก CSV บิล/ตรวจรับ)
CREATE TABLE IF NOT EXISTS drug_details (
  id          BIGSERIAL PRIMARY KEY,
  detail_key  TEXT UNIQUE NOT NULL,  -- "code|lot|invoice"
  code        TEXT,
  name        TEXT,
  lot         TEXT,
  invoice     TEXT,
  data        JSONB DEFAULT '{}',    -- fields อื่นๆ จาก CSV (ยืดหยุ่นตามหัวคอลัมน์)
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drug_details_code ON drug_details(code);

-- ตาราง upload_meta: เก็บ metadata การ upload ล่าสุด
CREATE TABLE IF NOT EXISTS upload_meta (
  id          SERIAL PRIMARY KEY,
  type        TEXT UNIQUE NOT NULL,  -- 'inventory' หรือ 'drug_details'
  file_name   TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- เปิด Row Level Security (RLS)
ALTER TABLE inventory   ENABLE ROW LEVEL SECURITY;
ALTER TABLE drug_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_meta  ENABLE ROW LEVEL SECURITY;

-- Policy: อนุญาตให้ทุกคน read/write ได้ (เหมาะกับ internal app)
-- หากต้องการจำกัดสิทธิ์ในอนาคต สามารถแก้ policy ได้
DROP POLICY IF EXISTS "Allow public all" ON inventory;
DROP POLICY IF EXISTS "Allow public all" ON drug_details;
DROP POLICY IF EXISTS "Allow public all" ON upload_meta;

CREATE POLICY "Allow public all" ON inventory   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all" ON drug_details FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all" ON upload_meta  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- วิธีใช้:
-- 1. เปิด Supabase Dashboard > SQL Editor
-- 2. วางโค้ดนี้แล้วกด Run
-- 3. ตารางจะถูกสร้างพร้อมใช้งาน
-- ============================================================
