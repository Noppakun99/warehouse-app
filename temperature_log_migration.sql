-- ============================================================
-- อุณหภูมิตู้เย็นคลังยา (Cold Chain Temperature) — ADR-0018
-- ============================================================
-- รันใน Supabase Dashboard → SQL Editor (ครั้งเดียว) ก่อน deploy
--
-- ย้ายจาก Google Form "แบบบันทึกอุณหภูมิและความชื้นสัมพัทธ์ (ตู้เย็นคลังยา)"
--
-- ⚠️ หัวใจของตารางนี้คือคอลัมน์ `source` — บอกว่าค่าที่บันทึก "มาจากไหน"
--    เพราะข้อมูลต้นทางมีค่าที่ Apps Script สุ่มขึ้น (Math.random 2-8) ปนอยู่ ~350 แถว
--    ค่าพวกนั้นต้อง import เข้ามาเป็นหลักฐาน แต่ห้ามเข้าสถิติ/กราฟ (ดู ADR-0018)
-- ============================================================

CREATE TABLE IF NOT EXISTS temperature_log (
  id              BIGSERIAL PRIMARY KEY,

  -- เวลาที่ "วัด" (ไม่ใช่เวลาที่กรอก) — คนวัด 09:00 แต่มากรอก 14:00 ได้
  reading_date    DATE        NOT NULL,
  -- NOT NULL + default 00:00 โดยเจตนา: ถ้าปล่อย NULL ได้ unique constraint จะไม่ชนกันเอง
  -- (NULL <> NULL ใน SQL) → import ซ้ำจะได้แถวซ้ำ — กับดักเดียวกับ drug_loan
  reading_time    TIME        NOT NULL DEFAULT '00:00:00',
  round_label     TEXT DEFAULT '',           -- 'เช้า'/'บ่าย' — รอบตามแผน (ว่างได้ถ้าวัดนอกรอบ)

  temp_c          NUMERIC(5,2) NOT NULL,     -- อุณหภูมิ °C (ทศนิยม 2 ตำแหน่งพอ)
  humidity_pct    NUMERIC(5,2),              -- ความชื้น % — ฟอร์มเดิมไม่เก็บ (NULL) แต่ชื่อฟอร์มพูดถึง
                                             -- และ data logger หลายรุ่นวัดให้ด้วย จึงเปิดช่องไว้

  -- เกณฑ์ ณ เวลาที่บันทึก (snapshot) — ไม่ hardcode 2-8 ในโค้ด
  -- ตู้แช่แข็งในอนาคตใช้เกณฑ์คนละชุด และค่าเก่าต้องคงเกณฑ์เดิมไว้
  min_c           NUMERIC(5,2) NOT NULL DEFAULT 2,
  max_c           NUMERIC(5,2) NOT NULL DEFAULT 8,

  location        TEXT NOT NULL DEFAULT 'ตู้เย็นคลังยา',  -- ตู้เดียว (ADR-0018 ข้อ 4)

  -- ที่มาของค่า: manual | form_import | generated | device
  --   manual      = คนกรอกผ่านแอป
  --   form_import = ย้ายจาก Google Form (คนวัดจริง)
  --   generated   = ⚠️ ค่าที่ระบบสุ่มขึ้น ไม่ใช่การวัดจริง — ห้ามเข้าสถิติ/กราฟ
  --   device      = data logger ส่ง/import เข้ามา
  source          TEXT NOT NULL DEFAULT 'manual',

  -- อุปกรณ์ที่ใช้วัด — สำคัญกับงานตรวจ GDP/HA ที่ขอ "ใบสอบเทียบของเครื่องที่ใช้วัด"
  --   fridge_display = อ่านจากจอของตู้เย็นเอง (สภาพปัจจุบัน 2026-08-16)
  --                    ⚠️ วัดอากาศใกล้คอยล์ ไม่ใช่อุณหภูมิของยา + ไม่มีใบสอบเทียบ = ใช้ยืนยันกับผู้ตรวจไม่ได้
  --   thermometer    = เทอร์โมมิเตอร์แยก (ควรจุ่มในกลีเซอรีน/ขวดน้ำ)
  --   data_logger    = เครื่องบันทึกอัตโนมัติ (ควรมีใบสอบเทียบ)
  --   none           = ไม่ได้วัดด้วยอะไรเลย (คู่กับ source='generated')
  device          TEXT NOT NULL DEFAULT 'fridge_display',

  recorded_by     TEXT DEFAULT '',           -- ชื่อผู้บันทึก (ฟอร์มเดิมเป็น free text: ไนท์/เก้า/K/P'Jeab)
  note            TEXT DEFAULT '',           -- หมายเหตุทั่วไป

  -- การดำเนินการเมื่ออุณหภูมิหลุดช่วง (corrective action) — ฟอร์มเดิมไม่มีช่องนี้
  -- ว่าง + หลุดช่วง = ยังไม่มีใครจัดการ (หน้า UI ต้อง flag)
  action_taken    TEXT DEFAULT '',

  source_ref      TEXT DEFAULT '',           -- อ้างอิงต้นทาง เช่น Timestamp เดิมจาก Google Form (กัน import ซ้ำ)
  created_at      TIMESTAMPTZ DEFAULT NOW()  -- เวลาที่ "กรอก" เข้าระบบ (ต่างจาก reading_date/time)
);

-- query หลัก: ดูตามช่วงวันที่ (หน้าประวัติ/กราฟ) เรียงล่าสุดก่อน
CREATE INDEX IF NOT EXISTS idx_temperature_log_date
  ON temperature_log (reading_date DESC, reading_time DESC);

-- query รอง: กรองเฉพาะค่าที่วัดจริง (ทุกสถิติต้องใช้ filter นี้)
CREATE INDEX IF NOT EXISTS idx_temperature_log_source
  ON temperature_log (source);

-- กันบันทึกซ้ำรอบเดียวกัน — วันเดียวกัน + เวลาเดียวกัน + ตู้เดียวกัน ควรมีแถวเดียว
-- ⚠️ ใช้ COALESCE กับ reading_time เพราะ NULL ไม่ชนกันเองใน unique index ปกติ
--    (กับดักเดียวกับ drug_loan — ดู memory project_drug_loan_between_hospitals)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_temperature_log_slot
  ON temperature_log (reading_date, COALESCE(reading_time, '00:00:00'::TIME), location);

COMMENT ON TABLE temperature_log IS
  'บันทึกอุณหภูมิตู้เย็นเก็บยา (ADR-0018). source=generated คือค่าที่ Apps Script สุ่มขึ้น ไม่ใช่การวัดจริง — ห้ามนำเข้าสถิติ/กราฟ';
COMMENT ON COLUMN temperature_log.source IS
  'manual | form_import | generated | device — generated = ไม่ใช่ค่าที่วัดจริง ต้องกรองออกจากทุกการคำนวณ';
COMMENT ON COLUMN temperature_log.action_taken IS
  'การดำเนินการเมื่ออุณหภูมิหลุดช่วง (corrective action) — ว่างพร้อมกับหลุดช่วง = ยังไม่มีใครจัดการ';
COMMENT ON COLUMN temperature_log.device IS
  'อุปกรณ์ที่ใช้วัด: fridge_display (จอตู้เย็น — ไม่มีใบสอบเทียบ) | thermometer | data_logger | none';

-- realtime: ยังไม่เปิด (ไม่มี badge/กระดิ่งที่ต้อง sync สด)
-- ถ้าจะเปิดภายหลัง: ALTER PUBLICATION supabase_realtime ADD TABLE public.temperature_log;
