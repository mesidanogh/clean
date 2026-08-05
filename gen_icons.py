from PIL import Image, ImageDraw

def make_icon(size, path):
    img = Image.new("RGB", (size, size), (0, 0, 0))
    draw = ImageDraw.Draw(img)

    # background gradient (pink -> purple)
    top = (255, 92, 141)
    bottom = (124, 58, 237)
    for y in range(size):
        t = y / size
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b))

    # rounded corners mask
    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    radius = int(size * 0.22)
    mdraw.rounded_rectangle([0, 0, size, size], radius=radius, fill=255)

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    draw = ImageDraw.Draw(out)

    # claw machine glyph: cable + claw (3 prongs) grabbing a small prize box
    cx = size / 2
    cable_top = size * 0.14
    cable_bottom = size * 0.42
    stroke = max(2, int(size * 0.035))
    white = (255, 255, 255, 255)

    # cable
    draw.line([(cx, cable_top), (cx, cable_bottom)], fill=white, width=stroke)

    # claw hub
    hub_r = size * 0.05
    draw.ellipse([cx - hub_r, cable_bottom - hub_r, cx + hub_r, cable_bottom + hub_r], fill=white)

    # three claw prongs (open, grabbing downward)
    prong_len = size * 0.16
    spread = size * 0.16
    for dx in (-spread, 0, spread):
        x1, y1 = cx, cable_bottom
        x2 = cx + dx
        y2 = cable_bottom + prong_len
        draw.line([(x1, y1), (x2, y2)], fill=white, width=stroke)
        # inward curl tip
        tip_dx = -dx * 0.35
        draw.line([(x2, y2), (x2 + tip_dx, y2 + size * 0.05)], fill=white, width=stroke)

    # prize box beneath
    box_w = size * 0.34
    box_h = size * 0.22
    box_top = size * 0.68
    box_left = cx - box_w / 2
    draw.rounded_rectangle(
        [box_left, box_top, box_left + box_w, box_top + box_h],
        radius=size * 0.03,
        outline=white,
        width=stroke,
    )
    # ribbon
    draw.line([(cx, box_top), (cx, box_top + box_h)], fill=white, width=stroke)
    draw.line([(box_left, box_top + box_h * 0.4), (box_left + box_w, box_top + box_h * 0.4)], fill=white, width=stroke)

    out.save(path)

sizes = {
    "icons/icon-192.png": 192,
    "icons/icon-512.png": 512,
    "icons/apple-touch-icon.png": 180,
    "icons/favicon-32.png": 32,
}

for path, sz in sizes.items():
    make_icon(sz, path)

print("done")
