// deadStock.js — ยาไม่เคลื่อนไหว (Dead Stock) · pure (ไม่ import supabase → golden test ได้)
// นิยาม CONTEXT.md §ยาไม่เคลื่อนไหว (Dead Stock) · ออกแบบ docs/features/dead-stock.md
//
// เกณฑ์ (user เลือก 18/11/2569): นับ "เดือนเต็มติดต่อกันที่ไม่มีการเบิกใช้จริง" ย้อนจากเดือนที่แล้ว
//   ≥ 6 เดือน = แจ้งหัวหน้า (report) · 3–5 เดือน = เฝ้าดู (watch) · เดือนนี้มีเบิก = เคลื่อนไหว
//   จุดเริ่มนับ = เดือนที่เบิกใช้ครั้งล่าสุด หรือเดือนรับเข้าครั้งแรก (อันที่ใหม่กว่า) — ยาเพิ่งเข้าต้องมีโอกาสถูกเบิกก่อน
// ใช้ 2 ทาง: เร่งใช้/คืนบริษัท/โอน และข้อมูลประกอบเสนอออกจากบัญชีต่อ PTC

export const REPORT_MONTHS = 6
export const WATCH_MONTHS = 3

// การเบิกที่ไม่ใช่การใช้ยาจริง (CONTEXT §Dead Stock · ชื่อตรงจาก dispense_logs 18/11/2569)
export const NON_USAGE_DEPARTMENTS = new Set([
  'เบิกเพิ่มจากความผิดพลาด', 'เบิกยาหมดอายุจากคลัง', 'เบิกเพื่อแลกเปลี่ยนคืนยา', 'คืนยา',
])

/** การเบิกนี้นับเป็นการใช้ยาจริงไหม — ให้ยืม/โอนออกนอก รพ. (รพ.อื่น · บริษัท · อภ. · สถาบัน) ไม่นับ เพราะไม่ใช่การใช้ในเครือข่ายเรา */
export function isRealUsage(department) {
  const d = String(department ?? '').trim()
  if (!d || NON_USAGE_DEPARTMENTS.has(d)) return false
  if (/^รพ\./.test(d) || /^บริษัท/.test(d) || d.includes('องค์การเภสัชกรรม') || /^สถาบัน/.test(d)) return false
  return true
}

const s = (v) => String(v ?? '').trim()

/** "YYYY-MM-DD" / Date → "YYYY-MM" */
export function ymOf(d) {
  if (d instanceof Date) return isNaN(d) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const m = s(d).match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}` : null
}

const ymIndex = (ym) => { const [y, m] = ym.split('-').map(Number); return y * 12 + (m - 1) }
const ymFromIndex = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`

const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
/** "2026-05" → "พ.ค.69" */
export function ymThai(ym) {
  if (!ym) return '-'
  const [y, m] = ym.split('-').map(Number)
  return `${TH_MONTH[m - 1]}${String(y + 543).slice(-2)}`
}

/** key ยา: รหัส หรือชื่อเมื่อรหัสเป็น "-" (กฎเดียวกับการ์ดรายการยาในคลัง) */
export function drugKey(code, name) {
  const c = s(code)
  return c && c !== '-' ? c : `name:${s(name).toLowerCase()}`
}

// ── กลุ่มยาที่ต้องมีในคลัง (ระบบเดาจากข้อมูล — คลังต้องเขียนเหตุผลรายตัวเอง CONTEXT §Dead Stock) ──
const ANTI_INFECTIVE = /(cef|ceph|cillin|penem|mycin|micin|floxacin|cycline|vancomycin|metronidazole|clindamycin|co-?trimoxazole|sulfameth|colistin|fosfomycin|tazobactam|sulbactam|azithro|erythro|clarithro|amikacin|gentamicin|acyclovir|fluconazole|amphotericin|benzathine|\bPGS\b)/i
const PROGRAM = /(isoniazid|\bINH\b|rifampi|pyrazinamide|ethambutol|streptomycin|dapsone|clofazimine|diethylcarbamazine|\bDEC\b|efavirenz|tenofovir|lamivudine|zidovudine|nevirapine|dolutegravir|lopinavir|ritonavir|abacavir|emtricitabine|rilpivirine|atazanavir)/i

