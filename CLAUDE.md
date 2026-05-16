# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

There is no test runner configured — `unitParser.test.js` is a standalone script with manual assertions, not a test framework. Run it directly with `node src/unitParser.test.js` if needed.

## Architecture

This is a single-page React app (no React Router) for hospital pharmacy warehouse management. Routing is done via a `page` state string in `AppRoot.jsx`.

**App flow:**
1. `AppRoot.jsx` handles login and renders sub-apps based on `page` state string
2. Authentication: username + password (SHA-256 hash via Web Crypto API) — stored in `app_users` table
3. First-run: if `app_users` is empty, shows admin setup screen automatically
4. Three roles: `requester`, `staff`, `admin` (see Auth & Roles section below)

**Sub-apps (each is a self-contained component):**
- `App.jsx` — Inventory map, CSV upload, drug location grid
- `RequisitionApp.jsx` — Drug requisition (submit + staff approval workflow)
- `DispenseLogApp.jsx` — Dispense history and analysis
- `ReceiveLogApp.jsx` — Receive history (stock intake) + tab สแกนบิล AI Vision
- `ReturnApp.jsx` — Drug return / damaged / expired recording + print view with signatures
- `AnalyticsApp.jsx` — Dispense analytics dashboard (staff/admin only, page='analytics')
- `AuditLogApp.jsx` — Audit log viewer with inline edit/delete
- `UserManagementApp.jsx` — Admin-only: create, edit, delete, reset password for users

**Data layer:**
- All Supabase queries go through `src/lib/db.js` — components never call `supabase` directly
- `src/lib/supabase.js` initializes the client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- If `.env` is missing, `supabase` is `null` and the app falls back to in-memory state

**Database schema:**
- `supabase_schema.sql` — inventory, drug_details, upload_meta
- `requisition_schema.sql` — requisitions, dispense_logs, receive_logs
- `audit_schema.sql` — audit_logs
- `auth_schema.sql` — app_users
- `scan_invoice_migration.sql` — เพิ่ม 10 columns ใน receive_logs + Storage bucket invoice-images
- RLS enabled with public read/write policies (internal app)

**Reusable components:**
- `DrugSearchBar.jsx` — drug search with dropdown, used across multiple sub-apps
- `SearchableSelect.jsx` — searchable dropdown (used for department selection)

## Key Conventions

