# เช็คครบ — งานเอกสารคลังที่ทำค้างไว้ครบหรือยัง (อ่านอย่างเดียว ไม่เขียนไฟล์ใด)
# ใช้: python scripts/check-complete.py          (ย่อ: ตัดบรรทัด >160 ตัวอักษร · ข้อที่ผ่านหมดรวมบรรทัดเดียว)
#      python scripts/check-complete.py --full   (เต็มแบบเดิม — ใช้ตอนจะลงมือแก้เรื่องที่ถูกตัด เช่น นัดเตือน)
# ตรวจ 15 ข้อ: โฟลเดอร์พักว่าง · รูปใบเบิกมี PDF คู่ · PDF อยู่ในทะเบียนพิมพ์ (+ ที่ยังไม่พิมพ์)
#            · รูปบิลมีแถวดัชนี / แถวดัชนีมีไฟล์จริง · รูปตรวจรับรอถ่ายซ้ำ · แถวรับยามีแถว Master · บิลซื้อยังไม่ส่งจัดซื้อ
#            · รายการตรวจรับที่มีรูปอยู่ในเอกสารสรุปตรวจรับ (ตร.) + ผู้ตรวจรับเซ็นภายใน 7 วัน
#            · บิลซื้อลง "ยามาส่ง" ในระบบติดตามการสั่งซื้อของจัดซื้อแล้ว (อ่านระบบผ่านเน็ต — scripts/po_match.py)
#            · ใบเบิกศูนย์/รพ.สต. มีชีทในไฟล์สรุปเบิกยา · นัดเตือน (_นัดเตือน.csv)
#            · รายงานแจ้งซื้อยารอบล่าสุดมีสำเนาส่งหัวหน้า · ใบแจ้งย้ายที่เก็บ (แผนผัง) ลง Excel แล้ว
#            · ใบแจ้งยืม/รับคืนที่ออกในแอปลงทะเบียน รพ.ยืมยา แล้ว
#            · วิเคราะห์สั่งซื้อ!P2 ตรงสำเนางวดล่าสุด + ชีทเบิก AA:AC แถวงวดปิดว่าง (ขั้นมือตอนขึ้นเดือน)
#            · ยาต้องแพ็ค: ของแบบกล่องหมดใน 14 วันแล้วต่อด้วยกระปุก / มีของบริษัทที่ไม่อยู่ในทะเบียน
#            · ใบเบิกที่หน่วยงานส่งในแอปยังไม่ลงชีทเบิก (online-req.mjs --pending)
#            · ใบที่ลงชีท+พิมพ์แล้วแต่ในแอปยังไม่ติ๊กจัด/จ่าย → ถาม user (online-req.mjs --undispensed)
import csv, datetime, glob, os, re, sys, warnings

import openpyxl

sys.stdout.reconfigure(encoding='utf-8')
warnings.filterwarnings('ignore')

