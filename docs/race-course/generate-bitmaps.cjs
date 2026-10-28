// Authoring-only: outputs stay outside assets/platform until the race implementation is ready.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const directory = __dirname;
const output = path.join(directory, 'bitmaps');
const source = path.join(output, '1.2.0');
const approved = JSON.parse(fs.readFileSync(path.join(directory, 'approved-layout.json'), 'utf8'));
const html = fs.readFileSync(path.join(directory, 'course-paths-and-rings.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const { bounds } = vm.runInNewContext(script.slice(script.indexOf('const sections ='), script.indexOf('const colours=')) + ';({bounds})');
const chunks = [
  ['race-lobby', -32, -1], ['race-launch', 0, 179], ['race-sweeps', 180, 379],
  ['race-slalom', 380, 599], ['race-recovery', 600, 759],
  ['race-finale', 760, 1019], ['race-sprint', 1020, 1214],
];
const key = (x, s) => `${s},${x}`;
const floor = new Set();
for (let s = -32; s <= 1214; s++) {
  for (const route of approved.paths) {
    if (s < route.points[0][0] || s > route.points.at(-1)[0]) continue;
    const interval = bounds(route, s);
    for (let x = Math.ceil(interval.left); x < interval.right; x++) {
      if (!approved.holes.some(h => s >= h.start && s <= h.end && x >= h.left && x <= h.right)) floor.add(key(x, s));
    }
  }
}
const highlights = new Map();
function paint(x, s, motif) {
  if (floor.has(key(x, s))) highlights.set(key(x, s), { x, s, motif });
}
// Broken edge lights tighten their rhythm on the more demanding late course.
for (let s = -32; s <= 1214; s++) {
  for (let x = -16; x <= 16; x++) {
    const edge = !floor.has(key(x - 1, s)) || !floor.has(key(x + 1, s));
    const period = s >= 760 ? 6 : 10;
    if (edge && ((s % period) + period) % period < (s >= 760 ? 4 : 5)) paint(x, s, 'Broken edge lights');
  }
}
// A stepped diamond and approach runners give the lobby its own quieter identity.
for (let s = -30; s <= -24; s++) {
  const radius = 3 - Math.abs(s + 27);
  paint(-radius, s, 'Lobby diamond'); paint(radius, s, 'Lobby diamond');
}
for (let s = -15; s <= -5; s++) if (s % 3 !== 0) { paint(-3, s, 'Grid approach'); paint(3, s, 'Grid approach'); }
// Chevron pairs sit inside generous straights; branch openings receive compact arrowheads.
for (const tip of [28, 52, 78, 120, 164, 218, 240, 400, 604, 652, 700, 748, 786, 1012, 1188]) {
  const route = approved.paths.find(p => p.kind === 'shared' && tip >= p.points[0][0] && tip <= p.points.at(-1)[0]);
  if (!route) continue;
  const interval = bounds(route, tip);
  const centre = Math.round((interval.left + interval.right) / 2);
  for (let offset = -2; offset <= 2; offset++) {
    paint(centre + offset, tip - Math.abs(offset), 'Forward chevron');
    paint(centre + offset, tip - Math.abs(offset) - 3, 'Forward chevron');
  }
}
for (const route of approved.paths.filter(p => p.kind !== 'shared')) {
  const tip = route.points[1][0];
  const centre = route.points[1][1];
  for (let offset = -1; offset <= 1; offset++) paint(centre + offset, tip - Math.abs(offset), 'Branch arrowhead');
}
// Bracket each hole on supported floor only; paired warning ticks precede each opening.
for (const h of approved.holes) {
  for (const corner of [h.start - 1, h.end + 1]) {
    for (const x of [h.left - 1, h.right + 1]) {
      for (let offset = 0; offset <= 2; offset++) {
        paint(x, corner + (corner < h.start ? -offset : offset), 'Hole corner bracket');
        paint(x + (x < h.left ? offset : -offset), corner, 'Hole corner bracket');
      }
    }
  }
  for (const s of [h.start - 10, h.start - 7]) for (const x of [h.left - 1, h.right + 1]) paint(x, s, 'Hazard approach ticks');
}
for (const [start, end] of [[-4, -2], [1195, 1198], [1204, 1207]]) {
  for (let s = start; s <= end; s++) for (let x = -4; x <= 4; x++) if ((x + s) % 2 === 0) paint(x, s, 'Start / finish checker');
}
const markers = new Map(approved.rings.map(r => [key(r.x, r.s), [255, 0, 0]]));
markers.set(key(0, -20), [255, 128, 0]);
markers.set(key(0, 0), [128, 0, 255]);
markers.set(key(0, 1200), [255, 255, 0]);
// A semantic marker wins over paint; no new highlight-mask parser is needed for floor art.
for (const location of markers.keys()) highlights.delete(location);
const scenery = new Set(approved.decorations.map(tile => key(tile.x, tile.s)));
const palette = { void: [0, 0, 0], floor: [255, 255, 255], highlight: [0, 255, 255] };
function pixel(x, s, decoration = false) {
  const location = key(x, s);
  if (decoration) return scenery.has(location) ? palette.floor : palette.void;
  if (!floor.has(location)) return palette.void;
  return markers.get(location) || (highlights.has(location) ? palette.highlight : palette.floor);
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  // Preserve copied legacy sources for traceability, but the manifest lists only the new race files.
  if (!fs.existsSync(source)) fs.cpSync(path.resolve(directory, '../../assets/platform/1.1.1'), source, { recursive: true });
  fs.mkdirSync(path.join(output, 'decoration'), { recursive: true });
  const manifest = { status: 'Artwork approved 2026-10-24; not integrated', copiedFrom: 'assets/platform/1.1.1', width: 33, startGlobalRow: 32, finishGlobalRow: 1232, chunks: [], counts: {floor: floor.size, rings: approved.rings.length, highlights: highlights.size, decorations: scenery.size} };
  const decodedTiles = [];
  for (const [name, start, end] of chunks) {
    const height = end - start + 1;
    const filenames = [`1.2.0/${name}.png`, `decoration/${name}.png`];
    for (const [layer, filename] of filenames.entries()) {
      const bytes = Buffer.alloc(33 * height * 3);
      for (let s = start; s <= end; s++) for (let x = -16; x <= 16; x++) {
        const offset = ((end - s) * 33 + x + 16) * 3;
        bytes.set(pixel(x, s, layer === 1), offset);
      }
      const target = path.join(output, filename);
      await sharp(bytes, {raw: {width: 33, height, channels: 3}}).png().toFile(target);
      const {data, info} = await sharp(target).removeAlpha().raw().toBuffer({resolveWithObject:true});
      assert.equal(info.width,33); assert.equal(info.height,height); assert.deepEqual(data,bytes);
      for (let s = start; s <= end; s++) for (let x = -16; x <= 16; x++) {
        const offset = ((end - s) * 33 + x + 16) * 3;
        const rgb = [...data.subarray(offset,offset+3)];
        const raised = rgb.some(v=>v!==0);
        assert.equal(raised, layer === 1 ? scenery.has(key(x,s)) : floor.has(key(x,s)));
        if (raised) decodedTiles.push({x,s,kind:layer===1?'decoration':rgb.join(',')==='0,255,255'?'highlight':'floor'});
      }
    }
    manifest.chunks.push({file:filenames[0],decoration:filenames[1],start,end,height,globalStart:start+32});
  }
  assert.equal(floor.size,17683); assert.equal(scenery.size,682);
  for (const [location] of markers) assert(floor.has(location));
  for (const location of scenery) assert(!floor.has(location));
  fs.writeFileSync(path.join(output,'manifest.json'), JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(path.join(output,'artwork.json'),JSON.stringify([...highlights.values()],null,2)+'\n');
  // Read-back tiles, not idealized path polygons, drive the artwork preview.
  let preview = html.replace('Course draft C','Course tile artwork').replace('Flat terrain · travel upwards · proposed placements','Bitmap preview · square cells · travel upwards');
  preview = preview.replace('Highlight racing line', 'Highlight ring route');
  preview = preview.replace("const colours=", `const bitmapTiles=${JSON.stringify(decodedTiles)};\n    const colours=`);
  const start = preview.indexOf('      for(const tile of decorations) {');
  const end = preview.indexOf('      for(const h of visibleHoles)',start);
  preview = preview.slice(0,start) + `      const visiblePaths=paths.filter(p=>p.points[0][0]<=maximum && p.points.at(-1)[0]>=minimum);
      for(const tile of bitmapTiles) {
        if(tile.s<minimum||tile.s>maximum) continue;
        const highlighted=tile.kind==='highlight',decorative=tile.kind==='decoration';
        add('rect',{x:X(tile.x-0.46),y:Y(tile.s+0.46),width:0.92*sx,height:0.92*sy,fill:highlighted?'var(--foreground)':decorative?'var(--viz-series-1)':'var(--muted-foreground)',opacity:highlighted?0.85:decorative?0.3:0.22,'data-tooltip':highlighted?'Bright floor tile':decorative?'Non-driveable decoration':'Floor tile'});
      }
` + preview.slice(end);
  preview = preview.replace('Racing line</span>', 'Bright floor details</span>').replace('border-top:2px solid var(--viz-series-1);','border-top:2px solid var(--foreground);');
  preview = preview.replace("let selection='all', line='all';", "let selection='recovery', line='all';");
  new vm.Script(preview.match(/<script>([\s\S]*?)<\/script>/)[1]);
  fs.writeFileSync(path.join(output,'artwork-preview.html'),preview);
  console.log(JSON.stringify(manifest.counts));
}
main().catch(error => { console.error(error); process.exitCode=1; });
