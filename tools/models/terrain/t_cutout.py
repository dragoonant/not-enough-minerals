r"""Stage 2 (2.0 venv): picked concept -> background-removed cutout.png.

  %USERPROFILE%\Hunyuan3D-2\.venv\Scripts\python.exe t_cutout.py [slug ...]

picks.json: {slug: seed | "absolute/or/repo-relative/image.png"}.
"""
import os
import sys
import time

from PIL import Image

from hy3dgen.rembg import BackgroundRemover

from _common import REPO, log, picks, slugs_from, work

K = picks()
rembg = BackgroundRemover()
for slug in slugs_from(sys.argv[1:], list(K)):
    pick = K[slug]
    src = work(slug, 'concepts', f's{pick}.png') if isinstance(pick, int) else os.path.join(REPO, pick)
    t0 = time.time()
    rembg(Image.open(src).convert('RGB')).save(work(slug, 'cutout.png'))
    log('cutout', slug, time.time() - t0, pick=pick)
