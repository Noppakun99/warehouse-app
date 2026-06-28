# 0007. ทะเบียนคงคลังรายเดือน (Monthly Stock Ledger) ในแอป — แทนการปิดงวดมือใน Excel

- **Status:** Accepted
- **Date:** 2026-06-28

## Context

ระบบบัญชีมูลค่าคงคลังจริงของคลังยาทำใน Excel `ยอดคลังยา_69.xlsm` (sheet `master`, 45 column, ~969 แถว). หัวใจคือ **สมการคงคลัง** ที่ทุกแถวต้องเป็นจริงทุกเดือน (ดู [[สมการคงคลัง (Stock Identity)]] ใน CONTEXT.md):

```
มูลค่า:  AB = AC + AA − Z (+ Y ถ้าแก้ไขระบบ)     [มูลค่าคงคลัง = ยกมา + ซื้อ − เบิก + ปรับ]
จำนวน:  U  = S  − T                              [closing = opening − เบิกรวม] ต่อแถวบัญชี
```

ทุกสิ้นเดือนต้อง **"ขึ้นเดือนใหม่"** ด้วยมือ (จาก context sheet, Step 0–5): duplicate sheet → paste `U→N` (closing เป็น opening) → paste `AB→AC` (มูลค่าปิดเป็นมูลค่ายกมา) → override AC ติดลบมือ ~7 แถว → แปลงชนิดรายการ (`ซื้อยา→ยกยอด`) → แก้ header. ขั้นตอนนี้ **เปราะและพลาดง่าย** — context sheet มี checklist แก้ AC ติดลบ + bug history (v9.20–v9.54) + บทเรียน "AC ติดลบ" เป็นหลักฐานว่างานมือนี้คือจุดเจ็บหลัก.

ข้อเท็จจริงเชิงข้อมูล (verify จาก master sheet จริง):
- **Identity ของแถวบัญชี ≠ รหัสยา.** key = `รหัสยา(F) + Lot(K) + ชนิดรายการ(M) + ราคา/หน่วย(J)` — เพราะ lot='-' เดียวกันมีได้หลายราคา = หลาย [[cost layer (ชั้นต้นทุน)]] ที่มูลค่าต่างกัน **ห้ามรวม qty ข้ามราคา** (รวมแล้วมูลค่าส่งบัญชีผิดทั้งเดือน — มี precedent S003 ใน context).
- มี **manual adjustment** ที่ derive จากข้อมูลดิบไม่ได้: แถว `ชนิดรายการ=แก้ไขระบบ` (ปรับยอดติดลบเดือนก่อน), AC override, การจัด S ของ cost layer.
- บัญชีที่ **ปิดงวดแล้ว เลขต้องไม่ขยับ** — ถ้าแก้ข้อมูลดิบ (receive/dispense) ย้อนหลัง ยอดเดือนที่ปิดไปแล้วต้องคงเดิม (หลักการบัญชี).
- ข้อมูลดิบรับ/เบิกมีอยู่แล้วใน `receive_logs` / `dispense_logs` — ledger เป็น **สรุปยอด+มูลค่าต่อแถวบัญชีต่อเดือน** ไม่ใช่ event log ใหม่.

ขอบเขตงาน (ยืนยันกับ user): **เฟสแรก = snapshot รายเดือน** — app เก็บ snapshot คงเหลือ+มูลค่าสิ้นเดือนแล้ว rollover ขึ้นเดือนใหม่แบบ atomic; การกรอกรับ/เบิกยังอยู่ใน sub-app เดิม.

## Decision

