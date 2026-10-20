"""Synthesise the event sound effects that have no recorded source (all generated here from sine/noise: CC0, original).

  python tools/audio/make_event_sfx.py [name ...]

Each cue is built with numpy only, written as a WAV in assets-src/event-sfx/wav and converted to .ogg and .mp3 in
packages/client/public/sfx with tools/blender/convert_audio.py (one file per Blender process; Blender 5.x at BLENDER or the
default install path). Without names every cue is built.
"""
import os, subprocess, sys
import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
WAV = os.path.join(ROOT, "assets-src", "event-sfx", "wav")
OUT = os.path.join(ROOT, "packages", "client", "public", "sfx")
BLENDER = os.environ.get("BLENDER", r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe")
SR = 44100
rng = np.random.default_rng(20261020)


def t_(sec):
    return np.arange(int(sec * SR)) / SR


def env(n, attack=0.005, release=0.2, curve=2.0):
    e = np.ones(n)
    a, r = int(attack * SR), int(release * SR)
    if a:
        e[:a] = np.linspace(0, 1, a)
    if r:
        r = min(r, n)
        e[-r:] *= np.linspace(1, 0, r) ** curve
    return e


def tone(freq, sec, harmonics=((1, 1.0),), attack=0.004, release=None, curve=2.0):
    t = t_(sec)
    f = freq if np.ndim(freq) else np.full_like(t, freq)
    phase = 2 * np.pi * np.cumsum(f) / SR
    x = sum(a * np.sin(phase * h) for h, a in harmonics)
    return x * env(len(t), attack, sec * 0.9 if release is None else release, curve)


def noise(sec):
    return rng.standard_normal(int(sec * SR))


def fft_filter(x, lo=None, hi=None):
    """Brick-wall band pass with a soft edge, via the FFT."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi:
        g *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(spec * g, len(x))


def mix(*layers):
    n = max(int(start * SR) + len(sig) for sig, _, start in layers)
    out = np.zeros(n)
    for sig, gain, start in layers:
        i = int(start * SR)
        out[i:i + len(sig)] += sig * gain
    return out


def sweep(f0, f1, sec, curve=1.0):
    t = np.linspace(0, 1, int(sec * SR)) ** curve
    return f0 * (f1 / f0) ** t


def normalise(x, peak=0.89):
    return x / max(1e-9, np.abs(x).max()) * peak


def lowpass_env(x, f0, f1):
    """A low-pass whose cutoff glides from f0 to f1 over the length of the sound (block-wise)."""
    out = np.zeros_like(x)
    block = 1024
    for i in range(0, len(x), block):
        f = f0 * (f1 / f0) ** (i / len(x))
        seg = x[i:i + block]
        pad = np.pad(seg, (0, max(0, block - len(seg))))
        out[i:i + len(seg)] = fft_filter(pad, hi=f)[:len(seg)]
    return out


def build():
    c = {}
    # a level-up style card offer: two soft bell notes
    bell = lambda f, s: tone(f, s, ((1, 1), (2.76, 0.35), (5.4, 0.12)), 0.003, s * 0.95, 2.4)
    c["card_offer"] = mix((bell(784, 0.7), 0.7, 0.0), (bell(1175, 0.9), 0.6, 0.11))
    # freeze: a glassy shimmer with ice cracking
    shimmer = tone(sweep(2800, 5200, 0.7), 0.7, ((1, 1), (1.5, 0.4)), 0.02, 0.5) * 0.4
    crack = fft_filter(noise(0.5), lo=3500) * env(int(0.5 * SR), 0.001, 0.5, 4)
    cracks = np.zeros(int(0.8 * SR))
    for k in range(7):
        i = int((0.02 + k * 0.07 + rng.random() * 0.04) * SR)
        burst = fft_filter(noise(0.04), lo=2500 + k * 300) * env(int(0.04 * SR), 0.0005, 0.04, 3)
        cracks[i:i + len(burst)] += burst * (1.0 - k * 0.08)
    c["ice_freeze"] = mix((shimmer, 0.8, 0.0), (crack, 0.6, 0.0), (cracks, 0.9, 0.05))
    # thaw: the coat shatters and drips
    shatter = np.zeros(int(0.7 * SR))
    for k in range(18):
        i = int(rng.random() * 0.35 * SR)
        f = 2200 + rng.random() * 5000
        tk = tone(f, 0.12, ((1, 1), (2.3, 0.3)), 0.0005, 0.11, 3)
        shatter[i:i + len(tk)] += tk * (0.25 + rng.random() * 0.5)
    c["ice_thaw"] = mix((shatter, 1.0, 0.0), (fft_filter(noise(0.4), lo=4000) * env(int(0.4 * SR), 0.001, 0.4, 3), 0.5, 0.0))
    # nuke: a deep boom, a long rumble and a rising whoosh before it
    n = int(3.2 * SR)
    boom = lowpass_env(noise(3.2), 700, 60) * env(n, 0.004, 3.0, 1.6)
    sub = tone(sweep(90, 28, 3.0, 0.6), 3.0, release=2.8, curve=1.5) * 1.1
    air = fft_filter(noise(0.9), lo=500, hi=7000) * np.linspace(0, 1, int(0.9 * SR)) ** 2 * env(int(0.9 * SR), 0.3, 0.05, 1)
    c["nuke_boom"] = mix((air, 0.5, 0.0), (boom, 1.0, 0.8), (sub, 0.9, 0.8))
    # second wind: a heartbeat double and a rising chime
    beat = lambda: tone(sweep(70, 40, 0.18), 0.18, release=0.16)
    chime = tone(sweep(520, 1040, 0.5, 0.7), 0.5, ((1, 1), (2, 0.3)), 0.02, 0.4)
    c["second_wind"] = mix((beat(), 1.0, 0.0), (beat(), 0.8, 0.22), (chime, 0.55, 0.3))
    # weapon pickup: a metal ratchet and a short tick
    ratchet = np.zeros(int(0.3 * SR))
    for k in range(4):
        i = int((k * 0.045) * SR)
        click = fft_filter(noise(0.02), lo=1500, hi=9000) * env(int(0.02 * SR), 0.0005, 0.02, 3)
        ratchet[i:i + len(click)] += click * (0.6 + 0.1 * k)
    c["weapon_get"] = mix((ratchet, 0.9, 0.0), (tone(660, 0.14, ((1, 1), (2, 0.4)), 0.003, 0.12, 2), 0.5, 0.17), (tone(990, 0.2, ((1, 1), (2, 0.3)), 0.003, 0.18, 2), 0.4, 0.22))
    # a player falls for good: a low falling tone and a thud
    fall = tone(sweep(220, 55, 0.9, 0.8), 0.9, ((1, 1), (2, 0.25)), 0.01, 0.85, 1.6)
    thud = lowpass_env(noise(0.35), 400, 80) * env(int(0.35 * SR), 0.002, 0.35, 3)
    c["player_dead"] = mix((fall, 0.7, 0.0), (thud, 1.0, 0.55))
    # arriving on a floor: a soft airy whoosh
    c["floor_enter"] = lowpass_env(fft_filter(noise(1.1), lo=120) * np.sin(np.linspace(0, np.pi, int(1.1 * SR))) ** 1.5, 5000, 600)
    # final-kill slow motion: a falling filter sweep with a heartbeat, and the same rewinding back
    n = int(1.4 * SR)
    sw = lowpass_env(fft_filter(noise(1.4), lo=80) * env(n, 0.05, 1.0, 1.5), 9000, 300)
    hb = mix((tone(sweep(65, 38, 0.2), 0.2, release=0.18), 1.0, 0.1), (tone(sweep(65, 38, 0.2), 0.2, release=0.18), 0.8, 0.42), (tone(sweep(60, 34, 0.24), 0.24, release=0.22), 0.9, 0.9))
    c["slowmo_in"] = mix((sw, 0.6, 0.0), (hb, 0.9, 0.0))
    back = lowpass_env(fft_filter(noise(0.9), lo=100) * np.linspace(0, 1, int(0.9 * SR)) ** 1.5 * env(int(0.9 * SR), 0.5, 0.15, 1), 300, 9000)
    c["slowmo_out"] = mix((back, 0.7, 0.0), (tone(sweep(120, 480, 0.7, 1.4), 0.7, release=0.3), 0.25, 0.0))
    # ground attacks: a rising warning, the blows that land, acid, a throw
    beep = lambda f, s: tone(f, s, ((1, 1), (2, 0.2)), 0.004, s * 0.6, 1.5)
    c["warn_circle"] = mix((beep(660, 0.12), 0.8, 0.0), (beep(740, 0.12), 0.8, 0.16), (beep(880, 0.16), 0.9, 0.32))
    c["warn_line"] = mix((tone(sweep(300, 1500, 0.8, 1.6), 0.8, ((1, 1), (3, 0.15)), 0.05, 0.1, 1.2), 0.6, 0.0))
    slam = lowpass_env(noise(0.8), 600, 70) * env(int(0.8 * SR), 0.002, 0.8, 2.2)
    crack = fft_filter(noise(0.18), lo=1200) * env(int(0.18 * SR), 0.0005, 0.18, 3)
    c["slam_hit"] = mix((slam, 1.0, 0.0), (crack, 0.6, 0.0), (tone(sweep(120, 38, 0.6, 0.5), 0.6, release=0.55), 0.9, 0.0))
    purge = lowpass_env(noise(1.8), 900, 50) * env(int(1.8 * SR), 0.004, 1.8, 1.7)
    rev = fft_filter(noise(0.7), lo=200, hi=6000) * np.linspace(0, 1, int(0.7 * SR)) ** 2.5 * env(int(0.7 * SR), 0.3, 0.02, 1)
    c["purge_hit"] = mix((rev, 0.5, 0.0), (purge, 1.0, 0.45), (tone(sweep(80, 26, 1.7, 0.6), 1.7, release=1.6, curve=1.4), 1.0, 0.45))
    splat = lowpass_env(noise(0.25), 3000, 300) * env(int(0.25 * SR), 0.001, 0.25, 2)
    fizz = fft_filter(noise(0.7), lo=4000) * env(int(0.7 * SR), 0.02, 0.7, 1.2) * (0.5 + 0.5 * np.sin(np.arange(int(0.7 * SR)) / SR * 90))
    c["acid_splash"] = mix((splat, 1.0, 0.0), (fizz, 0.35, 0.05))
    whoosh = lowpass_env(fft_filter(noise(0.5), lo=150) * np.sin(np.linspace(0, np.pi, int(0.5 * SR))) ** 1.2, 6000, 700)
    c["launch"] = mix((whoosh, 0.9, 0.0), (tone(sweep(150, 60, 0.25), 0.25, release=0.22), 0.7, 0.0))
    return {k: normalise(v) for k, v in c.items()}


def convert(wav, fmt, bitrate):
    subprocess.run([BLENDER, "-b", "--factory-startup", "--python", os.path.join(ROOT, "tools", "blender", "convert_audio.py"), "--", wav, OUT, str(bitrate), fmt], check=True, stdout=subprocess.DEVNULL)


if __name__ == "__main__":
    os.makedirs(WAV, exist_ok=True)
    only = set(sys.argv[1:])
    for name, sig in build().items():
        if only and name not in only:
            continue
        path = os.path.join(WAV, name + ".wav")
        sf.write(path, sig, SR, subtype="PCM_16")
        print(name, round(len(sig) / SR, 2), "s")
        convert(path, "ogg", 96)
        convert(path, "mp3", 96)
    print("done", file=sys.stderr)
