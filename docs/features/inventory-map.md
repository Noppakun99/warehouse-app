# Inventory Map (App.jsx) — ระบบแผนผังคลังยา

## โครงสร้าง Header

- **Top header bar**: white sticky bar `bg-white border-b border-slate-200` — ปุ่มกลับ + icon + ชื่อระบบ + "จัดการข้อมูล" dropdown ฝั่งขวา
- ย้าย `สรุปข้อมูล` และ `จัดการข้อมูล` dropdown ออกจาก search area → header
- **Alert stat cards**: `grid grid-cols-2 sm:grid-cols-4` — 4 card (หมดอายุ / ใกล้หมดอายุ / รอตรวจรับ / ระบบสั่งยา) ใช้สี semantic (red/amber/sky/orange)
- **Search card**: `bg-white rounded-2xl border` แยกออกจาก header
- **Zone tabs**: active = `bg-indigo-600 text-white`
- **Cabinet headers**: `bg-indigo-600`
- **Summary modal header**: `bg-indigo-600`
- ต้อง import `ArrowLeft` จาก `lucide-react` ใน App.jsx — ขาดแล้วหน้าขาว

## Slot Heatmap + List of sections

- **Slot** (`Slot` component) เป็น **square heatmap เล็ก** (`w-9 h-9`, ไม่มี label ตัวอักษร) — รหัสตำแหน่ง + รายการยา (สูงสุด 4) แสดงใน **hover tooltip** (สี indigo) เท่านั้น
  - สี: ว่าง = `bg-slate-100 border-dashed` · มีของ = `bg-indigo-400` (opacity ตามความหนาแน่น 0.45→1) · ใกล้หมดอายุ = `bg-amber-500` · หมดอายุ = `bg-rose-500` (expiry override density)
  - คง `onClick={handleLocationClick(id)}` + highlight (`ring-yellow-400`) เดิม — flow คลิกดูตำแหน่งไม่เปลี่ยน
  - container ของ slot ใช้ `flex flex-wrap gap-1.5` (เดิม `gap-2`)
- **List of sections** (panel เหนือแผนผัง, ซ่อนตอน `searchTerm`) — progress bar % การใช้พื้นที่ต่อ zone จาก `sectionUsage` useMemo
  - `sectionUsage` = slot ที่มี item `qty>0` ÷ slot ทั้งหมดต่อ zone (อ้างอิง `layout` + `inventory`) — **คนละค่ากับ Slot Utilization ใน summary modal** ที่นับ qty>0 ระดับ slot เหมือนกันแต่ต่อ cab
  - bar color: ≥85% rose, ≥60% amber, <60% indigo — คลิกแถว = `setActiveZone(cab)`
  - มี slot legend (ว่าง/มีของ/ใกล้หมด/หมดอายุ) ใน header ของ panel นี้
- **ไม่มี** donut "Section usage" และ feed Received/Sent/Expected (ไม่มีข้อมูล Sent/Expected — ไม่ทำ mock) — ดู design ref "Warehouse Logistics" ที่ปรับมาเฉพาะ heatmap + section list, คงธีม indigo

## ทุก query จาก inventory ต้อง paginate (1000-row limit)

