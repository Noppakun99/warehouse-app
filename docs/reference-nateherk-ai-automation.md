# อ้างอิงภายนอก: Nate Herk | AI Automation (YouTube) — วิธีทำงานกับ Claude Code / AI

> **ใช้ไฟล์นี้เมื่อ:** จะปรับ CLAUDE.md · skill · hook/permission · วิธีวิเคราะห์ · การเชื่อมระบบ/ตั้งงานอัตโนมัติ · ออกแบบฟีเจอร์ AI ในแอป · **token ไม่พอ / จะใช้ Codex คู่ (§6) · วิธี handoff + `/clear` (§7)**
> **ที่มา:** อ่านคำบรรยาย (transcript) ผ่าน Playwright เมื่อ 10/10/2569 (§2.1–2.7) และ 18/10/2569 (§2.8–2.11) — สรุปและแปลเป็นภาษาของเรา ไม่ใช่คำต่อคำ · transcript ดิบเก็บไว้ในเครื่องที่ `.playwright-mcp/nateherk/*.json` (gitignored — ไม่ขึ้น repo)
> **ข้อควรระวัง:** เป็นความเห็นของ creator คนหนึ่ง (มีโฆษณาคอร์ส/สปอนเซอร์ปน) — ก่อนเอามาใช้ให้เทียบกับเอกสารทางการของ Anthropic และทดลองกับงานของเราเองก่อนเสมอ · plugin ของบุคคลที่สามมี hook/MCP ที่รันโค้ดได้ — **ตรวจโค้ดก่อนติดตั้ง**

## 1. ข้อมูลช่อง (ณ 10/10/2569)
- https://www.youtube.com/@nateherk · ผู้ติดตาม 1.06M · 542 วิดีโอ · เนื้อหา: AI automation, n8n, Claude Code, agent, เทียบโมเดล
- **ยอดวิวสูงสุด (Popular):** Build & Sell n8n AI Agents (8+ ชม.) 1.9M · Build & Sell with Claude Code (10+ ชม.) 1.1M · Team of AI Agents in n8n 1.1M · Karpathy LLM Wiki 714k · Ollama + Claude Code 661k · Beautiful Websites with Claude Code 572k · n8n Masterclass 555k · Build & Sell Claude Code Operating Systems 488k · 32 Tricks 478k · 100+ Skills → 6 Best 459k · Master 95% of Claude Code in 36 Mins 444k · WhatsApp Agent with n8n 398k · Claude Agent Teams 366k

## 2. คลิปที่ศึกษาแล้ว (11 คลิป)

### 2.1 What to Build Instead of AI Agents — 359,876 วิว · 13/09/2026 · https://www.youtube.com/watch?v=HIRDzMtuWFk
ทีมที่สร้าง agent skills ของ Anthropic เลิกสร้าง agent แยกต่องาน → ใช้ agent ทั่วไปตัวเดียว + **skill** (โมเดล = CPU, runtime = OS, skill = แอป). 4 ข้อที่ทำให้ skill ดี:
1. **อย่าให้ AI เขียนโค้ดเดิมซ้ำ** — สคริปต์ที่ใช้ได้แล้วให้เก็บใน `scripts/` ของ skill ("เครื่องมือให้ตัวเองในอนาคต") แล้วแก้ SKILL.md ให้เรียกไฟล์นั้น → ทดสอบรันซ้ำ 2 รอบเทียบผล
2. **คำอธิบาย skill ต้องบอกชัดว่าทำอะไร + ใช้เมื่อไร** (Claude อ่านแค่ชื่อ+คำอธิบายก่อน = progressive disclosure) · skill สองตัวห้ามแย่งงานกัน · ทดสอบ 3 แบบ: คำขอตรงๆ / คำขอคนละถ้อยคำ / คำขอที่ไม่เกี่ยว (ต้องไม่ trigger)
3. **ทุกครั้งที่แก้งาน ให้บทเรียนลงไปอยู่ใน skill** — ถามว่าพลาดเพราะขั้นตอน / ขาดบริบท / กฎอ่อน / โค้ดไม่เสถียร แล้วแก้ "จุดเล็กที่สุดที่ทนทาน" + รันซ้ำยืนยัน
4. **ตรวจก่อนส่ง (สำคัญที่สุด)** — กำหนดเกณฑ์ผ่านก่อน · ใช้หลักฐานภายนอก (ภาพหน้าจอ ผลเทส แหล่งข้อมูล) ไม่ใช่ "อ่านงานตัวเองแล้วบอกว่าดี" · งานเชิงรสนิยมให้ persona หลายแบบรีวิว · "งานที่คนเห็นครั้งแรก ไม่ควรเป็นงานที่ AI ทำครั้งแรก"

