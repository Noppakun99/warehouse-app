// เปิดช่องค้นหา (ยา + เมนู) ของ AppShell จากหน้าไหนก็ได้ — ช่องใหญ่บนหน้าหลัก
// แบบเดียวกับ excelSyncEvent.js: ไฟล์ component export ฟังก์ชันธรรมดาไม่ได้ (react-refresh)
export const DRUG_SEARCH_OPEN_EVENT = 'drug-search:open'
export const openDrugSearch = () => window.dispatchEvent(new Event(DRUG_SEARCH_OPEN_EVENT))
