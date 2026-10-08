$ErrorActionPreference = 'Stop'
$localDbRoot = Join-Path $env:LOCALAPPDATA 'EnerTrade\PostgreSQL17'
$localDbExecutable = Join-Path $localDbRoot 'pgsql\bin\postgres.exe'
$localDbData = Join-Path $localDbRoot 'data'
$localDbPort = 55433
$localDbVersionFile = Join-Path $localDbData 'PG_VERSION'

if (!(Test-Path -LiteralPath $localDbExecutable -PathType Leaf)) { throw 'PostgreSQL local no está instalado. Consulta docs/desarrollo/postgresql-local.md.' }
if (!(Test-Path -LiteralPath $localDbVersionFile -PathType Leaf)) { throw 'No existe el cluster local esperado; no se inicializa ni se crea uno automáticamente.' }
if ([IO.File]::ReadAllText($localDbVersionFile).Trim() -ne '17') { throw 'El data directory local no corresponde a PostgreSQL 17.' }
$serverVersion = (& $localDbExecutable --version 2>$null | Select-Object -Last 1).ToString()
if ($LASTEXITCODE -ne 0 -or $serverVersion -notmatch '\(PostgreSQL\) 17\.') { throw 'El ejecutable PostgreSQL local no corresponde a la versión 17 del cluster.' }

$configuredPort = (& $localDbExecutable -D $localDbData -C port 2>$null | Select-Object -Last 1).ToString().Trim()
if ($LASTEXITCODE -ne 0 -or $configuredPort -ne [string]$localDbPort) { throw 'La configuración PostgreSQL local no corresponde al puerto esperado.' }
$configuredAddresses = (& $localDbExecutable -D $localDbData -C listen_addresses 2>$null | Select-Object -Last 1).ToString().Trim().Trim("'")
if ($LASTEXITCODE -ne 0) { throw 'No se pudo validar la configuración de escucha PostgreSQL local.' }
$listenAddresses = @($configuredAddresses.Split(',') | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
if (!$listenAddresses.Count -or @($listenAddresses | Where-Object { $_ -notin @('localhost', '127.0.0.1', '::1') }).Count) { throw 'PostgreSQL local debe escuchar solo en loopback.' }

$listeners = @(Get-NetTCPConnection -LocalPort $localDbPort -State Listen -ErrorAction Stop)
$listenerProcessIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
if ($listenerProcessIds.Count -gt 0) {
	if ($listenerProcessIds.Count -ne 1) { throw 'El puerto PostgreSQL local tiene propietarios ambiguos.' }
	$listenerAddresses = @($listeners | Select-Object -ExpandProperty LocalAddress -Unique | ForEach-Object { $_.ToString().ToLowerInvariant() })
	if (!$listenerAddresses.Count -or @($listenerAddresses | Where-Object { $_ -notin @('127.0.0.1', '::1') }).Count) { throw 'El listener PostgreSQL no está limitado a direcciones loopback.' }
	$listenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listenerProcessIds[0])"
	if (!$listenerProcess -or !$listenerProcess.ExecutablePath) { throw 'No se pudo verificar el proceso propietario del puerto PostgreSQL local.' }
	$expectedExecutable = [IO.Path]::GetFullPath($localDbExecutable)
	$actualExecutable = [IO.Path]::GetFullPath($listenerProcess.ExecutablePath)
	$expectedDataDirectory = [IO.Path]::GetFullPath($localDbData)
	$commandLine = $listenerProcess.CommandLine.Replace('"', '')
	$dataArgumentPattern = '(?:^|\s)-D\s+' + [regex]::Escape($expectedDataDirectory) + '(?=\s|$)'
	if (![string]::Equals($actualExecutable, $expectedExecutable, [StringComparison]::OrdinalIgnoreCase) -or $commandLine -notmatch $dataArgumentPattern) {
		throw 'El listener del puerto PostgreSQL no es la instancia local esperada; no se continúa.'
	}
	Write-Output 'La instancia PostgreSQL local esperada ya está activa en loopback:55433.'
	return
}

$logTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$localDbProcess = Start-Process -FilePath $localDbExecutable -ArgumentList @('-D', ('"' + $localDbData + '"')) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $localDbRoot "server-output-$logTimestamp.log") -RedirectStandardError (Join-Path $localDbRoot "server-error-$logTimestamp.log") -PassThru
if ($localDbProcess.HasExited) { throw 'El proceso PostgreSQL local terminó al iniciarse.' }
Write-Output 'Solicitud de inicio enviada para la instancia PostgreSQL local en loopback:55433.'
