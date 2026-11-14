// ใบรายงานอุณหภูมิที่เก็บยา — A4 แนวตั้ง 1 หน้า ต่อ 1 เดือน ต่อ 1 จุดวัด (user เคาะแผน 14/11/2569)
// ข้อมูลมาจาก buildMonthReport ชุดเดียวกับตารางสรุปรายเดือนบนจอ (Rule #6)
// วันที่ไม่มีการวัดพิมพ์ "ไม่ได้วัด" ตามจริง — ห้ามเติมค่าแทน (ADR-0018)
import { openPrintView } from './openPrintView';
import { isExcursion } from './temperatureReport';

const HOSPITAL_NAME = 'โรงพยาบาลประชาธิปัตย์';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (n) => (n == null || !Number.isFinite(Number(n)) ? '-' : Number(n).toFixed(1));
const hhmm = (t) => (t ? String(t).slice(0, 5) : '');
const thDate = (iso) => { const [y, m, d] = String(iso).split('-'); return `${Number(d)}/${Number(m)}/${Number(y) + 543}`; };

// กราฟรายวัน: แถบเขียว = ช่วงยอมรับ · เส้นฟ้า = ต่ำสุด/สูงสุดของวัน · จุดแดง = หลุดช่วง
function chartSvg(report, lo, hi) {
  const W = 720, H = 190, L = 34, R = 8, T = 10, B = 24;
  const vals = report.days.flatMap((d) => (d.count ? [d.min, d.max] : []));
  const yMin = Math.floor(Math.min(lo, ...vals) - 1);
  const yMax = Math.ceil(Math.max(hi, ...vals) + 1);
  const n = report.days.length;
  const x = (day) => L + ((day - 1) / Math.max(1, n - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - yMin) / Math.max(1e-9, yMax - yMin)) * (H - T - B);
  const step = yMax - yMin > 20 ? 5 : yMax - yMin > 10 ? 2 : 1;
  let grid = '';
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
    grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e7eb" stroke-width="0.6"/>`
      + `<text x="${L - 5}" y="${y(v) + 3}" text-anchor="end" font-size="9" fill="#6b7280">${v}</text>`;
  }
  let xt = '';
  for (const d of report.days) {
    if (d.day === 1 || d.day % 5 === 0 || (d.day === n && n % 5 >= 3)) xt += `<text x="${x(d.day)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#6b7280">${d.day}</text>`;
  }
  // เส้นขาดตรงวันที่ไม่ได้วัด — ไม่ลากข้ามช่องว่างให้ดูเหมือนวัดต่อเนื่อง
  const segs = [];
  let cur = [];
  for (const d of report.days) {
    if (d.count) cur.push(d); else if (cur.length) { segs.push(cur); cur = []; }
  }
  if (cur.length) segs.push(cur);
  let marks = '';
  for (const s of segs) {
    const top = s.map((d) => `${x(d.day)},${y(d.max)}`).join(' ');
    const bot = s.slice().reverse().map((d) => `${x(d.day)},${y(d.min)}`).join(' ');
    marks += `<polygon points="${top} ${bot}" fill="#0284c7" fill-opacity="0.18"/>`
      + `<polyline points="${top}" fill="none" stroke="#0284c7" stroke-width="1.6"/>`
      + `<polyline points="${s.map((d) => `${x(d.day)},${y(d.min)}`).join(' ')}" fill="none" stroke="#0284c7" stroke-width="1.6"/>`;
    for (const d of s) {
      marks += `<circle cx="${x(d.day)}" cy="${y(d.max)}" r="2.2" fill="#0284c7"/>`;
      if (d.min !== d.max) marks += `<circle cx="${x(d.day)}" cy="${y(d.min)}" r="2.2" fill="#0284c7"/>`;
    }
  }
  for (const d of report.days) {
    if (!d.count) continue;
    for (const v of [d.min, d.max]) {
      if (v < lo || v > hi) marks += `<circle cx="${x(d.day)}" cy="${y(v)}" r="4" fill="#dc2626" stroke="#fff" stroke-width="1.2"/>`;
    }
  }
  const band = `<rect x="${L}" width="${W - L - R}" y="${y(hi)}" height="${Math.max(0, y(lo) - y(hi))}" fill="#10b981" fill-opacity="0.12"/>`
    + `<line x1="${L}" x2="${W - R}" y1="${y(hi)}" y2="${y(hi)}" stroke="#059669" stroke-width="0.8" stroke-dasharray="4 3"/>`
    + `<line x1="${L}" x2="${W - R}" y1="${y(lo)}" y2="${y(lo)}" stroke="#059669" stroke-width="0.8" stroke-dasharray="4 3"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="กราฟอุณหภูมิรายวัน (แกนนอน = วันที่)">${grid}${band}${marks}${xt}</svg>`;
}

