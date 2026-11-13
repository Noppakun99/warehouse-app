# online-req-write.ps1 — เขียนแผนใบเบิกออนไลน์ (plan.json จาก scripts/online-req.mjs --plan) ลงชีท 'เบิก ' บนสำเนา xlsm
# เฟส 1 ขั้น 4 · กฎ /excel-com + /dispense-entry · ไฟล์ต้องมี UTF-8 BOM (PowerShell 5.1 อ่าน path ไทย)
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\online-req-write.ps1 -StockPath <สำเนา.xlsm ใน scratchpad> -PlanPath <plan.json> -LogPath <log.txt>
#
# ทำ: ตรวจแผนกับสำเนา (แถวท้าย · คีย์/ราคา/U ของแถว Master) → เขียน B–Q + W/X + AD → Calculate → แช่ค่า R–V
#     → ตรวจ T/U ของ Master ลดตาม Σ q ต่อแถว → Save ลงสำเนา (ไม่ผ่าน = ไม่ Save)
# ไม่ทำ: เปิดไฟล์ใน OneDrive (ปฏิเสธ) · วางกลับ · diff · PDF · ทะเบียน — ทำต่อตาม /excel-com ขั้น 7–10
# แถว Master เดียวกันใช้หลายแถวเบิกได้ (หลายใบ): ครั้งแรกเทียบ U จริง ครั้งถัดไปเทียบ U หลังครั้งก่อน · M = U ก่อนเบิกของแถวนั้น
# แถวจ่าย 0 (zero = ของไม่มีให้จ่าย): N = 0 · M = O = U · อ้างแถวรอตรวจรับได้ (แถวอื่นห้ามรอตรวจรับ)
param([Parameter(Mandatory)][string]$StockPath, [Parameter(Mandatory)][string]$PlanPath, [Parameter(Mandatory)][string]$LogPath)
$ErrorActionPreference = 'Stop'
$PLACEHOLDER = '[วันแจ้งสั่งซื้อ?]'
$log = New-Object System.Collections.Generic.List[string]
function Write-Log([string]$msg) { $log.Add($msg); $log | Out-File -FilePath $LogPath -Encoding utf8 }
function Set-CellV($rng, $v) {
  if ($v -is [int] -or $v -is [long] -or $v -is [decimal]) { $v = [double]$v }
  $last = $null
  for ($try = 0; $try -lt 25; $try++) {
    try { [void][System.__ComObject].InvokeMember('Value2', [Reflection.BindingFlags]::SetProperty, $null, $rng, @(,$v)); return } catch { $last = $_ }
    Start-Sleep -Milliseconds 500
  }
  throw "เขียน $($rng.Address()) ไม่ได้: $($last.Exception.Message)"
}
function Set-CellFmt($rng, [string]$f) {
  for ($try = 0; $try -lt 10; $try++) { try { $rng.NumberFormat = $f; return } catch { Start-Sleep -Milliseconds 500 } }
  throw "ตั้งรูปแบบ $($rng.Address()) ไม่ได้"
}
function Invoke-XlCalc($app) {
  for ($try = 0; $try -lt 10; $try++) { try { $app.Calculate(); return } catch { Start-Sleep -Milliseconds 700 } }
  throw 'Calculate ไม่สำเร็จ'
}
function Test-XlErr($v) { return ($v -is [int]) -and ($v -lt -2146820000) }

try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
# ด่านก่อนเปิด Excel: throw ใน try นี้ลง log ด้วย (console PowerShell 5.1 แสดงไทยเพี้ยน — อ่านจาก log)
try {
  if ($StockPath -match 'OneDrive') { throw 'ห้ามเปิดไฟล์ใน OneDrive ผ่าน COM — copy ไป scratchpad ก่อน (/excel-com ขั้น 3)' }
  if (Get-Process EXCEL -ErrorAction SilentlyContinue) { throw 'มี EXCEL.EXE เปิดอยู่ — ให้ user ปิด/End task ก่อน' }
  $lockFile = Join-Path (Split-Path $StockPath) ('~$' + (Split-Path $StockPath -Leaf))
  if (Test-Path $lockFile) { throw "ไฟล์ล็อกค้าง $lockFile" }

  $plan = Get-Content -Raw -Encoding UTF8 $PlanPath | ConvertFrom-Json
  $rows = @($plan.rows)
  if ($rows.Count -eq 0) { throw 'แผนไม่มีแถว' }
  $EXPECT_LAST = [int]$plan.expectLast
  $dp = $plan.date.Split('-')
  $dDate = (New-Object DateTime([int]$dp[0], [int]$dp[1], [int]$dp[2])).ToOADate()
  foreach ($p in $rows) {
    if ("$($p.note)".Contains($PLACEHOLDER)) { throw "แถวเบิก $($p.sheetRow) [$($p.key)] ยังมี $PLACEHOLDER — เติมวันแจ้งสั่งซื้อในแผนก่อน" }
    if ("$($p.no)" -notmatch '^บย\.70/\d{4}$') { throw "แถวเบิก $($p.sheetRow) เลข บย. ผิดรูป [$($p.no)]" }
  }
}
catch { Write-Log "ERROR (ก่อนเปิด Excel): $($_.Exception.Message)"; Write-Log 'DONE'; exit 1 }
Write-Log "แผน $PlanPath · $($rows.Count) แถว · วันที่ $($plan.date) · แถวท้ายที่คาด $EXPECT_LAST"

