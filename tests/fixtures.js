/**
 * Custom Playwright fixtures สำหรับ warehouse-app
 *
 * authenticatedPage — scope: 'worker'
 *   Login ครั้งเดียวต่อ worker แล้ว reuse browser context ข้ามทุก test
 *   ในไฟล์เดียวกัน → ประหยัดเวลา ~2-3s ต่อ test
 *
 * waitForSupabase — helper สำหรับรอ Supabase REST response
 *   ใช้แทน waitForTimeout ที่ไม่แน่นอน
 */

import { test as base, expect } from '@playwright/test';
import { login } from './helpers/auth.js';

// ─── Credentials (override ด้วย env var ถ้ามี) ────────────────────────────
// requester: test/444444  |  staff: test2/555555
const STAFF_USER = process.env.TEST_STAFF_USER || 'test2';
const STAFF_PASS = process.env.TEST_STAFF_PASS || '555555';

export const test = base.extend({
  // ─── Shared authenticated browser context (worker scope) ─────────────────
  authenticatedPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page    = await context.newPage();
      await login(page);
      await use(page);
      await context.close();
    },
    { scope: 'worker' },  // สร้างครั้งเดียวต่อ worker — ไม่ login ซ้ำทุก test
  ],

  // ─── Staff context (worker scope) — ถ้า login ไม่ผ่านจะ use(null) แทน crash
  staffPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page    = await context.newPage();
      try {
        await login(page, STAFF_USER, STAFF_PASS);
        await use(page);
      } catch {
        await use(null); // test ที่รับ null ต้อง test.skip() เอง
      } finally {
        await context.close();
      }
    },
    { scope: 'worker' },
  ],
});

export { expect };

/**
 * รอ Supabase REST API response
 * ใช้แทน waitForTimeout โดยดักฟัง network จริง
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {string} [opts.table]   — ชื่อ table เช่น 'inventory', 'dispense_logs'
 * @param {string} [opts.method]  — HTTP method (GET, POST, PATCH, DELETE) default 'GET'
 * @param {number} [opts.timeout] — ms default 8000
 */
export function waitForSupabase(page, { table = '', method = 'GET', timeout = 8_000 } = {}) {
  return page.waitForResponse(
    r =>
      r.url().includes('supabase') &&
      (table ? r.url().includes(`/${table}`) : true) &&
      r.request().method() === method &&
      r.status() < 400,
    { timeout },
  );
}
