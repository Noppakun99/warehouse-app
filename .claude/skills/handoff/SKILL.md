---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS - not the current workspace.

**เมื่อไรควรเรียก**: เมื่อ context window ใช้ไปราว 25% (เช่น ~250K จาก 1M) — อย่ารอ autocompact เพราะมันเริ่มทำงานช้าเกินไป คุณภาพคำตอบจะตกไปก่อนแล้ว (context rot)

**โครงที่ต้องมีครบ** — ขาดข้อไหน session ถัดไปจะต้องไล่ถามใหม่:

1. **เริ่มจากไหน** — โจทย์ตั้งต้นของ session นี้
2. **ตัดสินใจอะไรไปแล้ว** — และเหตุผล (ที่ยังไม่ได้ลง ADR)
3. **ส่งมอบอะไรไปแล้ว** — ที่ commit/แก้เสร็จจริง
4. **ไฟล์สำคัญสำหรับรอบหน้า** — path + ทำอะไรค้างไว้ในไฟล์นั้น
5. **สถานะที่ยังรันอยู่** — background task, branch ที่ยืนอยู่, migration ที่ยังไม่ได้รัน
6. **verify ที่ยังไม่ได้ทำ** — lint/test ที่ควรรันแต่ยังไม่ได้รัน
7. **คำถามเปิด** — ที่รอ user เคาะ
8. **เริ่มต่อตรงไหน** — ขั้นถัดไปที่เป็นรูปธรรม

Include a "suggested skills" section in the document, which suggests skills that the agent should invoke.

Do not duplicate content already captured in other artifacts (PRDs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.