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

## App.jsx — UI Layout (ระบบแผนผังคลังยา)

### โครงสร้าง Header ใหม่ (ปรับแล้ว)
- **Top header bar**: white sticky bar `bg-white border-b border-slate-200` — มีปุ่มกลับ + icon + ชื่อระบบ + "จัดการข้อมูล" dropdown ฝั่งขวา
- ย้าย `สรุปข้อมูล` และ `จัดการข้อมูล` dropdown ออกจาก search area → ไปอยู่ที่ header แทน
- **Alert stat cards**: `grid grid-cols-2 sm:grid-cols-4` — 4 card (หมดอายุ / ใกล้หมดอายุ / รอตรวจรับ / ระบบสั่งยา) ใช้สีตาม semantic (red/amber/sky/orange)
- **Search card**: `bg-white rounded-2xl border` แยกออกจาก header
- **Zone tabs**: active = `bg-indigo-600 text-white` (เปลี่ยนจาก slate-800)
- **Cabinet headers**: `bg-indigo-600` (เปลี่ยนจาก dark gradient)
- **Summary modal header**: `bg-indigo-600` (เปลี่ยนจาก dark gradient)
- ต้อง import `ArrowLeft` จาก `lucide-react` ใน App.jsx — ขาดแล้วหน้าขาว

### Do Not (App.jsx Header)
- อย่าใช้ dark gradient `from-slate-900 to-slate-600` ใน header หรือ cabinet อีก — ใช้ `bg-indigo-600` แทน
- อย่าวาง search bar + dropdown ไว้ใน header block เดิม — แยกเป็น card ของตัวเอง

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

### Inventory Summary Modal — Display Rules (CRITICAL)
- **ตัวเลขทุกตัวใน modal ต้องสอดคล้องกัน** — `summary`, `overallStats`, `typeStats` ต้องกรอง `qty > 0 && !discontinued` เหมือน `expiredItems`/`nearExpiryItems`/`safeItems`
- **อย่าใส่ "นับทุกแถวใน inventory"** ใน KPI cards — เคยมีบั๊ก: รายการยา/Lot นับรวม qty=0 แต่ donut นับเฉพาะ qty>0 → ตัวเลขไม่ตรงกัน
- **มูลค่าคงคลัง** คำนวณจาก `Σ qty × price_per_unit` โดย lookup `drugDetails[code|lot|invoice].price_per_unit` (fallback: code+lot)
- **Slot Utilization** = (slot ที่มียาคงเหลือ > 0 ÷ slot ทั้งหมดใน cab) — color: ≥85% rose, ≥60% amber, &lt;60% emerald
- **Top 5 ใกล้หมดอายุ** คลิก → ปิด modal + เปิด `handleLocationClick(location)` ของ Lot นั้น
- **Top 5 คงเหลือสูงสุด** group by `code` (fallback name), sum `qty`, แสดงจำนวนตำแหน่งจัดเก็บที่กระจายอยู่
- **KPI "หมดอายุแล้ว"** ซ่อนเมื่อ `expiredItems.length === 0` — ลดความรกของ card
- **Toggle view** "กราฟ / ตาราง" state `summaryStorageView` (`'chart' | 'table'`) — ตารางมี column มูลค่า + Slot Util
- **Export Excel** ใน header modal — ใช้ `exportToExcel` พร้อม auth, ไฟล์ `inventory_summary_{date}.xlsx` — columns: รายการยา / Lot / Lot รวม / มูลค่า / Slot ใช้/ทั้งหมด / % การใช้พื้นที่
- **Timestamp** ใน header — แสดง `logUpdateDate` ผ่าน `formatDateTime()` ใต้ title
- **มูลค่ารวม** ใช้ `formatBaht`: ≥1M → "X.XXM", ≥1K → "X.XK", &lt;1K → integer
- **หมายเหตุใต้ KPI**: "นับเฉพาะคงเหลือ > 0 · ไม่รวมยาตัดออกจากบัญชี · มูลค่าคำนวณจากราคา/หน่วยล่าสุดใน receive_logs"

