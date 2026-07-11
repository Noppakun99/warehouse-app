# 0010. กระดิ่งแจ้งเตือน scope requester ด้วย `details.req_department` (ไม่เพิ่ม DB column)

- **Status:** Accepted
- **Date:** 2026-07-10

## Context

กระดิ่งแจ้งเตือนในแอป (`NotificationBell`) เป็น derived read-only view เหนือ `audit_logs`
เดิมแสดงเฉพาะ **staff/admin** และอยู่แค่ใน header ของ Dashboard. ย้ายขึ้น `AppShell`
ให้แสดงทุกหน้า + เปิดให้ **requester** เห็นด้วย แต่ต้อง **scope เฉพาะแผนกตัวเอง**
(กันเห็น activity ข้ามแผนก = noise + info-leak).

ปัญหาข้อมูล: lifecycle event ฝั่ง staff (`picking_requisition` / `verify_requisition` /
`dispense_requisition` / `received_requisition`) บันทึก `audit_logs.department` =
**แผนกของ staff ที่กดทำ** ไม่ใช่แผนกที่เบิก. ถ้า scope requester ด้วยคอลัมน์ `department`
ตรงๆ requester จะ **ไม่เห็นใบเบิกตัวเองตอนถูกจัด/ตรวจ/จ่าย** — เห็นแค่ตอนตัวเอง submit
(เพราะ `submit_requisition` log แผนก requester ถูกอยู่แล้ว). taxonomy การ scope จึงพัง
สำหรับครึ่ง lifecycle.

ต้องตัดสินว่า "จะรู้แผนกต้นทางของใบเบิกจาก audit row ของ staff ได้อย่างไร" ซึ่งกำหนด
convention ที่ log site ในอนาคตต้องตาม และกลับยากถ้าเลือกผิด (ต้องแตะ audit call site อีก).

## Decision

**Stamp `details.req_department` (แผนกต้นทางของใบเบิก) ลง audit log ที่ 4 lifecycle site**
โดยอ่านจาก `requisitions.department` ของ row เดียวกันตอน `.update()` (ใช้
`.select('department, req_number').single()` ในคำสั่งเดิม — ไม่มี query เพิ่ม) แล้ว
scope requester ด้วย **OR สองเงื่อนไข**:

```
audit_logs.department = แผนกตัวเอง          (action ที่ requester ทำเอง: submit/edit/delete)
  OR
audit_logs.details->>req_department = แผนกตัวเอง  (lifecycle ที่ staff ทำ)
```

ผ่าน `fetchNotifications({ department })` (Supabase `.or()`); realtime subscription
ใน `NotificationBell` apply filter เดียวกันด้วย helper `matchesDept()`.

**ไม่เพิ่ม DB column** — ใช้ `details` jsonb เดิม. staff/admin เรียกแบบไม่มี scope =
global feed เหมือนเดิม.

## Consequences

- Positive: requester เห็นใบเบิกตัวเอง**ตลอด lifecycle** (submit → จัด → ตรวจ → จ่าย → รับ)
  โดยไม่เห็นของแผนกอื่น; ไม่ต้อง migration; `req_number` ที่ stamp เพิ่มยังทำให้ข้อความ
  แจ้งเตือนอ้างเลขใบเบิกได้สวยขึ้น (เดิม fallback เป็น `#id`).
- Negative / trade-off: ใบเบิกที่ staff จัด/จ่าย **ก่อน** deploy ไม่มี `req_department`
  ใน audit → requester เห็น lifecycle เฉพาะใบที่ดำเนินการ**หลัง** deploy (ใบเก่าที่ตัวเอง
  submit ยังเห็น). **ไม่ backfill** — ยอมรับได้เพราะ feed เป็นมุมมอง 7 วันล่าสุดอยู่แล้ว
  ข้อมูลเก่าหลุดกรอบเองใน 1 สัปดาห์.
- convention ใหม่: **ทุก log site ที่ mutate ใบเบิกในนามคนอื่น ต้อง stamp `req_department`**
  ไม่งั้น requester scope จะ miss. (คู่กับ Critical Rule #1 audit auth.)
- ข้อจำกัด `.or()`: ชื่อแผนกที่มี `,` หรืออักขระ PostgREST พิเศษจะทำ filter เพี้ยน —
  ชื่อแผนกไทยปัจจุบันเป็น string ธรรมดา ไม่มี comma จึงปลอดภัย; ถ้าอนาคตมีต้อง escape.

## Alternatives considered

- **เพิ่มคอลัมน์ `requisition_department` ใน `audit_logs`** — query ชัดสุด index ได้
  แต่ต้อง migration + แตะ schema เพื่อ field ที่ใช้เฉพาะ notification scope. ปฏิเสธ —
  `details` jsonb รองรับได้โดยไม่เพิ่ม surface.
- **ให้ requester เห็นแค่ action ที่ตัวเองทำ (submit/edit/delete)** ไม่เห็น lifecycle
  จาก staff — ง่ายสุด ไม่ต้อง stamp อะไร แต่ requester ไม่รู้ว่าใบเบิก "จ่ายแล้ว/พร้อมรับ"
  ซึ่งเป็นข้อมูลที่เขาอยากรู้ที่สุด. ปฏิเสธ.
- **Backfill ใบเก่าด้วย SQL** (join `requisitions` เติม `req_department` ย้อนหลัง) —
  ทำได้แต่ไม่คุ้ม เพราะ feed 7 วันจะ rotate ข้อมูลเก่าออกเองอยู่แล้ว. เลื่อนเป็น optional.
