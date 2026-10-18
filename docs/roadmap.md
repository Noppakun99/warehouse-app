# Roadmap — แผนพัฒนาที่ยังไม่ได้ทำ

## ระบบสั่งยา (Reorder Analysis) — ✅ ปิดแล้ว ไม่ต้องทำต่อ

> ⛔ **อย่ารื้อแผน "import Excel มาแทนการคำนวณใน app" ขึ้นมาใหม่**
> [ADR-0001](./adr/0001-reorder-recompute-vs-import.md) (Accepted 2026-06-06) ปฏิเสธโมเดลนั้นถาวร —
> แอปคำนวณเองจาก `inventory` + `dispense_logs` + `receive_logs` ส่วนไฟล์ Excel เป็น
> **อินพุตสำหรับกระทบยอด (reconcile) เท่านั้น ไม่เคยเป็นแหล่งข้อมูล**

**ที่ทำไปแล้วตาม ADR**
- UI อยู่ที่ [src/ReorderApp.jsx](../src/ReorderApp.jsx) route จาก `AppRoot.jsx` — **ไม่ใช่** `App.jsx → view === 'order'` อีกแล้ว
- Tab "เทียบกับ Excel" (`ReconcileTab`) + `reconcileRows()` ใน [src/lib/reorder.js](../src/lib/reorder.js)
- [src/lib/reorderSheet.js](../src/lib/reorderSheet.js) — parser ชีท "วิเคราะห์สั่งซื้อ" (import แค่ VEN + exclude_status)
- `orderedItems` ย้ายจาก localStorage → ตาราง `reorder_orders` แล้ว (2026-07-03)
- สูตรปรับให้ตรง Excel แล้ว: `SS_BASE_DAYS = 30` (ไม่มี cap) · `ORDER_FACTOR = 2.3` คงที่ ·
  `avgDay = ROUND(avgMonth/30, 4)` ตรวจกับของจริงแล้ว (Lidocaine 38/55)

**กับดักที่เคยเกิดจริง — อ่านก่อนลงมือ**
branch `wip/reorder-excel-plan` (commit `d1d522d`) เขียนโค้ด 646 บรรทัดตามแผนเก่าในไฟล์นี้
ก่อนจะพบว่า ADR-0001 ปฏิเสธไว้ตั้งแต่ 4 เดือนก่อน — เพราะ branch นั้นแตกจาก base ที่เก่ากว่า ADR
เก็บไว้บน remote เป็นหลักฐาน **ไม่ merge** ถ้าจะหยิบอะไรมาใช้ ให้หยิบเฉพาะตัว parse
(`parseAnalysisSheet`, `monthHeaderToYm` — main ยังไม่มี) **ไม่ใช่สถาปัตยกรรม**

> บทเรียน: ก่อนเริ่มงานตาม roadmap ให้เช็ค `docs/adr/` ก่อนเสมอว่ามี ADR ที่ตัดสินเรื่องนั้นไปแล้วหรือยัง

## ReceiveLogApp.handleImport — ย้ายไป db.js

