# Common Patterns

Pattern ที่ใช้ซ้ำหลายๆ ที่ — ต้องรู้ก่อนแก้ไขส่วนที่เกี่ยวข้อง

## Date Input (สำคัญมาก)

มี 2 components — เลือกตามชนิดของ state:

| Component | เก็บค่าใน state | ใช้ใน |
|-----------|----------------|-------|
| `ThaiDateInput` | `DD/MM/YYYY` (string) | ReceiveLogApp, DispenseLogApp |
| `IsoDateInput` | `YYYY-MM-DD` (ISO string) | AuditLogApp, ReturnApp, AnalyticsApp, RequisitionApp |

### Pattern ที่ถูกต้อง (mobile-safe)

ใช้ `<input type="date">` แบบ `absolute inset-0 opacity-0` ซ่อนใต้ `<span>` ที่แสดงผล — **ไม่** ใช้ `showPicker()`

```jsx
function IsoDateInput({ value, onChange, className = '' }) {
  const display = iso => {
    if (!iso) return null;
    const [y,m,d] = iso.split('-');
    return `${d}/${m}/${Number(y)+543}`;  // พ.ศ.
  };
  return (
    <div className={`relative flex items-center bg-white border border-slate-300 rounded-lg focus-within:ring-2 ${className}`}>
      <span className={`px-3 py-1.5 text-sm w-full select-none pointer-events-none ${value ? 'text-slate-800' : 'text-slate-400'}`}>
        {display(value) || 'dd/mm/yyyy'}
      </span>
      <input type="date"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 w-full cursor-pointer" />
    </div>
  );
}
```

### Do Not (Date Input)

- **อย่าใช้ `showPicker()`** — iOS Safari / Android Chrome block ทำให้ date picker ไม่เปิดบน mobile
- **อย่าซ่อน input ด้วย `w-0 h-0 pointer-events-none`** — touch ไม่โดน input
- **อย่าใช้ font-size < 16px** บน hidden `<input type="date">` — iOS Safari auto-zoom เมื่อ focus
- **อย่าใช้ plain `<input type="date">`** โดยตรง — show MM/DD/YYYY บน US locale
- **อย่าสับสน** ThaiDateInput (Thai) กับ IsoDateInput (ISO) — ค่าใน state ต่างกัน
- **อย่าสร้าง `ISODateInput`** (ตัวพิมพ์ใหญ่ทั้งหมด) — ชื่อที่ถูกต้องคือ `IsoDateInput` (camelCase)

## Mobile Layout (ทุก sub-app)

**Pattern เดียวกันใช้กับทุก sub-app ที่มีตาราง:**
- จอ < 768px → แสดง **card list** แทนตาราง
- แตะ card → **bottom sheet** เลื่อนขึ้นจากล่าง (ยกเว้น UserManagement ที่ใช้ modal เดิม)
- state: `isMobile` (boolean), `mobileDetail` (row object หรือ null)
- Desktop ≥ 768px: ตารางเดิมทุกอย่าง ไม่กระทบ

```jsx
useEffect(() => {
  const fn = () => setIsMobile(window.innerWidth < 768);
  window.addEventListener('resize', fn);
  return () => window.removeEventListener('resize', fn);
}, []);
```

| App | สถานะ |
|-----|------|
| ReceiveLogApp | card list + bottom sheet ✅ |
| DispenseLogApp (DispenseView) | card list + bottom sheet ✅ |
| ReturnApp (HistoryTab) | card list + bottom sheet ✅ (ปุ่ม Print ใน bottom sheet) |
| AuditLogApp | card list + edit bottom sheet ✅ |
| UserManagementApp | card list + action buttons ✅ (ใช้ modal เดิม) |
| RequisitionApp | card-based ตลอด (ไม่ต้องแปลง) |
| AppRoot (Dashboard) | responsive grid (Tailwind sm:/md:) |

**Do Not**: อย่าเพิ่ม `min-w-[...]` ในตารางโดยไม่มี `isMobile` guard — จะทำให้ scroll ไม่สวยบน mobile

## Print View — Blob URL (mobile-safe)

ใช้ **Blob URL** แทน `document.write()` ใน `window.open` ทุกที่:

```js
// ✅ ถูก — mobile iOS ใช้งานได้
const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
const url  = URL.createObjectURL(blob);
const w    = window.open(url, '_blank');
if (w) setTimeout(() => URL.revokeObjectURL(url), 30000);
else   URL.revokeObjectURL(url);

// ❌ ผิด — iOS Safari หน้าขาว
const w = window.open('', '_blank', 'width=900,height=650');
if (w) { w.document.write(html); w.document.close(); }
```

- iOS Safari ถือว่าการเขียน HTML เข้า `about:blank` tab เป็น cross-origin → block
- ใช้ใน: `printReq` (RequisitionApp), `printReturnLog` (ReturnApp), และ print function ใหม่ทุกอัน

## Department List (2 ระบบ)

