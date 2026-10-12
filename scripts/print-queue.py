# ที่พักรอพิมพ์ใบเบิก — สำเนา PDF ใบเบิกที่ยังไม่ติ๊ก "พิมพ์แล้ว" ใน _สถานะพิมพ์.csv ไปไว้ใน PDF\รอพิมพ์\<วันที่เบิก>\
# ต้นฉบับในโฟลเดอร์หน่วยงานไม่ถูกแตะ — โฟลเดอร์รอพิมพ์เป็นที่พักชั่วคราว พิมพ์แล้วลบทิ้ง
# ใช้: python scripts/print-queue.py                 → จัดโฟลเดอร์รอพิมพ์ใหม่ให้ตรงทะเบียน
#      python scripts/print-queue.py --done          → user พิมพ์แล้วทั้งหมด: ติ๊กทะเบียน + ลบสำเนาที่อยู่ในโฟลเดอร์
#      python scripts/print-queue.py --done=7.10.69  → พิมพ์แล้วเฉพาะวันเบิกนั้น
# ติ๊กเฉพาะใบที่มีสำเนาอยู่ในโฟลเดอร์ (ตาม _รายการ.json) — ใบที่เพิ่มเข้าทะเบียนทีหลังจะไม่ถูกติ๊กไปด้วย
# ใบละ 1 ไฟล์เสมอ — user ตั้งจำนวนสำเนาตอนกดพิมพ์เอง (08/10/2569 เลิก copy "<ชื่อ> ชุด2.pdf")
# จำนวนชุดต่อใบ (แสดงในสรุปให้ตั้งตอนพิมพ์): ห้องยา 3 ชุด · ใบยืม/ใบคืนยา 1 ชุด · ที่อื่น 2 ชุด
import csv, datetime, glob, io, json, os, re, shutil, sys

sys.stdout.reconfigure(encoding='utf-8')
PDF_DIR = r'C:\Users\PRH0000484\Desktop\รวมเบิกยา\PDF'
LOG = os.path.join(PDF_DIR, '_สถานะพิมพ์.csv')
QDIR = os.path.join(PDF_DIR, 'รอพิมพ์')
MANIFEST = os.path.join(QDIR, '_รายการ.json')   # {"<rel ใต้ PDF>": "<วันที่เบิก>"}
COL_FILE, COL_DONE, COL_DATE = 'ไฟล์ (ใต้ รวมเบิกยา\\PDF)', 'พิมพ์แล้ว', 'วันที่ยืนยันพิมพ์'


def copies(rel):
    top = rel.split('\\')[0]
    if top == 'ยืม-คืนยา':          # ใบยืม/ใบคืนยา 1 ชุด (user กำหนด 08/10/2569)
        return 1
    if 'ส่งบิลให้พี่โก้' in rel:      # ใบส่งบิลจัดซื้อ (path เต็มนอก PDF\) จัดซื้อเซ็นรับ 1 ฉบับ
        return 1
    return 3 if top.startswith('ห้องยา') else 2


def req_date(rel):
    m = re.search(r'[_ ](\d{1,2}\.\d{1,2}\.\d{2})\.pdf$', rel, re.I)   # <หน่วยงาน> <ประเภท>_<ว.ด.ปป>.pdf · ส่งบิล <ว.ด.ปป>.pdf
    if m:
        return m.group(1)
    m = re.search(r'_(\d{1,2})\.(\d{1,2})\.(\d{4})\.(?:pdf|docx)$', rel, re.I)   # ใบของแถม …_<ว.ด.ค.ศ.>.docx → ว.ด.ปป พ.ศ.
    return f'{m.group(1)}.{m.group(2)}.{(int(m.group(3)) + 543) % 100:02d}' if m else 'ไม่ทราบวันที่'


def read_log():
    with open(LOG, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    return rows, list(rows[0].keys())


def write_log(rows, hdr):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=hdr, lineterminator='\r\n')
    w.writeheader()
    w.writerows(rows)
    with open(LOG, 'w', encoding='utf-8-sig', newline='') as f:
        f.write(buf.getvalue())


