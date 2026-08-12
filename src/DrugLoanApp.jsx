import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeftRight, Plus, Search, RefreshCcw, FileDown, Printer, X, Trash2,
  AlertTriangle, CheckCircle2, Pencil,
} from 'lucide-react';
import BackButton from './BackButton';
import { exportToExcel } from './lib/exportExcel';
import {
  fetchDrugLoans, insertDrugLoan, updateDrugLoan, deleteDrugLoan,
  LOAN_DIRECTION, loanOverdueDays,
} from './lib/db';

// เกณฑ์เตือนของค้างคืน (วัน) — >90 แดง, 30-90 ส้ม, <30 ปกติ
const OVERDUE_RED = 90;
const OVERDUE_AMBER = 30;

const fmtThai = (iso) => {
  if (!iso) return '-';
  const [y, m, d] = String(iso).split('-').map(Number);
  return (y && m && d) ? `${d}/${m}/${y + 543}` : String(iso);
};
const fmtQty = (r) => {
  if (r.qty == null) return '-';
  const n = Number(r.qty);
  const q = Number.isFinite(n) ? n.toLocaleString('th-TH') : r.qty;
  return r.unit ? `${q} (${String(r.unit).trim()})` : String(q);
};

const LOAN_EXCEL_COLS = [
  { header: 'ทิศทาง',       value: r => LOAN_DIRECTION[r.direction] || r.direction },
  { header: 'คู่สัญญา',      key: 'counterparty' },
  { header: 'รหัสยา',        value: r => r.drug_code || '-' },
  { header: 'ชื่อยา',        key: 'drug_name' },
  { header: 'รูปแบบ',        value: r => r.dosage_form || '-' },
  { header: 'Lot',            value: r => r.lot || '-' },
  { header: 'วันหมดอายุ',   value: r => r.exp || '-' },
  { header: 'จำนวน',         value: r => fmtQty(r) },
  { header: 'ราคา/หน่วย',    value: r => r.price_per_unit ?? '-' },
  { header: 'ราคารวม',       value: r => r.total_price ?? '-' },
  { header: 'วันที่ให้ยืม',  value: r => fmtThai(r.loan_date) },
  { header: 'เลขที่ใบยืม',   value: r => r.loan_doc || '-' },
  { header: 'บริษัทที่ให้ยืม', value: r => r.loan_company || '-' },
  { header: 'วันที่รับคืน',  value: r => fmtThai(r.return_date) },
  { header: 'เลขที่ใบคืน',   value: r => r.return_doc || '-' },
  { header: 'บริษัทที่รับคืน', value: r => r.return_company || '-' },
  { header: 'สถานะ',          value: r => r.return_date ? 'คืนแล้ว' : `ค้างคืน ${loanOverdueDays(r) ?? '-'} วัน` },
];

const EMPTY_FORM = {
  direction: 'borrow', counterparty: '', drug_code: '', drug_name: '', dosage_form: '',
  lot: '', exp: '', qty: '', unit: '', price_per_unit: '', total_price: '',
  loan_date: '', loan_doc: '', loan_company: '', return_date: '', return_doc: '', return_company: '', note: '',
};

