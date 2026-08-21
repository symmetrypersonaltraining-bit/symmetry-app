// Emit the tutorial narration as a flat JSON manifest, one entry per spoken
// line, keyed by the step id that will carry its `audioUrl`.
//
// Read from the real script module rather than scraped with a regex: the
// narration is the thing being recorded in Dustin's voice, and a parser that
// silently misses a step ships a tutorial where one line is suddenly a robot.
//
//   npx tsx scripts/voice/build-manifest.ts > scripts/voice/narration-manifest.json
import { allSteps, stepCount } from "../../src/lib/tutorial/script.ts";

const out = allSteps().map((s) => ({
  id: s.id,
  chapter: s.chapterId,
  title: s.title,
  text: s.narration.replace(/\s+/g, " ").trim(),
  words: s.narration.trim().split(/\s+/).length,
}));
const words = out.reduce((a, s) => a + s.words, 0);
console.error(`steps=${stepCount()} narrated=${out.length} words=${words} est_minutes=${(words / 145).toFixed(1)}`);
process.stdout.write(JSON.stringify({ version: 1, generatedFrom: "src/lib/tutorial/script.ts", lines: out }, null, 2) + "\n");
