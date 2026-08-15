-- ============================================================
-- pg_cron: เรียก Edge Function `requisition-announce` ทุกวัน 08:00 (Asia/Bangkok)
-- ============================================================
-- ✅ รันจริงแล้ว 2026-08-15 — ไฟล์นี้อัปเดตให้ตรงกับที่รันจริง (ของเดิมมีกับดัก ดูหมายเหตุล่าง)
-- ⚠️ ต้องปิดบอทเดิม Kao-Bot (Apps Script) ก่อน ไม่งั้นกลุ่มได้ประกาศซ้ำ 2 ตัว และเผาโควตาคู่
--
-- ก่อนรัน: deploy edge function + ตั้ง secrets ครบ (ตั้งใน Dashboard → Edge Functions → Secrets)
--   LINE_REQ_CHANNEL_TOKEN, LINE_REQ_GROUP_ID
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;   -- ⚠️ ไม่ได้ติดตั้งมาแต่แรก ต้องรันบรรทัดนี้จริง

-- ⚠️ กับดักของไฟล์เวอร์ชันแรก: เดิมอ้าง vault secret ชื่อ `expiry_alert_auth`
-- โดยเข้าใจว่า "ใช้ร่วมกับ expiry-alert ได้" — แต่ตรวจแล้ว vault ว่างเปล่า (0 แถว)
-- และ expiry-alert ก็ไม่เคยตั้ง cron เลย → cron จะยิงด้วย Authorization ว่าง = 401 เงียบทุกวัน
-- จึงต้องสร้าง secret ทั้ง 2 ตัวเอง
SELECT vault.create_secret(
  '<VITE_SUPABASE_ANON_KEY>',   -- ค่าจริงอยู่ใน .env — อย่า commit ค่า key ลงไฟล์นี้
  'requisition_announce_auth',
  'anon key สำหรับ cron เรียก Edge Function requisition-announce'
);

SELECT vault.create_secret(
  'https://kgjocnfafhqqioneqapk.supabase.co/functions/v1/requisition-announce',
  'requisition_announce_url',
  'endpoint ของบอทประกาศรอบเบิก-รับ'
);

-- ยิงทุกวัน — ฟังก์ชันตัดสินเองว่าวันนี้เป็นวันประกาศไหม
-- ทำไมยิงทุกวันแทนที่จะตั้ง cron เฉพาะ จ/พ: วันประกาศ "เลื่อนได้" ตามวันหยุด
-- ถ้า cron ล็อกไว้แค่ จ/พ วันที่เลื่อนไปอังคาร/พฤหัส จะไม่มีใครยิง
-- (โครงสร้างเดียวกับบอทเดิม Kao-Bot: trigger ยิงทุกวัน แล้ว mainAlert() เช็ควันเอง)
--
-- เวลา 09:00 ไม่ใช่ 08:00 — บอทเดิมยิง 09:13 (ดูจาก trigger last-run) ward คุ้นเวลานี้
-- และ 09:00 คือเวลาเปิดรับของพอดี ("มารับได้ตั้งแต่ 9.00-15.00น." ในตัวข้อความ)
SELECT cron.schedule(
  'requisition-announce-daily',
  '0 2 * * *',  -- UTC 02:00 = 09:00 Asia/Bangkok
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'requisition_announce_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'requisition_announce_auth')
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
