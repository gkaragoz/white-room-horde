"""Convert WAV files to OGG (Vorbis) with Blender's FFmpeg (no external encoder needed).

  blender -b --factory-startup --python tools/blender/convert_audio.py -- <in_dir_or_file> <out_dir> [bitrate_kbps] [ogg|mp3]

Every .wav/.ogg in the input is mixed down to <out_dir>/<name>.<ogg|mp3> (Vorbis or MP3; Safari cannot decode Vorbis, so the
game ships both). Run one file per Blender process: a second mixdown in the same process silently writes nothing.
"""
import bpy, os, sys, time, math
import aud

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
src, out = argv[0], argv[1]
bitrate = int(argv[2]) if len(argv) > 2 else 96
fmt = argv[3] if len(argv) > 3 else 'ogg'
os.makedirs(out, exist_ok=True)
files = [src] if os.path.isfile(src) else [os.path.join(src, f) for f in sorted(os.listdir(src)) if f.lower().endswith((".wav", ".ogg"))]

for path in files:
    scene = bpy.context.scene
    scene.sequence_editor_clear()
    se = scene.sequence_editor_create()
    strip = se.strips.new_sound("a", path, 1, 1) if hasattr(se, "strips") else se.sequences.new_sound("a", path, 1, 1)
    fps = scene.render.fps / scene.render.fps_base
    scene.frame_start = 1
    # the strip length of some formats (Vorbis) is not known yet: ask the audio library for the true length
    snd = aud.Sound(path)
    seconds = snd.length / snd.specs[0]
    scene.frame_end = max(1, int(math.ceil(seconds * fps)))
    dst = os.path.join(out, os.path.splitext(os.path.basename(path))[0] + "." + fmt)
    res = bpy.ops.sound.mixdown(filepath=dst, check_existing=False, container="OGG" if fmt == "ogg" else "MP3", codec="VORBIS" if fmt == "ogg" else "MP3", bitrate=bitrate, format="S16", mixrate=44100)
    # the mixdown finishes on a worker thread: wait until the file exists and stops growing
    last, still = -1, 0
    t0 = time.time()
    while time.time() - t0 < 60:
        size = os.path.getsize(dst) if os.path.exists(dst) else -1
        still = still + 1 if size == last and size > 0 else 0
        last = size
        if still >= 5:
            break
        time.sleep(0.2)
    if last <= 0:
        raise RuntimeError('mixdown produced nothing: %s %s' % (res, dst))
    print("converted", os.path.basename(path), "->", os.path.getsize(dst), "bytes, %.2fs" % seconds)
