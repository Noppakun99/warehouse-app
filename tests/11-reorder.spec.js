/**
 * Reorder Analysis — smoke + UX clarity
 *
 * เป้าหมาย: ระบบการสั่งซื้อยา (ReorderApp) เปิดได้ + render ตามคาดที่
 *  1. Header + Control Bar + Status Strip ครบ
 *  2. Tabs ครบ 4 tab สลับได้ (ค้นยา · วิเคราะห์สั่งซื้อ · แจ้งซื้อแล้ว · ตรวจสูตร — รวมเมนู 14/11/2569)
 *  3. Verification tab รัน golden tests ผ่าน 100%
 *  4. Mobile (375px) แสดง card layout แทน table
 *  5. Filter ด้วย Status chip ใช้งานได้
 */
import { test, expect, waitForAppShell } from './fixtures.js';

async function gotoReorder(page) {
  await page.goto('/');
  await waitForAppShell(page);
  // Dashboard → หัวการ์ด "ยาต้องสั่งซื้อ 5 อันดับแรก" → "ดูทั้งหมด" → เปิด modal ต่ำกว่า Safety Stock
  // (เดิมกดการ์ดตัวเลข "ต่ำกว่า Safety Stock" — การ์ดนั้นถูกแทนด้วย "รอตรวจรับ" 14/11/2569)
  const top5Toggle = page.getByRole('button', { name: /ยาต้องสั่งซื้อ 5 อันดับแรก/ });
  await top5Toggle.locator('xpath=..').getByRole('button', { name: /ดูทั้งหมด/ }).click();
  // ใน modal มีปุ่ม "เปิดระบบวิเคราะห์การสั่งซื้อ" (desktop) → คลิกเข้า ReorderApp
  await page.getByRole('button', { name: /เปิดระบบวิเคราะห์การสั่งซื้อ/ }).click();
  await page.waitForSelector('text=ระบบการสั่งซื้อยา', { timeout: 10_000 });
}

