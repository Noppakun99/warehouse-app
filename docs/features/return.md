# ReturnApp — ระบบคืนยา

## แท็บ "ตรวจสอบรายการ" (review) — staff/admin

ReturnApp มี 3 แท็บ: **บันทึกรายการ** (ทุก role) · **ตรวจสอบรายการ** (staff/admin เท่านั้น) · **ประวัติ** (ทุก role).
- **ตรวจสอบรายการ** = worklist แสดง**เฉพาะรายการรอตรวจ** (`status='pending'`) — staff เข้ามาเคลียร์งาน: คลิก→เปิด `ReturnDetail`→ตรวจรับ & เลือกผลการดำเนินการ. มี banner สีเหลืองอธิบาย + empty state "ไม่มีรายการรอตรวจสอบ".
- ทั้ง review + history ใช้ component `HistoryTab` เดียวกัน ต่างที่ prop `mode` (`review` บังคับ `status='pending'` ผ่าน `isReview`).
- **filter chips "ผลการดำเนินการ" ถูกลบออกจากประวัติ** (เดิมอยู่ใน history) — การกรอง pending ย้ายไป logic ของแท็บ review แทน. ประวัติแสดงทุกสถานะ (ตรวจสอบย้อนหลัง). `fetchReturnLogs` ยังรับ param `disposition` ไว้ (ไม่ได้ลบจาก db.js — เผื่อใช้ภายหลัง).

## หน้ารายละเอียดเต็มจอ (ReturnDetail)

ประวัติคืนยาใช้ pattern เดียวกับใบเบิก (`RequisitionDetail`): คลิกรายการในตาราง/card → เปิด **`ReturnDetail` เต็มจอ** (ไม่ใช่ expanded row/bottom sheet — ลบทิ้งแล้ว) แสดงข้อมูลครบ + ปุ่มดำเนินการในหน้าเดียว: **ตรวจรับ & ดำเนินการ** (staff, เฉพาะ pending) / พิมพ์ PDF / แก้ไข + ลบ (admin, confirm 2-click ใน `confirmDel` state).
- state `detailLog` ใน HistoryTab — `if (detailLog) return <ReturnDetail>` early-return (เหมือน `if (selected) return <RequisitionDetail>`)
- หลัง confirm/delete สำเร็จ → `setDetailLog(null)` กลับ list + `load()` เห็นผลใน list ทันที
- `DispositionModal`/`EditReturnModal` render ผ่าน prop `dispositionModal`/`editModal` (guard ด้วย `id === detailLog.id` กัน modal ค้างข้ามรายการ)
- คลิกแถว desktop / card mobile = `setDetailLog(l)` (เดิม toggle expanded / เปิด bottom sheet)

## Workflow ผลการดำเนินการ (Disposition) — ADR-0013

staff ตรวจรับคืนพร้อม**ตัดสินผลการดำเนินการในขั้นเดียว** — ปุ่ม "ตรวจรับ & ดำเนินการ" (เดิม "ยืนยันรับคืน") เปิด `DispositionModal` เลือก 1 ใน 4 ผล:

| `disposition` | ความหมาย | badge |
|---|---|---|
| `restock` | รับเข้าคลัง (ยาสภาพดี) | เขียว |
| `dispose` | ทำลาย/ตัดจำหน่าย (หมดอายุ/เสียหาย) | แดง |
| `to_vendor` | ส่งคืนบริษัท (recall/เปลี่ยน) | ฟ้า |
| `rejected` | ปฏิเสธการคืน (**บังคับระบุเหตุผล**) | เทา |

- **`confirmReturnReceived(id, receiver, auth, disposition, note)`** (db.js) — set `status='received'` + `disposition/disposition_note/disposition_at/disposition_by` พร้อมกัน. `disposition` optional (ไม่ส่ง = รับคืนเฉยๆ แบบเดิม). audit action `confirm_return` เดิม (disposition อยู่ใน `details`) — **ไม่สร้าง action ใหม่**.
- **ไม่แตะ `inventory.qty`** — `restock` = บันทึกผลอย่างเดียว ไม่บวก stock (กัน double-count กับ CSV import; ยาเข้าคลังจริงผ่าน import ปกติ). คงหลัก append-only.
- **`DISPOSITION_META` / `DISPOSITION_ORDER`** (ReturnApp.jsx) — label/icon/สี/desc. badge แสดง 3 ที่: ตาราง desktop (ใต้ status badge), mobile detail (แถบสี + หมายเหตุ), Excel export (คอลัมน์ "ผลการดำเนินการ" + "หมายเหตุการดำเนินการ" + "ผู้ดำเนินการ").
- **filter tab** ใน HistoryTab: ทั้งหมด / ยังไม่ตัดสิน (`disposition='none'` = null) / 4 ผล — `fetchReturnLogs({ disposition })`.
- **requester เห็นผลของตัวเอง**: ใช้ notification scope ADR-0010 (requester เห็น return แผนกตัวเอง) + badge disposition ในประวัติ — ไม่เพิ่ม query.
- **AuditLog**: case `confirm_return` โชว์ "ผล: <label> · (<หมายเหตุ>)" ผ่าน inline `DISP_LABEL` map.
- **migration**: `return_disposition_migration.sql` (รันแล้ว) — 4 column + index.

