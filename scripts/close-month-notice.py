# -*- coding: utf-8 -*-
# รายงานแจ้งจัดซื้อหลังปิดยอดรายเดือน (user สั่ง 03/11/2569 — ทำทุกเดือนหลังขึ้นเดือน · สกิล /close-month-notice)
# อ่านอย่างเดียว: ชีท Master_<เดือน> ใน ยอดคลังยา_69.xlsm + ชีท สรุปยอด <เดือน> ในไฟล์สรุปส่งบัญชีล่าสุด
#                 + _POจัดซื้อ_จับคู่บิล.csv (รัน po_match.py ก่อน) + _ทะเบียนส่งบิลจัดซื้อ.csv + _ทะเบียนเอกสารตรวจรับ.csv
# ได้ข้อความ 2 ชุด: (1) พิมพ์ตกหล่นในทะเบียน อ้าง "รอบที่ R (<วันที่>) ลำดับที่ N" + PO + บิล + แก้เป็นอะไร เพราะอะไร
#                 (2) บิลส่งบัญชี/ค้าง แยกขั้นตอน
# เซฟ: Desktop\ยอดคงคลัง\ยอดคงคลังส่งบัญชี\แจ้งจัดซื้อ_<เดือน>.txt
#   python -B scripts/close-month-notice.py --month ต.ค.69 [--register <ไฟล์สรุป>]
import argparse, collections, csv, glob, io, os, re, sys, warnings
import openpyxl

warnings.filterwarnings('ignore')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
HOME = os.path.expanduser('~')
STOCK = os.path.join(HOME, r'OneDrive\ยอดคลังยา_69.xlsm')
REG_GLOB = os.path.join(HOME, r'OneDrive\Documents\สุรปยอด ส่งบัญชี*.xlsx')
HAND = os.path.join(HOME, r'Desktop\ยอดคงคลัง\ส่งบิลให้พี่โก้')
INSP = os.path.join(HOME, r'Desktop\ยอดคงคลัง\เอกสารตรวจรับ\_ทะเบียนเอกสารตรวจรับ.csv')
OUT_DIR = os.path.join(HOME, r'Desktop\ยอดคงคลัง\ยอดคงคลังส่งบัญชี')

ap = argparse.ArgumentParser()
ap.add_argument('--month', required=True)
ap.add_argument('--register')
ap.add_argument('--stock', default=STOCK)
A = ap.parse_args()

num = lambda x: x if isinstance(x, (int, float)) and not isinstance(x, bool) else 0
money = lambda x: f'{x:,.2f}'
amt = lambda x: f'{x:,.2f}' if abs(x - round(x)) > 0.004 else f'{x:,.0f}'
bill_key = lambda s: re.sub(r'[\s\-\\/]', '', str(s)).upper()
sheet_key = lambda s: re.sub(r'[\s.]', '', str(s))


def po_key(p):
    m = re.search(r'0*(\d+)\.+(\d+)', str(p))
    return f'{int(m.group(1))}.{m.group(2)}' if m else str(p).strip()


def co_short(s):
    s = re.sub(r'บริษัท|ห้างหุ้นส่วนจำกัด|จำกัด|\(มหาชน\)', ' ', str(s or ''))
    return re.sub(r'\s+', ' ', s).strip()


def co_key(s):
    return re.sub(r'[\s.,()ฯ\-]', '', co_short(s)).lower()


def is_short_of(a, b):
    """ชื่อย่อที่ตัดท้าย ('ที พี ดรัก ฯ' กับชื่อเต็ม) ไม่นับเป็นพิมพ์ผิด · ตัวสะกดกลางคำต่างกัน = พิมพ์ผิด"""
    return b.startswith(a)


reg_path = A.register or max(glob.glob(REG_GLOB), key=os.path.getmtime)
reg = openpyxl.load_workbook(reg_path, data_only=True)
names = [s for s in reg.sheetnames if sheet_key(A.month) in sheet_key(s)]
if len(names) != 1:
    sys.exit(f'หาชีทเดือน {A.month} ในไฟล์สรุปไม่ได้: {names}')