function cell(r) {
  if (!r) return '';
  return `<b class="${isExcursion(r) ? 'bad' : ''}">${f1(r.temp_c)}</b><span class="t">${hhmm(r.reading_time)}</span>`;
}

function dayRow(d) {
  if (d.future) return `<tr class="fut"><td class="c">${d.day}</td><td></td><td></td><td></td><td></td></tr>`;
  if (!d.count) return `<tr class="miss"><td class="c">${d.day}</td><td colspan="4" class="c">ไม่ได้วัด</td></tr>`;
  const range = d.min === d.max ? f1(d.min) : `${f1(d.min)}–${f1(d.max)}`;
  return `<tr${d.out ? ' class="outr"' : ''}><td class="c">${d.day}</td><td class="c">${d.am ? cell(d.am) : '<span class="no">-</span>'}</td>`
    + `<td class="c">${d.pm ? cell(d.pm) : '<span class="no">-</span>'}</td><td class="c">${range}${d.count > 2 ? `<span class="t">${d.count} ค่า</span>` : ''}</td>`
    + `<td class="who">${esc(d.recorders.join(', '))}</td></tr>`;
}

function dayTable(days) {
  return `<table class="days"><colgroup><col style="width:11%"><col style="width:20%"><col style="width:20%"><col style="width:20%"><col style="width:29%"></colgroup>
<thead><tr><th>วันที่</th><th>เช้า</th><th>บ่าย</th><th>ต่ำ–สูง</th><th>ผู้บันทึก</th></tr></thead>
<tbody>${days.map(dayRow).join('')}</tbody></table>`;
}

function pageHtml(report, point, { filterNote, printedBy, printedAt }) {
  const s = report.summary;
  const devices = report.devices;
  const half = Math.ceil(report.days.length / 2);
  const exc = s.excursions.slice().sort((a, b) => `${a.reading_date}${a.reading_time}`.localeCompare(`${b.reading_date}${b.reading_time}`));
  const excHtml = exc.length
    ? `<table class="exc"><colgroup><col style="width:16%"><col style="width:9%"><col style="width:9%"><col></colgroup>
<thead><tr><th>วันที่</th><th>เวลา</th><th>°C</th><th>การดำเนินการ</th></tr></thead>
<tbody>${exc.map((r) => `<tr><td>${thDate(r.reading_date)}</td><td class="c">${hhmm(r.reading_time)}</td><td class="c bad">${f1(r.temp_c)}</td><td>${esc(r.action_taken) || '<span class="bad">ยังไม่ระบุ</span>'}</td></tr>`).join('')}</tbody></table>`
    : '<p class="ok">ไม่มีค่าที่หลุดช่วงในเดือนนี้</p>';
  return `<section class="page">
<header>
  <p class="hosp">${HOSPITAL_NAME} · คลังยา</p>
  <h1>รายงานอุณหภูมิที่เก็บยา — ${esc(point.key)}</h1>
  <p class="sub">ประจำเดือน <b>${report.label}</b> · ช่วงที่ยอมรับ <b>${point.min}–${point.max} °C</b>${filterNote ? ` · ${esc(filterNote)}` : ''}</p>
</header>
<div class="chart">${chartSvg(report, point.min, point.max)}
  <p class="legend"><span class="lg band"></span>ช่วงที่ยอมรับ ${point.min}–${point.max} °C <span class="lg line"></span>ต่ำสุด–สูงสุดของวัน <span class="lg dot"></span>หลุดช่วง</p>
</div>
<div class="sum">
  <div><span>บันทึก</span><b>${s.roundsDone} / ${s.expected} รอบ</b><small>${s.pct}%</small></div>
  <div><span>เฉลี่ย</span><b>${f1(s.avg)} °C</b></div>
  <div><span>ต่ำสุด – สูงสุด</span><b>${f1(s.min)} – ${f1(s.max)} °C</b></div>
  <div><span>หลุดช่วง</span><b class="${s.excursions.length ? 'bad' : ''}">${s.excursions.length} ครั้ง</b>${s.unhandled.length ? `<small class="bad">ยังไม่ระบุการดำเนินการ ${s.unhandled.length}</small>` : ''}</div>
</div>
<div class="two">${dayTable(report.days.slice(0, half))}${dayTable(report.days.slice(half))}</div>
<h2>ค่าที่หลุดช่วงและการดำเนินการ</h2>
${excHtml}
<p class="foot">เช้า/บ่าย = ค่าที่วัดใกล้ 09:00 / 15:00 ที่สุดของรอบนั้น · "ไม่ได้วัด" = ไม่มีบันทึกในวันนั้น${devices ? ` · วัดด้วย: ${esc(devices)}` : ''} · พิมพ์${printedBy ? `โดย ${esc(printedBy)} ` : ''}เมื่อ ${esc(printedAt)}</p>
<div class="sign">
  <div>ลงชื่อ ........................................ ผู้บันทึก<br/>(........................................)<br/>วันที่ ......../......../........</div>
  <div>ลงชื่อ ........................................ ผู้ตรวจสอบ<br/>(........................................)<br/>วันที่ ......../......../........</div>
</div>
</section>`;
}

