#!/usr/bin/env python3
"""Generate Momo app icons matching the fnOS rounded-square icon style."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SIZE = 1024


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
    margin = int(size * 0.018)
    radius = int(size * 0.235)

    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))

    body_mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(body_mask).rounded_rectangle(
        (margin, margin, size - margin, size - margin),
        radius=radius,
        fill=255,
    )

    body = gradient(size, (96, 181, 255), (22, 119, 255)).convert('RGBA')
    gloss = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gloss_draw = ImageDraw.Draw(gloss)
    gloss_draw.ellipse(
        (-size * 0.3, -size * 0.52, size * 0.95, size * 0.42),
        fill=(255, 255, 255, 62),
    )
    gloss = gloss.filter(ImageFilter.GaussianBlur(int(size * 0.055)))
    body.alpha_composite(gloss)
    body.putalpha(body_mask)
    canvas.alpha_composite(body)

    draw = ImageDraw.Draw(canvas)
    stroke = int(size * 0.076)
    left = int(size * 0.253)
    right = int(size * 0.747)
    top = int(size * 0.337)
    bottom = int(size * 0.665)
    mid = int(size * 0.50)
    dot_r = int(size * 0.033)
    ink = (250, 253, 255, 255)

    points = [
        (left, bottom),
        (left, top),
        (mid, int(size * 0.575)),
        (right, top),
        (right, bottom),
    ]
    draw.line(points, fill=ink, width=stroke, joint='curve')
    for point in (points[0], points[-1]):
        draw.ellipse(
            (point[0] - stroke // 2, point[1] - stroke // 2, point[0] + stroke // 2, point[1] + stroke // 2),
            fill=ink,
        )
    draw.ellipse((mid - dot_r, int(size * 0.575) - dot_r, mid + dot_r, int(size * 0.575) + dot_r), fill=(255, 255, 255, 170))

    master = canvas.resize((SIZE, SIZE), Image.LANCZOS)

    targets = {
        ROOT / 'packaging' / 'ICON_256.PNG': 256,
        ROOT / 'packaging' / 'ICON.PNG': 64,
        ROOT / 'packaging' / 'app' / 'ui' / 'images' / 'icon_256.png': 256,
        ROOT / 'packaging' / 'app' / 'ui' / 'images' / 'icon_64.png': 64,
        ROOT / 'docs' / 'icon.png': 256,
        ROOT / 'frontend' / 'public' / 'icon-256.png': 256,
    }
    for path, target in targets.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        image = master.resize((target, target), Image.LANCZOS)
        image.save(path, 'PNG', optimize=True)
        print(f'{path.relative_to(ROOT)} <- {target}x{target}')


if __name__ == '__main__':
    main()
