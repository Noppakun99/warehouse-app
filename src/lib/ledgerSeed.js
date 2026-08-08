// ledgerSeed.js
// Seed ทะเบียนคงคลังงวดตั้งต้นจาก Excel master sheet (export เป็น CSV) — ADR-0007 ข้อ 5
// pure module — ไม่ import supabase (golden-testable; db.js ทำ I/O แยก)
//
// เกณฑ์ seed (decision 2026-06-28): "seed มูลค่าก่อน"
//   - มูลค่า map แม่น (สมการ closing_value = carry_in + in − out ตรง 991/993 แถวจริง)
//   - closing_value/carry_in_value ใช้ค่า "ตรงจาก Excel" (col มูลค่าคงคลัง) ไม่ recompute
//     เพราะ master มี manual override (AC ติดลบ) ที่ derive ใหม่ไม่ได้
//   - qty ดึงตรงจาก master ครบ: opening(คงเหลือเดือนก่อน)/in(ปริมาณเข้า)/out(ปริมาณออก)/closing(คงเหลือหลังจ่าย)
//     (upload รายเดือน — Excel มีคอลัมน์ปริมาณครบ; สมการจำนวนอาจไม่ตรงเป๊ะ = ตาม Excel ต้นทาง)
//   - filter แถว summary (รหัสยาว่าง) ทิ้ง — กัน unique-index ชนกัน
//
// master CSV มี comma ในค่า (ชื่อยา + quoted) → ต้องใช้ RFC-4180 parser
// (XLSX.read parse ไฟล์นี้ไม่ได้ — misdetect format)

// --- RFC-4180 CSV parser (รองรับ quoted field ที่มี comma/newline) ---
export function parseCsv(text) {
  // strip BOM (U+FEFF) ถ้ามี — เลี่ยง char ตรงๆ ใน regex (lint: no-irregular-whitespace)
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* skip */ }
    else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

// --- column index ของ master sheet (45 col, ดู ADR-0007 mapping table) ---
const COL = {
  drugCode: 5,      // รหัสHosxp
  kind: 6,          // ชนิด (Tablet/Injection/เวชภัณฑ์มิใช่ยา…) → drug_type + med_category
  drugName: 7,      // รายการยา
  unit: 8,          // หน่วย
  price: 9,         // ราคา/หน่วย
  lot: 10,          // Lot Number
  itemType: 12,     // ชนิดรายการ (ยกยอด/ซื้อยา/บริจาค…)
  openingQty: 13,   // คงเหลือเดือนก่อน (จำนวน) — opening/ยกมา
  inQty: 15,        // ปริมาณ (เข้า) — in
  company: 16,      // บริษัท
  outQty: 19,       // ปริมาณ (ออก) — out
  closingQty: 20,   // คงเหลือหลังจ่าย — authoritative closing qty
  outValue: 25,     // มูลค่าเบิกยา (บาท)
  inValue: 26,      // มูลค่าซื้อยา (บาท)
  closingValue: 27, // มูลค่าคงคลัง มิ.ย (บาท) — authoritative closing
  carryInValue: 28, // มูลค่าคงคลัง พ.ค (บาท) — carry-in
  donationValue: 29, // มูลค่าคงคลัง(บริจาค+สนับสนุน) — closing ของแถวบริจาค
  projectValue: 34,  // มูลค่าคงคลัง ยาโครงการ — closing ของแถวโครงการ
}

// แปลงตัวเลขที่มี thousands separator + ช่องว่าง (เช่น " 3,723,914.26 ")
const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '').trim()) || 0
const round4 = (v) => Math.round(num(v) * 1e4) / 1e4
const str = (v) => String(v ?? '').trim() || '-'

// item_type ที่เป็นบริจาค/สนับสนุน → med_category='บริจาค+สนับสนุน', closing จาก idx29
const DONATION_TYPES = new Set(['สนับสนุน', 'สนับสนุน2', 'บริจาค', 'บริจาค-ยกยอด', 'บริจาค-ซื้อยา'])
// item_type โครงการ → med_category='ยาโครงการ', closing จาก idx34
const PROJECT_TYPES = new Set(['ยาโครงการ'])

