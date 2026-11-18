# ใบแจ้งยืม / ใบแจ้งรับคืน (หน้ายืม-คืนยา · ตาราง `drug_loan_slip`)

เพิ่ม 10/11/2569 (commit a333608) · เอกสารนี้เขียนตามหลัง 18/11/2569 (`db.js` อ้างถึงแต่ไฟล์ยังไม่มี)

## ทำไมมีใบ ไม่เขียน `drug_loan` ตรง

ทะเบียน `รพ.ยืมยา` ใน `รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm` คือตัวจริง (Excel หลัก แอปรอง) — `import:loan` ทับค่าที่แอปเขียนเอง
ปุ่ม "บันทึกรับคืน" เดิมใส่ `return_date` = วันนี้ทันที ไม่มีฟอร์ม lot/exp/จำนวน ไม่มีใบให้เซ็น และ Excel ไม่รู้ (10/11/2569)
→ แอปออก**ใบ** สถานะ `pending` แทน แล้วให้ Claude ลง Excel · การนำเข้าทะเบียนปิดใบเอง

## วงจร

```
เจ้าหน้าที่กรอกใบในแอป (ของจริงที่ยืม/คืน: lot · exp · จำนวน · ผู้คืน) → พิมพ์ใบที่กรอกแล้ว → เซ็น
  → ถ่ายรูปใบเซ็น วาง OneDrive\เอกสารคลังยา_รอลง\ใบคืนยา\
  → check-complete ข้อ 12 ขึ้น "รอลง Excel #id"
  → Claude ลงทะเบียน รพ.ยืมยา (+ รับยา/Master เมื่อเขาคืนเรา/เรายืมเข้า · แถวเบิก เมื่อเราให้ยืม/เราคืนเขา) ตาม memory loan-slip-print
  → import:loan → reconcileLoanSlips ตั้งใบเป็น applied เอง
  → เก็บรูปเข้า Desktop\บิลยา_ตรวจรับ\ใบยืม-คืนยา_<เดือน>\ + _ดัชนีบิล.csv
```

- **ยังไม่มีอนุญาตถาวรให้ลงเอง** (ต่างจากใบย้ายที่เก็บ) — เจอ pending แจ้ง user ก่อน · `conflict` ถาม user ว่าทะเบียนหรือใบถูก
- รูปใบเซ็น**ไม่อัปโหลดเข้าแอป** (ตัดสิน 18/11/2569) — anon key อ่านได้ทั้งหมด (ADR-0016) รูปมีชื่อ/ลายเซ็นคนนอก · หลักฐานอยู่ที่โฟลเดอร์ + ดัชนีบิล

## ตาราง `drug_loan_slip` ([drug_loan_slip_migration.sql](../../drug_loan_slip_migration.sql) — apply แล้ว 10/11/2569)

| คอลัมน์ | ความหมาย |
|---|---|
| `kind` | `out` ใบแจ้งยืม · `return` ใบแจ้งรับคืน |
| `direction` | ทิศของการยืมเดิม `borrow`/`lend` (ชุดเดียวกับ `drug_loan`) |
| `ln` | out = เลข LN ที่แอปออก (unique) · return = LN ที่อ้างถึง · ว่าง = ใช้หนังสือของคู่สัญญา (`job.loanDoc`) |
| `job` | ข้อมูลใบเต็ม รูปแบบเดียวกับ job.json ของ `scripts/loan-slip.mjs` |
| `loan_ids` | return = `drug_loan.id` ที่คืน · out = เติมตอน applied |
| `status` | `pending` → `applied` / `conflict` / `cancelled` |

## การจับคู่ตอนนำเข้า (`reconcileSlips` ใน [loanSlip.js](../../src/lib/loanSlip.js))

- **ใบแจ้งยืม**: หาแถวทะเบียนด้วยเลขใบ (LN ของเรา หรือเลขหนังสือคู่สัญญา + วันที่ยืม เพราะเลขหนังสือซ้ำได้) · ไม่มี = pending · lot + จำนวนตรงครบ = applied · ไม่ตรง = conflict
- **ใบแจ้งรับคืน**: ทุกรายการมีวันคืนแล้ว = applied · คืนบางส่วนที่แยกแถว (qty อยู่ใน key นำเข้า → id ใหม่) นับว่าคืนถ้ามีแถวทิศ+คู่สัญญา+รหัส+lot+วันยืมตรงและลงวันคืนแล้ว · แถวเดิมหายไม่มีแถวแทน = conflict
- เรียกท้าย `importDrugLoans` (db.js) และใน `scripts/import-loan.mjs` แม้ไม่มีอะไรเปลี่ยน

## คำสั่ง

```bash
node scripts/loan-slip.mjs --open          # ใบที่ยังเปิด (pending/conflict) — อ่านอย่างเดียว
node scripts/loan-slip.mjs --open --json   # check-complete.py ข้อ 12 อ่าน
node scripts/loan-slip.mjs --next-ln       # เลข LN ถัดไป (ทะเบียน + ใบที่แอปออก)
npm run test:loanslip                      # golden test loanSlip.js
```

## audit / กระดิ่ง

`create_loan_slip` · `cancel_loan_slip` (กระดิ่ง 3 ที่ตาม Rule #12) · `reconcile_loan_slip` (AuditLog เท่านั้น)

## กับดัก

- แม่แบบใบ = [loanSlipFill.js](../../src/lib/loanSlipFill.js) ใช้ร่วมแอป + สคริปต์ — แก้ฟอร์มแล้วสคริปต์หยุดบอกจุดที่หา string ไม่เจอ
- lot ซ้ำหลายแถวใน inventory → รวมคงเหลือก่อนเช็คให้ยืมเกิน (`fetchLoanSlipDrug`)
- `loan_date` อยู่ใน unique key ของ `drug_loan` — ห้ามแก้วันยืมในทะเบียนหลังนำเข้า (จะได้แถวซ้ำ)