### Inventory Map — UI Polish Rules (หลัง redesign bc68585)
- **ห้ามใช้ emoji** ใน UI ทุกที่ — ใช้ lucide-react เท่านั้น (เคยมี `✓ ○ ⚠️ ✕ 📍` ใน toggle/modal → แก้แล้ว)
- **Header buttons** (สรุปข้อมูล + จัดการข้อมูล) ใช้ outline pattern เดียวกัน: `bg-white border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 text-indigo-600` — ไม่ให้ปุ่มใดเด่นกว่ากัน
- **Card "ต่ำกว่าจุดสั่งซื้อ"** (เดิม "ระบบสั่งยา") — label สื่อความหมายตัวเลข (count ของ `lowStockItems`) ตรงกว่า; คลิกแล้วยังไปหน้า order view เหมือนเดิม
- **หมายเหตุช่วง 16 เดือน** อยู่ภายใน card "ใกล้หมดอายุ" (text-[10px] text-slate-400) — ไม่ลอยข้างนอกอีก
- **Toggle ซ่อนช่องว่าง** ใช้ `Eye` / `EyeOff` icon — EyeOff = ซ่อนอยู่ (active state indigo)
- **Empty state**: เมื่อ `Object.keys(inventory).length === 0` (ยังไม่ upload เลย) → แสดง card dashed border พร้อมปุ่ม "อัปโหลด Log คลังยา" (staff) หรือ hint "ติดต่อเจ้าหน้าที่" (requester)
- **Search result chip** ใช้ `bg-indigo-600` (theme เดียวกับแผนผัง) — สี amber สงวนสำหรับ alert (expiry) เท่านั้น
- **Heatmap slot ว่าง** (`itemCount === 0`) ใช้ `bgOpacity = 0.15` + `border-dashed` เพื่อสื่อ "ไม่มีของ" ชัดเจน — slot ที่มีของใช้ solid border
- **ปุ่ม "รายละเอียด"** ใน item card ใช้ `min-w-[140px]` + text คงที่ "รายละเอียด" + chevron toggle (ไม่เปลี่ยน label เป็น "ปิดรายละเอียด" / "ดูรายละเอียดเพิ่มเติม") — กัน width กระตุก

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

## ReceiveLog/DispenseLog — Stat/Export Consistency Rule (CRITICAL)

**กฎเหล็ก: ตัวเลขใน stat card + Excel export ต้องตรงกับที่ user เห็นในตาราง**

### ReceiveLog
- `loadAgg` ต้อง select field ที่จำเป็นทั้งหมด (`drug_name, drug_code, lot, exp, bill_number, receive_date, qty_received, total_price_vat`) แล้วกรอง blank+dedup เหมือน `displayRows` ก่อนคำนวณ count/qty/value
- `handleExport` ต้องกรอง blank+dedup ด้วย — export ไม่ตรงกับตารางจะทำให้ user งง
- **อย่าใช้ `count: 'exact'` แบบ server-side** สำหรับ ReceiveLog เพราะมัน count รวม blank+duplicate rows ที่ client filter ออก

### DispenseLog
- `loadAgg` ต้องกรอง `.gt('qty_out', 0)` — row `qty_out=0` ถือเป็น void ไม่นับใน stats
- **อย่าแสดง `-0`** ใน UI — ใช้ helper `fmtQtyOut(q)` ที่คืน `'-N'` ถ้า > 0, `'0'` ถ้า = 0
- ใช้ `fmtQtyOut` ทั้งใน desktop table, drug-detail panel, mobile card, mobile bottom sheet

### Pattern dedupKey (ReceiveLog)
```js
const dedupKey = (r) => [
  r.receive_date || '',
  (r.drug_name   || '').trim().toLowerCase(),
  (r.lot         || '').trim().toLowerCase().replace(/^-$/, ''),
  (r.exp         || '').trim().toLowerCase().replace(/^-$/, ''),
  (r.bill_number || '').trim().toLowerCase().replace(/^-$/, ''),
].join('|');
```

### Blank-row filter (ReceiveLog)
```js
const name = (r.drug_name || '').trim().toLowerCase();
const code = (r.drug_code || '').trim();
const hasName = name && name !== '-' && name !== '(blank)' && name !== 'blank';
const hasCode = code && code !== '-';
if (!hasName && !hasCode) return false; // skip
```

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

## Department List — Pattern สำคัญ

มี **2 ระบบ** ที่ใช้รายการหน่วยงานต่างกัน:

### Hardcoded DEPARTMENTS (ใช้สำหรับ selection ตอนกรอกฟอร์ม)
| ไฟล์ | ใช้ใน |
|------|-------|
| `AppRoot.jsx` | ฟอร์มสมัครใช้งาน |
| `RequisitionApp.jsx` | ฟอร์มส่งใบเบิก (requester เลือกหน่วยงาน) |
| `UserManagementApp.jsx` | admin สร้าง/แก้ไข user |
| `ReturnApp.jsx` | ฟอร์มบันทึกคืนยา (DEPARTMENTS ชุดแผนกภายในเท่านั้น) |

