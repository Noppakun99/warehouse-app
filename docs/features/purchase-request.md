# แจ้งซื้อแล้ว (purchase_request)

สถานะ: เสร็จ 14/11/2569 — ยังไม่ push · ตัดสินใจ [ADR-0030](../adr/0030-purchase-request-from-excel-report.md) · นิยาม [CONTEXT.md §รายงานแจ้งการสั่งซื้อยา](../../CONTEXT.md)

## ทางไหลของข้อมูล

```
รายงานการซื้อยา_69.xlsx ──npm run import:purchase──▶ purchase_request (แทนทั้งชุด)
   ชีท รายงานซื้อยา (☐ รอ · ☑ มาส่งแล้ว)                        │
   ประวัติแจ้งซื้อ (☑ มาส่งแล้ว · ☐ ยกเลิก)                             ▼
receive_logs (การซื้อ, วันรับ ≥ วันที่แจ้ง) ──requestState──▶ รอ N วัน / มาส่ง dd/mm / ยกเลิก
```

| ส่วน | ที่ |
|---|---|
| ตัวอ่านชีท + สถานะสด (pure) | `src/lib/purchaseReportSheet.js` · test `npm run test:purchase` (56) |
| CLI | `scripts/import-purchase.mjs` — `npm run import:purchase [-- --commit] [--file "<path>"]` (path default เป็นของเครื่องคลัง) |
| DB | `purchase_request_migration.sql` · `replacePurchaseRequests` (DELETE ALL → INSERT · audit `import_purchase_request`) · `fetchPurchaseRequests` (paginate + บิลซื้อตั้งแต่วันแจ้งเก่าสุด) · `fetchDrugProfile` คืน `purchaseRequest` |
| จำนวนที่แจ้ง + เรท ณ วันแจ้ง (25/11/2569 · ADR-0030 amendment) | `qty_requested` (V) · `rate_per_month` (N) · แท็บ: คอลัมน์ "แจ้งซื้อ · เรท ตอนแจ้ง" + การ์ดมือถือ (`PrQtyRate`) · โมดอลหน้าหลัก รอของ/ไฟล์ยังไม่ย้าย: คอลัมน์ `PR_SNAPSHOT_COLS` (ซ่อนเมื่อไม่มีค่า = ผู้เบิก) + กางบิลที่รับเข้าขึ้นบรรทัด "แจ้งซื้อ … จำนวน … · เรทตอนแจ้ง" · `fmtReportNum` ทศนิยม ≤ 2 · CLI เตือน จำนวน × ราคา ≠ มูลค่า |
| UI | บัตรยา `PurchaseRequestNote` (staff มีปุ่ม "ดูใบแจ้งซื้อ ›" → `onOpenHistory('reorder-purchase', code)` → ReorderApp `initialPurchaseQuery` → แท็บแจ้งซื้อแล้ว ตัวกรอง "ทั้งหมด" + ค้นรหัสนั้น · อ่านครั้งเดียวแล้วล้าง — 26/11/2569) · ReorderApp `PendingPill` ในตารางวิเคราะห์ + แท็บ `PurchaseRequestTab` (เปิดได้โดยไม่ต้องรันวิเคราะห์ · หน้า `reorder-purchase` เปิดแท็บนี้ตรง) |
| Dashboard (14/11/2569) | `summarizePurchaseStatus` (pure — นับแบบเดียวกับแท็บ: รอของ 1 แถวต่อรหัส · ไฟล์ยังไม่ย้าย = ใบ Excel "รอ" ที่บิลเข้าแล้ว) → คิวงาน 2 แถว `purchaseNotMoved` (ส้ม · งานคลัง) + `purchaseWaiting` (เทา informational · ไม่นับเรื่องค้าง) · การ์ด "แจ้งซื้อแล้ว รอของ" ในภาพรวม (ทุก role) · ป้าย "แจ้งซื้อแล้ว x วัน" ใน Top 5 + โมดอลยาหมดสต็อก · โมดอล `PurchaseQueueModal` มีช่องค้น · **ผู้เบิกไม่เห็นหมายเหตุ** (AppRoot ล้าง `note` ก่อนส่ง) และไม่มีปุ่มไปหน้าคลัง |
| กางบิลที่รับเข้า (14/11/2569) | โมดอล "ของมาแล้วแต่ไฟล์ยังไม่ย้าย" กด > ที่แถว → `fetchPurchaseArrivals(code, since)` (db.js — บิลซื้อใน `receive_logs` ตั้งแต่วันที่แจ้ง = เงื่อนไขเดียวกับ `arrivedOn`) โหลดตอนกาง แสดง วันรับ · บิล · PO · lot · จำนวน · มูลค่า · สถานะตรวจรับ · เฉพาะ key `purchaseNotMoved` |

## กฎอ่านไฟล์

- ชีทหลัก: หาแถวหัวที่มี `วันที่แจ้งสั่ง` + `รหัสHosxp` แล้ว **ตรวจตำแหน่งคอลัมน์** (B วันที่ · E รหัส · G ชื่อ · H หน่วย · R เหตุผล · X หมายเหตุ นับจากช่องติ๊ก A) — มีคนแทรกคอลัมน์ = หยุด ไม่อ่านผิดช่องเงียบ
- ประวัติแจ้งซื้อ ไม่มีหัว ข้อมูลเริ่มคอลัมน์ B → หาคอลัมน์ช่องติ๊กจากจำนวน ☑/☐ แล้วใช้ offset เดียวกับชีทหลัก · อ่าน grid บังคับเริ่ม A1 (ตาม `!ref` B3 เลขแถวจะเลื่อน)
- แถวไม่มีรหัส / อ่านวันที่ไม่ได้ = ข้าม + รายงานใน dry-run

## ผลนำเข้าครั้งแรก (14/11/2569)

709 แถว · 277 รหัส — ชีทหลัก 128 (รอ) · ประวัติแจ้งซื้อ 551 มาส่งแล้ว + 30 ยกเลิก · สถานะสด: รอของ 99 · Excel ยังรอแต่มีบิลเข้าแล้ว 29 · รหัสที่ไม่มีใน Master แล้ว 4 (นำเข้าตามปกติ)
