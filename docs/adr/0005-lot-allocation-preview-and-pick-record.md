# 0005. แสดง lot allocation (FEFO) ให้ผู้เบิกเห็นตอนขอ + บันทึก lot ที่จ่ายจริงตอนจัด

- **Status:** Accepted (refines [ADR-0004](0004-requisition-at-drug-level-base-unit.md) — เฉพาะส่วน "ผู้เบิกไม่เห็น lot")
- **Date:** 2026-06-22

## Context

[ADR-0004](0004-requisition-at-drug-level-base-unit.md) กำหนดให้เบิกระดับยาในหน่วยย่อยสุด และ **"ผู้เบิกไม่เห็น lot — allocation เกิดตอน picking เท่านั้น"**. หลังใช้งานจริง ผู้ใช้ต้องการ 2 อย่างที่ 0004 ไม่ได้ครอบ:

1. **ผู้เบิกอยากเห็นล่วงหน้าตอนขอ** ว่าคำขอ X เม็ด จะถูกจ่ายจาก lot ไหนบ้าง (lot/exp/จำนวน) ตาม FEFO — เพื่อรู้ว่าจะได้ของ exp ใกล้ไหน และของพอไหม ก่อนส่งใบเบิก.
2. **หลัง staff จัดยาเสร็จ ผู้เบิกต้องรู้ว่าได้ lot/exp อะไรจริง** — เพื่อตรวจสอบย้อนหลังและรับยาให้ตรง.

ข้อเท็จจริงเชิงข้อมูล (verify จาก DB):
- `inventory.qty` เก็บเป็น **กล่อง (pack)**, `inventory.unit` = packsize ของกล่องนั้น (เช่น "1000เม็ด"). คำขอ (`requested_qty`) เป็น **เม็ด** (0004).
- 1 รหัสยามีหลาย lot, packsize อาจต่างกัน (เช่น 500เม็ด vs 1000เม็ด), และคงเหลือเปลี่ยนได้ตลอดเวลาระหว่างรออนุมัติ.
- `requisition_items` เดิมเก็บ `picked_lot/picked_exp/picked_qty` เป็น field เดี่ยว (รองรับ lot เดียว/รายการ).

## Decision

1. **Preview ตอนขอ (ฝั่งผู้เบิก):** คำนวณ FEFO allocation **สดในตะกร้า** จาก lot ที่ใช้ได้ (ตรวจรับแล้ว, ไม่หมดอายุ, มีของ) — แสดง lot/exp/จำนวน (เม็ด) ที่คาดว่าจะได้ + flag "ของไม่พอเบิก" ถ้าขาด. allocator เป็น pure module `src/lib/lotAllocation.js` (`allocateFefo`). **เป็น preview เท่านั้น — ไม่ผูกมัด ไม่เก็บ.**

2. **คำนวณจริงตอน picking (ฝั่ง staff):** เมื่อ staff เปิดจัดยา **คำนวณ FEFO ใหม่จากของจริง ณ ตอนนั้น** (ไม่ใช้ snapshot ตอนขอ) — เพราะของเปลี่ยนได้ระหว่างรอ. staff ปรับได้.

3. **บันทึก lot ที่จ่ายจริง:** เพิ่ม `requisition_items.picked_allocation` (jsonb: `[{lot, exp, base, packs}]`) เก็บผลที่ staff จัดจริง — 1 รายการมีได้หลาย lot. คง `picked_lot/picked_exp/picked_qty` ไว้ (lot แรก + รวม qty) เพื่อ backward-compat. ผู้เบิกเห็น allocation นี้ในประวัติ/ตอนรับยา.

6. **Print/Excel แสดง lot ตามที่จะจ่าย:** `computeReqAllocations(reqs)` (async) คืน allocation ต่อ item — จัดแล้วใช้ `picked_allocation`, **ยังไม่จัดคำนวณ FEFO สด**จาก inventory + เติมราคาราย lot จาก `receive_logs`. ทำให้ผู้อนุมัติเห็น lot/exp/ราคา ในใบ "รอดำเนินการ" ก่อนตัดสินใจ. print/Excel แตก 1 รายการเป็นหลายแถวเมื่อจ่ายข้าม lot. (`printReq` เปลี่ยนเป็น async).