### 2.2 I Turned Claude Into the Ultimate Second Brain — 381,458 วิว · 10/06/2026 · https://www.youtube.com/watch?v=8QQ_INxAhRs
- **4C ตามลำดับ:** Context (เราคือใคร งานคืออะไร) → Connections (ข้อมูลสด: API/CLI — เขาชอบ CLI/API มากกว่า MCP เพราะคุมได้และถูกกว่า) → Capabilities (skill/automation) → **Cadence** (ทำเองตามรอบ — *ต้อง "ได้สิทธิ์" ก่อน*: ทำเฉพาะ skill ที่พิสูจน์แล้ว · ต้นทุน/ความเสี่ยง/การดูแลเพิ่มขึ้น · ต้องมีเจ้าของคอยดู)
- **CLAUDE.md = ป้ายบอกทาง (router)** ชี้ว่าความรู้/กฎ/skill อยู่ไฟล์ไหน — วัดง่ายๆ: agent หาไฟล์เจอเร็วไหม
- **ข้อมูลนิ่งค้าง → AI ตอบผิดอย่างมั่นใจ** (AI ของเขาตอบยอด subscriber 620k ทั้งที่จริง 800k)
- **"A prompt is never a permission layer" — "If it can, it will" — ใช้กุญแจ ไม่ใช่คำสั่ง**: agent ของทีมเขาเคยส่งอีเมลโค้ดส่วนลดถึง 150–200k คนเพราะตีความงานผิด → จำกัดสิทธิ์ที่ระดับเครื่องมือ ไม่ใช่เขียนห้ามใน prompt
- เคล็ดลับ: ใช้ AI เป็นคู่คิดแต่ให้เล่นบทค้าน (ระวังนิสัยเอาใจ) · skill "grill me" (ที่มาเดียวกับ `/grill-with-docs` ของเรา) ดึงความรู้ออกจากหัวผู้ใช้ · ตรวจงานด้วยภาพ/คลิกผ่าน Playwright โดย persona (มือใหม่ / วิศวกร / เจ้าของธุรกิจ) · ทั้งหมดคือ "โฟลเดอร์กับไฟล์" — เปลี่ยนโมเดลหรือเครื่องมือได้

### 2.3 Andrej Karpathy Just 10x'd Everyone's Claude Code (LLM Wiki) — 714,418 วิว · 06/04/2026 · https://www.youtube.com/watch?v=sboNwYmH3AY
- คลังความรู้ = โฟลเดอร์ markdown: `raw/` (ต้นฉบับ) → `wiki/` (หน้าที่ AI จัด+ลิงก์ถึงกัน) + `index.md` (สารบัญ) + `log.md` (ประวัติการนำเข้า) + CLAUDE.md อธิบายวิธีค้น/อัปเดต
- **ข้อมูลไม่ใหญ่ (Karpathy ~100 บทความ) ไม่ต้องมี vector DB/RAG** — AI ดูแล index + สรุปสั้นได้เอง · มีคนลด token ตอนถาม 95% จากการจัดไฟล์กระจัดกระจาย 383 ไฟล์เป็น wiki · ความรู้ "ทบต้น" แทนที่จะหายไปกับแชท

### 2.4 Claude Code Mods Are Game Changers — 222,121 วิว · 03/10/2026 · https://www.youtube.com/watch?v=9hetShMMp2s
- mod = plugin ปรับหน้าตา/พฤติกรรม Claude Code ด้วยภาษาธรรมดา · ตัวอย่างทางการ: **token weather** (บริบทเต็มแค่ไหน) · **blast radius** (แสดงสิ่งที่จะถูกลบ/เปลี่ยนก่อนทำ ให้กดยืนยัน) · replay theater · **next steps**
- ของเขา: cache keeper (เตือนก่อน prompt cache หมดอายุ + ปุ่ม handoff→clear) · record mode (บังข้อมูลอ่อนไหวตอนอัดจอ) · goal progress
- **วิธีหาว่าควรทำ mod อะไร:** ให้ Claude อ่าน session log ย้อนหลัง หาสิ่งที่ผู้ใช้พูด/ทำซ้ำบ่อย แล้วเสนอ 5 อันดับ

### 2.5 32 Tricks to Level Up Claude Code in 16 Mins — 478,631 วิว · 27/04/2026 · https://www.youtube.com/watch?v=jqoFP9QapXI
ข้อที่เกี่ยวกับเรา: status line (โมเดล/% context/ค่าใช้จ่าย) · บริบทเล็ก + `/context` หาว่าอะไรกิน token · `/compact` ราว 60% (สั่งให้เก็บเรื่องสำคัญไว้ได้) และ `/clear` เมื่อเปลี่ยนงาน · เริ่มด้วย plan mode · ให้ถามจนมั่นใจ 95% · **ใส่ขั้นตรวจลงใน to-do** (ทำ→ถ่ายภาพ→ตรวจ) · subagent ทำงานขนาน + ใช้โมเดลถูกกับงานอ่านเยอะ · **CLAUDE.md อัปเดตกับดักใหม่เสมอ แต่คุมไว้ 150–200 บรรทัด และให้ชี้ไปไฟล์อื่น** · หยุดเร็วเมื่อเริ่มผิดทาง · ท้าทายผลงานแล้วสั่งให้อัปเดต skill/CLAUDE.md · `/rewind` · hook แจ้งเสียงเมื่อเสร็จ · ภาพหน้าจอ + DevTools ตรวจหน้าเว็บ · git worktree ทำหลายงานขนาน · **API ตรง vs MCP** (MCP โหลดนิยามเครื่องมือทั้งหมดเข้าบริบท) · `/loop` งานซ้ำ (≤3 วัน) · **permission: allow คำสั่งที่ปลอดภัย / deny คำสั่งทำลาย (deny ชนะ allow)** แทน skip permissions · agent teams · Context7 MCP (เอกสารไลบรารีเวอร์ชันล่าสุด)

