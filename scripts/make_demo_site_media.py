#!/usr/bin/env python3
"""
make_demo_site_media.py — draws the placeholder artwork of the demo brasserie's website.

The repository cannot carry a restaurant's real photographs, so the demo site ships
illustrations instead: a logo, a cover and four gallery pictures, committed in
scripts/demo-media/ under the names demo_data.py's media step looks for
(site-<slug>-logo / -cover / -photo-<n>). Regenerate them with

    python3 scripts/make_demo_site_media.py            # needs Pillow

A real deployment replaces them by uploading photos in the admin ("Mon site"); on the demo VPS,
drop real files with the same names in data/media-snapshot/.
"""

import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

SLUG = "brasserie-de-la-senne-doree"
OUT = Path(__file__).resolve().parent / "demo-media"

GOLD = (214, 160, 66)
AMBER = (240, 170, 60)


def gradient(size, top, bottom):
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        row = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = row
    return img


def glow(img, center, radius, color, strength=0.9):
    layer = Image.new("RGB", img.size, (0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = center
    d.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=tuple(int(c * strength) for c in color))
    layer = layer.filter(ImageFilter.GaussianBlur(radius / 1.6))
    return ImageChops.screen(img, layer)


def grain(img, amount=10):
    noise = Image.effect_noise(img.size, amount).convert("RGB")
    return ImageChops.soft_light(img, noise)


def lamps(img, y, xs, hang=0):
    d = ImageDraw.Draw(img)
    for x in xs:
        d.line((x, 0, x, y - 26), fill=(30, 22, 16), width=3)
        d.polygon([(x - 30, y), (x + 30, y), (x + 18, y - 26), (x - 18, y - 26)], fill=(36, 26, 18))
        img = glow(img, (x, y + 6), 90, AMBER, 0.95)
        d = ImageDraw.Draw(img)
    return img


def banquette(d, x, y, w, h):
    d.rounded_rectangle((x, y, x + w, y + h), radius=h // 3, fill=(104, 52, 34))
    d.rounded_rectangle((x + 6, y + 6, x + w - 6, y + h // 2), radius=h // 4, fill=(132, 70, 46))
    for bx in range(x + 40, x + w - 20, 70):
        d.ellipse((bx, y + h // 3, bx + 8, y + h // 3 + 8), fill=GOLD)


def salle(size=(1200, 800)):
    w, h = size
    img = gradient(size, (46, 28, 20), (24, 15, 11))
    d = ImageDraw.Draw(img)
    d.rectangle((0, int(h * 0.62), w, h), fill=(58, 36, 24))
    for x in range(0, w, 90):
        d.line((x, int(h * 0.62), x - 40, h), fill=(46, 28, 19), width=3)
    bench = int(w * 0.25)
    starts = [int(w * f) for f in (0.05, 0.375, 0.7)]
    for x in starts:
        banquette(d, x, int(h * 0.42), bench, 150)
    for x in (s + bench // 2 for s in starts):
        d.ellipse((x - 70, int(h * 0.7), x + 70, int(h * 0.7) + 30), fill=(212, 170, 110))
        d.rectangle((x - 5, int(h * 0.7) + 28, x + 5, int(h * 0.7) + 110), fill=(80, 52, 34))
    img = lamps(img, 150, [s + bench // 2 for s in starts])
    return grain(img)


def assiette(size=(1200, 800)):
    w, h = size
    img = gradient(size, (122, 78, 48), (86, 52, 32))
    d = ImageDraw.Draw(img)
    for y in range(0, h, 70):
        d.line((0, y, w, y + 10), fill=(104, 64, 40), width=3)
    cx, cy = w // 2 - 80, h // 2
    d.ellipse((cx - 300, cy - 300, cx + 300, cy + 300), fill=(238, 232, 222))
    d.ellipse((cx - 250, cy - 250, cx + 250, cy + 250), fill=(250, 246, 238))
    rng = random.Random(3)
    for _ in range(26):
        a, r = rng.uniform(0, 6.28), rng.uniform(0, 170)
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
        s = rng.randint(34, 62)
        d.rounded_rectangle((x - s, y - s // 1.6, x + s, y + s // 1.6), radius=14, fill=(96 + rng.randint(-10, 10), 52, 30))
    d.ellipse((cx - 60, cy - 50, cx + 20, cy + 30), fill=(60, 120, 50))
    for i in range(9):
        x = cx + 330 + (i % 3) * 36
        y = cy - 190 + (i // 3) * 150 + (i % 3) * 22
        d.rounded_rectangle((x, y, x + 24, y + 150), radius=8, fill=(226, 182, 74))
    glass_x = w - 230
    d.rounded_rectangle((glass_x, cy - 160, glass_x + 130, cy + 160), radius=24, fill=(206, 130, 30))
    d.rounded_rectangle((glass_x, cy - 160, glass_x + 130, cy - 110), radius=20, fill=(250, 244, 228))
    img = glow(img, (cx, cy - 400), 380, (255, 214, 150), 0.35)
    return grain(img)


def comptoir(size=(1200, 800)):
    w, h = size
    img = gradient(size, (38, 24, 18), (18, 12, 9))
    d = ImageDraw.Draw(img)
    d.rectangle((0, int(h * 0.58), w, int(h * 0.66)), fill=(150, 92, 52))
    d.rectangle((0, int(h * 0.66), w, h), fill=(64, 38, 26))
    for i in range(7):
        x = 90 + i * 160
        d.rounded_rectangle((x - 16, int(h * 0.28), x + 16, int(h * 0.56)), radius=8, fill=(204, 168, 96))
        d.rectangle((x - 5, int(h * 0.56), x + 5, int(h * 0.6)), fill=(160, 128, 70))
        d.rounded_rectangle((x - 30, int(h * 0.18), x + 30, int(h * 0.3)), radius=12, fill=[(120, 40, 30), (30, 70, 90), (210, 160, 50)][i % 3])
    for x in (260, 620, 980):
        d.rounded_rectangle((x, int(h * 0.62) - 120, x + 90, int(h * 0.62)), radius=14, fill=(214, 140, 36))
        d.rounded_rectangle((x, int(h * 0.62) - 120, x + 90, int(h * 0.62) - 90), radius=12, fill=(252, 246, 230))
    img = lamps(img, 120, (300, 900))
    return grain(img)


def terrasse(size=(1200, 800)):
    w, h = size
    img = gradient(size, (250, 196, 128), (126, 92, 112))
    d = ImageDraw.Draw(img)
    d.ellipse((w * 0.68, h * 0.18, w * 0.68 + 170, h * 0.18 + 170), fill=(255, 226, 164))
    d.rectangle((0, int(h * 0.55), w, h), fill=(72, 82, 64))
    for x in range(0, w, 60):
        d.rectangle((x, int(h * 0.5), x + 40, int(h * 0.58)), fill=(54, 66, 50))
    d.rectangle((0, int(h * 0.7), w, h), fill=(150, 126, 100))
    for x in (230, 700):
        d.line((x, int(h * 0.32), x, int(h * 0.82)), fill=(60, 44, 32), width=8)
        d.pieslice((x - 190, int(h * 0.2), x + 190, int(h * 0.5)), 180, 360, fill=(170, 52, 40))
        d.pieslice((x - 190, int(h * 0.2), x, int(h * 0.5)), 180, 360, fill=(204, 80, 56))
        d.ellipse((x - 110, int(h * 0.76), x + 110, int(h * 0.82)), fill=(240, 232, 220))
        for cx in (x - 150, x + 150):
            d.rounded_rectangle((cx - 28, int(h * 0.7), cx + 28, int(h * 0.88)), radius=10, fill=(52, 42, 36))
    img = glow(img, (int(w * 0.76), int(h * 0.27)), 260, (255, 210, 140), 0.7)
    return grain(img)


def cover(size=(1600, 900)):
    return salle(size)


def logo(size=480):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((12, 12, size - 12, size - 12), fill=(36, 24, 16, 255), outline=GOLD + (255,), width=10)
    d.ellipse((46, 46, size - 46, size - 46), outline=GOLD + (255,), width=3)
    try:
        font = ImageFont.load_default(size=int(size * 0.34))
    except TypeError:
        font = ImageFont.load_default()
    text = "SD"
    box = d.textbbox((0, 0), text, font=font)
    d.text(((size - (box[2] - box[0])) / 2 - box[0], (size - (box[3] - box[1])) / 2 - box[1] - 6), text, font=font, fill=GOLD + (255,))
    return img


def main():
    OUT.mkdir(exist_ok=True)
    targets = {
        f"site-{SLUG}-cover.jpg": cover(),
        f"site-{SLUG}-photo-1.jpg": salle(),
        f"site-{SLUG}-photo-2.jpg": assiette(),
        f"site-{SLUG}-photo-3.jpg": comptoir(),
        f"site-{SLUG}-photo-4.jpg": terrasse(),
    }
    for name, image in targets.items():
        image.save(OUT / name, "JPEG", quality=78, optimize=True, progressive=True)
    logo().save(OUT / f"site-{SLUG}-logo.png", optimize=True)
    for p in sorted(OUT.iterdir()):
        print(f"{p.name}  {p.stat().st_size // 1024} KB", file=sys.stderr)


if __name__ == "__main__":
    main()