$xl = New-Object -ComObject Excel.Application
$autoFillOld = $null
$saved = $false
try {
  $xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.ScreenUpdating = $false
  $xl.AutomationSecurity = 3; $xl.EnableEvents = $false
  $blank = $xl.Workbooks.Add(); $xl.Calculation = -4135
  $autoFillOld = $xl.AutoCorrect.AutoFillFormulasInLists
  $xl.AutoCorrect.AutoFillFormulasInLists = $false
  $wbS = $xl.Workbooks.Open($StockPath, 0)
  $ws = $wbS.Worksheets.Item('Master'); $lo = $ws.ListObjects.Item(1)
  $mLast = $lo.Range.Row + $lo.Range.Rows.Count - 1
  $wsB = $wbS.Worksheets.Item('เบิก ')
  if ("$($wsB.Range('AD6').Value2)" -ne 'เลขรับใบเบิก') { throw 'AD6 ไม่ใช่ เลขรับใบเบิก' }
  $ev = $wsB.Range('E1:E12000').Value2; $gv = $wsB.Range('G1:G12000').Value2
  $lastB = 0; for ($i = 7; $i -le 12000; $i++) { if ("$($ev[$i,1])" -ne '' -or "$($gv[$i,1])" -ne '') { $lastB = $i } }
  Write-Log "แถวท้ายชีทเบิก = $lastB"
  if ($lastB -ne $EXPECT_LAST) { throw "แถวท้ายชีทเบิกคาด $EXPECT_LAST เจอ $lastB — มีคนลงเพิ่มหลังทำแผน ทำแผนใหม่" }
  $r0 = $lastB + 1; $lastNew = $r0 + $rows.Count - 1
  if ($lastNew -gt 11999) { throw "เกินช่วงสูตร T (แถว 7–11999)" }

  $fA = $ws.Range("F1:F$mLast").Value2; $kA = $ws.Range("K1:K$mLast").Value2; $mA = $ws.Range("M1:M$mLast").Value2; $jA = $ws.Range("J1:J$mLast").Value2
  # คีย์สูตร T (SUMIFS ชีทเบิก) = รหัส|lot|ราคา|ชนิดรายการ — 2 แถว Master คีย์เดียวกัน แถวเบิก 1 แถวลด U ทั้งคู่ (13/11/2569 บิล IV6960441)
  $tKeyRows = @{}
  for ($i = 2; $i -le $mLast; $i++) {
    if ("$($fA[$i,1])".Trim() -eq '') { continue }
    $tk = "$($fA[$i,1])|$($kA[$i,1])|$([double]$jA[$i,1])|$("$($mA[$i,1])".Trim())"
    if (-not $tKeyRows.ContainsKey($tk)) { $tKeyRows[$tk] = New-Object System.Collections.Generic.List[int] }
    $tKeyRows[$tk].Add($i)
  }
  $tBefore = $ws.Range("T1:T$mLast").Value2
  $base = @{}   # แถว Master → @{ u0; t0; sumQ }
  $its = @()
  $r = $r0
  foreach ($p in $rows) {
    $m = [int]$p.masterRow
    if ($m -lt 2 -or $m -gt $mLast) { throw "แถว Master $m อยู่นอกตาราง" }
    if ([int]$p.sheetRow -ne $r) { throw "แผนให้ลงแถว $($p.sheetRow) แต่แถวถัดไปคือ $r" }
    $key = "$($fA[$m,1])|$($kA[$m,1])|$("$($mA[$m,1])".Trim())"
    if ($key -ne $p.key) { throw "Master แถว $m คีย์ [$key] ไม่ตรงแผน [$($p.key)] — Master ขยับ ทำแผนใหม่" }
    if ([double]$jA[$m,1] -ne [double]$p.price) { throw "Master แถว $m ราคา $($jA[$m,1]) ไม่ตรงแผน $($p.price)" }
    $twins = $tKeyRows["$($fA[$m,1])|$($kA[$m,1])|$([double]$jA[$m,1])|$("$($mA[$m,1])".Trim())"]
    if ($twins.Count -gt 1) { throw "Master แถว $($twins -join '/') คีย์ T ซ้ำกัน (รหัส+lot+ราคา+ชนิดรายการ) — เบิกแล้วยอดลดทุกแถว · แก้ชนิดรายการแถวบิลใหม่เป็น ซื้อยา(2) ก่อน แล้วทำแผนใหม่" }
    $q = [double]$p.q
    $zero = ($q -eq 0)
    if (-not $zero -and "$($ws.Range("C$m").Value2)" -match 'รอตรวจรับ') { throw "Master แถว $m รอตรวจรับ — จ่ายไม่ได้" }
    if (-not $base.ContainsKey($m)) { $base[$m] = @{ u0 = [double]$ws.Range("U$m").Value2; t0 = [double]$ws.Range("T$m").Value2; sumQ = 0.0 } }
    $uBefore = $base[$m].u0 - $base[$m].sumQ
    if ($uBefore -ne [double]$p.u) { throw "Master แถว $m [$($p.key)] U ก่อนเบิกคาด $($p.u) เจอ $uBefore" }
    if ($q -lt 0 -or $q -gt $uBefore) { throw "Master แถว $m [$($p.key)] จ่าย $q เกิน U $uBefore" }
    $base[$m].sumQ += $q
    $its += @{ r = $r; m = $m; q = $q; uB = $uBefore; note = [string]$p.note; no = [string]$p.no; dept = [string]$p.dept; key = $p.key; w = $p.w; x = $p.x }
    $r++
  }

  foreach ($it in $its) {
    $r = $it.r; $m = $it.m
    foreach ($col in 'B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','W','X','AD') { if ("$($wsB.Range("$col$r").Value2)" -ne '') { throw "เบิก $col$r ไม่ว่าง" } }
    Set-CellV ($wsB.Range("B$r")) ([double]$dDate); Set-CellFmt ($wsB.Range("B$r")) ($wsB.Range("B$EXPECT_LAST").NumberFormat)
    Set-CellV ($wsB.Range("C$r")) ("$($ws.Range("D$m").Value2)")
    Set-CellV ($wsB.Range("D$r")) ("$($ws.Range("E$m").Value2)")
    Set-CellFmt ($wsB.Range("E$r")) '@'; Set-CellV ($wsB.Range("E$r")) ("$($ws.Range("F$m").Value2)")
    Set-CellV ($wsB.Range("F$r")) ("$($ws.Range("G$m").Value2)")
    Set-CellV ($wsB.Range("G$r")) ("$($ws.Range("H$m").Value2)")
    Set-CellV ($wsB.Range("H$r")) ("$($ws.Range("I$m").Value2)")
    Set-CellV ($wsB.Range("I$r")) ([double]$ws.Range("J$m").Value2)
    Set-CellFmt ($wsB.Range("J$r")) '@'; Set-CellV ($wsB.Range("J$r")) ("$($ws.Range("K$m").Value2)")
    $ex = $ws.Range("L$m").Value2
    if ($ex -is [double]) { Set-CellV ($wsB.Range("K$r")) ([double]$ex); Set-CellFmt ($wsB.Range("K$r")) ($wsB.Range("K$EXPECT_LAST").NumberFormat) } else { Set-CellV ($wsB.Range("K$r")) ("$ex") }
    Set-CellV ($wsB.Range("L$r")) ("$($ws.Range("M$m").Value2)")
    Set-CellV ($wsB.Range("M$r")) ([double]$it.uB); Set-CellV ($wsB.Range("N$r")) ([double]$it.q)
    Set-CellV ($wsB.Range("O$r")) ([double]($it.uB - $it.q))
    Set-CellV ($wsB.Range("P$r")) ([string]$it.dept)
    if ($it.note -ne '') { Set-CellV ($wsB.Range("Q$r")) ([string]$it.note) }
    if ($null -ne $it.w) { Set-CellV ($wsB.Range("W$r")) ([double]$it.w) }
    if ($null -ne $it.x -and "$($it.x)" -ne '') { Set-CellV ($wsB.Range("X$r")) ([string]$it.x) }
    Set-CellFmt ($wsB.Range("AD$r")) '@'; Set-CellV ($wsB.Range("AD$r")) ([string]$it.no)
  }
  Write-Log "เขียนแถว $r0-$lastNew"
  # manual จนจบ: เขียนทุกแถว → Calculate → แช่ค่า R–V → Calculate (/excel-com กับดักแช่ค่า 03/11/2569)
  Invoke-XlCalc $xl
  for ($rx = $r0; $rx -le $lastNew; $rx++) {
    foreach ($col in 'R','S','T','U','V') {
      $cc = $wsB.Range("$col$rx"); $cv = $cc.Value2
      if (Test-XlErr $cv) { throw "เบิก $col$rx เป็น error ก่อนแช่ค่า" }
      if ($null -eq $cv) { $cv = '' }
      if ($col -eq 'S' -or $col -eq 'U') { Set-CellV $cc ([double]$cv) } else { Set-CellV $cc ([string]$cv) }
    }
    $vv = "$($wsB.Range("V$rx").Value2)".Trim()
    if ($vv -match 'เปลี่ยนบริษัท') {
      $qq = "$($wsB.Range("Q$rx").Value2)".Trim()
      $newQ = if ($qq -ne '') { "$qq · $vv" } else { $vv }
      Set-CellV ($wsB.Range("Q$rx")) ([string]$newQ); Write-Log "V->Q $rx : $newQ"
    }
  }
  Invoke-XlCalc $xl

  $fail = @()
  foreach ($m in $base.Keys) {
    $b = $base[$m]
    $tA = [double]$ws.Range("T$m").Value2; $uA = [double]$ws.Range("U$m").Value2
    if ($tA -ne $b.t0 + $b.sumQ -or $uA -ne $b.u0 - $b.sumQ) { $fail += "Master แถว $m T $($b.t0)->$tA U $($b.u0)->$uA ไม่ลดตาม Σq $($b.sumQ)" }
  }
  # แถวนอกแผนต้องไม่มี T เปลี่ยน (กันกรณีที่ด่านคีย์ซ้ำข้างบนไม่เห็น)
  $tAfter = $ws.Range("T1:T$mLast").Value2
  for ($i = 2; $i -le $mLast; $i++) {
    if ($base.ContainsKey($i)) { continue }
    if ("$($tBefore[$i,1])" -ne "$($tAfter[$i,1])") { $fail += "Master แถว $i อยู่นอกแผนแต่ T เปลี่ยน $($tBefore[$i,1])->$($tAfter[$i,1]) (คีย์ T ซ้ำกับแถวในแผน?)" }
  }
  for ($rx = $r0; $rx -le $lastNew; $rx++) {
    $bvv = $wsB.Range("B${rx}:AD$rx").Value2
    for ($cc = 1; $cc -le 29; $cc++) { if (Test-XlErr $bvv[1,$cc]) { $fail += "เบิก แถว $rx คอลัมน์ที่ $cc เป็น error" } }
    Write-Log "แถว $rx : $($wsB.Range("E$rx").Value2) lot $($wsB.Range("J$rx").Value2) $($wsB.Range("L$rx").Value2) M=$($wsB.Range("M$rx").Value2) N=$($wsB.Range("N$rx").Value2) O=$($wsB.Range("O$rx").Value2) W=$($wsB.Range("W$rx").Value2) X=$($wsB.Range("X$rx").Value2) AD=$($wsB.Range("AD$rx").Value2) Q=$($wsB.Range("Q$rx").Value2)"
  }
  if ($fail.Count -gt 0) { foreach ($x in $fail) { Write-Log "FAIL $x" }; throw 'ด่านตรวจไม่ผ่าน — ไม่ Save' }
  $xl.Calculation = -4105
  $wbS.Save(); $saved = $true; Write-Log "SAVED · เบิก แถว $r0-$lastNew"
  $wbS.Close($false); $blank.Close($false)
}
catch { Write-Log "ERROR: $($_.Exception.Message) @ บรรทัด $($_.InvocationInfo.ScriptLineNumber)"; try { foreach ($w in @($xl.Workbooks)) { $w.Close($false) } } catch {} }
finally {
  if ($null -ne $autoFillOld) { try { $xl.AutoCorrect.AutoFillFormulasInLists = $autoFillOld } catch {} }
  try { $xl.Quit() } catch {}
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null; Write-Log 'DONE'
}
if (-not $saved) { exit 1 }
