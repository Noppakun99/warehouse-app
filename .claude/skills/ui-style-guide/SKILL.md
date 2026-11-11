---
name: ui-style-guide
description: "Tailwind style guide for warehouse-app: colors, layout principles (grouping, priority, truncation, overflow), buttons, inputs, motion, and the before-you-finish screen review. Read before building any new UI."
---

# Skill: ui-style-guide

คู่มือ Tailwind pattern สำหรับ warehouse-app — ใช้เป็น reference ทุกครั้งที่สร้าง UI ใหม่
เพื่อให้โทนสีและ component style สม่ำเสมอทั่วทั้ง app

---

## Color Palette

### Primary CTA (ปุ่มหลัก / login)
```
bg-gradient-to-r from-sky-500 to-blue-600
hover:from-sky-600 hover:to-blue-700
```

### ระบบ → สี (ใช้ตาม context ของแต่ละ sub-app)
| ระบบ | bg card | border | icon bg | accent text |
|------|---------|--------|---------|-------------|
| แผนผัง (inventory) | `bg-indigo-50 hover:bg-indigo-100` | `border-indigo-300` | `bg-sky-500` | `text-sky-600` |
| เบิกยา (requisition) | `bg-blue-50 hover:bg-blue-100` | `border-blue-300` | `bg-blue-600` | `text-blue-600` |
| รับยา (receive) | `bg-emerald-50 hover:bg-emerald-100` | `border-emerald-300` | `bg-emerald-600` | `text-emerald-600` |
| เบิกจ่าย (dispense) | `bg-rose-50 hover:bg-rose-100` | `border-rose-300` | `bg-rose-600` | `text-rose-600` |
| คืนยา (return) | `bg-violet-50 hover:bg-violet-100` | `border-violet-300` | `bg-violet-600` | `text-violet-600` |
| audit log | `bg-amber-50 hover:bg-amber-100` | `border-amber-300` | `bg-amber-600` | `text-amber-600` |
| วิเคราะห์ (analytics) | `bg-purple-50 hover:bg-purple-100` | `border-purple-300` | `bg-purple-600` | `text-purple-600` |

### Semantic Colors (สถานะ)
| สถานะ | bg | border | text |
|-------|-----|--------|------|
| success | `bg-emerald-50` | `border-emerald-200` | `text-emerald-700` |
| warning | `bg-orange-50` | `border-orange-200` | `text-orange-700` |
| error / danger | `bg-red-50` | `border-red-200` | `text-red-600` |
| info | `bg-blue-50` | `border-blue-200` | `text-blue-700` |
| neutral | `bg-slate-50` | `border-slate-200` | `text-slate-600` |

---

## Layout

### หน้า sub-app ทั้งหมด
```jsx
<div className="min-h-screen bg-slate-50">
  {/* Header bar */}
  <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
    <button onClick={onBack} className="flex items-center gap-2 text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors">
      <ArrowLeft size={16}/> กลับ
    </button>
    <h1 className="text-lg font-bold text-slate-800">ชื่อระบบ</h1>
  </div>

  {/* Content */}
  <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
    {/* content */}
  </div>
</div>
```

### Card (กรอบข้อมูล)
```jsx
<div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
  {/* content */}
</div>
```

### Inner section (กล่องย่อยใน card)
```jsx
<div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
  {/* content */}
</div>
```

### Detail card (รายการยา/ผลค้นหา — ไอคอน + หัวข้อ + กล่องข้อมูลย่อย)

card ที่แสดงรายละเอียด 1 รายการ (drug detail ในแผนผัง, ผลค้นหา) — มุมโค้งใหญ่ + เงานุ่ม hover + ข้อมูลจัดเป็น **กล่องย่อย label-บน/value-ล่าง** (สไตล์ dashboard เช่น Heart Rate/Energy card)

