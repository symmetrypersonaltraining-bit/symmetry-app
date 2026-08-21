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


def log(msg):
    stamp = time.strftime("%H:%M:%S")
    line = f"[{stamp}] {msg}"
    print(line, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", required=True, help="10-20s wav of the voice to clone")
    ap.add_argument("--manifest", default=os.path.join(HERE, "narration-manifest.json"))
    ap.add_argument("--out", default=os.path.join(HERE, "narration"))
    ap.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    ap.add_argument("--only", default=None, help="regenerate a single step id")
    args = ap.parse_args()

    if not os.path.isfile(args.ref):
        log(f"STOP: no reference clip at {args.ref}")
        log("Record 15-20 seconds of yourself talking normally, save it as a .wav, and point --ref at it.")
        return 2
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

    log("Loading torch...")
    import torch  # noqa
    import torchaudio as ta
    from chatterbox.tts import ChatterboxTTS

    device = args.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    log(f"Device: {device}" + ("  (this will take a while on CPU)" if device == "cpu" else ""))

    log("Loading Chatterbox weights (first run downloads ~2GB from huggingface)...")
    model = ChatterboxTTS.from_pretrained(device=device)
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
        traceback.print_exc()
        sys.exit(1)
