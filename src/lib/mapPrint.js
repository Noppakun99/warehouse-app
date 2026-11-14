// พิมพ์แผนผังที่เก็บยา (ระบบแผนผังคลังยา · เมนู "จัดการข้อมูล" → "พิมพ์แผนผัง") — เลือกได้หลายโซน
// กระดาษ = ผังตู้แบบยืนมองหน้าตู้ (ชั้นบนอยู่บน — ชั้น 1 = ล่างสุด) ในช่องเขียนชื่อยาที่อยู่ข้างใน ไว้ติดชั้น/เดินหายา
// 1 โซนขึ้นหน้าใหม่ · A4 แนวนอน · ป้ายสถานะเป็น "คำเต็ม" + รูปทรงต่างกัน (ทึบ/ขอบ/เส้นประ) เครื่องพิมพ์ขาวดำก็แยกออก
//   (user 14/11/2569: "ใกล้หมด" เฉยๆ กำกวม ไม่รู้ว่าหมดอายุหรือหมดคลัง)
// UI helper: ข้อมูลโซนประกอบใน App.jsx (เกณฑ์อายุชุดเดียวกับสีช่องบนผัง · ใกล้หมดคลังกฎเดียวกับ Dashboard) แล้วส่งมาวาด
import { openPrintView } from './openPrintView';

const HOSPITAL_NAME = 'โรงพยาบาลประชาธิปัตย์';

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function nowThai() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear() + 543} ${p(d.getHours())}:${p(d.getMinutes())} น.`;
}

// ลำดับ = ความเร่งด่วน (ป้ายในช่องเรียงตามนี้ · แถบสรุปบนหัวกระดาษเรียงตามนี้)
const TAGS = [
  { key: 'expired',      label: 'หมดอายุแล้ว',     cls: 't-exp',  has: d => d.expiry === 'expired' },
  { key: 'near',         label: 'ใกล้หมดอายุ',     cls: 't-near', has: d => d.expiry === 'near' },
  { key: 'lowStock',     label: 'ใกล้หมดคลัง',     cls: 't-low',  has: d => d.lowStock },
  { key: 'pending',      label: 'รอตรวจรับ',       cls: 't-pend', has: d => d.pending },
  { key: 'discontinued', label: 'ตัดออกจากบัญชี',  cls: 't-disc', has: d => d.discontinued },
];
const tagHtml = (t) => `<span class="tag ${t.cls}">${t.label}</span>`;

function slotHtml(slot) {
  const empty = slot.drugs.length === 0;
  const tone = empty ? 'empty'
    : slot.drugs.some(d => d.expiry === 'expired') ? 's-exp'
    : slot.drugs.some(d => d.expiry === 'near') ? 's-near' : '';
  const body = empty
    ? '<div class="none">ช่องว่าง</div>'
    : `<ul>${slot.drugs.map(d => {
        const tags = TAGS.filter(t => t.has(d)).map(tagHtml).join('');
        return `<li><span class="nm">${esc(d.name)}</span>${tags ? `<span class="tags">${tags}</span>` : ''}</li>`;
      }).join('')}</ul>`;
  return `<div class="slot ${tone}"><div class="sid"><b>${esc(slot.id)}</b>${empty ? '' : `<span>${slot.drugs.length} ยา</span>`}</div>${body}</div>`;
}

// นับ "ยา" ไม่ซ้ำชื่อในโซน ต่อป้าย — ยาตัวเดียวอยู่หลายช่องนับครั้งเดียว
function zoneCounts(z) {
  const all = new Map();
  z.levels.forEach(lv => lv.slots.forEach(s => s.drugs.forEach(d => {
    const cur = all.get(d.name) || {};
    TAGS.forEach(t => { if (t.has(d)) cur[t.key] = true; });
    all.set(d.name, cur);
  })));
  const by = Object.fromEntries(TAGS.map(t => [t.key, 0]));
  all.forEach(f => TAGS.forEach(t => { if (f[t.key]) by[t.key] += 1; }));
  return { drugs: all.size, by };
}

/**
 * @param {Array<{title:string, note?:string, levels:Array<{label:string, slots:Array<{id:string, drugs:Array<{name:string, expiry:'expired'|'near'|null, pending?:boolean, lowStock?:boolean, discontinued?:boolean}>}>}>}>} zones
 *   levels ที่ label ว่าง = พื้นที่อื่น (ไม่ใช่ตู้ วาดเป็นตารางช่องเรียงกัน)
 * @param {object} opts
 * @param {string} [opts.updatedAt]  ข้อมูลคลัง ณ วันเวลา (อัพเดตล่าสุดของแผนผัง)
 * @param {string} [opts.printedBy]
 * @param {boolean} [opts.hideEmpty] ซ่อนช่องว่าง — บอกบนกระดาษ ไม่งั้นคนอ่านคิดว่าช่องที่ไม่มีในกระดาษไม่มีอยู่จริง
 * @param {boolean} [opts.lowStockReady] false = โหลดเกณฑ์ Safety Stock ไม่สำเร็จ → ป้ายใกล้หมดคลังไม่ได้ตรวจ ต้องบอกบนกระดาษ
 */
export function printLocationMap(zones, { updatedAt = '', printedBy = '', hideEmpty = false, lowStockReady = true } = {}) {
  const printedAt = nowThai();
  const legend = TAGS.map(t => `<span class="lg">${tagHtml(t)} ${({
    expired: 'มี lot หมดอายุแล้ว',
    near: 'มี lot หมดอายุภายใน 16 เดือน',
    lowStock: lowStockReady ? 'คงเหลือรวมทั้งคลังต่ำกว่า Safety Stock' : 'ไม่ได้ตรวจรอบนี้ (โหลดเกณฑ์ไม่สำเร็จ)',
    pending: 'มี lot ที่ยังรอตรวจรับ',
    discontinued: 'มติตัดออก ไม่สั่งซื้อเพิ่ม',
  })[t.key]}</span>`).join('');

  const pages = zones.map(z => {
    const c = zoneCounts(z);
    const isCabinet = z.levels.some(lv => lv.label);
    // คอลัมน์ = จำนวนช่องมากสุดของชั้นในโซน (สูงสุด 6) — ช่องทุกชั้นตรงคอลัมน์กันเหมือนตู้จริง ไม่ตกบรรทัดใหม่
    const cols = isCabinet ? Math.min(6, Math.max(1, ...z.levels.map(lv => lv.slots.length))) : 5;
    const chips = TAGS.filter(t => c.by[t.key] > 0)
      .map(t => `<span class="chip">${tagHtml(t)} <b>${c.by[t.key]}</b> ยา</span>`).join('');
    const grid = z.levels.length === 0
      ? '<p class="nothing">ไม่มีช่องที่จะพิมพ์</p>'
      : isCabinet
        ? `<div class="cab">${z.levels.map(lv => `
    <div class="level">
      <div class="lv"><span>ชั้น</span><b>${esc(String(lv.label).replace(/^ชั้น\s*/, ''))}</b></div>
      <div class="slots" style="--cols:${cols}">${lv.slots.map(slotHtml).join('')}</div>
    </div>`).join('')}
  </div>`
        : `<div class="slots flow" style="--cols:${cols}">${z.levels.flatMap(lv => lv.slots).map(slotHtml).join('')}</div>`;
    return `
