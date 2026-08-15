# requisition-announce — สรุปความคืบหน้า (setup LINE bot)

> ⚠️ **เอกสารเก็บถาวร — หยุดอัปเดตแล้ว (snapshot ณ 14 ส.ค. 2026 ตอนงานยังทำไม่เสร็จ)**
>
> งานทั้งหมดในไฟล์นี้ **เสร็จครบทุกขั้นแล้วเมื่อ 15 ส.ค. 2026** (ขั้น C/D/E ที่เขียนว่า
> "กำลังทำ/ยังไม่เริ่ม" ทำเสร็จหมดแล้ว รวมทั้งลบ `line-webhook` ทิ้ง)
> เก็บไว้เป็นบันทึกประวัติว่าตอนนั้นเจออะไรบ้าง — **อย่าใช้เป็นสถานะปัจจุบัน**
>
> สถานะจริง + วิธีใช้งาน ดูที่ [features/requisition-announce.md](./features/requisition-announce.md)
> สรุปสำหรับอธิบายต่อคนอื่น ดูที่ [features/requisition-announce-HANDOFF.md](./features/requisition-announce-HANDOFF.md)

> อัปเดต: 2026-08-14 (Asia/Bangkok) · ทำผ่าน Supabase MCP + LINE Console + Chrome
> โปรเจกต์: warehouse-app · Supabase project `kgjocnfafhqqioneqapk`

---

## สถานะรวม

| ขั้น | สถานะ |
|---|---|
| Verify สถานะจริง (function/cron/vault) | ✅ เสร็จ |
| A — ตั้ง secrets (token + group id กลุ่มทดสอบ) | ✅ เสร็จ |
| B — ทดสอบส่งจริงเข้ากลุ่มทดสอบ | ✅ เสร็จ (ผ่านครบ 3 เกณฑ์) |
| C — เปลี่ยนเป็นกลุ่มจริง + dryRun verify | 🔄 กำลังทำ (ดึง group id กลุ่มจริง) |
| D — ตั้ง cron (แก้ vault ก่อนรัน) | ⏸ ยังไม่เริ่ม |
| E — ปิดงาน (docs, ยืนยันบอทเดิม, cleanup) | ⏸ ยังไม่เริ่ม |
| Cleanup — คืน webhook URL + ลบ line-webhook | 🔄 คืน URL แล้ว / ยังไม่ลบ function |

---

## สิ่งที่ verify จากระบบจริง (ไม่ใช่จาก docs — docs มี drift)

- `requisition-announce` — **deploy แล้ว version 1 ACTIVE** (docs เขียนผิดว่า "ยังไม่ deploy" → ต้องแก้ที่ขั้น E)
- `vault.secrets` — **ว่างเปล่า 0 แถว** → `expiry_alert_auth` ที่ cron SQL อ้างถึง **ไม่มีจริง** (ตรงกับที่ brief เตือน)
- `cron.job` — มีแค่ `audit-log-retention` เท่านั้น (ไม่มี expiry-alert, ไม่มี requisition-announce)
- **`pg_net` ยังไม่ได้ติดตั้ง** (มีให้ v0.20.0 แต่ installed_version = null) → นี่คือเหตุที่ `net._http_response` ไม่มี table
- **expiry-alert cron ไม่เคยถูกรัน** — ตอบคำถามขั้น D: expiry-alert ยังไม่ได้ตั้ง cron เลย (ไม่ใช่ trigger วิธีอื่น)
- `public_holiday` — มี 6 วัน (13 ต.ค.–31 ธ.ค. 2026); วันทดสอบ 17 ส.ค. = จันทร์ทำงานปกติ

---

## ขั้น A — secrets (เสร็จ)

ตั้งใน Dashboard → Edge Function Secrets:

| Name | ค่า | สถานะ |
|---|---|---|
| `LINE_REQ_CHANNEL_TOKEN` | channel access token (long-lived) ของ OA Kao-Bot-Chanel | ✅ ตั้งแล้ว (digest b68826…) |
| `LINE_REQ_GROUP_ID` | `Cca5f305d22419973eebe6a7793b89c41` (**กลุ่มทดสอบ**) | ✅ ตั้งแล้ว — **ต้องเปลี่ยนเป็นกลุ่มจริงที่ขั้น C** |

