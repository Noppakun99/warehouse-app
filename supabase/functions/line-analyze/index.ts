// Supabase Edge Function: line-analyze
// ให้ AI อ่านข้อความในกลุ่ม LINE แล้วเสนอรายการงานที่ต้องทำ (ADR-0023)
//
// Deploy: supabase functions deploy line-analyze     (verify_jwt = true ตาม default)
// Secret: ANTHROPIC_API_KEY (มีอยู่แล้ว — ตัวเดียวกับ scan-invoice)
//
// ⚠️ ขอบเขตข้อมูลที่ออกนอกระบบ (ADR-0023 ข้อ 3 · ADR-0016):
//   ส่งเฉพาะ **candidate + หน้าต่างบริบท ±CONTEXT_SPAN ข้อความ** ไม่ใช่บทสนทนาทั้งกลุ่ม
//   บริบทจำเป็นเพราะคำสั่งงานอ้างถึงสิ่งที่พูดไปแล้ว ("ฝากเตรียม*เอกสารพวกนั้น*")
//   แต่ข้อความที่ไม่มีคำบ่งชี้งานเลยไม่ต้องออกไป — **ห้ามเปลี่ยนเป็นส่งทั้งหมดเพื่อความแม่นยำ**
//
// งานที่ได้เข้าสถานะ `ai_suggested` เสมอ — คนต้องกดรับก่อนถึงเป็น `open`
// (ADR-0022: ระบบไม่สร้างงานเอง · ADR-0023: แยกสถานะเพื่อวัดว่าคนรับกี่ %)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";

