# ระบบวิเคราะห์การสั่งซื้อยา (ReorderApp)

หน้านี้แทนระบบ "ระบบสั่งยา" (view='order') ของเดิมใน [App.jsx](../../src/App.jsx) — ออกแบบใหม่ทั้งหมดตาม Excel "วิเคราะห์สั่งซื้อ"

## ภาพรวม

```
ReorderApp.jsx (sub-app, page='reorder' ใน AppRoot)
├── ControlBar         ช่วงสถิติ · โหมด Normal/Refill · เดือนตัด · Lead Time default · ค้นหา
├── StatusStrip        6 สถานะ (clickable filter): หมดสต็อค/ใกล้หมดอายุ/สั่งเพิ่ม/เพียงพอ/สั่งเมื่อขอ/ตัดออก
├── Tab: ตารางวิเคราะห์   sortable + Excel export + mark ordered + edit master
├── Tab: ผลจาก Excel     แสดงเลขที่ import จากชีต + join สต็อกสด + คอลัมน์ ✓/✗ (โผล่เมื่อ import แล้ว)
├── Tab: ใบสั่งซื้อแยกบริษัท Card per supplier + print Blob URL + Excel export
├── Tab: Verification    Run Golden tests (Atorvastatin reference) ใน browser
└── Tab: History         รายการ analysis_runs snapshot + ลบได้
```

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | บทบาท |
|---|---|
| [src/ReorderApp.jsx](../../src/ReorderApp.jsx) | UI หลัก (single file ~970 บรรทัด) |
| [src/lib/reorder.js](../../src/lib/reorder.js) | Pure logic — 8 steps ตาม spec §3 |
| [src/lib/reorder.test.js](../../src/lib/reorder.test.js) | Golden test (57 assertions, Atorvastatin reference + parse/verify Excel) |
| [reorder_master_migration.sql](../../reorder_master_migration.sql) | DB migration |
| [analysis_excel_source_migration.sql](../../analysis_excel_source_migration.sql) | เพิ่ม `analysis_runs.source` ('app' / 'excel') |

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
| `source` | TEXT | 'app' = แอปคำนวณเอง · 'excel' = import จากชีต (ดู migration แยก) |

## สูตรคำนวณ (spec §3, [src/lib/reorder.js](../../src/lib/reorder.js))

```
Step 3: Max = MAX(เดือนในช่วงคำนวณ)
        Avg/mo = SUM / months
        Avg/d  = Avg/mo / 30

Step 5: SS  = MIN( MAX(1, Avg/d × 60 × risk),
                  MAX(1, Avg/d × 90) )       ← cap 90 วัน
        ROP = ROUND(SS + Avg/d × leadTime, 0)

Step 6: status priority (หยุดเมื่อตรง):
        1. exclude_status='ตัดออก'  → ตัดออก
        2. exclude_status='สั่งเมื่อขอ' → สั่งเมื่อขอ
        3. stock = 0                → หมดสต็อค
        4. nearestExpiry ≤ 180 วัน  → ใกล้หมดอายุ
        5. stock ≤ ROP              → สั่งเพิ่ม
        6. else                     → คงคลังเพียงพอ

Step 7: ถ้า status ∈ {เพียงพอ, ตัดออก, สั่งเมื่อขอ}: V=0
        มิเช่นนั้น:
            factor = mode==='refill' ? 2.3 : 2.0
            target = MIN(Max×3, MAX(Avg/mo × factor, Max×2, ROP))
            V = target − stock
            ถ้า V ≤ 0: V = MAX(1, Max)       ← fallback
```

**Golden reference** — Atorvastatin 40mg (Refill mode):
- Input: usage=[2833,1477,1960,2603], stock=4400, LT=15.5, Essential, ฿33.30
- Expected: SS=6655, ROP=7801, V=3401, Amount=฿113,253.30

`ssMultiplier` ใน `analyzeDrug` override `RISK_MULTIPLIER[riskGroup]` ได้ — ใช้ตอน verify กับ Excel
ที่เก็บตัวคูณเป็นตัวเลขตรง ๆ ไม่ใช่ชื่อกลุ่ม

## Import ผลวิเคราะห์จาก Excel (Excel เป็นเจ้าของสูตร)

ที่มา + เหตุผลของการตัดสินใจ: [reorder-excel-redesign.md](reorder-excel-redesign.md)

```
ปุ่ม "Import ผลวิเคราะห์ (Excel)"  →  parseAnalysisExcel(file)   [db.js — อ่านไฟล์]
                                        └─ parseAnalysisSheet(aoa) [reorder.js — pure, มี test]
                                   →  verifyExcelRow() ทุกแถว → summarizeVerification()
                                   →  Tab "ผลจาก Excel": เลข Excel + สต็อกสดจาก DB + ✓/✗
                                   →  (ถ้ากดบันทึก) saveExcelAnalysisRun → analysis_runs source='excel'
```

**กฎการ parse — ห้ามแก้ให้ตายตัว**
- **หัวตารางไม่ได้อยู่แถว 1** — ชีตจริงมีแถว title/ปุ่มอยู่ข้างบน parser จึงสแกนหาแถวที่มีทั้ง `รหัส` และ `สถานะ`
  (ไฟล์ที่ทดสอบ header อยู่แถว 2) — ห้าม fix index แบบ `ImportMasterModal`
