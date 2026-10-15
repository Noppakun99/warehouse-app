"""จับคู่ PO ในระบบติดตามการสั่งซื้อ (Apps Script ของจัดซื้อ) กับบิลในชีท 'รับยา' (read-only)
usage: python scripts/po_match.py [--file <recv.xlsm>] [--short-ok "45.05/2570,..."] [--commit]
- PO ส่งหลายบิล: ลงครั้งเดียวเมื่อยอดบิลรวม = ยอด PO → เลขบิล "A, B" วันที่ = วันรับบิลสุดท้าย · ยังไม่ครบ = "ส่งบางส่วน" รอ
- --short-ok = PO ที่จัดซื้อยืนยันว่าบริษัทไม่ส่งส่วนที่เหลือแล้ว → ลงด้วยบิลที่ได้จริง (ห้ามใส่เองโดยไม่มีคำยืนยันจากจัดซื้อ)
- ดึง PO ทุกใบจากระบบ → จับคู่บิลด้วยเลข PO ในคอลัมน์ I (7.05/2570 = PO 007.05/2570)
  บิลที่ช่อง PO ว่าง/'-' → ลองจับคู่จากยอด (ยอดบิล = ยอด PO และรับหลังวันออก PO, เจอใบเดียว) แล้ว flag ให้แก้ PO ในชีท
- เซฟผล _POจัดซื้อ_จับคู่บิล.csv (เขียนทับทุกรอบ = snapshot ล่าสุด) ไว้ข้างทะเบียนส่งบิลจัดซื้อ
- --commit = บันทึก "ยามาส่ง" (แท็บคลังยาเท่านั้น) ให้ PO สถานะ รอยามาส่ง ที่จับคู่ด้วยเลข PO + บิลเดียว + ยอดตรง
  ระบบไม่มีปุ่มย้อนกลับ → จับคู่จากยอด/หลายบิล/ยอดไม่ตรง ไม่ลงให้ ต้องแก้ข้อมูลก่อน
"""
import sys, os, re, csv, json, datetime, warnings, urllib.request, urllib.parse
from collections import OrderedDict, defaultdict
import openpyxl
sys.stdout.reconfigure(encoding='utf-8')
warnings.filterwarnings('ignore')

RECV_XLSM = r'C:\Users\PRH0000484\OneDrive\รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm'
OUT_DIR = r'C:\Users\PRH0000484\Desktop\ยอดคงคลัง\ส่งบิลให้พี่โก้'
OUT_CSV = os.path.join(OUT_DIR, '_POจัดซื้อ_จับคู่บิล.csv')
ENV_LOCAL = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env.local')
WAIT_DELIVERY = 'รอยามาส่ง'
OVERDUE_DAYS = 10
PO_RE = re.compile(r'(\d+)\.(\d+)/(\d{4})')


def api_url():
    # URL เว็บแอปเขียนลงระบบของจัดซื้อได้โดยไม่ต้องล็อกอิน → เก็บใน .env.local (gitignore) ไม่ใส่ในโค้ด
    url = os.environ.get('PO_TRACKER_URL', '')
    if not url and os.path.exists(ENV_LOCAL):
        for line in open(ENV_LOCAL, encoding='utf-8'):
            if line.startswith('PO_TRACKER_URL='):
                url = line.split('=', 1)[1].strip().strip('"\'')
    if not url:
        raise RuntimeError('ไม่พบ PO_TRACKER_URL ใน .env.local (https://script.google.com/macros/s/<id> ของเว็บแอปติดตามการสั่งซื้อ)')
    url = url.rstrip('/')
    if url.endswith('/exec'):
        url = url[:-len('/exec')]
    return url + '/callback?nocache_id=1'


