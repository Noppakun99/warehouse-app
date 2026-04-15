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
- `ReceiveLogApp.jsx` — Receive history (stock intake)
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

1. **อ่านไฟล์ก่อนเสมอ** — ห้าม assume โครงสร้างโค้ด อ่าน component ที่เกี่ยวข้องก่อนแก้ไขทุกครั้ง
2. **เช็ค skill ที่มี** — ถ้างานตรงกับ skill ข้างบน ให้ใช้ skill นั้นแทนการเขียนใหม่
3. **แก้เฉพาะที่ถาม** — ไม่ refactor โค้ดรอบข้าง ไม่เพิ่ม feature ที่ไม่ได้ขอ
4. **ตรวจ db.js** — ถ้าเพิ่ม/แก้ field ใดๆ ต้องอัพเดต `src/lib/db.js` ด้วยเสมอ
5. **ตรวจ Thai text** — UI text ทั้งหมดต้องเป็นภาษาไทย ยกเว้น field name / code / technical term

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

## ReceiveLogApp Stats Query

- `loadStats()` ต้องดึง `price_per_unit` ใน `.select()` เสมอ — ใช้คำนวณมูลค่ารวมเมื่อ `total_price_vat = null`
- มูลค่ารับเข้ารวมต่อยา: `total_price_vat > 0 ? total_price_vat : qty_received × price_per_unit` (สะสมทุก row)
- ตัวอย่าง: รับยาวันที่ 1 มูลค่า 200 บาท + วันที่ 2 มูลค่า 300 บาท = แสดง 500 บาท

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
- ดึงข้อมูลผ่าน `fetchDispenseAnalytics(dateFrom, dateTo)` ใน `db.js` — ใช้ pagination 1,000 rows/page เพื่อดึงครบทุก row
- `fetchDispenseAnalytics` select: `drug_name, drug_code, drug_type, qty_out, price_per_unit, drug_unit, department, dispense_date, item_type`

### การคำนวณ (ตรงกับ DispenseSummaryModal ทุกจุด)
- **ราคาต่อหน่วย**: `getPrice(r)` — ใช้ `price_per_unit` ก่อน, fallback จาก `drug_unit` ถ้า `price_per_unit = null`
- **มูลค่า**: `qty_out × getPrice(r)` (ไม่ใช้ `price_per_unit` โดยตรง)
- **uniqueDays**: `new Set(rows.map(r => r.dispense_date))` — จำนวนวันที่มีการเบิกจริง
- **deptDaysMap**: unique days ต่อหน่วยงาน (เหมือน "หน่วยงานที่เบิกบ่อย" ใน SummaryModal)
- **drugDaysMap**: unique days ต่อยา

### Charts
| กราฟ | ชนิด | เรียงโดย |
|------|------|---------|
| แนวโน้มการเบิกรายเดือน | LineChart | เดือน ASC |
| ยาที่มีมูลค่าเบิกสูงสุด | BarChart (horizontal) | value DESC |
| ยาที่เบิกบ่อย (จำนวนวัน) | BarChart (horizontal) | days DESC |
| หน่วยงานที่เบิกบ่อย (จำนวนวัน) | BarChart (horizontal) | days DESC |
| หน่วยงาน — มูลค่าสูงสุด | BarChart (horizontal) | value DESC |

### StatCards
| Card | ค่าที่แสดง |
|------|-----------|
| รายการเบิกทั้งหมด | `rows.length` (sub: ปริมาณรวม) |
| มูลค่าเบิกทั้งหมด | `totalValue` (ราคา × จำนวน) |
| จำนวนวันที่มีการเบิก | `uniqueDays` |
| หน่วยงานที่เบิก | `topDeptsValue.length` |

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

## Do Not

- **อย่าเรียก `supabase` โดยตรงในไฟล์ component** — ต้องผ่าน `src/lib/db.js` เสมอ
- **อย่าสร้างไฟล์ `.css` แยก** — ใช้ Tailwind utility class เท่านั้น ไม่มี `<style>` tag
- **อย่า hardcode ค่าใดๆ ที่ควรมาจาก `.env`** — โดยเฉพาะ API key และ URL
- **อย่าเพิ่มฟีเจอร์ที่ไม่ได้ถูกขอ** — แก้เฉพาะสิ่งที่ถาม ไม่ refactor โค้ดรอบข้าง
- **อย่าใช้ mock/hardcode data ใน component** — ถ้าไม่มี supabase ให้ return null หรือ empty state
- **อย่าเพิ่ม comment อธิบายโค้ดที่ self-evident** — เพิ่ม comment เฉพาะ logic ที่ซับซ้อน
- **อย่าเปลี่ยน UI text เป็นภาษาอังกฤษ** — ทุก label, placeholder, alert ต้องเป็นภาษาไทย
- **อย่า push หรือ commit โดยไม่ได้รับคำสั่ง** — ถามก่อนเสมอถ้าไม่แน่ใจ
