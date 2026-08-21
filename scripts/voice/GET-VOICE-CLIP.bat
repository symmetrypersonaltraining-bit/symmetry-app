@echo off
REM ===================================================================
REM  Pull the voice clip down from Descript.
REM
REM  This is the audio of APT_Clip1_The_Problem - 92 seconds of Dustin
REM  narrating, no music. Claude published it from Descript and put the
REM  link in here so there is nothing to find and nothing to trim: the
REM  generator picks the best stretch out of it automatically.
REM
REM  The link is signed and expires 22 Aug 2026, 14:29 UTC. After that
REM  it 403s and Claude has to publish a fresh one - say so and it will.
REM ===================================================================
setlocal
cd /d "%~dp0"

echo Downloading your voice clip from Descript...
curl -L -f -o "%~dp0voice-ref-raw.m4a" "https://production-273614-media-export.storage.googleapis.com/b2d566f3-4606-4d83-85c9-4132f141384d/original.m4a?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=descript-api%%40production-273614.iam.gserviceaccount.com%%2F20260821%%2Fauto%%2Fstorage%%2Fgoog4_request&X-Goog-Date=20260821T142947Z&X-Goog-Expires=86400&X-Goog-SignedHeaders=host&X-Goog-Signature=7430e29db483f8537178b0bd6fc90364360e0266957da8ef987f3a7068fef99166c6a7b78b356afb438a8f2e8ea4b2b2a4fa85fd76bb8503aa9b3cbe1286019595393dea5cd08c2fe7c03d0ca47273b682c1091017266adb555b70f110bde5dd44c9ab9de9524c385c95c55f1fb9c864351c1aee721fb4118a7adb0065e087f560a9673e368ad0b530156d1554c0e3270c43d3391c0c71e2d823c9b88664d07b52de3ce5738abf26fa8c07c5385356e30bc62a2b7be9c695a15e855ef9ff58ee0e2ac9064a7c29c8ef38a94cb809310f02194b562144a0c7891c24f27d08ffa4e7f1122f65200a95f1da69baae53d932e4044559ca674f1d06e91e8b2d7e5694"

if errorlevel 1 (
  echo.
  echo Download failed. Most likely the link expired - tell Claude and
  echo it will publish a new one. Nothing else is wrong.
  echo.
  pause
  exit /b 1
)

for %%A in ("%~dp0voice-ref-raw.m4a") do set SZ=%%~zA
if "%SZ%"=="0" (
  echo Downloaded an empty file. Tell Claude.
  del "%~dp0voice-ref-raw.m4a"
  pause
  exit /b 1
)

echo.
echo Got it: voice-ref-raw.m4a (%SZ% bytes)
echo.
echo Now double-click RECORD-TUTORIAL-VOICE.bat
echo.
pause
