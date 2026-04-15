# Skill: pipeline

รัน lint → build → test ตามลำดับ เพื่อตรวจว่าโค้ดพร้อม deploy

## เมื่อไหร่ใช้
- หลังเพิ่ม feature ใหม่หรือแก้บั๊กสำคัญ
- ก่อน commit/push
- เมื่อต้องการมั่นใจว่าไม่มีอะไรพัง

## ขั้นตอน

1. **Lint** — ตรวจ syntax และ code style
```bash
npm run lint
```
หยุดถ้า lint fail — แก้ก่อนไปขั้นต่อไป

2. **Build** — ตรวจว่า production build ผ่าน
```bash
npm run build
```
หยุดถ้า build fail — แสดงว่ามี error ที่ dev mode ไม่จับ

3. **Test** — รัน Playwright E2E
```bash
npx playwright test --reporter=list
```

## รายงานผล

สรุปให้ user ดังนี้:
| ขั้นตอน | ผลลัพธ์ | หมายเหตุ |
|---------|---------|---------|
| Lint    | ✓ / ✗   | จำนวน warning/error |
| Build   | ✓ / ✗   | bundle size |
| Test    | ✓ skip ✗ | passed/skipped/failed |

ถ้าผ่านทั้งหมด → "พร้อม deploy ✓"
ถ้าติด → ระบุขั้นตอนที่ fail และ error message
