# Handoff — 13/11/2569 · เบิกยาออนไลน์ฝั่งผู้เบิก: ใบพิมพ์แบบชีท + หน่วยซื้อ + ตะกร้าค้าง (push main แล้ว)

อ่าน `CLAUDE.md` ก่อน · ตอบภาษาไทย · ก่อนแก้ `src/` ต้อง Read `src/CLAUDE.md` (hook บังคับ)

## 0. เครื่องใหม่ทำก่อนเริ่ม
1. `git pull` → commit บนสุดต้องเป็น "เพิ่ม: เบิกยาออนไลน์ฝั่งผู้เบิก — ใบพิมพ์แบบชีท…"
2. **`npm install`** — deps ใหม่ `exceljs@4.4.0` `html2canvas@1.4.1` `jspdf@4.2.1` (ไม่ install = dev/build พังตอน import)
3. `.env.local` ไม่อยู่ใน git — ต้องมีในเครื่อง
4. Supabase: MCP `supabase` (local) ตอบ Unauthorized → ใช้ `claude_ai_Supabase` (หา project ด้วย `list_projects`) — select / `apply_migration` ใช้ได้ · DELETE ผ่าน `execute_sql` ถูก auto-mode ปฏิเสธ
5. memory ของ Claude อยู่เครื่องคลัง (`~/.claude/projects/...`) — เครื่องใหม่ไม่มี อย่าอ้าง memory ที่ไม่เห็น

## 1. เริ่มจากไหน
ชุดงาน 13/11 (รอบ j–l): (ก) ค้นยาหน้าเบิกของผู้เบิก (ค) ส่งใบเบิกเป็นไฟล์ PDF เข้า LINE แทนลิงก์ `blob:` (ง) ใบพิมพ์/PDF/Excel ในแอปหน้าตาเหมือน PDF ที่คลังทำจากชีทเบิก (ข) ตะกร้าเบิกค้างข้ามเครื่อง + การ์ดบน Dashboard

## 2. ตัดสินใจแล้ว (user)
- หน่วย/ปริมาณ = **หน่วยซื้อของ lot** (`inventory.unit` เช่น 1000เม็ด × 6) ทั้งใบพิมพ์/PDF/Excel/ใบ lot คุม · หมายเหตุ "เบิก X จ่าย Y" ก็หน่วยซื้อ (เต็มแพ็ค "6" · ไม่เต็ม "2.5 (2,500 เม็ด)") · **ไม่แก้หน่วยใน DB/Excel เป็นกล่อง/ลัง** (ตัวเลขในหน่วย = packsize ที่สูตร Master + `parseUnit` ใช้)
- ใบพิมพ์ต้องเหมือน PDF คลังจริง รวมขนาดตัวอักษร (วัดจาก `ห้องยาG ยา_11.11.69.pdf`) → ฟอนต์ Calibri+Tahoma = ข้อยกเว้นกฎ "Sarabun ในใบพิมพ์" เฉพาะใบนี้ (มือถือไม่มี → Sarabun) · ค่าทั้งหมดอยู่ใน comment ของ `buildSheetHtml`
- **ช่อง Exp ระบายแดงเมื่อใกล้หมดอายุ คงไว้** (ใบคลังจริงไม่มี แต่ user ให้ใส่)
- ตะกร้าค้าง: DB ไม่เก็บ `fefoLots`/`availableBase` (คำนวณใหม่ตอนโหลด) · คลังเบิกแทน (proxy) ไม่บันทึก · audit เฉพาะกดล้าง
- push ขึ้น main 13/11 = deploy ครั้งที่ 4 ของรอบ 11/11– (`docs/deployment.md` §โควตา)

## 3. ส่งมอบแล้ว (ห้ามทำซ้ำ)
- commit `e35100b` เพดานพื้นที่อ่านจากชีทขนาดลัง (งาน pr.py แยก) · commit docs ชุดนี้ · commit โค้ดบนสุด — รายละเอียดฟีเจอร์ `docs/architecture/sub-apps.md` (บรรทัด ReqOutputModal + ตะกร้าค้าง)
- ตาราง `requisition_cart_draft` **apply prod แล้ว 13/11** (ตรวจ 6 คอลัมน์ + policy) — ห้ามรัน `req_cart_draft_migration.sql` ซ้ำ (CREATE POLICY จะชน)
- บั๊กหมายเหตุ "เปลี่ยนบริษัท" ขึ้นเกือบทุกแถว (เช็ค `supplier_changed` ผิด ตั้งแต่ 84242e7) — แก้แล้ว
- บั๊กกดล้างตะกร้าจากการ์ดแล้วเปิดหน้าเบิกตะกร้าฟื้น + บันทึกกลับ DB — แก้แล้ว (`clearLocalCart` ใน `lib/reqType.js`)
- ตรวจแล้ว: test drugsearch 40/40 · reqsheet 25/25 · reqtype 13/13 · unit 17/17 · build ผ่าน · lint = baseline (RequisitionApp 14 · AppRoot 2 warning · ที่เหลือ 0)
- E2E ตะกร้า (สคริปต์ชั่วคราว ไม่ได้เป็น spec): ใส่ 2 รายการ → context ใหม่จอ 390px การ์ดขึ้น → เบิกต่อ คงเหลือ/lot คำนวณใหม่ → ล้าง (audit `clear_req_cart` ✓) → เปิดหน้าเบิกใหม่ตะกร้าว่าง · DB เหลือ 0 แถว
- ใบพิมพ์ render Playwright→PDF วัดแล้ว: ตัวอักษร 10/9.5/14/18pt · เส้นคอลัมน์ตรง PDF คลัง ±1pt · หัวกระดาษ+เลขหน้าทุกหน้า · PDF แชร์ (html2canvas `foreignObjectRendering`) ตัวหนังสือไม่ทับเส้นช่อง
- ใบ `REQ-20261113-2101` (ใบทดสอบของ user test) ยังอยู่ใน DB — ใช้ทดสอบใบพิมพ์ได้

