# Spec: Reorder Analysis ตาม Excel "วิเคราะห์สั่งซื้อ" (source of truth)

> สถานะ: **Implement แล้ว 2026-06-13** (SS ฐาน 30, factor 2.3, ลบ Refill mode, VEN, LT 0–90, คอลัมน์ คงเหลือ−ROP) — เหลือ Q3 รอ user
> ทิศทาง: **recompute ในแอปให้ผลตรง Excel** ([ADR-0001](../adr/0001-reorder-recompute-vs-import.md)) — Excel = reference สำหรับ verify ไม่ใช่ input
> Superseded: [reorder-excel-redesign.md](reorder-excel-redesign.md) (แนว import Excel — ถูกแทนด้วย ADR-0001)
> อ่านคู่กับ: [reorder.md](reorder.md) (สถานะปัจจุบันของแอป), [src/lib/reorder.js](../../src/lib/reorder.js)

## ที่มา

เภสัชกรทำการวิเคราะห์การสั่งซื้อยาจริงใน Excel sheet **"วิเคราะห์สั่งซื้อ"** (445 รายการ, A3:AH448)
ซึ่งเป็นระบบ Reorder Point อัตโนมัติที่สมบูรณ์แล้ว และ **เป็น source of truth ของสูตร**.
เอกสารนี้ถอดสูตรทุกคอลัมน์ของ Excel แล้วเทียบกับ `reorder.js`/`ReorderApp.jsx` ปัจจุบัน เพื่อระบุ gap
ที่ต้องแก้ให้แอปคำนวณสด (จาก `inventory` / `dispense_logs` / `receive_logs`) แล้วได้ผล **ตรง Excel**.

## โครงสร้างคอลัมน์ Excel (A–AH)

| Col | หัวคอลัมน์ | ที่มา/สูตร |
|---|---|---|
| A | รหัส | static (รหัส HosXP) |
| B | ชนิด | static (Syrup/Tablet/Injection…) |
| C | รายการยา | static |
| D | หน่วย | XLOOKUP Master → lot ล่าสุด (วันรับล่าสุด) → หน่วย |
| E–K | เบิก พ.ย.68 → พ.ค.69 | SUMPRODUCT ต่อเดือน (ดู §ยอดเบิก) |
| L | รวมทุกเดือน | ผลรวม E–K + AE–AH (11 เดือน) |
| M | Max/เดือน (ธ.ค.–มี.ค.) | `MAX(F,G,H,I)` |
| N | Avg/เดือน (ธ.ค.–มี.ค.) | `(F+G+H+I)/4` |
| O | Avg/วัน | `N/30` |
| P | คงเหลือ (หน่วย) | SUMPRODUCT Master!U (คงเหลือหลังจ่าย) × packsize ÷ packsize หน่วยสั่ง |
| Q | Safety Stock | `MAX(1, ROUND(Avg/วัน × 30 × ตัวคูณSS, 0))` — **ฐาน 30 วัน, ไม่ cap** |
| R | Lead Time (วัน) [avg] | `AVERAGEIFS(รับยา[leadtime])` กรอง 0–90; default **20** ถ้าไม่มีข้อมูล |
| S | ROP | `SS + Avg/วัน × LeadTime` |
| T | คงเหลือ − ROP | `P − S` (ติดลบ = ต้องสั่ง) |
| U | สถานะ | priority 6 ระดับ (ดู §สถานะ) |
| V | จำนวนแนะนำสั่งซื้อ | `MIN(Max×3, MAX(Avg×2.3, Max×2, ROP)) − คงเหลือ` (ดู §order qty) |
| W | ราคา/หน่วย (บาท) | XLOOKUP Master → lot ล่าสุด → ราคา |
| X | บริษัทล่าสุด | XLOOKUP Master → lot ล่าสุด → บริษัท |
| Y | วันที่รับเข้าล่าสุด | `MAXIFS` Master → วันรับล่าสุด |
| Z | มูลค่าสั่งซื้อ (บาท) | `V × W` |
| AA | กลุ่ม VEN | manual: V=Vital / E=Essential / N=Non-essential |
| AB | ตัวคูณ SS | V=2.0 / E=1.5 / N=1.0 |
| AC | ตัดออก/สั่งเมื่อขอ | manual override: "✂️ ตัดออก" / "📋 สั่งเมื่อขอ" / "-" |
| AD | คงอยู่ได้อีก | `P / Avg/วัน` → ปี/เดือน/วัน |
| AE–AH | เบิก มิ.ย.69 → ก.ย.69 | SUMPRODUCT ต่อเดือน (เดือนถัดจากช่วงคำนวณ) |