/** → { group, proposePtc } — group = เหตุผลที่ไม่ควรเสนอออก (null = ไม่เข้ากลุ่ม) */
export function essentialGroup({ type, name, ven }) {
  const t = s(type)
  const n = s(name)
  if (t === 'เวชภัณฑ์มิใช่ยา') return 'ไม่ใช่ยา (ไม่ผ่าน PTC)'
  if (t === 'Herb' || t === 'Herb_สสจ') return 'ยาสมุนไพร (เบิกตามรอบแผนไทย)'
  if (t === 'Narcotic') return 'ยาเสพติด/ระงับปวดผู้ป่วยระยะท้าย'
  if (t === 'Saline') return 'สารละลายให้ทางหลอดเลือด'
  if (PROGRAM.test(n)) return 'ยาโรคติดต่อตามนโยบาย'
  if (t === 'Injection' && ANTI_INFECTIVE.test(n)) return 'ยาต้านเชื้อฉีด'
  if (s(ven) === 'Critical') return 'V — ยาช่วยชีวิต/ฉุกเฉิน'
  return null
}

const SUPPORTED = /(สนับสนุน|บริจาค|โครงการ)/

/**
 * @param stockLots   [{ code, name, type, unit, lot, expDate: Date|null, qty, price, location, itemType, result, supplier }] (Master แถวคงเหลือ > 0)
 * @param dispenses   [{ drug_code, drug_name, dispense_date: 'YYYY-MM-DD', department, qty_out }]
 * @param firstReceive Map(drugKey → 'YYYY-MM-DD') วันรับเข้าครั้งแรกของยา
 * @param ven         Map(code → 'Critical'|'Essential'|'Normal')
 * @param policies    Map(`code|lot` lower → { status, deadlineIso, company, note }) จาก buildCompanyPolicyIndex
 * @param historyStart 'YYYY-MM' เดือนแรกที่มีข้อมูลเบิก (ยาไม่เคยเบิกเลยนับจากตรงนี้)
 * @returns { rows, currentYm, lastCompleteYm } — rows เฉพาะยาที่ไม่มีเบิกใช้ ≥ WATCH_MONTHS · เรียงไม่เคลื่อนไหวนานสุดก่อน
 */
