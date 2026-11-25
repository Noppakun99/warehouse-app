"""ข้อความทวงงานในกลุ่มไลน์ "จัดซื้อยา" — แยกตามขั้นที่ค้างในระบบจัดซื้อ 1 ข้อความ = 1 คน (อ่านอย่างเดียว)

    python -B scripts/po_match.py                      # dry-run ก่อนทุกครั้ง ให้ _POจัดซื้อ_จับคู่บิล.csv เป็นปัจจุบัน
    python -B .claude/skills/procurement-followup/scripts/followup.py [--date YYYY-MM-DD] [--only ชมพู่|พี่โก้|พี่โบว์]

แหล่งข้อมูล 2 ฝั่ง (user สั่ง 23/11/2569 — เช็คระบบจัดซื้อ + คลังของเราก่อนทวง):
  ระบบจัดซื้อ = _POจัดซื้อ_จับคู่บิล.csv (สถานะในระบบ · ผล) · คลัง = ยอดคลังยา_69.xlsm ชีท Master (C สถานะตรวจรับ · U คงเหลือ)
  + ชีท 'เบิก ' (W จำนวนที่ขอ · X เหตุผลจ่ายไม่ครบ ใน URGENT_REQ_DAYS วัน) + ชีท วิเคราะห์สั่งซื้อ (Avg/วัน · Lead Time)
  + _ทะเบียนตามยา.csv (ทวงล่าสุดเมื่อไร)
ส่งถึง: รอตรวจรับ → ชมพู่ · รอส่งทำชุดตรวจรับ / PO ไม่ตรงบิล → พี่โก้ · รอยามาส่ง → พี่โบว์
ด่วน = ไม่มีจ่าย (จ่ายได้ 0) · จ่ายไม่พอ (หน่วยงานได้ไม่ครบใน 14 วัน) · ใกล้หมด (พอใช้ ≤ Lead Time) · ที่เหลือ = ตามปกติ
"""
import argparse, csv, datetime as dt, os, re, shutil, sys, tempfile, warnings
from collections import defaultdict

warnings.filterwarnings('ignore')
import openpyxl

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'purchase-request-report', 'scripts'))
import pr  # noqa: E402  — ใช้ po_match / load_po / PO_CSV / NOT_URGENT ตัวเดียวกับไลน์ตามยารายสัปดาห์

HOME = r'C:\Users\PRH0000484'
STOCK = os.path.join(HOME, r'OneDrive\ยอดคลังยา_69.xlsm')
FOLLOW = os.path.join(HOME, r'Desktop\ยอดคงคลัง\รายงานขอซื้อยา\_ทะเบียนตามยา.csv')
URGENT_REQ_DAYS = 14        # หน่วยงานขอเบิกภายใน N วันแล้วได้ไม่ครบ = ด่วน (เท่า pr.URGENT_REQ_DAYS)
INSPECT_LIMIT = 5           # ชุดตรวจรับไม่ควรเกิน 5 วันทำการ (หัวหน้า 20/11/2569)
LOW_DAYS = 7                # คงเหลือจ่ายได้พอใช้ ≤ N วัน = ด่วน (ของจะหมดก่อนตรวจรับ/ส่งเสร็จ) — ไม่ใช้ Lead Time: ยาส่วนใหญ่ต่ำกว่า LT ด่วนจะล้น
FOLLOW_CHANNEL = 'ไลน์กลุ่มจัดซื้อยา'   # "ทวงแล้ว" นับเฉพาะที่ทวงในกลุ่มนี้
SKIP_HEAD = {'1650097': 'Remdesivir หัวหน้าซื้อเอง'}   # memory remdesivir-head-buys

ap = argparse.ArgumentParser()
ap.add_argument('--date')
ap.add_argument('--only')
ap.add_argument('--all', action='store_true', help='ตามปกติ รวมบิลที่ยังอยู่ในกำหนด 5 วันทำการด้วย')
a = ap.parse_args()
today = dt.datetime.strptime(a.date, '%Y-%m-%d') if a.date else dt.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)


def dm(d):
    return f'{d.day}/{d.month}'


def workdays(d0, d1):
    """วันทำการ (จ.–ศ.) หลังวันของมา ถึง d1 — ยังไม่หักวันหยุดราชการ"""
    n, d = 0, d0
    while d < d1:
        d += dt.timedelta(days=1)
        n += d.weekday() < 5
    return n


def num(v):
    return v if isinstance(v, (int, float)) else 0


def qf(v):
    return f'{v:,.0f}' if float(v).is_integer() else f'{v:,.2f}'


