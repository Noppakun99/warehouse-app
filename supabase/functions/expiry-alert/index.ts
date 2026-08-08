// Supabase Edge Function: expiry-alert
// ดึงข้อมูล inventory + receive_logs → สร้าง HTML report → ส่ง email ผ่าน Gmail SMTP
// Deploy: supabase functions deploy expiry-alert
// Secrets ที่ต้องตั้ง (ค่าอยู่ใน Supabase secrets — ไม่ hardcode ในไฟล์นี้):
//   supabase secrets set GMAIL_USER=...
//   supabase secrets set GMAIL_APP_PASSWORD=...   (App Password 16 หลัก ไม่ใช่ password Gmail ปกติ)
//   supabase secrets set ALERT_EMAILS=a@example.com,b@example.com
//   supabase secrets set WARNING_DAYS=487   (= 16 เดือน ให้ตรงกับโมดอลในแอป ดู Rule #6)
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

// LINE Messaging API — push เข้ากลุ่ม staff (ควบคู่ email; email คือ fallback ถาวร)
// ตั้ง secret 3 ตัว: LINE_CHANNEL_ACCESS_TOKEN, LINE_GROUP_ID, LINE_WARNING_DAYS (default 365)
// ถ้าไม่ตั้ง token/group → ข้าม LINE เงียบๆ (email ยังทำงานปกติ)
const LINE_TOKEN        = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
const LINE_GROUP_ID     = Deno.env.get("LINE_GROUP_ID") || "";
// LINE threshold แคบกว่า/คนละค่ากับ email โดยเจตนา — 365 ครอบ policy "แจ้งก่อนหมด 1 ปี" (สยามฟาร์มา/พอนด์)
// ตัวคุม volume จริงคือ "ความถี่ cron สัปดาห์ละครั้ง" ไม่ใช่ค่านี้ (ดู docs/expiry-alert-edge-function.md)
const LINE_WARNING_DAYS = parseInt(Deno.env.get("LINE_WARNING_DAYS") || "365");
const LINE_TOP_N        = 15;  // จำกัดจำนวนรายการต่อ bucket ใน LINE (กัน 5000-char limit)

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

