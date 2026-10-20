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
    # the newer enemies: a charging whine, a magnetic hum, a phase blink
    t = t_(0.9)
    whine = tone(sweep(180, 900, 0.9, 1.7), 0.9, ((1, 1), (2, 0.3)), 0.05, 0.12, 1.3) * (0.6 + 0.4 * np.sin(t * 2 * np.pi * (6 + 18 * t)))
    c["charge_up"] = whine
    hum = tone(sweep(70, 120, 1.2, 0.6), 1.2, ((1, 1), (2, 0.5), (3, 0.25)), 0.08, 0.3, 1.2) * (0.75 + 0.25 * np.sin(t_(1.2) * 2 * np.pi * 14))
    c["pull_hum"] = hum
    zap = mix((fft_filter(noise(0.3), lo=1500) * env(int(0.3 * SR), 0.001, 0.3, 3), 0.6, 0.0), (tone(sweep(2400, 300, 0.25, 0.7), 0.25, release=0.2, curve=2), 0.7, 0.0))
    c["blink_zap"] = zap
    # melee: blade swishes (three takes) and hammer blows (two takes)
    for k, (f0, f1, ring) in enumerate(((900, 5200, 2600), (1100, 6200, 3100), (800, 4600, 2300)), 1):
        n = int(0.3 * SR)
        sw = fft_filter(noise(0.3), lo=f0, hi=f1) * np.sin(np.linspace(0, np.pi, n)) ** 1.4
        ringing = tone(ring, 0.28, ((1, 1), (2.1, 0.25)), 0.02, 0.2, 2.2) * 0.18
        c["gun_sword_%d" % k] = mix((sw, 1.0, 0.0), (ringing, 0.8, 0.05))
    for k, (f0, f1, thud) in enumerate(((150, 1400, 70), (180, 1700, 85)), 1):
        n = int(0.42 * SR)
        wh = fft_filter(noise(0.42), lo=f0, hi=f1) * np.sin(np.linspace(0, np.pi * 0.75, n)) ** 1.5
        hit = lowpass_env(noise(0.4), 700, 90) * env(int(0.4 * SR), 0.002, 0.4, 2.4)
        body = tone(sweep(thud * 1.8, thud * 0.6, 0.35, 0.6), 0.35, release=0.3, curve=2)
        c["gun_hammer_%d" % k] = mix((wh, 0.7, 0.0), (hit, 1.0, 0.3), (body, 0.9, 0.3))
    # class abilities: a rising chime, a low growl, a fast whoosh, an incoming whistle
    chime = lambda f, st: tone(f, 0.5, ((1, 1), (2, 0.3), (3, 0.12)), 0.01, 0.45, 2.0)
    c["ability_buff"] = mix((chime(523, 0), 0.8, 0.0), (chime(659, 0), 0.8, 0.09), (chime(784, 0), 0.8, 0.18), (chime(1047, 0), 0.9, 0.27))
    t9 = t_(0.9)
    growl = tone(sweep(60, 130, 0.9, 0.8), 0.9, ((1, 1), (2, 0.7), (3, 0.5), (4, 0.3)), 0.06, 0.4, 1.4) * (0.7 + 0.3 * np.sin(t9 * 2 * np.pi * 22))
    c["ability_power"] = mix((growl, 0.9, 0.0), (fft_filter(noise(0.9), lo=100, hi=1200) * env(int(0.9 * SR), 0.1, 0.5, 1.5), 0.35, 0.0))
    c["ability_whoosh"] = fft_filter(noise(0.5), lo=300, hi=7000) * np.sin(np.linspace(0, np.pi, int(0.5 * SR))) ** 1.2
    whistle = tone(sweep(2600, 500, 1.0, 0.9), 1.0, ((1, 1), (2, 0.15)), 0.02, 0.15, 1.1)
    click = fft_filter(noise(0.03), lo=1500, hi=5000) * env(int(0.03 * SR), 0.0005, 0.03, 2)
    c["airstrike_call"] = mix((click, 0.7, 0.0), (whistle, 0.6, 0.12))
    # gore: bone cracks and wet hits (three takes each), a decapitation, a limb torn off, a body bursting
    for k, f in enumerate((1800, 2400, 1500), 1):
        crack = fft_filter(noise(0.09), lo=f, hi=f * 3) * env(int(0.09 * SR), 0.0003, 0.09, 3.5)
        snap = tone(sweep(f * 0.8, f * 0.3, 0.05), 0.05, ((1, 1), (1.6, 0.4)), 0.0005, 0.05, 2)
        thud = lowpass_env(noise(0.18), 500, 100) * env(int(0.18 * SR), 0.001, 0.18, 3)
        c["bone_crack_%d" % k] = mix((crack, 1.0, 0.0), (snap, 0.5, 0.0), (thud, 0.7, 0.01))
    for k in range(1, 4):
        tw = t_(0.15)
        wet = lowpass_env(noise(0.22), 2200 + k * 300, 250) * env(int(0.22 * SR), 0.001, 0.22, 2.2)
        thump = tone(sweep(130, 55, 0.18), 0.18, release=0.16)
        squelch = fft_filter(noise(0.15), lo=300, hi=1400) * env(len(tw), 0.002, 0.15, 2) * (0.5 + 0.5 * np.sin(tw * 2 * np.pi * (35 + k * 6)))
        c["flesh_hit_%d" % k] = mix((wet, 1.0, 0.0), (thump, 0.8, 0.0), (squelch, 0.4, 0.04))
    slice_ = fft_filter(noise(0.14), lo=2000, hi=9000) * np.linspace(0.3, 1, int(0.14 * SR)) * env(int(0.14 * SR), 0.002, 0.06, 1.5)
    splash = lowpass_env(noise(0.5), 3200, 200) * env(int(0.5 * SR), 0.003, 0.5, 2)
    drips = np.zeros(int(0.7 * SR))
    for k in range(6):
        i = int((0.05 + k * 0.09 + rng.random() * 0.05) * SR)
        d = tone(sweep(900 + rng.random() * 600, 300, 0.05), 0.05, release=0.045, curve=2)
        drips[i:i + len(d)] += d * (0.5 - k * 0.05)
    c["gore_decap"] = mix((slice_, 0.9, 0.0), (splash, 1.0, 0.1), (tone(sweep(110, 45, 0.3), 0.3, release=0.27), 0.7, 0.12), (drips, 0.6, 0.25))
    tn = int(0.55 * SR)
    ripple = fft_filter(noise(0.55), lo=200, hi=2500) * env(tn, 0.01, 0.35, 1.6) * (0.55 + 0.45 * np.sin(t_(0.55) * 2 * np.pi * 30))
    snapp = fft_filter(noise(0.07), lo=1500, hi=6000) * env(int(0.07 * SR), 0.0004, 0.07, 3)
    c["gore_tear"] = mix((ripple, 0.9, 0.0), (snapp, 0.9, 0.12), (snapp, 0.7, 0.3), (lowpass_env(noise(0.3), 1500, 150) * env(int(0.3 * SR), 0.002, 0.3, 2.5), 0.9, 0.35))
    burst = lowpass_env(noise(0.7), 2800, 120) * env(int(0.7 * SR), 0.002, 0.7, 2)
    c["gib_burst"] = mix((burst, 1.0, 0.0), (tone(sweep(100, 38, 0.4), 0.4, release=0.36), 0.9, 0.0), (drips, 0.5, 0.2), (fft_filter(noise(0.1), lo=1200, hi=5000) * env(int(0.1 * SR), 0.0005, 0.1, 3), 0.6, 0.0))
    # building and demolition: a heavy thud with dust for a prop landing (three takes), and rubble breaking up (three takes)
    for k, (f0, body) in enumerate(((95, 0.55), (120, 0.5), (80, 0.65)), 1):
        thud = tone(sweep(f0 * 1.6, f0 * 0.55, 0.28, 0.6), 0.28, release=0.25, curve=2)
        hit = lowpass_env(noise(0.3), 900 + k * 200, 120) * env(int(0.3 * SR), 0.001, 0.3, 2.6)
        clack = fft_filter(noise(0.05), lo=1200, hi=6000) * env(int(0.05 * SR), 0.0004, 0.05, 3)
        dust = lowpass_env(fft_filter(noise(0.5), lo=300), 4000, 400) * env(int(0.5 * SR), 0.02, 0.45, 1.6) * 0.35
        c["build_thud_%d" % k] = mix((thud, 0.9, 0.0), (hit, 1.0, 0.0), (clack, 0.45, 0.0), (dust, body, 0.03))
    for k in range(1, 4):
        n = int(0.7 * SR)
        grind = lowpass_env(fft_filter(noise(0.7), lo=150), 3000, 250) * env(n, 0.02, 0.5, 1.4) * (0.6 + 0.4 * np.sin(t_(0.7) * 2 * np.pi * (14 + k * 5)))
        parts = np.zeros(n)
        for j in range(9):
            i = int((0.04 + j * 0.06 + rng.random() * 0.05) * SR)
            if i + int(0.04 * SR) >= n:
                break
            ck = fft_filter(noise(0.04), lo=900 + j * 120, hi=5000) * env(int(0.04 * SR), 0.0004, 0.04, 3)
            parts[i:i + len(ck)] += ck * (0.8 - j * 0.06)
        c["crumble_%d" % k] = mix((grind, 0.8, 0.0), (parts, 0.9, 0.0), (tone(sweep(90, 40, 0.4), 0.4, release=0.36), 0.6, 0.15))
    # ---- v0.19: the ten new guns (two takes each) and the sounds of the new enemies ----
    def take(seed):
        return np.random.default_rng(seed)

    for k in (1, 2):
        j = 0.92 + 0.16 * k / 2
        # railgun: a charging whine, a hard crack and a ringing tail
        n = int(0.9 * SR)
        whine = tone(sweep(400 * j, 3200 * j, 0.25, 1.6), 0.25, ((1, 1), (2, 0.3)), 0.01, 0.05, 1.2)
        crack = fft_filter(noise(0.12), lo=1500) * env(int(0.12 * SR), 0.0004, 0.12, 3)
        boom = lowpass_env(noise(0.4), 1800, 120) * env(int(0.4 * SR), 0.001, 0.4, 2.4)
        ring = tone(2400 * j, 0.7, ((1, 1), (1.5, 0.4)), 0.002, 0.65, 2.0) * 0.3
        c["gun_railgun_%d" % k] = mix((whine, 0.5, 0.0), (crack, 1.0, 0.24), (boom, 0.9, 0.24), (ring, 0.5, 0.25))
        # crossbow: a wooden twang and a short thwip
        twang = tone(sweep(300 * j, 140 * j, 0.25, 0.7), 0.25, ((1, 1), (2, 0.6), (3, 0.3)), 0.001, 0.22, 2.2)
        thwip = fft_filter(noise(0.1), lo=1200, hi=7000) * np.sin(np.linspace(0, np.pi, int(0.1 * SR))) ** 1.3
        thunk = lowpass_env(noise(0.12), 700, 150) * env(int(0.12 * SR), 0.001, 0.12, 3)
        c["gun_crossbow_%d" % k] = mix((twang, 0.8, 0.0), (thwip, 0.6, 0.02), (thunk, 0.7, 0.0))
        # plasma: a bright bubbling pew that falls in pitch
        pew = tone(sweep(2200 * j, 380 * j, 0.28, 0.6), 0.28, ((1, 1), (1.5, 0.35), (2, 0.2)), 0.002, 0.25, 1.6) * (0.75 + 0.25 * np.sin(t_(0.28) * 2 * np.pi * 70))
        zap = fft_filter(noise(0.08), lo=2500) * env(int(0.08 * SR), 0.0005, 0.08, 3)
        c["gun_plasma_%d" % k] = mix((pew, 0.9, 0.0), (zap, 0.4, 0.0), (lowpass_env(noise(0.2), 900, 120) * env(int(0.2 * SR), 0.001, 0.2, 2), 0.5, 0.0))
        # rocket: a hollow whoomp and a long hiss behind it
        whoomp = tone(sweep(150 * j, 45 * j, 0.5, 0.55), 0.5, ((1, 1), (2, 0.4)), 0.004, 0.45, 1.8)
        hiss = lowpass_env(fft_filter(noise(0.9), lo=300), 6000, 500) * env(int(0.9 * SR), 0.01, 0.8, 1.4)
        tube = lowpass_env(noise(0.2), 1400, 150) * env(int(0.2 * SR), 0.001, 0.2, 2.6)
        c["gun_rocket_%d" % k] = mix((whoomp, 1.0, 0.0), (hiss, 0.55, 0.05), (tube, 0.9, 0.0))
        # nailgun: a flat pneumatic thunk and a ping
        thunk = lowpass_env(noise(0.07), 2600, 500) * env(int(0.07 * SR), 0.0005, 0.07, 2.6)
        ping = tone(2900 * j, 0.09, ((1, 1), (2.7, 0.2)), 0.0005, 0.08, 3)
        c["gun_nailgun_%d" % k] = mix((thunk, 1.0, 0.0), (ping, 0.35, 0.01), (tone(sweep(180, 90, 0.07), 0.07, release=0.06), 0.7, 0.0))
        # auto shotgun: a shorter, snappier boom
        boom = lowpass_env(noise(0.3), 3200, 200) * env(int(0.3 * SR), 0.0008, 0.3, 2.2)
        c["gun_autoshotgun_%d" % k] = mix((boom, 1.0, 0.0), (fft_filter(noise(0.04), lo=1500) * env(int(0.04 * SR), 0.0003, 0.04, 3), 0.7, 0.0), (tone(sweep(130, 55, 0.2), 0.2, release=0.18), 0.8, 0.0))
        # akimbo: two small pistol pops a hair apart
        pop = lambda s: lowpass_env(noise(0.1), 4200, 400) * env(int(0.1 * SR), 0.0005, 0.1, 2.8) * s
        c["gun_akimbo_%d" % k] = mix((pop(1.0), 1.0, 0.0), (pop(0.8), 0.9, 0.035), (tone(sweep(260, 110, 0.08), 0.08, release=0.07), 0.5, 0.0))
        # frost gun: an airy hiss with glassy ticks
        hissf = lowpass_env(fft_filter(noise(0.35), lo=1500), 9000, 2500) * env(int(0.35 * SR), 0.004, 0.3, 1.6)
        glass = tone(sweep(4200 * j, 2600 * j, 0.18, 1.0), 0.18, ((1, 1), (1.4, 0.3)), 0.001, 0.15, 2.4)
        c["gun_frostgun_%d" % k] = mix((hissf, 0.8, 0.0), (glass, 0.45, 0.0), (lowpass_env(noise(0.1), 900, 200) * env(int(0.1 * SR), 0.001, 0.1, 2.4), 0.5, 0.0))
        # saw launcher: a whir that spins up and a heavy clack
        whir = tone(sweep(260 * j, 1100 * j, 0.35, 1.5), 0.35, ((1, 1), (2, 0.5), (3, 0.3)), 0.01, 0.1, 1.4) * (0.6 + 0.4 * np.sin(t_(0.35) * 2 * np.pi * 55))
        clack = fft_filter(noise(0.06), lo=900, hi=6000) * env(int(0.06 * SR), 0.0003, 0.06, 3)
        c["gun_sawlauncher_%d" % k] = mix((whir, 0.7, 0.0), (clack, 0.9, 0.0), (lowpass_env(noise(0.25), 1300, 150) * env(int(0.25 * SR), 0.001, 0.25, 2.4), 0.8, 0.0))
        # arc thrower: a buzzing crackle
        crackle = np.zeros(int(0.35 * SR))
        for q in range(14):
            i = int((q * 0.022 + take(k * 17 + q).random() * 0.012) * SR)
            blip = fft_filter(noise(0.015), lo=2000 + 200 * (q % 5)) * env(int(0.015 * SR), 0.0002, 0.015, 2)
            crackle[i:i + len(blip)] += blip * (0.9 - 0.04 * q)
        buzz = tone(sweep(520 * j, 360 * j, 0.3, 1.0), 0.3, ((1, 1), (2, 0.7), (3, 0.5), (5, 0.3)), 0.003, 0.25, 1.4) * 0.5
        c["gun_arcthrower_%d" % k] = mix((crackle, 1.0, 0.0), (buzz, 0.7, 0.0))

    # pounce: a rising whoosh and a heavy landing
    c["pounce"] = mix((lowpass_env(fft_filter(noise(0.45), lo=200) * np.sin(np.linspace(0, np.pi, int(0.45 * SR))) ** 1.2, 7000, 900), 0.8, 0.0), (tone(sweep(420, 900, 0.3, 0.8), 0.3, release=0.2), 0.25, 0.0))
    # grab: a metal clamp closing and a strained groan
    clamp = fft_filter(noise(0.08), lo=900, hi=5500) * env(int(0.08 * SR), 0.0004, 0.08, 3)
    c["grab"] = mix((clamp, 0.9, 0.0), (clamp, 0.7, 0.07), (tone(sweep(130, 70, 0.5, 0.7), 0.5, ((1, 1), (2, 0.6), (3, 0.4)), 0.02, 0.4, 1.4), 0.7, 0.05))
    # war horn: two low brass notes
    horn = lambda f, s: tone(f, s, ((1, 1), (2, 0.6), (3, 0.5), (4, 0.3), (5, 0.2)), 0.04, s * 0.5, 1.2) * (0.9 + 0.1 * np.sin(t_(s) * 2 * np.pi * 5))
    c["warhorn"] = mix((horn(110, 0.7), 0.9, 0.0), (horn(165, 0.9), 0.8, 0.55))
    # thunder: a crack and a long rolling rumble
    c["thunder"] = mix((fft_filter(noise(0.15), lo=1000) * env(int(0.15 * SR), 0.0004, 0.15, 3), 0.9, 0.0), (lowpass_env(noise(1.6), 900, 60) * env(int(1.6 * SR), 0.01, 1.5, 1.3) * (0.7 + 0.3 * np.sin(t_(1.6) * 2 * np.pi * 9)), 1.0, 0.05))
    # quake: a deep rumble with falling stones
    stones = np.zeros(int(1.1 * SR))
    for q in range(12):
        i = int((0.1 + q * 0.07 + take(q).random() * 0.05) * SR)
        st = fft_filter(noise(0.05), lo=500, hi=4000) * env(int(0.05 * SR), 0.0004, 0.05, 3)
        stones[i:i + len(st)] += st * 0.5
    c["quake"] = mix((lowpass_env(noise(1.1), 400, 40) * env(int(1.1 * SR), 0.02, 1.0, 1.5), 1.0, 0.0), (tone(sweep(60, 30, 1.0, 0.7), 1.0, release=0.9), 0.8, 0.0), (stones, 0.5, 0.0))
    # mine: two quick beeps
    c["mine_beep"] = mix((tone(1400, 0.07, ((1, 1), (2, 0.2)), 0.002, 0.05, 2), 0.7, 0.0), (tone(1400, 0.07, ((1, 1), (2, 0.2)), 0.002, 0.05, 2), 0.7, 0.12))
    # spike volley: a fan of quick thwips
    thw = lambda: fft_filter(noise(0.08), lo=1500, hi=8000) * np.sin(np.linspace(0, np.pi, int(0.08 * SR))) ** 1.2
    c["spike_volley"] = mix((thw(), 0.8, 0.0), (thw(), 0.7, 0.03), (thw(), 0.7, 0.06), (thw(), 0.6, 0.09), (thw(), 0.6, 0.12))
    # shock pulse: a ring of electricity going out
    c["shock_pulse"] = mix((tone(sweep(900, 140, 0.45, 0.6), 0.45, ((1, 1), (2, 0.5), (3, 0.3)), 0.002, 0.4, 1.8), 0.7, 0.0), (fft_filter(noise(0.3), lo=2200) * env(int(0.3 * SR), 0.0005, 0.3, 2.5), 0.6, 0.0))
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
