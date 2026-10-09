"""ใบส่งบิลจัดซื้อ (สบ.<ปีงบ>/<ลำดับ>) — อ่านชีท 'รับยา' (read-only) → HTML → PDF + ทะเบียน CSV
usage: python scripts/bill_handover.py [--bills b1,b2] [--since YYYY-MM-DD] [--file <recv.xlsm>] [--commit]
ไม่ระบุ --bills = ส่งทุกบิลการซื้อที่ยังไม่อยู่ในทะเบียน (วันรับตั้งแต่ --since, ค่าเริ่ม 05/10/2569)
ระบุ --bills = ด่านกัน: บิลที่หาเจอต้องตรงชุดนี้เป๊ะ ไม่งั้นหยุด
ไม่มี --commit = สร้าง HTML/PDF ใน temp อย่างเดียว ไม่แตะโฟลเดอร์จริง/ทะเบียน
ส่งรอบ 2+ ในวันเดียว → ส่งบิล2 <ว.ด.ปป>.pdf, ส่งบิล3 … (ตามชื่อไฟล์เดิมของคลัง)
"""
import sys, os, csv, html, datetime, subprocess, tempfile, time, warnings
from collections import OrderedDict
import openpyxl
sys.stdout.reconfigure(encoding='utf-8')
warnings.filterwarnings('ignore')

HERE = tempfile.gettempdir()
RECV_XLSM = r'C:\Users\PRH0000484\OneDrive\รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm'
SINCE = datetime.date(2026, 10, 5)  # ใบแรก สบ.70/001 — ตรงกับ HANDOVER_SINCE ใน check-complete.py
OUT_DIR = r'C:\Users\PRH0000484\Desktop\ยอดคงคลัง\ส่งบิลให้พี่โก้'
REG = os.path.join(OUT_DIR, '_ทะเบียนส่งบิลจัดซื้อ.csv')
REG_COLS = ['เลขที่ใบ', 'วันที่ส่ง', 'วันที่รับ', 'เลขที่บิล', 'บริษัท', 'เลขที่PO', 'จำนวนรายการ',
            'มูลค่า(บาท)', 'ไฟล์ใบส่ง', 'จัดซื้อเซ็นรับ', 'วันที่เซ็นรับ', 'หมายเหตุ']
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
SENDER = ('นายนพคุณ ฉายขุนทด', 'เจ้าพนักงานเภสัชกรรมปฏิบัติงาน')
MONTHS = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม',
          'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

DIG = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
POS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']


