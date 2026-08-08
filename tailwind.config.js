/** @type {import('tailwindcss').Config} */
export default {
  // dark mode = class บน <html> (สลับด้วยปุ่มใน AppShell) — ไม่ตามระบบอัตโนมัติ
  // ปัจจุบันใส่ dark: เฉพาะ shell (sidebar/top bar) เนื้อหา sub-app ยังสว่าง
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
