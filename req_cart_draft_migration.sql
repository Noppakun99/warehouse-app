-- requisition_cart_draft: ตะกร้าเบิกยาที่ผู้เบิกยังไม่ส่ง — เก็บใน DB ให้เห็นข้ามเครื่อง + การ์ดเตือนบน Dashboard
-- (user ตัดสิน 13/11/2569 · docs/architecture/sub-apps.md §ตะกร้าค้าง)
--
-- 1 ผู้ใช้ = 1 ตะกร้า (user_id เป็น PK) · บันทึกเฉพาะผู้เบิกที่ login เอง — คลังเบิกแทนหน่วยงาน (proxy) ไม่บันทึก
-- items = รายการในตะกร้า (jsonb) ตัด fefoLots/availableBase ออกก่อนบันทึก — โหลดกลับแล้วคำนวณคงเหลือใหม่
-- ส่งใบ / ล้างตะกร้า / ตะกร้าว่าง = ลบแถว
-- ไม่มีข้อมูลผู้ป่วย (ADR-0016) → policy เปิดแบบตารางอื่น

CREATE TABLE IF NOT EXISTS requisition_cart_draft (
  user_id         uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  department      text,
  requester_name  text,
  req_type        text,                          -- saline | supply | drug (ประเภทใบ — lib/reqType.js)
  items           jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS public (convention เดิม — ADR-0016)
ALTER TABLE requisition_cart_draft ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all" ON requisition_cart_draft FOR ALL USING (true) WITH CHECK (true);