def key_bill(s):
    return re.sub(r'\s', '', str(s or '')).upper()


# ── คลัง: Master + เบิก + วิเคราะห์ (สำเนา temp — ไฟล์เปิดใน Excel อยู่ openpyxl เปิดไม่ได้)
tmp = tempfile.mkdtemp()
src = os.path.join(tmp, 'stock.xlsm')
shutil.copy2(STOCK, src)
saved = dt.datetime.fromtimestamp(os.path.getmtime(STOCK))
wb = openpyxl.load_workbook(src, read_only=True, data_only=True)


def header(ws, row):
    h = next(ws.iter_rows(min_row=row, max_row=row, values_only=True))
    return {str(x).strip(): i for i, x in enumerate(h) if x}


def need(h, name):
    for k, i in h.items():
        if k.startswith(name):
            return i
    raise SystemExit(f'ไม่พบคอลัมน์ "{name}" — โครงชีทเปลี่ยน หยุดก่อน')


ws = wb['Master']
H = header(ws, 1)
MC = {k: need(H, n) for k, n in (('status', 'สถานะตรวจรับ'), ('code', 'รหัสHosxp'), ('name', 'รายการยา'), ('unit', 'หน่วย'),
                                  ('lot', 'Lot Number'), ('exp', 'Exp'), ('recv', 'วันที่รับเข้า'), ('co', 'บริษัท'),
                                  ('bill', 'เลขที่บิลซื้อ'), ('u', 'คงเหลือหลังจ่าย'), ('result', 'ผลการพิจารณา'))}
pending = []                       # แถว Master รอตรวจรับ
avail = defaultdict(float)         # จ่ายได้ต่อรหัส (ไม่นับรอตรวจรับ · ไม่นับ lot หมดอายุ)
names, units, cut = {}, {}, set()
for r in ws.iter_rows(min_row=2, values_only=True):
    code = str(r[MC['code']] or '').strip()
    if not code or not code[0].isdigit():
        continue
    names.setdefault(code, str(r[MC['name']] or '').strip())
    units.setdefault(code, str(r[MC['unit']] or '').strip())
    if 'ตัดออก' in str(r[MC['result']] or ''):
        cut.add(code)
    u = num(r[MC['u']])
    st = str(r[MC['status']] or '').strip()
    if st == 'รอตรวจรับ':
        if u > 0:
            pending.append({'code': code, 'lot': str(r[MC['lot']] or ''), 'u': u, 'unit': str(r[MC['unit']] or '').strip(),
                            'bill': str(r[MC['bill']] or '').strip(), 'co': str(r[MC['co']] or '').strip(),
                            'recv': r[MC['recv']] if isinstance(r[MC['recv']], dt.datetime) else None})
        continue
    exp = r[MC['exp']]
    if u > 0 and not (isinstance(exp, dt.datetime) and exp < today):
        avail[code] += u

ws = wb['วิเคราะห์สั่งซื้อ']
H = header(ws, 3)
XA, XL = need(H, 'Avg/วัน'), need(H, 'Lead Time')
rate, lt = {}, {}
for r in ws.iter_rows(min_row=4, values_only=True):
    c = str(r[0] or '').strip()
    if c:
        rate.setdefault(c, num(r[XA]))
        lt.setdefault(c, num(r[XL]))

ws = wb['เบิก ']
H = header(ws, 6)
DC = {k: need(H, n) for k, n in (('date', 'วันที่เบิก'), ('code', 'รหัส'), ('n', 'ปริมาณ (ออก)'), ('dept', 'หน่วยงานที่เบิก'),
                                  ('w', 'จำนวนที่ขอ'), ('x', 'เหตุผลจ่ายไม่ครบ'), ('no', 'เลขรับใบเบิก'))}
since = today - dt.timedelta(days=URGENT_REQ_DAYS)
asked = defaultdict(lambda: {'w': 0, 'n': 0, 'date': None})    # (รหัส, หน่วยงาน, เลข บย.) → ขอ/จ่าย
later = defaultdict(list)                                        # (รหัส, หน่วยงาน) → วันที่ที่มีการจ่าย > 0
for r in ws.iter_rows(min_row=7, values_only=True):
    d = r[DC['date']]
    if not isinstance(d, dt.datetime) or d < since:
        continue
    code, dept = str(r[DC['code']] or '').strip(), str(r[DC['dept']] or '').strip()
    if num(r[DC['n']]) > 0:
        later[(code, dept)].append(d)
    if r[DC['w']] not in (None, '') and str(r[DC['x']] or '').strip():
        k = (code, dept, str(r[DC['no']] or '').strip())
        asked[k]['w'] = max(asked[k]['w'], num(r[DC['w']]))
        asked[k]['date'] = d
