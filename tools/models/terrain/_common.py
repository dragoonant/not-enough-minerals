"""Shared paths and timing log for the terrain stages (imported by every t_*.py; runs in either Hunyuan venv).

Working files go to %USERPROFILE%/Hunyuan3D-2/outputs/terrain/<slug>/ (outside the repo); the repo keeps the scripts,
pieces.json, picks.json, the contact sheets and the stage timings (tools/out/terrain-timings.jsonl).
"""
import json
import os
import platform
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
HY20 = os.path.expanduser('~/Hunyuan3D-2')
HY21 = os.path.expanduser('~/Hunyuan3D-2.1')
WORK = os.path.join(HY20, 'outputs', 'terrain')
TIMINGS = os.path.join(REPO, 'tools', 'out', 'terrain-timings.jsonl')


def pieces():
    return {k: v for k, v in json.load(open(os.path.join(HERE, 'pieces.json'), encoding='utf-8')).items() if not k.startswith('_')}


def picks():
    p = os.path.join(HERE, 'picks.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}


def slugs_from(argv, default):
    only = [a for a in argv if not a.startswith('-')]
    return [s for s in default if not only or s in only]


def work(slug, *parts):
    d = os.path.join(WORK, slug)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, *parts)


def gpu():
    try:
        import torch
        return torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'cpu'
    except Exception:
        return '?'


def log(stage, slug, seconds, **extra):
    os.makedirs(os.path.dirname(TIMINGS), exist_ok=True)
    row = {'stage': stage, 'slug': slug, 'seconds': round(seconds, 1), 'host': platform.node(), 'gpu': gpu(),
           'at': time.strftime('%Y-%m-%dT%H:%M:%S'), **extra}
    with open(TIMINGS, 'a', encoding='utf-8') as f:
        f.write(json.dumps(row) + '\n')
    print(f'{slug} {stage} {seconds:.0f}s {extra or ""}', flush=True)
    sys.stdout.flush()
