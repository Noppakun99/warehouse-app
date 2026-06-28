# AP Workflow — ติดตามตั้งหนี้รายอาทิตย์ (Weekly Batch)

แก้ปัญหา: ทำสรุปส่งบัญชีรายเดือน → บิลตกหล่น → จ่ายของไปแล้วแต่บัญชียังไม่รู้

หลักการ: ไม่บล็อกการเบิกจ่าย แต่ track ทุก stage มี audit trail + กดดันด้วย SLA dashboard alert

## Stage Flow

```
NULL + acknowledged_at IS NULL     → "รอจัดซื้อรับ"  (badge amber)
    ↓ markBillsAcknowledged (purchaserName) — optional, ไม่บล็อก flow
NULL + acknowledged_at NOT NULL    → "จัดซื้อรับแล้ว" (badge sky — derived state)
    ↓ markBillsInspected (inspectorName)
inspected                           → "รอส่งบัญชี"   (badge orange)
    ↓ printApBatch + markBillsSentBatch (senderName)
sent_batch                          → "ส่งแล้ว รอ post" (badge indigo)
    ↓ markBillsPosted (posterName)
posted                              → "ตั้งหนี้แล้ว"  (badge emerald)
```

- ทุก stage track ระดับ **bill_number** (1 บิลมีหลาย lot — update พร้อมกัน)
- `acknowledged_*` เป็น **2 fields แยก** ไม่ใช่ stage ใหม่ — กัน schema bloat
- ⚠️ **บังคับ flow ack → inspect** — ยืนยันตรวจรับได้เฉพาะบิลที่ `acknowledged_at NOT NULL` (ต้องผ่าน ack ก่อน) — ปุ่ม "ยืนยันตรวจรับ" disabled ถ้าเลือกแต่บิล unack + db.js `markBillsInspected` มี filter `.is('ap_stage', null).not('acknowledged_at', 'is', null)`

## ยืนยันตรวจรับ — บังคับ Checklist + รูปหลักฐาน (กัน "เซ็นโดยไม่ตรวจ")

กดปุ่ม "ยืนยันตรวจรับ (N)" → เปิด `InspectChecklistModal` (ใน [ReceiveLogApp.jsx](../../src/ReceiveLogApp.jsx)) — **บังคับ** ก่อนบันทึก:
- ☑️ ติ๊ก checklist **ครบทุกข้อ** (`INSPECT_CHECKLIST`: จำนวน/Exp/Lot/เอกสาร) — ปุ่มยืนยัน disabled ถ้าไม่ครบ
- 📷 แนบรูป **≥ 1 รูป** (ถ่ายกองยา/ใบตรวจ) — `<input capture="environment">` เปิดกล้องมือถือได้
- ช่องชื่อ "กรรมการตรวจรับ" (ไม่บังคับ — ว่าง = เซ็นเองบนกระดาษ)

หลังกดยืนยัน: `doMarkInspected` → **compress รูป** (`compressImageFile` ~1600px JPEG เหมือน ScanInvoice) → `uploadInvoiceImage` (bucket `invoice-images`) → `markBillsInspected(..., inspectMeta)`

**เก็บใน `receive_logs.inspect_meta` (jsonb)** — ทุกแถวในบิลใช้ก้อนเดียวกัน:
```json
{ "images": ["url..."], "checklist": { "qty": true, ... }, "inspector": "ชื่อ", "at": "ISO" }
```
- migration: `inspect_meta_migration.sql` (jsonb + GIN index) — รันใน Supabase Dashboard ก่อน deploy
- audit log `ap_mark_inspected` มี `image_count` ใน details

**Badge "ไม่มีรูปตรวจรับ"** (BillCard) — flag บิล stage inspected ขึ้นไปที่ไม่มีรูป **เฉพาะ** `inspected_at >= INSPECT_PHOTO_SINCE` (วัน feature live) — บิลเก่าก่อนหน้านั้น `inspect_meta=null` โดยธรรมชาติ ไม่ flag (กัน noise วันแรก deploy)

