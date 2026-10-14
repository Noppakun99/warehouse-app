// lotAllocation.js
// จัดสรร lot ตามหลัก FEFO (lot ใกล้หมดอายุก่อน) จากคำขอเป็น "หน่วยย่อยสุด" (เม็ด)
// คืน allocation ราย lot เป็นเม็ด (base) + จำนวนกล่อง (packs) — ADR-0005
// pure module — ไม่ import supabase (test ได้ด้วย node ตรงๆ)
//
// จ่ายเป็น "กล่องเต็ม" ไม่แกะกล่อง: ถ้าคำขอเหลือเศษไม่เต็มกล่อง → ปัดขึ้นเป็นกล่องเต็ม (จ่ายเกิน)
// แล้วรายงาน overBase (จ่ายเกินกี่เม็ด) เพื่อแจ้งผู้เบิก. ปัดเฉพาะ lot สุดท้ายที่ยังขาด.

/**
 * @param requestBase  จำนวนที่ขอ (หน่วยย่อยสุด เช่น เม็ด)
 * @param fefoLots     [{ lot, exp, unit, packSize, packs, base, baseUnit }] เรียง FEFO มาแล้ว
 *                     packs = คงเหลือ (กล่อง), packSize = เม็ด/กล่อง, base = packs×packSize (คงเหลือเม็ด)
 * @returns {
 *   allocation: [{ lot, exp, unit, location, packSize, base, packs }],  // จัดจาก lot ไหน — base=เม็ด, packs=กล่องเต็ม, location=ที่เก็บ
 *   allocatedBase,   // รวมที่จัดได้จริง (เม็ด, เป็นกล่องเต็ม)
 *   shortfallBase,   // ขาด (เม็ด) — 0 ถ้าครบ
 *   overBase,        // จ่ายเกินคำขอ (เม็ด) จากการปัดขึ้นกล่องเต็ม — 0 ถ้าพอดี
 *   fulfilled,       // true ถ้าจัดครบ (รวมเกิน = ครบ)
 * }
 */
export function allocateFefo(requestBase, fefoLots) {
  const req = Math.max(0, Math.floor(parseFloat(requestBase) || 0));
  const allocation = [];
  let remaining = req;

  for (const lot of fefoLots) {
    if (remaining <= 0) break;
    const packSize = lot.packSize || 1;
    const availPacks = Math.floor((lot.base || 0) / packSize); // กล่องเต็มที่มีใน lot นี้
    if (availPacks <= 0) continue;
    // กล่องที่อยากได้ = ปัดขึ้นให้ครอบ remaining (ไม่แกะกล่อง); แต่ไม่เกินที่มี
    const wantPacks = Math.ceil(remaining / packSize);
    const usePacks  = Math.min(availPacks, wantPacks);
    const base = usePacks * packSize;
    allocation.push({ lot: lot.lot, exp: lot.exp, unit: lot.unit, location: lot.location, packSize, base, packs: usePacks });
    remaining -= base; // อาจติดลบ (lot สุดท้ายปัดขึ้น = จ่ายเกิน)
  }

  const allocatedBase = allocation.reduce((s, a) => s + a.base, 0);
  const shortfallBase = Math.max(0, req - allocatedBase);
  const overBase      = Math.max(0, allocatedBase - req);
  return { allocation, allocatedBase, shortfallBase, overBase, fulfilled: shortfallBase === 0 };
}

// ชนิดรายการที่นับเป็น "ยาสนับสนุน" — บริจาค-* / ยาโครงการ ไม่นับ (CONTEXT.md §การจัดสรร lot)
export const SUPPORTED_ITEM_TYPES = ['สนับสนุน', 'สนับสนุน2'];
export const isSupportedLot = (lot) => SUPPORTED_ITEM_TYPES.includes(String(lot?.itemType || '').trim());

// วันนี้ + 6 เดือน (clamp วันสิ้นเดือน: 31/8 → 28/2 ไม่ล้นไปมีนาคม)
const plusSixMonths = (today) => {
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const last = new Date(t.getFullYear(), t.getMonth() + 7, 0).getDate();
  return new Date(t.getFullYear(), t.getMonth() + 6, Math.min(t.getDate(), last));
};

/**
 * เรียง lot ตามลำดับจ่าย (หัวหน้าสั่ง 14/10/2569) แทน FEFO ล้วน:
 *   1) ยาซื้อ (ไม่ใช่สนับสนุน) ที่หมดอายุภายใน 6 เดือน  2) ยาสนับสนุน  3) ที่เหลือ
 *   ภายในกลุ่มเรียง FEFO · lot ไม่มี exp ไว้ท้ายกลุ่ม
 * @param lots      [{ exp, itemType, ... }]
 * @param parseExp  (raw) => Date|null — ตัวแปลง exp ของผู้เรียก (รูปแบบ exp ใน inventory หลายแบบ)
 * @returns array ใหม่ (ไม่แก้ array เดิม)
 */
export function sortLotsForDispense(lots, parseExp, today = new Date()) {
  const limit = plusSixMonths(today);
  const tier = (l, d) => {
    if (isSupportedLot(l)) return 1;
    return d && d <= limit ? 0 : 2;
  };
  return lots
    .map(l => ({ l, d: parseExp(l.exp) }))
    .sort((a, b) => {
      const ta = tier(a.l, a.d), tb = tier(b.l, b.d);
      if (ta !== tb) return ta - tb;
      if (!a.d && !b.d) return 0;
      if (!a.d) return 1;
      if (!b.d) return -1;
      return a.d - b.d;
    })
    .map(x => x.l);
}

/**
 * หมายเหตุ "lot ไม่เรียง exp" — มี lot ที่จ่ายได้ exp ก่อน lot ที่จัดให้ แต่ไม่ได้ใช้/ใช้ไม่หมด
 * @param allocation  ผลจาก allocateFefo (base = เม็ด)
 * @param lots        lot ที่ใช้คำนวณ allocation (มี base, itemType, baseUnit)
 * @returns '' ถ้าเรียง exp ปกติ
 */
export function lotOrderNote(allocation, lots, parseExp, fmtExp = (x) => x) {
  if (!allocation?.length) return '';
  const key = (l) => `${String(l.lot || '').trim()}|${String(l.exp || '').trim()}`;
  const used = {};
  allocation.forEach(a => { used[key(a)] = (used[key(a)] || 0) + (a.base || 0); });
  const usedDates = allocation.map(a => parseExp(a.exp)).filter(Boolean);
  if (!usedDates.length) return '';
  const latest = new Date(Math.max(...usedDates));
  const skipped = lots.filter(l => {
    const d = parseExp(l.exp);
    return d && d < latest && (l.base || 0) - (used[key(l)] || 0) > 0;
  });
  if (!skipped.length) return '';
  const byKey = Object.fromEntries(lots.map(l => [key(l), l]));
  const reason = allocation.some(a => isSupportedLot(byKey[key(a)]))
    ? 'จ่ายยาสนับสนุนก่อน'
    : 'จ่ายยาซื้อที่หมดอายุภายใน 6 เดือนก่อน';
  const list = skipped.map(l => {
    const left = (l.base || 0) - (used[key(l)] || 0);
    return `lot ${l.lot} exp ${fmtExp(l.exp)} ยังเหลือ ${left.toLocaleString()}${l.baseUnit ? ` ${l.baseUnit}` : ''}`;
  });
  return `lot ไม่เรียง exp: ${reason} (${list.join(' · ')})`;
}