rs = reg[names[0]]
bills, proj = [], []
comp = po = comp_cell = po_cell = None
# อ้างตำแหน่งด้วย "รอบที่ R (<วันที่>) ลำดับที่ N" ตามคอลัมน์ A (user สั่ง 20/11/2569 แทน "แถว D5")
# ลำดับนับ 1 ใหม่ทุกรอบส่ง และนับใหม่อีกชุดในส่วน "มิใช่ยา" · แถวที่ช่องลำดับว่าง = บิลที่ 2+ ของลำดับก่อนหน้า
# วันที่รอบซ้ำกันได้ (ต.ค.69 มี 22/10/69 สองรอบ) จึงนับรอบตามลำดับหัวตารางในชีทด้วย
rnd, rnd_no, sec, seq = '', 0, '', None
ref = lambda: f"รอบที่ {rnd_no} ({rnd}){' มิใช่ยา' if sec else ''} ลำดับที่ {seq}"
for r in range(1, rs.max_row + 1):
    a, b, c, d, e, f = (rs.cell(r, i).value for i in (1, 2, 3, 4, 5, 6))
    m_rnd = re.search(r'\d{1,2}/\d{1,2}/\d{2,4}', str(a or ''))
    if m_rnd and 'เวชภัณฑ์' in str(a):
        rnd, rnd_no, sec, seq = m_rnd.group(), rnd_no + 1, '', None
        continue
    if str(d or '').strip() == 'มิใช่ยา' and e in (None, ''):
        sec, seq = 'มิใช่ยา', None
        continue
    if str(e or '').strip() in ('เลขที่ บิล', 'เลขที่บิล') or str(d or '').strip() == 'บริษัท':
        continue
    if isinstance(a, (int, float)) and not isinstance(a, bool):
        seq = int(a)
    if d not in (None, ''):
        comp, comp_cell, comp_ref = str(d).strip(), f'D{r}', ref()
    if c not in (None, ''):
        po, po_cell, po_ref = str(c).strip(), f'C{r}', ref()
    if e in (None, '') or not isinstance(f, (int, float)) or 'ยอดรวม' in str(e):
        continue
    bills.append(dict(row=r, bill=str(e).strip(), amt=f, comp=comp, comp_cell=comp_cell, comp_ref=comp_ref,
                      po=po, po_cell=po_cell, po_ref=po_ref, ref=ref()))
    if b not in (None, ''):
        proj.append((ref(), po, str(e).strip(), str(b).strip()))

wb = openpyxl.load_workbook(A.stock, data_only=True)
snap = f'Master_{A.month}'
if snap not in wb.sheetnames:
    sys.exit(f'ไม่มีชีท {snap} — ขึ้นเดือนก่อน แล้วค่อยรัน')
ws = wb[snap]
last = int(re.search(r'(\d+)$', list(ws.tables.values())[0].ref).group(1))
rows = []
for r in range(2, last + 1):
    if ws[f'F{r}'].value is None:
        continue
    rows.append({k: ws[f'{k}{r}'].value for k in ('B', 'C', 'G', 'H', 'J', 'M', 'O', 'P', 'Q', 'R', 'AA', 'AW')})
by_bill = collections.defaultdict(list)
for x in rows:
    if x['R'] not in (None, '', '-'):
        by_bill[bill_key(x['R'])].append(x)

# ── ยอดส่งบัญชี + บิลในทะเบียนที่จับคู่ไม่ได้
sent_total = sum(num(x['AA']) for x in rows)
reg_total = sum(b['amt'] for b in bills)
notes, unmatched = [], []
for b in bills:
    rr = by_bill.get(bill_key(b['bill']), [])
    aa = sum(num(x['AA']) for x in rr)
    if not rr or abs(aa - b['amt']) >= 1:
        unmatched.append(f"แถว E{b['row']} {b['comp']} {b['bill']} ทะเบียน {money(b['amt'])} · Master AA {money(aa)}")
if abs(sent_total - reg_total) >= 0.01:
    notes.append(f'⛔ ยอดไม่ตรง: ทะเบียน {money(reg_total)} · Master AA {money(sent_total)}')
notes += ['⛔ ' + u for u in unmatched]

