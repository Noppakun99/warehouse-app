// รายงาน 5 แฟ้ม DMSIC — แฟ้ม 4 DISTRIBUTION + แฟ้ม 5 INVENTORY (ADR-0031 · CONTEXT §รายงาน 5 แฟ้ม)
// pure module (ไม่ import supabase) — golden test: npm run test:dmsic
//
// ข้อมูลเข้า = แถวที่ caller โหลดมาแล้ว:
//   ledgerRows   stock_ledger ของงวด (ต้องปิดแล้ว) — มี exp · pack_size · sub_unit (dmsic_migration.sql)
//   dispenseRows dispense_logs ของเดือนเดียวกัน
//   tpuRows      drug_tpu_map  { drug_code, company, tpu_code, trade_name, base_unit }
//   taxRows      vendor_tax_id { company, tax_id }
// คืน { rows, problems } — problem level 'error' = สเปกห้ามว่าง/ผิดรูป ต้องแก้ก่อนส่ง (ไม่เดาแทน)
//                          level 'warn'  = ส่งได้แต่ควรเติม (TPU = 99)

export const HOSP_CODE = 'EA0010763'
export const TPU_NOT_FOUND = '99'

// กลุ่มหน่วยเบิก (DIS_DEPT_GROUP) ตามคู่มือ Dataset ส.ค.2568 — user เลือกตามข้อเสนอ 17/11/2569
// ต้นฉบับ: Desktop\ยอดคงคลัง\INVS\_จับคู่หน่วยเบิก_DIS_DEPT_GROUP.csv (แก้ที่นี่ต้องแก้ CSV + CONTEXT §กลุ่มหน่วยเบิก ด้วย)
// หน่วยงานที่ไม่อยู่ในตาราง = problem 'error' ห้ามเดากลุ่ม
export const DEPT_GROUP = {
  'ห้องยา1': '1',
  'ห้องยาG': '2', 'OPD': '2', 'ER': '2', 'ER-ออกหน่วย': '2', 'ทันตกรรม': '2', 'แผนไทย': '2',
  'ส่งเสริม': '2', 'กายภาพ': '2', 'ห้องบัตร': '2', 'ห้องทำแผล': '2',
  'หน่วยงานบริการด้านปฐมภูมิและองค์รวม': '2',
  'IPD': '3', 'IPD-โดม': '3', 'IPD-หน่วยวัง': '3', 'LR': '3',
  'LAB': '4', 'x-ray': '4', 'สุขาภิบาล': '4', 'บริหารทั่วไป': '4', 'งานส่งต่อ': '4',
  'งานประกันสุขภาพ': '4', 'กลุ่มงานจิเวศและยาเสพติด': '4', 'พ.ข.ร': '4',
  'รพสต.วัดประยูร': '5', 'รพสต.คูคต': '5',
  'ศูนย์บริการสาธารณสุข 1 (ชุมชนสินสมุทร)': '6',
  'ศูนย์บริการสาธารณสุข 2 (ชุมชนรัตนโกสินทร์)': '6',
  'ศูนย์บริการสาธารณสุข 3 (เทพธัญญะอุปถัมภ์)': '6',
  'ศูนย์บริการสาธารณสุข 4 (สิริเวชชะพันธ์อุปถัมภ์)': '6',
  'ศูนย์บริการสาธารณสุขเทศบาลเมืองคูคต': '6', 'เทศบาลนครรังสิต': '6',
  'รพ.สามโคก': '9', 'รพ.ลาดหลุมแก้ว': '9', 'รพ.ปทุมธานี': '9', 'รพ.คลองหลวง': '9',
  'รพ.หนองเสือ': '9', 'รพ.ธัญบุรี': '9', 'รพ.เปาโล': '9', 'รพ.กรุงไทยเวิสเทิร์น': '9',
  'รพ.เกษมราษฎร์ปทุม': '9', 'รพ.ปทุมเวศ': '9', 'สถาบันสิรินธรเพื่อการฟื้นฟูสมรรถภาพทางการแพทย์แห่งชาติ': '9',
  'องค์การเภสัชกรรม': '9', 'บริษัท โปลิฟาร์ม จำกัด': '9',
}