<section class="zone">
  <header class="hd">
    <div class="zname">${esc(z.title)}</div>
    <div class="ttl">
      <h1>แผนผังที่เก็บยา</h1>
      <div class="sub">${esc(HOSPITAL_NAME)} · ${c.drugs} ยา${z.note ? ' · ' + esc(z.note) : ''}</div>
    </div>
    <div class="meta">
      ${updatedAt ? `<div>ข้อมูลคลัง ณ <b>${esc(updatedAt)}</b></div>` : ''}
      <div>พิมพ์เมื่อ ${printedAt}${printedBy ? ' · ' + esc(printedBy) : ''}</div>
    </div>
  </header>
  ${chips ? `<div class="chips">${chips}</div>` : ''}
  ${grid}
  <footer class="ft">${legend}${hideEmpty ? '<span class="lg">ไม่แสดงช่องว่าง</span>' : ''}<span class="lg">ชื่อยาแสดงเฉพาะที่คงเหลือมากกว่า 0</span></footer>
</section>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>แผนผังที่เก็บยา</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 11px; color: #0f172a; background: #fff; padding: 14px 20px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4 landscape; margin: 7mm; }
  .zone + .zone { break-before: page; page-break-before: always; }

  .hd { display: flex; align-items: center; gap: 12px; padding-bottom: 6px; border-bottom: 2px solid #0f172a; }
  .zname { background: #0f172a; color: #fff; font-weight: 800; font-size: 22px; line-height: 1; padding: 8px 14px; border-radius: 8px; white-space: nowrap; }
  .ttl { flex: 1; min-width: 0; }
  h1 { font-size: 17px; font-weight: 800; line-height: 1.2; }
  .sub { font-size: 11px; color: #334155; font-weight: 600; }
  .meta { font-size: 10px; color: #475569; text-align: right; line-height: 1.5; }

  .chips { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 6px 0 2px; font-size: 10.5px; color: #334155; }
  .chip { display: inline-flex; align-items: center; gap: 4px; }

  /* ตู้ = กรอบเดียว แต่ละชั้นคั่นด้วย "แผ่นชั้น" หนา ป้ายชั้นแถบเข้มซ้าย */
  .cab { margin-top: 6px; border: 2px solid #334155; border-radius: 6px; overflow: hidden; }
  /* ห้ามตัดกลางชั้น — เคยลองปล่อยให้ตัด (14/11/2569) ได้ป้าย "ชั้น 1" ว่างๆ ท้ายหน้าแล้วช่องไปขึ้นหน้าถัดไป ดูผิดกว่าที่ว่างท้ายหน้า
     ชั้นที่สูงเกิน 1 หน้า เบราว์เซอร์ตัดให้เองอยู่ดี */
  .level { display: flex; align-items: stretch; border-bottom: 4px solid #cbd5e1; break-inside: avoid; page-break-inside: avoid; }
  .level:last-child { border-bottom: 0; }
  .lv { width: 15mm; flex-shrink: 0; background: #334155; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; }
  .lv span { font-size: 9px; opacity: .85; }
  .lv b { font-size: 20px; font-weight: 800; }
  .slots { display: grid; grid-template-columns: repeat(var(--cols, 5), minmax(0, 1fr)); gap: 5px; padding: 5px; flex: 1; min-width: 0; }
  .slots.flow { margin-top: 6px; padding: 0; }

  .slot { border: 1px solid #64748b; border-left-width: 4px; border-radius: 4px; background: #fff; break-inside: avoid; page-break-inside: avoid; overflow: hidden; }
  .slot.s-near { border-left-color: #d97706; }
  .slot.s-exp { border-left-color: #0f172a; }
  .slot.empty { border: 1px dashed #94a3b8; border-left-width: 1px; color: #94a3b8; }
  .sid { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; background: #f1f5f9; padding: 2px 6px; border-bottom: 1px solid #e2e8f0; }
  .sid b { font-size: 12.5px; font-weight: 800; letter-spacing: .2px; }
  .sid span { font-size: 9.5px; color: #475569; font-weight: 600; white-space: nowrap; }
  .slot.empty .sid { background: transparent; border-bottom: 0; }
  .slot.empty .sid b { color: #94a3b8; }
  ul { list-style: none; padding: 1px 6px 3px; }
  li { padding: 2px 0; line-height: 1.3; word-break: break-word; }
  li + li { border-top: 1px dotted #cbd5e1; }
  .nm { font-size: 10.5px; }
  .tags { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 1px; }
  .none { padding: 2px 6px 6px; font-size: 10px; }
  .nothing { margin-top: 10px; color: #64748b; }

  .tag { display: inline-block; font-size: 8.5px; font-weight: 700; line-height: 1.35; padding: 0 4px; border-radius: 3px; border: 1px solid; white-space: nowrap; }
  .t-exp  { background: #0f172a; color: #fff; border-color: #0f172a; }
  .t-near { background: #fef3c7; color: #78350f; border-color: #b45309; }
  .t-low  { background: #fff; color: #9f1239; border: 1.5px solid #be123c; }
  .t-pend { background: #e0f2fe; color: #075985; border: 1px dashed #0369a1; }
  .t-disc { background: #e2e8f0; color: #334155; border-color: #94a3b8; text-decoration: line-through; }

  .ft { display: flex; flex-wrap: wrap; gap: 3px 14px; margin-top: 8px; padding-top: 5px; border-top: 1px solid #cbd5e1; font-size: 9.5px; color: #475569; }
  .lg { display: inline-flex; align-items: center; gap: 4px; }

  .btn { position: fixed; top: 10px; right: 12px; padding: 8px 16px; font-family: inherit; font-size: 13px;
    font-weight: 600; color: #fff; background: #4f46e5; border: 0; border-radius: 8px; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.2); }
  @media screen { body { padding-top: 54px; background: #f1f5f9; } .zone { background: #fff; max-width: 283mm; margin: 0 auto 16px; padding: 10px 12px; box-shadow: 0 1px 4px rgba(0,0,0,.12); } }
  @media print { body { padding: 0; } .btn { display: none !important; } }
</style></head><body>
<button class="btn" onclick="window.print()">พิมพ์</button>
${pages || '<p>ไม่มีโซนที่เลือก</p>'}
</body></html>`;

  openPrintView(html);
}
