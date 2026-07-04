# Picking Workflow — จัดยา → ตรวจนับ → จ่ายออก → รับยา

## Status Flow

```
pending → approved/partial/rejected → picking → ready → dispensed → received
```

## STATUS_CONFIG (8 สถานะ)

| status | label | badge color |
|--------|-------|------------|
| pending | รอดำเนินการ | amber |
| approved | อนุมัติแล้ว | green |
| partial | อนุมัติบางส่วน | orange |
| rejected | ไม่อนุมัติ | red |
| picking | กำลังจัดยา | purple |
| ready | รอตรวจนับ | indigo |
| dispensed | จ่ายยาแล้ว | blue |
| received | รับยาแล้ว | teal |

## db.js Functions

```js
fetchInventoryByCodes(codes)
//   ดึง inventory หลาย code (qty > 0), ไม่ sort — sort FEFO client-side ด้วย parseExp

startPickingRequisition(id, { pickerName, items }, auth)
//   approved → picking, บันทึก picked_lot/exp/qty ต่อ item

verifyRequisition(id, verifierName, auth)
//   picking → ready, บันทึก verifier_name

markRequisitionDispensed(id, auth)
//   ready → dispensed, บันทึก dispensed_at

confirmReceivedRequisition(id, receivedBy, auth)
//   dispensed → received, บันทึก received_at + received_by
```

## DB Columns (migration: `picking_workflow_migration.sql`)

- **requisitions**: `picker_name`, `picking_started_at`, `verifier_name`, `verified_at`, `dispensed_at`, `received_at`, `received_by`
- **requisition_items**: `picked_lot`, `picked_exp`, `picked_qty`

## StaffDashboard

- **Task Strip (4 card)**: รอดำเนินการ (red) / รออนุมัติ·จัด (amber) / กำลังจัด·ตรวจ (purple) / เสร็จสิ้นวันนี้ (emerald)

### Tabs (4 แท็บ)

| key | label | filter |
|-----|-------|--------|
| `pending` | รอดำเนินการ | status = pending |
| `approved` | รออนุมัติ/จัด | status = approved หรือ partial |
| `picking` | กำลังจัด/ตรวจ | status = picking หรือ ready |
| `all` | ประวัติ | ทุก status + dateFilter |

- 3 แท็บแรก (pending/approved/picking) ไม่กรองด้วย dateFilter — แสดงทุกรายการที่ค้างอยู่

### Card footer buttons ตาม status

- `pending` → "อนุมัติด่วน"
- `approved/partial` → "เริ่มจัดยา" → PickingModal
- `picking` → "ตรวจนับ" → VerifyModal
- `ready` → "จ่ายออก" (confirm 2 click ด้วย `dispatchingId` state)

- `dispatchingId` state: กด 1 = ปุ่มเปลี่ยนเป็น "ยืนยัน?", กด 2 = execute `markRequisitionDispensed`
- **Bulk action "อนุมัติที่เลือก"**: แสดงเฉพาะเมื่อ selected items มีอย่างน้อย 1 รายการที่ status = `pending` — ไม่แสดงถ้าเลือกแต่ dispensed/received
- **Date filter display**: ใช้ pattern overlay `span` + `opacity-0 input` เหมือน ThaiDateInput — แสดง DD/MM/YYYY แทน browser locale (MM/DD/YYYY)

## PickingModal

- โหลด inventory ด้วย `fetchInventoryByCodes` → sort FEFO client-side (parseExp)
- Auto-select lot แรก (FEFO) ให้ทุก item เมื่อโหลดเสร็จ
- Staff กรอกชื่อผู้จัดยา + เลือก Lot + กรอก picked_qty (default = approved_qty)
- ไม่แสดง item ที่ approved_qty = 0

## VerifyModal

- แสดง picked_lot, picked_exp, picked_qty ของแต่ละ item (readonly)
- แจ้งเตือน (orange) ถ้า verifier_name === picker_name — ไม่บล็อก
- Staff กรอกชื่อผู้ตรวจนับ → confirm → status: ready

## RequisitionHistory (ฝั่ง requester)

- สถานะ `dispensed` → ปุ่ม "ยืนยันรับยาแล้ว" ใน expanded section
- `received_by` = `info.name` (ชื่อผู้เบิกที่ login)
- แสดง picked_qty + picked_lot ใน item list ถ้ามีข้อมูล

## RequisitionDetail (หน้าดูรายละเอียด / อนุมัติ)

