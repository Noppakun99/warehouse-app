# Expiry Alert Edge Function (แทน Apps Script)

Supabase Edge Function ที่ทำหน้าที่แจ้งเตือนยาใกล้หมดอายุผ่าน email (แทน Google Apps Script เดิม)

- **Function**: [supabase/functions/expiry-alert/index.ts](../supabase/functions/expiry-alert/index.ts)
- **Cron migration**: [expiry_alert_cron.sql](../expiry_alert_cron.sql)
- **Email**: Gmail SMTP (nodemailer) — ใช้ App Password ของ Gmail account

## เนื้อหา email (3 section)

1. **ยาหมดอายุแล้ว** + **2. ยาใกล้หมดอายุ** (ภายใน `WARNING_DAYS`) — ตาราง 11 คอลัมน์:
   `โซน · ตำแหน่ง · ชนิดยา · ชื่อยา · Lot · Exp · คงเหลือ · หน่วย · บริษัท · นโยบายเปลี่ยนยา · คงเหลือ(วัน)`
   - **โซน** = ตัวอักษรนำหน้าของ `location` (E-1-4 → E) — logic เดียวกับ `zoneOf` ใน [App.jsx](../src/App.jsx) (pill กรองโซนในโมดอลใกล้หมดอายุ)
3. **ถึงกำหนดแจ้งเปลี่ยน/คืนบริษัทก่อนพ้นกำหนด** (status `due`+`overdue`) — สิทธิ์เปลี่ยน/คืนยากับบริษัทหมด*ก่อน* exp
   - ตาราง 7 คอลัมน์: `สถานะ · ชื่อยา · Lot · บริษัท · Exp · ต้องคืนภายใน · นโยบาย(เต็ม)`
   - logic port ตรงจาก [src/lib/swapPolicy.js](../src/lib/swapPolicy.js) (`parseReturnPolicy` + `computeReturnStatus`, buffer 60 วัน) → ต้องตรงกับ popup "แจ้งหัวหน้า" ในแอป (`fetchSwapReturnDue`). **แก้ logic ที่ swapPolicy.js ต้อง sync มา index.ts ด้วย** (copy ไม่ใช่ import — Deno รัน node module ตรงไม่ได้)
   - **coverage check (เรท)**: ถ้ายายังเบิกใช้และของจะหมดเองก่อน deadline (คงเหลือรวมต่อรหัส÷เรท 6 เดือน < วันถึง deadline) → แถวจาง + ป้าย "คาดว่าจะหมดเองก่อน" + ดันลงล่าง (*ไม่ตัดออก*). ยาไม่มีเรท (นิ่ง) = ต้องคืน. ดู CONTEXT.md §"ความจำเป็นต้องคืน" — port `fetchUsageRates` + packSize เข้า index.ts ด้วย
   - **นโยบายเต็ม (raw)** ราย*รหัสยา* จากบิลรับล่าสุด (`receive_logs.drug_swap_policy`) — ยืนยันว่าเป็น policy ของยานั้นจริง
   - email ส่งแม้ไม่มียาใกล้หมดอายุ ถ้ามีรายการถึงกำหนดคืน (subject รวมทั้งสองยอด)
   - **section นี้มีเฉพาะ email** — LINE ไม่มี (โดยเจตนา)

## ฟรี 100%

| Component | Cost |
|---|---|
| Supabase Edge Function | ฟรี (500K invocations/เดือน, ใช้ ~30) |
| pg_cron + pg_net | ฟรี (included) |
| Gmail SMTP | ฟรี (500 email/วัน, ใช้ 1) |

## Setup (ทำครั้งเดียว)

### 1. สร้าง Gmail App Password
1. ไปที่ https://myaccount.google.com/security
2. เปิด **2-Step Verification** ก่อน (จำเป็น)
3. ไปที่ https://myaccount.google.com/apppasswords
4. สร้าง App Password ใหม่ ตั้งชื่อ "Supabase Expiry Alert"
5. copy รหัส 16 หลัก (เช่น `abcd efgh ijkl mnop`)

### 2. ตั้ง Supabase Secrets

```bash
supabase secrets set GMAIL_USER=noppakun.kao1234@gmail.com
supabase secrets set GMAIL_APP_PASSWORD=abcdefghijklmnop
supabase secrets set ALERT_EMAILS=noppakun.kao1234@gmail.com,nasamax2000gtr@gmail.com,lovelovetai1@gmail.com,angelmatsu888888@gmail.com
supabase secrets set WARNING_DAYS=400
```

