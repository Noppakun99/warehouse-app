// PreToolUse hook (Read) — บล็อกการเปิดรูปในโฟลเดอร์พัก ใบเบิกยา\ และ บิลยา\ จนกว่าจะโหลด skill ของงานนั้น
// กฎลงใบเบิก/ลงบิลย้ายจาก CLAUDE.md เข้า skill แล้ว (09/11/2569) กฎมาจากงานที่เคยลงผิดจริง จึงกันที่จุดเริ่มงาน (การอ่านรูป)
// ไม่กันที่ dispense-pdf.ps1 เพราะมักถูกเรียกผ่าน wrapper และตอนนั้นสายเกินไปสำหรับกฎอ่านรูป
// นับเฉพาะการโหลดหลัง /clear หรือ compact ครั้งล่าสุด · อ่าน input/transcript ไม่ได้ = ปล่อยผ่าน
import fs from 'node:fs'

const GATES = [
  { re: /เอกสารคลังยา_รอลง\/ใบเบิกยา\//, skill: 'dispense-entry', work: 'ลงใบเบิก' },
  { re: /เอกสารคลังยา_รอลง\/บิลยา\//, skill: 'bill-entry', work: 'ลงบิล' },
]

function textOf(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((c) => (c?.type === 'text' ? c.text || '' : '')).join('\n')
}

function main() {
  let input
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')) } catch { return }

  const target = String(input.tool_input?.file_path || '').replace(/\\/g, '/').normalize('NFC')
  const gate = GATES.find((g) => g.re.test(target))
  if (!gate) return

  let lines
  try { lines = fs.readFileSync(input.transcript_path, 'utf8').split('\n') } catch { return }

  const typed = `<command-name>/${gate.skill}</command-name>`
  let loaded = false
  for (const line of lines) {
    if (!line) continue
    let o
    try { o = JSON.parse(line) } catch { continue }
    if (o.isSidechain) continue
    if (o.type === 'system' && o.subtype === 'compact_boundary') { loaded = false; continue }
    const content = o.message?.content
    if (o.type === 'user') {
      const text = textOf(content)
      if (text.includes('<command-name>/clear</command-name>')) { loaded = false; continue }
      if (text.includes(typed)) loaded = true
      continue
    }
    if (o.type !== 'assistant' || !Array.isArray(content)) continue
    for (const c of content) {
      if (c?.type !== 'tool_use' || c.name !== 'Skill') continue
      const name = String(c.input?.skill || '')
      if (name === gate.skill || name.endsWith(':' + gate.skill)) loaded = true
    }
  }
  if (loaded) return

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `รูปนี้เป็นงาน${gate.work} — ต้องเรียก Skill "${gate.skill}" ก่อนอ่านรูป (หลัง /clear หรือ compact ต้องโหลดใหม่) กฎอ่านรูปและลงข้อมูลอยู่ในนั้น แล้วค่อย Read ซ้ำ`,
    },
  }))
}

main()
