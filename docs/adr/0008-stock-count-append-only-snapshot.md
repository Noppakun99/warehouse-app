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

## เพิ่มเติม 2026-07-03: per-line note, เวลาจริง, draft, ผลแบบละเอียด

หลังใช้งานจริง หัวหน้าคลังขอ 5 อย่าง — ตัดสินดังนี้:

1. **หมายเหตุรายบรรทัด (`stock_count_item.note`)** — แยกจาก `stock_count_session.note` (หมายเหตุรอบ). กรอกได้ทั้งตอนนับ (CountTab) และตอนแก้ในประวัติ. เป็น field ต่อ (code+lot) ไม่ใช่ต่อ inventory row — สอดคล้อง decision #3 (1 บรรทัด = 1 code+lot).
2. **"นับเมื่อไหร่" = เวลาจริงที่กดบันทึก** — ใช้ `created_at` (TIMESTAMPTZ ที่มีอยู่แล้วในตาราง) ไม่ใช่ `counted_at` (DATE ที่คนเลือกเอง). **ไม่ต้อง migration** — คอลัมน์มีอยู่แล้ว แค่ประวัติไม่เคยแสดง. `counted_at` ยังคงเป็น "วันที่ของรอบ" (แก้ได้) ส่วน `created_at` = timestamp บันทึกจริง (immutable).
3. **ผลแบบละเอียด (แสดงในหน้าประวัติ)** — แทน badge boolean เดียว แสดงว่าไม่ตรงมิติไหน (จำนวน/ที่เก็บ/exp). **คำนวณสดจาก snapshot ตอน render — ไม่เก็บคอลัมน์เพิ่ม** (ข้อมูล qtyOk/expOk/locOk derive ได้จาก `system_*` vs `counted_*` ที่ freeze ไว้แล้ว). กฎ: อย่า persist สิ่งที่ compute ได้จาก snapshot.
4. **autofill "ถูกแล้ว" ในหน้าแก้ประวัติ** — ติกแล้วเติม `counted = system` ครบ 3 มิติ → recompute `match=true` ผ่าน `computeCountMatch` เดิม (ไม่แตะ db.js logic). port pattern เดียวกับ `markLineAllMatch` ใน CountTab. toggle: กดซ้ำ = ล้าง.
5. **นับค้างไว้ (draft) = localStorage ต่อ user ไม่ใช่ DB** — เก็บ `lines + note` ที่กำลังนับใน browser (key `stockcount_draft_<username>`). **ไม่บันทึก draft ลง DB** (แม้ schema มี `status='draft'`) เพราะ: (ก) ยังไม่มี requirement ให้เปิดต่ออีกเครื่อง/หลายคนนับ; (ข) เลี่ยง draft ค้างใน DB ปนกับ session จริง (`status='done'`). ตอนกลับเข้าหน้า ถ้ามี draft → แสดง banner ให้เลือก [กู้คืน]/[ทิ้ง] (ไม่ auto-restore เงียบ). `handleSave` สำเร็จ = ล้าง draft. `addedCodes` (Set) reconstruct จาก lines ที่ restore (Set ไม่รอด JSON). **`status='draft'` ใน schema กลายเป็น dead ชั่วคราว** — คงไว้เผื่อยกระดับเป็น DB draft ภายหลัง.

## หมายเหตุ: append-only ≠ ห้ามแก้/ลบ record

"append-only" หมายถึง **ไม่แตะ `inventory.qty`** — ไม่ได้แปลว่า record การนับห้ามแก้. หน้าประวัติ **แก้ไขผลนับ (counted_qty/location/exp) + ลบทั้งรอบได้** (recompute diff/match จาก snapshot เดิม, ไม่แตะค่าระบบ) เพื่อแก้ที่กรอกผิด + ทดสอบระบบ. ลบรอบ = cascade ลบ items ผ่าน FK `ON DELETE CASCADE`. ทุกการแก้/ลบ log audit.