for r in ws.iter_rows(min_row=7, values_only=True):   # รวมยอดจ่ายทุกแถว lot ของใบเดียวกัน
    k = (str(r[DC['code']] or '').strip(), str(r[DC['dept']] or '').strip(), str(r[DC['no']] or '').strip())
    if k in asked:
        asked[k]['n'] += num(r[DC['n']])
wb.close()

short = defaultdict(list)          # รหัส → [(หน่วยงาน, ค้าง, วันที่ขอ)]
for (code, dept, no), v in asked.items():
    gap = v['w'] - v['n']
    if gap > 0 and not any(d > v['date'] for d in later[(code, dept)]):   # มีจ่ายตามทีหลังแล้ว = ไม่นับ
        short[code].append((dept, gap, v['date']))


def urgency(code):
    """(ด่วนไหม, เหตุผล) จากคลังฝั่งเรา"""
    why = []
    if avail[code] <= 0:
        why.append('คลังจ่ายได้ 0')
    for dept, gap, d in short.get(code, []):
        why.append(f'{dept} ยังค้างจ่าย {qf(gap)} x {units.get(code, "")} (ขอ {dm(d)})')
    days = avail[code] / rate[code] if rate.get(code) else None
    if avail[code] > 0 and days is not None and days <= LOW_DAYS:
        why.append(f'คลังเหลือพอใช้ประมาณ {days:.0f} วัน')
    return bool(why), why


