# จัดหน้าใบของแถมแบบ "แต่ละส่วนอยู่หน้าเดียว" (ผู้ใช้กำหนด 09/10/2569 — ทำทุกใบ ตามใบ 7.10.2026 ที่พิมพ์จริง)
# ใช้กับไฟล์ที่ make_doc.py เพิ่งสร้าง (ย่อหน้ายังเรียงตามต้นแบบ Unison 43 ย่อหน้า) — แก้ไฟล์ผลลัพธ์ ห้ามแก้ต้นแบบ
# ใช้: python layout_one_page.py "<ไฟล์ .docx ในโฟลเดอร์ใบของแถม>"
#   1. หน้า 1 ย่อหน้า "คือ …" (P6) + หน้า 2 รายการตั้งแต่ "๑." (P36 run 7+) → 14pt (sz/szCs 28) ระยะบรรทัด 1.0
#   2. ตัด "\n" นำหน้า "กลุ่มงานเภสัชกรรม…ได้ตรวจรับ" (P37 run 0)
#   3. หัวเรื่องหน้า 2 (P29) → pageBreakBefore
#   4. ลบย่อหน้าว่าง 11 ย่อหน้า: P2 · P10 · P21–28 (8 บรรทัดที่เคยดันไปหน้าใหม่) · P32 — ต้องว่างและไม่ใช่ anchor กล่องลายเซ็น
#   5. (user ปรับใบ Lidocaine 16.11.2026 แล้วสั่งจำ 17/11/2569) หน้า 1 ส่วน "ตามที่…จาก <แหล่ง>" กับ "คือ <รายการ>" ต่อเป็นย่อหน้าเดียว
#      ไหลต่อกัน (บรรทัดแรกย่อหน้า 0.5" บรรทัดต่อชิดขอบซ้าย ไม่ขึ้นบรรทัดใหม่ก่อน "คือ") · บรรทัดว่างเหนือย่อหน้านี้เป็นย่อหน้าว่างแทน "\n"
#      · เว้น 1 บรรทัดว่าง (P7 — เดิมลบทิ้ง) ก่อน "คณะกรรมการตรวจรับพัสดุ…" · ไม่มีช่องว่างระหว่าง "วันที่....." กับวันที่ (P8 run 2)
import copy
import sys
import docx
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

sys.stdout.reconfigure(encoding='utf-8')
path = sys.argv[1]
d = docx.Document(path)
P = d.paragraphs
assert len(P) == 43, f'คาด 43 ย่อหน้า (ผลจาก make_doc.py) ได้ {len(P)} — จัดหน้าไปแล้ว?'
assert P[6].text.startswith('คือ '), P[6].text[:20]
assert P[29].text.startswith('แบบรายงานการรับส่วนแถม'), P[29].text[:20]
assert P[36].runs[7].text.endswith('.'), P[36].runs[7].text
assert P[37].runs[0].text == '\n' and P[37].text.lstrip('\n').startswith('กลุ่มงานเภสัชกรรม'), repr(P[37].text[:20])


def single_spacing(p):
    pPr = p._p.get_or_add_pPr()
    sp = pPr.find(qn('w:spacing'))
    if sp is None:
        sp = OxmlElement('w:spacing'); pPr.append(sp)
    sp.set(qn('w:after'), '0'); sp.set(qn('w:line'), '240'); sp.set(qn('w:lineRule'), 'auto')


def size14(run):
    rPr = run._r.get_or_add_rPr()
    for tag in ('w:sz', 'w:szCs'):
        el = rPr.find(qn(tag))
        if el is None:
            el = OxmlElement(tag); rPr.append(el)
        el.set(qn('w:val'), '28')


assert P[5].runs[0].text == '\n' and P[5].text.lstrip('\n').startswith('ตามที่'), repr(P[5].text[:20])
assert P[7].text.strip() == '' and '<w:drawing' not in P[7]._p.xml, f'P7 ไม่ว่าง: {P[7].text[:20]!r}'
assert P[8].runs[2].text == ' ' and P[8].text.startswith('คณะกรรมการตรวจรับพัสดุ'), repr(P[8].text[:30])
assert '<w:drawing' not in P[5]._p.xml and '<w:drawing' not in P[6]._p.xml

for r in P[6].runs:
    if r.text:
        size14(r)
# 5. รวม "คือ …" (P6) เข้าท้าย "ตามที่…จาก <แหล่ง>" (P5) ให้ไหลต่อกัน
P[5].runs[0].text = ''
P[5]._p.addprevious(copy.deepcopy(P[7]._p))          # บรรทัดว่างแทน "\n" (firstLine indent ใช้กับบรรทัดหลัง \n ไม่ได้)
ind = P[5]._p.get_or_add_pPr().find(qn('w:ind'))
for k in list(ind.attrib):
    del ind.attrib[k]
ind.set(qn('w:firstLine'), '720')
sp = copy.deepcopy([r for r in P[5].runs if r.text][-1]._r)   # ช่องว่างหน้า "คือ" ใช้ format ของชื่อแหล่ง (16pt)
P[5]._p.append(sp)
P[5].runs[-1].text = ' '
for r in list(P[6].runs):
    if r.text:
        P[5]._p.append(r._r)
P[6]._p.getparent().remove(P[6]._p)
P[8].runs[2].text = ''
single_spacing(P[36])
for r in P[36].runs[7:]:
    if r.text:
        size14(r)
P[37].runs[0].text = ''
P[29].paragraph_format.page_break_before = True

DROP = [2, 10] + list(range(21, 29)) + [32]
for i in sorted(DROP, reverse=True):
    p = P[i]
    assert p.text.strip() == '' and '<w:drawing' not in p._p.xml, f'P{i} ไม่ว่าง/เป็น anchor: {p.text[:20]!r}'
    p._p.getparent().remove(p._p)
d.save(path)
print('จัดหน้าแล้ว: เหลือ', len(d.paragraphs), 'ย่อหน้า (ใบ Lidocaine 16.11 = 32)')
