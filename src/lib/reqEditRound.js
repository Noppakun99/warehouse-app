// ผู้เบิกแก้ใบเบิกที่ส่งแล้ว 1 รอบ = แก้จำนวน/หมายเหตุ + ตัดรายการ (ใส่ 0) + เพิ่มยาใหม่
// กฎ CONTEXT §เลขรับใบเบิก (grill 24/11/2569): เพิ่มได้ช่วงเดียวกับแก้จำนวน · ประเภทเดียวกับใบ ·
// ด่านเดียวกับส่งใบใหม่ ชน = ถอยทั้งรอบ · ยาซ้ำในใบเพิ่มไม่ได้ (แก้จำนวนบรรทัดเดิม) · กระดิ่งบอกยาที่เพิ่ม/ตัด
// pure module: ไม่ import supabase → golden-testable (npm run test:reqedit)
//
// line = แถวใน editDraft.items — รายการเดิมมี id · บรรทัดที่เพิ่มในรอบนี้มี _new: true (ยังไม่มี id)
// keyOf = codeKey ของ RequisitionApp (ส่งเข้ามาแทน import กันกฎ normalize รหัสแตกเป็น 2 ชุด)

const nameNorm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// ตัวตนของยา 1 บรรทัด — รหัสก่อน · ไม่มีรหัส ('-'/ว่าง) ใช้ชื่อ
export function lineKey(code, name, keyOf) {
  const k = keyOf(code);
  return k ? `c:${k}` : `n:${nameNorm(name)}`;
}

// ยาที่เพิ่มแล้วซ้ำกับรายการในใบ หรือซ้ำกันเองในรอบนี้ → ชื่อยา (ว่าง = ไม่ซ้ำ)
export function duplicateAdded(lines = [], keyOf) {
  const seen = new Set(lines.filter(l => !l._new).map(l => lineKey(l.drug_code, l.drug_name, keyOf)));
  const dup = [];
  for (const l of lines.filter(x => x._new)) {
    const k = lineKey(l.drug_code, l.drug_name, keyOf);
    if (seen.has(k)) dup.push(l.drug_name);
    seen.add(k);
  }
  return dup;
}

// แผนบันทึก 1 รอบ · gotIds = id รายการ "ได้ยาไปแล้ว" (จำนวน 0 ตั้งแต่ส่ง — ไม่ใช่การตัด ห้ามลบ)
// บรรทัดใหม่ที่แก้เป็น 0 = ทิ้งก่อนบันทึก (ยังไม่อยู่ในใบ ไม่ต้องลบ)
export function splitEditRound(lines = [], gotIds = new Set()) {
  const existing = lines.filter(l => !l._new);
  const added = lines.filter(l => l._new && Number(l.requested_qty) > 0);
  const removed = existing.filter(l => Number(l.requested_qty) === 0 && !gotIds.has(l.id));
  return {
    updates: existing.map(l => ({ id: l.id, requested_qty: Number(l.requested_qty), note: l.note || null })),
    inserts: added.map(l => ({
      drug_code: l.drug_code, drug_name: l.drug_name, drug_unit: l.drug_unit || null, drug_type: l.drug_type || null,
      requested_qty: Number(l.requested_qty), item_note: l.item_note?.trim() || null,
      entry_pack: l.entry_unit ? l.entry_pack : null, entry_unit: l.entry_unit || null,
    })),
    added,
    removed,
    // ตัดจนไม่เหลือรายการ = ให้กดลบใบแทน (บรรทัด "ได้ยาไปแล้ว" ไม่นับว่าถูกตัด)
    allRemoved: existing.length + added.length > 0 && existing.length - removed.length + added.length === 0,
  };
}

// ยาที่เพิ่มแล้วขอเกินคงเหลือตั้งแต่ก่อนบันทึก = ผู้เบิกตั้งใจขอเกิน (ขอได้เสมอ) → ไม่เข้าด่านถอยทั้งรอบ
// กฎเดียวกับ overAtSubmit ของการส่งใบใหม่ · invBase/reservedOther = { [codeKey]: หน่วยย่อยสุด } (ใบอื่น ไม่รวมใบนี้)
export function overBeforeSave(added = [], invBase = {}, reservedOther = {}, keyOf) {
  const own = {};
  added.forEach(l => { const k = keyOf(l.drug_code); if (k) own[k] = (own[k] || 0) + (Number(l.requested_qty) || 0); });
  return new Set(Object.keys(own).filter(k => own[k] > Math.max(0, (invBase[k] ?? 0) - (reservedOther[k] ?? 0))));
}