### 2.6 I Tried 100+ Claude Code Skills. These 6 Are The Best — 459,435 วิว · 03/05/2026 · https://www.youtube.com/watch?v=eRS3CmvrOvA
skill ที่ธุรกิจจ่ายเงินให้จริงคือ "ประหยัดเวลา/เงิน/ลดความผิดพลาด": **skill-creator** (ทางการ — เรามี `anthropic-skills:skill-creator`) · **superpowers** (บังคับวางแผน→เทสก่อน→รีวิว 2 ชั้น: ตรงสเปก + คุณภาพโค้ด) · **GSD** (subagent ใหม่ต่องาน กัน context rot + ตรวจ "แอบตัดขอบเขต") · **`/review` และ `/ultrareview`** (ในตัว — ของเราเรียกผ่าน `/code-review`, ultra มีค่าใช้จ่าย) · **context-mode** (กรอง output เครื่องมือก่อนเข้าบริบท — เขาอ้าง Playwright snapshot 56KB → ~0.3KB + กู้ session หลัง compact) · **claude-mem** (ความจำข้าม session อัตโนมัติ)

### 2.7 Anthropic Engineers Just 10x'd Everyone's Claude Code — 74,009 วิว · 09/10/2026 · https://www.youtube.com/watch?v=oz2CwrPV2Rg
- Anthropic ตัด system prompt ของ Claude Code **>80%** สำหรับโมเดลรุ่น 5 โดยผลประเมินไม่ลด — กฎที่จำเป็นกับโมเดลรุ่นเก่ากลายเป็นข้อจำกัดเกินไป (เช่น จำกัดจำนวน comment → เปลี่ยนเป็น "ทำตามสไตล์โค้ดรอบข้าง")
- ผู้สร้าง Claude Code แนะนำให้ล้าง skill ทุก ~6 เดือน แล้วเพิ่มกลับเฉพาะที่ยังจำเป็น
- **บริบทที่ดีที่สุด = น้อยที่สุดที่ได้ผลดีที่สุดในราคาถูกที่สุด** · น้อย ≠ สั้น (รายละเอียดที่จำเป็นต้องอยู่) · งานวิจัย 2025: input ยาวขึ้น ผลแย่ลง 13.9–85% · โหลดนิยามเครื่องมือเมื่อจำเป็น ลด token 85% และคะแนนดีขึ้น
- **กำหนด "เสร็จคืออะไร"** = ผลลัพธ์ + เหตุผล + ข้อจำกัด แล้วปล่อยให้โมเดลทำ
- **`/doctor`** ตรวจ skill (จำนวนครั้งที่ใช้, token ของคำอธิบาย, skill ที่ไม่เคยใช้, frontmatter เสีย) · ข้อความซ้ำใน CLAUDE.md · แหล่ง memory ที่โหลดโดยไม่รู้ตัว · settings/hook/permission — แล้วเสนอแก้ให้
- prompt ตัวอย่าง: "ตรวจ repo นี้ แล้วบอกการเปลี่ยนแปลงที่เล็กที่สุดที่ทำให้ <งาน> เร็วขึ้น ใช้ระบบที่มีอยู่ อ้างไฟล์ที่จะใช้ซ้ำ **ยังไม่ต้องแก้อะไร**"

