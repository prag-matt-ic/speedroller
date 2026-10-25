import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import sharp from 'sharp'
import { loadTypeScript } from './loadTypeScript.mjs'

const { parseArchitecture, validateArchitectureClearance } = loadTypeScript('scripts/utils/parseArchitecture.ts', { '../../utils/tiles': loadTypeScript('utils/tiles.ts') })
const { rowToWorldZ, TILE_SURFACE_Y } = loadTypeScript('utils/tiles.ts')
const { PLATFORM_DATA } = loadTypeScript('resources/rowsData.ts')
const expected = [[-30,616,6,8,12],[48,624,10,12,40],[30,650,6,10,24],[-54,660,12,14,40],[-32,690,8,10,24],[52,704,10,12,24],[-28,738,8,12,40],[28,738,8,12,40]]
const blank = () => Buffer.alloc(161 * 160 * 3)
const paint = (data, x, y, colour) => data.set(colour, (y * 161 + x) * 3)

test('pillar bitmap reproduces all eight exact bottom-centred placements and leaves track clear', async () => {
  const { data, info } = await sharp('assets/platform/1.2.0/architecture/recovery.png').removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const actual = parseArchitecture(data, info.width, info.height)
  assert.equal(actual.length,8)
  expected.forEach(([x,s,w,d,h],index) => {
    assert.deepEqual(actual[index].position,[x,-32,rowToWorldZ(s+32)])
    assert.deepEqual(actual[index].dimensions,[w,32+TILE_SURFACE_Y+h,d])
  })
  assert.deepEqual(actual,JSON.parse(readFileSync('resources/recoveryPillars.json','utf8')))
  assert.deepEqual(actual,parseArchitecture(data,info.width,info.height))
  validateArchitectureClearance(actual,PLATFORM_DATA.modes.speedrun.rows)
  assert.throws(()=>validateArchitectureClearance([{...actual[0],position:[0,-32,actual[0].position[2]]}],PLATFORM_DATA.modes.speedrun.rows),/eight units/)
})
test('parser rejects wrong dimensions, unknown colours, irregular and touching footprints', () => {
  assert.throws(()=>parseArchitecture(blank(),160,160),/161×160/)
  const unknown=blank(); paint(unknown,1,1,[128,0,0]); assert.throws(()=>parseArchitecture(unknown,161,160),/Unknown/)
  const irregular=blank(); for(const [x,y] of [[1,1],[2,1],[1,2]]) paint(irregular,x,y,[255,0,0]);
  assert.throws(()=>parseArchitecture(irregular,161,160),/solid rectangle/)
  const touching=blank(); paint(touching,1,1,[255,0,0]); paint(touching,2,2,[0,255,0]);
  assert.throws(()=>parseArchitecture(touching,161,160),/empty pixel/)
  const separated=blank(); paint(separated,1,1,[255,0,0]); paint(separated,3,1,[255,0,0]);
  assert.equal(parseArchitecture(separated,161,160).length,2)
})
