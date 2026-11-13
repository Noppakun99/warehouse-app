# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

คู่มือสำหรับ Claude Code ทำงานกับ repo นี้ — เก็บแต่ภาพรวม convention และ pointer ไป `docs/`

## บทบาทผู้พัฒนา (Senior Software Engineer Mindset)

**ทำงานแบบ senior software engineer ทุกครั้ง** — ไม่ใช่แค่เขียนโค้ดให้เสร็จ แต่ตรวจสอบเชิงระบบ:

1. **คิดเป็นระบบ ไม่ใช่เป็นไฟล์** — แก้ฟีเจอร์ใหม่ต้องตรวจให้ครบ: DB layer (`db.js`) + UI + audit log + notification + permission + mobile + E2E test
2. **Cross-cutting concerns ต้องครอบคลุมทุก sub-app**:
   - **Audit log**: ทุก mutation (INSERT/UPDATE/DELETE) ต้องเรียก `insertAuditLog` พร้อม `auth` ครบ
   - **Notification bell**: action สำคัญที่ staff ต้องรู้ → เพิ่มใน `NOTIF_LABELS` + handler `notifMessage()` ใน [NotificationBell.jsx](src/NotificationBell.jsx) (ดู Critical Rule #12 — ต้อง sync 3 ที่)
   - **Permission**: action ใหม่ต้องเช็คว่า role ไหนทำได้ (`GRANTABLE_SYSTEMS` ใน [UserManagementApp.jsx](src/UserManagementApp.jsx) — `SYSTEM_ACCESS` ลบทิ้งแล้ว 2026-08-01 ดู Critical Rule #23)
3. **Verify ก่อนสรุปเสมอ** — `npm run lint` + reproduce ปัญหา + ตรวจ side-effect ในไฟล์อื่น (ดู section "Verify ก่อนสรุป" ด้านล่าง)
4. **คุณภาพมากกว่าความเร็ว** — เจอ gap ระหว่างทาง (เช่น label หายไปใน UI) ให้ flag กับ user ก่อนเสมอ ไม่เงียบ
5. **ไม่ duplicate test/skill** — ก่อนเพิ่มไฟล์ test/skill ใหม่ ต้อง grep หาของเดิมก่อน (กฎ "อ่านก่อนแก้")

## เช็คโฟลเดอร์พักเอกสารเรื่อยๆ (user สั่ง 08/10/2569)

`C:\Users\PRH0000484\OneDrive\เอกสารคลังยา_รอลง\` มี 6 โฟลเดอร์ — **มีไฟล์ = งานที่ยังไม่ได้ลง** (ลงเสร็จต้องย้ายออกเสมอ):

| โฟลเดอร์ | งาน |
|---|---|
| `ใบเบิกยา\` | ลงชีท `เบิก ` → PDF → คิวพิมพ์ → นำเข้าแอป · **หน่วยงานภายนอก (ศบส.1–4 · รพ.สต.คูคต · เทศบาลนครรังสิต · วัดประยูร) ต้องเพิ่มชีท `<ว.ด.ปป>` ในไฟล์สรุปเบิกยาของศูนย์นั้นด้วยทุกใบ** (`Desktop\รพ.สต_เบิกยา\<ศูนย์>\…ปีงบ70.xlsx` — memory `rpst-dispense-summary`; `check-complete.py` ข้อ 8 ตรวจ) |
| `บิลยา\` | ลงชีท `รับยา` + Master → ดัชนีบิล → นำเข้าแอป → ใบส่งบิลจัดซื้อ → **คิวพิมพ์** → **ลงยามาส่งในระบบติดตามการสั่งซื้อของจัดซื้อ** (ดู `/bill-entry` ข้อ 8) |
| `ใบคืนยา\` | ใบคืน/ใบยืมที่เซ็นแล้ว → ทะเบียน `รพ.ยืมยา` + หลักฐาน |
| `รูปตรวจรับยา\` | ลงตรวจรับ (รับยา P/Q + `รับเข้า` P/Q + Master C/AX) → นำเข้าแอป → **เอกสารสรุปตรวจรับ** `python scripts/inspection_ack.py --date <วันตรวจรับ>` (preview → `--commit` = PDF + ทะเบียน + คิวพิมพ์ให้เอง) → `print-queue.py` (user สั่ง 21/10/2569 — CONTEXT §เอกสารสรุปตรวจรับ) |
| `จัดซื้อเซ็นรับ\` | รูปใบส่งบิลจัดซื้อ (สบ.70/xxx) ที่จัดซื้อเซ็นแล้ว → ติ๊ก `_ทะเบียนส่งบิลจัดซื้อ.csv` → ย้ายรูปไป `ส่งบิลให้พี่โก้\เซ็นรับ\` (เพิ่ม 08/10/2569) |
| `ผู้ตรวจรับเซ็น\` | รูปเอกสารสรุปตรวจรับ (ตร.70/xxx) ที่ผู้ตรวจรับเซ็นแล้ว → ติ๊ก `เอกสารตรวจรับ\_ทะเบียนเอกสารตรวจรับ.csv` (ผู้ตรวจรับเซ็น · วันที่เซ็น ทุกแถวของเลขนั้น · รายการที่ไม่ได้ ✓ จดหมายเหตุ + ถาม user) → ย้ายรูปไป `เอกสารตรวจรับ\เซ็นแล้ว\` (เพิ่ม 21/10/2569) |

**เช็คทุกครั้งที่**: (1) เริ่ม session (2) **จบงานย่อยแต่ละชิ้น** — user มักวางไฟล์ใหม่ระหว่างที่ทำงานอื่นอยู่ (3) ก่อนสรุปงานให้ user · คำสั่ง: `find "/c/Users/PRH0000484/OneDrive/เอกสารคลังยา_รอลง" -type f` (หรือ `python scripts/check-complete.py` ซึ่งตรวจข้อนี้ด้วย) · เจอไฟล์ → บอก user ในสรุปว่าค้างกี่ไฟล์ โฟลเดอร์ไหน แล้วถามว่าจะลงต่อเลยไหม · ขั้นตอนละเอียดอยู่ใน memory `document-inbox`

**บันทึกการทำงานรายวัน (user สั่ง 28/10/2569 — เก็บไว้ไล่ดูงาน+ไฟล์ที่ทำแต่ละวัน · ไม่พิมพ์/ไม่ส่งทุกวัน รอ user เรียกส่งหัวหน้าทีเดียว)**: ก่อนสรุปงานทุกครั้ง → เรื่องที่ไม่มีทะเบียน (ตัดสินใจ · เปลี่ยนวิธีทำงาน · รอหัวหน้า · หลักฐานที่ได้รับ) append `Desktop\ยอดคงคลัง\บันทึกการทำงาน\_บันทึกเพิ่ม.csv` แล้ว `python scripts/daily-log.py` (สร้าง Excel รายเดือนใหม่จากทะเบียนทั้งหมด) · **งานที่ผิดพลาด + การแก้ไข (user สั่ง 04/11/2569 ให้รายงานเห็นตัวเลข): พบเมื่อไร append `_บันทึกผิดพลาด.csv` ทันที แก้แล้วกรอกวันที่แก้ · รวมบิล/ใบเบิก/COA ที่ต้นทางผิดด้วย (user สั่ง 05/11/2569)** → ชีท ความผิดพลาด — [docs/features/daily-work-log.md](docs/features/daily-work-log.md)

**ใบแจ้งย้ายที่เก็บ (เจ้าหน้าที่กด "ย้ายที่เก็บ" ในแผนผัง) — check-complete ข้อ 11 เจอใบ `pending` → รัน `/apply-location-moves` ได้เลยไม่ต้องถาม** แล้วรายงานในสรุป (user อนุญาตถาวร 27/10/2569 · คอมคลังไม่เปิดทิ้ง จึงลงตอนเปิด session ไม่ใช้ Task Scheduler) · Excel เปิดอยู่ / ด่าน diff ไม่ผ่าน / ใบ `conflict` = หยุดถาม user

**⛔ ลงใบเบิก: โหลด `/dispense-entry` ก่อนอ่านรูป · ลงบิล: โหลด `/bill-entry` ก่อนอ่านรูป** — กฎละเอียดทั้งหมดอยู่ในนั้น · hook กันการ Read รูปในโฟลเดอร์พัก `ใบเบิกยา\` และ `บิลยา\` จนกว่าจะโหลด แต่รูปที่แนบมาในแชทไม่มี hook กัน ต้องโหลดเอง · ห้ามพลาดแม้ไม่ได้เปิด skill:
- ใบเบิกฟอร์มพิมพ์รายการ: ฝั่งขวาอาจพิมพ์เลื่อนจากฝั่งซ้าย 1 บรรทัด ผูกตัวเลขผ่านหน่วยนับข้างตัวเลข ไม่ลากจากชื่อยา
- ชีทเบิก: ลงคอลัมน์ AD ก่อนทำ PDF · สูตร T ตัดเฉพาะช่วงงวดปัจจุบัน ห้ามลงย้อนงวดที่ปิดแล้ว
- บิลใหม่ออกเลข สบ. ใหม่เสมอ ห้ามรวมเข้าเลขเดิมโดยไม่ถาม user · แถว Master ซื้อใหม่ คอลัมน์ B = `ยังไม่ได้ส่ง`

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # Run ESLint (⚠️ ไม่ใช่ 0 — มี error ค้างเดิม ดู "ก่อน commit ทุกครั้ง")
npm run preview      # Preview production build
npx eslint <ไฟล์>    # lint เฉพาะไฟล์ที่แก้ — ใช้ตัวนี้ก่อน commit ไม่ใช่ npm run lint
node src/lib/<x>.test.js   # รัน golden test ไฟล์เดียวตรงๆ (ไม่มี framework จึงไม่มี -t/--filter)
npm run test:<ชื่อ>        # golden test รายโมดูล — รายชื่อ + จำนวน assertion + ที่อยู่ไฟล์ test อยู่ docs/testing.md §Golden tests
```

### นำเข้า Excel เข้า DB ผ่าน CLI (`scripts/*.mjs`)

อ่าน `.xlsm` ใน OneDrive ตรงๆ แทนการ copy sheet → Save As CSV → อัปโหลดผ่านหน้าเว็บ — **ใช้ `/import-excel` skill** ซึ่งมีกับดักครบ (serial วันที่ปนรูปแบบ, พ.ศ. ใน serial, lot ที่มีตัว E)

```bash
npm run import:receive   # ชีท 'รับยา'          → receive_logs      🔴 DELETE ALL
npm run import:master    # ชีท Master           → inventory         🔴 DELETE ALL
npm run import:dispense  # ชีท 'เบิก '          → dispense_logs     🔴 DELETE ALL
npm run import:reorder   # ชีท วิเคราะห์สั่งซื้อ → drug_reorder_config 🟢 UPSERT
npm run import:loan      # ชีท 'รพ.ยืมยา'       → drug_loan         🟢 diff insert/update
npm run export:csv       # ทุกชีท → csv_file/*.csv (ไม่แตะ DB)
npm run import:restore   # กู้คืนจาก backup/*.json
node scripts/stock.mjs <คำค้น> [--all]  # เช็คคงเหลือยาจากชีท Master (อ่านอย่างเดียว — สกิล /stock-check)
```

**ทุกตัวเป็น dry-run โดยค่าเริ่มต้น ต้องใส่ `--commit` ถึงเขียนจริง** — `--commit` **ไม่ใช่ `git commit`** มันคือ "ปุ่มอัปโหลด" ที่เคยกดบนหน้าเว็บ (ผู้ใช้เคยเข้าใจผิด 2026-09-22) สำรองอัตโนมัติก่อนเขียนเสมอ — สำรองไม่สำเร็จ = ไม่เขียน

**CLI ไม่ทำ DELETE/INSERT เอง** แต่เรียกฟังก์ชันใน `db.js` ตัวเดียวกับที่หน้าเว็บใช้ (`insertReceiveRows` ฯลฯ) เพื่อไม่ให้ตรรกะ import แตกเป็น 2 ชุดแล้วดริฟต์

⚠️ **path ไฟล์ default ในสคริปต์เป็นของเครื่องเก่า** (`C:/Users/PRH0000484/OneDrive/...`) — เครื่องอื่นต้องใส่ `--file "<path>"` ทุกครั้ง

### เขียนกลับลงไฟล์ `.xlsm` (แก้ชีทแทนคลัง) — Excel COM ผ่าน PowerShell เท่านั้น

**⛔ ก่อนเขียน `.xlsm`/`.xlsx` ของคลังทุกครั้ง (ลงบิล · ลงใบเบิก · ยืม-คืน · แก้สูตร · ย้ายชีท) ต้องโหลด skill `/excel-com`** — ขั้นตอนบังคับ 10 ขั้น + กับดักทั้งหมด (REGEXREPLACE/packsize · VBA codepage 1252 · spill · เปลี่ยนรหัส/ชื่อยา · copy ชีทข้ามไฟล์ · ย้าย snapshot) ย้ายไปอยู่ในนั้น 19/10/2569 · 5 ข้อที่ห้ามพลาดแม้ไม่ได้เปิด skill:
1. **ห้ามเขียนด้วย SheetJS** (อ่านได้อย่างเดียว) — macro / table / สูตร structured reference หายหมด
2. **ไฟล์ใน OneDrive ห้ามเปิดผ่าน COM ตรงๆ แม้งานเล็ก** — AutoSave เซฟลงไฟล์จริงภายในวินาที → copy ไป scratchpad → แก้ → ตรวจ → วางกลับ
3. **`.xlsm` ใช้ `AutomationSecurity = 3` + แก้เฉพาะค่าเซลล์** — เพิ่ม/ลบ/copy ชีท หรือ security 1 แล้ว Save = VBA เป็น codepage 1252 แมโครอ่านชื่อชีทไทยไม่ได้
4. **`Calculate()` ห้าม `CalculateFull()` + diff ทีละเซลล์กับสำเนาเดิมก่อนวางกลับ** — Excel เครื่องนี้ไม่มี `REGEXREPLACE` packsize/หน่วยย่อย (Master AQ/AR) เพี้ยนแบบเงียบ ต้องไม่เปลี่ยน
5. **Excel ค้าง/ไฟล์ล็อก → ให้ user End task `EXCEL.EXE` เอง** — Claude ไม่ได้รับอนุญาตให้ kill process

### ขึ้นเดือนใหม่ในไฟล์ Master

**⛔ ก่อน `/upgrade-month-v3` ต้องโหลด `/month-rollover-traps`** (สูตร S/T/Z · มูลค่า · macro · ชีทวิเคราะห์ · ยืม-คืนมีมูลค่า) · ข้อที่ใช้นอกรอบขึ้นเดือนด้วย:
- ห้ามแทรกคอลัมน์ Master ก่อน AC (macro อ้าง index ตายตัว) · ห้ามรัน Module2 และห้ามแก้ชื่อชีทใน macro นั้น · ย้ายคอลัมน์ชีทวิเคราะห์ต้องแก้สกิลที่อ้างตัวอักษรคอลัมน์ด้วย
- ยืม-คืนตั้งแต่ ต.ค.69: แถว `คืนยา` ใส่ราคาทุนเดิม · แถว `ยืมยา` ใส่ราคาซื้อล่าสุด · ห้ามแก้ชนิดรายการ L ของแถวเบิกเป็น `ยืมยา`
- **⛔ แก้ยอดคงคลัง/มูลค่าของงวดที่ส่งบัญชีแล้วเมื่อไร ต้องแก้ไฟล์รายงานยอดส่งบัญชีของงวดนั้นตามทุกครั้ง** (user สั่ง 08/10/2569 — เคยแก้แค่ Master แล้วไฟล์รายงานค้างยอดเดิม) แล้ว verify ให้ตรงกันทุกไฟล์: Master snapshot · ไฟล์รายงาน · ไฟล์ที่หัวหน้าแก้ · ทะเบียนจัดซื้อ (รายละเอียด memory `sync-accounting-report-after-stock-fix`)

### นำเข้า Excel ผ่านปุ่มในแอป (`ExcelSync.jsx` — ADR-0027)

รายละเอียด (ด่าน, ส่วนต่างรายช่อง, ตัวเฝ้าไฟล์) อยู่ [docs/features/excel-sync.md](docs/features/excel-sync.md) — อ่านก่อนแก้ `ExcelSync.jsx` · `excelSync.js` · `applyExcelSync`

ไม่มี test runner ทั่วไป — golden tests เป็น standalone `node` (ไม่มี framework): `src/unitParser.test.js` (`npm run test:unit`), `src/lib/reorder.test.js` (`npm run test:reorder`), `src/lib/billGroup.test.js` (`npm run test:billgroup`), `src/lib/lotAllocation.test.js` (`npm run test:alloc`), `src/ledgerRollover.test.js` (`npm run test:ledger`), `src/ledgerSeed.test.js` (`npm run test:ledgerseed`), `src/lib/swapPolicy.test.js` (`npm run test:swappolicy`), `src/lib/consistencyCheck.test.js` (`npm run test:consistency`). **กฎ**: logic ที่ test แบบนี้ได้ต้องเป็น pure module ไม่ import `supabase` (เพราะ `supabase.js` ใช้ `import.meta.env` ที่ node รันไม่ได้) — ดู `billGroup.js`/`lotAllocation.js`/`ledgerRollover.js`/`ledgerSeed.js` แยกจาก `db.js` ด้วยเหตุนี้. **หมายเหตุ layout**: source module ของ ledger อยู่ใน `src/lib/` แต่ test file (`ledgerRollover.test.js`/`ledgerSeed.test.js`) อยู่ที่ `src/` root — ต่างจาก golden test อื่นที่วาง test ข้าง source

**E2E**: Playwright (`tests/01-15`) — `npx playwright test` · ไฟล์เดียว: `npx playwright test tests/14-stockcount-split.spec.js` — ครอบคลุม login, dashboard, requisition, return, staff flow, validation, permissions, **AP workflow UX, ทุก sub-app smoke, mobile responsive 375px, a11y, ระบบวิเคราะห์การสั่งซื้อยา, โมดอลใกล้หมดอายุ/คืนบริษัท (ประวัติรับยา+scope+deadline+ตัวกรองพับ), การ์ดคลัง lot (13), กรอกนับแยกชั้น (14), แถบปุ่มล่างจอ+การ์ดแนะนำ+ประวัติเบิกตั้งต้นของผู้เบิก 375px (15)** ดู [docs/testing.md](docs/testing.md). ⚠️ **03/04/05/06 กด "ส่งใบเบิก"/"บันทึกการคืนยา"/"อนุมัติ" จริง = เขียนลง Supabase ระบบจริง** (ไม่มี DB ทดสอบแยก) — รันเมื่อได้รับอนุญาตเท่านั้น; ชุดอ่านอย่างเดียว = 01/02/07/08/09/10/11/12/13/14/15/16/17 (16 = ปุ่มย้ายที่เก็บในแผนผัง — ห้ามกด "ย้าย" ในกล่องยืนยัน · 17 = หน้านโยบายคืนบริษัท). 13/14 ไม่เสถียรตอนรันขนานหลายไฟล์ (ตัวที่ตกเปลี่ยนทุกรอบ) — ตกให้รันไฟล์นั้นเดี่ยวซ้ำก่อนสรุป. 08 เขียนใหม่ 11/10/2569 ตามหน้า AP ปัจจุบัน (3 แท็บ + flow 3 ขั้น อ่านอย่างเดียว 5 เทส) · 13 Export Excel ใช้ `exact: true` (ชนปุ่ม "นำเข้าจาก Excel")

## Architecture

**⛔ ก่อนแก้ไฟล์ใน `src/` · `supabase/functions/` · `tests/` · `scripts/loan-slip.mjs` ต้อง Read [src/CLAUDE.md](src/CLAUDE.md) ก่อน (ครั้งเดียวต่อ session)** — **ไม่โหลดเอง** (ทดสอบ 19/10/2569: Read ไฟล์ใน `src/lib/` ผ่านส่วนขยาย VS Code ไม่มีเนื้อหา src/CLAUDE.md แนบมา) · **บังคับด้วย PreToolUse hook** [.claude/hooks/require-src-claude-md.mjs](.claude/hooks/require-src-claude-md.mjs) (19/10/2569): Edit/Write ไฟล์ใน path เหล่านี้ถูกปฏิเสธจนกว่าจะ Read src/CLAUDE.md หลัง /clear·compact ล่าสุด — ไม่ครอบการแก้ผ่าน Bash (sed/heredoc) · ในนั้น: app flow + navStack/history + PWA · data layer · pure modules · dead code · Key shared functions · **Critical Rules ตัวเต็ม** · **Do Not งานโค้ด** · ตัวชี้ไป [docs/architecture/](docs/architecture/) (Navigation shell · Sub-apps ทุกตัวรวมฟอร์มพิมพ์) (กฎ #10/#11 edge function · `clickMenu`/แถบล่างจอใน tests · anchor ใบยืม-คืนยา)
Single-page React (ไม่มี React Router) — ทุก Supabase query ผ่าน `src/lib/db.js` · schema [docs/schema.md](docs/schema.md)

## Documentation Index

| เรื่อง | ไฟล์ | อ่านเมื่อ |
|---|---|---|
| Domain glossary | [CONTEXT.md](CONTEXT.md) | **ก่อนคุย/แก้ domain logic** — ไฟล์ใหญ่ Grep หัวข้อก่อน |
| ADR | [docs/adr/](docs/adr/) | ก่อนเปลี่ยน architecture / หาเหตุผล decision เดิม |
| Auth & Roles | [docs/auth.md](docs/auth.md) | แก้ login/role/permission |
| anon key เต็มสิทธิ์ | [ADR-0016](docs/adr/0016-anon-key-full-db-access.md) | **ก่อนสร้างตารางใหม่** / เก็บข้อมูลประเภทใหม่ |
| Common patterns | [docs/patterns.md](docs/patterns.md) | **ทุกครั้ง** ก่อนแก้ component |
| DB schema, Excel cols | [docs/schema.md](docs/schema.md) | แก้ DB schema / Excel export |
| Monthly Stock Ledger | [ADR-0007](docs/adr/0007-monthly-stock-ledger.md) | แก้ `StockLedgerApp` / seed master CSV |
| กางชีทเบิกรายเดือน | [ADR-0020](docs/adr/0020-dispense-sheet-unpivot-true-date.md) · [CONTEXT.md §ชีทเบิกรายเดือน](CONTEXT.md) | นำเข้าเดือนย้อนหลัง |
| นโยบายคืนยา tier % + cond_am | [ADR-0014](docs/adr/0014-structured-return-policy-tier-percent.md) · [ADR-0015](docs/adr/0015-cond-am-does-not-override-explicit-tier.md) | แก้เตือนคืนบริษัท (sync 4 ที่ + redeploy edge fn) |
| รอบเปลี่ยน/คืนบริษัท VX | [ADR-0024](docs/adr/0024-vendor-exchange-cycle-number.md) · [CONTEXT.md §เลขที่รอบ](CONTEXT.md) | แก้ `vendorExchange.js` / ฟอร์มคืนบริษัท |
| ยืม-คืนมีมูลค่า | [handoff](docs/handoff-2026-10-04-loan-valuation.md) · [design](docs/design-loan-valuation.md) | แก้มูลค่ายืม-คืนใน Master / ขึ้นเดือน |
| ของส่งต่อผู้ดูแลไม่นับค้างคืน | [ADR-0025](docs/adr/0025-pass-through-loan-closed-on-handover.md) · [CONTEXT.md §ของค้างคืน](CONTEXT.md) | แก้ `DrugLoanApp` |
| ออกแบบ Dashboard ใหม่ | [handoff](docs/handoff-2026-10-10-dashboard.md) · [scripts](docs/handoff-2026-10-10-dashboard-scripts/) | grill ต่อ / แก้กฎตัดแถวของเรท |
| Navigation + Sub-apps | [navigation-shell.md](docs/architecture/navigation-shell.md) · [sub-apps.md](docs/architecture/sub-apps.md) | แก้เมนู/แถบล่างจอ · แก้ sub-app หรือฟอร์มพิมพ์ |
| Roadmap | [docs/roadmap.md](docs/roadmap.md) | วางแผน feature ใหม่ |
| Testing | [docs/testing.md](docs/testing.md) | รัน/แก้ test |
| Deployment | [docs/deployment.md](docs/deployment.md) | ขึ้นเว็บจริง / deploy ไม่ผ่าน |
| ใบเบิกออนไลน์ → ชีทเบิก | [docs/features/online-requisition.md](docs/features/online-requisition.md) | ลงใบเบิกออนไลน์ห้องยาG / แก้ `online-req.mjs` · `onlineReqPlan.js` |
| บอทประกาศรอบเบิก-รับ | [docs/features/requisition-announce.md](docs/features/requisition-announce.md) | แก้บอท / ปฏิทินวันหยุด |
| Expiry Alert Edge Function | [docs/expiry-alert-edge-function.md](docs/expiry-alert-edge-function.md) | แก้/deploy expiry alert |
| Apps Script expiry (backup) | [docs/apps-script-expiry-alert.md](docs/apps-script-expiry-alert.md) | reference สคริปต์เดิม |
| INVS มาตรฐาน สธ. | [docs/invs-warehouse-reference.md](docs/invs-warehouse-reference.md) | **ก่อนออกแบบฟีเจอร์คลังใหม่** |
| แผนปรับกระบวนการตาม INVS | [docs/handoff-invs-2026-08-24.md](docs/handoff-invs-2026-08-24.md) | สานงานโครงสร้างหน่วยงาน/ค้างจ่าย |
| วิธีทำงานกับ AI (Nate Herk) | [docs/reference-nateherk-ai-automation.md](docs/reference-nateherk-ai-automation.md) | ปรับ CLAUDE.md/skill/hook · **token ไม่พอ** |
| สร้างแอปมือถือ (2 คลิป) | [docs/reference-mobile-app-videos.md](docs/reference-mobile-app-videos.md) | ก่อน pilot เบิกออนไลน์ / คิดทำ native-PWA |
| ดีไซน์เมนู + แผนผัง | [docs/reference-sidebar-map-design.md](docs/reference-sidebar-map-design.md) | ก่อนปรับเมนู/แผนผังอีกรอบ |

## Skills (`.claude/skills/`)

คำอธิบายทุกตัวมีในรายการ skill ของระบบอยู่แล้ว ที่นี่เก็บเฉพาะข้อบังคับ:
- `/excel-com` — **โหลดก่อนเขียน `.xlsm`/`.xlsx` ของคลังทุกครั้ง**
- `/dispense-entry` · `/bill-entry` — โหลดก่อนอ่านรูปใบเบิก/บิล
- `/month-rollover-traps` — โหลดคู่กับ `/upgrade-month-v3`
- `/close-month-notice` — **ทำทุกเดือนหลังปิดยอด**
- `/apply-location-moves` — check-complete เจอใบ pending รันเลยไม่ต้องถาม (อนุญาตถาวร 27/10/2569) · conflict ถาม user
- `/handoff` — ก่อน `/clear` ที่ ~250K token ([hook](.claude/hooks/context-guide.mjs) เตือนเอง) · วัดผล `python -B scripts/tok.py --since <วันที่>`
- `/purchase-request-report` — หลัง publish ทุกรอบทำสำเนา `archive_copy.ps1` (user สั่ง 14/10/2569)

**เมื่อสร้าง UI ใหม่ → อ่าน `.claude/skills/ui-style-guide/SKILL.md` ก่อนเสมอ**

## Workflow

### Karpathy Principles (รายละเอียด `/karpathy-checklist`)

1. **Think Before Coding** — บอก assumption · ตีความได้ 2 แบบให้ถาม user
2. **Simplicity First** — โค้ดน้อยที่สุดที่ตอบโจทย์ · มี skill แล้วใช้ skill
3. **Surgical Changes** — แตะเฉพาะที่ขอ ทุกบรรทัดต้องโยงกลับคำขอได้
4. **Goal-Driven** — ทุกขั้นมีเกณฑ์ verify

---

1. **อ่าน CLAUDE.md ก่อนเสมอ** — และ point ไปยัง doc ที่เกี่ยวข้อง
2. **อ่านไฟล์ที่จะแก้ก่อน** — ห้าม assume โครงสร้าง
3. **เช็ค skill** — ถ้างานตรงกับ skill ให้ใช้แทนเขียนใหม่
4. **แก้เฉพาะที่ถาม** — ไม่ refactor รอบข้าง ไม่เพิ่ม feature ที่ไม่ได้ขอ
5. **ตรวจ db.js** — เพิ่ม/แก้ field ใดๆ ต้องอัพเดต `src/lib/db.js`
6. **Thai text** — UI ทั้งหมดเป็นภาษาไทย (ยกเว้น field/code/technical term)
7. **อัพเดตเอกสารอัตโนมัติ** — หลังเสร็จงาน ถ้าเอกสารยังไม่ครอบคลุม ให้สรุปเพิ่มในไฟล์ที่เหมาะสม (CLAUDE.md หรือ docs/)

### Verify ก่อนสรุป (CRITICAL)

**กฎเหล็ก: อย่าเชื่อสมมติฐานแรก — ตรวจสอบทุกครั้งก่อนสรุป/แก้โค้ด**

- **ก่อนแก้บั๊ก**: ต้อง reproduce ปัญหาได้ก่อน — อ่านโค้ดจริง (Read tool) ไม่ใช่เดาจากชื่อไฟล์/ฟังก์ชัน
- **ก่อนรายงานว่าเสร็จ**: ต้อง verify ว่าการแก้ทำงานจริง — รัน `npm run lint` หรือ `npm run build` เป็นอย่างน้อย
- **ก่อนอ้างว่าฟีเจอร์ใช้ได้**: ถ้าเป็น UI → ต้องทดสอบใน browser; ถ้าทดสอบไม่ได้ → บอกชัดเจนว่ายังไม่ได้ทดสอบ
- **ก่อนเชื่อ memory/CLAUDE.md**: ถ้า memory ระบุว่ามี function/file ใด → grep หรือ Read ยืนยันว่ายังมีอยู่จริง
- **เจอข้อมูลขัดแย้ง** (memory vs โค้ดจริง) → เชื่อโค้ดจริง แล้วอัพเดต memory/CLAUDE.md
- **อย่าสรุปจากข้อมูลแค่ส่วนเดียว** — ถ้า query Supabase ได้ ≤ 1000 rows ต้องใช้ `fetchAllRows` ก่อนสรุป

### Commit & PR Convention

**Commit message** (ภาษาไทยได้ — ตามสไตล์ repo เดิม):
- `แก้บั๊ก: <สรุปสั้น>` — bug fix
- `เพิ่ม: <feature>` — new feature
- `ปรับ: <สิ่งที่ปรับ>` — enhancement / UI tweak
- `refactor: <ส่วนที่จัด>` — refactor ไม่เปลี่ยนพฤติกรรม
- `docs: <ไฟล์/หัวข้อ>` — เอกสาร (เช่น `docs: อัพเดต CLAUDE.md`)
- เน้น **"ทำไม"** มากกว่า "ทำอะไร" (diff บอก what อยู่แล้ว)
- 1 commit = 1 logical change

**ก่อน commit ทุกครั้ง**:
1. lint **เฉพาะไฟล์ที่คุณแก้** ผ่าน (`npx eslint <ไฟล์>`) — ⚠️ `npm run lint` ทั้ง repo **ไม่ใช่ 0**: มี error ค้างเดิม **41 ตัว (56 problems รวม warning ณ 2026-09-23)** ในไฟล์ committed (ReceiveLog/Requisition/Dispense/Return/Analytics + tests — set-state-in-effect, empty block, `use()` ใน try/catch, `process` undefined ใน test) ที่ไม่เกี่ยวกับงานคุณ — ห้ามไป "แก้" error เหล่านั้นเว้นแต่ถูกขอ และอย่าตกใจว่าตัวเองทำพัง. **เทียบ baseline ก่อนโทษตัวเอง**: `git stash && npx eslint <ไฟล์> ; git stash pop` แล้วนับ error ก่อน/หลัง — ถ้าจำนวนเท่าเดิม = ไม่ได้ทำพัง
2. ตรวจ `git diff` — ไม่มีไฟล์/secret ที่ไม่ตั้งใจ commit (`.env`, `test-results/`, `supabase/.temp/`)
3. ห้าม `--no-verify` หรือ skip pre-commit hook

**PR convention**:
- title สั้น (< 70 ตัวอักษร)
- body: Summary (1-3 bullet) + Test plan (checklist)
- ไฟล์ migration SQL (`*.sql`) ต้องระบุในใน PR ว่าต้องรันใน Supabase Dashboard ก่อน deploy

**ไม่ทำเอง — ต้องรอ user สั่ง**: `git commit`, `git push`, `gh pr create`, `git reset --hard`, `git push --force`

**⛔ โควตา Netlify แผน Free = deploy ได้ ~20 ครั้ง/เดือน (user เลือกอยู่ Free ต่อ 28/10/2569)** — push ขึ้น `main` = deploy 15 เครดิต จาก 300/รอบ (รอบเริ่มวันที่ 11) เครดิตหมด = push แล้วไม่ขึ้นเว็บจนรอบใหม่:
1. **รวม commit ไว้ แล้ว push วันละครั้ง** — user สั่ง push แต่วันนี้ deploy ไปแล้ว → บอกก่อนว่ารอบนี้ใช้ไปกี่ครั้ง/เหลือเท่าไหร่ แล้วถามว่าจะ push เลยหรือรอรวม
2. **commit เอกสารล้วน (`docs/`, `*.md`, skill, memory) ใส่ `[skip ci]` ท้ายบรรทัดแรกเสมอ**
3. **Netlify ดู `[skip ci]` เฉพาะ commit บนสุดของการ push** — มีโค้ดรวมอยู่ด้วย ห้ามให้ commit บนสุดเป็น `[skip ci]` (โค้ดไม่ขึ้นเว็บแบบเงียบ)
4. วิธีนับ deploy ในรอบ + รายละเอียด → [docs/deployment.md §โควตา build](docs/deployment.md)

### เมื่อเพิ่มฟีเจอร์ใหม่
- กระทบ 2+ ไฟล์ → `/plan` ก่อน
- column ใหม่ใน DB → `/add-db-column`
- column ใหม่จาก CSV เท่านั้น → `/add-csv-column`
- print view ใหม่ → `/new-print`
- search bar ใหม่ → `/drug-search-bar`
- ก่อน deploy → `/pipeline`

### เมื่อแก้บั๊ก
- อ่าน error message ก่อน — ระบุสาเหตุก่อน switch approach
- ถ้า supabase return null → เช็ค `.env` และ RLS policy ก่อน
- ถ้า CSV import ผิด → เช็ค `_matchHeader()` และ `getVal()` ใน `db.js`

### กฎอัพเดตเอกสาร
- เพิ่มฟังก์ชันใน `db.js` → บันทึก signature + พฤติกรรมสำคัญ (เช่น DELETE-then-INSERT, backfill)
- เปลี่ยน filter/sort logic → อัพเดต rule เดิม ไม่ duplicate
- เพิ่ม DB schema หรือ SQL → บันทึกใน `docs/schema.md`
- แก้ bug ที่มี root cause ซับซ้อน → บันทึก "Do Not" rule (ไม่ต้องเขียน postmortem)
- รายละเอียดเฉพาะ feature → เพิ่มใน `docs/features/{feature}.md`
- domain term ใหม่/นิยามที่ขัดแย้ง → `CONTEXT.md` (glossary เท่านั้น ไม่ใส่ implementation)
- decision ที่กลับยาก → `docs/adr/` (เกณฑ์ + format ดู `/grill-with-docs`)

### Skills vs Subagents

| สถานการณ์ | ใช้อะไร |
|-----------|--------|
| มี pattern ซ้ำ (print, search bar, excel, chart) | **Skill** |
| ค้นหา/สำรวจ codebase กว้าง ไม่รู้ path | **Subagent Explore** |
| งาน 2 อย่างที่ไม่ depend กัน | **Parallel tool calls** ใน message เดียว |
| รู้ path ชัดเจน | **Read/Edit/Grep โดยตรง** |
| อยากได้ reviewer ที่ไม่มีอคติ | **Subagent** — ตื่นมาไม่เห็นบริบทที่คุยกันมา จึงวิจารณ์ตรง |
| กำลังจะเทผลกองใหญ่ที่ไม่ได้อ่านซ้ำลงแชท | **Subagent** — ไม่เปื้อน context หลัก ⚠️ แต่ token **รวมแพงกว่า 7-10 เท่า** (ตื่นมาพร้อม context เต็มของตัวเอง) คุ้มเมื่อให้มันใช้โมเดลถูกกว่า |

**เกณฑ์ตัดสินประโยคเดียว**: "กำลังจะเทกองข้อมูลที่ไม่มีวันอ่านซ้ำลงแชทไหม" — ใช่ → delegate

**ไม่ต้องใช้ subagent เมื่อ** (ฝืนใช้แล้วผลแย่ลง):
- แก้เล็กจุดเดียว / รู้คำตอบอยู่แล้ว
- ขั้นตอนพึ่งกันเป็นลำดับ (1→2→3→4) — แยกกันทำไม่ได้
- ต้องใช้บริบททั้งบทสนทนา
- ต้องถามกลับ user ระหว่างทาง — **คุยกับ subagent ไม่ได้** main session เป็น orchestrator ทางเดียว
- ต้องให้ agent คุยกันเอง → นั่นคือ agent team คนละกลไก (แพงกว่า)

### Parallelization
- ✓ Read หลายไฟล์ในคำสั่งเดียว
- ✓ Grep + Glob พร้อมกัน
- ✗ อย่า Edit ไฟล์ก่อน Read ไฟล์นั้น
- ✗ อย่า build ก่อน lint ผ่าน

## Technical References

- **DB layer**: `src/lib/db.js` — query/insert/delete ทุกตัวอยู่ที่นี่เท่านั้น
- **Supabase client**: `src/lib/supabase.js` — อย่า import ตรงใน component
- **Icon**: `lucide-react` — ห้ามใช้ emoji ใน UI, ห้าม icon library อื่น
- **Date format**: DB = ISO `YYYY-MM-DD`, UI = `DD/MM/YYYY` (พ.ศ. +543)
- **Thai font in print**: Sarabun ผ่าน Google Fonts (ใน print popup เท่านั้น)
- **Env vars**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` ต้องมาจาก `.env`
- **Tailwind**: 3.x — เลี่ยง arbitrary values (`w-[123px]`) ถ้าทำได้
- **React**: 19.x — functional components + hooks เท่านั้น

### Key shared functions

**ย้ายไป [src/CLAUDE.md](src/CLAUDE.md) §Key shared functions** — `fetchDashboardAlerts` · บัตรยา/ค้นหา · `fetchDashboardCharts` · `printApBatch` · `printTrackingList` · `resolveAuditUserName` · `resolveDispenseDepartment` · `fetchInventoryLocations` · `importDrugLoans` · `billMatchesQuery` · `matchReceiveDetails` + AP Workflow stages + Picking workflow actions

## Critical Rules (ต้องอ่าน)

**ตัวเต็มย้ายไป [src/CLAUDE.md](src/CLAUDE.md) §Critical Rules — ไม่โหลดเอง ต้อง Read ก่อนแก้โค้ด (ดู §Architecture)** — เลขกฎเดิม (โค้ด/เอกสารอ้าง "CLAUDE.md rule #N") · ดัชนี:

- #1 Audit Log Auth
- #2 Supabase 1000-row limit
- #3 Date Input
- #4 Print view
- #5 Mobile layout
- #6 Stat consistency
- #7 Department list 2 ระบบ
- #8 ReceiveLog scan
- #9 Debugging data issues
- #10 Edge Function email UTF-8
- #11 drug_swap_policy เป็น merged column
- #12 Notification & AuditLog sync
- #13 Reorder single source of truth
- #22 Import master CSV "วิเคราะห์สั่งซื้อ" = header detect + strip emoji
- #14 Date input อ่าน [docs/patterns.md](docs/patterns.md) ก่อนเสมอ
- #15 Summary chart lookup ต้องใช้ map เต็ม ไม่ใช่ sliced top-N
- #16 NON_DEPARTMENTS ใน DispenseLogApp
- #17 AP Workflow search ค้นชื่อยาได้
- #18 dataRange state ใน summary modal
- #19 AP bill identity = composite key ไม่ใช่ bill_number
- #20 ยืนยันตรวจรับ = บังคับ checklist + รูป
- #21 บิลสแกน AI ต้อง map drug_code ผ่าน `drug_name_alias`
- #22 Stock Ledger identity = cost-layer key, ปิดงวด freeze
- #23 Permission = role baseline + per-user grant (key ต้องตรง 3 ที่)

## Do Not (Hard Rules)

กฎเฉพาะงานโค้ดอีก 11 ข้ออยู่ [src/CLAUDE.md](src/CLAUDE.md) §Do Not งานโค้ด

- **🛑 อย่าพิมพ์ tool call เป็นข้อความ (กันหยุดกลางคัน)** — ทุกครั้งที่จะเรียก tool **ต้องเป็น proper tool invocation ผ่านระบบจริง** ห้าม emit `<invoke …>` / `<parameter …>` เป็น text ใน response เด็ดขาด เพราะมันจะกลายเป็นข้อความธรรมดา → turn จบโดย tool ไม่ทำงาน → "หยุดเอง". **เตือนตัวเองทุก turn:** (1) ก่อนปิด turn ถ้ายังมีงานค้าง ต้องมี tool call จริง ไม่ใช่ text ที่หน้าตาเหมือน tool call; (2) หลังเรียก tool ต้อง **เห็น tool result กลับมาก่อน** จึงเขียนข้อความสรุป — ถ้าไม่เห็น result แปลว่า call ไม่ได้ส่ง ให้เรียกใหม่ทันที **ห้ามจบ turn**. กับดักนี้มักเกิดหลัง `ToolSearch` โหลด schema ใหม่ (เช่น MCP) — ระวังเป็นพิเศษ
- **อย่าเรียก `supabase` โดยตรงในไฟล์ component** — ต้องผ่าน `src/lib/db.js` เสมอ
- **อย่าสร้างไฟล์ `.css` แยก** — Tailwind utility เท่านั้น
- **อย่า hardcode ค่าใดๆ ที่ควรมาจาก `.env`** — โดยเฉพาะ API key และ URL
- **อย่าเพิ่มฟีเจอร์ที่ไม่ได้ถูกขอ** — แก้เฉพาะที่ถาม ไม่ refactor รอบข้าง
- **อย่าใช้ mock/hardcode data ใน component** — ถ้าไม่มี supabase ให้ return null หรือ empty state
- **อย่าใช้ emoji ใน UI** — ใช้ `lucide-react` เท่านั้น
- **อย่าเปลี่ยน UI text เป็นภาษาอังกฤษ** — ทุก label, placeholder, alert ต้องเป็นภาษาไทย
- **อย่าเพิ่ม comment อธิบายโค้ดที่ self-evident** — เพิ่ม comment เฉพาะ logic ซับซ้อน
- **อย่า push หรือ commit โดยไม่ได้รับคำสั่ง** — ถามก่อนเสมอ
- **ยาออกจากบัญชี (มติ PTC) ต้องตั้งธง 2 ที่ — ที่เดียวไม่พอ**: (1) **Master คอลัมน์ A "ผลการพิจารณา"** `คงไว้`→`ตัดออก` ทุกแถวของรหัส = ที่**แอป**อ่าน (`masterSheet.js` → `inventory.receive_status` = `<C สถานะตรวจรับ>|<A>` → `RequisitionApp`/`App.jsx` เช็ค `includes('ตัดออก')`: หน้าเบิกติดหมายเหตุ "ยาตัดออกจากบัญชี" ไม่บล็อก · ภาพรวมสต็อก/การ์ด "รายการยาในคลัง" ไม่นับ · **แต่ยังเตือนหมดอายุ** ทั้งโมดอลแจ้งเตือน/แผนผัง/บอท expiry-alert พร้อมป้าย "ตัดออกจากบัญชี" — ยาออกบัญชีไม่มีคนเบิก เสี่ยงหมดอายุบนชั้นที่สุด (21/10/2569 เคส Cefdinir 60 ขวดหายจากการเตือน · รายการคืนบริษัท `fetchSwapReturnDue`/returnDue ของบอทยังกรองตัดออกอยู่)) (2) **ชีทวิเคราะห์ AI** `✂️ ตัดออก` = คุมการคำนวณสั่งซื้อ/รายงานแจ้งซื้อ/`drug_reorder_config` · ตั้งแค่ AI แอปไม่รู้ว่าออกบัญชี (scrutinize 14/10/2569 — มติ PTC 9/10/69 10 รหัส ดู memory `ptc-formulary-2570`) · แล้ว `import:master` + `import:reorder`