# โหมดย่อเป็นค่าเริ่มต้น (26/11/2569 ลด token — รันหลายรอบต่อ session · เต็ม ~20KB ย่อ ~9KB)
# บรรทัดยาวเกิน BRIEF_WIDTH ตัดท้าย · ข้อที่ผ่านหมด (✓ ล้วน) ยุบเป็นบรรทัดเดียวตอนจบ · --full = พิมพ์เต็มแบบเดิม
BRIEF_WIDTH = 160
if '--full' not in sys.argv:
    class _Brief:
        def __init__(self, raw):
            self.raw, self.buf, self.sec, self.passed = raw, '', None, []

        def _flush_sec(self):
            if not self.sec:
                return
            title, lines = self.sec
            if lines and all(l.lstrip().startswith('✓') for l in lines):
                self.passed.append(title.split('(')[0].strip())
            else:
                self.raw.write(f'\n■ {title}\n' + ''.join(l + '\n' for l in lines))
            self.sec = None

        def _line(self, line):
            if len(line) > BRIEF_WIDTH:
                line = line[:BRIEF_WIDTH - 1] + '…'
            if line.startswith('■ '):
                self._flush_sec()
                self.sec = (line[2:], [])
            elif self.sec and line.startswith(' ') and line.strip():
                self.sec[1].append(line)
            elif line.strip():  # บรรทัดสรุปท้าย
                self._flush_sec()
                if self.passed:
                    self.raw.write(f'\n✓ ผ่าน {len(self.passed)} ข้อ: ' + ' · '.join(self.passed) + '\n')
                    self.passed = []
                self.raw.write(f'\n{line}  (ย่อแล้ว — รายละเอียดเต็ม: --full)\n')

        def write(self, s):
            self.buf += s
            *lines, self.buf = self.buf.split('\n')
            for l in lines:
                self._line(l)
            return len(s)

        def flush(self):
            self.raw.flush()

        def __getattr__(self, name):  # reconfigure/encoding ฯลฯ ที่ import ย่อยเรียก → ตัวจริง
            return getattr(self.raw, name)

    sys.stdout = _Brief(sys.stdout)
    import atexit
    atexit.register(lambda: (sys.stdout._flush_sec(), sys.stdout.raw.flush()) if isinstance(sys.stdout, _Brief) else None)

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
MASTER_SINCE = datetime.datetime(2026, 11, 3)    # ต้นงวด พ.ย.69 (วันขึ้นเดือนจริง) — แก้ทุกครั้งที่ขึ้นเดือน
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
    '4.11.69_เทศบาลนครรังสิต_ใบนอกเวลา_ยกเลิก.jpg': 'ใบนอกเวลาเทศบาลนครรังสิต ยาน้ำท่วม สสจ. ที่เหลือทั้งหมด ขีดฆ่ายกเลิก ไม่เคยลงชีท ไม่มีเลข บย. ของยังอยู่ห้อง Substock ห้องยาชั้น G',
    '16.6.69_ส่งเสริม_ยา.jpg': 'ใบเบิกยาโครงการลงวันที่ 16/6/69 — จ่ายจริงและ PDF ลงวันที่ 17/6/69 (ส่งเสริม ยา_17.6.69.pdf)',
    '3.11.69_IPD_ยกเลิกD5S5ใบ8.9.69_ใบเบิก.jpg': 'หลักฐานยกเลิก D-5-S/5 ใบ IPD 8/9/69 — ไม่มี PDF ใหม่',
    '3.11.69_IPD_ยกเลิกD5S5ใบ8.9.69_PDFขีดฆ่า.jpg': 'PDF ใบ 8/9/69 ที่ขีดฆ่า 2 แถว — หลักฐานยกเลิก',
    '16.10.69_ปฐมภูมิ_คืนยาน้ำท่วม_เก็บห้องยาG.jpg': 'ปฐมภูมิคืนยาน้ำท่วม 109 ชุด เก็บห้องยาG ไม่ลง Master (user ตกลง 19/10/2569)',
    '22.10.69_ห้องยาG_ยา_ปก.jpg': 'หน้าปกใบเบิก บย.70/0023 — รายการ/PDF อยู่กับรูป 22.10.69_ห้องยาG_ยา.jpg',
    '26.10.69_ห้องยา1_ยา_ปก.jpg': 'หน้าปกใบเบิก บย.70/0033 — รายการ/PDF อยู่กับรูป 26.10.69_ห้องยา1_ยา.jpg',
    '26.10.69_ห้องยา1_ยา_หน้า2.jpg': 'รายการหน้า 2 (ข้อ 21–25) ของ บย.70/0033 — PDF เดียวกับ 26.10.69_ห้องยา1_ยา.jpg',
    '26.10.69_แบบรายงานลูกโซ่ความเย็น_ฟอร์มเปล่า.jpg': 'ฟอร์มเปล่าจากเภสัชวัคซีน (ยาเสียตู้เย็น ER ไฟดับ) — ไม่ใช่ใบเบิก',
    '26.10.69_แบบรายงานลูกโซ่ความเย็น_ER_กรอกแล้ว.jpg': 'ER กรอกแล้ว (Speeda 13 · Td 4 vial ไฟดับ 32 ชม.) — ของตัดคลังไปแล้วตอนเติมตู้ ไม่ใช่ใบเบิก',
    '28.10.69_ห้องยาG_ยา_ปก.jpg': 'หน้าปกใบเบิก บย.70/0043 — รายการ/PDF อยู่กับรูป 28.10.69_ห้องยาG_ยา.jpg',
    '28.10.69_ห้องยาG_ยา_หน้า2.jpg': 'รายการหน้า 2 ของ บย.70/0043 — PDF เดียวกับ 28.10.69_ห้องยาG_ยา.jpg',
    '18.11.69_ห้องยาG_ยา_ปก.jpg': 'หน้าปกใบเบิก บย.70/0080 — PDF อยู่กับรูป 18.11.69_ห้องยาG_ยา.jpg',
    '18.11.69_ห้องยาG_ยา_หน้า2.jpg': 'รายการหน้า 2 ของ บย.70/0080 — PDF เดียวกับ 18.11.69_ห้องยาG_ยา.jpg',
    '18.11.69_ห้องยาG_ยา_หน้า3.jpg': 'รายการหน้า 3 ของ บย.70/0080 — PDF เดียวกับ 18.11.69_ห้องยาG_ยา.jpg',
    '18.11.69_ห้องยาG_ยา_ปก_เซ็นจ่ายรับแล้ว.jpg': 'ปก บย.70/0080 หลังจ่าย: ① ③ ④ เซ็นแล้ว ② ⑤ ยังว่าง — หลักฐานลำดับเซ็นที่ใช้จริง (user ส่ง 23/11/2569)',
    '18.11.69_ห้องยาG_ยา_รายการลายมือ_รอบรับของ.jpg': 'รายการลายมือหน้า 1 ของ บย.70/0080 ถ่ายตอนรับของ (ชุดเดียวกับ 18.11.69_ห้องยาG_ยา.jpg)',
    '18.11.69_ห้องยาG_ยา_ใบตัดเบิกติ๊กจัด.jpg': 'ใบตัดเบิก (PDF ชีทเบิก) บย.70/0080 หน้า 1 ที่คลังติ๊กทีละแถวตอนจัด',
    '18.11.69_เบิกยาหมดอายุ_Enoxaparin_อีเมลเตือน.jpg': 'อีเมลเตือนหมดอายุ Enoxaparin AC13011A (แถว 9225 เบิกยาหมดอายุจากคลัง) — หลักฐาน ไม่มีใบเบิก/PDF',
    '28.10.69_ห้องยาG_ยา_หน้า3.jpg': 'รายการหน้า 3 ของ บย.70/0043 — PDF เดียวกับ 28.10.69_ห้องยาG_ยา.jpg',
    '28.10.69_ห้องยาG_ยา_หน้า4.jpg': 'รายการหน้า 4 ของ บย.70/0043 — PDF เดียวกับ 28.10.69_ห้องยาG_ยา.jpg',
    '29.10.69_ER_น้ำเกลือ_ซูม.png': 'รูปซูมใบเดียวกับ 29.10.69_ER_น้ำเกลือ.jpg (บย.70/0044) — PDF เดียวกัน',
    '29.10.69_ER_ยา_ซูม.png': 'รูปซูมใบเดียวกับ 29.10.69_ER_ยา.jpg (บย.70/0045) — PDF เดียวกัน',
    '2.11.69_ห้องยา1_ยา_ปก.jpg': 'หน้าปกใบเบิก บย.70/0047 — รายการอยู่หน้าถัดไป',
    '2.11.69_ห้องยา1_ยา_หน้า2.jpg': 'รายการหน้า 2 (ข้อ 21–30) ของ บย.70/0047',
    '9.11.69_ห้องยา1_ยา_ปก.jpg': 'หน้าปกใบเบิก บย.70/0062 — รายการอยู่หน้าถัดไป',
    '9.11.69_ห้องยา1_ยา_หน้า2.jpg': 'รายการหน้า 2 (ข้อ 21–25) ของ บย.70/0062',
    '11.11.69_ห้องยาG_ยา_ปก.jpg': 'หน้าปกใบเบิก บย.70/0069 — รายการอยู่หน้าถัดไป',
    '11.11.69_ห้องยาG_ยา_หน้า2.jpg': 'รายการหน้า 2 (ข้อ 21–40) ของ บย.70/0069',
    '11.11.69_ห้องยาG_ยา_หน้า3.jpg': 'รายการหน้า 3 (ข้อ 41–60) ของ บย.70/0069',
    '11.11.69_ห้องยาG_ยา_หน้า4.jpg': 'รายการหน้า 4 (ข้อ 61) ของ บย.70/0069',
    '16.11.69_ห้องยา1_ยา_ปก.jpg': 'หน้าปกใบเบิก บย.70/0077 — รายการอยู่หน้าถัดไป',
    '16.11.69_ห้องยา1_ยา_หน้า2.jpg': 'รายการหน้า 2 (ข้อ 21–30) ของ บย.70/0077',
    '16.11.69_ห้องยา1_ยา_เพิ่ม2.jpg': 'เบิกเพิ่มข้อ 32 Verapamil ของ บย.70/0077 — ใบลงวันที่ 16/11 จ่ายจริง 17/11 · PDF ห้องยา1 เพิ่มยา_17.11.69.pdf (พิมพ์แล้ว 17/11/2569)',
    '11.11.69_ห้องยาG_ยา_หน้า4_เพิ่ม62.jpg': 'รายการหน้า 4 (ข้อ 61–62) ของ บย.70/0069 — ข้อ 62 Remdisivir เพิ่มท้ายใบ',
    '4.11.69_ห้องยาG_ยา_ปก.jpg': 'หน้าปกใบเบิก บย.70/0054 — รายการอยู่หน้าถัดไป',
    '4.11.69_ห้องยาG_ยา_หน้า2.jpg': 'รายการหน้า 2 (ข้อ 21–40) ของ บย.70/0054',
    '4.11.69_ห้องยาG_ยา_หน้า3.jpg': 'รายการหน้า 3 (ข้อ 41–47) ของ บย.70/0054',
    '30.10.69_IPD_น้ำเกลือ_ซูม.png': 'รูปซูมใบเดียวกับ 30.10.69_IPD_น้ำเกลือ.jpg (บย.70/0046) — PDF เดียวกัน',
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