```jsx
<div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 hover:shadow-md hover:border-indigo-300 transition">
  {/* หัว: ไอคอนในกล่องสีธีม + ชื่อ + badge สถานะ (pill) */}
  <div className="flex items-start gap-4">
    <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600 shrink-0"><Pill size={28} /></div>
    <div className="w-full">
      <h4 className="font-bold text-slate-800 text-lg leading-tight mb-2">ชื่อรายการ</h4>
      {/* กล่องข้อมูลย่อย: grid, label uppercase เล็ก + value เด่น */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-100">
          <div className="text-[11px] text-slate-500 uppercase font-bold tracking-wider mb-1">คงเหลือ</div>
          <div className="text-sm font-black text-slate-700 tabular-nums">10</div>
        </div>
        {/* กล่องที่ต้องเน้น → เปลี่ยนสี bg/border/text เป็น theme (indigo/emerald/amber) */}
      </div>
    </div>
  </div>
</div>
```

**หลักการ:** card `rounded-2xl` + `hover:shadow-md transition` · ไอคอนหัวใน chip สีธีม · กล่องย่อย `rounded-xl` (ไม่ใช่ `-lg`) label `text-[11px] uppercase tracking-wider` value เด่น · กล่องที่มีความหมายพิเศษ (exp ใกล้หมด/บิล) เปลี่ยนสีทั้งกล่อง

### Stat card (สรุปตัวเลข 3 ใบ — gradient + เงามีสี + hero glow)

แถบ stat 3 ใบเหนือตาราง (นับ / ปริมาณ / มูลค่า) — **สีทึบ gradient** + **เงามีสีตามการ์ด** (ลอยเด่นสไตล์ dashboard). **ใบที่เป็น theme ของหน้า** (รับ=emerald, เบิก=rose) ทำเป็น hero มี glow มุมบน; อีก 2 ใบคงสีแยกความหมาย (นับ=slate, มูลค่าเงิน=amber)

```jsx
<div className="grid grid-cols-3 gap-3">
  {/* ใบทั่วไป: gradient + เงาสีตามการ์ด */}
  <div className="bg-gradient-to-br from-slate-600 to-slate-800 rounded-2xl p-3.5 text-center shadow-lg shadow-slate-300/50">
    <p className="text-2xl font-bold text-white tabular-nums">2,440</p>
    <p className="text-xs text-slate-300 mt-0.5">จำนวนรายการ</p>
  </div>

  {/* ใบ hero (สีธีมหน้า): + glow มุมบน — ต้อง relative overflow-hidden แล้ววาง <span> radial */}
  <div className="relative overflow-hidden bg-gradient-to-br from-emerald-400 to-emerald-700 rounded-2xl p-3.5 text-center shadow-lg shadow-emerald-300/60">
    <span className="pointer-events-none absolute -left-5 -top-8 w-28 h-28 rounded-full bg-white/25 blur-xl" />
    <p className="relative text-2xl font-bold text-white tabular-nums">792,085</p>
    <p className="relative text-xs text-emerald-50 mt-0.5">ปริมาณรับรวม</p>
  </div>

  {/* มูลค่าเงิน = amber เสมอ */}
  <div className="bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl p-3.5 text-center shadow-lg shadow-amber-200/60">
    <p className="text-2xl font-bold text-white tabular-nums">32,372,250</p>
    <p className="text-xs text-amber-50 mt-0.5">มูลค่ารวม (บาท)</p>
  </div>
</div>
```

**หลักการ:** `bg-gradient-to-br from-{c}-400/500 to-{c}-700/800` + `shadow-lg shadow-{c}-300/60` (เงาสีตามการ์ด ไม่ใช่ `shadow-sm` เทา) · `rounded-2xl` · ตัวเลข `tabular-nums` · glow = `<span>` radial `bg-white/25 blur-xl` (ต้อง `relative overflow-hidden` บน card + `relative` บนข้อความ ไม่งั้น glow ทับตัวเลข) · **คงสีแยกความหมาย** — glow ใส่เฉพาะใบ theme หน้า อย่าให้ทุกใบสีเดียวกัน (scan ยาก)

