# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

คู่มือสำหรับ Claude Code ทำงานกับ repo นี้ — เก็บแต่ภาพรวม convention และ pointer ไป `docs/`

## บทบาทผู้พัฒนา (Senior Software Engineer Mindset)

**ทำงานแบบ senior software engineer ทุกครั้ง** — ไม่ใช่แค่เขียนโค้ดให้เสร็จ แต่ตรวจสอบเชิงระบบ:

1. **คิดเป็นระบบ ไม่ใช่เป็นไฟล์** — แก้ฟีเจอร์ใหม่ต้องตรวจให้ครบ: DB layer (`db.js`) + UI + audit log + notification + permission + mobile + E2E test
2. **Cross-cutting concerns ต้องครอบคลุมทุก sub-app**:
   - **Audit log**: ทุก mutation (INSERT/UPDATE/DELETE) ต้องเรียก `insertAuditLog` พร้อม `auth` ครบ
   - **Notification bell**: action สำคัญที่ staff ต้องรู้ → เพิ่มใน `NOTIF_LABELS` + handler `notifMessage()` ใน [NotificationBell.jsx](src/NotificationBell.jsx) (ดู Critical Rule #12 — ต้อง sync 3 ที่)
   - **Permission**: action ใหม่ต้องเช็คว่า role ไหนทำได้ (`SYSTEM_ACCESS` ใน [UserManagementApp.jsx](src/UserManagementApp.jsx))
3. **Verify ก่อนสรุปเสมอ** — `npm run lint` + reproduce ปัญหา + ตรวจ side-effect ในไฟล์อื่น (ดู section "Verify ก่อนสรุป" ด้านล่าง)
4. **คุณภาพมากกว่าความเร็ว** — เจอ gap ระหว่างทาง (เช่น label หายไปใน UI) ให้ flag กับ user ก่อนเสมอ ไม่เงียบ
5. **ไม่ duplicate test/skill** — ก่อนเพิ่มไฟล์ test/skill ใหม่ ต้อง grep หาของเดิมก่อน (กฎ "อ่านก่อนแก้")

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # Run ESLint
npm run preview      # Preview production build
npm run test:reorder   # Golden tests สำหรับ src/lib/reorder.js (35 assertions)
npm run test:billgroup # Golden tests สำหรับ src/lib/billGroup.js — AP bill grouping (24 assertions)
npm run test:unit      # Golden tests สำหรับ src/lib/unitParser.js — แปลงหน่วยซื้อ/เบิก (test อยู่ที่ src/unitParser.test.js)
npm run test:alloc     # Golden tests สำหรับ src/lib/lotAllocation.js — FEFO auto-split (เบิกระดับยา B-base)
npm run test:ledger     # Golden tests สำหรับ src/lib/ledgerRollover.js — สมการคงคลัง + ขึ้นเดือนใหม่ (ADR-0007)
npm run test:ledgerseed # Golden tests สำหรับ src/lib/ledgerSeed.js — seed master CSV → ledger row (ADR-0007)
npm run test:swappolicy # Golden tests สำหรับ src/lib/swapPolicy.js — parse นโยบายคืนยา + deadline (88 assertions — V1 free-text + V2 structured tier % 6 หมวดฐานเวลา, ADR-0014)
npm run test:consistency # Golden tests สำหรับ src/lib/consistencyCheck.js — ตรวจความสอดคล้อง CSV→DB (33 assertions)
npm run test:countmatch  # Golden tests สำหรับ src/lib/countMatch.js — ตรวจนับ: 3 สถานะต่อมิติ + set equality ที่เก็บ/exp (33 assertions)
npm run test:stockcard   # Golden tests สำหรับ src/lib/stockCard.js — การ์ดคลัง lot: running balance ต่อ lot + drift detection (105 assertions)
npm run test:vendorexchange # Golden tests สำหรับ src/lib/vendorExchange.js — รอบเปลี่ยน/คืนบริษัท: จับคู่ขาส่ง↔ขารับ หา "ของลอย" (30 assertions)
```

ไม่มี test runner ทั่วไป — golden tests เป็น standalone `node` (ไม่มี framework): `src/unitParser.test.js` (`npm run test:unit`), `src/lib/reorder.test.js` (`npm run test:reorder`), `src/lib/billGroup.test.js` (`npm run test:billgroup`), `src/lib/lotAllocation.test.js` (`npm run test:alloc`), `src/ledgerRollover.test.js` (`npm run test:ledger`), `src/ledgerSeed.test.js` (`npm run test:ledgerseed`), `src/lib/swapPolicy.test.js` (`npm run test:swappolicy`), `src/lib/consistencyCheck.test.js` (`npm run test:consistency`). **กฎ**: logic ที่ test แบบนี้ได้ต้องเป็น pure module ไม่ import `supabase` (เพราะ `supabase.js` ใช้ `import.meta.env` ที่ node รันไม่ได้) — ดู `billGroup.js`/`lotAllocation.js`/`ledgerRollover.js`/`ledgerSeed.js` แยกจาก `db.js` ด้วยเหตุนี้. **หมายเหตุ layout**: source module ของ ledger อยู่ใน `src/lib/` แต่ test file (`ledgerRollover.test.js`/`ledgerSeed.test.js`) อยู่ที่ `src/` root — ต่างจาก golden test อื่นที่วาง test ข้าง source

**E2E**: Playwright (`tests/01-12`) — `npx playwright test` — ครอบคลุม login, dashboard, requisition, return, staff flow, validation, permissions, **AP workflow UX, ทุก sub-app smoke, mobile responsive 375px, a11y, ระบบวิเคราะห์การสั่งซื้อยา, โมดอลใกล้หมดอายุ/คืนบริษัท (ประวัติรับยา+scope+deadline+ตัวกรองพับ)** ดู [docs/testing.md](docs/testing.md)

## Architecture

Single-page React app (no React Router) สำหรับระบบคลังยาโรงพยาบาล — routing ทำผ่าน **navigation stack** (`navStack`) ใน `AppRoot.jsx`

**App flow:**
1. `AppRoot.jsx` handle login + render sub-app ตาม `navStack` (array ของ page key — หน้าปัจจุบัน = ตัวท้าย) เพื่อรองรับปุ่มย้อนกลับแบบ browser. `setPage(p)` = push (กัน push ซ้ำหน้าเดิม), `goBack()` = pop, `canGoBack` = `navStack.length > 1`. **`setPage` signature เดิม** — ทุก call site (sidebar/toast/onNavigate/onBack) ได้ stack behavior อัตโนมัติ. เมื่อ login แล้ว content ทุกหน้าถูกครอบด้วย `<AppShell>` (sidebar)
2. Auth = username + SHA-256 password (Web Crypto), เก็บใน `app_users` table
3. First-run: ถ้า `app_users` ว่าง → แสดง admin setup
4. 3 roles: `requester`, `staff`, `admin` (ดู [docs/auth.md](docs/auth.md))

**Navigation shell (`AppShell.jsx` + `navConfig.js`):**
- `AppShell.jsx` — sidebar ถาวร (desktop `lg:pl-60` fixed; mobile = drawer + hamburger) ครอบ content ทุกหน้า. มีปุ่ม refresh (เรียก `refreshPage`/subKey remount) + logout ที่ footer — sub-app **ไม่มีปุ่ม logout เอง** (sidebar คุม navigation). **ปุ่มย้อนกลับ (browser-like) = component กลาง `BackButton.jsx`** วาง **inline ซ้ายไอคอน/ชื่อระบบใน header ของแต่ละ sub-app** (เดิมเป็นปุ่ม floating ใน AppShell ที่ทับชื่อระบบ — ย้ายมา inline 2026-06-29 ให้สม่ำเสมอ ไม่ทับ). AppRoot ส่ง `onGoBack={goBack}` + `canGoBack` เป็น prop ให้ทุก sub-app; `BackButton` แสดงเมื่อ `canGoBack` เท่านั้น. **เพิ่ม sub-app ใหม่ต้องวาง `<BackButton onGoBack={onGoBack} canGoBack={canGoBack} />` ใน header เอง** (AppShell ไม่ render ปุ่มนี้แล้ว). **ยกเว้น `RequisitionApp`** ที่มีปุ่ม back ของตัวเองอยู่แล้ว (wizard-internal nav ผ่าน `PageHeader` `onBack`) — ไม่ใส่ BackButton ซ้ำ
- `navConfig.js` — `NAV_GROUPS` (เมนูจัดกลุ่มตาม workflow), `COLOR` (สีประจำระบบ — **เขียน class เต็ม ห้าม `bg-${c}-50`** Tailwind purge ตัด), `roles` filter ต่อเมนู (ตรงกับ `SYSTEMS.roles`). **เมนูแสดงเมื่อ `roles.includes(role)` OR `permissions.includes(item.page)`** — `AppShell` มี helper `canSee()` ([AppShell.jsx](src/AppShell.jsx)) ให้ admin grant สิทธิ์ระบบรายคนเพิ่มเหนือ role ได้ (ดู Critical Rule #23). shared กับ `DashboardV2Preview.jsx` (prototype เปิดด้วย `?v2`). **item มี 3 แบบ**: (1) leaf `{ page, ... }` → `onNavigate(page)` เปิดหน้า, (2) submenu `{ key, children }` → กางได้, (3) **action** `{ action, ... }` → `onFormAction(action)` ทำ action โดย**ไม่เข้า navStack/ไม่เปิดหน้า** (เช่น print) — dispatch ที่ `runFormAction` ใน [AppRoot.jsx](src/AppRoot.jsx); `NAV_ITEMS` filter action ออก (ไม่มี `page`). เมนู "แบบฟอร์มต่างๆ" ใช้ pattern นี้
- sub-app ใช้ **title bar ขาวบาง + ไอคอนสีประจำระบบ** (คลิกชื่อ = refresh) แทน header เต็มจอเดิม — **ยกเว้น `RequisitionApp.jsx`** ที่เก็บ header/back ไว้โดยเจตนา (`PageHeader` ใช้ `onBack` ปนกับ wizard-internal nav กลับ step→home view ที่ sidebar แทนไม่ได้ — แยก back-to-dashboard ออกก่อนจึงจะทำได้)
- **Submenu deep-link เข้า sub-tab ผ่าน `initialTab`**: submenu children เป็น leaf ที่ `page` เป็น page key เฉพาะ (เช่น `receive-scan`, `reorder-supplier`) — `AppRoot` route map page key นั้นเป็น sub-app เดิม + ส่ง `initialTab` prop (เช่น `<ReceiveLogApp initialTab="scan"/>`). ปัจจุบัน `NAV_GROUPS` มี submenu `key: 'receive'` (ประวัติรับยา ▸ ส่งบัญชี/สแกนบิล) + `key: 'reorder'` (วิเคราะห์สั่งซื้อ ▸ ตาราง/แยกบริษัท/verify/history). ⚠️ **`AppShell` render submenu แค่ 1 ชั้น** (`children.map(renderLeaf)` — `renderLeaf` รองรับแค่ `page`/`action` ไม่รองรับ nested children) → ห้ามซ้อน submenu ใน submenu. **child ที่เป็น staff-only ต้องตั้ง `roles: ['staff','admin']` เอง** (parent submenu แสดงถ้า role parent ผ่าน OR มี child ที่ `canSee` — ดู `canSee`/filter ใน [AppShell.jsx](src/AppShell.jsx))

**Sub-apps (component แยกอิสระ):**
- `App.jsx` — Inventory map, CSV upload, drug grid + **แจ้งเตือนเปลี่ยน/คืนยาก่อนพ้นเงื่อนไขบริษัท** (โมดอลใกล้หมดอายุ: badge "คืนบริษัท" + banner + ปุ่มแจ้งหัวหน้า; deadline = exp − นโยบายเดือน ผ่าน `swapPolicy.js` + ตาราง `swap_return_policy`) — popup เด้งอัตโนมัติหน้า Dashboard ([AppRoot.jsx](src/AppRoot.jsx)) ตอน staff/admin login ด้วย `fetchSwapReturnDue()` (ดู [docs/features/inventory-map.md](docs/features/inventory-map.md), [docs/features/swap-return.md](docs/features/swap-return.md))
- `RequisitionApp.jsx` — เบิกยา (ระดับยา/หน่วยย่อยสุด ซ่อน lot) + auto-split FEFO ผ่าน `src/lib/lotAllocation.js` (เก็บผลใน `picked_allocation` jsonb) + picking workflow + **ใบ lot คุม** (`printLotControl` — แนวนอน 16 คอลัมน์แบบ HosXP, snapshot `onhand` ตอนจัด, หมายเหตุอัตโนมัติ; `staff_note` ต้องรัน `staff_note_migration.sql`) + **ใบปะหน้า** (`printCoverForm` — ฟอร์มราชการ+สายลายเซ็น, ข้อความ pre-printed ใน const `COVER_FORM`) (ดู [docs/features/picking-workflow.md](docs/features/picking-workflow.md), ADR-0004, CONTEXT.md §ใบ lot คุม/§ใบปะหน้า)
  - **โครงสร้าง 3 view** (`RequisitionApp` route ด้วย state `view`): `HomeView` (role picker — dead code ใน live app เพราะ AppRoot บังคับ `startAsStaff` สำหรับ staff/admin) · `RequesterRoot` (สร้างใบเบิก: login → search → cart → history) · `StaffRoot` (อนุมัติ/จัด/จ่าย). staff/admin เข้า `StaffRoot` ตรงผ่าน [AppRoot.jsx](src/AppRoot.jsx) `startAsStaff`
  - **โหมด proxy (staff เบิกแทนหน่วยงาน):** ปุ่ม "สร้างใบเบิกแทนหน่วยงาน" ใน `StaffDashboard` header → state `proxy` ใน `RequisitionApp` → เปิด `RequesterRoot` แบบ **`prefilledUser={null}`** (staff เลือก ward เอง ผ่าน `RequesterLogin`). audit ตอน submit stamp **`user_name` = staff จริง** (`resolveAuditUserName(auth)`) + **`details.on_behalf_of` = ชื่อผู้เบิก proxy** (Rule #1) — แถว `requisitions` ยังเก็บ `requester_name` = proxy (ใบพิมพ์/ประวัติถูก). ⚠️ `CART_KEY` (`req_cart_draft`) เป็น **sessionStorage key เดียวทั้งระบบ** — proxy `removeItem(CART_KEY)` ทั้งตอนเข้า (`onProxyRequest`) และออก (`onBack`) กันตะกร้ารั่วข้าม ward/ข้ามผู้เบิกจริง
  - **breakdown ราย lot ในการ์ดค้นหา (informational):** `DrugSearch` มีปุ่ม "ดูรายละเอียด lot" กางแสดง บรรจุภัณฑ์(กล่อง×หน่วย)/exp/ที่เก็บ/บริษัท ราย lot — **read-only เพื่อวางแผนที่เก็บ ไม่ย้อน ADR-0004** (ยังขอระดับยา). ค่า = หลังหักจอง (available) + ประมาณการ FEFO. `location`/`supplier` ต้อง carry จาก `grouped.lots.push` → `fefoLots.push` (เดิมถูกทิ้ง). ดู CONTEXT.md §"คงเหลือรวม (ระดับยา)"
- `DispenseLogApp.jsx` — ประวัติเบิกจ่าย
- `ReceiveLogApp.jsx` — ประวัติรับยา + สแกนบิล AI (ดู [docs/features/invoice-scanner.md](docs/features/invoice-scanner.md))
- `ReturnApp.jsx` — บันทึกคืนยา (ดู [docs/features/return.md](docs/features/return.md))
- `AnalyticsApp.jsx` — วิเคราะห์เบิกยา (ดู [docs/features/analytics.md](docs/features/analytics.md))
- `AuditLogApp.jsx` — ดู audit log + tab **"สรุปการใช้งาน" (User Analytics)** admin-only: DAU/WAU/MAU/stickiness + กราฟแนวโน้ม 30 วัน + active-by-role + ตารางรายคน — derive จาก `audit_logs` (action=`login`) ผ่าน `fetchUserActivityStats()`, นับด้วย `details.user_id` (ไม่ใช่ user_name), cap 90 วันตาม retention. ดู CONTEXT.md §"Usage Analytics"
- `UserManagementApp.jsx` — admin จัดการ user
- `ReorderApp.jsx` — วิเคราะห์การสั่งซื้อยา (ROP/SS ตามสูตร Excel/VEN/แยกบริษัท) (ดู [docs/features/reorder.md](docs/features/reorder.md))
- `StockLedgerApp.jsx` — ทะเบียนคงคลังรายเดือน (admin) — seed master CSV + ปิด/เปิดงวด + tie-out ยา/มิใช่ยา (ดู [ADR-0007](docs/adr/0007-monthly-stock-ledger.md))
- `StockCardApp.jsx` — **การ์ดคลัง lot (Stock Card)** — เลือกยา 1 รหัส → ประวัติ movement ทุก lot ทุกเดือน (union รับ+เบิก) + **running balance ต่อ lot** คำนวณสด. port สูตรจาก Excel sheet "Stock Card (Lot)" (คลัง verify แล้ว 23/24 ยา). logic อยู่ใน pure module [stockCard.js](src/lib/stockCard.js) — `opening` = 0 ถ้า lot มีประวัติรับ, ไม่มี = `qty_before` แถวแรก; **ไม่หัก balance เฉพาะ `บันทึกเท่านั้น`+`แก้ไขระบบ`** (ที่เหลือหักปกติ รวม `คืนยา`/`ยืมยา`); **balance ติดลบ = data gap ต้นทาง ไม่ใช่บั๊ก**. **drift detection** (Excel ทำไม่ได้): เทียบ balance คำนวณ vs `qty_before` ที่บันทึก — ต่างกัน = มี movement ที่ไม่ถูกบันทึก → badge เตือน ไม่แก้ยอดให้. ⚠️ **ห้าม import `csvfile/Stockcard.csv`** — เป็น export ที่ formula cache ค้าง (ใช้เทียบผลได้ แต่ไม่ใช่แหล่งข้อมูล) ดู CONTEXT.md §การ์ดคลัง lot
- `StockCountApp.jsx` — ตรวจนับคงคลัง (staff/admin) — เลือกรหัสยา → ได้ lot ที่ qty>0 (lot ที่ระบบว่า 0 ซ่อน default กด "แสดงเพื่อนับ" ได้ — phantom stock) แต่ **ติ๊กเลือก lot ที่จะนับ** (`_selected` default true; save/print เฉพาะที่ติ๊ก; ปุ่ม X = `removeDrug` เอายาออกทั้งตัว ≠ checkbox ข้าม lot รายตัว) → นับ 3 มิติ (จำนวน/ที่เก็บ/exp) เทียบ `inventory.qty` สด. **จำนวนเป็นมิติบังคับตอน save** (ติ๊กแต่ไม่กรอก → เตือน ไม่บันทึก); มิติว่าง = "ไม่ได้ตรวจ" ไม่ใช่ "ตรง" — logic เทียบทั้งหมดอยู่ใน pure module **`src/lib/countMatch.js`** (`dimStatus`/`computeCountMatch`/`diffLabel`; ที่เก็บ/exp เทียบแบบ **set equality** split comma ไม่สนลำดับ). **ช่อง "ที่เก็บจริง" = `LocationInput`** (พิมพ์เองได้ + เลือก suggestion ซ้ำ = append ต่อท้ายคั่น comma). วันที่รอบ (`counted_at`) เลือกได้ตอนนับ + แก้ได้ในประวัติ (ปุ่มดินสอบนหัวรอบ → `updateStockCountSession`). **draft กันงานหาย**: เก็บ localStorage ต่อ user (`stockcount_draft_<username>`) + banner กู้คืน/ทิ้ง (ไม่ auto-restore). append-only เก็บ `stock_count_session`+`stock_count_item` (freeze snapshot, ไม่แก้ qty) + พิมพ์ใบเดินนับ (มี LINE WebView fallback แล้ว). ประวัติ: badge "ไม่ตรง N รายการ"/"ตรงทั้งหมด" (เฉพาะตรวจครบ 3 มิติ)/"ตรงตามที่ตรวจ" บนหัวรอบ (จาก `allItems` โหลดครบทุกรอบ), ส่วนต่างแสดง "ขาด N/เกิน N", ค้นยา → **timeline ทุกครั้งที่เคยนับ** + chip "นับล่าสุด" ในหน้านับ (ดู [ADR-0008](docs/adr/0008-stock-count-append-only-snapshot.md))

**Data layer:**
- ทุก Supabase query ผ่าน `src/lib/db.js` — component ห้ามเรียก `supabase` ตรงๆ
- `src/lib/supabase.js` init จาก `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- ถ้า `.env` ขาด → `supabase` = `null` และ fallback in-memory

**Schema:** ดู [docs/schema.md](docs/schema.md)

**Reusable:** `DrugSearchBar.jsx`, `SearchableSelect.jsx`

**Pure modules (no `supabase` import → golden-testable):** `src/lib/reorder.js`, `src/lib/billGroup.js`, `src/lib/lotAllocation.js` (FEFO allocation), `src/lib/unitParser.js`, `src/lib/ledgerRollover.js` (สมการคงคลัง + rollover), `src/lib/ledgerSeed.js` (RFC-4180 parser + map master→ledger), `src/lib/swapPolicy.js` (parse นโยบายคืนยา free-text → เดือน + คำนวณ deadline), `src/lib/consistencyCheck.js` (ตรวจความสอดคล้อง CSV→DB — referential + range-guard), `src/lib/stockCard.js` (การ์ดคลัง lot — running balance ต่อ lot + drift detection), `src/lib/vendorExchange.js` (รอบเปลี่ยน/คืนบริษัท — จับคู่ขาส่ง↔ขารับ หา "ของลอย") — แยกออกจาก `db.js` โดยเจตนาเพื่อให้รันใน node ได้ (ดู section Commands)

## Documentation Index

| Topic | File | อ่านเมื่อ |
|-------|------|----------|
| Domain glossary (ภาษากลาง: หน่วยซื้อ/เบิก, packsize, เรท, Refill mode ฯลฯ) | [CONTEXT.md](CONTEXT.md) | **ก่อนคุย/แก้ domain logic** — คำศัพท์ต้องตรง glossary |
| Architecture Decision Records (เหตุผลของ decision ที่กลับยาก) | [docs/adr/](docs/adr/) | ก่อนเปลี่ยน architecture / หาเหตุผลของ decision เดิม |
| Auth & Roles, permissions | [docs/auth.md](docs/auth.md) | แก้ login/role/permission |
| Common patterns (date, mobile, print, dept, audit auth, stats) | [docs/patterns.md](docs/patterns.md) | **อ่านทุกครั้ง** ก่อนแก้ component |
| DB schema, migrations, Excel cols | [docs/schema.md](docs/schema.md) | แก้ DB schema / Excel export |
| Monthly Stock Ledger (บัญชีคงคลังรายเดือน — seed/ปิดงวด/cost layer) | [docs/adr/0007](docs/adr/0007-monthly-stock-ledger.md) | แก้ `StockLedgerApp` / ledger logic / seed master CSV |
| นโยบายคืนยา: tier % + กฎ cond_am ระดับบริษัท | [ADR-0014](docs/adr/0014-structured-return-policy-tier-percent.md) · [ADR-0015](docs/adr/0015-cond-am-does-not-override-explicit-tier.md) | แก้ logic เตือนคืนบริษัท (ต้อง sync 4 ที่ + redeploy edge fn) |
| Roadmap | [docs/roadmap.md](docs/roadmap.md) | วางแผน feature ใหม่ |
| Testing | [docs/testing.md](docs/testing.md) | รัน/แก้ test |
| Expiry Alert Edge Function (แทน Apps Script) | [docs/expiry-alert-edge-function.md](docs/expiry-alert-edge-function.md) | แก้/deploy expiry alert |
| External: Apps Script แจ้งเตือนยาใกล้หมดอายุ (backup) | [docs/apps-script-expiry-alert.md](docs/apps-script-expiry-alert.md) | reference สคริปต์เดิม |

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
| `/monthly-stats-table` | ตาราง drug × month (ใช้ mechanics จาก `/sticky-table`) |
| `/sticky-table` | ตารางทั่วไป sticky header + frozen column (mechanics กลาง) |
| `/excel-export` | ปุ่ม Export Excel (.xlsx) + audit log |
| `/ui-style-guide` | Tailwind: สี, layout, buttons, inputs + card patterns (detail card, stat card gradient+glow, history-table, mobile card, badge) |
| `/karpathy-checklist` | Quick-check 4 ข้อก่อนลงมือ (Think / Simple / Surgical / Goal-Driven) |
| `/grill-with-docs` | ซักค้านแผนทีละข้อกับ domain model + อัพเดต CONTEXT.md/ADR inline |
| `/scrutinize` | รีวิว plan/PR/diff แบบ outsider — ตั้งคำถาม intent + trace code path จริง |
| `/handoff` | ย่อบทสนทนาเป็นเอกสารส่งต่อ (เซฟใน temp dir) ให้ agent ใหม่ทำงานต่อ |

**เมื่อสร้าง UI ใหม่ → อ่าน `.claude/skills/ui-style-guide/SKILL.md` ก่อนเสมอ**

## Workflow

### Karpathy Principles (ใช้ทุก task ที่ไม่ trivial)

> ที่มา: [Karpathy-Inspired Claude Code Guidelines](https://github.com/multica-ai/andrej-karpathy-skills)

1. **Think Before Coding** — surface assumptions ก่อน อย่า assume แบบเงียบๆ
   - ถ้า request interpret ได้ 2 แบบ → ถาม user ก่อนเสมอ
   - ถ้า assume แล้ว → บอก assumption ชัดๆ ใน response

2. **Simplicity First** — minimal code ที่ตอบ requirement จริง
   - ถ้า 50 บรรทัดพอ → ไม่เขียน 200
   - ถ้า pattern มีใน skill แล้ว → ใช้ skill ไม่เขียนใหม่
   - ถ้าไม่ต้อง DB → ใช้ `add-csv-column` แทน `add-db-column`

3. **Surgical Changes** — แตะเฉพาะที่ถูกขอ
   - ไม่ refactor โค้ดที่ไม่เกี่ยว
   - ลบเฉพาะ dead code ที่ตัวเองสร้าง (dead code เก่า → mention ไม่ลบ)
   - ทุก line ที่เปลี่ยนต้อง trace กลับหา request ได้

4. **Goal-Driven Execution** — ทุก step มี verify criteria
   - "แก้บั๊ก" → reproduce ก่อน → แก้ → ยืนยันว่าไม่เกิดแล้ว
   - "เพิ่ม feature" → lint ผ่าน + build ผ่าน + แสดงใน browser

ใช้ `/karpathy-checklist` เมื่อต้องการ quick-reference ทั้ง 4 ข้อพร้อม project-specific traps

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
1. lint **เฉพาะไฟล์ที่คุณแก้** ผ่าน (`npx eslint <ไฟล์>`) — ⚠️ `npm run lint` ทั้ง repo **ไม่ใช่ 0**: มี error ค้างเดิม ~53 ตัว (63 problems รวม warning ณ 2026-07-15) ในไฟล์ committed (ReceiveLog/Requisition/Dispense/Return/Analytics + tests — set-state-in-effect, empty block, `use()` ใน try/catch, `process` undefined ใน test) ที่ไม่เกี่ยวกับงานคุณ — ห้ามไป "แก้" error เหล่านั้นเว้นแต่ถูกขอ และอย่าตกใจว่าตัวเองทำพัง. **เทียบ baseline ก่อนโทษตัวเอง**: `git stash && npx eslint <ไฟล์> ; git stash pop` แล้วนับ error ก่อน/หลัง — ถ้าจำนวนเท่าเดิม = ไม่ได้ทำพัง
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
- domain term ใหม่/นิยามที่ขัดแย้ง → `CONTEXT.md` (glossary เท่านั้น ไม่ใส่ implementation)
- decision ที่กลับยาก → `docs/adr/` (เกณฑ์ + format ดู `/grill-with-docs`)

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

### Key shared functions

- **`fetchDashboardAlerts()`** (db.js) — return `{ expiring, lowStock, pendingReceive }` — ดึง inventory + receive_logs (paginated) เพื่อคำนวณ `waitDays` ของบิลรอตรวจรับ — ใช้ใน StatsStrip ของ Dashboard
- **`fetchDashboardCharts(months = 6)`** (db.js) — return `{ dispense: [{ ym, label, count, value }], receive: [...], maxValueMonth, maxReceiveValueMonth, trend: { dispensePct, receivePct, dispenseLabels: {cur,prev}, receiveLabels: {cur,prev} } }` — เบิก/รับ รายเดือน ย้อนหลัง `months` เดือน แต่ละเดือนมีทั้ง `count` (จำนวนครั้ง) และ `value` (**มูลค่าบาท** — เบิก = `Σ qty_out×ราคา/หน่วย` ตรงกับ `getPrice` ใน DispenseLogApp; รับ = `Σ total_price_vat` ตรงกับ `totalValue` ใน ReceiveLogApp). **มูลค่าข้ามหน่วยได้** (บาทคือบาท) จึงรวมข้ามแถวได้ — ต่างจากการรวม `qty` ดิบที่หน่วยปน. `trend`/กราฟ/เลขเด่น ใช้ **value** เป็นหลัก. **ไม่ dedup** (ภาพรวม trend — ตัวเลข authoritative ดูในโมดอลสรุปของแต่ละหน้า). **trend % เทียบ 2 เดือนที่จบแล้ว** — `pctInfo` ตัดเดือนปัจจุบัน (`ym === curYm`) ออกก่อนหาคู่เทียบ ไม่งั้นเทียบเดือนครึ่งใบ→เพี้ยน (↓98/99%); `*Labels` = ชื่อเดือนคู่ที่เทียบให้ caption แสดง "มิ.ย. เทียบ พ.ค." (concept เดียวกับ "เรท" CONTEXT.md — ตัดเดือนล่าสุดที่ยังไม่ครบ; AnalyticsApp `momTrend` ใช้กฎเดียวกัน). ใช้ใน `DashboardCharts` (area เบิก / **ComposedChart รับ = bar + เส้นแนวโน้ม** + คำสรุปเดือนมูลค่าสูงสุด + ลิงก์ไปประวัติเบิก/รับ + ตาราง Top 5 ยาต้องสั่งซื้อ จาก `alerts.lowStock`) ใน [AppRoot.jsx](src/AppRoot.jsx) — **แสดงทุก role** (กระดิ่งแจ้งเตือนก็แสดงทุก role แล้ว — staff/admin เห็น global, requester เห็นเฉพาะแผนกตัวเอง ดู [NotificationBell.jsx](src/NotificationBell.jsx) + ADR-0010)
- **`printApBatch(rows, batchId, { kind, senderName, inspectorNames })`** (ReceiveLogApp.jsx) — รับ `kind: 'ap'|'ack'`:
  - `'ap'` = ใบนำส่งบิลตั้งหนี้ (คลัง → บัญชี) — signature: กรรมการตรวจรับ + เจ้าหน้าที่จัดซื้อ
  - `'ack'` = ใบส่งจัดซื้อรับบิล (คลัง → จัดซื้อ) — signature: เจ้าหน้าที่คลัง + เจ้าหน้าที่จัดซื้อ
- **`resolveAuditUserName(auth)`** (db.js) — fallback chain: `auth.name || auth.username || '-'`
- **`fetchInventoryLocations()`** (db.js) — distinct ที่เก็บสำหรับ dropdown ตรวจนับ — **split ค่าที่คั่น comma** (1 ช่อง inventory อาจเก็บหลายที่เก็บ เช่น `"E-1-4 ,E-1-5"`) แล้ว dedupe + sort numeric — ไม่งั้นที่เก็บที่ปนช่องเดียวกันหายจาก dropdown
- **`billMatchesQuery(bill, q)`** (ReceiveLogApp.jsx) — match บิลกับคำค้น ค้นได้ทั้ง เลขบิล / บริษัท / ชื่อยา / รหัสยา / lot — ใช้ทุก tab ของ AP workflow เพื่อผลลัพธ์สอดคล้องกัน
- **`matchReceiveDetails(drugDetails, item)`** ([AppRoot.jsx](src/AppRoot.jsx)) — ประวัติรับยา (จาก `fetchDrugDetails`) ที่ match item — **scope แคบ→กว้าง**: `code_lot_exp` (แคบสุด) → `code_lot` → `code_only` (lot ไม่มีใน log). คืน `{ rows, scope }`; **`ReceiveHistoryDetail` = strict display**: การ์ดบิลเต็ม+note เขียว+Lot/EXP ตาม log เฉพาะ scope `code_lot_exp`; `code_lot` = ใบ้เลขที่บิลใกล้เคียงให้คน verify (cap 5); กว้างกว่านั้น = "ไม่พบบิล" (บิลเป็นหลักฐานแจ้งหัวหน้า — ดู CONTEXT.md §บิลอ้างอิงของ lot + docs/features/swap-return.md). **helper เองห้ามทำ strict** — `supplierForLot`/เติมบริษัท-นโยบาย ยังต้องพึ่ง fallback ระดับรหัส. helper อยู่ที่ **`src/lib/receiveMatch.js`** (pure — App.jsx import จาก AppRoot ไม่ได้เพราะ circular). ใช้ร่วม **ทั้งโมดอลใกล้หมดอายุ (ExpiryAlertSection) และ popup คืนบริษัท (SwapReturnPopup)**; โมดอลแผนผัง (App.jsx `renderItemCard`) strict ที่ชั้นแสดงผลด้วย `strictDetails` (เลขบิลตรง หรือไม่มีเลขบิล→รหัส+lot+EXP) โดย `allMatchedDetails` เดิมยังเลี้ยง `hasReceiveMatch`/waitTime. `normExpDate` normalize exp ข้าม format (`14/8/2026` vs `14/08/2026`) ก่อนเทียบ. **deadline คืนบริษัทต้องตรงกันทั้ง popup (fetchSwapReturnDue) และ banner (computeReturnStatus ฝั่ง client)** — `subMonths` ต้อง clamp วันสิ้นเดือน (31/7 − 3 ด. = 30/4 ไม่ spillover) + db.js format deadline ด้วย local date parts (ไม่ใช่ `toISOString` — เลื่อน 1 วันบน UTC+7)

### AP Workflow stages (`receive_logs.ap_stage`)

```
null + acknowledged_at=null  →  null + acknowledged_at!=null  →  'inspected'  →  'sent_batch'  →  'posted'
       รอจัดซื้อรับ                      จัดซื้อรับแล้ว                ตรวจรับแล้ว         ส่งบัญชี              ตั้งหนี้
```

11 AP actions logged: `ap_acknowledge, ap_unacknowledge, ap_mark_inspected, ap_uninspect, ap_send_batch, ap_unsend_batch, ap_mark_posted, ap_unpost, ap_reset_batch, print_ap_batch, print_ack_batch` — รายละเอียดใน [docs/features/ap-workflow.md](docs/features/ap-workflow.md)

### Picking workflow actions

`picking_requisition, verify_requisition, dispense_requisition, received_requisition` — ทั้ง 4 surface ใน notification bell แล้ว

## Critical Rules (ต้องอ่าน)

รายละเอียดทุก rule อยู่ใน [docs/patterns.md](docs/patterns.md) — สรุปเฉพาะหัวข้อที่ต้องระวัง:

1. **Audit Log Auth**: ทุก `exportToExcel`, `insertReceiveRows`, `insertAuditLog` ต้องส่ง `auth` ครบ — ไม่งั้น user_name = `-`. **ทุก mutation** (CRUD ใน DispenseLog/ReceiveLog/AP/Picking/Return) ต้องเรียก `insertAuditLog` — action ที่ unlogged จะหายไปจาก notification bell + audit history
2. **Supabase 1000-row limit**: dropdown ชื่อยา + aggregate stats ต้องใช้ `fetchAllRows` เสมอ
3. **Date Input**: ใช้ `ThaiDateInput` (เก็บ DD/MM/YYYY) หรือ `IsoDateInput` (เก็บ ISO) — `showPicker()` ใช้ได้เฉพาะแบบ **guarded** (`onClick` + `try { e.currentTarget.showPicker?.() } catch {}`) เสริม desktop click-to-open; **ห้าม bare `showPicker()` เป็นกลไกเดียว** (mobile block) ดู [docs/patterns.md](docs/patterns.md). ⚠️ `IsoDateInput`/`ThaiDateInput` **ไม่ใช่ component กลาง — ถูก copy-paste แยกในแต่ละ sub-app** (Requisition/Return/Dispense/Analytics/Receive/Reorder/AuditLog) และสำเนา**ดริฟต์ได้** เช่น AuditLog เคยขาด `onClick`+`showPicker` → คลิกแล้วปฏิทินไม่เปิดบน desktop (แก้ 2026-06-27). ถ้าแก้ pattern นี้ ต้อง grep `type="date"` ทุก sub-app เทียบ — **ปัจจุบันครบทุกไฟล์แล้ว** (ทั้ง 14 `type="date"` ใน 8 sub-app มี `onClick`+`showPicker` guard; audit + แก้ที่เหลือ Return/Analytics/Dispense/Requisition 2026-07-09) เพิ่ม date input ใหม่ต้องใส่ guard นี้ทุกครั้ง
4. **Print view**: ใช้ **Blob URL** เสมอ — `document.write()` พังบน iOS Safari. ⚠️ **In-app WebView (LINE/FB) บล็อก `window.open(url, '_blank')` → คืน `null` → จอว่าง** (ผู้ใช้ รพ. เปิดผ่านลิงก์ LINE เป็นหลัก). ต้องมี fallback: ถ้า `win === null` ให้นำทางผ่าน `<a>` click แทน (WebView ยอมให้คลิกลิงก์ แต่บล็อก popup) — ดู `printInspectWorksheet` ใน [inspectWorksheet.js](src/lib/inspectWorksheet.js), `printCountSheet` ใน [StockCountApp.jsx](src/StockCountApp.jsx) และ `openPrintUrl` ใน [RequisitionApp.jsx](src/RequisitionApp.jsx) (ครอบ printReq/printLotControl/printCoverForm แล้ว 2026-07-18). **ยังมีอีก 3 print sites ที่ใช้ bare `window.open('_blank')` ไม่มี fallback** (ReturnApp/ReorderApp/ReceiveLogApp) — จะเจอบั๊กเดียวกันเมื่อเปิดจาก LINE; แก้ทีละจุดหรือทำ helper กลาง
5. **Mobile layout**: ทุก sub-app ที่มีตาราง → card list + bottom sheet ที่ `width < 768px`
6. **Stat consistency**: ตัวเลข stat card + Excel export ต้องตรงกับตารางที่ user เห็น (filter+dedup เหมือนกัน) — ถ้า stat อ้างอิงสถานะจากตารางอื่น (เช่น Dashboard "รอตรวจรับ" ใช้ `inventory.receive_status`) ต้องใช้ filter/query ตัวเดียวกับหน้านั้น
7. **Department list 2 ระบบ**: hardcoded (form) vs dynamic (history filter) — อย่าสับสน
8. **ReceiveLog scan**: ใช้ `insertScannedBillRows` (APPEND) — **ห้ามใช้ `insertReceiveRows`** (DELETE ALL)
9. **Debugging data issues**: เช็ค SQL ใน DB ก่อนแก้ code — output ขาด ≠ bug เสมอไป (CSV ต้นทางอาจไม่ครบ) ดู [docs/patterns.md → Debugging Data Issues]
10. **Edge Function email UTF-8**: ใช้ `npm:nodemailer` (ไม่ใช่ `denomailer` — มี bug ภาษาไทย) ดู [docs/expiry-alert-edge-function.md]
11. **drug_swap_policy เป็น merged column**: build จาก CSV `swap_condition + swap_items` ตอน import — DB ไม่มี 2 col นั้นแยก ดู [docs/schema.md]. **นโยบายคืนยาเฟส 2 (ADR-0014):** อ่าน structured จากคอลัมน์ Auto-Match ของ Excel แม่ → `receive_logs.swap_tier_detail` (col 28 tier %), `swap_return_pct` (col 29), `swap_condition_am` (col 27 flag "แตกต่างกัน"). `parseReturnPolicyV2`/`computeReturnStatusV2` ([swapPolicy.js](src/lib/swapPolicy.js)) จัด 6 หมวดฐานเวลา (after_exp/before_exp/age_tier/receive_threshold/binary/ambiguous) ต่อ lot. lot ไม่มี tier → fallback V1. **`swap_condition_am` = flag ระดับบริษัท ไม่ใช่ราย lot** — ADR-0015: ถ้า lot มี tier ที่ parse ได้ชัด (shape ≠ ambiguous) **ให้ใช้ tier ไม่ต้องสน cond_am** (specific overrides general); override เป็น review เฉพาะเมื่อไม่มี tier/tier กำกวม. **แก้ V2 ต้อง sync 4 ที่:** swapPolicy.js + fetchSwapReturnDue/fetchDrugDetails (db.js) + App.jsx buildReturnInfo + expiry-alert/index.ts (copy เป็น TS — ต้อง redeploy ด้วย). migration: `swap_tier_migration.sql`
12. **Notification & AuditLog sync**: ถ้าเพิ่ม action ใหม่ใน `insertAuditLog` ต้องเพิ่ม label ใน **3 ที่พร้อมกัน**: `NOTIF_LABELS` ([NotificationBell.jsx](src/NotificationBell.jsx) — ย้ายมาจาก AppRoot แล้ว), `NOTIFY_ACTIONS` ใน `fetchNotifications` ([db.js](src/lib/db.js)), `ACTION_LABELS` ([AuditLogApp.jsx](src/AuditLogApp.jsx)) — ไม่งั้นปุ่ม bell ไม่ขึ้น หรือ UI แสดง raw key. **กระดิ่ง = `NotificationBell.jsx` วางบน top bar (แถบสีฟ้า) ของ [AppShell.jsx](src/AppShell.jsx) คู่ user chip → แสดงทุกหน้า ทุก role** (top bar ไม่ sticky โดยเจตนา — กันชน sticky header ของ sub-app). **scope**: staff/admin = global feed; requester = เฉพาะแผนกตัวเอง (match `department` OR `details.req_department` — lifecycle ฝั่ง staff ต้อง stamp `req_department` ตอน log ไม่งั้น requester ไม่เห็นใบเบิกตัวเอง ดู ADR-0010 + CONTEXT.md §"การแจ้งเตือนในแอป")
13. **Reorder single source of truth**: ทุกหน้าที่นับ "ต่ำกว่า Safety Stock" / "ต้องสั่ง" ต้องอ้างอิง logic เดียวกับ [ReorderApp](src/ReorderApp.jsx) — รวม qty **per drug code** (ไม่ใช่ per-lot) + filter `drug_reorder_config.exclude_status` (`ตัดออก`/`สั่งเมื่อขอ`) ออก — `fetchDashboardAlerts.lowStock` ใน [db.js](src/lib/db.js) ใช้ pattern นี้แล้ว ห้ามนับ per-row ของ inventory ตรงๆ. **หมายเหตุค่า SS**: SS มี**นิยามเดียวทั้งระบบ** = `MAX(1, ROUND(Avg/วัน × 30 × ตัวคูณ VEN))` (Excel ต้นทาง: sheet วิเคราะห์สั่งซื้อ คือแหล่งกำเนิด, Master col X XLOOKUP มา — ดู context §58 ใน `csvfile/ยอดคลังยา_context_69.csv`) — ไม่ใช่ "คนละค่าโดยตั้งใจ" (ความเชื่อเดิมผิด แก้ 2026-07-04). ต่างกันแค่**ความสด**: ReorderApp คำนวณสดด้วย `computeSafetyStock` (window/pack factor ที่ user เลือก) ส่วน Dashboard อ่าน `inventory.safety_stock` = **snapshot** ของค่าเดียวกันจาก CSV import. **ห้ามให้ Dashboard เรียก `computeSafetyStock` ตรงๆ** (ต้องพึ่ง user-state ที่ Dashboard ไม่มี — ทางถาวรคือให้ ReorderApp persist SS แล้ว Dashboard อ่าน, ยังไม่ทำ). ⚠️ snapshot เพี้ยนได้จาก import ไฟล์ผิด (เหตุการณ์ 2026-07-01: SS เพี้ยนทั้งระบบ เช่น 1332/180740 — แก้ 2026-07-04 ด้วย SQL จากไฟล์วิเคราะห์สั่งซื้อ, backup เดิมใน `_bak_inventory_ss_20260704`) — ถ้าเลข SS บน Dashboard ดูผิดธรรมชาติ (หลักหมื่น/แสน) ให้สงสัยข้อมูล import ก่อนสงสัยโค้ด. **VEN ว่าง/ไม่จัดกลุ่ม → default Essential (×1.5)** ไม่ใช่ Normal (×1.0): `RISK_MULTIPLIER[risk] ?? 1.5` + `analyzeDrug` destructuring default `riskGroup = null` + `ReorderApp` map `cfg.risk_group || null` + **import: `ImportMasterModal` map VEN ว่าง→`null` และ `bulkUpsertDrugReorderConfig` ต้อง `risk_group ?? null` (ห้าม `?? 'Normal'`)** — ทั้ง 4 จุดต้องปล่อยให้ค่าว่างเป็น `null` ไม่งั้น fallback 1.5 เป็น dead code; badge แสดง "E?" (ดู [docs/adr/0002](docs/adr/0002-blank-ven-defaults-essential.md))
22. **Import master CSV "วิเคราะห์สั่งซื้อ" = header detect + strip emoji**: ไฟล์ export มีแถว title/คำเตือนนำหน้า header จริง → `ImportMasterModal.handleFile` ([ReorderApp.jsx](src/ReorderApp.jsx)) ต้องหาแถวที่ cell = "รหัส"/"code" แล้วส่งเป็น `range` ของ `sheet_to_json` (ห้ามใช้ default range 0 — key เพี้ยนทั้งไฟล์ → import 0 แถว). คอลัมน์ exclude (`ตัดออกจากบัญชี ,สั่งเมื่อขอ`) มี emoji นำหน้า (`✂️ ตัดออก`/`📋 สั่งเมื่อขอ`) → ต้อง strip non-ตัวอักษร แล้วเทียบด้วย `.includes('ตัดออก')`/`.includes('สั่งเมื่อขอ')` (ห้าม `=== 'ตัดออก'` — match ไม่ติด). header alias: ชื่อยา=`รายการยา`, VEN=`กลุ่ม VEN`, บริษัท=`บริษัทล่าสุด`. **Excel เป็น reference reconcile เท่านั้น (ADR-0001)** — import แค่ VEN + exclude_status; ราคา/บริษัท/LT แอป derive จาก `receive_logs` สด (ห้าม override เพราะ stale)
14. **Date input อ่าน [docs/patterns.md](docs/patterns.md) ก่อนเสมอ**: ใช้ `ThaiDateInput` / `IsoDateInput` ที่ overlay `<span>` แสดง `DD/MM/YYYY` (พ.ศ.) ทับ hidden `<input type="date">` — ห้ามใช้ plain `<input type="date">` เพราะ browser US locale แสดง `MM/DD/YYYY`
15. **Summary chart lookup ต้องใช้ map เต็ม ไม่ใช่ sliced top-N**: กราฟที่ union 2 ranking (เช่น ความถี่ + มูลค่า) แล้ว lookup ค่าจาก sliced array จะได้ 0 สำหรับรายการที่ติดอันดับจากด้านหนึ่งแต่ไม่ติดอีกด้าน — ต้องสร้าง `fullMap` ก่อน slice แล้วใช้ map เต็มสำหรับ lookup ดู `drugFreqMap`/`drugValueMap` ใน [ReceiveLogApp.jsx](src/ReceiveLogApp.jsx)
16. **NON_DEPARTMENTS ใน DispenseLogApp**: ค่า department ที่ไม่ใช่หน่วยงานจริง (`เบิกเพิ่มจากความผิดพลาด`, `คืนยา`) ถูกตัดออกจาก dropdown + กราฟระดับหน่วยงาน แต่ยังแสดงในตารางและยอดรวม — ถ้าพบค่าใหม่ที่ไม่ใช่หน่วยงานจริง เพิ่มเข้า `NON_DEPARTMENTS` (Set) บรรทัดต้นไฟล์ [DispenseLogApp.jsx](src/DispenseLogApp.jsx) — **ต้อง query DB จริงก่อนเสมอ** เพื่อยืนยันชื่อเป๊ะๆ
17. **AP Workflow search ค้นชื่อยาได้**: helper `billMatchesQuery(bill, q)` ใน [ReceiveLogApp.jsx](src/ReceiveLogApp.jsx) ค้นได้ทั้ง เลขบิล / บริษัท / ชื่อยา / รหัสยา / lot โดย iterate `bill.items` — ใช้ร่วมกันทุก tab (รอตรวจรับ / ส่งบัญชี / ประวัติ batch) เพื่อผลลัพธ์สอดคล้องกัน
18. **dataRange state ใน summary modal**: ทั้ง [ReceiveLogApp.jsx](src/ReceiveLogApp.jsx) และ [DispenseLogApp.jsx](src/DispenseLogApp.jsx) เก็บ `{ from, to }` (วันแรก–วันล่าสุดในระบบ) แยกต่างหากจาก date filter input — ใช้แสดง caption ช่วงข้อมูลจริงและ `periodLabel` ใน insight banner แทนคำว่า "ทุกช่วงเวลา"
19. **AP bill identity = composite key ไม่ใช่ bill_number**: `receive_logs.bill_number` **ไม่ unique** (เลขซ้ำได้ทั้งคนละบริษัทและบริษัทเดียวคนละวันรับ). `groupRowsByBill` key ด้วย `billGroupKey(r)` = `bill_number\|supplier_current\|receive_date` ([db.js](src/lib/db.js)); group object มี `_key` (React key + selection Set) + `item_ids` (row id). ทุก AP action (8 ตัว: mark/unmark Acknowledged/Inspected/SentBatch/Posted) ระบุบิลด้วย **`.in('id', rowIds)`** ไม่ใช่ `bill_number` — ส่ง `(rowIds, billNumbers, …)` โดย `billNumbers` ใช้แค่ audit log. `printApBatch` group ด้วย `billGroupKey` เดียวกัน. **ห้าม match `bill_number` ตรงๆ** เพราะจะ update บิลที่เลขชนกันพร้อมกัน ดู [docs/features/ap-workflow.md](docs/features/ap-workflow.md)
20. **ยืนยันตรวจรับ = บังคับ checklist + รูป**: ปุ่ม "ยืนยันตรวจรับ" เปิด `InspectChecklistModal` ([ReceiveLogApp.jsx](src/ReceiveLogApp.jsx)) — ต้องติ๊ก `INSPECT_CHECKLIST` ครบทุกข้อ + แนบรูป ≥1 ถึงบันทึกได้ (กัน "เซ็นโดยไม่ตรวจจริง"). รูปต้องผ่าน `compressImageFile` ก่อน upload (อย่าส่งดิบ). เก็บใน `receive_logs.inspect_meta` (jsonb: `{images,checklist,inspector,at}`) ส่งผ่าน param ตัวที่ 6 ของ `markBillsInspected`. Badge "ไม่มีรูปตรวจรับ" flag เฉพาะบิล `inspected_at >= INSPECT_PHOTO_SINCE` (กัน noise บิลเก่า). หลักฐานแสดงย้อนหลังใน `InspectEvidence` ใต้ `BillItemsDetail`. migration: `inspect_meta_migration.sql`. ดู [docs/features/ap-workflow.md](docs/features/ap-workflow.md)
21. **บิลสแกน AI ต้อง map drug_code ผ่าน `drug_name_alias`**: ชื่อยาบนบิล (ชื่อการค้า) ไม่ match ชื่อในระบบ (generic) — exact 0%, fuzzy ~35%. ห้ามพึ่ง `lookupDrugCodes`. ลำดับใน `handleScan`: (1) `lookupDrugAliases` (ตาราง `drug_name_alias`, key=ชื่อบิล normalize) auto-fill code + dot เขียว; (2) ไม่เจอ `fuzzyInventoryMatch` (เจอ 1 ตัวเท่านั้น) pre-fill ใน dropdown "จับคู่ยาในระบบ" (`SearchableSelect` จาก `fetchInventoryNameCodeMap`) + dot ส้ม ยังไม่เติม code จนคนเลือก. คนเลือก `handleSave` เรียก `upsertDrugAliases` (audit `map_drug_alias`) จดจำ ครั้งหน้า auto. migration: `drug_name_alias_migration.sql`
22. **Stock Ledger identity = cost-layer key, ปิดงวด freeze**: `stock_ledger` 1 แถว = `period + drug_code + lot + item_type + price_per_unit` (unique). **ราคาอยู่ใน key เสมอ** — lot='-' เดียวกันมีหลายราคา = หลาย cost layer **ห้ามรวม qty/มูลค่าข้ามราคา** (รวมแล้วบัญชีผิดทั้งงวด). งวด `closed` = **freeze static value ห้ามแก้** (แก้ข้อมูลดิบย้อนหลังต้องไม่กระทบงวดที่ปิด — หลักบัญชี). ปิดงวด = `closeLedgerPeriod` (atomic: freeze + rollover U→S/AB→AC + แปลงชนิดรายการ + ลบแถว `แก้ไขระบบ`). **Seed ใช้ค่าตรงจาก Excel ไม่ recompute** (มี manual override เช่น AC ติดลบ). pure logic: `ledgerRollover.js`/`ledgerSeed.js`. ดู [ADR-0007](docs/adr/0007-monthly-stock-ledger.md) + CONTEXT.md §"Monthly Stock Ledger"
23. **Permission = role baseline + per-user grant (key ต้องตรง 3 ที่)**: การเข้าถึง sub-app = `roles.includes(role)` **OR** `auth.permissions.includes(item.page)` — `permissions` (jsonb ใน `app_users`, โหลดตอน `loginUser`) ให้ admin grant สิทธิ์เหนือ role รายคนผ่านโมดอล "สิทธิ์ระบบ". **เพิ่ม sub-app ใหม่ที่อยาก grant รายคนได้ ต้องตรงกัน 3 ที่**: (1) `item.page` ใน `NAV_GROUPS` ([navConfig.js](src/navConfig.js)), (2) `GRANTABLE_SYSTEMS[].key` ใน [UserManagementApp.jsx](src/UserManagementApp.jsx) **ต้อง = `item.page`** (AppShell `canSee()` match ด้วย `item.page`), (3) `defaultRoles` ใน `GRANTABLE_SYSTEMS` ต้องตรงกับ `roles` ใน navConfig (ไม่งั้น badge "จาก role" เพี้ยน). `AppShell` รับ prop `permissions` จาก `AppRoot` (`permissions={auth.permissions}`) — sub-app เองไม่ควรมี hard role-guard ที่เด้งผู้ใช้ออก (จะทำให้ grant ไร้ผล); จำกัด action สำคัญด้วย `isAdmin` ภายในแทน (เช่น ปิดงวดใน `StockLedgerApp`)

## Do Not (Hard Rules)

- **🛑 อย่าพิมพ์ tool call เป็นข้อความ (กันหยุดกลางคัน)** — ทุกครั้งที่จะเรียก tool **ต้องเป็น proper tool invocation ผ่านระบบจริง** ห้าม emit `<invoke …>` / `<parameter …>` เป็น text ใน response เด็ดขาด เพราะมันจะกลายเป็นข้อความธรรมดา → turn จบโดย tool ไม่ทำงาน → "หยุดเอง". **เตือนตัวเองทุก turn:** (1) ก่อนปิด turn ถ้ายังมีงานค้าง ต้องมี tool call จริง ไม่ใช่ text ที่หน้าตาเหมือน tool call; (2) หลังเรียก tool ต้อง **เห็น tool result กลับมาก่อน** จึงเขียนข้อความสรุป — ถ้าไม่เห็น result แปลว่า call ไม่ได้ส่ง ให้เรียกใหม่ทันที **ห้ามจบ turn**. กับดักนี้มักเกิดหลัง `ToolSearch` โหลด schema ใหม่ (เช่น MCP) — ระวังเป็นพิเศษ
- **อย่าเรียก `supabase` โดยตรงในไฟล์ component** — ต้องผ่าน `src/lib/db.js` เสมอ
- **อย่าลืมเปิด realtime replication เมื่อ subscribe ตารางใหม่** — `supabase.channel().on('postgres_changes', {table})` จะได้ event **ก็ต่อเมื่อ**ตารางนั้นอยู่ใน publication `supabase_realtime`. ถ้าลืม → subscription เงียบ ไม่ error, count/badge/กระดิ่งค้าง (เหตุการณ์ 2026-07-11: publication ว่างเปล่า → badge ค้าง). เปิดด้วย `ALTER PUBLICATION supabase_realtime ADD TABLE public.<t>` (ดู `enable_realtime_migration.sql`). ปัจจุบันเปิดแล้ว: requisitions/requisition_items/return_logs/audit_logs/inventory. **ปุ่ม "โหลดหน้านี้ใหม่" (refreshPage) bump ทั้ง subKey + badgeTick** — badge จึง refetch แม้ realtime พลาด
- **อย่าสร้างไฟล์ `.css` แยก** — Tailwind utility เท่านั้น
- **อย่า hardcode ค่าใดๆ ที่ควรมาจาก `.env`** — โดยเฉพาะ API key และ URL
- **อย่าเพิ่มฟีเจอร์ที่ไม่ได้ถูกขอ** — แก้เฉพาะที่ถาม ไม่ refactor รอบข้าง
- **อย่าใช้ mock/hardcode data ใน component** — ถ้าไม่มี supabase ให้ return null หรือ empty state
- **อย่าใช้ emoji ใน UI** — ใช้ `lucide-react` เท่านั้น
- **อย่าเปลี่ยน UI text เป็นภาษาอังกฤษ** — ทุก label, placeholder, alert ต้องเป็นภาษาไทย
- **อย่าเพิ่ม comment อธิบายโค้ดที่ self-evident** — เพิ่ม comment เฉพาะ logic ซับซ้อน
- **อย่า push หรือ commit โดยไม่ได้รับคำสั่ง** — ถามก่อนเสมอ
- **อย่าให้โมดอลส้ม (ใกล้หมดอายุ) ใช้แค่ `nearExpiryItems`** — ต้องใช้ `[...expiredItems, ...nearExpiryItems]` เสมอ เพราะ `expiredItems` และ `nearExpiryItems` เป็น mutually exclusive set (item ที่หมดอายุแล้วถูก filter ออกไปก่อนถึง near-expiry bucket) ถ้าใช้แค่ `nearExpiryItems` tab "หมดอายุแล้ว" ในโมดอลจะแสดง 0 เสมอ ทั้งที่ระบบมียาหมดอายุอยู่ ดู `getModalConfig()` ใน [App.jsx](src/App.jsx)
- **อย่า slice top-N ก่อน lookup ค่าในกราฟ**: ถ้ากราฟแสดงรายการจาก union ของ 2 ranking ให้ใช้ full map (ทุก key) สำหรับ lookup — sliced top-N จะ return `undefined` สำหรับรายการที่ไม่ติดอันดับ → chart แสดง 0 ผิด
- **อย่าตัด "เบิกเพิ่มจากความผิดพลาด" / "คืนยา" ออกจากตารางเบิก** — ค่าเหล่านี้ยังต้องแสดงในตาราง เพราะเป็น record จริงที่ต้องตรวจสอบได้ ตัดออกเฉพาะจาก dropdown หน่วยงาน + กราฟ aggregate เท่านั้น
- **อย่าลบ returnDate state ทิ้งทั้งหมด**: `returnDate` ใน [ReceiveLogApp.jsx](src/ReceiveLogApp.jsx) ยังใช้ใน `markBillsInspected()` (เป็น `inspected_at` timestamp) — ลบได้เฉพาะ setter/prop ที่ไม่มี consumer แต่ state ต้องคงไว้
- **อย่า match header CSV ด้วย `includes()` คำสั้นๆ เมื่อไฟล์มีหลายคอลัมน์ชื่อคล้ายกัน**: ไฟล์ master (45 คอล) มี "คงเหลือ" หลายคอลัมน์ (`คงเหลือ พ.ค.`, `คงเหลือหลังจ่าย`, `มูลค่าคงเหลือ`) — `findIndex(h => h.includes('คงเหลือ'))` จับคอลัมน์แรกซึ่งผิด. ต้อง match ชื่อเจาะจงก่อนแล้วค่อย fallback + exclude คำที่รู้ว่าคนละความหมาย (เช่น `มูลค่า`) — ดู `qtyIdx` ใน [App.jsx](src/App.jsx) (แก้ 2026-07-04)
- **อย่าใช้ `text-white` / `bg-white/xx` กับ children ของ `PageHeader` ใน [RequisitionApp.jsx](src/RequisitionApp.jsx)**: `PageHeader` ([L280](src/RequisitionApp.jsx)) เป็น **`bg-white`** (title bar ขาว) — ปุ่ม/ไอคอน `text-white` จะ **ล่องหน (ขาวบนขาว)**. ใช้ `bg-[#1E90FF] text-white` (ปุ่มฟ้า) หรือ `text-slate-*` แทน. **สับสนกับ top bar สีฟ้าของ [AppShell.jsx](src/AppShell.jsx)** ที่ `text-white` เหมาะ — copy สไตล์ข้ามกันไม่ได้ (เหตุการณ์ 2026-07-14: ปุ่ม "สร้างใบเบิกแทนหน่วยงาน" มองไม่เห็นเพราะ copy สไตล์จาก blue top-bar มาใส่ header ขาว)
- **UI "แก้แล้วไม่เห็นผล" → สงสัย stale dev server ก่อนสงสัยโค้ด**: background dev server ตายข้าม session หรือมีหลาย Vite ต่างพอร์ต (5173/5174) → browser เสิร์ฟ bundle เก่า. **verify ที่ server จริงก่อนแก้โค้ด**: `Invoke-WebRequest http://localhost:5173/src/<file>.jsx` แล้ว grep **ASCII marker** (ชื่อ class/prop ไม่ใช่ข้อความไทย — `Invoke-WebRequest` mangle UTF-8 → false negative). ถ้า server มี code ใหม่แต่ browser ไม่เห็น = cache: kill process ตามพอร์ต (`Get-NetTCPConnection -LocalPort 5173`) + restart + DevTools "Empty Cache and Hard Reload" (เหตุการณ์ 2026-07-14)
- **อย่า dedupe/ทับแถว `inventory` ด้วย business key — ตารางมีแถวซ้ำ `code+lot` เดียวกันหลายแถวจริง** (CSV import แยกแถว เช่น Baclofen lot 260301 = 2 แถว 3+30 กล่อง): จุดอ่านคงเหลือทุกจุดต้อง**บวกรวม** (ดู `mergeSameLotEntries` ใน [RequisitionApp.jsx](src/RequisitionApp.jsx)) — dedupe ด้วย `code|name|lot` หรือ assign map ทับ (`lotOnHand[lot] = ...`) จะกลืนของจริงหาย (เหตุการณ์ 2026-07-18: คงเหลือโชว์ 600 จากจริง 6,600 + snapshot `onhand` ใน picked_allocation ผิดถาวร → ใบ lot คุม/Excel เพี้ยน). dedupe ผลจาก 2 query ให้ key ด้วย **row id** เท่านั้น
- **อย่าเช็คสถานะ "รอตรวจรับ" ด้วย lot เดี่ยว — ต้อง key `code|lot`**: lot ซ้ำข้ามตัวยาได้ โดยเฉพาะ lot `-` ของเวชภัณฑ์ — บิลรอตรวจรับ lot `-` ใบเดียวเคยเหมา 26 รหัสเป็น "หมดสต็อก" ปลอม (เหตุการณ์ 2026-07-18, ดู `pendingLotSet` ใน [RequisitionApp.jsx](src/RequisitionApp.jsx))