// 487 → "1 ปี 4 เดือน" — จำนวนวันดิบอ่านแล้วนึกภาพไม่ออกว่านานแค่ไหน
// คำนวณจากค่าจริงไม่ hardcode (WARNING_DAYS มาจาก secret เปลี่ยนได้)
function humanDays(days: number): string {
  const y = Math.floor(days / 365);
  const m = Math.round((days % 365) / 30);
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} ปี`);
  if (m > 0) parts.push(`${m} เดือน`);
  return parts.length ? `≈ ${parts.join(" ")}` : `${days} วัน`;
}

// ============================================================
// นโยบายเปลี่ยน/คืนยาก่อนพ้นกำหนดบริษัท — port ตรงจาก src/lib/swapPolicy.js
// (ต้องตรงกับแอป: parseReturnPolicy + computeReturnStatus, buffer 60 วัน)
// ============================================================
const RETURN_ALERT_BUFFER_DAYS = 60;

function monthsFromMatch(numStr: string, unit: string): number | null {
  const n = parseFloat(numStr);
  if (isNaN(n) || n <= 0) return null;
  if (unit === "ปี") return Math.round(n * 12);
  if (unit === "วัน") return Math.max(1, Math.ceil(n / 30));
  return Math.round(n);
}

// text → { canReturn, months, differsByItem } (ตรงกับ swapPolicy.js)
function parseReturnPolicy(text: string): { canReturn: boolean | null; months: number | null; differsByItem: boolean } {
  const raw = (text || "").trim();
  if (!raw || raw === "-") return { canReturn: null, months: null, differsByItem: false };
  const differsByItem = /เงื่อนไข\s*แตกต่าง|แล้วแต่รายการ/.test(raw);
  const monthRe = /(\d+(?:\.\d+)?)\s*(เดือน|ปี|วัน)/g;
  let best: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = monthRe.exec(raw)) !== null) {
    const val = monthsFromMatch(m[1], m[2]);
    if (val == null) continue;
    if (best == null || val < best) best = val;
  }
  if (best != null) return { canReturn: true, months: best, differsByItem };
  const noReturn = /ไม่รับ(แลก)?(เปลี่ยน|คืน)|ไม่มีนโยบาย(การ)?แลกเปลี่ยน|สงวนสิทธิ์ไม่รับ/.test(raw);
  if (noReturn) return { canReturn: false, months: null, differsByItem };
  return { canReturn: null, months: null, differsByItem };
}

function diffDaysD(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((da.getTime() - db.getTime()) / 86400000);
}

function subMonths(date: Date, months: number): Date {
  // clamp วันสิ้นเดือน (ตรง swapPolicy.js) — 31/7 − 3 ด. = 30/4 ไม่ spillover
  const y = date.getFullYear();
  const mm = date.getMonth() - months;
  const lastDay = new Date(y, mm + 1, 0).getDate();
  return new Date(y, mm, Math.min(date.getDate(), lastDay));
}

function addMonths(date: Date, months: number): Date {
  const y = date.getFullYear();
  const mm = date.getMonth() + months;
  const lastDay = new Date(y, mm + 1, 0).getDate();
  return new Date(y, mm, Math.min(date.getDate(), lastDay));
}

// → { status: 'ok'|'due'|'overdue'|'no_policy', deadline, daysToDeadline } (ตรงกับ swapPolicy.js)
function computeReturnStatus(exp: Date, months: number | null, today: Date): { status: string; deadline: Date | null; daysToDeadline: number | null } {
  if (months == null || isNaN(exp.getTime()) || isNaN(today.getTime())) {
    return { status: "no_policy", deadline: null, daysToDeadline: null };
  }
  const deadline = subMonths(exp, months);
  const daysToDeadline = diffDaysD(deadline, today);
  let status: string;
  if (daysToDeadline <= 0) status = "overdue";
  else if (daysToDeadline <= RETURN_ALERT_BUFFER_DAYS) status = "due";
  else status = "ok";
  return { status, deadline, daysToDeadline };
}

// ============================================================
// เฟส 2 (ADR-0014): parseReturnPolicyV2 + computeReturnStatusV2 — sync จาก swapPolicy.js
// อ่าน structured tier detail (col 28). แก้ที่ swapPolicy.js ต้อง copy มาที่นี่ด้วย (Deno import node ไม่ได้)
// ============================================================
function monthsIn(text: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(เดือน|ปี|วัน)/.exec(text || "");
  return m ? monthsFromMatch(m[1], m[2]) : null;
}
interface Tier { ageMonthsMin: number | null; ageMonthsMax: number | null; percent: number; }
interface PolicyV2 { shape: string; canReturn: boolean | null; tiers: Tier[]; afterExpMonths: number | null; beforeExpMonths: number | null; receiveThresholdMonths: number | null; differsByItem: boolean; needsReview: boolean; }

function parseTiers(raw: string): Tier[] {
  const tiers: Tier[] = [];
  for (const line of raw.split(/[\n|]/)) {
    const s = line.trim();
    if (!s || /ไม่รับ/.test(s)) continue;
    let percent: number | null = null;
    const pm = /(\d+)\s*%/.exec(s);
    if (pm) percent = parseInt(pm[1]);
    else if (/เต็มจำนวน/.test(s)) percent = 100;
    else if (/ครึ่งหนึ่ง|ครึ่ง/.test(s)) percent = 50;
    if (percent == null) continue;
    let min: number | null = null, max: number | null = null;
    const range = /(\d+)\s*(เดือน|ปี)\s*[-–]\s*(\d+)\s*(เดือน|ปี)/.exec(s);
    if (range) { min = monthsFromMatch(range[1], range[2]); max = monthsFromMatch(range[3], range[4]); }
    else if (/[>≥]|มากกว่า|ไม่ต่ำกว่า|ไม่น้อยกว่า/.test(s)) { min = monthsIn(s); max = null; }
    else if (/[<≤]|น้อยกว่า|ต่ำกว่า/.test(s)) { min = null; max = monthsIn(s); }
    else { min = monthsIn(s); max = null; }
    tiers.push({ ageMonthsMin: min, ageMonthsMax: max, percent });
  }
  return tiers.sort((a, b) => (b.ageMonthsMin ?? 0) - (a.ageMonthsMin ?? 0));
}

function parseReturnPolicyV2(detail: string): PolicyV2 {
  const raw = (detail || "").trim();
  const empty: PolicyV2 = { shape: "ambiguous", canReturn: null, tiers: [], afterExpMonths: null, beforeExpMonths: null, receiveThresholdMonths: null, differsByItem: false, needsReview: true };
  if (!raw || raw === "-") return empty;
  const differsByItem = /เงื่อนไข\s*แตกต่าง|แล้วแต่รายการ|ไม่ระบุ(เงื่อนไข)?ชัดเจน/.test(raw);
  if (/ไม่ระบุ(เงื่อนไข)?ชัดเจน/.test(raw)) return { ...empty, differsByItem, needsReview: true };
  const hasReceiveException = /ยกเว้น.*(อายุสั้น|อายุ\s*สั้น|ล็อต?อายุสั้น|บ\.?ส่งยาอายุสั้น)/.test(raw);
  if (hasReceiveException) {
    const th = monthsIn(raw);
    return { shape: "receive_threshold", canReturn: null, tiers: [], afterExpMonths: null, beforeExpMonths: null, receiveThresholdMonths: th, differsByItem, needsReview: th == null };
  }
  if (/คืน\s*(ภายใน|ก่อน)\s*\d+\s*(เดือน|ปี)/.test(raw)) {
    const first = /คืน\s*(?:ภายใน|ก่อน)\s*(\d+)\s*(เดือน|ปี)/.exec(raw);
    const n = first ? monthsFromMatch(first[1], first[2]) : null;
    if (n != null) return { shape: "before_exp", canReturn: true, tiers: parseTiers(raw), afterExpMonths: null, beforeExpMonths: n, receiveThresholdMonths: null, differsByItem, needsReview: false };
  }
  const hasAgeTierGate = /อายุ\s*(ยา)?\s*[<>≤≥]|อายุ\s*(ยา)?\s*(มากกว่า|น้อยกว่า|ต่ำกว่า)|แจ้งก่อน/.test(raw);
  if (/\d+\s*%|เปลี่ยน(ให้|ได้|เต็มจำนวน)/.test(raw) && hasAgeTierGate) {
    const tiers = parseTiers(raw);
    if (tiers.length > 0) {
      const isBeforeExp = /แจ้งก่อน(หมดอายุ)?/.test(raw) && !/อายุ\s*[<>]/.test(raw);
      return { shape: isBeforeExp ? "before_exp" : "age_tier", canReturn: true, tiers, afterExpMonths: null, beforeExpMonths: isBeforeExp ? (tiers[0]?.ageMonthsMin ?? null) : null, receiveThresholdMonths: null, differsByItem, needsReview: false };
    }
  }
  if (/ไม่รับ(แลก)?(เปลี่ยน|คืน)|ไม่มีนโยบาย|ขายขาด|สงวนสิทธิ์ไม่รับ/.test(raw)) {
    return { shape: "binary", canReturn: false, tiers: [], afterExpMonths: null, beforeExpMonths: null, receiveThresholdMonths: null, differsByItem, needsReview: false };
  }
  if (/หลังจากหมดอายุ|หลังหมดอายุ|หมดอายุ(ไป)?แล้ว|เมื่อหมดอายุ|สิ้นอายุ/.test(raw)) {
    return { shape: "after_exp", canReturn: true, tiers: [], afterExpMonths: monthsIn(raw), beforeExpMonths: null, receiveThresholdMonths: null, differsByItem, needsReview: false };
  }
  if (/ก่อน(วัน)?หมดอายุ|อายุ(ยา)?(จะต้อง)?ไม่(ต่ำ|น้อย)กว่า|อายุยาไม่เกิน/.test(raw)) {
    const n = monthsIn(raw);
    if (n != null) return { shape: "before_exp", canReturn: true, tiers: [], afterExpMonths: null, beforeExpMonths: n, receiveThresholdMonths: null, differsByItem, needsReview: false };
  }
  return { ...empty, differsByItem, needsReview: true };
}

function tierForAge(tiers: Tier[], ageMonths: number): Tier | null {
  for (const t of tiers) {
    const okMin = t.ageMonthsMin == null || ageMonths >= t.ageMonthsMin;
    const okMax = t.ageMonthsMax == null || ageMonths < t.ageMonthsMax;
    if (okMin && okMax) return t;
  }
  return null;
}
function tierDeadline(tiers: Tier[], exp: Date): Date | null {
  const top = tiers.find((t) => t.percent === 100) || tiers[0];
  if (!top || top.ageMonthsMin == null) return null;
  return subMonths(exp, top.ageMonthsMin);
}

// → { status, deadline, daysToDeadline, percent, note } (ตรง computeReturnStatusV2 ใน swapPolicy.js)
function computeReturnStatusV2(policy: PolicyV2, exp: Date, receiveDate: Date | null, today: Date):
  { status: string; deadline: Date | null; daysToDeadline: number | null; percent: number | null; note: string | null } {
  const nil = { status: "review", deadline: null, daysToDeadline: null, percent: null, note: null };
  if (!policy || isNaN(exp.getTime()) || isNaN(today.getTime())) return nil;
  const mkStatus = (dl: Date) => { const d = diffDaysD(dl, today); return d <= 0 ? "overdue" : d <= RETURN_ALERT_BUFFER_DAYS ? "due" : "ok"; };
  switch (policy.shape) {
    case "binary":
      return { status: "no_return", deadline: null, daysToDeadline: null, percent: 0, note: "บริษัทไม่รับคืน" };
    case "receive_threshold": {
      if (policy.receiveThresholdMonths == null || !receiveDate || isNaN(receiveDate.getTime())) return nil;
      const thresholdDate = subMonths(exp, policy.receiveThresholdMonths);
      if (receiveDate <= thresholdDate) return { status: "no_return", deadline: null, daysToDeadline: null, percent: 0, note: `บริษัทไม่รับคืน (ส่งมาอายุ ≥ ${policy.receiveThresholdMonths} เดือน)` };
      const d = diffDaysD(exp, today);
      return { status: d <= 0 ? "overdue" : d <= RETURN_ALERT_BUFFER_DAYS ? "due" : "ok", deadline: exp, daysToDeadline: d, percent: 100, note: "รับคืน (ส่งมาอายุสั้น)" };
    }
    case "after_exp": {
      const dl = policy.afterExpMonths != null ? addMonths(exp, policy.afterExpMonths) : exp;
      const d = diffDaysD(dl, today);
      return { status: d <= 0 ? "overdue" : d <= RETURN_ALERT_BUFFER_DAYS ? "due" : "ok", deadline: dl, daysToDeadline: d, percent: policy.afterExpMonths != null ? null : 100, note: policy.afterExpMonths != null ? `คืนได้ถึง ${policy.afterExpMonths} เดือนหลังหมดอายุ` : "คืนได้หลังหมดอายุ" };
    }
    case "before_exp": {
      if (policy.beforeExpMonths == null) return nil;
      const dl = subMonths(exp, policy.beforeExpMonths);
      const d = diffDaysD(dl, today);
      return { status: mkStatus(dl), deadline: dl, daysToDeadline: d, percent: policy.tiers?.[0]?.percent ?? 100, note: `แจ้งก่อนหมดอายุ ${policy.beforeExpMonths} เดือน` };
    }
    case "age_tier": {
      const ageMonths = diffDaysD(exp, today) / 30;
      if (ageMonths < 0) return { status: "overdue", deadline: tierDeadline(policy.tiers, exp), daysToDeadline: null, percent: null, note: "ยาหมดอายุแล้ว — พ้นสิทธิ์คืนตามอายุ" };
      const tier = tierForAge(policy.tiers, ageMonths);
      const dl = tierDeadline(policy.tiers, exp);
      const d = dl ? diffDaysD(dl, today) : null;
      const status = d == null ? "ok" : d <= 0 ? "overdue" : d <= RETURN_ALERT_BUFFER_DAYS ? "due" : "ok";
      return { status, deadline: dl, daysToDeadline: d, percent: tier ? tier.percent : null, note: tier ? `คืนได้ ${tier.percent}% (อายุเหลือ ~${Math.round(ageMonths)} เดือน)` : "อายุเหลือน้อย — ตรวจ tier" };
    }
    default:
      return nil;
  }
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
  swap_tier_detail?: string;   // เฟส 2 (ADR-0014) — structured tier (V2)
  receive_date?: string;       // สำหรับ receive_threshold (Diltiazem)
  swap_condition_am?: string;  // finding #2 — flag แตกต่างกัน/เดียวกัน
}
interface AlertItem { r: InvRow; expDate: Date; }

// หัวตารางซ้ำทุก N แถว — Gmail ตัด position:sticky ทิ้ง (email client ไม่รองรับ)
// การซ้ำหัวคือวิธีมาตรฐานที่ทำได้จริง ให้คนเลื่อนกลางตารางยังรู้ว่าคอลัมน์ไหนคืออะไร
const HEADER_REPEAT_EVERY = 20;

function makeTable(items: AlertItem[], today: Date, isExpired: boolean, detailMap: Record<string, DetailEntry>): string {
  // ห้ามใส่ white-space:nowrap ในหัว — table-layout:fixed บีบช่องตาม % ที่สั่ง
  // หัวที่ nowrap จะล้นไปทับหัวถัดไป (เหตุการณ์: "คงเหลือ (วัน)" ทับ "คงเหลือ")
  const th = `style="background:#e2e8f0;padding:10px 8px;text-align:left;border:1px solid #cbd5e1;font-size:13px;font-weight:bold;color:#334155;word-break:break-word;"`;
  // ตัด "โซน" ออก (= ตัวอักษรแรกของตำแหน่ง ซ้ำซ้อน 100%) เอาที่ว่างให้ "รหัสยา"
  // ที่แอป/Excel มีแต่ email ไม่มี → เอาไปค้นต่อในระบบไม่ได้ (Rule #6)
  // ลำดับคอลัมน์: ย้ายคอลัมน์นับวันมาก่อน "นโยบาย" — นโยบายเป็น free-text ยาว (200+ ตัวอักษร)
  // ถ้าอยู่กลางตารางจะดันคอลัมน์หลังหลุดขอบจอ Gmail (เลื่อนขวาไม่ได้ desktop ไม่มี scrollbar)
  // เอาข้อมูลสั้น/สำคัญไว้ซ้ายทั้งหมด แล้วให้ "นโยบาย" เป็นคอลัมน์สุดท้าย ล้นได้ไม่บังใคร
  // ชื่อหัวต้องไม่กำกวม: เดิม "คงเหลือ (วัน)" กับ "คงเหลือ" อ่านแล้วสับสนว่าอันไหนจำนวน อันไหนวัน
  const HEADERS = ["ตำแหน่ง","รหัสยา","ชนิดยา","ชื่อยา","Lot","Exp", isExpired ? "เกินมาแล้ว" : "เหลืออีก","จำนวนคงเหลือ","หน่วย","บริษัท","นโยบายเปลี่ยนยา"];
  const headRow = `<tr>${HEADERS.map(h => `<th ${th}>${h}</th>`).join("")}</tr>`;

  // table-layout:fixed + width คุมต่อคอลัมน์ = Gmail คำนวณความกว้างตามที่สั่ง ไม่ยืดตามเนื้อหา
  let html = `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;font-size:13px;margin-bottom:20px;">`;
  html += `<colgroup>`;
  html += `<col style="width:7%"/><col style="width:7%"/><col style="width:7%"/><col style="width:16%"/>`;
  html += `<col style="width:8%"/><col style="width:8%"/><col style="width:8%"/><col style="width:8%"/>`;
  html += `<col style="width:7%"/><col style="width:12%"/><col style="width:12%"/>`;
  html += `</colgroup>`;
  html += `<thead>${headRow}</thead><tbody>`;

  items.forEach((item, idx) => {
    // ซ้ำหัวกลางตาราง (ไม่ซ้ำที่แถวแรก — thead แสดงอยู่แล้ว)
    if (idx > 0 && idx % HEADER_REPEAT_EVERY === 0) html += headRow;

    const row = item.r;
    const days = daysLeft(item.expDate, today);
    const bg = isExpired ? "#fef2f2" : (days <= 90 ? "#fffbeb" : "#f0fdf4");
    const dc = isExpired ? "#dc2626" : (days <= 90 ? "#d97706" : "#16a34a");
    // ทุก cell ต้อง word-break — table-layout:fixed บีบช่องตาม % เนื้อหาที่ยาวเกินจะล้นทับช่องข้าง
    const td = `style="padding:8px 8px;border:1px solid #e2e8f0;background:${bg};font-size:13px;vertical-align:top;word-break:break-word;"`;

    const code = String(row.code || "").trim().toLowerCase();
    const lot  = String(row.lot  || "-").trim().toLowerCase() || "-";
    // strict per-lot เท่านั้น — ห้าม fallback `code|` (CONTEXT §นโยบายเปลี่ยนยา + ADR-0012)
    // ยา 1 รหัสซื้อหลายบริษัทได้ (~23%) → หยิบแถวอื่นของรหัสเดียวกัน = บริษัทผิด → คืนผิดเจ้า
    // ไม่รู้บริษัท ≠ ตัดแถวทิ้ง: แถวยังอยู่ในรายการเสมอ แค่ช่องบริษัท/นโยบายเป็น '-'
    const d = detailMap[`${code}|${lot}`] || ({} as DetailEntry);

    const supplier = d.supplier_current || "-";
    const swapParts: string[] = [];
    if (d.drug_swap_policy && d.drug_swap_policy !== "-") swapParts.push(d.drug_swap_policy);
    if (d.supplier_changed && d.supplier_changed !== "-") swapParts.push(d.supplier_changed);
    const swapText = swapParts.length > 0 ? swapParts.join(" | ") : "-";

    // ลำดับต้องตรงกับ HEADERS + colgroup
    html += "<tr>";
    html += `<td ${td}>${row.location || "-"}</td>`;
    html += `<td ${td}>${row.code || "-"}</td>`;
    html += `<td ${td}>${row.type || "-"}</td>`;
    html += `<td ${td}><b style="font-size:13px;">${row.name || "-"}</b></td>`;
    html += `<td ${td}>${row.lot || "-"}</td>`;
    html += `<td ${td}><b>${fmtDate(item.expDate)}</b></td>`;
    html += `<td style="padding:8px 8px;border:1px solid #e2e8f0;background:${bg};text-align:right;font-weight:bold;font-size:13px;color:${dc};vertical-align:top;">${Math.abs(days)} วัน</td>`;
    html += `<td style="padding:8px 8px;border:1px solid #e2e8f0;background:${bg};font-size:13px;text-align:right;vertical-align:top;">${row.qty || "-"}</td>`;
    html += `<td ${td}>${row.unit || "-"}</td>`;
    html += `<td ${td}>${supplier}</td>`;
    // แสดงนโยบายเต็ม ไม่ตัด — คนอ่านต้องเห็นเงื่อนไขครบในแถวของยานั้น (ตัดแล้วอ่านไม่จบ ใช้ตัดสินใจไม่ได้)
    // ปลอดภัยเพราะ table-layout:fixed + word-break บังคับให้ข้อความ wrap ในช่อง ไม่ดันตารางล้นจอ
    html += `<td style="padding:8px 8px;border:1px solid #e2e8f0;background:${bg};font-size:11px;line-height:1.5;color:#475569;vertical-align:top;word-break:break-word;">${swapText}</td>`;
    html += "</tr>";
  });

  html += "</tbody></table>";
  return html;
}

