# ใบแจ้งย้ายที่เก็บ (Location Move)

สถานะ: **ทำแล้ว 27/10/2569 — ยังไม่ได้ทดลองย้ายจริงกับ user / ยังไม่ commit** · ข้อตกลง /grill-with-docs + /scrutinize 27/10/2569 · นิยาม [CONTEXT.md §ใบแจ้งย้ายที่เก็บ](../../CONTEXT.md)

ไฟล์: `location_move_migration.sql` · [src/lib/locationMove.js](../../src/lib/locationMove.js) (+ test 30 ข้อ `npm run test:locationmove`) · db.js `fetchPendingLocationMoves`/`createLocationMoves`/`reconcileLocationMoves` (+ overlay ใน `fetchInventory`, reconcile ท้าย `saveInventory`) · [src/LocationMoveModal.jsx](../../src/LocationMoveModal.jsx) + ปุ่ม/ป้ายใน `App.jsx renderItemCard` · audit `move_location` (กระดิ่ง) / `reconcile_location_move` · `scripts/location-moves.mjs` · `scripts/apply-location-moves.ps1` · `scripts/xlsm_verify.py` · skill `/apply-location-moves` · `check-complete.py` ข้อ 11 · E2E [tests/16-location-move.spec.js](../../tests/16-location-move.spec.js) (อ่านอย่างเดียว)

## ปัญหา
เจ้าหน้าที่คลังไปหยิบยาตามที่เก็บในระบบ (Master D MainLog / E DetailedLog → `inventory.main_log` / `location`) แล้วยาไม่อยู่ที่นั้น (เคสจริง 27/10/2569: Hydralazine 20mg inj 1450009 lot P04077/P04092 ระบบ C-2-3 จริง D-4-4). ตอนนี้แก้ได้ทางเดียวคือบอก Claude ให้แก้ Excel ผ่าน COM แล้วนำเข้า.

## ข้อตกลง (grill 27/10/2569)
1. **แบบ ก. ใบแจ้งย้าย** — แอปบันทึกการย้าย แผนผังแสดงที่ใหม่ทันที (ป้าย "รอลง Excel") · Excel ยังเป็นตัวจริง (ADR-0027) · ไม่แก้ `inventory.location` ตรง (import รอบหน้าทับกลับเงียบ)
2. **ลง Excel ตอนเปิด session** (คอมคลังไม่เปิดทิ้ง ไม่ใช้ Task Scheduler) — `check-complete.py` มีข้อใหม่ เจอใบรอลง → Claude รัน skill **ไม่ต้องถาม** แล้วรายงานในสรุป · Excel เปิดอยู่/diff ไม่ผ่าน = หยุดบอก user
3. **staff + admin เท่านั้น** (แผนผังเปิดให้ requester เห็น แต่ปุ่มย้ายซ่อน)
4. **หน่วยย้าย = รหัส + lot + ที่เก็บเดิม** (ทุกแถว inventory ที่ 3 ค่านี้ตรงกัน — แก้หลัง scrutinize: Manidipine 260873 แยกแถวตามที่เก็บ E-1-x 240 / ชั้น4 300 ย้ายทั้ง lot จะทำยอดรายที่เก็บหาย) · ปุ่มในการ์ด lot เปิดรายการ lot ของยา ติ๊กให้ก่อนเฉพาะ lot ที่ที่เก็บเดิมเท่ากัน (เทียบแบบเซ็ต)
5. **"ที่เก็บจริง" = ชุดชั้นแก้ได้** (ชิป ×/+เพิ่มชั้น) ครอบ ย้ายทั้งหมด / เจอบางส่วนอีกชั้น / ชั้นว่าง · เลือกจาก `fetchInventoryLocations` · ชั้นใหม่ไม่เคยมี = เตือนยืนยัน · ห้ามว่าง · MainLog derive อัตโนมัติ

## ออกแบบ

