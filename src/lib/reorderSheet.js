// reorderSheet.js — อ่านชีท "วิเคราะห์สั่งซื้อ" → แถว drug_reorder_config
//
// pure module: ไม่ import supabase (รัน golden test ใน node ได้ — npm run test:reordersheet)
// ตรรกะยกมาจาก `ImportMasterModal.handleFile` ใน ReorderApp.jsx เพื่อให้ CLI กับหน้าเว็บ
// ใช้กฎเดียวกัน — **แก้ที่นี่ที่เดียว** ไม่ต้องไล่แก้ 2 ที่แล้วดริฟต์
//
// ⚠️ ADR-0001: Excel เป็น reference สำหรับ reconcile เท่านั้น
//    import แค่ VEN + exclude_status — ราคา/บริษัท/LT แอป derive จาก receive_logs สด
//    (ค่าใน Excel stale ทับแล้วเพี้ยน)

export const REORDER_SHEET_NAME = 'วิเคราะห์สั่งซื้อ'

export const STATUS = { EXCLUDED: 'ตัดออก', ON_DEMAND: 'สั่งเมื่อขอ' }

// VEN → risk_group. ⚠️ ว่าง/ไม่รู้จัก = null ไม่ใช่ 'Normal'
// เพื่อให้ analyzeDrug fallback เป็นตัวคูณ 1.5 (Essential) ตาม ADR-0002
const VEN_MAP = { V: 'Critical', E: 'Essential', N: 'Normal' }
const RISK_VALUES = ['Normal', 'Essential', 'Critical']

const txt = (v) => String(v ?? '').trim()

/** หาแถวหัวตาราง — ไฟล์มีแถว title/คำเตือนนำหน้า (ของจริงอยู่แถวที่ 3)
 *  ถ้าใช้แถวแรกเป็น header key จะเพี้ยนทั้งไฟล์ → import ได้ 0 แถว */
export function findHeaderRow(grid) {
  return (grid || []).findIndex(row =>
    Array.isArray(row) && row.some(c => {
      const s = txt(c)
      return s === 'รหัส' || s.toLowerCase() === 'code'
    }))
}

/** VEN/risk → enum ของระบบ (null = ไม่ระบุ) */
export function normalizeRisk(v) {
  const s = txt(v)
  if (!s) return null
  const mapped = VEN_MAP[s.toUpperCase()]
  if (mapped) return mapped
  return RISK_VALUES.includes(s) ? s : null
}

/** สถานะตัดออกจากบัญชี — คอลัมน์ในไฟล์มี emoji นำหน้า ("✂️ ตัดออก" / "📋 สั่งเมื่อขอ")
 *  ต้อง strip อักขระที่ไม่ใช่ตัวอักษรก่อนเทียบ แล้วใช้ includes (ห้าม === เพราะ match ไม่ติด) */
export function normalizeExclude(v) {
  const s = txt(v).replace(/[^฀-๿a-zA-Z]/g, '')
  if (s.includes('ตัดออก')) return STATUS.EXCLUDED
  if (s.includes('สั่งเมื่อขอ')) return STATUS.ON_DEMAND
  return null
}

/** 1 แถว (object จาก sheet_to_json) → แถว drug_reorder_config | null ถ้าไม่มีรหัส */
export function rowToReorderConfig(r) {
  const code = txt(r['รหัส'] ?? r['code'] ?? r['Code'])
  if (!code) return null
  return {
    code,
    name: txt(r['รายการยา'] ?? r['ชื่อยา'] ?? r['name'] ?? r['Name']) || null,
    supplier: txt(r['บริษัทล่าสุด'] ?? r['บริษัท'] ?? r['supplier'] ?? r['Supplier']) || null,
    risk_group: normalizeRisk(r['VEN'] ?? r['ven'] ?? r['กลุ่ม VEN'] ?? r['risk'] ?? r['risk_group'] ?? r['Risk']),
    lead_time_days: parseFloat(r['lead_time'] ?? r['lead_time_days'] ?? r['LT'] ?? 15) || 15,
    price_per_unit: parseFloat(r['ราคา'] ?? r['price'] ?? r['price_per_unit'] ?? 0) || 0,
    exclude_status: normalizeExclude(r['exclude_status'] ?? r['ตัดออกจากบัญชี ,สั่งเมื่อขอ'] ?? r['สถานะ']),
    pack_size: parseFloat(r['pack_size'] ?? r['pack'] ?? 1) || 1,
    notes: txt(r['notes'] ?? r['หมายเหตุ']) || null,
  }
}

/** แถว object ทั้งชีท → { rows, skipped, stats } */
export function parseReorderRows(arr) {
  const rows = []
  let skipped = 0
  for (const r of arr || []) {
    const row = rowToReorderConfig(r)
    if (row) rows.push(row); else skipped++
  }
  if (!rows.length) throw new Error('ไม่พบรายการ — ต้องมีคอลัมน์ "รหัส" หรือ "code"')
  const stats = {
    excluded: rows.filter(r => r.exclude_status === STATUS.EXCLUDED).length,
    onDemand: rows.filter(r => r.exclude_status === STATUS.ON_DEMAND).length,
    noRisk: rows.filter(r => r.risk_group == null).length,
    byRisk: RISK_VALUES.reduce((a, k) => ({ ...a, [k]: rows.filter(r => r.risk_group === k).length }), {}),
  }
  return { rows, skipped, stats }
}

/** อ่านไฟล์ .xlsm → { rows, skipped, stats }
 *  @param XLSX โมดูล xlsx (ส่งเข้ามาเพื่อให้ pure module นี้ไม่ผูกกับ import ตรง) */
export function readReorderWorkbook(XLSX, filePath, sheetName = REORDER_SHEET_NAME) {
  const wb = XLSX.readFile(filePath, { sheets: [sheetName], cellDates: false })
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`ไม่พบชีท "${sheetName}" ในไฟล์`)
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const headerRow = findHeaderRow(grid)
  if (headerRow < 0) throw new Error('ไม่พบหัวตาราง (ต้องมีคอลัมน์ "รหัส")')
  const arr = XLSX.utils.sheet_to_json(ws, { defval: '', range: headerRow })
  return parseReorderRows(arr)
}
