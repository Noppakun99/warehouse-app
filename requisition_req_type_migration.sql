-- ============================================================
-- requisition_req_type_migration.sql  (เบิกยาออนไลน์ เฟส 1 · 13/11/2569)
-- ประเภทใบเบิกออนไลน์ — 1 ใบมีประเภทเดียว (CONTEXT §ใบเบิกออนไลน์)
--
-- req_type: 'saline' = น้ำเกลือ · 'supply' = ถุง/ขวด/ตลับ · 'drug' = ยา
--           key ชุดเดียวกับ FORMS ใน src/lib/printedReqForm.js · NULL = ใบก่อนมีประเภท
--           ประเภทของยาแต่ละตัวมาจาก inventory.main_log (คลังน้ำเกลือ / คลังถุง/ขวด/ตลับ / อื่น = ยา)
-- submit_requisition รับ p_header->>'req_type' เพิ่ม (ไม่ส่ง = NULL เหมือนเดิม)
--
-- รันใน Supabase Dashboard → SQL Editor ก่อน deploy (รันซ้ำได้)
-- ============================================================

ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS req_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'requisitions_req_type_check') THEN
    ALTER TABLE public.requisitions
      ADD CONSTRAINT requisitions_req_type_check CHECK (req_type IN ('saline', 'supply', 'drug'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.submit_requisition(p_header jsonb, p_items jsonb)
RETURNS public.requisitions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_req public.requisitions;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ใบเบิกต้องมีอย่างน้อย 1 รายการ';
  END IF;

  INSERT INTO public.requisitions (req_number, department, requester_name, status, req_type)
  VALUES (p_header->>'req_number', p_header->>'department', p_header->>'requester_name', 'pending',
          NULLIF(p_header->>'req_type', ''))
  RETURNING * INTO v_req;

  INSERT INTO public.requisition_items
    (requisition_id, drug_code, drug_name, drug_unit, drug_type, requested_qty, item_note)
  SELECT v_req.id,
         i->>'drug_code', i->>'drug_name', i->>'drug_unit', i->>'drug_type',
         (i->>'requested_qty')::int, i->>'item_note'
  FROM jsonb_array_elements(p_items) AS i;

  RETURN v_req;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_requisition(jsonb, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
