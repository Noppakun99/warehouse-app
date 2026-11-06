-- formulary_change: ทะเบียนมติ PTC เพิ่ม/ตัดรายการยาออกจากบัญชียา รพ.
-- (CONTEXT.md §ยาเข้าใหม่ / §ยาตัดออกจากบัญชี · คิวงานหน้าหลัก "ยาเข้าใหม่ / ตัดออก")
--
-- ธงตัดออกตัวจริงยังอยู่ที่ Master คอลัมน์ A (→ inventory.receive_status) — ตารางนี้เก็บ "มติ" ที่ธงอ้างถึง
-- ยาเข้าตามมติที่ยังไม่มีรหัสในคลัง (เช่น Levetiracetam ที่ยังรอ PO) → drug_code = null แล้วเติมภายหลัง
-- ไม่มีข้อมูลบุคคล — anon key เข้าถึงได้เต็มสิทธิ์ตาม ADR-0016

CREATE TABLE IF NOT EXISTS formulary_change (
  id           bigserial PRIMARY KEY,
  change_type  text NOT NULL CHECK (change_type IN ('in', 'out')),   -- in = เข้าบัญชี · out = ตัดออก
  drug_code    text,                      -- null = ยังไม่มีรหัสในคลัง
  drug_name    text NOT NULL,             -- ชื่อตามเอกสารมติ
  ptc_date     date NOT NULL,             -- วันที่ประชุม PTC
  ptc_ref      text,                      -- ครั้งที่/เลขที่เอกสาร
  note         text,
  created_by   text,
  created_at   timestamptz DEFAULT now(),
  updated_by   text,
  updated_at   timestamptz
);

-- กันกรอกมติเดียวกันซ้ำ (รหัสว่าง = เทียบด้วยชื่อ)
CREATE UNIQUE INDEX IF NOT EXISTS uq_formulary_change
  ON formulary_change (change_type, ptc_date, COALESCE(drug_code, ''), drug_name);
CREATE INDEX IF NOT EXISTS idx_formulary_change_code ON formulary_change (drug_code);

-- RLS public (convention เดิม — ADR-0016)
ALTER TABLE formulary_change ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all" ON formulary_change FOR ALL USING (true) WITH CHECK (true);

-- seed: มติ PTC 9/10/2569 (รูป Desktop\ยอดคงคลัง\ยาเข้า-ยาออก-บัญชีรพ\สรุปรายการยาเข้า_ออกจากบัญชี ปี 2570 (PTC 9.10.69).jpg)
INSERT INTO formulary_change (change_type, drug_code, drug_name, ptc_date, ptc_ref, note, created_by) VALUES
  ('in',  NULL,      'Levetiracetam inj 500mg',               '2026-10-09', 'PTC 9/10/2569', 'ยังไม่มีรหัส · PO 123 รอจัดทำ', 'ระบบ (seed)'),
  ('in',  NULL,      'Levetiracetam tab 500mg',               '2026-10-09', 'PTC 9/10/2569', 'ยังไม่มีรหัส · PO 125 รอจัดทำ', 'ระบบ (seed)'),
  ('in',  NULL,      'Vancomycin inj 500mg',                  '2026-10-09', 'PTC 9/10/2569', 'ยังไม่มีรหัส · ยังไม่ได้เช็ค PO', 'ระบบ (seed)'),
  ('in',  '1480010', 'Fentanyl inj 50mcg/ml',                 '2026-10-09', 'PTC 9/10/2569', NULL, 'ระบบ (seed)'),
  ('in',  '86',      'Phenytoin 50mg Infatab',                '2026-10-09', 'PTC 9/10/2569', 'ใช้รหัสเดิม 86 · ยังไม่รู้รหัส HosXP', 'ระบบ (seed)'),
  ('in',  '1690077', 'Haloperidol 0.5mg',                     '2026-10-09', 'PTC 9/10/2569', NULL, 'ระบบ (seed)'),
  ('in',  '1690079', 'Haloperidol oral solution 2mg/ml 15ml', '2026-10-09', 'PTC 9/10/2569', NULL, 'ระบบ (seed)'),
  ('out', '1660045', 'Bisoprolol 2.5mg',                      '2026-10-09', 'PTC 9/10/2569', NULL, 'ระบบ (seed)'),
  ('out', '1660022', 'Carvedilol 6.25mg',                     '2026-10-09', 'PTC 9/10/2569', NULL, 'ระบบ (seed)'),
  ('out', '1460144', 'Diltiazem 30mg',                        '2026-10-09', 'PTC 9/10/2569', NULL, 'ระบบ (seed)'),
  ('out', '1660111', 'Cefdinir 125mg/5ml 30ml',               '2026-10-09', 'PTC 9/10/2569', NULL, 'ระบบ (seed)'),
  ('out', '1000065', 'Chloroquine phosphate 250mg',           '2026-10-09', 'PTC 9/10/2569', NULL, 'ระบบ (seed)'),
  ('out', '1000164', 'Ketoconazole 200mg',                    '2026-10-09', 'PTC 9/10/2569', NULL, 'ระบบ (seed)'),
  ('out', '1460058', 'Levonorgestrel 1.5mg',                  '2026-10-09', 'PTC 9/10/2569', NULL, 'ระบบ (seed)'),
  ('out', '1670081', 'Quetiapine 200mg',                      '2026-10-09', 'PTC 9/10/2569', NULL, 'ระบบ (seed)'),
  ('out', '1670077', 'Lamotrigine 50mg',                      '2026-10-09', 'PTC 9/10/2569', NULL, 'ระบบ (seed)'),
  ('out', '1000146', 'Haloperidol 5mg',                       '2026-10-09', 'PTC 9/10/2569', NULL, 'ระบบ (seed)')
ON CONFLICT DO NOTHING;