ทุก function ที่ aggregate ตาราง `inventory` **ต้องดึงทุก row ผ่าน helper `fetchAllInventoryRows(selectCols, { orderBy })`** ([db.js](../../src/lib/db.js)) — ห้าม `.select(...)` เดี่ยวๆ เพราะติด Supabase 1000-row limit (Critical Rule #2)

- `.order('location')` เรียง Latin (`A-1-1`…) ก่อน Thai → คลังชื่อไทย (เช่น `คลังน้ำเกลือ`) มาท้าย ถ้า inventory > 1000 row จะ**ถูกตัดทิ้งเงียบๆ** (พบจริง: inventory 1,108 row, น้ำเกลือ row 1,023–1,108 หาย)
- อาการเมื่อพลาด: ยา (เช่นน้ำเกลือ/Saline) **หายจากแผนผัง + ค้นหาไม่เจอ + รายการคงเหลือ + dashboard alert + ReorderApp คำนวณคงเหลือ = 0** (สั่งซื้อเกินทั้งที่มีของ)
- 3 function ที่เคยพลาดและถูกแก้ให้เรียก helper: `fetchInventory` (แผนผัง+ReorderApp), `fetchStockSummary` (StockSummaryModal), `fetchDashboardAlerts` (dashboard alert)

## Inventory Alert Rules

- `fetchDashboardAlerts()` ต้องดึง `receive_status` ใน `.select()` เสมอ — ใช้ตรวจยาตัดออกจากบัญชี
- ยาตัดออกจากบัญชี: `String(receive_status || '').includes('ตัดออก')` → ไม่แสดงใน alert ทุกประเภท
- **Expiry alert**: ไม่แสดงถ้า `qty = 0` หรือยาตัดออกจากบัญชี — window ปัจจุบัน = **16 เดือน**
- **Low stock alert**: ไม่แสดงถ้ายาตัดออกจากบัญชี (qty = 0 ยังแสดง เพราะถือว่า critical)

## Display Rules — qty=0 ซ่อนทุกที่

- แสดงเฉพาะ `qty > 0` ใน Slot, modal (`handleLocationClick`), **และผลการค้นหา (`searchResults` useMemo)**
- ข้อมูล qty=0 **ยังอยู่ใน `inventory` state** — ใช้คำนวณ low-stock alert และ order calculation ต่อได้
- ไม่กรองออกตอน import CSV — กรองเฉพาะตอน render เท่านั้น
- **ยาตัดออก (discontinued)**: ซ่อนถ้า qty=0 ด้วย (เข้าเงื่อนไขเดียวกัน)
- **เรียงลำดับ exp ascending** ทุกที่ — ใกล้หมดอายุก่อนอยู่บนสุด รายการที่ไม่มี exp อยู่ล่างสุด
  - `handleLocationClick` (popup ตำแหน่ง) ✓
  - `searchResults` useMemo ✓
- slot color (hasExpired/hasNearExpiry) คำนวณจาก `visibleItems` — qty=0 ถูก skip ใน loop อยู่แล้ว

## Inventory Summary Modal — Display Rules

**ตัวเลขทุกตัวใน modal ต้องสอดคล้องกัน** — `summary`, `overallStats`, `typeStats` ต้องกรอง `qty > 0 && !discontinued` เหมือน `expiredItems`/`nearExpiryItems`/`safeItems`

- **มูลค่าคงคลัง** คำนวณจาก `Σ qty × price_per_unit` โดย lookup `drugDetails[code|lot|invoice].price_per_unit` (fallback: code+lot)
- **Slot Utilization** = (slot ที่มียาคงเหลือ > 0 ÷ slot ทั้งหมดใน cab)
  - color: ≥85% rose, ≥60% amber, <60% emerald
- **Top 5 ใกล้หมดอายุ** คลิก → ปิด modal + เปิด `handleLocationClick(location)` ของ Lot นั้น
- **Top 5 คงเหลือสูงสุด** group by `code` (fallback name), sum `qty`, แสดงจำนวนตำแหน่งจัดเก็บที่กระจายอยู่
- **KPI "หมดอายุแล้ว"** ซ่อนเมื่อ `expiredItems.length === 0`
- **Toggle view** "กราฟ / ตาราง" state `summaryStorageView` (`'chart' | 'table'`) — ตารางมี column มูลค่า + Slot Util
- **Export Excel** ใน header modal — `exportToExcel` พร้อม auth, ไฟล์ `inventory_summary_{date}.xlsx`
  - columns: รายการยา / Lot / Lot รวม / มูลค่า / Slot ใช้/ทั้งหมด / % การใช้พื้นที่
- **Timestamp** ใน header — แสดง `logUpdateDate` ผ่าน `formatDateTime()` ใต้ title
- **มูลค่ารวม** ใช้ `formatBaht`: ≥1M → "X.XXM", ≥1K → "X.XK", <1K → integer
- **หมายเหตุใต้ KPI**: "นับเฉพาะคงเหลือ > 0 · ไม่รวมยาตัดออกจากบัญชี · มูลค่าคำนวณจากราคา/หน่วยล่าสุดใน receive_logs"

## UI Polish Rules

- **ห้ามใช้ emoji** ใน UI ทุกที่ — ใช้ lucide-react เท่านั้น
- **Header buttons** (สรุปข้อมูล + จัดการข้อมูล) ใช้ outline pattern เดียวกัน: `bg-white border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 text-indigo-600`
- **Alert stat cards** เหลือ 3 ใบ (`sm:grid-cols-3`): หมดอายุแล้ว / ใกล้หมดอายุ (16 เดือน) / รอตรวจรับ — การ์ด "ต่ำกว่าจุดสั่งซื้อ" ถูกนำออก (2026-06-27) เพราะตัวเลขนี้แสดงใน Dashboard (Top 5 ยาต้องสั่งซื้อ จาก `fetchDashboardAlerts.lowStock`) + ReorderApp (single source of truth) อยู่แล้ว — เลยลบ `lowStockItems`/`usageRates`/`fetchUsageRates` ที่เป็น consumer เดียวออกด้วย
- **หมายเหตุช่วง 16 เดือน** อยู่ภายใน card "ใกล้หมดอายุ" (text-[10px] text-slate-400)
- **Toggle ซ่อนช่องว่าง** ใช้ `Eye` / `EyeOff` icon — EyeOff = ซ่อนอยู่ (active state indigo)
- **Empty state**: เมื่อ `Object.keys(inventory).length === 0` → card dashed border + ปุ่ม "อัปโหลด Log คลังยา" (staff) หรือ hint "ติดต่อเจ้าหน้าที่" (requester)
- **Search result chip** ใช้ `bg-indigo-600` — สี amber สงวนสำหรับ alert (expiry) เท่านั้น
- **Heatmap slot ว่าง** (`itemCount === 0`) ใช้ `bgOpacity = 0.15` + `border-dashed` — slot ที่มีของใช้ solid border
- **ปุ่ม "รายละเอียด"** ใน item card ใช้ `min-w-[140px]` + text คงที่ "รายละเอียด" + chevron toggle (ไม่เปลี่ยน label) — กัน width กระตุก

## Tracking Modal (Expiry / Pending)

Modal เปิดจาก Alert stat cards (หมดอายุแล้ว / ใกล้หมดอายุ / รอตรวจรับ) → `expiryViewFilter` เป็น `'expired' | 'near' | 'pending'`

**Layout**: Desktop table / Mobile card list (toggle ที่ `isMobileExpiry` = `width < 768px`)

**State**:
- `modalTimeFilter` (all/expired/soon30/soon90/soon180/soon16m) — แสดงเฉพาะ `near`/`expired` (`isExpiryMode`)
- `modalLogFilter` (`'all'` หรือ zone letter A/B/C/D/...) — group ตาม prefix ของ `location`
- `modalExporting`, `modalSearch`, `isMobileExpiry`

**Sort**:
- `isExpiryMode` → เรียงตาม exp/daysLeft (ใกล้สุดก่อน)
- `!isExpiryMode` (pending) → เรียง `location` natural order (A-1-1 → A-1-2 → B-1-1)

**คอลัมน์ที่แสดง**: ชื่อยา · ชนิด · ตำแหน่ง · Lot · วันหมดอายุ · สถานะ/รอตรวจรับมา · บริษัท · นโยบายเปลี่ยนยา · คงเหลือ

**บริษัท + นโยบายเปลี่ยนยา** — lookup จาก `drugDetails` (receive_logs) ด้วย `code|lot|invoice` ก่อน → fallback `code|lot`:
- `supplier` = `_company` (= `supplier_current`) จาก receive_logs
- `swapPolicy` = `_drug_swap_policy + supplier_changed` join ด้วย ` | ` (กรอง `'-'`/ว่างทิ้ง)
- ค่าใน `drug_swap_policy` เป็น merged column อยู่แล้ว — ดู [docs/schema.md](../schema.md)

**Helpers สำคัญ**:
- `fmtQty(r)` → `${qty.toLocaleString('th-TH')} × ${unit||'หน่วย'}` (× คั่นเพราะ qty=กล่อง, unit=หน่วยต่อกล่อง เช่น "5 × 500เม็ด")
- `computeWaitDays(item)` (pending only) = `todayForDisplay - _receiveDate` (Math.max 0) — badge สีฟ้า `bg-sky-100`
- `<DrugTypeBadge type={r.type} />` จาก DrugSearchBar — สีตามชนิดยา

**Excel button** ใน header — export `timeFiltered` ตาม sub-tab + zone ปัจจุบัน 11 cols (name/code/type/location/lot/exp/qty/unit/receiveStatus/**supplier/swapPolicy**)

**Reset filter ตอนปิด modal** ทั้ง 2 จุด (X header + ปุ่ม "ปิดหน้าต่าง") — reset `modalSearch`, `modalTimeFilter`, `modalLogFilter` พร้อมกัน

**Do Not**: อย่าใช้ `renderItemCard` ในตารางหลัก — สงวนไว้สำหรับ `searchResults` หน้าแผนผังหลัก

## StockSummaryModal — จำนวนคงเหลือในคลัง

- เปิดจาก Dashboard card "รายการยาในคลัง" (StatsStrip)
- **Layout**: Desktop → modal กว้าง `max-w-5xl` กลางหน้าจอ / Mobile → bottom sheet (`rounded-t-2xl`)
- ตาราง: sticky header + frozen column "ชื่อยา" (ซ้าย) + scroll แนวนอน บน mobile
- Realtime: subscribe `postgres_changes` บน `inventory` table → อัพเดตอัตโนมัติ
- DrugSearchBar ใน modal รองรับ keyboard navigation (↑↓ Enter Esc)
- **Sort**: คลิก header ชื่อยา / คงเหลือ / LOT เพื่อ sort — cycle asc → desc → default (`sortBy` state `{ key, dir } | null`)

## ExpiryAlertSection — Export Excel

- ปุ่ม Export Excel อยู่ใน header ของ modal — ใช้ `EXPIRY_EXCEL_COLS` (module-level constant)
- Export ตาม **tab filter ที่เลือกอยู่** (`filtered`) ไม่ใช่ทั้งหมด
- ชื่อไฟล์: `expiry_alert_{tabLabel}_{date}.xlsx`
- ต้องส่ง `auth` prop ไปที่ `<ExpiryAlertSection auth={auth} />` เสมอ

## Do Not (Inventory Map)

- อย่าใช้ dark gradient `from-slate-900 to-slate-600` ใน header หรือ cabinet — ใช้ `bg-indigo-600`
- อย่าวาง search bar + dropdown ไว้ใน header block เดิม — แยกเป็น card ของตัวเอง
- อย่าเปลี่ยน filter logic เป็น `!(isDiscontinued && qty === 0)` — qty=0 ต้องซ่อนเสมอ
- อย่าใส่ "นับทุกแถวใน inventory" ใน KPI cards — เคยมีบั๊กตัวเลขไม่ตรงกันระหว่างนับรวม qty=0 กับ donut ที่นับเฉพาะ qty>0
- อย่าใส่ `style={{ maxHeight }}` ซ้อนทับ `flex-1` ใน table area ของ StockSummaryModal — ใช้ `95vh` บน modal wrapper แทน
