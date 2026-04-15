// Helper: login ด้วย username + password
export async function login(page, username = 'test', password = '444444') {
  await page.goto('/');
  await page.getByPlaceholder('กรอกชื่อผู้ใช้').fill(username);
  await page.getByPlaceholder('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  // รอจนเห็น Dashboard (header แสดง "สวัสดี, username")
  await page.waitForSelector('text=สวัสดี,', { timeout: 10_000 });
}
