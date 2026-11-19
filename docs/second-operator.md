# ผู้ทำงานคนที่ 2 — บัญชี Claude Pro อีกบัญชี บนเครื่องคลัง

ตัดสินใจ 19/11/2569 (user):
- คนที่ 2 ใช้ **เครื่องคลังเครื่องเดียวกัน** · Windows user เดียวกัน (`PRH0000484`) · ทำงาน **สลับกันคนละช่วง**
- ทำแทน user ได้ **ทุกงาน** — แก้ Excel ใน OneDrive · ใช้ token Supabase MCP · commit/push git
- ใช้ตัวตนเดิมทั้งหมด: บันทึกการทำงานรายวันไฟล์เดียว (ไม่แยกคน) · ชื่อใน audit log ของแอป/`--user` = ชื่อ user เดิม · git author `Noppakun99`
- กฎ "user สั่ง" ใน CLAUDE.md / memory ใช้กับคนที่ 2 เหมือนกัน — เรื่องที่ตัดสินแล้วไม่ถามซ้ำ · เรื่องที่ "รอหัวหน้า / ห้ามเดา" ยังรอเหมือนเดิม · งานที่ต้องรอ user สั่ง (commit · push · รัน E2E ที่เขียน DB) คนที่ 2 สั่งได้

## อะไรใช้ร่วมกันอัตโนมัติ (ผูกกับ Windows user ไม่ใช่บัญชี Claude)
memory (`~\.claude\projects\…\memory\`) · skills · hooks · CLAUDE.md · MCP `supabase` (token `claude-code` หมดอายุ 30/06/2570) · OneDrive · git credential · สคริปต์ทั้งหมด → **ไม่ต้องคัดลอกอะไร**

ไม่ตามมา: connector ฝั่ง claude.ai (Gmail · Drive · Artifact) ผูกกับบัญชี — งานคลังหลักไม่ใช้

## สลับคน
**ห้ามเปิด Claude 2 session พร้อมกัน** — Excel COM · AutoSave OneDrive · ไฟล์ git ที่ยังไม่ commit · memory `work-queue.md` จะชนกัน

คนที่กำลังจะเลิก:
1. พิมพ์ `/handoff` → Claude สรุปงานค้าง + อัปเดต memory `work-queue.md`
2. ปิด Excel ทุกไฟล์ · งานที่ค้างบนสำเนา scratchpad ต้องอยู่ใน handoff พร้อม path เต็ม (scratchpad เป็นของ session — session ใหม่ไม่รู้เอง)

คนที่มารับช่วง:
1. ใน Claude Code พิมพ์ `/logout` → `/login` → ล็อกอินบัญชี Claude ของตัวเอง (ไฟล์ล็อกอินเก็บได้ทีละบัญชี — สลับทีไร login ใหม่ทุกครั้ง)
2. พิมพ์ `/clear` แล้วพิมพ์ **`รับช่วงงานต่อ`**
3. Claude จะ: อ่าน handoff ล่าสุด + `work-queue.md` → เช็คโฟลเดอร์พักเอกสาร (`python scripts/check-complete.py`) → สรุปสถานะ รอยืนยันก่อนลงมือ

> hook หยิบ handoff ให้เองเฉพาะ `/clear` ภายใน 3 ชม. — สลับข้ามวันต้องพิมพ์ "รับช่วงงานต่อ" ให้ Claude ไปหาเอง

## สำหรับ Claude — เมื่อได้ยิน "รับช่วงงานต่อ"
1. handoff ล่าสุด (รวม `.used.md`): `ls -t "$TEMP/claude-handoff/c__Users_PRH0000484_warehouse-app/" | head -3` แล้ว Read ไฟล์บนสุด · ถ้าเก่ากว่า `work-queue.md` ให้ถือคิวเป็นหลัก
2. Read memory `work-queue.md` · รัน `python scripts/check-complete.py`
3. `git status` + `git log --oneline origin/main..HEAD` — ไฟล์ค้างไม่ commit ของคนก่อนให้ถามก่อนแตะ
4. สรุปสั้น 3 ส่วน: งานค้างในคิว · โฟลเดอร์พัก · git ค้าง → รอยืนยัน

## โควตา Claude Pro (น้อยกว่าบัญชีหลัก)
- เริ่ม session repo นี้กิน ~100K token แล้ว (CLAUDE.md + memory index) — อย่าเปิด session ใหม่ถี่โดยไม่จำเป็น
- งานประจำ (ลงบิล · ลงใบเบิก · check-complete · นำเข้าแอป) ใช้ `/model sonnet` · แก้โค้ด / scrutinize / ตรวจซ้ำเลขสำคัญใช้ Opus (เคยทดลอง Sonnet ลงบิล ผ่าน — memory `model-trial-sonnet-bill-1612439807`)
- ขึ้นเตือนใกล้ถึง limit → `/handoff` ทันที ก่อนโควตาหมดกลางงาน (หมดแล้วเขียน handoff ไม่ได้)
- โควตาหมดกลางงานเขียน Excel → ไฟล์จริงยังไม่ถูกแตะถ้าทำตาม `/excel-com` (แก้บนสำเนาก่อน) · คนถัดไปเริ่มขั้นนั้นใหม่จากสำเนา หรือทิ้งสำเนาแล้วทำใหม่
