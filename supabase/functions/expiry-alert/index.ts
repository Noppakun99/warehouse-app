// Supabase Edge Function: expiry-alert
// ดึงข้อมูล inventory + receive_logs → สร้าง HTML report → ส่ง email ผ่าน Gmail SMTP
// Deploy: supabase functions deploy expiry-alert
// Secrets ที่ต้องตั้ง:
//   supabase secrets set GMAIL_USER=noppakun.kao1234@gmail.com
//   supabase secrets set GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx   (App Password 16 หลัก ไม่ใช่ password Gmail ปกติ)
//   supabase secrets set ALERT_EMAILS=noppakun.kao1234@gmail.com,nasamax2000gtr@gmail.com,lovelovetai1@gmail.com,angelmatsu888888@gmail.com
//   supabase secrets set WARNING_DAYS=400
//
// Trigger:
//   - แบบ manual จากแอป: supabase.functions.invoke('expiry-alert')
//   - แบบ cron รายวัน: ใช้ pg_cron (ดู supabase/migrations/expiry_alert_cron.sql)

import nodemailer from "npm:nodemailer@6.9.16";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GMAIL_USER   = Deno.env.get("GMAIL_USER")!;
const GMAIL_PASS   = Deno.env.get("GMAIL_APP_PASSWORD")!;
const ALERT_EMAILS = (Deno.env.get("ALERT_EMAILS") || "").split(",").map(s => s.trim()).filter(Boolean);
const WARNING_DAYS = parseInt(Deno.env.get("WARNING_DAYS") || "400");

// ============================================================
// Supabase REST helper (ใช้ service role key → bypass RLS)
// ============================================================
async function fetchTable(table: string, select: string, extraQuery = ""): Promise<any[]> {
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}`;
  if (extraQuery) url += "&" + extraQuery;
  // ดึงครบทุก row (Supabase default limit 1000) — ใช้ Prefer: count=exact + Range
  const all: any[] = [];
  let offset = 0;
  const BATCH = 1000;
  while (true) {
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Range: `${offset}-${offset + BATCH - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!res.ok) throw new Error(`fetch ${table} failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < BATCH) break;
    offset += BATCH;
  }
  return all;
}

// ============================================================
// แปลง exp string → Date
// ============================================================
function parseExpDate(raw: string | null | undefined): Date | null {
  if (!raw || raw === "-") return null;
  const s = String(raw).trim();

  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    let y = parseInt(slash[3]);
    if (y > 2500) y -= 543;
    const d = new Date(y, parseInt(slash[2]) - 1, parseInt(slash[1]));
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  const mon: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  const dash = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (dash) {
    const m = mon[dash[2].toLowerCase()];
    if (m === undefined) return null;
    let y = parseInt(dash[3]);
    if (y < 100) y += 2000;
    const d = new Date(y, m, parseInt(dash[1]));
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  const serial = Number(s);
  if (!isNaN(serial) && serial > 30000 && serial < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function daysLeft(exp: Date, today: Date): number {
  return Math.floor((exp.getTime() - today.getTime()) / 86400000);
}

// ============================================================
// สร้าง HTML email
// ============================================================
interface InvRow {
  code: string; location: string; type: string; name: string;
  lot: string; exp: string; qty: string; unit: string;
  supplier: string; receive_status?: string;
}
interface DetailEntry {
  supplier_current: string;
  drug_swap_policy: string;
  supplier_changed: string;
}
interface AlertItem { r: InvRow; expDate: Date; }

function makeTable(items: AlertItem[], today: Date, isExpired: boolean, detailMap: Record<string, DetailEntry>): string {
  const th = `style="background:#e2e8f0;padding:10px 12px;text-align:left;border:1px solid #cbd5e1;font-size:14px;font-weight:bold;color:#334155;white-space:nowrap;"`;
  let html = `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:20px;">`;
  html += "<thead><tr>";
  ["ตำแหน่ง","ชนิดยา","ชื่อยา","Lot","Exp","คงเหลือ","หน่วย","บริษัท","นโยบายเปลี่ยนยา", isExpired ? "เกินมาแล้ว" : "คงเหลือ (วัน)"].forEach(h => {
    html += `<th ${th}>${h}</th>`;
  });
  html += "</tr></thead><tbody>";

  for (const item of items) {
    const row = item.r;
    const days = daysLeft(item.expDate, today);
    const bg = isExpired ? "#fef2f2" : (days <= 90 ? "#fffbeb" : "#f0fdf4");
    const dc = isExpired ? "#dc2626" : (days <= 90 ? "#d97706" : "#16a34a");
    const td = `style="padding:9px 12px;border:1px solid #e2e8f0;background:${bg};font-size:14px;vertical-align:middle;"`;

    const code = String(row.code || "").trim().toLowerCase();
    const lot  = String(row.lot  || "").trim().toLowerCase();
    const d = detailMap[`${code}|${lot}`] || detailMap[`${code}|`] || ({} as DetailEntry);

    const supplier = d.supplier_current || row.supplier || "-";
    const swapParts: string[] = [];
    if (d.drug_swap_policy && d.drug_swap_policy !== "-") swapParts.push(d.drug_swap_policy);
    if (d.supplier_changed && d.supplier_changed !== "-") swapParts.push(d.supplier_changed);
    const swapText = swapParts.length > 0 ? swapParts.join(" | ") : "-";

    html += "<tr>";
    html += `<td ${td}>${row.location || "-"}</td>`;
    html += `<td ${td}>${row.type || "-"}</td>`;
    html += `<td ${td}><b style="font-size:15px;">${row.name || "-"}</b></td>`;
    html += `<td ${td}>${row.lot || "-"}</td>`;
    html += `<td ${td}><b>${fmtDate(item.expDate)}</b></td>`;
    html += `<td style="padding:9px 12px;border:1px solid #e2e8f0;background:${bg};font-size:14px;text-align:right;vertical-align:middle;">${row.qty || "-"}</td>`;
    html += `<td ${td}>${row.unit || "-"}</td>`;
    html += `<td ${td}>${supplier}</td>`;
    html += `<td ${td}>${swapText}</td>`;
    html += `<td style="padding:9px 12px;border:1px solid #e2e8f0;background:${bg};text-align:right;font-weight:bold;font-size:15px;color:${dc};vertical-align:middle;white-space:nowrap;">${Math.abs(days)} วัน</td>`;
    html += "</tr>";
  }

  html += "</tbody></table>";
  return html;
}