## รายละเอียดสูตร

### ยอดเบิกรายเดือน (E–K, AE–AH)
```
ROUND( SUMPRODUCT(
  (รหัส match) × (วันที่ ≥ ต้นเดือน) × (วันที่ ≤ ปลายเดือน)
  × (ไม่ใช่ "บันทึกเท่านั้น") × qty_base / packsize ), 2 )
```
- **qty_base ÷ packsize** → แปลงหน่วยย่อยกลับเป็นหน่วยสั่งซื้อ
- กรองรายการ `dispense_type = "บันทึกเท่านั้น"` ออก
- track 11 เดือน (พ.ย.68–ก.ย.69)

### สถิติ (M–O) — ช่วงอ้างอิง ธ.ค.68–มี.ค.69
- ใช้ **เฉพาะ 4 เดือน F,G,H,I** (ธ.ค.,ม.ค.,ก.พ.,มี.ค.)
- **ตัด พ.ย.68 (E)** = เดือนแรก/หัว, **ตัด เม.ย.69 (J)** = ช่วง Refill 2 เดือน ยอดผิดปกติ
- Max = MAX 4 เดือน; Avg/เดือน = ผลรวม÷4; Avg/วัน = Avg/เดือน÷30

### Safety Stock (Q)
```
SS = MAX(1, ROUND(Avg/วัน × 30 × ตัวคูณSS, 0))
```
ตัวคูณ SS มาจาก VEN: V=2.0, E=1.5, N=1.0 — **ฐาน 30 วัน, ไม่มี cap**

### ROP (S)
```
ROP = SS + Avg/วัน × LeadTime
```

### สถานะ (U) — priority order (หยุดเมื่อตรง)
```
① AC = "✂️ ตัดออก"        → ตัดออก
② AC = "📋 สั่งเมื่อขอ"      → สั่งเมื่อขอ
③ คงเหลือ (P) = 0          → หมดสต็อค
④ Exp ≤ 180 วัน            → สั่งเพิ่ม ใกล้หมดอายุ
⑤ คงเหลือ (P) ≤ ROP        → สั่งเพิ่ม
⑥ else                     → คงคลังเพียงพอ
```

### จำนวนแนะนำสั่งซื้อ (V)
```
ถ้า status ∈ {คงคลังเพียงพอ, ตัดออก, สั่งเมื่อขอ} → 0
มิเช่นนั้น:
  target = MIN(Max×3, MAX(Avg×2.3, Max×2, ROP))   ← floor=Max×2, ceiling=Max×3
  V = target − คงเหลือ
  ถ้า V ≤ 0 แต่ยังต้องสั่ง → ใช้ Max หรือ SS แทน    ← (สูตร fallback ยังต้องยืนยัน — ดู Open Q3)
```

## เทียบ Excel ↔ ReorderApp ปัจจุบัน