# 6a) ยาใหม่ใน Master ต้องมีแถวในชีทวิเคราะห์สั่งซื้อ (user สั่ง 24/11/2569 — Levetiracetam inj รับ 09/11 ไม่อยู่ในชีท
#     สคริปต์แจ้งซื้อหยิบไม่ได้ / Safety Stock ใน Master = 0) · เพิ่มด้วย /manage-drug-sync (Flow B) ผ่าน /excel-com แล้ว import:reorder
ANALYSIS_SKIP = {}  # 92 Kenalog oral base ลบออกจาก Master แล้ว 24/11/2569 (คืนบริษัท ไม่ใช่ยา รพ.)
head('ยาใหม่ใน Master ↔ ชีทวิเคราะห์สั่งซื้อ')
mcodes = {}
for r in ws['Master'].iter_rows(min_row=2, max_col=8, values_only=True):
    if r[5] not in (None, ''):
        c = str(r[5]).strip().removesuffix('.0')
        if c != '-':
            mcodes.setdefault(c, str(r[7] or '').strip())
acodes = {str(r[0]).strip().removesuffix('.0') for r in ws['วิเคราะห์สั่งซื้อ'].iter_rows(min_row=4, max_col=1, values_only=True)
          if r[0] not in (None, '')}
for c, n in sorted(mcodes.items()):
    if c not in acodes and c not in ANALYSIS_SKIP:
        bad(f'{c} {n} — มีใน Master แต่ไม่มีในชีทวิเคราะห์สั่งซื้อ → /manage-drug-sync เพิ่มแถว (VEN · ตัดออก/สั่งเมื่อขอ) แล้ว import:reorder')
