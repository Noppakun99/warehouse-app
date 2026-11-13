// masterSheet.js — อ่านชีท "Master" → แถว inventory (แผนผังคลังยา)
//
// pure module: ไม่ import supabase (รัน golden test ใน node ได้ — npm run test:mastersheet)
// ตรรกะยกมาจาก `handleLogFileUpload` ใน App.jsx เพื่อให้ CLI กับหน้าเว็บใช้กฎเดียวกัน
//
// ⚠️ 3 กับดักที่เคยทำข้อมูลพังมาแล้ว:
//   1. lot — ห้ามแปลง scientific notation (`26E266` → เลข 269 หลัก, เหตุการณ์ 2026-07-29)
//   2. คอลัมน์ "คงเหลือ" มีหลายตัวชื่อคล้ายกัน ต้องเจาะจง ไม่ใช่ includes('คงเหลือ') เฉยๆ
//      ("คงเหลือหลังจ่าย" = authoritative, "มูลค่าคงเหลือ" = บาทไม่ใช่จำนวน — เหตุการณ์ 2026-07-04)
//   3. วันที่เป็น serial ต้องอ่านค่าดิบ ห้ามใช้ค่าที่แสดง (รูปแบบปนกัน US/ไทย)

export const MASTER_SHEET_NAME = 'Master'
// ชีทขนาดลัง (13/11/2569 — CONTEXT §ลัง): 1 แถว = รหัส + บริษัท + หน่วยซื้อ → จำนวนต่อลัง · แหล่งเดียวกับเพดานพื้นที่ใน pr.py
export const CASE_SHEET_NAME = 'ขนาดลัง'

const txt = (v) => String(v ?? '').trim()

const findCol = (header, test) => (header || []).findIndex((h) => test(txt(h)))

/** map หัวตาราง → index ของคอลัมน์ที่ต้องใช้
 *  qty เจาะจงตามลำดับ: "คงเหลือหลังจ่าย" → "คงเหลือจริง" → generic (กัน "มูลค่าคงเหลือ") */
export function mapMasterColumns(header) {
  const h = (header || []).map(txt)
  const qtyIdx = (() => {
    const after = h.findIndex((x) => x.includes('คงเหลือหลังจ่าย'))
    if (after !== -1) return after
    const real = h.findIndex((x) => x.includes('คงเหลือจริง'))
    if (real !== -1) return real
    return h.findIndex((x) => (x.includes('คงเหลือ') && !x.includes('มูลค่า')) || x.toLowerCase() === 'qty')
  })()
  const qtyReceivedIdx = (() => {
    const exact = h.findIndex((x) => x.includes('จำนวนที่รับ') || x.replace(/\s/g, '').includes('ปริมาณ(เข้า)'))
    if (exact !== -1) return exact
    return h.findIndex((x) => !x.includes('วันที่') && (x.includes('ที่รับ') || x.toLowerCase().includes('received')))
  })()
  return {
    location: findCol(h, (s) => s.includes('DetailedLog') || s.includes('ตำแหน่ง') || s.toLowerCase().includes('location')),
    mainLog: findCol(h, (s) => ['mainlog', 'main_log', 'main log'].includes(s.toLowerCase())),
    code: findCol(h, (s) => s.includes('รหัสHosxp') || s.includes('รหัสยา') || s === 'รหัส' || s.toLowerCase() === 'code'),
    name: findCol(h, (s) => s.includes('รายการยา') || s.includes('ชื่อยา')),
    type: findCol(h, (s) => s === 'ชนิด' || s.toLowerCase() === 'type'),
    unit: findCol(h, (s) => !s.includes('หน่วยงาน') && !s.includes('หน่วยย่อย') && (s === 'หน่วย' || s.toLowerCase() === 'unit')),
    lot: findCol(h, (s) => s.toLowerCase().includes('lot') && !s.includes('ซ้ำ')),
    exp: findCol(h, (s) => s.toLowerCase() === 'exp' || s.includes('หมดอายุ')),
    itemType: findCol(h, (s) => s.includes('ชนิดรายการ')),
    qty: qtyIdx,
    qtyReceived: qtyReceivedIdx,
    invoice: findCol(h, (s) => s.includes('เลขที่บิล')),
    safetyStock: findCol(h, (s) => s.toLowerCase().includes('safety')),
    status: findCol(h, (s) => s.includes('สถานะตรวจรับ')),
    result: findCol(h, (s) => s.includes('ผลการพิจารณา')),
    supplier: findCol(h, (s) => s === 'บริษัท'),
  }
}

