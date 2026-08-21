#!/usr/bin/env python3
"""
Narrate the tutorial in Dustin's own voice, using Chatterbox (Resemble AI, MIT).

WHY THIS RUNS ON HIS MACHINE AND NOT IN A CLOUD SESSION
-------------------------------------------------------
Chatterbox downloads its model weights from huggingface.co. The cloud sandbox's
egress proxy refuses that host (CONNECT -> 403), and so does every hosted TTS
API tested (Resemble, ElevenLabs, PlayHT, OpenAI, Deepgram). PyPI is reachable;
the weights are not. There is no cloud path. Verified 21 Aug 2026.

WHAT IT DOES
------------
Reads narration-manifest.json (51 lines, ~3,100 words, ~21 minutes of speech),
clones the voice from a single reference clip, and writes one wav per tutorial
step, named by the step id that will carry its audioUrl.

RESUMABLE ON PURPOSE. Twenty-one minutes of audio on a CPU is a long sit. Every
line that already has a wav is skipped, so closing the window costs you the line
in flight and nothing else. Delete a wav to re-record just that line.

USAGE
  python generate-narration.py --ref voice-ref.wav --out narration/
"""

import argparse
import json
import os
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))


_LOG_PATH = None


def log(msg):
    """Print AND append to the log file.

    Python owns the log rather than the .bat piping into a tee. The tee made
    `errorlevel` reflect the tee's exit code instead of this script's, so a
    crashed run printed "Finished. The wav files are in ..." underneath its own
    traceback. Owning the file here means the batch file can test the real exit
    code, and it removes the buffering that froze the log for twenty minutes."""
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    if _LOG_PATH:
        try:
            with open(_LOG_PATH, "a", encoding="utf-8", errors="replace") as f:
                f.write(line + "\n")
        except OSError:
            pass



# ── Turning whatever he gave us into a clean reference clip ─────────────────
#
# The reference is the single biggest determinant of how much the output sounds
# like him, and it is also the step most likely to be done wrong by hand. So it
# is not done by hand.
#
# Descript publishes m4a, phones record m4a or mp3, and Chatterbox wants a short
# clean wav. Rather than make him convert and trim in an editor - and find out
# an hour later that he picked a stretch with a breath in the middle - this
# converts anything, then CHOOSES the best window itself.

