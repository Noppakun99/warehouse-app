# แผนออกแบบใหม่: ReorderApp แบบ Excel-as-source

> ⛔ **SUPERSEDED (2026-06-13)** — แผนนี้ (import เลข Excel มาแสดงตรงๆ ไม่ recompute)
> ถูกแทนที่ด้วย [ADR-0001](../adr/0001-reorder-recompute-vs-import.md) (recompute ในแอป) และ
> [reorder-excel-spec.md](reorder-excel-spec.md) (เทียบสูตร Excel↔แอป). เก็บไว้เป็นประวัติเท่านั้น —
> **อย่าทำตามแนว import** ส่วน "การ parse ชีต" ยังใช้อ้างได้ถ้าทำ reconcile view (Phase 2).
> ตัดสินใจเดิม 2026-05-30

## บริบท / ที่มา

เภสัชกรทำการวิเคราะห์การเบิกยาจริงใน Excel ชีต **"วิเคราะห์สั่งซื้อ"** จนสมบูรณ์แล้ว และ
Excel **พัฒนาแซงโค้ด** ในแอปไปแล้ว — มีคอลัมน์ที่ `src/lib/reorder.js` ยังไม่มี:

| คอลัมน์ Excel | สถานะในโค้ดปัจจุบัน |
|---|---|
| Max, Avg/เดือน, Avg/วัน, SS, ROP=SS+Avg×LT, สถานะ, จำนวนสั่ง, มูลค่า | ✅ มี สูตรตรงกัน |
| **ตัวคูณ SS** (แสดงค่าตรง ๆ เช่น 1.5) | ⚠️ ซ่อนใน `RISK_MULTIPLIER` (Essential=1.5) |
| **กลุ่ม VEN** (Vital/Essential/Non-essential) | ❌ ไม่มี |
| **วันที่รับเข้าล่าสุด** | ❌ ไม่มี |

ปัญหาแกน: ไม่อยากมี **2 สูตรที่ให้เลขไม่ตรงกัน** (Excel vs JS)

## การตัดสินใจ (เคาะแล้ว)

1. **เจ้าของสูตร = Excel** → แอป import เลขจาก Excel มา **แสดงตรง ๆ** (ไม่ recompute เพื่อแสดง)
2. แอปรัน `reorder.js` **เบื้องหลังเพื่อ diff ตรวจสอบ** เท่านั้น → คอลัมน์ ✓/✗
3. **Dashboard = คำนวณสดต่อไป** (ไม่อ่าน snapshot) — เป็นสัญญาณเตือนรายวัน คนละจังหวะกับการสั่งซื้อรายเดือน
   กฎ #13 ยังถือได้ เพราะตราบใดที่ diff ขึ้น ✓ แปลว่า `reorder.js` (ที่ Dashboard ใช้) = Excel โดยปริยาย

## หลักการทำงานใหม่ (data flow)

```
Excel "วิเคราะห์สั่งซื้อ"  ──upload──►  parse  ──►  เก็บ analysis_runs (snapshot, source='excel')
                                                         │
                              ┌──────────────────────────┼───────────────────────┐
                              ▼                           ▼                        ▼
                      แสดงเลขจาก Excel ตรง ๆ      join รหัสยา → DB สด        รัน reorder.js เบื้องหลัง
                      (ตาราง/แยกบริษัท/print)    (สต็อกปัจจุบัน, Master)     เทียบทีละ step → ✓/✗
```

แมป 3 เป้าหมายของ user:
- **แสดงเลข Excel** → ไม่คำนวณซ้ำ
- **join by รหัสยา** → ความสัมพันธ์ตาราง
- **คอลัมน์ ✓/✗** → เช็คความถูกต้อง + เป็น regression guard

## การ parse ชีต (จุดที่ต้องระวัง)

- **หัวตารางอยู่แถว 3** (แถว 1–2 = title + ปุ่ม Refresh) → parser ต้อง **สแกนหาแถว header**
  (หาแถวที่มี `รหัส` + `สถานะ`) — ห้าม fix ที่แถว 1 แบบ `ImportMasterModal` เดิม
