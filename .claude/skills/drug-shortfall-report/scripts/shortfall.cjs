#!/usr/bin/env node
/**
 * รายงานยาค้างจ่าย 2 ฉบับ จาก Excel 3 ไฟล์
 *   ฉบับ 1 (--ward) : หน่วยงานที่ได้ยาไม่ครบ — จะได้ของไหม
 *   ฉบับ 2 (--drug) : ตามยาที่สั่งแล้วยังไม่มาส่ง (สำหรับหัวหน้า)
 *
 * ใช้: node shortfall.cjs --from 14/09/2026 [--ward|--drug|--both]
 * อ่านอย่างเดียว ไม่เขียนไฟล์ Excel
 */
const path = require('path');
const XLSX = require(process.env.XLSX_PATH || 'C:/Users/PRH0000484/warehouse-app/node_modules/xlsx');

const OD = process.env.ONEDRIVE_DIR || 'C:/Users/PRH0000484/OneDrive';
const F_STOCK = path.join(OD, 'ยอดคลังยา_69.xlsm');
const F_RECV = path.join(OD, 'รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm');
const F_PO = path.join(OD, 'รายงานการซื้อยา_69.xlsx');

const A = process.argv.slice(2);
const arg = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const has = k => A.includes(k);
const FROM = arg('--from', '14/09/2026');
const MODE = has('--ward') ? 'ward' : has('--drug') ? 'drug' : 'both';

// ---------- date ----------
// ไฟล์ปนกัน 2 รูปแบบ: m/d/yy (5/25/26 = 25 พ.ค.) และ dd/mm/yyyy (16/9/2026 = 16 ก.ย.)
// ห้ามหยิบแถวท้ายไฟล์เป็น "ล่าสุด" ต้อง normalize แล้ว sort เสมอ
function nd(s) {
  s = String(s).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let a = +m[1], b = +m[2], y = +m[3];
  if (y < 100) y += 2000;
  let d, mo;
  if (a > 12) { d = a; mo = b; }
  else if (String(m[3]).length === 4) { d = a; mo = b; }
  else { mo = a; d = b; }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d, k: y * 10000 + mo * 100 + d };
}
const fmt = n => n ? String(n.d).padStart(2, '0') + '/' + String(n.m).padStart(2, '0') + '/' + n.y : '-';
const daysBetween = (a, b) => Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 864e5);
const T = new Date();
const TODAY = { y: T.getFullYear(), m: T.getMonth() + 1, d: T.getDate() };

const sh = (f, s) => {
  const wb = XLSX.readFile(f, { sheets: [s], raw: false });
  const ws = wb.Sheets[s];
  if (!ws) throw new Error('ไม่พบชีท ' + s + ' ใน ' + path.basename(f));
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
};
const num = v => parseFloat(String(v).replace(/,/g, '')) || 0;

// ---------- 1) shortfall จากชีท 'เบิก ' (ช่องว่างท้ายชื่อ, header แถว 6) ----------
const SHORT_RE = /ยาหมดรอของส่ง|ไม่พอจ่าย|จ่ายไม่ครบ|หมดรอของส่ง/;
const parseNote = n => {
  const m = String(n).match(/เบิก\s*([\d,]+)\s*(?:กล่อง|ขวด|หลอด|ซอง)?\s*จ่าย\s*([\d,]+)/);
  return m ? { ask: num(m[1]), give: num(m[2]) } : null;
};

const E = sh(F_STOCK, 'เบิก ').slice(6).filter(r => r[4]);
const from = nd(FROM);
if (!from) { console.error('--from ต้องเป็น DD/MM/YYYY'); process.exit(1); }

