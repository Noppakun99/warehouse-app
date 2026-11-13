# Playwright E2E Tests

## Test Accounts (DB จริง)

| username | password | role | ใช้ใน |
|----------|----------|------|-------|
| `test`   | `444444` | requester | `authenticatedPage` fixture (default) |
| `test2`  | `555555` | staff     | `staffPage` fixture (default) |

## รัน tests

```bash
npx playwright test                          # all tests
npx playwright test tests/05-staff-flow.spec.js  # staff flow เฉพาะ
npx playwright test --reporter=list          # verbose output
```

## Override credentials ผ่าน env

```bash
TEST_STAFF_USER=test2 TEST_STAFF_PASS=555555 npx playwright test
```

## Test files

| file | ครอบคลุม |
|------|---------|
| `01-login.spec.js` | login/logout flow |
| `02-dashboard.spec.js` | Dashboard cards, navigation |
| `03-requisition.spec.js` | Drug search, cart, submit |
| `04-return.spec.js` | Return record, history, print |
| `05-staff-flow.spec.js` | Staff approve/reject (ต้องมี staff account) |
| `06-validation.spec.js` | Form validation, HTML5 + JS |
| `07-permissions.spec.js` | Role-based visibility (requester vs staff) |
| `08-ap-workflow.spec.js` | AP Workflow UX — flow disabled state, tooltip, badge, sub-tab nav (staff only) |
| `09-ux-smoke.spec.js` | UX Smoke — ทุก sub-app เปิดได้ไม่ crash + no JS error + mobile 375px + consistency (no emoji, Thai text, no ISO date visible) |
| `10-a11y-quality.spec.js` | A11y/quality — login form autoComplete, keyboard nav, icon button aria-label |
| `15-mobile-bottom-nav.spec.js` | ผู้เบิก 375px (อ่านอย่างเดียว): แถบปุ่มล่างจอ 4 ปุ่ม/ซ่อนบนคอม · "ประวัติเบิก" ตั้งตัวกรองหน่วยงานตัวเอง + ไม่มีโหลดแบบไม่กรองแข่ง (ดักทุก request) · หน่วยงานไม่มีประวัติ = ไม่กรอง · หน้าเบิกยาไม่มีแถบ · ปุ่มบันทึกคืนยาไม่จม (จอเตี้ย 560) · การ์ดแนะนำปิดแล้วจำ · ปุ่มย้อนของเบราว์เซอร์ = กลับหน้าก่อน / ปิดบัตรยา / ย้อนจากการ์ดคลัง lot (staff) · PWA ติดตั้งได้ (CDP `Page.getInstallabilityErrors` ว่าง) · ตัวกรองมือถือ (FilterSheet) ประวัติเบิก/รับยา: เลือกหน่วยงานใน sheet → request กรองจริง · จอคอมยังเป็นแถวเดิม. staff popup คืนบริษัทโผล่ช้ากว่าที่ `login()` รอ → `dismissStartupPopup(page, 15_000)`. เคสหน่วยงานอื่นแก้ `department` ใน sessionStorage `wh_auth` แล้ว reload (บัญชี `test` = **ห้องยา G**) — ไม่แตะ DB. ⚠️ ช่องกรองหน่วยงานโชว์ "ทุกหน่วยงาน" ชั่วครู่ก่อนตั้งค่า → ตรวจหลังตารางโหลด (`openDispense`) ไม่งั้นผ่านหลอก |

## Notes

- `authenticatedPage` และ `staffPage` ใช้ `scope: 'worker'` — login ครั้งเดียวต่อ worker
- Auth persist ผ่าน `sessionStorage` — `page.goto('/')` ไม่ทำให้ session หาย
- `staffPage` คืน `null` ถ้า login ล้มเหลว — tests ที่ใช้ `staffPage` ต้อง `if (!page) test.skip()`

## Golden tests (node ไม่ใช้ Playwright)

