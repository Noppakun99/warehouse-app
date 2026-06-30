# ADR-0008: ตรวจนับคงคลัง — append-only + freeze snapshot ค่าระบบ

วันที่: 2026-06-29
สถานะ: เสนอ (proposed)

## บริบท

หัวหน้าคลังต้องการ **สุ่มตรวจนับ** ยาในคลังเทียบกับยอดในระบบ — เลือกรหัสยาเองทีละตัว แล้วเดินนับว่าแต่ละ lot คงเหลือ **จำนวน / location / exp** ตรงกับระบบไหม เก็บเป็นรอบมีวันที่ ดึงประวัติย้อนหลังได้.

มี 2 decision ที่กลับยากและต้องตัดสินก่อนเขียนโค้ด:

1. ผลตรวจนับ **แก้ `inventory.qty`** ให้ตรงของจริง หรือ **บันทึกส่วนต่างอย่างเดียว**?
2. ประวัติเก็บค่าระบบแบบ **join สดกับ inventory** หรือ **freeze snapshot ลงแถว**?

## การตัดสินใจ

### 1. Append-only — ไม่แก้ `inventory.qty` อัตโนมัติ

ตรวจนับ = บันทึก discrepancy เท่านั้น ระบบไม่เขียนทับ qty.

- ตรง pattern เดียวกับทั้งระบบ: [[Return / Write-off]] และ Lot Allocation (ADR-0005) ล้วน append-only "ไม่แก้ stock อัตโนมัติ".
- `inventory.qty` มาจาก CSV/HosXP เป็น source of truth — เขียนทับที่นี่ import รอบถัดไปทับกลับ → วนไม่จบ.
- หน้าที่ checklist = หา discrepancy ให้หัวหน้าเห็น แล้วไปแก้ที่ต้นทาง.

### 2. Freeze snapshot ค่าระบบลงแถว — value copy ไม่ใช่ FK

`stock_count_item` เก็บ `system_qty/system_exp/system_location` เป็น **plain column** ค่า **ณ วันนับ**.

- inventory ถูก CSV import ทับทุกวัน — ถ้า join สดตอนเปิดประวัติ จะเทียบ "นับได้" ของวันเก่ากับ "ระบบ" ของวันนี้ (ผิดงวด).
- **ห้าม FK ไป `inventory.id`:** `importInventory` ([db.js](src/lib/db.js)) ทำ `delete().gte('id',0)` แล้ว insert ใหม่ → id เปลี่ยนหมดทุก import. snapshot ต้องเป็น value copy เท่านั้น.
- กฎเดียวกับ Ledger (ADR-0007) ที่ paste-as-value snapshot ไม่ link สดย้อนเดือน.

### 3. บรรทัดนับ = รวม (code+lot) ไม่ใช่ 1 แถว inventory

DB จริง 1 (code+lot) มีได้หลายแถว (ถึง 4) แตกด้วย `invoice`/รับเข้าคนละครั้ง — location/exp มักเหมือนกัน qty ต่างกัน.

- 1 บรรทัดนับ = 1 (code+lot); `system_qty = Σ qty ของทุกแถวกลุ่มนั้น` (parseFloat ก่อนบวก — qty เก็บเป็น TEXT).
- ถ้า list ตาม inventory row ตรงๆ จะโชว์บรรทัดซ้ำ lot/exp/location เหมือนกันเป๊ะ → คนนับงง.

### โครงสร้างตาราง (header + lines)

- `stock_count_session` — 1 รอบ: `counted_at`, `counter_name`, `note`, `status (draft|done)`.
- `stock_count_item` — 1 (code+lot) ที่นับ: `session_id`, `code/name/lot`, snapshot `system_qty/system_exp/system_location` (value copy), ค่านับ `counted_qty/counted_exp/counted_location`, `diff_qty` (= system−counted, parseFloat), `match` (ตรงครบ 3 มิติ).
- RLS `Allow public all` ตาม pattern เดิม.

## ทางเลือกที่ไม่เลือก

- **เขียนทับ `inventory.qty`**: ขัดปรัชญาทั้งระบบ + วนกับ CSV import.
- **join สดกับ inventory**: ประวัติเพี้ยนเมื่อ inventory เปลี่ยนหลังนับ.
- **ตารางเดียว flat**: ดึง "รอบไหนนับอะไร" ยาก ไม่มี header ระดับรอบ.

## ผลที่ตามมา

- ส่วนต่างที่พบ ต้องมีคนตามแก้ที่ต้นทาง (HosXP/CSV) เอง — ระบบไม่ปิด loop ให้.
- ต้อง wire audit log + notification ตาม Critical Rule #1/#12 (3 action: `create_stock_count`, `update_stock_count`, `delete_stock_count`).

## หมายเหตุ: append-only ≠ ห้ามแก้/ลบ record

"append-only" หมายถึง **ไม่แตะ `inventory.qty`** — ไม่ได้แปลว่า record การนับห้ามแก้. หน้าประวัติ **แก้ไขผลนับ (counted_qty/location/exp) + ลบทั้งรอบได้** (recompute diff/match จาก snapshot เดิม, ไม่แตะค่าระบบ) เพื่อแก้ที่กรอกผิด + ทดสอบระบบ. ลบรอบ = cascade ลบ items ผ่าน FK `ON DELETE CASCADE`. ทุกการแก้/ลบ log audit.
