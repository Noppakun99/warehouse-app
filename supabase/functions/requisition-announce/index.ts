// Supabase Edge Function: requisition-announce
// ประกาศรอบเบิก-รับ เข้ากลุ่ม LINE — ตัดสินจากปฏิทิน public_holiday ว่าวันนี้เป็นวันประกาศไหม
// Deploy: supabase functions deploy requisition-announce
//
// Secrets ที่ต้องตั้ง (คนละ OA กับ expiry-alert — คนละกลุ่ม คนละโควตา):
//   supabase secrets set LINE_REQ_CHANNEL_TOKEN=<channel access token ของ OA กลุ่มเบิกยา>
//   supabase secrets set LINE_REQ_GROUP_ID=<group id ของกลุ่มเบิกยา>
//
// Trigger:
//   - cron รายวัน 08:00 ไทย (ดู requisition_announce_cron.sql) — ฟังก์ชันตัดสินเองว่าวันไหนต้องส่ง
//   - manual ทดสอบ: body {"dryRun": true} = คำนวณอย่างเดียว ไม่ส่ง / {"date":"2026-12-08"} = จำลองวันอื่น
//
// logic ทั้งหมดอยู่ใน _shared/announceSchedule.js (ไฟล์เดียวกับที่แอปและ golden test ใช้)
// → แก้กฎที่เดียว ไม่ต้อง sync หลายที่ (ต่างจาก swapPolicy ที่ต้อง sync 4 ที่ ดู Critical Rule #11)

import {
  announcementFor,
  buildAnnouncementText,
  addDays,
  toYmd,
} from "../_shared/announceSchedule.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_TOKEN   = Deno.env.get("LINE_REQ_CHANNEL_TOKEN") || "";
const LINE_GROUP   = Deno.env.get("LINE_REQ_GROUP_ID") || "";

/** วันนี้ตามเวลาไทย — Edge Function รันบน UTC, ห้ามใช้ new Date() ตรงๆ ไม่งั้นก่อน 07:00 จะได้วันก่อนหน้า */
function todayBangkok(): string {
  const now = new Date();
  return toYmd(new Date(now.getTime() + 7 * 3600_000));
}

async function fetchHolidayMap(from: string, to: string): Promise<Map<string, string>> {
  const url = `${SUPABASE_URL}/rest/v1/public_holiday`
    + `?select=holiday_date,name&holiday_date=gte.${from}&holiday_date=lte.${to}`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`โหลดปฏิทินวันหยุดไม่สำเร็จ: ${res.status} ${await res.text()}`);
  const rows = await res.json() as { holiday_date: string; name: string }[];
  return new Map(rows.map(r => [r.holiday_date, r.name]));
}

async function insertAudit(action: string, details: unknown, recordCount: number | null = null) {
  // ไม่ throw — audit ล้มต้องไม่ทำให้ประกาศล้ม (pattern เดียวกับ insertAuditLog ใน db.js)
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json", Prefer: "return=minimal",
      },
      body: JSON.stringify([{
        action, table_name: "public_holiday", user_name: "ระบบ (บอท LINE)",
        department: "คลังยา", record_count: recordCount, details,
      }]),
    });
  } catch (_e) { /* noop */ }
}

/** โควตาที่เหลือของ OA — กันยิงแล้วเงียบเพราะโควตาหมดโดยไม่มีใครรู้ */
async function quotaStatus(): Promise<{ limit: number | null; used: number | null; remain: number | null }> {
  try {
    const h = { Authorization: `Bearer ${LINE_TOKEN}` };
    const [q, c] = await Promise.all([
      fetch("https://api.line.me/v2/bot/message/quota", { headers: h }).then(r => r.json()),
      fetch("https://api.line.me/v2/bot/message/quota/consumption", { headers: h }).then(r => r.json()),
    ]);
    const limit = q?.type === "limited" ? Number(q.value) : null;   // null = ไม่จำกัด (แพ็กเกจเสียเงิน)
    const used  = Number(c?.totalUsage ?? 0);
    return { limit, used, remain: limit == null ? null : limit - used };
  } catch (_e) {
    return { limit: null, used: null, remain: null };
  }
}

async function groupMemberCount(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/group/${LINE_GROUP}/members/count`, {
      headers: { Authorization: `Bearer ${LINE_TOKEN}` },
    });
    if (!res.ok) return null;
    return Number((await res.json())?.count ?? null);
  } catch (_e) { return null; }
}

/**
 * ส่งด้วย message type `textV2` + substitution mention
 * ⚠️ ห้ามใช้ type `text` แล้วพิมพ์ "@All" ลงไปตรงๆ — มันจะเป็นตัวอักษรธรรมดา ไม่เด้ง noti
 * mentionee type "all" ใช้ได้เฉพาะ reply/push และปลายทางต้องเป็น group/multi-person chat
 */
async function pushAnnouncement(text: string) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({
      to: LINE_GROUP,
      messages: [{
        type: "textV2",
        text,
        substitution: { everyone: { type: "mention", mentionee: { type: "all" } } },
      }],
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`LINE push ล้มเหลว: ${res.status} ${body}`);
  return body;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    let opts: { date?: string; dryRun?: boolean } = {};
    try { opts = await req.json(); } catch { /* body ว่าง = โหมดปกติ */ }

    const today = opts.date || todayBangkok();

    // ดึงวันหยุด ±60 วันรอบวันนี้ — พอสำหรับหาช่วงหยุดยาวและรอบถัดไป
    const holidays = await fetchHolidayMap(addDays(today, -60), addDays(today, 60));
    const info = announcementFor(today, holidays);

    if (!info.send) {
      return json({ ok: true, date: today, sent: false, reason: "วันนี้ไม่ใช่วันส่งใบเบิก" });
    }

    const text = buildAnnouncementText(info);

    if (opts.dryRun) {
      return json({ ok: true, date: today, sent: false, dryRun: true, info, text });
    }

    if (!LINE_TOKEN || !LINE_GROUP) {
      return json({ ok: false, date: today, sent: false, error: "ยังไม่ได้ตั้ง LINE_REQ_CHANNEL_TOKEN / LINE_REQ_GROUP_ID" }, 500);
    }

    // กันเคส "ประกาศหายไปเงียบๆ ปลายเดือน" ที่บอทตัวเดิมเป็นมาตลอด
    const quota = await quotaStatus();
    const members = await groupMemberCount();
    if (quota.remain != null && members != null && quota.remain < members) {
      await insertAudit("line_announce", {
        date: today, sent: false, reason: "โควตา LINE ไม่พอ",
        quota_remain: quota.remain, group_members: members,
      });
      return json({ ok: false, date: today, sent: false, error: "โควตา LINE ไม่พอสำหรับกลุ่มนี้", quota, members }, 429);
    }

    await pushAnnouncement(text);

    await insertAudit("line_announce", {
      date: today,
      sent: true,
      requisition_date: info.requisitionDate,
      pickup_date: info.pickupDate,
      shifted_from: info.shiftedFrom,
      merged_from: info.mergedFrom,
      pickup_skipped: info.pickupSkipped,
      clearance: info.clearance,
      quota_remain_before: quota.remain,
      group_members: members,
    }, members);

    return json({ ok: true, date: today, sent: true, text, quota, members });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await insertAudit("line_announce", { sent: false, error: msg });
    return json({ ok: false, error: msg }, 500);
  }
});