| Section | Excel (source of truth) | ReorderApp ปัจจุบัน | สถานะ | ต้องแก้ |
|---|---|---|---|---|
| หน่วยจาก lot ล่าสุด | XLOOKUP Master | `fetchLatestReceiptInfo().unit` | ✅ ตรง | — |
| ยอดเบิก ÷ packsize | SUMPRODUCT ÷ packsize | `fetchMonthlyDispenseUsage` ÷ packFactor | ✅ ตรง | — |
| กรอง "บันทึกเท่านั้น" | `dispense_type='บันทึกเท่านั้น'` | filter `main_log`/`note` มีคำ "บันทึก" | ⚠️ heuristic (คง เดิม) | Q4: คง เดิม |
| สถิติ 4 เดือน (ตัดหัว+เม.ย.) | F,G,H,I (ตัด E, J) | window 4 เดือน + `excludedMonth` ตัด 1 เดือน | ✅ ตรง (ผ่าน excludedMonth) | — |
| **Safety Stock** | `Avg/วัน × 30 × ตัวคูณ`, **ไม่ cap** | `MAX(1, round(Avg/วัน × 30 × ตัวคูณ))` | ✅ **DONE** (แก้แล้ว) | — |
| **Lead Time** | AVERAGEIFS กรอง 0–90, default **20** | กรอง 0–90 ใน `parseLt`, default 20 | ✅ **DONE** | — |
| ROP | `SS + Avg/วัน × LT` | เหมือนกัน | ✅ ตรง | — |
| **คงเหลือ − ROP** | col T มี | คอลัมน์ + Excel export | ✅ **DONE** (เพิ่มแล้ว) | — |
| สถานะ 6 ระดับ | priority ① → ⑥ | เหมือนเป๊ะ | ✅ ตรง | — |
| **order qty factor** | `Avg×2.3` คงที่ | `ORDER_FACTOR=2.3` คงที่ (ลบ mode) | ✅ **DONE** | — |
| ราคา/บริษัท/วันรับ/มูลค่า | lot ล่าสุด | `fetchLatestReceiptInfo` | ✅ ตรง | — |
| **VEN + ตัวคูณ SS** | VEN(V/E/N); V=2.0,E=1.5,N=1.0 | UI แสดง V/E/N (`venLetter`), DB คง risk_group | ✅ **DONE** (map) | — |
| exclude_status | ตัดออก/สั่งเมื่อขอ | เหมือนกัน | ✅ ตรง | — |
| คงอยู่ได้อีก | P/Avg/วัน → ปี/เดือน/วัน | `fmtCoverage` ปี/เดือน/วัน | ✅ ตรง | — |

### สรุป gap ที่กระทบตัวเลข (เรียงตามผลกระทบ)

1. **Safety Stock — สูตรคนละตัว (กระทบทุกแถว)**: Excel `Avg/วัน × 30 × ตัวคูณ` ไม่ cap;
   แอป `min(Avg/วัน × 60 × risk, Avg/วัน × 90)` (cap 90). อัตราส่วน SS แอป÷Excel **ไม่คงที่ ขึ้นกับ risk**:
   - Normal (1.0): แอป=Avg×60, Excel=Avg×30 → **2 เท่า**
   - Essential (1.5): แอป=min(Avg×90, Avg×90)=Avg×90 (60×1.5=90=cap), Excel=Avg×45 → **2 เท่า**
   - Critical (2.0): แอป=min(Avg×120, Avg×90)=Avg×90 (**cap kick in**), Excel=Avg×60 → **1.5 เท่า**

   → SS แอปสูงกว่า Excel **1.5–2 เท่า** (cap 90 ตัดเฉพาะ Critical) → ROP สูงตาม → สั่งซื้อเกินจริง
2. **Order qty factor**: Excel `Avg×2.3` เสมอ; แอป normal=2.0 (ต้องสลับ refill mode ถึงได้ 2.3) — ดู Open Q1
3. **Lead Time**: Excel กรอง 0–90 + default 20; แอปไม่กรอง + default 15
4. **VEN mapping**: ค่าตัวคูณเท่ากัน (1.0/1.5/2.0) แต่ enum ต่าง → import VEN ตรงๆ จะ map ไม่ติด

## ผลกระทบต่อ golden test

Golden test ปัจจุบัน ([reorder.test.js](../../src/lib/reorder.test.js)) อิงสูตรเก่า **และ reference ถูก mislabel**:
- Test 1 comment เขียนว่า "Atorvastatin — Golden จาก Excel" แต่ **SS=6655 ไม่เคยมาจาก Excel ฐาน 30**
  (6655 = `Avg/วัน(73.94) × 90` จากสูตรเก่า cap; Excel ฐาน 30 จะได้ `73.94×30×1.5 = 3327`).
  → comment นี้เป็นเท็จ ทำให้เข้าใจผิดว่าโค้ดเดิมตรง Excel แล้ว
