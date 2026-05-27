// ============================================================
// ตั้งค่า
// ============================================================
var SUPABASE_URL = "https://kgjocnfafhqqioneqapk.supabase.co";
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtnam9jbmZhZmhxcWlvbmVxYXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MDYwMzIsImV4cCI6MjA4OTQ4MjAzMn0.7Vpqwzl-3_zVLCb6PgSMrfhsFMnqmebo6NoloqcRUsI";
var warningDays = 400;
var emails      = "noppakun.kao1234@gmail.com,nasamax2000gtr@gmail.com,lovelovetai1@gmail.com,angelmatsu888888@gmail.com";

// ============================================================
// Helper: ดึงข้อมูลจาก Supabase
// ============================================================
function fetchFromSupabase(table, select, extraQuery) {
  var url = SUPABASE_URL + "/rest/v1/" + table + "?select=" + select;
  if (extraQuery) url += "&" + extraQuery;
  var res = UrlFetchApp.fetch(url, {
    method: "GET",
    headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    Logger.log("❌ ดึง " + table + " ล้มเหลว: " + res.getContentText());
    return [];
  }
  var data = JSON.parse(res.getContentText());
  Logger.log("✅ ดึง " + table + " สำเร็จ " + data.length + " รายการ");
  return data;
}

// ============================================================
// Main
// ============================================================
function sendExpiryAlert() {

  // ── 1. ดึง inventory ──────────────────────────────────────
  var invRows = fetchFromSupabase(
    'inventory',
    'code,location,type,name,lot,exp,qty,unit,supplier,receive_status',
    'order=location'
  );

  // ── 2. ดึง receive_logs (เรียงใหม่สุดก่อน + ดึง lot/bill มาด้วย) ──
  var recRows = fetchFromSupabase(
    'receive_logs',
    'drug_code,lot,bill_number,supplier_current,drug_swap_policy,supplier_changed,receive_date',
    'order=receive_date.desc.nullslast'
  );

  // ── 3. สร้าง detailMap  key = "code|lot" + fallback "code|" ────
  //     entry ใหม่สุดชนะ เพราะ order desc + first-win (if !detailMap[key])
  var detailMap = {};
  recRows.forEach(function (r) {
    var code = String(r.drug_code || '').trim().toLowerCase();
    var lot  = String(r.lot       || '').trim().toLowerCase();
    if (!code) return;

    var entry = {
      supplier_current: r.supplier_current || '',
      drug_swap_policy: r.drug_swap_policy || '',
      supplier_changed: r.supplier_changed || ''
    };

    var keyWithLot  = code + '|' + lot;
    var keyCodeOnly = code + '|';

    if (!detailMap[keyWithLot])  detailMap[keyWithLot]  = entry;
    if (!detailMap[keyCodeOnly]) detailMap[keyCodeOnly] = entry;
  });

  // ── 4. แยก expired / nearExpiry ───────────────────────────
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var warnDate = new Date(today);
  warnDate.setDate(warnDate.getDate() + warningDays);

  var expired    = [];
  var nearExpiry = [];

  invRows.forEach(function(row) {
    if (!row.exp || row.exp === '-') return;
    var exp = parseExpDate(row.exp);
    if (!exp) return;
    var qty = parseFloat(String(row.qty || '0').replace(/,/g, ''));
    if (isNaN(qty) || qty <= 0) return;
    if (row.receive_status === 'รอตรวจรับ') return;

    if (exp < today) {
      expired.push({ r: row, expDate: exp });
    } else if (exp <= warnDate) {
      nearExpiry.push({ r: row, expDate: exp });
    }
  });

  var sortByExp = function(a, b) { return a.expDate - b.expDate; };
  expired.sort(sortByExp);
  nearExpiry.sort(sortByExp);

  var total = expired.length + nearExpiry.length;
  if (total === 0) {
    Logger.log("✅ ไม่มียาที่ต้องแจ้งเตือนวันนี้");
    return;
  }

  var subject = "[แจ้งเตือน] ยาใกล้หมดอายุ — " + fmtDate(today) + " (" + total + " รายการ)";
  var html    = buildEmail(expired, nearExpiry, today, detailMap);
  GmailApp.sendEmail(emails, subject, "กรุณาดูรายละเอียดใน HTML", { htmlBody: html });
  Logger.log("✅ ส่ง email สำเร็จ " + total + " รายการ");
}

// ============================================================
// แปลง exp string → Date
// ============================================================
function parseExpDate(raw) {
  if (!raw || raw === '-') return null;
  var s = String(raw).trim();

  var slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    var y = parseInt(slash[3]);
    if (y > 2500) y -= 543;
    var d = new Date(y, parseInt(slash[2]) - 1, parseInt(slash[1]));
    d.setHours(0,0,0,0);
    return isNaN(d.getTime()) ? null : d;
  }

  var mon = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  var dash = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (dash) {
    var m = mon[dash[2].toLowerCase()];
    if (m === undefined) return null;
    var y = parseInt(dash[3]);
    if (y < 100) y += 2000;
    var d = new Date(y, m, parseInt(dash[1]));
    d.setHours(0,0,0,0);
    return isNaN(d.getTime()) ? null : d;
  }

  var serial = Number(s);
  if (!isNaN(serial) && serial > 30000 && serial < 60000) {
    var d = new Date(Date.UTC(1899,11,30) + serial * 86400000);
    d.setHours(0,0,0,0);
    return isNaN(d.getTime()) ? null : d;
  }

  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ============================================================
// Helpers
// ============================================================
function fmtDate(d) {
  return d.getDate() + "/" + (d.getMonth()+1) + "/" + d.getFullYear();
}

function daysLeft(exp, today) {
  return Math.floor((exp - today) / 86400000);
}

// ============================================================
// สร้าง HTML email
// ============================================================
function buildEmail(expired, nearExpiry, today, detailMap) {
  var html = '<div style="font-family:\'Sarabun\',\'Noto Sans Thai\',sans-serif;max-width:1100px;margin:auto;color:#1e293b;font-size:15px;">';
  html += '<h2 style="color:#b91c1c;border-bottom:3px solid #fee2e2;padding-bottom:10px;font-size:22px;">รายงานยาใกล้หมดอายุ — ' + fmtDate(today) + '</h2>';
  html += '<p style="color:#64748b;font-size:14px;">ข้อมูลจากระบบแผนผังคลังยา (Supabase) · แจ้งเตือนอัตโนมัติทุกวัน</p>';

  if (expired.length > 0) {
    html += '<h3 style="color:#dc2626;margin-top:28px;font-size:18px;">❌ ยาหมดอายุแล้ว (' + expired.length + ' รายการ)</h3>';
    html += makeTable(expired, today, true, detailMap);
  }
  if (nearExpiry.length > 0) {
    html += '<h3 style="color:#d97706;margin-top:28px;font-size:18px;">⚠️ ยาใกล้หมดอายุ ภายใน ' + warningDays + ' วัน (' + nearExpiry.length + ' รายการ)</h3>';
    html += makeTable(nearExpiry, today, false, detailMap);
  }

  html += '<p style="color:#94a3b8;font-size:13px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:12px;">ส่งอัตโนมัติโดย Google Apps Script · ระบบแผนผังคลังยา</p>';
  html += '</div>';
  return html;
}

function makeTable(items, today, isExpired, detailMap) {
  var th = 'style="background:#e2e8f0;padding:10px 12px;text-align:left;border:1px solid #cbd5e1;font-size:14px;font-weight:bold;color:#334155;white-space:nowrap;"';
  var html = '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:20px;">';

  html += '<thead><tr>';
  html += '<th ' + th + '>ตำแหน่ง</th>';
  html += '<th ' + th + '>ชนิดยา</th>';
  html += '<th ' + th + '>ชื่อยา</th>';
  html += '<th ' + th + '>Lot</th>';
  html += '<th ' + th + '>Exp</th>';
  html += '<th ' + th + '>คงเหลือ</th>';
  html += '<th ' + th + '>หน่วย</th>';
  html += '<th ' + th + '>บริษัท</th>';
  html += '<th ' + th + '>นโยบายเปลี่ยนยา</th>';
  html += '<th ' + th + '>' + (isExpired ? 'เกินมาแล้ว' : 'คงเหลือ (วัน)') + '</th>';
  html += '</tr></thead><tbody>';

  items.forEach(function(item) {
    var row  = item.r;
    var days = daysLeft(item.expDate, today);
    var bg   = isExpired ? '#fef2f2' : (days <= 90 ? '#fffbeb' : '#f0fdf4');
    var dc   = isExpired ? '#dc2626' : (days <= 90 ? '#d97706' : '#16a34a');
    var td   = 'style="padding:9px 12px;border:1px solid #e2e8f0;background:' + bg + ';font-size:14px;vertical-align:middle;"';

    // ── lookup detailMap (match lot ก่อน → fallback เป็น code อย่างเดียว) ──
    var code = String(row.code || '').trim().toLowerCase();
    var lot  = String(row.lot  || '').trim().toLowerCase();
    var d    = detailMap[code + '|' + lot] || detailMap[code + '|'] || {};

    // ชนิดยา จาก inventory
    var drugType = row.type || '-';

    // บริษัท: ใช้ supplier_current จาก receive_logs ก่อน (ตรงกับที่แอปแสดง)
    //         fallback เป็น inventory.supplier
    var supplier = d.supplier_current || row.supplier || '-';

    // นโยบายเปลี่ยนยา: drug_swap_policy | supplier_changed (กรอง '-' กับว่างทิ้ง)
    var swapParts = [];
    if (d.drug_swap_policy && d.drug_swap_policy !== '-') swapParts.push(d.drug_swap_policy);
    if (d.supplier_changed && d.supplier_changed !== '-') swapParts.push(d.supplier_changed);
    var swapText = swapParts.length > 0 ? swapParts.join(' | ') : '-';

    html += '<tr>';
    html += '<td ' + td + '>'                                                                    + (row.location || '-')  + '</td>';
    html += '<td ' + td + '>'                                                                    + drugType               + '</td>';
    html += '<td ' + td + '><b style="font-size:15px;">'                                         + (row.name    || '-')  + '</b></td>';
    html += '<td ' + td + '>'                                                                    + (row.lot     || '-')  + '</td>';
    html += '<td ' + td + '><b>'                                                                 + fmtDate(item.expDate) + '</b></td>';
    html += '<td style="padding:9px 12px;border:1px solid #e2e8f0;background:' + bg + ';font-size:14px;text-align:right;vertical-align:middle;">' + (row.qty || '-') + '</td>';
    html += '<td ' + td + '>'                                                                    + (row.unit    || '-')  + '</td>';
    html += '<td ' + td + '>'                                                                    + supplier               + '</td>';
    html += '<td ' + td + '>'                                                                    + swapText               + '</td>';
    html += '<td style="padding:9px 12px;border:1px solid #e2e8f0;background:' + bg + ';text-align:right;font-weight:bold;font-size:15px;color:' + dc + ';vertical-align:middle;white-space:nowrap;">' +
            Math.abs(days) + ' วัน</td>';
    html += '</tr>';
  });

  html += '</tbody></table>';
  return html;
}
