# 0011. ทะเบียนคงคลัง derive มูลค่า movement รายเดือนเพื่อส่งบัญชี (ยอดซื้อผูก AP posted)

- **Status:** Rejected (2026-07-11) — เลือก "อัพโหลด CSV รายเดือน" แทน (Excel ยังเป็นแหล่งความจริง)
- **Date:** 2026-07-11
- **Extends:** [ADR-0007](0007-monthly-stock-ledger.md)

> **หมายเหตุ (2026-07-11):** ADR นี้เสนอ auto-derive (app คำนวณ movement เอง แทน Excel).
> หลังชั่งข้อดี-เสียกับ user → **ปฏิเสธตอนนี้** เพราะ (1) ยังไม่พร้อมเลิก Excel, (2) drift ของ
> บริจาค/AC override/โครงการ ที่ derive ไม่ได้ = เสี่ยงยอดส่งบัญชีผิด. เลือกทาง **"อัพโหลด master
> CSV เข้า ledger รายเดือน"** แทน — Excel ยังทำมูลค่าครบ (บริจาค/AC), app เป็นหน้าจอแสดง+เก็บ
> ประวัติ+ส่งบัญชี. เนื้อหาด้านล่างเก็บไว้เป็น reference ของทางที่พิจารณาแล้วไม่เลือก (ถ้าจะกลับมา
> auto-derive ในอนาคต — hybrid: upload หลัก + derive เทียบ drift). ตัว pure module `ledgerDerive.js`
> ที่เคยเริ่มเขียนถูกลบแล้ว.

## Context

ADR-0007 ตั้ง `stock_ledger` เป็น snapshot รายเดือน + rollover atomic โดย **เจตนา carry ยอดแบนๆ**:
`rolloverToNextPeriod` ตั้ง `in_qty=0, out_qty=0, closing=opening` ([ledgerRollover.js](../../src/lib/ledgerRollover.js)) —
movement ของงวดใหม่มาจาก **adjustment row ที่คนเพิ่มมือ** เท่านั้น. เหตุผลตอนนั้น:
seed movement จาก master map ตรงแค่ 191/993 แถว จึง "เริ่มนับ movement จริงจากงวดถัดไป".

ความต้องการที่ชัดขึ้น (ยืนยันกับ user 2026-07-11): ทะเบียนคงคลังต้อง **produce ยอดส่งบัญชีรายเดือน**
คล้าย `ยอดคลังยา_master` — ต้องมี 4 ยอดครบ **ต่อแถวบัญชี (cost layer)**:
**ยอดซื้อ (in_value) · ยอดเบิก (out_value) · ยกยอด (carry_in_value) · คงคลัง (closing_value)**.
carry แบนๆ ไม่พอ เพราะคอลัมน์เข้า/ออกว่างเปล่า — ต่างจาก Excel ที่มีตัวเลขจริง.

ข้อเท็จจริงเชิงข้อมูล (verify จาก schema + db.js จริง):
- `dispense_logs` มี `drug_code, lot, price_per_unit, qty_out, dispense_date` ([requisition_schema.sql](../../requisition_schema.sql)) → derive `out_qty/out_value` ต่อ cost-layer key ได้.
- `receive_logs` มี `drug_code, lot, price_per_unit, total_price_vat, receive_date` + **AP workflow** (`ap_stage, ap_posted_at`) ([ap_workflow_migration.sql](../../ap_workflow_migration.sql)) → derive `in_qty/in_value` ได้.
- pattern group-by-เดือน (`dispense_date.slice(0,7)`) มี precedent ใน `fetchDashboardCharts` ([db.js](../../src/lib/db.js)) — derive มูลค่ารายเดือนถูกต้องอยู่แล้ว.

**ปมสำคัญ (เหตุผลของ ADR นี้):** "ยอดซื้อ" ที่ส่งบัญชี **ต้องเท่ากับยอดตั้งหนี้ที่บัญชีรับไว้** —
ไม่ใช่ผลรวม receive ดิบทุกใบ. receive ดิบรวมบิลที่ยังไม่ตั้งหนี้ / บิลบริจาค / บิลที่ยังไม่ผ่าน AP →
ถ้า derive จาก receive ดิบจะ **ไม่ตรงบัญชี**. ระบบมี AP workflow track "ตั้งหนี้แล้ว" อยู่แล้ว
(`ap_stage='posted'` + `ap_posted_at`) = single source of truth ของยอดตั้งหนี้.

## Decision

**1. งวด `open` = derive `in`/`out` สดจากข้อมูลดิบ ต่อ cost-layer key.**
   group `receive_logs`/`dispense_logs` ด้วย key เดียวกับ ledger row = `drug_code + lot + price_per_unit`
   (ADR-0007 ข้อ 1) แล้ว sum เข้า `in_qty/in_value` และ `out_qty/out_value` ของงวด.
   `closing = carry_in + in − out + adjust` (สมการคงคลัง เดิม).

