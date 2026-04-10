Create a new print function for a warehouse-app page using window.open popup with Thai formatting.

## Steps

1. **Ask the user** for:
   - Which page/component: `RequisitionApp` | `DispenseLogApp` | `ReceiveLogApp` | `App`
   - Print title (Thai) e.g. `ใบเบิกยา`, `ใบรับยา`, `รายงานการจ่ายยา`
   - Whether title includes dynamic field e.g. `ใบเบิกยา : {department}`
   - Table columns needed (label + field name)
   - Whether signature block is needed
   - Whether to filter rows (e.g. partial approval → approved only)

2. **Generate `print{Name}(data)` function** with:
   - `window.open()` popup
   - Sarabun font via Google Fonts import
   - Table with columns as specified
   - Header style: `background: transparent; color: #000; font-weight: 700; border-bottom: 2px solid #000;`
   - Row alternating: `tr:nth-child(even) td { background: #f8fafc; }`
   - Bottom margin on table to make room for signature: `margin-bottom: 80px`

3. **Signature block template** (if needed):
```html
<div class="sig-block">
  <p>(ลงชื่อ)...........................................(ผู้เบิก)</p>
  <p>(...........................................)</p>
  <p>ตำแหน่ง เภสัชกรชำนาญการ</p>
  <p>วันที่........./........./................</p>
</div>
```
   CSS: `position: fixed; bottom: 24px; right: 32px; text-align: center; font-size: 15px; line-height: 2;`
   This causes the signature to repeat on every printed page automatically.

4. **Add print button** in JSX:
   - Use `<Printer size={14} />` icon from `lucide-react`
   - Place next to relevant label (e.g. next to status badge, or next to "ผู้เบิก:")
   - Stop event propagation: `onClick={e => { e.stopPropagation(); print{Name}(item); }}`

5. **Row filtering** (if partial approval):
   ```js
   const items = data.status === 'partial'
     ? allItems.filter(item => item.approved_qty != null && item.approved_qty > 0)
     : allItems;
   ```

6. **Confirm** the full function before editing any file.

## Notes
- Always use `window.open('', '_blank')` then `doc.write(html)` then `doc.close()` then `win.print()`
- Font size default: 15px body, 16px signature
- Table `font-size: 15px` for readability
- Date display: use `toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' })`
