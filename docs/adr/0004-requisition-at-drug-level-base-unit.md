# 0004. เบิกยาระดับ "ยา" ในหน่วยย่อยสุด — ระบบจัดสรร lot ให้เอง

- **Status:** Accepted (ส่วน "ผู้เบิกไม่เห็น lot" ถูก refine โดย [ADR-0005](0005-lot-allocation-preview-and-pick-record.md) — ผู้เบิกเห็น lot allocation แบบ preview ตอนขอ)
- **Date:** 2026-06-21

## Context

ผู้เบิกในระบบเดิมเป็น **ตัวแทนหน่วยงานภายใน รพ.** (ward, ER, OPD, ห้องยา) ที่ต้องการเติมยาในหน่วยงาน — เขาคิดเป็น "ยา + จำนวน" ไม่ใช่ "lot".

หน้าค้นหา/ตะกร้าเดิม (`RequisitionApp.jsx` flow `search → cart`) บังคับให้ผู้เบิกทำงานระดับ **lot**:

- การ group ใน `DrugSearch` push ทุก lot เข้าผลลัพธ์ รวม lot ที่ `qty=0` → ผู้เบิกเห็นแถว `จำนวน: 0×500เม็ด` ที่กดไม่ได้ ปนกับ lot ที่มีของ (พบจากภาพจริง: Acetaminophen มี 3 lot, 2 lot เป็น 0 และ packsize ต่างกัน 500/1000 เม็ด).
- ผู้เบิกต้องเลือก lot เอง + เห็น exp/บริษัท/ราคา/บิล — ทั้งที่ FEFO เป็นการตัดสินของคลังตอน picking อยู่แล้ว (`PickingModal` auto-select lot FEFO ที่ `fetchInventoryByCodes`).
- จำนวนที่ขอ (`requested_qty`) ผูกกับ **หน่วยของ lot** ซึ่งฝัง packsize ไว้ใน label ("1000เม็ด" → 10 = 10,000 เม็ด). lot คนละ packsize จึงรวมยอดข้ามกันไม่ได้ตรงๆ.

ผลคือ conceptual mismatch: ผู้เบิกถูกบังคับเข้าใจ "lot/packsize" ทั้งที่เจตนาจริงคือ "ขอพารา 5,000 เม็ด". ระบบยังไม่มีใบเบิกเดิมในฐานข้อมูล (เริ่มสดได้) — ยืนยัน `SELECT count(*) FROM requisitions = 0` ก่อนเริ่ม.

ข้อจำกัดเชิงโครงสร้าง: `requisition_items` เก็บ `picked_lot/picked_exp/picked_qty` เป็น field เดี่ยวต่อ 1 row (1 รายการ = 1 row) — รองรับ lot เดียวต่อรายการ.

## Decision

เราจะให้ผู้เบิก **เบิกที่ระดับ "ยา" (รหัสยา) ในหน่วยย่อยสุดที่จ่ายจริง** (เม็ด/ขวด/หลอด/amp) ไม่ใช่ระดับ lot และไม่ใช่หน่วย pack:

1. **หน้าค้นหา/ตะกร้าแสดงระดับยา** — 1 รหัสยา = 1 การ์ด พร้อม **คงเหลือรวม** = `Σ (lot.qty × packSize(lot.unit))` แปลงเป็นหน่วยย่อยสุด. ผู้เบิกไม่เห็น lot. คงเหลือคำนวณสดฝั่ง client ผ่าน `src/lib/unitParser.js` (promote จากไฟล์ test เดิม) — ไม่เก็บเป็น column ใน DB.
2. **`requested_qty` นับเป็นหน่วยย่อยสุดเสมอ** — ไม่ผูกกับ packsize ของ lot.
3. **ระบบจัดสรร lot ให้เอง (FEFO, split ข้ามหลาย lot)** ตอน picking — เก็บผลใน column ใหม่ `requisition_items.picked_allocation` (jsonb: `[{lot, exp, qty}]`). โครงสร้าง 1-item-1-row คงเดิม; allocation เป็น nested data ใต้ item.
4. **ไม่หักสต็อกอัตโนมัติ** — allocation บันทึกแผนการจัด แต่ตัดสต็อกผ่าน Excel แยก (คงหลักการ picking workflow เดิม; การหักอัตโนมัติเป็น decision คนละเรื่อง).
5. **Reservation เป็นระดับรหัสยา** — การหัก "ของที่ใบ pending/approved จองไว้" ออกจาก[[คงเหลือรวม (ระดับยา)]] รวม `requested_qty` (หน่วยย่อยสุด) **ต่อ `drug_code`** ไม่ใช่ต่อ lot (เพราะใบเบิกไม่มี lot แล้ว). ป้องกัน oversell เมื่อหลายหน่วยงานขอยาตัวเดียวกันพร้อมกัน.
6. **Partial allocation แจ้งเตือน ไม่ block** — เมื่อ auto-split FEFO จัดได้ไม่ครบจำนวนที่ขอ (lot รวมไม่พอ ณ เวลา picking) ระบบจัดเท่าที่มีและ **flag ส่วนที่ขาดให้ staff เห็นว่า "ของไม่พอเบิก"** — ไม่ปล่อยเงียบ ไม่ block ทั้งใบ.