# ── PO ในระบบจัดซื้อ (po_match.py) — ใช้ทั้งชุด 1 (เทียบ 3 แหล่ง) และชุด 2
po_csv = os.path.join(HAND, '_POจัดซื้อ_จับคู่บิล.csv')
po_rows = list(csv.DictReader(open(po_csv, encoding='utf-8-sig')))
po_map = {po_key(r['เลขที่PO']): r for r in po_rows}
sys_po_of_bill = {}
for r in po_rows:
    for col in ('บิล(ระบบ)', 'บิล(ชีท)'):
        for bl in re.split(r'[,;+|]|\s{2,}', str(r.get(col) or '')):
            if bl.strip() and bl.strip() != '-':
                sys_po_of_bill.setdefault(bill_key(bl), po_key(r['เลขที่PO']))

# ── ชุด 1 พิมพ์ตกหล่น: ชื่อบริษัท/เลข PO เทียบ Master + ระบบจัดซื้อ · เลขโครงการ เทียบความยาวส่วนใหญ่ของเดือน
# ทุกจุดบอก: รอบส่ง+ลำดับที่ · PO · บิล · ค่าในทะเบียน → ค่าที่ถูก · เพราะอะไร (user สั่ง 20/11/2569)
seen, co_fix, po_fix = set(), collections.OrderedDict(), []
for b in bills:
    rr = by_bill.get(bill_key(b['bill']), [])
    if not rr:
        continue
    if b['comp_cell'] not in seen:
        seen.add(b['comp_cell'])
        m_name = co_short(rr[0]['Q'])
        if co_key(b['comp']) != co_key(m_name) and not is_short_of(co_key(b['comp']), co_key(m_name)):
            co_fix.setdefault((b['comp'], m_name), []).append(f"{b['comp_ref']} PO {b['po']} บิล {b['bill']}")
    if b['po_cell'] not in seen:
        seen.add(b['po_cell'])
        reg_po, bill_po = b['po'] or '-', po_key(rr[0]['AW'])
        bill_ok = rr[0]['AW'] not in (None, '', '-')
        bad_fmt = not re.fullmatch(r'\d+\.\d+(/\d+)?', reg_po)
        if not (bad_fmt or (bill_ok and po_key(reg_po) != bill_po)):
            continue
        sys_po = sys_po_of_bill.get(bill_key(b['bill']))
        lines = [f"- {b['po_ref']} · บิล {b['bill']} {b['comp']}",
                 f"  PO ในบิล {bill_po if bill_ok else '-'} · PO ในระบบจัดซื้อ {sys_po or 'ไม่พบบิลนี้'} · PO ในทะเบียน {reg_po}"]
        if sys_po and bill_ok and sys_po != bill_po:
            lines.append(f"  PO ในบิลกับระบบจัดซื้อไม่ตรงกัน ขอตรวจว่าบิลนี้ใช้ PO ไหน แล้วแก้ทะเบียนให้ตรงครับ")
        else:
            target = bill_po if bill_ok else sys_po
            if bad_fmt:
                why = 'เลขในทะเบียนพิมพ์ผิดรูปแบบ'
            elif po_key(reg_po) in po_map:
                o = po_map[po_key(reg_po)]
                o_co, o_bill = co_short(o.get('บริษัท(ระบบ)')), str(o.get('บิล(ระบบ)') or o.get('บิล(ชีท)') or '').strip()
                why = (f"PO {po_key(reg_po)} ในระบบจัดซื้อเป็นของ {o_co}" if co_key(o_co)[:6] != co_key(b['comp'])[:6]
                       else f"PO {po_key(reg_po)} ในระบบจัดซื้อเป็นของบิล {o_bill or 'อื่น'}")
            else:
                why = f"ไม่พบ PO {po_key(reg_po)} ในระบบจัดซื้อ"
            src = 'บิลและระบบจัดซื้อตรงกัน' if sys_po == target else ('ตามบิล' if bill_ok else 'ตามระบบจัดซื้อ')
            lines.append(f"  ขอแก้ PO ในทะเบียนเป็น {target} ({src}) เพราะ{why}")
        po_fix.append('\n'.join(lines))
digits = [re.sub(r'\D', '', p) for *_, p in proj]
mode_len = collections.Counter(len(d) for d in digits).most_common(1)[0][0] if digits else 0
TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
cur_m = next(i + 1 for i, t in enumerate(TH_MONTH) if A.month.startswith(t))