### 2.8 How to Never Hit Your Claude Session Limit Again — 165k วิว · ~05/2026 · https://www.youtube.com/watch?v=_qZvORxGqI0
(คลิปนี้ + 2.9–2.11 อ่าน transcript เมื่อ 18/10/2569 — ดูวิธีดึงใน §9)
- **ทุกข้อความ Claude อ่านแชทใหม่ตั้งแต่ข้อความแรก** → ต้นทุนทบต้น ไม่ใช่บวกทีละข้อ (ข้อความที่ 1 ≈ 500 token, ข้อความที่ 30 ≈ 15,500) · มีคนวัดแชท 100+ ข้อความ: **98.5% ของ token หมดไปกับการอ่านแชทเก่า**
- **context rot**: ความแม่นยำในการหาข้อมูลตกจาก 92% (256K) เหลือ 78% (1M) · session ยาว → คิดตื้นลง 67%, แก้ไฟล์โดยไม่อ่านก่อนเพิ่มจาก 6% เป็น 34%
- **autocompact (~95%) ช้าเกินไป** เก็บรายละเอียดได้แค่ 20–30% และทำตอนโมเดลแย่ที่สุด
- หลังแต่ละคำตอบมี 5 ทาง: ตอบต่อ · **`/rewind`** (Esc 2 ครั้ง — ย้อนไปก่อนจุดที่ผิด ดีกว่าพิมพ์ "ผิด ลองใหม่" เพราะความพยายามที่พังยังค้างในบริบท) · `/clear` · `/compact` · ส่ง subagent
- **วิธีของเขา: ไม่ใช้ `/compact` เลย** — เกิน ~120K token (12% ของ 1M) สั่ง skill `/session handoff` → ก๊อปผล → `/clear` → วาง · คู่กับ**ไฟล์บันทึกนอกแชท** (แผน, decision log, task list) ทำให้ reset แล้วไม่รู้สึกว่า reset — skill `/handoff` ของเราทำตามแบบนี้
- `/context` ใน session ใหม่ (ของเขาเคยกิน 62K ก่อนพิมพ์อะไร) · CLAUDE.md ≤ 200 บรรทัด · `.claudeignore`
- **แปลงเป็น markdown ก่อนให้อ่าน**: HTML ลด ~90%, PDF ลด 65–70%, docx ลด ~33% (เครื่องมือ Docling) — ยกเว้นงานที่ต้องดูภาพ/OCR
- `/btw` ถามเรื่องข้างเคียงโดยไม่เข้าแชทหลัก · plan mode ก่อนลงมือ · subagent ใช้ Haiku กับงานสรุป/อ่านเยอะ
- สั่ง "ตอบสั้นๆ" ช่วยน้อยกว่าที่คิด — output ส่วนใหญ่อยู่ใน tool call ที่เราไม่เห็น
- **session chaining**: แยก session สำรวจ → วางแผน → ลงมือ ส่งต่อด้วยไฟล์สรุป
- ดู % limit ตลอด: ใกล้หมด → พัก · เหลือเยอะแต่ใกล้ reset → ใช้งานหนักให้คุ้ม

### 2.9 How to Use Your Claude Code Projects in Codex in 5 Mins — 75k วิว · ~06/2026 · https://www.youtube.com/watch?v=kB9iMD0EjT8
- เปิด Claude Code + Codex **คนละ terminal ในโปรเจกต์เดียวกัน** ทำคนละงาน · Claude ติด → `/session handoff` → วางใน Codex → บางครั้งแก้ได้ใน 10 วินาที
- ความรู้ที่ใช้ร่วมกันได้ทันที: docs, reference, scripts · ที่ต่างคือชื่อไฟล์ตั้งค่า:

| Claude Code | Codex |
|---|---|
| `CLAUDE.md` | `AGENTS.md` |
| `.claude/skills/` | `.agents/skills/` (ไฟล์ SKILL.md **รูปแบบเดียวกัน**) |
| `.claude/agents/*.md` | `.codex/agents/*.toml` |
| `.claude/settings*.json` | `.codex/config.toml` |
| subagent เรียกเองอัตโนมัติ | **ต้องสั่งเรียกเอง** |

- ย้ายด้วย prompt เดียว: *"โปรเจกต์นี้สร้างด้วย Claude Code — สร้าง AGENTS.md จาก CLAUDE.md, ย้าย skills ไป .agents, agents ไป .codex, ค้นเอกสารทั้งสองฝั่งให้แปลงครบ"* · แก้ CLAUDE.md เมื่อไรต้องแก้ AGENTS.md ตาม · ระวังสอง agent แก้ไฟล์เดียวกันทับกัน
- แนวคิด: **"tool agnostic"** — ยอมจ่าย 2 subscription (Claude + ChatGPT) ถ้าไหว ไม่ผูกกับเจ้าเดียว

