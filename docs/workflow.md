# Workflow รายละเอียด (ย้ายจาก CLAUDE.md 27/11/2569)

> ย้ายคำต่อคำจาก root `CLAUDE.md` เพื่อให้ CLAUDE.md อยู่ในแนวทาง Nate Herk (≤ 200 บรรทัด — hook `.claude/hooks/claude-md-size.mjs` เตือน) · กฎที่ห้ามพลาดยังสรุปไว้ใน CLAUDE.md · อ่านไฟล์นี้เมื่อ: นำเข้า Excel ผ่าน CLI · รัน test · commit/PR/deploy · เพิ่มฟีเจอร์/แก้บั๊ก · อัพเดตเอกสาร · เปิดเว็บที่ต้องล็อกอิน / ใช้ MCP supabase

## นำเข้า Excel CLI — นำเข้า Excel เข้า DB ผ่าน CLI (`scripts/*.mjs`)

อ่าน `.xlsm` ใน OneDrive ตรงๆ แทนการ copy sheet → Save As CSV → อัปโหลดผ่านหน้าเว็บ — **ใช้ `/import-excel` skill** ซึ่งมีกับดักครบ (serial วันที่ปนรูปแบบ, พ.ศ. ใน serial, lot ที่มีตัว E)

```bash
npm run import:receive   # ชีท 'รับยา'          → receive_logs      🔴 DELETE ALL
npm run import:master    # ชีท Master           → inventory         🔴 DELETE ALL
npm run import:dispense  # ชีท 'เบิก '          → dispense_logs     🔴 DELETE ALL
npm run import:reorder   # ชีท วิเคราะห์สั่งซื้อ → drug_reorder_config 🟢 UPSERT
npm run import:loan      # ชีท 'รพ.ยืมยา'       → drug_loan         🟢 diff insert/update
npm run import:purchase  # รายงานการซื้อยา_69.xlsx → purchase_request 🔴 DELETE ALL (ADR-0030)
npm run import:ledger -- --sheet Master_ต.ค.69  # ชีท snapshot ปิดงวด → stock_ledger งวด closed 🟡 แทนทั้งงวด (ADR-0031 · ทุกเดือนหลังปิดยอด)
npm run export:csv       # ทุกชีท → csv_file/*.csv (ไม่แตะ DB)
npm run import:restore   # กู้คืนจาก backup/*.json
node scripts/stock.mjs <คำค้น> [--all]  # เช็คคงเหลือยาจากชีท Master (อ่านอย่างเดียว — สกิล /stock-check)
```

**ทุกตัวเป็น dry-run โดยค่าเริ่มต้น ต้องใส่ `--commit` ถึงเขียนจริง** — `--commit` **ไม่ใช่ `git commit`** มันคือ "ปุ่มอัปโหลด" ที่เคยกดบนหน้าเว็บ (ผู้ใช้เคยเข้าใจผิด 2026-09-22) สำรองอัตโนมัติก่อนเขียนเสมอ — สำรองไม่สำเร็จ = ไม่เขียน

**CLI ไม่ทำ DELETE/INSERT เอง** แต่เรียกฟังก์ชันใน `db.js` ตัวเดียวกับที่หน้าเว็บใช้ (`insertReceiveRows` ฯลฯ) เพื่อไม่ให้ตรรกะ import แตกเป็น 2 ชุดแล้วดริฟต์

⚠️ **path ไฟล์ default ในสคริปต์เป็นของเครื่องเก่า** (`C:/Users/PRH0000484/OneDrive/...`) — เครื่องอื่นต้องใส่ `--file "<path>"` ทุกครั้ง

## Test + นำเข้า Excel ผ่านปุ่มในแอป (`ExcelSync.jsx` — ADR-0027)

รายละเอียด (ด่าน, ส่วนต่างรายช่อง, ตัวเฝ้าไฟล์) อยู่ [docs/features/excel-sync.md](features/excel-sync.md) — อ่านก่อนแก้ `ExcelSync.jsx` · `excelSync.js` · `applyExcelSync`

Golden tests = standalone `node` ไม่มี framework — รายชื่อ+ที่อยู่ไฟล์ [docs/testing.md §Golden tests](testing.md) · **กฎ**: logic ที่ test แบบนี้ได้ต้องเป็น pure module ไม่ import `supabase` (`supabase.js` ใช้ `import.meta.env` ที่ node รันไม่ได้ — จึงแยก `billGroup.js`/`lotAllocation.js`/`ledgerRollover.js` ออกจาก `db.js`)