ok(f'{sum(1 for c in mcodes if c in acodes)}/{len(mcodes)} รหัสอยู่ในชีทวิเคราะห์'
   + (f' · ข้ามโดยเจตนา {", ".join(ANALYSIS_SKIP)}' if ANALYSIS_SKIP else ''))

# 6b) แผนลดความหนักไฟล์ยอดคลัง (memory excel-reorg-lighten-plan) — ของที่ต้องทำมือตอนขึ้นเดือน
#     วิเคราะห์สั่งซื้อ!P2 เป็นวันที่พิมพ์ค่า (เลิก TODAY) = วันที่ 1 ของเดือนในชีทสำเนางวดล่าสุด Master_<ด.>.<ปป>
#     ชีทเบิก AA:AC แถวงวดที่ปิดแล้ว (วันที่เบิก < MASTER_SINCE) ต้องว่าง
TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
head('ไฟล์ยอดคลัง: วิเคราะห์สั่งซื้อ!P2 ตรงสำเนางวดล่าสุด · ชีทเบิก AA:AC แถวงวดปิดว่าง')
snaps = []
for sn in ws.sheetnames:
    m = re.match(r'^Master_(.+\.)(\d{2})$', sn)
    if m and m.group(1) in TH_MON:
        snaps.append(datetime.datetime(2500 + int(m.group(2)) - 543, TH_MON.index(m.group(1)) + 1, 1))
p2 = ws['วิเคราะห์สั่งซื้อ']['P2'].value
if not snaps:
    bad('ไม่พบชีทสำเนางวด Master_<ด.>.<ปป>')
elif not isinstance(p2, datetime.datetime) or p2 != max(snaps):
    bad(f'P2 = {p2} แต่สำเนางวดล่าสุด = {be(max(snaps))} → แก้ P2 เป็นวันที่ 1 ของเดือนนั้น (ขึ้นเดือนแล้วลืมแก้ = เรท/สั่งซื้อใช้ 12 เดือนเก่า)')
else:
    ok(f'P2 = {be(p2)} ตรงสำเนางวดล่าสุด')
left = 0
for r in ws['เบิก '].iter_rows(min_row=7, min_col=2, max_col=29, values_only=True):
    if isinstance(r[0], datetime.datetime) and r[0] < MASTER_SINCE and any(v not in (None, '') for v in r[25:28]):
        left += 1