const caseKey = (code, supplier, unit) => [code, supplier, unit].map((x) => txt(x).replace(/\s+/g, ' ')).join('|')

/** ชีทขนาดลัง → Map(`รหัส|บริษัท|หน่วยซื้อ` → จำนวนต่อลัง) · ไม่มีชีท = Map ว่าง (ทุก lot "ไม่รู้ขนาดลัง")
 *  คีย์รวมหน่วยด้วย (user เลือก 13/11/2569) — บริษัทเปลี่ยนขนาดแพ็ค = ไม่รู้ขนาดลังจนกว่าจะเพิ่มแถว ไม่ใช้ตัวเลขเดิมแบบเงียบ */
export function parseCaseSizeGrid(grid) {
  const map = new Map()
  if (!Array.isArray(grid) || grid.length < 2) return map
  const h = (grid[0] || []).map(txt)
  const [ci, si, ui, pi] = ['รหัส', 'บริษัท', 'หน่วยซื้อ', 'จำนวนต่อลัง'].map((n) => h.indexOf(n))
  if ([ci, si, ui, pi].some((i) => i < 0)) throw new Error(`ชีท${CASE_SHEET_NAME}: หัวตารางต้องมี รหัส · บริษัท · หน่วยซื้อ · จำนวนต่อลัง`)
  for (const r of grid.slice(1)) {
    const code = normalizeCode(r?.[ci])
    const per = Number(r?.[pi])
    if (code === '-' || !(per > 0)) continue
    const k = caseKey(code, r[si], r[ui])
    if (map.has(k) && map.get(k) !== per) throw new Error(`ชีท${CASE_SHEET_NAME}: ${k} มีหลายแถวแต่จำนวนต่อลังไม่เท่ากัน`)
    map.set(k, per)
  }
  return map
}

/** lot — เก็บตามที่พิมพ์มาเสมอ ห้ามแปลงเป็นตัวเลข (ดูหัวไฟล์ ข้อ 1) */
export function normalizeLot(v) {
  if (v == null || v === '') return '-'
  return txt(v) || '-'
}

/** รหัสยา — ตัด .0 ที่ Excel ติดมา แต่คง 0 นำหน้า */
export function normalizeCode(v) {
  if (v == null || v === '') return '-'
  if (typeof v === 'number') return String(Math.round(v))
  return txt(v).replace(/\.0$/, '') || '-'
}

/** serial/ข้อความ → DD/MM/YYYY (รูปแบบที่ inventory.exp เก็บ) */
export function toThaiDate(v, serialToThai) {
  if (typeof v === 'number') return serialToThai(v) ?? '-'
  const s = txt(v)
  if (!s || s === '-') return '-'
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    let y = Number(m[3])
    if (y > 2500) y -= 543
    return `${String(Number(m[1])).padStart(2, '0')}/${String(Number(m[2])).padStart(2, '0')}/${y}`
  }
  return s
}

const numText = (v) => {
  if (v == null || v === '') return '0'
  if (typeof v === 'number') return String(v)
  return txt(v).replace(/,/g, '') || '0'
}

