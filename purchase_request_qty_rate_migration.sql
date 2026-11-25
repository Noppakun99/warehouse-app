-- purchase_request: จำนวนที่แจ้งซื้อ + เรทเบิก/เดือน ณ วันแจ้ง (ADR-0030 amendment 25/11/2569)
-- user สั่ง 25/11/2569: อยากเห็นตอนยามาส่งว่าแจ้งไปเท่าไร เรทตอนนั้นเท่าไร
-- ค่าจากรายงานการซื้อยา_69.xlsx: V จำนวนแนะนำสั่งซื้อ · N Avg/เดือน (3 ด.ล่าสุด) — snapshot วันแจ้ง ไม่คำนวณใหม่ในแอป
-- nullable: แอปรุ่นเก่ายังอ่าน/นำเข้าได้ · ต้องรันก่อน import:purchase --commit และก่อน push โค้ดที่ select คอลัมน์นี้

ALTER TABLE purchase_request ADD COLUMN IF NOT EXISTS qty_requested  numeric;  -- หน่วยตามคอลัมน์ unit
ALTER TABLE purchase_request ADD COLUMN IF NOT EXISTS rate_per_month numeric;  -- เบิกเฉลี่ย/เดือน ตามรายงาน ณ วันแจ้ง