> `SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY` มีอยู่แล้วใน secrets (default)

### 3. Deploy Edge Function

```bash
supabase functions deploy expiry-alert
```

### 4. ทดสอบ manual ก่อน enable cron

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/expiry-alert" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json"
```

ตรวจสอบ:
- response JSON ควรได้ `{ ok: true, total: N, expired: X, nearExpiry: Y }`
- เช็ค email ว่ามาถึงไหม

### 5. เปิด cron รายวัน

1. เปิด `expiry_alert_cron.sql`
2. แทนค่า:
   - `<PROJECT_REF>` → ref ของ project (เช่น `kgjocnfafhqqioneqapk`)
   - `<ANON_KEY_OR_SERVICE_ROLE>` → anon key
3. รันใน **Supabase Dashboard → SQL Editor** ทั้งไฟล์
4. ตรวจสอบว่า job ตั้งสำเร็จ:
   ```sql
   SELECT * FROM cron.job;
   ```

## Trigger จากแอป (optional)

ถ้าต้องการปุ่ม "ส่งแจ้งเตือนเดี๋ยวนี้" ในแอป:

```js
// ใน component (admin only)
const { data, error } = await supabase.functions.invoke('expiry-alert');
if (error) alert('ส่งล้มเหลว: ' + error.message);
else alert(`ส่งสำเร็จ ${data.total} รายการ`);
```

## ช่องทาง LINE กลุ่ม (เพิ่มควบคู่ email)

Edge Function เดียวกันส่งได้ทั้ง email + LINE — เลือกด้วย `channel` ใน request body:

| body | ช่องทาง | ใช้โดย |
|---|---|---|
| `{}` หรือ `{"channel":"email"}` | email | cron `expiry-alert-weekdays` (แอปไม่ได้เรียกฟังก์ชันนี้ — ไม่มีปุ่ม ตรวจ 17 ส.ค. 2026: `src/` invoke แค่ `line-quota`/`scan-invoice`) |
| `{"channel":"line"}` | LINE | cron `expiry-alert-line-weekly` |
| `{"channel":"both"}` | ทั้งคู่ | ทดสอบ manual |

### รอบการส่ง — ฟังก์ชันตัดสินเอง ไม่ใช่ cron (สำคัญ)

cron ยิงมาทุกวัน แล้ว **ฟังก์ชันตัดสินเองว่าวันนี้ส่งไหม** เพราะวันที่ส่งเลื่อนตามวันหยุดราชการ
ซึ่ง cron expression ล็อกไม่ได้ (โครงสร้างเดียวกับ `requisition-announce`)

| อีเมล/ช่องทาง | รอบ | ตัดสินโดย |
|---|---|---|
| `[แจ้งเตือน] ใกล้หมดอายุ N · ถึงกำหนดคืน N` (ฉบับหลัก) | **สัปดาห์ละครั้ง** — จันทร์ ถ้าจันทร์หยุดเลื่อนเป็นวันทำการแรกของสัปดาห์ | `closedReason()` + `isWeeklySlot()` |
| `[ด่วน] ยาหมดอายุค้างคลัง N รายการ` | **ทุกวันทำการ** (ข้ามเฉพาะวันที่คลังปิด) | `closedReason()` |
| LINE เข้ากลุ่ม | สัปดาห์ละครั้ง (เหมือนฉบับหลัก) | `closedReason()` + `isWeeklySlot()` |

**ทำไมฉบับ "[ด่วน]" ไม่เป็นรายสัปดาห์ด้วย** — มันส่งเฉพาะตอนมีของหมดอายุค้างคลังจริง ซึ่งเป็นปัญหาที่
ต้องรีบเก็บออก และในตัวอีเมลเขียนไว้เองว่า "จะแจ้งเตือนซ้ำทุกวันจนกว่าจะอัพเดต" — ทำให้เป็นรายสัปดาห์
= ของค้างคลังนานสุด 7 วันโดยไม่มีใครเตือน และข้อความในอีเมลจะโกหก

`isWeeklySlot()` **ใช้ร่วมกันทั้งอีเมลฉบับหลักและ LINE** (เดิมชื่อ `isWeeklyLineSlot` ตอนที่ LINE ใช้อยู่
ตัวเดียว — เปลี่ยนชื่อ 17 ส.ค. 2026 ตอนอีเมลมาใช้ด้วย) แก้กติกาที่นี่ที่เดียวมีผลทั้ง 2 ช่องทาง

> ทั้งหมดข้ามได้ด้วย body `{"force":true}` (ส่งทันทีไม่สนรอบ) และจำลองวันอื่นด้วย `{"date":"YYYY-MM-DD"}`

### ตาข่ายกันเงียบทั้งสัปดาห์ (catch-up)

รายสัปดาห์มีจุดอ่อนที่รายวันไม่มี: **พลาดวันจันทร์วันเดียว = เงียบยาว 7 วัน** (Gmail ล่ม / ฟังก์ชัน error /
ดึงข้อมูลไม่ทัน) ทุกวันทำการฟังก์ชันจึงเช็คเพิ่มว่า *สัปดาห์นี้มีอีเมลฉบับหลักออกไปแล้วหรือยัง* —
ถ้ายัง ให้ส่งตามหลังทันที (`mainEmailSentThisWeek()` อ่าน `audit_logs` ตั้งแต่จันทร์ 00:00 เวลาไทย)

| สถานการณ์ | ผล |
|---|---|
| วันจันทร์ (รอบปกติ) | ส่ง — `slot: "วันจันทร์ (วันทำการ)"` |
| อังคาร-ศุกร์ · สัปดาห์นี้ส่งไปแล้ว | ไม่ส่ง |
| อังคาร-ศุกร์ · สัปดาห์นี้**ยังไม่ได้ส่ง** | **ส่งตามหลัง** — `emailCatchUp: true` + `slot: "ส่งตามหลัง — สัปดาห์ของ …"` |
| เสาร์/อาทิตย์/วันหยุด | ไม่ส่ง (ไม่แตะ catch-up เลย) |
| ตรวจ `audit_logs` ไม่ได้ (query ล้ม) | **ไม่ส่งตามหลัง** — fail-closed |

**ทำไม fail-closed ตรงนี้ แต่ `closedReason()` fail-open** — คนละความเสี่ยง: ตรงนั้นพลาดแล้วส่งเกิน 1 ฉบับ
แต่ตรงนี้ถ้า fail-open แล้ว query ล้มทุกวัน จะกลายเป็นส่งทุกวันทำการ = ย้อนกลับไปปัญหาเดิมที่เพิ่งแก้

**นับเฉพาะ `sent: true`** — แถว `sent:false` (ส่งไม่ออก) ต้องไม่นับ ไม่งั้นวันที่ Gmail ล่มจะกลายเป็น
"ส่งแล้ว" แล้วไม่มีใครตามส่งให้อีกเลยทั้งสัปดาห์ ซึ่งตรงข้ามกับเจตนาของตาข่ายนี้

**ไม่รวม LINE โดยเจตนา** — push นับรายหัว โควตา free 200/เดือน ถ้าตามส่งผิดพลาดจะกินโควตาทั้งกลุ่ม
(ดู §ทำไม LINE สัปดาห์ละครั้ง) LINE จึงยังเป็น "จันทร์เท่านั้น" ตามเดิม

### Audit log ของการส่ง

ทุกครั้งที่ "พยายามส่งอีเมล" จะลง `audit_logs` ด้วย action **`email_expiry_alert`** ทั้งกรณีสำเร็จและล้มเหลว
ดูได้ในแอปที่หน้า **Audit Log** (ป้าย "แจ้งเตือนยาใกล้หมดอายุ (Email)")

| field ใน details | ความหมาย |
|---|---|
| `kind` | `main` (ใกล้หมดอายุ+ถึงกำหนดคืน) หรือ `expired` (ยาหมดอายุค้างคลัง) |
| `sent` | `true` ส่งออกแล้ว · `false` ส่งไม่ออก (ดู `error`) |
| `slot` | รอบที่ทำให้ส่งวันนั้น เช่น "วันจันทร์ (วันทำการ)" |
| `simulated_date` | มีค่า = แถวนี้เกิดจากการยิงทดสอบด้วย `{"date":...}` ไม่ใช่รอบจริง |

**ไม่ลง audit ตอน skip โดยเจตนา** — cron ยิง จ–ศ ถ้าลงทุกครั้งจะได้แถว "ไม่ส่ง" สัปดาห์ละ 4 แถวกลบแถวที่มี
ความหมายจริง เหตุผลที่ข้ามอ่านได้จาก response (`emailSkip`) อยู่แล้ว

**ไม่เข้ากระดิ่งแจ้งเตือน** — ทำตามแบบเดียวกับ `line_expiry_alert` ที่ไม่ได้อยู่ใน `NOTIFY_ACTIONS`
(การส่งปกติของบอทไม่ควรเด้งกระดิ่งทุกสัปดาห์; กระดิ่งเก็บไว้ให้เรื่องผิดปกติอย่าง `line_quota_low`)
⚠️ ผลข้างเคียงคือ **อีเมลส่งไม่ออกก็ไม่เด้งกระดิ่ง** เหมือนกัน — ต้องเข้าไปดูหน้า Audit Log เอง

**สถานะ deploy:** version 26 (19 ส.ค. 2026) — เทียบแล้วตรงกับ `supabase/functions/expiry-alert/index.ts` ทุกตัวอักษร

verify การลง audit (19 ส.ค. 2026): ตั้ง `ALERT_EMAILS` เป็นอีเมลคนเดียวชั่วคราว → ยิง `{"force":true,"channel":"email"}`
→ ได้แถว `email_expiry_alert` ใน `audit_logs` (`kind: main · sent: true · near_expiry: 95 · return_due: 16 ·
recipients: 1 · slot: "force (ข้ามการเช็ครอบ)"` · record_count 111) → เห็นป้าย "แจ้งเตือนยาใกล้หมดอายุ (Email)"
ในหน้า Audit Log จริง → **คืนค่า `ALERT_EMAILS` แล้ว** ยืนยันด้วย digest ที่กลับมาตรงค่าเดิม `823bf6a2…`

> 💡 **deploy ด้วย CLI ดีกว่าให้ agent พิมพ์เนื้อไฟล์ผ่าน MCP** — `supabase functions deploy` อัปโหลดไฟล์จริง
> ไม่มีโอกาสพิมพ์ตก (ไฟล์นี้ ~59KB เกินลิมิต output ของ agent ด้วย). โทเค็นอยู่ใน env ของ MCP server:
> `SUPABASE_ACCESS_TOKEN` ใน `~/.claude.json` → `mcpServers.supabase.env`
>
> ⚠️ **อ่านค่า secret เดิมกลับไม่ได้** (`secrets list` ให้แค่ digest) — ถ้าจะแก้ชั่วคราวต้องรู้ค่าเดิมก่อน
> แล้วยืนยันตอนคืนด้วยการเทียบ digest. ผู้รับปัจจุบัน = 4 คนตามที่จดไว้ข้างบน (ยืนยันด้วย digest แล้ว)

verify ยิงจริงกับ DB จริง 5 เคส (ใช้ `{"date":...}` ซึ่งเลือกเฉพาะวันที่ไม่ส่ง จึงไม่มีอีเมลออกระหว่างทดสอบ):

| วันที่ยิง | ผลที่ได้ |
|---|---|
| 22 ส.ค. (เสาร์) | `คลังปิด (วันเสาร์)` — ข้ามทั้ง 2 ฉบับ |
| 18 ส.ค. (อังคาร) | `ไม่ใช่รอบ — รอบสัปดาห์นี้คือ 2026-08-17` · ฉบับหลัก skip / ฉบับด่วนเดินต่อตามปกติ |
| 19 ส.ค. (พุธ) | เหมือนกัน — ชี้กลับไปจันทร์ 17 |
| **7 ธ.ค. (จันทร์ที่เป็นวันหยุดชดเชย)** | `คลังปิด (วันหยุดชดเชยวันพ่อแห่งชาติ)` |
| **9 + 11 ธ.ค. (พุธ/ศุกร์ สัปดาห์เดียวกัน)** | `รอบสัปดาห์นี้คือ 2026-12-08` = **เลื่อนมาอังคารถูกต้อง** |

เคสสุดท้ายคือหัวใจของกติกา — จันทร์หยุดแล้วรอบเลื่อนเป็นอังคาร ไม่ใช่ข้ามทั้งสัปดาห์

### ทำไม LINE สัปดาห์ละครั้ง ไม่ใช่รายวัน (สำคัญ)

**LINE Notify ปิดบริการแล้ว** (31 มี.ค. 2025) — ใช้ **Messaging API** (push เข้ากลุ่ม) แทน. Push เข้ากลุ่ม **นับเป็นรายหัว**: กลุ่ม N คน = N ข้อความ/ครั้ง. Free tier = **200 ข้อความ/เดือน**.

- กลุ่ม ~19 คน × สัปดาห์ละครั้ง × 4 = **76 ข้อความ/เดือน** < 200 ✅ (มี headroom)
- ถ้าส่งรายวัน: 19 × 30 = 570 → ทะลุ free tier → ต้องจ่าย Standard Plan
- ⚠️ **ถ้ากลุ่มโต >40 คน ต้องทบทวนความถี่** — ดู log `LINE push:` ใน Edge Function logs เพื่อดูแนวโน้ม

LINE ใช้ `LINE_WARNING_DAYS=365` (ต่างจาก email `WARNING_DAYS=400`) — 365 ครอบนโยบายบริษัทที่ต้อง "แจ้งก่อนหมดอายุ 1 ปี" (สยามฟาร์มา/พอนด์เคมีคอล). ดู `csvfile/นโยบาย.csv` + CONTEXT.md §"Expiry / Return Alert".

### Setup LINE (ทำครั้งเดียว)

**1. สร้าง LINE Official Account + Messaging API channel**
1. ไปที่ https://developers.line.biz/console/ → สร้าง Provider → สร้าง Messaging API channel
2. ในแท็บ **Messaging API** → เปิด **"Allow bot to join group chats"** (ปิดเป็น default)
3. copy **Channel access token** (long-lived) จากแท็บ Messaging API

**2. ตั้ง token เป็น secret**
```bash
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=<channel access token>
supabase secrets set LINE_WARNING_DAYS=365
```

**3. หา `groupId` ของกลุ่ม** (ต้องมี webhook ชั่วคราวครั้งเดียว)

> ⚠️ **อย่าเติม webhook handler ลงใน `expiry-alert` production** — production function ยิงจาก cron ด้วย `Authorization: Bearer` และเปิด JWT verify; LINE webhook ยิงมาแบบไม่มี header นั้น (ใช้ `X-Line-Signature`) จะโดน reject 401 ก่อนถึงโค้ด. ใช้ **function ชั่วคราวแยกตัว** แทน แล้วลบทิ้ง.

1. สร้าง function ชั่วคราว `supabase/functions/line-webhook/index.ts`:
   ```ts
   Deno.serve(async (req) => {
     const body = await req.json().catch(() => ({}));
     console.log("LINE webhook:", JSON.stringify(body));  // groupId อยู่ใน events[].source.groupId
     return new Response("ok");
   });
   ```
2. deploy แบบปิด JWT: `supabase functions deploy line-webhook --no-verify-jwt`
3. เอา URL (`https://<REF>.supabase.co/functions/v1/line-webhook`) ไปตั้งใน LINE Console → Messaging API → **Webhook URL** + เปิด **Use webhook**
4. **เชิญบอทเข้ากลุ่ม** (เพิ่มเป็นเพื่อนด้วย QR/ID แล้วเชิญเข้ากลุ่ม) — หมายเหตุ: 1 กลุ่มมี OA ได้แค่ 1 บัญชี
5. **พิมพ์อะไรก็ได้ในกลุ่ม 1 ข้อความ** → เปิด function logs (`supabase functions logs line-webhook`) → จะเห็น `source.groupId` = `Cxxxxxxxx...`
6. ตั้ง secret: `supabase secrets set LINE_GROUP_ID=Cxxxxxxxx...`
7. **ลบ function + webhook ทิ้ง**: `supabase functions delete line-webhook` + ปิด Use webhook ใน Console

