# Skill: plan

วางแผน feature ก่อนลงมือเขียนโค้ด — ลด back-and-forth และป้องกัน over-engineering

## เมื่อไหร่ใช้
- feature ใหม่ที่กระทบ 2+ ไฟล์
- งานที่ไม่แน่ใจว่าควรแก้ที่ไหน
- เมื่อ user พูดถึง requirement แบบ high-level

## ขั้นตอน

### 1. อ่านไฟล์ที่เกี่ยวข้องก่อน
- อ่าน component ที่จะแก้
- อ่าน db.js ถ้ามีการเปลี่ยน data layer
- เช็ค skill ที่มีใน `.claude/skills/` ว่ามี pattern ที่ตรงไหม

### 2. ตอบคำถาม 4 ข้อนี้ก่อนเขียนโค้ด
1. **What** — ต้องการผลลัพธ์อะไร? (ระบุให้ชัด)
2. **Where** — แก้ไฟล์ไหน? เพิ่มไฟล์ใหม่ไหม?
3. **Risk** — มีอะไรที่อาจพัง? (side effect)
4. **Scope** — อะไรที่ **ไม่ทำ** ใน task นี้?

### 3. แสดงแผนให้ user confirm ก่อน

รูปแบบ:
```
## แผน: [ชื่อ feature]

**ไฟล์ที่แก้:**
- `src/XxxApp.jsx` — [สิ่งที่เปลี่ยน]
- `src/lib/db.js` — [function ที่เพิ่ม]

**ขั้นตอน:**
1. ...
2. ...

**ไม่รวมใน task นี้:** ...

รอ confirm ก่อนลงมือ
```

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
