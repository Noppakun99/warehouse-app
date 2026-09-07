// Supabase Edge Function: line-webhook
// รับข้อความจากกลุ่ม LINE ที่บอท "คลังยา" อยู่ → เก็บลง line_message (ADR-0022)
//
// Deploy: supabase functions deploy line-webhook --no-verify-jwt
//   ⚠️ ต้อง --no-verify-jwt เพราะ LINE ยิง webhook มาโดยไม่มี Authorization: Bearer
//      (ใช้ X-Line-Signature แทน) ถ้าเปิด JWT verify จะโดน reject 401 ก่อนถึงโค้ด
//      — บทเรียนเดียวกับ Critical Rule #7 ใน docs/expiry-alert-edge-function.md
//   ⚠️ ห้ามเอา handler นี้ไปรวมใน expiry-alert (ตัวนั้น verify_jwt=true ใช้กับ cron)
//
// Secrets (ใช้ OA เดียวกับ expiry-alert — channel "คลังยา" ID 2011123343):
//   LINE_CHANNEL_SECRET        ← ต้องตั้งใหม่ (ไม่ใช่ access token) ใช้ verify ลายเซ็น
//   LINE_CHANNEL_ACCESS_TOKEN  ← มีอยู่แล้ว
//
// ตั้ง Webhook URL ใน LINE Console → Messaging API:
//   https://<REF>.supabase.co/functions/v1/line-webhook
//   (ของเดิมชี้ line-groupid-probe ซึ่งถูกลบไปแล้ว = ซาก 404 ทับได้เลย ตรวจแล้ว 2026-09-04)

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET") || "";

