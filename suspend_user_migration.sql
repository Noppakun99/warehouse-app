-- เพิ่ม column suspend_until ใน app_users
-- รัน 1 ครั้งใน Supabase Dashboard > SQL Editor
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS suspend_until TIMESTAMPTZ;