**1. ตาราง `stock_ledger` — 1 แถว = หนึ่ง[[แถวบัญชี (Ledger Row)]] × หนึ่งงวดเดือน.**
   - `period` (TEXT `YYYY-MM`) ระบุงวด.
   - Identity columns: `drug_code, lot, item_type, price_per_unit` (= ledger row key).
   - บัญชีจำนวน: `opening_qty (S), in_qty (P), out_qty (T), adjust_qty, closing_qty (U)`.
   - บัญชีมูลค่า: `carry_in_value (AC), in_value (AA), out_value (Z), adjust_value (Y), closing_value (AB)`.
   - descriptive (snapshot ณ งวดนั้น): `drug_name, drug_type, unit, med_category (ยา/มิใช่ยา), company`.
   - `status` (`open` | `closed`) — งวดที่ `closed` ห้ามแก้.
   - unique: `(period, drug_code, lot, item_type, price_per_unit)`.

**2. เดือนเดินอยู่ (`open`) = derive สด + adjustment.**
   `closing_qty = opening_qty + in_qty − out_qty + adjust_qty` คำนวณจาก `receive_logs`/`dispense_logs` ของงวด + opening (จากงวดก่อน) + adjustment row ที่คนเพิ่ม. **ยังไม่ freeze.** ตัวเลขสดเสมอ.

**3. ปิดงวด = freeze snapshot (atomic).** ฟังก์ชันเดียวใน `db.js` (`closeLedgerPeriod(period, auth)`):
   - คำนวณ closing สุดท้ายของงวด → เขียนทับเป็น **static value** → set `status='closed'`.
   - สร้างแถวงวดถัดไป: `opening_qty ← closing_qty`, `carry_in_value ← closing_value`, แปลง [[ชนิดรายการ (Item Type)]] (`ซื้อยา→ยกยอด` ฯลฯ), **ลบแถว `แก้ไขระบบ` ไม่ให้ค้างข้ามงวด**.
   - logged ผ่าน `insertAuditLog` (action `close_ledger_period`).

**4. Adjustment = แถว ledger ที่ `item_type='แก้ไขระบบ'`.** คนเพิ่มเพื่อ tie-out (เช่น ล้างยอดติดลบเดือนก่อน). มีผลต่อ `adjust_qty/adjust_value` เท่านั้น ไม่แตะข้อมูลดิบ. ถูกลบตอนปิดงวด.

**5. Seed ครั้งแรกจาก Excel `master` เดือนล่าสุด.** import sheet `master` (เช่น มิ.ย.69) เป็น ledger งวดตั้งต้น (opening + carry-in value มาจาก N/AC ที่ paste-as-value แล้ว) — **ครั้งเดียว** จากนั้น app rollover ต่อ. ไม่ derive opening ใหม่จากประวัติทั้งหมด (เพราะมี manual override ที่ derive ไม่ได้).

**6. ไม่แตะข้อมูลดิบ.** `receive_logs`/`dispense_logs`/`inventory` คงเดิม — ledger เป็น layer ใหม่เหนือมัน. `inventory.qty` ยังไม่ถูกหักอัตโนมัติ (เหมือน picking workflow เดิม).

## Implementation (เฟส 1 — เสร็จ)

- **Pure logic:** `src/lib/ledgerRollover.js` (golden-testable, ไม่ import supabase — `npm run test:ledger`, 18 assertions):
  - `computeClosing(row)` → เติม `closing_qty/closing_value` ตามสมการคงคลัง (round 4dp).
  - `rolloverToNextPeriod(closedRows, nextPeriod)` → แถวงวดถัดไป (U→S, AB→AC, แปลง item_type ตาม `ROLLOVER_TYPE_MAP`, ตัดแถว `แก้ไขระบบ`).
- **I/O layer (db.js):**
  - `fetchLedgerPeriod(period)` — paginate ข้าม 1000-row.
  - `fetchLatestLedgerPeriod()` — งวดล่าสุด + status.
  - `closeLedgerPeriod(period, nextPeriod, auth)` — **atomic**: freeze closing + `status='closed'` → insert แถวงวดถัดไป; กันปิดซ้ำ + กันงวดถัดไปมีอยู่แล้ว; audit `close_ledger_period`.
  - `reopenLedgerPeriod(period, nextPeriod, auth)` — ลบงวดถัดไป + คืน `status='open'`; กันเปิดถ้างวดถัดไปปิดไปแล้ว; audit `reopen_ledger_period`.