/** 1 แถว → { location, item } | null ถ้าข้าม (ไม่มีที่เก็บ หรือไม่มีทั้งชื่อและรหัส) */
export function rowToInventoryItem(row, C, serialToThai, caseSizes = null) {
  const at = (k) => (C[k] >= 0 ? row[C[k]] : undefined)
  const location = txt(at('location'))
  const name = txt(at('name'))
  const code = normalizeCode(at('code'))
  if (!location) return null
  if (!name && (!code || code === '-')) return null
  const qtyReceived = at('qtyReceived')
  const unit = txt(at('unit')) || '-'
  return {
    location,
    item: {
      code,
      name: name || '-',
      type: txt(at('type')) || '-',
      unit,
      lot: normalizeLot(at('lot')),
      exp: toThaiDate(at('exp'), serialToThai),
      qty: numText(at('qty')),
      qtyReceived: qtyReceived != null && qtyReceived !== '' ? numText(qtyReceived) : null,
      invoice: txt(at('invoice')) || '-',
      mainLog: txt(at('mainLog')) || null,
      itemType: txt(at('itemType')) || null,
      safetyStock: parseFloat(numText(at('safetyStock'))) || 0,
      receiveStatus: [txt(at('status')), txt(at('result'))].filter(Boolean).join('|') || 'ไม่มีการดำเนินการ',
      caseSize: caseSizes?.get(caseKey(code, at('supplier'), unit)) ?? null,
    },
  }
}

/** ทั้งชีท → { inventory, rows, skipped, locations, caseSize } — inventory = object ที่ saveInventory รับ
 *  caseGrid = ชีทขนาดลัง (null = ไม่มี) · caseSize.unmatched = แถวในชีทขนาดลังที่ไม่ตรง lot ไหนเลย (สะกดบริษัท/หน่วยผิด หรือของหมดแล้ว) */
export function parseMasterGrid(grid, serialToThai, caseGrid = null) {
  if (!Array.isArray(grid) || grid.length < 2) throw new Error('ชีทไม่มีข้อมูล')
  const C = mapMasterColumns(grid[0])
  if (C.location < 0) throw new Error('ไม่พบคอลัมน์ที่เก็บ (DetailedLog)')
  if (C.name < 0 && C.code < 0) throw new Error('ไม่พบคอลัมน์ชื่อยา/รหัสยา')
  if (C.qty < 0) throw new Error('ไม่พบคอลัมน์คงเหลือ')
  const caseSizes = parseCaseSizeGrid(caseGrid)
  if (caseSizes.size && C.supplier < 0) throw new Error('ไม่พบคอลัมน์บริษัท — จับคู่ขนาดลังไม่ได้')

  const inventory = {}
  let rows = 0
  let skipped = 0
  let lotsWithCase = 0
  const usedCase = new Set()
  for (let i = 1; i < grid.length; i++) {
    const raw = grid[i]
    if (!raw || !raw.some((c) => txt(c) !== '')) { skipped++; continue }
    const res = rowToInventoryItem(raw, C, serialToThai, caseSizes)
    if (!res) { skipped++; continue }
    if (!inventory[res.location]) inventory[res.location] = []
    inventory[res.location].push(res.item)
    rows++
    if (res.item.caseSize != null) { lotsWithCase++; usedCase.add(caseKey(res.item.code, raw[C.supplier], res.item.unit)) }
  }
  const caseSize = { rows: caseSizes.size, lots: lotsWithCase, unmatched: [...caseSizes.keys()].filter((k) => !usedCase.has(k)) }
  return { inventory, rows, skipped, locations: Object.keys(inventory).length, columns: C, caseSize }
}

export function readMasterWorkbook(XLSX, filePath, serialToThai, sheetName = MASTER_SHEET_NAME) {
  const wb = XLSX.readFile(filePath, { sheets: [sheetName, CASE_SHEET_NAME], cellDates: false })
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`ไม่พบชีท "${sheetName}" ในไฟล์`)
  // raw:true — วันที่เป็น serial ต้องอ่านค่าดิบ (ดูหัวไฟล์ ข้อ 3)
  const toGrid = (w) => XLSX.utils.sheet_to_json(w, { header: 1, defval: '', raw: true, blankrows: true })
  const caseWs = wb.Sheets[CASE_SHEET_NAME]
  return parseMasterGrid(toGrid(ws), serialToThai, caseWs ? toGrid(caseWs) : null)
}
