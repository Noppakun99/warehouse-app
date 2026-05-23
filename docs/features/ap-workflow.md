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
- ⚠️ **บังคับ flow ack → inspect** — Mark ตรวจรับแล้วได้เฉพาะบิลที่ `acknowledged_at NOT NULL` (ต้องผ่าน ack ก่อน) — ปุ่ม "Mark ตรวจรับแล้ว" disabled ถ้าเลือกแต่บิล unack + db.js `markBillsInspected` มี filter `.is('ap_stage', null).not('acknowledged_at', 'is', null)`

## Migration files
- `ap_workflow_migration.sql` — 8 columns (ap_stage, inspected_*, ap_batch_id, ap_sent_*, ap_posted_*)
- `ap_acknowledge_migration.sql` — 2 columns เพิ่ม (acknowledged_at, acknowledged_by) + index

## Workflow ผู้รับผิดชอบ (5 ขั้นจริง → 3 stage ในระบบ)

| ขั้นจริงในงาน | บทบาท | ระบบ track |
|---------------|--------|-----------|
| 1. คลังรับบิล + บันทึก receive_logs | staff คลัง | Import CSV / สแกนบิล |
| 2. จัดซื้อทำใบตรวจรับ (eGP) | จนท.จัดซื้อ | นอกระบบ (ทำใน eGP) |
| 3. กรรมการมาตรวจของ + เซ็น | กรรมการตรวจรับ | Mark ตรวจรับแล้ว (`inspected_by`) |
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

### แจ้งเตือน auto-dismiss
- success (เขียว) → 3 วินาที
- error (แดง) → 5 วินาที

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

### Pending Tab — UX
- กรอกชื่อกรรมการตรวจรับ (text input — ไม่มี role แยก)
- เลือกบิลด้วย checkbox (multi-select)
- 2 ปุ่ม: "Mark ตรวจรับแล้ว" (ใช้กับ `null` rows) / "Export & ส่งบัญชี" (ใช้กับ `inspected` rows)
- ปุ่มเปิด/ปิดเองตาม selection (ปุ่ม disabled ถ้า selected ไม่มี state ตรง)

### Sent Tab — UX
- Group by `ap_batch_id` → 1 batch = 1 ตาราง
- ปุ่ม "Mark all posted in batch" (กดทีเดียวทั้ง batch) + checkbox ทีละบิล (กด selection แล้วกด Mark posted)
- แสดง "วันค้าง (จาก sent)" — แดงถ้า > 7 วัน

### History Tab — UX
- รายการ batch ทั้งหมด เรียง batch_id desc (ใหม่สุดอยู่บน)
- แสดง `posted_count/bill_count` — เขียวถ้าครบ
- ปุ่ม "ดาวน์โหลดซ้ำ" → re-generate Excel เดิม

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
  - **Signature row (3 ช่อง)**: กรรมการตรวจรับ / ผู้ส่ง (จัดซื้อ) / ผู้รับ (บัญชี)
- **กรรมการตรวจรับ** ใช้ `meta.inspectorNames` (array — distinct จาก `inspected_by` ของบิลใน batch) แสดงรวมกันด้วย `,`
- มูลค่า: `total_price_vat > 0 ? total_price_vat : qty × price_per_unit`
- วันที่: DD/MM/YYYY (พ.ศ.) ทั่วหน้า

### Excel export (legacy)
- ฟังก์ชัน `exportApBatchExcel` ใน `src/lib/exportExcel.js` ยังอยู่ — แต่ **ไม่ถูกเรียกแล้ว**
- เก็บไว้เผื่อ user ขอ revert กลับ ไม่ต้องลบ

## db.js Functions

```js
fetchApBills({ stage, dateFrom, dateTo, batchId })   // stage: null|'unack'|'acked'|'pending_inspect'|'inspected'|'sent_batch'|'posted'|'unposted'|'pending_all'
groupRowsByBill(rows)                                 // → [{ bill_number, supplier, receive_date, items, item_count, drug_count, total_value, ap_stage, acknowledged_at, acknowledged_by, ... }]
markBillsAcknowledged(billNumbers, purchaserName, auth) // จัดซื้อกด "รับบิล" — ไม่เปลี่ยน ap_stage, ตั้ง acknowledged_at/by
unmarkBillsAcknowledged(billNumbers, auth)            // rollback ack → null
markBillsInspected(billNumbers, inspectorName, auth)
markBillsSentBatch(billNumbers, batchId, auth, senderName?)   // senderName = ชื่อ จนท.จัดซื้อ (override → ap_sent_by)
markBillsPosted(billNumbers, auth, posterName?)               // posterName = ชื่อ จนท.บัญชี (override → ap_posted_by)
unmarkBillsInspected(billNumbers, auth)               // rollback inspected → null
unmarkBillsSentBatch(billNumbers, auth)               // rollback sent_batch → inspected (ออกจาก batch)
unmarkBillsPosted(billNumbers, auth)                  // rollback posted → sent_batch
resetApBatch(batchId, auth)                            // reset ทั้ง batch — ทุกบิลกลับเป็น inspected, batch หาย
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

## Roadmap (Phase 1.5+)

- Mobile card layout สำหรับ 3 sub-tabs (ตอนนี้ใช้ overflow-x table)
- Audit checklist ก่อน export: ตรวจ qty < 0, duplicate lot+bill, total tie
- Month-end "ยอดคงคลัง" Excel (15 columns) — แยก Phase 1B ใหญ่
- Role `purchasing` / `accounting` แยก (Phase 2)
- Email notification ผู้บริหารเมื่อ "ค้าง > 7 วัน"
