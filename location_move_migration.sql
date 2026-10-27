-- location_move: ใบแจ้งย้ายที่เก็บ — เจ้าหน้าที่คลังไปหยิบยาตามที่เก็บในระบบแล้วไม่อยู่ที่นั้น
-- (CONTEXT.md §ใบแจ้งย้ายที่เก็บ · docs/features/location-move.md)
--
-- Excel ยังเป็นตัวจริงของที่เก็บ (ADR-0027) — แถวนี้คือ "คำสั่งย้าย" ที่รอลง Master D/E
-- แผนผังแสดง to_location ทันทีระหว่าง status = pending · นำเข้า Master แล้วไฟล์ตรง = applied
--
-- หน่วยย้าย = code + lot + from_location (ทุกแถว inventory ที่ 3 ค่านี้ตรงกัน)
--   ไม่ใช่ code + lot — lot เดียวแยกแถวตามที่เก็บได้ (Manidipine 260873 E-1-x / ห้องประชุมเล็กชั้น4)

CREATE TABLE IF NOT EXISTS location_move (
  id             bigserial PRIMARY KEY,
  code           text NOT NULL,
  name           text,
  lot            text NOT NULL,             -- '-' ได้ (เวชภัณฑ์ไม่มี lot)
  from_location  text NOT NULL,             -- ที่เก็บที่แผนผังแสดงตอนกดย้าย
  from_main_log  text,
  to_location    text NOT NULL,             -- ชุดชั้น normalize แล้ว "C-2-3 ,D-4-4"
  to_main_log    text,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'applied', 'superseded', 'conflict')),
  note           text,                      -- เหตุผล conflict / หมายเหตุ
  created_by     text,
  created_at     timestamptz DEFAULT now(),
  resolved_at    timestamptz
);

-- ใบรอลงได้ใบเดียวต่อกองยา — ใบใหม่ต้อง supersede ใบเดิมก่อน insert
CREATE UNIQUE INDEX IF NOT EXISTS uq_location_move_pending
  ON location_move (code, lot, from_location) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_location_move_status ON location_move (status);

-- RLS public (convention เดิม — ADR-0016)
ALTER TABLE location_move ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all" ON location_move FOR ALL USING (true) WITH CHECK (true);
