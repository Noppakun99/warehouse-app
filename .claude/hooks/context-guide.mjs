// SessionStart / UserPromptSubmit hook — ตอบ user 04/11/2569 "จะรู้ได้อย่างไรว่าตอนไหนควรบันทึก context"
// SessionStart: แสดงคู่มือย่อ (systemMessage ให้คนอ่าน ไม่เข้า context จึงไม่กิน token)
// UserPromptSubmit: เตือนเมื่อ context ถึง 250K แล้วเตือนซ้ำทุก 50K ที่เพิ่ม (ไม่เตือนทุกข้อความ)
// อ่าน input ไม่ได้ / หา transcript ไม่เจอ = เงียบ (ไม่ให้ hook พังแล้วบังงาน)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const WARN_AT = 250_000
const WARN_STEP = 50_000
const TAIL_BYTES = 4 * 1024 * 1024

const GUIDE = [
  'คู่มือบันทึกงาน คลังยา',
  '• Memory · ทะเบียน · บันทึกงานรายวัน: Claude ทำให้เอง ไม่ต้องพิมพ์',
  '• update context: พิมพ์เมื่อมีการตัดสินใจใหญ่ · เปลี่ยนวิธีทำงานหรือโครงสร้างไฟล์ · ปิดงวด · แก้ยอดที่ต้องย้อนดูได้',
  '• /handoff: พิมพ์เมื่อ context ~250K (ดูด้วย /context) · เปลี่ยนเรื่องงาน · ทิ้งเกิน 1 ชม.',
].join('\n')

function readTail(file) {
  const fd = fs.openSync(file, 'r')
  try {
    const { size } = fs.fstatSync(fd)
    const len = Math.min(size, TAIL_BYTES)
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, size - len)
    return buf.toString('utf8')
  } finally {
    fs.closeSync(fd)
  }
}

// ไล่จากท้าย: เจอ /clear หรือ compact ก่อน = เพิ่งเริ่มใหม่ · เจอ assistant = ใช้ usage ของมัน
function contextTokens(file) {
  const lines = readTail(file).split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]) continue
    let o
    try { o = JSON.parse(lines[i]) } catch { continue }
    if (o.isSidechain) continue
    if (o.type === 'system' && o.subtype === 'compact_boundary') return 0
    const content = o.message?.content
    if (o.type === 'user' && typeof content === 'string' && content.includes('<command-name>/clear</command-name>')) return 0
    if (o.type !== 'assistant') continue
    const u = o.message?.usage
    if (!u) continue
    const total = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
    if (total > 0) return total
  }
  return 0
}

function warnOnce(input) {
  const tokens = contextTokens(input.transcript_path)
  if (tokens < WARN_AT) return
  const band = WARN_AT + Math.floor((tokens - WARN_AT) / WARN_STEP) * WARN_STEP
  const id = String(input.session_id || 'x').replace(/[^\w-]/g, '')
  const stateFile = path.join(os.tmpdir(), `claude-context-warn-${id}.txt`)
  let last = 0
  try { last = Number(fs.readFileSync(stateFile, 'utf8')) || 0 } catch { /* ยังไม่เคยเตือน */ }
  if (band <= last) return
  fs.writeFileSync(stateFile, String(band))
  const k = Math.round(tokens / 1000)
  process.stdout.write(JSON.stringify({
    systemMessage: `context ถึง ~${k}K แล้ว ควร /handoff แล้ว /clear เมื่อจบงานชิ้นนี้`,
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: `context ถึง ~${k}K (เกณฑ์ handoff 250K) — บอก user ในคำตอบนี้ 1 บรรทัดว่าควร /handoff เมื่อจบงานชิ้นนี้`,
    },
  }))
}

function main() {
  let input
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')) } catch { return }
  if (input.hook_event_name === 'SessionStart') {
    process.stdout.write(JSON.stringify({ systemMessage: GUIDE }))
    return
  }
  if (input.hook_event_name === 'UserPromptSubmit') warnOnce(input)
}

try { main() } catch { /* เงียบ */ }