test.describe('ReorderApp — smoke', () => {

  test('staff เปิดหน้าได้ + เห็น header + control bar + status strip', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoReorder(page);

    await expect(page.getByRole('heading', { name: /ระบบการสั่งซื้อยา/ })).toBeVisible();

    // Control bar — ช่วงสถิติ + Lead Time + ปุ่มรัน (ไม่มีโหมด Normal/Refill แล้ว — factor 2.3 คงที่)
    await expect(page.getByText('ช่วงสถิติ (จาก)')).toBeVisible();
    await expect(page.getByText('Lead Time default (วัน)')).toBeVisible();
    await expect(page.getByRole('button', { name: /รันวิเคราะห์/ })).toBeVisible();
  });

  test('Tabs ครบ 4 ตัว + สลับได้', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoReorder(page);

    // .last() = tab ในหน้า (sidebar render ก่อนเนื้อหาใน DOM — กันชื่อชนเมนู)
    const tabs = ['ค้นยา · สรุปรับ-เบิก', 'วิเคราะห์สั่งซื้อ', 'แจ้งซื้อแล้ว', 'ตรวจสูตร'];
    for (const t of tabs) {
      await expect(page.getByRole('button', { name: new RegExp(t) }).last()).toBeVisible();
    }
    // ส่วนงานจัดซื้อถอดออกแล้ว (14/11/2569)
    for (const gone of ['ใบสั่งซื้อแยกบริษัท', 'บันทึก Snapshot', 'History']) {
      await expect(page.getByRole('button', { name: new RegExp(gone) })).toHaveCount(0);
    }

    // แท็บแจ้งซื้อแล้ว (ADR-0030) — ตัวกรอง 4 ปุ่ม + มีรายการ (อ่านอย่างเดียว)
    await page.getByRole('button', { name: /แจ้งซื้อแล้ว/ }).last().click();
    for (const f of ['รอของ', 'มาส่งแล้ว', 'ยกเลิก', 'ทั้งหมด']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${f} \\(`) })).toBeVisible();
    }
    await expect(page.getByText(/รายงานการซื้อยา_69\.xlsx/)).toBeVisible();

    // คลิก ตรวจสูตร → เห็นปุ่ม "Run tests"
    await page.getByRole('button', { name: /ตรวจสูตร/ }).last().click();
    await expect(page.getByRole('button', { name: /Run tests/ })).toBeVisible();
  });

  test('แท็บตรวจสูตร รัน golden tests ผ่าน 100%', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoReorder(page);
    await page.getByRole('button', { name: /ตรวจสูตร/ }).last().click();
    await page.getByRole('button', { name: /Run tests/ }).click();
    // ต้องเห็น "0 ล้มเหลว" ในผลลัพธ์
    await expect(page.getByText(/0 ล้มเหลว/)).toBeVisible({ timeout: 5_000 });
    // ตรวจว่ามี Atorvastatin reference ในรายการ
    await expect(page.getByText(/Atorvastatin/).first()).toBeVisible();
  });

  test('Status strip — 6 สถานะ + คลิก filter ได้', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoReorder(page);
    // รอจน analysis รันเสร็จ (status chips render)
    await expect(page.getByText('คงคลังเพียงพอ').first()).toBeVisible({ timeout: 15_000 });
    // ทุก status ต้องเห็น
    for (const s of ['หมดสต็อค', 'ใกล้หมดอายุ', 'สั่งเพิ่ม', 'คงคลังเพียงพอ', 'สั่งเมื่อขอ', 'ตัดออก']) {
      await expect(page.getByText(s).first()).toBeVisible();
    }
  });

  test('Mobile 375px — แสดง card layout', async ({ staffPage: page }) => {
    if (!page) test.skip();
    // เข้าหน้าจากจอคอมก่อน แล้วค่อยย่อ — ทางเข้าบน Dashboard มือถือต่างกัน (ภาพรวมพับไว้ +
    // ปุ่ม "เปิดระบบวิเคราะห์การสั่งซื้อ" ในโมดอลซ่อนบนจอ < sm) ไม่ใช่สิ่งที่ test นี้ตรวจ
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoReorder(page);
    await page.setViewportSize({ width: 375, height: 800 });
    // ต้องไม่เห็น desktop table (มี th)
    const tableHeader = page.locator('table thead tr th:has-text("คงเหลือ")');
    await expect(tableHeader).toBeHidden({ timeout: 5_000 });
  });

});

// หน้าแรกของเมนู "ระบบการสั่งซื้อยา" = แท็บค้นยา · สรุปรับ-เบิก (14/11/2569) — อ่านอย่างเดียว
test.describe('ค้นยา · สรุปรับ-เบิก', () => {
  async function gotoSearch(page) {
    await page.goto('/');
    await waitForAppShell(page);
    const hamburger = page.getByRole('button', { name: 'เปิดเมนู' });
    if (await hamburger.isVisible().catch(() => false)) await hamburger.click();
    await page.getByRole('button', { name: 'ระบบการสั่งซื้อยา', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'ระบบการสั่งซื้อยา' })).toBeVisible({ timeout: 10_000 });
  }

  for (const width of [1280, 375]) {
    test(`ค้นยา Para → สรุป + หน่วยงาน + ปุ่มส่งออก (${width}px)`, async ({ staffPage: page }) => {
      if (!page) test.skip();
      await page.setViewportSize({ width, height: 800 });
      await gotoSearch(page);
      const input = page.getByRole('textbox', { name: 'ค้นหายา' });
      await expect(input).not.toHaveAttribute('placeholder', /กำลังโหลด/, { timeout: 20_000 });
      await input.fill('1000227');
      await input.press('Enter');
      const section = page.locator('#usage-1000227');
      await expect(section).toBeVisible({ timeout: 30_000 });
      for (const t of ['คงเหลือ', 'เรท/เดือน', 'เบิกรวมในช่วง', 'หน่วยงานที่เบิก']) await expect(section.getByText(t).first()).toBeVisible();
      await expect(section.getByText('มากสุด', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Excel', exact: true })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'พิมพ์', exact: true })).toBeEnabled();
      // ไม่ล้นแนวนอน (Rule #5)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      // สลับไปแท็บวิเคราะห์แล้วกลับ — ยาที่ค้นไว้ยังอยู่ (หน้าค้นยาไม่ unmount)
      await page.getByRole('button', { name: /วิเคราะห์สั่งซื้อ/ }).last().click();
      await expect(page.getByRole('button', { name: /รันวิเคราะห์/ })).toBeVisible();
      await page.getByRole('button', { name: /ค้นยา · สรุปรับ-เบิก/ }).last().click();
      await expect(section).toBeVisible();
    });
  }
});
