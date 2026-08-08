-- ============================================================
-- pg_cron schedule: เรียก Edge Function `expiry-alert` ทุกวัน 08:00 (Asia/Bangkok)
-- ============================================================
-- รันใน Supabase Dashboard → SQL Editor (ครั้งเดียว) ก่อนใช้งาน
-- ต้อง deploy Edge Function `expiry-alert` ก่อน + ตั้ง secrets ครบ
--
-- ก่อนรัน: replace <PROJECT_REF> และ <ANON_KEY_OR_SERVICE_ROLE> ในส่วน vault.create_secret
-- ============================================================

-- 1. เปิด extensions ที่จำเป็น
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. เก็บ URL + API key ใน vault (อย่า hardcode ใน cron job)
--    ทำครั้งเดียว — ถ้ามีอยู่แล้วจะ error (ignore ได้)
--    แทน <PROJECT_REF> ด้วย ref จริงของ project (เช่น kgjocnfafhqqioneqapk)
SELECT vault.create_secret(
  'https://<PROJECT_REF>.supabase.co/functions/v1/expiry-alert',
  'expiry_alert_url'
);

SELECT vault.create_secret(
  '<ANON_KEY_OR_SERVICE_ROLE>',
  'expiry_alert_auth'
);

-- 3a. cron EMAIL — ยิงทุกวัน 08:00 ตามเวลาไทย (= 01:00 UTC). body {} → channel=email (default)
SELECT cron.schedule(
  'expiry-alert-daily',
  '0 1 * * *',  -- UTC: 01:00 = 08:00 Asia/Bangkok, ทุกวัน
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'expiry_alert_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'expiry_alert_auth')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- 3b. cron LINE — ยิง "สัปดาห์ละครั้ง" จันทร์ 08:00 ตามเวลาไทย. body {"channel":"line"}
--     เหตุผลสัปดาห์ละครั้ง (ไม่ใช่รายวัน): LINE push นับ "รายหัว" (กลุ่ม 19 คน = 19 ข้อความ/ครั้ง)
--     free tier = 200 ข้อความ/เดือน → 19 × 4 = 76 < 200 (มี headroom). รายวันจะทะลุ.
--     ดู docs/expiry-alert-edge-function.md + CONTEXT.md §"เกณฑ์แจ้งเตือน LINE vs email"
SELECT cron.schedule(
  'expiry-alert-line-weekly',
  '0 1 * * 1',  -- UTC: 01:00 จันทร์ = 08:00 Asia/Bangkok จันทร์
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'expiry_alert_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'expiry_alert_auth')
    ),
    body := '{"channel":"line"}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================
-- ยกเลิก / ตรวจสอบ
-- ============================================================
-- ดู job ที่ตั้งไว้:
--   SELECT * FROM cron.job;
--
-- ดู log การรันล่าสุด:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--
-- ดู response จาก Edge Function:
--   SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;
--
-- ยกเลิก job:
--   SELECT cron.unschedule('expiry-alert-daily');        -- email รายวัน
--   SELECT cron.unschedule('expiry-alert-line-weekly');  -- LINE สัปดาห์ละครั้ง
--
-- แก้เวลา → unschedule แล้ว schedule ใหม่
--
-- ทดสอบ manual (ก่อน enable cron):
--   email:  body {}                      (หรือ {"channel":"email"})
--   LINE:   body {"channel":"line"}
--   ทั้งคู่: body {"channel":"both"}