ดู [docs/schema.md#receive_logs--upload-สองที่](./schema.md)
- ปัจจุบัน ReceiveLogApp.handleImport เรียก supabase โดยตรง (ละเมิด convention)
- มีฟีเจอร์เพิ่ม (preview rows, warnRows, drug_swap_policy backfill) ที่ db.js ไม่มี
- ย้ายเข้า `importReceiveLogs()` ใน db.js เมื่อมีเวลา

## ปิดช่อง anon key เข้าถึง DB เต็มสิทธิ์

ดู [ADR-0016](./adr/0016-anon-key-full-db-access.md) — บริบท ตัวเลขที่วัดได้ และการเปรียบเทียบทางเลือกทั้งหมดอยู่ที่นั่น

**สรุปปัญหา**: ทั้ง 21 ตารางของแอปมี policy `FOR ALL USING(true)` → ใครมี `VITE_SUPABASE_ANON_KEY` (อยู่ใน bundle) อ่าน/แก้/ลบข้อมูลได้ทั้งหมดโดยไม่ต้อง login รวม `password_hash` ใน `app_users` ที่เป็น SHA-256 ไม่มี salt

**ก้าวแรกที่แนะนำ (ทางเลือก A ใน ADR)** — ขอบเขตจำกัด ไม่แตะ sub-app อื่น:
1. Edge Function สำหรับ login / สมัคร / เปลี่ยนรหัสผ่าน (ถือ `service_role`)
2. แก้ `loginUser` / `registerUser` / `UserManagementApp` ให้เรียก function แทน query ตรง
3. `REVOKE ALL ON app_users FROM anon` แล้วทดสอบว่า login ยังผ่าน

**ทำไปแล้ว** — ปิด RLS ตาราง backup 2 ตัว (`_bak_inventory_ss_20260704`, `_bak_inventory_lot_20260731`) 2026-08-13

**ยังไม่ต้องทำ** — รอ user ตัดสินใจว่าจะเดินทาง A / B / C

## เครื่องมือ Claude Code ใน repo (`.claude/`)

> ที่มา: audit เทียบกับ [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
> ซึ่งระบุว่า CLAUDE.md โหลดทุก session จึงควรสั้นและเป็น **index ชี้ไปที่อื่น** ส่วนความรู้ที่ใช้
> เป็นบางครั้งให้อยู่ใน **skill** เพราะโหลดเมื่อเรียกเท่านั้น (วัดแล้ว: skill 20 ตัวโหลดจริงแค่
> frontmatter 5,166 จาก 116,159 ตัวอักษร = ประหยัด 96%)

**1. ย้าย global skill เข้า repo** — ⚠️ ต้องทำบนเครื่องที่มี skill อยู่
CLAUDE.md อ้างถึง skill 6 ตัว แต่ **5 ตัวเป็น global ส่วนตัว ไม่ได้เดินทางไปกับ repo**:
`upgrade-month-v3` (อ้าง 2 ครั้ง) · `verify-4sheet-v2` · `verify-bill-v2` · `manage-drug-sync` ·
`update-purchase-report-v2` — มีแต่ `import-excel` ที่อยู่ใน `.claude/skills/` จริง
ผลคือคนที่ clone repo อ่านเจอ "ใช้ `/upgrade-month-v3`" แล้วเรียกไม่ได้

**2. ตัดรายละเอียด Excel ใน CLAUDE.md ให้เหลือ pointer** — **ทำหลังข้อ 1 เท่านั้น** (ตัดก่อนย้าย = ข้อมูลหาย)
หัวข้อที่เป็น how-to ลงมือ ควรย้ายไป skill: `เขียนกลับลงไฟล์ .xlsm — COM` (9,460 ตัวอักษร) ·
`ขึ้นเดือนใหม่ในไฟล์ Master` (6,663) — ส่วนชั้น "อะไรเป็นตัวจริง / ห้ามทำอะไร" ให้คงไว้ใน CLAUDE.md
เพราะเป็น architectural decision ตาม ADR-0027

**3. CLAUDE.md ยาว 535 บรรทัด** — คู่มือชุมชนแนะนำ ~200 บรรทัด (เอกสารทางการบอกแค่ "สั้นเข้าไว้" ไม่ให้ตัวเลข)
สัดส่วน: `## Architecture` 32,677 ตัวอักษร (29%) · หัวข้อ Excel รวม 21,773 (19%)
เกณฑ์ตัดรายบรรทัดจากเอกสารทางการ: *ถ้าลบบรรทัดนี้ออก Claude จะทำผิดไหม — ถ้าไม่ ให้ตัด*

**4. `scripts/.gas-out/` ไม่ถูก gitignore** — เป็น output ของโปรเจกต์ Apps Script คนละระบบ
(สคริปต์ `scripts/gas*.mjs` ก็ untracked อยู่) ตอนนี้ ESLint ไล่ lint มันด้วย คิดเป็น 141 จาก 197 problems
และเสี่ยงเผลอ commit — เพิ่มบรรทัด `scripts/.gas-out/` ใน `.gitignore` จบ

**5. ยังไม่มี `.claude/agents/`** — ถ้าจะเพิ่ม **อย่าทำตัว review ซ้ำกับ [`scrutinize`](../.claude/skills/scrutinize/SKILL.md)**
ที่มีอยู่แล้ว (จะชนกันเหมือนกรณี roast-skill vs plan-roaster) ควรเป็นสายที่ repo ยังไม่มีจริง ๆ เช่น
DB/migration specialist หรือ security auditor แบบ read-only
⚠️ subagent กิน token **รวมแพงกว่า 7-10 เท่า** (ตื่นมาพร้อม context เต็มของตัวเอง) — คุ้มเมื่อให้ใช้โมเดลถูกกว่า

**6. ยังไม่มี `.claude/commands/`** — ยังไม่มีเคสที่ชัดว่าต้องใช้ บันทึกไว้เฉย ๆ
