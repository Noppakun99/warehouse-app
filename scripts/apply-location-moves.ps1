# ลงใบแจ้งย้ายที่เก็บลง Master D/E (+ ชีท list) — ใช้ผ่าน skill /apply-location-moves เท่านั้น
# StockPath ต้องเป็นสำเนาใน scratchpad (ห้ามไฟล์ใน OneDrive — AutoSave) · PlanPath = ผลจาก location-moves.mjs --plan
# ด่าน: แถวต้องมีรหัสตรง + ที่เก็บปัจจุบันตรงค่าเดิมของใบ (เทียบแบบเซ็ต) · U ไม่เปลี่ยน · แถวสรุปไม่มี "ไม่ถูกต้อง" — ไม่ผ่าน = ไม่ Save
param([string]$StockPath, [string]$PlanPath, [string]$LogPath)
$ErrorActionPreference = 'Stop'
$log = New-Object System.Collections.Generic.List[string]
function Say([string]$m) { $log.Add($m); $log | Out-File -FilePath $LogPath -Encoding utf8 }
function Put($rng, $v) {
  for ($try = 0; $try -lt 10; $try++) { try { $rng.Value2 = $v; return } catch {}; try { $rng.Value = $v; return } catch {}; Start-Sleep -Milliseconds 500 }
  throw "cannot write $($rng.Address())"
}
function Get-LocSet([string]$s) { return ((($s -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -ne '-' } | Sort-Object -Unique) -join '|') }

$plan = Get-Content -Path $PlanPath -Raw -Encoding UTF8 | ConvertFrom-Json
$xl = New-Object -ComObject Excel.Application
try {
  $xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.ScreenUpdating = $false
  $xl.AutomationSecurity = 3; $xl.EnableEvents = $false
  $blank = $xl.Workbooks.Add(); $xl.Calculation = -4135
  $wb = $xl.Workbooks.Open($StockPath, 0); $ws = $wb.Worksheets.Item('Master'); $wl = $wb.Worksheets.Item('list')
  $jobs = @()
  foreach ($m in $plan.moves) { foreach ($r in $m.rows) { $jobs += @{ sh = $ws; row = [int]$r; code = "$($m.code)"; from = "$($m.from)"; to = "$($m.to)"; main = "$($m.main)"; tag = "#$($m.id) lot $($m.lot)" } } }
  foreach ($l in $plan.list) { $jobs += @{ sh = $wl; row = [int]$l.row; code = "$($l.code)"; from = "$($l.from)"; to = "$($l.to)"; main = "$($l.main)"; tag = 'list' } }
  if ($jobs.Count -eq 0) { throw 'no rows to write' }
  $u0 = @{}
  foreach ($j in $jobs) {
    $r = $j.row; $c = "$($j.sh.Range("F$r").Value2)".Trim(); $e = "$($j.sh.Range("E$r").Value2)"
    if ($c -ne $j.code) { throw "$($j.sh.Name)!F$r code [$c] != [$($j.code)]" }
    if ((Get-LocSet $e) -ne (Get-LocSet $j.from)) { throw "$($j.sh.Name)!E$r [$e] != from [$($j.from)] - Excel changed, stop" }
    foreach ($col in 'D','E') { if ($j.sh.Range("$col$r").HasFormula) { throw "$($j.sh.Name)!$col$r is formula" } }
    if ($j.sh.Name -eq 'Master') { $u0[$r] = [double]$ws.Range("U$r").Value2 }
  }
  foreach ($j in $jobs) {
    $r = $j.row; $d0 = "$($j.sh.Range("D$r").Value2)"; $e0 = "$($j.sh.Range("E$r").Value2)"
    if ($j.main) { Put $j.sh.Range("D$r") $j.main }
    Put $j.sh.Range("E$r") $j.to
    Say "$($j.sh.Name)!D$r/E$r $($j.tag) [$d0|$e0] -> [$($j.sh.Range("D$r").Value2)|$($j.sh.Range("E$r").Value2)]"
  }
  $xl.Calculation = -4105; $xl.Calculate()
  $fail = @()
  foreach ($k in $u0.Keys) { $u1 = [double]$ws.Range("U$k").Value2; if ($u1 -ne $u0[$k]) { $fail += "U$k $($u0[$k])->$u1" } }
  $u = $ws.UsedRange; $last = $u.Row + $u.Rows.Count - 1
  $x = $ws.Range("X1:X$last").Value2
  for ($i = 1; $i -le $last; $i++) { $t = "$($x[$i,1])"; if ($t -match ':\s*$' -and $t.Length -lt 120) { $vals = @(); foreach ($c in 'Y','Z','AA','AB','AC','AD') { $vals += "$($ws.Range("$c$i").Value2)" }; Say "sum $t $($vals -join ' | ')"; if (($vals -join ' ') -match 'ไม่ถูกต้อง') { $fail += "summary $t" } } }
  if ($fail.Count) { throw "checks failed: $($fail -join ',') - not saved" }
  $wb.Save(); Say "SAVED $($jobs.Count) rows"; $wb.Close($false); $blank.Close($false)
}
catch { Say "ERROR: $($_.Exception.Message) @ line $($_.InvocationInfo.ScriptLineNumber)"; try { foreach ($w in @($xl.Workbooks)) { $w.Close($false) } } catch {} }
finally { try { $xl.Calculation = -4105 } catch {}; $xl.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null; Say 'DONE' }