def _read(n):
    if n >= 1_000_000:
        return _read(n // 1_000_000) + 'ล้าน' + _read(n % 1_000_000)
    s, digits = '', str(n)
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if d == 0:
            continue
        if i == 1 and d == 1:
            w = 'สิบ'
        elif i == 1 and d == 2:
            w = 'ยี่สิบ'
        elif i == 0 and d == 1 and len(digits) > 1:
            w = 'เอ็ด'
        else:
            w = DIG[d] + POS[i]
        s = w + s
    return s


def bahttext(x):
    satang_total = round(x * 100)
    baht, satang = divmod(satang_total, 100)
    out = (_read(baht) or 'ศูนย์') + 'บาท'
    return out + (_read(satang) + 'สตางค์' if satang else 'ถ้วน')


def th_date(d):
    return f'{d.day} {MONTHS[d.month]} {d.year + 543}'


def short(d):
    return f'{d.day:02d}/{d.month:02d}/{d.year + 543}'


def fiscal2(d):
    return (d.year + 543 + (1 if d.month >= 10 else 0)) % 100


def money(v):
    return f'{v:,.2f}'


def qty(v):
    return f'{v:,.0f}' if float(v).is_integer() else f'{v:,.2f}'


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def out_name(d):
    tail = f'{d.day}.{d.month}.{(d.year + 543) % 100}.pdf'
    n = 1
    while os.path.exists(os.path.join(OUT_DIR, f'ส่งบิล{n if n > 1 else ""} {tail}')):
        n += 1
    return f'ส่งบิล{n if n > 1 else ""} {tail}'


def main():
    src = arg('--file', RECV_XLSM)
    since = datetime.date.fromisoformat(arg('--since', SINCE.isoformat()))
    expected = arg('--bills')
    expected = set(b.strip() for b in expected.split(',')) if expected else None
    commit = '--commit' in sys.argv
    today = datetime.date.today()

    reg_rows = []
    if os.path.exists(REG):
        with open(REG, encoding='utf-8-sig', newline='') as f:
            reg_rows = list(csv.DictReader(f))
    sent_keys = {(r['เลขที่บิล'], r['วันที่รับ']) for r in reg_rows}
    fy = fiscal2(today)
    nums = [int(r['เลขที่ใบ'].split('/')[1]) for r in reg_rows if r['เลขที่ใบ'].startswith(f'สบ.{fy}/')]
    doc_no = f'สบ.{fy}/{(max(nums) + 1) if nums else 1:03d}'

    ws = openpyxl.load_workbook(src, read_only=True, data_only=True)['รับยา']
    bills = OrderedDict()
    for n, r in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        if r[4] != 'การซื้อ' or not isinstance(r[14], datetime.datetime):
            continue
        rd = r[14].date()
        if rd < since:
            continue
        bill = str(r[7]).strip()
        key = (bill, short(rd))
        if key in sent_keys:
            continue
        b = bills.setdefault((bill, str(r[17]).strip(), rd), {'rows': []})
        b['rows'].append({'n': n, 'name': str(r[3]).strip(), 'po': str(r[8] or '-').strip(),
                          'lot': str(r[5]), 'qty': float(r[9]), 'unit': str(r[10]), 'val': float(r[13]),
                          'status': str(r[15]).strip()})

    if not bills:
        print(f'ไม่มีบิลการซื้อค้างส่ง (วันรับตั้งแต่ {short(since)})')
        return
    got = {k[0] for k in bills}
    if expected is not None and got != expected:
        sys.exit(f'STOP: bills found {sorted(got)} != expected {sorted(expected)}')
    for k, b in bills.items():
        if any(x['po'] in ('', 'None') for x in b['rows']):
            sys.exit(f'STOP: blank PO cell {k}')

    items = sorted(bills.items(), key=lambda kv: (kv[0][2], kv[0][0]))
    total = round(sum(x['val'] for _, b in items for x in b['rows']), 2)
    nrows = sum(len(b['rows']) for _, b in items)

    body = []
    for i, ((bill, sup, rd), b) in enumerate(items, 1):
        rows, span = b['rows'], len(b['rows'])
        sub = sum(x['val'] for x in rows)
        pos = sorted({x['po'] for x in rows})
        for j, x in enumerate(rows):
            tr = '<tr class="first">' if j == 0 else '<tr>'
            if j == 0:
                tr += (f'<td class="c" rowspan="{span}">{i}</td>'
                       f'<td class="c" rowspan="{span}">{short(rd)}</td>'
                       f'<td rowspan="{span}"><b>{html.escape(bill)}</b><br><span class="sm">{html.escape(sup)}</span></td>')
            tr += (f'<td>{html.escape(x["name"])}</td>'
                   f'<td class="c">{html.escape(x["po"])}</td>'
                   f'<td class="r">{qty(x["qty"])}</td><td class="c">{html.escape(x["unit"])}</td>'
                   f'<td class="r">{money(x["val"])}</td>')
            if j == 0:
                tr += f'<td class="r" rowspan="{span}"><b>{money(sub)}</b></td>'
            body.append(tr + '</tr>')

    stamp = datetime.datetime.fromtimestamp(os.path.getmtime(src))
    pending = all(x['status'] == 'รอตรวจรับ' for _, b in items for x in b['rows'])
    note = ' (ยังไม่ได้ตรวจรับ)' if pending else ''
    page = f'''<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<title>ใบส่งบิลจัดซื้อ {doc_no}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
<style>
@page {{ size: A4 portrait; margin: 12mm 11mm 12mm 11mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: 'Sarabun', 'TH Sarabun New', Tahoma, sans-serif; font-size: 13.5px; color: #000; background: #fff; margin: 0; }}
.top {{ display: flex; justify-content: space-between; align-items: flex-start; }}
h1 {{ font-size: 21px; margin: 0; }}
.hosp {{ font-size: 15px; font-weight: 700; }}
.no {{ text-align: right; font-size: 15px; line-height: 1.6; }}
.no b {{ font-size: 18px; }}
.lead {{ margin: 10px 0 8px; line-height: 1.7; }}
table {{ width: 100%; border-collapse: collapse; }}
th, td {{ border: 1px solid #000; padding: 4px 5px; vertical-align: top; }}
th {{ background: #fff; font-weight: 700; text-align: center; }}
td.c {{ text-align: center; }} td.r {{ text-align: right; white-space: nowrap; }}
.sm {{ font-size: 12px; }}
tr {{ page-break-inside: avoid; }}
tr.first td {{ border-top: 2px solid #000; }}
tfoot td {{ font-weight: 700; border-top: 2px solid #000; }}
.words {{ margin-top: 6px; }}
.ack {{ margin-top: 18px; line-height: 1.8; }}
.sig {{ display: flex; gap: 24px; margin-top: 22px; page-break-inside: avoid; }}
.sig > div {{ flex: 1; border: 1px solid #000; padding: 10px 14px; }}
.sig .t {{ font-weight: 700; text-align: center; margin-bottom: 6px; }}
.ln {{ display: flex; align-items: baseline; gap: 6px; margin-top: 16px; }}
.fl {{ display: inline-block; flex: 1; height: 1.5em; vertical-align: bottom; border-bottom: 1px dotted #000; text-align: center; }}
.fl.w {{ flex: 0 0 auto; width: 34px; }}
.foot {{ margin-top: 12px; font-size: 11px; }}
</style></head><body>
<div class="top">
  <div><div class="hosp">โรงพยาบาลประชาธิปัตย์ · คลังยา</div><h1>ใบส่งบิลซื้อยาให้งานจัดซื้อ</h1></div>
  <div class="no">เลขที่ <b>{doc_no}</b><br>วันที่ส่ง {th_date(today)}</div>
</div>
<p class="lead">คลังยาขอส่งบิลซื้อยาที่รับของเข้าคลังแล้ว{note} ให้งานจัดซื้อ
จำนวน <b>{len(items)} บิล {nrows} รายการ</b> มูลค่ารวม <b>{money(total)} บาท</b> ตามรายละเอียดดังนี้</p>
<table>
<thead><tr><th style="width:5%">ที่</th><th style="width:10%">วันที่รับ</th><th style="width:20%">เลขที่บิล / บริษัท</th>
<th>รายการยา</th><th style="width:10%">เลขที่ PO</th><th style="width:7%">จำนวน</th><th style="width:8%">หน่วย</th>
<th style="width:10%">มูลค่า (บาท)</th><th style="width:10%">รวมบิล (บาท)</th></tr></thead>
<tbody>{''.join(body)}</tbody>
<tfoot><tr><td colspan="7" class="r">รวมทั้งสิ้น {len(items)} บิล {nrows} รายการ</td><td colspan="2" class="r">{money(total)}</td></tr></tfoot>
</table>
<div class="words">({bahttext(total)})</div>
<div class="ack">ข้าพเจ้าได้รับบิลตามรายการข้างต้น จำนวน <span class="fl w"></span> ฉบับ
ไว้แล้ว เมื่อวันที่ <span class="fl" style="display:inline-block;width:120px;flex:none"></span>
เวลา <span class="fl" style="display:inline-block;width:70px;flex:none"></span> น.</div>
<div class="sig">
  <div><div class="t">ผู้ส่งบิล (คลังยา)</div>
    <div class="ln">ลงชื่อ <span class="fl"></span></div>
    <div class="ln" style="justify-content:center">( {SENDER[0]} )</div>
    <div class="ln" style="justify-content:center">ตำแหน่ง {SENDER[1]}</div>
    <div class="ln">วันที่ <span class="fl"></span></div></div>
  <div><div class="t">ผู้รับบิล (งานจัดซื้อ)</div>
    <div class="ln">ลงชื่อ <span class="fl"></span></div>
    <div class="ln">( <span class="fl"></span> )</div>
    <div class="ln">ตำแหน่ง <span class="fl"></span></div>
    <div class="ln">วันที่ <span class="fl"></span></div></div>
</div>
<div class="foot">ข้อมูลจากชีท 'รับยา' ไฟล์ รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm (บันทึกล่าสุด {short(stamp.date())} {stamp:%H:%M})
· เฉพาะสถานะการซื้อ = การซื้อ · ทะเบียน _ทะเบียนส่งบิลจัดซื้อ.csv</div>
</body></html>'''

    fname = out_name(today)
    html_path = os.path.join(HERE, 'bill_handover.html')
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(page)
    pdf_tmp = os.path.join(HERE, 'bill_handover.pdf')
    if os.path.exists(pdf_tmp):
        os.remove(pdf_tmp)
    subprocess.run([EDGE, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                    '--virtual-time-budget=15000', f'--print-to-pdf={pdf_tmp}',
                    'file:///' + html_path.replace('\\', '/')], check=True, timeout=120)
    # Edge ที่เปิดค้างอยู่รับงานต่อแล้วคืนทันที — PDF มาตามหลัง 1–4 วิ (09/10/2569)
    for _ in range(60):
        if os.path.exists(pdf_tmp) and os.path.getsize(pdf_tmp) >= 5000:
            break
        time.sleep(0.5)
    if not os.path.exists(pdf_tmp) or os.path.getsize(pdf_tmp) < 5000:
        sys.exit('STOP: PDF not produced')

    print(f'doc {doc_no} · {len(items)} bills · {nrows} rows · total {money(total)} · {bahttext(total)}')
    for (bill, sup, rd), b in items:
        print(f'  {short(rd)} {bill} {sup} rows={[x["n"] for x in b["rows"]]} sum={money(sum(x["val"] for x in b["rows"]))}')
    print('preview:', pdf_tmp, '->', fname)

    if not commit:
        return
    dest = os.path.join(OUT_DIR, fname)
    if os.path.exists(dest):
        sys.exit(f'STOP: {dest} exists')
    with open(pdf_tmp, 'rb') as a, open(dest, 'wb') as b:
        b.write(a.read())
    new = not os.path.exists(REG)
    with open(REG, 'a', encoding='utf-8-sig' if new else 'utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=REG_COLS)
        if new:
            w.writeheader()
        for (bill, sup, rd), b in items:
            w.writerow({'เลขที่ใบ': doc_no, 'วันที่ส่ง': short(today), 'วันที่รับ': short(rd), 'เลขที่บิล': bill,
                        'บริษัท': sup, 'เลขที่PO': ', '.join(sorted({x['po'] for x in b['rows']})),
                        'จำนวนรายการ': len(b['rows']), 'มูลค่า(บาท)': f'{sum(x["val"] for x in b["rows"]):.2f}',
                        'ไฟล์ใบส่ง': fname, 'จัดซื้อเซ็นรับ': '', 'วันที่เซ็นรับ': '', 'หมายเหตุ': ''})
    print('COMMITTED', dest, REG)


if __name__ == '__main__':
    main()
