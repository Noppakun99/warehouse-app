// PreToolUse hook (Edit|Write|MultiEdit|NotebookEdit) — บล็อกการแก้ไฟล์ใน src/ · supabase/functions/ · tests/ · scripts/loan-slip.mjs
// ถ้าใน session นี้ยังไม่ได้ Read src/CLAUDE.md (root CLAUDE.md สั่งไว้ แต่ส่วนขยาย VS Code ไม่โหลดให้เอง — ทดสอบ 19/10/2569)
// นับเฉพาะ Read ที่เกิดหลัง /clear หรือ compact ครั้งล่าสุด (ก่อนนั้นเนื้อหาหลุดจาก context แล้ว)
// อ่าน input ไม่ได้ / หา transcript ไม่เจอ = ปล่อยผ่าน (ไม่ให้ hook พังแล้วแก้ไฟล์ไม่ได้ทั้ง repo)
import fs from 'node:fs'
import path from 'node:path'

const GUARDED = [/^src\//, /^supabase\/functions\//, /^tests\//, /^scripts\/loan-slip\.mjs$/]
const norm = (p) => String(p || '').replace(/\\/g, '/').toLowerCase()

function main() {
  let input
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')) } catch { return }

  const ti = input.tool_input || {}
  const target = ti.file_path || ti.notebook_path
  if (!target) return

  const root = norm(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()).replace(/\/$/, '')
  const abs = norm(path.resolve(input.cwd || process.cwd(), target))
  if (!abs.startsWith(root + '/')) return
  const rel = abs.slice(root.length + 1)
  if (rel === 'src/claude.md') return
  if (!GUARDED.some((re) => re.test(rel))) return

  const want = root + '/src/claude.md'
  let lines
  try { lines = fs.readFileSync(input.transcript_path, 'utf8').split('\n') } catch { return }

  let seen = false
  for (const line of lines) {
    if (!line) continue
    let o
    try { o = JSON.parse(line) } catch { continue }
    if (o.isSidechain) continue
    const content = o.message?.content
    if (o.type === 'system' && o.subtype === 'compact_boundary') { seen = false; continue }
    if (o.type === 'user' && typeof content === 'string' && content.includes('<command-name>/clear</command-name>')) { seen = false; continue }
    if (o.type !== 'assistant' || !Array.isArray(content)) continue
    for (const c of content) {
      if (c?.type === 'tool_use' && c.name === 'Read' && norm(path.resolve(root, c.input?.file_path || '')) === want) seen = true
    }
  }
  if (seen) return

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `ยังไม่ได้ Read src/CLAUDE.md ใน session นี้ (หรือหลัง /clear · compact) — ต้อง Read ไฟล์นั้นก่อนแก้ ${rel} ` +
        '(Critical Rules ตัวเต็ม + กฎของ src/ · supabase/functions/ · tests/ · scripts/loan-slip.mjs อยู่ในนั้น) แล้วค่อยแก้ใหม่',
    },
  }))
}

main()