if left:
    bad(f'ชีทเบิก AA:AC ยังมีค่า {left} แถวในงวดที่ปิดแล้ว (ก่อน {be(MASTER_SINCE)}) → ล้างให้ว่าง (สูตรหนัก ไม่มีใครใช้)')
else:
    ok('ชีทเบิก AA:AC แถวงวดที่ปิดแล้วว่างครบ')

# 7) บิลซื้อที่ยังไม่อยู่ในทะเบียนส่งบิลจัดซื้อ (key = เลขบิล + วันรับ ตามสคริปต์ bill_handover)
head(f'บิลซื้อ (วันรับตั้งแต่ {be(HANDOVER_SINCE)}) ↔ _ทะเบียนส่งบิลจัดซื้อ.csv')
sent = {(r['เลขที่บิล'].strip(), r['วันที่รับ'].strip()) for r in read_csv(HANDOVER)}
unsigned = sorted({r['เลขที่ใบ'] for r in read_csv(HANDOVER) if not r['จัดซื้อเซ็นรับ'].strip()})
bills = {}
for x in recv:
    # บิลยาเสพติด เจ้าหน้าที่ยาเสพติดส่งจัดซื้อเอง คลังไม่ออกใบส่งบิล (user 03/11/2569)
    if x['status'] == 'การซื้อ' and x['date'] and x['date'] >= HANDOVER_SINCE and 'กองควบคุมวัตถุเสพติด' not in str(x['company']):
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
    # PO ยาเสพติด: บิลไม่ได้มาถึงคลังเอง (user สั่ง 03/11/2569) — เตือนตั้งแต่ออก PO จนลงบิลแล้ว ไม่นับเป็นไม่ครบ
    for r in po_out:
        if r['ผล'].startswith('รอยามาส่ง') and po_match.is_narcotic_po(r):
            print(f"  … {r['เลขที่PO']} ซื้อยาเสพติด {r['ชื่อยา(ระบบ)']} {float(r['ยอดPO'] or 0):,.2f} บาท (ออก PO {r['วันที่ออกPO']}) — ทวงเจ้าหน้าที่ยาเสพติดส่งบิล")
    late = [r for r in po_out if r['ผล'] == 'รอยามาส่ง — เกินกำหนด']
    for r in late:
        print(f"  … {r['เลขที่PO']} ยาเกิน {po_match.OVERDUE_DAYS} วันยังไม่มาส่ง (ออก PO {r['วันที่ออกPO']}) {r['บริษัท(ระบบ)']}")
    # ส่งบางส่วน = ยังไม่ลงระบบโดยเจตนา (ลงครั้งเดียวเมื่อครบ PO) — ไม่ใช่ปัญหา แต่ต้องรู้ว่ารอบิลที่เหลือ
    #   บริษัทไม่ส่งส่วนที่เหลือแล้ว (จัดซื้อยืนยัน) → python scripts/po_match.py --short-ok "<เลข PO>" --commit
    for r in po_out:
        if r['ผล'].startswith(('ส่งบางส่วน', 'รอ PO ใหม่')):
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
RPST_CANCELLED = {   # ใบที่ไม่ต้องมีชีทสรุป — PDF ยังอยู่ (คู่รูปใบเบิกในข้อ "รูปใบเบิก ↔ PDF")
    ('ศ.1', '1.10.69'),               # ยกเลิก — ไม่ได้รับของ
    ('เทศบาลนครรังสิต', '20.10.69'),   # บย.70/0022 รถกู้ชีพ ALS ห้องยาจ่ายแทน (บันทึกเท่านั้น) — user สั่งข้าม 26/10/2569
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
        if d in sheets or any(s.startswith(d + ' ') for s in sheets):   # "18.11.69 ALS" นับด้วย
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

# 11) ใบแจ้งย้ายที่เก็บที่เจ้าหน้าที่กดในแผนผัง ยังไม่ลง Master D/E (docs/features/location-move.md)
#     user อนุญาตถาวร 27/10/2569: เจอ pending → รัน skill /apply-location-moves ได้เลยไม่ต้องถาม · conflict = ถาม user
head('ใบแจ้งย้ายที่เก็บ (แผนผังคลังยา) ↔ Excel Master D/E')
try:
    import json, subprocess
    out = subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'location-moves.mjs'), '--json'],
                         capture_output=True, text=True, encoding='utf-8', timeout=120)
    moves = json.loads(out.stdout.strip().splitlines()[-1]) if out.returncode == 0 and out.stdout.strip() else None
except Exception:
    moves = None
if moves is None:
    bad('อ่านใบแจ้งย้ายจากแอปไม่ได้ (เน็ต/Supabase) — ตรวจข้อนี้ไม่ได้')
