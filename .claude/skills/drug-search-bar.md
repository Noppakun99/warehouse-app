# Skill: drug-search-bar

เพิ่ม DrugSearchBar (input ค้นหายา พร้อม dropdown autocomplete + badge ชนิดยา) เข้าใน component ใดก็ได้

## ผลลัพธ์

- input กล่องค้นหายา พร้อมไอคอน 🔍 และปุ่ม ✕ ล้างค่า
- dropdown แสดงชื่อยาที่ตรงกัน พร้อม badge ชนิดยา (Tablet / Syrup / Injection / Apply / Inhale / Saline)
- เลือกจาก dropdown → ค่าถูก set ทันที, dropdown ปิด
- พิมพ์ตรงๆ ก็ได้ (free text filter)

## Component ที่ใช้

`src/DrugSearchBar.jsx` — export `default DrugSearchBar` และ named export `DrugTypeBadge`

## วิธีใช้

### 1. Import

```jsx
import DrugSearchBar, { DrugTypeBadge } from './DrugSearchBar';
```

### 2. State ที่ต้องเพิ่มใน component

```js
const [drugSearch, setDrugSearch] = useState('');      // ค่าที่พิมพ์/เลือก
const [drugNames, setDrugNames]   = useState([]);      // รายการยาสำหรับ autocomplete
```

### 3. โหลด drugNames จาก Supabase (ใส่ใน useEffect)

```js
useEffect(() => {
  if (!supabase) return;
  supabase.from('dispense_logs').select('drug_name, drug_type').then(({ data }) => {
    if (!data) return;
    const typeMap = {};
    data.forEach(d => {
      if (d.drug_name && d.drug_type && d.drug_type !== '-') typeMap[d.drug_name] = d.drug_type;
    });
    const names = [...new Set(data.map(d => d.drug_name).filter(Boolean))].sort();
    setDrugNames(names.map(name => ({ name, type: typeMap[name] || '' })));
  });
}, []);
```

> ถ้า table อื่น (เช่น `receive_logs`, `inventory`) ให้เปลี่ยน `from('dispense_logs')` ตามจริง

### 4. วาง component ใน JSX

```jsx
<DrugSearchBar
  value={drugSearch}
  onChange={setDrugSearch}
  options={drugNames}
  placeholder="ค้นหายา..."
/>
```

### Props ที่ปรับได้

| Prop | Default | คำอธิบาย |
|---|---|---|
| `value` | `''` | ค่าปัจจุบัน |
| `onChange` | required | callback รับ string เมื่อพิมพ์ |
| `onSelect` | optional | callback เมื่อเลือกจาก dropdown (ถ้าไม่ใส่ ใช้ `onChange`) |
| `options` | `[]` | array of `{ name: string, type: string }` |
| `placeholder` | `'ค้นหายา...'` | placeholder |
| `maxResults` | `8` | จำนวน dropdown สูงสุด |
| `ringClass` | `'focus:ring-indigo-400'` | สี focus ring (เปลี่ยนตาม theme ของหน้า) |
| `hoverClass` | `'hover:bg-indigo-50'` | สี hover ของ dropdown item |
| `className` | `''` | class ของ wrapper div |
| `inputClassName` | `''` | class เพิ่มเติมของ input element |

### 5. ใช้ค่า drugSearch ใน query filter

```js
if (drugSearch.trim()) q = q.ilike('drug_name', `%${drugSearch}%`);
```

### 6. reset เมื่อ clear filter

```js
const clearAll = () => {
  setDrugSearch('');
  // ... reset อื่นๆ
};
```

## ตัวอย่าง: ใช้ใน monthly stats (ค้นกรองตาราง)

```jsx
// state
const [monthlySearch, setMonthlySearch] = useState('');
const [drugNames, setDrugNames] = useState([]);

// โหลด drugNames ใน useEffect (ดูข้อ 3)

// วาง search bar
<DrugSearchBar
  value={monthlySearch}
  onChange={setMonthlySearch}
  options={drugNames}
  placeholder="ค้นหายา..."
  className="w-64"
  ringClass="focus:ring-rose-400"
  hoverClass="hover:bg-rose-50"
/>

// กรองตาราง
const filteredRows = monthlySearch.trim()
  ? rows.filter(r => r.drug_name?.toLowerCase().includes(monthlySearch.toLowerCase()))
  : rows;
```

## หมายเหตุ

- `DrugTypeBadge` ใช้ standalone ได้: `<DrugTypeBadge type="Tablet" />`
- Dropdown จะปิดเองเมื่อคลิกนอก (ใช้ `mousedown` listener ใน component แล้ว ไม่ต้องเพิ่มเอง)
- ถ้าต้องการ reset ค่าจากภายนอก ให้ผ่าน `value` + `onChange` ตามปกติ (controlled component)
