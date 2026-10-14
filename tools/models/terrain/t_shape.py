r"""Stage 3 (2.1 venv): cutout.png -> shape.glb (untextured, reduced). Terrain keeps its ground slab (no base cut).

  %USERPROFILE%\Hunyuan3D-2.1\.venv\Scripts\python.exe t_shape.py [slug ...] [--faces 6000] [--seed 0] [--offload]

--faces is the final budget (KB 3.2: terrain ~6k tris; 12k gave 76-86 ms frames). --offload trades speed for VRAM (10 GB cards).
"""
import argparse
import os
import sys
import time

from _common import HY21, log, picks, slugs_from, work

sys.path.insert(0, os.path.join(HY21, 'hy3dshape'))
os.chdir(HY21)

import torch
from PIL import Image

from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
from hy3dshape.postprocessors import DegenerateFaceRemover, FaceReducer, FloaterRemover

ap = argparse.ArgumentParser()
ap.add_argument('slugs', nargs='*')
ap.add_argument('--faces', type=int, default=6000)
ap.add_argument('--seed', type=int, default=0)
ap.add_argument('--offload', action='store_true')
# octree 384 / chunks 8000 (upstream defaults) run out of memory on a 10 GB RTX 3080; 256 / 2000 fit
ap.add_argument('--octree', type=int, default=256)
ap.add_argument('--chunks', type=int, default=2000)
args = ap.parse_args()

t0 = time.time()
# Load straight to the GPU even with --offload: a CPU load makes large host-side copies, and on Windows (WDDM) GPU
# allocations also draw on the system commit limit, so a CPU load made later 32 MB CUDA allocations fail with 3 GB free.
# Build the modules in fp16 too (the default fp32 init needs ~13 GB of host commit before the cast).
torch.set_default_dtype(torch.float16)
pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2.1')
torch.set_default_dtype(torch.float32)
if args.offload:
    # Upstream enable_model_cpu_offload is broken for this pipeline (no .components). Keep only the sub-model in use on the GPU:
    # conditioner while encoding, DiT while denoising, VAE while decoding. The DiT alone (~6.6 GB fp16) plus activations
    # is what a 10 GB card can hold next to the desktop.
    def swap(on, off):
        for m in off:
            m.to('cpu')
        torch.cuda.empty_cache()
        for m in on:
            m.to('cuda')

    _encode, _export = pipeline.encode_cond, pipeline._export

    def encode_cond(*a, **k):
        swap([pipeline.conditioner], [pipeline.model, pipeline.vae])
        out = _encode(*a, **k)
        swap([pipeline.model], [pipeline.conditioner])
        return out

    def export(*a, **k):
        swap([pipeline.vae], [pipeline.model])
        return _export(*a, **k)

    pipeline.encode_cond, pipeline._export = encode_cond, export
log('shape-load', '-', time.time() - t0)

for slug in slugs_from(args.slugs, list(picks())):
    t0 = time.time()
    try:
        image = Image.open(work(slug, 'cutout.png')).convert('RGBA')
        mesh = pipeline(image=image, octree_resolution=args.octree, num_chunks=args.chunks,
                        generator=torch.manual_seed(args.seed))[0]
        mesh = FloaterRemover()(mesh)
        mesh = DegenerateFaceRemover()(mesh)
        mesh = FaceReducer()(mesh, max_facenum=args.faces)
        mesh.export(work(slug, 'shape.glb'))
        log('shape', slug, time.time() - t0, faces=len(mesh.faces), octree=args.octree, offload=args.offload,
            peak_gb=round(torch.cuda.max_memory_allocated() / 2**30, 1))
    except Exception as e:
        import traceback; traceback.print_exc()
        print(f"{slug} shape FAILED: {repr(e)[:300]}", flush=True)
    torch.cuda.empty_cache()