else:
    for m in moves:
        what = f"#{m['id']} {m['code']} {m.get('name') or ''} lot {m['lot']}: {m['from_location']} → {m['to_location']} ({m.get('created_by') or '-'})"
        if m['status'] == 'pending':
            bad(f'รอลง Excel {what} — รัน /apply-location-moves')
        else:
            bad(f"conflict {what} · {m.get('note') or ''} — ถาม user ว่าที่ไหนถูก")
    if not moves:
        ok('ไม่มีใบแจ้งย้ายค้าง')

# 12) ใบแจ้งยืม/ใบแจ้งรับคืนที่ออกในแอป (drug_loan_slip) ยังไม่ลงทะเบียน รพ.ยืมยา (user สั่ง 18/11/2569)
#     แอปไม่เขียน drug_loan ตรง → Claude ลง Excel ตาม memory loan-slip-print → import:loan แล้วใบปิดเอง (applied)
#     ยังไม่มีอนุญาตถาวร: เจอ pending = แจ้ง user ก่อนลง · conflict = ถาม user
head('ใบแจ้งยืม/รับคืน (หน้ายืม-คืนยาในแอป) ↔ ทะเบียน รพ.ยืมยา')
SLIP_PHOTO_DAYS = 3   # ออกใบแล้วเกินนี้ยังไม่มีรูปใบเซ็นในโฟลเดอร์พัก ใบคืนยา\ = เตือนให้ถ่ายรูป
try:
    import json, subprocess
    out = subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'loan-slip.mjs'), '--open', '--json'],
                         capture_output=True, text=True, encoding='utf-8', timeout=120)
    slips = json.loads(out.stdout.strip().splitlines()[-1]) if out.returncode == 0 and out.stdout.strip() else None
except Exception:
    slips = None
if slips is None:
    bad('อ่านใบยืม-คืนจากแอปไม่ได้ (เน็ต/Supabase) — ตรวจข้อนี้ไม่ได้')
else:
    inbox_photos = [p for p in glob.glob(os.path.join(INBOX, 'ใบคืนยา', '*')) if os.path.isfile(p)]
    today = datetime.date.today()
    for s in slips:
        made = datetime.datetime.fromisoformat(str(s['createdAt'])).astimezone().date()   # created_at เป็น UTC
        age = (today - made).days
        what = (f"#{s['id']} {s['kindLabel']} {s['doc'] or '-'} · {s['counterparty']} · "
                f"{' / '.join(s['items']) or '-'} · ออก {be(made)} ({s['createdBy'] or '-'})")
        if s['status'] == 'conflict':
            bad(f"ทะเบียนไม่ตรงใบ {what} · {s['note']} — ถาม user ว่าอันไหนถูก")
            continue
        photo = '' if inbox_photos or age < SLIP_PHOTO_DAYS else f' · ออกมา {age} วันยังไม่มีรูปใบเซ็นในโฟลเดอร์พัก ใบคืนยา\\'
        bad(f'รอลง Excel {what} — ลงทะเบียน+รับยา/Master หรือเบิก แล้ว import:loan (memory loan-slip-print){photo}')
    if not slips:
        ok('ไม่มีใบยืม-คืนจากแอปค้าง')

# 13) ยาที่ห้องยาต้องแพ็คเอง (กระปุก) — แบบบรรจุผูกกับบริษัท (user สั่ง 19/11/2569 · memory pack-required-drugs)
#     (ก) ของบริษัทที่ไม่ต้องแพ็คจะหมดภายใน PACK_DAYS วันตามเรท แล้วถัดไปเป็นกระปุก → แจ้งห้องยาเตรียมแพ็ค
#     (ข) มีของบริษัทที่ไม่อยู่ในทะเบียน → ดูของว่าเป็นกล่อง/กระปุก แล้วเติม _ยาต้องแพ็ค.csv
#     เรท = วิเคราะห์สั่งซื้อ!T (Avg/วัน 3 เดือนล่าสุด) · lot หมดอายุแล้วไม่นับ (ไม่จ่าย)
PACK = os.path.join(HOME, r'Desktop\ยอดคงคลัง\_ยาต้องแพ็ค.csv')
PACK_DAYS = 14   # เตือนล่วงหน้า 2 สัปดาห์ (user เลือก 19/11/2569)
head(f'ยาต้องแพ็ค (Desktop\\ยอดคงคลัง\\_ยาต้องแพ็ค.csv) — เตือนล่วงหน้า {PACK_DAYS} วัน')
co_key = lambda s: re.sub(r'บริษัท|ห้างหุ้นส่วนจำกัด|จำกัด|จํากัด|\s', '', str(s or ''))
co_list = lambda s: [co_key(x) for x in str(s or '').split('/') if co_key(x)]
co_in = lambda k, keys: any(x in k or k in x for x in keys)
if not os.path.exists(PACK):
    bad('ไม่พบ _ยาต้องแพ็ค.csv')
