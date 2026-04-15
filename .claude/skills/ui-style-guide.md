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

---

## Icons

- ใช้ `lucide-react` เท่านั้น — ห้ามใช้ emoji หรือ icon library อื่น
- ขนาดปกติ: `size={16}` สำหรับ inline, `size={20}` สำหรับ standalone
- สีตาม context: `className="text-slate-500"` หรือ `className="text-{color}-600"`

---

## Do Not

- ห้ามใช้ arbitrary values เช่น `w-[123px]` ถ้าหลีกเลี่ยงได้
- ห้ามสร้างไฟล์ `.css` หรือใช้ `<style>` tag ใน component
- ห้ามใช้ `rounded-md` — ใช้ `rounded-xl` หรือ `rounded-2xl` เท่านั้น
- ห้ามใช้ `shadow-lg` ใน card ปกติ — ใช้ `shadow-sm` เท่านั้น
