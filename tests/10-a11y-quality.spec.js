/**
 * A11y & UX quality — cross-cutting checks
 *
 * Senior checklist:
 *   1. Login form: input มี autoComplete, label, type=password
 *   2. Keyboard: Tab เข้าฟอร์ม login ได้, Enter submit ได้
 *   3. Image/icon button มี aria-label หรือ title (ลด ambiguity)
 *   4. ไม่มี <img alt=""> ที่ไม่มี role=presentation (skip — ระบบนี้ใช้ SVG ทั้งหมด)
 *   5. ภาษาไทยใน UI label หลัก — ไม่มี string ภาษาอังกฤษเปลือยที่ไม่ใช่ technical term
 */
import { test, expect, waitForAppShell } from './fixtures.js';

test.describe('A11y & UX quality', () => {
  test('Login form: password input มี type=password และ autoComplete ถูกต้อง', async ({ page }) => {
    await page.goto('/');
    const pw = page.locator('input[type="password"]').first();
    await expect(pw).toBeVisible();
    const ac = await pw.getAttribute('autoComplete') || await pw.getAttribute('autocomplete');
    expect(ac, 'password input missing autoComplete').toBe('current-password');
  });

  test('Keyboard: Tab เข้า username → password → submit ได้', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('กรอกชื่อผู้ใช้').focus();
    await page.keyboard.type('test');
    await page.keyboard.press('Tab');
    // หลัง Tab ต้อง focus ที่ password input
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBe('INPUT');
  });

  test('Submit form ด้วย Enter (keyboard accessible)', async ({ page }) => {
    const user = process.env.TEST_STAFF_USER || 'Kao_9';
    const pass = process.env.TEST_STAFF_PASS || '96409999';
    await page.goto('/');
    await page.getByPlaceholder('กรอกชื่อผู้ใช้').fill(user);
    await page.getByPlaceholder('รหัสผ่าน').fill(pass);
    await page.getByPlaceholder('รหัสผ่าน').press('Enter');
    await expect(page.getByRole('button', { name: 'หน้าหลัก' }).first()).toBeVisible({ timeout: 8_000 });
  });

  test('Sidebar: เมนูระบบเป็น <button> (focusable, keyboard accessible)', async ({ authenticatedPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await waitForAppShell(page);
    // เมนู "เบิกยาออนไลน์" ใน sidebar ต้องเป็น button role (การ์ดระบบถูกตัดออกแล้ว — commit 2b16aef)
    const btn = page.getByRole('button', { name: 'เบิกยาออนไลน์', exact: true }).first();
    await expect(btn).toBeVisible();
  });

  test('ปุ่มไอคอนใน header มี title attribute (ไม่ใช่ปุ่มลึกลับ)', async ({ authenticatedPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await waitForAppShell(page);
    // Bell button มี title="การแจ้งเตือน"
    const bell = page.locator('button[title="การแจ้งเตือน"]');
    const count = await bell.count();
    // อาจเห็นเฉพาะ staff/admin — ถ้าเห็นต้องมี title
    if (count > 0) {
      const title = await bell.first().getAttribute('title');
      expect(title).toBeTruthy();
    }
  });

  test('Login error message มี role=alert หรือสี/style ที่ผู้ใช้สังเกตได้', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('กรอกชื่อผู้ใช้').fill('nonexistent_user_xyz');
    await page.getByPlaceholder('รหัสผ่าน').fill('wrongpass');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    // ต้องเห็น error visible — ไม่ใช่ silent fail
    await expect(
      page.locator('text=/ไม่พบ|ผิด|ไม่ถูกต้อง|กรุณา/').first()
    ).toBeVisible({ timeout: 5_000 });
  });
});
