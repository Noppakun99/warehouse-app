// locationMove.js — pure logic ใบแจ้งย้ายที่เก็บ (CONTEXT.md §ใบแจ้งย้ายที่เก็บ · docs/features/location-move.md)
// - Excel เป็นตัวจริงของที่เก็บ (ADR-0027) — ใบ pending = คำสั่งย้ายที่ยังไม่ลง Master D/E
// - หน่วยย้าย = กองยา (pile) = code + lot + ที่เก็บ (เทียบแบบเซ็ต) — lot เดียวแยกแถวตามที่เก็บได้
//   (Manidipine 260873: E-1-1 ,E-1-2 ,E-1-3 240 / ห้องประชุมเล็กชั้น4 300) ย้ายทั้ง lot = ยอดรายที่เก็บหาย
// pure module — ห้าม import supabase (golden test: npm run test:locationmove)

import { normSet, setEq } from './countMatch.js'

const t = (v) => String(v ?? '').trim()

// "E-8-4 ,E-8-5" → ['E-8-4','E-8-5'] คงลำดับที่พิมพ์ (ชั้นแรกใช้หา MainLog) · ตัดซ้ำ/ว่าง/'-'
export function splitLoc(v) {
  const out = []
  for (const s of String(v ?? '').split(',')) {
    const x = s.trim()
    if (x && x !== '-' && !out.includes(x)) out.push(x)
  }
  return out
}

// รูปเดียวกับที่ Excel ใช้มากที่สุด ("E-8-4 ,E-8-5")
export const joinLoc = (arr) => arr.join(' ,')

export const pileKey = (code, lot, location) => `${t(code)}|${t(lot) || '-'}|${normSet(location)}`

// ที่เก็บค่าเดียว → main_log ที่พบมากสุด (โซนพิเศษ: คลังถุงขวดตลับ → คลังถุง/ขวด/ตลับ)
export function buildMainLogMap(rows) {
  const count = new Map()
  for (const r of rows || []) {
    const locs = splitLoc(r.location)
    if (locs.length !== 1 || !t(r.main_log)) continue
    const m = count.get(locs[0]) || new Map()
    m.set(t(r.main_log), (m.get(t(r.main_log)) || 0) + 1)
    count.set(locs[0], m)
  }
  const out = new Map()
  for (const [loc, m] of count) out.set(loc, [...m].sort((a, b) => b[1] - a[1])[0][0])
  return out
}

export function deriveMainLog(locArr, mainLogMap) {
  const first = locArr?.[0]
  if (!first) return null
  if (mainLogMap?.has(first)) return mainLogMap.get(first)
  const m = first.match(/^([A-Za-z]+)-\d/)
  return m ? m[1] : first
}

// แถว inventory ของยา 1 รหัส → กองยา [{ key, code, name, lot, exp, location, main_log, qty, rowCount }]
export function groupPiles(rows) {
  const piles = new Map()
  for (const r of rows || []) {
    const key = pileKey(r.code, r.lot, r.location)
    const p = piles.get(key) || { key, code: t(r.code), name: r.name, lot: t(r.lot) || '-', exp: r.exp, location: t(r.location), main_log: r.main_log || null, qty: 0, rowCount: 0 }
    p.qty += parseFloat(String(r.qty ?? '0').replace(/,/g, '')) || 0
    p.rowCount += 1
    piles.set(key, p)
  }
  return [...piles.values()]
}

const sameLot = (m, r) => t(m.code) === t(r.code) && (t(m.lot) || '-') === (t(r.lot) || '-')

// ใบ pending ของกองที่แถวนี้อยู่ (เทียบที่เก็บใน Excel = from_location)
export const findMoveForRow = (row, moves) =>
  (moves || []).find(m => m.status === 'pending' && sameLot(m, row) && setEq(m.from_location, row.location)) || null

// แผนผังแสดงที่ใหม่ทันที — แถวที่มีใบ pending ได้ location/main_log ตามใบ + pending_move
export function overlayMoves(rows, moves) {
  return (rows || []).map(r => {
    const m = findMoveForRow(r, moves)
    if (!m) return r
    return { ...r, location: m.to_location, main_log: m.to_main_log ?? r.main_log, pending_move: m }
  })
}

/**
 * วางแผนการบันทึกใบแจ้งย้าย 1 กอง
 * @param pile   กองตามที่แผนผังแสดง { code, name, lot, location, main_log } (location อาจเป็นค่าหลัง overlay)
 * @param toArr  ชุดชั้นใหม่ (array)
 * @param moves  ใบ pending ทั้งหมด
 * @returns { supersedeIds, insert, error }
 *   ย้ายต่อจากใบเดิม (A→B แล้ว B→C) → supersede ใบเดิม + ใบใหม่ A→C (Excel ยังเป็น A)
 *   ย้ายกลับที่เดิมใน Excel (A→B แล้ว B→A) → supersede อย่างเดียว ไม่มีใบใหม่
 */
export function planMove(pile, toArr, moves, mainLogMap) {
  const to = splitLoc(joinLoc(toArr || []))
  if (to.length === 0) return { supersedeIds: [], insert: null, error: 'ต้องมีที่เก็บอย่างน้อย 1 ชั้น' }
  const toLoc = joinLoc(to)
  if (setEq(toLoc, pile.location)) return { supersedeIds: [], insert: null, error: 'ที่เก็บใหม่เหมือนที่เดิม' }

  const prev = (moves || []).find(m => m.status === 'pending' && sameLot(m, pile) && setEq(m.to_location, pile.location))
  const from = prev ? prev.from_location : pile.location
  const fromMain = prev ? prev.from_main_log : (pile.main_log || null)
  const supersedeIds = prev ? [prev.id] : []
  if (setEq(toLoc, from)) return { supersedeIds, insert: null, error: null }

  return {
    supersedeIds,
    error: null,
    insert: {
      code: t(pile.code), name: pile.name || null, lot: t(pile.lot) || '-',
      from_location: from, from_main_log: fromMain,
      to_location: toLoc, to_main_log: deriveMainLog(to, mainLogMap),
    },
  }
}

/**
 * หลังนำเข้า Master — ใบ pending แต่ละใบเป็นอย่างไรเทียบกับไฟล์
 * applied  = ไม่มีแถวของ lot อยู่ที่ from แล้ว และมีแถวอยู่ที่ to
 * pending  = ยังมีแถวอยู่ที่ from (Excel ยังไม่ได้แก้)
 * conflict = ไม่อยู่ทั้ง from และ to (มีคนแก้ Excel เป็นค่าอื่น / lot หายจากไฟล์)
 */
export function reconcileMoves(moves, rows) {
  const applied = [], pending = [], conflict = []
  for (const m of moves || []) {
    if (m.status !== 'pending') continue
    const lotRows = (rows || []).filter(r => sameLot(m, r))
    const atFrom = lotRows.some(r => setEq(r.location, m.from_location))
    const atTo = lotRows.some(r => setEq(r.location, m.to_location))
    if (atFrom) pending.push(m)
    else if (atTo) applied.push(m)
    else {
      const now = [...new Set(lotRows.map(r => t(r.location)))]
      conflict.push({ ...m, note: lotRows.length ? `Excel ที่เก็บเป็น ${now.join(' / ')}` : 'lot หายจากไฟล์ Master' })
    }
  }
  return { applied, pending, conflict }
}
