-- เพิ่ม column permissions ใน app_users
-- รัน 1 ครั้งใน Supabase Dashboard > SQL Editor

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]'::jsonb;
