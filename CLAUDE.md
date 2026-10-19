# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

คู่มือสำหรับ Claude Code ทำงานกับ repo นี้ — เก็บแต่ภาพรวม convention และ pointer ไป `docs/`

## บทบาทผู้พัฒนา (Senior Software Engineer Mindset)

**ทำงานแบบ senior software engineer ทุกครั้ง** — ไม่ใช่แค่เขียนโค้ดให้เสร็จ แต่ตรวจสอบเชิงระบบ:

1. **คิดเป็นระบบ ไม่ใช่เป็นไฟล์** — แก้ฟีเจอร์ใหม่ต้องตรวจให้ครบ: DB layer (`db.js`) + UI + audit log + notification + permission + mobile + E2E test
2. **Cross-cutting concerns ต้องครอบคลุมทุก sub-app**:
   - **Audit log**: ทุก mutation (INSERT/UPDATE/DELETE) ต้องเรียก `insertAuditLog` พร้อม `auth` ครบ
   - **Notification bell**: action สำคัญที่ staff ต้องรู้ → เพิ่มใน `NOTIF_LABELS` + handler `notifMessage()` ใน [NotificationBell.jsx](src/NotificationBell.jsx) (ดู Critical Rule #12 — ต้อง sync 3 ที่)
   - **Permission**: action ใหม่ต้องเช็คว่า role ไหนทำได้ (`GRANTABLE_SYSTEMS` ใน [UserManagementApp.jsx](src/UserManagementApp.jsx) — `SYSTEM_ACCESS` ลบทิ้งแล้ว 2026-08-01 ดู Critical Rule #23)
3. **Verify ก่อนสรุปเสมอ** — `npm run lint` + reproduce ปัญหา + ตรวจ side-effect ในไฟล์อื่น (ดู section "Verify ก่อนสรุป" ด้านล่าง)
4. **คุณภาพมากกว่าความเร็ว** — เจอ gap ระหว่างทาง (เช่น label หายไปใน UI) ให้ flag กับ user ก่อนเสมอ ไม่เงียบ
5. **ไม่ duplicate test/skill** — ก่อนเพิ่มไฟล์ test/skill ใหม่ ต้อง grep หาของเดิมก่อน (กฎ "อ่านก่อนแก้")

## เช็คโฟลเดอร์พักเอกสารเรื่อยๆ (user สั่ง 08/10/2569)

`C:\Users\PRH0000484\OneDrive\เอกสารคลังยา_รอลง\` มี 5 โฟลเดอร์ — **มีไฟล์ = งานที่ยังไม่ได้ลง** (ลงเสร็จต้องย้ายออกเสมอ):

| โฟลเดอร์ | งาน |
|---|---|
| `ใบเบิกยา\` | ลงชีท `เบิก ` → PDF → คิวพิมพ์ → นำเข้าแอป · **หน่วยงานภายนอก (ศบส.1–4 · รพ.สต.คูคต · เทศบาลนครรังสิต · วัดประยูร) ต้องเพิ่มชีท `<ว.ด.ปป>` ในไฟล์สรุปเบิกยาของศูนย์นั้นด้วยทุกใบ** (`Desktop\รพ.สต_เบิกยา\<ศูนย์>\…ปีงบ70.xlsx` — memory `rpst-dispense-summary`; `check-complete.py` ข้อ 8 ตรวจ) |
| `บิลยา\` | ลงชีท `รับยา` + Master → ดัชนีบิล → นำเข้าแอป → ใบส่งบิลจัดซื้อ → **คิวพิมพ์** → **ลงยามาส่งในระบบติดตามการสั่งซื้อของจัดซื้อ** (ดูขั้นตอนใต้ตาราง ข้อ 8) |
| `ใบคืนยา\` | ใบคืน/ใบยืมที่เซ็นแล้ว → ทะเบียน `รพ.ยืมยา` + หลักฐาน |
| `รูปตรวจรับยา\` | ลงตรวจรับ (รับยา P/Q + Master C) → นำเข้าแอป |
| `จัดซื้อเซ็นรับ\` | รูปใบส่งบิลจัดซื้อ (สบ.70/xxx) ที่จัดซื้อเซ็นแล้ว → ติ๊ก `_ทะเบียนส่งบิลจัดซื้อ.csv` → ย้ายรูปไป `ส่งบิลให้พี่โก้\เซ็นรับ\` (เพิ่ม 08/10/2569) |

**เช็คทุกครั้งที่**: (1) เริ่ม session (2) **จบงานย่อยแต่ละชิ้น** — user มักวางไฟล์ใหม่ระหว่างที่ทำงานอื่นอยู่ (3) ก่อนสรุปงานให้ user · คำสั่ง: `find "/c/Users/PRH0000484/OneDrive/เอกสารคลังยา_รอลง" -type f` (หรือ `python scripts/check-complete.py` ซึ่งตรวจข้อนี้ด้วย) · เจอไฟล์ → บอก user ในสรุปว่าค้างกี่ไฟล์ โฟลเดอร์ไหน แล้วถามว่าจะลงต่อเลยไหม · ขั้นตอนละเอียดอยู่ใน memory `document-inbox`

**⛔ อ่านรูปใบเบิกฟอร์มพิมพ์รายการ (น้ำเกลือ / ถุง-ขวด-ตลับ) — ฝั่งขวา (หน่วยนับ+จำนวนที่เบิก) อาจพิมพ์เลื่อนจากฝั่งซ้าย 1 บรรทัด** (15/10/2569 ลงผิด 2 ใบ: ER D-5-W 1000→100ml · ห้องยาG S010→S007 — ใบ ER ช่องหน่วยแรกอยู่ระดับหัวตาราง) → **ก่อนลงทุกใบ**: เทียบลำดับหน่วยนับฝั่งขวาในรูปกับฟอร์มเปล่า (`Desktop\ยอดคงคลัง\ฉบับเก่า\ใบเบิกเวชภัณฑ์น้ำเกลือ.pdf` / `ใบเบิกเวชภัณฑ์ยาและมิใช่ยา.pdf` / `ใบเบิกเวชภัณฑ์มิใช่ยาถุง.ขวด.ตลับ.pdf` — ฉบับเก่าที่ยังหมุนเวียน · ฉบับใหม่มีช่อง "ที่" ซ้ำ ไม่ต้องเทียบ) หา offset · ผูกตัวเลขผ่านหน่วยนับข้างตัวเลข ไม่ลากจากชื่อยา · เลื่อนแล้วเลื่อนทุกตัวในใบ · ตารางยืนยันกับ user แสดงหน่วยข้างตัวเลข + offset ทุกรายการ (memory `handwritten-requisition-to-excel`) · **ใบเบิกฟอร์มรายการที่ไม่ใช่ฉบับปัจจุบัน** (ไม่มีบรรทัด "ฉบับปรับปรุง" ท้ายใบ หรือฉบับเก่ากว่า `REVISION` ใน [printedReqForm.js](src/lib/printedReqForm.js)) → ลงตามปกติ แล้ว**เตือน user ให้ส่งฉบับล่าสุดกลับไปกับของ** + จดในหมายเหตุทะเบียนใบเบิก (ตกลง 16/10/2569)

**PDF ใบเบิกทุกใบ (ทุกหน่วยงาน) ทำด้วย `scripts/dispense-pdf.ps1` — หัวกระดาษกลางขึ้น "เลขที่ <เลขรับใบเบิก>" อัตโนมัติจากคอลัมน์ AD** (user สั่ง 12/10/2569 · ลงคอลัมน์ AD **ก่อน**ทำ PDF เสมอ · แถวในใบเลขต่างกัน = สคริปต์หยุด · ใบที่ไม่มีเลข เช่นก่อน 12/10/2569 = หัวกลางว่าง) · พารามิเตอร์ `-StockPath -LogPath -Out -Rows <แถว,…> -Sig "รหัส|lot|N|หน่วยงาน ; …" -Title [-SortLog]` · เปิดไฟล์อ่านอย่างเดียว · ไม่ทับไฟล์ที่มีอยู่

**ลงใบเบิกทุกแถว: เช็คคงเหลือจริงของ lot บนชั้น แล้วเขียนในหมายเหตุ Q ถ้า "คงเหลือหลังจ่าย" (O) ไม่ใช่ตัวเลขที่คนจัดยานับได้** (user สั่ง 14/10/2569 — คนจัดยาใช้นับยอดที่เหลือบนชั้นหลังหยิบ):
- O คิดจาก**แถว Master แถวเดียว**ที่ตัด → lot เดียวกันที่แยกหลายแถวใน Master (`ยกยอด`/`ยกยอด(2)`/ราคาต่าง/ชนิดรายการต่าง) O จะต่ำกว่าของจริง เช่น ขึ้น 0 ทั้งที่ lot ยังเหลือ → PDF ทำให้เข้าใจว่ายาหมด
- รวม U ของ Master ทุกแถว **รหัส+lot เดียวกัน** หลังตัด + คงคลังรวมทั้งรหัส แล้วเขียน: `lot <lot> ยังเหลือ <N> (แถว<ชนิดรายการ>) · คงคลังรวม <M>` · lot หมดแต่รหัสยังมี lot อื่น → `lot <lot> หมด · คงคลังรวม <M> (lot <…>)` · มีหมายเหตุอื่นอยู่แล้ว ต่อท้ายด้วย ` · `
- แถว Master ที่ยัง `รอตรวจรับ` (คอลัมน์ C) แยกบอก ห้ามนับรวมเป็นของจ่ายได้: `… · รอตรวจรับอีก <N> (บิล <…>)` · lot เดียวกันคนละที่เก็บ (D/E ต่าง เช่น Manidipine 260873 E-1-x กับห้องประชุมเล็กชั้น4) บอกที่เก็บด้วย: `… · อีก <N> ที่ <ที่เก็บ>`
- ทำ**ก่อน**ทำ PDF (หมายเหตุขึ้นใน PDF) · ตัวอย่างแรก: Sertraline 50mg แถว 8486 (บย.70/0005 ห้องยาG) O = 0 แต่ L695023 ยังเหลือ 108 ในแถว `ยกยอด(2)` — ใส่หมายเหตุย้อนหลัง 14/10 ไม่พิมพ์ใหม่

**PDF ใบเบิกห้องยา (ห้องยา1 + ห้องยาG) ต้องทำ 2 ไฟล์ทุกใบ และเข้าคิวพิมพ์ทั้งคู่ (user สั่ง/ยืนยัน 12/10/2569)**:
1. **ฉบับคลัง** `รวมเบิกยา\PDF\ห้องยา_<1|G>\ห้องยา<1|G> <ยา|น้ำเกลือ|ถุง>_<ว.ด.ปป>.pdf` — **ใบยา: เรียงตาม log A→B→C→D→E ทุกครั้ง** (MainLog แล้ว DetailedLog · Excel sort ไม่สนขีด: E-10 < E-11 < E-1-3 · ห้องประชุม/ตู้เย็นอยู่ท้าย) ให้คลังเดินจัดยาตามชั้น · หัว "ห้องยา<1|G> ยา" · `scripts/dispense-pdf.ps1 -SortLog`
2. **ฉบับห้องยาเช็ค เรียงตามใบเบิก** — ห้องยาG → **พี่เจี๊ยบ** `Desktop\ยอดคงคลัง\ใช้\เบิกยา ชั้นG\ห้องยาG <ประเภท> พี่เจี๊ยบ_<ว.ด.ปป>.pdf` หัว "ห้องยาG พี่เจี๊ยบ" · ห้องยา1 → **พี่เก๋** `Desktop\ยอดคงคลัง\ใช้\เบิกยา ชั้น1\ห้องยา1 <ประเภท> พี่เก๋_<ว.ด.ปป>.pdf` หัว "ห้องยา 1 พี่เก๋" · `scripts/dispense-pdf.ps1` (ไม่ใส่ `-SortLog`) · path เต็มในทะเบียน `_สถานะพิมพ์.csv`
- ชื่อไฟล์ 2 ฉบับต้องต่างกัน (คิวพิมพ์ copy ด้วยชื่อไฟล์ — ชื่อซ้ำทับกัน) · รายละเอียดใน memory `dispense-pdf-per-department`

**ใบ Store ER (ยาตู้เย็น ER: Speeda 1460254 · Td 1470511 · ERIG 1650104 — ตกลง 12/10/2569)** — ER ไม่ใช้ใบเบิกคลัง ใช้**การ์ด "Store" ประจำตู้เย็น ER** (ชื่อยา · ว.ด.ป. · Store · คงเหลือ · เบิก · ชื่อผู้เบิก) ห้องยาหยิบให้ ER ก่อน แล้วส่งการ์ดมาทีหลัง → **ใช้การ์ดนี้ ไม่ออกแบบใบใหม่** (รูปตัวอย่าง: `Desktop\รวมเบิกยา\ใบเบิก_รูป\ตัวอย่าง_ใบStoreER_ตู้เย็นER.jpg` — ใบเก่า 4/9/69 ใช้ดูหน้าตาเท่านั้น ไม่ใช่งานให้ลง):
- **ตัดคลังทันทีที่ห้องยาแจ้งว่าหยิบแล้ว ไม่รอการ์ด** (รอ = Master/แอปโชว์ของเกิน) · หน่วยงาน `ER` (ตัดคลังจริง ไม่ใช่ `บันทึกเท่านั้น`) · หมายเหตุ `ห้องยาหยิบให้ ER <ว/ด/ปป> ตามใบ Store ER` (+ `· รอใบ Store ER`) · ออกเลข บย. + PDF `ER\ER ยา_<วัน>.pdf` + คิวพิมพ์
- **แปลงกล่อง → vial: Speeda / Td / ERIG กล่องละ 10 vial** (Master นับ vial)
- การ์ดมาถึง = หลักฐานของ บย. ที่ลงไปแล้ว **ห้ามลงซ้ำ** (การ์ดใบเดียวสะสมหลายวัน ถ่ายส่งมาซ้ำได้) → เก็บรูป `ใบเบิก_รูป\<เดือน>\<วัน>_ER_ยา.jpg` + ใส่ path ช่อง "รูป" ในทะเบียน · 1 วันบนการ์ด = 1 บย.
- แถวบนการ์ดที่วันที่อยู่ในงวดที่ปิดแล้ว **ห้ามลงย้อนวันที่** (สูตร T ของ Master ตัดเฉพาะช่วงงวดปัจจุบัน ยอดไม่ลดแบบเงียบ) → ถาม user
- ขอ ER/ห้องยาเติม **ชื่อผู้จ่าย + วันที่ทุกแถว** บนการ์ด

**ลงบิลยา — ขั้นตอนที่ใช้จริง (09/10/2569: ยูนิเวอร์แซล 126100028 + เอเบิ้ล 126100311)**:
1. อ่านรูปทุกไฟล์ในโฟลเดอร์ (บิล + COA) → บริษัท/เลขบิล/PO/lot/exp/จำนวน/ราคา · เช็คยอดรวมแถวตรงท้ายบิล
2. หาข้อมูลจากไฟล์ (openpyxl อ่านอย่างเดียว): แถวสุดท้ายชีท `รับยา` · แถวต้นแบบใน Master = **แถวสุดท้ายของรหัสนั้น** (ใช้ ที่เก็บ D/E + หน่วย I + สูตรจากแถวนี้ ต้องเป็นบริษัทเดียวกัน) · **วันที่แจ้งสั่ง (`รับยา` A) = คอลัมน์ B ของชีท `รายงานซื้อยา` ใน `OneDrive\รายงานการซื้อยา_69.xlsx`** · ชื่อยา/หน่วยใช้ตาม Master ไม่ใช่ชื่อการค้าบนบิล
3. COM บนสำเนา scratchpad (แม่แบบสคริปต์ล่าสุด: `%TEMP%\handoff-2026-10-09pm-scripts\cefa_1009.ps1` แก้ `$lines` + เลขแถวสุดท้ายที่คาด) → เพิ่ม `รับยา` + แทรก Master (`ListRows.Add` เรียงแถวต้นแบบมาก→น้อย) + sync `รับเข้า` → ด่าน: Y เพิ่ม = ยอดบิล · แถว "ยอด ยา นำไปใช้เดือนถัดไป" ✅ · AQ เท่าแถวต้นแบบ · AA = 0 · **Master B (ส่งบัญชี) แถวซื้อใหม่ = `ยังไม่ได้ส่ง` เสมอ ห้ามติดค่าจากแถวต้นแบบ** (แถว `ยกยอด` = `ไม่มีการดำเนินการ` — 15/10/2569 พบบิล ต.ค. 36 แถวติดค่านี้ แก้แล้ว · ตัวเลขไม่ต่างเพราะ AA นับเฉพาะ `ส่งแล้ว` แต่บิลหลุดรายงาน "ยังไม่ได้ส่งบัญชี")
4. diff ทีละเซลล์กับสำเนาเดิม (ต้องต่างเฉพาะแถวใหม่ + เซลล์สูตรที่ตามมา: AL/AU นับ lot · Y รวม · วิเคราะห์สั่งซื้อ · ช่องบิลรอในชีทเบิก · หน่วยย่อย · ติดตาม PO) + codepage VBA เท่าเดิม → `cmp` ไฟล์จริงยังไม่ถูกแก้ → วางกลับ
5. รูป → `บิลยา_<เดือน>` + `_ดัชนีบิล.csv` (บิลเดียวหลายยา = แถวบิลซ้ำต่อยา) → `import:receive` + `import:master` (dry-run → `--commit`)
6. **ใบส่งบิลจัดซื้อ** `python scripts/bill_handover.py` (preview → ตรวจ PDF → `--bills <ชุดเป๊ะ> --commit`) → **ต้องเพิ่มเข้าคิวพิมพ์เองทุกครั้ง** (สคริปต์ไม่ทำให้): append แถว `<วันเวลา>,<path เต็มของ PDF>,,` ลง `Desktop\รวมเบิกยา\PDF\_สถานะพิมพ์.csv` (CRLF) แล้ว `python scripts/print-queue.py` → ไฟล์ไปอยู่ `PDF\รอพิมพ์\<ว.ด.ปป>\` (1 ชุด)
7. `_ข้อสังเกตบิลและใบเบิก.csv` ถ้าหน่วย/บริษัท/ราคาผิดปกติ → เช็คโฟลเดอร์พักอีกรอบ
8. **⛔ งานใหม่ (user สั่ง 15/10/2569) — บิลการซื้อทุกใบที่รับเข้า ต้องลง "ยามาส่ง" ในระบบติดตามการสั่งซื้อของจัดซื้อ (Apps Script) ด้วย ไม่ใช่แค่ไฟล์คลัง** · `python scripts/po_match.py` (dry-run: จับคู่ PO ในระบบกับบิลชีท `รับยา` ด้วยเลข PO คอลัมน์ I + ยอดบิล = ยอด PO · เซฟ `ส่งบิลให้พี่โก้\_POจัดซื้อ_จับคู่บิล.csv`) → `--commit` → รันซ้ำไม่ใส่ `--commit` ให้ CSV เป็นสถานะล่าสุด · วันที่ยามาส่ง = คอลัมน์ O "วันที่รับ" (user เลือก 15/10/2569 — วันคีย์ ช้ากว่าของมาถึง 1–2 วัน ยอมรับได้) · **คลังลงเฉพาะแท็บ "คลังยา" ห้ามแตะแท็บอื่น** · ระบบไม่มีปุ่มย้อนกลับ สคริปต์จึงลงให้เฉพาะ PO ที่จับด้วยเลข PO + บิลเดียว + ยอดตรง — **ช่อง PO ในชีทว่าง = แก้ชีทก่อน** (`รับยา` I + `รับเข้า` I) ไม่ลงจากการเดาด้วยยอด
   - **PO ส่งหลายบิล = ลงครั้งเดียวเมื่อครบ PO** (user ตกลง 15/10/2569): เลขบิล `A, B` · วันที่ = วันรับบิลสุดท้าย · ยังไม่ครบ = "ส่งบางส่วน" ค้างรอยามาส่งโดยเจตนา (check-complete แสดง "…" ไม่นับเป็นปัญหา) · **บริษัทไม่ส่งส่วนที่เหลือ → รอจัดซื้อยืนยันก่อน** แล้ว `--short-ok "<เลข PO>" --commit` ห้ามใส่เองจากการเดา
   - **verify ทุกครั้ง: `python scripts/check-complete.py` ข้อ "บิลซื้อ ↔ ระบบติดตามการสั่งซื้อ"** — บิลรับเข้าแล้วแต่ PO ยังรอยามาส่ง / ยอดไม่ตรง / ช่อง PO ว่าง / PO ไม่อยู่ในระบบ = ไม่ครบ · เชื่อมระบบไม่ได้ (เน็ตล่ม) = ไม่ครบ ห้ามสรุปว่าครบ · PO ก่อน 007.05/2570 ไม่อยู่ในระบบ = ปกติ ไม่นับ · PO เกิน 10 วันยังไม่มาส่งแสดงเป็น "…" ไว้ตามบริษัท
- **⛔ ห้ามรวมบิลใหม่เข้าใบส่งบิลเลขเดิมเอง — ถาม user ก่อนทุกครั้งว่าใบเดิมส่ง/พิมพ์ไปแล้วหรือยัง** (15/10/2569 พลาด 2 ครั้งในวันเดียว: สบ.70/004 ออกใหม่ทับใบที่จัดซื้อเซ็นแล้ว · สบ.70/005 ของ 14/10 ที่พิมพ์+ส่งไปแล้วถูกรวมบิลใหม่เป็นใบ 15/10 — ต้องคืนใบเดิมแล้วออก สบ.70/006 แยก). **ทะเบียนช่องเซ็นรับว่าง ≠ ยังไม่ส่ง · คิวพิมพ์ยังไม่ติ๊ก ≠ ยังไม่พิมพ์** (user มักพิมพ์/ส่งแล้วไม่ได้บอก) · ค่าเริ่มต้น = บิลใหม่ออกเลขใหม่เสมอ · รวมเลขเดิมเฉพาะเมื่อ user ยืนยันว่าใบเดิมยังไม่ออกจากคลัง: สำรอง PDF + ทะเบียนไป scratchpad → ลบแถวเลขนั้นจากทะเบียน + ย้าย PDF เดิมออก → รัน `bill_handover.py` ใหม่ (ได้เลขเดิม ชื่อไฟล์เดิม)
- **แก้ข้อมูลบิล (เช่นเลข PO) หลังออกใบส่งบิลแล้ว** → `python scripts/bill_handover.py --reissue สบ.70/xxx --bills <ชุดเดิม>` (preview → `--commit`) ได้เลขที่/วันที่ส่ง/ชื่อไฟล์เดิม แทนที่แถวทะเบียนตำแหน่งเดิม สำรอง PDF เก่าใน temp · ใช้ได้เฉพาะใบที่จัดซื้อยังไม่เซ็นรับ — **⛔ ด่านเช็คแค่ทะเบียน: ดูโฟลเดอร์พัก `จัดซื้อเซ็นรับ\` ก่อนทุกครั้ง** (15/10/2569 ออก สบ.70/004 ใหม่ทั้งที่จัดซื้อเซ็นฉบับเดิมไปแล้ว 14/10 แต่รูปเซ็นรับยังไม่ได้ติ๊กทะเบียน) · แล้วเพิ่มเข้าคิวพิมพ์ใหม่ (ใบเดิมพิมพ์ไปแล้ว ต้องสลับใบที่ให้จัดซื้อ) · เลข PO ใน Master AW เป็นสูตรดึงจาก `รับยา[เลขที่PO]` (ตาราง `รับยา` ในชีท `รับเข้า` ของไฟล์ยอดคลัง) → แก้ที่ `รับยา` I + `รับเข้า` I ไม่แก้ AW ตรง
- **⛔ ชีท `รับยา` คอลัมน์ L "ราคา/หน่วย" เป็นสูตรดึงราคาซื้อครั้งก่อนของรหัสเดียวกัน** — บิลราคาเปลี่ยนต้อง**พิมพ์ราคาบิลทับ**เป็นตัวเลข (+ M/N ยอดรวม) ไม่งั้นค้างราคาเก่าแบบเงียบ (Hyoscine บิล 8260851581: ชีท 430 บิลจริง 425 — แก้ 15/10/2569) · เทียบยอดบิลในชีทกับยอดบิลกระดาษ + ยอด PO ทุกครั้ง
- **lot ใหม่ซ้ำกับแถว `ยกยอด` เดิมใน Master ไม่ต้องกลัวหักซ้ำ** — สูตร T จับคู่ชีทเบิกด้วยชนิดรายการด้วย (`ยกยอด` ≠ `ซื้อยา`) · ด่านกันแถวซ้ำในสคริปต์ต้องเช็ค รหัส+lot+**เลขบิล** (รหัส+lot อย่างเดียว = ล้มผิด)

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # Run ESLint (⚠️ ไม่ใช่ 0 — มี error ค้างเดิม ดู "ก่อน commit ทุกครั้ง")
npm run preview      # Preview production build
npx eslint <ไฟล์>    # lint เฉพาะไฟล์ที่แก้ — ใช้ตัวนี้ก่อน commit ไม่ใช่ npm run lint
node src/lib/<x>.test.js   # รัน golden test ไฟล์เดียวตรงๆ (ไม่มี framework จึงไม่มี -t/--filter)
npm run test:reorder   # Golden tests สำหรับ src/lib/reorder.js (35 assertions)
npm run test:billgroup # Golden tests สำหรับ src/lib/billGroup.js — AP bill grouping (24 assertions)
npm run test:unit      # Golden tests สำหรับ src/lib/unitParser.js — แปลงหน่วยซื้อ/เบิก (test อยู่ที่ src/unitParser.test.js)
npm run test:alloc     # Golden tests สำหรับ src/lib/lotAllocation.js — FEFO auto-split (เบิกระดับยา B-base)
npm run test:ledger     # Golden tests สำหรับ src/lib/ledgerRollover.js — สมการคงคลัง + ขึ้นเดือนใหม่ (ADR-0007)
npm run test:ledgerseed # Golden tests สำหรับ src/lib/ledgerSeed.js — seed master CSV → ledger row (ADR-0007)
npm run test:swappolicy # Golden tests สำหรับ src/lib/swapPolicy.js — parse นโยบายคืนยา + deadline (88 assertions — V1 free-text + V2 structured tier % 6 หมวดฐานเวลา, ADR-0014)
npm run test:consistency # Golden tests สำหรับ src/lib/consistencyCheck.js — ตรวจความสอดคล้อง CSV→DB (40 assertions)
npm run test:countmatch  # Golden tests สำหรับ src/lib/countMatch.js — ตรวจนับ: 3 สถานะต่อมิติ ครบ 4 มิติ (จำนวน/ที่เก็บ/exp/lot) + set equality ที่เก็บ/exp (49 assertions)
npm run test:countpriority # Golden tests สำหรับ src/lib/countPriority.js — จัดอันดับ "ควรตรวจนับตัวไหนก่อน" 4 สัญญาณถ่วงน้ำหนัก (29 assertions)
npm run test:stockcard   # Golden tests สำหรับ src/lib/stockCard.js — การ์ดคลัง lot: running balance ต่อ lot + drift detection (105 assertions)
npm run test:vendorexchange # Golden tests สำหรับ src/lib/vendorExchange.js — รอบเปลี่ยน/คืนบริษัท: จับคู่ขาส่ง↔ขารับ หา "ของลอย" — จับคู่ 2 ชั้น: เลขที่รอบ VX ก่อน แล้ว fallback ไปเดา (50 assertions, ADR-0024)
npm run test:announce # Golden tests สำหรับ supabase/functions/_shared/announceSchedule.js — ปฏิทินรอบเบิก-รับ + วันหยุด (116 assertions) ⚠️ test อยู่ที่ src/lib/announceSchedule.test.js แต่ source อยู่ใน supabase/functions/_shared/ (import ข้ามโฟลเดอร์)
npm run test:loanimport # Golden tests สำหรับ src/lib/loanImport.js — นำเข้า CSV ยืม-คืนยา: derive ทิศทาง + diff กับของในระบบ (47 assertions)
npm run test:receivesheet  # Golden tests สำหรับ src/lib/receiveSheet.js — อ่านชีท 'รับยา' จาก .xlsm (102 assertions)
npm run test:mastersheet   # Golden tests สำหรับ src/lib/masterSheet.js — อ่านชีท Master (44 assertions)
npm run test:dispensesheet # Golden tests สำหรับ src/lib/dispenseSheet.js — อ่านชีท 'เบิก ' (63 assertions)
npm run test:reordersheet  # Golden tests สำหรับ src/lib/reorderSheet.js — อ่านชีทวิเคราะห์สั่งซื้อ (37 assertions)
npm run test:importguard   # Golden tests สำหรับ src/lib/importGuard.js — ด่านตรวจก่อนเขียน DB (66 assertions)
npm run test:excelsync     # Golden tests สำหรับ src/lib/excelSync.js — ปุ่ม "นำเข้าจาก Excel": ส่วนต่างรายช่อง + ด่านไฟล์เก่า/สถานะตรวจรับขัด + ไฟล์รับยา/ยืมยา (76 assertions)
npm run test:usagerow      # Golden tests สำหรับ supabase/functions/_shared/usageRow.js — กฎแถวเบิกที่นับเป็นการใช้ (4 แบบตามสูตรชีทวิเคราะห์สั่งซื้อ) + localYmd (21 assertions) ⚠️ test อยู่ src/lib/ แต่ source อยู่ _shared (แอป + edge function expiry-alert ใช้ไฟล์เดียวกัน)
npm run test:workqueue     # Golden tests สำหรับ src/lib/workQueue.js — คิวงานวันนี้บนหน้าหลัก (เกณฑ์/สี/ลำดับความเร่ง/คืนบริษัทแยกเลยเส้นตาย) + บรรทัดรอบเบิก-รับถัดไป (31 assertions)
npm run test:popupseen     # Golden tests สำหรับ src/lib/popupSeen.js — popup เฉพาะ lot ที่คนนั้นยังไม่เคยเห็น วันละครั้ง (16 assertions)
npm run test:reservecheck  # Golden tests สำหรับ src/lib/reservationCheck.js — ตรวจยอดจองซ้ำหลังส่งใบเบิก + จำลองทุกลำดับ 2 ใบพร้อมกันต้องไม่จองเกิน (17 assertions, ADR-0028)
npm run test:installenv    # Golden tests สำหรับ src/lib/installEnv.js — ปุ่มติดตั้งแอป (PWA) แสดงแบบไหนต่อเครื่อง: Android prompt / iPhone / LINE in-app / ติดตั้งแล้ว-คอม = ไม่แสดง (14 assertions)
npm run test:drugprofile   # Golden tests สำหรับ src/lib/drugProfile.js — บัตรยา + ค้นหายา: ยอดรวม = โมดอลรายการยาในคลัง, ต่ำกว่า SS = Dashboard, บรรทัด lot+exp, บิลของ lot, เรท/คงอยู่ได้อีก = สูตรหน้าวิเคราะห์สั่งซื้อ, ประวัติเบิกหน่วยงานตัวเอง (95 assertions)
npm run test:linechat      # Golden tests สำหรับ src/lib/lineChatImport.js — ⚠️ ยังไม่มี consumer ในแอป (ดู Dead code ด้านล่าง)
```

### นำเข้า Excel เข้า DB ผ่าน CLI (`scripts/*.mjs`)

อ่าน `.xlsm` ใน OneDrive ตรงๆ แทนการ copy sheet → Save As CSV → อัปโหลดผ่านหน้าเว็บ — **ใช้ `/import-excel` skill** ซึ่งมีกับดักครบ (serial วันที่ปนรูปแบบ, พ.ศ. ใน serial, lot ที่มีตัว E)

```bash
npm run import:receive   # ชีท 'รับยา'          → receive_logs      🔴 DELETE ALL
npm run import:master    # ชีท Master           → inventory         🔴 DELETE ALL
npm run import:dispense  # ชีท 'เบิก '          → dispense_logs     🔴 DELETE ALL
npm run import:reorder   # ชีท วิเคราะห์สั่งซื้อ → drug_reorder_config 🟢 UPSERT
npm run import:loan      # ชีท 'รพ.ยืมยา'       → drug_loan         🟢 diff insert/update
npm run export:csv       # ทุกชีท → csv_file/*.csv (ไม่แตะ DB)
npm run import:restore   # กู้คืนจาก backup/*.json
node scripts/stock.mjs <คำค้น> [--all]  # เช็คคงเหลือยาจากชีท Master (อ่านอย่างเดียว — สกิล /stock-check)
```

**ทุกตัวเป็น dry-run โดยค่าเริ่มต้น ต้องใส่ `--commit` ถึงเขียนจริง** — `--commit` **ไม่ใช่ `git commit`** มันคือ "ปุ่มอัปโหลด" ที่เคยกดบนหน้าเว็บ (ผู้ใช้เคยเข้าใจผิด 2026-09-22) สำรองอัตโนมัติก่อนเขียนเสมอ — สำรองไม่สำเร็จ = ไม่เขียน

**CLI ไม่ทำ DELETE/INSERT เอง** แต่เรียกฟังก์ชันใน `db.js` ตัวเดียวกับที่หน้าเว็บใช้ (`insertReceiveRows` ฯลฯ) เพื่อไม่ให้ตรรกะ import แตกเป็น 2 ชุดแล้วดริฟต์

⚠️ **path ไฟล์ default ในสคริปต์เป็นของเครื่องเก่า** (`C:/Users/PRH0000484/OneDrive/...`) — เครื่องอื่นต้องใส่ `--file "<path>"` ทุกครั้ง

### เขียนกลับลงไฟล์ `.xlsm` (แก้ชีทแทนคลัง) — Excel COM ผ่าน PowerShell เท่านั้น

**⛔ ก่อนเขียน `.xlsm`/`.xlsx` ของคลังทุกครั้ง (ลงบิล · ลงใบเบิก · ยืม-คืน · แก้สูตร · ย้ายชีท) ต้องโหลด skill `/excel-com`** — ขั้นตอนบังคับ 10 ขั้น + กับดักทั้งหมด (REGEXREPLACE/packsize · VBA codepage 1252 · spill · เปลี่ยนรหัส/ชื่อยา · copy ชีทข้ามไฟล์ · ย้าย snapshot) ย้ายไปอยู่ในนั้น 19/10/2569 · 5 ข้อที่ห้ามพลาดแม้ไม่ได้เปิด skill:
1. **ห้ามเขียนด้วย SheetJS** (อ่านได้อย่างเดียว) — macro / table / สูตร structured reference หายหมด
2. **ไฟล์ใน OneDrive ห้ามเปิดผ่าน COM ตรงๆ แม้งานเล็ก** — AutoSave เซฟลงไฟล์จริงภายในวินาที → copy ไป scratchpad → แก้ → ตรวจ → วางกลับ
3. **`.xlsm` ใช้ `AutomationSecurity = 3` + แก้เฉพาะค่าเซลล์** — เพิ่ม/ลบ/copy ชีท หรือ security 1 แล้ว Save = VBA เป็น codepage 1252 แมโครอ่านชื่อชีทไทยไม่ได้
4. **`Calculate()` ห้าม `CalculateFull()` + diff ทีละเซลล์กับสำเนาเดิมก่อนวางกลับ** — Excel เครื่องนี้ไม่มี `REGEXREPLACE` packsize/หน่วยย่อย (Master AQ/AR) เพี้ยนแบบเงียบ ต้องไม่เปลี่ยน
5. **Excel ค้าง/ไฟล์ล็อก → ให้ user End task `EXCEL.EXE` เอง** — Claude ไม่ได้รับอนุญาตให้ kill process

### ขึ้นเดือนใหม่ในไฟล์ Master (`/upgrade-month-v3`) — กับดักที่สกิลเดิมไม่มี
- **สูตร S อ้างชีท snapshot เดือนก่อน** `COUNTIFS('Master_<เดือนก่อน>'!$F$2:$F$<last>,…K…,…R…)` (ยกมา→N / รับใหม่→P) → ต้องเปลี่ยนเป็น snapshot ที่เพิ่งสร้างทุกรอบ ไม่งั้นซื้อยาค้างส่งบัญชีนับรับซ้ำ
- **สูตร T อ่านชีท `เบิก ` ช่วงแถวตายตัว** (ขยายเป็น `$12000` รอบ ต.ค.69) — เลยช่วง = ไม่ถูกหักแบบเงียบ
- **วันตัดงวด = วันที่ขึ้นเดือนจริง** ไม่ใช่วันที่ 1 (CONTEXT.md §ปิดงวด) — งวด ก.ย.69 = 31/08–02/10, ต.ค. เริ่ม 03/10 ปลาย `<01/11` แก้ตอนขึ้น พ.ย.
- **สูตรมูลค่าที่แก้รอบ ต.ค.69 (คงอยู่ในไฟล์แล้ว ไม่ต้องทำซ้ำ)**: Z/AB ตัด `ยาโครงการ`/`คืนยา`/`คืนยา(2)` ออก (มูลค่าคงคลัง = ยาซื้อเท่านั้น) · รับเข้าบริจาค/สนับสนุน (AF) และยาโครงการ (AH) = **(S−N)×J** (เดิม P×J นับซ้ำทุกเดือน — Herb_สสจ เกินจริง) · คอลัมน์ใหม่ **AK** "มูลค่าคงคลัง ยาโครงการ เดือน <ก่อน> (บาท)" = มูลค่ายาโครงการยกมา N×J (สร้างที่ AX แล้ว**ย้ายมาต่อท้ายกลุ่มยาโครงการ 06/10/2569** แบบเดียวกับ AG ของกลุ่มบริจาค → AK–AW เดิมเลื่อนขวา 1 ช่อง: packsize AQ, หน่วยย่อย AR, รหัส_txt AS, _key_packsize AT, PO AW, วันที่ตรวจรับ AX), AJ = AK+AH−AI — ดู CONTEXT.md §มูลค่าคงคลังยาบริจาค/สนับสนุน และยาโครงการ
- **แถว `แก้ไขระบบ` ที่ U>0 ยกไปเดือนถัดไป** ลบได้เฉพาะ U=0 และ AB=0 (ฝั่งแอป [ledgerRollover.js](src/lib/ledgerRollover.js) ใช้กฎเดียวกันแล้ว 04/10/2569)
- **แก้เลขบิล (R) หรือ lot ของแถวที่ยกมา = สูตร S จับคู่ snapshot ไม่ได้ → ได้ P แทน N** (ก.ย.69 เจอ 6 แถว รอดเพราะ N=P) → preflight ก่อนขึ้นเดือนต้องลิสต์แถว "หาคู่ใน snapshot ไม่เจอ แต่ N≠0" ถ้า N≠P หยุดถามก่อน. **อย่าแก้ AF/AH เป็น COUNTIFS** — แถวพวกนี้จะถูกนับรับเข้าซ้ำ
- มูลค่าค้าง (U=0 แต่ AB≠0) หักด้วย Z พิมพ์ทับในเดือนที่ปิด → **ต้องคืนสูตร Z ใน Master หลังสร้าง snapshot** ไม่งั้นหักซ้ำเดือนหน้า
- macro ชีท Master (`Worksheet_Change`) อ้างคอลัมน์ด้วย index ตายตัว (L=12, M=13, N=14, O=15, P=16, V=22, W=23, AC=29) → **ห้ามแทรกคอลัมน์ก่อน AC** · แทรกหลัง AJ ได้แต่ต้องขยายลูป copy สูตรใน macro ให้ครอบ `_key_packsize` ด้วย · คำว่า "ยกยอด" ใน macro นี้เก็บเป็น `?????` จริงในไฟล์ → กิ่ง "ยกยอด → N=P" ไม่เคยทำงาน (ที่ทำงาน: เติม 0 ให้ N/AC/V/W ว่าง + copy สูตร **S:AT (คอลัมน์ 19–46)** จากแถวบนลงแถวใหม่ — เดิม S:AS 19–45 ขยายตอนย้ายคอลัมน์ยาโครงการยกมาไป AK 06/10/2569 ไม่งั้นแถวยาใหม่ไม่ได้สูตร `_key_packsize` → packsize เพี้ยน)
- **Module2 (`PartialUpdate`/`SyncNewDrugs`) = macro ล้าสมัย ห้ามรัน และห้าม "แก้" ชื่อชีท `"เบิก"` → `"เบิก "`** — ตอนนี้ error ทันทีเพราะหาชีทไม่เจอ (ไม่มีผล; `MASTER_LAST = 963` จึงไม่ต้องแก้) ถ้าแก้ชื่อแล้วรัน จะเขียนสูตร layout เก่าทับชีทวิเคราะห์สั่งซื้อ + ล้าง AI:AL. ปุ่มบนชีทใช้แค่ RefreshAnalysis/RecalcNow/ToggleViewMode
- **ชีทวิเคราะห์สั่งซื้อ (จัดใหม่ 04/10/2569): เบิกรายเดือน E–P = 12 เดือนล่าสุดที่ปิดแล้ว เรียงเก่า→ใหม่ เลื่อนเองตาม `TODAY()`** — แถว 2 = วันที่ต้นเดือนของคอลัมน์ (`P2 = EOMONTH(TODAY(),-2)+1`, format `[$-th-TH,107]mmm yy`), หัวตาราง "เบิก ด.1–ด.12" (หัว table ใส่สูตรไม่ได้), สูตรอ้าง `เบิกยา[...]` ทั้งคอลัมน์ (เลิกล็อก `$9234`), รวม/Max/Avg/รวม3เดือน อ้าง N:P ตรง (เลิก `CHOOSE(MONTH(TODAY()))`), AS อ้าง `Master[Exp]` (เดิม `$1110` ตกแถวสุดท้าย). คอลัมน์ M–AF เดิมเลื่อนไป Q–AJ, AK–AL คงที่. **06/10/2569 ลบ AM–AP** ("ตัวช่วยคำนวณ ขอเบิกเท่านี้ควรให้เท่าไหร่" — ซ้ำกับชีทเบิก) → Table7 = `A3:AL460` · **รอบสั่งซื้อ 7 วันย้ายจาก AN1:AN2 ไป AM1:AM2** (ROP X อ้าง `$AM$2` — ห้ามลบช่องนี้) · สูตร exp ล่าสุดนอกตาราง AS → AO. verify ด้วยการเทียบค่าทุกเซลล์ 18,984 เซลล์ = 0 ต่าง + macro เหมือนเดิม. **ไม่ต้องแก้ทุกเดือนแล้ว**. ⚠️ สกิล notify-drug-followup / manage-drug-sync / verify-4sheet(-v2) อ้างตัวอักษรคอลัมน์ — ย้ายคอลัมน์อีกต้องแก้สกิลด้วย. backup `ยอดคลังยา_69_ก่อนจัดชีทวิเคราะห์_20261004_162502.xlsm` (ReorderApp ในแอปไม่กระทบ)
- **ช่วงวันที่ที่ตัดเบิกในงวด ต.ค.69**: สูตร T (ปริมาณออก) ของ Master = `SUMIFS` ชีท `เบิก ` แถว 7–12000 ที่ match รหัส+lot+ราคา/หน่วย+ชนิดรายการ และ **วันที่เบิก `>= 03/10/2569` และ `< 01/11/2569`** — เบิกวันที่ 01–02/10 ตัดไปแล้วในงวด ก.ย. · ตอนขึ้น พ.ย. แก้ปลาย T ของ ต.ค. เป็นวันขึ้นเดือนจริง (ไม่ใช่ 01/11 ถ้าขึ้นเดือนช้ากว่านั้น) · S = ยกยอด*/แถวที่จับคู่ snapshot ได้ → N, แถวใหม่ → P
- **ยืม-คืนยามีมูลค่า (ตั้งแต่ปรับปรุงสิ้นปีงบ 2569 — 04/10/2569)** — นิยามใน [CONTEXT.md §การยืมยา](CONTEXT.md) · แผนเต็ม [docs/design-loan-valuation.md](docs/design-loan-valuation.md) · สถานะ/งานค้าง [docs/handoff-2026-10-04-loan-valuation.md](docs/handoff-2026-10-04-loan-valuation.md):
  - `Master_ก.ย.69` แถว 1123–1128 = **บล็อกปรับปรุงส่งบัญชี** (ลูกหนี้ยืม 6,110 · เจ้าหนี้ยืม 8,935.35 · เบิก 1,879,464.54 · คงคลัง 3,003,466.86, ช่องตรวจแถว 1127 ตรวจสมการ "ยกมา+ซื้อ−เบิก = คงคลัง+ลูกหนี้−เจ้าหนี้") — แถว 1120 เป็นยอดระดับตาราง (เบิก 1,876,639.19) คนละตัวกับยอดส่งบัญชี
  - **08/10/2569 ย้าย 2 บิลจากยอดซื้อ ก.ย. ไป ต.ค.** (หัวหน้าเช็คกับบัญชี — ไฟล์ `Documents\ยอดคงคลังเวชภัณฑ์ยา-มิใช่ยา-ก.ย.69_แก้ไข.xlsx`): แอปคาร์ Valproate 500 IV6909746 PO 916.05 = 12,500 · เกร๊ทเตอร์ NAC+Lactulose 01-GM-1-1-2-2026006907 PO 918.05 = 10,238 → `Master_ก.ย.69` B = ไม่มีการดำเนินการ (ซื้อ ก.ย. 1,680,376.55 · คงคลัง 3,003,466.86 ตรงไฟล์หัวหน้า+จัดซื้อ) · `Master` 3 แถว AC = 0 + ชนิดรายการ `ซื้อยา` · **B ยังไม่ "ส่งแล้ว" — รอขึ้นทะเบียนจัดซื้อชีท ต.ค.69 แล้วค่อยเปลี่ยน** (ยอดซื้อ ต.ค. +22,738) · แก้ไฟล์รายงาน `Desktop\ยอดคงคลัง\ยอดคงคลังส่งบัญชี\ยอดคงคลังเวชภัณฑ์ยา-มิใช่ยา-ก.ย.69.xlsx` ตามแล้ว
  - **⛔ แก้ยอดคงคลัง/มูลค่าของงวดที่ส่งบัญชีแล้วเมื่อไร ต้องแก้ไฟล์รายงานยอดส่งบัญชีของงวดนั้นตามทุกครั้ง** (user สั่ง 08/10/2569 — เคยแก้แค่ Master แล้วไฟล์รายงานค้างยอดเดิม) แล้ว verify ให้ตรงกันทุกไฟล์: Master snapshot · ไฟล์รายงาน · ไฟล์ที่หัวหน้าแก้ · ทะเบียนจัดซื้อ (รายละเอียด memory `sync-accounting-report-after-stock-fix`)
  - **ทะเบียนบิลส่งบัญชีแล้ว** `Desktop\ยอดคงคลัง\ยอดคงคลังส่งบัญชี\_ทะเบียนบิลส่งบัญชี.csv` (เดือนที่ส่ง · บริษัท · บิล · PO · มูลค่า — user สั่ง 15/10/2569) สร้างจากแถว B = `ส่งแล้ว` ของชีทรายเดือน ด้วย `python -B scripts/acct-sent-register.py` (เขียนทับทั้งไฟล์ · ต้องขึ้น "ตรง" ทุกเดือน) → **รันใหม่ทุกครั้งหลังส่งบัญชี/ขึ้นเดือน** (ขึ้นเดือนแล้วเพิ่มชีทใน `SOURCES`) · PO ไม่มีในชีทเดือนก่อน มิ.ย.69 → หาจากชีท `รับยา` ด้วยเลขบิล (~25% ยังไม่พบ PO)
  - แถว `คืนยา` 5 แถวใน `Master_ก.ย.69` **พิมพ์ทับ** Z = −มูลค่า / AB = +มูลค่า (กลับรายการค่าใช้จ่ายตอนให้ยืม) — snapshot ห้าม copy สูตรทับ
  - **Master ต.ค. เป็นต้นไป: สูตร Z/AB ไม่ยกเว้น `คืนยา`/`คืนยา(2)` แล้ว** → แถว `คืนยา` ต้องมี **ราคาทุนเดิม** (จากชีท `รพ.ยืมยา`) และแถว `ยืมยา` ต้องใส่ **ราคาซื้อล่าสุด** (เดิมลง 0 ทั้งคู่) · ลูกหนี้/เจ้าหนี้ยืมยกมาอยู่ `Master` แถว 1119–1120 (ค่าคงที่ — **ต้องยกต่อทุกเดือน** ยังไม่มีในสกิล upgrade-month-v3)
  - ⚠️ **ยังไม่มีคอลัมน์ "ประเภทการจ่าย" ในชีทเบิก** → ให้ยืมออก/คืนยาที่ยืมมาใน ต.ค. ยังนับเป็นเบิกใช้ ต้องทำก่อนปิดงวด ต.ค. (ห้ามแก้ชนิดรายการ L ของแถวเบิกเป็น `ยืมยา` — SUMIFS ของ T จับคู่ไม่ติด ยอดไม่ลดแบบเงียบ)

### นำเข้า Excel ผ่านปุ่มในแอป (`ExcelSync.jsx` — ADR-0027)

ปุ่ม **"นำเข้าจาก Excel"** บน top bar ของ `AppShell` (staff/admin) — อ่าน **2 ไฟล์ · 4 ชีท** ในเบราว์เซอร์: `ยอดคลังยา_69.xlsm` (Master → inventory · เบิก → dispense_logs) + `รับจากการซื้อ_ยืม_…xlsm` (รับยา → receive_logs · รพ.ยืมยา → drug_loan แบบ diff ไม่ลบแถวที่หาย); เลือก 1–2 ไฟล์ต่อรอบ ถ้าเลือกคู่ สถานะตรวจรับใน Master เทียบกับชีทรับยาในไฟล์ และเขียนรับยาก่อน Master; ด่าน `app_only_data` ของรับยาห้ามข้าม; ไฟล์ที่ไม่มีส่วนต่าง ด่านของมันลดเป็นคำเตือน (`combinePlans`). ชีทอื่นใน ยอดคลังยา_69.xlsm ไม่ต้องดึง ยกเว้น วิเคราะห์สั่งซื้อ (ยัง CLI `import:reorder`) — **Stock Card (Lot) ห้ามดึง** แอปคำนวณเอง → แสดง **ส่วนต่างรายช่อง** (เหมือนเดิม/แก้ค่า/เพิ่ม/ลบ) + ด่านตรวจ → คนกดยืนยัน. แทนปุ่ม CSV เดิม ("อัปโหลด Master" ในแผนผัง + "Import CSV" ในประวัติเบิก — ถอดแล้ว 2026-09-28; ทั้ง 2 จุดเปิดโมดอลเดียวกันผ่าน `openExcelSync()` ใน `lib/excelSyncEvent.js`)
- **ตรรกะอยู่ใน `src/lib/excelSync.js` (pure)** ใช้ตัวอ่านชีทของ CLI (`masterSheet.js`/`dispenseSheet.js`) + `importGuard.js` — ห้ามเขียนตัวอ่านใหม่. `saveInventory`/`insertDispenseRows` เรียก `flattenInventory`/`backfillDrugUnit` จาก excelSync ด้วย → **ส่วนต่างคำนวณจากแถวหน้าตาเดียวกับที่เขียนจริง** (แยกกัน = ไฟล์ไม่เปลี่ยนก็โชว์ว่าเปลี่ยน)
- **เทียบตัวเลขปัด 4 ตำแหน่ง** (DB เก็บราคา 4 ตำแหน่ง ไฟล์มี 13 — ไม่ปัด = 17 แถว "เปลี่ยน" ทุกรอบ)
- **ด่านเพิ่มจาก CLI**: ไฟล์แก้ก่อนการนำเข้าครั้งล่าสุด (`file_older_than_import` — Master ไม่มีวันที่ให้ `stale_file` ใช้; **ยิงเฉพาะตอนมีส่วนต่าง** ไม่งั้นเปิดไฟล์เดิมหลังนำเข้าเสร็จโดนเตือนทุกครั้ง), สถานะ "รอตรวจรับ" ใน Master ขัดกับ `receive_logs` (`receive_status_conflict` — เคสจริง 2026-09-28: 15 lot ค้างสถานะเก่า ด่านเดิมผ่านหมด), แถวเบิก `source ≠ 'csv'` (`app_only_dispense` — ห้ามข้าม). ด่านที่ `overridable` ข้ามได้ด้วยการติ๊กยืนยัน (= `--force`)
- `applyExcelSync` (db.js) **เขียนเฉพาะตารางที่มีส่วนต่าง** + `saveUploadMeta`; ยังเป็น DELETE ALL → INSERT ไม่ใช่ transaction (ล้มกลางทาง = กดนำเข้าไฟล์เดิมซ้ำ)
- **ตัวเฝ้าไฟล์** (File System Access API — Chrome/Edge บนคอมเท่านั้น): "เชื่อมไฟล์" ครั้งเดียว → handle เก็บใน IndexedDB → เช็ค `lastModified` ทุก 10 วิ (ไม่อ่านไฟล์ทั้งก้อน) → ปุ่มขึ้นป้าย "ไฟล์ Excel เปลี่ยน". เปิดแอปใหม่ Chrome ถามสิทธิ์อ่านอีกครั้ง. เบราว์เซอร์อื่น/มือถือ = เลือกไฟล์ทุกครั้ง

ไม่มี test runner ทั่วไป — golden tests เป็น standalone `node` (ไม่มี framework): `src/unitParser.test.js` (`npm run test:unit`), `src/lib/reorder.test.js` (`npm run test:reorder`), `src/lib/billGroup.test.js` (`npm run test:billgroup`), `src/lib/lotAllocation.test.js` (`npm run test:alloc`), `src/ledgerRollover.test.js` (`npm run test:ledger`), `src/ledgerSeed.test.js` (`npm run test:ledgerseed`), `src/lib/swapPolicy.test.js` (`npm run test:swappolicy`), `src/lib/consistencyCheck.test.js` (`npm run test:consistency`). **กฎ**: logic ที่ test แบบนี้ได้ต้องเป็น pure module ไม่ import `supabase` (เพราะ `supabase.js` ใช้ `import.meta.env` ที่ node รันไม่ได้) — ดู `billGroup.js`/`lotAllocation.js`/`ledgerRollover.js`/`ledgerSeed.js` แยกจาก `db.js` ด้วยเหตุนี้. **หมายเหตุ layout**: source module ของ ledger อยู่ใน `src/lib/` แต่ test file (`ledgerRollover.test.js`/`ledgerSeed.test.js`) อยู่ที่ `src/` root — ต่างจาก golden test อื่นที่วาง test ข้าง source

**E2E**: Playwright (`tests/01-15`) — `npx playwright test` · ไฟล์เดียว: `npx playwright test tests/14-stockcount-split.spec.js` — ครอบคลุม login, dashboard, requisition, return, staff flow, validation, permissions, **AP workflow UX, ทุก sub-app smoke, mobile responsive 375px, a11y, ระบบวิเคราะห์การสั่งซื้อยา, โมดอลใกล้หมดอายุ/คืนบริษัท (ประวัติรับยา+scope+deadline+ตัวกรองพับ), การ์ดคลัง lot (13), กรอกนับแยกชั้น (14), แถบปุ่มล่างจอ+การ์ดแนะนำ+ประวัติเบิกตั้งต้นของผู้เบิก 375px (15)** ดู [docs/testing.md](docs/testing.md). ⚠️ **03/04/05/06 กด "ส่งใบเบิก"/"บันทึกการคืนยา"/"อนุมัติ" จริง = เขียนลง Supabase ระบบจริง** (ไม่มี DB ทดสอบแยก) — รันเมื่อได้รับอนุญาตเท่านั้น; ชุดอ่านอย่างเดียว = 01/02/07/08/09/10/11/12/13/14/15. 13/14 ไม่เสถียรตอนรันขนานหลายไฟล์ (ตัวที่ตกเปลี่ยนทุกรอบ) — ตกให้รันไฟล์นั้นเดี่ยวซ้ำก่อนสรุป. 08 เขียนใหม่ 11/10/2569 ตามหน้า AP ปัจจุบัน (3 แท็บ + flow 3 ขั้น อ่านอย่างเดียว 5 เทส) · 13 Export Excel ใช้ `exact: true` (ชนปุ่ม "นำเข้าจาก Excel")

## Architecture

**⛔ ก่อนแก้ไฟล์ใน `src/` · `supabase/functions/` · `tests/` · `scripts/loan-slip.mjs` ต้อง Read [src/CLAUDE.md](src/CLAUDE.md) ก่อน (ครั้งเดียวต่อ session)** — **ไม่โหลดเอง** (ทดสอบ 19/10/2569: Read ไฟล์ใน `src/lib/` ผ่านส่วนขยาย VS Code ไม่มีเนื้อหา src/CLAUDE.md แนบมา) · **บังคับด้วย PreToolUse hook** [.claude/hooks/require-src-claude-md.mjs](.claude/hooks/require-src-claude-md.mjs) (19/10/2569): Edit/Write ไฟล์ใน path เหล่านี้ถูกปฏิเสธจนกว่าจะ Read src/CLAUDE.md หลัง /clear·compact ล่าสุด — ไม่ครอบการแก้ผ่าน Bash (sed/heredoc) · ในนั้น: app flow + navStack/history + PWA · AppShell/navConfig/แถบล่างจอ · ฟอร์มพิมพ์ 14 ใบ · sub-apps ทุกตัว · data layer · pure modules · dead code · Key shared functions · **Critical Rules ตัวเต็ม** (กฎ #10/#11 edge function · `clickMenu`/แถบล่างจอใน tests · anchor ใบยืม-คืนยา)
Single-page React (ไม่มี React Router) — ทุก Supabase query ผ่าน `src/lib/db.js` · schema [docs/schema.md](docs/schema.md)

## Documentation Index

| Topic | File | อ่านเมื่อ |
|-------|------|----------|
| Domain glossary (ภาษากลาง: หน่วยซื้อ/เบิก, packsize, เรท, Refill mode ฯลฯ) | [CONTEXT.md](CONTEXT.md) | **ก่อนคุย/แก้ domain logic** — คำศัพท์ต้องตรง glossary |
| Architecture Decision Records (เหตุผลของ decision ที่กลับยาก) | [docs/adr/](docs/adr/) | ก่อนเปลี่ยน architecture / หาเหตุผลของ decision เดิม |
| Auth & Roles, permissions | [docs/auth.md](docs/auth.md) | แก้ login/role/permission |
| ความปลอดภัย DB: anon key เข้าถึงได้เต็มสิทธิ์ (ความเสี่ยงที่ยอมรับไว้) | [ADR-0016](docs/adr/0016-anon-key-full-db-access.md) | **ก่อนสร้างตารางใหม่** หรือก่อนเก็บข้อมูลประเภทใหม่ลง Supabase |
| Common patterns (date, mobile, print, dept, audit auth, stats) | [docs/patterns.md](docs/patterns.md) | **อ่านทุกครั้ง** ก่อนแก้ component |
| DB schema, migrations, Excel cols | [docs/schema.md](docs/schema.md) | แก้ DB schema / Excel export |
| Monthly Stock Ledger (บัญชีคงคลังรายเดือน — seed/ปิดงวด/cost layer) | [docs/adr/0007](docs/adr/0007-monthly-stock-ledger.md) | แก้ `StockLedgerApp` / ledger logic / seed master CSV |
| กางชีทเบิกรายเดือน (wide → `dispense_logs`) — วันที่ข้ามเดือน, คอลัมน์รวมหน่วยงาน | [ADR-0020](docs/adr/0020-dispense-sheet-unpivot-true-date.md) · [CONTEXT.md §ชีทเบิกรายเดือน](CONTEXT.md) | นำเข้าเดือนย้อนหลังจากชีท Excel ของคลัง |
| นโยบายคืนยา: tier % + กฎ cond_am ระดับบริษัท | [ADR-0014](docs/adr/0014-structured-return-policy-tier-percent.md) · [ADR-0015](docs/adr/0015-cond-am-does-not-override-explicit-tier.md) | แก้ logic เตือนคืนบริษัท (ต้อง sync 4 ที่ + redeploy edge fn) |
| รอบเปลี่ยน/คืนบริษัท: เลขที่รอบ VX ผูกขาออก↔ขาเข้า | [ADR-0024](docs/adr/0024-vendor-exchange-cycle-number.md) · [CONTEXT.md §เลขที่รอบ](CONTEXT.md) | แก้ `vendorExchange.js` / ฟอร์มเปลี่ยนคืนบริษัท / ฟอร์มยาหมดอายุ |
| ยืม-คืนยามีมูลค่า: ลูกหนี้/เจ้าหนี้ยืม, ปรับปรุงสิ้นปีงบ 2569, งานค้างก่อนปิด ต.ค. | [docs/handoff-2026-10-04-loan-valuation.md](docs/handoff-2026-10-04-loan-valuation.md) · [docs/design-loan-valuation.md](docs/design-loan-valuation.md) | **เริ่มงานต่อจากเครื่องอื่น** / แก้มูลค่ายืม-คืนใน Master / ขึ้นเดือน พ.ย. |
| ยืม-คืนยา: ของที่ส่งต่อผู้ดูแลไม่นับเป็นของค้างคืน | [ADR-0025](docs/adr/0025-pass-through-loan-closed-on-handover.md) · [CONTEXT.md §ของค้างคืน](CONTEXT.md) | แก้ `DrugLoanApp` / นิยาม "ค้างคืน" / ฟอร์มยืม-คืนยา |
| ออกแบบหน้า Dashboard ใหม่: ข้อตกลง grill 12 ข้อ, คำถามที่ค้าง, ร่างแผน 5 phase, บั๊กเรท, งานปรับวิธีทำงาน B1–B4 | [docs/handoff-2026-10-10-dashboard.md](docs/handoff-2026-10-10-dashboard.md) · สคริปต์ [docs/handoff-2026-10-10-dashboard-scripts/](docs/handoff-2026-10-10-dashboard-scripts/) | **เริ่มงานต่อจากเครื่องอื่น** / grill ต่อ → `/plan` Dashboard / แก้กฎตัดแถวของเรท |
| Roadmap | [docs/roadmap.md](docs/roadmap.md) | วางแผน feature ใหม่ |
| Testing | [docs/testing.md](docs/testing.md) | รัน/แก้ test |
| Deployment (Netlify + env vars + verify) | [docs/deployment.md](docs/deployment.md) | ขึ้นเว็บจริง / deploy ไม่ผ่าน / แก้ env var |
| ประกาศรอบเบิก-รับ เข้ากลุ่ม LINE (บอทวันเบิก/วันรับ + ปฏิทินวันหยุด) | [docs/features/requisition-announce.md](docs/features/requisition-announce.md) | แก้บอทประกาศ / ปฏิทินวันหยุด / โควตา LINE |
| Expiry Alert Edge Function (แทน Apps Script) | [docs/expiry-alert-edge-function.md](docs/expiry-alert-edge-function.md) | แก้/deploy expiry alert |
| External: Apps Script แจ้งเตือนยาใกล้หมดอายุ (backup) | [docs/apps-script-expiry-alert.md](docs/apps-script-expiry-alert.md) | reference สคริปต์เดิม |
| External: INVS — กระบวนการคลังมาตรฐาน สธ. + INV DataSet + ระเบียบพัสดุ | [docs/invs-warehouse-reference.md](docs/invs-warehouse-reference.md) | **ก่อนออกแบบฟีเจอร์คลังใหม่** — ดูว่าราชการทำกันยังไง / จะส่งข้อมูลกระทรวงต้องมี field อะไร |
| แผนงานปรับกระบวนการคลังตาม INVS (roadmap 11 ข้อ + งานที่ค้าง) | [docs/handoff-invs-2026-08-24.md](docs/handoff-invs-2026-08-24.md) | สานงานโครงสร้างหน่วยงาน / จ่ายด่วน / ค้างจ่าย ต่อ |
| External: Nate Herk (YouTube) — วิธีทำงานกับ Claude Code/AI (skill, บริบท, ตรวจงาน, permission, LLM Wiki, ประหยัด token, ใช้คู่ Codex, handoff + `/clear`) + เทียบกับ repo นี้ | [docs/reference-nateherk-ai-automation.md](docs/reference-nateherk-ai-automation.md) | ก่อนปรับ CLAUDE.md / skill / hook / ออกแบบฟีเจอร์ AI ในแอป / **token ไม่พอ** |
| External: 2 คลิปสร้างแอปด้วย Claude (Expo native + หลังบ้านแยก / เว็บ + Supabase) — เลือก PWA โค้ดชุดเดียว, ล็อกการจองต้องบังคับฝั่ง DB, ช่องว่างมือถือของเรา | [docs/reference-mobile-app-videos.md](docs/reference-mobile-app-videos.md) | ทำให้มือถือใช้ได้เหมือนคอม / ก่อน pilot เบิกยาออนไลน์ / คิดทำแอป native-PWA |
| อ้างอิงดีไซน์เมนู sidebar + แผนผังคลังยา (Dribbble InventiEase/Untitled UI + YouTube NN/g, DesignCourse, Bin Location Labeling) — หลักการที่ใช้ + ที่ยังไม่ทำ | [docs/reference-sidebar-map-design.md](docs/reference-sidebar-map-design.md) | ก่อนปรับเมนู/หน้าแผนผังอีกรอบ |

## Skills (`.claude/skills/`)

| Slash command | สรุปสั้น |
|---------------|---------|
| `/plan` | วางแผน feature ก่อนลงมือ |
| `/pipeline` | รัน lint → build → test ตามลำดับ |
| `/add-db-column` | เพิ่ม column ใน Supabase + wire ผ่าน db.js + CSV |
| `/add-csv-column` | เพิ่ม column จาก CSV (ไม่ใช่ DB) |
| `/new-print` | สร้าง print view (`window.open` + Blob URL) |
| `/drug-search-bar` | เพิ่ม DrugSearchBar autocomplete + badge |
| `/dispense-summary-modal` | Dispense summary modal pattern |
| `/monthly-stats-table` | ตาราง drug × month (ใช้ mechanics จาก `/sticky-table`) |
| `/sticky-table` | ตารางทั่วไป sticky header + frozen column (mechanics กลาง) |
| `/excel-export` | ปุ่ม Export Excel (.xlsx) + audit log |
| `/ui-style-guide` | Tailwind: สี, layout, buttons, inputs + card patterns (detail card, stat card gradient+glow, history-table, mobile card, badge) |
| `/karpathy-checklist` | Quick-check 4 ข้อก่อนลงมือ (Think / Simple / Surgical / Goal-Driven) |
| `/grill-with-docs` | ซักค้านแผนทีละข้อกับ domain model + อัพเดต CONTEXT.md/ADR inline |
| `/scrutinize` | รีวิว plan/PR/diff แบบ outsider — ตั้งคำถาม intent + trace code path จริง |
| `/handoff` | สรุปงานเป็นเอกสารส่งต่อก่อน `/clear` (~120K token / เปลี่ยนงาน / ทิ้งเกิน 1 ชม.) — `/handoff git` = เซฟ `docs/` + push ให้อีกเครื่อง/Codex ทำต่อ · มีเช็คลิสต์งานคลังยา (Excel Save แล้วหรือยัง, เลขเอกสาร, คิวพิมพ์, โฟลเดอร์รอลง) |
| `/excel-com` | **โหลดก่อนเขียน `.xlsm`/`.xlsx` ของคลังทุกครั้ง** — ขั้นตอนบังคับ 10 ขั้น (สำเนา scratchpad → COM → Calculate → diff ทีละเซลล์ → codepage VBA → `cmp` → วางกลับ) + กับดัก COM ทั้งหมด (ย้ายจาก CLAUDE.md 19/10/2569) |
| `/stock-check` | ตอบ "<ยา> เหลือเท่าไหร่" ทันที — `scripts/stock.mjs` อ่านชีท Master: ยอดรวม/จ่ายได้/รอตรวจรับ/ราย lot + exp (คำย่อเติมที่ `ALIAS` ในสคริปต์) |
| `/free-goods-report` | ใบของแถม (.docx) ยาบริจาค/สนับสนุนตามวันรับ — ดึงชีทรับยา+Master, ตรวจรหัส/lot/เอกสาร, แก้ Excel ผ่าน COM เท่านั้น |
| `/purchase-request-report` | รายงานแจ้งการสั่งซื้อยา (รายงานการซื้อยา_69.xlsx) — ย้ายของที่มาส่งแล้วไป Sheet1, เพิ่มรายการใหม่ไม่ซ้ำที่รอของ, ข้อความไลน์ตามยาแบบสุภาพ+เหตุผล; สคริปต์ check/plan/apply/verify/publish (COM บนสำเนา กัน AutoSave OneDrive) · **หลัง publish ทุกรอบต้องทำสำเนา `Desktop\ยอดคงคลัง\รายงานขอซื้อยา\รายงานการซื้อยา_<ว.ด.ปี ค.ศ.>.xlsx`** (ชีทรายงานชีทเดียว — ขั้น 6b `archive_copy.ps1`; user สั่ง 14/10/2569 หลังรอบ 9–14/10 ไม่ตามมา) |

**เมื่อสร้าง UI ใหม่ → อ่าน `.claude/skills/ui-style-guide/SKILL.md` ก่อนเสมอ**

## Workflow

### Karpathy Principles (ใช้ทุก task ที่ไม่ trivial)

> ที่มา: [Karpathy-Inspired Claude Code Guidelines](https://github.com/multica-ai/andrej-karpathy-skills)

1. **Think Before Coding** — surface assumptions ก่อน อย่า assume แบบเงียบๆ
   - ถ้า request interpret ได้ 2 แบบ → ถาม user ก่อนเสมอ
   - ถ้า assume แล้ว → บอก assumption ชัดๆ ใน response

2. **Simplicity First** — minimal code ที่ตอบ requirement จริง
   - ถ้า 50 บรรทัดพอ → ไม่เขียน 200
   - ถ้า pattern มีใน skill แล้ว → ใช้ skill ไม่เขียนใหม่
   - ถ้าไม่ต้อง DB → ใช้ `add-csv-column` แทน `add-db-column`

3. **Surgical Changes** — แตะเฉพาะที่ถูกขอ
   - ไม่ refactor โค้ดที่ไม่เกี่ยว
   - ลบเฉพาะ dead code ที่ตัวเองสร้าง (dead code เก่า → mention ไม่ลบ)
   - ทุก line ที่เปลี่ยนต้อง trace กลับหา request ได้

4. **Goal-Driven Execution** — ทุก step มี verify criteria
   - "แก้บั๊ก" → reproduce ก่อน → แก้ → ยืนยันว่าไม่เกิดแล้ว
   - "เพิ่ม feature" → lint ผ่าน + build ผ่าน + แสดงใน browser

ใช้ `/karpathy-checklist` เมื่อต้องการ quick-reference ทั้ง 4 ข้อพร้อม project-specific traps

---

1. **อ่าน CLAUDE.md ก่อนเสมอ** — และ point ไปยัง doc ที่เกี่ยวข้อง
2. **อ่านไฟล์ที่จะแก้ก่อน** — ห้าม assume โครงสร้าง
3. **เช็ค skill** — ถ้างานตรงกับ skill ให้ใช้แทนเขียนใหม่
4. **แก้เฉพาะที่ถาม** — ไม่ refactor รอบข้าง ไม่เพิ่ม feature ที่ไม่ได้ขอ
5. **ตรวจ db.js** — เพิ่ม/แก้ field ใดๆ ต้องอัพเดต `src/lib/db.js`
6. **Thai text** — UI ทั้งหมดเป็นภาษาไทย (ยกเว้น field/code/technical term)
7. **อัพเดตเอกสารอัตโนมัติ** — หลังเสร็จงาน ถ้าเอกสารยังไม่ครอบคลุม ให้สรุปเพิ่มในไฟล์ที่เหมาะสม (CLAUDE.md หรือ docs/)

### Verify ก่อนสรุป (CRITICAL)

**กฎเหล็ก: อย่าเชื่อสมมติฐานแรก — ตรวจสอบทุกครั้งก่อนสรุป/แก้โค้ด**

- **ก่อนแก้บั๊ก**: ต้อง reproduce ปัญหาได้ก่อน — อ่านโค้ดจริง (Read tool) ไม่ใช่เดาจากชื่อไฟล์/ฟังก์ชัน
- **ก่อนรายงานว่าเสร็จ**: ต้อง verify ว่าการแก้ทำงานจริง — รัน `npm run lint` หรือ `npm run build` เป็นอย่างน้อย
- **ก่อนอ้างว่าฟีเจอร์ใช้ได้**: ถ้าเป็น UI → ต้องทดสอบใน browser; ถ้าทดสอบไม่ได้ → บอกชัดเจนว่ายังไม่ได้ทดสอบ
- **ก่อนเชื่อ memory/CLAUDE.md**: ถ้า memory ระบุว่ามี function/file ใด → grep หรือ Read ยืนยันว่ายังมีอยู่จริง
- **เจอข้อมูลขัดแย้ง** (memory vs โค้ดจริง) → เชื่อโค้ดจริง แล้วอัพเดต memory/CLAUDE.md
- **อย่าสรุปจากข้อมูลแค่ส่วนเดียว** — ถ้า query Supabase ได้ ≤ 1000 rows ต้องใช้ `fetchAllRows` ก่อนสรุป

### Commit & PR Convention

**Commit message** (ภาษาไทยได้ — ตามสไตล์ repo เดิม):
- `แก้บั๊ก: <สรุปสั้น>` — bug fix
- `เพิ่ม: <feature>` — new feature
- `ปรับ: <สิ่งที่ปรับ>` — enhancement / UI tweak
- `refactor: <ส่วนที่จัด>` — refactor ไม่เปลี่ยนพฤติกรรม
- `docs: <ไฟล์/หัวข้อ>` — เอกสาร (เช่น `docs: อัพเดต CLAUDE.md`)
- เน้น **"ทำไม"** มากกว่า "ทำอะไร" (diff บอก what อยู่แล้ว)
- 1 commit = 1 logical change

**ก่อน commit ทุกครั้ง**:
1. lint **เฉพาะไฟล์ที่คุณแก้** ผ่าน (`npx eslint <ไฟล์>`) — ⚠️ `npm run lint` ทั้ง repo **ไม่ใช่ 0**: มี error ค้างเดิม **41 ตัว (56 problems รวม warning ณ 2026-09-23)** ในไฟล์ committed (ReceiveLog/Requisition/Dispense/Return/Analytics + tests — set-state-in-effect, empty block, `use()` ใน try/catch, `process` undefined ใน test) ที่ไม่เกี่ยวกับงานคุณ — ห้ามไป "แก้" error เหล่านั้นเว้นแต่ถูกขอ และอย่าตกใจว่าตัวเองทำพัง. **เทียบ baseline ก่อนโทษตัวเอง**: `git stash && npx eslint <ไฟล์> ; git stash pop` แล้วนับ error ก่อน/หลัง — ถ้าจำนวนเท่าเดิม = ไม่ได้ทำพัง
2. ตรวจ `git diff` — ไม่มีไฟล์/secret ที่ไม่ตั้งใจ commit (`.env`, `test-results/`, `supabase/.temp/`)
3. ห้าม `--no-verify` หรือ skip pre-commit hook

**PR convention**:
- title สั้น (< 70 ตัวอักษร)
- body: Summary (1-3 bullet) + Test plan (checklist)
- ไฟล์ migration SQL (`*.sql`) ต้องระบุในใน PR ว่าต้องรันใน Supabase Dashboard ก่อน deploy

**ไม่ทำเอง — ต้องรอ user สั่ง**: `git commit`, `git push`, `gh pr create`, `git reset --hard`, `git push --force`

### เมื่อเพิ่มฟีเจอร์ใหม่
- กระทบ 2+ ไฟล์ → `/plan` ก่อน
- column ใหม่ใน DB → `/add-db-column`
- column ใหม่จาก CSV เท่านั้น → `/add-csv-column`
- print view ใหม่ → `/new-print`
- search bar ใหม่ → `/drug-search-bar`
- ก่อน deploy → `/pipeline`

### เมื่อแก้บั๊ก
- อ่าน error message ก่อน — ระบุสาเหตุก่อน switch approach
- ถ้า supabase return null → เช็ค `.env` และ RLS policy ก่อน
- ถ้า CSV import ผิด → เช็ค `_matchHeader()` และ `getVal()` ใน `db.js`

### กฎอัพเดตเอกสาร
- เพิ่มฟังก์ชันใน `db.js` → บันทึก signature + พฤติกรรมสำคัญ (เช่น DELETE-then-INSERT, backfill)
- เปลี่ยน filter/sort logic → อัพเดต rule เดิม ไม่ duplicate
- เพิ่ม DB schema หรือ SQL → บันทึกใน `docs/schema.md`
- แก้ bug ที่มี root cause ซับซ้อน → บันทึก "Do Not" rule (ไม่ต้องเขียน postmortem)
- รายละเอียดเฉพาะ feature → เพิ่มใน `docs/features/{feature}.md`
- domain term ใหม่/นิยามที่ขัดแย้ง → `CONTEXT.md` (glossary เท่านั้น ไม่ใส่ implementation)
- decision ที่กลับยาก → `docs/adr/` (เกณฑ์ + format ดู `/grill-with-docs`)

### Skills vs Subagents

| สถานการณ์ | ใช้อะไร |
|-----------|--------|
| มี pattern ซ้ำ (print, search bar, excel, chart) | **Skill** |
| ค้นหา/สำรวจ codebase กว้าง ไม่รู้ path | **Subagent Explore** |
| งาน 2 อย่างที่ไม่ depend กัน | **Parallel tool calls** ใน message เดียว |
| รู้ path ชัดเจน | **Read/Edit/Grep โดยตรง** |
| อยากได้ reviewer ที่ไม่มีอคติ | **Subagent** — ตื่นมาไม่เห็นบริบทที่คุยกันมา จึงวิจารณ์ตรง |
| กำลังจะเทผลกองใหญ่ที่ไม่ได้อ่านซ้ำลงแชท | **Subagent** — ไม่เปื้อน context หลัก ⚠️ แต่ token **รวมแพงกว่า 7-10 เท่า** (ตื่นมาพร้อม context เต็มของตัวเอง) คุ้มเมื่อให้มันใช้โมเดลถูกกว่า |

**เกณฑ์ตัดสินประโยคเดียว**: "กำลังจะเทกองข้อมูลที่ไม่มีวันอ่านซ้ำลงแชทไหม" — ใช่ → delegate

**ไม่ต้องใช้ subagent เมื่อ** (ฝืนใช้แล้วผลแย่ลง):
- แก้เล็กจุดเดียว / รู้คำตอบอยู่แล้ว
- ขั้นตอนพึ่งกันเป็นลำดับ (1→2→3→4) — แยกกันทำไม่ได้
- ต้องใช้บริบททั้งบทสนทนา
- ต้องถามกลับ user ระหว่างทาง — **คุยกับ subagent ไม่ได้** main session เป็น orchestrator ทางเดียว
- ต้องให้ agent คุยกันเอง → นั่นคือ agent team คนละกลไก (แพงกว่า)

### Parallelization
- ✓ Read หลายไฟล์ในคำสั่งเดียว
- ✓ Grep + Glob พร้อมกัน
- ✗ อย่า Edit ไฟล์ก่อน Read ไฟล์นั้น
- ✗ อย่า build ก่อน lint ผ่าน

## Technical References

- **DB layer**: `src/lib/db.js` — query/insert/delete ทุกตัวอยู่ที่นี่เท่านั้น
- **Supabase client**: `src/lib/supabase.js` — อย่า import ตรงใน component
- **Icon**: `lucide-react` — ห้ามใช้ emoji ใน UI, ห้าม icon library อื่น
- **Date format**: DB = ISO `YYYY-MM-DD`, UI = `DD/MM/YYYY` (พ.ศ. +543)
- **Thai font in print**: Sarabun ผ่าน Google Fonts (ใน print popup เท่านั้น)
- **Env vars**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` ต้องมาจาก `.env`
- **Tailwind**: 3.x — เลี่ยง arbitrary values (`w-[123px]`) ถ้าทำได้
- **React**: 19.x — functional components + hooks เท่านั้น

### Key shared functions

**ย้ายไป [src/CLAUDE.md](src/CLAUDE.md) §Key shared functions** — `fetchDashboardAlerts` · บัตรยา/ค้นหา · `fetchDashboardCharts` · `printApBatch` · `printTrackingList` · `resolveAuditUserName` · `resolveDispenseDepartment` · `fetchInventoryLocations` · `importDrugLoans` · `billMatchesQuery` · `matchReceiveDetails` + AP Workflow stages + Picking workflow actions

## Critical Rules (ต้องอ่าน)

**ตัวเต็มย้ายไป [src/CLAUDE.md](src/CLAUDE.md) §Critical Rules — ไม่โหลดเอง ต้อง Read ก่อนแก้โค้ด (ดู §Architecture)** — เลขกฎเดิม (โค้ด/เอกสารอ้าง "CLAUDE.md rule #N") · ดัชนี:

- #1 Audit Log Auth
- #2 Supabase 1000-row limit
- #3 Date Input
- #4 Print view
- #5 Mobile layout
- #6 Stat consistency
- #7 Department list 2 ระบบ
- #8 ReceiveLog scan
- #9 Debugging data issues
- #10 Edge Function email UTF-8
- #11 drug_swap_policy เป็น merged column
- #12 Notification & AuditLog sync
- #13 Reorder single source of truth
- #22 Import master CSV "วิเคราะห์สั่งซื้อ" = header detect + strip emoji
- #14 Date input อ่าน [docs/patterns.md](docs/patterns.md) ก่อนเสมอ
- #15 Summary chart lookup ต้องใช้ map เต็ม ไม่ใช่ sliced top-N
- #16 NON_DEPARTMENTS ใน DispenseLogApp
- #17 AP Workflow search ค้นชื่อยาได้
- #18 dataRange state ใน summary modal
- #19 AP bill identity = composite key ไม่ใช่ bill_number
- #20 ยืนยันตรวจรับ = บังคับ checklist + รูป
- #21 บิลสแกน AI ต้อง map drug_code ผ่าน `drug_name_alias`
- #22 Stock Ledger identity = cost-layer key, ปิดงวด freeze
- #23 Permission = role baseline + per-user grant (key ต้องตรง 3 ที่)

## Do Not (Hard Rules)

- **🛑 อย่าพิมพ์ tool call เป็นข้อความ (กันหยุดกลางคัน)** — ทุกครั้งที่จะเรียก tool **ต้องเป็น proper tool invocation ผ่านระบบจริง** ห้าม emit `<invoke …>` / `<parameter …>` เป็น text ใน response เด็ดขาด เพราะมันจะกลายเป็นข้อความธรรมดา → turn จบโดย tool ไม่ทำงาน → "หยุดเอง". **เตือนตัวเองทุก turn:** (1) ก่อนปิด turn ถ้ายังมีงานค้าง ต้องมี tool call จริง ไม่ใช่ text ที่หน้าตาเหมือน tool call; (2) หลังเรียก tool ต้อง **เห็น tool result กลับมาก่อน** จึงเขียนข้อความสรุป — ถ้าไม่เห็น result แปลว่า call ไม่ได้ส่ง ให้เรียกใหม่ทันที **ห้ามจบ turn**. กับดักนี้มักเกิดหลัง `ToolSearch` โหลด schema ใหม่ (เช่น MCP) — ระวังเป็นพิเศษ
- **อย่าเรียก `supabase` โดยตรงในไฟล์ component** — ต้องผ่าน `src/lib/db.js` เสมอ
- **อย่าลืมเปิด realtime replication เมื่อ subscribe ตารางใหม่** — `supabase.channel().on('postgres_changes', {table})` จะได้ event **ก็ต่อเมื่อ**ตารางนั้นอยู่ใน publication `supabase_realtime`. ถ้าลืม → subscription เงียบ ไม่ error, count/badge/กระดิ่งค้าง (เหตุการณ์ 2026-07-11: publication ว่างเปล่า → badge ค้าง). เปิดด้วย `ALTER PUBLICATION supabase_realtime ADD TABLE public.<t>` (ดู `enable_realtime_migration.sql`). ปัจจุบันเปิดแล้ว: requisitions/requisition_items/return_logs/audit_logs/inventory. **ปุ่ม "โหลดหน้านี้ใหม่" (refreshPage) bump ทั้ง subKey + badgeTick** — badge จึง refetch แม้ realtime พลาด
- **อย่าสร้างไฟล์ `.css` แยก** — Tailwind utility เท่านั้น
- **อย่า hardcode ค่าใดๆ ที่ควรมาจาก `.env`** — โดยเฉพาะ API key และ URL
- **อย่าเพิ่มฟีเจอร์ที่ไม่ได้ถูกขอ** — แก้เฉพาะที่ถาม ไม่ refactor รอบข้าง
- **อย่าใช้ mock/hardcode data ใน component** — ถ้าไม่มี supabase ให้ return null หรือ empty state
- **อย่าใช้ emoji ใน UI** — ใช้ `lucide-react` เท่านั้น
- **อย่าเปลี่ยน UI text เป็นภาษาอังกฤษ** — ทุก label, placeholder, alert ต้องเป็นภาษาไทย
- **อย่าเพิ่ม comment อธิบายโค้ดที่ self-evident** — เพิ่ม comment เฉพาะ logic ซับซ้อน
- **อย่า push หรือ commit โดยไม่ได้รับคำสั่ง** — ถามก่อนเสมอ
- **อย่าให้โมดอลส้ม (ใกล้หมดอายุ) ใช้แค่ `nearExpiryItems`** — ต้องใช้ `[...expiredItems, ...nearExpiryItems]` เสมอ เพราะ `expiredItems` และ `nearExpiryItems` เป็น mutually exclusive set (item ที่หมดอายุแล้วถูก filter ออกไปก่อนถึง near-expiry bucket) ถ้าใช้แค่ `nearExpiryItems` tab "หมดอายุแล้ว" ในโมดอลจะแสดง 0 เสมอ ทั้งที่ระบบมียาหมดอายุอยู่ ดู `getModalConfig()` ใน [App.jsx](src/App.jsx)
- **อย่า slice top-N ก่อน lookup ค่าในกราฟ**: ถ้ากราฟแสดงรายการจาก union ของ 2 ranking ให้ใช้ full map (ทุก key) สำหรับ lookup — sliced top-N จะ return `undefined` สำหรับรายการที่ไม่ติดอันดับ → chart แสดง 0 ผิด
- **อย่าตัด "เบิกเพิ่มจากความผิดพลาด" / "คืนยา" ออกจากตารางเบิก** — ค่าเหล่านี้ยังต้องแสดงในตาราง เพราะเป็น record จริงที่ต้องตรวจสอบได้ ตัดออกเฉพาะจาก dropdown หน่วยงาน + กราฟ aggregate เท่านั้น
- **อย่าลบ returnDate state ทิ้งทั้งหมด**: `returnDate` ใน [ReceiveLogApp.jsx](src/ReceiveLogApp.jsx) ยังใช้ใน `markBillsInspected()` (เป็น `inspected_at` timestamp) — ลบได้เฉพาะ setter/prop ที่ไม่มี consumer แต่ state ต้องคงไว้
- **อย่า match header CSV ด้วย `includes()` คำสั้นๆ เมื่อไฟล์มีหลายคอลัมน์ชื่อคล้ายกัน**: ไฟล์ master (45 คอล) มี "คงเหลือ" หลายคอลัมน์ (`คงเหลือ พ.ค.`, `คงเหลือหลังจ่าย`, `มูลค่าคงเหลือ`) — `findIndex(h => h.includes('คงเหลือ'))` จับคอลัมน์แรกซึ่งผิด. ต้อง match ชื่อเจาะจงก่อนแล้วค่อย fallback + exclude คำที่รู้ว่าคนละความหมาย (เช่น `มูลค่า`) — ดู `qtyIdx` ใน [App.jsx](src/App.jsx) (แก้ 2026-07-04)
- **อย่าใช้ `text-white` / `bg-white/xx` กับ children ของ `PageHeader` ใน [RequisitionApp.jsx](src/RequisitionApp.jsx)**: `PageHeader` ([L280](src/RequisitionApp.jsx)) เป็น **`bg-white`** (title bar ขาว) — ปุ่ม/ไอคอน `text-white` จะ **ล่องหน (ขาวบนขาว)**. ใช้ `bg-[#1E90FF] text-white` (ปุ่มฟ้า) หรือ `text-slate-*` แทน. **สับสนกับ top bar สีฟ้าของ [AppShell.jsx](src/AppShell.jsx)** ที่ `text-white` เหมาะ — copy สไตล์ข้ามกันไม่ได้ (เหตุการณ์ 2026-07-14: ปุ่ม "สร้างใบเบิกแทนหน่วยงาน" มองไม่เห็นเพราะ copy สไตล์จาก blue top-bar มาใส่ header ขาว)
- **UI "แก้แล้วไม่เห็นผล" → สงสัย stale dev server ก่อนสงสัยโค้ด**: background dev server ตายข้าม session หรือมีหลาย Vite ต่างพอร์ต (5173/5174) → browser เสิร์ฟ bundle เก่า. **verify ที่ server จริงก่อนแก้โค้ด**: `Invoke-WebRequest http://localhost:5173/src/<file>.jsx` แล้ว grep **ASCII marker** (ชื่อ class/prop ไม่ใช่ข้อความไทย — `Invoke-WebRequest` mangle UTF-8 → false negative). ถ้า server มี code ใหม่แต่ browser ไม่เห็น = cache: kill process ตามพอร์ต (`Get-NetTCPConnection -LocalPort 5173`) + restart + DevTools "Empty Cache and Hard Reload" (เหตุการณ์ 2026-07-14)
- **อย่า dedupe/ทับแถว `inventory` ด้วย business key — ตารางมีแถวซ้ำ `code+lot` เดียวกันหลายแถวจริง** (CSV import แยกแถว เช่น Baclofen lot 260301 = 2 แถว 3+30 กล่อง): จุดอ่านคงเหลือทุกจุดต้อง**บวกรวม** (ดู `mergeSameLotEntries` ใน [RequisitionApp.jsx](src/RequisitionApp.jsx)) — dedupe ด้วย `code|name|lot` หรือ assign map ทับ (`lotOnHand[lot] = ...`) จะกลืนของจริงหาย (เหตุการณ์ 2026-07-18: คงเหลือโชว์ 600 จากจริง 6,600 + snapshot `onhand` ใน picked_allocation ผิดถาวร → ใบ lot คุม/Excel เพี้ยน). dedupe ผลจาก 2 query ให้ key ด้วย **row id** เท่านั้น
- **ยาออกจากบัญชี (มติ PTC) ต้องตั้งธง 2 ที่ — ที่เดียวไม่พอ**: (1) **Master คอลัมน์ A "ผลการพิจารณา"** `คงไว้`→`ตัดออก` ทุกแถวของรหัส = ที่**แอป**อ่าน (`masterSheet.js` → `inventory.receive_status` = `<C สถานะตรวจรับ>|<A>` → `RequisitionApp`/`App.jsx` เช็ค `includes('ตัดออก')`: หน้าเบิกติดหมายเหตุ "ยาตัดออกจากบัญชี" ไม่บล็อก · ภาพรวมสต็อก/การ์ด "รายการยาในคลัง" ไม่นับ) (2) **ชีทวิเคราะห์ AI** `✂️ ตัดออก` = คุมการคำนวณสั่งซื้อ/รายงานแจ้งซื้อ/`drug_reorder_config` · ตั้งแค่ AI แอปไม่รู้ว่าออกบัญชี (scrutinize 14/10/2569 — มติ PTC 9/10/69 10 รหัส ดู memory `ptc-formulary-2570`) · แล้ว `import:master` + `import:reorder`
- **อย่าเช็คสถานะ "รอตรวจรับ" ด้วย lot เดี่ยว — ต้อง key `code|lot`**: lot ซ้ำข้ามตัวยาได้ โดยเฉพาะ lot `-` ของเวชภัณฑ์ — บิลรอตรวจรับ lot `-` ใบเดียวเคยเหมา 26 รหัสเป็น "หมดสต็อก" ปลอม (เหตุการณ์ 2026-07-18, ดู `pendingLotSet` ใน [RequisitionApp.jsx](src/RequisitionApp.jsx))
- **อย่าแปลง scientific notation กับ `lot` — lot เป็น "รหัส" ไม่ใช่จำนวน**: lot จริงรูปแบบ `<ปี><เดือนเป็นตัวอักษร><ลำดับ>` (`26E266`, `26D172`, `26F116`) ซึ่ง regex `^[\d.]+[eE][+-]?\d+$` มองว่าเป็น 26×10²⁶⁶ → `parseFloat` ปัดด้วย float64 → `BigInt` ขยายเป็นเลข **269 หลัก** lot หายถาวร. ใช้ `normalizeLot()` ([masterSheet.js](src/lib/masterSheet.js) — ย้ายจาก App.jsx ตอนถอดปุ่ม CSV 2026-09-28) ที่เก็บตามที่พิมพ์มา — **`normalizeNumericText()` ใช้ได้เฉพาะ `invoice`/`qtyReceived`** (เลขที่บิลแบบ `1.12512E+11` ต้องขยายจริง). เสียเฉพาะ lot ที่มีตัว **E** (D/F รอด เพราะไม่ใช่สัญลักษณ์ exponent). **CSV ต้นทางไม่ได้พัง — โค้ด import เป็นคนทำพัง** (เหตุการณ์ 2026-07-29: เสีย 6 แถว, กู้จาก `receive_logs` ด้วย `code+invoice+exp`, backup `_bak_inventory_lot_20260731`; แก้ 2026-08-01)
