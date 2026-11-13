// SessionStart / UserPromptSubmit / Stop hook — ตอบ user 04/11/2569 "จะรู้ได้อย่างไรว่าตอนไหนควรบันทึก context"
// + 13/11/2569 "context ถึง 250K ให้เขียน handoff ขึ้น session ใหม่"
// SessionStart: แสดงคู่มือย่อ (systemMessage ให้คนอ่าน ไม่เข้า context จึงไม่กิน token)
//   ถ้าเป็น /clear และมี handoff ที่ Stop สั่งเขียนไว้ไม่เกิน 3 ชม. → ส่ง path ให้ session ใหม่อ่านต่อเอง (ใช้ได้ครั้งเดียว)
// Stop: context ถึง 250K ครั้งแรกของ session → block การจบ turn แล้วสั่ง Claude เขียน handoff ลง HANDOFF_DIR
//   (hook สั่ง /clear เองไม่ได้ — user ต้องพิมพ์)
// UserPromptSubmit: เตือนซ้ำทุก 50K ที่เพิ่มหลังผ่าน 250K (band 250K ถูก Stop จองไว้แล้ว จึงไม่เตือนซ้ำ)
// อ่าน input ไม่ได้ / หา transcript ไม่เจอ = เงียบ (ไม่ให้ hook พังแล้วบังงาน)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const WARN_AT = 250_000
const WARN_STEP = 50_000
const TAIL_BYTES = 4 * 1024 * 1024
const HANDOFF_MAX_AGE_MS = 3 * 60 * 60 * 1000

const GUIDE = [
  'คู่มือบันทึกงาน คลังยา',
  '• Memory · ทะเบียน · บันทึกงานรายวัน: Claude ทำให้เอง ไม่ต้องพิมพ์',
  '• update context: พิมพ์เมื่อมีการตัดสินใจใหญ่ · เปลี่ยนวิธีทำงานหรือโครงสร้างไฟล์ · ปิดงวด · แก้ยอดที่ต้องย้อนดูได้',
  '• handoff: context ถึง 250K Claude เขียนให้เอง → พิมพ์ /clear แล้ว session ใหม่อ่านต่อเอง · เปลี่ยนเรื่องงาน/ทิ้งเกิน 1 ชม. พิมพ์ /handoff เอง',
].join('\n')

// แยกโฟลเดอร์ต่อโปรเจกต์ — handoff ของงานอื่นจะไม่โผล่ใน session ของ repo นี้
function handoffDir(input) {
  const key = String(input.cwd || process.env.CLAUDE_PROJECT_DIR || 'x').replace(/[^\w-]/g, '_').slice(-60)
  return path.join(os.tmpdir(), 'claude-handoff', key)
}

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

function stateFileOf(input) {
  const id = String(input.session_id || 'x').replace(/[^\w-]/g, '')
  return path.join(os.tmpdir(), `claude-context-warn-${id}.txt`)
}

function lastBand(input) {
  try { return Number(fs.readFileSync(stateFileOf(input), 'utf8')) || 0 } catch { return 0 }
}

function bandOf(tokens) {
  return WARN_AT + Math.floor((tokens - WARN_AT) / WARN_STEP) * WARN_STEP
}

function warnOnce(input) {
  const tokens = contextTokens(input.transcript_path)
  if (tokens < WARN_AT) return
  const band = bandOf(tokens)
  if (band <= lastBand(input)) return
  fs.writeFileSync(stateFileOf(input), String(band))
  const k = Math.round(tokens / 1000)
  process.stdout.write(JSON.stringify({
    systemMessage: `context ถึง ~${k}K แล้ว ควร /handoff แล้ว /clear เมื่อจบงานชิ้นนี้`,
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: `context ถึง ~${k}K (เกณฑ์ handoff 250K) — บอก user ในคำตอบนี้ 1 บรรทัดว่าควร /handoff เมื่อจบงานชิ้นนี้`,
    },
  }))
}

