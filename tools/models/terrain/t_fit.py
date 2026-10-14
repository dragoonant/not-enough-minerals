r"""Stage 5 (2.1 venv, trimesh): textured.glb -> game GLB fitted to the rules footprint, plus a sheen material.

  %USERPROFILE%\Hunyuan3D-2.1\.venv\Scripts\python.exe t_fit.py <out dir> [slug ...]

Long side on +x, origin at the bottom-face centre, y up, scaled to pieces.json size [w, d, h] exactly (the client re-fits by
the measured box anyway). Never write straight into public/: fit into a scratch dir, run
`node tools/models/optimize.mjs --dir <scratch>`, look at the contact sheet, then copy.
"""
import math
import os
import sys
import time

import numpy as np
import trimesh
from PIL import ImageEnhance

from _common import log, picks, pieces, slugs_from, work

# Hunyuan paint bakes base colour only; a little metalness and lower roughness gives the wartime steel its sheen under the
# board's environment map (owner 2026-10-13: "not shiny").
GRADE = (1.3, 1.25, 0.82)  # contrast, saturation, brightness
SHEEN = {'outpost': (0.3, 0.45), 'temple': (0.15, 0.6), 'crystal': (0.3, 0.35), 'creep': (0.1, 0.3)}

dest = os.path.abspath(sys.argv[1])
os.makedirs(dest, exist_ok=True)
P = pieces()
for slug in slugs_from(sys.argv[2:], list(picks())):
    src = work(slug, 'textured.glb')
    if not os.path.exists(src):
        print(f'{slug}: no textured.glb, skipped', flush=True)
        continue
    t0 = time.time()
    p = P[slug]
    w, d, h = p['size']
    mesh = trimesh.load(src, force='mesh')
    ext = mesh.bounds[1] - mesh.bounds[0]
    turned = bool('rect' in p['footprint'] and w > d * 1.1 and ext[2] > ext[0] * 1.1)
    if turned:
        mesh.apply_transform(trimesh.transformations.rotation_matrix(math.pi / 2, [0, 1, 0]))
    lo, hi = mesh.bounds
    native = hi - lo
    mesh.apply_translation([-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2])
    scale = np.array([w / native[0], h / native[1], d / native[2]])
    mesh.apply_transform(np.diag([*scale, 1.0]))
    # stretch = worst axis distortion vs a uniform fit; > 1.4 means the concept's proportions were wrong for the footprint
    stretch = float(scale.max() / scale.min())
    mat = getattr(mesh.visual, 'material', None)
    metal, rough = SHEEN.get(p['theme'], (0.2, 0.5))
    if mat is not None and hasattr(mat, 'metallicFactor'):
        mat.metallicFactor, mat.roughnessFactor = metal, rough
        # Hunyuan paint de-lights the concept, which leaves the texture flat and pale; grade it back towards the concept
        tex = getattr(mat, 'baseColorTexture', None)
        if tex is not None:
            tex = ImageEnhance.Contrast(tex.convert('RGB')).enhance(GRADE[0])
            tex = ImageEnhance.Color(tex).enhance(GRADE[1])
            mat.baseColorTexture = ImageEnhance.Brightness(tex).enhance(GRADE[2])
    mesh.export(os.path.join(dest, f'{slug}.glb'))
    log('fit', slug, time.time() - t0, faces=len(mesh.faces), stretch=round(stretch, 2), turned=turned)
