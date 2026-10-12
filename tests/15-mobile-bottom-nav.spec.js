/**
 * แถบปุ่มล่างจอ + การ์ดแนะนำของผู้เบิก (Dashboard Phase 3 — ข้อตกลง 20/23/27)
 *
 * อ่านอย่างเดียวทั้งไฟล์ — ไม่กดบันทึก/ส่งอะไร (ไม่มี DB ทดสอบแยก)
 * บัญชี `test` = ผู้เบิก หน่วยงาน "ห้องยา G" — เคสหน่วยงานอื่นใช้วิธีแก้ department ใน sessionStorage แล้ว reload
 * (แอปอ่าน auth จาก sessionStorage — ไม่แตะ DB)
 * ⚠️ ช่องกรองหน่วยงานโชว์ "ทุกหน่วยงาน" ชั่วครู่ก่อนตั้งค่าเสร็จ → ตรวจค่าหลังตารางโหลดเสร็จ (`openDispense`) เท่านั้น
 *    ไม่งั้นเทส "ไม่กรอง" ผ่านหลอกจากจังหวะนั้น (เคยเกิด 11/10/2569)
 */
import { test, expect } from '@playwright/test';
import { login, dismissStartupPopup } from './helpers/auth.js';

test.use({ viewport: { width: 375, height: 812 } });

const bottomNav = (page) => page.getByRole('navigation', { name: 'เมนูลัด' });
// มือถือ: ตัวกรองรองอยู่ใน bottom sheet (FilterSheet) — หน้าเห็นแค่บรรทัด "กรอง: …" + ปุ่ม "ตัวกรอง (N)"
const filterSummary = (page) => page.getByText(/^กรอง: /);
const filterBtn = (page) => page.getByRole('button', { name: /^ตัวกรอง/ });

async function setDepartment(page, department) {
  await page.evaluate((d) => {
    const a = JSON.parse(sessionStorage.getItem('wh_auth'));
    sessionStorage.setItem('wh_auth', JSON.stringify({ ...a, department: d }));
  }, department);
  await page.reload();
  await expect(bottomNav(page).getByRole('button', { name: 'หน้าหลัก' })).toHaveAttribute('aria-current', 'page', { timeout: 15_000 });
}

