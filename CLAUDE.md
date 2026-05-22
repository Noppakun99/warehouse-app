# CLAUDE.md

คู่มือสำหรับ Claude Code ทำงานกับ repo นี้ — เก็บแต่ภาพรวม convention และ pointer ไป `docs/`

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

ไม่มี test runner — `unitParser.test.js` เป็น standalone script รันด้วย `node src/unitParser.test.js` (E2E ใช้ Playwright ดู [docs/testing.md](docs/testing.md))

## Architecture

Single-page React app (no React Router) สำหรับระบบคลังยาโรงพยาบาล — routing ทำผ่าน `page` state string ใน `AppRoot.jsx`

**App flow:**
1. `AppRoot.jsx` handle login + render sub-app ตาม `page` state
2. Auth = username + SHA-256 password (Web Crypto), เก็บใน `app_users` table
3. First-run: ถ้า `app_users` ว่าง → แสดง admin setup
4. 3 roles: `requester`, `staff`, `admin` (ดู [docs/auth.md](docs/auth.md))

**Sub-apps (component แยกอิสระ):**
- `App.jsx` — Inventory map, CSV upload, drug grid (ดู [docs/features/inventory-map.md](docs/features/inventory-map.md))
- `RequisitionApp.jsx` — เบิกยา + picking workflow (ดู [docs/features/picking-workflow.md](docs/features/picking-workflow.md))
- `DispenseLogApp.jsx` — ประวัติเบิกจ่าย
- `ReceiveLogApp.jsx` — ประวัติรับยา + สแกนบิล AI (ดู [docs/features/invoice-scanner.md](docs/features/invoice-scanner.md))
- `ReturnApp.jsx` — บันทึกคืนยา (ดู [docs/features/return.md](docs/features/return.md))
- `AnalyticsApp.jsx` — วิเคราะห์เบิกยา (ดู [docs/features/analytics.md](docs/features/analytics.md))
- `AuditLogApp.jsx` — ดู audit log
- `UserManagementApp.jsx` — admin จัดการ user

