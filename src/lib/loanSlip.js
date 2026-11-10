// ใบแจ้งยืม / ใบแจ้งรับคืน (ตาราง drug_loan_slip — docs/features/loan-slip.md) — pure ไม่ import supabase
//
// แอปไม่เขียน drug_loan ตรง (Excel ทะเบียน รพ.ยืมยา เป็นตัวจริง — ADR-0027) → ออก "ใบ" สถานะ pending
// Claude ลง Excel ตามใบ (skill /apply-loan-slips) → import:loan → reconcileSlips ปิดใบเอง
// job ที่สร้างที่นี่ = รูปแบบ job.json ของ scripts/loan-slip.mjs (fillLoanSlip ใน loanSlipFill.js กรอกลงใบ)
//   ฟิลด์เสริมที่ฟอร์มไม่ใช้แต่ reconcile/skill ใช้: items[].drugCode · items[].loanId · loanDateIso · loanDoc

export const LN_RE = /^LN-(\d{2})\/(\d{3})$/;
export const SLIP_KIND = { out: 'ใบแจ้งยืม', return: 'ใบแจ้งรับคืน' };
export const SLIP_STATUS = { pending: 'รอลง Excel', applied: 'ลงทะเบียนแล้ว', conflict: 'ทะเบียนไม่ตรงใบ', cancelled: 'ยกเลิก' };

const s = (v) => String(v ?? '').trim();
const normLot = (v) => { const t = s(v); return t === '' ? '-' : t.toUpperCase(); };
const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : NaN; };

// ปีงบประมาณ 2 หลัก (ต.ค. ขึ้นปีงบใหม่) — กติกาเดียวกับ nextLn() ใน scripts/loan-slip.mjs
export function fiscal2(d = new Date()) {
  return (d.getFullYear() + 543 + (d.getMonth() >= 9 ? 1 : 0)) % 100;
}

/** เลข LN ถัดไปของปีงบ จากเลขที่ใช้แล้วทุกแหล่ง (drug_loan.loan_doc + drug_loan_slip.ln รวมใบยกเลิก) */
export function nextLoanNumber(usedDocs = [], d = new Date()) {
  const fy = String(fiscal2(d)).padStart(2, '0');
  let max = 0;
  for (const doc of usedDocs) {
    const m = s(doc).match(LN_RE);
    if (m && m[1] === fy) max = Math.max(max, Number(m[2]));
  }
  return `LN-${fy}/${String(max + 1).padStart(3, '0')}`;
}

/** ISO YYYY-MM-DD → DD/MM/พ.ศ. ('' ถ้าว่าง/อ่านไม่ได้) */
export function isoToThai(iso) {
  const m = s(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${Number(m[1]) + 543}` : '';
}

/** EXP ในระบบ (DD/MM/YYYY ค.ศ.หรือ พ.ศ. · ISO) → DD/MM/พ.ศ. แบบใบยืมเดิม · อ่านไม่ได้ = คืนค่าเดิม */
export function expToThai(exp) {
  const t = s(exp);
  if (!t || t === '-') return '';
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const y = Number(m[3]);
    return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y < 2400 ? y + 543 : y}`;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) { const y = Number(m[1]); return `${m[3]}/${m[2]}/${y < 2400 ? y + 543 : y}`; }
  return t;
}

