# เช็คครบ — งานเอกสารคลังที่ทำค้างไว้ครบหรือยัง (อ่านอย่างเดียว ไม่เขียนไฟล์ใด)
# ใช้: python scripts/check-complete.py
# ตรวจ 9 ข้อ: โฟลเดอร์พักว่าง · รูปใบเบิกมี PDF คู่ · PDF อยู่ในทะเบียนพิมพ์ (+ ที่ยังไม่พิมพ์)
#            · รูปบิลมีแถวดัชนี / แถวดัชนีมีไฟล์จริง · รูปตรวจรับรอถ่ายซ้ำ · แถวรับยามีแถว Master · บิลซื้อยังไม่ส่งจัดซื้อ
#            · รายการตรวจรับที่มีรูปอยู่ในเอกสารสรุปตรวจรับ (ตร.) + ผู้ตรวจรับเซ็นภายใน 7 วัน
#            · บิลซื้อลง "ยามาส่ง" ในระบบติดตามการสั่งซื้อของจัดซื้อแล้ว (อ่านระบบผ่านเน็ต — scripts/po_match.py)
#            · ใบเบิกศูนย์/รพ.สต. มีชีทในไฟล์สรุปเบิกยา · นัดเตือน (_นัดเตือน.csv)
#            · รายงานแจ้งซื้อยารอบล่าสุดมีสำเนาส่งหัวหน้า
import csv, datetime, glob, os, re, sys, warnings

import openpyxl

sys.stdout.reconfigure(encoding='utf-8')
warnings.filterwarnings('ignore')

HOME = r'C:\Users\PRH0000484'
INBOX = os.path.join(HOME, r'OneDrive\เอกสารคลังยา_รอลง')
REQ_IMG = os.path.join(HOME, r'Desktop\รวมเบิกยา\ใบเบิก_รูป')
REQ_PDF = os.path.join(HOME, r'Desktop\รวมเบิกยา\PDF')
PRINT_LOG = os.path.join(REQ_PDF, '_สถานะพิมพ์.csv')
BILL_DIR = os.path.join(HOME, r'Desktop\บิลยา_ตรวจรับ')
BILL_INDEX = os.path.join(BILL_DIR, '_ดัชนีบิล.csv')
HANDOVER = os.path.join(HOME, r'Desktop\ยอดคงคลัง\ส่งบิลให้พี่โก้\_ทะเบียนส่งบิลจัดซื้อ.csv')
INSPECT_ACK = os.path.join(HOME, r'Desktop\ยอดคงคลัง\เอกสารตรวจรับ\_ทะเบียนเอกสารตรวจรับ.csv')
RECV_XLSM = os.path.join(HOME, r'OneDrive\รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm')
STOCK_XLSM = os.path.join(HOME, r'OneDrive\ยอดคลังยา_69.xlsm')

# จุดเริ่มของแต่ละระบบ — ก่อนหน้านี้ไม่เคยทำ จึงไม่นับ (ไม่งั้นเตือนของเก่าหลายพันรายการ)
MASTER_SINCE = datetime.datetime(2026, 10, 3)    # ต้นงวด ต.ค.69 (วันขึ้นเดือนจริง) — แก้ทุกครั้งที่ขึ้นเดือน
HANDOVER_SINCE = datetime.datetime(2026, 10, 5)  # ใบส่งบิลจัดซื้อใบแรก สบ.70/001
NEW_NAME = re.compile(r'^\d{4}-\d{2}-\d{2}_')   # รูปบิลที่ตั้งชื่อแบบดัชนี (เริ่ม 05/10/2569)
RESHOOT_DAYS = 7                                  # รูปตรวจรับรอถ่ายซ้ำค้างเกินนี้ = เตือนหนัก (user เลือก 08/10/2569)
ACK_SINCE = datetime.datetime(2026, 10, 1)       # = SINCE ใน inspection_ack.py — รอบ 05–20/10 อยู่ใน ตร.70/002 (ออกใหม่ 21/10/2569)
ACK_SIGN_DAYS = 7                                 # ออกเอกสารแล้วผู้ตรวจรับยังไม่เซ็น ค้างเกินนี้ = ไม่ครบ