else:
    packs = {r['รหัส'].strip(): r for r in read_csv(PACK)}
    mh = [str(h or '').strip() for h in next(ws['Master'].iter_rows(max_row=1, values_only=True))]
    ci = {k: mh.index(k) for k in ('รหัสHosxp', 'Lot Number', 'Exp', 'บริษัท', 'คงเหลือหลังจ่าย')}
    lots = {}
    for r in ws['Master'].iter_rows(min_row=2, values_only=True):
        code = str(r[ci['รหัสHosxp']] or '').strip()
        left = r[ci['คงเหลือหลังจ่าย']]
        if code not in packs or not isinstance(left, (int, float)) or left <= 0:
            continue
        exp = r[ci['Exp']]
        if isinstance(exp, datetime.datetime) and exp.date() < today:
            continue
        lots.setdefault(code, []).append((str(r[ci['Lot Number']] or '-').strip(), ' '.join(str(r[ci['บริษัท']] or '').split()), left))
    rate = {}
    for r in ws['วิเคราะห์สั่งซื้อ'].iter_rows(min_row=4, max_col=20, values_only=True):
        if r[0] is not None and isinstance(r[19], (int, float)):
            rate[str(r[0]).strip()] = r[19]
    line_items = []
    for code, p in packs.items():
        jar, nojar = co_list(p.get('บริษัทที่ต้องแพ็ค')), co_list(p.get('บริษัทที่ไม่ต้องแพ็ค'))
        name = p.get('ชื่อยา (Master)', '')
        jar_q = box_q = 0
        for lot, co, left in lots.get(code, []):
            k = co_key(co)
            if co_in(k, jar):
                jar_q += left
            elif co_in(k, nojar):
                box_q += left
            else:
                bad(f'{code} {name}: มีของ {co or "(ไม่ระบุบริษัท)"} lot {lot} เหลือ {left:g} — บริษัทนี้ไม่อยู่ในทะเบียน '
                    f'ดูของว่ากล่อง/กระปุก แล้วเติม _ยาต้องแพ็ค.csv (เปลี่ยนแบบบรรจุ = แจ้งห้องยา + ใส่ V/Q ในชีทเบิก)')
        if box_q > 0 and jar_q > 0:
            per_day = rate.get(code, 0)
            days = box_q / per_day if per_day > 0 else None
            if days is not None and days <= PACK_DAYS:
                bad(f'{code} {name}: ของแบบไม่ต้องแพ็คเหลือ {box_q:g} {p.get("หน่วยในคลัง", "")} ≈ {days:.0f} วัน '
                    f'แล้วจะเริ่มจ่ายกระปุก {p.get("บริษัทที่ต้องแพ็ค")} — แจ้งห้องยาเตรียมแพ็ค')
                line_items.append(f'- {name} ({p.get("บริษัทที่ต้องแพ็ค")}) เริ่มจ่ายแบบกระปุกในอีกประมาณ {days:.0f} วัน')
    if line_items:
        print('  ร่างไลน์กลุ่มห้องยา:\n    แจ้งจากคลังยา : ยาต่อไปนี้จะเปลี่ยนเป็นแบบกระปุก ต้องแบ่งแพ็คก่อนจ่าย ขอให้ห้องยาเตรียมแพ็คล่วงหน้า\n    '
              + '\n    '.join(line_items))
    ok(f'{len(packs)} รหัสในทะเบียน · ตรวจของคงเหลือ {sum(len(v) for v in lots.values())} lot')

# 14) ใบเบิกที่หน่วยงานส่งในแอป (requisitions) ยังไม่ลงชีทเบิก (user สั่ง 23/11/2569 — เช็คทุกครั้งว่ามีใบใหม่ส่งมาไหม)
#     ห้องยาG (pilot) → node scripts/online-req.mjs --plan ตาม docs/features/online-requisition.md
#     หน่วยงานอื่น → ลงชีทมือตาม /dispense-entry แล้ว --mark-entered (ไม่ตั้ง = ใบหักยอดจองค้างตลอดไป)
#     ยังไม่มีอนุญาตถาวร: เจอใบ = แจ้ง user ก่อนลง
head('ใบเบิกในแอป (หน่วยงานส่งออนไลน์) ↔ ชีทเบิก')
try:
    import json, subprocess
    out = subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'online-req.mjs'), '--pending', '--json'],
                         capture_output=True, text=True, encoding='utf-8', timeout=120)
    reqs = json.loads(out.stdout.strip().splitlines()[-1]) if out.returncode == 0 and out.stdout.strip() else None
