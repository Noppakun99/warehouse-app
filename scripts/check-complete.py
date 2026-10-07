# เช็คครบ — งานเอกสารคลังที่ทำค้างไว้ครบหรือยัง (อ่านอย่างเดียว ไม่เขียนไฟล์ใด)
# ใช้: python scripts/check-complete.py
# ตรวจ 7 ข้อ: โฟลเดอร์พักว่าง · รูปใบเบิกมี PDF คู่ · PDF อยู่ในทะเบียนพิมพ์ (+ ที่ยังไม่พิมพ์)
#            · รูปบิลมีแถวดัชนี / แถวดัชนีมีไฟล์จริง · แถวรับยามีแถว Master · บิลซื้อยังไม่ส่งจัดซื้อ
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
RECV_XLSM = os.path.join(HOME, r'OneDrive\รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm')
STOCK_XLSM = os.path.join(HOME, r'OneDrive\ยอดคลังยา_69.xlsm')

# จุดเริ่มของแต่ละระบบ — ก่อนหน้านี้ไม่เคยทำ จึงไม่นับ (ไม่งั้นเตือนของเก่าหลายพันรายการ)
MASTER_SINCE = datetime.datetime(2026, 10, 3)    # ต้นงวด ต.ค.69 (วันขึ้นเดือนจริง) — แก้ทุกครั้งที่ขึ้นเดือน
HANDOVER_SINCE = datetime.datetime(2026, 10, 5)  # ใบส่งบิลจัดซื้อใบแรก สบ.70/001
NEW_NAME = re.compile(r'^\d{4}-\d{2}-\d{2}_')   # รูปบิลที่ตั้งชื่อแบบดัชนี (เริ่ม 05/10/2569)

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
n = 0
for p in imgs:
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

# 5) + 6) อ่านชีทรับยา / Master (ค่าที่ Excel คำนวณไว้ตอน Save ล่าสุด)
wr = openpyxl.load_workbook(RECV_XLSM, read_only=True, data_only=True)
recv = []
for i, r in enumerate(wr['รับยา'].iter_rows(min_row=2, max_col=18, values_only=True), 2):
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

print(f'\n{"ครบทุกข้อ" if problems == 0 else f"ไม่ครบ {problems} จุด"}')