// แถวชีทเบิกที่ไม่ใช่การจ่ายให้หน่วยงานจริง (CONTEXT §แฟ้มจ่าย) — ตรง NON_DEPARTMENTS ของ DispenseLogApp
export const NON_DISTRIBUTION_DEPTS = new Set([
  'เบิกยาหมดอายุจากคลัง', 'คืนยา', 'เบิกเพื่อแลกเปลี่ยนคืนยา', 'เบิกเพิ่มจากความผิดพลาด',
])
const RECORD_ONLY = 'บันทึกเท่านั้น'
const NON_DRUG_KIND = 'เวชภัณฑ์มิใช่ยา'

// หน่วยย่อยภาษาไทย → DispUnit ของ TMT เฉพาะคำที่ไม่กำกวม — เม็ด (tablet/capsule) · ขวด (bottle/bag) · หลอด
// กำกวม จึงไม่อยู่ในนี้: ต้องเติม drug_tpu_map.base_unit (แถว TPU 99 ก็ใส่ base_unit ได้)
const THAI_BASE_UNIT = { amp: 'ampoule', ampoule: 'ampoule', 'แอมป์': 'ampoule', vial: 'vial', 'ไวแอล': 'vial', 'ซอง': 'sachet' }

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const blank = (v) => { const s = clean(v); return s === '' || s === '-' }
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const round2 = (v) => Math.round(num(v) * 100) / 100
const round4 = (v) => Math.round(num(v) * 1e4) / 1e4
const isInt = (v) => Math.abs(v - Math.round(v)) < 1e-9

export const normCompany = (c) => clean(c)
export const deptGroupOf = (dept) => DEPT_GROUP[clean(dept)] ?? null
export const isDrugKind = (drugType) => clean(drugType) !== NON_DRUG_KIND

/** '2026-10' → 'YYYYMM' */
export const periodRpt = (period) => String(period).replace('-', '')

