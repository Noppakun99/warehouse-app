# Auth & Roles

## ระบบ Login

- **username + password** — hash ด้วย SHA-256 ผ่าน `crypto.subtle.digest` (Web Crypto API, client-side)
- ไม่ใช้ Supabase Auth — เก็บใน `app_users` table เอง
- `auth` state object: `{ id, username, name (= full_name), role, department }`
- `auth` ส่งผ่าน props จาก AppRoot ลงไปทุก sub-app ที่ต้องการ

## Three Roles

| Role | ประเภท | ระบบที่เข้าได้ |
|------|--------|--------------|
| `requester` | ผู้ใช้งานทั่วไป | แผนผัง, เบิกยา, รับยา (ดู), เบิกจ่าย (ดู), คืนยา |
| `staff` | เจ้าหน้าที่คลังยา | ทั้งหมด (ยกเว้นจัดการผู้ใช้) — Import CSV ได้ แต่ไม่สามารถ Edit/Delete |
| `admin` | เจ้าหน้าที่คลังยา + ผู้ดูแลระบบ | ทั้งหมด รวม Edit/Delete และจัดการผู้ใช้ |

- `isStaff` ใน AppRoot/Dashboard = `auth.role === 'staff' || auth.role === 'admin'`
- `isAdmin` ใน sub-apps = `auth.role === 'admin'` — ใช้ guard ปุ่ม Edit/Delete
- RequisitionApp: `startAsStaff = role === 'staff' || role === 'admin'` — ต้องมาก่อน `prefilledUser` ใน useState
- RequisitionApp: `prefilledUser = { name: displayName, department: auth.department }` — ส่งให้ **ทุก role** เสมอ
- SYSTEMS array กรองด้วย `s.roles.includes(auth.role)` — แต่ละ system มี `roles` array

## Permission Matrix (Edit/Delete/Import)

| Action | requester | staff | admin |
|--------|-----------|-------|-------|
| ดูข้อมูล | ✓ | ✓ | ✓ |
| Import CSV (Receive/Dispense) | ✗ | ✓ | ✓ |
| แก้ไข/ลบ (Receive/Dispense) | ✗ | ✗ | ✓ |
| แก้ไขใบเบิกตัวเอง (Requisition History) | ✗ | — | — |
| ลบ blank rows (Receive) | ✗ | ✗ | ✓ |

## displayName Pattern

ทุกที่ที่แสดงชื่อผู้ใช้ใน Dashboard ใช้ pattern นี้เสมอ:

```js
const displayName = (auth.name && auth.name.trim() && auth.name.trim() !== '-')
  ? auth.name : auth.username;
```

- `full_name` ว่าง หรือ `'-'` → แสดง `username` แทน
- ใช้ใน: navbar header, welcome section, prefilledUser.name

## StatsStrip (Dashboard)

- แสดงให้ **ทุก role** เห็น
- requester เห็น 3 card: รายการยาในคลัง + ใบเบิกรอดำเนินการ + ยาใกล้หมดอายุ
- staff/admin เห็น 4 card: เพิ่ม Stock ต่ำกว่ากำหนด
- `fetchDashboardAlerts()` ถูกเรียกสำหรับ **ทุก role**
- คลิก "ใบเบิกรอดำเนินการ":
  - staff/admin → `page='requisition'` → StaffDashboard (filter=pending)
  - requester → `page='requisition-history'` → RequesterRoot initialStep='history'
- `loadStats` ใช้ `useCallback` + subscribe `postgres_changes` บน `requisitions` table → realtime

## RequisitionApp Navigation

- `page='requisition'` → เปิดปกติ (staff ไป StaffDashboard, requester ไป DrugSearch)
- `page='requisition-history'` → เปิดพร้อม `initialStep='history'` → requester ไปหน้าประวัติทันที
- `startAsStaff` ต้องตรวจก่อน `prefilledUser` ใน useState initial value เสมอ

## db.js Auth Functions

```js
loginUser(username, password)          // → { user } หรือ { error }
registerUser({ username, password, full_name, department })
//   ตรวจ: 1) username ซ้ำ 2) password hash ซ้ำกับ user อื่น
//   role = requester, is_active = true
checkFirstRun()                        // → true ถ้าไม่มี user (แสดง admin setup)
fetchAppUsers()                        // admin only
createAppUser({ username, password, full_name, department, role })
updateAppUser(id, { full_name, department, role, is_active })
deleteAppUser(id)
changeAppUserPassword(id, newPassword)
```

## สมัครเข้าใช้งาน (Self-register)

- ฟอร์มมีแค่: username, หน่วยงาน, รหัสผ่าน, ยืนยันรหัสผ่าน — **ไม่มีช่องชื่อ-สกุล** (full_name บันทึกเป็น `''`)
- ได้ role `requester` เท่านั้น, `is_active = true` ทันที
- ตรวจ username ซ้ำ และ password hash ซ้ำก่อน insert เสมอ
- บัญชี staff/admin ต้องสร้างโดย admin เท่านั้น

## ลืมรหัสผ่าน

- view `'forgot'` ใน AppRoot — แสดงขั้นตอน 3 ข้อให้ติดต่อ Admin
- ปุ่ม "ลืมรหัสผ่าน?" อยู่ซ้ายล่างของหน้า login

## UserManagementApp

- file: `src/UserManagementApp.jsx`
- เข้าได้เฉพาะ role `admin` (SYSTEMS roles: `['admin']`)
- ตารางแสดง: ชื่อผู้ใช้, ชื่อ-สกุล, หน่วยงาน, **ประเภทผู้ใช้**, **สิทธิ์ระบบ**, สถานะ, วันที่สมัคร
- ป้องกันลบตัวเอง + ป้องกัน admin เปลี่ยน role ตัวเองออกจาก admin

### ตั้งรหัสผ่านใหม่ (Admin)

- Modal: 1 field, แสดงได้ (toggle eye), ไม่มี confirm field
- บันทึกสำเร็จ → แสดง panel พร้อมข้อความสำเร็จสำหรับ copy ส่งให้ user (username + รหัสใหม่)
- state: `pwSaved` เก็บรหัสที่บันทึกแล้ว, `copied` สำหรับ copy feedback

### สถานะบัญชี (Suspend)

- DB column: `suspend_until TIMESTAMPTZ` ใน `app_users` (migration: `suspend_user_migration.sql`)
- 3 โหมด:
  - `active` = is_active=true
  - `temp` = is_active=false + suspend_until=datetime
  - `perm` = is_active=false + suspend_until=null
- Login check: ถ้า `suspend_until` ผ่านไปแล้ว → อนุญาตเข้าใช้; ยังไม่ถึงเวลา → แสดง "บัญชีถูกระงับชั่วคราว ถึง DD/MM/YYYY HH:MM น."

## Do Not (Auth)

- อย่าใช้ Supabase Auth (`supabase.auth.*`) — ระบบนี้ใช้ `app_users` table เอง
- อย่า hardcode password หรือ hash ใน code — ใช้ `hashPassword()` ใน db.js เสมอ
- อย่าเปลี่ยน password hash algorithm โดยไม่ migrate ข้อมูลเดิม
