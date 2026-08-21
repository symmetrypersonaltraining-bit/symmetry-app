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

REM ---------------------------------------------------------------
REM  REPAIR STEP - runs every time, not just on first install.
REM
REM  perth (the watermarker chatterbox constructs unguarded) does
REM  `from pkg_resources import resource_filename`, and setuptools
REM  DELETED pkg_resources in v81. A fresh venv gets setuptools 84,
REM  so perth.PerthImplicitWatermarker silently becomes None and
REM  chatterbox dies with "'NoneType' object is not callable" - after
REM  a 23-minute model download.
REM
REM  Pinning below 81 is the whole fix. It is out here rather than in
REM  the first-run block because the venv that already exists on this
REM  machine is the broken one.
REM ---------------------------------------------------------------
"%~dp0venv\Scripts\python.exe" -c "import perth,sys; sys.exit(0 if getattr(perth,'PerthImplicitWatermarker',None) else 1)" >nul 2>&1
if errorlevel 1 (
  echo Repairing the watermarker dependency ^(setuptools ^< 81^)...
  echo repairing setuptools for perth >> "%LOG%"
  "%~dp0venv\Scripts\python.exe" -m pip install "setuptools<81" >> "%LOG%" 2>&1
)

echo Generating. On a CPU this takes a while - it is about 21 minutes of
echo speech. You can close the window and re-run; it resumes.
echo The models are already downloaded, so this starts straight away.
echo.
REM NO PIPE HERE, deliberately.
REM
REM This used to pipe into a tee so the log got a copy. In a cmd pipeline
REM `errorlevel` is the LAST command's, i.e. the tee's - which is always 0. So
REM when the run crashed, the check below passed and the window cheerfully
REM printed "Finished. The wav files are in ..." directly underneath the
REM traceback. The script said it worked when it had not.
REM
REM generate-narration.py writes the log itself now, so there is nothing to tee
REM and this errorlevel is the real one.
"%~dp0venv\Scripts\python.exe" -u "%~dp0generate-narration.py" --ref "%REF%" --out "%~dp0narration" --log "%LOG%"

if errorlevel 1 goto failed
for /f %%C in ('dir /b "%~dp0narration\*.wav" 2^>nul ^| find /c /v ""') do set MADE=%%C
echo.
if "%MADE%"=="0" (
  echo It exited cleanly but produced no audio. Send Claude voice-log.txt.
  pause
  exit /b 1
)
echo Finished. %MADE% recordings are in: %~dp0narration
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
