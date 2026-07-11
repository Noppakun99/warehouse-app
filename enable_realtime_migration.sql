-- ============================================================
-- enable_realtime_migration.sql
-- เปิด Supabase Realtime replication ให้ตารางที่ UI subscribe อยู่
--
-- ที่มา: publication supabase_realtime เดิม "ว่างเปล่า" (0 ตาราง) → event INSERT/UPDATE/DELETE
-- ไม่ถูกส่งถึง client → badge เมนู (คืนยา/เบิกยา) + กระดิ่งแจ้งเตือน + live list ไม่ refresh อัตโนมัติ
-- (badge ค้างค่าเดิมจนกว่าจะ full reload). แก้โดยเพิ่มตารางเข้า publication.
--
-- ตารางที่ UI subscribe (grep 'postgres_changes' ใน src/):
--   requisitions       — badge "เบิกยาออนไลน์", live list, reservation, dashboard stats
--   requisition_items  — reservation per-code (RequisitionApp)
--   return_logs        — badge "คืนยา / ยาเสียหาย"
--   audit_logs         — กระดิ่งแจ้งเตือน (NotificationBell realtime INSERT)
--   inventory          — แผนผังคลังยา (live)
--
-- รันใน Supabase Dashboard → SQL Editor ก่อน deploy (idempotent-safe: กัน error ถ้ามีอยู่แล้ว)
-- ============================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['requisitions', 'requisition_items', 'return_logs', 'audit_logs', 'inventory'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ตรวจผล: ควรเห็นทั้ง 5 ตาราง
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND schemaname = 'public' ORDER BY tablename;
