// Supabase Edge Function: line-tasks
// อ่าน/มาร์กงานค้างจากข้อความ LINE — ทางเดียวที่แอปเข้าถึง line_message ได้ (ADR-0022)
//
// Deploy: supabase functions deploy line-tasks     (verify_jwt = true ตาม default)
//   ต่างจาก line-webhook ที่ต้อง --no-verify-jwt — ตัวนี้เรียกจากแอปที่มี anon key
//   pattern เดียวกับ line-quota: ถือ service_role ไว้ในฟังก์ชัน ไม่คืน key ออกไป
//
// ทำไมต้องมีฟังก์ชันนี้: ตาราง line_message เปิด RLS โดยไม่มี policy (ADR-0016 กฎ 1)
//   → client อ่านตรงไม่ได้เลย ต้องผ่านที่นี่ซึ่งกรองว่าจะให้เห็นอะไรบ้าง
//
// action:
//   list    { status?, chat?, limit? }        → รายการข้อความตามสถานะ
//   counts  {}                                → นับแต่ละสถานะ (ไว้ทำ badge)
//   mark    { id, status, note?, user? }      → เปลี่ยนสถานะงาน (task/done/dismissed)
//   context { id, span? }                     → ข้อความรอบๆ ข้อความนั้น (ดูบริบทก่อนตัดสิน)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

const VALID_STATUS = ["candidate", "task", "done", "dismissed"];

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

