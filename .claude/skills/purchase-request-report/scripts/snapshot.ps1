# คัดลอก 3 ไฟล์จาก OneDrive มาไว้ใน WorkDir เพื่ออ่าน (Copy-Item อ่านไฟล์ที่เปิดใน Excel ได้ แต่ openpyxl เปิดตรงไม่ได้)
# ได้เวอร์ชันที่ "เซฟล่าสุด" — ส่วนที่ผู้ใช้ยังไม่เซฟใน Excel จะไม่ติดมา ต้องบอกผู้ใช้ทุกครั้ง
param(
  [string]$WorkDir = (Join-Path $env:TEMP 'purchase-request-report'),
  [string]$OneDrive = (Join-Path $env:USERPROFILE 'OneDrive')
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
foreach ($n in 'plan.json', 'report_out.xlsx') { Remove-Item -LiteralPath (Join-Path $WorkDir $n) -ErrorAction SilentlyContinue }
$files = [ordered]@{
  'stock.xlsm'  = 'ยอดคลังยา_69.xlsm'
  'recv.xlsm'   = 'รับจากการซื้อ_ยืม_ตุลา2567-2569.xlsm'
  'report.xlsx' = 'รายงานการซื้อยา_69.xlsx'
}
$hashes = @{}
foreach ($k in $files.Keys) {
  $src = Join-Path $OneDrive $files[$k]
  if (-not (Test-Path -LiteralPath $src)) { throw "ไม่พบไฟล์ $src" }
  $locked = $false
  try { $fs = [IO.File]::Open($src, 'Open', 'Read', 'None'); $fs.Close() } catch { $locked = $true }
  Copy-Item -LiteralPath $src -Destination (Join-Path $WorkDir $k) -Force
  $hashes[$k] = (Get-FileHash -LiteralPath (Join-Path $WorkDir $k)).Hash   # hash จากสำเนา — Get-FileHash อ่านไฟล์ที่เปิดใน Excel ไม่ได้
  $state = if ($locked) { 'เปิดอยู่ใน Excel' } else { 'ปิดอยู่' }
  "{0,-40} เซฟล่าสุด {1:yyyy-MM-dd HH:mm}  ({2})" -f $files[$k], (Get-Item -LiteralPath $src).LastWriteTime, $state
}
$hashes | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $WorkDir 'hashes.json') -Encoding UTF8
"WorkDir: $WorkDir"
