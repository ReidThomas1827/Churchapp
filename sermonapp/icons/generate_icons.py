"""
Generates the PWA app icons (microphone-on-gradient) with no third-party deps.
Pure stdlib: writes 8-bit RGBA PNGs by hand.

Run:  py icons/generate_icons.py
Produces: icon-192.png, icon-512.png, apple-touch-icon.png  (in this folder)
"""
import zlib, struct, math, os

HERE = os.path.dirname(os.path.abspath(__file__))

# ---- gradient + glyph colors -------------------------------------------------
A = (79, 70, 229)    # #4F46E5 indigo  (top-left)
B = (147, 51, 234)   # #9333EA violet  (bottom-right)
WHITE = (255, 255, 255)

def lerp(c0, c1, t):
    return tuple(round(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))

# ---- microphone glyph membership (normalized 0..1 space) ---------------------
def dist(ax, ay, bx, by):
    return math.hypot(ax - bx, ay - by)

def in_vcapsule(x, y, cx, top, bot, hw):
    cy = min(max(y, top + hw), bot - hw)
    return dist(x, y, cx, cy) <= hw

def in_hcapsule(x, y, cy, left, right, hh):
    cx = min(max(x, left + hh), right - hh)
    return dist(x, y, cx, cy) <= hh

def is_mic(x, y):
    cx = 0.5
    # mic head (capsule)
    if in_vcapsule(x, y, cx, 0.26, 0.52, 0.085):
        return True
    # cradle: lower half of an annulus
    cyc = 0.45
    d = dist(x, y, cx, cyc)
    if 0.145 <= d <= 0.175 and y >= cyc:
        return True
    # stem
    if in_vcapsule(x, y, cx, 0.62, 0.72, 0.012):
        return True
    # base
    if in_hcapsule(x, y, 0.74, 0.41, 0.59, 0.013):
        return True
    return False

# ---- render at supersample SS, then box-downsample --------------------------
def render(size, ss=3):
    hi = size * ss
    # build hi-res RGB (opaque) buffer
    buf = bytearray(hi * hi * 3)
    for j in range(hi):
        ny = (j + 0.5) / hi
        row = j * hi * 3
        for i in range(hi):
            nx = (i + 0.5) / hi
            if is_mic(nx, ny):
                r, g, b = WHITE
            else:
                r, g, b = lerp(A, B, (nx + ny) / 2)
            o = row + i * 3
            buf[o] = r; buf[o + 1] = g; buf[o + 2] = b
    # downsample to size, emit RGBA (opaque)
    out = bytearray(size * size * 4)
    n = ss * ss
    for y in range(size):
        for x in range(size):
            sr = sg = sb = 0
            for dy in range(ss):
                base = ((y * ss + dy) * hi + x * ss) * 3
                for dx in range(ss):
                    p = base + dx * 3
                    sr += buf[p]; sg += buf[p + 1]; sb += buf[p + 2]
            o = (y * size + x) * 4
            out[o] = sr // n; out[o + 1] = sg // n; out[o + 2] = sb // n; out[o + 3] = 255
    return out

def write_png(path, size, pixels):
    def chunk(typ, data):
        return (struct.pack(">I", len(data)) + typ + data +
                struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff))
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)  # filter: none
        raw.extend(pixels[y * stride:(y + 1) * stride])
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) +
                chunk(b"IDAT", zlib.compress(bytes(raw), 9)) +
                chunk(b"IEND", b""))
    print("wrote", os.path.basename(path))

if __name__ == "__main__":
    for name, size in (("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180)):
        write_png(os.path.join(HERE, name), size, render(size))
    print("done")