- All Supabase queries in `src/lib/db.js` only — never inline in components
- UI text is Thai throughout
- Use Tailwind utility classes only — no separate CSS files
- Print functions use `window.open()` popup with inline HTML/CSS (Sarabun font, Thai formatting)
- CSV parsing for inventory/drug details is handled inside `App.jsx` (`handleDrugFileUpload`)
- Internal drug detail keys are prefixed with `_` (e.g. `_company`) to distinguish from Supabase JSONB `data` keys
- Helper functions `normalizeCode`, `normalizeNumericText`, `normalizeDateStr` are used when parsing CSV columns
- API keys must come from `.env` only — never hard-coded (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

## Custom Skills

Skills อยู่ใน `.claude/skills/` — อ่านไฟล์ที่ระบุก่อนทำงานทุกครั้ง

| Slash command | ไฟล์ | สรุปสั้น |
|---------------|------|---------|
| `/add-db-column` | `.claude/skills/add-db-column.md` | เพิ่ม column ใน Supabase + wire ผ่าน `db.js` และ CSV parsing |
| `/add-csv-column` | `.claude/skills/add-csv-column.md` | เพิ่ม column จาก CSV โดยไม่เพิ่ม DB column |
| `/new-print` | `.claude/skills/new-print.md` | สร้าง `window.open()` print view สำหรับ sub-app |
| `/drug-search-bar` | `.claude/skills/drug-search-bar.md` | เพิ่ม DrugSearchBar พร้อม autocomplete + badge ชนิดยา |
| `/dispense-summary-modal` | `.claude/skills/dispense-summary-modal.md` | Pattern dispense summary modal (stat cards, bar chart, fetchAllRows) |
| `/monthly-stats-table` | `.claude/skills/monthly-stats-table.md` | ตาราง drug × month พร้อม sticky header + frozen col + DrugSearchBar |
| `/excel-export` | `.claude/skills/excel-export.md` | ปุ่ม Export Excel (.xlsx) + audit log รองรับ nested items |
| `/ui-style-guide` | `.claude/skills/ui-style-guide.md` | Tailwind patterns: สี, layout, buttons, inputs, badges, tables |
| `/plan` | `.claude/skills/plan.md` | วางแผน feature ก่อนลงมือ — ระบุไฟล์, risk, scope ก่อน confirm |
| `/pipeline` | `.claude/skills/pipeline.md` | รัน lint → build → test ตามลำดับ พร้อมสรุปผล |

**เมื่อสร้าง UI ใหม่ → อ่าน `.claude/skills/ui-style-guide.md` ก่อนเสมอ เพื่อคุมโทนสีและ component style ให้สม่ำเสมอ**

## Workflow

เมื่อได้รับงานใหม่ ให้ทำตามลำดับนี้เสมอ:

1. **อ่าน CLAUDE.md ก่อนเสมอ** — ทุกครั้งที่จะเพิ่ม/แก้/ลบ ฟังก์ชัน feature หรือ logic ใดๆ
2. **อ่านไฟล์ที่เกี่ยวข้อง** — ห้าม assume โครงสร้างโค้ด อ่าน component ก่อนแก้ไขทุกครั้ง
3. **เช็ค skill ที่มี** — ถ้างานตรงกับ skill ข้างบน ให้ใช้ skill นั้นแทนการเขียนใหม่
4. **แก้เฉพาะที่ถาม** — ไม่ refactor โค้ดรอบข้าง ไม่เพิ่ม feature ที่ไม่ได้ขอ
5. **ตรวจ db.js** — ถ้าเพิ่ม/แก้ field ใดๆ ต้องอัพเดต `src/lib/db.js` ด้วยเสมอ
6. **ตรวจ Thai text** — UI text ทั้งหมดต้องเป็นภาษาไทย ยกเว้น field name / code / technical term
7. **อัพเดต CLAUDE.md อัตโนมัติ** — หลังทำงานเสร็จทุกครั้ง ถ้า CLAUDE.md ยังไม่มีส่วนที่ครอบคลุมสิ่งที่เพิ่ง ทำ ให้สรุปและเพิ่มเข้าไปเองโดยไม่ต้องรอให้บอก

### กฎการอัพเดต CLAUDE.md
- เพิ่มฟังก์ชันใหม่ใน `db.js` → บันทึกชื่อ + พฤติกรรมสำคัญ (เช่น ลบทั้งหมดก่อน insert, backfill logic)
- เพิ่ม display rule ใหม่ → บันทึกใน section ที่เกี่ยวข้อง (เช่น Inventory Map Display Rules)
- เปลี่ยน filter/sort logic → อัพเดต rule เดิม ไม่ duplicate
- เพิ่ม DB schema หรือ SQL config → บันทึกไฟล์และวิธีรัน
- แก้ bug ที่มี root cause ซับซ้อน → บันทึก Do Not หรือ warning ไว้กัน regression

### เมื่อเพิ่มฟีเจอร์ใหม่
- feature กระทบ 2+ ไฟล์ → `/plan` ก่อนเสมอ
- column ใหม่ใน DB → `/add-db-column`
- column ใหม่จาก CSV เท่านั้น → `/add-csv-column`
- print view ใหม่ → `/new-print`
- search bar ใหม่ → `/drug-search-bar`
- ตรวจความพร้อมก่อน deploy → `/pipeline`

### เมื่อแก้บั๊ก
- อ่าน error message ก่อน — ระบุสาเหตุก่อน switch approach
- ถ้า supabase return null → เช็ค `.env` และ RLS policy ก่อน
- ถ้า CSV import ผิดพลาด → เช็ค `_matchHeader()` และ `getVal()` ใน `db.js`

### Skills vs Subagents — เลือกแบบนี้

| สถานการณ์ | ใช้อะไร |
|-----------|---------|
| มี pattern ซ้ำ (print, search bar, excel, chart) | **Skill** — อ่าน `.claude/skills/` |
| ค้นหา/สำรวจ codebase กว้างๆ ไม่รู้ path | **Subagent Explore** |
| งาน 2 อย่างที่ไม่ depend กัน | **Parallel tool calls** ใน message เดียว |
| รู้ path ไฟล์ชัดเจน | **ทำเอง** ด้วย Read/Edit/Grep โดยตรง |

### Parallelization — อ่านหลายไฟล์พร้อมกันได้เสมอ

```
✓ Read หลายไฟล์ในคำสั่งเดียว
✓ Grep + Glob พร้อมกัน
✓ execute_sql + อ่าน component พร้อมกัน
✗ อย่า Edit ไฟล์ก่อน Read ไฟล์นั้น
✗ อย่า build ก่อน lint ผ่าน
```

## Technical References

- **Supabase client**: `src/lib/supabase.js` — อย่า import `supabase` โดยตรงใน component
- **DB layer**: `src/lib/db.js` — ทุก query/insert/delete ต้องอยู่ที่นี่เท่านั้น
- **Icon library**: `lucide-react` — ไม่ใช้ emoji ใน UI, ไม่ใช้ icon library อื่น
- **Date format in DB**: ISO `YYYY-MM-DD` — แสดงผลเป็น `DD/MM/YYYY` (พ.ศ. +543)
- **Thai font in print**: Sarabun via Google Fonts — ใช้เฉพาะใน `window.open()` print popup
- **Env vars**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — ต้องมาจาก `.env` เท่านั้น
- **Tailwind version**: 3.x — ไม่ใช้ arbitrary values เช่น `w-[123px]` ถ้าหลีกเลี่ยงได้
- **React version**: 19.x — ใช้ functional components + hooks เท่านั้น ไม่มี class components

## Inventory Alert Rules

- `fetchDashboardAlerts()` ต้องดึง `receive_status` ใน `.select()` เสมอ — ใช้ตรวจยาตัดออกจากบัญชี
- ยาตัดออกจากบัญชี: `String(receive_status || '').includes('ตัดออก')` → ไม่แสดงใน alert ทุกประเภท
- **Expiry alert**: ไม่แสดงถ้า `qty = 0` หรือยาตัดออกจากบัญชี — window ปัจจุบัน = **16 เดือน**
- **Low stock alert**: ไม่แสดงถ้ายาตัดออกจากบัญชี (qty = 0 ยังแสดง เพราะถือว่า critical)

## Inventory Map — Display Rules (App.jsx)

- **qty = 0 ซ่อนทุกที่**: แสดงเฉพาะ `qty > 0` ใน Slot, modal (`handleLocationClick`), **และผลการค้นหา (`searchResults` useMemo)**
  - ข้อมูล qty=0 **ยังอยู่ใน `inventory` state** — ใช้คำนวณ low-stock alert และ order calculation ต่อได้
  - ไม่กรองออกตอน import CSV — กรองเฉพาะตอน render เท่านั้น
- **ยาตัดออก (discontinued)**: ซ่อนถ้า qty=0 ด้วย (เข้าเงื่อนไขเดียวกัน)
- **เรียงลำดับ exp ascending** ทุกที่ — ใกล้หมดอายุก่อนอยู่บนสุด รายการที่ไม่มี exp อยู่ล่างสุด:
  - `handleLocationClick` (popup ตำแหน่ง) ✓
  - `searchResults` useMemo ✓ (แก้แล้ว — เคยไม่เรียง)
- อย่าเปลี่ยน filter logic เป็น `!(isDiscontinued && qty === 0)` เพราะ qty=0 ต้องซ่อนเสมอ
- slot color (hasExpired/hasNearExpiry) คำนวณจาก `visibleItems` — qty=0 ถูก skip ใน loop อยู่แล้ว (`if (qty === 0) return`)

### จุดที่เคยพลาด — searchResults ไม่กรอง qty=0 และไม่เรียง exp
- **อาการ**: ผลการค้นหาแสดงรายการที่หมดแล้ว (qty=0) ปนกับรายการที่มีสต็อก
- **สาเหตุ**: `searchResults` useMemo ไม่มี `qty === 0` guard และไม่ sort
- **แก้**: เพิ่ม `if (qty === 0) return;` และ `.sort()` by `parseDateString(exp)` ใน useMemo

## Audit Log — Auth Rule (CRITICAL)

ทุก action ที่บันทึก audit log **ต้องส่ง `auth` ให้ครบเสมอ** เพื่อให้ `user_name` และ `department` ไม่เป็น `-`

### กฎเหล็ก
- `exportToExcel(rows, cols, sheet, file, auth)` — **argument ที่ 5 ต้องส่ง `auth` เสมอ**
- `insertAuditLog({ ..., user_name: resolveAuditUserName(auth), department: auth?.department })` — ต้องส่ง auth object
- `insertReceiveRows(rows, auth)` — **argument ที่ 2 ต้องเป็น `auth` ไม่ใช่ `{}`**
- Modal/component ที่เรียก export ต้องรับ `auth` เป็น prop และส่งต่อ

### Pattern ที่ถูกต้อง
```js
// ✅ ถูก
exportToExcel(rows, COLS, 'sheet', 'file.xlsx', auth)
insertReceiveRows(rows, auth)
insertAuditLog({ action: '...', user_name: resolveAuditUserName(auth), department: auth?.department || '-' })

// ❌ ผิด — user_name จะเป็น '-'
exportToExcel(rows, COLS, 'sheet', 'file.xlsx')       // ขาด auth
insertReceiveRows(rows, {})                            // auth ว่าง
```

### Checklist เมื่อเพิ่ม feature ใหม่ที่มี export/import/delete
1. component รับ `auth` prop ไหม?
2. ถ้า component อยู่ใน modal → parent ต้องส่ง `auth` ไปด้วย (เช่น `<MyModal auth={auth} />`)
3. `exportToExcel(...)` ส่ง auth เป็น argument สุดท้ายไหม?
4. `insertReceiveRows(rows, auth)` ส่ง auth ที่ถูกต้องไหม? (**ไม่ใช่ `{}`**)

### จุดที่เคยพลาด (อย่าทำซ้ำ)
- `ReceiveLogApp.handleImport` → `insertReceiveRows(rows, {})` ❌ → แก้เป็น `insertReceiveRows(rows, auth)` ✅
- `ReceiveLogApp` export → ขาด `auth` argument ❌ → เพิ่มแล้ว ✅
- `ReturnApp.HistoryTab` → ไม่รับ `auth` prop ❌ → เพิ่มแล้ว ✅
- `AppRoot.StockSummaryModal` → modal ไม่รับ `auth` prop ❌ → เพิ่มแล้ว ✅

## Audit Log Retention Policy

- ไฟล์: `audit_retention_policy.sql` — รันใน Supabase Dashboard > SQL Editor ครั้งเดียว
- ใช้ **pg_cron** extension รันทุกคืน 02:00 UTC (09:00 น. ไทย)
- Retention rules:
  - `login` → 90 วัน
  - `export_excel` → 180 วัน
  - action อื่น (import, return, requisition) → 2 ปี
- ถ้ามียาควบคุมพิเศษ → เปลี่ยนเป็น 3 ปี ตามระเบียบกระทรวงสาธารณสุข
- ตรวจสอบ job: `SELECT * FROM cron.job WHERE jobname = 'audit-log-retention';`

## ReceiveLogApp Stats Query

- `loadStats()` ต้องดึง `price_per_unit` ใน `.select()` เสมอ — ใช้คำนวณมูลค่ารวมเมื่อ `total_price_vat = null`
- มูลค่ารับเข้ารวมต่อยา: `total_price_vat > 0 ? total_price_vat : qty_received × price_per_unit` (สะสมทุก row)
- ตัวอย่าง: รับยาวันที่ 1 มูลค่า 200 บาท + วันที่ 2 มูลค่า 300 บาท = แสดง 500 บาท

## Date Filter — Default dateTo = วันนี้ (ReceiveLogApp & DispenseLogApp)

- เมื่อ `dateFrom` มีค่าแต่ `dateTo` ว่าง → query ใช้วันนี้เป็น upper bound อัตโนมัติ
- Pattern: `const isoTo = thaiToIso(dateTo) || dateTo || (isoFrom ? new Date().toISOString().split('T')[0] : '');`
- ใช้ใน 3 จุดต่อ app: `load`, `handleExport`, `loadAgg` (และ `filteredDrugRows` ใน ReceiveLogApp)
- ช่อง "ถึง" แสดง placeholder วันนี้เป็นสีเทาเมื่อ `dateFrom` ตั้งค่าอยู่: `placeholder={dateFrom ? isoToThai(today) : 'dd/mm/yyyy'}`
- อย่าเปลี่ยนกลับเป็น `q.eq('dispense_date/receive_date', isoFrom)` เมื่อ dateFrom เดียว — ต้องเป็น `gte` เสมอ

## Pagination — ReceiveLogApp & DispenseLogApp

- `PAGE_SIZE = 200` (ทั้งสอง app)
- Pagination block แสดงเมื่อ `rows.length === PAGE_SIZE || page > 0`
- ปุ่ม "ก่อนหน้า" แสดงเมื่อ `page > 0` (แม้อยู่หน้าสุดท้ายที่ rows < PAGE_SIZE)
- ปุ่ม "ถัดไป" แสดงเฉพาะ `rows.length === PAGE_SIZE`
- แสดง input พิมพ์เลขหน้า: `key={page}` + `defaultValue={page+1}` → กด Enter หรือ blur เพื่อ jump
- แสดงข้อความ: หน้า [input] / {totalPages} ({count} รายการ) โดยใช้ `aggStats.count`

## receive_logs — Upload สองที่ (Known Duplication)

มี 2 path ที่ upload ข้อมูลเข้า `receive_logs`:

| ที่ | ไฟล์ | ฟังก์ชัน | เรียก supabase |
|----|------|---------|--------------|
| 1 | `App.jsx` | `handleReceiveFileUpload` → `importReceiveLogs()` ใน db.js | ผ่าน db.js ✓ |
| 2 | `ReceiveLogApp.jsx` | `handleImport()` | **โดยตรง ✗** (ละเมิด convention) |

**โครงสร้าง COL_MAP**: ฟิลด์เหมือนกัน แต่ alias ต่างกันเล็กน้อย:
- `total_price_vat`: db.js ใช้ "มูลค่ารวมภาษี" / ReceiveLogApp ใช้ "ราคารวมภาษี (บาท)"
- `total_price_formula`: db.js ใช้ "มูลค่า/สูตร" / ReceiveLogApp ใช้ "ราคารวมภาษี (บาท)/สูตร"

**ReceiveLogApp.jsx มีฟีเจอร์เพิ่มที่ db.js ไม่มี**: preview rows, warnRows, drug_swap_policy backfill จาก drugDetails

**To-do**: ย้าย logic ใน `ReceiveLogApp.handleImport()` เข้า `importReceiveLogs()` ใน db.js เพื่อให้ conform กับ convention — ยังไม่ได้ทำ

## Auth & Roles

### ระบบ Login
- ใช้ **username + password** — hash ด้วย SHA-256 ผ่าน `crypto.subtle.digest` (Web Crypto API, client-side)
- ไม่ใช้ Supabase Auth — เก็บใน `app_users` table เอง
- `auth` state object: `{ id, username, name (= full_name), role, department }`
- `auth` ส่งผ่าน props จาก AppRoot ลงไปทุก sub-app ที่ต้องการ

### Three Roles
| Role | ประเภท | ระบบที่เข้าได้ |
|------|--------|--------------|
| `requester` | ผู้ใช้งานทั่วไป | แผนผัง, เบิกยา, รับยา (ดู), เบิกจ่าย (ดู), คืนยา |
| `staff` | เจ้าหน้าที่คลังยา | ทั้งหมด (ยกเว้นจัดการผู้ใช้) — Import CSV ได้, แต่ไม่สามารถ Edit/Delete |
| `admin` | เจ้าหน้าที่คลังยา + ผู้ดูแลระบบ | ทั้งหมด รวม Edit/Delete และจัดการผู้ใช้ |

- `isStaff` ใน AppRoot/Dashboard = `auth.role === 'staff' || auth.role === 'admin'`
- `isAdmin` ใน sub-apps = `auth.role === 'admin'` — ใช้ guard ปุ่ม Edit/Delete
- RequisitionApp: `startAsStaff = role === 'staff' || role === 'admin'` — ต้องมาก่อน prefilledUser ใน useState
- RequisitionApp: `prefilledUser = { name: displayName, department: auth.department }` — ส่งให้ **ทุก role** เสมอ
- SYSTEMS array กรองด้วย `s.roles.includes(auth.role)` — แต่ละ system มี `roles` array

### Permission Matrix (Edit/Delete/Import)
| Action | requester | staff | admin |
|--------|-----------|-------|-------|
| ดูข้อมูล | ✓ | ✓ | ✓ |
| Import CSV (Receive/Dispense) | ✗ | ✓ | ✓ |
| แก้ไข/ลบ (Receive/Dispense) | ✗ | ✗ | ✓ |
| แก้ไขใบเบิกตัวเอง (Requisition History) | ✗ | — | — |
| ลบ blank rows (Receive) | ✗ | ✗ | ✓ |

### displayName Pattern
ทุกที่ที่แสดงชื่อผู้ใช้ใน Dashboard ใช้ pattern นี้เสมอ:
```js
const displayName = (auth.name && auth.name.trim() && auth.name.trim() !== '-')
  ? auth.name : auth.username;
```
- `full_name` ว่าง หรือ `'-'` → แสดง `username` แทน
- ใช้ใน: navbar header, welcome section, prefilledUser.name

### StatsStrip (Dashboard)
- แสดงให้ **ทุก role** เห็น (ไม่จำกัดแค่ staff อีกต่อไป)
- requester เห็น 2 card: รายการยาในคลัง + ใบเบิกรอดำเนินการ
- staff/admin เห็น 4 card: เพิ่ม ยาใกล้หมดอายุ + Stock ต่ำกว่ากำหนด
- คลิก "ใบเบิกรอดำเนินการ":
  - staff/admin → `page='requisition'` → StaffDashboard (filter=pending)
  - requester → `page='requisition-history'` → RequesterRoot initialStep='history' (ประวัติตัวเอง)

### RequisitionApp Navigation
- `page='requisition'` → เปิดปกติ (staff ไป StaffDashboard, requester ไป DrugSearch)
- `page='requisition-history'` → เปิดพร้อม `initialStep='history'` → requester ไปหน้าประวัติทันที
- `startAsStaff` ต้องตรวจก่อน `prefilledUser` ใน useState initial value เสมอ

### db.js Auth Functions
```js
loginUser(username, password)          // → { user } หรือ { error }
registerUser({ username, password, full_name, department }) // role = requester, is_active = true
// registerUser ตรวจ: 1) username ซ้ำ 2) password hash ซ้ำกับ user อื่น
checkFirstRun()                        // → true ถ้าไม่มี user ในระบบ (แสดง admin setup)
fetchAppUsers()                        // admin only
createAppUser({ username, password, full_name, department, role })
updateAppUser(id, { full_name, department, role, is_active })
deleteAppUser(id)
changeAppUserPassword(id, newPassword)
```

### สมัครเข้าใช้งาน (Self-register)
- ฟอร์มมีแค่: username, หน่วยงาน, รหัสผ่าน, ยืนยันรหัสผ่าน — **ไม่มีช่องชื่อ-สกุล** (full_name บันทึกเป็น '')
- ได้ role `requester` เท่านั้น, `is_active = true` ทันที
- ตรวจ username ซ้ำ และ password hash ซ้ำก่อน insert เสมอ
- บัญชี staff/admin ต้องสร้างโดย admin เท่านั้น

### UserManagementApp
- file: `src/UserManagementApp.jsx`
- เข้าได้เฉพาะ role `admin` (SYSTEMS roles: `['admin']`)
- ตารางแสดง: ชื่อผู้ใช้, ชื่อ-สกุล, หน่วยงาน, **ประเภทผู้ใช้**, **สิทธิ์ระบบ**, สถานะ, วันที่สมัคร
- ป้องกันลบตัวเอง + ป้องกัน admin เปลี่ยน role ตัวเองออกจาก admin

### Do Not (Auth)
- อย่าใช้ Supabase Auth (`supabase.auth.*`) — ระบบนี้ใช้ `app_users` table เอง
- อย่า hardcode password หรือ hash ใน code — ใช้ `hashPassword()` ใน db.js เสมอ
- อย่าเปลี่ยน password hash algorithm โดยไม่ migrate ข้อมูลเดิม

## Supplier Risk Chart (สัดส่วนมูลค่าต่อบริษัท)

- **องค์การเภสัชกรรม (GPO)** — ยกเว้นการประเมิน risk เสมอ เพราะเป็นรัฐวิสาหกิจที่บังคับซื้อก่อน
- ตรวจด้วย: `name.includes('องค์การเภสัช')` → แสดง badge "รัฐ" สีน้ำเงิน, บาร์สีน้ำเงิน
- บริษัทเอกชน: ≥40% = เสี่ยงสูง (แดง), ≥20% = ระวัง (ส้ม), ≥10% = เหลือง, &lt;10% = ปลอดภัย (เขียว)
- items format: `[name, pct, isGPO]` — ส่งผ่าน tuple 3 ตัวไปยัง BarSection

## AnalyticsApp (วิเคราะห์การเบิกยา)

- file: `src/AnalyticsApp.jsx` — เข้าได้เฉพาะ role `staff` / `admin` (SYSTEMS roles: `['staff','admin']`)
- ดึงข้อมูลผ่าน `fetchDispenseAnalytics(dateFrom, dateTo)` ใน `db.js` — pagination 1,000 rows/page
- `fetchDispenseAnalytics` select: `drug_name, drug_code, drug_type, qty_out, price_per_unit, drug_unit, department, dispense_date, item_type`

### โครงสร้าง 3 Tab
| Tab | ชื่อ | เนื้อหา |
|-----|------|--------|
| 🏥 ภาพรวม | Executive Summary | KPI cards, Attention panel (top drugs/dept), Forecast snapshot, Rising Demand alerts |
| 📦 คลังยา / ABC | Inventory & ABC | ABC table + filter, bar charts gradient, dept top-5 (expand) |
| 📈 แนวโน้ม | Trends & Forecasting | Monthly trend + MA3, YoY chart, Forecast chart + table |

### การคำนวณหลัก
- **ราคาต่อหน่วย**: `getPrice(r)` — `price_per_unit` ก่อน, fallback `drug_unit`
- **มูลค่า**: `qty_out × getPrice(r)`
- **uniqueDays**: `new Set(rows.map(r => r.dispense_date))`
- **drugMonMap**: per-drug per-month value (ใช้คำนวณ momentum)

### Statistical Models
- **MA3**: 3-month Moving Average — เส้นประบน trend chart ตัดสัญญาณรบกวน
- **Linear Regression** (`linReg`): Forecast เส้นตรง — เหมาะแนวโน้มคงที่
- **Holt's Exponential Smoothing** (`holtForecast`, α=0.3, β=0.15): ให้น้ำหนักข้อมูลล่าสุดมากกว่า — เหมาะแนวโน้มเปลี่ยนเร็ว
- ทั้ง 2 โมเดลคำนวณพร้อมกันใน useMemo เดียว (`combinedChartLinear`, `combinedChartHolt`) — toggle สลับ state เท่านั้น ไม่ recompute

### Rising Demand (Momentum Detection)
- คำนวณใน main useMemo: `lastMon` vs `avg(prev3Mons)` ต่อยา
- เงื่อนไข: `momentum >= 30%` AND `prevAvg > 0`
- แสดงใน Tab ภาพรวม พร้อม badge กลุ่ม ABC ของยานั้น

### ABC Analysis (`abcClassify`)
- Sort drugs DESC by value → คำนวณ cumulative %
- A = cumPct ≤ 80%, B = ≤ 95%, C = ที่เหลือ
- แสดงใน Tab คลังยา — filter tab A/B/C, ตาราง max 30 รายการ

### Year-over-Year Seasonality
- `yoySufficient` = ปีอ้างอิง (ไม่ใช่ปีล่าสุด) มีข้อมูล ≥ 6 เดือน
- ถ้าไม่ sufficient: แสดง warning สีม่วง + เส้นกราฟปีนั้นเป็นเส้นประ
- ซ่อนกราฟทั้งหมดถ้า `yoyYears.length < 2`

### Forecast Reliability
- `forecastReliable` = `monthlyTrend.length >= 6`
- ถ้าไม่ reliable: แสดง banner สีแดงเตือนไม่ให้นำไปตัดสินใจจัดซื้อโดยตรง

### UI Conventions
- **Bar chart สี**: `heatBlue(i, total)` — gradient น้ำเงินเข้ม (#1E40AF) → อ่อน (#93C5FD) ไม่ใช้ rainbow COLORS
- **Dept chart**: แสดง Top 5 default, ปุ่ม "ดูทั้งหมด" toggle `showAllDepts`
- **Forecast table**: sort by `p1`/`p6`/`p12` ตาม `forecastPeriod` toggle (1/6/12 เดือน)

## ReturnApp — Print View

- `printReturnLog(record)` — สร้าง popup ด้วย `window.open()`, font Sarabun, Thai formatting
- ปุ่มปริ้น 2 จุด:
  1. **RecordTab**: ขึ้นใน success banner หลัง submit สำเร็จ (เก็บใน `lastSubmitted` state)
  2. **HistoryTab**: ปุ่ม "พิมพ์" ใน expanded row ของแต่ละรายการ
- **ช่องลายเซ็น**: 2 ช่อง (ผู้คืนยา / ผู้รับยา) — มีบรรทัดเซ็น + ช่องวันที่ใต้แต่ละช่อง
- Label ใช้แค่ "ผู้คืนยา" และ "ผู้รับยา" (ไม่ใช้คำว่าเภสัชกร)
- ชื่อที่แสดงในช่อง: `returned_by` และ `received_by` (pre-fill จาก `auth.name` ตอนบันทึก)

## Excel Export — Column Order

### DispenseLogApp (`DISPENSE_EXCEL_COLS`)
วันที่เบิก | MainLog | DetailedLog | รหัส | ชนิด | รายการยา | หน่วย | ราคา/หน่วย | Lot Number | Exp | ชนิดรายการ | คงเหลือก่อนเบิก | ปริมาณ (ออก) | คงเหลือหลังจ่าย | หน่วยงานที่เบิก | หมายเหตุ

### RequisitionApp (`REQUISITION_EXCEL_COLS`)
ใช้คอลัมน์เดียวกับ DispenseLogApp เพื่อ paste-compatible — `exportReqExcel()` ทำ async lookup `receive_logs` เพื่อ auto-fill MainLog, DetailedLog, ชนิดรายการ ก่อน export

## Playwright E2E Tests

### Test Accounts (ใช้ใน DB จริง)
| username | password | role | ใช้ใน |
|----------|----------|------|-------|
| `test`   | `444444` | requester | `authenticatedPage` fixture (default) |
| `test2`  | `555555` | staff     | `staffPage` fixture (default) |

### รัน tests
```bash
npx playwright test                          # รัน all tests
npx playwright test tests/05-staff-flow.spec.js  # staff flow เฉพาะ
npx playwright test --reporter=list          # verbose output
```

### Override credentials ผ่าน env
```bash
TEST_STAFF_USER=test2 TEST_STAFF_PASS=555555 npx playwright test
```

### Test files
| file | ครอบคลุม |
|------|---------|
| `01-login.spec.js` | login/logout flow |
| `02-dashboard.spec.js` | Dashboard cards, navigation |
| `03-requisition.spec.js` | Drug search, cart, submit |
| `04-return.spec.js` | Return record, history, print |
| `05-staff-flow.spec.js` | Staff approve/reject (ต้องมี staff account) |
| `06-validation.spec.js` | Form validation, HTML5 + JS |
| `07-permissions.spec.js` | Role-based visibility (requester vs staff) |

### Notes
- `authenticatedPage` และ `staffPage` ใช้ `scope: 'worker'` — login ครั้งเดียวต่อ worker
- Auth persist ผ่าน `sessionStorage` — `page.goto('/')` ไม่ทำให้ session หาย
- `staffPage` คืน `null` ถ้า login ล้มเหลว — tests ที่ใช้ `staffPage` ต้อง `if (!page) test.skip()`

## StatsStrip Realtime

- `loadStats` ใช้ `useCallback` + subscribe `postgres_changes` บน `requisitions` table
- อัพเดต "ใบเบิกรอดำเนินการ" อัตโนมัติหลังผู้ใช้ส่งใบเบิก

## Invoice Scanner (AI Vision) — ระบบสแกนบิลยา

- file: `src/ReceiveLogApp.jsx` → component `ScanInvoice` — เข้าได้เฉพาะ role `staff` / `admin`
- tab: "สแกนบิล" ใน ReceiveLogApp header (ปุ่มซ้ายของ Import CSV)
- Edge Function: `supabase/functions/scan-invoice/index.ts` — เรียก Claude Vision API
  - ต้องตั้ง secret: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`
  - deploy: `supabase functions deploy scan-invoice`
- Migration: `scan_invoice_migration.sql` — รันใน SQL Editor ก่อนใช้งาน
- db.js functions:
  - `scanInvoiceImage(base64, mimeType)` — invoke edge function
  - `insertScannedBillRows(rows, auth)` — **APPEND ONLY ไม่ DELETE** (ต่างจาก insertReceiveRows)
  - `uploadInvoiceImage(file, fileName)` — upload ไป bucket `invoice-images`
  - `lookupDrugCodes(names)` — จับคู่ drug_code อัตโนมัติจาก receive_logs เดิม

### New columns ใน receive_logs (scan-specific)
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

### Do Not (Invoice Scanner)
- **อย่าใช้ `insertReceiveRows` สำหรับ scan** — มัน DELETE ALL ก่อน insert ทำลายข้อมูลเดิม
- **อย่า expose ANTHROPIC_API_KEY ใน frontend** — ต้องผ่าน Edge Function เท่านั้น
- `receive_status` ของแถวที่สแกน = `'สแกนบิล AI'` เพื่อแยกจาก CSV import

## Known Bug Pattern — Supabase 1,000-row Limit (CRITICAL)

Supabase REST API คืนค่าสูงสุด **1,000 rows** ต่อ request โดย default ถ้า table มีข้อมูลมากกว่านั้น query แบบธรรมดาจะได้ข้อมูลไม่ครบ

### อาการ
- dropdown ชื่อยาหาไม่เจอบางตัว (เช่น Etonogestrel ใน DispenseLogApp)
- stats/aggregate ผิดเพราะคำนวณจากข้อมูลแค่บางส่วน

### สาเหตุ
```js
// ❌ ผิด — ได้แค่ 1,000 rows แรก
supabase.from('dispense_logs').select('drug_name, drug_type').then(({ data }) => ...)
```

### วิธีแก้ — ใช้ `fetchAllRows` เสมอเมื่อต้องการข้อมูลครบทุก row
```js
// ✅ ถูก — ดึงครบทุก row ด้วย pagination อัตโนมัติ
fetchAllRows(() => supabase.from('dispense_logs').select('drug_name, drug_type')).then(data => ...)
```

### จุดที่ต้องระวัง
- โหลด `drugNames` สำหรับ autocomplete dropdown ใน DispenseLogApp และ ReceiveLogApp
- query ใดๆ ที่ต้องการ **ข้อมูลครบทุก row** เพื่อสร้าง dropdown / คำนวณ aggregate
- `fetchAllRows` อยู่ใน scope ของ DispenseLogApp/ReceiveLogApp แล้ว — ใช้ได้เลย

### กฎ
- dropdown ชื่อยา → **ต้องใช้ `fetchAllRows`** เสมอ ห้ามใช้ `.then(({ data }) => ...)` ตรงๆ
- aggregate stats (count, sum) → ใช้ `loadAgg` pattern ที่มีอยู่แล้ว ซึ่งใช้ `fetchAllRows` แล้ว

## ReceiveLogApp — supplierFilter Bug (แก้แล้ว)

### อาการ
- กรองบริษัทแล้ว pagination แสดง "ถัดไป →" ทั้งที่มีแค่ 78 รายการ
- `totalPages` แสดง 1/1 แต่ปุ่ม "ถัดไป" ยังอยู่

### สาเหตุ
`load` query ไม่ได้ส่ง `supplierFilter` ไป DB — กรองแค่ client-side ใน `displayRows`  
ทำให้ `rows.length === PAGE_SIZE` (200) แม้จะกรองบริษัทแล้ว

### แก้
เพิ่ม `if (supplierFilter) q = q.eq('supplier_current', supplierFilter)` ใน `load` callback  
และเพิ่ม `supplierFilter` ใน dependency array: `}, [search, supplierFilter, dateFrom, dateTo, page])`

### Do Not
อย่าลบ client-side filter ใน `displayRows` — ยังต้องไว้เพราะใช้ `getDetailSupplier()` ที่ละเอียดกว่า `supplier_current`

## Mobile Layout — ทุก Sub-app

**Pattern เดียวกันใช้กับทุก sub-app ที่มีตาราง:**
- จอ < 768px → แสดง **card list** แทนตาราง (ตรวจด้วย `isMobile` state + resize listener)
- แตะ card → **bottom sheet** เลื่อนขึ้นจากล่าง แสดงรายละเอียดครบ (ยกเว้น UserManagement ที่ใช้ modal เดิม)
- state: `isMobile` (boolean), `mobileDetail` (row object หรือ null)
- Desktop ≥ 768px: ตารางเดิมทุกอย่าง ไม่กระทบ
- pattern resize: `useEffect(() => { const fn = () => setIsMobile(window.innerWidth < 768); window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn); }, [])`

| App | Mobile Support | หมายเหตุ |
|-----|---------------|---------|
| ReceiveLogApp | card list + bottom sheet ✅ | stat cards 3 ช่อง |
| DispenseLogApp (DispenseView) | card list + bottom sheet ✅ | stat cards จำนวน/มูลค่า/ราคา |
| ReturnApp (HistoryTab) | card list + bottom sheet ✅ | ปุ่ม Print ใน bottom sheet |
| AuditLogApp | card list + edit bottom sheet ✅ | edit/delete ทำงานได้บน mobile |
| UserManagementApp | card list + action buttons ✅ | ใช้ modal เดิม (modal เป็น fixed อยู่แล้ว) |
| RequisitionApp | card-based ตลอด ✅ | ไม่ต้องแปลง เพราะ design เป็น card ตั้งแต่ต้น |
| AppRoot (Dashboard) | responsive grid ✅ | ใช้ Tailwind sm:/md: ตลอด |

**Do Not**: อย่าเพิ่ม `min-w-[...]` ในตารางโดยไม่มี `isMobile` guard — จะทำให้ scroll ไม่สวยบน mobile

## UserManagementApp — Password & Suspend

### ตั้งรหัสผ่านใหม่ (Admin)
- Modal ตั้งรหัสผ่าน: 1 field, แสดงได้ (toggle eye), ไม่มี confirm field
- บันทึกสำเร็จ → แสดง panel พร้อมข้อความสำเร็จสำหรับ copy ส่งให้ user (username + รหัสใหม่)
- state: `pwSaved` เก็บรหัสที่บันทึกแล้ว, `copied` สำหรับ copy feedback

### สถานะบัญชี (Suspend)
- DB column: `suspend_until TIMESTAMPTZ` ใน `app_users` (migration: `suspend_user_migration.sql`)
- 3 โหมด: `active` (is_active=true) / `temp` (is_active=false + suspend_until=datetime) / `perm` (is_active=false + suspend_until=null)
- Login check: ถ้า `suspend_until` ผ่านไปแล้ว → อนุญาตให้เข้าใช้, ถ้ายังไม่ถึงเวลา → แสดงข้อความ "บัญชีถูกระงับชั่วคราว ถึง DD/MM/YYYY HH:MM น."

## AnalyticsApp — Drug Filter

- `drugSearch` state กรองข้อมูลทุก tab (ภาพรวม, คลังยา/ABC, แนวโน้ม)
- `filteredRows = drugSearch ? rows.filter(ilike) : rows` — ทุก useMemo ต้องใช้ `filteredRows` ไม่ใช่ `rows`
- `drugNames` options: `{ name, type }[]` สร้างจาก `rows` ที่โหลดมาแล้ว (ไม่ต้อง query แยก)
- ใช้ `DrugSearchBar` component — `ringClass="focus:ring-blue-400"` ให้เข้ากับ header สีน้ำเงิน

## Login — ลืมรหัสผ่าน

- view `'forgot'` ใน AppRoot — แสดงขั้นตอน 3 ข้อให้ติดต่อ Admin
- ปุ่ม "ลืมรหัสผ่าน?" อยู่ซ้ายล่างของหน้า login (ขวาคือ "สมัครเข้าใช้งาน →")

## ระบบสั่งยา (Drug Order System) — แผนพัฒนา (ยังไม่ได้ทำ)

### สถานะปัจจุบัน
- file: `src/App.jsx` → `view === 'order'` (full-page view)
- คำนวณ Reorder Point, แนะนำ SS, ต้องซื้อ **แบบ client-side** จาก:
  - `inventory` CSV → Safety Stock, Lead Time, qty ปัจจุบัน
  - `dispense_logs` Supabase → เรทใช้จริง 4 เดือนล่าสุด
- `orderedItems` เก็บใน **localStorage** เท่านั้น — ไม่ sync ระหว่าง user, ล้าง cache หายทันที

### แผน: Import Excel "วิเคราะห์ซื้อยา" มาแทนคำนวณใน app

**ที่มา**: มี Excel sheet วิเคราะห์การซื้อยาที่คำนวณไว้แล้ว รวมเรทปัจจุบัน + อดีต

**ข้อดีของ Excel rate เทียบกับคำนวณใน app**
- ครอบคลุมข้อมูลหลายปี (ไม่จำกัดแค่ 4 เดือน)
- เภสัชกรปรับ seasonal / outlier ได้เองก่อน upload
- ผ่านสายตาผู้เชี่ยวชาญแล้ว

**สิ่งที่ต้องรู้ก่อนทำ (รอ user ยืนยัน)**
- โครงสร้างคอลัมน์ใน Excel: รหัสยา, ชื่อยา, เรท/เดือน, เรทอดีต, SS, Lead Time, ...?
- Excel rate จะ override dispense_logs calculation หรือแสดงคู่กัน?

**สิ่งที่ต้องทำเมื่อพร้อม**
1. ออกแบบ import schema (เพิ่ม column ใน `drug_details` หรือสร้าง table `drug_usage_rates`)
2. สร้าง CSV/Excel import UI ใน order view พร้อม preview + unmatched drugs
3. แสดง "อัพเดตล่าสุด: DD/MM/YYYY" + เตือนถ้าข้อมูลเกิน 30 วัน
4. ย้าย `orderedItems` จาก localStorage → Supabase table (ให้ sync ระหว่าง user)

**ยังไม่ต้องทำ** — รอ user ส่งโครงสร้าง Excel ให้ดูก่อน

## Do Not

- **อย่าเรียก `supabase` โดยตรงในไฟล์ component** — ต้องผ่าน `src/lib/db.js` เสมอ
- **อย่าสร้างไฟล์ `.css` แยก** — ใช้ Tailwind utility class เท่านั้น ไม่มี `<style>` tag
- **อย่า hardcode ค่าใดๆ ที่ควรมาจาก `.env`** — โดยเฉพาะ API key และ URL
- **อย่าเพิ่มฟีเจอร์ที่ไม่ได้ถูกขอ** — แก้เฉพาะสิ่งที่ถาม ไม่ refactor โค้ดรอบข้าง
- **อย่าใช้ mock/hardcode data ใน component** — ถ้าไม่มี supabase ให้ return null หรือ empty state
- **อย่าเพิ่ม comment อธิบายโค้ดที่ self-evident** — เพิ่ม comment เฉพาะ logic ที่ซับซ้อน
- **อย่าเปลี่ยน UI text เป็นภาษาอังกฤษ** — ทุก label, placeholder, alert ต้องเป็นภาษาไทย
- **อย่า push หรือ commit โดยไม่ได้รับคำสั่ง** — ถามก่อนเสมอถ้าไม่แน่ใจ