- **Search bar**: `DrugSearchBar` กรองรายการยาใน detail — แสดงเมื่อ `items.length > 3`
- `filteredItems` useMemo กรองจาก `items` ตาม `detailSearch`
- `detailDrugNames` useMemo สร้างจาก `items` (ไม่ query DB)
- การ render ใช้ `filteredItems.map` แต่ `updateItem` ใช้ `realIdx = items.findIndex(it => it.id === item.id)` — ป้องกัน approve ผิดตัว
- **Header buttons**: Excel (emerald `bg-emerald-500`) + พิมพ์ (white `bg-white text-[#1E90FF]`) — ไม่มีปุ่ม CSV แล้ว
- Excel ใน detail ใช้ `exportReqExcel([currentReq], auth)` เหมือน StaffDashboard

## RequisitionApp Other Features

### Edit Modal Search Bar
- edit modal แสดง `DrugSearchBar` กรองรายการยา เมื่อใบเบิกมีรายการ **> 4 รายการ**
- state `itemSearch` reset เป็น `''` ทุกครั้งที่เปิด `openEdit()`
- ปุ่ม −/+ ใช้ `realIdx` (index จาก `editDraft.items` ตัวจริง) ไม่ใช่ `idx` จาก filtered array

### History — Drug Search Bar
- `DrugSearchBar` กรองประวัติใบเบิกตามชื่อยา — แสดงเมื่อ `list.length > 0`
- `historyDrugNames` useMemo: ดึงชื่อยาทั้งหมดจาก `list[].requisition_items[].drug_name`
- `filteredList` useMemo: กรองใบเบิกที่มีอย่างน้อย 1 item ตรงกับ `drugSearch`
- state `drugSearch` แยกจาก `itemSearch` (ใช้ใน edit modal)

### DrugSearch — Pending Notification Banner
- `pendingCount` state โหลดจาก `requisitions` count โดย filter `department + requester_name + status='pending'`
- subscribe `postgres_changes` บน `requisitions` → อัพเดต real-time
- แสดง banner สีเหลืองด้านบน Hero Search Area เมื่อ `pendingCount > 0`
- คลิก banner → `onHistory()` ไปหน้าประวัติทันที

## Do Not (Picking Workflow)

- อย่าลืมรัน `picking_workflow_migration.sql` ใน Supabase Dashboard ก่อนใช้งาน
- `fetchInventoryByCodes` ไม่ sort DB — sort FEFO ด้วย parseExp client-side เสมอ
- `markRequisitionDispensed` ใช้กับ `ready` เท่านั้น ไม่ใช่ approved โดยตรง
- ไม่หักสต็อกอัตโนมัติ — ข้อมูล picked_qty ใช้ดาวน์โหลด Excel ตัดสต็อกแยกต่างหาก
- `exportCSV` function ยังอยู่ใน code แต่ไม่มีที่เรียกแล้ว — ห้ามนำกลับมาใช้ ให้ใช้ `exportReqExcel` แทนเสมอ

## ใบ lot คุม (Lot Control Sheet) — 2026-07-04

เอกสารคุมคลังแนวนอน 16 คอลัมน์ตามแบบรายงาน HosXP (นิยาม: CONTEXT.md §ใบ lot คุม) — ปุ่ม "ใบ lot คุม" ข้างปุ่มพิมพ์เดิมใน StaffDashboard card footer + RequisitionDetail header. ใบเบิกยาเดิม (`printReq`) ไม่เปลี่ยน.

