"""seed-tpu.py — รวม TPU ของยา (รหัส+บริษัท) + เลขผู้เสียภาษีบริษัท จากทุกแหล่งที่มี → CSV ให้ user ตรวจก่อนนำเข้า (ADR-0031)

อ่านอย่างเดียว ไม่เขียน DB ไม่แตะ Excel ของคลัง:
  python scripts/seed-tpu.py

แหล่ง (เรียงความน่าเชื่อจากมากไปน้อย — ขัดกันเลือกตัวบนแต่ติดธง):
  1 บิล     — หมายเหตุ "TPU <เลข>" ใน Desktop\\บิลยา_ตรวจรับ\\_ดัชนีบิล.csv (เริ่มจด 16/11/2569)
  2 user    — Desktop\\ยอดคงคลัง\\TPU_GPUID.xlsx (user ลงเอง)
  3 ส่งแล้ว — ไฟล์ INVENTORY ที่เคยส่ง (8.4 · 23.4 · 30.4 · 15.6 · 13.8.69)
  4 ทำเอง   — พี่โบว์\\รายงาน5แฟ้ม\\ทำเอง_4.xlsx ชีท TPUID (รู้ว่ามีค่าผิดปน)

ตรวจทุก TPU กับ MasterTMT_20260420 + l_ttmt_master (ใน Inventory_5แฟ้ม.xlsx):
  มีรหัสใน TMT ไหม · ยกเลิกแล้วไหม · ตัวยาตรงชื่อยาใน Master ไหม · ความแรงตรงไหม
ผล → Desktop\\ยอดคงคลัง\\รายงาน5แฟ้ม_DMSIC\\_TPU_ตรวจ.csv · _เลขภาษีบริษัท_ตรวจ.csv
"""
import csv
import os
import re
import sys
from collections import defaultdict

import openpyxl

HOME = os.path.expanduser('~')
DESK = os.path.join(HOME, 'Desktop', 'ยอดคงคลัง')
BOW = os.path.join(DESK, 'พี่โบว์')
LIVE = os.path.join(HOME, 'OneDrive', 'ยอดคลังยา_69.xlsm')
BILL_INDEX = os.path.join(HOME, 'Desktop', 'บิลยา_ตรวจรับ', '_ดัชนีบิล.csv')
USER_FILE = os.path.join(DESK, 'TPU_GPUID.xlsx')
TMT_FILE = os.path.join(DESK, 'ใช้', 'ใช้69', 'รายงาน5แฟ้ม', 'Inventory_5แฟ้ม.xlsx')
SENT_FILES = [  # (ไฟล์, ป้าย) — เก่า → ใหม่ (ใหม่ทับเก่าในแหล่งเดียวกัน)
    (os.path.join(BOW, 'Inventory_8.4.69.xlsx'), 'ส่ง 8.4.69'),
    (os.path.join(HOME, 'Downloads', '5_Inventory_filled_ส่งข้อมูล_ตัดรายการที่ไม่มีออก23.4.2026.xlsx'), 'ส่ง 23.4.69'),
    (os.path.join(BOW, 'Inventory_30.4.69.xlsx'), 'ส่ง 30.4.69'),
    (os.path.join(BOW, 'Inventory_15.6.69.xlsx'), 'ส่ง 15.6.69'),
    (os.path.join(BOW, 'Inventory_13.8.69.xlsx'), 'ส่ง 13.8.69'),
]
SELF_FILE = os.path.join(BOW, 'รายงาน5แฟ้ม', 'ทำเอง_4.xlsx')
OUT_DIR = os.path.join(DESK, 'รายงาน5แฟ้ม_DMSIC')
MASTER_SHEETS = ['Master', 'Master_ต.ค.69', 'Master_ก.ย.69']
NON_DRUG = 'เวชภัณฑ์มิใช่ยา'
PRIORITY = {'บิล': 1, 'user': 2, 'ส่งแล้ว': 3, 'ทำเอง': 4}


def txt(v):
    return re.sub(r'\s+', ' ', str(v if v is not None else '')).strip()


def code_of(v):
    if v is None or v == '':
        return ''
    if isinstance(v, float):
        v = int(v)
    return txt(v).replace('.0', '') if re.fullmatch(r'\d+\.0', txt(v)) else txt(v)


