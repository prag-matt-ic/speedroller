# Course editor and ghost tiles

Run `npm run dev` and open `/dev/course-editor`. The editor and its API return 404 in production.

The active race source is `assets/platform/1.4.0/race.course.json`. It has independent floor, ghost, highlight and object layers. Ghost paint masks out playable floor without deleting the source floor or highlights underneath. Ghost cells never get colliders, player trails or safe-respawn support. Hiding a layer in the editor only affects the editing view.

Paint with a 1/3/5-tile brush, erase, or drag a rectangle. Object painting places rings or moves the single start, finish or paint-shop marker. Middle-drag or the Pan tool moves the view. Use the section picker and zoom slider to navigate. With the map focused, arrows move the selected cell, Space paints, Delete erases and Cmd/Ctrl Z (Shift Z) undoes (redoes) a gesture. Each gesture edits only its selected layer. Brushes wrap at the cylinder seam; rectangles use the visible unrolled selection.

Save & Build validates playable connectivity, object footprints and lobby spawn support before regenerating the rows, minimaps and pillars. Invalid edits stay in the editor with clickable error locations. Browser drafts can be restored after reopening. A stale save is rejected if the disk source changed; reload and explicitly restore/review the draft before saving it over the newer revision.

Open Game starts a local playtest at `/?editor=true`. Its times are not submitted or added to personal bests; the results screen may say “Time not saved”. Unsaved edits are not in the game. Reload an already-open playtest after rebuilding.

`npm run build-platform` uses the same compiler as the editor. For the active layered race, edit the JSON or use the editor; historical PNGs are preserved as fixtures and are not the active race source. The development course still uses PNGs. Section sizes, order, topology and available object types are fixed in this editor.

Ghost slabs use the same stone material as ordinary floor. Their centres start dropping 48 units ahead of the player and are completely dropped and invisible by 24 units ahead, centred at 36 units. They fall 10 units away from the local surface and rotate 45–90 degrees using a stable cell seed. Backing away reverses the effect. Solid floor no longer fades or tilts into place; other objects retain their distance fades. Tune the distances/depth in `utils/platform/ghostTiles.ts`.

The initial ghost artwork covers the six original holes and a one-tile border beside the race-track spans. It preserves the solid course and rings, with no new lobby or finish run-out border.

Verification: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Ghost tests evaluate the actual shader graph at distance boundaries and check Rapier collision gaps around the cylinder. The editor tests cover layer precedence, undo/redo, validation, stale writes, rollback and production/API guards.
