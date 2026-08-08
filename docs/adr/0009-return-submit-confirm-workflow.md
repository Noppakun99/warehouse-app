# 0009. คืนยาเป็น 2 สถานะ (รอรับคืน → รับแล้ว) — user ส่งคำขอ, คลังยืนยัน

- **Status:** Accepted
- **Date:** 2026-07-08

## Context

เดิม `ReturnApp` → `RecordTab` บันทึกคืนยาแบบ **single-shot**: ใครก็ตามที่กรอกฟอร์ม
กด "บันทึกการคืนยา" ครั้งเดียวจบ — `insertReturnLog` เขียน 1 แถวลง `return_logs`
โดยไม่มีสถานะ (`received_by` default = `auth.name` ของคนที่ล็อกอิน). ฟอร์มมี dropdown
แหล่งที่คืน + สาเหตุ (ADR-0003) และแยกช่อง `returned_by` / `received_by` อยู่แล้ว.

ความต้องการใหม่: ให้**ผู้เบิก (ward/requester) กรอกคำขอคืนเอง** แล้ว**ส่งให้เจ้าหน้าที่
คลังยืนยันรับคืน** — เพื่อให้มีการ "รับมอบจริง" 2 ฝ่ายก่อนถือว่าปิดรายการ (กันกรณี ward
แจ้งคืนแต่ของยังไม่ถึงคลัง / คลังยังไม่ได้ตรวจ). ต้องตัดสินว่า lifecycle กี่สถานะ,
แถวเก่านับเป็นอะไร, และ "รับแล้ว" กระทบ stock ไหม — decision เหล่านี้กลับยากเพราะเปลี่ยน
รูปของทุก record และความหมายของ `received_by`.

## Decision

**เพิ่ม lifecycle 2 สถานะใน `return_logs.status`:**

```
pending   = รอรับคืน   (requester/staff/admin กรอก + ส่ง)
received  = รับแล้ว     (staff/admin เท่านั้น กดยืนยัน → เติม received_by + received_at)
```

- **ไม่มีสถานะ `rejected`** — เฟสนี้เอาแค่ส่ง→รับ. ถ้าคำขอไม่ถูกต้อง คลังแก้ (updateReturnLog)
  หรือลบ (deleteReturnLog admin) ตามกลไกเดิม.
- **การยืนยันรับคืนจำกัด `staff`/`admin`** (ปุ่ม "ยืนยันรับคืน" ในหน้าประวัติ) — สอดคล้อง
  picking workflow ที่คลังเป็นผู้ปิดขั้นตอน. requester สร้างคำขอได้อย่างเดียว.
- **ช่อง `received_by` ถูกซ่อนตอนกรอก** — เติมอัตโนมัติเป็นชื่อ staff/admin ที่กดยืนยัน
  (ไม่ให้ผู้ส่งกรอกเองว่าใครรับ — กันข้อมูลเท็จ). `returned_by` ยังกรอกตอนสร้างคำขอ.
- **แถวเก่า (`status IS NULL`) = treat as `received`** ผ่าน default ใน code + query
  (`COALESCE`/OR-filter) — **ไม่ backfill DB** (แถวเก่าคือรายการที่จบไปแล้ว single-shot,
  ไม่ต้องแตะ historical). ตรงแนวเดียวกับ ADR-0003 ที่ไม่ backfill.
- **"รับแล้ว" ไม่แตะ `inventory.qty`** — คงหลัก append-only log ของ Return (CONTEXT.md
  §Return: "stock ไม่ถูกแก้อัตโนมัติจากการบันทึกคืน"). การยืนยันคือ *การรับมอบเชิงเอกสาร*
  ไม่ใช่ stock mutation.

audit action ใหม่: `confirm_return` (surface ใน notification bell + AuditLog ตามกฎ #12 —
sync 3 ที่: NOTIF_LABELS / NOTIFY_ACTIONS / ACTION_LABELS). `insert_return` เดิมยังคงอยู่
(= "ส่งคำขอคืน").

## Consequences

- Positive: มีการรับมอบ 2 ฝ่าย, ตามรอยได้ว่าใครส่ง/ใครรับ/เมื่อไร; requester มีส่วนร่วม
  โดยไม่ต้องรอ staff กรอกแทน; notification เตือนคลังเมื่อมีคำขอใหม่.
- Negative / trade-off: เพิ่ม 1 ขั้นตอน (คลังต้องกดยืนยัน) — คำขอที่ค้าง `pending`
  ต้องมีคนตาม. ยอมรับได้เพราะเป็นเจตนา (การรับมอบต้องมีคนรับจริง).
- แถวเก่าไม่มี timestamp การรับ (`received_at = null`) — UI ต้อง fallback ไม่โชว์เวลา
  สำหรับ legacy rows. ยอมรับได้.
- ไม่ปรับ stock อัตโนมัติ = ต้องปรับ inventory ด้วยมือ/ระบบอื่นตามเดิม (ไม่ใช่ regression —
  พฤติกรรมเดิมก็ไม่ปรับ). comment ใน `return_schema.sql` ที่เขียนว่า "stock เพิ่ม/ลด"
  เป็น stale (ไม่เคย implement) — ไม่แก้ในงานนี้ แต่ flag ไว้.

## Alternatives considered

- **3 สถานะ (เพิ่ม `rejected`)** — ครบขึ้นแต่ต้องมี UI ปฏิเสธ + เหตุผล + สถานะปลายทางที่
  requester เห็น. เกินความต้องการเฟสนี้. ปฏิเสธ — เพิ่มทีหลังได้ถ้าจำเป็น.
- **Backfill แถวเก่าเป็น `received` ใน DB** — ชัดกว่าใน SQL query แต่แตะ historical record
  โดยไม่จำเป็น (default ใน code ให้ผลเดียวกัน). ปฏิเสธ ตามแนว ADR-0003.
- **ให้ "รับแล้ว" ปรับ `inventory.qty` (ward_return เพิ่ม / vendor ลด)** — ตรงกับ comment
  เก่าใน schema แต่ขัด CONTEXT.md (Return = append-only) และเสี่ยงยอดเพี้ยนซ้อนกับระบบรับ/
  ตรวจนับ. ปฏิเสธ — เก็บ Return เป็น log บริสุทธิ์.
- **ให้ requester เลือก received_by เอง** — สะดวกน้อยกว่าและเปิดช่องกรอกเท็จว่าใครรับ.
  ปฏิเสธ — เติมจากคนกดยืนยันเท่านั้น.
