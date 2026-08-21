#!/usr/bin/env bash
# Take the wavs Chatterbox produced on Dustin's laptop and put them in the app.
#
#   scripts/voice/ingest-narration.sh <dir-of-wavs>
#
# Converts each to mono mp3, drops it in public/tutorial-audio/, and regenerates
# src/lib/tutorial/audio.ts from WHAT IS ACTUALLY ON DISK — never from the
# manifest, so a line that failed to generate cannot be advertised as recorded.
#
# Mono 64k is deliberate: this is one voice reading, and 21 minutes of it. At
# 64k the whole tutorial is roughly 10MB, which is proportionate next to the
# 7.9MB already in public/. Stereo or 128k would double it for nothing anybody
# can hear on a phone speaker.
set -euo pipefail

SRC="${1:-}"
[ -d "$SRC" ] || { echo "usage: $0 <dir-of-wavs>" >&2; exit 2; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/public/tutorial-audio"
mkdir -p "$OUT"

shopt -s nullglob
n=0
for w in "$SRC"/*.wav; do
  id="$(basename "$w" .wav)"
  # LOUDNESS-MATCH EVERY CLIP.
  #
  # Chatterbox Turbo does this itself (norm_loudness, -27 LUFS) but Turbo fails
  # to instantiate on chatterbox-tts 0.1.7 - it calls S3Gen(meanflow=True) and
  # the installed S3Gen has no such argument - so the base model is what
  # actually generates these, and the base model does NOT level its output.
  #
  # Fifty-one separately generated clips then play back at fifty-one different
  # volumes, and a tutorial whose narrator lurches quieter and louder between
  # steps reads as broken. Doing it here is better than relying on the model
  # anyway: one stated target, applied uniformly, and verifiable afterwards.
  #
  # -19 LUFS suits a phone speaker in a gym. TP -1.5dB leaves headroom so mp3
  # encoding cannot clip the peaks it creates.
  ffmpeg -y -loglevel error -i "$w" -ac 1 -af loudnorm=I=-19:TP=-1.5:LRA=11 -b:a 64k "$OUT/$id.mp3"
  n=$((n+1))
done
[ "$n" -gt 0 ] || { echo "no wavs in $SRC" >&2; exit 1; }

# The generated set, built from the mp3s that exist.
{
  sed -n '1,15p' "$ROOT/src/lib/tutorial/audio.ts" | sed -n '1,14p'
  echo "export const RECORDED_STEPS: ReadonlySet<string> = new Set<string>(["
  for f in "$OUT"/*.mp3; do echo "  \"$(basename "$f" .mp3)\","; done
  cat <<'TS'
]);

/**
 * The audio for a step, or null to fall back to the browser voice.
 *
 * `narrate()` already treats null as "speak it", so a step with no recording
 * behaves exactly as it did before any of this existed.
 */
export function resolveAudio(step: { id: string; audioUrl?: string | null }): string | null {
  if (step.audioUrl) return step.audioUrl;
  return RECORDED_STEPS.has(step.id) ? `/tutorial-audio/${step.id}.mp3` : null;
}
TS
} > "$ROOT/src/lib/tutorial/audio.ts.new"
mv "$ROOT/src/lib/tutorial/audio.ts.new" "$ROOT/src/lib/tutorial/audio.ts"

echo "ingested $n recordings -> public/tutorial-audio/"
du -sh "$OUT"
