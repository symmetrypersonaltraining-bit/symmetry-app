/**
 * shareCard — draws a branded, shareable achievement image on a canvas.
 * 2026-07-25.
 *
 * Pure canvas 2D. Deliberately NO html2canvas / dom-to-image dependency:
 * adding a DOM-rasterising library for one card is a lot of new surface area,
 * and it renders differently across the Android WebView and mobile Safari.
 * Drawing it by hand is boring and identical everywhere.
 *
 * Colours come from the live CSS custom properties, so the card matches
 * whichever of the 21 themes the person is actually using.
 */

export interface ShareCardData {
  /** Big line: "4 SESSIONS" */
  headline: string;
  /** Under the headline: "this week" */
  subhead: string;
  /** Up to 3 small stat pairs shown in a row */
  stats: { label: string; value: string }[];
  /** Optional italic line under the stats */
  note?: string | null;
  /** Person's first name, top-left */
  name?: string | null;
}

const W = 1080;
const H = 1350;

function cssVar(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/** #abc / #aabbcc / rgb(...) -> [r,g,b]. Falls back to the brand blue. */
function toRgb(raw: string): [number, number, number] {
  const s = (raw || "").trim();
  if (s.startsWith("#")) {
    const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1);
    if (h.length >= 6) {
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
  }
  const m = s.match(/\d+/g);
  if (m && m.length >= 3) return [Number(m[0]), Number(m[1]), Number(m[2])];
  return [124, 156, 245];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return "rgb(" + r + "," + g + "," + bl + ")";
}

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: string,
  maxPx: number,
  minPx: number,
  maxWidth: number
): number {
  let size = maxPx;
  while (size > minPx) {
    ctx.font = weight + " " + size + "px system-ui, -apple-system, 'Segoe UI', sans-serif";
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  }
  ctx.font = weight + " " + size + "px system-ui, -apple-system, 'Segoe UI', sans-serif";
  return size;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Renders the card and returns the canvas. Throws only if canvas is unavailable. */
export function drawShareCard(data: ShareCardData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  const primary = toRgb(cssVar("--brand-primary", "#7c9cf5"));
  const accent = toRgb(cssVar("--brand-accent", "#8b6ff0"));
  const dark: [number, number, number] = [14, 18, 32];

  // Background: deep gradient in the theme's own hue.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, mix(dark, primary, 0.22));
  bg.addColorStop(0.55, mix(dark, accent, 0.14));
  bg.addColorStop(1, mix(dark, primary, 0.05));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Soft glow behind the headline.
  const glow = ctx.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, 620);
  glow.addColorStop(0, "rgba(" + primary.join(",") + ",0.30)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Faint grid — reads as "training log" without saying it.
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 2;
  for (let x = 0; x <= W; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 90) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  ctx.textBaseline = "alphabetic";

  // Name, top-left
  if (data.name) {
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "700 40px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText(data.name.toUpperCase(), 84, 132);
  }

  // Accent rule under the name
  ctx.fillStyle = "rgb(" + primary.join(",") + ")";
  roundRect(ctx, 84, 158, 120, 8, 4);
  ctx.fill();

  // Headline
  ctx.textAlign = "center";
  const headSize = fitFont(ctx, data.headline, "900", 190, 76, W - 140);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 30;
  ctx.fillText(data.headline, W / 2, H * 0.44);
  ctx.shadowBlur = 0;

  // Subhead
  fitFont(ctx, data.subhead, "600", 46, 26, W - 200);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText(data.subhead, W / 2, H * 0.44 + headSize * 0.52);

  // Stat row
  const stats = data.stats.slice(0, 3);
  if (stats.length) {
    const boxW = 940;
    const boxH = 190;
    const bx = (W - boxW) / 2;
    const by = H * 0.62;
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    roundRect(ctx, bx, by, boxW, boxH, 34);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const colW = boxW / stats.length;
    stats.forEach((s, i) => {
      const cx = bx + colW * i + colW / 2;
      if (i > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.beginPath();
        ctx.moveTo(bx + colW * i, by + 34);
        ctx.lineTo(bx + colW * i, by + boxH - 34);
        ctx.stroke();
      }
      fitFont(ctx, s.value, "800", 62, 30, colW - 40);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(s.value, cx, by + 96);
      fitFont(ctx, s.label.toUpperCase(), "700", 24, 15, colW - 30);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(s.label.toUpperCase(), cx, by + 140);
    });
  }

  // Note
  if (data.note) {
    fitFont(ctx, data.note, "500", 34, 20, W - 180);
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText(data.note, W / 2, H * 0.62 + 258);
  }

  // Footer wordmark
  ctx.textAlign = "center";
  ctx.font = "800 32px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText("SYMMETRY", W / 2, H - 96);
  ctx.font = "600 22px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("PERSONAL TRAINING", W / 2, H - 60);

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/png");
    } catch {
      resolve(null);
    }
  });
}
