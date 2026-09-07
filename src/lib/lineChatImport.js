// นำเข้าประวัติแชทจากไฟล์ export ของแอป LINE (มือถือ) — ADR-0022
// pure module — ห้าม import supabase (ต้องรันใน node ได้ ดู CLAUDE.md §Commands)
//
// LINE export มี 2 รูปแบบที่ต่างกันคนละเรื่อง (พบจริงจากไฟล์ของคลัง):
//   A) แชทกลุ่ม  — มีหัวไฟล์ 2 บรรทัด, หัววัน `ศ. 28/11/2568` (พ.ศ.), คั่นด้วย TAB,
//                  ไฟล์แนบเขียน `[รูป]`, ข้อความหลายบรรทัดครอบด้วยเครื่องหมายคำพูด
//   B) แชทเดี่ยว — ไม่มีหัวไฟล์, หัววัน `2025.05.15 วันพฤหัสบดี` (ค.ศ.), คั่นด้วยช่องว่าง,
//                  ไฟล์แนบเขียน `รูป` (ไม่มีวงเล็บ), หลายบรรทัดขึ้นบรรทัดใหม่ดิบๆ
// รูปแบบ B แยก "ชื่อผู้ส่ง" จาก "เนื้อความ" ด้วยช่องว่างตรงๆ ไม่ได้ เพราะชื่อมีช่องว่าง/อิโมจิ
// ในตัว (เช่น `Bow<emoji>Papassara<emoji>15`) → ต้อง pre-scan รายชื่อผู้ส่งก่อน แล้ว match ยาวสุดก่อน

const RE_HEADER_GROUP = /^\[LINE\]/
const RE_SAVED_AT = /^บันทึกเมื่อ/
// หัววันแบบ A: `ศ. 28/11/2568` — วันย่อไทย + DD/MM/YYYY (พ.ศ.)
const RE_DATE_TH = /^[ก-๙]{1,2}\.\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/
// หัววันแบบ B: `2025.05.15 วันพฤหัสบดี` — YYYY.MM.DD (ค.ศ.) + ชื่อวันเต็ม
const RE_DATE_DOT = /^(\d{4})\.(\d{2})\.(\d{2})(?:\s+วัน[ก-๙]+)?\s*$/
const RE_TIME_HEAD = /^(\d{1,2}):(\d{2})\b/

// ไฟล์แนบ/อีเวนต์ — แบบ A มีวงเล็บเหลี่ยม แบบ B ไม่มี
const ATTACH = {
  'รูป': 'image', 'รูปภาพ': 'image', 'ภาพ': 'image',
  'สติกเกอร์': 'sticker', 'วิดีโอ': 'video', 'คลิปวิดีโอ': 'video',
  'ไฟล์': 'file', 'ข้อความเสียง': 'audio', 'ตำแหน่ง': 'location',
  'ไม่ได้รับสาย': 'call', 'การโทร': 'call', 'ยกเลิกการโทร': 'call',
}

// ข้อความที่ถูก unsend — LINE เขียนไว้ในช่อง "ผู้ส่ง" ไม่ใช่ช่องเนื้อความ (พบ 57 ครั้งในไฟล์จริง)
// ต้องดักก่อนแยกผู้ส่ง ไม่งั้นกลายเป็นชื่อคนปลอมในสถิติ
const RE_UNSENT = /^ยกเลิกข้อความแล้ว$/

// อักขระซ่อนที่ LINE ใส่ครอบชื่อ — FSI/PDI (U+2066-2069) + zero-width/BOM
// เขียนเป็น escape ไม่ใช่ตัวอักษรจริง เพราะอักขระพวกนี้มองไม่เห็นในโค้ด (และ eslint ปฏิเสธ)
const INVISIBLE = /[\u2066-\u2069\u200b-\u200f\ufeff]/g
const clean = (s) => String(s ?? '').replace(INVISIBLE, '').trim()

