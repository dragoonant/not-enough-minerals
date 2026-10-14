r"""Stage 1 (2.0 venv): SDXL concept candidates for terrain pieces (no IP-Adapter: the figure style reference would bleed in).

  %USERPROFILE%\Hunyuan3D-2\.venv\Scripts\python.exe t_concepts.py [slug ...] [--seeds 0 1 2 3] [--steps 30]

Writes <work>/<slug>/concepts/s<seed>.png and sheet.png. Pick one per slug in picks.json ({slug: seed}).
"""
import argparse
import os
import time

import torch
from diffusers import AutoencoderKL, StableDiffusionXLPipeline
from PIL import Image

from _common import log, pieces, slugs_from, work

ROOT = os.path.expanduser('~/.cache/hy3dgen/sdxl')
# CLIP truncates at 77 tokens: framing first, the piece description second (prompt_2 repeats it for the second encoder)
STYLE = ('product photo of a small painted wargame terrain miniature on a flat base, whole model in frame, '
         'isometric view from above, isolated on plain white background, studio lighting, ')
LOOK = 'sci-fi war-torn, hurried wartime construction, weathered gunmetal with glossy highlights, rust, grime'
NEGATIVE = ('interior, inside, corridor, room, close-up, photorealistic building, real city, street, people, soldiers, '
            'figures, text, letters, logo, watermark, landscape, horizon, sky, grey backdrop, multiple objects, '
            'collage, cropped, cut off, blurry, lowres')

ap = argparse.ArgumentParser()
ap.add_argument('slugs', nargs='*')
ap.add_argument('--seeds', type=int, nargs='+', default=[0, 1, 2, 3])
ap.add_argument('--steps', type=int, default=30)
args = ap.parse_args()

P = pieces()
slugs = slugs_from(args.slugs, list(P))

vae = AutoencoderKL.from_pretrained(os.path.join(ROOT, 'vae-fp16-fix'), torch_dtype=torch.float16)
pipe = StableDiffusionXLPipeline.from_pretrained(os.path.join(ROOT, 'base'), vae=vae,
                                                 torch_dtype=torch.float16, variant='fp16').to('cuda')
pipe.set_progress_bar_config(disable=True)

for slug in slugs:
    p = P[slug]
    w, d = p['size'][0], p['size'][1]
    # long thin walls get a wide canvas so the model does not curl them up to fill a square
    width, height = (1344, 768) if w / d >= 2.5 else (1024, 1024)
    out = work(slug, 'concepts')
    os.makedirs(out, exist_ok=True)
    tiles = []
    t0 = time.time()
    for seed in args.seeds:
        image = pipe(prompt=STYLE + p['prompt'], prompt_2=p['prompt'] + ', ' + LOOK, negative_prompt=NEGATIVE,
                     num_inference_steps=args.steps, guidance_scale=7.0, width=width, height=height,
                     generator=torch.Generator('cuda').manual_seed(seed)).images[0]
        image.save(os.path.join(out, f's{seed}.png'))
        tiles.append(image.resize((width * 384 // height, 384)))
    sheet = Image.new('RGB', (sum(t.width for t in tiles), 384), 'white')
    x = 0
    for t in tiles:
        sheet.paste(t, (x, 0))
        x += t.width
    sheet.save(os.path.join(out, 'sheet.png'))
    log('concept', slug, time.time() - t0, images=len(args.seeds), steps=args.steps)