// ชนิด (col6) ที่นับเป็น "เวชภัณฑ์มิใช่ยา"
const NON_DRUG_KIND = 'เวชภัณฑ์มิใช่ยา'

// structure guard — COL เป็น positional (ผูกตำแหน่ง ไม่ใช่ชื่อ) เพราะ header master
// ผูกชื่อเดือน (เลื่อนทุกงวด) → match ด้วยชื่อไม่ได้. แต่ถ้า Excel เพิ่ม/ลบ/สลับคอลัมน์
// ตำแหน่งจะเพี้ยนเงียบทั้งงวด. anchor เช็คคอลัมน์ที่ชื่อ "ไม่ผูกเดือน" ว่ายังอยู่ตำแหน่งเดิม
// — ถ้าไม่ตรง throw แทน seed เพี้ยน (ดู CONTEXT.md / verify 2026-07-05)
const HEADER_ANCHORS = [
  [COL.drugCode, 'รหัสHosxp'],
  [COL.drugName, 'รายการยา'],
  [COL.lot, 'Lot Number'],
  [COL.itemType, 'ชนิดรายการ'],
  [COL.closingQty, 'คงเหลือหลังจ่าย'],
]

export function assertMasterStructure(headerRow) {
  const bad = HEADER_ANCHORS.filter(([idx, kw]) => !String(headerRow?.[idx] ?? '').includes(kw))
  if (bad.length > 0) {
    const detail = bad.map(([idx, kw]) => `คอลัมน์ ${idx + 1} ควรเป็น "${kw}" แต่พบ "${headerRow?.[idx] ?? '(ว่าง)'}"`).join('; ')
    throw new Error(`โครงสร้างไฟล์ master ไม่ตรงที่คาดไว้ — อาจสลับ/เพิ่ม/ลบคอลัมน์ใน Excel: ${detail}`)
  }
}

/**
 * แปลง 1 แถว CSV → 1 ledger row (ตาม schema stock_ledger)
 * คืน null ถ้าเป็นแถว summary (รหัสยาว่าง) → caller filter ทิ้ง
 */
export function mapMasterRow(cells, period) {
  const drugCode = String(cells[COL.drugCode] ?? '').trim()
  if (!drugCode) return null // แถว summary/total — ตัดทิ้ง

  const kind = str(cells[COL.kind])
  const itemType = str(cells[COL.itemType]) === '-' ? 'ยกยอด' : str(cells[COL.itemType])
  const carryInValue = round4(cells[COL.carryInValue])
  const inValue = round4(cells[COL.inValue])
  const outValue = round4(cells[COL.outValue])

  // บริจาค/สนับสนุน/โครงการ = หมวดแยก, closing_value ดึงจาก idx29/34 (idx27 มัก=0 → มูลค่าหาย)
  // idx29 ≥ idx27 เสมอ (verify 2026-07-12) → ใช้ idx29 แทน ไม่มีค่าหาย, ไม่ double-count
  let medCategory, closingValue
  if (DONATION_TYPES.has(itemType)) {
    medCategory = 'บริจาค+สนับสนุน'
    closingValue = round4(cells[COL.donationValue])
  } else if (PROJECT_TYPES.has(itemType)) {
    medCategory = 'ยาโครงการ'
    closingValue = round4(cells[COL.projectValue])
  } else {
    medCategory = kind === NON_DRUG_KIND ? 'เวชภัณฑ์มิใช่ยา' : 'เวชภัณฑ์ยา'
    closingValue = round4(cells[COL.closingValue])
  }

  return {
    period,
    status: 'open',
    drug_code: drugCode,
    lot: str(cells[COL.lot]),
    item_type: itemType,
    price_per_unit: round4(cells[COL.price]),
    drug_name: str(cells[COL.drugName]),
    drug_type: kind,
    unit: str(cells[COL.unit]),
    med_category: medCategory,
    company: str(cells[COL.company]),
    // qty: ดึง movement ตรงจาก master (opening/in/out/closing) — Excel มีครบทุกคอลัมน์
    opening_qty: num(cells[COL.openingQty]),
    in_qty: num(cells[COL.inQty]),
    out_qty: num(cells[COL.outQty]),
    adjust_qty: 0,
    closing_qty: num(cells[COL.closingQty]),
    // value: ใช้ค่าตรงจาก master (มี manual override — ไม่ recompute)
    carry_in_value: carryInValue,
    in_value: inValue,
    out_value: outValue,
    adjust_value: 0,
    closing_value: closingValue,
  }
}

