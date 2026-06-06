---
name: karpathy-checklist
description: Quick-check 4 ข้อก่อนลงมือเขียน/รีวิว/refactor โค้ด — Think / Simple / Surgical / Goal-Driven ปรับเฉพาะ warehouse-app เพื่อเลี่ยงกับดัก LLM ที่พบบ่อย (overcomplicate, assume เงียบๆ, แก้เกิน, ไม่ verify)
license: MIT
---

# Skill: karpathy-checklist

Quick-reference checklist ก่อนลงมือเขียนโค้ด — ปรับจาก [Karpathy Guidelines](https://x.com/karpathy/status/2015883857489522876) ให้เหมาะกับ warehouse-app

> ใช้ก่อนทุก task ที่ไม่ trivial (กระทบ 2+ ไฟล์ หรือ user request ไม่ชัด)
>
> **Tradeoff:** guideline ชุดนี้เน้น "รอบคอบ" มากกว่า "เร็ว" — task ที่ trivial จริงๆ ใช้วิจารณญาณข้ามได้ (ดู Fast-path)

---

## ✅ Checklist 4 ข้อ (ทำตามลำดับ)

### 1. Think Before Coding — หยุดคิดก่อน

**อย่า assume เงียบๆ อย่าซ่อนความไม่แน่ใจ surface tradeoff ออกมา**

- [ ] **Assumptions ที่ยังไม่ชัด** — มีส่วนไหนที่ interpret ได้ 2 แบบ?
  - มี → ถาม user ก่อน: "คำนี้หมายถึง A หรือ B?" (อย่าเลือกเองเงียบๆ)
  - ไม่มี → state assumption ชัดๆ ใน response
- [ ] **มีวิธีที่ง่ายกว่าไหม?** → ถ้ามี พูดออกมา push back ได้ถ้าสมควร
- [ ] **อ่านโค้ดจริงก่อน** — ไม่ assume จากชื่อไฟล์/function (CLAUDE.md rule)
  - ใช้ `Read` ดู file จริง ก่อนบอกว่า "มี/ไม่มี"
- [ ] **งงตรงไหน → หยุด** — บอกว่างงอะไร แล้วถาม อย่าเดาต่อ

### 2. Simplicity First — วิธีที่ง่ายที่สุดคืออะไร?

**Minimum code ที่ตอบโจทย์จริง — ไม่มีอะไร speculative**

- [ ] **ทำได้ใน 1 ไฟล์ไหม?** → ถ้าใช่ ไม่สร้างไฟล์ใหม่
- [ ] **ต้องการ DB column จริงไหม?** → ถ้าแค่ CSV → ใช้ `add-csv-column` แทน
- [ ] **50 บรรทัดพอไหม?** → ถ้าเขียน 200 แล้วย่อเหลือ 50 ได้ → เขียนใหม่
- [ ] **ไม่ทำเกินที่ขอ** — ไม่เพิ่ม feature, ไม่สร้าง abstraction สำหรับโค้ดที่ใช้ครั้งเดียว, ไม่ใส่ "flexibility/configurability" ที่ไม่มีใครขอ
- [ ] **ไม่ใส่ error handling สำหรับ case ที่เป็นไปไม่ได้**
- [ ] **มี pattern ใน `.claude/skills/` แล้วไหม?** → ถ้าใช่ ใช้ skill แทนเขียนใหม่

> เช็คตัวเอง: "senior engineer จะบอกว่าอันนี้ over-complicate ไหม?" ถ้าใช่ → ย่อ

**Project-specific simplicity rules:**
- ต้องการ table → ใช้ pattern จาก `monthly-stats-table` skill
- ต้องการ search → ใช้ `DrugSearchBar` ที่มีอยู่แล้ว
- ต้องการ print → ใช้ `new-print` skill (Blob URL)
- ต้องการ Excel → ใช้ `excel-export` skill

### 3. Surgical Changes — แตะเฉพาะที่ถูกขอ

**แตะเฉพาะที่จำเป็น เก็บกวาดเฉพาะที่ตัวเองทำเลอะ**

- [ ] **บอก scope ที่ไม่ทำ** — ระบุใน response ก่อนลงมือ:
  ```
  ไม่รวมใน task นี้:
  - ไม่แก้ [X] (ทำแยกถ้าต้องการ)
  - ไม่ refactor [Y] ที่ไม่เกี่ยวข้อง
  ```
- [ ] **ไม่ "ปรับปรุง" โค้ด/comment/format รอบข้างที่ไม่ได้พัง**
- [ ] **Match style เดิม** — แม้จะมีสไตล์ที่ตัวเองชอบกว่า ก็ทำตามของเดิม
- [ ] **ลบเฉพาะ orphan ที่ตัวเองสร้าง** — import/var/function ที่กลายเป็น unused เพราะ change ของตัวเอง → ลบได้; dead code เก่า → mention แต่ไม่ลบ
- [ ] **ทุก line ที่เปลี่ยน trace กลับหา request ได้**

**Project-specific surgical rules (จาก CLAUDE.md):**
- ไม่แก้ component นอกจากที่ถูกขอ
- ไม่เพิ่ม feature ที่ไม่ได้ร้องขอ
- ไม่เปลี่ยน UI text เป็นภาษาอังกฤษ

### 4. Goal-Driven Execution — กำหนด success criteria แล้ว loop จนผ่าน

**แปลง task ให้เป็นเป้าหมายที่ verify ได้ แล้ว loop จนยืนยันได้**

- "Add validation" → เขียน test สำหรับ input ที่ผิด แล้วทำให้ผ่าน
- "Fix the bug" → เขียน test ที่ reproduce บั๊กก่อน แล้วทำให้ผ่าน
- "Refactor X" → ยืนยัน test ผ่านทั้งก่อนและหลัง

ทุก task ต้องมี verify step ชัดๆ:

| Task | Success Criteria |
|------|----------------|
| แก้บั๊ก | reproduce ได้ก่อน → แก้ → reproduce ไม่ได้แล้ว |
| เพิ่ม feature | `npm run lint` ผ่าน + build ผ่าน |
| แก้ UI | `npm run dev` แล้วดูใน browser |
| เพิ่ม DB column | SQL รันใน Dashboard + import CSV ใหม่ + UI แสดงค่า |
| Export Excel | ไฟล์ .xlsx มี column ครบ + audit log ถูกบันทึก |

**Multi-step template:**
```
1. [Step] → verify: [วัดผลว่าสำเร็จอย่างไร]
2. [Step] → verify: [วัดผล]
3. [Step] → verify: lint ผ่าน
```

> success criteria แข็งแรง → loop เองได้; criteria อ่อน ("ทำให้มันใช้ได้") → ต้องกลับมาถาม user เรื่อยๆ

---

## ⚡ Fast-path (task trivial → ข้ามได้)

ถ้าทุกอย่างต่อไปนี้เป็นจริง → ไม่ต้องทำ checklist เต็ม:
- แก้ไฟล์เดียว < 10 บรรทัด
- ไม่มีส่วนไหน ambiguous
- ไม่กระทบ DB หรือ auth

แค่ทำ: Read → Edit → lint → รายงานผล

---

## Project-Specific Traps (อย่าลืม)

| สถานการณ์ | กับดัก | วิธีหลีกเลี่ยง |
|-----------|--------|--------------|
| เพิ่ม date input | ใช้ `<input type="date">` ตรงๆ | ต้องใช้ `ThaiDateInput` / `IsoDateInput` เสมอ |
| query Supabase | ได้แค่ 1000 rows → ข้อมูลไม่ครบ | ใช้ `fetchAllRows` ก่อนสรุป |
| print view | ใช้ `document.write()` | ต้องใช้ Blob URL เสมอ |
| export Excel | ลืมส่ง `auth` | `exportToExcel(..., auth)` — ดู excel-export skill |
| เพิ่ม audit action | ลืม sync 3 ที่ | `NOTIF_LABELS` + `NOTIFY_ACTIONS` + `ACTION_LABELS` |
| สแกนบิล (ReceiveLog) | ใช้ `insertReceiveRows` | ต้องใช้ `insertScannedBillRows` (APPEND ไม่ DELETE ALL) |