/** '2026-10' → '20261031' (วันสุดท้ายของเดือน) */
export function periodEndDate(period) {
  const [y, m] = String(period).split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${y}${String(m).padStart(2, '0')}${String(last).padStart(2, '0')}`
}

/** Date → 'YYYYMMDDHHMMSS' (เวลาเครื่อง — ไม่ใช้ toISOString ที่เลื่อนเป็น UTC) */
export function formatDateSend(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** exp ISO 'YYYY-MM-DD' → 'YYYYMMDD' · รูปอื่น/ว่าง → null */
export function expToText(exp) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(exp))
  return m ? `${m[1]}${m[2]}${m[3]}` : null
}

const ledgerKey = (code, lot, itemType, price) => `${clean(code)}|${clean(lot)}|${clean(itemType)}|${round4(price)}`

function tpuIndex(tpuRows) {
  const map = new Map()
  for (const t of tpuRows || []) map.set(`${clean(t.drug_code)}|${normCompany(t.company)}`, t)
  return map
}

/** ข้อมูลยาที่ทั้ง 2 แฟ้มใช้ร่วม — จากแถว ledger + ตาราง TPU · ดัน problem เข้า `push` */
function describe(led, tpus, push) {
  const code = clean(led.drug_code)
  const company = normCompany(led.company)
  const t = tpus.get(`${code}|${company}`)
  const tpu = clean(t?.tpu_code) || TPU_NOT_FOUND
  if (tpu === TPU_NOT_FOUND) push('warn', 'ไม่พบ TPU (ส่ง 99 + ชื่อยา Master)')
  const tradeName = (tpu !== TPU_NOT_FOUND && clean(t?.trade_name)) || clean(led.drug_name)

  const packSize = num(led.pack_size)
  if (!(packSize > 0)) push('error', 'ไม่มี PACK_SIZE')
  else if (!isInt(packSize)) push('error', `PACK_SIZE เป็นทศนิยม (${packSize})`)

  const baseUnit = clean(t?.base_unit) || THAI_BASE_UNIT[clean(led.sub_unit).toLowerCase()] || ''
  if (!baseUnit) push('error', `เทียบ BASE_UNIT ไม่ได้ (หน่วยย่อย "${clean(led.sub_unit) || '-'}")`)

  return { code, company, tpu, tradeName, packSize, baseUnit }
}

function problemFactory(problems, file, base) {
  return (level, type) => problems.push({ level, file, type, ...base })
}

/**
 * แฟ้ม 5 INVENTORY — ทุกแถวบัญชียาที่ยอดสิ้นงวด > 0 (ไม่ส่งเวชภัณฑ์มิใช่ยา / บันทึกเท่านั้น)
 * 1 record ต่อ ชื่อการค้า + lot + ขนาดบรรจุ (+ บริษัท) — แถวบัญชีคนละราคาใน lot เดียวกันรวมกัน PACK_COST = มูลค่า ÷ จำนวน
 */
export function buildInventoryReport({ ledgerRows, tpuRows, taxRows, period, dateSend }) {
  const problems = []
  const tpus = tpuIndex(tpuRows)
  const taxes = new Map((taxRows || []).map(r => [normCompany(r.company), clean(r.tax_id)]))
  const groups = new Map()

  const open = (ledgerRows || []).filter(r => r.status !== 'closed').length
  if (open > 0) problems.push({ level: 'error', file: 'INVENTORY', type: `งวด ${period} ยังไม่ปิด (${open} แถว)` })

  for (const led of ledgerRows || []) {
    if (!isDrugKind(led.drug_type) || clean(led.item_type) === RECORD_ONLY) continue
    const qty = num(led.closing_qty)
    if (!(qty > 0)) continue
    const push = problemFactory(problems, 'INVENTORY', {
      drug_code: clean(led.drug_code), drug_name: clean(led.drug_name), lot: clean(led.lot), company: normCompany(led.company),
    })
    const d = describe(led, tpus, push)
    if (blank(led.lot)) push('error', 'ไม่มี Lot')
    const exp = expToText(led.exp)
    if (!exp) push('error', 'ไม่มีวันหมดอายุ')
    if (blank(d.company)) push('error', 'ไม่มีบริษัท (VENDOR_NAME)')
    const taxId = taxes.get(d.company) || ''
    if (!blank(d.company) && !taxId) push('error', 'ไม่มีเลขผู้เสียภาษีบริษัท')

    const key = [d.code, d.tpu, d.tradeName, clean(led.lot), d.packSize, d.company].join('|')
    const g = groups.get(key)
    if (g) { g.qty += qty; g.value += num(led.closing_value); continue }
    groups.set(key, {
      code: d.code, drugName: clean(led.drug_name), d, lot: clean(led.lot), exp, taxId, qty, value: num(led.closing_value),
    })
  }

  const rows = []
  for (const g of groups.values()) {
    const qty = round4(g.qty)
    if (!isInt(qty)) {
      problems.push({ level: 'error', file: 'INVENTORY', type: `ยอดคงคลังเป็นทศนิยม (${qty})`, drug_code: g.code, drug_name: g.drugName, lot: g.lot, company: g.d.company })
    }
    rows.push({
      HOSP_CODE,
      WORKING_CODE: g.code,
      TRADE_NAME: g.d.tradeName,
      TPUID: g.d.tpu,
      VENDOR_NAME: g.d.company,
      VENDOR_TAX_ID: g.taxId,
      QTY_ONHAND: qty,
      PACK_SIZE: g.d.packSize,
      BASE_UNIT: g.d.baseUnit,
      PACK_COST: round2(qty ? g.value / qty : 0),
      VALUE_ONHAND: round2(g.value),
      LOT_NO: g.lot,
      EXPIRE_DATE: g.exp || '',
      DATE_ONHAND: periodEndDate(period),
      DATE_SEND: dateSend,
    })
  }
  rows.sort((a, b) => a.WORKING_CODE.localeCompare(b.WORKING_CODE) || a.LOT_NO.localeCompare(b.LOT_NO))
  return { rows, problems: dedupeProblems(problems) }
}

/**
 * แฟ้ม 4 DISTRIBUTION — แถวชีทเบิกของเดือนที่จ่ายให้หน่วยงานจริง รวม 1 record ต่อ ยา + ขนาดบรรจุ ต่อกลุ่มหน่วยเบิก
 * จับคู่แถวบัญชีด้วย รหัส + lot + ชนิดรายการ + ราคา (cost-layer key) เพื่อเอาบริษัท/ขนาดบรรจุ/หน่วยย่อย
 * ไม่ตรง key → ใช้แถวบัญชี รหัส + lot เดียวกันได้เฉพาะเมื่อทุกแถวให้ บริษัท/ขนาดบรรจุ/หน่วยย่อย เหมือนกัน (ผลเดียวกัน ไม่ใช่การเดา)
 */
export function buildDistributionReport({ dispenseRows, ledgerRows, tpuRows, period, dateSend }) {
  const problems = []
  const tpus = tpuIndex(tpuRows)
  const byKey = new Map()
  const byLot = new Map()
  for (const led of ledgerRows || []) {
    byKey.set(ledgerKey(led.drug_code, led.lot, led.item_type, led.price_per_unit), led)
    const lk = `${clean(led.drug_code)}|${clean(led.lot)}`
    if (!byLot.has(lk)) byLot.set(lk, [])
    byLot.get(lk).push(led)
  }
  const sameShape = (a, b) => normCompany(a.company) === normCompany(b.company)
    && num(a.pack_size) === num(b.pack_size) && clean(a.sub_unit) === clean(b.sub_unit)

  const groups = new Map()
  for (const r of dispenseRows || []) {
    const dept = clean(r.department)
    if (NON_DISTRIBUTION_DEPTS.has(dept) || clean(r.item_type) === RECORD_ONLY || !isDrugKind(r.drug_type)) continue
    const qty = num(r.qty_out)
    if (!qty) continue
    const base = { drug_code: clean(r.drug_code), drug_name: clean(r.drug_name), lot: clean(r.lot), department: dept }

    const group = deptGroupOf(dept)
    if (!group) problems.push({ level: 'error', file: 'DISTRIBUTION', type: `หน่วยงานไม่อยู่ในตารางกลุ่มหน่วยเบิก (${dept || '-'})`, ...base })

    let led = byKey.get(ledgerKey(r.drug_code, r.lot, r.item_type, r.price_per_unit))
    if (!led) {
      const cands = byLot.get(`${clean(r.drug_code)}|${clean(r.lot)}`) || []
      if (cands.length && cands.every(c => sameShape(c, cands[0]))) led = cands[0]
    }
    if (!led) {
      problems.push({ level: 'error', file: 'DISTRIBUTION', type: `ไม่พบแถวบัญชีในงวด (${clean(r.item_type) || '-'} · ราคา ${round4(r.price_per_unit)})`, ...base })
      continue
    }
    if (!isDrugKind(led.drug_type)) continue
    const d = describe(led, tpus, problemFactory(problems, 'DISTRIBUTION', { ...base, company: normCompany(led.company) }))
    if (!group) continue

    const key = [d.code, d.tpu, d.tradeName, d.packSize, d.baseUnit, group].join('|')
    const g = groups.get(key)
    const value = qty * num(r.price_per_unit)
    if (g) { g.qty += qty; g.value += value; continue }
    groups.set(key, { d, group, qty, value })
  }

  const rows = [...groups.values()].map(g => ({
    HOSP_CODE,
    WORKING_CODE: g.d.code,
    TRADE_NAME: g.d.tradeName,
    TPUID: g.d.tpu,
    QTY_DIS: round2(g.qty),
    PACK_SIZE: g.d.packSize,
    BASE_UNIT: g.d.baseUnit,
    VALUE: round2(g.value),
    DIS_DEPT_GROUP: g.group,
    PERIOD_RPT: periodRpt(period),
    DATE_SEND: dateSend,
  }))
  rows.sort((a, b) => a.WORKING_CODE.localeCompare(b.WORKING_CODE) || a.DIS_DEPT_GROUP.localeCompare(b.DIS_DEPT_GROUP))
  return { rows, problems: dedupeProblems(problems) }
}

// problem ซ้ำ (แถวเบิกหลายแถวของยา/lot เดียวกันชนปัญหาเดียวกัน) → แสดงครั้งเดียว พร้อมจำนวนครั้ง
function dedupeProblems(list) {
  const map = new Map()
  for (const p of list) {
    const k = [p.level, p.file, p.type, p.drug_code, p.lot, p.company, p.department].join('|')
    const cur = map.get(k)
    if (cur) cur.count++
    else map.set(k, { ...p, count: 1 })
  }
  return [...map.values()]
}