## Migration files
- `ap_workflow_migration.sql` — 8 columns (ap_stage, inspected_*, ap_batch_id, ap_sent_*, ap_posted_*)
- `ap_acknowledge_migration.sql` — 2 columns เพิ่ม (acknowledged_at, acknowledged_by) + index

## Workflow ผู้รับผิดชอบ (5 ขั้นจริง → 3 stage ในระบบ)

| ขั้นจริงในงาน | บทบาท | ระบบ track |
|---------------|--------|-----------|
| 1. คลังรับบิล + บันทึก receive_logs | staff คลัง | Import CSV / สแกนบิล |
| 2. จัดซื้อทำใบตรวจรับ (eGP) | จนท.จัดซื้อ | นอกระบบ (ทำใน eGP) |
| 3. กรรมการมาตรวจของ + เซ็น | กรรมการตรวจรับ | ยืนยันตรวจรับ — checklist + รูป (`inspected_by`, `inspect_meta`) |
| 4. จัดซื้อรวมส่งบัญชี | จนท.จัดซื้อ | Print & ส่งบัญชี (`ap_sent_by`) |
| 5. บัญชี post | จนท.บัญชี | Mark ตั้งหนี้แล้ว (`ap_posted_by`) |

**ทั้งหมด staff คลังกดให้** — กรอกชื่อผู้รับผิดชอบจริงในช่อง text (auto-save localStorage)

## ชื่อผู้รับผิดชอบ — ไม่ persist (ว่างทุกครั้งเปิดหน้า)

3 ช่อง state ภายใน `ApWorkflow` — ทุกครั้งเปิดหน้าให้กรอกใหม่ (ตาม user request):
- `inspector`  → ชื่อกรรมการตรวจรับ
- `purchaser`  → ชื่อ จนท.จัดซื้อ
- `accountant` → ชื่อ จนท.บัญชี

⚠️ **ห้าม persist ชื่อใน localStorage** — มี `useEffect` ล้าง `ap_inspector/ap_purchaser/ap_accountant` ออกจาก localStorage ตอน mount (กรณีเหลือจากเวอร์ชั่นเก่า)

### Validation — **ไม่บังคับกรอกชื่อทั้ง 3 ช่อง**
- ทุกปุ่ม Mark/Print **กดได้แม้ไม่กรอกชื่อ** — ถ้าว่าง field `*_by` ใน DB = NULL
- ใบนำส่งบัญชี (print) ช่องลายเซ็นจะเว้นว่าง → คนเซ็นเขียนชื่อ+เซ็นเอง บนกระดาษ
- ถ้ากรอกชื่อ → แสดงในใบนำส่ง + audit log บันทึก
- placeholder ทั้ง 3 ช่อง: `"ไม่กรอกก็ได้ — เซ็นเอง"`

### แจ้งเตือน — Toast Popup
- ใช้ `<ToastPopup>` component — `fixed top-4 left-1/2 -translate-x-1/2 z-[100]`
- success (เขียว) → 3 วินาที auto-dismiss
- error (แดง) → 5 วินาที
- error ที่มีคำว่า `'migration'` → 15 วินาที (ให้เวลาอ่าน + copy SQL)
- รองรับ `whitespace-pre-line` (ใช้ `\n` ขึ้นบรรทัดใหม่ในข้อความ)
- ปุ่ม X ปิดเองได้

### Auto-detect Missing Migration
- ใน `load()` + `handleAcknowledge` ตรวจ error message ที่มี `'acknowledged_at'` + `'does not exist'`
- ถ้าเจอ → แสดงข้อความช่วยเหลือ: `"⚠️ ยังไม่ได้รัน migration! ไป Supabase Dashboard → SQL Editor run ไฟล์: ap_acknowledge_migration.sql"`
- ป้องกัน user งงเมื่อยังไม่ได้รัน migration ใหม่

