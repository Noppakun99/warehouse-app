-- ============================================================
-- Audit Log Retention Policy — pg_cron job
-- รันไฟล์นี้ใน Supabase Dashboard > SQL Editor ครั้งเดียว
-- ต้องการ: Database > Extensions > pg_cron เปิดอยู่
-- ============================================================

-- Step 1: เปิด pg_cron extension (ถ้ายังไม่ได้เปิด)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 2: ลบ cron job เดิมก่อน (ถ้ามี) เพื่อป้องกัน duplicate
SELECT cron.unschedule('audit-log-retention')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'audit-log-retention'
);

-- Step 3: สร้าง cron job ลบ audit_logs ทุกคืน 02:00 น.
SELECT cron.schedule(
  'audit-log-retention',   -- ชื่อ job
  '0 2 * * *',             -- ทุกวัน 02:00 UTC (09:00 น. ไทย)
  $$
    -- login: เก็บ 90 วัน
    DELETE FROM audit_logs
    WHERE action = 'login'
      AND created_at < NOW() - INTERVAL '90 days';

    -- export_excel: เก็บ 180 วัน
    DELETE FROM audit_logs
    WHERE action = 'export_excel'
      AND created_at < NOW() - INTERVAL '180 days';

    -- ทุก action อื่น (import, return, requisition ฯลฯ): เก็บ 2 ปี
    DELETE FROM audit_logs
    WHERE action NOT IN ('login', 'export_excel')
      AND created_at < NOW() - INTERVAL '2 years';
  $$
);

-- ============================================================
-- ตรวจสอบว่า job ถูกสร้างแล้ว
-- ============================================================
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'audit-log-retention';

-- ============================================================
-- หมายเหตุ: Retention Policy
-- ============================================================
-- action = 'login'                      → เก็บ 90 วัน
-- action = 'export_excel'               → เก็บ 180 วัน
-- action อื่น (import_inventory,        → เก็บ 2 ปี
--   import_receive, insert_return,
--   requester_delete_requisition, ฯลฯ)
--
-- เหตุผล: บันทึกยา/การรับ-จ่าย มีนัยทางกฎหมายตามมาตรฐานเภสัชกรรม
-- ถ้ามียาควบคุมพิเศษ → เปลี่ยน '2 years' เป็น '3 years'
-- ============================================================