```bash
npm run test:reorder   # Golden tests สำหรับ src/lib/reorder.js (35 assertions)
npm run test:billgroup # Golden tests สำหรับ src/lib/billGroup.js — AP bill grouping (24 assertions)
npm run test:unit      # Golden tests สำหรับ src/lib/unitParser.js — แปลงหน่วยซื้อ/เบิก (test อยู่ที่ src/unitParser.test.js)
npm run test:alloc     # Golden tests สำหรับ src/lib/lotAllocation.js — FEFO auto-split (เบิกระดับยา B-base)
npm run test:ledger     # Golden tests สำหรับ src/lib/ledgerRollover.js — สมการคงคลัง + ขึ้นเดือนใหม่ (ADR-0007)
npm run test:ledgerseed # Golden tests สำหรับ src/lib/ledgerSeed.js — seed master CSV → ledger row (ADR-0007)
npm run test:swappolicy # Golden tests สำหรับ src/lib/swapPolicy.js — parse นโยบายคืนยา + deadline (88 assertions — V1 free-text + V2 structured tier % 6 หมวดฐานเวลา, ADR-0014)
npm run test:consistency # Golden tests สำหรับ src/lib/consistencyCheck.js — ตรวจความสอดคล้อง CSV→DB (40 assertions)
npm run test:countmatch  # Golden tests สำหรับ src/lib/countMatch.js — ตรวจนับ: 3 สถานะต่อมิติ ครบ 4 มิติ (จำนวน/ที่เก็บ/exp/lot) + set equality ที่เก็บ/exp (49 assertions)
npm run test:countpriority # Golden tests สำหรับ src/lib/countPriority.js — จัดอันดับ "ควรตรวจนับตัวไหนก่อน" 4 สัญญาณถ่วงน้ำหนัก (29 assertions)
npm run test:stockcard   # Golden tests สำหรับ src/lib/stockCard.js — การ์ดคลัง lot: running balance ต่อ lot + drift detection (105 assertions)
npm run test:vendorexchange # Golden tests สำหรับ src/lib/vendorExchange.js — รอบเปลี่ยน/คืนบริษัท: จับคู่ขาส่ง↔ขารับ หา "ของลอย" — จับคู่ 2 ชั้น: เลขที่รอบ VX ก่อน แล้ว fallback ไปเดา (50 assertions, ADR-0024)
npm run test:announce # Golden tests สำหรับ supabase/functions/_shared/announceSchedule.js — ปฏิทินรอบเบิก-รับ + วันหยุด (116 assertions) ⚠️ test อยู่ที่ src/lib/announceSchedule.test.js แต่ source อยู่ใน supabase/functions/_shared/ (import ข้ามโฟลเดอร์)
npm run test:loanimport # Golden tests สำหรับ src/lib/loanImport.js — นำเข้า CSV ยืม-คืนยา: derive ทิศทาง + diff กับของในระบบ (47 assertions)
npm run test:receivesheet  # Golden tests สำหรับ src/lib/receiveSheet.js — อ่านชีท 'รับยา' จาก .xlsm (102 assertions)
npm run test:mastersheet   # Golden tests สำหรับ src/lib/masterSheet.js — อ่านชีท Master + ชีทขนาดลัง (53 assertions)
npm run test:dispensesheet # Golden tests สำหรับ src/lib/dispenseSheet.js — อ่านชีท 'เบิก ' (63 assertions)
npm run test:reordersheet  # Golden tests สำหรับ src/lib/reorderSheet.js — อ่านชีทวิเคราะห์สั่งซื้อ (37 assertions)
npm run test:importguard   # Golden tests สำหรับ src/lib/importGuard.js — ด่านตรวจก่อนเขียน DB (66 assertions)
npm run test:excelsync     # Golden tests สำหรับ src/lib/excelSync.js — ปุ่ม "นำเข้าจาก Excel": ส่วนต่างรายช่อง + ด่านไฟล์เก่า/สถานะตรวจรับขัด + ไฟล์รับยา/ยืมยา + ขนาดลัง (81 assertions)
npm run test:usagerow      # Golden tests สำหรับ supabase/functions/_shared/usageRow.js — กฎแถวเบิกที่นับเป็นการใช้ (4 แบบตามสูตรชีทวิเคราะห์สั่งซื้อ) + localYmd (21 assertions) ⚠️ test อยู่ src/lib/ แต่ source อยู่ _shared (แอป + edge function expiry-alert ใช้ไฟล์เดียวกัน)
npm run test:workqueue     # Golden tests สำหรับ src/lib/workQueue.js — คิวงานวันนี้บนหน้าหลัก (เกณฑ์/สี/ลำดับความเร่ง/คืนบริษัทแยกเลยเส้นตาย) + แถว "ยาเข้าใหม่ / ตัดออก" ท้ายคิว (ไม่หายเมื่อ 0) + บรรทัดรอบเบิก-รับถัดไป (39 assertions)
npm run test:formulary     # Golden tests สำหรับ src/lib/formularyChange.js — ยาเข้าใหม่ (รหัสใหม่ · ตัดของยกยอดที่เบิกก่อนรับ · มติรอของ) · ยาตัดออก (มติที่ Master ยังไม่ตั้งธง) · ทะเบียนมติ PTC + ข้อความไลน์ (34 assertions)
npm run test:popupseen     # Golden tests สำหรับ src/lib/popupSeen.js — popup เฉพาะ lot ที่คนนั้นยังไม่เคยเห็น วันละครั้ง (16 assertions)
npm run test:reservecheck  # Golden tests สำหรับ src/lib/reservationCheck.js — ตรวจยอดจองซ้ำหลังส่งใบเบิก + จำลองทุกลำดับ 2 ใบพร้อมกันต้องไม่จองเกิน (17 assertions, ADR-0028)
npm run test:reqtype      # Golden tests สำหรับ src/lib/reqType.js — ประเภทใบจาก MainLog + หน่วยคีย์ (13 assertions)
npm run test:onlinereq     # Golden tests สำหรับ src/lib/onlineReqPlan.js — ใบเบิกออนไลน์ → แผนแถวชีทเบิก: เลือก lot · ของไม่พอ/รอตรวจรับ · แถว Master ไม่ใช้ซ้ำ (20 assertions) · ทดลองครบวงจรบนสำเนา ดู docs/features/online-requisition.md §ทดสอบ
npm run test:reservation   # Golden tests สำหรับ src/lib/reservation.js — กฎเลิกหักยอดจอง (ลงชีท + นำเข้าหลังลงชีท) + หักราย lot หน้าค้นหา/หน้าจัดยา (28 assertions, CONTEXT §ตัดยอดชั่วคราว)
npm run test:installenv    # Golden tests สำหรับ src/lib/installEnv.js — ปุ่มติดตั้งแอป (PWA) แสดงแบบไหนต่อเครื่อง: Android prompt / iPhone / LINE in-app / ติดตั้งแล้ว-คอม = ไม่แสดง (14 assertions)
npm run test:reqsheet      # Golden tests สำหรับ src/lib/reqSheetFormat.js — ใบเบิกรูปแบบชีทเบิก (พิมพ์/PDF/Excel): 16 คอลัมน์ = ชีทเบิก B–Q · ความกว้าง = dispense-pdf.ps1 · เรียงตามที่เก็บแบบ Excel (E-10 < E-11 < E-1-3, ภาษาไทยท้าย) · หัวกระดาษ (15 assertions)
npm run test:drugsearch    # Golden tests สำหรับ src/lib/drugSearchText.js — ค้นยาหน้าเบิก (ผู้เบิก): ไม่สนช่องว่าง/จุด/ขีด + แยกคำไม่เรียง + คำเรียกอื่น (พารา/ORS/SK/ครีมไพล/N.S.S) · คำค้น = คำจากรูปใบเบิกจริง 13/11/2569 (40 assertions)
npm run test:drugprofile   # Golden tests สำหรับ src/lib/drugProfile.js — บัตรยา + ค้นหายา: ยอดรวม = โมดอลรายการยาในคลัง, ต่ำกว่า SS = Dashboard, บรรทัด lot+exp, บิลของ lot, เรท/คงอยู่ได้อีก = สูตรหน้าวิเคราะห์สั่งซื้อ, ประวัติเบิกหน่วยงานตัวเอง, โน้ตอธิบายหน่วย, นโยบายคืนราย lot + ค้นหา/จัดกลุ่มตามบริษัท (149 assertions)
npm run test:locationmove  # Golden tests สำหรับ src/lib/locationMove.js — ใบแจ้งย้ายที่เก็บ: กอง code+lot+ที่เก็บ · MainLog · overlay · ย้ายต่อ/ย้ายกลับ · reconcile (30 assertions)
npm run test:linechat      # Golden tests สำหรับ src/lib/lineChatImport.js — ⚠️ ยังไม่มี consumer ในแอป (ดู Dead code ด้านล่าง)
```