**2. ยอดซื้อ (in) ผูก AP posted — ไม่ใช่ receive ดิบ.**
   นับเฉพาะบิล `receive_logs.ap_stage='posted'` ที่ `ap_posted_at` อยู่ในงวด (`slice(0,7)===period`).
   `in_value = Σ total_price_vat`, `in_qty = Σ qty_received` ของแถว posted ในงวด.
   → ยอดซื้อ ledger = ยอดตั้งหนี้จริง; บิลที่ยังไม่ posted ไม่นับจนกว่าจะ posted (อาจข้ามงวด — ตรงหลักบัญชี: ตั้งหนี้เดือนไหน = ยอดซื้อเดือนนั้น).

**3. ยอดเบิก (out) จาก `dispense_logs` งวดนั้น.**
   `out_qty = Σ qty_out`, `out_value = Σ qty_out × price_per_unit` ที่ `dispense_date` ในงวด
   (ตรงกับ `getPrice` ใน DispenseLogApp / precedent `fetchDashboardCharts`).

**4. carry_in + freeze เดิมไม่เปลี่ยน.**
   `carry_in_value` = closing งวดก่อน (rollover). งวด `closed` = freeze static ห้ามแก้ (ADR-0007).
   **derive เฉพาะงวด `open`** — closed month ไม่ re-derive แม้มี back-dated receive/dispense (หลักบัญชี).

**5. adjustment (`item_type='แก้ไขระบบ'`) ยังทำงานเดิม.**
   ค่าที่ derive ไม่ได้ (บริจาค/สนับสนุน/โครงการ, AC ติดลบ override) → คง manual ผ่าน adjustment row.
   derive คุมแค่ movement ปกติ (เงินบำรุง); ส่วนพิเศษยัง manual จนกว่าจะมี ADR ต่อ.

**6. tie-out ยอดซื้อ.** แสดงยอดซื้อ ledger (derive) เทียบยอด AP posted ในงวด — ต้องเท่ากัน;
   ต่างเมื่อไหร่ = สัญญาณ cost-layer key ไม่ match → flag ให้คนตรวจ.

## Consequences

- **Positive:** app แทน Excel ได้จริง — สมการคงคลังมีชีวิต (`closing=carry+in−out`), คอลัมน์เข้า/ออกมีตัวเลขจริง.
- **Positive:** ยอดซื้อ = ยอดตั้งหนี้ AP โดยอัตโนมัติ — คนไม่ต้องกรอก `วันที่ตั้งหนี้` มือ (คอลัมน์นี้ว่าง 100% ใน master); app มี `ap_posted_at` อยู่แล้ว = เหนือกว่า Excel.
- **Negative / trade-off:** **drift ที่ derive ไม่ได้** — บริจาค/โครงการ/AC override ยังต้อง manual; ยอดรวมส่งบัญชีจะครบต่อเมื่อคนเติม adjustment ส่วนนั้น. ต้องสื่อสารชัดว่า derive คุมแค่ movement เงินบำรุง.
- **Negative / trade-off:** **ยอดซื้อผูก AP posted → ถ้า workflow AP ไม่ครบ (บิลค้างไม่ posted) ยอดซื้อจะขาด** — ต้องดัน AP ให้ posted ก่อนปิดงวด. tie-out ข้อ 6 เป็นตัวจับ.
- **Negative / trade-off:** cost-layer key ต้อง match เป๊ะ ระหว่าง dispense/receive กับ ledger row — ราคา/lot เพี้ยน → movement ตกผิดแถว. tie-out ช่วย flag แต่ไม่กันระดับแถว.

## Alternatives considered

- **รับเข้าทุกบิลใน receive_date (ไม่สน AP stage).** ปฏิเสธ: รวมบิลยังไม่ตั้งหนี้/บริจาค → ยอดซื้อไม่ตรงบัญชีที่รับไว้ (constraint หลักของ user).
- **auto-derive แล้ว freeze เป็น authoritative ตอนปิดงวด (ทับ manual).** ปฏิเสธ (ตอนนี้): ทับ manual override ที่ derive ไม่ได้ (บริจาค/AC) → ยอดผิด; ให้ derive เป็นฐาน + adjustment เติมส่วนพิเศษแทน.
- **คง carry แบน + คน key movement เอง (ADR-0007 เดิม).** ปฏิเสธ: งานมือทุกเดือน + ตารางไม่มีวันเหมือน Excel; ข้อมูลดิบมีครบพอ derive แล้ว.
