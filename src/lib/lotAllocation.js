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
