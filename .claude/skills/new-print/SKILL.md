---
name: new-print
description: Create a print view via window.open + Blob URL (iOS-safe) in warehouse-app, and the mandatory bug-hunt check for paginated A4 forms (buildPaginatedHtml). Use when adding a printable document or report — or BEFORE editing ใบเบิกเวชภัณฑ์ยา/ใบขอเบิก/ใบปะหน้า, PDF ใบเบิกจากแอป, paginatedPrint.js, pagesToPdfBlob (ขนาดตัวอักษร ระยะลายเซ็น หน้าว่าง เส้นตารางหาย แถวโดนตัด)
---

## ⛔ แก้ใบพิมพ์แบ่งหน้า (buildPaginatedHtml) — ตรวจทั้งเมทริกซ์ ไม่ใช่ใบเดียว (user สั่ง 25/11/2569)

แก้ 5 รอบใน 3 วัน (23–25/11/2569) เพราะทุกรอบตรวจแค่ใบที่ user แจ้ง → แก้ใบยาวแล้วใบสั้นพัง / แก้ฟอนต์แล้วเส้นหาย:

1. ก่อนแก้: `node scripts/check-paginated-print.mjs` เก็บผลเป็น baseline
2. หลังแก้: รันซ้ำ → **✗ ห้ามมี** · ⚠ ใหม่ที่ไม่มีใน baseline = แจ้ง user ก่อนสรุป (หน้าว่างเกินครึ่งที่ขนาดไหน)
3. PDF จริงทุกขนาด: `--pdf 1,6,7,12,20,25,30,40,46,50,55 --out <scratchpad>\pagchk` (ขนาดใน `--pdf` ต้องอยู่ใน `--sizes` ด้วย) — สคริปต์**ตรวจเส้นปิดล่างตารางทุกหน้าจากพิกเซลเอง** (✗ "ไม่มีเส้นปิดล่างตาราง") + จำนวนหน้า `app_N.pdf` ต้องเท่ากับบรรทัด `pdf` ของขนาดเดียวกัน (มากกว่า = แอปลองแบ่งหน้าใหม่ทั้งที่เครื่องปกติ → ตัวตรวจในแอปฟ้องผิด)
4. จำลองเครื่องที่วัดไม่ตรงวาด: `--sizes 6,30,55 --pdf 55,6,30 --simulate 15` และ `--simulate 40` → ต้อง ✓ ทุกไฟล์ (แอปตรวจภาพแล้วแบ่งหน้าใหม่เอง — `PDF_RESERVE_STEPS` ใน reqSheetExport.js)
5. ดูด้วยตา Read PNG ทุกหน้าของ `app_*`/`print_*`: หน้าไหนว่างเกินครึ่ง · ตัวอักษรไม่ทับเส้น · หมายเหตุหลายบรรทัดไม่โดนตัด · "หน้า n/N" บรรทัดเดียว · ไม่มีหน้าขาว/ดำ — **ห้ามใช้ตาตัดสินเรื่องเส้นปิดตาราง** (PNG 70 dpi มองไม่เห็นเส้น 1px ที่หาย)
6. **user ส่ง PDF/ภาพมาว่ายังพัง → ตรวจไฟล์จริงของ user ก่อนเสมอ**: `node scripts/check-paginated-print.mjs --check-pdf "<ไฟล์.pdf>"` (หาใน `Downloads` ตามเวลา) · สคริปต์ผ่านแต่ไฟล์ user ไม่ผ่าน = สภาพเครื่อง user ต่างจาก Playwright → **ห้ามสรุปว่าแก้แล้วจาก Playwright อย่างเดียว** · เทียบตำแหน่งเส้นตารางทีละพิกเซลกับ `app_N.pdf` ของเรา (ตรงกัน = ตอนวาดเหมือนกัน ต่างที่ตอนวัดแบ่งหน้า) · `scripts/pdf-table-check.py` ใช้ไม่ได้กับ PDF จากแอป (เป็นรูปทั้งหน้า ไม่มีเส้น vector)
7. รายงาน user: ตารางผลสคริปต์ + บอกตรงๆ ว่าขนาดไหนยังมี ⚠ และยังไม่ได้ลอง iPhone/Safari / เครื่อง user (ถ้ายังไม่ได้ลอง)

**บทเรียน 25/11/2569 (รอบที่ 6)**: สคริปต์ผ่านทุกขนาด แต่ PDF ที่ user ทำตอน 11:09 หน้า 2 แถว 46 ยังไม่มีเส้นปิด — ภาพที่วาดตรงกับของเราทุกพิกเซล แต่เบราว์เซอร์ user วัดตอนแบ่งหน้าได้เตี้ยกว่าตอนวาด ≥ 8.5px (ลอง Chromium/Chrome/Edge · DPR 0.8–2 · ซูม localhost 90% แบบ user แล้วทำซ้ำไม่ได้) · ระยะเผื่อ 3px คิดบนสมมติฐานว่าวัด = วาด จึงพึ่งไม่ได้ → แก้ด้วยการตรวจภาพที่วาดแล้วในแอปเอง (`inkAtBottom`)

โหมด `pdf` ของสคริปต์ = ฟอนต์ระบบ (html2canvas ใช้ web font ไม่ได้) แถวสูงกว่า Sarabun → แบ่งหน้าต่างจากใบพิมพ์ ต้องผ่านทั้ง 2 โหมด · ส่วนลายเซ็นสูง ~2/3 หน้า แยกไม่ได้ → ขนาดใบที่ลายเซ็นพอดีขอบจะมีหน้าว่างเสมอ (ยกท้าย 3 แถวตามไป · `.tight` ลดระยะเฉพาะหน้าสุดท้ายเมื่อช่วยให้ไม่ต้องขึ้นหน้าใหม่) · fixture = `scripts/fixtures/cover-req-0098.json` (เปลี่ยนหัว/ส่วนท้ายใน buildCoverHtml ต้องสร้าง fixture ใหม่ — css อ่านสดจากโค้ดอยู่แล้ว)

**ช่องลายเซ็นใบเบิกเวชภัณฑ์ยา (`printCoverForm` · ①–⑤ — ห้ามเปลี่ยนเองโดยไม่ถาม user):**
- ① ผู้เขียนคำขอ: ห้องยาG/ห้องยา1 พิมพ์ชื่อ+ตำแหน่งจาก `COVER_FORM.writers` · หน่วยงานอื่นเส้นเขียนมือ + `(.......)` + ตำแหน่ง
- ② ผู้เบิก: หน่วยงานใน `requesterHead.depts` พิมพ์ชื่อหัวหน้า · อื่นๆ เส้นเขียนมือ
- ③ ผู้จ่าย / ⑤ ผู้อนุมัติ: `sig(..., under=true)` ชื่อในวงเล็บใต้เส้น
- **④ ผู้รับยา: `sig('4', 'ผู้รับยา', [])` = เซ็นบนเส้น "(ลงชื่อ) …… (ผู้รับยา)" อย่างเดียว ไม่มีบรรทัด `(.......)` ใต้เส้น** แล้วต่อด้วยตำแหน่ง/วันที่ (user สั่ง 25/11/2569) · แก้ช่องเซ็นต้องแก้ส่วนท้ายใน fixture ให้ตรงด้วย แล้วรันตัวตรวจทั้งเมทริกซ์

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
