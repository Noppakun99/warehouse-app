# 0001. คำนวณ Reorder Analysis ในแอพ แทนการ import ไฟล์ที่คำนวณเสร็จ

- **Status:** Accepted
- **Date:** 2026-06-06

## Context

ทีมเภสัชมีไฟล์ Excel "วิเคราะห์สั่งซื้อ" ที่ใช้ตัดสินใจสั่งซื้อยา (~444 รายการ). ไฟล์นี้เป็น
*derived view* คำนวณจาก 3 ชุดข้อมูลต้นทาง:

- ยอดคงคลัง (sheet inventory)
- ยอดเบิก (sheet เบิก)
- การรับเข้า (ไฟล์รับยา / Master)

ทั้ง 3 ชุดนี้ตรงกับตารางที่แอพถืออยู่แล้ว: `inventory`, `dispense_logs`, `receive_logs`.
สูตรคำนวณ (Safety Stock / ROP / สถานะ / จำนวนสั่ง) ถูก implement ไว้ใน `src/lib/reorder.js`
และผ่าน golden test ตรงกับ Excel แล้ว.

เป้าหมายคือทำให้แอพออก "คำแนะนำสั่งซื้อ" ที่นำไปสร้าง PR/PO ได้จริง. มี 2 ทางเลือกที่ขัดกัน:
นำเข้าไฟล์ที่คำนวณเสร็จมาแสดง หรือคำนวณใหม่ในแอพ. ไฟล์ Excel ฝังดุลยพินิจมนุษย์บางส่วน
(การตัดเดือนยอดผิดปกติ, ข้อยกเว้นยา acute/IV, การเลือกหน่วย/บริษัทจากบิลล่าสุด) ซึ่งบางส่วน
ยังไม่ถูก encode ในแอพ. ความสดของข้อมูลและการมี source of truth เดียวเป็นข้อจำกัดสำคัญ.

## Decision

เราจะ **คำนวณ Reorder Analysis ใหม่ภายในแอพ** จาก 3 ตารางต้นทาง (`inventory`, `dispense_logs`,
`receive_logs`) ร่วมกับชั้น policy บางๆ (`drug_reorder_config` เก็บ risk group / exclude status /
override). การ upload ไฟล์ Excel ที่คำนวณเสร็จจะใช้เป็น **อินพุตสำหรับกระทบยอด (reconciliation)
เท่านั้น — ไม่เคยเป็นแหล่งข้อมูล**.

## Consequences

- Positive: source of truth เดียว (DB ของแอพ); ข้อมูล live/สด; ไม่ต้อง maintain ไฟล์วิเคราะห์ด้วยมือ;
  reuse engine ที่ตรง Excel อยู่แล้ว (`reorder.js`) และ mechanism หน่วย/packsize ที่มีใน `db.js`
  (`parseUnitFactor` + latest-unit จาก `receive_logs`).
- Negative / trade-off: ต้อง replicate รายละเอียดของสเปกให้ครบ (หน้าต่างเฉลี่ย, packsize, FEFO,
  ราคา/บริษัทจากบิลล่าสุด); ส่วนที่เป็นดุลยพินิจมนุษย์ (BR7 acute/IV, การเลือกเดือนผิดปกติ) ต้อง encode
  หรือเลื่อนไป Phase 2 → ยาบางตัวจะคลาดเคลื่อนชั่วคราว; ความถูกต้องขึ้นกับว่า 3 ตารางสดเท่าไฟล์ Excel.
- Follow-ups / risks: เพิ่มหน้า reconciliation (แอพ-คำนวณ vs Excel-upload รายแถว) เพื่อสร้างความเชื่อมั่น
  ก่อน retire Excel; Phase 2 เพิ่มธง acute/IV ใน config (BR7); ต้องมั่นใจว่า CSV import ทำให้ 3 ตาราง
  ทันสมัยเสมอ.

## Alternatives considered

- **Import ไฟล์ "วิเคราะห์สั่งซื้อ" เป็นแหล่งข้อมูล** — การันตีตรง Excel 100% และได้ดุลยพินิจมนุษย์ฟรี
  แต่สร้าง source of truth ที่ 2 ที่ drift จาก DB, สดเท่าครั้งล่าสุดที่ upload, และลดแอพเหลือแค่ viewer.
  ปฏิเสธในฐานะโมเดลถาวร (เก็บไว้เป็นอินพุต reconcile เท่านั้น).
- **คง `drug_reorder_config` แบบ manual สำหรับราคา/บริษัท** — ง่าย แต่ค่าจะล้าสมัยและทำให้ออก PO ผิด.
  ปฏิเสธ หันไป derive ค่าสังเกต (ราคา/บริษัท/วันรับ/หน่วย) จาก `receive_logs` บิลล่าสุดแทน.
