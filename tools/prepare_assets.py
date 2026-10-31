#!/usr/bin/env python3
"""Turns the raw PNGs in assets/ into the transparent, game-ready WebPs in img/.
Run with Pillow, NumPy and SciPy installed: python tools/prepare_assets.py"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ni

ROOT = Path(__file__).resolve().parent.parent
RAW, OUT = ROOT / "assets", ROOT / "img"
OUT.mkdir(exist_ok=True)

def load(name):
    return np.array(Image.open(RAW / name).convert("RGBA")).astype(np.uint8)

def light_mask(im, lo=200, chroma=30):
    rgb = im[..., :3].astype(int)
    return (rgb.min(2) > lo) & (rgb.max(2) - rgb.min(2) < chroma)

def cut_light(im, holes=(), lo=200, chroma=30):
    """Remove the light background reachable from the border, plus seeded holes (x, y)."""
    light = light_mask(im, lo, chroma)
    lab, _ = ni.label(light)
    ids = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
    ids |= {lab[y, x] for x, y in holes} - {0}
    return finish(im, ~np.isin(lab, list(ids)))

def cut_alpha(im, threshold=128, keep=1, holes=()):
    """For files with real alpha: drop haze and stray specks, keep the largest shapes."""
    solid = im[..., 3] > threshold
    lab, n = ni.label(solid)
    sizes = ni.sum(solid, lab, range(1, n + 1))
    best = np.argsort(sizes)[::-1][:keep] + 1
    return finish(im, ni.binary_fill_holes(np.isin(lab, best)) if not holes else np.isin(lab, best))

def finish(im, fg):
    """Pull the edge in slightly to lose the light fringe, then anti-alias it."""
    fg = ni.binary_erosion(ni.binary_opening(fg, iterations=1), iterations=1)
    out = im.copy()
    out[..., 3] = (np.clip(ni.gaussian_filter(fg.astype(float), 0.9), 0, 1) * 255).astype(np.uint8)
    return out

def bbox(im):
    ys, xs = np.where(im[..., 3] > 8)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1

def save(im, name, max_side, box=None):
    x0, y0, x1, y1 = box or bbox(im)
    pic = Image.fromarray(im[y0:y1, x0:x1], "RGBA")
    pic.thumbnail((max_side, max_side), Image.LANCZOS)
    pic.save(OUT / f"{name}.webp", quality=88, method=6)
    print(f"{name}: {pic.size} {(OUT / f'{name}.webp').stat().st_size // 1024}KB")

def tint_wicker(im):
    """Darken the bright wicker toward the mockup's brown so oranges stand out; leaves stay green."""
    out = im.astype(float)
    r, g = out[..., 0], out[..., 1]
    wicker = g < r * 0.98
    out[wicker, :3] *= [0.70, 0.60, 0.52]
    return out.clip(0, 255).astype(np.uint8)

# Characters
save(cut_light(load("Thoughtful Safari Monkey Explorer.png"), holes=[(572, 1093)], lo=165, chroma=26), "monkey_think", 800)
save(cut_light(load("Joyful Safari Monkey Adventure.png")), "monkey_happy", 900)
save(cut_light(load("Safari Monkey’s Curious Oops.png"), lo=110, chroma=34), "monkey_oops", 800)
save(cut_light(load("Joyful Jumping Cartoon Monkey.png"), holes=[(461, 527)]), "friend_jump", 640)
save(cut_light(load("Playful Monkey Hanging from a Leafy Branch.png"),
               holes=[(265, 739), (914, 276), (716, 200), (836, 163), (819, 305)]), "friend_hang", 560)
save(cut_light(load("Cheerful Cartoon Toucan Perched.png"), holes=[(567, 952)]), "toucan", 520)

# Objects
save(cut_alpha(load("Glossy Orange with Leaf.png")), "fruit_orange", 280)
save(cut_light(load("Glossy Ripe Banana Illustration.png")), "banana", 320)

# Basket: both layers share one crop so they stay registered
front = tint_wicker(cut_light(load("Woven Basket Front with Green Leaves.png")))
back = tint_wicker(cut_light(load("Woven Basket Interior on Transparent Background.png")))
b1, b2 = bbox(front), bbox(back)
box = (min(b1[0], b2[0]), min(b1[1], b2[1]), max(b1[2], b2[2]), max(b1[3], b2[3]))
save(front, "basket_front", 900, box)
save(back, "basket_back", 900, box)

# Crates: straight-edged, so cut by outline. All three share one crop to stay registered.
def cut_polygon(im, points):
    mask = Image.new("L", (im.shape[1], im.shape[0]), 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return finish(im, np.array(mask) > 0)

CRATE = [(153, 170), (172, 150), (232, 150), (248, 178), (1288, 178), (1298, 152), (1362, 150), (1382, 170),
         (1384, 205), (1478, 562), (1479, 860), (1450, 886), (85, 886), (55, 862), (53, 562), (152, 205)]
LID = [(150, 172), (160, 165), (1378, 165), (1388, 175), (1493, 655), (1493, 700), (1475, 720),
       (60, 720), (42, 702), (42, 660)]
crate_box = (40, 145, 1496, 890)
save(cut_polygon(load("Crate of Bright Oranges.png"), CRATE), "crate_full", 620, crate_box)
save(cut_polygon(load("Empty Wooden Crate with Warm Glow.png"), CRATE), "crate_empty", 620, crate_box)
save(cut_polygon(load("Detailed Wooden Crate Lid.png"), LID), "crate_lid", 620, crate_box)

# Interface
save(cut_light(load("Glossy Banana Wooden Badge.png"), holes=[(600, 346)]), "badge", 640)
save(cut_light(load("Tropical Vines Wooden Banner.png")), "banner", 1200)

ui = load("Glossy Golden Progress Bar and Pause Button.png")
split = 1780  # the gap between the bar and the button
bar, pause = ui.copy(), ui.copy()
bar[:, split:] = 0
pause[:, :split] = 0
save(cut_alpha(bar, keep=1, holes=True), "bar_frame", 900)
save(cut_alpha(pause), "btn_pause", 220)

sheet = load("Vine-Bordered Stone Game Tiles.png")
solid = sheet[..., 3] > 235
lab, n = ni.label(solid)
sizes = ni.sum(solid, lab, range(1, n + 1))
biggest = sorted(np.argsort(sizes)[::-1][:3] + 1, key=lambda i: np.where(lab == i)[1].mean())
for i, label in enumerate(biggest, 1):
    save(finish(sheet, lab == label), f"tile_{i}", 460)

# Backgrounds, 4:3
temple = Image.open(RAW / "Jungle Temple Waterfall Path.png").convert("RGB")
tw = temple.height * 4 // 3
x = (temple.width - tw) // 2
temple.crop((x, 0, x + tw, temple.height)).save(OUT / "bg_temple.webp", quality=90, method=6)
Image.open(RAW / "Vibrant Cartoon Jungle Clearing.png").convert("RGB").save(OUT / "bg_clearing.webp", quality=90, method=6)

# App icons
face = Image.open(OUT / "monkey_happy.webp").convert("RGBA")
for size in (180, 512):
    icon = Image.open(OUT / "bg_clearing.webp").convert("RGBA").resize((size * 4 // 3, size)).crop((0, 0, size, size))
    m = face.resize((int(size * 0.96), int(size * 0.96 * face.height / face.width)))
    icon.alpha_composite(m, (int(size * 0.02), int(size * 0.04)))
    icon.convert("RGB").save(OUT / f"icon_{size}.png")