// รายการถึงกำหนดเปลี่ยน/คืนบริษัท (status due|overdue) — deadline = exp − returnMonths
interface ReturnDueItem {
  r: InvRow; company: string; deadline: Date; daysToDeadline: number; overdue: boolean;
  policyText: string; avgPerDay: number; coverageDays: number | null; willDeplete: boolean;
  returnPct?: number | null; statusNote?: string | null;   // เฟส 2 (ADR-0014)
}

function makeReturnDueTable(items: ReturnDueItem[]): string {
  const th = `style="background:#ffedd5;padding:10px 12px;text-align:left;border:1px solid #fdba74;font-size:14px;font-weight:bold;color:#9a3412;white-space:nowrap;"`;
  let html = `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:20px;">`;
  html += "<thead><tr>";
  ["สถานะ","ชื่อยา","Lot","บริษัท","Exp","ต้องคืนภายใน","% คืน","นโยบาย (เต็ม)"].forEach(h => { html += `<th ${th}>${h}</th>`; });
  html += "</tr></thead><tbody>";
  for (const it of items) {
    // willDeplete = คาดว่าจะหมดเองก่อน deadline (ตามเรทเบิก) → แถวจาง เตือนว่าอาจไม่ต้องคืน
    const bg = it.willDeplete ? "#f8fafc" : (it.overdue ? "#fef2f2" : "#fff7ed");
    const border = it.willDeplete ? "#e2e8f0" : "#fed7aa";
    const td = `style="padding:9px 12px;border:1px solid ${border};background:${bg};font-size:14px;vertical-align:middle;${it.willDeplete ? "color:#64748b;" : ""}"`;
    const statusLabel = it.overdue ? "พ้นกำหนด" : `เหลือ ${it.daysToDeadline} วัน`;
    const statusColor = it.willDeplete ? "#94a3b8" : (it.overdue ? "#dc2626" : "#ea580c");
    const nameHtml = it.willDeplete
      ? `${it.r.name || "-"}<br><span style="font-size:12px;color:#059669;">คาดว่าจะหมดเองก่อน (ใช้ ~${Math.round(it.avgPerDay)}/วัน · พอ ~${it.coverageDays} วัน)</span>`
      : `<b style="font-size:15px;">${it.r.name || "-"}</b>`;
    html += "<tr>";
    html += `<td style="padding:9px 12px;border:1px solid ${border};background:${bg};font-weight:bold;color:${statusColor};white-space:nowrap;vertical-align:middle;">${statusLabel}</td>`;
    html += `<td ${td}>${nameHtml}</td>`;
    html += `<td ${td}>${it.r.lot || "-"}</td>`;
    html += `<td ${td}>${it.company || "-"}</td>`;
    html += `<td ${td}>${fmtDate(parseExpDate(it.r.exp) || new Date())}</td>`;
    html += `<td style="padding:9px 12px;border:1px solid ${border};background:${bg};font-weight:bold;color:${statusColor};white-space:nowrap;vertical-align:middle;">${fmtDate(it.deadline)}</td>`;
    const pctLabel = it.returnPct != null ? `${it.returnPct}%` : (it.statusNote ? "—" : "-");
    html += `<td ${td}>${pctLabel}${it.statusNote ? `<br><span style="font-size:11px;color:#94a3b8;">${it.statusNote}</span>` : ""}</td>`;
    html += `<td style="padding:9px 12px;border:1px solid ${border};background:${bg};font-size:12px;color:#475569;vertical-align:middle;">${it.policyText || "-"}</td>`;
    html += "</tr>";
  }
  html += "</tbody></table>";
  return html;
}

