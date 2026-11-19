# เปิด Google Chrome ตัวจริง (ไม่ใช่ Chromium ของ Playwright) ให้ user ล็อกอินเว็บที่บล็อกเบราว์เซอร์อัตโนมัติได้
# (Google/GitHub/Supabase ขึ้น "เบราว์เซอร์นี้อาจไม่ปลอดภัย" กับ Chromium ที่ Playwright เปิด เพราะมีธง --enable-automation)
# Claude ต่อเข้าทีหลังด้วย chromium.connectOverCDP('http://127.0.0.1:9223') — ดู scripts/chrome-cdp.cjs
#
# ใช้:  powershell -File scripts/open-chrome.ps1 [-Url <url>] [-Port 9223]
# โปรไฟล์แยกจาก Chrome ประจำ (ไม่เห็นรหัสผ่าน/บุ๊กมาร์กเดิม) เก็บถาวรที่ %LOCALAPPDATA%\claude-chrome → ล็อกอินครั้งเดียวใช้ต่อได้
param(
  [string]$Url = 'about:blank',
  [int]$Port = 9223
)
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'ไม่พบ Google Chrome ในเครื่อง' }
$profileDir = Join-Path $env:LOCALAPPDATA 'claude-chrome'
Start-Process -FilePath $chrome -ArgumentList "--remote-debugging-port=$Port", "--user-data-dir=`"$profileDir`"", '--no-first-run', '--no-default-browser-check', $Url
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 500
  try { if ((Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/json/version").StatusCode -eq 200) { "Chrome พร้อม · CDP port $Port · โปรไฟล์ $profileDir"; exit 0 } } catch {}
}
throw "Chrome เปิดแล้วแต่ต่อ CDP port $Port ไม่ได้ (มี Chrome โปรไฟล์นี้เปิดค้างอยู่ก่อนหรือไม่ — ปิดหน้าต่างนั้นก่อน)"