/** ว.ด.ปป สำหรับชื่อไฟล์ PDF (รูปแบบที่ loan-slip.mjs บังคับ) */
export function fileDateOf(iso, fallback = new Date()) {
  const m = s(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const [y, mo, d] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [fallback.getFullYear(), fallback.getMonth() + 1, fallback.getDate()];
  return `${d}.${mo}.${String(y + 543).slice(-2)}`;
}

export function guessPartyType(name) {
  const t = s(name);
  if (/^รพ\.|โรงพยาบาล|^รพ\s/.test(t)) return 'โรงพยาบาล';
  if (/^บ\.|^บริษัท|จำกัด/.test(t)) return 'บริษัทยา';
  return '';
}

// รหัสไปอยู่ช่องหมายเหตุ ไม่ใส่ต่อท้ายชื่อ — ชื่อ+รหัส 2 บรรทัดดันใบล้นเป็น 2 หน้า (memory loan-slip-print)
export function itemNote(code, note) {
  return [s(code) && s(code) !== '-' ? `รหัส ${s(code)}` : '', s(note)].filter(Boolean).join(' · ');
}

const shortName = (name) => s(name).split(/\s+/).slice(0, 2).join(' ');
const slipTitle = (counterparty, items) => `${s(counterparty)} ${shortName(items[0]?.name)}`.trim();

// ── ใบแจ้งยืม ─────────────────────────────────────────────────────────

/** @returns ข้อความ error แรก หรือ null */
export function validateOutForm(f) {
  if (!['lend', 'borrow'].includes(f?.direction)) return 'เลือกทิศทางการยืม';
  if (!s(f.counterparty)) return 'กรอกชื่อหน่วยงานคู่สัญญา';
  // ใช้หนังสือ/ใบขอยืมของคู่สัญญา (ไม่ออก LN — memory loan-slip-print) → ทะเบียน C = เลขหนังสือ · N = วันที่ยืม
  //   ใบจับคู่ทะเบียนด้วย 2 ค่านี้ จึงต้องมีทั้งคู่ (เลขหนังสือซ้ำได้ เช่น "แบบฟอร์มขอยืมยา")
  if (f.partyDoc) {
    if (!s(f.partyDocNo)) return 'กรอกเลขที่หนังสือ/ชื่อแบบฟอร์มของคู่สัญญา';
    if (LN_RE.test(s(f.partyDocNo))) return 'เลข LN เป็นเลขที่แอปออก — ถ้าใช้ใบของเรา เอาติ๊ก "ใช้ใบของคู่สัญญา" ออก';
    if (!s(f.slipDate)) return 'ระบุวันที่ยืม (ใช้จับคู่กับทะเบียน)';
  }
  const items = f.items || [];
  if (items.length === 0) return 'เพิ่มรายการยาอย่างน้อย 1 รายการ';
  const lotUsed = new Map();
  for (const [i, it] of items.entries()) {
    const n = `รายการที่ ${i + 1}`;
    if (!s(it.name)) return `${n}: กรอกชื่อยา`;
    if (!(num(it.qty) > 0)) return `${n}: จำนวนต้องมากกว่า 0`;
    if (!s(it.unit)) return `${n}: กรอกหน่วย`;
    if (s(it.price) !== '' && !(num(it.price) >= 0)) return `${n}: ราคาต่อหน่วยไม่ถูกต้อง`;
    if (f.direction === 'lend' && it.stockQty != null) {
      // lot เดียวกันเพิ่ม 2 แถว — รวมจำนวนก่อนเทียบคงเหลือ
      const k = `${s(it.code)}|${normLot(it.lot)}`;
      const tot = (lotUsed.get(k) || 0) + num(it.qty);
      lotUsed.set(k, tot);
      if (tot > num(it.stockQty)) return `${n}: ให้ยืมเกินคงเหลือ lot นี้ (${it.stockQty})`;
    }
  }
  if (f.reason?.pick === 'other' && !s(f.reason.text)) return 'ระบุเหตุผลที่ยืม (อื่นๆ)';
  if (f.returnTerm?.pick === 'date' && !s(f.returnTerm.date)) return 'ระบุวันที่กำหนดคืน';
  if (f.returnTerm?.pick === 'other' && !s(f.returnTerm.text)) return 'ระบุกำหนดการส่งคืน (อื่นๆ)';
  if (f.partyType === 'อื่นๆ' && !s(f.partyOther)) return 'ระบุประเภทคู่สัญญา (อื่นๆ)';
  return null;
}

export function buildOutJob(f, ln, now = new Date()) {
  const items = (f.items || []).map(it => ({
    name: s(it.name), code: '', drugCode: s(it.code), lot: s(it.lot) || '-', exp: expToThai(it.exp),
    qty: num(it.qty), unit: s(it.unit), price: s(it.price) === '' ? 0 : num(it.price), note: itemNote(it.code, it.note),
  }));
  const t = f.returnTerm || {};
  const p = f.responsible || {};
  return {
    kind: 'out', ln: ln || '', loanDoc: ln || s(f.partyDocNo) || null,
    fileDate: fileDateOf(f.slipDate, now), title: slipTitle(f.counterparty, items),
    slipDate: isoToThai(f.slipDate), loanDateIso: s(f.slipDate) || null,
    direction: f.direction, counterparty: s(f.counterparty),
    partyType: s(f.partyType), partyOther: s(f.partyOther),
    coordinator: s(f.coordinator), phone: s(f.phone), courier: s(f.courier),
    reason: f.reason?.pick ? { pick: f.reason.pick, text: s(f.reason.text) } : {},
    returnTerm: t.pick ? { pick: t.pick, po: s(t.po), eta: s(t.eta), date: isoToThai(t.date), text: s(t.text) } : {},
    responsible: p.pick ? { pick: p.pick, who: s(p.who), date: isoToThai(p.date) } : {},
    items,
  };
}

// ── ใบแจ้งรับคืน ──────────────────────────────────────────────────────

/** กลุ่มของใบยืมเดียวกัน = ทิศ + คู่สัญญา + เลขที่ใบยืม + วันที่ยืม (ใบที่ไม่มี LN ก็จับกลุ่มได้) */
export function loanGroupKey(r) {
  return [r.direction, s(r.counterparty), s(r.loan_doc), s(r.loan_date)].join('|');
}

/**
 * picks = { [loanId]: { checked, lotReturned, exp, qty } } · groupRows = แถวค้างคืนทั้งกลุ่ม
 * @returns {{ result: string[], partialLeft: string, error: string|null }}
 */
export function deriveReturnResult(groupRows = [], picks = {}) {
  let left = 0, otherLot = false, any = false;
  for (const r of groupRows) {
    const p = picks[r.id];
    if (!p?.checked) { left++; continue; }
    any = true;
    const q = num(p.qty);
    if (!(q > 0)) return { result: [], partialLeft: '', error: `${r.drug_name}: จำนวนที่คืนต้องมากกว่า 0` };
    if (num(r.qty) > 0 && q > num(r.qty)) return { result: [], partialLeft: '', error: `${r.drug_name}: คืนเกินจำนวนที่ยืม (${r.qty})` };
    if (num(r.qty) > 0 && q < num(r.qty)) left++;
    if (normLot(p.lotReturned || r.lot) !== normLot(r.lot)) otherLot = true;
  }
  if (!any) return { result: [], partialLeft: '', error: 'เลือกรายการที่คืนอย่างน้อย 1 รายการ' };
  const result = [left > 0 ? 'partial' : 'full'];
  if (otherLot) result.push('otherLot');
  return { result, partialLeft: left > 0 ? String(left) : '', error: null };
}

export function buildReturnJob(f, groupRows = [], picks = {}, now = new Date()) {
  const { result, partialLeft, error } = deriveReturnResult(groupRows, picks);
  if (error) throw new Error(error);
  const head = groupRows[0] || {};
  const doc = s(head.loan_doc);
  const isLn = LN_RE.test(doc);
  const items = groupRows.filter(r => picks[r.id]?.checked).map(r => {
    const p = picks[r.id];
    return {
      loanId: r.id, drugCode: s(r.drug_code), name: s(r.drug_name), code: '',
      lot: s(r.lot) || '-', lotReturned: s(p.lotReturned) || s(r.lot) || '-',
      exp: expToThai(p.exp ?? r.exp), qty: num(p.qty), unit: s(r.unit),
      price: num(r.price_per_unit) >= 0 ? num(r.price_per_unit) : 0, note: itemNote(r.drug_code, ''),
    };
  });
  const q = f.returner || {};
  return {
    kind: 'return', ln: isLn ? doc : '', loanDoc: doc || null,
    fileDate: fileDateOf(f.slipDate, now), title: slipTitle(head.counterparty, items),
    slipDate: isoToThai(f.slipDate), loanDate: isoToThai(head.loan_date), loanDateIso: s(head.loan_date) || null,
    direction: head.direction, counterparty: s(head.counterparty),
    partyType: s(f.partyType), partyOther: s(f.partyOther), coordinator: s(f.coordinator), courier: s(f.courier),
    result, partialLeft,
    returner: q.pick ? { pick: q.pick, who: s(q.who), when: isoToThai(q.when) } : {},
    // ใบยืมของคู่ยืม (ไม่มี LN) — ช่อง "อ้างถึงใบยืมเลขที่ LN" กรอกไม่ได้ จึงอ้างในหมายเหตุ
    note: [!isLn && doc ? `อ้างถึงใบยืม ${doc}` : '', s(f.note)].filter(Boolean).join(' · '),
    items,
  };
}

// ── สถานะใบ ↔ ทะเบียน (drug_loan = Excel ล่าสุด) ─────────────────────────

/** Map(loanId → ใบแจ้งรับคืนที่ยังเปิด) — แถวที่มีใบค้างขึ้นป้าย "แจ้งคืนแล้ว รอลง Excel" แทนปุ่มคืน */
export function openReturnByLoanId(slips = []) {
  const m = new Map();
  for (const sl of slips) {
    if (sl.kind !== 'return' || !['pending', 'conflict'].includes(sl.status)) continue;
    for (const id of sl.loan_ids || []) m.set(Number(id), sl);
  }
  return m;
}

/**
 * เทียบใบที่ยังเปิด (pending + conflict — conflict ที่แก้ทะเบียนแล้วต้องปิดได้) กับ drug_loan หลังนำเข้า
 *   → { applied: [{ id, loan_ids }], conflict: [{ id, note }], pending: [id] }
 *  ใบแจ้งยืม: หาแถวทะเบียนด้วยเลขใบ (LN ของเรา หรือเลขหนังสือคู่สัญญา + วันที่ยืม — เลขหนังสือซ้ำได้)
 *    ยังไม่มี = pending · รายการตรงครบ (lot + จำนวน) = applied · ไม่ตรง = conflict
 *  ใบแจ้งรับคืน: ทุกรายการคืนแล้ว = applied · ยังไม่มี = pending
 *    คืนบางส่วนแล้วแยกแถว (qty อยู่ใน key นำเข้า → แถวคืนเป็น id ใหม่ แถวเดิมอาจค้าง/หาย) → ถือว่าคืนแล้วถ้ามีแถว
 *    ทิศ+คู่สัญญา+รหัส+lot+วันยืมตรงที่ลงวันคืนแล้ว · แถวเดิมหายและไม่มีแถวคืนแทน = conflict
 */
export function reconcileSlips(slips = [], loans = []) {
  const out = { applied: [], conflict: [], pending: [] };
  const byId = new Map(loans.map(l => [Number(l.id), l]));
  for (const sl of slips) {
    if (!['pending', 'conflict'].includes(sl.status)) continue;
    const job = sl.job || {};
    if (sl.kind === 'out') {
      const doc = s(sl.ln) || s(job.loanDoc);
      const byLn = LN_RE.test(doc);
      const rows = doc ? loans.filter(l => s(l.loan_doc) === doc && l.direction === sl.direction
        && (byLn || s(l.loan_date) === s(job.loanDateIso))) : [];
      if (rows.length === 0) { out.pending.push(sl.id); continue; }
      const used = new Set();
      const miss = [];
      for (const it of job.items || []) {
        const hit = rows.find(r => !used.has(r.id) && normLot(r.lot) === normLot(it.lot) && num(r.qty) === num(it.qty)
          && (!s(it.drugCode) || !s(r.drug_code) || s(r.drug_code) === s(it.drugCode)));
        if (hit) used.add(hit.id); else miss.push(`${it.name} lot ${it.lot} ${it.qty}`);
      }
      if (miss.length) out.conflict.push({ id: sl.id, note: `ทะเบียนมี ${doc} แต่รายการไม่ตรงใบ: ${miss.join(', ')}` });
      else out.applied.push({ id: sl.id, loan_ids: [...used] });
      continue;
    }
    // return
    let allReturned = true;
    const lost = [];
    for (const it of job.items || []) {
      const row = byId.get(Number(it.loanId));
      if (row?.return_date) continue;
      const alt = loans.find(l => l.direction === sl.direction && s(l.counterparty) === s(sl.counterparty)
        && s(l.drug_code) === s(it.drugCode) && normLot(l.lot) === normLot(it.lot)
        && s(l.loan_date) === s(job.loanDateIso) && l.return_date);
      if (alt) continue;
      if (row) allReturned = false;
      else lost.push(`${it.name} lot ${it.lot} (#${it.loanId})`);
    }
    if (lost.length) out.conflict.push({ id: sl.id, note: `รายการยืมหายจากทะเบียน: ${lost.join(', ')}` });
    else if (allReturned) out.applied.push({ id: sl.id, loan_ids: sl.loan_ids || [] });
    else out.pending.push(sl.id);
  }
  return out;
}
