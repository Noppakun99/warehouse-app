"""เอกสารสรุปตรวจรับ (ตร.<ปีงบ>/<ลำดับ>) ให้ผู้ตรวจรับเซ็นรับทราบ — อ่านชีท 'รับยา' (read-only) → HTML → PDF + ทะเบียน CSV
usage: python scripts/inspection_ack.py [--date DD/MM/YYYY] [--bills b1,b2] [--file <recv.xlsm>] [--commit]
1 ใบ = 1 รอบตรวจรับ (วันที่ตรวจรับ Q เดียวกัน) · **เฉพาะแถว การซื้อ** — ของแถม/บริจาค/สนับสนุน/ยืม/คืน ไม่ต้องให้ผู้ตรวจรับยาซื้อเซ็น
  (user 21/10/2569 — เดิมรวมทุกสถานะแยกหัวข้อ · ของไม่ได้ซื้อมีเอกสารของตัวเอง เช่น ใบของแถม / ใบตรวจรับพัสดุของ สสจ.)
  --date   = วันที่ตรวจรับ (พ.ศ.) ของรอบที่จะออก — ไม่ระบุ: ถ้าค้างรอบเดียวใช้รอบนั้น ค้างหลายรอบ = หยุดให้เลือก
  --bills  = ออกเฉพาะบิลชุดนี้ (กรรมการคนละคนในวันเดียวกัน → แยกใบ) — บิลที่ระบุต้องเจอครบ ไม่งั้นหยุด
  --all    = รวมทุกรอบที่ค้างในใบเดียว (มีคอลัมน์วันที่ตรวจรับรายบิล — ตร.70/002 รวม 05–20/10/2569)
  --reissue ตร.70/xxx = ออกใบเดิมใหม่ เลขที่/ชื่อไฟล์/แถวคิวพิมพ์เดิม — หยุดถ้าผู้ตรวจรับเซ็นแล้วหรือคิวพิมพ์ติ๊กแล้ว
  --doc-no ตร.70/xxx = ใช้เลขที่ที่ทั้งใบเป็นใบยกเลิก (user สั่งเท่านั้น — ค่าเริ่มต้นห้ามใช้เลขยกเลิกซ้ำ)
  --reshoot-date-ok = ยืนยันแล้วว่ารูปถ่ายซ้ำที่วันถ่ายตรงวันตรวจรับในชีท ลงวันถูก (ไม่ใส่ = commit หยุด)
  ไม่มี --commit = สร้าง PDF ใน temp อย่างเดียว ไม่แตะโฟลเดอร์จริง/ทะเบียน/คิวพิมพ์
  --commit = PDF → Desktop\\ยอดคงคลัง\\เอกสารตรวจรับ + แถวทะเบียน + แถวคิวพิมพ์ (_สถานะพิมพ์.csv) → แล้วรัน print-queue.py
รายการในใบ = เฉพาะแถวที่มีรูปตรวจรับ (บิลอยู่ในภาพ) — แถวเอกสาร=รูปตรวจรับ ใน _ดัชนีบิล.csv ที่ (เลขบิล, รหัส, ซื้อ?) ตรงกัน
  ไม่นับรูป "รอถ่ายซ้ำ" (ไม่มีบิลในภาพ) · แถวไม่มีรูป = ไม่อยู่ในใบ คงสถานะตรวจรับแล้ว (CONTEXT §เอกสารสรุปตรวจรับ 21/10/2569)
ทะเบียนนับซ้ำรายแถว (เลขบิล, บริษัท, วันที่ตรวจรับ, ซื้อ?, รหัส — ช่อง รหัสยา) ไม่นับใบที่หมายเหตุ "ยกเลิก"
  → รูปถ่ายซ้ำที่มาทีหลัง = ใบเลขใหม่ของวันตรวจรับเดิม (ไม่ต้องรอรูปครบรอบ) · แถวทะเบียนเก่าที่ไม่มีรหัสยา = ทั้งบิล
ช่อง ✓ ให้ผู้ตรวจรับติ๊กรายตัว → รูปใบเซ็นเข้าโฟลเดอร์พัก ผู้ตรวจรับเซ็น\\
  → ติ๊กทะเบียน (ผู้ตรวจรับเซ็น/วันที่เซ็น) → ย้ายรูปไป เอกสารตรวจรับ\\เซ็นแล้ว\\ · check-complete ตรวจข้อนี้
"""
import sys, os, re, csv, html, shutil, datetime, subprocess, tempfile, time, warnings
from collections import OrderedDict
import openpyxl
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bill_handover import bahttext, th_date, short, fiscal2, money, qty, arg, EDGE, SENDER  # noqa: E402
sys.stdout.reconfigure(encoding='utf-8')
warnings.filterwarnings('ignore')

