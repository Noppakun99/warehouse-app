-- ============================================================
-- requisition_entry_pack_migration.sql  (CONTEXT §หน่วยคีย์ — กันกำกวม)
-- ยาที่ lot คงเหลือคนละขนาดกล่อง (เช่น Dicloxacillin 400/500 เม็ด) ให้ผู้เบิกเลือกขนาดกล่องตอนคีย์
-- แล้วเก็บขนาดที่เลือกไว้ ให้ใบขอเบิก + หน้าจัดยาของคลังแสดง "2 กล่อง (400เม็ด)" (user เลือก 18/11/2569)
--
-- requested_qty ยังเก็บหน่วยย่อยสุดเหมือนเดิม (ADR-0004 ไม่เปลี่ยน) — 2 คอลัมน์นี้บอกแค่ว่าผู้เบิกคีย์มาเป็นกล่องขนาดไหน
--   entry_pack  = จำนวนหน่วยย่อยต่อกล่องที่เลือก (400) · NULL = คีย์หน่วยย่อย/ยามีขนาดเดียว (แสดงแบบเดิม)
--   entry_unit  = หน่วยตาม Master ของกล่องนั้น ("400เม็ด")
--
-- รันก่อนหรือหลัง deploy ก็ได้: แอปเก่าไม่ส่ง 2 key นี้ → NULL · แอปใหม่ส่งมาแต่ยังไม่รัน → RPC เดิมไม่อ่าน key (ไม่ error)
-- รันใน Supabase Dashboard → SQL Editor (รันซ้ำได้) · ฟังก์ชันด้านล่าง = ฉบับ requisition_req_type_migration.sql + 2 คอลัมน์
-- ============================================================

ALTER TABLE public.requisition_items ADD COLUMN IF NOT EXISTS entry_pack INTEGER;
ALTER TABLE public.requisition_items ADD COLUMN IF NOT EXISTS entry_unit TEXT;

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
    (requisition_id, drug_code, drug_name, drug_unit, drug_type, requested_qty, item_note, entry_pack, entry_unit)
  SELECT v_req.id,
         i->>'drug_code', i->>'drug_name', i->>'drug_unit', i->>'drug_type',
         (i->>'requested_qty')::int, i->>'item_note',
         NULLIF(i->>'entry_pack', '')::int, NULLIF(i->>'entry_unit', '')
  FROM jsonb_array_elements(p_items) AS i;

  RETURN v_req;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_requisition(jsonb, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
