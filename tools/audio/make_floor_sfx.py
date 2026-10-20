"""Build the floor-climb sound effects from two CC0 packs by Kenney (see public/sfx/CREDITS.md).

  python tools/audio/make_floor_sfx.py

Needs the raw packs unzipped in assets-src/floor-sfx/sci (Kenney "Sci-fi Sounds", the Audio folder inside) and
assets-src/floor-sfx/digital (Kenney "63 Digital SFX"). It cuts, layers, shapes and normalises each cue to a WAV, then
converts every WAV to .ogg and .mp3 in packages/client/public/sfx with tools/blender/convert_audio.py (one file per
Blender process; needs Blender 5.x at BLENDER or the default install path).
"""
import os, subprocess, sys
import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SCI = os.path.join(ROOT, "assets-src", "floor-sfx", "sci", "Audio")
DIG = os.path.join(ROOT, "assets-src", "floor-sfx", "digital")
WAV = os.path.join(ROOT, "assets-src", "floor-sfx", "wav")
OUT = os.path.join(ROOT, "packages", "client", "public", "sfx")
BLENDER = os.environ.get("BLENDER", r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe")
SR = 44100


def load(path):
    d, sr = sf.read(path)
    if d.ndim > 1:
        d = d.mean(1)
    if sr != SR:
        d = np.interp(np.linspace(0, len(d) - 1, int(len(d) * SR / sr)), np.arange(len(d)), d)
    return d.astype(np.float64)


def seconds(x):
    return len(x) / SR


def cut(x, a, b):
    return x[int(a * SR):int(b * SR)]


def fade(x, fin=0.01, fout=0.05):
    x = x.copy()
    n_in, n_out = int(fin * SR), int(fout * SR)
    if n_in:
        x[:n_in] *= np.linspace(0, 1, n_in) ** 1.5
    if n_out:
        x[-n_out:] *= np.linspace(1, 0, n_out) ** 1.5
    return x


def mix(*layers):
    """layers: (signal, gain, start_seconds)."""
    n = max(int((start + seconds(sig)) * SR) for sig, _, start in layers)
    out = np.zeros(n)
    for sig, gain, start in layers:
        i = int(start * SR)
        out[i:i + len(sig)] += sig * gain
    return out


def ramp_pitch(x, a, b):
    """Play x faster or slower over its length (speed a at the start, b at the end): the pitch glides."""
    n = len(x)
    speed = np.linspace(a, b, n)
    pos = np.cumsum(speed)
    pos = pos[pos < n - 1]
    return np.interp(pos, np.arange(n), x)


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def normalise(x, peak_db=-3.0):
    m = np.abs(x).max()
    return x * (10 ** (peak_db / 20) / m) if m > 0 else x


def build():
    cues = {}
    # jingle: two rising power-up phrases layered, the second one slightly later and softer
    cues["floor_cleared"] = fade(mix((cut(load(os.path.join(DIG, "powerUp3.mp3")), 0, 1.05), 1.0, 0.0), (cut(load(os.path.join(DIG, "powerUp1.mp3")), 0, 1.1), 0.5, 0.22)), 0.005, 0.25)
    # countdown: a short soft pep, and a brighter, longer one for the last three seconds
    cues["count_tick"] = fade(cut(load(os.path.join(DIG, "pepSound3.mp3")), 0, 0.14), 0.002, 0.06)
    cues["count_go"] = fade(cut(load(os.path.join(DIG, "powerUp5.mp3")), 0, 0.32), 0.002, 0.12)
    # charge: a force field swell played backwards builds up and stops at its peak
    ff = load(os.path.join(SCI, "forceField_002.ogg"))[::-1]
    cues["floor_charge"] = fade(cut(ff, 0, 0.9), 0.04, 0.02)
    # lift: an engine that climbs in pitch over thruster hiss, eased in and out
    eng = ramp_pitch(np.tile(load(os.path.join(SCI, "spaceEngine_001.ogg")), 2), 0.75, 1.35)
    hiss = load(os.path.join(SCI, "thrusterFire_003.ogg"))
    lift = mix((cut(eng, 0, 2.7), 0.9, 0.0), (cut(hiss, 0, 2.7), 0.35, 0.0))
    cues["floor_lift"] = fade(lift, 0.35, 0.7)
    # arrival: a deep thump with a bell-like power-up on top
    thump = lowpass(load(os.path.join(SCI, "lowFrequency_explosion_001.ogg")), 900)
    chime = load(os.path.join(DIG, "powerUp12.mp3"))
    cues["floor_arrive"] = fade(mix((cut(thump, 0, 1.0), 1.0, 0.0), (cut(chime, 0, 0.78), 0.55, 0.14)), 0.003, 0.3)
    # start: a low three-tone alarm horn
    cues["floor_start"] = fade(cut(load(os.path.join(DIG, "lowThreeTone.mp3")), 0, 0.96), 0.005, 0.12)
    return {k: normalise(v) for k, v in cues.items()}


def convert(wav, fmt, bitrate):
    subprocess.run([BLENDER, "-b", "--factory-startup", "--python", os.path.join(ROOT, "tools", "blender", "convert_audio.py"), "--", wav, OUT, str(bitrate), fmt], check=True, stdout=subprocess.DEVNULL)


if __name__ == "__main__":
    os.makedirs(WAV, exist_ok=True)
    for name, sig in build().items():
        path = os.path.join(WAV, name + ".wav")
        sf.write(path, sig, SR, subtype="PCM_16")
        print(name, round(seconds(sig), 2), "s")
        convert(path, "ogg", 96)
        convert(path, "mp3", 96)
    print("done", file=sys.stderr)