### ข้อมูล — ตารางใหม่ `location_move` (migration `location_move_migration.sql`)
| คอลัมน์ | ความหมาย |
|---|---|
| `id` bigserial | |
| `code`, `name`, `lot` | หน่วยย้าย (lot `-` ได้ — เวชภัณฑ์) |
| `from_location`, `from_main_log` | ที่เก็บตอนกดย้าย (ค่าที่**แผนผังแสดง** = หลัง overlay ใบก่อนหน้า) |
| `to_location`, `to_main_log` | ชุดชั้นใหม่ normalize แล้ว (`"C-2-3 ,D-4-4"` รูปเดียวกับ Excel) |
| `status` | `pending` · `applied` (Excel ตรงแล้ว) · `superseded` (มีใบใหม่กว่าของ lot เดียวกัน) · `conflict` (Excel เป็นค่าที่ไม่ใช่ทั้ง from/to) |
| `created_by`, `created_at`, `resolved_at`, `note` | |

unique partial index: 1 `pending` ต่อ `code+lot+from_location` · ADR-0016: ข้อมูลไม่อ่อนไหว รับความเสี่ยง anon key เดิม · realtime ไม่ต้อง (แผนผังโหลดใหม่หลังบันทึก)

### pure module `src/lib/locationMove.js` + golden test (`npm run test:locationmove`)
- `normLocSet(str)` → array ชั้น (split comma, trim, dedupe) · `joinLocSet(arr)` → `"A ,B"` · `sameLocSet(a,b)` (กติกาเดียวกับ countMatch `setEq`)
- `deriveMainLog(locSet, knownMap)` — ชั้นแรกตรง `^[A-Za-z]+-` → ตัวอักษรนำ · โซนพิเศษ → map จาก inventory ปัจจุบัน (ที่เก็บค่าเดียว → main_log ที่พบมากสุด เช่น `คลังถุงขวดตลับ` → `คลังถุง/ขวด/ตลับ`) · ไม่พบ = ค่าที่เก็บเอง
- `overlayMoves(rows, pendingMoves)` → rows ที่ `location/main_log` ถูกแทน + `pendingMove` (ใบ) สำหรับแถว code+lot ที่มีใบ pending
- `reconcileMoves(pendingMoves, rows)` → `{ applied[], conflict[], pending[] }` : Excel(rows) set-equal `to` = applied · set-equal `from` = ยัง pending · อย่างอื่น = conflict · lot หายจากไฟล์ = conflict

