# Google Apps Script — แจ้งเตือนยาใกล้หมดอายุ (Email)

External script (ไม่ใช่ส่วนของ React app) — รันบน Google Apps Script ตั้ง trigger รายวัน ส่ง email สรุปยาที่หมดอายุ + ใกล้หมดอายุไปยังรายชื่อใน `emails`

**ไฟล์**: [docs/apps-script-expiry-alert.gs](apps-script-expiry-alert.gs) — copy ทั้งไฟล์ไปวางใน Apps Script editor

## การทำงาน

1. ดึง `inventory` ผ่าน Supabase REST API (`code,location,type,name,lot,exp,qty,unit,supplier,receive_status`)
2. ดึง `receive_logs` order by `receive_date desc` (`drug_code,lot,bill_number,supplier_current,drug_swap_policy,supplier_changed,receive_date`)
3. สร้าง `detailMap`:
   - **key หลัก**: `drug_code|lot` — match แม่นระดับ lot
   - **key fallback**: `drug_code|` — ถ้า inventory.lot ไม่ตรงกับ receive_logs ใดเลย
   - first-win + ลำดับ desc → ได้ entry ใหม่สุดเสมอ
4. filter inventory:
   - ข้าม `exp` ที่ว่าง/`-`
   - ข้าม `qty <= 0`
   - ข้าม `receive_status === 'รอตรวจรับ'`
5. แยกเป็น `expired` (exp < today) และ `nearExpiry` (exp <= today + `warningDays`)
6. ส่ง email HTML table แสดง: ตำแหน่ง / ชนิดยา / ชื่อ / Lot / Exp / คงเหลือ / หน่วย / **บริษัท** / **นโยบายเปลี่ยนยา** / วันที่เหลือ

## คอลัมน์ที่ join จาก receive_logs

| คอลัมน์ในเมล | ที่มา | ลำดับความสำคัญ |
|---|---|---|
| บริษัท | `receive_logs.supplier_current` → fallback `inventory.supplier` | receive_logs ก่อน (ตรงกับที่แอปแสดง — ดู [db.js:109](../src/lib/db.js#L109) `_company: row.supplier_current`) |
| นโยบายเปลี่ยนยา | `receive_logs.drug_swap_policy \| supplier_changed` | join ด้วย ` \| ` กรอง `-`/ว่างทิ้ง |

## ข้อควรระวัง (Critical Rules)

1. **อย่าใช้ key `drug_code|supplier`** — receive_logs ไม่มี field `supplier` (มีแต่ `supplier_current`) และ inventory ไม่มี `supplier_current` → key ทั้งสองฝั่งจะ undefined และ collide โดยบังเอิญ ทำให้ join ไม่แม่นยำ + เก็บ entry แบบ random
2. **ต้อง `order=receive_date.desc.nullslast`** — ไม่งั้น Supabase return order arbitrary และ first-win จะได้ entry สุ่ม
3. **fallback key `code|` จำเป็น** — ถ้า inventory มีของแต่ไม่มี receive_log ที่ lot ตรงเป๊ะ (เช่น lot สะกดต่าง) ยังต้องโชว์บริษัท/นโยบายของ drug_code นั้น
4. **API key เป็น anon key** — ไม่ใช่ service_role, อย่า hardcode service_role ในสคริปต์ (script เปิดเผยได้ ถ้าแชร์ Apps Script project)

## แก้ไข

- **เปลี่ยนช่วงแจ้งเตือน** → แก้ `var warningDays = 400`
- **เพิ่ม/ลด email** → แก้ `var emails = "..."` (comma-separated)
- **เปลี่ยน Supabase project** → แก้ `SUPABASE_URL` + `SUPABASE_KEY`
- **เพิ่มคอลัมน์ในตาราง** → แก้ทั้ง `<thead>` ใน `makeTable` + เพิ่ม `<td>` ใน loop + ถ้าต้อง field ใหม่จาก receive_logs ต้องเพิ่มใน `select` ของ `fetchFromSupabase('receive_logs', ...)` ด้วย

## Trigger ใน Apps Script

> ⛔ **ปิดแล้ว 17 ส.ค. 2026 — สคริปต์นี้เป็น backup อย่างเดียว ไม่ได้ทำงานอยู่**
>
> ลบ time-driven trigger (โปรเจกต์ `AlertExp` · function `sendExpiryAlert` · run ล่าสุด 17 ส.ค. 2026 09:26)
> ออกจาก [My Triggers](https://script.google.com/home/triggers) แล้ว **เก็บโค้ดไว้** — ตั้ง trigger ใหม่
> ได้ทันทีถ้าต้องย้อนกลับ
>
> **เหตุผล:** [Edge Function `expiry-alert`](expiry-alert-edge-function.md) ทำงานแทนตั้งแต่ ก.ค. 2026 แต่ไม่มีใคร
> ปิดตัวเก่า → ผู้ใช้ได้อีเมล **2 ฉบับ/วัน ที่ตัวเลขไม่ตรงกัน** (17 ส.ค.: ตัวใหม่ 08:00 ว่า "ใกล้หมดอายุ 97 ·
> ถึงกำหนดคืน 17" ตัวเก่า 09:26 ว่า "68 รายการ") เพราะนับคนละเกณฑ์ — คนอ่านแยกไม่ออกว่าเลขไหนจริง
> เป็นกับดักเดียวกับบอทประกาศรอบเบิก-รับ ที่ปิดไปเมื่อ 14 ส.ค. (commit `899b4bf`)

ถ้าต้องย้อนกลับมาใช้ — ตั้ง Time-driven trigger:
- Function: `sendExpiryAlert`
- Type: Day timer
- Time: 08:00–09:00 (หรือเวลาที่ต้องการ)
- ⚠️ ต้อง **ปิด cron ฝั่ง Supabase ก่อน** (`SELECT cron.unschedule('expiry-alert-weekdays');`) ไม่งั้นได้อีเมลซ้ำอีก