// group ตาม code|date|ward เพราะยา 1 ตัวแตกหลาย lot = หลายแถว (ห้ามนับซ้ำ)
const grp = {};
for (const r of E) {
  const d = nd(r[1]);
  if (!d || d.k < from.k) continue;
  const key = String(r[4]).trim() + '|' + String(r[1]).trim() + '|' + String(r[15]).trim();
  grp[key] = grp[key] || {
    code: String(r[4]).trim(), name: String(r[6]).trim(),
    date: String(r[1]).trim(), ward: String(r[15]).trim(), sumOut: 0, rows: 0, note: ''
  };
  grp[key].sumOut += num(r[13]);
  grp[key].rows++;
  const note = String(r[16]);
  if (SHORT_RE.test(note) && parseNote(note)) grp[key].note = note;
}

// ---------- 2) คงเหลือ + หน่วยจริง จาก Master ----------
const M = sh(F_STOCK, 'Master');
const mi = {};
M[0].forEach((h, i) => { if (h) mi[String(h).trim()] = i; });
const stock = {};
for (const r of M.slice(1)) {
  const c = String(r[mi['รหัสHosxp']]).trim();
  if (!c) continue;
  const q = num(r[mi['คงเหลือหลังจ่าย']]);
  const st = String(r[mi['สถานะตรวจรับ']]).trim();
  stock[c] = stock[c] || {
    ok: 0, wait: 0, unit: String(r[mi['หน่วย']]).trim(),
    ps: String(r[mi['packsize']]).trim(), base: String(r[mi['หน่วยย่อย']]).trim()
  };
  if (st === 'รอตรวจรับ') stock[c].wait += q; else stock[c].ok += q;
}
// packsize=1 -> หน่วยจริงคือหน่วยย่อย (เช่น "450ml" ที่จริงนับเป็น "ขวด")
// packsize>1 -> หน่วยคือแพ็ค (เช่น "500เม็ด" = กล่องละ 500 เม็ด) ใช้ตามที่เขียนไว้
// ยาที่ไม่มีใน Master (คลังหมด ไม่เหลือ lot) -> fallback หน่วยจากรายงานสั่งซื้อ
const unitOf = c => {
  const s = stock[c];
  if (s) return (s.ps === '1' && s.base) ? s.base : s.unit;
  return poUnit[c] || '';
};

// ---------- 3) ประวัติรับ ----------
const R = sh(F_RECV, 'รับยา');
const ri = {};
R[0].forEach((h, i) => { if (h) ri[String(h).trim()] = i; });
const recv = {};
for (const r of R.slice(1)) {
  const c = String(r[ri['รหัส']]).trim();
  if (!c) continue;
  const n = nd(r[ri['วันที่รับ']]);
  if (!n) continue;
  (recv[c] = recv[c] || []).push({
    n, q: String(r[ri['จำนวนที่รับ']]).trim(), name: String(r[ri['รายการยา']]).trim(),
    bill: String(r[ri['เลขที่บิลซื้อ']]).trim(), insp: String(r[ri['สถานะตรวจรับ']]).trim(),
    kind: String(r[ri['สถานะการซื้อ']]).trim(), sup: String(r[ri['บริษัท']]).trim()
  });
}
for (const c in recv) recv[c].sort((a, b) => a.n.k - b.n.k);

// ---------- 4) รายงานสั่งซื้อ (checkbox) ----------
const po = {}, poName = {}, poUnit = {};
for (const [sn, off] of [['รายงานซื้อยา', 4], ['Sheet1', 0]]) {
  let rows;
  try { rows = sh(F_PO, sn).slice(off); } catch (e) { continue; }
  for (const r of rows) {
    const c = String(r[4]).trim();
    if (!c) continue;
    const ord = nd(r[1]);
    if (!ord) continue;
    if (!poName[c]) poName[c] = String(r[6]).trim();
    if (!poUnit[c]) poUnit[c] = String(r[7]).trim();
    (po[c] = po[c] || []).push({
      tick: String(r[0]).trim(), ord, sup: String(r[9]).trim(),
      stock27: String(r[14]).trim(), rec: String(r[17]).trim(), note: String(r[18]).trim()
    });
  }
}
const latestPO = c => { const l = po[c]; return l ? l.slice().sort((a, b) => b.ord.k - a.ord.k)[0] : null; };