## Migration

- file: `ap_workflow_migration.sql` — รันใน Supabase Dashboard ก่อน deploy code
- เพิ่ม 8 columns ใน `receive_logs`: `ap_stage`, `inspected_at/by`, `ap_batch_id`, `ap_sent_at/by`, `ap_posted_at/by`
- เพิ่ม index: `ap_stage`, `ap_batch_id`, `bill_number`

## UI — Tab "ส่งบัญชี" ใน ReceiveLogApp

- เข้าได้เฉพาะ `staff` / `admin`
- 3 sub-tabs (state `subTab`: 'pending' | 'sent' | 'history'):

| Tab | เนื้อหา | Action |
|-----|--------|--------|
| `pending` | บิลรอตรวจรับ + รอส่งบัญชี (ap_stage IN null/inspected, ยังไม่อยู่ใน batch) | Mark ตรวจรับแล้ว / Print & ส่งบัญชี / Undo |
| `sent` | บิลที่ส่ง batch แล้วรอ post (group by `ap_batch_id`) | Mark ตั้งหนี้แล้ว (per-bill หรือ per-batch) / Undo |
| `history` | ประวัติ batch ทั้งหมด | พิมพ์ซ้ำ / Reset batch / Expand เพื่อดูบิลในแต่ละ batch |

### Filter ที่มีในแต่ละ tab
| Filter | pending | sent | history |
|--------|---------|------|---------|
| ค้นหาเลขบิล / บริษัท | ✅ | ✅ | — |
| Date range (วันรับของ) | ✅ | ✅ | — |
| Date range (วันที่ส่ง = batch_id) | — | — | ✅ |
| Stage pills (ทั้งหมด / รอจัดซื้อรับ / จัดซื้อรับแล้ว / รอส่งบัญชี) | ✅ | — | — |
| Sort header (เลขบิล/วันรับ/รายการยา/Lot/มูลค่า/วันค้าง) | ✅ | ✅ | — |

### Expand row (click bill / batch)
- **pending/sent tabs**: คลิกแถวบิล → expand `BillItemsDetail` (รายการ lot ทั้งหมดในบิล)
- **history tab**: คลิกแถว batch → expand `BatchBillsList` → คลิก bill ภายในอีกชั้น → expand `BillItemsDetail`
- ใช้ `React.Fragment` ครอบคู่ row (header + detail)
- `onClick={e => e.stopPropagation()}` ที่ checkbox + ปุ่ม action กัน expand toggle ผิด

### คอลัมน์ "การจัดการ" (Undo / Reset)
| จุด | ปุ่ม | function |
|----|------|----------|
| PendingTab (stage=acked) | ↶ (sky) | `unmarkBillsAcknowledged` → กลับเป็น "รอจัดซื้อรับ" |
| PendingTab (stage=inspected) | ↶ (amber) | `unmarkBillsInspected` → กลับเป็น NULL |
| SentTab (ทุก row) | ↶ (amber) | `unmarkBillsSentBatch` → ออกจาก batch กลับเป็น inspected |
| HistoryTab (ทุก batch) | ↶ Reset (amber) | `resetApBatch` → ทุกบิลใน batch กลับเป็น inspected + batch หาย |

ทุกการ undo มี `confirm()` dialog ก่อน execute

### Pending Tab — UX (ใหม่: BillCard layout, ไม่ใช่ table แล้ว)
- **Toolbar input row** — 3 ช่อง side-by-side (responsive 1/2/3 col):
  - `จนท.จัดซื้อ:` (text — placeholder "ไม่กรอกก็ได้ — เซ็นเอง")
  - `กรรมการตรวจรับ:` (text — placeholder เดียวกัน)
  - `ส่งคืนจัดซื้อ:` (date input — default = `todayIsoLocal()`)
