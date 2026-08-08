# ระบบวิเคราะห์การสั่งซื้อยา (ReorderApp)

หน้านี้แทนระบบ "ระบบสั่งยา" (view='order') ของเดิมใน [App.jsx](../../src/App.jsx) — ออกแบบใหม่ทั้งหมดตาม Excel "วิเคราะห์สั่งซื้อ"

## ภาพรวม

```
ReorderApp.jsx (sub-app, page='reorder' ใน AppRoot)
├── ControlBar         ช่วงสถิติ · โหมด Normal/Refill · เดือนตัด · Lead Time default · ค้นหา
├── StatusStrip        6 สถานะ (clickable filter): หมดสต็อค/ใกล้หมดอายุ/สั่งเพิ่ม/เพียงพอ/สั่งเมื่อขอ/ตัดออก
├── Tab: ตารางวิเคราะห์   sortable + Excel export + mark ordered + edit master
├── Tab: ใบสั่งซื้อแยกบริษัท Card per supplier + print Blob URL + Excel export
├── Tab: เทียบกับ Excel   Reconcile — upload CSV วิเคราะห์สั่งซื้อ → เทียบ SS/ROP/สถานะ/จำนวนสั่ง (read-only, ADR-0001)
├── Tab: Verification    Run Golden tests (Atorvastatin reference) ใน browser
└── Tab: History         รายการ analysis_runs snapshot + ลบได้
```

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | บทบาท |
|---|---|
| [src/ReorderApp.jsx](../../src/ReorderApp.jsx) | UI หลัก (single file ~970 บรรทัด) |
| [src/lib/reorder.js](../../src/lib/reorder.js) | Pure logic — 8 steps ตาม spec §3 |
| [src/lib/reorder.test.js](../../src/lib/reorder.test.js) | Golden test (33 assertions, Atorvastatin reference) |
| [reorder_master_migration.sql](../../reorder_master_migration.sql) | DB migration |

## DB Schema

### `drug_reorder_config` (1 row ต่อ drug code)
| Field | Type | Default | Note |
|---|---|---|---|
| `code` | TEXT PK | — | รหัสยา HosXP |
| `name` | TEXT | NULL | ชื่อยา |
| `supplier` | TEXT | NULL | บริษัทผู้จำหน่าย |
| `risk_group` | TEXT | 'Normal' | Normal/Essential/Critical (×1.0/1.5/2.0) |
| `lead_time_days` | NUMERIC(6,2) | 15 | ระยะรอของ |
| `price_per_unit` | NUMERIC(12,4) | 0 | บาท/หน่วยรายงาน |
| `exclude_status` | TEXT | NULL | 'ตัดออก' / 'สั่งเมื่อขอ' (CHECK constraint) |
| `pack_size` | NUMERIC(10,2) | 1 | จำนวนหน่วยย่อย/แพ็ค |
| `updated_at` | TIMESTAMPTZ | NOW() | auto-update trigger |
| `updated_by` | TEXT | — | resolveAuditUserName |

### `analysis_runs` (snapshot ทุกรอบรันวิเคราะห์)
| Field | Type | Note |
|---|---|---|
| `id` | BIGSERIAL PK | — |
| `run_at`, `run_by` | TIMESTAMPTZ, TEXT | |
| `mode` | TEXT | 'normal' / 'refill' |
| `stats_from`, `stats_to` | DATE | ช่วงสถิติ |
| `excluded_month` | DATE | เดือนตัดออก (Refill mode) |
| `total_rows`, `reorder_rows`, `total_amount` | INT, NUMERIC | summary |
| `summary`, `results` | JSONB | byStatus + full rows |

## สูตรคำนวณ (spec §3, [src/lib/reorder.js](../../src/lib/reorder.js))

```
Step 3: Max = MAX(เดือนในช่วงคำนวณ)
        Avg/mo = SUM / months
        Avg/d  = Avg/mo / 30

Step 5: SS  = MAX(1, ROUND(Avg/d × 30 × ตัวคูณ))   ← ฐาน 30 วัน, ไม่มี cap (ตรง Excel)
        ROP = ROUND(SS + Avg/d × leadTime, 0)
        ตัวคูณ (VEN): V/Critical=2.0, E/Essential=1.5, N/Normal=1.0

Step 6: status priority (หยุดเมื่อตรง):
        1. exclude_status='ตัดออก'  → ตัดออก
        2. exclude_status='สั่งเมื่อขอ' → สั่งเมื่อขอ
        3. stock = 0                → หมดสต็อค
        4. nearestExpiry ≤ 180 วัน  → สั่งเพิ่ม ใกล้หมดอายุ
        5. stock ≤ ROP              → สั่งเพิ่ม
        6. else                     → คงคลังเพียงพอ

Step 7: ถ้า status ∈ {เพียงพอ, ตัดออก, สั่งเมื่อขอ}: V=0
        มิเช่นนั้น:
            target = MIN(Max×3, MAX(Avg/mo × 2.3, Max×2, ROP))   ← factor 2.3 คงที่ (ไม่มี Refill mode)
            V = target − stock
            ถ้า V ≤ 0: V = MAX(1, Max)       ← fallback (TODO Q3: ยืนยัน Max vs SS)
```

