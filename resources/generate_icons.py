#!/usr/bin/env python3
"""Symmetry app icon + splash generator (runs in CI).
Recreates the approved icon: SYMMETRY/CORRECTIVE badge with a crisp GOLD
Vitruvian figure on a spotlight-blue background. No binary assets in the repo;
everything is regenerated from the live logo at build time.
Outputs into ./assets for @capacitor/assets to consume."""
import io, os, math, urllib.request
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageColor

LOGO_URL = "https://mkfiginpiesospsnktea.supabase.co/storage/v1/object/public/assets/Transparent%20White.png"
FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
FONT_URL = "https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/version_2_37/ttf/DejaVuSans-Bold.ttf"
GOLD = (212, 175, 55)

def load_logo():
    local = os.environ.get("LOCAL_LOGO")
    data = open(local, "rb").read() if local else urllib.request.urlopen(LOGO_URL, timeout=40).read()
    return Image.open(io.BytesIO(data)).convert("RGBA")

def load_font(px):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, px)
    fb = "/tmp/_font.ttf"
    if not os.path.exists(fb):
        open(fb, "wb").write(urllib.request.urlopen(FONT_URL, timeout=40).read())
    return ImageFont.truetype(fb, px)

def geom(al):
    ys, xs = np.where(al > 40)
    cx, cy = (xs.min()+xs.max())/2, (ys.min()+ys.max())/2
    H, W = al.shape; Y, X = np.mgrid[0:H, 0:W]
    R = np.sqrt((X-cx)**2 + (Y-cy)**2)
    return cx, cy, R, R[al > 40].max()

def make_badge(logo):
    im = logo.copy(); a = np.array(im); al = a[:, :, 3]
    cx, cy, R, mr = geom(al)
    Y, _ = np.mgrid[0:al.shape[0], 0:al.shape[1]]
    a[(R > 0.66*mr) & (R < 0.88*mr) & ((Y - cy) > 3), 3] = 0     # remove PERSONAL TRAINING
    im = Image.fromarray(a)
    # add CORRECTIVE curved along the bottom
    d = ImageDraw.Draw(im); font = load_font(int(mr*0.10))
    text = "CORRECTIVE"; rr = mr*0.77; n = len(text); span = min(150, 13*n)
    for i, ch in enumerate(text):
        ang = 180 + span/2 - i*(span/(n-1)); rad = math.radians(ang)
        x = cx + rr*math.sin(rad); y = cy - rr*math.cos(rad)
        bb = d.textbbox((0, 0), ch, font=font); w, h = bb[2]-bb[0], bb[3]-bb[1]
        tile = Image.new("RGBA", (w+8, h+8), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((4-bb[0], 4-bb[1]), ch, font=font, fill=(255, 255, 255, 255))
        rot = tile.rotate(180-ang, expand=True, resample=Image.BICUBIC)
        im.alpha_composite(rot, (int(x-rot.width/2), int(y-rot.height/2)))
    # crisp gold Vitruvian figure (central region)
    a = np.array(im); al = a[:, :, 3]; cx, cy, R, mr = geom(al)
    central = (al > 40) & (R < 0.58*mr)
    a[central, 0], a[central, 1], a[central, 2], a[central, 3] = GOLD + (255,)
    im = Image.fromarray(a)
    # tight-crop to the badge
    al = np.array(im)[:, :, 3]; ys, xs = np.where(al > 25)
    side = max(xs.max()-xs.min(), ys.max()-ys.min()); ccx, ccy = (xs.min()+xs.max())//2, (ys.min()+ys.max())//2
    hh = side//2; p = int(side*0.03)
    return im.crop((ccx-hh-p, ccy-hh-p, ccx+hh+p, ccy+hh+p))

def spotlight(size):
    img = Image.new("RGB", (size, size)); cx, cy = size/2, size*0.44; px = img.load()
    I, M, O = ImageColor.getrgb("#2E77B8"), ImageColor.getrgb("#0F4C81"), ImageColor.getrgb("#0A3A63")
    for y in range(size):
        for x in range(size):
            d = min(math.hypot(x-cx, y-cy)/(size*0.72), 1)
            if d < 0.6: t = d/0.6; c = [int(I[i]+(M[i]-I[i])*t) for i in range(3)]
            else: t = (d-0.6)/0.4; c = [int(M[i]+(O[i]-M[i])*t) for i in range(3)]
            px[x, y] = tuple(c)
    return img.convert("RGBA")

def main():
    os.makedirs("assets", exist_ok=True)
    badge = make_badge(load_logo())
    # icon-foreground: badge centered in the 1024 safe zone (~0.66)
    fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)); s = int(1024*0.66); m = (1024-s)//2
    fg.alpha_composite(badge.resize((s, s), Image.LANCZOS), (m, m)); fg.save("assets/icon-foreground.png")
    # icon-background: spotlight blue
    spotlight(1024).convert("RGB").save("assets/icon-background.png")
    # icon-only (full-bleed for iOS / stores): badge ~0.90 on spotlight
    ic = spotlight(1024); s = int(1024*0.90); m = (1024-s)//2
    ic.alpha_composite(badge.resize((s, s), Image.LANCZOS), (m, m)); ic.convert("RGB").save("assets/icon-only.png")
    # splash: badge ~0.26 centered
    for name in ("splash.png", "splash-dark.png"):
        sp = spotlight(2732); s = int(2732*0.26); m = (2732-s)//2
        sp.alpha_composite(badge.resize((s, s), Image.LANCZOS), (m, m)); sp.convert("RGB").save(f"assets/{name}")
    print("generated assets:", os.listdir("assets"))

if __name__ == "__main__":
    main()