problems = 0


def head(title):
    print(f'\n■ {title}')


def bad(msg):
    global problems
    problems += 1
    print(f'  ✗ {msg}')


def ok(msg):
    print(f'  ✓ {msg}')


def read_csv(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def be(d):
    return f'{d.day:02d}/{d.month:02d}/{d.year + 543}'


# 1) โฟลเดอร์พักว่าง
head('โฟลเดอร์พัก (OneDrive\\เอกสารคลังยา_รอลง)')
left = [os.path.relpath(p, INBOX) for p in glob.glob(os.path.join(INBOX, '*', '*')) if os.path.isfile(p)]
for p in left:
    bad(f'ยังไม่ได้ลง: {p}')
if not left:
    ok('ว่างทุกโฟลเดอร์')

# 2) รูปใบเบิกมี PDF คู่  (รูป <ว.ด.ปป>_<หน่วยงาน>_<ประเภท>.<ext> ↔ PDF\**\<หน่วยงาน> <ประเภท>_<ว.ด.ปป>.pdf)
head('รูปใบเบิก ↔ PDF')
pdfs = {os.path.basename(p): os.path.relpath(p, REQ_PDF) for p in glob.glob(os.path.join(REQ_PDF, '**', '*.pdf'), recursive=True)
        if not os.path.relpath(p, REQ_PDF).startswith('รอพิมพ์')}   # สำเนาในที่พักรอพิมพ์ไม่ใช่ต้นฉบับ
imgs = [p for p in glob.glob(os.path.join(REQ_IMG, '*', '*')) if os.path.isfile(p)]
# รูปที่เก็บเป็นหลักฐานอย่างเดียว ไม่ได้ลงชีทเบิก จึงไม่มี PDF (ชื่อไฟล์ → เหตุผล)
NO_PDF = {
    '16.10.69_ปฐมภูมิ_คืนยาน้ำท่วม_เก็บห้องยาG.jpg': 'ปฐมภูมิคืนยาน้ำท่วม 109 ชุด เก็บห้องยาG ไม่ลง Master (user ตกลง 19/10/2569)',
    '22.10.69_ห้องยาG_ยา_ปก.jpg': 'หน้าปกใบเบิก บย.70/0023 — รายการ/PDF อยู่กับรูป 22.10.69_ห้องยาG_ยา.jpg',
}
n = 0
for p in imgs:
    if os.path.basename(p) in NO_PDF:
        n += 1
        continue
    m = re.match(r'^(.+?)_(.+)_([^_]+)$', os.path.splitext(os.path.basename(p))[0])
    if not m:
        bad(f'ชื่อรูปไม่ตามแบบ <วันที่>_<หน่วยงาน>_<ประเภท>: {os.path.relpath(p, REQ_IMG)}')
        continue
    want = f'{m.group(2)} {m.group(3)}_{m.group(1)}.pdf'
    if want in pdfs:
        n += 1
    else:
        bad(f'ไม่มี PDF "{want}" ของรูป {os.path.relpath(p, REQ_IMG)}')
ok(f'มี PDF คู่ {n}/{len(imgs)} รูป')

# 3) PDF ที่ทำตั้งแต่เริ่มทะเบียน อยู่ใน _สถานะพิมพ์.csv + รายการที่ยังไม่ยืนยันพิมพ์
head('ทะเบียนสถานะพิมพ์ PDF ใบเบิก')
plog = read_csv(PRINT_LOG)
listed = {r['ไฟล์ (ใต้ รวมเบิกยา\\PDF)'] for r in plog}
first = min(datetime.datetime.strptime(r['วันที่ทำ PDF'][:10], '%d/%m/%Y') for r in plog)
first = first.replace(year=first.year - 543)
for name, rel in sorted(pdfs.items()):
    mtime = datetime.datetime.fromtimestamp(os.path.getmtime(os.path.join(REQ_PDF, rel)))
    if mtime >= first and rel not in listed:
        bad(f'PDF ไม่อยู่ในทะเบียน: {rel} (แก้ล่าสุด {mtime:%d/%m %H:%M})')
for r in plog:
    if not os.path.exists(os.path.join(REQ_PDF, r['ไฟล์ (ใต้ รวมเบิกยา\\PDF)'])):
        bad(f'ทะเบียนชี้ไฟล์ที่ไม่มีจริง: {r["ไฟล์ (ใต้ รวมเบิกยา\\PDF)"]}')
unprinted = [r['ไฟล์ (ใต้ รวมเบิกยา\\PDF)'] for r in plog if not r['พิมพ์แล้ว'].strip()]
ok(f'ทะเบียน {len(plog)} ไฟล์ · พิมพ์แล้ว {len(plog) - len(unprinted)}')
for f in unprinted:
    print(f'  … ยังไม่ยืนยันพิมพ์: {f}')
# โฟลเดอร์ PDF\รอพิมพ์\<วันที่เบิก>\ (scripts/print-queue.py) ต้องมีสำเนาครบทุกใบที่ยังไม่พิมพ์ ไม่งั้นพิมพ์ตกหล่น
import json
qdir = os.path.join(REQ_PDF, 'รอพิมพ์')
man_path = os.path.join(qdir, '_รายการ.json')
man = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) else {}
lost_copy = [r for r, d in man.items() if not os.path.exists(os.path.join(qdir, d, os.path.basename(r)))]
if sorted(man) != sorted(unprinted) or lost_copy:
    bad(f'โฟลเดอร์รอพิมพ์ไม่ตรงทะเบียน (ในโฟลเดอร์ {len(man)} · รอพิมพ์ {len(unprinted)}) — รัน python scripts/print-queue.py')
