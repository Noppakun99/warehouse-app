"""เอกสารสรุปตรวจรับ (ตร.<ปีงบ>/<ลำดับ>) ให้ผู้ตรวจรับเซ็นรับทราบ — อ่านชีท 'รับยา' (read-only) → HTML → PDF + ทะเบียน CSV
usage: python scripts/inspection_ack.py [--date DD/MM/YYYY] [--bills b1,b2] [--file <recv.xlsm>] [--commit]
1 ใบ = 1 รอบตรวจรับ (วันที่ตรวจรับ Q เดียวกัน) · รวมทุกสถานะการซื้อ แยกหัวข้อ การซื้อ / ไม่ได้ซื้อ (user ตกลง 21/10/2569)
  --date   = วันที่ตรวจรับ (พ.ศ.) ของรอบที่จะออก — ไม่ระบุ: ถ้าค้างรอบเดียวใช้รอบนั้น ค้างหลายรอบ = หยุดให้เลือก
  --bills  = ออกเฉพาะบิลชุดนี้ (กรรมการคนละคนในวันเดียวกัน → แยกใบ) — บิลที่ระบุต้องเจอครบ ไม่งั้นหยุด
  ไม่มี --commit = สร้าง PDF ใน temp อย่างเดียว ไม่แตะโฟลเดอร์จริง/ทะเบียน/คิวพิมพ์
  --commit = PDF → Desktop\\ยอดคงคลัง\\เอกสารตรวจรับ + แถวทะเบียน + แถวคิวพิมพ์ (_สถานะพิมพ์.csv) → แล้วรัน print-queue.py
ทะเบียนนับซ้ำด้วย (เลขบิล, บริษัท, วันที่ตรวจรับ) — บิลเดียวตรวจรับ 2 วัน = 2 ใบ
คอลัมน์ "รูปตรวจรับ" = มีแถว เอกสาร=รูปตรวจรับ ใน _ดัชนีบิล.csv ที่ (เลขบิล, รหัส) ตรงกัน · ช่อง ✓ ให้ผู้ตรวจรับติ๊กรายตัว
  ใบที่เซ็นแล้ว = หลักฐานแทนรูปที่หาย/ไม่ได้ถ่าย (user 21/10/2569) → รูปใบเซ็นเข้าโฟลเดอร์พัก ผู้ตรวจรับเซ็น\\
  → ติ๊กทะเบียน (ผู้ตรวจรับเซ็น/วันที่เซ็น) → ย้ายรูปไป เอกสารตรวจรับ\\เซ็นแล้ว\\ · check-complete ตรวจข้อนี้
"""
import sys, os, csv, html, datetime, subprocess, tempfile, time, warnings
from collections import OrderedDict
import openpyxl
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bill_handover import bahttext, th_date, short, fiscal2, money, qty, arg, EDGE, SENDER  # noqa: E402
sys.stdout.reconfigure(encoding='utf-8')
warnings.filterwarnings('ignore')

HERE = tempfile.gettempdir()
RECV_XLSM = r'C:\Users\PRH0000484\OneDrive\รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm'
SINCE = datetime.date(2026, 10, 20)  # รอบแรกที่ออกเอกสาร — รอบก่อนหน้านี้ไม่ย้อนออก
OUT_DIR = r'C:\Users\PRH0000484\Desktop\ยอดคงคลัง\เอกสารตรวจรับ'
REG = os.path.join(OUT_DIR, '_ทะเบียนเอกสารตรวจรับ.csv')
REG_COLS = ['เลขที่ใบ', 'วันที่ออก', 'วันที่ตรวจรับ', 'วันที่รับ', 'เลขที่บิล', 'บริษัท', 'สถานะการซื้อ', 'เลขที่PO',
            'จำนวนรายการ', 'มูลค่า(บาท)', 'ไม่มีรูปตรวจรับ', 'ไฟล์', 'ผู้ตรวจรับเซ็น', 'วันที่เซ็น', 'หมายเหตุ']
PRINT_REG = r'C:\Users\PRH0000484\Desktop\รวมเบิกยา\PDF\_สถานะพิมพ์.csv'
BILL_INDEX = r'C:\Users\PRH0000484\Desktop\บิลยา_ตรวจรับ\_ดัชนีบิล.csv'