export default function DrugLoanApp({ auth = {}, onRefresh, onGoBack, canGoBack }) {
  const canEdit = auth?.role === 'staff' || auth?.role === 'admin';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('outstanding');   // outstanding | borrow | lend
  const [sub, setSub] = useState('all');           // กรองย่อยในแท็บ: all | open (ค้างคืน) | returned (คืนแล้ว)
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try { setRows(await fetchDrugLoans()); }
    catch (e) { setErr(e?.message || 'โหลดข้อมูลไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const outstanding = useMemo(() => rows.filter(r => !r.return_date), [rows]);

  // แถวของแท็บปัจจุบัน ก่อนกรองสถานะย่อย/คำค้น — ใช้นับจำนวนในปุ่มกรองย่อยด้วย
  const tabRows = useMemo(
    () => (tab === 'outstanding' ? outstanding : rows.filter(r => r.direction === tab)),
    [rows, outstanding, tab],
  );
  const subCounts = useMemo(() => ({
    all: tabRows.length,
    open: tabRows.filter(r => !r.return_date).length,
    returned: tabRows.filter(r => r.return_date).length,
  }), [tabRows]);

  // สรุปของค้างคืน แยกตาม "ทิศทาง + คู่สัญญา" — ตอบคำถาม "รพ.ไหนเราค้างอยู่กี่รายการ / ใครค้างเรา"
  // เรียง: ค้างนานสุดก่อน (งานเร่งอยู่บนสุด) แล้วค่อยจำนวนมาก
  const summary = useMemo(() => {
    const mk = (dir) => {
      const map = new Map();
      for (const r of outstanding.filter(x => x.direction === dir)) {
        const key = r.counterparty || '(ไม่ระบุ)';
        const cur = map.get(key) || { counterparty: key, count: 0, maxDays: 0, rows: [] };
        cur.count += 1;
        cur.maxDays = Math.max(cur.maxDays, loanOverdueDays(r) ?? 0);
        cur.rows.push(r);
        map.set(key, cur);
      }
      return [...map.values()].sort((a, b) => b.maxDays - a.maxDays || b.count - a.count);
    };
    return { borrow: mk('borrow'), lend: mk('lend') };
  }, [outstanding]);

  const filtered = useMemo(() => {
    let base = tabRows;
    if (sub === 'open') base = base.filter(r => !r.return_date);
    else if (sub === 'returned') base = base.filter(r => r.return_date);
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter(r => [r.drug_name, r.drug_code, r.lot, r.counterparty, r.loan_doc, r.return_doc]
      .some(v => String(v || '').toLowerCase().includes(q)));
  }, [tabRows, sub, search]);

  const handleExport = async () => {
    if (exporting || filtered.length === 0) return;
    setExporting(true);
    try {
      // ชื่อไฟล์ต้องบอกตัวกรองที่ใช้จริง ไม่งั้นไฟล์ที่ export ตอนกรองอยู่ดูเหมือนทั้งหมด (Rule #6)
      const subLabel = tab === 'outstanding' || sub === 'all' ? '' : `_${sub === 'open' ? 'ค้างคืน' : 'คืนแล้ว'}`;
      const label = (tab === 'outstanding' ? 'ค้างคืน' : LOAN_DIRECTION[tab]) + subLabel;
      await exportToExcel(filtered, LOAN_EXCEL_COLS, 'ยืมคืนยา',
        `ยืมคืนยา_${label}_${new Date().toISOString().slice(0, 10)}.xlsx`, auth);
    } catch (e) { setErr(e?.message || 'ส่งออก Excel ไม่สำเร็จ'); }
    finally { setExporting(false); }
  };

  const handlePrint = () => {
    const esc = (s) => String(s ?? '-').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const subLabel = tab === 'outstanding' || sub === 'all' ? '' : ` · ${sub === 'open' ? 'ค้างคืน' : 'คืนแล้ว'}`;
    const label = (tab === 'outstanding' ? 'ค้างคืน' : LOAN_DIRECTION[tab]) + subLabel;
    const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
      <title>ยืม-คืนยาระหว่าง รพ. (${esc(label)})</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        *{font-family:'Sarabun',sans-serif;box-sizing:border-box}
        body{margin:16px;color:#1e293b}
        @page{size:A4 landscape;margin:8mm}
        h1{font-size:17px;margin:0 0 2px}
        .sub{color:#64748b;font-size:11px;margin:0 0 8px}
        table{width:100%;border-collapse:collapse;font-size:10.5px}
        th,td{border:1px solid #cbd5e1;padding:4px 5px;text-align:left;vertical-align:top}
        th{background:#f1f5f9;font-weight:700}
      </style></head><body>
      <h1>ยืม-คืนยาระหว่างโรงพยาบาล — ${esc(label)}</h1>
      <p class="sub">พิมพ์เมื่อ ${fmtThai(new Date().toISOString().slice(0, 10))} · ${filtered.length} รายการ${
        filtered.some(r => !r.return_date) ? ` · ค้างคืน ${filtered.filter(r => !r.return_date).length}` : ''}</p>
      <table><thead><tr>
        <th>ทิศทาง</th><th>คู่สัญญา</th><th>รหัส</th><th>ชื่อยา</th><th>Lot</th><th>EXP</th>
        <th>จำนวน</th><th>วันที่ให้ยืม</th><th>เลขที่ใบยืม</th><th>วันที่รับคืน</th><th>สถานะ</th>
      </tr></thead><tbody>
      ${filtered.map(r => `<tr>
        <td>${esc(LOAN_DIRECTION[r.direction])}</td><td>${esc(r.counterparty)}</td>
        <td>${esc(r.drug_code)}</td><td>${esc(r.drug_name)}</td><td>${esc(r.lot)}</td><td>${esc(r.exp)}</td>
        <td style="text-align:right">${esc(fmtQty(r))}</td>
        <td>${esc(fmtThai(r.loan_date))}</td><td>${esc(r.loan_doc)}</td><td>${esc(fmtThai(r.return_date))}</td>
        <td>${r.return_date ? 'คืนแล้ว' : `ค้างคืน ${loanOverdueDays(r) ?? '-'} วัน`}</td>
      </tr>`).join('')}
      </tbody></table>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const win = window.open(url, '_blank');
    if (win === null) {
      // In-app WebView (LINE/FB) บล็อก window.open → นำทางผ่าน <a> click แทน (Critical Rule #4)
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const markReturned = async (r) => {
    // local parts ไม่ใช่ toISOString() — บน UTC+7 ช่วงเที่ยงคืน-07:00 น. toISOString ให้วันเมื่อวาน
    // (กับดักเดียวกับ deadline คืนบริษัทใน db.js)
    const n = new Date();
    const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    try {
      await updateDrugLoan(r.id, { return_date: today }, auth);
      await load();
    } catch (e) { setErr(e?.message || 'บันทึกรับคืนไม่สำเร็จ'); }
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`ลบรายการ "${r.drug_name}" lot ${r.lot || '-'} ?`)) return;
    try { await deleteDrugLoan(r.id, auth); await load(); }
    catch (e) { setErr(e?.message || 'ลบไม่สำเร็จ'); }
  };

  const overdueBadge = (r) => {
    if (r.return_date) {
      return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 shrink-0">คืนแล้ว {fmtThai(r.return_date)}</span>;
    }
    const d = loanOverdueDays(r);
    const tone = d == null ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
      : d > OVERDUE_RED ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60'
      : d >= OVERDUE_AMBER ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-900/60'
      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${tone}`}>ค้างคืน {d == null ? '-' : `${d} วัน`}</span>;
  };

  const TABS = [
    { key: 'outstanding', label: `ค้างอยู่ (${outstanding.length})` },
    { key: 'borrow', label: `เรายืมเขา (${rows.filter(r => r.direction === 'borrow').length})` },
    { key: 'lend', label: `เราให้เขายืม (${rows.filter(r => r.direction === 'lend').length})` },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3 sticky top-0 z-30">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <BackButton onGoBack={onGoBack} canGoBack={canGoBack} />
            <ArrowLeftRight size={20} className="text-sky-600 shrink-0" />
            <button onClick={onRefresh} className="text-left min-w-0">
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">ยืม-คืนยาระหว่าง รพ.</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">บันทึกการยืม-คืน · ติดตามของค้างคืน (ไม่หักสต็อก)</p>
            </button>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={load} title="โหลดใหม่"
              className="p-2 rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
              <RefreshCcw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={handlePrint} disabled={filtered.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium disabled:opacity-50">
              <Printer size={15} /> พิมพ์
            </button>
            <button onClick={handleExport} disabled={exporting || filtered.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
              {exporting ? <RefreshCcw size={15} className="animate-spin" /> : <FileDown size={15} />} Excel
            </button>
            {canEdit && (
              <button onClick={() => { setEditRow(null); setFormOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-medium">
                <Plus size={15} /> บันทึกการยืม
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 space-y-3">
        {err && (
          <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3 rounded-xl border border-red-200 dark:border-red-900/60 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {err}
          </div>
        )}

        {/* สรุปของค้างคืน แยก "เราค้างเขา" / "เขาค้างเรา" รายโรงพยาบาล
            ตอบคำถาม "รพ.ปทุมธานี เรายังไม่ได้คืนกี่รายการ" ได้ในหน้าเดียว คลิกเพื่อกรองต่อ */}
        {outstanding.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SummaryCard
              title="เราค้างคืนเขา" subtitle="ยืมมาแล้วยังไม่ได้คืน" tone="sky"
              groups={summary.borrow}
              onPick={(cp) => { setTab('borrow'); setSub('open'); setSearch(cp); }}
            />
            <SummaryCard
              title="เขาค้างคืนเรา" subtitle="ให้ยืมไปแล้วยังไม่ได้รับคืน" tone="violet"
              groups={summary.lend}
              onPick={(cp) => { setTab('lend'); setSub('open'); setSearch(cp); }}
            />
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setSub('all'); }}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                tab === t.key
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* กรองย่อยในแท็บ — แท็บ "ค้างอยู่" ไม่มีของที่คืนแล้วอยู่แล้ว จึงไม่ต้องมีตัวกรองนี้ */}
        {tab !== 'outstanding' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">สถานะ:</span>
            {[
              { key: 'all',      label: `ทั้งหมด (${subCounts.all})` },
              { key: 'open',     label: `ค้างคืน (${subCounts.open})` },
              { key: 'returned', label: `คืนแล้ว (${subCounts.returned})` },
            ].map(s => (
              <button key={s.key} onClick={() => setSub(s.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  sub === s.key
                    ? (s.key === 'open'
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-900/60'
                        : s.key === 'returned'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600')
                    : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหา ชื่อยา / รหัส / lot / รพ. / เลขที่ใบยืม…"
            className="w-full border border-slate-300 dark:border-slate-600 rounded-xl pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>

        {loading ? (
          <p className="text-center text-slate-400 dark:text-slate-500 py-10 text-sm">กำลังโหลด…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-slate-400 dark:text-slate-500 py-10 text-sm">ไม่พบรายการ</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => (
              <div key={r.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                    r.direction === 'borrow'
                      ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-900/60'
                      : 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-900/60'}`}>
                    {LOAN_DIRECTION[r.direction]}
                  </span>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate min-w-0">{r.drug_name}</span>
                  {r.drug_code && <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">[{r.drug_code}]</span>}
                  {overdueBadge(r)}
                  {canEdit && (
                    <span className="ml-auto flex items-center gap-1.5 shrink-0">
                      {!r.return_date && (
                        <button onClick={() => markReturned(r)}
                          className="flex items-center gap-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-md">
                          <CheckCircle2 size={12} /> บันทึกรับคืน
                        </button>
                      )}
                      <button onClick={() => { setEditRow(r); setFormOpen(true); }} title="แก้ไข"
                        className="p-1.5 rounded-md border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => handleDelete(r)} title="ลบ"
                        className="p-1.5 rounded-md border border-rose-200 dark:border-rose-900/60 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                        <Trash2 size={12} />
                      </button>
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-[11px]">
                  <div><span className="text-slate-400 dark:text-slate-500">คู่สัญญา:</span> <span className="text-slate-700 dark:text-slate-200 font-medium">{r.counterparty}</span></div>
                  <div><span className="text-slate-400 dark:text-slate-500">Lot:</span> <span className="text-slate-700 dark:text-slate-200">{r.lot || '-'}</span></div>
                  <div><span className="text-slate-400 dark:text-slate-500">EXP:</span> <span className="text-slate-700 dark:text-slate-200">{r.exp || '-'}</span></div>
                  <div><span className="text-slate-400 dark:text-slate-500">จำนวน:</span> <span className="text-slate-800 dark:text-slate-100 font-semibold">{fmtQty(r)}</span></div>
                  <div><span className="text-slate-400 dark:text-slate-500">วันที่ให้ยืม:</span> <span className="text-slate-700 dark:text-slate-200">{fmtThai(r.loan_date)}</span></div>
                  <div className="col-span-2"><span className="text-slate-400 dark:text-slate-500">เลขที่ใบยืม:</span> <span className="text-slate-700 dark:text-slate-200">{r.loan_doc || '-'}</span></div>
                  {r.return_doc && <div><span className="text-slate-400 dark:text-slate-500">เลขที่ใบคืน:</span> <span className="text-slate-700 dark:text-slate-200">{r.return_doc}</span></div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <LoanFormModal
          row={editRow} auth={auth}
          onClose={() => { setFormOpen(false); setEditRow(null); }}
          onSaved={async () => { setFormOpen(false); setEditRow(null); await load(); }}
          onError={setErr}
        />
      )}
    </div>
  );
}

// ---- การ์ดสรุปของค้างคืน รายโรงพยาบาล ----
// tone เขียน class เต็ม — Tailwind purge ตัด class ที่ประกอบจาก template string
const SUMMARY_TONE = {
  sky: {
    box: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900/60',
    head: 'text-sky-800 dark:text-sky-300',
    pill: 'bg-sky-600 text-white',
    row: 'hover:bg-sky-100/70 dark:hover:bg-sky-900/40',
  },
  violet: {
    box: 'bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-900/60',
    head: 'text-violet-800 dark:text-violet-300',
    pill: 'bg-violet-600 text-white',
    row: 'hover:bg-violet-100/70 dark:hover:bg-violet-900/40',
  },
};

function SummaryCard({ title, subtitle, tone, groups, onPick }) {
  const t = SUMMARY_TONE[tone] || SUMMARY_TONE.sky;
  const total = groups.reduce((a, g) => a + g.count, 0);
  return (
    <div className={`border rounded-xl px-4 py-3 ${t.box}`}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className={`text-sm font-bold ${t.head}`}>{title}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${t.pill}`}>{total} รายการ</span>
      </div>
      {groups.length === 0 ? (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 py-1">ไม่มีของค้างคืน</p>
      ) : (
        <div className="space-y-1">
          {groups.map(g => (
            <button key={g.counterparty} onClick={() => onPick(g.counterparty)}
              title="คลิกเพื่อดูเฉพาะรายการของที่นี่"
              className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${t.row}`}>
              <span className="text-[12px] font-medium text-slate-700 dark:text-slate-200 truncate min-w-0">{g.counterparty}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                {g.maxDays > OVERDUE_RED && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60">
                    ค้างนานสุด {g.maxDays} วัน
                  </span>
                )}
                <span className="text-[12px] font-bold text-slate-800 dark:text-slate-100">{g.count}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">รายการ</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- ฟอร์มบันทึก/แก้ไขการยืม ----
function LoanFormModal({ row, auth, onClose, onSaved, onError }) {
  const [f, setF] = useState(() => row
    ? Object.fromEntries(Object.keys(EMPTY_FORM).map(k => [k, row[k] ?? '']))
    : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        ...f,
        drug_code: f.drug_code || null, dosage_form: f.dosage_form || null,
        lot: f.lot || '-', exp: f.exp || null, unit: f.unit || null,
        qty: f.qty === '' ? null : Number(f.qty),
        price_per_unit: f.price_per_unit === '' ? null : Number(f.price_per_unit),
        total_price: f.total_price === '' ? null : Number(f.total_price),
        loan_date: f.loan_date || null, loan_doc: f.loan_doc || null, loan_company: f.loan_company || null,
        return_date: f.return_date || null, return_doc: f.return_doc || null, return_company: f.return_company || null,
        note: f.note || null,
      };
      if (row) await updateDrugLoan(row.id, payload, auth);
      else await insertDrugLoan(payload, auth);
      await onSaved();
    } catch (e2) {
      onError(e2?.message || 'บันทึกไม่สำเร็จ');
      setSaving(false);
    }
  };

  const inputCls = 'w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500';
  const labelCls = 'text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1 block';
  const dateProps = { type: 'date', onClick: (e) => { try { e.currentTarget.showPicker?.(); } catch { /* mobile ไม่รองรับ */ } } };

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="bg-sky-600 text-white px-5 py-3 rounded-t-2xl flex items-center justify-between shrink-0">
          <p className="font-bold">{row ? 'แก้ไขรายการยืม-คืน' : 'บันทึกการยืมยา'}</p>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white bg-white/20 hover:bg-white/30 p-1.5 rounded-lg"><X size={16} /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>ทิศทาง *</label>
            <select value={f.direction} onChange={set('direction')} className={inputCls} required>
              {Object.entries(LOAN_DIRECTION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>คู่สัญญา (รพ./บริษัท) *</label>
            <input value={f.counterparty} onChange={set('counterparty')} className={inputCls} required placeholder="เช่น รพ.ปทุมธานี" />
          </div>
          <div><label className={labelCls}>รหัสยา</label><input value={f.drug_code} onChange={set('drug_code')} className={inputCls} /></div>
          <div><label className={labelCls}>ชื่อยา *</label><input value={f.drug_name} onChange={set('drug_name')} className={inputCls} required /></div>
          <div><label className={labelCls}>รูปแบบ</label><input value={f.dosage_form} onChange={set('dosage_form')} className={inputCls} placeholder="Tablet / Injection" /></div>
          <div><label className={labelCls}>Lot</label><input value={f.lot} onChange={set('lot')} className={inputCls} /></div>
          <div><label className={labelCls}>วันหมดอายุ (EXP)</label><input value={f.exp} onChange={set('exp')} className={inputCls} placeholder="เช่น 25 กุมภาพันธ์ 2027" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls}>จำนวน</label><input type="number" step="any" value={f.qty} onChange={set('qty')} className={inputCls} /></div>
            <div><label className={labelCls}>หน่วยนับ</label><input value={f.unit} onChange={set('unit')} className={inputCls} placeholder="500เม็ด" /></div>
          </div>
          <div><label className={labelCls}>ราคา/หน่วย</label><input type="number" step="any" value={f.price_per_unit} onChange={set('price_per_unit')} className={inputCls} /></div>
          <div><label className={labelCls}>ราคารวมภาษี</label><input type="number" step="any" value={f.total_price} onChange={set('total_price')} className={inputCls} /></div>
          <div><label className={labelCls}>วันที่ให้ยืม</label><input {...dateProps} value={f.loan_date} onChange={set('loan_date')} className={inputCls} /></div>
          <div><label className={labelCls}>เลขที่ใบยืม</label><input value={f.loan_doc} onChange={set('loan_doc')} className={inputCls} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>บริษัทที่ให้ยืม</label><input value={f.loan_company} onChange={set('loan_company')} className={inputCls} /></div>

          <div className="sm:col-span-2 border-t border-slate-200 dark:border-slate-700 pt-3">
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">การรับคืน (เว้นว่าง = ยังไม่คืน)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className={labelCls}>วันที่รับคืน</label><input {...dateProps} value={f.return_date} onChange={set('return_date')} className={inputCls} /></div>
              <div><label className={labelCls}>เลขที่ใบคืน</label><input value={f.return_doc} onChange={set('return_doc')} className={inputCls} /></div>
              <div><label className={labelCls}>บริษัทที่รับคืน</label><input value={f.return_company} onChange={set('return_company')} className={inputCls} /></div>
            </div>
          </div>
          <div className="sm:col-span-2"><label className={labelCls}>หมายเหตุ</label><input value={f.note} onChange={set('note')} className={inputCls} /></div>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">ยกเลิก</button>
          <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium disabled:opacity-50">
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </form>
    </div>
  );
}