---

## หลักจัดวาง (Layout principles)

> **ใช้กับ UI เดิมด้วย ไม่ใช่แค่ UI ใหม่** (user สั่ง 10/11/2569) — แก้ไฟล์ UI เดิมเมื่อไร ให้แก้จุดที่ผิดกฎในส่วนที่แตะไปด้วย และรีวิวจอตาม §ก่อนส่งงาน
>
> ที่มา: ชุดสกิล better-layout (Jakub Krehel) · design-eng (Emil Kowalski) · critique-information-density (designer-skills) จากคลิป AI LABS "Claude Design Skills" — ศึกษาผ่าน Playwright 10/11/2569 · คัดเฉพาะข้อที่ใช้กับแอปข้อมูล ไม่เอาเทคนิค landing page/scroll storytelling/spring/RTL/dark mode

### 1. จัดกลุ่มด้วยระยะห่าง ก่อนใช้เส้น

ลำดับเครื่องมือ: **ช่องว่าง** (ค่าเริ่มต้น) → **พื้นหลัง/กล่อง** (เมื่อกลุ่มต้องอ่านเป็นก้อนเดียว เช่น การ์ด lot ที่กดได้) → **เส้นแบ่ง** (เฉพาะข้อมูลหนาแน่น เช่น ตาราง)

- **ช่องระหว่างกลุ่ม ≥ 2 เท่าของช่องในกลุ่ม** — ในกลุ่ม `space-y-2`/`gap-2` → ระหว่างกลุ่ม `space-y-4` ขึ้นไป
- ระยะเท่ากันทุกบรรทัดแล้วเติมเส้นชดเชย = ผิด · เส้นที่จำเป็นใช้เส้นจาง (`border-slate-100`) และไม่ใส่คู่กับช่องกว้างที่แบ่งกลุ่มอยู่แล้ว

```jsx
<div className="space-y-4">            {/* ระหว่างกลุ่ม */}
  <div className="space-y-2">…lot 1…</div>  {/* ในกลุ่ม */}
  <div className="space-y-2">…lot 2…</div>
</div>
```

### 2. ข้อมูลที่ผู้ใช้มาหา อยู่บนสุด

ถามก่อนวาง: "คนเปิดหน้านี้มาหาคำตอบอะไร" → คำตอบนั้นขึ้นบรรทัดแรก ตัวใหญ่/สีเด่น · metadata (บิล บริษัท วันที่รับ) ตามหลังตัวเล็กสีจาง หรือพับเก็บ/ไปหน้ารายละเอียด

```jsx
{/* ดี: สถานะ + สิ่งที่ต้องทำ มาก่อน */}
<div>
  <span className="… bg-emerald-50 text-emerald-700">คืนได้แล้ว</span>
  <p className="text-sm font-semibold text-slate-800 mt-1">ทำใบส่งคืนบริษัท (VX)</p>
  <p className="text-xs text-slate-500 mt-1">บิล 6612345 · องค์การเภสัชกรรม · รับ 03/05/2569</p>
</div>
{/* ผิด: บิล/บริษัท/วันที่ 3 บรรทัดก่อน แล้วสถานะอยู่ล่างสุด */}
```

- ตารางที่มี 10+ คอลัมน์แต่ใช้งานจริง 3 คอลัมน์ → ย้ายที่เหลือไปแถวกาง/โมดอล
- ส่วนที่ซ่อน (พับ/เลื่อนพ้นจอ) ต้องมีสัญญาณให้เห็น — ปุ่มกาง `ChevronDown` + จำนวน เช่น "ดูอีก 4 lot"

### 3. ป้ายต้องไม่หน้าเหมือนปุ่ม · ปุ่มต้องแยกจากข้อความ

