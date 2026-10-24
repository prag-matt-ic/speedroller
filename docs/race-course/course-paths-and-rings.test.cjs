const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'course-paths-and-rings.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const data = vm.runInNewContext(script.slice(script.indexOf('const sections ='), script.indexOf('const colours=')) + ';({sections,paths,rings,holes,decorations,clearOfTrack,guidePaths,isHole,sample,bounds})');
const approved = JSON.parse(fs.readFileSync(path.join(__dirname, 'approved-layout.json'), 'utf8'));
for (const key of ['sections', 'paths', 'rings', 'holes', 'decorations', 'guidePaths']) {
  assert.deepEqual(approved[key], JSON.parse(JSON.stringify(data[key])), `Approved data differs from preview: ${key}`);
}
assert.equal(data.rings.length, 60);
assert.equal(data.holes.length, 6);
assert.equal(data.sections.reduce((sum, section) => sum + section.end - section.start, 0), 1200);

const cells = new Set();
for (let row = -32; row <= 1214; row++) {
  const columns = new Set();
  for (const route of data.paths) {
    if (row < route.points[0][0] || row > route.points.at(-1)[0]) continue;
    const bounds = data.bounds(route, row);
    assert(bounds.left >= -16.5 && bounds.right <= 16.5, route.id);
    for (let x = Math.ceil(bounds.left); x < bounds.right; x++) {
      if (data.isHole(x,row)) continue;
      columns.add(x);
      cells.add(`${row},${x}`);
    }
  }
  let branches = 0;
  for (let x = -16; x <= 16; x++) if (columns.has(x) && !columns.has(x - 1)) branches++;
  assert(branches >= 1 && branches <= 3, `Invalid path count at ${row}`);
}
for(const hole of data.holes) {
  for(let s=hole.start;s<=hole.end;s++) for(let x=hole.left;x<=hole.right;x++) assert(!cells.has(`${s},${x}`));
}
for(const [id,guide] of Object.entries(data.guidePaths)) {
  for(let s=guide.points[0][0];s<=guide.points.at(-1)[0];s++) {
    const x=data.sample(guide,s).x;
    assert(cells.has(`${s},${Math.round(x)}`),`Guide ${id} crosses void at ${s}`);
  }
}
for (const ring of data.rings) {
  assert(Number.isInteger(ring.s) && Number.isInteger(ring.x));
  assert(cells.has(`${ring.s},${ring.x}`), `Unsupported ring ${ring.id}`);
  const bounds = data.bounds(data.paths.find(route => route.id === ring.pathId), ring.s);
  assert(ring.x - bounds.left >= 0.5 && bounds.right - ring.x >= 0.5);
}
const visited = new Set(['-32,0']);
const queue = [[-32, 0]];
for (let index = 0; index < queue.length; index++) {
  const [row, column] = queue[index];
  for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const key = `${row + dy},${column + dx}`;
    if (!cells.has(key) || visited.has(key)) continue;
    visited.add(key);
    queue.push([row + dy, column + dx]);
  }
}
assert.equal(visited.size, cells.size, 'Disconnected floor');
assert(data.decorations.some(tile=>tile.pattern==='checker'));
assert(data.decorations.some(tile=>tile.pattern==='chevron'));
for(const tile of data.decorations) {
  assert(!cells.has(`${tile.s},${tile.x}`),'Decoration on track');
  assert(data.clearOfTrack(tile.x,tile.s),'Decoration lacks separation');
}
for (const [choice, count] of [['A', 35], ['B', 47], ['C', 37]]) {
  const actual = data.rings.filter(r => r.kind === 'shared' || r.kind === (choice === 'C' ? (r.section === 'finale' ? 'C' : 'A') : choice)).length;
  assert.equal(actual, count);
}
console.log(`PASS: six holes; ${data.decorations.length} separated decorative tiles; safe guide lines; 60 supported rings; 35/47/37 route totals; ${cells.size} connected floor tiles; at most three paths per row.`);
