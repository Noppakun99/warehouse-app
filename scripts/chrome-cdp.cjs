// ต่อเข้า Chrome ที่เปิดด้วย scripts/open-chrome.ps1 แล้วทำงาน 1 ขั้น + ถ่ายภาพหน้าจอ
// ใช้:  node scripts/chrome-cdp.cjs "<โค้ด async ที่ใช้ตัวแปร page>" [ไฟล์ภาพ] [คำในURLของแท็บ]
// ตัวอย่าง: node scripts/chrome-cdp.cjs "await page.goto('https://supabase.com/dashboard')" shot.png supabase
// ⚠️ ห้ามถ่ายภาพ/พิมพ์หน้าที่มีความลับ (token, รหัสผ่าน) — อ่านค่าในสคริปต์แล้วส่งต่อตรง ไม่ console.log
const { chromium } = require('playwright');
(async () => {
  const [code = '', shot = 'chrome-shot.png', match = ''] = process.argv.slice(2);
  const b = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT || 9223}`);
  const pages = b.contexts()[0].pages();
  const page = (match && pages.find(p => p.url().includes(match))) || pages[0];
  try {
    if (code) {
      const out = await new Function('page', `return (async () => { ${code} })()`)(page);
      if (out !== undefined) console.log('OUT', typeof out === 'string' ? out : JSON.stringify(out));
    }
  } catch (e) { console.log('ERR', e.message.split('\n')[0]); }
  await page.waitForTimeout(800);
  if (shot !== '-') await page.screenshot({ path: shot });
  console.log('URL', page.url());
  process.exit(0);
})();
