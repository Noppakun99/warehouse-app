-- ============================================================
-- Stock Count — ตรวจนับคงคลัง (spot check / cycle count)
-- รันไฟล์นี้ใน Supabase Dashboard > SQL Editor ก่อน deploy
-- อ้างอิง: docs/adr/0008-stock-count-append-only-snapshot.md
-- ============================================================
-- append-only: บันทึก discrepancy เท่านั้น ไม่แก้ inventory.qty
-- snapshot ค่าระบบเป็น value copy (ไม่ FK inventory.id — id หายทุก CSV import)

-- header: 1 รอบตรวจนับ
CREATE TABLE IF NOT EXISTS stock_count_session (
  id           BIGSERIAL PRIMARY KEY,
  counted_at   DATE NOT NULL DEFAULT CURRENT_DATE,   -- วันที่ตรวจนับ
  counter_name TEXT NOT NULL DEFAULT '-',            -- หัวหน้า/ผู้นับ (จาก auth)
  note         TEXT DEFAULT '',                      -- หมายเหตุรอบนี้
  status       TEXT NOT NULL DEFAULT 'done',         -- 'draft' | 'done'
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- lines: 1 บรรทัด = 1 (code+lot) ที่นับ (รวมทุก inventory row ของ lot นั้น)
CREATE TABLE IF NOT EXISTS stock_count_item (
  id                BIGSERIAL PRIMARY KEY,
  session_id        BIGINT NOT NULL REFERENCES stock_count_session(id) ON DELETE CASCADE,

  -- identity ของบรรทัดนับ
  code              TEXT NOT NULL DEFAULT '-',
  name              TEXT DEFAULT '-',
  lot               TEXT NOT NULL DEFAULT '-',
  unit              TEXT DEFAULT '-',

  -- snapshot ค่าระบบ ณ วันนับ (value copy — ห้าม FK inventory.id)
  system_qty        NUMERIC DEFAULT 0,               -- Σ qty ของทุกแถว (code+lot) หน่วยซื้อ/กล่อง
  system_exp        TEXT DEFAULT '-',
  system_location   TEXT DEFAULT '-',

  -- ค่าที่นับ/เจอจริง
  counted_qty       NUMERIC,                          -- null = ยังไม่กรอก
  counted_exp       TEXT DEFAULT '',
  counted_location  TEXT DEFAULT '',

  -- ผลเทียบ
  diff_qty          NUMERIC DEFAULT 0,                -- system_qty − counted_qty
  match             BOOLEAN DEFAULT FALSE,            -- ตรงครบ 3 มิติ (qty+location+exp)

  item_note         TEXT DEFAULT '',                  -- หมายเหตุรายการยานี้ (เช่น พบชำรุด/ตำแหน่งจริง)

  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- migration (ตารางมีอยู่แล้ว): เพิ่มหมายเหตุรายรายการ
ALTER TABLE stock_count_item ADD COLUMN IF NOT EXISTS item_note TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_stock_count_item_session ON stock_count_item(session_id);
CREATE INDEX IF NOT EXISTS idx_stock_count_item_code    ON stock_count_item(code);
CREATE INDEX IF NOT EXISTS idx_stock_count_session_date ON stock_count_session(counted_at);

-- RLS — public read/write (internal app) ตาม pattern เดิม
ALTER TABLE stock_count_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_count_item    ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all" ON stock_count_session;
DROP POLICY IF EXISTS "Allow public all" ON stock_count_item;
CREATE POLICY "Allow public all" ON stock_count_session FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all" ON stock_count_item    FOR ALL USING (true) WITH CHECK (true);