### Hardcoded DEPARTMENTS — selection ตอนกรอกฟอร์ม
| ไฟล์ | ใช้ใน |
|------|-------|
| `AppRoot.jsx` | ฟอร์มสมัครใช้งาน |
| `RequisitionApp.jsx` | ฟอร์มส่งใบเบิก |
| `UserManagementApp.jsx` | admin สร้าง/แก้ไข user |
| `ReturnApp.jsx` | ฟอร์มบันทึกคืนยา (DEPARTMENTS ชุดแผนกภายในเท่านั้น) |

**แก้รายการ → ต้องแก้ทุกไฟล์ข้างต้นพร้อมกัน**

### Dynamic — ดึงจาก DB
| ไฟล์ | วิธีดึง | ใช้ใน |
|------|--------|-------|
| `DispenseLogApp.jsx` | `fetchAllDepts(supabase)` | filter ประวัติเบิก |
| `RequisitionApp.jsx` StaffDashboard | `[...new Set(list.map(r => r.department))]` | filter ใบเบิก |

### Do Not (Department List)
- อย่าสับสนสองระบบ — การลบออกจาก hardcoded list ไม่กระทบข้อมูลเก่าใน DB
- ข้อมูลเก่าที่มีชื่อหน่วยงานเก่า → ยังแสดงได้ใน history apps (dynamic dept list)
- CSV upload ไม่ validate ชื่อ dept → upload ข้อมูลด้วยชื่อหน่วยงานใดก็ได้
- `fetchAllDepts` อยู่ใน `DispenseLogApp.jsx` เท่านั้น (local function ไม่ใช่ใน `db.js`)

## Supabase 1,000-row Limit

Supabase REST API คืน **1,000 rows** ต่อ request โดย default — query แบบธรรมดาจะได้ข้อมูลไม่ครบถ้า table มี > 1000 rows

### กฎ
- dropdown ชื่อยา → **ต้องใช้ `fetchAllRows`** เสมอ ห้ามใช้ `.then(({ data }) => ...)` ตรงๆ
- aggregate stats (count, sum) → ใช้ `loadAgg` pattern (ใช้ `fetchAllRows` แล้ว)

```js
// ❌ ผิด — ได้แค่ 1,000 rows แรก
supabase.from('dispense_logs').select('drug_name, drug_type').then(({ data }) => ...)

// ✅ ถูก
fetchAllRows(() => supabase.from('dispense_logs').select('drug_name, drug_type')).then(data => ...)
```

`fetchAllRows` อยู่ใน scope ของ DispenseLogApp/ReceiveLogApp แล้ว — ใช้ได้เลย

## Audit Log Auth Rule (CRITICAL)

ทุก action ที่บันทึก audit log **ต้องส่ง `auth` ครบเสมอ** เพื่อให้ `user_name` และ `department` ไม่เป็น `-`

```js
// ✅ ถูก
exportToExcel(rows, COLS, 'sheet', 'file.xlsx', auth)   // argument ที่ 5
insertReceiveRows(rows, auth)                            // argument ที่ 2
insertAuditLog({ action: '...', user_name: resolveAuditUserName(auth), department: auth?.department || '-' })

// ❌ ผิด — user_name จะเป็น '-'
exportToExcel(rows, COLS, 'sheet', 'file.xlsx')   // ขาด auth
insertReceiveRows(rows, {})                        // auth ว่าง
```

### Checklist เมื่อเพิ่ม feature ที่มี export/import/delete
1. component รับ `auth` prop ไหม?
2. ถ้า component อยู่ใน modal → parent ต้องส่ง `auth` ไปด้วย
3. `exportToExcel(...)` ส่ง auth เป็น argument สุดท้ายไหม?
4. `insertReceiveRows(rows, auth)` ส่ง auth ที่ถูกต้องไหม? (**ไม่ใช่ `{}`**)

## Stat/Export Consistency Rule (ReceiveLog/DispenseLog)

**กฎเหล็ก: ตัวเลขใน stat card + Excel export ต้องตรงกับที่ user เห็นในตาราง**

### ReceiveLog
- `loadAgg` ต้อง select field ที่จำเป็นทั้งหมด (`drug_name, drug_code, lot, exp, bill_number, receive_date, qty_received, total_price_vat`) แล้วกรอง blank+dedup เหมือน `displayRows` ก่อนคำนวณ count/qty/value
- `handleExport` ต้องกรอง blank+dedup ด้วย
- **อย่าใช้ `count: 'exact'` แบบ server-side** สำหรับ ReceiveLog — มัน count รวม blank+duplicate ที่ client filter ออก