- **ป้าย/badge (กดไม่ได้)** = `rounded-full` พื้นอ่อน ไม่มีเงา ไม่มี hover ไม่มี `cursor-pointer`
- **ปุ่ม (กดได้)** = มีพื้นทึบหรือขอบชัด + hover + `cursor-pointer` (ดู §Buttons)
- ป้ายที่หน้าเหมือนปุ่ม → คนกดแล้วไม่เกิดอะไร · ลิงก์/ปุ่มที่หน้าเหมือนข้อความรอบข้าง → คนไม่รู้ว่ากดได้ ต้องมี `underline underline-offset-2` หรือพื้น

### 4. ข้อความที่ถูกตัด ต้องมีทางดูเต็ม

`truncate`/`line-clamp-*` กับค่าที่ผู้ใช้ต้องอ่าน (ชื่อยา ชื่อบริษัท หมายเหตุ) ต้องมีทางไปดูเต็มอย่างน้อย 1 ทาง: `title={ชื่อเต็ม}` · กดแล้วกาง/เปิดโมดอลรายละเอียด · หรือปล่อยตัดบรรทัด (`break-words`) แทนการตัดทิ้ง

```jsx
<p className="truncate font-semibold text-slate-800" title={drug.name}>{drug.name}</p>
```

ตัดทิ้งโดยไม่มีทางดูเต็ม = ปัญหาร้ายแรง (ดู §ก่อนส่งงาน)

### 5. กันล้นจอ (375px)

| เจอแบบนี้ | แก้เป็น | เพราะ |
|---|---|---|
| ลูก flex ที่มีข้อความยาว/ตาราง ดันจนล้น | ใส่ `min-w-0` (+ `flex-1`) ที่ลูก flex | ลูก flex มี min-width = เนื้อหา จึงไม่ยอมหด |
| grid คอลัมน์ `1fr` ล้นเพราะเนื้อหายาว | `grid-cols-[minmax(0,1fr)_auto]` หรือ `min-w-0` ที่ลูก | `1fr` = `minmax(auto,1fr)` หดไม่ลงต่ำกว่าเนื้อหา |
| `h-*` ตายตัวบนกล่องที่มีข้อความ | `min-h-*` หรือ `max-h-* overflow-y-auto` | ข้อความไทยยาว/ขึ้นบรรทัดใหม่แล้วทะลุกล่อง |
| `w-screen` | `w-full` | `100vw` รวม scrollbar → เลื่อนแนวนอนบนคอม |
| `h-screen` บนแผงเต็มจอมือถือ | `h-dvh` / `min-h-dvh` (Tailwind 3.4) | แถบเบราว์เซอร์/คีย์บอร์ดมือถือบังขอบล่าง |
| ปุ่มกระทำหลักอยู่ในที่ที่ zoom/เลื่อนแล้วโดนตัด | วางใน flow ปกติหรือแถบคงที่ | ห้ามให้ปุ่มสำคัญหายจากจอ |

แถวที่มีชื่อ + ป้าย + ปุ่ม ให้ `flex-wrap gap-2` ให้ขึ้นบรรทัดใหม่ได้ แทนการบีบ

### 6. Animation / transition

| ความถี่ที่เห็น | ทำอย่างไร |
|---|---|
| กดวันละหลายร้อยครั้ง (พิมพ์ค้น สลับแท็บ คีย์ลัด) | **ไม่ animate** |
| หลายสิบครั้ง/วัน (hover แถว เลื่อนรายการ) | เปลี่ยนสีอย่างเดียว `transition-colors` |
| เป็นครั้งคราว (โมดอล drawer toast) | animate ได้ ≤ 200–250ms |