def _ffmpeg_exe():
    """A real ffmpeg without asking him to install one.

    imageio-ffmpeg ships a static binary as a pip wheel, so this works on a
    machine that has never seen ffmpeg and needs no PATH surgery."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        import shutil
        return shutil.which("ffmpeg")


def prepare_reference(src, out_wav, want_sec=18.0, sr=24000):
    """Convert `src` to mono wav and keep the best `want_sec` of speech.

    "Best" = the window with the most sustained voice in it: highest median
    energy, penalised for silence and for clipping. That beats "the first 18
    seconds", which in a narrated clip is usually an intro breath and a pause.
    """
    import subprocess, wave, struct, math

    ff = _ffmpeg_exe()
    if not ff:
        raise RuntimeError("no ffmpeg available - pip install imageio-ffmpeg")

    full = out_wav + ".full.wav"
    subprocess.run(
        [ff, "-y", "-i", src, "-ac", "1", "-ar", str(sr), "-vn", full],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )

    with wave.open(full, "rb") as w:
        n = w.getnframes()
        raw = w.readframes(n)
    samples = struct.unpack("<%dh" % (len(raw) // 2), raw)
    total_sec = len(samples) / sr
    log(f"Reference source: {total_sec:.1f}s")

    if total_sec <= want_sec:
        os.replace(full, out_wav)
        log(f"Short enough - using all of it.")
        return out_wav

    # RMS in 100ms frames, then score every candidate window.
    hop = sr // 10
    frames = []
    for i in range(0, len(samples) - hop, hop):
        chunk = samples[i:i + hop]
        frames.append(math.sqrt(sum(s * s for s in chunk) / len(chunk)))
    peak = max(frames) or 1.0
    norm = [f / peak for f in frames]
    silence = 0.06  # below this a frame is a gap, not speech

    win = int(want_sec * 10)
    best_i, best_score = 0, -1.0
    for i in range(0, len(norm) - win):
        w = norm[i:i + win]
        voiced = sum(1 for f in w if f > silence) / win
        level = sum(w) / win
        # Sustained speech, not one loud word next to a long gap.
        score = level * (voiced ** 2)
        if score > best_score:
            best_score, best_i = score, i

    start = int(best_i * hop)
    end = start + int(want_sec * sr)
    picked = samples[start:end]
    log(f"Picked the best {want_sec:.0f}s: {start / sr:.1f}s to {end / sr:.1f}s "
        f"(voiced {sum(1 for f in norm[best_i:best_i + win] if f > silence) / win:.0%})")

    with wave.open(out_wav, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(struct.pack("<%dh" % len(picked), *picked))
    try:
        os.remove(full)
    except OSError:
        pass
    return out_wav


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", required=True, help="10-20s wav of the voice to clone")
    ap.add_argument("--manifest", default=os.path.join(HERE, "narration-manifest.json"))
    ap.add_argument("--out", default=os.path.join(HERE, "narration"))
    ap.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    ap.add_argument("--model", default="auto", choices=["auto", "turbo", "base"],
                    help="auto = Turbo if it loads, otherwise base")
    ap.add_argument("--log", default=None, help="also append everything to this file")
    ap.add_argument("--allow-unwatermarked", action="store_true",
                    help="generate without Resemble's watermark if it will not load")
    ap.add_argument("--only", default=None, help="regenerate a single step id")
    args = ap.parse_args()
    global _LOG_PATH
    _LOG_PATH = args.log

    # Accept whatever is actually sitting in the folder. He should not have to
    # know or care what Descript exported.
    ref = args.ref
    if not os.path.isfile(ref):
        here = os.path.dirname(os.path.abspath(ref)) or HERE
        found = None
        for name in sorted(os.listdir(here)) if os.path.isdir(here) else []:
            if name.lower().startswith("voice-ref") and os.path.splitext(name)[1].lower() in (
                ".wav", ".m4a", ".mp3", ".aac", ".flac", ".ogg", ".mp4", ".mov"
            ):
                found = os.path.join(here, name)
                break
        if not found:
            log(f"STOP: no reference clip at {ref}")
            log("Either run GET-VOICE-CLIP.bat, or record 15-20 seconds of yourself")
            log("talking normally and save it in this folder as voice-ref.wav.")
            return 2
        log(f"Using {os.path.basename(found)}")
        ref = found

    prepared = os.path.join(os.path.dirname(os.path.abspath(ref)), "voice-ref.prepared.wav")
    if os.path.abspath(ref) != os.path.abspath(prepared):
        try:
            prepare_reference(ref, prepared)
            ref = prepared
        except Exception as e:
            # A wav can be used as-is; anything else genuinely cannot.
            if os.path.splitext(ref)[1].lower() == ".wav":
                log(f"Could not trim the reference ({e}) - using it whole.")
            else:
                log(f"STOP: could not convert {os.path.basename(ref)}: {e}")
                return 2
    args.ref = ref
    if not os.path.isfile(args.manifest):
        log(f"STOP: no manifest at {args.manifest}")
        return 2

    with open(args.manifest, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    lines = manifest["lines"]
    if args.only:
        lines = [l for l in lines if l["id"] == args.only]
        if not lines:
            log(f"STOP: no step with id {args.only}")
            return 2

    os.makedirs(args.out, exist_ok=True)

    # PREFLIGHT: the watermarker, before anything expensive.
    #
    # chatterbox calls perth.PerthImplicitWatermarker() unguarded in __init__.
    # perth sets that name to None when its own import fails, and its import
    # DOES fail on a current toolchain: perth/perth_net/__init__.py line 1 is
    # `from pkg_resources import resource_filename`, and setuptools removed
    # pkg_resources in v81. A fresh venv installs setuptools 84, so the failure
    # is the default, not the exception.
    #
    # The result was a TypeError: 'NoneType' object is not callable, thrown
    # AFTER a 23-minute model download. Checking here costs nothing and fails in
    # two seconds with the actual remedy.
    try:
        import perth
        wm_ok = getattr(perth, "PerthImplicitWatermarker", None) is not None
    except Exception as e:
        perth, wm_ok = None, False
        log(f"perth did not import at all: {e}")

    if not wm_ok:
        if args.allow_unwatermarked and perth is not None:
            # perth ships its own no-op. Use THAT rather than a hand-rolled
            # stub: same base class, same method signatures, so nothing
            # downstream can tell the difference except the watermark.
            log("Watermarker unavailable - continuing WITHOUT a watermark (--allow-unwatermarked).")
            perth.PerthImplicitWatermarker = perth.DummyWatermarker
        else:
            log("STOP: the audio watermarker will not load, and chatterbox crashes on it.")
            log("")
            log("  Cause: perth imports pkg_resources, which setuptools removed in v81.")
            log("  Fix:   venv\\Scripts\\python.exe -m pip install \"setuptools<81\"")
            log("")
            log("  (RECORD-TUTORIAL-VOICE.bat now does this for you - just run it again.)")
            log("  Or pass --allow-unwatermarked to generate without a watermark.")
            return 2

    log("Loading torch...")
    import torch  # noqa
    import torchaudio as ta
    from chatterbox.tts import ChatterboxTTS

    device = args.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    log(f"Device: {device}" + ("  (this will take a while on CPU)" if device == "cpu" else ""))

    # TURBO FIRST, deliberately.
    #
    # Two reasons, and the second is the one that shows. It is the faster model,
    # which matters when the job is 21 minutes of speech on a laptop CPU. And it
    # normalises loudness per clip (norm_loudness, target -27 LUFS), so 51
    # separately generated files play back at the same volume. Without that, a
    # tutorial steps from one line to the next and the voice jumps — which reads
    # as broken far more than a slightly slower model does.
    #
    # Turbo lives in a different HF repo that may require accepting terms, so a
    # failure to load it is expected-and-handled, not an error: fall back to the
    # base model and say so, rather than stopping a job that can still run.
    model = None
    if args.model in ("auto", "turbo"):
        try:
            log("Loading Chatterbox TURBO (first run downloads ~2GB from huggingface)...")
            from chatterbox.tts_turbo import ChatterboxTurboTTS
            model = ChatterboxTurboTTS.from_pretrained(device=device)
            log("Using TURBO — faster, and loudness-matched across clips.")
        except Exception as e:
            if args.model == "turbo":
                log(f"STOP: Turbo was requested and did not load: {e}")
                return 2
            log(f"Turbo unavailable ({type(e).__name__}), falling back to the base model.")
            log("  (If it says 401/gated, accept the terms at huggingface.co/ResembleAI/chatterbox-turbo")
            log("   and set HF_TOKEN, or just let it run on base — the voice is the same.)")
    if model is None:
        log("Loading Chatterbox base model (first run downloads ~2GB from huggingface)...")
        model = ChatterboxTTS.from_pretrained(device=device)
        log("Using BASE model.")
    log(f"Model ready. Sample rate {model.sr}.")

    todo = [l for l in lines if not os.path.isfile(os.path.join(args.out, l["id"] + ".wav"))]
    log(f"{len(lines)} lines total, {len(lines) - len(todo)} already recorded, {len(todo)} to go.")

    failures = []
    started = time.time()
    for i, line in enumerate(todo, 1):
        dest = os.path.join(args.out, line["id"] + ".wav")
        try:
            log(f"{i}/{len(todo)}  {line['id']}  ({line['words']} words)")
            wav = model.generate(line["text"], audio_prompt_path=args.ref)
            ta.save(dest, wav, model.sr)
        except Exception as e:
            # One bad line must not cost the other fifty. It is recorded and
            # reported by name so it can be retried with --only.
            log(f"    FAILED: {e}")
            failures.append(line["id"])
            if os.path.isfile(dest):
                os.remove(dest)  # never leave a truncated wav that "already exists"

    mins = (time.time() - started) / 60
    log(f"Done in {mins:.1f} min. {len(todo) - len(failures)} written, {len(failures)} failed.")
    if failures:
        log("Failed lines (retry individually with --only <id>):")
        for f in failures:
            log(f"  {f}")
        return 1
    log(f"All narration is in: {os.path.abspath(args.out)}")
    log("Tell Claude it's done and it will convert, upload, and wire them into the tutorial.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        log("Stopped. Re-run the same command to pick up where you left off.")
        sys.exit(130)
    except Exception:
        # A crash must land in the log file, not vanish with the window.
        log("CRASHED:")
        tb = traceback.format_exc()
        print(tb, flush=True)
        if _LOG_PATH:
            try:
                with open(_LOG_PATH, "a", encoding="utf-8", errors="replace") as f:
                    f.write(tb + "\n")
            except OSError:
                pass
        sys.exit(1)