### db.js
- `fetchPendingLocationMoves()` · `createLocationMoves(lots[], toLocation, auth)` (supersede ใบ pending เดิมของ lot เดียวกัน → insert · audit `move_location` · Rule #12 sync 3 ที่ + กระดิ่ง)
- `fetchInventory()` (แผนผัง) เรียก `overlayMoves` → การ์ด/ช่องย้ายไปชั้นใหม่ทันที
- `reconcileLocationMoves(auth)` — เรียกหลังเขียน inventory ใน `applyExcelSync` และ `import-master.mjs --commit` → อัปเดต status + audit `reconcile_location_move` (ไม่เข้ากระดิ่ง)

### UI ([App.jsx](../../src/App.jsx) `renderItemCard` + คอมโพเนนต์ใหม่ `LocationMoveModal.jsx`)
- ปุ่ม "ย้ายที่เก็บ" (`MoveRight`/`MapPin`) เฉพาะ `isStaff` · ป้าย "ย้ายแล้ว รอลง Excel" (อำพัน) บนการ์ดที่มีใบ pending · ป้าย conflict (แดง) "Excel ที่เก็บไม่ตรงใบแจ้ง"
- โมดอล: รายการ lot ของยา (คงเหลือ/exp/ที่เก็บ) ติ๊กตามข้อ 4 → ชิปที่เก็บ → ยืนยันด้วย `ConfirmModal` · มือถือ = bottom sheet (Rule #5) · ไม่มี emoji · ภาษาไทย

### CLI + skill (ฝั่ง Excel)
- `scripts/location-moves.mjs` — `--json` คืนใบ pending/conflict (ให้ check-complete + skill อ่าน)
- `scripts/apply-location-moves.ps1` (แม่แบบจาก `hyd_loc.ps1` 27/10/2569) — สำเนา scratchpad · `AutomationSecurity=3` · หาแถว Master ด้วย รหัส+lot · **ด่าน: E ปัจจุบัน set-equal `from_location` ทุกแถว ไม่งั้นหยุด** · เขียน D/E · Calculate · ด่านแถวสรุป ✅ + U ไม่เปลี่ยน · Save สำเนา
- `scripts/xlsm_verify.py` — diff ทีละเซลล์ (ต้องต่างเฉพาะ D/E ที่ตั้งใจ) + codepage/โมดูล VBA เท่าเดิม (รวม dif.py/vba.py ที่เขียนซ้ำทุก session)
- skill `.claude/skills/apply-location-moves/` — ลำดับ: list → ps1 → verify → `cmp` → วางกลับ → `import:master --commit` → reconcile → รายงาน
- `check-complete.py` ข้อใหม่ "ใบแจ้งย้ายที่เก็บ ↔ Excel" — pending/conflict = ไม่ครบ · root CLAUDE.md: เจอ → รัน skill ไม่ต้องถาม

### ทดสอบ
- golden test locationMove (normalize/derive/overlay/reconcile + เคส Hydralazine, Mixtard หลายชั้น, lot `-`, คลังถุงขวดตลับ)
- E2E read-only: staff เห็นปุ่ม เปิดโมดอล ติ๊กถูก ไม่กดบันทึก (เขียน DB จริง) · requester ไม่เห็นปุ่ม · 375px
- ทดลองจริง 1 ใบกับ user ก่อนเปิดใช้

## ตัดสินหลัง scrutinize (27/10/2569)
1. **ชีท `list`** (1 แถว/รหัส) — แก้ตามเฉพาะเมื่อหลังย้ายทุก lot ของรหัสอยู่ที่เก็บเดียวกัน ไม่งั้นข้าม + รายงาน
2. overlay = แผนผัง (`fetchInventory`) เท่านั้นรอบแรก · ใบ lot คุม/PDF ใบเบิกยังชั้นเดิมจนลง Excel (ไม่เกิน 1 session)
3. snapshot `Master_<เดือนก่อน>` ไม่แตะ (งวดปิด — ที่เก็บไม่อยู่ใน key ของสูตร S)
4. reconcile เรียกท้าย `saveInventory` ที่เดียว (CLI + ปุ่มนำเข้าผ่านตัวนี้ทั้งคู่) — ล้ม = log ไม่ล้มการนำเข้า
5. แถว Master ที่จะแก้: node หาเลขแถวด้วย `masterSheet.js` (lot normalize เดียวกับนำเข้า) → ps1 ตรวจซ้ำ รหัส+E ก่อนเขียน
6. ADR-0027 เพิ่มข้อยกเว้น overlay ใน Consequences
7. migration apply ผ่าน MCP (user อนุญาต 27/10/2569)

## ข้อจำกัดเดิมที่ไม่แก้ในงานนี้
- แผนผังจัดช่องด้วย string `location` ตรงตัว → lot หลายชั้น (`"E-8-4 ,E-8-5"` 37 แถว) ไปอยู่กลุ่ม "โซนอื่น" ไม่ขึ้นในช่อง E-8-4 · ย้ายเป็นหลายชั้นจะได้พฤติกรรมเดียวกัน
- ป้ายสถานะการ์ดแสดง `receive_status` ดิบ `ตรวจรับแล้ว|ตัดออก` (ควรตัดหลัง `|` แบบ `trackingPrint`)