**แก้รายการ → ต้องแก้ทุกไฟล์ข้างต้นพร้อมกัน**

### Dynamic (ดึงจากข้อมูลจริงใน DB)
| ไฟล์ | วิธีดึง | ใช้ใน |
|------|--------|-------|
| `DispenseLogApp.jsx` | `fetchAllDepts(supabase)` ดึง unique dept จาก `dispense_logs` | filter ประวัติเบิก |
| `RequisitionApp.jsx` StaffDashboard | `allDepts = [...new Set(list.map(r => r.department))]` | filter ใบเบิก |

### Do Not (Department List)
- **อย่าสับสนสองระบบ** — การลบออกจาก hardcoded list ไม่กระทบข้อมูลเก่าที่มีใน DB อยู่แล้ว
- ข้อมูลเก่าที่มีชื่อหน่วยงานเก่า → **ยังแสดงได้** ใน history apps (dynamic dept list)
- **CSV upload ไม่ validate ชื่อ dept** → upload ข้อมูลด้วยชื่อหน่วยงานใดก็ได้
- `fetchAllDepts` อยู่ใน `DispenseLogApp.jsx` เท่านั้น (local function, ไม่ใช่ใน `db.js`)

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
- requester เห็น 3 card: รายการยาในคลัง + ใบเบิกรอดำเนินการ + ยาใกล้หมดอายุ
- staff/admin เห็น 4 card: เพิ่ม Stock ต่ำกว่ากำหนด
- `fetchDashboardAlerts()` ถูกเรียกสำหรับ **ทุก role** (ไม่ใช่แค่ staff อีกต่อไป)
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

## ReturnApp — Return Type 2-Level Selection

### โครงสร้างประเภทการคืนยา (ระบบใหม่)
- **ระดับ 1 (return_source)**: derive อัตโนมัติจาก `department` — `'vendor'` ถ้าเลือก "บริษัทยา / Supplier", `'ward'` สำหรับหน่วยงานอื่น
- **ระดับ 2 (return_type → reason)**: สาเหตุ — `leftover`, `over_req`, `wrong_drug`, `damaged`, `expired`, `recall`, `vendor_return`
- สาเหตุที่แสดงในระดับ 2 กรองตาม source ที่ derive ได้ (เช่น `recall` ใช้ได้เฉพาะ `vendor`)
- `SOURCE_MAP` / `REASON_MAP` — lookup ชื่อ, badge color
- **ข้อมูลเก่า (Legacy)**: `return_source = null` → ใช้ `LEGACY_MAP` แสดง label เดิม (ward_return, damaged, expired_removal, vendor_return)

### UI — RecordTab Form (ปัจจุบัน)
- **ระดับ 1**: `SearchableSelect` dropdown จาก `SOURCE_DEPARTMENTS` = `[...DEPARTMENTS, 'บริษัทยา / Supplier']`
  - เลือกแล้ว → set `form.department` + derive `form.return_source` + auto-select reason แรก
  - `VENDOR_LABEL = 'บริษัทยา / Supplier'` — ตรวจด้วย `v === VENDOR_LABEL`
- **ระดับ 2**: `<select>` dropdown กรองตาม `form.return_source` — แสดงเฉพาะหลังเลือกหน่วยงานแล้ว
- Validation: `department` required เสมอ (ไม่ใช้ needsDept อีกต่อไป)
- field `department` ใน DB = ชื่อหน่วยงานที่เลือกโดยตรง (เช่น "ER (ฉุกเฉิน)")

### DB Column
- `return_logs.return_source TEXT` — เพิ่มด้วย `return_source_migration.sql` (รันแล้ว)
- `return_logs.return_type` — เดิมเก็บ legacy key, ใหม่เก็บ reason key
- `return_logs.department` — เดิมเก็บชื่อแผนก (ward เท่านั้น), ใหม่เก็บชื่อหน่วยงานทุกประเภท

### Helper Functions
- `getReturnBadge(log)` — คืน `{ badgeBg, badgeText, label }` รองรับทั้งใหม่/เก่า
- `getReturnLabel(log)` — แสดง "source · reason" (ใหม่) หรือ legacy label
- `getReturnShort(log)` — short label สำหรับ mobile card