## Workflow ส่ง→รับ (Return Status) — ADR-0009

lifecycle 2 สถานะ (`return_logs.status`): `pending` (รอรับคืน) → `received` (รับแล้ว) — ดู [docs/adr/0009](../adr/0009-return-submit-confirm-workflow.md).

- **สร้างคำขอ (RecordTab)**: ทุก role กรอก → `insertReturnLog` set `status='pending'`, `received_by='-'` (ซ่อนช่องผู้รับคืนตอนกรอก). success banner = "ส่งคำขอคืนยาแล้ว — รอเจ้าหน้าที่คลังยืนยันรับคืน". audit `insert_return`.
- **ยืนยันรับคืน (HistoryTab)**: ปุ่ม "ยืนยันรับคืน" แสดงเฉพาะ `pending` + `isStaff` (staff/admin) → `confirmReturnReceived(id, receiverName, auth)` set `status='received'` + `received_by` (ชื่อคนกดยืนยัน) + `received_at`. audit `confirm_return`.
- **แถวเก่า (`status = null`)** → `returnStatus(log)` คืน `'received'` (ไม่ backfill). `fetchReturnLogs({status:'received'})` รวม null ด้วย OR-filter.
- **ไม่แตะ `inventory.qty`** — Return = append-only (CONTEXT.md §Return / [[สถานะคืนยา]]).
- **`returnStatus(log)`** helper + `STATUS_META` (label/icon/badge) ที่ต้นไฟล์ `ReturnApp.jsx`. badge แสดงในตาราง desktop (คอลัมน์ผู้คืน/รับ), mobile card (chip "รอรับคืน" เฉพาะ pending), mobile detail header. Excel เพิ่มคอลัมน์ "สถานะ".
- **Notification & Audit sync** (กฎ #12): `confirm_return` เพิ่มครบ 3 ที่ — `NOTIF_LABELS`+`notifMessage` (AppRoot), `NOTIFY_ACTIONS` (db.js), `ACTION_LABELS`+detail case+filter (AuditLogApp). `insert_return` label เปลี่ยนเป็น "ส่งคำขอคืนยา".
- **migration**: `return_status_migration.sql` (เพิ่ม `status` + `received_at` + index) — ต้องรันใน Supabase Dashboard ก่อน deploy.

## Return Type 2-Level Selection

### โครงสร้างประเภทการคืนยา
- **ระดับ 1 (return_source)**: derive อัตโนมัติจาก `department` — `'vendor'` ถ้าเลือก "บริษัทยา / Supplier", `'ward'` สำหรับหน่วยงานอื่น
- **ระดับ 2 (return_type → reason)**: สาเหตุ — `leftover`, `over_req`, `wrong_drug`, `damaged`, `expired`, `recall`, `vendor_return`
- สาเหตุที่แสดงในระดับ 2 กรองตาม source ที่ derive ได้ (เช่น `recall` ใช้ได้เฉพาะ `vendor`)
- `SOURCE_MAP` / `REASON_MAP` — lookup ชื่อ, badge color
- **ข้อมูลเก่า (Legacy)**: `return_source = null` → ใช้ `LEGACY_MAP` แสดง label เดิม (ward_return, damaged, expired_removal, vendor_return)

### UI — RecordTab Form
- **ระดับ 1**: `SearchableSelect` dropdown จาก `SOURCE_DEPARTMENTS` = `[...DEPARTMENTS, 'บริษัทยา / Supplier']`
  - เลือกแล้ว → set `form.department` + derive `form.return_source` ผ่าน `deptToSource()` + auto-select reason แรก
  - source ที่ derive ได้แสดงกลับเป็น badge ใต้ dropdown (โปร่งใส ไม่ derive เงียบ)
- **ระดับ 2**: `<select>` dropdown กรองตาม `form.return_source` — แสดงเฉพาะหลังเลือกหน่วยงานแล้ว
- **`deptToSource(dept)`**: map หน่วยงาน → source — `ER (ฉุกเฉิน)`→`er`, `OPD (ผู้ป่วยนอก)`→`opd`, `บริษัทยา / Supplier`→`vendor`, ที่เหลือ→`ward` (ดู [docs/adr/0003](../adr/0003-return-source-derived-from-department.md)) — ก่อนหน้านี้ derive แค่ ward/vendor ทำให้ filter tab er/opd นับ 0 เสมอ
- **Drug search + lot dropdown**: โหลดยาด้วย `fetchAllInventoryRows` (paginate กัน 1000-row limit) group lot ต่อชื่อยา — เลือกยา→โชว์ dropdown lot ที่มีในคลัง (lot · exp · คงเหลือ) → เลือก lot แล้ว exp เติมอัตโนมัติ; พิมพ์ lot เองได้ถ้าไม่มีในคลัง (`manualLot` state)
- **`insertReturnLog(log, auth)`**: ส่ง `auth` ครบ (audit log user_name ถูกต้อง ไม่ fallback `returned_by`)
- Validation: `department` + `return_type` required
- field `department` ใน DB = ชื่อหน่วยงานที่เลือกโดยตรง (เช่น "ER (ฉุกเฉิน)")

### DB Columns
- `return_logs.return_source TEXT` — เพิ่มด้วย `return_source_migration.sql` (รันแล้ว)
- `return_logs.return_type` — เดิมเก็บ legacy key, ใหม่เก็บ reason key
- `return_logs.department` — เดิมเก็บชื่อแผนก (ward เท่านั้น), ใหม่เก็บชื่อหน่วยงานทุกประเภท

### Helper Functions
- `getReturnBadge(log)` — คืน `{ badgeBg, badgeText, label }` รองรับทั้งใหม่/เก่า
- `getReturnLabel(log)` — แสดง "source · reason" (ใหม่) หรือ legacy label
- `getReturnShort(log)` — short label สำหรับ mobile card

### Filter Tabs (HistoryTab)
- Filter tabs ใช้ RETURN_SOURCES keys: ward, or, er, opd, vendor
- `countOf('ward')` นับทั้ง `return_source='ward'` และ legacy `return_type='ward_return'`
- `fetchReturnLogs` รับ `returnSource` (ใหม่) หรือ `returnType` (legacy)

### Label
- "เจ้าหน้าที่ผู้รับคืน / บันทึก" (ไม่ใช้คำว่า "เภสัชกร") — ทั้ง form และ print view

### Do Not (Return Type)
- อย่าใช้ `SOURCE_MAP[source].needsDept` — ถูกลบออกแล้ว ใช้ `form.department` required แทน
- อย่า hardcode `return_source = 'ward'` สำหรับหน่วยงานเฉพาะ — ใช้ `v === VENDOR_LABEL` เท่านั้น

## Admin Edit/Delete (HistoryTab)

- **ปุ่มแก้ไข/ลบ** แสดงเฉพาะ `auth.role === 'admin'` — staff/requester ไม่เห็น
- **Desktop**: ปุ่มอยู่ใน expanded row ต่อจากปุ่มพิมพ์ — ลบมี confirm 2 click (`deletingId` state)
- **Mobile**: ปุ่มอยู่ใน bottom sheet ต่อจากปุ่มพิมพ์ — grid 2 คอลัมน์ (แก้ไข / ลบ)
- **EditReturnModal**: แก้ไขได้ทุก field (return_date, return_type, drug_name, drug_code, drug_type, qty_returned, drug_unit, lot, exp, department, returned_by, received_by, note)
- **db.js functions**:
  - `deleteReturnLog(id, auth)` — ลบ + audit log `delete_return`
  - `updateReturnLog(id, fields, auth)` — update + audit log `update_return`

## Print View / PDF

- `printReturnLog(record)` — popup ด้วย `window.open()`, font Sarabun, Thai formatting
- ใช้ **Blob URL** (ดู [docs/patterns.md#print-mobile](../patterns.md)) — "export PDF" = print → "Save as PDF" ของ browser (ไม่มี PDF library, ไม่เพิ่ม bundle) ปุ่มในเอกสารชื่อ "พิมพ์ / บันทึก PDF"
- **Layout = definition-table** (`table.kv` label คอลัมน์กว้างคงที่ 150px) → label/value เรียงตรงกันทุกแถว + ชื่อยายาว wrap ในเซลล์ไม่ดันโครงสร้างพัง (เลิกใช้ `grid2`/`grid3` ที่ value ไม่ align)
- **`esc()`**: escape ค่าจากผู้ใช้ (drug_name/note/ชื่อ) กัน HTML พัง
- ปุ่มปริ้น 3 จุด (label "พิมพ์ / PDF"):
  1. **RecordTab**: success banner หลัง submit สำเร็จ (เก็บใน `lastSubmitted` state)
  2. **HistoryTab desktop**: ปุ่มใน expanded row
  3. **HistoryTab mobile**: ปุ่มใน bottom sheet
- **ช่องลายเซ็น**: 2 ช่อง (ผู้คืนยา / เจ้าหน้าที่ผู้รับคืน) — เส้นประเซ็น + ชื่อ pre-fill + ช่องวันที่ใต้แต่ละช่อง; ถ้าไม่มีชื่อแสดง `(........)` ให้เขียนมือ
- ชื่อที่แสดง: `returned_by` และ `received_by` (pre-fill จาก `auth.name` ตอนบันทึก)