// ── อีเมลฉบับที่ 2: ยาหมดอายุค้างคลัง (Expired-On-Shelf) ────────────────────
// แยกจากรายงานหลักโดยเจตนา — ปัญหาคือ "แจ้งแล้วไม่มีใครเก็บออก" ข้อความจึงต้อง
// ไม่จมไปกับตารางใกล้หมดอายุ 96 แถว. ส่งเฉพาะเมื่อมีของค้างจริง (qty>0)
// → เห็นอีเมลนี้ในกล่อง = มีปัญหาแน่นอน ไม่ต้องเปิดก็รู้
function buildExpiredEmail(expired: AlertItem[], today: Date, detailMap: Record<string, DetailEntry>): string {
  // ไม่ใส่ nowrap — ตารางนี้ใช้ table-layout:fixed เหมือนตารางหลัก หัวที่ nowrap จะล้นทับช่องข้าง
  const th = `style="background:#fecaca;padding:10px 8px;text-align:left;border:1px solid #f87171;font-size:13px;font-weight:bold;color:#7f1d1d;word-break:break-word;"`;
  const HEADERS = ["ตำแหน่ง","รหัสยา","ชนิดยา","ชื่อยา","Lot","Exp","เลยมาแล้ว","คงเหลือ","หน่วย","บริษัท"];
  const headRow = `<tr>${HEADERS.map(h => `<th ${th}>${h}</th>`).join("")}</tr>`;

  let html = `<div style="font-family:'Sarabun','Noto Sans Thai',sans-serif;max-width:1100px;margin:auto;color:#1e293b;font-size:15px;">`;
  html += `<h2 style="color:#b91c1c;border-bottom:3px solid #fecaca;padding-bottom:10px;font-size:22px;">ยาหมดอายุค้างคลัง — ต้องเก็บออกจากคลังทันที</h2>`;
  html += `<p style="color:#7f1d1d;font-size:15px;font-weight:bold;margin:12px 0 4px;">พบ ${expired.length} รายการที่หมดอายุแล้วแต่ยังมีของค้างอยู่บนชั้น (${fmtDate(today)})</p>`;
  html += `<p style="color:#64748b;font-size:14px;margin:0 0 16px;">รายการเหล่านี้เคยถูกแจ้งเตือน "ใกล้หมดอายุ" มาก่อน แต่ยังไม่ได้ถูกเก็บออก — กรุณาดำเนินการและแจ้งหัวหน้า</p>`;

  // กล่องขั้นตอน — ต้องบอกวิธี "หยุดเตือน" ให้ชัด ไม่งั้นอีเมลกวนไปเรื่อยโดยคนไม่รู้ทางออก
  html += `<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;margin:0 0 20px;">`;
  html += `<p style="margin:0 0 6px;font-weight:bold;color:#92400e;font-size:15px;">สิ่งที่ต้องทำ</p>`;
  html += `<ol style="margin:0;padding-left:20px;color:#78350f;font-size:14px;line-height:1.8;">`;
  html += `<li>เก็บยาออกจากชั้นตามตำแหน่งด้านล่าง</li>`;
  html += `<li>แจ้งหัวหน้าเพื่อรับทราบและดำเนินการตามระเบียบ</li>`;
  html += `<li><b>อย่าลืมอัพเดตระบบ</b> — แก้ยอดคงเหลือใน Excel master เป็น <b>0</b> แล้ว import เข้าระบบใหม่</li>`;
  html += `</ol>`;
  html += `<p style="margin:8px 0 0;color:#b45309;font-size:13px;"><b>หมายเหตุ:</b> ถ้ายังไม่อัพเดตระบบ อีเมลฉบับนี้จะแจ้งเตือนซ้ำทุกวันจนกว่าจะอัพเดต</p>`;
  html += `</div>`;

  html += `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;font-size:13px;margin-bottom:20px;">`;
  html += `<colgroup>`;
  html += `<col style="width:9%"/><col style="width:9%"/><col style="width:9%"/><col style="width:22%"/><col style="width:11%"/>`;
  html += `<col style="width:10%"/><col style="width:10%"/><col style="width:7%"/><col style="width:7%"/><col style="width:16%"/>`;
  html += `</colgroup>`;
  html += `<thead>${headRow}</thead><tbody>`;
  expired.forEach((item, idx) => {
    if (idx > 0 && idx % HEADER_REPEAT_EVERY === 0) html += headRow;
    const row = item.r;
    const over = Math.abs(daysLeft(item.expDate, today));
    const td = `style="padding:8px 10px;border:1px solid #fecaca;background:#fef2f2;font-size:13px;vertical-align:middle;word-break:break-word;"`;
    const code = String(row.code || "").trim().toLowerCase();
    const lot  = String(row.lot  || "-").trim().toLowerCase() || "-";
    const d = detailMap[`${code}|${lot}`] || ({} as DetailEntry);   // strict per-lot
    html += "<tr>";
    html += `<td ${td}>${row.location || "-"}</td>`;
    html += `<td ${td}>${row.code || "-"}</td>`;
    html += `<td ${td}>${row.type || "-"}</td>`;
    html += `<td ${td}><b style="font-size:15px;">${row.name || "-"}</b></td>`;
    html += `<td ${td}>${row.lot || "-"}</td>`;
    html += `<td ${td}><b>${fmtDate(item.expDate)}</b></td>`;
    html += `<td style="padding:9px 12px;border:1px solid #fecaca;background:#fef2f2;text-align:right;font-weight:bold;font-size:15px;color:#dc2626;white-space:nowrap;vertical-align:middle;">${over} วัน</td>`;
    html += `<td style="padding:9px 12px;border:1px solid #fecaca;background:#fef2f2;font-size:14px;text-align:right;vertical-align:middle;">${row.qty || "-"}</td>`;
    html += `<td ${td}>${row.unit || "-"}</td>`;
    html += `<td ${td}>${d.supplier_current || "-"}</td>`;
    html += "</tr>";
  });
  html += `</tbody></table>`;
  html += `<p style="color:#94a3b8;font-size:13px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:12px;">ส่งอัตโนมัติโดย Supabase Edge Function · ระบบแผนผังคลังยา</p>`;
  html += "</div>";
  return html;
}

