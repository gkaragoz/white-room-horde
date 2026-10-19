# Mixamo animations

Source list: [manifest.json](manifest.json) (names and descriptions verified on mixamo.com). Retarget: [../blender/retarget_mixamo.py](../blender/retarget_mixamo.py).

## Download settings (every clip)
- Format **FBX Binary (.fbx)**, Skin **Without Skin**, **30 fps**, Keyframe Reduction **none**.
- The Mixamo "In Place" tickbox does not matter: the retarget script removes horizontal root motion from every clip and keeps vertical motion.
- Pack: **Rifle 8-Way Locomotion Pack** (49 animations) as one ZIP; extract into `assets-src/mixamo/rifle_8way/`.
- Rename every single-clip download to `<id>.fbx` from the manifest (several clips share a name, the description tells them apart) and put it in `assets-src/mixamo/`.

## Licence
Raw FBX files stay out of git (`assets-src/` is ignored). Only retargeted, baked GLBs go to `packages/client/public/models/anims/`.

## Retarget
```
blender -b --factory-startup --python tools/blender/retarget_mixamo.py
SELFTEST=1 blender -b --factory-startup --python tools/blender/retarget_mixamo.py   # no FBX needed
```
Writes `player_anims.glb`, `enemy_anims.glb` and `anims.meta.json` (clip ids, frames, loop flags). Pack file names that match no rule are kept as `loco_<slug>`; check the result list and extend `LOCO_RULES`.