except Exception:
    reqs = None
if reqs is None:
    bad('อ่านใบเบิกจากแอปไม่ได้ (เน็ต/Supabase) — ตรวจข้อนี้ไม่ได้')
else:
    TYPE_TH = {'drug': 'ยา', 'supply': 'เวชภัณฑ์', 'saline': 'น้ำเกลือ'}
    today = datetime.date.today()
    for r in reqs:
        made = datetime.datetime.fromisoformat(str(r['createdAt'])).astimezone()   # created_at เป็น UTC
        age = (today - made.date()).days
        new = ' · ใบใหม่วันนี้' if age == 0 else f' · ส่งมา {age} วันแล้ว'
        how = ('online-req.mjs --plan (pilot)' if r['pilot']
               else 'ลงชีทมือตาม /dispense-entry แล้ว online-req.mjs --mark-entered')
        state = 'รอจัดจ่าย' if r['status'] == 'pending' else f"สถานะ {r['status']} (จ่ายก่อนลงชีท)"
        bad(f"{r['req']} {r['dept']} · {TYPE_TH.get(r['type'], r['type'])} {r['items']} รายการ · {r['by'] or '-'} · "
            f"ส่ง {be(made)} {made:%H:%M}{new} · {state} — {how}")
    if not reqs:
        ok('ไม่มีใบเบิกในแอปรอลงชีท')

# 15) ใบที่ลงชีทแล้ว + พิมพ์ใบในคิวพิมพ์แล้ว แต่ในแอปยังไม่ติ๊กจัด/จ่ายออก (user สั่ง 23/11/2569)
#     = ถาม user "จัด/จ่ายออกเสร็จหรือยัง" — ยืนยันแล้วค่อย online-req.mjs --mark-picked / --mark-dispensed (ห้ามติ๊กเองจากการเดา)
#     ยังไม่พิมพ์ = ยังไม่ถึงเวลาถาม (แสดง … ไม่นับปัญหา) · จับคู่ใบ: receipt_no → _ทะเบียนใบเบิก.csv PDF → _สถานะพิมพ์.csv
head('ใบเบิกในแอปที่ลงชีท+พิมพ์แล้ว ↔ ติ๊กจัด/จ่ายออกในแอป')
try:
    out = subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'online-req.mjs'), '--undispensed', '--json'],
                         capture_output=True, text=True, encoding='utf-8', timeout=120)
    undisp = json.loads(out.stdout.strip().splitlines()[-1]) if out.returncode == 0 and out.stdout.strip() else None
except Exception:
    undisp = None
if undisp is None:
    bad('อ่านใบเบิกจากแอปไม่ได้ (เน็ต/Supabase) — ตรวจข้อนี้ไม่ได้')
else:
    pdf_of = {r['เลขรับ'].strip(): r['PDF'].strip() for r in read_csv(os.path.join(HOME, r'Desktop\รวมเบิกยา\_ทะเบียนใบเบิก.csv'))}
    printed = {os.path.normcase(os.path.join(REQ_PDF, r['ไฟล์ (ใต้ รวมเบิกยา\\PDF)'])): bool(r['พิมพ์แล้ว'].strip()) for r in plog}
    STEP = {'approved': 'รอจัด', 'partial': 'รอจัด', 'picking': 'จัดแล้ว รอตรวจจ่าย', 'ready': 'ตรวจแล้ว รอจ่ายออก'}
    for r in undisp:
        pdf = pdf_of.get((r['receipt'] or '').strip(), '')
        is_printed = printed.get(os.path.normcase(pdf)) if pdf else None
        label = f"{r['req']} {r['dept']} {r['receipt'] or '-'} · {r['items']} รายการ · ในแอป: {STEP.get(r['status'], r['status'])}"
        if is_printed:
            bad(f'{label} · พิมพ์ใบแล้ว — ถาม user: จัด/จ่ายออกเสร็จหรือยัง → online-req.mjs --mark-picked / --mark-dispensed')
        elif pdf:
            print(f'  … {label} · ใบยังไม่ยืนยันพิมพ์')
        else:
            print(f'  … {label} · ไม่พบ PDF ในทะเบียนใบเบิก')
    if not undisp:
        ok('ไม่มีใบที่ลงชีทแล้วค้างจัด/จ่ายในแอป')

print(f'\n{"ครบทุกข้อ" if problems == 0 else f"ไม่ครบ {problems} จุด"}')