### 2.10 100 Hours Testing Claude Code vs ChatGPT Codex — 152k วิว · กลาง 05/2026 · https://www.youtube.com/watch?v=RLjaUES9P8A
- **ความรู้สึกหลังใช้นาน**: Claude สร้างสรรค์กว่า ช่วยระดมไอเดีย ค้านเมื่อเราผิดทาง · Codex ทำตามคำสั่งตรงกว่า (โดยเฉพาะงานยาว) และรีวิวโค้ด/หาช่องโหว่ในแผนคมกว่า
- ทดสอบ 3 งาน prompt เดียวกัน (GPT-5.5 high vs Opus 4.7 high): **Claude ชนะงาน frontend/dashboard/design** (dashboard: 2 นาที, 283K token vs Codex 8 นาที, 1.64M) · **Codex ชนะงาน research/รายงาน PDF** (2.8M vs 4.7M token) · **output token ของ Codex น้อยกว่า 2–5 เท่าทุกงาน** → เหตุผลที่ชน limit ช้ากว่า
- ข้อจำกัด: ทดสอบแค่ 3 ครั้ง ไม่มีนัยสำคัญทางสถิติ · ตัวเลขผูกกับรุ่นโมเดล ณ ตอนนั้น
- **ใช้ Claude**: frontend, งานต้องวางแผนลึก, hooks/skills/subagent อัตโนมัติ · **ใช้ Codex**: research จากเว็บ, เอกสาร/รายงาน, รีวิวโค้ด, ทำตามแผนที่วางแล้ว
- คนที่ได้ผลดี: **วางแผน/brainstorm ด้วย Claude → Codex รีวิวหรือลงมือตามแผน**
- Anthropic ไม่อนุญาตให้ใช้ subscription Claude ในเครื่องมือบุคคลที่สาม (OpenClaw/Hermes) ถ้าไม่ได้รับอนุมัติ · OpenAI อนุญาต
- ราคา (05/2026): Claude Pro $20 · Max 5x $100 · Max 20x $200 / ChatGPT มี Codex ทุกแพลนรวมฟรี · Plus $20 · Pro $200 — ราคาเปลี่ยนบ่อย เช็คเว็บทางการก่อน
- ดึงสถิติ token ของ session: สั่งให้อ่านไฟล์ JSONL ของ session

### 2.11 Give Me 10 Mins and I'll Save You Millions of Claude Tokens — 118k วิว · ~06/2026 · https://www.youtube.com/watch?v=6cEQEba0i2A
- **prompt cache**: token ที่อ่านจาก cache คิด 10% ของ input ปกติ (เขาเซฟ 300M+ token/สัปดาห์)
- **อายุ cache: subscription = 1 ชม. · API / subagent / extra usage = 5 นาที** → ทิ้ง session เกิน 1 ชม. ข้อความถัดไปต้องอ่านทั้งแชทราคาเต็ม → handoff + เริ่มใหม่ถูกกว่า
- **สิ่งที่ทำให้ cache หาย**: สลับ `/model` กลางแชท (รวม `opusplan` ที่สลับ Opus↔Sonnet ทุกครั้งที่เข้า/ออก plan mode) · `/compact` · แก้ system prompt · **แก้ CLAUDE.md กลาง session ไม่ทำให้ cache หาย** (มีผลตอน session ใหม่)
- 3 นิสัยที่ครอบคลุม 95%: อย่าทิ้ง session นาน · เปลี่ยนงาน = เริ่มใหม่ · เอกสารใหญ่ใน Claude.ai ใส่ใน Project แทนวางในแชท

## 3. หลักที่ใช้ร่วมกันทุกคลิป
1. **บริบทน้อยแต่พอ** — CLAUDE.md เป็นป้ายบอกทาง รายละเอียดเฉพาะงานไปอยู่ใน skill/เอกสารที่โหลดเมื่อจำเป็น
2. **ของที่พิสูจน์แล้วต้องถูกเก็บให้ใช้ซ้ำ** (สคริปต์ใน skill) ไม่ใช่ให้ AI เขียนใหม่ทุกครั้ง
3. **ตรวจด้วยหลักฐานภายนอกก่อนส่ง** + persona รีวิว
4. **สิทธิ์จำกัดที่เครื่องมือ ไม่ใช่ที่คำสั่ง** (permission/hook)
5. **ทุกความผิดพลาดคือข้อมูล** → แก้ในจุดเล็กที่สุดที่ทนทาน แล้วรันซ้ำยืนยัน
6. **ตั้งงานอัตโนมัติเมื่อพิสูจน์แล้วเท่านั้น** และต้องมีเจ้าของคอยดู

