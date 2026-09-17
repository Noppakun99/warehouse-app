// Golden test — src/lib/lineChatImport.js (ADR-0022)
// รัน: npm run test:linechat   (standalone node ไม่มี framework ตาม CLAUDE.md §Commands)
//
// ⚠️ ข้อมูลทดสอบทั้งหมดเป็น "ข้อมูลสมมติ" ที่แต่งขึ้นให้มีโครงสร้างเหมือนไฟล์จริง
//    ห้ามวางเนื้อหาแชทจริงลงไฟล์นี้ — ไฟล์จริงมีรหัสประตูคลังยาและเรื่องภายใน (ADR-0016)

import {
  parseLineExport, markCandidates, matchTaskKeyword,
  toGregorianYear, toIsoBangkok, TASK_KEYWORDS,
} from './lineChatImport.js'

let pass = 0, fail = 0
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { pass++; return }
  fail++
  console.error(`✗ ${label}\n    ได้   : ${a}\n    ควรได้: ${e}`)
}
const ok = (cond, label) => eq(!!cond, true, label)

// ── 1. แปลงปี พ.ศ./ค.ศ. ──────────────────────────────────────────
eq(toGregorianYear(2568), 2025, 'พ.ศ. 2568 → ค.ศ. 2025')
eq(toGregorianYear(2025), 2025, 'ค.ศ. ปล่อยผ่าน')
eq(toGregorianYear(2570), 2027, 'พ.ศ. 2570 → 2027')
// 2400 คือเส้นแบ่ง — ปีที่ต่ำกว่านี้ถือเป็น ค.ศ. เสมอ
eq(toGregorianYear(2399), 2399, 'ต่ำกว่า 2400 ไม่แปลง')

// ── 2. ISO ต้องติด +07:00 เสมอ (ห้ามพึ่ง timezone ของเครื่องที่รัน) ──
eq(toIsoBangkok(2568, 11, 28, '08', '54'), '2025-11-28T08:54:00+07:00', 'ISO จากปี พ.ศ.')
eq(toIsoBangkok(2025, 5, 15, '8', '35'), '2025-05-15T08:35:00+07:00', 'ชั่วโมงหลักเดียว pad ศูนย์')

// ── 3. รูปแบบ A (แชทกลุ่ม): TAB + พ.ศ. + [รูป] ───────────────────
const GROUP = [
  '[LINE] ประวัติการแชทในกลุ่ม "กลุ่มทดสอบ"',
  'บันทึกเมื่อ 04/09/2569 07:48',
  '',
  'ศ. 28/11/2568',
  '08:54\t\t⁨⁨สมชาย⁩⁩ เพิ่ม ⁨⁨สมหญิง⁩⁩ เข้ากลุ่ม',
  '08:55\tสมชาย\tสวัสดีครับ',
  '09:00\tสมหญิง\t[รูป]',
  '09:01\tสมหญิง\t[สติกเกอร์]',
  '09:02\tสมชาย\t"บรรทัดแรก',
  'บรรทัดสอง"',
  '',
  'ส. 29/11/2568',
  '10:00\tสมหญิง\tฝากตรวจสอบยาคงเหลือด้วยนะครับ',
].join('\n')

const g = parseLineExport(GROUP)
eq(g.chatName, 'กลุ่มทดสอบ', 'อ่านชื่อกลุ่มจากหัวไฟล์')
eq(g.format, 'group', 'ตรวจรูปแบบเป็น group')
eq(g.skipped.length, 0, 'กลุ่ม: ไม่มีบรรทัดที่ parse ไม่ได้')
eq(g.rows.length, 6, 'กลุ่ม: ได้ 6 ข้อความ')
eq(g.rows[0].msg_type, 'system', 'บรรทัดเพิ่มคนเข้ากลุ่ม = system')
eq(g.rows[0].sender, 'ระบบ', 'ข้อความระบบไม่มีผู้ส่ง')
eq(g.rows[1].sender, 'สมชาย', 'แยกผู้ส่งจาก TAB')
eq(g.rows[1].body, 'สวัสดีครับ', 'เนื้อความปกติ')
eq(g.rows[1].sent_at, '2025-11-28T08:55:00+07:00', 'เวลาแปลงเป็น ISO +07')
eq(g.rows[2].msg_type, 'image', '[รูป] = image')
eq(g.rows[2].body, null, 'ไฟล์แนบไม่มี body')
eq(g.rows[3].msg_type, 'sticker', '[สติกเกอร์] = sticker')
eq(g.rows[4].body, 'บรรทัดแรก\nบรรทัดสอง', 'ข้อความหลายบรรทัดในเครื่องหมายคำพูด')
eq(g.rows[5].sent_at.slice(0, 10), '2025-11-29', 'หัววันใหม่เปลี่ยนวันที่ถูก')

