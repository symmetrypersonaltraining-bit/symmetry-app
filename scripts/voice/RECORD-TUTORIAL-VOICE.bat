@echo off
REM ===================================================================
REM  Narrate the tutorial in Dustin's voice.
REM
REM  Double-click this. It sets everything up the first time and picks
REM  up where it left off every time after.
REM
REM  BEFORE YOU RUN IT, one thing must exist next to this file:
REM     voice-ref.wav   - 15 to 20 seconds of you talking normally.
REM                       Quiet room, no music, no gym noise. Phone
REM                       voice memo exported to .wav is fine.
REM
REM  Everything it does is written to voice-log.txt in this folder,
REM  including any crash, so nothing is lost when the window closes.
REM ===================================================================
setlocal
cd /d "%~dp0"

set LOG=%~dp0voice-log.txt
echo. >> "%LOG%"
echo ================ run started %DATE% %TIME% ================ >> "%LOG%"

echo Symmetry - tutorial narration
echo Log: %LOG%
echo.

if not exist "%~dp0voice-ref.wav" (
  echo STOP: voice-ref.wav is not in this folder.
  echo STOP: voice-ref.wav is not in this folder. >> "%LOG%"
  echo.
  echo Record 15-20 seconds of yourself talking normally, save it as
  echo    %~dp0voice-ref.wav
  echo and run this again.
  echo.
  pause
  exit /b 2
)

REM --- Python ---
where py >nul 2>&1
if errorlevel 1 (
  echo STOP: Python is not installed. Get it from python.org, tick
  echo "Add python.exe to PATH" during setup, then run this again.
  echo STOP: python not found >> "%LOG%"
  pause
  exit /b 2
)

REM --- one-time virtual environment, kept next to this script ---
if not exist "%~dp0venv\Scripts\python.exe" (
  echo First run: creating the environment. This downloads about 2 GB and
  echo takes a few minutes. It only happens once.
  echo creating venv >> "%LOG%"
  py -3 -m venv "%~dp0venv" >> "%LOG%" 2>&1
  if errorlevel 1 goto failed
  "%~dp0venv\Scripts\python.exe" -m pip install --upgrade pip >> "%LOG%" 2>&1
  "%~dp0venv\Scripts\python.exe" -m pip install chatterbox-tts >> "%LOG%" 2>&1
  if errorlevel 1 goto failed
)

echo Generating. On a CPU this takes a while - it is about 21 minutes of
echo speech. You can close the window and re-run; it resumes.
echo.
"%~dp0venv\Scripts\python.exe" "%~dp0generate-narration.py" --ref "%~dp0voice-ref.wav" --out "%~dp0narration" 2>&1 | "%~dp0venv\Scripts\python.exe" -c "import sys;f=open(r'%LOG%','a',encoding='utf-8',errors='replace');[ (sys.stdout.write(l), f.write(l), f.flush()) for l in sys.stdin ]"

if errorlevel 1 goto failed
echo.
echo Finished. The wav files are in: %~dp0narration
echo Tell Claude it is done.
pause
exit /b 0

:failed
echo.
echo Something went wrong. The details are in:
echo    %LOG%
echo Send that file to Claude.
echo run FAILED >> "%LOG%"
pause
exit /b 1