## 4. เทียบกับโปรเจกต์ของเรา (หลักฐาน ณ 10/10/2569)
| ประเด็น | สภาพของเรา | สิ่งที่ควรทำ |
|---|---|---|
| ขนาด CLAUDE.md | **445 บรรทัด ~85,000 ตัวอักษร** โหลดทุก turn (คลิปแนะนำ 150–200 บรรทัด) · หัวไฟล์ตั้งใจว่า "เก็บแต่ภาพรวม convention และ pointer" | ย้าย Excel COM / ขึ้นเดือน / รายละเอียดแต่ละ sub-app ไป skill หรือ `docs/` เหลือ pointer + กับดักสำคัญ · รัน `/doctor` |
| สคริปต์ Excel COM | CLAUDE.md จดกับดักไว้ยาวแต่ "ยังไม่มีสคริปต์ใน repo" → 10/10 เขียนใหม่ติดบั๊ก 3 จุด (table เริ่มคอลัมน์ B · วันที่มีเศษเวลาเทียบเป็น string ไม่ได้ · PowerShell คลาย array) | ทำ skill Excel COM + สคริปต์กลางที่พิสูจน์แล้ว (สำรอง/manual calc/หาแถวด้วยเนื้อหา/ด่านตรวจ/Save เมื่อผ่าน/เทียบทีละเซลล์) |
| สิทธิ์เขียน Excel | 10/10 เขียน `.xlsm` โดย user ไม่ได้สั่ง ต้องกู้คืน — กันด้วย memory/prompt อย่างเดียว | hook/permission ที่บังคับให้หยุดรออนุมัติก่อน Save `.xlsm` ("keys, not prompts") |
| skill ซ้ำ | scrutinize 3 ชุด · grill-with-docs 2 · handoff 2 · karpathy 3 แบบ | `/doctor` + ทดสอบ trigger 3 แบบ แล้วรวม |
| บริบทบวม | session ที่ใช้ Playwright เยอะ (snapshot ใหญ่) บริบทเต็มเร็ว | บันทึกผล Playwright ลงไฟล์แล้วอ่านเฉพาะส่วน (ทำแล้ว 10/10) · พิจารณา context-mode หลังตรวจโค้ด |
| การตรวจงาน | มี `/scrutinize` + karpathy + Playwright E2E | เพิ่ม "รีวิวด้วย persona" สำหรับงาน UI (พยาบาลนานๆ เข้า / เจ้าหน้าที่คลังใหม่ / หัวหน้าคลัง) |
| ผู้ช่วย AI ในแอป | กำลังออกแบบโหมด "ถามวิธีใช้" | คู่มือ markdown แบบ LLM Wiki (index + หน้าเรื่อง + log) ไม่ต้องมี vector DB · AI ไม่ใช่แหล่งตัวเลข (CONTEXT.md §บัตรยา) |
| Connections | Supabase MCP ต่อไม่ได้บางวัน → ใช้ node + supabase-js อ่าน `.env` แทน | สคริปต์ CLI อ่านอย่างเดียวที่ใช้ซ้ำได้ (คลิปชอบ CLI/API มากกว่า MCP) |
| Cadence | มีแล้ว: edge function `expiry-alert`, `requisition-announce`, LINE bots | ก่อนเพิ่มงานตั้งเวลาใหม่ ต้องพิสูจน์ด้วยการรันมือก่อน + มีเจ้าของคอยดู |

## 5. งานที่เสนอ (ยังไม่ได้อนุมัติ — ดู handoff 10/10)
1. hook กัน Save `.xlsm` ถ้าไม่ได้รับอนุญาต (skill `update-config`)
2. skill Excel COM + สคริปต์กลาง (skill `anthropic-skills:skill-creator`)
3. ลด CLAUDE.md เป็นป้ายบอกทาง (เริ่มจากรัน `/doctor` — คำสั่งในตัวของ Claude Code ให้ user รันเอง)
4. รวม skill ที่ซ้ำ
5. ทดลอง context-mode หลังอ่านโค้ด plugin

## 6. token ไม่พอ: ใช้ Codex คู่ หรือ Claude 2 account? (สรุป 18/10/2569)
**เลือก Claude + Codex ไม่เปิด Claude 2 account**
- 2 account เพื่อเลี่ยง limit เสี่ยงผิดเงื่อนไขการใช้งาน (ถูกระงับได้ทั้งคู่) และ memory / skill / connector แยกกันคนละ account ต้องตั้งซ้ำ · Nate ไม่เคยพูดถึงวิธีนี้ในคลิปไหน
- Codex ถูกกฎ ได้โมเดลอีกตัวตรวจงาน ใช้ repo เดียวกันได้ (§2.9)

**ลำดับที่ควรทำ**
1. ลดการใช้ก่อน (ได้ผลมากสุด ไม่เสียเงิน): handoff + `/clear` ที่ ~120K · `/rewind` แทน "ผิด ลองใหม่" · ไม่สลับ model กลางแชท · ไม่ทิ้ง session เกิน 1 ชม. · แปลง PDF เป็นข้อความก่อนให้อ่าน · `/context` ดู overhead
2. ยังไม่พอ → อัปเกรดแพลน Max
3. หรือเพิ่ม ChatGPT (Codex) — แบ่งงาน:

| งาน | ใช้ | เหตุผล |
|---|---|---|
| Excel คลังยา (ลงบิล ใบเบิก ขึ้นเดือน ตรวจ 4 sheet) | **Claude** | skill + memory + กับดักทั้งหมดอยู่ฝั่ง Claude |
| แก้แอป warehouse-app (React/Supabase) — วางแผน + UI | **Claude** | วางแผนลึก, ตาม CLAUDE.md |
| รีวิว diff / หาบั๊กก่อน commit | **Codex** | รีวิวคม + เป็นความเห็นที่สอง |
| Apps Script กล่องยาฉุกเฉิน (นอก repo) | **Codex** | งานโค้ดชิ้นชัด, แยกขาดจาก repo นี้ |
| research จากเว็บ / ร่างรายงาน | **Codex** | output token น้อยกว่า |