// ---------- 5) ประกอบ + verify ----------
const items = [], conflicts = [];
for (const k in grp) {
  const g = grp[k];
  if (!g.note) continue;
  const p = parseNote(g.note);
  // VERIFY: เลข "จ่าย" ในหมายเหตุ ต้องตรงกับผลรวมปริมาณออกจริงทุก lot
  if (p.give !== g.sumOut) {
    conflicts.push({ ...g, noteGive: p.give, realOut: g.sumOut, ask: p.ask });
    if (g.sumOut >= p.ask) continue; // จ่ายครบจริง หมายเหตุเขียนตก -> ไม่ใช่ของขาด
  }
  const give = (p.give !== g.sumOut) ? g.sumOut : p.give;
  const short = p.ask - give;
  if (short <= 0) continue;
  items.push({ ...g, ask: p.ask, give, short, unit: unitOf(g.code) });
}

// ---------- OUTPUT ----------
const W = (...a) => console.log(...a);
W('รายงานยาค้างจ่าย — ข้อมูล ณ ' + fmt(TODAY) + ' | ช่วงเบิกตั้งแต่ ' + FROM);
W('แหล่ง: ยอดคลังยา_69 + รับจากการซื้อ_ยืม + รายงานการซื้อยา_69\n');

if (MODE === 'ward' || MODE === 'both') {
  W('='.repeat(72));
  W('ฉบับที่ 1 — หน่วยงานที่ได้ยาไม่ครบ (จะได้ของไหม)');
  W('='.repeat(72));
  const byW = {};
  items.forEach(i => (byW[i.ward] = byW[i.ward] || []).push(i));
  for (const w of Object.keys(byW).sort((a, b) => byW[b].length - byW[a].length)) {
    W('\n### ' + w + '  (' + byW[w].length + ' รายการ)');
    byW[w].sort((a, b) => b.short - a.short).forEach(i => {
      const st = stock[i.code] || { ok: 0, wait: 0 };
      const p = latestPO(i.code);
      let verdict;
      if (st.ok >= i.short) verdict = 'ได้แน่ — คลังมี ' + st.ok + ' ' + i.unit + ' จ่ายได้เลย';
      else if (st.wait > 0) verdict = 'รอตรวจรับ ' + st.wait + ' ' + i.unit + ' — ตรวจรับเสร็จจ่ายได้';
      else if (p && p.tick === '☐') verdict = 'ยังไม่ได้ — บริษัทยังไม่ส่ง (สั่ง ' + fmt(p.ord) + ' ค้าง ' + daysBetween(p.ord, TODAY) + ' วัน)';
      else verdict = 'ยังไม่ได้ — คลังเหลือ ' + st.ok;
      W('  ' + i.date + ' | ' + i.name);
      W('      ขอ ' + i.ask + ' ได้ ' + i.give + ' ขาด ' + i.short + ' ' + i.unit + '  ->  ' + verdict);
    });
  }
}