- ระบุชนิดเสมอ: `transition-colors` / `transition-opacity` / `transition-shadow` / `transition` (ชุด default) — **ไม่ใช้ `transition-all`** ทั้ง UI ใหม่และ UI เดิม
- ความเร็ว: ปุ่ม/hover 150ms (default ของ Tailwind) · dropdown/popover `duration-200` · ไม่เกิน 300ms · เข้า/ออกใช้ `ease-out` **ห้าม `ease-in`** (เริ่มช้า รู้สึกหน่วง)
- ปรากฏตัวห้ามเริ่มจาก `scale-0` → เริ่ม `scale-95 opacity-0`
- ป้ายสถานะที่ต้องอ่าน (คืนได้/หมดอายุ) **ไม่ทำกะพริบ/`animate-pulse`** — ใช้สีแทน

### 7. รายการยาวหลายกลุ่ม: หัวข้อภาษาคน + พับได้ (user สั่ง 11/11/2569)

ที่มา: หน้านโยบายคืนบริษัท — เดิมกางทุกกลุ่ม + หัวกลุ่มเป็นข้อความดิบจากบิล (`เงื่อนไขเดียวกันทุกรายการ | … | 0 | …`) user บอก "ต้องเลื่อนลงกว่าจะเจอหัวข้อที่ต้องการ" และ "อยากให้หัวข้อเข้าใจง่าย"

- **หัวกลุ่ม = คำตอบภาษาคน** ที่บอกว่าต้องทำอะไร เช่น `เปลี่ยนคืนได้หลังหมดอายุแล้ว` · `เปลี่ยนคืนได้ตามเงื่อนไข — ต้องคืนก่อนหมดอายุ 6 เดือน` · `เปลี่ยนคืนไม่ได้ — ใช้ให้หมด หมดอายุแล้วรอทำลาย` · `อื่นๆ — … ต้องเช็กเอกสาร` · `ไม่มีข้อมูล…` — **ห้ามใช้ข้อความดิบจาก Excel/บิลเป็นหัวข้อ**
- **จัดกลุ่มตามความหมาย ไม่ใช่ตามตัวอักษร** — ข้อความเขียนต่างกันแต่ความหมายเดียวกัน = กล่องเดียว (อภ. 3 แบบ → 1 กล่อง) · แปลความหมายใน pure module (`policyCategory` ใน drugProfile.js) ไม่ใช่ใน component
- **ข้อความดิบเก็บไว้เป็นหลักฐาน** — ตัวเล็กสีจาง หัว "ข้อความในบิล (N แบบ)" อยู่ในส่วนที่กางแล้ว ไม่ใช่บนหัว
- **หลายกลุ่ม → เปิดมาย่อหมด** · กลุ่มเดียว → กางเลย ไม่มีปุ่มกาง/ย่อ · มีปุ่ม `กางทั้งหมด`/`ย่อทั้งหมด` + บรรทัด "N กลุ่ม · กดหัวข้อเพื่อดู"
- **หัวที่ย่ออยู่ต้องพอให้เลือกถูกกล่อง**: หัวข้อ + จำนวน + ป้ายเรื่องด่วน (เช่น `พ้นกำหนด N lot` สีแดง) + บรรทัด `ยา: ชื่อ · ชื่อ · …` (`truncate` + `title` รายชื่อเต็ม) · ซ่อนบรรทัดตัวอย่างเมื่อกางแล้ว
- หัวกลุ่มเป็น `<button aria-expanded aria-controls>` ทั้งแถบ + `ChevronDown` หมุนเมื่อกาง (ไม่ animate) · เปลี่ยนเรื่องที่ดู (บริษัท) แล้วรีเซ็ตเป็นย่อด้วย `key`
- **ลำดับกลุ่ม = เรื่องที่ต้องทำก่อนขึ้นก่อน** (มีรายการป้ายแดง/เหลือง/ส้ม) แล้วตามลำดับหมวดที่กำหนด — ไม่เรียงตามวันที่ที่ความหมายต่างกันในแต่ละหมวด (เช่น "วันเริ่มคืนได้" ≠ "เส้นตาย")

---

## Typography

