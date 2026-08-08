# 0006. สแกนบิลใช้ Claude Opus 4.8 Vision (แทน Gemini 2.0 Flash) — ออกแบบให้สลับ provider ได้

- **Status:** Accepted
- **Date:** 2026-06-25

## Context

Edge Function `scan-invoice` (`supabase/functions/scan-invoice/index.ts`) เดิมเรียก **Google Gemini 2.0 Flash** อ่านภาพบิล → คืน JSON (ชื่อยา/lot/qty/ราคา) ให้กรอกเข้า `receive_logs`. (หมายเหตุ: เอกสาร `docs/features/invoice-scanner.md` ระบุว่าใช้ "Claude Vision / ANTHROPIC_API_KEY" — **ขัดกับโค้ดจริง** ที่ใช้ Gemini/`GEMINI_API_KEY`; doc drift ที่ต้องแก้พร้อม ADR นี้).

ผู้ใช้ทบทวน flow เพราะ 2 เรื่อง:
1. **ความแม่นไม่พอ** — บิลจริงเป็นกระดาษต่อเนื่อง carbon จาง เอียง ถ่ายด้วยมือถือ มือบัง ตัวเลข lot พิมพ์ทับเส้นตาราง. ผู้ใช้ต้องการ "อ่านตรงกับบิล 99%".
2. **กังวลเรื่องค่าใช้จ่าย** ("ก่อนหน้ามีเรื่องเสียเงิน").

ข้อเท็จจริงเชิงปริมาณ (จากผู้ใช้): รับบิล **~100–150 บิล/เดือน** = สแกน ~150 ครั้ง/เดือน.

ข้อเท็จจริงเชิงราคา (model data มิ.ย. 2026, ภาพบิล ~1,500 input token + ~800 output token ต่อใบ):

| Provider | ราคา (input/output ต่อ 1M token) | ต้นทุน ~150 บิล/เดือน | Vision บน carbon จาง |
|---|---|---|---|
| Gemini 2.0 Flash (เดิม) | ถูกมาก | < 5 บาท/เดือน | ปานกลาง (ผู้ใช้ว่าไม่พอ) |
| Claude Sonnet 4.6 | $3 / $15 | ~3–4 บาท/เดือน | ดีกว่า Gemini |
| **Claude Opus 4.8** | **$5 / $25** | **~6–8 บาท/เดือน** | **แม่นสุด — vision ละเอียดสูง (รับภาพถึง 2576px ขอบยาว)** |

**ข้อค้นพบสำคัญ:** ที่ปริมาณ 150 บิล/เดือน **ทุก provider ต้นทุนหลักบาท/เดือน** — ส่วนต่าง Opus กับ Gemini เพียง ~5 บาท/เดือน ไม่มีนัยสำคัญ. เรื่อง "เสียเงิน" ที่กังวลตอนแรกจึงแทบไม่ใช่ปัญหาที่ปริมาณนี้ (จะเป็นปัญหาเมื่อสแกนหลักหมื่น–แสนครั้ง/เดือน ซึ่งไม่ใช่กรณีนี้).

## Decision

1. **เปลี่ยน provider เป็น Claude Opus 4.8** (`claude-opus-4-8`) สำหรับ vision OCR บิล — เลือกตาม**ความแม่น** ไม่ใช่ราคา เพราะที่ปริมาณนี้ราคาต่างกันไม่มีนัยสำคัญ แต่ความแม่นบนบิล carbon จาง/เอียง/ถ่ายมือถือ ต่างกันมาก. Opus 4.8 มี high-resolution vision (ออกแบบมาสำหรับ document/screenshot/บิลโดยเฉพาะ).

2. **เรียกผ่าน Anthropic Messages API** (`POST /v1/messages`) ด้วย image content block + prompt เดิม (โครงสร้าง JSON เดียวกับที่ Gemini คืน เพื่อไม่ต้องแก้ฝั่ง frontend/`insertScannedBillRows`). ใช้ secret `ANTHROPIC_API_KEY` ผ่าน Edge Function เท่านั้น (ห้าม expose ใน frontend — กฎเดิมใน invoice-scanner.md).

3. **ออกแบบ Edge Function ให้สลับ provider ได้** ผ่าน env var (เช่น `SCAN_PROVIDER=claude|gemini`) — frontend เรียก `scanInvoiceImage()` เหมือนเดิมไม่ว่าใช้ provider ไหน. เพื่อให้ A/B เทียบ Gemini vs Opus บนบิลจริงได้ก่อนล็อกถาวร และ rollback ได้เร็วถ้า Opus มีปัญหา.

4. **"99%" ไม่ได้มาจาก model อย่างเดียว** — บิลแบบในตัวอย่าง (carbon จาง เอียง มือบัง) ไม่มี AI ตัวไหนการันตี 99% ได้. ความแม่นที่แท้จริงต้องมาจาก **staging ให้คน verify/แก้ก่อน insert** (ดู [ADR-0007 ถ้ามี] / flow สแกนบิล) — model ที่แม่นขึ้นแค่*ลดงานแก้*ของคน ไม่ใช่แทนการ verify.

## Consequences

- **Positive:** อ่านบิล carbon จาง/เอียงแม่นขึ้นชัดเจน → ลดงานแก้ของเจ้าหน้าที่ตอน verify staging.
- **Positive:** ต้นทุนเพิ่มจาก Gemini เพียง ~5 บาท/เดือน ที่ปริมาณ 150 บิล — แทบไม่มีผล.
- **Positive:** env-var provider switch → A/B + rollback ได้ทันที ไม่ต้องแก้ frontend.
- **Positive:** กลับไปตรงกับเอกสาร `invoice-scanner.md` ที่ระบุ "Claude Vision / ANTHROPIC_API_KEY" อยู่แล้ว (แก้ doc drift).
- **Negative / trade-off:** Opus แพงกว่า Gemini/Sonnet ต่อ token — ถ้าวันหนึ่งปริมาณพุ่งเป็นหลักหมื่น/เดือน ต้องทบทวน (ดาวน์เป็น Sonnet 4.6 หรือกลับ Gemini). env-var switch ทำให้ทบทวนง่าย.
- **Negative / trade-off:** ต้องตั้ง `ANTHROPIC_API_KEY` secret + แก้ payload เป็นรูปแบบ Messages API (image block + `max_tokens` + parse `content[].text`) — ต่างจาก payload Gemini เดิม.
- **Negative / trade-off:** ต้องเฝ้าระวัง billing เผื่อมีใครยิง scan รัว (rate limit / billing alert) — ไม่ใช่ปัญหา accuracy แต่เป็น cost-safety.
- **Follow-ups / risks:** (1) ตรวจ image size — Opus 4.8 รับถึง 2576px ขอบยาว และ token รูปสูงขึ้นได้ ~3x ถ้าส่งภาพเต็มความละเอียด; ถ้าต้องคุมต้นทุนค่อย downsample (แต่ไม่ default เพราะรายละเอียดบนบิล carbon จางต้องการ resolution). (2) เทียบ accuracy จริง Gemini vs Sonnet vs Opus บนบิล 5–10 ใบที่อ่านยากก่อน rollout เต็ม. (3) แก้ doc `invoice-scanner.md` ให้ตรงโค้ดใหม่.
