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
| `suspend_user_migration.sql` | +suspend_until ใน app_users | ใช้งาน (apply prod 2026-06-30 ผ่าน MCP `add_suspend_until_to_app_users` — ก่อนหน้านี้ไฟล์มีแต่ยังไม่ apply ทำให้ updateAppUser/ระงับบัญชี throw) |
| `ap_workflow_migration.sql` | +8 columns ใน receive_logs สำหรับ AP tracking (ap_stage, inspected_at/by, ap_batch_id, ap_sent/posted_at/by) | ใช้งาน |
| `ap_acknowledge_migration.sql` | +2 columns (acknowledged_at, acknowledged_by) สำหรับจัดซื้อกด "รับบิลแล้ว" | ใช้งาน |
| `audit_retention_policy.sql` | pg_cron job ลบ audit log เก่า | ใช้งาน |
| `stock_ledger_migration.sql` | ตาราง `stock_ledger` — ทะเบียนคงคลังรายเดือน (ADR-0007) | รอ deploy + seed |
| `stock_count_migration.sql` | ตาราง `stock_count_session` + `stock_count_item` — ตรวจนับคงคลัง (ADR-0008). ทั้งคู่มี `created_at TIMESTAMPTZ DEFAULT NOW()` (ใช้แสดง "นับเมื่อไหร่" — เวลาจริง). `stock_count_item.note` = หมายเหตุรายบรรทัด (per-lot) แยกจาก `stock_count_session.note` (หมายเหตุรอบ) | ใช้งาน |
| `reorder_orders_migration.sql` | ตาราง `reorder_orders` — สถานะ "สั่งแล้ว" ของ ReorderApp (ย้ายจาก localStorage → DB, sync ข้ามเครื่อง). 1 แถว = 1 รหัสยา; untick = ลบแถว | ใช้งาน (apply prod 2026-07-04 ผ่าน MCP + verify round-trip) |

> ⚠️ **"ใช้งาน" = ไฟล์ migration มีอยู่ ไม่ได้แปลว่า apply บน prod แล้วเสมอ** — ก่อนพึ่งคอลัมน์ใดให้ verify schema จริง (`information_schema.columns` ผ่าน MCP) โดยเฉพาะถ้าเจอ error `column "x" does not exist` ทั้งที่ doc บอก "ใช้งาน" (เคสจริง: `suspend_until` ข้างบน)

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

### `drug_swap_policy` เป็น merged column (สำคัญ)

`drug_swap_policy` ใน DB **ไม่ใช่** column ที่ map 1:1 จาก CSV — เป็นค่าที่ build ตอน import โดย:
```js
// db.js:286 และ ReceiveLogApp.jsx:800
const swapFromCsv = [getVal(row,'swap_condition'), getVal(row,'swap_items')].filter(Boolean).join(' | ') || null
```

**ผลที่ตามมา**:
- DB ไม่มี column `swap_condition` หรือ `swap_items` แยก — query ได้แค่ `drug_swap_policy`
- ค่าใน DB อยู่ format `"<swap_condition> | <swap_items>"` (อันไหนว่างจะถูก filter ออก)
- ถ้า user กรอก CSV col เดียว → DB ก็มีค่าเดียว (ไม่มี ` | `)
- การ debug: ถ้าค่าใน DB ขาด → กรอก CSV ต้นทางให้ครบ + re-import (ไม่ใช่ bug code)

### `_matchHeader()` fuzzy match — ระวัง false positive