```jsx
// Page / section title
<h2 className="text-base font-bold text-slate-800">ชื่อหัวข้อ</h2>

// Form field label
<label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
  ชื่อ field
</label>

// Body text
<p className="text-sm text-slate-700">ข้อความ</p>

// Caption / secondary
<p className="text-xs text-slate-500">ข้อความรอง</p>

// Stat number (ตัวเลข dashboard)
<p className="text-2xl font-bold text-slate-800">1,234</p>
```

---

## Buttons

### Primary (กระทำหลัก เช่น บันทึก / ส่ง)
```jsx
<button className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-xl py-2.5 px-5 font-semibold text-sm transition-colors shadow-sm disabled:opacity-50">
  บันทึก
</button>
```

### Secondary (ยกเลิก / กลับ)
```jsx
<button className="bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl py-2.5 px-5 font-medium text-sm transition-colors">
  ยกเลิก
</button>
```

### Action ขนาดเล็ก (ใน toolbar / filter bar)
```jsx
// Success / export
<button className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors">
  <FileDown size={15}/> Export
</button>

// Danger / ลบ
<button className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors">
  <Trash2 size={15}/> ลบ
</button>

// Tab active / inactive
<button className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white">
  แท็บที่เลือก
</button>
<button className="px-4 py-2 text-sm font-medium rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">
  แท็บอื่น
</button>
```

---

## Inputs

### Text input ทั่วไป
```jsx
<input
  type="text"
  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
  placeholder="พิมพ์..."
/>
```

### Search input (พร้อมไอคอน)
```jsx
<div className="relative">
  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
  <input
    type="text"
    className="w-full border border-slate-300 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
    placeholder="ค้นหา..."
  />
</div>
```

### Select
```jsx
<select className="border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
  <option value="">-- เลือก --</option>
</select>
```

---

## Badges / Chips

```jsx
// สีตาม semantic
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
  อนุมัติแล้ว
</span>

// รอดำเนินการ
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
  รอดำเนินการ
</span>

// ปฏิเสธ
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
  ปฏิเสธ
</span>
```

---

## Alerts / Inline messages

```jsx
// Error
<p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
  ข้อความ error
</p>

// Success banner (หลัง submit)
<div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-800 text-sm font-medium">
  <CheckCircle size={16} className="text-emerald-600"/>
  บันทึกสำเร็จ
</div>

// Warning
<div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-orange-800 text-sm">
  <AlertTriangle size={16} className="text-orange-500"/>
  คำเตือน
</div>
```

---

## Tables

```jsx
<div className="overflow-x-auto rounded-xl border border-slate-200">
  <table className="w-full text-sm">
    <thead className="bg-slate-50 border-b border-slate-200">
      <tr>
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          ชื่อคอลัมน์
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-100">
      <tr className="hover:bg-slate-50 transition-colors">
        <td className="px-4 py-3 text-slate-700">ข้อมูล</td>
      </tr>
    </tbody>
  </table>
</div>
```

### History / data table (แถวคลิกดูรายละเอียด) — สไตล์ dashboard

ใช้กับตารางประวัติที่ user อ่านบ่อย (ประวัติเบิก/รับ/ตรวจนับ) — header จางเบา + เส้นแบ่งบางมาก + hover เด่นแทน + ตัวเลขจุดเด่นห่อ pill สีธีม (อ้างอิงตาราง Proposals สไตล์ SaaS dashboard)