elif man:
    ok(f'โฟลเดอร์รอพิมพ์ตรงทะเบียน ({len(man)} ใบ · {len(set(man.values()))} วันเบิก)')

# 4) รูปบิลแบบใหม่มีแถวดัชนี + แถวดัชนีชี้ไฟล์ที่มีจริง
head('รูปบิล / ใบคืน / รูปตรวจรับ ↔ _ดัชนีบิล.csv')
idx = read_csv(BILL_INDEX)
indexed = {os.path.normcase(r['ไฟล์รูป']) for r in idx}
photos = [p for p in glob.glob(os.path.join(BILL_DIR, '*', '*')) if os.path.isfile(p) and NEW_NAME.match(os.path.basename(p))]
miss, extra = [], 0
for p in photos:
    if os.path.normcase(p) in indexed:
        continue
    # รูปประกอบ <prefix>_รูปของ_N พ่วงกับแถวดัชนีของยาตัวเดียวกัน (<prefix>_รูปกล่อง/_กล่องlot ฯลฯ) ไม่ต้องมีแถวเอง
    m = re.match(r'^(.+)_รูปของ_\d+\.\w+$', p, re.I)
    if m and any(f.startswith(os.path.normcase(m.group(1)) + '_') for f in indexed):
        extra += 1
        continue
    miss.append(p)
for p in miss:
    bad(f'ไม่มีในดัชนี: {os.path.relpath(p, BILL_DIR)}')
gone = sorted({r['ไฟล์รูป'] for r in idx if not os.path.exists(r['ไฟล์รูป'])})
for p in gone:
    bad(f'ดัชนีชี้ไฟล์ที่ไม่มีจริง: {p}')
ok(f'รูปแบบใหม่ {len(photos)} ไฟล์ · มีแถวดัชนี {len(photos) - len(miss) - extra} · รูปประกอบ {extra} · ดัชนี {len(idx)} แถว')

