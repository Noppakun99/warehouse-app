/**
 * Login / Logout tests
 * ใช้ page fixture ปกติ (ไม่ต้อง login ก่อน) เพราะทดสอบ login flow เอง
 */
import { test, expect } from '@playwright/test';

test.describe('Login / Logout', () => {
  test('แสดงหน้า login เมื่อเปิดแอป', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder('กรอกชื่อผู้ใช้')).toBeVisible();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
  });

  test('login สำเร็จด้วย user ที่ถูกต้อง', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('กรอกชื่อผู้ใช้').fill('test');
    await page.getByPlaceholder('รหัสผ่าน').fill('444444');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    await expect(page.getByText('สวัสดี,')).toBeVisible({ timeout: 10_000 });
  });

  test('login ล้มเหลวถ้า password ผิด', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('กรอกชื่อผู้ใช้').fill('test');
    await page.getByPlaceholder('รหัสผ่าน').fill('wrongpassword');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    // ยังอยู่หน้า login และ Dashboard ไม่แสดง
    await expect(page.getByPlaceholder('กรอกชื่อผู้ใช้')).toBeVisible();
    await expect(page.getByText('สวัสดี,')).not.toBeVisible();
  });

  test('logout กลับหน้า login', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('กรอกชื่อผู้ใช้').fill('test');
    await page.getByPlaceholder('รหัสผ่าน').fill('444444');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    await page.waitForSelector('text=สวัสดี,', { timeout: 10_000 });
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByPlaceholder('กรอกชื่อผู้ใช้')).toBeVisible({ timeout: 5_000 });
  });
});