- **Toolbar action row** — flow ซ้าย→ขวา + chevron คั่นกลาง:
  - 🔵 `Mark รับบิล (N)` — enabled เมื่อมี unack ใน selection
  - › 🟠 `Mark ตรวจรับแล้ว (N)` — enabled เฉพาะ acked ใน selection (บังคับ flow)
  - › 🟢 `Print & ส่งบัญชี (N)` — enabled เฉพาะ inspected
  - ขวาสุด: `↶ ย้อนกลับ (N)` (สีอ่อน white+amber, ขนาด text-xs) — bulk undo
- **SortToolbar** — pill buttons เรียง 6 columns (วันรับ/เลขบิล/รายการ/Lot/มูลค่า/วันค้าง) + "เลือกทั้งหมด" checkbox ขวาสุด
- **BillCard** — 3-row card แทน table (ดู BillCard section ด้านล่าง)

### Sent Tab — UX
- Group by `ap_batch_id` → 1 batch = card section
- ปุ่ม "Mark all posted in batch" (กดทีเดียวทั้ง batch) + ช่อง "จนท.บัญชี:" สำหรับใส่ชื่อ (optional)
- BillCard มี `sentTimestamp` prop → label "ค้างที่บัญชี X วัน" แทน "ระยะเวลารอ X วัน"

### History Tab — UX
- รายการ batch ทั้งหมด (table) เรียง batch_id desc
- แสดง `posted_count/bill_count` — เขียวถ้าครบ
- ปุ่ม "พิมพ์ซ้ำ" → re-generate print preview
- ปุ่ม "Reset" → `resetApBatch` (ทุกบิลกลับเป็น inspected)
- คลิกแถว batch → expand `BatchBillsList` (BillCard ของบิลใน batch — readonly, ไม่มี checkbox/undo)
- คลิกแถวบิลใน BatchBillsList → expand `BillItemsDetail` (รายการ lot)
- Filter: date range "วันที่ส่ง" (กรอง `batch_id`) + search "เลขบิล/บริษัท" (pre-fetch bills ของทุก batch + auto-expand เมื่อ match)

### BillCard — Layout (ใช้ทั้ง 3 tabs)
3 แถว visual:
```
[☐] [▼] เลขบิล [stage badge]                  จำนวนรายการยา N รายการ
        บริษัท · วันที่รับ: DD/MM/YYYY                          N lot
        [จัดซื้อรับ: DD/MM · ชื่อ] [ส่งคืนจัดซื้อ: DD/MM] [กรรมการ: ชื่อ] [วันค้าง]    มูลค่ารวม N,NNN บาท [↶]
```
- คลิก card → expand `BillItemsDetail`
- Checkbox + ปุ่ม action ต้องมี `onClick={e => e.stopPropagation()}` กัน expand toggle
- มูลค่า: integer (ไม่มีทศนิยม) — `toLocaleString('th-TH', { maximumFractionDigits: 0 })`
- วันค้าง: PendingTab = `today - receive_date`, SentTab = `today - ap_sent_at`
- inline ปุ่ม Acknowledge "รับบิล" (ฟ้า) เฉพาะ stage=NULL+unack
- inline ปุ่ม ↶ undo เฉพาะ stage=acked/inspected/sent_batch

## Filter ที่กรอง stage ตาม receive_status

- เฉพาะบิลที่ `receive_status = 'รอตรวจรับ'` เท่านั้น (และ `ap_stage = NULL`) ถึงจะแสดงใน "รอส่งบัญชี" tab
- บิลที่ `receive_status = '-'`, `'ตัดออกจากบัญชี'`, หรือค่าอื่น → **ไม่แสดง** (กรองใน `load` ของ ApWorkflow)
- บิลที่ `ap_stage = inspected` แล้ว → แสดงตลอด (อยู่ใน flow แล้ว)

## fetchApBills — default ไม่กรอง stage