## 4. ไฟล์สำคัญ
- `src/lib/reqSheetFormat.js` — คอลัมน์ + CSS ใบ (**ขนาดเป็น pt ห้าม px**) + `toPackQty`/`fmtPackNote`
- `src/lib/reqSheetExport.js` — Excel (exceljs) + PDF (`htmlToPdfBlob` iframe 1077px = 285 มม.)
- `src/RequisitionApp.jsx` — `buildLotRowObjs` (แถว+หมายเหตุ ใช้ร่วมใบ lot คุม/ใบพิมพ์) · `RequesterRoot` (ตะกร้า + DB) · `refreshCartStock`
- `src/DashboardPanels.jsx` `CartReminderCard` · `src/lib/db.js` `fetchCartDraft`/`saveCartDraft`/`deleteCartDraft`

## 5. สถานะ
- ไม่มี background task / branch ค้าง · Desktop ของเครื่องคลังไม่ sync → เครื่องใหม่ไม่เห็นทะเบียนบันทึกงาน (`Desktop\ยอดคงคลัง\บันทึกการทำงาน\`) และ PDF ใบเบิก (`Desktop\รวมเบิกยา\`)

## 6. verify ที่ยังไม่ได้ทำ
1. **เว็บจริงหลัง deploy**: login `test` → ใส่ตะกร้า → หน้าหลักมีการ์ด → ล้าง · พิมพ์ใบ REQ-20261113-2101 ดูขนาดตัวอักษร (ห้ามกดส่งใบเบิก)
2. ส่งเป็น PDF บน **iPhone จริง → LINE** — Safari อาจไม่รองรับ foreignObject แล้วถอยไปตัววาดเดิมที่ตัวหนังสือต่ำทับเส้น ถ้าเจอแก้ใน `htmlToPdfBlob`
3. Excel เปิดใน Excel จริงแล้วสั่งพิมพ์ (ตรวจแค่ค่า/XML)
4. dark mode ข้อความ "รอคลังลงชีท" ถ่ายรูปเทียบ (ค้างจาก 13i) → ผ่านแล้วย้าย 4 ไฟล์ใน `เอกสารคลังยา_รอลง\รูปแก้ไขแอพ\` ออก
5. ข้อจำกัดที่ยอมรับ: แท็บเดิมที่เปิดค้างเครื่อง A ถือ sessionStorage เป็นของใหม่กว่า → บันทึกทับ DB แม้เครื่อง B ล้างแล้ว (แก้เมื่อ user เจอจริง)

## 7. คำถามเปิด (รอ user)
1. `docs/schema.md` §RequisitionApp `REQUISITION_EXCEL_COLS` ล้าสมัย (โค้ดลบแล้ว) — แก้ไหม
2. ทำ E2E ตะกร้าเป็น spec ใน `tests/` ไหม (เขียน DB จริง — ต้องขออนุญาตแบบ 03–06)
3. งานเก่าค้าง: ผังตู้เย็น → Word/PDF → ใส่แอป · ติ๊กนัดเตือนรอบแจ้งซื้อ · ตร.70/012 · ไพลครีม 20 หลอดคืนจากห้องยาG

## 8. เริ่มต่อตรงไหน
1. ทำ §0 แล้ว `npm run test:reqsheet` ต้องได้ 25/25 = เครื่องพร้อม
2. เช็ค deploy: `netlify api listSiteDeploys` (คำสั่งเต็มใน `docs/deployment.md` §โควตา ข้อ 5) commit บนสุด `state=ready` → ทำ §6 ข้อ 1
3. ถาม user §7 · งานถัดไปของแผนเบิกออนไลน์: `docs/features/online-requisition.md` + ADR-0028 + CONTEXT §ใบเบิกออนไลน์

## 9. skill
`/pipeline` ก่อน push · `ui-style-guide` (ปรับการ์ด) · `/scrutinize` (ตรวจใบพิมพ์) · `python scripts/check-complete.py` ใช้ได้เฉพาะเครื่องคลัง (อ่าน OneDrive/Desktop)

เลขเอกสารล่าสุด (เครื่องคลัง 13/11): บย.70/0076 · สบ.70/037 · VX-6911-001 · ตร.70/014
