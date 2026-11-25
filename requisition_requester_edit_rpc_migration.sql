-- ============================================================
-- requisition_requester_edit_rpc_migration.sql  (25/11/2569 — เพิ่มยาเข้าใบที่ส่งแล้ว)
-- ผู้เบิกแก้ใบ 1 รอบ (แก้จำนวน/หมายเหตุ + เพิ่มยา) เป็นธุรกรรมเดียว — CONTEXT §เลขรับใบเบิก grill ข้อ 3:
-- ไม่ผ่าน = การแก้ใบรอบนั้นไม่เกิดทั้งรอบ · เดิมแอปแก้หัวใบ แล้ว update ทีละบรรทัดจากเบราว์เซอร์
-- เน็ตหลุดกลางทาง = ใบค้างครึ่งรอบ และคลังลงชีทแทรกระหว่างเช็คกับเขียนได้
--
-- requester_edit_requisition(p_id, p_note, p_updates, p_inserts, p_delete_ids)
--   ล็อกหัวใบ (FOR UPDATE) เฉพาะใบ pending + ยังไม่ลงชีท — ไม่ใช่ = RAISE 'REQUESTER_LOCKED'
--   เพิ่มยา: ใบไม่มีประเภท = 'NO_REQ_TYPE' · ยาซ้ำกับในใบ/ซ้ำกันเอง = 'DUPLICATE_DRUG:<ชื่อยา>'
--   ตั้ง updated_at = now() ทุกครั้ง → ด่าน writeback ของ online-req.mjs (เทียบ updated_at) จับใบที่ถูกแก้หลังทำแผน
--   p_delete_ids ใช้ตอนถอยรอบ (ลบบรรทัดที่เพิ่งเพิ่ม) · คืน { updated_at, inserted_ids }
--   ไม่มีตรรกะยอดจอง — ตรวจใน JS ที่เดียว (ADR-0028) แล้วเรียกซ้ำเพื่อถอยรอบเมื่อชน
--
-- security invoker = สิทธิ์เท่าการ update/insert ตรงที่แอปทำอยู่แล้ว (ADR-0016) · รันซ้ำได้
-- ============================================================

-- ตัวตนยา 1 บรรทัด: รหัส (lower · ตัด 0 นำหน้า) · ไม่มีรหัส ('-'/ว่าง) ใช้ชื่อ — ตรงกับ lineKey ใน src/lib/reqEditRound.js
CREATE OR REPLACE FUNCTION public.req_line_key(p_code text, p_name text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN coalesce(btrim(p_code), '') IN ('', '-')
    THEN 'n:' || regexp_replace(lower(btrim(coalesce(p_name, ''))), '\s+', ' ', 'g')
    ELSE 'c:' || regexp_replace(lower(btrim(p_code)), '^0+(\d)', '\1')
  END
$$;

CREATE OR REPLACE FUNCTION public.requester_edit_requisition(
  p_id bigint, p_note text, p_updates jsonb, p_inserts jsonb, p_delete_ids jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_req public.requisitions;
  v_dup text;
  v_ids bigint[];
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_req FROM public.requisitions
  WHERE id = p_id AND status = 'pending' AND sheet_entered_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUESTER_LOCKED';
  END IF;

  IF jsonb_array_length(coalesce(p_inserts, '[]'::jsonb)) > 0 THEN
    IF v_req.req_type IS NULL THEN
      RAISE EXCEPTION 'NO_REQ_TYPE';
    END IF;
    WITH ins AS (
      SELECT i->>'drug_name' AS nm, public.req_line_key(i->>'drug_code', i->>'drug_name') AS k
      FROM jsonb_array_elements(p_inserts) AS i
    ), ex AS (
      SELECT public.req_line_key(drug_code, drug_name) AS k
      FROM public.requisition_items WHERE requisition_id = p_id
    )
    SELECT nm INTO v_dup FROM ins
    WHERE k IN (SELECT k FROM ex) OR k IN (SELECT k FROM ins GROUP BY k HAVING count(*) > 1)
    LIMIT 1;
    IF v_dup IS NOT NULL THEN
      RAISE EXCEPTION 'DUPLICATE_DRUG:%', v_dup;
    END IF;
  END IF;

  UPDATE public.requisitions SET note = NULLIF(p_note, ''), updated_at = v_now WHERE id = p_id;

  UPDATE public.requisition_items ri
  SET requested_qty = (u->>'requested_qty')::int, note = NULLIF(u->>'note', '')
  FROM jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) AS u
  WHERE ri.id = (u->>'id')::bigint AND ri.requisition_id = p_id;

  DELETE FROM public.requisition_items
  WHERE requisition_id = p_id
    AND id IN (SELECT x::bigint FROM jsonb_array_elements_text(coalesce(p_delete_ids, '[]'::jsonb)) AS x);

  WITH ins AS (
    INSERT INTO public.requisition_items
      (requisition_id, drug_code, drug_name, drug_unit, drug_type, requested_qty, item_note, entry_pack, entry_unit)
    SELECT p_id,
           i->>'drug_code', i->>'drug_name', i->>'drug_unit', i->>'drug_type',
           (i->>'requested_qty')::int, i->>'item_note',
           NULLIF(i->>'entry_pack', '')::int, NULLIF(i->>'entry_unit', '')
    FROM jsonb_array_elements(coalesce(p_inserts, '[]'::jsonb)) AS i
    RETURNING id
  )
  SELECT array_agg(id ORDER BY id) INTO v_ids FROM ins;

  RETURN jsonb_build_object('updated_at', v_now, 'inserted_ids', coalesce(to_jsonb(v_ids), '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.req_line_key(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requester_edit_requisition(bigint, text, jsonb, jsonb, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
