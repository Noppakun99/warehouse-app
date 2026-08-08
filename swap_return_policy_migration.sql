-- swap_return_policy — นโยบายเปลี่ยน/คืนยาก่อนพ้นเงื่อนไขบริษัท (เฟส 1)
-- ผูกระดับบริษัท (company = receive_logs.supplier_current)
-- ต้องรันใน Supabase Dashboard ก่อน deploy (ดู CLAUDE.md §PR convention)
--
-- เฟส 1 เก็บแค่ เดือน + คืนเต็ม/ไม่คืน (ยังไม่ทำ tier % 100/50/25)
-- seed ด้วย seedSwapPolicies() ใน db.js (derive จาก receive_logs.drug_swap_policy ผ่าน parseReturnPolicy)

CREATE TABLE IF NOT EXISTS public.swap_return_policy (
  company         text PRIMARY KEY,                 -- บริษัท (= supplier_current)
  return_months   numeric,                          -- ต้องคืนภายใน N เดือนก่อนหมดอายุ (NULL = ไม่รู้/คืนไม่ได้)
  can_return      boolean,                          -- true=คืนได้ | false=บริษัทไม่รับคืน | NULL=ต้องเช็กเอกสาร
  differs_by_item boolean NOT NULL DEFAULT false,   -- flag "เงื่อนไขแตกต่างกัน แล้วแต่รายการ"
  raw_note        text,                             -- ข้อความนโยบายดิบ (ให้คนอ่าน/tier % เฟสหน้า)
  source          text NOT NULL DEFAULT 'auto',     -- 'auto'=regex เดา | 'manual'=admin ยืนยัน
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      text
);

ALTER TABLE public.swap_return_policy ENABLE ROW LEVEL SECURITY;

-- policy: อ่าน/เขียนได้ด้วย anon key (ตรงกับ convention ตารางอื่น: "Allow public all")
DROP POLICY IF EXISTS "Allow public all" ON public.swap_return_policy;
CREATE POLICY "Allow public all" ON public.swap_return_policy
  FOR ALL USING (true) WITH CHECK (true);