# 4b) รูปตรวจรับรอถ่ายซ้ำ — กรรมการตรวจด่วนก่อนชุดโครงการ (บิล) ตามมา รูปจึงไม่มีบิลในภาพ (CONTEXT.md §รูปตรวจรับรอถ่ายซ้ำ)
#     แถวดัชนีหมายเหตุ "รอถ่ายซ้ำ" รายยา · ถ่ายซ้ำแล้วแก้เป็น "ถ่ายซ้ำแล้ว <วันที่>" · ค้างครบ RESHOOT_DAYS วัน = ต้องถามจัดซื้อ
head('รูปตรวจรับรอถ่ายซ้ำ (ไม่มีบิลในภาพ)')
today = datetime.date.today()
pend = [r for r in idx if 'รอถ่ายซ้ำ' in r['หมายเหตุ'] and 'ถ่ายซ้ำแล้ว' not in r['หมายเหตุ']]
for r in pend:
    m = re.search(r'ตรวจรับ (\d{2})/(\d{2})/(\d{4})', r['หมายเหตุ'])
    age = (today - datetime.date(int(m.group(3)) - 543, int(m.group(2)), int(m.group(1)))).days if m else None
    what = f'บิล {r["เลขที่บิล"]} {r["รายการยา"]} lot {r["Lot"]} (ตรวจรับ {m.group(0)[8:] if m else "?"})'
    if age is None or age >= RESHOOT_DAYS:
        bad(f'{what} — ค้าง {age if age is not None else "?"} วัน · ถามจัดซื้อว่าชุดโครงการบิลนี้อยู่ไหน')
    else:
        print(f'  … {what} — รอชุดโครงการมาถ่ายซ้ำ ({age} วัน)')
if not pend:
    ok('ไม่มีรูปตรวจรับค้างถ่ายซ้ำ')

# 5) + 6) อ่านชีทรับยา / Master (ค่าที่ Excel คำนวณไว้ตอน Save ล่าสุด)
wr = openpyxl.load_workbook(RECV_XLSM, read_only=True, data_only=True)
recv, recv_raw = [], []
for i, r in enumerate(wr['รับยา'].iter_rows(min_row=2, max_col=18, values_only=True), 2):
    recv_raw.append(r)
    if not r[3]:
        continue
    recv.append(dict(row=i, code=str(r[1] or '').strip(), name=str(r[3]).strip(), status=str(r[4] or '').strip(),
                     lot=str(r[5] or '').strip() or '-', bill=str(r[7] or '').strip(), qty=r[9],
                     date=r[14] if isinstance(r[14], datetime.datetime) else None, company=str(r[17] or '').strip()))
ws = openpyxl.load_workbook(STOCK_XLSM, read_only=True, data_only=True)
master = set()
for r in ws['Master'].iter_rows(min_row=2, max_col=18, values_only=True):
    if r[5] is not None:
        master.add((str(r[5]).strip(), str(r[10] or '').strip() or '-', str(r[17] or '').strip()))

head(f'แถวรับยา (วันรับตั้งแต่ {be(MASTER_SINCE)}) ↔ Master (รหัส+lot+เลขบิล)')
cur = [x for x in recv if x['date'] and x['date'] >= MASTER_SINCE]
lost = [x for x in cur if (x['code'], x['lot'], x['bill']) not in master]
for x in lost:
    bad(f'รับยา!{x["row"]} {x["code"]} {x["name"]} lot {x["lot"]} บิล {x["bill"]} ({x["status"]}) — ไม่มีแถว Master')
ok(f'{len(cur) - len(lost)}/{len(cur)} แถวมีคู่ใน Master')

# 7) บิลซื้อที่ยังไม่อยู่ในทะเบียนส่งบิลจัดซื้อ (key = เลขบิล + วันรับ ตามสคริปต์ bill_handover)
head(f'บิลซื้อ (วันรับตั้งแต่ {be(HANDOVER_SINCE)}) ↔ _ทะเบียนส่งบิลจัดซื้อ.csv')
sent = {(r['เลขที่บิล'].strip(), r['วันที่รับ'].strip()) for r in read_csv(HANDOVER)}
unsigned = sorted({r['เลขที่ใบ'] for r in read_csv(HANDOVER) if not r['จัดซื้อเซ็นรับ'].strip()})
bills = {}
for x in recv:
    if x['status'] == 'การซื้อ' and x['date'] and x['date'] >= HANDOVER_SINCE:
        bills.setdefault((x['bill'], be(x['date'])), x)
