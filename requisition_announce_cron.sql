-- ============================================================
-- pg_cron: เรียก Edge Function `requisition-announce` ทุกวัน 08:00 (Asia/Bangkok)
-- ============================================================
-- ⚠️ อย่ารันจนกว่าจะทดสอบ @All ผ่านแล้ว (ขั้น 6 ในแผน) — รันแล้วมันจะเริ่มยิงกลุ่มจริงทันที
-- ⚠️ ต้องปิดบอทเดิม Kao-Bot (Apps Script) ก่อน ไม่งั้นกลุ่มได้ประกาศซ้ำ 2 ตัว และเผาโควตาคู่
--
-- ก่อนรัน: deploy edge function + ตั้ง secrets ครบ
--   supabase secrets set LINE_REQ_CHANNEL_TOKEN=...
--   supabase secrets set LINE_REQ_GROUP_ID=...
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- vault secret ใช้ร่วมกับ expiry-alert ได้ (auth ตัวเดียวกัน) — สร้างเฉพาะ url ใหม่
-- ถ้ามีอยู่แล้วจะ error (ignore ได้)
SELECT vault.create_secret(
  'https://kgjocnfafhqqioneqapk.supabase.co/functions/v1/requisition-announce',
  'requisition_announce_url'
);

-- ยิงทุกวัน — ฟังก์ชันตัดสินเองว่าวันนี้เป็นวันประกาศไหม
-- ทำไมยิงทุกวันแทนที่จะตั้ง cron เฉพาะ จ/พ: วันประกาศ "เลื่อนได้" ตามวันหยุด
-- ถ้า cron ล็อกไว้แค่ จ/พ วันที่เลื่อนไปอังคาร/พฤหัส จะไม่มีใครยิง
SELECT cron.schedule(
  'requisition-announce-daily',
  '0 1 * * *',  -- UTC 01:00 = 08:00 Asia/Bangkok
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'requisition_announce_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'expiry_alert_auth')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================
-- ตรวจสอบ / ยกเลิก
-- ============================================================
-- ดู job:        SELECT * FROM cron.job WHERE jobname = 'requisition-announce-daily';
-- ดู log:        SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- ดู response:   SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;
-- ยกเลิก:        SELECT cron.unschedule('requisition-announce-daily');
--
-- ทดสอบ manual (ไม่ส่งจริง):  body {"dryRun": true}
-- ทดสอบวันอื่น:               body {"date": "2026-12-08"}
