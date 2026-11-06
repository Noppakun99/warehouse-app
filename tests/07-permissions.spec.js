/**
 * Permissions / Role-based Access tests
 *
 * requester (username='test')  → ไม่เห็น analytics, ไม่เห็น จัดการผู้ใช้
 * staff    (username='staff')  → เห็น analytics, ไม่เห็น จัดการผู้ใช้
 *
 * staff tests: สร้าง account role=staff ก่อนแล้วระบุผ่าน env
 *   TEST_STAFF_USER=staff TEST_STAFF_PASS=444444 npx playwright test
 *   ถ้าไม่มี account → tests จะ skip อัตโนมัติ
 */
import { test, expect, waitForAppShell } from './fixtures.js';
import { dismissStartupPopup } from './helpers/auth.js';

/** รอ Dashboard โหลดหลัง sessionStorage restore */
async function waitForDashboard(page) {
  await waitForAppShell(page);
}

// การ์ดเลือกระบบบน Dashboard ถูกตัดออกแล้ว (commit 2b16aef — ใช้ sidebar แทน)
// → เช็คสิทธิ์ที่ "เมนูใน sidebar" แทน (ชื่อเมนูตาม navConfig ไม่มีคำว่า "ระบบ" นำหน้า)
const menu = (page, name) => page.getByRole('button', { name, exact: true });

// ── requester tests ───────────────────────────────────────────────────────────
test.describe('Permissions — requester', () => {

  // navConfig ให้ 'analytics' กับ requester ด้วย (roles: requester/staff/admin)
  // → requester "เห็น" เมนูวิเคราะห์การเบิก เป็นพฤติกรรมที่ถูกต้องตามคอนฟิกปัจจุบัน
  test('requester เห็นเมนู วิเคราะห์การเบิก (ตาม navConfig)', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await waitForDashboard(page);
    await expect(menu(page, 'วิเคราะห์การเบิก')).toBeVisible({ timeout: 5_000 });
  });

  test('requester ไม่เห็นการ์ด จัดการผู้ใช้งาน', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await waitForDashboard(page);
    await expect(menu(page, 'จัดการผู้ใช้งาน')).not.toBeVisible();
  });

  test('requester เห็นการ์ด ระบบเบิกยาออนไลน์', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await waitForDashboard(page);
    await expect(menu(page, 'เบิกยาออนไลน์')).toBeVisible({ timeout: 5_000 });
  });

  test('requester เห็นการ์ด ระบบคืนยา / ยาเสียหาย', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await waitForDashboard(page);
    await expect(menu(page, 'คืนยา / ยาเสียหาย')).toBeVisible({ timeout: 5_000 });
  });

  // Dashboard ใหม่ (แผน §11.1 ข้อ 16, 21): requester ไม่มีคิวงาน · ภาพรวม 3 ตัวเลขพับไว้ล่างสุด
  // (การ์ด "ใบเบิกรอดำเนินการ" ตัดออกแล้ว — เป็น 0 ตลอด)
  test('requester ไม่มีคิวงาน + ภาพรวมคลังครบ 3 ตัวเลข (กางก่อน)', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await waitForDashboard(page);
    await page.getByRole('button', { name: /ภาพรวมคลัง/ }).click();
    await expect(page.getByText('รายการยาในคลัง')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('ใกล้หมดอายุใน 16 เดือน')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('ต่ำกว่า Safety Stock')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('คิวงานวันนี้')).toHaveCount(0);
  });
});