if (MODE === 'drug' || MODE === 'both') {
  W('\n' + '='.repeat(72));
  W('ฉบับที่ 2 — ตามยาที่สั่งแล้วยังไม่มาส่ง (สำหรับหัวหน้า)');
  W('='.repeat(72));
  const pend = [];
  for (const c in po) {
    const p = latestPO(c);
    if (!p || p.tick !== '☐') continue;
    const list = recv[c] || [];
    const last = list.length ? list[list.length - 1] : null;
    // ของที่รับหลังวันแจ้งสั่ง ต้องเป็น "การซื้อ" เท่านั้น
    // ยืม/บริจาค/แลกเปลี่ยนยาหมดอายุ ไม่ใช่ของที่สั่ง -> checkbox ว่างถูกแล้ว
    const after = list.filter(v => v.n.k >= p.ord.k && v.kind === 'การซื้อ');
    const other = list.filter(v => v.n.k >= p.ord.k && v.kind !== 'การซื้อ');
    pend.push({
      c, name: poName[c] || (list[0] && list[0].name) || c, po: p, last, after, other,
      wait: daysBetween(p.ord, TODAY)
    });
  }
  const mistick = pend.filter(x => x.after.length);
  const real = pend.filter(x => !x.after.length).sort((a, b) => b.wait - a.wait);
  const zero = real.filter(x => num(x.po.stock27) === 0);
  const low = real.filter(x => num(x.po.stock27) > 0 && num(x.po.stock27) <= 5);

  W('\nยังไม่มาส่งจริง ' + real.length + ' รายการ | ควรติ๊กแล้ว ' + mistick.length + ' รายการ');
  W('\n--- วิกฤต: คงเหลือ 0 (' + zero.length + ' รายการ) ---');
  zero.forEach(x => W('  ค้าง ' + x.wait + ' วัน | ' + x.name + ' | คงเหลือ 0 ' + unitOf(x.c) +
    ' | สั่ง ' + fmt(x.po.ord) + ' | ส่งล่าสุดจริง ' + fmt(x.last && x.last.n) + ' | ' + x.po.sup));
  W('\n--- ใกล้หมด คงเหลือ 1-5 (' + low.length + ' รายการ) ---');
  low.forEach(x => W('  ค้าง ' + x.wait + ' วัน | ' + x.name + ' | คงเหลือ ' + x.po.stock27 + ' ' +
    unitOf(x.c) + ' | สั่ง ' + fmt(x.po.ord) + ' | ' + x.po.sup));

  if (mistick.length) {
    W('\n--- ของมาแล้วแต่ยังไม่ติ๊ก checkbox (' + mistick.length + ') ---');
    mistick.forEach(x => W('  ' + x.name + ' | สั่ง ' + fmt(x.po.ord) + ' | มา ' +
      x.after.map(v => fmt(v.n) + ' ' + v.q + ' [' + v.kind + ']').join(', ')));
  }
  const otherOnly = pend.filter(x => x.other.length && !x.after.length);
  if (otherOnly.length) {
    W('\n--- มีของเข้าแต่ไม่ใช่การซื้อ (ยืม/บริจาค/แลกเปลี่ยน) — checkbox ว่างถูกต้อง ---');
    otherOnly.forEach(x => W('  ' + x.name + ' | ' +
      x.other.map(v => fmt(v.n) + ' [' + v.kind + ']').join(', ')));
  }
  const bySup = {};
  real.forEach(x => (bySup[x.po.sup] = bySup[x.po.sup] || []).push(x));
  const heavy = Object.entries(bySup).filter(e => e[1].length >= 3).sort((a, b) => b[1].length - a[1].length);
  if (heavy.length) {
    W('\n--- บริษัทที่ค้างหลายรายการ (อาจมีปัญหาเชิงระบบ) ---');
    heavy.forEach(e => W('  ' + e[0] + ' — ค้าง ' + e[1].length + ' รายการ (เหลือ 0: ' +
      e[1].filter(x => num(x.po.stock27) === 0).length + ')'));
  }
}

if (conflicts.length) {
  W('\n' + '='.repeat(72));
  W('*** ข้อมูลขัดแย้ง — ให้คลังตรวจสอบ (ไม่นับเข้ารายงาน) ***');
  W('='.repeat(72));
  conflicts.forEach(c => {
    W('  ' + c.date + ' ' + c.ward + ' | ' + c.name);
    W('      หมายเหตุว่าจ่าย ' + c.noteGive + ' แต่ผลรวมจริง ' + c.realOut +
      ' (' + c.rows + ' lot) | ขอ ' + c.ask);
  });
}
