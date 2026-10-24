# Approved race bitmap artwork

Generated 24 October 2026 from the approved Course draft C. Geometry, holes and all 60
ring coordinates are unchanged. **Bitmap artwork approved by the user on 24 October 2026.**
Runtime integration and in-game acceptance remain pending.

## Files and editing

`1.2.0/` is a copy of `assets/platform/1.1.1/` with seven new `race-*.png` files.
The old filenames are retained as reference, not as part of the new public course.
Use the ordered chunks in `manifest.json` for implementation. Each PNG is 33 pixels wide;
one pixel is one square tile. Travel goes upwards in each image. Stack source chunks in
manifest order, reading each bottom-up, without duplicating boundary rows.

`decoration/` contains seven aligned black/white masks for the detached side checker and
chevron tiles. These must be rendered separately with no collision or safe-respawn support.
Never feed these masks into the current raised-floor parser.

`artwork-preview.html` is the interactive review fragment. Its floor and decoration cells
come from decoding the saved PNGs; bright marks represent the existing highlight flag,
not a promise of exact in-game shading. `artwork.json` lists the bright cells and motif names.

Recreate and validate the files with `node docs/race-course/generate-bitmaps.cjs`.
This overwrites the seven generated terrain PNGs, decoration masks, and review outputs;
copy or preserve manual edits before running it again. It does not write runtime assets.

## Source palette

| RGB | Meaning |
| --- | --- |
| `#000000` | Void, including all six holes |
| `#FFFFFF` | Normal playable floor |
| `#00FFFF` | Brighter playable tile, existing HIGHLIGHT convention |
| `#FF0000` | Ring on playable floor |
| `#FF8000` | Paint Shop at global row 12 |
| `#8000FF` | Planned START marker at global row 32; parser support still required |
| `#FFFF00` | FINISH at global row 1232 |

Palette colours encode meaning, not displayed tile colour. Arbitrary lighter greys do not
create brighter tiles in the current parser. Markers take precedence over artwork; no
marker is overwritten with cyan, and no brightness mask extension is required.

## Art direction

Broken edge lights frame the course, with a tighter cadence after the technical finale
begins. A stepped diamond and paired runners distinguish the lobby. Small double chevrons
punctuate wide straights; branch arrowheads support early route reading. Hole corner brackets
and approach ticks mark hazards without filling them. Checker patches mark the starting
grid, finish approach and run-out. Broad dark areas keep rings and route boundaries legible.
Detached checker grids and forward-facing chevrons preserve all 682 approved scenery cells.

## Integration checklist

- [x] Generate seven terrain PNGs and seven separate scenery masks.
- [x] Preserve all 17,683 playable cells, 60 rings, six holes and 682 scenery cells.
- [x] Add 2,581 bright floor tiles with semantic marker precedence.
- [x] Decode generated PNGs and verify pixel values, dimensions and floor support.
- [x] Review the artwork preview with the user and approve it (24 October 2026).
- [ ] Copy the approved files into the chosen release version and update the source list.
- [ ] Add start-marker handling and separate non-collidable scenery ingestion.
- [ ] Run the course and race-flow implementation checklists before public release.
- [ ] Check highlight contrast, ring readability and hazard visibility in-game at speed.

The files are deliberately outside `assets/platform`: its generator automatically selects
the newest directory. No generated rows, minimaps, runtime source lists or game code were
changed for this review. Do not move the copy into the active tree until the source list,
START semantics, and decoration handling are ready.

## Staged implementation handoff

Start with [the course and speed plan](../../race-course-and-speed-design.md) and
[the race-flow plan](../../race-first-experience-plan.md). Artwork approval completes
preparation, not the runtime stages or their acceptance checklists.

### Stage 1 Course and race-flow foundation

Use the existing PNGs below, in this exact order. Paths are relative to this directory;
`manifest.json` is the machine-readable source order and coordinate reference.

| Order | Terrain PNG | Separate scenery mask | Height |
| --- | --- | --- | ---: |
| 1 | `1.2.0/race-lobby.png` | `decoration/race-lobby.png` | 32 |
| 2 | `1.2.0/race-launch.png` | `decoration/race-launch.png` | 180 |
| 3 | `1.2.0/race-sweeps.png` | `decoration/race-sweeps.png` | 200 |
| 4 | `1.2.0/race-slalom.png` | `decoration/race-slalom.png` | 220 |
| 5 | `1.2.0/race-recovery.png` | `decoration/race-recovery.png` | 160 |
| 6 | `1.2.0/race-finale.png` | `decoration/race-finale.png` | 260 |
| 7 | `1.2.0/race-sprint.png` | `decoration/race-sprint.png` | 195 |

Keep copied legacy PNGs out of the new public course source list; retain `test.png` for
development. Extend `scripts/buildPlatformRows.ts` for the purple START marker and a
separate scenery input before activating the new version. Preserve cyan HIGHLIGHT parsing.
Render scenery without collision or respawn participation. Generate `resources/rowsData.ts`
and minimaps with `npm run build-platform`; do not edit generated rows by hand.
Implement lobby, colour selection, start/countdown, lifecycle, results and persistence from
the race-flow plan alongside this stage. Keep terrain flat.

The approved art reference is `artwork-preview.html`, with bright-cell motifs in
`artwork.json`. The older `../course-paths-and-rings.html` shows geometry and ring routes
without the new floor artwork. `../approved-layout.json` defines geometry/rings/holes;
it is not a replacement for the authored PNGs. `../generate-bitmaps.cjs` reproduces the
current artwork but need not be rerun just to integrate it.

Run `node docs/race-course/course-paths-and-rings.test.cjs` for reference geometry checks,
then verify generated runtime data independently against manifest counts and the plans.
Recheck visual contrast in-game; user approval of this preview does not validate shading,
collision clearance, sensor reliability or performance.

### Stage 2 Speed and handling

Reuse the Stage 1 course. Add automatic forward racing, steering and complete-stop braking
without reverse; retain manual lobby movement. Tune rings/boost, camera visibility and
handling for 45–60-second clean runs. Record any necessary placement changes and measured
results. Release only after both plans' acceptance checks pass, under a fresh leaderboard
identity if public times already exist for different geometry or movement rules.

### Stage 3 Optional downhill experiment

Keep the approved bitmap footprint. Prototype consistent elevation transforms and downhill
movement separately after the flat race feels good. Controller choice and final slope are
still deferred; artwork approval does not approve a physics rewrite.
