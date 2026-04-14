# Skill: monthly-stats-table

Pattern ตาราง สถิติการเบิกรายเดือน (drug × month) ใน `DispenseSummary` component
มี sticky header แนวตั้ง + frozen column แรก (รายการยา) แนวนอน

---

## โครงสร้าง JSX

```jsx
{/* container: overflow-auto ทั้งสองแกน + maxHeight เพื่อสร้าง scroll context */}
<div
  className="overflow-auto rounded-xl border border-slate-200 shadow-sm"
  style={{ maxHeight: 'calc(100vh - 340px)' }}
>
  <table className="w-full text-xs min-w-[700px]">

    {/* thead sticky top-0 z-20 */}
    <thead className="sticky top-0 z-20">
      <tr className="bg-slate-700 text-white text-center">
        {/* คอลัมน์แรก: sticky left-0 z-30 (สูงกว่า thead z-20) */}
        <th className="px-3 py-2.5 text-left font-semibold sticky left-0 z-30 bg-slate-700 min-w-[180px] shadow-[2px_0_4px_rgba(0,0,0,0.15)]">
          รายการยา
        </th>
        {/* คอลัมน์สี: Max / Avg / รวม */}
        <th className="px-3 py-2.5 font-semibold bg-rose-700   whitespace-nowrap">Max รายเดือน</th>
        <th className="px-3 py-2.5 font-semibold bg-indigo-700 whitespace-nowrap">Avg รายเดือน</th>
        <th className="px-3 py-2.5 font-semibold bg-amber-700  whitespace-nowrap">รวม {numMonths} เดือน</th>
        {/* คอลัมน์เดือน (dynamic) */}
        {monthlyStats.months.map(m => (
          <th key={m.key} className="px-3 py-2.5 font-semibold whitespace-nowrap">{m.label}</th>
        ))}
      </tr>
    </thead>

    <tbody>
      {filteredMonthlyDrugs.map((drug, i) => (
        <tr
          key={drug.name}
          className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-rose-50/40 transition-colors`}
        >
          {/* คอลัมน์แรก: sticky left-0 z-10 + bg-inherit (รับสีจาก tr) */}
          <td className="px-3 py-2 font-medium text-slate-800 sticky left-0 z-10 bg-inherit shadow-[2px_0_4px_rgba(0,0,0,0.06)]">
            <span className="block truncate max-w-[180px]" title={drug.name}>{drug.name}</span>
            {drug.code && drug.code !== '-' && (
              <span className="text-slate-400 font-normal">{drug.code}</span>
            )}
          </td>
          <td className="px-3 py-2 text-center font-bold text-rose-600">
            {drug.max > 0 ? drug.max.toLocaleString() : '-'}
          </td>
          <td className="px-3 py-2 text-center font-semibold text-indigo-600">
            {drug.avg > 0 ? drug.avg.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '-'}
          </td>
          <td className="px-3 py-2 text-center font-bold text-amber-700">
            {drug.total > 0 ? drug.total.toLocaleString() : '-'}
          </td>
          {drug.qtys.map((q, mi) => (
            <td key={mi} className={`px-3 py-2 text-center ${q > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
              {q > 0 ? q.toLocaleString() : '-'}
            </td>
          ))}
        </tr>
      ))}
    </tbody>

    <tfoot>
      <tr className="bg-slate-100 font-bold text-slate-700 border-t-2 border-slate-300">
        {/* tfoot col แรก: sticky left-0 z-10 + bg ตรงๆ (ไม่ใช้ bg-inherit) */}
        <td className="px-3 py-2 sticky left-0 z-10 bg-slate-100 shadow-[2px_0_4px_rgba(0,0,0,0.06)]">
          รวมทั้งหมด
        </td>
        <td className="px-3 py-2 text-center text-rose-700">
          {filteredMonthlyDrugs.length > 0
            ? Math.max(...filteredMonthlyDrugs.map(d => d.max)).toLocaleString()
            : '-'}
        </td>
        <td className="px-3 py-2 text-center text-indigo-700">
          {filteredMonthlyDrugs.length > 0
            ? (filteredMonthlyDrugs.reduce((s, d) => s + d.avg, 0) / filteredMonthlyDrugs.length)
                .toLocaleString(undefined, { maximumFractionDigits: 1 })
            : '-'}
        </td>
        <td className="px-3 py-2 text-center text-amber-800">
          {filteredMonthlyDrugs.reduce((s, d) => s + d.total, 0).toLocaleString()}
        </td>
        {monthlyStats.months.map((_m, mi) => (
          <td key={mi} className="px-3 py-2 text-center">
            {filteredMonthlyDrugs.reduce((s, d) => s + (d.qtys[mi] || 0), 0).toLocaleString()}
          </td>
        ))}
      </tr>
    </tfoot>

  </table>
</div>
```

---

## กฎ z-index (สำคัญมาก)

| element | z-index | เหตุผล |
|---|---|---|
| container | — | สร้าง scroll context ด้วย `overflow-auto` + `maxHeight` |
| `<thead>` | `z-20` | ติดบนสุดเมื่อ scroll แนวตั้ง |
| header col แรก `<th>` | `z-30` | อยู่เหนือ `thead z-20` เพื่อไม่ถูก cell อื่นทับมุม |
| body col แรก `<td>` | `z-10` | ติดซ้ายเมื่อ scroll แนวนอน แต่อยู่ใต้ header |
| tfoot col แรก `<td>` | `z-10` | เหมือน body |

---

## กฎ background บน sticky cells

- **`<thead> <th>`** → `bg-slate-700` (ระบุตรงๆ ป้องกัน cell ด้านหลังโปร่งแสงผ่านมา)
- **body `<td>` col แรก** → `bg-inherit` (รับสีจาก `<tr>` เพื่อ alternating row ทำงานได้)
- **`<tfoot> <td>` col แรก** → `bg-slate-100` (ระบุตรงๆ เพราะ tfoot มีพื้นหลังเดียว)

---

## กฎ container (critical)

```
❌ overflow-x-auto   → sticky thead พังเมื่อ scroll แนวตั้ง (ไม่มี scroll context)
✅ overflow-auto     → ทั้งสองแกนอยู่ใน container เดียวกัน sticky ทำงานถูกต้อง
```

ต้องมี `maxHeight` ด้วย ไม่งั้น container ไม่มีความสูงจำกัด → scroll แนวตั้งไม่เกิด

```js
// offset คำนวณจาก: modal header + tabs + padding + controls row
style={{ maxHeight: 'calc(100vh - 340px)' }}
```

---

## data structure ของ drug object

```js
{
  name:  string,        // ชื่อยา
  code:  string,        // รหัสยา (อาจเป็น '-')
  qtys:  number[],      // qty แต่ละเดือน ตามลำดับ monthlyStats.months
  total: number,        // รวมทุกเดือน
  max:   number,        // max ในเดือนที่สูงสุด
  avg:   number,        // เฉลี่ยต่อเดือน (total / numMonths)
}
```

---

## การกรองด้วย DrugSearchBar

```js
const filteredMonthlyDrugs = monthlyStats
  ? (monthlySearch.trim()
      ? monthlyStats.drugs.filter(d =>
          d.name.toLowerCase().includes(monthlySearch.toLowerCase())
        )
      : monthlyStats.drugs)
  : [];
```

Search bar ใช้ `DrugSearchBar` component (ดู skill `/drug-search-bar`) วางใน controls row:

```jsx
<DrugSearchBar
  value={monthlySearch}
  onChange={setMonthlySearch}
  options={drugNames}
  placeholder="ค้นหายา..."
  className="ml-auto w-56"
  ringClass="focus:ring-rose-400"
  hoverClass="hover:bg-rose-50"
/>
```
