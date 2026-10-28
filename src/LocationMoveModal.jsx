import { useEffect, useMemo, useState } from 'react';
import { MapPin, X, Plus, AlertTriangle, MoveRight, Eye, EyeOff } from 'lucide-react';
import { createLocationMoves, fetchInventoryLocations } from './lib/db';
import { groupPiles, pileKey, splitLoc } from './lib/locationMove';
import { setEq } from './lib/countMatch';
import ConfirmModal from './ConfirmModal';

// ใบแจ้งย้ายที่เก็บ — เจ้าหน้าที่ไปหยิบตามที่เก็บแล้วยาไม่อยู่ที่นั้น (docs/features/location-move.md)
// หน่วยย้าย = กอง (รหัส + lot + ที่เก็บ) · ติ๊กให้ก่อนเฉพาะกองของการ์ดที่กดมา (grill 28/10/2569)
// lot คงเหลือ 0 ซ่อนเป็นค่าเริ่มต้น — กองที่ซ่อนอยู่ไม่นับเป็นที่เลือก (กันติดไปกับใบโดยมองไม่เห็น)
// inventory = object แผนผัง { location: [item] } ที่ overlay ใบ pending แล้ว (ค่าที่เจ้าหน้าที่เห็น)
export default function LocationMoveModal({ item, inventory, auth, onClose, onSaved }) {
  const clickedKey = pileKey(item.code, item.lot, item.location);
  const piles = useMemo(() => {
    const rows = [];
    Object.entries(inventory || {}).forEach(([loc, items]) => (items || []).forEach(it => {
      if ((it.code || '').trim() === (item.code || '').trim() && (it.name || '') === (item.name || '')) {
        rows.push({ code: it.code, name: it.name, lot: it.lot, exp: it.exp, qty: it.qty, location: loc, main_log: it.mainLog });
      }
    }));
    return groupPiles(rows)
      .filter(p => p.qty > 0 || setEq(p.location, item.location))
      .sort((a, b) => (b.key === clickedKey) - (a.key === clickedKey)
        || a.location.localeCompare(b.location, 'th', { numeric: true }) || a.lot.localeCompare(b.lot));
  }, [inventory, item, clickedKey]);

  const [picked, setPicked] = useState(() => new Set(piles.some(p => p.key === clickedKey) ? [clickedKey] : []));
  const [showZero, setShowZero] = useState(false);
  const [locs, setLocs] = useState(() => splitLoc(item.location));
  const [draft, setDraft] = useState('');
  const [known, setKnown] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchInventoryLocations().then(l => { if (alive) setKnown(l || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const addLoc = () => {
    const next = splitLoc(draft);
    if (next.length === 0) return;
    setLocs(prev => [...prev, ...next.filter(x => !prev.includes(x))]);
    setDraft('');
  };
  const removeLoc = (l) => setLocs(prev => prev.filter(x => x !== l));
  const pickLoc = (l) => { setLocs(prev => prev.includes(l) ? prev : [...prev, l]); setDraft(''); };

  const isZero = (p) => p.qty <= 0 && p.key !== clickedKey;
  const visible = piles.filter(p => showZero || !isZero(p));
  const hiddenCount = piles.length - visible.length;
  const toggleZero = () => {
    if (showZero) setPicked(prev => new Set([...prev].filter(k => !piles.some(p => p.key === k && isZero(p)))));
    setShowZero(v => !v);
  };
  const sameShelf = visible.filter(p => setEq(p.location, item.location));
  const canPickShelf = sameShelf.length > 1 && sameShelf.some(p => !picked.has(p.key));
  const pickShelf = () => setPicked(prev => new Set([...prev, ...sameShelf.map(p => p.key)]));

  // ชั้นแนะนำ: ยังไม่พิมพ์ = ชั้นใน MainLog เดียวกับที่เก็บเดิม · พิมพ์แล้ว = กรองตามคำ
  const shelfPrefix = (item.mainLog || '').trim() || (splitLoc(item.location)[0]?.match(/^([A-Za-z]+)-/)?.[1] ?? '');
  const term = draft.trim().toLowerCase();
  const sugg = known.filter(l => !locs.includes(l)
    && (term ? l.toLowerCase().includes(term) : (shelfPrefix && l.startsWith(shelfPrefix + '-')))).slice(0, 8);

  const selected = visible.filter(p => picked.has(p.key));
  const unknown = locs.filter(l => !known.includes(l));
  const unchanged = selected.length > 0 && selected.every(p => setEq(p.location, locs.join(',')));
  const canSave = selected.length > 0 && locs.length > 0 && !unchanged && !saving;
  const toLabel = locs.join(' ,');

  const save = async () => {
    setSaving(true); setError('');
    try {
      await createLocationMoves(selected, locs, auth);
      onSaved?.(selected.length, toLabel);
    } catch (e) {
      setError('บันทึกไม่สำเร็จ: ' + (e?.message || e));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-[55] flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><MoveRight size={18} className="text-indigo-600 dark:text-indigo-400" /> ย้ายที่เก็บ</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{item.code && item.code !== '-' ? `[${item.code}] ` : ''}{item.name}</p>
            <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300 truncate">Lot {item.lot || '-'} · {item.location}</p>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <section>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Lot ที่จะย้าย</p>
              {canPickShelf && (
                <button type="button" onClick={pickShelf} className="text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:underline">เลือกทุก lot ในชั้น {item.location}</button>
              )}
            </div>
            <div className="space-y-2">
              {visible.map(p => (
                <label key={p.key} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${picked.has(p.key) ? 'border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-700'}`}>
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-indigo-600" checked={picked.has(p.key)}
                    onChange={() => setPicked(prev => { const n = new Set(prev); if (n.has(p.key)) n.delete(p.key); else n.add(p.key); return n; })} />
                  <span className="text-sm min-w-0">
                    <span className="font-medium text-slate-800 dark:text-slate-100">Lot {p.lot}</span>
                    {p.key === clickedKey && <span className="ml-2 align-middle px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-600 text-white">lot ที่เลือก</span>}
                    <span className="text-slate-500 dark:text-slate-400"> · exp {p.exp || '-'} · คงเหลือ {p.qty.toLocaleString()}</span>
                    <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300"><MapPin size={13} /> {p.location}</span>
                  </span>
                </label>
              ))}
            </div>
            {(hiddenCount > 0 || showZero) && (
              <button type="button" onClick={toggleZero} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                {showZero ? <EyeOff size={14} /> : <Eye size={14} />}
                {showZero ? 'ซ่อน lot คงเหลือ 0' : `แสดง lot คงเหลือ 0 (${hiddenCount})`}
              </button>
            )}
          </section>

          <section>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">ที่เก็บจริง</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">ย้ายทั้งหมด = ลบชั้นเดิมแล้วเพิ่มชั้นใหม่ · เจอบางส่วนอีกชั้น = เพิ่มชั้น · ชั้นว่างแล้ว = ลบชั้นนั้น</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {locs.map(l => (
                <span key={l} className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full text-sm font-medium bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60">
                  {l}
                  <button onClick={() => removeLoc(l)} aria-label={`เอา ${l} ออก`} className="p-1 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-900"><X size={13} /></button>
                </span>
              ))}
              {locs.length === 0 && <span className="text-sm text-rose-600 dark:text-rose-400">ต้องมีที่เก็บอย่างน้อย 1 ชั้น</span>}
            </div>
            <div className="flex gap-2">
              <input value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLoc(); } }}
                placeholder="พิมพ์หรือเลือกชั้น เช่น D-4-4"
                className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <button onClick={addLoc} disabled={!draft.trim()} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"><Plus size={16} /> เพิ่มชั้น</button>
            </div>
            {/* ปุ่มเรียงใต้ช่อง ไม่ลอยทับ — dropdown ลอยถูกตัดขอบ overflow-y-auto ของตัวโมดอล (เดิม <datalist> = กล่องของเบราว์เซอร์ แต่งไม่ได้) */}
            {sugg.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {sugg.map(l => (
                  <button key={l} type="button" onClick={() => pickLoc(l)} aria-label={`เพิ่มชั้น ${l}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50">
                    <Plus size={12} /> {l}
                  </button>
                ))}
              </div>
            )}
            {unknown.length > 0 && (
              <p className="mt-2 text-sm text-orange-700 dark:text-orange-300 flex items-start gap-1.5"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> ชั้นนี้ยังไม่มีในแผนผัง: {unknown.join(', ')} — ตรวจว่าพิมพ์ถูก</p>
            )}
          </section>

          <p className="text-xs text-slate-500 dark:text-slate-400">แผนผังจะแสดงที่ใหม่ทันที (ป้าย "รอลง Excel") แล้วคลังลงไฟล์ Excel ตามให้ภายหลัง</p>
          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        </div>

        <div className="flex gap-2 justify-end px-5 py-4 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">ยกเลิก</button>
          <button onClick={() => setConfirming(true)} disabled={!canSave} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 disabled:opacity-40">บันทึกการย้าย</button>
        </div>

        {/* อยู่ใน panel ที่ stopPropagation — ไม่งั้นคลิกในกล่องยืนยันทะลุไปปิดโมดอลนี้ */}
        <ConfirmModal
          open={confirming}
          title="ยืนยันย้ายที่เก็บ"
          message={[`ย้าย ${selected.length} lot ไปที่ ${toLabel}`, ...selected.map(p => `• Lot ${p.lot}: ${p.location} → ${toLabel}`)].join('\n')}
          detail="แผนผังเปลี่ยนทันที · ไฟล์ Excel คลังลงตามให้ภายหลัง"
          warning={unknown.length ? `ชั้นที่ยังไม่มีในแผนผัง: ${unknown.join(', ')}` : undefined}
          confirmText="ย้าย"
          loading={saving}
          onConfirm={save}
          onClose={() => setConfirming(false)}
        />
      </div>
    </div>
  );
}