def call(fn, *args):
    body = urllib.parse.urlencode({'request': json.dumps([fn, json.dumps(list(args)), None, [0], None, None, 1, 0])})
    req = urllib.request.Request(api_url(), data=body.encode(), headers={
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8', 'X-Same-Domain': '1'})
    t = urllib.request.urlopen(req, timeout=180).read().decode('utf-8')
    events = json.loads(t[t.find('\n') + 1:])
    for ev in events:
        if ev[0] == 'op.exec':
            return json.loads(ev[1][1])
    raise RuntimeError(f'{fn} ล้ม: {json.dumps(events, ensure_ascii=False)[:500]}')


def po_key(s):
    m = PO_RE.search(str(s or ''))
    return (int(m.group(1)), m.group(2), m.group(3)) if m else None


def short(iso):
    if not iso:
        return ''
    y, m, d = iso.split('-')
    return f'{d}/{m}/{int(y) + 543}'


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def read_bills(src, since):
    ws = openpyxl.load_workbook(src, read_only=True, data_only=True)['รับยา']
    return bills_from_rows(ws.iter_rows(min_row=2, max_col=18, values_only=True), since)


def bills_from_rows(rows, since):
    """บิลการซื้อในชีท รับยา (rows = tuple ค่าตั้งแต่แถว 2) ตั้งแต่ since — key เดียวกับ bill_handover (บิล+บริษัท+วันรับ)"""
    bills = OrderedDict()
    for n, r in enumerate(rows, 2):
        if len(r) < 18 or r[4] != 'การซื้อ' or not isinstance(r[14], datetime.datetime):
            continue
        rd = r[14].date()
        if rd < since:
            continue
        bill, co = str(r[7]).strip(), str(r[17]).strip()
        b = bills.setdefault((bill, co, rd), {'bill': bill, 'company': co, 'date': rd.isoformat(),
                                              'pos': set(), 'total': 0.0, 'rows': [], 'names': []})
        b['pos'].add(str(r[8] or '-').strip())
        b['total'] += float(r[13] or 0)
        b['rows'].append(n)
        b['names'].append(str(r[3]).strip())
    return list(bills.values())


def po_since(pos):
    """วันสั่งทำ PO ใบแรกในระบบ — บิลที่รับก่อนวันนี้ไม่ต้องจับคู่"""
    return min(datetime.date.fromisoformat(p['PO_Request_Date']) for p in pos if p['PO_Request_Date'])


def match(pos, bills, short_ok=None):
    """คืน (out, todo) — out = แถวผลจับคู่ (PO ทุกใบ + บิลที่ไม่มีคู่), todo = [(po, {bill, date, total})] ที่ลงระบบได้เลย
    short_ok = เลข PO ที่จัดซื้อยืนยันแล้วว่าบริษัทไม่ส่งส่วนที่เหลือ → ลงด้วยบิลที่ได้จริง (ไม่งั้นส่งบางส่วน = รอ)
    แถวบิลที่ไม่มีคู่: 'ผล' ขึ้นต้น 'บิลไม่มีคู่ในระบบ' · PO ก่อนเริ่มใช้ระบบ (เลขต่ำกว่าใบแรกในปีเดียวกัน) = 'ก่อนเริ่มใช้ระบบ' ไม่ใช่ปัญหา"""
    by_key = {po_key(p['PO_Number']): p for p in pos}
    first_no = {}
    for k in by_key:
        if k:
            first_no[k[2]] = min(first_no.get(k[2], k[0]), k[0])

    matched = defaultdict(list)   # PO_Number -> [(bill, วิธี)]
    loose = []                    # บิลที่จับคู่ PO ไม่ได้
    for b in bills:
        keys = {po_key(x) for x in b['pos']} - {None}
        bad = {x for x in b['pos'] if x not in ('-', '') and po_key(x) is None}
        if len(keys) == 1 and next(iter(keys)) in by_key:
            matched[by_key[next(iter(keys))]['PO_Number']].append((b, 'เลข PO'))
            continue
        if keys:  # มีเลข PO แต่ไม่อยู่ในระบบ หรือหลายเลขในบิลเดียว
            k = next(iter(keys))
            if len(keys) > 1:
                why = 'บิลเดียวหลายเลข PO'
            elif k[2] in first_no and k[0] < first_no[k[2]]:
                why = 'ก่อนเริ่มใช้ระบบ'
            else:
                why = 'PO ไม่อยู่ในระบบจัดซื้อ'
            loose.append((b, why))
            continue
        cand = [p for p in pos if p['PO_Issued_Date'] and p['PO_Issued_Date'] <= b['date']
                and abs(float(p['Total_Amount_VAT'] or 0) - b['total']) < 0.01]
        if len(cand) == 1:
            matched[cand[0]['PO_Number']].append((b, 'ยอดเงิน (ช่อง PO ในชีทว่าง)'))
        else:
            loose.append((b, f'รูปแบบ PO ผิด {",".join(bad)}' if bad else
                          ('ไม่มีเลข PO และหาจากยอดไม่ได้' if not cand else f'ยอดตรงหลาย PO ({len(cand)})')))

    today = datetime.date.today()
    short_ok = {po_key(x) for x in (short_ok or ())} - {None}
    out, todo = [], []
    for p in sorted(pos, key=lambda p: po_key(p['PO_Number']) or (0, '', '')):
        ms = sorted(matched.get(p['PO_Number'], []), key=lambda m: (m[0]['date'], m[0]['bill']))
        bill_total = round(sum(b['total'] for b, _ in ms), 2)
        po_total = float(p['Total_Amount_VAT'] or 0)
        diff = round(bill_total - po_total, 2) if ms else ''
        st = p['Current_Status']
        # PO ส่งหลายบิล → ลงระบบครั้งเดียวเมื่อครบ: เลขบิล "A, B" · วันที่ = วันรับบิลสุดท้าย (CONTEXT §ยามาส่ง)
        bill_str = ', '.join(b['bill'] for b, _ in ms)
        last_date = ms[-1][0]['date'] if ms else ''
        how_ok = all(h == 'เลข PO' for _, h in ms)
        how = ' / '.join(sorted({h for _, h in ms}))
        if not ms:
            late = st == WAIT_DELIVERY and p['PO_Issued_Date'] and \
                (today - datetime.date.fromisoformat(p['PO_Issued_Date'])).days > OVERDUE_DAYS
            res = ('รอยามาส่ง — เกินกำหนด' if late else 'รอยามาส่ง') if st == WAIT_DELIVERY else \
                  ('ยังไม่ออก PO' if not p['PO_Issued_Date'] else 'ระบบมีบิลแต่ชีทไม่พบ' if p['Bill_Number'] else '-')
        elif diff > 0.005:
            res = f'ยอดบิลเกินยอด PO ({diff:+,.2f})'
        elif st == WAIT_DELIVERY:
            short_left = diff < -0.005
            if short_left and po_key(p['PO_Number']) not in short_ok:
                res = f'ส่งบางส่วน ได้ {bill_total:,.2f} จาก {po_total:,.2f} บาท ({len(ms)} บิล) — รอบิลที่เหลือ'
            elif not how_ok:
                res = 'ต้องแก้ PO ในชีทก่อนลงระบบ'
            else:
                res = 'ต้องลงระบบ' + (' (ส่งไม่ครบ — จัดซื้อยืนยันไม่มีส่วนที่เหลือ)' if short_left else '')
                todo.append((p, {'bill': bill_str, 'date': last_date, 'total': bill_total}))
        elif p['Bill_Number'] != bill_str or p['Delivery_Date'] != last_date:
            res = 'ระบบไม่ตรงชีท (บิล/วันที่)'
        else:
            res = 'ตรงกัน' + (f' — ส่งไม่ครบ ได้ {bill_total:,.2f} จาก {po_total:,.2f}' if diff < -0.005 else '') \
                + (' — แก้ PO ในชีท' if not how_ok else '')
        sheet_bills = ' + '.join(b['bill'] for b, _ in ms)
        out.append({
            'เลขที่PO': p['PO_Number'], 'สถานะในระบบ': st, 'ชื่อยา(ระบบ)': p['Medicine_Name'],
            'บริษัท(ระบบ)': p['Company_Name'], 'ยอดPO': p['Total_Amount_VAT'],
            'วันที่สั่งทำPO': short(p['PO_Request_Date']), 'วันที่ออกPO': short(p['PO_Issued_Date']),
            'บิล(ระบบ)': p['Bill_Number'], 'วันส่งมอบ(ระบบ)': short(p['Delivery_Date']),
            'บิล(ชีท)': sheet_bills, 'วันที่รับ(ชีท)': ' + '.join(short(b['date']) for b, _ in ms),
            'บริษัท(ชีท)': ' + '.join(b['company'] for b, _ in ms),
            'ยอดบิล(ชีท)': round(bill_total, 2) if ms else '', 'ส่วนต่าง': diff, 'จับคู่ด้วย': how,
            'แถวชีทรับยา': ','.join(str(n) for b, _ in ms for n in b['rows']), 'ผล': res})
    for b, why in loose:
        out.append({'เลขที่PO': ','.join(sorted(b['pos'])), 'สถานะในระบบ': '', 'บิล(ชีท)': b['bill'],
                    'วันที่รับ(ชีท)': short(b['date']), 'บริษัท(ชีท)': b['company'],
                    'ยอดบิล(ชีท)': round(b['total'], 2), 'แถวชีทรับยา': ','.join(map(str, b['rows'])),
                    'ผล': f'บิลไม่มีคู่ในระบบ: {why}'})
    return out, todo


def is_problem(res):
    """ผลที่คลังต้องลงมือ (ใช้ร่วมกับ check-complete.py)"""
    return not res.startswith(('ตรงกัน', 'ยังไม่ออก PO', 'รอยามาส่ง', 'ส่งบางส่วน')) and 'ก่อนเริ่มใช้ระบบ' not in res \
        or 'แก้ PO' in res


def main():
    commit = '--commit' in sys.argv
    short_ok = [x for x in (arg('--short-ok') or '').split(',') if x.strip()]
    pos = call('api_bootstrap')['rows']
    if any(po_key(x) not in {po_key(p['PO_Number']) for p in pos} for x in short_ok):
        sys.exit(f'STOP: --short-ok มีเลข PO ที่ไม่อยู่ในระบบ {short_ok}')
    since = po_since(pos)
    bills = read_bills(arg('--file', RECV_XLSM), since)
    out, todo = match(pos, bills, short_ok)

    cols = list(out[0].keys())
    with open(OUT_CSV, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols, lineterminator='\r\n')
        w.writeheader()
        for r in out:
            w.writerow({c: r.get(c, '') for c in cols})

    count = defaultdict(int)
    for r in out:
        count[r['ผล'].split(' (')[0].split(':')[0]] += 1
    print(f'PO ในระบบ {len(pos)} ใบ · บิลการซื้อในชีทตั้งแต่ {short(since.isoformat())} {len(bills)} ใบ')
    for k, v in sorted(count.items(), key=lambda x: -x[1]):
        print(f'  {k}: {v}')
    for r in out:
        if is_problem(r['ผล']):
            print(f"  ! {r['เลขที่PO']} | {r.get('บิล(ชีท)', '')} | {r['ผล']}")
    print('เซฟ', OUT_CSV)

    if not todo:
        print('ไม่มี PO ที่ต้องลงระบบ')
        return
    print(f'ต้องลง "ยามาส่ง" {len(todo)} PO:' + ('' if commit else ' (dry-run — ใส่ --commit เพื่อบันทึก)'))
    for p, b in todo:
        print(f"  {p['PO_Number']} | {short(b['date'])} | {b['bill']} | {b['total']:,.2f}")
        if commit:
            rows = {r['PO_Number']: r for r in call('api_receiveGoods',
                                                    {'po': p['PO_Number'], 'deliveryDate': b['date'], 'bill': b['bill']})['rows']}
            r = rows[p['PO_Number']]
            ok = r['Delivery_Date'] == b['date'] and r['Bill_Number'] == b['bill']
            print(f"    {'บันทึกแล้ว' if ok else 'ไม่ตรง!'} → {r['Current_Status']} | {r['Delivery_Date']} | {r['Bill_Number']}")
    if commit:
        print('รันอีกครั้ง (ไม่ใส่ --commit) เพื่ออัปเดตไฟล์ CSV ให้เป็นสถานะล่าสุด')


if __name__ == '__main__':
    main()
