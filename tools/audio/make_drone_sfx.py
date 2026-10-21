"""Cut, level and convert the drone sounds from recorded sources (CC0, see packages/client/public/sfx/CREDITS.md).

  python tools/audio/make_drone_sfx.py [name ...]

The sources are downloaded once into assets-src/drone-sfx/_dl (not shipped, not in git):
  https://opengameart.org/sites/default/files/sci-fi_sounds.zip      Kenney, "Sci-Fi Sounds" (CC0)
  https://opengameart.org/sites/default/files/Digital_SFX_Set.zip    Kenney, "63 digital sound effects" (CC0)
  https://opengameart.org/sites/default/files/icespells.zip          bart, "ice spells" (CC0)
  https://opengameart.org/sites/default/files/UISoundEffects.zip     Joth, "7 assorted sound effects (menu, level up)" (CC0)
  (unzip each next to itself; health_restore.wav, "Magic words + healing" by Spring Spring (CC0), is used as it is)

Nothing here is synthesised: every cue is a recording that is trimmed, filtered where it was harsh, levelled by RMS and capped
by a soft limiter so that all drone sounds sit in the loudness band of the game's own effects (guns peak around 0.5 to 0.7
with an RMS of about 0.08, events 0.5 with an RMS of 0.05 to 0.15), and written to packages/client/public/sfx as .ogg and .mp3
through Blender (tools/blender/convert_audio.py). `audio.ts` then sets each cue's gain in the BANK. A level table is printed.
"""
import os, subprocess, sys
import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DL = os.path.join(ROOT, "assets-src", "drone-sfx", "_dl")
WAV = os.path.join(ROOT, "assets-src", "drone-sfx", "wav")
OUT = os.path.join(ROOT, "packages", "client", "public", "sfx")
BLENDER = os.environ.get("BLENDER", r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe")
SR = 44100


def load(rel, start=0.0, end=None):
    x, sr = sf.read(os.path.join(DL, rel))
    if x.ndim > 1:
        x = x.mean(axis=1)
    if sr != SR:
        n = int(len(x) * SR / sr)
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)
    a = int(start * SR)
    b = len(x) if end is None else int(end * SR)
    return np.asarray(x[a:b], dtype=np.float64)


def lowpass(x, hi):
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(spec / (1 + (f / hi) ** 4), len(x))


def highpass(x, lo):
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(spec * (1 / (1 + (lo / np.maximum(f, 1)) ** 4)), len(x))


def fade(x, fin=0.004, fout=0.05, curve=1.5):
    x = x.copy()
    a, b = int(fin * SR), min(len(x), int(fout * SR))
    if a:
        x[:a] *= np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b) ** curve
    return x


def trim_silence(x, thresh=0.02):
    idx = np.where(np.abs(x) > thresh * max(1e-9, np.abs(x).max()))[0]
    return x[idx[0]: idx[-1] + 1] if len(idx) else x


def level(x, rms=None, peak=0.55):
    """RMS target (if given), then a soft limiter so no peak goes above `peak` (a tanh knee, not a hard clip)."""
    x = x - x.mean()
    if rms:
        x = x / max(1e-9, np.sqrt((x ** 2).mean())) * rms
    else:
        x = x / max(1e-9, np.abs(x).max()) * peak
    k = peak * 1.15
    return np.tanh(x / k) * k * 0.97


def cues():
    c = {}
    for i, n in enumerate((0, 1, 2)):
        c["drone_gun_%d" % (i + 1)] = fade(level(lowpass(trim_silence(load("sci-fi_sounds/Audio/laserSmall_00%d.ogg" % n)), 9000), peak=0.5), 0.002, 0.06)
    for i, n in enumerate((0, 2, 4)):
        c["drone_twin_%d" % (i + 1)] = fade(level(lowpass(trim_silence(load("sci-fi_sounds/Audio/laserRetro_00%d.ogg" % n)), 5200), rms=0.07, peak=0.55), 0.002, 0.07)
    for i, n in enumerate((0, 2)):
        c["drone_rocket_%d" % (i + 1)] = fade(level(lowpass(highpass(load("sci-fi_sounds/Audio/thrusterFire_00%d.ogg" % n, 0.0, 1.1), 90), 4800), rms=0.1, peak=0.6), 0.01, 0.55, 1.2)
    for i, rel in enumerate(("Digital_SFX_Set/zap1.mp3", "Digital_SFX_Set/zap2.mp3", "Digital_SFX_Set/zapTwoTone2.mp3")):
        c["drone_zap_%d" % (i + 1)] = fade(level(trim_silence(load(rel), 0.03), rms=0.08, peak=0.5), 0.002, 0.12)
    for i, n in enumerate((0, 3)):
        c["drone_heal_%d" % (i + 1)] = fade(level(lowpass(load("sci-fi_sounds/Audio/forceField_00%d.ogg" % n), 4200), rms=0.06, peak=0.45), 0.02, 0.3)
    c["drone_heal_3"] = fade(level(lowpass(load("health_restore.wav", 0.0, 1.6), 6000), rms=0.07, peak=0.5), 0.01, 0.5)
    c["drone_pulse"] = fade(level(lowpass(load("icespells/coldsnap.wav", 0.0, 1.5), 7000), rms=0.05, peak=0.5), 0.004, 0.6)
    c["drone_freeze"] = fade(level(lowpass(load("icespells/ice.wav", 0.0, 1.1), 8000), rms=0.07, peak=0.55), 0.004, 0.45)
    c["drone_hum"] = fade(level(lowpass(highpass(load("sci-fi_sounds/Audio/spaceEngineSmall_001.ogg", 1.0, 2.7), 120), 2200), rms=0.045, peak=0.3), 0.35, 0.5, 1.0)
    c["drone_unlock"] = fade(level(load("UISoundEffects/Ability Learn.mp3", 0.0, 1.8), peak=0.55), 0.004, 0.5)
    c["drone_level"] = fade(level(trim_silence(load("Digital_SFX_Set/powerUp3.mp3"), 0.03), peak=0.5), 0.003, 0.3)
    c["drone_tier"] = fade(level(load("UISoundEffects/Level Up.mp3", 0.0, 2.3), peak=0.6), 0.004, 0.6)
    c["drone_swap"] = fade(level(trim_silence(load("Digital_SFX_Set/phaseJump3.mp3"), 0.03), peak=0.45), 0.003, 0.1)
    return c


def convert(wav, fmt, bitrate):
    subprocess.run([BLENDER, "-b", "--factory-startup", "--python", os.path.join(ROOT, "tools", "blender", "convert_audio.py"), "--", wav, OUT, str(bitrate), fmt], check=True, stdout=subprocess.DEVNULL)


def stats(x):
    return len(x) / SR, float(np.abs(x).max()), float(np.sqrt((x ** 2).mean()))


if __name__ == "__main__":
    os.makedirs(WAV, exist_ok=True)
    only = set(sys.argv[1:])
    rows = []
    for name, sig in cues().items():
        if only and name not in only:
            continue
        path = os.path.join(WAV, name + ".wav")
        sf.write(path, sig, SR, subtype="PCM_16")
        rows.append((name,) + stats(sig))
        convert(path, "ogg", 96)
        convert(path, "mp3", 96)
    print("%-16s %6s %6s %6s" % ("cue", "sec", "peak", "rms"))
    for r in rows:
        print("%-16s %6.2f %6.3f %6.3f" % r)
