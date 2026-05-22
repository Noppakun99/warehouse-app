# AnalyticsApp (วิเคราะห์การเบิกยา)

- file: `src/AnalyticsApp.jsx` — เข้าได้เฉพาะ role `staff` / `admin` (SYSTEMS roles: `['staff','admin']`)
- ดึงข้อมูลผ่าน `fetchDispenseAnalytics(dateFrom, dateTo)` ใน `db.js` — pagination 1,000 rows/page
- select: `drug_name, drug_code, drug_type, qty_out, price_per_unit, drug_unit, department, dispense_date, item_type`

## โครงสร้าง 3 Tab

| Tab | ชื่อ | เนื้อหา |
|-----|------|--------|
| ภาพรวม | Executive Summary | KPI cards, Attention panel (top drugs/dept), Forecast snapshot, Rising Demand alerts |
| คลังยา / ABC | Inventory & ABC | ABC table + filter, bar charts gradient, dept top-5 (expand) |
| แนวโน้ม | Trends & Forecasting | Monthly trend + MA3, YoY chart, Forecast chart + table |

## การคำนวณหลัก

- **ราคาต่อหน่วย**: `getPrice(r)` — `price_per_unit` ก่อน, fallback `drug_unit`
- **มูลค่า**: `qty_out × getPrice(r)`
- **uniqueDays**: `new Set(rows.map(r => r.dispense_date))`
- **drugMonMap**: per-drug per-month value (ใช้คำนวณ momentum)

## Statistical Models

- **MA3**: 3-month Moving Average — เส้นประบน trend chart ตัดสัญญาณรบกวน
- **Linear Regression** (`linReg`): Forecast เส้นตรง — เหมาะแนวโน้มคงที่
- **Holt's Exponential Smoothing** (`holtForecast`, α=0.3, β=0.15): ให้น้ำหนักข้อมูลล่าสุดมากกว่า
- ทั้ง 2 โมเดลคำนวณพร้อมกันใน useMemo เดียว (`combinedChartLinear`, `combinedChartHolt`) — toggle สลับ state เท่านั้น ไม่ recompute

## Rising Demand (Momentum Detection)

- คำนวณใน main useMemo: `lastMon` vs `avg(prev3Mons)` ต่อยา
- เงื่อนไข: `momentum >= 30%` AND `prevAvg > 0`
- แสดงใน Tab ภาพรวม พร้อม badge กลุ่ม ABC ของยานั้น

## ABC Analysis (`abcClassify`)

- Sort drugs DESC by value → คำนวณ cumulative %
- A = cumPct ≤ 80%, B = ≤ 95%, C = ที่เหลือ
- แสดงใน Tab คลังยา — filter tab A/B/C, ตาราง max 30 รายการ

## Year-over-Year Seasonality

- `yoySufficient` = ปีอ้างอิง (ไม่ใช่ปีล่าสุด) มีข้อมูล ≥ 6 เดือน
- ถ้าไม่ sufficient: แสดง warning สีม่วง + เส้นกราฟปีนั้นเป็นเส้นประ
- ซ่อนกราฟทั้งหมดถ้า `yoyYears.length < 2`

## Forecast Reliability

- `forecastReliable` = `monthlyTrend.length >= 6`
- ถ้าไม่ reliable: แสดง banner สีแดงเตือนไม่ให้นำไปตัดสินใจจัดซื้อโดยตรง

## Drug Filter

- `drugSearch` state กรองข้อมูลทุก tab
- `filteredRows = drugSearch ? rows.filter(ilike) : rows` — ทุก useMemo ต้องใช้ `filteredRows` ไม่ใช่ `rows`
- `drugNames` options: `{ name, type }[]` สร้างจาก `rows` ที่โหลดมาแล้ว (ไม่ต้อง query แยก)
- ใช้ `DrugSearchBar` component — `ringClass="focus:ring-blue-400"`
- **dedup ต้อง normalize**: `.trim().replace(/\s+/g, ' ')` — exact dedup จะแยกชื่อที่มี whitespace ต่างกันเป็น 2 รายการ

## UI Conventions

- **Bar chart สี**: `heatBlue(i, total)` — gradient น้ำเงินเข้ม (#1E40AF) → อ่อน (#93C5FD) ไม่ใช้ rainbow COLORS
- **Dept chart**: แสดง Top 5 default, ปุ่ม "ดูทั้งหมด" toggle `showAllDepts`
- **Forecast table**: sort by `p1`/`p6`/`p12` ตาม `forecastPeriod` toggle (1/6/12 เดือน)

## Supplier Risk Chart (สัดส่วนมูลค่าต่อบริษัท)

- **องค์การเภสัชกรรม (GPO)** — ยกเว้นการประเมิน risk เสมอ เพราะเป็นรัฐวิสาหกิจที่บังคับซื้อก่อน
- ตรวจด้วย: `name.includes('องค์การเภสัช')` → แสดง badge "รัฐ" สีน้ำเงิน, บาร์สีน้ำเงิน
- บริษัทเอกชน: ≥40% = เสี่ยงสูง (แดง), ≥20% = ระวัง (ส้ม), ≥10% = เหลือง, <10% = ปลอดภัย (เขียว)
- items format: `[name, pct, isGPO]` — ส่งผ่าน tuple 3 ตัวไปยัง BarSection
