# Migration Plan: Mockup → Codebase เดิม

> อัพเดตล่าสุด: 2026-05-27
> ที่มา: Design prototype (3 screenshots: Dashboard, ใบเบิกยา, จุดจัดยา)
> เป้าหมาย: ย้าย UI ใหม่จาก mockup เข้า codebase จริง โดยไม่ทำลาย logic / AP workflow / E2E tests เดิม

---

## 0. Foundation (ทำก่อน ทุกหน้าใช้ร่วม)

### 0.1 แยก `AppRoot.jsx` (1,919 บรรทัด) ออกเป็นไฟล์ย่อย

ปัจจุบัน `src/AppRoot.jsx` รวม Router + Login + Dashboard + Bell + Toast + Online presence ไว้ไฟล์เดียว

| สร้างใหม่ | เนื้อหาที่ย้ายมา | อ้างอิงบรรทัดใน AppRoot เดิม |
|----------|-----------------|---------------------------|
| `src/layout/AppShell.jsx` | Sidebar + Header + content slot (router stays in AppRoot) | สร้างใหม่ทั้งหมด |
| `src/layout/Sidebar.jsx` | nav menu ตาม mockup (จัดหมวด หลัก/เบิก-จ่าย/จัดซื้อ&คลัง/ระบบ) | แทน `SYSTEMS` + `GROUPS` arrays (L464-619) |
| `src/layout/TopBar.jsx` | ชื่อ รพ. + breadcrumb + global search + bell + user menu | แทน `<header>` ใน Dashboard (L829-969) |
| `src/layout/GlobalSearch.jsx` | ⌘K modal — ค้น ยา / ใบเบิก / batch / PO | สร้างใหม่ |
| `src/components/NotificationBell.jsx` | bell + dropdown + online presence | ย้ายจาก Dashboard (L857-959) |
| `src/components/NotifConstants.js` | `NOTIF_LABELS`, `NOTIFY_ACTIONS`, `notifMessage`, `timeAgo` | ย้ายจาก L622-725 — ใช้ร่วมหลายที่ |
| `src/auth/LoginPage.jsx` | Login + Register + FirstRun + Forgot | ย้ายจาก L203-431 |
| `src/pages/DashboardPage.jsx` | Dashboard ใหม่ (stat cards + lists) | **rewrite** ทั้งหมด — ของเดิม L727-1919 ลบทิ้ง |

หลัง refactor `AppRoot.jsx` เหลือแค่ ~150 บรรทัด (auth + page state + AppShell wrapper)

### 0.2 Tweaks Panel (palette / density / nav-mode / role-switch)
- สร้าง `src/dev/TweaksPanel.jsx` แสดงเฉพาะ `import.meta.env.DEV`
- Palette → CSS variables ใน `:root` + Tailwind `bg-[var(--color-primary)]`
- Density → class `data-density="compact|regular"` บน body
- Role switcher → override `auth.role` ใน sessionStorage (dev-only เท่านั้น)

### 0.3 Brand
- "คลังยา · MedStock" + "โรงพยาบาลประชาธิปัตย์" ใน Sidebar header
- ⚠️ Confirm กับหัวหน้าก่อนใส่ "MedStock"
- `HOSPITAL_NAME` constant ใน `src/ReceiveLogApp.jsx` ยังคงเป็น `'โรงพยาบาลประชาธิปัตย์'`

---

## 1. หน้า "ภาพรวม" (Dashboard) — Rewrite ทั้งหมด

