"""Trucksy hero plate: the truck holds still in frame (like a tracking shot from a camera car)
while its wheels spin and the road streams past. 3 s seamless loop, 30 fps.
Everything is built from the single photo: clean plate + animated layers."""
import math, subprocess, sys
import cv2, numpy as np

N, FPS = 90, 30
SUB = 6                       # temporal sub-samples per frame (motion blur / shutter)
SHUTTER = 0.55                # fraction of a frame the "shutter" is open
src = cv2.imread('/home/claude/trucksy_project/website/trucksy-truck-hd.jpg').astype(np.float32)
clean = cv2.imread('clean.png').astype(np.float32)
road = np.load('road_mask.npy').astype(np.float32)
H, W = src.shape[:2]
road = cv2.GaussianBlur(road, (0, 0), 1.5)

# ---------------- road geometry (HD px) ----------------
VX, VY = 1052.6 * 2, 390 * 2          # vanishing point of the lane lines
YREF = 1264                            # reference row
def line_x(xr, y):                     # x on the road line that crosses YREF at xr
    return VX + (xr - VX) * (y - VY) / (YREF - VY)
def y_of_Z(Z): return VY + 1.0 / Z
C_W = 0.151                            # horizontal width of a 15 cm stripe per px of (y - VY)

P = 0.0031                             # dash period (depth units)
D = 0.00112                            # dash length
LOOP_SHIFT = 7 * P                     # road travel per loop -> seamless
Z_MIN, Z_MAX = 1.0 / (H - VY + 40), 0.09

lum = clean.mean(axis=2)
shade = cv2.GaussianBlur(lum, (0, 0), 14) / 52.0
shade = np.clip(shade, 0.35, 1.35)[..., None]

def quad(xr, z1, z2, half_w_scale):
    y1, y2 = y_of_Z(z1), y_of_Z(z2)
    w1, w2 = C_W * (y1 - VY) * half_w_scale, C_W * (y2 - VY) * half_w_scale
    x1, x2 = line_x(xr, y1), line_x(xr, y2)
    return np.array([[x1 - w1, y1], [x1 + w1, y1], [x2 + w2, y2], [x2 - w2, y2]])

def draw_layer(shapes):
    """shapes: list of (poly, alpha). Returns coverage layer (H,W) at 4x subpixel AA."""
    layer = np.zeros((H, W), np.float32)
    for poly, a in shapes:
        pts = np.round(poly * 8).astype(np.int32)
        cv2.fillPoly(layer, [pts], float(a), lineType=cv2.LINE_AA, shift=3)
    return layer

rng = np.random.default_rng(7)
STREAKS = [dict(xr=rng.uniform(-1700, 2200), ph=rng.uniform(0, LOOP_SHIFT),
                ln=rng.uniform(.25, .6) * P, a=rng.uniform(.035, .09), w=rng.uniform(.10, .35),
                light=rng.random() < .65) for _ in range(70)]

def road_layers(t):
    """t in [0,1) loop phase -> (dash coverage, light streaks, dark streaks), motion-blurred."""
    acc = [np.zeros((H, W), np.float32) for _ in range(3)]
    for k in range(SUB):
        dash, lite, dark = [], [], []
        tt = t + (k / (SUB - 1) - .5) * SHUTTER / N
        s = (tt * LOOP_SHIFT) % P
        z = -s + P * math.floor(Z_MIN / P)
        while z < Z_MAX:
            z1, z2 = max(z, Z_MIN * .97), z + D
            if z2 > Z_MIN * .97:
                fade = min(1.0, max(0.0, (Z_MAX - z) / (Z_MAX * .55)))
                dash.append((quad(0, z1, z2, .5), fade))
            z += P
        for st in STREAKS:
            z = (st['ph'] - tt * LOOP_SHIFT) % LOOP_SHIFT + Z_MIN * .9
            while z < Z_MAX * .6:
                (lite if st['light'] else dark).append((quad(st['xr'], z, z + st['ln'], st['w']), st['a'] * 1.6))
                z += LOOP_SHIFT
        for a, shapes in zip(acc, (dash, lite, dark)):
            a += draw_layer(shapes)
    return [a / SUB for a in acc]

# ---------------- wheels ----------------
WHEELS = [dict(c=(791, 930), rx=39, ry=62, tilt=4.0), dict(c=(1130, 893), rx=23, ry=47, tilt=3.0)]
DEG_PER_FRAME = 28.0                   # 90 * 28 = 7 full turns per loop -> seamless
BLUR_SPAN = 30.0