**4. ทดสอบ + เปิด cron**
```bash
# ทดสอบ LINE อย่างเดียว
curl -X POST "https://<REF>.supabase.co/functions/v1/expiry-alert" \
  -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"channel":"line"}'
```
response ควรได้ `{ ok:true, line:{ sent:true, ... } }`. ถ้า `line:"skip:..."` = ไม่มียาเข้าเกณฑ์ (ปกติ). ถ้า token/group ไม่ตั้ง → `line:{ sent:false, error:"...ไม่ได้ตั้ง..." }`.

จากนั้นรัน `expiry_alert_cron.sql` (มี job LINE `expiry-alert-line-weekly` แล้ว).

## เปลี่ยนแปลงการตั้งค่า

| ต้องการ | ทำยังไง |
|---|---|
| เปลี่ยน warningDays (email) | `supabase secrets set WARNING_DAYS=300` |
| เปลี่ยน warningDays (LINE) | `supabase secrets set LINE_WARNING_DAYS=365` |
| เพิ่ม/ลด email | `supabase secrets set ALERT_EMAILS=a@x.com,b@y.com` |
| เปลี่ยนกลุ่ม LINE | `supabase secrets set LINE_GROUP_ID=<groupId ใหม่>` |
| ปิด LINE ชั่วคราว | `SELECT cron.unschedule('expiry-alert-line-weekly');` (email ยังทำงาน) |
| เปลี่ยนเวลา/ความถี่ cron | แก้ใน Dashboard SQL: `unschedule` แล้ว `schedule` ใหม่ |
| แก้ logic / template | แก้ `supabase/functions/expiry-alert/index.ts` → `supabase functions deploy expiry-alert` |