const CSS = `
@page { size: A4 portrait; margin: 10mm 12mm; }
* { box-sizing: border-box; }
body { font-family: Sarabun, sans-serif; color: #111; margin: 0; font-size: 12px; background: #fff; }
.page { page-break-after: always; break-after: page; max-width: 186mm; margin: 0 auto; }
.page:last-child { page-break-after: auto; break-after: auto; }
header { text-align: center; margin-bottom: 4px; }
.hosp { margin: 0; font-size: 12px; color: #444; }
h1 { margin: 2px 0 0; font-size: 17px; }
.sub { margin: 2px 0 0; font-size: 12.5px; }
h2 { font-size: 13px; margin: 8px 0 3px; }
.chart { border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 6px 2px; }
.legend { margin: 0; font-size: 10.5px; color: #374151; text-align: center; }
.lg { display: inline-block; width: 14px; height: 8px; margin: 0 4px 0 10px; vertical-align: middle; }
.lg.band { background: rgba(16,185,129,.25); border-top: 1px dashed #059669; border-bottom: 1px dashed #059669; }
.lg.line { height: 2px; background: #0284c7; }
.lg.dot { width: 8px; height: 8px; border-radius: 50%; background: #dc2626; }
.sum { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 6px 0; }
.sum div { border: 1px solid #d1d5db; border-radius: 6px; padding: 3px 8px; }
.sum span { display: block; font-size: 10.5px; color: #4b5563; }
.sum b { font-size: 13.5px; }
.sum small { display: block; font-size: 10.5px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { border: 1px solid #9ca3af; padding: 1.5px 4px; line-height: 1.25; }
th { background: #f3f4f6; font-weight: 600; font-size: 11px; }
.days td { font-size: 11.5px; height: 18px; }
td.c { text-align: center; }
td .t { font-size: 9.5px; color: #6b7280; margin-left: 3px; }
td.who { font-size: 10px; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
tr.miss td { color: #9ca3af; font-style: italic; background: #fafafa; }
tr.outr td { background: #fef2f2; }
.no { color: #9ca3af; }
.bad { color: #b91c1c; font-weight: 700; }
.ok { margin: 0; font-size: 11.5px; color: #047857; }
.exc td { font-size: 11px; }
.foot { font-size: 10px; color: #6b7280; margin: 6px 0 0; }
.sign { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 14px; text-align: center; font-size: 12px; line-height: 1.9; }
@media screen { body { background: #e5e7eb; padding: 16px 0; } .page { background: #fff; padding: 10mm 12mm; margin-bottom: 16px; max-width: 210mm; box-shadow: 0 1px 4px rgba(0,0,0,.15); } }
@media print { #btnPrint { display: none; } }
`;

/**
 * @param {Array} reports ผลของ buildMonthReport ทีละเดือน (เรียงเก่า→ใหม่) · ใส่ `devices` (ชื่ออุปกรณ์ที่ใช้วัดเดือนนั้น) เพิ่มได้
 * @param {{key:string,min:number,max:number}} point จุดวัด (TEMP_POINTS)
 * @param {{filterNote?:string, printedBy?:string}} opts
 */
export function printTemperatureReport(reports, point, opts = {}) {
  const printedAt = new Date().toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' });
  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>รายงานอุณหภูมิ ${esc(point.key)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>${CSS}</style></head><body>
<button id="btnPrint" type="button" onclick="window.print()" style="position:fixed;top:14px;right:14px;background:#000;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-family:Sarabun,sans-serif;font-size:13px;cursor:pointer;font-weight:600;z-index:9999;">พิมพ์</button>
${reports.map((r) => pageHtml(r, point, { ...opts, printedAt })).join('')}
</body></html>`;
  return openPrintView(html);
}