HERE = tempfile.gettempdir()
RECV_XLSM = r'C:\Users\PRH0000484\OneDrive\รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm'
SINCE = datetime.date(2026, 10, 1)  # ต้นปีงบ 70 — รอบ 05–15/10 ออกย้อนรวมใน ตร.70/002 (user 21/10/2569)
OUT_DIR = r'C:\Users\PRH0000484\Desktop\ยอดคงคลัง\เอกสารตรวจรับ'
REG = os.path.join(OUT_DIR, '_ทะเบียนเอกสารตรวจรับ.csv')
REG_COLS = ['เลขที่ใบ', 'วันที่ออก', 'วันที่ตรวจรับ', 'วันที่รับ', 'เลขที่บิล', 'บริษัท', 'สถานะการซื้อ', 'เลขที่PO',
            'จำนวนรายการ', 'มูลค่า(บาท)', 'ไม่มีรูปตรวจรับ', 'ไฟล์', 'ผู้ตรวจรับเซ็น', 'วันที่เซ็น', 'หมายเหตุ', 'รหัสยา']
PRINT_REG = r'C:\Users\PRH0000484\Desktop\รวมเบิกยา\PDF\_สถานะพิมพ์.csv'
BILL_INDEX = r'C:\Users\PRH0000484\Desktop\บิลยา_ตรวจรับ\_ดัชนีบิล.csv'
INSPECTOR = ('น.ส.พรรณศิริ สลางสิงห์', 'จพง.เภสัชกรรมปฏิบัติงาน')  # ผู้ตรวจรับยาซื้อ (user 21/10/2569)
RESHOOT_DATE = re.compile(r'ถ่ายซ้ำ[^\d·]*?(\d{1,2}/\d{1,2}/\d{4})')