## Consequences

- **Positive:** ผู้เบิกเข้าใจง่ายขึ้นมาก — เห็น "ยา + คงเหลือ + จำนวนที่ขอ" เท่านั้น; lot ที่ 0/หมดอายุหายจากสายตา; ไม่ต้องรู้จัก packsize.
- **Positive:** คงเหลือรวมข้ามหน่วยได้ถูกต้องตามกฎโดเมน (แปลงเป็นหน่วยย่อยก่อนบวก).
- **Positive:** ขอ X เม็ดที่เกิน 1 lot ได้ — ระบบ split FEFO ให้ ไม่ติดเพดาน lot เดียว.
- **Negative / trade-off:** `requested_qty` เปลี่ยนความหมาย (pack → หน่วยย่อยสุด) — ยอมรับได้เพราะ **ไม่มีใบเบิกเดิม**; ถ้ามีข้อมูลเก่าต้องกลับมาทำ cutoff/backfill.
- **Negative / trade-off:** ทุก consumer ของ picking (verify/print/Excel) ต้องอ่าน `picked_allocation` (array) แทน field เดี่ยว — เพิ่ม loop.
- **Negative / trade-off:** ความถูกต้องของคงเหลือขึ้นกับ `parseUnit` แกะ packsize จาก label ได้ — label ที่ไม่มีตัวเลข ("amp") ถือว่า qty เป็นหน่วยย่อยอยู่แล้ว (ถูกต้องสำหรับ amp/vial; เสี่ยงเฉพาะ label "เม็ด" เปล่าที่จริงนับเป็น pack — พบน้อย).
- **Negative / trade-off:** reservation ต้อง rework จาก per-lot → per-drug-code (โค้ดจองเดิมทั้งหมด key ด้วย lot: `reservedMap`, realtime subscribe, re-validate ตอน submit) — เป็นงานบังคับใน scope หลัก ไม่ใช่ของแถม.
- **Assumption:** ถือว่าหน่วยย่อยสุด "แตกจ่ายได้" (เม็ดแกะแผง/กล่องได้) — ผู้เบิกขอ 5,001 เม็ดจากกล่อง 1000 ได้. ถ้าภายหลังมียา pack-only ที่จ่ายเป็นกล่องเท่านั้น ต้องเพิ่ม constraint แยก.
- **Follow-ups / risks:** verify `requisitions = 0` ก่อนเริ่ม; auto-split ต้องเทสกรณี lot แรกไม่พอ + ยาฉีด/น้ำที่ packSize=null; การหักสต็อกอัตโนมัติเป็น ADR แยกในอนาคต.

## Alternatives considered

- **คงระดับ lot แค่ซ่อน lot ที่ qty=0** — surgical (~3 บรรทัด) แต่ไม่แก้ต้นเหตุ: ผู้เบิกยังต้องเลือก lot + เข้าใจ packsize. ปะแผล ไม่แก้ conceptual mismatch.
- **เบิกเป็น "pack/กล่อง"** — ผู้เบิกหน่วยงานไม่ได้คิดเป็นกล่อง; lot คนละ packsize ทำให้ "10 กล่อง" กำกวม (กล่องของ 500 หรือ 1000?).
- **แตก `requisition_items` เป็นหลาย row ตอน split (S2)** — ทำลายโครงสร้าง 1-item-1-row ที่ requested/approved/edit/history พึ่งพา; ประวัติ/edit modal พัง.
- **ตารางใหม่ `requisition_item_picks` (S3)** — normalize ถูกหลัก แต่ join ทุกที่ + migration ใหญ่เกินจำเป็นสำหรับ use case นี้.
- **เก็บ `qty_base` เป็น column ใน inventory (5B)** — ค่านี้ derive ได้จาก qty×packSize; เก็บแยกต้อง maintain sync และขัดหลักที่ packsize ควร derive จาก label.
