# เขียนตาม plan.json ลง report_out.xlsx (สำเนาใน WorkDir) — ไม่แตะไฟล์ใน OneDrive
# ⚠️ ห้ามเปลี่ยนให้เปิดไฟล์ใน OneDrive ตรงๆ: AutoSave ของ OneDrive เซฟทุกการแก้ผ่าน COM แม้ Close($false)
# ⚠️ ข้อความ (☐/☑/ชื่อ/หมายเหตุ) ต้องเขียนด้วย .Formula — .Value2 = string ใน loop ของ PS 5.1 เจอ "Specified cast is not valid"
param([string]$WorkDir = (Join-Path $env:TEMP 'purchase-request-report'))
$ErrorActionPreference = 'Stop'
$plan = Get-Content -LiteralPath (Join-Path $WorkDir 'plan.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$out = Join-Path $WorkDir 'report_out.xlsx'
Copy-Item -LiteralPath (Join-Path $WorkDir 'report.xlsx') -Destination $out -Force
$CHECKED = [string][char]0x2611; $UNCHECKED = [string][char]0x2610
$cols = 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'T'

function SetV($cell, $v) {
  if ($null -eq $v -or ($v -is [string] -and $v -eq '')) { $cell.Formula = '' }
  elseif ($v -is [string]) { $cell.Formula = [string]$v }
  else { $cell.Value2 = [double]$v }
}
function SetDate($cell, $iso) {
  if ($iso -eq '-' -or -not $iso) { $cell.Formula = '-' }
  else { $cell.Value2 = [DateTime]::ParseExact($iso, 'yyyy-MM-dd', $null).ToOADate() }
}
function CodeAt($ws, [int]$r) { ([string]$ws.Range("E$r").Text).Trim() }

$xl = New-Object -ComObject Excel.Application; $xl.Visible = $false; $xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Open($out); $rp = $wb.Worksheets.Item('รายงานซื้อยา'); $s1 = $wb.Worksheets.Item('Sheet1')
  $lo = $rp.ListObjects.Item(1)
  function Index { $h = @{}; for ($r = 5; $r -le 4 + $lo.ListRows.Count; $r++) { $h[(CodeAt $rp $r)] = $r }; $h }
  $n0 = $lo.ListRows.Count
  if ($n0 -ne [int]$plan.report_rows) { throw "จำนวนแถวในรายงาน ($n0) ไม่ตรงกับตอนทำแผน ($($plan.report_rows)) — ทำ snapshot/plan ใหม่" }

  # 1) คอลัมน์ C วันที่ยาส่งล่าสุด
  $idx = Index
  foreach ($c in $plan.c_updates) { SetDate $rp.Range("C$($idx[$c.code])") $c.value }
  "C updated: $(@($plan.c_updates).Count)"

  # 2) ย้ายรายการที่มาส่งแล้วไปต่อท้าย Sheet1 (Sheet1 = คอลัมน์ B–U ตรงกับรายงาน A–T)
  $next = $s1.Cells($s1.Rows.Count, 6).End(-4162).Row + 1
  if ($next -ne [int]$plan.sheet1_last + 1) { throw "Sheet1 แถวสุดท้ายไม่ตรงกับตอนทำแผน" }
  foreach ($m in $plan.moves) {
    $r = [int]$m.row
    if ((CodeAt $rp $r) -ne $m.code) { throw "แถว $r ไม่ใช่รหัส $($m.code)" }
    if ($m.tick) { $rp.Range("A$r").Formula = $CHECKED }
    if ($m.S) { $rp.Range("S$r").Formula = [string]$m.S }          # ยกเลิกแจ้ง: เหตุผลไปกับแถว
    $null = $rp.Range("A${r}:T${r}").Copy($s1.Range("B$next"))
    $e = $s1.Range("E$next"); $v = $e.Value2; $e.Value2 = $v      # ระยะเวลา: สูตร → ค่า ให้เหมือนแถวเก่าใน Sheet1
    $next++
  }
  foreach ($m in ($plan.moves | Sort-Object { [int]$_.row } -Descending)) { $null = $rp.Rows([int]$m.row).Delete() }
  "moved: $(@($plan.moves).Count) → Sheet1 ถึงแถว $($next - 1)"

  # 3) อัพเดตตัวเลขแถวที่ยังรอของ
  $idx = Index
  foreach ($x in $plan.refresh) {
    $r = $idx[$x.code]; if (-not $r) { throw "refresh: ไม่พบรหัส $($x.code)" }
    foreach ($k in $cols) { SetV $rp.Range("$k$r") $x.values.$k }
  }
  "refreshed: $(@($plan.refresh).Count)"

  # 4) รายการใหม่
  $b = [DateTime]::ParseExact($plan.date, 'yyyy-MM-dd', $null).ToOADate()
  foreach ($x in $plan.new) {
    $r = $lo.ListRows.Add().Range.Row
    $rp.Range("A$r").Formula = $UNCHECKED
    $rp.Range("B$r").Value2 = $b
    SetDate $rp.Range("C$r") $x.C
    $rp.Range("D$r").Formula = "=IF(OR(NOT(ISNUMBER(B$r)),NOT(ISNUMBER(C$r))),`"-`",B$r-C$r)"
    if ($x.code -match '^\d+$') { $rp.Range("E$r").Value2 = [double]$x.code } else { $rp.Range("E$r").Formula = [string]$x.code }
    foreach ($k in 'F', 'G', 'H', 'S') { SetV $rp.Range("$k$r") $x.$k }
    foreach ($k in $cols) { SetV $rp.Range("$k$r") $x.$k }
  }
  "new: $(@($plan.new).Count) → รายงาน $($lo.ListRows.Count) แถว"

  # 5) หัวรายงาน
  foreach ($p in $plan.headers.PSObject.Properties) {
    $c = $rp.Range($p.Name); $t = [string]$c.Formula
    $c.Formula = [regex]::Replace($t, $p.Value[0], $p.Value[1])
    "$($p.Name): $($c.Text)"
  }
  $wb.Save(); 'SAVED (สำเนาใน WorkDir — ยังไม่แตะ OneDrive)'
} catch {
  "ERROR บรรทัด $($_.InvocationInfo.ScriptLineNumber): $($_.Exception.Message)"; "  $($_.InvocationInfo.Line.Trim())"; throw
} finally {
  if ($wb) { $wb.Close($false) }; $xl.Quit(); [Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
