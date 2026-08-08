# 0002. VEN ที่ว่าง (ไม่ระบุ) ให้ถือเป็น Essential (ตัวคูณ 1.5)

- **Status:** Accepted
- **Date:** 2026-06-14

## Context

สูตร Safety Stock ในการวิเคราะห์สั่งซื้อยา (`reorder.js`) คูณยอดใช้เฉลี่ยด้วย **ตัวคูณ VEN**:
V=Vital ×2.0, E=Essential ×1.5, N=Non-essential ×1.0. ค่านี้เก็บใน
`drug_reorder_config.risk_group` (ค่า `Critical`/`Essential`/`Normal`).

ปัญหา: **`drug_reorder_config` ปัจจุบันว่างเปล่า (0 แถว)** — ยังไม่มีใครจัดกลุ่ม VEN
ให้ยา ~390+ รายการ. โค้ดเดิม fallback ค่าว่าง → `'Normal'` (×1.0) ทำให้ยา **ทุกตัว**
คำนวณ SS/ROP ที่ ×1.0. แต่ไฟล์ Excel ต้นฉบับ (source of truth — ดู [ADR-0001](0001-reorder-recompute-vs-import.md))
คำนวณยาที่ยังไม่จัดกลุ่มด้วย **×1.5 (Essential)** เป็นค่าเริ่มต้น. ผลคือ SS/ROP ของแอพ
ต่ำกว่า Excel ~33% ทั้งกระดาน → เสี่ยงสั่งซื้อน้อยเกินจน stock ขาด.

ยืนยันด้วยแถวจริงจาก Excel ที่ user paste (Aspirin81, Lidocaine, Triamcinolone, Allopurinol):
ทุกแถวจับคู่ตรง Excel เป๊ะ **ก็ต่อเมื่อใช้ ×1.5** กับยาที่ไม่มีกลุ่ม.

`constants.ven_multipliers.default = 1.5` ในสเปก (`pharmacy_inventory_spec.json`) ระบุชัดว่า
ค่า default คือ Essential.

## Decision

**VEN ที่ว่าง/null ให้ถือเป็น Essential (ตัวคูณ 1.5)** ไม่ใช่ Normal (1.0).

ทำ 2 ชั้นเพื่อไม่ให้ fallback กลายเป็น dead code:

1. `reorder.js` — `RISK_MULTIPLIER[riskGroup] ?? 1.5` (default 1.5 ไม่ใช่ 1.0)
2. `ReorderApp.jsx` — ตอน map config → drug ส่ง `riskGroup: cfg.risk_group || null`
   (ไม่ใช่ `|| 'Normal'`) เพื่อให้ค่าว่าง **ไปถึง** fallback ×1.5 ข้างต้น —
   ถ้ายัง coalesce เป็น `'Normal'` ก่อน fallback ×1.5 จะไม่มีวันทำงาน

Badge VEN บนตารางแสดง **"E?"** สำหรับยาที่ยังไม่จัดกลุ่ม (`?` = ค่า default ไม่ใช่
การจัดกลุ่มจริง) — ตามกฎ Critical Rule #6 (ตัวเลขที่โชว์ต้องตรงกับที่คำนวณ: คำนวณ ×1.5
ก็ต้องโชว์ E ไม่ใช่ N). ยาที่จัดกลุ่มเป็น `Normal` จริงยังโชว์ "N" (×1.0) ตามเดิม.

## Consequences

- Positive: SS/ROP ตรง Excel ทันทีโดยไม่ต้องรอจัดกลุ่ม VEN ครบ; เริ่มสั่งซื้อจากแอพได้เลย;
  badge "E?" สื่อสารชัดว่าเป็นค่า default รอจัดกลุ่ม ไม่ทำให้เข้าใจผิดว่าจัดแล้ว.
- Negative / trade-off: ยาที่ "จริงๆ เป็น N" แต่ยังไม่จัดกลุ่มจะถูกคำนวณเกินจริง ~33%
  (สั่งมากกว่าที่ควร) จนกว่าจะจัดกลุ่ม — ยอมรับได้เพราะ over-stock ปลอดภัยกว่า stock-out
  และตรงกับสิ่งที่ Excel ทำอยู่แล้ว.
- Follow-up: เมื่อจัดกลุ่ม VEN ครบใน `drug_reorder_config` แล้ว badge "E?" จะหายไปเอง
  (กลายเป็น V/E/N จริง) — ใช้จำนวน "E?" ที่เหลือเป็น progress indicator ของการจัดกลุ่ม.

## Alternatives considered

- **คง default = Normal (×1.0)** — ตรงกับชื่อ field เดิม (`|| 'Normal'`) และไม่ over-stock
  แต่ขัด Excel/สเปก และทำให้ SS/ROP ต่ำกว่าจริง 33% ทั้งระบบจนเสี่ยง stock-out. ปฏิเสธ.
- **บังคับจัดกลุ่ม VEN ก่อนใช้งาน Reorder** — ได้ค่าถูกต้องที่สุด แต่ block การใช้งานทั้งหมด
  จนกว่าจะจัดครบ ~390 รายการ. ปฏิเสธ — default 1.5 + badge "E?" ให้เริ่มใช้ได้ทันทีและ
  เห็น progress การจัดกลุ่มควบคู่กัน.