⚠️ Token เก่าถูก reissue ใหม่แล้ว (ตัวเดิมโผล่ใน screenshot จึงถือว่าหลุด) — ตอนนี้ใช้ตัวใหม่

---

## ขั้น B — ทดสอบส่งจริง (เสร็จ · ผ่านครบ)

ยิง POST `{"date":"2026-08-17"}` (วันจันทร์) เข้ากลุ่มทดสอบ `Kao, Kao-Bot-Chanel (2)`:

```json
{
  "ok": true, "date": "2026-08-17", "sent": true,
  "text": "📋 {everyone} ฝ่ายไหนจะเบิก น้ำเกลือ/ยา/ถุง ...",
  "quota": { "limit": 300, "used": 193, "remain": 107 },
  "members": 1
}
```

เกณฑ์ผ่าน:
1. ✅ status 200 + `sent:true`
2. ✅ **`@All` เด้ง noti จริง** (mention จริง แสดงเป็น @All ตัวหนา ไม่ใช่ตัวอักษรธรรมดา) — จุดที่บอทเดิมพลาด ตอนนี้ผ่าน
3. ✅ `quota` (300/193/107) + `members` (1) เป็นตัวเลข ไม่ใช่ null → token+group id ถูก บอทอยู่ในกลุ่มจริง

### verify พฤติกรรม "ส่งแยกวัน" (dryRun ไม่เผาโควตา)

| วัน | ผล |
|---|---|
| อังคาร 18 ส.ค. | `sent:false` — "วันนี้ไม่ใช่วันส่งใบเบิก" → ไม่ยิง ✅ |
| พุธ 19 ส.ค. | `send:true`, requisitionDate 19, pickupDate 20 → ยิงข้อความใหม่ (พูดถึงพฤหัส 20) ✅ |

**สรุปรูปแบบการส่ง (แบบ B ที่ใช้อยู่):**
- จันทร์ → 1 ข้อความ = "เบิกวันนี้ + รับพรุ่งนี้(อังคาร)"
- พุธ → 1 ข้อความ = "เบิกวันนี้ + รับพรุ่งนี้(พฤหัส)"
- อังคาร/พฤหัส/ศุกร์-อาทิตย์ → ไม่ยิง
- รวม 2 ข้อความ/สัปดาห์ ≈ 209/เดือน < โควตา 300 ✅

> คุณตอบ "No preference" เรื่องรูปแบบ → คงแบบ B ไว้ (ไม่แก้ code/cron)
> ถ้าอนาคตอยากได้ **แบบ A** (แยกวัน: จ.เบิก / อ.รับ / พ.เบิก / พฤ.รับ = 4 ครั้ง/สัปดาห์)
> ต้องอัปเกรดแพ็กเกจ LINE ก่อน (แบบ A ≈ 418 ข้อความ/เดือน เกินโควตา) + แก้ `REQUISITION_WEEKDAYS` และ logic ใน `_shared/announceSchedule.js`

---

## ขั้น C — เปลี่ยนเป็นกลุ่มจริง (กำลังทำ)

กลุ่มจริง: **"กลุ่มเบิกยา /น้ำเกลือ /ถุงซองซิบ รพ.ประชาธิปัตย์ (25)"** — 25 คน, มี Kao-Bot-Chanel อยู่ในกลุ่มแล้ว ✅

ต้องทำ:
1. ดึง group id กลุ่มจริง (webhook capture ชั่วคราว — เหมือนที่ทำกับกลุ่มทดสอบ)
2. คุณแก้ `LINE_REQ_GROUP_ID` ใน Dashboard เป็น group id กลุ่มจริง
3. ผมทดสอบ `{"dryRun":true}` ยืนยัน function ตอบ 200 (dryRun ไม่ส่ง ไม่เผาโควตา)

### วิธีดึง group id (ตาม docs/expiry-alert-edge-function.md ข้อ 3 + Critical Rule #7)

