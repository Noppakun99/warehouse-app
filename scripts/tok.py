"""วัด token จาก log ของ Claude Code ต่อ session — ใช้เทียบผลก่อน/หลังปรับลด token

  python -B scripts/tok.py                        30 session ล่าสุด
  python -B scripts/tok.py --since 2026-11-05     session ที่เริ่มตั้งแต่วันนั้น
  python -B scripts/tok.py --until 2026-11-04     session ที่เริ่มถึงวันนั้น
  python -B scripts/tok.py --detail               เพิ่มรายการ session + เครื่องมือที่ผลลัพธ์ใหญ่

ตัวชี้วัดหลัก: token ต่อครั้ง = (input + cache read + cache write) ÷ จำนวนครั้งที่เรียกโมเดล
"""
import argparse, collections, datetime, glob, json, os, sys
sys.stdout.reconfigure(encoding='utf-8')

LOG_DIR = os.path.expanduser(r'~\.claude\projects\c--Users-PRH0000484-warehouse-app')
HANDOFF_AT = 250_000

ap = argparse.ArgumentParser()
ap.add_argument('--since', help='YYYY-MM-DD')
ap.add_argument('--until', help='YYYY-MM-DD')
ap.add_argument('--last', type=int, default=30, help='จำนวน session ล่าสุด เมื่อไม่ใส่ช่วงวันที่')
ap.add_argument('--detail', action='store_true')
args = ap.parse_args()

files = sorted(glob.glob(os.path.join(LOG_DIR, '*.jsonl')), key=os.path.getmtime)
rows = []
tool_chars = collections.Counter(); tool_n = collections.Counter()
for f in files:
    seen = {}; id2tool = {}
    for line in open(f, encoding='utf-8', errors='replace'):
        try: o = json.loads(line)
        except Exception: continue
        if o.get('isSidechain'): continue
        m = o.get('message') or {}
        c = m.get('content')
        if isinstance(c, list) and args.detail:
            for b in c:
                if not isinstance(b, dict): continue
                if b.get('type') == 'tool_use': id2tool[b.get('id')] = b.get('name')
                if b.get('type') == 'tool_result':
                    t = b.get('content')
                    s = t if isinstance(t, str) else ''.join(x.get('text', '') for x in (t or []) if isinstance(x, dict))
                    n = id2tool.get(b.get('tool_use_id'), '?')
                    tool_chars[n] += len(s); tool_n[n] += 1
        u = m.get('usage')
        if o.get('type') == 'assistant' and u and m.get('id'):
            seen[m['id']] = (u, o.get('timestamp'))
    calls = sorted(seen.values(), key=lambda x: x[1] or '')
    if not calls: continue
    ctx = [c[0].get('input_tokens', 0) + c[0].get('cache_creation_input_tokens', 0) + c[0].get('cache_read_input_tokens', 0) for c in calls]
    cold = 0; prev = None
    for _, ts in calls:
        t = datetime.datetime.fromisoformat(ts.replace('Z', '+00:00')) if ts else None
        if prev and t and (t - prev).total_seconds() > 3600: cold += 1
        prev = t or prev
    rows.append(dict(
        id=os.path.basename(f)[:8], date=(calls[0][1] or '')[:10], calls=len(calls), first=ctx[0], peak=max(ctx), total=sum(ctx),
        cw=sum(c[0].get('cache_creation_input_tokens', 0) for c in calls),
        cr=sum(c[0].get('cache_read_input_tokens', 0) for c in calls),
        out=sum(c[0].get('output_tokens', 0) for c in calls), cold=cold))

if args.since or args.until:
    rows = [r for r in rows if (not args.since or r['date'] >= args.since) and (not args.until or r['date'] <= args.until)]
else:
    rows = rows[-args.last:]
if not rows:
    sys.exit('ยังไม่มี session ในช่วงนี้')

n = len(rows); calls = sum(r['calls'] for r in rows)
if args.detail:
    print('session   วันที่       ครั้ง  เริ่ม(K)  สูงสุด(K)  ต่อครั้ง(K)  เว้น>1ชม.')
    for r in rows:
        print(f"{r['id']} {r['date']} {r['calls']:6d} {r['first']//1000:7d} {r['peak']//1000:9d} {r['total']//r['calls']//1000:10d} {r['cold']:8d}")
    print()
print(f"ช่วง {rows[0]['date']} ถึง {rows[-1]['date']} · {n} session · เรียกโมเดล {calls:,} ครั้ง")
print(f"เริ่ม session เฉลี่ย {sum(r['first'] for r in rows)//n//1000}K · สูงสุดเฉลี่ย {sum(r['peak'] for r in rows)//n//1000}K")
print(f"token ต่อครั้งเฉลี่ย {sum(r['total'] for r in rows)//calls//1000}K · ครั้งต่อ session {calls//n}")
print(f"เกิน {HANDOFF_AT//1000}K: {sum(1 for r in rows if r['peak'] > HANDOFF_AT)}/{n} · เกิน 300K: {sum(1 for r in rows if r['peak'] > 300_000)}/{n}")
print(f"cache read {sum(r['cr'] for r in rows)/1e6:,.1f}M · cache write {sum(r['cw'] for r in rows)/1e6:,.1f}M · output {sum(r['out'] for r in rows)/1e6:,.1f}M · เว้น>1ชม. {sum(r['cold'] for r in rows)} ครั้ง")
if args.detail:
    print('\nผลลัพธ์เครื่องมือ (ตัวอักษรรวม):')
    for k, v in tool_chars.most_common(10):
        print(f"  {k:24s} {v:12,d}  {tool_n[k]:6d} ครั้ง  เฉลี่ย {v//max(tool_n[k],1):,}")