⚠️ **`fetchApBills({ batchId })` ต้องไม่ default stage เป็น 'inspected'** เพราะจะกรอง batch ที่ post แล้วหายหมด
- Default `stage = null` → ไม่กรอง (ใช้ตอน fetch ดูข้อมูลใน batch ทุก stage)
- ระบุ stage ชัดเจนเมื่อต้องการกรอง: 'pending_inspect' / 'inspected' / 'sent_batch' / 'posted' / 'unposted' / 'pending_all'

## Print Preview — `printApBatch` (เปลี่ยนจาก Excel)

- file: `src/ReceiveLogApp.jsx` → function `printApBatch(rows, batchId, meta)`
- ใช้ **Blob URL + window.open** (pattern เดียวกับ printReturnLog — กัน iOS Safari white screen)
- ชื่อโรงพยาบาล: `HOSPITAL_NAME = 'โรงพยาบาลประชาธิปัตย์'` (constant ใน ReceiveLogApp.jsx)
- หน้าเดียว มี:
  - **Header**: ชื่อ รพ. + รหัสรอบส่ง + วันที่
  - **Meta grid**: วันที่/ช่วงวันรับ (label เปลี่ยนเป็น "วันที่รับของ" ถ้าวันเดียว), จำนวนบิล (หน่วย "บิล"), รายการ (lot), มูลค่ารวม
  - **Bills Summary table**: 1 row per bill — เลขบิล, บริษัท, วันรับ, lot, มูลค่า + SUM footer
  - **Item Detail table**: 1 row per lot — บิล, รหัส, ชื่อ, Lot, Exp, qty, ราคา, มูลค่า + SUM
  - **Signature row (2 ช่อง)**: กรรมการตรวจรับ / เจ้าหน้าที่จัดซื้อ
    - ไม่มีช่อง "ผู้รับ (บัญชี)" แล้ว — บัญชี post ในระบบของเขาเอง (HOSxP/SAP) ไม่ต้องเซ็นบนใบนี้
- **กรรมการตรวจรับ** ใช้ `meta.inspectorNames` (array — distinct จาก `inspected_by` ของบิลใน batch) แสดงรวมกันด้วย `,`
- มูลค่า: `total_price_vat > 0 ? total_price_vat : qty × price_per_unit`
- วันที่: DD/MM/YYYY (พ.ศ.) ทั่วหน้า

### Excel export (legacy)
- ฟังก์ชัน `exportApBatchExcel` ใน `src/lib/exportExcel.js` ยังอยู่ — แต่ **ไม่ถูกเรียกแล้ว**
- เก็บไว้เผื่อ user ขอ revert กลับ ไม่ต้องลบ

## db.js Functions

> **Bill identity = composite key** (สำคัญ): `bill_number` **ไม่ unique** — เลขซ้ำได้ทั้งคนละบริษัท (เช่น `IV6803645` = แอปคาร์ + บี.เอ็ล.ฮั้ว วันเดียวกัน) และบริษัทเดียวคนละวันรับ. `groupRowsByBill` จึง key ด้วย `billGroupKey(r)` = `bill_number|supplier_current|receive_date` (บิลไม่มีเลข/`'-'` → key ด้วย `id` แยกทุกแถว). ทุก AP action ระบุบิลด้วย **row `id`** (`.in('id', rowIds)`) ไม่ใช่ `bill_number` — group object จึงมี `_key` (composite, ใช้เป็น React key + selection Set) และ `item_ids` (row id ทุกแถวในบิล, ส่งเข้า action). ห้ามกลับไป match ด้วย `bill_number` เพราะจะ update บิลที่เลขชนกันพร้อมกัน.

