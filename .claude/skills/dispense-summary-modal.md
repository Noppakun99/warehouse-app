# Skill: dispense-summary-modal

เอกสาร pattern ของ modal สรุปการเบิกจ่าย (`DispenseSummary` component) ใน `DispenseLogApp.jsx`
ใช้อ้างอิงเมื่อต้องการแก้ไข เพิ่ม หรือสร้าง summary modal ในรูปแบบเดียวกัน

---

## โครงสร้างภาพรวม

```
DispenseSummary (modal fixed overlay)
├── Header — gradient slate→rose, ปุ่มปิด (onClose)
├── Tabs — 'overview' | 'monthly'
│   ├── Tab: ภาพรวม
│   │   ├── Filter bar (ตั้งแต่/ถึง วันที่, หน่วยงาน, ค้นหายา)
│   │   ├── 3 Stat cards (รายการ, วันที่, มูลค่า)
│   │   ├── Bar charts หน่วยงาน (จำนวนวัน + มูลค่า)
│   │   └── Bar chart ยามูลค่าสูงสุด
│   └── Tab: สถิติการเบิก รายเดือน
│       ├── ปุ่มย้อนหลัง (2/3/4/6/12 เดือน)
│       ├── ช่องค้นหายา
│       └── ตาราง sticky (drug × month)
```

---

## State ที่ต้องมี

```js
// Tab
const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'monthly'

// Filters (overview)
const [dateFrom, setDateFrom]     = useState('');
const [dateTo, setDateTo]         = useState('');
const [deptFilter, setDeptFilter] = useState('');
const [departments, setDepts]     = useState([]);
const [drugFilter, setDrugFilter] = useState('');
const [drugNames, setDrugNames]   = useState([]);
const [showDrugDd, setShowDrugDd] = useState(false);
const drugRef = useRef(null);

// Stats (overview)
const [stats, setStats]   = useState(null);
const [loading, setLoading] = useState(true);

// All-time baseline (โหลดครั้งเดียว ไม่มี filter)
const [allTimeTotal, setAllTimeTotal]           = useState(null);
const [allTimeValue, setAllTimeValue]           = useState(null);
const [allTimeUniqueDays, setAllTimeUniqueDays] = useState(null);
const [allTimeTopDrugsByValue, setAllTimeTopDrugsByValue] = useState([]);

// Monthly
const [numMonths, setNumMonths]       = useState(4);
const [monthlyStats, setMonthlyStats] = useState(null);
const [monthlyLoading, setMonthlyLoading] = useState(false);
const [monthlySearch, setMonthlySearch]   = useState('');
```

---

## useEffect ตอน mount (all-time baseline)

โหลดครั้งเดียว ไม่มี filter — ใช้ `fetchAllRows` เพื่อข้าม Supabase 1,000-row limit

```js
useEffect(() => {
  if (!supabase) return;
  // count ทั้งหมด (ไม่โหลด rows จริง)
  supabase.from('dispense_logs').select('*', { count: 'exact', head: true })
    .then(({ count }) => setAllTimeTotal(count ?? 0));

  // มูลค่า + unique days + top drugs (paginated)
  fetchAllRows(() =>
    supabase.from('dispense_logs').select('drug_name, qty_out, price_per_unit, drug_unit, dispense_date')
  ).then(data => {
    if (!data || data.length === 0) return;
    setAllTimeValue(data.reduce((s, r) => s + ((r.qty_out || 0) * (getPrice(r) || 0)), 0));
    setAllTimeUniqueDays(new Set(data.map(r => r.dispense_date).filter(Boolean)).size);
    const map = {};
    data.forEach(r => {
      const k = r.drug_name || 'ไม่ระบุ';
      map[k] = (map[k] || 0) + ((r.qty_out || 0) * (getPrice(r) || 0));
    });
    setAllTimeTopDrugsByValue(Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10));
  });

  // วันแรก–วันล่าสุด → set dateFrom/dateTo อัตโนมัติ
  supabase.from('dispense_logs').select('dispense_date').order('dispense_date', { ascending: true  }).limit(1)
    .then(({ data }) => { if (data?.[0]?.dispense_date) setDateFrom(isoToThai(data[0].dispense_date)); });
  supabase.from('dispense_logs').select('dispense_date').order('dispense_date', { ascending: false }).limit(1)
    .then(({ data }) => { if (data?.[0]?.dispense_date) setDateTo(isoToThai(data[0].dispense_date)); });
}, []);
```

---

## loadStats (overview, รับ filter ทั้งหมด)

