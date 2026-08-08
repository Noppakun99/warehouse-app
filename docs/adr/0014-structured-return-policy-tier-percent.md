# 0014. นโยบายคืนยาแบบ structured (tier % + 3 ฐานเวลา) จากคอลัมน์ Auto-Match — แทน free-text parse เฟส 1

- **Status:** Accepted (design ผ่าน `/grill-with-docs` 2026-07-29 — ยังไม่ implement)
- **Date:** 2026-07-29
- **Supersedes (บางส่วน):** เฟส 1 ของ [[นโยบายเปลี่ยนยารายบริษัท]] ที่ "ไม่ parse ตัวเลข ใช้ threshold เดียว 365 วัน แสดง raw text" (CONTEXT.md §Supplier Swap Policy, [swapPolicy.js](../../src/lib/swapPolicy.js) เฟส 1). **ไม่ทับ** [ADR-0012](0012-swap-return-policy-per-lot-supplier.md) (per-lot supplier binding ยังใช้เหมือนเดิม — นี่แก้แค่ *วิธีอ่านนโยบาย* ไม่ใช่ *วิธีผูกกับ lot*)

## Context

เฟส 1 (ADR-0012 + swapPolicy.js) parse `receive_logs.drug_swap_policy` (free-text merged) ด้วย regex ตื้นๆ ได้แค่ 2 มิติ: **คืนได้/ไม่ได้** + **จำนวนเดือน** (return window ก่อน exp). ใช้งานจริงพบว่า**ตีความผิดหลายแบบ** เพราะนโยบายจริงมีมิติมากกว่านั้น:

- **เคส Diltiazem (บ.สยามฟาร์มา):** ข้อความ *"ไม่รับแลกเปลี่ยนคืน ยกเว้น บ.ส่งยาอายุสั้นต่ำกว่า 1 ปี ยินดีรับแลกเปลี่ยน"* — "1 ปี" คือ **threshold อายุยาตอนบริษัทส่ง** (บริษัทรับผิดชอบเฉพาะ lot ที่ตัวเองส่งมาอายุสั้น) ไม่ใช่ return window. parser เฟส 1 ดึง "1 ปี" → `months=12` → คำนวณ deadline = exp − 12 เดือน → แสดง badge "พ้นกำหนด" **ทั้งที่บริษัทไม่รับคืน lot นี้** (lot นี้รับตอนอายุเหลือ 1.5 ปี ≥ 1 ปี → เข้าเงื่อนไข "ไม่รับ").
- **tier % (123+ บิล):** *"อายุ > 2 ปี → คืน 100% / 6 เดือน–2 ปี → 50% / < 6 เดือน → 25%"* — เฟส 1 ดึงแค่เลขน้อยสุด (6) ทิ้ง tier ทั้งหมด.
- **window หลัง exp (626 บิล — ก้อนใหญ่สุด):** *"เปลี่ยนคืนได้หลังหมดอายุไปแล้ว"*, *"รับคืนหมดอายุไปแล้วภายใน 3 เดือน"* — deadline = exp **+** N (parser เฟส 1 ทำ exp − N ผิดทิศ).

**ข้อเท็จจริงที่ปลดล็อกการแก้ (verify จาก `csvfile/รับ.csv`):** Excel แม่ที่คลัง maintain เอง มีคอลัมน์ **Auto-Match** ที่**คลังแปลง free-text → structured ให้แล้ว**:
- **col 28 `รายละเอียดเงื่อนไขการแลกเปลี่ยน (Auto-Match)`** — มี **แค่ 25 แบบ distinct** (ไม่ใช่ free-text ไม่จำกัด) รูปแบบสะอาด เช่น `อายุ > 2 ปี → คืน 100%` (มี `→`, tier แยกบรรทัด).
- **col 29 `% คืนโดยประมาณ (Auto-Match)`** — enum: `100% / 50-100% / 25-100% / 30% / 0% / ตามจำนวนจริง / ? / -`.
- **ฐานเวลา verify แล้ว: ทั้ง 25 แบบคำนวณได้ด้วย `receive_date` + `exp` เท่านั้น — 0 แบบต้องใช้วันผลิต** (คลังแปลง "นับจากวันผลิต" → "อายุยาเหลือ อิง exp" ให้หมดแล้ว). ระบบมี `receive_date` + `exp` แต่**ไม่มีวันผลิต** — constraint นี้จึงไม่กระทบ.

## Decision

อ่านนโยบายจาก **col 28 (structured detail) + col 29 (% enum)** เป็น primary source แล้ว parse เป็น model ที่คำนวณ tier/deadline/% ต่อ lot ได้ — **ให้แอปตรวจซ้ำ (cross-check) กับ free-text ดิบด้วย** ไม่เชื่อ source เดียว.

1. **Import 2 คอลัมน์ใหม่** (add-csv-column pattern) เข้า `receive_logs`: `swap_tier_detail` (col 28) + `swap_return_pct` (col 29). คง `drug_swap_policy` (free-text merged เดิม) ไว้แสดง raw + cross-check.

