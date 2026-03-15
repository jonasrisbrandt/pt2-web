param()

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$vendorRoot = Join-Path $projectRoot 'vendor\p2-clone'
$outDir = Join-Path $projectRoot 'src\wasm'

if (-not (Get-Command emcc -ErrorAction SilentlyContinue)) {
  throw "Emscripten compiler 'emcc' was not found in PATH."
}

if (-not (Test-Path (Join-Path $vendorRoot 'src\pt2_main.c'))) {
  throw "Vendored p2-clone source is missing. Run scripts\\sync-upstream.ps1 first."
}

New-Item -ItemType Directory -Force $outDir | Out-Null

Push-Location $projectRoot
try {
  $sources = @(
    (Get-ChildItem 'vendor\p2-clone\src' -Filter *.c -File | ForEach-Object { Resolve-Path -Relative $_.FullName })
    (Get-ChildItem 'vendor\p2-clone\src\modloaders' -Filter *.c -File | ForEach-Object { Resolve-Path -Relative $_.FullName })
    (Get-ChildItem 'vendor\p2-clone\src\smploaders' -Filter *.c -File | ForEach-Object { Resolve-Path -Relative $_.FullName })
    (Get-ChildItem 'vendor\p2-clone\src\gfx' -Filter *.c -File | ForEach-Object { Resolve-Path -Relative $_.FullName })
  )

  $sources = $sources | Where-Object { $_ -notmatch 'bmp2pth\.c$' }

  $outputJs = 'src/wasm/pt2clone.js'
  $preloadConfig = 'vendor/p2-clone/release/other/protracker.ini@/protracker.ini'

  $emccArgs = @()
  $emccArgs += $sources
  $emccArgs += @(
    '-O3'
    '-sUSE_SDL=2'
    '-pthread'
    '-sPTHREAD_POOL_SIZE=4'
    '-sASYNCIFY'
    '-sALLOW_MEMORY_GROWTH=1'
    '-sSTACK_SIZE=1048576'
    '-sMODULARIZE=1'
    '-sEXPORT_ES6=1'
    '-sEXPORT_NAME=createPt2Module'
    '-sENVIRONMENT=web'
    '-sFORCE_FILESYSTEM=1'
    "-sEXPORTED_RUNTIME_METHODS=['FS','ccall','callMain']"
    "-sEXPORTED_FUNCTIONS=['_main','_malloc','_free','_pt2_web_load_file_from_path','_pt2_web_engine_boot','_pt2_web_engine_load_module','_pt2_web_engine_save_module','_pt2_web_engine_load_sample','_pt2_web_engine_save_sample','_pt2_web_engine_new_song','_pt2_web_engine_set_title','_pt2_web_engine_set_position','_pt2_web_engine_set_bpm','_pt2_web_engine_set_speed','_pt2_web_engine_set_pattern','_pt2_web_engine_adjust_song_length','_pt2_web_engine_set_edit_mode','_pt2_web_engine_toggle_mute_channel','_pt2_web_engine_set_cursor','_pt2_web_engine_move_cursor','_pt2_web_engine_set_cell','_pt2_web_engine_clear_cell','_pt2_web_engine_select_sample','_pt2_web_engine_update_sample','_pt2_web_engine_open_sample_editor','_pt2_web_engine_close_sample_editor','_pt2_web_engine_sample_show_all','_pt2_web_engine_sample_show_selection','_pt2_web_engine_sample_zoom_in','_pt2_web_engine_sample_zoom_out','_pt2_web_engine_sample_set_view','_pt2_web_engine_sample_set_selection','_pt2_web_engine_sample_set_loop','_pt2_web_engine_sample_toggle_loop','_pt2_web_engine_sample_crop','_pt2_web_engine_sample_cut','_pt2_web_engine_sample_play','_pt2_web_engine_preview_note','_pt2_web_engine_preview_note_stop','_pt2_web_engine_transport_play_song','_pt2_web_engine_transport_play_pattern','_pt2_web_engine_transport_pause','_pt2_web_engine_transport_stop','_pt2_web_engine_toggle_stereo','_pt2_web_engine_refresh_layout','_pt2_web_engine_pointer_move','_pt2_web_engine_pointer_button','_pt2_web_engine_key_down','_pt2_web_engine_key_up','_pt2_web_engine_text_input','_pt2_web_engine_scope_buffer','_pt2_web_engine_scope_buffer_length','_pt2_web_engine_sample_buffer','_pt2_web_engine_sample_buffer_length','_pt2_web_engine_scope_json','_pt2_web_engine_snapshot_json']"
    '-lidbfs.js'
    '--preload-file'
    $preloadConfig
    '-I'
    'vendor/p2-clone/src'
    '-o'
    $outputJs
  )

  & emcc @emccArgs

  if ($LASTEXITCODE -ne 0) {
    throw 'The emcc build failed.'
  }
} finally {
  Pop-Location
}
