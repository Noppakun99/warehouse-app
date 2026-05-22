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
```

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
