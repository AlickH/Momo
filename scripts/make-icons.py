#!/usr/bin/env python3
"""Generate Momo app icons from a single vector-like master drawing."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SIZE = 1024


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def gradient(size, start, end):
    y, x = np.mgrid[0:size, 0:size]
    t = (x + y) / (2 * (size - 1))
    arr = np.zeros((size, size, 3), dtype=np.uint8)
    for channel in range(3):
        arr[:, :, channel] = (start[channel] + (end[channel] - start[channel]) * t).astype(np.uint8)
    return Image.fromarray(arr, 'RGB')


def main():
    scale = 4
    size = SIZE * scale
    margin = int(size * 0.035)
    radius = int(size * 0.24)

    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))

    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (margin, margin + int(size * 0.012), size - margin, size - margin + int(size * 0.012)),
        radius=radius,
        fill=(0, 22, 16, 110),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(size * 0.018)))
    canvas.alpha_composite(shadow)

    body_mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(body_mask).rounded_rectangle(
        (margin, margin, size - margin, size - margin),
        radius=radius,
        fill=255,
    )

    body = gradient(size, (105, 177, 255), (22, 119, 255))
    gloss = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gloss_draw = ImageDraw.Draw(gloss)
    gloss_draw.ellipse(
        (-size * 0.28, -size * 0.48, size * 0.9, size * 0.42),
        fill=(255, 255, 255, 70),
    )
    gloss = gloss.filter(ImageFilter.GaussianBlur(int(size * 0.06)))
    body = body.convert('RGBA')
    body.alpha_composite(gloss)
    body.putalpha(body_mask)
    canvas.alpha_composite(body)

    draw = ImageDraw.Draw(canvas)
    stroke = int(size * 0.075)
    left = int(size * 0.255)
    right = int(size * 0.745)
    top = int(size * 0.345)
    bottom = int(size * 0.665)
    mid = int(size * 0.50)
    dot_r = int(size * 0.034)
    ink = (11, 11, 11, 255)

    points = [
        (left, bottom),
        (left, top),
        (mid, int(size * 0.575)),
        (right, top),
        (right, bottom),
    ]
    draw.line(points, fill=ink, width=stroke, joint='curve')
    for point in (points[0], points[-1]):
        draw.ellipse((point[0] - stroke // 2, point[1] - stroke // 2, point[0] + stroke // 2, point[1] + stroke // 2), fill=ink)
    draw.ellipse((mid - dot_r, int(size * 0.575) - dot_r, mid + dot_r, int(size * 0.575) + dot_r), fill=(11, 11, 11, 150))

    master = canvas.resize((SIZE, SIZE), Image.LANCZOS)

    targets = {
        ROOT / 'packaging' / 'ICON_256.PNG': 256,
        ROOT / 'packaging' / 'ICON.PNG': 64,
        ROOT / 'packaging' / 'app' / 'ui' / 'images' / 'icon_256.png': 256,
        ROOT / 'packaging' / 'app' / 'ui' / 'images' / 'icon_64.png': 64,
        ROOT / 'docs' / 'icon.png': 256,
    }
    for path, target in targets.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        image = master.resize((target, target), Image.LANCZOS)
        image.convert('RGB').save(path, 'PNG', optimize=True)
        print(f'{path.relative_to(ROOT)} <- {target}x{target}')

    # High-resolution favicon source for the web UI.
    favicon = ROOT / 'frontend' / 'public' / 'icon-256.png'
    master.resize((256, 256), Image.LANCZOS).save(favicon, 'PNG', optimize=True)
    print(f'{favicon.relative_to(ROOT)} <- 256x256')


if __name__ == '__main__':
    main()
