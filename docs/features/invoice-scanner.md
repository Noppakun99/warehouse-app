# Invoice Scanner (AI Vision) — ระบบสแกนบิลยา

- file: `src/ReceiveLogApp.jsx` → component `ScanInvoice` — เข้าได้เฉพาะ role `staff` / `admin`
- tab: "สแกนบิล" ใน ReceiveLogApp header (ปุ่มซ้ายของ Import CSV)

## Edge Function

- file: `supabase/functions/scan-invoice/index.ts` — เรียก Claude Vision API
- ตั้ง secret: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`
- deploy: `supabase functions deploy scan-invoice`

## Migration

- `scan_invoice_migration.sql` — รันใน SQL Editor ก่อนใช้งาน
- เพิ่ม 10 columns ใน `receive_logs` + Storage bucket `invoice-images`

## db.js Functions

```js
scanInvoiceImage(base64, mimeType)         // invoke edge function
insertScannedBillRows(rows, auth)          // APPEND ONLY ไม่ DELETE (ต่างจาก insertReceiveRows)
uploadInvoiceImage(file, fileName)         // upload ไป bucket invoice-images
lookupDrugCodes(names)                     // จับคู่ drug_code อัตโนมัติจาก receive_logs เดิม
checkExistingBills(billNumbers)            // เช็คเลขบิลซ้ำก่อนบันทึก → map bill → {count,lastDate,suppliers}
                                           // key ระดับเลขบิล (ไม่ผูก supplier — ชื่อที่ AI อ่านสะกดต่างได้) ใช้เตือน ไม่ block
```

## พฤติกรรมสำคัญใน ScanInvoice (2026-07-19)

- **วันที่รับเข้า แก้ได้ต่อบิล** — `header.receive_date` (ISO, default วันนี้) ผ่าน `IsoDateInput` → สแกนบิลย้อนหลังไม่ทำ `receive_date` เพี้ยน (เดิม hardcode วันกดบันทึก)
- **เตือนบิลซ้ำ** — หลังสแกนเสร็จเรียก `checkExistingBills` → banner เหลืองบนการ์ดบิล (เตือนอย่างเดียว ไม่ block เพราะเลขบิลชนข้ามบริษัทได้ Rule #19)
- **ตรวจยอดท้ายบิล** — `Σ มูลค่ารายการ` (helper `effItemTotal` — logic เดียวกับตอน save เสมอ) เทียบ `รวมทั้งบิล` ที่ AI อ่าน; ต่างเกิน 1 บาท (เศษปัดรายแถว) → badge เหลือง "ตรวจเลขก่อนบันทึก"
- **รูปบิลดูย้อนหลังได้** — `fetchScannedBills` ดึง `scan_image_url` + ลิงก์ "รูป" ในประวัติรายบิล (`<a target="_blank">` — เปิดจาก LINE WebView ได้)
- **Upload รูปบีบก่อนเสมอ** — ผ่าน `compressImageFile` (~1600px jpeg) ก่อนเข้า Storage; เส้นทางส่ง AI บีบอยู่แล้วใน `toBase64`
- **Mobile < 768px** — ตาราง review 14 คอลัมน์กลายเป็น card ต่อรายการ (Rule #5); ปุ่ม tab บน title bar ใช้ `flex-wrap` ไม่ล้นจอ
- **Permission gate ตาม Rule #23** — tab ส่งบัญชี/สแกนบิล เปิดด้วย `isStaff OR auth.permissions.includes('receive-ap'/'receive-scan')` — requester ที่ถูก grant ใช้งานได้จริง (เดิม hard guard `isStaff` → หน้าว่าง); Import CSV ยัง staff-only
- **Validate วันที่ก่อนบันทึก** — `isValidDateText` (ว่าง/`-`/`วว/ดด/ปปปป` เท่านั้น) ใช้ทั้งไฮไลต์แดง (วันที่บิล/Exp/Mfg) และ block `handleSave` พร้อมข้อความระบุจุดผิด
- **สแกนหลายรูป** — chip สถานะรายรูป (รอคิว/กำลังอ่าน/เสร็จ/อ่านไม่ได้) + ปุ่ม "หยุดหลังรูปนี้" (เก็บผลรูปที่เสร็จแล้วไว้)
- **Confirm modal สไตล์ app** — แทน `window.confirm`/`alert` ทั้งลบบิลในประวัติ (error แสดงเป็น banner ใน panel) และ "สแกนใหม่" (เตือนก่อนทิ้งผลที่แก้ไว้)
- **หมายเหตุ refactor ค้าง** — `fetchScannedBills` และอีก ~15 จุดใน ReceiveLogApp.jsx เรียก `supabase` ตรงในไฟล์ (มี `fetchAllRows` local) — ผิดกฎ data-layer ควรย้ายเข้า db.js ทั้งชุดเป็นงานแยก อย่าย้ายทีละฟังก์ชัน

## New columns ใน receive_logs (scan-specific)

| column | type | คำอธิบาย |
|--------|------|---------|
| `gpu_code` | TEXT | รหัส GPU กรมบัญชีกลาง |
| `tpu_code` | TEXT | รหัส TPU |
| `ttmp_code` | TEXT | รหัส TTMP |
| `mfg_date` | TEXT | วันผลิต (dd/mm/yyyy) |
| `invoice_date` | DATE | วันที่ในบิล |
| `vat_percent` | NUMERIC | อัตรา VAT (0 หรือ 7) |
| `subtotal` | NUMERIC | มูลค่าก่อน VAT |
| `vat_amount` | NUMERIC | ภาษีมูลค่าเพิ่ม |
| `invoice_total` | NUMERIC | ยอดรวมทั้งบิล |
| `scan_image_url` | TEXT | URL รูปบิลต้นฉบับใน Storage |

## Do Not

- **อย่าใช้ `insertReceiveRows` สำหรับ scan** — มัน DELETE ALL ก่อน insert ทำลายข้อมูลเดิม
- **อย่า expose ANTHROPIC_API_KEY ใน frontend** — ต้องผ่าน Edge Function เท่านั้น
- `receive_status` ของแถวที่สแกน = `'สแกนบิล AI'` เพื่อแยกจาก CSV import