```js
fetchApBills({ stage, dateFrom, dateTo, batchId })   // stage: null|'unack'|'acked'|'pending_inspect'|'inspected'|'sent_batch'|'posted'|'unposted'|'pending_all'
billGroupKey(r)                                       // → 'bill_number|supplier|receive_date' (หรือ '__nobill__<id>') — identity ของบิลจริง
groupRowsByBill(rows)                                 // → [{ _key, item_ids, bill_number, supplier, receive_date, items, item_count, drug_count, total_value, ap_stage, ... }]
markBillsAcknowledged(rowIds, billNumbers, purchaserName, auth) // billNumbers = เพื่อ audit log เท่านั้น; rowIds = filter จริง
unmarkBillsAcknowledged(rowIds, billNumbers, auth)   // rollback ack → null
markBillsInspected(rowIds, billNumbers, inspectorName, auth, returnDate?, inspectMeta?)  // returnDate (YYYY-MM-DD) → inspected_at (เที่ยงวันของวันนั้น); inspectMeta {images,checklist,inspector,at} → inspect_meta jsonb
markBillsSentBatch(rowIds, billNumbers, batchId, auth, senderName?)   // senderName = ชื่อ จนท.จัดซื้อ (override → ap_sent_by)
markBillsPosted(rowIds, billNumbers, auth, posterName?)               // posterName = ชื่อ จนท.บัญชี (override → ap_posted_by)
unmarkBillsInspected(rowIds, billNumbers, auth)       // rollback inspected → null
unmarkBillsSentBatch(rowIds, billNumbers, auth)       // rollback sent_batch → inspected (ออกจาก batch)
unmarkBillsPosted(rowIds, billNumbers, auth)          // rollback posted → sent_batch
resetApBatch(batchId, auth)                            // reset ทั้ง batch (ใช้ ap_batch_id — ไม่เกี่ยว bill identity)
fetchApBatches()                                       // → [{ batch_id, sent_at, sent_by, bill_count, posted_count, row_count, total_value }]
```

ทุก function เขียน audit log อัตโนมัติ: `ap_acknowledge`, `ap_unacknowledge`, `ap_mark_inspected`, `ap_send_batch`, `ap_mark_posted`, `ap_unpost`, `ap_uninspect`, `ap_unsend_batch`, `ap_reset_batch`, `print_ap_batch`

## StatsStrip Dashboard Card

- เพิ่ม card "รอตั้งหนี้" — แสดงจำนวนบิลที่ `ap_stage IN ('inspected', 'sent_batch')` (distinct bill_number)
- ถ้ามีบิลค้าง > 7 วัน → เปลี่ยน label เป็น "ค้าง > 7 วัน X บิล" + สีแดง
- คลิก → `onNavigate('receive-ap')` → เปิด ReceiveLogApp ด้วย `initialTab='ap'`
- query เฉพาะ `isStaff` เท่านั้น

## Deep Linking

- AppRoot รองรับ `page='receive-ap'` → render `<ReceiveLogApp initialTab="ap" />`
- ReceiveLogApp รับ prop `initialTab` (default `'view'`) ใช้เป็น initial state ของ `tab`

## Update SLA Rules

| ขั้น | SLA แนะนำ | Alert |
|-----|----------|-------|
| รับของ → ตรวจรับ | ≤ 3 วันทำการ | (manual) |
| ตรวจรับ → ส่งบัญชี | ≤ 2 วันทำการ | dashboard "ค้าง > 7 วัน" 🔴 |
| ส่งบัญชี → Post | ≤ 3 วันทำการ | sent_tab "วันค้าง (จาก sent) > 7" 🔴 |

## Do Not