// Opus 5 — เลือกเพราะภาษาไทยแบบพูด + การอ้างอิงข้ามข้อความ (ADR-0023)
// ลดรุ่นได้ถ้าพิสูจน์แล้วว่างานไม่ยาก — แก้ค่านี้ที่เดียว
const MODEL = "claude-opus-5";
const CONTEXT_SPAN = 3;     // ข้อความก่อน/หลัง candidate ที่ส่งไปด้วย
const MAX_CANDIDATES = 300; // กันส่งทีเดียวเยอะเกิน

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const PROMPT = `คุณกำลังอ่านบทสนทนาในกลุ่ม LINE ของเจ้าหน้าที่คลังยาโรงพยาบาล
หน้าที่ของคุณคือหา "งานที่มีคนสั่งหรือฝากไว้ แล้วอาจยังไม่ได้ทำ"

กฎ:
1. งาน = สิ่งที่ต้องลงมือทำ ไม่ใช่การรายงานสถานะหรือการคุยเล่น
2. ข้อความหนึ่งอาจมีหลายงาน (เช่น "Note สิ่งที่ต้องจัดการ 1... 2...") ให้แยกเป็นคนละงาน
3. งานหนึ่งอาจกินหลายข้อความ (เช่น "ฝากเตรียมเอกสารพวกนั้น" ต้องอ่านข้อความก่อนหน้า) ให้รวมเป็นงานเดียว
4. ถ้าในบทสนทนามีคนตอบว่าทำเสร็จแล้ว ให้ข้ามงานนั้นไป
5. ห้ามเดาสิ่งที่ไม่มีในข้อความ — ถ้าไม่แน่ใจว่าเป็นงาน ไม่ต้องใส่
6. title เขียนเป็นประโยคสั่งงานสั้นๆ ภาษาไทย ที่คนอ่านแล้วรู้ทันทีว่าต้องทำอะไร

ตอบเป็น JSON เท่านั้น ไม่ต้องมีคำอธิบายอื่น:
{"tasks":[{"title":"...","detail":"...","assignee":"ชื่อคนที่ต้องทำ หรือ null","due_hint":"กำหนดเวลาตามที่พูด เช่น พรุ่งนี้ หรือ null","message_ids":[1,2]}]}

message_ids = id ของข้อความต้นทางที่ทำให้สรุปงานนี้ (ใส่ได้หลายอัน)
ถ้าไม่พบงานเลย ตอบ {"tasks":[]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!ANTHROPIC_KEY) return json({ ok: false, error: "ยังไม่ได้ตั้ง ANTHROPIC_API_KEY" }, 500);

  let p: Record<string, unknown> = {};
  try { p = await req.json(); } catch { /* ใช้ค่า default */ }
  const dryRun = p.dryRun === true;
  const user = String(p.user || "-");

  try {
    // 1) หา candidate ที่ยังไม่เคยถูกวิเคราะห์ (ไม่มีงานอ้างถึงแล้ว)
    const cands = await rest(
      `line_message?select=id,sent_at,chat_name&task_status=eq.candidate`
      + `&order=sent_at.desc&limit=${MAX_CANDIDATES}`,
    ) as { id: number; sent_at: string; chat_name: string }[];

    if (!cands.length) return json({ ok: true, analyzed: 0, tasks: [], note: "ไม่มีข้อความที่รอวิเคราะห์" });

    // 2) ดึงหน้าต่างบริบทรอบ candidate แต่ละอัน — ขอบเขตข้อมูลที่ออกนอกระบบ
    const wanted = new Set<number>();
    for (const c of cands) {
      const around = await rest(
        `line_message?select=id&chat_name=eq.${encodeURIComponent(c.chat_name)}`
        + `&sent_at=gte.${new Date(new Date(c.sent_at).getTime() - 3600_000).toISOString()}`
        + `&sent_at=lte.${new Date(new Date(c.sent_at).getTime() + 3600_000).toISOString()}`
        + `&order=sent_at.asc&limit=${CONTEXT_SPAN * 2 + 1}`,
      ) as { id: number }[];
      for (const a of around) wanted.add(a.id);
      wanted.add(c.id);
    }

    const ids = [...wanted].join(",");
    const msgs = await rest(
      `line_message?select=id,sender,sent_at,msg_type,body&id=in.(${ids})&order=sent_at.asc`,
    ) as { id: number; sender: string; sent_at: string; msg_type: string; body: string | null }[];

    // 3) เรียบเรียงเป็นบทสนทนาที่อ่านได้ (ข้ามไฟล์แนบ — ไม่มีเนื้อความให้สรุป)
    const transcript = msgs
      .filter((m) => m.msg_type === "text" && m.body)
      .map((m) => `[${m.id}] ${m.sender}: ${m.body}`)
      .join("\n");

    if (dryRun) {
      return json({
        ok: true, dryRun: true,
        candidates: cands.length,
        messages_sent: msgs.length,
        chars: transcript.length,
        note: "ยังไม่เรียก AI — นี่คือขอบเขตข้อมูลที่จะถูกส่งออก",
      });
    }

    // 4) เรียก Claude
    const runId = `run_${Date.now()}`;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        messages: [{ role: "user", content: `${PROMPT}\n\n---บทสนทนา---\n${transcript}` }],
      }),
    });
    if (!res.ok) return json({ ok: false, error: `Claude API: ${res.status} ${await res.text()}` }, 502);

    const data = await res.json();
    const raw: string = (data.content || [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text).join("");

    // ตัด markdown fence ถ้ามี แล้ว parse
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    let parsed: { tasks?: Record<string, unknown>[] };
    try { parsed = JSON.parse(cleaned); }
    catch { return json({ ok: false, error: "AI ตอบไม่เป็น JSON", raw: cleaned.slice(0, 500) }, 502); }

    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    if (!tasks.length) return json({ ok: true, analyzed: msgs.length, created: 0, tasks: [], usage: data.usage });

    // 5) บันทึกเป็น ai_suggested — คนต้องกดรับก่อน (ADR-0022/0023)
    const rows = tasks.map((t) => ({
      title: String(t.title || "").slice(0, 500),
      detail: t.detail ? String(t.detail).slice(0, 2000) : null,
      status: "ai_suggested",
      source: "ai",
      assignee: t.assignee ? String(t.assignee).slice(0, 200) : null,
      due_hint: t.due_hint ? String(t.due_hint).slice(0, 200) : null,
      ai_model: MODEL,
      ai_run_id: runId,
      created_by: user,
    })).filter((r) => r.title);

    const created = await rest("line_task?select=id,title", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(rows),
    }) as { id: number; title: string }[];

    // 6) ผูกงานกับข้อความต้นทาง (many-to-many ตาม ADR-0023)
    const links: { task_id: number; message_id: number }[] = [];
    for (let i = 0; i < created.length; i++) {
      const src = tasks.find((t) => String(t.title || "").slice(0, 500) === created[i].title);
      const mids = Array.isArray(src?.message_ids) ? src!.message_ids : [];
      for (const mid of mids) {
        if (wanted.has(Number(mid))) links.push({ task_id: created[i].id, message_id: Number(mid) });
      }
    }
    if (links.length) {
      await rest("line_task_message", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(links),
      }).catch((e) => console.error("ผูกข้อความไม่สำเร็จ:", e));
    }

    // audit — ไม่ throw (audit ล้มต้องไม่ทำให้งานหาย)
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
        method: "POST",
        headers: { ...H, Prefer: "return=minimal" },
        body: JSON.stringify({
          action: "analyze_line_tasks", user_name: user,
          details: { run_id: runId, model: MODEL, messages_sent: msgs.length, created: created.length, usage: data.usage },
          created_at: new Date().toISOString(),
        }),
      });
    } catch { /* ignore */ }

    return json({ ok: true, run_id: runId, analyzed: msgs.length, created: created.length, usage: data.usage });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
