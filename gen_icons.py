from PIL import Image, ImageDraw

BG_COLOR = (222, 124, 14)  # burnt orange
WHITE = (255, 255, 255, 255)


def quad_bezier(p0, p1, p2, steps=40):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
        pts.append((x, y))
    return pts


def stroke_path(draw, points, width, fill):
    r = width / 2
    for (x, y) in points:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def make_icon(size, path):
    s = size / 100.0  # work in a 100x100 design grid, then scale

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg = Image.new("RGBA", (size, size), BG_COLOR)
    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle([0, 0, size, size], radius=size * 0.13, fill=255)
    img.paste(bg, (0, 0), mask)

    draw = ImageDraw.Draw(img)

    def P(x, y):
        return (x * s, y * s)

    # --- cable ---
    draw.line([P(50, 8), P(50, 20)], fill=WHITE, width=round(6 * s))
    draw.ellipse(
        [P(50, 8)[0] - 3 * s, P(50, 8)[1] - 3 * s, P(50, 8)[0] + 3 * s, P(50, 8)[1] + 3 * s],
        fill=WHITE,
    )

    # --- claw hub (pill shape) ---
    draw.rounded_rectangle(
        [P(38, 18)[0], P(38, 18)[1], P(62, 30)[0], P(62, 30)[1]],
        radius=6 * s,
        fill=WHITE,
    )

    # --- claw arms: angular mechanical claw (hub -> outward/down elbow -> inward/down tip) ---
    arm_width = 10 * s

    def segment(p0, p1, steps=24):
        return [
            (p0[0] + (p1[0] - p0[0]) * i / steps, p0[1] + (p1[1] - p0[1]) * i / steps)
            for i in range(steps + 1)
        ]

    for side in (-1, 1):
        hub = P(50 + side * 10, 27)
        elbow = P(50 + side * 26, 42)
        tip = P(50 + side * 12, 53)
        stroke_path(draw, segment(hub, elbow), arm_width, WHITE)
        stroke_path(draw, segment(elbow, tip), arm_width, WHITE)

    # --- gift box beneath ---
    box_top = 56
    box_mid = 64
    box_bottom = 88
    box_left = 32
    box_right = 68
    cx = 50

    # tented lid (diamond/kite)
    draw.polygon(
        [P(cx, box_top), P(box_right, box_mid), P(cx, box_mid + 6), P(box_left, box_mid)],
        fill=WHITE,
    )
    # box body (hexagon-ish, tapering slightly at the very bottom)
    draw.polygon(
        [
            P(box_left, box_mid),
            P(box_right, box_mid),
            P(box_right - 3, box_bottom),
            P(box_left + 3, box_bottom),
        ],
        fill=WHITE,
    )
    # seam line (cut out in bg color) across the middle of the box
    draw.line([P(box_left, box_mid + 9), P(box_right, box_mid + 9)], fill=BG_COLOR, width=round(2.2 * s))
    # small buckle/tab at the front seam
    draw.rounded_rectangle(
        [P(cx - 5, box_mid + 6)[0], P(cx - 5, box_mid + 6)[1], P(cx + 5, box_mid + 13)[0], P(cx + 5, box_mid + 13)[1]],
        radius=2 * s,
        fill=BG_COLOR,
    )

    img.save(path)


sizes = {
    "icons/icon-192.png": 192,
    "icons/icon-512.png": 512,
    "icons/apple-touch-icon.png": 180,
    "icons/favicon-32.png": 32,
}

for path, sz in sizes.items():
    make_icon(sz, path)

print("done")