### Filter Tabs (HistoryTab)
- Filter tabs ใช้ RETURN_SOURCES keys: ward, or, er, opd, vendor
- `countOf('ward')` นับทั้ง `return_source='ward'` และ legacy `return_type='ward_return'`
- `fetchReturnLogs` รับ `returnSource` (ใหม่) หรือ `returnType` (legacy)

### Label
- "เจ้าหน้าที่ผู้รับคืน / บันทึก" (ไม่ใช้คำว่า "เภสัชกร") — ทั้ง form และ print view

### Do Not (Return Type)
- อย่าใช้ `SOURCE_MAP[source].needsDept` เพื่อตรวจว่าต้องแสดงช่องแผนก — ถูกลบออกแล้ว ใช้ `form.department` required แทน
- อย่า hardcode `return_source = 'ward'` สำหรับหน่วยงานเฉพาะ — ใช้ `v === VENDOR_LABEL` เท่านั้น

## IsoDateInput — วันที่แสดง DD/MM/YYYY (พ.ศ.)

### ปัญหา
`<input type="date">` บน browser ที่ locale เป็น US แสดง MM/DD/YYYY แทน DD/MM/YYYY

### Pattern ที่ถูกต้อง (ISO state)
เพิ่ม `IsoDateInput` component inline ในแต่ละ file ที่ต้องการ:
```jsx
function IsoDateInput({ value, onChange, className = '' }) {
  const display = iso => { if (!iso) return null; const [y,m,d] = iso.split('-'); return `${d}/${m}/${Number(y)+543}`; }
  return (
    <div className={`relative flex items-center bg-white border border-slate-300 rounded-lg focus-within:ring-2 ... ${className}`}>
      <span className={`px-3 py-1.5 text-sm w-full select-none pointer-events-none ${value ? 'text-slate-800' : 'text-slate-400'}`}>{display(value) || 'dd/mm/yyyy'}</span>
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 w-full cursor-pointer" />
    </div>
  )
}
```
- state เก็บ ISO (YYYY-MM-DD) — ไม่ต้องแปลงก่อนส่ง Supabase
- ต่างจาก `ThaiDateInput` ใน DispenseLog/ReceiveLog ที่เก็บ DD/MM/YYYY

### Files ที่ใช้ IsoDateInput
| App | จุดที่ใช้ |
|-----|---------|
| AuditLogApp | filter dateFrom / dateTo |
| ReturnApp | RecordTab form date + HistoryTab filter |
| AnalyticsApp | filter (dark bg: `bg-white/10 text-white`) |
| RequisitionApp | StaffDashboard history filter |

### Do Not
- อย่าใช้ plain `<input type="date">` โดยตรงในที่ที่แสดงผลให้ user เห็น — ใช้ IsoDateInput แทนเสมอ
- ThaiDateInput (Dispense/ReceiveLog) เก็บ DD/MM/YYYY — **ห้ามสลับกับ IsoDateInput**
- **ห้ามสร้าง `ISODateInput` (ตัวพิมพ์ใหญ่ทั้งหมด)** — ชื่อที่ถูกต้องคือ `IsoDateInput` (camelCase) ที่แสดงปีเป็น พ.ศ. (+543) เท่านั้น เคยมี duplicate เกิดขึ้นจาก git merge แล้วถูกลบออกแล้ว

## AuditLogApp — Bulk Select (Admin)

- **Checkbox** ซ้ายทุก row (desktop + mobile card) แสดงเฉพาะ `auth.role === 'admin'`
- **Select All** — checkbox ใน header ตาราง มี indeterminate state ถ้าเลือกบางส่วน
- **Bulk Action Bar** ใน header ของ table: "เลือก N รายการ · ยกเลิก · ลบที่เลือก"
- **Confirm 2 ขั้น**: กดครั้งแรก → "ยืนยันลบ N รายการ", กดอีก → ลบจริง
- `bulkDeleteAuditLogs(ids)` ใน db.js — ลบหลาย row ด้วย `.in('id', ids)`
- Reset selection อัตโนมัติเมื่อค้นหาใหม่ (useEffect load)

## ReturnApp — Admin Edit/Delete (HistoryTab)

- **ปุ่มแก้ไข/ลบ** แสดงเฉพาะ `auth.role === 'admin'` — staff/requester ไม่เห็น
- **Desktop**: ปุ่มอยู่ใน expanded row ต่อจากปุ่มพิมพ์ — ลบมี confirm 2 click (`deletingId` state)
- **Mobile**: ปุ่มอยู่ใน bottom sheet ต่อจากปุ่มพิมพ์ — grid 2 คอลัมน์ (แก้ไข / ลบ)
- **EditReturnModal**: แก้ไขได้ทุก field (return_date, return_type, drug_name, drug_code, drug_type, qty_returned, drug_unit, lot, exp, department, returned_by, received_by, note)
- **db.js functions**:
  - `deleteReturnLog(id, auth)` — ลบ + audit log `delete_return`
  - `updateReturnLog(id, fields, auth)` — update + audit log `update_return`

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