// เปิดหน้าประวัติเบิกแล้วรอตารางหลักโหลดเสร็จ (request ที่ตัวกรองถูกตั้งแล้ว) ก่อนให้ตรวจค่า
const isMainLoad = (r) => { const u = decodeURIComponent(r.url()); return u.includes('/rest/v1/dispense_logs?select=*') && u.includes('order=dispense_date.desc'); };
async function openDispense(page, click) {
  const done = page.waitForResponse(isMainLoad, { timeout: 30_000 });
  await click();
  await done;
  await expect(page.getByText('บันทึกการเบิกจ่าย (คลังเบิก)')).toBeVisible();
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
    await expect(filterSummary(page)).toHaveText('กรอง: ER', { timeout: 30_000 });
    await expect(filterBtn(page)).toHaveAccessibleName('ตัวกรอง (1)');
    await expect.poll(() => loads.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(loads.filter(u => !u.includes('department=eq.ER')), 'มีการโหลดตารางแบบไม่กรองหน่วยงาน').toEqual([]);
  });

  test('ประวัติเบิก: หน่วยงานที่ไม่มีประวัติเบิก → เปิดแบบไม่กรอง · เมนู sidebar ไม่ตั้งตัวกรอง', async ({ page }) => {
    // บัญชี test (ห้องยา G) ปุ่มแถบล่าง → ห้องยาG
    await openDispense(page, () => bottomNav(page).getByRole('button', { name: 'ประวัติเบิก' }).click());
    await expect(filterSummary(page)).toHaveText('กรอง: ห้องยาG');
    // จากหน้าที่กรองอยู่ ไปเมนู sidebar → ต้องไม่พาตัวกรองติดไปด้วย
    await openDispense(page, async () => {
      await page.getByRole('button', { name: 'เปิดเมนู' }).click();
      await page.getByRole('button', { name: 'ประวัติเบิกจ่าย', exact: true }).click();
    });
    await expect(filterSummary(page)).toHaveCount(0);
    await expect(filterBtn(page)).toHaveAccessibleName('ตัวกรอง');
    // หน่วยงานที่ไม่มีประวัติเบิก → ไม่กรอง
    await setDepartment(page, 'ทดลองระบบ');
    await openDispense(page, () => bottomNav(page).getByRole('button', { name: 'ประวัติเบิก' }).click());
    await expect(filterSummary(page)).toHaveCount(0);
  });

  test('ตัวกรองบนมือถือ (bottom sheet): เลือกหน่วยงาน → ตารางกรองตาม · ล้างได้ · จอคอมยังเป็นแถวเดิม', async ({ page }) => {
    await openDispense(page, async () => {
      await page.getByRole('button', { name: 'เปิดเมนู' }).click();
      await page.getByRole('button', { name: 'ประวัติเบิกจ่าย', exact: true }).click();
    });
    await expect(page.getByPlaceholder('ทุกหน่วยงาน')).toHaveCount(0);   // ช่องหน่วยงานไม่ค้างบนจอ
    await filterBtn(page).click();
    const sheet = page.getByRole('dialog', { name: 'ตัวกรอง' });
    await expect(sheet).toBeVisible();
    await sheet.getByPlaceholder('ทุกหน่วยงาน').click();
    const filtered = page.waitForResponse(r => decodeURIComponent(r.url()).includes('dispense_logs?select=*') && decodeURIComponent(r.url()).includes('department=eq.ER'), { timeout: 30_000 });
    await sheet.getByText('ER', { exact: true }).click();
    await filtered;
    await sheet.getByRole('button', { name: 'ดูผลลัพธ์' }).click();
    await expect(sheet).toBeHidden();
    await expect(filterSummary(page)).toHaveText('กรอง: ER');
    await expect(filterBtn(page)).toHaveAccessibleName('ตัวกรอง (1)');
    // แผงอยู่เหนือแถบล่าง (z) — ปุ่มล้างกดได้จริง
    await filterBtn(page).click();
    await sheet.getByRole('button', { name: 'ล้างตัวกรอง' }).click();
    await sheet.getByRole('button', { name: 'ดูผลลัพธ์' }).click();
    await expect(filterSummary(page)).toHaveCount(0);
    // จอคอม: ไม่มีปุ่มตัวกรอง ช่องหน่วยงานอยู่ในแถวเดิม
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(filterBtn(page)).toHaveCount(0);
    await expect(page.getByPlaceholder('ทุกหน่วยงาน')).toBeVisible();
  });

  test('ประวัติรับยาบนมือถือ: ตัวกรองบริษัท/ชนิดยา/วันที่อยู่ใน bottom sheet', async ({ page }) => {
    await page.getByRole('button', { name: 'เปิดเมนู' }).click();
    // ผู้เบิกเห็น "ประวัติรับยา" ข้อเดียว · staff อยู่ใต้เมนูแม่ "รับยา" (navConfig จัดใหม่ 11/10/2569)
    const leaf = page.getByRole('button', { name: 'ประวัติรับยา', exact: true });
    if (!(await leaf.isVisible().catch(() => false))) await page.getByRole('button', { name: 'รับยา', exact: true }).click();
    await leaf.click();
    await expect(page.getByText('บันทึกการรับเข้าคลัง').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder('ค้นหาบริษัท...')).toHaveCount(0);
    await filterBtn(page).click();
    const sheet = page.getByRole('dialog', { name: 'ตัวกรอง' });
    await expect(sheet.getByPlaceholder('ค้นหาบริษัท...')).toBeVisible();
    await expect(sheet.getByPlaceholder('ทุกชนิดยา')).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box.width).toBeLessThanOrEqual(375);
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

  test('ปุ่มย้อนของมือถือ/เบราว์เซอร์ = กลับหน้าก่อนในแอป (ไม่ออกจากแอป)', async ({ page }) => {
    const active = () => bottomNav(page).locator('[aria-current="page"]');
    await bottomNav(page).getByRole('button', { name: 'คืนยา' }).click();
    await expect(active()).toHaveText('คืนยา');
    await bottomNav(page).getByRole('button', { name: 'ประวัติเบิก' }).click();
    await expect(active()).toHaveText('ประวัติเบิก');
    await page.goBack();
    await expect(active()).toHaveText('คืนยา');
    await page.goBack();
    await expect(active()).toHaveText('หน้าหลัก');
    // ปุ่มย้อนบน header ของแอป (BackButton) ใช้ history ชุดเดียวกัน
    await bottomNav(page).getByRole('button', { name: 'คืนยา' }).click();
    await page.getByRole('button', { name: 'ย้อนกลับ' }).first().click();
    await expect(active()).toHaveText('หน้าหลัก');
  });

  test('บัตรยาเต็มจอ: กดย้อน = ปิดบัตร อยู่หน้าเดิม · ปิดด้วย X แล้วกดย้อนไม่เด้งบัตรกลับ', async ({ page }) => {
    const open = async () => {
      await page.getByRole('button', { name: /ค้นหายา — ชื่อ, รหัส หรือ lot/ }).click();
      await page.getByLabel('ค้นหายาหรือเมนู').fill('baclofen');
      await page.getByText('Baclofen 10mg').first().waitFor({ timeout: 30_000 });
      await page.getByLabel('ค้นหายาหรือเมนู').press('Enter');
      await expect(page.getByRole('dialog', { name: /บัตรยา/ })).toBeVisible({ timeout: 15_000 });
    };
    await bottomNav(page).getByRole('button', { name: 'คืนยา' }).click();
    await bottomNav(page).getByRole('button', { name: 'หน้าหลัก' }).click();
    await open();
    await page.goBack();
    await expect(page.getByRole('dialog', { name: /บัตรยา/ })).toBeHidden();
    await expect(bottomNav(page).locator('[aria-current="page"]')).toHaveText('หน้าหลัก');

    await open();
    await page.getByRole('dialog', { name: /บัตรยา/ }).getByRole('button', { name: 'ปิด', exact: true }).first().click();
    await expect(page.getByRole('dialog', { name: /บัตรยา/ })).toBeHidden();
    await page.goBack();   // entry ของบัตรถูกถอยไปแล้ว → ย้อนครั้งนี้ = กลับหน้าคืนยา
    await expect(page.getByRole('dialog', { name: /บัตรยา/ })).toBeHidden();
    await expect(bottomNav(page).locator('[aria-current="page"]')).toHaveText('คืนยา');
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

test.describe('ติดตั้งเป็นแอป (PWA) + บัตรยา → การ์ดคลัง lot (staff)', () => {
  test('Chrome ยอมรับว่าติดตั้งได้ (ไม่มี installability error) + manifest/ไอคอนโหลดได้', async ({ page }) => {
    await page.goto('/');
    const res = await page.request.get('/manifest.webmanifest');
    expect(res.ok()).toBeTruthy();
    const m = await res.json();
    expect(m.short_name).toBe('คลังยา');
    for (const ic of m.icons) expect((await page.request.get(ic.src)).ok(), ic.src).toBeTruthy();
    expect((await page.request.get('/apple-touch-icon.png')).ok()).toBeTruthy();
    const cdp = await page.context().newCDPSession(page);
    await expect.poll(async () => (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors.map(e => e.errorId), { timeout: 15_000 })
      .toEqual([]);
  });

  test('ย้อนจากการ์ดคลัง lot ที่เปิดจากบัตรยา → กลับหน้าเดิม บัตรไม่เด้งค้าง', async ({ page }) => {
    await login(page, process.env.TEST_STAFF_USER || 'Kao_9', process.env.TEST_STAFF_PASS || '96409999');
    await dismissStartupPopup(page, 15_000);   // popup คืนบริษัทของ staff โผล่ช้ากว่าที่ login() รอ (4 วิ) แล้วบังปุ่ม
    const nav = bottomNav(page);
    await nav.getByRole('button', { name: 'ตรวจนับ' }).click();
    await page.getByRole('button', { name: 'ค้นหายา / เมนู' }).first().click();
    await page.getByLabel('ค้นหายาหรือเมนู').fill('baclofen');
    await page.getByText('Baclofen 10mg').first().waitFor({ timeout: 30_000 });
    await page.getByLabel('ค้นหายาหรือเมนู').press('Enter');
    await page.getByRole('button', { name: 'เปิดการ์ดคลัง lot' }).click({ timeout: 15_000 });
    await expect(page.getByRole('dialog', { name: /บัตรยา/ })).toBeHidden();
    await expect(page.getByText('ประวัติทุก lot ทุกเดือน')).toBeVisible({ timeout: 15_000 });   // ถึงหน้าการ์ดคลัง lot จริง
    await page.goBack();
    await expect(page.getByText('ประวัติทุก lot ทุกเดือน')).toBeHidden();
    await expect(nav.locator('[aria-current="page"]')).toHaveText('ตรวจนับ');
    await expect(page.getByRole('dialog', { name: /บัตรยา/ })).toBeHidden();
  });
});
