import * as XLSX from 'xlsx';
import { insertAuditLog, resolveAuditUserName } from './db';

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
