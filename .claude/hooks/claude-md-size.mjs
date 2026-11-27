// SessionStart + PostToolUse(Edit|Write|MultiEdit) — user สั่ง 27/11/2569: เตือนเมื่อ CLAUDE.md เกินแนวทาง Nate Herk
// แนวทาง (docs/reference-nateherk-ai-automation.md §5): CLAUDE.md = ป้ายบอกทาง ≤ 200 บรรทัด (คลิปแนะนำ 150–200)
// รายละเอียดเฉพาะงานย้ายไป skill / docs/ ที่โหลดเมื่อจำเป็น
// MAX_CHARS ตั้งเพิ่มเอง: ไฟล์นี้บรรทัดยาว (ตาราง/ย่อหน้ายาว) นับบรรทัดอย่างเดียวรวมบรรทัดหนีเกณฑ์ได้
// ตรวจเฉพาะ CLAUDE.md ที่ root (โหลดทุก turn) — src/CLAUDE.md อ่านเมื่อแก้โค้ดเท่านั้น
// อ่าน input ไม่ได้ / ไม่มีไฟล์ = เงียบ (hook ห้ามบังงาน)
import fs from 'node:fs'
import path from 'node:path'

const MAX_LINES = 200
const MAX_CHARS = 30_000

function measure(file) {
  const text = fs.readFileSync(file, 'utf8')
  return { lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0), chars: [...text].length }
}

function overMsg(m) {
  const parts = []
  if (m.lines > MAX_LINES) parts.push(`${m.lines} บรรทัด (เกณฑ์ ${MAX_LINES})`)
  if (m.chars > MAX_CHARS) parts.push(`${m.chars.toLocaleString('en-US')} ตัวอักษร (เกณฑ์ ${MAX_CHARS.toLocaleString('en-US')})`)
  return parts.length ? parts.join(' · ') : ''
}

const FIX = 'วิธีแก้: CLAUDE.md เก็บแค่ป้ายบอกทาง + กฎที่ห้ามพลาด · รายละเอียดย้ายไป skill (.claude/skills/) หรือ docs/ แล้วเหลือบรรทัด pointer · ห้ามรวมบรรทัดเพื่อหนีเกณฑ์ · ดู docs/reference-nateherk-ai-automation.md §5'

let input = {}
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}') } catch { process.exit(0) }
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd
if (!root) process.exit(0)
const file = path.join(root, 'CLAUDE.md')
if (!fs.existsSync(file)) process.exit(0)

const event = input.hook_event_name
if (event === 'PostToolUse') {
  const target = input.tool_input?.file_path
  if (!target || path.resolve(target).toLowerCase() !== path.resolve(file).toLowerCase()) process.exit(0)
}

let m
try { m = measure(file) } catch { process.exit(0) }
const over = overMsg(m)
if (!over) process.exit(0)

const ctx = `⚠ CLAUDE.md เกินแนวทาง Nate Herk: ${over} — ${FIX}`
const out = { hookSpecificOutput: { hookEventName: event, additionalContext: ctx } }
if (event === 'SessionStart') out.systemMessage = `CLAUDE.md เกินแนวทาง: ${over} — บอก Claude ให้ย้ายรายละเอียดไป skill/docs`
process.stdout.write(JSON.stringify(out))