## StockSummaryModal — จำนวนคงเหลือในคลัง

- เปิดจาก Dashboard card "รายการยาในคลัง" (StatsStrip)
- **Layout**: Desktop → modal กว้าง `max-w-5xl` กลางหน้าจอ / Mobile → bottom sheet เลื่อนขึ้นจากล่าง (`rounded-t-2xl`)
- ตาราง: sticky header + frozen column "ชื่อยา" (ซ้าย) + scroll แนวนอน บน mobile
- Realtime: subscribe `postgres_changes` บน `inventory` table → อัพเดตอัตโนมัติ
- DrugSearchBar ใน modal รองรับ keyboard navigation (↑↓ Enter Esc) แล้ว
- **Sort**: คลิก header ชื่อยา / คงเหลือ / LOT เพื่อ sort — cycle asc → desc → default (`sortBy` state `{ key, dir } | null`)
- **Do not**: อย่าใส่ `style={{ maxHeight }}` ซ้อนทับ `flex-1` ใน table area — ใช้ `95vh` บน modal wrapper แทน

## ExpiryAlertSection — Export Excel

- ปุ่ม Export Excel อยู่ใน header ของ modal (ข้างปุ่มปิด) — ใช้ `EXPIRY_EXCEL_COLS` (module-level constant)
- Export ข้อมูลตาม **tab filter ที่เลือกอยู่** (`filtered`) ไม่ใช่ทั้งหมด
- ชื่อไฟล์: `expiry_alert_{tabLabel}_{date}.xlsx`
- ต้องส่ง `auth` prop ไปที่ `<ExpiryAlertSection auth={auth} />` เสมอ

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

## ThaiDateInput — Mobile Date Picker Bug (แก้แล้ว)

### อาการ
- กดช่องวันที่บน mobile → date picker ไม่เปิด (ทำงานได้ปกติบน desktop)
- พบใน DispenseLogApp และ ReceiveLogApp

### สาเหตุ
`ThaiDateInput` ซ่อน `<input type="date">` ด้วย `pointer-events-none w-0 h-0` แล้วเรียก `showPicker()` จาก div `onClick` แทน
iOS Safari และ Android Chrome block `showPicker()` ที่ไม่ได้เรียกจาก user gesture บน input element โดยตรง

### แก้
เปลี่ยน input เป็น `absolute inset-0 opacity-0 w-full cursor-pointer` — ขนาดเต็ม wrapper แต่ซ่อนด้วย opacity
touch event โดน native input โดยตรง → date picker เปิดได้ทันที ไม่ต้อง `showPicker()` และไม่ต้องมี `ref`

```jsx
// ✅ ถูก
<div className={`relative ${size} border ...`}>
  <span className="... pointer-events-none">{value || placeholder}</span>
  <input type="date"
    className="absolute inset-0 opacity-0 w-full cursor-pointer"
    value={thaiToIso(value) || ''}
    onChange={e => onChange(isoToThai(e.target.value))} />
</div>

// ❌ ผิด — mobile ไม่ทำงาน
<div onClick={() => ref.current?.showPicker?.()}>
  <input type="date" ref={ref}
    className="absolute opacity-0 w-0 h-0 pointer-events-none" .../>
</div>
```

### ขอบเขต (อัพเดต)
- `ThaiDateInput` (stores Thai format) — **ReceiveLogApp**, **DispenseLogApp** ✅
- `ISODateInput` (stores ISO format, shows DD/MM/YYYY) — **AuditLogApp**, **ReturnApp** filter, **AnalyticsApp**, **RequisitionApp** RequesterHistory ✅
- ทุก date input มี `text-base` (16px) กัน iOS auto-zoom, `cursor-pointer` + `hover:border-slate-400` บน wrapper ✅
- RequisitionApp StaffDashboard ใช้ overlay pattern อยู่แล้ว (dateFilter เก็บ ISO) + ได้ `text-base` แล้ว ✅