def company_of(v):
    s = txt(v)
    return s if s and s not in ('(blank)',) else '-'


def tpu_of(v):
    s = code_of(v)
    return s if re.fullmatch(r'\d{3,8}', s) else ''


def rows_with_header(ws, must='WORKING_CODE'):
    """คืน (header_index_map, rows) — หาแถวหัวตารางที่มีคำ must (ไฟล์ 8.4 มีแถวคำอธิบายนำหน้า)"""
    it = ws.iter_rows(values_only=True)
    for r in it:
        cells = [txt(c) for c in r]
        if must in cells:
            return {h: i for i, h in enumerate(cells) if h}, it
    return None, iter(())


# ---------- TMT / TTMT ----------
def load_tmt():
    wb = openpyxl.load_workbook(TMT_FILE, read_only=True, data_only=True)
    tmt = {}
    for sheet, key in (('MasterTMT_20260420', 'TPUCode'), ('l_ttmt_master', 'TTMTCode')):
        hdr, it = rows_with_header(wb[sheet], key)
        for r in it:
            c = code_of(r[hdr[key]])
            if not c:
                continue
            g = lambda k: txt(r[hdr[k]]) if k in hdr else ''
            tmt[c] = {'ingredient': g('ActiveIngredient'), 'strength': g('Strength'), 'form': g('Dosageform'),
                      'disp': g('DispUnit'), 'trade': g('TradeName'), 'mfr': g('Manufacturer'), 'fsn': g('FSN'),
                      'status': g('Status'), 'herb': sheet == 'l_ttmt_master'}
    return tmt


def trade_name(t):
    """FSN → ชื่อการค้า (ตัวยา ความแรง) รูปแบบ — ตัดผู้ผลิตและขนาดบรรจุท้าย (CONTEXT §ชื่อการค้าในรายงาน)"""
    fsn = t['fsn']
    if not fsn:
        return ''
    if t['mfr']:
        fsn = fsn.replace(f" ({t['mfr']})", '', 1)
    fsn = re.sub(r',\s*[^,]*\((TPU|TTMT)\)\s*$', '', fsn)
    return re.sub(r'\s*\((TPU|TTMT)\)\s*$', '', fsn).strip()


def words(s):
    s = re.sub(r'([a-z])([A-Z])', r'\1 \2', s or '')
    return {w for w in re.findall(r'[a-z]{4,}', s.lower())}


STRENGTH = re.compile(r'(\d+(?:\.\d+)?)\s*(mg|mcg|g|gm|%|iu|mu|miu|ml|meq|unit)', re.I)


def check(master_name, t):
    """ผลตรวจ TPU กับชื่อยาใน Master — คืนรายการธง (ว่าง = ผ่าน)"""
    if t is None:
        return ['ไม่พบใน TMT']
    flags = []
    if t['status'] not in ('', '0'):
        flags.append('TMT ยกเลิกแล้ว')
    if t['herb']:
        thai = re.sub(r'[^฀-๿]', '', master_name)
        ing = re.sub(r'[^฀-๿]', '', t['ingredient'])
        if thai and ing and ing[:4] not in thai and thai[:4] not in ing:
            flags.append('ตัวยาไม่ตรง')
        return flags
    mw = words(master_name)
    tw = words(t['ingredient']) | words(t['trade'])
    # ชื่อย่อ/สะกดต่าง (Paracetamol↔paracetamol ok · Amoxy↔amoxicillin) — เทียบ 5 ตัวแรกด้วย
    if mw and not (mw & tw) and not ({w[:5] for w in mw} & {w[:5] for w in tw}):
        flags.append('ตัวยาไม่ตรง')
    ms = {float(n) for n, _ in STRENGTH.findall(master_name)}
    ts = {float(n) for n, _ in STRENGTH.findall(t['strength'] + ' ' + t['fsn'])}
    if ms and ts and not (ms & ts):
        flags.append('ความแรงไม่ตรง')
    return flags


