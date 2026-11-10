// ใบแจ้งยืม / ใบแจ้งรับคืน (docs/features/loan-slip.md) — ออกใบสถานะ "รอลง Excel" + พิมพ์ใบที่กรอกแล้ว
// แอปไม่เขียน drug_loan ตรง (Excel ทะเบียน รพ.ยืมยา เป็นตัวจริง) — logic อยู่ lib/loanSlip.js
import { useState, useEffect, useMemo } from 'react';
import { X, Plus, Trash2, Search, Printer, CheckCircle2, AlertTriangle, FileText, Ban } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { createLoanSlip, cancelLoanSlip, fetchDrugSearchIndex, fetchLoanSlipDrug, LOAN_DIRECTION } from './lib/db';
import { searchDrugs } from './lib/drugProfile';
import { printFilledLoanSlip } from './lib/drugLoanForm';
import { SLIP_KIND, SLIP_STATUS, isoToThai, expToThai, guessPartyType, deriveReturnResult } from './lib/loanSlip';

const inputCls = 'w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500';
const labelCls = 'text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1 block';
const boxCls = 'border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2';
const PARTY_TYPES = ['โรงพยาบาล', 'บริษัทยา', 'อื่นๆ'];

const todayIso = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};
const normLot = (v) => String(v ?? '').trim().toUpperCase();

// แสดง DD/MM/พ.ศ. ทับ input date ที่ซ่อนตัวอักษร (Critical Rule #3/#14 — ห้าม showPicker เปล่า)
function IsoDateInput({ value, onChange, placeholder = 'วว/ดด/ปปปป' }) {
  return (
    <div className="relative">
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
        onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* มือถือไม่รองรับ */ } }}
        className={`${inputCls} text-transparent dark:text-transparent`} />
      <span className={`absolute inset-y-0 left-3 flex items-center text-sm pointer-events-none ${value ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}`}>
        {value ? isoToThai(value) : placeholder}
      </span>
    </div>
  );
}

function Radio({ name, value, current, onChange, children }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
      <input type="radio" name={name} checked={current === value} onChange={() => onChange(value)} className="mt-1 accent-sky-600" />
      <span>{children}</span>
    </label>
  );
}