**Data layer:**
- ทุก Supabase query ผ่าน `src/lib/db.js` — component ห้ามเรียก `supabase` ตรงๆ
- `src/lib/supabase.js` init จาก `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- ถ้า `.env` ขาด → `supabase` = `null` และ fallback in-memory

**Schema:** ดู [docs/schema.md](docs/schema.md)

**Reusable:** `DrugSearchBar.jsx`, `SearchableSelect.jsx`

## Documentation Index

| Topic | File | อ่านเมื่อ |
|-------|------|----------|
| Auth & Roles, permissions | [docs/auth.md](docs/auth.md) | แก้ login/role/permission |
| Common patterns (date, mobile, print, dept, audit auth, stats) | [docs/patterns.md](docs/patterns.md) | **อ่านทุกครั้ง** ก่อนแก้ component |
| DB schema, migrations, Excel cols | [docs/schema.md](docs/schema.md) | แก้ DB schema / Excel export |
| Roadmap | [docs/roadmap.md](docs/roadmap.md) | วางแผน feature ใหม่ |
| Testing | [docs/testing.md](docs/testing.md) | รัน/แก้ test |

## Skills (`.claude/skills/`)

| Slash command | สรุปสั้น |
|---------------|---------|
| `/plan` | วางแผน feature ก่อนลงมือ |
| `/pipeline` | รัน lint → build → test ตามลำดับ |
| `/add-db-column` | เพิ่ม column ใน Supabase + wire ผ่าน db.js + CSV |
| `/add-csv-column` | เพิ่ม column จาก CSV (ไม่ใช่ DB) |
| `/new-print` | สร้าง print view (`window.open` + Blob URL) |
| `/drug-search-bar` | เพิ่ม DrugSearchBar autocomplete + badge |
| `/dispense-summary-modal` | Dispense summary modal pattern |
| `/monthly-stats-table` | ตาราง drug × month + sticky header |
| `/excel-export` | ปุ่ม Export Excel (.xlsx) + audit log |
| `/ui-style-guide` | Tailwind: สี, layout, buttons, inputs |

**เมื่อสร้าง UI ใหม่ → อ่าน `.claude/skills/ui-style-guide.md` ก่อนเสมอ**

## Workflow

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
1. `npm run lint` ผ่าน
2. ตรวจ `git diff` — ไม่มีไฟล์/secret ที่ไม่ตั้งใจ commit (`.env`, `test-results/`, `supabase/.temp/`)
3. ห้าม `--no-verify` หรือ skip pre-commit hook

**PR convention**:
- title สั้น (< 70 ตัวอักษร)
- body: Summary (1-3 bullet) + Test plan (checklist)
- ไฟล์ migration SQL (`*.sql`) ต้องระบุในใน PR ว่าต้องรันใน Supabase Dashboard ก่อน deploy

**ไม่ทำเอง — ต้องรอ user สั่ง**: `git commit`, `git push`, `gh pr create`, `git reset --hard`, `git push --force`

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

### Skills vs Subagents

| สถานการณ์ | ใช้อะไร |
|-----------|--------|
| มี pattern ซ้ำ (print, search bar, excel, chart) | **Skill** |
| ค้นหา/สำรวจ codebase กว้าง ไม่รู้ path | **Subagent Explore** |
| งาน 2 อย่างที่ไม่ depend กัน | **Parallel tool calls** ใน message เดียว |
| รู้ path ชัดเจน | **Read/Edit/Grep โดยตรง** |

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

## Critical Rules (ต้องอ่าน)

รายละเอียดทุก rule อยู่ใน [docs/patterns.md](docs/patterns.md) — สรุปเฉพาะหัวข้อที่ต้องระวัง:

1. **Audit Log Auth**: ทุก `exportToExcel`, `insertReceiveRows`, `insertAuditLog` ต้องส่ง `auth` ครบ — ไม่งั้น user_name = `-`
2. **Supabase 1000-row limit**: dropdown ชื่อยา + aggregate stats ต้องใช้ `fetchAllRows` เสมอ
3. **Date Input**: ใช้ `ThaiDateInput` (เก็บ DD/MM/YYYY) หรือ `IsoDateInput` (เก็บ ISO) — **ห้ามใช้ `showPicker()`** (mobile pick ไม่ได้)
4. **Print view**: ใช้ **Blob URL** เสมอ — `document.write()` พังบน iOS Safari
5. **Mobile layout**: ทุก sub-app ที่มีตาราง → card list + bottom sheet ที่ `width < 768px`
6. **Stat consistency**: ตัวเลข stat card + Excel export ต้องตรงกับตารางที่ user เห็น (filter+dedup เหมือนกัน)
7. **Department list 2 ระบบ**: hardcoded (form) vs dynamic (history filter) — อย่าสับสน
8. **ReceiveLog scan**: ใช้ `insertScannedBillRows` (APPEND) — **ห้ามใช้ `insertReceiveRows`** (DELETE ALL)

## Do Not (Hard Rules)

- **อย่าเรียก `supabase` โดยตรงในไฟล์ component** — ต้องผ่าน `src/lib/db.js` เสมอ
- **อย่าสร้างไฟล์ `.css` แยก** — Tailwind utility เท่านั้น
- **อย่า hardcode ค่าใดๆ ที่ควรมาจาก `.env`** — โดยเฉพาะ API key และ URL
- **อย่าเพิ่มฟีเจอร์ที่ไม่ได้ถูกขอ** — แก้เฉพาะที่ถาม ไม่ refactor รอบข้าง
- **อย่าใช้ mock/hardcode data ใน component** — ถ้าไม่มี supabase ให้ return null หรือ empty state
- **อย่าใช้ emoji ใน UI** — ใช้ `lucide-react` เท่านั้น
- **อย่าเปลี่ยน UI text เป็นภาษาอังกฤษ** — ทุก label, placeholder, alert ต้องเป็นภาษาไทย
- **อย่าเพิ่ม comment อธิบายโค้ดที่ self-evident** — เพิ่ม comment เฉพาะ logic ซับซ้อน
- **อย่า push หรือ commit โดยไม่ได้รับคำสั่ง** — ถามก่อนเสมอ