def proj_odd(p):
    """เลขโครงการรูปแบบ ปีMM… — คืนเหตุผลที่ขอตรวจ (ความยาวต่างจากส่วนใหญ่ หรือ MM ไม่อยู่ใน 6 เดือนย้อนหลัง) · ปกติ = None"""
    d = re.sub(r'\D', '', p)
    if len(d) != mode_len:
        return f'มี {len(d)} หลัก เลขโครงการส่วนใหญ่ของเดือนนี้มี {mode_len} หลัก'
    mm = int(d[2:4]) if d[2:4].isdigit() else 0
    if not (1 <= mm <= 12 and (cur_m - mm) % 12 <= 6):
        return f'หลักที่ 3–4 (เลขเดือน) เป็น {d[2:4]} ไม่อยู่ในช่วงเดือนที่ออกเลขโครงการ'
    return None


proj_fix = [f"- {rf} · PO {p_po} · บิล {bl}\n  เลขโครงการ {p} ขอตรวจอีกครั้ง เพราะ{proj_odd(p)}"
            for rf, p_po, bl, p in proj if proj_odd(p)]

L1 = [f'แจ้งจากคลังยา : ทะเบียนคุมส่งบัญชี ชีท {names[0].strip()} ขอแก้จุดพิมพ์ดังนี้ครับ', '']
if co_fix:
    L1.append('ชื่อบริษัท')
    for (wrong, right), refs in co_fix.items():
        L1.append(f'- ในทะเบียนพิมพ์ "{wrong}" ขอแก้เป็น "{right}" เพราะชื่อบริษัทในบิลเป็น {right}')
        L1 += [f'  · {x}' for x in refs]
    L1.append('')
if po_fix:
    L1.append('เลข PO')
    L1 += po_fix
    L1.append('')
if proj_fix:
    L1.append('เลขโครงการ ขอตรวจอีกครั้ง')
    L1 += proj_fix
    L1.append('')
L1.append(f'ยอดรวมทั้งเดือนตรงกับคลัง {len(bills)} บิล {money(reg_total)} บาท ครับ' if abs(sent_total - reg_total) < 0.01 else f'ยอดรวมในทะเบียน {money(reg_total)} บาท · คลัง {money(sent_total)} บาท ขอตรวจสอบครับ')

# ── ชุด 2 บิลค้าง: จัดกลุ่มตามสถานะตรวจรับ แล้วตามสถานะ PO
hand ={r['เลขที่บิล'].strip(): r for r in csv.DictReader(open(os.path.join(HAND, '_ทะเบียนส่งบิลจัดซื้อ.csv'), encoding='utf-8-sig'))}
ok_insp = set()
for r in csv.DictReader(open(INSP, encoding='utf-8-sig')):
    if not any('ยกเลิก' in str(v) for v in r.values()):
        ok_insp.add(r['เลขที่บิล'].strip())

pend = collections.OrderedDict()
for x in rows:
    if str(x['M']).startswith('ซื้อยา') and x['B'] != 'ส่งแล้ว':
        e = pend.setdefault(str(x['R']).strip(), dict(bill=str(x['R']).strip(), co=co_short(x['Q']), po=po_key(x['AW']), rows=[]))
        e['rows'].append(x)
for e in pend.values():
    pj = lambda x: num(x['P']) * num(x['J'])
    e['val'] = sum(pj(x) for x in e['rows'])
    e['done'] = sum(pj(x) for x in e['rows'] if x['C'] == 'ตรวจรับแล้ว')
    e['left'] = [x for x in e['rows'] if x['C'] != 'ตรวจรับแล้ว']
    e['nondrug'] = all(x['G'] == 'เวชภัณฑ์มิใช่ยา' for x in e['rows'])
    p = po_map.get(e['po'], {})
    e['partial'] = str(p.get('ผล', '')).startswith('ส่งบางส่วน')
    e['known'] = bool(p)
    e['po_amt'] = num(float(p['ยอดPO'])) if p.get('ยอดPO') else 0
pkey_sort = lambda e: (float(e['po']) if re.fullmatch(r'\d+\.\d+', e['po']) else 9e9, e['bill'])
all_p = sorted(pend.values(), key=pkey_sort)
g1 = [e for e in all_p if e['done'] > 0]
g2 = [e for e in all_p if e['done'] == 0]
g21 = [e for e in g2 if e['partial']]
g22 = [e for e in g2 if e['known'] and not e['partial']]
g23 = [e for e in g2 if not e['known']]
tot = lambda l: sum(e['val'] for e in l)
tag = lambda e: ' (มิใช่ยา)' if e['nondrug'] else ''
head = lambda title, l: f'{title} {len(l)} บิล {money(tot(l))} บาท'