## Critical Rules (บทเรียนจาก migration จริง)

1. **ห้ามใช้ `denomailer` ส่ง UTF-8 ภาษาไทย** — มี bug ทำให้ subject แสดงเป็น `=?utf-8?Q?...?=` ดิบ และ body เป็น quoted-printable raw → ใช้ `npm:nodemailer@6.9.16` แทน (เสถียรกว่า, รองรับ UTF-8 ครบ)
2. **`drug_swap_policy` ใน DB เป็น merged column** — สร้างตอน CSV import โดย join `swap_condition + swap_items` ด้วย `' | '` ([db.js:286](../src/lib/db.js#L286)). ฉะนั้น **ไม่ต้องดึง `swap_condition`/`swap_items` แยก** — query แค่ `drug_swap_policy` พอ
3. **เช็คข้อมูลใน DB ก่อนสรุปว่า code bug** — เมื่ออีเมลโชว์ข้อมูลไม่ครบ มีโอกาสสูงที่ CSV ต้นทางกรอกไม่ครบ ไม่ใช่ code ดึงพลาด (ตัวอย่าง: Phenobarbital มี `drug_swap_policy` แค่ "เงื่อนไขเดียวกันทุกรายการ" ใน DB เพราะ col 2+3 ใน CSV ว่าง)
4. **`_matchHeader()` fuzzy match อาจ route header ผิด** — เพราะใช้ `includes()` หลัง exact match fail (ดู [db.js:184-193](../src/lib/db.js#L184)). header CSV ที่มีคำว่า "เปลี่ยน" อาจถูก map เป็น `supplier_changed` ทั้งที่ตั้งใจให้เป็น `swap_condition`
5. **ใช้ `service_role` key ใน Edge Function** ไม่ใช่ anon key — เพราะต้อง bypass RLS เพื่อดึง inventory ทั้งหมด
6. **LINE Notify ตายแล้ว** (สิ้นสุด 31 มี.ค. 2025, docs ลบ 12 พ.ค. 2025) — ต้องใช้ Messaging API (push เข้ากลุ่ม) เท่านั้น
7. **groupId capture ห้ามปนใน production function** — webhook LINE ยิงมาแบบไม่มี `Authorization: Bearer` → JWT verify reject 401. ใช้ function ชั่วคราว `--no-verify-jwt` แยกตัวแล้วลบ (ดู Setup LINE ข้อ 3)
8. **LINE push นับรายหัว** — คุม volume ด้วย **ความถี่ cron (สัปดาห์ละครั้ง)** ไม่ใช่แค่ guard `total===0` (ยาตัวเดิมเข้าเกณฑ์ทุกวันติดกันหลายเดือน → push ซ้ำทุกวันถ้าตั้งรายวัน)

## Troubleshooting

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| `535 Authentication failed` | App Password ผิด หรือยังไม่เปิด 2FA |
| email ไม่ถึง spam | ปกติของ Gmail SMTP — ขอให้ผู้รับ mark "not spam" รอบเดียว |
| cron ไม่รัน | เช็ค `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;` |
| response 500 + log timeout | inventory เยอะมาก → เพิ่ม timeout ใน function config |
| `Could not find table` | ใช้ service_role key ถูกหรือยัง (anon key มี RLS ขวาง) |

## เปรียบเทียบกับ Apps Script เดิม

| | Apps Script | Edge Function |
|---|---|---|
| Logic อยู่ที่ไหน | external | ใน repo (`supabase/functions/`) |
| Schedule | Apps Script trigger | pg_cron |
| แก้โค้ดต้องทำที่ไหน | Apps Script editor | local + `supabase functions deploy` |
| Email provider | GmailApp | Gmail SMTP (denomailer) |
| trigger จากแอปได้ | ต้อง deploy เป็น Web App | `supabase.functions.invoke()` ได้เลย |

> Apps Script เดิม ([docs/apps-script-expiry-alert.gs](apps-script-expiry-alert.gs)) เก็บไว้เป็น backup — สามารถปิด trigger ใน Apps Script ได้หลัง Edge Function ทำงานเสถียร