- **คอลัมน์เดือน dynamic** — จับด้วย prefix `เบิก ` แล้วแปลงเป็น `YYYY-MM` (พ.ศ. 2 หลัก) ห้าม hardcode ชื่อเดือน
- **หัวคอลัมน์ match แบบ predicate ไม่ใช่ exact** — เพราะมีหน่วยต่อท้าย (`คงเหลือ (หน่วย)`, `ROP = SS + Avg×LT`)
- **สถานะใน Excel มี emoji นำหน้า** (`📋 สั่งเมื่อขอ`) → `normalizeStatus()` ตัดออกก่อนเทียบกับ `STATUS`
  ถ้าไม่ตัด `computeOrderQty` จะไม่รู้จักสถานะ → คืนจำนวนสั่ง > 0 ให้รายการที่ต้องเป็น 0
- **ช่วงสถิติ** เอาจากเดือนที่มียอดเบิกจริง (คอลัมน์เดือนอนาคตในชีตเป็น 0 ทั้งคอลัมน์)

**การตรวจสอบ (`verifyExcelRow`)** — ป้อนค่ากลางจาก Excel เข้าแต่ละ step เพื่อให้ step อิสระต่อกัน
(เช่น step "จำนวนสั่ง" ใช้ ROP ของ Excel ไม่ใช่ที่โค้ดเพิ่งคำนวณ) → error ที่ step เดียวไม่ลาม cascade

| Step ที่ตรวจ | tolerance |
|---|---|
| SS · ROP · จำนวนสั่ง | ±1 |
| มูลค่า | ±0.5 |

**ผล diff กับไฟล์จริง (409 แถว, เม.ย. 69): ตรงกัน 409/409 ทุก step**

> **ต่างจริง 1 จุด — `Avg/วัน`**: Excel ใช้ `รวมทุกเดือน ÷ จำนวนวันในช่วง` (ไฟล์ที่ทดสอบ = 305 วัน)
> แต่ `reorder.js` ใช้ `Avg/เดือน ÷ 30` → ถ้าป้อนยอดเบิกชุดเดียวกัน แอปจะได้ Avg/วัน สูงกว่า Excel ~2.5 เท่า
> (SS/ROP จึงสูงตาม) การ verify ข้างบนไม่จับจุดนี้ เพราะรับ `avgDay` จาก Excel มาเป็น input
> — **ยังไม่ตัดสินใจว่าจะให้ฝั่งไหนถูก** ดู TODO ข้อ 4 ด้านล่าง

## Audit log actions

ใหม่ใน [AppRoot.jsx NOTIF_LABELS](../../src/AppRoot.jsx), [AuditLogApp ACTION_LABELS](../../src/AuditLogApp.jsx):

| Action | Trigger |
|---|---|
| `analysis_view` | รันวิเคราะห์ (auto-fire ครั้งแรก + กด Run) |
| `analysis_run` | บันทึก Snapshot |
| `delete_analysis_run` | ลบ snapshot ใน History tab |
| `update_reorder_config` | แก้ Master (popup) |
| `import_reorder_config` | Import Excel/CSV (Master ยา) |
| `import_analysis_excel` | Import ผลวิเคราะห์จากชีต "วิเคราะห์สั่งซื้อ" (ยิงเมื่อกดบันทึก Snapshot เท่านั้น) |
| `mark_ordered` / `unmark_ordered` | toggle checkbox สั่งแล้ว (localStorage) |
| `print_po` | พิมพ์ใบสั่งซื้อ Blob URL |

## Permission

- `staff` + `admin` → ใช้ได้เต็ม (รัน + บันทึก + แก้ Master + Import)
- `requester` → ไม่เห็น (ไม่อยู่ใน `SYSTEM_ACCESS.requester`)
- Grant ได้ผ่าน `GRANTABLE_SYSTEMS.reorder` ใน [UserManagementApp.jsx](../../src/UserManagementApp.jsx)

## Run tests

```bash
npm run test:reorder    # 57 golden assertions — ต้องผ่าน 100%
```

หรือผ่าน UI: เปิดระบบ → tab "Verification" → กด "Run tests"

## ข้อจำกัด / TODO

1. **dispense_type filter** — spec ระบุให้กรองรายการที่ `dispense_type='บันทึกเท่านั้น'` ออก แต่ตาราง `dispense_logs` ไม่มี column นี้ ปัจจุบัน filter จาก `main_log`/`note` ที่มีคำว่า "บันทึก" — อาจไม่ครอบคลุม ต้องยืนยันกับ user
2. **Pack-aware order qty** — `orderQty` ออกเป็นหน่วยรายงาน (เม็ด) ยังไม่หาร pack เป็นจำนวนกล่อง/แพ็ค (อนาคต)
3. **Mark ordered** เก็บใน localStorage เท่านั้น (per device) — ถ้าต้องการ sync ข้ามอุปกรณ์ ให้สร้าง table `reorder_orders`
4. **`Avg/วัน` ต่างระหว่าง Excel กับโค้ด (รอ user เคาะ)** — Excel = `รวมทุกเดือน ÷ จำนวนวันในช่วง`,
   `reorder.js` = `Avg/เดือน ÷ 30` · กระทบ **Dashboard** ที่คำนวณสดจาก `reorder.js` (กฎ #13) ไม่กระทบ Tab "ผลจาก Excel"
   ที่แสดงเลข Excel ตรง ๆ · ต้องเลือกฝั่งเดียวก่อนจะถือว่า Dashboard = Excel โดยปริยาย
5. **Tab "ผลจาก Excel" ยังไม่มี mobile card view** — ตาราง scroll แนวนอนบนมือถือ (กฎ #5 ยังไม่ครบ)
