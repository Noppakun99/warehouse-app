param([string]$Mode = 'dry')
# แยก ให้ยืมออก / คืนยาที่ยืมมา ออกจากเบิกใช้ (design-loan-valuation 3.1-3.3) — งวด ต.ค.69
$ErrorActionPreference = 'Stop'
$Dir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogFile = Join-Path $Dir 'loan_oct.log'
$KeyFile = Join-Path $Dir 'keys.tsv'
$Book    = 'C:\Users\Admin\OneDrive\ยอดคลังยา_69.xlsm'
'' | Out-File $LogFile -Encoding utf8
function Say([string]$msg) { $msg | Out-File $LogFile -Encoding utf8 -Append }

$xl = $null; $wbk = $null; $saved = $false
try {
  if (Get-Process EXCEL -ErrorAction SilentlyContinue) { throw 'มี EXCEL.EXE เปิดอยู่ — ปิดก่อน' }
  if (Test-Path 'C:\Users\Admin\OneDrive\~$ยอดคลังยา_69.xlsm') { throw 'ไฟล์ถูกล็อก (~$)' }

  if ($Mode -eq 'commit') {
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $bak = "C:\Users\Admin\OneDrive\ยอดคลังยา_69_ก่อนแยกยืมคืนต.ค._$stamp.xlsm"
    Copy-Item -LiteralPath $Book -Destination $bak
    if ((Get-Item -LiteralPath $bak).Length -ne (Get-Item -LiteralPath $Book).Length) { throw 'สำรองไม่สำเร็จ' }
    Say "BACKUP $bak"
  }

  $xl = New-Object -ComObject Excel.Application
  $xl.Visible = $false; $xl.DisplayAlerts = $false
  $xl.AutomationSecurity = 3
  $wbk = $xl.Workbooks.Open($Book, 0, ($Mode -ne 'commit'))
  $xl.Calculation = -4135
  $xl.EnableEvents = $false
  $autoFillPrev = $xl.AutoCorrect.AutoFillFormulasInLists

  $shM = $wbk.Worksheets.Item('Master')
  $shD = $wbk.Worksheets.Item('เบิก ')
  $loM = $shM.ListObjects.Item('Master')
  $loD = $shD.ListObjects.Item('เบิกยา')
  Say "Master table $($loM.Range.Address()) | เบิกยา table $($loD.Range.Address())"
  $first = $loM.DataBodyRange.Row; $last = $first + $loM.DataBodyRange.Rows.Count - 1
  if ($loM.ListColumns.Count -ne 50) { throw "Master มี $($loM.ListColumns.Count) คอลัมน์ (คาด 50 = A:AX)" }
  if ($loD.ListColumns.Count -ne 28) { throw "เบิกยา มี $($loD.ListColumns.Count) คอลัมน์ (คาด 28 = B:AC)" }

  # ---- snapshot ก่อนแก้ ----
  function Col([string]$letter) { return ,($shM.Range("$($letter)$($first):$($letter)$($last)").Value2) }
  $before = @{}; foreach ($c in 'U','AA','Z','AB','AQ','AR','J','K','M') { $before[$c] = Col $c }
  if ($before['U'].Rank -ne 2) { throw 'snapshot ไม่ใช่ array 2 มิติ' }
  Say "snapshot rows $($before['U'].GetLength(0)) · U2=$($before['U'][1,1]) · K2=$($before['K'][1,1])"

  # ---- สูตรเดิม (รูป COM) ----
  $fT  = [string]$shM.Range("T$first").Formula
  $fZ  = [string]$shM.Range("Z$first").Formula
  $fAB = [string]$shM.Range("AB$first").Formula
  $fAF = [string]$shM.Range("AF$first").Formula
  Say "T  = $fT"; Say "Z  = $fZ"; Say "AB = $fAB"; Say "AF = $fAF"

  if (-not $fT.EndsWith('),0)')) { throw 'สูตร T ไม่ได้ลงท้ายด้วย ),0)' }
  $mZ = [regex]::Match($fZ, '^(.*),ROUND\((.+)\*(.+?),2\)\)$')
  if (-not $mZ.Success) { throw 'จับรูปสูตร Z ไม่ได้' }
  $zHead = $mZ.Groups[1].Value; $refT = $mZ.Groups[2].Value; $refJ = $mZ.Groups[3].Value
  $mAB = [regex]::Match($fAB, '-(\[@\[มูลค่าเบิกยา[^\]]*\]\])\+IF\(')
  if (-not $mAB.Success) { throw 'จับตำแหน่งมูลค่าเบิกในสูตร AB ไม่ได้' }
  $mAF = [regex]::Match($fAF, ',\((.+)-(.+)\)\*(.+?),0\)$')
  if (-not $mAF.Success) { throw 'จับรูปสูตร AF ไม่ได้' }
  $refS = $mAF.Groups[1].Value; $refN = $mAF.Groups[2].Value

  # ---- 3.1 ชีทเบิก: คอลัมน์ ประเภทการจ่าย ----
  $newD = $null; $dCol = $null
  if ($Mode -eq 'commit') {
    $newD = $loD.ListColumns.Add()
    $newD.Name = 'ประเภทการจ่าย'
    $dCol = $newD.Range.Column
  } else { $dCol = $loD.Range.Column + $loD.ListColumns.Count }
  $dLetter = ($shD.Cells(1, $dCol).Address($false, $false)) -replace '\d', ''
  Say "เบิก: คอลัมน์ใหม่ = $dLetter"
  $tagRange = "'เบิก '!`$$($dLetter)`$7:`$$($dLetter)`$11999"

  # หาแถวด้วยเนื้อหา (วันที่+หน่วยงาน+รหัส+lot+ปริมาณออก)
  $body = $loD.DataBodyRange
  $vals = $body.Value2
  $bRow0 = $body.Row
  $nRows = $body.Rows.Count
  $tagged = 0
  foreach ($line in (Get-Content -LiteralPath $KeyFile -Encoding UTF8)) {
    if (-not $line.Trim()) { continue }
    $p = $line.Split("`t")
    $hits = @()
    for ($i = 1; $i -le $nRows; $i++) {
      $dv = $vals[$i, 1]; if ($null -eq $dv -or $dv -isnot [double]) { continue }
      [double]$dd = $dv - [double]$p[1]; if ([math]::Abs($dd) -gt 0.000001) { continue }
      if (([string]$vals[$i, 15]).Trim() -ne $p[2]) { continue }
      if (([string]$vals[$i, 4]).Trim() -ne $p[3]) { continue }
      if (([string]$vals[$i, 9]).Trim() -ne $p[4]) { continue }
      if ([string]$vals[$i, 13] -ne $p[5]) { continue }
      $hits += ($bRow0 + $i - 1)
    }
    if ($hits.Count -ne 1) { throw "แถว $($p[0]) ($($p[2]) $($p[3]) lot $($p[4])): เจอ $($hits.Count) แถว" }
    if ($hits[0] -ne [int]$p[0]) { Say "  หมายเหตุ: แถว $($p[0]) ย้ายไปอยู่ $($hits[0])" }
    if ($Mode -eq 'commit') { $shD.Cells($hits[0], $dCol).Value2 = $p[6] }
    $tagged++
  }
  Say "เบิก: ติดป้าย $tagged แถว"

  # ---- 3.2 Master: AY-BC + แก้ Z/AB ----
  $fAY = $fT.Substring(0, $fT.Length - 4) + ",$tagRange,""ให้ยืมออก""),0)"
  $fAZ = $fT.Substring(0, $fT.Length - 4) + ",$tagRange,""คืนยาที่ยืมมา""),0)"
  $fBA = "$zHead,ROUND([@ปริมาณให้ยืมออก]*$refJ,2))"
  $fBB = "$zHead,ROUND([@ปริมาณคืนออก]*$refJ,2))"
  $fBC = "=IF(OR([@ชนิดรายการ]=""คืนยา"",[@ชนิดรายการ]=""คืนยา(2)"",[@ชนิดรายการ]=""ยืมยา""),ROUND(($refS-$refN)*$refJ,2),0)"
  $fZn = "$zHead,ROUND(($refT-[@ปริมาณให้ยืมออก]-[@ปริมาณคืนออก])*$refJ,2))"
  $fABn = $fAB.Replace($mAB.Value, "-$($mAB.Groups[1].Value)+[@มูลค่ารับคืนและยืมเข้า]-[@มูลค่าให้ยืมออก]-[@มูลค่าคืนออก]+IF(")
  Say "AY = $fAY"; Say "AZ = $fAZ"; Say "BA = $fBA"; Say "BB = $fBB"; Say "BC = $fBC"; Say "Z' = $fZn"; Say "AB' = $fABn"

  # แถวสรุปใต้ตาราง (หาจากข้อความ ไม่ใช่เลขแถว)
  $rDrug = $null; $rNon = $null; $rCarry = $null
  for ($r = $last + 1; $r -le $last + 40; $r++) {
    $x = [string]$shM.Range("X$r").Value2
    if ($x.StartsWith('ยอด ยา นำไปใช้เดือนถัดไป')) { $rDrug = $r }
    if ($x.StartsWith('ยอด เวชภัณฑ์มิใช่ยา นำไปใช้เดือนถัดไป')) { $rNon = $r }
    if ($x.Trim() -eq 'ยกมา :') { $rCarry = $r }
  }
  if (-not ($rDrug -and $rNon -and $rCarry)) { throw "หาแถวสรุปไม่ครบ drug=$rDrug non=$rNon carry=$rCarry" }
  $h = $rCarry + 2; $b1 = $h + 1; $b2 = $h + 2; $b3 = $h + 3
  $blank = $shM.Range("X$($h):AF$($b3)")
  if ($xl.WorksheetFunction.CountA($blank) -ne 0) { throw "แถว $h-$b3 ไม่ว่าง" }
  Say "สรุป: ยา=$rDrug มิใช่ยา=$rNon ยกมา=$rCarry → บล็อกใหม่ $h-$b3"

  $sumDrug = 'Master[ชนิด],"<>เวชภัณฑ์มิใช่ยา",Master[ชนิด],"<>Herb_สสจ"'
  $sumNon  = 'Master[ชนิด],"เวชภัณฑ์มิใช่ยา"'
  $chk = { param($r, $b) "=IF(ROUND(AC$r+AA$r+Z$b+AA$b-Z$r-Y$b-AB$b-AB$r,2)=0,""✅ ถูกต้อง"",""❌ ยอดดิฟ ""&TEXT(AC$r+AA$r+Z$b+AA$b-Z$r-Y$b-AB$b-AB$r,""#,##0.00""))" }

  if ($Mode -eq 'commit') {
    $xl.AutoCorrect.AutoFillFormulasInLists = $true
    $names = 'ปริมาณให้ยืมออก','ปริมาณคืนออก','มูลค่าให้ยืมออก','มูลค่าคืนออก','มูลค่ารับคืนและยืมเข้า'
    $forms = $fAY, $fAZ, $fBA, $fBB, $fBC
    for ($k = 0; $k -lt 5; $k++) {
      $lc = $loM.ListColumns.Add()
      $lc.Name = $names[$k]
      $lc.DataBodyRange.Formula = $forms[$k]
      if ($k -ge 2) { $lc.DataBodyRange.NumberFormat = '#,##0.00' }
    }
    $loM.ListColumns.Item(26).DataBodyRange.Formula = $fZn
    $loM.ListColumns.Item(28).DataBodyRange.Formula = $fABn

    $vd = $newD.DataBodyRange.Validation
    $vd.Delete()
    $vd.Add(3, 1, 1, 'เบิกใช้,ให้ยืมออก,คืนยาที่ยืมมา') | Out-Null
    $vd.IgnoreBlank = $true

    $shM.Range("X$h").Value2 = 'ยืม-คืนยา ต.ค.69 (มูลค่า จากคอลัมน์ BA–BC)'
    $shM.Range("Y$h").Value2 = 'ให้ยืมออก'; $shM.Range("Z$h").Value2 = 'รับคืน'
    $shM.Range("AA$h").Value2 = 'ยืมเข้า';  $shM.Range("AB$h").Value2 = 'คืนออก'
    foreach ($pair in @(@($b1, 'ยา:', $sumDrug), @($b2, 'เวชภัณฑ์มิใช่ยา:', $sumNon))) {
      $rr = $pair[0]; $crit = $pair[2]
      $shM.Range("X$rr").Value2 = $pair[1]
      $shM.Range("Y$rr").Formula  = "=SUMIFS(Master[มูลค่าให้ยืมออก],$crit)"
      $shM.Range("Z$rr").Formula  = "=SUMIFS(Master[มูลค่ารับคืนและยืมเข้า],$crit,Master[ชนิดรายการ],""คืนยา*"")"
      $shM.Range("AA$rr").Formula = "=SUMIFS(Master[มูลค่ารับคืนและยืมเข้า],$crit,Master[ชนิดรายการ],""ยืมยา"")"
      $shM.Range("AB$rr").Formula = "=SUMIFS(Master[มูลค่าคืนออก],$crit)"
      $shM.Range("Y$($rr):AB$($rr)").NumberFormat = '#,##0.00'
    }
    $shM.Range("X$b3").Value2 = 'ยกไป ณ สิ้นงวด ต.ค.69 :'
    $shM.Range("AD$b3").Formula = "=AD$rCarry+Y$b1+Y$b2-Z$b1-Z$b2"
    $shM.Range("AE$b3").Formula = "=AE$rCarry+AA$b1+AA$b2-AB$b1-AB$b2"
    $shM.Range("AD$($b3):AE$($b3)").NumberFormat = '#,##0.00'
    $shM.Range("AD$rDrug").Formula = (& $chk $rDrug $b1)
    $shM.Range("AD$rNon").Formula  = (& $chk $rNon $b2)

    $xl.Calculate()

    # ---- ด่านตรวจ ----
    $fail = @()
    $after = @{}; foreach ($c in 'U','AA','Z','AB','AQ','AR') { $after[$c] = Col $c }
    $AY = Col 'AY'; $AZ = Col 'AZ'; $BA = Col 'BA'; $BB = Col 'BB'; $BC = Col 'BC'
    $n = $last - $first + 1
    foreach ($c in 'U','AA','AQ','AR') {
      for ($i = 1; $i -le $n; $i++) { if ([string]$before[$c][$i, 1] -ne [string]$after[$c][$i, 1]) { $fail += "$c$($first + $i - 1) เปลี่ยน ($($before[$c][$i,1]) → $($after[$c][$i,1]))"; break } }
    }
    [double]$sZ0 = 0; [double]$sZ1 = 0
    $zRows = @(); $abRows = @(); $ayRows = @(); $azRows = @(); $bcRows = @()
    for ($i = 1; $i -le $n; $i++) {
      $row = $first + $i - 1
      $sZ0 += [double]$before['Z'][$i, 1]
      $sZ1 += [double]$after['Z'][$i, 1] + [double]$BA[$i, 1] + [double]$BB[$i, 1]
      [double]$dz = [double]$before['Z'][$i, 1] - [double]$after['Z'][$i, 1]
      [double]$dab = [double]$after['AB'][$i, 1] - [double]$before['AB'][$i, 1]
      if ([math]::Abs($dz) -gt 0.005) { $zRows += $row }
      if ([math]::Abs($dab) -gt 0.005) { $abRows += "$row($($before['K'][$i,1]) $dab)" }
      if ([double]$AY[$i, 1] -ne 0) { $ayRows += "$row(lot $($before['K'][$i,1]) qty $($AY[$i,1]) ฿$($BA[$i,1]))" }
      if ([double]$AZ[$i, 1] -ne 0) { $azRows += "$row(lot $($before['K'][$i,1]) qty $($AZ[$i,1]) ฿$($BB[$i,1]))" }
      if ([double]$BC[$i, 1] -ne 0) { $bcRows += "$row(lot $($before['K'][$i,1]) $($before['M'][$i,1]) ฿$($BC[$i,1]))" }
    }
    Say ("ΣZ เดิม {0:N2} · Σ(Z+BA+BB) ใหม่ {1:N2}" -f $sZ0, $sZ1)
    Say "Z เปลี่ยน: $($zRows -join ', ')"
    Say "AB เปลี่ยน: $($abRows -join ', ')"
    Say "AY>0: $($ayRows -join ', ')"; Say "AZ>0: $($azRows -join ', ')"; Say "BC≠0: $($bcRows -join ', ')"
    if ([math]::Abs($sZ0 - $sZ1) -gt 0.02) { $fail += 'ΣZ ไม่เท่ากัน' }
    if ($ayRows.Count -ne 1 -or $ayRows[0] -notmatch 'L690464') { $fail += 'AY ไม่ตรงที่คาด (Losartan L690464 แถวเดียว)' }
    if ($azRows.Count -ne 1 -or $azRows[0] -notmatch 'DFH2234A') { $fail += 'AZ ไม่ตรงที่คาด (Amoxicillin DFH2234A แถวเดียว)' }
    if ($bcRows.Count -ne 1 -or $bcRows[0] -notmatch '7466901') { $fail += 'BC ไม่ตรงที่คาด (Hydroxyzine 7466901 แถวเดียว)' }
    if ($abRows.Count -ne 1 -or $abRows[0] -notmatch '7466901') { $fail += 'AB เปลี่ยนเกินแถว Hydroxyzine' }
    $vDrug = [string]$shM.Range("AD$rDrug").Value2; $vNon = [string]$shM.Range("AD$rNon").Value2
    Say "ตรวจสมการ ยา: $vDrug · มิใช่ยา: $vNon"
    if (-not $vDrug.StartsWith('✅')) { $fail += 'สมการยาไม่ผ่าน' }
    if (-not $vNon.StartsWith('✅')) { $fail += 'สมการมิใช่ยาไม่ผ่าน' }
    $deb = [double]$shM.Range("AD$b3").Value2; $cred = [double]$shM.Range("AE$b3").Value2
    Say ("ลูกหนี้ยกไป {0:N2} · เจ้าหนี้ยกไป {1:N2}" -f $deb, $cred)
    Say ("ยา: ให้ยืม {0:N2} รับคืน {1:N2} ยืมเข้า {2:N2} คืนออก {3:N2} · เบิกใช้ {4:N2} · คงคลัง {5:N2}" -f $shM.Range("Y$b1").Value2, $shM.Range("Z$b1").Value2, $shM.Range("AA$b1").Value2, $shM.Range("AB$b1").Value2, $shM.Range("Z$rDrug").Value2, $shM.Range("AB$rDrug").Value2)
    if ([math]::Abs($deb - 6242) -gt 0.005) { $fail += 'ลูกหนี้ยกไป ≠ 6,242' }
    if ([math]::Abs($cred - 6367.35) -gt 0.005) { $fail += 'เจ้าหนี้ยกไป ≠ 6,367.35' }
    $nTag = $xl.WorksheetFunction.CountA($newD.DataBodyRange)
    if ($nTag -ne 21) { $fail += "ป้ายในชีทเบิก $nTag แถว (คาด 21)" }

    if ($fail.Count -gt 0) { Say "❌ ไม่ผ่าน — ไม่ Save:"; $fail | ForEach-Object { Say "  - $_" } }
    else {
      $xl.Calculation = -4105
      $xl.Calculate()
      $xl.EnableEvents = $true
      $xl.AutoCorrect.AutoFillFormulasInLists = $autoFillPrev
      $wbk.Save(); $saved = $true
      Say '✅ ผ่านทุกด่าน — Save แล้ว'
    }
  } else { Say 'DRY-RUN — ไม่ได้เขียนอะไร' }
}
catch { Say "ERROR: $($_.Exception.Message) @ $($_.InvocationInfo.ScriptLineNumber)" }
finally {
  if ($xl) {
    try { $xl.EnableEvents = $true; if ($null -ne $autoFillPrev) { $xl.AutoCorrect.AutoFillFormulasInLists = $autoFillPrev } } catch {}
    if ($wbk) { try { $wbk.Close($false) } catch {} }
    try { $xl.Quit() } catch {}
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  Say "saved=$saved"
}