def photo_keys():
    # key แยก ซื้อ/ไม่ได้ซื้อ — บิลเดียวมีทั้งแถวซื้อและของแถมรหัสเดียวกัน (ยูนีซัน 102610001212: รูปตรวจรับเป็นของแถม 16 ไม่ใช่ซื้อ 80)
    with open(BILL_INDEX, encoding='utf-8-sig', newline='') as f:
        return {(r['เลขที่บิล'].strip(), r['รหัส'].strip(), r['ประเภท'].strip() == 'ซื้อ') for r in csv.DictReader(f)
                if r['เอกสาร'].strip() == 'รูปตรวจรับ' and 'ไม่ใช่รูปตรวจรับ' not in r['หมายเหตุ']}


def parse_th(s):
    d, m, y = (int(x) for x in s.split('/'))
    return datetime.date(y - 543 if y > 2400 else y, m, d)


def cell_date(v):
    return short(v.date()) if isinstance(v, datetime.datetime) else (str(v).strip() if v not in (None, '') else '-')


def num(v):
    return float(v) if isinstance(v, (int, float)) else 0.0


def out_name(d):
    tail = f'{d.day}.{d.month}.{(d.year + 543) % 100}.pdf'
    n = 1
    while os.path.exists(os.path.join(OUT_DIR, f'สรุปตรวจรับ{n if n > 1 else ""} {tail}')):
        n += 1
    return f'สรุปตรวจรับ{n if n > 1 else ""} {tail}'


