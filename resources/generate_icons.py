#!/usr/bin/env python3
"""Symmetry app icon + splash generator (runs in CI).
Builds the icon from the FINAL "Symmetry Corrective" badge (navy Vitruvian +
gold ring on white) composited on a navy square. The badge is fetched from the
live deployed logo asset — no binary assets committed to the repo.
Outputs into ./assets for @capacitor/assets to consume."""
import io, os, math, urllib.request
from PIL import Image
import numpy as np

# Final Corrective badge (transparent, white field) served by the live app.
LOGO_URL = "https://symmetry-app-omega.vercel.app/symmetry-corrective-logo.png"
NAVY = (23, 62, 104)   # #173E68 brand navy = icon background

def load_badge():
    local = os.environ.get("LOCAL_LOGO")
    data = open(local, "rb").read() if local else urllib.request.urlopen(LOGO_URL, timeout=40).read()
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    # tight-crop to the visible badge (drop transparent margins) and square it
    al = np.array(im)[:, :, 3]
    ys, xs = np.where(al > 20)
    side = max(xs.max() - xs.min(), ys.max() - ys.min())
    ccx, ccy = (xs.min() + xs.max()) // 2, (ys.min() + ys.max()) // 2
    hh = side // 2 + 2
    return im.crop((ccx - hh, ccy - hh, ccx + hh, ccy + hh))

def navy_square(size):
    return Image.new("RGBA", (size, size), NAVY + (255,))

def main():
    os.makedirs("assets", exist_ok=True)
    badge = load_badge()
    # icon-foreground: badge in the adaptive safe zone (~0.72), transparent bg
    fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)); s = int(1024 * 0.72); m = (1024 - s) // 2
    fg.alpha_composite(badge.resize((s, s), Image.LANCZOS), (m, m)); fg.save("assets/icon-foreground.png")
    # icon-background: solid navy
    navy_square(1024).convert("RGB").save("assets/icon-background.png")
    # icon-only (full-bleed for iOS / stores): badge ~0.90 on navy
    ic = navy_square(1024); s = int(1024 * 0.90); m = (1024 - s) // 2
    ic.alpha_composite(badge.resize((s, s), Image.LANCZOS), (m, m)); ic.convert("RGB").save("assets/icon-only.png")
    # splash: badge ~0.28 centered on navy
    for name in ("splash.png", "splash-dark.png"):
        sp = navy_square(2732); s = int(2732 * 0.28); m = (2732 - s) // 2
        sp.alpha_composite(badge.resize((s, s), Image.LANCZOS), (m, m)); sp.convert("RGB").save(f"assets/{name}")
    print("generated assets:", os.listdir("assets"))

if __name__ == "__main__":
    main()
