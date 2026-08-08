/**
 * Dashboard tests
 * ใช้ authenticatedPage (worker scope) → login ครั้งเดียว ทุก test reuse
 */
import { test, expect } from './fixtures.js';
import { dismissStartupPopup } from './helpers/auth.js';

// การ์ดเลือกระบบถูกตัดออกจาก Dashboard แล้ว (commit 2b16aef — ใช้ sidebar แทน)
// → เข้าระบบย่อยผ่านเมนู sidebar (ชื่อตาม navConfig ไม่มีคำว่า "ระบบ" นำหน้า)
const menu = (page, name) => page.getByRole('button', { name, exact: true });

test.describe('Dashboard', () => {
  test('เห็นเมนูระบบใน sidebar หลังล็อกอิน', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await dismissStartupPopup(page);
    await expect(menu(page, 'เบิกยาออนไลน์')).toBeVisible({ timeout: 8_000 });
    await expect(menu(page, 'คืนยา / ยาเสียหาย')).toBeVisible();
  });

  test('StatsStrip แสดงตัวเลขรายการยาในคลัง', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await dismissStartupPopup(page);
    await expect(page.getByText('รายการยาในคลัง')).toBeVisible({ timeout: 8_000 });
  });

  test('คลิกเมนูเบิกยาไปหน้าเบิกยาได้', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await dismissStartupPopup(page);
    await menu(page, 'เบิกยาออนไลน์').click();
    await expect(page.getByText('ค้นหายาในคลัง')).toBeVisible({ timeout: 8_000 });
  });

  test('คลิกเมนูคืนยาไปหน้าคืนยาได้', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await dismissStartupPopup(page);
    await menu(page, 'คืนยา / ยาเสียหาย').click();
    await expect(page.getByText('ระบบคืนยา / บันทึกยาเสียหาย')).toBeVisible({ timeout: 8_000 });
  });

  test('ปุ่มย้อนกลับจากระบบย่อยกลับ Dashboard ได้', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await dismissStartupPopup(page);
    await menu(page, 'คืนยา / ยาเสียหาย').click();
    await page.waitForSelector('text=บันทึกรายการ', { timeout: 8_000 });
    await page.getByRole('button').filter({ has: page.locator('svg') }).first().click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 5_000 });
  });
});