[db.js:184-193](../src/lib/db.js#L184) ใช้ 2-pass: (1) exact match (2) `includes()` ถ้า alias ยาว ≥ 7 ตัวอักษร

ผลข้างเคียง: header ที่มีคำว่า "เปลี่ยน" อาจถูก map เป็น `supplier_changed` ทั้งที่ตั้งใจให้ไปคอลัมน์อื่น (เพราะ alias `'เปลี่ยน'` ยาว 7 ตัวพอดี + iteration order ของ COL_MAP เจอ supplier_changed ก่อน swap_condition/swap_items)

**กฎ**: เพิ่ม alias ใหม่ → ตรวจ overlap กับ alias อื่นที่อาจ contain คำเดียวกัน

## Excel Export — Column Order

**หลักการ**: export ให้ครอบ**ทุก field ที่ DB เก็บจริง** (ลำดับคอลัมน์อิงไฟล์ CSV ต้นทางใน `csvfile/` เพื่อ round-trip / re-import ได้) — **ไม่ recompute** คอลัมน์ derived/aggregate ที่ Excel ต้นทางคำนวณสด (เช่น มูลค่ารายเดือนใน master, ตัวคูณ SS ที่เป็น business input) เพราะจะได้เลขไม่ตรงต้นฉบับ + ไม่รวมคอลัมน์ helper (packsize/qty_base/_key). ไม่ export internal-only: id/created_at/updated_at + AP workflow metadata (`ap_*`, `inspect_meta`, `acknowledged_*`)

### DispenseLogApp (`DISPENSE_EXCEL_COLS`)
วันที่เบิก | MainLog | DetailedLog | รหัส | ชนิด | รายการยา | หน่วย | ราคา/หน่วย | Lot Number | Exp | **วันที่ใกล้exp** | ชนิดรายการ | คงเหลือก่อนเบิก | ปริมาณ (ออก) | คงเหลือหลังจ่าย | หน่วยงานที่เบิก | หมายเหตุ

### RequisitionApp (`REQUISITION_EXCEL_COLS`)
ใช้คอลัมน์เดียวกับ DispenseLogApp เพื่อ paste-compatible — `exportReqExcel()` ทำ async lookup `receive_logs` เพื่อ auto-fill MainLog, DetailedLog, ชนิดรายการ ก่อน export

### ReceiveLogApp (`RECEIVE_EXCEL_COLS`)
วันที่แจ้งสั่ง | รหัสยา | รูปแบบ | ชื่อยา | ประเภทการซื้อ | Lot | Exp | หมายเหตุหมดอายุ | เลขที่บิล | เลขที่ PO | จำนวนรับ | หน่วย | หน่วย/บิล | ราคา/หน่วย | ราคารวมภาษี (บาท) | วันที่รับ | ผลการพิจารณา | วันที่ตรวจรับ | ระยะตรวจรับ | บริษัท | บริษัทก่อนหน้า | เปลี่ยนบริษัท | leadtime | MainLog | DetailedLog | ชนิดรายการ | Safety Stock | หมายเหตุ | เงื่อนไขแลกเปลี่ยนยา

### App (แผนผังคลังยา — `INVENTORY_EXCEL_COLS`)
MainLog | ตำแหน่งจัดเก็บ | รหัสยา | ชนิด | รายการยา | หน่วย | Lot Number | Exp | ชนิดรายการ | คงเหลือ | เลขที่บิลซื้อ | สถานะรับยา | Safety Stock
— ตรงกับ `ยอดคลังยา_master_69.csv` เฉพาะ field ที่ `inventory` เก็บ (ไม่รวม 30+ คอลมูลค่ารายเดือนที่ master คำนวณสดใน Excel)

### ReorderApp (วิเคราะห์สั่งซื้อ — inline ใน `exportCsv`)
รหัส | ชนิด | ชื่อยา | VEN | หน่วยซื้อ | บริษัทล่าสุด | วันรับล่าสุด | **เบิก \<เดือน\>… (dynamic ตาม `months`)** | รวมทุกเดือน | Max | Avg/mo | Avg/d | คงเหลือ | คงอยู่ได้อีก | SS | ROP | คงเหลือ−ROP | Lead Time | ต้องซื้อ(หน่วยซื้อ) | ต้องซื้อ(เม็ด) | ราคา/หน่วยซื้อ | มูลค่า | สถานะ | หมดอายุ (วัน)
— คอลัมน์ `เบิก <เดือน>` สร้าง dynamic จาก prop `months` (= `monthsInRange` ตัด `excludedMonth`) index ตรงกับ `r.monthlyUsage`
