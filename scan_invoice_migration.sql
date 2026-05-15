-- ============================================================
-- Migration: ระบบสแกนบิลยา (Invoice Scanner)
-- รันใน Supabase Dashboard > SQL Editor
-- ============================================================

-- เพิ่ม columns ใหม่ใน receive_logs
ALTER TABLE receive_logs
  ADD COLUMN IF NOT EXISTS gpu_code       TEXT,
  ADD COLUMN IF NOT EXISTS tpu_code       TEXT,
  ADD COLUMN IF NOT EXISTS ttmp_code      TEXT,
  ADD COLUMN IF NOT EXISTS mfg_date       TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date   DATE,
  ADD COLUMN IF NOT EXISTS vat_percent    NUMERIC,
  ADD COLUMN IF NOT EXISTS subtotal       NUMERIC,
  ADD COLUMN IF NOT EXISTS vat_amount     NUMERIC,
  ADD COLUMN IF NOT EXISTS invoice_total  NUMERIC,
  ADD COLUMN IF NOT EXISTS scan_image_url TEXT;

-- Storage bucket สำหรับเก็บภาพบิลต้นฉบับ
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-images', 'invoice-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: ทุกคนอ่านได้
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'invoice images public read'
  ) THEN
    CREATE POLICY "invoice images public read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'invoice-images');
  END IF;
END$$;

-- Policy: อัพโหลดได้
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'invoice images upload'
  ) THEN
    CREATE POLICY "invoice images upload"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'invoice-images');
  END IF;
END$$;
