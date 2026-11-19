-- ============================================================
-- ตารางการทำงานเจ้าหน้าที่คลังยา (หน้า "คู่มือและตารางงาน" แถบตารางการทำงาน)
-- 1 แถว = 1 คน · งานรายวันจันทร์–ศุกร์ · admin แก้ในแอป ทุก role ดูได้
-- รันซ้ำได้ (IF NOT EXISTS)
-- ============================================================
CREATE TABLE IF NOT EXISTS work_schedule (
  id          BIGSERIAL PRIMARY KEY,
  person      TEXT NOT NULL,                -- ชื่อเจ้าหน้าที่ (ชื่อเล่นตามที่ใช้ในคลัง)
  role_note   TEXT,                         -- ตำแหน่ง/หน้าที่ เช่น เจ้าหน้าที่คลัง · เภสัชกร
  mon         TEXT,
  tue         TEXT,
  wed         TEXT,
  thu         TEXT,
  fri         TEXT,
  note        TEXT,                         -- หมายเหตุ เช่น งานประจำเดือน/วันที่ไปช่วยหน่วยอื่น
  sort_order  INT  NOT NULL DEFAULT 0,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS — public read/write (internal app) ตาม pattern เดิม (ADR-0016) · สิทธิ์แก้คุมที่ UI (admin)
ALTER TABLE work_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all" ON work_schedule;
CREATE POLICY "Allow public all" ON work_schedule FOR ALL USING (true) WITH CHECK (true);