2. **Parser ใหม่อ่าน structured detail (col 28)** — ครอบ 25 แบบ จัดเป็น **6 หมวดตามฐานเวลา** (ทุกหมวดคำนวณด้วย `receive_date` + `exp`):

   | หมวด | ฐานเวลา | deadline / logic |
   |------|---------|------------------|
   | 1. หลัง exp | window หลังหมดอายุ | `exp + N` |
   | 2. ก่อน exp | แจ้งก่อน exp N เดือน | `exp − N` |
   | 3. อายุยาเหลือ (tier) | `exp − วันที่คืน` (**3a — ณ วันที่คืน ไม่ใช่ตอนรับ**) | **ช่วงวันที่ต่อ %**: ถึง D1 ได้ 100% / D1–D2 ได้ 50% / D2–exp ได้ 25% |
   | 4. threshold อายุตอนรับ | `exp − receive_date` (Diltiazem) | เทียบกับ threshold → คืนได้/ไม่ได้ |
   | 5. binary | — | "ไม่รับคืน"/"ขายขาด"/"ไม่มีนโยบาย" → คืนไม่ได้ |
   | 6. กำกวม (`%=?` / "ไม่ระบุชัดเจน") | — | **flag ไม่เดา** → "⚠ เงื่อนไขไม่ชัด โปรดดูเอกสารบริษัท" + raw text |

3. **หมวด 3 = 3a (อายุเหลือ ณ วันที่คืน):** แสดง**ช่วงวันที่ต่อ %** เมื่อ tier ระบุ threshold ชัด (>2ปี/6ด–2ปี/<6ด). tier % สะท้อนหลักสากล "ยิ่งใกล้ exp ยิ่งคืนได้น้อย".

4. **Cross-check (defense-in-depth — "ให้แอปตรวจอีกที"):** parse ทั้ง col 28 (structured) **และ** col 20-22 (free-text ดิบ) แล้วเทียบ — ถ้าขัดกัน → flag "⚠ นโยบายไม่สอดคล้อง โปรดตรวจสอบ". ไม่เชื่อ Excel Auto-Match ตาบอด.

5. **Sync 2 surface:** logic ใหม่ใน `src/lib/swapPolicy.js` (แอป/popup แจ้งหัวหน้า) **ต้อง copy ไป** `supabase/functions/expiry-alert/index.ts` (email Gmail) — Deno import node module ตรงไม่ได้ (ดู [docs/expiry-alert-edge-function.md](../expiry-alert-edge-function.md)).

6. **per-lot supplier binding (ADR-0012) ไม่เปลี่ยน** — ยัง match `code|lot` unique เท่านั้นจึงคำนวณ deadline. ADR นี้แก้แค่ "อ่านนโยบายยังไง" หลังผูก supplier ได้แล้ว.

## Consequences

- **Positive:** เคส conditional (Diltiazem) + tier % + window หลัง exp คำนวณถูก — "แจ้งหัวหน้าได้ทันทีด้วยข้อมูลแม่นยำ" (เป้าหมาย user).
- **Positive:** พึ่ง structured ที่คลัง maintain เอง (25 แบบจำกัด) → parser แม่นกว่า free-text ไม่จำกัดมาก; ไม่ต้องสร้างตาราง DB/UI กรอกใหม่ (structured มาจาก CSV แล้ว).
- **Positive:** cross-check + flag หมวดกำกวม = fail-safe — เคสที่ระบบไม่มั่นใจจะบอก "ตรวจเอง" ไม่เดาผิด.
- **Negative / trade-off:** ผูกกับ**รูปแบบ col 28 ของ Excel แม่** — ถ้าคลังเปลี่ยนรูปแบบ (เพิ่มแบบที่ 26+) parser ต้องอัพเดต. บรรเทาด้วย: หมวด 6 (กำกวม) รับแบบที่ parse ไม่ได้ → flag แทน crash.
- **Negative / trade-off:** ต้อง sync `swapPolicy.js` ↔ `index.ts` ทุกครั้งที่แก้ (bug-prone ตาม Critical Rule เดิม) — เพิ่ม golden test ครอบ 25 แบบ ลดความเสี่ยง.
- **Assumption:** col 28/29 คลัง maintain สม่ำเสมอ + ครบทุกแถวที่มีนโยบาย (user ยืนยัน "เชื่อได้ แต่ให้แอปตรวจอีกที" → cross-check จับกรณีไม่ครบ).

## Alternatives considered

- **auto-parse free-text ดิบ (col 20-22) ให้ฉลาดขึ้น** — regex บนข้อความมือเขียนไม่ standard ไม่มีทางแม่น 100% (พบ typo, วงเล็บไม่ปิด, บาง tier อ้าง "วันผลิต" ที่ระบบไม่มี). ขัดเป้า "แม่นยำพอแจ้งหัวหน้า".
- **สร้างตาราง `supplier_return_policy` + UI ให้คลังกรอก tier ใหม่** — ซ้ำซ้อน เพราะคลังทำ structured ไว้ใน Excel col 28 แล้ว; สร้าง 2 source ที่ต้อง sync. (ถูกปฏิเสธหลัง verify ว่า col 28 มีอยู่จริง).
- **safe fallback อย่างเดียว (ไม่ parse tier — แค่หยุดแสดงผิด แสดง raw)** — แก้ pain "แสดงผิด" ได้ด้วยงานเล็ก แต่ไม่ตอบเป้า user ที่ต้องการ "% + ช่วงวันที่ เพื่อแจ้งหัวหน้า". เก็บเป็น fallback ของหมวด 6 เท่านั้น.
