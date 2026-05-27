# Skill: karpathy-checklist

Quick-reference checklist ก่อนลงมือเขียนโค้ด — ปรับจาก Karpathy Guidelines ให้เหมาะกับ warehouse-app

> ใช้ก่อนทุก task ที่ไม่ trivial (กระทบ 2+ ไฟล์ หรือ user request ไม่ชัด)

---

## ✅ Checklist 4 ข้อ (ทำตามลำดับ)

### 1. Think Before Coding — หยุดคิดก่อน

- [ ] **Assumptions ที่ยังไม่ชัด** — มีส่วนไหนที่ interpret ได้ 2 แบบ?
  - มี → ถาม user ก่อน: "คำนี้หมายถึง A หรือ B?"
  - ไม่มี → state assumption ชัดๆ ใน response

- [ ] **อ่านโค้ดจริงก่อน** — ไม่ assume จากชื่อไฟล์/function (CLAUDE.md rule)
  - ใช้ `Read` ดู file จริง ก่อนบอกว่า "มี/ไม่มี"

### 2. Simplicity First — วิธีที่ง่ายที่สุดคืออะไร?

- [ ] **ทำได้ใน 1 ไฟล์ไหม?** → ถ้าใช่ ไม่สร้างไฟล์ใหม่
- [ ] **ต้องการ DB column จริงไหม?** → ถ้าแค่ CSV → ใช้ `add-csv-column` แทน
- [ ] **50 บรรทัดพอไหม?** → ถ้าใช่ ไม่สร้าง abstraction/helper ใหม่
- [ ] **มี pattern ใน `.claude/skills/` แล้วไหม?** → ถ้าใช่ ใช้ skill แทนเขียนใหม่

**Project-specific simplicity rules:**
- ต้องการ table → ใช้ pattern จาก `monthly-stats-table` skill
- ต้องการ search → ใช้ `DrugSearchBar` ที่มีอยู่แล้ว
- ต้องการ print → ใช้ `new-print` skill (Blob URL)
- ต้องการ Excel → ใช้ `excel-export` skill

### 3. Surgical Changes — แตะเฉพาะที่ถูกขอ

- [ ] **บอก scope ที่ไม่ทำ** — ระบุใน response ก่อนลงมือ:
  ```
  ไม่รวมใน task นี้:
  - ไม่แก้ [X] (ทำแยกถ้าต้องการ)
  - ไม่ refactor [Y] ที่ไม่เกี่ยวข้อง
  ```

- [ ] **Match style เดิม** — ดูโค้ดรอบข้างก่อนตัดสินใจ style
- [ ] **ลบเฉพาะ dead code ที่ตัวเองสร้าง** — dead code เก่า → mention แต่ไม่ลบ
- [ ] **ทุก line ที่เปลี่ยน trace กลับหา request ได้**

**Project-specific surgical rules (จาก CLAUDE.md):**
- ไม่แก้ component นอกจากที่ถูกขอ
- ไม่เพิ่ม feature ที่ไม่ได้ร้องขอ
- ไม่เปลี่ยน UI text เป็นภาษาอังกฤษ

### 4. Goal-Driven Execution — กำหนด success criteria

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
