-- ============================================================
-- reorder_master_migration.sql
-- ระบบวิเคราะห์การสั่งซื้อยา (Reorder Analysis)
-- - drug_reorder_config: per-drug master (risk, lead time, supplier, price)
-- - analysis_runs: snapshot ผลการรันวิเคราะห์ทุกครั้ง (audit trail)
--
-- รันใน Supabase Dashboard > SQL Editor ก่อน deploy
-- ============================================================

-- ── 1) drug_reorder_config — 1 row ต่อ drug code ─────────────
CREATE TABLE IF NOT EXISTS drug_reorder_config (
  code            TEXT PRIMARY KEY,
  name            TEXT,
  supplier        TEXT,
  risk_group      TEXT DEFAULT 'Normal'
                  CHECK (risk_group IN ('Normal','Essential','Critical')),
  lead_time_days  NUMERIC(6,2) DEFAULT 15,
  price_per_unit  NUMERIC(12,4) DEFAULT 0,
  exclude_status  TEXT
                  CHECK (exclude_status IS NULL OR exclude_status IN ('ตัดออก','สั่งเมื่อขอ')),
  pack_size       NUMERIC(10,2) DEFAULT 1,
  notes           TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_drug_reorder_supplier ON drug_reorder_config(supplier);
CREATE INDEX IF NOT EXISTS idx_drug_reorder_risk     ON drug_reorder_config(risk_group);

-- ── 2) analysis_runs — snapshot ทุกรอบรันวิเคราะห์ ──────────
CREATE TABLE IF NOT EXISTS analysis_runs (
  id                 BIGSERIAL PRIMARY KEY,
  run_at             TIMESTAMPTZ DEFAULT NOW(),
  run_by             TEXT,
  mode               TEXT NOT NULL CHECK (mode IN ('normal','refill')),
  stats_from         DATE NOT NULL,                -- ช่วงสถิติเริ่ม
  stats_to           DATE NOT NULL,                -- ช่วงสถิติจบ
  excluded_month     DATE,                          -- เดือนตัดออก (Refill mode)
  lead_time_default  NUMERIC(6,2) DEFAULT 15,
  snapshot_date      DATE,                          -- วันที่ตัด snapshot คงเหลือ
  total_rows         INT DEFAULT 0,
  reorder_rows       INT DEFAULT 0,                 -- จำนวนที่ต้องสั่ง (V>0)
  total_amount       NUMERIC(14,2) DEFAULT 0,
  summary            JSONB DEFAULT '{}'::jsonb,    -- { byStatus: {...}, bySupplier: {...} }
  results            JSONB DEFAULT '[]'::jsonb,    -- full result rows
  notes              TEXT
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_at ON analysis_runs(run_at DESC);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE drug_reorder_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_runs       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all" ON drug_reorder_config;
DROP POLICY IF EXISTS "Allow public all" ON analysis_runs;

CREATE POLICY "Allow public all" ON drug_reorder_config
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all" ON analysis_runs
  FOR ALL USING (true) WITH CHECK (true);

-- ── Trigger: update updated_at อัตโนมัติ ────────────────────
CREATE OR REPLACE FUNCTION set_drug_reorder_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_drug_reorder_updated_at ON drug_reorder_config;
CREATE TRIGGER trg_drug_reorder_updated_at
  BEFORE UPDATE ON drug_reorder_config
  FOR EACH ROW EXECUTE FUNCTION set_drug_reorder_updated_at();
