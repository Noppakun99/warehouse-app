/**
 * แถบปุ่มล่างจอ + การ์ดแนะนำของผู้เบิก (Dashboard Phase 3 — ข้อตกลง 20/23/27)
 *
 * อ่านอย่างเดียวทั้งไฟล์ — ไม่กดบันทึก/ส่งอะไร (ไม่มี DB ทดสอบแยก)
 * บัญชี `test` = ผู้เบิก หน่วยงาน "ทดลองระบบ" (ไม่มีประวัติเบิก) → เคสจับคู่หน่วยงานได้ใช้วิธีแก้ department
 * ใน sessionStorage แล้ว reload (แอปอ่าน auth จาก sessionStorage — ไม่แตะ DB)
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth.js';

test.use({ viewport: { width: 375, height: 812 } });

const bottomNav = (page) => page.getByRole('navigation', { name: 'เมนูลัด' });

async function setDepartment(page, department) {
  await page.evaluate((d) => {
    const a = JSON.parse(sessionStorage.getItem('wh_auth'));
    sessionStorage.setItem('wh_auth', JSON.stringify({ ...a, department: d }));
  }, department);
  await page.reload();
  await expect(bottomNav(page)).toBeVisible({ timeout: 15_000 });
}

test.describe('แถบปุ่มล่างจอ — ผู้เบิก 375px', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('มี 4 ปุ่ม และซ่อนบนจอคอม', async ({ page }) => {
    const nav = bottomNav(page);
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('button')).toHaveText(['หน้าหลัก', 'คืนยา', 'ประวัติเบิก', 'เมนู']);
    await nav.getByRole('button', { name: 'เมนู' }).click();
    await expect(page.getByRole('button', { name: 'ออกจากระบบ' }).first()).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(nav).toBeHidden();
  });

  test('ประวัติเบิก: ตั้งตัวกรองหน่วยงานตัวเอง (ชื่อ app_users → dispense_logs) และไม่มีการโหลดแบบไม่กรอง', async ({ page }) => {
    await setDepartment(page, 'ER (ฉุกเฉิน)');
    const loads = [];
    page.on('request', (r) => {
      const u = decodeURIComponent(r.url());
      if (r.method() === 'GET' && u.includes('/rest/v1/dispense_logs?select=*') && u.includes('order=dispense_date.desc')) loads.push(u);
    });
    await bottomNav(page).getByRole('button', { name: 'ประวัติเบิก' }).click();
    await expect(page.getByText('บันทึกการเบิกจ่าย (คลังเบิก)')).toBeVisible();
    await expect(page.getByPlaceholder('ทุกหน่วยงาน')).toHaveValue('ER', { timeout: 15_000 });
    await expect.poll(() => loads.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(loads.filter(u => !u.includes('department=eq.ER')), 'มีการโหลดตารางแบบไม่กรองหน่วยงาน').toEqual([]);
  });

  test('ประวัติเบิก: หน่วยงานที่ไม่มีประวัติเบิก → เปิดแบบไม่กรอง · เมนู sidebar ไม่ตั้งตัวกรอง', async ({ page }) => {
    await bottomNav(page).getByRole('button', { name: 'ประวัติเบิก' }).click();
    await expect(page.getByText('บันทึกการเบิกจ่าย (คลังเบิก)')).toBeVisible();
    await expect(page.getByPlaceholder('ทุกหน่วยงาน')).toHaveValue('ทุกหน่วยงาน', { timeout: 15_000 });

    await setDepartment(page, 'ห้องยา G');
    await page.getByRole('button', { name: 'เปิดเมนู' }).click();
    await page.getByRole('button', { name: 'ประวัติเบิกจ่าย', exact: true }).click();
    await expect(page.getByText('บันทึกการเบิกจ่าย (คลังเบิก)')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByPlaceholder('ทุกหน่วยงาน')).toHaveValue('ทุกหน่วยงาน');
  });

  test('หน้าเบิกยาออนไลน์ไม่มีแถบล่าง (มีแถบปุ่มของตัวเอง)', async ({ page }) => {
    await page.getByRole('button', { name: 'เปิดเมนู' }).click();
    await page.getByRole('button', { name: 'เบิกยาออนไลน์', exact: true }).click();
    await expect(page.getByText(/ค้นหายาในคลัง|ใบเบิก/).first()).toBeVisible({ timeout: 10_000 });
    await expect(bottomNav(page)).toBeHidden();
  });

  test('หน้าคืนยา: ปุ่มบันทึกไม่ถูกแถบล่างบัง', async ({ page }) => {
    // จอเตี้ยให้ฟอร์มยาวกว่าจอ → แถบบันทึก (sticky) ต้องติดขอบล่างจริง ไม่งั้นเทสผ่านแม้แถบจมใต้แถบล่าง
    await page.setViewportSize({ width: 375, height: 560 });
    await bottomNav(page).getByRole('button', { name: 'คืนยา' }).click();
    const save = page.getByRole('button', { name: 'บันทึกการคืนยา' });
    await expect(save).toBeVisible({ timeout: 10_000 });
    const s = await save.boundingBox();
    const n = await bottomNav(page).boundingBox();
    expect(s.y + s.height, 'ปุ่มบันทึกจมใต้แถบล่าง').toBeLessThanOrEqual(n.y + 1);
  });

  test('การ์ดแนะนำ: ปุ่มพาไปหน้าถูก · ปิดแล้วไม่กลับมา', async ({ page }) => {
    const card = page.locator('section', { hasText: 'เริ่มต้นใช้งาน' });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByRole('button', { name: 'ค้นหายา' }).click();
    await expect(page.getByPlaceholder(/ค้นหายา/).last()).toBeFocused();
    await page.keyboard.press('Escape');

    await card.getByRole('button', { name: 'ไม่ต้องแสดงอีก' }).click();
    await expect(card).toBeHidden();
    await page.reload();
    await expect(bottomNav(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('ภาพรวมคลัง')).toBeVisible();
    await expect(page.locator('section', { hasText: 'เริ่มต้นใช้งาน' })).toHaveCount(0);
  });
});