function buildEmail(expired: AlertItem[], nearExpiry: AlertItem[], returnDue: ReturnDueItem[], today: Date, detailMap: Record<string, DetailEntry>): string {
  let html = `<div style="font-family:'Sarabun','Noto Sans Thai',sans-serif;max-width:1100px;margin:auto;color:#1e293b;font-size:15px;">`;
  html += `<h2 style="color:#b91c1c;border-bottom:3px solid #fee2e2;padding-bottom:10px;font-size:22px;">รายงานยาใกล้หมดอายุ — ${fmtDate(today)}</h2>`;
  html += `<p style="color:#64748b;font-size:14px;">ข้อมูลจากระบบแผนผังคลังยา (Supabase) · แจ้งเตือนอัตโนมัติ</p>`;

  // ยาหมดอายุค้างคลัง ย้ายไปอีเมลแยกฉบับแล้ว (buildExpiredEmail) — ไม่แสดงซ้ำที่นี่
  // ฉบับนี้เหลือ "ใกล้หมดอายุ + ถึงกำหนดคืน" = ของที่ยังใช้/คืนได้ คนละเจตนากับของเสีย
  if (expired.length > 0) {
    html += `<p style="background:#fef2f2;border-left:4px solid #dc2626;padding:10px 14px;color:#7f1d1d;font-size:14px;margin:16px 0;"><b>มียาหมดอายุค้างคลัง ${expired.length} รายการ</b> — ส่งแยกในอีเมล "ยาหมดอายุค้างคลัง" ฉบับเดียวกันนี้</p>`;
  }
  if (nearExpiry.length > 0) {
    html += `<h3 style="color:#d97706;margin-top:28px;font-size:18px;">⚠️ ยาใกล้หมดอายุ ภายใน ${WARNING_DAYS} วัน (${humanDays(WARNING_DAYS)}) — ${nearExpiry.length} รายการ</h3>`;
    // นับรายการที่หาบริษัทเจ้าของ lot ไม่เจอ → ช่องบริษัท/นโยบายเป็น '-'
    // บอกจำนวน + วิธีแก้ ไม่งั้นคนเห็น '-' แล้วนึกว่าระบบพัง (จริงๆ คือไม่มีบิลของ lot นั้น)
    const noSupplier = nearExpiry.filter(it => {
      const c = String(it.r.code || "").trim().toLowerCase();
      const l = String(it.r.lot || "-").trim().toLowerCase() || "-";
      const dd = detailMap[`${c}|${l}`];
      return !dd || !dd.supplier_current || dd.supplier_current === "-";
    }).length;
    if (noSupplier > 0) {
      html += `<div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:10px 14px;margin:0 0 12px;color:#1e3a8a;font-size:13px;line-height:1.7;">`;
      html += `<b>หมายเหตุ: ${noSupplier} รายการยังไม่แสดงบริษัท/นโยบาย (ขึ้น "-")</b><br>`;
      html += `ระบบหาบิลรับเข้าที่ <b>รหัสยา + Lot ตรงกัน</b> ไม่พบ จึงไม่เดาบริษัทให้ (บริษัทผิด = คืนผิดเจ้า เสียสิทธิ์)<br>`;
      html += `<b>วิธีแก้:</b> อัปเดตไฟล์ CSV รับยา ให้มีแถวที่รหัสยา+Lot ตรงกับที่อยู่ในคลัง แล้ว import เข้าระบบ`;
      html += `</div>`;
    }
    html += makeTable(nearExpiry, today, false, detailMap);
  }
  if (returnDue.length > 0) {
    html += `<h3 style="color:#ea580c;margin-top:28px;font-size:18px;">🔁 ถึงกำหนดแจ้งเปลี่ยน/คืนบริษัทก่อนพ้นกำหนด (${returnDue.length} รายการ)</h3>`;
    html += `<p style="color:#9a3412;font-size:13px;margin:0 0 8px;">สิทธิ์เปลี่ยน/คืนยากับบริษัทจะหมดก่อนวันหมดอายุ — ควรแจ้งดำเนินการก่อนถึง "ต้องคืนภายใน"</p>`;
    html += makeReturnDueTable(returnDue);
  }

  html += `<p style="color:#94a3b8;font-size:13px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:12px;">ส่งอัตโนมัติโดย Supabase Edge Function · ระบบแผนผังคลังยา</p>`;
  html += "</div>";
  return html;
}

