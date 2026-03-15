param(
  [string]$SourceRoot = 'C:\SourceCode\Amiga\projects\external_repos\p2-clone'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$vendorRoot = Join-Path $projectRoot 'vendor\p2-clone'

if (-not (Test-Path $SourceRoot)) {
  throw "Upstream-katalogen hittades inte: $SourceRoot"
}

New-Item -ItemType Directory -Force $vendorRoot | Out-Null

Copy-Item -Recurse -Force (Join-Path $SourceRoot 'src') (Join-Path $vendorRoot 'src')
Copy-Item -Recurse -Force (Join-Path $SourceRoot 'release\other') (Join-Path $vendorRoot 'release\other')
Copy-Item -Force (Join-Path $SourceRoot 'LICENSE') (Join-Path $vendorRoot 'LICENSE')
Copy-Item -Force (Join-Path $SourceRoot 'README.md') (Join-Path $vendorRoot 'README.md')
