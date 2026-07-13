# ADR-0013: ผลการดำเนินการคืนยา (Disposition) หลัง staff ตรวจรับ

## สถานะ
Accepted — 2026-07-12

## บริบท
ระบบคืนยา (ADR-0009) มี lifecycle 2 สถานะ: `pending` (รอรับคืน) → `received` (รับแล้ว) — staff กด "ยืนยันรับคืน" แล้วจบ แต่ไม่บันทึกว่า **หลังรับคืนแล้วดำเนินการอย่างไร** (ยาที่คืนมาสภาพดี → รับเข้าคลัง? หมดอายุ → ทำลาย? recall → ส่งคืนบริษัท?).

ผู้ใช้ (admin/staff) ต้องการ workflow ตรวจสอบว่ารายการคืนที่ส่งมา **จะดำเนินการอย่างไรได้บ้าง** และให้ผู้ส่งคืน (requester) เห็นผลการตัดสินของตัวเองได้.

## การตัดสินใจ
เพิ่มฟิลด์ **`disposition`** (ผลการดำเนินการ) ที่ staff เลือก**ในขั้นเดียวกับการยืนยันรับคืน** — 4 ค่า:

| disposition | ความหมาย | badge |
|---|---|---|
| `restock` | รับเข้าคลัง (ยาสภาพดี) | เขียว |
| `dispose` | ทำลาย/ตัดจำหน่าย (หมดอายุ/เสียหาย) | แดง |
| `to_vendor` | ส่งคืนบริษัท (recall/เปลี่ยน) | ฟ้า |
| `rejected` | ปฏิเสธการคืน (บังคับระบุเหตุผล) | เทา |

**ขั้นเดียว ไม่ใช่ 2 ขั้น**: กด "ตรวจรับ & ดำเนินการ" → `DispositionModal` เลือกผล + หมายเหตุ → `confirmReturnReceived(id, receiver, auth, disposition, note)` set `status='received'` + 4 field disposition พร้อมกัน. ใช้ audit action `confirm_return` เดิม (disposition อยู่ใน `details`) — ไม่สร้าง action ใหม่ เพราะ notification/audit เดิมครอบคลุมแล้ว.

## เหตุผล — **ไม่แตะ `inventory.qty`**
`restock` = **บันทึกผลอย่างเดียว ไม่บวก stock อัตโนมัติ** — คงหลัก append-only เดิม (CONTEXT.md §Return). ยาเข้าคลังจริงต้องผ่าน import inventory ปกติ. เหตุผล:
- กัน **double-count** กับ CSV import (ถ้าบวก stock จาก 2 ทาง ยอดเพี้ยน)
- Return เป็น log ตรวจสอบได้ ไม่ใช่ movement transaction

## ผลกระทบ
- **DB**: `return_disposition_migration.sql` — `disposition/disposition_note/disposition_at/disposition_by` + index (รันแล้ว)
- **db.js**: `confirmReturnReceived` รับ param 4-5 (disposition, note); `fetchReturnLogs` รับ `disposition` filter (`'none'` = ยังไม่ตัดสิน)
- **ReturnApp**: `DISPOSITION_META` + `DispositionModal` + badge (desktop table/mobile sheet/detail) + Excel col (ผลการดำเนินการ/หมายเหตุ/ผู้ดำเนินการ) + filter tab
- **AuditLog**: case `confirm_return` โชว์ disposition label
- **requester เห็นผลของตัวเอง**: ใช้ notification scope ADR-0010 เดิม (requester เห็น return แผนกตัวเอง) + badge disposition ในประวัติ — ไม่เพิ่ม query

## ทางเลือกที่ปฏิเสธ
- **แยก 2 ขั้น (รับคืน → ตัดสินทีหลัง)**: เพิ่ม state `rejected` แยก — ซับซ้อนเกิน ผู้ใช้ต้องกด 2 รอบ
- **restock บวก inventory.qty อัตโนมัติ**: ผิดหลัก append-only + เสี่ยง double-count
- **แยกหน้าตรวจใหม่**: staff กรอกแทน+ตรวจในหน้าเดิมได้อยู่แล้ว ไม่ต้องแยก