```js
const loadStats = useCallback(async () => {
  if (!supabase) { setLoading(false); return; }
  setLoading(true);
  const rows = await fetchAllRows(() => {
    let q = supabase.from('dispense_logs')
      .select('department, drug_name, qty_out, price_per_unit, drug_unit, dispense_date');
    if (dateFrom)   q = q.gte('dispense_date', thaiToIso(dateFrom) || dateFrom);
    if (dateTo)     q = q.lte('dispense_date', thaiToIso(dateTo)   || dateTo);
    if (deptFilter) q = q.eq('department', deptFilter);
    if (drugFilter) q = q.ilike('drug_name', `%${drugFilter}%`);
    return q;
  });
  if (!rows || rows.length === 0) { setStats(null); setLoading(false); return; }

  const totalValue = rows.reduce((s, r) => s + ((r.qty_out || 0) * (getPrice(r) || 0)), 0);
  const uniqueDays = new Set(rows.map(r => r.dispense_date).filter(Boolean)).size;
  const aggBy = (key, valFn) => {
    const map = {};
    rows.forEach(r => { const k = r[key] || 'ไม่ระบุ'; map[k] = (map[k] || 0) + valFn(r); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  };
  // unique days ต่อหน่วยงาน
  const deptDaysMap = {};
  rows.forEach(r => {
    const dept = r.department || 'ไม่ระบุ';
    if (!r.dispense_date) return;
    if (!deptDaysMap[dept]) deptDaysMap[dept] = new Set();
    deptDaysMap[dept].add(r.dispense_date);
  });
  const topDeptsByDays = Object.entries(deptDaysMap)
    .map(([dept, days]) => [dept, days.size])
    .sort((a, b) => b[1] - a[1]).slice(0, 10);

  setStats({
    total: rows.length,
    totalValue,
    uniqueDays,
    topDeptsByDays,
    topDeptsValue:   aggBy('department', r => (r.qty_out || 0) * (getPrice(r) || 0)).slice(0, 10),
    topDrugsByValue: aggBy('drug_name',  r => (r.qty_out || 0) * (getPrice(r) || 0)).slice(0, 10),
  });
  setLoading(false);
}, [dateFrom, dateTo, deptFilter, drugFilter]);

useEffect(() => { loadStats(); }, [loadStats]);
```

---

## Logic การแสดง stat cards (isFiltered)

```js
const isFiltered  = !!(deptFilter || drugFilter);
// ถ้ากรองด้วย dept/drug → ใช้ stats (filtered)
// ถ้าไม่กรอง (หรือกรองแค่วันที่) → ใช้ allTime* (ครอบคลุมทุก records)
const filterLabel = deptFilter || (drugFilter ? `ยา: ${drugFilter}` : 'ทุกช่วงเวลา');
const cardTotal   = isFiltered ? stats.total      : (allTimeTotal     ?? null);
const cardDays    = isFiltered ? stats.uniqueDays  : (allTimeUniqueDays ?? null);
const cardValue   = isFiltered ? stats.totalValue  : (allTimeValue      ?? null);
const topDrugsItems = isFiltered ? stats.topDrugsByValue : allTimeTopDrugsByValue;
```

> **สำคัญ:** `allTimeTotal` ใช้ `count: 'exact'` (แม่นยำ) ไม่ใช่ `rows.length`
> `allTimeValue` ใช้ `fetchAllRows` เพื่อได้ค่าจาก rows จริงทั้งหมด (ไม่ติด 1,000-row limit)

---

## fetchAllRows helper (module-level)

```js
// ต้องนิยามที่ระดับ module (นอก component) ก่อนใช้ใน useEffect และ useCallback
async function fetchAllRows(buildQuery) {
  const PAGE = 1000;
  let from = 0;
  let allRows = [];
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return allRows;
}
```

> `buildQuery` ต้องเป็น **function ที่คืน query builder ใหม่ทุกครั้ง** เพราะ Supabase builder ใช้ครั้งเดียว

---

## getPrice helper

```js
const getPrice = (r) => {
  if (r.price_per_unit != null && r.price_per_unit !== '') return parseFloat(r.price_per_unit);
  if (isNumericVal(r.drug_unit)) return parseFloat(r.drug_unit); // fallback
  return null;
};
// สูตรมูลค่าต่อ row: (r.qty_out || 0) * (getPrice(r) || 0)
```

---

## หมายเหตุสำคัญ

- **ห้ามใช้ `.limit(100000)`** เพราะ Supabase ไม่รับประกันว่า override ได้ → ใช้ `fetchAllRows` แทนเสมอ
- `allTimeValue` กับ `stats.totalValue` ต้องใช้สูตรเดียวกัน (`getPrice`) ไม่งั้นค่าไม่สอดคล้องกัน
- `isFiltered` เช็คแค่ `deptFilter || drugFilter` ไม่รวม dateRange เพราะ all-time baseline ไม่มี filter วันที่
- ถ้า subset > whole → แสดงว่า all-time โหลดข้อมูลไม่ครบ (ติด row limit) → ตรวจสอบ `fetchAllRows`