export function buildDeadStock({ stockLots = [], dispenses = [], firstReceive = new Map(), ven = new Map(), policies = new Map(), historyStart, today = new Date() }) {
  const currentYm = ymOf(today)
  const lastCompleteIdx = ymIndex(currentYm) - 1
  const lastUse = new Map()
  const usedThisMonth = new Set()
  const deptUse = new Map() // drugKey → Map(หน่วยงาน → { count, lastYm }) ให้หัวหน้าเห็นว่าใครเคยใช้ (user สั่ง 18/11/2569)
  for (const d of dispenses) {
    if (!(Number(d.qty_out) > 0) || !isRealUsage(d.department)) continue
    const ym = ymOf(d.dispense_date)
    if (!ym) continue
    const k = drugKey(d.drug_code, d.drug_name)
    if (ym === currentYm) usedThisMonth.add(k)
    if (!lastUse.has(k) || ym > lastUse.get(k)) lastUse.set(k, ym)
    if (!deptUse.has(k)) deptUse.set(k, new Map())
    const dm = deptUse.get(k), dept = s(d.department)
    const u = dm.get(dept) || { dept, count: 0, lastYm: ym }
    u.count += 1
    if (ym > u.lastYm) u.lastYm = ym
    dm.set(dept, u)
  }

  const byDrug = new Map()
  for (const l of stockLots) {
    if (!(Number(l.qty) > 0)) continue
    const k = drugKey(l.code, l.name)
    let g = byDrug.get(k)
    if (!g) {
      g = { key: k, code: s(l.code), name: s(l.name), type: s(l.type), unit: s(l.unit), lots: [], qty: 0, value: 0, excluded: false, units: new Set(), locations: new Set(), suppliers: new Set() }
      byDrug.set(k, g)
    }
    const qty = Number(l.qty)
    const value = qty * (Number(l.price) || 0)
    const pol = policies.get(`${s(l.code)}|${s(l.lot)}`.toLowerCase()) || null
    g.lots.push({ ...l, qty, value, policy: pol, supported: SUPPORTED.test(s(l.itemType)) || s(l.type) === 'Herb_สสจ' })
    g.qty += qty
    g.value += value
    g.units.add(s(l.unit))
    if (s(l.location)) g.locations.add(s(l.location))
    if (s(l.supplier) && s(l.supplier) !== '-') g.suppliers.add(s(l.supplier))
    if (s(l.result).includes('ตัดออก')) g.excluded = true
  }

  const rows = []
  for (const g of byDrug.values()) {
    if (usedThisMonth.has(g.key)) continue
    const used = lastUse.get(g.key) || null
    const recv = ymOf(firstReceive.get(g.key)) || null
    const anchor = [used, recv].filter(Boolean).sort().pop() || null
    const neverUsed = !used
    const idle = anchor ? lastCompleteIdx - ymIndex(anchor) : lastCompleteIdx - ymIndex(historyStart) + 1
    const isNew = neverUsed && recv && idle < REPORT_MONTHS
    const tier = idle >= REPORT_MONTHS ? 'report' : idle >= WATCH_MONTHS ? 'watch' : null
    if (!tier) continue

    g.lots.sort((a, b) => (a.expDate?.getTime() ?? 9e15) - (b.expDate?.getTime() ?? 9e15))
    const nearestExp = g.lots.find(x => x.expDate)?.expDate || null
    const returnable = g.lots.filter(x => ['ok', 'due'].includes(x.policy?.status) && !x.supported)
    const deadline = returnable.map(x => x.policy.deadlineIso).filter(Boolean).sort()[0] || null
    const allSupported = g.lots.every(x => x.supported)
    const group = essentialGroup({ type: g.type, name: g.name, ven: ven.get(g.code) })

    let suggestion
    if (returnable.length) suggestion = `คืนบริษัท ${returnable.length}/${g.lots.length} lot${deadline ? ` ภายใน ${deadline}` : ''} · ที่เหลือเร่งใช้/โอน`
    else if (allSupported) suggestion = 'ยาสนับสนุน/บริจาค คืนบริษัทไม่ได้ — โอนหน่วยงานอื่น/เร่งใช้'
    else suggestion = 'เร่งใช้: แจ้งห้องยา/แพทย์ หรือโอน รพ.ข้างเคียง'
    if (group && !group.startsWith('ไม่ใช่ยา')) suggestion = `ยาต้องมีในคลัง — เฝ้าวันหมดอายุ · ${suggestion}`

    let ptc
    if (g.excluded) ptc = 'ตัดออกแล้ว (มติ PTC)'
    else if (group) ptc = `ไม่เสนอ — ${group}`
    else if (tier === 'report') ptc = 'เสนอพิจารณาออกได้'
    else ptc = '-'

    rows.push({
      key: g.key, code: g.code, name: g.name, type: g.type,
      unit: g.units.size === 1 ? g.unit : [...g.units].join(' / '), mixedUnits: g.units.size > 1,
      qty: Math.round(g.qty * 100) / 100, value: Math.round(g.value * 100) / 100,
      lastUseYm: used, firstReceiveYm: recv, idleMonths: idle, neverUsed, isNew: !!isNew, tier,
      nearestExp, returnableLots: returnable.length, returnDeadline: deadline,
      group, ptc, suggestion, excluded: g.excluded, allSupported,
      locations: [...g.locations], suppliers: [...g.suppliers], lots: g.lots,
      // เบิกล่าสุดก่อน แล้วเบิกบ่อยก่อน
      usedBy: [...(deptUse.get(g.key)?.values() || [])].sort((a, b) => b.lastYm.localeCompare(a.lastYm) || b.count - a.count),
    })
  }
  rows.sort((a, b) => b.idleMonths - a.idleMonths || b.value - a.value)
  return { rows, currentYm, lastCompleteYm: ymFromIndex(lastCompleteIdx) }
}
