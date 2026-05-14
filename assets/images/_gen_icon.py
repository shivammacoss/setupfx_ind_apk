"""One-shot icon generator. Run with the backend venv's python:

    .venv/Scripts/python.exe assets/images/_gen_icon.py

Generates icon.png + adaptive-icon.png + splash.png with a purple gradient
'S' mark matching the app's primary color (#A855F7).
"""
import os
import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# Theme colors (mirror src/shared/theme.ts primary palette)
PURPLE_TOP = (168, 85, 247)      # #A855F7
PURPLE_BOT = (109, 40, 217)      # #6D28D9
BG_DARK    = (13, 13, 13)        # #0D0D0D — splash bg, app bgRoot

def diag_gradient(size: int, top: tuple, bot: tuple) -> Image.Image:
    """Diagonal top-left → bottom-right gradient."""
    img = Image.new("RGB", (size, size), top)
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            r = int(top[0] * (1 - t) + bot[0] * t)
            g = int(top[1] * (1 - t) + bot[1] * t)
            b = int(top[2] * (1 - t) + bot[2] * t)
            px[x, y] = (r, g, b)
    return img

def find_bold_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        r"C:\Windows\Fonts\segoeuib.ttf",   # Segoe UI Bold
        r"C:\Windows\Fonts\arialbd.ttf",    # Arial Bold
        r"C:\Windows\Fonts\Calibrib.ttf",   # Calibri Bold
        r"C:\Windows\Fonts\verdanab.ttf",   # Verdana Bold
        r"C:\Windows\Fonts\segoeui.ttf",    # Segoe UI fallback
        r"C:\Windows\Fonts\arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

def draw_s_centered(img: Image.Image, area_size: int, center: tuple[int, int]) -> None:
    """Draw a tall bold S, centered inside `area_size` square at `center`."""
    draw = ImageDraw.Draw(img, "RGBA")
    # font size sized to fill ~78% of the area for visual punch
    font_size = int(area_size * 0.78)
    font = find_bold_font(font_size)

    # Measure with anchor='mm' so it centers exactly on the point.
    cx, cy = center
    # Subtle dark shadow behind for depth.
    shadow_offset = max(2, area_size // 80)
    shadow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sd.text(
        (cx + shadow_offset, cy + shadow_offset),
        "S",
        font=font,
        fill=(0, 0, 0, 110),
        anchor="mm",
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=area_size // 90))
    img.alpha_composite(shadow_layer)

    # Crisp white S on top.
    draw.text((cx, cy), "S", font=font, fill=(255, 255, 255, 255), anchor="mm")

def rounded_mask(size: int, radius_pct: float) -> Image.Image:
    """Return an L-mode mask with rounded corners."""
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    r = int(size * radius_pct)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=255)
    return mask

def make_icon(size: int = 1024) -> Image.Image:
    """Square gradient icon with the S filling most of the canvas. Used as
    the iOS icon (full-bleed). Rounded corners are applied by iOS itself."""
    bg = diag_gradient(size, PURPLE_TOP, PURPLE_BOT).convert("RGBA")
    draw_s_centered(bg, area_size=size, center=(size // 2, size // 2))
    return bg

def make_adaptive_foreground(size: int = 1024) -> Image.Image:
    """Android adaptive foreground — the safe zone is the inner ~66% of the
    canvas, so we shrink the S into that area and keep the outer band
    transparent. Background colour comes from app.json's adaptiveIcon."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    safe = int(size * 0.66)
    draw_s_centered(img, area_size=safe, center=(size // 2, size // 2))
    return img

def make_splash(width: int = 1242, height: int = 2436) -> Image.Image:
    """Dark splash with the gradient S mark centered roughly 40 % from top.
    Resize-mode 'contain' in app.json keeps the artwork visible on every
    aspect ratio without stretching."""
    img = Image.new("RGBA", (width, height), BG_DARK + (255,))
    # Draw a soft gradient halo behind the mark so it doesn't look pasted.
    badge_size = int(min(width, height) * 0.38)
    badge = diag_gradient(badge_size, PURPLE_TOP, PURPLE_BOT).convert("RGBA")
    mask = rounded_mask(badge_size, radius_pct=0.24)
    badge.putalpha(mask)
    # Position the badge at horizontal center, ~38 % from top.
    bx = (width - badge_size) // 2
    by = int(height * 0.38) - badge_size // 2
    img.alpha_composite(badge, (bx, by))
    # Draw S inside the badge.
    draw_s_centered(img, area_size=badge_size, center=(bx + badge_size // 2, by + badge_size // 2))
    return img

def main() -> None:
    icon = make_icon(1024)
    icon.save(os.path.join(OUT_DIR, "icon.png"), "PNG")
    print("wrote icon.png", icon.size)

    adaptive = make_adaptive_foreground(1024)
    adaptive.save(os.path.join(OUT_DIR, "adaptive-icon.png"), "PNG")
    print("wrote adaptive-icon.png", adaptive.size)

    splash = make_splash(1242, 2436)
    splash.save(os.path.join(OUT_DIR, "splash.png"), "PNG")
    print("wrote splash.png", splash.size)

if __name__ == "__main__":
    main()
