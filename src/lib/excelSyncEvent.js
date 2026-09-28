// เปิดโมดอล "นำเข้าจาก Excel" (ExcelSync.jsx บน top bar ของ AppShell) จากหน้าไหนก็ได้ — แผนผัง / ประวัติเบิก
// แยกจาก ExcelSync.jsx เพราะไฟล์ component export ฟังก์ชันธรรมดาไม่ได้ (react-refresh)
export const EXCEL_SYNC_OPEN_EVENT = 'excel-sync:open'
export const openExcelSync = () => window.dispatchEvent(new Event(EXCEL_SYNC_OPEN_EVENT))