```jsx
<div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
  <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-260px)]">
    <table className="w-full text-sm">
      {/* header: จาง + สูง + tracking-wider + พื้นโปร่ง */}
      <thead className="sticky top-0 z-[5]">
        <tr className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
          <th className="px-4 py-3.5 text-left bg-slate-50/80">วันที่</th>
          <th className="px-4 py-3.5 text-right bg-slate-50/80">จำนวน</th>
        </tr>
      </thead>
      <tbody>
        {/* row: เส้นแบ่งบางมาก (border-slate-50) + hover สีธีมเบา */}
        <tr className="border-b border-slate-50 cursor-pointer transition-colors hover:bg-emerald-50/50">
          <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">…</td>
          {/* ตัวเลขจุดเด่น = pill สีธีม + tabular-nums */}
          <td className="px-4 py-3 text-right whitespace-nowrap">
            <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 font-bold px-2.5 py-0.5 text-xs tabular-nums">+1,250</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

**หลักการ:**
- `text-slate-400 tracking-wider` + `py-3.5` — header จางและสูง อ่านง่ายไม่แย่งความสนใจ
- `border-slate-50` ระหว่างแถว (บางกว่า `-100`) — ให้ hover เป็นตัวแบ่งสายตาหลัก
- **คอลัมน์ตัวเลข = `text-right tabular-nums`** ทั้ง `<th>` และ `<td>` ให้หลักหน่วยตรงกัน (ข้อความ = `text-left`) · ในการ์ดมือถือ ตัวเลขชิดขวาของแถวเช่นกัน
- จุดเด่น (จำนวนเบิก/รับ, สถานะ) → **pill** `rounded-full bg-{theme}-50 text-{theme}-700` แทนตัวเลขลอย
- Lot/รหัส → chip `font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded` (desktop `rounded-md px-2`)
- แถวถูกปิดใช้งาน (เช่น lot ที่ไม่ได้ติ๊กนับ) → `bg-slate-50/60 opacity-60`

### Mobile card (แทนตารางที่ < 768px)

```jsx
<div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm active:bg-emerald-50 transition-colors">
  <div className="flex items-start justify-between gap-2">
    <div className="min-w-0 flex-1">
      <p className="font-semibold text-slate-900 text-sm truncate">ชื่อรายการ</p>
      <p className="text-xs text-slate-400 mt-0.5">รหัส · วันที่</p>
    </div>
    {/* จุดเด่น = pill เดียวกับตาราง desktop เพื่อความสม่ำเสมอ */}
    <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 font-bold px-2.5 py-0.5 text-xs tabular-nums">+1,250</span>
  </div>
</div>
```

### Badge สรุปสถานะบนหัว list (ให้เห็นก่อนกาง)

```jsx
{/* มีปัญหา → ส้ม + ไอคอน; ปกติ → เขียว */}
<span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[11px] font-semibold">
  <AlertTriangle size={11} /> ไม่ตรง 3 รายการ
</span>
<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px] font-semibold">
  ตรงทั้งหมด