ถ้าเริ่มใช้ Codex ใน repo นี้: ให้มันสร้าง `AGENTS.md` จาก CLAUDE.md (ต้องดูแลสองไฟล์ให้ตรงกัน) · Codex ไม่มี memory ของ Claude → ส่ง `/handoff` ไปให้แทน

**อัปเดต 21/10/2569 (ค้นเว็บ) — ตัวสำรองตอน token Claude หมด**
- **Codex ยังเป็นตัวเลือกแรก** — มีแอป Windows (มี.ค. 2026) รัน PowerShell แบบ native + sandbox ของ Windows หรือใช้ WSL ได้ → สคริปต์ `.ps1`/Excel COM ในเครื่องนี้รันได้โดยไม่ต้องย้ายไป Linux · มากับ ChatGPT ทุกแพลน (เช็คราคา/limit ที่เว็บทางการ)
- **Gemini CLI ไม่แนะนำแล้ว** — free tier ของบัญชี Google ส่วนตัวหยุดให้บริการ 18/06/2026 (ย้ายไป Antigravity CLI โควตาฟรีเหลือหลักสิบครั้ง/วัน) · ใช้ต่อได้เฉพาะ API key แบบจ่ายเงิน
- **GitHub Copilot CLI** (GA ก.พ. 2026, Pro $10/เดือน) — ถูกสุด เหมาะงานโค้ดแอปเล็กๆ ไม่เหมาะงานคลังยาที่ต้องอ่านรูปใบเบิก/บิลภาษาไทยและทำตามขั้นตอนยาว
- **งานที่ส่งให้ AI อื่นได้ / ไม่ควร** (ประเมินจากงานจริงใน repo):
  - ✅ อ่านอย่างเดียว: `check-complete.py` · `stock.mjs` · เทียบไฟล์จัดซื้อกับ Master (แบบ verify-bill) · รีวิว diff/โค้ดแอป · golden test · research/ร่างข้อความ
  - ⚠️ ได้แต่ต้องคุม: ลงบิล/ใบเบิกด้วย Excel COM — ต้องสั่งให้อ่าน `.claude/skills/excel-com/SKILL.md` + CLAUDE.md §ลงบิลยา ก่อน และ**ยืนยันตารางกับ user ก่อนเขียนทุกครั้ง** (อ่านลายมือไทย/บรรทัดเลื่อนเป็นจุดพลาดหลัก) · นำเข้าแอป `--commit`
  - ⛔ ไม่ควรส่ง: ขึ้นเดือน/แก้สูตร Master/แก้ VBA · แก้ข้อมูลงวดที่ส่งบัญชีแล้ว — กับดักเยอะ (REGEXREPLACE, codepage VBA, สูตร S/T) ความเสียหายเงียบ
  - สิ่งที่ AI อื่นมองไม่เห็น: memory ของ Claude (`~\.claude\projects\…\memory\`) → ให้อ่านไฟล์ในโฟลเดอร์นั้นตรงๆ หรือส่ง `/handoff` · hook บังคับอ่าน `src/CLAUDE.md` ไม่ทำงานกับ AI อื่น → เขียนใน AGENTS.md แทน

## 7. `/clear` ทำงานอย่างไร
| | `/clear` | `/compact` | `/rewind` (Esc Esc) |
|---|---|---|---|
| แชทในบริบท | **ล้างหมด** เริ่มบริบทใหม่ | แทนด้วยบทสรุปที่ Claude เขียนเอง | ตัดทุกอย่างหลังจุดที่เลือก |
| เมื่อไร | เปลี่ยนงาน / หลังเขียน handoff | ไม่แนะนำ (คุมไม่ได้ว่าเก็บอะไร) | Claude ทำผิดทาง |
| prompt cache | ส่วนแชทหาย (ส่วน system/CLAUDE.md ยังใช้ cache ร่วมได้) | หาย | ส่วนก่อนจุดที่ย้อนยังอยู่ |

**`/clear` ไม่แตะ**: ไฟล์บนดิสก์ (Excel, โค้ด, PDF), git, memory (`MEMORY.md`), skills, CLAUDE.md — ทั้งหมดถูกโหลดใหม่ใน session ถัดไปอัตโนมัติ · **สิ่งที่หาย**: สิ่งที่คุยกันในแชทที่ไม่ได้จดลงไฟล์ → ต้อง `/handoff` ก่อน · แชทเก่ายังถูกเก็บในเครื่อง กลับไปได้ด้วย `/resume`

**ขั้นตอน (เครื่องเดิม)**
1. พิมพ์ `/handoff` (หรือ `/handoff ลงใบเบิกต่อ`) → Claude เขียนไฟล์ + พิมพ์บล็อกวางต่อ
2. ก๊อปบล็อกวางต่อ → `/clear`
3. วางบล็อก → Claude อ่านไฟล์ handoff → สรุปสถานะ → รอยืนยัน → ทำต่อ

**ขั้นตอน (อีกเครื่อง)**: `/handoff git` → เครื่องใหม่ `git pull` → เปิด Claude → *"ทำงานต่อจาก docs/handoff-….md"* · หรือเปิด Codex ใน repo แล้ววางข้อความเดียวกัน

**ตัวอย่างไฟล์ handoff** (ตัวเลขสมมติ — ใช้ดูรูปแบบเท่านั้น):

````markdown
# Handoff 18/10/2569 — ลงบิลยา ต.ค. รอบ 2

## 1. เริ่มจากไหน
ลงบิล 3 ใบในโฟลเดอร์ `เอกสารคลังยา_รอลง\บิลยา\` (บริษัท A 1261000xx, B 1261003xx, C 1261005xx)

## 2. ตัดสินใจไปแล้ว
- บิล C ราคาต่อหน่วยต่างจากแถวต้นแบบ → user ให้แทรกแถวใหม่ ไม่รวมแถวเดิม (เพราะราคาคนละ cost layer)

## 3. ส่งมอบแล้ว
- บิล A + B: Save ไฟล์จริงแล้ว — `รับยา` แถว 1850–1856 · Master แทรก 7 แถว · ด่านผ่านครบ (Y เพิ่ม = ยอดบิล, AA = 0)
- ใบส่งบิลจัดซื้อ สบ.70/0123 → เข้าคิวพิมพ์แล้ว

## 4. ไฟล์สำคัญ
- สำเนาที่ลงบิล C ค้างไว้: `%TEMP%\...\scratchpad\stock_copy.xlsm` (เพิ่มแล้ว 2 จาก 4 แถว)
- สคริปต์ COM: `%TEMP%\...\scratchpad\bill_1018.ps1` — แก้ `$lines` แถวที่ 3–4 แล้วรันต่อ

## 5. ยังรันอยู่
- ไม่มี (ปิด Excel COM แล้ว)

## 6. ยังไม่ได้ verify
- บิล C: diff ทีละเซลล์ + `cmp` ไฟล์จริง ยังไม่ได้ทำ
- ยังไม่นำเข้าแอป (ทั้ง 3 บิล)

## 7. คำถามเปิด
- บิล C lot 24B031 exp บนบิลกับ COA ไม่ตรงกัน (03/2028 vs 02/2028) — รอ user ดูของจริง

## 8. เริ่มต่อตรงไหน
1. ถาม user เรื่อง exp บิล C
2. รัน `bill_1018.ps1` ต่อแถว 3–4 → ด่าน → diff → วางกลับ
3. นำเข้าแอปทั้ง 3 บิล → ลงยามาส่งในระบบติดตามจัดซื้อ

## 9. skill ที่ควรเรียก
`/stock-check` (เช็คยอดหลังลง) · `anthropic-skills:verify-4sheet-v2` (ก่อนปิดวัน)

## ห้ามทำซ้ำ
บิล A, B ลงแล้ว — ห้ามลงซ้ำ · โฟลเดอร์รอลง: เหลือ `บิลยา\` 1 ไฟล์ (บิล C)
````

## 8. คลิปที่น่าศึกษาต่อ
- How to Build Claude Agent Teams Better Than 99% of People (366k) — https://www.youtube.com/watch?v=vDVSGVpB2vc
- Master 95% of Claude Code in 36 Mins (444k) — https://www.youtube.com/watch?v=saggDHHnmtQ
- Build & Sell Claude Code Operating Systems (2+ ชม., 488k) — https://www.youtube.com/watch?v=bCljOfCH8Ms
- How to Build a WhatsApp Agent with n8n (398k) — เทียบกับบอท LINE ของเรา — https://www.youtube.com/watch?v=A0OwvNOLNlw
- How to Build GPT-6 Astra Automations (that don't eat your usage limit) — คุมค่าใช้จ่าย — https://www.youtube.com/watch?v=FqnNL8fnUWo

## 9. วิธีดึง transcript (18/10/2569)
- `youtubei/v1/get_transcript` ของ YouTube ตอบ **400** → ปุ่ม Show transcript ค้างสปินเนอร์ ใช้วิธีเปิด panel ไม่ได้แล้ว
- ใช้ Playwright ต่อ Chrome ที่ล็อกอินแล้วผ่าน CDP (`node scripts/gas.mjs chrome <url>`) แล้ว**ดัก response `/api/timedtext` ที่ player โหลดเอง** (json3: `events[].segs[].utf8`) — ยิง URL timedtext เองไม่มีลายเซ็นได้ 0 bytes
- สคริปต์ `scripts/.yt-search.mjs` (ค้นหาคลิป) · `scripts/.yt-captions.mjs <outdir> <videoId…>` — อยู่เครื่องเดียว ไม่ได้ commit (พึ่งโปรไฟล์ Chrome ที่มี cookie)