// ============================================================
// สร้างข้อความ LINE (plain text) — สรุป + top-N รายตัว + นโยบายเปลี่ยนยา (truncate)
// เจตนา: อ่านง่ายในกลุ่ม LINE, สั้นกว่า email; รายละเอียดเต็มอยู่ใน email
// ============================================================
function policyText(row: InvRow, detailMap: Record<string, DetailEntry>, maxLen = 80): string {
  const code = String(row.code || "").trim().toLowerCase();
  const lot  = String(row.lot  || "-").trim().toLowerCase() || "-";
  const d = detailMap[`${code}|${lot}`] || ({} as DetailEntry);   // strict per-lot (ดู makeTable)
  const parts: string[] = [];
  if (d.drug_swap_policy && d.drug_swap_policy !== "-") parts.push(d.drug_swap_policy);
  if (d.supplier_changed && d.supplier_changed !== "-") parts.push(d.supplier_changed);
  let txt = parts.join(" | ").replace(/\s+/g, " ").trim();
  if (!txt) return "";
  if (txt.length > maxLen) txt = txt.slice(0, maxLen - 1).trimEnd() + "…";
  return txt;
}

function lineBucket(items: AlertItem[], today: Date, isExpired: boolean, detailMap: Record<string, DetailEntry>): string {
  const shown = items.slice(0, LINE_TOP_N);
  const lines = shown.map(item => {
    const row = item.r;
    const days = daysLeft(item.expDate, today);
    const code = String(row.code || "").trim().toLowerCase();
    const lot  = String(row.lot  || "-").trim().toLowerCase() || "-";
    // strict per-lot เดียวกับ makeTable (email) + policyText — ไม่ fallback `code|`
    const d = detailMap[`${code}|${lot}`] || ({} as DetailEntry);
    const supplier = d.supplier_current || "-";
    const daysLabel = isExpired ? `เกิน ${Math.abs(days)} วัน` : `เหลือ ${days} วัน`;
    let l = `• ${row.name || "-"} (${row.qty || "-"} ${row.unit || ""}) exp ${fmtDate(item.expDate)} — ${daysLabel} · ${supplier}`;
    const pol = policyText(row, detailMap);
    if (pol) l += `\n   ↳ นโยบาย: ${pol}`;
    return l;
  });
  const extra = items.length - shown.length;
  if (extra > 0) lines.push(`  …และอีก ${extra} รายการ (ดูใน email)`);
  return lines.join("\n");
}

function buildLineText(expired: AlertItem[], nearExpiry: AlertItem[], today: Date, detailMap: Record<string, DetailEntry>): string {
  const parts: string[] = [];
  parts.push(`⚠️ แจ้งเตือนยาใกล้หมดอายุ — ${fmtDate(today)}`);
  parts.push(`หมดอายุแล้ว ${expired.length} · ใกล้หมด ${nearExpiry.length} รายการ`);
  if (expired.length > 0) {
    parts.push(`\n❌ หมดอายุแล้ว (${expired.length})`);
    parts.push(lineBucket(expired, today, true, detailMap));
  }
  if (nearExpiry.length > 0) {
    parts.push(`\n🔶 ใกล้หมดอายุ ภายใน ${LINE_WARNING_DAYS} วัน (${nearExpiry.length})`);
    parts.push(lineBucket(nearExpiry, today, false, detailMap));
  }
  parts.push(`\nรายละเอียดครบ + นโยบายเต็ม ดูใน email แจ้งเตือน`);
  return parts.join("\n");
}

// ส่ง push เข้ากลุ่ม LINE ผ่าน Messaging API. คืน { sent, recipients } เพื่อ log volume
async function sendLine(text: string): Promise<{ ok: boolean; error?: string }> {
  if (!LINE_TOKEN || !LINE_GROUP_ID) {
    return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN/LINE_GROUP_ID ไม่ได้ตั้ง — ข้าม LINE" };
  }
  // LINE text message limit = 5000 ตัวอักษร — ตัดกันพลาด (top-N ควรกันไว้แล้ว)
  const body = text.length > 4900 ? text.slice(0, 4900) + "\n…(ตัดข้อความ)" : text;
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify({
      to: LINE_GROUP_ID,
      messages: [{ type: "text", text: body }],
    }),
  });
  if (!res.ok) {
    return { ok: false, error: `LINE push failed: ${res.status} ${await res.text()}` };
  }
  return { ok: true };
}

