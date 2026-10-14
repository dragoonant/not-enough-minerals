r"""Stage 4 (2.0 venv): shape.glb + cutout.png -> textured.glb (Hunyuan3D 2.0 paint).

  %USERPROFILE%\Hunyuan3D-2\.venv\Scripts\python.exe t_paint.py [slug ...] [--texture 1024] [--offload]
"""
import argparse
import os
import time

import torch
import trimesh
from PIL import Image

from hy3dgen.texgen import Hunyuan3DPaintPipeline

from _common import HY20, log, picks, slugs_from, work

ap = argparse.ArgumentParser()
ap.add_argument('slugs', nargs='*')
ap.add_argument('--texture', type=int, default=1024)
ap.add_argument('--offload', action='store_true')
args = ap.parse_args()

os.chdir(HY20)
t0 = time.time()
paint = Hunyuan3DPaintPipeline.from_pretrained('tencent/Hunyuan3D-2', subfolder='hunyuan3d-paint-v2-0')
paint.render.set_default_texture_resolution(args.texture)
if args.offload:
    paint.enable_model_cpu_offload()
log('paint-load', '-', time.time() - t0)

for slug in slugs_from(args.slugs, list(picks())):
    t0 = time.time()
    try:
        mesh = trimesh.load(work(slug, 'shape.glb'), force='mesh')
        mesh = paint(mesh, image=Image.open(work(slug, 'cutout.png')))
        mesh.export(work(slug, 'textured.glb'))
        log('paint', slug, time.time() - t0, peak_gb=round(torch.cuda.max_memory_allocated() / 2**30, 1))
    except Exception as e:
        print(f'{slug} paint FAILED: {repr(e)[:300]}', flush=True)
    torch.cuda.empty_cache()