# ---------- ยาที่ต้องผูก (รหัส+บริษัท จาก Master + snapshot) ----------
def load_pairs():
    wb = openpyxl.load_workbook(LIVE, read_only=True, data_only=True)
    pairs = {}
    for sheet in MASTER_SHEETS:
        ws = wb[sheet]
        it = ws.iter_rows(values_only=True)
        hdr = [txt(c) for c in next(it)]
        ci, ki, ni, ui, qi, si = (hdr.index(h) for h in ('รหัสHosxp', 'ชนิด', 'รายการยา', 'หน่วย', 'บริษัท', 'คงเหลือหลังจ่าย'))
        for r in it:
            code = code_of(r[ci])
            if not code or txt(r[ki]) == NON_DRUG:
                continue
            key = (code, company_of(r[qi]))
            p = pairs.setdefault(key, {'name': txt(r[ni]), 'unit': txt(r[ui]), 'kind': txt(r[ki]), 'qty_oct': 0.0, 'sheets': set()})
            p['sheets'].add(sheet)
            if sheet == 'Master_ต.ค.69':
                try:
                    p['qty_oct'] += float(r[si] or 0)
                except (TypeError, ValueError):
                    pass
    return pairs


# ---------- แหล่ง TPU ----------
def collect():
    cand = defaultdict(list)   # (code, company) → [(tpu, src_kind, label)]
    taxes = defaultdict(lambda: defaultdict(set))  # company → tax → {labels}

    with open(BILL_INDEX, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            m = re.search(r'TPU\s*(\d{3,8})', r.get('หมายเหตุ') or '')
            if m and r.get('รหัส'):
                cand[(code_of(r['รหัส']), company_of(r['บริษัท']))].append((m.group(1), 'บิล', f"บิล {r['เลขที่บิล']}"))

    wb = openpyxl.load_workbook(USER_FILE, read_only=True, data_only=True)
    for r in wb['GPU_TPU'].iter_rows(min_row=4, values_only=True):
        code = code_of(r[2])
        if not code:
            continue
        for idx in (10, 12, 11):  # TPUID · TTMT · TMT
            t = tpu_of(r[idx]) if len(r) > idx else ''
            if t:
                cand[(code, company_of(r[8]))].append((t, 'user', 'TPU_GPUID.xlsx'))
                break

    for path, label in SENT_FILES:
        if not os.path.exists(path):
            print(f'  ⚠ ไม่พบไฟล์ {path}')
            continue
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for ws in wb.worksheets:
            hdr, it = rows_with_header(ws)
            if not hdr or 'TPUID' not in hdr:
                continue
            for r in it:
                code = code_of(r[hdr['WORKING_CODE']])
                if not code:
                    continue
                comp = company_of(r[hdr['VENDOR_NAME']]) if 'VENDOR_NAME' in hdr else '-'
                t = tpu_of(r[hdr['TPUID']])
                if t and t != '99':
                    cand[(code, comp)].append((t, 'ส่งแล้ว', label))
                if 'VENDOR_TAX_ID' in hdr:
                    tax = re.sub(r'\D', '', txt(r[hdr['VENDOR_TAX_ID']]))
                    if comp != '-' and len(tax) in (9, 13):
                        taxes[comp][tax].add(label)

    wb = openpyxl.load_workbook(SELF_FILE, read_only=True, data_only=True)
    hdr, it = rows_with_header(wb['TPUID'])
    for r in it:
        code, t = code_of(r[hdr['WORKING_CODE']]), tpu_of(r[hdr['TPUID']])
        if code and t and t != '99':
            cand[(code, company_of(r[hdr['VENDOR_NAME']]))].append((t, 'ทำเอง', 'ทำเอง_4.xlsx'))
    return cand, taxes


def main():
    print('อ่าน TMT/TTMT …')
    tmt = load_tmt()
    print(f'  TMT+TTMT {len(tmt):,} รหัส')
    print('อ่านยาใน Master + snapshot …')
    pairs = load_pairs()
    print(f'  ยา (รหัส+บริษัท) {len(pairs):,} คู่')
    print('อ่านแหล่ง TPU …')
    cand, taxes = collect()

    by_code = defaultdict(set)
    for (code, comp), lst in cand.items():
        for t, _, _ in lst:
            by_code[code].add(t)

    out, stat = [], defaultdict(int)
    for (code, comp), p in sorted(pairs.items(), key=lambda kv: (kv[0][0].zfill(10), kv[0][1])):
        lst = sorted(cand.get((code, comp), []), key=lambda x: PRIORITY[x[1]])
        distinct = []
        for t, k, lab in lst:
            if t not in [d[0] for d in distinct]:
                distinct.append((t, k, lab))
        chosen, flags = None, []
        # เลือกตัวที่ผ่านการตรวจก่อน (เรียงตามความน่าเชื่อ) — ไม่มีตัวผ่านเลยเอาตัวบนสุดพร้อมธง
        checked = [(t, k, lab, check(p['name'], tmt.get(t))) for t, k, lab in distinct]
        ok = [c for c in checked if not c[3]]
        if ok:
            chosen = ok[0]
        elif checked:
            chosen = checked[0]
            flags += chosen[3]
        if len(distinct) > 1:
            flags.append('หลายแหล่งไม่ตรงกัน')
        if not chosen:
            flags.append('ขาด TPU')
            hint = ' · '.join(sorted(by_code.get(code, set())))
        else:
            hint = ''
        t = tmt.get(chosen[0]) if chosen else None
        status = 'ผ่าน' if chosen and not flags else ('ขาด' if not chosen else 'ตรวจ')
        stat[status] += 1
        out.append({
            'รหัส': code, 'บริษัท': comp, 'รายการยา (Master)': p['name'], 'หน่วย': p['unit'], 'ชนิด': p['kind'],
            'คงเหลือ ต.ค.69': round(p['qty_oct'], 2),
            'สถานะ': status, 'ธง': ' · '.join(dict.fromkeys(flags)),
            'TPU': chosen[0] if chosen else '', 'ที่มา': chosen[2] if chosen else '',
            'ชื่อการค้า (จาก TMT)': trade_name(t) if t else '', 'DispUnit': t['disp'] if t else '',
            'ตัวยา TMT': t['ingredient'] if t else '', 'ความแรง TMT': t['strength'] if t else '', 'ผู้ผลิต TMT': t['mfr'] if t else '',
            'ตัวเลือกอื่น': ' · '.join(f'{x[0]} ({x[2]}{"/" + ",".join(x[3]) if x[3] else ""})' for x in checked if not chosen or x[0] != chosen[0]),
            'TPU รหัสเดียวกันบริษัทอื่น': hint,
        })

    os.makedirs(OUT_DIR, exist_ok=True)
    f1 = os.path.join(OUT_DIR, '_TPU_ตรวจ.csv')
    with open(f1, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)

    vend = []
    companies = sorted({c for (_, c) in pairs if c != '-'})
    for comp in companies:
        found = taxes.get(comp, {})
        ranked = sorted(found.items(), key=lambda kv: -len(kv[1]))
        vend.append({'บริษัท': comp, 'เลขภาษี': ranked[0][0] if ranked else '',
                     'สถานะ': 'ขาด' if not ranked else ('หลายเลข' if len(ranked) > 1 else 'ผ่าน'),
                     'ที่มา': ' · '.join(sorted(ranked[0][1])) if ranked else '',
                     'เลขอื่น': ' · '.join(f'{t} ({",".join(sorted(l))})' for t, l in ranked[1:])})
    f2 = os.path.join(OUT_DIR, '_เลขภาษีบริษัท_ตรวจ.csv')
    with open(f2, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(vend[0].keys()))
        w.writeheader()
        w.writerows(vend)

    flag_count = defaultdict(int)
    for r in out:
        for fl in filter(None, r['ธง'].split(' · ')):
            flag_count[fl] += 1
    print('')
    print(f"TPU: ผ่าน {stat['ผ่าน']:,} · ต้องตรวจ {stat['ตรวจ']:,} · ขาด {stat['ขาด']:,} (รวม {len(out):,} คู่)")
    for fl, n in sorted(flag_count.items(), key=lambda kv: -kv[1]):
        print(f'  {fl}: {n:,}')
    vs = defaultdict(int)
    for v in vend:
        vs[v['สถานะ']] += 1
    print(f"เลขภาษี: ผ่าน {vs['ผ่าน']} · หลายเลข {vs['หลายเลข']} · ขาด {vs['ขาด']} (รวม {len(vend)} บริษัท)")
    print(f'→ {f1}')
    print(f'→ {f2}')


if __name__ == '__main__':
    sys.exit(main())
