// แปลงไฟล์ export แชท LINE → ไฟล์ SQL สำหรับ import ผ่าน Supabase MCP
// ไม่ต้องใช้ service_role key — MCP เขียนตารางที่ปิด RLS ได้อยู่แล้ว (ทดสอบแล้ว)
// รัน: npm run gen:linechat
import fs from 'node:fs'
import { parseLineExport, markCandidates, stripDoorCodes } from './src/lib/lineChatImport.js'

const DIR = 'C:/Users/PRH0000484/Downloads'
const OUT = 'C:/Users/PRH000~1/AppData/Local/Temp/claude/c--Users-PRH0000484-warehouse-app/9a5d4766-68ba-4740-b2f4-2e6e848ff785/scratchpad'
// แถวต่อไฟล์ — ต้องเล็กพอส่งผ่าน MCP ได้ในครั้งเดียว (ข้อความบางแถวยาวหลายร้อยตัวอักษร)
const CHUNK = 120

const q = (v) => (v === null || v === undefined) ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`

let files = 0, total = 0
// ข้ามไฟล์ export รอบเก่าที่ถูกแทนที่แล้ว — กลุ่มเดียวกันแต่ export ใหม่ได้ข้อมูลสดกว่า
// (`การแชทกลุ่ม _รหัสล็อคคลังยา_` = กลุ่มเดียวกับ `คลังยา` ยืนยันจากวันเริ่มกลุ่มและเนื้อหา)
const SKIP = ['cleanup', 'การแชทกลุ่ม']
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.txt') && !SKIP.some(s => x.includes(s)))) {
  const { chatName, rows } = parseLineExport(fs.readFileSync(`${DIR}/${f}`, 'utf8'), { chatNameFallback: f.replace(/\.txt$/, '') })
  // ตัดรหัสเข้าคลังทิ้งก่อนเสมอ — ห้ามให้ถึง DB (ADR-0016)
  const { rows: safe, redacted } = stripDoorCodes(rows)
  const marked = markCandidates(safe)
  const slug = chatName.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9]/g, '_').slice(0, 16)

  for (let i = 0; i < marked.length; i += CHUNK) {
    const part = marked.slice(i, i + CHUNK)
    const vals = part.map(r => '(' + [
      q('import'), q(r.chat_name), q(r.sender), q(r.sent_at) + '::timestamptz',
      q(r.msg_type), q(r.body), q(r.task_status || null), q(r.matched_kw || null),
    ].join(',') + ')').join(',\n')
    const sql = 'INSERT INTO public.line_message\n'
      + '  (source, chat_name, sender, sent_at, msg_type, body, task_status, matched_kw)\n'
      + 'VALUES\n' + vals + '\nON CONFLICT DO NOTHING;'
    const n = String(Math.floor(i / CHUNK) + 1).padStart(2, '0')
    fs.writeFileSync(`${OUT}/imp_${slug}_${n}.sql`, sql, 'utf8')
    files++
    total += part.length
  }
  console.log(`${chatName}: ${marked.length} แถว (candidate ${marked.filter(r => r.task_status).length}, ตัดรหัสทิ้ง ${redacted})`)
}
console.log(`สร้าง ${files} ไฟล์ รวม ${total} แถว`)
