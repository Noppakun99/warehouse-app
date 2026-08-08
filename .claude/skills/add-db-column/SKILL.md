---
name: add-db-column
description: Add a new explicit column to the warehouse-app Supabase DB and wire it end-to-end (SQL + db.js + CSV import). Use when the value must be filtered or queried in the DB, not just read from CSV.
---

Add a new explicit column to the warehouse-app database and wire it end-to-end.

> **Karpathy: Think Before Coding** — ถามก่อน implement เสมอ

---

## Step 0: Surface Assumptions ก่อนเขียนโค้ด

ก่อนทำอะไรเลย ต้องถามและยืนยัน:

1. **Column นี้จำเป็นต้องอยู่ใน DB จริงไหม?**
   - ถ้าใช้แค่ "อ่านจาก CSV + แสดง UI" → ใช้ `add-csv-column` skill แทน (ไม่ต้อง SQL)
   - ถ้าต้องการ filter/query ใน Supabase → ถึงจะต้องเพิ่มใน DB

2. **ถามเพื่อรับข้อมูล:**
   - Column name (English, snake_case) เช่น `company`
   - Thai label เช่น `บริษัท`
   - Data type: `text` | `integer` | `numeric` | `boolean`
   - ตาราง: `drug_details` | `inventory`
   - CSV column header ที่ map มา (Thai หรือ English)
   - รวม multiple CSV columns ไหม? (Option B: join ด้วย ` | `)

3. **Scope ที่ไม่ทำ** (บอก user ชัดๆ ก่อน):
   - ไม่แก้ component อื่นนอกจากที่ระบุ
   - ไม่ migrate ข้อมูลเก่า (ต้อง re-import CSV ใหม่)
   - ไม่แก้ RLS policy (ต้องทำใน Supabase Dashboard แยก)

---

## Step 1: แสดงแผนให้ confirm

```
## แผน: เพิ่ม column `{column_name}` ใน `{table}`

**SQL ที่จะรัน (Supabase Dashboard):**
ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column_name} {type};

**ไฟล์ที่แก้:**
- `src/lib/db.js` — เพิ่ม {column_name} ใน save{Table}()
- `src/App.jsx` — detect CSV header + extract value

**ไม่รวม:** ไม่แก้ UI display (ถ้าต้องการแสดงผล → task แยก)

รอ confirm ก่อนลงมือ
```

---

## Step 2: Generate SQL

```sql
ALTER TABLE {table}
  ADD COLUMN IF NOT EXISTS {column_name} {type};
```

> ⚠️ ต้องรันใน Supabase Dashboard → SQL Editor ก่อน deploy

---

## Step 3: Update `src/lib/db.js`

ใน `save{Table}()`:
- Destructure `_{column_name}` จาก value object
- เพิ่ม `{column_name}: _{column_name} || null` ใน row ที่ insert

---

## Step 4: Update `src/App.jsx`

ใน `handleDrugFileUpload` (หรือ `handleLogFileUpload`):
```js
const {column_name}Idx = headers.findIndex(h => h.includes('{thai_label}'));
// ใน loop:
const _{column_name} = getVal(row, {column_name}Idx);
```

**Option B — รวม 2 columns:**
```js
const parts = [getVal(row, col1Idx), getVal(row, col2Idx)].filter(Boolean);
const _{column_name} = parts.join(' | ') || null;
```

---

## Step 5: Confirm ก่อน Edit

แสดง code changes ทั้ง 3 จุดพร้อมกันก่อน — แล้วรอ confirm ก่อน edit จริง

**verify:** หลัง edit → รัน `npm run lint` ผ่าน

---

## Notes
- `normalizeCode` → code/id columns
- `normalizeNumericText` → lot, invoice, bill number
- `normalizeDateStr` → date columns
- Prefix internal keys ด้วย `_` เสมอ (เช่น `_company`)
- Combined text → plain string (ไม่ต้อง normalize)
