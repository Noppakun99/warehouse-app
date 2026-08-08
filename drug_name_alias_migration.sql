-- drug_name_alias: จดจำการจับคู่ "ชื่อยาบนบิล (จากสแกน AI)" → drug_code ในระบบ
-- รันใน Supabase Dashboard → SQL Editor ก่อน deploy code
--
-- ปัญหาที่แก้: ชื่อยาบนบิล (ชื่อการค้า/แพ็ค) ≠ ชื่อในระบบ (generic จาก HosXP)
--   → auto-map exact/fuzzy ไม่แม่นพอ (exact 0%, fuzzy ~35%)
--   → ครั้งแรกคนคลังจับคู่เอง บันทึกไว้ที่นี่ → ครั้งหน้าชื่อเป๊ะเดิม auto ทันที
--
-- alias_name = ชื่อยาบนบิลตาม AI อ่าน (normalize: lower + trim ก่อนเก็บ/ค้น)

CREATE TABLE IF NOT EXISTS drug_name_alias (
  alias_name text PRIMARY KEY,            -- ชื่อยาบนบิล (normalized lower+trim)
  drug_code  text NOT NULL,               -- รหัสยาในระบบที่จับคู่
  drug_name  text,                        -- ชื่อ generic ในระบบ (inventory.name) — เก็บไว้อ้างอิง/แสดง
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ค้น code จากชื่อ alias เป็น operation หลัก — PK ครอบให้แล้ว
-- index เสริมไว้ค้นย้อนกลับ (code → aliases) เผื่อ debug/รวมชื่อ
CREATE INDEX IF NOT EXISTS idx_drug_name_alias_code ON drug_name_alias (drug_code);

-- RLS public (ตรงกับ convention ตารางอื่นในระบบ เช่น stock_ledger) — anon key เข้าถึงได้
ALTER TABLE drug_name_alias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all" ON drug_name_alias FOR ALL USING (true) WITH CHECK (true);
