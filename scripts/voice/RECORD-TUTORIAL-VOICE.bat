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

REM Any voice-ref.* will do - the script converts and trims it itself.
set REF=
for %%E in (wav m4a mp3 aac flac ogg mp4 mov) do (
  if exist "%~dp0voice-ref.%%E" if not defined REF set REF=%~dp0voice-ref.%%E
  if exist "%~dp0voice-ref-raw.%%E" if not defined REF set REF=%~dp0voice-ref-raw.%%E
)
if not defined REF (
  echo STOP: there is no voice clip in this folder.
  echo STOP: no voice-ref.* found >> "%LOG%"
  echo.
  echo Either double-click GET-VOICE-CLIP.bat to pull yours down from
  echo Descript, or record 15-20 seconds of yourself talking normally and
  echo save it here as voice-ref.wav ^(m4a and mp3 are fine too^).
  echo.
  pause
  exit /b 2
)
echo Using: %REF%
echo Using: %REF% >> "%LOG%"

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

  REM --- NVIDIA card? Install the CUDA build of torch FIRST, so the plain
  REM --- CPU wheel never gets pulled in as a dependency. This is the single
  REM --- biggest speed difference available: minutes instead of an hour.
  where nvidia-smi >nul 2>&1
  if errorlevel 1 (
    echo No NVIDIA GPU detected - running on CPU. Expect roughly an hour.
    echo no nvidia-smi, CPU path >> "%LOG%"
  ) else (
    echo NVIDIA GPU detected - installing the CUDA build of PyTorch.
    echo nvidia-smi found, installing CUDA torch >> "%LOG%"
    "%~dp0venv\Scripts\python.exe" -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124 >> "%LOG%" 2>&1
    if errorlevel 1 (
      echo CUDA build failed, carrying on with the CPU build. >> "%LOG%"
      echo   CUDA build unavailable - falling back to CPU. Still works, just slower.
    )
  )

  "%~dp0venv\Scripts\python.exe" -m pip install chatterbox-tts >> "%LOG%" 2>&1
  if errorlevel 1 goto failed
  REM A real ffmpeg as a pip wheel - decodes the m4a Descript exports without
  REM asking him to install anything or touch PATH.
  "%~dp0venv\Scripts\python.exe" -m pip install imageio-ffmpeg >> "%LOG%" 2>&1
)

echo Generating. On a CPU this takes a while - it is about 21 minutes of
echo speech. You can close the window and re-run; it resumes.
echo.
"%~dp0venv\Scripts\python.exe" "%~dp0generate-narration.py" --ref "%REF%" --out "%~dp0narration" 2>&1 | "%~dp0venv\Scripts\python.exe" -c "import sys;f=open(r'%LOG%','a',encoding='utf-8',errors='replace');[ (sys.stdout.write(l), f.write(l), f.flush()) for l in sys.stdin ]"

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
