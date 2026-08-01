/**
 * Login / Logout tests
 * ใช้ page fixture ปกติ (ไม่ต้อง login ก่อน) เพราะทดสอบ login flow เอง
 */
import { test, expect } from '@playwright/test';
import { waitForAppShell } from './helpers/auth.js';

// landmark ที่บอกว่า login สำเร็จ = ปุ่ม "หน้าหลัก" ใน sidebar (แทนข้อความ "สวัสดี," ที่ถูกแทนด้วยหัวข้อ "Dashboard")
const shellMark = (page) => page.getByRole('button', { name: 'หน้าหลัก' }).first();

test.describe('Login / Logout', () => {
  test('แสดงหน้า login เมื่อเปิดแอป', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder('กรอกชื่อผู้ใช้')).toBeVisible();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
  });

  test('login สำเร็จด้วย user ที่ถูกต้อง', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('กรอกชื่อผู้ใช้').fill('test');
    await page.getByPlaceholder('รหัสผ่าน').fill('111111');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    await expect(shellMark(page)).toBeVisible({ timeout: 10_000 });
  });

  test('login ล้มเหลวถ้า password ผิด', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('กรอกชื่อผู้ใช้').fill('test');
    await page.getByPlaceholder('รหัสผ่าน').fill('wrongpassword');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    // ยังอยู่หน้า login และ Dashboard ไม่แสดง
    await expect(page.getByPlaceholder('กรอกชื่อผู้ใช้')).toBeVisible();
    await expect(shellMark(page)).not.toBeVisible();
  });

  test('logout กลับหน้า login', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('กรอกชื่อผู้ใช้').fill('test');
    await page.getByPlaceholder('รหัสผ่าน').fill('111111');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    await waitForAppShell(page);
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByPlaceholder('กรอกชื่อผู้ใช้')).toBeVisible({ timeout: 5_000 });
  });
});
