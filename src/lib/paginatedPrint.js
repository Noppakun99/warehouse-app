// ใบพิมพ์ A4 แนวตั้งที่แบ่งหน้าเอง (ใบเบิกเวชภัณฑ์ยา · ใบขอเบิก) — pure: คืน HTML ทั้งหน้า ไม่แตะ DOM/supabase
//
// ทำไมไม่ปล่อยเบราว์เซอร์ตัดหน้า: Safari (iPhone/Mac ที่ห้องยาใช้พิมพ์) ไม่พิมพ์ <thead> ซ้ำหน้าใหม่ และตัดแถวครึ่งตัว
// → หน้า 2 ไม่มีหัวคอลัมน์ + เส้นตารางขาดที่รอยต่อหน้า (ใบ REQ-20261120-6883 · user แจ้ง 20/11/2569)
// สคริปต์ในหน้าพิมพ์จึงวัดความสูงจริง (หลังฟอนต์โหลด) แล้วเติมแถวทีละหน้า: ทุกหน้ามีตารางของตัวเอง หัวคอลัมน์ครบ เส้นปิดครบ
// · ส่วนท้าย (ลายเซ็น) ต้องอยู่หน้าเดียวกับรายการ — ไม่พอให้ยกรายการท้าย 3 แถวตามไปด้วย ไม่มีหน้าลายเซ็นลอยๆ
// · @page margin 0 = เบราว์เซอร์ไม่พิมพ์หัว/ท้ายกระดาษของตัวเอง (blob:… วันที่) ขอบกระดาษทำด้วย padding ของ .page
// · viewport กว้าง 820px = มือถือย่อทั้งหน้าให้พอดีจอ (หน้า A4 กว้างคงที่ 210mm)
// · ความสูงหน้า 282mm ไม่ใช่ 296mm: iOS Safari ไม่สน @page margin — ใส่ขอบ+หัวท้ายของตัวเองแล้วย่อตามความกว้าง
//   พื้นที่พิมพ์ได้สูง ≈ 1.39 เท่าของความกว้าง (วัดจาก PDF REQ-20261120-6883) → 296mm ล้น ~4mm ไปขึ้นหน้าว่างทุกแผ่น (user แจ้ง 23/11/2569)