// ============================================================
// Main handler
// ============================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // 0. อ่าน channel จาก body — "email" (default, cron รายวัน) | "line" (cron สัปดาห์ละครั้ง) | "both" (manual)
    //    body {} → email (backward-compat กับ cron เดิม + ปุ่มในแอป)
    let channel = "email";
    try {
      const body = await req.json();
      if (body && typeof body.channel === "string") channel = body.channel;
    } catch { /* body ว่าง/ไม่ใช่ JSON → email ตาม default */ }
    const doEmail = channel === "email" || channel === "both";
    const doLine  = channel === "line"  || channel === "both";

    // 1. ดึง inventory + receive_logs + dispense_logs (6 เดือน สำหรับ coverage)
    const usageFrom = new Date();
    usageFrom.setMonth(usageFrom.getMonth() - 6);
    const usageFromStr = usageFrom.toISOString().slice(0, 10);
    const [invRows, recRows, dispRows] = await Promise.all([
      fetchTable("inventory", "code,location,type,name,lot,exp,qty,unit,supplier,receive_status", "order=location"),
      fetchTable("receive_logs", "drug_code,lot,bill_number,supplier_current,drug_swap_policy,swap_tier_detail,swap_condition_am,supplier_changed,receive_date", "order=receive_date.desc.nullslast"),
      fetchTable("dispense_logs", "drug_code,qty_out,dispense_date", `dispense_date=gte.${usageFromStr}`),
    ]);

    // 2. สร้าง detailMap key="code|lot" + fallback "code|"
    // lot ว่าง → '-' ให้ตรง lotKey ใน db.js (fetchSwapReturnDue) ไม่งั้น email กับแอปชี้คนละ entry
    const detailMap: Record<string, DetailEntry> = {};
    const ambiguousLot = new Set<string>();   // code|lot ที่ชนหลายบริษัท → ไม่เตือน (ADR-0012)
    for (const r of recRows) {
      const code = String(r.drug_code || "").trim().toLowerCase();
      const lot  = String(r.lot       || "-").trim().toLowerCase() || "-";
      if (!code) continue;
      const entry: DetailEntry = {
        supplier_current: r.supplier_current || "",
        drug_swap_policy: r.drug_swap_policy || "",
        supplier_changed: r.supplier_changed || "",
        swap_tier_detail: r.swap_tier_detail || "",
        receive_date: r.receive_date || "",
        swap_condition_am: r.swap_condition_am || "",
      };
      const keyLot  = `${code}|${lot}`;
      const keyCode = `${code}|`;
      if (!detailMap[keyLot])  detailMap[keyLot]  = entry;
      else {
        // lot เดียวกันคนละบริษัท → กำกวม (ADR-0012: คืนผิดเจ้าอันตรายกว่าเตือนขาด)
        const co = String(r.supplier_current || "").trim();
        const prev = String(detailMap[keyLot].supplier_current || "").trim();
        if (co && co !== "-" && prev && prev !== "-" && co !== prev) ambiguousLot.add(keyLot);
      }
      if (!detailMap[keyCode]) detailMap[keyCode] = entry;
    }

    // 2b. usage rate (avgPerDay ต่อรหัสยา, เม็ด) — port fetchUsageRates(6): ต้องมีข้อมูล ≥3 เดือน
    const usageKey = (v: string) => String(v || "").trim().toLowerCase().replace(/^0+(\d)/, "$1");
    const usageAgg: Record<string, { totalQty: number; months: Set<string> }> = {};
    for (const r of dispRows) {
      const code = usageKey(r.drug_code);
      if (!code) continue;
      const qty = parseFloat(String(r.qty_out || "0")) || 0;
      if (qty <= 0) continue;
      if (!usageAgg[code]) usageAgg[code] = { totalQty: 0, months: new Set() };
      usageAgg[code].totalQty += qty;
      if (r.dispense_date) usageAgg[code].months.add(String(r.dispense_date).slice(0, 7));
    }
    const avgPerDayByCode: Record<string, number> = {};
    for (const [code, { totalQty, months }] of Object.entries(usageAgg)) {
      if (months.size >= 3) avgPerDayByCode[code] = totalQty / (6 * 30);
    }
    // คงเหลือรวมต่อรหัสยา (แปลงเป็นเม็ดด้วย packSize จาก unit label) — สำหรับ coverage
    const parseFactor = (unit: string): number => {
      const m = String(unit || "").match(/^(\d+)\s*(.+)$/);
      return m ? parseInt(m[1]) : 1;
    };
    const baseStockByCode: Record<string, number> = {};
    for (const row of invRows) {
      const qty = parseFloat(String(row.qty || "0").replace(/,/g, ""));
      if (isNaN(qty) || qty <= 0) continue;
      if (String(row.receive_status || "").includes("ตัดออก")) continue;
      const code = usageKey(row.code);
      baseStockByCode[code] = (baseStockByCode[code] || 0) + qty * parseFactor(row.unit);
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
      // ยาตัดออกจากบัญชีไม่ต้องเตือน — ตรงกับ fetchDashboardAlerts ในแอป (Rule #6)
      // loop อื่นในไฟล์นี้ (baseStockByCode/returnDue) กรองอยู่แล้ว เฉพาะตรงนี้ที่ตกหล่น
      if (String(row.receive_status || "").includes("ตัดออก")) continue;

      // expired = "ยาหมดอายุค้างคลัง" (CONTEXT §Expired-On-Shelf) — qty>0 ถูกกรองไว้ข้างบนแล้ว
      // แถวหมดอายุที่ qty=0 คือประวัติ (เก็บออก/จ่ายหมดแล้ว) ไม่ใช่ของค้าง → ไม่เตือน
      if (exp < today) expired.push({ r: row, expDate: exp });
      else if (exp <= warnDate) nearExpiry.push({ r: row, expDate: exp });
    }

    expired.sort((a, b) => a.expDate.getTime() - b.expDate.getTime());
    nearExpiry.sort((a, b) => a.expDate.getTime() - b.expDate.getTime());

    const total = expired.length + nearExpiry.length;

    // 3b. รายการถึงกำหนดเปลี่ยน/คืนบริษัท (due|overdue) — logic ตรงกับ fetchSwapReturnDue ในแอป
    const returnDue: ReturnDueItem[] = [];
    for (const row of invRows) {
      const qty = parseFloat(String(row.qty || "0").replace(/,/g, ""));
      if (isNaN(qty) || qty <= 0) continue;
      if (String(row.receive_status || "").includes("ตัดออก")) continue;
      const exp = parseExpDate(row.exp);
      if (!exp) continue;
      const code = String(row.code || "").trim().toLowerCase();
      const lot  = String(row.lot  || "-").trim().toLowerCase() || "-";
      const keyLot = `${code}|${lot}`;
      if (ambiguousLot.has(keyLot)) continue;   // lot ชนหลายบริษัท → ไม่เตือน (ADR-0012, ตรง supplierByLot=null ในแอป)
      // strict per-lot — จุดนี้เอาไปคำนวณ deadline จริง fallback ระดับรหัสอันตรายสุด
      // (บริษัทผิด → deadline ผิด → คืนผิดเจ้า). ตรงกับ fetchSwapReturnDue ในแอปที่ `if (!company) continue`
      const d = detailMap[keyLot];
      if (!d) continue;
      const company = d.supplier_current || "";
      if (!company || company === "-") continue;   // ไม่รู้บริษัท → ไม่เตือนคืน (ไม่เดา)
      // col27 "แตกต่างกัน แล้วแต่รายการ" = flag ระดับ**บริษัท**
      // ADR-0015: ไม่ override tier ที่ระบุชัดราย lot — ข้อมูลเจาะจงกว่าชนะ
      const differsByCompany = /แตกต่าง|แล้วแต่รายการ/.test(d.swap_condition_am || "");
      // เฟส 2 (ADR-0014): lot มี tier_detail → V2 (ต่อ lot); ไม่มี → fallback V1 (นโยบายบริษัท) — ตรง fetchSwapReturnDue
      let status: string, deadline: Date | null, daysToDeadline: number | null, returnPct: number | null = null, statusNote: string | null = null;
      const tierDetail = (d.swap_tier_detail || "").trim();
      const policyV2 = (tierDetail && tierDetail !== "-") ? parseReturnPolicyV2(tierDetail) : null;
      const hasExplicitTier = !!policyV2 && policyV2.shape !== "ambiguous" && !policyV2.needsReview;
      if (differsByCompany && !hasExplicitTier) continue;   // ไม่มี tier ชัด + บริษัทเงื่อนไขต่าง → ไม่เดา
      if (hasExplicitTier) {
        const rDate = d.receive_date ? new Date(d.receive_date) : null;
        const r = computeReturnStatusV2(policyV2, exp, rDate && !isNaN(rDate.getTime()) ? rDate : null, today);
        status = r.status; deadline = r.deadline; daysToDeadline = r.daysToDeadline; returnPct = r.percent; statusNote = r.note;
      } else if (tierDetail && tierDetail !== "-") {
        continue;   // มี tier แต่กำกวม → review ไม่เดา
      } else {
        const pol = parseReturnPolicy(d.drug_swap_policy);
        if (pol.differsByItem || pol.months == null) continue;
        const r = computeReturnStatus(exp, pol.months, today);
        status = r.status; deadline = r.deadline; daysToDeadline = r.daysToDeadline;
      }
      if ((status !== "due" && status !== "overdue") || !deadline) continue;
      // coverage: คงเหลือรวม(เม็ด) ÷ เรท(เม็ด/วัน) → ของจะหมดในกี่วัน. หมดก่อน deadline → willDeplete (flag ไม่ตัดออก)
      const avgPerDay = avgPerDayByCode[usageKey(row.code)] || 0;
      const baseStock = baseStockByCode[usageKey(row.code)] || 0;
      const coverageDays = avgPerDay > 0 ? Math.round(baseStock / avgPerDay) : null;
      const willDeplete = coverageDays != null && coverageDays < (daysToDeadline ?? 0);
      returnDue.push({
        r: row, company, deadline, daysToDeadline: daysToDeadline ?? 0, overdue: status === "overdue",
        policyText: (d.drug_swap_policy || "").trim(), avgPerDay, coverageDays, willDeplete,
        returnPct, statusNote,   // เฟส 2 (ADR-0014) — % คืน + คำอธิบาย (V2)
      });
    }
    // ต้องคืนจริง (ไม่ willDeplete) ก่อน → ในกลุ่มเดียวกัน เหลือน้อยสุดก่อน (ตรงกับ fetchSwapReturnDue)
    returnDue.sort((a, b) => (a.willDeplete === b.willDeplete)
      ? a.daysToDeadline - b.daysToDeadline
      : (a.willDeplete ? 1 : -1));

    // LINE ใช้ threshold แคบกว่า (365) = subset ของ nearExpiry email (400) — filter ไม่ต้อง re-loop
    const lineNear = nearExpiry.filter(it => daysLeft(it.expDate, today) <= LINE_WARNING_DAYS);
    const lineTotal = expired.length + lineNear.length;

    // 4. ส่งตาม channel
    const result: Record<string, unknown> = { ok: true, channel, expired: expired.length };

    if (doEmail) {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: GMAIL_USER, pass: GMAIL_PASS },
      });

      // ── ฉบับหลัก: ใกล้หมดอายุ + ถึงกำหนดคืน (ไม่รวมของหมดอายุแล้ว) ──
      // นับจาก nearExpiry ตรงๆ ไม่ใช่ total (ซึ่งรวม expired ที่ย้ายไปฉบับแยกแล้ว)
      if (nearExpiry.length === 0 && returnDue.length === 0) {
        result.email = "skip: ไม่มียาที่ต้องแจ้งเตือน";
      } else {
        const subjParts: string[] = [];
        if (nearExpiry.length > 0) subjParts.push(`ใกล้หมดอายุ ${nearExpiry.length}`);
        if (returnDue.length > 0) subjParts.push(`ถึงกำหนดคืน ${returnDue.length}`);
        const subject = `[แจ้งเตือน] ${subjParts.join(" · ")} — ${fmtDate(today)}`;
        const html = buildEmail(expired, nearExpiry, returnDue, today, detailMap);
        await transporter.sendMail({
          from: GMAIL_USER,
          to: ALERT_EMAILS.join(", "),
          subject,
          text: "กรุณาดูรายละเอียดใน HTML",
          html,
        });
        result.email = { sent: true, nearExpiry: nearExpiry.length, returnDue: returnDue.length };
      }

      // ── ฉบับที่ 2: ยาหมดอายุค้างคลัง — ส่งเฉพาะเมื่อมีของค้างจริง ──
      // ไม่มี = ไม่ส่ง (เห็นอีเมลนี้เมื่อไหร่ = มีปัญหาแน่นอน ไม่ใช่รายงานประจำ)
      if (expired.length === 0) {
        result.expiredEmail = "skip: ไม่มียาหมดอายุค้างคลัง";
      } else {
        await transporter.sendMail({
          from: GMAIL_USER,
          to: ALERT_EMAILS.join(", "),
          subject: `[ด่วน] ยาหมดอายุค้างคลัง ${expired.length} รายการ — ต้องเก็บออกจากคลัง (${fmtDate(today)})`,
          text: "กรุณาดูรายละเอียดใน HTML",
          html: buildExpiredEmail(expired, today, detailMap),
        });
        result.expiredEmail = { sent: true, count: expired.length };
      }
    }

    if (doLine) {
      if (lineTotal === 0) {
        // ไม่มีของเข้าเกณฑ์ LINE (365) → ไม่ push (คุม volume + ไม่รบกวนกลุ่ม)
        result.line = "skip: ไม่มียาเข้าเกณฑ์ LINE";
      } else {
        const text = buildLineText(expired, lineNear, today, detailMap);
        const r = await sendLine(text);
        // log จำนวนรายการเพื่อดูแนวโน้ม volume (push นับรายหัว — ดู Major #4 ใน CONTEXT)
        console.log(`LINE push: ${r.ok ? "ok" : "FAIL"} · expired=${expired.length} near=${lineNear.length}${r.error ? " · " + r.error : ""}`);
        result.line = r.ok ? { sent: true, expired: expired.length, nearExpiry: lineNear.length } : { sent: false, error: r.error };
      }
    }

    return new Response(JSON.stringify(result), {
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
