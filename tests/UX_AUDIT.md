# UX/UI Audit Checklist — Senior Software Engineer

คู่มือสำหรับ manual review รอบสุดท้ายก่อน deploy หรือใช้ตรวจ PR ที่กระทบ UI

ใช้คู่กับ Playwright tests (`tests/01-13`) ที่ตรวจอัตโนมัติแล้ว — checklist นี้คือสิ่งที่ test ตรวจไม่ได้

---

## 1. Visual Hierarchy & Consistency

- [ ] Header ของทุก sub-app มี **ปุ่ม ArrowLeft** ตำแหน่งซ้ายบนเหมือนกัน
- [ ] ปุ่ม primary action (Submit, บันทึก, Export) ใช้สี gradient blue/sky ตลอด — ไม่สลับสี
- [ ] Badge สีตาม convention: เขียว=success, แดง=danger, amber=warning, ม่วง=admin
- [ ] Font size hierarchy: h1 (text-2xl) > h2 (text-lg) > body (text-sm) > caption (text-xs)
- [ ] Spacing scale ใช้ Tailwind preset (p-2, p-3, p-4, p-6) — เลี่ยง arbitrary `p-[13px]`

## 2. Mobile Responsive (กฎ #5 — width < 768px)

- [ ] Dashboard cards: 2-col บน mobile, 3-col บน sm+
- [ ] Sub-app ที่มีตาราง → card list หรือ bottom sheet บน mobile
- [ ] ปุ่ม touch target ≥ 40px height
- [ ] ไม่มี horizontal scroll ที่ไม่ตั้งใจ (ตรวจ `document.scrollWidth > clientWidth`)
- [ ] Modal บน mobile: full-screen หรือ bottom-sheet (ไม่ใช่ centered modal เล็กๆ)

## 3. Form UX

- [ ] ทุก input มี `<label>` หรือ `placeholder` ภาษาไทย
- [ ] Password field มี `type="password"` + `autoComplete="current-password"` หรือ `"new-password"`
- [ ] Date input ใช้ `ThaiDateInput` หรือ `IsoDateInput` — **ห้าม** native `<input type="date">` ที่ไม่ wrap
- [ ] Error message อยู่ใกล้ field ที่ผิด — สีแดง พื้น `bg-red-50`
- [ ] Submit button มี loading state (`disabled` + text "กำลัง...")
- [ ] Enter key submit form ได้ (ไม่ต้องคลิกปุ่ม)

## 4. Empty / Loading / Error States

- [ ] หน้าโหลด: spinner หรือ skeleton — ไม่ใช่ blank screen
- [ ] Empty list: ข้อความบอกชัด เช่น "ยังไม่มีรายการ" + ไอคอน
- [ ] Network error: toast หรือ inline message ภาษาไทย
- [ ] Optimistic UI: เมื่อกดบันทึก → UI update ทันที + rollback ถ้า server fail

## 5. Accessibility

- [ ] Tab order เป็นไปตามลำดับ visual
- [ ] Focus ring เห็นชัด (Tailwind `focus:ring-2 focus:ring-sky-500`)
- [ ] ไอคอนปุ่มทุกตัวมี `title` หรือ `aria-label` (ไม่ใช่ปุ่มเปล่า)
- [ ] Color contrast WCAG AA: text ปกติ ≥ 4.5:1, large text ≥ 3:1
- [ ] ไม่มี text-only color cue — เช่น "สีแดง = ลบ" ต้องมีไอคอนถ้วยขยะคู่กัน

## 6. Thai Language Quality

- [ ] ทุก label, button, placeholder, alert เป็นภาษาไทย (กฎ Do Not)
- [ ] ใช้คำศัพท์ consistent: "เบิกยา" ไม่สลับเป็น "เบิกของ", "หน่วยงาน" ไม่สลับ "แผนก"
- [ ] วันที่แสดงเป็น DD/MM/YYYY พ.ศ. (กฎ #3) — ห้าม ISO `2025-01-15` ใน UI
- [ ] ไม่มี emoji — ใช้ `lucide-react` เท่านั้น (ยกเว้น 👋 บน dashboard เป็นข้อยกเว้นเดิม)

## 7. Performance Perception

- [ ] Skeleton loader หรือ shimmer ระหว่างรอ Supabase
- [ ] Big list (>100 rows): pagination หรือ virtual scroll
- [ ] Animation `transition-colors duration-200` ไม่เกิน 300ms
- [ ] Form submit ไม่ block UI > 2s โดยไม่มี feedback

## 8. Data Integrity (ที่ user มองเห็น)

- [ ] Stat card ตรงกับตารางที่เห็น (กฎ #6 — filter+dedup เหมือนกัน)
- [ ] Excel export มี row count เท่ากับ stat (audit log แสดง record_count)
- [ ] Department dropdown: dynamic (history) vs hardcoded (form) — ไม่ปนกัน (กฎ #7)

## 9. Print Views (กฎ #4)

- [ ] ใช้ Blob URL — ไม่ใช่ `document.write()`
- [ ] โหลด font Sarabun จาก Google Fonts ใน popup
- [ ] A4 layout: margin 1cm, header สูง 80px max

## 10. Security UX

- [ ] Audit log แสดง `user_name` ไม่ใช่ `-` (กฎ #1)
- [ ] Permission denied: redirect ไป dashboard + toast แทน white screen
- [ ] Session expire: re-login modal ไม่ใช่ silent fail

---

## วิธีรันชุดทดสอบ

```bash
# รัน Playwright ทั้งหมด
npx playwright test

# รันเฉพาะกลุ่ม UX/A11y (file 09-13)
npx playwright test tests/09 tests/10 tests/11 tests/12 tests/13

# ดู HTML report หลังรันเสร็จ
npx playwright show-report

# รันบน mobile viewport เท่านั้น
npx playwright test tests/12-mobile-ux.spec.js

# Headed mode (เห็น browser)
npx playwright test --headed
```

## ผู้ใช้ทดสอบ (ในไฟล์ tests/fixtures.js)

| Role | Username | Password |
|------|----------|----------|
| requester | `test` | `444444` |
| staff | `test2` | `555555` |

ถ้า user เปลี่ยน → set env var `TEST_STAFF_USER` / `TEST_STAFF_PASS`