### Do Not (Date Input)
- **อย่าใช้ `font-size < 16px`** บน hidden `<input type="date">` — iOS Safari auto-zoom เมื่อ focus
- **อย่าใช้ `showPicker()`** — iOS block; ใช้ `absolute inset-0 opacity-0` แทน
- `ISODateInput` vs `ThaiDateInput`: ต่างกันที่ค่า state — ISO เก็บ `YYYY-MM-DD`, Thai เก็บ `DD/MM/YYYY`

## Date Range Display — ReceiveLogApp & DispenseLogApp

- แสดง chip "ข้อมูลตั้งแต่ DD/MM/YYYY – DD/MM/YYYY · X ปี Y เดือน Z วัน" เหนือ stat cards
- ดึง `minDate` / `maxDate` ใน `loadAgg` ด้วย 2 parallel queries เพิ่มใน `Promise.all`
- **สำคัญ**: ต้องใช้ `.not('receive_date', 'is', null)` ก่อน `.order()` เสมอ — PostgreSQL sort `NULL DESC` ขึ้นก่อน ทำให้ max query ได้ null แทนวันล่าสุด
- `aggStats` มี: `{ count, totalQty, totalValue, minDate, maxDate }` (ISO format)
- แสดงเมื่อ `aggStats?.minDate && aggStats?.maxDate` เท่านั้น
- `dateDiff(isoFrom, isoTo)` → คืน string เช่น "1 ปี 9 เดือน 18 วัน" หรือ "วันเดียวกัน"

### Do Not (Date Range)
- **อย่าลืม `.not('...date', 'is', null)`** ใน min/max query — NULL ใน DESC order ขึ้นก่อนเสมอ
- อย่าเช็ค condition แค่ `aggStats?.minDate` — ต้องเช็คทั้ง `minDate && maxDate` ก่อนแสดง

## DrugSearchBar — Keyboard Navigation

- กด `↓` / `↑` เลื่อนรายการใน dropdown
- กด `Enter` เลือกรายการที่ highlight
- กด `Esc` ปิด dropdown
- hover เมาส์ sync กับ keyboard highlight
- dropdown มี `max-h-56 overflow-y-auto` — scroll ได้เมื่อรายการเยอะ
- active item scroll into view อัตโนมัติ (`scrollIntoView({ block: 'nearest' })`)
- **Do not**: อย่า set `pointer-events-none` บน input ของ dropdown — ทำให้ keyboard event ไม่ทำงาน

## AnalyticsApp — Drug Name Deduplication

### อาการ
- dropdown ชื่อยาแสดงซ้ำ เช่น "Manidipine 20mg" ปรากฏ 2 ครั้ง

### สาเหตุ
`new Set(rows.map(r => r.drug_name))` dedup ด้วย exact string — ถ้าใน DB มีชื่อเดียวกันแต่ whitespace ต่างกัน (trailing space, double space) จะแยกเป็น 2 รายการ

### แก้
Normalize ก่อน dedup: `.trim().replace(/\s+/g, ' ')` ทั้งใน `drugNames` useMemo และ `filteredRows` filter

## Print Mobile — White Screen Bug (แก้แล้ว)

### อาการ
- กดปุ่มพิมพ์บน mobile → tab ใหม่เปิด แต่หน้าขาว (เฉพาะ iOS Safari)
- พบใน RequisitionApp (`printReq`) และ ReturnApp (`printReturnLog`)

### สาเหตุ
`window.open('', '_blank') + w.document.write(html)` — iOS Safari ถือว่าการเขียน HTML เข้า `about:blank` tab เป็น cross-origin → block → หน้าขาว

### แก้
ใช้ **Blob URL** แทน `document.write()`:
```js
// ✅ ถูก — ใช้ Blob URL
const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
const url  = URL.createObjectURL(blob);
const w    = window.open(url, '_blank');
if (w) setTimeout(() => URL.revokeObjectURL(url), 30000);
else   URL.revokeObjectURL(url);

// ❌ ผิด — mobile iOS ขาว
const w = window.open('', '_blank', 'width=900,height=650');
if (w) { w.document.write(html); w.document.close(); }
```

### ขอบเขต
- `printReq` ใน **RequisitionApp** — แก้แล้ว ✅
- `printReturnLog` ใน **ReturnApp** — แก้แล้ว ✅
- ทุก print function ใหม่ต้องใช้ Blob URL เสมอ

## RequisitionApp — Edit Modal Search Bar