**Golden reference** — Acetaminophen syrup (จากรูป Excel จริง):
- Input: Avg/mo=337.5 (Avg/d=11.25), stock=900, LT=16, Essential
- Expected: SS=506, ROP=686, status=คงคลังเพียงพอ (stock 900 > ROP 686)
- อีกชุด: Atorvastatin 40mg — usage=[2833,1477,1960,2603], stock=4400, LT=15.5, Essential, ฿33.30
  → SS=3327, ROP=4473, V=1266, Amount=฿42,157.80

## Audit log actions

ใหม่ใน [AppRoot.jsx NOTIF_LABELS](../../src/AppRoot.jsx), [AuditLogApp ACTION_LABELS](../../src/AuditLogApp.jsx):

| Action | Trigger |
|---|---|
| `analysis_view` | รันวิเคราะห์ (auto-fire ครั้งแรก + กด Run) |
| `analysis_run` | บันทึก Snapshot |
| `delete_analysis_run` | ลบ snapshot ใน History tab |
| `update_reorder_config` | แก้ Master (popup) |
| `import_reorder_config` | Import Excel/CSV |
| `mark_ordered` / `unmark_ordered` | toggle checkbox สั่งแล้ว (localStorage) |
| `print_po` | พิมพ์ใบสั่งซื้อ Blob URL |
| `reconcile_excel` | อัปโหลด CSV วิเคราะห์สั่งซื้อ เทียบกับผลแอป (audit-only ไม่ขึ้น bell) |

## Permission

- `staff` + `admin` → ใช้ได้เต็ม (รัน + บันทึก + แก้ Master + Import)
- `requester` → ไม่เห็น (ไม่อยู่ใน `SYSTEM_ACCESS.requester`)
- Grant ได้ผ่าน `GRANTABLE_SYSTEMS.reorder` ใน [UserManagementApp.jsx](../../src/UserManagementApp.jsx)

## Run tests

```bash
npm run test:reorder    # 33 golden assertions — ต้องผ่าน 100%
```

หรือผ่าน UI: เปิดระบบ → tab "Verification" → กด "Run tests"

## หน่วยคำนวณ & แหล่งข้อมูล (Phase 1 — recompute-in-app, [ADR-0001](../adr/0001-reorder-recompute-vs-import.md))

วิเคราะห์ **ในหน่วยซื้อล่าสุด** (pack ของบิล "การซื้อ" ล่าสุดต่อรหัสยา) ไม่ใช่หน่วยย่อยสุด:

- **หน่วย/ราคา/บริษัท/วันรับ/Lead Time** ← `fetchLatestReceiptInfo()` ([db.js](../../src/lib/db.js)) — บิล `purchase_type='การซื้อ'` ราคา>0 ล่าสุด; LT = **เฉลี่ย** leadtime ของบิลการซื้อทุกใบ (ดู [[Lead Time]] ใน [CONTEXT.md](../../CONTEXT.md))
- **แปลงหน่วย**: stock + usage รวมเป็นเม็ด (`× parseUnitFactor(unit).factor` ต่อแถว) แล้ว `÷ factor(หน่วยซื้อล่าสุด)` ก่อนเข้า `analyzeBatch` → SS/ROP/V/มูลค่า เป็นหน่วยซื้อ; ราคา = ต่อ pack
- **คอลัมน์ใหม่ (ตาราง/Excel)**: หน่วยซื้อ · บริษัทล่าสุด · วันรับล่าสุด · คงอยู่ได้อีก (Coverage) · ต้องซื้อ (หน่วยซื้อ + เม็ด)
- **หน้าต่าง default** = 4 เดือนเต็มล่าสุด (ตัดเดือนปัจจุบันที่ยังไม่ครบ)

## Import master CSV (ไฟล์ "วิเคราะห์สั่งซื้อ" จาก Excel)

