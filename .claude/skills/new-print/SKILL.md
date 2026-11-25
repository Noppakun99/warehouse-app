---
name: new-print
description: Create a print view via window.open + Blob URL (iOS-safe) in warehouse-app, and the mandatory bug-hunt check for paginated A4 forms (buildPaginatedHtml). Use when adding a printable document or report — or BEFORE editing ใบเบิกเวชภัณฑ์ยา/ใบขอเบิก/ใบปะหน้า, PDF ใบเบิกจากแอป, paginatedPrint.js, pagesToPdfBlob (ขนาดตัวอักษร ระยะลายเซ็น หน้าว่าง เส้นตารางหาย แถวโดนตัด)
---

## ⛔ แก้ใบพิมพ์แบ่งหน้า (buildPaginatedHtml) — ตรวจทั้งเมทริกซ์ ไม่ใช่ใบเดียว (user สั่ง 25/11/2569)

แก้ 5 รอบใน 3 วัน (23–25/11/2569) เพราะทุกรอบตรวจแค่ใบที่ user แจ้ง → แก้ใบยาวแล้วใบสั้นพัง / แก้ฟอนต์แล้วเส้นหาย:

1. ก่อนแก้: `node scripts/check-paginated-print.mjs` เก็บผลเป็น baseline
2. หลังแก้: รันซ้ำ → **✗ ห้ามมี** · ⚠ ใหม่ที่ไม่มีใน baseline = แจ้ง user ก่อนสรุป (หน้าว่างเกินครึ่งที่ขนาดไหน)
3. ตรวจด้วยตา: `--pdf 55,6 --out <scratchpad>\pagchk` → Read PNG **ทุกหน้า** ของทั้ง `app_*` (PDF แบบผู้ใช้กด) และ `print_*` (ปุ่มพิมพ์) ดูให้ครบ 4 จุด:
   - เส้นปิดตารางใต้แถวท้ายของ**ทุกหน้า** (ไม่ใช่แค่หน้าสุดท้าย)
   - หน้าไหนว่างเกินครึ่งทั้งที่ยังมีรายการ/ลายเซ็นตามหลัง
   - ตัวอักษรไม่ทับเส้น · หมายเหตุหลายบรรทัดไม่โดนตัด · ท้ายกระดาษ "หน้า n/N" บรรทัดเดียว
   - ลำดับแถวต่อกันข้ามหน้า (สคริปต์เช็คแล้ว แต่ดูว่าไม่มีหน้าขาว/ดำ)
4. user ส่ง PDF จริงมา → render ทุกหน้าด้วย pymupdf แล้วดูครบ 4 จุดเหมือนกัน (`scripts/pdf-table-check.py` ใช้ไม่ได้กับ PDF จากแอป — เป็นรูปทั้งหน้า ไม่มีเส้น vector)
5. รายงาน user: ตารางผลสคริปต์ + บอกตรงๆ ว่าขนาดไหนยังมี ⚠ และยังไม่ได้ลอง iPhone/Safari (ถ้ายังไม่ได้ลอง)

โหมด `pdf` ของสคริปต์ = ฟอนต์ระบบ (html2canvas ใช้ web font ไม่ได้) แถวสูงกว่า Sarabun → แบ่งหน้าต่างจากใบพิมพ์ ต้องผ่านทั้ง 2 โหมด · ส่วนลายเซ็นสูง ~2/3 หน้า แยกไม่ได้ → ขนาดใบที่ลายเซ็นพอดีขอบจะมีหน้าว่างเสมอ (ยกท้าย 3 แถวตามไป · `.tight` ลดระยะเฉพาะหน้าสุดท้ายเมื่อช่วยให้ไม่ต้องขึ้นหน้าใหม่) · fixture = `scripts/fixtures/cover-req-0098.json` (เปลี่ยนหัว/ส่วนท้ายใน buildCoverHtml ต้องสร้าง fixture ใหม่ — css อ่านสดจากโค้ดอยู่แล้ว)

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
