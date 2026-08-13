-- swap_return_action_migration.sql — สถานะ "ดำเนินการ" ของยาที่ต้องเปลี่ยน/คืนบริษัท
--
-- ทำไมต้องมีตารางแยก (ไม่เก็บใน inventory):
--   `inventory` ถูก **replace ทั้งตาราง** ทุกครั้งที่ import CSV คลังยา (saveInventory)
--   ถ้าเก็บสถานะไว้ในนั้น งานที่คลังคีย์ไว้จะหายทุกรอบอัปโหลด
--
-- identity = (drug_code, lot, company) ไม่ใช่ inventory.id เพราะ
--   inventory มีแถวซ้ำ code+lot ได้จริง (CSV แยกแถว) — ผูกกับ row id จะได้สถานะ
--   กระจัดกระจายคนละแถวทั้งที่เป็นยา lot เดียวกัน (ดู Critical Rule §ห้าม dedupe inventory)
--
-- ⚠️ ต้องรันใน Supabase Dashboard ก่อน deploy

CREATE TABLE IF NOT EXISTS public.swap_return_action (
  id          bigserial PRIMARY KEY,
  drug_code   text NOT NULL,
  lot         text NOT NULL DEFAULT '-',
  company     text NOT NULL DEFAULT '',
  drug_name   text,
  -- 5 สถานะ: pending(ยังไม่ทำ) / notified(แจ้งบริษัทแล้ว) / sent(ส่งคืนแล้ว) / accepted(บริษัทรับแล้ว) / no_return(ไม่คืน)
  status      text NOT NULL DEFAULT 'pending',
  action_date date,          -- วันที่ผู้ใช้ระบุว่าดำเนินการ (คนเลือกเอง ไม่ใช่ timestamp ระบบ)
  note        text,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 1 คู่ยา+lot+บริษัท = 1 สถานะ (upsert ทับได้)
CREATE UNIQUE INDEX IF NOT EXISTS swap_return_action_key
  ON public.swap_return_action (drug_code, lot, company);

CREATE INDEX IF NOT EXISTS swap_return_action_status_idx
  ON public.swap_return_action (status);

ALTER TABLE public.swap_return_action ENABLE ROW LEVEL SECURITY;

-- ล้อ policy ของตารางอื่นในระบบ (แอปใช้ anon key ตัวเดียว auth ทำที่ app layer)
DROP POLICY IF EXISTS "allow all swap_return_action" ON public.swap_return_action;
CREATE POLICY "allow all swap_return_action" ON public.swap_return_action
  FOR ALL USING (true) WITH CHECK (true);

-- realtime: ให้ badge/popup อัปเดตข้ามเครื่องเมื่อมีคนเปลี่ยนสถานะ
-- (ลืมเปิดแล้ว subscription จะเงียบโดยไม่ error — ดู Do-Not rule §realtime replication)
ALTER PUBLICATION supabase_realtime ADD TABLE public.swap_return_action;
