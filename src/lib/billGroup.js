// billGroup.js — จัดกลุ่ม receive_logs rows เป็น "บิลจริง" สำหรับ AP workflow
// แยกออกจาก db.js เพราะเป็น pure (ไม่พึ่ง supabase) → unit-test ได้ด้วย node ตรงๆ
// ดู docs/features/ap-workflow.md + CLAUDE.md rule #19

// Identity ของ "บิลจริง" = bill_number + supplier + receive_date (ผูกกับครั้งที่รับ)
// เลขบิลไม่ unique: ซ้ำได้ทั้งคนละบริษัท (group A) และบริษัทเดียวคนละวัน (group B)
// บิลที่ bill_number ว่าง/'-' → key ด้วย id แยกทุกแถว (ไม่ collapse รวมกัน)
export function billGroupKey(r) {
  const billNo = (r.bill_number || '').trim()
  const hasBill = billNo && billNo !== '-'
  if (!hasBill) return `__nobill__${r.id ?? Math.random()}`
  return `${billNo}|${(r.supplier_current || '').trim()}|${r.receive_date || ''}`
}

// Group rows by บิลจริง (composite key) — ใช้ใน UI tabs
// แต่ละ group มี item_ids (row id ทุกแถว) ใช้เป็น identifier ส่งเข้า AP action แทน bill_number
export function groupRowsByBill(rows) {
  const map = new Map()
  for (const r of rows) {
    const billNo = (r.bill_number || '').trim()
    const hasBill = billNo && billNo !== '-'
    const bill = hasBill ? billNo : '-'
    const key = billGroupKey(r)
    if (!map.has(key)) {
      map.set(key, {
        _key: key,
        item_ids: [],
        bill_number: bill,
        supplier: r.supplier_current || '-',
        receive_date: r.receive_date,
        ap_stage: r.ap_stage,
        ap_batch_id: r.ap_batch_id,
        acknowledged_at: r.acknowledged_at,
        acknowledged_by: r.acknowledged_by,
        inspected_at: r.inspected_at,
        inspected_by: r.inspected_by,
        inspect_meta: r.inspect_meta,
        ap_sent_at: r.ap_sent_at,
        ap_sent_by: r.ap_sent_by,
        ap_posted_at: r.ap_posted_at,
        ap_posted_by: r.ap_posted_by,
        items: [],
        item_count: 0,
        drug_codes: new Set(),
        drug_count: 0,
        total_value: 0,
      })
    }
    const g = map.get(key)
    g.items.push(r)
    if (r.id != null) g.item_ids.push(r.id)
    g.item_count += 1
    const code = (r.drug_code && r.drug_code !== '-') ? r.drug_code : (r.drug_name || '').toLowerCase()
    if (code) g.drug_codes.add(code)
    const qty = parseFloat(r.qty_received) || 0
    const price = parseFloat(r.price_per_unit) || 0
    const lineValue = (r.total_price_vat != null && r.total_price_vat > 0)
      ? parseFloat(r.total_price_vat) : qty * price
    g.total_value += lineValue
    if (g.receive_date == null || (r.receive_date && r.receive_date > g.receive_date)) g.receive_date = r.receive_date
  }
  // finalize drug_count + remove Set
  for (const g of map.values()) { g.drug_count = g.drug_codes.size; delete g.drug_codes; }
  return Array.from(map.values()).sort((a, b) => (b.receive_date || '').localeCompare(a.receive_date || ''))
}