- **อย่าใช้ `insertReceiveRows` กับ AP workflow** — มัน DELETE ALL ก่อน insert ทำลายข้อมูล ap_stage
- **อย่า update `ap_stage` ตรงๆ ใน component** — ต้องผ่าน `markBillsXxx` ใน db.js เพื่อให้ได้ audit log
- **อย่าใส่ `qty < 0` ใน export** — บัญชีจะปฏิเสธ (Phase 1.5 จะเพิ่ม audit checklist)
- **อย่ารวม bill เดียวกันไว้คน batch กัน** — `markBillsSentBatch` ใช้ filter `eq('ap_stage', 'inspected')` ป้องกันบิลที่ส่งแล้ว update ซ้ำ
- **อย่าให้ requester เข้า ap tab** — guard ด้วย `isStaff` ทั้งในปุ่ม header และ render check
- **อย่าใช้ `exportApBatchExcel` แทน `printApBatch`** — print preview ตรงกับ workflow ส่งบัญชีกระดาษมากกว่า
- **อย่าใช้ `<input type="date">` ตรงๆ ใน date filter** — ใน ApWorkflow ตอนนี้ใช้ native input ได้เพราะเป็น state ISO format; ถ้าจะแสดงเป็น พ.ศ. ต้องใช้ `IsoDateInput` (จาก docs/patterns.md)
- **อย่าใช้ `onClick={onHandler}` กับ handler ที่รับ optional arg** — React ส่ง click event เป็น arg แรก → handler คิดว่า event = billNumber → JSON.stringify เกิด "Converting circular structure" error เพราะ DOM element มี circular ref. ใช้ `onClick={() => onHandler()}` แทน
- **อย่าตั้ง default stage = `'inspected'` ใน fetchApBills** — เคยทำให้ batch ที่ posted แล้วหายจาก history. Default = `null` (ไม่กรอง)
- **อย่า persist ชื่อใน localStorage** — ทั้ง inspector/purchaser/accountant ต้องเริ่มว่างทุก session
- **อย่า skip ack** — markBillsInspected บังคับ filter `.not('acknowledged_at', 'is', null)` กัน UI bypass
- **อย่า upload รูปตรวจรับแบบดิบ** — ต้องผ่าน `compressImageFile` ก่อน (รูปกล้องมือถือ 3-8MB × หลายใบ × ทุกบิล = กิน storage + ช้าบนเน็ตคลัง)
- **อย่าลบ `INSPECT_PHOTO_SINCE` cutoff** — ถ้า badge "ไม่มีรูปตรวจรับ" flag ทุกบิล (รวมบิลเก่าก่อน feature) จะกลายเป็น noise → user ละเลย badge ทันที

## Stage Badge Colors

| Stage | Key | Badge bg | Badge text | Dot |
|-------|-----|----------|-----------|-----|
| `null` (รอจัดซื้อรับ) | `null` | bg-amber-100 | text-amber-700 | bg-amber-500 |
| `null` + ack (จัดซื้อรับแล้ว) | `acked` (derived) | bg-sky-100 | text-sky-700 | bg-sky-500 |
| `inspected` (รอส่งบัญชี) | `inspected` | bg-orange-100 | text-orange-700 | bg-orange-500 |
| `sent_batch` (ส่งแล้ว รอ post) | `sent_batch` | bg-indigo-100 | text-indigo-700 | bg-indigo-500 |
| `posted` (ตั้งหนี้แล้ว) | `posted` | bg-emerald-100 | text-emerald-700 | bg-emerald-500 |

`<StageBadge stage={stage} acknowledged={bill.acknowledged_at}/>` — รับ 2 props เพื่อ derive 'acked' state

## Roadmap (Phase 1.5+)

- Mobile card layout สำหรับ 3 sub-tabs (ตอนนี้ใช้ BillCard เป็น list — responsive ได้ แต่ยังไม่มี bottom sheet)
- Audit checklist ก่อน export: ตรวจ qty < 0, duplicate lot+bill, total tie
- Month-end "ยอดคงคลัง" Excel (15 columns) — แยก Phase 1B ใหญ่
- Role `purchasing` / `accounting` แยก (Phase 2)
- Email notification ผู้บริหารเมื่อ "ค้าง > 7 วัน"
- Dashboard sub-counter: "ค้างกับจัดซื้อ > 2 วัน" (เน้น stage NULL + unack)