// เก็บเฉพาะห้องที่ระบุไว้ (กันบอทถูกเชิญเข้ากลุ่มอื่นแล้วเก็บข้อความมั่ว)
// ว่าง = เก็บทุกห้องที่บอทอยู่
const ALLOW_CHAT_IDS = (Deno.env.get("LINE_ALLOW_CHAT_IDS") || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

// ── กรองรหัสเข้าคลัง — ต้องตรงกับ containsDoorCode ใน src/lib/lineChatImport.js ─────
// ⚠️ แก้ที่นี่ต้องแก้ที่ lineChatImport.js ด้วย (คนละภาษา แชร์ไฟล์ไม่ได้)
//    รหัสประตูคลัง = ข้อมูลควบคุมการเข้าถึงทางกายภาพ ห้ามลง DB เด็ดขาด (ADR-0016)
//    ระวัง: คำว่า "รหัส" ในกลุ่มนี้หมายถึงรหัสยาด้วย (`LRI 1000ml รหัส 12`) ห้ามตัดทิ้ง
const DOOR_CONTEXT = /(คลัง|ประตู|ล็อค|ล็อก|ตู้|ห้อง|เปลี่ยนรหัส|รหัสใหม่|door|lock)/i;
const DRUG_CONTEXT = /มก\.|มล\.|ม\.ล\.|\d+\s*(?:ml|mg|mcg|g)\b|เม็ด|ขวด|กล่อง|หลอด|แอมป์|ซื้อ|lot|exp|ต่างกัน|ตัวไหน/i;

function containsDoorCode(body: string): boolean {
  const t = (body || "").trim();
  if (!t) return false;
  if (!/รหัส|ล็อค|ล็อก|password|passcode/i.test(t)) return false;
  if (!/\d{3,8}/.test(t)) return false;
  if (DOOR_CONTEXT.test(t)) return true;
  return !DRUG_CONTEXT.test(t);
}

// ── ดักคำที่น่าจะเป็นงาน — ต้องตรงกับ TASK_KEYWORDS ใน lineChatImport.js ────────
// ไม่ใส่คำกว้าง (ขอ/แจ้ง/สั่ง/ทำ) เพราะติด ขอบคุณ/แจ้งรหัส/สั่งซื้อ จนท่วมจอ
const TASK_KEYWORDS = ["@All", "อย่าลืม", "ด่วน", "ช่วย", "ฝาก", "เช็ค", "ตรวจสอบ", "รบกวน", "แก้ไข"];
const MIN_LEN = 12;

function matchTaskKeyword(body: string): string | null {
  const t = (body || "").trim();
  if (!t || t.length < MIN_LEN) return null;
  return TASK_KEYWORDS.find((k) => t.includes(k)) || null;
}

/** verify X-Line-Signature = Base64(HMAC-SHA256(channelSecret, rawBody))
 *  ถ้าไม่ verify ใครยิง POST เข้ามาก็เขียน DB ได้ (endpoint นี้เปิดสาธารณะ) */
async function verifySignature(raw: string, signature: string): Promise<boolean> {
  if (!CHANNEL_SECRET || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(CHANNEL_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  // เทียบแบบ length-safe (ไม่ต้อง constant-time เพราะ HMAC ไม่รั่วจากการเทียบธรรมดา)
  return expected === signature;
}

// cache ชื่อกลุ่มต่อ instance — ไม่ต้องถาม LINE ทุกข้อความ
const chatNameCache = new Map<string, string>();

/** ชื่อห้องแชทจริงจาก LINE
 *  ⚠️ ห้าม hardcode — ชื่อนี้เป็น key ที่ใช้จับคู่กับข้อความที่ import จากไฟล์ export
 *  (fetchLineTaskContext / line-analyze หาบริบทด้วย chat_name) ถ้าไม่ตรงกัน
 *  กลุ่มเดียวกันจะแตกเป็น 2 ห้อง → กันซ้ำไม่ได้ + AI ไม่เห็นบริบทข้ามแหล่ง */
async function fetchChatName(groupId: string, roomId: string): Promise<string> {
  const key = groupId || roomId;
  if (!key) return "แชทเดี่ยว";
  const hit = chatNameCache.get(key);
  if (hit) return hit;

  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
  let name = groupId ? "กลุ่ม" : "ห้องแชท";
  if (token && groupId) {
    try {
      const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const j = await res.json();
        if (j.groupName) name = String(j.groupName);
      }
    } catch { /* ใช้ค่า fallback */ }
  }
  chatNameCache.set(key, name);
  return name;
}

/** ชื่อผู้ส่ง — LINE ไม่ส่งชื่อมาใน event ต้องถาม API (คนที่ไม่เคยคุยกับ OA อาจไม่ได้ชื่อ) */
async function fetchDisplayName(groupId: string, userId: string): Promise<string> {
  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
  if (!token || !userId) return "-";
  try {
    const url = groupId
      ? `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`
      : `https://api.line.me/v2/bot/profile/${userId}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return "-";
    const j = await res.json();
    return j.displayName || "-";
  } catch {
    return "-";
  }
}

/** map ชนิดข้อความของ LINE → msg_type ในตาราง (ให้ตรงกับฝั่ง import ไฟล์) */
function mapType(t: string): string {
  switch (t) {
    case "text": return "text";
    case "image": return "image";
    case "video": return "video";
    case "audio": return "audio";
    case "file": return "file";
    case "sticker": return "sticker";
    case "location": return "location";
    default: return t || "text";
  }
}

async function saveRows(rows: unknown[]) {
  if (!rows.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/line_message`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      // ยิงซ้ำได้ไม่พัง — unique index บน line_message_id กันไว้
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) console.error("บันทึกไม่สำเร็จ:", res.status, await res.text());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  const raw = await req.text();
  const sig = req.headers.get("x-line-signature") || "";

  if (!(await verifySignature(raw, sig))) {
    console.error("ลายเซ็นไม่ถูกต้อง — ปฏิเสธ");
    return new Response("bad signature", { status: 401 });
  }

  let body: { events?: Record<string, unknown>[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("ok");   // ตอบ 200 เสมอ ไม่งั้น LINE retry ไม่หยุด
  }

  const rows: Record<string, unknown>[] = [];
  for (const ev of body.events || []) {
    if (ev.type !== "message") continue;
    const src = (ev.source || {}) as Record<string, string>;
    const msg = (ev.message || {}) as Record<string, string>;
    const chatId = src.groupId || src.roomId || src.userId || "";
    if (ALLOW_CHAT_IDS.length && !ALLOW_CHAT_IDS.includes(chatId)) continue;

    const msgType = mapType(msg.type);
    let text: string | null = msgType === "text" ? (msg.text || "") : null;

    // รหัสประตูคลัง — ทิ้งทั้งแถว ไม่เก็บแม้แต่ metadata ของข้อความนั้น
    if (text && containsDoorCode(text)) {
      console.log("ข้ามข้อความที่มีรหัสเข้าคลัง");
      continue;
    }

    const kw = text ? matchTaskKeyword(text) : null;
    // ⚠️ ตัดวินาทีทิ้ง — ไฟล์ export ของ LINE มีความละเอียดแค่ระดับนาที (HH:MM)
    //    ถ้าเก็บวินาทีไว้ ข้อความเดียวกันที่มาทาง webhook กับทาง import จะมี sent_at ต่างกัน
    //    → unique index (chat_name, sender, sent_at, body, msg_type) กันซ้ำไม่ได้
    const ts = new Date(Number(ev.timestamp) || Date.now());
    ts.setSeconds(0, 0);

    rows.push({
      source: "webhook",
      line_message_id: msg.id || null,
      chat_id: chatId || null,
      chat_name: await fetchChatName(src.groupId || "", src.roomId || ""),
      sender: await fetchDisplayName(src.groupId || "", src.userId || ""),
      sender_id: src.userId || null,
      sent_at: ts.toISOString(),
      msg_type: msgType,
      body: text,
      task_status: kw ? "candidate" : null,
      matched_kw: kw,
    });
  }

  await saveRows(rows);
  // ต้องตอบ 200 เสมอ — LINE ถือว่า non-2xx = ส่งไม่สำเร็จ แล้ว retry ซ้ำ
  return new Response("ok");
});