- edit modal แสดง `DrugSearchBar` กรองรายการยา เมื่อใบเบิกมีรายการ **> 4 รายการ**
- state `itemSearch` reset เป็น `''` ทุกครั้งที่เปิด `openEdit()`
- filter ใช้ `item.drug_name.toLowerCase().includes(itemSearch.toLowerCase())`
- ปุ่ม −/+ ใช้ `realIdx` (index จาก `editDraft.items` ตัวจริง) ไม่ใช่ `idx` จาก filtered array — ป้องกัน qty update ผิดตัว

## RequisitionHistory — Drug Search Bar (ค้นหาย้อนหลัง)

- `DrugSearchBar` กรองประวัติใบเบิกตามชื่อยา — แสดงเมื่อ `list.length > 0`
- `historyDrugNames` useMemo: ดึงชื่อยาทั้งหมดจาก `list[].requisition_items[].drug_name` (ไม่ query DB เพิ่ม)
- `filteredList` useMemo: กรองใบเบิกที่มีอย่างน้อย 1 item ตรงกับ `drugSearch`
- แสดง "พบ X ใบเบิก · ค้นหา 'ชื่อยา'" ใต้ search bar เมื่อมีคำค้น
- state `drugSearch` แยกจาก `itemSearch` (ใช้ใน edit modal)

## DrugSearch — Pending Notification Banner

- `pendingCount` state โหลดจาก `requisitions` count โดย filter `department + requester_name + status='pending'`
- subscribe `postgres_changes` บน `requisitions` → อัพเดต real-time เมื่อ staff อนุมัติ/ปฏิเสธ
- แสดง banner สีเหลืองด้านบน Hero Search Area เมื่อ `pendingCount > 0`
- คลิก banner → `onHistory()` ไปหน้าประวัติทันที
- banner ซ่อนอัตโนมัติเมื่อ `pendingCount === 0` (ไม่ต้อง manual dismiss)

## RequisitionApp — Picking Workflow (จัดยา → ตรวจนับ → จ่ายออก → รับยา)

### Status Flow ใหม่
```
pending → approved/partial/rejected → picking → ready → dispensed → received
```

### STATUS_CONFIG ครบ 8 สถานะ
| status | label | badge color |
|--------|-------|------------|
| pending | รอดำเนินการ | amber |
| approved | อนุมัติแล้ว | green |
| partial | อนุมัติบางส่วน | orange |
| rejected | ไม่อนุมัติ | red |
| picking | กำลังจัดยา | purple |
| ready | รอตรวจนับ | indigo |
| dispensed | จ่ายยาแล้ว | blue |
| received | รับยาแล้ว | teal |

### db.js Functions (Picking Workflow)
```js
fetchInventoryByCodes(codes)                             // ดึง inventory หลาย code (qty > 0), ไม่ sort — sort FEFO client-side ด้วย parseExp
startPickingRequisition(id, { pickerName, items }, auth) // approved → picking, บันทึก picked_lot/exp/qty ต่อ item
verifyRequisition(id, verifierName, auth)                // picking → ready, บันทึก verifier_name
markRequisitionDispensed(id, auth)                       // ready → dispensed, บันทึก dispensed_at
confirmReceivedRequisition(id, receivedBy, auth)         // dispensed → received, บันทึก received_at + received_by
```

### DB Columns เพิ่มเติม (migration: `picking_workflow_migration.sql`)
**requisitions**: `picker_name`, `picking_started_at`, `verifier_name`, `verified_at`, `dispensed_at`, `received_at`, `received_by`
**requisition_items**: `picked_lot`, `picked_exp`, `picked_qty`

### StaffDashboard
- Task Strip (4 card): รอดำเนินการ (red) / รออนุมัติ·จัด (amber) / กำลังจัด·ตรวจ (purple) / เสร็จสิ้นวันนี้ (emerald)
- Tabs (4 แท็บ):

| key | label | filter |
|-----|-------|--------|
| `pending` | รอดำเนินการ | status = pending |
| `approved` | รออนุมัติ/จัด | status = approved หรือ partial |
| `picking` | กำลังจัด/ตรวจ | status = picking หรือ ready |
| `all` | ประวัติ | ทุก status + dateFilter |

- 3 แท็บแรก (pending/approved/picking) ไม่กรองด้วย dateFilter — แสดงทุกรายการที่ค้างอยู่
- Card footer buttons ตาม status:
  - `pending` → "อนุมัติด่วน"
  - `approved/partial` → "เริ่มจัดยา" → PickingModal
  - `picking` → "ตรวจนับ" → VerifyModal
  - `ready` → "จ่ายออก" (confirm 2 click ด้วย `dispatchingId` state)