todo = [(k, v) for k, v in bills.items() if k not in sent]
for (bill, d), x in todo:
    bad(f'ยังไม่ส่งจัดซื้อ: บิล {bill} รับ {d} {x["company"]}')
ok(f'{len(bills) - len(todo)}/{len(bills)} บิลส่งแล้ว')
for s in unsigned:
    print(f'  … ใบส่ง {s} จัดซื้อยังไม่เซ็นรับ')

# 7a) ตรวจรับแล้ว ↔ หลักฐาน — รายการที่มีรูปตรวจรับ (บิลในภาพ) ต้องอยู่ในเอกสารสรุปตรวจรับ (scripts/inspection_ack.py)
#     ไม่มีรูป = ไม่อยู่ในใบ แสดงเป็น … (ถ่ายซ้ำได้เฉพาะบิลเดือนปัจจุบัน / user ตัดสินรายกรณี) · ไม่นับใบที่ยกเลิก
#     เฉพาะแถว การซื้อ — ของแถม/บริจาค/สนับสนุน ไม่ต้องให้ผู้ตรวจรับยาซื้อเซ็น (user 21/10/2569)
#     นิยาม CONTEXT §เอกสารสรุปตรวจรับ (21/10/2569) · ตรรกะจับคู่รูป/ทะเบียนใช้ตัวเดียวกับ inspection_ack.py
from inspection_ack import photo_index, issued, is_issued, is_cancelled  # noqa: E402
head(f'ตรวจรับแล้ว (ตั้งแต่ {be(ACK_SINCE)}) ↔ เอกสารสรุปตรวจรับ / หลักฐาน')
ack_all = read_csv(INSPECT_ACK) if os.path.exists(INSPECT_ACK) else []
ack = [r for r in ack_all if not is_cancelled(r)]
iss, ack_photos = issued(ack_all), photo_index()
rounds, waiting = {}, {}
for r in recv_raw:
    if r[3] and str(r[15] or '').strip() == 'ตรวจรับแล้ว' and isinstance(r[16], datetime.datetime) and r[16] >= ACK_SINCE:
        bill = str(r[7]).strip() if r[7] not in (None, '', '-') else f'(ไม่มีเลขบิล) {r[1]}'
        code, purchase = str(r[1]).strip(), str(r[4] or '').strip() == 'การซื้อ'
        if not purchase or is_issued(iss, bill, str(r[17] or '-').strip(), be(r[16]), code, purchase):
            continue
        tgt = rounds if (str(r[7]).strip(), code, purchase) in ack_photos else waiting
        tgt.setdefault(be(r[16]), []).append(bill)
for d, bs in sorted(rounds.items()):
    bad(f'ยังไม่ออกเอกสารสรุปตรวจรับ รอบ {d} ({len(set(bs))} บิล {len(bs)} รายการ มีรูปแล้ว) — python scripts/inspection_ack.py --date {d}')
for d, bs in sorted(waiting.items()):
    print(f'  … รอบ {d} ไม่มีรูปตรวจรับ {len(bs)} รายการ ({len(set(bs))} บิล) — ไม่อยู่ในใบ ตร. รอถ่ายซ้ำ/user ตัดสิน')
docs = {}
for r in ack:
    docs.setdefault(r['เลขที่ใบ'], []).append(r)
