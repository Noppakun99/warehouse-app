// ── โมดอลใกล้หมดอายุ (ชมพู) + popup คืนบริษัท (ส้ม): ประวัติรับยา + scope + deadline + ตัวกรองพับ ──
// ครอบคลุมงาน 2026-07-18: banner คืนบริษัทในโมดอลชมพู, คลิกดูประวัติรับยาได้ทั้ง 2 โมดอล,
// scope รหัส+lot+exp, แก้ bug spillover/timezone ให้ deadline ตรงกันทุกจุด, ตัวกรองพับ/กาง
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth.js';

// staff/admin เห็น SwapReturnPopup เด้ง auto ตอน login — helper ปิดให้สนิท (async, ต้องรอโผล่ก่อน)
async function dismissSwapPopup(page) {
  const swapTitle = page.getByText('ยาต้องเปลี่ยน/คืนบริษัทก่อนพ้นกำหนด');
  await swapTitle.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {}); // requester ไม่มี — ข้าม
  for (let i = 0; i < 5 && await swapTitle.isVisible().catch(() => false); i++) {
    await page.getByRole('button', { name: 'รับทราบ' }).last().click({ force: true }).catch(() => {});
    await swapTitle.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
}

async function openExpiryModal(page) {
  await page.locator('button', { hasText: /ใกล้หมด/ }).first().click();
  await page.getByText('แจ้งเตือนยาใกล้หมดอายุ').waitFor({ timeout: 10000 });
  await page.waitForTimeout(2500); // รอ drugDetails/swapPolicies โหลด (lazy)
}

test('popup ส้ม: คลิกรายการ → กางประวัติรับยา (จาก receive_logs)', async ({ page }) => {
  await login(page, 'Kao_9', '96409999');
  const swapTitle = page.getByText('ยาต้องเปลี่ยน/คืนบริษัทก่อนพ้นกำหนด');
  await swapTitle.waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForTimeout(2000);

  await page.getByText('ดูประวัติรับยา').first().click();
  await expect(page.getByText('ประวัติรับยา (จาก Log คลัง)').first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('เลขที่บิล').first()).toBeVisible({ timeout: 3000 });
});

test('โมดอลชมพู: banner คืนบริษัท + คลิกรายการดูประวัติรับยา', async ({ page }) => {
  await login(page, 'Kao_9', '96409999');
  await dismissSwapPopup(page);
  await openExpiryModal(page);

  // banner คืนบริษัทแสดง (มีรายการ due/overdue)
  await expect(page.getByText(/ต้องเปลี่ยน\/คืนบริษัทก่อนพ้นกำหนด/).first()).toBeVisible();

  // กาง banner → คลิกรายการ → ประวัติรับยากางออก
  await page.getByRole('button', { name: /ต้องเปลี่ยน\/คืนบริษัทก่อนพ้นกำหนด/ }).click();
  await page.locator('div.cursor-pointer', { hasText: /พ้นกำหนด|เหลือ \d+ วัน/ }).first().click();
  await expect(page.getByText('ประวัติรับยา (จาก Log คลัง)').first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('เลขที่บิล').first()).toBeVisible({ timeout: 3000 });
});

test('ประวัติรับยา scope: lot ตรง = บิลเดียว, lot ไม่มีใน log = note ระดับรหัส', async ({ page }) => {
  await login(page, 'Kao_9', '96409999');
  await dismissSwapPopup(page);
  await openExpiryModal(page);
  const modal = page.locator('div.bg-white', { has: page.getByText('แจ้งเตือนยาใกล้หมดอายุ') }).last();

  // (1) Budesonide 1670031 lot 330638 — lot+exp ตรงใน receive_logs → บิลเดียว (ไม่ปนหลาย lot)
  await modal.getByText('BudesonidenebuliserPul', { exact: false }).first().click();
  await expect(page.getByText('ประวัติรับยา (จาก Log คลัง)').first()).toBeVisible({ timeout: 5000 });
  expect(await page.getByText(/บิล 2\//).count()).toBe(0);

  // (2) Amoxicillin 1000028 lot N670219 — lot ไม่มีใน receive_logs → note "ระดับรหัสยา"
  await modal.getByText('BudesonidenebuliserPul', { exact: false }).first().click(); // ปิดอันเดิม
  await page.locator('input[placeholder*="ค้นหา"]').first().fill('Amoxicillin trihydrate');
  await page.waitForTimeout(800);
  await modal.locator('tr', { hasText: 'N670219' }).first().locator('td').first().click();
  await expect(page.getByText(/ไม่พบ lot นี้ใน log|ระดับรหัสยา/).first()).toBeVisible({ timeout: 4000 });
});

test('deadline ต้องคืน: popup ส้ม = banner ชมพู (clamp สิ้นเดือน, ไม่ spillover)', async ({ page }) => {
  await login(page, 'Kao_9', '96409999');
  const swapTitle = page.getByText('ยาต้องเปลี่ยน/คืนบริษัทก่อนพ้นกำหนด');
  await swapTitle.waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForTimeout(1500);
  const popupDeadlines = (await page.getByText(/ต้องคืนภายใน/).allInnerTexts()).join('|');

  await dismissSwapPopup(page);
  await openExpiryModal(page);
  await page.getByRole('button', { name: /ต้องเปลี่ยน\/คืนบริษัทก่อนพ้นกำหนด/ }).click();
  await page.waitForTimeout(500);
  const bannerDeadlines = (await page.getByText(/ต้องคืนภายใน/).allInnerTexts()).join('|');

  // lot 330638 (exp 31/7) − 3 เดือน = 30/4/2569 (clamp) — ต้องตรงกันทั้ง 2 จุด, ไม่ spillover เป็น 1/5
  expect(popupDeadlines).toContain('ต้องคืนภายใน 30/4/2569');
  expect(bannerDeadlines).toContain('ต้องคืนภายใน 30/4/2569');
  expect(bannerDeadlines).not.toContain('ต้องคืนภายใน 1/5/2569');
});

test('ตัวกรองพับ/กาง: ช่วงเวลา + โซน (default พับ)', async ({ page }) => {
  await login(page, 'Kao_9', '96409999');
  await dismissSwapPopup(page);
  await openExpiryModal(page);

  // default พับ — เห็นแค่ปุ่มตัวกรอง 2 ตัว ไม่เห็น chips
  await expect(page.getByRole('button', { name: /ช่วงเวลา/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /กรองตามโซน/ }).first()).toBeVisible();
  expect(await page.getByRole('button', { name: /3–6 เดือน/ }).count()).toBe(0);

  // กาง → เลือก → ปุ่ม summary อัพเดตค่าที่เลือก
  await page.getByRole('button', { name: /ช่วงเวลา/ }).first().click();
  await page.getByRole('button', { name: /6–16 เดือน/ }).first().click();
  await expect(page.getByRole('button', { name: /ช่วงเวลา/ }).first()).toContainText('6–16 เดือน');
});
