"""Cut single gunshots out of "The Free Firearm Sound Library" (CC0, https://opengameart.org/content/the-free-firearm-sound-library)
and synthesise the flamethrower and grenade launcher, writing mono 44.1 kHz WAV takes named gun_<weapon>_<n>.wav.

  python tools/audio/make_guns.py <extracted "Prepared SFX Library" folder> <out folder>

Then convert them to ogg and mp3 with tools/blender/convert_audio.py (one file per Blender process) into
packages/client/public/sfx. The reload sounds come from "Gun reload sounds" by SpringySpringo (CC0).
"""
import sys, os, wave, struct
import numpy as np

SR = 44100
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)


def read(path):
    with wave.open(path, "rb") as w:
        n, ch, sw, sr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    if sw == 2:
        x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768
    elif sw == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        v = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
        v = np.where(v >= 1 << 23, v - (1 << 24), v)
        x = v.astype(np.float32) / (1 << 23)
    else:
        raise ValueError("sample width %d" % sw)
    x = x.reshape(-1, ch).mean(axis=1)
    if sr != SR:
        t = np.arange(0, len(x) / sr, 1 / SR)
        x = np.interp(t, np.arange(len(x)) / sr, x).astype(np.float32)
    return x


def write(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def shots(x, count, dur, gap=1.2, pre=0.01):
    """The `count` loudest shots of a long recording: each starts at the loudest peak of its neighbourhood."""
    k = int(0.004 * SR)
    env = np.convolve(np.abs(x), np.ones(k) / k, mode="same")
    order = np.argsort(env)[::-1]
    peaks = []
    for i in order:
        if env[i] < 0.25 * env[order[0]]:
            break
        if all(abs(i - p) > gap * SR for p in peaks):
            peaks.append(i)
        if len(peaks) >= count * 3:
            break
    peaks.sort()
    # prefer shots that are clean: the quietest second before them
    def lead(i):
        a = max(0, i - int(0.4 * SR))
        return float(np.abs(x[a:max(a + 1, i - int(0.05 * SR))]).mean()) if i > 0 else 0
    peaks = sorted(peaks, key=lead)[:count]
    res = []
    for p in sorted(peaks):
        # walk back to where the report really starts
        lo = max(0, p - int(0.05 * SR))
        thr = 0.18 * env[p]
        start = lo
        for j in range(lo, p):
            if env[j] >= thr:
                start = j
                break
        a = max(0, start - int(pre * SR))
        seg = x[a:a + int(dur * SR)].copy()
        n = len(seg)
        fade = int(min(0.25 * n, 0.12 * SR))
        seg[n - fade:] *= np.linspace(1, 0, fade) ** 2
        seg = np.tanh(3.0 * seg / max(1e-6, np.abs(seg).max())) / np.tanh(3.0)  # soft clip: recorded reports are all transient, this lifts the body
        seg *= 0.92 / max(1e-6, np.abs(seg).max())
        res.append(seg)
    return res


def pick(folder, name_part=None):
    d = os.path.join(src, folder)
    files = sorted(f for f in os.listdir(d) if f.lower().endswith(".wav"))
    return os.path.join(d, files[-1] if name_part is None else next(f for f in files if name_part in f))


# weapon -> (folder, file, takes, seconds): recorded guns, picked to sound different from each other
RECORDED = {
    "pistol": ("1911", "A_42P", 3, 0.55),
    "revolver": ("Smith & Wesson 642", "V_27P", 3, 0.9),
    "mp": ("Walther PPQ", "X_39P", 3, 0.3),
    "smg": ("Carl Gustav M45", "G_31P", 3, 0.32),
    "ar": ("AR-15", "D_32P", 3, 0.5),
    "shotgun": ("Nova", "O_21P", 3, 0.8),
    "dbl": ("Mossberg", "N_30P", 3, 1.0),
    "hmg": ("AK-47", "C_28P", 3, 0.6),
    "minigun": ("PPSh", "P_30P", 3, 0.22),
    "sniper": ("Mosin Nagant", "M_21P", 3, 1.3),
    "dmr": ("SKS", "U_14P", 3, 0.8),
}

rng = np.random.default_rng(7)


def lowpass(x, cutoff):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x)).astype(np.float32)


def bandpass(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= (1 / (1 + (lo / np.maximum(f, 1)) ** 4)) / (1 + (f / hi) ** 4)
    return np.fft.irfft(X, len(x)).astype(np.float32)


def flame(i):
    """A short whoosh: ignition thump, then roaring filtered noise."""
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n).astype(np.float32)
    body = bandpass(noise, 250 + 80 * i, 2600) * (np.minimum(1, t / 0.03) * np.exp(-t * 4.5))
    thump = np.sin(2 * np.pi * (110 - 60 * t) * t) * np.exp(-t * 22) * 0.9
    crackle = (rng.random(n) < 0.002) * rng.standard_normal(n) * 0.5 * np.exp(-t * 3)
    x = (body * 1.4 + thump + crackle) * np.minimum(1, (n - np.arange(n)) / (0.08 * SR))
    return (x * 0.9 / np.abs(x).max()).astype(np.float32)


def launcher(i):
    """A fat thump with a hollow tube pop and a little air."""
    n = int(0.7 * SR)
    t = np.arange(n) / SR
    sweep = np.sin(2 * np.pi * (180 * np.exp(-t * 7) + 38) * t) * np.exp(-t * 6)
    pop = lowpass(rng.standard_normal(n).astype(np.float32), 1800) * np.exp(-t * 30) * 0.8
    tube = np.sin(2 * np.pi * (420 - 120 * t) * t) * np.exp(-t * 16) * 0.35
    air = bandpass(rng.standard_normal(n).astype(np.float32), 600, 4000) * np.exp(-t * 9) * 0.25
    x = sweep + pop + tube + air
    return (x * 0.92 / np.abs(x).max()).astype(np.float32)


def main():
    for wid, (folder, part, takes, dur) in RECORDED.items():
        x = read(pick(folder, part))
        cuts = shots(x, takes, dur)
        for i, c in enumerate(cuts, 1):
            write(os.path.join(out, "gun_%s_%d.wav" % (wid, i)), c)
        print(wid, len(cuts), "takes from", folder)
    for i in range(1, 4):
        write(os.path.join(out, "gun_flamer_%d.wav" % i), flame(i))
        write(os.path.join(out, "gun_gl_%d.wav" % i), launcher(i))
    print("done")


main()
