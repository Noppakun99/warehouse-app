import * as XLSX from 'xlsx';
import { insertAuditLog, resolveAuditUserName, groupRowsByBill } from './db';

// แปลง ISO YYYY-MM-DD → DD/MM/YYYY (พ.ศ.)
function fmtDateThai(iso) {
  if (!iso) return '-';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}/${mo}/${Number(y) + 543}`;
}

function fmtBaht(n) {
  if (n == null || isNaN(n)) return 0;
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Export weekly AP batch — 3 sheets (Cover / Bills / Detail)
 * @param {object[]} rows     - rows จาก fetchApBills (filter เป็น stage ที่จะส่งบัญชี)
 * @param {string}   batchId  - 'YYYY-MM-DD' = วันที่ export
 * @param {object}   meta     - { hospitalName, periodFrom, periodTo, senderName }
 * @param {object}   auth     - สำหรับ audit log
 */
export async function exportApBatchExcel(rows, batchId, meta = {}, auth = {}) {
  if (!rows || rows.length === 0) throw new Error('ไม่มีรายการสำหรับ export');

  const bills = groupRowsByBill(rows);
  const totalValue = bills.reduce((s, b) => s + b.total_value, 0);
  const totalLots  = bills.reduce((s, b) => s + b.item_count, 0);

  const wb = XLSX.utils.book_new();

  // ============================================================
  // Sheet 1: ใบนำส่ง (Cover)
  // ============================================================
  const cover = [
    [meta.hospitalName || 'โรงพยาบาล'],
    ['ใบนำส่งบิลตั้งหนี้ (Weekly AP Batch)'],
    [],
    ['รหัสรอบส่ง', batchId],
    ['ช่วงวันรับของ', `${fmtDateThai(meta.periodFrom)} ถึง ${fmtDateThai(meta.periodTo)}`],
    ['วันที่ส่งบัญชี', fmtDateThai(batchId)],
    [],
    ['สรุปยอด'],
    ['จำนวนบิล', bills.length, 'ใบ'],
    ['จำนวนรายการ (lot)', totalLots, 'รายการ'],
    ['มูลค่ารวม (บาท)', fmtBaht(totalValue)],
    [],
    ['ผู้ส่ง (จัดซื้อ)', meta.senderName || ''],
    ['ลงนาม', '', 'วันที่', ''],
    [],
    ['ผู้รับ (บัญชี)'],
    ['ลงนาม', '', 'วันที่', ''],
  ];
  const wsCover = XLSX.utils.aoa_to_sheet(cover);
  wsCover['!cols'] = [{ wch: 24 }, { wch: 32 }, { wch: 10 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsCover, 'ใบนำส่ง');

  // ============================================================
  // Sheet 2: รายการบิล (Bills Summary) — group by bill_number
  // ============================================================
  const billsHeader = ['ลำดับ', 'เลขบิล', 'บริษัท', 'วันรับ', 'จำนวน lot', 'มูลค่ารวม (บาท)'];
  const billsData = [
    billsHeader,
    ...bills.map((b, i) => [
      i + 1,
      b.bill_number,
      b.supplier,
      fmtDateThai(b.receive_date),
      b.item_count,
      fmtBaht(b.total_value),
    ]),
    ['', '', '', 'รวม', totalLots, fmtBaht(totalValue)],
  ];
  const wsBills = XLSX.utils.aoa_to_sheet(billsData);
  wsBills['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 32 }, { wch: 12 }, { wch: 10 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsBills, 'รายการบิล');

  // ============================================================
  // Sheet 3: รายการละเอียด (Item Detail) — 1 row per lot
  // ============================================================
  const detailHeader = ['ลำดับ', 'เลขบิล', 'บริษัท', 'วันรับ', 'รหัสยา', 'ชนิด', 'ชื่อยา', 'Lot', 'Exp', 'หน่วย', 'จำนวน', 'ราคา/หน่วย', 'มูลค่า (บาท)'];
  const detailData = [detailHeader];
  let runIdx = 0;
  let detailTotalQty = 0;
  for (const b of bills) {
    for (const r of b.items) {
      runIdx += 1;
      const qty = parseFloat(r.qty_received) || 0;
      const price = parseFloat(r.price_per_unit) || 0;
      const lineValue = (r.total_price_vat != null && r.total_price_vat > 0)
        ? parseFloat(r.total_price_vat) : qty * price;
      detailTotalQty += qty;
      detailData.push([
        runIdx,
        b.bill_number,
        b.supplier,
        fmtDateThai(r.receive_date),
        r.drug_code || '-',
        r.drug_type || '-',
        r.drug_name || '-',
        r.lot || '-',
        r.exp || '-',
        r.drug_unit || '-',
        qty,
        fmtBaht(price),
        fmtBaht(lineValue),
      ]);
    }
  }
  detailData.push(['', '', '', '', '', '', '', '', '', 'รวม', detailTotalQty, '', fmtBaht(totalValue)]);
  const wsDetail = XLSX.utils.aoa_to_sheet(detailData);
  wsDetail['!cols'] = [
    { wch: 6 }, { wch: 18 }, { wch: 28 }, { wch: 12 }, { wch: 14 },
    { wch: 14 }, { wch: 36 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 12 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, 'รายการละเอียด');

  // ============================================================
  // Trigger download (iOS share, fallback writeFile)
  // ============================================================
  const fileName = `ส่งบัญชี_${batchId}.xlsx`;
  const xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: xlsxType });
  const file = new File([blob], fileName, { type: xlsxType });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `ส่งบัญชี ${batchId}` }); }
    catch (e) { if (e.name !== 'AbortError') XLSX.writeFile(wb, fileName); }
  } else {
    XLSX.writeFile(wb, fileName);
  }

  await insertAuditLog({
    action: 'export_ap_batch', table_name: 'receive_logs',
    user_name: resolveAuditUserName(auth), department: auth?.department || '-',
    record_count: rows.length,
    details: { batch_id: batchId, bill_count: bills.length, lot_count: rows.length, total_value: fmtBaht(totalValue), file: fileName },
  });

  return { fileName, billCount: bills.length, lotCount: rows.length, totalValue };
}

/**
 * ส่งออกข้อมูลเป็น Excel (.xlsx)
 * @param {object[]} rows  - array ของ data object
 * @param {Array<{header: string, key?: string, value?: (row)=>any}>} columns - column definitions
 * @param {string} sheetName - ชื่อ sheet
 * @param {string} fileName  - ชื่อไฟล์ (รวม .xlsx)
 * @param {object} auth      - { name, department } สำหรับ audit log
 */
export async function exportToExcel(rows, columns, sheetName, fileName, auth = {}) {
  const wsData = [
    columns.map(c => c.header),
    ...rows.map(row =>
      columns.map(c => {
        const v = typeof c.value === 'function' ? c.value(row) : row[c.key];
        return v != null && v !== '-' ? v : '';
      })
    ),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // ปรับความกว้าง column อัตโนมัติ
  const colWidths = columns.map((_, ci) => {
    let maxLen = String(wsData[0][ci] ?? '').length;
    for (let ri = 1; ri < wsData.length; ri++) {
      const len = String(wsData[ri][ci] ?? '').length;
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(maxLen + 2, 40) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // บน iOS Safari ใช้ Web Share API เพื่อเปิด share sheet (ดาวน์โหลดปกติไม่ทำงาน)
  const xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: xlsxType });
  const file = new File([blob], fileName, { type: xlsxType });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: sheetName });
    } catch (e) {
      if (e.name !== 'AbortError') XLSX.writeFile(wb, fileName); // fallback ถ้า share ล้มเหลว
    }
  } else {
    XLSX.writeFile(wb, fileName); // desktop / Android
  }

  await insertAuditLog({
    action: 'export_excel', table_name: sheetName,
    user_name: resolveAuditUserName(auth), department: auth.department,
    record_count: rows.length,
    details: { file: fileName },
  });
}
