-- line_message_migration.sql — เก็บข้อความจากกลุ่ม LINE ที่บอท "คลังยา" อยู่ (ADR-0022)
--
-- ทำไมต้องมี: งานที่หัวหน้า/เพื่อนร่วมงานสั่งผ่านไลน์ตกหล่นเพราะไม่ได้อ่านหรืออ่านแล้วลืม
--   ระบบเก็บข้อความไว้แล้วชูตัวที่ "น่าจะเป็นงาน" ขึ้นมาให้คนยืนยัน (ไม่เดาแทนคน)
--
-- ⚠️ ตารางนี้ **ปิดสนิทจาก client** ตาม ADR-0016 กฎข้อ 1 —
--   ENABLE RLS โดย **ไม่ใส่ policy** → anon key อ่านไม่ได้เลยแม้จะหลุดออกไป
--   การอ่าน/เขียนทั้งหมดผ่าน edge function ที่ถือ service_role เท่านั้น
--   (line-webhook = เขียน, line-tasks = อ่าน/มาร์ก)
--   เหตุผล: แชทงานคลังยามีรหัสประตูคลัง เรื่องภายใน และชื่อคนที่อาจหลุดมาปนได้
--   การกรองด้วย regex ตอน import กันไม่ครบ (รหัสเขียนได้หลายแบบ) จึงปิดที่ชั้น DB แทน

CREATE TABLE IF NOT EXISTS public.line_message (
  id           bigserial PRIMARY KEY,
  -- ที่มา: webhook = ยิงเข้ามาสด / import = นำเข้าจากไฟล์ export ประวัติเก่า
  source       text NOT NULL DEFAULT 'webhook' CHECK (source IN ('webhook','import')),
  -- id ของข้อความจาก LINE — มีเฉพาะ source='webhook' (ไฟล์ export ไม่มี) ใช้กันยิงซ้ำ
  line_message_id text,
  chat_id      text,                       -- groupId/userId จาก LINE (NULL ได้ถ้ามาจากไฟล์)
  chat_name    text NOT NULL,              -- ชื่อกลุ่ม/คู่สนทนา (ไฟล์ export บอกได้แค่ชื่อ)
  sender       text NOT NULL,              -- ชื่อผู้ส่งตามที่แสดงใน LINE
  sender_id    text,                       -- userId — มีเฉพาะ webhook
  sent_at      timestamptz NOT NULL,       -- เวลาที่ส่งจริง (ไฟล์เก่าเป็นเวลาท้องถิ่น +07)
  msg_type     text NOT NULL DEFAULT 'text', -- text/image/sticker/file/video/system
  body         text,                       -- เนื้อความ (NULL ถ้าไม่ใช่ text)

  -- ── สถานะงาน (แบบ C: ดักคำ → คนยืนยัน) ──
  -- NULL      = ยังไม่ได้พิจารณา (ข้อความทั่วไป)
  -- candidate = ระบบเดาว่าน่าจะเป็นงาน รอคนยืนยัน
  -- task      = คนยืนยันแล้วว่าเป็นงาน ยังไม่ทำ  ← "งานค้าง" คือแถวนี้
  -- done      = ทำแล้ว
  -- dismissed = คนปัดทิ้ง ไม่ใช่งาน
  task_status  text CHECK (task_status IN ('candidate','task','done','dismissed')),
  matched_kw   text,                       -- คำที่ทำให้ถูกชู (ไว้ปรับรายการคำทีหลัง)
  task_note    text,                       -- โน้ตที่คนพิมพ์เพิ่มในแอป
  done_by      text,
  done_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- กัน webhook ยิงซ้ำ (LINE retry ได้ถ้าเราตอบช้า) — เฉพาะแถวที่มี line_message_id
CREATE UNIQUE INDEX IF NOT EXISTS line_message_msgid_idx
  ON public.line_message (line_message_id) WHERE line_message_id IS NOT NULL;

-- กัน import ไฟล์เดิมซ้ำ — ไฟล์ export ไม่มี id ต้องใช้ค่าที่ประกอบกันแล้วไม่ซ้ำ
-- COALESCE ทุกคอลัมน์ที่ NULL ได้ (NULL <> NULL ทำให้ unique index ไม่กัน — บทเรียนจาก drug_loan)
CREATE UNIQUE INDEX IF NOT EXISTS line_message_import_idx
  ON public.line_message (chat_name, sender, sent_at, COALESCE(body,''), msg_type)
  WHERE source = 'import';

-- งานค้าง = task_status IN ('candidate','task') → index ให้หน้ารายการเร็ว
CREATE INDEX IF NOT EXISTS line_message_open_idx
  ON public.line_message (sent_at DESC) WHERE task_status IN ('candidate','task');
CREATE INDEX IF NOT EXISTS line_message_sent_idx ON public.line_message (sent_at DESC);

COMMENT ON TABLE public.line_message IS
  'ข้อความจากกลุ่ม LINE ที่บอทคลังยาอยู่ (ADR-0022). ปิดจาก client ตาม ADR-0016 กฎ 1 — RLS เปิดแต่ไม่มี policy อ่านผ่าน edge function เท่านั้น';

-- ⚠️ เปิด RLS โดยไม่ใส่ policy = client เข้าไม่ได้เลย (ตั้งใจ) ห้ามเพิ่ม policy ภายหลัง
ALTER TABLE public.line_message ENABLE ROW LEVEL SECURITY;
