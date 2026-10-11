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
