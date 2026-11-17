-- ============================================================
-- รายงาน 5 แฟ้ม DMSIC (แฟ้ม 4 DISTRIBUTION · 5 INVENTORY) — ADR-0031
-- รันใน Supabase Dashboard > SQL Editor (รันซ้ำได้ — IF NOT EXISTS ทุกคำสั่ง)
-- ============================================================

-- 1) stock_ledger: ฟิลด์ที่แฟ้ม 5 บังคับ (มาจากชีท Master_<เดือน>)
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS exp       TEXT;     -- วันหมดอายุ ISO 'YYYY-MM-DD' · NULL = ไม่มีใน Excel (ต้องเติมก่อนออกรายงาน)
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS pack_size NUMERIC;  -- Master AQ packsize (100เม็ด → 100)
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS sub_unit  TEXT;     -- Master AR หน่วยย่อย (เม็ด · ขวด · amp)

-- 2) TPU ของยา — ผูก รหัส + บริษัท (CONTEXT §TPU ของยา) · บริษัทใหม่ = แถวใหม่
CREATE TABLE IF NOT EXISTS drug_tpu_map (
  id          BIGSERIAL PRIMARY KEY,
  drug_code   TEXT NOT NULL,
  company     TEXT NOT NULL,              -- ชื่อบริษัทตาม Master คอลัมน์ Q (ตัดช่องว่างซ้ำแล้ว)
  tpu_code    TEXT NOT NULL,              -- TMTID ชั้น TPU · ยาสมุนไพร TTMTID · '99' = ค้นทุกแหล่งแล้วไม่พบ
  trade_name  TEXT,                       -- ชื่อการค้า (ตัวยา ความแรง) รูปแบบ — NULL = ใช้ชื่อยา Master
  base_unit   TEXT,                       -- คำหน่วย DispUnit ของ TMT (tablet · capsule · vial …) — NULL = เทียบจากหน่วยย่อย
  source      TEXT,                       -- ที่มา: TPU_GPUID.xlsx · ทำเอง_4.xlsx · บิล <เลขบิล> · TMT
  note        TEXT,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_drug_tpu_map ON drug_tpu_map(drug_code, company);

-- 3) เลขผู้เสียภาษีผู้จัดจำหน่าย — 1 บริษัท = 1 เลข (CONTEXT §เลขผู้เสียภาษีผู้จัดจำหน่าย)
CREATE TABLE IF NOT EXISTS vendor_tax_id (
  company     TEXT PRIMARY KEY,           -- ชื่อบริษัทตาม Master คอลัมน์ Q
  tax_id      TEXT NOT NULL,              -- 13 หลัก · รับจากหน่วยบริการ = รหัส 9 หลัก
  source      TEXT,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS — public read/write (internal app) ตาม pattern เดิม (ADR-0016)
ALTER TABLE drug_tpu_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all" ON drug_tpu_map;
CREATE POLICY "Allow public all" ON drug_tpu_map FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE vendor_tax_id ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all" ON vendor_tax_id;
CREATE POLICY "Allow public all" ON vendor_tax_id FOR ALL USING (true) WITH CHECK (true);
