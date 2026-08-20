$ErrorActionPreference = 'Stop'

$appRoot = Split-Path -Parent $PSScriptRoot
$appHome = Split-Path -Parent $appRoot
$serverScript = Join-Path $appRoot 'server\windows-archive.js'
$studyDataName = -join ([char[]](0x5B66, 0x4E60, 0x6570, 0x636E))
$archiveName = 'Windows' + (-join ([char[]](0x5F52, 0x6863)))
$dataDirectory = Join-Path (Join-Path $appHome $studyDataName) $archiveName
$nodeCandidates = @(@(
  'D:\Program Files\nodejs\node.exe',
  'C:\Program Files\nodejs\node.exe',
  (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) })

if (-not (Test-Path -LiteralPath $serverScript)) { throw "Archive server is missing: $serverScript" }
if (-not $nodeCandidates.Count) { throw 'Node.js was not found.' }

$env:VSR_ARCHIVE_PORT = '43110'
$env:VSR_ARCHIVE_HOST = '0.0.0.0'
$env:VSR_ARCHIVE_DATA_DIR = $dataDirectory
New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
& $nodeCandidates[0] $serverScript
