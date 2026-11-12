"""ใบขอคืน/แลกเปลี่ยน GPO (FM-AJE4-001 แก้ไขครั้งที่ 09) — พิมพ์ทับฟอร์มต้นฉบับ
usage: python gpo_vx_form.py <spec.json> <out.pdf> [--png <preview.png>]
spec.json ดูตัวอย่าง example_VX-6911-001.json (ข้างไฟล์นี้)
พื้นหลัง = render หน้าแรกของฟอร์มต้นฉบับ 200 dpi (หน้า rotation 270 จึงไม่เขียนลงหน้าเดิมตรงๆ)
พิกัด = px ของ preview ที่ 110 dpi · ทดสอบตำแหน่งครบทุกช่อง 12/11/2569 (ตาราง 5 แถว · ขอเปลี่ยนเป็น 5 บรรทัด · ติ๊กทั้ง 2 แบบ) — ยังต้องดู preview ทุกใบ (ข้อความยาวล้นช่อง)
"""
import json, os, sys
import pymupdf

sys.stdout.reconfigure(encoding='utf-8')
SRC = r'C:\Users\PRH0000484\Desktop\รวมเบิกยา\PDF\รายการยา\แบบขอคืน-แลกเปลี่ยน_09.pdf'
FD = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'Windows', 'Fonts')
CSS = ("@font-face {font-family: sar; src: url('THSarabunNew.ttf');} "
       "* {font-family: sar; font-size: 15px; color: #00238c; margin:0; padding:0; line-height:1;}")
INK = (0, 0.14, 0.55)
K = 72 / 110
ROW_Y = [471, 499.7, 528.4, 557.1, 585.8]      # ตาราง 5 แถว
SWAP_Y = [683, 709.5, 736, 762.5, 789]         # ขอเปลี่ยนเป็น 1–5


def main():
    spec = json.load(open(sys.argv[1], encoding='utf-8'))
    out = sys.argv[2]
    png = sys.argv[sys.argv.index('--png') + 1] if '--png' in sys.argv else None
    assert os.path.isfile(os.path.join(FD, 'THSarabunNew.ttf')), f'ไม่พบฟอนต์ THSarabunNew.ttf ใน {FD}'
    items = spec['items']
    assert 1 <= len(items) <= 5, 'ฟอร์มมี 5 แถว — เกินให้แยกใบ'
    arch = pymupdf.Archive(FD)
    src = pymupdf.open(SRC)
    d = pymupdf.open()
    p = d.new_page(width=src[0].rect.width, height=src[0].rect.height)
    p.insert_image(p.rect, stream=src[0].get_pixmap(dpi=200).tobytes('jpeg', jpg_quality=88))

    def t(x, base, s, align='center', w=200):
        if s in (None, ''):
            return
        x, base = x * K, base * K
        if align == 'center':
            r = pymupdf.Rect(x - w / 2, base - 13, x + w / 2, base + 6)
        elif align == 'right':
            r = pymupdf.Rect(x - w, base - 13, x, base + 6)
        else:
            r = pymupdf.Rect(x, base - 13, x + w, base + 6)
        rc = p.insert_htmlbox(r, f'<div style="text-align:{align}">{s}</div>', css=CSS, archive=arch)
        assert rc[0] >= 0, ('ข้อความล้นช่อง', s, rc)

    # หัวใบ — เลขที่เอกสาร (ของลูกค้า) เว้นว่างเป็นค่าเริ่ม (user สั่ง 12/11/2569)
    t(340, 309, spec.get('doc_no', ''), w=120)
    t(622, 309, spec['day'], w=50)
    t(722, 310, spec['month'], w=80)
    t(828, 309, spec['year'], w=70)
    t(398, 356, spec.get('hospital', 'ประชาธิปัตย์'), w=170)
    t(602, 356, spec.get('province', 'ปทุมธานี'), w=140)
    t(808, 356, spec.get('customer_code', '110000187'), w=100)
    p.draw_oval(pymupdf.Rect(252 * K, 344 * K, 287 * K, 367 * K), color=INK, width=0.9)   # วง "รพ."
    cx, cy = (348, 384) if spec.get('mode', 'exchange') == 'exchange' else (216, 384)
    # ☑ ขอแลกเปลี่ยน (348,384 ทดสอบแล้ว) · ☐ ขอคืนลดหนี้ (216,384) ทดสอบแล้ว
    cx, cy = cx * K, cy * K
    p.draw_polyline([(cx - 3, cy), (cx, cy + 3.5), (cx + 6, cy - 5)], color=INK, width=1.4)

    for it, ry in zip(items, ROW_Y):
        t(165, ry, it['name'], align='left', w=240)
        t(465, ry, it['qty'], w=90)
        t(556, ry, it['lot'], w=80)
        t(648, ry, it.get('mfd', ''), w=90)
        t(745, ry, it['exp'], w=90)
        t(858, ry, it['value'], align='right', w=70)
    t(455, 634, str(len(items)), w=50)
    t(730, 634, spec['total'], w=150)
    t(245, 657, spec['reason'], align='left', w=550)
    for sw, sy in zip(spec.get('swap_to', []), SWAP_Y):
        t(245, sy, sw['name'], align='left', w=340)
        t(756, sy, sw['qty'], w=190)
    t(495, 815, spec.get('invoice', ''), w=230)

    d.subset_fonts()
    d.save(out, garbage=4, deflate=True)
    if png:
        pymupdf.open(out)[0].get_pixmap(dpi=110).save(png)
    print('ok', out, '· preview', png or '-')


if __name__ == '__main__':
    main()
