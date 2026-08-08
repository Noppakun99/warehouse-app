# 0003. แหล่งที่คืน (return_source) derive จากหน่วยงาน — map ER/OPD/vendor แยก ที่เหลือเป็น ward

- **Status:** Accepted
- **Date:** 2026-06-21

## Context

ฟอร์มคืนยา (`ReturnApp.jsx` → `RecordTab`) ให้ผู้ใช้เลือก **หน่วยงานที่คืน** จาก dropdown
เดียว (`SOURCE_DEPARTMENTS` = 18 หน่วยงาน + "บริษัทยา / Supplier") แล้ว **derive**
`return_source` ให้อัตโนมัติ — ผู้ใช้ไม่ได้เลือก source เอง.

ปัญหา: โค้ดเดิม derive ได้แค่ **binary** — `vendor` ถ้าเลือก "บริษัทยา", ไม่งั้น `ward` หมด.
แต่ `RETURN_SOURCES` มี 5 ค่า (`ward/or/er/opd/vendor`) และหน้าประวัติมี filter tab ครบ 5 แท็บ.
ผลคือ **tab `er`/`or`/`opd` นับได้ 0 เสมอจากข้อมูลใหม่** เพราะไม่มีทางบันทึก source
เหล่านั้นผ่านฟอร์มได้เลย — taxonomy 5 ระดับมีอยู่แต่ใช้จริงได้แค่ 2.

ต้องตัดสินว่า "หน่วยงานไหน → source ไหน" ซึ่งเป็น decision ที่กระทบ filter/badge/Excel
และทำให้ข้อมูล**ใหม่** map ต่างจากข้อมูล**เก่า** (เก่าทุกแถวที่ไม่ใช่ vendor = ward).

## Decision

**Map หน่วยงาน → source แบบ explicit เฉพาะที่ชัดเจน ที่เหลือ default เป็น `ward`:**

```
ER (ฉุกเฉิน)        → er
OPD (ผู้ป่วยนอก)     → opd
บริษัทยา / Supplier  → vendor
หน่วยงานอื่นทั้งหมด   → ward
```

ผ่าน helper `deptToSource(dept)` ตัวเดียว ใช้ร่วมกันทั้งตอนบันทึก. ไม่แยก `or` (ห้องผ่าตัด)
เพราะ dropdown หน่วยงานปัจจุบัน **ไม่มี** หน่วยงานที่เป็นห้องผ่าตัดตรงๆ (LR=ห้องคลอด ตีความเป็น
ward ตามคำยืนยัน user) — เพิ่มภายหลังได้เมื่อมีหน่วยงานที่ชัดว่าเป็น OR.

ผู้ใช้ยังเลือก dropdown **เดียว** (1 คลิก) — source ที่ derive ได้ถูกแสดงกลับเป็น badge
ให้ผู้ใช้เห็นว่าระบบจัดเป็นกลุ่มไหน (โปร่งใส ไม่ derive เงียบ).

## Consequences

- Positive: filter tab `er`/`opd` นับข้อมูลใหม่ได้จริง; badge สีถูกต้องตาม source;
  Excel/print แยกแหล่งที่คืนได้ละเอียดขึ้น; ผู้ใช้ยังกรอกแค่ 1 คลิก.
- Negative / trade-off: ข้อมูล**เก่า** (ก่อน 2026-06-21) ที่คืนจาก ER/OPD ถูกบันทึกเป็น
  `return_source = null` หรือ `ward` ไปแล้ว — จะไม่ย้อนมาเป็น `er`/`opd` (ไม่ backfill).
  ดังนั้น tab er/opd นับเฉพาะข้อมูลตั้งแต่วันนี้เป็นต้นไป. ยอมรับได้เพราะปริมาณข้อมูลเก่าน้อย
  และไม่อยากแตะ historical record.
- การเพิ่ม source ใหม่ในอนาคต (เช่น `or`) ทำได้โดยเพิ่ม mapping ใน `deptToSource` —
  จุดเดียว.

## Alternatives considered

- **คง derive แค่ ward/vendor + ลบ tab er/or/opd ทิ้ง** — ง่ายสุด ไม่มี dead filter
  แต่ทิ้งมิติการแยกหน่วยงาน (ER vs ward ปนกัน) ซึ่ง user ต้องการแยก. ปฏิเสธ.
- **แยก dropdown เป็น 2 ชั้น (เลือก source ก่อน แล้วค่อยเลือก dept)** — ชัดสุดทาง domain
  แต่เพิ่ม 1 คลิกทุกครั้งและผู้ใช้ส่วนใหญ่รู้หน่วยงานอยู่แล้ว. ปฏิเสธ — derive + แสดง
  badge กลับให้เห็น ได้ความชัดเจนใกล้เคียงโดยไม่เพิ่มขั้นตอน.
- **Backfill ข้อมูลเก่า** ให้ ER/OPD ที่บันทึกเป็น ward กลายเป็น er/opd — เสี่ยงแก้
  historical record ผิด (department string ไม่การันตีว่าตรง mapping ปัจจุบัน). ปฏิเสธ.
