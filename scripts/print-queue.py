# ไฟล์รอพิมพ์ใบเบิก — รวม PDF ใบเบิกที่ยังไม่ติ๊ก "พิมพ์แล้ว" ใน _สถานะพิมพ์.csv เป็นไฟล์เดียว เปิดแล้วพิมพ์ครั้งเดียว
# ใช้: python scripts/print-queue.py          → สร้าง/ทำใหม่ PDF\รอพิมพ์.pdf (ต้นฉบับในโฟลเดอร์หน่วยงานไม่ถูกแตะ)
#      python scripts/print-queue.py --done   → user พิมพ์แล้ว: ติ๊กเฉพาะใบที่อยู่ในไฟล์ แล้วลบ รอพิมพ์.pdf
# รายชื่อใบในไฟล์เก็บใน metadata (keywords) — ใบที่เพิ่มเข้าทะเบียนหลังสร้างไฟล์จะไม่ถูกติ๊กไปด้วย
import csv, datetime, io, json, os, sys

import pymupdf

sys.stdout.reconfigure(encoding='utf-8')
PDF_DIR = r'C:\Users\PRH0000484\Desktop\รวมเบิกยา\PDF'
LOG = os.path.join(PDF_DIR, '_สถานะพิมพ์.csv')
QUEUE = os.path.join(PDF_DIR, 'รอพิมพ์.pdf')
COL_FILE, COL_DONE, COL_DATE = 'ไฟล์ (ใต้ รวมเบิกยา\\PDF)', 'พิมพ์แล้ว', 'วันที่ยืนยันพิมพ์'


def read_log():
    with open(LOG, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    return rows, list(rows[0].keys()) if rows else [COL_FILE]


def queued_files():
    if not os.path.exists(QUEUE):
        return None
    with pymupdf.open(QUEUE) as d:
        return json.loads(d.metadata.get('keywords') or '[]')


def build():
    rows, _ = read_log()
    todo = [r[COL_FILE] for r in rows if not r[COL_DONE].strip()]
    if os.path.exists(QUEUE):
        os.remove(QUEUE)
    if not todo:
        print('ไม่มีใบรอพิมพ์ — ลบ รอพิมพ์.pdf แล้ว (ถ้ามี)')
        return
    out, toc, missing = pymupdf.open(), [], []
    for rel in todo:
        src = os.path.join(PDF_DIR, rel)
        if not os.path.exists(src):
            missing.append(rel)
            continue
        toc.append([1, os.path.splitext(os.path.basename(rel))[0], out.page_count + 1])
        with pymupdf.open(src) as d:
            out.insert_pdf(d)
    done = [t for t in todo if t not in missing]
    out.set_toc(toc)
    out.set_metadata({'title': f'รอพิมพ์ {len(done)} ใบ', 'keywords': json.dumps(done, ensure_ascii=False)})
    out.save(QUEUE)
    print(f'สร้าง {QUEUE}  ({len(done)} ใบ · {out.page_count} หน้า)')
    for t in done:
        print(f'  - {t}')
    for m in missing:
        print(f'  ✗ ไม่พบไฟล์: {m}')


def mark_done():
    q = queued_files()
    if q is None:
        sys.exit('ไม่มี รอพิมพ์.pdf — ไม่มีอะไรให้ติ๊ก')
    rows, hdr = read_log()
    today = datetime.date.today()
    stamp = f'{today.day:02d}/{today.month:02d}/{today.year + 543}'
    n = 0
    for r in rows:
        if r[COL_FILE] in q and not r[COL_DONE].strip():
            r[COL_DONE], r[COL_DATE] = '✓', stamp
            n += 1
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=hdr, lineterminator='\r\n')
    w.writeheader()
    w.writerows(rows)
    with open(LOG, 'w', encoding='utf-8-sig', newline='') as f:
        f.write(buf.getvalue())
    os.remove(QUEUE)
    print(f'ติ๊กพิมพ์แล้ว {n} ใบ ({stamp}) · ลบ รอพิมพ์.pdf')
    left = [r[COL_FILE] for r in rows if not r[COL_DONE].strip()]
    if left:
        print(f'ยังรอพิมพ์ {len(left)} ใบที่เพิ่มหลังสร้างไฟล์ — รัน print-queue.py อีกครั้ง')


if __name__ == '__main__':
    mark_done() if '--done' in sys.argv else build()