/** บันทึก audit — ไม่ throw (audit ล้มต้องไม่ทำให้ action ล้ม ตาม pattern ใน db.js) */
async function audit(action: string, details: unknown, user: string) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ action, user_name: user || "-", details, created_at: new Date().toISOString() }),
    });
  } catch (e) {
    console.error("audit ล้มเหลว:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let p: Record<string, unknown> = {};
  try { p = await req.json(); } catch { /* body ว่าง = ใช้ค่า default */ }
  const action = String(p.action || "list");

  try {
    if (action === "counts") {
      const rows = await rest("line_message?select=task_status");
      const counts: Record<string, number> = { candidate: 0, task: 0, done: 0, dismissed: 0, total: rows.length };
      for (const r of rows) if (r.task_status) counts[r.task_status] = (counts[r.task_status] || 0) + 1;
      return json({ ok: true, counts });
    }

    if (action === "list") {
      const status = String(p.status || "candidate");
      const limit = Math.min(Number(p.limit) || 200, 500);
      let q = `line_message?select=id,chat_name,sender,sent_at,msg_type,body,task_status,matched_kw,task_note,done_by,done_at`;
      if (status !== "all") {
        // "open" = ยังไม่จบ (รอยืนยัน + ยืนยันแล้วยังไม่ทำ) — ค่าที่หน้าหลักใช้
        q += status === "open"
          ? `&task_status=in.(candidate,task)`
          : `&task_status=eq.${status}`;
      } else {
        q += `&task_status=not.is.null`;
      }
      if (p.chat) q += `&chat_name=eq.${encodeURIComponent(String(p.chat))}`;
      q += `&order=sent_at.desc&limit=${limit}`;
      return json({ ok: true, rows: await rest(q) });
    }

    if (action === "context") {
      // ดูข้อความรอบๆ เพื่อตัดสินว่าเป็นงานจริงไหม (ข้อความเดี่ยวมักไม่พอ)
      const id = Number(p.id);
      if (!id) return json({ ok: false, error: "ต้องระบุ id" }, 400);
      const [target] = await rest(`line_message?select=chat_name,sent_at&id=eq.${id}`);
      if (!target) return json({ ok: false, error: "ไม่พบข้อความ" }, 404);
      const span = Math.min(Number(p.span) || 5, 20);
      const before = await rest(`line_message?select=id,sender,sent_at,msg_type,body`
        + `&chat_name=eq.${encodeURIComponent(target.chat_name)}&sent_at=lt.${target.sent_at}`
        + `&order=sent_at.desc&limit=${span}`);
      const after = await rest(`line_message?select=id,sender,sent_at,msg_type,body`
        + `&chat_name=eq.${encodeURIComponent(target.chat_name)}&sent_at=gt.${target.sent_at}`
        + `&order=sent_at.asc&limit=${span}`);
      return json({ ok: true, before: before.reverse(), after });
    }

    if (action === "mark") {
      const id = Number(p.id);
      const status = String(p.status || "");
      if (!id) return json({ ok: false, error: "ต้องระบุ id" }, 400);
      if (!VALID_STATUS.includes(status)) return json({ ok: false, error: "สถานะไม่ถูกต้อง" }, 400);
      const user = String(p.user || "-");
      const patch: Record<string, unknown> = { task_status: status };
      if (p.note !== undefined) patch.task_note = p.note ? String(p.note) : null;
      // done = จบงาน → บันทึกว่าใครทำเมื่อไหร่ · กลับไปสถานะอื่น = ล้างค่าเดิม
      if (status === "done") { patch.done_by = user; patch.done_at = new Date().toISOString(); }
      else { patch.done_by = null; patch.done_at = null; }

      await rest(`line_message?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
      await audit("mark_line_task", { id, status, note: p.note ?? null }, user);
      return json({ ok: true });
    }

    // ── งาน (line_task) — ADR-0023 ────────────────────────────────
    if (action === "tasks") {
      // status: 'ai_suggested' | 'open' | 'done' | 'dismissed' | 'pending' (ai_suggested+open) | 'all'
      const st = String(p.status || "pending");
      let q = "line_task?select=id,title,detail,status,source,assignee,due_hint,ai_model,created_at,done_by,done_at";
      if (st === "pending") q += "&status=in.(ai_suggested,open)";
      else if (st !== "all") q += `&status=eq.${st}`;
      q += "&order=created_at.desc&limit=300";
      const rows = await rest(q);
      return json({ ok: true, rows });
    }

    if (action === "task_counts") {
      const rows = await rest("line_task?select=status") as { status: string }[];
      const c: Record<string, number> = { ai_suggested: 0, open: 0, done: 0, dismissed: 0, total: rows.length };
      for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
      return json({ ok: true, counts: c });
    }

    if (action === "task_sources") {
      // ข้อความต้นทางของงาน — ให้คนตรวจได้ว่า AI สรุปมาจากอะไร ก่อนกดรับ
      const id = Number(p.id);
      if (!id) return json({ ok: false, error: "ต้องระบุ id" }, 400);
      const links = await rest(`line_task_message?select=message_id&task_id=eq.${id}`) as { message_id: number }[];
      if (!links.length) return json({ ok: true, rows: [] });
      const ids = links.map((l) => l.message_id).join(",");
      const rows = await rest(`line_message?select=id,sender,sent_at,msg_type,body&id=in.(${ids})&order=sent_at.asc`);
      return json({ ok: true, rows });
    }

    if (action === "mark_task") {
      const id = Number(p.id);
      const status = String(p.status || "");
      if (!id) return json({ ok: false, error: "ต้องระบุ id" }, 400);
      if (!["ai_suggested", "open", "done", "dismissed"].includes(status)) {
        return json({ ok: false, error: "สถานะไม่ถูกต้อง" }, 400);
      }
      const user = String(p.user || "-");
      const patch: Record<string, unknown> = { status };
      if (p.title !== undefined) patch.title = String(p.title).slice(0, 500);
      if (p.detail !== undefined) patch.detail = p.detail ? String(p.detail).slice(0, 2000) : null;
      if (status === "done") { patch.done_by = user; patch.done_at = new Date().toISOString(); }
      else { patch.done_by = null; patch.done_at = null; }
      await rest(`line_task?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });
      await audit("mark_line_task_item", { id, status }, user);
      return json({ ok: true });
    }

    if (action === "create_task") {
      // คนสร้างงานเอง (ไม่ผ่าน AI) — เข้า open ทันทีเพราะคนเป็นคนตัดสินใจแล้ว
      const title = String(p.title || "").trim();
      if (!title) return json({ ok: false, error: "ต้องมีชื่องาน" }, 400);
      const user = String(p.user || "-");
      const [row] = await rest("line_task?select=id", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([{
          title: title.slice(0, 500),
          detail: p.detail ? String(p.detail).slice(0, 2000) : null,
          status: "open", source: "human", created_by: user,
          assignee: p.assignee ? String(p.assignee).slice(0, 200) : null,
        }]),
      }) as { id: number }[];
      // ผูกกับข้อความต้นทางถ้าสร้างจากการ์ดข้อความ
      if (p.message_id && row?.id) {
        await rest("line_task_message", {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
          body: JSON.stringify([{ task_id: row.id, message_id: Number(p.message_id) }]),
        }).catch(() => {});
      }
      await audit("create_line_task", { id: row?.id, title }, user);
      return json({ ok: true, id: row?.id });
    }

    return json({ ok: false, error: `ไม่รู้จัก action: ${action}` }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