- **คอลัมน์เดือนเป็น dynamic** (`เบิก พ.ย.68` … เปลี่ยนตามช่วง) → จับด้วย prefix `เบิก ` ไม่ hardcode
- map header ไทย → field:
  `รหัส→code · ชนิด→type · รายการยา→name · หน่วย→unit · คงเหลือ→stock · Safety Stock→ss ·`
  `Lead Time→leadTime · ROP→rop · สถานะ→status · จำนวนต้องสั่งเพิ่ม→orderQty · ราคา/หน่วย→price ·`
  `บริษัทผู้ขาย→supplier · มูลค่าสั่งซื้อ→amount · กลุ่ม VEN→venGroup · ตัวคูณ SS→ssMult · วันที่รับเข้าล่าสุด→lastReceived`

## การตรวจสอบเบื้องหลัง (หัวใจ)

ตรวจ **ทีละ step** โดยป้อนค่ากลางจาก Excel เข้า `reorder.js` (ไม่ต้องมีเซลล์รายเดือนครบ):

| Step ที่ตรวจ | สูตรแอป | เทียบกับ Excel |
|---|---|---|
| SS | `computeSafetyStock(avgDay, ตัวคูณSS)` | คอลัมน์ Safety Stock |
| ROP | `computeROP(SS, avgDay, LT)` | คอลัมน์ ROP |
| จำนวนสั่ง | `computeOrderQty(...)` | จำนวนต้องสั่งเพิ่ม |
| มูลค่า | `orderQty × ราคา` | มูลค่าสั่งซื้อ |

ผล: คอลัมน์ ✓ ตรง / ✗ ต่าง (แสดง delta) + สรุปหัวตาราง "ตรงกัน 248/250 แถว"
→ ถ้า ✗ = สูตรในโค้ดหลุดจาก Excel ให้รู้ทันที (ดีกว่า golden test เดิมเพราะใช้ข้อมูลจริงทั้งชุด)

## Scope งาน (สิ่งที่ต้องแตะ)

| ไฟล์ | งาน |
|---|---|
| migration `.sql` | `analysis_runs` เพิ่ม `source TEXT DEFAULT 'app'` (mark `'excel'`); VEN/ตัวคูณ/วันรับเข้า เก็บใน `results` JSONB (ไม่ต้องเพิ่ม column) |
| `src/lib/reorder.js` | เพิ่ม `ssMultiplier` override (แทน `RISK_MULTIPLIER` ตายตัว) + ฟังก์ชัน `verifyRow(excelRow)` คืน diff ทีละ step |
| `src/lib/db.js` | `parseAnalysisExcel(file)`, `saveExcelAnalysisRun(...)` + audit action `import_analysis_excel` |
| `src/ReorderApp.jsx` | ปุ่ม "Import ผลวิเคราะห์ (Excel)" + แสดงเลข Excel + คอลัมน์ ✓/✗ + คอลัมน์ "สต็อกปัจจุบัน" จาก join |
| `src/AppRoot.jsx` · `src/lib/db.js` · `src/AuditLogApp.jsx` | เพิ่ม label `import_analysis_excel` ครบ 3 ที่ (กฎ #12: `NOTIF_LABELS` / `NOTIFY_ACTIONS` / `ACTION_LABELS`) |
| `docs/features/reorder.md` | อัพเดตหลักการใหม่ |

## ก่อนลงมือ (TODO พรุ่งนี้)

1. **ขอไฟล์ Excel จริง 1 ไฟล์** (เซฟชีต "วิเคราะห์สั่งซื้อ" ออกมา) เพื่อ:
   - ยืนยันชื่อหัวคอลัมน์เป๊ะ ๆ ก่อนเขียน mapping
   - ลอง diff ดูว่าตอนนี้เลข `reorder.js` ตรงกับ Excel อยู่แล้วหรือยัง (อาจแทบไม่ต้องรื้อ — ตัวคูณ SS=1.5 = Essential พอดี)
2. ถ้าเลขตรงอยู่แล้ว → งานเหลือแค่เพิ่มคอลัมน์ VEN + วันรับเข้าล่าสุด + ตัว import/verify
3. ตามลำดับ scope ด้านบน → `npm run lint` + `npm run test:reorder` ก่อนสรุป
