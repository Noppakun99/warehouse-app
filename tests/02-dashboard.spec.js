/**
 * Dashboard tests
 * ใช้ authenticatedPage (worker scope) → login ครั้งเดียว ทุก test reuse
 */
import { test, expect } from './fixtures.js';

test.describe('Dashboard', () => {
  test('เห็นการ์ดระบบหลังล็อกอิน', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await expect(page.getByText('ระบบเบิกยาออนไลน์')).toBeVisible();
    await expect(page.getByText('ระบบคืนยา / ยาเสียหาย')).toBeVisible();
  });

  test('StatsStrip แสดงตัวเลขรายการยาในคลัง', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await expect(page.getByText('รายการยาในคลัง')).toBeVisible({ timeout: 8_000 });
  });

  test('คลิกการ์ดเบิกยาไปหน้าเบิกยาได้', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await page.getByText('ระบบเบิกยาออนไลน์').click();
    await expect(page.getByText('ค้นหายาในคลัง')).toBeVisible({ timeout: 8_000 });
  });

  test('คลิกการ์ดคืนยาไปหน้าคืนยาได้', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await page.getByText('ระบบคืนยา / ยาเสียหาย').click();
    await expect(page.getByText('ระบบคืนยา / บันทึกยาเสียหาย')).toBeVisible({ timeout: 8_000 });
  });

  test('ปุ่มย้อนกลับจากระบบย่อยกลับ Dashboard ได้', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await page.getByText('ระบบคืนยา / ยาเสียหาย').click();
    await page.waitForSelector('text=บันทึกรายการ', { timeout: 8_000 });
    await page.getByRole('button').filter({ has: page.locator('svg') }).first().click();
    await expect(page.getByText('สวัสดี,')).toBeVisible({ timeout: 5_000 });
  });
});