**E2E**: Playwright `tests/` — `npx playwright test` · ไฟล์เดียว `npx playwright test tests/<ไฟล์>` · แต่ละไฟล์ครอบอะไร [docs/testing.md](testing.md) · ⚠️ **03/04/05/06 กด "ส่งใบเบิก"/"บันทึกการคืนยา"/"อนุมัติ" จริง = เขียนลง Supabase ระบบจริง** (ไม่มี DB ทดสอบแยก) — รันเมื่อได้รับอนุญาตเท่านั้น · ไฟล์อื่นอ่านอย่างเดียว (16 ห้ามกด "ย้าย" ในกล่องยืนยัน · 19 ห้ามกดเพิ่มแถว/บันทึก) · 13/14 ตกตอนรันขนาน → รันไฟล์นั้นเดี่ยวซ้ำก่อนสรุป

## Commit & PR Convention

**Commit message** (ภาษาไทยได้ — ตามสไตล์ repo เดิม):
- `แก้บั๊ก: <สรุปสั้น>` — bug fix
- `เพิ่ม: <feature>` — new feature
- `ปรับ: <สิ่งที่ปรับ>` — enhancement / UI tweak
- `refactor: <ส่วนที่จัด>` — refactor ไม่เปลี่ยนพฤติกรรม
- `docs: <ไฟล์/หัวข้อ>` — เอกสาร (เช่น `docs: อัพเดต CLAUDE.md`)
- เน้น **"ทำไม"** มากกว่า "ทำอะไร" (diff บอก what อยู่แล้ว)
- 1 commit = 1 logical change

### ก่อน commit

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
4. วิธีนับ deploy ในรอบ + รายละเอียด → [docs/deployment.md §โควตา build](deployment.md)

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

## Parallelization
- ✓ Read หลายไฟล์ในคำสั่งเดียว
- ✓ Grep + Glob พร้อมกัน
- ✗ อย่า Edit ไฟล์ก่อน Read ไฟล์นั้น
- ✗ อย่า build ก่อน lint ผ่าน

## เบราว์เซอร์ที่ต้องล็อกอิน + MCP supabase

- **เปิดเว็บที่ต้องล็อกอิน (Supabase Dashboard · Google · GitHub) ให้ user ล็อกอินแล้ว Claude กดต่อ** (user สั่ง 19/11/2569): **ห้ามใช้ Chromium ของ Playwright** (`launch`/`launchPersistentContext`) — มีธง automation หน้า Sign in ขึ้น "เบราว์เซอร์ไม่ปลอดภัย" → `powershell -File scripts/open-chrome.ps1 -Url <url>` เปิด **Google Chrome ตัวจริง** โปรไฟล์ถาวร `%LOCALAPPDATA%\claude-chrome` (แยกจาก Chrome ประจำ · ล็อกอินครั้งเดียวใช้ต่อได้) → user ล็อกอินเอง → Claude ทำทีละขั้น `node scripts/chrome-cdp.cjs "<โค้ด page>" <ภาพ.png> <คำใน URL>` · ปุ่มสร้างความลับ (เช่น Create token ของ Supabase) ไม่รับคลิกจากสคริปต์ → ให้ user กดเอง · token/รหัสผ่านอ่านในสคริปต์แล้วส่งต่อตรง ห้ามพิมพ์ลงแชท/ถ่ายภาพหน้าที่มี token
- **MCP supabase (ให้ Claude รัน SQL/migration เอง) — ใช้ได้แล้ว 19/11/2569**: token แบบ scoped ชื่อ `claude-code` · โปรเจกต์ Project_warehouseapp · RW Database/Migrations/Edge Functions · R Project Settings/Advisors/Logs · **หมดอายุ 30/06/2570** · ตั้งที่ user scope (`claude mcp list` → `supabase … ✓ Connected`) · หลังเปลี่ยน token ต้อง **Reload Window** ถึงจะใช้ใน session ได้ · `execute_sql` ตอบ Unauthorized = token หมดอายุ → ต่ออายุด้วย [scripts/supabase-token-capture.cjs](../scripts/supabase-token-capture.cjs) (วิธีใช้อยู่หัวไฟล์ · **Expires ต้องไม่เกิน 1 ปีจากวันนี้** ตั้ง 1 ปีพอดีแล้ว Supabase ไม่รับ)

## Skills vs Subagents
skill เมื่อมี pattern ซ้ำ · subagent เฉพาะ user สั่ง หรือจะเทกองข้อมูลที่ไม่อ่านซ้ำลงแชท (token รวมแพงกว่า 7–10 เท่า · ถามกลับ user ระหว่างทางไม่ได้) — ตารางเต็ม [docs/reference-nateherk-ai-automation.md §Skills vs Subagents](reference-nateherk-ai-automation.md)
