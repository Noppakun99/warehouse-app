// ============================================================
// line-quota — โควตา LINE ที่เหลือของ OA ทั้ง 2 ตัว (อ่านอย่างเดียว)
// ============================================================
// เรียกจากปุ่มใน HolidayCalendarApp (admin) ผ่าน supabase.functions.invoke
// verify_jwt = true → ต้องมี anon key ของโปรเจกต์ (เหมือน scan-invoice)
//
// ทำไมต้องมี: โควตา LINE นับ "รายหัว" (กลุ่ม N คน = N ข้อความ/ครั้ง) คนดูแล
// จึงเดาเองไม่ได้ว่าเหลือส่งได้อีกกี่ครั้ง ต้องเอา remain ÷ members
// ไม่คืน token ออกไป — คืนแค่ตัวเลข
//
// 2 OA แยกก้อนโควตากัน (ดู docs/features/requisition-announce.md):
//   announce = บอทประกาศรอบเบิก-รับ  (LINE_REQ_*)
//   expiry   = บอทแจ้งเตือนยาใกล้หมดอายุ (LINE_CHANNEL_ACCESS_TOKEN / LINE_GROUP_ID)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Bot = { key: string; label: string; token: string; group: string };

/** อ่านโควตา + จำนวนสมาชิกของ OA ตัวหนึ่ง — ไม่ throw (OA ตัวหนึ่งล่มต้องไม่ทำให้อีกตัวหาย) */
async function readBot(bot: Bot) {
  if (!bot.token) {
    return { key: bot.key, label: bot.label, configured: false, error: "ยังไม่ได้ตั้ง token" };
  }
  try {
    const h = { Authorization: `Bearer ${bot.token}` };
    const [q, c, m] = await Promise.all([
      fetch("https://api.line.me/v2/bot/message/quota", { headers: h }).then(r => r.json()),
      fetch("https://api.line.me/v2/bot/message/quota/consumption", { headers: h }).then(r => r.json()),
      bot.group
        ? fetch(`https://api.line.me/v2/bot/group/${bot.group}/members/count`, { headers: h })
            .then(r => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
    ]);
    // type "none" = ไม่จำกัด (แพ็กเกจเสียเงิน) → limit/remain เป็น null โดยตั้งใจ
    const limit = q?.type === "limited" ? Number(q.value) : null;
    const used = Number(c?.totalUsage ?? 0);
    const members = m?.count ?? null;          // บอทเองไม่ถูกนับรวม
    const remain = limit == null ? null : limit - used;
    // ส่งได้อีกกี่ "ครั้ง" = ข้อความที่เหลือ ÷ คนในกลุ่ม (push นับรายหัว)
    const sendsLeft = remain != null && members ? Math.floor(remain / members) : null;
    return { key: bot.key, label: bot.label, configured: true, limit, used, remain, members, sendsLeft };
  } catch (err) {
    return { key: bot.key, label: bot.label, configured: true, error: String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const bots: Bot[] = [
    {
      key: "announce",
      label: "บอทประกาศรอบเบิก-รับ",
      token: Deno.env.get("LINE_REQ_CHANNEL_TOKEN") || "",
      group: Deno.env.get("LINE_REQ_GROUP_ID") || "",
    },
    {
      key: "expiry",
      label: "บอทแจ้งเตือนยาใกล้หมดอายุ",
      token: Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "",
      group: Deno.env.get("LINE_GROUP_ID") || "",
    },
  ];
  const results = await Promise.all(bots.map(readBot));
  return new Response(JSON.stringify({ ok: true, bots: results }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
