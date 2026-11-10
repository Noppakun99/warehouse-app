"""ก่อนจ่ายใบเบิก: จ่ายแล้วคงเหลือพอให้หน่วยงานอื่นไหม (เทียบเรท + Lead Time) + exp — อ่านอย่างเดียว

    python -B rate_check.py --date 2026-11-09 --lines "1570003:1,1440601:5,1500052:50"
    [--stock <ยอดคลังยา_69.xlsm>] [--report <รายงานการซื้อยา_69.xlsx>]

copy ไฟล์ไป temp ก่อนอ่าน (ไม่แตะไฟล์จริง) · หาคอลัมน์ชีทวิเคราะห์จากหัวแถว 3 ไม่อ้างตัวอักษรตายตัว
"""
import argparse, datetime as dt, os, shutil, sys, tempfile, warnings
import openpyxl
from openpyxl.utils import column_index_from_string as CI

warnings.simplefilter('ignore')
sys.stdout.reconfigure(encoding='utf-8')
HOME = os.path.expanduser('~')
p = argparse.ArgumentParser()
p.add_argument('--date', required=True, help='วันที่เบิก ISO (ค.ศ.) เช่น 2026-11-09')
p.add_argument('--lines', required=True, help='"รหัส:จำนวน,รหัส:จำนวน" (รหัสซ้ำได้ ยอดรวมกัน)')
p.add_argument('--stock', default=os.path.join(HOME, 'OneDrive', 'ยอดคลังยา_69.xlsm'))
p.add_argument('--report', default=os.path.join(HOME, 'OneDrive', 'รายงานการซื้อยา_69.xlsx'))
a = p.parse_args()
REQ = dt.datetime.fromisoformat(a.date)
want = {}
for part in a.lines.split(','):
    code, qty = part.split(':')
    want[code.strip()] = want.get(code.strip(), 0) + float(qty)

tmp = tempfile.mkdtemp()
def load(path):
    dst = os.path.join(tmp, os.path.basename(path))
    shutil.copy2(path, dst)
    return openpyxl.load_workbook(dst, read_only=True, data_only=True)

wb = load(a.stock)
M = {k: CI(k) - 1 for k in 'C E F H I K L M U'.split()}
lots = {}
for r in wb['Master'].iter_rows(min_row=2, values_only=True):
    code, u = str(r[M['F']]).strip(), r[M['U']]
    if code in want and isinstance(u, (int, float)) and u > 0:
        lots.setdefault(code, []).append(r)
ws = wb['วิเคราะห์สั่งซื้อ']
hdr = next(ws.iter_rows(min_row=3, max_row=3, values_only=True))
def col(prefix):
    for i, h in enumerate(hdr):
        if str(h or '').startswith(prefix):
            return i
    raise SystemExit(f'ชีทวิเคราะห์ไม่มีหัวคอลัมน์ "{prefix}" — โครงชีทเปลี่ยน หยุดก่อน')
X = {k: col(h) for k, h in (('unit', 'หน่วย'), ('avg_m', 'Avg/เดือน'), ('avg_d', 'Avg/วัน'),
                            ('lt', 'Lead Time'), ('rop', 'ROP'), ('status', 'สถานะ'))}
rate = {}
for r in ws.iter_rows(min_row=4, values_only=True):
    if str(r[0]).strip() in want:
        rate.setdefault(str(r[0]).strip(), []).append(r)
wb.close()

notified = {}
try:
    rb = load(a.report)
    for r in rb['รายงานซื้อยา'].iter_rows(min_row=5, values_only=True):
        if r[0] == '☐' and str(r[4]).strip() in want:
            d = r[1].strftime('%d/%m/%y') if isinstance(r[1], dt.datetime) else r[1]
            notified[str(r[4]).strip()] = d
    rb.close()
except Exception as e:
    print(f'(อ่านรายงานการซื้อยาไม่ได้: {e} — ข้ามการเช็คแจ้งซื้อ)')

def num(v):
    return v if isinstance(v, (int, float)) else 0
