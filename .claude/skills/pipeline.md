# Skill: pipeline

รัน lint → build → test ตามลำดับ เพื่อตรวจว่าโค้ดพร้อม deploy

> **Karpathy: Goal-Driven Execution** — ทุก step มี verify criteria ชัดเจน

## เมื่อไหร่ใช้
- หลังเพิ่ม feature ใหม่หรือแก้บั๊กสำคัญ
- ก่อน commit/push
- เมื่อต้องการมั่นใจว่าไม่มีอะไรพัง

---

## ขั้นตอน + Success Criteria

### 1. Lint — verify: 0 errors (warnings ยอมได้)
```bash
npm run lint
```
- **ผ่าน** → ไปขั้นต่อไป
- **fail** → หยุดทันที แก้ error ก่อน ไม่ข้ามไป build
- Warning ที่เป็น pre-existing (ไม่ได้สร้างในครั้งนี้) → mention แต่ไม่บังคับแก้

### 2. Build — verify: bundle สำเร็จ ไม่มี error
```bash
npm run build
```
- **ผ่าน** → ไปขั้นต่อไป
- **fail** → แสดงว่ามี TypeScript/import error ที่ dev mode ไม่จับ — หยุดแก้ก่อน
- ตรวจ bundle size ด้วย: ถ้าเพิ่มขึ้น > 50KB จาก baseline → flag ให้ user รู้

### 3. Test — verify: passed ≥ baseline, failed = 0
```bash
npx playwright test --reporter=list
```
- **ผ่านทั้งหมด** → พร้อม deploy
- **skip** → ยอมได้ถ้า skip ด้วย `.skip` หรือ condition ที่ตั้งใจ
- **fail** → ระบุ test ที่ fail + error message ให้ชัด

---

## รายงานผล

| ขั้นตอน | ผลลัพธ์ | หมายเหตุ |
|---------|---------|---------|
| Lint    | ✓ / ✗   | จำนวน error / warning |
| Build   | ✓ / ✗   | bundle size (dist/) |
| Test    | ✓ skip ✗ | X passed / Y skipped / Z failed |

- ผ่านทั้งหมด → **"พร้อม deploy ✓"**
- ติด → ระบุขั้นตอนที่ fail + error message + แนะนำวิธีแก้

---

## Simplicity note

ถ้า lint pass แต่มี pre-existing warnings เยอะ → **อย่าแก้ทั้งหมดในครั้งเดียว**
ทำ separate PR cleanup แทน — ไม่ mix กับ feature PR
