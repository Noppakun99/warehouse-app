# Expiry Alert Edge Function (แทน Apps Script)

Supabase Edge Function ที่ทำหน้าที่แจ้งเตือนยาใกล้หมดอายุผ่าน email (แทน Google Apps Script เดิม)

- **Function**: [supabase/functions/expiry-alert/index.ts](../supabase/functions/expiry-alert/index.ts)
- **Cron migration**: [expiry_alert_cron.sql](../expiry_alert_cron.sql)
- **Email**: Gmail SMTP (denomailer) — ใช้ App Password ของ Gmail account

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

## เปลี่ยนแปลงการตั้งค่า

| ต้องการ | ทำยังไง |
|---|---|
| เปลี่ยน warningDays | `supabase secrets set WARNING_DAYS=300` |
| เพิ่ม/ลด email | `supabase secrets set ALERT_EMAILS=a@x.com,b@y.com` |
| เปลี่ยนเวลา cron | แก้ใน Dashboard SQL: `SELECT cron.unschedule('expiry-alert-daily');` แล้ว schedule ใหม่ |
| แก้ logic / template | แก้ `supabase/functions/expiry-alert/index.ts` → `supabase functions deploy expiry-alert` |

## Critical Rules (บทเรียนจาก migration จริง)

1. **ห้ามใช้ `denomailer` ส่ง UTF-8 ภาษาไทย** — มี bug ทำให้ subject แสดงเป็น `=?utf-8?Q?...?=` ดิบ และ body เป็น quoted-printable raw → ใช้ `npm:nodemailer@6.9.16` แทน (เสถียรกว่า, รองรับ UTF-8 ครบ)
2. **`drug_swap_policy` ใน DB เป็น merged column** — สร้างตอน CSV import โดย join `swap_condition + swap_items` ด้วย `' | '` ([db.js:286](../src/lib/db.js#L286)). ฉะนั้น **ไม่ต้องดึง `swap_condition`/`swap_items` แยก** — query แค่ `drug_swap_policy` พอ
3. **เช็คข้อมูลใน DB ก่อนสรุปว่า code bug** — เมื่ออีเมลโชว์ข้อมูลไม่ครบ มีโอกาสสูงที่ CSV ต้นทางกรอกไม่ครบ ไม่ใช่ code ดึงพลาด (ตัวอย่าง: Phenobarbital มี `drug_swap_policy` แค่ "เงื่อนไขเดียวกันทุกรายการ" ใน DB เพราะ col 2+3 ใน CSV ว่าง)
4. **`_matchHeader()` fuzzy match อาจ route header ผิด** — เพราะใช้ `includes()` หลัง exact match fail (ดู [db.js:184-193](../src/lib/db.js#L184)). header CSV ที่มีคำว่า "เปลี่ยน" อาจถูก map เป็น `supplier_changed` ทั้งที่ตั้งใจให้เป็น `swap_condition`
5. **ใช้ `service_role` key ใน Edge Function** ไม่ใช่ anon key — เพราะต้อง bypass RLS เพื่อดึง inventory ทั้งหมด

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