function buildEmail(expired: AlertItem[], nearExpiry: AlertItem[], today: Date, detailMap: Record<string, DetailEntry>): string {
  let html = `<div style="font-family:'Sarabun','Noto Sans Thai',sans-serif;max-width:1100px;margin:auto;color:#1e293b;font-size:15px;">`;
  html += `<h2 style="color:#b91c1c;border-bottom:3px solid #fee2e2;padding-bottom:10px;font-size:22px;">รายงานยาใกล้หมดอายุ — ${fmtDate(today)}</h2>`;
  html += `<p style="color:#64748b;font-size:14px;">ข้อมูลจากระบบแผนผังคลังยา (Supabase) · แจ้งเตือนอัตโนมัติ</p>`;

  if (expired.length > 0) {
    html += `<h3 style="color:#dc2626;margin-top:28px;font-size:18px;">❌ ยาหมดอายุแล้ว (${expired.length} รายการ)</h3>`;
    html += makeTable(expired, today, true, detailMap);
  }
  if (nearExpiry.length > 0) {
    html += `<h3 style="color:#d97706;margin-top:28px;font-size:18px;">⚠️ ยาใกล้หมดอายุ ภายใน ${WARNING_DAYS} วัน (${nearExpiry.length} รายการ)</h3>`;
    html += makeTable(nearExpiry, today, false, detailMap);
  }

  html += `<p style="color:#94a3b8;font-size:13px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:12px;">ส่งอัตโนมัติโดย Supabase Edge Function · ระบบแผนผังคลังยา</p>`;
  html += "</div>";
  return html;
}

// ============================================================
// Main handler
// ============================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // 1. ดึง inventory + receive_logs
    const [invRows, recRows] = await Promise.all([
      fetchTable("inventory", "code,location,type,name,lot,exp,qty,unit,supplier,receive_status", "order=location"),
      fetchTable("receive_logs", "drug_code,lot,bill_number,supplier_current,drug_swap_policy,supplier_changed,receive_date", "order=receive_date.desc.nullslast"),
    ]);

    // 2. สร้าง detailMap key="code|lot" + fallback "code|"
    const detailMap: Record<string, DetailEntry> = {};
    for (const r of recRows) {
      const code = String(r.drug_code || "").trim().toLowerCase();
      const lot  = String(r.lot       || "").trim().toLowerCase();
      if (!code) continue;
      const entry: DetailEntry = {
        supplier_current: r.supplier_current || "",
        drug_swap_policy: r.drug_swap_policy || "",
        supplier_changed: r.supplier_changed || "",
      };
      const keyLot  = `${code}|${lot}`;
      const keyCode = `${code}|`;
      if (!detailMap[keyLot])  detailMap[keyLot]  = entry;
      if (!detailMap[keyCode]) detailMap[keyCode] = entry;
    }

    // 3. แยก expired / nearExpiry
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const warnDate = new Date(today);
    warnDate.setDate(warnDate.getDate() + WARNING_DAYS);

    const expired: AlertItem[] = [];
    const nearExpiry: AlertItem[] = [];

    for (const row of invRows) {
      if (!row.exp || row.exp === "-") continue;
      const exp = parseExpDate(row.exp);
      if (!exp) continue;
      const qty = parseFloat(String(row.qty || "0").replace(/,/g, ""));
      if (isNaN(qty) || qty <= 0) continue;
      if (row.receive_status === "รอตรวจรับ") continue;

      if (exp < today) expired.push({ r: row, expDate: exp });
      else if (exp <= warnDate) nearExpiry.push({ r: row, expDate: exp });
    }

    expired.sort((a, b) => a.expDate.getTime() - b.expDate.getTime());
    nearExpiry.sort((a, b) => a.expDate.getTime() - b.expDate.getTime());

    const total = expired.length + nearExpiry.length;
    if (total === 0) {
      return new Response(JSON.stringify({ ok: true, total: 0, message: "ไม่มียาที่ต้องแจ้งเตือนวันนี้" }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 4. ส่ง email ผ่าน Gmail SMTP
    const subject = `[แจ้งเตือน] ยาใกล้หมดอายุ — ${fmtDate(today)} (${total} รายการ)`;
    const html = buildEmail(expired, nearExpiry, today, detailMap);

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    });

    await transporter.sendMail({
      from: GMAIL_USER,
      to: ALERT_EMAILS.join(", "),
      subject,
      text: "กรุณาดูรายละเอียดใน HTML",
      html,
    });

    return new Response(JSON.stringify({ ok: true, total, expired: expired.length, nearExpiry: nearExpiry.length }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
