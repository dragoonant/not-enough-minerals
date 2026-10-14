# Asset credits

## Ground textures (public/assets/ground)
CC0 1k texture sets from Poly Haven (https://polyhaven.com), recompressed to WebP by `art/board-textures/compress.mjs`.
No attribution is required by CC0; credited here as a courtesy.

| Theme | Poly Haven asset |
| --- | --- |
| badlands | cracked_red_ground |
| ash | burned_ground_01 |
| temple | dry_ground_rocks |
| ice | snow_02 |

## Terrain models (public/assets/terrain)
Original pieces made for this project by evilgouki's pipeline: concept images from a local SDXL model, meshes from
Hunyuan3D-2.1 (Tencent Hunyuan 3D 2.1 Community License), decimated and meshopt-compressed by `tools/models/optimize.mjs`.
No third-party art. `src/client/board/terrainFit.ts` stretches each one to the exact rules footprint and height.

## Environment light and tabletop (public/assets/ground)
CC0 from Poly Haven (https://polyhaven.com): HDRI `studio_small_03` (1k, `env_studio_small_03_1k.hdr`, soft room
reflections at low intensity) and texture set `wood_table_001` (1k diffuse + roughness, recompressed to WebP as
`table_albedo.webp` / `table_rough.webp`) for the tabletop under the mat. No attribution required; credited as a courtesy.
