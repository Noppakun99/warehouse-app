-- ============================================================
-- requisition_submit_rpc_migration.sql  (ADR-0028)
-- ส่งใบเบิกพร้อมกันหลายหน่วยงาน — หัวใบ+รายการเป็นธุรกรรมเดียว + ถอนใบที่ชนกัน
--
-- 1) submit_requisition(p_header, p_items) — insert หัวใบ + รายการในธุรกรรมเดียว คืนแถวหัวใบ
--    เดิมแอป insert 2 ครั้งจากเบราว์เซอร์ → เน็ตหลุดกลางทาง = หัวใบ pending ไม่มีรายการค้างคิว staff
--    ไม่มีตรรกะธุรกิจ (สูตรพร้อมเบิก/ยอดจองอยู่ใน JS ที่เดียว) · เลขใบสุ่มจากแอป
--    เลขชน = unique_violation (23505) ทั้งธุรกรรม rollback แล้วแอปลองเลขใหม่
-- 2) withdraw_requisition(p_id) — ลบหัวใบ+รายการในธุรกรรมเดียว เฉพาะใบที่ยัง pending
--    (ล็อกแถวก่อนลบ กัน staff อนุมัติพร้อมกัน) คืน false ถ้าใบไม่อยู่/ไม่ใช่ pending แล้ว
--
-- security invoker = สิทธิ์เท่าการ insert/delete ตรงที่แอปทำอยู่แล้ว (ADR-0016)
-- รันใน Supabase Dashboard → SQL Editor ก่อน deploy (รันซ้ำได้)
-- ============================================================

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

  INSERT INTO public.requisitions (req_number, department, requester_name, status)
  VALUES (p_header->>'req_number', p_header->>'department', p_header->>'requester_name', 'pending')
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

CREATE OR REPLACE FUNCTION public.withdraw_requisition(p_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM 1 FROM public.requisitions WHERE id = p_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  DELETE FROM public.requisition_items WHERE requisition_id = p_id;
  DELETE FROM public.requisitions WHERE id = p_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_requisition(jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_requisition(bigint) TO anon, authenticated;

-- ให้ PostgREST เห็นฟังก์ชันใหม่ทันที (ไม่ต้องรอ reload เอง)
NOTIFY pgrst, 'reload schema';