### DispenseLog
- `loadAgg` ต้องกรอง `.gt('qty_out', 0)` — row `qty_out=0` ถือเป็น void ไม่นับใน stats
- **อย่าแสดง `-0`** ใน UI — ใช้ helper `fmtQtyOut(q)` ที่คืน `'-N'` ถ้า > 0, `'0'` ถ้า = 0
- ใช้ `fmtQtyOut` ทั้งใน desktop table, drug-detail panel, mobile card, mobile bottom sheet
- `filteredDrugRows` (drug-detail panel) ต้องกรอง `qty_out > 0` เหมือน `loadAgg` — ไม่งั้น `drugTotalQty`/`drugTotalVal` จะ overcount จาก row qty_out=0
- **Mobile card** ต้องแสดง Lot/Exp — critical สำหรับเภสัชกรตรวจสอบประวัติเบิก

### dedupKey (ReceiveLog)
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
if (!hasName && !hasCode) return false;
```

## ReceiveLog/DispenseLog — Date Filter & Pagination

### Default dateTo = วันนี้
- เมื่อ `dateFrom` มีค่าแต่ `dateTo` ว่าง → query ใช้วันนี้เป็น upper bound อัตโนมัติ
- Pattern: `const isoTo = thaiToIso(dateTo) || dateTo || (isoFrom ? new Date().toISOString().split('T')[0] : '');`
- ใช้ใน 3 จุดต่อ app: `load`, `handleExport`, `loadAgg` (+ `filteredDrugRows` ใน ReceiveLogApp)
- ช่อง "ถึง" แสดง placeholder วันนี้สีเทาเมื่อ `dateFrom` ตั้งค่าอยู่
- **อย่าเปลี่ยนกลับเป็น `q.eq('dispense_date/receive_date', isoFrom)` เมื่อ dateFrom เดียว** — ต้องเป็น `gte` เสมอ

### Pagination
- `PAGE_SIZE = 200` (ทั้งสอง app)
- Pagination block แสดงเมื่อ `rows.length === PAGE_SIZE || page > 0`
- ปุ่ม "ก่อนหน้า" แสดงเมื่อ `page > 0`
- ปุ่ม "ถัดไป" แสดงเฉพาะ `rows.length === PAGE_SIZE`
- Input พิมพ์เลขหน้า: `key={page}` + `defaultValue={page+1}` → กด Enter หรือ blur เพื่อ jump
- แสดงข้อความ: หน้า [input] / {totalPages} ({count} รายการ)

### Date Range Display
- แสดง chip "ข้อมูลตั้งแต่ DD/MM/YYYY – DD/MM/YYYY · X ปี Y เดือน Z วัน" เหนือ stat cards
- ดึง `minDate` / `maxDate` ใน `loadAgg` ด้วย 2 parallel queries ใน `Promise.all`
- **สำคัญ**: ต้องใช้ `.not('receive_date', 'is', null)` ก่อน `.order()` เสมอ — PostgreSQL sort `NULL DESC` ขึ้นก่อน max query ได้ null
- แสดงเมื่อ `aggStats?.minDate && aggStats?.maxDate` เท่านั้น

### ReceiveLog Stats Query
- `loadStats()` ต้องดึง `price_per_unit` ใน `.select()` เสมอ — ใช้คำนวณมูลค่ารวมเมื่อ `total_price_vat = null`
- มูลค่ารับเข้ารวมต่อยา: `total_price_vat > 0 ? total_price_vat : qty_received × price_per_unit`

### ReceiveLog supplierFilter
- query `load` ต้องส่ง `supplierFilter` ไป DB ด้วย: `q.eq('supplier_current', supplierFilter)`
- เพิ่ม `supplierFilter` ใน dependency array ของ `useCallback`
- **อย่าลบ client-side filter ใน `displayRows`** — ยังต้องใช้ `getDetailSupplier()` ที่ละเอียดกว่า
- **Empty state**: เมื่อ `rows.length > 0 && displayRows.length === 0 && supplierFilter` (client-side filter กรองหมด) → แสดง empty state พร้อมปุ่ม "ล้างตัวกรองบริษัท" — กันผู้ใช้งงว่าตารางหายไปไหน

## DrugSearchBar — Keyboard Navigation

- กด `↓` / `↑` เลื่อนรายการใน dropdown
- กด `Enter` เลือกรายการที่ highlight
- กด `Esc` ปิด dropdown
- hover เมาส์ sync กับ keyboard highlight
- dropdown `max-h-56 overflow-y-auto` + active item `scrollIntoView({ block: 'nearest' })`
- **Do not**: อย่า set `pointer-events-none` บน input — keyboard event จะไม่ทำงาน

## AuditLogApp — Bulk Select (Admin)

- **Checkbox** ซ้ายทุก row (desktop + mobile) แสดงเฉพาะ `auth.role === 'admin'`
- **Select All** — checkbox ใน header ตาราง มี indeterminate state
- **Bulk Action Bar**: "เลือก N รายการ · ยกเลิก · ลบที่เลือก"
- **Confirm 2 ขั้น**: กดครั้งแรก → "ยืนยันลบ N รายการ", กดอีก → ลบจริง
- `bulkDeleteAuditLogs(ids)` ใน db.js — ลบหลาย row ด้วย `.in('id', ids)`
- Reset selection อัตโนมัติเมื่อค้นหาใหม่
