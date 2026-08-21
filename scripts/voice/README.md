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

## What Dustin does — two double-clicks

1. **`GET-VOICE-CLIP.bat`** — pulls his own voice down from Descript (the audio
   of `APT_Clip1_The_Problem`, 92 seconds of narration with no music). Claude
   published that from Descript and baked the signed link into the file, so
   there is nothing to find in a Downloads folder and nothing to trim.
   *The link expires 22 Aug 2026 14:29 UTC; after that ask Claude to publish a
   fresh one.*
2. **`RECORD-TUTORIAL-VOICE.bat`** — everything else.

He can skip step 1 entirely by dropping his own recording in this folder as
`voice-ref.wav` (or `.m4a` / `.mp3` — the format does not matter).

### He does not need to trim it

`prepare_reference()` converts whatever it finds to mono 24kHz and then picks
the best 18 seconds itself: the window with the highest sustained voice, scored
as `level x voiced²` so one loud word beside a long gap loses to steady
speech. Verified against a synthetic 40s clip with a known-good block at
9–29s and a deliberately gappy stretch at 31–38s — it chose 10.9–28.9s at 94%
voiced. "The first 18 seconds" would have picked an intro breath and a pause.

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
