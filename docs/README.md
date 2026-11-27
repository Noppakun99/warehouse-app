# Documentation Index

CLAUDE.md เป็นเอกสารหลัก — ดูภาพรวม convention และ workflow ที่นั่นก่อน

ไฟล์ในนี้คือรายละเอียดเฉพาะ feature/topic — อ่านเมื่อแก้ส่วนที่เกี่ยวข้องเท่านั้น

## โครงสร้าง

| ไฟล์ | เนื้อหา | อ่านเมื่อ |
|------|--------|----------|
| [auth.md](./auth.md) | Auth & Roles, permissions, displayName, UserManagement | แก้ login / role / permission |
| [patterns.md](./patterns.md) | Date input, Mobile layout, Print, Department list, Audit log auth, Stat consistency, Supabase 1000-row | ก่อนแก้ component ใดๆ ที่ใช้ pattern เหล่านี้ |
| [schema.md](./schema.md) | SQL migrations, retention policy, Excel column order | เพิ่ม/แก้ DB schema หรือ Excel export |
| [testing.md](./testing.md) | Playwright tests, test accounts | รัน/แก้ test |
| [roadmap.md](./roadmap.md) | แผนพัฒนาที่ยังไม่ได้ทำ | วางแผน feature ใหม่ |
| [features/inventory-map.md](./features/inventory-map.md) | App.jsx — แผนผังคลังยา, summary modal, alert | แก้ App.jsx |
| [features/picking-workflow.md](./features/picking-workflow.md) | RequisitionApp — picking → verify → dispense → received | แก้ Requisition workflow |
| [features/return.md](./features/return.md) | ReturnApp — return type 2-level, admin edit, print | แก้ ReturnApp |
| [features/invoice-scanner.md](./features/invoice-scanner.md) | ReceiveLogApp — AI Vision สแกนบิล | แก้ ScanInvoice component |
| [features/ap-workflow.md](./features/ap-workflow.md) | ReceiveLogApp — ติดตามตั้งหนี้รายอาทิตย์ (Weekly Batch) | แก้ AP tracking / Excel batch export |
| [features/analytics.md](./features/analytics.md) | AnalyticsApp — 3 tab, ABC, forecast, momentum | แก้ AnalyticsApp |

## ดัชนีเพิ่มเติม (ย้ายจาก CLAUDE.md 27/11/2569)

| เรื่อง | ไฟล์ | อ่านเมื่อ |
|---|---|---|
| ออกแบบ Dashboard ใหม่ | [handoff](./handoff-2026-10-10-dashboard.md) · [scripts](./handoff-2026-10-10-dashboard-scripts/) | grill ต่อ / แก้กฎตัดแถวของเรท |
| ส่งต่อ 13/11 ใบพิมพ์ใบเบิก + ตะกร้าค้าง | [handoff](./handoff-2026-11-13-req-print-cart.md) | **เริ่มงานต่อจากเครื่องอื่น** |
| ส่งต่อ 15/11 บัตรยา + E2E push แล้ว — **ค้างบันทึกการทำงาน 15/11** | [handoff](./handoff-2026-11-15-drug-card-push.md) | **เริ่มงานต่อจากเครื่องอื่น** (เครื่องคลัง 16/11) |
| Apps Script expiry (backup) | [docs/apps-script-expiry-alert.md](./apps-script-expiry-alert.md) | reference สคริปต์เดิม |
| แผนปรับกระบวนการตาม INVS | [docs/handoff-invs-2026-08-24.md](./handoff-invs-2026-08-24.md) | สานงานโครงสร้างหน่วยงาน/ค้างจ่าย |
| สร้างแอปมือถือ (2 คลิป) | [docs/reference-mobile-app-videos.md](./reference-mobile-app-videos.md) | ก่อน pilot เบิกออนไลน์ / คิดทำ native-PWA |
| ดีไซน์เมนู + แผนผัง | [docs/reference-sidebar-map-design.md](./reference-sidebar-map-design.md) | ก่อนปรับเมนู/แผนผังอีกรอบ |
