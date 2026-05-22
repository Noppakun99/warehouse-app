# Roadmap — แผนพัฒนาที่ยังไม่ได้ทำ

## ระบบสั่งยา (Drug Order System)

### สถานะปัจจุบัน
- file: `src/App.jsx` → `view === 'order'` (full-page view)
- คำนวณ Reorder Point, แนะนำ SS, ต้องซื้อ **แบบ client-side** จาก:
  - `inventory` CSV → Safety Stock, Lead Time, qty ปัจจุบัน
  - `dispense_logs` Supabase → เรทใช้จริง 4 เดือนล่าสุด
- `orderedItems` เก็บใน **localStorage** เท่านั้น — ไม่ sync ระหว่าง user, ล้าง cache หายทันที

### แผน: Import Excel "วิเคราะห์ซื้อยา" มาแทนคำนวณใน app

**ที่มา**: มี Excel sheet วิเคราะห์การซื้อยาที่คำนวณไว้แล้ว รวมเรทปัจจุบัน + อดีต

**ข้อดีของ Excel rate เทียบกับคำนวณใน app**
- ครอบคลุมข้อมูลหลายปี (ไม่จำกัดแค่ 4 เดือน)
- เภสัชกรปรับ seasonal / outlier ได้เองก่อน upload
- ผ่านสายตาผู้เชี่ยวชาญแล้ว

**สิ่งที่ต้องรู้ก่อนทำ (รอ user ยืนยัน)**
- โครงสร้างคอลัมน์ใน Excel: รหัสยา, ชื่อยา, เรท/เดือน, เรทอดีต, SS, Lead Time, …?
- Excel rate จะ override dispense_logs calculation หรือแสดงคู่กัน?

**สิ่งที่ต้องทำเมื่อพร้อม**
1. ออกแบบ import schema (เพิ่ม column ใน `drug_details` หรือสร้าง table `drug_usage_rates`)
2. สร้าง CSV/Excel import UI ใน order view พร้อม preview + unmatched drugs
3. แสดง "อัพเดตล่าสุด: DD/MM/YYYY" + เตือนถ้าข้อมูลเกิน 30 วัน
4. ย้าย `orderedItems` จาก localStorage → Supabase table (ให้ sync ระหว่าง user)

**ยังไม่ต้องทำ** — รอ user ส่งโครงสร้าง Excel ให้ดูก่อน

## ReceiveLogApp.handleImport — ย้ายไป db.js

ดู [docs/schema.md#receive_logs--upload-สองที่](./schema.md)
- ปัจจุบัน ReceiveLogApp.handleImport เรียก supabase โดยตรง (ละเมิด convention)
- มีฟีเจอร์เพิ่ม (preview rows, warnRows, drug_swap_policy backfill) ที่ db.js ไม่มี
- ย้ายเข้า `importReceiveLogs()` ใน db.js เมื่อมีเวลา