- **`printLotControl(req, preopenedWin)`** (RequisitionApp.jsx) — เรียงแถวตามเส้นทางเดินหยิบ MainLog → DetailedLog (ไม่มีที่เก็บไปท้าย), ปี ค.ศ. ตามแบบ HosXP, `@page landscape`, ใช้ pattern `preopenedWin` กัน LINE WebView block เหมือน `printReq`. ใบที่ยังไม่จัดพิมพ์ได้ (FEFO preview) — มี label "(ประมาณการ FEFO — ยังไม่จัดยา)"
- **คงเหลือก่อนเบิก/หลังจ่าย** — helper `lotBeforeAfter` (แชร์กับ Excel export, Rule #6):
  1. ใบที่จัดหลังฟีเจอร์นี้: ใช้ snapshot `onhand` ใน `picked_allocation` (เก็บตอนกดยืนยันจัดยา — พิมพ์ซ้ำเมื่อไหร่ก็ตรง)
  2. ใบเก่า/ยังไม่จัด: อนุมานจาก qty สด — จ่ายแล้ว (`dispensed`/`received`) **และ**มี `import_inventory` (audit log) หลัง `dispensed_at` → หลังจ่าย = สด, ก่อน = สด + ออก; ไม่งั้น ก่อน = สด, หลัง = สด − ออก. เหตุผล: แอปไม่หัก `inventory.qty` เอง — ตัดใน HosXP แล้ว re-import
- **หมายเหตุอัตโนมัติ**: `มีXlot` (ทุกแถวของ item ที่คร่อม lot) · `ใกล้exp <countdown>` + ช่อง Exp พื้นแดง (เกณฑ์ `isNearExpiry` 16 เดือนเดิม) · `เบิก X จ่าย Y รอตรวจรับ` (จ่ายไม่ครบ + `receive_logs.receive_status` มี "รอ") · `เบิก X จ่าย Y ยาหมดรอของส่ง` (จ่ายไม่ครบ + สต็อกเหลือ 0 + ไม่มีรอตรวจรับ) · `เบิก X จ่าย Y ยาตัดออกจากบัญชี` (`inventory.receive_status` มี "ตัดออก") · `เปลี่ยนบริษัท` (`receive_logs.supplier_changed` ราย lot)
- **เคสจ่าย 0**: item ไม่มี allocation และไม่มี `picked_lot` → ปริมาณออก = **0** (ห้าม fallback เป็นยอดที่ขอ) + หมายเหตุบอกเหตุผล — ตรงกับ HosXP "เบิก 12 จ่าย 0 รอตรวจรับ". Excel export ใช้กติกาเดียวกัน (`_out/_before/_after`)
- **`staff_note`** (column ใหม่ใน `requisition_items` — `staff_note_migration.sql` ต้องรันใน Dashboard ก่อน) — หมายเหตุคลังรายรายการ กรอกใน PickingModal พร้อม chip วลีสำเร็จรูป `STAFF_NOTE_PRESETS` (จ่ายlotเก่าให้หมด / ตัดยอดยาเสพติด / รถกู้ชีพ / เบิกห้องยา) — แยกจาก `item_note` ของผู้เบิก (provenance คนละคน) ขึ้นทั้งใบ lot คุม + Excel
- **`fetchLastInventoryImportAt()`** (db.js) — คืน ISO string ของ audit log `import_inventory` ล่าสุด (null ถ้าไม่มี/error) — ใช้ตัดสินข้อ 2 ข้างบน
- **`computeReqAllocations`** เลิก filter `.gt('qty',0)` ที่ SQL (FEFO มี guard `packs > 0` ใน JS อยู่แล้ว) เพื่อเห็นแถว qty=0/ตัดออก สำหรับ status map + คืน `pendingCodes/discontinuedCodes/supplierChangedLots` เพิ่ม

## ใบปะหน้า "ใบเบิกเวชภัณฑ์ยา" (ฟอร์มราชการ) — 2026-07-04

**`printCoverForm(req, preopenedWin)`** (RequisitionApp.jsx) — replica ฟอร์มกระดาษของ รพ. (A4 แนวตั้ง) พิมพ์แทนเขียนมือ: หัวฟอร์ม (เลขที่เบิก = `req_number`, วันที่ไทยย่อ, ข้าพเจ้า/หน่วยงาน prefill) + ตารางระดับรายการยา (ลำดับ/รายการ/หน่วยนับ/คงเหลือก่อนจ่าย/จำนวนที่เบิก/จำนวนที่จ่าย/คงเหลือหลังจ่าย) + สายลายเซ็น 5 บล็อก (ผู้เขียนคำขอ, ผู้จ่ายยาและลงทะเบียน, ผู้รับยา, ผู้เบิก/หัวหน้ากลุ่มงาน, ผู้อนุมัติเบิกจ่าย)

- **ตาราง**: ≤12 รายการพิมพ์ inline (pad แถวว่างขั้นต่ำ 7); เกิน 12 → แถวเดียว "ตามเอกสารแนบท้าย จำนวน N รายการ" ตามธรรมเนียมฟอร์ม. คงเหลือก่อนจ่าย = ระดับรหัสยา (`onHandByCode` + กติกา import-aware เดียวกับใบ lot คุม); **จำนวนที่จ่าย/คงเหลือหลังจ่าย เว้นว่างจนกว่าจะจัดยาแล้ว** (ให้คลังเขียนได้ตาม workflow กระดาษ)
- **ข้อความ pre-printed** (ชื่อ รพ., ชื่อ/ตำแหน่งเจ้าหน้าที่คลัง+หัวหน้าหน่วยพัสดุยา, ตำแหน่งหัวหน้ากลุ่มงาน) อยู่ใน const `COVER_FORM` ต้นไฟล์ — เปลี่ยนผู้รับผิดชอบแก้จุดเดียว
- **ปุ่ม "ใบปะหน้า"** (ไอคอน FileText สี indigo) 3 จุด: แถวประวัติผู้เบิก + card footer StaffDashboard + header RequisitionDetail — ใช้ pattern `preopenedWin` กัน WebView block เหมือน print อื่น
