# Ivory stone atlas

Generated with the built-in image-generation tool on 24 October 2026. Runtime asset:
`ivory-stone-atlas.webp` (lossless RGB WebP, 1536×1536, sRGB).

Nine 512×512 cells hold individual stone samples. Each has a 480×480 interior and a
16-pixel duplicated-edge gutter. UVs select the interior texel centres (16.5…495.5).
The generated source was divided into nine equal cells, cropped four pixels inward to
remove boundary lines, resized to 480×480, and edge-extended before atlas packing.
Runtime mipmaps and trilinear filtering reduce minification shimmer. Very coarse mip
levels eventually mix neighbouring cells; their similar ivory colours limit the difference.
Check this again if replacing the atlas with strongly contrasting samples.

The tile shader selects a stable cell from the existing tile seed with TSL spritesheetUV.
Broad noise and optional detail noise multiply the sampled colour by a bounded brightness.
Highlight tiles receive less darkening. Existing geometry, tilt, trail and contact shadow
are retained. There are no baked shadows, normal maps or roughness maps in this pass.

## Generation prompt

Create a production game texture: square 1536 by 1536 pixel color-only albedo atlas of
warm ivory marble/limestone stone. EXACTLY a 3 by 3 arrangement of nine equal square
samples, meeting edge to edge with absolutely no borders, gaps, grout, labels, shadows
or perspective. Every square is a different crop of fine softly mottled ivory stone with
subtle pores and faint delicate cream veins. Restrained contrast, warm off-white/ivory
not yellow, no dramatic dark veins, no strong granite speckles. Perfectly even flat diffuse
illumination over the entire image, no baked highlights or ambient occlusion, no visible
slab edges, no objects, no copper. Surface texture fills every pixel. Nine subtly different
samples, consistently matched color and brightness. This is an albedo texture sheet,
not a render of tiles.

## Validation

`node --test tests/stone-atlas.test.mjs` verifies dimensions, nine distinct samples and
all duplicated gutter pixels. The shader adds one albedo texture lookup per fragment
and replaces the procedural palette calculation. Draw calls, geometry and collider counts
are unchanged; this is a workload description, not a measured GPU timing improvement.
