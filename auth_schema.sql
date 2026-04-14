-- ตาราง app_users: เก็บข้อมูลผู้ใช้งานระบบ
-- Password hash ใช้ SHA-256 (client-side Web Crypto API)

CREATE TABLE IF NOT EXISTS app_users (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  username      text        UNIQUE NOT NULL,
  password_hash text        NOT NULL,
  full_name     text        NOT NULL,
  department    text,
  role          text        NOT NULL DEFAULT 'requester',  -- requester | staff | admin
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users (username);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public access" ON app_users;
CREATE POLICY "public access" ON app_users FOR ALL USING (true) WITH CHECK (true);