</span>
```

> **หมายเหตุ:** ตาราง summary/analytics แบบ sticky-column (drug × month) ใช้ **header สีเข้ม** (`bg-slate-700`) โดยเจตนา — contrast จำเป็นสำหรับ frozen column ที่ข้อมูลหนาแน่น **อย่าเอาสไตล์ header จางข้างบนไปแทน** (ดู `/monthly-stats-table`, `/sticky-table`)

---

## Icons

- ใช้ `lucide-react` เท่านั้น — ห้ามใช้ emoji หรือ icon library อื่น
- ขนาดปกติ: `size={16}` สำหรับ inline, `size={20}` สำหรับ standalone
- สีตาม context: `className="text-slate-500"` หรือ `className="text-{color}-600"`

---

## ก่อนส่งงาน: รีวิวหน้าจอ (บังคับทุก UI ใหม่/แก้ UI)

ทำหลังเขียนเสร็จ ก่อนบอก user ว่าเสร็จ — เปิด dev server จริง ถ่ายจอ **คอม (1280px) + มือถือ 375px** แล้วตรวจ:

1. **ข้อมูลที่มาหาอยู่บนสุดไหม** (§หลักจัดวาง ข้อ 2) — ปิดตาแล้วเปิดดู 3 วินาที สายตาไปตกที่ไหนก่อน
2. **ล้น/ทับ/ตัดที่ 375px** — ไม่มีเลื่อนแนวนอนทั้งหน้า (ยกเว้นในกล่องตารางที่ตั้งใจ `overflow-x-auto`) · ข้อความที่ถูกตัดมีทางดูเต็ม
3. **ป้าย vs ปุ่ม** แยกกันออกไหม · หน้านี้มีปุ่มหลักปุ่มเดียวไหม
4. **ระยะห่าง** ช่องระหว่างกลุ่ม ≥ 2 เท่าช่องในกลุ่ม · ขอบซ้ายของแต่ละส่วนตรงกัน
5. **ตัวเลข** ชิดขวา + `tabular-nums`
6. **ข้อความยาวสุดจริง** — ทดสอบด้วยชื่อยา/บริษัทที่ยาวที่สุดใน DB ไม่ใช่ข้อมูลสั้นตัวอย่าง

**ระดับความรุนแรง:** `สูง` = เนื้อหา/ปุ่มถูกบัง ล้น ทับ หรือตัดโดยไม่มีทางดูเต็มที่ 375px · ส่วนที่ซ่อนไม่มีสัญญาณบอก → **ต้องแก้ก่อนส่ง** · `กลาง` = ลำดับความสำคัญ/การจัดกลุ่มผิด · `ต่ำ` = ระยะ/แนวตรงเล็กน้อย

**รูปแบบรายงาน** — ตารางเดียว 1 แถวต่อ 1 ต้นเหตุ (ห้ามเขียน ก่อน:/หลัง: แยกบรรทัด):

| ระดับ | ที่ | ก่อน | หลัง | เพราะ |
| --- | --- | --- | --- | --- |
| สูง | `CompanyPolicyApp.jsx:120` | `truncate` ชื่อยาไม่มี `title` | เพิ่ม `title={name}` | ชื่อยาถูกตัดที่ 375px ดูเต็มไม่ได้ |

ตรวจข้อไหนไม่ได้ (เช่น เปิด browser ไม่ได้) → เขียน `ยังไม่ได้ตรวจ` ห้ามเขียนว่าผ่าน · ต้องการมุมมองละเอียดกว่านี้ใช้สกิล `design:design-critique` / `design:accessibility-review`

---

## Do Not

- ห้ามใช้ arbitrary values เช่น `w-[123px]` ถ้าหลีกเลี่ยงได้
- ห้ามสร้างไฟล์ `.css` หรือใช้ `<style>` tag ใน component
- ห้ามใช้ `rounded-md` — ใช้ `rounded-xl` หรือ `rounded-2xl` เท่านั้น (ยกเว้น chip/pill เล็กใช้ `rounded-full`/`rounded-md` ได้)
- card ข้อมูลปกติใช้ `shadow-sm` — **ยกเว้น stat card / detail card** ที่ตั้งใจให้ลอยเด่น ใช้ `shadow-lg shadow-{สี}-300` (เงามีสี) ได้
- คอลัมน์ตัวเลขในตาราง **ต้องมี `text-right tabular-nums`** ให้เรียงตรงหลัก — อย่าปล่อยเลขลอยไม่จัดหลัก
- อย่าเอาสไตล์ history-table (header จาง) ไปใช้กับตาราง sticky-column analytics (ต้อง header เข้ม)
- ห้าม `transition-all` · ห้าม `ease-in` กับการเข้า/ออก · ห้าม animate สิ่งที่กดซ้ำทั้งวัน (§หลักจัดวาง ข้อ 6)
- ห้าม `truncate` ค่าที่ผู้ใช้ต้องอ่านโดยไม่มี `title`/ทางดูเต็ม
- ห้ามทำป้ายที่กดไม่ได้ให้มีเงา/hover/`cursor-pointer` เหมือนปุ่ม
- ห้ามใช้ข้อความดิบจาก Excel/บิลเป็นหัวกลุ่ม · ห้ามกางทุกกลุ่มเมื่อมีหลายกลุ่ม (§หลักจัดวาง ข้อ 7)
- ห้ามบอกว่า UI เสร็จโดยไม่ผ่าน §ก่อนส่งงาน (หรือระบุว่า `ยังไม่ได้ตรวจ`)