- `dispatchingId` state: กด 1 = ปุ่มเปลี่ยนเป็น "ยืนยัน?", กด 2 = execute `markRequisitionDispensed`
- **Bulk action "อนุมัติที่เลือก"**: แสดงเฉพาะเมื่อ selected items มีอย่างน้อย 1 รายการที่ status = `pending` — ไม่แสดงถ้าเลือกแต่ dispensed/received
- **Date filter display**: ใช้ pattern overlay `span` + `opacity-0 input` เหมือน ThaiDateInput — แสดง DD/MM/YYYY แทน browser locale (MM/DD/YYYY)

### PickingModal
- โหลด inventory ด้วย `fetchInventoryByCodes` → sort FEFO client-side (parseExp)
- Auto-select lot แรก (FEFO) ให้ทุก item เมื่อโหลดเสร็จ
- Staff กรอกชื่อผู้จัดยา + เลือก Lot + กรอก picked_qty (default = approved_qty)
- ไม่แสดง item ที่ approved_qty = 0

### VerifyModal
- แสดง picked_lot, picked_exp, picked_qty ของแต่ละ item (readonly)
- แจ้งเตือน (orange) ถ้า verifier_name === picker_name — ไม่บล็อก
- Staff กรอกชื่อผู้ตรวจนับ → confirm → status: ready

### RequisitionHistory (ฝั่ง requester)
- สถานะ `dispensed` → ปุ่ม "ยืนยันรับยาแล้ว" ใน expanded section
- `received_by` = `info.name` (ชื่อผู้เบิกที่ login)
- แสดง picked_qty + picked_lot ใน item list ถ้ามีข้อมูล

### RequisitionDetail (หน้าดูรายละเอียด / อนุมัติ)
- **Search bar**: `DrugSearchBar` กรองรายการยาใน detail — แสดงเมื่อ `items.length > 3`
- `filteredItems` useMemo กรองจาก `items` ตาม `detailSearch`
- `detailDrugNames` useMemo สร้างจาก `items` (ไม่ query DB)
- การ render ใช้ `filteredItems.map` แต่ `updateItem` ใช้ `realIdx = items.findIndex(it => it.id === item.id)` — ป้องกัน approve ผิดตัว
- **Header buttons**: Excel (emerald `bg-emerald-500`) + พิมพ์ (white `bg-white text-[#1E90FF]`) — ไม่มีปุ่ม CSV แล้ว
- Excel ใน detail ใช้ `exportReqExcel([currentReq], auth)` เหมือน StaffDashboard

### Do Not (Picking Workflow)
- อย่าลืมรัน `picking_workflow_migration.sql` ใน Supabase Dashboard ก่อนใช้งาน
- `fetchInventoryByCodes` ไม่ sort DB — sort FEFO ด้วย parseExp client-side เสมอ
- `markRequisitionDispensed` ใช้กับ `ready` เท่านั้น ไม่ใช่ approved โดยตรง
- ไม่หักสต็อกอัตโนมัติ — ข้อมูล picked_qty ใช้ดาวน์โหลด Excel ตัดสต็อกแยกต่างหาก
- `exportCSV` function ยังอยู่ใน code แต่ไม่มีที่เรียกแล้ว — ห้ามนำกลับมาใช้ ให้ใช้ `exportReqExcel` แทนเสมอ

## Do Not

- **อย่าเรียก `supabase` โดยตรงในไฟล์ component** — ต้องผ่าน `src/lib/db.js` เสมอ
- **อย่าสร้างไฟล์ `.css` แยก** — ใช้ Tailwind utility class เท่านั้น ไม่มี `<style>` tag
- **อย่า hardcode ค่าใดๆ ที่ควรมาจาก `.env`** — โดยเฉพาะ API key และ URL
- **อย่าเพิ่มฟีเจอร์ที่ไม่ได้ถูกขอ** — แก้เฉพาะสิ่งที่ถาม ไม่ refactor โค้ดรอบข้าง
- **อย่าใช้ mock/hardcode data ใน component** — ถ้าไม่มี supabase ให้ return null หรือ empty state
- **อย่าเพิ่ม comment อธิบายโค้ดที่ self-evident** — เพิ่ม comment เฉพาะ logic ที่ซับซ้อน
- **อย่าเปลี่ยน UI text เป็นภาษาอังกฤษ** — ทุก label, placeholder, alert ต้องเป็นภาษาไทย
- **อย่า push หรือ commit โดยไม่ได้รับคำสั่ง** — ถามก่อนเสมอถ้าไม่แน่ใจ