- assertion `computeSafetyStock(10, 2.0) = 900` (= 10×90 cap) — สูตรเก่าล้วน

ถ้าแก้สูตรเป็นฐาน 30 ไม่ cap → **reference ทั้งชุดต้องเขียนใหม่** จากแถวจริงใน Excel
(เช่น Acetaminophen syrup: Avg/วัน=11.25, E(×1.5) → SS=506, ROP=686 — ตรวจกับรูป Excel แล้ว).

## Scope การแก้ (เมื่อ design ผ่าน /scrutinize)

| ไฟล์ | งาน |
|---|---|
| [src/lib/reorder.js](../../src/lib/reorder.js) | `computeSafetyStock` → ฐาน 30 ไม่ cap; default LT=20; (factor/VEN ตาม Open Q) |
| [src/lib/reorder.test.js](../../src/lib/reorder.test.js) | เขียน golden reference ใหม่จากแถว Excel จริง |
| [src/lib/db.js](../../src/lib/db.js) | `fetchLatestReceiptInfo` กรอง leadtime 0–90 ก่อนเฉลี่ย |
| [src/ReorderApp.jsx](../../src/ReorderApp.jsx) | เพิ่มคอลัมน์ "คงเหลือ−ROP"; (VEN rename / เอา Refill toggle ตาม Open Q) |
| docs | อัพเดต [reorder.md](reorder.md) สูตร §3 + ADR ถ้า VEN เปลี่ยน schema |

## Open Questions — สถานะ (เคาะ + implement แล้ว 2026-06-13)

### ✅ Q1 — ลบ Refill mode, factor 2.3 คงที่ (DONE)
ลบ toggle Normal/Refill + state `mode` ออกจาก ReorderApp. `computeOrderQty` ใช้ `ORDER_FACTOR=2.3` คงที่.
การ "ตัดเดือนผิดปกติ" ใช้ `excludedMonth` (user เลือกเอง) ต่อไป — แยกจาก factor. snapshot เก็บ `mode:'normal'`
คงที่ (ไม่แตะ `analysis_runs` schema, History แสดง mode ของ snapshot เก่าตามจริง).

### ✅ Q2 — map VEN ที่ UI/import, คง schema เดิม (DONE)
`drug_reorder_config.risk_group` (Normal/Essential/Critical) คงเดิมใน DB. UI แสดง V/E/N
(`venLetter()`: Critical→V, Essential→E, Normal→N). import รับทั้ง V/E/N และ enum เดิม → map เป็น risk_group.

### ⏳ Q3 — สูตร fallback order qty (รอ user)
Excel: "ถ้าคำนวณได้ 0 แต่ยังต้องสั่ง → ใช้ Max **หรือ** SS แทน" — ยังไม่ชัดว่าเลือกตัวไหน.
แอปใช้ `MAX(1, Max)` ไปก่อน (มี comment `// TODO Q3` ใน [reorder.js](../../src/lib/reorder.js)).
→ **รอ user ส่งเซลล์ Excel ที่เข้าเคสนี้** ค่อยแก้บรรทัดเดียว.

### ✅ Q4 — คง heuristic เดิม (DONE)
`dispense_logs` ไม่มี `dispense_type`. คง filter `main_log`/`note` มีคำ "บันทึก"
([db.js:1686](../../src/lib/db.js#L1686)) — ไม่แตะ DB. ยังเป็น known limitation ถ้าข้อมูลต้นทางไม่ครอบคลุม.

### ✅ Q5 — หายเอง (DONE)
เมื่อลบ Refill mode (Q1) แนวคิด "เดือน Refill ที่ตัด" เหลือแค่ `excludedMonth` ที่ user เลือกเองตามปกติ
(default ว่าง = ไม่ตัด). ไม่ต้อง config ต่อยา.
