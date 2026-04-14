# Skill: excel-export

เพิ่มปุ่ม Export Excel (.xlsx) ให้ component ใดๆ โดยใช้ `exportToExcel` จาก `src/lib/exportExcel.js`

---

## Pattern ที่ใช้

### 1. Import

```jsx
import { FileDown } from 'lucide-react';
import { exportToExcel } from './lib/exportExcel';
```

### 2. กำหนด Column Definitions

วางไว้ระดับ module (นอก component) เพื่อไม่ให้ re-create ทุก render

```jsx
const MY_EXCEL_COLS = [
  { header: 'ชื่อคอลัมน์',  key: 'field_name' },              // ดึง row.field_name โดยตรง
  { header: 'คำนวณ',       value: (r) => r.qty * r.price },   // ใช้ value fn สำหรับ computed field
  { header: 'วันที่ (พ.ศ.)', value: (r) => {
    const d = new Date(r.created_at);
    const pad = n => String(n).padStart(2,'0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()+543}`;
  }},
];
```

**กฎ:**
- ใช้ `key` เมื่อดึง field ตรงๆ จาก row
- ใช้ `value: (row) => ...` เมื่อต้องคำนวณหรือ format
- ค่า `null`, `undefined`, `'-'` จะแสดงเป็น `''` ใน Excel อัตโนมัติ

### 3. กรณีข้อมูลเป็น nested (1 row ต่อ item)

ถ้า data มี nested array (เช่น requisition มี items[]) ต้อง flatten ก่อน:

```jsx
// flatten: req → หลาย row (1 row ต่อ item)
const flattenReqs = (reqs) =>
  reqs.flatMap(req =>
    (req.items?.length ? req.items : [{}]).map(item => ({ ...req, _item: item }))
  );

// column ใช้ r._item?.field_name
const COLS = [
  { header: 'เลขที่',   value: (r) => r.req_number },
  { header: 'รายการยา', value: (r) => r._item?.drug_name || '-' },
];
```

### 4. ปุ่ม Export

```jsx
<button
  onClick={() => exportToExcel(rows, MY_EXCEL_COLS, 'SheetName', `filename_${date}.xlsx`, auth)}
  className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg px-3 py-1 text-sm font-medium transition-colors"
>
  <FileDown size={16}/> Excel
</button>
```

**Parameters:**
| param | type | คำอธิบาย |
|-------|------|----------|
| `rows` | `object[]` | array ของ data (flat แล้ว) |
| `columns` | column def[] | ดูข้างบน |
| `sheetName` | `string` | ชื่อ sheet ใน Excel |
| `fileName` | `string` | ชื่อไฟล์ รวม `.xlsx` |
| `auth` | `{ name, department }` | สำหรับ audit log — ส่ง `auth` prop ต่อมาจาก AppRoot |

### 5. รับ auth prop จาก AppRoot

`exportToExcel` ต้องการ `auth` เพื่อบันทึก audit log ต้องส่งผ่าน props จาก AppRoot ลงมา:

**AppRoot.jsx:**
```jsx
<MyApp ... auth={auth} />
```

**Component:**
```jsx
export default function MyApp({ onBack, auth = {} }) {
  // ส่งต่อไปยัง sub-component ที่มีปุ่ม export
}
```

---

## ตัวอย่างในโปรเจกต์นี้

| File | Sheet Name | หมายเหตุ |
|------|-----------|---------|
| `DispenseLogApp.jsx` | `ประวัติการจ่ายยา` | flat rows, มูลค่า = qty × price |
| `ReceiveLogApp.jsx`  | `ประวัติการรับยา`  | flat rows |
| `ReturnApp.jsx`      | `ประวัติการคืนยา`  | flat rows |
| `RequisitionApp.jsx` | `ใบเบิกยา`         | nested items → `flattenReqs()` |

---

## สิ่งที่ exportToExcel ทำให้อัตโนมัติ

- ปรับความกว้าง column ให้พอดีกับข้อมูล (max 40 chars)
- บันทึก audit log action `export_excel` ใน Supabase ตาราง `audit_logs`
- ถ้า audit log fail → ไม่ throw error (fire-and-forget)