function Sheet({ title, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 z-[55] flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="bg-sky-600 text-white px-5 py-3 rounded-t-2xl flex items-center justify-between shrink-0">
          <p className="font-bold">{title}</p>
          <button type="button" onClick={onClose} aria-label="ปิด" className="text-white/80 hover:text-white bg-white/20 hover:bg-white/30 p-1.5 rounded-lg"><X size={16} /></button>
        </div>
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">{children}</div>
        {footer && <div className="px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

// หลังบันทึก — พิมพ์ด้วยการคลิก (ไม่เปิดหน้าต่างหลัง await → popup blocker)
function SavedView({ slip, onClose }) {
  const [err, setErr] = useState('');
  const print = () => { try { printFilledLoanSlip(slip.job); } catch (e) { setErr(e?.message || 'พิมพ์ไม่สำเร็จ'); } };
  return (
    <Sheet title={`บันทึก${SLIP_KIND[slip.kind]}แล้ว`} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-medium">ปิด</button>
        <button type="button" onClick={print} className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium"><Printer size={15} /> พิมพ์ใบ</button>
      </>}>
      <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl p-3">
        <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-sm text-emerald-800 dark:text-emerald-200 space-y-1">
          <p className="font-bold">{SLIP_KIND[slip.kind]} {slip.ln || slip.job.loanDoc || ''} · {slip.counterparty}</p>
          <p>{slip.job.items.length} รายการ · สถานะ <b>รอลง Excel</b> — คลังลงทะเบียน รพ.ยืมยา แล้วนำเข้า ใบจะปิดเอง</p>
          {slip.kind === 'out' && !slip.ln
            ? <p>ใช้ใบของคู่สัญญาเป็นหลักฐาน — ถ่ายรูปใบที่เซ็นวางโฟลเดอร์พัก <b>ใบคืนยา\</b> (พิมพ์ใบนี้เฉพาะถ้าต้องการ)</p>
            : <p>พิมพ์ใบให้ทุกฝ่ายเซ็น แล้วถ่ายรูปใบที่เซ็นวางโฟลเดอร์พัก <b>ใบคืนยา\</b></p>}
        </div>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </Sheet>
  );
}

// ── ใบแจ้งยืม ─────────────────────────────────────────────────────────
const EMPTY_OUT = {
  direction: 'lend', partyDoc: false, partyDocNo: '', counterparty: '', partyType: '', partyOther: '', coordinator: '', phone: '', courier: '',
  slipDate: todayIso(), reason: { pick: '' }, returnTerm: { pick: '' }, responsible: { pick: '' }, items: [],
};

function DrugPicker({ direction, onAdd }) {
  const [index, setIndex] = useState(null);
  const [q, setQ] = useState('');
  const [drug, setDrug] = useState(null);       // { code, name, lots, prices }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { fetchDrugSearchIndex().then(setIndex).catch(() => setIndex([])); }, []);
  const hits = useMemo(() => (index && q.trim() ? searchDrugs(index, q, 8) : []), [index, q]);

  const pick = async (h) => {
    setBusy(true); setErr('');
    try { setDrug({ code: h.code, name: h.name, ...(await fetchLoanSlipDrug(h.code)) }); }
    catch (e) { setErr(e?.message || 'โหลด lot ไม่สำเร็จ'); }
    finally { setBusy(false); }
  };
  const priceOf = (lot) => {
    const ps = drug?.prices || [];
    const p = ps.find(r => normLot(r.lot) === normLot(lot) && Number(r.price_per_unit) > 0) || ps.find(r => Number(r.price_per_unit) > 0);
    return p ? String(p.price_per_unit) : '';
  };
  const add = (lotRow) => {
    onAdd({
      code: drug?.code || '', name: drug?.name || q.trim(), lot: lotRow?.lot || '', exp: lotRow?.exp || '',
      qty: '', unit: lotRow?.unit || '', price: drug ? priceOf(lotRow?.lot) : '', note: '',
      stockQty: direction === 'lend' && lotRow ? Number(String(lotRow.qty).replace(/,/g, '')) : null,
    });
    setDrug(null); setQ('');
  };

  return (
    <div className={boxCls}>
      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">เพิ่มรายการยา</p>
      {!drug ? (
        <>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={index ? 'ค้นชื่อยา / รหัส / lot' : 'กำลังโหลดรายการยา…'}
              className={`${inputCls} pl-9`} />
          </div>
          {hits.length > 0 && (
            <div className="space-y-1">
              {hits.map(h => (
                <button key={h.code} type="button" onClick={() => pick(h)} disabled={busy}
                  className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-sm">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{h.name}</span>
                  <span className="text-[11px] text-slate-400 ml-1">[{h.code}]{h.inStock ? '' : ' · ไม่มีของในคลัง'}</span>
                </button>
              ))}
            </div>
          )}
          {direction === 'borrow' && q.trim() && (
            <button type="button" onClick={() => add(null)} className="text-[12px] text-sky-600 dark:text-sky-400 hover:underline">
              ไม่มีในรายการ (เช่น ยานอกบัญชี) — เพิ่ม "{q.trim()}" กรอกเอง
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{drug.name} <span className="text-[11px] text-slate-400">[{drug.code}]</span></p>
          {direction === 'lend' ? (
            drug.lots.length === 0 ? <p className="text-[12px] text-amber-700">ไม่มี lot ที่มีของในคลัง</p> : (
              <div className="space-y-1">
                <p className="text-[11px] text-slate-500">เลือก lot ที่ให้ยืม (เรียงตาม EXP)</p>
                {drug.lots.map(l => (
                  <button key={l.id} type="button" onClick={() => add(l)}
                    className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-[12px] text-slate-700 dark:text-slate-200">
                    Lot <b>{l.lot || '-'}</b> · EXP {expToThai(l.exp) || '-'} · คงเหลือ <b>{l.qty}</b> {l.unit} · {l.location || '-'}
                  </button>
                ))}
              </div>
            )
          ) : (
            <button type="button" onClick={() => add({ unit: drug.lots[0]?.unit || drug.prices[0]?.drug_unit || '' })}
              className="flex items-center gap-1 text-[12px] font-semibold text-sky-600 dark:text-sky-400"><Plus size={13} /> เพิ่ม (กรอก lot/EXP ของที่ได้รับ)</button>
          )}
          <button type="button" onClick={() => setDrug(null)} className="text-[12px] text-slate-500 hover:underline">เลือกยาอื่น</button>
        </>
      )}
      {err && <p className="text-[12px] text-red-600">{err}</p>}
    </div>
  );
}

export function LoanOutSlipModal({ auth, onClose, onSaved }) {
  const [f, setF] = useState(EMPTY_OUT);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(null);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setSub = (k, sk, v) => setF(p => ({ ...p, [k]: { ...p[k], [sk]: v } }));
  const setItem = (i, k, v) => setF(p => ({ ...p, items: p.items.map((it, j) => j === i ? { ...it, [k]: v } : it) }));

  const submit = async () => {
    if (saving) return;
    setSaving(true); setErr('');
    try {
      const row = await createLoanSlip({ kind: 'out', form: f }, auth);
      setSaved(row);
      onSaved?.();
    } catch (e) { setErr(e?.message || 'บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  if (saved) return <SavedView slip={saved} onClose={onClose} />;
  const borrow = f.direction === 'borrow';
  return (
    <Sheet title="ใบแจ้งยืมยา" onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-medium">ยกเลิก</button>
        <button type="button" onClick={submit} disabled={saving || f.items.length === 0}
          className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'กำลังบันทึก…' : f.partyDoc ? 'บันทึกใบแจ้ง' : 'บันทึก + ออกเลขใบยืม'}
        </button>
      </>}>
      <p className="text-[12px] text-slate-500 dark:text-slate-400">แอปออกเลข LN ให้ (ยกเว้นใช้ใบของคู่สัญญา) · ใบสถานะ "รอลง Excel" จนกว่าคลังลงทะเบียน รพ.ยืมยา และตัด/รับยาใน Excel แล้วนำเข้า</p>
      <div className={boxCls}>
        <p className={labelCls}>ทิศทางการยืม *</p>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-6">
          <Radio name="dir" value="lend" current={f.direction} onChange={v => setF(p => ({ ...p, direction: v, items: [] }))}><b>เราให้เขายืม</b> — ของออกจากคลัง</Radio>
          <Radio name="dir" value="borrow" current={f.direction} onChange={v => setF(p => ({ ...p, direction: v, items: [] }))}><b>เรายืมจากเขา</b> — ของเข้าคลัง</Radio>
        </div>
        {/* คู่สัญญาส่งหนังสือ/ใบขอยืมมาเอง → ไม่ออก LN ใช้เลขหนังสือเขาลงทะเบียน (memory loan-slip-print) */}
        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer pt-1">
          <input type="checkbox" checked={f.partyDoc} onChange={e => set('partyDoc', e.target.checked)} className="mt-1 accent-sky-600" />
          <span>ใช้หนังสือ/ใบขอยืมของคู่สัญญา — <b>ไม่ออกเลข LN</b></span>
        </label>
        {f.partyDoc && (
          <div className="pl-6">
            <label className={labelCls}>เลขที่หนังสือ / ชื่อแบบฟอร์มของคู่สัญญา *</label>
            <input value={f.partyDocNo} onChange={e => set('partyDocNo', e.target.value)} className={inputCls} placeholder="เช่น ปท0033.3/822 · แบบฟอร์มขอยืมยา" />
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className={labelCls}>หน่วยงานคู่สัญญา *</label>
          <input value={f.counterparty} onChange={e => setF(p => ({ ...p, counterparty: e.target.value, partyType: p.partyType || guessPartyType(e.target.value) }))} className={inputCls} placeholder="เช่น รพ.ปทุมธานี" /></div>
        <div><label className={labelCls}>ประเภทคู่สัญญา</label>
          <select value={f.partyType} onChange={e => set('partyType', e.target.value)} className={inputCls}>
            <option value="">— เว้นให้ติ๊กมือ —</option>
            {PARTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select></div>
        {f.partyType === 'อื่นๆ' && <div className="sm:col-span-2"><label className={labelCls}>ระบุประเภท</label><input value={f.partyOther} onChange={e => set('partyOther', e.target.value)} className={inputCls} /></div>}
        <div><label className={labelCls}>ผู้ประสานงาน</label><input value={f.coordinator} onChange={e => set('coordinator', e.target.value)} className={inputCls} /></div>
        <div><label className={labelCls}>เบอร์ติดต่อ</label><input value={f.phone} onChange={e => set('phone', e.target.value)} className={inputCls} inputMode="tel" /></div>
        <div><label className={labelCls}>วันที่ยืม (วันส่งมอบ — ว่าง = เขียนมือ)</label><IsoDateInput value={f.slipDate} onChange={v => set('slipDate', v)} /></div>
        <div><label className={labelCls}>ผู้นำส่ง (คนกลาง ถ้ามี)</label><input value={f.courier} onChange={e => set('courier', e.target.value)} className={inputCls} placeholder="เช่น ผู้แทน บ.ดีทแฮล์ม" /></div>
      </div>

      <div className={boxCls}>
        <p className={labelCls}>เหตุผลที่ยืม (ระเบียบฯ ข้อ 210)</p>
        <Radio name="reason" value="shortage" current={f.reason.pick} onChange={v => setSub('reason', 'pick', v)}>ยาขาดคลัง ผู้ป่วยต้องใช้ก่อน — รอของที่สั่งซื้อ</Radio>
        <Radio name="reason" value="urgent" current={f.reason.pick} onChange={v => setSub('reason', 'pick', v)}>ยาใช้เร่งด่วน/ฉุกเฉิน ไม่มีสำรอง</Radio>
        <Radio name="reason" value="help" current={f.reason.pick} onChange={v => setSub('reason', 'pick', v)}>ช่วยเหลือหน่วยงานอื่นที่ขาดยา</Radio>
        <Radio name="reason" value="other" current={f.reason.pick} onChange={v => setSub('reason', 'pick', v)}>อื่นๆ</Radio>
        {f.reason.pick === 'other' && <input value={f.reason.text || ''} onChange={e => setSub('reason', 'text', e.target.value)} className={inputCls} placeholder="ระบุเหตุผล" />}
      </div>

      <div className={boxCls}>
        <p className={labelCls}>กำหนดการส่งคืน (ระเบียบฯ ข้อ 211)</p>
        <Radio name="term" value="po" current={f.returnTerm.pick} onChange={v => setSub('returnTerm', 'pick', v)}>คืนเมื่อของที่สั่งซื้อมาถึง</Radio>
        {f.returnTerm.pick === 'po' && (
          <div className="grid grid-cols-2 gap-2 pl-6">
            <input value={f.returnTerm.po || ''} onChange={e => setSub('returnTerm', 'po', e.target.value)} className={inputCls} placeholder="เลขที่ PO" />
            <input value={f.returnTerm.eta || ''} onChange={e => setSub('returnTerm', 'eta', e.target.value)} className={inputCls} placeholder="คาดว่าของถึง" />
          </div>
        )}
        <Radio name="term" value="date" current={f.returnTerm.pick} onChange={v => setSub('returnTerm', 'pick', v)}>คืนภายในวันที่</Radio>
        {f.returnTerm.pick === 'date' && <div className="pl-6"><IsoDateInput value={f.returnTerm.date} onChange={v => setSub('returnTerm', 'date', v)} /></div>}
        <Radio name="term" value="other" current={f.returnTerm.pick} onChange={v => setSub('returnTerm', 'pick', v)}>อื่นๆ</Radio>
        {f.returnTerm.pick === 'other' && <input value={f.returnTerm.text || ''} onChange={e => setSub('returnTerm', 'text', e.target.value)} className={inputCls} placeholder="ระบุกำหนดคืน" />}
      </div>

      {/* ใครรับผิดชอบการคืน = ฝั่งที่ต้องคืน — เราให้ยืมปล่อยว่าง (memory loan-slip-print) */}
      {borrow && (
        <div className={boxCls}>
          <p className={labelCls}>ใครรับผิดชอบการคืน</p>
          <Radio name="resp" value="store" current={f.responsible.pick} onChange={v => setSub('responsible', 'pick', v)}>ของอยู่ที่คลัง — คลังคืนเอง</Radio>
          <Radio name="resp" value="handover" current={f.responsible.pick} onChange={v => setSub('responsible', 'pick', v)}>ส่งต่อให้ผู้ดูแลรับผิดชอบ (ไม่นับเป็นของค้างคืน — ADR-0025)</Radio>
          {f.responsible.pick === 'handover' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
              <input value={f.responsible.who || ''} onChange={e => setSub('responsible', 'who', e.target.value)} className={inputCls} placeholder="ผู้ดูแล / หน่วยงาน" />
              <IsoDateInput value={f.responsible.date} onChange={v => setSub('responsible', 'date', v)} placeholder="วันที่ส่งต่อ" />
            </div>
          )}
        </div>
      )}

      {f.items.map((it, i) => (
        <div key={i} className={boxCls}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 min-w-0">{i + 1}. {it.name}{it.code && <span className="text-[11px] text-slate-400 ml-1">[{it.code}]</span>}</p>
            <button type="button" onClick={() => setF(p => ({ ...p, items: p.items.filter((_, j) => j !== i) }))} aria-label="ลบรายการ"
              className="p-1.5 rounded-md border border-rose-200 dark:border-rose-900/60 text-rose-500 shrink-0"><Trash2 size={12} /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div><label className={labelCls}>Lot</label><input value={it.lot} onChange={e => setItem(i, 'lot', e.target.value)} className={inputCls} readOnly={!borrow} /></div>
            <div><label className={labelCls}>EXP</label><input value={it.exp} onChange={e => setItem(i, 'exp', e.target.value)} className={inputCls} readOnly={!borrow} placeholder="วว/ดด/ปปปป" /></div>
            <div><label className={labelCls}>จำนวน *{it.stockQty != null ? ` (มี ${it.stockQty})` : ''}</label><input type="number" min="0" step="any" value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>หน่วย *</label><input value={it.unit} onChange={e => setItem(i, 'unit', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>ราคา/หน่วย</label><input type="number" min="0" step="any" value={it.price} onChange={e => setItem(i, 'price', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>หมายเหตุ</label><input value={it.note} onChange={e => setItem(i, 'note', e.target.value)} className={inputCls} /></div>
          </div>
        </div>
      ))}
      <DrugPicker key={f.direction} direction={f.direction} onAdd={(it) => setF(p => ({ ...p, items: [...p.items, it] }))} />
      {err && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle size={14} /> {err}</p>}
    </Sheet>
  );
}

// ── ใบแจ้งรับคืน ──────────────────────────────────────────────────────
// groupRows = แถวค้างคืนของใบยืมเดียวกัน (loanGroupKey) ที่ยังไม่มีใบแจ้งค้าง
export function LoanReturnSlipModal({ auth, groupRows, onClose, onSaved }) {
  const head = groupRows[0] || {};
  const lend = head.direction === 'lend';
  const [f, setF] = useState({ slipDate: todayIso(), partyType: guessPartyType(head.counterparty), partyOther: '', coordinator: '', courier: '', note: '', returner: { pick: '' } });
  const [picks, setPicks] = useState(() => Object.fromEntries(groupRows.map(r => [r.id, { checked: true, lotReturned: r.lot || '', exp: r.exp || '', qty: r.qty ?? '' }])));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(null);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setPick = (id, k, v) => setPicks(p => ({ ...p, [id]: { ...p[id], [k]: v } }));
  const res = useMemo(() => deriveReturnResult(groupRows, picks), [groupRows, picks]);
  const RESULT_LABEL = { full: 'คืนครบตามใบยืม — ปิดรายการ', partial: `คืนบางส่วน — ยังค้างอีก ${res.partialLeft} รายการ`, otherLot: 'คืนด้วย lot อื่น' };

  const submit = async () => {
    if (saving) return;
    setSaving(true); setErr('');
    try {
      const row = await createLoanSlip({ kind: 'return', form: f, groupRows, picks }, auth);
      setSaved(row);
      onSaved?.();
    } catch (e) { setErr(e?.message || 'บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  if (saved) return <SavedView slip={saved} onClose={onClose} />;
  return (
    <Sheet title={lend ? 'ใบแจ้งรับคืนยา (เขาคืนให้เรา)' : 'ใบแจ้งคืนยา (เราคืนให้เขา)'} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-medium">ยกเลิก</button>
        <button type="button" onClick={submit} disabled={saving || !!res.error}
          className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'กำลังบันทึก…' : 'บันทึกใบแจ้ง'}
        </button>
      </>}>
      <div className="text-[12px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-0.5">
        <p><b>{head.counterparty}</b> · {LOAN_DIRECTION[head.direction]}</p>
        <p>ใบยืม {head.loan_doc || '-'} · วันที่ยืม {isoToThai(head.loan_date) || '-'}</p>
        <p className="text-slate-500">ยังไม่ปิดรายการทันที — สถานะ "แจ้งคืนแล้ว รอลง Excel" จนกว่าคลังลงทะเบียน (วันที่รับคืน) แล้วนำเข้า</p>
      </div>

      {groupRows.map(r => {
        const p = picks[r.id];
        return (
          <div key={r.id} className={`${boxCls} ${p.checked ? '' : 'opacity-60'}`}>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={p.checked} onChange={e => setPick(r.id, 'checked', e.target.checked)} className="mt-1 accent-emerald-600" />
              <span className="text-sm text-slate-800 dark:text-slate-100 min-w-0">
                <b>{r.drug_name}</b>{r.drug_code && <span className="text-[11px] text-slate-400 ml-1">[{r.drug_code}]</span>}
                <span className="block text-[11px] text-slate-500">ยืม lot {r.lot || '-'} · EXP {expToThai(r.exp) || '-'} · {r.qty ?? '-'} {r.unit || ''}</span>
              </span>
            </label>
            {p.checked && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><label className={labelCls}>Lot ที่คืนจริง</label><input value={p.lotReturned} onChange={e => setPick(r.id, 'lotReturned', e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>EXP ของที่คืน</label><input value={p.exp} onChange={e => setPick(r.id, 'exp', e.target.value)} className={inputCls} placeholder="วว/ดด/ปปปป" /></div>
                <div><label className={labelCls}>จำนวนที่คืน ({r.unit || 'หน่วย'})</label><input type="number" min="0" step="any" value={p.qty} onChange={e => setPick(r.id, 'qty', e.target.value)} className={inputCls} /></div>
              </div>
            )}
          </div>
        );
      })}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className={labelCls}>วันที่คืน (ว่าง = เขียนมือ)</label><IsoDateInput value={f.slipDate} onChange={v => set('slipDate', v)} /></div>
        <div><label className={labelCls}>ประเภทคู่สัญญา</label>
          <select value={f.partyType} onChange={e => set('partyType', e.target.value)} className={inputCls}>
            <option value="">— เว้นให้ติ๊กมือ —</option>
            {PARTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select></div>
        {f.partyType === 'อื่นๆ' && <div className="sm:col-span-2"><label className={labelCls}>ระบุประเภท</label><input value={f.partyOther} onChange={e => set('partyOther', e.target.value)} className={inputCls} /></div>}
        <div><label className={labelCls}>ผู้ประสานงาน</label><input value={f.coordinator} onChange={e => set('coordinator', e.target.value)} className={inputCls} /></div>
        <div><label className={labelCls}>ผู้นำส่ง (คนกลาง ถ้ามี)</label><input value={f.courier} onChange={e => set('courier', e.target.value)} className={inputCls} placeholder="เช่น ผู้แทน บ.เบอรี่ ยุคเกอร์" /></div>
      </div>

      {/* ใครเป็นผู้คืน = ฝั่งเราที่ต้องคืน — เขาคืนเราปล่อยว่าง */}
      {!lend && (
        <div className={boxCls}>
          <p className={labelCls}>ใครเป็นผู้คืน</p>
          <Radio name="returner" value="store" current={f.returner.pick} onChange={v => setF(p => ({ ...p, returner: { ...p.returner, pick: v } }))}>คลังคืนเอง</Radio>
          <Radio name="returner" value="caretaker" current={f.returner.pick} onChange={v => setF(p => ({ ...p, returner: { ...p.returner, pick: v } }))}>ผู้ดูแลคืนเอง ไม่ผ่านคลัง</Radio>
          {f.returner.pick === 'caretaker' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
              <input value={f.returner.who || ''} onChange={e => setF(p => ({ ...p, returner: { ...p.returner, who: e.target.value } }))} className={inputCls} placeholder="ชื่อผู้ดูแล" />
              <IsoDateInput value={f.returner.when} onChange={v => setF(p => ({ ...p, returner: { ...p.returner, when: v } }))} placeholder="แจ้งคลังเมื่อ" />
            </div>
          )}
        </div>
      )}
      <div><label className={labelCls}>หมายเหตุ</label><input value={f.note} onChange={e => set('note', e.target.value)} className={inputCls} /></div>

      {res.error
        ? <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle size={14} /> {res.error}</p>
        : <p className="text-[12px] text-slate-600 dark:text-slate-300">ผลการคืนบนใบ: <b>{res.result.map(k => RESULT_LABEL[k]).join(' · ')}</b></p>}
      {err && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle size={14} /> {err}</p>}
    </Sheet>
  );
}

// ── ใบที่ยังเปิดอยู่ (รอลง Excel / ไม่ตรงทะเบียน) ─────────────────────────
export function OpenSlipsPanel({ slips, auth, canEdit, onChanged }) {
  const [cancel, setCancel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!slips.length) return null;
  const print = (sl) => { try { setErr(''); printFilledLoanSlip(sl.job); } catch (e) { setErr(e?.message || 'พิมพ์ไม่สำเร็จ'); } };
  const doCancel = async () => {
    setBusy(true);
    try { await cancelLoanSlip(cancel.id, 'ยกเลิกในแอป', auth); setCancel(null); onChanged?.(); }
    catch (e) { setErr(e?.message || 'ยกเลิกไม่สำเร็จ'); setCancel(null); }
    finally { setBusy(false); }
  };
  return (
    <div className="border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 rounded-xl px-4 py-3 space-y-2">
      <p className="text-sm font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5"><FileText size={15} /> ใบแจ้งที่ยังไม่ลง Excel ({slips.length})</p>
      {slips.map(sl => (
        <div key={sl.id} className="flex items-start gap-2 flex-wrap bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-lg px-3 py-2">
          <div className="min-w-0 flex-1 text-[12px] text-slate-700 dark:text-slate-200">
            <p className="font-semibold">
              {SLIP_KIND[sl.kind]} {sl.ln || sl.job?.loanDoc || ''} · {sl.counterparty}
              <span className={`ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${sl.status === 'conflict'
                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60'
                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-900/60'}`}>{SLIP_STATUS[sl.status]}</span>
            </p>
            <p className="text-slate-500 dark:text-slate-400">{(sl.job?.items || []).map(i => `${i.name} ${i.qty} ${i.unit}`).join(' · ')} · {sl.created_by || '-'} {isoToThai(String(sl.created_at || '').slice(0, 10))}</p>
            {sl.status === 'conflict' && sl.note && <p className="text-rose-600 dark:text-rose-300">{sl.note}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => print(sl)} className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"><Printer size={12} /> พิมพ์ใบ</button>
            {canEdit && <button type="button" onClick={() => setCancel(sl)} className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md border border-rose-200 dark:border-rose-900/60 text-rose-600"><Ban size={12} /> ยกเลิกใบ</button>}
          </div>
        </div>
      ))}
      {err && <p className="text-[12px] text-red-600">{err}</p>}
      <ConfirmModal open={!!cancel} tone="danger" loading={busy}
        title="ยกเลิกใบแจ้งนี้?"
        message={cancel ? `${SLIP_KIND[cancel.kind]}${cancel.ln ? ` ${cancel.ln}` : ''} · ${cancel.counterparty}` : ''}
        warning={cancel?.kind === 'out' ? `${cancel.ln ? 'เลขที่ใบยืมนี้ยกเลิกแล้วไม่นำกลับมาใช้ · ' : ''}ถ้าลง Excel ไปแล้วต้องลบแถวในทะเบียนด้วย` : 'ถ้าลง Excel ไปแล้ว ต้องลบวันที่รับคืนในทะเบียนด้วย'}
        confirmText="ยกเลิกใบ" cancelText="ไม่ยกเลิก"
        onConfirm={doCancel} onClose={() => setCancel(null)} />
    </div>
  );
}
