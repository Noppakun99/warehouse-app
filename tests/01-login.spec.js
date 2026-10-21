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

// จดจำชื่อผู้ใช้ต่อเครื่อง (localStorage) — ไม่จำการ login: ออกจากระบบแล้วต้องกรอกรหัสผ่านใหม่
test.describe('จดจำชื่อผู้ใช้', () => {
  const loginThenLogout = async (page) => {
    await page.getByPlaceholder('รหัสผ่าน').fill('111111');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    await waitForAppShell(page);
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByPlaceholder('กรอกชื่อผู้ใช้')).toBeVisible({ timeout: 5_000 });
  };

  test('ติ๊กไว้เป็นค่าเริ่มต้น → ออกจากระบบแล้วชื่อยังอยู่ รหัสผ่านว่าง', async ({ page }) => {
    await page.goto('/');
    const remember = page.getByLabel('จดจำชื่อผู้ใช้ในเครื่องนี้');
    await expect(remember).toBeChecked();
    await page.getByPlaceholder('กรอกชื่อผู้ใช้').fill('test');
    await loginThenLogout(page);
    await page.reload();
    await expect(page.getByPlaceholder('กรอกชื่อผู้ใช้')).toHaveValue('test');
    await expect(page.getByPlaceholder('รหัสผ่าน')).toHaveValue('');
    await expect(remember).toBeChecked();
    // ไม่จำการ login — reload แล้วยังอยู่หน้า login
    await expect(shellMark(page)).not.toBeVisible();
  });

  test('เอาติ๊กออก → ไม่จำชื่อ และจำว่าเลือกไม่จดจำ', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('กรอกชื่อผู้ใช้').fill('test');
    await page.getByLabel('จดจำชื่อผู้ใช้ในเครื่องนี้').uncheck();
    await loginThenLogout(page);
    await page.reload();
    await expect(page.getByPlaceholder('กรอกชื่อผู้ใช้')).toHaveValue('');
    await expect(page.getByLabel('จดจำชื่อผู้ใช้ในเครื่องนี้')).not.toBeChecked();
  });

  test('มือถือ 375px — ช่องติ๊กแสดงครบ ไม่ล้นจอแนวนอน', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto('/');
    await expect(page.getByLabel('จดจำชื่อผู้ใช้ในเครื่องนี้')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
