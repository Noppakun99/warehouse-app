// popupSeen.js — popup เด้ง "เฉพาะ lot ที่คนนั้นยังไม่เคยเห็น วันละครั้ง" (CONTEXT.md §คิวงานวันนี้)
// pure logic + ตัวห่อ localStorage (try/catch) — golden test: npm run test:popupseen
//
// จำต่อคนบนเครื่องที่ใช้อยู่ (ตกลง 10/10/2569) — เปลี่ยนเครื่อง/ล้างข้อมูลเบราว์เซอร์ = เห็นซ้ำได้
// อ่านไม่ได้ (private mode / WebView บล็อก) = ถือว่ายังไม่เคยเห็น → เด้งเกินดีกว่าพลาด

const EMPTY = { date: null, keys: [] }

/**
 * ตัดสินว่าจะเด้ง popup ไหม และ state "เคยเห็น" ถัดไป
 * @param {object} p
 * @param {Array} p.rows        รายการที่เข้าเกณฑ์ตอนนี้
 * @param {(row) => string} p.keyOf  key ของ lot (เช่น code|lot)
 * @param {{date, keys}} p.seen state ที่เก็บไว้
 * @param {string} p.today      'YYYY-MM-DD'
 * @returns {{ show: Array, nextSeen: {date, keys} | null }}  nextSeen = null → ไม่ต้องเขียนทับ
 */
export function pickPopupRows({ rows = [], keyOf, seen = EMPTY, today }) {
  const s = seen && Array.isArray(seen.keys) ? seen : EMPTY
  if (s.date === today) return { show: [], nextSeen: null }        // วันนี้เด้งไปแล้ว
  const seenSet = new Set(s.keys)
  const show = rows.filter(r => !seenSet.has(keyOf(r)))
  if (show.length === 0) return { show: [], nextSeen: null }       // ไม่มีเรื่องใหม่ — ยังไม่นับว่าเด้งวันนี้
  // หลังเด้ง: ทุก lot ที่เข้าเกณฑ์ตอนนี้ถือว่าเห็นแล้ว · key ที่หลุดเกณฑ์ไปแล้วทิ้ง (กลับมาใหม่ = เรื่องใหม่)
  return { show, nextSeen: { date: today, keys: [...new Set(rows.map(keyOf))] } }
}

export const popupStorageKey = (kind, userId) => `popup_seen_${kind}_${userId}`

export function readSeen(storage, key) {
  try {
    const raw = storage?.getItem(key)
    if (!raw) return EMPTY
    const v = JSON.parse(raw)
    return v && Array.isArray(v.keys) ? { date: v.date ?? null, keys: v.keys } : EMPTY
  } catch {
    return EMPTY
  }
}

export function writeSeen(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)) } catch { /* เขียนไม่ได้ = พรุ่งนี้เด้งซ้ำ ยอมรับได้ */ }
}
