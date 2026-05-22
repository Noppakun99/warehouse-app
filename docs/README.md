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
| [features/analytics.md](./features/analytics.md) | AnalyticsApp — 3 tab, ABC, forecast, momentum | แก้ AnalyticsApp |
