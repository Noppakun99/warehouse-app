# ตรวจ PDF ใบเบิก (dispense-pdf.ps1) ก่อนเข้าคิวพิมพ์: ทุกหน้าต้องมีเส้นปิดตารางใต้แถวสุดท้ายของหน้า
#   python scripts/pdf-table-check.py <ไฟล์.pdf> [<ไฟล์.pdf> ...] [--png <โฟลเดอร์>]
#   --png = เซฟภาพท้ายตารางของทุกหน้าไว้ให้เปิดดูด้วยตา
# exit 0 = ผ่านทุกไฟล์ · 1 = มีหน้าที่เส้นท้ายหาย (ห้ามเข้าคิวพิมพ์ ทำ PDF ใหม่)
# user สั่ง 23/11/2569 — บย.70/0092 ห้องยา1 พี่เก๋ หน้า 1 แถวท้ายไม่มีเส้นล่าง (แถวถัดไปขึ้นหน้าใหม่)
import os
import sys

import pymupdf

TOL = 6  # pt — เส้นปิดต้องอยู่ใต้ตัวอักษรล่างสุดไม่เกินความสูงแถว


def h_lines(page):
    out = []
    for d in page.get_drawings():
        for it in d['items']:
            if it[0] == 'l':
                p1, p2 = it[1], it[2]
                if abs(p1.y - p2.y) < 1.5:
                    out.append((min(p1.x, p2.x), max(p1.x, p2.x), (p1.y + p2.y) / 2))
            elif it[0] == 're':
                r = it[1]
                if r.height < 2.5:
                    out.append((r.x0, r.x1, (r.y0 + r.y1) / 2))
    return out


def check(path, png_dir=None):
    doc = pymupdf.open(path)
    bad = []
    for pno, page in enumerate(doc, 1):
        lines = h_lines(page)
        if not lines:
            bad.append((pno, 'ไม่พบเส้นตาราง'))
            continue
        full = max(x1 - x0 for x0, x1, _ in lines)
        rows = sorted(y for x0, x1, y in lines if x1 - x0 >= 0.9 * full)
        top, last = rows[0], rows[-1]
        foot = page.rect.height - 40  # ขอบล่าง 0.551 นิ้ว — เลขหน้าอยู่ใต้นี้
        words = [w for w in page.get_text('words') if w[1] > top and w[3] < foot]
        if not words:
            continue
        low = max(w[3] for w in words)
        if low > last + 1:
            bad.append((pno, f'ตัวอักษรล่างสุด y={low:.0f} อยู่ใต้เส้นเต็มเส้นสุดท้าย y={last:.0f}'))
        if png_dir:
            os.makedirs(png_dir, exist_ok=True)
            clip = pymupdf.Rect(0, max(top, last - 120), page.rect.width, min(page.rect.height, max(low, last) + 10))
            name = os.path.splitext(os.path.basename(path))[0]
            page.get_pixmap(clip=clip, dpi=110).save(os.path.join(png_dir, f'{name}_p{pno}.png'))
    return len(doc), bad


def main():
    args = sys.argv[1:]
    png = None
    if '--png' in args:
        i = args.index('--png'); png = args[i + 1]; del args[i:i + 2]
    if not args:
        print(__doc__ or 'usage: pdf-table-check.py <pdf> ...'); sys.exit(2)
    fail = False
    for p in args:
        pages, bad = check(p, png)
        if bad:
            fail = True
            print(f'✗ {os.path.basename(p)} ({pages} หน้า)')
            for pno, why in bad:
                print(f'    หน้า {pno}: เส้นท้ายตารางหาย — {why}')
        else:
            print(f'✓ {os.path.basename(p)} ({pages} หน้า) เส้นปิดตารางครบทุกหน้า')
    sys.exit(1 if fail else 0)


if __name__ == '__main__':
    main()
