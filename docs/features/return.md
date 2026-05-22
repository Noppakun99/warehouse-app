# ReturnApp — ระบบคืนยา

## Return Type 2-Level Selection

### โครงสร้างประเภทการคืนยา
- **ระดับ 1 (return_source)**: derive อัตโนมัติจาก `department` — `'vendor'` ถ้าเลือก "บริษัทยา / Supplier", `'ward'` สำหรับหน่วยงานอื่น
- **ระดับ 2 (return_type → reason)**: สาเหตุ — `leftover`, `over_req`, `wrong_drug`, `damaged`, `expired`, `recall`, `vendor_return`
- สาเหตุที่แสดงในระดับ 2 กรองตาม source ที่ derive ได้ (เช่น `recall` ใช้ได้เฉพาะ `vendor`)
- `SOURCE_MAP` / `REASON_MAP` — lookup ชื่อ, badge color
- **ข้อมูลเก่า (Legacy)**: `return_source = null` → ใช้ `LEGACY_MAP` แสดง label เดิม (ward_return, damaged, expired_removal, vendor_return)

### UI — RecordTab Form
- **ระดับ 1**: `SearchableSelect` dropdown จาก `SOURCE_DEPARTMENTS` = `[...DEPARTMENTS, 'บริษัทยา / Supplier']`
  - เลือกแล้ว → set `form.department` + derive `form.return_source` + auto-select reason แรก
  - `VENDOR_LABEL = 'บริษัทยา / Supplier'` — ตรวจด้วย `v === VENDOR_LABEL`
- **ระดับ 2**: `<select>` dropdown กรองตาม `form.return_source` — แสดงเฉพาะหลังเลือกหน่วยงานแล้ว
- Validation: `department` required เสมอ (ไม่ใช้ needsDept อีกต่อไป)
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

## Print View

- `printReturnLog(record)` — popup ด้วย `window.open()`, font Sarabun, Thai formatting
- ใช้ **Blob URL** (ดู [docs/patterns.md#print-mobile](../patterns.md))
- ปุ่มปริ้น 2 จุด:
  1. **RecordTab**: success banner หลัง submit สำเร็จ (เก็บใน `lastSubmitted` state)
  2. **HistoryTab**: ปุ่ม "พิมพ์" ใน expanded row
- **ช่องลายเซ็น**: 2 ช่อง (ผู้คืนยา / ผู้รับยา) — มีบรรทัดเซ็น + ช่องวันที่ใต้แต่ละช่อง
- Label ใช้แค่ "ผู้คืนยา" และ "ผู้รับยา" (ไม่ใช้คำว่าเภสัชกร)
- ชื่อที่แสดง: `returned_by` และ `received_by` (pre-fill จาก `auth.name` ตอนบันทึก)