for code, qty in want.items():
    rows = lots.get(code, [])
    ok = [r for r in rows if 'รอตรวจรับ' not in str(r[M['C']])]
    pend = sum(r[M['U']] for r in rows if 'รอตรวจรับ' in str(r[M['C']]))
    avail = sum(r[M['U']] for r in ok)
    unit = rows[0][M['I']] if rows else '?'
    name = rows[0][M['H']] if rows else '(ไม่มีของใน Master)'
    after = avail - qty
    print(f'\n{code} {name} [{unit}] จ่าย {qty:g} · จ่ายได้ {avail:g} → หลังจ่าย {after:g} · รอตรวจรับ {pend:g}'
          + (f' · แจ้งซื้อแล้ว {notified[code]}' if code in notified else ''))
    for r in sorted(ok, key=lambda r: r[M['L']] if isinstance(r[M['L']], dt.datetime) else dt.datetime.max):
        e = r[M['L']]
        mo = (e - REQ).days / 30.4 if isinstance(e, dt.datetime) else None
        flag = ' ⚠ exp < 7 เดือน → หมายเหตุ Q' if mo is not None and mo < 7 else ''
        print(f'   lot {r[M["K"]]} exp {e.strftime("%d/%m/%Y") if mo is not None else e}'
              f' ({mo:.1f} ด.) {r[M["M"]]} U={r[M["U"]]:g} ที่ {r[M["E"]]}{flag}' if mo is not None else
              f'   lot {r[M["K"]]} exp {e} {r[M["M"]]} U={r[M["U"]]:g} ที่ {r[M["E"]]}')
    match = [x for x in rate.get(code, []) if str(x[X['unit']]).strip() == str(unit).strip()] or rate.get(code, [])
    if not match:
        print('   ? ไม่มีแถวในชีทวิเคราะห์ — ดูเรทเองจากชีทเบิก')
        continue
    x = match[0]
    avg_m, avg_d, lt = num(x[X['avg_m']]), num(x[X['avg_d']]), num(x[X['lt']])
    cov = after / avg_d if avg_d else None
    share = qty / avg_m if avg_m else None
    print(f'   เรท {avg_m:g}/เดือน ({avg_d:g}/วัน) · LT {lt:g} วัน · ROP {num(x[X["rop"]]):g} · {x[X["status"]]}'
          f' · หลังจ่ายพอใช้ {f"{cov:.0f} วัน" if cov is not None else "- (ไม่มีเรท)"}'
          f' · ใบนี้ = {f"{share:.1f}" if share is not None else "-"} เดือนของเรท')
    first_exp = min((r[M['L']] for r in ok if isinstance(r[M['L']], dt.datetime)), default=None)
    if after < 0:
        verdict = '⛔ ของไม่พอจ่าย → แบ่งจ่าย/ถาม user (memory shortfall-note-followup)'
    elif first_exp and cov is not None and cov > (first_exp - REQ).days:
        verdict = '✓ ใช้ไม่ทันก่อน exp lot แรก → จ่ายตามขอได้ ไม่ต้องกั๊ก'
    elif (share is not None and share >= 1) or (avail and qty >= avail * 0.5):
        verdict = '⛔ ใบเดียวกินของมาก (≥ 1 เดือนของเรท หรือ ≥ ครึ่งของที่จ่ายได้) → ถาม user ก่อนลง'
    elif cov is not None and cov < lt and not pend and code not in notified:
        verdict = '⛔ หลังจ่ายพอใช้ไม่ถึง Lead Time + ไม่มีรอตรวจรับ + ยังไม่แจ้งซื้อ → ถาม user (แบ่งจ่าย? แจ้งซื้อด่วน?)'
    elif cov is not None and cov < lt:
        why = 'มีรอตรวจรับ' if pend else f'แจ้งซื้อแล้ว {notified[code]}'
        verdict = f'⚠ หลังจ่ายพอใช้ไม่ถึง Lead Time แต่{why} → จ่ายตามขอได้ แจ้ง user ในสรุป'
    else:
        verdict = '✓ พอ'
    print('   ผล:', verdict)
shutil.rmtree(tmp, ignore_errors=True)
