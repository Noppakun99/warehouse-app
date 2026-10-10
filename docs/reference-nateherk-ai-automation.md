# อ้างอิงภายนอก: Nate Herk | AI Automation (YouTube) — วิธีทำงานกับ Claude Code / AI

> **ใช้ไฟล์นี้เมื่อ:** จะปรับ CLAUDE.md · skill · hook/permission · วิธีวิเคราะห์ · การเชื่อมระบบ/ตั้งงานอัตโนมัติ · ออกแบบฟีเจอร์ AI ในแอป
> **ที่มา:** อ่านคำบรรยาย (transcript) ผ่าน Playwright เมื่อ 10/10/2569 — สรุปและแปลเป็นภาษาของเรา ไม่ใช่คำต่อคำ · transcript ดิบเก็บไว้ในเครื่องที่ `.playwright-mcp/nateherk/*.json` (gitignored — ไม่ขึ้น repo)
> **ข้อควรระวัง:** เป็นความเห็นของ creator คนหนึ่ง (มีโฆษณาคอร์ส/สปอนเซอร์ปน) — ก่อนเอามาใช้ให้เทียบกับเอกสารทางการของ Anthropic และทดลองกับงานของเราเองก่อนเสมอ · plugin ของบุคคลที่สามมี hook/MCP ที่รันโค้ดได้ — **ตรวจโค้ดก่อนติดตั้ง**

## 1. ข้อมูลช่อง (ณ 10/10/2569)
- https://www.youtube.com/@nateherk · ผู้ติดตาม 1.06M · 542 วิดีโอ · เนื้อหา: AI automation, n8n, Claude Code, agent, เทียบโมเดล
- **ยอดวิวสูงสุด (Popular):** Build & Sell n8n AI Agents (8+ ชม.) 1.9M · Build & Sell with Claude Code (10+ ชม.) 1.1M · Team of AI Agents in n8n 1.1M · Karpathy LLM Wiki 714k · Ollama + Claude Code 661k · Beautiful Websites with Claude Code 572k · n8n Masterclass 555k · Build & Sell Claude Code Operating Systems 488k · 32 Tricks 478k · 100+ Skills → 6 Best 459k · Master 95% of Claude Code in 36 Mins 444k · WhatsApp Agent with n8n 398k · Claude Agent Teams 366k

## 2. คลิปที่ศึกษาแล้ว (7 คลิป)

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

## 6. คลิปที่น่าศึกษาต่อ
- How to Build Claude Agent Teams Better Than 99% of People (366k) — https://www.youtube.com/watch?v=vDVSGVpB2vc
- Master 95% of Claude Code in 36 Mins (444k) — https://www.youtube.com/watch?v=saggDHHnmtQ
- Build & Sell Claude Code Operating Systems (2+ ชม., 488k) — https://www.youtube.com/watch?v=bCljOfCH8Ms
- How to Build a WhatsApp Agent with n8n (398k) — เทียบกับบอท LINE ของเรา — https://www.youtube.com/watch?v=A0OwvNOLNlw
- How to Build GPT-6 Astra Automations (that don't eat your usage limit) — คุมค่าใช้จ่าย — https://www.youtube.com/watch?v=FqnNL8fnUWo
