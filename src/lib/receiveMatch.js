// จับคู่รายการ inventory กับประวัติรับยา (receive_logs จาก fetchDrugDetails) — pure module (no supabase)
// ใช้ร่วม AppRoot.jsx (SwapReturnPopup/ExpiryAlertSection) + App.jsx (โมดอลแผนผัง) — ย้ายมาจาก AppRoot 2026-07-19
// เพื่อเลี่ยง circular import (AppRoot import App อยู่แล้ว) และกัน copy ดริฟต์แบบ IsoDateInput

// normalize วันหมดอายุ (DD/MM/YYYY, DD/M/YYYY, ISO) → YYYY-MM-DD เพื่อเทียบข้าม format
// (inventory เก็บ "14/8/2026" แต่ receive_logs เก็บ "14/08/2026" — เทียบดิบไม่ตรง)
export function normExpDate(raw) {
  const s = (raw || '').trim();
  if (!s || s === '-') return '';
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const iso = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  return s;
}

// บิลใน receive_logs ที่ match item — scope แคบ→กว้าง: (1) รหัส+lot+exp (2) รหัส+lot (3) รหัส
// คืน { rows, scope } — scope บอกว่าข้อมูลตรง lot จริง หรือระดับรหัส (lot ไม่มีใน log)
// ⚠️ helper นี้ต้องคง fallback กว้างไว้ (supplierForLot/เติมบริษัท-นโยบาย พึ่งระดับรหัส) —
// ความ strict อยู่ที่ชั้นแสดงผล (ReceiveHistoryDetail โชว์การ์ดบิลเฉพาะ scope 'code_lot_exp')
// ดู CONTEXT.md §บิลอ้างอิงของ lot (Receive-Bill Evidence)
export function matchReceiveDetails(drugDetails, item) {
  if (!drugDetails) return { rows: [], scope: 'none' };
  const code = (item.code || '-').trim().toLowerCase();
  const lot  = (item.lot  || '-').trim().toLowerCase();
  const exp  = normExpDate(item.exp);
  const all  = Object.values(drugDetails);
  const byCodeLot = all.filter(d => (d._code || '').toLowerCase() === code && (d._lot || '').toLowerCase() === lot);
  if (byCodeLot.length) {
    const byExp = exp ? byCodeLot.filter(d => normExpDate(d._exp) === exp) : [];
    if (byExp.length) return { rows: byExp, scope: 'code_lot_exp' };
    return { rows: byCodeLot, scope: 'code_lot' };
  }
  const byCode = all.filter(d => (d._code || '').toLowerCase() === code);
  return { rows: byCode, scope: byCode.length ? 'code_only' : 'none' };
}
