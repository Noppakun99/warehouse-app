---
name: apply-location-moves
description: ลงใบแจ้งย้ายที่เก็บ (ตาราง location_move ที่เจ้าหน้าที่คลังกดย้ายในแผนผัง) ลงไฟล์ ยอดคลังยา_69.xlsm ชีท Master คอลัมน์ D/E + ชีท list แล้วนำเข้าแอปให้ใบปิดเอง. Use when check-complete.py แจ้ง "ใบแจ้งย้ายที่เก็บรอลง Excel" หรือ user สั่ง ลงใบย้ายที่เก็บ / ย้าย log / ที่เก็บในแอปไม่ตรง Excel
---

# Skill: apply-location-moves

ลงใบแจ้งย้ายที่เก็บลง Excel — นิยาม [CONTEXT.md §ใบแจ้งย้ายที่เก็บ](../../../CONTEXT.md) · ออกแบบ [docs/features/location-move.md](../../../docs/features/location-move.md)

**user อนุญาตถาวร (27/10/2569): check-complete เจอใบ pending → รัน skill นี้เลย ไม่ต้องถาม แล้วรายงานในสรุป** · ยกเว้น Excel เปิดอยู่ / ด่านไม่ผ่าน / ใบ conflict = หยุดบอก user

กฎ `/excel-com` ใช้ทั้งหมด (สำเนา scratchpad · `AutomationSecurity=3` · `Calculate` ไม่ใช่ `CalculateFull` · ไม่ kill Excel) — สคริปต์ในขั้น 3 ทำให้แล้ว

## ขั้นตอน

```bash
SP=<scratchpad>/xl ; S="/c/Users/PRH0000484/OneDrive/ยอดคลังยา_69.xlsm"
```

1. **ดูใบ**: `node scripts/location-moves.mjs` — มีแต่ `[conflict]` = อย่าลงเอง (ข้อ "ใบ conflict" ข้างล่าง)
2. **ไฟล์ว่าง + สำเนา**: `tasklist | grep -i excel` ว่าง · ไม่มี `~$ยอดคลังยา_69.xlsm` → `cp "$S" $SP/stock_orig.xlsm && cp "$S" $SP/stock_work.xlsm`
3. **แผน**: `node scripts/location-moves.mjs --plan --file "$(cygpath -w $SP/stock_work.xlsm)" --out "$(cygpath -w $SP/lm_plan.json)"`
   - ใบที่ `Master แถว (ไม่พบ ...)` = Excel ไม่ได้เป็นที่เก็บเดิมแล้ว → อย่าลง · การนำเข้ารอบหน้าจะตั้งใบเป็น conflict/applied เอง
   - `list ข้าม` = รหัสนั้นหลังย้ายอยู่หลายที่เก็บ (ตกลง 27/10/2569: ไม่แก้ list) → รายงาน user
4. **เขียนสำเนา**: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/apply-location-moves.ps1 -StockPath "<work>" -PlanPath "<plan>" -LogPath "<log>"` แล้ว `cat` log — ต้องจบ `SAVED` + `DONE` (มี `ERROR` = ไม่ได้ Save ห้ามไปต่อ)
5. **ตรวจ**: `python -B scripts/xlsm_verify.py $SP/stock_orig.xlsm $SP/stock_work.xlsm --plan $SP/lm_plan.json` → ต้อง `✓ ผ่าน` (ต่างเฉพาะ D/E แถวในแผน + VBA codepage/โมดูลเท่าเดิม)
6. **วางกลับ**: `tasklist` ว่าง → `cmp "$S" $SP/stock_orig.xlsm && cp $SP/stock_work.xlsm "$S" && cmp "$S" $SP/stock_work.xlsm`
7. **นำเข้า**: `node scripts/import-master.mjs` (dry-run แถวเท่าเดิม) → `--commit` — `saveInventory` เรียก `reconcileLocationMoves` ใบจะเป็น `applied` เอง
8. **ยืนยัน**: `node scripts/location-moves.mjs` ต้องไม่เหลือใบที่ลงแล้ว · รายงาน user: ใบไหน ยาอะไร lot ไหน จาก → ไป · ใครแจ้ง · list แก้/ข้าม

## ใบ conflict
ไฟล์ Excel ที่เก็บไม่ใช่ทั้งค่าเดิมและค่าใหม่ของใบ (มีคนแก้ Master เอง / lot หายจากไฟล์) → **ถาม user** ว่าที่ถูกคือที่ไหน:
- ใบถูก → แก้ Excel ตามใบ (ขั้น 2–7 แต่ต้องแก้ `from` ในแผนเป็นค่าปัจจุบัน — ทำแผนมือ) แล้ว `--resolve <id> --status applied`
- Excel ถูก → `node scripts/location-moves.mjs --resolve <id> --status superseded --note "<เหตุผล>"`

## กับดัก
- **หน่วยย้าย = รหัส + lot + ที่เก็บเดิม** — lot เดียวแยกแถวตามที่เก็บได้ (Manidipine 260873) แผนจึงจับแถวด้วยที่เก็บเดิมด้วย ห้ามแก้ทุกแถวของ lot
- MainLog (D) มาจากใบ (`to_main_log`) — ชั้นวาง = ตัวอักษรนำ · โซนพิเศษ = ค่าที่ใช้อยู่ใน Master (คลังถุงขวดตลับ → `คลังถุง/ขวด/ตลับ`)
- snapshot `Master_<เดือนก่อน>` ไม่แตะ (งวดปิด ที่เก็บไม่อยู่ใน key ของสูตร S)
- ส่วนต่างตอนกดนำเข้าจาก Excel ในแอปจะขึ้น "ลบ + เพิ่ม" ของแถวที่ย้าย (`location` อยู่ใน pairKey ของ excelSync) — ปกติ ไม่ใช่ข้อมูลหาย