def load_manifest():
    if not os.path.exists(MANIFEST):
        return {}
    with open(MANIFEST, encoding='utf-8') as f:
        return json.load(f)


def save_manifest(m):
    os.makedirs(QDIR, exist_ok=True)
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(m, f, ensure_ascii=False, indent=1)


def remove_copy(rel, d):
    stem = os.path.splitext(os.path.basename(rel))[0]
    folder = os.path.join(QDIR, d)
    # ชุด* = สำเนาแบบเดิม (ก่อน 08/10/2569) ที่อาจค้างในโฟลเดอร์
    for p in [os.path.join(folder, os.path.basename(rel))] + glob.glob(os.path.join(glob.escape(folder), f'{glob.escape(stem)} ชุด*.pdf')):
        if os.path.exists(p):
            os.remove(p)
    folder = os.path.join(QDIR, d)
    if os.path.isdir(folder) and not os.listdir(folder):
        os.rmdir(folder)


def build():
    rows, _ = read_log()
    todo = [r[COL_FILE] for r in rows if not r[COL_DONE].strip()]
    old = load_manifest()
    for rel, d in old.items():                     # สำเนาที่ไม่อยู่ในรายการรอแล้ว (พิมพ์/ถูกติ๊กไปแล้ว)
        if rel not in todo:
            remove_copy(rel, d)
    man, missing = {}, []
    for rel in todo:
        src = os.path.join(PDF_DIR, rel)
        if not os.path.exists(src):
            missing.append(rel)
            continue
        d = req_date(rel)
        remove_copy(rel, d)                         # ล้างของเดิมก่อน (รวมสำเนา ชุด2/ชุด3 แบบเดิม)
        os.makedirs(os.path.join(QDIR, d), exist_ok=True)
        shutil.copy2(src, os.path.join(QDIR, d, os.path.basename(rel)))
        man[rel] = d
    save_manifest(man)
    print(f'รอพิมพ์ {len(man)} ใบ ({len(man)} ไฟล์ — ตั้งจำนวนสำเนาตอนพิมพ์ ตามตัวเลข ×N) ใน {QDIR}')
    for d in sorted(set(man.values()), key=lambda s: [int(x) for x in s.split('.')[::-1]] if s[0].isdigit() else [0]):
        print(f'  {d}\\  ' + ' · '.join(f'{os.path.basename(r)} ×{copies(r)}' for r, x in man.items() if x == d))
    for m in missing:
        print(f'  ✗ ไม่พบไฟล์: {m}')


def mark_done(only=None):
    man = load_manifest()
    pick = {r: d for r, d in man.items() if only is None or d == only}
    if not pick:
        sys.exit('ไม่มีใบในโฟลเดอร์รอพิมพ์' + (f' ของวันที่ {only}' if only else ''))
    rows, hdr = read_log()
    t = datetime.date.today()
    stamp = f'{t.day:02d}/{t.month:02d}/{t.year + 543}'
    n = 0
    for r in rows:
        if r[COL_FILE] in pick and not r[COL_DONE].strip():
            r[COL_DONE], r[COL_DATE] = '✓', stamp
            n += 1
    write_log(rows, hdr)
    for rel, d in pick.items():
        remove_copy(rel, d)
        del man[rel]
    save_manifest(man)
    print(f'ติ๊กพิมพ์แล้ว {n} ใบ ({stamp}) · ลบสำเนาออกจากรอพิมพ์แล้ว · เหลือรอพิมพ์ {len(man)} ใบ')
    left = [r[COL_FILE] for r in rows if not r[COL_DONE].strip() and r[COL_FILE] not in man]
    if left:
        print(f'มี {len(left)} ใบที่ทำหลังจัดโฟลเดอร์ — รัน print-queue.py อีกครั้ง')


if __name__ == '__main__':
    done = next((a for a in sys.argv if a.startswith('--done')), None)
    if done:
        mark_done(done.split('=', 1)[1] if '=' in done else None)
    else:
        old = os.path.join(PDF_DIR, 'รอพิมพ์.pdf')   # แบบไฟล์รวมเดิม (เลิกใช้ 07/10/2569)
        if os.path.exists(old):
            os.remove(old)
        build()