L2 = [f'แจ้งจากคลังยา : สรุปบิลเดือน {A.month}', '',
      f'ส่งบัญชีแล้ว {len(bills)} บิล {money(reg_total)} บาท',
      f'ยังไม่ส่งบัญชี {len(all_p)} บิล {money(tot(all_p))} บาท ยกไปเดือนถัดไป', '',
      head('1) ตรวจรับแล้ว ยังไม่ส่งบัญชี', g1)]
for e in g1:
    extra = ''
    if e['left']:
        names_left = ', '.join(sorted({' '.join(str(x['H']).split(',')[0].split())[:24] for x in e['left']}))
        extra = f" (ตรวจแล้ว {amt(e['done'])} เหลือ {names_left} {amt(e['val'] - e['done'])})"
    L2.append(f"- PO {e['po']} {e['co']} {e['bill']} {amt(e['val'])}{extra}{tag(e)}")
L2 += ['', head('2) ยังไม่ตรวจรับ ยังไม่ส่งบัญชี', g2), '', head('2.1 PO ของยังมาไม่ครบ', g21)]
groups = collections.OrderedDict()
for e in g21:
    groups.setdefault(e['po'], []).append(e)
for po, l in groups.items():
    L2.append(f"- PO {po} {l[0]['co']} " + ' + '.join(f"{e['bill']} {amt(e['val'])}" for e in l) + f" (PO {amt(l[0]['po_amt'])})")
L2 += ['', head('2.2 ของครบตาม PO รอชุดตรวจรับ', g22)]
L2 += [f"- PO {e['po']} {e['co']} {e['bill']} {amt(e['val'])}{tag(e)}" for e in g22]
if g23:
    L2 += ['', head('2.3 ยังไม่พบ PO ในระบบ', g23)]
    L2 += [f"- PO {e['po']} {e['co']} {e['bill']} {amt(e['val'])}{tag(e)}" for e in g23]
unsigned = collections.OrderedDict()
for e in all_p:
    h = hand.get(e['bill'])
    if h and h.get('จัดซื้อเซ็นรับ') not in ('✓', 'ไม่ใช้ใบนี้'):
        unsigned.setdefault(h['เลขที่ใบ'], []).append(e['bill'])
if unsigned:
    L2.append('')
    L2 += [f"ใบส่งบิล {k} ({', '.join(v)}) ยังไม่ได้เซ็นรับ ขอตรวจสอบด้วยครับ" for k, v in unsigned.items()]

# ── ข้อสังเกตสำหรับคลัง ไม่ส่งจัดซื้อ
for e in g1:
    if e['bill'] not in ok_insp:
        notes.append(f"บิล {e['bill']} ชีทเป็นตรวจรับแล้ว แต่ไม่มีใบ ตร. ที่ใช้งานอยู่ — ยืนยันก่อนส่งข้อความ")
for e in all_p:
    if e['bill'] not in hand and not e['bill'].startswith('IT'):  # IT… = บิลยาเสพติด ไม่ออกใบส่งบิล
        notes.append(f"บิล {e['bill']} ยังไม่อยู่ในทะเบียนส่งบิลจัดซื้อ")
if abs(tot(g1) + tot(g21) + tot(g22) + tot(g23) - tot(all_p)) > 0.005:
    notes.append('⛔ ผลรวมกลุ่มไม่เท่ายอดค้าง')

text = '\n'.join(['ชุด 1: พิมพ์ตกหล่น', '-' * 40] + L1 + ['', 'ชุด 2: บิลที่ยังไม่ส่งบัญชี', '-' * 40] + L2)
out = os.path.join(OUT_DIR, f'แจ้งจัดซื้อ_{A.month}.txt')
with open(out, 'w', encoding='utf-8-sig', newline='\r\n') as fh:
    fh.write(text + '\n')
print(text)
print('\n── ข้อสังเกตสำหรับคลัง (ไม่ส่งจัดซื้อ) ──')
print('ไฟล์สรุป:', reg_path)
print('\n'.join(notes) if notes else 'ไม่มี')
print('เซฟ', out)
