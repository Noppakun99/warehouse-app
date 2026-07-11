# นโยบายเปลี่ยน/คืนยาก่อนพ้นเงื่อนไขบริษัท (Swap/Return Alert)

แจ้งเตือนก่อนยาพ้นช่วงที่บริษัทรับเปลี่ยน/คืน — กันยาหมดอายุคาคลังโดยคืนไม่ทัน

## แนวคิด

- นโยบายคืนของแต่ละบริษัทเก็บใน `receive_logs.drug_swap_policy` เป็น **ข้อความอิสระ** (เครื่องอ่านตัวเลขเดือนไม่ได้)
- เฟส 1 สกัดเป็น **ตารางมีโครงสร้าง** `swap_return_policy` (ต่อบริษัท): `return_months` + `can_return` + `differs_by_item`
- โมดอลใกล้หมดอายุ (ระบบแผนผัง [App.jsx](../../src/App.jsx)) จับ lot → บริษัท (supplier) → นโยบาย → คำนวณ **deadline คืน = exp − return_months**
- ถ้า deadline ใกล้ถึง (ภายใน buffer) → เด้ง popup + ปุ่ม "แจ้งหัวหน้า" → audit `flag_swap_return` → กระดิ่งแจ้งเตือน

## ตรรกะ (pure module — golden-tested)

`src/lib/swapPolicy.js` (`npm run test:swappolicy`, 31 assertions):

- **`parseReturnPolicy(text)`** → `{ canReturn, months, differsByItem }`
  - `months`: ดึง "N เดือน/ปี/วัน" (ปี×12, วัน→ceil(N/30)) เลือก**ค่าน้อยสุด** (deadline ปลอดภัยสุด/เตือนเร็วสุด)
  - `canReturn`: `true` ถ้ามีเดือน (แม้ข้อความมี "ไม่รับ" ในข้อยกเว้น — conservative), `false` ถ้าปฏิเสธชัด, `null` ถ้าไม่รู้
  - `differsByItem`: `true` เมื่อ "เงื่อนไขแตกต่างกัน แล้วแต่รายการ" → ผูกระดับบริษัทไม่ได้ → badge "ต้องเช็กเอกสาร"
- **`computeReturnStatus({ exp, months, today, bufferDays })`** → `{ status, deadline, daysToDeadline }`
  - `status`: `ok` (เหลือ > buffer) / `due` (0 < เหลือ ≤ buffer → เด้ง popup) / `overdue` (พ้น) / `no_policy` (ไม่มีเดือน → ไม่เด้ง)
- **`RETURN_ALERT_BUFFER_DAYS = 60`** — จาก p90 lead time การรับของจริง 49 วัน + เผื่อ (ปรับที่ const เดียว)

## Data layer ([db.js](../../src/lib/db.js))

- **`fetchSwapPolicies()`** → `{ [company]: { returnMonths, canReturn, differsByItem, rawNote } }`
- **`seedSwapPolicies(auth)`** — derive นโยบายต่อบริษัท (most-frequent) จาก `receive_logs` ผ่าน `parseReturnPolicy` → upsert (ไม่แตะแถว `source='manual'`); audit `seed_swap_policy`
- **`flagSwapReturn({...}, auth)`** — audit `flag_swap_return` (ไม่แตะ inventory — แค่ flag ติดตามงาน)

## Schema

`swap_return_policy` (PK = `company`): `return_months numeric`, `can_return bool`, `differs_by_item bool`, `raw_note text`, `source text ('auto'|'manual')` — migration: `swap_return_policy_migration.sql`

## เฟส 1 ไม่รวม (ทำทีหลัง)

- tier % (คืน 100/50/25 ตามช่วงอายุ) — เก็บ `raw_note` ไว้ให้คนอ่านก่อน
- UI ให้ admin แก้ `return_months`/`can_return` (เฟส 1 seed ด้วย SQL/`seedSwapPolicies`)
- บริษัท `differs_by_item` = ไม่คำนวณ deadline (แสดง badge "ต้องเช็กเอกสาร")
- บริษัทที่นโยบายเป็น "วัน" ที่ regex พลาด (rare) → `source='auto'` แก้มือทีหลังได้

## Import CSV (Auto-Match)

`RECEIVE_COL_MAP.swap_automatch` (คอลัมน์ `รายละเอียดเงื่อนไขการแลกเปลี่ยน (Auto-Match)`, Z–AD ในไฟล์รับยา) ถูก merge เข้า `drug_swap_policy` ด้วย เพื่อให้ข้อความ "N เดือน" ครบขึ้น (ทั้ง `importReceiveLogs` ใน db.js และ path ใน ReceiveLogApp.jsx)
