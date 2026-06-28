-- ============================================================
-- Monthly Stock Ledger — ทะเบียนคงคลังรายเดือน
-- รันไฟล์นี้ใน Supabase Dashboard > SQL Editor
-- อ้างอิง: docs/adr/0007-monthly-stock-ledger.md
-- ============================================================

-- 1 แถว = หนึ่งแถวบัญชี (รหัส + lot + ชนิดรายการ + ราคา) ต่อหนึ่งงวดเดือน
-- เดือน open = derive สด (closing = opening + in − out + adjust)
-- เดือน closed = freeze เป็น static value (เลขไม่ขยับแม้แก้ข้อมูลดิบย้อนหลัง)
CREATE TABLE IF NOT EXISTS stock_ledger (
  id              BIGSERIAL PRIMARY KEY,

  -- งวดบัญชี
  period          TEXT NOT NULL,                         -- 'YYYY-MM' เช่น '2026-06'
  status          TEXT NOT NULL DEFAULT 'open',          -- 'open' | 'closed'

  -- identity ของแถวบัญชี (= cost layer key) — ห้ามรวม qty ข้ามราคา
  drug_code       TEXT NOT NULL DEFAULT '-',
  lot             TEXT NOT NULL DEFAULT '-',
  item_type       TEXT NOT NULL DEFAULT 'ยกยอด',         -- ชนิดรายการ: ยกยอด/ซื้อยา/บริจาค/สนับสนุน/บันทึกเท่านั้น/แก้ไขระบบ
  price_per_unit  NUMERIC(14,4) NOT NULL DEFAULT 0,       -- 4 ตำแหน่งตรง Excel — เป็นส่วนหนึ่งของ key (แยก cost layer) ต้อง round 4dp ตอน seed/insert

  -- descriptive (snapshot ณ งวดนั้น)
  drug_name       TEXT DEFAULT '-',
  drug_type       TEXT DEFAULT '-',                      -- รูปแบบยา Tablet/Syrup/Injection
  unit            TEXT DEFAULT '-',
  med_category    TEXT DEFAULT 'เวชภัณฑ์ยา',             -- 'เวชภัณฑ์ยา' | 'เวชภัณฑ์มิใช่ยา'
  company         TEXT DEFAULT '-',

  -- บัญชีจำนวน (closing = opening + in − out + adjust)
  opening_qty     NUMERIC DEFAULT 0,                     -- S (= U เดือนก่อน)
  in_qty          NUMERIC DEFAULT 0,                     -- P (ปริมาณรับเข้า)
  out_qty         NUMERIC DEFAULT 0,                     -- T (ปริมาณเบิกรวม)
  adjust_qty      NUMERIC DEFAULT 0,                     -- ปรับจากแถวแก้ไขระบบ
  closing_qty     NUMERIC DEFAULT 0,                     -- U

  -- บัญชีมูลค่า (AB = AC + AA − Z + Y)
  carry_in_value  NUMERIC DEFAULT 0,                     -- AC (= AB เดือนก่อน)
  in_value        NUMERIC DEFAULT 0,                     -- AA (มูลค่าซื้อ)
  out_value       NUMERIC DEFAULT 0,                     -- Z  (มูลค่าเบิก)
  adjust_value    NUMERIC DEFAULT 0,                     -- Y  (มูลค่าปรับแก้ระบบ)
  closing_value   NUMERIC DEFAULT 0,                     -- AB (มูลค่าคงคลัง)

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- หนึ่งแถวบัญชีต่อหนึ่งงวด — กัน ledger row ซ้ำ (key รวมราคาเพื่อแยก cost layer)
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_ledger_row
  ON stock_ledger(period, drug_code, lot, item_type, price_per_unit);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_period ON stock_ledger(period);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_code   ON stock_ledger(drug_code);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_status ON stock_ledger(status);

-- RLS — public read/write (internal app) ตาม pattern เดิม
ALTER TABLE stock_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all" ON stock_ledger;
CREATE POLICY "Allow public all" ON stock_ledger FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- หมายเหตุการ deploy:
-- 1. รัน migration นี้ก่อน
-- 2. seed งวดตั้งต้นจาก Excel master sheet เดือนล่าสุด (ดู ADR-0007 ข้อ 5)
--    — opening_qty/carry_in_value มาจาก master col N/AC (paste-as-value แล้ว)
-- 3. tie-out ยอดรวม closing_value แยก ยา/มิใช่ยา ให้ตรงไฟล์ส่งบัญชี ก่อนใช้จริง
-- ============================================================
