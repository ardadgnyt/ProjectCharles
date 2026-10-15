$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$gpu=@{};$gpuAvailable=$false
try {
 $counters=Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction Stop
 foreach($c in $counters){if($c.Name -match 'pid_(\d+)_'){ $processKey=$Matches[1];$gpu[$processKey]=[Math]::Max([double]$gpu[$processKey],[double]$c.UtilizationPercentage) }}
 $gpuAvailable=$true
}catch{}
$items=@(Get-Process | ForEach-Object {try{[pscustomobject]@{id=$_.Id;name=$_.ProcessName;start=$_.StartTime.Ticks.ToString();cpu=[double]$_.CPU;ram=[Math]::Round($_.WorkingSet64/1MB,2);gpu=$(if($gpuAvailable){[double]$gpu[[string]$_.Id]}else{$null})}}catch{}})
[Console]::WriteLine((@{gpuAvailable=$gpuAvailable;items=$items} | ConvertTo-Json -Depth 4 -Compress))
