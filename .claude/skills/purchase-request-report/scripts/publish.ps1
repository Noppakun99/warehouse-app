# คัดลอก report_out.xlsx กลับ OneDrive — เฉพาะเมื่อ (1) ไฟล์ไม่ได้เปิดอยู่ (2) ไม่มีใครแก้ไฟล์หลัง snapshot
# สำรองไฟล์เดิมเป็น รายงานการซื้อยา_69_backup_<เวลา>.xlsx ก่อนเสมอ
param(
  [string]$WorkDir = (Join-Path $env:TEMP 'purchase-request-report'),
  [string]$OneDrive = (Join-Path $env:USERPROFILE 'OneDrive')
)
$ErrorActionPreference = 'Stop'
$f = Join-Path $OneDrive 'รายงานการซื้อยา_69.xlsx'
$src = Join-Path $WorkDir 'report_out.xlsx'
if (-not (Test-Path -LiteralPath $src)) { throw 'ไม่พบ report_out.xlsx — รัน apply.ps1 ก่อน' }
try { $fs = [IO.File]::Open($f, 'Open', 'Read', 'None'); $fs.Close() } catch { throw 'ไฟล์รายงานเปิดอยู่ใน Excel — ให้ผู้ใช้ปิดก่อน' }
$snap = (Get-Content -LiteralPath (Join-Path $WorkDir 'hashes.json') -Raw | ConvertFrom-Json).'report.xlsx'
if ((Get-FileHash -LiteralPath $f).Hash -ne $snap) { throw 'ไฟล์รายงานถูกแก้หลัง snapshot — ทำ snapshot/plan/apply/verify ใหม่ (ห้ามเขียนทับงานของผู้ใช้)' }
$bk = Join-Path $OneDrive ("รายงานการซื้อยา_69_backup_{0:yyyyMMdd_HHmmss}.xlsx" -f (Get-Date))
Copy-Item -LiteralPath $f -Destination $bk
Copy-Item -LiteralPath $src -Destination $f -Force
if ((Get-FileHash -LiteralPath $f).Hash -ne (Get-FileHash -LiteralPath $src).Hash) { throw 'คัดลอกแล้ว hash ไม่ตรง' }
"backup: $bk"
"published: $f"