`ImportMasterModal` รับไฟล์ export ของ sheet "วิเคราะห์สั่งซื้อ" ได้ตรงๆ แต่ต้องระวัง 3 จุด (verify กับไฟล์จริง 2026-06-28, 448 แถว):
- **Header ไม่ใช่แถวแรก** — ไฟล์มี 3 แถวนำหน้า (title / คำเตือนโหมดพิเศษ / header) → ต้อง detect แถวที่ cell = `รหัส` แล้วส่งเป็น `range` ของ `sheet_to_json` ไม่งั้น parse ได้ 0 แถว
- **exclude_status มี emoji** — ค่าจริง `✂️ ตัดออก` / `📋 สั่งเมื่อขอ` → strip non-อักษร แล้ว `.includes()` (ไม่ใช่ `===`)
- **VEN ว่าง → `null`** (ไม่ใช่ Normal) เพื่อให้ fallback 1.5 ทำงาน (ADR-0002) — แม้ไฟล์ชุดนี้ VEN ครบทุกแถว (N105/E282/V61) ก็เก็บเป็น defensive
- **import แค่ VEN + exclude_status** (manual judgment ของเภสัชกร) — ราคา/บริษัท/LT แอป derive จาก `receive_logs` สด ตาม [ADR-0001](../adr/0001-reorder-recompute-vs-import.md) ไม่ override จาก CSV (จะ stale)

**Verify ตัวเลขตรง Excel (445 แถว):** feed usage(ธ.ค.–มี.ค.)/stock/LT/VEN/exclude จาก CSV เข้า `analyzeDrug` แล้วเทียบ SS/ROP/สถานะ/จำนวนสั่ง → **ผ่าน 415/448 (92.6%)** เกณฑ์ SS/ROP ±1, status/qty เป๊ะ. mismatch ที่เหลือ **ไม่ใช่บั๊กสูตร**: ส่วนใหญ่ ROP ต่าง 2–13 เพราะ Excel column "Lead Time" แสดงค่าปัด แต่สูตรภายในใช้ค่าทศนิยมเต็ม (แอปจริงดึง LT เต็มจาก `receive_logs` จะตรงกว่า); ส่วนน้อยต่างที่ status ใกล้หมดอายุ (harness ไม่ feed `nearestExpiryDays` เพราะ CSV ไม่มี exp) + fallback order qty (Open Q3).

## ข้อจำกัด / TODO

1. **dispense_type filter** — spec ระบุให้กรองรายการที่ `dispense_type='บันทึกเท่านั้น'` ออก แต่ตาราง `dispense_logs` ไม่มี column นี้ ปัจจุบัน filter จาก `main_log`/`note` ที่มีคำว่า "บันทึก" — อาจไม่ครอบคลุม ต้องยืนยันกับ user
2. ~~**Mark ordered** เก็บใน localStorage~~ **ย้ายเข้า DB แล้ว 2026-07-03** — table `reorder_orders` (`fetchReorderOrders`/`setReorderOrder` ใน [db.js](../../src/lib/db.js)); sync ข้ามเครื่อง/คน. persist จนกว่าคนกดยกเลิกเอง (ไม่ auto-reset). migration apply แล้ว (prod 2026-07-04)
3. **Phase 2**: ~~reconcile view (upload Excel เทียบ)~~ **เสร็จ 2026-07-03** (tab "เทียบกับ Excel" — `reconcileRows` ใน [reorder.js](../../src/lib/reorder.js), read-only diff ±1, audit `reconcile_excel`).
   - ~~auto-revert Refill~~ **ยกเลิก** — Refill mode ถูกลบโดยตั้งใจ (Q1 DONE 2026-06-13, ใช้ `excludedMonth` แทน) → ไม่มีอะไรให้ revert
   - ~~ธง acute/IV (BR7)~~ **ยังไม่มี business rule** — เป็นแค่ TODO ลอย ไม่มีนิยาม (acute คืออะไร, กระทบสูตรยังไง) ต้องเคาะ rule ก่อนถึงจะ implement ได้
   - ยังไม่ทำ: **PR/PO generation** (ต้องรู้แบบฟอร์ม PR/PO จริง), **Q3 fallback order qty** (รอ user ส่งเซลล์ Excel ที่เข้าเคส V≤0)

## เทียบสูตรกับ Excel (source of truth)

สูตรในแอปกับ Excel "วิเคราะห์สั่งซื้อ" **ยังไม่ตรงทุกจุด** — รายละเอียด gap + Open Questions ดู
[reorder-excel-spec.md](reorder-excel-spec.md). ทิศทาง: recompute ในแอปให้ผลตรง Excel ([ADR-0001](../adr/0001-reorder-recompute-vs-import.md)).
**gap ใหญ่: Safety Stock ใช้ฐาน 60 cap 90 แต่ Excel ใช้ฐาน 30 ไม่ cap → SS สูงกว่า ~2 เท่า.**