n_signed = 0
for no, rs in docs.items():
    if all(x['ผู้ตรวจรับเซ็น'].strip() for x in rs):
        n_signed += 1
        continue
    d, m, y = (int(v) for v in rs[0]['วันที่ออก'].split('/'))
    age = (today - datetime.date(y - 543, m, d)).days
    qds = sorted({x['วันที่ตรวจรับ'] for x in rs}, key=lambda s: s.split('/')[::-1])
    what = f'{no} (ตรวจรับ {qds[0] if len(qds) == 1 else qds[0] + "–" + qds[-1]}) ผู้ตรวจรับยังไม่เซ็น · ออกมา {age} วัน'
    if age >= ACK_SIGN_DAYS:
        bad(what + ' · ตามผู้ตรวจรับเซ็น')
    else:
        print(f'  … {what}')
if not rounds:
    n_cancel = len({r['เลขที่ใบ'] for r in ack_all if is_cancelled(r)})
    ok(f'ออกเอกสารครบทุกรายการที่มีรูป · ทะเบียน {len(docs)} ใบ · เซ็นแล้ว {n_signed} · ยกเลิก {n_cancel}')

# 7b) บิลซื้อ ↔ ระบบติดตามการสั่งซื้อของจัดซื้อ (Apps Script) — คลังลง "ยามาส่ง" เฉพาะแท็บคลังยา (user สั่ง 15/10/2569)
#     บิลรับเข้าแล้วแต่ PO ในระบบยังรอยามาส่ง / ยอดไม่ตรง / ช่อง PO ในชีทว่าง = ไม่ครบ → python scripts/po_match.py [--commit]
head('บิลซื้อ ↔ ระบบติดตามการสั่งซื้อ (แท็บคลังยา)')
try:
    import po_match
    po_rows = po_match.call('api_bootstrap')['rows']
except Exception as e:  # เน็ตคลังล่ม ต.ค.69 (memory internet-outage-oct69) — ตรวจไม่ได้ ≠ ครบ
    po_rows = None
    bad(f'เชื่อมระบบจัดซื้อไม่ได้ ({type(e).__name__}) — ตรวจข้อนี้ไม่ได้ ลองใหม่เมื่อเน็ตใช้ได้')
if po_rows is not None:
    po_out, po_todo = po_match.match(po_rows, po_match.bills_from_rows(recv_raw, po_match.po_since(po_rows)))
    for r in po_out:
        if po_match.is_problem(r['ผล']):
            bad(f"{r['เลขที่PO']} บิล {r.get('บิล(ชีท)', '') or '-'} — {r['ผล']}")
    late = [r for r in po_out if r['ผล'] == 'รอยามาส่ง — เกินกำหนด']
    for r in late:
        print(f"  … {r['เลขที่PO']} ยาเกิน {po_match.OVERDUE_DAYS} วันยังไม่มาส่ง (ออก PO {r['วันที่ออกPO']}) {r['บริษัท(ระบบ)']}")
    # ส่งบางส่วน = ยังไม่ลงระบบโดยเจตนา (ลงครั้งเดียวเมื่อครบ PO) — ไม่ใช่ปัญหา แต่ต้องรู้ว่ารอบิลที่เหลือ
    #   บริษัทไม่ส่งส่วนที่เหลือแล้ว (จัดซื้อยืนยัน) → python scripts/po_match.py --short-ok "<เลข PO>" --commit
    for r in po_out:
        if r['ผล'].startswith('ส่งบางส่วน'):
            print(f"  … {r['เลขที่PO']} {r['ผล']} · บิล {r['บิล(ชีท)']}")
    n_done = sum(1 for r in po_out if r['ผล'].startswith('ตรงกัน'))
    n_wait = sum(1 for r in po_out if r['ผล'].startswith('รอยามาส่ง'))
    ok(f'PO ในระบบ {len(po_rows)} ใบ · ลงยามาส่งตรงชีทแล้ว {n_done} · รอยามาส่ง {n_wait}')

