param()

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$nativeRoot = Join-Path $projectRoot 'native\synth-core'
$outDir = Join-Path $projectRoot 'public\wasm-synth'

if (-not (Get-Command emcc -ErrorAction SilentlyContinue)) {
  throw "Emscripten compiler 'emcc' was not found in PATH."
}

if (-not (Test-Path (Join-Path $nativeRoot 'synthcore.c'))) {
  throw "Synth core source is missing from native\\synth-core."
}

New-Item -ItemType Directory -Force $outDir | Out-Null

function Invoke-SynthEmccBuild {
  param(
    [Parameter(Mandatory = $true)]
    [string]$OptimizationLevel
  )

  $tempBaseName = "synthcore-build$($OptimizationLevel.Replace('-', '_'))"
  $outputJs = "public/wasm-synth/$tempBaseName.js"
  $outputWasm = "public/wasm-synth/$tempBaseName.wasm"
  $sourceFiles = Get-ChildItem 'native/synth-core' -Filter '*.c' | Sort-Object Name | ForEach-Object {
    (Join-Path 'native/synth-core' $_.Name).Replace('\', '/')
  }

  $emccArgs = @()
  $emccArgs += $sourceFiles
  $emccArgs += @(
    $OptimizationLevel
    '-sALLOW_MEMORY_GROWTH=1'
    '-sSTACK_SIZE=1048576'
    '-sMODULARIZE=1'
    '-sEXPORT_ES6=1'
    '-sEXPORT_NAME=createSynthCoreModule'
    '-sENVIRONMENT=web'
    '-sEXPORT_ALL=1'
    "-sEXPORTED_RUNTIME_METHODS=['ccall']"
    "-sEXPORTED_FUNCTIONS=['_malloc','_free','_pt2_synth_boot','_pt2_synth_reset','_pt2_synth_set_synth','_pt2_synth_set_param','_pt2_synth_set_bpm','_pt2_synth_note_on','_pt2_synth_note_off','_pt2_synth_panic','_pt2_synth_render_preview','_pt2_synth_preview_buffer','_pt2_synth_preview_buffer_length','_pt2_synth_render_sample','_pt2_synth_sample_buffer','_pt2_synth_sample_buffer_length','_pt2_synth_telemetry_buffer','_pt2_synth_telemetry_buffer_length']"
    '-o'
    $outputJs
  )

  $buildOutput = @()
  try {
    $buildOutput = & emcc @emccArgs 2>&1
  } catch {
    $buildOutput = @($_ | Out-String)
  }
  $exitCode = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } else { 1 }

  foreach ($line in $buildOutput) {
    Write-Host $line
  }

  return [PSCustomObject]@{
    ExitCode = $exitCode
    Output = ($buildOutput -join [Environment]::NewLine)
    OptimizationLevel = $OptimizationLevel
    OutputJs = $outputJs
    OutputWasm = $outputWasm
  }
}

function Test-IsBinaryenPolicyBlock {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BuildOutput
  )

  return $BuildOutput -match 'wasm-opt' -and (
    $BuildOutput -match 'WinError 4551' -or
    $BuildOutput -match 'is blocked by policy' -or
    $BuildOutput -match 'The file cannot be accessed by the system'
  )
}

function Test-IsObjcopyPolicyBlock {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BuildOutput
  )

  return $BuildOutput -match 'llvm-objcopy' -and (
    $BuildOutput -match 'WinError 4551' -or
    $BuildOutput -match 'blocked this file' -or
    $BuildOutput -match 'is blocked by policy'
  )
}

function Publish-SynthArtifacts {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceJs,
    [Parameter(Mandatory = $true)]
    [string]$SourceWasm
  )

  $targetJs = Join-Path $projectRoot 'public\wasm-synth\synthcore.js'
  $targetWasm = Join-Path $projectRoot 'public\wasm-synth\synthcore.wasm'

  if (-not (Test-Path $SourceJs)) {
    if (Test-Path $targetJs) {
      $SourceJs = $targetJs
    } else {
      throw 'Expected synth wasm loader artifact was not produced.'
    }
  }

  if (-not (Test-Path $SourceWasm)) {
    throw 'Expected synth wasm build artifacts were not produced.'
  }

  if ((Resolve-Path $SourceJs).Path -ne (Resolve-Path $targetJs).Path) {
    Copy-Item -LiteralPath $SourceJs -Destination $targetJs -Force
  }
  Copy-Item -LiteralPath $SourceWasm -Destination $targetWasm -Force
}

Push-Location $projectRoot
try {
  $preferredBuild = Invoke-SynthEmccBuild -OptimizationLevel '-O3'

  if ($preferredBuild.ExitCode -eq 0) {
    Publish-SynthArtifacts -SourceJs (Join-Path $projectRoot $preferredBuild.OutputJs) -SourceWasm (Join-Path $projectRoot $preferredBuild.OutputWasm)
    Write-Host 'Synth wasm build completed with release optimization (-O3).'
    return
  }

  if (Test-IsObjcopyPolicyBlock -BuildOutput $preferredBuild.Output) {
    Publish-SynthArtifacts -SourceJs (Join-Path $projectRoot $preferredBuild.OutputJs) -SourceWasm (Join-Path $projectRoot $preferredBuild.OutputWasm)
    Write-Warning 'Synth wasm build completed with release optimization (-O3), but final section stripping was blocked by local policy. Published the unstripped wasm artifacts instead.'
    return
  }

  if (-not (Test-IsBinaryenPolicyBlock -BuildOutput $preferredBuild.Output)) {
    throw 'The synth emcc build failed.'
  }

  Write-Warning 'Binaryen post-link optimization was blocked by local policy. Retrying synth wasm build with -O1 to produce usable synced wasm artifacts.'
  $fallbackBuild = Invoke-SynthEmccBuild -OptimizationLevel '-O1'

  if ($fallbackBuild.ExitCode -eq 0) {
    Publish-SynthArtifacts -SourceJs (Join-Path $projectRoot $fallbackBuild.OutputJs) -SourceWasm (Join-Path $projectRoot $fallbackBuild.OutputWasm)
    Write-Warning 'Synth wasm build completed with fallback optimization (-O1). Release-level Binaryen optimization is still unavailable on this machine.'
    return
  }

  if (Test-IsObjcopyPolicyBlock -BuildOutput $fallbackBuild.Output) {
    Publish-SynthArtifacts -SourceJs (Join-Path $projectRoot $fallbackBuild.OutputJs) -SourceWasm (Join-Path $projectRoot $fallbackBuild.OutputWasm)
    Write-Warning 'Synth wasm build completed with fallback optimization (-O1), but final section stripping was blocked by local policy. Published the unstripped wasm artifacts instead.'
    return
  }

  if ($fallbackBuild.ExitCode -ne 0) {
    throw 'The synth emcc build failed.'
  }
} finally {
  Pop-Location
}
