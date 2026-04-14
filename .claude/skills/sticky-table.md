# Skill: sticky-table

Create a data table with sticky header and optional frozen first column for any page in warehouse-app.

## Pattern

```jsx
<div
  className="overflow-auto rounded-xl border border-slate-200 shadow-sm bg-white"
  style={{ maxHeight: 'calc(100vh - {OFFSET}px)' }}
>
  <table className="w-full text-sm min-w-[{MIN_WIDTH}px]">
    <thead className="sticky top-0 z-20">
      <tr className="bg-slate-700 text-white">
        {/* frozen first column */}
        <th className="px-3 py-2.5 text-left font-semibold sticky left-0 z-30 bg-slate-700 shadow-[2px_0_4px_rgba(0,0,0,0.15)]">
          {firstColLabel}
        </th>
        {/* other headers */}
        <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{...}</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row, i) => (
        <tr key={row.id} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
          {/* frozen first column */}
          <td className="px-4 py-3 sticky left-0 z-10 bg-white shadow-[2px_0_4px_rgba(0,0,0,0.06)]">
            {row.firstCol}
          </td>
          {/* other cells */}
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

### Light header variant (ใช้เมื่อ header อยู่ใน card/section ที่มี bg ขาว)

```jsx
<div
  className="overflow-auto"
  style={{ maxHeight: 'calc(100vh - {OFFSET}px)' }}
>
  <table className="w-full text-xs min-w-[{MIN_WIDTH}px]">
    <thead className="sticky top-0 z-20">
      <tr className="text-slate-500 font-semibold border-b border-slate-100 bg-slate-50">
        {/* ต้องระบุ bg-slate-50 ตรงๆ บนแต่ละ <th> เพื่อป้องกัน cell ด้านหลังโปร่งแสงผ่านมา */}
        <th className="px-4 py-2 text-left bg-slate-50">ชื่อยา</th>
        <th className="px-4 py-2 text-center bg-slate-50">คอลัมน์อื่น</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r, i) => (
        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
          <td className="px-4 py-2.5">{r.name}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

## Steps

1. **Ask the user** for:
   - Which component file to edit
   - Table columns (label, field, alignment: left/right/center)
   - Whether first column should be frozen (sticky left)
   - Header style: dark (`bg-slate-700 text-white`) or light (`bg-slate-50 text-slate-500`)
   - Approximate offset from top of page in px (header height + any panels above table)

2. **Calculate `maxHeight` offset**:
   - Page with sticky app header (~64px) only → use `180px`
   - Page with sticky app header + info panels above → use `300–400px` depending on panel height
   - Full-page view (no surrounding panels) → use `120px`
   - Inside modal or card section → use `420px` or more

3. **Apply sticky rules**:
   - Container: `overflow-auto` (both axes) + `maxHeight`
   - `<thead>`: `sticky top-0 z-20`
   - Dark header: bg on `<tr>` + repeat bg on frozen `<th>` only
   - **Light header: must repeat `bg-slate-50` on every `<th>` individually** (not just `<tr>`) เพราะ Tailwind ไม่ inherit bg ผ่าน sticky boundary ได้ถูกต้อง
   - First `<th>` (frozen): add `sticky left-0 z-30 bg-{color} shadow-[2px_0_4px_rgba(0,0,0,0.15)]`
   - First `<td>` (frozen): add `sticky left-0 z-10 bg-inherit shadow-[2px_0_4px_rgba(0,0,0,0.06)]`

4. **Colored header columns** (optional):
   ```jsx
   <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap bg-rose-800">
     Safety Stock
   </th>
   ```
   Common colors: `bg-rose-800`, `bg-violet-700`, `bg-orange-800`, `bg-cyan-700`, `bg-blue-800`, `bg-emerald-800`

5. **Row highlight states**:
   ```
   critical/warning   → bg-rose-50/60
   success/completed  → bg-emerald-50/60 opacity-70
   highlighted        → ring-2 ring-inset ring-yellow-400 bg-yellow-50
   alternating        → i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
   ```

## z-index rules

| element | z-index | เหตุผล |
|---|---|---|
| `<thead>` | `z-20` | ติดบนสุดเมื่อ scroll แนวตั้ง |
| header frozen `<th>` | `z-30` | อยู่เหนือ thead เพื่อไม่ถูกทับมุม |
| body frozen `<td>` | `z-10` | ติดซ้ายแต่อยู่ใต้ header |

## Notes

- **Do NOT use `overflow-x-auto` alone** — breaks sticky thead with page scroll. Always `overflow-auto`.
- `min-w-[{N}px]` on `<table>` prevents column squishing on narrow screens
- `whitespace-nowrap` on `<th>` prevents header text from wrapping
- If no frozen column needed, omit all `sticky left-0` classes