// ── 4. รูปแบบ B (แชทเดี่ยว): ช่องว่าง + ค.ศ. + รูป(ไม่มีวงเล็บ) ──
// ผู้ส่งต้องปรากฏ ≥3 ครั้ง ถึงจะถูกจดจำ (pre-scan) จึงใส่ให้ครบในตัวอย่าง
const DIRECT = [
  '2025.05.15 วันพฤหัสบดี',
  '08:35 สมหญิง สวัสดีค่ะ',
  '08:36 สมชาย ครับผม',
  '08:37 สมหญิง รูป',
  '08:38 สมหญิง ฝากเช็คยาให้หน่อยนะคะ',
  '08:39 สมชาย รับทราบครับ',
  '08:40 ยกเลิกข้อความแล้ว',
  '08:41 สมชาย ไม่ได้รับสาย',
  '',
  '2025.05.16 วันศุกร์',
  '09:00 สมชาย เรียบร้อยครับ',
].join('\n')

const d = parseLineExport(DIRECT, { chatNameFallback: '[LINE]สมหญิง' })
eq(d.format, 'direct', 'ตรวจรูปแบบเป็น direct')
eq(d.chatName, 'สมหญิง', 'ตัด [LINE] ออกจากชื่อไฟล์')
eq(d.skipped.length, 0, 'เดี่ยว: ไม่มีบรรทัดที่ parse ไม่ได้')
eq(d.rows.length, 8, 'เดี่ยว: ได้ 8 ข้อความ')
eq(d.rows[0].sender, 'สมหญิง', 'แยกผู้ส่งจากช่องว่าง')
eq(d.rows[0].body, 'สวัสดีค่ะ', 'เนื้อความหลังชื่อผู้ส่ง')
eq(d.rows[2].msg_type, 'image', 'รูป (ไม่มีวงเล็บ) = image')
eq(d.rows[5].msg_type, 'unsent', 'ยกเลิกข้อความแล้ว = unsent ไม่ใช่ชื่อคน')
eq(d.rows[6].msg_type, 'call', 'ไม่ได้รับสาย = call')
eq(d.rows[7].sent_at.slice(0, 10), '2025-05-16', 'ค.ศ. ไม่ถูกลบ 543')

// ── 5. TAB ในเนื้อความของไฟล์แบบ direct (บั๊กจริงที่เคยทำข้อความหาย) ──
// คนแปะตารางจาก Excel → มี TAB ในข้อความ ต้องไม่ถูกตีเป็นรูปแบบกลุ่ม
const PASTED = [
  '2026.07.10 วันศุกร์',
  '13:20 สมหญิง เก้า ยาตัวนี้\tเม็ด\t16.05\tบริษัท ก\tฝากดูให้หน่อยว่า lot ที่มีอยู่สั่งไปเมื่อไหร่',
  '13:21 สมหญิง ผท ถามมา',
  '13:22 สมหญิง ขอบคุณค่ะ',
].join('\n')
const p2 = parseLineExport(PASTED, { chatNameFallback: 'สมหญิง' })
eq(p2.rows.length, 3, 'ข้อความที่มี TAB ยังนับเป็น 1 แถว')
eq(p2.rows[0].sender, 'สมหญิง', 'TAB ในเนื้อความไม่ทำให้ผู้ส่งเพี้ยน')
ok(String(p2.rows[0].body).includes('ฝากดูให้หน่อย'), 'เนื้อความหลัง TAB ไม่หาย')

// ── 5b. กรองรหัสเข้าคลัง (ADR-0022) ───────────────────────────────
// ข้อมูลตัวอย่างเป็นรหัสสมมติ ไม่ใช่รหัสจริงของคลัง
import { containsDoorCode, stripDoorCodes } from './lineChatImport.js'

// ต้องกรอง — รหัสเข้าสถานที่
ok(containsDoorCode('รหัสคลังน้ำเกลือ 9999'), 'รหัส+ชื่อคลัง = รหัสประตู')
ok(containsDoorCode('คลังยาเปลี่ยนรหัสเป็น 8888'), 'เปลี่ยนรหัสคลัง')
ok(containsDoorCode('รหัสคลังยา4 :7777'), 'รหัสคลังมีเลขกำกับ')
ok(containsDoorCode('รหัส1\n: 6666'), 'รหัสขึ้นบรรทัดใหม่')
ok(containsDoorCode('-Mark รหัส 555555\n-Tai รหัส 444444'), 'ชื่อคนอังกฤษไม่ทำให้หลุด')
ok(containsDoorCode('ล็อคคลัง 3333'), 'คำว่าล็อค')