export const PAGINATED_BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'Sarabun', sans-serif; font-size: 15.5px; color: #000; line-height: 1.5; background: #e5e7eb; }
.page { width: 210mm; height: 282mm; padding: 10mm 12mm 7mm; background: #fff; margin: 0 auto; display: flex; flex-direction: column; overflow: hidden; }
@media screen { .page { margin: 12px auto; box-shadow: 0 1px 4px rgba(0,0,0,.2); } }
@media print { body { background: #fff; } .page { margin: 0; break-after: page; } .page:last-child { break-after: auto; } }
.pbody { flex: 1 1 auto; min-height: 0; overflow: hidden; }
.pfoot { flex: none; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; font-size: 12.5px; color: #333; padding-top: 4px; }
.pfoot .ini { display: inline-flex; gap: 6px; align-items: baseline; }
.pfoot .ini i { display: inline-block; min-width: 45mm; border-bottom: 1px dotted #333; }
.cont { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 6px; }
.cont b { font-size: 16.5px; }
table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 4px 0 0; }
table.grid th, table.grid td { border: 1px solid #000; padding: 2px 4px; font-size: 14.5px; line-height: 1.35; vertical-align: top; overflow-wrap: anywhere; }
table.grid th { font-weight: 600; text-align: center; vertical-align: middle; background: #f1f5f9; line-height: 1.25; overflow-wrap: normal; white-space: nowrap; }
table.grid td.c { text-align: center; } table.grid td.r { text-align: right; font-variant-numeric: tabular-nums; }
table.grid td.mono { font-size: 13px; text-align: center; } table.grid td.b { font-weight: 600; }
table.grid tr.blank td { height: 7.2mm; }
`

// JSON ฝังใน <script> — กัน "</script>" ในชื่อยา/หมายเหตุปิดแท็กก่อนเวลา
const embed = (v) => JSON.stringify(v).replace(/</g, '\\u003c')

/**
 * @param {object} o
 * @param {string} o.title       ชื่อแท็บ/ไฟล์ (escape แล้ว)
 * @param {string} o.css         CSS เฉพาะใบ (ต่อท้าย base)
 * @param {string} o.firstHead   หัวหน้าแรก (HTML)
 * @param {string} o.contHead    หัวหน้าถัดไป (HTML)
 * @param {string} o.table       <colgroup> + <thead> ของตาราง (ไม่มี tbody)
 * @param {string[]} o.rows      <tr> รายการ
 * @param {string} o.blankRow    <tr class="blank"> สำหรับเติมให้ถึง minRows
 * @param {number} o.minRows
 * @param {string} o.tail        ส่วนท้ายหลังตาราง (สรุป + ลายเซ็น) — อยู่หน้าสุดท้ายเสมอ
 * @param {string} o.footLeft    ข้อความท้ายกระดาษ (มี "หน้า n/N" ต่อท้ายให้)
 * @param {string} [o.initials]  ป้ายลงชื่อกำกับหน้า — แสดงทุกหน้าที่ไม่มีลายเซ็น (หน้าสุดท้ายไม่แสดง)
 * @param {boolean} [o.autoPrint=true]
 */
export function buildPaginatedHtml(o) {
  const cfg = {
    firstHead: o.firstHead, contHead: o.contHead, table: o.table, rows: o.rows,
    blankRow: o.blankRow || '', minRows: o.minRows || 0, tail: o.tail || '',
    footLeft: o.footLeft || '', initials: o.initials || '', autoPrint: o.autoPrint !== false,
  }
  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<meta name="viewport" content="width=820">
<title>${o.title}</title>
<style>${PAGINATED_BASE_CSS}${o.css || ''}</style></head><body>
<div id="root"></div>
<script>
(function () {
  var C = ${embed(cfg)};
  function build() {
    var root = document.getElementById('root');
    var pages = [];
    function newPage(first) {
      var pg = document.createElement('div');
      pg.className = 'page';
      pg.innerHTML = '<div class="pbody">' + (first ? C.firstHead : C.contHead)
        + '<table class="grid">' + C.table + '<tbody></tbody></table><div class="ptail"></div></div>'
        // pno มี &nbsp; ตั้งแต่ตอนวัด — ว่างแล้วเติม "หน้า n/N" ทีหลัง ท้ายกระดาษสูงขึ้น 1 บรรทัด แถวท้ายโดนตัด
        + '<div class="pfoot"><span class="ini"></span><span class="pno">&nbsp;</span></div>';
      root.appendChild(pg); pages.push(pg); return pg;
    }
    function over(pg) { var b = pg.querySelector('.pbody'); return b.scrollHeight > b.clientHeight + 1; }
    function tb(pg) { return pg.querySelector('tbody'); }
    var pg = newPage(true);
    C.rows.forEach(function (row) {
      tb(pg).insertAdjacentHTML('beforeend', row);
      if (over(pg) && tb(pg).children.length > 1) {
        tb(pg).lastElementChild.remove();
        pg = newPage(false);
        tb(pg).insertAdjacentHTML('beforeend', row);
      }
    });
    for (var k = C.rows.length; k < C.minRows; k++) tb(pg).insertAdjacentHTML('beforeend', C.blankRow);
    pg.querySelector('.ptail').innerHTML = C.tail;
    if (over(pg) && C.tail) {
      pg.querySelector('.ptail').innerHTML = '';
      var moved = [];
      for (var m = 0; m < 3 && tb(pg).children.length > 1; m++) { moved.unshift(tb(pg).lastElementChild.outerHTML); tb(pg).lastElementChild.remove(); }
      pg = newPage(false);
      tb(pg).innerHTML = moved.join('');
      pg.querySelector('.ptail').innerHTML = C.tail;
    }
    pages.forEach(function (p, i) {
      p.querySelector('.pno').textContent = (C.footLeft ? C.footLeft + ' · ' : '') + 'หน้า ' + (i + 1) + '/' + pages.length;
      if (C.initials && i < pages.length - 1) p.querySelector('.ini').innerHTML = C.initials + ' <i>&nbsp;</i>';
    });
    if (C.autoPrint) setTimeout(function () { window.print(); }, 150);
  }
  // สั่งโหลด Sarabun ทุกน้ำหนักเอง — fonts.ready อย่างเดียว resolve ก่อนฟอนต์เริ่มโหลด (ยังไม่มีข้อความใช้) → วัดด้วยฟอนต์สำรอง
  // แล้ว Sarabun มาทีหลัง แถวสูงขึ้น ล้นท้ายหน้าโดนตัด (เจอ 23/11/2569: แถว 27 ครึ่งตัว)
  // ข้อความตัวอย่างต้องมีทั้งไทยและละติน — Google Fonts แยกไฟล์ตาม unicode-range ชื่อยา/ตัวเลขเป็นชุดละติน
  var ready = document.fonts && document.fonts.load
    ? Promise.all(['400', '600', '700'].map(function (w) { return document.fonts.load(w + ' 15px Sarabun', 'กAa1'); }))
        .then(function () { return document.fonts.ready; }, function () {})
    : Promise.resolve();
  // ฟอนต์โหลดไม่ขึ้น (เน็ตหลุด) ต้องไม่ค้าง — รอไม่เกิน 3 วิแล้ววัดด้วยฟอนต์สำรอง
  Promise.race([ready, new Promise(function (r) { setTimeout(r, 3000); })]).then(build);
})();
</script>
</body></html>`
}
