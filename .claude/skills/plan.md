# Skill: plan

วางแผน feature ก่อนลงมือเขียนโค้ด — ลด back-and-forth และป้องกัน over-engineering

> **Karpathy Principle:** Think Before Coding + Goal-Driven Execution
> อย่า assume — surface ความไม่แน่ใจก่อนเสมอ

## เมื่อไหร่ใช้
- feature ใหม่ที่กระทบ 2+ ไฟล์
- งานที่ไม่แน่ใจว่าควรแก้ที่ไหน
- เมื่อ user พูดถึง requirement แบบ high-level

---

## ขั้นตอน

### 0. Think Before Coding — ตอบ 3 คำถามนี้ก่อน

**ก่อนแตะไฟล์ใดๆ ต้องรู้:**

1. **สิ่งที่ยังไม่ชัด** — มีส่วนไหนใน request ที่ interpret ได้หลายแบบ?
   - ถ้ามี → บอก user ก่อน "ข้อนี้หมายถึง A หรือ B?"
   - ถ้าไม่มี → บอก assumption ที่ใช้ชัดๆ

2. **Simplicity check** — วิธีที่ง่ายที่สุดที่ยังตอบ requirement คืออะไร?
   - ถ้าทำได้ใน 1 ไฟล์ → ไม่สร้างไฟล์ใหม่
   - ถ้าทำได้ใน 20 บรรทัด → ไม่เขียน abstraction

3. **Surgical scope** — อะไรที่ **ไม่ทำ** ใน task นี้?
   - ระบุชัด เพื่อป้องกัน scope creep ระหว่างทำ

### 1. อ่านไฟล์ที่เกี่ยวข้องก่อน
- อ่าน component ที่จะแก้ (Read ก่อน Edit เสมอ)
- อ่าน db.js ถ้ามีการเปลี่ยน data layer
- เช็ค skill ที่มีใน `.claude/skills/` ว่ามี pattern ที่ตรงไหม

### 2. ตอบคำถาม 4 ข้อ (What / Where / Risk / Scope)

1. **What** — ผลลัพธ์ที่วัดได้คืออะไร? (ไม่ใช่ "ทำให้ใช้ได้" — ต้องระบุ success criteria)
2. **Where** — แก้ไฟล์ไหน? เพิ่มไฟล์ใหม่ไหม?
3. **Risk** — มีอะไรที่อาจพัง? (side effect, Supabase schema, 1000-row limit)
4. **Scope** — อะไรที่ **ไม่ทำ** ใน task นี้?

### 3. แสดงแผนให้ user confirm ก่อน

รูปแบบที่ต้องใช้:
```
## แผน: [ชื่อ feature]

**Assumptions:**
- ข้อที่ยังไม่ชัดและตีความว่า...
- ถ้า assumption ผิด โปรดบอกก่อน

**วิธีที่เลือก:** [อธิบาย 1 บรรทัดว่าทำไมถึงเลือกวิธีนี้ ไม่ใช่วิธีอื่น]

**ไฟล์ที่แก้:**
- `src/XxxApp.jsx` — [สิ่งที่เปลี่ยน]
- `src/lib/db.js` — [function ที่เพิ่ม]

**ขั้นตอน + verify:**
1. [Step] → verify: [วิธีตรวจสอบว่า step นี้สำเร็จ]
2. [Step] → verify: [วิธีตรวจสอบ]
3. [Step] → verify: lint ผ่าน / build ผ่าน

**ไม่รวมใน task นี้:**
- [X] ไม่แก้ component อื่นที่ไม่เกี่ยว
- [X] ไม่เพิ่ม feature Y (ทำแยกถ้าต้องการ)

รอ confirm ก่อนลงมือ
```

---

## Surgical Changes — กฎระหว่างทำ

เมื่อลงมือแล้ว ให้ยึดหลักนี้:
- **แตะเฉพาะสิ่งที่ถูกขอ** — ไม่ refactor โค้ดข้างเคียงที่ไม่เกี่ยว
- **match style เดิม** — ถ้าโค้ดเดิมใช้ `let` → ไม่เปลี่ยนเป็น `const` โดยไม่จำเป็น
- **ลบเฉพาะ dead code ที่ "ตัวเองสร้าง"** — ถ้าเจอ dead code เก่า → mention แต่อย่าลบ
- **ทุก line ที่เปลี่ยน ต้อง trace กลับไปหา request ได้**

---

## Skills vs Subagents — ตัดสินใจแบบนี้

| สถานการณ์ | ใช้อะไร |
|-----------|---------|
| มี pattern ที่ทำซ้ำ (print view, search bar, excel) | **Skill** — อ่าน skill file แล้วทำตาม |
| งานค้นหาข้อมูล / explore codebase กว้างๆ | **Subagent (Explore)** |
| งาน 2 อย่างที่ทำพร้อมกันได้ (ไม่ depend กัน) | **Parallel Agent calls** |
| งานที่ต้องวางแผน architecture | **Subagent (Plan)** |
| แก้ไฟล์ที่รู้ path อยู่แล้ว | **ทำเอง** — ไม่ต้องใช้ agent |

## Parallelization — เมื่อไหร่สั่งพร้อมกัน

**ทำพร้อมกันได้** (independent):
- อ่านหลายไฟล์ → `Read` หลายตัวใน message เดียว
- ค้นหาหลาย pattern → `Grep` + `Glob` พร้อมกัน
- Build + เช็ค schema DB → `Bash(build)` + `execute_sql` พร้อมกัน

**ต้องทำลำดับ** (dependent):
- อ่านไฟล์ก่อน → แล้วค่อย Edit
- รัน lint ก่อน → แล้วค่อย build
- สร้าง DB function → แล้วค่อย wire ใน component