// ต้องเก็บไว้ — "รหัส" ในที่นี้คือรหัสยา = เนื้องาน
ok(!containsDoorCode('1. LRI 1000ml รหัส 12 ซื้อล่าสุด 2/9/2025'), 'รหัสยา+ปริมาตร ไม่ถูกกรอง')
ok(!containsDoorCode('Cetirizine 5mg/5ml ,60ml รหัส 1660020 ซื้อล่าสุด'), 'รหัสยา 7 หลัก ไม่ถูกกรอง')
ok(!containsDoorCode('NSS 500ml มี รหัส 52 กะ 1560006 ต่างกันไหม'), 'เทียบรหัสยา 2 ตัว ไม่ถูกกรอง')
ok(!containsDoorCode('ยา Seretide lot 4B6K exp 8/5/2026 จำนวน 36หลอด'), 'lot/exp ไม่ถูกกรอง')
ok(!containsDoorCode('ฝากพี่ตามยา Aspirin 81mg ครับ'), 'ข้อความงานปกติ')
ok(!containsDoorCode(''), 'ข้อความว่าง')

const stripped = stripDoorCodes([
  { msg_type: 'text', body: 'รหัสคลังยา 1111' },
  { msg_type: 'text', body: 'ฝากตรวจสอบยาด้วยครับ' },
  { msg_type: 'image', body: null },
])
eq(stripped.redacted, 1, 'ตัดรหัสออก 1 แถว')
eq(stripped.rows.length, 2, 'เหลือ 2 แถว')
ok(!stripped.rows.some(r => String(r.body).includes('1111')), 'รหัสไม่หลงเหลือในผลลัพธ์')

// ── 6. ดักคำงาน ───────────────────────────────────────────────────
eq(matchTaskKeyword('ฝากตรวจสอบยาคงเหลือด้วยนะครับ'), 'ฝาก', 'จับคำว่า ฝาก')
eq(matchTaskKeyword('อย่าลืมแจ้งพี่โบว์นะครับ'), 'อย่าลืม', 'จับคำว่า อย่าลืม')
eq(matchTaskKeyword('เค'), null, 'ข้อความสั้นไม่ใช่งาน')
eq(matchTaskKeyword('ครับผม'), null, 'คำตอบรับไม่ใช่งาน')
eq(matchTaskKeyword('ขอบคุณมากครับผมได้รับแล้ว'), null, 'ขอบคุณ ไม่ถูกจับ (ไม่ดักคำว่า ขอ)')
eq(matchTaskKeyword('แจ้งรหัสใหม่ให้ทราบด้วยนะครับ'), null, 'แจ้ง ไม่อยู่ในลิสต์คำ')
eq(matchTaskKeyword(null), null, 'body ว่างคืน null')
ok(!TASK_KEYWORDS.includes('ขอ'), 'คำกว้าง "ขอ" ต้องไม่อยู่ในลิสต์')
ok(!TASK_KEYWORDS.includes('แจ้ง'), 'คำกว้าง "แจ้ง" ต้องไม่อยู่ในลิสต์')

// ── 7. markCandidates ─────────────────────────────────────────────
const marked = markCandidates([
  { msg_type: 'text', body: 'ฝากตรวจสอบยาคงเหลือด้วยนะครับ' },
  { msg_type: 'text', body: 'เค' },
  { msg_type: 'image', body: null },
  { msg_type: 'text', body: 'ด่วนมากครับต้องส่งวันนี้' },
])
eq(marked[0].task_status, 'candidate', 'ข้อความที่เข้าเกณฑ์ = candidate')
eq(marked[0].matched_kw, 'ฝาก', 'บันทึกคำที่ทำให้ถูกชู')
eq(marked[1].task_status, undefined, 'ข้อความสั้นไม่ถูกมาร์ก')
eq(marked[2].task_status, undefined, 'รูปไม่ถูกมาร์ก')
eq(marked[3].matched_kw, 'ด่วน', 'จับคำว่า ด่วน')

// ── 8. edge case ──────────────────────────────────────────────────
eq(parseLineExport('').rows.length, 0, 'ไฟล์ว่างไม่พัง')
eq(parseLineExport('ข้อความลอยไม่มีหัววัน').skipped.length, 1, 'บรรทัดที่ไม่มีหัววันถูกบันทึกใน skipped')

console.log(`\nlineChatImport: ${pass} ผ่าน, ${fail} ไม่ผ่าน`)
// throw แทน process.exit → exit code ≠ 0 เหมือนกัน แต่ไม่ต้องใช้ global process (eslint browser env)
if (fail > 0) throw new Error(`golden test ไม่ผ่าน ${fail} ข้อ`)