/** พ.ศ. → ค.ศ. (ไฟล์กลุ่มเป็น พ.ศ., ไฟล์เดี่ยวเป็น ค.ศ. อยู่แล้ว) */
export function toGregorianYear(y) {
  const n = Number(y)
  return n >= 2400 ? n - 543 : n
}

/** ประกอบ ISO ที่ระบุ +07:00 ชัดเจน — ไฟล์ export เป็นเวลาไทยเสมอ
 *  ห้ามใช้ new Date(...).toISOString() กับค่าที่ไม่มี timezone (node ตีเป็นเวลาเครื่อง) */
export function toIsoBangkok(year, month, day, hh, mm) {
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(toGregorianYear(year), 4)}-${p(month)}-${p(day)}T${p(hh)}:${p(mm)}:00+07:00`
}

/** แยกชนิดข้อความ → { msgType, body } */
function classify(raw) {
  const t = clean(raw)
  const bracket = t.match(/^\[(.+)\]$/)
  if (bracket && ATTACH[bracket[1].trim()]) return { msgType: ATTACH[bracket[1].trim()], body: null }
  // แบบ B ไม่มีวงเล็บ — ต้องตรงทั้งข้อความเท่านั้น ไม่งั้นประโยคที่มีคำว่า "รูป" จะถูกกลืน
  if (ATTACH[t]) return { msgType: ATTACH[t], body: null }
  return { msgType: 'text', body: t }
}

/** pre-scan รายชื่อผู้ส่งสำหรับไฟล์แบบ B
 *  ผู้ส่งจริงปรากฏซ้ำหลายครั้ง — ตัดคำที่เจอน้อยกว่า 3 ครั้ง (น่าจะเป็นคำแรกของประโยค) */
function collectSenders(lines) {
  const one = new Map()   // คำแรกหลังเวลา
  const two = new Map()   // สองคำแรกหลังเวลา
  for (const line of lines) {
    const m = clean(line).match(/^(\d{1,2}):(\d{2})\s+(\S+)(?:\s+(\S+))?/)
    if (!m) continue
    one.set(m[3], (one.get(m[3]) || 0) + 1)
    if (m[4]) two.set(`${m[3]} ${m[4]}`, (two.get(`${m[3]} ${m[4]}`) || 0) + 1)
  }
  const senders = []
  for (const [w1, n1] of one) {
    if (n1 < 3) continue
    // ชื่อที่มีช่องว่างในตัว (เช่น `ต่าย sucha`) — คำที่ 2 ต้องตามหลังคำแรก
    // เกือบทุกครั้ง ถ้าเป็นแค่คำแรกของประโยค คำที่ 2 จะกระจายไปหลายแบบ
    let best = null, bestN = 0
    for (const [pair, n2] of two) {
      if (pair.startsWith(w1 + ' ') && n2 > bestN) { best = pair; bestN = n2 }
    }
    senders.push(bestN / n1 >= 0.8 ? best : w1)
  }
  return [...new Set(senders)].sort((a, b) => b.length - a.length)   // ยาวสุดก่อน กัน prefix ชนกัน
}

/**
 * parse ไฟล์ export → { chatName, format, rows, skipped }
 * rows: { chat_name, sender, sent_at, msg_type, body }
 */
export function parseLineExport(text, { chatNameFallback = '' } = {}) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  // ไฟล์แชทเดี่ยวไม่มีหัวไฟล์ ชื่อคู่สนทนาอยู่ในชื่อไฟล์ (`[LINE]Bow….txt`) — ตัดคำนำหน้าออก
  let chatName = clean(chatNameFallback).replace(/^\[LINE\]\s*/, '')
  let format = null
  const rows = []
  const skipped = []

  const head = lines[0] || ''
  if (RE_HEADER_GROUP.test(head)) {
    format = 'group'
    const q = clean(head).match(/["“]([^"”]+)["”]/)
    if (q) chatName = q[1].trim()
  }

  // ⚠️ ตัดสินรูปแบบไฟล์ครั้งเดียวจากหัวไฟล์/หัววัน — ห้ามดู "บรรทัดนี้มี TAB ไหม" รายบรรทัด
  // เพราะข้อความที่คนแปะตารางจาก Excel มี TAB อยู่ในเนื้อความ (พบจริง 3 แถว) จะถูกตีเป็น
  // รูปแบบกลุ่มแล้วตัดหัวข้อความทิ้งจนเหลือชื่อผู้ส่งปลอม เช่น `เม็ด` — ข้อความที่หายเป็นงานจริง
  if (!format) {
    const firstDate = lines.find(l => RE_DATE_TH.test(clean(l)) || RE_DATE_DOT.test(clean(l)))
    format = firstDate && RE_DATE_TH.test(clean(firstDate)) ? 'group' : 'direct'
  }
  const isGroupFormat = format === 'group'
  const senders = isGroupFormat ? [] : collectSenders(lines)   // pre-scan เฉพาะรูปแบบ B
  let cur = null        // วันที่ปัจจุบัน { y, m, d }
  let last = null       // แถวล่าสุด (ไว้ต่อบรรทัดที่ล้น)
  let openQuote = false // อยู่ในข้อความหลายบรรทัดที่ครอบด้วยเครื่องหมายคำพูด (แบบ A)

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const line = clean(rawLine)

    if (openQuote && last) {
      if (line.endsWith('"')) { openQuote = false; last.body += '\n' + line.slice(0, -1) }
      else last.body += '\n' + line
      continue
    }
    if (!line) continue
    if (i === 0 && RE_HEADER_GROUP.test(line)) continue
    if (RE_SAVED_AT.test(line)) continue

    const dTh = line.match(RE_DATE_TH)
    if (dTh) { cur = { d: +dTh[1], m: +dTh[2], y: +dTh[3] }; last = null; format = format || 'group'; continue }
    const dDot = line.match(RE_DATE_DOT)
    if (dDot) { cur = { y: +dDot[1], m: +dDot[2], d: +dDot[3] }; last = null; format = format || 'direct'; continue }

    const t = line.match(RE_TIME_HEAD)
    if (!t) {   // ไม่ขึ้นด้วยเวลา = บรรทัดต่อของข้อความก่อนหน้า
      if (last && last.msg_type === 'text') last.body = (last.body ? last.body + '\n' : '') + line
      else skipped.push({ line: i + 1, text: line })
      continue
    }
    // ⚠️ บรรทัดขึ้นด้วยเวลาเสมอ = ข้อความใหม่ แม้ผู้ส่งจะไม่อยู่ในรายชื่อที่ pre-scan เจอ
    //    (คนที่พิมพ์ครั้งเดียวทั้งไฟล์ไม่ผ่านเกณฑ์ n>=3 — ถ้าปล่อยให้ตกไปเป็นบรรทัดต่อ
    //     ข้อความของเขาจะถูกกลืนเข้าไปในข้อความของคนก่อนหน้า พบจริงกับ Nike ที่ส่ง 1 ครั้ง)
    if (!cur) { skipped.push({ line: i + 1, text: line, why: 'ไม่มีหัววันนำหน้า' }); continue }

    const sentAt = toIsoBangkok(cur.y, cur.m, cur.d, t[1], t[2])
    let sender = ''
    let payload = ''

    if (isGroupFormat && rawLine.includes('\t')) {
      const seg = rawLine.split('\t')
      // `08:54\t\tKao เพิ่ม X เข้ากลุ่ม` = ข้อความระบบ (ช่องชื่อผู้ส่งว่าง)
      if (seg.length >= 3 && clean(seg[1]) === '') {
        const row = { chat_name: chatName, sender: 'ระบบ', sent_at: sentAt, msg_type: 'system', body: clean(seg.slice(2).join(' ')) }
        rows.push(row); last = null; continue
      }
      sender = clean(seg[1] || '')
      payload = clean(seg.slice(2).join('\t'))
    } else {
      const rest = clean(line.slice(t[0].length))
      if (RE_UNSENT.test(rest)) {   // ข้อความถูกยกเลิก — ไม่มีทั้งผู้ส่งและเนื้อความ
        const row = { chat_name: chatName, sender: last?.sender || '-', sent_at: sentAt, msg_type: 'unsent', body: null }
        rows.push(row); last = null; continue
      }
      const hit = senders.find(s => rest === s || rest.startsWith(s + ' '))
      if (hit) { sender = hit; payload = clean(rest.slice(hit.length)) }
      else {
        // ไม่ match รายชื่อที่ pre-scan เจอ — แยก 2 กรณี:
        //  (ก) คำแรกดูเป็นชื่อคน (ไม่มีตัวเลข/หน่วย) = ผู้ส่งที่พิมพ์น้อยครั้ง → รับเป็นข้อความใหม่
        //  (ข) นอกนั้น = บรรทัดต่อของข้อความก่อนหน้าที่บังเอิญขึ้นด้วยเวลา
        //      (เช่น ตารางที่แปะมา `10:15 Acetylcysteine 200 mg`) → ต่อท้ายแถวเดิม
        const sp = rest.indexOf(' ')
        const w1 = sp < 0 ? rest : rest.slice(0, sp)
        const looksLikeName = w1.length <= 20 && !/[\d.,;:/()]/.test(w1)
        if (looksLikeName) { sender = w1; payload = sp < 0 ? '' : clean(rest.slice(sp + 1)) }
        else if (last && last.msg_type === 'text') {
          last.body = (last.body ? last.body + '\n' : '') + line
          continue
        } else {
          skipped.push({ line: i + 1, text: line, why: 'ไม่รู้จักผู้ส่ง' })
          continue
        }
      }
    }

    let body = payload
    if (body.startsWith('"') && !(body.length > 1 && body.endsWith('"'))) { openQuote = true; body = body.slice(1) }
    else if (body.length > 1 && body.startsWith('"') && body.endsWith('"')) body = body.slice(1, -1)

    const c = openQuote ? { msgType: 'text', body } : classify(body)
    const row = { chat_name: chatName, sender, sent_at: sentAt, msg_type: c.msgType, body: c.body }
    rows.push(row)
    last = row
  }

  return { chatName, format: format || 'direct', rows, skipped }
}

// ── กรองรหัสเข้าคลัง (ADR-0022 · ADR-0016) ───────────────────────────
// กลุ่มนี้ใช้แจ้ง "รหัสประตูคลังยา/คลังน้ำเกลือ" ที่เปลี่ยนเป็นระยะ ปนกับเรื่องงาน
// รหัสเข้าอาคาร = ข้อมูลควบคุมการเข้าถึงทางกายภาพ **ห้ามเก็บลงฐานข้อมูลเด็ดขาด**
// (ADR-0016: anon key อยู่ใน bundle ที่ browser โหลด — ถ้าเก็บก็เท่ากับแปะไว้ให้คนอ่าน)
//
// ⚠️ กับดักที่ต้องระวัง: คำว่า "รหัส" ในกลุ่มนี้หมายถึง **รหัสยา** ด้วย
//    เช่น `LRI 1000ml รหัส 12` / `Cetirizine 60ml รหัส 1660020` ← เนื้องานแท้ๆ ห้ามทิ้ง
//    จึงต้องแยกด้วยบริบท ไม่ใช่เจอคำว่า "รหัส" แล้วตัดทั้งหมด

// คำที่บ่งชี้ว่าเป็นรหัสเข้าสถานที่ (ไม่ใช่รหัสยา)
const DOOR_CONTEXT = /(คลัง|ประตู|ล็อค|ล็อก|ตู้|ห้อง|เปลี่ยนรหัส|รหัสใหม่|door|lock)/i
// มีคำว่ารหัส/ล็อค แล้วมีตัวเลข 3-8 หลักอยู่ในข้อความ (คนละบรรทัดก็นับ — `รหัส1\n: 1234`)
const CODE_NEAR = /\d{3,8}/

/** true = ข้อความนี้มีรหัสเข้าสถานที่ ห้ามเก็บลง DB
 *  เกณฑ์: ต้องมีทั้ง (คำว่ารหัส/ล็อค + ตัวเลข) และ (บริบทที่เป็นสถานที่ ไม่ใช่ชื่อยา) */
export function containsDoorCode(body) {
  const t = clean(body)
  if (!t) return false
  if (!/รหัส|ล็อค|ล็อก|password|passcode/i.test(t)) return false
  if (!CODE_NEAR.test(t)) return false
  if (DOOR_CONTEXT.test(t)) return true          // มีบริบทสถานที่ = รหัสประตูแน่นอน

  // ไม่มีบริบทสถานที่ → แยกด้วย "รูปแบบการเขียน":
  // รหัสยาเขียนคู่กับหน่วย/ปริมาตร/การซื้อ (LRI 1000ml รหัส 12) — ตัวเลขเป็นข้อมูลของยา
  // รหัสประตูเขียนโดดๆ ติดกับคำว่ารหัส (รหัส1 : 1234 / -Mark รหัส 111111)
  // ⚠️ ห้ามใช้ [a-z]{3,} เป็นเกณฑ์ "มีชื่อยา" — ชื่อคนก็เป็นอังกฤษ (-Mark/-Tai) จะหลุด
  const DRUG_CONTEXT = /มก\.|มล\.|ม\.ล\.|\d+\s*(?:ml|mg|mcg|g)\b|เม็ด|ขวด|กล่อง|หลอด|แอมป์|ซื้อ|lot|exp|ต่างกัน|ตัวไหน/i
  return !DRUG_CONTEXT.test(t)
}

/** ตัดข้อความที่มีรหัสเข้าสถานที่ออกจากชุดที่จะ import
 *  คืน { rows, redacted } — rows คือที่เหลือ, redacted = จำนวนที่ตัดทิ้ง
 *  ⚠️ ตัดทั้งแถว ไม่ใช่แค่กลบตัวเลข — ข้อความรอบๆ มักบอกว่าเปลี่ยนรหัสเพราะอะไร ซึ่งก็อ่อนไหวเอง */
export function stripDoorCodes(rows) {
  const kept = rows.filter(r => !(r.msg_type === 'text' && containsDoorCode(r.body)))
  return { rows: kept, redacted: rows.length - kept.length }
}

// ── ดักคำที่ "น่าจะเป็นงาน" (แบบ C) ────────────────────────────────────
// เลือกจากการนับในไฟล์จริง: คำกว้างอย่าง ขอ/แจ้ง/สั่ง/ทำ เจอ 160-420 ครั้ง ส่วนใหญ่เป็น
// ขอบคุณ/แจ้งรหัส/สั่งซื้อ → ดักแล้วท่วมจอจนคนเลิกใช้ จึงไม่ใส่ในลิสต์นี้
export const TASK_KEYWORDS = [
  '@All', 'อย่าลืม', 'ด่วน', 'ช่วย', 'ฝาก', 'เช็ค', 'ตรวจสอบ', 'รบกวน', 'แก้ไข',
]
// ข้อความสั้นมากมักเป็นการตอบรับ (เค/ครับ/ค่ะ/ok) ไม่ใช่งาน
const MIN_LEN = 12

/** คืนคำที่ทำให้ข้อความถูกชู — ไม่เข้าเกณฑ์คืน null */
export function matchTaskKeyword(body, { keywords = TASK_KEYWORDS, minLen = MIN_LEN } = {}) {
  const t = clean(body)
  if (!t || t.length < minLen) return null
  return keywords.find(k => t.includes(k)) || null
}

/** ติดสถานะ candidate ให้แถวที่เข้าเกณฑ์ — คนค่อยยืนยันในแอป (ไม่เดาแทนคน) */
export function markCandidates(rows, opts = {}) {
  return rows.map(r => {
    if (r.msg_type !== 'text') return r
    const kw = matchTaskKeyword(r.body, opts)
    return kw ? { ...r, task_status: 'candidate', matched_kw: kw } : r
  })
}