# 8) ใบเบิกหน่วยงานภายนอก (PDF ใต้ รพสต_เทศบาล\<ศูนย์>\) ต้องมีชีทชื่อ <ว.ด.ปป> ในไฟล์สรุปของศูนย์นั้น
#    (ไฟล์สรุปส่งไลน์ให้ศูนย์ — memory rpst-dispense-summary) · นับเฉพาะปีงบ 70 ขึ้นไป (เริ่มทำไฟล์สรุปทุกใบ)
head('ใบเบิกศูนย์/รพ.สต. ↔ ชีทในไฟล์สรุปเบิกยา')
RPST_PDF = os.path.join(REQ_PDF, 'รพสต_เทศบาล')
RPST_XLSX = os.path.join(HOME, r'Desktop\รพ.สต_เบิกยา')
RPST_MAP = {   # โฟลเดอร์ PDF → โฟลเดอร์ไฟล์สรุป
    'ศ.1': 'ศูนย์บริการสาธารณสุข 1 (ชุมชนสินสมุทร)',
    'ศ.2': 'ศูนย์บริการสาธารณสุข 2 (ชุมชนรัตนโกสินทร์)',
    'ศ.3': 'ใบเบิกเวชภัณฑ์ ศ.3_เทศบาล',
    'ศ.4': 'รพสต.ศูนย์4 บริการสาธารณสุข 4 (สิริเวชชะพันธ์อุปถัมภ์)',
    'รพสต คูคต': 'รพ.สต.คูฅต_พี่โบว์',
    'เทศบาลนครรังสิต': 'เทศบาลนครรังสิต',
    'วัดประยูร': 'ใบเบิกยารพ.สต.วัดประยุร',
}
RPST_CANCELLED = {   # ใบที่ยกเลิก — PDF ยังอยู่ (คู่รูปใบเบิกในข้อ "รูปใบเบิก ↔ PDF") แต่ไม่ต้องมีชีทสรุป
    ('ศ.1', '1.10.69'),
}
n_rpst = n_rpst_ok = 0
for sub in sorted(os.listdir(RPST_PDF)):
    pdir = os.path.join(RPST_PDF, sub)
    if not os.path.isdir(pdir):
        continue
    want = []
    for p in glob.glob(os.path.join(pdir, '*.pdf')):
        m = re.search(r'_(\d{1,2})\.(\d{1,2})\.(\d{2})\.pdf$', p)
        if m and (int(m.group(3)) * 100 + int(m.group(2))) >= 6910:
            d = f'{int(m.group(1))}.{int(m.group(2))}.{m.group(3)}'
            if (sub, d) not in RPST_CANCELLED:
                want.append(d)
    if not want:
        continue
    if sub not in RPST_MAP:
        bad(f'โฟลเดอร์ PDF {sub} ยังไม่ผูกกับไฟล์สรุป — เพิ่มใน RPST_MAP')
        continue
    sheets = set()
    for x in glob.glob(os.path.join(RPST_XLSX, RPST_MAP[sub], '*.xlsx')):
        if not os.path.basename(x).startswith('~$'):
            sheets |= set(openpyxl.load_workbook(x, read_only=True).sheetnames)
    for d in sorted(set(want)):
        n_rpst += 1
        if d in sheets:
            n_rpst_ok += 1
        else:
            bad(f'ยังไม่ทำไฟล์สรุป: {sub} ใบ {d} (เพิ่มชีท "{d}" ในไฟล์สรุปของ {RPST_MAP[sub]})')
ok(f'{n_rpst_ok}/{n_rpst} ใบมีชีทสรุปแล้ว')

# 10) นัดเตือน — งานที่ระบบคลังมองไม่เห็นเอง เช่น ยา "สั่งเมื่อขอ" ที่กล่องอยู่ที่ห้องยา ใกล้หมดอายุแล้วต้องแลกเปลี่ยน/แจ้งซื้อ
#     (inventory ไม่มี lot นั้น จึงไม่มีระบบไหนเตือน — user ขอ 14/10/2569) · ถึงวันเริ่มเตือนแล้วยังไม่ทำ = ไม่ครบ
#     ทำเสร็จ → ใส่วันที่ในช่อง "เสร็จแล้ว" · เพิ่มนัดใหม่ = เพิ่มแถว (วันที่ พ.ศ. ว/ด/ปปปป)
REMIND = os.path.join(HOME, r'Desktop\ยอดคงคลัง\_นัดเตือน.csv')
head('นัดเตือน (Desktop\\ยอดคงคลัง\\_นัดเตือน.csv)')
if not os.path.exists(REMIND):
    ok('ไม่มีไฟล์นัดเตือน')
