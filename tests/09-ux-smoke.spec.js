/**
 * UX Smoke Tests — ตรวจทุก sub-app เปิดได้ไม่ crash + เห็น key element + mobile responsive
 *
 * เป้าหมาย: simulate ผู้ใช้คลิกเข้าทุกหน้าเหมือนใช้งานจริง
 *   - หน้าเปิดได้ไม่ blank/error
 *   - เห็น key element อย่างน้อย 1 อย่าง (search bar, ปุ่ม action, header)
 *   - กลับ dashboard ได้ (ปุ่ม back หรือคลิก logo)
 *   - mobile viewport (375px) — ไม่มี horizontal scroll
 *
 * Sub-apps ที่ทดสอบ (requester เข้าได้):
 *   inventory · requisition · receive · dispense · return · analytics
 * (audit + users + ส่งบัญชี ทดสอบใน 05/08/permissions แล้ว)
 */
import { test, expect, waitForAppShell } from './fixtures.js';

const SUB_APPS = [
  { card: 'ระบบแผนผังคลังยา',       key: 'inventory',   waitText: /ค้นหา|คลังยา|รายการยา/ },
  { card: 'ระบบเบิกยาออนไลน์',       key: 'requisition', waitText: /ค้นหายาในคลัง|ตะกร้า|ใบเบิก/ },
  { card: 'ประวัติการรับยาเข้าคลัง', key: 'receive',     waitText: /ประวัติ|รับยา|ค้นหา/ },
  { card: 'ประวัติการเบิกจ่ายยา',    key: 'dispense',    waitText: /ประวัติ|เบิกจ่าย|ค้นหา/ },
  { card: 'ระบบคืนยา / ยาเสียหาย',   key: 'return',      waitText: /คืนยา|บันทึก|ค้นหา/ },
  { card: 'วิเคราะห์การเบิกยา',       key: 'analytics',   waitText: /วิเคราะห์|กราฟ|Top|หน่วยงาน/ },
];

async function gotoDashboard(page) {
  await page.goto('/');
  await waitForAppShell(page);
}

async function openSubApp(page, cardText) {
  await gotoDashboard(page);
  await page.getByText(cardText, { exact: true }).first().click();
}

test.describe('UX Smoke — ทุก sub-app เปิดได้ไม่ crash', () => {

  for (const app of SUB_APPS) {
    test(`เปิด "${app.card}" — เห็น key element + ไม่มี JS error`, async ({ staffPage: page }) => {
      if (!page) test.skip();
      // เก็บทั้ง pageerror และ console.error (chart/recharts crash บางครั้งแค่ console.error)
      const errors = [];
      page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
      page.on('console', m => {
        if (m.type() !== 'error') return;
        const txt = m.text();
        // ข้าม network/CORS error — ไม่ใช่ component crash
        if (/Failed to fetch|NetworkError|net::|Refused to|CORS|401|403/i.test(txt)) return;
        errors.push(`[console] ${txt}`);
      });

      await openSubApp(page, app.card);

      // ต้องเห็น text ที่บ่งบอกว่าโหลด sub-app สำเร็จ
      await expect(page.getByText(app.waitText).first()).toBeVisible({ timeout: 10_000 });

      // ไม่มี JS exception ตอนเปิดหน้า (สำคัญที่สุด — user เจอ white screen = พัง)
      expect(errors, `errors ใน ${app.key}:\n${errors.join('\n')}`).toHaveLength(0);
    });
  }

  test('Dashboard cards คลิกได้ครบ (requester เห็นกลุ่ม Daily / Reports)', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoDashboard(page);

    // กลุ่ม dashboard ตาม GROUPS ใน AppRoot
    await expect(page.getByText(/Daily Operations|งานประจำวัน/).first()).toBeVisible();
    await expect(page.getByText(/History.*Reports|สรุปและรายงาน/).first()).toBeVisible();

    // นับ card ที่ requester เห็นได้ — ควร ≥ 6 (inventory, requisition, receive, dispense, return, analytics)
    const visibleCards = await Promise.all(
      SUB_APPS.map(a => page.getByText(a.card, { exact: true }).first().isVisible().catch(() => false))
    );
    const visibleCount = visibleCards.filter(Boolean).length;
    expect(visibleCount).toBeGreaterThanOrEqual(6);
  });

  test('Logout ทำงาน + ส่งกลับหน้า login', async ({ browser }) => {
    // ใช้ context แยกเพื่อไม่กระทบ worker-scoped fixture
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const { login } = await import('./helpers/auth.js');
    const STAFF_USER = process.env.TEST_STAFF_USER || 'Kao_9';
    const STAFF_PASS = process.env.TEST_STAFF_PASS || '96409999';
    try { await login(page, STAFF_USER, STAFF_PASS); }
    catch { await ctx.close(); test.skip(); return; }

    const logoutBtn = page.getByRole('button', { name: /ออกจากระบบ|logout/i }).first();
    const hasLogout = await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false);

    if (hasLogout) {
      await logoutBtn.click();
      // หลัง logout → ควรกลับหน้า login (เห็น input password หรือปุ่ม "เข้าสู่ระบบ")
      await expect(
        page.getByRole('button', { name: /เข้าสู่ระบบ/ }).first()
      ).toBeVisible({ timeout: 5_000 });
    }
    await ctx.close();
  });
});