- deploy function ชั่วคราว `line-webhook` แบบ `--no-verify-jwt` (LINE webhook ไม่มี Bearer)
- ตั้ง Webhook URL ใน LINE Console เป็น `https://kgjocnfafhqqioneqapk.supabase.co/functions/v1/line-webhook`
- พิมพ์ 1 ข้อความในกลุ่ม → อ่าน `console.log` จาก `function_logs` (ไม่ใช่ `function_edge_logs`) → ดึง `source.groupId`
- คืน Webhook URL เดิม + ลบ function ทิ้ง

**Webhook URL เดิม (ต้องคืนค่า):**
```
https://script.google.com/macros/s/AKfycby_EFGT3E_Eu4uWexgs3o4OWChc0dzLAudxBxQhS6TaggKLHP1921GQl7AxjP-dIJd_4Q/exec
```
(= Apps Script web app ของ Kao-Bot เดิม; docs requisition-announce บรรทัด 102 เคยสงสัยว่าคืออะไร — ตอนนี้รู้แล้วว่าเป็น LINE webhook เดิมของกลุ่ม)

---

## ขั้น D — ตั้ง cron (ยังไม่เริ่ม · มีกับดัก)

🛑 **ห้ามรัน `requisition_announce_cron.sql` ตามไฟล์** — มันอ้าง vault secret `expiry_alert_auth` ที่ **ไม่มีจริง** (vault ว่าง) → cron จะยิงด้วย `Authorization: Bearer ` (ว่าง) → 401 เงียบทุกวัน

ต้องทำก่อนรัน:
1. `CREATE EXTENSION IF NOT EXISTS pg_net;` (ยังไม่ติดตั้ง — cron ต้องใช้ `net.http_post`)
2. สร้าง vault secrets เอง:
   - `requisition_announce_auth` = anon key (หรือ service key)
   - `requisition_announce_url` = `https://kgjocnfafhqqioneqapk.supabase.co/functions/v1/requisition-announce`
3. แก้ cron SQL ให้อ้าง `requisition_announce_auth` แทน `expiry_alert_auth`
4. รัน `cron.schedule('requisition-announce-daily', '0 2 * * *', ...)` (02:00 UTC = 09:00 ไทย)
5. verify: `cron.job` มี job, `cron.job_run_details` สำเร็จ, `net._http_response` status_code=200 (ไม่ใช่ 401)

---

## ขั้น E — ปิดงาน (ยังไม่เริ่ม)

1. ยืนยันบอทเดิม Kao-Bot (Apps Script `mainAlert` trigger) ปิดแล้วจริง — docs บอกลบ trigger แล้ว 14 ส.ค. (ควรถามยืนยันซ้ำ ไม่งั้นประกาศซ้ำ 2 ตัว + เผาโควตาคู่)
2. อัปเดต `docs/features/requisition-announce.md` บรรทัด 16-17: "Edge Function ⏸ ยังไม่ deploy" → ✅ deploy แล้ว, "pg_cron ⏸ ยังไม่รัน" → ตามจริงหลังขั้น D
3. เตือน issue channel token ใหม่ (ทำแล้ว — reissue ไปตอนขั้น A)
4. **ห้าม commit/push เอง** (CLAUDE.md; branch main → Netlify auto-deploy)

---

## หมายเหตุด้านเทคนิค (สภาพแวดล้อม)

- **Supabase CLI ไม่มีในเครื่องนี้** → ใช้ Supabase MCP แทน (execute_sql, deploy_edge_function, query_logs) — **ยกเว้นตั้ง secrets** (MCP ไม่มี tool → user ทำใน Dashboard เอง) และ **ลบ edge function** (MCP ไม่มี delete → ต้องลบใน Dashboard)
- **การยิง POST ทดสอบ**: cloud container เน็ตบล็อก supabase.co (403); device_bash ไม่มีเน็ต → ยิงผ่าน `fetch()` ใน Chrome console ของแท็บ Supabase (มีเน็ต + อยู่บนเครื่อง user)
- `line-webhook` (temp) ตอนนี้ version 4, verify_jwt=false (capture mode) — **ต้องลบทิ้งตอน cleanup**
