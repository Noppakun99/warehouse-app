# Database Schema

## Files — รันใน Supabase Dashboard > SQL Editor

| ไฟล์ | ครอบคลุม | สถานะ |
|------|----------|------|
| `supabase_schema.sql` | inventory, drug_details, upload_meta | ใช้งาน |
| `requisition_schema.sql` | requisitions, dispense_logs, receive_logs | ใช้งาน |
| `audit_schema.sql` | audit_logs | ใช้งาน |
| `auth_schema.sql` | app_users | ใช้งาน |
| `scan_invoice_migration.sql` | +10 columns ใน receive_logs + bucket invoice-images | ใช้งาน |
| `picking_workflow_migration.sql` | +columns สำหรับ picking workflow | ใช้งาน |
| `return_source_migration.sql` | +return_source ใน return_logs | ใช้งาน |
| `suspend_user_migration.sql` | +suspend_until ใน app_users | ใช้งาน |
| `ap_workflow_migration.sql` | +8 columns ใน receive_logs สำหรับ AP tracking (ap_stage, inspected_at/by, ap_batch_id, ap_sent/posted_at/by) | ใช้งาน |
| `ap_acknowledge_migration.sql` | +2 columns (acknowledged_at, acknowledged_by) สำหรับจัดซื้อกด "รับบิลแล้ว" | ใช้งาน |
| `audit_retention_policy.sql` | pg_cron job ลบ audit log เก่า | ใช้งาน |

RLS enabled with public read/write policies (internal app)

## Audit Log Retention

- ใช้ **pg_cron** extension รันทุกคืน 02:00 UTC (09:00 น. ไทย)
- Retention rules:
  - `login` → 90 วัน
  - `export_excel` → 180 วัน
  - action อื่น (import, return, requisition) → 2 ปี
- ถ้ามียาควบคุมพิเศษ → เปลี่ยนเป็น 3 ปี ตามระเบียบกระทรวงสาธารณสุข
- ตรวจสอบ job: `SELECT * FROM cron.job WHERE jobname = 'audit-log-retention';`

## receive_logs — Upload สองที่

มี 2 path ที่ upload เข้า `receive_logs` — **ทั้งสอง path ผ่าน db.js แล้ว ไม่มีการเรียก supabase ตรง**:

| ที่ | ไฟล์ | Flow |
|----|------|------|
| 1 | `App.jsx` | `handleReceiveFileUpload` → `importReceiveLogs(csvText, auth)` ใน db.js — csvText → parse + insert (ไม่มี preview) |
| 2 | `ReceiveLogApp.jsx` | `handleImport()` parse CSV เป็น preview rows + warnRows + ให้ user แก้ mapping → `insertReceiveRows(rows, auth)` |

**ความต่าง**: ReceiveLogApp มี preview + warnRows + mapping editor; App.jsx flow ตรงไป insert เลย — ทั้งคู่ใช้ `insertReceiveRows` ใน db.js เป็น insert layer ร่วมกัน

**โครงสร้าง COL_MAP**: ฟิลด์เหมือนกัน alias ต่างกันเล็กน้อย:
- `total_price_vat`: db.js ใช้ "มูลค่ารวมภาษี" / ReceiveLogApp ใช้ "ราคารวมภาษี (บาท)"
- `total_price_formula`: db.js ใช้ "มูลค่า/สูตร" / ReceiveLogApp ใช้ "ราคารวมภาษี (บาท)/สูตร"

**Optional refactor (ยังไม่ทำ)**: extract `csvRowsToReceiveDbRows(rawRows, mapping)` ใน db.js เพื่อใช้ร่วม 2 paths — benefit ต่ำ เพราะ flow ต่างกันชัด

## Excel Export — Column Order

### DispenseLogApp (`DISPENSE_EXCEL_COLS`)
วันที่เบิก | MainLog | DetailedLog | รหัส | ชนิด | รายการยา | หน่วย | ราคา/หน่วย | Lot Number | Exp | ชนิดรายการ | คงเหลือก่อนเบิก | ปริมาณ (ออก) | คงเหลือหลังจ่าย | หน่วยงานที่เบิก | หมายเหตุ

### RequisitionApp (`REQUISITION_EXCEL_COLS`)
ใช้คอลัมน์เดียวกับ DispenseLogApp เพื่อ paste-compatible — `exportReqExcel()` ทำ async lookup `receive_logs` เพื่อ auto-fill MainLog, DetailedLog, ชนิดรายการ ก่อน export
