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

## Steps

1. **Ask the user** for:
   - Which component file to edit
   - Table columns (label, field, alignment: left/right/center)
   - Whether first column should be frozen (sticky left)
   - Approximate offset from top of page in px (header height + any panels above table)

2. **Calculate `maxHeight` offset**:
   - Page with sticky app header (~64px) only → use `180px`
   - Page with sticky app header + info panels above → use `300–400px` depending on panel height
   - Full-page view (no surrounding panels) → use `120px`

3. **Apply sticky rules**:
   - Container: `overflow-auto` (both axes) + `maxHeight`
   - `<thead>`: `sticky top-0 z-20`
   - First `<th>`: add `sticky left-0 z-30 bg-slate-700 shadow-[2px_0_4px_rgba(0,0,0,0.15)]`
   - First `<td>`: add `sticky left-0 z-10 bg-white shadow-[2px_0_4px_rgba(0,0,0,0.06)]`

4. **Colored header columns** (optional, used in ระบบสั่งยา pattern):
   ```jsx
   <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap bg-rose-800">
     <div>Safety Stock</div>
     <div className="text-[10px] font-normal opacity-80">ปัจจุบัน</div>
   </th>
   ```
   Common colors used: `bg-rose-800`, `bg-violet-700`, `bg-orange-800`, `bg-cyan-700`, `bg-blue-800`, `bg-emerald-800`

5. **Row highlight states** (apply conditionally on `<tr>`):
   ```
   isOrdered/completed  → bg-emerald-50/60 opacity-70
   isCritical/warning   → bg-rose-50/60
   isHighlighted        → ring-2 ring-inset ring-yellow-400 bg-yellow-50
   alternating default  → i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
   ```

6. **Confirm** full table JSX with the user before editing any file.

## Notes

- **Do NOT use `overflow-x-auto` alone** — it breaks sticky thead with page scroll. Always use `overflow-auto` on the container so it becomes the scroll context for both axes.
- `min-w-[{N}px]` on `<table>` prevents column squishing on narrow screens
- `z-30` on sticky header cells must be higher than `z-20` on thead row to layer correctly
- `whitespace-nowrap` on `<th>` prevents header text from wrapping and shrinking columns
- If no frozen column is needed, omit all `sticky left-0` classes from `<td>` and `<th>`