def photo_index():
    """{(เลขบิล, รหัส, ซื้อ?): วันถ่ายซ้ำ 'dd/mm/yyyy' หรือ None (รูปที่ถ่ายตอนตรวจ)} — ใช้ร่วมกับ check-complete.py
    key แยก ซื้อ/ไม่ได้ซื้อ — บิลเดียวมีทั้งแถวซื้อและของแถมรหัสเดียวกัน (ยูนีซัน 102610001212: รูปตรวจรับเป็นของแถม 16 ไม่ใช่ซื้อ 80)
    รูป "รอถ่ายซ้ำ" ไม่มีบิลในภาพ = ไม่ใช่หลักฐานแม้แก้เป็น "ถ่ายซ้ำแล้ว" แล้ว — หลักฐานคือแถวรูปถ่ายซ้ำที่เพิ่มแยก
    (Nicardipine 126100028: แถวเดิม "ถ่ายซ้ำแล้ว 21/10" = วันได้รูป · แถวถ่ายซ้ำ "รูปถ่ายพร้อมเอกสารบิล 20/10")"""
    out = {}
    with open(BILL_INDEX, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            note = r['หมายเหตุ']
            if r['เอกสาร'].strip() != 'รูปตรวจรับ' or 'ไม่ใช่รูปตรวจรับ' in note or 'รอถ่ายซ้ำ' in note:
                continue
            m = RESHOOT_DATE.search(note) if 'ถ่ายซ้ำ' in note else None
            d = None
            if m:
                dd, mm, yy = m.group(1).split('/')
                d = f'{int(dd):02d}/{int(mm):02d}/{yy}'
            key = (r['เลขที่บิล'].strip(), r['รหัส'].strip(), r['ประเภท'].strip() == 'ซื้อ')
            out[key] = out.get(key) or d
    return out


def is_cancelled(r):
    return 'ยกเลิก' in (r.get('หมายเหตุ') or '')


def issued(reg_rows):
    """รายการที่ออกใบแล้ว (ไม่นับใบยกเลิก) — {(บิล, บริษัท, วันตรวจรับ, ซื้อ?): set(รหัส) หรือ None = ทั้งบิล (แถวก่อนมีช่อง รหัสยา)}"""
    out = {}
    for r in reg_rows:
        if is_cancelled(r):
            continue
        k = (r['เลขที่บิล'].strip(), r['บริษัท'].strip(), r['วันที่ตรวจรับ'].strip(), r['สถานะการซื้อ'].strip() == 'การซื้อ')
        codes = {c.strip() for c in (r.get('รหัสยา') or '').split(',') if c.strip()}
        if not codes or (k in out and out[k] is None):
            out[k] = None
        else:
            out.setdefault(k, set()).update(codes)
    return out


def is_issued(iss, bill, sup, qd, code, purchase):
    s = iss.get((bill, sup, qd, purchase), set())
    return s is None or code in s


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
    # ชื่อไฟล์ของใบยกเลิกก็ห้ามซ้ำ — คิวพิมพ์ copy ด้วยชื่อไฟล์
    while any(os.path.exists(os.path.join(OUT_DIR, sub, f'สรุปตรวจรับ{n if n > 1 else ""} {tail}')) for sub in ('', 'ยกเลิก')):
        n += 1
    return f'สรุปตรวจรับ{n if n > 1 else ""} {tail}'


def main():
    src = arg('--file', RECV_XLSM)
    want_date = arg('--date')
    want_date = parse_th(want_date) if want_date else None
    take_all = '--all' in sys.argv
    expected = arg('--bills')
    expected = set(b.strip() for b in expected.split(',')) if expected else None
    reissue = arg('--reissue')
    commit = '--commit' in sys.argv
    today = datetime.date.today()

    reg_rows = []
    if os.path.exists(REG):
        with open(REG, encoding='utf-8-sig', newline='') as f:
            reg_rows = list(csv.DictReader(f))
    fy = fiscal2(today)
    # เลขที่ใบยกเลิกก็นับ — ห้ามใช้ซ้ำ
    nums = [int(r['เลขที่ใบ'].split('/')[1]) for r in reg_rows if r['เลขที่ใบ'].startswith(f'ตร.{fy}/')]
    doc_no = f'ตร.{fy}/{(max(nums) + 1) if nums else 1:03d}'
    # --doc-no = ใช้เลขที่ที่เคยออกแล้วยกเลิกทั้งใบซ้ำ — เฉพาะเมื่อ user สั่ง (ตร.70/001 ยกเลิกก่อนพิมพ์ → user ให้เริ่มใหม่ที่ 001 · 22/10/2569)
    want_no = arg('--doc-no')
    if want_no:
        if '--reissue' in sys.argv:
            sys.exit('STOP: --doc-no ใช้คู่กับ --reissue ไม่ได้')
        if not re.fullmatch(rf'ตร\.{fy}/\d{{3}}', want_no):
            sys.exit(f'STOP: --doc-no ต้องเป็นรูป ตร.{fy}/xxx')
        if any(r['เลขที่ใบ'] == want_no and not is_cancelled(r) for r in reg_rows):
            sys.exit(f'STOP: {want_no} ยังใช้อยู่ในทะเบียน (ไม่ใช่ใบยกเลิก)')
        doc_no = want_no
    old, fname_fixed, queued = [], None, False
    if reissue:
        # ออกใบเดิมใหม่ (เลขที่/ชื่อไฟล์เดิม) — เฉพาะใบที่ยังไม่พิมพ์และผู้ตรวจรับยังไม่เซ็น
        old = [r for r in reg_rows if r['เลขที่ใบ'] == reissue and not is_cancelled(r)]
        if not old:
            sys.exit(f'STOP: ไม่มี {reissue} ในทะเบียน (หรือยกเลิกแล้ว)')
        if any(r['ผู้ตรวจรับเซ็น'].strip() for r in old):
            sys.exit(f'STOP: {reissue} ผู้ตรวจรับเซ็นแล้ว — ออกใบใหม่แทนไม่ได้')
        doc_no, fname_fixed = reissue, old[0]['ไฟล์']
        with open(PRINT_REG, encoding='utf-8-sig', newline='') as f:
            for q in csv.DictReader(f):
                if os.path.normcase(q['ไฟล์ (ใต้ รวมเบิกยา\\PDF)']) == os.path.normcase(os.path.join(OUT_DIR, fname_fixed)):
                    if q['พิมพ์แล้ว'].strip():
                        sys.exit(f'STOP: {reissue} คิวพิมพ์ติ๊กว่า "{q["พิมพ์แล้ว"]}" แล้ว — ถาม user ก่อน')
                    queued = True
    iss = issued([r for r in reg_rows if r not in old])

    photos = photo_index()
    ws = openpyxl.load_workbook(src, read_only=True, data_only=True)['รับยา']
    pending, nophoto = OrderedDict(), OrderedDict()
    for n, r in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        if str(r[15]).strip() != 'ตรวจรับแล้ว' or not isinstance(r[16], datetime.datetime):
            continue
        qd = r[16].date()
        if qd < SINCE:
            continue
        bill = str(r[7]).strip() if r[7] not in (None, '', '-') else f'(ไม่มีเลขบิล) {r[1]}'
        sup = str(r[17] or '-').strip()
        code, purchase = str(r[1]).strip(), str(r[4] or '').strip() == 'การซื้อ'
        if not purchase or is_issued(iss, bill, sup, short(qd), code, purchase):
            continue
        has_photo = (str(r[7]).strip(), code, purchase) in photos
        (pending if has_photo else nophoto).setdefault(qd, []).append((n, bill, sup, r))
    pending = OrderedDict(sorted(pending.items()))

    def show_nophoto(dates):
        for qd in dates:
            lst = nophoto.get(qd, [])
            if lst:
                print(f'ไม่อยู่ในใบ — ตรวจรับ {short(qd)} ยังไม่มีรูปตรวจรับ {len(lst)} รายการ '
                      f'(ถ่ายซ้ำได้เฉพาะบิลเดือนปัจจุบัน): ' + ', '.join(f'รับยา!{n} {b}' for n, b, _, _ in lst))

    if not pending:
        print(f'ไม่มีรายการที่มีรูปตรวจรับค้างออกเอกสาร (ตรวจรับตั้งแต่ {short(SINCE)})')
        show_nophoto(nophoto)
        return
    if take_all:
        dates = list(pending)
    else:
        if want_date is None:
            if len(pending) > 1:
                print('ค้างหลายรอบ — ระบุ --date <วันที่ตรวจรับ> หรือ --all (รวมทุกรอบในใบเดียว):')
                for qd, lst in pending.items():
                    print(f'  {short(qd)}  {len({(b, s) for _, b, s, _ in lst})} บิล {len(lst)} รายการ')
                sys.exit(1)
            want_date = next(iter(pending))
        if want_date not in pending:
            sys.exit(f'STOP: ไม่มีแถวตรวจรับ {short(want_date)} ที่ยังไม่ออกเอกสาร (ค้าง: {[short(d) for d in pending]})')
        dates = [want_date]
    rows = [(qd, *x) for qd in dates for x in pending[qd]]
    if expected is not None:
        rows = [x for x in rows if x[2] in expected]
        got = {x[2] for x in rows}
        if got != expected:
            sys.exit(f'STOP: bills found {sorted(got)} != expected {sorted(expected)}')
    dates = sorted({x[0] for x in rows})
    d0, d1 = dates[0], dates[-1]
    multi = d0 != d1
    when = th_date(d0) if not multi else f'{th_date(d0)} – {th_date(d1)}'

    bills = OrderedDict()
    same_day = []  # รูปถ่ายซ้ำที่วันถ่าย = วันตรวจรับในชีท → อาจเผลอเอาวันถ่ายซ้ำไปลงเป็นวันตรวจรับ
    for qd, n, bill, sup, r in rows:
        ptype = str(r[4] or '-').strip()
        code = str(r[1]).strip()
        if photos[(str(r[7]).strip(), code, ptype == 'การซื้อ')] == short(qd):
            same_day.append(f'รับยา!{n} {bill} {str(r[3]).strip()} (ตรวจรับ {short(qd)})')
        b = bills.setdefault((qd, bill, sup, ptype), {'rd': r[14], 'rows': []})
        b['rows'].append({'n': n, 'code': code, 'name': str(r[3]).strip(), 'po': str(r[8] or '-').strip(),
                          'lot': str(r[5] or '-'), 'exp': cell_date(r[6]), 'qty': num(r[9]), 'unit': str(r[10] or ''),
                          'val': num(r[13])})

    def sort_key(kv):
        (qd, bill, sup, ptype), b = kv
        rd = b['rd'] if isinstance(b['rd'], datetime.datetime) else datetime.datetime.max
        return (ptype != 'การซื้อ', qd, rd, bill)

    items = sorted(bills.items(), key=sort_key)
    total = round(sum(x['val'] for _, b in items for x in b['rows']), 2)
    nrows = sum(len(b['rows']) for _, b in items)
    nbills = len({(k[1], k[2]) for k, _ in items})
    ncol = 12 if multi else 11

    body, i, section = [], 0, None
    for (qd, bill, sup, ptype), b in items:
        sec = 'ก. การซื้อ' if ptype == 'การซื้อ' else 'ข. ไม่ได้ซื้อ (บริจาค / สนับสนุน / ยืม / คืน / แลกเปลี่ยน)'
        if sec != section:
            section = sec
            body.append(f'<tr class="sec"><td colspan="{ncol}">{sec}</td></tr>')
        i += 1
        rws, span = b['rows'], len(b['rows'])
        sub = sum(x['val'] for x in rws)
        tag = '' if ptype == 'การซื้อ' else f'<br><span class="tag">{html.escape(ptype)}</span>'
        for j, x in enumerate(rws):
            tr = '<tr class="first">' if j == 0 else '<tr>'
            if j == 0:
                tr += f'<td class="c" rowspan="{span}">{i}</td>'
                if multi:
                    tr += f'<td class="c" rowspan="{span}"><b>{short(qd)}</b></td>'
                tr += (f'<td class="c" rowspan="{span}">{cell_date(b["rd"])}</td>'
                       f'<td rowspan="{span}"><b>{html.escape(bill)}</b><br><span class="sm">{html.escape(sup)}</span>{tag}</td>')
            tr += (f'<td class="c">{html.escape(x["po"])}</td>'
                   f'<td>{html.escape(x["name"])}</td>'
                   f'<td class="c">{html.escape(x["lot"])}<br><span class="sm">{html.escape(x["exp"])}</span></td>'
                   f'<td class="r">{qty(x["qty"])}</td><td class="c">{html.escape(x["unit"])}</td>'
                   f'<td class="r">{money(x["val"])}</td>')
            if j == 0:
                tr += f'<td class="r" rowspan="{span}"><b>{money(sub)}</b></td>'
            tr += '<td class="c"><span class="box"></span></td>'
            body.append(tr + '</tr>')
    qd_th = '<th style="width:8%">วันที่ตรวจรับ</th>' if multi else ''
    bill_w = '14%' if multi else '17%'

    stamp = datetime.datetime.fromtimestamp(os.path.getmtime(src))
    page = f'''<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<title>สรุปตรวจรับ {doc_no}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
<style>
@page {{ size: A4 portrait; margin: 9mm 9mm 9mm 9mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: 'Sarabun', 'TH Sarabun New', Tahoma, sans-serif; font-size: 12.5px; color: #000; background: #fff; margin: 0; }}
.top {{ display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }}
h1 {{ font-size: 18px; margin: 0; }}
.hosp {{ font-size: 14px; font-weight: 700; }}
.no {{ text-align: right; font-size: 13px; line-height: 1.5; white-space: nowrap; }}
.no b {{ font-size: 16px; }}
.lead {{ margin: 6px 0 5px; line-height: 1.5; }}
table {{ width: 100%; border-collapse: collapse; }}
th, td {{ border: 1px solid #000; padding: 2px 4px; vertical-align: top; font-size: 11px; line-height: 1.3; }}
th {{ background: #fff; font-weight: 700; text-align: center; }}
td.c {{ text-align: center; }} td.r {{ text-align: right; white-space: nowrap; }}
.sm {{ font-size: 10.5px; }}
.tag {{ font-size: 10.5px; border: 1px solid #000; padding: 0 4px; }}
td.nop {{ font-weight: 700; background: #e6e6e6; }}
.box {{ display: inline-block; width: 15px; height: 15px; border: 1.5px solid #000; margin-top: 2px; }}
tr {{ page-break-inside: avoid; }}
tr.first td {{ border-top: 2px solid #000; }}
tr.sec {{ page-break-after: avoid; break-after: avoid; }}
tr.sec td {{ font-weight: 700; background: #f2f2f2; border-top: 2px solid #000; }}
tr.tot td {{ font-weight: 700; border-top: 2px solid #000; }}
.words {{ margin-top: 5px; display: flex; align-items: baseline; gap: 6px; }}
.ack {{ margin-top: 5px; line-height: 1.5; }}
.sig {{ display: flex; gap: 24px; margin-top: 10px; page-break-inside: avoid; }}
.sig > div {{ flex: 1; border: 1px solid #000; padding: 6px 14px; }}
.sig .t {{ font-weight: 700; text-align: center; margin-bottom: 4px; }}
.ln {{ display: flex; align-items: baseline; gap: 6px; margin-top: 8px; }}
.fl {{ display: inline-block; flex: 1; height: 1.5em; vertical-align: bottom; border-bottom: 1px dotted #000; text-align: center; }}
.foot {{ margin-top: 3px; font-size: 10px; }}
</style></head><body>
<div class="top">
  <div><div class="hosp">โรงพยาบาลประชาธิปัตย์ · คลังยา</div><h1>สรุปผลการตรวจรับพัสดุ (ยาและเวชภัณฑ์) — ผู้ตรวจรับลงนามรับทราบ</h1></div>
  <div class="no">เลขที่ <b>{doc_no}</b><br>วันที่ตรวจรับ <b>{when}</b><br>วันที่ออกเอกสาร {th_date(today)}</div>
</div>
<p class="lead">คลังยาได้บันทึกสถานะ <b>"ตรวจรับแล้ว"</b> ในทะเบียนรับยา ตามที่ผู้ตรวจรับได้ตรวจรับพัสดุที่คลังยา
{"ระหว่างวันที่" if multi else "เมื่อวันที่"} <b>{when}</b> จำนวน <b>{nbills} บิล {nrows} รายการ</b> มูลค่ารวม <b>{money(total)} บาท</b>
ตามรายละเอียดดังนี้ — ทุกรายการมีรูปตรวจรับ (บิลอยู่ในภาพ) เก็บไว้ที่คลังยา</p>
<table>
<thead><tr><th style="width:3%">ที่</th>{qd_th}<th style="width:8%">วันที่รับ</th><th style="width:{bill_w}">เลขที่บิล / บริษัท</th>
<th style="width:8%">เลขที่ PO</th><th>รายการยา</th><th style="width:9.5%">Lot / Exp</th>
<th style="width:5.5%">จำนวน</th><th style="width:6.5%">หน่วย</th><th style="width:8.5%">มูลค่า (บาท)</th><th style="width:8.5%">รวมบิล (บาท)</th>
<th style="width:5%">ผู้ตรวจ รับ ✓</th></tr></thead>
<tbody>{''.join(body)}
<tr class="tot"><td colspan="{ncol - 3}" class="r">รวมทั้งสิ้น {nbills} บิล {nrows} รายการ</td><td colspan="2" class="r">{money(total)}</td>
<td></td></tr></tbody>
</table>
<div class="words"><span>({bahttext(total)})</span><span style="margin-left:24px">รายการที่ไม่ได้ทำเครื่องหมาย ✓ โปรดระบุเหตุผล</span><span class="fl"></span></div>
<div class="ack">ข้าพเจ้าได้ตรวจรับพัสดุตามรายการที่ทำเครื่องหมาย ✓ ไว้แล้ว และรับทราบการบันทึกผลการตรวจรับของคลังยาตามเอกสารนี้</div>
<div class="sig">
  <div><div class="t">ผู้บันทึก (คลังยา)</div>
    <div class="ln">ลงชื่อ <span class="fl"></span></div>
    <div class="ln" style="justify-content:center">( {SENDER[0]} )</div>
    <div class="ln" style="justify-content:center;margin-top:2px">ตำแหน่ง {SENDER[1]}</div>
    <div class="ln">วันที่ <span class="fl"></span></div></div>
  <div><div class="t">ผู้ตรวจรับ (กรรมการตรวจรับ) — ลงนามรับทราบ</div>
    <div class="ln">ลงชื่อ <span class="fl"></span></div>
    <div class="ln" style="justify-content:center">( {INSPECTOR[0]} )</div>
    <div class="ln" style="justify-content:center;margin-top:2px">ตำแหน่ง {INSPECTOR[1]}</div>
    <div class="ln">วันที่ <span class="fl"></span></div></div>
</div>
<div class="foot">ข้อมูลจากชีท 'รับยา' ไฟล์ รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm (บันทึกล่าสุด {short(stamp.date())} {stamp:%H:%M})
· สถานะตรวจรับ = ตรวจรับแล้ว + มีรูปตรวจรับ · วันที่ตรวจรับ {short(d0) if not multi else short(d0) + "–" + short(d1)} · ทะเบียน เอกสารตรวจรับ\\_ทะเบียนเอกสารตรวจรับ.csv</div>
</body></html>'''

    fname = fname_fixed or out_name(d1)
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
    with open(pdf_tmp, 'rb') as f:
        m = re.search(rb'/Count (\d+)', f.read())
    pages = int(m.group(1)) if m else '?'

    print(f'doc {doc_no}{" (reissue)" if reissue else ""} · ตรวจรับ {when} · {nbills} bills · {nrows} rows · '
          f'total {money(total)} · {bahttext(total)} · {pages} หน้า')
    for (qd, bill, sup, ptype), b in items:
        print(f'  ตรวจรับ {short(qd)} · รับ {cell_date(b["rd"])} {bill} {sup} rows={[x["n"] for x in b["rows"]]} '
              f'sum={money(sum(x["val"] for x in b["rows"]))}')
    show_nophoto(dates)
    others = [d for d in pending if d not in dates]
    if others:
        print('ยังค้างรอบอื่น:', ', '.join(short(d) for d in others))
    for s in same_day:
        print(f'WARN: รูปถ่ายซ้ำวันเดียวกับวันตรวจรับในชีท — เช็คว่าไม่ได้เอาวันถ่ายซ้ำไปลงเป็นวันตรวจรับ: {s}')
    print('preview:', pdf_tmp, '->', fname)

    if not commit:
        return
    if same_day and '--reshoot-date-ok' not in sys.argv:
        sys.exit('STOP: มีรูปถ่ายซ้ำวันเดียวกับวันตรวจรับ — ถาม user ก่อน แล้วใส่ --reshoot-date-ok')
    os.makedirs(OUT_DIR, exist_ok=True)
    dest = os.path.join(OUT_DIR, fname)
    stamp_bak = f'{datetime.datetime.now():%Y%m%d_%H%M%S}'
    if os.path.exists(dest):
        if not reissue:
            sys.exit(f'STOP: {dest} exists')
        shutil.copy2(dest, os.path.join(HERE, f'{os.path.splitext(fname)[0]}_ก่อนออกใหม่_{stamp_bak}.pdf'))
    with open(pdf_tmp, 'rb') as a, open(dest, 'wb') as b:
        b.write(a.read())
    new_rows = [{'เลขที่ใบ': doc_no, 'วันที่ออก': short(today), 'วันที่ตรวจรับ': short(qd),
                 'วันที่รับ': cell_date(b['rd']), 'เลขที่บิล': bill, 'บริษัท': sup, 'สถานะการซื้อ': ptype,
                 'เลขที่PO': ', '.join(sorted({x['po'] for x in b['rows']})), 'จำนวนรายการ': len(b['rows']),
                 'มูลค่า(บาท)': f'{sum(x["val"] for x in b["rows"]):.2f}',
                 'ไม่มีรูปตรวจรับ': 0, 'ไฟล์': fname, 'ผู้ตรวจรับเซ็น': '', 'วันที่เซ็น': '',
                 'หมายเหตุ': f'ออกใหม่แทนฉบับ {old[0]["วันที่ออก"]} (ยังไม่พิมพ์)' if reissue else '',
                 'รหัสยา': ','.join(sorted({x['code'] for x in b['rows']}))}
                for (qd, bill, sup, ptype), b in items]
    if reissue:  # แถวใหม่แทนที่ตำแหน่งเดิมของใบนั้นในทะเบียน
        at = reg_rows.index(old[0])
        out_rows = [r for r in reg_rows[:at] if r not in old] + new_rows + [r for r in reg_rows[at:] if r not in old]
    else:
        out_rows = reg_rows + new_rows
    # เขียนทั้งไฟล์ใหม่ (ไม่ append) — ทะเบียนเดิมยังไม่มีช่อง รหัสยา ต้องเปลี่ยนหัวตาราง · สำรองก่อนเขียน
    if os.path.exists(REG):
        shutil.copy2(REG, os.path.join(HERE, f'_ทะเบียนเอกสารตรวจรับ_bak_{stamp_bak}.csv'))
    with open(REG, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=REG_COLS)
        w.writeheader()
        w.writerows(out_rows)
    if not queued:
        now = datetime.datetime.now()
        with open(PRINT_REG, 'a', encoding='utf-8', newline='') as f:
            f.write(f'{short(now.date())} {now:%H:%M},{dest},,\r\n')
    print('COMMITTED', dest, REG, '(คิวพิมพ์แถวเดิม)' if queued else '+ คิวพิมพ์', '→ รัน python scripts/print-queue.py')


if __name__ == '__main__':
    main()
