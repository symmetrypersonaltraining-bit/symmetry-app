# Tutorial narration in Dustin's voice

The tutorial's 51 steps are read aloud. Today that is the browser's robot
voice; `narrate(line, audioUrl)` in `src/lib/speech.ts` already prefers a real
recording, so giving each step an `audioUrl` is the whole change.

## Why this is not automated in a cloud session

Chatterbox pulls its weights from `huggingface.co`. The cloud sandbox's egress
proxy refuses that host, and refuses every hosted TTS API as well (Resemble,
ElevenLabs, PlayHT, OpenAI, Deepgram all fail CONNECT). PyPI is reachable, the
weights are not. Verified 21 Aug 2026. The generation has to happen on a machine
with ordinary internet — so it happens on Dustin's laptop, once, and the output
comes back through the connected folder.

## What Dustin does

1. Record **15–20 seconds** of himself talking normally. Quiet room, no music,
   no gym noise. A phone voice memo exported to `.wav` is fine. There is also
   plenty of usable narration already in Descript (the `APT_Clip*` projects).
2. Save it as `voice-ref.wav` **in this folder**.
3. Double-click `RECORD-TUTORIAL-VOICE.bat`.

First run installs a Python environment and downloads ~2GB. After that it just
generates. It is **resumable** — every finished line is skipped on the next run,
so closing the window costs only the line in flight. Everything, including a
crash, is appended to `voice-log.txt`.

## What comes back

`narration/<step-id>.wav`, one per step, named to match the `id` in
`src/lib/tutorial/script.ts`. Claude converts them to mp3, uploads them to
Supabase Storage, and sets `audioUrl` on each step.

## Things worth knowing

- **Chatterbox watermarks everything it generates** (Resemble's Perth
  watermarker). Inaudible, survives mp3. Fine for this — his voice, his app —
  but it is there.
- Re-record one line with `--only <step-id>` after deleting its wav.
- `narration-manifest.json` is generated, never hand-edited:
  `npx tsx scripts/voice/build-manifest.ts > scripts/voice/narration-manifest.json`
  Re-run it whenever the tutorial script changes, or a new step will silently
  keep the robot voice.