def main():
    src = arg('--file', RECV_XLSM)
    want_date = arg('--date')
    want_date = parse_th(want_date) if want_date else None
    expected = arg('--bills')
    expected = set(b.strip() for b in expected.split(',')) if expected else None
    commit = '--commit' in sys.argv
    today = datetime.date.today()

    reg_rows = []
    if os.path.exists(REG):
        with open(REG, encoding='utf-8-sig', newline='') as f:
            reg_rows = list(csv.DictReader(f))
    done = {(r['เลขที่บิล'], r['บริษัท'], r['วันที่ตรวจรับ']) for r in reg_rows}
    fy = fiscal2(today)
    nums = [int(r['เลขที่ใบ'].split('/')[1]) for r in reg_rows if r['เลขที่ใบ'].startswith(f'ตร.{fy}/')]
    doc_no = f'ตร.{fy}/{(max(nums) + 1) if nums else 1:03d}'

    ws = openpyxl.load_workbook(src, read_only=True, data_only=True)['รับยา']
    pending = OrderedDict()
    for n, r in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        if str(r[15]).strip() != 'ตรวจรับแล้ว' or not isinstance(r[16], datetime.datetime):
            continue
        qd = r[16].date()
        if qd < SINCE:
            continue
        bill = str(r[7]).strip() if r[7] not in (None, '', '-') else f'(ไม่มีเลขบิล) {r[1]}'
        sup = str(r[17] or '-').strip()
        if (bill, sup, short(qd)) in done:
            continue
        pending.setdefault(qd, []).append((n, bill, sup, r))

    if not pending:
        print(f'ไม่มีรอบตรวจรับค้างออกเอกสาร (ตรวจรับตั้งแต่ {short(SINCE)})')
        return
    if want_date is None:
        if len(pending) > 1:
            print('ค้างหลายรอบ — ระบุ --date <วันที่ตรวจรับ>:')
            for qd, lst in pending.items():
                print(f'  {short(qd)}  {len({(b, s) for _, b, s, _ in lst})} บิล {len(lst)} รายการ')
            sys.exit(1)
        want_date = next(iter(pending))
    if want_date not in pending:
        sys.exit(f'STOP: ไม่มีแถวตรวจรับ {short(want_date)} ที่ยังไม่ออกเอกสาร (ค้าง: {[short(d) for d in pending]})')
    rows = pending[want_date]
    if expected is not None:
        rows = [x for x in rows if x[1] in expected]
        got = {x[1] for x in rows}
        if got != expected:
            sys.exit(f'STOP: bills found {sorted(got)} != expected {sorted(expected)}')

    photos = photo_keys()
    bills = OrderedDict()
    for n, bill, sup, r in rows:
        ptype = str(r[4] or '-').strip()
        b = bills.setdefault((bill, sup, ptype), {'rd': r[14], 'rows': []})
        b['rows'].append({'n': n, 'name': str(r[3]).strip(), 'po': str(r[8] or '-').strip(), 'lot': str(r[5] or '-'),
                          'exp': cell_date(r[6]), 'qty': num(r[9]), 'unit': str(r[10] or ''), 'val': num(r[13]),
                          'photo': (str(r[7]).strip(), str(r[1]).strip(), ptype == 'การซื้อ') in photos})

    def sort_key(kv):
        (bill, sup, ptype), b = kv
        rd = b['rd'] if isinstance(b['rd'], datetime.datetime) else datetime.datetime.max
        return (ptype != 'การซื้อ', rd, bill)

    items = sorted(bills.items(), key=sort_key)
    total = round(sum(x['val'] for _, b in items for x in b['rows']), 2)
    nrows = sum(len(b['rows']) for _, b in items)
    nbills = len({(k[0], k[1]) for k, _ in items})
    nophoto = sum(1 for _, b in items for x in b['rows'] if not x['photo'])

    body, i, section = [], 0, None
    for (bill, sup, ptype), b in items:
        sec = 'ก. การซื้อ' if ptype == 'การซื้อ' else 'ข. ไม่ได้ซื้อ (บริจาค / สนับสนุน / ยืม / คืน / แลกเปลี่ยน)'
        if sec != section:
            section = sec
            body.append(f'<tr class="sec"><td colspan="13">{sec}</td></tr>')
        i += 1
        rws, span = b['rows'], len(b['rows'])
        sub = sum(x['val'] for x in rws)
        tag = '' if ptype == 'การซื้อ' else f'<br><span class="tag">{html.escape(ptype)}</span>'
        for j, x in enumerate(rws):
            tr = '<tr class="first">' if j == 0 else '<tr>'
            if j == 0:
                tr += (f'<td class="c" rowspan="{span}">{i}</td>'
                       f'<td class="c" rowspan="{span}">{cell_date(b["rd"])}</td>'
                       f'<td rowspan="{span}"><b>{html.escape(bill)}</b><br><span class="sm">{html.escape(sup)}</span>{tag}</td>')
            tr += (f'<td class="c">{html.escape(x["po"])}</td>'
                   f'<td>{html.escape(x["name"])}</td>'
                   f'<td class="c">{html.escape(x["lot"])}</td><td class="c">{html.escape(x["exp"])}</td>'
                   f'<td class="r">{qty(x["qty"])}</td><td class="c">{html.escape(x["unit"])}</td>'
                   f'<td class="r">{money(x["val"])}</td>')
            if j == 0:
                tr += f'<td class="r" rowspan="{span}"><b>{money(sub)}</b></td>'
            tr += ('<td class="c">มี</td>' if x['photo'] else '<td class="c nop">ไม่มี</td>') + '<td class="c"><span class="box"></span></td>'
            body.append(tr + '</tr>')

    stamp = datetime.datetime.fromtimestamp(os.path.getmtime(src))
    page = f'''<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<title>สรุปตรวจรับ {doc_no}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
<style>
@page {{ size: A4 landscape; margin: 10mm 11mm 10mm 11mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: 'Sarabun', 'TH Sarabun New', Tahoma, sans-serif; font-size: 13px; color: #000; background: #fff; margin: 0; }}
.top {{ display: flex; justify-content: space-between; align-items: flex-start; }}
h1 {{ font-size: 21px; margin: 0; }}
.hosp {{ font-size: 15px; font-weight: 700; }}
.no {{ text-align: right; font-size: 14px; line-height: 1.55; }}
.no b {{ font-size: 18px; }}
.lead {{ margin: 8px 0 7px; line-height: 1.7; }}
table {{ width: 100%; border-collapse: collapse; }}
th, td {{ border: 1px solid #000; padding: 3px 5px; vertical-align: top; }}
th {{ background: #fff; font-weight: 700; text-align: center; }}
td.c {{ text-align: center; }} td.r {{ text-align: right; white-space: nowrap; }}
.sm {{ font-size: 11.5px; }}
.tag {{ font-size: 11.5px; border: 1px solid #000; padding: 0 4px; }}
td.nop {{ font-weight: 700; background: #e6e6e6; }}
.box {{ display: inline-block; width: 15px; height: 15px; border: 1.5px solid #000; margin-top: 2px; }}
tr {{ page-break-inside: avoid; }}
tr.first td {{ border-top: 2px solid #000; }}
tr.sec {{ page-break-after: avoid; break-after: avoid; }}
tr.sec td {{ font-weight: 700; background: #f2f2f2; border-top: 2px solid #000; }}
tr.tot td {{ font-weight: 700; border-top: 2px solid #000; }}
.words {{ margin-top: 5px; }}
.ack {{ margin-top: 14px; line-height: 1.8; }}
.sig {{ display: flex; gap: 24px; margin-top: 16px; page-break-inside: avoid; }}
.sig > div {{ flex: 1; border: 1px solid #000; padding: 8px 14px; }}
.sig .t {{ font-weight: 700; text-align: center; margin-bottom: 4px; }}
.ln {{ display: flex; align-items: baseline; gap: 6px; margin-top: 14px; }}
.fl {{ display: inline-block; flex: 1; height: 1.5em; vertical-align: bottom; border-bottom: 1px dotted #000; text-align: center; }}
.foot {{ margin-top: 10px; font-size: 11px; }}
</style></head><body>
<div class="top">
  <div><div class="hosp">โรงพยาบาลประชาธิปัตย์ · คลังยา</div><h1>สรุปผลการตรวจรับพัสดุ (ยาและเวชภัณฑ์) — ผู้ตรวจรับลงนามรับทราบ</h1></div>
  <div class="no">เลขที่ <b>{doc_no}</b><br>วันที่ตรวจรับ <b>{th_date(want_date)}</b><br>วันที่ออกเอกสาร {th_date(today)}</div>
</div>
<p class="lead">คลังยาได้บันทึกสถานะ <b>"ตรวจรับแล้ว"</b> ในทะเบียนรับยา ตามที่ผู้ตรวจรับได้ตรวจรับพัสดุที่คลังยา
เมื่อวันที่ <b>{th_date(want_date)}</b> จำนวน <b>{nbills} บิล {nrows} รายการ</b> มูลค่ารวม <b>{money(total)} บาท</b>
ตามรายละเอียดดังนี้ · มีรูปตรวจรับ {nrows - nophoto} รายการ · <b>ไม่มีรูปตรวจรับ {nophoto} รายการ</b>
(ช่องพื้นเทา — ลายมือชื่อในเอกสารนี้ใช้เป็นหลักฐานการตรวจรับแทนรูป)</p>
<table>
<thead><tr><th style="width:3%">ที่</th><th style="width:7%">วันที่รับ</th><th style="width:15%">เลขที่บิล / บริษัท</th>
<th style="width:7.5%">เลขที่ PO</th><th>รายการยา</th><th style="width:7%">Lot</th><th style="width:7%">Exp</th>
<th style="width:5%">จำนวน</th><th style="width:5.5%">หน่วย</th><th style="width:7%">มูลค่า (บาท)</th><th style="width:7%">รวมบิล (บาท)</th>
<th style="width:5%">รูปตรวจรับ</th><th style="width:5.5%">ผู้ตรวจรับ ✓</th></tr></thead>
<tbody>{''.join(body)}
<tr class="tot"><td colspan="9" class="r">รวมทั้งสิ้น {nbills} บิล {nrows} รายการ</td><td colspan="2" class="r">{money(total)}</td>
<td colspan="2" class="c">ไม่มีรูป {nophoto}</td></tr></tbody>
</table>
<div class="words">({bahttext(total)})</div>
<div class="ack">ข้าพเจ้าได้ตรวจรับพัสดุตามรายการที่ทำเครื่องหมาย ✓ ไว้แล้ว และรับทราบการบันทึกผลการตรวจรับของคลังยาตามเอกสารนี้
(รายการที่ไม่ได้ทำเครื่องหมาย ✓ โปรดระบุเหตุผล) <span class="fl" style="display:inline-block;width:330px;flex:none"></span></div>
<div class="sig">
  <div><div class="t">ผู้บันทึก (คลังยา)</div>
    <div class="ln">ลงชื่อ <span class="fl"></span></div>
    <div class="ln" style="justify-content:center">( {SENDER[0]} )</div>
    <div class="ln" style="justify-content:center">ตำแหน่ง {SENDER[1]}</div>
    <div class="ln">วันที่ <span class="fl"></span></div></div>
  <div><div class="t">ผู้ตรวจรับ (กรรมการตรวจรับ) — ลงนามรับทราบ</div>
    <div class="ln">ลงชื่อ <span class="fl"></span></div>
    <div class="ln">( <span class="fl"></span> )</div>
    <div class="ln">ตำแหน่ง <span class="fl"></span></div>
    <div class="ln">วันที่ <span class="fl"></span></div></div>
</div>
<div class="foot">ข้อมูลจากชีท 'รับยา' ไฟล์ รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm (บันทึกล่าสุด {short(stamp.date())} {stamp:%H:%M})
· สถานะตรวจรับ = ตรวจรับแล้ว · วันที่ตรวจรับ {short(want_date)} · ทะเบียน เอกสารตรวจรับ\\_ทะเบียนเอกสารตรวจรับ.csv</div>
</body></html>'''

    fname = out_name(want_date)
    html_path = os.path.join(HERE, 'inspection_ack.html')
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(page)
    pdf_tmp = os.path.join(HERE, 'inspection_ack.pdf')
    if os.path.exists(pdf_tmp):
        os.remove(pdf_tmp)
    subprocess.run([EDGE, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                    '--virtual-time-budget=15000', f'--print-to-pdf={pdf_tmp}',
                    'file:///' + html_path.replace('\\', '/')], check=True, timeout=120)
    for _ in range(60):  # Edge ที่เปิดค้างอยู่คืนทันที PDF มาตามหลัง (ดู bill_handover.py)
        if os.path.exists(pdf_tmp) and os.path.getsize(pdf_tmp) >= 5000:
            break
        time.sleep(0.5)
    if not os.path.exists(pdf_tmp) or os.path.getsize(pdf_tmp) < 5000:
        sys.exit('STOP: PDF not produced')

    print(f'doc {doc_no} · ตรวจรับ {short(want_date)} · {nbills} bills · {nrows} rows · ไม่มีรูป {nophoto} · total {money(total)} · {bahttext(total)}')
    for (bill, sup, ptype), b in items:
        print(f'  {cell_date(b["rd"])} {bill} {sup} [{ptype}] rows={[x["n"] for x in b["rows"]]} '
              f'nophoto={[x["n"] for x in b["rows"] if not x["photo"]]} sum={money(sum(x["val"] for x in b["rows"]))}')
    others = [d for d in pending if d != want_date]
    if others:
        print('ยังค้างรอบอื่น:', ', '.join(short(d) for d in others))
    print('preview:', pdf_tmp, '->', fname)

    if not commit:
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    dest = os.path.join(OUT_DIR, fname)
    if os.path.exists(dest):
        sys.exit(f'STOP: {dest} exists')
    with open(pdf_tmp, 'rb') as a, open(dest, 'wb') as b:
        b.write(a.read())
    new_rows = [{'เลขที่ใบ': doc_no, 'วันที่ออก': short(today), 'วันที่ตรวจรับ': short(want_date),
                 'วันที่รับ': cell_date(b['rd']), 'เลขที่บิล': bill, 'บริษัท': sup, 'สถานะการซื้อ': ptype,
                 'เลขที่PO': ', '.join(sorted({x['po'] for x in b['rows']})), 'จำนวนรายการ': len(b['rows']),
                 'มูลค่า(บาท)': f'{sum(x["val"] for x in b["rows"]):.2f}',
                 'ไม่มีรูปตรวจรับ': sum(1 for x in b['rows'] if not x['photo']), 'ไฟล์': fname,
                 'ผู้ตรวจรับเซ็น': '', 'วันที่เซ็น': '', 'หมายเหตุ': ''}
                for (bill, sup, ptype), b in items]
    new = not os.path.exists(REG)
    with open(REG, 'a', encoding='utf-8-sig' if new else 'utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=REG_COLS)
        if new:
            w.writeheader()
        w.writerows(new_rows)
    now = datetime.datetime.now()
    with open(PRINT_REG, 'a', encoding='utf-8', newline='') as f:
        f.write(f'{short(now.date())} {now:%H:%M},{dest},,\r\n')
    print('COMMITTED', dest, REG, '+ คิวพิมพ์ → รัน python scripts/print-queue.py')


if __name__ == '__main__':
    main()
