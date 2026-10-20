"""Convert the announcer voice lines to the game's sound files.

  python tools/audio/make_announcer.py

Source: "Announcer kill sounds" by TripleSnail (recorded by Antti Saari), https://opengameart.org/content/announcer-kill-sounds,
CC-BY 3.0 (credit in packages/client/public/sfx/CREDITS.md). The archive announcer.7z is unpacked into
assets-src/announcer-dl/out; each WAV is trimmed of silence, peak-normalised and converted to vo_<name>.ogg / .mp3 in
packages/client/public/sfx with tools/blender/convert_audio.py (needs Blender 5.x at BLENDER or the default install path).
"""
import os, subprocess
import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SRC = os.path.join(ROOT, "assets-src", "announcer-dl", "out")
WAV = os.path.join(ROOT, "assets-src", "announcer-dl", "wav")
OUT = os.path.join(ROOT, "packages", "client", "public", "sfx")
BLENDER = os.environ.get("BLENDER", r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe")
NAMES = {"FirstBlood": "vo_firstblood", "DoubleKill": "vo_doublekill", "TripleKill": "vo_triplekill", "MegaKill": "vo_megakill", "KillingSpree": "vo_killingspree",
         "Rampage": "vo_rampage", "Dominating": "vo_dominating", "Massacre": "vo_massacre", "Godlike": "vo_godlike", "Mayhem": "vo_mayhem", "Ownage": "vo_ownage", "Carnage": "vo_carnage"}


def convert(wav, fmt, kbps):
    subprocess.run([BLENDER, "-b", "--factory-startup", "--python", os.path.join(ROOT, "tools", "blender", "convert_audio.py"), "--", wav, OUT, str(kbps), fmt], check=True, stdout=subprocess.DEVNULL)


if __name__ == "__main__":
    os.makedirs(WAV, exist_ok=True)
    for src, name in NAMES.items():
        d, sr = sf.read(os.path.join(SRC, src + ".wav"))
        if d.ndim > 1:
            d = d.mean(1)
        live = np.where(np.abs(d) > 0.01 * max(1e-9, np.abs(d).max()))[0]
        a, b = max(0, live[0] - int(0.02 * sr)), min(len(d), live[-1] + int(0.08 * sr))
        d = d[a:b]
        fade = int(0.05 * sr)
        d[-fade:] *= np.linspace(1, 0, fade)
        d = d / max(1e-9, np.abs(d).max()) * 0.92
        path = os.path.join(WAV, name + ".wav")
        sf.write(path, d, sr, subtype="PCM_16")
        print(name, round(len(d) / sr, 2), "s")
        convert(path, "ogg", 80)
        convert(path, "mp3", 80)