else:
    later = []
    for r in read_csv(REMIND):
        if (r.get('เสร็จแล้ว') or '').strip():
            continue
        m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})$', (r.get('เริ่มเตือน') or '').strip())
        if not m:
            bad(f'วันที่เริ่มเตือนอ่านไม่ได้: {r}')
            continue
        start = datetime.date(int(m.group(3)) - 543, int(m.group(2)), int(m.group(1)))
        what = f"{r.get('เรื่อง', '')} ({r.get('รหัส', '')}) — {r.get('รายละเอียด', '')}"
        if start <= today:
            bad(f'ถึงกำหนด {be(start)}: {what}')
        elif (start - today).days <= 30:
            print(f'  … อีก {(start - today).days} วัน ({be(start)}): {what}')
        else:
            later.append(start)
    if later:
        ok(f'นัดล่วงหน้า {len(later)} รายการ · ใกล้สุด {be(min(later))}')

# 11) รายงานแจ้งซื้อยารอบล่าสุด (A1 "UPDATE: วันที่ d/m/yy") ต้องมีสำเนาส่งหัวหน้า (สกิล purchase-request-report ขั้น 6b)
#     รอบ 9/10/2569 publish แล้วไม่ได้ส่ง ไม่มีใครเห็น 5 วัน (scrutinize 15/10/2569) · สำเนาวันที่ ≥ วันรอบ = ส่งแล้ว
REPORT = os.path.join(HOME, r'OneDrive\รายงานการซื้อยา_69.xlsx')
ARCHIVE_DIR = os.path.join(HOME, r'Desktop\ยอดคงคลัง\รายงานขอซื้อยา')
head('รายงานแจ้งซื้อยา ↔ สำเนาส่งหัวหน้า (Desktop\\ยอดคงคลัง\\รายงานขอซื้อยา)')
try:
    a1 = str(openpyxl.load_workbook(REPORT, read_only=True)['รายงานซื้อยา']['A1'].value or '')
except PermissionError:
    a1 = None
    print('  … อ่านรายงานไม่ได้ (เปิดอยู่ใน Excel) — ข้ามข้อนี้')
if a1 is not None:
    m = re.search(r'UPDATE:\s*วันที่\s*(\d{1,2})/(\d{1,2})/(\d{2,4})', a1)
    if not m:
        bad(f'อ่านวันที่รอบจาก A1 ไม่ได้: {a1[:60]!r}')
    else:
        y = int(m.group(3))
        y = y + 2500 - 543 if y < 100 else (y - 543 if y > 2400 else y)
        rnd = datetime.date(y, int(m.group(2)), int(m.group(1)))
        copies = []
        for p in glob.glob(os.path.join(ARCHIVE_DIR, 'รายงานการซื้อยา_*.xlsx')):
            n = re.match(r'รายงานการซื้อยา_(\d{1,2})\.(\d{1,2})\.(\d{2,4})', os.path.basename(p))
            if n:
                cy = int(n.group(3))
                cy = cy + 2500 - 543 if cy < 100 else cy
                copies.append(datetime.date(cy, int(n.group(2)), int(n.group(1))))
        sent = [c for c in copies if c >= rnd]
        if sent:
            ok(f'รอบ {be(rnd)} มีสำเนาส่งหัวหน้า ({be(min(sent))})')
        else:
            bad(f'รายงานแจ้งซื้อรอบ {be(rnd)} ยังไม่มีสำเนาส่งหัวหน้า — ทำขั้น 6b แล้วส่งหัวหน้า')

print(f'\n{"ครบทุกข้อ" if problems == 0 else f"ไม่ครบ {problems} จุด"}')
