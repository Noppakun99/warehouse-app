// ดัก token ใหม่ของ Supabase ตอน user กด "Create token" เอง แล้วตั้ง MCP supabase (user scope) ให้
// ใช้: 1) powershell -File scripts/open-chrome.ps1 -Url https://supabase.com/dashboard/account/tokens
//      2) user ล็อกอิน → Generate token → ตั้งค่า (Expires ≤ 1 ปีจากวันนี้ ไม่งั้น Supabase ตอบ "no later than one year")
//      3) รันสคริปต์นี้ (background ได้ · รอ 9 นาที) → user กด Create token เอง (ปุ่มนี้ไม่รับคลิกจากสคริปต์)
//      4) ผ่าน = mcp remove/add แล้ว → Reload Window ใน VS Code → ทดสอบ execute_sql "select 1"
// token ไม่ถูกพิมพ์ออกจอ · ทดสอบกับ API ก่อน (200) ถึงจะแก้ ~/.claude.json · CDP_PORT ตั้งได้ (ค่าเริ่ม 9223)
const { createRequire } = require('module');
const r = createRequire(__filename);
const { chromium } = r('playwright');
const { spawnSync } = require('child_process');
const mask = s => String(s).replace(/sbp_[A-Za-z0-9_]+/g, 'sbp_…');
(async () => {
  const b = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT || 9223}`);
  let page;
  for (let i = 0; i < 20 && !page; i++) {
    page = b.contexts().flatMap(c => c.pages()).find(p => p.url().includes('supabase.com/dashboard'));
    if (!page) await new Promise(r => setTimeout(r, 500));
  }
  if (!page) { console.log('NO PAGE', b.contexts().flatMap(c => c.pages()).map(p => p.url())); process.exit(1); }
  console.log('watching', page.url());
  let tok = null;
  page.on('response', async res => {
    const req = res.request();
    if (req.method() !== 'POST' || !/token/i.test(res.url())) return;
    let body = ''; try { body = await res.text(); } catch {}
    console.log('POST', res.url().replace(/\?.*/, ''), res.status(), res.ok() ? '' : mask(body).slice(0, 400));
    const m = body.match(/sbp_[A-Za-z0-9_]{30,}/); if (m) tok = m[0];
  });
  const end = Date.now() + 9 * 60 * 1000;
  while (!tok && Date.now() < end) {
    await page.waitForTimeout(1000);
    try {
      const html = await page.content();
      const vals = await page.locator('input').evaluateAll(els => els.map(e => e.value));
      const m = (vals.join(' ') + ' ' + html).match(/sbp_[A-Za-z0-9_]{30,}/); if (m) tok = m[0];
    } catch {}
  }
  if (!tok) { console.log('TIMEOUT no token'); process.exit(1); }
  const res = await fetch('https://api.supabase.com/v1/projects/kgjocnfafhqqioneqapk', { headers: { Authorization: `Bearer ${tok}` } });
  console.log('token len', tok.length, 'API check HTTP', res.status);
  if (res.status !== 200) process.exit(1);
  const run = a => { const p = spawnSync('claude', a, { shell: true, encoding: 'utf8' }); return mask(p.stdout + p.stderr).trim(); };
  console.log('remove:', run(['mcp', 'remove', 'supabase', '-s', 'user']));
  console.log('add:', run(['mcp', 'add', 'supabase', '-s', 'user', '-e', `SUPABASE_ACCESS_TOKEN=${tok}`, '--', 'npx', '-y', '@supabase/mcp-server-supabase@latest', '--project-ref=kgjocnfafhqqioneqapk']));
  process.exit(0);
})();