// ─── Mobile responsive smoke (375px = iPhone SE) ───────────────────────────
test.describe('UX Smoke — Mobile viewport (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const app of SUB_APPS.slice(0, 4)) { // เช็คเฉพาะ 4 หน้าหลัก กัน test ยาว
    test(`mobile: "${app.card}" ไม่มี horizontal scroll + key element เห็นได้`, async ({ staffPage: page }) => {
      if (!page) test.skip();
      await openSubApp(page, app.card);
      await expect(page.getByText(app.waitText).first()).toBeVisible({ timeout: 10_000 });

      // ห้ามมี horizontal scroll (body.scrollWidth ≤ viewport.width + buffer 2px)
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth - window.innerWidth;
      });
      expect(overflow, `${app.key} มี horizontal overflow ${overflow}px`).toBeLessThanOrEqual(2);
    });
  }
});

// ─── UX consistency rules (จาก CLAUDE.md) ──────────────────────────────────
test.describe('UX Consistency — กฎจาก CLAUDE.md', () => {

  test('ไม่มี emoji ใน UI หลัก (ใช้ lucide-react icon เท่านั้น)', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoDashboard(page);

    // scan ปุ่มและ heading หลัก — ไม่ควรมี emoji unicode range
    // ตรงนี้เฉพาะ dashboard cards/buttons ที่ user เห็นทันที (ไม่ scan ทั้งหน้า เพราะ admin badge อาจมี ✓)
    const textNodes = await page.locator('button, h1, h2, h3').allTextContents();
    const emojiPattern = /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
    const offenders = textNodes.filter(t => emojiPattern.test(t));
    expect(offenders, `พบ emoji ใน UI: ${offenders.join(', ')}`).toHaveLength(0);
  });

  test('UI ทั้งหมดเป็นภาษาไทย (dashboard cards ต้องมีอักษรไทย)', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoDashboard(page);
    const cardTitles = await page.locator('h2, h3').allTextContents();
    const thaiPattern = /[ก-๙]/;
    const thaiCount = cardTitles.filter(t => thaiPattern.test(t)).length;
    expect(thaiCount).toBeGreaterThanOrEqual(3);
  });

  test('Date ใน UI เป็น DD/MM/YYYY หรือ พ.ศ. — ไม่มี ISO (YYYY-MM-DD) visible (กฎ #3)', async ({ staffPage: page }) => {
    if (!page) test.skip();
    // เช็คหน้า dispense + receive — สอง sub-app ที่มี date heavy
    for (const card of ['ประวัติการเบิกจ่ายยา', 'ประวัติการรับยาเข้าคลัง']) {
      await gotoDashboard(page);
      await page.getByText(card, { exact: true }).first().click();
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      // visible text ห้ามมี YYYY-MM-DD (อนุญาตใน attribute เช่น <input value="2025-01-15">)
      const visibleIso = await page.locator('body').evaluate(el => {
        const re = /\b\d{4}-\d{2}-\d{2}\b/;
        function walk(node) {
          if (node.nodeType === Node.TEXT_NODE) return re.test(node.textContent) ? node.textContent : null;
          if (node.nodeType !== Node.ELEMENT_NODE) return null;
          const style = window.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') return null;
          for (const c of node.childNodes) { const r = walk(c); if (r) return r; }
          return null;
        }
        return walk(el);
      });
      expect(visibleIso, `${card} แสดง ISO date: ${visibleIso}`).toBeNull();
    }
  });

  test('Loading state ไม่ใช่หน้าขาวเปล่า — มี header/dashboard ก่อนข้อมูลโหลดเสร็จ', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const { login } = await import('./helpers/auth.js');
    const STAFF_USER = process.env.TEST_STAFF_USER || 'Kao_9';
    const STAFF_PASS = process.env.TEST_STAFF_PASS || '96409999';
    try { await login(page, STAFF_USER, STAFF_PASS); }
    catch { await ctx.close(); test.skip(); return; }

    // เข้าหน้า receive (มี query หนัก) — ทันทีที่เข้า ควรเห็น header ไม่ใช่หน้าขาว
    await page.getByText('ประวัติการรับยาเข้าคลัง', { exact: true }).first().click();
    // ภายใน 1 วินาที ต้องเห็นอะไรซักอย่าง (header/back button/spinner) — ไม่ใช่ blank
    const hasVisualSignal = await page.locator('button, header, svg, h1, h2').first()
      .isVisible({ timeout: 1_500 }).catch(() => false);
    expect(hasVisualSignal).toBe(true);
    await ctx.close();
  });
});