| Element ใน mockup | ไฟล์เป้าหมาย | ข้อมูลจาก | หมายเหตุ |
|------------------|-------------|----------|---------|
| Greeting "สวัสดี ภญ.ฤทธิ์" + วันที่ พ.ศ. | `DashboardPage.jsx` | `auth.name` + `new Date()` | ห้าม emoji 👋 (rule "Do Not") |
| Stat: "ใบเบิกรออนุมัติ" + ▲ +3 จากเมื่อวาน | `DashboardPage.jsx` | `db.js: fetchRequisitionStats()` (**สร้างใหม่**) | trend = compare yesterday |
| Stat: "อยู่ระหว่างจัด/อนุมัติ" | เดิม | `fetchRequisitionStats({ status: 'picking,verified' })` | |
| Stat: "ใกล้หมดอายุ ≤ 90 วัน" | เดิม | `fetchDashboardAlerts().expiring` | ✅ มีอยู่แล้ว |
| Stat: "ต่ำกว่า ROP" | เดิม | `fetchDashboardAlerts().lowStock` | ✅ มีอยู่ — ⚠️ **กฎ #13**: logic ต้องตรงกับ ReorderApp (per drug code + exclude_status) |
| "ใบเบิกล่าสุด N รายการ" | `<RecentRequisitions />` | `fetchRecentRequisitions(limit=7)` (**สร้างใหม่**) | |
| "ยาใกล้หมดอายุ FEFO watch" | `<FefoWatch />` | `fetchDashboardAlerts().expiring` | ใช้ data เดิม + UI ใหม่ (วันคงเหลือติดลบ = สีแดง) |
| "เร่งด่วน" badge บน req | `RecentRequisitions` | column `urgent BOOLEAN` (**migration ใหม่**) | `ALTER TABLE requisitions ADD urgent BOOLEAN DEFAULT false` |
| ปุ่ม "ส่งออกรายงาน" + "รับยาใหม่" | `DashboardPage.jsx` | "รับยาใหม่" → `onNavigate('receive')` | ส่งออก → reuse `exportToExcel` |
| Footer "ระบบทำงานปกติ · v1.4.2" | `Sidebar.jsx` (bottom) | static + ping Supabase | |

**สิ่งที่ลบ (จาก Dashboard เดิม)**:
- ❌ Card grid 8 systems (L463-585) → แทนด้วย sidebar nav
- ❌ GROUPS workflow group (L588-619) → แทนด้วย sidebar groups
- ✅ **เก็บ logic**: online presence subscription, notif bell → ย้ายไป AppShell

---

## 2. หน้า "ใบเบิกยา" (Requisitions) — Major Refactor

| Element ใน mockup | ไฟล์เป้าหมาย | จากเดิม | หมายเหตุ |
|------------------|-------------|---------|---------|
| Tabs: ทั้งหมด/รออนุมัติ/พร้อมจัด/กำลังจัด/ส่งแล้ว/ปฏิเสธ + count | `RequisitionApp.jsx` | `step` state → แทนด้วย `tab` state | ใช้ `requisitions.status` filter |
| Table: เลขที่ใบ / แผนก / ผู้เบิก / รายการ / จำนวน / เวลา / ผู้จัด / สถานะ | `<RequisitionTable />` (ใหม่) | ของเดิมมี layout ใกล้กัน | sortable column header |
| Search "ค้นหา เลขที่ใบ / แผนก / ผู้เบิก" | `RequisitionApp.jsx` | มีบางส่วน | unify เป็น 1 search box |
| ปุ่ม Filter / ส่งออก / สร้างใบเบิก | `RequisitionApp.jsx` | "สร้างใบเบิก" → open form | |
| Modal รายละเอียดใบเบิก | `<RequisitionDetailModal />` (ใหม่) | ปัจจุบัน inline — เปิดในหน้าเดิม | **เปลี่ยน UX**: modal + role-based action buttons |
| Mobile card list (< 768px) | `RequisitionApp.jsx` | ❌ ยังไม่มี | **กฎ #5** — card + bottom sheet |

**Risk**: ต้อง test flow ครบ 3 role หลังเปลี่ยน modal:
- requester: สร้าง / แก้ / ลบ ใบเบิกตัวเอง
- staff: เริ่มจัด → จัดเสร็จ → ยืนยันส่ง
- requester: ยืนยันรับยา