- **Audit:** 2 action ใหม่อยู่ใน `ACTION_LABELS` ([AuditLogApp.jsx](../../src/AuditLogApp.jsx)) เท่านั้น — **ไม่เข้า notification bell** (admin action รายเดือน ไม่ใช่ event ที่ staff ต้อง react).
- **Schema:** `stock_ledger_migration.sql` (ต้องรันใน Supabase Dashboard ก่อน deploy).
- **ยังไม่ทำ (เฟสถัดไป):** seed จาก master sheet จริง, UI ledger view, adjustment workflow, audit drift view.

## Consequences

- **Positive:** rollover ขึ้นเดือนใหม่เป็น operation atomic ครั้งเดียว — แทนงานมือ 5 ขั้นที่พลาดง่ายที่สุดใน Excel (paste U→N, AB→AC, override, แปลงชนิด, แก้ header).
- **Positive:** งวดที่ปิดแล้ว freeze เป็น value — เลขไม่ขยับแม้แก้ข้อมูลดิบย้อนหลัง (ตรงหลักบัญชี).
- **Positive:** cost layer (รหัส+lot+ชนิด+ราคา) เป็น first-class ใน key — กันบั๊ก "รวม qty ข้ามราคา" ที่ Excel ต้องระวังเอง.
- **Negative / trade-off:** ledger อาจ **drift** จากข้อมูลดิบ (closing ≠ ผลรวม dispense จริง) — เหมือน Excel ที่ต้องมี `/scan-issues` `/audit-master`; ต้องมี audit view เทียบ ledger กับ raw (เฟสถัดไป).
- **Negative / trade-off:** ปิดงวดกลับยาก — ต้องมี `reopen_ledger_period` (admin only) + ทุก reopen logged; ปิดผิดงวดแล้ว opening เดือนถัดไปผิดตาม.
- **Negative / trade-off:** seed ครั้งแรกต้อง map 45-col master sheet ให้ตรง — เสี่ยง mapping ผิดครั้งเดียวกระทบทุกงวดถัดไป; ต้อง tie-out ยอดรวมหลัง seed ก่อนใช้จริง.
- **ขอบเขตที่ยังไม่ครอบ (เฟสถัดไป):** UI ledger view, adjustment workflow, audit drift view, การ map ยา/มิใช่ยา อัตโนมัติ, มูลค่าบริจาค+สนับสนุน (AD/AE/AF).

## Alternatives considered

- **Derive ledger สดทั้งหมด ไม่มี stored table (ไม่มี adjustment).** ปฏิเสธ: ไม่รองรับ manual adjustment (`แก้ไขระบบ`, AC override, cost layer) ที่งานจริงต้องมี; แก้ข้อมูลดิบย้อนหลังทำให้ยอดงวดที่ปิดแล้วเปลี่ยน — ผิดหลักบัญชี.
- **ledger key = รหัสยา อย่างเดียว (per-drug).** ปฏิเสธ: ทำลาย cost layer — lot='-' หลายราคารวมกัน มูลค่าคงคลังผิด (precedent S003).
- **ให้ app แทน Excel ทั้งระบบ (รวมการกรอกรับ/เบิก) ทันที.** ปฏิเสธ (ตอนนี้): scope ใหญ่/กลับยากเกิน; เริ่มที่ snapshot รายเดือนซึ่งเป็นจุดเจ็บจริง แล้วค่อยขยาย.
- **คง Excel ไว้ทั้งหมด ทำแค่ import/แสดงใน app (งาน A).** เป็น baseline ที่ทำไปแล้ว (unit aliases + header detect) — ADR นี้คือก้าวถัดจากนั้นตามที่ user เลือก "ลองให้ app แทนส่วนบัญชี".
