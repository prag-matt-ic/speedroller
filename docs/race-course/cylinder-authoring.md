# Bitmap cylinder course

The main race uses `assets/platform/1.3.0/`. Edit the PNGs there, then run:

```sh
npm run build-platform
```

The build reads your artwork without resizing or repainting it. It regenerates `resources/rowsData.ts`, `resources/coursePillars.json`, and `public/maps/1.3.0/`. Keep those outputs together with the edited source PNGs.

## Coordinates

Each race bitmap is **132 pixels wide**. One pixel is one tile (one world unit). Its horizontal axis wraps once around the cylinder: column 131 neighbours column 0. The radius is 132 / (2π), about 21 units. Paint across both image edges to continue a path across the seam.

The bottom image row comes first. Progress runs upward through each image and then into the next section: lobby, launch, sweeps, slalom, recovery, finale, sprint. Rows advance along the cylinder's length. Keep matching footprints at the boundaries between section images.

The winding path is painted into the images. There is no runtime track twist or automatic steering toward it. Racing moves forward along the cylinder; A/D or left/right steers around its circumference. The ball and camera follow the local surface orientation.

## Palette

Use a pixel editor with antialiasing disabled and save lossless PNGs. Black (`#000000`) is empty space; white (`#FFFFFF`) is ordinary floor. Marker colours also provide floor:

| Colour | Meaning |
| --- | --- |
| `#FF0000` | Ring |
| `#00FFFF` | Highlighted floor |
| `#8000FF` | Start line |
| `#FFFF00` | Finish line |
| `#FF8000` | Colour picker |
| `#808080` | Heading |
| `#00FF00` | Information zone |
| `#0000FF` | Collectible |
| `#FF0080` | Confetti |

Keep one start and one finish. Each line is painted into the three rows around its marker and spans each row's whole solid run, so the marker's own column must be floor in all three rows. The builder validates floor connectivity, marker support and decoration separation, including across the horizontal seam. Disconnected floor islands are rejected. Black holes stay physical gaps.

The matching files under `decoration/` are noncolliding scenery masks. They must match the corresponding track image dimensions. Keep them separate from playable floor.

## Pillars in quiet areas

Pillars are generated deterministically from the final track. They need at least four units of clearance from floor, measured across the seam too. Clearance includes the widest projected part of each pillar, so a tall pillar cannot lean over the road. Small holes are left empty. Pillars also leave space between each other and have no collision bodies.

Their bases sit 28 units outside the track surface; heights range from 28 to 40 units, so the tallest reach twelve units inward past the road. Editing the track and rebuilding automatically relocates the pillars.

## Versions and legacy artwork

`course.json` declares the topology and exact column count per game mode. This version's race is cylindrical; the 33-column development layout remains flat. Original `1.2.0` artwork is retained. Race records use version `1.3.0`, separate from the previous flat race.

`scripts/createCylinderBitmaps.mjs` was the one-time migration from the old artwork. It refuses to overwrite the destination and is not part of normal builds. Do not rerun it to edit the course.