def wheel_setup(w):
    cx, cy = w['c']; R = int(w['ry'] * 1.35)
    box = (cx - R, cy - R, 2 * R, 2 * R)
    crop = src[cy - R:cy + R, cx - R:cx + R].copy()
    # ellipse (tilted, squashed) -> circle of radius ry, about the crop centre
    sx = w['ry'] / w['rx']
    rot = cv2.getRotationMatrix2D((R, R), -w['tilt'], 1.0)
    sc = np.array([[sx, 0, R - sx * R], [0, 1, 0]], np.float32)
    M = (np.vstack([sc, [0, 0, 1]]) @ np.vstack([rot, [0, 0, 1]]))[:2]
    Minv = cv2.invertAffineTransform(M)
    circ = cv2.warpAffine(crop, M, (2 * R, 2 * R), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    low = cv2.GaussianBlur(circ, (0, 0), w['ry'] * .22)
    yy, xx = np.mgrid[0:2 * R, 0:2 * R]
    # rotate only the rim (+ a little sidewall); feathered edge, in circle space
    r = np.hypot(xx - R + .5, yy - R + .5)
    a_circ = np.clip((w['ry'] * 1.10 - r) / 3.0, 0, 1).astype(np.float32)
    alpha = cv2.warpAffine(a_circ, Minv, (2 * R, 2 * R), flags=cv2.INTER_LINEAR)[..., None]
    w.update(R=R, crop=crop, M=M, Minv=Minv, circ=circ, low=low, alpha=alpha)

def wheel_frame(w, f):
    R, circ = w['R'], w['circ']
    acc = np.zeros_like(circ)
    n = 11
    for k in range(n):
        ang = f * DEG_PER_FRAME + (k / (n - 1) - .5) * BLUR_SPAN
        m = cv2.getRotationMatrix2D((R - .5, R - .5), ang, 1.0)   # +angle = counter-clockwise: top of wheel moves left
        acc += cv2.warpAffine(circ, m, (2 * R, 2 * R), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    acc /= n
    # keep the photo's lighting fixed (only the detail turns)
    acc = acc * (w['low'] + 2) / (cv2.GaussianBlur(acc, (0, 0), w['ry'] * .22) + 2)
    back = cv2.warpAffine(acc, w['Minv'], (2 * R, 2 * R), flags=cv2.INTER_CUBIC)
    return back

for w in WHEELS: wheel_setup(w)

# ---------------- dust behind the wheels ----------------
SMOKE = []
for i in range(36):
    em = (1168, 930) if i % 3 else (835, 1010)
    SMOKE.append(dict(em=em, spawn=i * N / 36 + rng.uniform(0, 2), life=rng.uniform(.55, .9) * N,
                      v=(rng.uniform(5.5, 8.5), rng.uniform(-2.6, -1.2)), r0=rng.uniform(10, 18),
                      a=rng.uniform(.05, .10) * (1 if i % 3 else .55)))
def smoke_layer(f):
    lay = np.zeros((H, W), np.float32)
    for p in SMOKE:
        age = (f - p['spawn']) % N
        if age > p['life']: continue
        u = age / p['life']
        x = p['em'][0] + p['v'][0] * age; y = p['em'][1] + p['v'][1] * age + 6 * u * u
        rad = p['r0'] + 70 * u
        a = p['a'] * math.sin(math.pi * min(1, u * 1.15)) ** 1.2
        cv2.circle(lay, (int(x), int(y)), int(rad), a, -1, cv2.LINE_AA)
    return cv2.GaussianBlur(lay, (0, 0), 14)

# ---------------- speed in the background (desert, guardrail) ----------------
def dir_blur(img, length, angle_deg):
    k = np.zeros((length, length), np.float32); k[length // 2, :] = 1
    k = cv2.warpAffine(k, cv2.getRotationMatrix2D((length / 2 - .5, length / 2 - .5), angle_deg, 1), (length, length))
    return cv2.filter2D(img, -1, k / k.sum())
bgmask = np.zeros((H, W), np.float32)
cv2.fillPoly(bgmask, [np.array([[0, 770], [300, 760], [300, 990], [0, 1050]])], 1)        # left of the cab
cv2.fillPoly(bgmask, [np.array([[1190, 760], [1500, 740], [1500, 880], [1190, 905]])], 1)  # behind the tractor
bgmask = cv2.GaussianBlur(bgmask, (0, 0), 18)[..., None] * (1 - cv2.GaussianBlur((1 - road), (0, 0), 1)[..., None] * 0)
base = clean * (1 - bgmask * .85) + dir_blur(clean, 41, 8) * bgmask * .85

DASH_RGB = np.array([228, 232, 230], np.float32)
roadA = road[..., None]

def frame(f):
    t = f / N
    out = base.copy()
    d, li, dk = road_layers(t)
    out = out * (1 - dk[..., None] * roadA) + (out * .55) * dk[..., None] * roadA
    out = out + li[..., None] * roadA * 70 * shade
    a = (d[..., None] * roadA)
    out = out * (1 - a) + DASH_RGB * shade / 3.6 * 3.6 * np.clip(shade, .35, 1.0) * a
    sm = smoke_layer(f)[..., None]
    out = out * (1 - sm) + np.array([182, 186, 184], np.float32) * sm
    for w in WHEELS:
        cx, cy = w['c']; R = w['R']
        reg = out[cy - R:cy + R, cx - R:cx + R]
        out[cy - R:cy + R, cx - R:cx + R] = reg * (1 - w['alpha']) + wheel_frame(w, f) * w['alpha']
    return np.clip(out, 0, 255).astype(np.uint8)

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'still':
        for f in (0, 45):
            cv2.imwrite(f'still{f}.png', frame(f))
        sys.exit()
    OUTW = 1200; OUTH = round(H * OUTW / W / 2) * 2
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-vf', f'scale={OUTW}:{OUTH}:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p',
                           '-movflags', '+faststart', '-an', 'truck-loop.mp4'], stdin=subprocess.PIPE)
    for f in range(N):
        fr = frame(f)
        if f == 0: cv2.imwrite('poster.jpg', cv2.resize(fr, (OUTW, OUTH), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 86])
        ff.stdin.write(fr.tobytes())
    ff.stdin.close(); ff.wait()
    print('done')