// รายการเดิมที่ผู้เบิก "เพิ่มจำนวน" จนเกินคงเหลือ → เตือนให้กดยืนยันอีกครั้ง (ขอได้เสมอ ไม่บล็อก — user ตัดสิน 25/11/2569)
// ไม่แตะจำนวน/ลดลง = ไม่เตือน (ขอเกินตั้งแต่ส่งใบ ผู้เบิกเห็นคำเตือนในตะกร้าแล้ว — เดิมบล็อกทั้งใบ เพิ่มยา/แก้หมายเหตุไม่ได้)
export function increasedOver(original = [], existing = [], invBase = {}, reservedOther = {}, keyOf) {
  const sum = (rows) => rows.reduce((m, r) => {
    const k = keyOf(r.drug_code);
    if (k) m[k] = (m[k] || 0) + (Number(r.requested_qty) || 0);
    return m;
  }, {});
  const b = sum(original), a = sum(existing);
  return Object.keys(a)
    .filter(k => a[k] > (b[k] || 0))
    .map(k => ({ key: k, own: a[k], available: Math.max(0, (invBase[k] ?? 0) - (reservedOther[k] ?? 0)),
      name: existing.find(l => keyOf(l.drug_code) === k)?.drug_name || k, unit: existing.find(l => keyOf(l.drug_code) === k)?.drug_unit || '' }))
    .filter(o => o.own > o.available);
}

// รหัสที่ต้องตรวจยอดจองซ้ำหลังบันทึก (ADR-0028) = จำนวนเพิ่มขึ้นจากเดิม (รวมยาที่เพิ่มใหม่) ยกเว้นที่ขอเกินตั้งแต่ก่อนบันทึก
export function postCheckKeys(original = [], lines = [], overNew = new Set(), keyOf) {
  const sum = (rows) => rows.reduce((m, r) => {
    const k = keyOf(r.drug_code);
    if (k) m[k] = (m[k] || 0) + (Number(r.requested_qty) || 0);
    return m;
  }, {});
  const b = sum(original);
  const a = sum(lines.filter(l => !l._new || Number(l.requested_qty) > 0));
  return Object.keys(a).filter(k => a[k] > (b[k] || 0) && !overNew.has(k));
}

// คืนใบเป็นแบบก่อนแก้ (ชนกับหน่วยงานอื่น) = จำนวน/หมายเหตุเดิม + ลบบรรทัดที่เพิ่งเพิ่ม
export function rollbackRound(original = [], insertedIds = []) {
  return {
    updates: original.map(i => ({ id: i.id, requested_qty: i.requested_qty, note: i.note || null })),
    deleteIds: insertedIds,
  };
}

// details ของ audit requester_edit_requisition (กระดิ่งบอกยาที่เพิ่ม/ตัด — grill ข้อ 5)
export function editAuditDetails({ req, department, removed = [], added = [] }) {
  return {
    requisition_id: req.id,
    req_number: req.req_number,
    req_department: department,
    ...(removed.length ? { removed_items: removed.map(l => l.drug_name) } : {}),
    ...(added.length ? { added_items: added.map(l => l.drug_name) } : {}),
  };
}

// "เพิ่ม A, B · ตัด C" จาก details (ใบเก่าไม่มี = '')
export function editChangeText(d = {}) {
  const parts = [];
  if (d.added_items?.length) parts.push(`เพิ่ม ${d.added_items.join(', ')}`);
  if (d.removed_items?.length) parts.push(`ตัด ${d.removed_items.join(', ')}`);
  return parts.join(' · ');
}

// จำนวนในโมดอลแก้ใบเป็นหน่วยคีย์ (8 × 1000เม็ด แทน 8000) — หารไม่ลงตัว = หน่วยย่อยแบบเดิม
export function packView(base, packSize) {
  const b = Number(base) || 0, ps = Number(packSize) || 1;
  return ps > 1 && b % ps === 0 ? { qty: b / ps, pack: ps } : { qty: b, pack: 1 };
}