---

## 3. หน้า "จุดจัดยา" (Picking) — ส่วนใหญ่ใช้ของเดิมได้

| Element ใน mockup | ไฟล์เป้าหมาย | จากเดิม | หมายเหตุ |
|------------------|-------------|---------|---------|
| Queue panel (ER, IPD-4 …) | `<PickingQueue />` (ใหม่) หรือ `page='picking'` | ปัจจุบัน picking ทำใน RequisitionApp `step='picking'` | **Decision**: แยกเป็นหน้าใหม่? หรือ tab? |
| Active picking: REQ + 3 SKU checklist | `RequisitionApp.jsx` (picking step) | ✅ logic มีอยู่แล้ว | UI ใหม่ — checkbox + location badge |
| "เส้นทางจัดยา · FEFO + เส้นทางสั้นที่สุด" | **สร้างใหม่** | ❌ ไม่มี | FEFO sort (มีอยู่) + path optimization (sort by location zone code) |
| Progress bar N/M ชิ้น | `<PickingProgress />` (ใหม่) | ❌ | |
| ปุ่ม "ยืนยันส่งมอบ" + "พิมพ์ใบจัด" | `RequisitionApp.jsx` | ✅ มีอยู่ | แค่ย้าย UI |

---

## 4. หน้า "รับยา" (Receive + 3-step scan + AP Workflow)

