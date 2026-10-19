"""Convert WAV files to OGG (Vorbis) with Blender's FFmpeg (no external encoder needed).

  blender -b --factory-startup --python tools/blender/convert_audio.py -- <in_dir_or_file> <out_dir> [bitrate_kbps]

Every .wav in the input is mixed down to <out_dir>/<name>.ogg (mono kept mono, stereo kept stereo).
"""
import bpy, os, sys, time

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
src, out = argv[0], argv[1]
bitrate = int(argv[2]) if len(argv) > 2 else 96
os.makedirs(out, exist_ok=True)
files = [src] if os.path.isfile(src) else [os.path.join(src, f) for f in sorted(os.listdir(src)) if f.lower().endswith(".wav")]

for path in files:
    scene = bpy.context.scene
    scene.sequence_editor_clear()
    se = scene.sequence_editor_create()
    strip = se.strips.new_sound("a", path, 1, 1) if hasattr(se, "strips") else se.sequences.new_sound("a", path, 1, 1)
    fps = scene.render.fps / scene.render.fps_base
    scene.frame_start = 1
    scene.frame_end = max(1, int(strip.frame_final_duration))
    dst = os.path.join(out, os.path.splitext(os.path.basename(path))[0] + ".ogg")
    res = bpy.ops.sound.mixdown(filepath=dst, check_existing=False, container="OGG", codec="VORBIS", bitrate=bitrate, format="S16", mixrate=44100)
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
    print("converted", os.path.basename(path), "->", os.path.getsize(dst), "bytes, ~%.2fs" % (strip.frame_final_duration / fps))