// cost-layer key = ledger row identity (period + รหัส + lot + ชนิด + ราคา) — ตรง unique index DB
const ledgerKey = (r) => `${r.period}|${r.drug_code}|${r.lot}|${r.item_type}|${r.price_per_unit}`

/**
 * รวมแถวที่ cost-layer key ซ้ำ → 1 แถว (sum ทุก qty/value + closing)
 * Master บางไฟล์แยก lot เดียว ราคา/ชนิดเดียวเป็นหลายแถว (เช่น ยกยอดมา 2 ครั้ง) — key เดียวกัน
 * = cost layer เดียวตามนิยาม ADR-0007 ต้องรวม ไม่งั้นชน unique index ตอน insert.
 * **sum closing ดิบ** (ไม่ recompute จากสมการ) — เพราะ closing ที่ mapMasterRow ตั้งมาถูกทุกกรณี
 * (ปกติ=idx27, บริจาค/โครงการ=idx29/34, override=ค่าดิบ Excel ที่ไม่ตรงสมการ). recompute จะทับค่าพวกนี้.
 * @returns { rows, merged } — merged = จำนวนแถวที่ถูกยุบ (rows_in − rows_out)
 */
export function dedupeCostLayers(rows) {
  const map = new Map()
  const SUM = ['opening_qty', 'in_qty', 'out_qty', 'adjust_qty', 'closing_qty', 'carry_in_value', 'in_value', 'out_value', 'adjust_value', 'closing_value']
  for (const r of rows) {
    const k = ledgerKey(r)
    const cur = map.get(k)
    if (!cur) { map.set(k, { ...r }); continue }
    for (const f of SUM) cur[f] = round4(num(cur[f]) + num(r[f]))
  }
  const merged = rows.length - map.size
  return { rows: [...map.values()], merged }
}

/**
 * parse master CSV ทั้งไฟล์ → ledger rows ของงวด `period`
 * @param text   เนื้อ CSV (utf-8)
 * @param period 'YYYY-MM'
 * @returns { rows, skipped, merged, tieOut: { drug, nonDrug, total } }
 */
export function seedFromMasterCsv(text, period) {
  const grid = parseCsv(text)
  assertMasterStructure(grid[0]) // guard: โครงสร้างคอลัมน์ยังตรง positional COL — ไม่งั้น seed เพี้ยนเงียบ
  const dataRows = grid.slice(1) // ตัด header
  const mapped = []
  let skipped = 0
  for (const cells of dataRows) {
    const r = mapMasterRow(cells, period)
    if (r) mapped.push(r)
    else skipped++
  }
  // รวมแถว cost-layer key ซ้ำ (กันชน unique index DB)
  const { rows, merged } = dedupeCostLayers(mapped)
  // tie-out: Σ closing_value แยก 4 หมวด (ต้องตรงไฟล์ส่งบัญชี ก่อนใช้จริง)
  let drug = 0, nonDrug = 0, donation = 0, project = 0
  for (const r of rows) {
    if (r.med_category === 'เวชภัณฑ์มิใช่ยา') nonDrug += r.closing_value
    else if (r.med_category === 'บริจาค+สนับสนุน') donation += r.closing_value
    else if (r.med_category === 'ยาโครงการ') project += r.closing_value
    else drug += r.closing_value
  }
  drug = round4(drug); nonDrug = round4(nonDrug); donation = round4(donation); project = round4(project)
  return { rows, skipped, merged, tieOut: { drug, nonDrug, donation, project, total: round4(drug + nonDrug + donation + project) } }
}
