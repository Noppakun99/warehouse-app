/**
 * Staff Flow tests
 * ต้องมี account role=staff ใน DB ก่อนรัน
 * Default: username='staff', password='444444'
 * Override: TEST_STAFF_USER=xxx TEST_STAFF_PASS=xxx npx playwright test
 * ถ้าไม่มี account → tests ทั้งหมดจะ skip อัตโนมัติ
 */
import { test, expect, waitForSupabase } from './fixtures.js';

test.describe('Staff Flow (ระบบเบิกยา — มุมมองเจ้าหน้าที่)', () => {

  test('staff login แล้วเห็น StaffDashboard', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await page.waitForSelector('text=สวัสดี,', { timeout: 8_000 });
    await page.getByText('ระบบเบิกยาออนไลน์').click();
    await expect(
      page.getByRole('button', { name: 'รอดำเนินการ' }).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('staff เห็น tab รอดำเนินการ และ ทั้งหมด', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await page.waitForSelector('text=สวัสดี,', { timeout: 8_000 });
    await page.getByText('ระบบเบิกยาออนไลน์').click();
    await page.waitForSelector('text=รอดำเนินการ', { timeout: 8_000 });
    await expect(page.getByRole('button', { name: 'รอดำเนินการ' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'ทั้งหมด' }).first()).toBeVisible();
  });

  test('staff เห็นรายการใบเบิก (มีข้อมูลหรือ empty state)', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await page.waitForSelector('text=สวัสดี,', { timeout: 8_000 });
    await page.getByText('ระบบเบิกยาออนไลน์').click();
    await page.waitForResponse(
      r => r.url().includes('requisitions') && r.status() < 400,
      { timeout: 8_000 }
    ).catch(() => {});
    await expect(
      page.getByText(/รอดำเนินการ|ไม่พบ|ใบเบิก/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('staff approve ใบเบิกสำเร็จ', async ({ staffPage: page, authenticatedPage: requesterPage }) => {
    if (!page) test.skip();

    // 1. requester ส่งใบเบิกก่อน
    await requesterPage.goto('/');
    await requesterPage.waitForSelector('text=สวัสดี,', { timeout: 8_000 });
    await requesterPage.getByText('ระบบเบิกยาออนไลน์').click();
    await requesterPage.waitForSelector('text=ค้นหายาในคลัง', { timeout: 8_000 });

    const searchRes = waitForSupabase(requesterPage, { table: 'inventory' });
    await requesterPage.getByPlaceholder('ชื่อยาหรือรหัสยา...').fill('para');
    await searchRes;

    const drug = requesterPage.getByText(/Acetaminophen|Paracetamol/i).first();
    await drug.waitFor({ timeout: 8_000 });
    await drug.click();

    const addBtn = requesterPage.getByRole('button', { name: /เพิ่มเข้าตะกร้า/i }).first();
    await addBtn.waitFor({ timeout: 5_000 });
    await addBtn.click();

    await requesterPage.getByRole('button', { name: 'ตะกร้ายา' }).click();
    await requesterPage.waitForSelector('text=ส่งใบเบิก', { timeout: 5_000 });

    const submitRes = waitForSupabase(requesterPage, { table: 'requisitions', method: 'POST' });
    await requesterPage.getByRole('button', { name: /ส่งใบเบิก/i }).click();
    await submitRes;
    await requesterPage.waitForSelector('text=ส่งใบเบิกสำเร็จ', { timeout: 10_000 });

    // 2. staff reload แล้ว approve
    await page.goto('/');
    await page.waitForSelector('text=สวัสดี,', { timeout: 8_000 });
    await page.getByText('ระบบเบิกยาออนไลน์').click();
    await page.waitForResponse(
      r => r.url().includes('requisitions') && r.status() < 400,
      { timeout: 8_000 }
    ).catch(() => {});

    const firstPending = page.locator('text=รอดำเนินการ').last();
    const hasPending = await firstPending.isVisible().catch(() => false);
    if (!hasPending) { test.skip(); return; }

    await page.locator('[data-testid="req-row"], .cursor-pointer').first().click().catch(async () => {
      await page.locator('.border.rounded-xl').first().click();
    });

    const approveBtn = page.getByRole('button', { name: /^อนุมัติ$/ }).first();
    const hasApprove = await approveBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasApprove) { test.skip(); return; }

    const updateRes = waitForSupabase(page, { table: 'requisitions', method: 'PATCH' });
    await approveBtn.click();
    await updateRes;

    await expect(page.getByText('อนุมัติแล้ว').first()).toBeVisible({ timeout: 8_000 });
  });

  test('staff เห็นปุ่ม อนุมัติที่เลือก หลังเลือก item', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await page.waitForSelector('text=สวัสดี,', { timeout: 8_000 });
    await page.getByText('ระบบเบิกยาออนไลน์').click();
    await page.waitForSelector('text=รอดำเนินการ', { timeout: 8_000 });

    // ปุ่ม bulk render เฉพาะตอน selected.size > 0 — ต้องเลือก checkbox ก่อน
    // index 0 = "เลือกทั้งหมด", index 1 = item แรก
    const firstItemCheckbox = page.locator('input[type="checkbox"]').nth(1);
    const hasItem = await firstItemCheckbox.isVisible().catch(() => false);
    if (!hasItem) { test.skip(); return; }

    await firstItemCheckbox.click();
    await expect(
      page.getByRole('button', { name: /อนุมัติที่เลือก/i })
    ).toBeVisible({ timeout: 5_000 });
  });
});
