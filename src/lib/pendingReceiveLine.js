// ข้อความไลน์ "รายการยารอตรวจรับ" — โมดอลรอตรวจรับบน Dashboard (PendingReceiveModal)
// pure (ไม่ import supabase) · rows = ชุดเดียวกับที่การ์ด/ใบพิมพ์/Excel ใช้ (Rule #6)
// จัดกลุ่มตามบิล (เลขบิล+วันรับ — key เดียวกับ summarizePending ใน trackingPrint.js) ผู้ตรวจรับตรวจทีละบิล

const blank = (v) => { const s = String(v ?? '').trim(); return s === '' || s === '-'; };

const fmtThaiIso = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
};

const fmtQty = (qty, unit) => {
  const n = Number(String(qty ?? '').replace(/,/g, ''));
  const q = Number.isFinite(n) && !blank(qty) ? n.toLocaleString('th-TH') : (blank(qty) ? '-' : String(qty).trim());
  return blank(unit) ? q : `${q} x ${String(unit).trim()}`;
};

const waitText = (d) => (d == null ? 'ไม่ทราบวันรับ' : d === 0 ? 'รับวันนี้' : `รอมา ${d} วัน`);

/**
 * @param {Array} rows  { name, code, lot, exp, qty, unit, location, invoice, po, supplier, receive_date, waitDays }
 *                      เรียงรอนานสุดก่อนแล้ว (fetchDashboardAlerts)
 * @param {object} [o]
 * @param {Date}   [o.today]
 * @param {string} [o.filterNote]  เช่น 'คำค้น "para"' — ไม่ว่าง = บอกว่าไม่ใช่รายการทั้งหมด
 */
export function pendingReceiveLineText(rows, { today = new Date(), filterNote = '' } = {}) {
  const groups = new Map();
  for (const r of rows) {
    const key = blank(r.invoice) ? `nobill|${r.receive_date || ''}|${r.supplier || ''}` : `${String(r.invoice).trim()}|${r.receive_date || ''}`;
    if (!groups.has(key)) groups.set(key, { head: r, items: [] });
    groups.get(key).items.push(r);
  }
  const over7 = rows.filter(r => r.waitDays != null && r.waitDays > 7).length;
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const lines = [`รายการยารอตรวจรับ ณ ${fmtThaiIso(todayIso)}`];
  if (filterNote) lines.push(`(กรอง: ${filterNote})`);
  lines.push(`รวม ${rows.length} lot · ${groups.size} บิล${over7 ? ` · รอเกิน 7 วัน ${over7} lot` : ''}`);
  let i = 0;
  for (const { head, items } of groups.values()) {
    i += 1;
    const bill = blank(head.invoice) ? 'ไม่มีเลขบิล' : `บิล ${String(head.invoice).trim()}`;
    const top = [bill, !blank(head.supplier) && String(head.supplier).trim(), !blank(head.po) && `PO ${String(head.po).trim()}`].filter(Boolean).join(' · ');
    const recv = head.receive_date ? `รับ ${fmtThaiIso(head.receive_date)} · ` : '';
    lines.push('', `${i}) ${top}`, `   ${recv}${waitText(head.waitDays)}`);
    for (const r of items) {
      const parts = [`- ${String(r.name ?? '-').trim()}`];
      if (!blank(r.lot)) parts.push(`lot ${String(r.lot).trim()}`);
      parts.push(fmtQty(r.qty, r.unit));
      if (!blank(r.location)) parts.push(String(r.location).split(',').map(s => s.trim()).filter(Boolean).join(', '));
      lines.push(`   ${parts.join(' · ')}`);
    }
  }
  return lines.join('\n');
}