4. **หน่วยที่แสดง:** จำนวนหลัก = **เม็ด** (ตรง 0004); กำกับด้วยจำนวนกล่อง (packs). คงเหลือในหน้าค้นหา/ตะกร้าแสดงเม็ดเด่น + สรุปกล่องแยก packsize.

5. **จ่ายเป็นกล่องเต็ม ไม่แกะกล่อง:** allocation จ่ายเป็นกล่องเต็มเสมอ — ถ้าคำขอเหลือเศษไม่เต็มกล่อง (เช่น ขอ 10,000 กล่องละ 30 = 333.3 กล่อง) **ปัดขึ้นเป็นกล่องเต็ม** (334 กล่อง = 10,020) แล้วรายงาน `overBase` (จ่ายเกินกี่เม็ด) ให้ผู้เบิก/staff เห็น ("จ่ายเต็มกล่อง — เกินที่ขอ X"). ปัดเฉพาะ lot สุดท้ายที่ยังขาด (lot ก่อนหน้าจ่ายเต็มกล่องพอดีตามจำนวน). `packSize=1` (amp) ลงตัวเสมอ ไม่มีเกิน.

## Consequences

- **Positive:** ผู้เบิกเห็นล่วงหน้าว่าจะได้ lot/exp อะไร + รู้ทันทีถ้าของไม่พอ — โปร่งใสขึ้นมากจาก 0004.
- **Positive:** คำนวณสดตอน pick = allocation ตรงของจริงเสมอ ไม่มีปัญหา snapshot เก่า.
- **Positive:** บันทึก lot จริง → ผู้เบิกตรวจย้อนหลังได้ (ตอบโจทย์ "ส่งมอบแล้วต้องรู้ว่าได้ lot อะไร").
- **Negative / trade-off:** ขัดถ้อยคำ 0004 ("ผู้เบิกไม่เห็น lot") — refine เป็น "เห็นแบบ preview ที่ไม่ผูกมัด". หลักการ "ขอเป็นยา+เม็ด ไม่เลือก lot เอง" ยังอยู่ (ผู้เบิกไม่ได้*เลือก* lot — แค่*เห็น*ผล FEFO).
- **Negative / trade-off:** ต้อง migration `picked_allocation jsonb` + ทุก consumer ของ picking (verify/print/Excel/history) ต้องอ่าน allocation array เพิ่มเติม.
- **Negative / trade-off:** preview ในตะกร้าใช้ snapshot lot ตอน add — อาจคลาดจากของจริงตอน submit/pick; ลดความเสี่ยงด้วย re-validate per-code ตอน submit + คำนวณสดตอน pick.
- **Follow-ups / risks:** PickingModal เดิมแสดงคงเหลือเป็น "กล่อง" แต่ `picked_qty` default เป็น "เม็ด" (บั๊กหน่วยเดิม) — ต้อง reconcile ตอน rewrite; auto-split ต้องเทสกรณี lot แรกไม่พอ + packSize=null.
- **กลับด้าน assumption ของ 0004:** 0004 สมมติ "หน่วยย่อยแตกจ่ายได้ (ขอ 5,001 จากกล่อง 1000 ได้)". การใช้งานจริงคือ **จ่ายเป็นกล่องเต็ม ไม่แกะ** — เศษปัดขึ้น (จ่ายเกิน) แทน. กฎจ่ายกล่องเต็ม (decision #5) แทนที่ assumption นั้น.

## Alternatives considered

- **เก็บ snapshot allocation ตอนส่งใบเบิก (option A)** — ตรงคำว่า "คำนวณตอนขอส่งต่อ staff" ตรงตัว แต่ของเปลี่ยนระหว่างรออนุมัติ → staff เห็น lot เก่าที่อาจหมดแล้ว; ต้อง reconcile อยู่ดี. เลือกคำนวณสดตอน pick (B) แทน เพราะแม่นกว่า.
- **คงผู้เบิกไม่เห็น lot เลย (0004 เดิม)** — ผู้ใช้ปฏิเสธ: อยากเห็นล่วงหน้าว่าจะได้ exp ใกล้ไหน/ของพอไหม.
- **ไม่เพิ่ม `picked_allocation`, แตก requisition_items เป็นหลาย row** — ทำลาย 1-item-1-row ที่ requested/approved/edit พึ่งพา (เหตุผลเดียวกับ 0004).
