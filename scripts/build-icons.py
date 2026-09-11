#!/usr/bin/env python3
"""Regenerate extension/icons/*.png from extension/icon.svg, with transparency.

The committed PNGs had been exported onto an opaque white background, so their
rounded corners held white rather than nothing and showed as white nubs around
the icon in the Chrome/Firefox toolbar (worst against a dark theme). icon.svg
was always correct; only the export was wrong.

Renders the SVG ONCE at 1024x1024 on a transparent page, then area-averages down
to each size. Rendering each small size directly in its own tiny headless window
does not work: Chrome mis-rasterises there, leaving e.g. a 2x2 block of alpha
191 in the corner of a 32px icon where there should be nothing.

Downsampling premultiplies alpha, so transparent pixels cannot bleed their
colour into the edge — the usual cause of a dark halo around a scaled icon.

NOTE: store/appicon/icon-1024.png is deliberately not touched. Apple rejects
icons with an alpha channel, so that one stays opaque; it is generated from
store/appicon/icon-app.svg by scripts/build-xcode.sh.

Usage:  ./scripts/build-icons.py
"""
import os, re, struct, subprocess, sys, tempfile, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG = os.path.join(ROOT, "extension", "icon.svg")
OUT = os.path.join(ROOT, "extension", "icons")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
MASTER = 1024
SIZES = [16, 32, 48, 128, 256, 512]


def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc: return a
    return b if pb <= pc else c


def decode_rgba(path):
    raw = open(path, "rb").read()
    w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", raw[16:29])
    assert (depth, ctype, interlace) == (8, 6, 0), f"expected 8-bit RGBA, got {depth}/{ctype}"
    idat = b""
    i = 8
    while i < len(raw):
        ln = struct.unpack(">I", raw[i:i + 4])[0]
        if raw[i + 4:i + 8] == b"IDAT":
            idat += raw[i + 8:i + 8 + ln]
        i += 8 + ln + 4
    data = zlib.decompress(idat)
    stride = w * 4
    px = bytearray(h * stride)
    prev = bytearray(stride)
    pos = 0
    for y in range(h):
        ft = data[pos]; pos += 1
        line = bytearray(data[pos:pos + stride]); pos += stride
        if ft == 1:
            for x in range(4, stride): line[x] = (line[x] + line[x - 4]) & 0xFF
        elif ft == 2:
            for x in range(stride): line[x] = (line[x] + prev[x]) & 0xFF
        elif ft == 3:
            for x in range(stride):
                a = line[x - 4] if x >= 4 else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 0xFF
        elif ft == 4:
            for x in range(stride):
                a = line[x - 4] if x >= 4 else 0
                c = prev[x - 4] if x >= 4 else 0
                line[x] = (line[x] + paeth(a, prev[x], c)) & 0xFF
        elif ft != 0:
            raise ValueError(f"bad PNG filter {ft}")
        px[y * stride:(y + 1) * stride] = line
        prev = line
    return w, h, px


def encode_rgba(w, h, px):
    rows = bytearray()
    stride = w * 4
    for y in range(h):
        rows.append(0)
        rows += px[y * stride:(y + 1) * stride]

    def chunk(t, b):
        return struct.pack(">I", len(b)) + t + b + struct.pack(">I", zlib.crc32(t + b) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
            + chunk(b"IEND", b""))


def downsample(sw, sh, src, size):
    """Area-average to size x size, premultiplying alpha."""
    out = bytearray(size * size * 4)
    for oy in range(size):
        y0, y1 = oy * sh // size, max(oy * sh // size + 1, (oy + 1) * sh // size)
        for ox in range(size):
            x0, x1 = ox * sw // size, max(ox * sw // size + 1, (ox + 1) * sw // size)
            r = g = b = a = n = 0
            for y in range(y0, y1):
                base = y * sw
                for x in range(x0, x1):
                    i = (base + x) * 4
                    al = src[i + 3]
                    r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al
                    a += al; n += 1
            j = (oy * size + ox) * 4
            if a:
                out[j] = min(255, round(r / a)); out[j + 1] = min(255, round(g / a))
                out[j + 2] = min(255, round(b / a)); out[j + 3] = round(a / n)
            # else leave fully transparent black
    return out


def main():
    if not os.path.isfile(SVG):
        print(f"missing {SVG}", file=sys.stderr); return 1
    if not os.path.isfile(CHROME):
        print("Google Chrome not found", file=sys.stderr); return 1

    svg = open(SVG).read()
    svg = re.sub(r'width="512" height="512"', f'width="{MASTER}" height="{MASTER}"', svg, count=1)

    with tempfile.TemporaryDirectory() as tmp:
        page = os.path.join(tmp, "icon.html")
        open(page, "w").write(
            "<!DOCTYPE html><meta charset='utf-8'><style>html,body{margin:0;padding:0;"
            f"width:{MASTER}px;height:{MASTER}px;overflow:hidden;background:transparent}}"
            "svg{display:block}</style>" + svg)
        master = os.path.join(tmp, "master.png")
        subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
                        "--default-background-color=00000000", "--virtual-time-budget=4000",
                        f"--window-size={MASTER},{MASTER}", f"--screenshot={master}",
                        f"file://{page}"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        w, h, px = decode_rgba(master)
        if (w, h) != (MASTER, MASTER):
            print(f"master rendered {w}x{h}, expected {MASTER}", file=sys.stderr); return 1
        if px[3] != 0:
            print("master corner is not transparent — SVG or flags wrong", file=sys.stderr); return 1

        for s in SIZES:
            data = downsample(w, h, px, s)
            open(os.path.join(OUT, f"icon-{s}.png"), "wb").write(encode_rgba(s, s, data))
            corner = data[3]
            centre = data[((s // 2) * s + s // 2) * 4 + 3]
            print(f"  icon-{s}.png  {s}x{s}  corner alpha={corner}  centre alpha={centre}")
            if corner != 0 or centre != 255:
                print(f"  unexpected alpha in icon-{s}.png", file=sys.stderr); return 1

    print(f"Regenerated {len(SIZES)} icons from icon.svg.")
    print("Run ./scripts/build-webext.sh to fold them into dist/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