// ── staff tests (skip ถ้า account ไม่มีใน DB — staffPage fixture จะ use(null)) ──
test.describe('Permissions — staff', () => {

  test('staff เห็นการ์ด วิเคราะห์การเบิกยา', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await waitForDashboard(page);
    await menu(page, 'วิเคราะห์').click(); // staff: อยู่ใต้เมนูแม่ "วิเคราะห์" (ผู้เบิกเห็นข้อเดียว = ไม่มีเมนูแม่)
    await expect(menu(page, 'วิเคราะห์การเบิก')).toBeVisible({ timeout: 5_000 });
  });

  // ต้องใช้ account role=staff จริงเท่านั้น — staffPage ปัจจุบันคือ Kao_9 (admin) ซึ่งเห็นเมนูนี้โดยถูกต้อง
  // ปลดล็อกได้เมื่อมี account staff ที่ login ผ่าน: TEST_STAFF_USER=<staff> TEST_STAFF_PASS=<pass>
  test('staff ไม่เห็นเมนู จัดการผู้ใช้งาน', async ({ staffPage: page }) => {
    test.skip(!process.env.TEST_STAFF_USER, 'ต้องระบุ account role=staff ผ่าน env (default คือ admin)');
    if (!page) test.skip();
    await page.goto('/');
    await waitForDashboard(page);
    // admin เห็นเมนูแม่ "ตั้งค่าและดูแลระบบ" (กางแล้วมีจัดการผู้ใช้งาน) · staff เห็นแค่ Audit Log ข้อเดียว (ไม่มีเมนูแม่)
    const sys = menu(page, 'ตั้งค่าและดูแลระบบ');
    if (await sys.isVisible().catch(() => false)) await sys.click();
    await expect(menu(page, 'จัดการผู้ใช้งาน')).not.toBeVisible();
  });

  test('staff เข้าหน้า วิเคราะห์การเบิกยา ได้', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await waitForDashboard(page);
    await menu(page, 'วิเคราะห์').click();
    await menu(page, 'วิเคราะห์การเบิก').click();
    await expect(
      page.getByText(/วิเคราะห์|ช่วงเวลา|แนวโน้ม/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  // จอคอม (Desktop Chrome ≥ lg): คิวงาน + ภาพรวมกางเสมอ
  test('staff เห็นคิวงานวันนี้ + ภาพรวมคลังครบ 3 ตัวเลข', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await waitForDashboard(page);
    await expect(page.getByText('คิวงานวันนี้')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('รายการยาในคลัง')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('ใกล้หมดอายุใน 16 เดือน')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('ต่ำกว่า Safety Stock')).toBeVisible({ timeout: 5_000 });
  });

  // อ่านอย่างเดียว — เปิดโมดอล สลับแท็บ/ช่วงวัน คัดลอกลง clipboard
  // ⛔ ห้ามกด "บันทึก" ในฟอร์มทะเบียน หรือ "ลบมติ" — เขียนตาราง formulary_change บน prod
  // จอเตี้ย 1072×456 = จอที่ user ส่งรูปมา 06/11/2569 (แท็บถูกบีบหายใต้ส่วนเลื่อน)
  for (const [label, viewport] of [['คอม', { width: 1280, height: 800 }], ['คอมจอเตี้ย', { width: 1072, height: 456 }], ['มือถือ 375px', { width: 375, height: 667 }]]) {
    test(`staff เปิดยาเข้าใหม่/ตัดออกจากคิวงาน ตัวเลขตรงแท็บ และไม่ล้นจอ (${label})`, async ({ staffPage: page }) => {
      if (!page) test.skip();
      await page.setViewportSize(viewport);
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/');
      await waitForDashboard(page);
      const row = page.getByRole('button', { name: /ยาเข้าใหม่ \/ ตัดออกจากบัญชี/ });
      // popup คืนบริษัท/ยาหมดอายุเด้งวันละครั้งต่อเครื่อง — browser ใหม่ทุกเทสจึงเด้งเสมอ
      await row.waitFor({ state: 'visible', timeout: 30_000 });
      await dismissStartupPopup(page);
      await expect(row).toBeVisible({ timeout: 30_000 });
      const rowText = await row.innerText();
      const queueNew = Number(rowText.match(/เข้าใหม่ ([\d,]+) รายการ/)[1].replace(/,/g, ''));
      const queueOut = Number(rowText.match(/ตัดออกที่ต้องดู ([\d,]+)/)[1].replace(/,/g, ''));
      await row.click();

      const dialog = page.getByRole('dialog', { name: 'ยาเข้าใหม่ / ตัดออกจากบัญชี' });
      const tabNum = async (name) => Number((await dialog.getByRole('tab', { name: new RegExp(name) }).innerText()).match(/\(([\d,]+)\)/)[1].replace(/,/g, ''));
      await expect(dialog.getByRole('tab', { name: /ยาเข้าใหม่/ })).toHaveAttribute('aria-selected', 'true');
      expect(await tabNum('ยาเข้าใหม่')).toBe(queueNew);       // Rule #6: ตัวเลขในคิว = แท็บ
      expect(await tabNum('ตัดออกจากบัญชี')).toBe(queueOut);

      // ไม่ล้นจอแนวนอน (Rule #5) — ทั้งหน้าและตารางในโมดอล
      const noOverflow = async () => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
        expect(await dialog.locator('.overflow-y-auto').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      };
      await noOverflow();
      // แถบแท็บต้องไม่ถูกบีบ (กล่อง overflow-x ของแท็บสูงไม่น้อยกว่าเนื้อในของมัน)
      const tabBar = dialog.getByRole('tablist').locator('xpath=..');
      expect(await tabBar.evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/formulary-new-${viewport.width}x${viewport.height}.png` });

      // มติ PTC ไม่เป็นคอลัมน์ — กด ▸ ที่ชื่อยาแล้วกางใต้แถว (user เลือก 06/11/2569) · คอลัมน์บริษัท/ราคามีทั้งตารางและการ์ด
      await expect(dialog.getByText('บริษัท', { exact: true }).locator('visible=true').first()).toBeVisible();
      await expect(dialog.getByText('ราคา/หน่วย', { exact: true }).locator('visible=true').first()).toBeVisible();
      const toggle = dialog.locator('button[aria-expanded]').locator('visible=true').first();
      if (await toggle.count()) {
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect(dialog.getByText(/^(มติ PTC|ไม่มีมติในทะเบียน PTC)$/).locator('visible=true').first()).toBeVisible();
        await noOverflow();
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      }

      // 90 วัน ต้องไม่น้อยกว่า 30 วัน
      await dialog.getByRole('button', { name: '90 วัน' }).click();
      expect(await tabNum('ยาเข้าใหม่')).toBeGreaterThanOrEqual(queueNew);

      const copyBtn = dialog.getByRole('button', { name: /คัดลอกข้อความไลน์/ });
      if (await copyBtn.isEnabled()) {
        await copyBtn.click();
        await expect(dialog.getByRole('button', { name: 'คัดลอกแล้ว' })).toBeVisible();
        const text = await page.evaluate(() => navigator.clipboard.readText());
        expect(text).toMatch(/^แจ้งจากคลังยา :\r?\n/);   // clipboard ของ Windows แปลง \n เป็น \r\n
      }

      await dialog.getByRole('tab', { name: /ตัดออกจากบัญชี/ }).click();
      const heading = dialog.getByRole('heading');
      expect(Number((await heading.innerText()).match(/\(([\d,]+)\)/)[1].replace(/,/g, ''))).toBe(queueOut);
      await noOverflow();
      await page.screenshot({ path: `test-results/formulary-out-${viewport.width}.png` });

      // ทะเบียน — เปิดฟอร์มเพิ่มแล้วยกเลิก (ไม่บันทึก)
      await dialog.getByRole('tab', { name: /ทะเบียนมติ PTC/ }).click();
      expect(await tabNum('ทะเบียนมติ PTC')).toBeGreaterThanOrEqual(17);
      await dialog.getByRole('button', { name: /เพิ่มมติ/ }).click();
      await expect(dialog.getByLabel('วันที่ประชุม PTC')).toBeAttached();
      await noOverflow();
      await page.screenshot({ path: `test-results/formulary-ptc-${viewport.width}.png` });
      await dialog.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
      await expect(dialog.getByRole('button', { name: /เพิ่มมติ/ })).toBeVisible();

      await dialog.getByRole('button', { name: 'ปิด', exact: true }).first().click();
      await expect(dialog).toHaveCount(0);
    });
  }
});