// ครั้งเดียวต่อ session: ใช้ไฟล์ marker แยกจาก state ของการเตือน
function autoHandoff(input) {
  if (input.stop_hook_active) return
  const tokens = contextTokens(input.transcript_path)
  if (tokens < WARN_AT) return
  const id = String(input.session_id || 'x').replace(/[^\w-]/g, '')
  const marker = path.join(os.tmpdir(), `claude-handoff-done-${id}.txt`)
  if (fs.existsSync(marker)) return
  fs.writeFileSync(marker, new Date().toISOString())
  // จอง band ปัจจุบันไว้ — UserPromptSubmit จะไม่เตือนซ้ำเรื่องเดียวกัน
  fs.writeFileSync(stateFileOf(input), String(Math.max(lastBand(input), bandOf(tokens))))

  const dir = handoffDir(input)
  fs.mkdirSync(dir, { recursive: true })
  const d = new Date()
  const p2 = n => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`
  const file = path.join(dir, `handoff-${stamp}.md`)
  const k = Math.round(tokens / 1000)
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason:
      `context ถึง ~${k}K (เกณฑ์ 250K) — ทำ handoff อัตโนมัติตอนนี้: ` +
      `ใช้โครงตามสกิล handoff (.claude/skills/handoff/SKILL.md ครบ 9 หัวข้อ) แต่เซฟลง path นี้เท่านั้น: ${file} ` +
      `(ถ้า user เคยสั่ง handoff แบบ git ใน session นี้ ให้ทำแบบนั้นด้วย) — ห้ามทำงานอื่นต่อ. ` +
      `ถ้ามีงานที่ยังไม่เสร็จหรือ background task ค้าง ให้บันทึกในหัวข้อ 5 ของ handoff ห้ามเริ่มงานใหม่. ` +
      `จากนั้นบอก user สั้นๆ ว่าเขียน handoff ไว้ที่ไหน และ "พิมพ์ /clear ได้เลย session ใหม่จะอ่าน handoff ต่อเอง"`,
    systemMessage: `context ถึง ~${k}K — Claude กำลังเขียน handoff ให้อัตโนมัติ เสร็จแล้วพิมพ์ /clear`,
  }))
}

// หลัง /clear: หา handoff ล่าสุดที่ยังไม่ใช้ และไม่เก่าเกิน 3 ชม. → ส่งให้ session ใหม่ แล้ว mark ว่าใช้แล้ว
function pickupHandoff(input) {
  const dir = handoffDir(input)
  let files
  try { files = fs.readdirSync(dir).filter(f => /^handoff-.*\.md$/.test(f) && !f.endsWith('.used.md')) } catch { return null }
  const now = Date.now()
  const fresh = files
    .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .filter(x => now - x.t <= HANDOFF_MAX_AGE_MS)
    .sort((a, b) => b.t - a.t)[0]
  if (!fresh) return null
  const src = path.join(dir, fresh.f)
  const used = src.replace(/\.md$/, '.used.md')
  fs.renameSync(src, used)
  return used
}

function main() {
  let input
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')) } catch { return }
  if (input.hook_event_name === 'SessionStart') {
    const h = input.source === 'clear' ? pickupHandoff(input) : null
    if (!h) {
      process.stdout.write(JSON.stringify({ systemMessage: GUIDE }))
      return
    }
    process.stdout.write(JSON.stringify({
      systemMessage: `${GUIDE}\n• พบ handoff จาก session ก่อน: ${h} — Claude จะอ่านต่อให้`,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext:
          `session ก่อนหน้าเขียน handoff อัตโนมัติไว้ที่: ${h} — ` +
          `ในคำตอบแรกให้อ่านไฟล์นั้น แล้วสรุปสั้นๆ ว่าเข้าใจสถานะว่าอะไร + ขั้นถัดไปคืออะไร รอ user ยืนยันก่อนลงมือ ` +
          `(ถ้าข้อความแรกของ user เป็นเรื่องอื่นชัดเจน ให้ทำตาม user และบอก 1 บรรทัดว่ามี handoff ค้างที่ path นี้)`,
      },
    }))
    return
  }
  if (input.hook_event_name === 'UserPromptSubmit') warnOnce(input)
  if (input.hook_event_name === 'Stop') autoHandoff(input)
}

try { main() } catch { /* เงียบ */ }