| Element ใน mockup | ไฟล์เป้าหมาย | จากเดิม | หมายเหตุ |
|------------------|-------------|---------|---------|
| 3-step flow: scan → OCR review → confirm | `ReceiveLogApp.jsx` | ✅ `scanInvoice` flow มีอยู่แล้ว | reuse `insertScannedBillRows` (**กฎ #8** ห้ามใช้ `insertReceiveRows`) |
| ตาราง history | `ReceiveLogApp.jsx` | ✅ มีอยู่ | UI refresh |
| **Tab "ส่งบัญชี" (AP workflow)** | `ReceiveLogApp.jsx` | ✅ **Implemented ครบแล้ว** (3 sub-tabs: pending/sent/history) | **⚠️ mockup ยังไม่แสดง** — ต้องเพิ่มใน design รอบหน้า |

ดู [docs/features/ap-workflow.md](features/ap-workflow.md) สำหรับ AP workflow ครบ

---

## 5. หน้า "วิเคราะห์สั่งซื้อ" — ใช้ของเดิมเป็นหลัก

| Element ใน mockup | ไฟล์เป้าหมาย | จากเดิม | หมายเหตุ |
|------------------|-------------|---------|---------|
| Reorder analysis (ROP/SS/Refill) | `ReorderApp.jsx` | ✅ ครบ | UI shell refresh เท่านั้น |
| CSS bar chart (mockup ใช้ CSS เอง) | `DashboardPage.jsx` + `AnalyticsApp.jsx` | ❌ | **แทนด้วย recharts** — AnalyticsApp ใช้ recharts อยู่แล้ว |

---

## 6. หน้า "รายการยา" — แยกออกจาก Inventory Map

| Element ใน mockup | ไฟล์เป้าหมาย | จากเดิม | หมายเหตุ |
|------------------|-------------|---------|---------|
| Drug list (table) | แยกเป็น `page='drugs'` | `App.jsx` รวม inventory map + drug list | **ควรแยก**: รายการยา (table) vs แผนที่คลัง (grid) |

---

## 7. 4 หน้า Stub — ใช้โค้ดเดิมทั้งหมด

| Mockup stub | ไฟล์เดิม (พร้อมใช้) | งาน |
|-------------|---------------------|-----|
| Returns | `src/ReturnApp.jsx` | wrap ด้วย AppShell ใหม่ |
| แผนที่คลัง | `src/App.jsx` (inventory map section) | แยก map ออกจาก drug list |
| Audit log | `src/AuditLogApp.jsx` | wrap ด้วย AppShell ใหม่ |
| Users | `src/UserManagementApp.jsx` | wrap ด้วย AppShell ใหม่ |

**Effort**: หน้าละ 1-2 ชั่วโมง (โค้ด logic ใช้ของเดิม)

---

## 8. Components ใหม่ที่ต้องสร้าง

| Component | ใช้ที่ไหน | Dependency |
|-----------|----------|-----------|
| `src/layout/AppShell.jsx` | ทุกหน้า | Sidebar + TopBar |
| `src/layout/Sidebar.jsx` | AppShell | role-based filter |
| `src/layout/TopBar.jsx` | AppShell | NotificationBell + GlobalSearch + UserMenu |
| `src/layout/GlobalSearch.jsx` | TopBar | `fetchDrugs`, `fetchRequisitions`, batches |
| `src/components/NotificationBell.jsx` | TopBar | `NotifConstants.js` |
| `src/components/NotifConstants.js` | Bell + AppRoot | ย้ายจาก AppRoot.jsx |
| `src/pages/DashboardPage.jsx` | AppRoot router | StatCard, RecentRequisitions, FefoWatch |
| `src/components/StatCard.jsx` | Dashboard | trend ▲▼ |
| `src/components/RecentRequisitions.jsx` | Dashboard | RequisitionRow |
| `src/components/FefoWatch.jsx` | Dashboard | `fetchDashboardAlerts().expiring` |
| `src/components/RequisitionTable.jsx` | Requisitions | sortable header |
| `src/components/RequisitionDetailModal.jsx` | หลายหน้า | role-based action buttons |
| `src/components/PickingQueue.jsx` | Picking | live update |
| `src/components/PickingProgress.jsx` | Picking | |
| `src/components/StatusBadge.jsx` | ทุกที่ | unified status colors |
| `src/dev/TweaksPanel.jsx` | dev-only | CSS vars, density |
| `src/auth/LoginPage.jsx` | AppRoot | ย้ายจาก AppRoot.jsx |

---

## 9. db.js — Functions ใหม่ที่ต้องเพิ่ม

```js
// Dashboard stats
fetchRequisitionStats({ status?, dateFrom?, dateTo? })
// → { count, countYesterday, trend: +N/-N }

fetchRecentRequisitions(limit = 7)
// → requisition rows เรียง created_at DESC, ล่าสุด limit รายการ

// Global search
searchGlobal(query)
// → { drugs: [...], requisitions: [...], batches: [...] }
```

⚠️ **กฎ #2**: ทุก function ที่ query drugs ต้องใช้ `fetchAllRows` (Supabase 1000-row limit)

---

## 10. Migration SQL ที่ต้องรัน

```sql
-- เพิ่ม urgent flag สำหรับใบเบิกเร่งด่วน
ALTER TABLE requisitions
ADD COLUMN IF NOT EXISTS urgent BOOLEAN DEFAULT false;

-- index สำหรับ filter + sort
CREATE INDEX IF NOT EXISTS idx_requisitions_urgent ON requisitions(urgent) WHERE urgent = true;
```

รันใน Supabase Dashboard → SQL Editor ก่อน deploy code ที่ใช้ field นี้

---

## 11. ลำดับ Implementation (8 Sprints)

| Sprint | สิ่งที่ทำ | Output | ผ่านเมื่อ |
|--------|----------|--------|---------|
| **1** | Foundation: แยก AppRoot + สร้าง AppShell+Sidebar+TopBar (shell-only, logic เดิม) | ทุกหน้าเดิมเข้าได้ผ่าน shell ใหม่ | E2E `tests/01-09` ผ่านครบ |
| **2** | Dashboard ใหม่ + db.js extensions (RequisitionStats, RecentRequisitions, urgent migration) | Dashboard mockup ใช้ได้ | Stat ตรงกับ ReorderApp + visual match mockup 90% |
| **3** | Global ⌘K search + NotificationBell ใหม่ | ค้น drug/req/batch ได้ | manual test 5 keyword |
| **4** | Requisitions page refactor + RequisitionDetailModal | tab + table + modal flow ครบ 3 role | E2E `tests/03-requisition` ผ่าน |
| **5** | Picking page แยกออก + FEFO sort + path optimization | picking workflow ผ่าน checklist | new E2E test |
| **6** | ReceiveLogApp UI refresh + **เก็บ AP workflow ครบ (3 sub-tabs)** | scan flow + AP tab ทำงานได้ | ไม่ regression `tests/08+` |
| **7** | ReorderApp + AnalyticsApp UI refresh (CSS chart → recharts) | สวยขึ้น logic เดิม | `npm run test:reorder` ผ่าน |
| **8** | 4 stub pages wrap + Mobile responsive + a11y audit | feature parity กับของเดิม | E2E mobile 375px + a11y |

---

## 12. Risk & Regression Areas

| Risk | กฎ | Mitigation |
|------|----|-----------|
| Stat card ไม่ตรงตาราง | #6 | ทุก stat ใช้ query เดียวกับหน้าที่แสดงข้อมูล — เขียน helper รวม |
| AP workflow หาย | #1, #12 | E2E `tests/08` ต้องผ่านทุก sprint |
| Reorder logic เพี้ยน | #13 | `npm run test:reorder` ผ่านทุก sprint |
| Audit log ขาด action | #12 | ห้ามแก้ `insertAuditLog` calls — ย้าย NOTIF_LABELS เฉพาะที่ไฟล์ |
| Supabase 1000-row | #2 | ทุก search/dropdown ใช้ `fetchAllRows` |
| Date picker พัง mobile | #14 | ทุก `<input type="date">` ใช้ `ThaiDateInput` / `IsoDateInput` |
| Print views พัง iOS | #4 | ห้ามแก้ pattern `printApBatch` / `printReturnLog` (Blob URL) |
| Mobile layout ขาด | #5 | ทุก table ใหม่ต้องมี card view < 768px |
| Emoji ใน UI | Do Not | ลบ 👋 ใน greeting — ใช้ lucide-react |

---

## 13. คำถามที่ต้องเคาะกับทีม design / หัวหน้า

1. **AP Workflow** — เพิ่มใน mockup รอบหน้าได้ไหม? (sub-tabs pending/sent/history + BillCard layout)
2. **Mobile design** — มีแผนออกแบบ mobile view ไหม? ตอนนี้ desktop only
3. **"MedStock" branding** — confirmed?
4. **"เร่งด่วน" badge** — ใครติ๊ก? (requester / staff?) → ต้อง migration column
5. **CSV import flow** — อยู่หน้าไหนใน design ใหม่?
6. **Picking page** — แยกหน้า `page='picking'` หรือ tab ใน Requisitions?
7. **Tweaks panel** — production-facing หรือ dev-only?

---

## 14. Reference Files

| ไฟล์ | บทบาท |
|-----|-------|
| `src/AppRoot.jsx` | Router + auth + dashboard เดิม — ไฟล์หลักที่จะ refactor |
| `src/lib/db.js` | Data layer ทั้งหมด — เพิ่ม functions ใหม่ที่นี่เท่านั้น |
| `src/ReceiveLogApp.jsx` | AP workflow + receive — **ห้าม** เปลี่ยน logic, แค่ UI shell |
| `src/ReorderApp.jsx` | Source of truth สำหรับ reorder logic — stat อื่นต้อง reference ที่นี่ |
| `docs/features/ap-workflow.md` | AP workflow spec ครบ |
| `docs/patterns.md` | Date input, mobile, print, audit auth patterns |
| `tests/` | E2E tests — ต้องผ่านทุก sprint |