# ── ทวงล่าสุด + ข้อสังเกตหัวหน้า (user สั่ง 25/11/2569: คำตอบหัวหน้าในทะเบียนตามยาต้องขึ้นในข้อความทุกครั้ง)
last_follow, head_note, head_rows = {}, {}, []
if os.path.exists(FOLLOW):
    with open(FOLLOW, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            keys = [k for k in (r.get('รหัส', '').strip(), *re.findall(r'PO \d+\.\d+/\d+', r.get('PO', ''))) if k and k != '-']
            if r.get('ช่องทาง', '').strip().startswith(FOLLOW_CHANNEL):   # รวม "(ฝากหัวหน้าตามยา)"
                for k in keys:
                    last_follow[k] = r.get('วันที่ตาม', '')
            ans = r.get('หัวหน้าตอบ', '').strip()
            if ans and ans not in ('-', 'ไม่ได้ตอบ') and not r.get('สถานะ', '').strip().startswith('ปิด'):
                note =f'หัวหน้าแจ้ง {r.get("วันที่ตอบ", "").strip() or r.get("วันที่ตาม", "")}: {ans}'
                head_rows.append((r, keys))
                for k in keys:
                    head_note[k] = note


def note_for(*keys):
    return next((head_note[k] for k in keys if k in head_note), '')

# ── ระบบจัดซื้อ
po_rows = []
with open(pr.PO_CSV, encoding='utf-8-sig', newline='') as f:
    for r in csv.DictReader(f):
        if r['เลขที่PO'].startswith('PO '):
            po_rows.append(r)
po_saved = dt.datetime.fromtimestamp(os.path.getmtime(pr.PO_CSV))
by_bill = {}
for p in po_rows:
    for b in re.split(r'\s*\+\s*', p['บิล(ชีท)']):
        if b.strip():
            by_bill[key_bill(b)] = p

groups = defaultdict(list)          # (ผู้รับ, PO, บิล) → แถว Master
gpo = {}                            # (ผู้รับ, PO, บิล) → แถวระบบจัดซื้อ
mismatch, nosys = [], []
for x in pending:
    p = by_bill.get(key_bill(x['bill']))
    if not p:
        nosys.append(x)
        continue
    st = p['สถานะในระบบ']
    if st == 'รอตรวจรับ':
        who = 'ชมพู่'
    elif st == 'รอส่งทำชุดตรวจรับ' or (st == 'รอยามาส่ง' and p['ผล'].startswith('ยอดบิล')):   # บิลไม่ตรง PO = จัดซื้อแก้
        who = 'พี่โก้'
    elif st == 'รอยามาส่ง':          # PO ส่งมาไม่ครบ — ตามบริษัทให้ส่งส่วนที่เหลือ = ข้อความพี่โบว์ (load_po) ไม่ซ้ำที่พี่โก้
        continue
    else:
        mismatch.append((x, p))      # ระบบตรวจรับแล้ว/ส่งบัญชีแล้ว แต่ Master ยังรอตรวจรับ = คลังต้องอัปเดตเอง ไม่ทวง
        continue
    bill = p['บิล(ชีท)'] if p['ผล'].startswith('ยอดบิล') else x['bill']   # ยอด PO ผิด = เรื่องเดียวทั้ง PO รวมทุกบิลเป็นข้อเดียว
    groups[(who, p['เลขที่PO'], bill)].append(x)
    gpo[(who, p['เลขที่PO'], bill)] = p


def bill_block(n, po, bill, rows, p):
    recv = min((x['recv'] for x in rows if x['recv']), default=None)
    wd = workdays(recv, today) if recv else None
    co = re.sub(r'^บริษัท\s*|\s*จ[ําา]?กัด.*$', '', rows[0]['co']).strip()
    items = defaultdict(float)
    for x in rows:
        items[(x['code'], x['unit'])] += x['u']
    names_txt = ' + '.join(f'{names[c]} {qf(q)} x {u}' for (c, u), q in items.items())
    head = f'{n}. {names_txt}\n   บิล {bill} ({po} · {co}) ของมา {dm(recv) if recv else "-"}'
    head += f' · ระบบขึ้น "{p["สถานะในระบบ"]}"'
    if wd is not None:
        head += f' · ถึงวันนี้ {wd} วันทำการ' + (' (เกิน 5)' if wd > INSPECT_LIMIT else '')
    if p['ผล'] not in ('ตรงกัน',) and not p['ผล'].startswith('รอยามาส่ง'):
        head += f'\n   ระบบ: {p["ผล"]}'
    lines = [head]
    urgent = False
    for (c, u) in items:
        ok, why = urgency(c)
        if ok:
            urgent = True
            lines.append(f'   - {names[c]}: ' + ' · '.join(why))
    hn = note_for(po, *(c for (c, _) in items))
    if hn:
        lines.append(f'   ({hn})')
    lf = last_follow.get(po) or next((last_follow[c] for (c, _) in items if c in last_follow), '')
    if lf:
        lines.append(f'   (ทวงแล้ว {lf})')
    late =wd is None or wd > INSPECT_LIMIT or not p['ผล'].startswith(('ตรงกัน', 'รอยามาส่ง'))
    return urgent, late, '\n'.join(lines)


OPEN = {'ชมพู่': 'แจ้งมีรายการตรวจรับตามรายการยาดังนี้ครับ',
        'พี่โก้': 'แจ้งมีรายการรอทำชุดตรวจรับ/แก้ข้อมูล PO ตามรายการยาดังนี้ครับ',
        'พี่โบว์': 'แจ้งมีรายการยายังไม่มาส่ง ตามรายการยาดังนี้ครับ'}
ASK = {'ชมพู่': 'รบกวนตรวจรับรายการด่วนก่อนนะครับ ขอบคุณครับ',
       'พี่โก้': 'รบกวนพี่โก้ทำชุดตรวจรับ/แก้ข้อมูลรายการด่วนก่อนนะครับ ขอบคุณครับ',
       'พี่โบว์': 'รบกวนพี่โบว์ช่วยติดตามบริษัทรายการด่วนก่อนนะครับ ขอบคุณครับ'}


def message(who, blocks):
    urg = [b for u, b in blocks if u]
    norm = [b for u, b in blocks if not u]
    if not blocks:
        return None
    out = [f'{who} ครับ {OPEN[who]}', f'(สถานะในระบบจัดซื้อ {dm(po_saved)} {po_saved:%H:%M} · คลัง {dm(saved)} {saved:%H:%M})']
    i = 1
    for title, lst in (('【ด่วน】', urg), ('【ตามปกติ】', norm)):
        if lst:
            out.append('')
            out.append(title)
            for b in lst:
                out.append(re.sub(r'^\d+\.', f'{i}.', b))
                i += 1
    out += ['', ASK[who]]
    return '\n'.join(out)


msgs, in_window = {}, {}
for who in ('ชมพู่', 'พี่โก้'):
    blocks, n_ok = [], 0
    for (w, po, bill), rows in sorted(groups.items(), key=lambda kv: kv[0][1]):
        if w == who:
            urgent, late, text = bill_block(0, po, bill, rows, gpo[(w, po, bill)])
            if urgent or late or a.all:      # ตามปกติ = เกิน 5 วันทำการ — ยังอยู่ในกำหนดไม่ทวง (--all ดูทั้งหมด)
                blocks.append((urgent, text))
            else:
                n_ok += 1
    msgs[who], in_window[who] = message(who, blocks), n_ok

# พี่โก้: PO ที่ระบบไม่ตรงบิล (ยอดเกิน/ขาด) แต่ของไม่ได้รอตรวจรับในคลังแล้ว
extra = []
for p in po_rows:
    if p['ผล'].startswith('ยอดบิล') and not any(k[1] == p['เลขที่PO'] for k in groups):
        lf = last_follow.get(p['เลขที่PO'], '')
        extra.append(f'- {p["เลขที่PO"]} บิล {p["บิล(ชีท)"]}: {p["ผล"]} · ระบบขึ้น "{p["สถานะในระบบ"]}"' + (f' (ทวงแล้ว {lf})' if lf else ''))

# พี่โบว์: PO รอยามาส่ง (ใช้ตัวจับคู่ชื่อ↔รหัสของ pr.py)
pos = [p for p in (pr.load_po() or []) if p['issued'] is not None]
head_blocks = []
for p in sorted(pos, key=lambda p: p['issued']):
    days = (today - p['issued']).days
    codes = [c for c in names if c not in SKIP_HEAD and pr.po_match(c, names[c], [p])[0]]
    urgent_codes = [(c, urgency(c)[1]) for c in codes if c not in pr.NOT_URGENT and c not in cut and urgency(c)[0]]
    if not urgent_codes and days <= pr.PO_OVERDUE_DAYS:
        continue
    part = ' ส่งมาบางส่วนแล้ว' if p['ผล'].startswith('ส่งบางส่วน') else ''
    co = re.sub(r'^บริษัท\s*|\s*จ[ําา]?กัด.*$', '', p['บริษัท(ระบบ)']).strip()
    lines = [f'0. {p["label"]}\n   {p["เลขที่PO"]} ({co}) ออก {dm(p["issued"])}{part} · ยังไม่มาส่ง {days} วัน']
    for c, why in urgent_codes:
        lines.append(f'   - {names[c]}: ' + ' · '.join(why))
    hn = note_for(p['เลขที่PO'], *codes)
    if hn:
        lines.append(f'   ({hn})')
    lf = last_follow.get(p['เลขที่PO'], '')
    if lf:
        lines.append(f'   (ทวงแล้ว {lf})')
    head_blocks.append((bool(urgent_codes), '\n'.join(lines)))
msgs['พี่โบว์'] = message('พี่โบว์', head_blocks)

for who in ('ชมพู่', 'พี่โก้', 'พี่โบว์'):
    if a.only and a.only != who:
        continue
    print(f'\n━━━━ ถึง {who} ━━━━')
    print(msgs[who] or '(ไม่มีรายการ)')
    if in_window.get(who):
        print(f'\n[นอกข้อความ] ยังอยู่ในกำหนด {INSPECT_LIMIT} วันทำการ {in_window[who]} บิล ไม่ได้ใส่ (--all ดูทั้งหมด)')
    if who == 'พี่โก้' and extra:
        print('\n[PO ระบบไม่ตรงบิล — ใส่ในข้อความถึงพี่โก้ถ้ายังไม่ได้ทวง]\n' + '\n'.join(extra))

print('\n━━━━ ข้อสังเกตหัวหน้าในทะเบียนตามยา (สำหรับ user — เทียบกับร่างก่อนส่ง) ━━━━')
for r, keys in head_rows:
    if r.get('สถานะ', '').strip().startswith(('ปิด', 'เสร็จ', 'มาแล้ว')):
        continue
    print(f'- {r.get("วันที่ตอบ") or r.get("วันที่ตาม")} {r.get("รายการ")} [{", ".join(keys) or "-"}]: {r.get("หัวหน้าตอบ")}'
          + (f' → ต้องทำ: {r.get("ต้องทำต่อ")}' if r.get('ต้องทำต่อ', '').strip() else '') + f' · สถานะ {r.get("สถานะ", "-")}')

print('\n━━━━ ไม่ต้องทวง (สำหรับ user) ━━━━')
for x, p in mismatch:
    print(f'- {names[x["code"]]} lot {x["lot"]} บิล {x["bill"]}: ระบบขึ้น "{p["สถานะในระบบ"]}" แต่ Master ยังรอตรวจรับ — คลังลงตรวจรับเอง (เช็ครูปตรวจรับ)')
for x in nosys:
    print(f'- {names[x["code"]]} lot {x["lot"]} บิล {x["bill"] or "-"} ({x["co"]}): Master รอตรวจรับ แต่ไม่พบบิลในระบบจัดซื้อ — ถาม user')
print(f'\nแหล่ง: {STOCK} (เซฟ {saved:%d/%m/%Y %H:%M}) · {pr.PO_CSV} (po_match {po_saved:%d/%m/%Y %H:%M}) · วันทำการยังไม่หักวันหยุดราชการ')
